import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  readOnly?: boolean
}

export function CodeEditor({
  value,
  onChange,
  className,
  placeholder = '在此输入 Mermaid 代码...',
  readOnly = false,
}: CodeEditorProps) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'font-mono text-sm min-h-[300px] resize-none',
        className
      )}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={false}
    />
  )
}
