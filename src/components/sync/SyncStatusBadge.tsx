/**
 * 同步状态徽章组件
 * 显示实体的同步状态
 */

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CloudOff,
  AlertTriangle,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SyncStatus } from '@/types/sync'

interface SyncStatusBadgeProps {
  status?: SyncStatus
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

const statusConfig: Record<
  SyncStatus,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    color: string
    bgColor: string
  }
> = {
  synced: {
    icon: CheckCircle2,
    label: '已同步',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  pending: {
    icon: Loader2,
    label: '待同步',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  conflict: {
    icon: AlertTriangle,
    label: '有冲突',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  error: {
    icon: AlertCircle,
    label: '同步错误',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
  'local-only': {
    icon: CloudOff,
    label: '仅本地',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
}

export function SyncStatusBadge({
  status = 'local-only',
  size = 'sm',
  showLabel = false,
  className,
}: SyncStatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'

  if (showLabel) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1',
          config.color,
          config.bgColor,
          'border-transparent',
          className
        )}
      >
        <Icon className={cn(iconSize, status === 'pending' && 'animate-spin')} />
        {config.label}
      </Badge>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center justify-center',
              config.color,
              className
            )}
          >
            <Icon className={cn(iconSize, status === 'pending' && 'animate-spin')} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
