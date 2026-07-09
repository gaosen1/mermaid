import { getGitHubClient, getGitHubConfig } from './client'
import type { GitHubFileInfo } from '@/types/sync'
import { GitHubFileError } from './errors'

/**
 * 获取文件内容
 */
export async function getFile(path: string): Promise<GitHubFileInfo | null> {
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

    let content: string | undefined
    if (data.content) {
      const binary = atob(data.content.replace(/\n/g, ''))
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
      content = new TextDecoder().decode(bytes)
    }

    return {
      path: data.path,
      sha: data.sha,
      content,
      size: data.size,
      url: data.html_url || '',
    }
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
 * 创建或更新已编码为 base64 的文件内容
 */
export async function putFileBase64(
  path: string,
  base64Content: string,
  message: string,
  sha?: string
): Promise<{ sha: string; url: string }> {
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
    const existing = await getFile(path)
    fileSha = existing?.sha
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
      const existing = await getFile(path)
      fileSha = existing?.sha
    }
  }

  throw new GitHubFileError(`Failed to put file: ${path}`, lastError as Error)
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
