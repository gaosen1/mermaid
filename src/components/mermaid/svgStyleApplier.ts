/**
 * SVG 样式应用工具
 *
 * 直接操作 SVG DOM 应用样式，无需重新渲染
 */

import type { EdgeStyle } from '@/utils/edgeDsl'
import type { NodeStyle, SubgraphStyle } from '@/utils/nodeDsl'
import type { SequenceParticipantStyle } from '@/utils/sequenceDsl'
import { stripRenderIdPrefix } from './svgUtils'

export type { NodeStyle, SubgraphStyle }

// Leader 路径的 data 属性标识
const LEADER_PATH_ATTR = 'data-leader-path'

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
 * 查找或创建 leader 路径
 */
function findOrCreateLeaderPath(basePath: SVGPathElement): SVGPathElement | null {
  const parent = basePath.parentElement
  if (!parent) return null

  // 查找已存在的 leader 路径
  let leaderPath = parent.querySelector(`path[${LEADER_PATH_ATTR}]`) as SVGPathElement | null

  if (!leaderPath) {
    // 克隆基础路径创建 leader 层
    leaderPath = basePath.cloneNode(true) as SVGPathElement
    leaderPath.setAttribute(LEADER_PATH_ATTR, 'true')
    leaderPath.classList.remove('flowchart-link', 'path')
    leaderPath.classList.add('leader-path')
    // 插入到基础路径之后（在上层显示）
    basePath.after(leaderPath)
  }

  return leaderPath
}

/**
 * 移除 leader 路径
 */
function removeLeaderPath(basePath: SVGPathElement): void {
  const parent = basePath.parentElement
  if (!parent) return

  const leaderPath = parent.querySelector(`path[${LEADER_PATH_ATTR}]`)
  if (leaderPath) {
    leaderPath.remove()
  }
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
  const isLeaderAnimation = style.animation === 'slow-leader' || style.animation === 'fast-leader'

  if (isLeaderAnimation) {
    // Leader 动画：需要两层路径
    // 基础层使用较慢的速度，leader 层使用更快的速度形成"追赶"效果
    const baseDuration = style.animation === 'fast-leader' ? '2s' : '5s'
    const leaderDuration = style.animation === 'fast-leader' ? '0.8s' : '2s'

    // 基础层：普通虚线行军蚁
    path.style.strokeDasharray = '5 5'
    path.style.strokeWidth = '1px'
    path.style.animation = `mermaid-edge-dash-leader-base ${baseDuration} linear infinite`

    // 创建或更新 leader 层
    const leaderPath = findOrCreateLeaderPath(path)
    if (leaderPath) {
      // Leader 层样式：更长更粗的单个 dash，移动速度更快
      leaderPath.style.stroke = style.color || 'currentColor'
      leaderPath.style.strokeDasharray = '12 48' // 12px dash, 48px gap = 60px 周期
      leaderPath.style.strokeWidth = '3px'
      leaderPath.style.strokeLinecap = 'round'
      leaderPath.style.fill = 'none'
      leaderPath.style.animation = `mermaid-edge-dash-leader-dot ${leaderDuration} linear infinite`
      leaderPath.style.pointerEvents = 'none'
    }
  } else {
    // 非 leader 动画：移除 leader 层
    removeLeaderPath(path)

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
): { group: SVGGElement | null; shape: SVGElement | null; labelSpan: HTMLSpanElement | null } {
  // Mermaid 节点结构: g.node[id="<渲染容器前缀>flowchart-{nodeId}-xxx"]，按剥离后的 id 匹配
  const nodeGroup =
    (Array.from(svg.querySelectorAll('g.node')).find((n) =>
      stripRenderIdPrefix(n.getAttribute('id') ?? '').startsWith(`flowchart-${nodeId}-`)
    ) as SVGGElement | null) ?? null
  if (!nodeGroup) return { group: null, shape: null, labelSpan: null }

  // 形状元素: rect, polygon, circle, ellipse
  const shape = nodeGroup.querySelector('rect, polygon, circle, ellipse')
  // 文字标签元素: span.nodeLabel
  const labelSpan = nodeGroup.querySelector('span.nodeLabel')

  return {
    group: nodeGroup as SVGGElement,
    shape: shape as SVGElement | null,
    labelSpan: labelSpan as HTMLSpanElement | null,
  }
}

/**
 * 将 NodeStyle 应用到 SVG 节点元素
 */
export function applyNodeStyleToElement(
  shape: SVGElement,
  labelSpan: HTMLSpanElement | null,
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

  // 文字颜色 - 应用到 span.nodeLabel 元素
  if (labelSpan) {
    if (style.color) {
      labelSpan.style.setProperty('color', style.color, 'important')
    } else {
      labelSpan.style.removeProperty('color')
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
  const { shape, labelSpan } = findNodeElement(svg, nodeId)
  if (!shape) return false

  applyNodeStyleToElement(shape, labelSpan, style)
  return true
}

// ============ Subgraph 样式应用 ============

/**
 * 查找指定 ID 的 subgraph 元素
 * Mermaid 生成的 subgraph 结构: g.cluster[id="{subgraphId}"]
 */
export function findSubgraphElement(
  svg: SVGSVGElement,
  subgraphId: string
): { group: SVGGElement | null; shape: SVGElement | null; labelSpan: HTMLSpanElement | null } {
  // Mermaid subgraph 结构: g.cluster[id="{containerPrefix}{subgraphId}"]，id 带渲染容器前缀
  const clusterGroup =
    (Array.from(svg.querySelectorAll('g.cluster')).find(
      (c) => (c.getAttribute('id') ?? '').replace(/^mermaid-(?:render|export)-\d+-[a-z0-9]+-/, '') === subgraphId
    ) as SVGGElement | null) ?? null
  if (!clusterGroup) return { group: null, shape: null, labelSpan: null }

  // 形状元素: rect (subgraph 背景)
  const shape = clusterGroup.querySelector('rect')
  // 文字标签元素: .cluster-label span
  const labelSpan = clusterGroup.querySelector('.cluster-label span')

  return {
    group: clusterGroup as SVGGElement,
    shape: shape as SVGElement | null,
    labelSpan: labelSpan as HTMLSpanElement | null,
  }
}

/**
 * 将 SubgraphStyle 应用到 SVG subgraph 元素
 */
export function applySubgraphStyleToElement(
  shape: SVGElement,
  labelSpan: HTMLSpanElement | null,
  style: SubgraphStyle
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

  // 文字颜色 - 应用到 span 元素
  if (labelSpan) {
    if (style.color) {
      labelSpan.style.setProperty('color', style.color, 'important')
    } else {
      labelSpan.style.removeProperty('color')
    }
  }
}

/**
 * 应用 subgraph 样式（主入口）
 */
export function applySubgraphStyle(svg: SVGSVGElement, subgraphId: string, style: SubgraphStyle): boolean {
  const { shape, labelSpan } = findSubgraphElement(svg, subgraphId)
  if (!shape) return false

  applySubgraphStyleToElement(shape, labelSpan, style)
  return true
}

// ============ 时序图样式应用 ============

/**
 * 应用消息线样式：.messageLine0/.messageLine1 按文档序即消息顺序
 */
export function applySequenceMsgStyle(svg: SVGSVGElement, index: number, style: EdgeStyle): boolean {
  const lines = svg.querySelectorAll('.messageLine0, .messageLine1')
  const el = lines[index] as SVGPathElement | null
  if (!el) return false
  applyEdgeStyleToElement(el, style)
  return true
}

/**
 * 应用参与者样式：按显示文本配对 rect.actor 与 text.actor（用坐标属性配对，不依赖布局）
 */
export function applySequenceParticipantStyle(
  svg: SVGSVGElement,
  label: string,
  style: SequenceParticipantStyle
): boolean {
  const texts = Array.from(svg.querySelectorAll('text.actor')) as SVGTextElement[]
  const rects = Array.from(svg.querySelectorAll('rect.actor')) as SVGRectElement[]
  let applied = false

  for (const text of texts) {
    if ((text.textContent || '').trim() !== label) continue
    const tx = Number(text.getAttribute('x') ?? 0)
    const ty = Number(text.getAttribute('y') ?? 0)
    const rect = rects.find((r) => {
      const rx = Number(r.getAttribute('x') ?? 0)
      const ry = Number(r.getAttribute('y') ?? 0)
      const rw = Number(r.getAttribute('width') ?? 0)
      const rh = Number(r.getAttribute('height') ?? 0)
      return tx >= rx && tx <= rx + rw && ty >= ry && ty <= ry + rh
    })
    if (rect) {
      if (style.fill) rect.style.fill = style.fill
      else rect.style.removeProperty('fill')
      if (style.stroke) rect.style.stroke = style.stroke
      else rect.style.removeProperty('stroke')
      if (style.strokeWidth) rect.style.strokeWidth = style.strokeWidth
      if (style.strokeDasharray) rect.style.strokeDasharray = style.strokeDasharray
    }
    if (style.color) text.style.fill = style.color
    else text.style.removeProperty('fill')
    applied = true
  }
  return applied
}
