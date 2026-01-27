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
  Image,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncQueueItem, SyncLogEntry } from '@/types/sync'
import { clearFailed, retryFailed, clearAll as clearQueue } from '@/services/sync/syncQueue'

interface SyncQueuePanelProps {
  className?: string
}

export function SyncQueuePanel({ className }: SyncQueuePanelProps) {
  const { isAuthenticated, refreshStats } = useSyncStore()
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([])
  const [logEntries, setLogEntries] = useState<SyncLogEntry[]>([])
  const [activeTab, setActiveTab] = useState('queue')

  // 加载队列和日志数据
  const loadData = async () => {
    const [queue, logs] = await Promise.all([
      db.syncQueue.orderBy('priority').toArray(),
      db.syncLog.orderBy('timestamp').reverse().limit(50).toArray(),
    ])
    setQueueItems(queue)
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
      case 'diagram':
        return <FileText className="h-4 w-4" />
      case 'snapshot':
        return <Image className="h-4 w-4" />
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

  // 清除失败项
  const handleClearFailed = async () => {
    await clearFailed()
    await loadData()
    await refreshStats()
  }

  // 重试失败项
  const handleRetryFailed = async () => {
    await retryFailed()
    await loadData()
    await refreshStats()
  }

  // 清空队列
  const handleClearQueue = async () => {
    if (confirm('确定要清空同步队列吗？')) {
      await clearQueue()
      await loadData()
      await refreshStats()
    }
  }

  // 清空日志
  const handleClearLogs = async () => {
    if (confirm('确定要清空同步日志吗？')) {
      await db.syncLog.clear()
      await loadData()
    }
  }

  // 统计失败项数量
  const failedCount = queueItems.filter((item) => item.retryCount >= item.maxRetries).length

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
              队列
              {queueItems.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {queueItems.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              历史
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4 space-y-4">
            {/* 队列操作按钮 */}
            {queueItems.length > 0 && (
              <div className="flex gap-2">
                {failedCount > 0 && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleRetryFailed}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      重试失败 ({failedCount})
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClearFailed}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      清除失败
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={handleClearQueue}>
                  清空队列
                </Button>
              </div>
            )}

            {/* 队列列表 */}
            <ScrollArea className="h-[300px]">
              {queueItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mb-2" />
                  <p className="text-sm">队列为空</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queueItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border',
                        item.retryCount >= item.maxRetries
                          ? 'border-destructive/50 bg-destructive/5'
                          : 'border-border'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {getEntityIcon(item.entityType)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium capitalize">
                              {item.entityType}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getOperationIcon(item.operation)}
                              <span className="ml-1">{item.operation}</span>
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {item.entityId}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.retryCount > 0 && (
                          <Badge
                            variant={item.retryCount >= item.maxRetries ? 'destructive' : 'secondary'}
                          >
                            重试 {item.retryCount}/{item.maxRetries}
                          </Badge>
                        )}
                        {item.error && (
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
