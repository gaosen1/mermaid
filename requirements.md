# 本地版 mermaid.com 需求说明（React 方案）

## 目标
- 构建本地版 mermaid.com，管理多个 Mermaid 项目（创建、导入、导出、版本快照、标签过滤），支持渲染预览。
- 预留可视化编辑器入口与接口（本版不实现拖拽/可视化编辑功能）。

## 技术栈
- React + Vite，状态管理使用 Zustand 或 Redux Toolkit。
- UI 库建议 Mantine 或 Chakra（便于主题和色板定制）。
- Mermaid v10+，启用 `layout: elk`，依赖 `@mermaid-js/mermaid-elk`。

## 渲染与配置
- 支持每张图使用前置 frontmatter 指定渲染配置：
  ```md
  ---
  config:
    layout: elk
  ---
  graph TD
    ...
  ```
- 初始化示例：
  ```ts
  import mermaid from 'mermaid';
  import mermaidElk from '@mermaid-js/mermaid-elk';

  mermaid.registerLayout('elk', mermaidElk);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    layout: 'elk',
    theme: 'base',
    flowchart: { curve: 'basis' },
  });
  ```

## DSL 扩展（样式与动画）
- 支持 `NODE@{ animation: slow }` 语法，预处理转译为 `class NODE animation-slow;` 并在渲染容器注入 CSS：
  ```css
  .animation-slow path { stroke-dasharray: 5 5; animation: dash 4s linear infinite; }
  @keyframes dash { to { stroke-dashoffset: -100; } }
  ```
- 继续保留 Mermaid 原生样式：`style NODE fill:#A5D6A7,stroke:#333,stroke-width:1px`。
- 支持 `NODE@{ fill:#...; color:#... }` 转换为 `classDef` 或内联 `style`，实现节点背景色、文字色、边框粗细等。

## 功能清单
- 项目管理：列表、创建、重命名、删除、导入/导出（.mmd/.zip/.json）、标签与分组、按更新时间或标签过滤搜索。
- 图表管理：每项目多图，查看源码与渲染预览，主题切换（默认/暗色/自定义），导出 PNG/SVG。
- 历史与版本：手动/自动快照，可回退。
- 配置：本地用户设置（语言、主题、默认导出格式、渲染主题），基础热键（保存/导出）。
- 预留可视化编辑器入口：按钮 “可视化编辑器（即将上线）”，暴露 `EditorAPI`：
  ```ts
  type GraphModel = { id: string; name: string; source: string; lastModified: number; metadata?: Record<string, any>; };
  type EditorAPI = {
    loadGraph(graph: GraphModel): void;
    saveGraph(partial: Pick<GraphModel, 'id' | 'source'>): Promise<void>;
  };
  ```

## 存储与导入导出
- 首选 IndexedDB（Dexie）保存项目与图表。
- 导出：单图 `.mmd`，项目 `.zip`；导入时保留 frontmatter 与 `config`。

## UX 规则
- 清晰导航：项目列表/详情/图预览；空态与错误态提示。
- 渲染错误：捕获并展示 mermaid 渲染错误，提供“复制错误详情”。
- 布局切换：UI 允许在 elk/dagre 等布局间切换，默认 elk。

## 交付说明
- README 需说明安装/启动命令（pnpm/yarn/npm）、本地存储位置。
- 说明主题、导出格式、语言的默认值如何修改。
- 记录 DSL 预处理规则与示例，方便未来扩展可视化编辑器。
