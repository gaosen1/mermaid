import { useEffect, useRef, useState } from 'react'
import { MermaidRenderer, type MermaidRendererRef } from './MermaidRenderer'
import { MermaidBlock } from '@/components/markdown/MermaidBlock'
import { renderMarkdown, splitMermaidSegments } from '@/utils/markdown'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Diagram, LayoutType } from '@/types'

interface PresentationModeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 幻灯片列表（按项目列表顺序） */
  diagrams: Diagram[]
  startIndex: number
}

type SlideTheme = 'default' | 'dark' | 'forest' | 'neutral' | 'base'

/**
 * 演示模式：全屏翻页浏览项目内的笔记。
 * ←/→/Space 翻页，Esc 退出；2s 无操作自动隐藏底栏与光标。
 */
export function PresentationMode({ open, onOpenChange, diagrams, startIndex }: PresentationModeProps) {
  const [index, setIndex] = useState(startIndex)
  const [chromeVisible, setChromeVisible] = useState(true)
  const hideTimerRef = useRef<number | null>(null)
  const mermaidRef = useRef<MermaidRendererRef>(null)
  const { settings } = useSettingsStore()

  useEffect(() => {
    if (open) setIndex(startIndex)
  }, [open, startIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, diagrams.length - 1))
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'f' || e.key === 'F') {
        mermaidRef.current?.fitToContainer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, diagrams.length, onOpenChange])

  const poke = () => {
    setChromeVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), 2000)
  }
  useEffect(() => {
    if (!open) return
    poke()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [open])

  if (!open) return null
  const diagram = diagrams[index]
  if (!diagram) return null

  const theme = settings.renderTheme as SlideTheme
  const layout = settings.defaultLayout as LayoutType

  return (
    <div
      className={`fixed inset-0 z-[90] bg-background flex flex-col ${chromeVisible ? '' : 'cursor-none'}`}
      onMouseMove={poke}
    >
      <div className="flex-1 min-h-0 flex items-center justify-center p-8">
        <Slide diagram={diagram} theme={theme} layout={layout} mermaidRef={mermaidRef} />
      </div>
      {chromeVisible && (
        <div className="shrink-0 flex items-center justify-center gap-3 pb-4 text-sm text-muted-foreground">
          <span className="truncate max-w-[50%]">{diagram.name}</span>
          <span>
            {index + 1} / {diagrams.length}
          </span>
          <span className="text-xs">←/→ 翻页 · Esc 退出</span>
        </div>
      )}
    </div>
  )
}

function Slide({
  diagram,
  theme,
  layout,
  mermaidRef,
}: {
  diagram: Diagram
  theme: SlideTheme
  layout: LayoutType
  mermaidRef: React.RefObject<MermaidRendererRef | null>
}) {
  switch (diagram.type) {
    case 'mermaid':
      return (
        <div className="w-full h-full">
          <MermaidRenderer
            ref={mermaidRef}
            source={diagram.source}
            theme={theme}
            layout={layout}
            showControls={false}
          />
        </div>
      )
    case 'markdown': {
      const { html, mermaidBlocks } = renderMarkdown(diagram.source)
      const segments = splitMermaidSegments(html, mermaidBlocks)
      return (
        <div className="w-full h-full overflow-auto ai-md max-w-3xl">
          {segments.map((s, i) =>
            s.type === 'html' ? (
              <div key={i} dangerouslySetInnerHTML={{ __html: s.html }} />
            ) : (
              <MermaidBlock key={i} source={s.source} theme={theme} layout={layout} />
            )
          )}
        </div>
      )
    }
    case 'png':
    case 'jpg':
    case 'webp':
      return <img src={diagram.source} alt={diagram.name} className="max-h-full max-w-full object-contain" />
    case 'svg':
      return (
        <div
          className="max-h-full max-w-full overflow-hidden [&_svg]:max-h-[80vh] [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: diagram.source }}
        />
      )
    case 'html':
      return <iframe title={diagram.name} sandbox="" srcDoc={diagram.source} className="w-full h-full rounded bg-background" />
    default:
      return <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-full max-w-3xl">{diagram.source}</pre>
  }
}
