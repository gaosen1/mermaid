import { useEffect, useState, useCallback } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useDiagramStore } from '@/stores/diagramStore'
import { DiagramList } from '@/components/diagram/DiagramList'
import { DiagramEditor } from '@/components/mermaid/DiagramEditor'
import { HtmlDiagramEditor } from '@/components/html/HtmlDiagramEditor'
import { SvgDiagramEditor } from '@/components/svg/SvgDiagramEditor'
import { PngDiagramViewer } from '@/components/png/PngDiagramViewer'
import { Button } from '@/components/ui/button'
import { ArrowLeft, PanelLeftClose, PanelLeft, ChevronDown, ChevronUp } from 'lucide-react'
import type { Diagram } from '@/types'
import { getSvgClipboardFile, isEditablePasteTarget, isSvgSource } from '@/utils/svg'
import { getImageClipboardFile, hasClipboardFiles, readFileAsDataUrl, getImageTypeFromDataUrl } from '@/utils/png'

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
  initialDiagramId?: string | null
  onBack: () => void
  onSelectDiagram?: (diagramId: string | null) => void
}

export function ProjectPage({ projectId, initialDiagramId = null, onBack, onSelectDiagram }: ProjectPageProps) {
  const { projects, currentProject, loading: projectLoading, setCurrentProject } = useProjectStore()
  const { diagrams, loadDiagramsByProject, currentDiagram, setCurrentDiagram, createDiagram } = useDiagramStore()

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
    setCurrentDiagram(null)
  }, [projectId, setCurrentDiagram])

  // 持久化侧边栏状态
  useEffect(() => {
    saveSidebarState(sidebarState)
  }, [sidebarState])

  const handleSelectDiagram = (diagram: Diagram) => {
    setCurrentDiagram(diagram)
    onSelectDiagram?.(diagram.id)
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return

    const editableTarget = isEditablePasteTarget(e.target)
    const clipboardHasFiles = hasClipboardFiles(e.clipboardData)

    if (editableTarget && !clipboardHasFiles) return

    const imageFile = getImageClipboardFile(e.clipboardData)
    if (imageFile) {
      e.preventDefault()
      const source = await readFileAsDataUrl(imageFile)
      const type = getImageTypeFromDataUrl(source) ?? 'png'
      const baseName = imageFile.name.replace(/\.(png|jpe?g|webp)$/i, '')
      const name = baseName || `粘贴的 ${type.toUpperCase()}`
      const diagram = await createDiagram(projectId, name, type, source)
      setCurrentDiagram(diagram)
      onSelectDiagram?.(diagram.id)
      return
    }

    const svgFile = getSvgClipboardFile(e.clipboardData)
    if (svgFile) {
      e.preventDefault()
      const source = await svgFile.text()
      const diagram = await createDiagram(projectId, svgFile.name.replace(/\.svg$/i, '') || '粘贴的 SVG', 'svg', source)
      setCurrentDiagram(diagram)
      onSelectDiagram?.(diagram.id)
      return
    }

    const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text/html')
    if (!isSvgSource(text)) return

    e.preventDefault()
    const diagram = await createDiagram(projectId, '粘贴的 SVG', 'svg', text)
    setCurrentDiagram(diagram)
    onSelectDiagram?.(diagram.id)
  }

  useEffect(() => {
    if (!initialDiagramId || diagrams.length === 0) return
    if (currentDiagram?.id === initialDiagramId) return

    const target = diagrams.find((diagram) => diagram.id === initialDiagramId)
    if (target) {
      setCurrentDiagram(target)
      onSelectDiagram?.(target.id)
    }
  }, [currentDiagram?.id, diagrams, initialDiagramId, onSelectDiagram, setCurrentDiagram])

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

  const projectExistsInList = projects.some((project) => project.id === projectId)

  if (projectLoading || (!currentProject && (projects.length === 0 || projectExistsInList))) {
    return (
      <div className="project-page-loading flex items-center justify-center h-full">
        <div className="project-page-loading-text text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (!currentProject) {
    return (
      <div className="project-page-empty flex items-center justify-center h-full">
        <div className="project-page-empty-text text-muted-foreground">项目不存在</div>
      </div>
    )
  }

  return (
    <div className="project-page relative h-full w-full overflow-hidden" onPasteCapture={handlePaste}>
      {/* 全屏画布 - 渲染器 */}
      {currentDiagram ? (
        currentDiagram.type === 'html' ? (
          <HtmlDiagramEditor
            diagramId={currentDiagram.id}
            sidebarWidth={sidebarState.collapsed ? 0 : sidebarState.width}
            sidebarAnimating={isAnimating}
          />
        ) : currentDiagram.type === 'svg' ? (
          <SvgDiagramEditor
            diagramId={currentDiagram.id}
            sidebarWidth={sidebarState.collapsed ? 0 : sidebarState.width}
            sidebarAnimating={isAnimating}
          />
        ) : currentDiagram.type === 'png' || currentDiagram.type === 'jpg' || currentDiagram.type === 'webp' ? (
          <PngDiagramViewer diagramId={currentDiagram.id} />
        ) : (
          <DiagramEditor
            diagramId={currentDiagram.id}
            sidebarWidth={sidebarState.collapsed ? 0 : sidebarState.width}
            sidebarAnimating={isAnimating}
          />
        )
      ) : (
        <div className="project-page-editor-empty flex items-center justify-center h-full text-muted-foreground bg-muted/30">
          选择或创建一个图表开始编辑
        </div>
      )}

      {/* 浮层侧边栏 - 项目/图表列表 */}
      <div
        className={`
          project-page-sidebar
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
        <div className="project-page-sidebar-header p-3 border-b shrink-0">
          <div className="project-page-sidebar-header-actions flex items-center justify-between mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="project-page-back-button h-8"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              title="收起侧栏"
              className="project-page-sidebar-collapse-button h-8 w-8"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="project-page-title font-semibold truncate text-sm">{currentProject.name}</h2>
          {currentProject.description && (
            <p className="project-page-description text-xs text-muted-foreground truncate">
              {currentProject.description}
            </p>
          )}
        </div>

        {/* 图表列表区域 - 可折叠 */}
        <div className="project-page-diagram-section flex flex-col min-h-0 flex-1">
          <button
            className="project-page-diagram-section-toggle flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border-b"
            onClick={toggleDiagramList}
          >
            <span className="project-page-diagram-section-title">图表列表</span>
            {sidebarState.diagramListCollapsed ? (
              <ChevronDown className="project-page-diagram-section-icon h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="project-page-diagram-section-icon h-3.5 w-3.5" />
            )}
          </button>

          <div
            className={`
              project-page-diagram-section-content
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
          className="project-page-sidebar-resizer absolute top-0 bottom-0 w-1 z-40 bg-transparent hover:bg-primary/30 cursor-col-resize"
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
          className="project-page-sidebar-expand-button absolute left-3 top-3 z-40 bg-background/80 backdrop-blur-sm shadow-lg"
          title="展开侧栏"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
