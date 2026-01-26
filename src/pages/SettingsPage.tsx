import { useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSyncStore } from '@/stores/syncStore'
import { Button } from '@/components/ui/button'
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
import { GitHubLoginDialog } from '@/components/sync'
import { RotateCcw, Github, LogOut, CheckCircle2, AlertCircle } from 'lucide-react'
import type { LayoutType } from '@/types'

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const {
    isAuthenticated,
    userName,
    userLogin,
    syncError,
    stats,
    settings: syncSettings,
    disconnect,
    updateSettings: updateSyncSettings,
  } = useSyncStore()
  const [loginOpen, setLoginOpen] = useState(false)

  const handleReset = () => {
    if (confirm('确定要重置所有设置为默认值吗？')) {
      resetSettings()
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container max-w-2xl py-8 mx-auto">
        <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">设置</h1>
          <p className="text-muted-foreground">自定义您的应用配置</p>
        </div>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          重置
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub 同步
            </CardTitle>
            <CardDescription>将图表数据同步到 GitHub 仓库</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAuthenticated ? (
              <>
                <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">{userName || userLogin}</p>
                      <p className="text-sm text-muted-foreground">@{userLogin}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={disconnect}>
                    <LogOut className="h-4 w-4 mr-2" />
                    断开连接
                  </Button>
                </div>

                {syncError && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{syncError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-muted-foreground">已同步项目</p>
                    <p className="text-lg font-semibold">
                      {stats.syncedProjects}/{stats.totalProjects}
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-muted-foreground">已同步图表</p>
                    <p className="text-lg font-semibold">
                      {stats.syncedDiagrams}/{stats.totalDiagrams}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>自动同步</Label>
                    <p className="text-sm text-muted-foreground">自动将更改同步到云端</p>
                  </div>
                  <Select
                    value={syncSettings.autoSync ? 'on' : 'off'}
                    onValueChange={(v) => updateSyncSettings({ autoSync: v === 'on' })}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">开启</SelectItem>
                      <SelectItem value="off">关闭</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>冲突策略</Label>
                    <p className="text-sm text-muted-foreground">当本地和云端数据冲突时</p>
                  </div>
                  <Select
                    value={syncSettings.conflictStrategy}
                    onValueChange={(v) =>
                      updateSyncSettings({ conflictStrategy: v as 'local' | 'remote' | 'ask' })
                    }
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ask">询问</SelectItem>
                      <SelectItem value="local">保留本地</SelectItem>
                      <SelectItem value="remote">使用云端</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">
                  连接 GitHub 后，您的图表数据将自动备份到云端
                </p>
                <Button onClick={() => setLoginOpen(true)}>
                  <Github className="h-4 w-4 mr-2" />
                  连接 GitHub
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
            <CardDescription>自定义应用的外观设置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>主题</Label>
                <p className="text-sm text-muted-foreground">选择应用的主题模式</p>
              </div>
              <Select
                value={settings.theme}
                onValueChange={(v) => updateSettings({ theme: v as 'light' | 'dark' | 'system' })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="dark">深色</SelectItem>
                  <SelectItem value="system">跟随系统</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>语言</Label>
                <p className="text-sm text-muted-foreground">选择界面语言</p>
              </div>
              <Select
                value={settings.language}
                onValueChange={(v) => updateSettings({ language: v as 'zh' | 'en' })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>渲染</CardTitle>
            <CardDescription>Mermaid 图表渲染配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>默认布局</Label>
                <p className="text-sm text-muted-foreground">新图表的默认布局引擎</p>
              </div>
              <Select
                value={settings.defaultLayout}
                onValueChange={(v) => updateSettings({ defaultLayout: v as LayoutType })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elk">ELK</SelectItem>
                  <SelectItem value="dagre">Dagre</SelectItem>
                  <SelectItem value="hierarchical">Hierarchical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>渲染主题</Label>
                <p className="text-sm text-muted-foreground">Mermaid 图表的渲染主题</p>
              </div>
              <Select
                value={settings.renderTheme}
                onValueChange={(v) =>
                  updateSettings({
                    renderTheme: v as 'default' | 'dark' | 'forest' | 'neutral' | 'base',
                  })
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认</SelectItem>
                  <SelectItem value="dark">暗色</SelectItem>
                  <SelectItem value="forest">森林</SelectItem>
                  <SelectItem value="neutral">中性</SelectItem>
                  <SelectItem value="base">基础</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>导出</CardTitle>
            <CardDescription>图表导出配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>默认导出格式</Label>
                <p className="text-sm text-muted-foreground">导出图表时的默认格式</p>
              </div>
              <Select
                value={settings.defaultExportFormat}
                onValueChange={(v) => updateSettings({ defaultExportFormat: v as 'png' | 'svg' })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="svg">SVG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>自动保存</CardTitle>
            <CardDescription>编辑时的自动保存配置</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>自动保存间隔</Label>
                <p className="text-sm text-muted-foreground">编辑后自动保存的时间间隔</p>
              </div>
              <Select
                value={settings.autoSaveInterval.toString()}
                onValueChange={(v) => updateSettings({ autoSaveInterval: parseInt(v) })}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">禁用</SelectItem>
                  <SelectItem value="10000">10 秒</SelectItem>
                  <SelectItem value="30000">30 秒</SelectItem>
                  <SelectItem value="60000">1 分钟</SelectItem>
                  <SelectItem value="300000">5 分钟</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>可视化编辑器</CardTitle>
            <CardDescription>拖拽式图表编辑功能</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled className="w-full">
              可视化编辑器（即将上线）
            </Button>
            <p className="text-sm text-muted-foreground mt-2">
              可视化编辑器功能正在开发中，敬请期待。
            </p>
          </CardContent>
        </Card>
      </div>
      </div>

      <GitHubLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  )
}
