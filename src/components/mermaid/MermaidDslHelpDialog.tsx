import { useCallback, useState } from 'react'
import { BookOpenText, Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface MermaidDslHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DSL_EXAMPLE = `graph TD
  A@{fill:#E1F5EE;stroke:#0F6E56;color:#085041;stroke-style:thick;animation:pulse}[开始]
  B@{fill:#EEEDFE;stroke:#534AB7;color:#3C3489;stroke-style:dotted}[处理]
  C@{fill:#FAECE7;stroke:#993C1D;color:#712B13;animation:blink}[结束]
  A --> B --> C

  linkStyle 0 stroke:#0F6E56,stroke-width:2px,animation:mermaid-edge-dash 1.5s linear infinite
  linkStyle 1 stroke:#993C1D,stroke-dasharray:5 5,stroke-width:1px`

const LLM_PROMPT = `请为我生成 Mermaid 代码，并遵守以下平台支持的自定义样式规则：

1. 只输出 Mermaid 代码，不要输出 Markdown 解释。
2. 使用 flowchart/graph 语法时，可以给节点追加平台扩展语法：
   NODE_ID@{fill:#HEX;stroke:#HEX;color:#HEX;stroke-width:2px;stroke-style:dotted;animation:pulse}[节点文本]
3. 节点扩展属性说明：
   - fill：节点背景色，例如 #E1F5EE
   - stroke：节点边框色，例如 #0F6E56
   - color：节点文字颜色，例如 #085041
   - stroke-width：边框宽度，例如 1px、2px、3px
   - stroke-style：支持 normal、dotted、thick
   - animation：支持 pulse、blink、slow、fast、march
4. 也可以使用 Mermaid 原生 style 指令设置节点或 subgraph：
   style NODE_ID fill:#E1F5EE,stroke:#0F6E56,color:#085041,stroke-width:3px
5. 可以使用 Mermaid 原生 linkStyle 指令设置连线，连线编号从 0 开始：
   linkStyle 0 stroke:#0F6E56,stroke-width:2px
   linkStyle 1 stroke:#993C1D,stroke-dasharray:5 5,stroke-width:1px
6. 平台额外支持以下连线动画 CSS：
   - animation:mermaid-edge-dash 1.5s linear infinite
   - animation:mermaid-edge-dash 0.6s linear infinite
   - animation:mermaid-edge-dash-leader 3s linear infinite
   - animation:mermaid-edge-dash-leader 1.2s linear infinite
7. 颜色请使用清晰的浅色填充、深色边框和深色文字，保证可读性。
8. 节点 ID 使用英文、数字或下划线，避免中文 ID；中文放在节点文本里。

请基于我的需求生成一份结构清晰、颜色分组明确、包含必要自定义样式的 Mermaid 图。`

export function MermaidDslHelpDialog({ open, onOpenChange }: MermaidDslHelpDialogProps) {
  const [copiedTarget, setCopiedTarget] = useState<'example' | 'prompt' | null>(null)

  const handleCopy = useCallback(async (target: 'example' | 'prompt', text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedTarget(target)
    window.setTimeout(() => setCopiedTarget(null), 1400)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mermaid-dsl-help-dialog !max-w-[min(1120px,calc(100vw-2rem))] max-h-[88vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="mermaid-dsl-help-header px-5 pt-5 pb-3 border-b min-w-0">
          <DialogTitle className="mermaid-dsl-help-title flex items-center gap-2 text-base min-w-0 pr-8">
            <BookOpenText className="mermaid-dsl-help-title-icon h-4 w-4 shrink-0" />
            自定义 Mermaid 样式
          </DialogTitle>
          <DialogDescription className="mermaid-dsl-help-description pr-8">
            当前平台在官方 Mermaid 渲染能力之外支持的样式写法与 LLM 提示词模板
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="guide" className="mermaid-dsl-help-tabs min-h-0 gap-0 overflow-hidden">
          <div className="mermaid-dsl-help-tabs-header px-5 pt-3 border-b">
            <TabsList className="mermaid-dsl-help-tabs-list h-8">
              <TabsTrigger value="guide" className="mermaid-dsl-help-tabs-trigger text-xs">语法说明</TabsTrigger>
              <TabsTrigger value="prompt" className="mermaid-dsl-help-tabs-trigger text-xs">LLM 提示词</TabsTrigger>
            </TabsList>
          </div>

          <div className="mermaid-dsl-help-scroll max-h-[68vh] overflow-y-auto overflow-x-hidden px-5 py-4 min-w-0">
            <TabsContent value="guide" className="mermaid-dsl-help-guide-tab m-0 space-y-5 min-w-0">
              <section className="mermaid-dsl-help-section mermaid-dsl-help-node-section space-y-2 min-w-0">
                <h3 className="mermaid-dsl-help-section-title text-sm font-semibold">节点扩展语法</h3>
                <p className="mermaid-dsl-help-section-desc text-sm text-muted-foreground">
                  在节点 ID 后追加 <code className="mermaid-dsl-help-inline-code rounded bg-muted px-1.5 py-0.5"> @{'{...}'}</code>，平台会在渲染前转换为 Mermaid 原生样式。
                </p>
                <div className="mermaid-dsl-help-prop-grid grid gap-2 text-sm md:grid-cols-2">
                  <DslRow name="fill" desc="节点背景色，如 #E1F5EE" />
                  <DslRow name="stroke" desc="节点边框色，如 #0F6E56" />
                  <DslRow name="color" desc="节点文字颜色，如 #085041" />
                  <DslRow name="stroke-width" desc="边框宽度，如 1px、2px、3px" />
                  <DslRow name="stroke-style" desc="normal、dotted、thick" />
                  <DslRow name="animation" desc="pulse、blink、slow、fast、march" />
                </div>
              </section>

              <section className="mermaid-dsl-help-section mermaid-dsl-help-native-section space-y-2 min-w-0">
                <h3 className="mermaid-dsl-help-section-title text-sm font-semibold">标准 Mermaid 样式</h3>
                <p className="mermaid-dsl-help-section-desc text-sm text-muted-foreground">
                  节点、子图和连线也支持 Mermaid 原生 <code className="mermaid-dsl-help-inline-code rounded bg-muted px-1.5 py-0.5">style</code> 与 <code className="mermaid-dsl-help-inline-code rounded bg-muted px-1.5 py-0.5">linkStyle</code>。
                </p>
                <div className="mermaid-dsl-help-native-example overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-6 min-w-0">
                  <div className="mermaid-dsl-help-native-example-line whitespace-nowrap">style A fill:#E1F5EE,stroke:#0F6E56,color:#085041,stroke-width:3px</div>
                  <div className="mermaid-dsl-help-native-example-line whitespace-nowrap">linkStyle 0 stroke:#0F6E56,stroke-width:2px</div>
                  <div className="mermaid-dsl-help-native-example-line whitespace-nowrap">linkStyle 1 stroke:#993C1D,stroke-dasharray:5 5,stroke-width:1px</div>
                </div>
              </section>

              <section className="mermaid-dsl-help-section mermaid-dsl-help-example-section space-y-2 min-w-0">
                <div className="mermaid-dsl-help-section-head flex items-center justify-between gap-2">
                  <h3 className="mermaid-dsl-help-section-title text-sm font-semibold">示例</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mermaid-dsl-help-copy-example h-7 text-xs shrink-0"
                    onClick={() => handleCopy('example', DSL_EXAMPLE)}
                  >
                    {copiedTarget === 'example' ? <Check className="mermaid-dsl-help-copy-icon h-3.5 w-3.5 mr-1" /> : <Copy className="mermaid-dsl-help-copy-icon h-3.5 w-3.5 mr-1" />}
                    复制
                  </Button>
                </div>
                <pre className="mermaid-dsl-help-code-block mermaid-dsl-help-example-code max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5 min-w-0">
                  <code>{DSL_EXAMPLE}</code>
                </pre>
              </section>
            </TabsContent>

            <TabsContent value="prompt" className="mermaid-dsl-help-prompt-tab m-0 space-y-3 min-w-0">
              <div className="mermaid-dsl-help-prompt-head flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="mermaid-dsl-help-prompt-desc text-sm text-muted-foreground">
                  复制后发给第三方 AI，再补充你的图表主题和内容要求。
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mermaid-dsl-help-copy-prompt h-7 text-xs shrink-0 self-start sm:self-auto"
                  onClick={() => handleCopy('prompt', LLM_PROMPT)}
                >
                  {copiedTarget === 'prompt' ? <Check className="mermaid-dsl-help-copy-icon h-3.5 w-3.5 mr-1" /> : <Copy className="mermaid-dsl-help-copy-icon h-3.5 w-3.5 mr-1" />}
                  复制提示词
                </Button>
              </div>
              <pre className="mermaid-dsl-help-code-block mermaid-dsl-help-prompt-code max-h-[54vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5 whitespace-pre-wrap break-words min-w-0">
                <code>{LLM_PROMPT}</code>
              </pre>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function DslRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="mermaid-dsl-help-prop-row rounded-md border bg-background px-3 py-2 min-w-0">
      <code className="mermaid-dsl-help-prop-name text-xs font-semibold">{name}</code>
      <div className="mermaid-dsl-help-prop-desc mt-1 text-xs text-muted-foreground">{desc}</div>
    </div>
  )
}
