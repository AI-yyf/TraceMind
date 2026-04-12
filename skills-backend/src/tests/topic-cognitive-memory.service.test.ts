import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as topicCognitiveTesting } from '../services/topics/topic-cognitive-memory'

test('topic cognitive memory separates project, feedback, and reference memory lanes', () => {
  const pack = topicCognitiveTesting.buildTopicCognitiveMemory({
    generationContext: {
      topicSnapshot: null,
      recentPasses: [],
      sameSubjectPasses: [],
      anchorPasses: [],
      artifactIndex: [
        {
          id: 'node:node-1',
          kind: 'node',
          entityId: 'node-1',
          title: 'Planning Fidelity Node',
          headline: 'Planning fidelity became the real center of gravity.',
          summary: 'This node article now frames the topic around robust planning evidence.',
          standfirst: 'The node article rewrote the local thesis around planning fidelity.',
          keyArguments: ['Planning fidelity is better grounded than broad autonomy claims.'],
          stageIndex: 2,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        {
          id: 'paper:paper-1',
          kind: 'paper',
          entityId: 'paper-1',
          title: 'Benchmark Pressure Test',
          headline: 'Benchmark Pressure Test',
          summary: 'The paper article explains where the current planning story still breaks.',
          standfirst: 'A single benchmark still exposes the weak edge of the narrative.',
          keyArguments: ['The benchmark failure is still the cleanest falsification handle.'],
          stageIndex: 2,
          updatedAt: '2026-04-04T00:05:00.000Z',
        },
      ],
      judgmentLedger: ['The topic now centers on planning fidelity rather than raw scale.'],
      openQuestions: ['Which benchmark still breaks the planning story?'],
      reviewerWatchpoints: ['Do not conflate simulator gains with open-world robustness.'],
      evidenceWatchpoints: ['Evidence still concentrates on narrow benchmarks.'],
      continuityThreads: ['Stage 2 tightened the comparison frame.'],
      evolutionChains: ['Refined: "Old planning claim" -> "Planning fidelity is the stronger claim."'],
    },
    sessionMemory: {
      updatedAt: '2026-04-04T00:00:00.000Z',
      initializedAt: '2026-04-03T00:00:00.000Z',
      lastCompactedAt: '2026-04-04T00:00:00.000Z',
      summary: {
        currentFocus: 'Keep the topic centered on planning fidelity.',
        continuity: 'The current line extends the Stage 2 comparison instead of restarting.',
        establishedJudgments: ['Planning fidelity is better supported than claims of broad autonomy.'],
        openQuestions: ['What evidence would falsify the current planning story?'],
        researchMomentum: ['The latest cycle absorbed new benchmark evidence.'],
        conversationStyle: 'Answer like the same scholar who wrote the topic.',
        lastResearchMove: 'Merged two scaling papers into a tighter comparison node.',
        lastUserIntent: 'Explain the weakest unresolved doubt.',
      },
      recentEvents: [],
      recalledEvents: [
        {
          id: 'evt-1',
          kind: 'research-cycle',
          headline: 'Benchmark pressure test',
          summary: 'A recalled event about the benchmark that still breaks the story.',
          createdAt: '2026-04-04T00:10:00.000Z',
        },
      ],
      recallQueryTokens: ['benchmark', 'story'],
    },
    guidance: {
      schemaVersion: 'topic-guidance-ledger-v1',
      topicId: 'topic-1',
      updatedAt: '2026-04-04T00:00:00.000Z',
      directives: [],
      latestApplication: {
        appliedAt: '2026-04-04T00:00:00.000Z',
        stageIndex: 2,
        summary: 'Stage 2 kept the prose tighter and more skeptical.',
        directives: [],
      },
      summary: {
        activeDirectiveCount: 1,
        acceptedDirectiveCount: 1,
        deferredDirectiveCount: 0,
        latestDirective: 'Write more skeptically.',
        focusHeadline: '',
        styleHeadline: 'Write more skeptically.',
        challengeHeadline: '',
        latestAppliedSummary: 'Stage 2 kept the prose tighter and more skeptical.',
        latestAppliedAt: '2026-04-04T00:00:00.000Z',
        latestAppliedDirectiveCount: 1,
      },
    },
    report: {
      schemaVersion: 'topic-research-report-v1',
      reportId: 'report-1',
      taskId: 'task-1',
      topicId: 'topic-1',
      topicName: 'Topic',
      researchMode: 'duration',
      trigger: 'manual',
      status: 'running',
      durationHours: 1,
      startedAt: '2026-04-04T00:00:00.000Z',
      deadlineAt: '2026-04-04T01:00:00.000Z',
      completedAt: null,
      updatedAt: '2026-04-04T00:20:00.000Z',
      currentStage: 2,
      totalStages: 4,
      completedStageCycles: 1,
      totalRuns: 2,
      successfulRuns: 2,
      failedRuns: 0,
      discoveredPapers: 8,
      admittedPapers: 4,
      generatedContents: 3,
      latestStageSummary: 'Stage 2 kept testing planning fidelity.',
      headline: 'Stage 2 tightened the comparison frame',
      dek: 'Research dek',
      summary: 'The current run keeps tightening the comparison frame.',
      paragraphs: [],
      keyMoves: ['Separated planning fidelity from broad autonomy claims.'],
      openQuestions: ['Which benchmark invalidates the current framing?'],
      latestNodeActions: [],
    },
    world: null,
  })

  assert.equal(pack.projectMemories.length > 0, true)
  assert.equal(pack.feedbackMemories.length > 0, true)
  assert.equal(pack.referenceMemories.length > 0, true)
  assert.equal(pack.projectMemories.some((item) => item.summary.includes('planning fidelity')), true)
  assert.equal(pack.feedbackMemories.some((item) => item.summary.includes('simulator gains')), true)
  assert.equal(pack.referenceMemories.some((item) => item.summary.includes('benchmark')), true)
  assert.equal(pack.projectMemories.some((item) => item.title.includes('Node Article')), true)
  assert.equal(pack.referenceMemories.some((item) => item.title.includes('Paper Article')), true)
  assert.equal(pack.projectMemories.some((item) => item.title.includes('Judgment Evolution')), true)
})
