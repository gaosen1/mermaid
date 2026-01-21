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

export function parseExtendedDSL(source: string): ParsedDSL {
  const animations: AnimationConfig[] = []
  const styles: StyleConfig[] = []
  const classes: string[] = []

  const animationRegex = /(\w+)@\{\s*animation:\s*(\w+)\s*\}/g
  let processedSource = source.replace(animationRegex, (_, nodeId, animation) => {
    animations.push({ nodeId, animation })
    const className = `animation-${animation}`
    classes.push(`class ${nodeId} ${className};`)
    return nodeId
  })

  const styleRegex = /(\w+)@\{\s*([^}]+)\s*\}/g
  processedSource = processedSource.replace(styleRegex, (_, nodeId, styleStr) => {
    const styleConfig: StyleConfig = { nodeId }

    const fillMatch = styleStr.match(/fill:\s*([^;]+)/)
    if (fillMatch) styleConfig.fill = fillMatch[1].trim()

    const colorMatch = styleStr.match(/color:\s*([^;]+)/)
    if (colorMatch) styleConfig.color = colorMatch[1].trim()

    const strokeMatch = styleStr.match(/stroke:\s*([^;]+)/)
    if (strokeMatch) styleConfig.stroke = strokeMatch[1].trim()

    const strokeWidthMatch = styleStr.match(/stroke-width:\s*([^;]+)/)
    if (strokeWidthMatch) styleConfig.strokeWidth = strokeWidthMatch[1].trim()

    styles.push(styleConfig)

    const styleProps: string[] = []
    if (styleConfig.fill) styleProps.push(`fill:${styleConfig.fill}`)
    if (styleConfig.color) styleProps.push(`color:${styleConfig.color}`)
    if (styleConfig.stroke) styleProps.push(`stroke:${styleConfig.stroke}`)
    if (styleConfig.strokeWidth) styleProps.push(`stroke-width:${styleConfig.strokeWidth}`)

    if (styleProps.length > 0) {
      classes.push(`style ${nodeId} ${styleProps.join(',')}`)
    }

    return nodeId
  })

  if (classes.length > 0) {
    processedSource = processedSource.trim() + '\n' + classes.join('\n')
  }

  return {
    source: processedSource,
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
