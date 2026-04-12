import type { ResearchMode } from '../scheduler'
import { prisma } from '../../lib/prisma'

export type ResearchRunStatus = 'running' | 'completed' | 'failed' | 'paused'
export type ResearchRunTrigger = 'manual' | 'scheduled'

export interface ResearchRunReport {
  schemaVersion: 'topic-research-report-v1'
  reportId: string
  taskId: string
  topicId: string
  topicName: string
  researchMode: ResearchMode
  trigger: ResearchRunTrigger
  status: ResearchRunStatus
  durationHours: number | null
  startedAt: string
  deadlineAt: string | null
  completedAt: string | null
  updatedAt: string
  currentStage: number
  totalStages: number
  completedStageCycles: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  latestStageSummary: string | null
  headline: string
  dek: string
  summary: string
  paragraphs: string[]
  keyMoves: string[]
  openQuestions: string[]
  latestNodeActions: Array<{
    action: 'create' | 'update' | 'merge' | 'strengthen'
    stageIndex: number | null
    title: string
    rationale: string
    nodeId?: string | null
    mergeIntoNodeId?: string | null
  }>
}

function reportKey(topicId: string) {
  return `topic:${topicId}:research-report`
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function prefersChineseResearchCopy(value: string | null | undefined) {
  return /[\u4e00-\u9fff]/u.test(value ?? '')
}

function normalizeResearchReportLine(value: string | null | undefined) {
  const normalized = clipText(value, 220)
  if (!normalized) return ''

  const stageMatch = normalized.match(/^Stage\s+(\d+)\s*:\s*(.+)$/u)
  if (stageMatch && prefersChineseResearchCopy(stageMatch[2])) {
    return `第 ${stageMatch[1]} 阶段：${stageMatch[2]}`
  }

  return normalized
}

export const DEFAULT_RESEARCH_STATUS_ISSUE_SUMMARY =
  '本轮研究在执行编排层遇到内部故障，系统保留了当前主题主线与证据状态，等待下一次启动后继续收束。'

const INTERNAL_RESEARCH_ERROR_PATTERNS = [
  /\bargs\.[\w.]+/iu,
  /\bis not iterable\b/iu,
  /\bunknown topic id\b/iu,
  /\bcannot read (?:properties|property)\b/iu,
  /\b(?:type|reference|syntax|range)error\b/iu,
  /\bcannot find module\b/iu,
  /\b(?:enoent|econn(?:refused|reset|timedout))\b/iu,
  /\bat\s+[\w$.<>]+\s*\(/u,
]

const LEGACY_RESEARCH_NARRATIVE_PATTERNS = [
  /\bargs\.[\w.]+/iu,
  /\bunknown topic id\b/iu,
  /\bnodeactions\b/iu,
  /\b17\s*篇关联论文\b/u,
  /数据污染/u,
  /证据层断裂/u,
  /执行层故障/u,
  /完全无关/u,
]

export function looksLikeInternalResearchError(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return false
  return INTERNAL_RESEARCH_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function sanitizeResearchFacingSummary(
  value: string | null | undefined,
  fallback = DEFAULT_RESEARCH_STATUS_ISSUE_SUMMARY,
) {
  const normalized = clipText(value, 280)
  if (!normalized) return ''
  return looksLikeInternalResearchError(normalized) ? fallback : normalized
}

export function looksLikeLegacyResearchNarrative(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return false
  return LEGACY_RESEARCH_NARRATIVE_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function reportContainsOperationalNarrative(
  report:
    | Pick<ResearchRunReport, 'summary' | 'paragraphs' | 'keyMoves'>
    | null
    | undefined,
) {
  if (!report) return false

  const values = [report.summary, ...(report.paragraphs ?? []), ...(report.keyMoves ?? [])]
  return values.some((value) => looksLikeLegacyResearchNarrative(value))
}

function uniqueLines(values: string[], limit = 8) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = normalizeResearchReportLine(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function asReport(value: string | null | undefined): ResearchRunReport | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<ResearchRunReport>
    if (!parsed.topicId || !parsed.reportId || !parsed.taskId || !parsed.topicName) return null

    return {
      schemaVersion: 'topic-research-report-v1',
      reportId: parsed.reportId,
      taskId: parsed.taskId,
      topicId: parsed.topicId,
      topicName: parsed.topicName,
      researchMode: parsed.researchMode === 'duration' ? 'duration' : 'stage-rounds',
      trigger: parsed.trigger === 'scheduled' ? 'scheduled' : 'manual',
      status:
        parsed.status === 'running' ||
        parsed.status === 'completed' ||
        parsed.status === 'failed' ||
        parsed.status === 'paused'
          ? parsed.status
          : 'completed',
      durationHours:
        typeof parsed.durationHours === 'number' && Number.isFinite(parsed.durationHours)
          ? parsed.durationHours
          : null,
      startedAt: parsed.startedAt ?? new Date(0).toISOString(),
      deadlineAt: parsed.deadlineAt ?? null,
      completedAt: parsed.completedAt ?? null,
      updatedAt: parsed.updatedAt ?? parsed.completedAt ?? parsed.startedAt ?? new Date(0).toISOString(),
      currentStage: typeof parsed.currentStage === 'number' ? parsed.currentStage : 1,
      totalStages: typeof parsed.totalStages === 'number' ? parsed.totalStages : 1,
      completedStageCycles:
        typeof parsed.completedStageCycles === 'number' ? parsed.completedStageCycles : 0,
      totalRuns: typeof parsed.totalRuns === 'number' ? parsed.totalRuns : 0,
      successfulRuns: typeof parsed.successfulRuns === 'number' ? parsed.successfulRuns : 0,
      failedRuns: typeof parsed.failedRuns === 'number' ? parsed.failedRuns : 0,
      discoveredPapers: typeof parsed.discoveredPapers === 'number' ? parsed.discoveredPapers : 0,
      admittedPapers: typeof parsed.admittedPapers === 'number' ? parsed.admittedPapers : 0,
      generatedContents: typeof parsed.generatedContents === 'number' ? parsed.generatedContents : 0,
      latestStageSummary: sanitizeResearchFacingSummary(parsed.latestStageSummary) || null,
      headline: clipText(parsed.headline, 120),
      dek: clipText(parsed.dek, 180),
      summary: clipText(parsed.summary, 360),
      paragraphs: uniqueLines(Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [], 4),
      keyMoves: uniqueLines(Array.isArray(parsed.keyMoves) ? parsed.keyMoves : [], 6),
      openQuestions: uniqueLines(Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [], 6),
      latestNodeActions: Array.isArray(parsed.latestNodeActions)
        ? parsed.latestNodeActions
            .map((entry) => ({
              action:
                entry?.action === 'create' ||
                entry?.action === 'update' ||
                entry?.action === 'merge' ||
                entry?.action === 'strengthen'
                  ? entry.action
                  : 'strengthen',
              stageIndex: typeof entry?.stageIndex === 'number' ? entry.stageIndex : null,
              title: clipText(entry?.title, 120),
              rationale: clipText(entry?.rationale, 200),
              nodeId: typeof entry?.nodeId === 'string' ? entry.nodeId : null,
              mergeIntoNodeId: typeof entry?.mergeIntoNodeId === 'string' ? entry.mergeIntoNodeId : null,
            }))
            .slice(0, 6)
        : [],
    }
  } catch {
    return null
  }
}

export async function loadTopicResearchReport(topicId: string): Promise<ResearchRunReport | null> {
  const record = await prisma.system_configs.findUnique({
    where: { key: reportKey(topicId) },
  })

  return asReport(record?.value)
}

export async function saveTopicResearchReport(report: ResearchRunReport): Promise<ResearchRunReport> {
  const normalized = asReport(JSON.stringify(report))
  if (!normalized) {
    throw new Error(`Invalid research report payload for topic ${report.topicId}`)
  }

  await prisma.system_configs.upsert({
    where: { key: reportKey(report.topicId) },
    update: { value: JSON.stringify(normalized), updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: reportKey(report.topicId), value: JSON.stringify(normalized), updatedAt: new Date() },
  })

  return normalized
}
