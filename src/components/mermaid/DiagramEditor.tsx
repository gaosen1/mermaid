import { useState, useEffect, useCallback, useRef } from 'react'
import { MermaidRenderer, type MermaidRendererRef } from './MermaidRenderer'
import { CodeEditor } from './CodeEditor'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDiagramStore } from '@/stores/diagramStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Save, History, Download, PanelLeftClose, PanelLeft, ChevronDown } from 'lucide-react'
import type { LayoutType } from '@/types'

const EDITOR_STORAGE_KEY = 'diagram-editor-state'

interface EditorPanelState {
  collapsed: boolean
  width: number
}

function loadEditorState(): EditorPanelState {
  try {
    const saved = localStorage.getItem(EDITOR_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // 忽略 localStorage 错误
  }
  return { collapsed: false, width: 420 }
}

function saveEditorState(state: EditorPanelState) {
  try {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 忽略 localStorage 错误
  }
}

interface DiagramEditorProps {
  diagramId: string
  sidebarWidth?: number
}

export function DiagramEditor({ diagramId, sidebarWidth = 0 }: DiagramEditorProps) {
  const { currentDiagram, updateDiagram, createSnapshot, loadSnapshots, snapshots, restoreSnapshot, deleteSnapshot } = useDiagramStore()
  const { settings } = useSettingsStore()

  const [editorState, setEditorState] = useState({
    source: '',
    layout: settings.defaultLayout as LayoutType,
    theme: settings.renderTheme as 'default' | 'dark' | 'forest' | 'neutral' | 'base',
    hasChanges: false,
  })
  const [panelState, setPanelState] = useState<EditorPanelState>(loadEditorState)
  const [activeTab, setActiveTab] = useState<'code' | 'history'>('code')
  const [isPanelHovered, setIsPanelHovered] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const autoSaveTimerRef = useRef<number | null>(null)
  const rendererRef = useRef<MermaidRendererRef>(null)

  const { source, layout, theme, hasChanges } = editorState

  useEffect(() => {
    if (currentDiagram) {
      setEditorState({
        source: currentDiagram.source,
        layout: currentDiagram.config?.layout || settings.defaultLayout,
        theme: currentDiagram.config?.theme || settings.renderTheme,
        hasChanges: false,
      })
      loadSnapshots(currentDiagram.id)
    }
  }, [currentDiagram, settings.defaultLayout, settings.renderTheme, loadSnapshots])

  useEffect(() => {
    saveEditorState(panelState)
  }, [panelState])

  const handleSourceChange = useCallback((newSource: string) => {
    setEditorState(prev => ({ ...prev, source: newSource, hasChanges: true }))
  }, [])

  const setLayout = useCallback((newLayout: LayoutType) => {
    setEditorState(prev => ({ ...prev, layout: newLayout }))
  }, [])

  const setTheme = useCallback((newTheme: 'default' | 'dark' | 'forest' | 'neutral' | 'base') => {
    setEditorState(prev => ({ ...prev, theme: newTheme }))
  }, [])

  const handleSave = useCallback(async (isAuto = false) => {
    if (!currentDiagram) return

    await createSnapshot(
      currentDiagram.id,
      currentDiagram.source,
      isAuto ? '自动保存' : '手动保存',
      isAuto
    )

    await updateDiagram(diagramId, {
      source,
      config: { layout, theme },
    })

    setEditorState(prev => ({ ...prev, hasChanges: false }))
  }, [currentDiagram, diagramId, source, layout, theme, updateDiagram, createSnapshot])

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
  }, [hasChanges, currentDiagram, settings.autoSaveInterval, handleSave])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave(false)
    }
  }, [handleSave])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const togglePanel = useCallback(() => {
    setIsAnimating(true)
    setPanelState(prev => ({ ...prev, collapsed: !prev.collapsed }))
    setTimeout(() => setIsAnimating(false), 300)
  }, [])

  const handleExportPng = useCallback(() => {
    rendererRef.current?.exportPng()
  }, [])

  const handleExportSvg = useCallback(() => {
    rendererRef.current?.exportSvg()
  }, [])

  if (!currentDiagram) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请选择一个图表
      </div>
    )
  }

  // 计算编辑器面板的左侧位置（紧靠侧边栏 + 分隔条）
  // 当侧边栏收起时，留出侧边栏展开按钮的空间 (12px left + 40px button + 8px gap = 60px)
  const editorLeft = sidebarWidth === 0 ? 52 : sidebarWidth + 4

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 全屏画布层 - 底层 */}
      <MermaidRenderer
        ref={rendererRef}
        source={source}
        layout={layout}
        theme={theme}
        className="absolute inset-0"
        showControls={true}
      />

      {/* 浮层编辑器面板 - 左侧悬浮，紧靠侧边栏 */}
      <div
        className={`
          absolute top-3 bottom-3 z-20
          flex flex-col
          bg-background/95 backdrop-blur-md
          border rounded-lg shadow-2xl
          transition-[left] duration-300 ease-out
          ${isAnimating ? 'transition-[left,opacity] duration-300 ease-out' : ''}
          ${panelState.collapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
        style={{
          width: panelState.width,
          left: panelState.collapsed ? -panelState.width : editorLeft,
        }}
        onMouseEnter={() => setIsPanelHovered(true)}
        onMouseLeave={() => setIsPanelHovered(false)}
      >
        {/* 面板头部 */}
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold truncate">{currentDiagram.name}</h2>
            {hasChanges && (
              <span className="text-xs text-orange-500 shrink-0">●</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={togglePanel} title="收起面板" className="h-7 w-7">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="flex items-center gap-2 p-2 border-b shrink-0 flex-wrap">
          <Select value={layout} onValueChange={(v) => setLayout(v as LayoutType)}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="布局" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elk">ELK</SelectItem>
              <SelectItem value="dagre">Dagre</SelectItem>
              <SelectItem value="hierarchical">Hierarchical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={theme} onValueChange={(v) => setTheme(v as 'default' | 'dark' | 'forest' | 'neutral' | 'base')}>
            <SelectTrigger className="w-[80px] h-8 text-xs">
              <SelectValue placeholder="主题" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认</SelectItem>
              <SelectItem value="dark">暗色</SelectItem>
              <SelectItem value="forest">森林</SelectItem>
              <SelectItem value="neutral">中性</SelectItem>
              <SelectItem value="base">基础</SelectItem>
            </SelectContent>
          </Select>

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
                <DropdownMenuItem onClick={handleExportPng}>
                  导出为 PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportSvg}>
                  导出为 SVG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 标签页切换 */}
        <div className="flex border-b shrink-0">
          <button
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === 'code'
                ? 'text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('code')}
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

        {/* 内容区 - 带自定义滚动条 */}
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
          {activeTab === 'code' ? (
            <CodeEditor
              value={source}
              onChange={handleSourceChange}
              className="h-full border-0 rounded-none"
              darkMode={settings.theme === 'dark'}
            />
          ) : (
            <div className="h-full overflow-auto p-3 space-y-2">
              {snapshots.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  暂无历史记录
                </div>
              ) : (
                snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className="flex items-center justify-between p-2 border rounded-lg text-sm"
                  >
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
          )}
        </div>
      </div>

      {/* 展开面板按钮 - 面板收起时显示 */}
      {panelState.collapsed && (
        <Button
          variant="outline"
          size="icon"
          onClick={togglePanel}
          className="absolute top-3 z-20 bg-background/80 backdrop-blur-sm shadow-lg transition-[left] duration-300 ease-out"
          style={{ left: editorLeft }}
          title="展开编辑器"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
