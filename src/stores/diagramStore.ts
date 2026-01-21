import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import type { Diagram, DiagramConfig, Snapshot } from '@/types'

interface DiagramState {
  diagrams: Diagram[]
  currentDiagram: Diagram | null
  snapshots: Snapshot[]
  loading: boolean

  loadDiagramsByProject: (projectId: string) => Promise<void>
  createDiagram: (projectId: string, name: string, source?: string, config?: DiagramConfig) => Promise<Diagram>
  updateDiagram: (id: string, updates: Partial<Omit<Diagram, 'id' | 'projectId' | 'createdAt'>>) => Promise<void>
  deleteDiagram: (id: string) => Promise<void>
  setCurrentDiagram: (diagram: Diagram | null) => void

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
      .sortBy('updatedAt')
    set({ diagrams: diagrams.reverse(), loading: false })
  },

  createDiagram: async (projectId, name, source = DEFAULT_SOURCE, config) => {
    const now = Date.now()
    const diagram: Diagram = {
      id: uuid(),
      projectId,
      name,
      source,
      config,
      createdAt: now,
      updatedAt: now,
    }
    await db.diagrams.add(diagram)
    await db.projects.update(projectId, { updatedAt: now })
    set((state) => ({ diagrams: [diagram, ...state.diagrams] }))
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
