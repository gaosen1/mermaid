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
 * 系统提示词：平台自定义样式 Skill + 工作方式 + 当前图表代码。
 */
export function buildSystemPrompt(currentSource: string): string {
  return [
    '你是 Mermaid 图表平台内置的 AI 优化助手，负责对用户已存储的 Mermaid 代码做二次优化与修正。',
    '',
    '下面是平台的自定义样式 Skill 文档，生成或修改代码时必须遵守：',
    '',
    SKILL_MD.trim(),
    '',
    '工作方式：',
    '1. 基于「当前图表代码」做优化或按用户要求修改，保留原有节点与结构，不要凭空重写。',
    '2. 将优化后的完整代码放在一个 ```mermaid 代码块中返回，代码块外只允许极简的说明。',
    '',
    '当前图表代码：',
    `${FENCE}mermaid`,
    currentSource.trim() || '（空）',
    FENCE,
  ].join('\n')
}

export async function requestAiCompletion(options: {
  apiKey: string
  model: string
  messages: AiMessage[]
  signal?: AbortSignal
}): Promise<string> {
  const { apiKey, model, messages, signal } = options

  const response = await fetch(`${AI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      // 小任务关闭思考模式，控制上下文与 token 消耗
      enable_thinking: false,
      temperature: 0.4,
    }),
    signal,
  })

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ||
      `请求失败（${response.status}）`
    throw new Error(message)
  }

  const content = (data as { choices?: { message?: { content?: string } }[] } | null)
    ?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('模型未返回有效内容')
  }
  return content
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
