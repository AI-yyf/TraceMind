import assert from 'node:assert/strict'
import test from 'node:test'

import { rankSearchCandidates, type SearchCandidate } from '../services/topics/search'

function candidate(overrides: Partial<SearchCandidate>): SearchCandidate {
  return {
    id: overrides.id ?? 'id',
    kind: overrides.kind ?? 'topic',
    group: overrides.group ?? 'topic',
    title: overrides.title ?? 'Transformer',
    subtitle: overrides.subtitle ?? '',
    excerpt: overrides.excerpt ?? '',
    route: overrides.route ?? '/topic/topic-1',
    tags: overrides.tags ?? [],
    matchedFields: overrides.matchedFields ?? ['title'],
    publishedAt: overrides.publishedAt,
    topicId: overrides.topicId,
    topicTitle: overrides.topicTitle,
    anchorId: overrides.anchorId,
    score: 0,
  }
}

test('rankSearchCandidates prefers node > paper > evidence > topic on same title match', () => {
  const ranked = rankSearchCandidates(
    'transformer',
    [
      candidate({ id: 'topic', kind: 'topic', group: 'topic', title: 'Transformer' }),
      candidate({ id: 'section', kind: 'section', group: 'evidence', title: 'Transformer' }),
      candidate({ id: 'paper', kind: 'paper', group: 'paper', title: 'Transformer' }),
      candidate({ id: 'node', kind: 'node', group: 'node', title: 'Transformer' }),
    ],
    'global',
  )

  assert.deepEqual(
    ranked.map((item) => item.kind),
    ['node', 'paper', 'section', 'topic'],
  )
})

test('rankSearchCandidates prefers tag matches over evidence excerpt matches', () => {
  const ranked = rankSearchCandidates(
    'transformer',
    [
      candidate({
        id: 'paper-tag',
        kind: 'paper',
        group: 'paper',
        title: 'Attention Research',
        tags: ['transformer'],
        matchedFields: ['tags'],
      }),
      candidate({
        id: 'figure-excerpt',
        kind: 'figure',
        group: 'evidence',
        title: 'Figure 1',
        excerpt: 'This figure explains the transformer block.',
        matchedFields: ['excerpt'],
      }),
    ],
    'global',
  )

  assert.equal(ranked[0]?.id, 'paper-tag')
  assert.equal(ranked[1]?.id, 'figure-excerpt')
})

test('rankSearchCandidates uses recency as the global tie-breaker', () => {
  const ranked = rankSearchCandidates(
    'transformer',
    [
      candidate({
        id: 'older-paper',
        kind: 'paper',
        group: 'paper',
        title: 'Transformer Study',
        publishedAt: '2022-01-01T00:00:00.000Z',
      }),
      candidate({
        id: 'newer-paper',
        kind: 'paper',
        group: 'paper',
        title: 'Transformer Study',
        publishedAt: '2025-01-01T00:00:00.000Z',
      }),
    ],
    'global',
  )

  assert.equal(ranked[0]?.id, 'newer-paper')
  assert.equal(ranked[1]?.id, 'older-paper')
})

test('rankSearchCandidates rewards multi-token title coverage over single-token matches', () => {
  const ranked = rankSearchCandidates(
    'graph transformer',
    [
      candidate({
        id: 'single-token',
        kind: 'paper',
        group: 'paper',
        title: 'Transformer Systems',
      }),
      candidate({
        id: 'multi-token',
        kind: 'paper',
        group: 'paper',
        title: 'Graph Transformer Systems',
      }),
    ],
    'global',
  )

  assert.equal(ranked[0]?.id, 'multi-token')
  assert.equal(ranked[1]?.id, 'single-token')
})
