/**
 * 同步队列面板组件
 * 显示待同步队列、同步历史和错误日志
 */

import { useEffect, useState } from 'react'
import { db } from '@/db'
import { useSyncStore } from '@/stores/syncStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ListTodo,
  History,
  AlertCircle,
  Trash2,
  RefreshCw,
  Clock,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FolderSync,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncLogEntry } from '@/types/sync'

interface SyncQueuePanelProps {
  className?: string
}

// 待推送的本地变更（由本地实体状态推导，而非独立队列表）
interface PendingChange {
  entityType: 'project' | 'diagram'
  entityId: string
  name: string
  operation: 'create' | 'update'
  status: 'pending' | 'conflict' | 'error'
  updatedAt: number
}

export function SyncQueuePanel({ className }: SyncQueuePanelProps) {
  const { isAuthenticated, isSyncing, pushNow, refreshStats } = useSyncStore()
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [logEntries, setLogEntries] = useState<SyncLogEntry[]>([])
  const [activeTab, setActiveTab] = useState('queue')

  // 计算「待推送变更」：自上次同步后被修改、或处于冲突/错误状态的实体
  const loadData = async () => {
    const [projects, diagrams, logs] = await Promise.all([
      db.projects.toArray(),
      db.diagrams.toArray(),
      db.syncLog.orderBy('timestamp').reverse().limit(100).toArray(),
    ])

    const changes: PendingChange[] = []

    const isDirty = (e: { syncStatus?: string; lastSyncTime?: number; updatedAt: number }) =>
      e.syncStatus === 'conflict' ||
      e.syncStatus === 'error' ||
      !e.lastSyncTime ||
      e.updatedAt > e.lastSyncTime

    for (const p of projects) {
      if (isDirty(p)) {
        changes.push({
          entityType: 'project',
          entityId: p.id,
          name: p.name || '未命名项目',
          operation: p.lastSyncTime ? 'update' : 'create',
          status: p.syncStatus === 'conflict' ? 'conflict' : p.syncStatus === 'error' ? 'error' : 'pending',
          updatedAt: p.updatedAt,
        })
      }
    }
    for (const d of diagrams) {
      if (isDirty(d)) {
        changes.push({
          entityType: 'diagram',
          entityId: d.id,
          name: d.name || '未命名图表',
          operation: d.lastSyncTime ? 'update' : 'create',
          status: d.syncStatus === 'conflict' ? 'conflict' : d.syncStatus === 'error' ? 'error' : 'pending',
          updatedAt: d.updatedAt,
        })
      }
    }

    // 冲突/错误优先，其次按更新时间倒序
    const rank = { conflict: 0, error: 1, pending: 2 }
    changes.sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt - a.updatedAt)

    setPendingChanges(changes)
    setLogEntries(logs)
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  // 获取实体类型图标
  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'project':
        return <FolderSync className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  // 获取操作类型图标
  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'create':
      case 'push':
        return <Upload className="h-3 w-3" />
      case 'update':
        return <RefreshCw className="h-3 w-3" />
      case 'delete':
        return <Trash2 className="h-3 w-3" />
      case 'pull':
        return <Download className="h-3 w-3" />
      case 'conflict':
        return <AlertTriangle className="h-3 w-3" />
      case 'error':
        return <XCircle className="h-3 w-3" />
      default:
        return <RefreshCw className="h-3 w-3" />
    }
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-500'
      case 'failed':
        return 'text-destructive'
      default:
        return 'text-muted-foreground'
    }
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - timestamp

    if (diff < 60000) {
      return '刚刚'
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} 分钟前`
    } else if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  }

  // 推送全部待同步变更
  const handlePushAll = async () => {
    await pushNow()
    await loadData()
    await refreshStats()
  }

  // 清空日志
  const handleClearLogs = async () => {
    if (confirm('确定要清空同步日志吗？')) {
      await db.syncLog.clear()
      await loadData()
    }
  }

  // 统计冲突项数量
  const conflictCount = pendingChanges.filter((item) => item.status === 'conflict').length

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" />
          <CardTitle className="text-base">同步队列</CardTitle>
        </div>
        <CardDescription>查看待同步任务和同步历史</CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="queue" className="gap-2">
              <Clock className="h-4 w-4" />
              待同步
              {pendingChanges.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pendingChanges.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              历史
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4 space-y-4">
            {/* 操作按钮 */}
            {pendingChanges.length > 0 && isAuthenticated && (
              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={handlePushAll} disabled={isSyncing}>
                  <Upload className={cn('h-4 w-4 mr-2', isSyncing && 'animate-pulse')} />
                  推送全部（{pendingChanges.length}）
                </Button>
                {conflictCount > 0 && (
                  <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {conflictCount} 个冲突
                  </Badge>
                )}
              </div>
            )}

            {/* 待同步列表 */}
            <ScrollArea className="h-[300px]">
              {pendingChanges.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2" />
                  <p className="text-sm">没有待同步的变更</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingChanges.map((item) => (
                    <div
                      key={`${item.entityType}-${item.entityId}`}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border',
                        item.status === 'conflict'
                          ? 'border-yellow-500/50 bg-yellow-500/5'
                          : item.status === 'error'
                            ? 'border-destructive/50 bg-destructive/5'
                            : 'border-border'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {getEntityIcon(item.entityType)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate max-w-[160px]">
                              {item.name}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getOperationIcon(item.operation)}
                              <span className="ml-1">
                                {item.operation === 'create' ? '新增' : '更新'}
                              </span>
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.entityType === 'project' ? '项目' : '图表'} · {formatTime(item.updatedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.status === 'conflict' && (
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500">
                            冲突
                          </Badge>
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-4">
            {/* 历史操作按钮 */}
            {logEntries.length > 0 && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleClearLogs}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  清空日志
                </Button>
              </div>
            )}

            {/* 历史列表 */}
            <ScrollArea className="h-[300px]">
              {logEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <History className="h-8 w-8 mb-2" />
                  <p className="text-sm">暂无同步记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('p-1.5 rounded', getStatusColor(entry.status))}>
                          {entry.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {getEntityIcon(entry.entityType)}
                            <span className="text-sm font-medium capitalize">
                              {entry.entityType}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getOperationIcon(entry.operation)}
                              <span className="ml-1">{entry.operation}</span>
                            </Badge>
                          </div>
                          {entry.message && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {entry.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* 未连接提示 */}
        {!isAuthenticated && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
            请先连接 GitHub 以查看同步队列
          </div>
        )}
      </CardContent>
    </Card>
  )
}
