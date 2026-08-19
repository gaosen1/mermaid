/**
 * 最近打开的图表记录（Cmd+K 命令面板用），存 localStorage，cap 10。
 */

const RECENT_KEY = 'recent-diagrams'

export interface RecentDiagramEntry {
  projectId: string
  diagramId: string
  ts: number
}

export function getRecentDiagrams(): RecentDiagramEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function pushRecentDiagram(projectId: string, diagramId: string): void {
  const list = getRecentDiagrams().filter((e) => e.diagramId !== diagramId)
  list.unshift({ projectId, diagramId, ts: Date.now() })
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    // 忽略存储失败
  }
}
