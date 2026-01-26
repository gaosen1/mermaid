/**
 * 同步队列管理模块
 * 负责管理待同步操作的队列，支持优先级、重试和持久化
 */

import { db } from '@/db'
import type { SyncQueueItem } from '@/types/sync'
import type { EntityType } from './dataSync'

// 优先级常量
export const PRIORITY = {
  HIGH: 1, // 项目元数据
  MEDIUM: 2, // 图表数据
  LOW: 3, // 快照历史
} as const

// 默认最大重试次数
const DEFAULT_MAX_RETRIES = 3

// 重试延迟（毫秒）
const RETRY_DELAYS = [1000, 5000, 30000] // 1秒, 5秒, 30秒

/**
 * 添加同步任务到队列
 */
export async function enqueue(
  entityType: EntityType,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  priority?: number
): Promise<number> {
  // 检查是否已存在相同的任务
  const existing = await db.syncQueue
    .where({ entityType, entityId })
    .first()

  if (existing) {
    // 更新现有任务
    await db.syncQueue.update(existing.id!, {
      operation,
      priority: priority ?? existing.priority,
      lastAttempt: undefined,
      error: undefined,
    })
    return existing.id!
  }

  // 确定优先级
  const finalPriority = priority ?? getPriorityForEntity(entityType)

  // 创建新任务
  const item: SyncQueueItem = {
    entityType,
    entityId,
    operation,
    priority: finalPriority,
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
    createdAt: Date.now(),
  }

  return await db.syncQueue.add(item)
}

/**
 * 根据实体类型获取默认优先级
 */
function getPriorityForEntity(entityType: EntityType): number {
  switch (entityType) {
    case 'project':
      return PRIORITY.HIGH
    case 'diagram':
      return PRIORITY.MEDIUM
    case 'snapshot':
      return PRIORITY.LOW
    default:
      return PRIORITY.MEDIUM
  }
}

/**
 * 获取下一个待处理的任务
 */
export async function dequeue(): Promise<SyncQueueItem | null> {
  const now = Date.now()

  // 按优先级和创建时间排序，获取第一个可处理的任务
  const items = await db.syncQueue
    .orderBy('priority')
    .filter((item) => {
      // 跳过已达到最大重试次数的任务
      if (item.retryCount >= item.maxRetries) {
        return false
      }
      // 检查重试延迟
      if (item.lastAttempt) {
        const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)]
        if (now - item.lastAttempt < delay) {
          return false
        }
      }
      return true
    })
    .first()

  return items || null
}

/**
 * 标记任务完成并从队列中移除
 */
export async function complete(id: number): Promise<void> {
  await db.syncQueue.delete(id)
}

/**
 * 标记任务失败，增加重试计数
 */
export async function fail(id: number, error: string): Promise<void> {
  const item = await db.syncQueue.get(id)
  if (!item) return

  await db.syncQueue.update(id, {
    retryCount: item.retryCount + 1,
    lastAttempt: Date.now(),
    error,
  })
}

/**
 * 获取队列中的所有任务
 */
export async function getAll(): Promise<SyncQueueItem[]> {
  return await db.syncQueue.orderBy('priority').toArray()
}

/**
 * 获取队列长度
 */
export async function getQueueLength(): Promise<number> {
  return await db.syncQueue.count()
}

/**
 * 获取失败的任务（已达到最大重试次数）
 */
export async function getFailedItems(): Promise<SyncQueueItem[]> {
  return await db.syncQueue
    .filter((item) => item.retryCount >= item.maxRetries)
    .toArray()
}

/**
 * 清除所有失败的任务
 */
export async function clearFailed(): Promise<number> {
  const failed = await getFailedItems()
  const ids = failed.map((item) => item.id!).filter(Boolean)
  await db.syncQueue.bulkDelete(ids)
  return ids.length
}

/**
 * 清空整个队列
 */
export async function clearAll(): Promise<void> {
  await db.syncQueue.clear()
}

/**
 * 重置失败任务的重试计数
 */
export async function retryFailed(): Promise<number> {
  const failed = await getFailedItems()
  let count = 0

  for (const item of failed) {
    if (item.id) {
      await db.syncQueue.update(item.id, {
        retryCount: 0,
        lastAttempt: undefined,
        error: undefined,
      })
      count++
    }
  }

  return count
}

/**
 * 移除特定实体的所有任务
 */
export async function removeByEntity(
  entityType: EntityType,
  entityId: string
): Promise<void> {
  await db.syncQueue.where({ entityType, entityId }).delete()
}
