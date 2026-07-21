/**
 * 同步协调引擎（git 语义）
 *
 * 提供三个显式操作：
 * - pull  云端 -> 本地（拉取）
 * - push  本地 -> 云端（推送）
 * - sync  先 pull 再 push（合并同步）
 *
 * 冲突判定采用三方合并（base / local / remote）：
 * - base   = 上次同步成功时的内容标识（存在本地实体上）
 * - local  = 当前本地内容标识
 * - remote = 当前云端内容标识（项目用 checksum，图表用 git blob SHA）
 * 双改冲突时按 settings.mergeStrategy 处理。
 */

import { db } from '@/db'
import type { Project, Diagram, DiagramFolder } from '@/types'
import type {
  SyncLogEntry,
  SyncSettings,
  SyncProgress,
  SyncDirection,
  SyncPhase,
} from '@/types/sync'
import { getFile, getFileBase64, putFile, putFileBase64, listDirectory } from '../github/files'
import { isGitHubInitialized } from '../github/client'
import { getDiagramFileExtension, getDiagramTypeFromFilename } from '@/utils/diagram'
import { getPngDataUrlBase64, buildImageDataUrl, isImageType } from '@/utils/png'
import {
  calculateProjectChecksum,
  calculateDiagramChecksum,
  calculateFolderChecksum,
  threeWayDecision,
  decideFromFlags,
} from './dataSync'
import { decideKeepVersion } from './conflictResolver'

// GitHub 仓库路径常量
const PATHS = {
  PROJECTS_JSON: 'data/projects.json',
  FOLDERS_JSON: (projectId: string) => `data/projects/${projectId}/folders.json`,
  DIAGRAMS_DIR: (projectId: string) => `data/projects/${projectId}/diagrams`,
}

// 同步状态
let isSyncing = false
let autoSyncTimer: ReturnType<typeof setInterval> | null = null

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

function emit(
  cb: ProgressCallback | undefined,
  direction: SyncDirection,
  phase: SyncPhase,
  total: number,
  completed: number,
  current?: string
): void {
  cb?.({ direction, phase, total, completed, current })
}

function emptyResult(): SyncResult {
  return { success: true, pushed: 0, pulled: 0, conflicts: 0, errors: [] }
}

function failResult(message: string): SyncResult {
  return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: [message] }
}

// ============ 对外操作 ============

export async function pull(settings: SyncSettings, onProgress?: ProgressCallback): Promise<SyncResult> {
  return run('pull', settings, onProgress)
}

export async function push(settings: SyncSettings, onProgress?: ProgressCallback): Promise<SyncResult> {
  return run('push', settings, onProgress)
}

export async function sync(settings: SyncSettings, onProgress?: ProgressCallback): Promise<SyncResult> {
  return run('sync', settings, onProgress)
}

// 兼容旧调用
export const syncAll = sync

/**
 * 手动解决单个项目冲突（供 ConflictDialog 调用）
 * keep='local' -> 用本地覆盖云端；keep='remote' -> 用云端覆盖本地
 */
export async function resolveProjectConflict(id: string, keep: 'local' | 'remote'): Promise<void> {
  if (!isGitHubInitialized()) throw new Error('GitHub not initialized')
  const local = await db.projects.get(id)
  if (!local) return

  if (keep === 'local') {
    const checksum = await calculateProjectChecksum(local)
    await markProjectSynced(id, checksum)
    await updateProjectsJson()
    await logEntity('conflict', 'project', id, 'success', `手动解决：覆盖云端 ${local.name}`)
  } else {
    const remote = (await fetchRemoteProjects()).get(id)
    if (remote) {
      await applyRemoteProject(id, remote, await calculateProjectChecksum(remote))
      await logEntity('conflict', 'project', id, 'success', `手动解决：采用云端 ${remote.name}`)
    } else {
      await logEntity('conflict', 'project', id, 'failed', `手动解决失败：云端未找到项目 ${local.name}`)
      throw new Error(`云端未找到该项目，无法采用云端版本：${local.name}`)
    }
  }
}

/**
 * 手动解决单个图表冲突（供 ConflictDialog 调用）
 */
export async function resolveDiagramConflict(id: string, keep: 'local' | 'remote'): Promise<void> {
  if (!isGitHubInitialized()) throw new Error('GitHub not initialized')
  const local = await db.diagrams.get(id)
  if (!local) return

  if (keep === 'local') {
    const checksum = await calculateDiagramChecksum(local)
    await uploadDiagram(local, checksum, emptyResult())
    await logEntity('conflict', 'diagram', id, 'success', `手动解决：覆盖云端 ${local.name}`)
  } else {
    const remoteShas = await listRemoteDiagramShas(local.projectId)
    const remoteInfo = remoteShas.get(id)
    if (remoteInfo) {
      const remoteDiagram = await fetchRemoteDiagram(remoteInfo.path, local.projectId, id)
      if (remoteDiagram) {
        await applyRemoteDiagram(local, remoteDiagram, remoteInfo.sha)
        await logEntity('conflict', 'diagram', id, 'success', `手动解决：采用云端 ${remoteDiagram.name}`)
      } else {
        await logEntity('conflict', 'diagram', id, 'failed', `手动解决失败：无法读取云端图表内容 ${local.name}`)
        throw new Error(`无法读取云端图表内容，无法采用云端版本：${local.name}`)
      }
    } else {
      await logEntity('conflict', 'diagram', id, 'failed', `手动解决失败：云端未找到图表 ${local.name}`)
      throw new Error(`云端未找到该图表，无法采用云端版本：${local.name}`)
    }
  }
}

async function run(
  direction: SyncDirection,
  settings: SyncSettings,
  onProgress?: ProgressCallback
): Promise<SyncResult> {
  if (isSyncing) {
    return failResult('Sync already in progress')
  }
  if (!isGitHubInitialized()) {
    return failResult('GitHub not initialized')
  }

  isSyncing = true
  const result = emptyResult()

  try {
    if (direction === 'pull' || direction === 'sync') {
      await doPull(settings, result, onProgress)
    }
    if (direction === 'push' || direction === 'sync') {
      await doPush(settings, result, onProgress)
    }
    await updateLastSyncTime()
    emit(onProgress, direction, 'idle', 0, 0)
  } catch (error) {
    result.errors.push(`Sync failed: ${error}`)
  } finally {
    isSyncing = false
  }

  if (result.errors.length > 0) {
    result.success = false
  }

  await logSyncResult(direction, result)
  return result
}

// ============ 拉取 ============

async function doPull(
  settings: SyncSettings,
  result: SyncResult,
  onProgress?: ProgressCallback
): Promise<void> {
  emit(onProgress, 'pull', 'detecting', 0, 0)

  const remoteProjects = await fetchRemoteProjects()
  const remoteList = [...remoteProjects.values()]
  const localProjects = await db.projects.toArray()
  const localById = new Map(localProjects.map((p) => [p.id, p]))

  // 1. 拉取项目元数据
  emit(onProgress, 'pull', 'pulling', remoteList.length, 0)
  let completed = 0
  for (const remote of remoteList) {
    emit(onProgress, 'pull', 'pulling', remoteList.length, completed, remote.name)
    try {
      await pullProject(remote, localById.get(remote.id) || null, settings, result)
    } catch (error) {
      result.errors.push(`Failed to pull project ${remote.name}: ${error}`)
    }
    completed++
  }

  // 2. 拉取每个远端项目下的文件夹
  for (const remote of remoteList) {
    try {
      await pullProjectFolders(remote.id, settings, result)
    } catch {
      // folders.json 不存在或无法访问，跳过
    }
  }

  // 3. 拉取每个远端项目下的图表
  const localDiagrams = await db.diagrams.toArray()
  const localDiagramById = new Map(localDiagrams.map((d) => [d.id, d]))
  for (const remote of remoteList) {
    emit(onProgress, 'pull', 'pulling', remoteList.length, completed, remote.name)
    try {
      await pullProjectDiagrams(remote.id, localDiagramById, settings, result)
    } catch {
      // 目录不存在或无法访问，跳过
    }
  }
}

async function pullProject(
  remote: Project,
  local: Project | null,
  settings: SyncSettings,
  result: SyncResult
): Promise<void> {
  const remoteNow = await calculateProjectChecksum(remote)

  // 远端有、本地无 -> 创建
  if (!local) {
    await db.projects.add({
      ...remote,
      syncStatus: 'synced',
      lastSyncTime: Date.now(),
      localChecksum: remoteNow,
      remoteChecksum: remoteNow,
      syncError: undefined,
    })
    result.pulled++
    await logEntity('pull', 'project', remote.id, 'success', `拉取新项目：${remote.name}`)
    return
  }

  const localNow = await calculateProjectChecksum(local)
  const decision = threeWayDecision(local.remoteChecksum, localNow, remoteNow)

  if (decision === 'pull') {
    await applyRemoteProject(local.id, remote, remoteNow)
    result.pulled++
    await logEntity('pull', 'project', local.id, 'success', `更新项目：${remote.name}`)
  } else if (decision === 'conflict') {
    const keep = decideKeepVersion(settings.mergeStrategy, local, remote)
    if (keep === null) {
      await db.projects.update(local.id, {
        syncStatus: 'conflict',
        syncError: '冲突：本地与云端都有修改',
      })
      result.conflicts++
      await logEntity('conflict', 'project', local.id, 'failed', `项目冲突待手动解决：${remote.name}`)
    } else if (keep === 'remote') {
      await applyRemoteProject(local.id, remote, remoteNow)
      result.pulled++
      await logEntity('conflict', 'project', local.id, 'success', `项目冲突：采用云端 ${remote.name}`)
    } else {
      // 保留本地：标记为待推送，交给 push 阶段
      await db.projects.update(local.id, { syncStatus: 'pending', syncError: undefined })
      await logEntity('conflict', 'project', local.id, 'success', `项目冲突：保留本地 ${local.name}`)
    }
  }
  // push / unchanged：拉取阶段不处理
}

async function pullProjectDiagrams(
  projectId: string,
  localDiagramById: Map<string, Diagram>,
  settings: SyncSettings,
  result: SyncResult
): Promise<void> {
  const files = (await listDirectory(PATHS.DIAGRAMS_DIR(projectId))).filter(
    (f) => !isMetaSidecarPath(f.path)
  )

  for (const fileInfo of files) {
    const diagramId = fileNameToId(fileInfo.path)
    const local = localDiagramById.get(diagramId)

    // 远端有、本地无 -> 创建
    if (!local) {
      const created = await fetchRemoteDiagram(fileInfo.path, projectId, diagramId)
      if (created) {
        const checksum = await calculateDiagramChecksum(created)
        await db.diagrams.add({
          ...created,
          syncStatus: 'synced',
          lastSyncTime: Date.now(),
          localChecksum: checksum,
          remoteChecksum: checksum,
          remoteSha: fileInfo.sha,
          syncError: undefined,
        })
        localDiagramById.set(created.id, created)
        result.pulled++
        await logEntity('pull', 'diagram', created.id, 'success', `拉取新图表：${created.name}`)
      }
      continue
    }

    const remoteChanged = fileInfo.sha !== local.remoteSha
    const localChanged = (await calculateDiagramChecksum(local)) !== local.localChecksum
    const decision = decideFromFlags(localChanged, remoteChanged)

    if (decision === 'pull') {
      const remoteDiagram = await fetchRemoteDiagram(fileInfo.path, projectId, diagramId)
      if (remoteDiagram) {
        await applyRemoteDiagram(local, remoteDiagram, fileInfo.sha)
        result.pulled++
        await logEntity('pull', 'diagram', local.id, 'success', `更新图表：${remoteDiagram.name}`)
      }
    } else if (decision === 'conflict') {
      const remoteDiagram = await fetchRemoteDiagram(fileInfo.path, projectId, diagramId)
      const keep = decideKeepVersion(settings.mergeStrategy, local, remoteDiagram || local)
      if (keep === null || !remoteDiagram) {
        await db.diagrams.update(local.id, {
          syncStatus: 'conflict',
          syncError: '冲突：本地与云端都有修改',
        })
        result.conflicts++
        await logEntity('conflict', 'diagram', local.id, 'failed', `图表冲突待手动解决：${local.name}`)
      } else if (keep === 'remote') {
        await applyRemoteDiagram(local, remoteDiagram, fileInfo.sha)
        result.pulled++
        await logEntity('conflict', 'diagram', local.id, 'success', `图表冲突：采用云端 ${remoteDiagram.name}`)
      } else {
        await db.diagrams.update(local.id, { syncStatus: 'pending', syncError: undefined })
        await logEntity('conflict', 'diagram', local.id, 'success', `图表冲突：保留本地 ${local.name}`)
      }
    }
    // push / unchanged：拉取阶段不处理
  }
}

/**
 * 拉取某项目下的文件夹（folders.json）。
 * 采用 per-folder 两路合并：远端新增 -> 写入本地；远端已有 -> 按 updatedAt/策略取新。
 */
async function pullProjectFolders(
  projectId: string,
  settings: SyncSettings,
  result: SyncResult
): Promise<void> {
  const remoteFolders = await fetchRemoteFolders(projectId)
  if (!remoteFolders) return

  const localFolders = await db.folders.where('projectId').equals(projectId).toArray()
  const localById = new Map(localFolders.map((f) => [f.id, f]))

  for (const remote of remoteFolders) {
    const local = localById.get(remote.id)
    const remoteChecksum = await calculateFolderChecksum(remote)

    if (!local) {
      await db.folders.add({
        ...remote,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
        localChecksum: remoteChecksum,
        remoteChecksum: remoteChecksum,
        syncError: undefined,
      })
      result.pulled++
      await logEntity('pull', 'folder', remote.id, 'success', `拉取新文件夹：${remote.name}`)
      continue
    }

    const localChecksum = await calculateFolderChecksum(local)
    if (localChecksum === remoteChecksum) continue

    const keep = decideKeepVersion(settings.mergeStrategy, local, remote)
    if (keep === null) {
      await db.folders.update(local.id, {
        syncStatus: 'conflict',
        syncError: '冲突：本地与云端都有修改',
      })
      result.conflicts++
      await logEntity('conflict', 'folder', local.id, 'failed', `文件夹冲突待手动解决：${remote.name}`)
    } else if (keep === 'remote') {
      await db.folders.update(local.id, {
        parentId: remote.parentId,
        name: remote.name,
        order: remote.order,
        updatedAt: remote.updatedAt,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
        localChecksum: remoteChecksum,
        remoteChecksum: remoteChecksum,
        syncError: undefined,
      })
      result.pulled++
      await logEntity('pull', 'folder', local.id, 'success', `更新文件夹：${remote.name}`)
    }
    // keep === 'local'：保留本地，等待 push 阶段推送
  }
}

// ============ 推送 ============

async function doPush(
  settings: SyncSettings,
  result: SyncResult,
  onProgress?: ProgressCallback
): Promise<void> {
  emit(onProgress, 'push', 'detecting', 0, 0)

  const remoteProjects = await fetchRemoteProjects()
  const localProjects = await db.projects.toArray()

  // 1. 推送项目元数据（先在本地判定，projects.json 最后统一写一次）
  emit(onProgress, 'push', 'pushing', localProjects.length, 0)
  let projectsChanged = false
  let completed = 0
  for (const local of localProjects) {
    emit(onProgress, 'push', 'pushing', localProjects.length, completed, local.name)
    try {
      const changed = await pushProject(local, remoteProjects.get(local.id) || null, settings, result)
      if (changed) projectsChanged = true
    } catch (error) {
      result.errors.push(`Failed to push project ${local.name}: ${error}`)
    }
    completed++
  }

  // 关键：projects.json 一次同步只写一次，根治 SHA 竞争
  const remoteMissing = localProjects.length > 0 && remoteProjects.size === 0
  if (projectsChanged || remoteMissing) {
    try {
      await updateProjectsJson(remoteProjects)
    } catch (error) {
      result.errors.push(`Failed to update projects.json: ${error}`)
    }
  }

  // 2. 推送文件夹（每个项目一个 folders.json）
  for (const local of localProjects) {
    try {
      await pushProjectFolders(local.id, settings, result)
    } catch (error) {
      result.errors.push(`Failed to push folders for ${local.name}: ${error}`)
    }
  }

  // 3. 推送图表
  const localDiagrams = await db.diagrams.toArray()
  const diagramsByProject = new Map<string, Diagram[]>()
  for (const d of localDiagrams) {
    const list = diagramsByProject.get(d.projectId) || []
    list.push(d)
    diagramsByProject.set(d.projectId, list)
  }

  const totalDiagrams = localDiagrams.length
  let dCompleted = 0
  emit(onProgress, 'push', 'pushing', totalDiagrams, 0)

  for (const [projectId, diagrams] of diagramsByProject) {
    // 每个项目只列一次远端目录，拿到各图表当前 blob SHA
    const remoteShas = await listRemoteDiagramShas(projectId)

    for (const local of diagrams) {
      emit(onProgress, 'push', 'pushing', totalDiagrams, dCompleted, local.name)
      try {
        await pushDiagram(local, remoteShas.get(local.id), settings, result)
      } catch (error) {
        result.errors.push(`Failed to push diagram ${local.name}: ${error}`)
      }
      dCompleted++
    }
  }
}

async function pushProject(
  local: Project,
  remote: Project | null,
  settings: SyncSettings,
  result: SyncResult
): Promise<boolean> {
  const localNow = await calculateProjectChecksum(local)

  // 远端无该项目
  if (!remote) {
    // 新建，或远端被删除后重新推送
    await markProjectSynced(local.id, localNow)
    result.pushed++
    await logEntity('push', 'project', local.id, 'success', `推送项目：${local.name}`)
    return true
  }

  const remoteNow = await calculateProjectChecksum(remote)
  const decision = threeWayDecision(local.remoteChecksum, localNow, remoteNow)

  if (decision === 'push') {
    await markProjectSynced(local.id, localNow)
    result.pushed++
    await logEntity('push', 'project', local.id, 'success', `推送项目：${local.name}`)
    return true
  }

  if (decision === 'conflict') {
    const keep = decideKeepVersion(settings.mergeStrategy, local, remote)
    if (keep === null) {
      await db.projects.update(local.id, {
        syncStatus: 'conflict',
        syncError: '冲突：云端有新变更，请先拉取',
      })
      result.conflicts++
      await logEntity('conflict', 'project', local.id, 'failed', `项目冲突（云端领先）：${local.name}`)
      return false
    }
    if (keep === 'local') {
      await markProjectSynced(local.id, localNow)
      result.pushed++
      await logEntity('conflict', 'project', local.id, 'success', `项目冲突：覆盖云端 ${local.name}`)
      return true
    }
    // 采用云端：覆盖本地，不推送
    await applyRemoteProject(local.id, remote, remoteNow)
    await logEntity('conflict', 'project', local.id, 'success', `项目冲突：采用云端 ${remote.name}`)
    return false
  }

  if (decision === 'pull') {
    // 云端领先且本地未改：推送阶段不覆盖，等待用户拉取
    return false
  }

  // unchanged：确保本地基线对齐
  if (local.syncStatus !== 'synced') {
    await markProjectSynced(local.id, localNow)
  }
  return false
}

/**
 * 推送某项目的文件夹到 folders.json。
 * 合并远端 + 本地（按 ID union），冲突按 mergeStrategy 处理，写一次文件。
 */
async function pushProjectFolders(
  projectId: string,
  settings: SyncSettings,
  result: SyncResult
): Promise<void> {
  const localFolders = await db.folders.where('projectId').equals(projectId).toArray()
  const remoteFolders = await fetchRemoteFolders(projectId)

  // 无本地文件夹且无远端文件夹：不写文件
  if (localFolders.length === 0 && !remoteFolders) return

  const remoteById = new Map((remoteFolders || []).map((f) => [f.id, f]))

  // 合并：以本地为主，补充远端独有的
  const merged: DiagramFolder[] = []
  const seenIds = new Set<string>()

  // 1. 本地文件夹
  for (const local of localFolders) {
    seenIds.add(local.id)
    const remote = remoteById.get(local.id)
    if (!remote) {
      // 本地独有 -> 推送
      merged.push(stripSyncFields(local))
      const checksum = await calculateFolderChecksum(local)
      await db.folders.update(local.id, {
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
        localChecksum: checksum,
        remoteChecksum: checksum,
        syncError: undefined,
      })
      result.pushed++
      await logEntity('push', 'folder', local.id, 'success', `推送文件夹：${local.name}`)
      continue
    }

    const localChecksum = await calculateFolderChecksum(local)
    const remoteChecksum = await calculateFolderChecksum(remote)
    if (localChecksum === remoteChecksum) {
      merged.push(stripSyncFields(local))
      continue
    }

    // 冲突
    const keep = decideKeepVersion(settings.mergeStrategy, local, remote)
    if (keep === null) {
      await db.folders.update(local.id, {
        syncStatus: 'conflict',
        syncError: '冲突：本地与云端都有修改',
      })
      result.conflicts++
      await logEntity('conflict', 'folder', local.id, 'failed', `文件夹冲突待手动解决：${local.name}`)
      // 冲突时保留本地版本写入（用户可后续手动解决）
      merged.push(stripSyncFields(local))
    } else if (keep === 'local') {
      merged.push(stripSyncFields(local))
      await db.folders.update(local.id, {
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
        localChecksum,
        remoteChecksum: localChecksum,
        syncError: undefined,
      })
      result.pushed++
      await logEntity('push', 'folder', local.id, 'success', `推送文件夹：${local.name}`)
    } else {
      // 采用云端
      merged.push(stripSyncFields(remote))
      await db.folders.update(local.id, {
        parentId: remote.parentId,
        name: remote.name,
        order: remote.order,
        updatedAt: remote.updatedAt,
        syncStatus: 'synced',
        lastSyncTime: Date.now(),
        localChecksum: remoteChecksum,
        remoteChecksum: remoteChecksum,
        syncError: undefined,
      })
      result.pulled++
      await logEntity('pull', 'folder', local.id, 'success', `拉取文件夹：${remote.name}`)
    }
  }

  // 2. 远端独有（本地没有）-> 保留到 merged，并写入本地
  for (const remote of remoteFolders || []) {
    if (seenIds.has(remote.id)) continue
    merged.push(stripSyncFields(remote))
    const checksum = await calculateFolderChecksum(remote)
    await db.folders.add({
      ...remote,
      syncStatus: 'synced',
      lastSyncTime: Date.now(),
      localChecksum: checksum,
      remoteChecksum: checksum,
      syncError: undefined,
    })
    result.pulled++
    await logEntity('pull', 'folder', remote.id, 'success', `拉取新文件夹：${remote.name}`)
  }

  // 写入 folders.json（一次）
  const data = {
    version: '1.0.0',
    folders: merged,
  }
  await putFile(PATHS.FOLDERS_JSON(projectId), JSON.stringify(data, null, 2), `Sync folders: ${projectId}`)
}

async function pushDiagram(
  local: Diagram,
  remote: { path: string; sha: string } | undefined,
  settings: SyncSettings,
  result: SyncResult
): Promise<void> {
  const localNow = await calculateDiagramChecksum(local)
  const localChanged = localNow !== local.localChecksum
  const remoteChanged = (remote?.sha ?? undefined) !== local.remoteSha
  const decision = remote
    ? decideFromFlags(localChanged, remoteChanged)
    : localChanged || !local.remoteSha
      ? 'push'
      : 'unchanged'

  if (decision === 'push') {
    await uploadDiagram(local, localNow, result)
    return
  }

  if (decision === 'conflict') {
    const remoteDiagram = remote
      ? await fetchRemoteDiagram(remote.path, local.projectId, local.id)
      : null
    const keep = decideKeepVersion(settings.mergeStrategy, local, remoteDiagram || local)
    if (keep === null || (!remoteDiagram && keep === 'remote')) {
      await db.diagrams.update(local.id, {
        syncStatus: 'conflict',
        syncError: '冲突：云端有新变更，请先拉取',
      })
      result.conflicts++
      await logEntity('conflict', 'diagram', local.id, 'failed', `图表冲突（云端领先）：${local.name}`)
    } else if (keep === 'local') {
      await uploadDiagram(local, localNow, result)
    } else if (remoteDiagram && remote) {
      await applyRemoteDiagram(local, remoteDiagram, remote.sha)
      await logEntity('conflict', 'diagram', local.id, 'success', `图表冲突：采用云端 ${remoteDiagram.name}`)
    }
    return
  }

  // pull / unchanged：推送阶段不处理
}

async function uploadDiagram(local: Diagram, checksum: string, result: SyncResult): Promise<void> {
  const remotePath = getDiagramRemotePath(local)
  let put: { sha: string; url: string }

  if (isImageType(local.type)) {
    put = await putFileBase64(remotePath, getPngDataUrlBase64(local.source), `Sync diagram: ${local.name}`)
    await putFile(
      getMetaSidecarPath(remotePath),
      JSON.stringify(buildDiagramMeta(local), null, 2),
      `Sync diagram metadata: ${local.name}`
    )
  } else {
    put = await putFile(remotePath, formatDiagramContent(local), `Sync diagram: ${local.name}`)
  }

  await db.diagrams.update(local.id, {
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    remoteSha: put.sha,
    syncError: undefined,
  })
  result.pushed++
  await logEntity('push', 'diagram', local.id, 'success', `推送图表：${local.name}`)
}

// ============ 远端读取 ============

/**
 * 获取远端项目列表（来自 projects.json）
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
 * 获取某项目下的远端文件夹列表（来自 folders.json）
 */
async function fetchRemoteFolders(projectId: string): Promise<DiagramFolder[] | null> {
  try {
    const file = await getFile(PATHS.FOLDERS_JSON(projectId))
    if (!file?.content) return null

    const data = JSON.parse(file.content)
    if (!data.folders || !Array.isArray(data.folders)) return null

    return data.folders as DiagramFolder[]
  } catch {
    // 文件不存在或解析失败
    return null
  }
}

/**
 * 列出某项目下所有图表文件的当前 git blob SHA（免下载检测变更）
 */
async function listRemoteDiagramShas(
  projectId: string
): Promise<Map<string, { path: string; sha: string }>> {
  const map = new Map<string, { path: string; sha: string }>()
  try {
    const files = await listDirectory(PATHS.DIAGRAMS_DIR(projectId))
    for (const f of files) {
      if (isMetaSidecarPath(f.path)) continue
      map.set(fileNameToId(f.path), { path: f.path, sha: f.sha })
    }
  } catch {
    // 目录不存在
  }
  return map
}

/**
 * 拉取并解析单个远端图表文件
 */
async function fetchRemoteDiagram(
  path: string,
  projectId: string,
  diagramId: string
): Promise<Diagram | null> {
  const type = getDiagramTypeFromFilename(path) || 'mermaid'

  if (isImageType(type)) {
    return fetchRemoteImageDiagram(path, projectId, diagramId, type)
  }

  const file = await getFile(path)
  if (!file?.content) return null

  return parseDiagramFile(file.content, projectId, diagramId, type)
}

/**
 * 拉取并解析二进制图片图表（png/jpg/webp）。
 * 图片文件本身是纯二进制，无法像文本类型那样在文件内嵌入 frontmatter 元数据，
 * 因此 name/createdAt/folderId/config 等元数据存放在同路径的 sidecar
 * `<file>.meta.json` 中；sidecar 缺失时退化为仅用文件名还原 id。
 */
async function fetchRemoteImageDiagram(
  path: string,
  projectId: string,
  diagramId: string,
  type: 'png' | 'jpg' | 'webp'
): Promise<Diagram | null> {
  const file = await getFileBase64(path)
  if (!file?.base64Content) return null

  const meta = await fetchDiagramSidecarMeta(getMetaSidecarPath(path))

  return {
    id: (meta?.id as string) || diagramId,
    projectId: (meta?.projectId as string) || projectId,
    name: (meta?.name as string) || 'Untitled',
    type,
    source: buildImageDataUrl(type, file.base64Content),
    config: meta?.config as Diagram['config'],
    folderId: meta && 'folderId' in meta
      ? (meta.folderId === null ? null : (meta.folderId as string))
      : undefined,
    createdAt: meta?.createdAt ? new Date(meta.createdAt as string).getTime() : Date.now(),
    updatedAt: meta?.updatedAt ? new Date(meta.updatedAt as string).getTime() : Date.now(),
  }
}

function getMetaSidecarPath(path: string): string {
  return `${path}.meta.json`
}

function isMetaSidecarPath(path: string): boolean {
  return path.endsWith('.meta.json')
}

async function fetchDiagramSidecarMeta(path: string): Promise<Record<string, unknown> | null> {
  try {
    const file = await getFile(path)
    if (!file?.content) return null
    return JSON.parse(file.content)
  } catch {
    return null
  }
}

// ============ 本地写入辅助 ============

async function markProjectSynced(id: string, checksum: string): Promise<void> {
  await db.projects.update(id, {
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    syncError: undefined,
  })
}

/**
 * 用远端项目数据覆盖本地（保留本地专属字段如 order）
 */
async function applyRemoteProject(id: string, remote: Project, checksum: string): Promise<void> {
  await db.projects.update(id, {
    name: remote.name,
    description: remote.description,
    tags: remote.tags,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    syncError: undefined,
  })
}

/**
 * 用远端图表数据覆盖本地（保留本地专属字段如 order；
 * folderId 优先采用远端值，远端缺失时保留本地）
 */
async function applyRemoteDiagram(local: Diagram, remote: Diagram, remoteSha: string): Promise<void> {
  const folderId = remote.folderId !== undefined ? remote.folderId : local.folderId
  const merged: Diagram = {
    ...local,
    name: remote.name,
    type: remote.type,
    source: remote.source,
    config: remote.config,
    folderId,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
  }
  const checksum = await calculateDiagramChecksum(merged)

  await db.diagrams.update(local.id, {
    name: remote.name,
    type: remote.type,
    source: remote.source,
    config: remote.config,
    folderId,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    localChecksum: checksum,
    remoteChecksum: checksum,
    remoteSha,
    syncError: undefined,
  })
}

// ============ 图表内容序列化 / 反序列化 ============

function getDiagramRemotePath(diagram: Diagram): string {
  const extension = getDiagramFileExtension(diagram.type)
  return `${PATHS.DIAGRAMS_DIR(diagram.projectId)}/${diagram.id}.${extension}`
}

function fileNameToId(path: string): string {
  const fileName = path.split('/').pop() || ''
  return fileName.replace(/\.[^.]+$/, '')
}

function buildDiagramMeta(diagram: Diagram) {
  return {
    id: diagram.id,
    name: diagram.name,
    projectId: diagram.projectId,
    folderId: diagram.folderId ?? null,
    createdAt: new Date(diagram.createdAt).toISOString(),
    updatedAt: new Date(diagram.updatedAt).toISOString(),
    config: diagram.config || {},
  }
}

function formatDiagramContent(diagram: Diagram): string {
  if (diagram.type === 'html' || diagram.type === 'svg' || isImageType(diagram.type)) {
    return diagram.source
  }

  const meta = buildDiagramMeta(diagram)

  return `---
meta:
  id: ${meta.id}
  name: ${meta.name}
  projectId: ${meta.projectId}
  folderId: ${meta.folderId}
  createdAt: ${meta.createdAt}
  updatedAt: ${meta.updatedAt}
config: ${JSON.stringify(diagram.config || {})}
---
${diagram.source}`
}

/**
 * 解析图表文件内容为 Diagram
 */
function parseDiagramFile(
  content: string,
  projectId: string,
  diagramId: string,
  type: Diagram['type']
): Diagram | null {
  // 带 frontmatter（mermaid / markdown / txt）
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (frontmatterMatch) {
    const meta = parseFrontmatter(frontmatterMatch[1])
    const source = frontmatterMatch[2]

    return {
      id: meta.id || diagramId,
      projectId: meta.projectId || projectId,
      name: meta.name || 'Untitled',
      type,
      source,
      config: meta.config ? safeJsonParse(meta.config) : undefined,
      folderId: meta.folderId !== undefined
        ? (meta.folderId === 'null' ? null : meta.folderId)
        : undefined,
      createdAt: meta.createdAt ? new Date(meta.createdAt).getTime() : Date.now(),
      updatedAt: meta.updatedAt ? new Date(meta.updatedAt).getTime() : Date.now(),
    }
  }

  // 无 frontmatter（html / svg 或纯源码）：以文件名作为 id
  return {
    id: diagramId,
    projectId,
    name: 'Untitled',
    type,
    source: content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function safeJsonParse(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = raw.split('\n')

  let inMeta = false
  for (const line of lines) {
    if (line.trim() === 'meta:') {
      inMeta = true
      continue
    }
    if (line.startsWith('config:')) {
      inMeta = false
      result.config = line.replace('config:', '').trim()
      continue
    }
    if (inMeta && line.startsWith('  ')) {
      const match = line.match(/^\s+(\w+):\s*(.*)$/)
      if (match) {
        result[match[1]] = match[2]
      }
    }
  }

  return result
}

/**
 * 去除 folder 的同步专用字段，只保留核心数据用于序列化到远端
 */
function stripSyncFields(folder: DiagramFolder): DiagramFolder {
  return {
    id: folder.id,
    projectId: folder.projectId,
    parentId: folder.parentId,
    name: folder.name,
    order: folder.order,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }
}

/**
 * 更新 projects.json 文件（一次同步只调用一次）。
 * 对处于冲突（未解决）状态的项目，保留云端现有元数据，避免被本地覆盖。
 */
async function updateProjectsJson(remoteProjects?: Map<string, Project>): Promise<void> {
  const projects = await db.projects.toArray()
  const data = {
    version: '1.0.0',
    lastSync: new Date().toISOString(),
    projects: projects.map((p) => {
      const src =
        p.syncStatus === 'conflict' && remoteProjects?.get(p.id)
          ? remoteProjects.get(p.id)!
          : p
      return {
        id: src.id,
        name: src.name,
        description: src.description,
        tags: src.tags,
        createdAt: src.createdAt,
        updatedAt: src.updatedAt,
      }
    }),
  }

  await putFile(PATHS.PROJECTS_JSON, JSON.stringify(data, null, 2), 'Update projects list')
}

// ============ 杂项 ============

async function updateLastSyncTime(): Promise<void> {
  localStorage.setItem('lastSyncTime', Date.now().toString())
}

async function logEntity(
  operation: SyncLogEntry['operation'],
  entityType: SyncLogEntry['entityType'],
  entityId: string,
  status: SyncLogEntry['status'],
  message: string
): Promise<void> {
  await db.syncLog.add({
    timestamp: Date.now(),
    operation,
    entityType,
    entityId,
    status,
    message,
  })
}

async function logSyncResult(direction: SyncDirection, result: SyncResult): Promise<void> {
  const label = direction === 'pull' ? '拉取' : direction === 'push' ? '推送' : '同步'
  const logEntry: SyncLogEntry = {
    timestamp: Date.now(),
    operation: direction === 'pull' ? 'pull' : 'push',
    entityType: 'project',
    entityId: 'sync-all',
    status: result.success ? 'success' : 'failed',
    message: `${label}完成 · 推送 ${result.pushed} · 拉取 ${result.pulled} · 冲突 ${result.conflicts}${
      result.errors.length ? ` · 错误 ${result.errors.length}` : ''
    }`,
    details: {
      direction,
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
    sync(settings)
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
