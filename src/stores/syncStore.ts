import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { db } from '@/db'
import { validateToken, initializeRepo, clearGitHubClient } from '@/services/github'
import { getStoredToken, storeToken, clearToken } from '@/utils/tokenStorage'
import { pull, push, sync, startAutoSync, stopAutoSync, type SyncResult } from '@/services/sync'
import type { SyncSettings, SyncStats, SyncProgress, SyncDirection } from '@/types/sync'

interface SyncState {
  // 认证状态
  isAuthenticated: boolean
  isConnecting: boolean
  userName: string | null
  userLogin: string | null

  // 同步状态
  isSyncing: boolean
  syncProgress: SyncProgress | null
  lastSyncTime: number | null
  syncError: string | null

  // 统计信息
  stats: SyncStats

  // 设置
  settings: SyncSettings

  // 操作方法
  initialize: () => Promise<void>
  connect: (token: string) => Promise<void>
  disconnect: () => Promise<void>
  runSync: (direction: SyncDirection) => Promise<SyncResult>
  syncNow: () => Promise<SyncResult>
  pullNow: () => Promise<SyncResult>
  pushNow: () => Promise<SyncResult>
  updateSettings: (settings: Partial<SyncSettings>) => void
  refreshStats: () => Promise<void>
  clearError: () => void
}

const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  autoSync: false,
  syncInterval: 5 * 60 * 1000, // 5 分钟
  mergeStrategy: 'manual',
  repoName: 'mermaid-diagrams-backup',
}

// 旧版 conflictStrategy -> 新版 mergeStrategy 映射
const LEGACY_STRATEGY_MAP: Record<string, SyncSettings['mergeStrategy']> = {
  local: 'ours',
  remote: 'theirs',
  ask: 'manual',
}

// 从 localStorage 加载设置（含旧配置迁移）
function loadSyncSettings(): SyncSettings {
  try {
    const stored = localStorage.getItem('sync_settings')
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SyncSettings> & { conflictStrategy?: string }
      // 迁移旧字段
      if (!parsed.mergeStrategy && parsed.conflictStrategy) {
        parsed.mergeStrategy = LEGACY_STRATEGY_MAP[parsed.conflictStrategy] ?? 'manual'
      }
      delete parsed.conflictStrategy
      return { ...DEFAULT_SYNC_SETTINGS, ...parsed }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SYNC_SETTINGS
}

export const useSyncStore = create<SyncState>()(
  subscribeWithSelector((set, get) => ({
    // 初始状态
    isAuthenticated: false,
    isConnecting: false,
    userName: null,
    userLogin: null,
    isSyncing: false,
    syncProgress: null,
    lastSyncTime: null,
    syncError: null,
    stats: {
      totalProjects: 0,
      syncedProjects: 0,
      totalDiagrams: 0,
      syncedDiagrams: 0,
      pendingItems: 0,
      conflictItems: 0,
      errorItems: 0,
    },
    settings: loadSyncSettings(),

    /**
     * 初始化：检查是否有存储的 token
     */
    initialize: async () => {
      const token = await getStoredToken()
      if (token) {
        try {
          await get().connect(token)
        } catch (error) {
          console.warn('Failed to restore GitHub connection:', error)
          await clearToken()
        }
      }
      await get().refreshStats()
    },

    /**
     * 连接 GitHub
     */
    connect: async (token: string) => {
      set({ isConnecting: true, syncError: null })

      try {
        // 验证 token
        const user = await validateToken(token)

        // 初始化仓库
        await initializeRepo(user.login, get().settings.repoName, token)

        // 存储 token
        await storeToken(token)

        set({
          isAuthenticated: true,
          isConnecting: false,
          userName: user.name,
          userLogin: user.login,
        })

        // 刷新统计
        await get().refreshStats()

        // 如果启用了自动同步，启动自动同步
        const { settings } = get()
        if (settings.autoSync) {
          startAutoSync(settings)
        }
      } catch (error) {
        set({
          isConnecting: false,
          syncError: (error as Error).message || 'Failed to connect to GitHub',
        })
        throw error
      }
    },

    /**
     * 断开连接
     */
    disconnect: async () => {
      stopAutoSync()
      clearGitHubClient()
      await clearToken()

      set({
        isAuthenticated: false,
        userName: null,
        userLogin: null,
        lastSyncTime: null,
        syncError: null,
      })
    },

    /**
     * 执行一次同步操作（pull / push / sync 通用）
     */
    runSync: async (direction: SyncDirection): Promise<SyncResult> => {
      const { isAuthenticated, isSyncing, settings } = get()

      if (!isAuthenticated) {
        return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: ['Not authenticated'] }
      }
      if (isSyncing) {
        return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: ['Sync already in progress'] }
      }

      set({ isSyncing: true, syncError: null, syncProgress: null })

      const onProgress = (progress: SyncProgress) => set({ syncProgress: progress })
      const op = direction === 'pull' ? pull : direction === 'push' ? push : sync

      try {
        const result = await op(settings, onProgress)

        set({
          isSyncing: false,
          syncProgress: null,
          lastSyncTime: Date.now(),
          syncError: result.success ? null : result.errors.join(', '),
        })

        await get().refreshStats()
        return result
      } catch (error) {
        const errorMessage = (error as Error).message || 'Sync failed'
        set({ isSyncing: false, syncProgress: null, syncError: errorMessage })
        return { success: false, pushed: 0, pulled: 0, conflicts: 0, errors: [errorMessage] }
      }
    },

    /**
     * 立即同步（先拉后推）
     */
    syncNow: () => get().runSync('sync'),

    /**
     * 仅拉取云端
     */
    pullNow: () => get().runSync('pull'),

    /**
     * 仅推送本地
     */
    pushNow: () => get().runSync('push'),

    /**
     * 更新设置
     */
    updateSettings: (updates: Partial<SyncSettings>) => {
      const oldSettings = get().settings
      const newSettings = { ...oldSettings, ...updates }

      set({ settings: newSettings })

      // 持久化设置到 localStorage
      localStorage.setItem('sync_settings', JSON.stringify(newSettings))

      // 处理自动同步设置变更
      if (updates.autoSync !== undefined || updates.syncInterval !== undefined) {
        if (newSettings.autoSync && get().isAuthenticated) {
          startAutoSync(newSettings)
        } else {
          stopAutoSync()
        }
      }
    },

    /**
     * 刷新统计信息
     */
    refreshStats: async () => {
      const [projects, diagrams, pendingQueue] = await Promise.all([
        db.projects.toArray(),
        db.diagrams.toArray(),
        db.syncQueue.where('priority').above(0).count(),
      ])

      const syncedProjects = projects.filter((p) => p.syncStatus === 'synced').length
      const syncedDiagrams = diagrams.filter((d) => d.syncStatus === 'synced').length
      const conflictItems =
        projects.filter((p) => p.syncStatus === 'conflict').length +
        diagrams.filter((d) => d.syncStatus === 'conflict').length
      const errorItems =
        projects.filter((p) => p.syncStatus === 'error').length +
        diagrams.filter((d) => d.syncStatus === 'error').length

      set({
        stats: {
          totalProjects: projects.length,
          syncedProjects,
          totalDiagrams: diagrams.length,
          syncedDiagrams,
          pendingItems: pendingQueue,
          conflictItems,
          errorItems,
        },
      })
    },

    /**
     * 清除错误
     */
    clearError: () => {
      set({ syncError: null })
    },
  }))
)
