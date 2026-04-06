import assert from 'node:assert/strict'
import test from 'node:test'

import { buildResearchPipelineContext, type ResearchPipelineState } from '../services/topics/research-pipeline'

test('buildResearchPipelineContext filters legacy english no-admission noise from summaries and continuity threads', () => {
  const state: ResearchPipelineState = {
    schemaVersion: 'research-pipeline-v1',
    topicId: 'topic-1',
    updatedAt: '2026-04-03T10:00:00.000Z',
    lastRun: {
      timestamp: '2026-04-03T10:00:00.000Z',
      stageIndex: 1,
      roundIndex: 2,
      stageSummary: '围绕已有证据继续校准节点判断。',
      nodeActions: [
        {
          action: 'update',
          nodeId: 'node-1',
          title: '证据收束',
          rationale: '补强节点判断与论文归纳的一致性。',
        },
      ],
    },
    history: [
      {
        timestamp: '2026-04-03T09:30:00.000Z',
        stageIndex: 1,
        roundIndex: 1,
        stageSummary:
          'No new papers were admitted in this round, so the stage remains in evidence consolidation mode.',
      },
      {
        timestamp: '2026-04-03T10:00:00.000Z',
        stageIndex: 1,
        roundIndex: 2,
        stageSummary: '围绕已有证据继续校准节点判断。',
        nodeActions: [
          {
            action: 'update',
            nodeId: 'node-1',
            title: '证据收束',
            rationale: '补强节点判断与论文归纳的一致性。',
          },
        ],
      },
    ],
    stages: {
      '1': {
        timestamp: '2026-04-03T10:00:00.000Z',
        stageIndex: 1,
        roundIndex: 2,
        stageSummary: '围绕已有证据继续校准节点判断。',
      },
    },
  }

  const context = buildResearchPipelineContext(state, {
    stageIndex: 1,
    nodeId: 'node-1',
  })

  assert.equal(
    context.recentHistory.some((entry) => /No new papers were admitted/iu.test(entry.stageSummary)),
    false,
  )
  assert.equal(
    context.continuityThreads.some((entry) => /No new papers were admitted/iu.test(entry)),
    false,
  )
  assert.equal(
    context.continuityThreads.some((entry) => /围绕已有证据继续校准节点判断/u.test(entry)),
    true,
  )
  assert.equal(
    context.subjectFocus.relatedNodeActions.some((entry) => /补强节点判断/u.test(entry)),
    true,
  )
})

test('buildResearchPipelineContext preserves duration-stage decisions for downstream prompting', () => {
  const state: ResearchPipelineState = {
    schemaVersion: 'research-pipeline-v1',
    topicId: 'topic-2',
    updatedAt: '2026-04-03T11:00:00.000Z',
    lastRun: {
      timestamp: '2026-04-03T11:00:00.000Z',
      stageIndex: 2,
      roundIndex: 4,
      stageSummary: 'Stage 2 consolidated cross-paper evidence before deciding whether to advance.',
      shouldAdvanceStage: false,
      durationDecision: {
        action: 'stay',
        reason: 'await-more-evidence',
        currentStage: 2,
        nextStage: 2,
        stallCountBefore: 1,
        stallCountAfter: 2,
        stallLimit: 3,
        completedStageCycles: 0,
        summary:
          'Stage 2 remains open while the system consolidates evidence and waits for a stronger basis to advance.',
        rationale:
          'The current narrative still needs a cleaner cross-paper comparison before the next stage.',
      },
    },
    history: [
      {
        timestamp: '2026-04-03T11:00:00.000Z',
        stageIndex: 2,
        roundIndex: 4,
        stageSummary: 'Stage 2 consolidated cross-paper evidence before deciding whether to advance.',
        shouldAdvanceStage: false,
        durationDecision: {
          action: 'stay',
          reason: 'await-more-evidence',
          currentStage: 2,
          nextStage: 2,
          stallCountBefore: 1,
          stallCountAfter: 2,
          stallLimit: 3,
          completedStageCycles: 0,
          summary:
            'Stage 2 remains open while the system consolidates evidence and waits for a stronger basis to advance.',
          rationale:
            'The current narrative still needs a cleaner cross-paper comparison before the next stage.',
        },
      },
    ],
    stages: {
      '2': {
        timestamp: '2026-04-03T11:00:00.000Z',
        stageIndex: 2,
        roundIndex: 4,
        stageSummary: 'Stage 2 consolidated cross-paper evidence before deciding whether to advance.',
        shouldAdvanceStage: false,
        durationDecision: {
          action: 'stay',
          reason: 'await-more-evidence',
          currentStage: 2,
          nextStage: 2,
          stallCountBefore: 1,
          stallCountAfter: 2,
          stallLimit: 3,
          completedStageCycles: 0,
          summary:
            'Stage 2 remains open while the system consolidates evidence and waits for a stronger basis to advance.',
          rationale:
            'The current narrative still needs a cleaner cross-paper comparison before the next stage.',
        },
      },
    },
  }

  const context = buildResearchPipelineContext(state, {
    stageIndex: 2,
  })

  assert.equal(context.currentStage?.durationDecision?.reason, 'await-more-evidence')
  assert.equal(context.currentStage?.durationDecision?.stallCountAfter, 2)
  assert.equal(
    context.continuityThreads.some((entry) =>
      /remains open while the system consolidates evidence/iu.test(entry),
    ),
    true,
  )
})
