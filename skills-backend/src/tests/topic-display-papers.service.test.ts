import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../services/topics/alpha-topic'

function createPaper(
  id: string,
  publishedAt: string,
  overrides?: Partial<{
    title: string
    titleZh: string
    titleEn: string
    summary: string
    explanation: string
  }>,
) {
return {
    id,
    topicId: 'topic-test',
    title: overrides?.title ?? id,
    titleZh: overrides?.titleZh ?? overrides?.title ?? id,
    titleEn: overrides?.titleEn ?? overrides?.title ?? id,
    summary: overrides?.summary ?? `${id} summary`,
    explanation: overrides?.explanation ?? `${id} explanation`,
    published: new Date(publishedAt),
    authors: '[]',
    arxivUrl: null,
    openAlexId: null,
    pdfUrl: null,
    pdfPath: null,
    citationCount: null,
    coverPath: null,
    figurePaths: '[]',
    tablePaths: '[]',
    formulaPaths: '',
    tags: '[]',
    status: 'candidate',
    contentMode: 'editorial',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    figures: [],
    figure_groups: [],
    tables: [],
    formulas: [],
    paper_sections: [],
  }
}

test('selectTopicDisplayPapers keeps topic-level papers aligned with node-linked mainline papers', () => {
  const topic = {
    papers: [
      createPaper('paper-extraneous', '2026-04-03T00:00:00.000Z'),
      createPaper('paper-2', '2024-02-01T00:00:00.000Z'),
      createPaper('paper-1', '2023-01-01T00:00:00.000Z'),
    ],
    research_nodes: [
      {
        primaryPaperId: 'paper-1',
         node_papers: [{ paperId: 'paper-1' }],
       },
       {
         primaryPaperId: 'paper-2',
         node_papers: [{ paperId: 'paper-2' }, { paperId: 'paper-1' }],
       },
     ],
  }

  assert.deepEqual(
    __testing.selectTopicDisplayPapers(topic).map((paper) => paper.id),
    ['paper-1', 'paper-2', 'paper-extraneous'],
  )
})

test('selectTopicDisplayPapers falls back to the topic paper list when no node-linked papers exist yet', () => {
  const topic = {
    papers: [createPaper('paper-a', '2026-04-03T00:00:00.000Z'), createPaper('paper-b', '2026-04-02T00:00:00.000Z')],
    research_nodes: [
      {
        primaryPaperId: null,
        node_papers: [],
      },
    ],
  }

  assert.deepEqual(
    __testing.selectTopicDisplayPapers(topic).map((paper) => paper.id),
    ['paper-a', 'paper-b'],
  )
})

test('compactTopicMapNodeTitle shortens paper-like node labels before they reach the topic graph', () => {
  const compact = __testing.compactTopicMapNodeTitle({
    nodeTitle:
      'Analysis of AV merging behavior in mixed traffic using large-scale AV driving datasets',
    nodeSubtitle: '',
    primaryPaperTitle:
      'Analysis of AV merging behavior in mixed traffic using large-scale AV driving datasets',
  })

  assert.equal(
    compact,
    'AV merging behavior in mixed traffic',
  )
})

test.skip('buildTopicMapNodeSummary filters reviewer-style noise and keeps the readable judgment', () => {
  const summary = __testing.buildTopicMapNodeSummary({
    nodeTitle: '生成式世界模型',
    primaryPaperTitle: 'GAIA-1：自动驾驶生成式世界模型',
    paperCount: 1,
    candidates: [
      '... ... ... 当前节点主要由一篇论文支撑，跨论文比较还没有真正展开。',
      'GAIA-1 尝试把场景视频生成能力引入自动驾驶，用生成式预测来补齐真实道路稀缺数据。',
    ],
  })

  assert.equal(
    summary,
    'GAIA-1 尝试把场景视频生成能力引入自动驾驶，用生成式预测来补齐真实道路稀缺数据。',
  )
})

test('sanitizeTopicUserFacingSentence falls back to a clean sentence instead of returning prompt residue', () => {
  const cleaned = __testing.sanitizeTopicUserFacingSentence(
    'The user wants a 500-800 word Chinese narrative about autonomous driving world models. Key requirements: keep it analytical.',
    '这篇论文补充了混合交通并道行为的真实数据观察。',
    180,
  )

  assert.equal(cleaned, '这篇论文补充了混合交通并道行为的真实数据观察。')
})

test('sanitizeTopicUserFacingParagraphs removes process narration from fallback paragraphs', () => {
  const paragraphs = __testing.sanitizeTopicUserFacingParagraphs(
    [],
    [
      '自动驾驶世界模型 的这轮 1 小时 研究已暂停。系统围绕当前主题主线持续检索、纳入、改写并回看已有节点。',
      '这条主线目前整理成 5 个阶段、4 个节点，方便从起点一路读到当前方法分支。',
    ],
    3,
    220,
  )

  assert.deepEqual(paragraphs, ['这条主线目前整理成 5 个阶段、4 个节点，方便从起点一路读到当前方法分支。'])
})

test('fallback node themes produce research-grade labels instead of repeated title fragments', () => {
  const unifiedVlaPaper = createPaper('paper-driveworld-vla', '2026-02-06T00:00:00.000Z', {
    title:
      'DriveWorld-VLA: Unified Latent-Space World Modeling with Vision-Language-Action for Autonomous Driving',
    summary:
      'This paper unifies vision, language, and action inside a shared latent-space world model for autonomous driving.',
    explanation:
      'A unified latent-space VLA world model that connects scene understanding, reasoning, and action generation.',
  })

  assert.equal(__testing.detectFallbackNodeThemeId(unifiedVlaPaper), 'unified-vla')
  assert.equal(__testing.buildFallbackNodeLabel([unifiedVlaPaper]), 'VLA 世界模型的隐空间统一')
})

test('fallback node clustering splits same-stage papers by problem line instead of forcing one mixed node', () => {
  const stagePapers = [
    createPaper('paper-planning', '2024-06-16T00:00:00.000Z', {
      title:
        'Driving Into the Future: Multiview Visual Forecasting and Planning with World Model for Autonomous Driving',
      summary:
        'A world model for multiview forecasting and planning in autonomous driving.',
      explanation:
        'The paper emphasizes future prediction and planning decisions with a world model.',
    }),
    createPaper('paper-scene', '2024-06-16T00:00:00.000Z', {
      title:
        'DriveWorld: 4D Pre-Trained Scene Understanding via World Models for Autonomous Driving',
      summary:
        'A 4D pre-trained scene understanding world model for autonomous driving.',
      explanation:
        'The paper focuses on scene understanding and pre-trained spatiotemporal representations.',
    }),
  ]

  const clusters = __testing.synthesizeFallbackNodeClusters(stagePapers)
  const labels = clusters.map((cluster) => __testing.buildFallbackNodeLabel(cluster)).sort()

  assert.equal(clusters.length, 2)
  assert.deepEqual(labels, ['4D 场景理解世界模型', '多视角预测与规划'])
})

test('legacy fallback labels are detected so stale synthesized nodes can be regenerated', () => {
  assert.equal(__testing.isLegacyFallbackNodeLabel?.('driveworld · driveworld unified'), true)
  assert.equal(__testing.isLegacyFallbackNodeLabel?.('occllama · occllama 占用'), true)
  assert.equal(__testing.isLegacyFallbackNodeLabel?.('VLA 世界模型的隐空间统一'), false)
  assert.equal(__testing.isLegacyFallbackNodeLabel?.('多视角预测与规划'), false)
})

test('topic map node paper ids prefer reader-side aggregated papers when they stay inside the stage window', () => {
  assert.deepEqual(
    __testing.pickTopicMapNodePaperIds?.({
      nodePaperIds: ['paper-a'],
      primaryPaperId: 'paper-a',
      stageScopedPaperIds: new Set(['paper-a', 'paper-b']),
      readerPaperIds: ['paper-a', 'paper-b', 'paper-c'],
    }),
    ['paper-a', 'paper-b'],
  )
})

test('topic map node paper ids preserve explicit merge-node papers outside the stage bucket', () => {
  assert.deepEqual(
    __testing.pickTopicMapNodePaperIds?.({
      nodePaperIds: ['paper-a', 'paper-b', 'paper-c'],
      primaryPaperId: 'paper-c',
      stageScopedPaperIds: new Set(['paper-a']),
      readerPaperIds: ['paper-a', 'paper-b', 'paper-c'],
      preserveExplicitPaperIds: true,
    }),
    ['paper-c', 'paper-a', 'paper-b'],
  )
})

test('topic map node paper ids keep canonical merge membership even when reader aggregation is incomplete', () => {
  assert.deepEqual(
    __testing.pickTopicMapNodePaperIds?.({
      nodePaperIds: ['paper-a', 'paper-b', 'paper-c'],
      primaryPaperId: 'paper-c',
      stageScopedPaperIds: new Set(['paper-c']),
      readerPaperIds: ['paper-c'],
      preserveExplicitPaperIds: true,
    }),
    ['paper-c', 'paper-a', 'paper-b'],
  )
})

test('buildTopicMapNodeSummary now stays factual when only one paper is available', () => {
  const summary = __testing.buildTopicMapNodeSummary({
    nodeTitle: 'Generative driving world model',
    primaryPaperTitle: 'GAIA-1 Driving World Model',
    paperCount: 1,
    candidates: [
      'This node is still mostly supported by a single paper and the cross-paper comparison has not started yet.',
      'GAIA-1 introduces generative video prediction into autonomous driving.',
    ],
  })

  assert.match(summary, /GAIA-1/u)
  assert.match(summary, /entry|problem line|入口|问题线/iu)
})
