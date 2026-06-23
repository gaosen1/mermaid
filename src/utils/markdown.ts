/**
 * Markdown 表格相关工具函数
 * 支持标准 Markdown 表格格式，预留扩展空间供未来支持其他 Markdown 块
 */

export interface ParsedMarkdownTable {
  type: 'table' | 'text'
  rows?: string[][]
  text?: string
}

/**
 * 检查是否为合法的 Markdown 表格
 * 标准格式：
 * | 列1 | 列2 |
 * |----|-----|
 * | 值1 | 值2 |
 */
export function isValidMarkdownTable(content: string): boolean {
  if (!content.trim()) return false

  const lines = content.trim().split('\n').filter(line => line.trim())
  if (lines.length < 3) return false

  // 第一行和第三行应该是表格行（以 | 开头和结尾）
  const firstLine = lines[0].trim()
  const secondLine = lines[1].trim()

  // 验证第一行是表格行
  if (!firstLine.startsWith('|') || !firstLine.endsWith('|')) return false

  // 验证第二行是分隔符行（包含 ---|、:---|、---:|、:---: 等）
  if (!secondLine.startsWith('|') || !secondLine.endsWith('|')) return false

  const separators = secondLine.split('|').filter(s => s.trim())
  for (const sep of separators) {
    const trimmed = sep.trim()
    // 检查是否为有效的分隔符（由 -, :, 空格组成）
    if (!/^[\s:-]+$/.test(trimmed)) return false
    // 至少要有一个 -
    if (!/-/.test(trimmed)) return false
  }

  return true
}

/**
 * 解析 Markdown 表格或纯文本
 */
export function parseMarkdown(content: string): ParsedMarkdownTable {
  if (isValidMarkdownTable(content)) {
    const rows = content
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .filter((_, idx) => idx !== 1) // 跳过分隔符行
      .map(line =>
        line
          .split('|')
          .filter(cell => cell !== '')
          .map(cell => cell.trim())
      )
    return { type: 'table', rows }
  }

  return { type: 'text', text: content }
}

/**
 * 将解析后的表格转为 HTML
 */
export function markdownTableToHtml(rows: string[][]): string {
  if (!rows.length) return ''

  const headerCells = rows[0]
    .map(cell => `<th>${escapeHtml(cell)}</th>`)
    .join('')
  const header = `<thead><tr>${headerCells}</tr></thead>`

  const bodyRows = rows
    .slice(1)
    .map(row => {
      const cells = row
        .map(cell => `<td>${escapeHtml(cell)}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  const body = `<tbody>${bodyRows}</tbody>`

  return `<table>${header}${body}</table>`
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
