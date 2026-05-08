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
    if (file && isPngFile(file)) {
      return file
    }
  }

  return Array.from(clipboardData.files).find(isPngFile) ?? null
}

export function hasClipboardFiles(clipboardData: DataTransfer): boolean {
  return Array.from(clipboardData.types).includes('Files') ||
    Array.from(clipboardData.items).some((item) => item.kind === 'file') ||
    clipboardData.files.length > 0
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
  const { mimeType, base64 } = parsePngDataUrl(dataUrl)

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Blob([bytes], { type: mimeType })
}

export function getPngDataUrlBase64(dataUrl: string): string {
  return parsePngDataUrl(dataUrl).base64
}

function parsePngDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = header.match(/^data:(image\/png);base64$/i)
  if (!mimeMatch || !base64) {
    throw new Error('Invalid PNG data URL')
  }

  return { mimeType: mimeMatch[1], base64 }
}
