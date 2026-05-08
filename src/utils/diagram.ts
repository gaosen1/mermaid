import type { Diagram, DiagramType } from '@/types'

export function getDiagramFileExtension(type: DiagramType | undefined): 'mmd' | 'html' | 'svg' | 'png' {
  if (type === 'html') return 'html'
  if (type === 'svg') return 'svg'
  if (type === 'png') return 'png'
  return 'mmd'
}

export function getDiagramTypeLabel(type: DiagramType | undefined): string {
  if (type === 'png') return 'PNG'
  if (type === 'svg') return 'SVG'
  return type === 'html' ? 'HTML' : 'Mermaid'
}

export function getDiagramAcceptTypes(): string {
  return '.mmd,.html,.svg,.png'
}

export function getDiagramFilename(diagram: Diagram): string {
  return `${diagram.name}.${getDiagramFileExtension(diagram.type)}`
}

export function getDiagramTypeFromFilename(filename: string): DiagramType | null {
  if (/\.png$/i.test(filename)) return 'png'
  if (/\.svg$/i.test(filename)) return 'svg'
  if (/\.html?$/i.test(filename)) return 'html'
  if (/\.mmd$/i.test(filename)) return 'mermaid'
  return null
}
