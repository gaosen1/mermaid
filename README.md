# Mermaid Local

本地版 Mermaid 图表管理应用，支持项目管理、图表编辑、渲染预览和导入导出功能。

## 功能特性

- **项目管理**: 创建、重命名、删除、导入/导出项目
- **图表管理**: 每个项目支持多个图表，支持源码编辑和渲染预览
- **标签与过滤**: 项目标签管理，支持按标签过滤
- **版本历史**: 手动/自动快照保存，支持版本回退
- **主题切换**: 支持浅色/深色/跟随系统主题
- **布局引擎**: 支持 ELK 和 Dagre 布局切换
- **导出功能**: 支持 PNG/SVG 图片导出，项目 ZIP/JSON 导出
- **DSL 扩展**: 支持自定义动画和样式语法

## 技术栈

- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4 + shadcn/ui
- Zustand (状态管理)
- Dexie (IndexedDB 封装)
- Mermaid 11 + @mermaid-js/layout-elk

## 安装与运行

```bash
# 使用 pnpm (推荐)
pnpm install
pnpm dev

# 使用 yarn
yarn install
yarn dev

# 使用 npm
npm install
npm run dev
```

## 本地存储

数据保存在浏览器的 IndexedDB 中，数据库名称为 `MermaidLocalDB`，包含以下表：

- `projects`: 项目信息
- `diagrams`: 图表信息
- `snapshots`: 版本快照
- `settings`: 用户设置

## 配置说明

### 默认设置

可在设置页面修改以下默认值：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 语言 | 中文 | 界面语言 |
| 主题 | 跟随系统 | 应用主题模式 |
| 默认布局 | ELK | 新图表的布局引擎 |
| 渲染主题 | base | Mermaid 渲染主题 |
| 导出格式 | PNG | 默认图片导出格式 |
| 自动保存 | 30秒 | 编辑时自动保存间隔 |

### 主题配置

Mermaid 支持以下渲染主题：
- `default`: 默认主题
- `dark`: 暗色主题
- `forest`: 森林主题
- `neutral`: 中性主题
- `base`: 基础主题（推荐）

## DSL 扩展语法

### 动画语法

使用 `NODE@{ animation: <type> }` 为节点添加动画：

```mermaid
graph TD
    A@{ animation: slow }[开始] --> B[处理]
    B --> C@{ animation: pulse }[结束]
```

支持的动画类型：
- `slow`: 慢速流动动画
- `fast`: 快速流动动画
- `pulse`: 脉冲动画
- `blink`: 闪烁动画

### 样式语法

使用 `NODE@{ fill:#color; stroke:#color }` 为节点添加样式：

```mermaid
graph TD
    A@{ fill:#A5D6A7; color:#333 }[绿色节点] --> B[普通节点]
    B --> C@{ fill:#FFB74D; stroke:#333; stroke-width:2px }[橙色节点]
```

支持的样式属性：
- `fill`: 背景色
- `color`: 文字色
- `stroke`: 边框色
- `stroke-width`: 边框粗细

### Frontmatter 配置

每张图可使用前置 frontmatter 指定渲染配置：

```markdown
---
config:
  layout: elk
  theme: dark
---
graph TD
    A --> B
```

## EditorAPI 接口

为未来的可视化编辑器预留了 API 接口：

```typescript
interface GraphModel {
  id: string
  name: string
  source: string
  lastModified: number
  metadata?: Record<string, unknown>
}

interface EditorAPI {
  loadGraph(graph: GraphModel): void
  saveGraph(partial: Pick<GraphModel, 'id' | 'source'>): Promise<void>
}

// 使用方式
window.MermaidEditorAPI?.loadGraph({ ... })
```

## 热键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + S` | 保存当前图表 |

## 开发

```bash
# 开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 预览生产版本
pnpm preview

# 类型检查
pnpm tsc --noEmit
```

## 许可

MIT
