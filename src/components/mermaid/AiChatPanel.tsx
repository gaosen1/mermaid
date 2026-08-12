import { useEffect, useRef, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, SendHorizontal, Sparkles, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AI_MODELS,
  buildSystemPrompt,
  clearAiApiKey,
  getAiApiKey,
  getStoredAiModel,
  requestAiCompletion,
  setAiApiKey,
  storeAiModel,
  type AiMessage,
} from '@/utils/aiChat'

// 输入框留空时自动发送的默认提问
const DEFAULT_QUESTION = '请按平台语法规范优化并修正当前 Mermaid 代码，返回完整代码。'

interface ChatItem {
  id: number
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}

type ReplySegment =
  | { type: 'text'; text: string }
  | { type: 'code'; lang: string; code: string }

// 将模型回复拆成文本段与代码块段，代码块渲染为独立卡片方便复制/应用
function parseReplySegments(content: string): ReplySegment[] {
  const segments: ReplySegment[] = []
  const fenceRegex = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g
  let lastIndex = 0

  for (const match of content.matchAll(fenceRegex)) {
    const start = match.index ?? 0
    const text = content.slice(lastIndex, start).trim()
    if (text) segments.push({ type: 'text', text })
    segments.push({ type: 'code', lang: match[1] || 'code', code: match[2].trim() })
    lastIndex = start + match[0].length
  }

  const rest = content.slice(lastIndex).trim()
  if (rest) segments.push({ type: 'text', text: rest })
  return segments
}

interface AiChatPanelProps {
  source: string
  onApplySource: (source: string) => void
}

export function AiChatPanel({ source, onApplySource }: AiChatPanelProps) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState(getStoredAiModel)
  const [loading, setLoading] = useState(false)
  const [hasKey, setHasKey] = useState(() => Boolean(getAiApiKey()))
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const idRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [items, loading])

  const handleSaveKey = () => {
    if (!keyDraft.trim()) return
    setAiApiKey(keyDraft)
    setHasKey(true)
    setKeyDialogOpen(false)
    setKeyDraft('')
  }

  const handleClearKey = () => {
    clearAiApiKey()
    setHasKey(false)
    setKeyDialogOpen(false)
  }

  const handleSend = async () => {
    if (loading) return

    const apiKey = getAiApiKey()
    if (!apiKey) {
      setKeyDraft('')
      setKeyDialogOpen(true)
      return
    }

    const question = input.trim() || DEFAULT_QUESTION
    setItems((prev) => [...prev, { id: ++idRef.current, role: 'user', content: question }])
    setInput('')
    setLoading(true)

    // 最小上下文：system（Skill + 当前代码）+ 最近一轮成功对话 + 本次提问
    const history = items
      .filter((item) => !item.error)
      .slice(-2)
      .map((item) => ({ role: item.role, content: item.content }) as AiMessage)

    const messages: AiMessage[] = [
      { role: 'system', content: buildSystemPrompt(source) },
      ...history,
      { role: 'user', content: question },
    ]

    try {
      const reply = await requestAiCompletion({ apiKey, model, messages })
      setItems((prev) => [...prev, { id: ++idRef.current, role: 'assistant', content: reply }])
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败'
      setItems((prev) => [
        ...prev,
        { id: ++idRef.current, role: 'assistant', content: message, error: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 头部：说明 + API Key 入口 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">基于平台样式 Skill 优化当前代码</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title={hasKey ? '已配置 API Key，点击修改' : '配置千问云 API Key'}
          onClick={() => {
            setKeyDraft('')
            setKeyDialogOpen(true)
          }}
        >
          <KeyRound className={`h-4 w-4 ${hasKey ? 'text-green-500' : ''}`} />
        </Button>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {items.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground leading-5 pt-2">
            直接发送将自动请求「优化并修正当前代码」；也可以在下方输入具体要求。
            回复中的代码可一键应用到编辑器。
          </div>
        )}

        {items.map((item) => {
          return (
            <div key={item.id} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`
                  max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs leading-5
                  ${item.role === 'user' ? 'bg-primary/10 whitespace-pre-wrap wrap-break-word' : 'border bg-muted/30'}
                  ${item.error ? 'border-destructive/40 text-destructive whitespace-pre-wrap wrap-break-word' : ''}
                `}
              >
                {item.role === 'user' || item.error ? (
                  item.content
                ) : (
                  <AssistantReply content={item.content} onApplySource={onApplySource} />
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI 处理中…
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="p-2 border-t shrink-0 space-y-1.5">
        <Select
          value={model}
          onValueChange={(value) => {
            setModel(value)
            storeAiModel(value)
          }}
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue placeholder="模型" />
          </SelectTrigger>
          <SelectContent>
            {AI_MODELS.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={2}
            placeholder="输入优化要求，留空发送则自动优化"
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="sm" className="h-8 w-8 p-0" onClick={handleSend} disabled={loading} title="发送">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* API Key 配置弹窗 */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="max-w-sm!">
          <DialogHeader>
            <DialogTitle className="text-base">千问云 API Key</DialogTitle>
            <DialogDescription>
              Key 仅保存在浏览器本地，用于调用千问云 OpenAI 兼容接口。
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="sk-..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveKey()
            }}
          />
          <DialogFooter className="gap-2 sm:justify-between">
            {hasKey ? (
              <Button variant="ghost" size="sm" onClick={handleClearKey} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                清除
              </Button>
            ) : (
              <span />
            )}
            <Button size="sm" onClick={handleSaveKey} disabled={!keyDraft.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AssistantReply({
  content,
  onApplySource,
}: {
  content: string
  onApplySource: (source: string) => void
}) {
  const segments = parseReplySegments(content)
  return (
    <div className="space-y-1.5 whitespace-normal">
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <div key={index} className="whitespace-pre-wrap wrap-break-word">
            {segment.text}
          </div>
        ) : (
          <CodeCard
            key={index}
            lang={segment.lang}
            code={segment.code}
            onApplySource={onApplySource}
          />
        )
      )}
    </div>
  )
}

function CodeCard({
  lang,
  code,
  onApplySource,
}: {
  lang: string
  code: string
  onApplySource: (source: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const isMermaid = lang === '' || lang.toLowerCase() === 'mermaid'

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="rounded-md border overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/60 border-b">
        <span className="text-[10px] font-mono text-muted-foreground">{lang || 'code'}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copied ? '已复制' : '复制'}
          </Button>
          {isMermaid && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => onApplySource(code)}
            >
              应用到编辑器
            </Button>
          )}
        </div>
      </div>
      <pre className="max-h-64 overflow-auto p-2 text-[11px] leading-5 whitespace-pre">{code}</pre>
    </div>
  )
}
