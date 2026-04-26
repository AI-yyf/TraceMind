/**
 * Enhanced task scheduler.
 * Supports iterative stage-based research automation with per-stage round controls.
 */

import cron from 'node-cron'

import { prisma } from '../lib/prisma'
import type { ResearchMode as _ResearchMode, TaskConfig, TaskResult as _TaskResult } from './scheduler'
import { runStructuredGenerationPass } from './generation/orchestrator'
import { getGenerationRuntimeConfig, PROMPT_TEMPLATE_IDS } from './generation/prompt-registry'
import { refreshTopicViewModelSnapshot } from './topics/alpha-topic'
import { orchestrateTopicReaderArtifacts, warmTopicReaderArtifacts } from './topics/alpha-reader'
import { syncConfiguredTopicWorkflowSnapshot } from './topics/topic-config-sync'
import {
  loadResearchPipelineState,
  type ResearchPipelineDurationDecision,
} from './topics/research-pipeline'
import {
  loadGlobalResearchConfig,
  loadTopicResearchConfig,
  type TopicResearchConfigState,
} from './topics/topic-research-config'
import {
  DEFAULT_RESEARCH_STATUS_ISSUE_SUMMARY,
  loadTopicResearchReport,
  reportContainsOperationalNarrative,
  saveTopicResearchReport,
  sanitizeResearchFacingSummary,
  type ResearchRunReport,
} from './topics/research-report'
import {
  recordTopicGuidanceApplication,
  recordTopicResearchCycle,
  recordTopicResearchStatus,
} from './topics/topic-session-memory'
import {
  initializeCrossTopicIndex,
  loadCrossTopicIndex,
  saveCrossTopicIndex,
  registerPaperInIndex,
  updateTopicProgress,
  logTopicSwitch,
  getNextRoundRobinTopic,
  getRoundRobinSessionSummary,
  cleanupCrossTopicIndex,
  type CrossTopicIndexState,
  type TopicRoundRobinProgress as _TopicRoundRobinProgress,
} from './topics/cross-topic-index'
import {
  compactTopicGuidanceContext,
  loadTopicGuidanceLedger,
  recordTopicGuidanceDirectiveApplication,
  type TopicGuidanceDirective,
  type TopicGuidanceDirectiveStatus,
  type TopicGuidanceLatestApplication,
} from './topics/topic-guidance-ledger'
import { collectTopicCognitiveMemory } from './topics/topic-cognitive-memory'
import { loadTopicStageConfig } from './topics/topic-stage-config'
import type { SkillContext, ArtifactManager } from '../../engine/contracts'

// Import types from extracted modules
import {
  type StageTaskProgress,
  type TaskExecutionRecord,
  type ResearchCandidatePaper,
  type ResearchNodeAction,
  type ResearchOrchestrationOutput,
  type SchedulerRunSource,
  type EnhancedTaskResult,
  type DiscoverCycleResult,
  type DurationSessionHandle,
  type DurationResearchLens,
  type DurationResearchPerspective,
  type ManagedScheduledTask,
  type DurationResearchStrategy,
  type DurationResearchTargets,
  type DeferredPromiseHandlers,
  type LensRotationEntry,
  type MultiTopicSessionHandle,
  type RoundRobinCycleResult,
  STAGE_DURATION_DAYS_MIN,
  STAGE_DURATION_DAYS_MAX,
  STAGE_DURATION_DAYS_DEFAULT,
  DEFAULT_DURATION_HOURS,
  MIN_DURATION_HOURS,
  MAX_DURATION_HOURS,
  MIN_RESEARCH_CYCLE_DELAY_MS,
  MAX_RESEARCH_CYCLE_DELAY_MS,
  MANUAL_TOPIC_TASK_CRON,
  BACKGROUND_DURATION_RUNS_DISABLED,
} from './scheduler-types'

// Import utility functions from extracted modules
import {
  resolveStageDurationDays,
  clampStageDurationDays as _clampStageDurationDays,
  formatDurationWindowLabel,
  clipText,
  pickText,
  uniqueStrings,
  prefersChineseResearchCopy as _prefersChineseResearchCopy,
  formatStageRecordSummary,
  formatStageFailureSummary,
  normalizeResearchTimelineLine,
  looksLikeLegacyEnglishResearchFallback,
  clampNumber,
  sleep,
  resolveResearchMode,
  resolveDurationHours,
  computeDurationProgress,
  normalizeProgress,
  sanitizeResearchProgress,
  createDormantDurationSessionPromise,
  createDeferredPromise,
  createManagedScheduledTask,
  startOfUtcMonth as _startOfUtcMonth,
  estimateTopicProgressTotalStages,
} from './scheduler-utils'

// Import clustering logic from extracted module
import {
  buildHeuristicFallbackOrchestration,
} from './scheduler-clustering'

// Re-export types for backward compatibility
export type {
  StageTaskProgress,
  TaskExecutionRecord,
  ResearchCandidatePaper,
  ResearchNodeAction,
  ResearchOrchestrationOutput,
  SchedulerRunSource,
  EnhancedTaskResult,
  DiscoverCycleResult,
  DurationSessionHandle,
  DurationResearchLens,
  ManagedScheduledTask,
  DurationResearchStrategy,
  DeferredPromiseHandlers,
  LensRotationEntry,
}

// Re-export constants for backward compatibility
export {
  STAGE_DURATION_DAYS_MIN,
  STAGE_DURATION_DAYS_MAX,
  STAGE_DURATION_DAYS_DEFAULT,
  DEFAULT_DURATION_HOURS,
  MIN_DURATION_HOURS,
  MAX_DURATION_HOURS,
  MIN_RESEARCH_CYCLE_DELAY_MS,
  MAX_RESEARCH_CYCLE_DELAY_MS,
  MANUAL_TOPIC_TASK_CRON,
  BACKGROUND_DURATION_RUNS_DISABLED,
}

// No-op ArtifactManager for scheduler calls
const nullArtifactManager: ArtifactManager = {
  addChange: () => {},
  listChanges: () => [],
}

const DEFAULT_DURATION_RESEARCH_LENSES: DurationResearchLens[] = [
  {
    id: 'core-mainline',
    label: 'Core Mainline',
    focus: 'problem',
    prompts: ['core mechanism', 'mainline contribution', 'fundamental limitation'],
  },
  {
    id: 'method-design',
    label: 'Method Design',
    focus: 'method',
    prompts: ['architecture', 'training objective', 'latent dynamics', 'planning'],
  },
  {
    id: 'evidence-audit',
    label: 'Evidence Audit',
    focus: 'citation',
    prompts: ['benchmark', 'ablation', 'evaluation protocol', 'closed-loop evidence'],
  },
  {
    id: 'boundary-failure',
    label: 'Boundary and Failure',
    focus: 'merge',
    prompts: ['failure mode', 'robustness', 'safety', 'uncertainty'],
  },
  {
    id: 'artifact-grounding',
    label: 'Artifact Grounding',
    focus: 'citation',
    prompts: ['dataset', 'figure analysis', 'table evidence', 'formula objective'],
  },
  {
    id: 'theoretical-foundation',
    label: 'Theoretical Foundation',
    focus: 'problem',
    prompts: ['mathematical proof', 'convergence guarantee', 'bound analysis', 'information theory'],
  },
  {
    id: 'scalability-efficiency',
    label: 'Scalability and Efficiency',
    focus: 'method',
    prompts: ['computational cost', 'memory efficiency', 'scaling law', 'inference speed'],
  },
  {
    id: 'cross-domain-transfer',
    label: 'Cross-Domain Transfer',
    focus: 'merge',
    prompts: ['domain adaptation', 'transfer learning', 'generalization', 'zero-shot'],
  },
]

/** Maximum stall count per lens before it gets skipped */
const LENS_STALL_SKIP_THRESHOLD = 3

/**
 * Rotate to the next research lens based on progress state.
 *
 * Rules:
 * - Rotate after each completed cycle (when stage advances or cycle resets)
 * - Skip lenses that have stalled too many times (>= LENS_STALL_SKIP_THRESHOLD)
 * - Track rotation history for audit
 * - Return null if rotation is not enabled (backward compatibility)
 */
function rotateResearchLens(
  lenses: DurationResearchLens[],
  progress: StageTaskProgress,
  reason: 'cycle-complete' | 'stall-limit' | 'manual' = 'cycle-complete',
): DurationResearchLens | null {
  // Backward compatibility: if lens rotation not enabled, return null
  if (progress.currentLensIndex === null) {
    return null
  }

  const totalLenses = lenses.length
  if (totalLenses === 0) {
    return null
  }

  // Find the next lens that hasn't stalled too many times
  let nextIndex = progress.currentLensIndex
  let attempts = 0
  const maxAttempts = totalLenses * 2 // Prevent infinite loop

  while (attempts < maxAttempts) {
    nextIndex = (nextIndex + 1) % totalLenses
    const nextLens = lenses[nextIndex]
    if (!nextLens) break

    const stallCount = progress.lensStallCounts[nextLens.id] ?? 0
    if (stallCount < LENS_STALL_SKIP_THRESHOLD) {
      // Found a valid lens
      const rotationEntry: LensRotationEntry = {
        lensId: nextLens.id,
        rotatedAt: new Date().toISOString(),
        stallCountBefore: stallCount,
        reason,
      }
      progress.currentLensIndex = nextIndex
      progress.lensRotationHistory.push(rotationEntry)

      console.log(
        `[Scheduler] Lens rotation: ${nextLens.id} (${nextLens.label}) [reason: ${reason}, stall: ${stallCount}]`,
      )

      return nextLens
    }

    attempts += 1
  }

  // All lenses have stalled too many times - reset stall counts and use first lens
  console.warn(
    `[Scheduler] All lenses have stalled >= ${LENS_STALL_SKIP_THRESHOLD} times, resetting stall counts`,
  )
  progress.lensStallCounts = {}
  const firstLens = lenses[0]
  if (firstLens) {
    progress.currentLensIndex = 0
    const rotationEntry: LensRotationEntry = {
      lensId: firstLens.id,
      rotatedAt: new Date().toISOString(),
      stallCountBefore: 0,
      reason: 'stall-limit',
    }
    progress.lensRotationHistory.push(rotationEntry)
    return firstLens
  }

  return null
}

/**
 * Get the current research lens based on progress state.
 * Returns null if rotation is not enabled.
 */
function getCurrentResearchLens(
  lenses: DurationResearchLens[],
  progress: StageTaskProgress,
): DurationResearchLens | null {
  if (progress.currentLensIndex === null || lenses.length === 0) {
    return null
  }

  const index = Math.min(progress.currentLensIndex, lenses.length - 1)
  return lenses[index] ?? null
}

/**
 * Update lens stall count when a cycle makes no progress.
 */
function updateLensStallCount(
  lens: DurationResearchLens | null,
  progress: StageTaskProgress,
  madeProgress: boolean,
): void {
  if (!lens) return

  const currentCount = progress.lensStallCounts[lens.id] ?? 0
  if (!madeProgress) {
    progress.lensStallCounts[lens.id] = currentCount + 1
  } else {
    // Reset stall count on progress
    progress.lensStallCounts[lens.id] = 0
  }
}

type RuntimeSkillContext = {
  sessionId: string
  workspacePath: string
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
    error: (message: string, meta?: Record<string, unknown>) => void
    debug: (message: string, meta?: Record<string, unknown>) => void
  }
}

function hasRenderableResearchReport(report: ResearchRunReport | null | undefined) {
  if (!report) return false

  return Boolean(
    report.headline?.trim() &&
      report.dek?.trim() &&
      report.summary?.trim() &&
      Array.isArray(report.paragraphs) &&
      report.paragraphs.some((paragraph) => typeof paragraph === 'string' && Boolean(paragraph.trim())),
  )
}

function shouldPreferFallbackResearchReportState(args: {
  progress: StageTaskProgress | null
  report: ResearchRunReport | null
  active: boolean
  fallback?: ResearchRunReport | null
}) {
  const { progress, report, active, fallback } = args

  if (!progress) return false
  if (!report) return true
  if (!hasRenderableResearchReport(report)) return true

  const zeroYieldFailure =
    report.failedRuns > 0 &&
    report.successfulRuns === 0 &&
    report.discoveredPapers === 0 &&
    report.admittedPapers === 0 &&
    report.generatedContents === 0
  if (fallback && zeroYieldFailure && reportContainsOperationalNarrative(report)) {
    return true
  }

  if (fallback) {
    if (report.status !== fallback.status) return true
    if (report.taskId !== progress.taskId) return true
    if (report.topicId !== progress.topicId) return true
    if (report.researchMode !== progress.researchMode) return true
    if (report.currentStage !== progress.currentStage) return true
    if (report.totalStages !== progress.totalStages) return true
  }

  if (active && report.status !== 'running') {
    return true
  }

  if (
    active &&
    progress.activeSessionId &&
    report.reportId !== progress.activeSessionId
  ) {
    return true
  }

  if (progress.totalRuns > report.totalRuns) return true
  if (progress.successfulRuns > report.successfulRuns) return true
  if (progress.failedRuns > report.failedRuns) return true
  if (progress.discoveredPapers > report.discoveredPapers) return true
  if (progress.admittedPapers > report.admittedPapers) return true
  if (progress.generatedContents > report.generatedContents) return true

  if (
    progress.latestSummary &&
    progress.latestSummary.trim() &&
    progress.latestSummary !== report.latestStageSummary
  ) {
    return true
  }

  return false
}

function buildDurationResearchDecision(args: {
  currentStage: number
  totalStages: number
  currentStageStalls: number
  completedStageCycles: number
  stageStallLimit: number
  cycle: Pick<
    DiscoverCycleResult,
    'discovered' | 'admitted' | 'contentsGenerated' | 'shouldAdvanceStage' | 'stageSummary'
  >
}): ResearchPipelineDurationDecision {
  const madeProgress =
    args.cycle.discovered > 0 ||
    args.cycle.admitted > 0 ||
    args.cycle.contentsGenerated > 0
  const stallCountBefore = args.currentStageStalls
  const advanceToNextStage = args.currentStage < args.totalStages
  const nextStage = advanceToNextStage ? args.currentStage + 1 : 1
  const baseDecision = {
    currentStage: args.currentStage,
    nextStage: args.currentStage,
    madeProgress,
    stallCountBefore,
    stallCountAfter: stallCountBefore,
    stallLimit: args.stageStallLimit,
    completedStageCycles: args.completedStageCycles,
    rationale: clipText(args.cycle.stageSummary, 220),
  }

  if (args.cycle.shouldAdvanceStage) {
    return {
      ...baseDecision,
      action: advanceToNextStage ? 'advance' : 'cycle-reset',
      reason: 'orchestration',
      nextStage,
      stallCountAfter: 0,
      completedStageCycles: advanceToNextStage
        ? args.completedStageCycles
        : args.completedStageCycles + 1,
      summary: advanceToNextStage
        ? `Stage ${args.currentStage} is ready to advance to stage ${nextStage} based on the latest orchestration judgment.`
        : `Stage ${args.currentStage} completed this cycle and resets to stage 1 for the next research sweep.`,
    }
  }

  if (madeProgress) {
    return {
      ...baseDecision,
      action: 'stay',
      reason: 'progress-made',
      stallCountAfter: 0,
      summary: `Stage ${args.currentStage} stays open because the latest cycle added new evidence, admitted papers, or refreshed content.`,
    }
  }

  const stallCountAfter = stallCountBefore + 1
  if (stallCountAfter >= args.stageStallLimit) {
    return {
      ...baseDecision,
      action: advanceToNextStage ? 'advance' : 'cycle-reset',
      reason: 'stall-limit',
      nextStage,
      stallCountAfter: 0,
      completedStageCycles: advanceToNextStage
        ? args.completedStageCycles
        : args.completedStageCycles + 1,
      summary: advanceToNextStage
        ? `Stage ${args.currentStage} advanced to stage ${nextStage} after ${args.stageStallLimit} stall cycles without meaningful progress.`
        : `Stage ${args.currentStage} reached the stall limit, completed the current sweep, and resets to stage 1.`,
    }
  }

  return {
    ...baseDecision,
    action: 'stay',
    reason: 'await-more-evidence',
    stallCountAfter,
    summary: `Stage ${args.currentStage} remains open while the system consolidates evidence and waits for a stronger basis to advance.`,
  }
}

function cloneDurationResearchLenses() {
  return DEFAULT_DURATION_RESEARCH_LENSES.map((lens) => ({
    ...lens,
    prompts: [...lens.prompts],
  }))
}

function buildDurationResearchTargets(
  researchConfig: TopicResearchConfigState,
): DurationResearchTargets {
  const nodePaperTargetMax = clampNumber(researchConfig.maxPapersPerNode, 5, 20)
  const nodePaperTargetMin = Math.min(
    nodePaperTargetMax,
    clampNumber(researchConfig.minPapersPerNode, 3, nodePaperTargetMax),
  )
  const stageCandidateBudget = clampNumber(researchConfig.maxCandidatesPerStage, 20, 200)
  const targetCandidatesBeforeAdmission = Math.max(
    stageCandidateBudget,
    clampNumber(
      researchConfig.targetCandidatesBeforeAdmission,
      20,
      stageCandidateBudget,
    ),
  )

  return {
    stageCandidateBudget,
    discoveryQueryBudget: clampNumber(researchConfig.discoveryQueryLimit, 100, 800),
    nodePaperTargetMin,
    nodePaperTargetMax,
    targetCandidatesBeforeAdmission,
    highConfidenceThreshold: clampNumber(researchConfig.highConfidenceThreshold, 0.5, 0.95),
  }
}

function buildDurationResearchPerspectives(
  lenses: DurationResearchLens[],
): DurationResearchPerspective[] {
  return lenses.map((lens) => {
    if (lens.focus === 'problem') {
      return {
        id: lens.id,
        label: lens.label,
        mission:
          'Protect the stage thesis, identify the real research question, and reject side trails that do not sharpen the mainline.',
        deliverable:
          'A stage-level argument that states what changed in the problem framing and why the node structure still holds.',
      }
    }

    if (lens.focus === 'method') {
      return {
        id: lens.id,
        label: lens.label,
        mission:
          'Track method design choices, scaling tradeoffs, and implementation pivots that deserve their own node or sub-claim.',
        deliverable:
          'A method-facing synthesis that explains how the papers work, where they differ, and which technical path is winning.',
      }
    }

    if (lens.id === 'artifact-grounding' || lens.focus === 'citation') {
      return {
        id: lens.id,
        label: lens.label,
        mission:
          'Audit the evidence chain through figures, tables, formulas, and ablations so the stage never overclaims beyond extracted assets.',
        deliverable:
          'A grounded reading note that makes missing multimodal evidence explicit instead of pretending the extraction is complete.',
      }
    }

    return {
      id: lens.id,
      label: lens.label,
      mission:
        'Challenge the current grouping from a boundary case, failure mode, or adjacent branch so the research map stays rigorous.',
      deliverable:
        'A merge-or-split judgment that keeps nodes coherent while exposing unresolved tension and transfer limits.',
    }
  })
}

function buildDurationResearchQualityBars(
  targets: DurationResearchTargets,
): string[] {
  return [
    'Keep the current stage open for the full research window and only advance after repeated multi-angle passes confirm the structure.',
    `Shape nodes so they can absorb ${targets.nodePaperTargetMin}-${targets.nodePaperTargetMax} useful papers over time instead of collapsing into one-paper labels.`,
    `Broaden discovery toward ${targets.stageCandidateBudget} candidate papers per stage before admission, with a stronger fast lane above ${(targets.highConfidenceThreshold * 100).toFixed(0)}% confidence.`,
    'Treat figures, tables, and formulas as first-class evidence; missing table or formula coverage must remain visible as a gap to close.',
    'Write node and topic outputs like publishable research articles: claim first, tight evidence second, no dev-log tone.',
  ]
}

function buildInitialProgressSnapshot(
  config: TaskConfig,
  topicName = 'Unknown Topic',
  totalStages = 5,
): StageTaskProgress {
  const researchMode = resolveResearchMode(config)
  return normalizeProgress({
    taskId: config.id,
    topicId: config.topicId || '',
    topicName,
    researchMode,
    durationHours: resolveDurationHours(config),
    currentStage: 1,
    totalStages,
    stageProgress: 0,
    currentStageRuns: 0,
    currentStageTargetRuns: 0,
    stageRunMap: {},
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    lastRunAt: null,
    lastRunResult: null,
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    startedAt: null,
    deadlineAt: null,
    completedAt: null,
    activeSessionId: null,
    completedStageCycles: 0,
    currentStageStalls: 0,
    latestSummary: null,
    status: config.enabled ? 'active' : 'paused',
    // Initialize lens rotation for duration research mode
    currentLensIndex: researchMode === 'duration' ? 0 : null,
    lensRotationHistory: [],
    lensStallCounts: {},
  })
}

export class EnhancedTaskScheduler {
  private tasks: Map<string, { config: TaskConfig; task: ManagedScheduledTask }> = new Map()
  private progress: Map<string, StageTaskProgress> = new Map()
  private executionHistory: Map<string, TaskExecutionRecord[]> = new Map()
  private activeSessions: Map<string, DurationSessionHandle> = new Map()
  private listeners: ((result: EnhancedTaskResult) => void | Promise<void>)[] = []
  private initializationPromise: Promise<void> | null = null
  private initialized = false

  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve()
    }

    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        await this.loadProgressFromDB()
        await this.resumeInterruptedDurationTasks()
      })().finally(() => {
        this.initialized = true
      })
    }

    return this.initializationPromise
  }

  private async loadProgressFromDB(): Promise<void> {
    try {
      const configs = await prisma.system_configs.findMany({
        where: { key: { startsWith: 'task-progress:' } },
      })

      const recoveredAt = new Date().toISOString()
      for (const config of configs) {
        const progress = normalizeProgress(JSON.parse(config.value) as Partial<StageTaskProgress>)
        if (progress.activeSessionId) {
          // BUG #8 fix: Check if deadline has expired before forcing pause
          const deadlineAt = progress.deadlineAt ? Date.parse(progress.deadlineAt) : Number.NaN
          const hasExpired = !Number.isFinite(deadlineAt) || Date.now() >= deadlineAt

          if (hasExpired) {
            // Deadline expired - mark as completed
            progress.activeSessionId = null
            progress.status = 'completed'
            progress.completedAt = progress.completedAt ?? recoveredAt
            console.log(`[Scheduler] Task ${progress.taskId} deadline expired, marked as completed`)
          } else {
            // Deadline not expired - mark as 'interrupted' for potential resume
            // Keep activeSessionId for checkpoint, but change status to 'interrupted'
            progress.status = 'interrupted'
            console.log(`[Scheduler] Task ${progress.taskId} was interrupted by restart, can be resumed`)
          }
          await this.saveProgress(progress.taskId, progress)
        }
        this.progress.set(progress.taskId, progress)
      }

      const history = await prisma.system_configs.findMany({
        where: { key: { startsWith: 'task-history:' } },
      })

      for (const config of history) {
        const records = JSON.parse(config.value) as TaskExecutionRecord[]
        this.executionHistory.set(config.key.replace('task-history:', ''), records)
      }

      console.log(`[Scheduler] Loaded ${this.progress.size} task progress records`)
    } catch (error) {
      console.error('[Scheduler] Failed to load progress from DB:', error)
    }
  }

  private async resumeInterruptedDurationTasks(): Promise<void> {
    const interrupted = Array.from(this.progress.values()).filter(
      (progress) => progress.status === 'interrupted' && progress.activeSessionId,
    )

    for (const progress of interrupted) {
      try {
        const task = await this.loadStoredTaskConfig(progress.taskId)
        if (!task || resolveResearchMode(task) !== 'duration') {
          continue
        }

        if (!this.tasks.has(task.id)) {
          this.addTask(task)
        }

        const sessionId = progress.activeSessionId
        if (!sessionId) continue

        progress.status = 'active'
        progress.completedAt = null
        await this.saveProgress(progress.taskId, progress)

        const source: SchedulerRunSource = 'manual'
        const promise = BACKGROUND_DURATION_RUNS_DISABLED
          ? createDormantDurationSessionPromise()
          : this.launchDurationTask(task, sessionId, source)

        this.activeSessions.set(task.id, {
          sessionId,
          source,
          startedAt: progress.startedAt ?? new Date().toISOString(),
          deadlineAt: progress.deadlineAt ?? new Date().toISOString(),
          promise,
        })

        if (!BACKGROUND_DURATION_RUNS_DISABLED) {
          void promise.finally(() => {
            const current = this.activeSessions.get(task.id)
            if (current?.sessionId === sessionId) {
              this.activeSessions.delete(task.id)
            }
          })
        }

        void this.writeResearchReport({
          config: task,
          progress,
          source,
          status: 'running',
        }).catch((error) => {
          console.error(
            `[Scheduler] Failed to refresh resumed research report for ${progress.taskId}:`,
            error,
          )
        })

        console.log(`[Scheduler] Resumed interrupted duration task ${progress.taskId}`)
      } catch (error) {
        console.error(
          `[Scheduler] Failed to resume interrupted duration task ${progress.taskId}:`,
          error,
        )
      }
    }
  }

  addTask(config: TaskConfig): boolean {
    if (!cron.validate(config.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression: ${config.cronExpression}`)
      return false
    }

    if (this.tasks.has(config.id)) {
      this.removeTask(config.id)
    }

    const task = createManagedScheduledTask(config, async () => {
      await this.dispatchTask(config, 'scheduled')
    })

    this.tasks.set(config.id, { config, task })

    if (!this.progress.has(config.id)) {
      const seededProgress = buildInitialProgressSnapshot(config)
      seededProgress.currentStageTargetRuns = this.resolveStageTargetRuns(config, 1)
      this.progress.set(config.id, seededProgress)
      void this.saveProgress(config.id, seededProgress)
      void this.initProgress(config)
    } else {
      const progress = this.progress.get(config.id)
      if (progress) {
        progress.researchMode = resolveResearchMode(config)
        progress.durationHours = resolveDurationHours(config)
        this.syncStageRoundCounters(config, progress)
        void this.saveProgress(config.id, progress)
      }
    }

    console.log(`[Scheduler] Task added: ${config.name} (${config.cronExpression})`)
    return true
  }

  private async initProgress(config: TaskConfig): Promise<void> {
    let topicName = 'Unknown Topic'
    let totalStages = 5

    if (config.topicId) {
      try {
        const [topic, stageCount, stageConfig] = await Promise.all([
          prisma.topics.findUnique({
            where: { id: config.topicId },
            select: {
              nameZh: true,
              nameEn: true,
              createdAt: true,
              papers: {
                select: {
                  published: true,
                },
              },
            },
          }),
          prisma.topic_stages.count({
            where: { topicId: config.topicId },
          }),
          loadTopicStageConfig(config.topicId),
        ])

        topicName = topic?.nameZh || topic?.nameEn || topicName
        totalStages = estimateTopicProgressTotalStages({
          topic,
          existingStageCount: stageCount || totalStages,
          windowMonths: stageConfig.windowMonths,
        })
      } catch (error) {
        console.error('[Scheduler] Failed to get topic info:', error)
      }
    }

    const progress: StageTaskProgress = buildInitialProgressSnapshot(config, topicName, totalStages)
    progress.currentStageTargetRuns = this.resolveStageTargetRuns(config, 1)
    this.syncStageRoundCounters(config, progress)
    this.progress.set(config.id, progress)
    await this.saveProgress(config.id, progress)
  }

  private async refreshTopicStageCapacity(config: TaskConfig, progress: StageTaskProgress) {
    if (!config.topicId) return

    try {
      const [topic, stageCount, stageConfig] = await Promise.all([
        prisma.topics.findUnique({
          where: { id: config.topicId },
          select: {
            nameZh: true,
            nameEn: true,
            createdAt: true,
            papers: {
              select: {
                published: true,
              },
            },
          },
        }),
        prisma.topic_stages.count({
          where: { topicId: config.topicId },
        }),
        loadTopicStageConfig(config.topicId),
      ])

      const nextTotalStages = estimateTopicProgressTotalStages({
        topic,
        existingStageCount: stageCount || progress.totalStages,
        windowMonths: stageConfig.windowMonths,
      })

      progress.topicName = topic?.nameZh || topic?.nameEn || progress.topicName
      if (nextTotalStages !== progress.totalStages) {
        progress.totalStages = nextTotalStages
      }
    } catch (error) {
      console.error('[Scheduler] Failed to refresh topic stage capacity:', error)
    }
  }

  private resolveStageTargetRuns(config: TaskConfig, stageIndex: number): number {
    if (resolveResearchMode(config) === 'duration') {
      return 0
    }

    const configuredRounds = config.options?.stageRounds?.find((entry) => entry.stageIndex === stageIndex)?.rounds

    if (typeof configuredRounds === 'number' && configuredRounds > 0) {
      return configuredRounds
    }

    if (typeof config.options?.maxIterations === 'number' && config.options.maxIterations > 0) {
      return config.options.maxIterations
    }

    return 1
  }

  private syncStageRoundCounters(config: TaskConfig, progress: StageTaskProgress) {
    const stageKey = String(progress.currentStage)
    progress.currentStageRuns = progress.stageRunMap[stageKey] ?? 0
    progress.currentStageTargetRuns = this.resolveStageTargetRuns(config, progress.currentStage)
    progress.researchMode = resolveResearchMode(config)
    progress.durationHours = resolveDurationHours(config)
    progress.stageProgress =
      progress.researchMode === 'duration'
        ? computeDurationProgress(progress)
        : Math.min(
            100,
            Math.round((progress.currentStageRuns / Math.max(1, progress.currentStageTargetRuns)) * 100),
          )
  }

  private shouldResetLegacyDurationProgress(progress: StageTaskProgress) {
    return (
      !progress.activeSessionId &&
      progress.totalRuns > 0 &&
      progress.successfulRuns === 0 &&
      progress.discoveredPapers === 0 &&
      progress.admittedPapers === 0 &&
      progress.generatedContents === 0 &&
      progress.failedRuns >= progress.totalRuns
    )
  }

  private resetProgressSnapshot(config: TaskConfig, progress: StageTaskProgress) {
    progress.currentStage = 1
    progress.stageRunMap = {}
    progress.totalRuns = 0
    progress.successfulRuns = 0
    progress.failedRuns = 0
    progress.discoveredPapers = 0
    progress.admittedPapers = 0
    progress.generatedContents = 0
    progress.lastRunAt = null
    progress.lastRunResult = null
    progress.startedAt = null
    progress.deadlineAt = null
    progress.completedAt = null
    progress.activeSessionId = null
    progress.completedStageCycles = 0
    progress.currentStageStalls = 0
    progress.latestSummary = null
    progress.status = 'active'
    this.syncStageRoundCounters(config, progress)
  }

  private moveToStage(config: TaskConfig, progress: StageTaskProgress, stageIndex: number) {
    progress.currentStage = stageIndex
    progress.currentStageStalls = 0
    this.syncStageRoundCounters(config, progress)
  }

  private markStageRun(config: TaskConfig, progress: StageTaskProgress) {
    const stageKey = String(progress.currentStage)
    progress.stageRunMap[stageKey] = (progress.stageRunMap[stageKey] ?? 0) + 1
    this.syncStageRoundCounters(config, progress)
  }

  private shouldAdvanceStage(config: TaskConfig, progress: StageTaskProgress) {
    if (resolveResearchMode(config) === 'duration') return false
    return (progress.stageRunMap[String(progress.currentStage)] ?? 0) >= this.resolveStageTargetRuns(config, progress.currentStage)
  }

  private createSkillContext(taskId: string): RuntimeSkillContext {
    return {
      sessionId: taskId,
      workspacePath: process.cwd(),
      logger: {
        info: (message, meta) => console.log(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
        warn: (message, meta) => console.warn(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
        error: (message, meta) => console.error(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
        debug: (message, meta) => console.debug(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
      },
}
  }

  async resolveDurationResearchStrategy(
    config?: TaskConfig | null,
    topicIdFallback?: string | null,
  ): Promise<DurationResearchStrategy> {
    const runtime = await getGenerationRuntimeConfig()
    const configuredDelay = Number(config?.options?.cycleDelayMs)
    const resolvedTopicId = pickText(config?.topicId, topicIdFallback) || null
    const researchConfig = resolvedTopicId
      ? await loadTopicResearchConfig(resolvedTopicId).catch(() => loadGlobalResearchConfig())
      : await loadGlobalResearchConfig()
    const lenses = cloneDurationResearchLenses()
    const targets = buildDurationResearchTargets(researchConfig)

    return {
      cycleDelayMs: Number.isFinite(configuredDelay)
        ? clampNumber(configuredDelay, MIN_RESEARCH_CYCLE_DELAY_MS, MAX_RESEARCH_CYCLE_DELAY_MS)
        : runtime.researchCycleDelayMs,
      stageStallLimit: runtime.researchStageStallLimit,
      reportPasses: runtime.researchReportPasses,
      lenses,
      targets,
      perspectives: buildDurationResearchPerspectives(lenses),
      qualityBars: buildDurationResearchQualityBars(targets),
    }
  }

  private async loadCandidatePapers(topicId: string, candidates: Array<Record<string, any>>) {
    const papers = await prisma.papers.findMany({
      where: { topicId },
      include: {
        figures: true,
        figure_groups: {
          select: { id: true },
        },
        tables: {
          select: { id: true },
        },
        formulas: {
          select: { id: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.max(24, candidates.length * 6),
    })

    const matched: ResearchCandidatePaper[] = []
    const usedIds = new Set<string>()

    for (const candidate of candidates) {
      const match =
        papers.find((paper) => !usedIds.has(paper.id) && paper.id === candidate.paperId) ??
        papers.find(
          (paper) =>
            !usedIds.has(paper.id) &&
            pickText(
              paper.arxivUrl
                ? paper.arxivUrl.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/iu)?.[1]
                : null,
              paper.id
            ) === candidate.paperId,
        ) ??
        papers.find(
          (paper) =>
            !usedIds.has(paper.id) &&
            pickText(paper.titleZh, paper.title) === pickText(candidate.titleZh, candidate.title),
        ) ??
        papers.find(
          (paper) =>
            !usedIds.has(paper.id) && paper.title === pickText(candidate.title, candidate.titleZh),
        )

      if (!match) continue

      usedIds.add(match.id)
      matched.push({
        id: match.id,
        title: match.title,
        titleZh: match.titleZh,
        titleEn: match.titleEn,
        summary: match.summary,
        explanation: match.explanation,
        coverPath: match.coverPath,
        figures: match.figures.map((figure) => ({
          id: figure.id,
          imagePath: figure.imagePath,
          caption: figure.caption,
          analysis: figure.analysis,
        })),
        figureGroupCount: match.figure_groups.length,
        tableCount: match.tables.length,
        formulaCount: match.formulas.length,
      })
    }

    return matched
  }

  private buildFallbackOrchestration(args: {
    topic: any
    stage: any
    existingNodes: any[]
    candidatePapers: ResearchCandidatePaper[]
  }): ResearchOrchestrationOutput {
    return buildHeuristicFallbackOrchestration(args)
  }

  private normalizeResearchOrchestrationOutput(
    raw: Partial<ResearchOrchestrationOutput> | null | undefined,
    fallback: ResearchOrchestrationOutput,
  ): ResearchOrchestrationOutput {
    const source = raw && typeof raw === 'object' ? raw : {}
    const rawNodeActions = Array.isArray(source.nodeActions) ? source.nodeActions : fallback.nodeActions

    const nodeActions: ResearchNodeAction[] = rawNodeActions
      .map<ResearchNodeAction | null>((action, index) => {
        const fallbackAction = fallback.nodeActions[index] ?? fallback.nodeActions[0]
        const normalizedPaperIds = Array.isArray(action?.paperIds)
          ? action.paperIds.filter((paperId): paperId is string => typeof paperId === 'string' && Boolean(paperId))
          : fallbackAction?.paperIds ?? []
        const primaryPaperId =
          pickText(
            typeof action?.primaryPaperId === 'string' ? action.primaryPaperId : undefined,
            normalizedPaperIds[0],
            fallbackAction?.primaryPaperId,
          ) || normalizedPaperIds[0]

        if (!primaryPaperId || normalizedPaperIds.length === 0) {
          return null
        }

        const normalizedAction = action?.action
        const normalizedNodeAction: ResearchNodeAction = {
          action:
            normalizedAction === 'create' ||
            normalizedAction === 'update' ||
            normalizedAction === 'merge' ||
            normalizedAction === 'strengthen'
              ? normalizedAction
              : fallbackAction?.action ?? 'strengthen',
          title: pickText(action?.title, fallbackAction?.title, 'Untitled Node'),
          titleEn: pickText(action?.titleEn, fallbackAction?.titleEn, action?.title, fallbackAction?.title, 'Untitled Node'),
          subtitle: pickText(action?.subtitle, fallbackAction?.subtitle, action?.titleEn, fallbackAction?.titleEn, action?.title, fallbackAction?.title, 'Untitled Node'),
          summary: clipText(pickText(action?.summary, fallbackAction?.summary, action?.explanation, fallbackAction?.explanation), 180),
          explanation: clipText(pickText(action?.explanation, fallbackAction?.explanation, action?.summary, fallbackAction?.summary), 420),
          paperIds: Array.from(new Set(normalizedPaperIds)),
          primaryPaperId,
          rationale: clipText(pickText(action?.rationale, fallbackAction?.rationale, 'Keep the node structure coherent with the current evidence.'), 220),
        }

        const nodeId =
          typeof action?.nodeId === 'string' ? action.nodeId : fallbackAction?.nodeId
        const mergeIntoNodeId =
          typeof action?.mergeIntoNodeId === 'string'
            ? action.mergeIntoNodeId
            : fallbackAction?.mergeIntoNodeId

        if (nodeId) {
          normalizedNodeAction.nodeId = nodeId
        }

        if (mergeIntoNodeId) {
          normalizedNodeAction.mergeIntoNodeId = mergeIntoNodeId
        }

        return normalizedNodeAction
      })
      .filter((action): action is ResearchNodeAction => action !== null)

    return {
      stageTitle: pickText(source.stageTitle, fallback.stageTitle),
      stageTitleEn: pickText(source.stageTitleEn, fallback.stageTitleEn, source.stageTitle, fallback.stageTitle),
      stageSummary: clipText(pickText(source.stageSummary, fallback.stageSummary), 280),
      shouldAdvanceStage:
        typeof source.shouldAdvanceStage === 'boolean'
          ? source.shouldAdvanceStage
          : fallback.shouldAdvanceStage,
      rationale: clipText(pickText(source.rationale, fallback.rationale, fallback.stageSummary), 220),
      nodeActions: nodeActions.length > 0 ? nodeActions : fallback.nodeActions,
      openQuestions: (Array.isArray(source.openQuestions) ? source.openQuestions : fallback.openQuestions)
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => clipText(item, 180))
        .slice(0, 6),
    }
  }

  private async orchestrateStageResearch(args: {
    topicId: string
    stageIndex: number
    roundIndex: number
    topic: any
    stage: any
    existingNodes: any[]
    candidatePapers: ResearchCandidatePaper[]
    durationStrategy?: DurationResearchStrategy | null
    /** Current research lens for angle rotation (optional) */
    currentLens?: DurationResearchLens | null
  }) {
    const fallback = this.buildFallbackOrchestration(args)

    if (args.candidatePapers.length === 0) {
      return fallback
    }

    const [guidance, cognitiveMemory] = await Promise.all([
      loadTopicGuidanceLedger(args.topicId),
      collectTopicCognitiveMemory({
        topicId: args.topicId,
        subjectType: 'stage',
        subjectId: `research-stage:${args.stageIndex}:round:${args.roundIndex}`,
        recentLimit: 6,
      }),
    ])

    const result = await runStructuredGenerationPass<ResearchOrchestrationOutput>({
      topicId: args.topicId,
      subjectType: 'stage',
      subjectId: `research-stage:${args.stageIndex}:round:${args.roundIndex}`,
      templateId: PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_ORCHESTRATION,
      input: {
        topic: {
          id: args.topic.id,
          title: args.topic.nameZh,
          titleEn: args.topic.nameEn,
          focusLabel: args.topic.focusLabel,
          summary: args.topic.summary,
        },
        stage: {
          stageIndex: args.stageIndex,
          title: args.stage?.name ?? `Stage ${args.stageIndex}`,
          titleEn: args.stage?.nameEn ?? args.stage?.name ?? `Stage ${args.stageIndex}`,
          description: args.stage?.description ?? '',
          descriptionEn: args.stage?.descriptionEn ?? '',
        },
        existingNodes: args.existingNodes.map((node) => ({
          nodeId: node.id,
          title: node.nodeLabel,
          titleEn: node.nodeSubtitle ?? node.nodeLabel,
          summary: node.nodeSummary,
          explanation: node.nodeExplanation ?? node.nodeSummary,
          paperIds: node.node_papers
            .map((entry: any) => entry.paperId ?? entry.papers?.id)
            .filter(Boolean),
          primaryPaperId: node.primaryPaperId,
        })),
        candidatePapers: args.candidatePapers.map((paper) => ({
          paperId: paper.id,
          title: paper.titleZh || paper.title,
          titleEn: paper.titleEn || paper.title,
          summary: paper.summary,
          explanation: paper.explanation ?? paper.summary,
          figureCount: paper.figures.length,
          figureGroupCount: paper.figureGroupCount ?? 0,
          tableCount: paper.tableCount ?? 0,
          formulaCount: paper.formulaCount ?? 0,
          evidenceCoverage:
            paper.figures.length > 0 ||
            (paper.figureGroupCount ?? 0) > 0 ||
            (paper.tableCount ?? 0) > 0 ||
            (paper.formulaCount ?? 0) > 0
              ? 'multimodal-grounded'
              : 'text-only',
        })),
        history: await loadResearchPipelineState(args.topicId),
        durationStrategy: args.durationStrategy
          ? {
              cycleDelayMs: args.durationStrategy.cycleDelayMs,
              stageStallLimit: args.durationStrategy.stageStallLimit,
              reportPasses: args.durationStrategy.reportPasses,
              targets: args.durationStrategy.targets,
              perspectives: args.durationStrategy.perspectives,
              qualityBars: args.durationStrategy.qualityBars,
            }
          : null,
        // Add current lens for angle-specific research focus
        currentLens: args.currentLens
          ? {
              id: args.currentLens.id,
              label: args.currentLens.label,
              focus: args.currentLens.focus,
              prompts: args.currentLens.prompts,
            }
          : null,
      },
      memoryContext: {
        guidance: compactTopicGuidanceContext(guidance),
        cognitiveMemory,
      },
      fallback,
      outputContract: JSON.stringify(fallback, null, 2),
      maxTokens: 2400,
      summaryHint: `Research orchestration for topic ${args.topicId} stage ${args.stageIndex}`,
    })

    return this.normalizeResearchOrchestrationOutput(result.output, fallback)
  }

  private async selectNodeCoverImage(args: {
    topicId: string
    stageIndex: number
    stageTitle: string
    node: any
    papers: ResearchCandidatePaper[]
  }) {
    const runtime = await getGenerationRuntimeConfig()
    const candidateFigures = args.papers
      .flatMap((paper) =>
        paper.figures.map((figure) => ({
          figureId: figure.id,
          imagePath: figure.imagePath,
          caption: figure.caption,
          analysis: figure.analysis ?? '',
          paperId: paper.id,
          paperTitle: paper.titleZh || paper.title,
        })),
      )
      .slice(0, runtime.nodeCardFigureCandidateLimit)

    if (candidateFigures.length === 0) {
      return args.papers.find((paper) => paper.coverPath)?.coverPath ?? null
    }

    const fallback = {
      selectedFigureId: candidateFigures[0].figureId,
      imagePath: candidateFigures[0].imagePath,
      shouldUseFallback: false,
      reason: 'Use the first available figure when no better selection signal exists.',
    }

    const result = await runStructuredGenerationPass<{
      selectedFigureId: string
      imagePath: string
      shouldUseFallback: boolean
      reason: string
    }>({
      topicId: args.topicId,
      subjectType: 'node',
      subjectId: `${args.node.id}:cover`,
      templateId: PROMPT_TEMPLATE_IDS.VISUAL_NODE_COVER,
      input: {
        stage: {
          stageIndex: args.stageIndex,
          title: args.stageTitle,
        },
        node: {
          nodeId: args.node.id,
          title: args.node.nodeLabel,
          subtitle: args.node.nodeSubtitle ?? '',
          summary: args.node.nodeSummary,
          explanation: args.node.nodeExplanation ?? args.node.nodeSummary,
        },
        candidateFigures,
      },
      fallback,
      outputContract: JSON.stringify(fallback, null, 2),
      summaryHint: `Select node cover for ${args.node.id}`,
    })

    if (!result.output.shouldUseFallback && result.output.imagePath) {
      return result.output.imagePath
    }

    return fallback.imagePath
  }

  private async applyResearchNodeActions(args: {
    topicId: string
    stageIndex: number
    stageTitle: string
    orchestration: ResearchOrchestrationOutput
    candidatePapers: ResearchCandidatePaper[]
  }) {
    const affectedNodeIds = new Set<string>()
    const existingStage = await prisma.topic_stages.findFirst({
      where: {
        topicId: args.topicId,
        order: args.stageIndex,
      },
    })

    if (existingStage) {
      await prisma.topic_stages.update({
        where: { id: existingStage.id },
        data: {
          name: pickText(args.orchestration.stageTitle, existingStage.name),
          nameEn: pickText(args.orchestration.stageTitleEn, existingStage.nameEn, existingStage.name),
          description: pickText(args.orchestration.stageSummary, existingStage.description),
          descriptionEn: pickText(args.orchestration.stageSummary, existingStage.descriptionEn),
        },
      })
    } else {
await prisma.topic_stages.create({
        data: {
          id: crypto.randomUUID(),
          topicId: args.topicId,
          order: args.stageIndex,
          name: pickText(args.orchestration.stageTitle, args.stageTitle, `Stage ${args.stageIndex}`),
          nameEn: pickText(
            args.orchestration.stageTitleEn,
            args.orchestration.stageTitle,
            args.stageTitle,
            `Stage ${args.stageIndex}`,
          ),
          description: pickText(
            args.orchestration.stageSummary,
            `Collects the papers currently assigned to stage ${args.stageIndex}.`,
          ),
          descriptionEn: pickText(
            args.orchestration.stageSummary,
            `Collects the papers currently assigned to stage ${args.stageIndex}.`,
          ),
        },
      })
    }

    for (const action of args.orchestration.nodeActions) {
      const paperIds = Array.from(new Set(action.paperIds.filter(Boolean)))

      if (paperIds.length === 0) continue

      const primaryPaperId =
        (paperIds.includes(action.primaryPaperId) ? action.primaryPaperId : paperIds[0]) ?? paperIds[0]
      const mergeTargetId = action.action === 'merge' ? action.mergeIntoNodeId : action.nodeId
      const targetNode =
        (mergeTargetId && (await prisma.research_nodes.findUnique({ where: { id: mergeTargetId } }))) ??
        (action.nodeId ? await prisma.research_nodes.findUnique({ where: { id: action.nodeId } }) : null)

      const node =
        targetNode
          ? await prisma.research_nodes.update({
              where: { id: targetNode.id },
              data: {
                stageIndex: args.stageIndex,
                nodeLabel: pickText(action.title, targetNode.nodeLabel),
                nodeSubtitle: pickText(action.subtitle, action.titleEn, targetNode.nodeSubtitle),
                nodeSummary: pickText(action.summary, targetNode.nodeSummary),
                nodeExplanation: pickText(action.explanation, targetNode.nodeExplanation, targetNode.nodeSummary),
                primaryPaperId,
                status: 'active',
                provisional: false,
              },
            })
          : await prisma.research_nodes.create({
              data: {
                id: crypto.randomUUID(),
                updatedAt: new Date(),
                topicId: args.topicId,
                stageIndex: args.stageIndex,
                nodeLabel: pickText(action.title, 'New Node'),
                nodeSubtitle: pickText(action.subtitle, action.titleEn, action.title),
                nodeSummary: pickText(action.summary, action.explanation),
                nodeExplanation: pickText(action.explanation, action.summary),
                primaryPaperId,
                status: 'active',
                provisional: false,
                isMergeNode: action.action === 'merge',
              },
            })

      action.nodeId = node.id
      if (action.action === 'merge') {
        action.mergeIntoNodeId = node.id
      }
      affectedNodeIds.add(node.id)

      await prisma.node_papers.deleteMany({
        where: {
          nodeId: node.id,
          paperId: { notIn: paperIds },
        },
      })

      for (const [index, paperId] of paperIds.entries()) {
        await prisma.node_papers.upsert({
          where: {
            nodeId_paperId: {
              nodeId: node.id,
              paperId,
            },
          },
          update: {
            order: index + 1,
          },
          create: {
            id: crypto.randomUUID(),
            nodeId: node.id,
            paperId,
            order: index + 1,
          },
        })
      }

      let nodePapers = args.candidatePapers.filter((paper) => paperIds.includes(paper.id))
      if (nodePapers.length < paperIds.length) {
        const missingPaperIds = paperIds.filter((paperId) => !nodePapers.some((paper) => paper.id === paperId))
        if (missingPaperIds.length > 0) {
          const missingPapers = await prisma.papers.findMany({
            where: { id: { in: missingPaperIds } },
            include: {
              figures: true,
              figure_groups: {
                select: { id: true },
              },
              tables: {
                select: { id: true },
              },
              formulas: {
                select: { id: true },
              },
            },
          })

          nodePapers = [
            ...nodePapers,
            ...missingPapers.map((paper) => ({
              id: paper.id,
              title: paper.title,
              titleZh: paper.titleZh,
              titleEn: paper.titleEn,
              summary: paper.summary,
              explanation: paper.explanation,
              coverPath: paper.coverPath,
              figures: paper.figures.map((figure) => ({
                id: figure.id,
                imagePath: figure.imagePath,
                caption: figure.caption,
                analysis: figure.analysis,
              })),
              figureGroupCount: paper.figure_groups.length,
              tableCount: paper.tables.length,
              formulaCount: paper.formulas.length,
            })),
          ]
        }
      }
      const nodeCoverImage = await this.selectNodeCoverImage({
        topicId: args.topicId,
        stageIndex: args.stageIndex,
        stageTitle: args.stageTitle,
        node,
        papers: nodePapers,
      })

      if (nodeCoverImage) {
        await prisma.research_nodes.update({
          where: { id: node.id },
          data: {
            nodeCoverImage,
          },
        })
      }
    }

    return {
      affectedNodeIds: [...affectedNodeIds],
    }
  }

  private async resolveGuidanceEvidenceTarget(anchorId: string): Promise<{
    nodeId: string | null
    paperId: string | null
  }> {
    const [anchorType, entityId] = anchorId.split(':')
    if (!anchorType || !entityId) {
      return { nodeId: null, paperId: null }
    }

    if (anchorType === 'node') {
      return {
        nodeId: entityId,
        paperId: null,
      }
    }

    if (anchorType === 'paper') {
      return {
        nodeId: null,
        paperId: entityId,
      }
    }

    if (anchorType === 'figure') {
      const figure = await prisma.figures.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: figure?.paperId ?? null }
    }

    if (anchorType === 'table') {
      const table = await prisma.tables.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: table?.paperId ?? null }
    }

    if (anchorType === 'formula') {
      const formula = await prisma.formulas.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: formula?.paperId ?? null }
    }

    if (anchorType === 'section') {
      const section = await prisma.paper_sections.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: section?.paperId ?? null }
    }

    return { nodeId: null, paperId: null }
  }

  private async doesGuidanceDirectiveMatchCycle(args: {
    directive: TopicGuidanceDirective
    stageIndex: number
    admittedPaperIds: string[]
    nodeActions: ResearchNodeAction[]
    affectedNodeIds: string[]
  }): Promise<{ matched: boolean; direct: boolean }> {
    const nodeIdSet = new Set(
      [
        ...args.affectedNodeIds,
        ...args.nodeActions.map((action) => action.nodeId ?? null),
        ...args.nodeActions.map((action) => action.mergeIntoNodeId ?? null),
      ].filter((value): value is string => Boolean(value)),
    )
    const paperIdSet = new Set(
      [
        ...args.admittedPaperIds,
        ...args.nodeActions.flatMap((action) => action.paperIds ?? []),
        ...args.nodeActions.map((action) => action.primaryPaperId ?? null),
      ].filter((value): value is string => Boolean(value)),
    )

    if (args.directive.scopeType === 'topic') {
      return { matched: true, direct: false }
    }

    if (args.directive.scopeType === 'stage') {
      return {
        matched: args.directive.scopeId === String(args.stageIndex),
        direct: true,
      }
    }

    if (args.directive.scopeType === 'node') {
      return {
        matched: Boolean(args.directive.scopeId && nodeIdSet.has(args.directive.scopeId)),
        direct: true,
      }
    }

    if (args.directive.scopeType === 'paper') {
      return {
        matched: Boolean(args.directive.scopeId && paperIdSet.has(args.directive.scopeId)),
        direct: true,
      }
    }

    if (args.directive.scopeType === 'evidence') {
      const target = await this.resolveGuidanceEvidenceTarget(args.directive.scopeId ?? '')
      return {
        matched:
          (target.nodeId ? nodeIdSet.has(target.nodeId) : false) ||
          (target.paperId ? paperIdSet.has(target.paperId) : false),
        direct: true,
      }
    }

    return { matched: false, direct: false }
  }

  private buildGuidanceApplicationNote(args: {
    directive: TopicGuidanceDirective
    stageIndex: number
    stageSummary: string
    openQuestions: string[]
    nodeActions: ResearchNodeAction[]
    admitted: number
    discovered: number
  }) {
    const nodeTitles = uniqueStrings(
      args.nodeActions.map((action) => pickText(action.title, action.titleEn)),
      2,
      72,
    )
    const nodeLead =
      nodeTitles.length > 0 ? ` Node work touched ${nodeTitles.join(' / ')}.` : ''
    const stageLead = clipText(args.stageSummary, 120)
    const openQuestion = clipText(args.openQuestions[0], 84)

    if (args.directive.directiveType === 'focus') {
      return clipText(
        `Latest cycle kept stage ${args.stageIndex} centered on ${args.directive.scopeLabel}.${nodeLead} ${
          args.admitted > 0
            ? `It admitted ${args.admitted} new paper${args.admitted > 1 ? 's' : ''} without widening the brief too aggressively.`
            : stageLead
        }`,
        180,
      )
    }

    if (args.directive.directiveType === 'challenge') {
      return clipText(
        `Latest cycle re-checked ${args.directive.scopeLabel} against the current grouping and evidence.${nodeLead} ${
          openQuestion ? `The main unresolved edge is: ${openQuestion}` : stageLead
        }`,
        180,
      )
    }

    if (args.directive.directiveType === 'style') {
      return clipText(
        `Latest cycle kept this writing calibration while updating the stage narrative. ${stageLead || `Stage ${args.stageIndex} was rewritten with tighter phrasing.`}`,
        180,
      )
    }

    return clipText(
      `Latest cycle absorbed this preference while shaping stage ${args.stageIndex}. ${
        stageLead || `It reviewed ${args.discovered} candidate papers and kept the mainline coherent.`
      }${nodeLead}`,
      180,
    )
  }

  private buildGuidanceApplicationSummary(args: {
    stageIndex: number
    stageSummary: string
    appliedDirectives: Array<{
      directive: TopicGuidanceDirective
      status: TopicGuidanceDirectiveStatus
      note: string
    }>
  }) {
    const labels = uniqueStrings(
      args.appliedDirectives.map((item) => item.directive.scopeLabel || item.directive.instruction),
      2,
      42,
    )
    const directiveLabel =
      args.appliedDirectives.length === 1 ? 'directive' : 'directives'
    const labelClause = labels.length > 0 ? ` around ${labels.join(' / ')}` : ''
    const stageLead = clipText(args.stageSummary, 132)

    return clipText(
      `Stage ${args.stageIndex} applied ${args.appliedDirectives.length} guidance ${directiveLabel}${labelClause}. ${stageLead}`,
      220,
    )
  }

  private async applyGuidanceFromLatestCycle(args: {
    topicId: string
    stageIndex: number
    discovered: number
    admitted: number
    stageSummary: string
    openQuestions: string[]
    nodeActions: ResearchNodeAction[]
    admittedPaperIds: string[]
    affectedNodeIds: string[]
  }): Promise<TopicGuidanceLatestApplication | null> {
    const ledger = await loadTopicGuidanceLedger(args.topicId)
    const candidateDirectives = ledger.directives.filter(
      (directive) =>
        (directive.status === 'accepted' ||
          directive.status === 'partial' ||
          directive.status === 'deferred') &&
        directive.directiveType !== 'command',
    )

    if (candidateDirectives.length === 0) {
      return null
    }

    const appliedDirectives: Array<{
      directive: TopicGuidanceDirective
      status: TopicGuidanceDirectiveStatus
      note: string
    }> = []

    for (const directive of candidateDirectives.slice(0, 16)) {
      const match = await this.doesGuidanceDirectiveMatchCycle({
        directive,
        stageIndex: args.stageIndex,
        admittedPaperIds: args.admittedPaperIds,
        nodeActions: args.nodeActions,
        affectedNodeIds: args.affectedNodeIds,
      })

      if (!match.matched) continue

      const note = this.buildGuidanceApplicationNote({
        directive,
        stageIndex: args.stageIndex,
        stageSummary: args.stageSummary,
        openQuestions: args.openQuestions,
        nodeActions: args.nodeActions,
        admitted: args.admitted,
        discovered: args.discovered,
      })

      const status: TopicGuidanceDirectiveStatus =
        directive.appliesToRuns === 'until-cleared'
          ? directive.status
          : directive.directiveType === 'challenge'
            ? args.openQuestions.length > 0 || !match.direct
              ? 'partial'
              : 'consumed'
            : !match.direct && directive.directiveType !== 'focus'
              ? 'partial'
              : 'consumed'

      appliedDirectives.push({
        directive,
        status,
        note,
      })
    }

    if (appliedDirectives.length === 0) {
      return null
    }

    const summary = this.buildGuidanceApplicationSummary({
      stageIndex: args.stageIndex,
      stageSummary: args.stageSummary,
      appliedDirectives,
    })
    const detail = appliedDirectives.map((item) => `${item.directive.instruction}: ${item.note}`).join('\n')

    const recorded = await recordTopicGuidanceDirectiveApplication({
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      summary,
      directives: appliedDirectives.map((item) => ({
        directiveId: item.directive.id,
        status: item.status,
        note: item.note,
      })),
    })

    if (recorded.application) {
      await recordTopicGuidanceApplication({
        topicId: args.topicId,
        stageIndex: args.stageIndex,
        headline: `Guidance applied in stage ${args.stageIndex}`,
        summary,
        detail,
      })
    }

    return recorded.application
  }

  private summarizeNodeActionsForReport(
    nodeActions: ResearchNodeAction[],
    stageIndex: number,
  ): ResearchRunReport['latestNodeActions'] {
    return nodeActions.slice(0, 6).map((action) => ({
      action: action.action,
      stageIndex,
      title: pickText(action.title, action.titleEn, 'Untitled node action'),
      rationale: clipText(action.rationale, 200),
      nodeId: action.nodeId ?? null,
      mergeIntoNodeId: action.mergeIntoNodeId ?? null,
    }))
  }

  private buildFallbackResearchReport(args: {
    config: TaskConfig
    progress: StageTaskProgress
    source: SchedulerRunSource
    status: ResearchRunReport['status']
    latestCycle?: DiscoverCycleResult | null
    error?: string | null
  }): ResearchRunReport {
    const now = new Date().toISOString()
    const durationLabel = formatDurationWindowLabel(args.progress.durationHours)
    const statusLabel =
      args.status === 'running'
        ? '正在持续雕琢'
        : args.status === 'paused'
          ? '已暂停'
          : args.status === 'failed'
            ? '异常结束'
            : '已经完成'
    const recentRecords = this.getExecutionHistory(args.config.id, 6)
      .slice()
      .reverse()
      .filter((record) => record.status === 'success')
    const latestSummary =
      sanitizeResearchFacingSummary(
        args.latestCycle?.stageSummary ??
          args.progress.latestSummary ??
          recentRecords[0]?.summary ??
          '',
      ) || null
    const latestNodeActions = args.latestCycle
      ? this.summarizeNodeActionsForReport(args.latestCycle.nodeActions, args.progress.currentStage)
      : []
    const normalizedError = sanitizeResearchFacingSummary(args.error, clipText(args.error, 200)) || null
    const keyMoves = [
      args.latestCycle?.durationDecision?.summary
        ? `Latest stage decision: ${args.latestCycle.durationDecision.summary}`
        : '',
      latestSummary ? `最近一轮重点推进：${latestSummary}` : '',
      args.latestCycle?.guidanceApplicationSummary
        ? `Latest guidance adjustment: ${args.latestCycle.guidanceApplicationSummary}`
        : '',
      args.progress.completedStageCycles > 0
        ? `已经完整巡检 ${args.progress.completedStageCycles} 轮阶段主线，并继续回到前面阶段做校正。`
        : '',
      args.progress.currentStageStalls > 0
        ? `当前阶段已连续 ${args.progress.currentStageStalls} 轮未形成有效推进，系统会在必要时转向下一阶段继续巡检。`
        : '',
      ...recentRecords.slice(0, 3).map((record) => record.summary),
      ...latestNodeActions.map((action) =>
        action.rationale ? `${action.title}：${action.rationale}` : action.title,
      ),
    ]
      .map((line) => normalizeResearchTimelineLine(line))
      .filter((line) => !looksLikeLegacyEnglishResearchFallback(line))
      .map((line) => sanitizeResearchFacingSummary(line, clipText(line, 200)))
      .filter(Boolean)
      .slice(0, 6)

    const openQuestions = (args.latestCycle?.openQuestions ?? [])
      .map((item) => clipText(item, 180))
      .filter(Boolean)
      .slice(0, 6)

    const paragraphs = [
      `${args.progress.topicName} 的这轮 ${durationLabel} 研究${statusLabel}。系统围绕当前主题主线持续检索、纳入、改写并回看已有节点，而不是按预设轮次机械停下。`,
      `截至目前，已经完成 ${args.progress.totalRuns} 次研究循环，累计发现 ${args.progress.discoveredPapers} 篇候选论文，纳入 ${args.progress.admittedPapers} 篇，触发 ${args.progress.generatedContents} 次内容重建。当前停留在第 ${args.progress.currentStage} / ${args.progress.totalStages} 阶段。`,
      latestSummary
        ? `最近一轮最关键的推进是：${latestSummary}`
        : '这轮研究仍在围绕现有证据继续收束主线，并为后续节点修正保留判断空间。',
      normalizedError ? `本轮还出现了需要继续处理的问题：${normalizedError}` : '',
    ]
      .map((line) => clipText(line, 280))
      .filter(Boolean)
      .slice(0, 4)

    const headline =
      args.status === 'running'
        ? `${durationLabel} 研究进行中`
        : args.status === 'paused'
          ? `${durationLabel} 研究已暂停`
          : args.status === 'failed'
            ? `${durationLabel} 研究中断`
            : `${durationLabel} 研究完成`

    const dek =
      latestSummary ??
      `围绕主题主线持续推进节点归纳、论文吸收与叙事修整，直到时间预算耗尽。`

    return {
      schemaVersion: 'topic-research-report-v1',
      reportId: args.progress.activeSessionId ?? `report-${Date.now()}`,
      taskId: args.config.id,
      topicId: args.progress.topicId,
      topicName: args.progress.topicName,
      researchMode: args.progress.researchMode,
      trigger: args.source,
      status: args.status,
      durationHours: args.progress.durationHours,
      startedAt: args.progress.startedAt ?? now,
      deadlineAt: args.progress.deadlineAt,
      completedAt: args.status === 'running' ? null : args.progress.completedAt ?? now,
      updatedAt: now,
      currentStage: args.progress.currentStage,
      totalStages: args.progress.totalStages,
      completedStageCycles: args.progress.completedStageCycles,
      totalRuns: args.progress.totalRuns,
      successfulRuns: args.progress.successfulRuns,
      failedRuns: args.progress.failedRuns,
      discoveredPapers: args.progress.discoveredPapers,
      admittedPapers: args.progress.admittedPapers,
      generatedContents: args.progress.generatedContents,
      latestStageSummary: latestSummary,
      headline,
      dek: clipText(dek, 180),
      summary: clipText(paragraphs.join(' '), 360),
      paragraphs,
      keyMoves,
      openQuestions,
      latestNodeActions,
    }
  }

  private deriveResearchReportStatus(
    progress: StageTaskProgress | null,
    active: boolean,
  ): ResearchRunReport['status'] {
    if (active) return 'running'
    if (progress?.status === 'failed') return 'failed'
    if (progress?.status === 'completed') return 'completed'
    return 'paused'
  }

  private shouldPreferFallbackResearchReport(
    progress: StageTaskProgress | null,
    report: ResearchRunReport | null,
    active: boolean,
    fallback?: ResearchRunReport | null,
  ) {
    return shouldPreferFallbackResearchReportState({
      progress,
      report,
      active,
      fallback,
    })
  }

  private async writeResearchReport(args: {
    config: TaskConfig
    progress: StageTaskProgress
    source: SchedulerRunSource
    status: ResearchRunReport['status']
    latestCycle?: DiscoverCycleResult | null
    error?: string | null
  }) {
    if (!args.progress.topicId) return null

    const fallback = this.buildFallbackResearchReport(args)
    const durationStrategy = await this.resolveDurationResearchStrategy(
      args.config,
      args.progress.topicId,
    )
    const generated = await runStructuredGenerationPass<{
      headline: string
      dek: string
      summary: string
      paragraphs: string[]
      keyMoves: string[]
      openQuestions: string[]
    }>({
      topicId: args.progress.topicId,
      subjectType: 'topic',
      subjectId: `research-report:${args.progress.activeSessionId ?? args.config.id}`,
      templateId: PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_REPORT,
      input: {
        topic: {
          topicId: args.progress.topicId,
          title: args.progress.topicName,
        },
        task: {
          taskId: args.config.id,
          name: args.config.name,
          researchMode: args.progress.researchMode,
          durationHours: args.progress.durationHours,
          trigger: args.source,
          status: args.status,
        },
        progress: {
          currentStage: args.progress.currentStage,
          totalStages: args.progress.totalStages,
          completedStageCycles: args.progress.completedStageCycles,
          totalRuns: args.progress.totalRuns,
          successfulRuns: args.progress.successfulRuns,
          failedRuns: args.progress.failedRuns,
          discoveredPapers: args.progress.discoveredPapers,
          admittedPapers: args.progress.admittedPapers,
          generatedContents: args.progress.generatedContents,
        },
        durationStrategy: {
          cycleDelayMs: durationStrategy.cycleDelayMs,
          stageStallLimit: durationStrategy.stageStallLimit,
          reportPasses: durationStrategy.reportPasses,
          targets: durationStrategy.targets,
          perspectives: durationStrategy.perspectives,
          qualityBars: durationStrategy.qualityBars,
        },
        latestCycle: args.latestCycle
          ? {
              stageSummary: args.latestCycle.stageSummary,
              discovered: args.latestCycle.discovered,
              admitted: args.latestCycle.admitted,
              contentsGenerated: args.latestCycle.contentsGenerated,
              nodeActions: this.summarizeNodeActionsForReport(
                args.latestCycle.nodeActions,
                args.progress.currentStage,
              ),
              openQuestions: args.latestCycle.openQuestions,
              durationDecision: args.latestCycle.durationDecision
                ? {
                    action: args.latestCycle.durationDecision.action,
                    reason: args.latestCycle.durationDecision.reason,
                    currentStage: args.latestCycle.durationDecision.currentStage,
                    nextStage: args.latestCycle.durationDecision.nextStage,
                    summary: args.latestCycle.durationDecision.summary ?? '',
                    rationale: args.latestCycle.durationDecision.rationale ?? '',
                  }
                : null,
            }
          : null,
        recentHistory: this.getExecutionHistory(args.config.id, 6),
        error: args.error ?? null,
      },
      fallback: {
        headline: fallback.headline,
        dek: fallback.dek,
        summary: fallback.summary,
        paragraphs: fallback.paragraphs,
        keyMoves: fallback.keyMoves,
        openQuestions: fallback.openQuestions,
      },
      outputContract: JSON.stringify(
        {
          headline: '',
          dek: '',
          summary: '',
          paragraphs: [''],
          keyMoves: [''],
          openQuestions: [''],
        },
        null,
        2,
      ),
      maxTokens: 1800,
      summaryHint: fallback.summary,
    })

    const report: ResearchRunReport = {
      ...fallback,
      headline:
        args.status === 'running'
          ? clipText(generated.output.headline, 120) || fallback.headline
          : fallback.headline,
      dek: clipText(generated.output.dek, 180) || fallback.dek,
      summary: clipText(generated.output.summary, 360) || fallback.summary,
      paragraphs:
        Array.isArray(generated.output.paragraphs) && generated.output.paragraphs.length > 0
          ? generated.output.paragraphs.map((item) => clipText(item, 280)).filter(Boolean).slice(0, 4)
          : fallback.paragraphs,
      keyMoves:
        Array.isArray(generated.output.keyMoves) && generated.output.keyMoves.length > 0
          ? generated.output.keyMoves.map((item) => clipText(item, 200)).filter(Boolean).slice(0, 6)
          : fallback.keyMoves,
      openQuestions:
        Array.isArray(generated.output.openQuestions) && generated.output.openQuestions.length > 0
          ? generated.output.openQuestions.map((item) => clipText(item, 180)).filter(Boolean).slice(0, 6)
          : fallback.openQuestions,
      updatedAt: new Date().toISOString(),
    }

    await saveTopicResearchReport(report)
    return report
  }

  private applyDurationResearchDecision(
    config: TaskConfig,
    progress: StageTaskProgress,
    decision: ResearchPipelineDurationDecision,
  ) {
    progress.currentStageStalls = decision.stallCountAfter ?? progress.currentStageStalls
    progress.completedStageCycles =
      decision.completedStageCycles ?? progress.completedStageCycles

    if (decision.action === 'stay') {
      this.syncStageRoundCounters(config, progress)
      return
    }

    this.moveToStage(config, progress, decision.nextStage)
  }

  async executeStageTask(
    config: TaskConfig,
    session?: {
      sessionId?: string
      source?: SchedulerRunSource
      durationStrategy?: DurationResearchStrategy
    },
  ): Promise<EnhancedTaskResult> {
    return this._executeStageTask(config, session)
  }

  private async _executeStageTask(
    config: TaskConfig,
    session?: {
      sessionId?: string
      source?: SchedulerRunSource
      durationStrategy?: DurationResearchStrategy
    },
  ): Promise<EnhancedTaskResult> {
    const startTime = Date.now()
    const result: EnhancedTaskResult = {
      taskId: config.id,
      success: false,
      executedAt: new Date(),
    }

    console.log(`[Scheduler] Executing stage task: ${config.name}`)

    const progress = this.progress.get(config.id)
    if (!progress) {
      result.error = 'Task progress not found'
      return result
    }

    const currentStage = progress.currentStage
    const context = this.createSkillContext(config.id)
    const researchMode = resolveResearchMode(config)
    const durationStrategy =
      researchMode === 'duration'
        ? (session?.durationStrategy ?? await this.resolveDurationResearchStrategy(config))
        : null
    let latestCycle: DiscoverCycleResult | null = null

    try {
      switch (config.action) {
        case 'discover': {
          const metricBaseline = {
            discoveredPapers: progress.discoveredPapers,
            admittedPapers: progress.admittedPapers,
            generatedContents: progress.generatedContents,
          }
          const discoverResult = await this.executeRealDiscover(
            config,
            currentStage,
            progress,
            context,
            durationStrategy,
          )
          latestCycle = discoverResult
          result.result = discoverResult

          progress.totalRuns += 1
          progress.successfulRuns += 1
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          progress.discoveredPapers = Math.max(
            progress.discoveredPapers,
            metricBaseline.discoveredPapers + (discoverResult.discovered || 0),
          )
          progress.admittedPapers = Math.max(
            progress.admittedPapers,
            metricBaseline.admittedPapers + (discoverResult.admitted || 0),
          )
          progress.generatedContents = Math.max(
            progress.generatedContents,
            metricBaseline.generatedContents + (discoverResult.contentsGenerated || 0),
          )
          progress.latestSummary =
            sanitizeResearchFacingSummary(discoverResult.stageSummary) || null

          this.markStageRun(config, progress)

          if (researchMode === 'duration') {
            const durationDecision =
              discoverResult.durationDecision ??
              buildDurationResearchDecision({
                currentStage,
                totalStages: progress.totalStages,
                currentStageStalls: progress.currentStageStalls,
                completedStageCycles: progress.completedStageCycles,
                stageStallLimit: durationStrategy?.stageStallLimit ?? 1,
                cycle: discoverResult,
              })
            discoverResult.durationDecision = durationDecision
            this.applyDurationResearchDecision(config, progress, durationDecision)

            // Handle lens rotation for duration research
            if (durationStrategy && durationStrategy.lenses.length > 0) {
              const currentLens = getCurrentResearchLens(durationStrategy.lenses, progress)
              const madeProgress =
                discoverResult.discovered > 0 ||
                discoverResult.admitted > 0 ||
                discoverResult.contentsGenerated > 0

              // Update stall count for current lens
              updateLensStallCount(currentLens, progress, madeProgress)

              // Rotate lens when stage advances or cycle resets
              if (durationDecision.action !== 'stay') {
                const nextLens = rotateResearchLens(
                  durationStrategy.lenses,
                  progress,
                  durationDecision.reason === 'stall-limit' ? 'stall-limit' : 'cycle-complete',
                )
                if (nextLens) {
                  console.log(
                    `[Scheduler] Rotated to lens: ${nextLens.id} (${nextLens.label}) for next cycle`,
                  )
                }
              }
            }

            if (durationDecision.action !== 'stay') {
              console.log(
                `[Scheduler] Duration research decision ${durationDecision.action} -> stage ${durationDecision.nextStage} (${durationDecision.reason})`,
              )
            }
          } else if (this.shouldAdvanceStage(config, progress) && discoverResult.shouldAdvanceStage) {
            if (currentStage < progress.totalStages) {
              this.moveToStage(config, progress, currentStage + 1)
              console.log(`[Scheduler] Advancing to stage ${progress.currentStage}`)
            } else {
              progress.status = 'completed'
              progress.stageProgress = 100
              console.log(`[Scheduler] All stages completed for task ${config.id}`)
            }
          } else if (this.shouldAdvanceStage(config, progress) && !discoverResult.shouldAdvanceStage) {
            console.log(
              `[Scheduler] Stage ${currentStage} reached configured rounds but orchestration kept it open`,
            )
          }

          if (config.topicId) {
            void recordTopicResearchCycle({
              topicId: config.topicId,
              stageIndex: currentStage,
              headline: discoverResult.shouldAdvanceStage
                ? `Stage ${currentStage} 收束并准备推进`
                : `Stage ${currentStage} 持续打磨`,
              summary: discoverResult.stageSummary,
              nodeTitles: uniqueStrings(
                discoverResult.nodeActions.map((action) => pickText(action.title, action.titleEn)),
                6,
                80,
              ),
              paperIds: discoverResult.admittedPaperIds,
              openQuestions: discoverResult.openQuestions,
            }).catch((error) => {
              console.error(`[Scheduler] Failed to write research cycle memory for ${config.id}:`, error)
            })
          }
          break
        }

        case 'refresh': {
          const refreshResult = await this.executeRealRefresh(config, progress, context)
          result.result = refreshResult
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          break
        }

        case 'sync': {
          const syncResult = await this.executeRealSync(config, progress, context)
          result.result = syncResult
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          break
        }
      }

      result.success = true
      result.duration = Date.now() - startTime
      result.progress = progress
      await this.saveProgress(config.id, progress)
      await this.addExecutionRecord(config.id, {
        id: `exec-${Date.now()}`,
        taskId: config.id,
        runAt: new Date().toISOString(),
        duration: result.duration,
        status: 'success',
        stageIndex: currentStage,
        papersDiscovered: (result.result as { discovered?: number } | undefined)?.discovered || 0,
        papersAdmitted: (result.result as { admitted?: number } | undefined)?.admitted || 0,
        contentsGenerated: (result.result as { contentsGenerated?: number } | undefined)?.contentsGenerated || 0,
        sessionId: session?.sessionId,
        summary: formatStageRecordSummary(currentStage, latestCycle?.stageSummary ?? ''),
      })
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      result.duration = Date.now() - startTime
      progress.totalRuns += 1
      progress.failedRuns += 1
      progress.lastRunResult = 'failed'
      progress.lastRunAt = new Date().toISOString()
      progress.latestSummary =
        sanitizeResearchFacingSummary(result.error, DEFAULT_RESEARCH_STATUS_ISSUE_SUMMARY) || null

      await this.saveProgress(config.id, progress)
      await this.addExecutionRecord(config.id, {
        id: `exec-${Date.now()}`,
        taskId: config.id,
        runAt: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'failed',
        stageIndex: currentStage,
        papersDiscovered: 0,
        papersAdmitted: 0,
        contentsGenerated: 0,
        sessionId: session?.sessionId,
        error: result.error,
        summary: formatStageFailureSummary(currentStage, result.error),
      })

      console.error(`[Scheduler] Task ${config.name} failed:`, error)
    }

    for (const listener of this.listeners) {
      try {
        await listener(result)
      } catch (error) {
        console.error('[Scheduler] Listener error:', error)
      }
    }

    return result
  }

  private async publishLiveResearchSummary(
    taskId: string,
    progress: StageTaskProgress,
    summary: string | null | undefined,
  ) {
    const normalized = clipText(
      sanitizeResearchFacingSummary(summary, summary ?? '') || summary || '',
      220,
    )

    if (!normalized || progress.latestSummary === normalized) {
      return
    }

    await this.persistLiveResearchProgress({
      taskId,
      progress,
      latestSummary: normalized,
    })
  }

  private async persistLiveResearchProgress(args: {
    taskId: string
    progress: StageTaskProgress
    discoveredPapers?: number
    admittedPapers?: number
    generatedContents?: number
    latestSummary?: string | null
  }) {
    let changed = false

    if (
      typeof args.discoveredPapers === 'number' &&
      Number.isFinite(args.discoveredPapers) &&
      args.progress.discoveredPapers !== args.discoveredPapers
    ) {
      args.progress.discoveredPapers = Math.max(0, Math.trunc(args.discoveredPapers))
      changed = true
    }

    if (
      typeof args.admittedPapers === 'number' &&
      Number.isFinite(args.admittedPapers) &&
      args.progress.admittedPapers !== args.admittedPapers
    ) {
      args.progress.admittedPapers = Math.max(0, Math.trunc(args.admittedPapers))
      changed = true
    }

    if (
      typeof args.generatedContents === 'number' &&
      Number.isFinite(args.generatedContents) &&
      args.progress.generatedContents !== args.generatedContents
    ) {
      args.progress.generatedContents = Math.max(0, Math.trunc(args.generatedContents))
      changed = true
    }

    if (typeof args.latestSummary === 'string' && args.latestSummary && args.progress.latestSummary !== args.latestSummary) {
      args.progress.latestSummary = args.latestSummary
      changed = true
    }

    if (changed) {
      await this.saveProgress(args.taskId, args.progress)
    }
  }

  private shouldAbortInFlightDurationWork(config: TaskConfig, progress: StageTaskProgress) {
    return resolveResearchMode(config) === 'duration' && (!progress.activeSessionId || progress.status === 'paused')
  }

  private buildAbortedDiscoverCycle(args: {
    stageIndex: number
    discovered: number
    admitted: number
    contentsGenerated: number
    note: string
    admittedPaperIds?: string[]
  }): DiscoverCycleResult {
    return {
      discovered: args.discovered,
      admitted: args.admitted,
      contentsGenerated: args.contentsGenerated,
      shouldAdvanceStage: false,
      stageSummary: clipText(args.note, 280),
      openQuestions: [],
      nodeActions: [],
      admittedPaperIds: args.admittedPaperIds ?? [],
      affectedNodeIds: [],
      guidanceApplicationSummary: null,
    }
  }

  private async executeRealDiscover(
    config: TaskConfig,
    stageIndex: number,
    progress: StageTaskProgress,
    context: RuntimeSkillContext,
    durationStrategy?: DurationResearchStrategy | null,
  ): Promise<DiscoverCycleResult> {
    console.log(`[Scheduler] Real discover round for stage ${stageIndex}, topic: ${config.topicId}`)

    if (!config.topicId) {
      throw new Error('Task must have a topicId for discovery action')
    }

    const runtime = await getGenerationRuntimeConfig()
    const roundIndex = (progress.stageRunMap[String(stageIndex)] ?? 0) + 1
    const progressBaseline = {
      discoveredPapers: progress.discoveredPapers,
      admittedPapers: progress.admittedPapers,
      generatedContents: progress.generatedContents,
    }
    const { executePaperTracker } = require('../../skill-packs/research/paper-tracker/executor') as {
      executePaperTracker: (input: { params: Record<string, unknown>; context?: Record<string, unknown> }, context: SkillContext, artifactManager: ArtifactManager | null) => Promise<{ success: boolean; data?: unknown; error?: string }>
    }
    const { executeContentGenesis } = require('../../skill-packs/research/content-genesis-v2/executor') as {
      executeContentGenesis: (input: { params: Record<string, unknown>; context?: Record<string, unknown> }, context: SkillContext, artifactManager: ArtifactManager | null) => Promise<{ success: boolean; data?: unknown; error?: string }>
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在检索并筛选新的论文候选，准备继续延展当前主线。`,
    )

    const trackerResult = await executePaperTracker(
      {
        params: {
          topicId: config.topicId,
          stageIndex,
          stageMode: 'current',
          discoverySource: 'external-only',
          maxCandidates: durationStrategy?.targets.stageCandidateBudget,
          maxPapersPerNode: durationStrategy?.targets.nodePaperTargetMax,
          minimumUsefulPapersPerNode: durationStrategy?.targets.nodePaperTargetMin,
          durationResearchPolicy: {
            stageWindowHours: progress.durationHours,
            maxCandidatesPerStage: durationStrategy?.targets.stageCandidateBudget,
            targetPapersPerNode: durationStrategy?.targets.nodePaperTargetMax,
            minimumUsefulPapersPerNode: durationStrategy?.targets.nodePaperTargetMin,
            targetCandidatesBeforeAdmission:
              durationStrategy?.targets.targetCandidatesBeforeAdmission,
            highConfidenceThreshold: durationStrategy?.targets.highConfidenceThreshold,
            admissionMode: 'broad-but-relevant',
            researchAngles: durationStrategy?.lenses.map((lens) => ({
              id: lens.id,
              label: lens.label,
              focus: lens.focus,
              prompts: lens.prompts,
            })),
          },
          mode: 'commit',
        },
        context: {},
      },
      context as unknown as SkillContext,
      nullArtifactManager,
    )

    if (!trackerResult.success) {
      throw new Error(trackerResult.error || 'Paper tracker failed')
    }

    const trackerData = (trackerResult.data ?? {}) as Record<string, any>
    const admittedCandidates = Array.isArray(trackerData.admittedCandidates)
      ? (trackerData.admittedCandidates as Array<Record<string, any>>)
      : []
    const discovered =
      typeof trackerData.discoverySummary?.totalDiscovered === 'number'
        ? trackerData.discoverySummary.totalDiscovered
        : admittedCandidates.length
    const admittedPaperIds = admittedCandidates
      .map((candidate) => (typeof candidate.paperId === 'string' ? candidate.paperId : null))
      .filter((paperId): paperId is string => Boolean(paperId))

    await this.persistLiveResearchProgress({
      taskId: config.id,
      progress,
      discoveredPapers: progressBaseline.discoveredPapers + discovered,
      admittedPapers: progressBaseline.admittedPapers + admittedCandidates.length,
    })

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      admittedCandidates.length > 0
        ? `第 ${stageIndex} 阶段已发现 ${discovered} 篇候选论文，并纳入 ${admittedCandidates.length} 篇进入后续整理。`
        : `第 ${stageIndex} 阶段已完成候选筛选，共发现 ${discovered} 篇论文，当前继续收束既有节点判断。`,
    )

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated: 0,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在论文发现完成后已被暂停，本轮已纳入的论文会在下一次研究中继续展开节点归纳与文章化整理。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在把新证据折叠回阶段结构，准备形成新的节点判断。`,
    )

    const [preTopic, preStage, preExistingNodes, preCandidatePapers] = await Promise.all([
      prisma.topics.findUnique({
        where: { id: config.topicId },
      }),
      prisma.topic_stages.findFirst({
        where: { topicId: config.topicId, order: stageIndex },
      }),
      prisma.research_nodes.findMany({
        where: { topicId: config.topicId, stageIndex },
        include: {
          node_papers: {
            include: {
              papers: true,
            },
            orderBy: { order: 'asc' },
          },
          papers: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.loadCandidatePapers(config.topicId, admittedCandidates),
    ])

const useHeuristicBootstrap =
      preExistingNodes.length === 0 && preCandidatePapers.length > 0

    // Get current lens for angle-specific research
    const currentLens = durationStrategy
      ? getCurrentResearchLens(durationStrategy.lenses, progress)
      : null

    if (preTopic && !this.shouldAbortInFlightDurationWork(config, progress)) {
      const earlyOrchestration = useHeuristicBootstrap
        ? this.buildFallbackOrchestration({
            topic: preTopic,
            stage: preStage,
            existingNodes: preExistingNodes,
            candidatePapers: preCandidatePapers,
          })
        : await this.orchestrateStageResearch({
            topicId: config.topicId,
            stageIndex,
            roundIndex,
            topic: preTopic,
            stage: preStage,
            existingNodes: preExistingNodes,
            candidatePapers: preCandidatePapers,
            durationStrategy,
            currentLens,
          })

      if (!this.shouldAbortInFlightDurationWork(config, progress)) {
        await this.publishLiveResearchSummary(
          config.id,
          progress,
          `第 ${stageIndex} 阶段已完成结构判断，正在把新的节点归纳与主线修正提前写回主题。`,
        )

        const earlyNodeActionResult = await this.applyResearchNodeActions({
          topicId: config.topicId,
          stageIndex,
          stageTitle: earlyOrchestration.stageTitle,
          orchestration: earlyOrchestration,
          candidatePapers: preCandidatePapers,
        })
        await syncConfiguredTopicWorkflowSnapshot(config.topicId)

        if (!this.shouldAbortInFlightDurationWork(config, progress)) {
          const earlyTargetedNodeIds = earlyNodeActionResult.affectedNodeIds.slice(
            0,
            runtime.researchArtifactRebuildLimit,
          )

          await this.publishLiveResearchSummary(
            config.id,
            progress,
            `第 ${stageIndex} 阶段正在提前发布主题快照，让主题页先展示节点结构与阶段判断。`,
          )

          await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })

          const earlyWarm = await warmTopicReaderArtifacts(config.topicId, {
            limit: runtime.researchArtifactRebuildLimit,
            mode: 'deferred',
            includeEnhancedNodes: true,
            entityIds: {
              nodeIds: earlyTargetedNodeIds,
              paperIds: [],
            },
          })

          await this.publishLiveResearchSummary(
            config.id,
            progress,
            earlyWarm.queuedNodeCount > 0
              ? `第 ${stageIndex} 阶段的主题快照已提前更新，${earlyWarm.queuedNodeCount} 个节点已经可以展示，论文细稿会继续在后台补齐。`
              : `第 ${stageIndex} 阶段的主题快照已提前更新，当前没有额外节点任务需要排队。`,
          )
        }
      }
    }

    let contentsGenerated = 0
    for (const [index, candidate] of admittedCandidates.entries()) {
      if (this.shouldAbortInFlightDurationWork(config, progress)) {
        return this.buildAbortedDiscoverCycle({
          stageIndex,
          discovered,
          admitted: admittedCandidates.length,
          contentsGenerated,
          admittedPaperIds,
          note: `第 ${stageIndex} 阶段在内容生成过程中被暂停，当前已纳入的论文与已完成的整理结果会保留下来，下次研究将从这里继续。`,
        })
      }

      await this.publishLiveResearchSummary(
        config.id,
        progress,
        `第 ${stageIndex} 阶段正在为新纳入论文生成内容底稿（${index + 1}/${admittedCandidates.length}）。`,
      )

      const contentResult = await executeContentGenesis(
        {
          params: {
            paperId: candidate.paperId,
            topicId: config.topicId,
            stageIndex,
            citeIntent: candidate.citeIntent,
            contentMode: 'editorial',
          },
          context: {},
        },
        context as unknown as SkillContext,
        nullArtifactManager,
      )

      if (contentResult.success) {
        contentsGenerated += 1
        await this.persistLiveResearchProgress({
          taskId: config.id,
          progress,
          generatedContents: progressBaseline.generatedContents + contentsGenerated,
        })
      } else if (
        typeof contentResult.error === 'string' &&
        /\b(?:topic|paper) not found\b|disappeared before persistence/iu.test(contentResult.error)
      ) {
        return this.buildAbortedDiscoverCycle({
          stageIndex,
          discovered,
          admitted: admittedCandidates.length,
          contentsGenerated,
          admittedPaperIds,
          note: `第 ${stageIndex} 阶段在内容整理期间检测到主题或论文已被移除，本轮提前收口，避免继续回写失效对象。`,
        })
      }
    }

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段已暂停，论文吸收结果已经保留，但节点结构与主题快照会等下一次研究继续完成。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在整合候选论文与既有节点，准备形成新的阶段判断。`,
    )

    const [topic, stage, existingNodes, candidatePapers] = await Promise.all([
      prisma.topics.findUnique({
        where: { id: config.topicId },
      }),
      prisma.topic_stages.findFirst({
        where: { topicId: config.topicId, order: stageIndex },
      }),
      prisma.research_nodes.findMany({
        where: { topicId: config.topicId, stageIndex },
        include: {
          node_papers: {
            include: {
              papers: true,
            },
            orderBy: { order: 'asc' },
          },
          papers: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.loadCandidatePapers(config.topicId, admittedCandidates),
    ])

    if (!topic) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在主题移除后中止，当前研究循环不会再继续写回节点与主题快照。`,
      })
    }

    const orchestration = useHeuristicBootstrap
      ? this.buildFallbackOrchestration({
          topic,
          stage,
          existingNodes,
          candidatePapers,
        })
      : await this.orchestrateStageResearch({
          topicId: config.topicId,
          stageIndex,
          roundIndex,
          topic,
          stage,
          existingNodes,
          candidatePapers,
          durationStrategy,
          currentLens: durationStrategy
            ? getCurrentResearchLens(durationStrategy.lenses, progress)
            : null,
        })

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在节点归纳前被暂停，已吸收的论文证据会在下次研究中继续折叠进主线。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段已完成结构判断，正在把新的节点归纳与主线修正写回主题。`,
    )

    const nodeActionResult = await this.applyResearchNodeActions({
      topicId: config.topicId,
      stageIndex,
      stageTitle: orchestration.stageTitle,
      orchestration,
      candidatePapers,
    })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在节点写回后被暂停，后续主题快照与导出会在下一次研究中继续刷新。`,
      })
    }

    const targetedNodeIds = nodeActionResult.affectedNodeIds.slice(0, runtime.researchArtifactRebuildLimit)
    const targetedPaperIds = admittedPaperIds.slice(0, runtime.researchArtifactRebuildLimit)
    const durationDecision =
      resolveResearchMode(config) === 'duration' && durationStrategy
        ? buildDurationResearchDecision({
            currentStage: stageIndex,
            totalStages: progress.totalStages,
            currentStageStalls: progress.currentStageStalls,
            completedStageCycles: progress.completedStageCycles,
            stageStallLimit: durationStrategy.stageStallLimit,
            cycle: {
              discovered,
              admitted: admittedCandidates.length,
              contentsGenerated,
              shouldAdvanceStage: orchestration.shouldAdvanceStage,
              stageSummary: orchestration.stageSummary,
            },
          })
        : null
    const guidanceApplication = await this.applyGuidanceFromLatestCycle({
      topicId: config.topicId,
      stageIndex,
      discovered,
      admitted: admittedCandidates.length,
      stageSummary: orchestration.stageSummary,
      openQuestions: orchestration.openQuestions,
      nodeActions: orchestration.nodeActions,
      admittedPaperIds,
      affectedNodeIds: nodeActionResult.affectedNodeIds,
    })

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在主题快照发布前被暂停，节点更新已经保留，视图快照会在下一次研究时继续刷新。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在发布主题快照；节点与论文的深度文章化内容会继续在后台完善。`,
    )

    const warmed = await orchestrateTopicReaderArtifacts(config.topicId, {
      limit: runtime.researchArtifactRebuildLimit,
      mode: 'deferred',
      includeEnhancedNodes: true,
      entityIds: {
        nodeIds: targetedNodeIds,
        paperIds: targetedPaperIds,
      },
      pipelineEntry: {
        stageIndex,
        roundIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        stageSummary: orchestration.stageSummary,
        shouldAdvanceStage: orchestration.shouldAdvanceStage,
        durationDecision: durationDecision ?? undefined,
        nodeActions: orchestration.nodeActions,
        openQuestions: orchestration.openQuestions,
      },
    })
    await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      warmed.queuedNodeCount > 0 || warmed.queuedPaperCount > 0
        ? `第 ${stageIndex} 阶段的主题快照已更新，${warmed.queuedNodeCount} 个节点与 ${warmed.queuedPaperCount} 篇论文正在后台继续打磨深度文章。`
        : `第 ${stageIndex} 阶段的主题快照已更新，当前没有额外的深度文章重建任务在排队。`,
    )

    return {
      discovered,
      admitted: admittedCandidates.length,
      contentsGenerated,
      shouldAdvanceStage: orchestration.shouldAdvanceStage,
      stageSummary: orchestration.stageSummary,
      openQuestions: orchestration.openQuestions,
      nodeActions: orchestration.nodeActions,
      admittedPaperIds,
      affectedNodeIds: nodeActionResult.affectedNodeIds,
      guidanceApplicationSummary: guidanceApplication?.summary ?? null,
      durationDecision,
    }
  }

  private async executeRealRefresh(
    config: TaskConfig,
    progress: StageTaskProgress,
    _context: RuntimeSkillContext,
  ): Promise<{
    refreshed: boolean
    stage: number
    papersUpdated: number
  }> {
    console.log(`[Scheduler] Real refresh for stage ${progress.currentStage}`)

    if (!config.topicId) {
      throw new Error('Task must have a topicId for refresh action')
    }

    const runtime = await getGenerationRuntimeConfig()
    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${progress.currentStage} 阶段正在刷新主题快照，深度阅读稿会在后台继续补齐。`,
    )
    const warmed = await orchestrateTopicReaderArtifacts(config.topicId, {
      limit: runtime.researchArtifactRebuildLimit,
      mode: 'deferred',
      includeEnhancedNodes: true,
    })
    await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    return {
      refreshed: true,
      stage: progress.currentStage,
      papersUpdated: Math.max(warmed.warmedPaperCount, warmed.queuedPaperCount),
    }
  }

  private async executeRealSync(
    config: TaskConfig,
    progress: StageTaskProgress,
    _context: RuntimeSkillContext,
  ): Promise<{
    synced: boolean
    stage: number
    papersSynced: number
  }> {
    console.log(`[Scheduler] Real sync for stage ${progress.currentStage}`)

    if (!config.topicId) {
      throw new Error('Task must have a topicId for sync action')
    }

    const runtime = await getGenerationRuntimeConfig()
    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${progress.currentStage} 阶段正在同步阅读快照，后台会继续收尾节点和论文的深度重建。`,
    )
    const warmed = await orchestrateTopicReaderArtifacts(config.topicId, {
      limit: runtime.researchArtifactRebuildLimit,
      mode: 'deferred',
      includeEnhancedNodes: true,
    })
    await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    return {
      synced: true,
      stage: progress.currentStage,
      papersSynced: warmed.warmedPaperCount,
    }
  }

  private async dispatchTask(
    config: TaskConfig,
    source: SchedulerRunSource,
    options?: { forceStage?: number; mode?: 'full' | 'discover-only' },
  ): Promise<EnhancedTaskResult> {
    let progress = this.progress.get(config.id)

if (!progress) {
      await this.initProgress(config)
      progress = this.progress.get(config.id)
    }

    if (progress && options?.forceStage !== undefined) {
      this.moveToStage(config, progress, options.forceStage)
      await this.saveProgress(config.id, progress)
    }

    if (progress) {
      await this.refreshTopicStageCapacity(config, progress)
      this.syncStageRoundCounters(config, progress)
      await this.saveProgress(config.id, progress)
    }

    if (resolveResearchMode(config) === 'duration' && config.action === 'discover') {
      return this.startDurationTask(config, source)
    }

    return this.executeStageTask(config, { source })
  }

  private async startDurationTask(
    config: TaskConfig,
    source: SchedulerRunSource,
  ): Promise<EnhancedTaskResult> {
    let progress = this.progress.get(config.id)
    if (!progress) {
      await this.initProgress(config)
      progress = this.progress.get(config.id)
    }

    if (!progress) {
      return {
        taskId: config.id,
        success: false,
        executedAt: new Date(),
        error: 'Task progress not found',
      }
    }

    const active = this.activeSessions.get(config.id)
    if (active) {
      return {
        taskId: config.id,
        success: true,
        executedAt: new Date(),
        result: {
          queued: false,
          alreadyRunning: true,
          sessionId: active.sessionId,
          deadlineAt: active.deadlineAt,
        },
        progress,
      }
    }

    const durationHours = resolveDurationHours(config) ?? DEFAULT_DURATION_HOURS
    const startedAt = new Date()
    const deadlineAt = new Date(startedAt.getTime() + durationHours * 60 * 60 * 1000)
    const sessionId = `research-${Date.now()}`

    if (this.shouldResetLegacyDurationProgress(progress)) {
      this.resetProgressSnapshot(config, progress)
    }

    progress.researchMode = 'duration'
    progress.durationHours = durationHours
    progress.startedAt = startedAt.toISOString()
    progress.deadlineAt = deadlineAt.toISOString()
    progress.completedAt = null
    progress.activeSessionId = sessionId
    progress.currentStageStalls = 0
    progress.latestSummary = null
    progress.status = 'active'
    this.syncStageRoundCounters(config, progress)

    await this.saveProgress(config.id, progress)
    if (config.topicId) {
      void recordTopicResearchStatus({
        topicId: config.topicId,
        stageIndex: progress.currentStage,
        headline: `${formatDurationWindowLabel(durationHours)} research started`,
        summary: `系统开始围绕第 ${progress.currentStage} 阶段持续研究，并会把新的论文吸收、节点修正与阶段判断持续写回同一条主题主线。`,
      }).catch((error) => {
        console.error(`[Scheduler] Failed to write research status memory for ${config.id}:`, error)
      })
    }
    void this.writeResearchReport({
      config,
      progress,
      source,
      status: 'running',
    }).catch((error) => {
      console.error(`[Scheduler] Failed to write initial research report for ${config.id}:`, error)
    })

    const promise = BACKGROUND_DURATION_RUNS_DISABLED
      ? createDormantDurationSessionPromise()
      : this.launchDurationTask(config, sessionId, source)
    this.activeSessions.set(config.id, {
      sessionId,
      source,
      startedAt: progress.startedAt ?? startedAt.toISOString(),
      deadlineAt: progress.deadlineAt ?? deadlineAt.toISOString(),
      promise,
    })

    if (!BACKGROUND_DURATION_RUNS_DISABLED) {
      void promise.finally(() => {
        const current = this.activeSessions.get(config.id)
        if (current?.sessionId === sessionId) {
          this.activeSessions.delete(config.id)
        }
      })
    }

    return {
      taskId: config.id,
      success: true,
      executedAt: new Date(),
      result: {
        queued: true,
        sessionId,
        startedAt: progress.startedAt,
        deadlineAt: progress.deadlineAt,
        durationHours,
      },
      progress,
    }
  }

  private launchDurationTask(
    config: TaskConfig,
    sessionId: string,
    source: SchedulerRunSource,
  ) {
    const deferred = createDeferredPromise()

    setImmediate(() => {
      void this.runDurationTask(config, sessionId, source).then(
        () => deferred.resolve(),
        (error) => deferred.reject(error),
      )
    })

    return deferred.promise
  }

  private async runDurationTask(
    config: TaskConfig,
    sessionId: string,
    source: SchedulerRunSource,
  ) {
    const durationStrategy = await this.resolveDurationResearchStrategy(config)
    let terminalError: string | null = null
    let lastCycle: DiscoverCycleResult | null = null

    try {
      while (true) {
        const progress = this.progress.get(config.id)
        if (!progress) break
        if (progress.activeSessionId !== sessionId) break
        if (progress.status === 'paused') break

        const deadlineAt = progress.deadlineAt ? Date.parse(progress.deadlineAt) : Number.NaN
        if (!Number.isFinite(deadlineAt) || Date.now() >= deadlineAt) break

        const cycle = await this.executeStageTask(config, {
          sessionId,
          source,
          durationStrategy,
        })
        const nextProgress = this.progress.get(config.id)
        if (cycle.success && nextProgress && nextProgress.activeSessionId === sessionId) {
          terminalError = null
          const cycleResult = cycle.result as DiscoverCycleResult | undefined
          lastCycle = cycleResult ?? null
          await this.writeResearchReport({
            config,
            progress: nextProgress,
            source,
            status: 'running',
            latestCycle: cycleResult ?? null,
          })
        } else if (!cycle.success) {
          terminalError = cycle.error ?? 'Duration research loop failed'
          const failedProgress = this.progress.get(config.id)
          if (failedProgress && failedProgress.activeSessionId === sessionId) {
            await this.writeResearchReport({
              config,
              progress: failedProgress,
              source,
              status: 'running',
              error: terminalError,
            })
          }
        }

        const updatedProgress = this.progress.get(config.id)
        if (!updatedProgress || updatedProgress.activeSessionId !== sessionId) break
        if (updatedProgress.status === 'paused') break
        if (updatedProgress.deadlineAt && Date.now() >= Date.parse(updatedProgress.deadlineAt)) break

        await sleep(durationStrategy.cycleDelayMs)
      }
    } catch (error) {
      terminalError = error instanceof Error ? error.message : String(error)
      console.error(`[Scheduler] Duration task ${config.id} crashed:`, error)
    } finally {
      const progress = this.progress.get(config.id)
      if (progress && progress.activeSessionId === sessionId) {
        progress.activeSessionId = null
        progress.completedAt = new Date().toISOString()
        if (progress.status !== 'paused') {
          progress.status = terminalError ? 'failed' : 'completed'
        }

        this.syncStageRoundCounters(config, progress)
        await this.saveProgress(config.id, progress)
        await this.writeResearchReport({
          config,
          progress,
          source,
          status:
            progress.status === 'paused'
              ? 'paused'
              : terminalError
                ? 'failed'
                : 'completed',
          latestCycle: lastCycle,
          error: terminalError,
        })

        if (config.topicId) {
          void recordTopicResearchStatus({
            topicId: config.topicId,
            stageIndex: progress.currentStage,
            headline:
              progress.status === 'paused'
                ? '研究会话暂停'
                : terminalError
                  ? '研究会话异常结束'
                  : '研究会话完成',
            summary:
              progress.latestSummary ||
              (terminalError
                ? clipText(terminalError, 220)
                : `本轮持续研究已经完成，当前停留在第 ${progress.currentStage} 阶段。`),
          }).catch((error) => {
            console.error(
              `[Scheduler] Failed to persist closing research status memory for ${config.id}:`,
              error,
            )
          })
        }
      }
    }
  }

  private async loadStoredTaskConfig(taskId: string): Promise<TaskConfig | null> {
    const record = await prisma.system_configs.findUnique({
      where: { key: `task:${taskId}` },
    })

    if (!record?.value) return null

    try {
      return JSON.parse(record.value) as TaskConfig
    } catch {
      return null
    }
  }

  private async saveProgress(taskId: string, progress: StageTaskProgress): Promise<void> {
    try {
      await prisma.system_configs.upsert({
        where: { key: `task-progress:${taskId}` },
        update: { value: JSON.stringify(progress), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key: `task-progress:${taskId}`, value: JSON.stringify(progress), updatedAt: new Date() },
      })
    } catch (error) {
      console.error('[Scheduler] Failed to save progress:', error)
    }
  }

  private async addExecutionRecord(taskId: string, record: TaskExecutionRecord): Promise<void> {
    const key = `task-history:${taskId}`
    const records = this.executionHistory.get(taskId) || []
    records.push(record)

    if (records.length > 100) {
      records.splice(0, records.length - 100)
    }

    this.executionHistory.set(taskId, records)

    try {
      await prisma.system_configs.upsert({
        where: { key },
        update: { value: JSON.stringify(records), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key, value: JSON.stringify(records), updatedAt: new Date() },
      })
    } catch (error) {
      console.error('[Scheduler] Failed to save execution record:', error)
    }
  }

  async triggerTask(
    taskId: string,
    options?: { forceStage?: number; mode?: 'full' | 'discover-only' },
  ): Promise<EnhancedTaskResult | null> {
    await this.ensureInitialized()

    const entry = this.tasks.get(taskId)
    if (entry) {
      return this.dispatchTask(entry.config, 'manual', options)
    }

    const stored = await this.loadStoredTaskConfig(taskId)
    if (!stored) return null

    this.addTask(stored)
    return this.dispatchTask(stored, 'manual', options)
  }

  getProgress(taskId: string): StageTaskProgress | null {
    return this.progress.get(taskId) || null
  }

  getAllProgress(): StageTaskProgress[] {
    return Array.from(this.progress.values())
  }

  getExecutionHistory(taskId: string, limit = 20): TaskExecutionRecord[] {
    const records = this.executionHistory.get(taskId) || []
    return records.slice(-limit)
  }

  async jumpToStage(taskId: string, stageIndex: number): Promise<boolean> {
    await this.ensureInitialized()

    const entry = this.tasks.get(taskId)
    const progress = this.progress.get(taskId)
    if (!entry || !progress) return false

    this.moveToStage(entry.config, progress, stageIndex)
    await this.saveProgress(taskId, progress)

    console.log(`[Scheduler] Jumped to stage ${stageIndex} for task ${taskId}`)
    return true
  }

  async resetProgress(taskId: string): Promise<boolean> {
    await this.ensureInitialized()

    const entry = this.tasks.get(taskId)
    const progress = this.progress.get(taskId)
    if (!entry || !progress) return false

    this.resetProgressSnapshot(entry.config, progress)
    await this.saveProgress(taskId, progress)

    console.log(`[Scheduler] Reset progress for task ${taskId}`)
    return true
  }

  removeTask(taskId: string): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    entry.task.stop()
    if (typeof entry.task.destroy === 'function') {
      entry.task.destroy()
    }
    this.tasks.delete(taskId)
    this.activeSessions.delete(taskId)

    const progress = this.progress.get(taskId)
    if (progress) {
      progress.activeSessionId = null
    }

    console.log(`[Scheduler] Task removed: ${taskId}`)
    return true
  }

  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    entry.config.enabled = enabled

    if (enabled) {
      entry.task.start()
    } else {
      entry.task.stop()
    }

    const progress = this.progress.get(taskId)
    if (progress) {
      progress.status = enabled ? 'active' : 'paused'
      if (!enabled) {
        progress.completedAt = new Date().toISOString()
      }
      this.syncStageRoundCounters(entry.config, progress)
      void this.saveProgress(taskId, progress)
    }

    console.log(`[Scheduler] Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`)
    return true
  }

  onResult(listener: (result: EnhancedTaskResult) => void | Promise<void>): void {
    this.listeners.push(listener)
  }

  getTaskConfig(taskId: string): TaskConfig | null {
    return this.tasks.get(taskId)?.config ?? null
  }

  getAllTasks(): TaskConfig[] {
    return Array.from(this.tasks.values()).map((entry) => entry.config)
  }

  topicResearchTaskId(topicId: string) {
    return `topic-research:${topicId}`
  }

async ensureTopicResearchTask(
    topicId: string,
    options?: { durationHours?: number; stageDurationDays?: number },
  ): Promise<TaskConfig> {
    await this.ensureInitialized()

    const topic = await prisma.topics.findUnique({
      where: { id: topicId },
      select: { id: true, nameZh: true, nameEn: true },
    })

    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`)
    }

    const taskId = this.topicResearchTaskId(topicId)
    const stored = await this.loadStoredTaskConfig(taskId)

    // Resolve stage duration days with priority: explicit > env > stored > default
    const storedStageDurationDays = (stored?.options as Record<string, unknown> | undefined)?.stageDurationDays
    const resolvedDays = resolveStageDurationDays(
      options?.stageDurationDays ?? (typeof storedStageDurationDays === 'number' ? storedStageDurationDays : undefined),
    )
    const resolvedHours = resolvedDays * 24

    const nextConfig: TaskConfig = {
      id: taskId,
      name: `${topic.nameZh || topic.nameEn || topicId} ${resolvedDays} 天研究`,
      cronExpression: stored?.cronExpression ?? MANUAL_TOPIC_TASK_CRON,
      enabled: stored?.enabled ?? false,
      topicId,
      action: 'discover',
      researchMode: 'duration',
      options: {
        ...(stored?.options ?? {}),
        stageDurationDays: resolvedDays,
        durationHours: resolvedHours,
        cycleDelayMs:
          typeof stored?.options?.cycleDelayMs === 'number'
            ? clampNumber(
                stored.options.cycleDelayMs,
                MIN_RESEARCH_CYCLE_DELAY_MS,
                MAX_RESEARCH_CYCLE_DELAY_MS,
              )
            : undefined,
      },
    }

    if (this.activeSessions.has(taskId) && this.tasks.has(taskId)) {
      return this.tasks.get(taskId)!.config
    }

    if (this.tasks.has(taskId)) {
      this.removeTask(taskId)
    }
    this.addTask(nextConfig)

await prisma.system_configs.upsert({
        where: { key: `task:${taskId}` },
        update: { value: JSON.stringify(nextConfig), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key: `task:${taskId}`, value: JSON.stringify(nextConfig), updatedAt: new Date() },
      })

    return nextConfig
  }

  async startTopicResearchSession(
    topicId: string,
    options?: { durationHours?: number; stageDurationDays?: number },
  ) {
    await this.ensureInitialized()

    const existingState = await this.getTopicResearchState(topicId)
    const task = await this.ensureTopicResearchTask(topicId, options)
    const result = await this.dispatchTask(task, 'manual')
    const progress = this.getProgress(task.id)
    const active = Boolean(progress?.status === 'active' && this.activeSessions.get(task.id))
    const reportStatus = this.deriveResearchReportStatus(progress, active)
    const fallbackReport = progress
      ? this.buildFallbackResearchReport({
          config: task,
          progress,
          source: 'manual',
          status: reportStatus,
        })
      : null
    const report =
      progress && this.shouldPreferFallbackResearchReport(progress, existingState.report, active, fallbackReport)
        ? fallbackReport
        : existingState.report

    return {
      task,
      progress,
      report:
        report ?? fallbackReport,
      active,
      strategy: {
        ...existingState.strategy,
        currentStageStalls:
          progress?.currentStageStalls ?? existingState.strategy.currentStageStalls,
      },
      result,
    }
  }

  async stopTopicResearchSession(topicId: string) {
    await this.ensureInitialized()

    const taskId = this.topicResearchTaskId(topicId)
    const task = this.getTaskConfig(taskId) ?? (await this.loadStoredTaskConfig(taskId))
    const progress = this.getProgress(taskId)
    const activeSession = this.activeSessions.get(taskId)

    if (activeSession) {
      this.activeSessions.delete(taskId)
    }

    if (progress && (progress.activeSessionId || activeSession || progress.status === 'active')) {
      progress.activeSessionId = null
      progress.status = 'paused'
      progress.completedAt = new Date().toISOString()
      await this.saveProgress(taskId, progress)

      if (task) {
        void this.writeResearchReport({
          config: task,
          progress,
          source: 'manual',
          status: 'paused',
        }).catch((error) => {
          console.error(`[Scheduler] Failed to write paused research report for ${taskId}:`, error)
        })
      }
      void recordTopicResearchStatus({
        topicId,
        stageIndex: progress.currentStage,
        headline: '研究会话手动暂停',
        summary: progress.latestSummary || `本轮持续研究已在第 ${progress.currentStage} 阶段暂停。`,
      }).catch((error) => {
        console.error(`[Scheduler] Failed to persist paused research status memory for ${taskId}:`, error)
      })
    }

    if (task && resolveResearchMode(task) === 'duration') {
      this.removeTask(taskId)
    }

    return this.getTopicResearchState(topicId)
  }

  async getTopicResearchState(topicId: string) {
    await this.ensureInitialized()

    const taskId = this.topicResearchTaskId(topicId)
    const task = this.getTaskConfig(taskId) ?? (await this.loadStoredTaskConfig(taskId))
    let progress = sanitizeResearchProgress(this.getProgress(taskId))
    const report = await loadTopicResearchReport(topicId)
    const strategy = await this.resolveDurationResearchStrategy(task, topicId)
    const active = Boolean(
      progress?.status === 'active' &&
        progress.activeSessionId &&
        this.activeSessions.has(taskId),
    )

    if (progress?.activeSessionId && !active && progress.status !== 'active') {
      progress = {
        ...progress,
        activeSessionId: null,
      }
      await this.saveProgress(taskId, progress)
    }

    const recoveredStatus =
      progress?.status === 'failed'
        ? 'failed'
        : progress?.status === 'completed'
          ? 'completed'
          : 'paused'
    const normalizedReport =
      report && !active && report.status === 'running'
        ? await saveTopicResearchReport(
            task && progress
              ? {
                  ...this.buildFallbackResearchReport({
                    config: task,
                    progress,
                    source: report.trigger ?? 'manual',
                    status: recoveredStatus,
                  }),
                  reportId: report.reportId,
                  trigger: report.trigger,
                  startedAt: report.startedAt ?? progress.startedAt ?? new Date().toISOString(),
                  deadlineAt: report.deadlineAt ?? progress.deadlineAt,
                  completedAt:
                    progress.completedAt ?? report.completedAt ?? new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : {
                  ...report,
                  status: recoveredStatus,
                  completedAt: report.completedAt ?? progress?.completedAt ?? new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
          )
        : report
    const reportStatus = this.deriveResearchReportStatus(progress, active)
    const fallbackReport =
      task && progress
        ? this.buildFallbackResearchReport({
            config: task,
            progress,
            source: normalizedReport?.trigger ?? 'manual',
            status: reportStatus,
          })
        : null
    const liveReport =
      task &&
      progress &&
      this.shouldPreferFallbackResearchReport(progress, normalizedReport, active, fallbackReport)
        ? fallbackReport
        : normalizedReport

    return {
      task,
      progress,
      report: liveReport,
      active,
      strategy: {
        ...strategy,
        currentStageStalls: progress?.currentStageStalls ?? 0,
      },
    }
  }

  /**
   * Start research sessions for multiple topics in parallel.
   * Each topic gets its own independent task and progress tracking.
   * Returns aggregated state across all topics.
   */
  async startMultiTopicResearchSession(
    topicIds: string[],
    options?: { durationHours?: number; stageDurationDays?: number },
  ): Promise<MultiTopicResearchState> {
    await this.ensureInitialized()

    // Validate all topics exist before starting any
    const topics = await prisma.topics.findMany({
      where: { id: { in: topicIds } },
      select: { id: true, nameZh: true, nameEn: true },
    })

    const foundIds = new Set(topics.map((topic) => topic.id))
    const missingIds = topicIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      throw new Error(`Topics not found: ${missingIds.join(', ')}`)
    }

    // Start all sessions in parallel
    const sessionResults = await Promise.allSettled(
      topicIds.map(async (topicId) => {
        try {
          const result = await this.startTopicResearchSession(topicId, options)
          return {
            topicId,
            task: result.task,
            progress: result.progress,
            report: result.report ?? null,
            active: result.active,
          }
        } catch (error) {
          return {
            topicId,
            task: null,
            progress: null,
            report: null,
            active: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )

    const sessions = sessionResults.map((result) =>
      result.status === 'fulfilled' ? result.value : {
        topicId: '',
        task: null,
        progress: null,
        report: null,
        active: false,
        error: result.status === 'rejected' ? String(result.reason) : 'Unknown error',
      },
    )

    return this.buildMultiTopicAggregate(topicIds, sessions)
  }

  /**
   * Stop research sessions for multiple topics in parallel.
   */
  async stopMultiTopicResearchSession(
    topicIds: string[],
  ): Promise<MultiTopicResearchState> {
    await this.ensureInitialized()

    const sessionResults = await Promise.allSettled(
      topicIds.map(async (topicId) => {
        try {
          const result = await this.stopTopicResearchSession(topicId)
          return {
            topicId,
            task: result.task,
            progress: result.progress,
            report: result.report ?? null,
            active: result.active,
          }
        } catch (error) {
          return {
            topicId,
            task: null,
            progress: null,
            report: null,
            active: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )

    const sessions = sessionResults.map((result) =>
      result.status === 'fulfilled' ? result.value : {
        topicId: '',
        task: null,
        progress: null,
        report: null,
        active: false,
        error: result.status === 'rejected' ? String(result.reason) : 'Unknown error',
      },
    )

    return this.buildMultiTopicAggregate(topicIds, sessions)
  }

  /**
   * Get aggregated research state for multiple topics.
   */
  async getMultiTopicResearchState(
    topicIds: string[],
  ): Promise<MultiTopicResearchState> {
    await this.ensureInitialized()

    const sessionResults = await Promise.allSettled(
      topicIds.map(async (topicId) => {
        try {
          const result = await this.getTopicResearchState(topicId)
          return {
            topicId,
            task: result.task,
            progress: result.progress,
            report: result.report ?? null,
            active: result.active,
          }
        } catch (error) {
          return {
            topicId,
            task: null,
            progress: null,
            report: null,
            active: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )

    const sessions = sessionResults.map((result) =>
      result.status === 'fulfilled' ? result.value : {
        topicId: '',
        task: null,
        progress: null,
        report: null,
        active: false,
        error: result.status === 'rejected' ? String(result.reason) : 'Unknown error',
      },
    )

    return this.buildMultiTopicAggregate(topicIds, sessions)
  }

  /**
   * Build aggregated state from individual topic sessions.
   */
  private buildMultiTopicAggregate(
    topicIds: string[],
    sessions: Array<{
      topicId: string
      task: TaskConfig | null
      progress: StageTaskProgress | null
      report: ResearchRunReport | null
      active: boolean
      error?: string
    }>,
  ): MultiTopicResearchState {
    const activeTopics = sessions.filter((s) => s.active).length
    const completedTopics = sessions.filter(
      (s) => s.progress?.status === 'completed',
    ).length
    const failedTopics = sessions.filter(
      (s) => s.progress?.status === 'failed' || s.error,
    ).length

    const totalDiscoveredPapers = sessions.reduce(
      (sum, s) => sum + (s.progress?.discoveredPapers ?? 0),
      0,
    )
    const totalAdmittedPapers = sessions.reduce(
      (sum, s) => sum + (s.progress?.admittedPapers ?? 0),
      0,
    )
    const totalGeneratedContents = sessions.reduce(
      (sum, s) => sum + (s.progress?.generatedContents ?? 0),
      0,
    )

    // Overall progress: average of individual topic stage progress
    const topicProgressValues = sessions
      .map((s) => s.progress?.stageProgress ?? 0)
      .filter((v) => typeof v === 'number')
    const overallProgress =
      topicProgressValues.length > 0
        ? Math.round(
            topicProgressValues.reduce((sum, v) => sum + v, 0) /
              topicProgressValues.length,
          )
        : 0

    // Earliest start and latest deadline across all sessions
    const startedAtValues = sessions
      .map((s) => s.progress?.startedAt)
      .filter((v): v is string => Boolean(v))
      .sort()
    const deadlineAtValues = sessions
      .map((s) => s.progress?.deadlineAt)
      .filter((v): v is string => Boolean(v))
      .sort()
      .reverse()

    return {
      topicIds,
      sessions,
      aggregate: {
        totalTopics: topicIds.length,
        activeTopics,
        completedTopics,
        failedTopics,
        totalDiscoveredPapers,
        totalAdmittedPapers,
        totalGeneratedContents,
        overallProgress,
        startedAt: startedAtValues[0] ?? null,
        deadlineAt: deadlineAtValues[0] ?? null,
      },
    }
  }
}

export interface MultiTopicResearchState {
  topicIds: string[]
  sessions: Array<{
    topicId: string
    task: TaskConfig | null
    progress: StageTaskProgress | null
    report: ResearchRunReport | null
    active: boolean
    error?: string
  }>
  aggregate: {
    totalTopics: number
    activeTopics: number
    completedTopics: number
    failedTopics: number
    totalDiscoveredPapers: number
    totalAdmittedPapers: number
    totalGeneratedContents: number
    overallProgress: number
    startedAt: string | null
    deadlineAt: string | null
  }
}

// ============================================================================
// Multi-Topic Round-Robin Session Types
// ============================================================================

export interface RoundRobinSessionState {
  sessionId: string
  topicIds: string[]
  mode: 'round-robin'
  durationHours: number
  startedAt: string
  deadlineAt: string
  currentTopicId: string | null
  cycleCount: number
  status: 'active' | 'paused' | 'completed' | 'failed'
  crossTopicIndex: CrossTopicIndexState | null
}

export interface RoundRobinSessionResult {
  sessionId: string
  success: boolean
  totalCycles: number
  topicsCompleted: number
  topicsFailed: number
  totalDiscovered: number
  totalAdmitted: number
  totalGenerated: number
  sharedEvidence: number
  error?: string
}

export const enhancedTaskScheduler = new EnhancedTaskScheduler()

export const __testing = {
  buildDurationResearchDecision,
  buildDurationResearchTargets,
  buildDurationResearchPerspectives,
  buildDurationResearchQualityBars,
  buildHeuristicFallbackOrchestration,
  hasRenderableResearchReport,
  shouldPreferFallbackResearchReportState,
  sanitizeResearchFacingSummary,
  estimateTopicProgressTotalStages,
  rotateResearchLens,
  getCurrentResearchLens,
  updateLensStallCount,
  LENS_STALL_SKIP_THRESHOLD,
}

// ============================================================================
// Multi-Topic Round-Robin Scheduling Methods
// ============================================================================

/**
 * Start a round-robin research session for multiple topics.
 * Each topic gets fair research cycles in turn.
 */
export async function startRoundRobinResearchSession(
  topicIds: string[],
  options?: { durationHours?: number; stageDurationDays?: number },
): Promise<RoundRobinSessionState> {
  await enhancedTaskScheduler.ensureInitialized()

  // Validate all topics exist
  const topics = await prisma.topics.findMany({
    where: { id: { in: topicIds } },
    select: { id: true, nameZh: true, nameEn: true },
  })

  const foundIds = new Set(topics.map((t) => t.id))
  const missingIds = topicIds.filter((id) => !foundIds.has(id))
  if (missingIds.length > 0) {
    throw new Error(`Topics not found: ${missingIds.join(', ')}`)
  }

  const sessionId = `round-robin-${Date.now()}`
  const durationHours = options?.durationHours ?? DEFAULT_DURATION_HOURS
  const startedAt = new Date()
  const deadlineAt = new Date(startedAt.getTime() + durationHours * 60 * 60 * 1000)

  // Initialize cross-topic index
  const crossTopicIndex = await initializeCrossTopicIndex(sessionId, topicIds)

  const state: RoundRobinSessionState = {
    sessionId,
    topicIds,
    mode: 'round-robin',
    durationHours,
    startedAt: startedAt.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    currentTopicId: topicIds[0] ?? null,
    cycleCount: 0,
    status: 'active',
    crossTopicIndex,
  }

  // Persist session state
  await prisma.system_configs.upsert({
    where: { key: `round-robin-session:${sessionId}` },
    update: { value: JSON.stringify(state), updatedAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      key: `round-robin-session:${sessionId}`,
      value: JSON.stringify(state),
      updatedAt: new Date(),
    },
  })

  // Start the round-robin task loop
  const promise = runRoundRobinTaskLoop(state)

  // Store the active session
  activeRoundRobinSessions.set(sessionId, {
    sessionId,
    config: {
      sessionId,
      topicIds,
      mode: 'round-robin',
      durationHours,
      startedAt: startedAt.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      currentTopicId: topicIds[0] ?? null,
      cycleCount: 0,
      status: 'active',
    },
    startedAt: startedAt.toISOString(),
    deadlineAt: deadlineAt.toISOString(),
    promise,
  })

  void promise.finally(() => {
    const current = activeRoundRobinSessions.get(sessionId)
    if (current?.sessionId === sessionId) {
      activeRoundRobinSessions.delete(sessionId)
    }
  })

  return state
}

/**
 * Stop a round-robin research session
 */
export async function stopRoundRobinResearchSession(
  sessionId: string,
): Promise<RoundRobinSessionResult> {
  const session = activeRoundRobinSessions.get(sessionId)
  if (session) {
    activeRoundRobinSessions.delete(sessionId)
  }

  const record = await prisma.system_configs.findUnique({
    where: { key: `round-robin-session:${sessionId}` },
  })

  if (!record) {
    return {
      sessionId,
      success: false,
      totalCycles: 0,
      topicsCompleted: 0,
      topicsFailed: 0,
      totalDiscovered: 0,
      totalAdmitted: 0,
      totalGenerated: 0,
      sharedEvidence: 0,
      error: 'Session not found',
    }
  }

  const state = JSON.parse(record.value) as RoundRobinSessionState
  state.status = 'paused'
  state.currentTopicId = null

  await prisma.system_configs.update({
    where: { key: `round-robin-session:${sessionId}` },
    data: { value: JSON.stringify(state), updatedAt: new Date() },
  })

  // Clean up cross-topic index
  await cleanupCrossTopicIndex(sessionId)

  const summary = state.crossTopicIndex
    ? getRoundRobinSessionSummary(state.crossTopicIndex)
    : null

  return {
    sessionId,
    success: true,
    totalCycles: state.cycleCount,
    topicsCompleted: summary?.completedTopics ?? 0,
    topicsFailed: summary?.failedTopics ?? 0,
    totalDiscovered: summary?.totalEvidence ?? 0,
    totalAdmitted: summary?.totalEvidence ?? 0,
    totalGenerated: 0,
    sharedEvidence: summary?.sharedEvidence ?? 0,
  }
}

/**
 * Get the current state of a round-robin session
 */
export async function getRoundRobinSessionState(
  sessionId: string,
): Promise<RoundRobinSessionState | null> {
  const record = await prisma.system_configs.findUnique({
    where: { key: `round-robin-session:${sessionId}` },
  })

  if (!record) return null

  try {
    return JSON.parse(record.value) as RoundRobinSessionState
  } catch {
    return null
  }
}

/**
 * Internal: Run the round-robin task loop
 */
async function runRoundRobinTaskLoop(
  initialState: RoundRobinSessionState,
): Promise<void> {
  let state = initialState
  let terminalError: string | null = null

  try {
    while (true) {
      // Check if session is still active
      if (state.status !== 'active') break

      // Check deadline
      const deadlineAt = Date.parse(state.deadlineAt)
      if (!Number.isFinite(deadlineAt) || Date.now() >= deadlineAt) break

      // Get current topic to research
      const currentTopicId = state.currentTopicId
      if (!currentTopicId) break

      // Execute one research cycle for the current topic
      const cycleResult = await executeRoundRobinCycle(state, currentTopicId)

      // Update state with cycle result
      state = await updateRoundRobinState(state, cycleResult)

      // Check if all topics are completed
      if (state.crossTopicIndex) {
        const summary = getRoundRobinSessionSummary(state.crossTopicIndex)
        if (summary.activeTopics === 0) break
      }

      // Get next topic in round-robin order
      const nextTopicId = state.crossTopicIndex
        ? getNextRoundRobinTopic(state.crossTopicIndex, currentTopicId)
        : null

      if (!nextTopicId) break

      // Log topic switch
      if (state.crossTopicIndex) {
        logTopicSwitch(
          state.crossTopicIndex,
          currentTopicId,
          nextTopicId,
          'round-robin',
          `Completed cycle ${state.cycleCount} for topic ${currentTopicId}, switching to ${nextTopicId}`,
        )
      }

      state.currentTopicId = nextTopicId

      // Small delay between cycles
      const strategy = await enhancedTaskScheduler.resolveDurationResearchStrategy(null, currentTopicId)
      await sleep(strategy.cycleDelayMs)
    }
  } catch (error) {
    terminalError = error instanceof Error ? error.message : String(error)
    console.error(`[RoundRobin] Session ${state.sessionId} crashed:`, error)
  } finally {
    // Finalize session
    state.status = terminalError ? 'failed' : 'completed'
    state.currentTopicId = null

    await prisma.system_configs.update({
      where: { key: `round-robin-session:${state.sessionId}` },
      data: { value: JSON.stringify(state), updatedAt: new Date() },
    })

    // Clean up cross-topic index
    await cleanupCrossTopicIndex(state.sessionId)
  }
}

/**
 * Execute one research cycle for a topic in round-robin mode
 */
async function executeRoundRobinCycle(
  sessionState: RoundRobinSessionState,
  topicId: string,
): Promise<RoundRobinCycleResult> {
  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    select: { id: true, nameZh: true, nameEn: true },
  })

  if (!topic) {
    return {
      topicId,
      success: false,
      discovered: 0,
      admitted: 0,
      contentsGenerated: 0,
      stageSummary: 'Topic not found',
      nextTopicId: null,
      switchedTopic: false,
    }
  }

  const topicName = topic.nameZh || topic.nameEn || topicId

  // Ensure topic has a research task
  const task = await enhancedTaskScheduler.ensureTopicResearchTask(topicId, {
    durationHours: sessionState.durationHours,
  })

  // Execute one cycle
  const result = await enhancedTaskScheduler.executeStageTask(task, {
    source: 'manual',
  })

  const cycleResult = result.result as DiscoverCycleResult | undefined

  // Update cross-topic index with discovered papers
  if (sessionState.crossTopicIndex && cycleResult) {
    const papers = await prisma.papers.findMany({
      where: { topicId },
      select: {
        id: true,
        title: true,
        titleZh: true,
        titleEn: true,
        arxivUrl: true,
        openAlexId: true,
        summary: true,
        published: true,
        status: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })

    for (const paper of papers) {
      await registerPaperInIndex(sessionState.crossTopicIndex!, {
        paperId: paper.id,
        topicId,
        title: paper.title,
        titleZh: paper.titleZh,
        titleEn: paper.titleEn,
        arxivUrl: paper.arxivUrl,
        openAlexId: paper.openAlexId,
        summary: paper.summary,
        published: paper.published,
        status: paper.status === 'admitted' ? 'admitted' : 'candidate',
        confidence: 0.7,
        nodeIds: [],
        stageIndex: null,
      }, topicName)
    }

    // Update topic progress
    const progress = enhancedTaskScheduler.getProgress(task.id)
    if (progress) {
      updateTopicProgress(sessionState.crossTopicIndex!, topicId, {
        cyclesCompleted: (sessionState.crossTopicIndex!.topicProgress.get(topicId)?.cyclesCompleted ?? 0) + 1,
        currentStage: progress.currentStage,
        totalStages: progress.totalStages,
        discoveredPapers: progress.discoveredPapers,
        admittedPapers: progress.admittedPapers,
        generatedContents: progress.generatedContents,
        lastCycleAt: new Date().toISOString(),
      })
    }

    await saveCrossTopicIndex(sessionState.crossTopicIndex!)
  }

  // Get next topic
  const nextTopicId = sessionState.crossTopicIndex
    ? getNextRoundRobinTopic(sessionState.crossTopicIndex, topicId)
    : null

  return {
    topicId,
    success: result.success,
    discovered: cycleResult?.discovered ?? 0,
    admitted: cycleResult?.admitted ?? 0,
    contentsGenerated: cycleResult?.contentsGenerated ?? 0,
    stageSummary: cycleResult?.stageSummary ?? '',
    nextTopicId,
    switchedTopic: nextTopicId !== null && nextTopicId !== topicId,
  }
}

/**
 * Update round-robin session state after a cycle
 */
async function updateRoundRobinState(
  state: RoundRobinSessionState,
  _cycleResult: RoundRobinCycleResult,
): Promise<RoundRobinSessionState> {
  state.cycleCount += 1

  // Reload cross-topic index
  if (state.crossTopicIndex) {
    state.crossTopicIndex = await loadCrossTopicIndex(state.sessionId, state.topicIds)
  }

  // Persist updated state
  await prisma.system_configs.update({
    where: { key: `round-robin-session:${state.sessionId}` },
    data: { value: JSON.stringify(state), updatedAt: new Date() },
  })

  return state
}

// Active round-robin sessions
const activeRoundRobinSessions = new Map<string, MultiTopicSessionHandle>()
