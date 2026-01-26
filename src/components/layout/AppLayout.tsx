import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSyncStore } from '@/stores/syncStore'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { SyncStatusIndicator } from '@/components/sync'
import { HomePage } from '@/pages/HomePage'
import { ProjectPage } from '@/pages/ProjectPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { MermaidThemeTestPage } from '@/pages/MermaidThemeTestPage'
import { FolderKanban, Settings, Moon, Sun, Monitor, TestTube } from 'lucide-react'
import type { Project } from '@/types'

type View = 'home' | 'project' | 'settings' | 'theme-test'

export function AppLayout() {
  const { settings, loadSettings, updateSettings } = useSettingsStore()
  const { initialize: initSync } = useSyncStore()
  const [view, setView] = useState<View>('home')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
    initSync()
  }, [loadSettings, initSync])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (settings.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(settings.theme)
    }
  }, [settings.theme])

  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id)
    setView('project')
  }

  const handleBackToHome = () => {
    setSelectedProjectId(null)
    setView('home')
  }

  const cycleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(settings.theme)
    const nextIndex = (currentIndex + 1) % themes.length
    updateSettings({ theme: themes[nextIndex] })
  }

  const getThemeIcon = () => {
    switch (settings.theme) {
      case 'light':
        return <Sun className="h-4 w-4" />
      case 'dark':
        return <Moon className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-14 border-r flex flex-col items-center py-4 gap-2">
        <Button
          variant={view === 'home' || view === 'project' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={handleBackToHome}
          title="项目"
        >
          <FolderKanban className="h-5 w-5" />
        </Button>
        <Button
          variant={view === 'settings' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setView('settings')}
          title="设置"
        >
          <Settings className="h-5 w-5" />
        </Button>
        <Button
          variant={view === 'theme-test' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => setView('theme-test')}
          title="主题测试"
        >
          <TestTube className="h-5 w-5" />
        </Button>
        <div className="flex-1" />
        <Separator className="w-8" />
        <SyncStatusIndicator />
        <Button variant="ghost" size="icon" onClick={cycleTheme} title="切换主题">
          {getThemeIcon()}
        </Button>
      </aside>

      <main className="flex-1 overflow-hidden">
        {view === 'home' && <HomePage onSelectProject={handleSelectProject} />}
        {view === 'project' && selectedProjectId && (
          <ProjectPage projectId={selectedProjectId} onBack={handleBackToHome} />
        )}
        {view === 'settings' && <SettingsPage />}
        {view === 'theme-test' && <MermaidThemeTestPage />}
      </main>

      <Toaster />
    </div>
  )
}
