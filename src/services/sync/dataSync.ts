/**
 * 数据差异计算模块
 * 负责计算本地和远端数据的差异，生成校验和
 */

import type { Project, Diagram, DiagramFolder, Snapshot } from '@/types'

export type EntityType = 'project' | 'diagram' | 'folder' | 'snapshot'

export type DiffType = 'create' | 'update' | 'delete' | 'conflict' | 'unchanged'

export interface DiffResult<T> {
  type: DiffType
  entityType: EntityType
  entityId: string
  local?: T
  remote?: T
  localChecksum?: string
  remoteChecksum?: string
}

export interface ProjectDiff extends DiffResult<Project> {
  entityType: 'project'
}

export interface DiagramDiff extends DiffResult<Diagram> {
  entityType: 'diagram'
}

export interface FolderDiff extends DiffResult<DiagramFolder> {
  entityType: 'folder'
}

export interface SnapshotDiff extends DiffResult<Snapshot> {
  entityType: 'snapshot'
}

/**
 * 计算字符串的 SHA-256 校验和
 */
export async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 计算 Project 的校验和
 * 只包含核心字段，排除同步相关字段
 */
export async function calculateProjectChecksum(project: Project): Promise<string> {
  const coreData = {
    id: project.id,
    name: project.name,
    description: project.description,
    tags: project.tags,
    order: project.order,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
  return calculateChecksum(JSON.stringify(coreData))
}

/**
 * 计算 Diagram 的校验和
 */
export async function calculateDiagramChecksum(diagram: Diagram): Promise<string> {
  const coreData = {
    id: diagram.id,
    projectId: diagram.projectId,
    folderId: diagram.folderId ?? null,
    name: diagram.name,
    type: diagram.type,
    source: diagram.source,
    config: diagram.config,
    order: diagram.order,
    createdAt: diagram.createdAt,
    updatedAt: diagram.updatedAt,
  }
  return calculateChecksum(JSON.stringify(coreData))
}

/**
 * 计算 DiagramFolder 的校验和
 */
export async function calculateFolderChecksum(folder: DiagramFolder): Promise<string> {
  const coreData = {
    id: folder.id,
    projectId: folder.projectId,
    parentId: folder.parentId ?? null,
    name: folder.name,
    order: folder.order ?? 0,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  }
  return calculateChecksum(JSON.stringify(coreData))
}

/**
 * 计算 Snapshot 的校验和
 */
export async function calculateSnapshotChecksum(snapshot: Snapshot): Promise<string> {
  const coreData = {
    id: snapshot.id,
    diagramId: snapshot.diagramId,
    source: snapshot.source,
    description: snapshot.description,
    createdAt: snapshot.createdAt,
    isAuto: snapshot.isAuto,
  }
  return calculateChecksum(JSON.stringify(coreData))
}

/**
 * 三路合并决策（git 三方合并模型）
 *
 * base      = 上次同步成功时的内容标识（共同祖先）
 * localNow  = 当前本地内容标识
 * remoteNow = 当前云端内容标识
 *
 * 返回：
 * - unchanged  两边都没动
 * - push       仅本地改动 -> 推送
 * - pull       仅云端改动 -> 拉取
 * - conflict   双改且内容不一致 -> 需按合并策略处理
 */
export type ThreeWayDecision = 'unchanged' | 'push' | 'pull' | 'conflict'

export function threeWayDecision(
  base: string | undefined,
  localNow: string | undefined,
  remoteNow: string | undefined
): ThreeWayDecision {
  const localChanged = localNow !== base
  const remoteChanged = remoteNow !== base

  if (!localChanged && !remoteChanged) return 'unchanged'
  if (localChanged && !remoteChanged) return 'push'
  if (!localChanged && remoteChanged) return 'pull'

  // 双改：内容一致视为已对齐，否则冲突
  if (localNow === remoteNow) return 'unchanged'
  return 'conflict'
}

/**
 * 当本地与远端使用不同的变更标识（如本地用 SHA-256 checksum、
 * 远端用 git blob SHA）时，直接用「是否变化」两个布尔量判定。
 */
export function decideFromFlags(
  localChanged: boolean,
  remoteChanged: boolean
): ThreeWayDecision {
  if (!localChanged && !remoteChanged) return 'unchanged'
  if (localChanged && !remoteChanged) return 'push'
  if (!localChanged && remoteChanged) return 'pull'
  return 'conflict'
}

/**
 * 比较两个 Project，返回差异类型
 */
export async function compareProjects(
  local: Project | null,
  remote: Project | null
): Promise<ProjectDiff> {
  // 本地有，远端无 -> 创建
  if (local && !remote) {
    const checksum = await calculateProjectChecksum(local)
    return {
      type: 'create',
      entityType: 'project',
      entityId: local.id,
      local,
      localChecksum: checksum,
    }
  }

  // 本地无，远端有 -> 删除（或需要拉取）
  if (!local && remote) {
    const checksum = await calculateProjectChecksum(remote)
    return {
      type: 'delete',
      entityType: 'project',
      entityId: remote.id,
      remote,
      remoteChecksum: checksum,
    }
  }

  // 两边都有
  if (local && remote) {
    const localChecksum = await calculateProjectChecksum(local)
    const remoteChecksum = await calculateProjectChecksum(remote)

    // 校验和相同 -> 无变化
    if (localChecksum === remoteChecksum) {
      return {
        type: 'unchanged',
        entityType: 'project',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    // 校验和不同，检查是否冲突
    // 如果本地有未同步的修改且远端也有修改 -> 冲突
    if (
      local.syncStatus === 'pending' &&
      local.remoteChecksum &&
      local.remoteChecksum !== remoteChecksum
    ) {
      return {
        type: 'conflict',
        entityType: 'project',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    // 否则是普通更新
    return {
      type: 'update',
      entityType: 'project',
      entityId: local.id,
      local,
      remote,
      localChecksum,
      remoteChecksum,
    }
  }

  // 不应该到达这里
  throw new Error('Invalid comparison state')
}

/**
 * 比较两个 Diagram，返回差异类型
 */
export async function compareDiagrams(
  local: Diagram | null,
  remote: Diagram | null
): Promise<DiagramDiff> {
  if (local && !remote) {
    const checksum = await calculateDiagramChecksum(local)
    return {
      type: 'create',
      entityType: 'diagram',
      entityId: local.id,
      local,
      localChecksum: checksum,
    }
  }

  if (!local && remote) {
    const checksum = await calculateDiagramChecksum(remote)
    return {
      type: 'delete',
      entityType: 'diagram',
      entityId: remote.id,
      remote,
      remoteChecksum: checksum,
    }
  }

  if (local && remote) {
    const localChecksum = await calculateDiagramChecksum(local)
    const remoteChecksum = await calculateDiagramChecksum(remote)

    if (localChecksum === remoteChecksum) {
      return {
        type: 'unchanged',
        entityType: 'diagram',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    if (
      local.syncStatus === 'pending' &&
      local.remoteChecksum &&
      local.remoteChecksum !== remoteChecksum
    ) {
      return {
        type: 'conflict',
        entityType: 'diagram',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    return {
      type: 'update',
      entityType: 'diagram',
      entityId: local.id,
      local,
      remote,
      localChecksum,
      remoteChecksum,
    }
  }

  throw new Error('Invalid comparison state')
}

/**
 * 比较两个 DiagramFolder，返回差异类型
 */
export async function compareFolders(
  local: DiagramFolder | null,
  remote: DiagramFolder | null
): Promise<FolderDiff> {
  if (local && !remote) {
    const checksum = await calculateFolderChecksum(local)
    return {
      type: 'create',
      entityType: 'folder',
      entityId: local.id,
      local,
      localChecksum: checksum,
    }
  }

  if (!local && remote) {
    const checksum = await calculateFolderChecksum(remote)
    return {
      type: 'delete',
      entityType: 'folder',
      entityId: remote.id,
      remote,
      remoteChecksum: checksum,
    }
  }

  if (local && remote) {
    const localChecksum = await calculateFolderChecksum(local)
    const remoteChecksum = await calculateFolderChecksum(remote)

    if (localChecksum === remoteChecksum) {
      return {
        type: 'unchanged',
        entityType: 'folder',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    if (
      local.syncStatus === 'pending' &&
      local.remoteChecksum &&
      local.remoteChecksum !== remoteChecksum
    ) {
      return {
        type: 'conflict',
        entityType: 'folder',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    return {
      type: 'update',
      entityType: 'folder',
      entityId: local.id,
      local,
      remote,
      localChecksum,
      remoteChecksum,
    }
  }

  throw new Error('Invalid comparison state')
}

/**
 * 比较两个 Snapshot，返回差异类型
 */
export async function compareSnapshots(
  local: Snapshot | null,
  remote: Snapshot | null
): Promise<SnapshotDiff> {
  if (local && !remote) {
    const checksum = await calculateSnapshotChecksum(local)
    return {
      type: 'create',
      entityType: 'snapshot',
      entityId: local.id,
      local,
      localChecksum: checksum,
    }
  }

  if (!local && remote) {
    const checksum = await calculateSnapshotChecksum(remote)
    return {
      type: 'delete',
      entityType: 'snapshot',
      entityId: remote.id,
      remote,
      remoteChecksum: checksum,
    }
  }

  if (local && remote) {
    const localChecksum = await calculateSnapshotChecksum(local)
    const remoteChecksum = await calculateSnapshotChecksum(remote)

    if (localChecksum === remoteChecksum) {
      return {
        type: 'unchanged',
        entityType: 'snapshot',
        entityId: local.id,
        local,
        remote,
        localChecksum,
        remoteChecksum,
      }
    }

    // Snapshot 通常不会冲突，因为它们是不可变的
    return {
      type: 'update',
      entityType: 'snapshot',
      entityId: local.id,
      local,
      remote,
      localChecksum,
      remoteChecksum,
    }
  }

  throw new Error('Invalid comparison state')
}

/**
 * 判断本地数据是否需要推送
 */
export function needsPush(diff: DiffResult<unknown>): boolean {
  return diff.type === 'create' || (diff.type === 'update' && !!diff.local)
}

/**
 * 判断是否需要从远端拉取
 */
export function needsPull(diff: DiffResult<unknown>): boolean {
  return diff.type === 'delete' || (diff.type === 'update' && !!diff.remote)
}

/**
 * 判断是否存在冲突
 */
export function hasConflict(diff: DiffResult<unknown>): boolean {
  return diff.type === 'conflict'
}
