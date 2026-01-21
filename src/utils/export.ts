import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { db } from '@/db'
import { v4 as uuid } from 'uuid'
import type { Project, Diagram, DiagramConfig } from '@/types'

export interface ExportedProject {
  version: string
  project: Project
  diagrams: Diagram[]
}

export async function exportDiagramToMmd(diagram: Diagram): Promise<void> {
  let content = diagram.source

  if (diagram.config) {
    const configLines = ['---', 'config:']
    if (diagram.config.layout) {
      configLines.push(`  layout: ${diagram.config.layout}`)
    }
    if (diagram.config.theme) {
      configLines.push(`  theme: ${diagram.config.theme}`)
    }
    configLines.push('---', '')
    content = configLines.join('\n') + content
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  saveAs(blob, `${diagram.name}.mmd`)
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
    let content = diagram.source
    if (diagram.config) {
      const configLines = ['---', 'config:']
      if (diagram.config.layout) {
        configLines.push(`  layout: ${diagram.config.layout}`)
      }
      if (diagram.config.theme) {
        configLines.push(`  theme: ${diagram.config.theme}`)
      }
      configLines.push('---', '')
      content = configLines.join('\n') + content
    }
    zip.file(`${diagram.name}.mmd`, content)
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

export async function importFromMmd(file: File, projectId: string): Promise<Diagram> {
  const content = await file.text()
  const name = file.name.replace(/\.mmd$/i, '')

  const { config, source } = parseFrontmatterFromContent(content)

  const now = Date.now()
  const diagram: Diagram = {
    id: uuid(),
    projectId,
    name,
    source,
    config: config || undefined,
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
