import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { createApp } from '../server'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'

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

test('POST /api/tasks accepts month-long duration-based research tasks', async () => {
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
          stageDurationDays: 30,
          durationHours: 24 * 30,
        },
      }),
    })

    assert.equal(response.status, 200)
    const payload = (await response.json()) as {
      success: boolean
      data: {
        id: string
        researchMode?: 'stage-rounds' | 'duration'
        options?: {
          stageDurationDays?: number
          durationHours?: number
        }
        progress?: {
          researchMode: 'stage-rounds' | 'duration'
          durationHours: number | null
          figureCount: number
          tableCount: number
          formulaCount: number
          figureGroupCount: number
        } | null
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.id, taskId)
    assert.equal(payload.data.researchMode, 'duration')
    assert.equal(payload.data.options?.stageDurationDays, 30)
    assert.equal(payload.data.options?.durationHours, 24 * 30)
    assert.equal(payload.data.progress?.figureCount, 0)
    assert.equal(payload.data.progress?.tableCount, 0)
    assert.equal(payload.data.progress?.formulaCount, 0)
    assert.equal(payload.data.progress?.figureGroupCount, 0)

    await new Promise((resolve) => setTimeout(resolve, 50))
    const detailResponse = await fetch(`${origin}/api/tasks/${taskId}`)
    assert.equal(detailResponse.status, 200)
    const detailPayload = (await detailResponse.json()) as {
      success: boolean
      data: {
        task: {
          options?: {
            stageDurationDays?: number
            durationHours?: number
          }
        }
        progress: {
          researchMode: 'stage-rounds' | 'duration'
          durationHours: number | null
          figureCount: number
          tableCount: number
          formulaCount: number
          figureGroupCount: number
        } | null
      }
    }
    assert.equal(detailPayload.success, true)
    assert.equal(detailPayload.data.task.options?.stageDurationDays, 30)
    assert.equal(detailPayload.data.task.options?.durationHours, 24 * 30)
    assert.equal(detailPayload.data.progress?.researchMode, 'duration')
    assert.equal(detailPayload.data.progress?.durationHours, 24 * 30)
    assert.equal(detailPayload.data.progress?.figureCount, 0)
    assert.equal(detailPayload.data.progress?.tableCount, 0)
    assert.equal(detailPayload.data.progress?.formulaCount, 0)
    assert.equal(detailPayload.data.progress?.figureGroupCount, 0)

    const cleanup = await fetch(`${origin}/api/tasks/${taskId}`, { method: 'DELETE' })
    assert.equal(cleanup.status, 200)
  })
})

test('POST /api/tasks/:taskId/run tolerates legacy duration mode payloads', async () => {
  const originalTriggerTask = enhancedTaskScheduler.triggerTask.bind(enhancedTaskScheduler)
  let receivedArgs: { forceStage?: number; mode?: 'full' | 'discover-only' } | null = null

  enhancedTaskScheduler.triggerTask = (async (_taskId, options) => {
    receivedArgs = options ?? null
    return {
      taskId: 'legacy-duration-task',
      success: true,
      executedAt: new Date(),
    }
  }) as typeof enhancedTaskScheduler.triggerTask

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/tasks/legacy-duration-task/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceStage: 2,
          mode: 'duration',
        }),
      })

      assert.equal(response.status, 200)
      const payload = (await response.json()) as {
        success: boolean
      }

      assert.equal(payload.success, true)
      assert.deepEqual(receivedArgs, {
        forceStage: 2,
        mode: undefined,
      })
    })
  } finally {
    enhancedTaskScheduler.triggerTask = originalTriggerTask
  }
})
