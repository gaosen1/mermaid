import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { initMermaid, renderMermaid, getSvgFromContainer, exportToPng, exportToSvg } from '@/utils/mermaid'
import { parseExtendedDSL, generateAnimationCSS, injectStyles, parseFrontmatter } from '@/utils/dsl'
import { saveAs } from 'file-saver'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Copy, AlertCircle, RotateCcw, Loader2 } from 'lucide-react'
import type { LayoutType } from '@/types'

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
}

interface MermaidRendererProps {
  source: string
  layout?: LayoutType
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  className?: string
  showControls?: boolean
  onRenderSuccess?: () => void
  onRenderError?: (error: string) => void
  onRenderStart?: () => void
}

export const MermaidRenderer = forwardRef<MermaidRendererRef, MermaidRendererProps>(({
  source,
  layout = 'elk',
  theme = 'base',
  className = '',
  showControls = true,
  onRenderSuccess,
  onRenderError,
  onRenderStart,
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

  useEffect(() => {
    return () => {
      cleanupMermaidErrors()
    }
  }, [])

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
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    exportPng: handleExportPng,
    exportSvg: handleExportSvg,
    resetView: handleZoomReset,
  }), [handleExportPng, handleExportSvg, handleZoomReset])

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
    <div className={`relative flex flex-col ${className}`}>
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
        className="flex-1 w-full overflow-hidden bg-white dark:bg-gray-900 rounded-lg min-h-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{ cursor: isDragging ? 'grabbing' : 'default' }}
      >
        <div
          ref={containerRef}
          className="w-full h-full p-4 will-change-transform"
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
