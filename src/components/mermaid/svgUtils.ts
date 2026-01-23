/**
 * SVG 处理工具函数
 */

import { EDGE_CONFIG } from './constants'

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
  const path = edgePath.querySelector('path')
  if (path) {
    path.style.pointerEvents = 'stroke'
    path.style.cursor = 'pointer'
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
