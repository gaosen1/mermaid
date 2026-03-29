import { useState, useRef } from 'react'
import { useDiagramStore } from '@/stores/diagramStore'
import { useSyncStore } from '@/stores/syncStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  Upload,
  FileCode2,
  GripVertical,
} from 'lucide-react'
import { exportDiagramToMmd, importFromMmd } from '@/utils/export'
import { SyncStatusBadge } from '@/components/sync'
import type { Diagram } from '@/types'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface DiagramListProps {
  projectId: string
  onSelectDiagram: (diagram: Diagram) => void
}

interface SortableDiagramItemProps {
  diagram: Diagram
  isActive: boolean
  isAuthenticated: boolean
  onEdit: (diagram: Diagram) => void
  onExport: (diagram: Diagram) => void
  onDelete: (diagram: Diagram) => void
  onClick: (e: React.MouseEvent<HTMLDivElement>, diagram: Diagram) => void
}

function SortableDiagramItem({
  diagram,
  isActive,
  isAuthenticated,
  onEdit,
  onExport,
  onDelete,
  onClick,
}: SortableDiagramItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: diagram.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`diagram-list-item flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-accent ${
        isActive ? 'bg-accent' : ''
      }`}
      onClick={(e) => onClick(e, diagram)}
    >
      <div className="diagram-list-item-content flex items-center gap-2 overflow-hidden flex-1">
        <div
          {...attributes}
          {...listeners}
          className="diagram-list-item-drag-handle cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <FileCode2 className="diagram-list-item-icon h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="diagram-list-item-name truncate text-sm">{diagram.name}</span>
        {isAuthenticated && diagram.syncStatus && (
          <SyncStatusBadge
            status={diagram.syncStatus}
            size="sm"
            className="diagram-list-item-sync-status"
          />
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="diagram-list-item-menu-trigger h-8 w-8"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="diagram-list-item-menu">
          <DropdownMenuItem
            className="diagram-list-item-menu-rename"
            onClick={(e) => { e.stopPropagation(); onEdit(diagram) }}
          >
            <Pencil className="h-4 w-4 mr-2" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem
            className="diagram-list-item-menu-export"
            onClick={(e) => { e.stopPropagation(); onExport(diagram) }}
          >
            <Download className="h-4 w-4 mr-2" />
            导出 .mmd
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="diagram-list-item-menu-delete text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(diagram) }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function DiagramList({ projectId, onSelectDiagram }: DiagramListProps) {
  const {
    diagrams,
    currentDiagram,
    loading,
    createDiagram,
    updateDiagram,
    deleteDiagram,
    loadDiagramsByProject,
    setCurrentDiagram,
    reorderDiagrams,
  } = useDiagramStore()

  const { isAuthenticated } = useSyncStore()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingDiagram, setEditingDiagram] = useState<Diagram | null>(null)
  const [newDiagramName, setNewDiagramName] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = diagrams.findIndex((d) => d.id === active.id)
      const newIndex = diagrams.findIndex((d) => d.id === over.id)

      const newDiagrams = arrayMove(diagrams, oldIndex, newIndex)
      reorderDiagrams(newDiagrams.map((d) => d.id))
    }
  }

  const handleCreate = async () => {
    if (!newDiagramName.trim()) return
    const diagram = await createDiagram(projectId, newDiagramName)
    setCurrentDiagram(diagram)
    onSelectDiagram(diagram)
    setNewDiagramName('')
    setCreateDialogOpen(false)
  }

  const handleEdit = async () => {
    if (!editingDiagram || !newDiagramName.trim()) return
    await updateDiagram(editingDiagram.id, { name: newDiagramName })
    setEditingDiagram(null)
    setNewDiagramName('')
    setEditDialogOpen(false)
  }

  const handleDelete = async (diagram: Diagram) => {
    if (confirm(`确定要删除图表 "${diagram.name}" 吗？此操作不可撤销。`)) {
      await deleteDiagram(diagram.id)
    }
  }

  const handleExport = async (diagram: Diagram) => {
    await exportDiagramToMmd(diagram)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const diagram = await importFromMmd(file, projectId)
      await loadDiagramsByProject(projectId)
      setCurrentDiagram(diagram)
      onSelectDiagram(diagram)
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openEditDialog = (diagram: Diagram) => {
    setEditingDiagram(diagram)
    setNewDiagramName(diagram.name)
    setEditDialogOpen(true)
  }

  const handleSelectDiagram = (diagram: Diagram) => {
    setCurrentDiagram(diagram)
    onSelectDiagram(diagram)
  }

  const handleDiagramClick = (e: React.MouseEvent<HTMLDivElement>, diagram: Diagram) => {
    if (e.metaKey || e.ctrlKey) {
      const url = new URL(window.location.href)
      url.pathname = `/project/${encodeURIComponent(projectId)}/diagram/${encodeURIComponent(diagram.id)}`
      url.hash = ''
      window.open(url.toString(), '_blank', 'noopener,noreferrer')
      return
    }

    handleSelectDiagram(diagram)
  }

  if (loading) {
    return (
      <div className="diagram-list-loading flex items-center justify-center h-full">
        <div className="diagram-list-loading-text text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="diagram-list flex flex-col h-full min-h-0">
      <div className="diagram-list-toolbar p-3 border-b flex items-center gap-2">
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="diagram-list-create-button flex-1">
              <Plus className="h-4 w-4 mr-1" />
              新建图表
            </Button>
          </DialogTrigger>
          <DialogContent className="diagram-list-create-dialog">
            <DialogHeader>
              <DialogTitle className="diagram-list-create-dialog-title">新建图表</DialogTitle>
              <DialogDescription className="diagram-list-create-dialog-description">
                创建一个新的 Mermaid 图表
              </DialogDescription>
            </DialogHeader>
            <div className="diagram-list-create-dialog-body space-y-4 py-4">
              <div className="diagram-list-create-field space-y-2">
                <Label className="diagram-list-create-label">图表名称</Label>
                <Input
                  className="diagram-list-create-input"
                  value={newDiagramName}
                  onChange={(e) => setNewDiagramName(e.target.value)}
                  placeholder="输入图表名称"
                />
              </div>
            </div>
            <DialogFooter className="diagram-list-create-dialog-footer">
              <Button
                variant="outline"
                className="diagram-list-create-cancel"
                onClick={() => setCreateDialogOpen(false)}
              >
                取消
              </Button>
              <Button className="diagram-list-create-confirm" onClick={handleCreate}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          className="diagram-list-import-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mmd"
          className="diagram-list-import-input hidden"
          onChange={handleImport}
        />
      </div>

      <ScrollArea
        className="diagram-list-scroll-area flex-1 min-h-0"
        viewportClassName="[&>div]:!block [&>div]:!min-w-0 min-h-0"
        contentClassName="diagram-list-scroll-content block min-w-0"
      >
        {diagrams.length === 0 ? (
          <div className="diagram-list-empty flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
            <FileCode2 className="diagram-list-empty-icon h-8 w-8 mb-2" />
            <p className="diagram-list-empty-text">暂无图表</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={diagrams.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="diagram-list-items p-2 space-y-1">
                {diagrams.map((diagram) => (
                  <SortableDiagramItem
                    key={diagram.id}
                    diagram={diagram}
                    isActive={currentDiagram?.id === diagram.id}
                    isAuthenticated={isAuthenticated}
                    onEdit={openEditDialog}
                    onExport={handleExport}
                    onDelete={handleDelete}
                    onClick={handleDiagramClick}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="diagram-list-edit-dialog">
          <DialogHeader>
            <DialogTitle className="diagram-list-edit-dialog-title">重命名图表</DialogTitle>
            <DialogDescription className="diagram-list-edit-dialog-description">
              修改图表名称
            </DialogDescription>
          </DialogHeader>
          <div className="diagram-list-edit-dialog-body space-y-4 py-4">
            <div className="diagram-list-edit-field space-y-2">
              <Label className="diagram-list-edit-label">图表名称</Label>
              <Input
                className="diagram-list-edit-input"
                value={newDiagramName}
                onChange={(e) => setNewDiagramName(e.target.value)}
                placeholder="输入图表名称"
              />
            </div>
          </div>
          <DialogFooter className="diagram-list-edit-dialog-footer">
            <Button
              variant="outline"
              className="diagram-list-edit-cancel"
              onClick={() => setEditDialogOpen(false)}
            >
              取消
            </Button>
            <Button className="diagram-list-edit-confirm" onClick={handleEdit}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
