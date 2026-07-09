/**
 * 冲突解决模块
 * 负责检测和解决本地与远端数据的冲突
 */

import { db } from '@/db'
import type { Project, Diagram } from '@/types'
import type { SyncLogEntry, MergeStrategy } from '@/types/sync'
import type { DiffResult, EntityType } from './dataSync'

export interface ConflictInfo<T = unknown> {
  entityType: EntityType
  entityId: string
  local: T
  remote: T
  localChecksum: string
  remoteChecksum: string
  detectedAt: number
}

export interface ConflictResolution {
  entityType: EntityType
  entityId: string
  strategy: MergeStrategy
  resolvedAt: number
  keepVersion: 'local' | 'remote'
}

/**
 * 判断在给定合并策略下应保留哪一侧。
 * manual 策略无法自动决定，返回 null，交由 UI 逐条处理。
 */
export function decideKeepVersion<T extends { updatedAt?: number }>(
  strategy: MergeStrategy,
  local: T,
  remote: T
): 'local' | 'remote' | null {
  switch (strategy) {
    case 'ours':
      return 'local'
    case 'theirs':
      return 'remote'
    case 'newest':
      return (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? 'local' : 'remote'
    case 'manual':
    default:
      return null
  }
}

/**
 * 检测是否存在冲突
 */
export function detectConflict<T>(diff: DiffResult<T>): boolean {
  return diff.type === 'conflict'
}

/**
 * 从差异结果创建冲突信息
 */
export function createConflictInfo<T>(diff: DiffResult<T>): ConflictInfo<T> | null {
  if (diff.type !== 'conflict' || !diff.local || !diff.remote) {
    return null
  }

  return {
    entityType: diff.entityType,
    entityId: diff.entityId,
    local: diff.local,
    remote: diff.remote,
    localChecksum: diff.localChecksum || '',
    remoteChecksum: diff.remoteChecksum || '',
    detectedAt: Date.now(),
  }
}

/**
 * 记录一次冲突解决（保留某一侧），并返回解决结果。
 * keepVersion 由调用方（自动策略或用户手动）给出。
 */
export async function resolveConflict<T>(
  conflict: ConflictInfo<T>,
  keepVersion: 'local' | 'remote',
  strategy: MergeStrategy = 'manual'
): Promise<ConflictResolution> {
  // 记录冲突解决日志
  await logConflictResolution(conflict, keepVersion)

  return {
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    strategy,
    resolvedAt: Date.now(),
    keepVersion,
  }
}

/**
 * 记录冲突解决日志
 */
async function logConflictResolution<T>(
  conflict: ConflictInfo<T>,
  keepVersion: 'local' | 'remote'
): Promise<void> {
  const logEntry: SyncLogEntry = {
    timestamp: Date.now(),
    operation: 'conflict',
    entityType: conflict.entityType,
    entityId: conflict.entityId,
    status: 'success',
    message: `Conflict resolved: kept ${keepVersion} version`,
    details: {
      localChecksum: conflict.localChecksum,
      remoteChecksum: conflict.remoteChecksum,
      keepVersion,
    },
  }

  await db.syncLog.add(logEntry)
}

/**
 * 应用冲突解决结果到 Project
 */
export async function applyProjectResolution(
  resolution: ConflictResolution,
  localData: Project,
  remoteData: Project
): Promise<Project> {
  const data = resolution.keepVersion === 'local' ? localData : remoteData

  await db.projects.update(resolution.entityId, {
    ...data,
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    syncError: undefined,
  })

  return data
}

/**
 * 应用冲突解决结果到 Diagram
 */
export async function applyDiagramResolution(
  resolution: ConflictResolution,
  localData: Diagram,
  remoteData: Diagram
): Promise<Diagram> {
  const data = resolution.keepVersion === 'local' ? localData : remoteData

  await db.diagrams.update(resolution.entityId, {
    ...data,
    syncStatus: 'synced',
    lastSyncTime: Date.now(),
    syncError: undefined,
  })

  return data
}
