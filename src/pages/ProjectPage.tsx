import { useEffect, useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useDiagramStore } from '@/stores/diagramStore'
import { DiagramList } from '@/components/diagram/DiagramList'
import { DiagramEditor } from '@/components/mermaid/DiagramEditor'
import { Button } from '@/components/ui/button'
import { ArrowLeft, PanelLeftClose, PanelLeft, ChevronDown, ChevronUp } from 'lucide-react'
import type { Diagram } from '@/types'

const STORAGE_KEY = 'project-sidebar-state'
const DEFAULT_WIDTH = 280
const MIN_WIDTH = 220
const MAX_WIDTH = 400

interface SidebarState {
  width: number
  collapsed: boolean
  diagramListCollapsed: boolean
}

function loadSidebarState(): SidebarState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // 忽略 localStorage 错误
  }
  return { width: DEFAULT_WIDTH, collapsed: false, diagramListCollapsed: false }
}

function saveSidebarState(state: SidebarState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 忽略 localStorage 错误
  }
}

interface ProjectPageProps {
  projectId: string
  onBack: () => void
}

export function ProjectPage({ projectId, onBack }: ProjectPageProps) {
  const { projects, currentProject, setCurrentProject } = useProjectStore()
  const { loadDiagramsByProject, currentDiagram, setCurrentDiagram } = useDiagramStore()

  const [sidebarState, setSidebarState] = useState<SidebarState>(loadSidebarState)
  const [isResizing, setIsResizing] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setCurrentProject(project)
      loadDiagramsByProject(projectId)
    }
  }, [projectId, projects, setCurrentProject, loadDiagramsByProject])

  useEffect(() => {
    return () => {
      setCurrentDiagram(null)
    }
  }, [setCurrentDiagram])

  // 持久化侧边栏状态
  useEffect(() => {
    saveSidebarState(sidebarState)
  }, [sidebarState])

  const handleSelectDiagram = (diagram: Diagram) => {
    setCurrentDiagram(diagram)
  }

  const toggleSidebar = useCallback(() => {
    setIsAnimating(true)
    setSidebarState(prev => ({ ...prev, collapsed: !prev.collapsed }))
    // 动画结束后关闭动画标记
    setTimeout(() => setIsAnimating(false), 300)
  }, [])

  const toggleDiagramList = useCallback(() => {
    setSidebarState(prev => ({ ...prev, diagramListCollapsed: !prev.diagramListCollapsed }))
  }, [])

  // 拖拽调整宽度
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - 56)) // 56 = AppLayout aside width
      setSidebarState(prev => ({ ...prev, width: newWidth }))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">项目不存在</div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 全屏画布 - 渲染器 */}
      {currentDiagram ? (
        <DiagramEditor
          diagramId={currentDiagram.id}
          sidebarWidth={sidebarState.collapsed ? 0 : sidebarState.width}
          sidebarAnimating={isAnimating}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/30">
          选择或创建一个图表开始编辑
        </div>
      )}

      {/* 浮层侧边栏 - 项目/图表列表 */}
      <div
        className={`
          absolute top-0 left-0 bottom-0 z-30
          flex flex-col
          bg-background/95 backdrop-blur-md
          border-r shadow-xl
          ${isAnimating ? 'transition-all duration-300 ease-out' : ''}
          ${sidebarState.collapsed ? '-translate-x-full' : 'translate-x-0'}
        `}
        style={{ width: sidebarState.width }}
      >
        {/* 项目头部 */}
        <div className="p-3 border-b shrink-0">
          <div className="flex items-center justify-between mb-2">
            <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleSidebar} title="收起侧栏" className="h-8 w-8">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="font-semibold truncate text-sm">{currentProject.name}</h2>
          {currentProject.description && (
            <p className="text-xs text-muted-foreground truncate">
              {currentProject.description}
            </p>
          )}
        </div>

        {/* 图表列表区域 - 可折叠 */}
        <div className="flex flex-col min-h-0 flex-1">
          <button
            className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border-b"
            onClick={toggleDiagramList}
          >
            <span>图表列表</span>
            {sidebarState.diagramListCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>

          <div
            className={`
              overflow-hidden transition-all duration-200
              ${sidebarState.diagramListCollapsed ? 'max-h-0' : 'flex-1 min-h-0'}
            `}
          >
            <DiagramList
              projectId={projectId}
              onSelectDiagram={handleSelectDiagram}
            />
          </div>
        </div>
      </div>

      {/* 拖拽分隔条 */}
      {!sidebarState.collapsed && (
        <div
          className="absolute top-0 bottom-0 w-1 z-40 bg-transparent hover:bg-primary/30 cursor-col-resize"
          style={{ left: sidebarState.width }}
          onMouseDown={handleMouseDown}
        />
      )}

      {/* 展开按钮 - 侧栏收起时显示 */}
      {sidebarState.collapsed && (
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSidebar}
          className="absolute left-3 top-3 z-40 bg-background/80 backdrop-blur-sm shadow-lg"
          title="展开侧栏"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
