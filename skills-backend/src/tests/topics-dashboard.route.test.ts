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

test('GET /api/topics/:id/dashboard returns mapped and pending literature counts on the same stage window', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('topics-dashboard-topic'),
      nameZh: 'Dashboard Validation Topic',
      nameEn: 'Dashboard Validation Topic',
      focusLabel: 'Broad literature coverage',
      summary: 'A topic used to validate mapped versus pending dashboard counts.',
      description: 'A topic used to validate mapped versus pending dashboard counts.',
      language: 'en',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const mappedPaper = await prisma.papers.create({
    data: {
      id: createTestId('topics-dashboard-paper'),
      topicId: topic.id,
      title: 'Mapped Paper',
      titleZh: 'Mapped Paper',
      titleEn: 'Mapped Paper',
      authors: JSON.stringify(['Author One']),
      published: new Date('2025-01-10T00:00:00.000Z'),
      summary: 'This paper is already placed into a node.',
      explanation: 'Placed into a problem node.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['VLA', 'world model']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  await prisma.papers.create({
    data: {
      id: createTestId('topics-dashboard-paper'),
      topicId: topic.id,
      title: 'Pending Paper',
      titleZh: 'Pending Paper',
      titleEn: 'Pending Paper',
      authors: JSON.stringify(['Author Two']),
      published: new Date('2025-04-10T00:00:00.000Z'),
      summary: 'This paper is tracked but not yet grouped into a node.',
      explanation: 'Awaiting node placement.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['VLA', 'planning']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: createTestId('topics-dashboard-node'),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: 'Mapped node',
      nodeSubtitle: 'Mapped node',
      nodeSummary: 'A node built from the mapped paper.',
      nodeExplanation: 'A node built from the mapped paper.',
      primaryPaperId: mappedPaper.id,
      status: 'provisional',
      provisional: false,
      isMergeNode: false,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: createTestId('topics-dashboard-node-paper'),
      nodeId: node.id,
      paperId: mappedPaper.id,
      order: 0,
    },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/topics/${topic.id}/dashboard?stageMonths=3`)
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          topicId: string
          topicTitle: string
          stats: {
            totalPapers: number
            mappedPapers: number
            pendingPapers: number
            totalNodes: number
            totalStages: number
            mappedStages: number
          }
          researchThreads: Array<{
            stageIndex: number
            nodeId: string
            paperCount: number
          }>
          pendingPapers: Array<{
            paperId: string
            stageIndex: number | null
            stageLabel: string
            route: string
          }>
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.topicId, topic.id)
      assert.equal(typeof payload.data.topicTitle, 'string')
      assert.equal(payload.data.stats.totalPapers, 2)
      assert.equal(payload.data.stats.mappedPapers, 1)
      assert.equal(payload.data.stats.pendingPapers, 1)
      assert.ok(payload.data.stats.totalStages >= payload.data.stats.mappedStages)
      assert.ok(Array.isArray(payload.data.researchThreads))
      assert.ok(Array.isArray(payload.data.pendingPapers))

      for (const thread of payload.data.researchThreads) {
        assert.equal(typeof thread.stageIndex, 'number')
        assert.equal(typeof thread.nodeId, 'string')
        assert.ok(thread.paperCount >= 1)
      }

      for (const paper of payload.data.pendingPapers) {
        assert.equal(typeof paper.paperId, 'string')
        assert.equal(typeof paper.route, 'string')
        assert.equal(typeof paper.stageLabel, 'string')
      }
    })
  } finally {
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
