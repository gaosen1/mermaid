import { useState } from 'react'
import { useSyncStore } from '@/stores/syncStore'
import { GitHubLoginDialog } from './GitHubLoginDialog'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Github, CloudOff, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SyncStatusIndicator() {
  const [loginOpen, setLoginOpen] = useState(false)
  const { isAuthenticated, isConnecting, isSyncing, userLogin, syncError, stats } = useSyncStore()

  const hasIssues = stats.conflictItems > 0 || stats.errorItems > 0

  const getStatusIcon = () => {
    if (isConnecting || isSyncing) {
      return <Loader2 className="h-4 w-4 animate-spin" />
    }
    if (!isAuthenticated) {
      return <CloudOff className="h-4 w-4" />
    }
    if (hasIssues) {
      return <AlertCircle className="h-4 w-4" />
    }
    return <Github className="h-4 w-4" />
  }

  const getStatusText = () => {
    if (isConnecting) return '连接中...'
    if (isSyncing) return '同步中...'
    if (!isAuthenticated) return '未连接'
    if (syncError) return '同步错误'
    if (stats.conflictItems > 0) return `${stats.conflictItems} 个冲突`
    if (stats.errorItems > 0) return `${stats.errorItems} 个错误`
    return userLogin || '已连接'
  }

  const getStatusColor = () => {
    if (!isAuthenticated) return 'text-muted-foreground'
    if (syncError || stats.errorItems > 0) return 'text-destructive'
    if (stats.conflictItems > 0) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn('gap-2 h-8', getStatusColor())}
              onClick={() => !isAuthenticated && setLoginOpen(true)}
            >
              {getStatusIcon()}
              <span className="text-xs hidden sm:inline">{getStatusText()}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isAuthenticated ? (
              <div className="text-xs">
                <p>已连接: {userLogin}</p>
                <p>
                  已同步: {stats.syncedProjects}/{stats.totalProjects} 项目,{' '}
                  {stats.syncedDiagrams}/{stats.totalDiagrams} 图表
                </p>
                {stats.pendingItems > 0 && <p>待同步: {stats.pendingItems} 项</p>}
              </div>
            ) : (
              <p className="text-xs">点击连接 GitHub</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <GitHubLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </>
  )
}
