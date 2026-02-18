# Mermaid 可视化编辑实现说明

## 1. 背景与范围

本文说明当前项目中 Mermaid 图的可视化编辑能力如何落地实现，目标读者为项目开发与维护人员。

覆盖范围：

- 画布渲染与交互（缩放、平移、选中、原地编辑）
- 边/节点/子图样式的可视化编辑与源码回写
- 代码编辑、自动保存、历史快照
- 导入导出（`.mmd`、PNG、SVG）
- 项目/图表选择与深链定位（`/project/:projectId/diagram/:diagramId`）

不展开：

- GitHub 同步引擎内部实现（仅在数据模型层面点到）

---

## 2. 整体架构（分层）

### 2.1 页面与路由层

- `src/components/layout/AppLayout.tsx`
  - 管理视图状态：`home | project | settings | theme-test`
  - 解析/生成路径：`/project/:projectId/diagram/:diagramId`
  - 将 `projectId/diagramId` 向下传给 `ProjectPage`
- `src/pages/ProjectPage.tsx`
  - 加载项目和图表列表
  - 根据 `initialDiagramId` 自动选中图表
  - 承载 `DiagramList` 和 `DiagramEditor`

### 2.2 编辑编排层

- `src/components/mermaid/DiagramEditor.tsx`
  - 编辑器主控组件，负责：
  - source/layout/theme 状态管理
  - 手动保存、自动保存、快照创建
  - 样式面板与渲染器联动
  - 导出动作触发

### 2.3 渲染与交互层

- `src/components/mermaid/MermaidRenderer.tsx`
  - Mermaid 初始化与渲染（含防抖）
  - SVG 交互绑定（边/节点/子图）
  - 暴露 `ref` 能力给 `DiagramEditor`（导出、重置、即时样式应用）

### 2.4 DSL 与写回层

- `src/utils/edgeDsl.ts`
  - 解析与写回 `linkStyle`
- `src/utils/nodeDsl.ts`
  - 节点/子图样式、形状、文字写回
- `src/utils/dsl.ts`
  - frontmatter 解析
  - 扩展语法（`NODE@{...}`）解析与动画 CSS 生成
- `src/components/mermaid/useSourceSync.ts`
  - 聚合改动并防抖回写 source

### 2.5 状态与持久化层

- `src/stores/diagramStore.ts`：图表与快照 CRUD
- `src/stores/projectStore.ts`：项目加载与选择
- `src/db/index.ts`：Dexie/IndexedDB 表结构

---

## 3. 核心数据模型

定义文件：`src/types/index.ts`

- `Project`
  - 项目元信息（名称、描述、标签、更新时间）
- `Diagram`
  - 图表核心实体：`source` + `config(layout/theme)` + 归属 `projectId`
- `Snapshot`
  - 图表历史记录：`diagramId`、`source`、`isAuto`
- `DiagramConfig`
  - 渲染配置：`layout`、`theme`

---

## 4. 端到端数据流

## 4.1 进入图表编辑页

1. `AppLayout` 解析路径并确定当前 `projectId/diagramId`。
2. `ProjectPage` 加载项目与图表列表，设置 `currentProject`。
3. 若路径带 `diagramId`，在图表列表加载后自动设置 `currentDiagram`。
4. `DiagramEditor` 根据 `currentDiagram` 初始化编辑状态并加载快照。

## 4.2 代码编辑（CodeEditor）

1. `CodeEditor` 输入变化 -> `handleSourceChange`。
2. `DiagramEditor` 更新 `editorState.source`，标记 `hasChanges=true`。
3. `MermaidRenderer` 监听 `source` 变化，防抖触发重渲染。
4. 自动保存定时器触发后调用 `handleSave(true)`。

## 4.3 样式面板编辑（边/节点/子图）

1. 用户点击 SVG 元素触发 selection hook。
2. `DiagramEditor` 打开 `EdgeStylePanel` 或 `NodeStylePanel`。
3. 样式变化先通过 `MermaidRenderer` 的 ref 直接写入 SVG（即时预览，不重渲染）。
4. 同时 `useSourceSync.recordStyleChange(...)` 记录变更，防抖写回 source。
5. 关闭面板时 `flushChanges()`，并触发自动保存。

## 4.4 节点文字原地编辑

1. 双击节点触发 `useInlineTextEdit.startEdit`，在 SVG 的 `span.nodeLabel` 上 `contenteditable` 编辑。
2. 结束编辑时回调 `recordTextChange`。
3. 文字变更属于结构变更：写回 source 后需要 Mermaid 重渲染。

## 4.5 保存与快照

保存逻辑位于 `DiagramEditor.handleSave`：

1. 先创建快照（保存“更新前”的 `currentDiagram.source`）。
2. 再 `updateDiagram` 持久化当前 source/config。
3. 清除 `hasChanges`。

支持两种触发方式：

- 手动保存：按钮或 `Ctrl/Cmd + S`
- 自动保存：`settings.autoSaveInterval`

---

## 5. 核心模块说明

## 5.1 `DiagramEditor`（编排中心）

关键职责：

- 维护 `source/layout/theme/hasChanges`
- 控制左右浮层（代码/历史）
- 管理选中状态：`selectedEdge`、`selectedNode`
- 协调三条编辑路径：
  - 代码编辑
  - 样式面板编辑
  - 原地文字编辑

关键点：

- 通过 `MermaidRendererRef` 调用：
  - `applyEdgeStyleDirect`
  - `applyNodeStyleDirect`
  - `applySubgraphStyleDirect`
  - `exportPng/exportSvg`
- 通过 `useSourceSync` 将 UI 操作统一回写到 source

## 5.2 `MermaidRenderer`（渲染与交互）

关键职责：

- `initMermaid(layout, theme)` 初始化 Mermaid
- `renderMermaid` 执行渲染
- 300ms 防抖，避免高频输入反复重绘
- 渲染后绑定 SVG 交互：
  - `setupSvgEdgeInteraction`
  - `setupSvgNodeInteraction`
  - `setupSvgSubgraphInteraction`

优化策略：

- 样式专用 source 标记（`markStyleOnlySource`）用于跳过不必要重渲染
- 首次渲染后自动 `fitToContainer`
- 通过 `useImperativeHandle` 向上暴露编辑能力

## 5.3 `useSourceSync`（源码一致性）

核心作用：

- 聚合待提交变更（边样式/节点样式/形状/文字）
- 防抖提交，减少 source 频繁更新
- 区分：
  - 纯样式变更（可局部即时预览）
  - 结构变更（需要重渲染）

## 5.4 Selection 与原地编辑 Hook

- `useEdgeSelection`
  - 处理 ELK 与旧结构两类边元素
  - 维护选中索引，支持重渲染后恢复
- `useNodeSelection`
  - 支持节点与子图
  - 单击选中、双击编辑、Esc 取消
- `useInlineTextEdit`
  - 在 SVG 内直接编辑文本
  - 支持 `Enter` 提交、`Shift+Enter` 换行、`Esc` 取消

---

## 6. DSL 与 SVG 双通道编辑机制

项目采用“两条路径并行”的策略：

1. **视觉即时反馈通道（SVG DOM）**
   - 使用 `svgStyleApplier.ts` 直接改目标元素样式
   - 用户拖动/点选样式时反馈即时

2. **持久化一致性通道（Mermaid source）**
   - 使用 `edgeDsl/nodeDsl/useSourceSync` 回写 DSL
   - 最终以 source 为真值，保证刷新/重开后可恢复

对应关系：

- 边样式：`linkStyle`
- 节点/子图样式：`style <id> ...`
- 节点形状：节点定义语法替换
- 节点/子图文字：定义行文本替换

---

## 7. 周边能力（与可视化编辑强相关）

## 7.1 图表列表与深链

- `DiagramList` 负责图表创建、选择、导入 `.mmd`。
- 支持 `Cmd/Ctrl + 点击` 新标签打开深链：
  - `/project/:projectId/diagram/:diagramId`
- `AppLayout` 负责 URL 与内部状态同步（含前进后退）。

## 7.2 历史快照

- 存储于 `snapshots` 表。
- `DiagramEditor` 的“历史”页签支持：
  - 列表查看
  - 恢复快照
  - 删除快照

## 7.3 导出

- SVG 导出：直接序列化当前 SVG。
- PNG 导出：
  - 先从容器提取 SVG 与尺寸（`getPngSourceFromContainer`）
  - 再在 Canvas 中按目标宽高绘制，减少裁剪/空白问题

## 7.4 导入/导出 `.mmd`

- `exportDiagramToMmd` 会把 `config(layout/theme)` 以前置 frontmatter 写出。
- `importFromMmd` 会解析 frontmatter 并恢复 `Diagram.config`。

---

## 8. 已知限制与实现取舍

1. DSL 解析是正则+行级替换策略，复杂嵌套语法下存在边界风险。
2. Mermaid 渲染产物结构在不同布局/版本可能变化，选择器兼容需持续维护。
3. 即时 SVG 应用与最终 source 回写有短暂时序差（防抖窗口内）。
4. 快照策略当前是“保存前创建快照”，语义是回滚到上一个状态。

---

## 9. 维护建议

1. 新增可视化样式能力时，始终同时实现三部分：
   - SVG 即时应用
   - DSL 写回
   - 重渲染恢复验证
2. 升级 Mermaid 版本后优先回归：
   - 边/节点选中
   - 原地编辑
   - PNG/SVG 导出尺寸
3. 若未来扩展复杂语法，建议引入 AST 级解析替代当前行级替换。
4. 路由与编辑状态同步逻辑应避免在 cleanup 中写 URL，减少 StrictMode 下副作用风险。

---

## 10. 关键文件索引

- 路由与页面编排：
  - `src/components/layout/AppLayout.tsx`
  - `src/pages/ProjectPage.tsx`
- 编辑主流程：
  - `src/components/mermaid/DiagramEditor.tsx`
  - `src/components/mermaid/MermaidRenderer.tsx`
  - `src/components/mermaid/CodeEditor.tsx`
- 交互 Hook：
  - `src/components/mermaid/useSourceSync.ts`
  - `src/components/mermaid/useEdgeSelection.ts`
  - `src/components/mermaid/useNodeSelection.ts`
  - `src/components/mermaid/useInlineTextEdit.ts`
  - `src/components/mermaid/useViewTransform.ts`
- DSL/样式工具：
  - `src/utils/dsl.ts`
  - `src/utils/edgeDsl.ts`
  - `src/utils/nodeDsl.ts`
  - `src/components/mermaid/svgStyleApplier.ts`
  - `src/components/mermaid/svgUtils.ts`
  - `src/utils/mermaid.ts`
- 状态与存储：
  - `src/stores/diagramStore.ts`
  - `src/stores/projectStore.ts`
  - `src/db/index.ts`
- 导入导出：
  - `src/utils/export.ts`

