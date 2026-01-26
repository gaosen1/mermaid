// 同步状态枚举
export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'error' | 'local-only'

// GitHub 配置
export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

// 同步日志条目
export interface SyncLogEntry {
  id?: number
  timestamp: number
  operation: 'push' | 'pull' | 'conflict' | 'error'
  entityType: 'project' | 'diagram' | 'snapshot'
  entityId: string
  status: 'success' | 'failed'
  message?: string
  details?: Record<string, unknown>
}

// 同步队列项
export interface SyncQueueItem {
  id?: number
  entityType: 'project' | 'diagram' | 'snapshot'
  entityId: string
  operation: 'create' | 'update' | 'delete'
  priority: number
  retryCount: number
  maxRetries: number
  createdAt: number
  lastAttempt?: number
  error?: string
}

// 同步设置
export interface SyncSettings {
  autoSync: boolean
  syncInterval: number
  conflictStrategy: 'local' | 'remote' | 'ask'
  repoName: string
}

// 同步统计
export interface SyncStats {
  totalProjects: number
  syncedProjects: number
  totalDiagrams: number
  syncedDiagrams: number
  pendingItems: number
  conflictItems: number
  errorItems: number
  lastSyncTime?: number
}

// GitHub 文件信息
export interface GitHubFileInfo {
  path: string
  sha: string
  content?: string
  size: number
  url: string
}

// 同步操作结果
export interface SyncResult {
  success: boolean
  operation: 'push' | 'pull'
  entityType: string
  entityId: string
  message?: string
  error?: Error
}
