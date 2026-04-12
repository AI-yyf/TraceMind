import { createHash } from 'node:crypto'

import { prisma } from '../../lib/prisma'
import {
  type GenerationArtifactContextEntry,
  collectGenerationMemoryContext,
  normalizeGenerationScopeId,
  type GenerationMemoryContext,
  type GenerationPassRecord,
  type GenerationSubjectType,
  type TopicGenerationMemory,
} from './memory-store'
import {
  collectTopicArtifactIndexContext,
  loadTopicArtifactIndex,
} from './artifact-index'
import type { PromptLanguage, PromptTemplateId } from './prompt-registry'

const RESEARCH_JUDGMENT_KEY_PREFIX = 'generation-judgments:v1:'
const MAX_JUDGMENTS = 240
const MAX_CONTENT_CHARS = 240

export type ResearchJudgmentKind =
  | 'finding'
  | 'claim'
  | 'method-note'
  | 'comparison'
  | 'open-question'
  | 'error-correction'

export type ResearchJudgmentConfidence = 'high' | 'medium' | 'low' | 'speculative'

export interface ResearchJudgment {
  id: string
  topicId: string
  subjectType: GenerationSubjectType
  scopeId: string
  kind: ResearchJudgmentKind
  content: string
  confidence: ResearchJudgmentConfidence
  sourcePassId: string
  sourceTemplateId: PromptTemplateId
  language: PromptLanguage
  createdAt: string
  reinforcedAt?: string
  supersededBy?: string
  contradictsWith?: string
}

export interface TopicResearchJudgmentState {
  schemaVersion: 'generation-judgments-v1'
  topicId: string
  updatedAt: string
  judgments: ResearchJudgment[]
}

export interface ResearchJudgmentContext {
  researchJudgments: Array<{
    id: string
    kind: ResearchJudgmentKind
    confidence: ResearchJudgmentConfidence
    content: string
    subjectType: GenerationSubjectType
    scopeId: string
    sourceTemplateId: PromptTemplateId
    updatedAt: string
    supersededBy?: string
    contradictsWith?: string
  }>
  sameScopeJudgments: Array<{
    id: string
    kind: ResearchJudgmentKind
    confidence: ResearchJudgmentConfidence
    content: string
    subjectType: GenerationSubjectType
    scopeId: string
    sourceTemplateId: PromptTemplateId
    updatedAt: string
    supersededBy?: string
    contradictsWith?: string
  }>
  judgmentLedger: string[]
  openQuestions: string[]
  reviewerWatchpoints: string[]
  evidenceWatchpoints: string[]
  continuityThreads: string[]
  evolutionChains: string[]
}

type JudgmentSeed = {
  kind: ResearchJudgmentKind
  content: string
  confidence: ResearchJudgmentConfidence
}

type StoredJudgment = ResearchJudgment & {
  updatedAt: string
}

function researchJudgmentKey(topicId: string) {
  return `${RESEARCH_JUDGMENT_KEY_PREFIX}${topicId}`
}

function emptyJudgmentState(topicId: string): TopicResearchJudgmentState {
  return {
    schemaVersion: 'generation-judgments-v1',
    topicId,
    updatedAt: new Date().toISOString(),
    judgments: [],
  }
}

function parseState(value: string | null | undefined) {
  if (!value) return null

  try {
    return JSON.parse(value) as TopicResearchJudgmentState
  } catch {
    return null
  }
}

function clipText(value: string, maxLength = MAX_CONTENT_CHARS) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function uniqueStrings(values: string[], limit: number) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipText(value)
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function normalizeJudgmentContent(value: string) {
  return clipText(value, MAX_CONTENT_CHARS)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function confidenceScore(value: ResearchJudgmentConfidence) {
  if (value === 'high') return 4
  if (value === 'medium') return 3
  if (value === 'low') return 2
  return 1
}

function tokenizeJudgmentContent(value: string) {
  return Array.from(
    new Set(
      normalizeJudgmentContent(value)
        .split(/\s+/u)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2),
    ),
  )
}

function computeTextOverlap(left: string, right: string) {
  const leftTokens = tokenizeJudgmentContent(left)
  const rightTokens = tokenizeJudgmentContent(right)
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0

  const rightSet = new Set(rightTokens)
  const shared = leftTokens.filter((token) => rightSet.has(token)).length
  return shared / Math.max(1, Math.min(leftTokens.length, rightTokens.length))
}

function shareTopicAnchor(left: string, right: string) {
  const leftAnchor = tokenizeJudgmentContent(left).slice(0, 4)
  const rightAnchor = tokenizeJudgmentContent(right).slice(0, 4)
  if (leftAnchor.length === 0 || rightAnchor.length === 0) return false

  const rightSet = new Set(rightAnchor)
  const shared = leftAnchor.filter((token) => rightSet.has(token)).length
  return shared >= 2
}

function judgmentsAreComparable(left: StoredJudgment, right: ResearchJudgment) {
  if (left.subjectType !== right.subjectType) return false
  if (left.scopeId !== right.scopeId) return false
  if (left.kind === right.kind) return true

  const relatedKinds = new Set<ResearchJudgmentKind>(['finding', 'claim'])
  if (relatedKinds.has(left.kind) && relatedKinds.has(right.kind)) return true
  return false
}

function hasStructuredNegationCue(value: string) {
  const normalized = normalizeJudgmentContent(value)
  if (!normalized) return false

  const tokens = new Set(
    normalized
      .split(/\s+/u)
      .map((item) => item.trim())
      .filter(Boolean),
  )

  const tokenCues = [
    'not',
    'no',
    'never',
    'fail',
    'fails',
    'failed',
    'failing',
    'underperform',
    'limitation',
    'limitations',
    'contradict',
    'however',
    'but',
    'although',
    'except',
  ]

  if (tokenCues.some((cue) => tokens.has(cue))) {
    return true
  }

  return [
    'rather than',
    '\u4e0d\u662f',
    '\u5e76\u975e',
    '\u4e0d\u518d',
    '\u4e0d\u5e94',
    '\u4e0d\u80fd',
    '\u65e0\u6cd5',
    '\u7f3a\u9677',
    '\u5c40\u9650',
    '\u9650\u5236',
    '\u53cd\u9a73',
    '\u5931\u8d25',
    '\u7136\u800c',
    '\u4f46\u662f',
    '\u4e0d\u8fc7',
  ].some((cue) => normalized.includes(cue))
}

function detectJudgmentRelations(
  incoming: ResearchJudgment,
  existing: Map<string, StoredJudgment>,
): { superseded: string[]; contradicted: string[] } {
  const superseded: string[] = []
  const contradicted: string[] = []

  for (const candidate of existing.values()) {
    if (candidate.id === incoming.id) continue
    if (!judgmentsAreComparable(candidate, incoming)) continue

    const overlap = computeTextOverlap(candidate.content, incoming.content)
    const anchored = shareTopicAnchor(candidate.content, incoming.content)
    if (overlap < 0.42 && !anchored) continue

    const candidateHasNegation = hasStructuredNegationCue(candidate.content)
    const incomingHasNegation = hasStructuredNegationCue(incoming.content)
    if (candidateHasNegation !== incomingHasNegation && overlap >= 0.42) {
      contradicted.push(candidate.id)
      continue
    }

    const confidenceDelta =
      confidenceScore(incoming.confidence) - confidenceScore(candidate.confidence)
    if (!candidateHasNegation && !incomingHasNegation && confidenceDelta >= 0 && (overlap >= 0.3 || anchored)) {
      superseded.push(candidate.id)
    }
  }

  return {
    superseded: Array.from(new Set(superseded)),
    contradicted: Array.from(new Set(contradicted)),
  }
}

function buildEvolutionChains(ordered: Array<StoredJudgment & { updatedAt: string }>, limit: number) {
  const byId = new Map(ordered.map((judgment) => [judgment.id, judgment] as const))
  const seen = new Set<string>()
  const chains: string[] = []

  for (const judgment of ordered) {
    if (chains.length >= limit) break

    if (judgment.supersededBy && !seen.has(`sup:${judgment.id}`)) {
      const successor = byId.get(judgment.supersededBy)
      if (successor) {
        chains.push(`Refined: "${clipText(judgment.content, 80)}" -> "${clipText(successor.content, 80)}"`)
        seen.add(`sup:${judgment.id}`)
        seen.add(`sup:${successor.id}`)
        continue
      }
    }

    if (judgment.contradictsWith && !seen.has(`con:${judgment.id}`)) {
      const rival = byId.get(judgment.contradictsWith)
      if (rival) {
        const pairKey = [judgment.id, rival.id].sort().join(':')
        if (seen.has(`pair:${pairKey}`)) continue
        chains.push(`Tension: "${clipText(judgment.content, 80)}" <-> "${clipText(rival.content, 80)}"`)
        seen.add(`con:${judgment.id}`)
        seen.add(`con:${rival.id}`)
        seen.add(`pair:${pairKey}`)
      }
    }
  }

  return uniqueStrings(chains, limit)
}

function createJudgmentId(input: {
  topicId: string
  subjectType: GenerationSubjectType
  scopeId: string
  kind: ResearchJudgmentKind
  content: string
}) {
  return createHash('sha1')
    .update(
      [
        input.topicId,
        input.subjectType,
        input.scopeId,
        input.kind,
        normalizeJudgmentContent(input.content),
      ].join('|'),
    )
    .digest('hex')
}

function pushSeed(target: JudgmentSeed[], seed: JudgmentSeed | null | undefined) {
  if (!seed) return
  const content = clipText(seed.content)
  if (!content) return
  target.push({
    ...seed,
    content,
  })
}

function pushStringField(
  target: JudgmentSeed[],
  value: unknown,
  kind: ResearchJudgmentKind,
  confidence: ResearchJudgmentConfidence,
) {
  if (typeof value !== 'string') return
  pushSeed(target, {
    kind,
    confidence,
    content: value,
  })
}

function pushArrayStringField(
  target: JudgmentSeed[],
  value: unknown,
  kind: ResearchJudgmentKind,
  confidence: ResearchJudgmentConfidence,
) {
  if (!Array.isArray(value)) return

  value
    .filter((item): item is string => typeof item === 'string')
    .forEach((item) => pushStringField(target, item, kind, confidence))
}

function extractJudgmentSeeds(output: unknown, templateId: PromptTemplateId) {
  const seeds: JudgmentSeed[] = []
  const record = output && typeof output === 'object' ? (output as Record<string, unknown>) : null

  if (!record) return seeds

  pushStringField(seeds, record.headline, 'finding', 'high')
  pushStringField(seeds, record.standfirst, 'finding', 'medium')
  pushStringField(seeds, record.summary, templateId === 'article.reviewer' ? 'error-correction' : 'finding', 'medium')
  pushStringField(seeds, record.digest, 'finding', 'medium')
  pushStringField(seeds, record.thesis, 'finding', 'high')
  pushStringField(seeds, record.stageThesis, 'finding', 'high')
  pushStringField(seeds, record.whyNow, 'claim', 'medium')
  pushStringField(seeds, record.whyItMatters, 'method-note', 'medium')
  pushStringField(seeds, record.explanation, 'method-note', 'medium')
  pushStringField(seeds, record.transition, 'claim', 'medium')
  pushStringField(seeds, record.nextQuestion, 'open-question', 'speculative')
  pushStringField(seeds, record.reviewerNote, 'error-correction', 'medium')
  pushArrayStringField(seeds, record.openQuestions, 'open-question', 'speculative')
  pushArrayStringField(seeds, record.bullets, 'error-correction', 'medium')

  if (Array.isArray(record.points)) {
    record.points.forEach((point) => {
      if (!point || typeof point !== 'object') return
      const detail = clipText(String((point as Record<string, unknown>).detail ?? ''))
      if (!detail) return
      const label = clipText(String((point as Record<string, unknown>).label ?? ''))
      pushSeed(seeds, {
        kind: 'comparison',
        confidence: 'medium',
        content: label ? `${label}: ${detail}` : detail,
      })
    })
  }

  return seeds
}

export function extractResearchJudgmentsFromPass(
  topicId: string,
  record: GenerationPassRecord,
): ResearchJudgment[] {
  const seeds: JudgmentSeed[] = []
  const scopeId = normalizeGenerationScopeId(record.subjectId)

  pushStringField(
    seeds,
    record.summary,
    record.templateId === 'article.reviewer' ? 'error-correction' : 'finding',
    record.templateId === 'article.reviewer' ? 'medium' : 'high',
  )

  extractJudgmentSeeds(record.output, record.templateId).forEach((seed) => pushSeed(seeds, seed))

  const seen = new Set<string>()
  const createdAt = new Date().toISOString()
  const judgments: ResearchJudgment[] = []

  for (const seed of seeds) {
    const normalized = `${seed.kind}:${normalizeJudgmentContent(seed.content)}`
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)

    judgments.push({
      id: createJudgmentId({
        topicId,
        subjectType: record.subjectType,
        scopeId,
        kind: seed.kind,
        content: seed.content,
      }),
      topicId,
      subjectType: record.subjectType,
      scopeId,
      kind: seed.kind,
      content: seed.content,
      confidence: seed.confidence,
      sourcePassId: record.passId,
      sourceTemplateId: record.templateId,
      language: record.language,
      createdAt,
    })
  }

  return judgments.slice(0, 8)
}

export function upsertResearchJudgmentsInState(
  state: TopicResearchJudgmentState,
  incoming: ResearchJudgment[],
) {
  const existing = new Map<string, StoredJudgment>()

  state.judgments.forEach((judgment) => {
    existing.set(judgment.id, {
      ...judgment,
      updatedAt: judgment.reinforcedAt ?? judgment.createdAt,
    })
  })

  const relationUpdates = new Map<
    string,
    {
      supersededBy?: string
      contradictsWith?: string
    }
  >()

  for (const judgment of incoming) {
    const current = existing.get(judgment.id)
    if (!current) {
      const relations = detectJudgmentRelations(judgment, existing)
      const nextJudgment: StoredJudgment = {
        ...judgment,
        contradictsWith: relations.contradicted[0] ?? judgment.contradictsWith,
        updatedAt: judgment.createdAt,
      }

      relations.superseded.forEach((judgmentId) => {
        const previous = relationUpdates.get(judgmentId) ?? {}
        relationUpdates.set(judgmentId, {
          ...previous,
          supersededBy: judgment.id,
        })
      })

      relations.contradicted.forEach((judgmentId) => {
        const previous = relationUpdates.get(judgmentId) ?? {}
        relationUpdates.set(judgmentId, {
          ...previous,
          contradictsWith: judgment.id,
        })
      })

      existing.set(judgment.id, {
        ...nextJudgment,
      })
      continue
    }

    existing.set(judgment.id, {
      ...current,
      content:
        clipText(judgment.content).length > clipText(current.content).length
          ? clipText(judgment.content)
          : current.content,
      confidence:
        confidenceScore(judgment.confidence) > confidenceScore(current.confidence)
          ? judgment.confidence
          : current.confidence,
      sourcePassId: judgment.sourcePassId,
      sourceTemplateId: judgment.sourceTemplateId,
      language: judgment.language,
      contradictsWith: current.contradictsWith ?? judgment.contradictsWith,
      supersededBy: current.supersededBy ?? judgment.supersededBy,
      reinforcedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  relationUpdates.forEach((patch, judgmentId) => {
    const current = existing.get(judgmentId)
    if (!current) return

    existing.set(judgmentId, {
      ...current,
      supersededBy: patch.supersededBy ?? current.supersededBy,
      contradictsWith: patch.contradictsWith ?? current.contradictsWith,
      updatedAt: new Date().toISOString(),
    })
  })

  const judgments = Array.from(existing.values())
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, MAX_JUDGMENTS)
    .map(({ updatedAt: _updatedAt, ...judgment }) => judgment)

  return {
    ...state,
    updatedAt: new Date().toISOString(),
    judgments,
  } satisfies TopicResearchJudgmentState
}

export async function loadTopicResearchJudgmentState(
  topicId: string,
): Promise<TopicResearchJudgmentState> {
  const record = await prisma.system_configs.findUnique({
    where: { key: researchJudgmentKey(topicId) },
  })

  const parsed = parseState(record?.value)
  if (!parsed || parsed.schemaVersion !== 'generation-judgments-v1') {
    return emptyJudgmentState(topicId)
  }

  return parsed
}

async function saveTopicResearchJudgmentState(state: TopicResearchJudgmentState) {
  const payload = JSON.stringify({
    ...state,
    updatedAt: new Date().toISOString(),
    judgments: state.judgments.slice(0, MAX_JUDGMENTS),
  } satisfies TopicResearchJudgmentState)

  await prisma.system_configs.upsert({
    where: { key: researchJudgmentKey(state.topicId) },
    update: { value: payload, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: researchJudgmentKey(state.topicId), value: payload, updatedAt: new Date() },
  })
}

export async function persistResearchJudgmentsFromPass(
  topicId: string,
  record: GenerationPassRecord,
) {
  const extracted = extractResearchJudgmentsFromPass(topicId, record)
  if (extracted.length === 0) return loadTopicResearchJudgmentState(topicId)

  const state = await loadTopicResearchJudgmentState(topicId)
  const next = upsertResearchJudgmentsInState(state, extracted)
  await saveTopicResearchJudgmentState(next)
  return next
}

export function collectResearchJudgmentContext(
  state: TopicResearchJudgmentState,
  options?: {
    subjectType?: GenerationSubjectType
    subjectId?: string
    limit?: number
  },
): ResearchJudgmentContext {
  const limit = options?.limit ?? 8
  const scopeId = options?.subjectId ? normalizeGenerationScopeId(options.subjectId) : null

  const ordered = state.judgments
    .map((judgment) => ({
      ...judgment,
      updatedAt: judgment.reinforcedAt ?? judgment.createdAt,
    }))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))

  const sameScopeJudgments = (
    scopeId && options?.subjectType
      ? ordered.filter(
          (judgment) =>
            judgment.subjectType === options.subjectType && judgment.scopeId === scopeId,
        )
      : []
  ).slice(0, Math.max(4, Math.min(limit, 8)))

  const researchJudgments = (
    scopeId && options?.subjectType
      ? ordered.filter(
          (judgment) =>
            !(judgment.subjectType === options.subjectType && judgment.scopeId === scopeId),
        )
      : ordered
  )
    .slice(0, limit)
    .map((judgment) => ({
      id: judgment.id,
      kind: judgment.kind,
      confidence: judgment.confidence,
      content: judgment.content,
      subjectType: judgment.subjectType,
      scopeId: judgment.scopeId,
      sourceTemplateId: judgment.sourceTemplateId,
      updatedAt: judgment.updatedAt,
      supersededBy: judgment.supersededBy,
      contradictsWith: judgment.contradictsWith,
    }))

  const mappedSameScope = sameScopeJudgments.map((judgment) => ({
    id: judgment.id,
    kind: judgment.kind,
    confidence: judgment.confidence,
    content: judgment.content,
    subjectType: judgment.subjectType,
    scopeId: judgment.scopeId,
    sourceTemplateId: judgment.sourceTemplateId,
    updatedAt: judgment.updatedAt,
    supersededBy: judgment.supersededBy,
    contradictsWith: judgment.contradictsWith,
  }))

  const allForInsights = [...mappedSameScope, ...researchJudgments]
  const evolutionChains = buildEvolutionChains(ordered, 6)

  return {
    researchJudgments,
    sameScopeJudgments: mappedSameScope,
    judgmentLedger: uniqueStrings(
      allForInsights
        .filter((judgment) => judgment.kind !== 'open-question' && judgment.kind !== 'error-correction')
        .map((judgment) => judgment.content),
      12,
    ),
    openQuestions: uniqueStrings(
      allForInsights
        .filter((judgment) => judgment.kind === 'open-question')
        .map((judgment) => judgment.content),
      10,
    ),
    reviewerWatchpoints: uniqueStrings(
      allForInsights
        .filter((judgment) => judgment.kind === 'error-correction')
        .map((judgment) => judgment.content),
      10,
    ),
    evidenceWatchpoints: uniqueStrings(
      allForInsights
        .filter((judgment) => judgment.kind === 'method-note' || judgment.kind === 'comparison')
        .map((judgment) => judgment.content),
      10,
    ),
    continuityThreads: uniqueStrings(
      allForInsights
        .filter((judgment) => judgment.kind === 'finding' || judgment.kind === 'claim')
        .map((judgment) => judgment.content),
      10,
    ),
    evolutionChains,
  }
}

export function mergeGenerationMemoryContext(
  base: GenerationMemoryContext,
  judgmentContext: ResearchJudgmentContext,
  artifactContext: {
    artifactIndex: GenerationArtifactContextEntry[]
  } = {
    artifactIndex: [],
  },
): GenerationMemoryContext & {
  researchJudgments: ResearchJudgmentContext['researchJudgments']
  sameScopeJudgments: ResearchJudgmentContext['sameScopeJudgments']
} {
  return {
    ...base,
    artifactIndex: artifactContext.artifactIndex,
    researchJudgments: judgmentContext.researchJudgments,
    sameScopeJudgments: judgmentContext.sameScopeJudgments,
    judgmentLedger: uniqueStrings(
      [...judgmentContext.judgmentLedger, ...base.judgmentLedger],
      12,
    ),
    openQuestions: uniqueStrings(
      [...judgmentContext.openQuestions, ...base.openQuestions],
      10,
    ),
    reviewerWatchpoints: uniqueStrings(
      [...judgmentContext.reviewerWatchpoints, ...base.reviewerWatchpoints],
      10,
    ),
    evidenceWatchpoints: uniqueStrings(
      [...judgmentContext.evidenceWatchpoints, ...base.evidenceWatchpoints],
      10,
    ),
    continuityThreads: uniqueStrings(
      [...judgmentContext.continuityThreads, ...base.continuityThreads],
      10,
    ),
    evolutionChains: uniqueStrings(
      [...judgmentContext.evolutionChains, ...base.evolutionChains],
      6,
    ),
  }
}

export async function collectTopicGenerationContext(
  topicId: string,
  memory: TopicGenerationMemory,
  options?: {
    subjectType?: GenerationSubjectType
    subjectId?: string
    limit?: number
  },
) {
  const [baseContext, judgmentState, artifactState] = await Promise.all([
    Promise.resolve(collectGenerationMemoryContext(memory, options)),
    loadTopicResearchJudgmentState(topicId),
    loadTopicArtifactIndex(topicId),
  ])

  const judgmentContext = collectResearchJudgmentContext(judgmentState, options)
  const artifactContext = collectTopicArtifactIndexContext(artifactState, options)
  return mergeGenerationMemoryContext(baseContext, judgmentContext, artifactContext)
}

export const __testing = {
  extractResearchJudgmentsFromPass,
  upsertResearchJudgmentsInState,
  collectResearchJudgmentContext,
  mergeGenerationMemoryContext,
  normalizeJudgmentContent,
}
