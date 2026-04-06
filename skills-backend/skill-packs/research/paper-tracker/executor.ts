import type { ArtifactManager, SkillContext, SkillInput, SkillOutput } from '../../../engine/contracts.ts'
import { prisma } from '../../../shared/db.ts'
import { researchMemory } from '../../../shared/research-memory.ts'
import { getTopicDefinition } from '../../../topic-config/index.ts'
import { omniGateway } from '../../../src/services/omni/gateway.ts'

interface PaperTrackerInput {
  topicId: string
  branchId?: string
  stageIndex?: number
  stageMode?: 'next-stage' | 'current' | 'recalibrate'
  discoverySource?: 'external-only' | 'internal-only' | 'hybrid'
  providerId?: string
  model?: string
  temperature?: number
  maxTokens?: number
  windowMonths?: number
  maxCandidates?: number
  mode?: 'dry-run' | 'inspect' | 'commit'
  allowMerge?: boolean
}

interface TopicDefinitionLike {
  id: string
  nameZh: string
  nameEn: string
  focusLabel: string
  queryTags: string[]
  problemPreference: string[]
  defaults: {
    bootstrapWindowDays: number
    maxCandidates: number
  }
}

interface ArxivPaper {
  id: string
  title: string
  titleZh?: string
  summary: string
  authors: string[]
  published: string
  categories: string[]
  primaryCategory?: string
  pdfUrl?: string
  arxivUrl: string
  discoverySource?: 'arxiv-api' | 'openalex'
}

interface PaperCandidate {
  paperId: string
  sourcePaperId?: string
  title: string
  titleZh?: string
  published: string
  authors: string[]
  candidateType: 'direct' | 'branch' | 'transfer'
  confidence: number
  status: 'admitted' | 'rejected'
  why: string
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
  earliestWindowMonths?: number
  branchId?: string
  stageIndex?: number
  mergeTargetBranchIds?: string[]
  queryHits?: string[]
  discoveryChannels?: string[]
  arxivData?: ArxivPaper
}

type LlmPaperEvaluation = {
  verdict: 'admit' | 'reject'
  candidateType: 'direct' | 'branch' | 'transfer'
  confidence: number
  citeIntent: 'supporting' | 'contrasting' | 'method-using' | 'background'
  why: string
}

type ParsedPaperEvaluation = {
  evaluation: LlmPaperEvaluation
  source: 'json' | 'lines' | 'text'
}

type TopicRecord = Awaited<ReturnType<typeof loadTopicRecord>>

type TopicCreationSeed = {
  sourceDescription?: string
  descriptionEn?: string
  sourceLanguage?: string
  anchorDescriptions?: Record<string, string>
  descriptionByLanguage?: Record<string, string>
  preview?: {
    nameEn?: string
    focusLabelEn?: string
    keywords?: Array<{
      zh?: string
      en?: string
    }>
  }
}

const DISCOVERY_QUERY_LIMIT = 4
const DISCOVERY_QUERY_CACHE_TTL_MS = 30 * 60 * 1000
const PAPER_EVALUATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const DISCOVERY_QUERY_DELAY_MS = 1200
const ARXIV_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000
const ARXIV_FETCH_TIMEOUT_MS = 15_000
const OPENALEX_FETCH_TIMEOUT_MS = 15_000

const ENGLISH_DISCOVERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'by',
  'for',
  'from',
  'with',
  'how',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'this',
  'that',
  'to',
  'topic',
  'topics',
  'research',
  'tracking',
  'trace',
  'study',
  'studies',
  'system',
  'question',
  'questions',
  'problem',
  'problems',
  'stage',
  'stages',
  'create',
  'build',
  'sustained',
  'long',
  'horizon',
  'active',
  'current',
  'mainline',
  'paper',
  'papers',
  'tracker',
  'tracking',
  'follow',
  'following',
  'focus',
  'focusing',
  'prioritize',
  'prioritizing',
  'distinguish',
  'distinguishing',
  'explicit',
  'judgment',
  'judgments',
  'evidence',
  'aware',
  'structure',
  'listing',
  'listings',
  'clarify',
  'clarifying',
  'advance',
  'advancing',
  'real',
  'really',
  'truly',
  'round',
  'next',
  'continue',
  'continued',
  'mechanism',
  'mechanisms',
])

const GENERIC_DISCOVERY_TERMS = new Set([
  'arxiv-api',
  'introduction',
  'problem',
  'problem framing',
  'summary',
  'overview',
  'conclusion',
  'background',
  'problem statement',
  '问题提出',
  '研究背景',
  '背景',
  '总结',
  '结论',
  '阶段',
])

const discoveryQueryCache = new Map<string, { cachedAt: number; papers: ArxivPaper[] }>()
const paperEvaluationCache = new Map<string, { cachedAt: number; evaluation: LlmPaperEvaluation }>()

let arxivRateLimitedUntil = 0

function clipText(value: string | null | undefined, maxLength = 180) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function uniqueNonEmpty(values: Array<string | null | undefined>, limit = 12) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value?.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return value
      .split(/[，,、/|]/u)
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

function extractArxivId(value: string | null | undefined) {
  if (!value) return null
  const match = value.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/iu)
  return match?.[1] ?? null
}

function expandSearchTerms(value: string | null | undefined) {
  if (!value) return []
  const normalized = value.trim()
  if (!normalized) return []

  return uniqueNonEmpty(
    [
      normalized,
      ...normalized.split(/[，,、/|]/u).map((item) => item.trim()),
    ],
    6,
  )
}

function normalizeDiscoveryTerm(value: string | null | undefined) {
  return value
    ?.replace(/\b(?:19|20)\d{2}\b/gu, ' ')
    ?.replace(/\s+/gu, ' ')
    .replace(/[“”"'`]+/gu, '')
    .trim()
}

function isArxivCategoryLikeTerm(value: string) {
  const lower = value.toLowerCase()
  return (
    /^(?:[a-z]{2,}|\w{2,})\.[A-Za-z]{2,}$/u.test(value) ||
    /^(?:hep|astro|cond|nucl|q-bio|q-fin|stat|math)(?:-[a-z]+)?$/u.test(lower)
  )
}

function isGenericStageLabel(value: string) {
  return /^stage\s*\d+$/iu.test(value) || /^第?\s*\d+\s*阶段$/u.test(value)
}

function isNoisyDiscoveryTerm(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)
  if (!normalized) return true

  const lower = normalized.toLowerCase()
  const tokenCount = tokenizeSearchText(normalized).length
  const yearlessTokenCount = tokenizeSearchText(normalized).filter(
    (token) => !/^(?:19|20)\d{2}$/u.test(token),
  ).length
  if (normalized.length < 4 && !/[\u4e00-\u9fff]{2,}/u.test(normalized)) return true
  if (normalized.length > 72) return true
  if (tokenCount > 8) return true
  if ((normalized.match(/\b(?:19|20)\d{2}\b/gu)?.length ?? 0) > 0 && yearlessTokenCount < 3) return true
  if (GENERIC_DISCOVERY_TERMS.has(lower)) return true
  if (isGenericStageLabel(lower)) return true
  if (isArxivCategoryLikeTerm(lower)) return true
  if (/^(section|figure|table|formula)\b/iu.test(lower)) return true

  return false
}

function extractDiscoveryTerms(value: string | null | undefined, limit = 4) {
  if (!value) return []

  const normalized = normalizeDiscoveryTerm(value)
  if (!normalized) return []

  const sentences = normalized
    .split(/[\n;；。！？!?]/u)
    .map((item) => normalizeDiscoveryTerm(item))
    .filter((item): item is string => Boolean(item))

  return uniqueNonEmpty(
    [normalized, ...sentences]
      .map((item) => clipText(item, 96))
      .filter((item) => !isNoisyDiscoveryTerm(item)),
    limit,
  )
}

function sanitizeDiscoveryTerms(
  values: Array<string | null | undefined>,
  limit = DISCOVERY_QUERY_LIMIT,
) {
  return uniqueNonEmpty(
    values.flatMap((value) => extractDiscoveryTerms(value, 3)),
    limit,
  )
}

function tokenizeSearchText(value: string) {
  return value.toLowerCase().match(/[\p{Letter}\p{Number}]{2,}|[\u4e00-\u9fff]{2,}/gu) ?? []
}

function buildQueryPhrases(query: string, limit = 6) {
  const tokens = tokenizeSearchText(query)
  if (tokens.length < 2) return []

  const phrases: string[] = []
  for (const length of [Math.min(3, tokens.length), 2]) {
    for (let index = 0; index <= tokens.length - length; index += 1) {
      phrases.push(tokens.slice(index, index + length).join(' '))
    }
  }

  return uniqueNonEmpty(phrases, limit)
}

function buildPaperSearchText(paper: ArxivPaper) {
  return `${paper.title} ${paper.summary} ${paper.categories.join(' ')}`.toLowerCase()
}

function queryMatchScore(query: string, text: string) {
  const normalizedQuery = query.toLowerCase()
  if (text.includes(normalizedQuery)) return 1

  const tokens = tokenizeSearchText(query)
  if (tokens.length === 0) return 0

  const matched = tokens.filter((token) => text.includes(token)).length
  let score = matched / tokens.length

  const phrases = buildQueryPhrases(query)
  if (phrases.length > 0) {
    const matchedPhrases = phrases.filter((phrase) => text.includes(phrase)).length
    score = score * 0.55 + (matchedPhrases / phrases.length) * 0.45
  }

  if (normalizedQuery.includes('world model') && !text.includes('world model')) {
    score *= 0.4
  }

  if (
    normalizedQuery.includes('autonomous driving') &&
    !text.includes('autonomous driving') &&
    !text.includes('self driving') &&
    !text.includes('self-driving')
  ) {
    score *= 0.7
  }

  return score
}

function collectMatchedQueries(paper: ArxivPaper, queries: string[], limit = 3) {
  const paperText = buildPaperSearchText(paper)
  return queries
    .map((query) => ({
      query,
      score: queryMatchScore(query, paperText),
    }))
    .filter((item) => item.score >= 0.6)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.query)
    .slice(0, limit)
}

function scorePaperDiscoveryFit(paper: ArxivPaper, topicDef: TopicDefinitionLike, queries: string[]) {
  const paperText = buildPaperSearchText(paper)
  const titleText = `${paper.title} ${paper.titleZh ?? ''}`.toLowerCase()
  const matchedQueries = collectMatchedQueries(paper, queries, queries.length)
  const queryScore =
    queries.length > 0
      ? matchedQueries.reduce((sum, query) => sum + queryMatchScore(query, paperText), 0) /
        queries.length
      : 0

  const focusTokens = tokenizeSearchText(topicDef.focusLabel)
  const focusScore =
    focusTokens.length > 0
      ? focusTokens.filter((token) => titleText.includes(token)).length / focusTokens.length
      : 0

  const paperAgeDays = Math.max(
    0,
    Math.round((Date.now() - Date.parse(paper.published)) / (24 * 60 * 60 * 1000)),
  )
  const freshnessScore = Math.max(0, 1 - paperAgeDays / 365)

  return queryScore * 0.6 + focusScore * 0.25 + freshnessScore * 0.15
}

function isRateLimitError(error: unknown) {
  return error instanceof Error && /\b429\b/u.test(error.message)
}

async function loadTopicRecord(topicId: string) {
  return (prisma as any).topic.findUnique({
    where: { id: topicId },
    include: {
      papers: {
        orderBy: { published: 'desc' },
        take: 20,
      },
      nodes: {
        orderBy: { updatedAt: 'desc' },
        take: 20,
      },
      stages: {
        orderBy: { order: 'asc' },
      },
    },
  })
}

async function loadTopicCreationSeed(topicId: string): Promise<TopicCreationSeed | null> {
  const record = await (prisma as any).systemConfig.findUnique({
    where: { key: `topic:${topicId}:creation` },
  })

  if (!record?.value) return null

  try {
    const parsed = JSON.parse(record.value) as TopicCreationSeed
    return typeof parsed === 'object' && parsed ? parsed : null
  } catch {
    return null
  }
}

function hasLatinSignal(value: string | null | undefined) {
  return /[A-Za-z]{3,}/u.test(value ?? '')
}

function hasCjkSignal(value: string | null | undefined) {
  return /[\u4e00-\u9fff]/u.test(value ?? '')
}

function looksGenericTopicSeed(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)?.toLowerCase()
  if (!normalized) return true

  return (
    normalized.startsWith('create a sustained research topic') ||
    normalized.startsWith('build a long-horizon topic') ||
    normalized.startsWith('please') ||
    normalized.startsWith('请') ||
    normalized === 'create' ||
    normalized === 'research topic'
  )
}

function cleanEnglishDiscoverySegment(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)
  if (!normalized) return ''

  return (
    normalizeDiscoveryTerm(
      normalized
        .replace(
          /\b(?:build|create|establish|craft|follow|track|study|research|topic|topics|tracker|tracking|sustained|long-horizon|long horizon|long-term|persistent|distinguish|prioritize|compare|clarify|focus(?:ing)?(?: on)?|separate|between|across|over|while|where|what|which|that|this|these|those|current|next|round|stage|phase|mainline|paper|papers|listing|listings|explicit|judgment|judgments|evidence-aware|evidence|node|nodes|structure|structures|support|supported|advance|advances|advancing)\b/giu,
          ' ',
        )
        .replace(/[()[\]{}"'`]+/gu, ' '),
    ) ?? ''
  )
}

function isInstructionLikeDiscoveryTerm(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)?.toLowerCase()
  if (!normalized) return true

  return /\b(?:stage|phase|round|current|next|advance|advancing|clarify|clarifying|distinguish|distinguishing|prioritize|prioritizing|explicit|judgment|judgments|evidence-aware|node structure|paper listing|paper listings|continue|continued|truly|really|real|problem framing|core mechanisms|evidence expansion|comparative tensions)\b/u.test(
    normalized,
  )
}

function isExternalDiscoveryQueryCandidate(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)
  if (!normalized) return false
  if (isNoisyDiscoveryTerm(normalized)) return false
  if (hasCjkSignal(normalized)) return false
  if (isInstructionLikeDiscoveryTerm(normalized)) return false

  const latinTokens = normalized.match(/[A-Za-z0-9-]{2,}/gu) ?? []
  const tokenCount = tokenizeSearchText(normalized).length
  if (latinTokens.length < 2) return false
  if (tokenCount > 6 && /[,;:]/u.test(normalized)) return false

  return true
}

function buildEnglishDiscoverySegments(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)
  if (!normalized || !hasLatinSignal(normalized)) return []

  const sentenceSegments = normalized
    .split(/[\n.;:!?]/u)
    .map((segment) => segment.trim())
    .filter(Boolean)

  return uniqueNonEmpty(
    sentenceSegments.flatMap((segment) => {
      const cleaned = cleanEnglishDiscoverySegment(segment)
      if (!cleaned) return []

      const listSegments = cleaned
        .split(/,|\/|\band\b/iu)
        .map((item) => normalizeDiscoveryTerm(item))
        .filter((item): item is string => Boolean(item))

      return [cleaned, ...listSegments]
    }),
    16,
  )
}

function extractEnglishDiscoveryPhrases(value: string | null | undefined, limit = 6) {
  if (!value || !hasLatinSignal(value)) return []

  const phrases: string[] = []
  const segments = buildEnglishDiscoverySegments(value)

  for (const segment of segments) {
    const tokens = tokenizeSearchText(segment)
      .map((token) => token.trim())
      .filter(
        (token) =>
          /^[a-z0-9-]+$/iu.test(token) &&
          token.length >= 3 &&
          !/^(?:19|20)\d{2}$/u.test(token) &&
          !ENGLISH_DISCOVERY_STOPWORDS.has(token.toLowerCase()) &&
          !GENERIC_DISCOVERY_TERMS.has(token.toLowerCase()),
      )

    if (tokens.length < 2) continue

    const exactSegment = tokens.slice(0, Math.min(tokens.length, 5)).join(' ')
    if (isExternalDiscoveryQueryCandidate(exactSegment)) {
      phrases.push(exactSegment)
    }

    for (const length of [4, 3, 2]) {
      for (let index = 0; index <= tokens.length - length; index += 1) {
        const phrase = tokens.slice(index, index + length).join(' ')
        if (!isExternalDiscoveryQueryCandidate(phrase)) continue
        phrases.push(phrase)
        if (phrases.length >= limit * 3) {
          return uniqueNonEmpty(phrases, limit)
        }
      }
    }
  }

  return uniqueNonEmpty(phrases, limit)
}

function scoreDiscoveryTermSpecificity(value: string) {
  const normalized = normalizeDiscoveryTerm(value) ?? ''
  const lower = normalized.toLowerCase()
  const tokenCount = tokenizeSearchText(normalized).length
  let score = tokenCount * 6 + Math.min(normalized.length, 48) / 6

  if (/\bworld model\b/u.test(lower)) score += 18
  if (/\bautonomous driving\b|\bself-driving\b|\bself driving\b/u.test(lower)) score += 10
  if (
    /\bclosed-loop\b|\bsimulation\b|\blatent dynamics\b|\bvideo generation\b|\bplanning\b|\bsafety\b/u.test(
      lower,
    )
  ) {
    score += 6
  }

  if (isNoisyDiscoveryTerm(normalized)) score -= 40
  return score
}

function compactDiscoveryTerms(values: string[], limit: number) {
  const sorted = [...uniqueNonEmpty(values, limit * 3)].sort(
    (left, right) => scoreDiscoveryTermSpecificity(right) - scoreDiscoveryTermSpecificity(left),
  )
  const kept: string[] = []

  for (const term of sorted) {
    const lower = term.toLowerCase()
    const tokenCount = tokenizeSearchText(term).length
    const subsumed = kept.some((existing) => {
      const existingLower = existing.toLowerCase()
      const existingTokenCount = tokenizeSearchText(existing).length
      return (
        existingLower !== lower &&
        existingLower.includes(lower) &&
        existingTokenCount >= tokenCount + 1
      )
    })

    if (subsumed) continue
    kept.push(term)
    if (kept.length >= limit) break
  }

  return kept
}

function prioritizeExternalDiscoveryTerms(
  values: Array<string | null | undefined>,
  limit = DISCOVERY_QUERY_LIMIT,
) {
  const expanded = uniqueNonEmpty(
    values.flatMap((value) => [
      ...extractEnglishDiscoveryPhrases(value, 6),
      ...extractDiscoveryTerms(value, 3),
    ]),
    limit * 3,
  )

  const english = expanded.filter((value) => isExternalDiscoveryQueryCandidate(value))
  const safeFallback = expanded.filter(
    (value) =>
      !hasCjkSignal(value) &&
      !isNoisyDiscoveryTerm(value) &&
      !isInstructionLikeDiscoveryTerm(value),
  )
  return compactDiscoveryTerms(english.length > 0 ? english : safeFallback, limit)
}

async function loadTopicKeywordHints(topicId: string, creationSeed: TopicCreationSeed | null) {
  const record = await (prisma as any).systemConfig.findUnique({
    where: { key: `topic:${topicId}:keywords` },
  })

  const storedKeywords =
    record?.value && typeof record.value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(record.value) as Array<{
              en?: string
              localized?: Record<string, string>
            }>
            return Array.isArray(parsed)
              ? parsed.flatMap((keyword) => [keyword.en, keyword.localized?.en])
              : []
          } catch {
            return []
          }
        })()
      : []

  const previewKeywords = creationSeed?.preview?.keywords?.flatMap((keyword) => [
    keyword.en,
    keyword.zh,
  ])

  return uniqueNonEmpty(
    [...storedKeywords, ...(previewKeywords ?? [])].filter((value) => hasLatinSignal(value)),
    10,
  )
}

function selectDiscoveryAnchor(values: Array<string | null | undefined>) {
  const candidates = prioritizeExternalDiscoveryTerms(values, 6)
  if (candidates.length === 0) return ''

  return (
    candidates.find((value) =>
      /\b(?:model|models|agent|agents|simulation|planning|system|systems|reasoning|retrieval|alignment|robotics|materials|vision|language|diffusion|world)\b/iu.test(
        value,
      ),
    ) ?? candidates[0]
  )
}

function tokenizeLowerText(value: string) {
  return tokenizeSearchText(value).map((token) => token.toLowerCase())
}

function discoveryTermsOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenizeLowerText(left))
  const rightTokens = tokenizeLowerText(right)
  if (leftTokens.size === 0 || rightTokens.length === 0) return 0
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length
  return overlap / Math.max(leftTokens.size, rightTokens.length)
}

function buildDiscoveryQueries(baseAnchor: string, modifierTerms: string[], limit = DISCOVERY_QUERY_LIMIT) {
  const normalizedAnchor = normalizeDiscoveryTerm(baseAnchor)
  const queries: string[] = []

  if (isExternalDiscoveryQueryCandidate(normalizedAnchor)) {
    queries.push(normalizedAnchor)
  }

  for (const modifier of modifierTerms) {
    const normalizedModifier = normalizeDiscoveryTerm(modifier)
    if (!isExternalDiscoveryQueryCandidate(normalizedModifier)) continue

    if (normalizedAnchor && discoveryTermsOverlap(normalizedAnchor, normalizedModifier) >= 0.75) {
      continue
    }

    const combined = normalizedAnchor ? `${normalizedModifier} ${normalizedAnchor}` : normalizedModifier
    const query =
      isExternalDiscoveryQueryCandidate(combined) && combined.length <= 72
        ? combined
        : normalizedModifier

    queries.push(query)
    if (queries.length >= limit * 2) break
  }

  return compactDiscoveryTerms(queries.filter((query) => isExternalDiscoveryQueryCandidate(query)), limit)
}

async function resolveTopicDefinition(topicId: string, topic: NonNullable<TopicRecord>): Promise<TopicDefinitionLike> {
  const creationSeed = await loadTopicCreationSeed(topicId)
  const topicKeywordHints = await loadTopicKeywordHints(topicId, creationSeed)
  const paperTags = topic.papers.flatMap((paper: any) => parseJsonStringArray(paper.tags)).slice(0, 8)
  const creationEnglishHints = [
    creationSeed?.preview?.nameEn,
    creationSeed?.preview?.focusLabelEn,
    creationSeed?.descriptionByLanguage?.en,
    creationSeed?.anchorDescriptions?.en,
    creationSeed?.descriptionEn,
    creationSeed?.sourceLanguage === 'en' ? creationSeed?.sourceDescription : null,
  ]

  const mergedQueryTags = prioritizeExternalDiscoveryTerms(
    [
      ...creationEnglishHints,
      ...topicKeywordHints,
      topic.nameEn,
      topic.focusLabel,
      clipText(topic.summary, 96),
      clipText(topic.description, 96),
      ...paperTags,
    ],
    6,
  )
  const mergedProblemPreference = prioritizeExternalDiscoveryTerms(
    [
      ...creationEnglishHints,
      ...topicKeywordHints,
      topic.focusLabel,
      clipText(topic.summary, 96),
      clipText(topic.description, 96),
      ...paperTags,
    ],
    4,
  )
  const mergedFocusLabel = [
    topic.focusLabel,
    creationSeed?.descriptionByLanguage?.en,
    creationSeed?.anchorDescriptions?.en,
    creationSeed?.descriptionEn,
    topic.nameEn,
    topic.nameZh,
  ].find((value) => value && !looksGenericTopicSeed(value)) || topic.focusLabel || topic.nameEn || topic.nameZh || topic.id

  try {
    const staticTopic = getTopicDefinition(topicId)
    return {
      id: staticTopic.id,
      nameZh: staticTopic.nameZh,
      nameEn: staticTopic.nameEn,
      focusLabel: looksGenericTopicSeed(staticTopic.focusLabel) ? mergedFocusLabel : staticTopic.focusLabel,
      queryTags:
        mergedQueryTags.length > 0
          ? uniqueNonEmpty([...mergedQueryTags, ...staticTopic.queryTags], 6)
          : staticTopic.queryTags,
      problemPreference:
        mergedProblemPreference.length > 0
          ? uniqueNonEmpty([...mergedProblemPreference, ...staticTopic.problemPreference], 4)
          : staticTopic.problemPreference,
      defaults: {
        bootstrapWindowDays: staticTopic.defaults.bootstrapWindowDays,
        maxCandidates: staticTopic.defaults.maxCandidates,
      },
    }
  } catch {
    const paperTags = topic.papers.flatMap((paper: any) => parseJsonStringArray(paper.tags)).slice(0, 8)

    return {
      id: topic.id,
      nameZh: topic.nameZh || topic.nameEn || topic.id,
      nameEn: topic.nameEn || topic.nameZh || topic.id,
      focusLabel: mergedFocusLabel,
      queryTags:
        mergedQueryTags.length > 0
          ? mergedQueryTags
          : sanitizeDiscoveryTerms(
              [
                topic.nameEn,
                topic.nameZh,
                topic.focusLabel,
                clipText(topic.summary, 96),
                clipText(topic.description, 96),
                ...topicKeywordHints,
                ...paperTags,
              ],
              6,
            ),
      problemPreference:
        mergedProblemPreference.length > 0
          ? mergedProblemPreference
          : sanitizeDiscoveryTerms(
              [
                topic.focusLabel,
                clipText(topic.summary, 96),
                clipText(topic.description, 96),
                ...topicKeywordHints,
                ...paperTags,
              ],
              4,
            ),
      defaults: {
        bootstrapWindowDays: 180,
        maxCandidates: 8,
      },
    }
  }
}

function buildDiscoveryPlan(args: {
  topic: NonNullable<TopicRecord>
  topicDef: TopicDefinitionLike
  input: PaperTrackerInput
  targetStageIndex: number
}) {
  const anchorPapers = args.topic.papers
    .slice(0, 5)
    .map((paper: any) => extractArxivId(paper.arxivUrl) || paper.id)

  const baseAnchor = selectDiscoveryAnchor([
    args.topicDef.nameEn,
    args.topic.nameEn,
    args.topicDef.focusLabel,
    args.topic.focusLabel,
    ...args.topicDef.queryTags,
  ])
  const modifierTerms = prioritizeExternalDiscoveryTerms(
    [
      ...args.topicDef.problemPreference,
      ...args.topicDef.queryTags,
    ],
    DISCOVERY_QUERY_LIMIT * 2,
  )
  const queries = buildDiscoveryQueries(baseAnchor, modifierTerms, DISCOVERY_QUERY_LIMIT)

  const windowMonths =
    args.input.windowMonths ??
    Math.max(1, Math.round((args.topicDef.defaults.bootstrapWindowDays || 180) / 30))

  return {
    topicId: args.topic.id,
    branchId: args.input.branchId,
    stageIndex: args.targetStageIndex,
    discoveryRounds: 1,
    queries:
      queries.length > 0
        ? queries
        : buildDiscoveryQueries(
            selectDiscoveryAnchor([args.topic.nameEn, args.topicDef.focusLabel, args.topic.focusLabel]),
            prioritizeExternalDiscoveryTerms([args.topicDef.focusLabel, args.topic.nameEn], 4),
            2,
          ),
    anchorPapers,
    windowMonths,
    maxCandidates: args.input.maxCandidates || args.topicDef.defaults.maxCandidates || 8,
    discoverySource: args.input.discoverySource || 'external-only',
  }
}

function parseArxivEntries(xmlText: string, startDate: Date, endDate: Date) {
  const papers: ArxivPaper[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g

  for (let match = entryRegex.exec(xmlText); match !== null; match = entryRegex.exec(xmlText)) {
    const entry = match[1]
    const idMatch = entry.match(/<id>(.*?)<\/id>/)
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/)
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/)
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/)

    if (!idMatch || !titleMatch || !publishedMatch) continue

    const published = new Date(publishedMatch[1])
    if (published < startDate || published > endDate) continue

    const authors: string[] = []
    const authorRegex = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g
    for (let authorMatch = authorRegex.exec(entry); authorMatch !== null; authorMatch = authorRegex.exec(entry)) {
      authors.push(authorMatch[1])
    }

    const categories: string[] = []
    const categoryRegex = /<category term="(.*?)"/g
    for (
      let categoryMatch = categoryRegex.exec(entry);
      categoryMatch !== null;
      categoryMatch = categoryRegex.exec(entry)
    ) {
      categories.push(categoryMatch[1])
    }

    const pdfMatch = entry.match(/<link title="pdf" href="(.*?)"/)
    const arxivUrl = idMatch[1]

    papers.push({
      id: arxivUrl.split('/').pop() || arxivUrl,
      title: titleMatch[1].replace(/\s+/gu, ' ').trim(),
      summary: summaryMatch ? summaryMatch[1].replace(/\s+/gu, ' ').trim() : '',
      authors,
      published: publishedMatch[1],
      categories,
      primaryCategory: categories[0],
      pdfUrl: pdfMatch?.[1],
      arxivUrl,
      discoverySource: 'arxiv-api',
    })
  }

  return papers
}

function buildInvertedAbstract(index: Record<string, number[]> | null | undefined) {
  if (!index || typeof index !== 'object') return ''

  const positionedTokens = Object.entries(index).flatMap(([token, positions]) =>
    Array.isArray(positions)
      ? positions
          .filter((position): position is number => Number.isInteger(position))
          .map((position) => [position, token] as const)
      : [],
  )
  if (positionedTokens.length === 0) return ''

  return positionedTokens
    .sort((left, right) => left[0] - right[0])
    .map(([, token]) => token)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeOpenAlexId(value: string | null | undefined) {
  const normalized = value?.trim()
  if (!normalized) return null
  const tail = normalized.split('/').pop()?.trim()
  return tail ? `openalex:${tail}` : normalized
}

function mapOpenAlexWorkToPaper(work: Record<string, any>): ArxivPaper | null {
  const title = clipText(
    typeof work.display_name === 'string' ? work.display_name : work.title,
    320,
  )
  const published = typeof work.publication_date === 'string' ? work.publication_date : null
  if (!title || !published) return null

  const authors = Array.isArray(work.authorships)
    ? work.authorships
        .map((authorship) => authorship?.author?.display_name)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  const categories = uniqueNonEmpty(
    [
      ...(Array.isArray(work.topics)
        ? work.topics
            .map((topic) => topic?.display_name)
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
      ...(Array.isArray(work.keywords)
        ? work.keywords
            .map((keyword) => keyword?.display_name)
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []),
    ],
    8,
  )
  const summary = clipText(
    buildInvertedAbstract(work.abstract_inverted_index) ||
      (typeof work.primary_topic?.display_name === 'string' ? work.primary_topic.display_name : title),
    2400,
  )
  const landingPage =
    work.primary_location?.landing_page_url ||
    work.doi ||
    work.ids?.doi ||
    work.id
  const pdfUrl =
    work.open_access?.oa_url ||
    work.primary_location?.pdf_url ||
    null

  if (typeof landingPage !== 'string' || !landingPage.trim()) return null

  return {
    id: normalizeOpenAlexId(work.id) || normalizeOpenAlexId(work.ids?.openalex) || landingPage,
    title,
    summary,
    authors,
    published,
    categories,
    primaryCategory: categories[0],
    pdfUrl: typeof pdfUrl === 'string' ? pdfUrl : undefined,
    arxivUrl: landingPage,
    discoverySource: 'openalex',
  }
}

async function searchArxiv(args: {
  query: string
  startDate: Date
  endDate: Date
  maxResults: number
}) {
  const searchQuery = encodeURIComponent(args.query)
  const urls = [
    `http://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=${args.maxResults}&sortBy=submittedDate&sortOrder=descending`,
    `https://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=${args.maxResults}&sortBy=submittedDate&sortOrder=descending`,
  ]

  let lastError: unknown = null

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DailyReportResearch/1.0',
        },
        signal: AbortSignal.timeout(ARXIV_FETCH_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`arXiv API error: ${response.status}`)
      }

      const xmlText = await response.text()
      return parseArxivEntries(xmlText, args.startDate, args.endDate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('arXiv search failed')
}

async function searchOpenAlex(args: {
  query: string
  startDate: Date
  endDate: Date
  maxResults: number
}) {
  const url =
    `https://api.openalex.org/works?search=${encodeURIComponent(args.query)}` +
    `&per-page=${Math.max(3, Math.min(args.maxResults, 25))}` +
    `&filter=from_publication_date:${args.startDate.toISOString().slice(0, 10)},to_publication_date:${args.endDate
      .toISOString()
      .slice(0, 10)}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DailyReportResearch/1.0 (mailto:research@example.com)',
    },
    signal: AbortSignal.timeout(OPENALEX_FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`OpenAlex API error: ${response.status}`)
  }

  const payload = (await response.json()) as { results?: Array<Record<string, any>> }
  return uniqueNonEmpty(
    (payload.results ?? [])
      .map((work) => mapOpenAlexWorkToPaper(work))
      .filter((paper): paper is ArxivPaper => Boolean(paper))
      .map((paper) => JSON.stringify(paper)),
    args.maxResults,
  ).map((paper) => JSON.parse(paper) as ArxivPaper)
}

function filterDiscoveryResults(
  papers: ArxivPaper[],
  topicDef: TopicDefinitionLike,
  queries: string[],
) {
  return papers.filter((paper) => {
    const fitScore = scorePaperDiscoveryFit(paper, topicDef, queries)
    const queryHits = collectMatchedQueries(paper, queries, queries.length)
    const titleText = `${paper.title} ${paper.summary}`.toLowerCase()
    const directTopicFit =
      /\bworld model\b|\bworld models\b/u.test(titleText) &&
      /\bautonomous driving\b|\bself-driving\b|\bself driving\b/u.test(titleText)

    return fitScore >= 0.42 || queryHits.length > 0 || directTopicFit
  })
}

function mergeDiscoveryResults(
  primary: ArxivPaper[],
  fallback: ArxivPaper[],
  topicDef: TopicDefinitionLike,
  queries: string[],
) {
  const merged: ArxivPaper[] = []
  const seen = new Set<string>()

  for (const paper of [...primary, ...fallback]) {
    const key = `${paper.id}::${paper.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(paper)
  }

  return filterDiscoveryResults(merged, topicDef, queries)
}

async function discoverPapers(
  plan: ReturnType<typeof buildDiscoveryPlan>,
  topicDef: TopicDefinitionLike,
  context: SkillContext,
) {
  const discovered: ArxivPaper[] = []
  const seenIds = new Set<string>()
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - plan.windowMonths)

  for (const [index, query] of plan.queries.entries()) {
    const cacheKey = `${query.toLowerCase()}::${startDate.toISOString().slice(0, 10)}::${endDate.toISOString().slice(0, 10)}::${plan.maxCandidates}`
    const cached = discoveryQueryCache.get(cacheKey)
    const cacheFresh =
      cached && Date.now() - cached.cachedAt <= DISCOVERY_QUERY_CACHE_TTL_MS

    if (cacheFresh) {
      for (const paper of cached.papers) {
        if (seenIds.has(paper.id)) continue
        seenIds.add(paper.id)
        discovered.push(paper)
      }
      continue
    }

    if (Date.now() < arxivRateLimitedUntil) {
      context.logger.warn('Skipping arXiv query during cooldown window', {
        query,
        cooldownUntil: new Date(arxivRateLimitedUntil).toISOString(),
      })
    }

    let results: ArxivPaper[] = []
    try {
      if (Date.now() >= arxivRateLimitedUntil) {
        results = await searchArxiv({
          query,
          startDate,
          endDate,
          maxResults: Math.max(6, plan.maxCandidates * 2),
        })
      }
    } catch (error) {
      if (isRateLimitError(error)) {
        arxivRateLimitedUntil = Date.now() + ARXIV_RATE_LIMIT_COOLDOWN_MS
        context.logger.warn('arXiv query rate limited; entering cooldown window', {
          query,
          cooldownMs: ARXIV_RATE_LIMIT_COOLDOWN_MS,
        })
      } else {
        context.logger.warn('arXiv query failed', { query, error })
      }
    }

    results = filterDiscoveryResults(results, topicDef, plan.queries)

    if (results.length < Math.max(4, Math.ceil(plan.maxCandidates / 2))) {
      try {
        const fallbackResults = await searchOpenAlex({
          query,
          startDate,
          endDate,
          maxResults: Math.max(6, plan.maxCandidates * 2),
        })
        results = mergeDiscoveryResults(results, fallbackResults, topicDef, plan.queries)
        if (results.length > 0) {
          context.logger.info('OpenAlex fallback supplied discovery results', {
            query,
            resultCount: results.length,
          })
        }
      } catch (fallbackError) {
        context.logger.warn('OpenAlex fallback failed', { query, error: fallbackError })
      }
    }

    discoveryQueryCache.set(cacheKey, {
      cachedAt: Date.now(),
      papers: results,
    })

    for (const paper of results) {
      if (seenIds.has(paper.id)) continue
      seenIds.add(paper.id)
      discovered.push(paper)
    }

    if (index < plan.queries.length - 1) {
      await sleep(DISCOVERY_QUERY_DELAY_MS)
    }
  }

  discovered.sort((left, right) => {
    const scoreDiff =
      scorePaperDiscoveryFit(right, topicDef, plan.queries) -
      scorePaperDiscoveryFit(left, topicDef, plan.queries)
    if (scoreDiff !== 0) return scoreDiff
    return Date.parse(right.published) - Date.parse(left.published)
  })
  return discovered.slice(0, Math.max(plan.maxCandidates * 2, 12))
}

function buildExistingPaperKeySet(topic: NonNullable<TopicRecord>) {
  return new Set(
    topic.papers.flatMap((paper: any) =>
      [
        paper.id,
        paper.title,
        paper.titleZh,
        extractArxivId(paper.arxivUrl),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  )
}

function normalizeCandidateType(value: unknown): LlmPaperEvaluation['candidateType'] {
  if (value === 'branch' || value === 'transfer') return value
  return 'direct'
}

function normalizeVerdict(
  value: unknown,
  fallback: LlmPaperEvaluation['verdict'] = 'reject',
): LlmPaperEvaluation['verdict'] {
  if (value === 'admit' || value === 'reject') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered.includes('admit') || lowered.includes('include')) return 'admit'
    if (lowered.includes('reject') || lowered.includes('exclude')) return 'reject'
  }
  return fallback
}

function normalizeCiteIntent(value: unknown): LlmPaperEvaluation['citeIntent'] {
  if (
    value === 'contrasting' ||
    value === 'method-using' ||
    value === 'background'
  ) {
    return value
  }
  return 'supporting'
}

function normalizeConfidence(value: unknown, fallback = 0.5) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value))
  }

  if (typeof value === 'string') {
    const match = value.match(/([01](?:\.\d+)?)/u)
    if (match) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(1, parsed))
      }
    }
  }

  return fallback
}

function parsePaperEvaluationJson(raw: string): LlmPaperEvaluation | null {
  const jsonCandidate =
    raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1] ??
    raw.match(/\{[\s\S]*\}/u)?.[0] ??
    raw

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
    const confidence = normalizeConfidence(parsed.confidence)
    return {
      verdict: normalizeVerdict(parsed.verdict ?? parsed.decision ?? parsed.status, confidence >= 0.62 ? 'admit' : 'reject'),
      candidateType: normalizeCandidateType(parsed.candidateType),
      confidence,
      citeIntent: normalizeCiteIntent(parsed.citeIntent),
      why: clipText(typeof parsed.why === 'string' ? parsed.why : 'LLM evaluation', 220),
    }
  } catch {
    return null
  }
}

function parsePaperEvaluationLines(raw: string): LlmPaperEvaluation | null {
  const lineMap = Object.fromEntries(
    raw
      .split(/\n+/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const match = line.match(/^([a-zA-Z_]+)\s*[:=]\s*(.+)$/u)
        return match ? [[match[1].toLowerCase(), match[2].trim()]] : []
      }),
  ) as Record<string, string>

  if (Object.keys(lineMap).length === 0) return null

  const verdict = (lineMap.verdict || lineMap.decision || '').toLowerCase()
  let confidence = normalizeConfidence(lineMap.confidence, Number.NaN)
  if (!Number.isFinite(confidence)) {
    confidence = verdict === 'admit' ? 0.78 : verdict === 'reject' ? 0.36 : 0.5
  }

  if (verdict === 'admit') {
    confidence = Math.max(confidence, 0.68)
  } else if (verdict === 'reject') {
    confidence = Math.min(confidence, 0.48)
  }

  return {
    verdict: normalizeVerdict(verdict),
    candidateType: normalizeCandidateType(lineMap.candidatetype),
    confidence,
    citeIntent: normalizeCiteIntent(lineMap.citeintent),
    why: clipText(lineMap.why || 'LLM evaluation', 220),
  }
}

function inferPaperEvaluationFromText(raw: string): LlmPaperEvaluation | null {
  const compact = raw.replace(/\s+/gu, ' ').trim()
  if (!compact) return null

  const lower = compact.toLowerCase()
  const verdict =
    /\badmit\b|\binclude\b|\bshould enter\b|\bworth adding\b/u.test(lower)
      ? 'admit'
      : /\breject\b|\bexclude\b|\bnot relevant\b|\bshould not\b/u.test(lower)
        ? 'reject'
        : 'reject'
  const candidateType =
    /\btransfer\b/u.test(lower)
      ? 'transfer'
      : /\bbranch\b/u.test(lower)
        ? 'branch'
        : 'direct'

  const citeIntent =
    /\bmethod(?:-|\s)?using\b/u.test(lower)
      ? 'method-using'
      : /\bcontrast(?:ing)?\b/u.test(lower)
        ? 'contrasting'
        : /\bbackground\b/u.test(lower)
          ? 'background'
          : 'supporting'

  const explicitConfidence =
    compact.match(/confidence[^0-9]{0,16}([01](?:\.\d+)?)/iu)?.[1] ??
    compact.match(/\b([01](?:\.\d+)?)\s*(?:confidence|relevance|score)\b/iu)?.[1]
  let confidence = normalizeConfidence(explicitConfidence, Number.NaN)

  if (!Number.isFinite(confidence)) {
    if (/\bexact match\b|\bdirect match\b|\bhighly relevant\b|\bvery relevant\b|\bstrong fit\b/u.test(lower)) {
      confidence = 0.88
    } else if (/\brelevant\b|\bgood fit\b|\bworth adding\b|\bcentral to the topic\b/u.test(lower)) {
      confidence = 0.74
    } else if (/\bpartial(?:ly)? relevant\b|\bmoderate\b|\bpossible fit\b/u.test(lower)) {
      confidence = 0.58
    } else if (/\bnot relevant\b|\bweak fit\b|\bpoor fit\b|\bshould not\b/u.test(lower)) {
      confidence = 0.32
    } else {
      confidence = 0.5
    }
  }

  const reasonLine =
    compact
      .split(/(?<=[.!?])\s+/u)
      .find((line) =>
        /\bmatch\b|\brelevant\b|\bsupport\b|\bbackground\b|\bmethod\b|\btopic\b/u.test(
          line.toLowerCase(),
        ),
      ) ?? compact

  return {
    verdict,
    candidateType,
    confidence,
    citeIntent,
    why: clipText(reasonLine, 220),
  }
}

function parsePaperEvaluation(raw: string): ParsedPaperEvaluation | null {
  const json = parsePaperEvaluationJson(raw)
  if (json) {
    return {
      evaluation: json,
      source: 'json',
    }
  }

  const lines = parsePaperEvaluationLines(raw)
  if (lines) {
    return {
      evaluation: lines,
      source: 'lines',
    }
  }

  const text = inferPaperEvaluationFromText(raw)
  if (text) {
    return {
      evaluation: text,
      source: 'text',
    }
  }

  return null
}

function looksMetaEvaluation(
  raw: string,
  parsed: LlmPaperEvaluation,
  source: ParsedPaperEvaluation['source'],
) {
  if (source !== 'text') {
    return false
  }

  const combined = `${raw}\n${parsed.why}`.toLowerCase()
  return (
    /\bthe user wants me to classify\b/u.test(combined) ||
    /\bi should classify\b/u.test(combined) ||
    /\bi need to classify\b/u.test(combined) ||
    /\bi will classify\b/u.test(combined) ||
    /\btask is to classify\b/u.test(combined) ||
    /\bpaper classifier\b/u.test(combined) ||
    /\bactive research topic\b/u.test(combined) ||
    /\bspecific research topic\b/u.test(combined) ||
    /\bthis paper should be evaluated\b/u.test(combined)
  )
}

function buildPaperEvaluationPrompt(args: {
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  targetStageIndex: number
}) {
  return [
    'Classify whether this paper should enter the active research topic.',
    'Admit papers when they either advance the mainline directly, widen the evidence base, provide a useful comparison, or transfer a nearby method into the topic.',
    'Use candidateType to express weight: direct = core mainline, branch = adjacent but worth retaining, transfer = cross-domain method that may reshape the topic.',
    'Reject only when the paper is clearly generic, semantically distant, or cannot help the topic in any meaningful way.',
    'When deciding between branch/transfer and reject, prefer branch/transfer if the paper could still help a researcher understand the field better.',
    'Return one strict JSON object only with these exact keys:',
    '{"verdict":"admit|reject","candidateType":"direct|branch|transfer","citeIntent":"supporting|contrasting|method-using|background","confidence":0.0,"why":"brief reason"}',
    'If your gateway cannot preserve JSON, output exactly five plain lines using the same keys in key:value form and nothing else.',
    'Do not mention the user, the task, or your reasoning process.',
    `Topic zh title: ${args.topicDef.nameZh}`,
    `Topic en title: ${args.topicDef.nameEn}`,
    `Topic focus: ${args.topicDef.focusLabel}`,
    `Stage index: ${args.targetStageIndex}`,
    '',
    `Paper title: ${args.paper.title}`,
    `Paper summary: ${clipText(args.paper.summary, 1400)}`,
    `Paper categories: ${args.paper.categories.join(', ')}`,
    `Paper authors: ${args.paper.authors.join(', ')}`,
  ].join('\n')
}

function buildPaperEvaluationRepairPrompt(args: {
  originalPrompt: string
  invalidResponse: string
}) {
  return [
    'Your previous answer was invalid or meta. Re-answer the same classification now.',
    'Output exactly five plain key:value lines and nothing else.',
    'Use this exact key order:',
    'verdict:<admit|reject>',
    'candidateType:<direct|branch|transfer>',
    'citeIntent:<supporting|contrasting|method-using|background>',
    'confidence:<0.00-1.00>',
    'why:<brief reason>',
    'If uncertain, prefer branch or transfer over reject when the paper could still enrich the topic.',
    '',
    'Original classification brief:',
    args.originalPrompt,
    '',
    'Previous invalid answer:',
    clipText(args.invalidResponse, 1200),
  ].join('\n')
}

async function requestPaperEvaluationCompletion(args: {
  prompt: string
  input: PaperTrackerInput
  repair?: boolean
}) {
  const repair = args.repair === true

  return omniGateway.complete({
    task: 'general_chat',
    preferredSlot: 'language',
    messages: [
      {
        role: 'system',
        content: repair
          ? 'You are repairing a paper-classifier output. Output exactly five plain key:value lines with the keys verdict, candidateType, citeIntent, confidence, and why. Never mention the user, the task, or your reasoning process.'
          : 'You are a strict paper classifier. Output valid JSON only with the keys verdict, candidateType, citeIntent, confidence, and why. If JSON is impossible, output exactly five plain key:value lines with those keys and nothing else. Never mention the user, the task, or your reasoning process.',
      },
      {
        role: 'user',
        content: args.prompt,
      },
    ],
    json: repair ? false : true,
    temperature: 0,
    maxTokens: Math.min(args.input.maxTokens ?? (repair ? 160 : 180), repair ? 200 : 240),
  })
}

async function evaluatePaperWithLLM(args: {
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  targetStageIndex: number
  input: PaperTrackerInput
}) {
  const cacheKey = `${args.topicDef.id}:${args.paper.id}`
  const cached = paperEvaluationCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt <= PAPER_EVALUATION_CACHE_TTL_MS) {
    return cached.evaluation
  }

  const prompt = buildPaperEvaluationPrompt({
    paper: args.paper,
    topicDef: args.topicDef,
    targetStageIndex: args.targetStageIndex,
  })
  const response = await requestPaperEvaluationCompletion({
    prompt,
    input: args.input,
  })

  const raw = response.text.trim()
  let parsed = parsePaperEvaluation(raw)

  if (!parsed || looksMetaEvaluation(raw, parsed.evaluation, parsed.source)) {
    const repairResponse = await requestPaperEvaluationCompletion({
      prompt: buildPaperEvaluationRepairPrompt({
        originalPrompt: prompt,
        invalidResponse: raw,
      }),
      input: args.input,
      repair: true,
    })

    const repairedRaw = repairResponse.text.trim()
    parsed = parsePaperEvaluation(repairedRaw)

    if (!parsed) {
      throw new Error(
        `Unable to parse paper evaluation response after repair. initial=${clipText(raw, 140)} repair=${clipText(repairedRaw, 140)}`,
      )
    }

    if (looksMetaEvaluation(repairedRaw, parsed.evaluation, parsed.source)) {
      throw new Error(
        `Paper evaluation returned meta text after repair. initial=${clipText(raw, 140)} repair=${clipText(repairedRaw, 140)}`,
      )
    }
  }

  paperEvaluationCache.set(cacheKey, {
    cachedAt: Date.now(),
    evaluation: parsed.evaluation,
  })

  return parsed.evaluation
}

function calculateSimpleRelevance(
  paper: ArxivPaper,
  topicDef: TopicDefinitionLike,
  queries: string[],
) {
  const paperText = buildPaperSearchText(paper)
  const discoveryScore = scorePaperDiscoveryFit(paper, topicDef, queries)
  const matchedQueries = collectMatchedQueries(paper, queries, queries.length)
  const matchBoost =
    queries.length > 0 ? matchedQueries.length / Math.max(1, queries.length) : 0
  const mainlineTerms = prioritizeExternalDiscoveryTerms(
    [topicDef.focusLabel, ...topicDef.problemPreference],
    6,
  ).filter((term) => tokenizeSearchText(term).length >= 2)
  const strongMainlineHit = mainlineTerms.some((term) => queryMatchScore(term, paperText) >= 0.72)
  const titleText = `${paper.title} ${paper.summary}`.toLowerCase()
  const strongTopicLexicalFit =
    /\bworld model\b|\bworld models\b/u.test(titleText) &&
    /\bautonomous driving\b|\bself-driving\b|\bself driving\b/u.test(titleText)
  const exactTopicHit = matchedQueries.some((query) => queryMatchScore(query, paperText) >= 0.72)

  let score =
    0.06 +
    discoveryScore * 0.52 +
    matchBoost * 0.18 +
    (strongMainlineHit ? 0.2 : 0) +
    (strongTopicLexicalFit ? 0.16 : 0) +
    (exactTopicHit ? 0.08 : 0)
  if (!strongMainlineHit && !strongTopicLexicalFit) {
    score = Math.min(score, exactTopicHit ? 0.68 : 0.58)
  }

  return Math.min(0.92, score)
}

function shouldAdmitCandidate(evaluation: {
  verdict: 'admit' | 'reject'
  candidateType: 'direct' | 'branch' | 'transfer'
  confidence: number
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
}) {
  if (evaluation.verdict === 'admit') {
    return true
  }

  if (evaluation.confidence >= 0.72) {
    return true
  }

  if (
    evaluation.confidence >= 0.56 &&
    (evaluation.candidateType === 'branch' ||
      evaluation.candidateType === 'transfer' ||
      evaluation.citeIntent === 'background' ||
      evaluation.citeIntent === 'contrasting' ||
      evaluation.citeIntent === 'method-using')
  ) {
    return true
  }

  return false
}

async function evaluateCandidates(args: {
  papers: ArxivPaper[]
  topic: NonNullable<TopicRecord>
  topicDef: TopicDefinitionLike
  queries: string[]
  targetStageIndex: number
  input: PaperTrackerInput
  context: SkillContext
}) {
  const existingKeys = buildExistingPaperKeySet(args.topic)
  const candidates: PaperCandidate[] = []

  for (const paper of args.papers) {
    if (existingKeys.has(paper.id) || existingKeys.has(paper.title) || existingKeys.has(paper.titleZh || '')) {
      continue
    }

    try {
      const evaluation = await evaluatePaperWithLLM({
        paper,
        topicDef: args.topicDef,
        targetStageIndex: args.targetStageIndex,
        input: args.input,
      })
      const queryHits = collectMatchedQueries(paper, args.queries)

      candidates.push({
        paperId: paper.id,
        title: paper.title,
        titleZh: paper.titleZh,
        published: paper.published,
        authors: paper.authors,
        candidateType: evaluation.candidateType,
        confidence: evaluation.confidence,
        status: shouldAdmitCandidate(evaluation) ? 'admitted' : 'rejected',
        why: evaluation.why,
        citeIntent: evaluation.citeIntent,
        earliestWindowMonths: args.input.windowMonths ?? 6,
        stageIndex: args.targetStageIndex,
        queryHits,
        discoveryChannels: [paper.discoverySource ?? 'arxiv-api'],
        arxivData: paper,
      })
    } catch (error) {
      args.context.logger.warn('LLM candidate evaluation failed; using heuristic fallback', {
        paperId: paper.id,
        error,
      })

      const confidence = calculateSimpleRelevance(paper, args.topicDef, args.queries)
      const queryHits = collectMatchedQueries(paper, args.queries)
      candidates.push({
        paperId: paper.id,
        title: paper.title,
        titleZh: paper.titleZh,
        published: paper.published,
        authors: paper.authors,
        candidateType: confidence >= 0.72 ? 'direct' : confidence >= 0.56 ? 'branch' : 'transfer',
        confidence,
        status: confidence >= 0.56 ? 'admitted' : 'rejected',
        why: 'Keyword overlap fallback',
        citeIntent: confidence >= 0.72 ? 'supporting' : 'background',
        earliestWindowMonths: args.input.windowMonths ?? 6,
        stageIndex: args.targetStageIndex,
        queryHits,
        discoveryChannels: [paper.discoverySource ?? 'arxiv-api'],
        arxivData: paper,
      })
    }
  }

  candidates.sort((left, right) => right.confidence - left.confidence)
  return candidates
}

function determineBranchAction(candidates: PaperCandidate[], allowMerge = true) {
  const admittedCount = candidates.filter((candidate) => candidate.status === 'admitted').length
  if (allowMerge && admittedCount >= 8) {
    return {
      action: 'split' as const,
      rationale: `Admitted ${admittedCount} papers in one batch, so the stage likely needs a dedicated branch.`,
      selectedBranch: {
        id: `branch-${Date.now()}`,
        name: `Stage branch (${admittedCount})`,
        paperCount: admittedCount,
      },
    }
  }

  return {
    action: 'stay' as const,
    rationale:
      admittedCount <= 2
        ? `Only ${admittedCount} papers were admitted, so the current branch should continue consolidating.`
        : `Admitted ${admittedCount} papers, but the branch structure can remain stable for now.`,
    selectedBranch: null,
  }
}

async function saveResultsToDatabase(args: {
  topicId: string
  candidates: PaperCandidate[]
  context: SkillContext
}) {
  for (const candidate of args.candidates) {
    try {
      const lookupConditions = [
        candidate.arxivData?.arxivUrl ? { arxivUrl: candidate.arxivData.arxivUrl } : null,
        { title: candidate.title, topicId: args.topicId },
        candidate.titleZh ? { titleZh: candidate.titleZh, topicId: args.topicId } : null,
      ].filter(Boolean) as Array<Record<string, unknown>>

      const existingPaper =
        lookupConditions.length > 0
          ? await (prisma as any).paper.findFirst({
              where: {
                topicId: args.topicId,
                OR: lookupConditions,
              },
            })
          : null

      const paperData = {
        title: candidate.title,
        titleZh: candidate.titleZh || candidate.title,
        titleEn: candidate.title,
        summary: candidate.arxivData?.summary || '',
        explanation: candidate.why,
        authors: JSON.stringify(candidate.authors ?? []),
        published: new Date(candidate.published),
        arxivUrl: candidate.arxivData?.arxivUrl ?? null,
        pdfUrl: candidate.arxivData?.pdfUrl ?? null,
        figurePaths: '[]',
        tablePaths: '[]',
        tags: JSON.stringify(
          uniqueNonEmpty([
            ...(candidate.discoveryChannels ?? []),
            ...(candidate.queryHits ?? []),
            ...(candidate.arxivData?.categories ?? []),
          ], 10),
        ),
        contentMode: 'editorial',
        status: 'candidate',
      }

      if (existingPaper) {
        const persistedPaper = await (prisma as any).paper.update({
          where: { id: existingPaper.id },
          data: paperData,
        })
        candidate.sourcePaperId = candidate.sourcePaperId ?? candidate.paperId
        candidate.paperId = persistedPaper.id
      } else {
        const persistedPaper = await (prisma as any).paper.create({
          data: {
            ...paperData,
            topicId: args.topicId,
          },
        })
        candidate.sourcePaperId = candidate.sourcePaperId ?? candidate.paperId
        candidate.paperId = persistedPaper.id
      }
    } catch (error) {
      args.context.logger.error('Failed to persist admitted paper', {
        paperId: candidate.paperId,
        error,
      })
    }
  }
}

export async function executePaperTracker(
  input: SkillInput<PaperTrackerInput>,
  context: SkillContext,
  _artifactManager: ArtifactManager,
): Promise<SkillOutput> {
  const startTime = Date.now()
  const params = input.params

  context.logger.info('Starting paper tracker execution', { topicId: params.topicId })

  try {
    const topic = await loadTopicRecord(params.topicId)
    if (!topic) {
      throw new Error(`Topic not found in database: ${params.topicId}`)
    }

    const topicDef = await resolveTopicDefinition(params.topicId, topic)
    const currentStageIndex = params.stageIndex ?? topic.nodes.length
    const targetStageIndex =
      (params.stageMode || 'next-stage') === 'next-stage' ? currentStageIndex + 1 : currentStageIndex

    const discoveryPlan = buildDiscoveryPlan({
      topic,
      topicDef,
      input: params,
      targetStageIndex,
    })

    const discoveredPapers = await discoverPapers(discoveryPlan, topicDef, context)
    const candidates = await evaluateCandidates({
      papers: discoveredPapers,
      topic,
      topicDef,
      queries: discoveryPlan.queries,
      targetStageIndex,
      input: params,
      context,
    })
    const admittedCandidates = candidates.filter((candidate) => candidate.status === 'admitted')
    const branchDecision = determineBranchAction(candidates, params.allowMerge !== false)

    if (params.mode !== 'dry-run' && params.mode !== 'inspect' && admittedCandidates.length > 0) {
      await saveResultsToDatabase({
        topicId: params.topicId,
        candidates: admittedCandidates,
        context,
      })

      await researchMemory.addDiscoveryBatch(
        params.topicId,
        admittedCandidates.map((candidate) => ({
          paperId: candidate.paperId,
          title: candidate.title,
          confidence: candidate.confidence,
          stageIndex: targetStageIndex,
          discoveredAt: new Date().toISOString(),
        })),
      )
    }

    const output = {
      discoveryPlan,
      discoverySummary: {
        totalDiscovered: discoveredPapers.length,
        totalQueries: discoveryPlan.queries.length,
        queryBreakdown: Object.fromEntries(discoveryPlan.queries.map((query) => [query, 1])),
        sourceBreakdown: {
          arxiv: discoveredPapers.length,
        },
        timeRange: {
          start: new Date(Date.now() - discoveryPlan.windowMonths * 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      },
      admittedCandidates,
      candidates,
      recommendations: admittedCandidates.slice(0, 5).map((candidate) => ({
        paperId: candidate.paperId,
        candidateType: candidate.candidateType,
        confidence: candidate.confidence,
        why: candidate.why,
        status: candidate.status,
      })),
      selectedCandidate: admittedCandidates[0] ?? null,
      decisionSummary: `Discovered ${discoveredPapers.length} papers and admitted ${admittedCandidates.length} for stage ${targetStageIndex}.`,
      branchDecisionRationale: branchDecision.rationale,
      branchAction: branchDecision.action,
      selectedBranch: branchDecision.selectedBranch,
      stageWindow: {
        stageIndex: targetStageIndex,
        windowMonths: discoveryPlan.windowMonths,
        paperCount: admittedCandidates.length,
      },
      stageWindowDecision: {
        shouldAdvance: admittedCandidates.length >= 3,
        rationale:
          admittedCandidates.length >= 3
            ? 'Enough new evidence was admitted to justify stage advancement.'
            : 'Keep consolidating the current stage before advancing.',
      },
      topicMemoryPatch: {
        lastDiscoveryAt: new Date().toISOString(),
        currentStage: targetStageIndex,
        admittedCount: admittedCandidates.length,
      },
      paperCatalogPatch: {
        added: admittedCandidates.map((candidate) => candidate.paperId),
        total: topic.papers.length + admittedCandidates.length,
      },
      paperMetricsPatch: {
        discoveryRate:
          discoveredPapers.length > 0 ? admittedCandidates.length / discoveredPapers.length : 0,
        averageConfidence:
          admittedCandidates.length > 0
            ? admittedCandidates.reduce((sum, candidate) => sum + candidate.confidence, 0) /
              admittedCandidates.length
            : 0,
      },
      timelineContextPatch: {
        lastUpdate: new Date().toISOString(),
        stageCount: topic.stages.length,
        paperCount: topic.papers.length + admittedCandidates.length,
      },
      runSummary: {
        duration: Date.now() - startTime,
        papersDiscovered: discoveredPapers.length,
        papersAdmitted: admittedCandidates.length,
        stageAdvanced: admittedCandidates.length >= 3,
      },
    }

    context.logger.info('Paper tracker execution completed', {
      topicId: params.topicId,
      discovered: discoveredPapers.length,
      admitted: admittedCandidates.length,
      duration: Date.now() - startTime,
    })

    return {
      success: true,
      data: output,
      artifacts: [],
    }
  } catch (error) {
    context.logger.error('Paper tracker execution failed', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
      artifacts: [],
    }
  }
}

export const __testing = {
  sanitizeDiscoveryTerms,
  prioritizeExternalDiscoveryTerms,
  collectMatchedQueries,
  scorePaperDiscoveryFit,
  parsePaperEvaluationJson,
  parsePaperEvaluationLines,
  inferPaperEvaluationFromText,
  looksMetaEvaluation,
}
