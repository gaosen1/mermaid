import { marked } from 'marked'

// GFM（GitHub Flavored Markdown）默认开启，支持多表格、代码块、任务列表等。
// 将编辑器中的单个换行转换为 <br>，避免用户输入的换行在预览中被折叠。
marked.setOptions({ gfm: true, breaks: true })

// ```mermaid 代码块在 marked 阶段输出占位 div，
// 实际图表由 MermaidBlock 组件使用平台渲染管线（含自定义 DSL）异步渲染。
let mermaidBlockCollector: string[] | null = null

marked.use({
  renderer: {
    code({ lang, text }) {
      if (mermaidBlockCollector && lang?.trim().toLowerCase() === 'mermaid') {
        const index = mermaidBlockCollector.push(text) - 1
        return `<div class="md-mermaid" data-md-mermaid-index="${index}"></div>\n`
      }
      // 返回 false 走 marked 默认渲染
      return false
    },
  },
})

export interface RenderedMarkdown {
  html: string
  mermaidBlocks: string[]
}

export function renderMarkdown(source: string): RenderedMarkdown {
  const mermaidBlocks: string[] = []
  mermaidBlockCollector = mermaidBlocks
  try {
    const html = marked.parse(source) as string
    return { html, mermaidBlocks }
  } finally {
    mermaidBlockCollector = null
  }
}

/** 纯 Markdown → HTML（不收集 mermaid 块，供聊天消息等场景直接渲染） */
export function renderMarkdownToHtml(source: string): string {
  return marked.parse(source) as string
}

// 预览分段：普通 HTML 片段与 mermaid 图表块交替，便于将图表块交给独立的 React 组件渲染
export type MarkdownSegment =
  | { type: 'html'; html: string }
  | { type: 'mermaid'; source: string }

const PLACEHOLDER_REGEX = /<div class="md-mermaid" data-md-mermaid-index="(\d+)"><\/div>\n?/g

export function splitMermaidSegments(html: string, mermaidBlocks: string[]): MarkdownSegment[] {
  if (mermaidBlocks.length === 0) {
    return [{ type: 'html', html }]
  }

  const segments: MarkdownSegment[] = []
  let lastIndex = 0

  for (const match of html.matchAll(PLACEHOLDER_REGEX)) {
    const matchStart = match.index ?? 0
    if (matchStart > lastIndex) {
      segments.push({ type: 'html', html: html.slice(lastIndex, matchStart) })
    }
    segments.push({ type: 'mermaid', source: mermaidBlocks[Number(match[1])] ?? '' })
    lastIndex = matchStart + match[0].length
  }

  if (lastIndex < html.length) {
    segments.push({ type: 'html', html: html.slice(lastIndex) })
  }

  return segments
}
