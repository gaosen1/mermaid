import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CornerDownRight, FolderPlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDiagramStore } from '@/stores/diagramStore'
import { useFolderStore } from '@/stores/folderStore'
import type { Diagram, DiagramFolder } from '@/types'
import { buildFolderPaths, proposeOrganization, type OrganizationMove } from '@/utils/aiOrganize'

interface AiOrganizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  diagrams: Diagram[]
  folders: DiagramFolder[]
}

type Phase = 'loading' | 'ready' | 'applying' | 'done'

/** 目标文件夹分组（根目录单独一组） */
interface MoveGroup {
  targetPath: string | null
  moves: OrganizationMove[]
}

function groupMoves(moves: OrganizationMove[]): MoveGroup[] {
  const map = new Map<string, MoveGroup>()
  for (const move of moves) {
    const key = move.targetPath ?? ''
    if (!map.has(key)) map.set(key, { targetPath: move.targetPath, moves: [] })
    map.get(key)!.moves.push(move)
  }
  // 根目录组排最后
  return [...map.values()].sort((a, b) => {
    if (a.targetPath === null) return 1
    if (b.targetPath === null) return -1
    return a.targetPath.localeCompare(b.targetPath, 'zh-CN')
  })
}

const ROOT_LABEL = '（根目录）'

export function AiOrganizeDialog({
  open,
  onOpenChange,
  projectId,
  diagrams,
  folders,
}: AiOrganizeDialogProps) {
  const { updateDiagram } = useDiagramStore()
  const { createFolder } = useFolderStore()

  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [moves, setMoves] = useState<OrganizationMove[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef(false)

  const generate = async () => {
    setPhase('loading')
    setError(null)
    setMoves([])
    setExcluded(new Set())
    setFailedIds(new Set())
    try {
      const proposal = await proposeOrganization({ diagrams, folders })
      if (abortRef.current) return
      setMoves(proposal.moves)
      setPhase('ready')
    } catch (err) {
      if (abortRef.current) return
      setError(err instanceof Error ? err.message : '生成方案失败')
      // 离开 loading 状态，错误 UI 才会渲染（含重试按钮）
      setPhase('ready')
    }
  }

  useEffect(() => {
    if (open) {
      abortRef.current = false
      generate()
    } else {
      abortRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const groups = useMemo(() => groupMoves(moves), [moves])
  const activeMoves = useMemo(() => moves.filter((m) => !excluded.has(m.diagramId)), [moves, excluded])

  // 需要新建的文件夹数量（现有路径中不存在的）
  const newFolderCount = useMemo(() => {
    const existing = new Set(buildFolderPaths(folders).values())
    const needed = new Set<string>()
    for (const move of activeMoves) {
      if (!move.targetPath) continue
      const segments = move.targetPath.split('/')
      for (let i = 1; i <= segments.length; i++) {
        const path = segments.slice(0, i).join('/')
        if (!existing.has(path)) needed.add(path)
      }
    }
    return needed.size
  }, [activeMoves, folders])

  const toggleExclude = (diagramId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(diagramId)) next.delete(diagramId)
      else next.add(diagramId)
      return next
    })
  }

  const toggleExcludeGroup = (group: MoveGroup) => {
    const groupIds = group.moves.map((m) => m.diagramId)
    const allExcluded = groupIds.every((id) => excluded.has(id))
    setExcluded((prev) => {
      const next = new Set(prev)
      groupIds.forEach((id) => (allExcluded ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const handleApply = async () => {
    setPhase('applying')
    setProgress({ done: 0, total: activeMoves.length })

    // 本地工作副本：createFolder 返回新文件夹，追加进来供后续路径段复用
    let workingFolders = [...folders]
    const failures = new Set<string>()

    const resolveOrCreate = async (path: string): Promise<string | null> => {
      const segments = path.split('/')
      let parentId: string | null = null
      for (const seg of segments) {
        let folder = workingFolders.find(
          (f) => (f.parentId ?? null) === parentId && f.name === seg
        )
        if (!folder) {
          folder = await createFolder(projectId, seg, parentId)
          workingFolders = [...workingFolders, folder]
        }
        parentId = folder.id
      }
      return parentId
    }

    for (let i = 0; i < activeMoves.length; i++) {
      if (abortRef.current) return
      const move = activeMoves[i]
      try {
        const folderId = move.targetPath ? await resolveOrCreate(move.targetPath) : null
        await updateDiagram(move.diagramId, { folderId })
      } catch {
        failures.add(move.diagramId)
      }
      setProgress({ done: i + 1, total: activeMoves.length })
    }

    setFailedIds(failures)
    setPhase('done')
  }

  const handleClose = () => {
    if (phase === 'applying') return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg!">
        <DialogHeader>
          <DialogTitle>AI 整理目录</DialogTitle>
          <DialogDescription>
            AI 基于全部图表内容生成分类方案，确认后才会移动。
          </DialogDescription>
        </DialogHeader>

        {phase === 'loading' && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在分析图表内容，生成分类方案…
          </div>
        )}

        {error && phase !== 'loading' && (
          <div className="flex flex-col items-center gap-3 py-6 text-sm">
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
            <Button variant="outline" size="sm" onClick={generate}>重试</Button>
          </div>
        )}

        {(phase === 'ready' || phase === 'applying' || phase === 'done') && !error && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              将移动 <span className="text-foreground font-medium">{activeMoves.length}</span> 个图表
              {newFolderCount > 0 && (
                <>
                  ，新建 <span className="text-foreground font-medium">{newFolderCount}</span> 个文件夹
                </>
              )}
              {excluded.size > 0 && <>（已剔除 {excluded.size} 条）</>}
            </div>
            <ScrollArea className="h-72 border rounded-md min-w-0" contentClassName="block min-w-0">
              <div className="p-2 space-y-3">
                {groups.map((group) => {
                  const groupExcluded = group.moves.every((m) => excluded.has(m.diagramId))
                  return (
                    <div key={group.targetPath ?? '__root__'} className={groupExcluded ? 'opacity-45' : ''}>
                      <div className="flex items-center gap-1.5 px-1 py-0.5">
                        <FolderPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate min-w-0">
                          {group.targetPath ?? ROOT_LABEL}
                        </span>
                        <button
                          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                          onClick={() => toggleExcludeGroup(group)}
                          disabled={phase !== 'ready'}
                        >
                          {groupExcluded ? '恢复整组' : '剔除整组'}
                        </button>
                      </div>
                      <div className="space-y-0.5 mt-0.5">
                        {group.moves.map((move) => {
                          const isExcluded = excluded.has(move.diagramId)
                          const isFailed = failedIds.has(move.diagramId)
                          return (
                            <div
                              key={move.diagramId}
                              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs bg-muted/40 ${
                                isExcluded ? 'line-through text-muted-foreground' : ''
                              } ${isFailed ? 'text-destructive line-through-none' : ''}`}
                            >
                              <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate flex-1 min-w-0" title={`${move.fromPath ?? '根目录'} → ${move.targetPath ?? '根目录'}`}>
                                {move.diagramName}
                                <span className="text-muted-foreground">
                                  {' '}← {move.fromPath ?? '根目录'}
                                </span>
                              </span>
                              {isFailed && <span className="text-[10px] shrink-0">失败</span>}
                              {phase === 'ready' && (
                                <button
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                  title={isExcluded ? '恢复' : '剔除'}
                                  onClick={() => toggleExclude(move.diagramId)}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
            {phase === 'applying' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在应用 {progress.done}/{progress.total}…
              </div>
            )}
            {phase === 'done' && (
              <div className="text-xs">
                {failedIds.size > 0 ? (
                  <span className="text-destructive">
                    完成，{failedIds.size} 项移动失败（上方标红），其余已生效。
                  </span>
                ) : (
                  <span className="text-muted-foreground">整理完成，目录已更新。</span>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={phase === 'applying'}>
            {phase === 'done' ? '完成' : '取消'}
          </Button>
          {phase === 'ready' && (
            <Button onClick={handleApply} disabled={activeMoves.length === 0}>
              应用方案
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
