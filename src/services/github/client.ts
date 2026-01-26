import { Octokit } from '@octokit/rest'
import type { GitHubConfig } from '@/types/sync'
import { GitHubAuthError, GitHubNetworkError } from './errors'

let octokitInstance: Octokit | null = null
let currentConfig: GitHubConfig | null = null

/**
 * 初始化 GitHub 客户端
 */
export function initGitHubClient(token: string): Octokit {
  octokitInstance = new Octokit({
    auth: token,
  })
  return octokitInstance
}

/**
 * 获取当前客户端实例
 */
export function getGitHubClient(): Octokit {
  if (!octokitInstance) {
    throw new GitHubAuthError('GitHub client not initialized')
  }
  return octokitInstance
}

/**
 * 验证 Token 并获取用户信息
 */
export async function validateToken(
  token: string
): Promise<{ login: string; name: string | null }> {
  const client = initGitHubClient(token)
  try {
    const { data } = await client.users.getAuthenticated()
    return { login: data.login, name: data.name }
  } catch (error) {
    const err = error as { status?: number }
    if (err.status === 401) {
      throw new GitHubAuthError('Invalid GitHub token')
    }
    throw new GitHubNetworkError('Failed to validate token', error as Error)
  }
}

/**
 * 设置当前配置
 */
export function setGitHubConfig(config: GitHubConfig): void {
  currentConfig = config
}

/**
 * 获取当前配置
 */
export function getGitHubConfig(): GitHubConfig {
  if (!currentConfig) {
    throw new GitHubAuthError('GitHub config not set')
  }
  return currentConfig
}

/**
 * 清除客户端和配置
 */
export function clearGitHubClient(): void {
  octokitInstance = null
  currentConfig = null
}

/**
 * 检查是否已初始化
 */
export function isGitHubInitialized(): boolean {
  return octokitInstance !== null && currentConfig !== null
}
