/**
 * 同步通知 Hook
 * 监听同步状态变化并显示 Toast 通知
 */

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useSyncStore } from '@/stores/syncStore'

export function useSyncNotifications() {
  const {
    isAuthenticated,
    isSyncing,
    syncError,
    lastSyncTime,
    stats,
  } = useSyncStore()

  // 使用 ref 跟踪上一次的状态
  const prevState = useRef({
    isAuthenticated: false,
    isSyncing: false,
    syncError: null as string | null,
    lastSyncTime: null as number | null,
    conflictItems: 0,
  })

  useEffect(() => {
    const prev = prevState.current

    // 连接成功通知
    if (!prev.isAuthenticated && isAuthenticated) {
      toast.success('GitHub 连接成功', {
        description: '您的数据将自动同步到云端',
      })
    }

    // 断开连接通知
    if (prev.isAuthenticated && !isAuthenticated) {
      toast.info('已断开 GitHub 连接')
    }

    // 同步开始通知
    if (!prev.isSyncing && isSyncing) {
      toast.loading('正在同步...', {
        id: 'sync-progress',
      })
    }

    // 同步完成通知
    if (prev.isSyncing && !isSyncing) {
      toast.dismiss('sync-progress')

      if (syncError) {
        toast.error('同步失败', {
          description: syncError,
        })
      } else if (lastSyncTime && lastSyncTime !== prev.lastSyncTime) {
        toast.success('同步完成', {
          description: `已同步 ${stats.syncedProjects} 个项目和 ${stats.syncedDiagrams} 个图表`,
        })
      }
    }

    // 新冲突通知
    if (stats.conflictItems > prev.conflictItems) {
      const newConflicts = stats.conflictItems - prev.conflictItems
      toast.warning(`发现 ${newConflicts} 个新冲突`, {
        description: '请前往设置页面解决冲突',
        action: {
          label: '查看',
          onClick: () => {
            // 可以在这里添加导航到设置页面的逻辑
          },
        },
      })
    }

    // 更新 ref
    prevState.current = {
      isAuthenticated,
      isSyncing,
      syncError,
      lastSyncTime,
      conflictItems: stats.conflictItems,
    }
  }, [isAuthenticated, isSyncing, syncError, lastSyncTime, stats])
}
