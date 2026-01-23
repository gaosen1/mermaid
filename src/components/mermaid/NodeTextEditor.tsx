import { useRef, useEffect, useCallback, useState } from 'react'
import { cn } from '@/lib/utils'

interface NodeTextEditorProps {
  open: boolean
  bounds: { x: number; y: number; width: number; height: number }
  initialText: string
  scale: number
  onSave: (text: string) => void
  onCancel: () => void
}

export function NodeTextEditor({
  open,
  bounds,
  initialText,
  scale,
  onSave,
  onCancel,
}: NodeTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initialText)

  // 当打开时，重置文本并聚焦
  useEffect(() => {
    if (open) {
      setText(initialText)
      // 延迟聚焦以确保 DOM 已更新
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.select()
        }
      })
    }
  }, [open, initialText])

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Enter 保存，Shift+Enter 换行
        e.preventDefault()
        onSave(text)
      }
    },
    [text, onSave, onCancel]
  )

  // 处理点击外部
  const handleBlur = useCallback(() => {
    // 延迟执行以避免与保存按钮点击冲突
    setTimeout(() => {
      if (open) {
        onSave(text)
      }
    }, 100)
  }, [open, text, onSave])

  if (!open) return null

  // 计算编辑器位置和大小
  // 考虑缩放因素
  const minWidth = Math.max(bounds.width * scale, 100)
  const minHeight = Math.max(bounds.height * scale, 40)

  return (
    <div
      className="fixed z-50 pointer-events-auto"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: minWidth,
        minHeight: minHeight,
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(
          'w-full min-h-full p-2 text-sm',
          'bg-background border-2 border-primary rounded-md shadow-lg',
          'resize-none outline-none',
          'placeholder:text-muted-foreground'
        )}
        style={{
          minHeight: minHeight,
          fontSize: `${14 * scale}px`,
          lineHeight: 1.4,
        }}
        placeholder="输入节点文字..."
      />
      <div className="absolute -bottom-6 left-0 text-xs text-muted-foreground">
        Enter 保存 · Shift+Enter 换行 · Esc 取消
      </div>
    </div>
  )
}
