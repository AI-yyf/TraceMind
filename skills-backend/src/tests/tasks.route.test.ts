import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { createApp } from '../server'

async function withServer(run: (origin: string) => Promise<void>) {
  const app = createApp()
  const server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not resolve test server address.')
  }

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('GET /api/tasks/topics resolves the topics index route instead of task detail route', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/tasks/topics`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: Array<{ id: string }>
    }

    assert.equal(payload.success, true)
    assert.ok(Array.isArray(payload.data))
  })
})

test('POST /api/tasks accepts duration-based research tasks', async () => {
  await withServer(async (origin) => {
    const taskId = `test-duration-${Date.now()}`
    const response = await fetch(`${origin}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: taskId,
        name: 'Duration Research Test',
        cronExpression: '0 3 * * *',
        enabled: false,
        topicId: 'topic-1',
        action: 'discover',
        researchMode: 'duration',
        options: {
          durationHours: 6,
        },
      }),
    })

    assert.equal(response.status, 200)
    const payload = (await response.json()) as {
      success: boolean
      data: {
        id: string
        researchMode?: 'stage-rounds' | 'duration'
        progress?: {
          researchMode: 'stage-rounds' | 'duration'
          durationHours: number | null
        } | null
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.id, taskId)
    assert.equal(payload.data.researchMode, 'duration')

    await new Promise((resolve) => setTimeout(resolve, 50))
    const detailResponse = await fetch(`${origin}/api/tasks/${taskId}`)
    assert.equal(detailResponse.status, 200)
    const detailPayload = (await detailResponse.json()) as {
      success: boolean
      data: {
        progress: {
          researchMode: 'stage-rounds' | 'duration'
          durationHours: number | null
        } | null
      }
    }
    assert.equal(detailPayload.success, true)
    assert.equal(detailPayload.data.progress?.researchMode, 'duration')
    assert.equal(detailPayload.data.progress?.durationHours, 6)

    const cleanup = await fetch(`${origin}/api/tasks/${taskId}`, { method: 'DELETE' })
    assert.equal(cleanup.status, 200)
  })
})
