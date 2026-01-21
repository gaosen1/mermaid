import { useState, useEffect, useCallback, useRef } from 'react'
import { MermaidRenderer } from './MermaidRenderer'
import { CodeEditor } from './CodeEditor'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDiagramStore } from '@/stores/diagramStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Save, History, Eye, Code } from 'lucide-react'
import type { LayoutType } from '@/types'

interface DiagramEditorProps {
  diagramId: string
}

export function DiagramEditor({ diagramId }: DiagramEditorProps) {
  const { currentDiagram, updateDiagram, createSnapshot, loadSnapshots } = useDiagramStore()
  const { settings } = useSettingsStore()

  const [editorState, setEditorState] = useState({
    source: '',
    layout: settings.defaultLayout as LayoutType,
    theme: settings.renderTheme as 'default' | 'dark' | 'forest' | 'neutral' | 'base',
    hasChanges: false,
  })
  const autoSaveTimerRef = useRef<number | null>(null)

  // 从状态中解构便于使用
  const { source, layout, theme, hasChanges } = editorState

  useEffect(() => {
    if (currentDiagram) {
      setEditorState({
        source: currentDiagram.source,
        layout: currentDiagram.config?.layout || settings.defaultLayout,
        theme: currentDiagram.config?.theme || settings.renderTheme,
        hasChanges: false,
      })
      loadSnapshots(currentDiagram.id)
    }
  }, [currentDiagram, settings.defaultLayout, settings.renderTheme, loadSnapshots])

  const handleSourceChange = useCallback((newSource: string) => {
    setEditorState(prev => ({ ...prev, source: newSource, hasChanges: true }))
  }, [])

  const setLayout = useCallback((newLayout: LayoutType) => {
    setEditorState(prev => ({ ...prev, layout: newLayout }))
  }, [])

  const setTheme = useCallback((newTheme: 'default' | 'dark' | 'forest' | 'neutral' | 'base') => {
    setEditorState(prev => ({ ...prev, theme: newTheme }))
  }, [])

  const handleSave = useCallback(async (isAuto = false) => {
    if (!currentDiagram) return

    await createSnapshot(
      currentDiagram.id,
      currentDiagram.source,
      isAuto ? '自动保存' : '手动保存',
      isAuto
    )

    await updateDiagram(diagramId, {
      source,
      config: { layout, theme },
    })

    setEditorState(prev => ({ ...prev, hasChanges: false }))
  }, [currentDiagram, diagramId, source, layout, theme, updateDiagram, createSnapshot])

  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    if (hasChanges && currentDiagram && settings.autoSaveInterval > 0) {
      autoSaveTimerRef.current = window.setTimeout(() => {
        handleSave(true)
      }, settings.autoSaveInterval)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [hasChanges, currentDiagram, settings.autoSaveInterval, handleSave])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      handleSave(false)
    }
  }, [handleSave])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!currentDiagram) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请选择一个图表
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">{currentDiagram.name}</h2>
          {hasChanges && (
            <span className="text-sm text-muted-foreground">未保存</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={layout} onValueChange={(v) => setLayout(v as LayoutType)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="布局" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elk">ELK</SelectItem>
              <SelectItem value="dagre">Dagre</SelectItem>
              <SelectItem value="hierarchical">Hierarchical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={theme} onValueChange={(v) => setTheme(v as 'default' | 'dark' | 'forest' | 'neutral' | 'base')}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="主题" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认</SelectItem>
              <SelectItem value="dark">暗色</SelectItem>
              <SelectItem value="forest">森林</SelectItem>
              <SelectItem value="neutral">中性</SelectItem>
              <SelectItem value="base">基础</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => handleSave(false)}>
            <Save className="h-4 w-4 mr-1" />
            保存
          </Button>
        </div>
      </div>

      <Tabs defaultValue="split" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="mx-4 mt-2 shrink-0">
          <TabsTrigger value="split" className="flex items-center gap-1">
            <Code className="h-4 w-4" />
            <Eye className="h-4 w-4" />
            分栏
          </TabsTrigger>
          <TabsTrigger value="code" className="flex items-center gap-1">
            <Code className="h-4 w-4" />
            代码
          </TabsTrigger>
          <TabsTrigger value="preview" className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            预览
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1">
            <History className="h-4 w-4" />
            历史
          </TabsTrigger>
        </TabsList>

        <TabsContent value="split" className="flex-1 p-4 min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 gap-4 h-full">
            <CodeEditor
              value={source}
              onChange={handleSourceChange}
              className="h-full"
              darkMode={settings.theme === 'dark'}
            />
            <MermaidRenderer
              source={source}
              layout={layout}
              theme={theme as 'default' | 'dark' | 'forest' | 'neutral' | 'base'}
              className="h-full border rounded-lg"
            />
          </div>
        </TabsContent>

        <TabsContent value="code" className="flex-1 p-4 min-h-0 overflow-hidden">
          <CodeEditor
            value={source}
            onChange={handleSourceChange}
            className="h-full"
            darkMode={settings.theme === 'dark'}
          />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 p-4 min-h-0 overflow-hidden">
          <MermaidRenderer
            source={source}
            layout={layout}
            theme={theme as 'default' | 'dark' | 'forest' | 'neutral' | 'base'}
            className="h-full border rounded-lg"
          />
        </TabsContent>

        <TabsContent value="history" className="flex-1 p-4 min-h-0 overflow-auto">
          <SnapshotList diagramId={diagramId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SnapshotList({ diagramId }: { diagramId: string }) {
  const { snapshots, loadSnapshots, restoreSnapshot, deleteSnapshot } = useDiagramStore()

  useEffect(() => {
    loadSnapshots(diagramId)
  }, [diagramId, loadSnapshots])

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        暂无历史记录
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {snapshots.map((snapshot) => (
        <div
          key={snapshot.id}
          className="flex items-center justify-between p-3 border rounded-lg"
        >
          <div>
            <div className="text-sm font-medium">
              {snapshot.description || (snapshot.isAuto ? '自动保存' : '手动保存')}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(snapshot.createdAt).toLocaleString()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => restoreSnapshot(snapshot.id)}
            >
              恢复
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteSnapshot(snapshot.id)}
            >
              删除
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
