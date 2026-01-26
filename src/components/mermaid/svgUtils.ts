/**
 * SVG 处理工具函数
 */

import { EDGE_CONFIG } from './constants'

// 节点类型
export type NodeType = 'node' | 'subgraph'

/**
 * 清理 Mermaid 渲染产生的错误 DOM 元素
 */
export function cleanupMermaidErrors(): void {
  const errorDivs = document.querySelectorAll('div[id^="dmermaid-"], div[id^="mermaid-"]')
  errorDivs.forEach((div) => {
    if (div.parentElement === document.body) {
      div.remove()
    }
  })
}

/**
 * 为 flowchart-link 路径创建点击热区包装器
 */
function wrapFlowchartLink(path: Element, index: number): void {
  path.setAttribute('data-edge-index', index.toString())

  const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  wrapper.setAttribute('class', 'edge-wrapper')
  wrapper.setAttribute('data-edge-index', index.toString())

  // 创建透明热区用于点击
  const hitArea = path.cloneNode(false) as SVGPathElement
  hitArea.setAttribute('class', 'edge-hitarea')
  Object.assign(hitArea.style, {
    stroke: 'transparent',
    strokeWidth: EDGE_CONFIG.HIT_AREA_WIDTH,
    fill: 'none',
    pointerEvents: 'stroke',
    cursor: 'pointer',
    animation: 'none',
    strokeDasharray: 'none',
    strokeDashoffset: '0',
  })

  // 清除箭头和动画属性
  hitArea.removeAttribute('marker-end')
  hitArea.removeAttribute('marker-start')
  hitArea.removeAttribute('data-animation')
  hitArea.removeAttribute('data-stroke')

  // 原线条禁用点击
  ;(path as SVGPathElement).style.pointerEvents = 'none'

  // 添加悬浮事件
  const realPath = path as SVGPathElement
  hitArea.addEventListener('mouseenter', () => {
    if (!realPath.classList.contains('edge-selected')) {
      realPath.classList.add('edge-hover')
    }
  })
  hitArea.addEventListener('mouseleave', () => {
    realPath.classList.remove('edge-hover')
  })

  // 替换结构
  const parent = path.parentElement
  if (parent) {
    parent.insertBefore(wrapper, path)
    wrapper.appendChild(hitArea)
    wrapper.appendChild(path)
  }
}

/**
 * 处理 edgePath 元素的点击事件
 */
function setupEdgePath(edgePath: Element): void {
  const path = edgePath.querySelector('path') as SVGPathElement | null
  if (path) {
    path.style.pointerEvents = 'stroke'
    path.style.cursor = 'pointer'

    // 添加悬浮事件
    path.addEventListener('mouseenter', () => {
      if (!path.classList.contains('edge-selected')) {
        path.classList.add('edge-hover')
      }
    })
    path.addEventListener('mouseleave', () => {
      path.classList.remove('edge-hover')
    })
  }
  ;(edgePath as SVGGElement).style.pointerEvents = 'auto'
  ;(edgePath as SVGGElement).style.cursor = 'pointer'
}

/**
 * 设置 SVG 元素的边缘点击支持
 */
export function setupSvgEdgeInteraction(svg: SVGSVGElement): void {
  svg.style.pointerEvents = 'auto'

  // ELK 布局: path.flowchart-link
  const flowchartLinks = svg.querySelectorAll('path.flowchart-link')
  flowchartLinks.forEach((path, i) => wrapFlowchartLink(path, i))

  // 旧版结构: g.edgePath > path
  const edgePaths = svg.querySelectorAll('.edgePath')
  edgePaths.forEach((ep) => setupEdgePath(ep))
}

/**
 * 设置 SVG 元素的节点点击支持
 */
export function setupSvgNodeInteraction(svg: SVGSVGElement): void {
  // 为所有 g.node 设置交互样式
  const nodes = svg.querySelectorAll('g.node')
  nodes.forEach((node) => {
    const nodeEl = node as SVGGElement
    nodeEl.style.cursor = 'pointer'
    nodeEl.style.pointerEvents = 'auto'

    // 确保形状元素可点击
    const shapes = node.querySelectorAll('rect, polygon, circle, ellipse, path')
    shapes.forEach((shape) => {
      ;(shape as SVGElement).style.pointerEvents = 'auto'
    })

    // 添加悬浮事件
    nodeEl.addEventListener('mouseenter', () => {
      if (!nodeEl.classList.contains('node-selected')) {
        nodeEl.classList.add('node-hover')
      }
    })
    nodeEl.addEventListener('mouseleave', () => {
      nodeEl.classList.remove('node-hover')
    })
  })
}

/**
 * 从 SVG 元素提取节点 ID
 * Mermaid 生成的节点 ID 格式: flowchart-{nodeId}-{index}
 */
export function getNodeIdFromElement(element: Element): string | null {
  // 向上查找 g.node 元素
  const nodeGroup = element.closest('g.node')
  if (!nodeGroup) return null

  const id = nodeGroup.getAttribute('id')
  if (!id) return null

  // 匹配 flowchart-{nodeId}-{index} 格式
  const match = id.match(/^flowchart-(.+?)-\d+$/)
  return match ? match[1] : null
}

/**
 * 从 SVG 元素提取 subgraph ID
 * Mermaid 生成的 subgraph ID 格式: subGraph{index} 或直接使用 subgraph 名称
 */
export function getSubgraphIdFromElement(element: Element): string | null {
  // 向上查找 g.cluster 元素
  const clusterGroup = element.closest('g.cluster')
  if (!clusterGroup) return null

  const id = clusterGroup.getAttribute('id')
  if (!id) return null

  return id
}

/**
 * 设置 SVG 元素的 subgraph 点击支持
 */
export function setupSvgSubgraphInteraction(svg: SVGSVGElement): void {
  // 为所有 g.cluster 设置交互样式
  const clusters = svg.querySelectorAll('g.cluster')
  clusters.forEach((cluster) => {
    const clusterEl = cluster as SVGGElement
    // 让整个 subgraph 区域可点击
    clusterEl.style.cursor = 'pointer'
    // 为背景 rect 设置 pointer-events，使整个区域可点击
    const rect = clusterEl.querySelector(':scope > rect') as SVGRectElement | null
    if (rect) {
      rect.style.pointerEvents = 'auto'
    }

    // 添加悬浮事件
    clusterEl.addEventListener('mouseenter', (e) => {
      // 避免子元素触发父元素的悬浮（只在直接进入时触发）
      const relatedTarget = e.relatedTarget as Element | null
      if (relatedTarget && clusterEl.contains(relatedTarget)) return

      if (!clusterEl.classList.contains('subgraph-selected')) {
        clusterEl.classList.add('subgraph-hover')
      }
    })
    clusterEl.addEventListener('mouseleave', (e) => {
      // 避免进入子元素时移除悬浮（只在真正离开时移除）
      const relatedTarget = e.relatedTarget as Element | null
      if (relatedTarget && clusterEl.contains(relatedTarget)) return

      clusterEl.classList.remove('subgraph-hover')
    })
  })
}

/**
 * 获取节点的屏幕坐标边界
 */
export function getNodeBounds(nodeGroup: SVGGElement, containerRect: DOMRect): {
  x: number
  y: number
  width: number
  height: number
} {
  const bbox = nodeGroup.getBBox()
  const svg = nodeGroup.ownerSVGElement
  if (!svg) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  // 获取 SVG 的 CTM (Current Transform Matrix)
  const ctm = nodeGroup.getCTM()
  if (!ctm) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  // 创建 SVG 点并转换
  const point = svg.createSVGPoint()

  // 左上角
  point.x = bbox.x
  point.y = bbox.y
  const topLeft = point.matrixTransform(ctm)

  // 右下角
  point.x = bbox.x + bbox.width
  point.y = bbox.y + bbox.height
  const bottomRight = point.matrixTransform(ctm)

  return {
    x: topLeft.x + containerRect.left,
    y: topLeft.y + containerRect.top,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
}
