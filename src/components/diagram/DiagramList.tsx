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
} from 'lucide-react'
import { exportDiagramToMmd, importFromMmd } from '@/utils/export'
import { SyncStatusBadge } from '@/components/sync'
import type { Diagram } from '@/types'

interface DiagramListProps {
  projectId: string
  onSelectDiagram: (diagram: Diagram) => void
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
  } = useDiagramStore()

  const { isAuthenticated } = useSyncStore()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingDiagram, setEditingDiagram] = useState<Diagram | null>(null)
  const [newDiagramName, setNewDiagramName] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

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
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b flex items-center gap-2">
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex-1">
              <Plus className="h-4 w-4 mr-1" />
              新建图表
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建图表</DialogTitle>
              <DialogDescription>创建一个新的 Mermaid 图表</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>图表名称</Label>
                <Input
                  value={newDiagramName}
                  onChange={(e) => setNewDiagramName(e.target.value)}
                  placeholder="输入图表名称"
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
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mmd"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      <ScrollArea className="flex-1">
        {diagrams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
            <FileCode2 className="h-8 w-8 mb-2" />
            <p>暂无图表</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {diagrams.map((diagram) => (
              <div
                key={diagram.id}
                className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-accent ${
                  currentDiagram?.id === diagram.id ? 'bg-accent' : ''
                }`}
                onClick={(e) => handleDiagramClick(e, diagram)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{diagram.name}</span>
                  {isAuthenticated && diagram.syncStatus && (
                    <SyncStatusBadge status={diagram.syncStatus} size="sm" />
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(diagram) }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleExport(diagram) }}>
                      <Download className="h-4 w-4 mr-2" />
                      导出 .mmd
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(diagram) }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名图表</DialogTitle>
            <DialogDescription>修改图表名称</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>图表名称</Label>
              <Input
                value={newDiagramName}
                onChange={(e) => setNewDiagramName(e.target.value)}
                placeholder="输入图表名称"
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
