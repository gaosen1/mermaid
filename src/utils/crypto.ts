/**
 * 使用 SHA-256 计算内容的 checksum
 */
export async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 计算对象的 checksum（先序列化为 JSON）
 */
export async function calculateObjectChecksum(obj: unknown): Promise<string> {
  const content = JSON.stringify(obj, Object.keys(obj as object).sort())
  return calculateChecksum(content)
}
