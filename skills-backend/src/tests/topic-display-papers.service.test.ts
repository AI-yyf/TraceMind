import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../services/topics/alpha-topic'

function createPaper(id: string, publishedAt: string) {
  return {
    id,
    title: id,
    titleZh: id,
    titleEn: id,
    summary: `${id} summary`,
    explanation: `${id} explanation`,
    published: new Date(publishedAt),
    authors: '[]',
    citationCount: null,
    coverPath: null,
    figures: [],
    tables: [],
    formulas: [],
    sections: [],
  }
}

test('selectTopicDisplayPapers keeps topic-level papers aligned with node-linked mainline papers', () => {
  const topic = {
    papers: [
      createPaper('paper-extraneous', '2026-04-03T00:00:00.000Z'),
      createPaper('paper-2', '2024-02-01T00:00:00.000Z'),
      createPaper('paper-1', '2023-01-01T00:00:00.000Z'),
    ],
    nodes: [
      {
        primaryPaperId: 'paper-1',
        papers: [{ paperId: 'paper-1' }],
      },
      {
        primaryPaperId: 'paper-2',
        papers: [{ paperId: 'paper-2' }, { paperId: 'paper-1' }],
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
    nodes: [
      {
        primaryPaperId: null,
        papers: [],
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

test('buildTopicMapNodeSummary filters reviewer-style noise and keeps the readable judgment', () => {
  const summary = __testing.buildTopicMapNodeSummary({
    nodeTitle: '生成式世界模型',
    primaryPaperTitle: 'GAIA-1：自动驾驶生成式世界模型',
    paperCount: 1,
    candidates: [
      '... ... ... 当前节点主要由一篇论文支撑，跨论文比较还没有真正展开。',
      'GAIA-1尝试把场景视频生成能力引入自动驾驶，用生成式预测来补齐真实道路稀缺数据。',
    ],
  })

  assert.equal(
    summary,
    'GAIA-1尝试把场景视频生成能力引入自动驾驶，用生成式预测来补齐真实道路稀缺数据。',
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
      '这条主线目前整理为 5 个阶段、6 个节点，方便从起点一路读到当前方法分支。',
    ],
    3,
    220,
  )

  assert.deepEqual(paragraphs, ['这条主线目前整理为 5 个阶段、6 个节点，方便从起点一路读到当前方法分支。'])
})
