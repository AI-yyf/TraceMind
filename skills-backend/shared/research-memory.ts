type DecisionMemoryEntry = Record<string, unknown>
type ExecutionSkillRecord = Record<string, unknown>

export interface DecisionMemoryFile {
  schemaVersion: number
  entries: DecisionMemoryEntry[]
}

export interface ExecutionMemoryFile {
  schemaVersion: number
  skills: Record<string, ExecutionSkillRecord>
}

const MAX_DECISION_MEMORY_ENTRIES = 1500
const MAX_EXECUTION_PROFILES_PER_SKILL = 24
const MAX_STRING_LENGTH = 600

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalString(value: unknown) {
  const normalized = asString(value)
  return normalized.length > 0 ? normalized : undefined
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) return [] as string[]
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function limitString(value: string | undefined) {
  if (!value) return value
  return value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH).trimEnd()}...`
}

function normalizeTimestamp(value: unknown, fallback: string) {
  const text = asString(value)
  if (!text) return fallback
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString()
}

function compareTimestamps(left: string | undefined, right: string | undefined) {
  const leftTime = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY
  const rightTime = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY
  return leftTime - rightTime
}

function sanitizeScalarRecord(record: Record<string, unknown>) {
  const next: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(record)) {
    if (key === 'profiles') continue
    if (typeof value === 'string') {
      next[key] = limitString(value.trim()) ?? ''
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value
      continue
    }
    if (typeof value === 'boolean') {
      next[key] = value
      continue
    }
    if (value === null) {
      next[key] = null
    }
  }

  return next
}

function normalizeDecisionMemoryEntry(value: unknown, index: number) {
  if (!isRecord(value)) return null

  const fallbackTimestamp = new Date(0).toISOString()
  const timestamp = normalizeTimestamp(value.timestamp, fallbackTimestamp)
  const topicId = asOptionalString(value.topicId)
  const skillId = asOptionalString(value.skillId)
  const branchId = asOptionalString(value.branchId)
  const selectedPaperId = asOptionalString(value.selectedPaperId)
  const id =
    asOptionalString(value.id) ??
    `${topicId ?? 'topic'}:${skillId ?? 'skill'}:${branchId ?? 'branch'}:${selectedPaperId ?? 'paper'}:${timestamp}:${index}`

  const entry: DecisionMemoryEntry = {
    id,
    timestamp,
  }

  const scalarFields: Array<[string, unknown]> = [
    ['topicId', topicId],
    ['skillId', skillId],
    ['source', asOptionalString(value.source)],
    ['action', asOptionalString(value.action)],
    ['actionKind', asOptionalString(value.actionKind)],
    ['summary', limitString(asOptionalString(value.summary))],
    ['rationale', limitString(asOptionalString(value.rationale))],
    ['branchId', branchId],
    ['selectedPaperId', selectedPaperId],
  ]

  for (const [key, fieldValue] of scalarFields) {
    if (fieldValue !== undefined) {
      entry[key] = fieldValue
    }
  }

  const numericFields: Array<[string, unknown]> = [
    ['stageIndex', asNumber(value.stageIndex)],
    ['windowMonths', asNumber(value.windowMonths)],
  ]

  for (const [key, fieldValue] of numericFields) {
    if (fieldValue !== undefined) {
      entry[key] = fieldValue
    }
  }

  const arrayFields: Array<[string, unknown]> = [
    ['affectedProblemIds', uniqueStrings(value.affectedProblemIds)],
    ['affectedPaperIds', uniqueStrings(value.affectedPaperIds)],
    ['deferredPaperIds', uniqueStrings(value.deferredPaperIds)],
    ['resolvedProblemIds', uniqueStrings(value.resolvedProblemIds)],
    ['mergeTargetBranchIds', uniqueStrings(value.mergeTargetBranchIds)],
    ['promotedPaperIds', uniqueStrings(value.promotedPaperIds)],
  ]

  for (const [key, fieldValue] of arrayFields) {
    if (Array.isArray(fieldValue) && fieldValue.length > 0) {
      entry[key] = fieldValue
    }
  }

  return entry
}

function normalizeExecutionProfile(value: unknown) {
  if (!isRecord(value)) return null

  const scalar = sanitizeScalarRecord(value)
  const runs = Math.max(1, Math.trunc(asNumber(value.runs) ?? 1))
  const lastRunAt = normalizeTimestamp(value.lastRunAt, new Date(0).toISOString())
  const lastCoverageScoreRaw = asNumber(value.lastCoverageScore)
  const attachmentMode = asOptionalString(value.lastAttachmentMode)
  const contentMode = asOptionalString(value.lastContentMode)
  const branchModel = asOptionalString(value.lastBranchModel)

  return {
    ...scalar,
    runs,
    lastRunAt,
    ...(lastCoverageScoreRaw !== undefined
      ? { lastCoverageScore: Math.max(0, Math.min(1, Number(lastCoverageScoreRaw.toFixed(3)))) }
      : {}),
    ...(attachmentMode ? { lastAttachmentMode: attachmentMode } : {}),
    ...(contentMode ? { lastContentMode: contentMode } : {}),
    ...(branchModel ? { lastBranchModel: branchModel } : {}),
  }
}

function normalizeExecutionSkillRecord(value: unknown) {
  if (!isRecord(value)) return null

  const scalar = sanitizeScalarRecord(value)
  const runs = Math.max(0, Math.trunc(asNumber(value.runs) ?? 0))
  const lastRunAt = normalizeTimestamp(value.lastRunAt, new Date(0).toISOString())
  const profilesRaw = isRecord(value.profiles) ? value.profiles : {}
  const profiles = Object.fromEntries(
    Object.entries(profilesRaw)
      .map(([key, profileValue]) => [key, normalizeExecutionProfile(profileValue)] as const)
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof normalizeExecutionProfile>>] => Boolean(entry[1]))
      .sort((left, right) => {
        const rightRuns = typeof right[1].runs === 'number' ? right[1].runs : 0
        const leftRuns = typeof left[1].runs === 'number' ? left[1].runs : 0
        return (
          rightRuns - leftRuns ||
          compareTimestamps(String(left[1].lastRunAt), String(right[1].lastRunAt)) * -1
        )
      })
      .slice(0, MAX_EXECUTION_PROFILES_PER_SKILL),
  )

  return {
    ...scalar,
    runs,
    lastRunAt,
    ...(Object.keys(profiles).length > 0 ? { profiles } : {}),
  }
}

export function normalizeDecisionMemoryFile(value: unknown): DecisionMemoryFile {
  const rawEntries = isRecord(value) && Array.isArray(value.entries) ? value.entries : []
  const normalized = rawEntries
    .map((entry, index) => normalizeDecisionMemoryEntry(entry, index))
    .filter((entry): entry is DecisionMemoryEntry => Boolean(entry))
    .sort((left, right) => compareTimestamps(String(left.timestamp), String(right.timestamp)))

  const deduped = new Map<string, DecisionMemoryEntry>()
  for (const entry of normalized) {
    deduped.set(String(entry.id), entry)
  }

  const entries = Array.from(deduped.values()).slice(-MAX_DECISION_MEMORY_ENTRIES)

  return {
    schemaVersion: 1,
    entries,
  }
}

export function normalizeExecutionMemoryFile(value: unknown): ExecutionMemoryFile {
  const skillsRaw = isRecord(value) && isRecord(value.skills) ? value.skills : {}
  const skills = Object.fromEntries(
    Object.entries(skillsRaw)
      .map(([key, skillValue]) => [key, normalizeExecutionSkillRecord(skillValue)] as const)
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof normalizeExecutionSkillRecord>>] => Boolean(entry[1])),
  )

  return {
    schemaVersion: 1,
    skills,
  }
}

export function appendDecisionMemoryEntry(
  memory: DecisionMemoryFile | undefined,
  entry: Record<string, unknown>,
) {
  const base = normalizeDecisionMemoryFile(memory)
  return normalizeDecisionMemoryFile({
    ...base,
    entries: [...base.entries, entry],
  })
}

export function mergeExecutionMemoryPatch(args: {
  memory: ExecutionMemoryFile | undefined
  skillId: string
  patch: Record<string, unknown>
}) {
  const base = normalizeExecutionMemoryFile(args.memory)
  const previous = isRecord(base.skills[args.skillId]) ? base.skills[args.skillId] : {}
  const next = {
    ...previous,
    ...args.patch,
    runs: Math.max(1, Math.trunc(asNumber(previous.runs) ?? 0) + 1),
    lastRunAt: new Date().toISOString(),
  }

  return normalizeExecutionMemoryFile({
    ...base,
    skills: {
      ...base.skills,
      [args.skillId]: next,
    },
  })
}

export function compactDecisionMemoryEntries(entries: Record<string, unknown>[]) {
  return normalizeDecisionMemoryFile({
    schemaVersion: 1,
    entries,
  }).entries
}

export function compactExecutionMemorySkills(skills: Record<string, unknown>) {
  return normalizeExecutionMemoryFile({
    schemaVersion: 1,
    skills,
  }).skills
}
