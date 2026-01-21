import { useEffect, useRef, useState, useCallback } from 'react'
import { initMermaid, renderMermaid, getSvgFromContainer, exportToPng, exportToSvg } from '@/utils/mermaid'
import { parseExtendedDSL, generateAnimationCSS, injectStyles, parseFrontmatter } from '@/utils/dsl'
import { saveAs } from 'file-saver'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Copy, Download, AlertCircle } from 'lucide-react'

interface MermaidRendererProps {
  source: string
  layout?: 'elk' | 'dagre'
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  className?: string
  onRenderSuccess?: () => void
  onRenderError?: (error: string) => void
}

export function MermaidRenderer({
  source,
  layout = 'elk',
  theme = 'base',
  className = '',
  onRenderSuccess,
  onRenderError,
}: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const renderIdRef = useRef(0)

  useEffect(() => {
    initMermaid(layout, theme).then(() => setInitialized(true))
  }, [layout, theme])

  useEffect(() => {
    if (!initialized || !containerRef.current || !source.trim()) {
      return
    }

    const currentRenderId = ++renderIdRef.current

    const render = async () => {
      try {
        const { config: frontmatterConfig, content } = parseFrontmatter(source)
        const effectiveLayout = frontmatterConfig?.layout || layout
        const effectiveTheme = frontmatterConfig?.theme || theme

        await initMermaid(effectiveLayout, effectiveTheme)

        const { source: processedSource, animations } = parseExtendedDSL(content)
        const animationCSS = generateAnimationCSS(animations)

        const containerId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const { svg } = await renderMermaid(processedSource, containerId)

        if (currentRenderId !== renderIdRef.current) return

        if (containerRef.current) {
          containerRef.current.innerHTML = svg
          if (animationCSS) {
            injectStyles(containerRef.current, animationCSS)
          }
          setError(null)
          onRenderSuccess?.()
        }
      } catch (err) {
        if (currentRenderId !== renderIdRef.current) return
        const errorMessage = err instanceof Error ? err.message : 'Render failed'
        setError(errorMessage)
        onRenderError?.(errorMessage)
      }
    }

    render()
  }, [source, layout, theme, initialized, onRenderSuccess, onRenderError])

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

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span className="mr-4 break-all">{error}</span>
          <Button variant="outline" size="sm" onClick={handleCopyError}>
            <Copy className="h-4 w-4 mr-1" />
            复制错误
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div className="absolute top-2 right-2 flex gap-2 z-10">
        <Button variant="outline" size="sm" onClick={handleExportPng}>
          <Download className="h-4 w-4 mr-1" />
          PNG
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportSvg}>
          <Download className="h-4 w-4 mr-1" />
          SVG
        </Button>
      </div>
      <div
        ref={containerRef}
        className="w-full overflow-auto p-4 bg-white dark:bg-gray-900 rounded-lg"
      />
    </div>
  )
}
