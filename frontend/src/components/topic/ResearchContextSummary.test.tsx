// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { TopicResearchBrief } from '@/types/alpha'
import { ResearchContextSummary } from './ResearchContextSummary'

function renderWithI18n(node: ReactNode) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(<I18nProvider>{node}</I18nProvider>)
}

function makeBrief(): TopicResearchBrief {
  return {
    topicId: 'topic-1',
    session: {
      task: null,
      progress: {
        taskId: 'task-1',
        topicId: 'topic-1',
        topicName: 'Topic',
        researchMode: 'duration',
        durationHours: 4,
        currentStage: 2,
        totalStages: 4,
        stageProgress: 0.5,
        currentStageRuns: 1,
        currentStageTargetRuns: 2,
        stageRunMap: {},
        totalRuns: 3,
        successfulRuns: 3,
        failedRuns: 0,
        lastRunAt: null,
        lastRunResult: 'success',
        discoveredPapers: 5,
        admittedPapers: 2,
        generatedContents: 1,
        figureCount: 3,
        tableCount: 1,
        formulaCount: 0,
        figureGroupCount: 1,
        startedAt: null,
        deadlineAt: null,
        completedAt: null,
        activeSessionId: null,
        completedStageCycles: 0,
        currentStageStalls: 0,
        latestSummary: 'The session headline fallback.',
        status: 'paused',
      },
      report: {
        schemaVersion: 'v1',
        reportId: 'report-1',
        taskId: 'task-1',
        topicId: 'topic-1',
        topicName: 'Topic',
        researchMode: 'duration',
        trigger: 'manual',
        status: 'paused',
        durationHours: 4,
        startedAt: '2026-04-04T00:00:00.000Z',
        deadlineAt: null,
        completedAt: null,
        updatedAt: '2026-04-04T00:00:00.000Z',
        currentStage: 2,
        totalStages: 4,
        completedStageCycles: 0,
        totalRuns: 3,
        successfulRuns: 3,
        failedRuns: 0,
        discoveredPapers: 5,
        admittedPapers: 2,
        generatedContents: 1,
        latestStageSummary: 'Latest stage summary.',
        headline: 'Report headline wins only when no duration decision exists.',
        dek: '',
        summary: '',
        paragraphs: [],
        keyMoves: [],
        openQuestions: [],
        latestNodeActions: [],
      },
      active: false,
      strategy: {
        cycleDelayMs: 14_400_000,
        stageStallLimit: 2,
        reportPasses: 1,
        currentStageStalls: 0,
      },
    },
    pipeline: {
      updatedAt: null,
      lastRun: {
        timestamp: null,
        stageIndex: 2,
        roundIndex: 1,
        discovered: 2,
        admitted: 1,
        contentsGenerated: 1,
        stageSummary: '',
        shouldAdvanceStage: false,
        durationDecision: {
          action: 'stay',
          reason: 'await-more-evidence',
          currentStage: 2,
          nextStage: 2,
          madeProgress: false,
          stallCountBefore: 0,
          stallCountAfter: 1,
          stallLimit: 2,
          completedStageCycles: 0,
          summary: 'Fallback duration decision summary.',
          rationale: '',
        },
        openQuestions: [],
        nodeActions: [],
      },
      currentStage: {
        timestamp: null,
        stageIndex: 2,
        roundIndex: 1,
        discovered: 2,
        admitted: 1,
        contentsGenerated: 1,
        stageSummary: '',
        shouldAdvanceStage: false,
        durationDecision: {
          action: 'advance',
          reason: 'progress-made',
          currentStage: 2,
          nextStage: 3,
          madeProgress: true,
          stallCountBefore: 0,
          stallCountAfter: 0,
          stallLimit: 2,
          completedStageCycles: 0,
          summary: 'Stage 2 is ready to advance into stage 3.',
          rationale: '',
        },
        openQuestions: [],
        nodeActions: [],
      },
      recentHistory: [],
      globalOpenQuestions: [],
      continuityThreads: [],
      subjectFocus: {
        nodeId: null,
        paperIds: [],
        stageIndex: null,
        relatedHistory: [],
        relatedNodeActions: [],
      },
    },
    sessionMemory: {
      updatedAt: null,
      initializedAt: null,
      lastCompactedAt: null,
      summary: {
        currentFocus: 'Session memory focus.',
        continuity: '',
        establishedJudgments: [],
        openQuestions: [],
        researchMomentum: [],
        conversationStyle: '',
        lastResearchMove: 'Most recent research move.',
        lastUserIntent: '',
      },
      recentEvents: [],
    },
    world: {
      schemaVersion: 'v1',
      topicId: 'topic-1',
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
      language: 'en',
      summary: {
        thesis: 'The thesis should show only when current focus is absent.',
        currentFocus: 'Current world focus.',
        continuity: '',
        dominantQuestion: '',
        dominantCritique: '',
        agendaHeadline: '',
        maturity: 'forming',
      },
      stages: [],
      nodes: [],
      papers: [],
      claims: [],
      questions: [],
      critiques: [],
      agenda: [],
    },
    guidance: {
      schemaVersion: 'v1',
      topicId: 'topic-1',
      updatedAt: null,
      directives: [
        {
          id: 'directive-1',
          topicId: 'topic-1',
          sourceMessageId: 'message-1',
          messageKind: 'focus',
          scopeType: 'topic',
          scopeId: null,
          scopeLabel: 'Topic',
          directiveType: 'focus',
          instruction: 'Fallback directive instruction.',
          rationale: '',
          effectSummary: '',
          promptHint: '',
          strength: 'soft',
          status: 'accepted',
          appliesToRuns: 'next-run',
          lastAppliedAt: null,
          lastAppliedStageIndex: null,
          lastAppliedSummary: '',
          createdAt: '2026-04-04T00:00:00.000Z',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      latestApplication: {
        appliedAt: '2026-04-04T00:00:00.000Z',
        stageIndex: 2,
        summary: 'Latest absorbed guidance summary.',
        directives: [],
      },
      summary: {
        activeDirectiveCount: 1,
        acceptedDirectiveCount: 1,
        deferredDirectiveCount: 0,
        latestDirective: 'Summary fallback directive.',
        focusHeadline: '',
        styleHeadline: '',
        challengeHeadline: '',
        latestAppliedSummary: '',
        latestAppliedAt: null,
        latestAppliedDirectiveCount: 0,
      },
    },
    cognitiveMemory: {
      focus: '',
      continuity: '',
      conversationContract: '',
      projectMemories: [],
      feedbackMemories: [],
      referenceMemories: [],
    },
  }
}

describe('ResearchContextSummary', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('shows world focus, latest guidance application, and current duration decision in collapsed form', () => {
    renderWithI18n(<ResearchContextSummary brief={makeBrief()} />)

    expect(screen.getByTestId('research-context-summary-world')).toHaveTextContent('Current world focus.')
    expect(screen.getByTestId('research-context-summary-guidance')).toHaveTextContent(
      'Latest absorbed guidance summary.',
    )
    expect(screen.getByTestId('research-context-summary-calibration')).toHaveTextContent(
      'Stage 2 is ready to advance into stage 3.',
    )
  })

  it('renders only the available summary rows when parts of the brief are missing', () => {
    const brief = makeBrief()
    brief.world.summary.currentFocus = ''
    brief.guidance.latestApplication = null
    brief.guidance.summary.latestDirective = ''
    brief.guidance.directives = []
    brief.pipeline.currentStage = null
    brief.pipeline.lastRun = null

    renderWithI18n(<ResearchContextSummary brief={brief} />)

    expect(screen.getByTestId('research-context-summary-world')).toHaveTextContent(
      'The thesis should show only when current focus is absent.',
    )
    expect(screen.queryByTestId('research-context-summary-guidance')).not.toBeInTheDocument()
    expect(screen.getByTestId('research-context-summary-calibration')).toHaveTextContent(
      'Report headline wins only when no duration decision exists.',
    )
  })
})
