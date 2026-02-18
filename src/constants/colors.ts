export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral' | 'base'

export interface PaletteColor {
  tw: string     // Tailwind bg 类名
  hex: string    // HEX 值（写入 Mermaid source）
  label: string  // tooltip
}

/** Mermaid 主题画布是否为深色背景 */
export function isMermaidThemeDark(theme: MermaidTheme): boolean {
  return theme === 'dark'
}

// 亮色画布调色板（default/forest/neutral/base）
const LIGHT_BG_PALETTE: PaletteColor[] = [
  // Row 1：基础色 -500
  { tw: 'bg-red-500',    hex: '#ef4444', label: 'Red' },
  { tw: 'bg-orange-500', hex: '#f97316', label: 'Orange' },
  { tw: 'bg-yellow-500', hex: '#eab308', label: 'Yellow' },
  { tw: 'bg-green-500',  hex: '#22c55e', label: 'Green' },
  { tw: 'bg-teal-500',   hex: '#14b8a6', label: 'Teal' },
  { tw: 'bg-blue-500',   hex: '#3b82f6', label: 'Blue' },
  // Row 2：深色变体 -700
  { tw: 'bg-red-700',    hex: '#b91c1c', label: 'Red Deep' },
  { tw: 'bg-orange-700', hex: '#c2410c', label: 'Orange Deep' },
  { tw: 'bg-yellow-700', hex: '#a16207', label: 'Yellow Deep' },
  { tw: 'bg-green-700',  hex: '#15803d', label: 'Green Deep' },
  { tw: 'bg-teal-700',   hex: '#0f766e', label: 'Teal Deep' },
  { tw: 'bg-blue-700',   hex: '#1d4ed8', label: 'Blue Deep' },
  // Row 3：补充色 + 灰色
  { tw: 'bg-violet-500', hex: '#8b5cf6', label: 'Violet' },
  { tw: 'bg-purple-500', hex: '#a855f7', label: 'Purple' },
  { tw: 'bg-pink-500',   hex: '#ec4899', label: 'Pink' },
  { tw: 'bg-gray-500',   hex: '#6b7280', label: 'Gray' },
  { tw: 'bg-gray-700',   hex: '#374151', label: 'Gray Dark' },
  { tw: 'bg-gray-800',   hex: '#1f2937', label: 'Gray Deep' },
]

// 暗色画布调色板（dark 主题）
const DARK_BG_PALETTE: PaletteColor[] = [
  // Row 1：基础色 -400
  { tw: 'bg-red-400',    hex: '#f87171', label: 'Red' },
  { tw: 'bg-orange-400', hex: '#fb923c', label: 'Orange' },
  { tw: 'bg-yellow-400', hex: '#facc15', label: 'Yellow' },
  { tw: 'bg-green-400',  hex: '#4ade80', label: 'Green' },
  { tw: 'bg-teal-400',   hex: '#2dd4bf', label: 'Teal' },
  { tw: 'bg-blue-400',   hex: '#60a5fa', label: 'Blue' },
  // Row 2：亮色变体 -300
  { tw: 'bg-red-300',    hex: '#fca5a5', label: 'Red Deep' },
  { tw: 'bg-orange-300', hex: '#fdba74', label: 'Orange Deep' },
  { tw: 'bg-yellow-300', hex: '#fde047', label: 'Yellow Deep' },
  { tw: 'bg-green-300',  hex: '#86efac', label: 'Green Deep' },
  { tw: 'bg-teal-300',   hex: '#5eead4', label: 'Teal Deep' },
  { tw: 'bg-blue-300',   hex: '#93c5fd', label: 'Blue Deep' },
  // Row 3：补充色 + 灰色
  { tw: 'bg-violet-400', hex: '#a78bfa', label: 'Violet' },
  { tw: 'bg-purple-400', hex: '#c084fc', label: 'Purple' },
  { tw: 'bg-pink-400',   hex: '#f472b6', label: 'Pink' },
  { tw: 'bg-gray-400',   hex: '#9ca3af', label: 'Gray' },
  { tw: 'bg-gray-300',   hex: '#d1d5db', label: 'Gray Dark' },
  { tw: 'bg-gray-200',   hex: '#e5e7eb', label: 'Gray Deep' },
]

/** 根据 Mermaid 主题返回调色板 */
export function getColorPalette(theme: MermaidTheme): PaletteColor[] {
  return isMermaidThemeDark(theme) ? DARK_BG_PALETTE : LIGHT_BG_PALETTE
}
