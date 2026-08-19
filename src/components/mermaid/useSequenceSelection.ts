import { useEffect, useCallback, useState, useRef } from 'react'

export interface SelectedSequenceItem {
  kind: 'participant' | 'message'
  /** 参与者源码 id（经 resolveParticipantId 解析） */
  participantId?: string
  /** 参与者显示文本（别名或 id） */
  label?: string
  /** 消息索引（msgStyle 的 N） */
  messageIndex?: number
  position: { x: number; y: number }
}

interface UseSequenceSelectionOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  enabled?: boolean
  /** 显示文本 → 源码参与者 id */
  resolveParticipantId: (label: string) => string | null
  onSelect?: (item: SelectedSequenceItem | null) => void
  onDoubleClick?: (item: SelectedSequenceItem) => void
}

const DOUBLE_CLICK_WINDOW = 300

function itemKey(item: SelectedSequenceItem): string {
  return item.kind === 'participant' ? `p:${item.participantId ?? item.label}` : `m:${item.messageIndex}`
}

/**
 * 时序图选中逻辑：单击选中参与者（rect.actor/text.actor）或消息线，
 * 双击参与者触发改名回调。
 */
export function useSequenceSelection({
  containerRef,
  enabled = true,
  resolveParticipantId,
  onSelect,
  onDoubleClick,
}: UseSequenceSelectionOptions) {
  const [selected, setSelected] = useState<SelectedSequenceItem | null>(null)
  const selectedKeyRef = useRef<string | null>(null)
  const lastClickTimeRef = useRef(0)
  const lastClickKeyRef = useRef<string | null>(null)

  const clearHighlight = useCallback((svg: SVGSVGElement) => {
    svg.querySelectorAll('.sequence-selected').forEach((el) => el.classList.remove('sequence-selected'))
  }, [])

  const executeSelect = useCallback(
    (item: SelectedSequenceItem, element: SVGElement | null) => {
      const svg = element?.ownerSVGElement
      if (svg) clearHighlight(svg)
      if (element) element.classList.add('sequence-selected')
      selectedKeyRef.current = itemKey(item)
      setSelected(item)
      onSelect?.(item)
    },
    [onSelect, clearHighlight]
  )

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!enabled || !containerRef.current) return
      const target = event.target as Element

      const position = { x: event.clientX, y: event.clientY }

      // 参与者
      const actorEl = target.closest('rect.actor, text.actor') as SVGElement | null
      if (actorEl) {
        const svg = actorEl.ownerSVGElement
        if (!svg) return
        let label = ''
        let rectEl: SVGRectElement | null = null
        if (actorEl.tagName === 'text') {
          label = (actorEl.textContent || '').trim()
          rectEl = null
        } else {
          // rect → 配对 text（坐标属性匹配）
          const rx = Number(actorEl.getAttribute('x') ?? 0)
          const ry = Number(actorEl.getAttribute('y') ?? 0)
          const rw = Number(actorEl.getAttribute('width') ?? 0)
          const rh = Number(actorEl.getAttribute('height') ?? 0)
          const text = (Array.from(svg.querySelectorAll('text.actor')) as SVGTextElement[]).find((t) => {
            const tx = Number(t.getAttribute('x') ?? 0)
            const ty = Number(t.getAttribute('y') ?? 0)
            return tx >= rx && tx <= rx + rw && ty >= ry && ty <= ry + rh
          })
          label = (text?.textContent || '').trim()
          rectEl = actorEl as SVGRectElement
        }
        const item: SelectedSequenceItem = {
          kind: 'participant',
          label,
          participantId: resolveParticipantId(label) ?? label,
          position,
        }
        const key = itemKey(item)
        const now = Date.now()
        const isDouble = lastClickKeyRef.current === key && now - lastClickTimeRef.current < DOUBLE_CLICK_WINDOW
        lastClickTimeRef.current = now
        lastClickKeyRef.current = key
        if (isDouble) {
          event.stopPropagation()
          onDoubleClick?.(item)
          return
        }
        executeSelect(item, rectEl ?? (actorEl as SVGElement))
        event.stopPropagation()
        return
      }

      // 消息线 / 消息文本
      const msgEl = target.closest('.messageLine0, .messageLine1, .messageText') as SVGElement | null
      if (msgEl) {
        const svg = msgEl.ownerSVGElement
        if (!svg) return
        const lines = Array.from(svg.querySelectorAll('.messageLine0, .messageLine1')) as SVGPathElement[]
        const texts = Array.from(svg.querySelectorAll('.messageText')) as SVGTextElement[]
        let index = -1
        if (msgEl.classList.contains('messageText')) {
          index = texts.indexOf(msgEl as SVGTextElement)
        } else {
          index = lines.indexOf(msgEl as SVGPathElement)
        }
        if (index < 0) return
        const item: SelectedSequenceItem = { kind: 'message', messageIndex: index, position }
        const key = itemKey(item)
        const now = Date.now()
        const isDouble = lastClickKeyRef.current === key && now - lastClickTimeRef.current < DOUBLE_CLICK_WINDOW
        lastClickTimeRef.current = now
        lastClickKeyRef.current = key
        if (isDouble) return
        executeSelect(item, msgEl.classList.contains('messageText') ? null : (msgEl as SVGElement))
        event.stopPropagation()
        return
      }

      // 空白：取消选中
      if (selected) {
        const svg = containerRef.current.querySelector('svg')
        if (svg) clearHighlight(svg)
        selectedKeyRef.current = null
        setSelected(null)
        onSelect?.(null)
      }
    },
    [enabled, containerRef, resolveParticipantId, onSelect, onDoubleClick, executeSelect, clearHighlight, selected]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected && containerRef.current) {
        const svg = containerRef.current.querySelector('svg')
        if (svg) clearHighlight(svg)
        selectedKeyRef.current = null
        setSelected(null)
        onSelect?.(null)
      }
    },
    [selected, containerRef, onSelect, clearHighlight]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return
    container.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, enabled, handleClick, handleKeyDown])

  const clearSelection = useCallback(() => {
    if (containerRef.current) {
      const svg = containerRef.current.querySelector('svg')
      if (svg) clearHighlight(svg)
    }
    selectedKeyRef.current = null
    setSelected(null)
    onSelect?.(null)
  }, [containerRef, onSelect, clearHighlight])

  return { selectedSequence: selected, clearSequenceSelection: clearSelection }
}
