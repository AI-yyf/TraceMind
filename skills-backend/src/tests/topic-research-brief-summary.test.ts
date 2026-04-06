import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../routes/topics'

test('buildResearchBriefSessionSummary folds latest guidance into the brief narrative', () => {
  const summary = __testing.buildResearchBriefSessionSummary({
    topic: {
      nameZh: 'TraceMind',
      summary: '',
      description: '',
      focusLabel: '',
    },
    report: null,
    pipeline: {
      lastRun: null,
      currentStage: null,
      continuityThreads: [],
      globalOpenQuestions: [],
    } as any,
    generationContext: {
      continuityThreads: [],
      judgmentLedger: [],
      openQuestions: [],
    } as any,
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
    world: {
      summary: {
        thesis: '',
        currentFocus: '',
        continuity: '',
        dominantQuestion: '',
        agendaHeadline: '',
      },
      claims: [],
      questions: [],
      agenda: [],
    } as any,
    guidance: {
      latestApplication: {
        appliedAt: '2026-04-03T10:00:00.000Z',
        stageIndex: 2,
        summary: 'The latest pass tightened the mainline around world-model evidence.',
        directives: [],
      },
      summary: {
        activeDirectiveCount: 1,
        acceptedDirectiveCount: 1,
        deferredDirectiveCount: 0,
        latestDirective: 'Keep the next pass on the current mainline.',
        focusHeadline: 'Stay on the current mainline nodes.',
        styleHeadline: 'Write like a serious research essay, not a generic AI recap.',
        challengeHeadline: '',
        latestAppliedSummary: 'The latest pass tightened the mainline around world-model evidence.',
        latestAppliedAt: '2026-04-03T10:00:00.000Z',
        latestAppliedDirectiveCount: 1,
      },
      directives: [],
    } as any,
  })

  assert.equal(summary.currentFocus, 'Stay on the current mainline nodes.')
  assert.match(summary.continuity, /mainline/i)
  assert.ok(summary.researchMomentum.some((line) => /mainline/i.test(line)))
  assert.match(summary.lastResearchMove, /mainline/i)
  assert.equal(
    summary.conversationStyle,
    'Write like a serious research essay, not a generic AI recap.',
  )
  assert.equal(summary.lastUserIntent, 'Keep the next pass on the current mainline.')
})
