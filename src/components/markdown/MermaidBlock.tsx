import { useEffect, useState } from 'react'
import { initMermaid, renderMermaid } from '@/utils/mermaid'
import { parseExtendedDSL, generateAnimationCSS, injectStyles, parseFrontmatter } from '@/utils/dsl'
import { parseAllEdgeStylesFromSource } from '@/utils/edgeDsl'
import { applyEdgeStyle } from '@/components/mermaid/svgStyleApplier'
import { cleanupMermaidErrors } from '@/components/mermaid/svgUtils'
import type { LayoutType } from '@/types'

export type MermaidBlockTheme = 'default' | 'dark' | 'forest' | 'neutral' | 'base'

// 输入过程中的防抖延迟，避免每次按键都触发 mermaid 渲染
const RENDER_DEBOUNCE_MS = 300
// 缓存已渲染结果，未变更的代码块可同步恢复，避免编辑其他内容时图表闪烁
const MAX_CACHE_SIZE = 100

const renderedBlockCache = new Map<string, string>()

function cacheKey(source: string, theme: string, layout: string): string {
  return `${theme}|${layout}|\u0000${source}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildErrorHtml(source: string, message: string): string {
  return (
    `<div class="md-mermaid-error-title">Mermaid 渲染失败</div>` +
    `<pre class="md-mermaid-error-msg">${escapeHtml(formatMermaidError(message))}</pre>` +
    `<pre class="md-mermaid-error-source">${escapeHtml(source)}</pre>`
  )
}

// mermaid 解析错误会携带完整的 Expecting token 列表，非常冗长，只保留前几个 token
function formatMermaidError(message: string): string {
  return message.replace(/Expecting ('[^']*'(?:,\s*'[^']*')*),\s*got/, (_match, list: string) => {
    const tokens = list.match(/'[^']*'/g) ?? []
    if (tokens.length <= 4) return _match
    return `Expecting ${tokens.slice(0, 3).join(', ')} 等, got`
  })
}

/**
 * 使用平台 Mermaid 渲染管线（自定义 DSL、Frontmatter、ELK 布局、边样式、动画）
 * 渲染单个代码块，返回可注入的 HTML。
 */
async function renderMermaidBlockHtml(
  source: string,
  theme: MermaidBlockTheme,
  layout: LayoutType,
): Promise<string> {
  const { config: frontmatterConfig, content } = parseFrontmatter(source)
  await initMermaid(frontmatterConfig?.layout || layout, theme)

  const { source: processedSource, animations } = parseExtendedDSL(content)
  const animationCSS = generateAnimationCSS(animations)

  const containerId = `md-mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`

  // 隐藏 mermaid 渲染时创建的临时容器，防止闪烁
  const hideStyle = document.createElement('style')
  hideStyle.textContent = `body > div[id^="dmd-mermaid-"] { visibility: hidden !important; position: absolute !important; left: -9999px !important; }`
  document.head.appendChild(hideStyle)

  let svg: string
  try {
    ;({ svg } = await renderMermaid(processedSource, containerId))
  } finally {
    hideStyle.remove()
    cleanupMermaidErrors()
  }

  const container = document.createElement('div')
  container.innerHTML = svg

  const svgEl = container.querySelector('svg')
  if (svgEl) {
    // 重新应用 leader 边样式（与 MermaidRenderer 保持一致）
    const leaderStyles = parseAllEdgeStylesFromSource(source)
    for (const { index, style } of leaderStyles) {
      applyEdgeStyle(svgEl, index, style)
    }
  }

  if (animationCSS) {
    injectStyles(container, animationCSS)
  }

  return container.innerHTML
}

function setCache(key: string, html: string): void {
  if (renderedBlockCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = renderedBlockCache.keys().next().value
    if (oldestKey !== undefined) renderedBlockCache.delete(oldestKey)
  }
  renderedBlockCache.set(key, html)
}

interface MermaidBlockProps {
  source: string
  theme: MermaidBlockTheme
  layout: LayoutType
}

/**
 * Markdown 预览中内嵌的单个 ```mermaid 图表块。
 * 渲染结果保存在组件 state 中，由 React 管理 DOM，父级重渲染不会影响已渲染的图表。
 */
export function MermaidBlock({ source, theme, layout }: MermaidBlockProps) {
  const [html, setHtml] = useState<string | null>(
    () => renderedBlockCache.get(cacheKey(source, theme, layout)) ?? null,
  )

  useEffect(() => {
    const cached = renderedBlockCache.get(cacheKey(source, theme, layout))
    if (cached !== undefined) {
      setHtml(cached)
      return
    }

    setHtml(null)
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const result = await renderMermaidBlockHtml(source, theme, layout)
        setCache(cacheKey(source, theme, layout), result)
        if (!cancelled) setHtml(result)
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Render failed'
          setHtml(buildErrorHtml(source, message))
        }
      }
    }, RENDER_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [source, theme, layout])

  if (html === null) {
    return (
      <div className="md-mermaid">
        <div className="md-mermaid-loading">图表渲染中…</div>
      </div>
    )
  }

  return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: html }} />
}
