import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { initMermaid, renderMermaid, getSvgFromContainer, exportToPng, exportToSvg } from '@/utils/mermaid'
import { parseExtendedDSL, generateAnimationCSS, injectStyles, parseFrontmatter } from '@/utils/dsl'
import { saveAs } from 'file-saver'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Copy, AlertCircle, RotateCcw, Loader2 } from 'lucide-react'
import { useEdgeSelection, type SelectedEdge } from './useEdgeSelection'
import type { LayoutType } from '@/types'

// 🎯 配置项：重置视图时的水平偏移量（正数向右，负数向左）
// 用于避开左侧浮动面板，可根据需要调整
const HORIZONTAL_CENTER_OFFSET = 400 // 单位：px，建议范围：0-200

function cleanupMermaidErrors() {
  const errorDivs = document.querySelectorAll('div[id^="dmermaid-"], div[id^="mermaid-"]')
  errorDivs.forEach((div) => {
    if (div.parentElement === document.body) {
      div.remove()
    }
  })
}

export interface MermaidRendererRef {
  exportPng: () => Promise<void>
  exportSvg: () => void
  resetView: () => void
  restoreEdgeSelection: () => void
}

interface MermaidRendererProps {
  source: string
  layout?: LayoutType
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  className?: string
  showControls?: boolean
  edgeSelectionEnabled?: boolean
  onRenderSuccess?: () => void
  onRenderError?: (error: string) => void
  onRenderStart?: () => void
  onEdgeSelect?: (edge: SelectedEdge | null) => void
}

export const MermaidRenderer = forwardRef<MermaidRendererRef, MermaidRendererProps>(({
  source,
  layout = 'elk',
  theme = 'base',
  className = '',
  showControls = true,
  edgeSelectionEnabled = false,
  onRenderSuccess,
  onRenderError,
  onRenderStart,
  onEdgeSelect,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const renderIdRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(scale)
  const positionRef = useRef(position)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  // Edge 选中逻辑 - 在 SVG 渲染后绑定
  const { restoreSelection: restoreEdgeSelection, bindEvents: bindEdgeEvents } = useEdgeSelection({
    containerRef,
    enabled: edgeSelectionEnabled,
    onSelect: onEdgeSelect,
  })

  useEffect(() => {
    initMermaid(layout, theme).then(() => setInitialized(true))
  }, [layout, theme])

  useEffect(() => {
    if (!initialized || !containerRef.current) {
      return
    }

    if (!source.trim()) {
      if (containerRef.current) {
        containerRef.current.innerHTML = '<div class="text-muted-foreground text-center p-8">输入 Mermaid 代码开始预览</div>'
      }
      return
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    const currentRenderId = ++renderIdRef.current

    debounceTimerRef.current = window.setTimeout(async () => {
      cleanupMermaidErrors()
      setIsRendering(true)
      onRenderStart?.()

      try {
        const { config: frontmatterConfig, content } = parseFrontmatter(source)
        const effectiveLayout = frontmatterConfig?.layout || layout
        const effectiveTheme = frontmatterConfig?.theme || theme

        await initMermaid(effectiveLayout, effectiveTheme)

        const { source: processedSource, animations } = parseExtendedDSL(content)
        const animationCSS = generateAnimationCSS(animations)

        const containerId = `mermaid-render-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const { svg } = await renderMermaid(processedSource, containerId)

        cleanupMermaidErrors()

        if (currentRenderId !== renderIdRef.current) return

        if (containerRef.current) {
          containerRef.current.innerHTML = svg

          // 调试：检查 SVG 结构
          const svgEl = containerRef.current.querySelector('svg')
          if (svgEl) {
            console.log('[MermaidRenderer] SVG rendered, checking structure...')
            console.log('[MermaidRenderer] SVG element:', svgEl)

            // 确保 SVG 可以接收点击事件
            svgEl.style.pointerEvents = 'auto'

            // ELK 布局: path.flowchart-link
            const flowchartLinks = svgEl.querySelectorAll('path.flowchart-link')
            console.log('[MermaidRenderer] Found flowchart-link elements:', flowchartLinks.length)
            flowchartLinks.forEach((path, i) => {
              console.log(`[MermaidRenderer] flowchart-link ${i}:`, path.getAttribute('class'), 'stroke:', getComputedStyle(path).stroke)

              // 为 path 添加索引标记
              path.setAttribute('data-edge-index', i.toString())

              // 设置一个足够宽的 stroke 用于点击，但通过 paint-order 让它不可见
              const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g')
              wrapper.setAttribute('class', 'edge-wrapper')
              wrapper.setAttribute('data-edge-index', i.toString())

              // 创建宽的透明底层用于点击
              const hitArea = path.cloneNode(false) as SVGPathElement
              hitArea.setAttribute('class', 'edge-hitarea')
              hitArea.style.stroke = 'transparent'
              hitArea.style.strokeWidth = '14px'
              hitArea.style.fill = 'none'
              hitArea.style.pointerEvents = 'stroke'
              hitArea.style.cursor = 'pointer'
              // 清除箭头
              hitArea.removeAttribute('marker-end')
              hitArea.removeAttribute('marker-start')
              // 清除动画和虚线样式
              hitArea.style.animation = 'none'
              hitArea.style.strokeDasharray = 'none'
              hitArea.style.strokeDashoffset = '0'
              hitArea.removeAttribute('data-animation')
              hitArea.removeAttribute('data-stroke')

              // 原线条禁用点击
              ;(path as SVGPathElement).style.pointerEvents = 'none'

              // 替换结构
              const parent = path.parentElement
              if (parent) {
                parent.insertBefore(wrapper, path)
                wrapper.appendChild(hitArea)
                wrapper.appendChild(path)
              }
            })

            // 旧版结构: g.edgePath > path
            const edgePaths = svgEl.querySelectorAll('.edgePath')
            console.log('[MermaidRenderer] Found .edgePath elements:', edgePaths.length)
            edgePaths.forEach((ep, i) => {
              console.log(`[MermaidRenderer] edgePath ${i}:`, ep.getAttribute('class'))
              const path = ep.querySelector('path')
              if (path) {
                path.style.pointerEvents = 'stroke'
                path.style.cursor = 'pointer'
              }
              ;(ep as SVGGElement).style.pointerEvents = 'auto'
              ;(ep as SVGGElement).style.cursor = 'pointer'
            })

            // 检查 marker/arrowhead
            const markers = svgEl.querySelectorAll('marker')
            console.log('[MermaidRenderer] Found markers:', markers.length)

            console.log('[MermaidRenderer] Total path elements:', svgEl.querySelectorAll('path').length)
          }

          if (animationCSS) {
            injectStyles(containerRef.current, animationCSS)
          }
          setError(null)
          setIsRendering(false)
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
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [source, layout, theme, initialized, onRenderSuccess, onRenderError, onRenderStart])

  // SVG 渲染完成后重新绑定事件监听器
  useEffect(() => {
    if (!isRendering && containerRef.current?.querySelector('svg')) {
      console.log('[MermaidRenderer] SVG ready, binding events')
      bindEdgeEvents()
    }
  }, [isRendering, bindEdgeEvents])

  useEffect(() => {
    if (containerRef.current && wrapperRef.current && !isRendering) {
      const svg = containerRef.current.querySelector('svg')
      if (svg) {
        // 使用 requestAnimationFrame 确保 DOM 已完全渲染
        requestAnimationFrame(() => {
          if (!containerRef.current || !wrapperRef.current) return
          const svg = containerRef.current.querySelector('svg') as SVGSVGElement
          if (!svg) return

          const wrapperRect = wrapperRef.current.getBoundingClientRect()

          // 只在初始状态时自动适应容器
          if (scale === 1 && (position.x === 0 || position.y === 0)) {
            // 获取 SVG 的原始尺寸
            const viewBox = svg.viewBox.baseVal
            const svgWidth = viewBox.width || svg.width.baseVal.value
            const svgHeight = viewBox.height || svg.height.baseVal.value

            const availableWidth = wrapperRect.width - 32
            const availableHeight = wrapperRect.height - 32

            // 计算合适的缩放比例
            const scaleX = availableWidth / svgWidth
            const scaleY = availableHeight / svgHeight
            const fitScale = Math.min(scaleX, scaleY, 1)

            const scaledWidth = svgWidth * fitScale
            const scaledHeight = svgHeight * fitScale

            const offsetX = (wrapperRect.width - scaledWidth) / 2 + HORIZONTAL_CENTER_OFFSET
            const offsetY = (wrapperRect.height - scaledHeight) / 2

            setScale(fitScale)
            setPosition({ x: offsetX, y: offsetY })
          }
        })
      }
    }
  }, [isRendering, scale, position])

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

  const handleZoomReset = useCallback(() => {
    if (containerRef.current && wrapperRef.current) {
      const svg = containerRef.current.querySelector('svg')
      if (svg) {
        // 先重置 scale，等待下一帧再获取真实的 SVG 尺寸
        setScale(1)
        setPosition({ x: 0, y: 0 })

        // 使用 requestAnimationFrame 确保 scale 重置后再计算
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!containerRef.current || !wrapperRef.current) return

            const svg = containerRef.current.querySelector('svg')
            if (!svg) return

            // 获取 SVG 的原始尺寸（从 viewBox 或 width/height 属性）
            const svgElement = svg as SVGSVGElement
            const viewBox = svgElement.viewBox.baseVal
            const svgWidth = viewBox.width || svgElement.width.baseVal.value
            const svgHeight = viewBox.height || svgElement.height.baseVal.value

            const wrapperRect = wrapperRef.current.getBoundingClientRect()
            // 留出一些边距（padding 16px * 2 = 32px）
            const availableWidth = wrapperRect.width - 32
            const availableHeight = wrapperRect.height - 32

            // 计算合适的缩放比例，使图表适应容器
            const scaleX = availableWidth / svgWidth
            const scaleY = availableHeight / svgHeight
            const fitScale = Math.min(scaleX, scaleY, 1) // 不要放大，最多 1:1

            // 应用缩放后的尺寸
            const scaledWidth = svgWidth * fitScale
            const scaledHeight = svgHeight * fitScale

            // 居中计算（水平方向应用偏移量）
            const offsetX = (wrapperRect.width - scaledWidth) / 2 + HORIZONTAL_CENTER_OFFSET
            const offsetY = (wrapperRect.height - scaledHeight) / 2

            setScale(fitScale)
            setPosition({ x: offsetX, y: offsetY })
          })
        })
        return
      }
    }
    // 如果找不到 SVG，则使用默认重置
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    exportPng: handleExportPng,
    exportSvg: handleExportSvg,
    resetView: handleZoomReset,
    restoreEdgeSelection,
  }), [handleExportPng, handleExportSvg, handleZoomReset, restoreEdgeSelection])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const rect = wrapper.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const oldScale = scaleRef.current
    const oldPosition = positionRef.current

    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(oldScale * delta, 0.1), 5)
    const ratio = newScale / oldScale

    // 以鼠标位置为中心缩放
    const newX = mouseX - (mouseX - oldPosition.x) * ratio
    const newY = mouseY - (mouseY - oldPosition.y) * ratio

    setScale(newScale)
    setPosition({ x: newX, y: newY })
  }, [])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), [])

  return (
    <div className={`relative h-full w-full ${className}`}>
      {/* 控制按钮 - 仅重置 */}
      {showControls && (
        <div className="absolute top-2 right-2 flex gap-2 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleZoomReset}
            title="重置视图"
            className="bg-background/80 backdrop-blur-sm"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* 渲染中指示器 */}
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
        onClick={(e) => console.log('[MermaidRenderer] wrapper onClick, target:', (e.target as Element).tagName, (e.target as Element).className)}
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
})

MermaidRenderer.displayName = 'MermaidRenderer'
