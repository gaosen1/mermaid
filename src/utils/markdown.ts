import { marked } from 'marked'

// GFM（GitHub Flavored Markdown）默认开启，支持多表格、代码块、任务列表等。
// 将编辑器中的单个换行转换为 <br>，避免用户输入的换行在预览中被折叠。
marked.setOptions({ gfm: true, breaks: true })

export function renderMarkdown(source: string): string {
  return marked.parse(source) as string
}
