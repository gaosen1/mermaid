import { db } from '@/db'
import { initMermaid, renderMermaid } from './mermaid'
import { parseFrontmatter, parseExtendedDSL } from './dsl'
import { parseAllEdgeStylesFromSource } from './edgeDsl'
import { applyEdgeStyle } from '@/components/mermaid/svgStyleApplier'
import { cropSvgToContentBBox } from './svgCrop'

/**
 * 列表缩略图：惰性渲染 mermaid/svg 图表的小尺寸 SVG 快照，
 * 存 thumbs 表（以 source hash 失效），内存缓存 + 订阅通知。
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** djb2 字符串哈希（失效判断用，非安全用途） */
export function djb2(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** 渲染单张缩略图 SVG 字符串；失败返回 null */
export async function renderThumbnailSvg(source: string): Promise<string | null> {
  try {
    const { config, content } = parseFrontmatter(source)
    await initMermaid(config?.layout || 'dagre', 'neutral')
    const { source: processed } = parseExtendedDSL(content)
    const { svg } = await renderMermaid(processed, `thumb-${Date.now()}`)

    const container = document.createElement('div')
    container.innerHTML = svg
    const svgEl = container.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) return null

    for (const { index, style } of parseAllEdgeStylesFromSource(content)) {
      applyEdgeStyle(svgEl, index, style)
    }
    cropSvgToContentBBox(svgEl)
    svgEl.removeAttribute('width')
    svgEl.removeAttribute('height')
    svgEl.setAttribute('xmlns', SVG_NS)
    return svgEl.outerHTML
  } catch {
    return null
  }
}

// ─── 内存缓存 + 订阅 ────────────────────────────────────────────────────────

const cache = new Map<string, string>()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export function subscribeThumbs(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getThumb(diagramId: string): string | undefined {
  return cache.get(diagramId)
}

/** 确保某图表的缩略图最新（hash 过期则重渲染并落库） */
export async function ensureThumbnail(diagramId: string, source: string): Promise<void> {
  const hash = djb2(source)
  const row = await db.thumbs.get(diagramId)
  if (row && row.hash === hash) {
    if (!cache.has(diagramId)) {
      cache.set(diagramId, row.svg)
      emit()
    }
    return
  }
  const svg = await renderThumbnailSvg(source)
  if (!svg) return
  cache.set(diagramId, svg)
  await db.thumbs.put({ diagramId, hash, svg })
  emit()
}

// ─── 生成队列（并发 2） ─────────────────────────────────────────────────────

const pending: Array<{ diagramId: string; source: string }> = []
let active = 0
const MAX_CONCURRENCY = 2

function pump(): void {
  while (active < MAX_CONCURRENCY && pending.length > 0) {
    const task = pending.shift()!
    active++
    ensureThumbnail(task.diagramId, task.source)
      .catch(() => undefined)
      .finally(() => {
        active--
        pump()
      })
  }
}

/** 组件可见时调用：缓存缺失/过期则入队生成 */
export function requestThumbnail(diagramId: string, source: string): void {
  const hash = djb2(source)
  void db.thumbs
    .get(diagramId)
    .then((row) => {
      if (row && row.hash === hash) {
        if (!cache.has(diagramId)) {
          cache.set(diagramId, row.svg)
          emit()
        }
        return
      }
      if (pending.some((p) => p.diagramId === diagramId)) return
      pending.push({ diagramId, source })
      pump()
    })
    .catch(() => undefined)
}
