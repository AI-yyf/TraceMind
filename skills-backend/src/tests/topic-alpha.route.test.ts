import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { createApp } from '../server'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import { answerTopicQuestion } from '../services/topics/alpha-topic'
import { finalizeTopicChatCommandResponse } from '../services/topics/topic-chat-command'

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
    for (const task of enhancedTaskScheduler.getAllTasks()) {
      enhancedTaskScheduler.removeTask(task.id)
    }

    await new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.()
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('GET /api/topics/:id/view-model returns lane-aware graph metadata', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/topic-1/view-model`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        graph: {
          lanes: Array<{
            laneIndex: number
            branchIndex: number | null
            isMainline: boolean
            roleLabel: string
          }>
          nodes: Array<{
            layoutHint: {
              laneIndex: number
              branchIndex: number | null
              isMainline: boolean
              side: 'left' | 'center' | 'right'
            }
          }>
        }
      }
    }

    assert.equal(payload.success, true)
    assert.ok(payload.data.graph.nodes.length > 0)
    assert.ok(payload.data.graph.lanes.length > 0)

    const mainlineNode = payload.data.graph.nodes.find((node) => node.layoutHint.isMainline)
    const mainlineLane = payload.data.graph.lanes.find((lane) => lane.isMainline)
    assert.ok(mainlineNode, 'expected a mainline node in topic graph')
    assert.ok(mainlineLane, 'expected a mainline lane summary in topic graph')
    assert.equal(mainlineNode?.layoutHint.laneIndex, 0)
    assert.equal(mainlineNode?.layoutHint.side, 'center')
    assert.equal(mainlineLane?.laneIndex, 0)
    assert.equal(mainlineLane?.roleLabel, '主线')

    for (const node of payload.data.graph.nodes) {
      assert.equal(typeof node.layoutHint.laneIndex, 'number')
      assert.ok(['left', 'center', 'right'].includes(node.layoutHint.side))
      if (!node.layoutHint.isMainline && node.layoutHint.branchIndex !== null) {
        assert.ok(node.layoutHint.branchIndex >= 0)
        assert.ok(node.layoutHint.branchIndex < 10)
      }
    }

    for (const lane of payload.data.graph.lanes) {
      assert.equal(typeof lane.laneIndex, 'number')
      if (!lane.isMainline && lane.branchIndex !== null) {
        assert.ok(lane.branchIndex >= 0)
        assert.ok(lane.branchIndex < 10)
      }
    }
  })
})

test('GET /api/topics/:id/view-model respects adjustable stage window buckets', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/topic-1/view-model?stageMonths=3`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        stageConfig: {
          windowMonths: number
        }
        timeline: {
          stages: Array<{
            title: string
            dateLabel: string
          }>
        }
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.stageConfig.windowMonths, 3)
    assert.ok(payload.data.timeline.stages.length > 0)
    assert.ok(
      payload.data.timeline.stages.every(
        (stage) => typeof stage.title === 'string' && stage.title.length > 0 && stage.dateLabel.length > 0,
      ),
    )
  })
})

test('GET /api/topics/:id/research-session returns the topic research session envelope', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/topic-1/research-session`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        active: boolean
        task: { id: string } | null
        progress: { topicId: string } | null
        report: { topicId: string } | null
        strategy: {
          cycleDelayMs: number
          stageStallLimit: number
          reportPasses: number
          currentStageStalls: number
        }
      }
    }

    assert.equal(payload.success, true)
    assert.equal(typeof payload.data.active, 'boolean')
    assert.equal(payload.data.strategy.cycleDelayMs >= 250, true)
    assert.equal(payload.data.strategy.stageStallLimit >= 1, true)
    assert.equal(payload.data.strategy.reportPasses >= 1, true)
    if (payload.data.task) {
      assert.equal(typeof payload.data.task.id, 'string')
    }
    if (payload.data.progress) {
      assert.equal(payload.data.progress.topicId, 'topic-1')
    }
    if (payload.data.report) {
      assert.equal(payload.data.report.topicId, 'topic-1')
    }
  })
})

test('GET /api/topics/:id/research-brief returns a grounded pulse envelope', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/topic-1/research-brief`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        topicId: string
        session: {
          report: { headline: string } | null
        }
        pipeline: {
          lastRun: { stageSummary: string } | null
        }
        world: {
          summary: {
            thesis: string
            currentFocus: string
          }
          claims: Array<{ statement: string }>
          highlights: Array<{ title: string; detail: string }>
          questions: Array<{ question: string }>
          agenda: Array<{ title: string }>
        }
        sessionMemory: {
          summary: {
            currentFocus: string
            continuity: string
            establishedJudgments: string[]
            openQuestions: string[]
            researchMomentum: string[]
          }
        }
        cognitiveMemory: {
          focus: string
          continuity: string
          conversationContract: string
          projectMemories: Array<{ summary: string }>
          feedbackMemories: Array<{ summary: string }>
          referenceMemories: Array<{ summary: string }>
        }
        guidance: {
          summary: {
            activeDirectiveCount: number
          }
          directives: Array<{ instruction: string }>
        }
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.topicId, 'topic-1')
    assert.equal(typeof payload.data.world.summary.thesis, 'string')
    assert.equal(typeof payload.data.world.summary.currentFocus, 'string')
    assert.equal(Array.isArray(payload.data.world.claims), true)
    assert.equal(Array.isArray(payload.data.world.highlights), true)
    assert.equal(Array.isArray(payload.data.world.questions), true)
    assert.equal(Array.isArray(payload.data.world.agenda), true)
    assert.ok(payload.data.world.claims.length > 0)
    assert.ok(payload.data.world.highlights.length > 0)
    assert.equal(typeof payload.data.sessionMemory.summary.currentFocus, 'string')
    assert.equal(typeof payload.data.sessionMemory.summary.continuity, 'string')
    assert.equal(Array.isArray(payload.data.sessionMemory.summary.establishedJudgments), true)
    assert.equal(Array.isArray(payload.data.sessionMemory.summary.openQuestions), true)
    assert.equal(Array.isArray(payload.data.sessionMemory.summary.researchMomentum), true)
    assert.equal(typeof payload.data.cognitiveMemory.focus, 'string')
    assert.equal(typeof payload.data.cognitiveMemory.continuity, 'string')
    assert.equal(typeof payload.data.cognitiveMemory.conversationContract, 'string')
    assert.equal(Array.isArray(payload.data.cognitiveMemory.projectMemories), true)
    assert.equal(Array.isArray(payload.data.cognitiveMemory.feedbackMemories), true)
    assert.equal(Array.isArray(payload.data.cognitiveMemory.referenceMemories), true)
    assert.equal(typeof payload.data.guidance.summary.activeDirectiveCount, 'number')
    assert.equal(Array.isArray(payload.data.guidance.directives), true)
    assert.equal(
      Boolean(
        payload.data.session.report?.headline ||
          payload.data.sessionMemory.summary.currentFocus ||
          payload.data.sessionMemory.summary.continuity ||
          payload.data.pipeline.lastRun?.stageSummary ||
          payload.data.sessionMemory.summary.establishedJudgments.length ||
          payload.data.sessionMemory.summary.openQuestions.length ||
          payload.data.sessionMemory.summary.researchMomentum.length,
      ),
      true,
    )
  })
})

test('POST /api/topics/:id/chat turns guidance-style messages into durable receipts', async () => {
  const guidanceKey = 'topic:guidance-ledger:v1:topic-1'
  await prisma.systemConfig.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/topics/topic-1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: '接下来一小时先围绕当前最核心的节点继续研究，不要扩主题。',
        }),
      })
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          answer: string
          guidanceReceipt?: {
            classification: string
            status: string
            scopeLabel: string
          }
          suggestedActions: Array<{ label: string }>
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.guidanceReceipt?.classification, 'focus')
      assert.equal(typeof payload.data.answer, 'string')
      assert.ok(payload.data.answer.length > 0)
      assert.ok(Array.isArray(payload.data.suggestedActions))
      assert.ok(payload.data.suggestedActions.length > 0)

      const briefResponse = await fetch(`${origin}/api/topics/topic-1/research-brief`)
      assert.equal(briefResponse.status, 200)

      const briefPayload = (await briefResponse.json()) as {
        success: boolean
        data: {
          guidance: {
            summary: {
              activeDirectiveCount: number
            }
            directives: Array<{
              instruction: string
              directiveType: string
            }>
          }
        }
      }

      assert.equal(briefPayload.success, true)
      assert.ok(briefPayload.data.guidance.summary.activeDirectiveCount >= 1)
      assert.ok(
        briefPayload.data.guidance.directives.some(
          (directive) =>
            directive.directiveType === 'focus' &&
            directive.instruction.includes('接下来一小时'),
        ),
      )
    })
  } finally {
    await prisma.systemConfig.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat localizes guidance receipt answers to the topic language', async () => {
  const guidanceKey = 'topic:guidance-ledger:v1:topic-1'
  const originalTopic = await prisma.topic.findUnique({
    where: { id: 'topic-1' },
    select: { language: true },
  })

  assert.ok(originalTopic)

  await prisma.systemConfig.deleteMany({
    where: { key: guidanceKey },
  })
  await prisma.topic.update({
    where: { id: 'topic-1' },
    data: { language: 'en' },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/topics/topic-1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: '接下来一小时先围绕当前最核心的节点继续研究，不要扩主题。',
        }),
      })
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          answer: string
          guidanceReceipt?: {
            classification: string
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.guidanceReceipt?.classification, 'focus')
      assert.match(payload.data.answer, /I accept your request to focus/i)
      assert.equal(/我接受/u.test(payload.data.answer), false)
    })
  } finally {
    await prisma.topic.update({
      where: { id: 'topic-1' },
      data: { language: originalTopic.language },
    })
    await prisma.systemConfig.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat executes research commands through the same sidebar channel', async () => {
  const guidanceKey = 'topic:guidance-ledger:v1:topic-1'

  await prisma.systemConfig.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    const question = 'start research for 1 hour'
    const seededResponse = await answerTopicQuestion('topic-1', question, undefined, {
      deferRecording: true,
    })
    const payload = await finalizeTopicChatCommandResponse({
      topicId: 'topic-1',
      rawQuestion: question,
      response: seededResponse,
    })

    assert.equal(payload.guidanceReceipt?.classification, 'command')
    assert.equal(payload.guidanceReceipt?.status, 'consumed')
    assert.equal(payload.workbenchAction?.kind, 'start-research')
    assert.ok(payload.workbenchAction?.summary.toLowerCase().includes('research'))
    assert.ok(payload.answer.toLowerCase().includes('research'))
    assert.ok(payload.guidanceReceipt?.summary.toLowerCase().includes('research'))

    const briefPayload = await enhancedTaskScheduler.getTopicResearchState('topic-1')
    assert.equal(briefPayload.active, true)
    assert.equal(briefPayload.report?.status, 'running')

    const stopPayload = await enhancedTaskScheduler.stopTopicResearchSession('topic-1')
    assert.equal(stopPayload.active, false)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat returns export workbench actions for the sidebar to finish locally', async () => {
  const guidanceKey = 'topic:guidance-ledger:v1:topic-1'
  await prisma.systemConfig.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/topics/topic-1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'export dossier',
        }),
      })
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          guidanceReceipt?: {
            classification: string
            status: string
          }
          workbenchAction?: {
            kind: string
            targetTab?: string
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.guidanceReceipt?.classification, 'command')
      assert.equal(payload.data.guidanceReceipt?.status, 'deferred')
      assert.equal(payload.data.workbenchAction?.kind, 'export-dossier')
      assert.equal(payload.data.workbenchAction?.targetTab, 'notes')
    })
  } finally {
    await prisma.systemConfig.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/export-bundles returns a batch dossier payload', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/export-bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicIds: ['topic-1'] }),
    })
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        schemaVersion: string
        topicCount: number
        bundles: Array<{
          schemaVersion: string
          topic: {
            topicId: string
          }
        }>
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.schemaVersion, 'topic-export-batch-v1')
    assert.equal(payload.data.topicCount, 1)
    assert.equal(payload.data.bundles.length, 1)
    assert.equal(payload.data.bundles[0]?.schemaVersion, 'topic-export-bundle-v1')
    assert.equal(payload.data.bundles[0]?.topic.topicId, 'topic-1')
  })
})

test('GET /api/topics/:id/export-bundle returns a full research dossier bundle', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/topic-1/export-bundle`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        schemaVersion: string
        topic: {
          topicId: string
          stages: Array<{ stageIndex: number }>
        }
        report: { topicId: string } | null
        world: {
          summary: {
            thesis: string
          }
          claims: Array<{ statement: string }>
          questions: Array<{ question: string }>
          agenda: Array<{ title: string }>
        }
        guidance: {
          summary: {
            activeDirectiveCount: number
          }
          directives: Array<{ instruction: string }>
        }
        pipeline: {
          overview: {
            recentHistory: unknown[]
            continuityThreads: string[]
          }
        }
        stageDossiers: Array<{
          stageIndex: number
          nodeCount: number
          paperCount: number
          pipeline: {
            subjectFocus: {
              stageIndex: number | null
            }
          }
        }>
        nodeDossiers: Array<{ nodeId: string; topic: { topicId: string } }>
        paperDossiers: Array<{ paperId: string; topic: { topicId: string } }>
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.schemaVersion, 'topic-export-bundle-v1')
    assert.equal(payload.data.topic.topicId, 'topic-1')
    assert.equal(typeof payload.data.world.summary.thesis, 'string')
    assert.ok(Array.isArray(payload.data.world.claims))
    assert.ok(Array.isArray(payload.data.world.questions))
    assert.ok(Array.isArray(payload.data.world.agenda))
    assert.equal(typeof payload.data.guidance.summary.activeDirectiveCount, 'number')
    assert.ok(Array.isArray(payload.data.guidance.directives))
    assert.ok(payload.data.stageDossiers.length > 0)
    assert.ok(payload.data.nodeDossiers.length > 0)
    assert.ok(payload.data.paperDossiers.length > 0)
    assert.ok(Array.isArray(payload.data.pipeline.overview.recentHistory))
    assert.ok(Array.isArray(payload.data.pipeline.overview.continuityThreads))

    for (const stage of payload.data.stageDossiers) {
      assert.equal(typeof stage.stageIndex, 'number')
      assert.ok(stage.nodeCount >= 0)
      assert.ok(stage.paperCount >= 0)
      assert.equal(stage.pipeline.subjectFocus.stageIndex, stage.stageIndex)
    }

    for (const node of payload.data.nodeDossiers) {
      assert.equal(typeof node.nodeId, 'string')
      assert.equal(node.topic.topicId, 'topic-1')
    }

    for (const paper of payload.data.paperDossiers) {
      assert.equal(typeof paper.paperId, 'string')
      assert.equal(paper.topic.topicId, 'topic-1')
    }

    if (payload.data.report) {
      assert.equal(payload.data.report.topicId, 'topic-1')
    }
  })
})

test('POST /api/topics/:id/research-session/stop returns the research session envelope', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/topic-1/research-session/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        active: boolean
        strategy: {
          cycleDelayMs: number
        }
      }
    }

    assert.equal(payload.success, true)
    assert.equal(typeof payload.data.active, 'boolean')
    assert.equal(payload.data.strategy.cycleDelayMs >= 250, true)
  })
})
