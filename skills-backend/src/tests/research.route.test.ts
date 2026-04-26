import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { deleteSession } from '../lib/redis'
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
      server.closeAllConnections?.()
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('legacy research-session routes proxy multi-topic duration sessions through the enhanced scheduler', async () => {
  const originalStart = enhancedTaskScheduler.startMultiTopicResearchSession.bind(enhancedTaskScheduler)
  const originalGet = enhancedTaskScheduler.getMultiTopicResearchState.bind(enhancedTaskScheduler)
  const originalStop = enhancedTaskScheduler.stopMultiTopicResearchSession.bind(enhancedTaskScheduler)

  const captured: {
    start?: { topicIds: string[]; options?: { durationHours?: number; stageDurationDays?: number } }
    stop?: { topicIds: string[] }
  } = {}
  const topicIds = ['agent', 'transformer-innovation']
  let lastSessionId: string | null = null

  const runningState = {
    topicIds,
    sessions: [
      {
        topicId: 'agent',
        task: {
          id: 'topic-research:agent',
          topicId: 'agent',
        },
        progress: {
          taskId: 'topic-research:agent',
          topicId: 'agent',
          topicName: 'Agent',
          researchMode: 'duration' as const,
          durationHours: 720,
          currentStage: 2,
          totalStages: 5,
          stageProgress: 35,
          currentStageRuns: 3,
          currentStageTargetRuns: 10,
          stageRunMap: {},
          totalRuns: 4,
          successfulRuns: 3,
          failedRuns: 0,
          lastRunAt: new Date().toISOString(),
          lastRunResult: 'success' as const,
          discoveredPapers: 24,
          admittedPapers: 11,
          generatedContents: 6,
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          deadlineAt: new Date(Date.now() + 719 * 60 * 60 * 1000).toISOString(),
          completedAt: null,
          activeSessionId: 'live-agent-session',
          completedStageCycles: 0,
          currentStageStalls: 0,
          latestSummary: 'Agent stage two is consolidating stronger evidence.',
          status: 'active' as const,
        },
        report: {
          reportId: 'report-agent',
          topicId: 'agent',
          taskId: 'topic-research:agent',
          status: 'running' as const,
          trigger: 'manual' as const,
          headline: 'Agent duration research',
          dek: 'Tracking agentic system progress.',
          summary: 'Agent stage two is consolidating stronger evidence.',
          paragraphs: ['Agent stage two is consolidating stronger evidence.'],
          keyMoves: [],
          openQuestions: [],
          latestStageSummary: 'Agent stage two is consolidating stronger evidence.',
          currentStage: 2,
          totalStages: 5,
          totalRuns: 4,
          successfulRuns: 3,
          failedRuns: 0,
          discoveredPapers: 24,
          admittedPapers: 11,
          generatedContents: 6,
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          deadlineAt: new Date(Date.now() + 719 * 60 * 60 * 1000).toISOString(),
          completedAt: null,
          updatedAt: new Date().toISOString(),
        },
        active: true,
      },
      {
        topicId: 'transformer-innovation',
        task: {
          id: 'topic-research:transformer-innovation',
          topicId: 'transformer-innovation',
        },
        progress: {
          taskId: 'topic-research:transformer-innovation',
          topicId: 'transformer-innovation',
          topicName: 'Transformer Innovation',
          researchMode: 'duration' as const,
          durationHours: 720,
          currentStage: 1,
          totalStages: 5,
          stageProgress: 20,
          currentStageRuns: 2,
          currentStageTargetRuns: 10,
          stageRunMap: {},
          totalRuns: 2,
          successfulRuns: 2,
          failedRuns: 0,
          lastRunAt: new Date().toISOString(),
          lastRunResult: 'success' as const,
          discoveredPapers: 18,
          admittedPapers: 7,
          generatedContents: 3,
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          deadlineAt: new Date(Date.now() + 719 * 60 * 60 * 1000).toISOString(),
          completedAt: null,
          activeSessionId: 'live-transformer-session',
          completedStageCycles: 0,
          currentStageStalls: 1,
          latestSummary: 'Transformer stage one is still widening the candidate pool.',
          status: 'active' as const,
        },
        report: {
          reportId: 'report-transformer',
          topicId: 'transformer-innovation',
          taskId: 'topic-research:transformer-innovation',
          status: 'running' as const,
          trigger: 'manual' as const,
          headline: 'Transformer duration research',
          dek: 'Tracking transformer progress.',
          summary: 'Transformer stage one is still widening the candidate pool.',
          paragraphs: ['Transformer stage one is still widening the candidate pool.'],
          keyMoves: [],
          openQuestions: [],
          latestStageSummary: 'Transformer stage one is still widening the candidate pool.',
          currentStage: 1,
          totalStages: 5,
          totalRuns: 2,
          successfulRuns: 2,
          failedRuns: 0,
          discoveredPapers: 18,
          admittedPapers: 7,
          generatedContents: 3,
          startedAt: new Date(Date.now() - 60_000).toISOString(),
          deadlineAt: new Date(Date.now() + 719 * 60 * 60 * 1000).toISOString(),
          completedAt: null,
          updatedAt: new Date().toISOString(),
        },
        active: true,
      },
    ],
    aggregate: {
      totalTopics: 2,
      activeTopics: 2,
      completedTopics: 0,
      failedTopics: 0,
      totalDiscoveredPapers: 42,
      totalAdmittedPapers: 18,
      totalGeneratedContents: 9,
      overallProgress: 47,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      deadlineAt: new Date(Date.now() + 719 * 60 * 60 * 1000).toISOString(),
    },
  }

  const pausedState = {
    ...runningState,
    sessions: runningState.sessions.map((session) => ({
      ...session,
      active: false,
      progress: session.progress
        ? {
            ...session.progress,
            activeSessionId: null,
            status: 'paused' as const,
          }
        : null,
    })),
    aggregate: {
      ...runningState.aggregate,
      activeTopics: 0,
      overallProgress: 47,
    },
  }

  enhancedTaskScheduler.startMultiTopicResearchSession = (async (receivedTopicIds, options) => {
    captured.start = { topicIds: [...receivedTopicIds], options }
    return runningState as unknown as Awaited<ReturnType<typeof enhancedTaskScheduler.startMultiTopicResearchSession>>
  }) as typeof enhancedTaskScheduler.startMultiTopicResearchSession

  enhancedTaskScheduler.getMultiTopicResearchState = (async () => {
    return runningState as unknown as Awaited<ReturnType<typeof enhancedTaskScheduler.getMultiTopicResearchState>>
  }) as typeof enhancedTaskScheduler.getMultiTopicResearchState

  enhancedTaskScheduler.stopMultiTopicResearchSession = (async (receivedTopicIds) => {
    captured.stop = { topicIds: [...receivedTopicIds] }
    enhancedTaskScheduler.getMultiTopicResearchState = (async () => {
      return pausedState as unknown as Awaited<ReturnType<typeof enhancedTaskScheduler.getMultiTopicResearchState>>
    }) as typeof enhancedTaskScheduler.getMultiTopicResearchState
    return pausedState as unknown as Awaited<ReturnType<typeof enhancedTaskScheduler.stopMultiTopicResearchSession>>
  }) as typeof enhancedTaskScheduler.stopMultiTopicResearchSession

  try {
    await withServer(async (origin) => {
      const createResponse = await fetch(`${origin}/api/research/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicIds,
          stageDurationDays: 30,
          mode: 'full',
        }),
      })

      assert.equal(createResponse.status, 201)
      const createPayload = (await createResponse.json()) as {
        sessionId: string
        status: string
        data: {
          topicIds: string[]
          progress: number
          researchMode: 'duration'
          totalTopics: number
        }
      }

      assert.ok(createPayload.sessionId)
      lastSessionId = createPayload.sessionId
      assert.equal(createPayload.status, 'running')
      assert.deepEqual(createPayload.data.topicIds, topicIds)
      assert.equal(createPayload.data.progress, 47)
      assert.equal(createPayload.data.totalTopics, 2)
      assert.equal(createPayload.data.researchMode, 'duration')
      assert.deepEqual(captured.start, {
        topicIds,
        options: {
          stageDurationDays: 30,
          durationHours: 720,
        },
      })

      const detailResponse = await fetch(`${origin}/api/research/sessions/${createPayload.sessionId}`)
      assert.equal(detailResponse.status, 200)
      const detailPayload = (await detailResponse.json()) as {
        success: boolean
        data: {
          status: string
          topicProgress: Array<{ topicId: string; status: string }>
          results: {
            discoveredPapers: number
            admittedPapers: number
            generatedContents: number
          }
        }
      }

      assert.equal(detailPayload.success, true)
      assert.equal(detailPayload.data.status, 'running')
      assert.equal(detailPayload.data.topicProgress.length, 2)
      assert.deepEqual(
        detailPayload.data.topicProgress.map((entry) => entry.topicId),
        topicIds,
      )
      assert.equal(detailPayload.data.results.discoveredPapers, 42)
      assert.equal(detailPayload.data.results.admittedPapers, 18)
      assert.equal(detailPayload.data.results.generatedContents, 9)

      const stopResponse = await fetch(`${origin}/api/research/sessions/${createPayload.sessionId}/stop`, {
        method: 'POST',
      })
      assert.equal(stopResponse.status, 200)
      const stopPayload = (await stopResponse.json()) as {
        success: boolean
        data: {
          status: string
          topicProgress: Array<{ status: string }>
        }
      }

      assert.equal(stopPayload.success, true)
      assert.equal(stopPayload.data.status, 'paused')
      assert.ok(stopPayload.data.topicProgress.every((entry) => entry.status === 'paused'))
      assert.deepEqual(captured.stop, { topicIds })
    })
  } finally {
    enhancedTaskScheduler.startMultiTopicResearchSession = originalStart
    enhancedTaskScheduler.getMultiTopicResearchState = originalGet
    enhancedTaskScheduler.stopMultiTopicResearchSession = originalStop

    if (lastSessionId) {
      await deleteSession(`research:session:${lastSessionId}`)
      await prisma.research_sessions.deleteMany({
        where: { id: lastSessionId },
      })
    }
  }
})

test('research sessions accept at most five topics and duration-only full mode', async () => {
  await withServer(async (origin) => {
    const tooManyTopicsResponse = await fetch(`${origin}/api/research/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
        stageDurationDays: 30,
      }),
    })

    assert.equal(tooManyTopicsResponse.status, 400)

    const iterationModeResponse = await fetch(`${origin}/api/research/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicIds: ['agent'],
        stageDurationDays: 30,
        maxIterations: 3,
      }),
    })

    assert.equal(iterationModeResponse.status, 400)

    const discoverOnlyResponse = await fetch(`${origin}/api/research/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicIds: ['agent'],
        stageDurationDays: 30,
        mode: 'discover-only',
      }),
    })

    assert.equal(discoverOnlyResponse.status, 400)
  })
})
