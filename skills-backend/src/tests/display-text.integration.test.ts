import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { __testing as alphaReaderTesting } from '../services/topics/alpha-reader'
import { buildTopicViewModel } from '../services/topics/alpha-topic'

test('topic and reader view models fall back to meaningful English titles when zh titles are placeholder question marks', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      nameZh: '????????????',
      nameEn: 'Fallback Validation Topic',
      focusLabel: '????????',
      summary: 'English summary for fallback validation.',
      description: 'English description for fallback validation.',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      title: 'Fallback Paper Title',
      titleZh: '????????????',
      titleEn: 'Fallback Paper Title',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-01-01T00:00:00.000Z'),
      summary: 'English paper summary for fallback validation.',
      explanation: 'English paper explanation for fallback validation.',
      arxivUrl: 'https://example.com/fallback-paper',
      pdfUrl: 'https://example.com/fallback-paper.pdf',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['display-text']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      topicId: topic.id,
      stageIndex: 1,
      nodeLabel: '??????????',
      nodeSubtitle: '????',
      nodeSummary: 'English node summary for fallback validation.',
      nodeExplanation: 'English node explanation for fallback validation.',
      primaryPaperId: paper.id,
      status: 'provisional',
      provisional: true,
      isMergeNode: false,
      updatedAt: new Date(),
    },
  })

  await prisma.node_papers.create({
    data: {
      id: crypto.randomUUID(),
      nodeId: node.id,
      paperId: paper.id,
      order: 0,
    },
  })

  try {
    const [topicViewModel, nodeViewModel, paperViewModel] = await Promise.all([
      buildTopicViewModel(topic.id, { quick: true, stageWindowMonths: 1 }),
      alphaReaderTesting.buildQuickNodeViewModelForTest(node.id, 1),
      alphaReaderTesting.buildQuickPaperViewModelForTest(paper.id, 1),
    ])

    assert.equal(topicViewModel.title, 'Fallback Validation Topic')
    assert.equal(topicViewModel.stages[0]?.nodes[0]?.title, 'Fallback Paper Title')
    assert.equal(topicViewModel.papers[0]?.title, 'Fallback Paper Title')

    assert.equal(nodeViewModel.title, 'Fallback Paper Title')
    assert.equal(nodeViewModel.topic.title, 'Fallback Validation Topic')
    assert.equal(nodeViewModel.paperRoles[0]?.title, 'Fallback Paper Title')

    assert.equal(paperViewModel.title, 'Fallback Paper Title')
    assert.equal(paperViewModel.topic.title, 'Fallback Validation Topic')
    assert.equal(paperViewModel.relatedNodes[0]?.title, 'Fallback Paper Title')
  } finally {
    await prisma.node_papers.deleteMany({
      where: { nodeId: node.id },
    })
    await prisma.research_nodes.delete({
      where: { id: node.id },
    })
    await prisma.papers.deleteMany({
      where: { topicId: topic.id },
    })
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('topic view model hides reader-empty stages and placeholder unmapped papers for autonomous-driving', async () => {
  const topicViewModel = await buildTopicViewModel('autonomous-driving', {
    quick: true,
    stageWindowMonths: 6,
  })

  assert.equal(topicViewModel.unmappedPapers.length, 0)
  assert.ok(topicViewModel.stages.length > 0)
  assert.equal(topicViewModel.stats.stageCount, topicViewModel.stages.length)

  for (const stage of topicViewModel.stages) {
    assert.equal(stage.nodes.length > 0 || stage.trackedPaperCount > 0 || stage.mappedPaperCount > 0, true)
  }

  for (const paper of topicViewModel.papers) {
    assert.equal(/^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/iu.test(paper.title), false)
  }
})
