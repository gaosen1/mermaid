import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarRange,
  Code2,
  Copy,
  FileText,
  GitBranch,
  Image,
  Loader2,
  Save,
  Sparkles,
  Spline,
  Table,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ApiKeyDialog } from '@/components/mermaid/ApiKeyDialog'
import { useDiagramStore } from '@/stores/diagramStore'
import { db } from '@/db'
import type { Diagram, DiagramType, Project } from '@/types'
import { renderMarkdownToHtml } from '@/utils/markdown'
import { getAiApiKey } from '@/utils/aiChat'
import { streamReviewSummary, REVIEW_SUMMARY_LIMIT, type ReviewNoteItem } from '@/utils/aiOrganize'
import { copyTextToClipboard } from '@/utils/portable'

interface NoteReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 打开某篇笔记（跨项目，由父级走现有导航链路） */
  onOpenDiagram: (projectId: string, diagramId: string) => void
}

const IMAGE_TYPES: DiagramType[] = ['png', 'jpg', 'webp']

type PresetId = '7d' | '30d' | 'week' | 'custom'

// ─── 日期工具 ────────────────────────────────────────────────────────────────

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDayStart(value: string): number {
  return new Date(`${value}T00:00:00`).getTime()
}

function parseDayEnd(value: string): number {
  return new Date(`${value}T23:59:59.999`).getTime()
}

function formatShort(value: string): string {
  return value.slice(5).replace('-', '.')
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 本周一 */
function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (day - 1))
  return d
}

function presetRange(preset: PresetId): { start: string; end: string } | null {
  const today = new Date()
  if (preset === '7d') {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return { start: toDateInputValue(start), end: toDateInputValue(today) }
  }
  if (preset === '30d') {
    const start = new Date(today)
    start.setDate(start.getDate() - 29)
    return { start: toDateInputValue(start), end: toDateInputValue(today) }
  }
  if (preset === 'week') {
    return { start: toDateInputValue(mondayOf(today)), end: toDateInputValue(today) }
  }
  return null
}

// ─── 内容预览 ────────────────────────────────────────────────────────────────

function getPreview(diagram: Diagram): string {
  if (IMAGE_TYPES.includes(diagram.type)) return '图片'
  const source = (diagram.source ?? '').trim()
  if (!source) return '（空内容）'
  return source.replace(/\s+/g, ' ').slice(0, 80)
}

function TypeIcon({ type, className }: { type: DiagramType; className?: string }) {
  switch (type) {
    case 'mermaid':
      return <GitBranch className={className} />
    case 'html':
      return <Code2 className={className} />
    case 'svg':
      return <Spline className={className} />
    case 'markdown':
      return <FileText className={className} />
    case 'txt':
      return <Table className={className} />
    default:
      return <Image className={className} />
  }
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function NoteReviewDialog({ open, onOpenChange, onOpenDiagram }: NoteReviewDialogProps) {
  const createDiagram = useDiagramStore((s) => s.createDiagram)

  // 跨项目数据：打开时从 IndexedDB 加载全部项目与图表
  const [projects, setProjects] = useState<Project[]>([])
  const [diagrams, setDiagrams] = useState<Diagram[]>([])

  const [preset, setPreset] = useState<PresetId>('7d')
  const [startDate, setStartDate] = useState(() => presetRange('7d')!.start)
  const [endDate, setEndDate] = useState(() => presetRange('7d')!.end)

  // AI 摘要状态
  const [summary, setSummary] = useState('')
  const [generating, setGenerating] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 打开时拉取全量数据
  useEffect(() => {
    if (open) {
      db.projects.toArray().then(setProjects)
      db.diagrams.toArray().then(setDiagrams)
    }
  }, [open])

  // 重新打开或切换周期时重置摘要
  useEffect(() => {
    if (open) {
      setSummary('')
      setSummaryError(null)
    }
    return () => {
      abortRef.current?.abort()
    }
  }, [open, startDate, endDate])

  const projectNameMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  const rangeStart = parseDayStart(startDate)
  const rangeEnd = parseDayEnd(endDate)
  const invalidRange = !startDate || !endDate || rangeStart > rangeEnd

  // 命中区间（createdAt 或 updatedAt 落在区间内）的笔记
  const hits = useMemo(() => {
    if (invalidRange) return []
    return diagrams
      .filter(
        (d) =>
          (d.createdAt >= rangeStart && d.createdAt <= rangeEnd) ||
          (d.updatedAt >= rangeStart && d.updatedAt <= rangeEnd)
      )
      .map((d) => {
        const isNew = d.createdAt >= rangeStart && d.createdAt <= rangeEnd
        const isUpdated = !isNew && d.updatedAt >= rangeStart && d.updatedAt <= rangeEnd
        return { diagram: d, isNew, isUpdated }
      })
      .sort((a, b) => b.diagram.updatedAt - a.diagram.updatedAt)
  }, [diagrams, rangeStart, rangeEnd, invalidRange])

  const newCount = hits.filter((h) => h.isNew).length
  const updatedCount = hits.filter((h) => h.isUpdated).length
  const rangeLabel = `${formatShort(startDate)} ~ ${formatShort(endDate)}`

  // 「保存为回顾笔记」的目标项目：命中最多的项目（无需用户选择）
  const saveProjectId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { diagram } of hits) {
      counts.set(diagram.projectId, (counts.get(diagram.projectId) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    return top?.[0] ?? projects[0]?.id ?? ''
  }, [hits, projects])

  const applyPreset = (id: PresetId) => {
    setPreset(id)
    const range = presetRange(id)
    if (range) {
      setStartDate(range.start)
      setEndDate(range.end)
    }
  }

  const handleStartChange = (value: string) => {
    setStartDate(value)
    setPreset('custom')
  }

  const handleEndChange = (value: string) => {
    setEndDate(value)
    setPreset('custom')
  }

  const handleOpenDiagram = (diagram: Diagram) => {
    onOpenChange(false)
    onOpenDiagram(diagram.projectId, diagram.id)
  }

  const handleGenerateSummary = async () => {
    if (generating || hits.length === 0) return
    if (!getAiApiKey()) {
      setKeyDialogOpen(true)
      return
    }

    setGenerating(true)
    setSummary('')
    setSummaryError(null)
    const controller = new AbortController()
    abortRef.current = controller

    const notes: ReviewNoteItem[] = hits.map(({ diagram, isNew, isUpdated }) => ({
      id: diagram.id,
      name: diagram.name,
      type: diagram.type,
      project: projectNameMap.get(diagram.projectId),
      isNew,
      isUpdated,
      summary: IMAGE_TYPES.includes(diagram.type)
        ? ''
        : (diagram.source ?? '').trim().slice(0, REVIEW_SUMMARY_LIMIT),
    }))

    try {
      const result = await streamReviewSummary({
        rangeLabel,
        notes,
        signal: controller.signal,
        onUpdate: (content) => setSummary(content),
      })
      setSummary(result)
    } catch (err) {
      if (!controller.signal.aborted) {
        setSummaryError(err instanceof Error ? err.message : '生成总结失败')
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }

  const handleStopSummary = () => {
    abortRef.current?.abort()
    setGenerating(false)
  }

  const handleCopySummary = async () => {
    try {
      await copyTextToClipboard(summary)
      toast.success('已复制总结内容')
    } catch {
      toast.error('复制失败，请检查浏览器剪贴板权限')
    }
  }

  // 保存为命中最多项目下的一篇 Markdown 回顾笔记
  const handleSaveAsNote = async () => {
    if (!summary.trim() || saving || !saveProjectId) return
    setSaving(true)
    try {
      const title = `回顾 ${formatShort(startDate)}-${formatShort(endDate)}`
      const content = `# ${title}\n\n> 时间范围：${rangeLabel}｜共 ${hits.length} 篇笔记（新建 ${newCount} / 更新 ${updatedCount}）\n\n${summary}\n`
      const diagram = await createDiagram(saveProjectId, title, 'markdown', content)
      toast.success('已保存为回顾笔记')
      onOpenChange(false)
      onOpenDiagram(diagram.projectId, diagram.id)
    } catch (err) {
      toast.error('保存失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            笔记回顾
          </DialogTitle>
          <DialogDescription>按日期区间跨项目回顾记录的笔记，可选生成 AI 总结</DialogDescription>
        </DialogHeader>

        {/* 日期范围 */}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['7d', '最近 7 天'],
              ['30d', '最近 30 天'],
              ['week', '本周'],
            ] as [PresetId, string][]
          ).map(([id, label]) => (
            <Button
              key={id}
              variant={preset === id ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyPreset(id)}
            >
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => handleStartChange(e.target.value)}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            />
            <span className="text-xs text-muted-foreground">至</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => handleEndChange(e.target.value)}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
        </div>

        {invalidRange && (
          <div className="text-xs text-destructive">起始日期不能晚于结束日期</div>
        )}

        {/* 命中列表 */}
        {!invalidRange && (
          <>
            <div className="text-xs text-muted-foreground">
              共 {hits.length} 篇（新建 {newCount} / 更新 {updatedCount}）
            </div>
            <ScrollArea className="h-56 border rounded-md min-w-0" contentClassName="block min-w-0">
              {hits.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground py-10">
                  该时间段内没有记录，试试扩大日期范围
                </div>
              ) : (
                <div className="divide-y">
                  {hits.map(({ diagram, isNew, isUpdated }) => (
                    <button
                      key={diagram.id}
                      className="flex items-start gap-2 w-full px-2 py-2 text-left hover:bg-accent/60 transition-colors"
                      onClick={() => handleOpenDiagram(diagram)}
                    >
                      <TypeIcon type={diagram.type} className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium truncate">{diagram.name}</span>
                          {isNew && (
                            <span className="text-[10px] px-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                              新建
                            </span>
                          )}
                          {isUpdated && (
                            <span className="text-[10px] px-1 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0">
                              更新
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {projectNameMap.get(diagram.projectId)} · {formatTime(isNew ? diagram.createdAt : diagram.updatedAt)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {getPreview(diagram)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        {/* AI 摘要 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {generating ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleStopSummary}>
                <X className="h-3 w-3 mr-1" />
                停止生成
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={invalidRange || hits.length === 0}
                onClick={handleGenerateSummary}
              >
                {generating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                {summary ? '重新生成 AI 总结' : '生成 AI 总结'}
              </Button>
            )}
            {summary && !generating && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCopySummary}>
                  <Copy className="h-3 w-3 mr-1" />
                  复制
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveAsNote} disabled={saving || !saveProjectId}>
                  {saving ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  保存为回顾笔记
                </Button>
              </>
            )}
            {generating && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                生成中…
              </span>
            )}
          </div>

          {summaryError && <div className="text-xs text-destructive">{summaryError}</div>}

          {(summary || generating) && (
            <div className="ai-md border rounded-md p-3 text-sm max-h-64 overflow-y-auto">
              {summary ? (
                <div dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(summary) }} />
              ) : (
                <div className="text-xs text-muted-foreground">正在总结这段时间的笔记…</div>
              )}
            </div>
          )}
        </div>

        <ApiKeyDialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen} />
      </DialogContent>
    </Dialog>
  )
}
