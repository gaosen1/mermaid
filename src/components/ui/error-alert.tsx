import { useState, useCallback } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Copy, ChevronDown, ChevronUp } from 'lucide-react'

interface ErrorAlertProps {
  error: string
  onCopy?: () => void
}

export function ErrorAlert({ error, onCopy }: ErrorAlertProps) {
  const [expanded, setExpanded] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(error)
    onCopy?.()
  }, [error, onCopy])

  const isLong = error.length > 120 || error.includes('\n')

  return (
    <Alert
      variant="destructive"
      className="absolute bottom-2 left-2 right-2 z-30 bg-background/95 backdrop-blur-sm shadow-lg"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <AlertDescription className="flex flex-col gap-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`break-all text-sm whitespace-pre-wrap ${expanded ? '' : 'line-clamp-2'}`}
          >
            {error}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {isLong && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                className="h-6 w-6 p-0"
                title={expanded ? '收起' : '展开查看完整错误'}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-6 w-6 p-0"
              title="复制错误信息"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}
