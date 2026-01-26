const TOKEN_KEY = 'github_pat'

/**
 * 存储 GitHub Token 到 localStorage
 */
export async function storeToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * 从 localStorage 获取存储的 Token
 */
export async function getStoredToken(): Promise<string | null> {
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * 清除存储的 Token
 */
export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * 检查是否有存储的 Token
 */
export function hasStoredToken(): boolean {
  return localStorage.getItem(TOKEN_KEY) !== null
}
