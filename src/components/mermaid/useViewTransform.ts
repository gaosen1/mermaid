/**
 * 缩放和平移 Hook
 */

import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import { VIEW_CONFIG } from './constants'
import { getZoomState, saveZoomState } from '@/utils/zoomStorage'

const SAVE_DEBOUNCE_MS = 500

interface Position {
  x: number
  y: number
}

interface UseViewTransformOptions {
  wrapperRef: RefObject<HTMLDivElement | null>
  containerRef: RefObject<HTMLDivElement | null>
  diagramId?: string
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

function calculateFitTransform(
  svgWidth: number,
  svgHeight: number,
  wrapperRect: DOMRect
): { scale: number; position: Position } {
  const availableWidth = wrapperRect.width - VIEW_CONFIG.PADDING
  const availableHeight = wrapperRect.height - VIEW_CONFIG.PADDING

  const fitScale = Math.min(availableWidth / svgWidth, availableHeight / svgHeight, 1)
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
  diagramId,
}: UseViewTransformOptions): UseViewTransformReturn {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })

  const scaleRef = useRef(scale)
  const positionRef = useRef(position)
  const isReadyRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { positionRef.current = position }, [position])

  // diagramId 切换时重置就绪标志
  useEffect(() => {
    isReadyRef.current = false
  }, [diagramId])

  // 离开当前 diagram 或卸载时立即保存
  useEffect(() => {
    return () => {
      if (diagramId && isReadyRef.current) {
        saveZoomState(diagramId, {
          scale: scaleRef.current,
          x: positionRef.current.x,
          y: positionRef.current.y,
        })
      }
    }
  }, [diagramId])

  // 用户交互时防抖保存
  useEffect(() => {
    if (!diagramId || !isReadyRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveZoomState(diagramId, { scale, x: position.x, y: position.y })
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [scale, position, diagramId])

  const fitToContainer = useCallback(() => {
    if (!containerRef.current || !wrapperRef.current) return
    const svg = containerRef.current.querySelector('svg') as SVGSVGElement
    if (!svg) return

    const wrapperRect = wrapperRef.current.getBoundingClientRect()
    const { width, height } = getSvgDimensions(svg)
    const { scale: fitScale, position: fitPos } = calculateFitTransform(width, height, wrapperRect)

    // 首次加载：优先恢复上次保存的缩放状态
    if (!isReadyRef.current && diagramId) {
      const saved = getZoomState(diagramId)
      if (saved) {
        setScale(saved.scale)
        setPosition({ x: saved.x, y: saved.y })
        isReadyRef.current = true
        return
      }
    }

    setScale(fitScale)
    setPosition(fitPos)
    isReadyRef.current = true
  }, [containerRef, wrapperRef, diagramId])

  const resetView = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    // 重置时重新计算 fit（不恢复保存状态，isReadyRef 已为 true 故不会触发恢复）
    requestAnimationFrame(() => {
      requestAnimationFrame(fitToContainer)
    })
  }, [fitToContainer])

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

    setScale(newScale)
    setPosition({
      x: mouseX - (mouseX - oldPosition.x) * ratio,
      y: mouseY - (mouseY - oldPosition.y) * ratio,
    })
  }, [wrapperRef])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    wrapper.addEventListener('wheel', handleWheel, { passive: false })
    return () => wrapper.removeEventListener('wheel', handleWheel)
  }, [handleWheel, wrapperRef])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [isDragging, dragStart])

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
