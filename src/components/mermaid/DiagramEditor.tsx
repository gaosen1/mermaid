import { useState, useEffect, useCallback, useRef } from 'react'
import { MermaidRenderer, type MermaidRendererRef } from './MermaidRenderer'
import { CodeEditor } from './CodeEditor'
import { EdgeStylePanel } from './EdgeStylePanel'
import { NodeStylePanel } from './NodeStylePanel'
import { useSourceSync } from './useSourceSync'
import { useInlineTextEdit } from './useInlineTextEdit'
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
import { parseEdgeStyleFromSource, type EdgeStyle } from '@/utils/edgeDsl'
import {
  parseNodeStyleFromSource,
  parseNodeShapeFromSource,
  parseSubgraphStyleFromSource,
  type NodeStyle,
  type NodeShape,
  type SubgraphStyle,
} from '@/utils/nodeDsl'
import type { SelectedEdge } from './useEdgeSelection'
import type { SelectedNode } from './useNodeSelection'
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
  sidebarAnimating?: boolean
}

export function DiagramEditor({ diagramId, sidebarWidth = 0, sidebarAnimating = false }: DiagramEditorProps) {
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
  const [isDarkMode, setIsDarkMode] = useState(false)
  const autoSaveTimerRef = useRef<number | null>(null)
  const rendererRef = useRef<MermaidRendererRef>(null)

  // Edge 选中状态
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>({})
  const [lastEdgePosition, setLastEdgePosition] = useState({ x: 0, y: 0 })

  // Node 选中状态
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>({})
  const [nodeShape, setNodeShape] = useState<NodeShape | null>(null)
  const [lastNodePosition, setLastNodePosition] = useState({ x: 0, y: 0 })
  const [isEditingNodeText, setIsEditingNodeText] = useState(false)

  // 提前解构 source，供 useSourceSync 使用
  const { source, layout, theme, hasChanges } = editorState

  // 用于在 onSourceChange 中调用 handleSave
  const handleSaveRef = useRef<((isAuto: boolean) => Promise<void>) | undefined>(undefined)

  // 源码同步（防抖）
  const { recordStyleChange, recordShapeChange, recordTextChange, flushChanges } = useSourceSync({
    source,
    onSourceChange: (newSource, isStyleOnly, shouldSave) => {
      // 只有纯样式变更才标记跳过重渲染，形状和文字变更需要重新渲染
      if (isStyleOnly) {
        rendererRef.current?.markStyleOnlySource(newSource)
      }
      setEditorState((prev) => ({ ...prev, source: newSource, hasChanges: true }))
      // 如果需要保存，在 state 更新后执行
      if (shouldSave) {
        // 使用 setTimeout 确保在 state 更新后执行保存
        setTimeout(() => {
          handleSaveRef.current?.(true)
        }, 0)
      }
    },
  })

  // 原地编辑节点文字
  const { startEdit: startInlineEdit, hasJustEnded: hasJustEndedEdit } = useInlineTextEdit({
    onTextChange: (nodeId, newText, nodeType, originalText) => {
      recordTextChange(nodeId, newText, nodeType, originalText)
      // 文字变更后立即同步并保存
      flushChanges(true)
    },
    onEditStart: () => {
      setIsEditingNodeText(true)
    },
    onEditEnd: () => {
      setIsEditingNodeText(false)
    },
  })

  // 监听实际应用的主题（包括跟随系统的情况）
  useEffect(() => {
    const updateDarkMode = () => {
      const root = window.document.documentElement
      setIsDarkMode(root.classList.contains('dark'))
    }

    // 初始化
    updateDarkMode()

    // 监听 class 变化
    const observer = new MutationObserver(updateDarkMode)
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

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

  // 更新 handleSaveRef
  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

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

  // Edge 选中处理
  const handleEdgeSelect = useCallback(
    (edge: SelectedEdge | null) => {
      setSelectedEdge(edge)
      if (edge) {
        // 保存位置，供关闭时使用
        setLastEdgePosition(edge.position)
        // 解析当前 edge 的样式
        const currentStyle = parseEdgeStyleFromSource(source, edge.index)
        setEdgeStyle(currentStyle)
      } else {
        setEdgeStyle({})
      }
    },
    [source]
  )

  // Edge 样式变化处理
  const handleEdgeStyleChange = useCallback(
    (newStyle: EdgeStyle) => {
      if (!selectedEdge) return

      setEdgeStyle(newStyle)

      // 1. 直接应用到 SVG（即时预览，无重渲染）
      rendererRef.current?.applyEdgeStyleDirect(selectedEdge.index, newStyle)

      // 2. 延迟同步到 source（防抖 500ms）
      recordStyleChange('edge', selectedEdge.index, newStyle)
    },
    [selectedEdge, recordStyleChange]
  )

  // 关闭 Edge 样式面板
  const handleEdgePanelClose = useCallback(() => {
    // 先设置状态触发关闭动画
    setSelectedEdge(null)
    setEdgeStyle({})

    // 立即执行轻量操作
    flushChanges()
    rendererRef.current?.clearEdgeSelection()

    // 延迟执行 handleSave，等待关闭动画完成（约 150ms）
    setTimeout(() => {
      handleSave(true)
    }, 150)
  }, [flushChanges, handleSave])

  // Node 选中处理
  const handleNodeSelect = useCallback(
    (node: SelectedNode | null) => {
      // 如果刚刚结束编辑，忽略这次选中（避免 Enter 退出编辑后触发 NodeStylePanel）
      if (node && hasJustEndedEdit()) {
        return
      }

      setSelectedNode(node)
      if (node) {
        // 保存位置，供关闭时使用
        setLastNodePosition(node.position)
        // 根据类型解析样式
        if (node.type === 'subgraph') {
          // subgraph 样式解析
          const currentStyle = parseSubgraphStyleFromSource(source, node.id)
          setNodeStyle(currentStyle)
          setNodeShape(null) // subgraph 没有形状选项
        } else {
          // 普通节点样式和形状解析
          const currentStyle = parseNodeStyleFromSource(source, node.id)
          const currentShape = parseNodeShapeFromSource(source, node.id)
          setNodeStyle(currentStyle)
          setNodeShape(currentShape)
        }
      } else {
        setNodeStyle({})
        setNodeShape(null)
      }
    },
    [source, hasJustEndedEdit]
  )

  // Node 样式变化处理
  const handleNodeStyleChange = useCallback(
    (newStyle: NodeStyle | SubgraphStyle) => {
      if (!selectedNode) return

      setNodeStyle(newStyle as NodeStyle)

      if (selectedNode.type === 'subgraph') {
        // 1. 直接应用到 SVG（即时预览，无重渲染）
        rendererRef.current?.applySubgraphStyleDirect(selectedNode.id, newStyle as SubgraphStyle)

        // 2. 延迟同步到 source（防抖 500ms）
        recordStyleChange('subgraph', selectedNode.id, newStyle as SubgraphStyle)
      } else {
        // 1. 直接应用到 SVG（即时预览，无重渲染）
        rendererRef.current?.applyNodeStyleDirect(selectedNode.id, newStyle as NodeStyle)

        // 2. 延迟同步到 source（防抖 500ms）
        recordStyleChange('node', selectedNode.id, newStyle as NodeStyle)
      }
    },
    [selectedNode, recordStyleChange]
  )

  // Node 形状变化处理
  const handleNodeShapeChange = useCallback(
    (newShape: NodeShape) => {
      if (!selectedNode) return

      setNodeShape(newShape)

      // 形状变更需要重渲染，不能即时预览
      // 直接同步到 source
      recordShapeChange(selectedNode.id, newShape)
    },
    [selectedNode, recordShapeChange]
  )

  // Node 双击编辑文字（原地编辑）
  const handleNodeDoubleClick = useCallback(
    (node: SelectedNode) => {
      // 清除选中状态，避免退出编辑后样式面板自动弹出
      setSelectedNode(null)
      startInlineEdit(node)
    },
    [startInlineEdit]
  )

  // 关闭 Node 样式面板
  const handleNodePanelClose = useCallback(() => {
    // 先设置状态触发关闭动画
    setSelectedNode(null)
    setNodeStyle({})
    setNodeShape(null)

    // 立即执行轻量操作
    flushChanges()
    rendererRef.current?.clearNodeSelection()

    // 延迟执行 handleSave，等待关闭动画完成（约 150ms）
    setTimeout(() => {
      handleSave(true)
    }, 150)
  }, [flushChanges, handleSave])

  if (!currentDiagram) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请选择一个图表
      </div>
    )
  }

  // 计算编辑器面板的位置
  // 当侧边栏收起时，编辑器面板位于展开按钮下方
  // 当侧边栏展开时，编辑器面板紧靠侧边栏右侧
  const editorLeft = sidebarWidth === 0 ? 12 : sidebarWidth + 4
  const editorTop = sidebarWidth === 0 ? 60 : 12 // 12px (按钮 top) + 40px (按钮高度) + 8px (gap)
  const editorBottom = 12

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
        edgeSelectionEnabled={true}
        nodeSelectionEnabled={true}
        onEdgeSelect={handleEdgeSelect}
        onNodeSelect={handleNodeSelect}
        onNodeDoubleClick={handleNodeDoubleClick}
      />

      {/* 浮层编辑器面板 - 左侧悬浮，紧靠侧边栏 */}
      <div
        className={`
          absolute z-20
          flex flex-col
          bg-background/95 backdrop-blur-md
          border rounded-lg shadow-2xl
          ${(isAnimating || sidebarAnimating) ? 'transition-[left,top,bottom,opacity] duration-300 ease-out' : ''}
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
              darkMode={isDarkMode}
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

      {/* Edge 样式编辑面板 */}
      <EdgeStylePanel
        open={selectedEdge !== null}
        position={selectedEdge?.position || lastEdgePosition}
        currentStyle={edgeStyle}
        mermaidTheme={theme}
        onStyleChange={handleEdgeStyleChange}
        onClose={handleEdgePanelClose}
      />

      {/* Node 样式编辑面板 */}
      <NodeStylePanel
        open={selectedNode !== null && !isEditingNodeText}
        position={selectedNode?.position || lastNodePosition}
        currentStyle={nodeStyle}
        currentShape={nodeShape}
        mermaidTheme={theme}
        onStyleChange={handleNodeStyleChange}
        onShapeChange={handleNodeShapeChange}
        onClose={handleNodePanelClose}
      />
    </div>
  )
}
