import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import { Button } from '@/components/ui/button'
import { ErrorAlert } from '@/components/ui/error-alert'
import { Loader2, RefreshCw, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { bindGestureGuard, computeWheelTransform, zoomViewState } from '@/utils/canvasGesture'

export interface HtmlRendererRef {
  exportPng: () => Promise<void>
  reload: () => void
}

interface HtmlRendererProps {
  source: string
  className?: string
  showControls?: boolean
  fileName?: string
}

export const HtmlRenderer = forwardRef<HtmlRendererRef, HtmlRendererProps>(
  ({ source, className = '', showControls = true, fileName = 'diagram' }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // 预览缩放/平移（iframe 会吞掉其区域内的滚轮事件，缩放主要靠控件）
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 })

    const zoomBy = useCallback((factor: number) => {
      const el = wrapperRef.current
      if (!el) return
      setView((prev) =>
        zoomViewState(
          prev,
          { x: el.clientWidth / 2, y: el.clientHeight / 2 },
          factor,
          { minScale: MIN_SCALE, maxScale: MAX_SCALE }
        )
      )
    }, [])

    const resetView = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), [])

    useEffect(() => {
      const el = wrapperRef.current
      if (!el) return
      const handleWheel = (e: WheelEvent) => {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        setView((prev) =>
          computeWheelTransform(
            e,
            { x: e.clientX - rect.left, y: e.clientY - rect.top },
            prev,
            { minScale: MIN_SCALE, maxScale: MAX_SCALE }
          )
        )
      }
      el.addEventListener('wheel', handleWheel, { passive: false })
      const unbindGuard = bindGestureGuard(el)
      return () => {
        el.removeEventListener('wheel', handleWheel)
        unbindGuard()
      }
    }, [])

    const reload = useCallback(() => {
      setLoading(true)
      setError(null)
      setReloadKey((prev) => prev + 1)
    }, [])

    const handleLoad = useCallback(() => {
      setLoading(false)
      setError(null)
    }, [])

    useEffect(() => {
      if (!source.trim()) {
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
    }, [source, reloadKey])

    const exportPng = useCallback(async () => {
      const iframe = iframeRef.current
      const doc = iframe?.contentDocument

      if (!iframe || !doc) {
        throw new Error('HTML 预览尚未准备完成')
      }

      const body = doc.body
      const root = doc.documentElement
      const width = Math.max(
        body?.scrollWidth || 0,
        root?.scrollWidth || 0,
        iframe.clientWidth,
        1
      )
      const height = Math.max(
        body?.scrollHeight || 0,
        root?.scrollHeight || 0,
        iframe.clientHeight,
        1
      )

      const serializedHtml = new XMLSerializer().serializeToString(root)
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">${serializedHtml}</foreignObject>
        </svg>
      `

      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      try {
        const image = await loadImage(url)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('无法创建 PNG 导出画布')
        }

        context.drawImage(image, 0, 0, width, height)

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) {
              resolve(value)
              return
            }
            reject(new Error('PNG 导出失败'))
          }, 'image/png')
        })

        saveAs(blob, `${fileName}.png`)
      } finally {
        URL.revokeObjectURL(url)
      }
    }, [fileName])

    useImperativeHandle(
      ref,
      () => ({
        exportPng,
        reload,
      }),
      [exportPng, reload]
    )

    if (!source.trim()) {
      return (
        <div className={`relative h-full w-full ${className}`}>
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30 text-muted-foreground">
            输入 HTML 代码开始预览
          </div>
        </div>
      )
    }

    return (
      <div className={`relative h-full w-full ${className}`}>
        {showControls && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur rounded px-1.5 py-0.5 select-none">
              {Math.round(view.scale * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
              onClick={() => zoomBy(1 / 1.2)}
              title="缩小"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
              onClick={() => zoomBy(1.2)}
              title="放大"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
              onClick={resetView}
              title="重置视图"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm"
              onClick={reload}
              title="重新加载预览"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-20 pointer-events-none">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">加载中...</span>
            </div>
          </div>
        )}

        {error && <ErrorAlert error={error} />}

        <div ref={wrapperRef} className="absolute inset-0 overflow-auto rounded-lg bg-white shadow-inner">
          <div
            className="h-full w-full origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          >
            <iframe
              key={reloadKey}
              ref={iframeRef}
              title="HTML Diagram Preview"
              srcDoc={source}
              sandbox="allow-same-origin"
              className="h-full w-full border-0 bg-white"
              onLoad={handleLoad}
            />
          </div>
        </div>
      </div>
    )
  }
)

HtmlRenderer.displayName = 'HtmlRenderer'

const MIN_SCALE = 0.1
const MAX_SCALE = 5

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法将 HTML 预览转换为图片'))
    image.src = url
  })
}
