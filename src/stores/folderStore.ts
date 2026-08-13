import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { toast } from 'sonner'
import { db } from '@/db'
import type { DiagramFolder } from '@/types'

interface FolderState {
  folders: DiagramFolder[]
  collapsedFolderIds: Set<string>
  loadFoldersByProject: (projectId: string) => Promise<void>
  loadCollapsedFolders: (projectId: string) => Promise<void>
  toggleFolderCollapsed: (projectId: string, folderId: string) => Promise<void>
  createFolder: (projectId: string, name: string, parentId?: string | null) => Promise<DiagramFolder>
  updateFolder: (id: string, updates: Partial<Pick<DiagramFolder, 'name' | 'order'>>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  reorderFolders: (folderIds: string[]) => Promise<void>
  moveFolderToParent: (folderId: string, newParentId: string | null) => Promise<void>
}

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],
  collapsedFolderIds: new Set(),

  loadFoldersByProject: async (projectId) => {
    const folders = await db.folders.where('projectId').equals(projectId).sortBy('order')
    set({ folders })
  },

  loadCollapsedFolders: async (projectId) => {
    const rows = await db.folderCollapse.where('projectId').equals(projectId).toArray()
    set({ collapsedFolderIds: new Set(rows.filter((r) => r.collapsed).map((r) => r.folderId)) })
  },

  toggleFolderCollapsed: async (projectId, folderId) => {
    const current = useFolderStore.getState().collapsedFolderIds
    const collapsed = !current.has(folderId)
    const next = new Set(current)
    if (collapsed) {
      next.add(folderId)
    } else {
      next.delete(folderId)
    }
    set({ collapsedFolderIds: next })
    await db.folderCollapse.put({ folderId, projectId, collapsed, updatedAt: Date.now() })
  },

  createFolder: async (projectId, name, parentId = null) => {
    const existing = await db.folders.where('projectId').equals(projectId).toArray()
    const folder: DiagramFolder = {
      id: uuid(),
      projectId,
      parentId,
      name,
      order: existing.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.folders.add(folder)
    set((state) => ({ folders: [...state.folders, folder] }))
    return folder
  },

  updateFolder: async (id, updates) => {
    const updatedAt = Date.now()
    const patched = { ...updates, updatedAt }
    // 乐观更新：先刷新视图，后台持久化，失败时显式提示
    set((state) => ({
      folders: state.folders.map((f) => (f.id === id ? { ...f, ...patched } : f)),
    }))
    db.folders.update(id, patched).catch((err) => {
      toast.error('保存失败：' + (err instanceof Error ? err.message : String(err)))
    })
  },

  deleteFolder: async (id) => {
    // 递归删除子文件夹（不删除其中图表，将图表移至根目录）
    const allFolders = await db.folders.toArray()
    const toDelete = collectDescendants(id, allFolders)
    toDelete.push(id)

    // 将这些文件夹内的图表移至根目录
    await db.diagrams
      .where('folderId')
      .anyOf(toDelete)
      .modify({ folderId: null })

    await db.folders.bulkDelete(toDelete)
    await db.folderCollapse.bulkDelete(toDelete)
    set((state) => ({
      folders: state.folders.filter((f) => !toDelete.includes(f.id)),
      collapsedFolderIds: new Set(
        [...state.collapsedFolderIds].filter((fid) => !toDelete.includes(fid))
      ),
    }))
  },

  moveFolderToParent: async (folderId, newParentId) => {
    const state = useFolderStore.getState()
    // 防止循环：不能移入自己的后代
    const descendants = collectDescendants(folderId, state.folders)
    if (newParentId && (newParentId === folderId || descendants.includes(newParentId))) return

    const targetSiblings = state.folders.filter((f) => (f.parentId ?? null) === newParentId)
    const newOrder = targetSiblings.length
    const patched = { parentId: newParentId, order: newOrder, updatedAt: Date.now() }
    // 乐观更新：拖拽后立即反映视图，持久化失败再提示
    set((s) => ({
      folders: s.folders.map((f) => (f.id === folderId ? { ...f, ...patched } : f)),
    }))
    db.folders.update(folderId, patched).catch((err) => {
      toast.error('移动失败：' + (err instanceof Error ? err.message : String(err)))
    })
  },

  reorderFolders: async (folderIds) => {
    const updates = folderIds.map((id, index) => ({
      key: id,
      changes: { order: index, updatedAt: Date.now() },
    }))
    await db.folders.bulkUpdate(updates)
    set((state) => {
      const map = new Map(state.folders.map((f) => [f.id, f]))
      return {
        folders: folderIds
          .map((id) => map.get(id))
          .filter((f): f is DiagramFolder => f !== undefined)
          .map((f, i) => ({ ...f, order: i })),
      }
    })
  },
}))

function collectDescendants(parentId: string, all: DiagramFolder[]): string[] {
  const result: string[] = []
  for (const f of all) {
    if (f.parentId === parentId) {
      result.push(f.id)
      result.push(...collectDescendants(f.id, all))
    }
  }
  return result
}
