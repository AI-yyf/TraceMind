/**
 * Retry Service for LLM API Calls
 * Implements exponential backoff with jitter
 */

export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  jitterMs: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
  jitterMs: 500,
}

export class LLMGenerationError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    public readonly provider?: string,
    public readonly model?: string
  ) {
    super(message)
    this.name = 'LLMGenerationError'
  }
}

/**
 * Determines if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  // Check for status code
  const anyError = error as any
  const status = anyError.status ?? anyError.statusCode

  // Retry: rate limits, timeouts, server errors
  // Don't retry: 4xx client errors (except 429)
  if (status) {
    return status === 429 || status === 408 || status >= 500
  }

  // Network errors
  const message = error.message.toLowerCase()
  return (
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('rate limit')
  )
}

/**
 * Extract delay from error headers or calculate exponential backoff
 */
export function getRetryDelay(
  error: unknown,
  attempt: number,
  config: RetryConfig
): number {
  // Check for Retry-After header
  const anyError = error as any
  const retryAfter = anyError?.headers?.['retry-after'] ?? anyError?.headers?.['Retry-After']
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10)
    if (!isNaN(seconds)) {
      return seconds * 1000
    }
  }

  // Exponential backoff: 1s, 2s, 4s
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt)

  // Add jitter to avoid thundering herd
  const jitter = Math.random() * config.jitterMs

  return Math.min(exponentialDelay + jitter, config.maxDelayMs)
}

/**
 * Execute with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  const errors: Error[] = []

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const result = await operation()
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      errors.push(err)

      // Don't retry on last attempt or non-retryable errors
      if (attempt === finalConfig.maxRetries || !isRetryableError(error)) {
        throw new LLMGenerationError(
          `LLM generation failed after ${attempt + 1} attempts: ${err.message}`,
          attempt + 1,
          errors[errors.length - 1]
        )
      }

      // Calculate delay
      const delay = getRetryDelay(error, attempt, finalConfig)

      console.warn(
        `[Retry] Attempt ${attempt + 1}/${finalConfig.maxRetries + 1} failed: ${err.message}. Retrying in ${Math.round(delay)}ms...`
      )

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new LLMGenerationError(
    `LLM generation failed after ${finalConfig.maxRetries + 1} attempts`,
    finalConfig.maxRetries + 1,
    errors[errors.length - 1]
  )
}