import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../services/topics/alpha-topic'

test('buildTopicGraphLaneName falls back to a readable paper title when the node title is only an identifier', () => {
  const laneName = __testing.buildTopicGraphLaneName({
    title: '1710.02410',
    titleEn: '1710.02410',
    primaryPaperTitle: 'Conditional Imitation Learning for End-to-End Autonomous Driving',
    branchLabel: '2017.10',
  })

  assert.notEqual(laneName.label, '1710.02410')
  assert.match(laneName.label, /Conditional|Imitation|Driving/i)
  assert.notEqual(laneName.labelEn, '1710.02410')
})

test('lane summaries expose a backend-owned legend label for graph chips', () => {
  const lanes = __testing.buildLaneSummaries([
    {
      nodeId: 'node-branch',
      anchorId: 'node:node-branch',
      route: '/node/node-branch',
      title: '1912.12294',
      titleEn: '1912.12294',
      subtitle: '',
      summary: 'Branch summary',
      explanation: 'Branch explanation',
      stageIndex: 2,
      paperCount: 1,
      paperIds: ['1912.12294'],
      primaryPaperId: '1912.12294',
      primaryPaperTitle: 'Learning by Cheating',
      branchLabel: '2019.12',
      branchColor: '#9d174d',
      updatedAt: '2026-04-19T00:00:00.000Z',
      branchPathId: 'branch:left-1',
      timeLabel: '2019.12',
      parentNodeIds: [],
      isMergeNode: false,
      provisional: false,
      figureCount: 0,
      tableCount: 0,
      formulaCount: 0,
      evidenceCount: 0,
      coverImage: null,
      coverAsset: {
        imagePath: null,
        alt: 'Branch cover',
        source: 'paper-cover',
      },
      editorial: {
        eyebrow: 'Branch',
        digest: '',
        whyNow: '',
        nextQuestion: '',
      },
      cardEditorial: {
        eyebrow: 'Branch',
        digest: 'Branch digest',
        whyNow: 'Branch why now',
        nextQuestion: 'What does this branch add?',
      },
      layoutHint: {
        laneIndex: -1,
        branchIndex: 0,
        isMainline: false,
        side: 'left',
        emphasis: 'branch',
        row: 1,
        column: 4,
        span: 1,
      },
    },
  ])

  assert.equal(lanes[0]?.legendLabel, '分支 01 Learning by Cheating')
  assert.equal(lanes[0]?.legendLabelEn, 'Branch 01 Learning by Cheating')
})
