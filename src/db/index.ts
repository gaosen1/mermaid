import Dexie, { type EntityTable } from 'dexie'
import type { Project, Diagram, DiagramFolder, Snapshot, UserSettings } from '@/types'
import type { SyncLogEntry, SyncQueueItem } from '@/types/sync'

const db = new Dexie('MermaidLocalDB') as Dexie & {
  projects: EntityTable<Project, 'id'>
  diagrams: EntityTable<Diagram, 'id'>
  folders: EntityTable<DiagramFolder, 'id'>
  snapshots: EntityTable<Snapshot, 'id'>
  settings: EntityTable<UserSettings, 'id'>
  // 同步相关表
  syncLog: EntityTable<SyncLogEntry, 'id'>
  syncQueue: EntityTable<SyncQueueItem, 'id'>
}

// 版本 1：原有结构
db.version(1).stores({
  projects: 'id, name, updatedAt, *tags',
  diagrams: 'id, projectId, name, updatedAt',
  snapshots: 'id, diagramId, createdAt',
  settings: 'id',
})

// 版本 2：添加同步支持
db.version(2)
  .stores({
    projects: 'id, name, updatedAt, *tags, syncStatus, lastSyncTime',
    diagrams: 'id, projectId, name, updatedAt, syncStatus, lastSyncTime',
    snapshots: 'id, diagramId, createdAt, syncStatus, lastSyncTime',
    settings: 'id',
    syncLog: '++id, timestamp, status, entityType, entityId',
    syncQueue: '++id, entityType, entityId, priority, createdAt',
  })
  .upgrade(async (tx) => {
    // 迁移现有数据：添加默认同步状态
    await tx
      .table('projects')
      .toCollection()
      .modify((project: Project) => {
        project.syncStatus = 'local-only'
        project.localChecksum = undefined
        project.remoteChecksum = undefined
        project.lastSyncTime = undefined
        project.syncError = undefined
      })

    await tx
      .table('diagrams')
      .toCollection()
      .modify((diagram: Diagram) => {
        diagram.syncStatus = 'local-only'
        diagram.localChecksum = undefined
        diagram.remoteChecksum = undefined
        diagram.lastSyncTime = undefined
        diagram.syncError = undefined
      })

    await tx
      .table('snapshots')
      .toCollection()
      .modify((snapshot: Snapshot) => {
        snapshot.syncStatus = 'local-only'
        snapshot.lastSyncTime = undefined
        snapshot.syncError = undefined
      })

    console.log('Database migrated to version 2 with sync support')
  })

// 版本 3：添加图表排序支持
db.version(3)
  .stores({
    projects: 'id, name, updatedAt, *tags, syncStatus, lastSyncTime',
    diagrams: 'id, projectId, name, updatedAt, order, syncStatus, lastSyncTime',
    snapshots: 'id, diagramId, createdAt, syncStatus, lastSyncTime',
    settings: 'id',
    syncLog: '++id, timestamp, status, entityType, entityId',
    syncQueue: '++id, entityType, entityId, priority, createdAt',
  })
  .upgrade(async (tx) => {
    // 为现有图表添加 order 字段
    const diagrams = await tx.table('diagrams').toArray()
    const diagramsByProject = new Map<string, Diagram[]>()

    // 按项目分组
    diagrams.forEach((diagram: Diagram) => {
      if (!diagramsByProject.has(diagram.projectId)) {
        diagramsByProject.set(diagram.projectId, [])
      }
      diagramsByProject.get(diagram.projectId)!.push(diagram)
    })

    // 为每个项目的图表设置顺序
    for (const [, projectDiagrams] of diagramsByProject) {
      projectDiagrams.sort((a, b) => b.updatedAt - a.updatedAt)
      for (let i = 0; i < projectDiagrams.length; i++) {
        await tx.table('diagrams').update(projectDiagrams[i].id, { order: i })
      }
    }

    console.log('Database migrated to version 3 with diagram ordering support')
  })

// 版本 4：添加图表类型支持
db.version(4)
  .stores({
    projects: 'id, name, updatedAt, *tags, syncStatus, lastSyncTime',
    diagrams: 'id, projectId, name, type, updatedAt, order, syncStatus, lastSyncTime',
    snapshots: 'id, diagramId, createdAt, syncStatus, lastSyncTime',
    settings: 'id',
    syncLog: '++id, timestamp, status, entityType, entityId',
    syncQueue: '++id, entityType, entityId, priority, createdAt',
  })
  .upgrade(async (tx) => {
    await tx
      .table('diagrams')
      .toCollection()
      .modify((diagram: Diagram) => {
        diagram.type = diagram.type || 'mermaid'
      })

    console.log('Database migrated to version 4 with diagram type support')
  })

// 版本 5：添加目录分级支持
db.version(5)
  .stores({
    projects: 'id, name, updatedAt, *tags, syncStatus, lastSyncTime',
    diagrams: 'id, projectId, folderId, name, type, updatedAt, order, syncStatus, lastSyncTime',
    folders: 'id, projectId, parentId, name, order, updatedAt',
    snapshots: 'id, diagramId, createdAt, syncStatus, lastSyncTime',
    settings: 'id',
    syncLog: '++id, timestamp, status, entityType, entityId',
    syncQueue: '++id, entityType, entityId, priority, createdAt',
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
