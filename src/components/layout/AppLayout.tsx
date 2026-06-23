import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { useSyncNotifications } from '@/hooks/useSyncNotifications'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'
import { SyncStatusIndicator, ConflictDialog } from '@/components/sync'
import { HomePage } from '@/pages/HomePage'
import { ProjectPage } from '@/pages/ProjectPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { FolderKanban, Settings, Moon, Sun, Monitor } from 'lucide-react'
import type { Project } from '@/types'

type View = 'home' | 'project' | 'settings'

interface HashRouteState {
  view: View
  projectId: string | null
  diagramId: string | null
}

function parsePathRoute(pathname: string): HashRouteState {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  const segments = path.split('/').filter(Boolean)

  if (segments[0] === 'project' && segments[1]) {
    return {
      view: 'project',
      projectId: decodeURIComponent(segments[1]),
      diagramId:
        segments[2] === 'diagram' && segments[3]
          ? decodeURIComponent(segments[3])
          : null,
    }
  }

  if (segments[0] === 'settings') {
    return { view: 'settings', projectId: null, diagramId: null }
  }

  return { view: 'home', projectId: null, diagramId: null }
}

function buildPathRoute(view: View, projectId: string | null, diagramId: string | null): string {
  if (view === 'project' && projectId) {
    const encodedProjectId = encodeURIComponent(projectId)
    if (diagramId) {
      return `/project/${encodedProjectId}/diagram/${encodeURIComponent(diagramId)}`
    }
    return `/project/${encodedProjectId}`
  }

  if (view === 'settings') return '/settings'
  return '/home'
}

export function AppLayout() {
  const { settings, loadSettings, updateSettings } = useSettingsStore()
  const { loadProjects } = useProjectStore()
  const { initialize: initSync, stats, settings: syncSettings } = useSyncStore()
  const [routeState, setRouteState] = useState<HashRouteState>(() => parsePathRoute(window.location.pathname))
  const { view, projectId: selectedProjectId, diagramId: selectedDiagramId } = routeState
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)

  // 启用同步通知
  useSyncNotifications()

  useEffect(() => {
    // 兼容旧 hash 链接：#/project/:id -> /project/:id
    if (
      window.location.hash.startsWith('#/') &&
      (window.location.pathname === '/' || window.location.pathname === '/index.html')
    ) {
      const nextPath = window.location.hash.slice(1)
      window.history.replaceState(null, '', nextPath)
      setRouteState(parsePathRoute(nextPath))
    }

    loadSettings()
    loadProjects()
    initSync()
  }, [initSync, loadProjects, loadSettings])

  // 当有冲突且策略为 ask 时，自动打开冲突对话框
  useEffect(() => {
    if (stats.conflictItems > 0 && syncSettings.conflictStrategy === 'ask') {
      setConflictDialogOpen(true)
    }
  }, [stats.conflictItems, syncSettings.conflictStrategy])

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

  const handleSelectProject = useCallback((project: Project) => {
    setRouteState({ view: 'project', projectId: project.id, diagramId: null })
  }, [])

  const handleBackToHome = useCallback(() => {
    setRouteState({ view: 'home', projectId: null, diagramId: null })
  }, [])

  const handleSelectDiagram = useCallback((diagramId: string | null) => {
    setRouteState((prev) => ({ ...prev, diagramId }))
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setRouteState(parsePathRoute(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const nextPath = buildPathRoute(view, selectedProjectId, selectedDiagramId)
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }
  }, [view, selectedProjectId, selectedDiagramId])

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
          onClick={() => setRouteState({ view: 'settings', projectId: null, diagramId: null })}
          title="设置"
        >
          <Settings className="h-5 w-5" />
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
          <ProjectPage
            projectId={selectedProjectId}
            initialDiagramId={selectedDiagramId}
            onBack={handleBackToHome}
            onSelectDiagram={handleSelectDiagram}
          />
        )}
        {view === 'settings' && <SettingsPage />}
      </main>

      <Toaster />
      <ConflictDialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen} />
    </div>
  )
}
