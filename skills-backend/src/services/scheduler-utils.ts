/**
 * Enhanced Scheduler - Utility Functions
 *
 * Extracted from enhanced-scheduler.ts for decomposition.
 * Contains pure utility functions used across the scheduler system.
 */

import {
  STAGE_DURATION_DAYS_MIN,
  STAGE_DURATION_DAYS_MAX,
  STAGE_DURATION_DAYS_DEFAULT,
  DEFAULT_DURATION_HOURS,
  MIN_DURATION_HOURS,
  MAX_DURATION_HOURS,
  type DeferredPromiseHandlers,
  type ManagedScheduledTask,
  type StageTaskProgress,
} from './scheduler-types'
import { sanitizeResearchFacingSummary } from './topics/research-report'
import type { ResearchMode, TaskConfig } from './scheduler'
import cron, { ScheduledTask } from 'node-cron'
import { BACKGROUND_DURATION_RUNS_DISABLED } from './scheduler-types'

// ============================================================================
// Duration Resolution
// ============================================================================

/**
 * Resolve stage duration days from multiple sources with priority:
 * 1. Explicit value passed (if valid)
 * 2. Environment variable STAGE_DURATION_DAYS
 * 3. Default value (30 days)
 */
export function resolveStageDurationDays(explicitDays?: number | null): number {
  // Priority 1: Explicit value
  if (typeof explicitDays === 'number' && Number.isFinite(explicitDays)) {
    return clampStageDurationDays(explicitDays)
  }

  // Priority 2: Environment variable
  const envValue = process.env.STAGE_DURATION_DAYS
  if (envValue) {
    const parsed = Number(envValue)
    if (Number.isFinite(parsed)) {
      return clampStageDurationDays(parsed)
    }
  }

  // Priority 3: Default
  return STAGE_DURATION_DAYS_DEFAULT
}

/**
 * Validate and clamp stage duration days to allowed range (7-365)
 */
export function clampStageDurationDays(days: number): number {
  if (!Number.isFinite(days)) return STAGE_DURATION_DAYS_DEFAULT
  return Math.min(STAGE_DURATION_DAYS_MAX, Math.max(STAGE_DURATION_DAYS_MIN, Math.trunc(days)))
}

// ============================================================================
// Text Processing Utilities
// ============================================================================

export function formatDurationWindowLabel(durationHours: number | null | undefined) {
  if (!durationHours || !Number.isFinite(durationHours)) return 'current research window'
  const days = Math.max(1, Math.ceil(durationHours / 24))
  if (days >= 365 && days % 365 === 0) return `${Math.round(days / 365)} year`
  if (days >= 30 && days % 30 === 0) return `${Math.round(days / 30)} month`
  if (days >= 7 && days % 7 === 0) return `${Math.round(days / 7)} week`
  return `${days} day`
}

export function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

export function pickText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return ''
}

export function uniqueStrings(
  values: Array<string | null | undefined>,
  limit = 6,
  maxLength = 180,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipText(value, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

export function prefersChineseResearchCopy(value: string | null | undefined) {
  return /[\u4e00-\u9fff]/u.test(value ?? '')
}

export function formatStageRecordSummary(stageIndex: number, summary: string) {
  const normalized = clipText(summary, 160)
  if (!normalized) {
    return `第 ${stageIndex} 阶段已完成本轮研究`
  }

  if (!prefersChineseResearchCopy(normalized)) {
    return `Stage ${stageIndex}: ${normalized}`
  }

  return `第 ${stageIndex} 阶段：${normalized}`
}

export function formatStageFailureSummary(stageIndex: number, error: string) {
  const normalized = clipText(error, 180)
  return prefersChineseResearchCopy(normalized)
    ? `第 ${stageIndex} 阶段执行异常：${normalized}`
    : `Stage ${stageIndex} failed: ${normalized}`
}

export function normalizeResearchTimelineLine(value: string | null | undefined) {
  const normalized = clipText(value, 220)
  if (!normalized) return ''

  const stageMatch = normalized.match(/^Stage\s+(\d+)\s*:\s*(.+)$/u)
  if (stageMatch && prefersChineseResearchCopy(stageMatch[2])) {
    return `第 ${stageMatch[1]} 阶段：${stageMatch[2]}`
  }

  return normalized
}

export function looksLikeLegacyEnglishResearchFallback(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return false

  return (
    /\bNo new papers were admitted in this round\b/u.test(normalized) ||
    /\bthe stage remains in evidence consolidation mode\b/u.test(normalized) ||
    /\bStage\s+\d+:\s+No new papers were admitted\b/u.test(normalized)
  )
}

// ============================================================================
// Number Utilities
// ============================================================================

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Research Mode Resolution
// ============================================================================

export function resolveResearchMode(config: TaskConfig): ResearchMode {
  if (config.researchMode === 'duration') return 'duration'
  if (typeof config.options?.durationHours === 'number' && config.options.durationHours > 0) {
    return 'duration'
  }
  return 'stage-rounds'
}

export function resolveDurationHours(config: TaskConfig) {
  if (resolveResearchMode(config) !== 'duration') return null

  // Priority 1: stageDurationDays from config options (days-based)
  const explicitDays = (config.options as Record<string, unknown> | undefined)?.stageDurationDays
  if (typeof explicitDays === 'number' && Number.isFinite(explicitDays)) {
    return clampStageDurationDays(explicitDays) * 24
  }

  // Priority 2: durationHours from config options (hours-based, legacy)
  const hours = Number(config.options?.durationHours ?? DEFAULT_DURATION_HOURS)
  if (!Number.isFinite(hours)) return DEFAULT_DURATION_HOURS
  return clampNumber(hours, MIN_DURATION_HOURS, MAX_DURATION_HOURS)
}

export function computeDurationProgress(progress: Pick<StageTaskProgress, 'startedAt' | 'deadlineAt'>) {
  if (!progress.startedAt || !progress.deadlineAt) return 0
  const startedAt = Date.parse(progress.startedAt)
  const deadlineAt = Date.parse(progress.deadlineAt)
  if (!Number.isFinite(startedAt) || !Number.isFinite(deadlineAt) || deadlineAt <= startedAt) return 0
  const now = Date.now()
  const ratio = (now - startedAt) / (deadlineAt - startedAt)
  return clampNumber(Math.round(ratio * 100), 0, 100)
}

// ============================================================================
// Progress Normalization
// ============================================================================

export function normalizeProgress(raw: Partial<StageTaskProgress>): StageTaskProgress {
  const researchMode = raw.researchMode === 'duration' ? 'duration' : 'stage-rounds'
  return {
    taskId: raw.taskId ?? '',
    topicId: raw.topicId ?? '',
    topicName: raw.topicName ?? 'Unknown Topic',
    researchMode,
    durationHours:
      typeof raw.durationHours === 'number' && Number.isFinite(raw.durationHours)
        ? raw.durationHours
        : null,
    currentStage: typeof raw.currentStage === 'number' ? raw.currentStage : 1,
    totalStages: typeof raw.totalStages === 'number' ? raw.totalStages : 1,
    stageProgress: typeof raw.stageProgress === 'number' ? raw.stageProgress : 0,
    currentStageRuns: typeof raw.currentStageRuns === 'number' ? raw.currentStageRuns : 0,
    currentStageTargetRuns:
      typeof raw.currentStageTargetRuns === 'number' ? raw.currentStageTargetRuns : 1,
    stageRunMap: raw.stageRunMap && typeof raw.stageRunMap === 'object' ? raw.stageRunMap : {},
    totalRuns: typeof raw.totalRuns === 'number' ? raw.totalRuns : 0,
    successfulRuns: typeof raw.successfulRuns === 'number' ? raw.successfulRuns : 0,
    failedRuns: typeof raw.failedRuns === 'number' ? raw.failedRuns : 0,
    lastRunAt: raw.lastRunAt ?? null,
    lastRunResult:
      raw.lastRunResult === 'success' ||
      raw.lastRunResult === 'failed' ||
      raw.lastRunResult === 'partial'
        ? raw.lastRunResult
        : null,
    discoveredPapers: typeof raw.discoveredPapers === 'number' ? raw.discoveredPapers : 0,
    admittedPapers: typeof raw.admittedPapers === 'number' ? raw.admittedPapers : 0,
    generatedContents: typeof raw.generatedContents === 'number' ? raw.generatedContents : 0,
    figureCount: typeof raw.figureCount === 'number' ? raw.figureCount : 0,
    tableCount: typeof raw.tableCount === 'number' ? raw.tableCount : 0,
    formulaCount: typeof raw.formulaCount === 'number' ? raw.formulaCount : 0,
    figureGroupCount: typeof raw.figureGroupCount === 'number' ? raw.figureGroupCount : 0,
    startedAt: raw.startedAt ?? null,
    deadlineAt: raw.deadlineAt ?? null,
    completedAt: raw.completedAt ?? null,
    activeSessionId: raw.activeSessionId ?? null,
    completedStageCycles:
      typeof raw.completedStageCycles === 'number' ? raw.completedStageCycles : 0,
    currentStageStalls:
      typeof raw.currentStageStalls === 'number' ? raw.currentStageStalls : 0,
    latestSummary: sanitizeResearchFacingSummary(raw.latestSummary) || null,
    status:
      raw.status === 'active' ||
      raw.status === 'paused' ||
      raw.status === 'completed' ||
      raw.status === 'failed' ||
      raw.status === 'interrupted'
        ? raw.status
        : 'active',
    currentLensIndex:
      typeof raw.currentLensIndex === 'number' && raw.currentLensIndex >= 0
        ? raw.currentLensIndex
        : null,
    lensRotationHistory: Array.isArray(raw.lensRotationHistory) ? raw.lensRotationHistory : [],
    lensStallCounts:
      raw.lensStallCounts && typeof raw.lensStallCounts === 'object' ? raw.lensStallCounts : {},
  }
}

export function sanitizeResearchProgress(progress: StageTaskProgress | null | undefined) {
  if (!progress) return progress ?? null

  const latestSummary = sanitizeResearchFacingSummary(progress.latestSummary)
  if (latestSummary === (progress.latestSummary ?? '')) {
    return progress
  }

  return {
    ...progress,
    latestSummary: latestSummary || null,
  }
}

// ============================================================================
// Promise Utilities
// ============================================================================

export function createDormantDurationSessionPromise() {
  return new Promise<void>(() => {})
}

export function createDeferredPromise(): DeferredPromiseHandlers {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

// ============================================================================
// Scheduled Task Management
// ============================================================================

export function createManagedScheduledTask(config: TaskConfig, run: () => Promise<void>): ManagedScheduledTask {
  if (BACKGROUND_DURATION_RUNS_DISABLED) {
    return {
      start() {
        return
      },
      stop() {
        return
      },
      destroy() {
        return
      },
    }
  }

  let scheduledTask: ScheduledTask | null = null

  const ensureScheduledTask = () => {
    if (!scheduledTask) {
      scheduledTask = cron.schedule(
        config.cronExpression,
        async () => {
          if (!config.enabled) return
          await run()
        },
        {
          scheduled: false,
          timezone: 'Asia/Shanghai',
        },
      )
    }

    return scheduledTask
  }

  if (config.enabled) {
    ensureScheduledTask().start()
  }

  return {
    start() {
      ensureScheduledTask().start()
    },
    stop() {
      scheduledTask?.stop()
    },
    destroy() {
      if (scheduledTask) {
        scheduledTask.stop()
        if ('destroy' in scheduledTask && typeof scheduledTask.destroy === 'function') {
          scheduledTask.destroy()
        }
        scheduledTask = null
      }
    },
  }
}

// ============================================================================
// Date Utilities
// ============================================================================

export function startOfUtcMonth(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function estimateTopicProgressTotalStages(args: {
  topic:
    | {
        createdAt?: Date | string | null
        papers?: Array<{
          published?: Date | string | null
        }>
      }
    | null
    | undefined
  existingStageCount: number
  windowMonths: number
}) {
  const effectiveWindowMonths = Math.max(1, Math.trunc(args.windowMonths))
  const paperMonths = (args.topic?.papers ?? [])
    .map((paper) => startOfUtcMonth(paper.published))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())
  const originMonth =
    paperMonths[0] ??
    startOfUtcMonth(args.topic?.createdAt) ??
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const monthSpan = Math.max(
    0,
    (currentMonth.getUTCFullYear() - originMonth.getUTCFullYear()) * 12 +
      (currentMonth.getUTCMonth() - originMonth.getUTCMonth()),
  )
  const chronologicalStageCount = Math.floor(monthSpan / effectiveWindowMonths) + 1

  return Math.max(args.existingStageCount, chronologicalStageCount, 1)
}

// ============================================================================
// Research Report Utilities
// ============================================================================

export function hasRenderableResearchReport(report: Record<string, unknown> | null | undefined) {
  if (!report) return false

  return Boolean(
    (report.headline as string)?.trim() &&
      (report.dek as string)?.trim() &&
      (report.summary as string)?.trim() &&
      Array.isArray(report.paragraphs) &&
      (report.paragraphs as string[]).some((paragraph) => typeof paragraph === 'string' && Boolean(paragraph.trim())),
  )
}

export function shouldPreferFallbackResearchReportState(args: {
  progress: StageTaskProgress | null
  report: Record<string, unknown> | null
  active: boolean
  fallback?: Record<string, unknown> | null
}) {
  const { progress, report, active, fallback } = args

  if (!progress) return false
  if (!report) return true
  if (!hasRenderableResearchReport(report)) return true

  const zeroYieldFailure =
    (report.failedRuns as number) > 0 &&
    (report.successfulRuns as number) === 0 &&
    (report.discoveredPapers as number) === 0 &&
    (report.admittedPapers as number) === 0 &&
    (report.generatedContents as number) === 0
  if (fallback && zeroYieldFailure) {
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

  if (progress.totalRuns > (report.totalRuns as number)) return true
  if (progress.successfulRuns > (report.successfulRuns as number)) return true
  if (progress.failedRuns > (report.failedRuns as number)) return true
  if (progress.discoveredPapers > (report.discoveredPapers as number)) return true
  if (progress.admittedPapers > (report.admittedPapers as number)) return true
  if (progress.generatedContents > (report.generatedContents as number)) return true

  if (
    progress.latestSummary &&
    progress.latestSummary.trim() &&
    progress.latestSummary !== (report.latestStageSummary as string)
  ) {
    return true
  }

  return false
}
