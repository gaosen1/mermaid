/**
 * MermaidRenderer 组件常量配置
 */

/** 视图控制相关常量 */
export const VIEW_CONFIG = {
  /** 重置视图时的水平偏移量（避开左侧面板） */
  HORIZONTAL_CENTER_OFFSET: 400,
  /** 容器内边距 */
  PADDING: 32,
  /** 最小缩放比例 */
  MIN_SCALE: 0.1,
  /** 最大缩放比例 */
  MAX_SCALE: 5,
  /** 缩小系数 */
  ZOOM_OUT_FACTOR: 0.9,
  /** 放大系数 */
  ZOOM_IN_FACTOR: 1.1,
} as const

/** 边缘点击区域配置 */
export const EDGE_CONFIG = {
  /** 点击热区宽度 */
  HIT_AREA_WIDTH: '14px',
} as const

/** 渲染配置 */
export const RENDER_CONFIG = {
  /** 用户输入时的防抖延迟（毫秒） */
  DEBOUNCE_DELAY: 300,
  /** UI 操作（如切换形状）的防抖延迟（毫秒） */
  UI_ACTION_DELAY: 50,
} as const
