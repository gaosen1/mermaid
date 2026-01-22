/**
 * Edge DSL 解析和写回工具
 *
 * 用于解析 Mermaid source 中的 linkStyle 指令，以及将样式更新写回 source
 */

export interface EdgeStyle {
  color?: string
  stroke?: 'normal' | 'dotted' | 'thick'
  animation?: 'none' | 'slow' | 'fast'
}

export interface LinkStyleUpdate {
  index: number
  style: EdgeStyle
}

interface ParsedLinkStyle {
  index: number
  styles: Record<string, string>
  line: string
  lineIndex: number
}

/**
 * 将 EdgeStyle 转换为 CSS 样式字符串
 */
function edgeStyleToCss(style: EdgeStyle): string {
  const parts: string[] = []

  // Color
  if (style.color) {
    parts.push(`stroke:${style.color}`)
  }

  // Stroke type
  switch (style.stroke) {
    case 'normal':
      parts.push('stroke-width:1px')
      break
    case 'dotted':
      parts.push('stroke-dasharray:5 5', 'stroke-width:1px')
      break
    case 'thick':
      parts.push('stroke-width:2px')
      break
  }

  // Animation
  switch (style.animation) {
    case 'slow':
      parts.push('animation:mermaid-edge-dash 1.5s linear infinite')
      break
    case 'fast':
      parts.push('animation:mermaid-edge-dash 0.6s linear infinite')
      break
    case 'none':
      // 不添加动画
      break
  }

  return parts.join(',')
}

/**
 * 从 CSS 样式字符串解析 EdgeStyle
 */
function cssToEdgeStyle(cssString: string): EdgeStyle {
  const style: EdgeStyle = {}

  // 解析 stroke (颜色)
  const strokeMatch = cssString.match(/stroke\s*:\s*([^,;]+)/)
  if (strokeMatch) {
    const value = strokeMatch[1].trim()
    // 排除 stroke-width 和 stroke-dasharray 的情况
    if (!value.includes('px') && !value.includes('dasharray')) {
      style.color = value
    }
  }

  // 解析 stroke-width
  const strokeWidthMatch = cssString.match(/stroke-width\s*:\s*(\d+)px/)
  if (strokeWidthMatch) {
    const width = parseInt(strokeWidthMatch[1], 10)
    if (width >= 2) {
      style.stroke = 'thick'
    } else {
      style.stroke = 'normal'
    }
  }

  // 解析 stroke-dasharray
  const dasharrayMatch = cssString.match(/stroke-dasharray\s*:\s*[\d\s]+/)
  if (dasharrayMatch) {
    style.stroke = 'dotted'
  }

  // 解析 animation
  const animationMatch = cssString.match(/animation\s*:\s*mermaid-edge-dash\s+([\d.]+)s/)
  if (animationMatch) {
    const duration = parseFloat(animationMatch[1])
    style.animation = duration <= 1 ? 'fast' : 'slow'
  } else if (!cssString.includes('animation')) {
    style.animation = 'none'
  }

  return style
}

/**
 * 解析 source 中的所有 linkStyle 指令
 */
function parseLinkStyles(source: string): ParsedLinkStyle[] {
  const lines = source.split('\n')
  const linkStyles: ParsedLinkStyle[] = []

  // 匹配 linkStyle 指令: linkStyle 0 stroke:#ff0000,stroke-width:2px
  const linkStyleRegex = /^\s*linkStyle\s+(\d+)\s+(.+)$/

  lines.forEach((line, lineIndex) => {
    const match = line.match(linkStyleRegex)
    if (match) {
      const index = parseInt(match[1], 10)
      const styleStr = match[2].trim()

      // 解析样式字符串为对象
      const styles: Record<string, string> = {}
      styleStr.split(',').forEach((part) => {
        const colonIndex = part.indexOf(':')
        if (colonIndex !== -1) {
          const key = part.slice(0, colonIndex).trim()
          const value = part.slice(colonIndex + 1).trim()
          styles[key] = value
        }
      })

      linkStyles.push({
        index,
        styles,
        line,
        lineIndex,
      })
    }
  })

  return linkStyles
}

/**
 * 从 source 解析指定 index 的 edge 样式
 */
export function parseEdgeStyleFromSource(source: string, index: number): EdgeStyle {
  const linkStyles = parseLinkStyles(source)
  const existing = linkStyles.find((ls) => ls.index === index)

  if (!existing) {
    return {}
  }

  // 重建 CSS 字符串并解析
  const cssString = Object.entries(existing.styles)
    .map(([k, v]) => `${k}:${v}`)
    .join(',')

  return cssToEdgeStyle(cssString)
}

/**
 * 增量更新 source 中的 linkStyle
 *
 * 规则：
 * 1. 如果已存在该 index 的 linkStyle，替换该行
 * 2. 如果不存在，在末尾添加新行
 * 3. 保持其他内容不变
 */
export function updateSourceWithEdgeStyle(
  source: string,
  update: LinkStyleUpdate
): string {
  const { index, style } = update
  const cssString = edgeStyleToCss(style)

  // 如果样式为空，移除 linkStyle 行
  if (!cssString) {
    return removeEdgeLinkStyle(source, index)
  }

  const lines = source.split('\n')
  const linkStyleRegex = new RegExp(`^\\s*linkStyle\\s+${index}\\s+`)

  let replaced = false
  const newLines = lines.map((line) => {
    if (linkStyleRegex.test(line)) {
      replaced = true
      return `linkStyle ${index} ${cssString}`
    }
    return line
  })

  if (!replaced) {
    // 在末尾添加新行（确保前面有换行）
    const trimmedSource = source.trimEnd()
    return `${trimmedSource}\nlinkStyle ${index} ${cssString}`
  }

  return newLines.join('\n')
}

/**
 * 移除指定 index 的 linkStyle 行
 */
function removeEdgeLinkStyle(source: string, index: number): string {
  const lines = source.split('\n')
  const linkStyleRegex = new RegExp(`^\\s*linkStyle\\s+${index}\\s+`)

  const newLines = lines.filter((line) => !linkStyleRegex.test(line))

  return newLines.join('\n')
}

/**
 * 合并 EdgeStyle
 */
export function mergeEdgeStyle(
  existing: EdgeStyle,
  updates: Partial<EdgeStyle>
): EdgeStyle {
  return {
    ...existing,
    ...updates,
  }
}
