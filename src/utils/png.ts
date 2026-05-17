import type { DiagramType } from '@/types'

// ─── 图片类型判断 ────────────────────────────────────────────────────────────

export function isImageType(type: DiagramType | undefined): type is 'png' | 'jpg' | 'webp' {
  return type === 'png' || type === 'jpg' || type === 'webp'
}

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i

export function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.includes(file.type) || IMAGE_EXTENSIONS.test(file.name)
}

/** 从 data URL 判断图片格式，返回对应的 DiagramType */
export function getImageTypeFromDataUrl(dataUrl: string): 'png' | 'jpg' | 'webp' | null {
  if (/^data:image\/png;base64,/i.test(dataUrl)) return 'png'
  if (/^data:image\/jpe?g;base64,/i.test(dataUrl)) return 'jpg'
  if (/^data:image\/webp;base64,/i.test(dataUrl)) return 'webp'
  return null
}

/** 判断字符串是否是合法的图片 data URL（PNG / JPG / WebP） */
export function isImageSource(value: string): boolean {
  return getImageTypeFromDataUrl(value.trim()) !== null
}

/** 从剪贴板获取图片文件（PNG / JPG / WebP） */
export function getImageClipboardFile(clipboardData: DataTransfer): File | null {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isImageFile(file)) return file
  }
  return Array.from(clipboardData.files).find(isImageFile) ?? null
}

// ─── 兼容旧接口（PNG only） ──────────────────────────────────────────────────

export function isPngFile(file: File): boolean {
  return file.type === 'image/png' || /\.png$/i.test(file.name)
}

export function isPngSource(value: string): boolean {
  return /^data:image\/png;base64,/i.test(value.trim())
}

export function getPngClipboardFile(clipboardData: DataTransfer): File | null {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isPngFile(file)) return file
  }
  return Array.from(clipboardData.files).find(isPngFile) ?? null
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

export function hasClipboardFiles(clipboardData: DataTransfer): boolean {
  return (
    Array.from(clipboardData.types).includes('Files') ||
    Array.from(clipboardData.items).some((item) => item.kind === 'file') ||
    clipboardData.files.length > 0
  )
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const { mimeType, base64 } = parseImageDataUrl(dataUrl)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export function getPngDataUrlBase64(dataUrl: string): string {
  return parseImageDataUrl(dataUrl).base64
}

function parseImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = header.match(/^data:(image\/(?:png|jpe?g|webp));base64$/i)
  if (!mimeMatch || !base64) throw new Error('Invalid image data URL')
  return { mimeType: mimeMatch[1], base64 }
}
