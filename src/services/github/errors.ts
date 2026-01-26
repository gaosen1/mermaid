export class GitHubError extends Error {
  cause?: Error

  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'GitHubError'
    this.cause = cause
  }
}

export class GitHubAuthError extends GitHubError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'GitHubAuthError'
  }
}

export class GitHubRateLimitError extends GitHubError {
  retryAfter: number

  constructor(message: string, retryAfter: number, cause?: Error) {
    super(message, cause)
    this.name = 'GitHubRateLimitError'
    this.retryAfter = retryAfter
  }
}

export class GitHubNetworkError extends GitHubError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'GitHubNetworkError'
  }
}

export class GitHubRepoError extends GitHubError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'GitHubRepoError'
  }
}

export class GitHubFileError extends GitHubError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'GitHubFileError'
  }
}

/**
 * 判断是否为可重试错误
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof GitHubRateLimitError) return true
  if (error instanceof GitHubNetworkError) return true
  if (error instanceof GitHubError && error.cause) {
    const status = (error.cause as { status?: number }).status
    return status === 500 || status === 502 || status === 503 || status === 504
  }
  return false
}
