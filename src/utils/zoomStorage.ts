export interface ZoomState {
  scale: number
  x: number
  y: number
}

const STORAGE_KEY = 'diagram-zoom-states'

function loadAll(): Record<string, ZoomState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getZoomState(diagramId: string): ZoomState | null {
  return loadAll()[diagramId] ?? null
}

export function saveZoomState(diagramId: string, state: ZoomState) {
  try {
    const all = loadAll()
    all[diagramId] = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 忽略 localStorage 错误
  }
}
