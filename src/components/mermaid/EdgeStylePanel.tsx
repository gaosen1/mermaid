import { useCallback, useMemo, useEffect, useRef } from 'react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { EdgeStyle } from '@/utils/edgeDsl'
import { getColorPalette, type MermaidTheme } from '@/constants/colors'

// 线条样式选项
const STROKE_OPTIONS: { value: EdgeStyle['stroke']; label: string; preview: string }[] = [
  { value: 'normal', label: '普通', preview: '─────' },
  { value: 'dotted', label: '虚线', preview: '- - - -' },
  { value: 'thick', label: '粗线', preview: '━━━━━' },
]

// 动画选项
const ANIMATION_OPTIONS: { value: EdgeStyle['animation']; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'slow', label: '慢速' },
  { value: 'fast', label: '快速' },
  { value: 'slow-leader', label: '主蚁慢' },
  { value: 'fast-leader', label: '主蚁快' },
]

interface EdgeStylePanelProps {
  open: boolean
  position: { x: number; y: number }
  currentStyle: EdgeStyle
  mermaidTheme: MermaidTheme
  onStyleChange: (style: EdgeStyle) => void
  onClose: () => void
}

export function EdgeStylePanel({
  open,
  position,
  currentStyle,
  mermaidTheme,
  onStyleChange,
  onClose,
}: EdgeStylePanelProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const palette = useMemo(() => getColorPalette(mermaidTheme), [mermaidTheme])

  // 更新虚拟锚点位置
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.style.left = `${position.x}px`
      anchorRef.current.style.top = `${position.y}px`
    }
  }, [position])

  // 颜色选择
  const handleColorSelect = useCallback(
    (color: string) => {
      onStyleChange({ ...currentStyle, color })
    },
    [currentStyle, onStyleChange]
  )

  // 清除颜色
  const handleClearColor = useCallback(() => {
    const { color, ...rest } = currentStyle
    void color // 忽略 unused variable
    onStyleChange(rest)
  }, [currentStyle, onStyleChange])

  // 线条样式选择
  const handleStrokeSelect = useCallback(
    (stroke: EdgeStyle['stroke']) => {
      if (stroke === currentStyle.stroke) {
        // 取消选中
        const { stroke: existingStroke, ...rest } = currentStyle
        void existingStroke // 忽略 unused variable
        onStyleChange(rest)
      } else {
        onStyleChange({ ...currentStyle, stroke })
      }
    },
    [currentStyle, onStyleChange]
  )

  // 动画选择
  const handleAnimationSelect = useCallback(
    (animation: EdgeStyle['animation']) => {
      if (animation === 'none') {
        const { animation: existingAnimation, ...rest } = currentStyle
        void existingAnimation // 忽略 unused variable
        onStyleChange(rest)
      } else {
        onStyleChange({ ...currentStyle, animation })
      }
    },
    [currentStyle, onStyleChange]
  )

  // 计算当前选中的颜色
  const selectedColor = useMemo(() => currentStyle.color, [currentStyle])

  return (
    <Popover open={open} onOpenChange={(open) => !open && onClose()}>
      {/* 虚拟锚点 - 用于定位 Popover */}
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className="fixed pointer-events-none"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: 1,
            height: 1,
          }}
        />
      </PopoverAnchor>

      <PopoverContent
        className="w-64 p-3"
        side="right"
        sideOffset={8}
        align="start"
        onInteractOutside={(e) => {
          // 点击 SVG edge 时不关闭
          const target = e.target as Element
          if (target.closest('.edgePath')) {
            e.preventDefault()
          }
        }}
      >
        <div className="space-y-4">
          {/* 颜色选择 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">颜色</span>
              {selectedColor && (
                <button
                  onClick={handleClearColor}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  清除
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {palette.map((entry) => (
                <button
                  key={entry.label}
                  className={cn(
                    entry.tw,
                    'w-7 h-7 rounded-md border-2 transition-all hover:scale-110',
                    selectedColor === entry.hex
                      ? 'border-foreground ring-2 ring-foreground/20'
                      : 'border-transparent'
                  )}
                  onClick={() => handleColorSelect(entry.hex)}
                  title={entry.label}
                />
              ))}
            </div>
          </div>

          {/* 线条样式 */}
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-2 block">
              线条样式
            </span>
            <div className="flex gap-2">
              {STROKE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors',
                    currentStyle.stroke === option.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => handleStrokeSelect(option.value)}
                >
                  <div className="text-center">
                    <div className="font-mono text-[10px] mb-0.5">{option.preview}</div>
                    <div>{option.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 动画 */}
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-2 block">
              动画
            </span>
            <div className="flex gap-2">
              {ANIMATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors',
                    (currentStyle.animation === option.value ||
                      (option.value === 'none' && !currentStyle.animation))
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => handleAnimationSelect(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
