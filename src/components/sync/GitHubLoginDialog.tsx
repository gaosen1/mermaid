import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSyncStore } from '@/stores/syncStore'
import { Github, ExternalLink, Loader2, AlertCircle } from 'lucide-react'

interface GitHubLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GitHubLoginDialog({ open, onOpenChange }: GitHubLoginDialogProps) {
  const [token, setToken] = useState('')
  const { connect, isConnecting, syncError, clearError } = useSyncStore()

  const handleConnect = async () => {
    if (!token.trim()) return

    try {
      await connect(token.trim())
      setToken('')
      onOpenChange(false)
    } catch {
      // 错误已在 store 中处理
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setToken('')
      clearError()
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            连接 GitHub
          </DialogTitle>
          <DialogDescription>
            使用 Personal Access Token (PAT) 连接到 GitHub，将图表数据同步到云端。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="token">Personal Access Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={isConnecting}
            />
            <p className="text-xs text-muted-foreground">
              Token 需要 <code className="bg-muted px-1 rounded">repo</code> 权限
            </p>
          </div>

          {syncError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{syncError}</span>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <p className="mb-2">如何创建 Token：</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>打开 GitHub Settings → Developer settings</li>
              <li>选择 Personal access tokens → Tokens (classic)</li>
              <li>点击 Generate new token</li>
              <li>勾选 repo 权限，生成并复制 Token</li>
            </ol>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() =>
              window.open(
                'https://github.com/settings/tokens/new?scopes=repo&description=Mermaid%20Editor%20Sync',
                '_blank'
              )
            }
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            创建 Token
          </Button>
          <Button
            onClick={handleConnect}
            disabled={!token.trim() || isConnecting}
            className="w-full sm:w-auto"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                连接中...
              </>
            ) : (
              '连接'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
