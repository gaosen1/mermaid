/**
 * 画布手势工具：统一各画布的滚轮/捏合映射策略。
 *
 * 默认 pan 模式（对齐 Figma/tldraw 习惯）：
 * - 触控板双指滑动 / 鼠标滚轮 = 平移画布
 * - 触控板捏合 / Ctrl(Cmd)+滚轮 = 以指针为锚点缩放（与普通缩放同档位）
 * zoom 模式保留旧习惯（滚轮 = 档位缩放）；auto 模式启发式区分设备。
 */

export type WheelMode = 'pan' | 'zoom' | 'auto'

const WHEEL_MODE_KEY = 'canvas-wheel-mode'

export function getWheelMode(): WheelMode {
  const v = localStorage.getItem(WHEEL_MODE_KEY)
  return v === 'zoom' || v === 'auto' ? v : 'pan'
}

export function setWheelMode(mode: WheelMode): void {
  localStorage.setItem(WHEEL_MODE_KEY, mode)
}

export interface WheelViewState {
  scale: number
  x: number
  y: number
}

interface WheelLike {
  deltaX: number
  deltaY: number
  ctrlKey: boolean
  metaKey: boolean
}

export interface WheelLimits {
  minScale: number
  maxScale: number
}

/** 启发式判断触控板：存在横向分量，或 deltaY 小而连续（鼠标滚轮档位通常 >= 100） */
export function isTrackpadWheel(e: WheelLike): boolean {
  if (e.deltaX !== 0) return true
  return Math.abs(e.deltaY) > 0 && Math.abs(e.deltaY) < 50
}

/** 以 anchor 为锚点缩放，返回新视图状态（导出供缩放按钮复用） */
export function zoomViewState(
  current: WheelViewState,
  anchor: { x: number; y: number },
  factor: number,
  limits: WheelLimits
): WheelViewState {
  const scale = Math.min(Math.max(current.scale * factor, limits.minScale), limits.maxScale)
  const ratio = scale / current.scale
  return {
    scale,
    x: anchor.x - (anchor.x - current.x) * ratio,
    y: anchor.y - (anchor.y - current.y) * ratio,
  }
}

/** 按当前滚轮行为设置计算 wheel 后的新视图状态 */
export function computeWheelTransform(
  e: WheelLike,
  anchor: { x: number; y: number },
  current: WheelViewState,
  limits: WheelLimits,
  mode: WheelMode = getWheelMode()
): WheelViewState {
  // 捏合（浏览器转为 ctrlKey+wheel）或 Ctrl/Cmd+滚轮：始终缩放
  if (e.ctrlKey || e.metaKey) {
    return zoomViewState(current, anchor, e.deltaY > 0 ? 0.9 : 1.1, limits)
  }
  const pan = mode === 'pan' || (mode === 'auto' && isTrackpadWheel(e))
  if (pan) {
    return { scale: current.scale, x: current.x - e.deltaX, y: current.y - e.deltaY }
  }
  // zoom 模式 / auto 判定为鼠标：档位缩放
  return zoomViewState(current, anchor, e.deltaY > 0 ? 0.9 : 1.1, limits)
}

/** 阻止 Safari 捏合手势触发浏览器整页缩放 */
export function bindGestureGuard(el: Element): () => void {
  const prevent = (e: Event) => e.preventDefault()
  const names = ['gesturestart', 'gesturechange', 'gestureend']
  names.forEach((n) => el.addEventListener(n, prevent))
  return () => names.forEach((n) => el.removeEventListener(n, prevent))
}
