import type { Diagram, DiagramType } from '@/types'

export function getDiagramFileExtension(type: DiagramType | undefined): 'mmd' | 'html' {
  return type === 'html' ? 'html' : 'mmd'
}

export function getDiagramTypeLabel(type: DiagramType | undefined): string {
  return type === 'html' ? 'HTML' : 'Mermaid'
}

export function getDiagramAcceptTypes(): string {
  return '.mmd,.html'
}

export function getDiagramFilename(diagram: Diagram): string {
  return `${diagram.name}.${getDiagramFileExtension(diagram.type)}`
}

export function getDiagramTypeFromFilename(filename: string): DiagramType | null {
  if (/\.html?$/i.test(filename)) return 'html'
  if (/\.mmd$/i.test(filename)) return 'mermaid'
  return null
}
