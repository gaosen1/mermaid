import type { EdgeStyle } from './edgeDsl'
import type { NodeStyle } from './nodeDsl'

/**
 * 时序图 DSL 解析与写回
 *
 * 语法：
 * - 参与者样式：participant|actor ID@{fill:#..;stroke:#..;color:#..;stroke-width:2px;stroke-style:dotted} [as 别名]
 * - 消息样式：msgStyle N stroke:#..,stroke-width:2px,stroke-dasharray:5 5,animation:<平台连线动画值>
 *   N 为消息出现顺序（与 flowchart 的 linkStyle 同约定）
 */

export interface SequenceParticipantStyle {
  fill?: string
  stroke?: string
  color?: string
  strokeWidth?: string
  strokeDasharray?: string
}

export interface SequenceParticipant {
  id: string
  alias: string | null
  declIndex: number
  style: SequenceParticipantStyle | null
  lineIndex: number
}

const PARTICIPANT_RE =
  /^\s*(?:participant|actor)\s+([A-Za-z0-9_]+)\s*(?:@\{([^}]*)\})?\s*(?:as\s+(.+?))?\s*$/
const MSG_STYLE_RE = /^\s*msgStyle\s+(\d+)\s+(.+)$/

function parseSeqStyle(raw: string): SequenceParticipantStyle {
  const style: SequenceParticipantStyle = {}
  const fill = raw.match(/fill:\s*([^;}\s]+)/)
  if (fill) style.fill = fill[1]
  const stroke = raw.match(/(?<![a-z-])stroke:\s*([^;}\s]+)/i)
  if (stroke) style.stroke = stroke[1]
  const color = raw.match(/color:\s*([^;}\s]+)/)
  if (color) style.color = color[1]
  const width = raw.match(/stroke-width:\s*([^;}\s]+)/)
  if (width) style.strokeWidth = width[1]
  const strokeStyle = raw.match(/stroke-style:\s*(\w+)/)
  if (strokeStyle) {
    if (strokeStyle[1] === 'dotted') style.strokeDasharray = '5 5'
    if (strokeStyle[1] === 'thick') style.strokeWidth = '3px'
  }
  return style
}

/** 解析全部 participant/actor 声明（含 @{} 样式与别名） */
export function parseSequenceParticipants(source: string): SequenceParticipant[] {
  const lines = source.split('\n')
  const result: SequenceParticipant[] = []
  lines.forEach((line, lineIndex) => {
    const m = line.match(PARTICIPANT_RE)
    if (!m) return
    result.push({
      id: m[1],
      alias: m[3] ?? null,
      declIndex: result.length,
      style: m[2] ? parseSeqStyle(m[2]) : null,
      lineIndex,
    })
  })
  return result
}

export interface SequenceMsgStyle {
  index: number
  css: string
}

/** 解析全部 msgStyle 行 */
export function parseSequenceMsgStyles(source: string): SequenceMsgStyle[] {
  const result: SequenceMsgStyle[] = []
  for (const line of source.split('\n')) {
    const m = line.match(MSG_STYLE_RE)
    if (m) result.push({ index: Number(m[1]), css: m[2].trim() })
  }
  return result
}

/** 一次性解析参与者样式与消息样式（对照 edgeDsl 的 parseAllEdgeStylesFromSource） */
export function parseSequenceStylesFromSource(source: string): {
  participants: SequenceParticipant[]
  msgStyles: SequenceMsgStyle[]
} {
  return {
    participants: parseSequenceParticipants(source),
    msgStyles: parseSequenceMsgStyles(source),
  }
}

/** msgStyle 的 css 串 → EdgeStyle（复用 EdgeStylePanel / applyEdgeStyleToElement） */
export function msgCssToEdgeStyle(css: string): EdgeStyle {
  const style: EdgeStyle = {}
  const color = css.match(/(?<![a-z-])stroke:\s*([^,;]+)/i)
  if (color) style.color = color[1].trim()
  if (/stroke-dasharray/.test(css)) style.stroke = 'dotted'
  else {
    const w = css.match(/stroke-width:\s*(\d+)px/)
    if (w && parseInt(w[1]) >= 2) style.stroke = 'thick'
  }
  const anim = css.match(/animation:\s*mermaid-edge-dash-leader\s+([\d.]+)s/)
  if (anim) {
    style.animation = parseFloat(anim[1]) <= 1.5 ? 'fast-leader' : 'slow-leader'
  } else {
    const dash = css.match(/animation:\s*mermaid-edge-dash\s+([\d.]+)s/)
    if (dash) style.animation = parseFloat(dash[1]) <= 1 ? 'fast' : 'slow'
  }
  return style
}

/** EdgeStyle → msgStyle 的 css 串（与平台连线动画值保持一致） */
export function edgeStyleToMsgCss(style: EdgeStyle): string {
  const parts: string[] = []
  if (style.color) parts.push(`stroke:${style.color}`)
  switch (style.stroke) {
    case 'dotted':
      parts.push('stroke-dasharray:5 5', 'stroke-width:1px')
      break
    case 'thick':
      parts.push('stroke-width:2px')
      break
    default:
      break
  }
  switch (style.animation) {
    case 'slow':
      parts.push('animation:mermaid-edge-dash 1.5s linear infinite')
      break
    case 'fast':
      parts.push('animation:mermaid-edge-dash 0.6s linear infinite')
      break
    case 'slow-leader':
      parts.push('animation:mermaid-edge-dash-leader 3s linear infinite')
      break
    case 'fast-leader':
      parts.push('animation:mermaid-edge-dash-leader 1.2s linear infinite')
      break
    default:
      break
  }
  return parts.join(',')
}

/**
 * 渲染前剥离时序图 DSL：移除 msgStyle 行、participant 行上的 @{}，
 * 避免 mermaid 原生解析报错（须在通用节点 @{} 转译之前调用）。
 */
export function stripSequenceDSL(source: string): string {
  return source
    .split('\n')
    .filter((l) => !MSG_STYLE_RE.test(l))
    .map((l) => l.replace(/^(\s*(?:participant|actor)\s+[A-Za-z0-9_]+)\s*@\{[^}]*\}/, '$1'))
    .join('\n')
}

function seqStyleToRaw(style: SequenceParticipantStyle): string {
  const parts: string[] = []
  if (style.fill) parts.push(`fill:${style.fill}`)
  if (style.stroke) parts.push(`stroke:${style.stroke}`)
  if (style.color) parts.push(`color:${style.color}`)
  if (style.strokeWidth) parts.push(`stroke-width:${style.strokeWidth}`)
  if (style.strokeDasharray) parts.push('stroke-style:dotted')
  return parts.join(';')
}

/** 写回参与者样式：已有 @{} 则合并替换；无则插入；无声明则在首次使用行前补声明 */
export function updateSourceWithParticipantStyle(
  source: string,
  participantId: string,
  style: SequenceParticipantStyle
): string {
  const raw = seqStyleToRaw(style)
  const lines = source.split('\n')
  const declRe = new RegExp(`^(\\s*(?:participant|actor)\\s+${participantId}\\b)(.*?)(@\\{[^}]*\\})?(.*)$`)

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(declRe)
    if (!m) continue
    if (!raw) {
      lines[i] = `${m[1]}${m[2]}${m[4]}`.trimEnd()
    } else {
      lines[i] = `${m[1]}${m[2]}@{${raw}}${m[4]}`
    }
    return lines.join('\n')
  }

  if (!raw) return source

  // 无声明：在 id 首次作为消息端点出现的行前插入声明
  const useRe = new RegExp(`^\\s*${participantId}\\s*(-[x)]?>>?|>>|--)|^\\s*\\S+\\s*-[x)]?>>?\\s*${participantId}\\b`)
  for (let i = 0; i < lines.length; i++) {
    if (useRe.test(lines[i])) {
      lines.splice(i, 0, `participant ${participantId}@{${raw}}`)
      return lines.join('\n')
    }
  }
  // 兜底：追加到 sequenceDiagram 头行后
  const headIdx = lines.findIndex((l) => /^\s*sequenceDiagram/.test(l))
  lines.splice(headIdx + 1, 0, `participant ${participantId}@{${raw}}`)
  return lines.join('\n')
}

/** 写回消息样式：替换或追加 msgStyle 行 */
export function updateSourceWithMsgStyle(source: string, index: number, style: EdgeStyle): string {
  const css = edgeStyleToMsgCss(style)
  const lines = source.split('\n')
  const lineRe = new RegExp(`^\\s*msgStyle\\s+${index}\\s+`)

  if (!css) {
    return lines.filter((l) => !lineRe.test(l)).join('\n')
  }

  let replaced = false
  const next = lines.map((l) => {
    if (lineRe.test(l)) {
      replaced = true
      return `msgStyle ${index} ${css}`
    }
    return l
  })
  if (!replaced) next.push(`msgStyle ${index} ${css}`)
  return next.join('\n')
}

/** 首非空行为 sequenceDiagram 则视为时序图 */
export function isSequenceDiagramSource(source: string): boolean {
  const first = source.split('\n').find((l) => l.trim().length > 0)
  return /^sequenceDiagram\b/.test(first?.trim() ?? '')
}

/** SequenceParticipantStyle → NodeStyle（复用 NodeStylePanel） */
export function seqStyleToNodeStyle(s: SequenceParticipantStyle): NodeStyle {
  const style: NodeStyle = { fill: s.fill, stroke: s.stroke, color: s.color }
  if (s.strokeDasharray) style.strokeType = 'dotted'
  else if (s.strokeWidth && parseInt(s.strokeWidth) >= 3) style.strokeType = 'thick'
  return style
}

/** NodeStyle → SequenceParticipantStyle */
export function nodeStyleToSeqStyle(s: NodeStyle): SequenceParticipantStyle {
  const style: SequenceParticipantStyle = { fill: s.fill, stroke: s.stroke, color: s.color }
  if (s.strokeType === 'dotted') style.strokeDasharray = '5 5'
  if (s.strokeType === 'thick') style.strokeWidth = '3px'
  return style
}

/** 写回参与者别名（as 部分）；无 as 时追加 */
export function updateSourceWithParticipantAlias(
  source: string,
  participantId: string,
  newAlias: string
): string {
  const lines = source.split('\n')
  const declRe = new RegExp(`^(\\s*(?:participant|actor)\\s+${participantId}\\b)([^\\n]*?)(?:as\\s+.+?)?\\s*$`)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(declRe)
    if (!m) continue
    const cleaned = newAlias.replace(/\u200B/g, '').trim()
    if (!cleaned) return source
    lines[i] = `${m[1]}${m[2]}as ${cleaned}`
    return lines.join('\n')
  }
  return source
}
