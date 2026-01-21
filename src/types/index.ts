export interface Project {
  id: string
  name: string
  description?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface Diagram {
  id: string
  projectId: string
  name: string
  source: string
  config?: DiagramConfig
  createdAt: number
  updatedAt: number
}

export interface DiagramConfig {
  layout?: 'elk' | 'dagre'
  theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  [key: string]: unknown
}

export interface Snapshot {
  id: string
  diagramId: string
  source: string
  description?: string
  createdAt: number
  isAuto: boolean
}

export interface UserSettings {
  id: string
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  defaultLayout: 'elk' | 'dagre'
  defaultExportFormat: 'png' | 'svg'
  renderTheme: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  autoSaveInterval: number
}

export interface GraphModel {
  id: string
  name: string
  source: string
  lastModified: number
  metadata?: Record<string, unknown>
}

export interface EditorAPI {
  loadGraph(graph: GraphModel): void
  saveGraph(partial: Pick<GraphModel, 'id' | 'source'>): Promise<void>
}

export interface ParsedDSL {
  source: string
  classes: string[]
  styles: string[]
  animations: AnimationConfig[]
}

export interface AnimationConfig {
  nodeId: string
  animation: string
  params?: Record<string, string>
}

export interface StyleConfig {
  nodeId: string
  fill?: string
  color?: string
  stroke?: string
  strokeWidth?: string
  strokeDasharray?: string
}
