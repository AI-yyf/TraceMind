import assert from 'node:assert/strict'
import test from 'node:test'

import { disconnectDatabase, prisma } from '../lib/prisma'
import { getResolvedUserModelConfig, saveUserModelConfig } from '../services/omni/config-store'
import { omniGateway } from '../services/omni/gateway'
import {
  __testing as alphaReaderTesting,
  buildNodeArtifactFingerprint,
  buildPaperArtifactFingerprint,
  getNodeViewModel,
  orchestrateTopicReaderArtifacts,
  rebuildNodeViewModel,
  warmTopicReaderArtifacts,
} from '../services/topics/alpha-reader'
import { deriveTemporalStageBuckets } from '../services/topics/stage-buckets'
import { saveTopicStageConfig } from '../services/topics/topic-stage-config'
import { saveTopicResearchReport } from '../services/topics/research-report'
import { recordTopicGuidanceDirective } from '../services/topics/topic-guidance-ledger'
import { ensureConfiguredTopicMaterialized } from '../services/topics/topic-config-sync'

type ReaderFixture = {
  topicId: string
  nodeId: string
  primaryPaperId: string
  stagePaperIds: string[]
  outOfStagePaperId: string
}

const originalOmniGatewayComplete = omniGateway.complete.bind(omniGateway)
const originalOmniGatewayHasAvailableModel = omniGateway.hasAvailableModel.bind(omniGateway)

test.before(() => {
  omniGateway.complete = async () => ({
    text: '{}',
    provider: 'backend',
    model: 'test-double',
    slot: 'language',
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
      reasoning: false,
      streaming: false,
    },
    usedFallback: true,
  })

  omniGateway.hasAvailableModel = async () => false
})

test.after(async () => {
  omniGateway.complete = originalOmniGatewayComplete
  omniGateway.hasAvailableModel = originalOmniGatewayHasAvailableModel

  await disconnectDatabase()

  const activeHandles = (process as typeof process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() ?? []
  const summarized = activeHandles
    .map((handle) => {
      const name = handle?.constructor?.name ?? typeof handle
      const socket = handle as { remoteAddress?: string; remotePort?: number; localPort?: number }
      const remote = socket.remoteAddress && socket.remotePort ? `${socket.remoteAddress}:${socket.remotePort}` : null
      const local = socket.localPort ? `local:${socket.localPort}` : null
      return [name, remote, local].filter(Boolean).join(' ')
    })
    .filter((entry) => entry && entry !== 'TTY' && entry !== 'WriteStream' && entry !== 'ReadStream')

  if (summarized.length > 0) {
    console.error('[alpha-reader test] active handles after teardown:', summarized)
  }
})

test('reader sanitizes noisy extracted sections before they reach node articles', () => {
  const sections = alphaReaderTesting.getRenderablePaperSections({
    sections: [
      {
        id: 'noise-1',
        sourceSectionTitle: 'Acknowledgements',
        editorialTitle: 'Acknowledgements',
        paragraphs: JSON.stringify(['I thank my supervisor for support.']),
      },
      {
        id: 'noise-2',
        sourceSectionTitle: 'Body',
        editorialTitle: 'Body',
        paragraphs: JSON.stringify([
          '<html><body>IEEE Xplore Personal use is permitted.</body></html>',
        ]),
      },
      {
        id: 'clean-1',
        sourceSectionTitle: 'Introduction',
        editorialTitle: 'Introduction',
        paragraphs: JSON.stringify([
          'We study grounded node articles that keep evidence close to the narrative.',
        ]),
      },
    ],
  })

  assert.deepEqual(sections.map((section: { id: string }) => section.id), ['clean-1'])
  assert.match(sections[0]?.renderParagraphs[0] ?? '', /grounded node articles/u)
})

test('reader drops table-of-contents style section bodies from node articles', () => {
  const sections = alphaReaderTesting.getRenderablePaperSections({
    sections: [
      {
        id: 'toc-1',
        sourceSectionTitle: 'Body',
        editorialTitle: 'Results and evidence',
        paragraphs: JSON.stringify([
          '. . 19 2.3 Examples of Atari games. . . . . . . . . . . . . 19 2.4 An example of world model architecture. . . . 20 2.5 Examples of frames in the Moving MNIST dataset. . . . 22',
        ]),
      },
      {
        id: 'clean-1',
        sourceSectionTitle: 'Method',
        editorialTitle: 'Method and structure',
        paragraphs: JSON.stringify([
          'The method block explains how the latent world model and planning policy are trained together.',
        ]),
      },
    ],
  })

  assert.deepEqual(sections.map((section: { id: string }) => section.id), ['clean-1'])
})

test('reader drops topic placement utility sections from node articles', () => {
  const sections = alphaReaderTesting.getRenderablePaperSections({
    sections: [
      {
        id: 'placement-1',
        sourceSectionTitle: 'Topic placement',
        editorialTitle: 'Topic placement',
        paragraphs: JSON.stringify([
          'It is currently grouped into 2 node(s): DeepDriving: Learning Affordance for Direct Perception in Autonomous Driving · Learning by Cheating.',
        ]),
      },
      {
        id: 'clean-1',
        sourceSectionTitle: 'Method',
        editorialTitle: 'Method',
        paragraphs: JSON.stringify([
          'The planner supervision block teaches the policy to recover from trajectory drift under closed-loop control.',
        ]),
      },
    ],
  })

  assert.deepEqual(sections.map((section: { id: string }) => section.id), ['clean-1'])
})

test('reader replaces generic body section titles with article-like labels', () => {
  const sections = alphaReaderTesting.getRenderablePaperSections({
    sections: [
      {
        id: 'method-1',
        sourceSectionTitle: 'Section 5',
        editorialTitle: 'Body section 5',
        paragraphs: JSON.stringify([
          'The encoder and decoder are trained jointly with the recurrent world model so the latent state can support planning.',
        ]),
      },
    ],
  })

  assert.equal(sections[0]?.renderTitle, 'Method and structure')
})

test('reader strips front matter and title shards from extracted paragraphs', () => {
  const cleanedAbstract = alphaReaderTesting.cleanExtractedParagraph(
    '1 End-to-end Autonomous Driving: Challenges and Frontiers Li Chen et al. Abstract—The autonomous driving community has witnessed a rapid growth in approaches that embrace an end-to-end algorithm framework.',
  )
  const cleanedTitleOnly = alphaReaderTesting.cleanExtractedParagraph(
    'Neural World Models for Computer Vision',
  )
  const cleanedDedication = alphaReaderTesting.cleanExtractedParagraph(
    'I would like to dedicate this thesis to my parents.',
  )

  assert.match(cleanedAbstract, /^The autonomous driving community/u)
  assert.equal(cleanedTitleOnly, '')
  assert.equal(cleanedDedication, '')
})

test('reader selects only the strongest evidence blocks for the article flow', () => {
  const selected = alphaReaderTesting.selectArticleEvidence([
    {
      anchorId: 'figure:generic',
      type: 'figure',
      route: '/node/node-a?evidence=figure%3Ageneric',
      title: 'Figure 1',
      label: 'Paper / Figure 1',
      quote: '图 1',
      content: '图 1',
      page: 1,
      sourcePaperId: 'paper-a',
      sourcePaperTitle: 'Paper A',
      imagePath: '/uploads/figure-1.png',
    },
    {
      anchorId: 'table:results',
      type: 'table',
      route: '/node/node-a?evidence=table%3Aresults',
      title: 'Table 2',
      label: 'Paper / Table 2',
      quote: 'Ablation results on WOMD',
      content: 'Ablation results on WOMD\n\nmAP | ADE | FDE\n0.42 | 1.49 | 3.66',
      page: 4,
      sourcePaperId: 'paper-a',
      sourcePaperTitle: 'Paper A',
    },
    {
      anchorId: 'formula:loss',
      type: 'formula',
      route: '/node/node-a?evidence=formula%3Aloss',
      title: 'Formula 1',
      label: 'Paper / Formula 1',
      quote: 'L = ||x - y||',
      content: 'L = ||x - y||',
      page: 5,
      sourcePaperId: 'paper-a',
      sourcePaperTitle: 'Paper A',
      formulaLatex: 'L = ||x - y||',
    },
  ])

  assert.deepEqual(
    selected.map((item) => item.anchorId),
    ['formula:loss', 'table:results'],
  )
})

test('reader skips generic visual noise when selecting article evidence', () => {
  const selected = alphaReaderTesting.selectArticleEvidence([
    {
      anchorId: 'figure:generic',
      type: 'figure',
      route: '/node/node-a?evidence=figure%3Ageneric',
      title: 'Figure 1',
      label: 'Paper / Figure 1',
      quote: 'Figure 1',
      content: 'Figure 1',
      page: 1,
      sourcePaperId: 'paper-a',
      sourcePaperTitle: 'Paper A',
      imagePath: '/uploads/figure-1.png',
    },
    {
      anchorId: 'formula:noise',
      type: 'formula',
      route: '/node/node-a?evidence=formula%3Anoise',
      title: 'Formula 1',
      label: 'Paper / Formula 1',
      quote: '#',
      content: '#',
      page: 2,
      sourcePaperId: 'paper-a',
      sourcePaperTitle: 'Paper A',
      formulaLatex: '#',
    },
    {
      anchorId: 'table:results',
      type: 'table',
      route: '/node/node-a?evidence=table%3Aresults',
      title: 'Table 2',
      label: 'Paper / Table 2',
      quote: 'Closed-loop results',
      content: 'Closed-loop results\n\nmAP | ADE | FDE\n0.42 | 1.49 | 3.66',
      page: 4,
      sourcePaperId: 'paper-a',
      sourcePaperTitle: 'Paper A',
    },
  ])

  assert.deepEqual(selected.map((item) => item.anchorId), ['table:results'])
})

test('paper route anchors onto node reading surfaces when node context exists', () => {
  assert.equal(
    alphaReaderTesting.paperRoute({
      paperId: 'paper-node',
      nodeId: 'node-1',
    }),
    '/node/node-1?anchor=paper%3Apaper-node',
  )

  assert.equal(
    alphaReaderTesting.paperRoute({
      paperId: 'paper-node',
      nodeId: 'node-1',
      evidenceId: 'figure:1',
    }),
    '/node/node-1?evidence=figure%3A1',
  )
})

test('paper route anchors onto topic reading surfaces when only topic context exists', () => {
  assert.equal(
    alphaReaderTesting.paperRoute({
      paperId: 'paper-topic',
      topicId: 'topic-1',
    }),
    '/topic/topic-1?anchor=paper%3Apaper-topic',
  )

  assert.equal(
    alphaReaderTesting.paperRoute({
      paperId: 'paper-topic',
      topicId: 'topic-1',
      evidenceId: 'table:2',
    }),
    '/topic/topic-1?evidence=table%3A2',
  )
})

test('paper route no longer fabricates node routes from paper ids without route context', () => {
  assert.equal(
    alphaReaderTesting.paperRoute({
      paperId: 'paper-orphan',
    }),
    '/',
  )

  assert.equal(
    alphaReaderTesting.paperRoute({
      paperId: 'paper-orphan',
      evidenceId: 'figure:missing',
    }),
    '/',
  )
})

async function createStageScopedReaderFixture(): Promise<ReaderFixture> {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '阶段阅读夹具主题',
      nameEn: 'Stage Scoped Reader Fixture',
      language: 'zh',
      status: 'active',
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
      updatedAt: new Date(),
    },
  })

  const [paperJanPrimary, paperJanSupport, paperMarDrift] = await Promise.all([
    prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: 'Primary Driving World Model',
        titleZh: '主线驾驶世界模型',
        titleEn: 'Primary Driving World Model',
        authors: JSON.stringify(['Codex Test']),
        published: new Date('2025-01-10T00:00:00.000Z'),
        summary: 'Primary stage paper.',
        explanation: 'Primary stage paper.',
        arxivUrl: 'https://arxiv.org/abs/2501.00001',
        pdfUrl: 'https://arxiv.org/pdf/2501.00001.pdf',
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(['world model', 'planning']),
        status: 'candidate',
        updatedAt: new Date(),
      },
    }),
    prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: 'Support Driving Planner',
        titleZh: '辅助驾驶规划器',
        titleEn: 'Support Driving Planner',
        authors: JSON.stringify(['Codex Test']),
        published: new Date('2025-01-22T00:00:00.000Z'),
        summary: 'Support stage paper.',
        explanation: 'Support stage paper.',
        arxivUrl: 'https://arxiv.org/abs/2501.00002',
        pdfUrl: 'https://arxiv.org/pdf/2501.00002.pdf',
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(['planner', 'language action']),
        status: 'candidate',
        updatedAt: new Date(),
      },
    }),
    prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: 'Late Driving Drift Paper',
        titleZh: '跨阶段漂移论文',
        titleEn: 'Late Driving Drift Paper',
        authors: JSON.stringify(['Codex Test']),
        published: new Date('2025-03-03T00:00:00.000Z'),
        summary: 'Out-of-stage paper that should be filtered away.',
        explanation: 'Out-of-stage paper that should be filtered away.',
        arxivUrl: 'https://arxiv.org/abs/2503.00003',
        pdfUrl: 'https://arxiv.org/pdf/2503.00003.pdf',
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(['world model', 'late drift']),
        status: 'candidate',
        updatedAt: new Date(),
      },
    }),
  ])

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '语言条件规划接口',
      nodeSubtitle: 'Language-conditioned planning interface',
      nodeSummary: 'Collects papers that belong to the same temporal stage bucket.',
      nodeExplanation: 'Used to validate stage-scoped node reading artifacts.',
      primaryPaperId: paperJanPrimary.id,
      status: 'canonical',
      provisional: false,
      createdAt: new Date('2025-01-15T00:00:00.000Z'),
      updatedAt: new Date('2025-01-25T00:00:00.000Z'),
    },
  })

  await prisma.node_papers.createMany({
    data: [
      { id: crypto.randomUUID(), nodeId: node.id, paperId: paperJanPrimary.id, order: 1 },
      { id: crypto.randomUUID(), nodeId: node.id, paperId: paperJanSupport.id, order: 2 },
      { id: crypto.randomUUID(), nodeId: node.id, paperId: paperMarDrift.id, order: 3 },
    ],
  })

  for (const [index, paper] of [paperJanPrimary, paperJanSupport].entries()) {
    await prisma.paper_sections.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          paperId: paper.id,
          sourceSectionTitle: 'Introduction',
          editorialTitle: `Intro ${index + 1}`,
          paragraphs: JSON.stringify([
            `${paper.title} frames the stage problem.`,
            `${paper.title} contributes directly to the node narrative.`,
          ]),
          order: 1,
        },
        {
          id: crypto.randomUUID(),
          paperId: paper.id,
          sourceSectionTitle: 'Method',
          editorialTitle: `Method ${index + 1}`,
          paragraphs: JSON.stringify([
            `${paper.title} describes the core method.`,
          ]),
          order: 2,
        },
      ],
    })

    await prisma.figures.create({
      data: {
        id: crypto.randomUUID(),
        paperId: paper.id,
        number: 1,
        caption: `${paper.title} figure`,
        page: 1,
        imagePath: `/uploads/${paper.id}-figure-1.png`,
      },
    })

    await prisma.tables.create({
      data: {
        id: crypto.randomUUID(),
        paperId: paper.id,
        number: 1,
        caption: `${paper.title} table`,
        page: 2,
        headers: JSON.stringify(['Metric', 'Value']),
        rows: JSON.stringify([['Score', `${90 + index}`]]),
        rawText: `${paper.title} table raw text`,
      },
    })

    await prisma.formulas.create({
      data: {
        id: crypto.randomUUID(),
        paperId: paper.id,
        number: `${index + 1}`,
        latex: `x_${index + 1}=y_${index + 1}+1`,
        rawText: `${paper.title} formula`,
        page: 3,
      },
    })
  }

  return {
    topicId: topic.id,
    nodeId: node.id,
    primaryPaperId: paperJanPrimary.id,
    stagePaperIds: [paperJanPrimary.id, paperJanSupport.id],
    outOfStagePaperId: paperMarDrift.id,
  }
}

async function cleanupReaderFixture(fixture: ReaderFixture) {
  await prisma.system_configs.deleteMany({
    where: {
      OR: [
        { key: { startsWith: `topic:${fixture.topicId}:` } },
        { key: { startsWith: `topic-stage-config:v1:${fixture.topicId}` } },
        { key: { startsWith: `topic-research-world:v1:${fixture.topicId}` } },
        { key: { startsWith: `topic:session-memory:v1:${fixture.topicId}` } },
        { key: { startsWith: `topic:guidance-ledger:v1:${fixture.topicId}` } },
        { key: { startsWith: `generation-memory:v1:${fixture.topicId}` } },
        { key: { startsWith: `generation-judgments:v1:${fixture.topicId}` } },
        { key: { startsWith: `generation-artifact-index:v1:${fixture.topicId}` } },
        { key: { startsWith: `alpha:topic-artifact:${fixture.topicId}:` } },
        { key: { startsWith: `alpha:reader-artifact:node:${fixture.nodeId}` } },
        { key: { startsWith: `alpha:reader-artifact:paper:${fixture.primaryPaperId}` } },
        ...fixture.stagePaperIds
          .filter((paperId) => paperId !== fixture.primaryPaperId)
          .map((paperId) => ({ key: { startsWith: `alpha:reader-artifact:paper:${paperId}` } })),
        { key: { startsWith: `alpha:reader-artifact:paper:${fixture.outOfStagePaperId}` } },
      ],
    },
  })

  await prisma.topics.delete({
    where: { id: fixture.topicId },
  })
}

test('reader artifact fingerprints change when research pipeline state changes', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '指纹测试主题',
      nameEn: 'Fingerprint Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
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
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: '连续研究节点',
      nodeSubtitle: 'Continuity node',
      nodeSummary: '用于验证研究流水线上下文会进入 reader fingerprint。',
      nodeExplanation: 'If the research pipeline changes, cached reader artifacts should invalidate.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
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

    await prisma.system_configs.upsert({
      where: { key: `topic:${topic.id}:research-pipeline` },
      update: {
        value: JSON.stringify(pipelinePayload),
        updatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        key: `topic:${topic.id}:research-pipeline`,
        value: JSON.stringify(pipelinePayload),
        updatedAt: new Date(),
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
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [`topic:${topic.id}:research-pipeline`],
        },
      },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('alpha reader flags stale node narratives that claim the wrong paper count or leak heuristic filler', () => {
  assert.equal(
    alphaReaderTesting.looksLikeStaleNodeNarrative(
      '本节点六篇论文横跨2023年5月至2025年2月，见证了系统落地的三级跳。',
      1,
    ),
    true,
  )

  assert.equal(
    alphaReaderTesting.looksLikeStaleNodeNarrative(
      'Heuristic fit from stage-aligned query overlap: autonomous driving world model.',
      1,
    ),
    true,
  )

  assert.equal(
    alphaReaderTesting.looksLikeStaleNodeNarrative(
      '作为时间线起点，它又自然通向 2023年8月 的 UniWorld 和 2023年11月 的 Copilot4D。',
      1,
    ),
    true,
  )

  assert.equal(
    alphaReaderTesting.looksLikeStaleNodeNarrative(
      '当前阶段的「占用式 VLA 世界模型」节点只纳入《OccLLaMA》这一篇论文，因此它首先是一篇单篇深读入口。',
      1,
    ),
    false,
  )
})

test('alpha reader builds a single-paper node seed instead of pretending a cross-stage multi-paper synthesis', () => {
  const seed = alphaReaderTesting.buildNodeNarrativeSeed({
    node: {
      nodeLabel: 'VLA 世界模型的隐空间统一',
    },
    papers: [
      {
        title: 'DriveWorld-VLA: Unified Latent-Space World Modeling with Vision-Language-Action for Autonomous Driving',
        titleZh: null,
        summary: 'This paper unifies vision, language, and action in a shared latent world model for autonomous driving.',
        figures: [],
        tables: [],
        formulas: [],
        sections: [],
        published: new Date('2026-02-06T00:00:00.000Z'),
      },
    ],
  })

  assert.match(seed.summary, /只纳入/u)
  assert.doesNotMatch(seed.summary, /六篇论文|横跨/u)
  assert.match(seed.explanation, /原文/u)
})

test('reader view models expose temporal stage labels for adjustable windows', async () => {
  const fixture = await createStageScopedReaderFixture()

  try {
    const [paperViewModel, nodeViewModel] = await Promise.all([
      alphaReaderTesting.buildQuickPaperViewModelForTest(fixture.primaryPaperId, 3),
      alphaReaderTesting.buildQuickNodeViewModelForTest(fixture.nodeId, 3),
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
    const paperBreakBlock = nodeViewModel.article.flow.find(
      (block) => block.type === 'paper-break' && 'paperId' in block && block.paperId === fixture.primaryPaperId,
    )
    assert.equal(
      paperBreakBlock && 'originalUrl' in paperBreakBlock ? typeof paperBreakBlock.originalUrl : undefined,
      'string',
    )
  } finally {
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel persists a quick reader artifact when the requested stage window matches topic cadence', async () => {
  const fixture = await createStageScopedReaderFixture()

  try {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          startsWith: `alpha:reader-artifact:node:${fixture.nodeId}`,
        },
      },
    })

    const hydratedViewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
    })
    const cachedRecord = await prisma.system_configs.findUnique({
      where: { key: `alpha:reader-artifact:node:${fixture.nodeId}` },
    })

    assert.ok(cachedRecord)
    assert.equal(hydratedViewModel.stageWindowMonths, 1)
    assert.equal(hydratedViewModel.stageLabel, '2025.01')
    assert.match(cachedRecord?.value ?? '', /"fingerprint":"quick:/u)
  } finally {
    await cleanupReaderFixture(fixture)
  }
})

test('node view models keep only papers that belong to the same temporal stage bucket', async () => {
  const fixture = await createStageScopedReaderFixture()

  try {
    const nodeRecord = await prisma.research_nodes.findUnique({
      where: { id: fixture.nodeId },
      select: {
        id: true,
        topicId: true,
        primaryPaperId: true,
        updatedAt: true,
        createdAt: true,
        node_papers: {
          select: {
            paperId: true,
          },
        },
      },
    })

    assert.ok(nodeRecord)

    const topic = await prisma.topics.findUnique({
      where: { id: nodeRecord.topicId },
      select: {
        createdAt: true,
        papers: {
          select: {
            id: true,
            published: true,
          },
        },
        research_nodes: {
          select: {
            id: true,
            primaryPaperId: true,
            updatedAt: true,
            createdAt: true,
            node_papers: {
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
      nodes: topic.research_nodes,
      windowMonths: 1,
      fallbackDate: topic.createdAt,
    })
    const nodeAssignment = stageBuckets.nodeAssignments.get(nodeRecord.id)
    assert.ok(nodeAssignment)

    const viewModel = await alphaReaderTesting.buildQuickNodeViewModelForTest(nodeRecord.id, 1)
    const paperBreakIds = viewModel.article.flow
      .filter((block) => block.type === 'paper-break')
      .map((block) => block.paperId)

    assert.ok(viewModel.paperRoles.length > 0)
    assert.deepEqual(
      paperBreakIds.sort(),
      viewModel.paperRoles.map((paper) => paper.paperId).sort(),
    )
    assert.deepEqual(
      viewModel.paperRoles.map((paper) => paper.paperId).sort(),
      fixture.stagePaperIds.slice().sort(),
    )
    assert.equal(
      viewModel.paperRoles.some((paper) => paper.paperId === fixture.outOfStagePaperId),
      false,
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
  } finally {
    await cleanupReaderFixture(fixture)
  }
})

test('node view models keep section-level text blocks and all renderable evidence for stage-scoped papers', async () => {
  const fixture = await createStageScopedReaderFixture()

  try {
    const nodeRecord = await prisma.research_nodes.findUnique({
      where: { id: fixture.nodeId },
      select: {
        id: true,
        topicId: true,
      },
    })

    assert.ok(nodeRecord)

    const topicPapers = await prisma.papers.findMany({
      where: { topicId: nodeRecord.topicId },
      include: {
        paper_sections: { orderBy: { order: 'asc' } },
        figures: true,
        tables: true,
        formulas: true,
      },
    })

    const viewModel = await alphaReaderTesting.buildQuickNodeViewModelForTest(nodeRecord.id, 1)
    const allowedPaperIds = new Set(viewModel.paperRoles.map((paper) => paper.paperId))
    const visiblePapers = topicPapers.filter((paper) => allowedPaperIds.has(paper.id))

    const flowSectionAnchors = new Set(
      viewModel.article.flow
        .filter((block) => block.type === 'text' && 'paperId' in block && block.paperId)
        .map((block) => 'anchorId' in block && typeof block.anchorId === 'string' ? block.anchorId : null)
        .filter((anchorId): anchorId is string => anchorId !== null && anchorId.startsWith('section:')),
    )
    const flowEvidenceAnchors = new Set(
      viewModel.article.flow
        .filter(
          (block) =>
            block.type === 'figure' ||
            block.type === 'table' ||
            block.type === 'formula',
        )
        .map((block) => 'evidence' in block ? block.evidence.anchorId : null)
        .filter((anchorId): anchorId is string => anchorId !== null),
    )

    for (const paper of visiblePapers) {
      for (const section of paper.paper_sections) {
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
  } finally {
    await cleanupReaderFixture(fixture)
  }
})

test('node view models can include sibling-stage papers when stage-bounded recall expands', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '同阶段节点隔离主题',
      nameEn: 'Sibling Stage Isolation Topic',
      language: 'zh',
      status: 'active',
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
      updatedAt: new Date(),
    },
  })

  const [paperA, paperB] = await Promise.all([
    prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: 'Latent Planning World Model',
        titleZh: '潜空间规划世界模型',
        titleEn: 'Latent Planning World Model',
        authors: JSON.stringify(['Codex Test']),
        published: new Date('2025-01-08T00:00:00.000Z'),
        summary: 'A node-local paper about latent planning for autonomous driving.',
        explanation: 'Focuses on node-local latent planning evidence.',
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(['world model', 'planning']),
        status: 'candidate',
        updatedAt: new Date(),
      },
    }),
    prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        title: 'Occupancy World Model Survey',
        titleZh: '占用世界模型综述',
        titleEn: 'Occupancy World Model Survey',
        authors: JSON.stringify(['Codex Test']),
        published: new Date('2025-01-18T00:00:00.000Z'),
        summary: 'Another stage-local paper that belongs to a sibling node.',
        explanation: 'Focuses on occupancy evidence and should stay in the sibling node.',
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(['world model', 'occupancy']),
        status: 'candidate',
        updatedAt: new Date(),
      },
    }),
  ])

  const [nodeA, nodeB] = await Promise.all([
    prisma.research_nodes.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        stageIndex: 1,
        nodeLabel: '潜空间规划',
        nodeSubtitle: 'Latent planning',
        nodeSummary: 'Only the node-linked paper should stay here.',
        nodeExplanation: 'The reader article must not absorb sibling stage papers.',
        primaryPaperId: paperA.id,
        status: 'canonical',
        provisional: false,
        updatedAt: new Date(),
      },
    }),
    prisma.research_nodes.create({
      data: {
        id: crypto.randomUUID(),
        topicId: topic.id,
        stageIndex: 1,
        nodeLabel: '占用建模',
        nodeSubtitle: 'Occupancy modeling',
        nodeSummary: 'Sibling node for the same stage.',
        nodeExplanation: 'Keeps its own paper.',
        primaryPaperId: paperB.id,
        status: 'canonical',
        provisional: false,
        updatedAt: new Date(),
      },
    }),
  ])

  await prisma.node_papers.createMany({
    data: [
      { id: crypto.randomUUID(), nodeId: nodeA.id, paperId: paperA.id, order: 1 },
      { id: crypto.randomUUID(), nodeId: nodeB.id, paperId: paperB.id, order: 1 },
    ],
  })

  try {
    const viewModel = await alphaReaderTesting.buildQuickNodeViewModelForTest(nodeA.id, 1)

    assert.deepEqual(
      viewModel.paperRoles.map((paper) => paper.paperId).sort(),
      [paperA.id, paperB.id].sort(),
    )
    assert.equal(viewModel.paperRoles.some((paper) => paper.paperId === paperB.id), true)
    assert.equal(
      viewModel.article.flow.some(
        (block) => block.type === 'paper-break' && block.paperId === paperB.id,
      ),
      true,
    )
  } finally {
    await prisma.system_configs.deleteMany({
      where: {
        OR: [
          { key: { startsWith: `topic:${topic.id}:` } },
          { key: { startsWith: `topic-stage-config:v1:${topic.id}` } },
          { key: { startsWith: `alpha:topic-artifact:${topic.id}:` } },
          { key: { startsWith: `alpha:reader-artifact:node:${nodeA.id}` } },
          { key: { startsWith: `alpha:reader-artifact:node:${nodeB.id}` } },
          { key: { startsWith: `alpha:reader-artifact:paper:${paperA.id}` } },
          { key: { startsWith: `alpha:reader-artifact:paper:${paperB.id}` } },
        ],
      },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact fingerprints change when topic cognitive memory changes through research reports', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '认知记忆主题',
      nameEn: 'Cognitive Memory Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
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
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '认知记忆节点',
      nodeSubtitle: 'Cognitive node',
      nodeSummary: '用于验证 research report 进入 reader fingerprint。',
      nodeExplanation: 'If the report changes the topic-level understanding, reader artifacts should invalidate.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
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
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [`topic:${topic.id}:research-report`],
        },
      },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact fingerprints change when topic guidance directives are recorded', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '指导失效主题',
      nameEn: 'Guidance Invalidation Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
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
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 2,
      nodeLabel: '指导敏感节点',
      nodeSubtitle: 'Guidance-sensitive node',
      nodeSummary: '用于验证聊天指导会影响 reader 指纹。',
      nodeExplanation: 'If sidebar guidance changes the topic direction, reader artifacts should rebuild.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
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
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [`topic:guidance-ledger:v1:${topic.id}`],
        },
      },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact orchestration persists pipeline state before publishing cached quick view models', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '研究编排主题',
      nameEn: 'Reader Orchestration Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
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
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '编排节点',
      nodeSubtitle: 'Orchestrated node',
      nodeSummary: '验证 reader artifact 的编排顺序。',
      nodeExplanation: 'The pipeline state must exist before cached node and paper articles are rebuilt.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
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
        prisma.system_configs.findUnique({
          where: { key: `topic:${topic.id}:research-pipeline` },
        }),
        prisma.system_configs.findUnique({
          where: { key: `alpha:reader-artifact:node:${node.id}` },
        }),
        prisma.system_configs.findUnique({
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
    await prisma.system_configs.deleteMany({
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
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('reader artifact orchestration can persist quick snapshots while keeping final rebuild pending', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '快速快照主题',
      nameEn: 'Quick Snapshot Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
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
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '快速快照节点',
      nodeSubtitle: 'Quick snapshot node',
      nodeSummary: '用于验证 quick mode 会先持久化可读快照。',
      nodeExplanation: 'The quick snapshot should be available immediately while the final fingerprint remains pending.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
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
      prisma.system_configs.findUnique({
        where: { key: `alpha:reader-artifact:node:${node.id}` },
      }),
      prisma.system_configs.findUnique({
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
    await prisma.system_configs.deleteMany({
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
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('node view models expand papers without native sections into multi-part fallback article blocks', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: 'Fallback Reader Topic',
      nameEn: 'Fallback Reader Topic',
      language: 'zh',
      status: 'active',
      createdAt: new Date('2025-04-01T00:00:00.000Z'),
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      title: 'Fallback Driving World Model',
      titleZh: 'Fallback Driving World Model',
      titleEn: 'Fallback Driving World Model',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-04-11T00:00:00.000Z'),
      summary: 'This paper introduces a driving world model for closed-loop planning.',
      explanation:
        'The paper connects world-model prediction, planning, and controllable action generation for autonomous driving.',
      arxivUrl: 'https://arxiv.org/abs/2504.00011',
      pdfUrl: 'https://arxiv.org/pdf/2504.00011.pdf',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['world model', 'planning']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: 'Fallback Node',
      nodeSubtitle: 'Fallback node',
      nodeSummary: 'Used to validate no-section paper fallbacks.',
      nodeExplanation: 'The node article should still expand this paper into a readable structure.',
      primaryPaperId: paper.id,
      status: 'canonical',
      provisional: false,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  await prisma.figures.create({
    data: {
      id: crypto.randomUUID(),
      paperId: paper.id,
      number: 1,
      caption: 'Fallback figure',
      page: 1,
      imagePath: '/uploads/fallback-figure-1.png',
    },
  })

  await prisma.formulas.create({
    data: {
      id: crypto.randomUUID(),
      paperId: paper.id,
      number: '1',
      latex: 'x_{t+1}=f(x_t, a_t)',
      rawText: 'x_{t+1}=f(x_t, a_t)',
      page: 2,
    },
  })

  try {
    const viewModel = await alphaReaderTesting.buildQuickNodeViewModelForTest(node.id, 1)
    const paperTextBlocks = viewModel.article.flow.filter(
      (block) => block.type === 'text' && 'paperId' in block && block.paperId === paper.id,
    )
    const evidenceBlocks = viewModel.article.flow.filter(
      (block) =>
        (block.type === 'figure' || block.type === 'table' || block.type === 'formula') &&
        'evidence' in block && block.evidence.sourcePaperId === paper.id,
    )

    assert.ok(paperTextBlocks.length >= 4, `expected multi-part fallback text blocks, got ${paperTextBlocks.length}`)
    assert.ok(
      paperTextBlocks.some((block) => 'title' in block && block.title && /问题|方法|证据|边界/u.test(block.title)),
      'expected fallback block titles to expose paper structure',
    )
    assert.ok(evidenceBlocks.length >= 2, `expected extracted evidence blocks, got ${evidenceBlocks.length}`)
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('node view models suppress category-like paper summaries and fall back to honest placeholders', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '低信号论文摘要主题',
      nameEn: 'Low Signal Summary Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      title: 'Low Signal Metadata Paper',
      titleZh: '低信号元数据论文',
      titleEn: 'Low Signal Metadata Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-04-11T00:00:00.000Z'),
      summary: 'Reinforcement Learning in Robotics',
      explanation: 'Heuristic fit from query overlap: autonomous driving world model.',
      arxivUrl: 'https://example.com/paper',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['robotics']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '低信号节点',
      nodeSubtitle: '检验弱摘要降级',
      nodeSummary: 'Node for low-signal summary fallback.',
      nodeExplanation: 'Should avoid pretending category labels are real paper prose.',
      primaryPaperId: paper.id,
      status: 'canonical',
      provisional: false,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const viewModel = await alphaReaderTesting.buildQuickNodeViewModelForTest(node.id, 1)
    const textBody = viewModel.article.flow
      .filter((block) => block.type === 'text')
      .flatMap((block) => block.body)
      .join(' ')

    assert.equal(textBody.includes('Reinforcement Learning in Robotics'), false)
    assert.equal(/可用摘要|题录与链接|回到原文/u.test(textBody), true)
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('node view models strip placeholder-question-mark narratives from paper and node copy', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '问号占位摘要主题',
      nameEn: 'Placeholder Summary Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      title: 'Placeholder Narrative Paper',
      titleZh: 'Placeholder Narrative Paper',
      titleEn: 'Placeholder Narrative Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-04-12T00:00:00.000Z'),
      summary: '????????????????????????',
      explanation: '????????????????????????',
      arxivUrl: 'https://example.com/placeholder-paper',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['placeholder']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '占位叙事节点',
      nodeSubtitle: 'Placeholder narrative node',
      nodeSummary: 'Used to verify placeholder narratives are removed from reader output.',
      nodeExplanation: 'The reader should replace question-mark placeholders with honest fallback prose.',
      primaryPaperId: paper.id,
      status: 'canonical',
      provisional: false,
      updatedAt: new Date(),
    },
  })

await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
      nodeId: node.id,
      paperId: paper.id,
      order: 1,
    },
  })

  try {
    const viewModel = await alphaReaderTesting.buildQuickNodeViewModelForTest(node.id, 1)
    const narrativeFields = [
      viewModel.standfirst,
      ...viewModel.paperRoles.flatMap((entry) => [entry.summary, entry.contribution]),
      ...viewModel.article.flow.flatMap((block) => {
        if (block.type === 'text' || block.type === 'closing') return block.body
        if (block.type === 'paper-break') return [block.contribution]
        if (block.type === 'comparison') return [block.summary, ...block.points.map((point) => point.detail)]
        if (block.type === 'critique') return [block.summary, ...block.bullets]
        return []
      }),
    ]
      .filter(Boolean)
      .join(' ')

    assert.equal(/\?{4,}/u.test(narrativeFields), false)
    assert.match(narrativeFields, /单篇深读入口|当前数据库还没有提取到图、表、公式|当前仅完成题录级整理/u)
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('getNodeViewModel returns enhanced article flow when enhanced mode is requested', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  const fixture = await createStageScopedReaderFixture()

  try {
    const viewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
      enhanced: true,
    })

    assert.ok(Array.isArray(viewModel.enhancedArticleFlow))
    assert.ok(viewModel.enhancedArticleFlow!.length > 0)
    assert.ok(
      viewModel.enhancedArticleFlow!.some((block) => block.type === 'paper-article'),
      'enhanced flow should include article-style paper blocks',
    )
    assert.ok(viewModel.coreJudgment?.content)
    assert.ok(viewModel.researchView, 'node view model should expose a structured research view payload')
    assert.ok(
      viewModel.researchView!.evidence.featuredAnchorIds.length >= 1,
      'research view should prioritize at least one featured evidence anchor',
    )
    assert.ok(
      viewModel.researchView!.evidence.featured.some((entry) => entry.type !== 'section'),
      'research view should prioritize renderable evidence payloads before section-only anchors',
    )
    assert.ok(
      viewModel.researchView!.evidence.paperBriefs.length >= 1,
      'research view should expose per-paper briefs for the node quick-grasp surface',
    )
    assert.ok(
      viewModel.researchView!.evidence.evidenceChains.length >= 1,
      'research view should expose evidence chains derived from enhanced article subsections',
    )
    assert.ok(
      viewModel.researchView!.evidence.coverage.renderableEvidenceCount >=
        viewModel.researchView!.evidence.coverage.figureCount +
          viewModel.researchView!.evidence.coverage.tableCount +
          viewModel.researchView!.evidence.coverage.formulaCount,
      'research view coverage should count the renderable evidence exposed to the node view',
    )
    assert.ok(
      viewModel.researchView!.methods.evolution.some((entry) => Boolean(entry.transitionType)),
      'research view should preserve transition metadata from enhanced paper-to-paper links',
    )
    const researchEvidence = [
      ...viewModel.researchView!.evidence.featured,
      ...viewModel.researchView!.evidence.supporting,
    ]
    assert.ok(
      researchEvidence.every((entry) => (entry.importance ?? 0) >= 0),
      'research view evidence should only expose contract-safe non-negative importance scores',
    )
    assert.equal(
      viewModel.researchView!.coreJudgment?.content,
      viewModel.coreJudgment?.content ?? null,
    )
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    await prisma.topics.delete({
      where: { id: fixture.topicId },
    })
  }
})

test('getNodeViewModel rebuilds enhanced node artifacts after cache cleanup without hitting slow provider calls', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  const originalComplete = omniGateway.complete
  let availabilityChecks = 0
  let completionCalls = 0

  omniGateway.hasAvailableModel = async () => {
    availabilityChecks += 1
    return true
  }
  omniGateway.complete = async () => {
    completionCalls += 1
    throw new Error('provider should not be called for grounded enhanced node rebuilds')
  }

  const fixture = await createStageScopedReaderFixture()
  const defaultArtifactKey = `alpha:reader-artifact:node:${fixture.nodeId}`
  const enhancedArtifactKey = `alpha:reader-artifact:node:enhanced:${fixture.nodeId}`

  try {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, enhancedArtifactKey],
        },
      },
    })

    const viewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
      enhanced: true,
    })

    assert.ok(Array.isArray(viewModel.enhancedArticleFlow))
    assert.ok(viewModel.enhancedArticleFlow!.length > 0)
    assert.equal(
      viewModel.enhancedArticleFlow!.filter((block) => block.type === 'paper-article').length,
      fixture.stagePaperIds.length,
    )
    assert.equal(availabilityChecks, 0)
    assert.equal(completionCalls, 0)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    omniGateway.complete = originalComplete
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, enhancedArtifactKey],
        },
      },
    })
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel rebuilds default node artifacts after cache cleanup without queueing slow provider calls', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  const originalComplete = omniGateway.complete
  let availabilityChecks = 0
  let completionCalls = 0

  omniGateway.hasAvailableModel = async () => {
    availabilityChecks += 1
    return true
  }
  omniGateway.complete = async () => {
    completionCalls += 1
    throw new Error('provider should not be called for default node cache hydration')
  }

  const fixture = await createStageScopedReaderFixture()
  const defaultArtifactKey = `alpha:reader-artifact:node:${fixture.nodeId}`
  const topicArtifactIndexKey = `generation-artifact-index:v1:${fixture.topicId}`

  try {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, topicArtifactIndexKey],
        },
      },
    })

    const viewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
    })

    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.ok(Array.isArray(viewModel.article.flow))
    assert.ok(viewModel.article.flow.length > 0)
    assert.equal(availabilityChecks, 0)
    assert.equal(completionCalls, 0)

    const artifactIndexRecord = await prisma.system_configs.findUnique({
      where: { key: topicArtifactIndexKey },
    })
    assert.equal(
      artifactIndexRecord,
      null,
      'quick default hydration should not block on topic artifact index writes',
    )
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    omniGateway.complete = originalComplete
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, topicArtifactIndexKey],
        },
      },
    })
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel falls back to a direct quick build when default artifact persistence stalls', async () => {
  const fixture = await createStageScopedReaderFixture()
  const originalUpsert = prisma.system_configs.upsert.bind(prisma.system_configs)

  prisma.system_configs.upsert = (async (args: Parameters<typeof prisma.system_configs.upsert>[0]) => {
    if (
      typeof args?.where === 'object' &&
      args?.where !== null &&
      'key' in args.where &&
      args.where.key === `alpha:reader-artifact:node:${fixture.nodeId}`
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2_500))
    }

    return originalUpsert(args)
  }) as unknown as typeof prisma.system_configs.upsert

  try {
    const started = Date.now()
    const viewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
    })
    const elapsedMs = Date.now() - started

    assert.ok(Array.isArray(viewModel.article.flow))
    assert.ok(viewModel.article.flow.length > 0)
    assert.ok(
      elapsedMs < 2_500,
      `default node view model should bypass stalled artifact persistence, got ${elapsedMs}ms`,
    )
  } finally {
    prisma.system_configs.upsert = originalUpsert as typeof prisma.system_configs.upsert
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel schedules a deferred default node rebuild after publishing a quick snapshot', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  const originalComplete = omniGateway.complete
  const originalAllowTestDeferred = process.env.TOPIC_ARTIFACT_ALLOW_TEST_DEFERRED
  let completionCalls = 0

  omniGateway.hasAvailableModel = async () => false
  omniGateway.complete = async () => {
    completionCalls += 1
    throw new Error('provider should not be called for deferred grounded rebuilds')
  }

  const fixture = await createStageScopedReaderFixture()
  const defaultArtifactKey = `alpha:reader-artifact:node:${fixture.nodeId}`
  const topicArtifactIndexKey = `generation-artifact-index:v1:${fixture.topicId}`

  try {
    process.env.TOPIC_ARTIFACT_ALLOW_TEST_DEFERRED = '1'

    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, topicArtifactIndexKey],
        },
      },
    })

    const initialViewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
    })

    assert.ok(Array.isArray(initialViewModel.article.flow))
    assert.ok(initialViewModel.article.flow.length > 0)

    const initialRecord = await prisma.system_configs.findUnique({
      where: { key: defaultArtifactKey },
    })
    assert.match(initialRecord?.value ?? '', /"fingerprint":"quick:/u)

    let healedRecord = await prisma.system_configs.findUnique({
      where: { key: defaultArtifactKey },
    })
    let artifactIndexRecord = await prisma.system_configs.findUnique({
      where: { key: topicArtifactIndexKey },
    })

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const healedValue = healedRecord?.value ?? ''
      if (!/"fingerprint":"quick:/u.test(healedValue) && artifactIndexRecord) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 400))
      ;[healedRecord, artifactIndexRecord] = await Promise.all([
        prisma.system_configs.findUnique({
          where: { key: defaultArtifactKey },
        }),
        prisma.system_configs.findUnique({
          where: { key: topicArtifactIndexKey },
        }),
      ])
    }

    assert.ok(healedRecord, 'default node artifact should still be persisted after deferred rebuild')
    assert.doesNotMatch(
      healedRecord?.value ?? '',
      /"fingerprint":"quick:/u,
      'deferred rebuild should replace the quick fingerprint with a stable artifact fingerprint',
    )
    assert.ok(
      artifactIndexRecord,
      'deferred rebuild should eventually publish the topic artifact index entry',
    )
    assert.equal(completionCalls, 0)
  } finally {
    if (originalAllowTestDeferred == null) {
      delete process.env.TOPIC_ARTIFACT_ALLOW_TEST_DEFERRED
    } else {
      process.env.TOPIC_ARTIFACT_ALLOW_TEST_DEFERRED = originalAllowTestDeferred
    }
    omniGateway.hasAvailableModel = originalHasAvailableModel
    omniGateway.complete = originalComplete
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, topicArtifactIndexKey],
        },
      },
    })
    await cleanupReaderFixture(fixture)
  }
})

test('enhanced node reader artifacts use a dedicated cache record that survives default rebuilds', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  const fixture = await createStageScopedReaderFixture()
  const defaultArtifactKey = `alpha:reader-artifact:node:${fixture.nodeId}`
  const enhancedArtifactKey = `alpha:reader-artifact:node:enhanced:${fixture.nodeId}`

  try {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, enhancedArtifactKey],
        },
      },
    })

    const firstEnhancedViewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
      enhanced: true,
    })

    assert.ok(Array.isArray(firstEnhancedViewModel.enhancedArticleFlow))
    assert.ok(firstEnhancedViewModel.enhancedArticleFlow!.length > 0)

    const firstEnhancedRecord = await prisma.system_configs.findUnique({
      where: { key: enhancedArtifactKey },
    })
    assert.ok(firstEnhancedRecord, 'enhanced node cache should persist to its own record')

    await rebuildNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
    })

    const defaultRecord = await prisma.system_configs.findUnique({
      where: { key: defaultArtifactKey },
    })
    assert.ok(defaultRecord, 'default node cache should still persist separately')
    const enhancedRecordAfterDefaultRebuild = await prisma.system_configs.findUnique({
      where: { key: enhancedArtifactKey },
    })
    assert.equal(
      enhancedRecordAfterDefaultRebuild?.value,
      firstEnhancedRecord?.value,
      'default node rebuilds should not overwrite the enhanced node cache payload',
    )

    const secondEnhancedViewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
      enhanced: true,
    })
    assert.ok(Array.isArray(secondEnhancedViewModel.enhancedArticleFlow))
    assert.ok(secondEnhancedViewModel.enhancedArticleFlow!.length > 0)

    const secondEnhancedRecord = await prisma.system_configs.findUnique({
      where: { key: enhancedArtifactKey },
    })
    assert.ok(secondEnhancedRecord, 'enhanced node cache should remain available after default rebuilds')
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [defaultArtifactKey, enhancedArtifactKey],
        },
      },
    })
    await cleanupReaderFixture(fixture)
  }
})

test('full artifact warming can prebuild enhanced node articles for long-running research topics', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  const fixture = await createStageScopedReaderFixture()
  const enhancedArtifactKey = `alpha:reader-artifact:node:enhanced:${fixture.nodeId}`

  try {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [enhancedArtifactKey],
        },
      },
    })
    const nodeBeforeWarm = await prisma.research_nodes.update({
      where: { id: fixture.nodeId },
      data: {
        fullArticleFlow: null,
        editorialPromptHash: null,
      },
      select: {
        updatedAt: true,
      },
    })

    const warmed = await warmTopicReaderArtifacts(fixture.topicId, {
      limit: 1,
      mode: 'full',
      includeEnhancedNodes: true,
      entityIds: {
        nodeIds: [fixture.nodeId],
        paperIds: [],
      },
    })

    assert.equal(warmed.warmedNodeCount, 1)
    assert.equal(warmed.warmedEnhancedNodeCount, 1)
    assert.equal(warmed.warmedPaperCount, 0)

    const enhancedRecord = await prisma.system_configs.findUnique({
      where: { key: enhancedArtifactKey },
    })
    assert.ok(enhancedRecord, 'full warming should persist an enhanced node cache record')

    const persistedNode = await prisma.research_nodes.findUnique({
      where: { id: fixture.nodeId },
      select: {
        fullArticleFlow: true,
        updatedAt: true,
      },
    })
    assert.ok(
      persistedNode?.fullArticleFlow && persistedNode.fullArticleFlow.length > 0,
      'full warming should also persist fullArticleFlow for the node',
    )
    assert.ok(
      (persistedNode?.updatedAt?.getTime() ?? 0) >= nodeBeforeWarm.updatedAt.getTime(),
      'full warming should refresh the node updatedAt when enhanced article flow is persisted',
    )
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [enhancedArtifactKey],
        },
      },
    })
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel rebuilds stale enhanced node artifacts when cached evidence drifts outside contract', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  const fixture = await createStageScopedReaderFixture()
  const enhancedArtifactKey = `alpha:reader-artifact:node:enhanced:${fixture.nodeId}`

  try {
    const firstViewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
      enhanced: true,
    })
    assert.ok(Array.isArray(firstViewModel.enhancedArticleFlow))
    assert.ok(firstViewModel.enhancedArticleFlow!.length > 0)

    const firstRecord = await prisma.system_configs.findUnique({
      where: { key: enhancedArtifactKey },
    })
    assert.ok(firstRecord, 'enhanced node cache should exist before we simulate drift')

    const corruptedRecord = JSON.parse(firstRecord!.value) as {
      kind: string
      entityId: string
      fingerprint: string
      updatedAt: string
      viewModel: {
        researchView?: {
          evidence?: {
            supporting?: Array<{ importance?: number | null }>
          }
        }
      }
    }

    if (!corruptedRecord.viewModel.researchView?.evidence?.supporting?.[0]) {
      throw new Error('Fixture must expose supporting research evidence before cache drift simulation.')
    }

    corruptedRecord.viewModel.researchView.evidence.supporting[0].importance = -1

    await prisma.system_configs.update({
      where: { key: enhancedArtifactKey },
      data: { value: JSON.stringify(corruptedRecord), updatedAt: new Date() },
    })

    const healedViewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 1,
      enhanced: true,
    })
    const healedEvidence = [
      ...healedViewModel.researchView!.evidence.featured,
      ...healedViewModel.researchView!.evidence.supporting,
    ]
    assert.ok(
      healedEvidence.every((entry) => (entry.importance ?? 0) >= 0),
      'stale enhanced node cache should be rebuilt before invalid evidence reaches callers',
    )

    const healedRecord = await prisma.system_configs.findUnique({
      where: { key: enhancedArtifactKey },
    })
    assert.ok(healedRecord, 'healed enhanced node cache should remain persisted')
    assert.notEqual(
      healedRecord?.value,
      JSON.stringify(corruptedRecord),
      'contract-invalid enhanced node cache should be replaced with a rebuilt payload',
    )
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    await prisma.system_configs.deleteMany({
      where: {
        key: enhancedArtifactKey,
      },
    })
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel keeps the full stage article flow when the configured stage window spans the node coverage', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  const fixture = await createStageScopedReaderFixture()

  try {
    await saveTopicStageConfig(fixture.topicId, 3)

    const viewModel = await getNodeViewModel(fixture.nodeId, {
      enhanced: true,
    })

    const enhancedFlow = Array.isArray(viewModel.enhancedArticleFlow)
      ? viewModel.enhancedArticleFlow
      : []
    const paperArticles = enhancedFlow.filter((block) => block.type === 'paper-article')
    const transitions = enhancedFlow.filter((block) => block.type === 'paper-transition')

    assert.equal(viewModel.stageWindowMonths, 3)
    assert.equal(viewModel.stageLabel, '2025.01-2025.03')
    assert.deepEqual(
      viewModel.paperRoles.map((paper) => paper.paperId).sort(),
      [...fixture.stagePaperIds, fixture.outOfStagePaperId].sort(),
    )
    assert.deepEqual(
      paperArticles.map((block) => block.paperId).sort(),
      [...fixture.stagePaperIds, fixture.outOfStagePaperId].sort(),
    )
    assert.equal(transitions.length, 2)
    assert.ok(
      enhancedFlow.some((block) => block.type === 'synthesis'),
      'enhanced flow should include a synthesis block when multiple papers remain in-stage',
    )
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel expands stage-bounded recall when the requested window is wider than configured cadence', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  omniGateway.hasAvailableModel = async () => false

  const fixture = await createStageScopedReaderFixture()

  try {
    await saveTopicStageConfig(fixture.topicId, 1)

    const viewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 3,
      enhanced: true,
    })

    const enhancedFlow = Array.isArray(viewModel.enhancedArticleFlow)
      ? viewModel.enhancedArticleFlow
      : []
    const paperArticles = enhancedFlow.filter((block) => block.type === 'paper-article')

    assert.equal(viewModel.stageWindowMonths, 3)
    assert.equal(viewModel.stageLabel, '2025.01-2025.03')
    assert.deepEqual(
      viewModel.paperRoles.map((paper) => paper.paperId).sort(),
      [...fixture.stagePaperIds, fixture.outOfStagePaperId].sort(),
    )
    assert.deepEqual(
      paperArticles.map((block) => block.paperId).sort(),
      [...fixture.stagePaperIds, fixture.outOfStagePaperId].sort(),
    )
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    await cleanupReaderFixture(fixture)
  }
})

test('getNodeViewModel uses the quick grounded path for default widened stage windows', async () => {
  const originalHasAvailableModel = omniGateway.hasAvailableModel
  const originalComplete = omniGateway.complete
  let availabilityChecks = 0
  let completionCalls = 0

  omniGateway.hasAvailableModel = async () => {
    availabilityChecks += 1
    return true
  }
  omniGateway.complete = async () => {
    completionCalls += 1
    throw new Error('provider should not be called for widened default stage windows')
  }

  const fixture = await createStageScopedReaderFixture()

  try {
    await saveTopicStageConfig(fixture.topicId, 1)

    const viewModel = await getNodeViewModel(fixture.nodeId, {
      stageWindowMonths: 3,
    })

    assert.equal(viewModel.stageWindowMonths, 3)
    assert.equal(viewModel.stageLabel, '2025.01-2025.03')
    assert.deepEqual(
      viewModel.paperRoles.map((paper) => paper.paperId).sort(),
      [...fixture.stagePaperIds, fixture.outOfStagePaperId].sort(),
    )
    assert.equal(availabilityChecks, 0)
    assert.equal(completionCalls, 0)
  } finally {
    omniGateway.hasAvailableModel = originalHasAvailableModel
    omniGateway.complete = originalComplete
    await cleanupReaderFixture(fixture)
  }
})

test('configured canonical merge nodes keep all explicitly linked papers and strip placement noise', async () => {
  await ensureConfiguredTopicMaterialized('autonomous-driving')

  const viewModel = await getNodeViewModel('autonomous-driving:stage-2:1912.12294', {
    stageWindowMonths: 3,
    enhanced: true,
  })

  const expectedPaperIds = ['1511.03791', '1710.02410', '1912.12294'].sort()
  const referencePaperIds = Array.isArray(viewModel.references)
    ? viewModel.references.map((paper) => paper.paperId).sort()
    : []
  const articleText = viewModel.article.flow
    .flatMap((block) => {
      if (block.type === 'text' || block.type === 'closing') return [block.title, ...block.body]
      if (block.type === 'paper-break') return [block.title, block.contribution]
      if (block.type === 'comparison') return [block.title, block.summary, ...block.points.map((point) => point.detail)]
      if (block.type === 'critique') return [block.title, block.summary, ...block.bullets]
      return []
    })
    .join(' ')

  assert.equal(viewModel.isMergeNode, true)
  assert.equal(viewModel.stats.paperCount, 3)
  assert.deepEqual(
    viewModel.paperRoles.map((paper) => paper.paperId).sort(),
    expectedPaperIds,
  )
  assert.deepEqual(
    referencePaperIds,
    expectedPaperIds,
  )
  assert.deepEqual(
    viewModel.article.flow
      .filter((block) => block.type === 'paper-break')
      .map((block) => block.paperId)
      .sort(),
    expectedPaperIds,
  )
  assert.equal(
    viewModel.evidence.some(
      (item) =>
        item.title === 'Topic placement' || /grouped into \d+ node\(s\)/iu.test(item.content),
    ),
    false,
  )
  assert.equal(/grouped into \d+ node\(s\)/iu.test(articleText), false)
  assert.doesNotMatch(
    JSON.stringify(viewModel.enhancedArticleFlow ?? []),
    /单篇深读入口|当前阶段的「Learning by Cheating」节点只纳入《DeepDriving/u,
  )
})

test('reader artifact fingerprints change when the active model configuration changes', async () => {
  const previousConfig = await getResolvedUserModelConfig()
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '模型配置指纹主题',
      nameEn: 'Model Fingerprint Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
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
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '模型配置敏感节点',
      nodeSubtitle: 'Model-aware node',
      nodeSummary: '验证当前 reader artifact 是否会随着模型配置变化而失效。',
      nodeExplanation: 'If the configured model changes, cached node and paper articles should rebuild.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
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

    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [
            `alpha:reader-artifact:node:${node.id}`,
            `alpha:reader-artifact:paper:${paper.id}`,
          ],
        },
      },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})
