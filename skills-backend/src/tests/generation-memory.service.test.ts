import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectGenerationMemoryContext,
  normalizeGenerationScopeId,
  type GenerationPassRecord,
  type TopicGenerationMemory,
} from '../services/generation/memory-store'
import {
  __testing as judgmentTesting,
  type TopicResearchJudgmentState,
} from '../services/generation/research-judgment-store'

function createPassRecord(
  overrides: Partial<GenerationPassRecord> = {},
): GenerationPassRecord {
  return {
    passId: 'pass-1',
    templateId: 'article.node',
    language: 'zh',
    subjectType: 'node',
    subjectId: 'node-1',
    fingerprint: 'fingerprint-1',
    slot: 'language',
    status: 'ready',
    usedCache: false,
    attemptCount: 1,
    issue: null,
    summary: 'A node-level synthesis established the main research line.',
    output: {
      headline: 'A node-level synthesis established the main research line.',
      standfirst: 'The node is now framed around world-model planning.',
    },
    updatedAt: '2026-04-03T00:00:00.000Z',
    ...overrides,
  }
}

test('collectGenerationMemoryContext replays same-scope pass history separately from other context', () => {
  const memory: TopicGenerationMemory = {
    schemaVersion: 'generation-memory-v1',
    topicId: 'topic-1',
    updatedAt: '2026-04-03T00:00:00.000Z',
    topicSnapshot: {
      title: 'World Models',
    },
    passRecords: {
      synth: createPassRecord(),
      review: createPassRecord({
        passId: 'pass-2',
        templateId: 'article.reviewer',
        summary: 'Tighten the causal claim and separate evidence from framing.',
        output: {
          summary: 'Tighten the causal claim and separate evidence from framing.',
          bullets: ['Separate benchmark evidence from generalization claims.'],
        },
        updatedAt: '2026-04-03T00:05:00.000Z',
      }),
      otherNode: createPassRecord({
        passId: 'pass-3',
        subjectId: 'node-2',
        summary: 'A neighboring node tracks evaluation and benchmarks.',
        updatedAt: '2026-04-03T00:10:00.000Z',
      }),
    },
  }

  const context = collectGenerationMemoryContext(memory, {
    subjectType: 'node',
    subjectId: 'node-1',
    limit: 10,
  })

  assert.equal(context.sameSubjectPasses.length, 2)
  assert.equal(context.recentPasses.length, 1)
  assert.equal(context.anchorPasses.length, 0)
  assert.equal(context.recentPasses[0]?.subjectId, 'node-2')
  assert.ok(
    context.sameSubjectPasses.some((record) => record.templateId === 'article.reviewer'),
  )
  assert.ok(
    context.reviewerWatchpoints.some((entry) =>
      entry.includes('Separate benchmark evidence from generalization claims'),
    ),
  )
})

test('normalizeGenerationScopeId keeps stage rounds grouped by stage index', () => {
  assert.equal(normalizeGenerationScopeId('research-stage:2:round:5'), 'research-stage:2')
  assert.equal(normalizeGenerationScopeId('topic-1:closing'), 'topic-1')
})

test('collectGenerationMemoryContext preserves stage-local history and cross-stage anchors', () => {
  const memory: TopicGenerationMemory = {
    schemaVersion: 'generation-memory-v1',
    topicId: 'topic-1',
    updatedAt: '2026-04-03T00:00:00.000Z',
    topicSnapshot: {
      title: 'World Models',
    },
    passRecords: {
      stage1r1: createPassRecord({
        passId: 'stage-pass-1',
        templateId: 'topic.researchOrchestration',
        subjectType: 'stage',
        subjectId: 'research-stage:1:round:1',
        summary: 'Stage 1 established the baseline research questions.',
        updatedAt: '2026-04-03T00:01:00.000Z',
      }),
      stage1r2: createPassRecord({
        passId: 'stage-pass-2',
        templateId: 'topic.researchOrchestration',
        subjectType: 'stage',
        subjectId: 'research-stage:1:round:2',
        summary: 'Stage 1 tightened the baseline and filtered weak leads.',
        updatedAt: '2026-04-03T00:02:00.000Z',
      }),
      stage2r1: createPassRecord({
        passId: 'stage-pass-3',
        templateId: 'topic.researchOrchestration',
        subjectType: 'stage',
        subjectId: 'research-stage:2:round:1',
        summary: 'Stage 2 opened the evaluation branch.',
        updatedAt: '2026-04-03T00:03:00.000Z',
      }),
      topicHero: createPassRecord({
        passId: 'topic-pass-1',
        templateId: 'topic.hero',
        subjectType: 'topic',
        subjectId: 'topic-1',
        summary: 'The topic thesis now links planning, memory, and evaluation.',
        updatedAt: '2026-04-03T00:04:00.000Z',
      }),
    },
  }

  const context = collectGenerationMemoryContext(memory, {
    subjectType: 'stage',
    subjectId: 'research-stage:1:round:9',
    limit: 4,
  })

  assert.equal(context.sameSubjectPasses.length, 2)
  assert.ok(
    context.sameSubjectPasses.every((record) => record.subjectId.startsWith('research-stage:1:')),
  )
  assert.ok(context.recentPasses.some((record) => record.subjectId === 'research-stage:2:round:1'))
  assert.ok(
    [...context.recentPasses, ...context.anchorPasses].some(
      (record) => record.subjectType === 'topic',
    ),
  )
})

test('research judgments are extracted and merged back into reusable context', () => {
  const baseContext = collectGenerationMemoryContext(
    {
      schemaVersion: 'generation-memory-v1',
      topicId: 'topic-1',
      updatedAt: '2026-04-03T00:00:00.000Z',
      topicSnapshot: null,
      passRecords: {
        base: createPassRecord(),
      },
    },
    {
      subjectType: 'node',
      subjectId: 'node-1',
      limit: 8,
    },
  )

  const extracted = judgmentTesting.extractResearchJudgmentsFromPass(
    'topic-1',
    createPassRecord({
      passId: 'pass-4',
      templateId: 'article.crossPaper',
      summary: 'Two paper families converge on the same planning bottleneck.',
      output: {
        headline: 'Two paper families converge on the same planning bottleneck.',
        standfirst: 'The node now distinguishes latent-video models from simulator-first systems.',
        whyItMatters:
          'The distinction changes which evidence should be trusted when evaluating robustness.',
        nextQuestion: 'Which benchmark still breaks both families?',
        bullets: ['Do not present simulator gains as proof of open-world generalization.'],
        points: [
          {
            label: 'Comparison',
            detail: 'Latent-video systems scale faster, but simulator-first systems expose failures earlier.',
          },
        ],
      },
      updatedAt: '2026-04-03T00:20:00.000Z',
    }),
  )

  assert.ok(extracted.some((judgment) => judgment.kind === 'finding'))
  assert.ok(extracted.some((judgment) => judgment.kind === 'comparison'))
  assert.ok(extracted.some((judgment) => judgment.kind === 'open-question'))
  assert.ok(extracted.some((judgment) => judgment.kind === 'error-correction'))

  const state: TopicResearchJudgmentState = {
    schemaVersion: 'generation-judgments-v1',
    topicId: 'topic-1',
    updatedAt: '2026-04-03T00:00:00.000Z',
    judgments: [],
  }

  const nextState = judgmentTesting.upsertResearchJudgmentsInState(state, extracted)
  const judgmentContext = judgmentTesting.collectResearchJudgmentContext(nextState, {
    subjectType: 'node',
    subjectId: 'node-1',
    limit: 8,
  })
  const merged = judgmentTesting.mergeGenerationMemoryContext(baseContext, judgmentContext)

  assert.ok(judgmentContext.sameScopeJudgments.length > 0)
  assert.ok(
    judgmentContext.openQuestions.some((entry) =>
      entry.includes('Which benchmark still breaks both families'),
    ),
  )
  assert.ok(
    merged.reviewerWatchpoints.some((entry) =>
      entry.includes('Do not present simulator gains as proof of open-world generalization'),
    ),
  )
  assert.ok(
    merged.evidenceWatchpoints.some((entry) =>
      entry.includes('changes which evidence should be trusted'),
    ),
  )
})

test('research judgments build evolution chains when a later judgment refines or challenges an earlier one', () => {
  const state: TopicResearchJudgmentState = {
    schemaVersion: 'generation-judgments-v1',
    topicId: 'topic-1',
    updatedAt: '2026-04-03T00:00:00.000Z',
    judgments: [
      {
        id: 'old-judgment',
        topicId: 'topic-1',
        subjectType: 'node',
        scopeId: 'node-1',
        kind: 'finding',
        content: 'Planning fidelity proves the system is broadly autonomous.',
        confidence: 'medium',
        sourcePassId: 'pass-old',
        sourceTemplateId: 'article.node',
        language: 'zh',
        createdAt: '2026-04-03T00:00:00.000Z',
      },
    ],
  }

  const refined = judgmentTesting.upsertResearchJudgmentsInState(state, [
    {
      id: 'new-judgment',
      topicId: 'topic-1',
      subjectType: 'node',
      scopeId: 'node-1',
      kind: 'finding',
      content: 'Planning fidelity is better supported than claims of broad autonomy.',
      confidence: 'high',
      sourcePassId: 'pass-new',
      sourceTemplateId: 'article.node',
      language: 'zh',
      createdAt: '2026-04-03T01:00:00.000Z',
    },
    {
      id: 'counter-judgment',
      topicId: 'topic-1',
      subjectType: 'node',
      scopeId: 'node-1',
      kind: 'finding',
      content: 'Planning fidelity does not prove the system is broadly autonomous.',
      confidence: 'high',
      sourcePassId: 'pass-counter',
      sourceTemplateId: 'article.reviewer',
      language: 'zh',
      createdAt: '2026-04-03T02:00:00.000Z',
    },
  ])

  const oldJudgment = refined.judgments.find((item) => item.id === 'old-judgment')
  const counterJudgment = refined.judgments.find((item) => item.id === 'counter-judgment')
  const context = judgmentTesting.collectResearchJudgmentContext(refined, {
    subjectType: 'node',
    subjectId: 'node-1',
    limit: 8,
  })

  assert.equal(oldJudgment?.supersededBy, 'new-judgment')
  assert.equal(counterJudgment?.contradictsWith, 'old-judgment')
  assert.ok(
    context.evolutionChains.some((entry) => entry.includes('Refined:') || entry.includes('Tension:')),
  )
})
