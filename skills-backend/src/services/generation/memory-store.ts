import { createHash } from 'node:crypto'

import { prisma } from '../../lib/prisma'
import type { PromptTemplateId, PromptLanguage } from './prompt-registry'
import type { ModelSlot, OmniIssue } from '../omni/types'

const GENERATION_MEMORY_KEY_PREFIX = 'generation-memory:v1:'
const MAX_MEMORY_PASS_RECORDS = 72
const MEMORY_HOT_PASS_RECORDS = 36
const MAX_MEMORY_JSON_CHARS = 1_500_000
const MAX_SUMMARY_CHARS = 320
const MAX_OUTPUT_STRING_CHARS = 680
const MAX_OUTPUT_ARRAY_ITEMS = 10
const MAX_OUTPUT_OBJECT_KEYS = 24
const MAX_OUTPUT_DEPTH = 5
const MEMORY_COMPACTION_STEPS = [
  { profile: 'memory', passLimit: MAX_MEMORY_PASS_RECORDS },
  { profile: 'memory', passLimit: 56 },
  { profile: 'tight', passLimit: 42 },
  { profile: 'tight', passLimit: 30 },
  { profile: 'tight', passLimit: 20 },
  { profile: 'tight', passLimit: 12 },
] as const

export type GenerationSubjectType = 'topic' | 'stage' | 'node' | 'paper' | 'evidence'
export type GenerationPassStatus = 'ready' | 'fallback'

export interface GenerationPassRecord<T = unknown> {
  passId: string
  templateId: PromptTemplateId
  language: PromptLanguage
  subjectType: GenerationSubjectType
  subjectId: string
  fingerprint: string
  inputFingerprint?: string
  contextFingerprint?: string
  slot: ModelSlot
  status: GenerationPassStatus
  usedCache: boolean
  attemptCount: number
  issue?: OmniIssue | null
  continuityFingerprint?: string
  summary?: string
  output: T
  updatedAt: string
}

export interface TopicGenerationMemory {
  schemaVersion: 'generation-memory-v1'
  topicId: string
  updatedAt: string
  topicSnapshot: Record<string, unknown> | null
  passRecords: Record<string, GenerationPassRecord>
}

export interface GenerationContextPassRecord {
  passId: string
  templateId: PromptTemplateId
  subjectType: GenerationSubjectType
  subjectId: string
  summary: string
  updatedAt: string
  output: unknown
}

export interface GenerationArtifactContextEntry {
  id: string
  kind: 'node' | 'paper'
  entityId: string
  title: string
  headline: string
  summary: string
  standfirst: string
  keyArguments: string[]
  stageIndex: number | null
  updatedAt: string
}

export interface GenerationMemoryContext {
  topicSnapshot: Record<string, unknown> | null
  recentPasses: GenerationContextPassRecord[]
  sameSubjectPasses: GenerationContextPassRecord[]
  anchorPasses: GenerationContextPassRecord[]
  artifactIndex: GenerationArtifactContextEntry[]
  judgmentLedger: string[]
  openQuestions: string[]
  reviewerWatchpoints: string[]
  evidenceWatchpoints: string[]
  continuityThreads: string[]
  evolutionChains: string[]
}

type MemoryInsightBundle = {
  judgmentLedger: string[]
  openQuestions: string[]
  reviewerWatchpoints: string[]
  evidenceWatchpoints: string[]
  continuityThreads: string[]
}

function generationMemoryKey(topicId: string) {
  return `${GENERATION_MEMORY_KEY_PREFIX}${topicId}`
}

function emptyMemory(topicId: string): TopicGenerationMemory {
  return {
    schemaVersion: 'generation-memory-v1',
    topicId,
    updatedAt: new Date().toISOString(),
    topicSnapshot: null,
    passRecords: {},
  }
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function compactGenerationOutput(
  value: unknown,
  options?: {
    stringLimit?: number
    arrayLimit?: number
    objectLimit?: number
    depth?: number
    maxDepth?: number
  },
): unknown {
  const stringLimit = options?.stringLimit ?? MAX_OUTPUT_STRING_CHARS
  const arrayLimit = options?.arrayLimit ?? MAX_OUTPUT_ARRAY_ITEMS
  const objectLimit = options?.objectLimit ?? MAX_OUTPUT_OBJECT_KEYS
  const depth = options?.depth ?? 0
  const maxDepth = options?.maxDepth ?? MAX_OUTPUT_DEPTH

  if (typeof value === 'string') {
    return truncateText(value, stringLimit)
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (depth >= maxDepth) {
    if (Array.isArray(value)) {
      return value
        .slice(0, Math.min(value.length, 3))
        .map((item) => compactGenerationOutput(item, {
          stringLimit: Math.max(120, Math.floor(stringLimit * 0.45)),
          arrayLimit: 3,
          objectLimit: 6,
          depth: depth + 1,
          maxDepth,
        }))
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, Math.min(Object.keys(value as Record<string, unknown>).length, 6))
        .map(([key, nested]) => [
          key,
          compactGenerationOutput(nested, {
            stringLimit: Math.max(120, Math.floor(stringLimit * 0.45)),
            arrayLimit: 3,
            objectLimit: 6,
            depth: depth + 1,
            maxDepth,
          }),
        ]),
    )
  }

  if (Array.isArray(value)) {
    return value.slice(0, arrayLimit).map((item) =>
      compactGenerationOutput(item, {
        stringLimit,
        arrayLimit: Math.max(3, Math.floor(arrayLimit * 0.8)),
        objectLimit,
        depth: depth + 1,
        maxDepth,
      }),
    )
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, objectLimit)
      .map(([key, nested]) => [
        key,
        compactGenerationOutput(nested, {
          stringLimit,
          arrayLimit,
          objectLimit: Math.max(6, Math.floor(objectLimit * 0.8)),
          depth: depth + 1,
          maxDepth,
        }),
      ]),
  )
}

function compactPassRecord<T = unknown>(
  record: GenerationPassRecord<T>,
  profile: 'memory' | 'context' | 'replay' | 'tight' = 'memory',
): GenerationPassRecord {
  const output =
    profile === 'context'
      ? compactGenerationOutput(record.output, {
          stringLimit: 320,
          arrayLimit: 6,
          objectLimit: 14,
          maxDepth: 4,
        })
      : profile === 'replay'
        ? compactGenerationOutput(record.output, {
            stringLimit: 520,
            arrayLimit: 8,
            objectLimit: 18,
            maxDepth: 4,
          })
      : profile === 'tight'
        ? compactGenerationOutput(record.output, {
            stringLimit: 220,
            arrayLimit: 4,
            objectLimit: 10,
            maxDepth: 3,
          })
        : compactGenerationOutput(record.output, {
            stringLimit: MAX_OUTPUT_STRING_CHARS,
            arrayLimit: MAX_OUTPUT_ARRAY_ITEMS,
            objectLimit: MAX_OUTPUT_OBJECT_KEYS,
            maxDepth: MAX_OUTPUT_DEPTH,
          })

  return {
    ...record,
    summary: record.summary ? truncateText(record.summary, MAX_SUMMARY_CHARS) : undefined,
    output,
  }
}

function compactTopicGenerationMemory(
  memory: TopicGenerationMemory,
  profile: 'memory' | 'tight' = 'memory',
  passLimit = MAX_MEMORY_PASS_RECORDS,
): TopicGenerationMemory {
  const ordered = selectRetainedPassRecords(Object.values(memory.passRecords), passLimit)

  return {
    ...memory,
    topicSnapshot: (compactGenerationOutput(memory.topicSnapshot, {
      stringLimit: profile === 'tight' ? 220 : 420,
      arrayLimit: profile === 'tight' ? 4 : 8,
      objectLimit: profile === 'tight' ? 12 : 18,
      maxDepth: 3,
    }) ?? null) as Record<string, unknown> | null,
    passRecords: Object.fromEntries(
      ordered.map((record) => [record.passId, compactPassRecord(record, profile)]),
    ),
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`
}

export function buildGenerationFingerprint(payload: unknown) {
  return createHash('sha1').update(stableStringify(payload)).digest('hex')
}

export function normalizeGenerationScopeId(subjectId: string) {
  const normalized = subjectId.trim()
  if (!normalized) return normalized

  const stageMatch = normalized.match(/^research-stage:(\d+)(?::|$)/u)
  if (stageMatch?.[1]) {
    return `research-stage:${stageMatch[1]}`
  }

  if (normalized.startsWith('research-report:')) {
    return 'research-report'
  }

  const [head] = normalized.split(':')
  return head?.trim() || normalized
}

function buildGenerationScopeKey(subjectType: GenerationSubjectType, subjectId: string) {
  return `${subjectType}:${normalizeGenerationScopeId(subjectId)}`
}

function sortGenerationPassRecords(records: GenerationPassRecord[]) {
  return records.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

function subjectTypeRetentionPriority(subjectType: GenerationSubjectType) {
  if (subjectType === 'topic') return 5
  if (subjectType === 'stage') return 4
  if (subjectType === 'node') return 3
  if (subjectType === 'paper') return 2
  return 1
}

function continuitySubjectPriority(
  currentSubjectType: GenerationSubjectType | undefined,
  candidateSubjectType: GenerationSubjectType,
) {
  if (!currentSubjectType) return subjectTypeRetentionPriority(candidateSubjectType)
  if (candidateSubjectType === currentSubjectType) return 6

  if (currentSubjectType === 'topic') {
    return (
      {
        stage: 5,
        node: 4,
        paper: 3,
        evidence: 2,
        topic: 6,
      } satisfies Record<GenerationSubjectType, number>
    )[candidateSubjectType]
  }

  if (currentSubjectType === 'stage') {
    return (
      {
        topic: 5,
        node: 4,
        paper: 3,
        evidence: 2,
        stage: 6,
      } satisfies Record<GenerationSubjectType, number>
    )[candidateSubjectType]
  }

  if (currentSubjectType === 'node') {
    return (
      {
        stage: 5,
        topic: 4,
        paper: 3,
        evidence: 2,
        node: 6,
      } satisfies Record<GenerationSubjectType, number>
    )[candidateSubjectType]
  }

  if (currentSubjectType === 'paper') {
    return (
      {
        node: 5,
        stage: 4,
        topic: 3,
        evidence: 2,
        paper: 6,
      } satisfies Record<GenerationSubjectType, number>
    )[candidateSubjectType]
  }

  return (
    {
      paper: 5,
      node: 4,
      stage: 3,
      topic: 2,
      evidence: 6,
    } satisfies Record<GenerationSubjectType, number>
  )[candidateSubjectType]
}

function selectRetainedPassRecords(records: GenerationPassRecord[], passLimit: number) {
  const ordered = sortGenerationPassRecords([...records])
  const selected = new Map<string, GenerationPassRecord>()
  const hotLimit = Math.min(
    passLimit,
    Math.max(12, Math.min(MEMORY_HOT_PASS_RECORDS, Math.floor(passLimit * 0.58))),
  )

  const addRecord = (record: GenerationPassRecord) => {
    if (selected.size >= passLimit) return
    if (selected.has(record.passId)) return
    selected.set(record.passId, record)
  }

  ordered.slice(0, hotLimit).forEach(addRecord)

  const scopeAnchors = new Map<string, GenerationPassRecord>()
  for (const record of ordered) {
    const scopeKey = buildGenerationScopeKey(record.subjectType, record.subjectId)
    if (!scopeAnchors.has(scopeKey)) {
      scopeAnchors.set(scopeKey, record)
    }
  }

  Array.from(scopeAnchors.values())
    .filter((record) => !selected.has(record.passId))
    .sort((left, right) => {
      const priorityDelta =
        subjectTypeRetentionPriority(right.subjectType) -
        subjectTypeRetentionPriority(left.subjectType)
      if (priorityDelta !== 0) return priorityDelta
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
    .forEach(addRecord)

  ordered.forEach(addRecord)

  return sortGenerationPassRecords(Array.from(selected.values()))
}

function compactPersistedMemory(
  memory: TopicGenerationMemory,
): { payload: TopicGenerationMemory; serialized: string } {
  let payload = compactTopicGenerationMemory(memory, 'memory', MAX_MEMORY_PASS_RECORDS)
  let serialized = JSON.stringify(payload)

  if (serialized.length <= MAX_MEMORY_JSON_CHARS) {
    return { payload, serialized }
  }

  for (const step of MEMORY_COMPACTION_STEPS.slice(1)) {
    payload = compactTopicGenerationMemory(memory, step.profile, step.passLimit)
    serialized = JSON.stringify(payload)
    if (serialized.length <= MAX_MEMORY_JSON_CHARS) {
      return { payload, serialized }
    }
  }

  return { payload, serialized }
}

function selectRecentContextRecords(
  records: GenerationPassRecord[],
  preferredSubjectType: GenerationSubjectType | undefined,
  limit: number,
) {
  const selected = new Map<string, GenerationPassRecord>()

  const addRecord = (record: GenerationPassRecord) => {
    if (selected.size >= limit) return
    if (selected.has(record.passId)) return
    selected.set(record.passId, record)
  }

  if (preferredSubjectType) {
    records
      .filter((record) => record.subjectType === preferredSubjectType)
      .forEach(addRecord)
  }

  if (selected.size < limit) {
    records
      .filter((record) => record.subjectType === 'topic' || record.subjectType === 'stage')
      .forEach(addRecord)
  }

  if (selected.size < limit) {
    records.forEach(addRecord)
  }

  return sortGenerationPassRecords(Array.from(selected.values())).slice(0, limit)
}

function selectAnchorContextRecords(
  records: GenerationPassRecord[],
  preferredSubjectType: GenerationSubjectType | undefined,
  limit: number,
) {
  if (limit <= 0) return []

  const scopeAnchors = new Map<string, GenerationPassRecord>()
  for (const record of sortGenerationPassRecords([...records])) {
    const scopeKey = buildGenerationScopeKey(record.subjectType, record.subjectId)
    if (!scopeAnchors.has(scopeKey)) {
      scopeAnchors.set(scopeKey, record)
    }
  }

  return Array.from(scopeAnchors.values())
    .sort((left, right) => {
      const priorityDelta =
        continuitySubjectPriority(preferredSubjectType, right.subjectType) -
        continuitySubjectPriority(preferredSubjectType, left.subjectType)
      if (priorityDelta !== 0) return priorityDelta
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
    .slice(0, limit)
}

function parseMemory(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as TopicGenerationMemory
  } catch {
    return null
  }
}

export async function loadTopicGenerationMemory(topicId: string): Promise<TopicGenerationMemory> {
  const record = await prisma.systemConfig.findUnique({
    where: { key: generationMemoryKey(topicId) },
  })

  const parsed = parseMemory(record?.value)
  if (!parsed || parsed.schemaVersion !== 'generation-memory-v1') {
    return emptyMemory(topicId)
  }

  if ((record?.value?.length ?? 0) > MAX_MEMORY_JSON_CHARS) {
    return compactPersistedMemory(parsed).payload
  }

  return parsed
}

export async function saveTopicGenerationMemory(memory: TopicGenerationMemory) {
  const basePayload: TopicGenerationMemory = {
    ...memory,
    updatedAt: new Date().toISOString(),
  }
  const { payload, serialized } = compactPersistedMemory(basePayload)

  await prisma.systemConfig.upsert({
    where: { key: generationMemoryKey(memory.topicId) },
    update: { value: serialized },
    create: { key: generationMemoryKey(memory.topicId), value: serialized },
  })

  return payload
}

export async function updateTopicSnapshot(topicId: string, snapshot: Record<string, unknown>) {
  const memory = await loadTopicGenerationMemory(topicId)
  memory.topicSnapshot = snapshot
  return saveTopicGenerationMemory(memory)
}

export async function readGenerationPass<T = unknown>(
  topicId: string,
  passId: string,
): Promise<GenerationPassRecord<T> | null> {
  const memory = await loadTopicGenerationMemory(topicId)
  const record = memory.passRecords[passId]
  return (record as GenerationPassRecord<T> | undefined) ?? null
}

export async function writeGenerationPass<T = unknown>(
  topicId: string,
  record: GenerationPassRecord<T>,
) {
  const memory = await loadTopicGenerationMemory(topicId)
  memory.passRecords[record.passId] = {
    ...record,
    updatedAt: new Date().toISOString(),
  }
  return saveTopicGenerationMemory(memory)
}

function uniqueStrings(values: string[], limit: number) {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const normalized = value.replace(/\s+/gu, ' ').trim()
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }
  return output
}

function collectByKeys(value: unknown, keys: string[], output: string[]) {
  if (!value) return
  if (Array.isArray(value)) {
    value.forEach((item) => collectByKeys(item, keys, output))
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  for (const [key, nested] of Object.entries(record)) {
    if (keys.includes(key) && typeof nested === 'string') {
      output.push(nested)
    }
    collectByKeys(nested, keys, output)
  }
}

function deriveMemoryInsights(records: GenerationPassRecord[]): MemoryInsightBundle {
  const judgments = records.map((record) => record.summary ?? '').filter(Boolean)
  const openQuestions: string[] = []
  const reviewerWatchpoints: string[] = []
  const evidenceWatchpoints: string[] = []
  const continuityThreads: string[] = []

  records.forEach((record) => {
    collectByKeys(record.output, ['nextQuestion'], openQuestions)
    collectByKeys(record.output, ['reviewerNote'], reviewerWatchpoints)
    collectByKeys(record.output, ['whyItMatters', 'explanation'], evidenceWatchpoints)
    collectByKeys(record.output, ['thesis', 'stageThesis', 'transition', 'headline', 'standfirst'], continuityThreads)

    if (
      record.output &&
      typeof record.output === 'object' &&
      Array.isArray((record.output as Record<string, unknown>).bullets)
    ) {
      reviewerWatchpoints.push(
        ...((record.output as Record<string, unknown>).bullets as unknown[])
          .filter((item): item is string => typeof item === 'string'),
      )
    }
  })

  return {
    judgmentLedger: uniqueStrings(judgments, 12),
    openQuestions: uniqueStrings(openQuestions, 10),
    reviewerWatchpoints: uniqueStrings(reviewerWatchpoints, 10),
    evidenceWatchpoints: uniqueStrings(evidenceWatchpoints, 10),
    continuityThreads: uniqueStrings(continuityThreads, 10),
  }
}

function mapContextPassRecord(
  record: GenerationPassRecord,
  profile: 'context' | 'replay' | 'tight',
): GenerationContextPassRecord {
  return {
    passId: record.passId,
    templateId: record.templateId,
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    summary: record.summary ?? '',
    updatedAt: record.updatedAt,
    output: compactPassRecord(record, profile).output,
  }
}

export function collectGenerationMemoryContext(
  memory: TopicGenerationMemory,
  options?: {
    subjectType?: GenerationSubjectType
    subjectId?: string
    limit?: number
  },
): GenerationMemoryContext {
  const limit = options?.limit ?? 10
  const orderedRecords = sortGenerationPassRecords(Object.values(memory.passRecords))

  const subjectScopeKey =
    options?.subjectType && options?.subjectId
      ? buildGenerationScopeKey(options.subjectType, options.subjectId)
      : null

  const sameSubjectRecords =
    subjectScopeKey === null
      ? []
      : orderedRecords
          .filter(
            (record) =>
              buildGenerationScopeKey(record.subjectType, record.subjectId) === subjectScopeKey,
          )
          .slice(0, Math.max(4, Math.min(limit, 8)))

  const otherRecords = (
    subjectScopeKey === null
      ? orderedRecords
      : orderedRecords.filter(
          (record) =>
            buildGenerationScopeKey(record.subjectType, record.subjectId) !== subjectScopeKey,
        )
  )

  const recentRecords = selectRecentContextRecords(otherRecords, options?.subjectType, limit)
  const recentRecordIds = new Set(recentRecords.map((record) => record.passId))
  const anchorRecords = selectAnchorContextRecords(
    otherRecords.filter((record) => !recentRecordIds.has(record.passId)),
    options?.subjectType,
    Math.max(4, Math.min(Math.ceil(limit / 2), 8)),
  )

  const recentPasses = recentRecords.map((record) => mapContextPassRecord(record, 'context'))
  const sameSubjectPasses = sameSubjectRecords.map((record) =>
    mapContextPassRecord(record, 'replay'),
  )
  const anchorPasses = anchorRecords.map((record) => mapContextPassRecord(record, 'tight'))

  const insights = deriveMemoryInsights([...sameSubjectRecords, ...recentRecords, ...anchorRecords])

  return {
    topicSnapshot: memory.topicSnapshot,
    recentPasses,
    sameSubjectPasses,
    anchorPasses,
    artifactIndex: [],
    ...insights,
    evolutionChains: [],
  }
}
