import assert from 'node:assert/strict'
import test from 'node:test'

import { retryWithBackoff } from '../utils/retry'

test('retryWithBackoff respects retryAfterMs hints from upstream errors', async () => {
  let attempts = 0
  const startedAt = Date.now()

  const result = await retryWithBackoff(
    async () => {
      attempts += 1
      if (attempts === 1) {
        const error = new Error('rate limited') as Error & {
          statusCode?: number
          retryAfterMs?: number
        }
        error.statusCode = 429
        error.retryAfterMs = 250
        throw error
      }
      return 'ok'
    },
    {
      maxAttempts: 2,
      baseDelayMs: 10,
      maxDelayMs: 1_000,
    },
  )

  const elapsed = Date.now() - startedAt

  assert.equal(result, 'ok')
  assert.equal(attempts, 2)
  assert.ok(elapsed >= 200, `expected elapsed >= 200ms, got ${elapsed}`)
})
