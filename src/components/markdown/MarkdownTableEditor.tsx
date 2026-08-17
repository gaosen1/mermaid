import { useCallback, useEffect, useRef, useState } from 'react'
import { CodeEditor } from '@/components/mermaid/CodeEditor'
import { useDiagramStore } from '@/stores/diagramStore'
import { AiNamePopover } from '@/components/mermaid/AiNamePopover'
import { AiChatPanel } from '@/components/mermaid/AiChatPanel'
import { useFolderStore } from '@/stores/folderStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettingsStore } from '@/stores/settingsStore'
import { ChevronDown, Share2, FileCode2, History, PanelLeft, PanelLeftClose, Save, ZoomIn, ZoomOut, RotateCcw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { exportDiagram } from '@/utils/export'
import { toPortableMarkdown, toStandardMermaid, copyTextToClipboard } from '@/utils/portable'
import { bindGestureGuard, computeWheelTransform, getWheelMode, zoomViewState } from '@/utils/canvasGesture'
import { renderMarkdown, splitMermaidSegments } from '@/utils/markdown'
import { MermaidBlock, type MermaidBlockTheme } from './MermaidBlock'
import { getFolderPath } from '@/utils/folder'
import { getDiagramFilename } from '@/utils/diagram'
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

const CANVAS_VISIBLE_MARGIN = 40

function clampOffset(
  offsetX: number,
  offsetY: number,
  scale: number,
  previewW: number,
  previewH: number,
  contentEl: Element | null,
): { offsetX: number; offsetY: number } {
  if (!contentEl || previewW === 0 || previewH === 0) return { offsetX, offsetY }
  const cw = (contentEl as HTMLElement).offsetWidth
  const ch = (contentEl as HTMLElement).offsetHeight
  if (cw === 0 || ch === 0) return { offsetX, offsetY }
  const sw = cw * scale
  const sh = ch * scale
  const minX = -sw + CANVAS_VISIBLE_MARGIN
  const maxX = previewW - CANVAS_VISIBLE_MARGIN
  const minY = -sh + CANVAS_VISIBLE_MARGIN
  const maxY = previewH - CANVAS_VISIBLE_MARGIN
  return {
    offsetX: Math.max(minX, Math.min(maxX, offsetX)),
    offsetY: Math.max(minY, Math.min(maxY, offsetY)),
  }
}

export function MarkdownTableEditor({
  diagramId,
  sidebarWidth = 0,
  sidebarAnimating = false,
}: MarkdownTableEditorProps) {
  const {
    diagrams,
    currentDiagram,
    updateDiagram,
    createSnapshot,
    loadSnapshots,
    snapshots,
    restoreSnapshot,
    deleteSnapshot,
  } = useDiagramStore()
  const { settings } = useSettingsStore()
  const { folders } = useFolderStore()

  const relativePath = currentDiagram
    ? [...getFolderPath(currentDiagram.folderId, folders), getDiagramFilename(currentDiagram)].join(' / ')
    : ''

  const [source, setSource] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [panelState, setPanelState] = useState<EditorPanelState>(loadEditorState)
  const [activeTab, setActiveTab] = useState<'preview' | 'history' | 'ai'>('preview')
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
      const rect = preview.getBoundingClientRect()
      const content = preview.querySelector('.md-prose')
      setCanvasState((prev) => {
        const next = computeWheelTransform(
          e,
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          { scale: prev.scale, x: prev.offsetX, y: prev.offsetY },
          { minScale: 0.1, maxScale: 3 }
        )
        const { offsetX, offsetY } = clampOffset(next.x, next.y, next.scale, preview.clientWidth, preview.clientHeight, content)
        const updated = { ...prev, scale: next.scale, offsetX, offsetY }
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

      const content = preview.querySelector('.md-prose')
      setCanvasState((prev) => {
        const rawX = prev.offsetX + deltaX
        const rawY = prev.offsetY + deltaY
        const { offsetX, offsetY } = clampOffset(rawX, rawY, prev.scale, preview.clientWidth, preview.clientHeight, content)
        const updated = { ...prev, offsetX, offsetY }
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

    const handleDblClick = () => {
      const next: CanvasState = { scale: 1, offsetX: 0, offsetY: 0 }
      setCanvasState(next)
      saveCanvasState(diagramId, next)
    }

    preview.addEventListener('wheel', handleWheel, { passive: false })
    preview.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    preview.addEventListener('contextmenu', handleContextMenu)
    preview.addEventListener('dblclick', handleDblClick)
    const unguardGesture = bindGestureGuard(preview)

    return () => {
      preview.removeEventListener('wheel', handleWheel)
      preview.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      preview.removeEventListener('contextmenu', handleContextMenu)
      preview.removeEventListener('dblclick', handleDblClick)
      unguardGesture()
    }
  }, [diagramId])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const frame = requestAnimationFrame(() => {
      const content = preview.querySelector('.md-prose')
      if (!content) return
      setCanvasState((prev) => {
        const { offsetX, offsetY } = clampOffset(
          prev.offsetX,
          prev.offsetY,
          prev.scale,
          preview.clientWidth,
          preview.clientHeight,
          content,
        )
        if (offsetX === prev.offsetX && offsetY === prev.offsetY) return prev
        const updated = { ...prev, offsetX, offsetY }
        saveCanvasState(diagramId, updated)
        return updated
      })
    })
    return () => cancelAnimationFrame(frame)
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

  // 应用 AI 返回的 Markdown 前先留一个回滚快照，并立即刷新历史列表
  const handleApplyAiSource = useCallback(
    async (newSource: string) => {
      if (!currentDiagram || newSource === source) return
      await createSnapshot(currentDiagram.id, source, 'AI 应用前')
      handleSourceChange(newSource)
    },
    [createSnapshot, currentDiagram, source, handleSourceChange]
  )

  const resetCanvas = useCallback(() => {
    const next: CanvasState = { scale: 1, offsetX: 0, offsetY: 0 }
    setCanvasState(next)
    saveCanvasState(diagramId, next)
  }, [diagramId])

  // 工具栏缩放按钮：以视口中心为锚点
  const zoomCanvasBy = useCallback((factor: number) => {
    const preview = previewRef.current
    if (!preview) return
    setCanvasState((prev) => {
      const next = zoomViewState(
        { scale: prev.scale, x: prev.offsetX, y: prev.offsetY },
        { x: preview.clientWidth / 2, y: preview.clientHeight / 2 },
        factor,
        { minScale: 0.1, maxScale: 3 }
      )
      const content = preview.querySelector('.md-prose')
      const { offsetX, offsetY } = clampOffset(next.x, next.y, next.scale, preview.clientWidth, preview.clientHeight, content)
      const updated = { ...prev, scale: next.scale, offsetX, offsetY }
      saveCanvasState(diagramId, updated)
      return updated
    })
  }, [diagramId])

  const handleExportSource = useCallback(async () => {
    if (!currentDiagram || currentDiagram.type !== 'markdown') return

    await exportDiagram({
      ...currentDiagram,
      source,
    })
  }, [currentDiagram, source])

  // 复制整篇文档：内嵌 mermaid 块已标准化，可直接粘贴到其他平台
  const handleCopyPortableDoc = useCallback(async () => {
    try {
      await copyTextToClipboard(toPortableMarkdown(source))
      toast.success('已复制文档（内嵌图表已转为标准 Mermaid）')
    } catch {
      toast.error('复制失败，请检查浏览器剪贴板权限')
    }
  }, [source])

  // 复制单个内嵌 mermaid 块（标准化后）
  const handleCopyMermaidBlock = useCallback(async (blockSource: string) => {
    try {
      await copyTextToClipboard(toStandardMermaid(blockSource))
      toast.success('已复制标准 Mermaid 代码（动画效果无法外带）')
    } catch {
      toast.error('复制失败，请检查浏览器剪贴板权限')
    }
  }, [])

  const { html: renderedHtml, mermaidBlocks } = renderMarkdown(source)

  // ```mermaid 代码块：跟随设置主题，深色模式下切换 dark 主题，布局支持块内 Frontmatter 覆盖
  const mermaidTheme: MermaidBlockTheme = isDarkMode ? 'dark' : settings.renderTheme
  const segments = splitMermaidSegments(renderedHtml, mermaidBlocks)

  if (!currentDiagram || currentDiagram.type !== 'markdown') {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请选择一个 Markdown 图表
      </div>
    )
  }

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
          <style>{`
            .md-prose {
              width: 800px; max-width: 800px; font-size: 14px; line-height: 1.7;
              color: var(--foreground); overflow-wrap: anywhere; word-break: break-word;
            }
            .md-prose h1,.md-prose h2,.md-prose h3,.md-prose h4,.md-prose h5,.md-prose h6 {
              font-weight: 600; margin: 1.2em 0 0.4em; line-height: 1.3;
            }
            .md-prose h1 { font-size: 1.8em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
            .md-prose h2 { font-size: 1.4em; border-bottom: 1px solid var(--border); padding-bottom: 0.2em; }
            .md-prose h3 { font-size: 1.15em; }
            .md-prose p { margin: 0.6em 0; }
            .md-prose ul,.md-prose ol { padding-left: 1.6em; margin: 0.6em 0; list-style-position: outside; }
            .md-prose ul { list-style-type: disc; }
            .md-prose ol { list-style-type: decimal; }
            .md-prose li { margin: 0.2em 0; }
            .md-prose code {
              background: var(--muted); border-radius: 3px;
              padding: 0.1em 0.4em; font-size: 0.85em; font-family: monospace;
            }
            .md-prose pre {
              background: var(--muted); border-radius: 6px;
              padding: 1em; overflow-x: auto; margin: 0.8em 0;
            }
            .md-prose pre code { background: none; padding: 0; }
            .md-prose blockquote {
              border-left: 3px solid var(--border); margin: 0.8em 0;
              padding: 0.2em 1em; color: var(--muted-foreground);
            }
            .md-prose hr { border: none; border-top: 1px solid var(--border); margin: 1.2em 0; }
            .md-prose a { color: var(--primary); text-decoration: underline; }
            .md-prose table { border-collapse: collapse; table-layout: fixed; max-width: 100%; margin: 0.8em 0; }
            .md-prose th,.md-prose td {
              border: 1px solid var(--border); padding: 0.4em 0.8em; text-align: left;
              overflow-wrap: anywhere; word-break: break-word;
            }
            .md-prose th { background: var(--muted); font-weight: 600; }
            .md-prose tr:nth-child(even) td { background: hsl(var(--muted)/0.4); }
            .md-prose .md-mermaid {
              margin: 0.8em 0; padding: 0.8em;
              border: 1px solid var(--border); border-radius: 6px;
              background: var(--background); overflow-x: auto; text-align: center;
            }
            .md-prose .md-mermaid svg { max-width: 100%; height: auto; }
            .md-prose .md-mermaid-loading {
              padding: 1em 0; text-align: center;
              color: var(--muted-foreground); font-size: 0.9em;
            }
            .md-prose .md-mermaid-error-title {
              color: var(--destructive); font-weight: 600;
              margin-bottom: 0.4em; text-align: left; font-size: 0.9em;
            }
            .md-prose .md-mermaid-error-msg {
              color: var(--muted-foreground); font-family: monospace;
              font-size: 0.8em; line-height: 1.5;
              white-space: pre-wrap; text-align: left;
              margin: 0 0 0.5em;
            }
            .md-prose .md-mermaid-error-source {
              background: var(--muted); border-radius: 6px;
              padding: 0.8em; overflow-x: auto; margin: 0;
              font-family: monospace; font-size: 0.85em; text-align: left;
              white-space: pre;
            }
          `}</style>
          <div className="md-prose">
            {mermaidBlocks.length === 0 ? (
              <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            ) : (
              segments.map((segment, index) =>
                segment.type === 'html' ? (
                  <div key={`html-${index}`} dangerouslySetInnerHTML={{ __html: segment.html }} />
                ) : (
                  <MermaidBlock
                    key={`mermaid-${index}`}
                    source={segment.source}
                    theme={mermaidTheme}
                    layout={settings.defaultLayout}
                  />
                )
              )
            )}
          </div>
        </div>

        {/* Canvas controls hint */}
        <div className="absolute bottom-2 left-2 text-xs text-muted-foreground pointer-events-none space-y-0.5">
          <div>{getWheelMode() === 'zoom' ? '🖱️ 滚轮: 缩放' : '🖱️ 滚轮/双指: 平移'}</div>
          <div>🤏 捏合/Ctrl+滚轮: 缩放</div>
          <div>🖱️ 右键拖拽: 移动</div>
          <div>🖱️ 双击: 重置视图</div>
        </div>

        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur rounded px-1.5 py-0.5 select-none">
            {Math.round(canvasState.scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm"
            onClick={() => zoomCanvasBy(1 / 1.2)}
            title="缩小"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm"
            onClick={() => zoomCanvasBy(1.2)}
            title="放大"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetCanvas}
            className="h-7 text-xs bg-background/80 backdrop-blur-sm shadow-sm"
            title="重置视图（缩放 100% / 居中）"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
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
            <AiNamePopover
              diagram={currentDiagram}
              existingNames={diagrams.map((d) => d.name)}
              source={source}
              onApplyName={async (name) => {
                await updateDiagram(currentDiagram.id, { name })
              }}
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={togglePanel} title="收起面板" className="h-7 w-7">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 文件相对路径 */}
        <div
          className="diagram-editor-path px-3 py-1 border-b shrink-0 text-xs text-muted-foreground truncate"
          title={relativePath}
        >
          {relativePath}
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
                  <Share2 className="h-3.5 w-3.5 mr-1" />
                  分享
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>复制到其他平台</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleCopyPortableDoc}>
                  复制文档（内嵌图已标准化）
                </DropdownMenuItem>
                {mermaidBlocks.length > 0 && (
                  <>
                    {mermaidBlocks.length === 1 ? (
                      <DropdownMenuItem onClick={() => handleCopyMermaidBlock(mermaidBlocks[0])}>
                        复制标准 Mermaid 代码
                      </DropdownMenuItem>
                    ) : (
                      mermaidBlocks.map((block, index) => (
                        <DropdownMenuItem key={index} onClick={() => handleCopyMermaidBlock(block)}>
                          复制 Mermaid 块 {index + 1}
                        </DropdownMenuItem>
                      ))
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>下载</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleExportSource}>
                  下载 .md
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
          <button
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'ai'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('ai')}
          >
            <Sparkles className="h-3.5 w-3.5 inline mr-1" />
            AI
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
          {activeTab === 'preview' && (
            <CodeEditor
              value={source}
              onChange={handleSourceChange}
              className="h-full border-0 rounded-none"
              darkMode={isDarkMode}
              language="markdown"
              placeholder="输入 Markdown 内容（支持标题、表格、代码块、列表等）"
            />
          )}
          {activeTab === 'history' && (
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
          {/* AI 面板常驻挂载，切换标签不丢会话 */}
          <div className={`h-full ${activeTab === 'ai' ? '' : 'hidden'}`}>
            <AiChatPanel
              diagramId={diagramId}
              source={source}
              onApplySource={handleApplyAiSource}
              mode="markdown"
            />
          </div>
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
