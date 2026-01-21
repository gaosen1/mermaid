import { create } from 'zustand'
import { db, initSettings, DEFAULT_SETTINGS } from '@/db'
import type { UserSettings } from '@/types'

interface SettingsState {
  settings: UserSettings
  loading: boolean

  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<Omit<UserSettings, 'id'>>) => Promise<void>
  resetSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loading: true,

  loadSettings: async () => {
    set({ loading: true })
    const settings = await initSettings()
    set({ settings, loading: false })
  },

  updateSettings: async (updates) => {
    await db.settings.update('default', updates)
    set((state) => ({
      settings: { ...state.settings, ...updates },
    }))
  },

  resetSettings: async () => {
    await db.settings.put(DEFAULT_SETTINGS)
    set({ settings: DEFAULT_SETTINGS })
  },
}))
