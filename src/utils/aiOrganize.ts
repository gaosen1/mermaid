import { getAiApiKey, getStoredAiModel, requestAiCompletion } from './aiChat'
import type { Diagram, DiagramFolder, DiagramType } from '@/types'

/**
 * AI 命名与目录组织工具：复用千问云客户端（aiChat.ts），
 * 统一关闭思考模式以节省 token。
 */

const NAME_SOURCE_LIMIT = 800
const ORG_SUMMARY_LIMIT = 400
// 图片类图表 source 为 dataURL，不参与内容分析
const IMAGE_TYPES: DiagramType[] = ['png', 'jpg', 'webp']
// 内容为文本、可供 AI 命名分析的类型（图片类无法分析）
const AI_NAMEABLE_TYPES: DiagramType[] = ['mermaid', 'markdown', 'html', 'svg', 'txt']

export function isAiNameableType(type: DiagramType): boolean {
  return AI_NAMEABLE_TYPES.includes(type)
}

// ─── AI 命名 ──────────────────────────────────────────────────────────────────

/**
 * 根据图表内容生成 3-5 个候选名称。
 * 未配置 API Key 时抛出「未配置」错误，调用方可据此弹出 Key 配置弹窗。
 */
export async function suggestDiagramNames(options: {
  source: string
  type: DiagramType
  existingNames: string[]
}): Promise<string[]> {
  const apiKey = getAiApiKey()
  if (!apiKey) throw new Error('NEED_API_KEY')

  const content = options.source.trim().slice(0, NAME_SOURCE_LIMIT)
  if (!content) throw new Error('内容为空，无法生成名称')

  const existing = [...new Set(options.existingNames.map((n) => n.trim()).filter(Boolean))]
  const prompt = [
    '你是图表管理助手。根据下面的图表内容，生成 3-5 个候选名称。',
    '要求：',
    '1. 中文为主，每个名称 2-12 个字符，简短概括内容主题，不要使用「流程图」「图表」等泛泛词汇作为全部名称。',
    '2. 不要与已有名称重复或仅有微小差异。',
    '3. 只返回一个 JSON 字符串数组，不要任何解释或代码块标记。',
    existing.length > 0 ? `\n已有名称：${JSON.stringify(existing)}` : '',
    `\n图表类型：${options.type}`,
    '\n图表内容：',
    content,
  ]
    .filter(Boolean)
    .join('\n')

  const reply = await requestAiCompletion({
    apiKey,
    model: getStoredAiModel(),
    messages: [{ role: 'user', content: prompt }],
    thinking: false,
  })

  const names = parseJsonArray(reply.content)
  if (names.length === 0) throw new Error('模型未返回有效名称')
  return names
}

function parseJsonArray(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed: unknown = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => {
        if (!item || item.length > 40 || seen.has(item)) return false
        seen.add(item)
        return true
      })
      .slice(0, 5)
  } catch {
    return []
  }
}

// ─── AI 目录整理 ──────────────────────────────────────────────────────────────

export interface OrganizationMove {
  diagramId: string
  diagramName: string
  /** 目标文件夹路径（如「架构/前端」），null 表示根目录 */
  targetPath: string | null
  fromPath: string | null
}

export interface OrganizationProposal {
  moves: OrganizationMove[]
}

/** 文件夹 id → 路径（「a/b」形式，根目录为 null） */
export function buildFolderPaths(folders: DiagramFolder[]): Map<string, string> {
  const paths = new Map<string, string>()
  const resolve = (id: string): string => {
    const cached = paths.get(id)
    if (cached !== undefined) return cached
    const folder = folders.find((f) => f.id === id)
    if (!folder) return ''
    const parent = folder.parentId ? resolve(folder.parentId) : ''
    const path = parent ? `${parent}/${folder.name}` : folder.name
    paths.set(id, path)
    return path
  }
  folders.forEach((f) => resolve(f.id))
  return paths
}

/**
 * 让 AI 基于全部图表内容生成目录分类方案。
 * 未配置 API Key 时抛出「NEED_API_KEY」错误。
 */
export async function proposeOrganization(options: {
  diagrams: Diagram[]
  folders: DiagramFolder[]
}): Promise<OrganizationProposal> {
  const apiKey = getAiApiKey()
  if (!apiKey) throw new Error('NEED_API_KEY')

  const { diagrams, folders } = options
  const folderPaths = buildFolderPaths(folders)

  const existingFolders = [...folderPaths.values()].sort()
  const items = diagrams.map((d) => {
    const isImage = IMAGE_TYPES.includes(d.type)
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      folder: d.folderId ? folderPaths.get(d.folderId) ?? null : null,
      summary: isImage ? '' : (d.source ?? '').trim().slice(0, ORG_SUMMARY_LIMIT),
    }
  })

  const prompt = [
    '你是图表库目录整理助手。下面是用户图表库的完整清单（含现有文件夹路径与内容摘要）。',
    '请给出一个目录归类方案，要求：',
    '1. 分类层级最多 2 层，文件夹数量尽量精简（通常 2-6 个）；',
    '2. 优先复用现有文件夹；语义重复的文件夹应合并为一个；',
    '3. 每个图表都必须给出目标位置（folder 为现有或新建文件夹路径，保持根目录时为 null）；',
    '4. 归类依据以内容摘要为准，名称仅作参考；',
    '5. 只返回如下结构的 JSON，不要任何解释或代码块标记：',
    '{"folders":["分类A","分类A/子分类"],"moves":[{"diagramId":"id","folder":"分类A"}]}',
    'folders 为方案中需要的全部文件夹路径（含现有要保留的），moves 的 diagramId 必须与输入一致。',
    `\n现有文件夹：${JSON.stringify(existingFolders)}`,
    `\n图表清单：${JSON.stringify(items)}`,
  ].join('\n')

  const reply = await requestAiCompletion({
    apiKey,
    model: getStoredAiModel(),
    messages: [{ role: 'user', content: prompt }],
    thinking: false,
  })

  return parseOrganizationReply(reply.content, diagrams, folderPaths)
}

function parseOrganizationReply(
  reply: string,
  diagrams: Diagram[],
  folderPaths: Map<string, string>
): OrganizationProposal {
  const jsonMatch = reply.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('模型未返回有效 JSON 方案')

  let parsed: { folders?: unknown; moves?: unknown }
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('模型返回的 JSON 无法解析')
  }

  if (!Array.isArray(parsed.moves)) throw new Error('方案缺少 moves 字段')

  const diagramMap = new Map(diagrams.map((d) => [d.id, d]))
  const validFolders = new Set<string>()
  if (Array.isArray(parsed.folders)) {
    for (const raw of parsed.folders) {
      if (typeof raw !== 'string') continue
      const cleaned = cleanFolderPath(raw)
      if (cleaned && cleaned.split('/').length <= 2) validFolders.add(cleaned)
    }
  }

  const moves: OrganizationMove[] = []
  const seen = new Set<string>()
  for (const raw of parsed.moves as unknown[]) {
    if (!raw || typeof raw !== 'object') continue
    const { diagramId, folder } = raw as { diagramId?: unknown; folder?: unknown }
    if (typeof diagramId !== 'string' || seen.has(diagramId)) continue
    const diagram = diagramMap.get(diagramId)
    if (!diagram) continue
    seen.add(diagramId)

    const targetPath = typeof folder === 'string' ? cleanFolderPath(folder) : null
    // 目标文件夹必须出现在 folders 声明中（根目录除外），否则视为无效
    if (targetPath && !validFolders.has(targetPath)) {
      validFolders.add(targetPath)
    }

    const fromPath = diagram.folderId ? folderPaths.get(diagram.folderId) ?? null : null
    if ((targetPath ?? null) === (fromPath ?? null)) continue
    moves.push({ diagramId, diagramName: diagram.name, targetPath, fromPath })
  }

  if (moves.length === 0) throw new Error('方案没有任何需要移动的图表')
  return { moves }
}

/** 清洗文件夹路径：去首尾空白与斜杠，压缩多余分隔符 */
function cleanFolderPath(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('/')
  return cleaned || null
}
