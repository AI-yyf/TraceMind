import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { disconnectDatabase, prisma } from '../lib/prisma'
import { disconnectRedis } from '../lib/redis'
import { createApp } from '../server'
import { omniGateway } from '../services/omni/gateway'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import { answerTopicQuestion, getEvidenceByAnchorId } from '../services/topics/alpha-topic'
import { buildTopicResearchWorld } from '../services/topics/research-world'
import {
  assertTopicResearchExportBatchContract,
  assertTopicResearchExportBundleContract,
} from '../services/topics/topic-contracts'
import { finalizeTopicChatCommandResponse } from '../services/topics/topic-chat-command'
import { loadTopicSessionMemory } from '../services/topics/topic-session-memory'

const TEST_SCOPE = `topic-alpha-route-${process.pid}-${Date.now().toString(36)}`
const TOPIC_ID = `${TEST_SCOPE}-topic`
const PAPER_1_ID = `${TEST_SCOPE}-paper-1`
const PAPER_2_ID = `${TEST_SCOPE}-paper-2`
const NODE_1_ID = `${TOPIC_ID}:stage-0:${PAPER_1_ID}`
const NODE_2_ID = `${TOPIC_ID}:stage-1:${PAPER_2_ID}`
const RESEARCH_WORLD_KEY = `topic-research-world:v1:${TOPIC_ID}`
const RESEARCH_JUDGMENT_KEY = `generation-judgments:v1:${TOPIC_ID}`
const OBJECTIVE_TABLE_ID = `${PAPER_1_ID}-objective-table`
const originalHasAvailableModel = omniGateway.hasAvailableModel.bind(omniGateway)
const originalComplete = omniGateway.complete.bind(omniGateway)

test.before(() => {
  omniGateway.hasAvailableModel = async () => false
  omniGateway.complete = async (request) => ({
    text: request.json
      ? JSON.stringify({
          answer: 'Test fallback response',
          citations: [],
          suggestedActions: [],
        })
      : 'Test fallback response',
    provider: 'backend',
    model: 'backend-fallback',
    slot: request.preferredSlot ?? 'language',
    capabilities: {
      text: true,
      image: false,
      pdf: false,
      chart: false,
      formula: false,
      citationsNative: false,
      fileParserNative: false,
      toolCalling: false,
      jsonMode: true,
      streaming: false,
    },
    usedFallback: true,
    issue: {
      code: 'missing_key',
      title: 'Test model disabled',
      message: 'Model access is disabled during topic-alpha route tests.',
      provider: 'backend',
      model: 'backend-fallback',
      slot: request.preferredSlot ?? 'language',
    },
  })
})

async function ensureSeedTopic() {
  await prisma.$transaction([
    prisma.node_papers.deleteMany({
      where: {
        research_nodes: { topicId: TOPIC_ID },
      },
    }),
    prisma.research_nodes.deleteMany({
      where: { topicId: TOPIC_ID },
    }),
    prisma.topic_stages.deleteMany({
      where: { topicId: TOPIC_ID },
    }),
    prisma.papers.deleteMany({
      where: { topicId: TOPIC_ID },
    }),
    prisma.system_configs.deleteMany({
      where: {
        OR: [
          { key: `alpha:topic-artifact:${TOPIC_ID}:window-6` },
          { key: `alpha:topic-artifact:${TOPIC_ID}:window-3` },
          { key: { startsWith: `alpha:topic-artifact:${TOPIC_ID}:` } },
          { key: `topic:guidance-ledger:v1:${TOPIC_ID}` },
          { key: `topic:session-memory:v1:${TOPIC_ID}` },
          { key: RESEARCH_JUDGMENT_KEY },
          { key: RESEARCH_WORLD_KEY },
        ],
      },
    }),
  ])

  await prisma.topics.upsert({
    where: { id: TOPIC_ID },
    update: {
      nameZh: '自动驾驶世界模型',
      nameEn: 'Autonomous Driving World Models',
      focusLabel: '端到端自动驾驶',
      summary: '研究自动驾驶领域中基于世界模型的端到端学习方法',
      description: '本主题追踪自动驾驶领域从传统模块化方法到端到端世界模型的重要演进。',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
    create: {
      id: TOPIC_ID,
      nameZh: '自动驾驶世界模型',
      nameEn: 'Autonomous Driving World Models',
      focusLabel: '端到端自动驾驶',
      summary: '研究自动驾驶领域中基于世界模型的端到端学习方法',
      description: '本主题追踪自动驾驶领域从传统模块化方法到端到端世界模型的重要演进。',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  await prisma.topic_stages.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        topicId: TOPIC_ID,
        order: 1,
        name: '问题提出',
        description: '自动驾驶的挑战与机遇',
      },
      {
        id: crypto.randomUUID(),
        topicId: TOPIC_ID,
        order: 2,
        name: '基础方法',
        description: '早期端到端自动驾驶探索',
      },
    ],
  })

  await prisma.papers.upsert({
    where: { id: PAPER_1_ID },
    update: {
      topicId: TOPIC_ID,
      title: 'End-to-End Driving Through Uncertainty',
      titleZh: '通过不确定性实现端到端自动驾驶',
      titleEn: 'End-to-End Driving Through Uncertainty',
      authors: JSON.stringify(['王晨奕', '雷霆']),
      published: new Date('2022-03-15T00:00:00.000Z'),
      summary: '提出了一种基于不确定性估计的端到端自动驾驶方法。',
      explanation: '证明深度学习可以直接学习驾驶策略。',
      figurePaths: JSON.stringify([]),
      tablePaths: JSON.stringify([]),
      tags: JSON.stringify(['端到端', '自动驾驶']),
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
    create: {
      id: PAPER_1_ID,
      topicId: TOPIC_ID,
      title: 'End-to-End Driving Through Uncertainty',
      titleZh: '通过不确定性实现端到端自动驾驶',
      titleEn: 'End-to-End Driving Through Uncertainty',
      authors: JSON.stringify(['王晨奕', '雷霆']),
      published: new Date('2022-03-15T00:00:00.000Z'),
      summary: '提出了一种基于不确定性估计的端到端自动驾驶方法。',
      explanation: '证明深度学习可以直接学习驾驶策略。',
      figurePaths: JSON.stringify([]),
      tablePaths: JSON.stringify([]),
      tags: JSON.stringify(['端到端', '自动驾驶']),
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })

  await prisma.papers.upsert({
    where: { id: PAPER_2_ID },
    update: {
      topicId: TOPIC_ID,
      title: 'World Models for Autonomous Driving',
      titleZh: '自动驾驶世界模型',
      titleEn: 'World Models for Autonomous Driving',
      authors: JSON.stringify(['王小明', '陈丽']),
      published: new Date('2023-06-20T00:00:00.000Z'),
      summary: '提出用于自动驾驶的世界模型。',
      explanation: '世界模型能够学习环境动态并预测未来状态。',
      figurePaths: JSON.stringify([]),
      tablePaths: JSON.stringify([]),
      tags: JSON.stringify(['世界模型', '自动驾驶']),
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
    create: {
      id: PAPER_2_ID,
      topicId: TOPIC_ID,
      title: 'World Models for Autonomous Driving',
      titleZh: '自动驾驶世界模型',
      titleEn: 'World Models for Autonomous Driving',
      authors: JSON.stringify(['王小明', '陈丽']),
      published: new Date('2023-06-20T00:00:00.000Z'),
      summary: '提出用于自动驾驶的世界模型。',
      explanation: '世界模型能够学习环境动态并预测未来状态。',
      figurePaths: JSON.stringify([]),
      tablePaths: JSON.stringify([]),
      tags: JSON.stringify(['世界模型', '自动驾驶']),
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })

  await prisma.research_nodes.upsert({
    where: { id: NODE_1_ID },
    update: {
      topicId: TOPIC_ID,
      stageIndex: 1,
      nodeLabel: '端到端自动驾驶的诞生',
      nodeSubtitle: '问题与动机',
      nodeSummary: '端到端自动驾驶方法首次被提出。',
      nodeExplanation: '证明了从感知到控制端到端学习的潜力。',
      primaryPaperId: PAPER_1_ID,
      isMergeNode: false,
      provisional: false,
      status: 'canonical',
      updatedAt: new Date(),
    },
    create: {
      id: NODE_1_ID,
      topicId: TOPIC_ID,
      stageIndex: 1,
      nodeLabel: '端到端自动驾驶的诞生',
      nodeSubtitle: '问题与动机',
      nodeSummary: '端到端自动驾驶方法首次被提出。',
      nodeExplanation: '证明了从感知到控制端到端学习的潜力。',
      primaryPaperId: PAPER_1_ID,
      isMergeNode: false,
      provisional: false,
      status: 'canonical',
      updatedAt: new Date(),
    },
  })

  await prisma.research_nodes.upsert({
    where: { id: NODE_2_ID },
    update: {
      topicId: TOPIC_ID,
      stageIndex: 2,
      nodeLabel: '世界模型的引入',
      nodeSubtitle: '预测与仿真',
      nodeSummary: '世界模型被引入自动驾驶领域。',
      nodeExplanation: '世界模型能够学习环境动态并辅助规划决策。',
      primaryPaperId: PAPER_2_ID,
      isMergeNode: false,
      provisional: false,
      status: 'canonical',
      updatedAt: new Date(),
    },
    create: {
      id: NODE_2_ID,
      topicId: TOPIC_ID,
      stageIndex: 2,
      nodeLabel: '世界模型的引入',
      nodeSubtitle: '预测与仿真',
      nodeSummary: '世界模型被引入自动驾驶领域。',
      nodeExplanation: '世界模型能够学习环境动态并辅助规划决策。',
      primaryPaperId: PAPER_2_ID,
      isMergeNode: false,
      provisional: false,
      status: 'canonical',
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        nodeId: NODE_1_ID,
        paperId: PAPER_1_ID,
        order: 0,
      },
      {
        id: crypto.randomUUID(),
        nodeId: NODE_2_ID,
        paperId: PAPER_2_ID,
        order: 0,
      },
    ],
  })
}

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
    await Promise.allSettled([enhancedTaskScheduler.stopTopicResearchSession(TOPIC_ID)])

    for (const task of enhancedTaskScheduler.getAllTasks()) {
      enhancedTaskScheduler.removeTask(task.id)
    }

    await new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.()
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

function testFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  headers.set('connection', 'close')
  return fetch(input, {
    ...init,
    headers,
  })
}

test.after(async () => {
  omniGateway.hasAvailableModel = originalHasAvailableModel
  omniGateway.complete = originalComplete

  await Promise.allSettled([enhancedTaskScheduler.stopTopicResearchSession(TOPIC_ID)])

  for (const task of enhancedTaskScheduler.getAllTasks()) {
    enhancedTaskScheduler.removeTask(task.id)
  }

  await disconnectRedis()
  await disconnectDatabase()
})

test('GET /api/topics/:id/view-model returns lane-aware graph metadata', async () => {
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/view-model`)
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
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/view-model?stageMonths=3`)
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
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/research-session`)
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
      assert.equal(payload.data.progress.topicId, TOPIC_ID)
    }
    if (payload.data.report) {
      assert.equal(payload.data.report.topicId, TOPIC_ID)
    }
  })
})

test('POST /api/topics/:id/research-session accepts month-long research windows', async () => {
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/research-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationHours: 24 * 30 }),
    })
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        active: boolean
        progress: {
          topicId: string
          durationHours: number | null
        } | null
        task: {
          options?: {
            durationHours?: number
          }
        } | null
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.active, true)
    assert.equal(payload.data.progress?.topicId, TOPIC_ID)
    assert.equal(payload.data.progress?.durationHours, 24 * 30)
    assert.equal(payload.data.task?.options?.durationHours, 24 * 30)
  })
})

test('POST /api/topics/research-session/batch forwards multi-topic duration windows to the scheduler', async () => {
  const originalStartMultiTopicResearchSession =
    enhancedTaskScheduler.startMultiTopicResearchSession.bind(enhancedTaskScheduler)
  let receivedTopicIds: string[] = []
  let receivedOptions: { durationHours?: number; stageDurationDays?: number } | undefined

  enhancedTaskScheduler.startMultiTopicResearchSession = (async (topicIds, options) => {
    receivedTopicIds = [...topicIds]
    receivedOptions = options
    return {
      topicIds,
      sessions: topicIds.map((topicId) => ({
        topicId,
        task: null,
        progress: null,
        report: null,
        active: true,
      })),
      aggregate: {
        totalTopics: topicIds.length,
        activeTopics: topicIds.length,
        completedTopics: 0,
        failedTopics: 0,
        totalDiscoveredPapers: 0,
        totalAdmittedPapers: 0,
        totalGeneratedContents: 0,
        overallProgress: 0,
        startedAt: '2026-04-23T00:00:00.000Z',
        deadlineAt: '2026-05-23T00:00:00.000Z',
      },
    }
  }) as typeof enhancedTaskScheduler.startMultiTopicResearchSession

  try {
    await withServer(async (origin) => {
      const response = await testFetch(`${origin}/api/topics/research-session/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicIds: ['agent', 'autonomous-driving'],
          stageDurationDays: 30,
        }),
      })

      assert.equal(response.status, 200)
      const payload = (await response.json()) as {
        success: boolean
        data: {
          aggregate: {
            totalTopics: number
            activeTopics: number
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.aggregate.totalTopics, 2)
      assert.equal(payload.data.aggregate.activeTopics, 2)
      assert.deepEqual(receivedTopicIds, ['agent', 'autonomous-driving'])
      assert.deepEqual(receivedOptions, {
        stageDurationDays: 30,
        durationHours: 24 * 30,
      })
    })
  } finally {
    enhancedTaskScheduler.startMultiTopicResearchSession = originalStartMultiTopicResearchSession
  }
})

test('POST /api/topics/research-session/batch rejects requests beyond the five-topic research limit', async () => {
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/research-session/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicIds: ['t1', 't2', 't3', 't4', 't5', 't6'],
        stageDurationDays: 30,
      }),
    })

    assert.equal(response.status, 400)
    await response.json()
  })
})

test('GET /api/topics/:id/research-brief returns a grounded pulse envelope', async () => {
  await ensureSeedTopic()
  await prisma.system_configs.upsert({
    where: { key: RESEARCH_JUDGMENT_KEY },
    update: {
      value: JSON.stringify({
        schemaVersion: 'generation-judgments-v1',
        topicId: TOPIC_ID,
        updatedAt: '2026-04-15T00:00:00.000Z',
        judgments: [
          {
            id: 'judgment-node-finding',
            topicId: TOPIC_ID,
            subjectType: 'node',
            scopeId: TOPIC_ID,
            kind: 'finding',
            content: 'The origin node should keep the foundational transformer judgment grounded in its own paper.',
            confidence: 'high',
            sourcePassId: `article.node:node:${NODE_1_ID}:zh`,
            sourceTemplateId: 'article.node',
            language: 'zh',
            createdAt: '2026-04-15T00:00:00.000Z',
          },
          {
            id: 'judgment-node-critique',
            topicId: TOPIC_ID,
            subjectType: 'node',
            scopeId: TOPIC_ID,
            kind: 'error-correction',
            content: 'The origin node still needs a tighter evidence boundary.',
            confidence: 'medium',
            sourcePassId: `article.reviewer:node:${NODE_1_ID}:zh`,
            sourceTemplateId: 'article.reviewer',
            language: 'zh',
            createdAt: '2026-04-15T00:01:00.000Z',
          },
          {
            id: 'judgment-stage-question',
            topicId: TOPIC_ID,
            subjectType: 'stage',
            scopeId: 'research-stage:1',
            kind: 'open-question',
            content: 'Should this stage remain a standalone origin window or be merged into a broader setup period?',
            confidence: 'medium',
            sourcePassId: 'topic.researchOrchestration:stage:research-stage:1:round:1:zh',
            sourceTemplateId: 'topic.researchOrchestration',
            language: 'zh',
            createdAt: '2026-04-15T00:02:00.000Z',
          },
        ],
      }),
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      key: RESEARCH_JUDGMENT_KEY,
      value: JSON.stringify({
        schemaVersion: 'generation-judgments-v1',
        topicId: TOPIC_ID,
        updatedAt: '2026-04-15T00:00:00.000Z',
        judgments: [
          {
            id: 'judgment-node-finding',
            topicId: TOPIC_ID,
            subjectType: 'node',
            scopeId: TOPIC_ID,
            kind: 'finding',
            content: 'The origin node should keep the foundational transformer judgment grounded in its own paper.',
            confidence: 'high',
            sourcePassId: `article.node:node:${NODE_1_ID}:zh`,
            sourceTemplateId: 'article.node',
            language: 'zh',
            createdAt: '2026-04-15T00:00:00.000Z',
          },
          {
            id: 'judgment-node-critique',
            topicId: TOPIC_ID,
            subjectType: 'node',
            scopeId: TOPIC_ID,
            kind: 'error-correction',
            content: 'The origin node still needs a tighter evidence boundary.',
            confidence: 'medium',
            sourcePassId: `article.reviewer:node:${NODE_1_ID}:zh`,
            sourceTemplateId: 'article.reviewer',
            language: 'zh',
            createdAt: '2026-04-15T00:01:00.000Z',
          },
          {
            id: 'judgment-stage-question',
            topicId: TOPIC_ID,
            subjectType: 'stage',
            scopeId: 'research-stage:1',
            kind: 'open-question',
            content: 'Should this stage remain a standalone origin window or be merged into a broader setup period?',
            confidence: 'medium',
            sourcePassId: 'topic.researchOrchestration:stage:research-stage:1:round:1:zh',
            sourceTemplateId: 'topic.researchOrchestration',
            language: 'zh',
            createdAt: '2026-04-15T00:02:00.000Z',
          },
        ],
      }),
      updatedAt: new Date(),
    },
  })
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/research-brief`)
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
          stages: Array<{ id: string }>
          nodes: Array<{ id: string }>
          papers: Array<{ id: string }>
          summary: {
            thesis: string
            currentFocus: string
          }
          claims: Array<{
            id: string
            scope: 'topic' | 'stage' | 'node' | 'paper'
            scopeId: string
            statement: string
            supportNodeIds: string[]
            supportPaperIds: string[]
            source: 'judgment' | 'report' | 'session' | 'structure'
          }>
          highlights: Array<{
            scope: 'topic' | 'stage' | 'node' | 'paper'
            scopeId: string
            title: string
            detail: string
            source: 'judgment' | 'report' | 'session' | 'structure'
          }>
          questions: Array<{
            scope: 'topic' | 'stage' | 'node' | 'paper'
            scopeId: string
            question: string
            source: 'judgment' | 'report' | 'pipeline' | 'session' | 'structure'
          }>
          critiques: Array<{
            targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim'
            targetId: string
            source: 'judgment' | 'report' | 'session' | 'structure'
          }>
          agenda: Array<{
            targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim'
            targetId: string
            title: string
          }>
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
    assert.equal(payload.data.topicId, TOPIC_ID)
    assert.equal(typeof payload.data.world.summary.thesis, 'string')
    assert.equal(typeof payload.data.world.summary.currentFocus, 'string')
    assert.equal(Array.isArray(payload.data.world.claims), true)
    assert.equal(Array.isArray(payload.data.world.highlights), true)
    assert.equal(Array.isArray(payload.data.world.questions), true)
    assert.equal(Array.isArray(payload.data.world.critiques), true)
    assert.equal(Array.isArray(payload.data.world.agenda), true)
    assert.ok(payload.data.world.claims.length > 0)
    assert.ok(payload.data.world.highlights.length > 0)

    const stageIds = new Set(payload.data.world.stages.map((stage) => stage.id))
    const nodeIds = new Set(payload.data.world.nodes.map((node) => node.id))
    const paperIds = new Set(payload.data.world.papers.map((paper) => paper.id))
    const assertTarget = (
      targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim',
      targetId: string,
    ) => {
      if (targetType === 'topic') {
        assert.equal(targetId, TOPIC_ID)
        return
      }
      if (targetType === 'stage') {
        assert.equal(stageIds.has(targetId), true)
        return
      }
      if (targetType === 'node') {
        assert.equal(nodeIds.has(targetId), true)
        return
      }
      if (targetType === 'paper') {
        assert.equal(paperIds.has(targetId), true)
        return
      }
      const claimIds = new Set(payload.data.world.claims.map((claim) => claim.id))
      assert.equal(claimIds.has(targetId), true)
    }

    payload.data.world.claims.forEach((claim) => {
      assertTarget(claim.scope, claim.scopeId)
      claim.supportNodeIds.forEach((nodeId) => assert.equal(nodeIds.has(nodeId), true))
      claim.supportPaperIds.forEach((paperId) => assert.equal(paperIds.has(paperId), true))
    })
    payload.data.world.highlights.forEach((highlight) => assertTarget(highlight.scope, highlight.scopeId))
    payload.data.world.questions.forEach((question) => assertTarget(question.scope, question.scopeId))
    payload.data.world.critiques.forEach((critique) =>
      assertTarget(critique.targetType, critique.targetId),
    )
    payload.data.world.agenda.forEach((agendaItem) =>
      assertTarget(agendaItem.targetType, agendaItem.targetId),
    )
    assert.ok(
      payload.data.world.claims.some(
        (claim) => claim.source === 'judgment' && claim.scope === 'node' && claim.scopeId === NODE_1_ID,
      ),
    )
    assert.ok(
      payload.data.world.critiques.some(
        (critique) =>
          critique.source === 'judgment' &&
          critique.targetType === 'node' &&
          critique.targetId === NODE_1_ID,
      ),
    )
    assert.ok(
      payload.data.world.questions.some(
        (question) =>
          question.source === 'judgment' &&
          question.scope === 'stage' &&
          stageIds.has(question.scopeId),
      ),
    )
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
  await ensureSeedTopic()
  const guidanceKey = `topic:guidance-ledger:v1:${TOPIC_ID}`
  await prisma.system_configs.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    await withServer(async (origin) => {
      const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/chat`, {
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

      const guidanceRecord = await prisma.system_configs.findUnique({
        where: { key: guidanceKey },
      })
      const memory = await loadTopicSessionMemory(TOPIC_ID)

      assert.ok(guidanceRecord?.value)
      assert.match(guidanceRecord?.value ?? '', /focus|聚焦|主线/u)
      assert.ok(memory.summary.currentFocus.length > 0)
      assert.ok(memory.summary.lastUserIntent.length > 0)
      assert.ok(
        memory.recentEvents.some(
          (event) =>
            event.kind === 'chat-user' &&
            event.headline === 'User focus directive' &&
            event.summary.length > 0,
        ),
      )
      assert.ok(
        memory.recentEvents.some(
          (event) =>
            event.kind === 'chat-assistant' &&
            event.headline === 'Focus receipt' &&
            event.summary.length > 0,
        ),
      )
    })
  } finally {
    await prisma.system_configs.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat localizes guidance receipt answers to the topic language', async () => {
  await ensureSeedTopic()
  const guidanceKey = `topic:guidance-ledger:v1:${TOPIC_ID}`
  const originalTopic = await prisma.topics.findUnique({
    where: { id: TOPIC_ID },
    select: { language: true },
  })

  assert.ok(originalTopic)

  await prisma.system_configs.deleteMany({
    where: { key: guidanceKey },
  })
  await prisma.topics.update({
    where: { id: TOPIC_ID },
    data: { language: 'en' },
  })

  try {
    await withServer(async (origin) => {
      const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/chat`, {
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
    await prisma.topics.update({
      where: { id: TOPIC_ID },
      data: { language: originalTopic.language },
    })
    await prisma.system_configs.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat persists workbench briefs and materials into session memory', async () => {
  await ensureSeedTopic()

  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'How should the current mainline change after reading this note?',
        workbench: {
          controls: {
            responseStyle: 'deep',
            reasoningEnabled: true,
            retrievalEnabled: true,
          },
          contextItems: ['Current reading focus: Node focus - Current node locus'],
          agentBrief: 'Prioritize deployment risks and failure modes in the next answer.',
          materials: [
            {
              id: 'material-1',
              kind: 'text',
              name: 'deployment-notes.md',
              mimeType: 'text/markdown',
              summary:
                'Failure mode taxonomy covering sensor blackout, planner latency, and recovery envelope gaps.',
              highlights: ['Sensor blackout', 'Planner latency spike', 'Recovery envelope'],
              status: 'ready',
            },
          ],
        },
      }),
    })
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        answer: string
      }
    }

    assert.equal(payload.success, true)
    assert.equal(typeof payload.data.answer, 'string')
    assert.ok(payload.data.answer.length > 0)

    const memory = await loadTopicSessionMemory(TOPIC_ID)
    const matchingUserEvent = memory.recentEvents.find(
      (event) =>
        event.kind === 'chat-user' &&
        /deployment-notes\.md|Planner latency|Prioritize deployment risks/i.test(
          `${event.summary}\n${event.detail ?? ''}`,
        ),
    )

    assert.ok(matchingUserEvent, 'expected a persisted workbench handoff event in session memory')
    assert.match(matchingUserEvent?.headline ?? '', /User workbench handoff|User follow-up/i)
    assert.match(
      `${matchingUserEvent?.summary ?? ''}\n${matchingUserEvent?.detail ?? ''}`,
      /deployment-notes\.md|Sensor blackout|Planner latency|Prioritize deployment risks/i,
    )
    assert.match(
      memory.summary.lastUserIntent,
      /How should the current mainline change after reading this note\?/i,
    )
  })
})

test('GET /api/topics/:id/research-brief rebuilds invalid cached world snapshots instead of reusing them', async () => {
  await ensureSeedTopic()
  const next = await buildTopicResearchWorld(TOPIC_ID)
  const corruptedWorld = JSON.parse(JSON.stringify(next.world)) as {
    stages?: Array<Record<string, unknown>>
  }
  delete corruptedWorld.stages?.[0]?.stageIndex

  await prisma.system_configs.upsert({
    where: { key: RESEARCH_WORLD_KEY },
    update: {
      value: JSON.stringify({
        schemaVersion: 'topic-research-world-record-v1',
        topicId: TOPIC_ID,
        fingerprint: next.fingerprint,
        savedAt: '2026-04-18T00:00:00.000Z',
        world: corruptedWorld,
      }),
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      key: RESEARCH_WORLD_KEY,
      value: JSON.stringify({
        schemaVersion: 'topic-research-world-record-v1',
        topicId: TOPIC_ID,
        fingerprint: next.fingerprint,
        savedAt: '2026-04-18T00:00:00.000Z',
        world: corruptedWorld,
      }),
      updatedAt: new Date(),
    },
  })

  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/research-brief`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        world: {
          stages: Array<{ stageIndex: number }>
        }
      }
    }

    assert.equal(payload.success, true)
    assert.ok(payload.data.world.stages.length > 0)
    payload.data.world.stages.forEach((stage, index) => {
      assert.equal(typeof stage.stageIndex, 'number', `expected stage ${index + 1} to expose stageIndex`)
    })

    const savedRecord = await prisma.system_configs.findUnique({
      where: { key: RESEARCH_WORLD_KEY },
    })
    assert.ok(savedRecord?.value)

    const parsed = JSON.parse(savedRecord?.value ?? '{}') as {
      world?: {
        stages?: Array<{ stageIndex?: number }>
      }
    }

    parsed.world?.stages?.forEach((stage, index) => {
      assert.equal(
        typeof stage.stageIndex,
        'number',
        `expected persisted stage ${index + 1} to restore stageIndex`,
      )
    })
  })
})

test('synthetic formula anchors resolve to grounded evidence payloads', async () => {
  await ensureSeedTopic()

  await prisma.tables.upsert({
    where: { id: OBJECTIVE_TABLE_ID },
    update: {
      paperId: PAPER_1_ID,
      number: 1,
      caption: 'Objective terms',
      page: 3,
      headers: JSON.stringify(['term', 'value']),
      rows: JSON.stringify([
        ['objective', 'Loss = L_plan + lambda * L_ctrl'],
        ['score', '0.81'],
      ]),
      rawText: 'Objective terms\nLoss = L_plan + lambda * L_ctrl\nPlanner score 0.81',
    },
    create: {
      id: OBJECTIVE_TABLE_ID,
      paperId: PAPER_1_ID,
      number: 1,
      caption: 'Objective terms',
      page: 3,
      headers: JSON.stringify(['term', 'value']),
      rows: JSON.stringify([
        ['objective', 'Loss = L_plan + lambda * L_ctrl'],
        ['score', '0.81'],
      ]),
      rawText: 'Objective terms\nLoss = L_plan + lambda * L_ctrl\nPlanner score 0.81',
    },
  })

  const payload = await getEvidenceByAnchorId(`formula:synthetic-table-${OBJECTIVE_TABLE_ID}-1`)

  assert.equal(payload.type, 'formula')
  assert.equal(payload.sourcePaperId, PAPER_1_ID)
  assert.equal(payload.metadata?.paperId, PAPER_1_ID)
  assert.equal(payload.metadata?.synthetic, true)
  assert.equal(payload.metadata?.sourceKind, 'table')
  assert.equal(payload.metadata?.sourceId, OBJECTIVE_TABLE_ID)
  assert.match(payload.formulaLatex ?? '', /Loss = L_plan \+ lambda \* L_ctrl/u)
  assert.match(payload.route, new RegExp(`/node/${TOPIC_ID}:stage-0:${PAPER_1_ID}`, 'u'))
})

test('POST /api/topics/:id/chat executes research commands through the same sidebar channel', async () => {
  await ensureSeedTopic()
  const guidanceKey = `topic:guidance-ledger:v1:${TOPIC_ID}`

  await prisma.system_configs.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    const question = 'start research for 1 hour'
    const seededResponse = await answerTopicQuestion(TOPIC_ID, question, undefined, {
      deferRecording: true,
    })
    const payload = await finalizeTopicChatCommandResponse({
      topicId: TOPIC_ID,
      rawQuestion: question,
      response: seededResponse,
    })

    assert.equal(payload.guidanceReceipt?.classification, 'command')
    assert.equal(payload.guidanceReceipt?.status, 'consumed')
    assert.equal(payload.workbenchAction?.kind, 'start-research')
    assert.ok(payload.workbenchAction?.summary.toLowerCase().includes('research'))
    assert.ok(payload.answer.toLowerCase().includes('research'))
    assert.ok(payload.guidanceReceipt?.summary.toLowerCase().includes('research'))

    const briefPayload = await enhancedTaskScheduler.getTopicResearchState(TOPIC_ID)
    assert.equal(briefPayload.active, true)
    assert.equal(briefPayload.report?.status, 'running')

    const stopPayload = await enhancedTaskScheduler.stopTopicResearchSession(TOPIC_ID)
    assert.equal(stopPayload.active, false)
  } finally {
    await prisma.system_configs.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat records command turns into session memory and refreshes latest user steering', async () => {
  await ensureSeedTopic()

  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'start research for 1 hour and explain what you will prioritize first',
      }),
    })
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        guidanceReceipt?: {
          classification: string
          status: string
          summary: string
        }
        workbenchAction?: {
          kind: string
          summary: string
        }
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.guidanceReceipt?.classification, 'command')
    assert.equal(payload.data.guidanceReceipt?.status, 'consumed')
    assert.equal(payload.data.workbenchAction?.kind, 'start-research')
    assert.ok(payload.data.workbenchAction?.summary.length)

    const memory = await loadTopicSessionMemory(TOPIC_ID)
    assert.match(memory.summary.lastUserIntent, /start research for 1 hour/i)
    assert.ok(
      memory.recentEvents.some(
        (event) =>
          event.kind === 'chat-user' &&
          event.headline === 'Workbench command' &&
          /start research for 1 hour/i.test(event.summary),
      ),
    )
    assert.ok(
      memory.recentEvents.some(
        (event) =>
          event.kind === 'chat-assistant' &&
          event.headline === 'Workbench command result' &&
          /research/i.test(event.summary),
      ),
    )
  })

  const stopPayload = await enhancedTaskScheduler.stopTopicResearchSession(TOPIC_ID)
  assert.equal(stopPayload.active, false)
})

test('POST /api/topics/:id/chat records localized guidance prompts into the guidance ledger path', async () => {
  await ensureSeedTopic()
  const guidanceKey = `topic:guidance-ledger:v1:${TOPIC_ID}`

  await prisma.system_configs.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    await withServer(async (origin) => {
      const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:
            '次の研究ラウンドでは、現在の主線でもっとも弱い箇所を優先して補強し、その調整がなぜ重要かも説明してください。',
        }),
      })
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          guidanceReceipt?: {
            classification: string
            status: string
            summary: string
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.guidanceReceipt?.classification, 'suggest')
      assert.equal(payload.data.guidanceReceipt?.status, 'accepted')
      assert.ok(payload.data.guidanceReceipt?.summary.length)

      const guidanceRecord = await prisma.system_configs.findUnique({
        where: { key: guidanceKey },
      })
      assert.ok(guidanceRecord?.value)
      assert.match(guidanceRecord?.value ?? '', /guide|guidance|主線|weakest|補強/u)
    })
  } finally {
    await prisma.system_configs.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/:id/chat returns export workbench actions for the sidebar to finish locally', async () => {
  await ensureSeedTopic()
  const guidanceKey = `topic:guidance-ledger:v1:${TOPIC_ID}`
  await prisma.system_configs.deleteMany({
    where: { key: guidanceKey },
  })

  try {
    await withServer(async (origin) => {
      const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/chat`, {
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
            targetRoute?: string
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.guidanceReceipt?.classification, 'command')
      assert.equal(payload.data.guidanceReceipt?.status, 'deferred')
      assert.equal(payload.data.workbenchAction?.kind, 'export-dossier')
      assert.equal(payload.data.workbenchAction?.targetRoute, `/favorites?topic=${TOPIC_ID}`)
    })
  } finally {
    await prisma.system_configs.deleteMany({
      where: { key: guidanceKey },
    })
  }
})

test('POST /api/topics/export-bundles returns a batch dossier payload', async () => {
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/export-bundles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicIds: [TOPIC_ID] }),
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
    assert.equal(payload.data.schemaVersion, 'topic-export-batch-v2')
    assert.doesNotThrow(() => assertTopicResearchExportBatchContract(payload.data))
    assert.equal(payload.data.topicCount, 1)
    assert.equal(payload.data.bundles.length, 1)
    assert.equal(payload.data.bundles[0]?.schemaVersion, 'topic-export-bundle-v2')
    assert.equal(payload.data.bundles[0]?.topic.topicId, TOPIC_ID)
  })
})

test('GET /api/topics/:id/export-bundle returns a full research dossier bundle', async () => {
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/export-bundle`)
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
          nodeIds?: string[]
          paperCount?: number
          paperIds?: string[]
          pipeline: {
            subjectFocus: {
              stageIndex: number | null
            }
          }
        }>
        nodeDossiers: Array<{ nodeId: string; topic: { topicId: string } }>
        paperDossiers?: Array<{ paperId: string; topic: { topicId: string } }>
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.schemaVersion, 'topic-export-bundle-v2')
    assert.doesNotThrow(() => assertTopicResearchExportBundleContract(payload.data))
    assert.equal(payload.data.topic.topicId, TOPIC_ID)
    assert.equal(typeof payload.data.world.summary.thesis, 'string')
    assert.ok(Array.isArray(payload.data.world.claims))
    assert.ok(Array.isArray(payload.data.world.questions))
    assert.ok(Array.isArray(payload.data.world.agenda))
    assert.equal(typeof payload.data.guidance.summary.activeDirectiveCount, 'number')
    assert.ok(Array.isArray(payload.data.guidance.directives))
    assert.ok(payload.data.stageDossiers.length > 0)
    assert.ok(Array.isArray(payload.data.nodeDossiers))
    assert.equal('paperDossiers' in payload.data, false)
    assert.ok(Array.isArray(payload.data.pipeline.overview.recentHistory))
    assert.ok(Array.isArray(payload.data.pipeline.overview.continuityThreads))

    for (const stage of payload.data.stageDossiers) {
      assert.equal(typeof stage.stageIndex, 'number')
      assert.ok(stage.nodeCount >= 0)
      assert.equal('paperCount' in stage, false)
      assert.equal('paperIds' in stage, false)
      assert.equal(stage.pipeline.subjectFocus.stageIndex, stage.stageIndex)
    }

    for (const node of payload.data.nodeDossiers) {
      assert.equal(typeof node.nodeId, 'string')
      assert.equal(node.topic.topicId, TOPIC_ID)
    }

    if (payload.data.report) {
      assert.equal(payload.data.report.topicId, TOPIC_ID)
    }

    const bundleWithRetiredTopLevelField = structuredClone(payload.data) as typeof payload.data & {
      paperDossiers: []
    }
    bundleWithRetiredTopLevelField.paperDossiers = []
    assert.throws(
      () => assertTopicResearchExportBundleContract(bundleWithRetiredTopLevelField),
      /paperDossiers/,
    )

    const bundleWithRetiredStageFields = structuredClone(payload.data) as typeof payload.data
    const firstStage = bundleWithRetiredStageFields.stageDossiers[0]
    assert.ok(firstStage, 'expected at least one stage dossier in export bundle test')
    Object.assign(firstStage, {
      paperCount: 0,
      paperIds: [],
    })
    assert.throws(
      () => assertTopicResearchExportBundleContract(bundleWithRetiredStageFields),
      /paperCount|paperIds/,
    )
  })
})

test('POST /api/topics/:id/research-session/stop returns the research session envelope', async () => {
  await ensureSeedTopic()
  await withServer(async (origin) => {
    const response = await testFetch(`${origin}/api/topics/${TOPIC_ID}/research-session/stop`, {
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
