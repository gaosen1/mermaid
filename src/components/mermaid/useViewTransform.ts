/**
 * 缩放和平移 Hook
 */

import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import { VIEW_CONFIG } from './constants'

interface Position {
  x: number
  y: number
}

interface UseViewTransformOptions {
  wrapperRef: RefObject<HTMLDivElement | null>
  containerRef: RefObject<HTMLDivElement | null>
}

interface UseViewTransformReturn {
  scale: number
  position: Position
  isDragging: boolean
  handleMouseDown: (e: React.MouseEvent) => void
  handleMouseMove: (e: React.MouseEvent) => void
  handleMouseUp: () => void
  resetView: () => void
  fitToContainer: () => void
}

/**
 * 计算适应容器的缩放和位置
 */
function calculateFitTransform(
  svgWidth: number,
  svgHeight: number,
  wrapperRect: DOMRect
): { scale: number; position: Position } {
  const availableWidth = wrapperRect.width - VIEW_CONFIG.PADDING
  const availableHeight = wrapperRect.height - VIEW_CONFIG.PADDING

  const scaleX = availableWidth / svgWidth
  const scaleY = availableHeight / svgHeight
  const fitScale = Math.min(scaleX, scaleY, 1)

  const scaledWidth = svgWidth * fitScale
  const scaledHeight = svgHeight * fitScale

  return {
    scale: fitScale,
    position: {
      x: (wrapperRect.width - scaledWidth) / 2 + VIEW_CONFIG.HORIZONTAL_CENTER_OFFSET,
      y: (wrapperRect.height - scaledHeight) / 2,
    },
  }
}

/**
 * 获取 SVG 原始尺寸
 */
function getSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal
  return {
    width: viewBox.width || svg.width.baseVal.value,
    height: viewBox.height || svg.height.baseVal.value,
  }
}

export function useViewTransform({
  wrapperRef,
  containerRef,
}: UseViewTransformOptions): UseViewTransformReturn {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })

  // 使用 ref 存储最新值，避免闭包问题
  const scaleRef = useRef(scale)
  const positionRef = useRef(position)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  /** 适应容器大小 */
  const fitToContainer = useCallback(() => {
    if (!containerRef.current || !wrapperRef.current) return

    const svg = containerRef.current.querySelector('svg') as SVGSVGElement
    if (!svg) return

    const wrapperRect = wrapperRef.current.getBoundingClientRect()
    const { width, height } = getSvgDimensions(svg)
    const { scale: newScale, position: newPosition } = calculateFitTransform(width, height, wrapperRect)

    setScale(newScale)
    setPosition(newPosition)
  }, [containerRef, wrapperRef])

  /** 重置视图 */
  const resetView = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })

    // 等待状态更新后重新计算适应尺寸
    requestAnimationFrame(() => {
      requestAnimationFrame(fitToContainer)
    })
  }, [fitToContainer])

  /** 滚轮缩放 */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const rect = wrapper.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const oldScale = scaleRef.current
    const oldPosition = positionRef.current

    const factor = e.deltaY > 0 ? VIEW_CONFIG.ZOOM_OUT_FACTOR : VIEW_CONFIG.ZOOM_IN_FACTOR
    const newScale = Math.min(Math.max(oldScale * factor, VIEW_CONFIG.MIN_SCALE), VIEW_CONFIG.MAX_SCALE)
    const ratio = newScale / oldScale

    // 以鼠标位置为中心缩放
    setScale(newScale)
    setPosition({
      x: mouseX - (mouseX - oldPosition.x) * ratio,
      y: mouseY - (mouseY - oldPosition.y) * ratio,
    })
  }, [wrapperRef])

  // 绑定滚轮事件
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', handleWheel)
  }, [handleWheel, wrapperRef])

  /** 右键拖拽开始 */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [position])

  /** 拖拽移动 */
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [isDragging, dragStart])

  /** 拖拽结束 */
  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  return {
    scale,
    position,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetView,
    fitToContainer,
  }
}
