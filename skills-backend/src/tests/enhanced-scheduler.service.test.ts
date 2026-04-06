import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import type { StageTaskProgress } from '../services/enhanced-scheduler'
import { __testing, enhancedTaskScheduler } from '../services/enhanced-scheduler'
import type { ResearchRunReport } from '../services/topics/research-report'

function buildProgress(
  overrides: Partial<StageTaskProgress> = {},
): StageTaskProgress {
  return {
    taskId: 'topic-research:topic-1',
    topicId: 'topic-1',
    topicName: 'Autonomous Driving World Models',
    researchMode: 'duration',
    durationHours: 1,
    currentStage: 1,
    totalStages: 5,
    stageProgress: 100,
    currentStageRuns: 0,
    currentStageTargetRuns: 0,
    stageRunMap: {},
    totalRuns: 1,
    successfulRuns: 0,
    failedRuns: 1,
    lastRunAt: '2026-04-02T12:26:56.246Z',
    lastRunResult: 'failed',
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    startedAt: '2026-04-02T12:18:02.833Z',
    deadlineAt: '2026-04-02T13:18:02.833Z',
    completedAt: '2026-04-02T12:26:56.246Z',
    activeSessionId: null,
    completedStageCycles: 0,
    currentStageStalls: 0,
    latestSummary: 'args.orchestration.nodeActions is not iterable',
    status: 'paused',
    ...overrides,
  }
}

function buildReport(
  overrides: Partial<ResearchRunReport> = {},
): ResearchRunReport {
  return {
    schemaVersion: 'topic-research-report-v1',
    reportId: 'research-1775132282833',
    taskId: 'topic-research:topic-1',
    topicId: 'topic-1',
    topicName: 'Autonomous Driving World Models',
    researchMode: 'duration',
    trigger: 'manual',
    status: 'paused',
    durationHours: 1,
    startedAt: '2026-04-02T12:18:02.833Z',
    deadlineAt: '2026-04-02T13:18:02.833Z',
    completedAt: '2026-04-02T12:26:56.246Z',
    updatedAt: '2026-04-02T13:30:35.685Z',
    currentStage: 1,
    totalStages: 5,
    completedStageCycles: 0,
    totalRuns: 1,
    successfulRuns: 0,
    failedRuns: 1,
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    latestStageSummary: 'args.orchestration.nodeActions is not iterable',
    headline: '执行层故障与证据链断裂：自动驾驶世界模型研究在Stage 1遇阻',
    dek: '连续执行失败暴露编排层契约破裂与数据索引污染，理论框架悬浮而证据层错位。',
    summary: '本轮研究在 Stage 1 遭遇系统性执行故障，但这份报告仍然是面向用户整理过的研究回执。',
    paragraphs: [
      '本轮研究周期在 Stage 1 连续失败，暴露了技术契约与索引数据的双重问题。',
      '在修复编排层之前，不应继续把未校验的技术叙事包装成正常推进。',
    ],
    keyMoves: ['诊断编排层故障根源'],
    openQuestions: ['应先修复执行层还是先重建证据索引？'],
    latestNodeActions: [],
    ...overrides,
  }
}

test('scheduler keeps a renderable stored report instead of replacing it with fallback copy', () => {
  const progress = buildProgress()
  const storedReport = buildReport()
  const fallbackReport = buildReport({
    reportId: 'report-fallback',
    headline: '1 小时 研究已暂停',
    dek: 'args.orchestration.nodeActions is not iterable',
    summary: 'Fallback summary',
    paragraphs: ['Fallback paragraph'],
  })

  assert.equal(
    __testing.shouldPreferFallbackResearchReportState({
      progress,
      report: storedReport,
      active: false,
      fallback: fallbackReport,
    }),
    false,
  )
})

test('heuristic fallback orchestration groups overlapping papers into a shared node line', () => {
  const orchestration = __testing.buildHeuristicFallbackOrchestration({
    topic: {
      language: 'en',
    },
    stage: {
      order: 1,
      name: 'Problem Framing',
      nameEn: 'Problem Framing',
    },
    existingNodes: [],
    candidatePapers: [
      {
        id: 'paper-a',
        title: 'Planning World Models for Closed-Loop Driving',
        titleZh: 'Planning World Models for Closed-Loop Driving',
        titleEn: 'Planning World Models for Closed-Loop Driving',
        summary:
          'Builds a planning-oriented world model and evaluates it in closed-loop autonomous driving.',
        explanation:
          'The paper focuses on planning utility, closed-loop evidence, and long-horizon decision quality.',
        coverPath: null,
        figures: [],
      },
      {
        id: 'paper-b',
        title: 'Closed-Loop Planning with Latent World Models',
        titleZh: 'Closed-Loop Planning with Latent World Models',
        titleEn: 'Closed-Loop Planning with Latent World Models',
        summary:
          'Studies latent world models for planning and closed-loop trajectory execution.',
        explanation:
          'The evidence centers on planning stability, latent dynamics, and closed-loop outcomes.',
        coverPath: null,
        figures: [],
      },
      {
        id: 'paper-c',
        title: 'Video Diffusion for Driving Simulation',
        titleZh: 'Video Diffusion for Driving Simulation',
        titleEn: 'Video Diffusion for Driving Simulation',
        summary:
          'Explores diffusion-based video generation for simulation-centric data augmentation.',
        explanation:
          'The paper emphasizes video synthesis and simulation realism instead of planning control.',
        coverPath: null,
        figures: [],
      },
    ],
  })

  assert.ok(orchestration.nodeActions.length >= 2)
  assert.ok(orchestration.nodeActions.some((action) => action.paperIds.length > 1))
  assert.ok(orchestration.openQuestions.length > 0)
})
test('scheduler stop clears stale active session handles so a new duration run can start immediately', async () => {
  const topicId = `scheduler-stop-${Date.now()}`
  const taskId = `topic-research:${topicId}`
  const schedulerState = enhancedTaskScheduler as unknown as {
    tasks: Map<string, { config: Record<string, unknown>; task: { stop: () => void } }>
    progress: Map<string, StageTaskProgress>
    executionHistory: Map<string, unknown>
    activeSessions: Map<
      string,
      {
        sessionId: string
        source: 'manual' | 'scheduled'
        startedAt: string
        deadlineAt: string
        promise: Promise<void>
      }
    >
  }

  const config = {
    id: taskId,
    name: 'Scheduler stop regression',
    cronExpression: '0 3 * * *',
    enabled: false,
    topicId,
    action: 'discover',
    researchMode: 'duration',
    options: {
      durationHours: 1,
      cycleDelayMs: 250,
    },
  }

  const progress = buildProgress({
    taskId,
    topicId,
    topicName: 'Scheduler stop regression',
    successfulRuns: 0,
    failedRuns: 0,
    totalRuns: 0,
    lastRunAt: null,
    lastRunResult: null,
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    completedAt: null,
    activeSessionId: 'research-stale-session',
    latestSummary: 'Current run is being stopped for restart.',
    status: 'active',
  })

  schedulerState.tasks.set(taskId, {
    config,
    task: {
      stop() {},
    },
  })
  schedulerState.progress.set(taskId, progress)
  schedulerState.activeSessions.set(taskId, {
    sessionId: 'research-stale-session',
    source: 'manual',
    startedAt: progress.startedAt ?? new Date().toISOString(),
    deadlineAt: progress.deadlineAt ?? new Date(Date.now() + 60_000).toISOString(),
    promise: new Promise(() => {}),
  })

  try {
    const result = await enhancedTaskScheduler.stopTopicResearchSession(topicId)

    assert.equal(result.active, false)
    assert.equal(result.progress?.status, 'paused')
    assert.equal(result.progress?.activeSessionId, null)
    assert.equal(schedulerState.activeSessions.has(taskId), false)
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 80))
    schedulerState.tasks.delete(taskId)
    schedulerState.progress.delete(taskId)
    schedulerState.executionHistory.delete(taskId)
    schedulerState.activeSessions.delete(taskId)
    await prisma.systemConfig.deleteMany({
      where: {
        OR: [
          { key: `task-progress:${taskId}` },
          { key: `topic:${topicId}:research-report` },
          { key: `topic:session-memory:v1:${topicId}` },
        ],
      },
    })
  }
})

test('scheduler still falls back when the stored report is missing key renderable fields', () => {
  const progress = buildProgress()
  const incompleteReport = buildReport({
    headline: '',
    dek: '',
    summary: '',
    paragraphs: [],
  })

  assert.equal(
    __testing.shouldPreferFallbackResearchReportState({
      progress,
      report: incompleteReport,
      active: false,
      fallback: buildReport({
        reportId: 'report-fallback',
        headline: '1 小时 研究已暂停',
        dek: 'Fallback dek',
        summary: 'Fallback summary',
        paragraphs: ['Fallback paragraph'],
      }),
    }),
    true,
  )
})

test('scheduler prefers fallback state when a zero-yield report is dominated by stale operational noise', () => {
  const progress = buildProgress({
    latestSummary: '本轮研究在执行编排层遇到内部故障，系统保留了当前主题主线与证据状态，等待下一次启动后继续收束。',
  })
  const noisyReport = buildReport({
    summary: '17篇关联论文经核查与自动驾驶无关，当前状态为执行层故障与证据层断裂。',
    paragraphs: [
      'Unknown topic id: topic-1',
      'args.orchestration.nodeActions is not iterable',
    ],
    keyMoves: ['隔离17篇无关论文的数据污染'],
  })
  const fallbackReport = buildReport({
    reportId: 'report-fallback',
    headline: '1 小时研究已暂停',
    dek: '系统保留当前主线与证据状态，等待下一次启动继续收束。',
    summary: 'Fallback summary',
    paragraphs: ['Fallback paragraph'],
  })

  assert.equal(
    __testing.shouldPreferFallbackResearchReportState({
      progress,
      report: noisyReport,
      active: false,
      fallback: fallbackReport,
    }),
    true,
  )
})

test('scheduler sanitizes raw internal research errors before surfacing them to the UI', () => {
  assert.equal(
    __testing.sanitizeResearchFacingSummary('args.orchestration.nodeActions is not iterable'),
    '本轮研究在执行编排层遇到内部故障，系统保留了当前主题主线与证据状态，等待下一次启动后继续收束。',
  )

  assert.equal(
    __testing.sanitizeResearchFacingSummary('The stage narrative is still converging around the strongest evidence.'),
    'The stage narrative is still converging around the strongest evidence.',
  )
})

test('duration research decision advances when orchestration closes the current stage', () => {
  const decision = __testing.buildDurationResearchDecision({
    currentStage: 2,
    totalStages: 4,
    currentStageStalls: 1,
    completedStageCycles: 0,
    stageStallLimit: 3,
    cycle: {
      discovered: 4,
      admitted: 2,
      contentsGenerated: 2,
      shouldAdvanceStage: true,
      stageSummary: 'Stage 2 has enough evidence to advance.',
    },
  })

  assert.deepEqual(
    {
      action: decision.action,
      reason: decision.reason,
      nextStage: decision.nextStage,
      stallCountAfter: decision.stallCountAfter,
      completedStageCycles: decision.completedStageCycles,
    },
    {
      action: 'advance',
      reason: 'orchestration',
      nextStage: 3,
      stallCountAfter: 0,
      completedStageCycles: 0,
    },
  )
})

test('duration research decision resets the sweep after repeated stalls on the final stage', () => {
  const decision = __testing.buildDurationResearchDecision({
    currentStage: 5,
    totalStages: 5,
    currentStageStalls: 2,
    completedStageCycles: 1,
    stageStallLimit: 3,
    cycle: {
      discovered: 0,
      admitted: 0,
      contentsGenerated: 0,
      shouldAdvanceStage: false,
      stageSummary: 'Stage 5 is not improving.',
    },
  })

  assert.deepEqual(
    {
      action: decision.action,
      reason: decision.reason,
      nextStage: decision.nextStage,
      stallCountAfter: decision.stallCountAfter,
      completedStageCycles: decision.completedStageCycles,
    },
    {
      action: 'cycle-reset',
      reason: 'stall-limit',
      nextStage: 1,
      stallCountAfter: 0,
      completedStageCycles: 2,
    },
  )
})
