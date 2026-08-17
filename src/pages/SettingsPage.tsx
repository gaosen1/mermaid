import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSyncStore } from '@/stores/syncStore'
import { getWheelMode, setWheelMode, type WheelMode } from '@/utils/canvasGesture'
import {
  getAgentSyncStatus,
  subscribeAgentSync,
  pickAgentSyncDir,
  disconnectAgentSync,
  grantAgentSyncPermission,
  readAgentAuthToken,
  syncNow as agentSyncNow,
  AGENT_API_DEFAULT_PORT,
  type AgentAuthToken,
} from '@/utils/agentSync'
import { toast } from 'sonner'
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
import {
  GitHubLoginDialog,
  SyncStatusPanel,
  SyncSettingsPanel,
  SyncQueuePanel,
} from '@/components/sync'
import { RotateCcw, Github, LogOut, CheckCircle2, AlertCircle, RefreshCw, Database, Copy, FolderOpen, Unplug } from 'lucide-react'
import type { LayoutType } from '@/types'

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettingsStore()
  const [wheelMode, setWheelModeState] = useState<WheelMode>(getWheelMode)
  const {
    isAuthenticated,
    userName,
    userLogin,
    syncError,
    isSyncing,
    disconnect,
    syncNow,
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
        {/* GitHub 连接状态卡片 */}
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
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncNow()}
                      disabled={isSyncing}
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? '同步中...' : '立即同步'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={disconnect}>
                      <LogOut className="h-4 w-4 mr-2" />
                      断开
                    </Button>
                  </div>
                </div>

                {syncError && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{syncError}</span>
                  </div>
                )}
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

        {/* 同步状态面板 */}
        {isAuthenticated && <SyncStatusPanel />}

        {/* 同步设置面板 */}
        <SyncSettingsPanel />

        {/* 同步队列面板 */}
        {isAuthenticated && <SyncQueuePanel />}

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
            <CardTitle>画布交互</CardTitle>
            <CardDescription>缩放与平移的手势映射</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>滚轮行为</Label>
                <p className="text-sm text-muted-foreground">
                  平移：滚轮/双指滑动平移、捏合或 Ctrl+滚轮缩放（触控板友好）；缩放：滚轮直接缩放（旧习惯）；自动：启发式区分设备
                </p>
              </div>
              <Select
                value={wheelMode}
                onValueChange={(v) => {
                  const mode = v as WheelMode
                  setWheelMode(mode)
                  setWheelModeState(mode)
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pan">平移（推荐）</SelectItem>
                  <SelectItem value="zoom">缩放</SelectItem>
                  <SelectItem value="auto">自动</SelectItem>
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
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              本地 Agent 同步
            </CardTitle>
            <CardDescription>
              将笔记库快照（含 mermaid 标准化源码 / SVG / PNG）写入本地目录，供本地 Coding Agent 通过 REST API 读取
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AgentSyncCard />
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

// ─── 本地 Agent 同步卡片 ───────────────────────────────────────────────

function AgentSyncCard() {
  const [status, setStatus] = useState(getAgentSyncStatus)
  const [token, setToken] = useState<AgentAuthToken | null>(null)
  const [nowTs, setNowTs] = useState(0)

  useEffect(() => {
    const refreshAll = () => {
      setStatus(getAgentSyncStatus())
      readAgentAuthToken().then(setToken)
      setNowTs(Date.now())
    }
    refreshAll()
    return subscribeAgentSync(refreshAll)
  }, [])

  const expired = token ? nowTs > token.expiresAt : false

  if (!status.supported) {
    return (
      <p className="text-sm text-muted-foreground">
        当前浏览器不支持 File System Access API（需 Chromium 内核浏览器，如 Chrome / Edge）。
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {status.connected ? (
        <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg">
          <div className="flex items-center gap-3 min-w-0">
            <FolderOpen className="h-5 w-5 text-green-500 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{status.dirName}</p>
              <p className="text-sm text-muted-foreground">
                {status.syncing
                  ? '同步中…'
                  : status.lastSyncAt
                    ? `上次同步：${new Date(status.lastSyncAt).toLocaleString()}`
                    : '尚未同步'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => agentSyncNow()} disabled={status.syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${status.syncing ? 'animate-spin' : ''}`} />
              立即同步
            </Button>
            <Button variant="outline" size="sm" onClick={() => disconnectAgentSync()}>
              <Unplug className="h-4 w-4 mr-2" />
              断开
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-4">
            选择一个本地目录后，笔记的每次变更都会自动同步为该目录下的文件快照
          </p>
          <Button onClick={() => pickAgentSyncDir()}>
            <FolderOpen className="h-4 w-4 mr-2" />
            选择同步目录
          </Button>
        </div>
      )}

      {status.needsPermission && (
        <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg">
          <p className="text-sm">浏览器需要重新授权目录访问权限</p>
          <Button variant="outline" size="sm" onClick={() => grantAgentSyncPermission()}>
            允许访问
          </Button>
        </div>
      )}

      {status.lastError && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{status.lastError}</span>
        </div>
      )}

      {status.connected && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label>REST API 鉴权 Token</Label>
            {token ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted rounded px-2 py-1 truncate flex-1">
                    {token.token.slice(0, 8)}…{token.token.slice(-4)}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(token.token)
                        toast.success('已复制 Token')
                      } catch {
                        toast.error('复制失败，请手动复制')
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    复制
                  </Button>
                </div>
                <p className={`text-xs ${expired ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {expired
                    ? 'Token 已过期：调用 GET /api/auth/token（仅限本机）可重新签发'
                    : `有效期至 ${new Date(token.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                启动 API 服务后自动生成（1 个月过期）
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              在本仓库根目录运行 <code className="bg-muted rounded px-1">node scripts/agent-api.mjs</code>
              （默认端口 {AGENT_API_DEFAULT_PORT}，可用 --port / --dir 覆盖），Agent 即可通过
              <code className="bg-muted rounded px-1"> GET /api/auth/token </code>
              获取 Token 后调用 <code className="bg-muted rounded px-1">/api/diagrams</code> 等接口。
            </p>
          </div>
        </>
      )}
    </div>
  )
}
