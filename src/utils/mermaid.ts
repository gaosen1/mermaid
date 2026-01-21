import mermaid from 'mermaid'
import elkLayouts from '@mermaid-js/layout-elk'

let initialized = false

export async function initMermaid(
  layout: 'elk' | 'dagre' = 'elk',
  theme: string = 'base'
): Promise<void> {
  if (!initialized) {
    mermaid.registerLayoutLoaders(elkLayouts)
    initialized = true
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: theme as 'default' | 'dark' | 'forest' | 'neutral' | 'base',
    flowchart: {
      curve: 'basis',
      defaultRenderer: layout === 'elk' ? 'elk' : undefined,
    },
    elk: {
      mergeEdges: true,
      nodePlacementStrategy: 'NETWORK_SIMPLEX',
    },
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
