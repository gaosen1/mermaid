import { useCallback, useMemo, useEffect, useRef } from 'react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { NodeStyle, NodeShape } from '@/utils/nodeDsl'
import { getColorPalette, type MermaidTheme } from '@/constants/colors'

// 边框样式选项
const STROKE_TYPE_OPTIONS: { value: NodeStyle['strokeType']; label: string; preview: string }[] = [
  { value: 'normal', label: '普通', preview: '─────' },
  { value: 'dotted', label: '虚线', preview: '- - - -' },
  { value: 'thick', label: '粗线', preview: '━━━━━' },
]

// 动画选项
const ANIMATION_OPTIONS: { value: NodeStyle['animation']; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'pulse', label: '脉冲' },
  { value: 'blink', label: '闪烁' },
]

// 形状选项
const SHAPE_OPTIONS: { value: NodeShape; label: string; icon: string }[] = [
  { value: 'rectangle', label: '方形', icon: '▭' },
  { value: 'rounded', label: '圆角', icon: '▢' },
  { value: 'stadium', label: '胶囊', icon: '⬭' },
  { value: 'diamond', label: '菱形', icon: '◇' },
  { value: 'hexagon', label: '六边形', icon: '⬡' },
  { value: 'circle', label: '圆形', icon: '○' },
  { value: 'parallelogram', label: '平行四边形', icon: '▱' },
  { value: 'trapezoid', label: '梯形', icon: '⏢' },
]

interface NodeStylePanelProps {
  open: boolean
  position: { x: number; y: number }
  currentStyle: NodeStyle
  currentShape: NodeShape | null
  mermaidTheme: MermaidTheme
  onStyleChange: (style: NodeStyle) => void
  onShapeChange: (shape: NodeShape) => void
  onClose: () => void
}

export function NodeStylePanel({
  open,
  position,
  currentStyle,
  currentShape,
  mermaidTheme,
  onStyleChange,
  onShapeChange,
  onClose,
}: NodeStylePanelProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const palette = useMemo(() => getColorPalette(mermaidTheme), [mermaidTheme])

  // 更新虚拟锚点位置
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.style.left = `${position.x}px`
      anchorRef.current.style.top = `${position.y}px`
    }
  }, [position])

  // 背景色选择
  const handleFillSelect = useCallback(
    (color: string) => {
      onStyleChange({ ...currentStyle, fill: color })
    },
    [currentStyle, onStyleChange]
  )

  // 清除背景色
  const handleClearFill = useCallback(() => {
    const { fill: _, ...rest } = currentStyle
    void _
    onStyleChange(rest)
  }, [currentStyle, onStyleChange])

  // 边框颜色选择
  const handleStrokeSelect = useCallback(
    (color: string) => {
      onStyleChange({ ...currentStyle, stroke: color })
    },
    [currentStyle, onStyleChange]
  )

  // 清除边框颜色
  const handleClearStroke = useCallback(() => {
    const { stroke: _, ...rest } = currentStyle
    void _
    onStyleChange(rest)
  }, [currentStyle, onStyleChange])

  // 边框样式选择
  const handleStrokeTypeSelect = useCallback(
    (strokeType: NodeStyle['strokeType']) => {
      if (strokeType === currentStyle.strokeType) {
        const { strokeType: _, ...rest } = currentStyle
        void _
        onStyleChange(rest)
      } else {
        onStyleChange({ ...currentStyle, strokeType })
      }
    },
    [currentStyle, onStyleChange]
  )

  // 文字颜色选择
  const handleColorSelect = useCallback(
    (color: string) => {
      onStyleChange({ ...currentStyle, color })
    },
    [currentStyle, onStyleChange]
  )

  // 清除文字颜色
  const handleClearColor = useCallback(() => {
    const { color: _, ...rest } = currentStyle
    void _
    onStyleChange(rest)
  }, [currentStyle, onStyleChange])

  // 动画选择
  const handleAnimationSelect = useCallback(
    (animation: NodeStyle['animation']) => {
      if (animation === 'none') {
        const { animation: _, ...rest } = currentStyle
        void _
        onStyleChange(rest)
      } else {
        onStyleChange({ ...currentStyle, animation })
      }
    },
    [currentStyle, onStyleChange]
  )

  // 形状选择
  const handleShapeSelect = useCallback(
    (shape: NodeShape) => {
      onShapeChange(shape)
    },
    [onShapeChange]
  )

  // 计算当前选中的颜色
  const selectedFill = useMemo(() => currentStyle.fill, [currentStyle])
  const selectedStroke = useMemo(() => currentStyle.stroke, [currentStyle])
  const selectedColor = useMemo(() => currentStyle.color, [currentStyle])

  return (
    <Popover open={open} onOpenChange={(open) => !open && onClose()}>
      {/* 虚拟锚点 */}
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
        className="w-72 p-3 max-h-[80vh] overflow-y-auto"
        side="right"
        sideOffset={8}
        align="start"
        onInteractOutside={(e) => {
          // 点击 SVG node 时不关闭
          const target = e.target as Element
          if (target.closest('g.node')) {
            e.preventDefault()
          }
        }}
      >
        <div className="space-y-4">
          {/* 背景色 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">背景色</span>
              {selectedFill && (
                <button
                  onClick={handleClearFill}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  清除
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {palette.map((entry) => (
                <button
                  key={`fill-${entry.label}`}
                  className={cn(
                    entry.tw,
                    'w-7 h-7 rounded-md border-2 transition-all hover:scale-110',
                    selectedFill === entry.hex
                      ? 'border-foreground ring-2 ring-foreground/20'
                      : 'border-transparent'
                  )}
                  onClick={() => handleFillSelect(entry.hex)}
                  title={entry.label}
                />
              ))}
            </div>
          </div>

          {/* 边框颜色 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">边框颜色</span>
              {selectedStroke && (
                <button
                  onClick={handleClearStroke}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  清除
                </button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {palette.map((entry) => (
                <button
                  key={`stroke-${entry.label}`}
                  className={cn(
                    entry.tw,
                    'w-7 h-7 rounded-md border-2 transition-all hover:scale-110',
                    selectedStroke === entry.hex
                      ? 'border-foreground ring-2 ring-foreground/20'
                      : 'border-transparent'
                  )}
                  onClick={() => handleStrokeSelect(entry.hex)}
                  title={entry.label}
                />
              ))}
            </div>
          </div>

          {/* 边框样式 */}
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-2 block">边框样式</span>
            <div className="flex gap-2">
              {STROKE_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'flex-1 px-2 py-1.5 text-xs rounded-md border transition-colors',
                    currentStyle.strokeType === option.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => handleStrokeTypeSelect(option.value)}
                >
                  <div className="text-center">
                    <div className="font-mono text-[10px] mb-0.5">{option.preview}</div>
                    <div>{option.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 文字颜色 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">文字颜色</span>
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
                  key={`color-${entry.label}`}
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

          {/* 动画 - 仅普通节点显示 */}
          {currentShape !== null && (
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-2 block">动画</span>
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
          )}

          {/* 形状 - 仅普通节点显示 */}
          {currentShape !== null && (
          <div>
            <span className="text-xs font-medium text-muted-foreground mb-2 block">形状</span>
            <div className="grid grid-cols-4 gap-1.5">
              {SHAPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'px-2 py-2 text-xs rounded-md border transition-colors',
                    currentShape === option.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-input hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => handleShapeSelect(option.value)}
                  title={option.label}
                >
                  <div className="text-center">
                    <div className="text-lg mb-0.5">{option.icon}</div>
                    <div className="text-[10px] truncate">{option.label}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
