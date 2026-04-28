import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { db } from '@/db'
import { v4 as uuid } from 'uuid'
import type { Project, Diagram, DiagramConfig } from '@/types'
import { getDiagramFileExtension, getDiagramTypeFromFilename } from '@/utils/diagram'

export interface ExportedProject {
  version: string
  project: Project
  diagrams: Diagram[]
}

export async function exportDiagram(diagram: Diagram): Promise<void> {
  const content = serializeDiagramSource(diagram)
  const extension = getDiagramFileExtension(diagram.type)
  const mimeType = diagram.type === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8'
  const blob = new Blob([content], { type: mimeType })
  saveAs(blob, `${diagram.name}.${extension}`)
}

export async function exportProjectToZip(project: Project): Promise<void> {
  const diagrams = await db.diagrams.where('projectId').equals(project.id).toArray()

  const zip = new JSZip()

  const metadata: ExportedProject = {
    version: '1.0',
    project,
    diagrams,
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  for (const diagram of diagrams) {
    const extension = getDiagramFileExtension(diagram.type)
    zip.file(`${diagram.name}.${extension}`, serializeDiagramSource(diagram))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${project.name}.zip`)
}

export async function exportProjectToJson(project: Project): Promise<void> {
  const diagrams = await db.diagrams.where('projectId').equals(project.id).toArray()

  const data: ExportedProject = {
    version: '1.0',
    project,
    diagrams,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  saveAs(blob, `${project.name}.json`)
}

export async function importDiagram(file: File, projectId: string): Promise<Diagram> {
  const content = await file.text()
  const type = getDiagramTypeFromFilename(file.name)

  if (!type) {
    throw new Error('Unsupported diagram file type')
  }

  const name = file.name.replace(/\.(mmd|html?)$/i, '')

  const { config, source } =
    type === 'mermaid'
      ? parseFrontmatterFromContent(content)
      : { config: null, source: content }

  const now = Date.now()
  const diagram: Diagram = {
    id: uuid(),
    projectId,
    name,
    type,
    source,
    config: type === 'mermaid' ? config || undefined : undefined,
    createdAt: now,
    updatedAt: now,
  }

  await db.diagrams.add(diagram)
  return diagram
}

export async function importFromZip(file: File): Promise<Project> {
  const zip = await JSZip.loadAsync(file)
  const metadataFile = zip.file('metadata.json')

  if (!metadataFile) {
    throw new Error('Invalid project archive: metadata.json not found')
  }

  const metadataContent = await metadataFile.async('string')
  const metadata: ExportedProject = JSON.parse(metadataContent)

  const now = Date.now()
  const newProjectId = uuid()

  const project: Project = {
    ...metadata.project,
    id: newProjectId,
    createdAt: now,
    updatedAt: now,
  }

  const diagrams: Diagram[] = metadata.diagrams.map((d) => ({
    ...d,
    id: uuid(),
    projectId: newProjectId,
    type: d.type || 'mermaid',
    createdAt: now,
    updatedAt: now,
  }))

  await db.transaction('rw', [db.projects, db.diagrams], async () => {
    await db.projects.add(project)
    await db.diagrams.bulkAdd(diagrams)
  })

  return project
}

export async function importFromJson(file: File): Promise<Project> {
  const content = await file.text()
  const data: ExportedProject = JSON.parse(content)

  const now = Date.now()
  const newProjectId = uuid()

  const project: Project = {
    ...data.project,
    id: newProjectId,
    createdAt: now,
    updatedAt: now,
  }

  const diagrams: Diagram[] = data.diagrams.map((d) => ({
    ...d,
    id: uuid(),
    projectId: newProjectId,
    type: d.type || 'mermaid',
    createdAt: now,
    updatedAt: now,
  }))

  await db.transaction('rw', [db.projects, db.diagrams], async () => {
    await db.projects.add(project)
    await db.diagrams.bulkAdd(diagrams)
  })

  return project
}

function parseFrontmatterFromContent(content: string): { config: DiagramConfig | null; source: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { config: null, source: content }
  }

  try {
    const yaml = match[1]
    const config: DiagramConfig = {}

    const layoutMatch = yaml.match(/layout:\s*(\w+)/)
    if (layoutMatch) {
      const layout = layoutMatch[1]
      if (layout === 'elk' || layout === 'dagre') {
        config.layout = layout
      }
    }

    const themeMatch = yaml.match(/theme:\s*(\w+)/)
    if (themeMatch) {
      const theme = themeMatch[1]
      if (['default', 'dark', 'forest', 'neutral', 'base'].includes(theme)) {
        config.theme = theme as DiagramConfig['theme']
      }
    }

    return { config, source: content.slice(match[0].length) }
  } catch {
    return { config: null, source: content }
  }
}

function serializeDiagramSource(diagram: Diagram): string {
  if (diagram.type === 'html') {
    return diagram.source
  }

  return serializeMermaidSource(diagram.source, diagram.config)
}

function serializeMermaidSource(source: string, config?: DiagramConfig): string {
  if (!config) {
    return source
  }

  const configLines = ['---', 'config:']
  if (config.layout) {
    configLines.push(`  layout: ${config.layout}`)
  }
  if (config.theme) {
    configLines.push(`  theme: ${config.theme}`)
  }
  configLines.push('---', '')
  return configLines.join('\n') + source
}
