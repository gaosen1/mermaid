import { useState, useRef } from 'react'
import { useProjectStore } from '@/stores/projectStore'
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
} from 'lucide-react'
import {
  exportProjectToZip,
  exportProjectToJson,
  importFromZip,
  importFromJson,
} from '@/utils/export'
import type { Project } from '@/types'

interface ProjectListProps {
  onSelectProject: (project: Project) => void
}

export function ProjectList({ onSelectProject }: ProjectListProps) {
  const {
    loading,
    searchQuery,
    selectedTags,
    setSearchQuery,
    setSelectedTags,
    getAllTags,
    getFilteredProjects,
    createProject,
    updateProject,
    deleteProject,
    loadProjects,
  } = useProjectStore()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [newProjectTags, setNewProjectTags] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const projects = getFilteredProjects()
  const allTags = getAllTags()

  const handleCreate = async () => {
    if (!newProjectName.trim()) return
    const tags = newProjectTags.split(',').map((t) => t.trim()).filter(Boolean)
    await createProject(newProjectName, newProjectDescription || undefined, tags)
    setNewProjectName('')
    setNewProjectDescription('')
    setNewProjectTags('')
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
    setEditingProject(null)
    setNewProjectName('')
    setNewProjectDescription('')
    setNewProjectTags('')
    setEditDialogOpen(false)
  }

  const handleDelete = async (project: Project) => {
    if (confirm(`确定要删除项目 "${project.name}" 吗？此操作不可撤销。`)) {
      await deleteProject(project.id)
    }
  }

  const handleExportZip = async (project: Project) => {
    await exportProjectToZip(project)
  }

  const handleExportJson = async (project: Project) => {
    await exportProjectToJson(project)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      if (file.name.endsWith('.zip')) {
        await importFromZip(file)
      } else if (file.name.endsWith('.json')) {
        await importFromJson(file)
      } else {
        alert('不支持的文件格式，请选择 .zip 或 .json 文件')
        return
      }
      await loadProjects()
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openEditDialog = (project: Project) => {
    setEditingProject(project)
    setNewProjectName(project.name)
    setNewProjectDescription(project.description || '')
    setNewProjectTags(project.tags.join(', '))
    setEditDialogOpen(true)
  }

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag))
    } else {
      setSelectedTags([...selectedTags, tag])
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
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
                  <Input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="输入项目名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label>描述 (可选)</Label>
                  <Textarea
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="输入项目描述"
                  />
                </div>
                <div className="space-y-2">
                  <Label>标签 (可选，用逗号分隔)</Label>
                  <Input
                    value={newProjectTags}
                    onChange={(e) => setNewProjectTags(e.target.value)}
                    placeholder="例如: 流程图, 工作流"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreate}>创建</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />
            导入
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.json"
            className="hidden"
            onChange={handleImport}
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {allTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            ))}
            {selectedTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTags([])}
              >
                清除
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderOpen className="h-12 w-12 mb-4" />
            <p>暂无项目</p>
            <p className="text-sm">点击"新建"创建第一个项目</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => onSelectProject(project)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(project) }}>
                          <Pencil className="h-4 w-4 mr-2" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExportZip(project) }}>
                          <Download className="h-4 w-4 mr-2" />
                          导出 ZIP
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExportJson(project) }}>
                          <Download className="h-4 w-4 mr-2" />
                          导出 JSON
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(project) }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 flex-wrap">
                      {project.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>修改项目信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>项目名称</Label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="输入项目名称"
              />
            </div>
            <div className="space-y-2">
              <Label>描述 (可选)</Label>
              <Textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="输入项目描述"
              />
            </div>
            <div className="space-y-2">
              <Label>标签 (可选，用逗号分隔)</Label>
              <Input
                value={newProjectTags}
                onChange={(e) => setNewProjectTags(e.target.value)}
                placeholder="例如: 流程图, 工作流"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
