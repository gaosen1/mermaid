import { db } from '@/db'
import { v4 as uuid } from 'uuid'
import { initMermaid, renderMermaid, exportToPng } from './mermaid'
import { parseFrontmatter, parseExtendedDSL, generateAnimationCSS } from './dsl'
import { parseAllEdgeStylesFromSource } from './edgeDsl'
import { applyEdgeStyle } from '@/components/mermaid/svgStyleApplier'
import { toStandardMermaid, toPortableMarkdown } from './portable'
import { getDiagramFileExtension } from './diagram'
import { cropSvgToContentBBox } from './svgCrop'
import { hasPendingInbox } from './agentInbox'
import { createInboxPushClient, type InboxPushClient } from './agentInboxPush'
import { createCoalescedRunner } from './coalesce'
import type { Diagram, DiagramFolder, Project } from '@/types'

/** REST API 写回（inbox）摄取完成后派发，供 UI 刷新列表 */
export const AGENT_SYNC_INGESTED_EVENT = 'agent-sync-ingested'

/**
 * 本地 Agent 同步：把笔记库快照（含 mermaid 的标准化源码 / SVG / PNG 产物）
 * 持续写入用户授权的本地目录，供 CLI（cli/mermaid-notes.mjs）与本地
 * Coding Agent 读取，用于周报等场景附图。
 *
 * 目录结构：
 *   manifest.json            同步元信息
 *   index.json               全部图表的元数据 + 产物相对路径
 *   diagrams/<id>/source.*   原始源码（文本类）
 *   diagrams/<id>/standard.mmd  不含自定义 DSL 的标准 mermaid
 *   diagrams/<id>/render.svg    含自定义 DSL 样式的矢量图（内嵌动画 CSS）
 *   diagrams/<id>/render.png    含自定义 DSL 样式的位图（透明底）
 *   diagrams/<id>/portable.md   markdown 文档的外带版（内嵌图已标准化）
 */

const KV_KEY = 'agent-sync-dir'
const SVG_NS = 'http://www.w3.org/2000/svg'
/** 外带 PNG 的深色底，避免透明底在浅色文档中发白、深色节点文字不可读 */
export const EXPORT_PNG_BACKGROUND = '#0d1117'

/** REST API 服务默认端口（scripts/agent-api.mjs） */
export const AGENT_API_DEFAULT_PORT = 4789

// File System Access API 的类型补全（lib.dom 未覆盖 picker/permission）
interface FsDirHandle extends FileSystemDirectoryHandle {
  queryPermission?: (opts: { mode: string }) => Promise<PermissionState>
  requestPermission?: (opts: { mode: string }) => Promise<PermissionState>
}
interface WindowWithPicker {
  showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FsDirHandle>
}

export interface AgentSyncStatus {
  supported: boolean
  connected: boolean
  dirName: string | null
  needsPermission: boolean
  syncing: boolean
  lastSyncAt: number | null
  lastError: string | null
}

const status: AgentSyncStatus = {
  supported: typeof window !== 'undefined' && Boolean((window as WindowWithPicker).showDirectoryPicker),
  connected: false,
  dirName: null,
  needsPermission: false,
  syncing: false,
  lastSyncAt: null,
  lastError: null,
}

const listeners = new Set<() => void>()

export function getAgentSyncStatus(): AgentSyncStatus {
  return { ...status }
}

export function subscribeAgentSync(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(): void {
  listeners.forEach((fn) => fn())
}

function setStatus(patch: Partial<AgentSyncStatus>): void {
  Object.assign(status, patch)
  emit()
}

// ─── 句柄管理 ────────────────────────────────────────────────────────────────

async function loadHandle(): Promise<FsDirHandle | null> {
  const row = await db.kv.get(KV_KEY)
  return (row?.value as FsDirHandle) ?? null
}

export async function pickAgentSyncDir(): Promise<void> {
  const picker = (window as WindowWithPicker).showDirectoryPicker
  if (!picker) {
    setStatus({ lastError: '当前浏览器不支持 File System Access API（需 Chromium 内核）' })
    return
  }
  try {
    const handle = await picker.call(window, { mode: 'readwrite' })
    await db.kv.put({ key: KV_KEY, value: handle })
    setStatus({ connected: true, dirName: handle.name, needsPermission: false, lastError: null })
    await syncNow()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    setStatus({ lastError: err instanceof Error ? err.message : String(err) })
  }
}

export async function disconnectAgentSync(): Promise<void> {
  stopInboxPush()
  await db.kv.delete(KV_KEY)
  setStatus({ connected: false, dirName: null, needsPermission: false })
}

// ─── REST API 写回（inbox）摄取 ───────────────────────────────

interface InboxPayload {
  name?: string
  type?: string
  source?: string
  projectName?: string
}

const INBOX_TYPES = ['mermaid', 'markdown', 'txt']

/**
 * 扫描同步目录下的 inbox/：REST API POST /api/diagrams 写入的待导入笔记。
 * 成功导入后删除 inbox 文件；失败保留并在控制台告警。
 */
async function ingestInbox(handle: FileSystemDirectoryHandle): Promise<string[]> {
  const warnings: string[] = []
  let inboxDir: FileSystemDirectoryHandle
  try {
    inboxDir = await handle.getDirectoryHandle('inbox')
  } catch {
    return warnings
  }
  const entries: Array<[string, FileSystemHandle]> = []
  for await (const [name, h] of (
    inboxDir as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> }
  ).entries()) {
    entries.push([name, h])
  }

  let ingested = 0
  for (const [name, h] of entries) {
    if (h.kind !== 'file' || !name.endsWith('.json')) continue
    try {
      const file = await (h as FileSystemFileHandle).getFile()
      const payload = JSON.parse(await file.text()) as InboxPayload
      if (
        !payload.name ||
        typeof payload.source !== 'string' ||
        !INBOX_TYPES.includes(payload.type ?? '')
      ) {
        throw new Error('payload 字段不合法')
      }
      const projectName = payload.projectName?.trim() || 'Agent 导入'
      let project = await db.projects.where('name').equals(projectName).first()
      if (!project) {
        const now = Date.now()
        project = {
          id: uuid(),
          name: projectName,
          description: '',
          tags: [],
          createdAt: now,
          updatedAt: now,
          order: 0,
          syncStatus: 'local-only',
        } as Project
        await db.projects.add(project)
      }
      const now = Date.now()
      await db.diagrams.add({
        id: uuid(),
        projectId: project.id,
        folderId: null,
        name: payload.name,
        type: payload.type as Diagram['type'],
        source: payload.source,
        order: now,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local-only',
      } as Diagram)
      await (
        inboxDir as unknown as { removeEntry: (n: string) => Promise<void> }
      ).removeEntry(name)
      ingested++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      warnings.push(`${name}: ${message}`)
      console.warn(`[agent-sync] inbox 导入失败 ${name}:`, message)
    }
  }
  if (ingested > 0) {
    window.dispatchEvent(new CustomEvent(AGENT_SYNC_INGESTED_EVENT))
  }
  return warnings
}

/** 应用启动时调用：恢复句柄；权限仍在则立即同步 */
export async function initAgentSync(): Promise<void> {
  if (!status.supported) return
  const handle = await loadHandle()
  if (!handle) return
  setStatus({ connected: true, dirName: handle.name })
  const state = handle.queryPermission
    ? await handle.queryPermission({ mode: 'readwrite' })
    : 'granted'
  if (state === 'granted') {
    setStatus({ needsPermission: false })
    await syncNow()
  } else {
    setStatus({ needsPermission: true })
  }
}

/** 设置页「允许访问」按钮：请求权限（需用户手势）后同步 */
export async function grantAgentSyncPermission(): Promise<void> {
  const handle = await loadHandle()
  if (!handle) return
  const state = handle.requestPermission
    ? await handle.requestPermission({ mode: 'readwrite' })
    : 'granted'
  if (state === 'granted') {
    setStatus({ needsPermission: false, lastError: null })
    await syncNow()
  } else {
    setStatus({ lastError: '未获得目录访问权限' })
  }
}

// ─── 调度 ────────────────────────────────────────────────────────────────────

let syncTimer: number | null = null

/** 数据变更后调用：防抖 2s 合并多次变更 */
export function scheduleAgentSync(): void {
  if (!status.connected) return
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    void syncNow()
  }, 2000)
}

// ─── inbox 推送 ──────────────────────────────────────────────────────────────
// 摄取只发生在 syncNow() 里，而 syncNow 只在启动 / 授权 / 本地数据变更时触发。
// 外部（REST API、mermaid MCP App 的「→ Mermaid Local」）往 inbox/ 写文件并不会
// 改动 IndexedDB，所以页面订阅 agent-api 的 SSE：有新笔记时它推 `inbox` 事件，
// 页面再走一次同步。导入是低频操作，这里没有任何定时轮询。

let pushClient: InboxPushClient | null = null

async function importPendingInbox(): Promise<void> {
  if (!status.connected || status.needsPermission) return
  const handle = await loadHandle()
  if (!handle) return
  try {
    if (await hasPendingInbox(handle)) await syncNow()
  } catch (err) {
    console.warn('[agent-sync] 导入 inbox 失败:', err)
  }
}

/** 幂等：已授权且已连接同步目录时建立推送订阅 */
async function ensureInboxPush(): Promise<void> {
  if (pushClient || !status.connected || status.needsPermission) return
  pushClient = createInboxPushClient({
    getUrl: async () => {
      const auth = await readAgentAuthToken()
      return auth
        ? `http://127.0.0.1:${AGENT_API_DEFAULT_PORT}/api/events?token=${encodeURIComponent(auth.token)}`
        : null
    },
    onInbox: () => void importPendingInbox(),
  })
}

function stopInboxPush(): void {
  pushClient?.close()
  pushClient = null
}

// ─── 同步主体 ────────────────────────────────────────────────────────────────

function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return String(hash >>> 0)
}

interface IndexEntryFiles {
  source?: string
  standard?: string
  svg?: string
  png?: string
  portable?: string
}

interface IndexEntry {
  id: string
  projectId: string
  projectName: string
  folderPath: string | null
  name: string
  type: string
  createdAt: number
  updatedAt: number
  hash: string
  files: IndexEntryFiles
}

async function writeRel(dir: FsDirHandle, relPath: string, data: string | Blob): Promise<void> {
  const parts = relPath.split('/')
  let cur: FileSystemDirectoryHandle = dir
  for (const part of parts.slice(0, -1)) {
    cur = await cur.getDirectoryHandle(part, { create: true })
  }
  const fileHandle = await cur.getFileHandle(parts[parts.length - 1], { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

async function readIndex(dir: FsDirHandle): Promise<Map<string, IndexEntry>> {
  try {
    const fh = await dir.getFileHandle('index.json')
    const file = await fh.getFile()
    const parsed = JSON.parse(await file.text()) as IndexEntry[]
    return new Map(parsed.map((e) => [e.id, e]))
  } catch {
    return new Map()
  }
}

function buildFolderPaths(folders: DiagramFolder[]): Map<string, string> {
  const paths = new Map<string, string>()
  const resolve = (id: string): string => {
    const cached = paths.get(id)
    if (cached !== undefined) return cached
    const folder = folders.find((f) => f.id === id)
    if (!folder) return ''
    const parent = folder.parentId ? resolve(folder.parentId) : ''
    const path = parent ? `${parent}/${folder.name}` : folder.name
    paths.set(id, path)
    return path
  }
  folders.forEach((f) => resolve(f.id))
  return paths
}

/**
 * 渲染 mermaid 的 SVG（内嵌动画 CSS）与 PNG。
 * 采用暗色 theme + 深色底 + 高倍率，保证深色 DSL 节点与浅色文字在外带图片中清晰可读。
 */
export async function renderMermaidAssets(source: string): Promise<{ svg: string; png: Blob }> {
  const { config, content } = parseFrontmatter(source)
  await initMermaid(config?.layout || 'dagre', 'dark')
  const { source: processed, animations } = parseExtendedDSL(content)
  const { svg } = await renderMermaid(processed, `agent-sync-${Date.now()}`)

  const container = document.createElement('div')
  container.innerHTML = svg
  const svgEl = container.querySelector('svg') as SVGSVGElement | null
  if (!svgEl) throw new Error('渲染失败：无 SVG 输出')

  for (const { index, style } of parseAllEdgeStylesFromSource(content)) {
    applyEdgeStyle(svgEl, index, style)
  }
  const animCss = generateAnimationCSS(animations)
  if (animCss) {
    const styleEl = document.createElementNS(SVG_NS, 'style')
    styleEl.textContent = animCss
    svgEl.appendChild(styleEl)
  }
  svgEl.setAttribute('xmlns', SVG_NS)

  // 按内容 bbox 裁剪 viewBox，去除布局产生的上下大片空白
  cropSvgToContentBBox(svgEl)
  svgEl.removeAttribute('width')
  svgEl.removeAttribute('height')

  const finalSvg = new XMLSerializer().serializeToString(svgEl)
  const png = await exportToPng(finalSvg, 3, undefined, { background: EXPORT_PNG_BACKGROUND })
  return { svg: finalSvg, png }
}

// ─── API Token（展示用；生命周期由 scripts/agent-api.mjs 管理） ─────────────

export interface AgentAuthToken {
  token: string
  issuedAt: number
  expiresAt: number
}

/** 读取同步目录下的 auth.json（REST API 的鉴权凭据，1 个月过期） */
export async function readAgentAuthToken(): Promise<AgentAuthToken | null> {
  const handle = await loadHandle()
  if (!handle) return null
  try {
    const fh = await handle.getFileHandle('auth.json')
    const file = await fh.getFile()
    const parsed = JSON.parse(await file.text()) as AgentAuthToken
    if (!parsed || typeof parsed.token !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

// 同步进行中又被触发（连续编辑、连续导入）时不能丢：合并成「跑完再补一轮」
const runSync = createCoalescedRunner(syncOnce)

export function syncNow(): Promise<void> {
  return runSync()
}

async function syncOnce(): Promise<void> {
  if (!status.connected) return
  const handle = await loadHandle()
  if (!handle) return

  setStatus({ syncing: true, lastError: null })
  try {
    void ensureInboxPush()
    const inboxWarnings = await ingestInbox(handle)
    const [projects, diagrams, folders] = await Promise.all([
      db.projects.toArray(),
      db.diagrams.toArray(),
      db.folders.toArray(),
    ])
    const projectNameMap = new Map(projects.map((p) => [p.id, p.name]))
    const folderPaths = buildFolderPaths(folders)
    const prevIndex = await readIndex(handle)
    const entries: IndexEntry[] = []

    for (const diagram of diagrams) {
      const source = diagram.source ?? ''
      const hash = hashString(source)
      const prev = prevIndex.get(diagram.id)
      const base = `diagrams/${diagram.id}`
      const files: IndexEntryFiles = {}

      const isImage = ['png', 'jpg', 'webp'].includes(diagram.type)
      const needsRender = diagram.type === 'mermaid' && source.trim().length > 0
      const changed = !prev || prev.hash !== hash

      if (!isImage && source) {
        files.source = `${base}/source.${getDiagramFileExtension(diagram.type)}`
      }
      if (needsRender) {
        files.standard = `${base}/standard.mmd`
        files.svg = `${base}/render.svg`
        files.png = `${base}/render.png`
      }
      if (diagram.type === 'markdown') {
        files.portable = `${base}/portable.md`
      }

      // 未变更且产物齐全时跳过重渲染/重写
      const skip = !changed && prev && needsRender === Boolean(prev.files.svg)
      if (!skip) {
        if (files.source) await writeRel(handle, files.source, source)
        if (diagram.type === 'markdown' && files.portable) {
          await writeRel(handle, files.portable, toPortableMarkdown(source))
        }
        if (needsRender) {
          try {
            const { svg, png } = await renderMermaidAssets(source)
            await writeRel(handle, files.standard!, toStandardMermaid(source))
            await writeRel(handle, files.svg!, svg)
            await writeRel(handle, files.png!, png)
          } catch (err) {
            // 单图渲染失败不阻断整体同步：记录但保留元数据
            console.warn(`[agent-sync] render failed for ${diagram.name}:`, err)
            delete files.standard
            delete files.svg
            delete files.png
          }
        }
      }

      entries.push({
        id: diagram.id,
        projectId: diagram.projectId,
        projectName: projectNameMap.get(diagram.projectId) ?? '',
        folderPath: diagram.folderId ? folderPaths.get(diagram.folderId) ?? null : null,
        name: diagram.name,
        type: diagram.type,
        createdAt: diagram.createdAt,
        updatedAt: diagram.updatedAt,
        hash,
        files: skip && prev ? { ...prev.files } : files,
      })
    }

    // 清理已删除图表的目录
    const liveIds = new Set(diagrams.map((d) => d.id))
    try {
      const diagramsDir = (await handle.getDirectoryHandle('diagrams')) as unknown as {
        entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
        removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>
      }
      for await (const [name, entry] of diagramsDir.entries()) {
        if (entry.kind === 'directory' && !liveIds.has(name)) {
          await diagramsDir.removeEntry(name, { recursive: true })
        }
      }
    } catch {
      // 目录不存在等情况忽略
    }

    const now = Date.now()
    await writeRel(handle, 'index.json', JSON.stringify(entries, null, 2))
    await writeRel(
      handle,
      'manifest.json',
      JSON.stringify(
        {
          app: 'mermaid-local',
          version: 1,
          syncedAt: now,
          count: entries.length,
          ...(inboxWarnings.length > 0 ? { warnings: inboxWarnings } : {}),
        },
        null,
        2
      )
    )
    setStatus({ syncing: false, lastSyncAt: now })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[agent-sync] sync failed:', err)
    setStatus({ syncing: false, lastError: message })
  }
}
