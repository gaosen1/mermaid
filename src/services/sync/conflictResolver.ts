/**
 * 冲突解决模块
 * 负责检测和解决本地与远端数据的冲突
 */

import { db } from '@/db'
import type { Project, Diagram } from '@/types'
import type { SyncLogEntry } from '@/types/sync'
import type { DiffResult, EntityType } from './dataSync'

export type ConflictStrategy = 'local' | 'remote' | 'ask'

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
  strategy: ConflictStrategy
  resolvedAt: number
  keepVersion: 'local' | 'remote'
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
 * 根据策略自动解决冲突
 */
export async function resolveConflict<T>(
  conflict: ConflictInfo<T>,
  strategy: ConflictStrategy
): Promise<ConflictResolution> {
  const keepVersion = strategy === 'local' ? 'local' : 'remote'

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
