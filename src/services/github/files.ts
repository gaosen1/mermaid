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

    return {
      path: data.path,
      sha: data.sha,
      content: data.content ? atob(data.content.replace(/\n/g, '')) : undefined,
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
  const client = getGitHubClient()
  const config = getGitHubConfig()

  try {
    // 如果没有提供 sha，尝试获取现有文件的 sha
    let fileSha = sha
    if (!fileSha) {
      const existing = await getFile(path)
      fileSha = existing?.sha
    }

    const { data } = await client.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path,
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha: fileSha,
      branch: config.branch,
    })

    return {
      sha: data.content?.sha || '',
      url: data.content?.html_url || '',
    }
  } catch (error) {
    throw new GitHubFileError(`Failed to put file: ${path}`, error as Error)
  }
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
