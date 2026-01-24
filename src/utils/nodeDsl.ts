/**
 * Node DSL 解析和写回工具
 *
 * 用于解析 Mermaid source 中的 style 指令，以及将样式更新写回 source
 */

export interface NodeStyle {
  fill?: string // 背景色
  stroke?: string // 边框颜色
  strokeType?: 'normal' | 'dotted' | 'thick' // 边框样式
  color?: string // 文字颜色
  animation?: 'none' | 'pulse' | 'blink' // 动画效果
}

// Mermaid 节点形状映射
export type NodeShape =
  | 'rectangle' // [text]
  | 'rounded' // (text)
  | 'stadium' // ([text])
  | 'diamond' // {text}
  | 'hexagon' // {{text}}
  | 'circle' // ((text))
  | 'parallelogram' // [/text/]
  | 'trapezoid' // [/text\]
  | 'subroutine' // [[text]]
  | 'cylinder' // [(text)]
  | 'asymmetric' // >text]

// 形状语法映射
const SHAPE_SYNTAX: Record<NodeShape, { open: string; close: string }> = {
  rectangle: { open: '[', close: ']' },
  rounded: { open: '(', close: ')' },
  stadium: { open: '([', close: '])' },
  diamond: { open: '{', close: '}' },
  hexagon: { open: '{{', close: '}}' },
  circle: { open: '((', close: '))' },
  parallelogram: { open: '[/', close: '/]' },
  trapezoid: { open: '[/', close: '\\]' },
  subroutine: { open: '[[', close: ']]' },
  cylinder: { open: '[(', close: ')]' },
  asymmetric: { open: '>', close: ']' },
}

// 从语法推断形状
function inferShapeFromSyntax(open: string, close: string): NodeShape {
  for (const [shape, syntax] of Object.entries(SHAPE_SYNTAX)) {
    if (syntax.open === open && syntax.close === close) {
      return shape as NodeShape
    }
  }
  return 'rectangle' // 默认
}

/**
 * 将 NodeStyle 转换为 CSS 样式字符串
 */
export function nodeStyleToCss(style: NodeStyle): string {
  const parts: string[] = []

  // 背景色
  if (style.fill) {
    parts.push(`fill:${style.fill}`)
  }

  // 边框颜色
  if (style.stroke) {
    parts.push(`stroke:${style.stroke}`)
  }

  // 边框样式
  switch (style.strokeType) {
    case 'normal':
      parts.push('stroke-width:1px')
      break
    case 'dotted':
      parts.push('stroke-dasharray:5 5', 'stroke-width:1px')
      break
    case 'thick':
      parts.push('stroke-width:3px')
      break
  }

  // 文字颜色
  if (style.color) {
    parts.push(`color:${style.color}`)
  }

  // 动画
  switch (style.animation) {
    case 'pulse':
      parts.push('animation:mermaid-node-pulse 2s ease-in-out infinite')
      break
    case 'blink':
      parts.push('animation:mermaid-node-blink 1s step-start infinite')
      break
    case 'none':
      // 不添加动画
      break
  }

  return parts.join(',')
}

/**
 * 从 CSS 样式字符串解析 NodeStyle
 */
export function cssToNodeStyle(cssString: string): NodeStyle {
  const style: NodeStyle = {}

  // 解析 fill（背景色）
  const fillMatch = cssString.match(/fill\s*:\s*([^,;]+)/)
  if (fillMatch) {
    style.fill = fillMatch[1].trim()
  }

  // 解析 stroke（边框颜色）- 排除 stroke-width 和 stroke-dasharray
  const strokeMatch = cssString.match(/(?<![a-z-])stroke\s*:\s*([^,;]+)/i)
  if (strokeMatch) {
    const value = strokeMatch[1].trim()
    if (!value.includes('px') && !value.includes('dasharray')) {
      style.stroke = value
    }
  }

  // 解析 stroke-width
  const strokeWidthMatch = cssString.match(/stroke-width\s*:\s*(\d+)px/)
  if (strokeWidthMatch) {
    const width = parseInt(strokeWidthMatch[1], 10)
    if (width >= 3) {
      style.strokeType = 'thick'
    } else {
      style.strokeType = 'normal'
    }
  }

  // 解析 stroke-dasharray（虚线会覆盖 strokeType）
  const dasharrayMatch = cssString.match(/stroke-dasharray\s*:\s*[\d\s]+/)
  if (dasharrayMatch) {
    style.strokeType = 'dotted'
  }

  // 解析 color（文字颜色）
  const colorMatch = cssString.match(/(?<![a-z-])color\s*:\s*([^,;]+)/i)
  if (colorMatch) {
    style.color = colorMatch[1].trim()
  }

  // 解析 animation
  const animationMatch = cssString.match(/animation\s*:\s*mermaid-node-(pulse|blink)/)
  if (animationMatch) {
    style.animation = animationMatch[1] as 'pulse' | 'blink'
  } else if (!cssString.includes('animation')) {
    style.animation = 'none'
  }

  return style
}

/**
 * 从 source 解析指定 nodeId 的样式
 */
export function parseNodeStyleFromSource(source: string, nodeId: string): NodeStyle {
  const lines = source.split('\n')
  const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s+(.+)$`)

  for (const line of lines) {
    const match = line.match(styleRegex)
    if (match) {
      return cssToNodeStyle(match[1])
    }
  }

  return {}
}

/**
 * 增量更新 source 中的 style 指令
 */
export function updateSourceWithNodeStyle(
  source: string,
  nodeId: string,
  style: NodeStyle
): string {
  const cssString = nodeStyleToCss(style)

  // 如果样式为空，移除 style 行
  if (!cssString) {
    return removeNodeStyle(source, nodeId)
  }

  const lines = source.split('\n')
  const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s+`)

  let replaced = false
  const newLines = lines.map((line) => {
    if (styleRegex.test(line)) {
      replaced = true
      return `style ${nodeId} ${cssString}`
    }
    return line
  })

  if (!replaced) {
    // 在末尾添加新行
    const trimmedSource = source.trimEnd()
    return `${trimmedSource}\nstyle ${nodeId} ${cssString}`
  }

  return newLines.join('\n')
}

/**
 * 移除指定 nodeId 的 style 行
 */
function removeNodeStyle(source: string, nodeId: string): string {
  const lines = source.split('\n')
  const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s+`)
  const newLines = lines.filter((line) => !styleRegex.test(line))
  return newLines.join('\n')
}

/**
 * 从 source 解析指定 nodeId 的形状
 */
export function parseNodeShapeFromSource(source: string, nodeId: string): NodeShape | null {
  const nodeInfo = findNodeDefinition(source, nodeId)
  if (!nodeInfo) return null
  return inferShapeFromSyntax(nodeInfo.open, nodeInfo.close)
}

/**
 * 更新 source 中节点的形状
 */
export function updateSourceWithNodeShape(
  source: string,
  nodeId: string,
  shape: NodeShape
): string {
  const nodeInfo = findNodeDefinition(source, nodeId)
  if (!nodeInfo) return source

  const syntax = SHAPE_SYNTAX[shape]
  const newNodeDef = `${nodeId}${syntax.open}${nodeInfo.text}${syntax.close}`

  const lines = source.split('\n')
  lines[nodeInfo.lineIndex] = lines[nodeInfo.lineIndex].replace(nodeInfo.fullMatch, newNodeDef)

  return lines.join('\n')
}

/**
 * 从 source 解析指定 nodeId 的文字内容
 */
export function parseNodeTextFromSource(source: string, nodeId: string): string {
  const nodeInfo = findNodeDefinition(source, nodeId)
  if (!nodeInfo) return ''

  let text = nodeInfo.text

  // 移除双引号包裹（如果有）
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1)
  }

  // 将 #quot; 转换回双引号
  text = text.replace(/#quot;/g, '"')

  // 将 <br> 和 <br/> 转换为换行符显示
  return text.replace(/<br\s*\/?>/gi, '\n')
}

/**
 * 更新 source 中节点的文字内容
 */
export function updateSourceWithNodeText(source: string, nodeId: string, text: string): string {
  const nodeInfo = findNodeDefinition(source, nodeId)
  if (!nodeInfo) return source

  // 移除零宽空格（编辑时用于光标定位）
  const cleanedText = text.replace(/\u200B/g, '')
  // 将换行符转换为 <br>
  const escapedText = cleanedText.replace(/\n/g, '<br>')

  // 使用双引号包裹文字，避免特殊字符导致语法错误
  // 同时需要转义文字中的双引号
  const quotedText = `"${escapedText.replace(/"/g, '#quot;')}"`
  const newNodeDef = `${nodeId}${nodeInfo.open}${quotedText}${nodeInfo.close}`

  const lines = source.split('\n')
  lines[nodeInfo.lineIndex] = lines[nodeInfo.lineIndex].replace(nodeInfo.fullMatch, newNodeDef)

  return lines.join('\n')
}

/**
 * 合并 NodeStyle
 */
export function mergeNodeStyle(existing: NodeStyle, updates: Partial<NodeStyle>): NodeStyle {
  return {
    ...existing,
    ...updates,
  }
}

// ============ 辅助函数 ============

interface NodeDefinition {
  nodeId: string
  text: string
  open: string
  close: string
  fullMatch: string
  lineIndex: number
}

/**
 * 查找节点定义
 */
function findNodeDefinition(source: string, nodeId: string): NodeDefinition | null {
  const lines = source.split('\n')

  // 按优先级匹配各种形状语法
  // 顺序很重要：先匹配更长的模式
  const patterns = [
    // 双字符开闭括号
    { open: '([', close: '])', regex: /\(\[(.+?)\]\)/ },
    { open: '{{', close: '}}', regex: /\{\{(.+?)\}\}/ },
    { open: '((', close: '))', regex: /\(\((.+?)\)\)/ },
    { open: '[[', close: ']]', regex: /\[\[(.+?)\]\]/ },
    { open: '[(', close: ')]', regex: /\[\((.+?)\)\]/ },
    { open: '[/', close: '\\]', regex: /\[\/(.+?)\\]/ },
    { open: '[/', close: '/]', regex: /\[\/(.+?)\/\]/ },
    // 单字符开闭括号
    { open: '[', close: ']', regex: /\[([^[\]]+)\]/ },
    { open: '(', close: ')', regex: /\(([^()]+)\)/ },
    { open: '{', close: '}', regex: /\{([^{}]+)\}/ },
    { open: '>', close: ']', regex: />([^\]]+)\]/ },
  ]

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]

    for (const pattern of patterns) {
      // 构建匹配特定 nodeId 的正则
      const fullRegex = new RegExp(
        `(?:^|\\s|;)${escapeRegex(nodeId)}${pattern.regex.source.replace('(.+?)', '(.+?)')}`,
        'g'
      )

      let match
      while ((match = fullRegex.exec(line)) !== null) {
        const text = match[1]
        const fullMatch = `${nodeId}${pattern.open}${text}${pattern.close}`

        // 验证完整匹配存在于原行中
        if (line.includes(fullMatch)) {
          return {
            nodeId,
            text,
            open: pattern.open,
            close: pattern.close,
            fullMatch,
            lineIndex,
          }
        }
      }
    }
  }

  return null
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============ Subgraph 相关函数 ============

interface SubgraphDefinition {
  subgraphId: string
  title: string
  fullMatch: string
  lineIndex: number
}

/**
 * 查找 subgraph 定义
 * Mermaid subgraph 语法: subgraph id [title]
 *
 * 注意：subgraphId 可能是：
 * 1. 源码中定义的 ID（如 sg1）
 * 2. Mermaid 生成的内部 ID（如 subGraph0）
 *
 * 如果是内部 ID，需要通过标题文字来匹配
 */
function findSubgraphDefinition(source: string, subgraphId: string, titleHint?: string): SubgraphDefinition | null {
  const lines = source.split('\n')

  // 匹配 subgraph 语法
  // 格式: subgraph id [title] 或 subgraph id["title"] 或 subgraph id
  const subgraphRegex = /^\s*subgraph\s+(\S+)(?:\s*\[([^\]]*)\])?/

  // 首先尝试通过 ID 精确匹配
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const match = line.match(subgraphRegex)

    if (match && match[1] === subgraphId) {
      const title = match[2] || subgraphId
      const fullMatch = match[0]

      return {
        subgraphId: match[1],
        title,
        fullMatch,
        lineIndex,
      }
    }
  }

  // 如果 ID 匹配失败且提供了标题提示，尝试通过标题匹配
  if (titleHint) {
    // 清理标题提示（移除可能的 HTML 标签和特殊字符）
    const cleanTitleHint = titleHint
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/\u200B/g, '')
      .trim()

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]
      const match = line.match(subgraphRegex)

      if (match) {
        let title = match[2] || match[1]

        // 移除双引号包裹
        if (title.startsWith('"') && title.endsWith('"')) {
          title = title.slice(1, -1)
        }

        // 将 #quot; 转换回双引号
        title = title.replace(/#quot;/g, '"')

        // 将 <br> 转换为换行符
        title = title.replace(/<br\s*\/?>/gi, '\n')

        if (title === cleanTitleHint) {
          return {
            subgraphId: match[1],
            title: match[2] || match[1],
            fullMatch: match[0],
            lineIndex,
          }
        }
      }
    }
  }

  return null
}

/**
 * 从 source 解析指定 subgraph 的标题
 */
export function parseSubgraphTitleFromSource(source: string, subgraphId: string): string {
  const subgraphInfo = findSubgraphDefinition(source, subgraphId)
  if (!subgraphInfo) return ''

  let title = subgraphInfo.title

  // 移除双引号包裹（如果有）
  if (title.startsWith('"') && title.endsWith('"')) {
    title = title.slice(1, -1)
  }

  // 将 #quot; 转换回双引号
  title = title.replace(/#quot;/g, '"')

  // 将 <br> 和 <br/> 转换为换行符显示
  return title.replace(/<br\s*\/?>/gi, '\n')
}

/**
 * 更新 source 中 subgraph 的标题
 * @param source 源码
 * @param subgraphId Mermaid 生成的 subgraph ID（可能是内部 ID 如 subGraph0）
 * @param newTitle 新标题
 * @param originalTitle 原始标题（用于在 ID 匹配失败时通过标题匹配）
 */
export function updateSourceWithSubgraphTitle(
  source: string,
  subgraphId: string,
  newTitle: string,
  originalTitle?: string
): string {
  const subgraphInfo = findSubgraphDefinition(source, subgraphId, originalTitle)
  if (!subgraphInfo) return source

  // 移除零宽空格（编辑时用于光标定位）
  const cleanedTitle = newTitle.replace(/\u200B/g, '')
  // 将换行符转换为 <br>
  const escapedTitle = cleanedTitle.replace(/\n/g, '<br>')

  // 使用双引号包裹标题，避免特殊字符导致语法错误
  // 同时需要转义标题中的双引号
  const quotedTitle = `"${escapedTitle.replace(/"/g, '#quot;')}"`
  // 使用源码中的真实 subgraphId，而不是 Mermaid 生成的内部 ID
  const newSubgraphDef = `subgraph ${subgraphInfo.subgraphId} [${quotedTitle}]`

  const lines = source.split('\n')
  lines[subgraphInfo.lineIndex] = lines[subgraphInfo.lineIndex].replace(subgraphInfo.fullMatch, newSubgraphDef)

  return lines.join('\n')
}

// ============ Subgraph 样式相关函数 ============

/**
 * Subgraph 样式接口（与 NodeStyle 类似，但不包含形状相关属性）
 */
export interface SubgraphStyle {
  fill?: string // 背景色
  stroke?: string // 边框颜色
  strokeType?: 'normal' | 'dotted' | 'thick' // 边框样式
  color?: string // 文字颜色
}

/**
 * 将 SubgraphStyle 转换为 CSS 样式字符串
 */
export function subgraphStyleToCss(style: SubgraphStyle): string {
  const parts: string[] = []

  // 背景色
  if (style.fill) {
    parts.push(`fill:${style.fill}`)
  }

  // 边框颜色
  if (style.stroke) {
    parts.push(`stroke:${style.stroke}`)
  }

  // 边框样式
  switch (style.strokeType) {
    case 'normal':
      parts.push('stroke-width:1px')
      break
    case 'dotted':
      parts.push('stroke-dasharray:5 5', 'stroke-width:1px')
      break
    case 'thick':
      parts.push('stroke-width:3px')
      break
  }

  // 文字颜色
  if (style.color) {
    parts.push(`color:${style.color}`)
  }

  return parts.join(',')
}

/**
 * 从 CSS 样式字符串解析 SubgraphStyle
 */
export function cssToSubgraphStyle(cssString: string): SubgraphStyle {
  const style: SubgraphStyle = {}

  // 解析 fill（背景色）
  const fillMatch = cssString.match(/fill\s*:\s*([^,;]+)/)
  if (fillMatch) {
    style.fill = fillMatch[1].trim()
  }

  // 解析 stroke（边框颜色）- 排除 stroke-width 和 stroke-dasharray
  const strokeMatch = cssString.match(/(?<![a-z-])stroke\s*:\s*([^,;]+)/i)
  if (strokeMatch) {
    const value = strokeMatch[1].trim()
    if (!value.includes('px') && !value.includes('dasharray')) {
      style.stroke = value
    }
  }

  // 解析 stroke-width
  const strokeWidthMatch = cssString.match(/stroke-width\s*:\s*(\d+)px/)
  if (strokeWidthMatch) {
    const width = parseInt(strokeWidthMatch[1], 10)
    if (width >= 3) {
      style.strokeType = 'thick'
    } else {
      style.strokeType = 'normal'
    }
  }

  // 解析 stroke-dasharray（虚线会覆盖 strokeType）
  const dasharrayMatch = cssString.match(/stroke-dasharray\s*:\s*[\d\s]+/)
  if (dasharrayMatch) {
    style.strokeType = 'dotted'
  }

  // 解析 color（文字颜色）
  const colorMatch = cssString.match(/(?<![a-z-])color\s*:\s*([^,;]+)/i)
  if (colorMatch) {
    style.color = colorMatch[1].trim()
  }

  return style
}

/**
 * 从 source 解析指定 subgraph 的样式
 * Mermaid 使用 style 指令为 subgraph 设置样式，格式与节点相同
 */
export function parseSubgraphStyleFromSource(source: string, subgraphId: string): SubgraphStyle {
  const lines = source.split('\n')
  const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegex(subgraphId)}\\s+(.+)$`)

  for (const line of lines) {
    const match = line.match(styleRegex)
    if (match) {
      return cssToSubgraphStyle(match[1])
    }
  }

  return {}
}

/**
 * 更新 source 中 subgraph 的样式
 */
export function updateSourceWithSubgraphStyle(
  source: string,
  subgraphId: string,
  style: SubgraphStyle
): string {
  const cssString = subgraphStyleToCss(style)

  // 如果样式为空，移除 style 行
  if (!cssString) {
    return removeSubgraphStyle(source, subgraphId)
  }

  const lines = source.split('\n')
  const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegex(subgraphId)}\\s+`)

  let replaced = false
  const newLines = lines.map((line) => {
    if (styleRegex.test(line)) {
      replaced = true
      return `style ${subgraphId} ${cssString}`
    }
    return line
  })

  if (!replaced) {
    // 在末尾添加新行
    const trimmedSource = source.trimEnd()
    return `${trimmedSource}\nstyle ${subgraphId} ${cssString}`
  }

  return newLines.join('\n')
}

/**
 * 移除指定 subgraph 的 style 行
 */
function removeSubgraphStyle(source: string, subgraphId: string): string {
  const lines = source.split('\n')
  const styleRegex = new RegExp(`^\\s*style\\s+${escapeRegex(subgraphId)}\\s+`)
  const newLines = lines.filter((line) => !styleRegex.test(line))
  return newLines.join('\n')
}
