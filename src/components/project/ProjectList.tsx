import { useState, useRef, useEffect, useCallback } from 'react'
import { useProjectStore, fuzzyMatch } from '@/stores/projectStore'
import type { ProjectSortMode } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { db } from '@/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  Upload,
  FolderOpen,
  Tag,
  GripVertical,
  ArrowUpDown,
  FileCode2,
} from 'lucide-react'
import {
  exportProjectToZip,
  exportProjectToJson,
  importFromZip,
  importFromJson,
} from '@/utils/export'
import { SyncStatusBadge } from '@/components/sync'
import type { Diagram, Project } from '@/types'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const SORT_LABELS: Record<ProjectSortMode, string> = {
  manual: '手动排序',
  updatedAt: '最近更新',
  createdAt: '创建时间',
  name: '名称',
}

// ─── DiagramSearchResult ──────────────────────────────────────────────────────

interface DiagramResult {
  diagram: Diagram
  project: Project
}

// ─── SortableProjectCard ──────────────────────────────────────────────────────

interface SortableProjectCardProps {
  project: Project
  isManualSort: boolean
  isAuthenticated: boolean
  onSelect: (project: Project) => void
  onEdit: (project: Project) => void
  onExportZip: (project: Project) => void
  onExportJson: (project: Project) => void
  onDelete: (project: Project) => void
}

function SortableProjectCard({
  project,
  isManualSort,
  isAuthenticated,
  onSelect,
  onEdit,
  onExportZip,
  onExportJson,
  onDelete,
}: SortableProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: !isManualSort,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <Card
        className="cursor-pointer hover:border-primary transition-colors h-full"
        onClick={() => onSelect(project)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1.5 overflow-hidden flex-1">
              {isManualSort && (
                <div
                  {...attributes}
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4" />
                </div>
              )}
              <div className="flex items-center gap-2 overflow-hidden">
                <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                {isAuthenticated && project.syncStatus && (
                  <SyncStatusBadge status={project.syncStatus} />
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(project) }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExportZip(project) }}>
                  <Download className="h-4 w-4 mr-2" />
                  导出 ZIP
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExportJson(project) }}>
                  <Download className="h-4 w-4 mr-2" />
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(project) }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2">{project.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1 flex-wrap">
              {project.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
            <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── ProjectList ──────────────────────────────────────────────────────────────

interface ProjectListProps {
  onSelectProject: (project: Project) => void
  onSelectDiagramResult?: (projectId: string, diagramId: string) => void
}

export function ProjectList({ onSelectProject, onSelectDiagramResult }: ProjectListProps) {
  const {
    projects,
    loading,
    searchQuery,
    selectedTags,
    sortMode,
    setSearchQuery,
    setSelectedTags,
    setSortMode,
    getAllTags,
    getFilteredProjects,
    createProject,
    updateProject,
    deleteProject,
    reorderProjects,
    loadProjects,
  } = useProjectStore()

  const { isAuthenticated } = useSyncStore()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [newProjectTags, setNewProjectTags] = useState('')
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // 图表搜索结果
  const [diagramResults, setDiagramResults] = useState<DiagramResult[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredProjects = getFilteredProjects()
  const allTags = getAllTags()
  const isManualSort = sortMode === 'manual'

  // ── 图表全局搜索 ──
  const searchDiagrams = useCallback(async (query: string) => {
    if (!query.trim()) { setDiagramResults([]); return }
    const allDiagrams = await db.diagrams.toArray()
    const matched = allDiagrams.filter((d) => fuzzyMatch(d.name, query))
    const projectMap = new Map(projects.map((p) => [p.id, p]))
    const results: DiagramResult[] = matched
      .map((d) => {
        const project = projectMap.get(d.projectId)
        return project ? { diagram: d, project } : null
      })
      .filter((r): r is DiagramResult => r !== null)
      // 按 diagram 名称相关性排序（完整包含优先）
      .sort((a, b) => {
        const aq = a.diagram.name.toLowerCase().includes(query.toLowerCase()) ? 0 : 1
        const bq = b.diagram.name.toLowerCase().includes(query.toLowerCase()) ? 0 : 1
        return aq - bq || a.diagram.name.localeCompare(b.diagram.name, 'zh')
      })
    setDiagramResults(results)
  }, [projects])

  useEffect(() => {
    const timer = setTimeout(() => searchDiagrams(searchQuery), 150)
    return () => clearTimeout(timer)
  }, [searchQuery, searchDiagrams])

  // ── DnD for manual sort ──
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = (event: DragStartEvent) => setActiveDragId(event.active.id as string)

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = filteredProjects.map((p) => p.id)
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx !== -1 && newIdx !== -1) {
      reorderProjects(arrayMove(ids, oldIdx, newIdx))
    }
  }

  // ── CRUD ──

  const handleCreate = async () => {
    if (!newProjectName.trim()) return
    const tags = newProjectTags.split(',').map((t) => t.trim()).filter(Boolean)
    await createProject(newProjectName, newProjectDescription || undefined, tags)
    setNewProjectName(''); setNewProjectDescription(''); setNewProjectTags('')
    setCreateDialogOpen(false)
  }

  const handleEdit = async () => {
    if (!editingProject || !newProjectName.trim()) return
    const tags = newProjectTags.split(',').map((t) => t.trim()).filter(Boolean)
    await updateProject(editingProject.id, {
      name: newProjectName,
      description: newProjectDescription || undefined,
      tags,
    })
    setEditingProject(null); setNewProjectName(''); setNewProjectDescription(''); setNewProjectTags('')
    setEditDialogOpen(false)
  }

  const openDeleteDialog = (project: Project) => { setDeletingProject(project); setDeleteDialogOpen(true) }

  const confirmDelete = async () => {
    if (!deletingProject) return
    await deleteProject(deletingProject.id)
    setDeletingProject(null); setDeleteDialogOpen(false)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      if (file.name.endsWith('.zip')) await importFromZip(file)
      else if (file.name.endsWith('.json')) await importFromJson(file)
      else { alert('不支持的文件格式，请选择 .zip 或 .json 文件'); return }
      await loadProjects()
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openEditDialog = (project: Project) => {
    setEditingProject(project)
    setNewProjectName(project.name)
    setNewProjectDescription(project.description || '')
    setNewProjectTags(project.tags.join(', '))
    setEditDialogOpen(true)
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  const activeDragProject = activeDragId ? filteredProjects.find((p) => p.id === activeDragId) : null

  // 搜索时是否有图表结果（且不在当前项目结果中）
  const extraDiagramResults = searchQuery.trim()
    ? diagramResults.filter((r) => !filteredProjects.find((p) => p.id === r.project.id) || true)
    : []

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目或图表..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Sort mode */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title={`排序：${SORT_LABELS[sortMode]}`}>
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sortMode} onValueChange={(v) => setSortMode(v as ProjectSortMode)}>
                {(Object.keys(SORT_LABELS) as ProjectSortMode[]).map((mode) => (
                  <DropdownMenuRadioItem key={mode} value={mode}>{SORT_LABELS[mode]}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                新建
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建项目</DialogTitle>
                <DialogDescription>创建一个新的 Mermaid 项目</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>项目名称</Label>
                  <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }} placeholder="输入项目名称" />
                </div>
                <div className="space-y-2">
                  <Label>描述 (可选)</Label>
                  <Textarea value={newProjectDescription} onChange={(e) => setNewProjectDescription(e.target.value)} placeholder="输入项目描述" />
                </div>
                <div className="space-y-2">
                  <Label>标签 (可选，用逗号分隔)</Label>
                  <Input value={newProjectTags} onChange={(e) => setNewProjectTags(e.target.value)} placeholder="例如: 流程图, 工作流" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
                <Button onClick={handleCreate}>创建</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            导入
          </Button>
          <input ref={fileInputRef} type="file" accept=".zip,.json" className="hidden" onChange={handleImport} />
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {allTags.map((tag) => (
              <Badge key={tag} variant={selectedTags.includes(tag) ? 'default' : 'outline'} className="cursor-pointer" onClick={() => toggleTag(tag)}>
                {tag}
              </Badge>
            ))}
            {selectedTags.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>清除</Button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Projects */}
        {filteredProjects.length === 0 && !searchQuery ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderOpen className="h-12 w-12 mb-4" />
            <p>暂无项目</p>
            <p className="text-sm">点击"新建"创建第一个项目</p>
          </div>
        ) : filteredProjects.length > 0 ? (
          <div>
            {searchQuery && (
              <p className="text-xs text-muted-foreground mb-2">
                项目 · {filteredProjects.length} 个结果
              </p>
            )}
            {isManualSort && !searchQuery ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={filteredProjects.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProjects.map((project) => (
                      <SortableProjectCard
                        key={project.id}
                        project={project}
                        isManualSort={true}
                        isAuthenticated={isAuthenticated}
                        onSelect={onSelectProject}
                        onEdit={openEditDialog}
                        onExportZip={(p) => exportProjectToZip(p)}
                        onExportJson={(p) => exportProjectToJson(p)}
                        onDelete={openDeleteDialog}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeDragProject ? (
                    <div className="rounded-lg border bg-card shadow-lg p-4 text-sm font-medium opacity-90">
                      {activeDragProject.name}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => (
                  <SortableProjectCard
                    key={project.id}
                    project={project}
                    isManualSort={false}
                    isAuthenticated={isAuthenticated}
                    onSelect={onSelectProject}
                    onEdit={openEditDialog}
                    onExportZip={(p) => exportProjectToZip(p)}
                    onExportJson={(p) => exportProjectToJson(p)}
                    onDelete={openDeleteDialog}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Diagram search results */}
        {searchQuery.trim() && extraDiagramResults.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              图表 · {extraDiagramResults.length} 个结果
            </p>
            <div className="space-y-1">
              {extraDiagramResults.map(({ diagram, project }) => (
                <button
                  key={diagram.id}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
                  onClick={() => {
                    if (onSelectDiagramResult) {
                      onSelectDiagramResult(project.id, diagram.id)
                    } else {
                      onSelectProject(project)
                    }
                  }}
                >
                  <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">{diagram.name}</span>
                    <span className="text-xs text-muted-foreground truncate block">{project.name}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{diagram.type}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty search */}
        {searchQuery.trim() && filteredProjects.length === 0 && extraDiagramResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p className="text-sm">未找到匹配的项目或图表</p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>确定要删除项目「{deletingProject?.name}」吗？此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>修改项目信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>项目名称</Label>
              <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="输入项目名称" />
            </div>
            <div className="space-y-2">
              <Label>描述 (可选)</Label>
              <Textarea value={newProjectDescription} onChange={(e) => setNewProjectDescription(e.target.value)} placeholder="输入项目描述" />
            </div>
            <div className="space-y-2">
              <Label>标签 (可选，用逗号分隔)</Label>
              <Input value={newProjectTags} onChange={(e) => setNewProjectTags(e.target.value)} placeholder="例如: 流程图, 工作流" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
