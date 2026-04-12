import { prisma } from '../../lib/prisma'

type PipelineNodeAction = {
  action: 'create' | 'update' | 'merge' | 'strengthen'
  nodeId?: string
  mergeIntoNodeId?: string
  title?: string
  titleEn?: string
  subtitle?: string
  summary?: string
  explanation?: string
  paperIds?: string[]
  primaryPaperId?: string
  rationale?: string
}

export type ResearchPipelineDurationDecisionAction = 'stay' | 'advance' | 'cycle-reset'
export type ResearchPipelineDurationDecisionReason =
  | 'orchestration'
  | 'stall-limit'
  | 'progress-made'
  | 'await-more-evidence'

export interface ResearchPipelineDurationDecision {
  action: ResearchPipelineDurationDecisionAction
  reason: ResearchPipelineDurationDecisionReason
  currentStage: number
  nextStage: number
  madeProgress?: boolean
  stallCountBefore?: number
  stallCountAfter?: number
  stallLimit?: number
  completedStageCycles?: number
  summary?: string
  rationale?: string
}

export interface ResearchPipelineEntry {
  timestamp?: string
  stageIndex?: number
  roundIndex?: number
  discovered?: number
  admitted?: number
  contentsGenerated?: number
  stageSummary?: string
  shouldAdvanceStage?: boolean
  nodeActions?: PipelineNodeAction[]
  openQuestions?: string[]
  durationDecision?: ResearchPipelineDurationDecision
}

export interface ResearchPipelineState {
  schemaVersion: string
  topicId: string
  updatedAt?: string
  lastRun?: ResearchPipelineEntry | null
  history: ResearchPipelineEntry[]
  stages: Record<string, ResearchPipelineEntry>
}

export interface ResearchPipelineContextOptions {
  nodeId?: string
  paperIds?: string[]
  stageIndex?: number
  historyLimit?: number
}

const RESEARCH_PIPELINE_HISTORY_LIMIT = 20
const RESEARCH_PIPELINE_NOISE_PATTERNS = [
  /\bNo new papers were admitted in this round\b/iu,
  /\bthe stage remains in evidence consolidation mode\b/iu,
  /\bStage\s+\d+(?:\s*\/\s*round\s+\d+)?\s*:\s+No new papers were admitted\b/iu,
  /\bargs\.[\w.]+/iu,
  /\bis not iterable\b/iu,
]

function researchPipelineStateKey(topicId: string) {
  return `topic:${topicId}:research-pipeline`
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function pickText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return ''
}

function uniqueStrings(values: string[], limit = 8) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value.replace(/\s+/gu, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function looksLikeResearchPipelineNoise(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return false
  return RESEARCH_PIPELINE_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function sanitizePipelineLine(value: string | null | undefined, maxLength = 220) {
  const normalized = clipText(value, maxLength)
  if (!normalized || looksLikeResearchPipelineNoise(normalized)) return ''
  return normalized
}

function asPipelineState(value: string | null | undefined, topicId: string): ResearchPipelineState | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<ResearchPipelineState>
    return {
      schemaVersion: parsed.schemaVersion || 'research-pipeline-v1',
      topicId: parsed.topicId || topicId,
      updatedAt: parsed.updatedAt,
      lastRun: parsed.lastRun ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      stages:
        parsed.stages && typeof parsed.stages === 'object' && !Array.isArray(parsed.stages)
          ? (parsed.stages as Record<string, ResearchPipelineEntry>)
          : {},
    }
  } catch {
    return null
  }
}

function emptyPipelineState(topicId: string): ResearchPipelineState {
  return {
    schemaVersion: 'research-pipeline-v1',
    topicId,
    history: [],
    stages: {},
    lastRun: null,
  }
}

function matchesNodeAction(
  action: PipelineNodeAction,
  options: ResearchPipelineContextOptions,
  paperIdSet: Set<string>,
) {
  if (options.nodeId) {
    if (action.nodeId === options.nodeId || action.mergeIntoNodeId === options.nodeId) {
      return true
    }
  }

  const relatedPaperIds = Array.isArray(action.paperIds) ? action.paperIds : []
  if (relatedPaperIds.some((paperId) => paperIdSet.has(paperId))) {
    return true
  }

  if (action.primaryPaperId && paperIdSet.has(action.primaryPaperId)) {
    return true
  }

  return false
}

function summarizeEntry(entry: ResearchPipelineEntry) {
  return {
    timestamp: entry.timestamp ?? null,
    stageIndex: entry.stageIndex ?? null,
    roundIndex: entry.roundIndex ?? null,
    discovered: entry.discovered ?? 0,
    admitted: entry.admitted ?? 0,
    contentsGenerated: entry.contentsGenerated ?? 0,
    stageSummary: sanitizePipelineLine(entry.stageSummary, 220),
    shouldAdvanceStage: Boolean(entry.shouldAdvanceStage),
    durationDecision: entry.durationDecision
      ? {
          action: entry.durationDecision.action,
          reason: entry.durationDecision.reason,
          currentStage: entry.durationDecision.currentStage,
          nextStage: entry.durationDecision.nextStage,
          madeProgress: Boolean(entry.durationDecision.madeProgress),
          stallCountBefore: entry.durationDecision.stallCountBefore ?? 0,
          stallCountAfter: entry.durationDecision.stallCountAfter ?? 0,
          stallLimit: entry.durationDecision.stallLimit ?? 0,
          completedStageCycles: entry.durationDecision.completedStageCycles ?? 0,
          summary: sanitizePipelineLine(entry.durationDecision.summary, 220),
          rationale: sanitizePipelineLine(entry.durationDecision.rationale, 200),
        }
      : null,
    openQuestions: uniqueStrings(
      Array.isArray(entry.openQuestions)
        ? entry.openQuestions
            .map((item) => sanitizePipelineLine(item, 180))
            .filter(Boolean)
        : [],
      4,
    ),
    nodeActions: (Array.isArray(entry.nodeActions) ? entry.nodeActions : []).slice(0, 5).map((action) => ({
      action: action.action,
      nodeId: action.nodeId ?? null,
      mergeIntoNodeId: action.mergeIntoNodeId ?? null,
      title: pickText(action.title, action.titleEn),
      paperIds: Array.isArray(action.paperIds) ? action.paperIds.slice(0, 6) : [],
      rationale: clipText(action.rationale, 180),
    })),
  }
}

export async function loadResearchPipelineState(topicId: string): Promise<ResearchPipelineState> {
  const record = await prisma.system_configs.findUnique({
    where: { key: researchPipelineStateKey(topicId) },
  })

  return asPipelineState(record?.value, topicId) ?? emptyPipelineState(topicId)
}

export async function saveResearchPipelineState(state: ResearchPipelineState) {
  await prisma.system_configs.upsert({
    where: { key: researchPipelineStateKey(state.topicId) },
    update: { value: JSON.stringify(state), updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: researchPipelineStateKey(state.topicId), value: JSON.stringify(state), updatedAt: new Date() },
  })
}

export async function appendResearchPipelineEntry(
  topicId: string,
  entry: ResearchPipelineEntry,
) {
  const state = await loadResearchPipelineState(topicId)
  const timestamp = entry.timestamp ?? new Date().toISOString()
  const nextEntry: ResearchPipelineEntry = {
    ...entry,
    timestamp,
  }
  const history = Array.isArray(state.history)
    ? state.history.slice(-(RESEARCH_PIPELINE_HISTORY_LIMIT - 1))
    : []
  const nextState: ResearchPipelineState = {
    ...state,
    schemaVersion: state.schemaVersion || 'research-pipeline-v1',
    topicId,
    updatedAt: timestamp,
    lastRun: nextEntry,
    stages: {
      ...(state.stages && typeof state.stages === 'object' ? state.stages : {}),
      ...(typeof nextEntry.stageIndex === 'number'
        ? { [String(nextEntry.stageIndex)]: nextEntry }
        : {}),
    },
    history: [...history, nextEntry],
  }

  await saveResearchPipelineState(nextState)
  return nextState
}

export function buildResearchPipelineContext(
  state: ResearchPipelineState,
  options: ResearchPipelineContextOptions = {},
) {
  const historyLimit = options.historyLimit ?? 5
  const paperIdSet = new Set(options.paperIds ?? [])
  const history = Array.isArray(state.history) ? state.history : []
  const recentHistory = history.slice(-historyLimit).reverse()
  const stageEntry =
    typeof options.stageIndex === 'number'
      ? state.stages[String(options.stageIndex)] ?? null
      : state.lastRun ?? null

  const relatedHistory = recentHistory.filter((entry) => {
    if (typeof options.stageIndex === 'number' && entry.stageIndex === options.stageIndex) {
      return true
    }

    return (Array.isArray(entry.nodeActions) ? entry.nodeActions : []).some((action) =>
      matchesNodeAction(action, options, paperIdSet),
    )
  })

  const globalOpenQuestions = uniqueStrings(
    history.flatMap((entry) => (Array.isArray(entry.openQuestions) ? entry.openQuestions : [])),
    8,
  )

  const continuityThreads = uniqueStrings(
    history.flatMap((entry) => {
      const stageLabel =
        typeof entry.stageIndex === 'number'
          ? `Stage ${entry.stageIndex}${typeof entry.roundIndex === 'number' ? ` / round ${entry.roundIndex}` : ''}`
          : 'Research stage'

      const decisionSummary = pickText(
        entry.durationDecision?.summary,
        entry.durationDecision?.rationale,
      )
      const items = [pickText(entry.stageSummary), decisionSummary]
      const matchedActions = (Array.isArray(entry.nodeActions) ? entry.nodeActions : [])
        .filter((action) => matchesNodeAction(action, options, paperIdSet))
        .flatMap((action) => [
          pickText(action.title, action.titleEn),
          pickText(action.rationale),
        ])

      return [...items, ...matchedActions]
        .map((value) => sanitizePipelineLine(value, 200))
        .filter(Boolean)
        .map((value) => `${stageLabel}: ${value}`)
    }),
    8,
  )

  return {
    updatedAt: state.updatedAt ?? null,
    lastRun: state.lastRun ? summarizeEntry(state.lastRun) : null,
    currentStage: stageEntry ? summarizeEntry(stageEntry) : null,
    recentHistory: recentHistory.map((entry) => summarizeEntry(entry)),
    globalOpenQuestions,
    continuityThreads,
    subjectFocus: {
      nodeId: options.nodeId ?? null,
      paperIds: options.paperIds ?? [],
      stageIndex: options.stageIndex ?? null,
      relatedHistory: relatedHistory.map((entry) => summarizeEntry(entry)),
      relatedNodeActions: uniqueStrings(
        relatedHistory.flatMap((entry) =>
          (Array.isArray(entry.nodeActions) ? entry.nodeActions : []).flatMap((action) =>
            [pickText(action.title, action.titleEn), pickText(action.rationale)]
              .map((value) => sanitizePipelineLine(value, 180))
              .filter(Boolean),
          ),
        ),
        6,
      ),
    },
  }
}
