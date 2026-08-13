import { useState } from 'react'
import { suggestDiagramNames } from '@/utils/aiOrganize'
import type { DiagramType } from '@/types'

/**
 * AI 候选名称生成 hook（重命名弹窗与编辑器标题栏共用）。
 * NEED_API_KEY 错误通过 needKey 状态暴露，由调用方弹出 Key 配置弹窗。
 */
export function useAiNameSuggestions() {
  const [loading, setLoading] = useState(false)
  const [names, setNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [needKey, setNeedKey] = useState(false)

  const generate = async (options: {
    source: string
    type: DiagramType
    existingNames: string[]
  }) => {
    setLoading(true)
    setNames([])
    setError(null)
    try {
      const result = await suggestDiagramNames(options)
      setNames(result)
    } catch (err) {
      if (err instanceof Error && err.message === 'NEED_API_KEY') {
        setNeedKey(true)
      } else {
        setError(err instanceof Error ? err.message : '生成失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setNames([])
    setError(null)
  }

  return { loading, names, error, needKey, setNeedKey, generate, reset }
}
