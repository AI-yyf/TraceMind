import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { createApp } from '../server'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'

function createTestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
    for (const task of enhancedTaskScheduler.getAllTasks()) {
      enhancedTaskScheduler.removeTask(task.id)
    }

    await new Promise<void>((resolve, reject) => {
      server.closeAllConnections?.()
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('GET /api/topics/:id/view-model hides pending-only stage buckets from reader-visible stages while preserving unmapped papers', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('topic-view-topic'),
      nameZh: 'Reader Visible Stage Filter Topic',
      nameEn: 'Reader Visible Stage Filter Topic',
      focusLabel: 'Keep only mapped stages in the reader map',
      summary: 'A topic used to ensure pending-only time buckets stay out of reader-visible stages.',
      description:
        'A topic used to ensure pending-only time buckets stay out of reader-visible stages.',
      language: 'en',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const mappedPaper = await prisma.papers.create({
    data: {
      id: createTestId('topic-view-paper'),
      topicId: topic.id,
      title: 'Mapped January Paper',
      titleZh: 'Mapped January Paper',
      titleEn: 'Mapped January Paper',
      authors: JSON.stringify(['Author One']),
      published: new Date('2025-01-10T00:00:00.000Z'),
      summary: 'This paper is mapped into the reader-visible node graph.',
      explanation: 'This paper is mapped into the reader-visible node graph.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['world model']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const pendingPaper = await prisma.papers.create({
    data: {
      id: createTestId('topic-view-paper'),
      topicId: topic.id,
      title: 'Pending March Paper',
      titleZh: 'Pending March Paper',
      titleEn: 'Pending March Paper',
      authors: JSON.stringify(['Author Two']),
      published: new Date('2025-03-11T00:00:00.000Z'),
      summary: 'This paper is still tracked but has not been grouped into a node.',
      explanation: 'This paper is still tracked but has not been grouped into a node.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['planning']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: createTestId('topic-view-node'),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: 'Mapped January Node',
      nodeSubtitle: 'Mapped January Node',
      nodeSummary: 'The January paper forms a readable stage with a visible node.',
      nodeExplanation: 'The January paper forms a readable stage with a visible node.',
      primaryPaperId: mappedPaper.id,
      status: 'canonical',
      provisional: false,
      isMergeNode: false,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: createTestId('topic-view-node-paper'),
      nodeId: node.id,
      paperId: mappedPaper.id,
      order: 0,
    },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/topics/${topic.id}/view-model?stageMonths=1`)
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          stages: Array<{
            stageIndex: number
            trackedPaperCount: number
            nodes: Array<{ nodeId: string }>
          }>
          timeline: {
            stages: Array<{
              stageIndex: number
              dateLabel: string
              timeLabel: string
            }>
          }
          graph: {
            nodes: Array<{
              nodeId: string
              stageIndex: number
            }>
          }
          unmappedPapers: Array<{
            paperId: string
            stageIndex: number | null
            stageLabel: string
          }>
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.stages.length, 1)
      assert.equal(payload.data.timeline.stages.length, 1)
      assert.equal(payload.data.graph.nodes.length, 1)
      assert.equal(payload.data.stages[0]?.nodes.length, 1)
      assert.equal(payload.data.stages[0]?.trackedPaperCount, 1)
      assert.equal(payload.data.stages[0]?.stageIndex, 1)
      assert.equal(payload.data.timeline.stages[0]?.stageIndex, 1)
      assert.equal(payload.data.timeline.stages[0]?.dateLabel, '2025.01')
      assert.equal(payload.data.timeline.stages[0]?.timeLabel, '2025.01')
      assert.equal(payload.data.timeline.stages.some((stage) => stage.dateLabel === '2025.03'), false)
      assert.equal(
        payload.data.stages.some((stage) => stage.nodes.length === 0 || stage.trackedPaperCount === 0),
        false,
      )
      assert.equal(
        payload.data.graph.nodes.every((graphNode) => graphNode.nodeId === node.id && graphNode.stageIndex === 1),
        true,
      )
      assert.deepEqual(
        payload.data.unmappedPapers.map((paper) => ({
          paperId: paper.paperId,
          stageIndex: paper.stageIndex,
          stageLabel: paper.stageLabel,
        })),
        [
          {
            paperId: pendingPaper.id,
            stageIndex: 2,
            stageLabel: '2025.03',
          },
        ],
      )
    })
  } finally {
    await prisma.system_configs.deleteMany({
      where: {
        OR: [
          { key: { startsWith: `alpha:topic-artifact:${topic.id}` } },
          { key: { startsWith: `alpha:reader-artifact:node:${node.id}` } },
          { key: { startsWith: `alpha:reader-artifact:paper:${mappedPaper.id}` } },
          { key: { startsWith: `alpha:reader-artifact:paper:${pendingPaper.id}` } },
          { key: { startsWith: `topic-stage-config:v1:${topic.id}` } },
        ],
      },
    })
    await prisma.node_papers.deleteMany({
      where: { nodeId: node.id },
    })
    await prisma.research_nodes.deleteMany({
      where: { topicId: topic.id },
    })
    await prisma.papers.deleteMany({
      where: { topicId: topic.id },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})
