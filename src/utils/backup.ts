import { db } from '@/db'
import { saveAs } from 'file-saver'

/**
 * 一键全量备份/恢复：导出 IndexedDB 全表为单个 JSON；
 * 导入支持「整体覆盖 / 按 id 合并新者胜」两种策略。
 * 不含 kv（目录句柄不可序列化）与 syncLog/syncQueue（瞬态）。
 */

const TABLES = [
  'projects',
  'diagrams',
  'folders',
  'folderCollapse',
  'snapshots',
  'settings',
  'aiChats',
] as const

export type BackupTable = (typeof TABLES)[number]

export interface BackupFile {
  app: 'mermaid-local'
  version: 1
  exportedAt: number
  tables: Partial<Record<BackupTable, Array<Record<string, unknown>>>>
}

export async function exportBackup(): Promise<void> {
  const tables: BackupFile['tables'] = {}
  for (const t of TABLES) {
    tables[t] = (await db.table(t).toArray()) as Array<Record<string, unknown>>
  }
  const payload: BackupFile = { app: 'mermaid-local', version: 1, exportedAt: Date.now(), tables }
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `mermaid-local-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`
  saveAs(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), name)
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法 JSON')
  }
  const file = raw as BackupFile
  if (file?.app !== 'mermaid-local' || file.version !== 1 || typeof file.tables !== 'object') {
    throw new Error('不是有效的 Mermaid Local 备份文件')
  }
  return file
}

/** 取 Dexie 表主键值（支持复合主键） */
function keyOf(table: BackupTable, row: Record<string, unknown>): unknown {
  const keyPath = db.table(table).schema.primKey.keyPath
  if (Array.isArray(keyPath)) return keyPath.map((k) => row[k])
  return row[keyPath as string]
}

export async function importBackup(
  file: BackupFile,
  strategy: 'replace' | 'merge'
): Promise<void> {
  for (const t of TABLES) {
    const rows = file.tables[t] ?? []
    const table = db.table(t)
    if (strategy === 'replace') {
      await table.clear()
      if (rows.length > 0) await table.bulkPut(rows)
      continue
    }
    // 合并：不存在则写入；存在则比较 updatedAt，新者胜（无 updatedAt 视为新）
    for (const row of rows) {
      let key: unknown
      try {
        key = keyOf(t, row)
      } catch {
        continue
      }
      const existing = (await table.get(key as never)) as Record<string, unknown> | undefined
      if (!existing) {
        await table.put(row)
        continue
      }
      const rowTs = typeof row.updatedAt === 'number' ? row.updatedAt : Number.POSITIVE_INFINITY
      const existTs = typeof existing.updatedAt === 'number' ? existing.updatedAt : 0
      if (rowTs > existTs) await table.put(row)
    }
  }
}
