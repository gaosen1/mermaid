import { useEffect, useCallback, useState, useRef } from 'react'
import {
  getNodeIdFromElement,
  getSubgraphIdFromElement,
  getNodeBounds,
  type NodeType,
} from './svgUtils'

export interface SelectedNode {
  id: string // 节点 ID
  type: NodeType // 节点类型：'node' | 'subgraph'
  element: SVGGElement // g.node 或 g.cluster 元素
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
 * 从元素查找普通节点信息
 */
function findNodeInfo(
  target: Element,
  containerRect: DOMRect
): {
  id: string
  type: NodeType
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
    type: 'node',
    element: nodeGroup,
    shape,
    text,
    bounds,
  }
}

/**
 * 从元素查找 subgraph 信息
 */
function findSubgraphInfo(
  target: Element,
  containerRect: DOMRect
): {
  id: string
  type: NodeType
  element: SVGGElement
  shape: SVGElement
  text: SVGElement | null
  bounds: { x: number; y: number; width: number; height: number }
} | null {
  // 检查是否点击了 cluster-label 元素
  const clusterLabel = target.closest('.cluster-label') as SVGGElement | null
  if (!clusterLabel) return null

  // 获取父级 g.cluster 元素
  const clusterGroup = clusterLabel.closest('g.cluster') as SVGGElement | null
  if (!clusterGroup) return null

  const subgraphId = getSubgraphIdFromElement(target)
  if (!subgraphId) return null

  // 查找形状元素（subgraph 的背景 rect）
  const shape = clusterGroup.querySelector('rect') as SVGElement | null
  if (!shape) return null

  // 文字元素在 cluster-label 内
  const text = clusterLabel.querySelector('text') as SVGElement | null
  const bounds = getNodeBounds(clusterLabel, containerRect)

  return {
    id: subgraphId,
    type: 'subgraph',
    element: clusterGroup,
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

// 双击检测延迟（毫秒）
const DOUBLE_CLICK_DELAY = 250

/**
 * Node 选中逻辑 Hook
 *
 * 使用延迟机制区分单击和双击：
 * - 单击：延迟后触发 onSelect，显示 NodeStylePanel
 * - 双击：立即触发 onDoubleClick，不触发 onSelect
 *
 * 支持普通节点和 subgraph
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
  const selectedTypeRef = useRef<NodeType | null>(null)

  // 用于双击检测
  const clickTimerRef = useRef<number | null>(null)
  const pendingNodeRef = useRef<SelectedNode | null>(null)
  const lastClickTimeRef = useRef<number>(0)
  const lastClickNodeRef = useRef<string | null>(null)

  /**
   * 执行单击选中
   */
  const executeSelect = useCallback((node: SelectedNode) => {
    // 移除之前的选中状态
    const svg = node.element.ownerSVGElement
    if (svg) {
      svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
      svg.querySelectorAll('.subgraph-selected').forEach((el) => el.classList.remove('subgraph-selected'))
    }

    // 添加新的选中状态
    if (node.type === 'subgraph') {
      node.element.classList.add('subgraph-selected')
    } else {
      node.element.classList.add('node-selected')
    }

    selectedIdRef.current = node.id
    selectedTypeRef.current = node.type
    setSelectedNode(node)
    onSelect?.(node)
  }, [onSelect])

  /**
   * 清除待处理的单击
   */
  const clearPendingClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    pendingNodeRef.current = null
  }, [])

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

      // 优先检查 subgraph（因为 subgraph 可能包含普通节点）
      let nodeInfo = findSubgraphInfo(target, containerRect)

      // 如果不是 subgraph，检查普通节点
      if (!nodeInfo) {
        nodeInfo = findNodeInfo(target, containerRect)
      }

      if (nodeInfo) {
        const now = Date.now()
        const isDoubleClick =
          lastClickNodeRef.current === nodeInfo.id &&
          now - lastClickTimeRef.current < DOUBLE_CLICK_DELAY

        lastClickTimeRef.current = now
        lastClickNodeRef.current = nodeInfo.id

        const node: SelectedNode = {
          id: nodeInfo.id,
          type: nodeInfo.type,
          element: nodeInfo.element,
          shape: nodeInfo.shape,
          text: nodeInfo.text,
          position: getClickPosition(event),
          bounds: nodeInfo.bounds,
        }

        if (isDoubleClick) {
          // 双击：取消待处理的单击，直接触发双击
          clearPendingClick()
          event.stopPropagation()

          // 确保节点已选中（用于双击编辑）
          if (selectedIdRef.current !== nodeInfo.id) {
            // 移除之前的选中状态
            const svg = nodeInfo.element.ownerSVGElement
            if (svg) {
              svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
              svg.querySelectorAll('.subgraph-selected').forEach((el) => el.classList.remove('subgraph-selected'))
            }
            if (nodeInfo.type === 'subgraph') {
              nodeInfo.element.classList.add('subgraph-selected')
            } else {
              nodeInfo.element.classList.add('node-selected')
            }
            selectedIdRef.current = nodeInfo.id
            selectedTypeRef.current = nodeInfo.type
            setSelectedNode(node)
          }

          // 触发双击回调
          onDoubleClick?.(node)
          return
        }

        // 单击：延迟执行，等待可能的双击
        // 注意：subgraph 单击不触发 onSelect（不显示样式面板）
        if (nodeInfo.type === 'subgraph') {
          // subgraph 单击不做任何事，只等待双击
          clearPendingClick()
          pendingNodeRef.current = null
          lastClickTimeRef.current = now
          lastClickNodeRef.current = nodeInfo.id
          event.stopPropagation()
          return
        }

        clearPendingClick()
        pendingNodeRef.current = node

        clickTimerRef.current = window.setTimeout(() => {
          if (pendingNodeRef.current) {
            executeSelect(pendingNodeRef.current)
            pendingNodeRef.current = null
          }
          clickTimerRef.current = null
        }, DOUBLE_CLICK_DELAY)

        event.stopPropagation()
      } else {
        // 点击了空白区域，取消选中
        clearPendingClick()

        if (selectedNode) {
          const svg = containerRef.current?.querySelector('svg')
          if (svg) {
            svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
            svg.querySelectorAll('.subgraph-selected').forEach((el) => el.classList.remove('subgraph-selected'))
          }
          selectedIdRef.current = null
          selectedTypeRef.current = null
          setSelectedNode(null)
          onSelect?.(null)
        }
      }
    },
    [containerRef, wrapperRef, enabled, onSelect, onDoubleClick, selectedNode, executeSelect, clearPendingClick]
  )

  // 处理 Esc 键关闭
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedNode) {
        if (containerRef.current) {
          const svg = containerRef.current.querySelector('svg')
          if (svg) {
            svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
            svg.querySelectorAll('.subgraph-selected').forEach((el) => el.classList.remove('subgraph-selected'))
          }
        }
        selectedIdRef.current = null
        selectedTypeRef.current = null
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
    const nodeType = selectedTypeRef.current

    let nodeGroup: SVGGElement | null = null

    if (nodeType === 'subgraph') {
      nodeGroup = svg.querySelector(`g.cluster[id="${nodeId}"]`) as SVGGElement | null
    } else {
      nodeGroup = svg.querySelector(`g.node[id^="flowchart-${nodeId}-"]`) as SVGGElement | null
    }

    if (nodeGroup) {
      // 清除所有选中状态
      svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
      svg.querySelectorAll('.subgraph-selected').forEach((el) => el.classList.remove('subgraph-selected'))

      // 恢复选中状态
      if (nodeType === 'subgraph') {
        nodeGroup.classList.add('subgraph-selected')
      } else {
        nodeGroup.classList.add('node-selected')
      }

      const shape = nodeGroup.querySelector('rect, polygon, circle, ellipse') as SVGElement | null
      const text = nodeType === 'subgraph'
        ? nodeGroup.querySelector('.cluster-label text') as SVGElement | null
        : nodeGroup.querySelector('g.label text, text') as SVGElement | null
      const containerRect = wrapperRef.current.getBoundingClientRect()
      const bounds = getNodeBounds(nodeGroup, containerRect)

      if (shape) {
        setSelectedNode((prev) => ({
          id: nodeId,
          type: nodeType || 'node',
          element: nodeGroup!,
          shape,
          text,
          position: prev?.position || { x: 0, y: 0 },
          bounds,
        }))
      }
    } else {
      // 节点不存在，清除选中
      selectedIdRef.current = null
      selectedTypeRef.current = null
      setSelectedNode(null)
      onSelect?.(null)
    }
  }, [containerRef, wrapperRef, onSelect])

  // 清除选中状态
  const clearSelection = useCallback(() => {
    clearPendingClick()

    if (containerRef.current) {
      const svg = containerRef.current.querySelector('svg')
      if (svg) {
        svg.querySelectorAll('.node-selected').forEach((el) => el.classList.remove('node-selected'))
        svg.querySelectorAll('.subgraph-selected').forEach((el) => el.classList.remove('subgraph-selected'))
      }
    }
    selectedIdRef.current = null
    selectedTypeRef.current = null
    setSelectedNode(null)
    onSelect?.(null)
  }, [containerRef, onSelect, clearPendingClick])

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

  // 清理定时器
  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  return {
    selectedNode,
    restoreSelection,
    clearSelection,
    bindEvents,
  }
}
