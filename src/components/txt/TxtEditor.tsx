import { useCallback, useEffect, useRef, useState } from 'react'
import { CodeEditor } from '@/components/mermaid/CodeEditor'
import { useDiagramStore } from '@/stores/diagramStore'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settingsStore'
import { Download, History, Save } from 'lucide-react'
import { exportDiagram } from '@/utils/export'

interface TxtEditorProps {
  diagramId: string
  sidebarWidth?: number
  sidebarAnimating?: boolean
}

export function TxtEditor({
  diagramId,
  sidebarWidth = 0,
  sidebarAnimating = false,
}: TxtEditorProps) {
  const { currentDiagram, updateDiagram, createSnapshot, loadSnapshots } =
    useDiagramStore()
  const { settings } = useSettingsStore()

  const [source, setSource] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const autoSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (currentDiagram?.type === 'txt') {
      setSource(currentDiagram.source)
      setHasChanges(false)
      loadSnapshots(currentDiagram.id)
    }
  }, [currentDiagram, loadSnapshots])

  const handleSave = useCallback(
    async (isAuto = false) => {
      if (!currentDiagram || currentDiagram.type !== 'txt') return

      await createSnapshot(
        currentDiagram.id,
        currentDiagram.source,
        isAuto ? '自动保存' : '手动保存',
        isAuto
      )

      await updateDiagram(diagramId, { source, config: undefined })
      setHasChanges(false)
    },
    [createSnapshot, currentDiagram, diagramId, source, updateDiagram]
  )

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    if (hasChanges && currentDiagram && settings.autoSaveInterval > 0) {
      autoSaveTimerRef.current = window.setTimeout(() => {
        handleSave(true)
      }, settings.autoSaveInterval)
    }

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [hasChanges, currentDiagram, settings.autoSaveInterval, handleSave])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  const handleExport = useCallback(() => {
    if (!currentDiagram) return
    exportDiagram(currentDiagram, source)
  }, [currentDiagram, source])

  if (!currentDiagram) return null

  return (
    <div className="flex flex-col h-full" style={{ paddingLeft: sidebarWidth }}>
      <div className={`flex flex-col h-full transition-all ${sidebarAnimating ? 'transition-[padding]' : ''}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate max-w-[200px]">{currentDiagram.name}</span>
            {hasChanges && <span className="text-xs text-muted-foreground">未保存</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => loadSnapshots(currentDiagram.id)} title="历史记录">
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport} title="导出">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleSave(false)} disabled={!hasChanges} title="保存">
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <CodeEditor
            value={source}
            onChange={(val) => {
              setSource(val)
              setHasChanges(true)
            }}
            language="plain"
          />
        </div>
      </div>
    </div>
  )
}
