import { useState, useRef, useCallback, useEffect } from 'react'
import { getZoomState, saveZoomState } from '@/utils/zoomStorage'

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_OUT_FACTOR = 0.9
const ZOOM_IN_FACTOR = 1.1
const SAVE_DEBOUNCE_MS = 500

interface Position {
  x: number
  y: number
}

interface UseZoomPanReturn {
  scale: number
  position: Position
  isDragging: boolean
  /** 将此 ref 绑到视口容器元素上：<div ref={wrapperRef} /> */
  wrapperRef: (el: HTMLDivElement | null) => void
  handleMouseDown: (e: React.MouseEvent) => void
  handleMouseMove: (e: React.MouseEvent) => void
  handleMouseUp: () => void
  resetView: () => void
  fitView: (contentWidth: number, contentHeight: number) => void
}

export function useZoomPan(diagramId?: string): UseZoomPanReturn {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })
  const [element, setElement] = useState<HTMLDivElement | null>(null)

  const elementRef = useRef<HTMLDivElement | null>(null)
  const scaleRef = useRef(scale)
  const positionRef = useRef(position)
  const fitStateRef = useRef<{ scale: number; position: Position } | null>(null)
  // 首次 fit/restore 完成前为 false，防止误存中间状态
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

  // callback ref：元素挂载/卸载时重新绑定 wheel 监听
  const wrapperRef = useCallback((el: HTMLDivElement | null) => {
    elementRef.current = el
    setElement(el)
  }, [])

  const fitView = useCallback((contentWidth: number, contentHeight: number) => {
    const wrapper = elementRef.current
    if (!wrapper) return
    const { clientWidth: W, clientHeight: H } = wrapper
    const padding = 32
    const fitScale = Math.min((W - padding) / contentWidth, (H - padding) / contentHeight, 1)
    const cx = (W - contentWidth * fitScale) / 2
    const cy = (H - contentHeight * fitScale) / 2
    fitStateRef.current = { scale: fitScale, position: { x: cx, y: cy } }

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
    setPosition({ x: cx, y: cy })
    isReadyRef.current = true
  }, [diagramId])

  const resetView = useCallback(() => {
    if (fitStateRef.current) {
      setScale(fitStateRef.current.scale)
      setPosition(fitStateRef.current.position)
    } else {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const wrapper = elementRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const oldScale = scaleRef.current
    const oldPosition = positionRef.current
    const factor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR
    const newScale = Math.min(Math.max(oldScale * factor, MIN_SCALE), MAX_SCALE)
    const ratio = newScale / oldScale
    setScale(newScale)
    setPosition({
      x: mouseX - (mouseX - oldPosition.x) * ratio,
      y: mouseY - (mouseY - oldPosition.y) * ratio,
    })
  }, [])

  useEffect(() => {
    if (!element) return
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [element, handleWheel])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault()
      setIsDragging(true)
      setDragStart({ x: e.clientX - positionRef.current.x, y: e.clientY - positionRef.current.y })
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => setIsDragging(false), [])

  return { scale, position, isDragging, wrapperRef, handleMouseDown, handleMouseMove, handleMouseUp, resetView, fitView }
}
