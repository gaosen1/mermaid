import mermaid from 'mermaid'
import elkLayouts from '@mermaid-js/layout-elk'
import type { LayoutType } from '@/types'

let initialized = false

// 通用边配置：正交走线 + 独立端口
const commonEdgeConfig = {
  // 正交/曼哈顿走线
  'elk.edgeRouting': 'ORTHOGONAL',
  // 禁止合并边，每条边独立端口
  'elk.layered.mergeEdges': 'false',
  // 边与边之间的间距
  'elk.spacing.edgeEdge': '15',
  'elk.spacing.edgeNode': '20',
  // 端口分布策略：均匀分布
  'elk.portAlignment.default': 'DISTRIBUTED',
  'elk.portConstraints': 'FIXED_ORDER',
}

function getElkConfig(layout: LayoutType) {
  switch (layout) {
    case 'hierarchical':
      // 严格分层布局：固定方向、层级清晰、层间距稳定
      return {
        ...commonEdgeConfig,
        mergeEdges: false,
        nodePlacementStrategy: 'SIMPLE',
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.layered.spacing.nodeNodeBetweenLayers': '50',
        'elk.layered.spacing.edgeNodeBetweenLayers': '25',
        'elk.spacing.nodeNode': '30',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      }
    default:
      // elk 默认配置
      return {
        ...commonEdgeConfig,
        mergeEdges: false,
        nodePlacementStrategy: 'NETWORK_SIMPLEX',
        'elk.layered.spacing.nodeNodeBetweenLayers': '45',
        'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      }
  }
}

export async function initMermaid(
  layout: LayoutType = 'elk',
  theme: string = 'base'
): Promise<void> {
  if (!initialized) {
    mermaid.registerLayoutLoaders(elkLayouts)
    initialized = true
  }

  const useElk = layout === 'elk' || layout === 'hierarchical'
  const elkConfig = useElk ? getElkConfig(layout) : {}

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: theme as 'default' | 'dark' | 'forest' | 'neutral' | 'base',
    flowchart: {
      // 使用 linear 配合正交走线，拐角更清晰
      curve: 'linear',
      defaultRenderer: useElk ? 'elk' : undefined,
      // 节点间距
      nodeSpacing: 30,
      rankSpacing: 50,
      // 禁用默认的边合并
      wrappingWidth: 200,
    },
    elk: elkConfig,
  })
}

export async function renderMermaid(
  source: string,
  containerId: string
): Promise<{ svg: string }> {
  const { svg } = await mermaid.render(containerId, source)
  return { svg }
}

export function getSvgFromContainer(container: HTMLElement): string | null {
  const svg = container.querySelector('svg')
  if (!svg) return null

  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  return new XMLSerializer().serializeToString(clone)
}

export function getPngSourceFromContainer(
  container: HTMLElement
): { svgString: string; width: number; height: number } | null {
  const svg = container.querySelector('svg') as SVGSVGElement | null
  if (!svg) return null

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  let width = 0
  let height = 0

  try {
    const bbox = svg.getBBox()
    if (Number.isFinite(bbox.width) && Number.isFinite(bbox.height) && bbox.width > 0 && bbox.height > 0) {
      const padding = 8
      const x = bbox.x - padding
      const y = bbox.y - padding
      width = Math.ceil(bbox.width + padding * 2)
      height = Math.ceil(bbox.height + padding * 2)

      clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      clone.removeAttribute('style')
    }
  } catch {
    // getBBox 在极少数场景可能不可用，交给后续解析兜底
  }

  return {
    svgString: new XMLSerializer().serializeToString(clone),
    width,
    height,
  }
}

function parseSvgLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value.replace('px', ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isExternalReference(value: string | null): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('data:')) return false
  return /^(https?:)?\/\//i.test(trimmed)
}

function stripExternalResourceReferences(svg: SVGSVGElement): void {
  svg.querySelectorAll('image, use, pattern, filter, feImage').forEach((el) => {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href')
    if (isExternalReference(href)) {
      el.remove()
    }
  })

  svg.querySelectorAll('[href], [xlink\\:href]').forEach((el) => {
    const href = el.getAttribute('href')
    const xlinkHref = el.getAttribute('xlink:href')

    if (isExternalReference(href)) {
      el.removeAttribute('href')
    }
    if (isExternalReference(xlinkHref)) {
      el.removeAttribute('xlink:href')
    }
  })

  svg.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style')
    if (!style) return

    const cleaned = style
      .replace(/@import[^;]+;?/gi, '')
      .replace(/url\(\s*(['"]?)(?!#|data:)[^)]+\1\s*\)/gi, 'none')
      .trim()

    if (cleaned) {
      el.setAttribute('style', cleaned)
    } else {
      el.removeAttribute('style')
    }
  })

  svg.querySelectorAll('style').forEach((styleEl) => {
    styleEl.textContent = (styleEl.textContent ?? '')
      .replace(/@import[^;]+;?/gi, '')
      .replace(/url\(\s*(['"]?)(?!#|data:)[^)]+\1\s*\)/gi, 'none')
  })
}

function collectForeignObjectTextLines(foreignObject: SVGForeignObjectElement): string[] {
  const lines: string[] = []
  let currentLine = ''

  const pushLine = () => {
    const text = currentLine.replace(/\s+/g, ' ').trim()
    if (text) {
      lines.push(text)
    }
    currentLine = ''
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      currentLine += node.textContent ?? ''
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    const element = node as Element
    const tagName = element.tagName.toLowerCase()

    if (tagName === 'br') {
      pushLine()
      return
    }

    if (tagName === 'p' || tagName === 'div') {
      pushLine()
      element.childNodes.forEach(walk)
      pushLine()
      return
    }

    element.childNodes.forEach(walk)
  }

  foreignObject.childNodes.forEach(walk)
  pushLine()

  return lines
}

function replaceForeignObjectsWithSvgText(svg: SVGSVGElement): void {
  svg.querySelectorAll('foreignObject').forEach((foreignObject) => {
    const lines = collectForeignObjectTextLines(foreignObject as SVGForeignObjectElement)
    if (lines.length === 0) {
      foreignObject.remove()
      return
    }

    const x = Number.parseFloat(foreignObject.getAttribute('x') ?? '0') || 0
    const y = Number.parseFloat(foreignObject.getAttribute('y') ?? '0') || 0
    const width = parseSvgLength(foreignObject.getAttribute('width')) ?? 0
    const height = parseSvgLength(foreignObject.getAttribute('height')) ?? 0

    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    textEl.setAttribute('x', String(x + width / 2))
    textEl.setAttribute('y', String(y + height / 2))
    textEl.setAttribute('text-anchor', 'middle')
    textEl.setAttribute('dominant-baseline', 'middle')
    textEl.setAttribute('font-family', 'Arial, Helvetica, sans-serif')
    textEl.setAttribute('font-size', '14')
    textEl.setAttribute('fill', 'currentColor')

    const lineHeight = 16
    const startDy = -((lines.length - 1) * lineHeight) / 2
    lines.forEach((line, index) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      tspan.setAttribute('x', String(x + width / 2))
      tspan.setAttribute('dy', index === 0 ? String(startDy) : String(lineHeight))
      tspan.textContent = line
      textEl.appendChild(tspan)
    })

    const labelClass = foreignObject.querySelector('[class]')?.getAttribute('class')
    if (labelClass) {
      textEl.setAttribute('class', labelClass)
    }

    foreignObject.replaceWith(textEl)
  })
}

function makeSvgCanvasSafe(svg: SVGSVGElement): void {
  replaceForeignObjectsWithSvgText(svg)
  stripExternalResourceReferences(svg)
}

function getSvgExportDimensions(svgString: string): { width: number; height: number; normalizedSvg: string } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement as unknown as SVGSVGElement

  if (svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('Invalid SVG content')
  }

  const widthFromAttr = parseSvgLength(svg.getAttribute('width'))
  const heightFromAttr = parseSvgLength(svg.getAttribute('height'))

  let width = widthFromAttr
  let height = heightFromAttr

  const viewBox = svg.getAttribute('viewBox')
  if (viewBox) {
    const values = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((v) => Number.parseFloat(v))
    if (values.length === 4 && values.every(Number.isFinite)) {
      width = width ?? values[2]
      height = height ?? values[3]
    }
  }

  width = width && width > 0 ? width : 1200
  height = height && height > 0 ? height : 800

  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.removeAttribute('style')
  makeSvgCanvasSafe(svg)

  return {
    width,
    height,
    normalizedSvg: new XMLSerializer().serializeToString(svg),
  }
}

export async function exportToPng(
  svgString: string,
  scale: number = 2,
  preferredDimensions?: { width: number; height: number }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { width: parsedWidth, height: parsedHeight, normalizedSvg } = getSvgExportDimensions(svgString)
    const width =
      preferredDimensions && preferredDimensions.width > 0 ? preferredDimensions.width : parsedWidth
    const height =
      preferredDimensions && preferredDimensions.height > 0 ? preferredDimensions.height : parsedHeight
    const img = new Image()
    const svgBlob = new Blob([normalizedSvg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create PNG blob'))
        }
      }, 'image/png')
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG image'))
    }

    img.src = url
  })
}

export function exportToSvg(svgString: string): Blob {
  return new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
}
