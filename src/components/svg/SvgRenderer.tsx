import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react'
import { saveAs } from 'file-saver'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Copy } from 'lucide-react'

export interface SvgRendererRef {
  exportPng: () => Promise<void>
}

interface SvgRendererProps {
  source: string
  className?: string
  fileName?: string
}

export const SvgRenderer = forwardRef<SvgRendererRef, SvgRendererProps>(
  ({ source, className = '', fileName = 'diagram' }, ref) => {
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

    const handleCopyError = useCallback(() => {
      if (error) {
        navigator.clipboard.writeText(error)
      }
    }, [error])

    const exportPng = useCallback(async () => {
      if (!normalizedSvg) {
        throw new Error(error || 'SVG 预览尚未准备完成')
      }

      const { width, height } = getSvgDimensions(normalizedSvg)
      const url = URL.createObjectURL(new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' }))

      try {
        const image = await loadImage(url)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('无法创建 PNG 导出画布')
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
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
    }, [error, fileName, normalizedSvg])

    useImperativeHandle(
      ref,
      () => ({
        exportPng,
      }),
      [exportPng]
    )

    if (!source.trim()) {
      return (
        <div className={`relative h-full w-full ${className}`}>
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30 text-muted-foreground">
            输入 SVG 代码开始预览
          </div>
        </div>
      )
    }

    return (
      <div className={`relative h-full w-full ${className}`}>
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

        <div className="absolute inset-0 overflow-auto rounded-lg bg-white p-6 shadow-inner">
          <div
            className="svg-renderer-content mx-auto flex min-h-full items-center justify-center"
            dangerouslySetInnerHTML={{ __html: normalizedSvg }}
          />
        </div>
      </div>
    )
  }
)

SvgRenderer.displayName = 'SvgRenderer'

function normalizeSvgSource(source: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(source, 'image/svg+xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(parserError.textContent?.trim() || 'SVG 解析失败')
  }

  const svg = doc.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('内容必须是完整的 <svg> 元素')
  }

  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }

  svg.querySelectorAll('script').forEach((script) => script.remove())
  const elements = [svg, ...Array.from(svg.querySelectorAll('*'))]
  elements.forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      const attrName = attr.name.toLowerCase()
      const attrValue = attr.value.trim().toLowerCase()

      if (attrName.startsWith('on')) {
        element.removeAttribute(attr.name)
        return
      }

      if ((attrName === 'href' || attrName === 'xlink:href') && attrValue.startsWith('javascript:')) {
        element.removeAttribute(attr.name)
      }
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
  if (width && height) {
    return { width, height }
  }

  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const values = viewBox.trim().split(/[\s,]+/).map(Number.parseFloat)
    if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
      return { width: Math.ceil(values[2]), height: Math.ceil(values[3]) }
    }
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
