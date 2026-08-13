import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { clearAiApiKey, getAiApiKey, setAiApiKey } from '@/utils/aiChat'

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 千问云 API Key 配置弹窗（AI 对话、AI 命名、AI 整理共用）。
 */
export function ApiKeyDialog({ open, onOpenChange }: ApiKeyDialogProps) {
  const [draft, setDraft] = useState('')
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft('')
      setHasKey(Boolean(getAiApiKey()))
    }
  }, [open])

  const handleSave = () => {
    if (!draft.trim()) return
    setAiApiKey(draft)
    onOpenChange(false)
  }

  const handleClear = () => {
    clearAiApiKey()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm!">
        <DialogHeader>
          <DialogTitle className="text-base">千问云 API Key</DialogTitle>
          <DialogDescription>
            Key 仅保存在浏览器本地，用于调用千问云 OpenAI 兼容接口。
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
        />
        <DialogFooter className="gap-2 sm:justify-between">
          {hasKey ? (
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              清除
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={handleSave} disabled={!draft.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
