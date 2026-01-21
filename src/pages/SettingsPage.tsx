import { useSettingsStore } from '@/stores/settingsStore'
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
import { RotateCcw } from 'lucide-react'
import type { LayoutType } from '@/types'

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettingsStore()

  const handleReset = () => {
    if (confirm('确定要重置所有设置为默认值吗？')) {
      resetSettings()
    }
  }

  return (
    <div className="container max-w-2xl py-8">
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
  )
}
