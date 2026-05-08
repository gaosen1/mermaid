export function isSvgSource(value: string): boolean {
  const trimmed = value.trim()
  return /^<svg[\s>]/i.test(trimmed) && /<\/svg>\s*$/i.test(trimmed)
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, [contenteditable="true"], .cm-editor'))
}

export function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
}

export function getSvgClipboardFile(clipboardData: DataTransfer): File | null {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== 'file') continue

    const file = item.getAsFile()
    if (file && isSvgFile(file)) {
      return file
    }
  }

  return Array.from(clipboardData.files).find(isSvgFile) ?? null
}
