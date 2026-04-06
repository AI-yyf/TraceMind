import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import {
  collectTopicArtifactIndexContext,
  loadTopicArtifactIndex,
  upsertTopicArtifactIndexEntry,
} from '../services/generation/artifact-index'
import type { NodeViewModel, PaperViewModel } from '../services/topics/alpha-reader'

test('artifact index persists reader article summaries and prioritizes local entity context', async () => {
  const topicId = `topic-artifact-index-${Date.now()}`
  const storageKey = `generation-artifact-index:v1:${topicId}`

  const nodeViewModel = {
    schemaVersion: 'node-article-v2',
    nodeId: 'node-1',
    title: 'Planning Fidelity Node',
    titleEn: 'Planning Fidelity Node',
    headline: 'Planning fidelity became the real center of gravity.',
    subtitle: '',
    summary: 'This node article now frames the topic around robust planning evidence.',
    explanation: 'It distinguishes well-grounded planning claims from vaguer autonomy rhetoric.',
    stageIndex: 2,
    updatedAt: '2026-04-04T00:00:00.000Z',
    isMergeNode: false,
    provisional: false,
    topic: {
      topicId,
      title: 'Topic',
      route: `/topic/${topicId}`,
    },
    stats: {
      paperCount: 2,
      figureCount: 1,
      tableCount: 0,
      formulaCount: 0,
    },
    standfirst: 'The node article rewrote the local thesis around planning fidelity.',
    paperRoles: [
      {
        paperId: 'paper-1',
        title: 'Paper 1',
        titleEn: 'Paper 1',
        route: '/paper/paper-1',
        summary: 'Paper summary',
        publishedAt: '2025-01-01T00:00:00.000Z',
        role: 'Anchor',
        contribution: 'It grounds the planning claim in concrete evidence.',
        figuresCount: 1,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
      },
    ],
    comparisonBlocks: [
      {
        id: 'cmp-1',
        title: 'Comparison',
        summary: 'The comparison block separates grounded planning evidence from weaker claims.',
        papers: [],
        points: [],
      },
    ],
    article: {
      periodLabel: '2025',
      timeRangeLabel: '2025',
      flow: [],
      sections: [],
      closing: ['Planning fidelity is better grounded than broad autonomy claims.'],
    },
    critique: {
      title: 'Critique',
      summary: 'The narrative still needs a stronger falsification story.',
      bullets: ['Keep the benchmark weakness visible.'],
    },
    evidence: [],
  } satisfies NodeViewModel

  const paperViewModel = {
    schemaVersion: 'paper-article-v2',
    paperId: 'paper-1',
    title: 'Benchmark Pressure Test',
    titleEn: 'Benchmark Pressure Test',
    summary: 'The paper article explains where the current planning story still breaks.',
    explanation: 'A narrow benchmark remains the sharpest falsification handle.',
    publishedAt: '2025-01-01T00:00:00.000Z',
    authors: ['Codex'],
    citationCount: null,
    coverImage: null,
    topic: {
      topicId,
      title: 'Topic',
      route: `/topic/${topicId}`,
    },
    stats: {
      sectionCount: 3,
      figureCount: 0,
      tableCount: 0,
      formulaCount: 0,
      relatedNodeCount: 1,
    },
    relatedNodes: [
      {
        nodeId: 'node-1',
        title: 'Planning Fidelity Node',
        subtitle: '',
        summary: 'This node article now frames the topic around robust planning evidence.',
        stageIndex: 2,
        route: '/node/node-1',
      },
    ],
    standfirst: 'A single benchmark still exposes the weak edge of the narrative.',
    article: {
      periodLabel: '2025',
      timeRangeLabel: '2025',
      flow: [],
      sections: [],
      closing: ['The benchmark failure is still the cleanest falsification handle.'],
    },
    critique: {
      title: 'Critique',
      summary: 'It still needs wider evidence beyond one benchmark.',
      bullets: ['Do not oversell robustness.'],
    },
    evidence: [],
  } satisfies PaperViewModel

  try {
    await upsertTopicArtifactIndexEntry('paper', paperViewModel)
    await upsertTopicArtifactIndexEntry('node', nodeViewModel)

    const state = await loadTopicArtifactIndex(topicId)
    assert.equal(state.entries.length, 2)

    const nodeContext = collectTopicArtifactIndexContext(state, {
      subjectType: 'node',
      subjectId: 'node-1',
      limit: 4,
    })
    assert.equal(nodeContext.artifactIndex[0]?.entityId, 'node-1')
    assert.equal(nodeContext.artifactIndex[0]?.kind, 'node')
    assert.equal(nodeContext.artifactIndex[0]?.keyArguments.length > 0, true)

    const stageContext = collectTopicArtifactIndexContext(state, {
      subjectType: 'stage',
      subjectId: 'research-stage:2:round:3',
      limit: 4,
    })
    assert.equal(stageContext.artifactIndex.length >= 2, true)
    assert.equal(stageContext.artifactIndex[0]?.stageIndex, 2)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [storageKey],
        },
      },
    })
  }
})
