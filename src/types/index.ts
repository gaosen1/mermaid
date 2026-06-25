import type { SyncStatus } from './sync'

export type DiagramType = 'mermaid' | 'html' | 'svg' | 'png' | 'jpg' | 'webp' | 'markdown' | 'txt'

export interface Project {
  id: string
  name: string
  description?: string
  tags: string[]
  order?: number
  createdAt: number
  updatedAt: number
  // 同步相关字段
  syncStatus?: SyncStatus
  lastSyncTime?: number
  remoteChecksum?: string
  localChecksum?: string
  syncError?: string
}

export interface DiagramFolder {
  id: string
  projectId: string
  parentId?: string | null
  name: string
  order?: number
  createdAt: number
  updatedAt: number
}

export interface Diagram {
  id: string
  projectId: string
  folderId?: string | null
  name: string
  type: DiagramType
  source: string
  config?: DiagramConfig
  order?: number
  createdAt: number
  updatedAt: number
  // 同步相关字段
  syncStatus?: SyncStatus
  lastSyncTime?: number
  remoteChecksum?: string
  localChecksum?: string
  syncError?: string
}

export type LayoutType = 'elk' | 'dagre' | 'hierarchical'

export interface DiagramConfig {
  layout?: LayoutType
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
  // 同步相关字段
  syncStatus?: SyncStatus
  lastSyncTime?: number
  syncError?: string
}

export interface UserSettings {
  id: string
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  defaultLayout: LayoutType
  defaultExportFormat: 'png' | 'svg'
  renderTheme: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  autoSaveInterval: number
}

export interface GraphModel {
  id: string
  name: string
  source: string
  lastModified: number
  type?: DiagramType
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
