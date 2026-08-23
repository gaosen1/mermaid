import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ImagePlus,
  Loader2,
  MessagesSquare,
  SendHorizontal,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react'
import { db } from '@/db'
import { toast } from 'sonner'
import type { AiChatSession, AiChatSessionMessage } from '@/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { renderMarkdownToHtml } from '@/utils/markdown'
import { navigateToSettings } from '@/utils/navigation'
import {
  AI_MODELS,
  AI_PROFILES_CHANGED_EVENT,
  buildGenerateSystemPrompt,
  buildMarkdownSystemPrompt,
  buildSystemPrompt,
  discoverVisionModel,
  getAiApiKey,
  getStoredAiModel,
  requestAiCompletion,
  requestVisionCompletion,
  storeAiModel,
  summarizeSessionTurns,
  type AiMessage,
} from '@/utils/aiChat'

// 输入框留空时自动发送的默认提问
const DEFAULT_QUESTIONS: Record<'mermaid' | 'markdown', string> = {
  mermaid: '请按平台语法规范优化并修正当前 Mermaid 代码，返回完整代码。',
  markdown: '请优化并修正当前 Markdown 文档，返回完整内容。',
}

// 各模式下允许「应用到编辑器」的代码块语言
const APPLY_LANGS: Record<'mermaid' | 'markdown', string[]> = {
  mermaid: ['mermaid'],
  markdown: ['markdown', 'md'],
}

type ChatItem = AiChatSessionMessage

type ReplySegment =
  | { type: 'text'; text: string }
  | { type: 'code'; lang: string; code: string }

// 将模型回复拆成文本段与代码块段，代码块渲染为独立卡片方便复制/应用。
// 按行扫描并跟踪围栏嵌套：```markdown 块内嵌的 ```mermaid 等子围栏
// 属于外层代码块内容，不能提前截断（CommonMark 规则：带信息串的围栏开嵌套，
// 不带信息串且长度足够的围栏关闭最内层）。
function parseReplySegments(content: string): ReplySegment[] {
  const segments: ReplySegment[] = []
  const lines = content.split('\n')
  const fenceRe = /^(\s*)(`{3,})(.*)$/
  // 栈中存每层围栏的反引号长度
  const stack: number[] = []
  let lang = ''
  let codeLines: string[] = []
  let textLines: string[] = []

  const flushText = () => {
    const text = textLines.join('\n').trim()
    if (text) segments.push({ type: 'text', text })
    textLines = []
  }
  const flushCode = () => {
    segments.push({ type: 'code', lang, code: codeLines.join('\n').trim() })
    codeLines = []
  }

  for (const line of lines) {
    const m = line.match(fenceRe)
    if (m) {
      const len = m[2].length
      const info = m[3].trim()
      const hasInfo = /^[\w-]+$/.test(info)
      if (stack.length === 0) {
        // 外层代码块开始
        flushText()
        stack.push(len)
        lang = info || 'code'
      } else if (hasInfo) {
        // 嵌套围栏开始（如 markdown 块内的 mermaid 块）
        stack.push(len)
        codeLines.push(line)
      } else if (len >= stack[stack.length - 1]) {
        // 裸围栏：关闭最内层
        stack.pop()
        if (stack.length === 0) {
          flushCode()
        } else {
          codeLines.push(line)
        }
      } else {
        codeLines.push(line)
      }
    } else if (stack.length > 0) {
      codeLines.push(line)
    } else {
      textLines.push(line)
    }
  }
  // 未闭合的围栏兜底：当作代码块输出
  if (stack.length > 0) flushCode()
  flushText()
  return segments
}

interface AiChatPanelProps {
  diagramId: string
  source: string
  onApplySource: (source: string) => void
  /** mermaid：优化 mermaid 代码；markdown：优化 Markdown 文档 */
  mode?: 'mermaid' | 'markdown'
}

export function AiChatPanel({ diagramId, source, onApplySource, mode = 'mermaid' }: AiChatPanelProps) {
  const [sessions, setSessions] = useState<AiChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [model, setModel] = useState(getStoredAiModel)
  const [loading, setLoading] = useState(false)
  const [hasKey, setHasKey] = useState(() => Boolean(getAiApiKey()))
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [thinking, setThinking] = useState(() => localStorage.getItem('ai-chat-thinking') !== '0')
  const [withSkill, setWithSkill] = useState(() => localStorage.getItem('ai-chat-with-skill') !== '0')
  // 「生成新图」模式（仅 mermaid）：按描述从零生成，不附带当前代码
  const [genMode, setGenMode] = useState(() => localStorage.getItem('ai-chat-gen-mode') === '1')
  // 图生图：附加的图片（dataURL）；会话持久化时仅存占位符
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)
  // 正在流式输出的 assistant 消息 id（用于实时渲染与推理块自动展开）
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 用户是否贴近底部：流式输出时若用户没有主动上滚，则持续自动滚到底部
  const stickToBottomRef = useRef(true)
  const activeSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  // 切换 diagram 时加载该图的会话列表，默认打开最近一条
  useEffect(() => {
    let cancelled = false
    db.aiChats
      .where('diagramId')
      .equals(diagramId)
      .toArray()
      .then((list) => {
        if (cancelled) return
        list.sort((a, b) => b.updatedAt - a.updatedAt)
        setSessions(list)
        const latest = list[0] ?? null
        setActiveSessionId(latest?.id ?? null)
        setItems(latest ? latest.messages : [])
      })
    return () => {
      cancelled = true
    }
  }, [diagramId])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // 流式输出期间跟随贴底；用户主动上滚时暂停，滚回底部后自动恢复
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [items, loading, streamingId])

  const handleListScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  const switchSession = (id: string | null) => {
    const session = sessions.find((s) => s.id === id) ?? null
    setActiveSessionId(id)
    setItems(session ? session.messages : [])
    setSessionMenuOpen(false)
    // 切换会话后定位到最新消息
    stickToBottomRef.current = true
  }

  const deleteSession = async (id: string) => {
    await db.aiChats.delete(id)
    const next = sessions.filter((s) => s.id !== id)
    setSessions(next)
    if (activeSessionIdRef.current === id) {
      const fallback = [...next].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
      setActiveSessionId(fallback?.id ?? null)
      setItems(fallback ? fallback.messages : [])
    }
  }

  // 配置变更（设置页保存）或窗口重新聚焦后刷新 Key 状态
  useEffect(() => {
    const refresh = () => setHasKey(Boolean(getAiApiKey()))
    window.addEventListener('focus', refresh)
    window.addEventListener(AI_PROFILES_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener(AI_PROFILES_CHANGED_EVENT, refresh)
    }
  }, [])

  // 附加图片（限 4MB）→ dataURL，供图生图使用
  const handleAttachFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('图片过大（限 4MB）')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setAttachedImage(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  const handleSend = async () => {
    if (loading) return

    const apiKey = getAiApiKey()
    if (!apiKey) {
      setHasKey(false)
      toast.error('请先在 设置 → AI 服务 中配置端点与 Key')
      return
    }

    const image = attachedImage
    const typedQuestion = input.trim()
    // 生成模式要求输入描述（附加图片时除外）；优化模式保留空输入快速发送
    if (!image && mode === 'mermaid' && genMode && !typedQuestion) return
    const question =
      typedQuestion ||
      (mode === 'mermaid' && genMode ? '' : DEFAULT_QUESTIONS[mode])
    const userItem: ChatItem = {
      id: uuid(),
      role: 'user',
      content: image
        ? typedQuestion
          ? `[图片] ${typedQuestion}`
          : '[图片] 转换为遵守平台语法的 Mermaid 代码'
        : question,
    }
    const pendingItems = [...items, userItem]
    setItems(pendingItems)
    setInput('')
    setAttachedImage(null)
    setLoading(true)

    // 首次发送才落库创建会话，避免空会话堆积
    let session = activeSession
    if (!session) {
      session = {
        id: uuid(),
        diagramId,
        title: question.slice(0, 30),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      }
      setActiveSessionId(session.id)
    }
    const targetSessionId = session.id

    // 图生图（VL）：独立非流式请求，完成后走统一持久化
    if (image) {
      const visionItemId = uuid()
      stickToBottomRef.current = true
      setItems([...pendingItems, { id: visionItemId, role: 'assistant', content: '' }])
      setStreamingId(visionItemId)
      let visionItems: ChatItem[]
      try {
        const vlModel = await discoverVisionModel(apiKey)
        const reply = await requestVisionCompletion({
          apiKey,
          model: vlModel,
          imageDataUrl: image,
          prompt:
            typedQuestion ||
            '把这张图转换为遵守平台语法的 Mermaid 代码，返回完整代码。',
        })
        visionItems = [...pendingItems, { id: visionItemId, role: 'assistant', content: reply }]
      } catch (err) {
        const message = err instanceof Error ? err.message : '请求失败'
        visionItems = [
          ...pendingItems,
          { id: visionItemId, role: 'assistant', content: message, error: true },
        ]
      }
      setStreamingId(null)
      const visionSession: AiChatSession = {
        ...session,
        updatedAt: Date.now(),
        messages: visionItems,
      }
      await db.aiChats.put(visionSession)
      setSessions((prev) => [...prev.filter((s) => s.id !== targetSessionId), visionSession])
      if (activeSessionIdRef.current === targetSessionId) setItems(visionItems)
      setLoading(false)
      return
    }

    // 多轮上下文：system（Skill + 当前代码 + 旧摘要）+ 最近 4 轮成功对话（assistant 截断）+ 本次提问
    const successful = pendingItems.filter((item) => !item.error && item.id !== userItem.id)
    const history = successful
      .slice(-8)
      .map(
        (item) =>
          ({
            role: item.role,
            content:
              item.role === 'assistant' && item.content.length > 1200
                ? `${item.content.slice(0, 1200)}…(已截断)`
                : item.content,
          }) as AiMessage
      )
    const sessionSummary = session.summary ?? ''
    let compressAfterReply: Array<{ role: string; content: string }> | null = null

    const messages: AiMessage[] = [
      {
        role: 'system',
        content:
          (mode === 'markdown'
            ? buildMarkdownSystemPrompt(source, { withSkill })
            : genMode
              ? buildGenerateSystemPrompt({ withSkill })
              : buildSystemPrompt(source, { withSkill })) +
          (sessionSummary ? `\n\n此前会话摘要：${sessionSummary}` : ''),
      },
      ...history,
      { role: 'user', content: question },
    ]

    // 超 6 轮时异步把滑出窗口的旧轮次压缩为会话摘要（不阻塞发送，失败静默）
    if (successful.length > 12) {
      // 记录待压缩的旧轮次，主请求完成后再异步压缩（避免与主 SSE 并发占用通道）
      compressAfterReply = successful
        .slice(0, successful.length - 8)
        .map((i) => ({ role: i.role, content: i.content }))
    }

    let finalItems: ChatItem[]
    const streamItemId = uuid()
    // 先插入空气泡，流式增量填充；发送后强制贴底跟随
    stickToBottomRef.current = true
    setItems([...pendingItems, { id: streamItemId, role: 'assistant', content: '' }])
    setStreamingId(streamItemId)
    try {
      const reply = await requestAiCompletion({
        apiKey,
        model,
        messages,
        thinking,
        onUpdate: (update) => {
          setItems((prev) =>
            prev.map((it) =>
              it.id === streamItemId
                ? { ...it, content: update.content, reasoning: update.reasoning || undefined }
                : it
            )
          )
        },
      })
      finalItems = [
        ...pendingItems,
        { id: streamItemId, role: 'assistant', content: reply.content, reasoning: reply.reasoning },
      ]
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败'
      finalItems = [
        ...pendingItems,
        { id: streamItemId, role: 'assistant', content: message, error: true },
      ]
    }
    setStreamingId(null)

    // 持久化到目标会话（用户可能已切换到别的会话）
    const updatedSession: AiChatSession = {
      ...session,
      updatedAt: Date.now(),
      messages: finalItems,
    }
    await db.aiChats.put(updatedSession)
    setSessions((prev) => [...prev.filter((s) => s.id !== targetSessionId), updatedSession])
    if (activeSessionIdRef.current === targetSessionId) {
      setItems(finalItems)
    }
    setLoading(false)

    // 主请求完成后异步压缩旧轮次为会话摘要（失败静默）
    if (compressAfterReply) {
      summarizeSessionTurns({
        apiKey,
        previousSummary: sessionSummary,
        turns: compressAfterReply,
      })
        .then((summary) => {
          if (!summary) return
          void db.aiChats.update(targetSessionId, { summary })
          setSessions((prev) => prev.map((s) => (s.id === targetSessionId ? { ...s, summary } : s)))
        })
        .catch(() => undefined)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* .ai-md 样式已全局定义于 index.css */}
      {/* 头部：会话管理 + API Key 入口 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b shrink-0">
        <DropdownMenu open={sessionMenuOpen} onOpenChange={setSessionMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 min-w-0 justify-start text-xs text-muted-foreground"
              title="切换会话"
            >
              <MessagesSquare className="h-3.5 w-3.5 mr-1 shrink-0" />
              <span className="truncate">{activeSession?.title || '新会话'}</span>
              <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto p-1">
            {sortedSessions.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无会话记录</div>
            )}
            {sortedSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/60"
                onClick={() => switchSession(session.id)}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    session.id === activeSessionId ? 'bg-primary' : 'bg-border'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs">{session.title || '新会话'}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleString()} · {session.messages.length} 条
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="删除该会话"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(session.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="新开会话"
          onClick={() => switchSession(null)}
        >
          <SquarePen className="h-4 w-4" />
        </Button>
      </div>

      {/* 未配置 AI 服务时引导去设置页（全局配置入口） */}
      {!hasKey && (
        <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          <p className="text-xs leading-5">
            尚未配置 AI 服务（端点与 Key）。请在「设置 → AI 服务」中配置后使用。
          </p>
          <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={navigateToSettings}>
            前往设置
          </Button>
        </div>
      )}

      {/* 消息列表 */}
      <div ref={scrollRef} onScroll={handleListScroll} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {items.length === 0 && !loading && (
          <div className="text-xs text-muted-foreground leading-5 pt-2">
            {sortedSessions.length > 0
              ? '当前为新会话；点击左上角可切换历史会话。'
              : '直接发送将自动请求「优化并修正当前代码」；也可以在下方输入具体要求。回复中的代码可一键应用到编辑器。'}
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
                  <AssistantReply
                    content={item.content}
                    reasoning={item.reasoning}
                    onApplySource={onApplySource}
                    applyLangs={APPLY_LANGS[mode]}
                    streaming={item.id === streamingId}
                  />
                )}
              </div>
            </div>
          )
        })}

        {loading && !streamingId && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI 处理中…
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="p-2 border-t shrink-0 space-y-1.5">
        <div className="flex items-center gap-4 px-0.5">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <Switch
              checked={thinking}
              onCheckedChange={(v) => {
                setThinking(v)
                localStorage.setItem('ai-chat-thinking', v ? '1' : '0')
              }}
              className="scale-75 data-[state=checked]:bg-primary"
            />
            思考
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer" title="系统提示词是否附带平台自定义样式 DSL Skill">
            <Switch
              checked={withSkill}
              onCheckedChange={(v) => {
                setWithSkill(v)
                localStorage.setItem('ai-chat-with-skill', v ? '1' : '0')
              }}
              className="scale-75 data-[state=checked]:bg-primary"
            />
            样式 Skill
          </label>
          {mode === 'mermaid' && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer" title="按描述从零生成新图（不附带当前代码）">
              <Switch
                checked={genMode}
                onCheckedChange={(v) => {
                  setGenMode(v)
                  localStorage.setItem('ai-chat-gen-mode', v ? '1' : '0')
                }}
                className="scale-75 data-[state=checked]:bg-primary"
              />
              生成新图
            </label>
          )}
        </div>
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

        {attachedImage && (
          <div className="flex items-center gap-1.5">
            <img src={attachedImage} alt="附加图片" className="h-10 w-10 rounded border object-cover" />
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setAttachedImage(null)}>
              <X className="h-3 w-3 mr-1" />
              移除
            </Button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
              if (file) {
                e.preventDefault()
                handleAttachFile(file)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            rows={2}
            placeholder={
              mode === 'mermaid' && genMode
                ? '描述你想要的图…'
                : '输入优化要求，留空发送则自动优化'
            }
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            title="附加图片（图生图）"
            disabled={loading || mode !== 'mermaid'}
            onClick={() => attachFileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <input
            ref={attachFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleAttachFile(file)
              e.target.value = ''
            }}
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleSend}
            disabled={loading || !hasKey || (mode === 'mermaid' && genMode && !input.trim() && !attachedImage)}
            title={!hasKey ? '请先在设置 → AI 服务中配置' : '发送'}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AssistantReply({
  content,
  reasoning,
  onApplySource,
  applyLangs,
  streaming,
}: {
  content: string
  reasoning?: string
  onApplySource: (source: string) => void
  applyLangs: string[]
  streaming?: boolean
}) {
  const segments = parseReplySegments(content)
  if (streaming && !content && !reasoning) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        思考中…
      </div>
    )
  }
  return (
    <div className="space-y-1.5 whitespace-normal min-w-0">
      {reasoning && <ReasoningBlock reasoning={reasoning} streaming={streaming} />}
      {segments.map((segment, index) =>
        segment.type === 'text' ? (
          <TextMarkdown key={index} text={segment.text} />
        ) : (
          <CodeCard
            key={index}
            lang={segment.lang}
            code={segment.code}
            onApplySource={onApplySource}
            applyLangs={applyLangs}
          />
        )
      )}
    </div>
  )
}

// 模型推理内容：流式输出时自动展开并跟随滚动，结束后可手动折叠
function ReasoningBlock({ reasoning, streaming }: { reasoning: string; streaming?: boolean }) {
  const [open, setOpen] = useState(Boolean(streaming))
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])
  // 推理块有自己的 max-h 滚动区，流式增长时独立滚到底部
  useLayoutEffect(() => {
    if (streaming && open && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [reasoning, streaming, open])
  return (
    <div className="rounded-md border border-dashed bg-muted/20">
      <button
        className="flex items-center gap-1 w-full px-2 py-1 text-[11px] text-muted-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        推理过程
      </button>
      {open && (
        <div ref={contentRef} className="px-2 pb-2 text-[11px] leading-5 text-muted-foreground whitespace-pre-wrap wrap-break-word max-h-64 overflow-y-auto">
          {reasoning}
        </div>
      )}
    </div>
  )
}

// 回复中的普通文本按 Markdown 渲染
function TextMarkdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdownToHtml(text), [text])
  return <div className="ai-md" dangerouslySetInnerHTML={{ __html: html }} />
}

function CodeCard({
  lang,
  code,
  onApplySource,
  applyLangs,
}: {
  lang: string
  code: string
  onApplySource: (source: string) => void
  applyLangs: string[]
}) {
  const [copied, setCopied] = useState(false)
  const applyable = applyLangs.includes(lang.toLowerCase())

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
          {applyable && (
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
