/**
 * 同步设置面板组件
 * 提供自动同步开关、同步间隔设置、冲突策略选择等配置
 */

import { useSyncStore } from '@/stores/syncStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Settings, Clock, AlertTriangle, FolderGit2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SyncSettingsPanelProps {
  className?: string
}

export function SyncSettingsPanel({ className }: SyncSettingsPanelProps) {
  const { isAuthenticated, settings, updateSettings } = useSyncStore()

  // 同步间隔选项（毫秒）
  const intervalOptions = [
    { value: '60000', label: '1 分钟' },
    { value: '180000', label: '3 分钟' },
    { value: '300000', label: '5 分钟' },
    { value: '600000', label: '10 分钟' },
    { value: '900000', label: '15 分钟' },
    { value: '1800000', label: '30 分钟' },
  ]

  // 冲突策略选项
  const conflictOptions = [
    { value: 'ask', label: '询问', description: '每次冲突时询问用户' },
    { value: 'local', label: '保留本地', description: '始终使用本地版本' },
    { value: 'remote', label: '使用云端', description: '始终使用云端版本' },
  ]

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <CardTitle className="text-base">同步设置</CardTitle>
        </div>
        <CardDescription>配置自动同步和冲突解决策略</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 自动同步开关 */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-sync" className="text-sm font-medium">
              自动同步
            </Label>
            <p className="text-xs text-muted-foreground">
              自动将更改同步到云端
            </p>
          </div>
          <Switch
            id="auto-sync"
            checked={settings.autoSync}
            onCheckedChange={(checked) => updateSettings({ autoSync: checked })}
            disabled={!isAuthenticated}
          />
        </div>

        <Separator />

        {/* 同步间隔 */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">同步间隔</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              自动同步的时间间隔
            </p>
          </div>
          <Select
            value={settings.syncInterval.toString()}
            onValueChange={(v) => updateSettings({ syncInterval: parseInt(v) })}
            disabled={!isAuthenticated || !settings.autoSync}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* 冲突策略 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">冲突策略</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            当本地和云端数据发生冲突时的处理方式
          </p>
          <div className="grid gap-2">
            {conflictOptions.map((option) => (
              <div
                key={option.value}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                  settings.conflictStrategy === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                  !isAuthenticated && 'opacity-50 cursor-not-allowed'
                )}
                onClick={() => {
                  if (isAuthenticated) {
                    updateSettings({ conflictStrategy: option.value as 'local' | 'remote' | 'ask' })
                  }
                }}
              >
                <div>
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border-2 transition-colors',
                    settings.conflictStrategy === option.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground'
                  )}
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* 仓库名称 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="repo-name" className="text-sm font-medium">
              仓库名称
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            GitHub 上用于存储数据的仓库名称
          </p>
          <Input
            id="repo-name"
            value={settings.repoName}
            onChange={(e) => updateSettings({ repoName: e.target.value })}
            placeholder="mermaid-diagrams-backup"
            disabled={!isAuthenticated}
            className="max-w-[250px]"
          />
        </div>

        {/* 未连接提示 */}
        {!isAuthenticated && (
          <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
            请先连接 GitHub 以启用同步设置
          </div>
        )}
      </CardContent>
    </Card>
  )
}
