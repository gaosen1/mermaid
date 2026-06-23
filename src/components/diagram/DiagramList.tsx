import { useState, useRef } from 'react'
import { useDiagramStore } from '@/stores/diagramStore'
import { useFolderStore } from '@/stores/folderStore'
import { useSyncStore } from '@/stores/syncStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  Upload,
  FileCode2,
  GripVertical,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { exportDiagram, importDiagram } from '@/utils/export'
import { SyncStatusBadge } from '@/components/sync'
import type { Diagram, DiagramFolder, DiagramType } from '@/types'
import { getDiagramAcceptTypes, getDiagramFileExtension, getDiagramTypeLabel } from '@/utils/diagram'
import { getSvgClipboardFile, isEditablePasteTarget, isSvgSource } from '@/utils/svg'
import { getImageClipboardFile, hasClipboardFiles, readFileAsDataUrl, getImageTypeFromDataUrl } from '@/utils/png'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { buildTree, getContainerItems, getContainerOf, getItemKind, type TreeNode } from './utils/diagramTree'

interface DiagramListProps {
  projectId: string
  onSelectDiagram: (diagram: Diagram) => void
}

// ─── SortableDiagramItem ──────────────────────────────────────────────────────

interface SortableDiagramItemProps {
  diagram: Diagram
  isActive: boolean
  isAuthenticated: boolean
  depth: number
  onEdit: (diagram: Diagram) => void
  onExport: (diagram: Diagram) => void
  onDelete: (diagram: Diagram) => void
  onClick: (e: React.MouseEvent<HTMLDivElement>, diagram: Diagram) => void
}

function SortableDiagramItem({
  diagram,
  isActive,
  isAuthenticated,
  depth,
  onEdit,
  onExport,
  onDelete,
  onClick,
}: SortableDiagramItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: diagram.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        paddingLeft: depth * 12,
      }}
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
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="diagram-list-item-name truncate text-sm">{diagram.name}</span>
          </TooltipTrigger>
          <TooltipContent side="right">{diagram.name}</TooltipContent>
        </Tooltip>
        <Badge variant="outline" className="diagram-list-item-type text-[10px] uppercase tracking-wide">
          {getDiagramTypeLabel(diagram.type)}
        </Badge>
        {isAuthenticated && diagram.syncStatus && (
          <SyncStatusBadge status={diagram.syncStatus} size="sm" className="diagram-list-item-sync-status" />
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(diagram) }}>
            <Pencil className="h-4 w-4 mr-2" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport(diagram) }}>
            <Download className="h-4 w-4 mr-2" />
            导出 .{getDiagramFileExtension(diagram.type)}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
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

// ─── FolderItem ───────────────────────────────────────────────────────────────

interface FolderItemProps {
  folder: DiagramFolder
  children: React.ReactNode
  isOver: boolean
  depth: number
  collapsed: boolean
  onToggle: () => void
  onRename: (folder: DiagramFolder) => void
  onDelete: (folder: DiagramFolder) => void
  onNewDiagram: (folderId: string) => void
  onNewSubfolder: (parentId: string) => void
}

function FolderItem({
  folder,
  children,
  isOver,
  depth,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  onNewDiagram,
  onNewSubfolder,
}: FolderItemProps) {
  // useSortable 负责拖拽排序（与图表同层混排）
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id })

  // useDroppable 负责接收图表拖入（独立 id，不与 sortable id 冲突）
  const { setNodeRef: setDropRef } = useDroppable({ id: `folder-drop-${folder.id}` })

  // 合并两个 ref
  const setRef = (el: HTMLDivElement | null) => {
    setSortableRef(el)
    setDropRef(el)
  }

  return (
    <div
      ref={setRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        paddingLeft: depth * 12,
      }}
    >
      <div
        className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-accent transition-colors ${
          isOver ? 'bg-accent ring-1 ring-primary' : ''
        }`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1 overflow-hidden flex-1">
          {/* 拖拽把手 */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="shrink-0 text-muted-foreground">
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {collapsed ? <Folder className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate text-sm font-medium">{folder.name}</span>
            </TooltipTrigger>
            <TooltipContent side="right">{folder.name}</TooltipContent>
          </Tooltip>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNewDiagram(folder.id) }}>
              <Plus className="h-4 w-4 mr-2" />
              新建图表
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNewSubfolder(folder.id) }}>
              <FolderPlus className="h-4 w-4 mr-2" />
              新建子文件夹
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(folder) }}>
              <Pencil className="h-4 w-4 mr-2" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(folder) }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除文件夹
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

// ─── TreeRenderer ─────────────────────────────────────────────────────────────

interface TreeRendererProps {
  nodes: TreeNode[]
  depth: number
  collapsedFolders: Set<string>
  overFolderId: string | null
  currentDiagramId: string | undefined
  isAuthenticated: boolean
  onToggleFolder: (id: string) => void
  onEditDiagram: (d: Diagram) => void
  onExportDiagram: (d: Diagram) => void
  onDeleteDiagram: (d: Diagram) => void
  onClickDiagram: (e: React.MouseEvent<HTMLDivElement>, d: Diagram) => void
  onRenameFolderOpen: (f: DiagramFolder) => void
  onDeleteFolder: (f: DiagramFolder) => void
  onNewDiagramInFolder: (folderId: string) => void
  onNewSubfolder: (parentId: string) => void
}

function TreeRenderer({
  nodes,
  depth,
  collapsedFolders,
  overFolderId,
  currentDiagramId,
  isAuthenticated,
  onToggleFolder,
  onEditDiagram,
  onExportDiagram,
  onDeleteDiagram,
  onClickDiagram,
  onRenameFolderOpen,
  onDeleteFolder,
  onNewDiagramInFolder,
  onNewSubfolder,
}: TreeRendererProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'diagram') {
          return (
            <SortableDiagramItem
              key={node.diagram.id}
              diagram={node.diagram}
              isActive={currentDiagramId === node.diagram.id}
              isAuthenticated={isAuthenticated}
              depth={depth}
              onEdit={onEditDiagram}
              onExport={onExportDiagram}
              onDelete={onDeleteDiagram}
              onClick={onClickDiagram}
            />
          )
        }

        const collapsed = collapsedFolders.has(node.folder.id)
        // 子层所有 sortable ID（文件夹 + 图表，按 node 顺序）
        const childIds = node.children.map((c) =>
          c.type === 'folder' ? c.folder.id : c.diagram.id
        )

        return (
          <FolderItem
            key={node.folder.id}
            folder={node.folder}
            depth={depth}
            collapsed={collapsed}
            isOver={overFolderId === node.folder.id}
            onToggle={() => onToggleFolder(node.folder.id)}
            onRename={onRenameFolderOpen}
            onDelete={onDeleteFolder}
            onNewDiagram={onNewDiagramInFolder}
            onNewSubfolder={onNewSubfolder}
          >
            <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
              <TreeRenderer
                nodes={node.children}
                depth={depth + 1}
                collapsedFolders={collapsedFolders}
                overFolderId={overFolderId}
                currentDiagramId={currentDiagramId}
                isAuthenticated={isAuthenticated}
                onToggleFolder={onToggleFolder}
                onEditDiagram={onEditDiagram}
                onExportDiagram={onExportDiagram}
                onDeleteDiagram={onDeleteDiagram}
                onClickDiagram={onClickDiagram}
                onRenameFolderOpen={onRenameFolderOpen}
                onDeleteFolder={onDeleteFolder}
                onNewDiagramInFolder={onNewDiagramInFolder}
                onNewSubfolder={onNewSubfolder}
              />
            </SortableContext>
          </FolderItem>
        )
      })}
    </>
  )
}

// ─── DiagramList (main) ───────────────────────────────────────────────────────

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
    moveDiagramToFolder,
  } = useDiagramStore()

  const { folders, loadFoldersByProject, createFolder, updateFolder, deleteFolder } = useFolderStore()
  const { isAuthenticated } = useSyncStore()

  // Dialog state
  const [createDiagramOpen, setCreateDiagramOpen] = useState(false)
  const [createDiagramFolderId, setCreateDiagramFolderId] = useState<string | null>(null)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [editDiagramOpen, setEditDiagramOpen] = useState(false)
  const [editingDiagram, setEditingDiagram] = useState<Diagram | null>(null)
  const [editFolderOpen, setEditFolderOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<DiagramFolder | null>(null)

  const [inputName, setInputName] = useState('')
  const [newDiagramType, setNewDiagramType] = useState<DiagramType>('mermaid')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [overFolderId, setOverFolderId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Build tree
  const tree = buildTree(diagrams, folders, null)
  // 根层所有 sortable ID（文件夹 + 图表混排）
  const rootItemIds = getContainerItems(diagrams, folders, null).map((i) => i.id)

  // ── DnD handlers ──

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined
    if (!overId) { setOverFolderId(null); return }
    if (overId.startsWith('folder-drop-')) {
      setOverFolderId(overId.replace('folder-drop-', ''))
    } else {
      setOverFolderId(null)
    }
  }

  /**
   * 将容器内混排列表按新顺序持久化（文件夹 + 图表的 order 均使用其在列表中的绝对 index）
   */
  const applyContainerReorder = (containerItems: ReturnType<typeof getContainerItems>) => {
    containerItems.forEach(({ kind, id }, idx) => {
      if (kind === 'diagram') {
        updateDiagram(id, { order: idx })
      } else {
        updateFolder(id, { order: idx })
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setOverFolderId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    // 拖到文件夹 drop zone → 图表移入文件夹
    if (overId.startsWith('folder-drop-')) {
      const targetFolderId = overId.replace('folder-drop-', '')
      const activeDiagram = diagrams.find((d) => d.id === activeId)
      if (activeDiagram && activeDiagram.folderId !== targetFolderId) {
        moveDiagramToFolder(activeId, targetFolderId)
      }
      return
    }

    const activeKind = getItemKind(activeId, diagrams, folders)
    if (!activeKind) return

    const sourceContainer = getContainerOf(activeId, diagrams, folders)
    const targetContainer = getContainerOf(overId, diagrams, folders)

    // 文件夹拖拽：只在同层排序，不支持跨层移动
    if (activeKind === 'folder') {
      if (sourceContainer !== targetContainer) return
      const containerItems = getContainerItems(diagrams, folders, sourceContainer)
      const oldIndex = containerItems.findIndex((i) => i.id === activeId)
      const newIndex = containerItems.findIndex((i) => i.id === overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        applyContainerReorder(arrayMove(containerItems, oldIndex, newIndex))
      }
      return
    }

    // 图表拖拽
    if (sourceContainer === targetContainer) {
      // 同容器排序（混排）
      const containerItems = getContainerItems(diagrams, folders, sourceContainer)
      const oldIndex = containerItems.findIndex((i) => i.id === activeId)
      const newIndex = containerItems.findIndex((i) => i.id === overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        applyContainerReorder(arrayMove(containerItems, oldIndex, newIndex))
      }
    } else {
      // 跨容器移动（目标容器 = overId 所在的 folderId）
      const activeDiagram = diagrams.find((d) => d.id === activeId)
      if (activeDiagram) moveDiagramToFolder(activeId, targetContainer)
    }
  }

  // ── Diagram CRUD ──

  const handleCreateDiagram = async () => {
    if (!inputName.trim()) return
    const diagram = await createDiagram(projectId, inputName, newDiagramType)
    if (createDiagramFolderId) {
      await moveDiagramToFolder(diagram.id, createDiagramFolderId)
    }
    setCurrentDiagram({ ...diagram, folderId: createDiagramFolderId })
    onSelectDiagram(diagram)
    setInputName('')
    setNewDiagramType('mermaid')
    setCreateDiagramFolderId(null)
    setCreateDiagramOpen(false)
  }

  const openCreateDiagramInFolder = (folderId: string) => {
    setCreateDiagramFolderId(folderId)
    setCreateDiagramOpen(true)
  }

  const handleEditDiagram = async () => {
    if (!editingDiagram || !inputName.trim()) return
    await updateDiagram(editingDiagram.id, { name: inputName })
    setEditingDiagram(null)
    setInputName('')
    setEditDiagramOpen(false)
  }

  const handleDeleteDiagram = async (diagram: Diagram) => {
    if (confirm(`确定要删除图表 "${diagram.name}" 吗？此操作不可撤销。`)) {
      await deleteDiagram(diagram.id)
    }
  }

  const handleExportDiagram = async (diagram: Diagram) => {
    await exportDiagram(diagram)
  }

  const openEditDiagramDialog = (diagram: Diagram) => {
    setEditingDiagram(diagram)
    setInputName(diagram.name)
    setEditDiagramOpen(true)
  }

  // ── Folder CRUD ──

  const handleCreateFolder = async () => {
    if (!inputName.trim()) return
    await createFolder(projectId, inputName, createFolderParentId)
    setInputName('')
    setCreateFolderParentId(null)
    setCreateFolderOpen(false)
  }

  const openCreateSubfolder = (parentId: string) => {
    setCreateFolderParentId(parentId)
    setCreateFolderOpen(true)
  }

  const handleEditFolder = async () => {
    if (!editingFolder || !inputName.trim()) return
    await updateFolder(editingFolder.id, { name: inputName })
    setEditingFolder(null)
    setInputName('')
    setEditFolderOpen(false)
  }

  const handleDeleteFolder = async (folder: DiagramFolder) => {
    if (confirm(`确定要删除文件夹 "${folder.name}" 吗？文件夹内的图表将移至根目录。`)) {
      await deleteFolder(folder.id)
    }
  }

  const openRenameFolderDialog = (folder: DiagramFolder) => {
    setEditingFolder(folder)
    setInputName(folder.name)
    setEditFolderOpen(true)
  }

  // ── Diagram selection ──

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

  // ── Paste / import ──

  const createSvgDiagramFromSource = async (source: string, name = '粘贴的 SVG') => {
    const diagram = await createDiagram(projectId, name, 'svg', source)
    setCurrentDiagram(diagram)
    onSelectDiagram(diagram)
  }

  const createImageDiagramFromFile = async (file: File) => {
    const source = await readFileAsDataUrl(file)
    const type = getImageTypeFromDataUrl(source) ?? 'png'
    const baseName = file.name.replace(/\.(png|jpe?g|webp)$/i, '')
    const diagram = await createDiagram(projectId, baseName || `粘贴的 ${type.toUpperCase()}`, type, source)
    setCurrentDiagram(diagram)
    onSelectDiagram(diagram)
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return
    const editableTarget = isEditablePasteTarget(e.target)
    const clipboardHasFiles = hasClipboardFiles(e.clipboardData)
    if (editableTarget && !clipboardHasFiles) return

    const imageFile = getImageClipboardFile(e.clipboardData)
    if (imageFile) { e.preventDefault(); e.stopPropagation(); await createImageDiagramFromFile(imageFile); return }

    const svgFile = getSvgClipboardFile(e.clipboardData)
    if (svgFile) {
      e.preventDefault(); e.stopPropagation()
      await createSvgDiagramFromSource(await svgFile.text(), svgFile.name.replace(/\.svg$/i, '') || '粘贴的 SVG')
      return
    }

    const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text/html')
    if (!isSvgSource(text)) return
    e.preventDefault(); e.stopPropagation()
    await createSvgDiagramFromSource(text)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const diagram = await importDiagram(file, projectId)
      await loadDiagramsByProject(projectId)
      setCurrentDiagram(diagram)
      onSelectDiagram(diagram)
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Folder collapse toggle ──

  const toggleFolder = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Load folders alongside diagrams ──

  // folders are loaded by parent (ProjectPage) via useFolderStore, same as diagrams

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="diagram-list flex flex-col h-full min-h-0" onPaste={handlePaste}>
      {/* Toolbar */}
      <div className="diagram-list-toolbar p-3 border-b flex items-center gap-2">
        <Dialog open={createDiagramOpen} onOpenChange={setCreateDiagramOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => { setCreateDiagramFolderId(null); setInputName(''); setNewDiagramType('mermaid') }}
            >
              <Plus className="h-4 w-4 mr-1" />
              新建图表
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建图表</DialogTitle>
              <DialogDescription>
                {createDiagramFolderId
                  ? `在文件夹「${folders.find(f => f.id === createDiagramFolderId)?.name ?? ''}」中创建`
                  : '默认创建 Mermaid 图表，也可以手动切换为 HTML、SVG 或图片格式'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>图表名称</Label>
                <Input value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="输入图表名称" />
              </div>
              <div className="space-y-2">
                <Label>图表类型</Label>
                <Select value={newDiagramType} onValueChange={(v) => setNewDiagramType(v as DiagramType)}>
                  <SelectTrigger><SelectValue placeholder="选择图表类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mermaid">Mermaid</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="svg">SVG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpg">JPG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDiagramOpen(false)}>取消</Button>
              <Button onClick={handleCreateDiagram}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Folder */}
        <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              title="新建文件夹"
              onClick={() => { setCreateFolderParentId(null); setInputName('') }}
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建文件夹</DialogTitle>
              <DialogDescription>
                {createFolderParentId
                  ? `在「${folders.find(f => f.id === createFolderParentId)?.name ?? ''}」中创建子文件夹`
                  : '在根目录创建文件夹'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label>文件夹名称</Label>
              <Input value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="输入文件夹名称" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>取消</Button>
              <Button onClick={handleCreateFolder}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          title="导入图表"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={getDiagramAcceptTypes()}
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {/* Tree */}
      <ScrollArea
        className="flex-1 min-h-0"
        viewportClassName="[&>div]:!block [&>div]:!min-w-0 min-h-0"
        contentClassName="block min-w-0"
      >
        {diagrams.length === 0 && folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
            <FileCode2 className="h-8 w-8 mb-2" />
            <p>暂无图表</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rootItemIds} strategy={verticalListSortingStrategy}>
              <div className="p-2 space-y-1">
                <TreeRenderer
                  nodes={tree}
                  depth={0}
                  collapsedFolders={collapsedFolders}
                  overFolderId={overFolderId}
                  currentDiagramId={currentDiagram?.id}
                  isAuthenticated={isAuthenticated}
                  onToggleFolder={toggleFolder}
                  onEditDiagram={openEditDiagramDialog}
                  onExportDiagram={handleExportDiagram}
                  onDeleteDiagram={handleDeleteDiagram}
                  onClickDiagram={handleDiagramClick}
                  onRenameFolderOpen={openRenameFolderDialog}
                  onDeleteFolder={handleDeleteFolder}
                  onNewDiagramInFolder={openCreateDiagramInFolder}
                  onNewSubfolder={openCreateSubfolder}
                />
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>

      {/* Edit Diagram Dialog */}
      <Dialog open={editDiagramOpen} onOpenChange={setEditDiagramOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名图表</DialogTitle>
            <DialogDescription>修改图表名称</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>图表名称</Label>
            <Input value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="输入图表名称" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDiagramOpen(false)}>取消</Button>
            <Button onClick={handleEditDiagram}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={editFolderOpen} onOpenChange={setEditFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名文件夹</DialogTitle>
            <DialogDescription>修改文件夹名称</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label>文件夹名称</Label>
            <Input value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="输入文件夹名称" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolderOpen(false)}>取消</Button>
            <Button onClick={handleEditFolder}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
