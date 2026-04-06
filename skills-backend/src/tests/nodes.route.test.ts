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

test('POST /api/nodes accepts omitted object fullContent by serializing or skipping it', async () => {
  await withServer(async (origin) => {
    const topic = await prisma.topic.findUnique({
      where: { id: 'topic-1' },
    })
    const papers = await prisma.paper.findMany({
      where: { topicId: 'topic-1' },
      orderBy: { published: 'desc' },
      take: 2,
      select: { id: true },
    })

    assert.ok(topic, 'expected seeded topic-1 to exist')
    assert.ok(papers.length >= 2, 'expected at least two papers for node creation smoke')

    const response = await fetch(`${origin}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicId: topic.id,
        stageIndex: 99,
        nodeLabel: 'route-test-multi-paper-node',
        nodeSubtitle: 'temporary route coverage node',
        nodeSummary: 'temporary route coverage summary',
        nodeExplanation: 'temporary route coverage explanation',
        paperIds: papers.map((paper) => paper.id),
        primaryPaperId: papers[0]?.id,
        isMergeNode: true,
      }),
    })

    const payload = (await response.json()) as {
      success?: boolean
      data?: { id: string; fullContent: string | null }
      error?: string
    }

    if (payload.data?.id) {
      await prisma.researchNode.delete({
        where: { id: payload.data.id },
      })
    }

    assert.equal(response.status, 201)
    assert.equal(payload.success, true)
    assert.equal(typeof payload.data?.id, 'string')
  })
})
