import { useMemo } from 'react'
import { FolderInput, Folder } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Diagram, DiagramFolder } from '@/types'

export interface MoveTargetItem {
  kind: 'diagram' | 'folder'
  id: string
}

interface MoveToFolderDialogProps {
  item: MoveTargetItem | null
  diagrams: Diagram[]
  folders: DiagramFolder[]
  onOpenChange: (open: boolean) => void
  onMove: (item: MoveTargetItem, targetFolderId: string | null) => void
}

interface FolderOption {
  id: string | null
  name: string
  depth: number
}

/** 根目录 + 文件夹树展平为带缩进的选项列表 */
function buildFolderOptions(folders: DiagramFolder[]): FolderOption[] {
  const options: FolderOption[] = [{ id: null, name: '根目录', depth: 0 }]
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of folders.filter((f) => (f.parentId ?? null) === parentId)) {
      options.push({ id: folder.id, name: folder.name, depth })
      walk(folder.id, depth + 1)
    }
  }
  walk(null, 1)
  return options
}

function collectDescendants(folderId: string, folders: DiagramFolder[]): string[] {
  const result: string[] = []
  for (const f of folders) {
    if (f.parentId === folderId) {
      result.push(f.id)
      result.push(...collectDescendants(f.id, folders))
    }
  }
  return result
}

/**
 * 「移入目标路径」弹窗：拖拽移入/移出文件夹的补充交互，
 * 以文件夹树形式选择目标位置（含根目录）。
 */
export function MoveToFolderDialog({
  item,
  diagrams,
  folders,
  onOpenChange,
  onMove,
}: MoveToFolderDialogProps) {
  const options = useMemo(() => buildFolderOptions(folders), [folders])

  if (!item) return null

  const currentContainer =
    item.kind === 'diagram'
      ? diagrams.find((d) => d.id === item.id)?.folderId ?? null
      : folders.find((f) => f.id === item.id)?.parentId ?? null
  const itemName =
    item.kind === 'diagram'
      ? diagrams.find((d) => d.id === item.id)?.name ?? ''
      : folders.find((f) => f.id === item.id)?.name ?? ''

  // 文件夹不能移入自身或自己的后代
  const forbidden =
    item.kind === 'folder'
      ? new Set([item.id, ...collectDescendants(item.id, folders)])
      : new Set<string>()

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <FolderInput className="h-4 w-4" />
            移入目标路径
          </DialogTitle>
          <DialogDescription>将「{itemName}」移动到…</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72 border rounded-md" contentClassName="block min-w-0">
          <div className="p-1 space-y-0.5">
            {options.map((option) => {
              const isCurrent = option.id === currentContainer
              const isForbidden = option.id !== null && forbidden.has(option.id)
              const disabled = isCurrent || isForbidden
              return (
                <button
                  key={option.id ?? '__root__'}
                  className={`flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 text-xs text-left ${
                    disabled
                      ? 'opacity-45 cursor-not-allowed'
                      : 'hover:bg-accent cursor-pointer'
                  }`}
                  style={{ paddingLeft: 8 + option.depth * 16 }}
                  disabled={disabled}
                  onClick={() => onMove(item, option.id)}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate min-w-0">{option.name}</span>
                  {isCurrent && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      当前
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
