/**
 * 冲突解决对话框组件
 * 显示冲突列表、版本对比和解决选项
 */

import { useEffect, useState } from 'react'
import { db } from '@/db'
import { useSyncStore } from '@/stores/syncStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderSync,
  ArrowLeft,
  ArrowRight,
  Clock,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Project, Diagram } from '@/types'
import { resolveConflict, type ConflictInfo } from '@/services/sync/conflictResolver'

interface ConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ConflictItem {
  entityType: 'project' | 'diagram'
  entityId: string
  localData: Project | Diagram
  remoteData?: Project | Diagram
  localChecksum?: string
  remoteChecksum?: string
}

export function ConflictDialog({ open, onOpenChange }: ConflictDialogProps) {
  const { refreshStats } = useSyncStore()
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isResolving, setIsResolving] = useState(false)
  const [resolvedCount, setResolvedCount] = useState(0)

  // 加载冲突数据
  const loadConflicts = async () => {
    const [conflictProjects, conflictDiagrams] = await Promise.all([
      db.projects.where('syncStatus').equals('conflict').toArray(),
      db.diagrams.where('syncStatus').equals('conflict').toArray(),
    ])

    const items: ConflictItem[] = [
      ...conflictProjects.map((p) => ({
        entityType: 'project' as const,
        entityId: p.id,
        localData: p,
        localChecksum: p.localChecksum,
        remoteChecksum: p.remoteChecksum,
      })),
      ...conflictDiagrams.map((d) => ({
        entityType: 'diagram' as const,
        entityId: d.id,
        localData: d,
        localChecksum: d.localChecksum,
        remoteChecksum: d.remoteChecksum,
      })),
    ]

    setConflicts(items)
    setSelectedIndex(0)
    setResolvedCount(0)
  }

  useEffect(() => {
    if (open) {
      loadConflicts()
    }
  }, [open])

  // 获取当前选中的冲突
  const currentConflict = conflicts[selectedIndex]

  // 解决单个冲突
  const handleResolve = async (keepVersion: 'local' | 'remote') => {
    if (!currentConflict) return

    setIsResolving(true)
    try {
      const conflictInfo: ConflictInfo = {
        entityType: currentConflict.entityType,
        entityId: currentConflict.entityId,
        local: currentConflict.localData,
        remote: currentConflict.remoteData || currentConflict.localData,
        localChecksum: currentConflict.localChecksum || '',
        remoteChecksum: currentConflict.remoteChecksum || '',
        detectedAt: Date.now(),
      }

      await resolveConflict(conflictInfo, keepVersion)

      // 更新本地数据库状态
      if (currentConflict.entityType === 'project') {
        await db.projects.update(currentConflict.entityId, {
          syncStatus: 'pending',
          syncError: undefined,
        })
      } else {
        await db.diagrams.update(currentConflict.entityId, {
          syncStatus: 'pending',
          syncError: undefined,
        })
      }

      setResolvedCount((prev) => prev + 1)

      // 移动到下一个冲突或关闭对话框
      if (selectedIndex < conflicts.length - 1) {
        setSelectedIndex((prev) => prev + 1)
      }

      // 重新加载冲突列表
      await loadConflicts()
      await refreshStats()

      // 如果没有更多冲突，关闭对话框
      if (conflicts.length <= 1) {
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Failed to resolve conflict:', error)
    } finally {
      setIsResolving(false)
    }
  }

  // 批量解决所有冲突
  const handleResolveAll = async (keepVersion: 'local' | 'remote') => {
    setIsResolving(true)
    try {
      for (const conflict of conflicts) {
        const conflictInfo: ConflictInfo = {
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          local: conflict.localData,
          remote: conflict.remoteData || conflict.localData,
          localChecksum: conflict.localChecksum || '',
          remoteChecksum: conflict.remoteChecksum || '',
          detectedAt: Date.now(),
        }

        await resolveConflict(conflictInfo, keepVersion)

        if (conflict.entityType === 'project') {
          await db.projects.update(conflict.entityId, {
            syncStatus: 'pending',
            syncError: undefined,
          })
        } else {
          await db.diagrams.update(conflict.entityId, {
            syncStatus: 'pending',
            syncError: undefined,
          })
        }
      }

      await refreshStats()
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to resolve conflicts:', error)
    } finally {
      setIsResolving(false)
    }
  }

  // 格式化时间
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '未知'
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 获取实体名称
  const getEntityName = (data: Project | Diagram) => {
    return data.name || '未命名'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            解决同步冲突
          </DialogTitle>
          <DialogDescription>
            发现 {conflicts.length} 个冲突需要解决。请选择保留本地版本还是云端版本。
          </DialogDescription>
        </DialogHeader>

        {conflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
            <p className="text-lg font-medium">没有冲突</p>
            <p className="text-sm">所有数据已同步</p>
          </div>
        ) : (
          <>
            {/* 冲突列表 */}
            <div className="flex gap-4">
              {/* 左侧列表 */}
              <div className="w-1/3 border-r pr-4">
                <p className="text-sm font-medium mb-2">冲突列表</p>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {conflicts.map((conflict, index) => (
                      <div
                        key={`${conflict.entityType}-${conflict.entityId}`}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                          index === selectedIndex
                            ? 'bg-primary/10 border border-primary'
                            : 'hover:bg-muted'
                        )}
                        onClick={() => setSelectedIndex(index)}
                      >
                        {conflict.entityType === 'project' ? (
                          <FolderSync className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {getEntityName(conflict.localData)}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {conflict.entityType}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* 右侧详情 */}
              <div className="flex-1">
                {currentConflict && (
                  <Tabs defaultValue="compare">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="compare">版本对比</TabsTrigger>
                      <TabsTrigger value="details">详细信息</TabsTrigger>
                    </TabsList>

                    <TabsContent value="compare" className="mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* 本地版本 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="gap-1">
                              <ArrowLeft className="h-3 w-3" />
                              本地版本
                            </Badge>
                          </div>
                          <div className="p-3 bg-muted rounded-lg space-y-2">
                            <p className="font-medium">
                              {getEntityName(currentConflict.localData)}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTime(currentConflict.localData.updatedAt)}
                            </div>
                            {currentConflict.localChecksum && (
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {currentConflict.localChecksum.slice(0, 16)}...
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleResolve('local')}
                            disabled={isResolving}
                          >
                            {isResolving ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            保留本地
                          </Button>
                        </div>

                        {/* 云端版本 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="gap-1">
                              <ArrowRight className="h-3 w-3" />
                              云端版本
                            </Badge>
                          </div>
                          <div className="p-3 bg-muted rounded-lg space-y-2">
                            <p className="font-medium">
                              {currentConflict.remoteData
                                ? getEntityName(currentConflict.remoteData)
                                : getEntityName(currentConflict.localData)}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatTime(
                                currentConflict.remoteData?.updatedAt ||
                                  currentConflict.localData.updatedAt
                              )}
                            </div>
                            {currentConflict.remoteChecksum && (
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {currentConflict.remoteChecksum.slice(0, 16)}...
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleResolve('remote')}
                            disabled={isResolving}
                          >
                            {isResolving ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            使用云端
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="details" className="mt-4">
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">类型</span>
                          <span className="capitalize">{currentConflict.entityType}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ID</span>
                          <span className="font-mono text-xs">
                            {currentConflict.entityId.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">名称</span>
                          <span>{getEntityName(currentConflict.localData)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">本地更新时间</span>
                          <span>{formatTime(currentConflict.localData.updatedAt)}</span>
                        </div>
                        {currentConflict.localData.createdAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">创建时间</span>
                            <span>{formatTime(currentConflict.localData.createdAt)}</span>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            </div>

            {/* 进度指示 */}
            {resolvedCount > 0 && (
              <div className="text-sm text-muted-foreground text-center">
                已解决 {resolvedCount} / {conflicts.length + resolvedCount} 个冲突
              </div>
            )}
          </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {conflicts.length > 1 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleResolveAll('local')}
                disabled={isResolving}
              >
                全部保留本地
              </Button>
              <Button
                variant="outline"
                onClick={() => handleResolveAll('remote')}
                disabled={isResolving}
              >
                全部使用云端
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            稍后处理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
