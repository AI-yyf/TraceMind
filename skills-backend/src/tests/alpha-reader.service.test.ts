import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { getResolvedUserModelConfig, saveUserModelConfig } from '../services/omni/config-store'
import {
  buildNodeArtifactFingerprint,
  buildPaperArtifactFingerprint,
  getNodeViewModel,
  getPaperViewModel,
  orchestrateTopicReaderArtifacts,
} from '../services/topics/alpha-reader'
import { deriveTemporalStageBuckets } from '../services/topics/stage-buckets'
import { saveTopicResearchReport } from '../services/topics/research-report'
import { recordTopicGuidanceDirective } from '../services/topics/topic-guidance-ledger'

test('reader artifact fingerprints change when research pipeline state changes', async () => {
  const topic = await prisma.topic.create({
    data: {
      nameZh: '指纹测试主题',
      nameEn: 'Fingerprint Topic',
      language: 'zh',
      status: 'active',
    },
  })

  const paper = await prisma.paper.create({
    data: {
      topicId: topic.id,
      title: 'Pipeline-aware Reader Artifact Test',
      titleZh: '研究流水线感知阅读工件测试',
      titleEn: 'Pipeline-aware Reader Artifact Test',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-01-01T00:00:00.000Z'),
      summary: 'A seed paper for testing reader artifact fingerprint invalidation.',
      explanation: 'This paper exists only to validate research pipeline continuity wiring.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
    },
  })

  const node = await prisma.researchNode.create({
    data: {
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: '连续研究节点',
      nodeSubtitle: 'Continuity node',
      nodeSummary: '用于验证研究流水线上下文会进入 reader fingerprint。',
      nodeExplanation: 'If the research pipeline changes, cached reader artifacts should invalidate.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
    },
  })

  await prisma.nodePaper.create({
    data: {
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const [nodeFingerprintBefore, paperFingerprintBefore] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintBefore)
    assert.ok(paperFingerprintBefore)

    const pipelinePayload = {
      schemaVersion: 'research-pipeline-v1',
      topicId: topic.id,
      updatedAt: '2026-04-01T00:00:00.000Z',
      lastRun: {
        timestamp: '2026-04-01T00:00:00.000Z',
        stageIndex: 2,
        roundIndex: 1,
        discovered: 5,
        admitted: 2,
        contentsGenerated: 2,
        stageSummary: 'Stage 2 admitted new evidence and strengthened the current node.',
        shouldAdvanceStage: false,
        nodeActions: [
          {
            action: 'strengthen',
            nodeId: node.id,
            title: '连续研究节点',
            paperIds: [paper.id],
            primaryPaperId: paper.id,
            rationale: 'The node is still open because evidence comparison is incomplete.',
          },
        ],
        openQuestions: ['What evidence would justify advancing to the next stage?'],
      },
      history: [
        {
          timestamp: '2026-04-01T00:00:00.000Z',
          stageIndex: 2,
          roundIndex: 1,
          discovered: 5,
          admitted: 2,
          contentsGenerated: 2,
          stageSummary: 'Stage 2 admitted new evidence and strengthened the current node.',
          shouldAdvanceStage: false,
          nodeActions: [
            {
              action: 'strengthen',
              nodeId: node.id,
              title: '连续研究节点',
              paperIds: [paper.id],
              primaryPaperId: paper.id,
              rationale: 'The node is still open because evidence comparison is incomplete.',
            },
          ],
          openQuestions: ['What evidence would justify advancing to the next stage?'],
        },
      ],
      stages: {
        '2': {
          timestamp: '2026-04-01T00:00:00.000Z',
          stageIndex: 2,
          roundIndex: 1,
          discovered: 5,
          admitted: 2,
          contentsGenerated: 2,
          stageSummary: 'Stage 2 admitted new evidence and strengthened the current node.',
          shouldAdvanceStage: false,
          nodeActions: [
            {
              action: 'strengthen',
              nodeId: node.id,
              title: '连续研究节点',
              paperIds: [paper.id],
              primaryPaperId: paper.id,
              rationale: 'The node is still open because evidence comparison is incomplete.',
            },
          ],
          openQuestions: ['What evidence would justify advancing to the next stage?'],
        },
      },
    }

    await prisma.systemConfig.upsert({
      where: { key: `topic:${topic.id}:research-pipeline` },
      update: {
        value: JSON.stringify(pipelinePayload),
      },
      create: {
        key: `topic:${topic.id}:research-pipeline`,
        value: JSON.stringify(pipelinePayload),
      },
    })

    const [nodeFingerprintAfter, paperFingerprintAfter] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintAfter)
    assert.ok(paperFingerprintAfter)
    assert.notEqual(nodeFingerprintBefore, nodeFingerprintAfter)
    assert.notEqual(paperFingerprintBefore, paperFingerprintAfter)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [`topic:${topic.id}:research-pipeline`],
        },
      },
    })
    await prisma.topic.delete({
      where: { id: topic.id },
    })
  }
})

test('reader view models expose temporal stage labels for adjustable windows', async () => {
  const [paperViewModel, nodeViewModel] = await Promise.all([
    getPaperViewModel('paper-1', { stageWindowMonths: 3 }),
    getNodeViewModel('node-1', { stageWindowMonths: 3 }),
  ])

  assert.ok(paperViewModel.relatedNodes.length > 0)
  assert.equal(typeof paperViewModel.relatedNodes[0]?.stageLabel, 'string')
  assert.ok((paperViewModel.relatedNodes[0]?.stageLabel ?? '').length > 0)
  assert.equal(typeof paperViewModel.originalUrl, 'string')
  assert.equal(typeof paperViewModel.pdfUrl, 'string')
  assert.equal(typeof nodeViewModel.stageLabel, 'string')
  assert.ok((nodeViewModel.stageLabel ?? '').length > 0)
  assert.equal(typeof nodeViewModel.paperRoles[0]?.originalUrl, 'string')
  assert.equal(typeof nodeViewModel.paperRoles[0]?.pdfUrl, 'string')
  assert.equal(typeof nodeViewModel.article.flow.find((block) => block.type === 'paper-break' && block.paperId === 'paper-1')?.originalUrl, 'string')
})

test('node view models keep only papers that belong to the same temporal stage bucket', async () => {
  const nodeRecord = await prisma.researchNode.findUnique({
    where: { id: 'node-1' },
    select: {
      id: true,
      topicId: true,
      primaryPaperId: true,
      updatedAt: true,
      createdAt: true,
      papers: {
        select: {
          paperId: true,
        },
      },
    },
  })

  assert.ok(nodeRecord)

  const topic = await prisma.topic.findUnique({
    where: { id: nodeRecord.topicId },
    select: {
      createdAt: true,
      papers: {
        select: {
          id: true,
          published: true,
        },
      },
      nodes: {
        select: {
          id: true,
          primaryPaperId: true,
          updatedAt: true,
          createdAt: true,
          papers: {
            select: {
              paperId: true,
            },
          },
        },
      },
    },
  })

  assert.ok(topic)

  const stageBuckets = deriveTemporalStageBuckets({
    papers: topic.papers,
    nodes: topic.nodes,
    windowMonths: 1,
    fallbackDate: topic.createdAt,
  })
  const nodeAssignment = stageBuckets.nodeAssignments.get(nodeRecord.id)
  assert.ok(nodeAssignment)

  const viewModel = await getNodeViewModel(nodeRecord.id, { stageWindowMonths: 1 })
  const paperBreakIds = viewModel.article.flow
    .filter((block) => block.type === 'paper-break')
    .map((block) => block.paperId)

  assert.ok(viewModel.paperRoles.length > 0)
  assert.deepEqual(
    paperBreakIds.sort(),
    viewModel.paperRoles.map((paper) => paper.paperId).sort(),
  )

  for (const paper of viewModel.paperRoles) {
    assert.equal(
      stageBuckets.paperAssignments.get(paper.paperId)?.bucketKey,
      nodeAssignment?.bucketKey,
    )
  }

  for (const evidence of viewModel.evidence) {
    if (!evidence.sourcePaperId) continue
    assert.equal(
      stageBuckets.paperAssignments.get(evidence.sourcePaperId)?.bucketKey,
      nodeAssignment?.bucketKey,
    )
  }
})

test('node view models keep section-level text blocks and all renderable evidence for stage-scoped papers', async () => {
  const nodeRecord = await prisma.researchNode.findUnique({
    where: { id: 'node-1' },
    select: {
      id: true,
      topicId: true,
    },
  })

  assert.ok(nodeRecord)

  const topicPapers = await prisma.paper.findMany({
    where: { topicId: nodeRecord.topicId },
    include: {
      sections: { orderBy: { order: 'asc' } },
      figures: true,
      tables: true,
      formulas: true,
    },
  })

  const viewModel = await getNodeViewModel(nodeRecord.id, { stageWindowMonths: 1 })
  const allowedPaperIds = new Set(viewModel.paperRoles.map((paper) => paper.paperId))
  const visiblePapers = topicPapers.filter((paper) => allowedPaperIds.has(paper.id))

  const flowSectionAnchors = new Set(
    viewModel.article.flow
      .filter((block) => block.type === 'text' && block.paperId)
      .map((block) => block.anchorId)
      .filter((anchorId): anchorId is string => typeof anchorId === 'string' && anchorId.startsWith('section:')),
  )
  const flowEvidenceAnchors = new Set(
    viewModel.article.flow
      .filter(
        (block) =>
          block.type === 'figure' ||
          block.type === 'table' ||
          block.type === 'formula',
      )
      .map((block) => block.evidence.anchorId),
  )

  for (const paper of visiblePapers) {
    for (const section of paper.sections) {
      assert.ok(
        flowSectionAnchors.has(`section:${section.id}`),
        `missing section flow block for ${paper.id} / ${section.id}`,
      )
    }

    for (const figure of paper.figures) {
      assert.ok(
        flowEvidenceAnchors.has(`figure:${figure.id}`),
        `missing figure flow block for ${paper.id} / ${figure.id}`,
      )
    }

    for (const table of paper.tables) {
      assert.ok(
        flowEvidenceAnchors.has(`table:${table.id}`),
        `missing table flow block for ${paper.id} / ${table.id}`,
      )
    }

    for (const formula of paper.formulas) {
      assert.ok(
        flowEvidenceAnchors.has(`formula:${formula.id}`),
        `missing formula flow block for ${paper.id} / ${formula.id}`,
      )
    }
  }
})

test('reader artifact fingerprints change when topic cognitive memory changes through research reports', async () => {
  const topic = await prisma.topic.create({
    data: {
      nameZh: '认知记忆主题',
      nameEn: 'Cognitive Memory Topic',
      language: 'zh',
      status: 'active',
    },
  })

  const paper = await prisma.paper.create({
    data: {
      topicId: topic.id,
      title: 'Cognitive Memory Seed Paper',
      titleZh: '认知记忆种子论文',
      titleEn: 'Cognitive Memory Seed Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-03-01T00:00:00.000Z'),
      summary: 'A seed paper for validating reader fingerprints against cognitive memory updates.',
      explanation: 'The paper exists to prove that research reports feed back into reader rebuild decisions.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
    },
  })

  const node = await prisma.researchNode.create({
    data: {
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '认知记忆节点',
      nodeSubtitle: 'Cognitive node',
      nodeSummary: '用于验证 research report 进入 reader fingerprint。',
      nodeExplanation: 'If the report changes the topic-level understanding, reader artifacts should invalidate.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
    },
  })

  await prisma.nodePaper.create({
    data: {
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const [nodeFingerprintBefore, paperFingerprintBefore] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintBefore)
    assert.ok(paperFingerprintBefore)

    await saveTopicResearchReport({
      schemaVersion: 'topic-research-report-v1',
      reportId: `report-${topic.id}`,
      taskId: `task-${topic.id}`,
      topicId: topic.id,
      topicName: topic.nameZh,
      researchMode: 'duration',
      trigger: 'manual',
      status: 'running',
      durationHours: 6,
      startedAt: '2026-04-04T00:00:00.000Z',
      deadlineAt: '2026-04-04T06:00:00.000Z',
      completedAt: null,
      updatedAt: '2026-04-04T01:00:00.000Z',
      currentStage: 1,
      totalStages: 3,
      completedStageCycles: 1,
      totalRuns: 1,
      successfulRuns: 1,
      failedRuns: 0,
      discoveredPapers: 4,
      admittedPapers: 1,
      generatedContents: 2,
      latestStageSummary: 'Stage 1 is now anchored around planning fidelity rather than broad autonomy.',
      headline: 'The topic focus narrowed toward planning fidelity.',
      dek: 'A fresh report should update the reader rebuild fingerprint.',
      summary: 'The latest run concluded that planning fidelity is the strongest supported axis for this topic.',
      paragraphs: [
        'This report reframed the topic around planning fidelity and should therefore change reader continuity.',
      ],
      keyMoves: ['Shift the narrative center from broad autonomy claims to planning fidelity evidence.'],
      openQuestions: ['Which benchmark still breaks the planning stack?'],
      latestNodeActions: [
        {
          action: 'strengthen',
          stageIndex: 1,
          title: node.nodeLabel,
          rationale: 'The node now needs to emphasize planning fidelity over broad autonomy claims.',
          nodeId: node.id,
          mergeIntoNodeId: null,
        },
      ],
    })

    const [nodeFingerprintAfter, paperFingerprintAfter] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintAfter)
    assert.ok(paperFingerprintAfter)
    assert.notEqual(nodeFingerprintBefore, nodeFingerprintAfter)
    assert.notEqual(paperFingerprintBefore, paperFingerprintAfter)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [`topic:${topic.id}:research-report`],
        },
      },
    })
    await prisma.topic.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact fingerprints change when topic guidance directives are recorded', async () => {
  const topic = await prisma.topic.create({
    data: {
      nameZh: '指导失效主题',
      nameEn: 'Guidance Invalidation Topic',
      language: 'zh',
      status: 'active',
    },
  })

  const paper = await prisma.paper.create({
    data: {
      topicId: topic.id,
      title: 'Guidance Seed Paper',
      titleZh: '指导种子论文',
      titleEn: 'Guidance Seed Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-03-15T00:00:00.000Z'),
      summary: 'A seed paper for validating reader invalidation after sidebar guidance.',
      explanation: 'The paper proves that accepted topic guidance flows back into reader rebuild decisions.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
    },
  })

  const node = await prisma.researchNode.create({
    data: {
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: '指导敏感节点',
      nodeSubtitle: 'Guidance-sensitive node',
      nodeSummary: '用于验证聊天指导会影响 reader 指纹。',
      nodeExplanation: 'If sidebar guidance changes the topic direction, reader artifacts should rebuild.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
    },
  })

  await prisma.nodePaper.create({
    data: {
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const [nodeFingerprintBefore, paperFingerprintBefore] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintBefore)
    assert.ok(paperFingerprintBefore)

    await recordTopicGuidanceDirective({
      topicId: topic.id,
      sourceMessageId: `message-${topic.id}`,
      messageKind: 'focus',
      scopeType: 'node',
      scopeId: node.id,
      scopeLabel: node.nodeLabel,
      instruction: '接下来优先把节点叙事收束到规划保真度，不再泛泛讨论通用自治。',
    })

    const [nodeFingerprintAfter, paperFingerprintAfter] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintAfter)
    assert.ok(paperFingerprintAfter)
    assert.notEqual(nodeFingerprintBefore, nodeFingerprintAfter)
    assert.notEqual(paperFingerprintBefore, paperFingerprintAfter)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [`topic:guidance-ledger:v1:${topic.id}`],
        },
      },
    })
    await prisma.topic.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact orchestration persists pipeline state before publishing cached quick view models', async () => {
  const topic = await prisma.topic.create({
    data: {
      nameZh: '研究编排主题',
      nameEn: 'Reader Orchestration Topic',
      language: 'zh',
      status: 'active',
    },
  })

  const paper = await prisma.paper.create({
    data: {
      topicId: topic.id,
      title: 'Reader Orchestration Seed Paper',
      titleZh: 'Reader 编排种子论文',
      titleEn: 'Reader Orchestration Seed Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-02-01T00:00:00.000Z'),
      summary: 'A seed paper for validating reader artifact orchestration.',
      explanation: 'This paper is used to verify that pipeline state is written before artifact warming.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
    },
  })

  const node = await prisma.researchNode.create({
    data: {
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '编排节点',
      nodeSubtitle: 'Orchestrated node',
      nodeSummary: '验证 reader artifact 的编排顺序。',
      nodeExplanation: 'The pipeline state must exist before cached node and paper articles are rebuilt.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
    },
  })

  await prisma.nodePaper.create({
    data: {
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const warmed = await orchestrateTopicReaderArtifacts(topic.id, {
      limit: 1,
      mode: 'quick',
      pipelineEntry: {
        timestamp: '2026-04-01T08:00:00.000Z',
        stageIndex: 1,
        roundIndex: 2,
        discovered: 4,
        admitted: 1,
        contentsGenerated: 2,
        stageSummary: 'Stage 1 tightened the node framing before admitting new evidence.',
        shouldAdvanceStage: false,
        nodeActions: [
          {
            action: 'strengthen',
            nodeId: node.id,
            title: '编排节点',
            paperIds: [paper.id],
            primaryPaperId: paper.id,
            rationale: 'The node remains open until comparison evidence becomes more explicit.',
          },
        ],
        openQuestions: ['Which evidence would justify creating a second node?'],
      },
    })

    assert.equal(warmed.warmedNodeCount >= 1, true)
    assert.equal(warmed.warmedPaperCount >= 1, true)
    assert.equal(warmed.pipelineUpdatedAt, '2026-04-01T08:00:00.000Z')

    const [pipelineRecord, cachedNodeRecord, cachedPaperRecord, nodeFingerprint, paperFingerprint] =
      await Promise.all([
        prisma.systemConfig.findUnique({
          where: { key: `topic:${topic.id}:research-pipeline` },
        }),
        prisma.systemConfig.findUnique({
          where: { key: `alpha:reader-artifact:node:${node.id}` },
        }),
        prisma.systemConfig.findUnique({
          where: { key: `alpha:reader-artifact:paper:${paper.id}` },
        }),
        buildNodeArtifactFingerprint(node.id),
        buildPaperArtifactFingerprint(paper.id),
      ])

    assert.ok(pipelineRecord)
    assert.ok(cachedNodeRecord)
    assert.ok(cachedPaperRecord)
    assert.ok(nodeFingerprint)
    assert.ok(paperFingerprint)

    const pipelinePayload = JSON.parse(pipelineRecord.value) as {
      updatedAt: string
      lastRun?: { stageSummary?: string }
    }
    const cachedNodePayload = JSON.parse(cachedNodeRecord.value) as {
      fingerprint: string
    }
    const cachedPaperPayload = JSON.parse(cachedPaperRecord.value) as {
      fingerprint: string
    }

    assert.equal(pipelinePayload.updatedAt, '2026-04-01T08:00:00.000Z')
    assert.equal(
      pipelinePayload.lastRun?.stageSummary,
      'Stage 1 tightened the node framing before admitting new evidence.',
    )
    assert.match(cachedNodePayload.fingerprint, /^quick:/u)
    assert.match(cachedPaperPayload.fingerprint, /^quick:/u)
    assert.notEqual(cachedNodePayload.fingerprint, nodeFingerprint)
    assert.notEqual(cachedPaperPayload.fingerprint, paperFingerprint)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [
            `topic:${topic.id}:research-pipeline`,
            `alpha:reader-artifact:node:${node.id}`,
            `alpha:reader-artifact:paper:${paper.id}`,
          ],
        },
      },
    })
    await prisma.topic.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact orchestration can persist quick snapshots while keeping final rebuild pending', async () => {
  const topic = await prisma.topic.create({
    data: {
      nameZh: '快速快照主题',
      nameEn: 'Quick Snapshot Topic',
      language: 'zh',
      status: 'active',
    },
  })

  const paper = await prisma.paper.create({
    data: {
      topicId: topic.id,
      title: 'Quick Snapshot Seed Paper',
      titleZh: '快速快照种子论文',
      titleEn: 'Quick Snapshot Seed Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-03-01T00:00:00.000Z'),
      summary: 'A seed paper for validating quick reader artifact snapshots.',
      explanation: 'This paper ensures the scheduler can publish a usable snapshot before the deep rebuild finishes.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
    },
  })

  const node = await prisma.researchNode.create({
    data: {
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '快速快照节点',
      nodeSubtitle: 'Quick snapshot node',
      nodeSummary: '用于验证 quick mode 会先持久化可读快照。',
      nodeExplanation: 'The quick snapshot should be available immediately while the final fingerprint remains pending.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
    },
  })

  await prisma.nodePaper.create({
    data: {
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const warmed = await orchestrateTopicReaderArtifacts(topic.id, {
      limit: 1,
      mode: 'quick',
      pipelineEntry: {
        timestamp: '2026-04-03T08:00:00.000Z',
        stageIndex: 1,
        roundIndex: 1,
        discovered: 2,
        admitted: 1,
        contentsGenerated: 1,
        stageSummary: 'Quick mode published a readable snapshot before the final rebuild.',
        shouldAdvanceStage: false,
        nodeActions: [
          {
            action: 'strengthen',
            nodeId: node.id,
            title: '快速快照节点',
            paperIds: [paper.id],
            primaryPaperId: paper.id,
            rationale: 'The snapshot is usable immediately, but the fully authored article can continue later.',
          },
        ],
        openQuestions: ['Will the deferred rebuild keep the same node framing?'],
      },
    })

    const [cachedNodeRecord, cachedPaperRecord, nodeFingerprint, paperFingerprint] = await Promise.all([
      prisma.systemConfig.findUnique({
        where: { key: `alpha:reader-artifact:node:${node.id}` },
      }),
      prisma.systemConfig.findUnique({
        where: { key: `alpha:reader-artifact:paper:${paper.id}` },
      }),
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.equal(warmed.mode, 'quick')
    assert.equal(warmed.queuedNodeCount, 0)
    assert.equal(warmed.queuedPaperCount, 0)
    assert.ok(cachedNodeRecord)
    assert.ok(cachedPaperRecord)
    assert.ok(nodeFingerprint)
    assert.ok(paperFingerprint)

    const cachedNodePayload = JSON.parse(cachedNodeRecord.value) as {
      fingerprint: string
    }
    const cachedPaperPayload = JSON.parse(cachedPaperRecord.value) as {
      fingerprint: string
    }

    assert.match(cachedNodePayload.fingerprint, /^quick:/u)
    assert.match(cachedPaperPayload.fingerprint, /^quick:/u)
    assert.notEqual(cachedNodePayload.fingerprint, nodeFingerprint)
    assert.notEqual(cachedPaperPayload.fingerprint, paperFingerprint)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [
            `topic:${topic.id}:research-pipeline`,
            `alpha:reader-artifact:node:${node.id}`,
            `alpha:reader-artifact:paper:${paper.id}`,
          ],
        },
      },
    })
    await prisma.topic.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact fingerprints change when the active model configuration changes', async () => {
  const previousConfig = await getResolvedUserModelConfig()
  const topic = await prisma.topic.create({
    data: {
      nameZh: '模型配置指纹主题',
      nameEn: 'Model Fingerprint Topic',
      language: 'zh',
      status: 'active',
    },
  })

  const paper = await prisma.paper.create({
    data: {
      topicId: topic.id,
      title: 'Model Fingerprint Seed Paper',
      titleZh: '模型指纹种子论文',
      titleEn: 'Model Fingerprint Seed Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-03-01T00:00:00.000Z'),
      summary: 'A seed paper for validating model-aware reader artifact invalidation.',
      explanation: 'The output cache should invalidate when the configured model stack changes.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: '[]',
      status: 'candidate',
    },
  })

  const node = await prisma.researchNode.create({
    data: {
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '模型配置敏感节点',
      nodeSubtitle: 'Model-aware node',
      nodeSummary: '验证当前 reader artifact 是否会随着模型配置变化而失效。',
      nodeExplanation: 'If the configured model changes, cached node and paper articles should rebuild.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
    },
  })

  await prisma.nodePaper.create({
    data: {
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    await saveUserModelConfig({
      language: {
        provider: 'openai_compatible',
        model: 'model-a',
        baseUrl: 'https://example.com/v1',
      },
      multimodal: {
        provider: 'openai_compatible',
        model: 'vision-a',
        baseUrl: 'https://example.com/v1',
      },
    })

    const [nodeFingerprintBefore, paperFingerprintBefore] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    await saveUserModelConfig({
      language: {
        provider: 'openai_compatible',
        model: 'model-b',
        baseUrl: 'https://example.com/v1',
      },
      multimodal: {
        provider: 'openai_compatible',
        model: 'vision-b',
        baseUrl: 'https://example.com/v1',
      },
    })

    const [nodeFingerprintAfter, paperFingerprintAfter] = await Promise.all([
      buildNodeArtifactFingerprint(node.id),
      buildPaperArtifactFingerprint(paper.id),
    ])

    assert.ok(nodeFingerprintBefore)
    assert.ok(paperFingerprintBefore)
    assert.ok(nodeFingerprintAfter)
    assert.ok(paperFingerprintAfter)
    assert.notEqual(nodeFingerprintBefore, nodeFingerprintAfter)
    assert.notEqual(paperFingerprintBefore, paperFingerprintAfter)
  } finally {
    await saveUserModelConfig({
      language: previousConfig.language
        ? {
            provider: previousConfig.language.provider,
            model: previousConfig.language.model,
            baseUrl: previousConfig.language.baseUrl,
            apiKeyRef: previousConfig.language.apiKeyRef,
            options: previousConfig.language.options,
          }
        : null,
      multimodal: previousConfig.multimodal
        ? {
            provider: previousConfig.multimodal.provider,
            model: previousConfig.multimodal.model,
            baseUrl: previousConfig.multimodal.baseUrl,
            apiKeyRef: previousConfig.multimodal.apiKeyRef,
            options: previousConfig.multimodal.options,
          }
        : null,
      taskOverrides: previousConfig.taskOverrides,
    })

    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [
            `alpha:reader-artifact:node:${node.id}`,
            `alpha:reader-artifact:paper:${paper.id}`,
          ],
        },
      },
    })
    await prisma.topic.delete({
      where: { id: topic.id },
    })
  }
})
