/**
 * 同步状态面板组件
 * 显示连接状态、同步进度、实时统计数据
 */

import { useEffect, useState } from 'react'
import { useSyncStore } from '@/stores/syncStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Github,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  CloudOff,
  Loader2,
  FolderSync,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SyncStatusPanelProps {
  className?: string
  compact?: boolean
}

export function SyncStatusPanel({ className, compact = false }: SyncStatusPanelProps) {
  const {
    isAuthenticated,
    isConnecting,
    isSyncing,
    userLogin,
    lastSyncTime,
    syncError,
    stats,
    syncNow,
    refreshStats,
  } = useSyncStore()

  const [lastSyncDisplay, setLastSyncDisplay] = useState<string>('')

  // 更新最后同步时间显示
  useEffect(() => {
    const updateLastSync = () => {
      if (!lastSyncTime) {
        setLastSyncDisplay('从未同步')
        return
      }

      const diff = Date.now() - lastSyncTime
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)

      if (minutes < 1) {
        setLastSyncDisplay('刚刚')
      } else if (minutes < 60) {
        setLastSyncDisplay(`${minutes} 分钟前`)
      } else if (hours < 24) {
        setLastSyncDisplay(`${hours} 小时前`)
      } else {
        setLastSyncDisplay(`${days} 天前`)
      }
    }

    updateLastSync()
    const interval = setInterval(updateLastSync, 60000)
    return () => clearInterval(interval)
  }, [lastSyncTime])

  // 定期刷新统计
  useEffect(() => {
    if (isAuthenticated) {
      refreshStats()
      const interval = setInterval(refreshStats, 30000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, refreshStats])

  // 计算同步进度
  const totalItems = stats.totalProjects + stats.totalDiagrams
  const syncedItems = stats.syncedProjects + stats.syncedDiagrams
  const syncProgress = totalItems > 0 ? (syncedItems / totalItems) * 100 : 0

  // 获取状态颜色
  const getStatusColor = () => {
    if (!isAuthenticated) return 'text-muted-foreground'
    if (syncError || stats.errorItems > 0) return 'text-destructive'
    if (stats.conflictItems > 0) return 'text-yellow-500'
    if (syncProgress === 100) return 'text-green-500'
    return 'text-blue-500'
  }

  // 获取状态图标
  const getStatusIcon = () => {
    if (isConnecting || isSyncing) {
      return <Loader2 className="h-5 w-5 animate-spin" />
    }
    if (!isAuthenticated) {
      return <CloudOff className="h-5 w-5" />
    }
    if (syncError || stats.errorItems > 0) {
      return <AlertCircle className="h-5 w-5" />
    }
    if (stats.conflictItems > 0) {
      return <AlertTriangle className="h-5 w-5" />
    }
    return <CheckCircle2 className="h-5 w-5" />
  }

  // 获取状态文本
  const getStatusText = () => {
    if (isConnecting) return '连接中...'
    if (isSyncing) return '同步中...'
    if (!isAuthenticated) return '未连接'
    if (syncError) return '同步错误'
    if (stats.errorItems > 0) return `${stats.errorItems} 个错误`
    if (stats.conflictItems > 0) return `${stats.conflictItems} 个冲突`
    if (syncProgress === 100) return '已同步'
    return '部分同步'
  }

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <div className={cn('flex items-center gap-2', getStatusColor())}>
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
        {isAuthenticated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => syncNow()}
            disabled={isSyncing}
          >
            <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
          </Button>
        )}
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            <CardTitle className="text-base">同步状态</CardTitle>
          </div>
          {isAuthenticated && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncNow()}
              disabled={isSyncing}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isSyncing && 'animate-spin')} />
              {isSyncing ? '同步中...' : '立即同步'}
            </Button>
          )}
        </div>
        <CardDescription>
          {isAuthenticated ? `已连接: @${userLogin}` : '未连接到 GitHub'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 状态指示器 */}
        <div className="flex items-center justify-between">
          <div className={cn('flex items-center gap-2', getStatusColor())}>
            {getStatusIcon()}
            <span className="font-medium">{getStatusText()}</span>
          </div>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {lastSyncDisplay}
          </Badge>
        </div>

        {/* 错误信息 */}
        {syncError && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{syncError}</span>
          </div>
        )}

        {/* 同步进度 */}
        {isAuthenticated && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">同步进度</span>
                <span className="font-medium">{Math.round(syncProgress)}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>

            {/* 统计数据 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FolderSync className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">项目</p>
                  <p className="font-semibold">
                    {stats.syncedProjects}/{stats.totalProjects}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">图表</p>
                  <p className="font-semibold">
                    {stats.syncedDiagrams}/{stats.totalDiagrams}
                  </p>
                </div>
              </div>
            </div>

            {/* 问题统计 */}
            {(stats.pendingItems > 0 || stats.conflictItems > 0 || stats.errorItems > 0) && (
              <div className="flex flex-wrap gap-2">
                {stats.pendingItems > 0 && (
                  <Badge variant="secondary">
                    待同步: {stats.pendingItems}
                  </Badge>
                )}
                {stats.conflictItems > 0 && (
                  <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                    冲突: {stats.conflictItems}
                  </Badge>
                )}
                {stats.errorItems > 0 && (
                  <Badge variant="destructive">
                    错误: {stats.errorItems}
                  </Badge>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
