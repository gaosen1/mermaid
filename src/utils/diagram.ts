import type { Diagram, DiagramType } from '@/types'
import { isImageType } from '@/utils/png'

export function getDiagramFileExtension(type: DiagramType | undefined): string {
  if (type === 'html') return 'html'
  if (type === 'svg') return 'svg'
  if (type === 'jpg') return 'jpg'
  if (type === 'webp') return 'webp'
  if (type === 'png') return 'png'
  if (type === 'markdown') return 'md'
  if (type === 'txt') return 'txt'
  return 'mmd'
}

export function getDiagramTypeLabel(type: DiagramType | undefined): string {
  if (type === 'png') return 'PNG'
  if (type === 'jpg') return 'JPG'
  if (type === 'webp') return 'WebP'
  if (type === 'svg') return 'SVG'
  if (type === 'html') return 'HTML'
  if (type === 'markdown') return 'Markdown'
  if (type === 'txt') return 'TXT'
  return 'Mermaid'
}

export function getDiagramAcceptTypes(): string {
  return '.mmd,.html,.svg,.png,.jpg,.jpeg,.webp,.md,.txt'
}

export function getDiagramFilename(diagram: Diagram): string {
  return `${diagram.name}.${getDiagramFileExtension(diagram.type)}`
}

export function getDiagramTypeFromFilename(filename: string): DiagramType | null {
  if (/\.png$/i.test(filename)) return 'png'
  if (/\.jpe?g$/i.test(filename)) return 'jpg'
  if (/\.webp$/i.test(filename)) return 'webp'
  if (/\.svg$/i.test(filename)) return 'svg'
  if (/\.html?$/i.test(filename)) return 'html'
  if (/\.md$/i.test(filename)) return 'markdown'
  if (/\.txt$/i.test(filename)) return 'txt'
  if (/\.mmd$/i.test(filename)) return 'mermaid'
  return null
}

export { isImageType }
