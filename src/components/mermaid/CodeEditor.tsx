import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { cn } from '@/lib/utils'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  readOnly?: boolean
  darkMode?: boolean
}

const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '.cm-content': {
    padding: '12px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    paddingLeft: '8px',
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
    color: '#999',
  },
})

export function CodeEditor({
  value,
  onChange,
  className,
  placeholder = '在此输入 Mermaid 代码...',
  readOnly = false,
  darkMode = false,
}: CodeEditorProps) {
  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        extensions={[markdown(), baseTheme, darkMode ? oneDark : lightTheme]}
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
