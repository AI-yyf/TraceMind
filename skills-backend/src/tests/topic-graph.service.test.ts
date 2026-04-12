import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing, type TopicViewModel } from '../services/topics/alpha-topic'

function createStageNode(
  nodeId: string,
  stageIndex: number,
  options?: Partial<TopicViewModel['stages'][number]['nodes'][number]>,
): TopicViewModel['stages'][number]['nodes'][number] {
  return {
    nodeId,
    anchorId: `node:${nodeId}`,
    route: `/node/${nodeId}`,
    title: `节点 ${nodeId}`,
    titleEn: `Node ${nodeId}`,
    subtitle: '',
    summary: `summary ${nodeId}`,
    explanation: `explanation ${nodeId}`,
    paperCount: 1,
    paperIds: [`paper-${nodeId}`],
    primaryPaperTitle: `paper ${nodeId}`,
    primaryPaperId: `paper-${nodeId}`,
    coverImage: null,
    isMergeNode: false,
    provisional: false,
    updatedAt: `2026-03-${`${stageIndex + 10}`.padStart(2, '0')}T00:00:00.000Z`,
    branchLabel: `阶段 ${stageIndex}`,
    branchColor: '#2563eb',
    editorial: {
      eyebrow: '研究节点',
      digest: `digest ${nodeId}`,
      whyNow: `why ${nodeId}`,
      nextQuestion: `next ${nodeId}`,
    },
    ...options,
  }
}

test('buildGraphLayout keeps the mainline centered and assigns stable branch lanes', () => {
  const stages: TopicViewModel['stages'] = [
    {
      stageIndex: 1,
      title: '起点',
      titleEn: 'Origin',
      description: '',
      branchLabel: '起点',
      branchColor: '#111827',
      editorial: {
        kicker: 'start',
        summary: 'summary',
        transition: 'transition',
      },
      trackedPaperCount: 1,
      mappedPaperCount: 1,
      unmappedPaperCount: 0,
      nodes: [createStageNode('n1', 1)],
    },
    {
      stageIndex: 2,
      title: '分化',
      titleEn: 'Split',
      description: '',
      branchLabel: '分化',
      branchColor: '#111827',
      editorial: {
        kicker: 'split',
        summary: 'summary',
        transition: 'transition',
      },
      trackedPaperCount: 3,
      mappedPaperCount: 3,
      unmappedPaperCount: 0,
      nodes: [createStageNode('n2', 2), createStageNode('n3', 2), createStageNode('n4', 2)],
    },
    {
      stageIndex: 3,
      title: '汇流',
      titleEn: 'Merge',
      description: '',
      branchLabel: '汇流',
      branchColor: '#111827',
      editorial: {
        kicker: 'merge',
        summary: 'summary',
        transition: 'transition',
      },
      trackedPaperCount: 2,
      mappedPaperCount: 2,
      unmappedPaperCount: 0,
      nodes: [createStageNode('n5', 3, { isMergeNode: true }), createStageNode('n6', 3)],
    },
  ]

  const graph = __testing.buildGraphLayout(stages)
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]))
  const mainlineLane = graph.lanes.find((lane) => lane.isMainline)
  const leftBranchLane = graph.lanes.find((lane) => lane.laneIndex === -1)

  assert.equal(graph.columnCount, __testing.BRANCH_LANES.length + 1)
  assert.ok(mainlineLane)
  assert.equal(mainlineLane?.roleLabel, '主线')
  assert.equal(mainlineLane?.latestNodeId, 'n5')
  assert.ok(leftBranchLane)
  assert.equal(leftBranchLane?.nodeCount, 2)
  assert.match(leftBranchLane?.periodLabel ?? '', /^\d{2}\.\d{2}(—\d{2}\.\d{2})?$/u)
  assert.equal(byId.get('n1')?.layoutHint.isMainline, true)
  assert.equal(byId.get('n2')?.layoutHint.laneIndex, 0)
  assert.equal(byId.get('n3')?.layoutHint.laneIndex, -1)
  assert.equal(byId.get('n4')?.layoutHint.laneIndex, 1)
  assert.equal(byId.get('n3')?.layoutHint.branchIndex, 0)
  assert.equal(byId.get('n4')?.layoutHint.branchIndex, 1)
  assert.equal(byId.get('n6')?.layoutHint.laneIndex, -1)
  assert.deepEqual(byId.get('n5')?.parentNodeIds.sort(), ['n2', 'n3'])
  assert.equal(byId.get('n5')?.branchColor, __testing.MAINLINE_BRANCH_COLOR)
})
