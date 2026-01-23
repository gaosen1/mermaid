import { useEffect, useCallback, useState, useRef } from 'react'
import { getNodeIdFromElement, getNodeBounds } from './svgUtils'

export interface SelectedNode {
  id: string // 节点 ID
  element: SVGGElement // g.node 元素
  shape: SVGElement // 形状元素 (rect/polygon/circle)
  text: SVGElement | null // 文字元素
  position: { x: number; y: number } // 点击位置（用于面板定位）
  bounds: { x: number; y: number; width: number; height: number } // 节点边界（用于文字编辑器）
}

interface UseNodeSelectionOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  wrapperRef: React.RefObject<HTMLDivElement | null>
  enabled?: boolean
  onSelect?: (node: SelectedNode | null) => void
  onDoubleClick?: (node: SelectedNode) => void
}

/**
 * 从元素查找节点信息
 */
function findNodeInfo(
  target: Element,
  containerRect: DOMRect
): {
  id: string
  element: SVGGElement
  shape: SVGElement
  text: SVGElement | null
  bounds: { x: number; y: number; width: number; height: number }
} | null {
  // 检查是否点击了节点元素
  const nodeGroup = target.closest('g.node') as SVGGElement | null
  if (!nodeGroup) return null

  const nodeId = getNodeIdFromElement(target)
  if (!nodeId) return null

  // 查找形状和文字元素
  const shape = nodeGroup.querySelector('rect, polygon, circle, ellipse') as SVGElement | null
  if (!shape) return null

  const text = nodeGroup.querySelector('g.label text, text') as SVGElement | null
  const bounds = getNodeBounds(nodeGroup, containerRect)

  return {
    id: nodeId,
    element: nodeGroup,
    shape,
    text,
    bounds,
  }
}

/**
 * 获取点击位置
 */
function getClickPosition(event: MouseEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

/**
 * Node 选中逻辑 Hook
 */
export function useNodeSelection({
  containerRef,
  wrapperRef,
  enabled = true,
  onSelect,
  onDoubleClick,
}: UseNodeSelectionOptions) {
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const lastClickTimeRef = useRef<number>(0)
  const lastClickNodeRef = useRef<string | null>(null)

  // 处理 SVG 点击事件
  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!enabled || !containerRef.current || !wrapperRef.current) {
        return
      }

      const target = event.target as Element

      // 检查是否点击了 edge（避免与 edge 选中冲突）
      if (target.closest('.edge-wrapper') || target.closest('.edgePath')) {
        return
      }

      const containerRect = wrapperRef.current.getBoundingClientRect()
      const nodeInfo = findNodeInfo(target, containerRect)

      if (nodeInfo) {
        const now = Date.now()
        const isDoubleClick =
          lastClickNodeRef.current === nodeInfo.id && now - lastClickTimeRef.current < 300

        lastClickTimeRef.current = now
        lastClickNodeRef.current = nodeInfo.id

        if (isDoubleClick && onDoubleClick && selectedNode) {
          // 双击：触发文字编辑
          onDoubleClick(selectedNode)
          event.stopPropagation()
          return
        }

        // 单击：选中节点
        const node: SelectedNode = {
          id: nodeInfo.id,
          element: nodeInfo.element,
          shape: nodeInfo.shape,
          text: nodeInfo.text,
          position: getClickPosition(event),
          bounds: nodeInfo.bounds,
        }

        // 移除之前的选中状态
        const svg = nodeInfo.element.ownerSVGElement
        if (svg) {
          svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
        }

        // 添加新的选中状态
        nodeInfo.element.classList.add('node-selected')

        selectedIdRef.current = nodeInfo.id
        setSelectedNode(node)
        onSelect?.(node)
        event.stopPropagation()
      } else {
        // 点击了空白区域，取消选中
        if (selectedNode) {
          const svg = containerRef.current?.querySelector('svg')
          if (svg) {
            svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
          }
          selectedIdRef.current = null
          setSelectedNode(null)
          onSelect?.(null)
        }
      }
    },
    [containerRef, wrapperRef, enabled, onSelect, onDoubleClick, selectedNode]
  )

  // 处理 Esc 键关闭
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedNode) {
        if (containerRef.current) {
          const svg = containerRef.current.querySelector('svg')
          if (svg) {
            svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
          }
        }
        selectedIdRef.current = null
        setSelectedNode(null)
        onSelect?.(null)
      }
    },
    [containerRef, selectedNode, onSelect]
  )

  // 重渲染后恢复选中状态
  const restoreSelection = useCallback(() => {
    if (!containerRef.current || !wrapperRef.current || selectedIdRef.current === null) return

    const svg = containerRef.current.querySelector('svg')
    if (!svg) return

    const nodeId = selectedIdRef.current
    const nodeGroup = svg.querySelector(`g.node[id^="flowchart-${nodeId}-"]`) as SVGGElement | null

    if (nodeGroup) {
      // 清除所有选中状态
      svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
      // 恢复选中状态
      nodeGroup.classList.add('node-selected')

      const shape = nodeGroup.querySelector('rect, polygon, circle, ellipse') as SVGElement | null
      const text = nodeGroup.querySelector('g.label text, text') as SVGElement | null
      const containerRect = wrapperRef.current.getBoundingClientRect()
      const bounds = getNodeBounds(nodeGroup, containerRect)

      if (shape) {
        setSelectedNode((prev) => ({
          id: nodeId,
          element: nodeGroup,
          shape,
          text,
          position: prev?.position || { x: 0, y: 0 },
          bounds,
        }))
      }
    } else {
      // 节点不存在，清除选中
      selectedIdRef.current = null
      setSelectedNode(null)
      onSelect?.(null)
    }
  }, [containerRef, wrapperRef, onSelect])

  // 清除选中状态
  const clearSelection = useCallback(() => {
    if (containerRef.current) {
      const svg = containerRef.current.querySelector('svg')
      if (svg) {
        svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
      }
    }
    selectedIdRef.current = null
    setSelectedNode(null)
    onSelect?.(null)
  }, [containerRef, onSelect])

  // 绑定事件监听
  const bindEvents = useCallback(() => {
    const container = containerRef.current
    if (!container || !enabled) return () => {}

    container.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, enabled, handleClick, handleKeyDown])

  // 自动绑定事件
  useEffect(() => {
    return bindEvents()
  }, [bindEvents])

  return {
    selectedNode,
    restoreSelection,
    clearSelection,
    bindEvents,
  }
}
