import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTopicDisplay } from '../../shared/topic-display'

test('buildTopicDisplay keeps only topic-owned papers instead of the whole paper catalog', () => {
  const display = buildTopicDisplay({
    topicId: 'autonomous-driving',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: '自动驾驶 / 世界模型',
    originPaperId: '1604.07316',
    configuredPaperIds: ['1604.07316'],
    topicMemory: {
      researchNodes: [
        {
          nodeId: 'autonomous-driving:stage-0:1604.07316',
          stageIndex: 0,
          paperIds: ['1604.07316'],
          primaryPaperId: '1604.07316',
          sourceBranchIds: ['branch:autonomous-driving:origin'],
        },
      ],
    },
    paperCatalog: {
      '1604.07316': {
        title: 'End to End Learning for Self-Driving Cars',
      },
      '2210.03629': {
        title: 'ReAct',
      },
      '1706.03762': {
        title: 'Attention Is All You Need',
      },
    },
  })

  assert.deepEqual(
    (display.papers as Array<{ id: string }>).map((paper) => paper.id),
    ['1604.07316'],
  )
})

test('buildTopicDisplay deduplicates repeated research nodes with the same canonical node id', () => {
  const display = buildTopicDisplay({
    topicId: 'autonomous-driving',
    nameZh: '自动驾驶 VLA 世界模型',
    nameEn: 'Autonomous Driving VLA World Models',
    focusLabel: '自动驾驶 / 世界模型',
    originPaperId: '1604.07316',
    configuredPaperIds: ['1604.07316'],
    topicMemory: {
      researchNodes: [
        {
          nodeId: 'autonomous-driving:stage-0:1604.07316',
          stageIndex: 0,
          paperIds: ['1604.07316'],
          primaryPaperId: '1604.07316',
          sourceBranchIds: ['branch:autonomous-driving:origin'],
          nodeSummary: 'short summary',
        },
        {
          nodeId: 'autonomous-driving:stage-0:1604.07316',
          stageIndex: 0,
          paperIds: ['1604.07316'],
          primaryPaperId: '1604.07316',
          sourceBranchIds: ['branch:autonomous-driving:origin'],
          sourceProblemNodeIds: ['autonomous-driving:origin-problem'],
          nodeSummary: 'longer canonical summary for the same node',
        },
      ],
    },
    paperCatalog: {
      '1604.07316': {
        title: 'End to End Learning for Self-Driving Cars',
      },
    },
  })

  const researchNodes = display.researchNodes as Array<{
    nodeId: string
    sourceProblemNodeIds?: string[]
    nodeSummary?: string
  }>

  assert.equal(researchNodes.length, 1)
  assert.equal(researchNodes[0]?.nodeId, 'autonomous-driving:stage-0:1604.07316')
  assert.deepEqual(researchNodes[0]?.sourceProblemNodeIds, ['autonomous-driving:origin-problem'])
  assert.equal(researchNodes[0]?.nodeSummary, 'longer canonical summary for the same node')
})
