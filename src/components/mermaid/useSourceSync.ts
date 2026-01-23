/**
 * 源码同步 Hook
 *
 * 使用防抖机制延迟同步样式变更到 source，避免频繁触发重渲染
 */

import { useCallback, useRef, useEffect } from 'react'
import { updateSourceWithEdgeStyle, type EdgeStyle } from '@/utils/edgeDsl'

interface PendingChange {
  type: 'edge' | 'node'
  id: number | string
  style: EdgeStyle
}

interface UseSourceSyncOptions {
  source: string
  onSourceChange: (newSource: string) => void
  debounceMs?: number
}

const DEFAULT_DEBOUNCE_MS = 500

export function useSourceSync({
  source,
  onSourceChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseSourceSyncOptions) {
  const pendingChangesRef = useRef<Map<string, PendingChange>>(new Map())
  const timerRef = useRef<number | null>(null)
  const sourceRef = useRef(source)

  // 保持 source 引用最新
  useEffect(() => {
    sourceRef.current = source
  }, [source])

  /** 执行同步 */
  const doSync = useCallback(() => {
    const changes = pendingChangesRef.current
    if (changes.size === 0) return

    let newSource = sourceRef.current

    changes.forEach((change) => {
      if (change.type === 'edge') {
        newSource = updateSourceWithEdgeStyle(newSource, {
          index: change.id as number,
          style: change.style,
        })
      }
      // 未来扩展：节点样式同步
    })

    pendingChangesRef.current.clear()
    onSourceChange(newSource)
  }, [onSourceChange])

  /** 记录样式变更（防抖同步） */
  const recordStyleChange = useCallback(
    (type: 'edge' | 'node', id: number | string, style: EdgeStyle) => {
      const key = `${type}-${id}`
      pendingChangesRef.current.set(key, { type, id, style })

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = window.setTimeout(doSync, debounceMs)
    },
    [debounceMs, doSync]
  )

  /** 立即同步所有待处理变更 */
  const flushChanges = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    doSync()
  }, [doSync])

  /** 取消待处理变更 */
  const cancelPendingChanges = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingChangesRef.current.clear()
  }, [])

  /** 检查是否有待处理变更 */
  const hasPendingChanges = useCallback(() => {
    return pendingChangesRef.current.size > 0
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    recordStyleChange,
    flushChanges,
    cancelPendingChanges,
    hasPendingChanges,
  }
}
