/**
 * Retry utility with exponential backoff and jitter
 *
 * Used for external API calls to handle transient failures
 * (rate limits, timeouts, network errors)
 */

export interface RetryOptions {
  maxAttempts?: number;      // Default: 3
  baseDelayMs?: number;      // Default: 300
  maxDelayMs?: number;       // Default: 5000
  jitterFactor?: number;     // Default: 0.2 (±20%)
  shouldRetry?: (error: Error) => boolean;
}

interface ErrorWithStatusCode extends Error {
  statusCode?: number;
  retryAfterMs?: number;
}

function isErrorWithStatusCode(error: Error): error is ErrorWithStatusCode {
  return 'statusCode' in error && typeof (error as ErrorWithStatusCode).statusCode === 'number';
}

const DEFAULT_RETRYABLE_CODES = [408, 429, 500, 502, 503, 504];

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 300,
    maxDelayMs = 5000,
    jitterFactor = 0.2,
    shouldRetry = (error: Error) => {
      if (isErrorWithStatusCode(error)) {
        return DEFAULT_RETRYABLE_CODES.includes(error.statusCode!);
      }
      return error.message.includes('timeout') ||
             error.message.includes('network') ||
             error.message.includes('ECONNRESET');
    },
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetry(lastError) || attempt === maxAttempts - 1) {
        throw lastError;
      }

      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = exponentialDelay * jitterFactor * (Math.random() * 2 - 1);
      const hintedDelayMs =
        isErrorWithStatusCode(lastError) && typeof lastError.retryAfterMs === 'number'
          ? Math.max(0, lastError.retryAfterMs)
          : null;
      const delayMs = hintedDelayMs !== null
        ? Math.min(hintedDelayMs, maxDelayMs)
        : Math.min(exponentialDelay + jitter, maxDelayMs);

      console.warn(`Retrying operation (attempt ${attempt + 1}/${maxAttempts}) after ${Math.round(delayMs)}ms`);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
