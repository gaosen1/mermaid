import { SKILL_MD } from './dslSkill'

// 千问云 OpenAI 兼容模式
export const AI_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export interface AiModelOption {
  id: string
  label: string
}

export const AI_MODELS: AiModelOption[] = [
  { id: 'qwen3.8-max', label: 'Qwen3.8-Max' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek' },
  { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus' },
  { id: 'qwen3.7-max', label: 'Qwen3.7-Max' },
  { id: 'qwen3.7-flash', label: 'Qwen3.7-Flash' },
]

const AI_KEY_STORAGE = 'ai-api-key'
const AI_MODEL_STORAGE = 'ai-chat-model'

export function getAiApiKey(): string {
  return localStorage.getItem(AI_KEY_STORAGE) ?? ''
}

export function setAiApiKey(key: string): void {
  localStorage.setItem(AI_KEY_STORAGE, key.trim())
}

export function clearAiApiKey(): void {
  localStorage.removeItem(AI_KEY_STORAGE)
}

export function getStoredAiModel(): string {
  const saved = localStorage.getItem(AI_MODEL_STORAGE)
  return saved && AI_MODELS.some((m) => m.id === saved) ? saved : AI_MODELS[0].id
}

export function storeAiModel(id: string): void {
  localStorage.setItem(AI_MODEL_STORAGE, id)
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const FENCE = String.fromCharCode(96, 96, 96)

/**
 * 系统提示词：平台自定义样式 Skill（可插拔，默认开启）+ 工作方式 + 当前图表代码。
 */
export function buildSystemPrompt(
  currentSource: string,
  options: { withSkill: boolean } = { withSkill: true }
): string {
  const lines: string[] = [
    '你是 Mermaid 图表平台内置的 AI 优化助手，负责对用户已存储的 Mermaid 代码做二次优化与修正。',
    '',
  ]

  if (options.withSkill) {
    lines.push(
      '下面是平台的自定义样式 Skill 文档，涉及节点/连线样式与动画时必须遵守：',
      '',
      SKILL_MD.trim(),
      ''
    )
  }

  lines.push(
    '工作方式：',
    '1. 基于「当前图表代码」做优化或按用户要求修改，保留原有节点与结构，不要凭空重写。',
    '2. 将优化后的完整代码放在一个 ```mermaid 代码块中返回，代码块外只允许极简的说明。',
    '3. 如无特殊说明，不要使用 animation:blink 闪烁动画（闪烁影响阅读体验）；需要强调节点时优先使用 pulse 或连线动画。',
    '',
    '当前图表代码：',
    `${FENCE}mermaid`,
    currentSource.trim() || '（空）',
    FENCE
  )

  return lines.join('\n')
}

/**
 * Markdown 图表的系统提示词：优化/修正文档；
 * 文档内嵌的 ```mermaid 代码块仍遵循平台自定义样式 Skill。
 */
export function buildMarkdownSystemPrompt(
  currentSource: string,
  options: { withSkill: boolean } = { withSkill: true }
): string {
  const lines: string[] = [
    '你是 Mermaid 图表平台内置的 AI 优化助手，负责对用户已存储的 Markdown 文档做二次优化与修正。',
    '',
  ]

  if (options.withSkill) {
    lines.push(
      '文档中可能包含 ```mermaid 代码块，平台对这些代码块有自定义样式扩展语法，涉及修改时必须遵守下面的 Skill 文档：',
      '',
      SKILL_MD.trim(),
      ''
    )
  }

  lines.push(
    '工作方式：',
    '1. 基于「当前文档内容」做优化或按用户要求修改，保留原有结构与意图，不要凭空重写。',
    '2. 将优化后的完整文档放在一个 ```markdown 代码块中返回，代码块外只允许极简的说明。',
    '3. 如无特殊说明，文档内 mermaid 代码块不要使用 animation:blink 闪烁动画。',
    '',
    '当前文档内容：',
    `${FENCE}markdown`,
    currentSource.trim() || '（空）',
    FENCE
  )

  return lines.join('\n')
}

export interface AiCompletionResult {
  content: string
  /** 模型推理内容（思考模式开启时返回） */
  reasoning?: string
}

export interface AiStreamUpdate {
  content: string
  reasoning: string
}

/**
 * 流式请求（SSE）：推理过程与正文增量回调，结束后返回完整结果。
 */
export async function requestAiCompletion(options: {
  apiKey: string
  model: string
  messages: AiMessage[]
  thinking?: boolean
  signal?: AbortSignal
  onUpdate?: (update: AiStreamUpdate) => void
}): Promise<AiCompletionResult> {
  const { apiKey, model, messages, thinking = true, signal, onUpdate } = options

  const response = await fetch(`${AI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      // 思考模式默认开启，推理内容会透传到对话面板展示；可关闭以节省 token
      enable_thinking: thinking,
      temperature: 0.4,
      stream: true,
    }),
    signal,
  })

  if (!response.ok || !response.body) {
    const data: unknown = await response.json().catch(() => null)
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ||
      `请求失败（${response.status}）`
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let reasoning = ''

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const json = JSON.parse(payload) as {
        choices?: { delta?: { content?: string; reasoning_content?: string } }[]
      }
      const delta = json.choices?.[0]?.delta
      if (delta?.reasoning_content) reasoning += delta.reasoning_content
      if (delta?.content) content += delta.content
      if (delta) onUpdate?.({ content, reasoning })
    } catch {
      // 忽略不完整的 SSE 行
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
    }
  }
  if (buffer.trim()) handleLine(buffer)

  if (!content.trim()) {
    throw new Error('模型未返回有效内容')
  }

  return { content, reasoning: reasoning.trim() ? reasoning : undefined }
}

/**
 * 从模型回复中提取第一个 mermaid 代码块（退而求其次：任意代码块）。
 */
export function extractMermaidCode(reply: string): string | null {
  const mermaidMatch = reply.match(/```mermaid[^\n]*\n([\s\S]*?)```/i)
  if (mermaidMatch) return mermaidMatch[1].trim()

  const anyMatch = reply.match(/```[^\n]*\n([\s\S]*?)```/)
  return anyMatch ? anyMatch[1].trim() : null
}
