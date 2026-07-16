import type { DiagramFolder } from '@/types'

/**
 * 从叶子文件夹向根回溯，返回文件夹名称路径（根 -> 叶子）
 * 对 parentId 环路做防护，避免死循环
 */
export function getFolderPath(
  folderId: string | null | undefined,
  folders: DiagramFolder[]
): string[] {
  if (!folderId) return []

  const map = new Map(folders.map((f) => [f.id, f]))
  const path: string[] = []
  const visited = new Set<string>()

  let current = map.get(folderId)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current.name)
    current = current.parentId ? map.get(current.parentId) : undefined
  }

  return path
}
