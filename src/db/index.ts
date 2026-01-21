import Dexie, { type EntityTable } from 'dexie'
import type { Project, Diagram, Snapshot, UserSettings } from '@/types'

const db = new Dexie('MermaidLocalDB') as Dexie & {
  projects: EntityTable<Project, 'id'>
  diagrams: EntityTable<Diagram, 'id'>
  snapshots: EntityTable<Snapshot, 'id'>
  settings: EntityTable<UserSettings, 'id'>
}

db.version(1).stores({
  projects: 'id, name, updatedAt, *tags',
  diagrams: 'id, projectId, name, updatedAt',
  snapshots: 'id, diagramId, createdAt',
  settings: 'id',
})

export { db }

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  language: 'zh',
  theme: 'system',
  defaultLayout: 'elk',
  defaultExportFormat: 'png',
  renderTheme: 'base',
  autoSaveInterval: 30000,
}

export async function initSettings(): Promise<UserSettings> {
  const existing = await db.settings.get('default')
  if (existing) {
    return existing
  }
  await db.settings.add(DEFAULT_SETTINGS)
  return DEFAULT_SETTINGS
}
