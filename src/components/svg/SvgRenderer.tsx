import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { saveAs } from 'file-saver'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Copy, RotateCcw } from 'lucide-react'
import { useZoomPan } from '@/hooks/useZoomPan'

export interface SvgRendererRef {
  exportPng: () => Promise<void>
}

interface SvgRendererProps {
  source: string
  className?: string
  fileName?: string
  diagramId?: string
}

export const SvgRenderer = forwardRef<SvgRendererRef, SvgRendererProps>(
  ({ source, className = '', fileName = 'diagram', diagramId }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null)
    const { scale, position, isDragging, wrapperRef, handleMouseDown, handleMouseMove, handleMouseUp, resetView, fitView } =
      useZoomPan(diagramId)

    const renderState = useMemo((): { svg: string; error: string | null } => {
      if (!source.trim()) return { svg: '', error: null }
      try {
        return { svg: normalizeSvgSource(source), error: null }
      } catch (err) {
        return { svg: '', error: err instanceof Error ? err.message : 'SVG 解析失败' }
      }
    }, [source])
    const normalizedSvg = renderState.svg
    const error = renderState.error

    // SVG 更新后适配容器（rAF 等布局完成）
    useEffect(() => {
      if (!normalizedSvg) return
      const raf = requestAnimationFrame(() => {
        const inner = innerRef.current
        if (!inner) return
        const svgEl = inner.querySelector('svg')
        if (!svgEl) return
        const { width, height } = getSvgNaturalSize(svgEl)
        if (width > 0 && height > 0) fitView(width, height)
      })
      return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [normalizedSvg])

    const handleCopyError = useCallback(() => {
      if (error) navigator.clipboard.writeText(error)
    }, [error])

    const exportPng = useCallback(async () => {
      if (!normalizedSvg) throw new Error(error || 'SVG 预览尚未准备完成')
      const { width, height } = getSvgDimensions(normalizedSvg)
      const url = URL.createObjectURL(new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' }))
      try {
        const image = await loadImage(url)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法创建 PNG 导出画布')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((v) => (v ? resolve(v) : reject(new Error('PNG 导出失败'))), 'image/png')
        })
        saveAs(blob, `${fileName}.png`)
      } finally {
        URL.revokeObjectURL(url)
      }
    }, [error, fileName, normalizedSvg])

    useImperativeHandle(ref, () => ({ exportPng }), [exportPng])

    return (
      <div className={`relative h-full w-full ${className}`}>
        {/* 错误提示 */}
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

        {/* 缩放控件 */}
        {normalizedSvg && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur rounded px-1.5 py-0.5 select-none">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 bg-background/90 backdrop-blur"
              onClick={resetView}
              title="重置视图"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* 视口 —— 始终渲染，wrapperRef（callback ref）挂在这里 */}
        <div
          ref={wrapperRef}
          className="absolute inset-0 rounded-lg bg-white shadow-inner overflow-hidden"
          style={{ cursor: isDragging ? 'grabbing' : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!normalizedSvg ? (
            <div className="flex h-full items-center justify-center text-muted-foreground bg-muted/30">
              输入 SVG 代码开始预览
            </div>
          ) : (
            /* 变换层：始终与视口同尺寸，transform 应用于此 */
            <div
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: '0 0',
                width: '100%',
                height: '100%',
              }}
            >
              <div
                ref={innerRef}
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: normalizedSvg }}
              />
            </div>
          )}
        </div>
      </div>
    )
  }
)

SvgRenderer.displayName = 'SvgRenderer'

/** 获取 SVG 内容尺寸用于 fitView（不依赖父容器） */
function getSvgNaturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.viewBox?.baseVal
  if (vb && vb.width > 0 && vb.height > 0) return { width: vb.width, height: vb.height }
  const attrW = parseSvgLength(svg.getAttribute('width'))
  const attrH = parseSvgLength(svg.getAttribute('height'))
  if (attrW && attrH) return { width: attrW, height: attrH }
  // 最后 fallback：实际渲染尺寸（此时 SVG 已在 DOM 中）
  if (svg.clientWidth > 0 && svg.clientHeight > 0) return { width: svg.clientWidth, height: svg.clientHeight }
  return { width: 800, height: 600 }
}

function normalizeSvgSource(source: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(source, 'image/svg+xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) throw new Error(parserError.textContent?.trim() || 'SVG 解析失败')
  const svg = doc.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error('内容必须是完整的 <svg> 元素')
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.querySelectorAll('script').forEach((s) => s.remove())
  ;[svg, ...Array.from(svg.querySelectorAll('*'))].forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase()
      const val = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) { el.removeAttribute(attr.name); return }
      if ((name === 'href' || name === 'xlink:href') && val.startsWith('javascript:'))
        el.removeAttribute(attr.name)
    })
  })
  return new XMLSerializer().serializeToString(svg)
}

function getSvgDimensions(svgString: string): { width: number; height: number } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement
  const width = parseSvgLength(svg.getAttribute('width'))
  const height = parseSvgLength(svg.getAttribute('height'))
  if (width && height) return { width, height }
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const vals = viewBox.trim().split(/[\s,]+/).map(Number.parseFloat)
    if (vals.length === 4 && vals.every(Number.isFinite) && vals[2] > 0 && vals[3] > 0)
      return { width: Math.ceil(vals[2]), height: Math.ceil(vals[3]) }
  }
  return { width: 1200, height: 800 }
}

function parseSvgLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace('px', ''))
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法将 SVG 预览转换为图片'))
    image.src = url
  })
}
