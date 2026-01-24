import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { initMermaid, renderMermaid, getSvgFromContainer, exportToPng, exportToSvg } from '@/utils/mermaid'
import { parseExtendedDSL, generateAnimationCSS, injectStyles, parseFrontmatter } from '@/utils/dsl'
import { saveAs } from 'file-saver'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Copy, AlertCircle, RotateCcw, Loader2 } from 'lucide-react'
import { useEdgeSelection, type SelectedEdge } from './useEdgeSelection'
import { useNodeSelection, type SelectedNode } from './useNodeSelection'
import { useViewTransform } from './useViewTransform'
import { cleanupMermaidErrors, setupSvgEdgeInteraction, setupSvgNodeInteraction, setupSvgSubgraphInteraction } from './svgUtils'
import { applyEdgeStyle, applyNodeStyle, applySubgraphStyle } from './svgStyleApplier'
import { RENDER_CONFIG } from './constants'
import type { LayoutType } from '@/types'
import type { EdgeStyle } from '@/utils/edgeDsl'
import type { NodeStyle, SubgraphStyle } from '@/utils/nodeDsl'

export interface MermaidRendererRef {
  exportPng: () => Promise<void>
  exportSvg: () => void
  resetView: () => void
  restoreEdgeSelection: () => void
  clearEdgeSelection: () => void
  applyEdgeStyleDirect: (index: number, style: EdgeStyle) => boolean
  restoreNodeSelection: () => void
  clearNodeSelection: () => void
  applyNodeStyleDirect: (nodeId: string, style: NodeStyle) => boolean
  applySubgraphStyleDirect: (subgraphId: string, style: SubgraphStyle) => boolean
  getSvgElement: () => SVGSVGElement | null
  markStyleOnlySource: (source: string) => void
  getScale: () => number
}

interface MermaidRendererProps {
  source: string
  layout?: LayoutType
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  className?: string
  showControls?: boolean
  edgeSelectionEnabled?: boolean
  nodeSelectionEnabled?: boolean
  onRenderSuccess?: () => void
  onRenderError?: (error: string) => void
  onRenderStart?: () => void
  onEdgeSelect?: (edge: SelectedEdge | null) => void
  onNodeSelect?: (node: SelectedNode | null) => void
  onNodeDoubleClick?: (node: SelectedNode) => void
}

export const MermaidRenderer = forwardRef<MermaidRendererRef, MermaidRendererProps>(
  (
    {
      source,
      layout = 'elk',
      theme = 'base',
      className = '',
      showControls = true,
      edgeSelectionEnabled = false,
      nodeSelectionEnabled = false,
      onRenderSuccess,
      onRenderError,
      onRenderStart,
      onEdgeSelect,
      onNodeSelect,
      onNodeDoubleClick,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const [error, setError] = useState<string | null>(null)
    const [initialized, setInitialized] = useState(false)
    const [isRendering, setIsRendering] = useState(false)
    const renderIdRef = useRef(0)
    const debounceTimerRef = useRef<number | null>(null)
    // leading edge debounce：记录上次渲染时间
    const lastRenderTimeRef = useRef(0)
    // 记录样式变更产生的 source，用于跳过重渲染
    const styleOnlySourceRef = useRef<string | null>(null)
    // 记录是否已经首次渲染，避免重渲染时重置视图
    const hasRenderedOnceRef = useRef(false)

    // 视图变换（缩放、平移）
    const {
      scale,
      position,
      isDragging,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      resetView,
      fitToContainer,
    } = useViewTransform({ wrapperRef, containerRef })

    // 边缘选中
    const {
      restoreSelection: restoreEdgeSelection,
      clearSelection: clearEdgeSelection,
      bindEvents: bindEdgeEvents,
    } = useEdgeSelection({
      containerRef,
      enabled: edgeSelectionEnabled,
      onSelect: onEdgeSelect,
    })

    // 节点选中
    const {
      restoreSelection: restoreNodeSelection,
      clearSelection: clearNodeSelection,
      bindEvents: bindNodeEvents,
    } = useNodeSelection({
      containerRef,
      wrapperRef,
      enabled: nodeSelectionEnabled,
      onSelect: onNodeSelect,
      onDoubleClick: onNodeDoubleClick,
    })

    // 初始化 Mermaid
    useEffect(() => {
      initMermaid(layout, theme).then(() => setInitialized(true))
    }, [layout, theme])

    // 渲染 Mermaid 图表
    useEffect(() => {
      // 如果当前 source 是样式变更产生的，跳过重渲染并清除标记
      if (styleOnlySourceRef.current === source) {
        styleOnlySourceRef.current = null
        return
      }

      if (!initialized || !containerRef.current) return

      if (!source.trim()) {
        containerRef.current.innerHTML =
          '<div class="text-muted-foreground text-center p-8">输入 Mermaid 代码开始预览</div>'
        return
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      const currentRenderId = ++renderIdRef.current

      // 渲染函数
      const doRender = async () => {
        lastRenderTimeRef.current = Date.now()
        cleanupMermaidErrors()
        // 双缓冲：不立即显示 loading，保留旧 SVG
        const isRerender = hasRenderedOnceRef.current
        if (!isRerender) {
          setIsRendering(true)
        }
        onRenderStart?.()

        try {
          const { config: frontmatterConfig, content } = parseFrontmatter(source)
          const effectiveLayout = frontmatterConfig?.layout || layout
          const effectiveTheme = frontmatterConfig?.theme || theme

          await initMermaid(effectiveLayout, effectiveTheme)

          const { source: processedSource, animations } = parseExtendedDSL(content)
          const animationCSS = generateAnimationCSS(animations)

          const containerId = `mermaid-render-${Date.now()}-${Math.random().toString(36).slice(2)}`

          // 隐藏 mermaid 渲染时创建的临时容器，防止闪烁
          const hideStyle = document.createElement('style')
          hideStyle.id = 'mermaid-temp-hide'
          hideStyle.textContent = `body > div[id^="dmermaid-render-"] { visibility: hidden !important; position: absolute !important; left: -9999px !important; }`
          document.head.appendChild(hideStyle)

          const { svg } = await renderMermaid(processedSource, containerId)

          // 移除隐藏样式
          hideStyle.remove()
          cleanupMermaidErrors()

          if (currentRenderId !== renderIdRef.current) return

          if (containerRef.current) {
            // 双缓冲：直接替换 SVG（旧 SVG 保留到新 SVG 准备好）
            containerRef.current.innerHTML = svg

            const svgEl = containerRef.current.querySelector('svg') as SVGSVGElement
            if (svgEl) {
              setupSvgEdgeInteraction(svgEl)
              setupSvgNodeInteraction(svgEl)
              setupSvgSubgraphInteraction(svgEl)
            }

            if (animationCSS) {
              injectStyles(containerRef.current, animationCSS)
            }

            setError(null)
            setIsRendering(false)
            hasRenderedOnceRef.current = true
            onRenderSuccess?.()
          }
        } catch (err) {
          cleanupMermaidErrors()
          if (currentRenderId !== renderIdRef.current) return

          const errorMessage = err instanceof Error ? err.message : 'Render failed'
          setError(errorMessage)
          setIsRendering(false)
          onRenderError?.(errorMessage)
        }
      }

      // Leading edge debounce：计算距离上次渲染的时间
      const timeSinceLastRender = Date.now() - lastRenderTimeRef.current
      const delay = RENDER_CONFIG.DEBOUNCE_DELAY

      if (timeSinceLastRender >= delay) {
        // 超过防抖时间，立即执行
        doRender()
      } else {
        // 未超过防抖时间，等待剩余时间后执行
        const remainingTime = delay - timeSinceLastRender
        debounceTimerRef.current = window.setTimeout(doRender, remainingTime)
      }

      return () => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
      }
    }, [source, layout, theme, initialized, onRenderStart, onRenderSuccess, onRenderError])

    // SVG 渲染完成后绑定边缘事件
    useEffect(() => {
      if (!isRendering && containerRef.current?.querySelector('svg')) {
        bindEdgeEvents()
      }
    }, [isRendering, bindEdgeEvents])

    // SVG 渲染完成后绑定节点事件
    useEffect(() => {
      if (!isRendering && containerRef.current?.querySelector('svg')) {
        bindNodeEvents()
      }
    }, [isRendering, bindNodeEvents])

    // 初始渲染后自适应容器（只在首次渲染时执行）
    useEffect(() => {
      if (!isRendering && containerRef.current?.querySelector('svg') && !hasRenderedOnceRef.current) {
        requestAnimationFrame(fitToContainer)
      }
    }, [isRendering, fitToContainer])

    const handleCopyError = useCallback(() => {
      if (error) {
        navigator.clipboard.writeText(error)
      }
    }, [error])

    const handleExportPng = useCallback(async () => {
      if (!containerRef.current) return
      const svgString = getSvgFromContainer(containerRef.current)
      if (!svgString) return
      try {
        const blob = await exportToPng(svgString)
        saveAs(blob, 'diagram.png')
      } catch (err) {
        console.error('Export PNG failed:', err)
      }
    }, [])

    const handleExportSvg = useCallback(() => {
      if (!containerRef.current) return
      const svgString = getSvgFromContainer(containerRef.current)
      if (!svgString) return
      const blob = exportToSvg(svgString)
      saveAs(blob, 'diagram.svg')
    }, [])

    const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), [])

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        exportPng: handleExportPng,
        exportSvg: handleExportSvg,
        resetView,
        restoreEdgeSelection,
        clearEdgeSelection,
        applyEdgeStyleDirect: (index: number, style: EdgeStyle) => {
          const svg = containerRef.current?.querySelector('svg') as SVGSVGElement
          if (!svg) return false
          return applyEdgeStyle(svg, index, style)
        },
        restoreNodeSelection,
        clearNodeSelection,
        applyNodeStyleDirect: (nodeId: string, style: NodeStyle) => {
          const svg = containerRef.current?.querySelector('svg') as SVGSVGElement
          if (!svg) return false
          return applyNodeStyle(svg, nodeId, style)
        },
        applySubgraphStyleDirect: (subgraphId: string, style: SubgraphStyle) => {
          const svg = containerRef.current?.querySelector('svg') as SVGSVGElement
          if (!svg) return false
          return applySubgraphStyle(svg, subgraphId, style)
        },
        getSvgElement: () => containerRef.current?.querySelector('svg') as SVGSVGElement | null,
        markStyleOnlySource: (newSource: string) => {
          styleOnlySourceRef.current = newSource
        },
        getScale: () => scale,
      }),
      [handleExportPng, handleExportSvg, resetView, restoreEdgeSelection, clearEdgeSelection, restoreNodeSelection, clearNodeSelection, scale]
    )

    return (
      <div className={`relative h-full w-full ${className}`}>
        {showControls && (
          <div className="absolute top-2 right-2 flex gap-2 z-10">
            <Button
              variant="outline"
              size="sm"
              onClick={resetView}
              title="重置视图"
              className="bg-background/80 backdrop-blur-sm"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20 pointer-events-none">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">渲染中...</span>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="absolute top-2 left-2 right-14 z-10 bg-background/95">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span className="break-all text-sm line-clamp-2">{error}</span>
              <Button variant="outline" size="sm" onClick={handleCopyError} className="shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div
          ref={wrapperRef}
          className="absolute inset-0 overflow-hidden bg-white dark:bg-gray-900 rounded-lg"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
          style={{ cursor: isDragging ? 'grabbing' : 'default' }}
        >
          <div
            ref={containerRef}
            className="w-full h-full p-4"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}
          />
        </div>
      </div>
    )
  }
)

MermaidRenderer.displayName = 'MermaidRenderer'
