/**
 * 同步协调引擎
 * 负责协调本地和远端数据的双向同步
 */

import { db } from '@/db'
import type { Project, Diagram, DiagramFolder } from '@/types'
import type { SyncLogEntry, SyncSettings } from '@/types/sync'
import { getFile, putFile, putFileBase64, listDirectory } from '../github/files'
import { isGitHubInitialized } from '../github/client'
import { getDiagramFileExtension, getDiagramTypeFromFilename } from '@/utils/diagram'
import { getPngDataUrlBase64 } from '@/utils/png'
import {
  calculateProjectChecksum,
  calculateDiagramChecksum,
  calculateFolderChecksum,
  compareProjects,
  compareFolders,
} from './dataSync'
import { createConflictInfo, resolveConflict } from './conflictResolver'

// GitHub 仓库路径常量
const PATHS = {
  PROJECTS_JSON: 'data/projects.json',
  PROJECT_META: (id: string) => `data/projects/${id}/meta.json`,
  PROJECT_FOLDERS: (id: string) => `data/projects/${id}/folders.json`,
  SNAPSHOT: (diagramId: string, id: string) => `data/snapshots/${diagramId}/${id}.json`,
}

// 同步状态
let isSyncing = false
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

export interface SyncProgress {
  total: number
  completed: number
  current?: string
  phase: 'idle' | 'detecting' | 'pushing' | 'pulling' | 'resolving'
}

export interface SyncResult {
  success: boolean
  pushed: number
  pulled: number
  conflicts: number
  errors: string[]
}

type ProgressCallback = (progress: SyncProgress) => void

/**
 * 检查是否正在同步
 */
export function getIsSyncing(): boolean {
  return isSyncing
}

/**
 * 执行完整同步
 */
export async function syncAll(
  settings: SyncSettings,
  onProgress?: ProgressCallback
): Promise<SyncResult> {
  if (isSyncing) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: ['Sync already in progress'] }
  }

  if (!isGitHubInitialized()) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: ['GitHub not initialized'] }
  }

  isSyncing = true
  const result: SyncResult = { success: true, pushed: 0, pulled: 0, conflicts: 0, errors: [] }

  try {
    onProgress?.({ total: 0, completed: 0, phase: 'detecting' })

    // 1. 获取本地数据
    const localProjects = await db.projects.toArray()
    const localDiagrams = await db.diagrams.toArray()

    // 2. 获取远端数据
    const remoteProjects = await fetchRemoteProjects()

    // 3. 检测差异并同步项目
    onProgress?.({ total: localProjects.length, completed: 0, phase: 'pushing' })

    for (let i = 0; i < localProjects.length; i++) {
      const project = localProjects[i]
      onProgress?.({
        total: localProjects.length,
        completed: i,
        current: project.name,
        phase: 'pushing'
      })

      try {
        await syncProject(project, remoteProjects, settings)
        await syncProjectFolders(project.id, settings)
        result.pushed++
      } catch (error) {
        result.errors.push(`Failed to sync project ${project.name}: ${error}`)
      }
    }

    // 4. 同步图表
    for (const diagram of localDiagrams) {
      try {
        await syncDiagram(diagram)
        result.pushed++
      } catch (error) {
        result.errors.push(`Failed to sync diagram ${diagram.name}: ${error}`)
      }
    }

    // 5. 拉取远端新增的数据
    onProgress?.({ total: 0, completed: 0, phase: 'pulling' })
    const pullResult = await pullRemoteChanges(localProjects, localDiagrams, remoteProjects)
    result.pulled = pullResult.pulled
    result.conflicts += pullResult.conflicts

    // 6. 更新同步时间
    await updateLastSyncTime()

    onProgress?.({ total: 0, completed: 0, phase: 'idle' })
  } catch (error) {
    result.errors.push(`Sync failed: ${error}`)
  } finally {
    isSyncing = false
  }

  if (result.errors.length > 0) {
    result.success = false
  }

  // 记录同步日志
  await logSyncResult(result)

  return result
}

/**
 * 获取远端项目列表
 */
async function fetchRemoteProjects(): Promise<Map<string, Project>> {
  const map = new Map<string, Project>()

  try {
    const file = await getFile(PATHS.PROJECTS_JSON)
    if (file?.content) {
      const data = JSON.parse(file.content)
      if (data.projects && Array.isArray(data.projects)) {
        for (const project of data.projects) {
          map.set(project.id, project)
        }
      }
    }
  } catch {
    // 文件不存在或解析失败，返回空 map
  }

  return map
}

/**
 * 同步单个项目
 */
async function syncProject(
  project: Project,
  remoteProjects: Map<string, Project>,
  settings: SyncSettings
): Promise<void> {
  const remote = remoteProjects.get(project.id) || null
  const diff = await compareProjects(project, remote)

  switch (diff.type) {
    case 'create':
    case 'update':
      await pushProject(project)
      break
    case 'conflict':
      await handleProjectConflict(project, remote!, settings)
      break
    case 'unchanged':
      // 无需操作
      break
  }
}

/**
 * 推送项目到远端
 */
async function pushProject(project: Project): Promise<void> {
  const checksum = await calculateProjectChecksum(project)
  const content = JSON.stringify(project, null, 2)

  await putFile(
    PATHS.PROJECT_META(project.id),
    content,
    `Sync project: ${project.name}`
  )

  // 更新本地同步状态
  await db.projects.update(project.id, {
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    syncError: undefined,
  })

  // 更新 projects.json
  await updateProjectsJson()
}

/**
 * 处理项目冲突
 */
async function handleProjectConflict(
  local: Project,
  remote: Project,
  settings: SyncSettings
): Promise<void> {
  const diff = await compareProjects(local, remote)
  const conflictInfo = createConflictInfo(diff)

  if (!conflictInfo) return

  // 根据策略解决冲突
  if (settings.conflictStrategy === 'ask') {
    // 标记为冲突状态，等待用户处理
    await db.projects.update(local.id, {
      syncStatus: 'conflict',
      syncError: 'Conflict detected, manual resolution required',
    })
    return
  }

  const resolution = await resolveConflict(conflictInfo, settings.conflictStrategy)

  if (resolution.keepVersion === 'local') {
    await pushProject(local)
  } else {
    await db.projects.update(local.id, {
      ...remote,
      syncStatus: 'synced',
      lastSyncTime: Date.now(),
    })
  }
}

/**
 * 获取远端某项目下的文件夹列表
 */
async function fetchRemoteFolders(projectId: string): Promise<Map<string, DiagramFolder>> {
  const map = new Map<string, DiagramFolder>()

  try {
    const file = await getFile(PATHS.PROJECT_FOLDERS(projectId))
    if (file?.content) {
      const data = JSON.parse(file.content)
      if (data.folders && Array.isArray(data.folders)) {
        for (const folder of data.folders) {
          map.set(folder.id, folder)
        }
      }
    }
  } catch {
    // 文件不存在或解析失败，返回空 map
  }

  return map
}

/**
 * 同步某项目下的文件夹（含排序 order）
 */
async function syncProjectFolders(projectId: string, settings: SyncSettings): Promise<void> {
  const localFolders = await db.folders.where('projectId').equals(projectId).toArray()
  if (localFolders.length === 0) return

  const remoteFolders = await fetchRemoteFolders(projectId)
  let needsPush = false

  for (const folder of localFolders) {
    const diff = await compareFolders(folder, remoteFolders.get(folder.id) || null)

    if (diff.type === 'conflict') {
      if (settings.conflictStrategy === 'ask') {
        await db.folders.update(folder.id, {
          syncStatus: 'conflict',
          syncError: 'Conflict detected, manual resolution required',
        })
        continue
      }

      const conflictInfo = createConflictInfo(diff)
      if (!conflictInfo) continue
      const resolution = await resolveConflict(conflictInfo, settings.conflictStrategy)

      if (resolution.keepVersion === 'remote') {
        const remote = remoteFolders.get(folder.id)!
        await db.folders.update(folder.id, {
          ...remote,
          syncStatus: 'synced',
          lastSyncTime: Date.now(),
        })
        continue
      }
      needsPush = true
    } else if (diff.type === 'create' || diff.type === 'update') {
      needsPush = true
    }
  }

  if (needsPush) {
    await pushProjectFolders(projectId)
  }
}

/**
 * 推送某项目下的全部文件夹到远端（含排序 order）
 */
async function pushProjectFolders(projectId: string): Promise<void> {
  const folders = await db.folders.where('projectId').equals(projectId).toArray()
  const content = JSON.stringify(
    {
      version: '1.0.0',
      lastSync: new Date().toISOString(),
      folders,
    },
    null,
    2
  )

  await putFile(
    PATHS.PROJECT_FOLDERS(projectId),
    content,
    `Sync folders for project: ${projectId}`
  )

  const now = Date.now()
  for (const folder of folders) {
    const checksum = await calculateFolderChecksum(folder)
    await db.folders.update(folder.id, {
      syncStatus: 'synced',
      lastSyncTime: now,
      localChecksum: checksum,
      remoteChecksum: checksum,
      syncError: undefined,
    })
  }
}

/**
 * 同步单个图表
 */
async function syncDiagram(diagram: Diagram): Promise<void> {
  const checksum = await calculateDiagramChecksum(diagram)
  const remotePath = getDiagramRemotePath(diagram)

  if (diagram.type === 'png') {
    await putFileBase64(
      remotePath,
      getPngDataUrlBase64(diagram.source),
      `Sync diagram: ${diagram.name}`
    )
  } else {
    await putFile(
      remotePath,
      formatDiagramContent(diagram),
      `Sync diagram: ${diagram.name}`
    )
  }

  await db.diagrams.update(diagram.id, {
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    syncError: undefined,
  })
}

/**
 * 格式化图表内容
 */
function formatDiagramContent(diagram: Diagram): string {
  if (diagram.type === 'html' || diagram.type === 'svg' || diagram.type === 'png') {
    return diagram.source
  }

  const meta = {
    id: diagram.id,
    name: diagram.name,
    projectId: diagram.projectId,
    folderId: diagram.folderId ?? null,
    order: diagram.order ?? 0,
    createdAt: new Date(diagram.createdAt).toISOString(),
    updatedAt: new Date(diagram.updatedAt).toISOString(),
  }

  return `---
meta:
  id: ${meta.id}
  name: ${meta.name}
  projectId: ${meta.projectId}
  folderId: ${meta.folderId}
  order: ${meta.order}
  createdAt: ${meta.createdAt}
  updatedAt: ${meta.updatedAt}
config: ${JSON.stringify(diagram.config || {})}
---
${diagram.source}`
}

function getDiagramRemotePath(diagram: Diagram): string {
  const extension = getDiagramFileExtension(diagram.type)
  return `data/projects/${diagram.projectId}/diagrams/${diagram.id}.${extension}`
}

/**
 * 拉取远端变更
 */
async function pullRemoteChanges(
  localProjects: Project[],
  localDiagrams: Diagram[],
  remoteProjects: Map<string, Project>
): Promise<{ pulled: number; conflicts: number }> {
  let pulled = 0
  const conflicts = 0

  const localProjectIds = new Set(localProjects.map((p) => p.id))
  const localDiagramIds = new Set(localDiagrams.map((d) => d.id))
  const localFolders = await db.folders.toArray()
  const localFolderIds = new Set(localFolders.map((f) => f.id))

  for (const [id, remote] of remoteProjects) {
    if (!localProjectIds.has(id)) {
      await db.projects.add({
        ...remote,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
      })
      pulled++
    }

    // 不论项目是否已存在，都拉取缺失的远端图表与文件夹
    const diagramsPulled = await pullRemoteDiagrams(id, localDiagramIds)
    pulled += diagramsPulled

    const foldersPulled = await pullRemoteFolders(id, localFolderIds)
    pulled += foldersPulled
  }

  return { pulled, conflicts }
}

/**
 * 拉取单个项目下远端有但本地缺失的文件夹
 */
async function pullRemoteFolders(projectId: string, localFolderIds: Set<string>): Promise<number> {
  let pulled = 0

  try {
    const file = await getFile(PATHS.PROJECT_FOLDERS(projectId))
    if (!file?.content) return 0

    const data = JSON.parse(file.content)
    if (!data.folders || !Array.isArray(data.folders)) return 0

    for (const folder of data.folders as DiagramFolder[]) {
      if (!folder.id || localFolderIds.has(folder.id)) continue

      await db.folders.add({
        ...folder,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
      })
      localFolderIds.add(folder.id)
      pulled++
    }
  } catch {
    // 文件不存在或解析失败，忽略
  }

  return pulled
}

/**
 * 拉取单个项目下远端有但本地缺失的图表
 */
async function pullRemoteDiagrams(projectId: string, localDiagramIds: Set<string>): Promise<number> {
  let count = 0
  const diagramsPath = `data/projects/${projectId}/diagrams`

  try {
    const files = await listDirectory(diagramsPath)

    for (const fileInfo of files) {
      // 从文件名提取 diagram id（去掉扩展名）
      const fileName = fileInfo.path.split('/').pop() || ''
      const diagramId = fileName.replace(/\.[^.]+$/, '')

      if (localDiagramIds.has(diagramId)) {
        continue
      }

      try {
        const file = await getFile(fileInfo.path)
        if (!file?.content) continue

        const diagramType = getDiagramTypeFromFilename(fileInfo.path)
        const diagram = parseDiagramFile(file.content, projectId, diagramType || 'mermaid')
        if (diagram) {
          await db.diagrams.add({
            ...diagram,
            syncStatus: 'synced',
            lastSyncTime: Date.now(),
          })
          localDiagramIds.add(diagram.id)
          count++
        }
      } catch {
        // 跳过无法解析的文件
      }
    }
  } catch {
    // 目录不存在或无法访问
  }

  return count
}

/**
 * 解析图表文件内容
 */
function parseDiagramFile(
  content: string,
  projectId: string,
  type: Diagram['type']
): Omit<Diagram, 'syncStatus' | 'lastSyncTime'> | null {
  if (type === 'html' || type === 'svg' || type === 'png') {
    return null
  }

  // 解析 YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (frontmatterMatch) {
    const meta = parseFrontmatter(frontmatterMatch[1])
    const source = frontmatterMatch[2]

    return {
      id: meta.id || crypto.randomUUID(),
      projectId: meta.projectId || projectId,
      name: meta.name || 'Untitled',
      type,
      source,
      config: meta.config ? JSON.parse(meta.config) : undefined,
      createdAt: meta.createdAt ? new Date(meta.createdAt).getTime() : Date.now(),
      updatedAt: meta.updatedAt ? new Date(meta.updatedAt).getTime() : Date.now(),
    }
  }

  // 无 frontmatter，作为纯 mermaid 源码
  return {
    id: crypto.randomUUID(),
    projectId,
    name: 'Untitled',
    type,
    source: content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * 解析 frontmatter 中的 meta 字段
 */
function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = raw.split('\n')

  let inMeta = false
  for (const line of lines) {
    if (line.trim() === 'meta:') {
      inMeta = true
      continue
    }
    if (line.startsWith('config:')) {
      inMeta = false
      result.config = line.replace('config:', '').trim()
      continue
    }
    if (inMeta && line.startsWith('  ')) {
      const match = line.match(/^\s+(\w+):\s*(.*)$/)
      if (match) {
        result[match[1]] = match[2]
      }
    }
  }

  return result
}

/**
 * 更新 projects.json 文件
 */
async function updateProjectsJson(): Promise<void> {
  const projects = await db.projects.toArray()
  const data = {
    version: '1.0.0',
    lastSync: new Date().toISOString(),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      tags: p.tags,
      order: p.order,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  }

  await putFile(
    PATHS.PROJECTS_JSON,
    JSON.stringify(data, null, 2),
    'Update projects list'
  )
}

/**
 * 更新最后同步时间
 */
async function updateLastSyncTime(): Promise<void> {
  localStorage.setItem('lastSyncTime', Date.now().toString())
}

/**
 * 记录同步结果日志
 */
async function logSyncResult(result: SyncResult): Promise<void> {
  const logEntry: SyncLogEntry = {
    timestamp: Date.now(),
    operation: 'push',
    entityType: 'project',
    entityId: 'sync-all',
    status: result.success ? 'success' : 'failed',
    message: `Pushed: ${result.pushed}, Pulled: ${result.pulled}, Conflicts: ${result.conflicts}`,
    details: {
      pushed: result.pushed,
      pulled: result.pulled,
      conflicts: result.conflicts,
      errors: result.errors,
    },
  }

  await db.syncLog.add(logEntry)
}

/**
 * 启动自动同步
 */
export function startAutoSync(settings: SyncSettings): void {
  if (autoSyncTimer) {
    stopAutoSync()
  }

  if (!settings.autoSync) return

  autoSyncTimer = setInterval(() => {
    syncAll(settings)
  }, settings.syncInterval)
}

/**
 * 停止自动同步
 */
export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}
