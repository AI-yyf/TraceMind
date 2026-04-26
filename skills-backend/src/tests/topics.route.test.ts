import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'
import test from 'node:test'

import { loadTopicDefinitions } from '../../topic-config'
import { prisma } from '../lib/prisma'
import { createApp } from '../server'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import {
  ensureConfiguredTopicMaterialized,
  pruneLegacySeedTopics,
} from '../services/topics/topic-config-sync'
import { loadGlobalResearchConfig } from '../services/topics/topic-research-config'
import {
  assertNodeViewModelContract,
  assertTopicResearchBriefContract,
  assertTopicViewModelContract,
} from '../services/topics/topic-contracts'
import { refreshTopicViewModelSnapshot } from '../services/topics/alpha-topic'
import { rebuildNodeViewModel } from '../services/topics/alpha-reader'

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

test('PATCH /api/topics/research-config persists long-horizon research defaults to system config storage', async () => {
  const configKey = 'topic-research-config:v1:global'
  const originalRecord = await prisma.system_configs.findUnique({
    where: { key: configKey },
  })
  const payload = {
    maxCandidatesPerStage: 200,
    discoveryQueryLimit: 500,
    maxPapersPerNode: 20,
    minPapersPerNode: 10,
    targetCandidatesBeforeAdmission: 150,
    admissionThreshold: 0.45,
    highConfidenceThreshold: 0.75,
    semanticScholarLimit: 100,
    discoveryRounds: 10,
  }

  try {
    await withServer(async (origin) => {
      const updateResponse = await fetch(`${origin}/api/topics/research-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      assert.equal(updateResponse.status, 200)
      const updatePayload = (await updateResponse.json()) as typeof payload
      assert.deepEqual(updatePayload, payload)

      const getResponse = await fetch(`${origin}/api/topics/research-config`)
      assert.equal(getResponse.status, 200)
      const getPayload = (await getResponse.json()) as typeof payload
      assert.deepEqual(getPayload, payload)
    })

    const persisted = await loadGlobalResearchConfig()
    assert.equal(persisted.maxCandidatesPerStage, payload.maxCandidatesPerStage)
    assert.equal(persisted.discoveryQueryLimit, payload.discoveryQueryLimit)
    assert.equal(persisted.maxPapersPerNode, payload.maxPapersPerNode)
    assert.equal(persisted.minPapersPerNode, payload.minPapersPerNode)
    assert.equal(
      persisted.targetCandidatesBeforeAdmission,
      payload.targetCandidatesBeforeAdmission,
    )
    assert.equal(persisted.admissionThreshold, payload.admissionThreshold)
    assert.equal(persisted.highConfidenceThreshold, payload.highConfidenceThreshold)
    assert.equal(persisted.semanticScholarLimit, payload.semanticScholarLimit)
    assert.equal(persisted.discoveryRounds, payload.discoveryRounds)
  } finally {
    if (originalRecord) {
      await prisma.system_configs.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value, updatedAt: originalRecord.updatedAt },
        create: {
          id: crypto.randomUUID(),
          key: configKey,
          value: originalRecord.value,
          updatedAt: originalRecord.updatedAt,
        },
      })
    } else {
      await prisma.system_configs.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('GET /api/topics excludes legacy seeded topics after canonical backend cleanup', async () => {
  const legacyTopicId = 'topic-5'
  const canonicalTopicIds = loadTopicDefinitions().map((topic) => topic.id).sort()

  await pruneLegacySeedTopics([legacyTopicId])

  try {
    await prisma.topics.create({
      data: {
        id: legacyTopicId,
        nameZh: 'Legacy Topic Five',
        nameEn: 'Legacy Topic Five',
        focusLabel: 'Legacy seeded topic',
        summary: 'Legacy seeded topic that should not appear in /api/topics.',
        description: 'Legacy seeded topic that should not appear in /api/topics.',
        language: 'en',
        status: 'active',
        updatedAt: new Date(),
      },
    })

    for (const topicId of canonicalTopicIds) {
      await ensureConfiguredTopicMaterialized(topicId)
    }
    await pruneLegacySeedTopics([legacyTopicId])

    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/topics`)
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: Array<{
          id: string
        }>
      }

      assert.equal(payload.success, true)

      const responseIds = payload.data.map((topic) => topic.id)
      const relevantIds = responseIds
        .filter((topicId) => canonicalTopicIds.includes(topicId) || topicId === legacyTopicId)
        .sort()

      assert.equal(responseIds.includes(legacyTopicId), false)
      assert.deepEqual(relevantIds, canonicalTopicIds)
    })
  } finally {
    await pruneLegacySeedTopics([legacyTopicId])
  }
})

test('GET /api/topics/:topicId/view-model returns a contract-valid canonical graph for autonomous-driving', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')
  await refreshTopicViewModelSnapshot('autonomous-driving', { mode: 'quick', stageWindowMonths: 3 })

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/autonomous-driving/view-model?stageMonths=3`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: unknown
    }

    assert.equal(payload.success, true)
    assertTopicViewModelContract(payload.data)

    const viewModel = payload.data as any
    assert.ok(viewModel.graph.nodes.length >= 4)
    assert.ok(viewModel.timeline.stages.length >= 3)
    assert.ok(viewModel.graph.nodes.some((node: any) => node.paperIds.includes('1710.02410')))
    assert.ok(viewModel.graph.nodes.some((node: any) => node.isMergeNode === true))
    const mergeStageNode = viewModel.stages
      .flatMap((stage: any) => stage.nodes as any[])
      .find((node: any) => node.nodeId === 'autonomous-driving:stage-2:1912.12294')
    assert.ok(mergeStageNode)
    assert.equal(mergeStageNode.primaryPaperId, '1912.12294')
    assert.equal(
      mergeStageNode.paperIds.includes('1912.12294'),
      true,
    )
    const serialized = JSON.stringify(viewModel)
    assert.equal(serialized.includes('images\\\\'), false)
    assert.equal(serialized.includes('/paper/'), false)
    const mergeGraphNode = viewModel.graph.nodes.find((node: any) => node.primaryPaperId === '1912.12294')
    assert.equal(mergeGraphNode?.coverImage?.startsWith('/uploads/1912.12294/images/'), true)
    const originGraphNode = viewModel.graph.nodes.find((node: any) => node.primaryPaperId === '1604.07316')
    assert.equal(originGraphNode?.coverImage, '/papers/1604.07316/cnn-architecture.png')
  })
})

test('GET /api/nodes/:nodeId/view-model returns a contract-valid canonical merge node for autonomous-driving', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')

  await withServer(async (origin) => {
    const nodeId = 'autonomous-driving:stage-2:1912.12294'
    const response = await fetch(
      `${origin}/api/nodes/${encodeURIComponent(nodeId)}/view-model?stageMonths=3&enhanced=true`,
    )
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: unknown
    }

    assert.equal(payload.success, true)
    assertNodeViewModelContract(payload.data)

    const viewModel = payload.data as any
    assert.equal(viewModel.isMergeNode, true)
    assert.equal(viewModel.stats.paperCount, 3)
    assert.deepEqual(
      viewModel.paperRoles.map((paper: any) => paper.paperId).sort(),
      ['1511.03791', '1710.02410', '1912.12294'].sort(),
    )
    assert.equal(
      viewModel.evidence.some(
        (item: any) =>
          item.title === 'Topic placement' || /grouped into \d+ node\(s\)/iu.test(item.content),
      ),
      false,
    )
    const serialized = JSON.stringify(viewModel)
    assert.equal(serialized.includes('images\\\\'), false)
    assert.equal(
      viewModel.paperRoles.find((paper: any) => paper.paperId === '1912.12294')?.coverImage?.startsWith('/uploads/1912.12294/images/'),
      true,
    )
    assert.equal(
      viewModel.paperRoles.find((paper: any) => paper.paperId === '1710.02410')?.coverImage?.startsWith('/uploads/1710.02410/images/'),
      true,
    )
  })
})

test('GET /uploads serves canonical extracted paper images with an image content-type', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')

  await withServer(async (origin) => {
    const nodeId = 'autonomous-driving:stage-2:1912.12294'
    const nodeResponse = await fetch(
      `${origin}/api/nodes/${encodeURIComponent(nodeId)}/view-model?stageMonths=3&enhanced=true`,
    )
    assert.equal(nodeResponse.status, 200)

    const nodePayload = (await nodeResponse.json()) as {
      success: boolean
      data: any
    }

    assert.equal(nodePayload.success, true)
    const uploadBackedCover = nodePayload.data.paperRoles.find((paper: any) =>
      String(paper.coverImage ?? '').startsWith('/uploads/'),
    )?.coverImage

    assert.ok(uploadBackedCover)

    const assetResponse = await fetch(`${origin}${uploadBackedCover}`)
    assert.equal(assetResponse.status, 200)
    assert.match(assetResponse.headers.get('content-type') ?? '', /^image\//i)
  })
})

test('GET /api/nodes/:nodeId/view-model rebuilds when the enhanced node cache contains legacy asset paths', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')

  const nodeId = 'autonomous-driving:stage-2:1912.12294'
  const cachedViewModel = await rebuildNodeViewModel(nodeId, {
    stageWindowMonths: 3,
    enhanced: true,
  })
  const staleViewModel = JSON.parse(JSON.stringify(cachedViewModel)) as any
  staleViewModel.paperRoles[0].coverImage = 'images\\legacy-cover.png'

  await prisma.system_configs.upsert({
    where: { key: `alpha:reader-artifact:node:enhanced:${nodeId}` },
    update: {
      value: JSON.stringify({
        kind: 'node',
        entityId: nodeId,
        fingerprint: 'stale-node-asset-cache',
        updatedAt: new Date().toISOString(),
        viewModel: staleViewModel,
      }),
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      key: `alpha:reader-artifact:node:enhanced:${nodeId}`,
      value: JSON.stringify({
        kind: 'node',
        entityId: nodeId,
        fingerprint: 'stale-node-asset-cache',
        updatedAt: new Date().toISOString(),
        viewModel: staleViewModel,
      }),
      updatedAt: new Date(),
    },
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(
        `${origin}/api/nodes/${encodeURIComponent(nodeId)}/view-model?stageMonths=3&enhanced=true`,
      )
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: unknown
      }

      assert.equal(payload.success, true)
      assertNodeViewModelContract(payload.data)
      const serialized = JSON.stringify(payload.data)
      assert.equal(serialized.includes('images\\\\'), false)
    })
  } finally {
    await prisma.system_configs.deleteMany({
      where: { key: `alpha:reader-artifact:node:enhanced:${nodeId}` },
    })
  }
})

test('GET /api/topics/:topicId/research-brief returns a contract-valid canonical brief for autonomous-driving', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/autonomous-driving/research-brief`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: unknown
    }

    assert.equal(payload.success, true)
    assertTopicResearchBriefContract(payload.data)

    const brief = payload.data as any
    assert.ok(brief.world.stages.length >= 1)
    assert.equal(brief.world.stages[0]?.stageIndex, 0)
    assert.ok(brief.world.nodes.some((node: any) => node.stageIndex === 0))
  })
})

test('GET /api/topics/research-health reports i18n-ready backend coverage issues', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')

  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/topics/research-health`)
    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        status: string
        i18nKey: string
        totals: {
          topics: number
          papers: number
          nodes: number
          papersWithFigures: number
          papersWithTables: number
          papersWithFormulas: number
        }
        thresholds: {
          canonicalTopics: number
          targetPapersPerNode: number
          maxPapersPerStage: number
        }
        issues: Array<{ code: string; i18nKey: string; values: Record<string, number> }>
        recommendations: Array<{ i18nKey: string; values: Record<string, number> }>
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.thresholds.canonicalTopics, 5)
    assert.equal(payload.data.thresholds.targetPapersPerNode, 10)
    assert.equal(payload.data.thresholds.maxPapersPerStage, 200)
    assert.equal(payload.data.totals.topics >= 5, true)
    assert.match(payload.data.i18nKey, /^research\.health\.status\./u)
    assert.ok(payload.data.issues.every((issue) => issue.i18nKey.startsWith('research.health.issue.')))
    assert.ok(
      payload.data.recommendations.every((recommendation) =>
        recommendation.i18nKey.startsWith('research.health.recommendation.'),
      ),
    )
  })
})
