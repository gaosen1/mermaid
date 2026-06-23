import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import type { DiagramFolder } from '@/types'

interface FolderState {
  folders: DiagramFolder[]
  loadFoldersByProject: (projectId: string) => Promise<void>
  createFolder: (projectId: string, name: string, parentId?: string | null) => Promise<DiagramFolder>
  updateFolder: (id: string, updates: Partial<Pick<DiagramFolder, 'name' | 'order'>>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
  reorderFolders: (folderIds: string[]) => Promise<void>
}

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],

  loadFoldersByProject: async (projectId) => {
    const folders = await db.folders.where('projectId').equals(projectId).sortBy('order')
    set({ folders })
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
    await db.folders.update(id, { ...updates, updatedAt: Date.now() })
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === id ? { ...f, ...updates, updatedAt: Date.now() } : f
      ),
    }))
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
    set((state) => ({
      folders: state.folders.filter((f) => !toDelete.includes(f.id)),
    }))
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
