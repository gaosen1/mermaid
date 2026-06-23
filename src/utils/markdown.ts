import { marked } from 'marked'

// GFM（GitHub Flavored Markdown）默认开启，支持多表格、代码块、任务列表等
marked.setOptions({ gfm: true, breaks: false })

export function renderMarkdown(source: string): string {
  return marked.parse(source) as string
}
