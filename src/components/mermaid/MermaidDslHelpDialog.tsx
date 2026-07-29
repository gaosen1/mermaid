import { useCallback, useState } from 'react'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { BookOpenText, Check, Copy, Download } from 'lucide-react'
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
2. 节点文字必须使用双引号包裹，例如 A["节点文本"]。
3. 节点文字或连线文字需要换行时，使用 <br>，不要使用真实换行符。
4. 使用 flowchart/graph 语法时，可以给节点追加平台扩展语法：
   NODE_ID@{fill:#HEX;stroke:#HEX;color:#HEX;stroke-width:2px;stroke-style:dotted;animation:pulse}[节点文本]
5. 节点扩展属性说明：
   - fill：节点背景色，例如 #E1F5EE
   - stroke：节点边框色，例如 #0F6E56
   - color：节点文字颜色，例如 #085041
   - stroke-width：边框宽度，例如 1px、2px、3px
   - stroke-style：支持 normal、dotted、thick
   - animation：支持 pulse、blink、slow、fast、march、march-fast、march-none
6. 也可以使用 Mermaid 原生 style 指令设置节点或 subgraph：
   style NODE_ID fill:#E1F5EE,stroke:#0F6E56,color:#085041,stroke-width:3px
7. 可以使用 Mermaid 原生 linkStyle 指令设置连线，连线编号从 0 开始：
   linkStyle 0 stroke:#0F6E56,stroke-width:2px
   linkStyle 1 stroke:#993C1D,stroke-dasharray:5 5,stroke-width:1px
8. 平台额外支持以下连线动画 CSS：
   - animation:mermaid-edge-dash 1.5s linear infinite
   - animation:mermaid-edge-dash 0.6s linear infinite
   - animation:mermaid-edge-dash-leader 3s linear infinite
   - animation:mermaid-edge-dash-leader 1.2s linear infinite
9. 如无特殊说明，自定义样式优先使用暗色主题：深色填充搭配高对比度的浅色文字和边框，保证可读性。
10. 节点 ID 使用英文、数字或下划线，避免中文 ID；中文放在节点文本里。

请基于我的需求生成一份结构清晰、颜色分组明确、包含必要自定义样式的 Mermaid 图。`

// 三个反引号字符，用于拼接 Markdown 代码围栏，避免在模板字符串里直接写反引号
const FENCE = String.fromCharCode(96, 96, 96)

// 可下载的 Skill 文件内容（供支持 Skills 的 AI 助手，如 Claude，直接加载，
// 之后每次生成图表都会自动遵守这套规则，无需每次手动粘贴 LLM_PROMPT）
const SKILL_MD = `---
name: mermaid-custom-syntax
description: 生成或修改 Mermaid flowchart/graph 图表代码，且需要用到本平台在官方 Mermaid 语法之外扩展的节点/连线样式与动画写法（如 NODE_ID@{fill:...;stroke:...;animation:...} 简写、linkStyle 的平台专属动画值）时使用。只要用户提到"生成 Mermaid 图""画流程图""给节点/连线上色或加动画"，且明确说明是给这个自定义 Mermaid 平台用的，就应主动使用本 skill，即使用户没有逐字复述语法细节。
---

# Mermaid 自定义样式生成规则

本平台在官方 Mermaid 渲染的基础上，为 flowchart/graph 图追加了一套节点/连线的颜色与动画简写语法，渲染前会转译成 Mermaid 原生的 class/style/linkStyle 指令。按以下规则生成代码，图表在这个平台里才会正确显示颜色和动画效果；如果目标不是这个平台（只是要一段能在别处渲染的标准 Mermaid），可以忽略这些扩展写法，只用标准语法即可。此扩展语法只对 flowchart/graph 生效，其他图表类型（sequenceDiagram、classDiagram 等）请只用标准 Mermaid 语法。

## 输出要求

- 只输出 Mermaid 代码本身，不要输出代码块之外的解释文字。
- 节点文字用双引号包裹，例如 A["节点文本"]；需要换行时用 <br>，不要用真实换行符（会被解析成新语句）。
- 节点 ID 用英文字母、数字或下划线，避免中文，中文内容放进节点文本里。
- 如无特殊说明，自定义样式优先使用暗色主题：节点采用深色 fill，搭配高对比度的浅色 stroke 和 color，保证可读性。

## 节点扩展语法：NODE_ID@{...}

写在节点定义的方括号前面：

${FENCE}
NODE_ID@{fill:#HEX;stroke:#HEX;color:#HEX;stroke-width:2px;stroke-style:dotted;animation:pulse}["节点文本"]
${FENCE}

支持的属性（都可选，按需组合）：

| 属性 | 说明 | 取值 |
|---|---|---|
| fill | 节点背景色 | 十六进制颜色，如 #E1F5EE |
| stroke | 节点边框色 | 十六进制颜色，如 #0F6E56 |
| color | 节点文字颜色 | 十六进制颜色，如 #085041 |
| stroke-width | 边框宽度 | 如 1px、2px、3px |
| stroke-style | 边框样式 | normal、dotted、thick |
| animation | 节点动画 | pulse、blink、slow、fast、march、march-fast、march-none |

渲染前平台会把这段 @{...} 转成 "class NODE_ID animation-<name>;" 和 "style NODE_ID fill:...,stroke:..." 两条原生指令，节点本身只保留 ID——生成代码时不用担心 Mermaid 官方不认识 @{...}，平台会处理好。

## 原生 style / linkStyle 也可以直接用

节点、subgraph 和连线也能直接写 Mermaid 原生指令：

${FENCE}
style A fill:#E1F5EE,stroke:#0F6E56,color:#085041,stroke-width:3px
linkStyle 0 stroke:#0F6E56,stroke-width:2px
linkStyle 1 stroke:#993C1D,stroke-dasharray:5 5,stroke-width:1px
${FENCE}

linkStyle 的编号从 0 开始，按连线在代码里出现的先后顺序编号。

## 连线动画：平台专属的 linkStyle 动画值

标准 Mermaid 没有连线动画，平台通过 CSS 扩展了 4 种效果，写在 linkStyle 的 animation 属性里，照抄下面的值即可（时长决定了平台会把它识别成"慢/快/慢-带光点/快-带光点"哪一种预设）：

${FENCE}
linkStyle 0 stroke:#0F6E56,animation:mermaid-edge-dash 1.5s linear infinite          /* 慢速虚线流动 */
linkStyle 1 stroke:#993C1D,animation:mermaid-edge-dash 0.6s linear infinite         /* 快速虚线流动 */
linkStyle 2 stroke:#0F6E56,animation:mermaid-edge-dash-leader 3s linear infinite    /* 慢速，带一个流动光点 */
linkStyle 3 stroke:#993C1D,animation:mermaid-edge-dash-leader 1.2s linear infinite  /* 快速，带一个流动光点 */
${FENCE}

## 配色建议

如无特殊说明，优先使用暗色主题：深色填充搭配高对比度的浅色边框和文字，保证文字可读；用颜色给节点分组时，同一组内颜色尽量统一。

## 完整示例

${FENCE}
graph TD
  A@{fill:#E1F5EE;stroke:#0F6E56;color:#085041;stroke-style:thick;animation:pulse}["开始"]
  B@{fill:#EEEDFE;stroke:#534AB7;color:#3C3489;stroke-style:dotted}["处理"]
  C@{fill:#FAECE7;stroke:#993C1D;color:#712B13;animation:blink}["结束"]
  A --> B --> C

  linkStyle 0 stroke:#0F6E56,stroke-width:2px,animation:mermaid-edge-dash 1.5s linear infinite
  linkStyle 1 stroke:#993C1D,stroke-dasharray:5 5,stroke-width:1px
${FENCE}
`

export function MermaidDslHelpDialog({ open, onOpenChange }: MermaidDslHelpDialogProps) {
  const [copiedTarget, setCopiedTarget] = useState<'example' | 'prompt' | null>(null)

  const handleCopy = useCallback(async (target: 'example' | 'prompt', text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedTarget(target)
    window.setTimeout(() => setCopiedTarget(null), 1400)
  }, [])

  const handleDownloadSkill = useCallback(async () => {
    const zip = new JSZip()
    zip.file('mermaid-custom-syntax/SKILL.md', SKILL_MD)
    const blob = await zip.generateAsync({ type: 'blob' })
    saveAs(blob, 'mermaid-custom-syntax.zip')
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mermaid-dsl-help-dialog max-w-[min(1120px,calc(100vw-2rem))]! max-h-[88vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="mermaid-dsl-help-header px-5 pt-5 pb-3 border-b min-w-0">
          <DialogTitle className="mermaid-dsl-help-title flex items-center gap-2 text-base min-w-0 pr-8">
            <BookOpenText className="mermaid-dsl-help-title-icon h-4 w-4 shrink-0" />
            自定义 Mermaid 样式
          </DialogTitle>
          <DialogDescription className="mermaid-dsl-help-description pr-8">
            当前平台在官方 Mermaid 渲染能力之外支持的样式写法，可复制 LLM 提示词，或下载为 Skill 文件供支持 Skills 的 AI 助手长期复用
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
                  <DslRow name="animation" desc="pulse、blink、slow、fast、march、march-fast、march-none" />
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
                  复制后发给第三方 AI，再补充你的图表主题和内容要求；或下载为 Skill 文件，上传给支持 Skills 的 AI 助手（如 Claude）后就能长期自动生效，不用每次手动粘贴。
                </p>
                <div className="mermaid-dsl-help-prompt-actions flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="mermaid-dsl-help-download-skill h-7 text-xs"
                    onClick={handleDownloadSkill}
                  >
                    <Download className="mermaid-dsl-help-download-icon h-3.5 w-3.5 mr-1" />
                    下载 Skill
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mermaid-dsl-help-copy-prompt h-7 text-xs"
                    onClick={() => handleCopy('prompt', LLM_PROMPT)}
                  >
                    {copiedTarget === 'prompt' ? <Check className="mermaid-dsl-help-copy-icon h-3.5 w-3.5 mr-1" /> : <Copy className="mermaid-dsl-help-copy-icon h-3.5 w-3.5 mr-1" />}
                    复制提示词
                  </Button>
                </div>
              </div>
              <pre className="mermaid-dsl-help-code-block mermaid-dsl-help-prompt-code max-h-[54vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5 whitespace-pre-wrap wrap-break-word min-w-0">
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
