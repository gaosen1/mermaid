import { getGitHubClient, getGitHubConfig } from './client'
import type { GitHubFileInfo } from '@/types/sync'
import { GitHubFileError } from './errors'

// GitHub Contents API 对单个文件内容有约 1MB 的内联上限：超出后 getContent 不再
// 返回 content 字段（读），createOrUpdateFileContents 也会失败或不可靠（写）。
// 超过该阈值一律改走 Git Data API（blob/tree/commit）。
const CONTENTS_API_MAX_BYTES = 1_000_000

function estimateBase64ByteSize(base64: string): number {
  const len = base64.length
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((len * 3) / 4) - padding
}

/**
 * 按 blob sha 直接读取内容（base64），不经过 Contents API 的内联大小限制。
 */
async function getBlobBase64(sha: string): Promise<string> {
  const client = getGitHubClient()
  const config = getGitHubConfig()

  const { data } = await client.git.getBlob({
    owner: config.owner,
    repo: config.repo,
    file_sha: sha,
  })
  return data.content.replace(/\n/g, '')
}

/**
 * 读取单个文件的原始信息（sha / size / base64 内容）。
 * 内容优先取 Contents API 内联结果；超过内联上限时回退到 Blobs API。
 */
async function fetchRawFile(
  path: string
): Promise<{ path: string; sha: string; size: number; url: string; base64?: string } | null> {
  const client = getGitHubClient()
  const config = getGitHubConfig()

  try {
    const { data } = await client.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.branch,
    })

    if (Array.isArray(data)) {
      throw new GitHubFileError('Path is a directory, not a file')
    }

    if (data.type !== 'file') {
      throw new GitHubFileError(`Unexpected content type: ${data.type}`)
    }

    let base64 = data.content ? data.content.replace(/\n/g, '') : undefined
    if (!base64 && data.size > 0) {
      base64 = await getBlobBase64(data.sha)
    }

    return { path: data.path, sha: data.sha, size: data.size, url: data.html_url || '', base64 }
  } catch (error) {
    const err = error as { status?: number }
    if (err.status === 404) {
      return null
    }
    if (error instanceof GitHubFileError) {
      throw error
    }
    throw new GitHubFileError(`Failed to get file: ${path}`, error as Error)
  }
}

/**
 * 获取文件内容（以文本形式解码，适用于 mermaid/svg/html/markdown/txt 等文本格式）
 */
export async function getFile(path: string): Promise<GitHubFileInfo | null> {
  const file = await fetchRawFile(path)
  if (!file) return null

  let content: string | undefined
  if (file.base64) {
    const binary = atob(file.base64)
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    content = new TextDecoder().decode(bytes)
  }

  return { path: file.path, sha: file.sha, content, size: file.size, url: file.url }
}

/**
 * 获取文件内容（保留原始 base64，不做文本解码，适用于 png/jpg/webp 等二进制格式）
 */
export async function getFileBase64(
  path: string
): Promise<{ path: string; sha: string; base64Content?: string; size: number; url: string } | null> {
  const file = await fetchRawFile(path)
  if (!file) return null

  return { path: file.path, sha: file.sha, base64Content: file.base64, size: file.size, url: file.url }
}

/**
 * 只获取文件的 sha/size，不下载内容（用于推送前判断远端 sha，避免大文件被无谓下载一遍）
 */
async function getFileMeta(path: string): Promise<{ sha: string; size: number } | null> {
  const client = getGitHubClient()
  const config = getGitHubConfig()

  try {
    const { data } = await client.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.branch,
    })

    if (Array.isArray(data) || data.type !== 'file') {
      return null
    }

    return { sha: data.sha, size: data.size }
  } catch (error) {
    const err = error as { status?: number }
    if (err.status === 404) {
      return null
    }
    throw new GitHubFileError(`Failed to get file meta: ${path}`, error as Error)
  }
}

/**
 * 创建或更新文件
 */
export async function putFile(
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ sha: string; url: string }> {
  return putFileBase64(
    path,
    btoa(unescape(encodeURIComponent(content))),
    message,
    sha
  )
}

/**
 * 创建或更新已编码为 base64 的文件内容。
 * 超过 Contents API 内联上限时自动改走 Blobs/Trees API。
 */
export async function putFileBase64(
  path: string,
  base64Content: string,
  message: string,
  sha?: string
): Promise<{ sha: string; url: string }> {
  if (estimateBase64ByteSize(base64Content) > CONTENTS_API_MAX_BYTES) {
    return putLargeFileViaBlobsApi(path, base64Content, message)
  }

  const client = getGitHubClient()
  const config = getGitHubConfig()

  const attemptPut = async (fileSha?: string): Promise<{ sha: string; url: string }> => {
    const { data } = await client.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path,
      message,
      content: base64Content,
      sha: fileSha,
      branch: config.branch,
    })
    return {
      sha: data.content?.sha || '',
      url: data.content?.html_url || '',
    }
  }

  // GitHub Contents API 存在写后读延迟（CDN 缓存），紧接着的 getFile 可能返回
  // 过期 SHA，导致 409/422。这里采用「多次重试 + 指数退避 + 每次重新取 SHA」策略，
  // 从根本上兜住 SHA 竞争。
  const MAX_ATTEMPTS = 4
  const BACKOFF_MS = [250, 500, 1000]

  let fileSha = sha
  if (!fileSha) {
    fileSha = (await getFileMeta(path))?.sha
  }

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptPut(fileSha)
    } catch (error) {
      lastError = error
      const err = error as { status?: number }
      // 409 Conflict / 422 Unprocessable 都可能表示 SHA 过期
      const isShaConflict = err.status === 409 || err.status === 422
      if (!isShaConflict || attempt === MAX_ATTEMPTS - 1) {
        break
      }
      // 退避后重新拉取最新 SHA 再试
      await delay(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)])
      fileSha = (await getFileMeta(path))?.sha
    }
  }

  throw new GitHubFileError(`Failed to put file: ${path}`, lastError as Error)
}

/**
 * 通过 Git Data API（blob -> tree -> commit -> ref）写入超过 Contents API
 * 内联上限的大文件。ref 更新有自己的乐观并发窗口（getRef 之后 ref 可能被
 * 并发推送移动），因此单独实现「重新取 ref/树 -> 重建 commit -> 重试
 * updateRef」的退避重试，不能复用 Contents API 那一套基于文件 sha 的重试。
 */
async function putLargeFileViaBlobsApi(
  path: string,
  base64Content: string,
  message: string
): Promise<{ sha: string; url: string }> {
  const client = getGitHubClient()
  const config = getGitHubConfig()

  const { data: blob } = await client.git.createBlob({
    owner: config.owner,
    repo: config.repo,
    content: base64Content,
    encoding: 'base64',
  })

  const MAX_ATTEMPTS = 4
  const BACKOFF_MS = [250, 500, 1000]

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const { data: ref } = await client.git.getRef({
        owner: config.owner,
        repo: config.repo,
        ref: `heads/${config.branch}`,
      })
      const parentCommitSha = ref.object.sha

      const { data: parentCommit } = await client.git.getCommit({
        owner: config.owner,
        repo: config.repo,
        commit_sha: parentCommitSha,
      })

      const { data: tree } = await client.git.createTree({
        owner: config.owner,
        repo: config.repo,
        base_tree: parentCommit.tree.sha,
        tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
      })

      const { data: commit } = await client.git.createCommit({
        owner: config.owner,
        repo: config.repo,
        message,
        tree: tree.sha,
        parents: [parentCommitSha],
      })

      await client.git.updateRef({
        owner: config.owner,
        repo: config.repo,
        ref: `heads/${config.branch}`,
        sha: commit.sha,
      })

      return { sha: blob.sha, url: blob.url || '' }
    } catch (error) {
      lastError = error
      const err = error as { status?: number }
      // 422 常见于 ref 在 getRef 之后被并发推送移动（non-fast-forward）
      const isRefConflict = err.status === 422 || err.status === 409
      if (!isRefConflict || attempt === MAX_ATTEMPTS - 1) {
        break
      }
      await delay(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)])
    }
  }

  throw new GitHubFileError(`Failed to put large file via blobs API: ${path}`, lastError as Error)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 删除文件
 */
export async function deleteFile(path: string, sha: string, message: string): Promise<void> {
  const client = getGitHubClient()
  const config = getGitHubConfig()

  try {
    await client.repos.deleteFile({
      owner: config.owner,
      repo: config.repo,
      path,
      message,
      sha,
      branch: config.branch,
    })
  } catch (error) {
    throw new GitHubFileError(`Failed to delete file: ${path}`, error as Error)
  }
}

/**
 * 列出目录内容
 */
export async function listDirectory(path: string): Promise<GitHubFileInfo[]> {
  const client = getGitHubClient()
  const config = getGitHubConfig()

  try {
    const { data } = await client.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: config.branch,
    })

    if (!Array.isArray(data)) {
      throw new GitHubFileError('Path is not a directory')
    }

    return data
      .filter((item) => item.type === 'file')
      .map((item) => ({
        path: item.path,
        sha: item.sha,
        size: item.size || 0,
        url: item.html_url || '',
      }))
  } catch (error) {
    const err = error as { status?: number }
    if (err.status === 404) {
      return []
    }
    if (error instanceof GitHubFileError) {
      throw error
    }
    throw new GitHubFileError(`Failed to list directory: ${path}`, error as Error)
  }
}

/**
 * 检查文件是否存在
 */
export async function fileExists(path: string): Promise<boolean> {
  const file = await getFile(path)
  return file !== null
}

/**
 * 批量获取文件（优化性能）
 */
export async function getFiles(paths: string[]): Promise<Map<string, GitHubFileInfo | null>> {
  const results = new Map<string, GitHubFileInfo | null>()

  // 并行获取，但限制并发数
  const BATCH_SIZE = 5
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(batch.map((path) => getFile(path)))
    batch.forEach((path, index) => {
      results.set(path, batchResults[index])
    })
  }

  return results
}
