/**
 * SVG 样式应用工具
 *
 * 直接操作 SVG DOM 应用样式，无需重新渲染
 */

import type { EdgeStyle } from '@/utils/edgeDsl'
import type { NodeStyle } from '@/utils/nodeDsl'

export type { NodeStyle }

/**
 * 查找指定索引的边缘元素
 */
export function findEdgeElement(svg: SVGSVGElement, index: number): SVGPathElement | null {
  // ELK 布局: g.edge-wrapper[data-edge-index] > path.flowchart-link
  const elkEdge = svg.querySelector(
    `g.edge-wrapper[data-edge-index="${index}"] path.flowchart-link`
  )
  if (elkEdge) return elkEdge as SVGPathElement

  // 旧版结构: g.edgePath (按顺序索引)
  const edgePaths = svg.querySelectorAll('g.edgePath path.path')
  return (edgePaths[index] as SVGPathElement) || null
}

/**
 * 将 EdgeStyle 应用到 SVG path 元素
 */
export function applyEdgeStyleToElement(path: SVGPathElement, style: EdgeStyle): void {
  // 颜色
  if (style.color) {
    path.style.stroke = style.color
  } else {
    path.style.removeProperty('stroke')
  }

  // 线条类型
  switch (style.stroke) {
    case 'dotted':
      path.style.strokeDasharray = '5 5'
      path.style.strokeWidth = '1px'
      break
    case 'thick':
      path.style.strokeDasharray = ''
      path.style.strokeWidth = '2px'
      break
    case 'normal':
    default:
      path.style.strokeDasharray = ''
      path.style.strokeWidth = '1px'
      break
  }

  // 动画
  switch (style.animation) {
    case 'slow':
      path.style.animation = 'mermaid-edge-dash 1.5s linear infinite'
      break
    case 'fast':
      path.style.animation = 'mermaid-edge-dash 0.6s linear infinite'
      break
    case 'none':
    default:
      path.style.removeProperty('animation')
  }
}

/**
 * 应用边缘样式（主入口）
 */
export function applyEdgeStyle(svg: SVGSVGElement, index: number, style: EdgeStyle): boolean {
  const path = findEdgeElement(svg, index)
  if (!path) return false

  applyEdgeStyleToElement(path, style)
  return true
}

/**
 * 查找指定 ID 的节点元素
 */
export function findNodeElement(
  svg: SVGSVGElement,
  nodeId: string
): { group: SVGGElement | null; shape: SVGElement | null; text: SVGElement | null } {
  // Mermaid 节点结构: g.node[id="flowchart-{nodeId}-xxx"]
  const nodeGroup = svg.querySelector(`g.node[id^="flowchart-${nodeId}-"]`)
  if (!nodeGroup) return { group: null, shape: null, text: null }

  // 形状元素: rect, polygon, circle, ellipse
  const shape = nodeGroup.querySelector('rect, polygon, circle, ellipse')
  // 文字元素
  const text = nodeGroup.querySelector('g.label text, text')

  return {
    group: nodeGroup as SVGGElement,
    shape: shape as SVGElement | null,
    text: text as SVGElement | null,
  }
}

/**
 * 将 NodeStyle 应用到 SVG 节点元素
 */
export function applyNodeStyleToElement(
  shape: SVGElement,
  text: SVGElement | null,
  style: NodeStyle
): void {
  // 背景色
  if (style.fill) {
    shape.style.fill = style.fill
  } else {
    shape.style.removeProperty('fill')
  }

  // 边框颜色
  if (style.stroke) {
    shape.style.stroke = style.stroke
  } else {
    shape.style.removeProperty('stroke')
  }

  // 边框样式
  switch (style.strokeType) {
    case 'dotted':
      shape.style.strokeDasharray = '5 5'
      shape.style.strokeWidth = '1px'
      break
    case 'thick':
      shape.style.strokeDasharray = ''
      shape.style.strokeWidth = '3px'
      break
    case 'normal':
    default:
      shape.style.strokeDasharray = ''
      shape.style.strokeWidth = '1px'
      break
  }

  // 文字颜色
  if (text) {
    if (style.color) {
      text.style.fill = style.color
    } else {
      text.style.removeProperty('fill')
    }
  }

  // 动画
  switch (style.animation) {
    case 'pulse':
      shape.style.animation = 'mermaid-node-pulse 2s ease-in-out infinite'
      break
    case 'blink':
      shape.style.animation = 'mermaid-node-blink 1s step-start infinite'
      break
    case 'none':
    default:
      shape.style.removeProperty('animation')
  }
}

/**
 * 应用节点样式（主入口）
 */
export function applyNodeStyle(svg: SVGSVGElement, nodeId: string, style: NodeStyle): boolean {
  const { shape, text } = findNodeElement(svg, nodeId)
  if (!shape) return false

  applyNodeStyleToElement(shape, text, style)
  return true
}
