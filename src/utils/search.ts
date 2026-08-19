import { db } from '@/db'
import type { Diagram, Project } from '@/types'

/**
 * 内容级全文搜索：名称 / 标签 / 源码内容三字段打分。
 * 千级规模下直接全表扫描即可，无需搜索引擎。
 */

export interface DiagramSearchHit {
  diagram: Diagram
  project: Project
  /** 最高分命中字段 */
  field: 'name' | 'tag' | 'content'
  /** 内容/标签命中片段（名称命中时为空） */
  snippet: string
  score: number
}

export async function fullSearchDiagrams(query: string, limit = 20): Promise<DiagramSearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const [diagrams, projects] = await Promise.all([db.diagrams.toArray(), db.projects.toArray()])
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  const hits: DiagramSearchHit[] = []
  for (const diagram of diagrams) {
    const project = projectMap.get(diagram.projectId)
    if (!project) continue

    let score = 0
    let field: DiagramSearchHit['field'] = 'content'
    let snippet = ''

    if (diagram.name.toLowerCase().includes(q)) {
      score += 3
      field = 'name'
    }

    const tagHit = (diagram.tags ?? []).find((t) => t.toLowerCase().includes(q))
    if (tagHit) {
      score += 2
      if (field !== 'name') field = 'tag'
      snippet = tagHit
    }

    const source = diagram.source ?? ''
    const contentIdx = source.toLowerCase().indexOf(q)
    if (contentIdx >= 0) {
      score += 1
      if (field === 'content') snippet = extractSnippet(source, contentIdx, q.length)
    }

    if (score > 0) hits.push({ diagram, project, field, snippet, score })
  }

  hits.sort((a, b) => b.score - a.score || a.diagram.name.localeCompare(b.diagram.name, 'zh'))
  return hits.slice(0, limit)
}

function extractSnippet(source: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 40)
  const end = Math.min(source.length, idx + len + 40)
  const body = source.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${body}${end < source.length ? '…' : ''}`
}
