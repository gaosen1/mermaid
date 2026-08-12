import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { mermaid } from 'codemirror-lang-mermaid'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  readOnly?: boolean
  darkMode?: boolean
  language?: 'mermaid' | 'markdown' | 'plain'
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
  },
  '.cm-scroller': {
    overflow: 'auto !important', // 确保横向和纵向都可滚动
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    // 滚动条样式优化
    scrollbarWidth: 'thin',
    scrollbarColor: 'transparent transparent',
    '&:hover': {
      scrollbarColor: 'rgba(155, 155, 155, 0.5) transparent',
    },
  },
  '.cm-scroller::-webkit-scrollbar': {
    width: '6px',
    height: '6px',
  },
  '.cm-scroller::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'transparent',
    borderRadius: '3px',
  },
  '.cm-scroller:hover::-webkit-scrollbar-thumb': {
    background: 'rgba(155, 155, 155, 0.5)',
  },
  '.cm-scroller::-webkit-scrollbar-thumb:hover': {
    background: 'rgba(155, 155, 155, 0.7)',
  },
  '.cm-content': {
    padding: '12px 0',
    paddingBottom: '50vh',
    minWidth: 'max-content', // 允许内容超出容器宽度以启用横向滚动
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    border: 'none',
    paddingLeft: '8px',
    position: 'sticky',
    left: 0,
    zIndex: 10,
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 0',
    minWidth: '32px',
  },
  // ── 查找/替换面板现代化样式（CM6 默认面板无样式）──
  '.cm-panels': {
    backgroundColor: 'transparent',
    color: 'inherit',
  },
  '.cm-panel.cm-search': {
    padding: '8px 12px',
    background: 'var(--muted)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
  },
  '.cm-panel.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--muted-foreground)',
  },
  '.cm-panel .cm-textfield': {
    height: '28px',
    width: '170px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    padding: '0 8px',
    fontSize: '12px',
    outline: 'none',
  },
  '.cm-panel .cm-textfield:focus': {
    borderColor: 'var(--muted-foreground)',
  },
  '.cm-panel .cm-button': {
    height: '26px',
    padding: '0 10px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  '.cm-panel .cm-button:hover': {
    background: 'var(--accent)',
  },
  '.cm-panel button[name="close"]': {
    marginLeft: 'auto',
    width: '26px',
    height: '26px',
    padding: '0',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    cursor: 'pointer',
  },
  '.cm-panel input[type="checkbox"]': {
    accentColor: 'var(--foreground)',
  },
  '.cm-searchMatch': {
    background: 'color-mix(in oklch, var(--foreground) 18%, transparent)',
  },
  '.cm-searchMatch-selected': {
    background: 'color-mix(in oklch, var(--foreground) 38%, transparent)',
  },
})

const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
  },
  '.cm-gutters': {
    backgroundColor: '#ffffff',
    color: '#999',
  },
})

const darkThemeOverride = EditorView.theme({
  '.cm-gutters': {
    backgroundColor: '#282c34',
  },
})

export function CodeEditor({
  value,
  onChange,
  className,
  placeholder = '在此输入 Mermaid 代码...',
  readOnly = false,
  darkMode = false,
  language = 'mermaid',
}: CodeEditorProps) {
  // 稳定 extensions 引用：避免每次 React 重渲染都触发 CodeMirror reconfigure，
  // 否则查找/替换面板的运行时状态会被重置（表现为点 replace 后面板消失）
  const extensions = useMemo(
    () =>
      [
        language === 'mermaid' ? mermaid() : language === 'markdown' ? markdown() : [],
        baseTheme,
        darkMode ? oneDark : lightTheme,
        darkMode ? darkThemeOverride : [],
      ].flat(),
    [language, darkMode]
  )

  const handleChange = useCallback((nextValue: string) => {
    onChange(nextValue.replace(/\\n/g, '<br>'))
  }, [onChange])

  // 稳定 basicSetup 引用：react-codemirror 的 reconfigure effect 依赖它，
  // 引用变化会导致编辑器重配置、查找/替换面板状态丢失
  const basicSetupOptions = useMemo(
    () => ({
      lineNumbers: true,
      highlightActiveLineGutter: true,
      highlightActiveLine: true,
      foldGutter: false,
      dropCursor: true,
      allowMultipleSelections: true,
      indentOnInput: true,
      bracketMatching: true,
      closeBrackets: true,
      autocompletion: false,
      rectangularSelection: true,
      crosshairCursor: false,
      highlightSelectionMatches: true,
    }),
    []
  )

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        extensions={extensions}
        theme={darkMode ? 'dark' : 'light'}
        basicSetup={basicSetupOptions}
        className="h-full"
      />
    </div>
  )
}
