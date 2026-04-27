import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { runStorageRetentionSweep } from '../services/storage-retention'

function subtractDays(base: Date, days: number) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() - days)
  return next
}

test('storage retention sweep prunes expired candidate pool rows, stale process configs, and old research sessions', async () => {
  const topicId = `storage-retention-topic-${Date.now()}`
  const paperId = `storage-retention-paper-${Date.now()}`
  const now = new Date()
  const oldDate = subtractDays(now, 45)

  await prisma.topics.create({
    data: {
      id: topicId,
      nameZh: 'Storage Retention Topic',
      nameEn: 'Storage Retention Topic',
      language: 'en',
      status: 'active',
      updatedAt: now,
    },
  })

  await prisma.papers.create({
    data: {
      id: paperId,
      topicId,
      title: 'Expired candidate-pool paper',
      titleZh: 'Expired candidate-pool paper',
      titleEn: 'Expired candidate-pool paper',
      authors: '[]',
      published: now,
      summary: 'Candidate pool only paper',
      explanation: 'Should disappear with the expired pool row.',
      figurePaths: '[]',
      tablePaths: '[]',
      formulaPaths: '[]',
      tags: '[]',
      status: 'candidate-pool',
      contentMode: 'editorial',
      updatedAt: now,
    },
  })

  await prisma.paper_candidate_pool.create({
    data: {
      id: `${topicId}-expired-entry`,
      topicId,
      paperId,
      sourcePaperId: 'arxiv:2504.99999',
      title: 'Expired candidate pool entry',
      status: 'rejected',
      confidence: 0.19,
      stageIndex: 4,
      stageLabel: 'Stage 4',
      retentionTier: 'ephemeral',
      retentionExpiresAt: subtractDays(now, 2),
      lastSeenAt: oldDate,
    },
  })

  await prisma.system_configs.createMany({
    data: [
      {
        id: `${topicId}-generation-memory`,
        key: `generation-memory:v1:${topicId}`,
        value: '{"schemaVersion":"generation-memory-v1"}',
        updatedAt: oldDate,
      },
      {
        id: `${topicId}-topic-stage-config`,
        key: `topic-stage-config:v1:${topicId}`,
        value: '{"windowMonths":6}',
        updatedAt: oldDate,
      },
      {
        id: `${topicId}-pipeline`,
        key: `topic:${topicId}:research-pipeline`,
        value: '{"schemaVersion":"pipeline"}',
        updatedAt: oldDate,
      },
    ],
  })

  await prisma.research_sessions.create({
    data: {
      id: `${topicId}-session`,
      topicIds: JSON.stringify([topicId]),
      mode: 'duration',
      status: 'completed',
      currentStage: 'Stage 4',
      progress: 100,
      logs: '[]',
      createdAt: oldDate,
      completedAt: oldDate,
    },
  })

  try {
    const result = await runStorageRetentionSweep()

    assert.ok(result.candidatePoolDeleted >= 1)
    assert.ok(result.orphanCandidatePapersDeleted >= 1)
    assert.ok(result.researchSessionsDeleted >= 1)
    assert.ok(result.staleSystemConfigsDeleted >= 2)

    const [poolEntry, paper, generationMemory, topicStageConfig, pipelineState, session] =
      await Promise.all([
        prisma.paper_candidate_pool.findUnique({ where: { id: `${topicId}-expired-entry` } }),
        prisma.papers.findUnique({ where: { id: paperId } }),
        prisma.system_configs.findUnique({ where: { key: `generation-memory:v1:${topicId}` } }),
        prisma.system_configs.findUnique({ where: { key: `topic-stage-config:v1:${topicId}` } }),
        prisma.system_configs.findUnique({ where: { key: `topic:${topicId}:research-pipeline` } }),
        prisma.research_sessions.findUnique({ where: { id: `${topicId}-session` } }),
      ])

    assert.equal(poolEntry, null)
    assert.equal(paper, null)
    assert.equal(generationMemory, null)
    assert.equal(pipelineState, null)
    assert.ok(topicStageConfig, 'topic-stage-config should be preserved as core config')
    assert.equal(session, null)
  } finally {
    await prisma.paper_candidate_pool.deleteMany({ where: { topicId } })
    await prisma.papers.deleteMany({ where: { topicId } })
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [
            `generation-memory:v1:${topicId}`,
            `topic-stage-config:v1:${topicId}`,
            `topic:${topicId}:research-pipeline`,
          ],
        },
      },
    })
    await prisma.research_sessions.deleteMany({ where: { id: `${topicId}-session` } })
    await prisma.topics.deleteMany({ where: { id: topicId } })
  }
})
