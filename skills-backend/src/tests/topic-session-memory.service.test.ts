import assert from 'node:assert/strict'
import test from 'node:test'

import type { GenerationRuntimeConfig } from '../services/generation/prompt-registry'
import type { TopicSessionMemoryState } from '../services/topics/topic-session-memory'
import { __testing } from '../services/topics/topic-session-memory'
import type { ResearchRunReport } from '../services/topics/research-report'

function buildMemoryState(
  overrides: Partial<TopicSessionMemoryState> = {},
): TopicSessionMemoryState {
  return {
    schemaVersion: 'topic-session-memory-v1',
    topicId: 'topic-memory-test',
    updatedAt: '2026-04-02T00:00:00.000Z',
    initializedAt: null,
    lastCompactedAt: null,
    totalEvents: 0,
    chatTurnsSinceCompaction: 0,
    researchCyclesSinceCompaction: 0,
    estimatedTokensSinceCompaction: 0,
    recentEvents: [],
    summary: {
      currentFocus: '',
      continuity: '',
      establishedJudgments: [],
      openQuestions: [],
      researchMomentum: [],
      conversationStyle: '',
      lastResearchMove: '',
      lastUserIntent: '',
    },
    ...overrides,
  }
}

function buildResearchReport(
  overrides: Partial<ResearchRunReport> = {},
): ResearchRunReport {
  return {
    schemaVersion: 'topic-research-report-v1',
    reportId: 'report-1',
    taskId: 'task-1',
    topicId: 'topic-memory-test',
    topicName: 'Memory Topic',
    researchMode: 'duration',
    trigger: 'manual',
    status: 'running',
    durationHours: 1,
    startedAt: '2026-04-02T00:00:00.000Z',
    deadlineAt: '2026-04-02T01:00:00.000Z',
    completedAt: null,
    updatedAt: '2026-04-02T00:30:00.000Z',
    currentStage: 2,
    totalStages: 4,
    completedStageCycles: 1,
    totalRuns: 3,
    successfulRuns: 2,
    failedRuns: 0,
    discoveredPapers: 8,
    admittedPapers: 3,
    generatedContents: 2,
    latestStageSummary: 'Stage 2 is still comparing scaling evidence.',
    headline: 'Stage 2 tightened the comparison frame',
    dek: 'Reader continuity report',
    summary: 'The current round keeps attention on scaling evidence and open comparison gaps.',
    paragraphs: ['Paragraph 1'],
    keyMoves: ['Clarified the scaling axis'],
    openQuestions: ['Which benchmark invalidates the current framing?'],
    latestNodeActions: [],
    ...overrides,
  }
}

test('session memory fallback summary preserves continuity, judgments, and open questions', () => {
  const memory = buildMemoryState({
    totalEvents: 5,
    recentEvents: [
      {
        id: 'evt-1',
        kind: 'research-cycle',
        headline: 'Compared the latest scaling papers',
        summary: 'The latest research cycle stayed focused on scaling evidence.',
        openQuestions: ['Does the benchmark choice distort the claimed gains?'],
        createdAt: '2026-04-02T00:10:00.000Z',
      },
      {
        id: 'evt-2',
        kind: 'chat-user',
        headline: 'User asked about the weakest link',
        summary: 'What is still under-argued in this direction?',
        createdAt: '2026-04-02T00:20:00.000Z',
      },
      {
        id: 'evt-3',
        kind: 'chat-assistant',
        headline: 'Sidebar answer',
        summary: 'The weakest link is still the causal explanation for the gains.',
        createdAt: '2026-04-02T00:21:00.000Z',
      },
    ],
    summary: {
      currentFocus: '',
      continuity: 'Existing continuity thread',
      establishedJudgments: ['Scaling evidence is stronger than mechanistic explanation.'],
      openQuestions: [],
      researchMomentum: [],
      conversationStyle: '',
      lastResearchMove: '',
      lastUserIntent: '',
    },
  })

  const summary = __testing.buildFallbackSummary(
    memory,
    {
      title: 'Memory Topic',
      summary: 'A topic about continuity-aware research.',
      focusLabel: 'Scaling evidence',
    },
    buildResearchReport(),
  )

  assert.equal(summary.currentFocus.includes('scaling'), true)
  assert.equal(summary.continuity.includes('Latest research move:'), true)
  assert.equal(summary.establishedJudgments.some((item) => item.includes('mechanistic')), true)
  assert.equal(
    summary.openQuestions.some((item) => item.toLowerCase().includes('benchmark')),
    true,
  )
  assert.equal(summary.conversationStyle.length > 0, true)
  assert.equal(summary.lastUserIntent.includes('under-argued'), true)
})

test('session memory sanitization strips prompt echoes and operational artifacts from summary fields', () => {
  const fallback = buildMemoryState({
    summary: {
      currentFocus: 'Grounded focus',
      continuity: 'Grounded continuity',
      establishedJudgments: ['Judgment that should survive'],
      openQuestions: ['Which benchmark still resists the claim?'],
      researchMomentum: ['Stage 2 comparison tightened'],
      conversationStyle: 'Grounded conversation style',
      lastResearchMove: 'Compared the latest scaling papers',
      lastUserIntent: 'Explain the weakest link.',
    },
  }).summary

  const summary = __testing.sanitizeSummary(
    {
      currentFocus: 'args.orchestration.nodeActions is not iterable',
      continuity:
        '用户希望我基于提供的上下文（authorContext、question、selectedEvidence 与 outputContract）来回答问题。',
      establishedJudgments: [
        'Judgment that should survive',
        'authorContext indicates the model should reason before answering.',
      ],
      openQuestions: [
        'Workbench controls: response_style=balanced reasoning=enabled retrieval=enabled?',
        'Which benchmark still resists the claim?',
      ],
      researchMomentum: [
        'Stage 2 comparison tightened',
        'args.orchestration.nodeActions is not iterable',
      ],
      conversationStyle: 'response_style=balanced retrieval=enabled',
      lastResearchMove: 'args.orchestration.nodeActions is not iterable',
      lastUserIntent: 'Explain the weakest link.',
    },
    fallback,
  )

  assert.equal(summary.currentFocus, fallback.currentFocus)
  assert.equal(summary.continuity, fallback.continuity)
  assert.deepEqual(summary.establishedJudgments, ['Judgment that should survive'])
  assert.deepEqual(summary.openQuestions, ['Which benchmark still resists the claim?'])
  assert.deepEqual(summary.researchMomentum, ['Stage 2 comparison tightened'])
  assert.equal(summary.conversationStyle.length > 0, true)
  assert.equal(summary.lastResearchMove, fallback.lastResearchMove)
  assert.equal(summary.lastUserIntent, 'Explain the weakest link.')
})

test('session memory hydration refreshes user steering and research continuity from recent events immediately', () => {
  const hydrated = __testing.hydrateSummaryFromRecentEvents(
    buildMemoryState({
      summary: {
        currentFocus: 'Older focus that should be replaced',
        continuity: 'Older continuity',
        establishedJudgments: [],
        openQuestions: ['Legacy question'],
        researchMomentum: ['Legacy momentum'],
        conversationStyle: 'Older style',
        lastResearchMove: 'Older move',
        lastUserIntent: 'Older intent',
      },
    }).summary,
    [
      {
        id: 'evt-1',
        kind: 'chat-user',
        headline: 'User style directive',
        summary: 'Keep the prose surgical and evidence-first.',
        createdAt: '2026-04-02T00:10:00.000Z',
      },
      {
        id: 'evt-2',
        kind: 'chat-user',
        headline: 'User focus directive',
        summary: 'Stay on the benchmark mismatch instead of opening a new branch.',
        createdAt: '2026-04-02T00:11:00.000Z',
      },
      {
        id: 'evt-3',
        kind: 'research-cycle',
        headline: 'Compared the contested benchmark pair',
        summary: 'The latest cycle narrowed the disagreement to one benchmark mismatch.',
        openQuestions: ['Which dataset shift still breaks the current claim?'],
        createdAt: '2026-04-02T00:12:00.000Z',
      },
      {
        id: 'evt-4',
        kind: 'chat-user',
        headline: 'User suggestion',
        summary: 'Document the weakest assumption before broadening scope.',
        createdAt: '2026-04-02T00:13:00.000Z',
      },
    ],
  )

  assert.equal(
    hydrated.lastUserIntent,
    'Document the weakest assumption before broadening scope.',
  )
  assert.equal(hydrated.conversationStyle, 'Keep the prose surgical and evidence-first.')
  assert.equal(
    hydrated.currentFocus,
    'Stay on the benchmark mismatch instead of opening a new branch.',
  )
  assert.equal(hydrated.lastResearchMove, 'Compared the contested benchmark pair')
  assert.equal(
    hydrated.openQuestions.includes('Which dataset shift still breaks the current claim?'),
    true,
  )
  assert.equal(
    hydrated.researchMomentum.includes('Compared the contested benchmark pair'),
    true,
  )
  assert.equal(hydrated.continuity.includes('Latest user steering:'), true)
})

test('session memory compaction thresholds respect init, chat, research, and token gates', () => {
  const runtime = {
    topicSessionMemoryEnabled: true,
    topicSessionMemoryInitEventCount: 3,
    topicSessionMemoryChatTurnsBetweenCompaction: 4,
    topicSessionMemoryResearchCyclesBetweenCompaction: 2,
    topicSessionMemoryTokenThreshold: 1200,
  } as GenerationRuntimeConfig

  assert.equal(
    __testing.shouldCompact(
      buildMemoryState({
        totalEvents: 2,
      }),
      runtime,
    ),
    false,
  )

  assert.equal(
    __testing.shouldCompact(
      buildMemoryState({
        totalEvents: 3,
        lastCompactedAt: null,
      }),
      runtime,
    ),
    true,
  )

  assert.equal(
    __testing.shouldCompact(
      buildMemoryState({
        totalEvents: 5,
        lastCompactedAt: '2026-04-02T00:00:00.000Z',
        chatTurnsSinceCompaction: 4,
      }),
      runtime,
    ),
    true,
  )

  assert.equal(
    __testing.shouldCompact(
      buildMemoryState({
        totalEvents: 5,
        lastCompactedAt: '2026-04-02T00:00:00.000Z',
        researchCyclesSinceCompaction: 2,
      }),
      runtime,
    ),
    true,
  )

  assert.equal(
    __testing.shouldCompact(
      buildMemoryState({
        totalEvents: 5,
        lastCompactedAt: '2026-04-02T00:00:00.000Z',
        estimatedTokensSinceCompaction: 1500,
      }),
      runtime,
    ),
    true,
  )
})

test('session memory recall surfaces question-relevant long-memory events with recency bias', () => {
  const memory = buildMemoryState({
    recentEvents: [
      {
        id: 'evt-1',
        kind: 'research-status',
        headline: 'Established the baseline',
        summary: 'Baseline comparisons are stable but do not explain the main gain.',
        createdAt: '2026-04-02T00:05:00.000Z',
      },
      {
        id: 'evt-2',
        kind: 'research-cycle',
        headline: 'Benchmark choice is still under dispute',
        summary: 'The benchmark selection may inflate the scaling gain and remains the main open question.',
        openQuestions: ['Does benchmark choice distort the reported scaling gain?'],
        createdAt: '2026-04-02T00:25:00.000Z',
      },
      {
        id: 'evt-3',
        kind: 'chat-assistant',
        headline: 'Sidebar answer',
        summary: 'The strongest unresolved issue is whether benchmark choice explains away the gain.',
        createdAt: '2026-04-02T00:30:00.000Z',
      },
    ],
  })

  const recall = __testing.recallSessionMemoryEvents(
    memory,
    'What is still unresolved about the benchmark choice and scaling gain?',
    {
      recallLimit: 2,
      lookbackLimit: 8,
      recencyBias: 0.35,
    },
  )

  assert.equal(recall.recallQueryTokens.length > 0, true)
  assert.equal(recall.recalledEvents.length, 2)
  assert.equal(recall.recalledEvents[0]?.id, 'evt-2')
  assert.equal(
    recall.recalledEvents.some((event) => event.summary.toLowerCase().includes('benchmark')),
    true,
  )
})
