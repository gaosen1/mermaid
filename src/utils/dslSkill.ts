// 三个反引号字符，用于拼接 Markdown 代码围栏，避免在模板字符串里直接写反引号
const FENCE = String.fromCharCode(96, 96, 96)

// 可下载的 Skill 文件内容（供支持 Skills 的 AI 助手，如 Claude，直接加载，
// 之后每次生成图表都会自动遵守这套规则，无需每次手动粘贴 LLM_PROMPT）
export const SKILL_MD = `---
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

linkStyle 的编号从 0 开始，按连线在代码里出现的先后顺序编号。注意：编号数量必须与连线数量严格一致，写出越界编号（例如 11 条连线却写 linkStyle 12）会导致渲染崩溃。

## 连线动画：平台专属的 linkStyle 动画值

标准 Mermaid 没有连线动画，平台通过 CSS 扩展了 4 种效果，写在 linkStyle 的 animation 属性里，照抄下面的值即可（时长决定了平台会把它识别成"慢/快/慢-带光点/快-带光点"哪一种预设）：

${FENCE}
linkStyle 0 stroke:#0F6E56,animation:mermaid-edge-dash 1.5s linear infinite          /* 慢速虚线流动 */
linkStyle 1 stroke:#993C1D,animation:mermaid-edge-dash 0.6s linear infinite         /* 快速虚线流动 */
linkStyle 2 stroke:#0F6E56,animation:mermaid-edge-dash-leader 3s linear infinite    /* 慢速，带一个流动光点 */
linkStyle 3 stroke:#993C1D,animation:mermaid-edge-dash-leader 1.2s linear infinite  /* 快速，带一个流动光点 */
${FENCE}

## 配色建议

如无特殊说明，优先使用暗色主题：深色填充搭配高对比度的浅色边框和文字，保证文字可读；用颜色给节点分组时，同一组内颜色尽量统一。除非用户明确要求，避免使用 blink 闪烁动画（闪烁影响阅读体验）；需要强调节点时优先使用 pulse 或连线动画。

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
