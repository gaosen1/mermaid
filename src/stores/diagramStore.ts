import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import type { Diagram, DiagramConfig, DiagramType, Snapshot } from '@/types'

interface DiagramState {
  diagrams: Diagram[]
  currentDiagram: Diagram | null
  snapshots: Snapshot[]
  loading: boolean

  loadDiagramsByProject: (projectId: string) => Promise<void>
  createDiagram: (
    projectId: string,
    name: string,
    type?: DiagramType,
    source?: string,
    config?: DiagramConfig
  ) => Promise<Diagram>
  updateDiagram: (id: string, updates: Partial<Omit<Diagram, 'id' | 'projectId' | 'createdAt'>>) => Promise<void>
  deleteDiagram: (id: string) => Promise<void>
  setCurrentDiagram: (diagram: Diagram | null) => void
  reorderDiagrams: (diagramIds: string[]) => Promise<void>
  reorderDiagramsInContainer: (folderId: string | null, diagramIds: string[]) => Promise<void>
  moveDiagramToFolder: (diagramId: string, folderId: string | null) => Promise<void>

  loadSnapshots: (diagramId: string) => Promise<void>
  createSnapshot: (diagramId: string, source: string, description?: string, isAuto?: boolean) => Promise<Snapshot>
  restoreSnapshot: (snapshotId: string) => Promise<void>
  deleteSnapshot: (id: string) => Promise<void>
}

const DEFAULT_SOURCE = `graph TD
    A[开始] --> B{判断}
    B -->|是| C[执行操作]
    B -->|否| D[结束]
    C --> D`

const DEFAULT_HTML_SOURCE = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HTML 图表</title>
  <style>
    :root {
      --bg: #f7f5ef;
      --card: #ffffff;
      --border: #d7d0bf;
      --text: #1f1e1a;
      --accent: #1f6feb;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: "SF Mono", Consolas, monospace;
    }

    .card {
      max-width: 720px;
      margin: 0 auto;
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--card);
    }

    h1 {
      margin: 0 0 12px;
      font-size: 24px;
    }

    p {
      margin: 0;
      line-height: 1.6;
    }

    strong {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <section class="card">
    <h1>HTML 图表</h1>
    <p>这里可以直接编写完整的 <strong>HTML + CSS</strong> 内容进行渲染。</p>
  </section>
</body>
</html>`

const DEFAULT_SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 360">
  <rect width="720" height="360" rx="18" fill="#ffffff" />
  <rect x="32" y="32" width="656" height="296" rx="14" fill="#f7f5ef" stroke="#d7d0bf" />
  <text x="360" y="156" text-anchor="middle" font-family="SF Mono, Consolas, monospace" font-size="28" font-weight="700" fill="#1f1e1a">
    SVG 图表
  </text>
  <text x="360" y="204" text-anchor="middle" font-family="SF Mono, Consolas, monospace" font-size="15" fill="#5f5e5a">
    在这里粘贴或编辑完整 SVG 源码
  </text>
</svg>`

const DEFAULT_PNG_SOURCE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='

function getDefaultSource(type: DiagramType): string {
  switch (type) {
    case 'html':
      return DEFAULT_HTML_SOURCE
    case 'svg':
      return DEFAULT_SVG_SOURCE
    case 'png':
      return DEFAULT_PNG_SOURCE
    case 'jpg':
    case 'webp':
      return ''
    default:
      return DEFAULT_SOURCE
  }
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  diagrams: [],
  currentDiagram: null,
  snapshots: [],
  loading: false,

  loadDiagramsByProject: async (projectId) => {
    set({ loading: true })
    const diagrams = await db.diagrams
      .where('projectId')
      .equals(projectId)
      .toArray()

    // 按 order 排序，如果没有 order 则按 updatedAt 排序
    diagrams.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order
      }
      if (a.order !== undefined) return -1
      if (b.order !== undefined) return 1
      return b.updatedAt - a.updatedAt
    })

    set({ diagrams, loading: false })
  },

  createDiagram: async (projectId, name, type = 'mermaid', source, config) => {
    const now = Date.now()
    const existingDiagrams = await db.diagrams
      .where('projectId')
      .equals(projectId)
      .toArray()
    const maxOrder = existingDiagrams.reduce((max, d) =>
      d.order !== undefined ? Math.max(max, d.order) : max, -1
    )

    const diagram: Diagram = {
      id: uuid(),
      projectId,
      name,
      type,
      source: source || getDefaultSource(type),
      config: type === 'mermaid' ? config : undefined,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }
    await db.diagrams.add(diagram)
    await db.projects.update(projectId, { updatedAt: now })
    set((state) => ({ diagrams: [...state.diagrams, diagram] }))
    return diagram
  },

  updateDiagram: async (id, updates) => {
    const updatedAt = Date.now()
    await db.diagrams.update(id, { ...updates, updatedAt })
    const diagram = await db.diagrams.get(id)
    if (diagram) {
      await db.projects.update(diagram.projectId, { updatedAt })
    }
    set((state) => ({
      diagrams: state.diagrams.map((d) =>
        d.id === id ? { ...d, ...updates, updatedAt } : d
      ),
      currentDiagram:
        state.currentDiagram?.id === id
          ? { ...state.currentDiagram, ...updates, updatedAt }
          : state.currentDiagram,
    }))
  },

  deleteDiagram: async (id) => {
    const diagram = await db.diagrams.get(id)
    await db.transaction('rw', [db.diagrams, db.snapshots, db.projects], async () => {
      await db.snapshots.where('diagramId').equals(id).delete()
      await db.diagrams.delete(id)
      if (diagram) {
        await db.projects.update(diagram.projectId, { updatedAt: Date.now() })
      }
    })
    set((state) => ({
      diagrams: state.diagrams.filter((d) => d.id !== id),
      currentDiagram: state.currentDiagram?.id === id ? null : state.currentDiagram,
    }))
  },

  setCurrentDiagram: (diagram) => set({ currentDiagram: diagram }),

  reorderDiagrams: async (diagramIds) => {
    const updates = diagramIds.map((id, index) => ({
      key: id,
      changes: { order: index, updatedAt: Date.now() }
    }))

    await db.diagrams.bulkUpdate(updates)

    set((state) => {
      const diagramMap = new Map(state.diagrams.map(d => [d.id, d]))
      const reorderedDiagrams = diagramIds
        .map(id => diagramMap.get(id))
        .filter((d): d is Diagram => d !== undefined)
        .map((d, index) => ({ ...d, order: index, updatedAt: Date.now() }))

      return { diagrams: reorderedDiagrams }
    })
  },

  reorderDiagramsInContainer: async (folderId, diagramIds) => {
    const updates = diagramIds.map((id, index) => ({
      key: id,
      changes: { order: index, updatedAt: Date.now() },
    }))
    await db.diagrams.bulkUpdate(updates)
    set((state) => ({
      diagrams: state.diagrams.map((d) => {
        const idx = diagramIds.indexOf(d.id)
        if (idx === -1) return d
        return { ...d, order: idx, updatedAt: Date.now() }
      }),
    }))
    // suppress unused param lint
    void folderId
  },

  moveDiagramToFolder: async (diagramId, folderId) => {
    const now = Date.now()
    // 用内存状态计算目标容器内最大 order（避免 Dexie 不支持 equals(null) 查询）
    const state = useDiagramStore.getState()
    const targetDiagrams = state.diagrams.filter((d) => (d.folderId ?? null) === folderId)
    const maxOrder = targetDiagrams.reduce((m, d) => Math.max(m, d.order ?? 0), -1)
    await db.diagrams.update(diagramId, { folderId, order: maxOrder + 1, updatedAt: now })
    set((s) => ({
      diagrams: s.diagrams.map((d) =>
        d.id === diagramId ? { ...d, folderId, order: maxOrder + 1, updatedAt: now } : d
      ),
    }))
  },

  loadSnapshots: async (diagramId) => {
    const snapshots = await db.snapshots
      .where('diagramId')
      .equals(diagramId)
      .sortBy('createdAt')
    set({ snapshots: snapshots.reverse() })
  },

  createSnapshot: async (diagramId, source, description, isAuto = false) => {
    const snapshot: Snapshot = {
      id: uuid(),
      diagramId,
      source,
      description,
      createdAt: Date.now(),
      isAuto,
    }
    await db.snapshots.add(snapshot)
    set((state) => ({ snapshots: [snapshot, ...state.snapshots] }))
    return snapshot
  },

  restoreSnapshot: async (snapshotId) => {
    const snapshot = await db.snapshots.get(snapshotId)
    if (!snapshot) return
    const { updateDiagram } = get()
    await updateDiagram(snapshot.diagramId, { source: snapshot.source })
  },

  deleteSnapshot: async (id) => {
    await db.snapshots.delete(id)
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
    }))
  },
}))
