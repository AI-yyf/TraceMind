import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveTemporalStageBuckets,
  normalizeStageWindowMonths,
} from '../services/topics/stage-buckets'

test('deriveTemporalStageBuckets anchors from the earliest paper month and supports adjustable windows', () => {
  const result = deriveTemporalStageBuckets({
    windowDays: 90, // ~3 months
    papers: [
      { id: 'paper-1', published: '2024-01-15T00:00:00.000Z' },
      { id: 'paper-2', published: '2024-03-04T00:00:00.000Z' },
      { id: 'paper-3', published: '2024-04-09T00:00:00.000Z' },
    ],
    nodes: [
      {
        id: 'node-1',
        primaryPaperId: 'paper-1',
        papers: [{ paperId: 'paper-1' }, { paperId: 'paper-2' }],
      },
      {
        id: 'node-2',
        primaryPaperId: 'paper-3',
        papers: [{ paperId: 'paper-3' }],
      },
    ],
  })

  assert.equal(result.windowDays, 90)
  assert.equal(result.buckets.length, 2)
  assert.equal(result.buckets[0]?.label, '2024.01-2024.03')
  assert.equal(result.buckets[1]?.label, '2024.04-2024.06')
  assert.match(result.buckets[0]?.description ?? '', /2024\.01-2024\.03/)
  assert.equal(result.paperAssignments.get('paper-2')?.stageIndex, 1)
  assert.equal(result.paperAssignments.get('paper-3')?.stageIndex, 2)
  assert.equal(result.nodeAssignments.get('node-1')?.stageIndex, 1)
  assert.equal(result.nodeAssignments.get('node-2')?.stageIndex, 2)
})

test('deriveTemporalStageBuckets falls back to monthly descriptions when no papers are available', () => {
  const result = deriveTemporalStageBuckets({
    windowMonths: 1,
    papers: [],
    fallbackDate: '2024-05-18T00:00:00.000Z',
  })

  assert.equal(result.buckets.length, 1)
  assert.equal(result.buckets[0]?.label, '2024.05')
  assert.match(result.buckets[0]?.description ?? '', /2024\.05/)
})

test('normalizeStageWindowMonths clamps sub-month requests back to the supported monthly floor', () => {
  assert.equal(normalizeStageWindowMonths(0.25), 1)
  assert.equal(normalizeStageWindowMonths(0.5), 1)
  assert.equal(normalizeStageWindowMonths(1), 1)
  assert.equal(normalizeStageWindowMonths(3.8), 3)
})
