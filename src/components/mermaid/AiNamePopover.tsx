import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ApiKeyDialog } from './ApiKeyDialog'
import { useAiNameSuggestions } from './useAiNameSuggestions'
import { getAiApiKey } from '@/utils/aiChat'
import { isAiNameableType } from '@/utils/aiOrganize'
import type { Diagram } from '@/types'

interface AiNamePopoverProps {
  diagram: Diagram
  existingNames: string[]
  /** 编辑器中的最新源码（可能尚未保存） */
  source: string
  onApplyName: (name: string) => Promise<void> | void
}

/**
 * 编辑器标题栏的 AI 命名入口：生成候选名，点击即应用。
 */
export function AiNamePopover({ diagram, existingNames, source, onApplyName }: AiNamePopoverProps) {
  const [open, setOpen] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const suggestions = useAiNameSuggestions()

  const disabled = !source.trim() || !isAiNameableType(diagram.type)
  const disabledReason = !isAiNameableType(diagram.type)
    ? '该类型不支持 AI 命名'
    : '内容为空，无法 AI 命名'

  const handleGenerate = () => {
    suggestions.generate({
      source,
      type: diagram.type,
      existingNames: existingNames.filter((n) => n !== diagram.name),
    })
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && suggestions.names.length === 0 && !suggestions.loading && !disabled) {
      handleGenerate()
    }
    if (!next) suggestions.reset()
  }

  const handleApply = async (name: string) => {
    setApplying(name)
    await onApplyName(name)
    setApplying(null)
    setOpen(false)
    suggestions.reset()
  }

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title={disabled ? disabledReason : 'AI 命名'}
            disabled={disabled}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-2">
          <div className="text-xs font-medium mb-1.5">AI 建议名称</div>
          {suggestions.loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              生成中…
            </div>
          )}
          {suggestions.error && (
            <div className="text-xs text-destructive py-1">{suggestions.error}</div>
          )}
          {!suggestions.loading && suggestions.names.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.names.map((name) => (
                <button
                  key={name}
                  className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
                  onClick={() => handleApply(name)}
                  disabled={applying !== null}
                >
                  {applying === name ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleGenerate}
              disabled={suggestions.loading}
            >
              换一批
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {/* Key 配置完成后关闭弹窗，用户再次点击重新触发 */}
      <ApiKeyDialog
        open={suggestions.needKey}
        onOpenChange={(v) => {
          suggestions.setNeedKey(v)
          if (!v && getAiApiKey()) handleGenerate()
        }}
      />
    </>
  )
}
