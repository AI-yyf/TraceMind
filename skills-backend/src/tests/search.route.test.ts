import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { createApp } from '../server'

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
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('GET /api/search returns 400 when topic scope is missing topicId', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/search?q=transformer&scope=topic`)
    assert.equal(response.status, 400)

    const payload = (await response.json()) as { error?: string }
    assert.match(payload.error ?? '', /topicId/u)
  })
})

test('GET /api/search returns grouped payload in global scope', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/search?q=transformer&scope=global&limit=5`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        query: string
        scope: string
        groups: unknown[]
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.query, 'transformer')
    assert.equal(payload.data.scope, 'global')
    assert.ok(Array.isArray(payload.data.groups))
  })
})

test('GET /api/search includes topic titles for topic-linked results', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: 'GAIA 搜索主题',
      nameEn: 'GAIA Search Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: topic.id,
      title: 'GAIA driving foundation model',
      titleZh: 'GAIA 驾驶基础模型',
      titleEn: 'GAIA driving foundation model',
      authors: JSON.stringify(['GAIA Author']),
      published: new Date('2026-02-01T00:00:00.000Z'),
      summary: 'A paper created to validate topic-linked search labels.',
      explanation: 'The search result should retain the parent topic title.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['gaia', 'search']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/search?q=GAIA&scope=global&limit=20`)
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          facets?: {
            topics?: Array<{ value: string; label: string; count: number }>
          }
          groups: Array<{
            items: Array<{
              kind: string
              topicId?: string
              topicTitle?: string
            }>
          }>
        }
      }

      const items = payload.data.groups.flatMap((group) => group.items)
      const linkedItem = items.find((item) => item.kind === 'paper' && item.topicId === topic.id)

      assert.ok(linkedItem, 'expected at least one topic-linked search result')
      assert.equal(linkedItem?.topicTitle, 'GAIA 搜索主题')
      assert.ok((payload.data.facets?.topics ?? []).some((facet) => facet.value === topic.id))
    })
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('GET /api/search exposes stage and node location details for paper results', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: 'GAIA 节点定位主题',
      nameEn: 'GAIA Node Search Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: topic.id,
      title: 'GAIA node grounding paper',
      titleZh: 'GAIA 节点定位论文',
      titleEn: 'GAIA node grounding paper',
      authors: JSON.stringify(['GAIA Locator']),
      published: new Date('2026-03-09T00:00:00.000Z'),
      summary: 'A paper created to validate node-linked paper search metadata.',
      explanation: 'The paper should report both its stage label and node location.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['gaia', 'node']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: createTestId('search-node'),
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: 'GAIA 节点',
      nodeSubtitle: 'GAIA node',
      nodeSummary: 'Node summary',
      nodeExplanation: 'Node explanation',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: createTestId('search-node-paper'),
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/search?q=GAIA&scope=global&limit=20&stageMonths=3`)
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          groups: Array<{
            items: Array<{
              kind: string
              stageLabel?: string
              nodeTitle?: string
              locationLabel?: string
              relatedNodes?: Array<{ nodeId: string; title: string }>
            }>
          }>
        }
      }

      const items = payload.data.groups.flatMap((group) => group.items)
      const paperItem = items.find((item) => item.kind === 'paper' && item.nodeTitle === 'GAIA 节点')

      assert.ok(paperItem, 'expected at least one paper result with node location metadata')
      assert.equal(typeof paperItem?.stageLabel, 'string')
      assert.equal(typeof paperItem?.locationLabel, 'string')
      assert.ok((paperItem?.relatedNodes ?? []).length > 0)
    })
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('GET /api/search matches paper locations by author names and arXiv identifiers', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: '搜索定位主题',
      nameEn: 'Search Location Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: topic.id,
      title: 'Grounded Search Retrieval',
      titleZh: '定位搜索检索',
      titleEn: 'Grounded Search Retrieval',
      authors: JSON.stringify(['Ada Search', 'Lin Query']),
      published: new Date('2026-02-03T00:00:00.000Z'),
      summary: 'A paper created for testing search by author names and source identifiers.',
      explanation: 'The paper should be discoverable by both its author list and arXiv identifier.',
      arxivUrl: 'https://arxiv.org/abs/2602.12345',
      pdfUrl: 'https://arxiv.org/pdf/2602.12345.pdf',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['retrieval', 'search']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: createTestId('search-node'),
      topicId: topic.id,
      stageIndex: 4,
      nodeLabel: '定位搜索节点',
      nodeSubtitle: 'Grounded search node',
      nodeSummary: '用于验证搜索结果能落到具体的 stage 和 node。',
      nodeExplanation: 'Author and arXiv-id searches should both lead back to this node context.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: createTestId('search-node-paper'),
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    await withServer(async (origin) => {
      const byAuthorResponse = await fetch(
        `${origin}/api/search?q=${encodeURIComponent('Ada Search')}&scope=global&limit=10`,
      )
      assert.equal(byAuthorResponse.status, 200)

      const byAuthorPayload = (await byAuthorResponse.json()) as {
        success: boolean
        data: {
          groups: Array<{
            items: Array<{
              id: string
              kind: string
              nodeTitle?: string
              locationLabel?: string
            }>
          }>
        }
      }

      const byAuthorItems = byAuthorPayload.data.groups.flatMap((group) => group.items)
      const authorHit = byAuthorItems.find((item) => item.id === paper.id && item.kind === 'paper')

      assert.ok(authorHit, 'expected the paper to match by author name')
      assert.equal(authorHit?.nodeTitle, '定位搜索节点')
      assert.match(authorHit?.locationLabel ?? '', /定位搜索节点/u)

      const bySourceResponse = await fetch(
        `${origin}/api/search?q=${encodeURIComponent('2602.12345')}&scope=global&limit=10`,
      )
      assert.equal(bySourceResponse.status, 200)

      const bySourcePayload = (await bySourceResponse.json()) as {
        success: boolean
        data: {
          groups: Array<{
            items: Array<{
              id: string
              kind: string
              matchedFields?: string[]
              locationLabel?: string
            }>
          }>
        }
      }

      const bySourceItems = bySourcePayload.data.groups.flatMap((group) => group.items)
      const sourceHit = bySourceItems.find((item) => item.id === paper.id && item.kind === 'paper')

      assert.ok(sourceHit, 'expected the paper to match by arXiv identifier')
      assert.ok((sourceHit?.matchedFields ?? []).includes('source'))
      assert.match(sourceHit?.locationLabel ?? '', /定位搜索节点/u)
    })
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('GET /api/search exposes stage facets and filters topic results by selected stages', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: '搜索分期主题',
      nameEn: 'Search Stage Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const januaryPaper = await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: topic.id,
      title: 'Stage filter alpha paper',
      titleZh: '阶段筛选论文 Alpha',
      titleEn: 'Stage filter alpha paper',
      authors: JSON.stringify(['Stage Alpha']),
      published: new Date('2026-01-12T00:00:00.000Z'),
      summary: 'A January paper for search stage filtering.',
      explanation: 'Should appear in the January stage facet.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['stage-filter', 'alpha']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const marchPaper = await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: topic.id,
      title: 'Stage filter beta paper',
      titleZh: '阶段筛选论文 Beta',
      titleEn: 'Stage filter beta paper',
      authors: JSON.stringify(['Stage Beta']),
      published: new Date('2026-03-08T00:00:00.000Z'),
      summary: 'A March paper for search stage filtering.',
      explanation: 'Should appear in the March stage facet.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['stage-filter', 'beta']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const januaryNode = await prisma.research_nodes.create({
    data: {
      id: createTestId('search-node'),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: 'Alpha stage node',
      nodeSubtitle: 'January stage',
      nodeSummary: 'Alpha node summary',
      nodeExplanation: 'Stage-filter search should find this January node.',
      primaryPaperId: januaryPaper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  const marchNode = await prisma.research_nodes.create({
    data: {
      id: createTestId('search-node'),
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: 'Beta stage node',
      nodeSubtitle: 'March stage',
      nodeSummary: 'Beta node summary',
      nodeExplanation: 'Stage-filter search should find this March node.',
      primaryPaperId: marchPaper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.createMany({
    data: [
      {
        id: createTestId('search-node-paper'),
        nodeId: januaryNode.id,
        paperId: januaryPaper.id,
        order: 1,
      },
      {
        id: createTestId('search-node-paper'),
        nodeId: marchNode.id,
        paperId: marchPaper.id,
        order: 1,
      },
    ],
  })

  try {
    await withServer(async (origin) => {
      const baseQuery =
        `${origin}/api/search?q=${encodeURIComponent('stage filter')}` +
        `&scope=topic&topicId=${topic.id}&types=node,paper&stageMonths=1&limit=20`

      const allResponse = await fetch(baseQuery)
      assert.equal(allResponse.status, 200)

      const allPayload = (await allResponse.json()) as {
        success: boolean
        data: {
          facets?: {
            stages?: Array<{ label: string; count: number }>
          }
        }
      }

      const stageLabels = (allPayload.data.facets?.stages ?? []).map((facet) => facet.label)
      assert.ok(stageLabels.includes('2026.01'))
      assert.ok(stageLabels.includes('2026.03'))

      const januaryResponse = await fetch(
        `${baseQuery}&stages=${encodeURIComponent('2026.01')}`,
      )
      assert.equal(januaryResponse.status, 200)

      const januaryPayload = (await januaryResponse.json()) as {
        success: boolean
        data: {
          groups: Array<{
            items: Array<{
              stageLabel?: string
              relatedNodes?: Array<{ stageLabel?: string }>
            }>
          }>
          facets?: {
            stages?: Array<{ label: string; count: number }>
          }
        }
      }

      const januaryItems = januaryPayload.data.groups.flatMap((group) => group.items)
      assert.ok(januaryItems.length > 0, 'expected January-filtered search results')
      assert.ok(
        januaryItems.every((item) =>
          item.stageLabel === '2026.01' ||
          (item.relatedNodes ?? []).some((location) => location.stageLabel === '2026.01'),
        ),
      )
      assert.ok(
        (januaryPayload.data.facets?.stages ?? []).some((facet) => facet.label === '2026.03'),
        'expected stage facets to remain visible after filtering',
      )
    })
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('GET /api/search uses node chronology from linked papers instead of node updatedAt', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: '节点时间主题',
      nameEn: 'Node Chronology Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: topic.id,
      title: 'Node chronology seed paper',
      titleZh: '节点时间种子论文',
      titleEn: 'Node chronology seed paper',
      authors: JSON.stringify(['Chronology Author']),
      published: new Date('2024-08-15T00:00:00.000Z'),
      summary: 'A paper used to verify node search time metadata.',
      explanation: 'Node search results should reflect the earliest linked paper date, not a later rebuild date.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['node-chronology']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: createTestId('search-node'),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: 'Chronology node',
      nodeSubtitle: 'Chronology subtitle',
      nodeSummary: 'Chronology summary',
      nodeExplanation: 'Chronology explanation',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      createdAt: new Date('2024-08-20T00:00:00.000Z'),
      updatedAt: new Date('2026-04-07T00:00:00.000Z'),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: createTestId('search-node-paper'),
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(
        `${origin}/api/search?q=${encodeURIComponent('Chronology node')}&scope=topic&topicId=${topic.id}&types=node&stageMonths=1&limit=10`,
      )
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: {
          groups: Array<{
            items: Array<{
              id: string
              kind: string
              publishedAt?: string
              timeLabel?: string
              stageLabel?: string
            }>
          }>
        }
      }

      const items = payload.data.groups.flatMap((group) => group.items)
      const nodeHit = items.find((item) => item.id === node.id && item.kind === 'node')

      assert.ok(nodeHit, 'expected the node to appear in search results')
      assert.match(nodeHit?.publishedAt ?? '', /^2024-08-15T/u)
      assert.equal(nodeHit?.timeLabel, '08.15')
      assert.equal(nodeHit?.stageLabel, '2024.08')
    })
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('GET /api/search filters global results by selected topic ids while preserving topic facets', async () => {
  const alphaTopic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: '全局搜索主题甲',
      nameEn: 'Global Search Topic Alpha',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const betaTopic = await prisma.topics.create({
    data: {
      id: createTestId('search-topic'),
      nameZh: '全局搜索主题乙',
      nameEn: 'Global Search Topic Beta',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: alphaTopic.id,
      title: 'Global topic filter alpha',
      titleZh: '全局主题筛选 Alpha',
      titleEn: 'Global topic filter alpha',
      authors: JSON.stringify(['Topic Alpha']),
      published: new Date('2026-01-03T00:00:00.000Z'),
      summary: 'Alpha paper for global topic filters.',
      explanation: 'Should remain after filtering to alpha topic.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['global-topic-filter']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  await prisma.papers.create({
    data: {
      id: createTestId('search-paper'),
      topicId: betaTopic.id,
      title: 'Global topic filter beta',
      titleZh: '全局主题筛选 Beta',
      titleEn: 'Global topic filter beta',
      authors: JSON.stringify(['Topic Beta']),
      published: new Date('2026-02-14T00:00:00.000Z'),
      summary: 'Beta paper for global topic filters.',
      explanation: 'Should disappear after filtering to alpha topic.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['global-topic-filter']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  try {
    await withServer(async (origin) => {
      const baseQuery =
        `${origin}/api/search?q=${encodeURIComponent('global topic filter')}` +
        '&scope=global&types=paper&limit=20'

      const allResponse = await fetch(baseQuery)
      assert.equal(allResponse.status, 200)

      const allPayload = (await allResponse.json()) as {
        success: boolean
        data: {
          facets?: {
            topics?: Array<{ value: string; label: string }>
          }
        }
      }

      const topicFacetValues = (allPayload.data.facets?.topics ?? []).map((facet) => facet.value)
      assert.ok(topicFacetValues.includes(alphaTopic.id))
      assert.ok(topicFacetValues.includes(betaTopic.id))

      const filteredResponse = await fetch(
        `${baseQuery}&topics=${encodeURIComponent(alphaTopic.id)}`,
      )
      assert.equal(filteredResponse.status, 200)

      const filteredPayload = (await filteredResponse.json()) as {
        success: boolean
        data: {
          groups: Array<{
            items: Array<{
              topicId?: string
            }>
          }>
          facets?: {
            topics?: Array<{ value: string }>
          }
        }
      }

      const filteredItems = filteredPayload.data.groups.flatMap((group) => group.items)
      assert.ok(filteredItems.length > 0, 'expected topic-filtered global results')
      assert.ok(filteredItems.every((item) => item.topicId === alphaTopic.id))
      assert.ok(
        (filteredPayload.data.facets?.topics ?? []).some((facet) => facet.value === betaTopic.id),
        'expected non-selected topic facet to remain visible after filtering',
      )
    })
  } finally {
    await prisma.topics.deleteMany({
      where: {
        id: {
          in: [alphaTopic.id, betaTopic.id],
        },
      },
    })
  }
})
