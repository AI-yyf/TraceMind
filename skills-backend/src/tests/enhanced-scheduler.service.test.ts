import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import type { StageTaskProgress } from '../services/enhanced-scheduler'
import {
  __testing,
  EnhancedTaskScheduler,
  enhancedTaskScheduler,
} from '../services/enhanced-scheduler'
import type { ResearchRunReport } from '../services/topics/research-report'
import { saveTopicResearchConfig } from '../services/topics/topic-research-config'

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
    figureCount: 0,
    tableCount: 0,
    formulaCount: 0,
    figureGroupCount: 0,
    startedAt: '2026-04-02T12:18:02.833Z',
    deadlineAt: '2026-04-02T13:18:02.833Z',
    completedAt: '2026-04-02T12:26:56.246Z',
    activeSessionId: null,
    completedStageCycles: 0,
    currentStageStalls: 0,
    latestSummary: 'args.orchestration.nodeActions is not iterable',
    status: 'paused',
    currentLensIndex: null,
    lensRotationHistory: [],
    lensStallCounts: {},
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

test('heuristic fallback orchestration splits autonomous-driving bridge papers into problem-based node lines', () => {
  const orchestration = __testing.buildHeuristicFallbackOrchestration({
    topic: {
      id: 'autonomous-driving',
      language: 'en',
    },
    stage: {
      order: 2,
      name: '2016.10-2017.03',
      nameEn: '2016.10-2017.03',
    },
    existingNodes: [],
    candidatePapers: [
      {
        id: 'paper-recovery-a',
        title: 'Virtual to Real Reinforcement Learning for Autonomous Driving',
        titleZh: 'Virtual to Real Reinforcement Learning for Autonomous Driving',
        titleEn: 'Virtual to Real Reinforcement Learning for Autonomous Driving',
        summary: 'Studies virtual-to-real transfer and reinforcement learning for closed-loop autonomous driving.',
        explanation: 'Focuses on simulation transfer, recovery behaviour, and intervention-efficient policy learning.',
        coverPath: null,
        figures: [],
      },
      {
        id: 'paper-recovery-b',
        title: 'Query-Efficient Imitation Learning for End-to-End Autonomous Driving',
        titleZh: 'Query-Efficient Imitation Learning for End-to-End Autonomous Driving',
        titleEn: 'Query-Efficient Imitation Learning for End-to-End Autonomous Driving',
        summary: 'Builds query-efficient imitation learning and recovery policies for end-to-end driving.',
        explanation: 'The paper keeps the same recovery-policy line while changing the data-collection loop.',
        coverPath: null,
        figures: [],
      },
      {
        id: 'paper-attention',
        title: 'Brain-Inspired Cognitive Model with Attention for Self-Driving Cars',
        titleZh: 'Brain-Inspired Cognitive Model with Attention for Self-Driving Cars',
        titleEn: 'Brain-Inspired Cognitive Model with Attention for Self-Driving Cars',
        summary: 'Introduces a cognitive map and attention mechanism for interpretable self-driving control.',
        explanation: 'Emphasizes attention, cognitive maps, and interpretability in end-to-end driving.',
        coverPath: null,
        figures: [],
      },
      {
        id: 'paper-event',
        title: 'DDD17: End-To-End DAVIS Driving Dataset',
        titleZh: 'DDD17: End-To-End DAVIS Driving Dataset',
        titleEn: 'DDD17: End-To-End DAVIS Driving Dataset',
        summary: 'Uses DAVIS event-camera signals to build an end-to-end driving dataset.',
        explanation: 'The work sits on the event-based and neuromorphic driving line rather than general control.',
        coverPath: null,
        figures: [],
      },
    ],
  })

  assert.ok(orchestration.nodeActions.length >= 3)
  assert.ok(
    orchestration.nodeActions.some(
      (action) =>
        /Recovery Policies and Simulation Transfer/u.test(action.titleEn) &&
        action.paperIds.length === 2,
    ),
  )
  assert.ok(
    orchestration.nodeActions.some((action) =>
      /Attention, Cognitive Maps, and Interpretable Driving/u.test(action.titleEn),
    ),
  )
  assert.ok(
    orchestration.nodeActions.some((action) =>
      /Event-based and Neuromorphic Driving/u.test(action.titleEn),
    ),
  )
  assert.match(orchestration.stageSummary, /problem-focused node lines/u)
})

test('scheduler estimates total stage capacity from the topic timeline instead of collapsing to one stored stage', () => {
  const totalStages = __testing.estimateTopicProgressTotalStages({
    topic: {
      createdAt: new Date('2026-04-09T00:00:00.000Z'),
      papers: [
        {
          published: new Date('2016-04-25T00:00:00.000Z'),
        },
      ],
    },
    existingStageCount: 1,
    windowMonths: 6,
  })

  assert.ok(totalStages >= 20)
})

test('scheduler surfaces a duration research blueprint that matches long-run paper and evidence targets', async () => {
  const topicId = `scheduler-strategy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  await prisma.topics.create({
    data: {
      id: topicId,
      nameZh: '长时研究策略测试主题',
      nameEn: 'Long-run Strategy Test Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  await saveTopicResearchConfig(topicId, {
    maxCandidatesPerStage: 200,
    discoveryQueryLimit: 500,
    maxPapersPerNode: 20,
    minPapersPerNode: 10,
    targetCandidatesBeforeAdmission: 150,
    highConfidenceThreshold: 0.75,
  })

  const scheduler = new EnhancedTaskScheduler()

  try {
    const state = await scheduler.getTopicResearchState(topicId)

    assert.deepEqual(state.strategy.targets, {
      stageCandidateBudget: 200,
      discoveryQueryBudget: 500,
      nodePaperTargetMin: 10,
      nodePaperTargetMax: 20,
      targetCandidatesBeforeAdmission: 200,
      highConfidenceThreshold: 0.75,
    })
    assert.ok(
      state.strategy.perspectives.some(
        (item) =>
          item.id === 'artifact-grounding' &&
          /figures, tables, formulas/i.test(item.mission),
      ),
    )
    assert.ok(
      state.strategy.qualityBars.some((line) =>
        /10-20 useful papers/i.test(line),
      ),
    )
    assert.ok(
      state.strategy.qualityBars.some((line) =>
        /publishable research articles/i.test(line),
      ),
    )
  } finally {
    await scheduler.stopTopicResearchSession(topicId).catch(() => {})
    await prisma.system_configs.deleteMany({
      where: {
        OR: [
          { key: `topic:${topicId}:research-report` },
          { key: `topic-research-config:v1:${topicId}` },
          { key: `topic:session-memory:v1:${topicId}` },
          { key: `task-progress:topic-research:${topicId}` },
          { key: `task:topic-research:${topicId}` },
        ],
      },
    })
    await prisma.topics.delete({
      where: { id: topicId },
    })
  }
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
    await prisma.system_configs.deleteMany({
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

test('scheduler resumes interrupted duration sessions from persisted progress during initialization', async () => {
  const topicId = `scheduler-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const taskId = `topic-research:${topicId}`
  const resumeSessionId = `resume-${Math.random().toString(36).slice(2, 8)}`
  const deadlineAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  await prisma.topics.create({
    data: {
      id: topicId,
      nameZh: '恢复测试主题',
      nameEn: 'Resume Test Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const progress = buildProgress({
    taskId,
    topicId,
    topicName: 'Resume Test Topic',
    successfulRuns: 1,
    failedRuns: 0,
    totalRuns: 1,
    lastRunAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    lastRunResult: 'success',
    completedAt: null,
    deadlineAt,
    activeSessionId: resumeSessionId,
    latestSummary: 'The session should continue after restart recovery.',
    status: 'active',
  })

  const task = {
    id: taskId,
    name: 'Resume Test Topic 30 天研究',
    cronExpression: '0 3 * * *',
    enabled: false,
    topicId,
    action: 'discover',
    researchMode: 'duration',
    options: {
      stageDurationDays: 30,
      durationHours: 30 * 24,
      cycleDelayMs: 5_000,
    },
  }

  await prisma.system_configs.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        key: `task-progress:${taskId}`,
        value: JSON.stringify(progress),
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        key: `task:${taskId}`,
        value: JSON.stringify(task),
        updatedAt: new Date(),
      },
    ],
  })

  const scheduler = new EnhancedTaskScheduler()

  try {
    const state = await scheduler.getTopicResearchState(topicId)
    const schedulerState = scheduler as unknown as {
      activeSessions: Map<
        string,
        {
          sessionId: string
        }
      >
    }

    assert.equal(state.active, true)
    assert.equal(state.progress?.status, 'active')
    assert.equal(state.progress?.activeSessionId, resumeSessionId)
    assert.equal(schedulerState.activeSessions.get(taskId)?.sessionId, resumeSessionId)
  } finally {
    await scheduler.stopTopicResearchSession(topicId)
    await prisma.system_configs.deleteMany({
      where: {
        OR: [
          { key: `task-progress:${taskId}` },
          { key: `task:${taskId}` },
          { key: `topic:${topicId}:research-report` },
          { key: `topic:session-memory:v1:${topicId}` },
        ],
      },
    })
    await prisma.topics.delete({
      where: { id: topicId },
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

// ============================================================================
// Lens Rotation Tests
// ============================================================================

const TEST_LENSES = [
  { id: 'core-mainline', label: 'Core Mainline', focus: 'problem' as const, prompts: ['core mechanism'] },
  { id: 'method-design', label: 'Method Design', focus: 'method' as const, prompts: ['architecture'] },
  { id: 'evidence-audit', label: 'Evidence Audit', focus: 'citation' as const, prompts: ['benchmark'] },
  { id: 'boundary-failure', label: 'Boundary and Failure', focus: 'merge' as const, prompts: ['failure mode'] },
]

test('rotateResearchLens returns null when lens rotation is not enabled (currentLensIndex is null)', () => {
  const progress = buildProgress({ currentLensIndex: null })
  const result = __testing.rotateResearchLens(TEST_LENSES, progress, 'cycle-complete')
  assert.equal(result, null)
})

test('rotateResearchLens rotates to next lens on cycle-complete', () => {
  const progress = buildProgress({ currentLensIndex: 0 })
  const result = __testing.rotateResearchLens(TEST_LENSES, progress, 'cycle-complete')

  assert.ok(result)
  assert.equal(result!.id, 'method-design')
  assert.equal(progress.currentLensIndex, 1)
  assert.equal(progress.lensRotationHistory.length, 1)
  assert.equal(progress.lensRotationHistory[0].lensId, 'method-design')
  assert.equal(progress.lensRotationHistory[0].reason, 'cycle-complete')
})

test('rotateResearchLens wraps around to first lens after reaching the end', () => {
  const progress = buildProgress({ currentLensIndex: 3 }) // Last lens
  const result = __testing.rotateResearchLens(TEST_LENSES, progress, 'cycle-complete')

  assert.ok(result)
  assert.equal(result!.id, 'core-mainline')
  assert.equal(progress.currentLensIndex, 0)
})

test('rotateResearchLens skips lenses that have stalled too many times', () => {
  const progress = buildProgress({
    currentLensIndex: 0,
    lensStallCounts: {
      'method-design': __testing.LENS_STALL_SKIP_THRESHOLD, // Should be skipped
    },
  })

  const result = __testing.rotateResearchLens(TEST_LENSES, progress, 'cycle-complete')

  assert.ok(result)
  assert.equal(result!.id, 'evidence-audit') // Skipped method-design
  assert.equal(progress.currentLensIndex, 2)
})

test('rotateResearchLens resets stall counts when all lenses have stalled', () => {
  const progress = buildProgress({
    currentLensIndex: 0,
    lensStallCounts: {
      'core-mainline': __testing.LENS_STALL_SKIP_THRESHOLD,
      'method-design': __testing.LENS_STALL_SKIP_THRESHOLD,
      'evidence-audit': __testing.LENS_STALL_SKIP_THRESHOLD,
      'boundary-failure': __testing.LENS_STALL_SKIP_THRESHOLD,
    },
  })

  const result = __testing.rotateResearchLens(TEST_LENSES, progress, 'cycle-complete')

  // All lenses are stalled, should reset and use first lens
  assert.ok(result)
  assert.equal(result!.id, 'core-mainline')
  assert.deepEqual(progress.lensStallCounts, {})
})

test('getCurrentResearchLens returns null when rotation is not enabled', () => {
  const progress = buildProgress({ currentLensIndex: null })
  const result = __testing.getCurrentResearchLens(TEST_LENSES, progress)
  assert.equal(result, null)
})

test('getCurrentResearchLens returns the current lens', () => {
  const progress = buildProgress({ currentLensIndex: 1 })
  const result = __testing.getCurrentResearchLens(TEST_LENSES, progress)

  assert.ok(result)
  assert.equal(result!.id, 'method-design')
})

test('getCurrentResearchLens handles out-of-bounds index gracefully', () => {
  const progress = buildProgress({ currentLensIndex: 100 })
  const result = __testing.getCurrentResearchLens(TEST_LENSES, progress)

  assert.ok(result)
  assert.equal(result!.id, 'boundary-failure') // Last lens
})

test('updateLensStallCount increments stall count when no progress', () => {
  const progress = buildProgress({
    currentLensIndex: 0,
    lensStallCounts: {},
  })
  const lens = TEST_LENSES[0]

  __testing.updateLensStallCount(lens, progress, false)

  assert.equal(progress.lensStallCounts['core-mainline'], 1)
})

test('updateLensStallCount resets stall count when progress is made', () => {
  const progress = buildProgress({
    currentLensIndex: 0,
    lensStallCounts: { 'core-mainline': 2 },
  })
  const lens = TEST_LENSES[0]

  __testing.updateLensStallCount(lens, progress, true)

  assert.equal(progress.lensStallCounts['core-mainline'], 0)
})

test('updateLensStallCount does nothing when lens is null', () => {
  const progress = buildProgress({
    currentLensIndex: 0,
    lensStallCounts: {},
  })

  __testing.updateLensStallCount(null, progress, false)

  assert.deepEqual(progress.lensStallCounts, {})
})
