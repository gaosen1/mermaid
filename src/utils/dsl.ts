import type { ParsedDSL, AnimationConfig, StyleConfig, DiagramConfig } from '@/types'

const ANIMATION_CSS: Record<string, string> = {
  slow: `
    stroke-dasharray: 5 5;
    animation: dash 4s linear infinite;
  `,
  fast: `
    stroke-dasharray: 5 5;
    animation: dash 1s linear infinite;
  `,
  pulse: `
    animation: pulse 2s ease-in-out infinite;
  `,
  blink: `
    animation: blink 1s step-start infinite;
  `,
}

const ANIMATION_KEYFRAMES = `
@keyframes dash {
  to { stroke-dashoffset: -100; }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes blink {
  50% { opacity: 0; }
}
`

export function parseFrontmatter(source: string): { config: DiagramConfig | null; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = source.match(frontmatterRegex)

  if (!match) {
    return { config: null, content: source }
  }

  try {
    const yaml = match[1]
    const config: DiagramConfig = {}

    const layoutMatch = yaml.match(/layout:\s*(\w+)/)
    if (layoutMatch) {
      config.layout = layoutMatch[1] as 'elk' | 'dagre'
    }

    const themeMatch = yaml.match(/theme:\s*(\w+)/)
    if (themeMatch) {
      config.theme = themeMatch[1] as DiagramConfig['theme']
    }

    return { config, content: source.slice(match[0].length) }
  } catch {
    return { config: null, content: source }
  }
}

// 自定义扩展属性列表
const CUSTOM_PROPS = ['animation', 'fill', 'color', 'stroke', 'stroke-width']

function isCustomExtension(content: string): boolean {
  // 检查是否包含我们自定义的属性
  return CUSTOM_PROPS.some(prop => {
    const regex = new RegExp(`\\b${prop}\\s*:`)
    return regex.test(content)
  })
}

export function parseExtendedDSL(source: string): ParsedDSL {
  const animations: AnimationConfig[] = []
  const styles: StyleConfig[] = []
  const classes: string[] = []

  // 匹配 NODE@{...} 格式，但只处理包含自定义属性的
  const extendedSyntaxRegex = /(\w+)@\{\s*([^}]+)\s*\}/g

  const processedSource = source.replace(extendedSyntaxRegex, (match, nodeId, content) => {
    // 如果不是我们的自定义扩展语法，保留原样
    if (!isCustomExtension(content)) {
      return match
    }

    // 处理 animation 属性
    const animationMatch = content.match(/animation:\s*(\w+)/)
    if (animationMatch) {
      const animation = animationMatch[1]
      animations.push({ nodeId, animation })
      const className = `animation-${animation}`
      classes.push(`class ${nodeId} ${className};`)
    }

    // 处理样式属性
    const styleConfig: StyleConfig = { nodeId }
    let hasStyle = false

    const fillMatch = content.match(/fill:\s*([^;}\s]+)/)
    if (fillMatch) {
      styleConfig.fill = fillMatch[1].trim()
      hasStyle = true
    }

    const colorMatch = content.match(/color:\s*([^;}\s]+)/)
    if (colorMatch) {
      styleConfig.color = colorMatch[1].trim()
      hasStyle = true
    }

    const strokeMatch = content.match(/stroke:\s*([^;}\s]+)/)
    if (strokeMatch) {
      styleConfig.stroke = strokeMatch[1].trim()
      hasStyle = true
    }

    const strokeWidthMatch = content.match(/stroke-width:\s*([^;}\s]+)/)
    if (strokeWidthMatch) {
      styleConfig.strokeWidth = strokeWidthMatch[1].trim()
      hasStyle = true
    }

    if (hasStyle) {
      styles.push(styleConfig)
      const styleProps: string[] = []
      if (styleConfig.fill) styleProps.push(`fill:${styleConfig.fill}`)
      if (styleConfig.color) styleProps.push(`color:${styleConfig.color}`)
      if (styleConfig.stroke) styleProps.push(`stroke:${styleConfig.stroke}`)
      if (styleConfig.strokeWidth) styleProps.push(`stroke-width:${styleConfig.strokeWidth}`)
      if (styleProps.length > 0) {
        classes.push(`style ${nodeId} ${styleProps.join(',')}`)
      }
    }

    // 移除自定义扩展语法，只保留节点 ID
    return nodeId
  })

  let finalSource = processedSource
  if (classes.length > 0) {
    finalSource = processedSource.trim() + '\n' + classes.join('\n')
  }

  return {
    source: finalSource,
    classes,
    styles: styles.map(s => JSON.stringify(s)),
    animations,
  }
}

export function generateAnimationCSS(animations: AnimationConfig[]): string {
  if (animations.length === 0) return ''

  const cssRules = animations.map(({ animation }) => {
    const css = ANIMATION_CSS[animation]
    if (!css) return ''
    return `.animation-${animation} * { ${css} }`
  }).filter(Boolean).join('\n')

  return `${ANIMATION_KEYFRAMES}\n${cssRules}`
}

export function injectStyles(container: HTMLElement, css: string): void {
  const existingStyle = container.querySelector('style[data-mermaid-animation]')
  if (existingStyle) {
    existingStyle.textContent = css
    return
  }

  const style = document.createElement('style')
  style.setAttribute('data-mermaid-animation', 'true')
  style.textContent = css
  container.prepend(style)
}
