import { useCallback, useEffect, useRef, useState } from 'react'
import { CodeEditor } from '@/components/mermaid/CodeEditor'
import { useDiagramStore } from '@/stores/diagramStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettingsStore } from '@/stores/settingsStore'
import { ChevronDown, Download, FileCode2, History, PanelLeft, PanelLeftClose, Save } from 'lucide-react'
import { exportDiagram } from '@/utils/export'
import { parseMarkdown, markdownTableToHtml } from '@/utils/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'

const EDITOR_STORAGE_KEY = 'markdown-diagram-editor-state'

interface EditorPanelState {
  collapsed: boolean
  width: number
}

function loadEditorState(): EditorPanelState {
  try {
    const saved = localStorage.getItem(EDITOR_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // ignore
  }
  return { collapsed: false, width: 420 }
}

function saveEditorState(state: EditorPanelState) {
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

interface MarkdownTableEditorProps {
  diagramId: string
  sidebarWidth?: number
  sidebarAnimating?: boolean
}

const CANVAS_STORAGE_KEY = 'markdown-diagram-canvas-state'

interface CanvasState {
  scale: number
  offsetX: number
  offsetY: number
}

function loadCanvasState(diagramId: string): CanvasState {
  try {
    const saved = localStorage.getItem(`${CANVAS_STORAGE_KEY}-${diagramId}`)
    if (saved) return JSON.parse(saved)
  } catch {
    // ignore
  }
  return { scale: 1, offsetX: 0, offsetY: 0 }
}

function saveCanvasState(diagramId: string, state: CanvasState) {
  try {
    localStorage.setItem(`${CANVAS_STORAGE_KEY}-${diagramId}`, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function MarkdownTableEditor({
  diagramId,
  sidebarWidth = 0,
  sidebarAnimating = false,
}: MarkdownTableEditorProps) {
  const { currentDiagram, updateDiagram, createSnapshot, loadSnapshots, snapshots, restoreSnapshot, deleteSnapshot } =
    useDiagramStore()
  const { settings } = useSettingsStore()

  const [source, setSource] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [panelState, setPanelState] = useState<EditorPanelState>(loadEditorState)
  const [activeTab, setActiveTab] = useState<'preview' | 'history'>('preview')
  const [isPanelHovered, setIsPanelHovered] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [canvasState, setCanvasState] = useState<CanvasState>(() => loadCanvasState(diagramId))
  const autoSaveTimerRef = useRef<number | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const isRightMouseDownRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const updateDarkMode = () => {
      const root = window.document.documentElement
      setIsDarkMode(root.classList.contains('dark'))
    }

    updateDarkMode()

    const observer = new MutationObserver(updateDarkMode)
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (currentDiagram?.type === 'markdown') {
      setSource(currentDiagram.source)
      setHasChanges(false)
      loadSnapshots(currentDiagram.id)
    }
  }, [currentDiagram, loadSnapshots])

  useEffect(() => {
    saveEditorState(panelState)
  }, [panelState])

  const handleSave = useCallback(
    async (isAuto = false) => {
      if (!currentDiagram || currentDiagram.type !== 'markdown') return

      await createSnapshot(
        currentDiagram.id,
        currentDiagram.source,
        isAuto ? '自动保存' : '手动保存',
        isAuto
      )

      await updateDiagram(diagramId, {
        source,
        config: undefined,
      })

      setHasChanges(false)
    },
    [createSnapshot, currentDiagram, diagramId, source, updateDiagram]
  )

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    if (hasChanges && currentDiagram && settings.autoSaveInterval > 0) {
      autoSaveTimerRef.current = window.setTimeout(() => {
        handleSave(true)
      }, settings.autoSaveInterval)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [currentDiagram, handleSave, hasChanges, settings.autoSaveInterval])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setCanvasState((prev) => {
        const newScale = Math.max(0.1, Math.min(3, prev.scale * delta))
        const updated = { ...prev, scale: newScale }
        saveCanvasState(diagramId, updated)
        return updated
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        isRightMouseDownRef.current = true
        lastMousePosRef.current = { x: e.clientX, y: e.clientY }
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isRightMouseDownRef.current) return

      const deltaX = e.clientX - lastMousePosRef.current.x
      const deltaY = e.clientY - lastMousePosRef.current.y

      lastMousePosRef.current = { x: e.clientX, y: e.clientY }

      setCanvasState((prev) => {
        const updated = {
          ...prev,
          offsetX: prev.offsetX + deltaX,
          offsetY: prev.offsetY + deltaY,
        }
        saveCanvasState(diagramId, updated)
        return updated
      })
    }

    const handleMouseUp = () => {
      isRightMouseDownRef.current = false
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    preview.addEventListener('wheel', handleWheel, { passive: false })
    preview.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    preview.addEventListener('contextmenu', handleContextMenu)

    return () => {
      preview.removeEventListener('wheel', handleWheel)
      preview.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      preview.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [diagramId])

  const togglePanel = useCallback(() => {
    setIsAnimating(true)
    setPanelState((prev) => ({ ...prev, collapsed: !prev.collapsed }))
    setTimeout(() => setIsAnimating(false), 300)
  }, [])

  const handleSourceChange = useCallback((newSource: string) => {
    setSource(newSource)
    setHasChanges(true)
  }, [])

  const handleExportSource = useCallback(async () => {
    if (!currentDiagram || currentDiagram.type !== 'markdown') return

    await exportDiagram({
      ...currentDiagram,
      source,
    })
  }, [currentDiagram, source])

  if (!currentDiagram || currentDiagram.type !== 'markdown') {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请选择一个 Markdown 图表
      </div>
    )
  }

  const parsed = parseMarkdown(source)
  const isTable = parsed.type === 'table'
  const tableHtml = isTable && parsed.rows ? markdownTableToHtml(parsed.rows) : ''

  const editorLeft = sidebarWidth === 0 ? 12 : sidebarWidth + 4
  const editorTop = sidebarWidth === 0 ? 60 : 12
  const editorBottom = 12

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Preview area with canvas controls */}
      <div
        ref={previewRef}
        className="absolute inset-0 bg-background overflow-hidden p-4 cursor-grab active:cursor-grabbing"
      >
        <div
          className="inline-block origin-top-left"
          style={{
            transform: `translate(${canvasState.offsetX}px, ${canvasState.offsetY}px) scale(${canvasState.scale})`,
          }}
        >
          {isTable ? (
            <div className="max-w-full">
              <style>{`
                .markdown-table {
                  border-collapse: collapse;
                }
                .markdown-table th,
                .markdown-table td {
                  border: 1px solid var(--border);
                  padding: 0.5rem;
                  text-align: left;
                }
                .markdown-table th {
                  background-color: var(--muted);
                  font-weight: 600;
                }
                .markdown-table tr:nth-child(even) {
                  background-color: var(--muted);
                }
              `}</style>
              <div
                className="markdown-table text-sm"
                dangerouslySetInnerHTML={{ __html: tableHtml }}
              />
            </div>
          ) : (
            <div className="text-muted-foreground whitespace-pre-wrap font-mono text-sm">
              {parsed.text}
            </div>
          )}
        </div>

        {/* Canvas controls hint */}
        <div className="absolute bottom-2 left-2 text-xs text-muted-foreground pointer-events-none">
          <div>🖱️ 滚轮: 缩放</div>
          <div>🖱️ 右键拖拽: 移动</div>
        </div>
      </div>

      {/* Editor panel */}
      <div
        className={`
          absolute z-20
          flex flex-col
          bg-background/95 backdrop-blur-md
          border rounded-lg shadow-2xl
          ${isAnimating || sidebarAnimating ? 'transition-[left,top,bottom,opacity] duration-300 ease-out' : ''}
          ${panelState.collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{
          width: panelState.width,
          left: panelState.collapsed ? -panelState.width : editorLeft,
          top: editorTop,
          bottom: editorBottom,
        }}
        onMouseEnter={() => setIsPanelHovered(true)}
        onMouseLeave={() => setIsPanelHovered(false)}
      >
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold truncate">{currentDiagram.name}</h2>
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Markdown
            </span>
            {hasChanges && <span className="text-xs text-orange-500 shrink-0">●</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={togglePanel} title="收起面板" className="h-7 w-7">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 border-b shrink-0 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileCode2 className="h-3.5 w-3.5" />
            Markdown 编辑器
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button variant="outline" size="sm" onClick={() => handleSave(false)} className="h-8 text-xs">
              <Save className="h-3.5 w-3.5 mr-1" />
              保存
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  导出
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportSource}>
                  导出 .md
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex border-b shrink-0">
          <button
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'preview'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('preview')}
          >
            代码
          </button>
          <button
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('history')}
          >
            <History className="h-3.5 w-3.5 inline mr-1" />
            历史
          </button>
        </div>

        <div
          className={`
            flex-1 min-h-0 overflow-hidden rounded-b-lg
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            ${isPanelHovered ? '[&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50' : ''}
          `}
        >
          {activeTab === 'preview' ? (
            <CodeEditor
              value={source}
              onChange={handleSourceChange}
              className="h-full border-0 rounded-none"
              darkMode={isDarkMode}
              language="markdown"
              placeholder="输入 Markdown 表格格式：&#10;| 列1 | 列2 |&#10;|-----|-----|&#10;| 值1 | 值2 |"
            />
          ) : (
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {snapshots.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-8">
                    暂无历史记录
                  </div>
                ) : (
                  snapshots.map((snapshot) => (
                    <div key={snapshot.id} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {snapshot.description || (snapshot.isAuto ? '自动保存' : '手动保存')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(snapshot.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreSnapshot(snapshot.id)}
                          className="h-7 text-xs"
                        >
                          恢复
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSnapshot(snapshot.id)}
                          className="h-7 text-xs"
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {panelState.collapsed && (
        <Button
          variant="outline"
          size="icon"
          onClick={togglePanel}
          className="absolute z-20 bg-background/80 backdrop-blur-sm shadow-lg transition-[left,top] duration-300 ease-out"
          style={{
            left: editorLeft,
            top: editorTop,
          }}
          title="展开编辑器"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
