import { SKILL_MD } from './dslSkill'

// ─── 服务端点配置（双方案：Token 套餐 / API 按量付费） ──────────────────

export type AiProfileId = 'token-plan' | 'api-payg'

export interface AiEndpointProfile {
  id: AiProfileId
  name: string
  baseUrl: string
  apiKey: string
}

/** 各方案的默认端点 */
export const AI_PROFILE_PRESETS: Record<AiProfileId, { name: string; baseUrl: string }> = {
  'token-plan': {
    name: 'Token 套餐（订阅）',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
  },
  'api-payg': {
    name: 'API 按量付费',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
}

/** 按量付费端点（兼容旧引用） */
export const AI_API_BASE = AI_PROFILE_PRESETS['api-payg'].baseUrl

const PROFILES_STORAGE = 'ai-endpoint-profiles'
const ACTIVE_PROFILE_STORAGE = 'ai-active-profile'
const LEGACY_KEY_STORAGE = 'ai-api-key'
const AI_MODEL_STORAGE = 'ai-chat-model'

function buildDefaultProfiles(): Record<AiProfileId, AiEndpointProfile> {
  return {
    'token-plan': { id: 'token-plan', name: AI_PROFILE_PRESETS['token-plan'].name, baseUrl: AI_PROFILE_PRESETS['token-plan'].baseUrl, apiKey: '' },
    'api-payg': { id: 'api-payg', name: AI_PROFILE_PRESETS['api-payg'].name, baseUrl: AI_PROFILE_PRESETS['api-payg'].baseUrl, apiKey: '' },
  }
}

/** 读取两个方案的配置；旧版单 key 自动迁移到「按量付费」方案 */
export function getAiProfiles(): Record<AiProfileId, AiEndpointProfile> {
  const profiles = buildDefaultProfiles()
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<AiProfileId, Partial<AiEndpointProfile>>>
      for (const id of Object.keys(profiles) as AiProfileId[]) {
        const s = saved[id]
        if (s) {
          profiles[id] = {
            ...profiles[id],
            baseUrl: typeof s.baseUrl === 'string' && s.baseUrl.trim() ? s.baseUrl.trim() : profiles[id].baseUrl,
            apiKey: typeof s.apiKey === 'string' ? s.apiKey : '',
          }
        }
      }
    }
  } catch {
    // 解析失败走默认
  }
  // 旧版单 key 迁移（迁移后删除旧键，避免两处不一致）
  const legacy = localStorage.getItem(LEGACY_KEY_STORAGE)
  if (legacy && !profiles['api-payg'].apiKey) {
    profiles['api-payg'].apiKey = legacy.trim()
    saveAiProfiles(profiles)
    localStorage.removeItem(LEGACY_KEY_STORAGE)
  }
  return profiles
}

export function saveAiProfiles(profiles: Record<AiProfileId, AiEndpointProfile>): void {
  localStorage.setItem(PROFILES_STORAGE, JSON.stringify(profiles))
}

export function getActiveAiProfileId(): AiProfileId {
  const v = localStorage.getItem(ACTIVE_PROFILE_STORAGE)
  return v === 'token-plan' || v === 'api-payg' ? v : 'api-payg'
}

export function setActiveAiProfileId(id: AiProfileId): void {
  localStorage.setItem(ACTIVE_PROFILE_STORAGE, id)
}

/** 当前激活方案的端点 */
export function getAiApiBase(): string {
  return getAiProfiles()[getActiveAiProfileId()].baseUrl
}

/** 当前激活方案的 Key */
export function getAiApiKey(): string {
  return getAiProfiles()[getActiveAiProfileId()].apiKey
}

/** 写入当前激活方案的 Key */
export function setAiApiKey(key: string): void {
  const profiles = getAiProfiles()
  const id = getActiveAiProfileId()
  profiles[id].apiKey = key.trim()
  saveAiProfiles(profiles)
}

export function clearAiApiKey(): void {
  setAiApiKey('')
}

/** 连接测试：最小 chat 请求探测端点 + Key 是否可用 */
export async function testAiConnection(baseUrl: string, apiKey: string, model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'reply OK' }],
        max_tokens: 2,
        enable_thinking: false,
      }),
    })
    if (res.ok) return { ok: true, message: '连接成功' }
    const data: unknown = await res.json().catch(() => null)
    const msg = (data as { error?: { message?: string } } | null)?.error?.message
    return { ok: false, message: msg || `请求失败（${res.status}）` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : '网络错误' }
  }
}

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

  const response = await fetch(`${getAiApiBase()}/chat/completions`, {
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

/**
 * 「生成新图」模式的系统提示词：从零生成，不依赖当前代码。
 */
export function buildGenerateSystemPrompt(options: { withSkill: boolean }): string {
  const lines: string[] = ['你是 Mermaid 图表平台内置的 AI 生成助手。']
  if (options.withSkill) {
    lines.push('', '下面是平台的自定义样式 Skill 文档，生成时必须遵守：', '', SKILL_MD.trim(), '')
  }
  lines.push(
    '工作方式：',
    '1. 按用户的描述从零生成一份完整的 Mermaid 图，不要依赖任何已有代码。',
    '2. 将完整代码放在一个 ```mermaid 代码块中返回，代码块外只允许极简的说明。',
    '3. 如无特殊说明，不要使用 blink 闪烁动画；需要强调时优先 pulse 或连线动画。'
  )
  return lines.join('\n')
}

// ─── 图生图（VL） ────────────────────────────────────────────────

const VL_MODEL_KEY = 'ai-vl-model'
const VL_PREFERRED = ['qwen3-vl-plus', 'qwen-vl-max-latest', 'qwen-vl-max', 'qwen2.5-vl-72b-instruct']

/** 发现可用的视觉模型（缓存到 localStorage，失败回退偏好列表首项） */
export async function discoverVisionModel(apiKey: string): Promise<string> {
  const cached = localStorage.getItem(VL_MODEL_KEY)
  if (cached) return cached
  try {
    const res = await fetch(`${getAiApiBase()}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = (await res.json()) as { data?: Array<{ id: string }> }
      const ids = (data.data ?? []).map((m) => m.id).filter((id) => /vl/i.test(id))
      for (const pref of VL_PREFERRED) {
        if (ids.includes(pref)) {
          localStorage.setItem(VL_MODEL_KEY, pref)
          return pref
        }
      }
      if (ids.length > 0) {
        localStorage.setItem(VL_MODEL_KEY, ids[0])
        return ids[0]
      }
    }
  } catch {
    // 发现失败走默认
  }
  return VL_PREFERRED[0]
}

/** 视觉请求：图片 + 文本 → 模型回复（非流式） */
export async function requestVisionCompletion(options: {
  apiKey: string
  model: string
  imageDataUrl: string
  prompt: string
  signal?: AbortSignal
}): Promise<string> {
  const response = await fetch(`${getAiApiBase()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: options.prompt },
            { type: 'image_url', image_url: { url: options.imageDataUrl } },
          ],
        },
      ],
      temperature: 0.4,
    }),
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`)
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content ?? ''
  if (!content.trim()) throw new Error('模型未返回有效内容')
  return content
}

/**
 * 多轮上下文压缩：把滑出窗口的旧轮次（+ 已有摘要）压成 ≤150 字摘要。
 * 用 flash 模型、关思考，失败由调用方静默忽略。
 */
export async function summarizeSessionTurns(options: {
  apiKey: string
  previousSummary: string
  turns: Array<{ role: string; content: string }>
}): Promise<string> {
  const body = [
    options.previousSummary ? `已有摘要：${options.previousSummary}\n` : '',
    '对话内容：',
    ...options.turns.map((t) => `${t.role === 'user' ? '用户' : 'AI'}：${t.content.slice(0, 300)}`),
  ].join('\n')
  const result = await requestAiCompletion({
    apiKey: options.apiKey,
    model: 'qwen3.7-flash',
    thinking: false,
    messages: [
      {
        role: 'system',
        content: '你是对话摘要器。用不超过150字概括下列对话的要点与结论，直接输出摘要文本。',
      },
      { role: 'user', content: body },
    ],
  })
  return result.content.trim()
}
