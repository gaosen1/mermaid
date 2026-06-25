import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import type { Project } from '@/types'

export type ProjectSortMode = 'manual' | 'updatedAt' | 'createdAt' | 'name'

const SORT_MODE_KEY = 'project-sort-mode'

function loadSortMode(): ProjectSortMode {
  try {
    const v = localStorage.getItem(SORT_MODE_KEY)
    if (v === 'manual' || v === 'updatedAt' || v === 'createdAt' || v === 'name') return v
  } catch { /* ignore */ }
  return 'manual'
}

function saveSortMode(mode: ProjectSortMode) {
  try { localStorage.setItem(SORT_MODE_KEY, mode) } catch { /* ignore */ }
}

function applySort(projects: Project[], mode: ProjectSortMode): Project[] {
  const arr = [...projects]
  switch (mode) {
    case 'updatedAt': return arr.sort((a, b) => b.updatedAt - a.updatedAt)
    case 'createdAt': return arr.sort((a, b) => b.createdAt - a.createdAt)
    case 'name': return arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    case 'manual':
    default:
      return arr.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order
        if (a.order !== undefined) return -1
        if (b.order !== undefined) return 1
        return b.createdAt - a.createdAt
      })
  }
}

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  searchQuery: string
  selectedTags: string[]
  sortMode: ProjectSortMode

  loadProjects: () => Promise<void>
  createProject: (name: string, description?: string, tags?: string[]) => Promise<Project>
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  reorderProjects: (orderedIds: string[]) => Promise<void>
  setCurrentProject: (project: Project | null) => void
  setSearchQuery: (query: string) => void
  setSelectedTags: (tags: string[]) => void
  setSortMode: (mode: ProjectSortMode) => void
  getAllTags: () => string[]
  getFilteredProjects: () => Project[]
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  searchQuery: '',
  selectedTags: [],
  sortMode: loadSortMode(),

  loadProjects: async () => {
    set({ loading: true })
    const projects = await db.projects.toArray()
    set({ projects, loading: false })
  },

  createProject: async (name, description, tags = []) => {
    const now = Date.now()
    const { projects } = get()
    const maxOrder = projects.reduce((m, p) => Math.max(m, p.order ?? -1), -1)
    const project: Project = {
      id: uuid(),
      name,
      description,
      tags,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    }
    await db.projects.add(project)
    set((state) => ({ projects: [...state.projects, project] }))
    return project
  },

  updateProject: async (id, updates) => {
    const updatedAt = Date.now()
    await db.projects.update(id, { ...updates, updatedAt })
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt } : p
      ),
      currentProject:
        state.currentProject?.id === id
          ? { ...state.currentProject, ...updates, updatedAt }
          : state.currentProject,
    }))
  },

  deleteProject: async (id) => {
    await db.transaction('rw', [db.projects, db.diagrams, db.snapshots], async () => {
      const diagrams = await db.diagrams.where('projectId').equals(id).toArray()
      const diagramIds = diagrams.map((d) => d.id)
      await db.snapshots.where('diagramId').anyOf(diagramIds).delete()
      await db.diagrams.where('projectId').equals(id).delete()
      await db.projects.delete(id)
    })
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }))
  },

  reorderProjects: async (orderedIds) => {
    const updates = orderedIds.map((id, index) => ({ key: id, changes: { order: index } }))
    await db.projects.bulkUpdate(updates)
    set((state) => ({
      projects: state.projects.map((p) => {
        const idx = orderedIds.indexOf(p.id)
        return idx >= 0 ? { ...p, order: idx } : p
      }),
    }))
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedTags: (tags) => set({ selectedTags: tags }),

  setSortMode: (mode) => {
    saveSortMode(mode)
    set({ sortMode: mode })
  },

  getAllTags: () => {
    const { projects } = get()
    const tagSet = new Set<string>()
    projects.forEach((p) => p.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet).sort()
  },

  getFilteredProjects: () => {
    const { projects, searchQuery, selectedTags, sortMode } = get()
    const filtered = projects.filter((project) => {
      const matchesSearch =
        !searchQuery ||
        fuzzyMatch(project.name, searchQuery) ||
        (project.description ? fuzzyMatch(project.description, searchQuery) : false)
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => project.tags.includes(tag))
      return matchesSearch && matchesTags
    })
    return applySort(filtered, sortMode)
  },
}))

export function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return true
  if (t.includes(q)) return true
  // 字符子序列匹配
  let ti = 0
  for (const c of q) {
    const found = t.indexOf(c, ti)
    if (found === -1) return false
    ti = found + 1
  }
  return true
}
