import { useEffect, useCallback, useState, useRef } from 'react'

export interface SelectedEdge {
  index: number
  element: SVGPathElement
  position: { x: number; y: number }
}

interface UseEdgeSelectionOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  enabled?: boolean
  onSelect?: (edge: SelectedEdge | null) => void
}

/**
 * 从点击目标向上查找 edge path 元素
 * 支持两种 SVG 结构：
 * 1. 旧版: g.edgePath > path.path
 * 2. ELK 布局: g.edge-wrapper > path.edge-hitarea + path.flowchart-link
 */
function findEdgePath(target: Element): { path: SVGPathElement; group: Element; index: number } | null {
  console.log('[useEdgeSelection] findEdgePath called with target:', target.tagName, target.getAttribute('class'))

  // 检查点击的是否是 edge path 或其扩展层
  if (target.tagName === 'path') {
    const classList = target.getAttribute('class') || ''

    // ELK 布局: path.edge-hitarea（透明点击层）
    if (classList.includes('edge-hitarea')) {
      const wrapper = target.closest('g.edge-wrapper')
      if (wrapper) {
        // 找到真实的显示线条
        const realPath = wrapper.querySelector('path.flowchart-link') as SVGPathElement
        if (realPath) {
          const index = parseInt(wrapper.getAttribute('data-edge-index') || '-1', 10)
          console.log('[useEdgeSelection] Found flowchart-link via hitarea, index:', index)
          return { path: realPath, group: wrapper, index }
        }
      }
    }

    // 旧版结构: path.path 在 g.edgePath 内
    if (classList.includes('path')) {
      const edgePathGroup = target.closest('g.edgePath')
      if (edgePathGroup) {
        const svg = target.closest('svg')
        if (svg) {
          const allEdgePaths = svg.querySelectorAll('g.edgePath')
          const index = Array.from(allEdgePaths).indexOf(edgePathGroup)
          console.log('[useEdgeSelection] Found edgePath group, index:', index)
          return { path: target as SVGPathElement, group: edgePathGroup, index }
        }
      }
    }
  }

  console.log('[useEdgeSelection] no edge path found')
  return null
}

/**
 * 获取点击位置（用于 Popover 定位）
 */
function getClickPosition(event: MouseEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

/**
 * Edge 选中逻辑 Hook
 */
export function useEdgeSelection({
  containerRef,
  enabled = true,
  onSelect,
}: UseEdgeSelectionOptions) {
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)
  const selectedIndexRef = useRef<number | null>(null)

  // 处理 SVG 点击事件
  const handleClick = useCallback(
    (event: MouseEvent) => {
      console.log('[useEdgeSelection] handleClick called, enabled:', enabled)
      if (!enabled || !containerRef.current) {
        console.log('[useEdgeSelection] click ignored - enabled:', enabled, 'containerRef:', !!containerRef.current)
        return
      }

      const target = event.target as Element
      console.log('[useEdgeSelection] click target:', target.tagName, target.getAttribute('class'), target)
      const result = findEdgePath(target)

      if (result) {
        // 点击了 edge
        const { path, index } = result

        const edge: SelectedEdge = {
          index,
          element: path,
          position: getClickPosition(event),
        }

        // 移除之前的选中状态
        const svg = path.closest('svg')
        if (svg) {
          svg.querySelectorAll('.edge-selected').forEach((el) => el.classList.remove('edge-selected'))
        }
        // 添加新的选中状态
        path.classList.add('edge-selected')

        selectedIndexRef.current = index
        setSelectedEdge(edge)
        onSelect?.(edge)
        event.stopPropagation()
        console.log('[useEdgeSelection] Edge selected, index:', index)
      } else {
        // 点击了空白区域或其他元素，取消选中
        if (selectedEdge) {
          const svg = containerRef.current?.querySelector('svg')
          if (svg) {
            svg.querySelectorAll('.edge-selected').forEach((el) => el.classList.remove('edge-selected'))
          }
          selectedIndexRef.current = null
          setSelectedEdge(null)
          onSelect?.(null)
          console.log('[useEdgeSelection] Edge deselected')
        }
      }
    },
    [containerRef, enabled, onSelect, selectedEdge]
  )

  // 处理 Esc 键关闭
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedEdge) {
        if (containerRef.current) {
          const allEdges = containerRef.current.querySelectorAll('g.edgePath')
          allEdges.forEach((g) => g.classList.remove('edge-selected'))
        }
        selectedIndexRef.current = null
        setSelectedEdge(null)
        onSelect?.(null)
      }
    },
    [containerRef, selectedEdge, onSelect]
  )

  // 重渲染后恢复选中状态
  const restoreSelection = useCallback(() => {
    if (!containerRef.current || selectedIndexRef.current === null) return

    const allEdges = containerRef.current.querySelectorAll('g.edgePath')
    const index = selectedIndexRef.current

    if (index >= 0 && index < allEdges.length) {
      const group = allEdges[index]
      const path = group.querySelector('path.path') as SVGPathElement | null

      if (path) {
        // 清除所有选中状态
        allEdges.forEach((g) => g.classList.remove('edge-selected'))
        // 恢复选中状态
        group.classList.add('edge-selected')

        // 更新 selectedEdge（保持原有 position）
        setSelectedEdge((prev) => ({
          index,
          element: path,
          position: prev?.position || { x: 0, y: 0 },
        }))
      }
    } else {
      // index 超出范围，清除选中
      selectedIndexRef.current = null
      setSelectedEdge(null)
      onSelect?.(null)
    }
  }, [containerRef, onSelect])

  // 清除选中状态
  const clearSelection = useCallback(() => {
    if (containerRef.current) {
      const allEdges = containerRef.current.querySelectorAll('g.edgePath')
      allEdges.forEach((g) => g.classList.remove('edge-selected'))
    }
    selectedIndexRef.current = null
    setSelectedEdge(null)
    onSelect?.(null)
  }, [containerRef, onSelect])

  // 绑定事件监听 - 返回清理函数
  const bindEvents = useCallback(() => {
    const container = containerRef.current
    console.log('[useEdgeSelection] bindEvents called, container:', container, 'enabled:', enabled)
    if (!container || !enabled) return () => {}

    console.log('[useEdgeSelection] Adding click event listener to container')
    container.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      console.log('[useEdgeSelection] Removing click event listener')
      container.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, enabled, handleClick, handleKeyDown])

  // 自动绑定事件（首次渲染）
  useEffect(() => {
    return bindEvents()
  }, [bindEvents])

  return {
    selectedEdge,
    restoreSelection,
    clearSelection,
    bindEvents,
  }
}
