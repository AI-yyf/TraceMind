import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

import { getTopicDefinition } from '../../topic-config'
import { prisma } from '../lib/prisma'
import {
  ensureConfiguredTopicMaterialized,
  ensureConfiguredTopicMaterializedForNode,
  pruneLegacySeedTopics,
  syncConfiguredTopicWorkflowSnapshot,
  __testing as topicConfigSyncTesting,
} from '../services/topics/topic-config-sync'
import { loadTopicStageConfig } from '../services/topics/topic-stage-config'

function createConfigRecord(key: string, value: string) {
  return {
    id: `system-config-${key}`,
    key,
    value,
    updatedAt: new Date(),
  }
}

test('configured topic sync parses configured topic ids from canonical node ids', () => {
  assert.equal(
    topicConfigSyncTesting.parseConfiguredTopicIdFromNodeId('autonomous-driving:stage-0:1604.07316'),
    'autonomous-driving',
  )
  assert.equal(topicConfigSyncTesting.parseConfiguredTopicIdFromNodeId('unknown-topic:stage-0:paper-1'), null)
})

test('configured topic sync ignores workflow-only nodes and papers for canonical-only topics', () => {
  const topicDefinition = getTopicDefinition('autonomous-driving')
  const topicMemory = {
    researchNodes: [
      {
        nodeId: 'autonomous-driving:stage-99:stale-paper',
        stageIndex: 99,
        paperIds: ['autonomous-driving-stale-paper'],
        primaryPaperId: 'autonomous-driving-stale-paper',
        paperId: 'autonomous-driving-stale-paper',
      },
    ],
    publishedMainlinePaperIds: ['1604.07316', 'autonomous-driving-stale-paper'],
    paperRelations: [
      {
        paperId: 'autonomous-driving-stale-paper',
        nodeId: 'autonomous-driving:stage-99:stale-paper',
      },
    ],
  }

  const collectedPaperIds = topicConfigSyncTesting.collectConfiguredTopicPaperIds(topicDefinition, topicMemory)
  const nodeSpecs = topicConfigSyncTesting.buildNodeSpecs({
    topicDefinition,
    topicMemory,
    paperCatalog: {
      '1604.07316': {
        title: 'Origin paper',
        summary: 'Origin summary',
      },
      'autonomous-driving-stale-paper': {
        title: 'Stale paper',
        summary: 'Stale summary',
      },
    },
    paperAssets: {},
  })

  assert.ok(!collectedPaperIds.includes('autonomous-driving-stale-paper'))
  assert.ok(
    nodeSpecs.some((node) => node.nodeId === 'autonomous-driving:stage-0:1604.07316'),
    'canonical origin node should still be present',
  )
  assert.ok(
    nodeSpecs.every((node) => !node.paperIds.includes('autonomous-driving-stale-paper')),
    'workflow-only papers should not survive canonical node synthesis',
  )
})

test('configured topic stage config falls back to the topic-defined preferred window', async () => {
  const configKey = 'topic-stage-config:v1:autonomous-driving'
  const existing = await prisma.system_configs.findUnique({
    where: { key: configKey },
  })

  try {
    await prisma.system_configs.deleteMany({
      where: { key: configKey },
    })

    const config = await loadTopicStageConfig('autonomous-driving')
    assert.equal(config.windowMonths, 3)
  } finally {
    if (existing) {
      await prisma.system_configs.upsert({
        where: { key: configKey },
        update: {
          value: existing.value,
          updatedAt: existing.updatedAt,
        },
        create: createConfigRecord(existing.key, existing.value),
      })
    } else {
      await prisma.system_configs.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('configured topic sync materializes autonomous-driving from topic config and workflow memory', async () => {
  const materialized = await ensureConfiguredTopicMaterialized('autonomous-driving')
  assert.equal(materialized, true)

  const topic = await prisma.topics.findUnique({
    where: { id: 'autonomous-driving' },
    include: {
      topic_stages: true,
      research_nodes: {
        include: {
          node_papers: {
            orderBy: { order: 'asc' },
          },
        },
      },
      papers: true,
    },
  })

  assert.ok(topic)
  assert.ok(topic.topic_stages.length >= 1)
  assert.ok(topic.papers.some((paper) => paper.id === '1604.07316'))
  assert.ok(topic.research_nodes.some((node) => node.id === 'autonomous-driving:stage-0:1604.07316'))
})

test('configured topic sync expands canonical-only autonomous-driving into branch and merge nodes', async () => {
  const materialized = await ensureConfiguredTopicMaterialized('autonomous-driving')
  assert.equal(materialized, true)

  const topic = await prisma.topics.findUnique({
    where: { id: 'autonomous-driving' },
    include: {
      topic_stages: {
        orderBy: { order: 'asc' },
      },
      research_nodes: {
        include: {
          node_papers: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: [{ stageIndex: 'asc' }, { createdAt: 'asc' }],
      },
      papers: {
        orderBy: { published: 'asc' },
      },
    },
  })

  assert.ok(topic)
  assert.ok((topic?.papers.length ?? 0) >= 4)
  assert.ok((topic?.research_nodes.length ?? 0) >= 4)
  assert.ok((topic?.topic_stages.length ?? 0) >= 3)
  assert.ok(topic?.research_nodes.some((node) => node.isMergeNode), 'expected a merge node for canonical autonomous-driving')
  assert.ok(
    topic?.research_nodes.some((node) => node.node_papers.length >= 3),
    'expected at least one multi-paper canonical node',
  )
  assert.equal(
    topic?.papers.find((paper) => paper.id === '1604.07316')?.title,
    'End to End Learning for Self-Driving Cars',
  )
  assert.equal(
    topic?.papers.find((paper) => paper.id === '1710.02410')?.title,
    'Conditional Imitation Learning for End-to-End Autonomous Driving',
  )
  assert.equal(
    topic?.papers.find((paper) => paper.id === '1912.12294')?.title,
    'Learning by Cheating',
  )
})

test('configured topic sync can materialize a topic by node id lookup', async () => {
  const materialized = await ensureConfiguredTopicMaterializedForNode(
    'autonomous-driving:stage-0:1604.07316',
  )

  assert.equal(materialized, true)

  const node = await prisma.research_nodes.findUnique({
    where: { id: 'autonomous-driving:stage-0:1604.07316' },
    include: {
      papers: true,
      node_papers: {
        include: {
          papers: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  assert.ok(node)
  assert.equal(node?.topicId, 'autonomous-driving')
  assert.equal(node?.papers?.id, '1604.07316')
  assert.ok((node?.node_papers.length ?? 0) >= 1)
})

test('configured topic sync removes stale stages, nodes, and topic-owned papers', async () => {
  const stalePaperId = 'autonomous-driving-stale-paper'
  const staleNodeId = 'autonomous-driving:stage-99:stale-paper'

  await ensureConfiguredTopicMaterialized('autonomous-driving')
  await prisma.research_nodes.deleteMany({ where: { id: staleNodeId } })
  await prisma.papers.deleteMany({ where: { id: stalePaperId } })
  await prisma.topic_stages.deleteMany({
    where: {
      topicId: 'autonomous-driving',
      order: 99,
    },
  })
  await prisma.topic_stages.create({
    data: {
      id: `${'autonomous-driving'}-stage-99`,
      topicId: 'autonomous-driving',
      order: 99,
      name: 'Stage 100',
      nameEn: 'Stage 100',
      description: 'stale stage',
      descriptionEn: 'stale stage',
    },
  })
  await prisma.papers.create({
    data: {
      id: stalePaperId,
      topicId: 'autonomous-driving',
      title: 'Stale paper',
      titleZh: 'Stale paper',
      titleEn: 'Stale paper',
      authors: JSON.stringify(['Test Author']),
      published: new Date('2026-01-01T00:00:00.000Z'),
      summary: 'Stale paper summary',
      explanation: 'Stale paper explanation',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })
  await prisma.research_nodes.create({
    data: {
      id: staleNodeId,
      topicId: 'autonomous-driving',
      stageIndex: 99,
      nodeLabel: 'Stale node',
      nodeSummary: 'Stale node summary',
      nodeExplanation: 'Stale node explanation',
      status: 'fallback',
      isMergeNode: false,
      provisional: false,
      primaryPaperId: stalePaperId,
      updatedAt: new Date(),
      node_papers: {
        create: {
          id: `${staleNodeId}:paper-1`,
          paperId: stalePaperId,
          order: 1,
        },
      },
    },
  })

  const materialized = await ensureConfiguredTopicMaterialized('autonomous-driving')
  assert.equal(materialized, true)

  const topic = await prisma.topics.findUnique({
    where: { id: 'autonomous-driving' },
    include: {
      topic_stages: {
        orderBy: { order: 'asc' },
      },
      research_nodes: {
        select: { id: true },
      },
      papers: {
        select: { id: true },
      },
    },
  })

  assert.ok(topic)
  assert.ok(topic?.topic_stages.every((stage) => stage.order !== 99))
  assert.equal(new Set(topic?.topic_stages.map((stage) => stage.order)).size, topic?.topic_stages.length)
  assert.ok(!topic?.research_nodes.some((node) => node.id === staleNodeId))
  assert.ok(!topic?.papers.some((paper) => paper.id === stalePaperId))
})

test('configured topic sync prunes legacy seeded topics and their artifacts', async () => {
  const legacyTopicId = 'topic-5'
  const legacyPaperId = `${legacyTopicId}-paper`
  const legacyNodeId = `${legacyTopicId}:stage-0:${legacyPaperId}`
  const legacyConfigKey = `alpha:topic-artifact:${legacyTopicId}:window-6`

  await prisma.topics.deleteMany({
    where: { id: legacyTopicId },
  })
  await prisma.system_configs.deleteMany({
    where: {
      OR: [
        { key: legacyConfigKey },
        { key: `topic:guidance-ledger:v1:${legacyTopicId}` },
        { key: `topic:session-memory:v1:${legacyTopicId}` },
        { key: `topic-research-world:v1:${legacyTopicId}` },
      ],
    },
  })

  await prisma.topics.create({
    data: {
      id: legacyTopicId,
      nameZh: 'Legacy Topic Five',
      nameEn: 'Legacy Topic Five',
      focusLabel: 'Legacy seeded topic',
      summary: 'Legacy seeded topic that should be pruned.',
      description: 'Legacy seeded topic that should be pruned.',
      language: 'en',
      status: 'active',
      updatedAt: new Date(),
    },
  })
  await prisma.topic_stages.create({
    data: {
      id: `${legacyTopicId}-stage-1`,
      topicId: legacyTopicId,
      order: 1,
      name: 'Legacy stage',
      description: 'Legacy stage',
    },
  })
  await prisma.papers.create({
    data: {
      id: legacyPaperId,
      topicId: legacyTopicId,
      title: 'Legacy paper',
      titleZh: 'Legacy paper',
      titleEn: 'Legacy paper',
      authors: JSON.stringify(['Legacy Author']),
      published: new Date('2026-01-05T00:00:00.000Z'),
      summary: 'Legacy paper summary',
      explanation: 'Legacy paper explanation',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })
  await prisma.research_nodes.create({
    data: {
      id: legacyNodeId,
      topicId: legacyTopicId,
      stageIndex: 0,
      nodeLabel: 'Legacy node',
      nodeSummary: 'Legacy node summary',
      nodeExplanation: 'Legacy node explanation',
      status: 'canonical',
      provisional: false,
      isMergeNode: false,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: `${legacyNodeId}:paper-1`,
      nodeId: legacyNodeId,
      paperId: legacyPaperId,
      order: 1,
    },
  })
  await prisma.topic_guidance_ledgers.create({
    data: {
      id: `${legacyTopicId}-guidance`,
      topicId: legacyTopicId,
      directives: '[]',
      updatedAt: new Date(),
    },
  })
  await prisma.topic_session_memories.create({
    data: {
      id: `${legacyTopicId}-session-memory`,
      topicId: legacyTopicId,
      events: '[]',
      summary: null,
      updatedAt: new Date(),
    },
  })
  await prisma.research_pipeline_states.create({
    data: {
      id: `${legacyTopicId}-pipeline`,
      topicId: legacyTopicId,
      state: '{}',
      updatedAt: new Date(),
    },
  })
  await prisma.research_world_snapshots.create({
    data: {
      id: `${legacyTopicId}-world`,
      topicId: legacyTopicId,
      world: '{}',
      fingerprint: null,
      updatedAt: new Date(),
    },
  })
  await prisma.system_configs.createMany({
    data: [
      createConfigRecord(legacyConfigKey, '{}'),
      createConfigRecord(`topic:guidance-ledger:v1:${legacyTopicId}`, '{}'),
      createConfigRecord(`topic:session-memory:v1:${legacyTopicId}`, '{}'),
      createConfigRecord(`topic-research-world:v1:${legacyTopicId}`, '{}'),
    ],
  })

  const deletedTopicIds = await pruneLegacySeedTopics([legacyTopicId])
  assert.deepEqual(deletedTopicIds, [legacyTopicId])

  const [topic, guidance, sessionMemory, pipelineState, worldSnapshot, configs] = await Promise.all([
    prisma.topics.findUnique({ where: { id: legacyTopicId } }),
    prisma.topic_guidance_ledgers.findUnique({ where: { topicId: legacyTopicId } }),
    prisma.topic_session_memories.findUnique({ where: { topicId: legacyTopicId } }),
    prisma.research_pipeline_states.findUnique({ where: { topicId: legacyTopicId } }),
    prisma.research_world_snapshots.findUnique({ where: { topicId: legacyTopicId } }),
    prisma.system_configs.findMany({
      where: {
        OR: [
          { key: legacyConfigKey },
          { key: `topic:guidance-ledger:v1:${legacyTopicId}` },
          { key: `topic:session-memory:v1:${legacyTopicId}` },
          { key: `topic-research-world:v1:${legacyTopicId}` },
        ],
      },
    }),
  ])

  assert.equal(topic, null)
  assert.equal(guidance, null)
  assert.equal(sessionMemory, null)
  assert.equal(pipelineState, null)
  assert.equal(worldSnapshot, null)
  assert.equal(configs.length, 0)
})

test('configured topic sync can write the live configured topic state back into workflow artifacts', async () => {
  const workflowNodeId = `autonomous-driving:stage-3:workflow-sync-${Date.now()}`
  const workflowPaperId = `autonomous-driving-workflow-sync-${Date.now()}`
  const repoRoot = path.resolve(__dirname, '../../..')
  const topicMemoryPath = path.join(repoRoot, 'generated-data', 'app-data', 'workflow', 'topic-memory.json')
  const paperCatalogPath = path.join(repoRoot, 'generated-data', 'app-data', 'paper-catalog.json')

  await ensureConfiguredTopicMaterialized('autonomous-driving')
  await prisma.papers.create({
    data: {
      id: workflowPaperId,
      topicId: 'autonomous-driving',
      title: 'Workflow sync paper',
      titleZh: 'Workflow sync paper',
      titleEn: 'Workflow sync paper',
      authors: JSON.stringify(['Test Author']),
      published: new Date('2017-02-01T00:00:00.000Z'),
      summary: 'Workflow sync paper summary',
      explanation: 'Workflow sync paper explanation',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'published',
      contentMode: 'editorial',
      updatedAt: new Date(),
    },
  })
  await prisma.research_nodes.create({
    data: {
      id: workflowNodeId,
      topicId: 'autonomous-driving',
      stageIndex: 3,
      nodeLabel: 'Workflow sync node',
      nodeSummary: 'Workflow sync node summary',
      nodeExplanation: 'Workflow sync node explanation',
      status: 'active',
      isMergeNode: false,
      provisional: false,
      primaryPaperId: workflowPaperId,
      updatedAt: new Date(),
      node_papers: {
        create: {
          id: `${workflowNodeId}:paper-1`,
          paperId: workflowPaperId,
          order: 1,
        },
      },
    },
  })

  try {
    const synced = await syncConfiguredTopicWorkflowSnapshot('autonomous-driving')
    assert.equal(synced, true)

    const topicMemory = JSON.parse(fs.readFileSync(topicMemoryPath, 'utf8')) as Record<string, any>
    const paperCatalog = JSON.parse(fs.readFileSync(paperCatalogPath, 'utf8')) as Record<string, any>

    assert.ok(
      Array.isArray(topicMemory['autonomous-driving']?.researchNodes) &&
        topicMemory['autonomous-driving'].researchNodes.some(
          (node: Record<string, unknown>) => node.nodeId === workflowNodeId,
        ),
    )
    assert.equal(paperCatalog[workflowPaperId]?.title, 'Workflow sync paper')
  } finally {
    await prisma.node_papers.deleteMany({
      where: { nodeId: workflowNodeId },
    })
    await prisma.research_nodes.deleteMany({
      where: { id: workflowNodeId },
    })
    await prisma.papers.deleteMany({
      where: { id: workflowPaperId },
    })
    await syncConfiguredTopicWorkflowSnapshot('autonomous-driving')
  }
})
