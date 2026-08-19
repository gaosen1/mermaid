import { useEffect, useState } from 'react'
import {
  CalendarRange,
  FileCode2,
  FilePlus2,
  FolderPlus,
  History,
  MonitorPlay,
  Settings,
  Sparkles,
} from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { fullSearchDiagrams, type DiagramSearchHit } from '@/utils/search'
import { getRecentDiagrams } from '@/utils/recent'
import { PALETTE_ACTION_EVENT } from '@/utils/paletteAction'
import { db } from '@/db'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前是否在项目页（决定项目级动作是否展示） */
  inProject: boolean
  /** 是否打开了图表（演示模式入口） */
  canPresent?: boolean
  onOpenDiagram: (projectId: string, diagramId: string) => void
  onGoSettings: () => void
}

interface RecentResolved {
  diagramId: string
  projectId: string
  name: string
  projectName: string
}

/** 命中词高亮（纯 React 文本拆分，不用 dangerouslySetInnerHTML） */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent text-primary font-semibold">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export function CommandPalette({
  open,
  onOpenChange,
  inProject,
  canPresent = false,
  onOpenDiagram,
  onGoSettings,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<DiagramSearchHit[]>([])
  const [recents, setRecents] = useState<RecentResolved[]>([])

  // 打开时解析最近打开列表；关闭时重置输入
  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    let cancelled = false
    ;(async () => {
      const entries = getRecentDiagrams()
      if (entries.length === 0) {
        if (!cancelled) setRecents([])
        return
      }
      const diagrams = await db.diagrams.bulkGet(entries.map((e) => e.diagramId))
      const projectIds = [...new Set(diagrams.filter((d) => Boolean(d)).map((d) => d!.projectId))]
      const projects = await db.projects.bulkGet(projectIds)
      const projectNameMap = new Map(projects.filter((p) => Boolean(p)).map((p) => [p!.id, p!.name]))
      const resolved: RecentResolved[] = []
      entries.forEach((_entry, i) => {
        const diagram = diagrams[i]
        if (!diagram) return
        resolved.push({
          diagramId: diagram.id,
          projectId: diagram.projectId,
          name: diagram.name,
          projectName: projectNameMap.get(diagram.projectId) ?? '',
        })
      })
      if (!cancelled) setRecents(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }
    const timer = setTimeout(() => {
      fullSearchDiagrams(query, 8).then(setHits)
    }, 120)
    return () => clearTimeout(timer)
  }, [query])

  const pick = (projectId: string, diagramId: string) => {
    onOpenDiagram(projectId, diagramId)
    onOpenChange(false)
  }

  const action = (name: string) => {
    window.dispatchEvent(new CustomEvent(PALETTE_ACTION_EVENT, { detail: name }))
    onOpenChange(false)
  }

  const showRecents = !query.trim() && recents.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>命令面板</DialogTitle>
        <DialogDescription>搜索图表或执行动作</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0">
        <Command
          shouldFilter={false}
          className="**:[cmdk-group-heading]:text-muted-foreground **:[cmdk-group-heading]:px-2 **:[cmdk-group-heading]:font-medium **:[cmdk-group]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[cmdk-input]:h-12 **:[cmdk-item]:px-2 **:[cmdk-item]:py-3"
        >
      <CommandInput
        placeholder="搜索名称 / 标签 / 内容，或输入动作…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>未找到匹配的图表或动作</CommandEmpty>

        {showRecents && (
          <CommandGroup heading="最近打开">
            {recents.map((r) => (
              <CommandItem
                key={r.diagramId}
                value={`recent-${r.diagramId}`}
                onSelect={() => pick(r.projectId, r.diagramId)}
              >
                <History className="h-4 w-4" />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground truncate max-w-32">
                  {r.projectName}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {query.trim() && hits.length > 0 && (
          <CommandGroup heading="图表">
            {hits.map((hit) => (
              <CommandItem
                key={hit.diagram.id}
                value={`hit-${hit.diagram.id}`}
                onSelect={() => pick(hit.project.id, hit.diagram.id)}
              >
                <FileCode2 className="h-4 w-4" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm">
                    <Highlight text={hit.diagram.name} query={query} />
                  </span>
                  {hit.snippet && (
                    <span className="block truncate text-xs text-muted-foreground">
                      <Highlight text={hit.snippet} query={query} />
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-24 shrink-0">
                  {hit.project.name}
                </span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {hit.diagram.type}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="动作">
          {inProject && (
            <CommandItem value="action-new-diagram" onSelect={() => action('new-diagram')}>
              <FilePlus2 className="h-4 w-4" />
              新建图表
            </CommandItem>
          )}
          {inProject && (
            <CommandItem value="action-new-folder" onSelect={() => action('new-folder')}>
              <FolderPlus className="h-4 w-4" />
              新建文件夹
            </CommandItem>
          )}
          {inProject && (
            <CommandItem value="action-ai-organize" onSelect={() => action('ai-organize')}>
              <Sparkles className="h-4 w-4" />
              AI 整理目录
            </CommandItem>
          )}
          {inProject && canPresent && (
            <CommandItem value="action-presentation" onSelect={() => action('presentation')}>
              <MonitorPlay className="h-4 w-4" />
              演示模式
            </CommandItem>
          )}
          {!inProject && (
            <CommandItem value="action-review" onSelect={() => action('review')}>
              <CalendarRange className="h-4 w-4" />
              笔记回顾
            </CommandItem>
          )}
          <CommandItem
            value="action-settings"
            onSelect={() => {
              onGoSettings()
              onOpenChange(false)
            }}
          >
            <Settings className="h-4 w-4" />
            设置
          </CommandItem>
        </CommandGroup>
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
