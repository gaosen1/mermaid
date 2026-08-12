import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, Copy, ChevronDown, ChevronUp, GripHorizontal, X } from 'lucide-react'

interface ErrorAlertProps {
  error: string
  onCopy?: () => void
}

/**
 * 可拖拽的悬浮错误弹窗：fixed 定位 + 高 z-index，避免被侧栏/面板遮挡。
 */
export function ErrorAlert({ error, onCopy }: ErrorAlertProps) {
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null)

  // 错误内容变化时重新显示
  useEffect(() => {
    setDismissed(false)
  }, [error])

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 无活动指针时忽略，拖拽仍可通过 move 事件生效
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const x = drag.originX + (e.clientX - drag.pointerX)
    const y = drag.originY + (e.clientY - drag.pointerY)
    setPos({ x, y })
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(error)
    onCopy?.()
  }

  if (dismissed) return null

  const isLong = error.length > 120 || error.includes('\n')

  return (
    <div
      ref={boxRef}
      role="alert"
      className="fixed z-[100] w-[min(440px,calc(100vw-2rem))] rounded-lg border border-destructive/50 bg-background/95 backdrop-blur-md shadow-2xl"
      style={pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 16 }}
    >
      {/* 拖拽头部 */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-destructive/30 cursor-move select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        <span className="text-sm font-medium text-destructive">渲染错误</span>
        <GripHorizontal className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="关闭"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setDismissed(true)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 py-2 space-y-1.5">
        <span className={`block break-all text-xs whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
          {error}
        </span>
        <div className="flex items-center justify-end gap-1">
          {isLong && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="h-6 px-2 text-[11px]"
              title={expanded ? '收起' : '展开查看完整错误'}
            >
              {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {expanded ? '收起' : '展开'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleCopy} className="h-6 px-2 text-[11px]" title="复制错误信息">
            <Copy className="h-3 w-3 mr-1" />
            复制
          </Button>
        </div>
      </div>
    </div>
  )
}
