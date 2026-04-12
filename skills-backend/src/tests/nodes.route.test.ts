import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
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

test('POST /api/nodes serializes object fullContent payloads instead of rejecting them', async () => {
  let topicId: string | null = null
  let createdNodeId: string | null = null
  const createdPaperIds: string[] = []

  try {
    const topic = await prisma.topics.create({
      data: {
        id: crypto.randomUUID(),
        nameZh: 'Nodes Route Test Topic',
        nameEn: 'Nodes Route Test Topic',
        language: 'zh',
        status: 'active',
        updatedAt: new Date(),
      },
    })
    topicId = topic.id

    const paper = await prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: 'Nodes Route Paper',
        titleZh: 'Nodes Route Paper',
        titleEn: 'Nodes Route Paper',
        authors: JSON.stringify(['TraceMind Test']),
        published: new Date('2025-01-02T00:00:00.000Z'),
        summary: 'Temporary paper for route coverage.',
        explanation: 'Temporary paper for route coverage.',
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(['route-test']),
        status: 'candidate',
        updatedAt: new Date(),
      },
    })
    createdPaperIds.push(paper.id)

    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: topic.id,
          stageIndex: 1,
          nodeLabel: 'Route coverage node',
          nodeSubtitle: 'Route subtitle',
          nodeSummary: 'Route summary',
          nodeExplanation: 'Route explanation',
          nodeCoverImage: null,
          paperIds: [paper.id],
          primaryPaperId: paper.id,
          isMergeNode: false,
          fullContent: {
            sections: [{ heading: 'Method', paragraphs: ['Structured object content.'] }],
          },
        }),
      })

      const payload = (await response.json()) as {
        success?: boolean
        data?: { id: string; fullContent: string | null }
        error?: string
      }

      assert.equal(response.status, 201)
      assert.equal(payload.success, true)
      assert.equal(typeof payload.data?.id, 'string')
      assert.equal(
        payload.data?.fullContent,
        JSON.stringify({
          sections: [{ heading: 'Method', paragraphs: ['Structured object content.'] }],
        }),
      )

      createdNodeId = payload.data?.id ?? null
    })
  } finally {
    if (createdNodeId) {
      await prisma.research_nodes.deleteMany({
        where: { id: createdNodeId },
      })
    }

    if (createdPaperIds.length > 0) {
      await prisma.papers.deleteMany({
        where: { id: { in: createdPaperIds } },
      })
    }

    if (topicId) {
      await prisma.topics.deleteMany({
        where: { id: topicId },
      })
    }
  }
})
