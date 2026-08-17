import { saveAs } from 'file-saver'
import { parseFrontmatter, parseExtendedDSL } from './dsl'

/**
 * 外带/分享工具：把平台自定义产物转换成其他平台（语雀、钉钉文档等）
 * 可直接使用的标准格式，以及剪贴板图片复制能力。
 */

// ─── 标准化 Mermaid ──────────────────────────────────────────────────────────

/**
 * 将含平台自定义 DSL 的 mermaid 源码转换为标准 mermaid：
 * - 剥离平台 frontmatter
 * - NODE@{...} 转译为原生 style/class 指令（复用渲染管线）
 * - 剔除平台专属内容：animation-* class 指令、linkStyle 中的平台动画属性
 * 产物保留颜色/边框等静态样式，任何标准 mermaid 环境均可渲染。
 */
export function toStandardMermaid(source: string): string {
  const { content } = parseFrontmatter(source)
  const { source: transpiled } = parseExtendedDSL(content)
  return stripPlatformOnlyDirectives(transpiled)
}

/** 动画 class 指令依赖平台注入的 CSS keyframes，外带后无意义 */
const ANIMATION_CLASS_LINE = /^\s*class\s+\S+\s+animation-[\w-]+\s*;?\s*$/

function stripPlatformOnlyDirectives(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      if (ANIMATION_CLASS_LINE.test(line)) return null
      if (/^\s*linkStyle\s/.test(line)) return stripLinkStyleAnimations(line)
      return line
    })
    .filter((line): line is string => line !== null)
    .join('\n')
    .trim()
}

/** linkStyle 属性按逗号分隔，剔除 animation:mermaid-edge-dash* 等平台动画段 */
function stripLinkStyleAnimations(line: string): string {
  const match = line.match(/^(\s*linkStyle\s+[^:]*?:)(.*)$/)
  if (!match) return line
  const props = match[2]
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^animation:/.test(p))
  if (props.length === 0) return match[1].trim()
  return `${match[1].trimEnd()}${props.join(',')}`
}

// ─── 标准化 Markdown 文档 ────────────────────────────────────────────────────

/**
 * 将平台的 Markdown 图文混排文档转换为可外带版本：
 * 内嵌的 ```mermaid 块逐个标准化，其余文本原样保留。
 */
export function toPortableMarkdown(source: string): string {
  const lines = source.split('\n')
  const result: string[] = []
  let inMermaid = false
  let fenceTicks = 0
  let blockLines: string[] = []

  for (const line of lines) {
    if (!inMermaid) {
      const open = line.match(/^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/)
      if (open) {
        inMermaid = true
        fenceTicks = open[2].length
        blockLines = []
        result.push('```mermaid')
        continue
      }
      result.push(line)
      continue
    }

    // 闭合围栏：同类型、长度不小于开启围栏、无信息串
    const close = line.match(/^\s*(`{3,}|~{3,})\s*$/)
    if (close && close[1][0] === '`' && close[1].length >= fenceTicks) {
      result.push(toStandardMermaid(blockLines.join('\n')))
      result.push('```')
      inMermaid = false
      blockLines = []
      continue
    }
    blockLines.push(line)
  }

  // 未闭合的 mermaid 块兜底：按已有内容标准化输出
  if (inMermaid) {
    result.push(toStandardMermaid(blockLines.join('\n')))
    result.push('```')
  }

  return result.join('\n')
}

// ─── 剪贴板 ─────────────────────────────────────────────────────────────────

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/**
 * 复制图片 blob 到剪贴板。返回 false 表示浏览器不支持
 * （调用方应回退为下载）。
 */
export async function copyImageToClipboard(blob: Blob, mimeType: string): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })])
    return true
  } catch {
    return false
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  saveAs(blob, fileName)
}
