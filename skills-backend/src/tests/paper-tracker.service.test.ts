import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../../skill-packs/research/paper-tracker/executor'

test('paper tracker sanitizes noisy discovery terms before they reach external search', () => {
  const queries = __testing.sanitizeDiscoveryTerms([
    'Autonomous Driving World Models',
    '自动驾驶世界模型',
    'arxiv-api',
    'hep-th',
    'cs.RO',
    '问题提出',
    '端到端自动驾驶',
  ])

  assert.deepEqual(queries, [
    'Autonomous Driving World Models',
    '自动驾驶世界模型',
    '端到端自动驾驶',
  ])
})

test('paper tracker extracts explicit verdict lines from compact classifier output', () => {
  const parsed = __testing.parsePaperEvaluationLines([
    'verdict=admit',
    'candidateType=direct',
    'citeIntent=supporting',
    'confidence=0.81',
    'why=Strong overlap with the topic mainline and stage focus.',
  ].join('\n'))

  assert.ok(parsed)
  assert.equal(parsed?.candidateType, 'direct')
  assert.equal(parsed?.citeIntent, 'supporting')
  assert.equal(parsed?.confidence, 0.81)
  assert.match(parsed?.why ?? '', /topic mainline/u)
})

test('paper tracker identifies meta classifier narration so repair can retry', () => {
  const raw =
    'The user wants me to classify whether this paper fits the active research topic. I should classify it carefully before answering.'
  const parsed = __testing.inferPaperEvaluationFromText(raw)

  assert.ok(parsed)
  assert.equal(__testing.looksMetaEvaluation(raw, parsed!, 'text'), true)
})

test('paper tracker matches only semantically aligned queries against paper text', () => {
  const matched = __testing.collectMatchedQueries(
    {
      id: 'paper-1',
      title: 'End-to-End Autonomous Driving with World Models',
      summary:
        'We study world-model-based planning for end-to-end autonomous driving with closed-loop evaluation.',
      authors: ['Test Author'],
      published: '2026-03-01T00:00:00.000Z',
      categories: ['cs.CV', 'cs.RO'],
      primaryCategory: 'cs.CV',
      arxivUrl: 'https://arxiv.org/abs/2603.00001',
    },
    [
      'Autonomous Driving World Models',
      '端到端自动驾驶',
      'hep-th',
    ],
  )

  assert.deepEqual(matched, [
    'Autonomous Driving World Models',
  ])
})
