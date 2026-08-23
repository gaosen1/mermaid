import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getAiProfiles,
  saveAiProfiles,
  getActiveAiProfileId,
  setActiveAiProfileId,
  testAiConnection,
  AI_PROFILE_PRESETS,
  type AiEndpointProfile,
  type AiProfileId,
} from '@/utils/aiChat'

interface ApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message: string }

const PROFILE_IDS: AiProfileId[] = ['token-plan', 'api-payg']

/**
 * AI 服务配置面板（AI 对话、AI 命名、AI 整理共用）。
 * 双方案各持一套 base URL + Key，一键切换激活方案。
 */
export function ApiKeyDialog({ open, onOpenChange }: ApiKeyDialogProps) {
  const [profiles, setProfiles] = useState<Record<AiProfileId, AiEndpointProfile>>(getAiProfiles)
  const [activeId, setActiveId] = useState<AiProfileId>(getActiveAiProfileId)
  const [test, setTest] = useState<Record<AiProfileId, TestState>>({
    'token-plan': { status: 'idle', message: '' },
    'api-payg': { status: 'idle', message: '' },
  })

  useEffect(() => {
    if (open) {
      setProfiles(getAiProfiles())
      setActiveId(getActiveAiProfileId())
      setTest({
        'token-plan': { status: 'idle', message: '' },
        'api-payg': { status: 'idle', message: '' },
      })
    }
  }, [open])

  const updateProfile = (id: AiProfileId, patch: Partial<AiEndpointProfile>) => {
    setProfiles((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    setTest((prev) => ({ ...prev, [id]: { status: 'idle', message: '' } }))
  }

  const resetBaseUrl = (id: AiProfileId) => {
    updateProfile(id, { baseUrl: AI_PROFILE_PRESETS[id].baseUrl })
  }

  const handleTest = async (id: AiProfileId) => {
    const p = profiles[id]
    if (!p.apiKey.trim() || !p.baseUrl.trim()) return
    setTest((prev) => ({ ...prev, [id]: { status: 'testing', message: '测试中…' } }))
    // 用 models 接口探测（轻量，同时验证 Key 与端点）
    const result = await testAiConnection(p.baseUrl.trim(), p.apiKey.trim())
    // 直连被 CORS 拦截但代理连通：自动开启本地代理转发
    if (result.viaProxy) {
      setProfiles((prev) => ({ ...prev, [id]: { ...prev[id], useProxy: true } }))
    }
    setTest((prev) => ({
      ...prev,
      [id]: { status: result.ok ? 'ok' : 'fail', message: result.message },
    }))
  }

  const handleSave = () => {
    const cleaned: Record<AiProfileId, AiEndpointProfile> = {
      'token-plan': { ...profiles['token-plan'], baseUrl: profiles['token-plan'].baseUrl.trim(), apiKey: profiles['token-plan'].apiKey.trim() },
      'api-payg': { ...profiles['api-payg'], baseUrl: profiles['api-payg'].baseUrl.trim(), apiKey: profiles['api-payg'].apiKey.trim() },
    }
    saveAiProfiles(cleaned)
    setActiveAiProfileId(activeId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md!">
        <DialogHeader>
          <DialogTitle className="text-base">AI 服务配置</DialogTitle>
          <DialogDescription>
            千问云双方案：Token 套餐与 API 按量付费的端点与 Key 不同，可分别配置并随时切换。配置仅保存在浏览器本地。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {PROFILE_IDS.map((id) => {
            const p = profiles[id]
            const isActive = activeId === id
            const t = test[id]
            return (
              <div
                key={id}
                className={`rounded-md border p-3 space-y-2.5 ${isActive ? 'border-primary' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ai-profile"
                    id={`ai-profile-${id}`}
                    checked={isActive}
                    onChange={() => setActiveId(id)}
                    className="accent-[var(--primary)]"
                  />
                  <Label
                    htmlFor={`ai-profile-${id}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {p.name}
                  </Label>
                  {isActive && (
                    <span className="text-[10px] text-primary border border-primary/40 rounded px-1.5 py-0.5">
                      使用中
                    </span>
                  )}
                  {p.useProxy && (
                    <span
                      className="text-[10px] text-amber-600 border border-amber-500/40 rounded px-1.5 py-0.5"
                      title="该端点不支持浏览器跨域，请求经本地 agent-api 的 /api/ai-proxy 转发"
                    >
                      本地代理
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Base URL</Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={p.baseUrl}
                      onChange={(e) => updateProfile(id, { baseUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                      spellCheck={false}
                    />
                    {p.baseUrl.trim() !== AI_PROFILE_PRESETS[id].baseUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 text-xs"
                        title="恢复默认端点"
                        onClick={() => resetBaseUrl(id)}
                      >
                        默认
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">API Key</Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="password"
                      value={p.apiKey}
                      onChange={(e) => updateProfile(id, { apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="h-8 text-xs font-mono"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 text-xs"
                      disabled={!p.apiKey.trim() || !p.baseUrl.trim() || t.status === 'testing'}
                      onClick={() => handleTest(id)}
                    >
                      {t.status === 'testing' ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      测试
                    </Button>
                  </div>
                  {t.status === 'ok' && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t.message}
                    </p>
                  )}
                  {t.status === 'fail' && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      {t.message}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
