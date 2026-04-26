/**
 * Enhanced Scheduler - Type Definitions
 *
 * Extracted from enhanced-scheduler.ts for decomposition.
 * Contains all type definitions, interfaces, and constants
 * used by the scheduler system.
 */

import type { ResearchMode, TaskConfig as _TaskConfig, TaskResult } from './scheduler'
import type { ResearchPipelineDurationDecision } from './topics/research-pipeline'

// ============================================================================
// Skill Context Types
// ============================================================================

type _RuntimeSkillContext = {
  sessionId: string
  workspacePath: string
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
    error: (message: string, meta?: Record<string, unknown>) => void
    debug: (message: string, meta?: Record<string, unknown>) => void
  }
}

// ============================================================================
// Progress Types
// ============================================================================

export interface LensRotationEntry {
  lensId: string
  rotatedAt: string
  stallCountBefore: number
  reason: 'cycle-complete' | 'stall-limit' | 'manual'
}

export interface StageTaskProgress {
  taskId: string
  topicId: string
  topicName: string
  researchMode: ResearchMode
  durationHours: number | null
  currentStage: number
  totalStages: number
  stageProgress: number
  currentStageRuns: number
  currentStageTargetRuns: number
  stageRunMap: Record<string, number>
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | null
  lastRunResult: 'success' | 'failed' | 'partial' | null
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  figureCount: number
  tableCount: number
  formulaCount: number
  figureGroupCount: number
  startedAt: string | null
  deadlineAt: string | null
  completedAt: string | null
  activeSessionId: string | null
  completedStageCycles: number
  currentStageStalls: number
  latestSummary: string | null
  status: 'active' | 'paused' | 'completed' | 'failed' | 'interrupted'
  /** Current lens index for rotation (0-7). Null if rotation not enabled. */
  currentLensIndex: number | null
  /** History of lens rotations during this research session. */
  lensRotationHistory: LensRotationEntry[]
  /** Per-lens stall counts to skip lenses that stall too often. */
  lensStallCounts: Record<string, number>
}

export interface TaskExecutionRecord {
  id: string
  taskId: string
  runAt: string
  duration: number
  status: 'success' | 'failed' | 'partial'
  stageIndex: number
  papersDiscovered: number
  papersAdmitted: number
  contentsGenerated: number
  sessionId?: string
  error?: string
  summary: string
}

// ============================================================================
// Research Orchestration Types
// ============================================================================

export interface ResearchCandidatePaper {
  id: string
  title: string
  titleZh: string
  titleEn: string | null
  summary: string
  explanation: string | null
  coverPath: string | null
  figures: Array<{
    id: string
    imagePath: string
    caption: string
    analysis?: string | null
  }>
  figureGroupCount?: number
  tableCount?: number
  formulaCount?: number
}

export interface ResearchNodeAction {
  action: 'create' | 'update' | 'merge' | 'strengthen'
  nodeId?: string
  mergeIntoNodeId?: string
  title: string
  titleEn: string
  subtitle: string
  summary: string
  explanation: string
  paperIds: string[]
  primaryPaperId: string
  rationale: string
}

export interface ResearchOrchestrationOutput {
  stageTitle: string
  stageTitleEn: string
  stageSummary: string
  shouldAdvanceStage: boolean
  rationale: string
  nodeActions: ResearchNodeAction[]
  openQuestions: string[]
}

// ============================================================================
// Internal Types
// ============================================================================

export type SchedulerRunSource = 'manual' | 'scheduled'

export type EnhancedTaskResult = TaskResult & { progress?: StageTaskProgress }

export type DiscoverCycleResult = {
  discovered: number
  admitted: number
  contentsGenerated: number
  shouldAdvanceStage: boolean
  stageSummary: string
  openQuestions: string[]
  nodeActions: ResearchNodeAction[]
  admittedPaperIds: string[]
  affectedNodeIds: string[]
  guidanceApplicationSummary: string | null
  durationDecision?: ResearchPipelineDurationDecision | null
}

export type DurationSessionHandle = {
  sessionId: string
  source: SchedulerRunSource
  startedAt: string
  deadlineAt: string
  promise: Promise<void>
}

export type DurationResearchLens = {
  id: string
  label: string
  focus: 'problem' | 'method' | 'citation' | 'merge'
  prompts: string[]
}

export type DurationResearchTargets = {
  stageCandidateBudget: number
  discoveryQueryBudget: number
  nodePaperTargetMin: number
  nodePaperTargetMax: number
  targetCandidatesBeforeAdmission: number
  highConfidenceThreshold: number
}

export type DurationResearchPerspective = {
  id: string
  label: string
  mission: string
  deliverable: string
}

export type ManagedScheduledTask = {
  start: () => void
  stop: () => void
  destroy: () => void
}

export type DurationResearchStrategy = {
  cycleDelayMs: number
  stageStallLimit: number
  reportPasses: number
  lenses: DurationResearchLens[]
  targets: DurationResearchTargets
  perspectives: DurationResearchPerspective[]
  qualityBars: string[]
}

export type DeferredPromiseHandlers = {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

// ============================================================================
// Heuristic Clustering Types
// ============================================================================

export type HeuristicPaperSignal = {
  paper: ResearchCandidatePaper
  orderedTokens: string[]
  titleTokenSet: Set<string>
  weights: Map<string, number>
}

export type HeuristicPaperCluster = {
  key: string
  themeToken: string | null
  papers: ResearchCandidatePaper[]
  signals: HeuristicPaperSignal[]
  labelZh?: string
  labelEn?: string
  priority?: number
}

export type TopicSpecificClusterFamily = {
  key: string
  titleZh: string
  titleEn: string
  priority: number
}

// ============================================================================
// Constants
// ============================================================================

/** Stage duration constants (in days) */
export const STAGE_DURATION_DAYS_MIN = 7
export const STAGE_DURATION_DAYS_MAX = 365
export const STAGE_DURATION_DAYS_DEFAULT = 30

/** Stage duration constants (in hours, derived from days) */
export const DEFAULT_DURATION_HOURS = STAGE_DURATION_DAYS_DEFAULT * 24
export const MIN_DURATION_HOURS = STAGE_DURATION_DAYS_MIN * 24
export const MAX_DURATION_HOURS = STAGE_DURATION_DAYS_MAX * 24

export const MIN_RESEARCH_CYCLE_DELAY_MS = 1000
export const MAX_RESEARCH_CYCLE_DELAY_MS = 30 * 60 * 1000
export const MANUAL_TOPIC_TASK_CRON = '0 3 * * *'

export const BACKGROUND_DURATION_RUNS_DISABLED =
  process.env.SCHEDULER_DISABLE_BACKGROUND_RUNS === '1' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT === 'child-v8' ||
  process.env.NODE_ENV === 'test'

// ============================================================================
// Multi-Topic Round-Robin Types
// ============================================================================

export type MultiTopicSessionMode = 'parallel' | 'round-robin'

export interface MultiTopicSessionConfig {
  sessionId: string
  topicIds: string[]
  mode: MultiTopicSessionMode
  durationHours: number
  startedAt: string
  deadlineAt: string
  currentTopicId: string | null
  cycleCount: number
  status: 'active' | 'paused' | 'completed' | 'failed'
}

export interface MultiTopicSessionHandle {
  sessionId: string
  config: MultiTopicSessionConfig
  startedAt: string
  deadlineAt: string
  promise: Promise<void>
}

export interface RoundRobinCycleResult {
  topicId: string
  success: boolean
  discovered: number
  admitted: number
  contentsGenerated: number
  stageSummary: string
  nextTopicId: string | null
  switchedTopic: boolean
}
