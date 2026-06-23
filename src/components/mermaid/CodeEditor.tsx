import CodeMirror from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
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
  const extensions = [
    language === 'mermaid' ? mermaid() : language === 'markdown' ? markdown() : [],
    baseTheme,
    darkMode ? oneDark : lightTheme,
    darkMode ? darkThemeOverride : [],
  ].flat()

  const handleChange = (nextValue: string) => {
    onChange(nextValue.replace(/\\n/g, '<br>'))
  }

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        extensions={extensions}
        theme={darkMode ? 'dark' : 'light'}
        basicSetup={{
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
        }}
        className="h-full"
      />
    </div>
  )
}
