/**
 * 快捷键绑定模块
 *
 * 集中管理画布/编辑器的交互快捷键。默认绑定内置，
 * 未来支持用户自定义时，只需把覆盖写入 localStorage（SHORTCUT_OVERRIDES_KEY）。
 */

export interface MouseDragBinding {
  kind: 'mouse-drag'
  /** 鼠标按键：0 左键、1 中键、2 右键 */
  button: number
  /** 是否要求同时按住空格 */
  withSpace?: boolean
}

export type ShortcutBinding = MouseDragBinding

export interface ShortcutDefinition {
  id: string
  label: string
  description: string
  binding: ShortcutBinding
}

const SHORTCUT_OVERRIDES_KEY = 'shortcut-overrides'

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'canvas.pan',
    label: '拖动画布',
    description: '按住鼠标右键拖动',
    binding: { kind: 'mouse-drag', button: 2 },
  },
  {
    id: 'canvas.pan.space',
    label: '拖动画布（空格）',
    description: '按住空格 + 鼠标左键拖动',
    binding: { kind: 'mouse-drag', button: 0, withSpace: true },
  },
]

/** 读取默认绑定并合并用户自定义覆盖（预留） */
export function getShortcuts(): ShortcutDefinition[] {
  let overrides: Record<string, ShortcutBinding> = {}
  try {
    const raw = localStorage.getItem(SHORTCUT_OVERRIDES_KEY)
    if (raw) overrides = JSON.parse(raw)
  } catch {
    // 忽略 localStorage 错误
  }

  return DEFAULT_SHORTCUTS.map((shortcut) =>
    overrides[shortcut.id] ? { ...shortcut, binding: overrides[shortcut.id] } : shortcut
  )
}

export interface MouseDragState {
  button: number
  spaceDown: boolean
}

/** 匹配当前鼠标拖动状态命中的快捷键（如 canvas.pan / canvas.pan.space） */
export function matchMouseDragShortcut(state: MouseDragState): ShortcutDefinition | null {
  return (
    getShortcuts().find(
      (shortcut) =>
        shortcut.binding.kind === 'mouse-drag' &&
        shortcut.binding.button === state.button &&
        (shortcut.binding.withSpace ? state.spaceDown : true)
    ) ?? null
  )
}

// ============ 空格键状态追踪 ============

let spaceDown = false
let installed = false
const spaceListeners = new Set<(down: boolean) => void>()

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return Boolean(
    el.isContentEditable ||
      el.closest('input, textarea, select, .cm-content, .cm-editor, [contenteditable="true"]')
  )
}

function notifySpace(down: boolean): void {
  spaceListeners.forEach((listener) => listener(down))
}

function installSpaceTracker(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || isEditableTarget(e.target)) return
    if (!e.repeat) {
      spaceDown = true
      notifySpace(true)
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return
    spaceDown = false
    notifySpace(false)
  })
  window.addEventListener('blur', () => {
    if (spaceDown) {
      spaceDown = false
      notifySpace(false)
    }
  })
}

export function isSpaceDown(): boolean {
  installSpaceTracker()
  return spaceDown
}

/** 订阅空格键状态变化（供 React 组件更新光标等 UI） */
export function subscribeSpaceDown(listener: (down: boolean) => void): () => void {
  installSpaceTracker()
  spaceListeners.add(listener)
  return () => spaceListeners.delete(listener)
}
