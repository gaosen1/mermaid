import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { db } from '@/db'
import type { Project } from '@/types'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  searchQuery: string
  selectedTags: string[]

  loadProjects: () => Promise<void>
  createProject: (name: string, description?: string, tags?: string[]) => Promise<Project>
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
  setSearchQuery: (query: string) => void
  setSelectedTags: (tags: string[]) => void
  getAllTags: () => string[]
  getFilteredProjects: () => Project[]
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  searchQuery: '',
  selectedTags: [],

  loadProjects: async () => {
    set({ loading: true })
    const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
    set({ projects, loading: false })
  },

  createProject: async (name, description, tags = []) => {
    const now = Date.now()
    const project: Project = {
      id: uuid(),
      name,
      description,
      tags,
      createdAt: now,
      updatedAt: now,
    }
    await db.projects.add(project)
    set((state) => ({ projects: [project, ...state.projects] }))
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

  setCurrentProject: (project) => set({ currentProject: project }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedTags: (tags) => set({ selectedTags: tags }),

  getAllTags: () => {
    const { projects } = get()
    const tagSet = new Set<string>()
    projects.forEach((p) => p.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet).sort()
  },

  getFilteredProjects: () => {
    const { projects, searchQuery, selectedTags } = get()
    return projects.filter((project) => {
      const matchesSearch =
        !searchQuery ||
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => project.tags.includes(tag))
      return matchesSearch && matchesTags
    })
  },
}))
