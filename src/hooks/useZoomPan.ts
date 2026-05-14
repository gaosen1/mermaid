import { useState, useRef, useCallback, useEffect } from 'react'

const MIN_SCALE = 0.1
const MAX_SCALE = 5
const ZOOM_OUT_FACTOR = 0.9
const ZOOM_IN_FACTOR = 1.1

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

export function useZoomPan(): UseZoomPanReturn {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 })

  // 用 state 追踪实际 DOM 元素，element 变化时 useEffect 会重新绑定
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const elementRef = useRef<HTMLDivElement | null>(null)

  const scaleRef = useRef(scale)
  const positionRef = useRef(position)
  const fitStateRef = useRef<{ scale: number; position: Position } | null>(null)

  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { positionRef.current = position }, [position])

  // callback ref：元素挂载/卸载时调用
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
    setScale(fitScale)
    setPosition({ x: cx, y: cy })
  }, [])

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

  // element 挂载/变更时重新绑定 wheel 监听
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
