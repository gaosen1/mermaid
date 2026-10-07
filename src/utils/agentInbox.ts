/**
 * inbox/ 下是否存在待摄取的 .json（REST API 写回的笔记）。
 * 只列目录、不读文件内容，供轮询使用，开销极小。
 */
export async function hasPendingInbox(handle: FileSystemDirectoryHandle): Promise<boolean> {
  let inboxDir: FileSystemDirectoryHandle
  try {
    inboxDir = await handle.getDirectoryHandle('inbox')
  } catch {
    return false
  }
  const entries = (
    inboxDir as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> }
  ).entries()
  for await (const [name, entry] of entries) {
    if (entry.kind === 'file' && name.endsWith('.json')) return true
  }
  return false
}
