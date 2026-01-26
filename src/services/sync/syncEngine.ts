/**
 * 同步协调引擎
 * 负责协调本地和远端数据的双向同步
 */

import { db } from '@/db'
import type { Project, Diagram, Snapshot } from '@/types'
import type { SyncLogEntry, SyncSettings } from '@/types/sync'
import { getFile, putFile, deleteFile, listDirectory } from '../github/files'
import { isGitHubInitialized } from '../github/client'
import {
  calculateProjectChecksum,
  calculateDiagramChecksum,
  calculateSnapshotChecksum,
  compareProjects,
  compareDiagrams,
  type DiffResult,
} from './dataSync'
import * as syncQueue from './syncQueue'
import { createConflictInfo, resolveConflict, type ConflictStrategy } from './conflictResolver'

// GitHub 仓库路径常量
const PATHS = {
  PROJECTS_JSON: 'data/projects.json',
  PROJECT_META: (id: string) => `data/projects/${id}/meta.json`,
  DIAGRAM: (projectId: string, id: string) => `data/projects/${projectId}/diagrams/${id}.mmd`,
  SNAPSHOT: (diagramId: string, id: string) => `data/snapshots/${diagramId}/${id}.json`,
}

// 同步状态
let isSyncing = false
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

export interface SyncProgress {
  total: number
  completed: number
  current?: string
  phase: 'idle' | 'detecting' | 'pushing' | 'pulling' | 'resolving'
}

export interface SyncResult {
  success: boolean
  pushed: number
  pulled: number
  conflicts: number
  errors: string[]
}

type ProgressCallback = (progress: SyncProgress) => void

/**
 * 检查是否正在同步
 */
export function getIsSyncing(): boolean {
  return isSyncing
}

/**
 * 执行完整同步
 */
export async function syncAll(
  settings: SyncSettings,
  onProgress?: ProgressCallback
): Promise<SyncResult> {
  if (isSyncing) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: ['Sync already in progress'] }
  }

  if (!isGitHubInitialized()) {
    return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: ['GitHub not initialized'] }
  }

  isSyncing = true
  const result: SyncResult = { success: true, pushed: 0, pulled: 0, conflicts: 0, errors: [] }

  try {
    onProgress?.({ total: 0, completed: 0, phase: 'detecting' })

    // 1. 获取本地数据
    const localProjects = await db.projects.toArray()
    const localDiagrams = await db.diagrams.toArray()

    // 2. 获取远端数据
    const remoteProjects = await fetchRemoteProjects()

    // 3. 检测差异并同步项目
    onProgress?.({ total: localProjects.length, completed: 0, phase: 'pushing' })

    for (let i = 0; i < localProjects.length; i++) {
      const project = localProjects[i]
      onProgress?.({
        total: localProjects.length,
        completed: i,
        current: project.name,
        phase: 'pushing'
      })

      try {
        await syncProject(project, remoteProjects, settings)
        result.pushed++
      } catch (error) {
        result.errors.push(`Failed to sync project ${project.name}: ${error}`)
      }
    }

    // 4. 同步图表
    for (const diagram of localDiagrams) {
      try {
        await syncDiagram(diagram, settings)
        result.pushed++
      } catch (error) {
        result.errors.push(`Failed to sync diagram ${diagram.name}: ${error}`)
      }
    }

    // 5. 拉取远端新增的数据
    onProgress?.({ total: 0, completed: 0, phase: 'pulling' })
    const pullResult = await pullRemoteChanges(localProjects, remoteProjects, settings)
    result.pulled = pullResult.pulled
    result.conflicts += pullResult.conflicts

    // 6. 更新同步时间
    await updateLastSyncTime()

    onProgress?.({ total: 0, completed: 0, phase: 'idle' })
  } catch (error) {
    result.success = false
    result.errors.push(`Sync failed: ${error}`)
  } finally {
    isSyncing = false
  }

  // 记录同步日志
  await logSyncResult(result)

  return result
}

/**
 * 获取远端项目列表
 */
async function fetchRemoteProjects(): Promise<Map<string, Project>> {
  const map = new Map<string, Project>()

  try {
    const file = await getFile(PATHS.PROJECTS_JSON)
    if (file?.content) {
      const data = JSON.parse(file.content)
      if (data.projects && Array.isArray(data.projects)) {
        for (const project of data.projects) {
          map.set(project.id, project)
        }
      }
    }
  } catch {
    // 文件不存在或解析失败，返回空 map
  }

  return map
}

/**
 * 同步单个项目
 */
async function syncProject(
  project: Project,
  remoteProjects: Map<string, Project>,
  settings: SyncSettings
): Promise<void> {
  const remote = remoteProjects.get(project.id) || null
  const diff = await compareProjects(project, remote)

  switch (diff.type) {
    case 'create':
    case 'update':
      await pushProject(project)
      break
    case 'conflict':
      await handleProjectConflict(project, remote!, settings)
      break
    case 'unchanged':
      // 无需操作
      break
  }
}

/**
 * 推送项目到远端
 */
async function pushProject(project: Project): Promise<void> {
  const checksum = await calculateProjectChecksum(project)
  const content = JSON.stringify(project, null, 2)

  await putFile(
    PATHS.PROJECT_META(project.id),
    content,
    `Sync project: ${project.name}`
  )

  // 更新本地同步状态
  await db.projects.update(project.id, {
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    syncError: undefined,
  })

  // 更新 projects.json
  await updateProjectsJson()
}

/**
 * 处理项目冲突
 */
async function handleProjectConflict(
  local: Project,
  remote: Project,
  settings: SyncSettings
): Promise<void> {
  const diff = await compareProjects(local, remote)
  const conflictInfo = createConflictInfo(diff)

  if (!conflictInfo) return

  // 根据策略解决冲突
  if (settings.conflictStrategy === 'ask') {
    // 标记为冲突状态，等待用户处理
    await db.projects.update(local.id, {
      syncStatus: 'conflict',
      syncError: 'Conflict detected, manual resolution required',
    })
    return
  }

  const resolution = await resolveConflict(conflictInfo, settings.conflictStrategy)

  if (resolution.keepVersion === 'local') {
    await pushProject(local)
  } else {
    await db.projects.update(local.id, {
      ...remote,
      syncStatus: 'synced',
      lastSyncTime: Date.now(),
    })
  }
}

/**
 * 同步单个图表
 */
async function syncDiagram(diagram: Diagram, settings: SyncSettings): Promise<void> {
  const checksum = await calculateDiagramChecksum(diagram)
  const content = formatDiagramContent(diagram)

  await putFile(
    PATHS.DIAGRAM(diagram.projectId, diagram.id),
    content,
    `Sync diagram: ${diagram.name}`
  )

  await db.diagrams.update(diagram.id, {
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    syncError: undefined,
  })
}

/**
 * 格式化图表内容为 .mmd 文件格式
 */
function formatDiagramContent(diagram: Diagram): string {
  const meta = {
    id: diagram.id,
    name: diagram.name,
    projectId: diagram.projectId,
    createdAt: new Date(diagram.createdAt).toISOString(),
    updatedAt: new Date(diagram.updatedAt).toISOString(),
  }

  return `---
meta:
  id: ${meta.id}
  name: ${meta.name}
  projectId: ${meta.projectId}
  createdAt: ${meta.createdAt}
  updatedAt: ${meta.updatedAt}
config: ${JSON.stringify(diagram.config || {})}
---
${diagram.source}`
}

/**
 * 拉取远端变更
 */
async function pullRemoteChanges(
  localProjects: Project[],
  remoteProjects: Map<string, Project>,
  settings: SyncSettings
): Promise<{ pulled: number; conflicts: number }> {
  let pulled = 0
  let conflicts = 0

  const localIds = new Set(localProjects.map((p) => p.id))

  // 查找远端有但本地没有的项目
  for (const [id, remote] of remoteProjects) {
    if (!localIds.has(id)) {
      await db.projects.add({
        ...remote,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
      })
      pulled++
    }
  }

  return { pulled, conflicts }
}

/**
 * 更新 projects.json 文件
 */
async function updateProjectsJson(): Promise<void> {
  const projects = await db.projects.toArray()
  const data = {
    version: '1.0.0',
    lastSync: new Date().toISOString(),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      tags: p.tags,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  }

  await putFile(
    PATHS.PROJECTS_JSON,
    JSON.stringify(data, null, 2),
    'Update projects list'
  )
}

/**
 * 更新最后同步时间
 */
async function updateLastSyncTime(): Promise<void> {
  localStorage.setItem('lastSyncTime', Date.now().toString())
}

/**
 * 记录同步结果日志
 */
async function logSyncResult(result: SyncResult): Promise<void> {
  const logEntry: SyncLogEntry = {
    timestamp: Date.now(),
    operation: 'push',
    entityType: 'project',
    entityId: 'sync-all',
    status: result.success ? 'success' : 'failed',
    message: `Pushed: ${result.pushed}, Pulled: ${result.pulled}, Conflicts: ${result.conflicts}`,
    details: {
      pushed: result.pushed,
      pulled: result.pulled,
      conflicts: result.conflicts,
      errors: result.errors,
    },
  }

  await db.syncLog.add(logEntry)
}

/**
 * 启动自动同步
 */
export function startAutoSync(settings: SyncSettings): void {
  if (autoSyncTimer) {
    stopAutoSync()
  }

  if (!settings.autoSync) return

  autoSyncTimer = setInterval(() => {
    syncAll(settings)
  }, settings.syncInterval)
}

/**
 * 停止自动同步
 */
export function stopAutoSync(): void {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
}
