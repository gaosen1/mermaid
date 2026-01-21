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

export async function exportToPng(
  svgString: string,
  scale: number = 2
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)

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
