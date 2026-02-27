import type { SyncStatus } from './sync'

export interface Project {
  id: string
  name: string
  description?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  // 同步相关字段
  syncStatus?: SyncStatus
  lastSyncTime?: number
  remoteChecksum?: string
  localChecksum?: string
  syncError?: string
}

export interface Diagram {
  id: string
  projectId: string
  name: string
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
