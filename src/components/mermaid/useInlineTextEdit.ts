import { useCallback, useRef, useEffect } from 'react'
import type { SelectedNode } from './useNodeSelection'
import type { NodeType } from './svgUtils'

interface UseInlineTextEditOptions {
  onTextChange?: (nodeId: string, newText: string, nodeType: NodeType, originalText: string) => void
  onEditStart?: () => void
  onEditEnd?: () => void
}

/**
 * 将 HTML 内容转换为纯文本（保留换行）
 * 处理 <br> 标签和换行符
 */
function htmlToText(html: string): string {
  // 创建临时元素来解析 HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // 递归提取文本，将 <br> 转换为换行符
  function extractText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      if (element.tagName === 'BR') {
        return '\n'
      }
      let text = ''
      for (const child of Array.from(node.childNodes)) {
        text += extractText(child)
      }
      return text
    }
    return ''
  }

  return extractText(temp)
}

/**
 * 原地编辑节点文字的 Hook
 * 使用 contenteditable 直接在 SVG 的 span.nodeLabel 上编辑
 */
export function useInlineTextEdit({
  onTextChange,
  onEditStart,
  onEditEnd,
}: UseInlineTextEditOptions) {
  const editingNodeIdRef = useRef<string | null>(null)
  const editingNodeTypeRef = useRef<NodeType | null>(null)
  const originalTextRef = useRef<string>('')
  const currentSpanRef = useRef<HTMLSpanElement | null>(null)
  const foreignObjectRef = useRef<SVGForeignObjectElement | null>(null)
  const originalForeignObjectStyleRef = useRef<{
    width: string
    height: string
    overflow: string
  } | null>(null)
  // 用于防止重复调用 endEdit
  const isEndingRef = useRef(false)
  // 用于阻止 blur 后的点击事件触发 NodeStylePanel
  const justEndedRef = useRef(false)

  // 保持回调的最新引用
  const onTextChangeRef = useRef(onTextChange)
  const onEditStartRef = useRef(onEditStart)
  const onEditEndRef = useRef(onEditEnd)

  useEffect(() => {
    onTextChangeRef.current = onTextChange
    onEditStartRef.current = onEditStart
    onEditEndRef.current = onEditEnd
  }, [onTextChange, onEditStart, onEditEnd])

  /**
   * 查找节点的文字 span 元素
   * 支持普通节点和 subgraph
   */
  const findLabelSpan = useCallback((node: SelectedNode): HTMLSpanElement | null => {
    if (node.type === 'subgraph') {
      // subgraph 的文字在 g.cluster-label > foreignObject > div > span
      const clusterLabel = node.element.querySelector('.cluster-label')
      if (!clusterLabel) return null
      return clusterLabel.querySelector('span') as HTMLSpanElement | null
    }
    // 普通节点的文字在 foreignObject > div > span.nodeLabel
    return node.element.querySelector('span.nodeLabel') as HTMLSpanElement | null
  }, [])

  /**
   * 查找 foreignObject 元素
   * 支持普通节点和 subgraph
   */
  const findForeignObject = useCallback((node: SelectedNode): SVGForeignObjectElement | null => {
    if (node.type === 'subgraph') {
      // subgraph 的 foreignObject 在 g.cluster-label 内
      const clusterLabel = node.element.querySelector('.cluster-label')
      if (!clusterLabel) return null
      return clusterLabel.querySelector('foreignObject') as SVGForeignObjectElement | null
    }
    return node.element.querySelector('foreignObject') as SVGForeignObjectElement | null
  }, [])

  /**
   * 清理编辑状态和样式
   * @param restoreForeignObject 是否恢复 foreignObject 的原始尺寸（取消编辑时需要恢复，保存时不需要因为会重新渲染）
   */
  const cleanup = useCallback((
    span: HTMLSpanElement | null,
    foreignObject: SVGForeignObjectElement | null,
    restoreForeignObject: boolean = true
  ) => {
    if (span) {
      // 移除 contenteditable
      span.contentEditable = 'false'
      span.style.cursor = ''
      span.style.background = ''
      span.style.borderRadius = ''
      span.style.padding = ''
      span.style.margin = ''
      span.style.minWidth = ''
      span.style.outline = ''
      span.style.whiteSpace = ''
      span.style.display = ''
    }

    // 恢复 foreignObject 的原始样式（仅在取消编辑时）
    if (restoreForeignObject && foreignObject && originalForeignObjectStyleRef.current) {
      foreignObject.style.width = originalForeignObjectStyleRef.current.width
      foreignObject.style.height = originalForeignObjectStyleRef.current.height
      foreignObject.style.overflow = originalForeignObjectStyleRef.current.overflow
    }

    originalForeignObjectStyleRef.current = null
  }, [])

  /**
   * 结束编辑
   */
  const endEdit = useCallback((save: boolean = true) => {
    // 防止重复调用
    if (isEndingRef.current) return
    isEndingRef.current = true

    const span = currentSpanRef.current
    const foreignObject = foreignObjectRef.current
    const nodeId = editingNodeIdRef.current
    const nodeType = editingNodeTypeRef.current

    if (!span || !nodeId || !nodeType) {
      isEndingRef.current = false
      return
    }

    // 先获取编辑后的文本（在清理之前）
    const newText = htmlToText(span.innerHTML)
    const originalText = originalTextRef.current

    // 判断是否有变更
    const hasChanges = newText !== originalText

    // 清理样式
    // 如果保存且有变更，不恢复 foreignObject 尺寸（因为会重新渲染）
    // 如果取消或没有变更，恢复 foreignObject 尺寸
    cleanup(span, foreignObject, !save || !hasChanges)

    // 清理 refs
    currentSpanRef.current = null
    foreignObjectRef.current = null
    editingNodeIdRef.current = null
    editingNodeTypeRef.current = null
    originalTextRef.current = ''

    // 设置标记，阻止后续点击事件触发 NodeStylePanel
    justEndedRef.current = true
    setTimeout(() => {
      justEndedRef.current = false
    }, 300)

    if (save && hasChanges) {
      // 通知文字变更，传递原始文字用于 subgraph 标题匹配
      onTextChangeRef.current?.(nodeId, newText, nodeType, originalText)
    } else if (!save && span) {
      // 恢复原始文字（需要将换行符转回 <br>）
      span.innerHTML = originalText.replace(/\n/g, '<br>')
    }

    // 通知编辑结束
    onEditEndRef.current?.()

    isEndingRef.current = false
  }, [cleanup])

  /**
   * 开始编辑
   */
  const startEdit = useCallback((node: SelectedNode) => {
    // 如果已经在编辑，先结束
    if (editingNodeIdRef.current) {
      endEdit(true)
    }

    const span = findLabelSpan(node)
    if (!span) return false

    const foreignObject = findForeignObject(node)

    // 保存原始文字（将 <br> 转换为换行符以便比较）
    originalTextRef.current = htmlToText(span.innerHTML)
    editingNodeIdRef.current = node.id
    editingNodeTypeRef.current = node.type
    currentSpanRef.current = span
    foreignObjectRef.current = foreignObject

    // 保存 foreignObject 的原始样式
    if (foreignObject) {
      originalForeignObjectStyleRef.current = {
        width: foreignObject.style.width,
        height: foreignObject.style.height,
        overflow: foreignObject.style.overflow,
      }

      // 扩展 foreignObject 以支持多行编辑
      // 设置足够大的尺寸以容纳多行文字
      foreignObject.style.width = '300px'
      foreignObject.style.height = '200px'
      foreignObject.style.overflow = 'visible'
    }

    // 设置 contenteditable
    span.contentEditable = 'true'
    span.style.outline = 'none'
    span.style.cursor = 'text'
    span.style.minWidth = '20px'
    span.style.whiteSpace = 'pre-wrap'
    span.style.display = 'inline-block'

    // 添加编辑中的样式
    span.style.background = 'rgba(59, 130, 246, 0.1)'
    span.style.borderRadius = '2px'
    span.style.padding = '2px 4px'
    span.style.margin = '0 -4px'

    // 通知编辑开始
    onEditStartRef.current?.()

    // 事件处理函数
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        span.removeEventListener('keydown', handleKeyDown)
        span.removeEventListener('blur', handleBlur)
        endEdit(false)
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        span.removeEventListener('keydown', handleKeyDown)
        span.removeEventListener('blur', handleBlur)
        // 先失焦，避免后续点击事件
        span.blur()
        endEdit(true)
      } else if (e.key === 'Enter' && e.shiftKey) {
        // Shift+Enter: 插入换行
        e.preventDefault()
        e.stopPropagation()

        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          range.deleteContents()

          // 插入 <br> 元素
          const br = document.createElement('br')
          range.insertNode(br)

          // 在 <br> 后插入一个零宽空格，确保光标可以定位
          const textNode = document.createTextNode('\u200B')
          range.setStartAfter(br)
          range.insertNode(textNode)

          // 将光标移动到零宽空格后面
          range.setStartAfter(textNode)
          range.setEndAfter(textNode)
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }

    const handleBlur = () => {
      // 移除事件监听器
      span.removeEventListener('keydown', handleKeyDown)
      span.removeEventListener('blur', handleBlur)

      // 直接结束编辑，不使用 setTimeout
      // 因为我们已经在 endEdit 中设置了 justEndedRef 来阻止后续点击
      if (editingNodeIdRef.current === node.id) {
        endEdit(true)
      }
    }

    // 绑定事件
    span.addEventListener('keydown', handleKeyDown)
    span.addEventListener('blur', handleBlur)

    // 聚焦
    span.focus()

    // 选中全部文字
    requestAnimationFrame(() => {
      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(span)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    })

    return true
  }, [findLabelSpan, findForeignObject, endEdit])

  /**
   * 取消编辑
   */
  const cancelEdit = useCallback(() => {
    endEdit(false)
  }, [endEdit])

  /**
   * 检查是否正在编辑
   */
  const isEditing = useCallback(() => {
    return editingNodeIdRef.current !== null
  }, [])

  /**
   * 获取当前编辑的节点 ID
   */
  const getEditingNodeId = useCallback(() => {
    return editingNodeIdRef.current
  }, [])

  /**
   * 检查是否刚刚结束编辑（用于阻止点击事件）
   */
  const hasJustEnded = useCallback(() => {
    return justEndedRef.current
  }, [])

  return {
    startEdit,
    endEdit,
    cancelEdit,
    isEditing,
    getEditingNodeId,
    hasJustEnded,
  }
}
