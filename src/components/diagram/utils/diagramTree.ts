import type { Diagram, DiagramFolder } from '@/types'

export type ContainerItemKind = 'folder' | 'diagram'

export interface ContainerItem {
  kind: ContainerItemKind
  id: string
  order: number
}

export interface FolderNode {
  type: 'folder'
  folder: DiagramFolder
  children: TreeNode[]
}

export interface DiagramNode {
  type: 'diagram'
  diagram: Diagram
}

export type TreeNode = FolderNode | DiagramNode

/** 返回某容器层级内所有条目（文件夹 + 图表），按 order 混排 */
export function getContainerItems(
  diagrams: Diagram[],
  folders: DiagramFolder[],
  parentId: string | null
): ContainerItem[] {
  const items: ContainerItem[] = []

  for (const f of folders) {
    if ((f.parentId ?? null) === parentId) {
      items.push({ kind: 'folder', id: f.id, order: f.order ?? 0 })
    }
  }
  for (const d of diagrams) {
    if ((d.folderId ?? null) === parentId) {
      items.push({ kind: 'diagram', id: d.id, order: d.order ?? 0 })
    }
  }

  return items.sort((a, b) => a.order - b.order)
}

/** 构建渲染树，同层按 order 混排 */
export function buildTree(
  diagrams: Diagram[],
  folders: DiagramFolder[],
  parentId: string | null = null
): TreeNode[] {
  const items = getContainerItems(diagrams, folders, parentId)

  return items.map((item) => {
    if (item.kind === 'folder') {
      const folder = folders.find((f) => f.id === item.id)!
      return {
        type: 'folder' as const,
        folder,
        children: buildTree(diagrams, folders, folder.id),
      }
    } else {
      const diagram = diagrams.find((d) => d.id === item.id)!
      return { type: 'diagram' as const, diagram }
    }
  })
}

/** 判断 id 是图表还是文件夹，返回其所属容器 */
export function getContainerOf(
  id: string,
  diagrams: Diagram[],
  folders: DiagramFolder[]
): string | null {
  const d = diagrams.find((x) => x.id === id)
  if (d) return d.folderId ?? null
  const f = folders.find((x) => x.id === id)
  if (f) return f.parentId ?? null
  return null
}

/** 判断 id 属于文件夹还是图表 */
export function getItemKind(
  id: string,
  diagrams: Diagram[],
  folders: DiagramFolder[]
): ContainerItemKind | null {
  if (diagrams.some((d) => d.id === id)) return 'diagram'
  if (folders.some((f) => f.id === id)) return 'folder'
  return null
}
