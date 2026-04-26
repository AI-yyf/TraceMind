import type { ArtifactManager, SkillContext, SkillInput, SkillOutput } from '../../../engine/contracts'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/db'
import { researchMemory } from '../../../shared/research-memory'
import { getTopicDefinition } from '../../../topic-config/index'
import { omniGateway } from '../../../src/services/omni/gateway'
import { withRetry, LLMGenerationError } from '../../../src/services/omni/retry'
import { enhancedTaskScheduler } from '../../../src/services/enhanced-scheduler'
import {
  extractAndPersistPaperPdfFromUrl,
  normalizePdfUrl,
} from '../../../src/services/pdf-grounding'
import { refreshTopicViewModelSnapshot } from '../../../src/services/topics/alpha-topic'
import { orchestrateTopicReaderArtifacts } from '../../../src/services/topics/alpha-reader'
import { syncConfiguredTopicWorkflowSnapshot } from '../../../src/services/topics/topic-config-sync'
import { discoverExternalCandidates, discoverWithSnowball, type DiscoveryQuery } from './discovery'
import {
  deriveTemporalStageBuckets,
  normalizeStageWindowMonths,
} from '../../../src/services/topics/stage-buckets'
import {
  loadTopicStageConfig,
  saveTopicStageConfig,
} from '../../../src/services/topics/topic-stage-config'
import {
  loadTopicResearchConfig,
  loadGlobalResearchConfig,
  RESEARCH_CONFIG_DEFAULTS,
} from '../../../src/services/topics/topic-research-config'
import {
  getSourceCooldownUntil,
  noteSourceRateLimit,
  noteSourceSuccess,
} from '../../../src/services/search/source-health'

type PaperTrackerDurationResearchAngle = {
  id?: string
  label?: string
  focus?: DiscoveryQuery['focus']
  prompts?: string[]
}

type PaperTrackerDurationResearchPolicy = {
  stageWindowHours?: number
  maxCandidatesPerStage?: number
  targetPapersPerNode?: number
  minimumUsefulPapersPerNode?: number
  targetCandidatesBeforeAdmission?: number
  highConfidenceThreshold?: number
  admissionMode?: string
  researchAngles?: PaperTrackerDurationResearchAngle[]
}

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
  maxPapersPerNode?: number
  minimumUsefulPapersPerNode?: number
  durationResearchPolicy?: PaperTrackerDurationResearchPolicy
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
  openAlexId?: string
  discoverySource?: 'arxiv-api' | 'openalex' | 'semantic-scholar' | 'crossref'
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
  // 广纳贤文: three-tier status system
  status: 'admitted' | 'candidate' | 'rejected'
  why: string
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
  earliestWindowMonths?: number
  branchId?: string
  stageIndex?: number
  mergeTargetBranchIds?: string[]
  queryHits?: string[]
  discoveryChannels?: string[]
  arxivData?: ArxivPaper
  // OpenAlex ID for citation network traversal
  openAlexId?: string
  // Rejection audit trail (for "广纳贤文")
  rejectReason?: string
  rejectFilter?: string
  rejectScore?: number
  discoverySource?: 'arxiv' | 'arxiv-api' | 'openalex' | 'semantic-scholar' | 'crossref' | 'snowball'
  // Snowball sampling metadata
  snowballParentId?: string
  snowballDepth?: number
  snowballType?: 'forward' | 'backward'
  // Persistence failure marker (BUG #3 fix)
  persistenceFailed?: boolean
}

type BootstrapAnchorWindow = {
  bucketKey: string
  label: string
  bucketStart: Date
}

type LlmPaperEvaluation = {
  // 广纳贤文: Support three-tier verdict system
  verdict: 'admit' | 'candidate' | 'reject'
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

type DiscoveryStageWindow = {
  currentStageIndex: number
  targetStageIndex: number
  windowMonths: number
  stageLabel: string
  startDate: Date
  endDateExclusive: Date
  searchStartDate: Date
  searchEndDateExclusive: Date
  anchorStageIndex: number
  bootstrapMode: boolean
  anchorPapers: Array<{
    paperId: string
    title: string
    published: string
    branchId?: string
    openAlexId?: string
  }>
  anchorNodes: Array<{
    nodeId: string
    title: string
    summary: string
    branchId?: string
  }>
}

type TopicAdmissionContext = {
  topicId: string
  targetStageIndex: number
  bootstrapMode: boolean
  stageLabel: string
  anchorPaperTitles: string[]
  anchorNodeTexts: string[]
}

type TrackerStagePaper = {
  id: string
  title: string
  titleZh: string | null
  titleEn: string | null
  summary: string
  explanation: string | null
  coverPath: string | null
  figures: Array<{
    id: string
    imagePath: string
    caption: string
    analysis: string | null
  }>
}

type TrackerStageMaterializationMode = 'off' | 'quick' | 'deferred' | 'full'

type TrackerStageMaterializationResult = {
  stageIndex: number
  stagePaperIds: string[]
  affectedNodeIds: string[]
  removedNodeIds: string[]
  warmedNodeCount: number
  warmedPaperCount: number
}

type EffectivePaperTrackerResearchSettings = {
  maxCandidatesPerStage: number
  maxPapersPerNode: number
  minimumUsefulPapersPerNode: number
  targetCandidatesBeforeAdmission: number
  highConfidenceThreshold: number
}

const DISCOVERY_QUERY_LIMIT = 200 // Increased from 50 for 200 candidates discovery before admission
const FALLBACK_BOOTSTRAP_WINDOW_DAYS = 3650
const DISCOVERY_QUERY_CACHE_TTL_MS = 30 * 60 * 1000
const PAPER_EVALUATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const DISCOVERY_QUERY_DELAY_MS = 350
const DISCOVERY_QUERY_CONCURRENCY = 4
const ARXIV_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000
const ARXIV_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1000
const ARXIV_FETCH_TIMEOUT_MS = 4_500
const OPENALEX_FETCH_TIMEOUT_MS = 10_000
const PAPER_EVALUATION_LLM_CONCURRENCY = 5  // Raised from 2 to 5 for faster 200-candidate evaluation
const PAPER_EVALUATION_LLM_MAX_CANDIDATES = 200 // Max 200 papers admitted per stage after quality evaluation (aligned with DEFAULT_MAX_CANDIDATES_PER_STAGE)
const TRACKER_PDF_GROUNDING_CONCURRENCY = 2

// Helper to get research config with fallback chain: topic-specific -> global -> defaults
async function getResearchConfigParams(topicId: string): Promise<{
  maxCandidatesPerStage: number
  discoveryQueryLimit: number
  admissionThreshold: number
  maxPapersPerNode: number
  minPapersPerNode: number
  targetCandidatesBeforeAdmission: number
  highConfidenceThreshold: number
  semanticScholarLimit: number
  discoveryRounds: number
}> {
  // Step 1: Try topic-specific config
  try {
    const topicConfig = await loadTopicResearchConfig(topicId)
    // Check if this is a user-modified config (updatedAt > epoch)
    if (topicConfig.updatedAt && new Date(topicConfig.updatedAt).getTime() > 0) {
      return {
        maxCandidatesPerStage: topicConfig.maxCandidatesPerStage,
        discoveryQueryLimit: topicConfig.discoveryQueryLimit,
        admissionThreshold: topicConfig.admissionThreshold,
        maxPapersPerNode: topicConfig.maxPapersPerNode,
        minPapersPerNode: topicConfig.minPapersPerNode,
        targetCandidatesBeforeAdmission: topicConfig.targetCandidatesBeforeAdmission,
        highConfidenceThreshold: topicConfig.highConfidenceThreshold,
        semanticScholarLimit: topicConfig.semanticScholarLimit,
        discoveryRounds: topicConfig.discoveryRounds,
      }
    }
  } catch {
    // Topic-specific config lookup failed, continue to global
  }

  // Step 2: Try global config (set via SettingsPage)
  try {
    const globalConfig = await loadGlobalResearchConfig()
    // Check if global config has been modified (updatedAt > epoch)
    if (globalConfig.updatedAt && new Date(globalConfig.updatedAt).getTime() > 0) {
      return {
        maxCandidatesPerStage: globalConfig.maxCandidatesPerStage,
        discoveryQueryLimit: globalConfig.discoveryQueryLimit,
        admissionThreshold: globalConfig.admissionThreshold,
        maxPapersPerNode: globalConfig.maxPapersPerNode,
        minPapersPerNode: globalConfig.minPapersPerNode,
        targetCandidatesBeforeAdmission: globalConfig.targetCandidatesBeforeAdmission,
        highConfidenceThreshold: globalConfig.highConfidenceThreshold,
        semanticScholarLimit: globalConfig.semanticScholarLimit,
        discoveryRounds: globalConfig.discoveryRounds,
      }
    }
  } catch {
    // Global config lookup failed, continue to defaults
  }

  // Step 3: Fallback to hardcoded defaults
  return {
    maxCandidatesPerStage: RESEARCH_CONFIG_DEFAULTS.MAX_CANDIDATES_PER_STAGE,
    discoveryQueryLimit: RESEARCH_CONFIG_DEFAULTS.DISCOVERY_QUERY_LIMIT,
    admissionThreshold: RESEARCH_CONFIG_DEFAULTS.ADMISSION_THRESHOLD,
    maxPapersPerNode: RESEARCH_CONFIG_DEFAULTS.MAX_PAPERS_PER_NODE,
    minPapersPerNode: RESEARCH_CONFIG_DEFAULTS.MIN_PAPERS_PER_NODE,
    targetCandidatesBeforeAdmission: RESEARCH_CONFIG_DEFAULTS.TARGET_CANDIDATES_BEFORE_ADMISSION,
    highConfidenceThreshold: RESEARCH_CONFIG_DEFAULTS.HIGH_CONFIDENCE_THRESHOLD,
    semanticScholarLimit: RESEARCH_CONFIG_DEFAULTS.SEMANTIC_SCHOLAR_LIMIT,
    discoveryRounds: RESEARCH_CONFIG_DEFAULTS.DISCOVERY_ROUNDS,
  }
}

function clampPositiveInteger(
  value: number | null | undefined,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function clampConfidence(
  value: number | null | undefined,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.max(min, Math.min(max, value))
}

function normalizeDurationResearchAngles(
  angles: PaperTrackerDurationResearchPolicy['researchAngles'],
) {
  if (!Array.isArray(angles)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: Array<{
    id: string
    label: string
    focus: DiscoveryQuery['focus']
    prompts: string[]
  }> = []

  for (const angle of angles) {
    if (!angle || typeof angle !== 'object') continue

    const prompts = sanitizeDiscoveryTerms(
      Array.isArray(angle.prompts) ? angle.prompts : [],
      8,
    )
    if (prompts.length === 0) continue

    const id = pickText(angle.id, angle.label, prompts[0]).toLowerCase().replace(/[^a-z0-9]+/gu, '-')
    if (!id || seen.has(id)) continue
    seen.add(id)

    normalized.push({
      id,
      label: pickText(angle.label, angle.id, prompts[0]),
      focus:
        angle.focus === 'problem' ||
        angle.focus === 'method' ||
        angle.focus === 'citation' ||
        angle.focus === 'merge'
          ? angle.focus
          : 'problem',
      prompts,
    })
  }

  return normalized
}

function resolvePaperTrackerResearchSettings(args: {
  input: PaperTrackerInput
  researchConfig: Awaited<ReturnType<typeof getResearchConfigParams>>
}): EffectivePaperTrackerResearchSettings {
  const requestedMaxCandidates = clampPositiveInteger(
    args.input.durationResearchPolicy?.maxCandidatesPerStage ?? args.input.maxCandidates,
    8,
    200,
  )
  const requestedMaxPapersPerNode = clampPositiveInteger(
    args.input.durationResearchPolicy?.targetPapersPerNode ?? args.input.maxPapersPerNode,
    4,
    40,
  )
  const requestedMinimumUseful = clampPositiveInteger(
    args.input.durationResearchPolicy?.minimumUsefulPapersPerNode ??
      args.input.minimumUsefulPapersPerNode,
    3,
    30,
  )
  const requestedTargetCandidatesBeforeAdmission = clampPositiveInteger(
    args.input.durationResearchPolicy?.targetCandidatesBeforeAdmission,
    20,
    200,
  )
  const requestedHighConfidenceThreshold = clampConfidence(
    args.input.durationResearchPolicy?.highConfidenceThreshold,
    0.5,
    0.95,
  )
  const maxPapersPerNode =
    requestedMaxPapersPerNode ?? clampPositiveInteger(args.researchConfig.maxPapersPerNode, 4, 40) ?? 20
  const minimumUsefulFloor = Math.min(
    maxPapersPerNode,
    clampPositiveInteger(args.researchConfig.minPapersPerNode, 3, maxPapersPerNode) ??
      Math.max(3, Math.ceil(maxPapersPerNode / 2)),
  )
  const minimumUsefulPapersPerNode =
    requestedMinimumUseful !== null
      ? Math.min(maxPapersPerNode, requestedMinimumUseful)
      : minimumUsefulFloor
  const maxCandidatesPerStage =
    requestedMaxCandidates ??
    clampPositiveInteger(args.researchConfig.maxCandidatesPerStage, 8, 200) ??
    20
  const targetCandidatesBeforeAdmission = Math.max(
    maxCandidatesPerStage,
    requestedTargetCandidatesBeforeAdmission ??
      clampPositiveInteger(args.researchConfig.targetCandidatesBeforeAdmission, 20, 200) ??
      maxCandidatesPerStage,
  )
  const highConfidenceThreshold =
    requestedHighConfidenceThreshold ??
    clampConfidence(args.researchConfig.highConfidenceThreshold, 0.5, 0.95) ??
    0.75

  return {
    maxCandidatesPerStage,
    maxPapersPerNode,
    minimumUsefulPapersPerNode,
    targetCandidatesBeforeAdmission,
    highConfidenceThreshold,
  }
}

function startOfUtcMonth(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now())
  if (Number.isNaN(date.getTime())) {
    return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1))
}

function addUtcDays(value: Date, days: number) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + days),
  )
}

function formatStageWindowLabel(startDate: Date, windowMonths: number) {
  const startYear = startDate.getUTCFullYear()
  const startMonth = `${startDate.getUTCMonth() + 1}`.padStart(2, '0')
  if (windowMonths <= 1) {
    return `${startYear}.${startMonth}`
  }

  const endDate = addUtcMonths(startDate, windowMonths - 1)
  const endYear = endDate.getUTCFullYear()
  const endMonth = `${endDate.getUTCMonth() + 1}`.padStart(2, '0')
  return `${startYear}.${startMonth}-${endYear}.${endMonth}`
}

function formatBootstrapWindowLabel(startDate: Date, endDateExclusive: Date) {
  const inclusiveEnd = addUtcDays(endDateExclusive, -1)
  const totalMonths = Math.max(
    1,
    (inclusiveEnd.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
      (inclusiveEnd.getUTCMonth() - startDate.getUTCMonth()) +
      1,
  )
  return `bootstrap ${formatStageWindowLabel(startDate, totalMonths)}`
}

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
  'include',
  'includes',
  'including',
  'included',
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

async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  limit: number,
  iteratee: (value: TInput, index: number) => Promise<TOutput>,
) {
  if (values.length === 0) {
    return [] as TOutput[]
  }

  const concurrency = Math.max(1, Math.min(limit, values.length))
  const results = new Array<TOutput>(values.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await iteratee(values[currentIndex], currentIndex)
      }
    }),
  )

  return results
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

function pickText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }

  return ''
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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function textHasToken(text: string, token: string) {
  if (/[\u4e00-\u9fff]/u.test(token)) {
    return text.includes(token)
  }

  return new RegExp(
    `(?:^|[^\\p{Letter}\\p{Number}])${escapeRegex(token)}(?:$|[^\\p{Letter}\\p{Number}])`,
    'u',
  ).test(text)
}

function textHasPhrase(text: string, phrase: string) {
  const tokens = tokenizeSearchText(phrase)
  if (tokens.length === 0) return false
  if (tokens.length === 1) return textHasToken(text, tokens[0])

  if (tokens.every((token) => /^[a-z0-9]+$/u.test(token))) {
    return new RegExp(
      `(?:^|[^\\p{Letter}\\p{Number}])${tokens
        .map((token) => escapeRegex(token))
        .join('[\\s-]+')}(?:$|[^\\p{Letter}\\p{Number}])`,
      'u',
    ).test(text)
  }

  return text.includes(phrase.toLowerCase())
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
  if (textHasPhrase(text, normalizedQuery)) return 1

  const tokens = tokenizeSearchText(query)
  if (tokens.length === 0) return 0

  const matched = tokens.filter((token) => textHasToken(text, token)).length
  let score = matched / tokens.length

  const phrases = buildQueryPhrases(query)
  if (phrases.length > 0) {
    const matchedPhrases = phrases.filter((phrase) => textHasPhrase(text, phrase)).length
    score = score * 0.55 + (matchedPhrases / phrases.length) * 0.45
  }

  if (normalizedQuery.includes('world model') && !textHasPhrase(text, 'world model')) {
    score *= 0.4
  }

  if (
    normalizedQuery.includes('autonomous driving') &&
    !textHasPhrase(text, 'autonomous driving') &&
    !textHasPhrase(text, 'self driving') &&
    !textHasPhrase(text, 'self-driving')
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
  const queryScores = queries
    .map((query) => queryMatchScore(query, paperText))
    .filter((score) => score > 0)
    .sort((left, right) => right - left)
  const topQueryScores = queryScores.slice(0, Math.min(4, queryScores.length))
  const queryScore =
    topQueryScores.length > 0
      ? topQueryScores.reduce((sum, score) => sum + score, 0) / topQueryScores.length
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

function isArxivUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false

  const details = `${error.name} ${error.message}`.toLowerCase()
  return (
    details.includes('aborterror') ||
    details.includes('timed out') ||
    details.includes('timeout') ||
    details.includes('etimedout') ||
    details.includes('fetch failed') ||
    details.includes('econnreset') ||
    details.includes('socket hang up')
  )
}

async function loadTopicRecord(topicId: string) {
  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      focusLabel: true,
      summary: true,
      description: true,
      createdAt: true,
      papers: {
        select: {
          id: true,
          title: true,
          titleZh: true,
          titleEn: true,
          summary: true,
          explanation: true,
          authors: true,
          published: true,
          tags: true,
          arxivUrl: true,
          pdfUrl: true,
        },
        orderBy: { published: 'desc' },
      },
      research_nodes: {
        select: {
          id: true,
          stageIndex: true,
          nodeLabel: true,
          nodeSubtitle: true,
          nodeSummary: true,
          primaryPaperId: true,
          createdAt: true,
          updatedAt: true,
          node_papers: {
            select: {
              paperId: true,
            },
          },
        },
        orderBy: [{ stageIndex: 'asc' }, { updatedAt: 'asc' }],
      },
      topic_stages: {
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!topic) {
    return null
  }

  return {
    ...topic,
    nodes: topic.research_nodes.map((node) => ({
      ...node,
      papers: node.node_papers,
    })),
    stages: topic.topic_stages,
  }
}

async function loadTopicCreationSeed(topicId: string): Promise<TopicCreationSeed | null> {
  const record = await prisma.system_configs.findUnique({
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

async function resolveTrackerStageWindowMonths(
  topicId: string,
  requestedWindowMonths?: number,
) {
  if (typeof requestedWindowMonths === 'number' && Number.isFinite(requestedWindowMonths)) {
    return normalizeStageWindowMonths(requestedWindowMonths)
  }

  const config = await loadTopicStageConfig(topicId)
  return normalizeStageWindowMonths(config.windowMonths)
}

function resolveTrackerNodeBranchId(node: any) {
  if (typeof node?.branchId === 'string' && node.branchId.trim().length > 0) {
    return node.branchId.trim()
  }

  if (Array.isArray(node?.sourceBranchIds)) {
    const branchId = node.sourceBranchIds.find(
      (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0,
    )
    if (branchId) {
      return branchId.trim()
    }
  }

  return undefined
}

function nodeIncludesTrackerPaper(node: any, paperId: string) {
  if (!paperId) return false
  if (node?.primaryPaperId === paperId || node?.paperId === paperId) return true

  if (!Array.isArray(node?.papers)) return false
  return node.papers.some((entry: any) => entry?.paperId === paperId || entry?.id === paperId)
}

function resolveTrackerPaperBranchId(
  topic: NonNullable<TopicRecord>,
  paperId: string,
  requestedBranchId?: string,
) {
  if (requestedBranchId) return requestedBranchId

  const matchedNode = topic.nodes.find((node: any) => nodeIncludesTrackerPaper(node, paperId))
  return matchedNode ? resolveTrackerNodeBranchId(matchedNode) : undefined
}

function resolveTemporalDiscoveryWindow(args: {
  topic: NonNullable<TopicRecord>
  requestedWindowMonths: number
  requestedStageIndex?: number
  requestedBranchId?: string
  stageMode?: PaperTrackerInput['stageMode']
  bootstrapWindowDays?: number
}) {
  const windowMonths = normalizeStageWindowMonths(args.requestedWindowMonths)
  const temporalBuckets = deriveTemporalStageBuckets({
    papers: args.topic.papers.map((paper: any) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: args.topic.nodes.map((node: any) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
      papers: Array.isArray(node.papers)
        ? node.papers.map((entry: any) => ({ paperId: entry.paperId }))
        : [],
    })),
    windowMonths,
    fallbackDate: args.topic.createdAt,
  })
  const hasObservedPapers = args.topic.papers.length > 0

  if (!hasObservedPapers) {
    const bootstrapWindowDays = Math.max(
      FALLBACK_BOOTSTRAP_WINDOW_DAYS,
      Math.trunc(args.bootstrapWindowDays ?? FALLBACK_BOOTSTRAP_WINDOW_DAYS),
    )
    const searchEndDateExclusive = addUtcMonths(startOfUtcMonth(new Date()), 1)
    const searchStartDate = startOfUtcMonth(addUtcDays(searchEndDateExclusive, -bootstrapWindowDays))

    return {
      temporalBuckets,
      window: {
        currentStageIndex: 0,
        targetStageIndex: 1,
        windowMonths,
        stageLabel: formatBootstrapWindowLabel(searchStartDate, searchEndDateExclusive),
        startDate: searchStartDate,
        endDateExclusive: searchEndDateExclusive,
        searchStartDate,
        searchEndDateExclusive,
        anchorStageIndex: 0,
        bootstrapMode: true,
        anchorPapers: [],
        anchorNodes: [],
      } satisfies DiscoveryStageWindow,
    }
  }

  const earliestChronologicalDate = [
    ...args.topic.papers.map((paper: any) => new Date(paper.published)),
  ]
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? new Date()
  const firstStageStart = startOfUtcMonth(earliestChronologicalDate)
  const latestChronologicalDate =
    [...args.topic.papers.map((paper: any) => new Date(paper.published))]
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? firstStageStart
  const latestObservedStart = startOfUtcMonth(latestChronologicalDate)
  const chronologicalStageCount =
    Math.floor(
      ((latestObservedStart.getUTCFullYear() - firstStageStart.getUTCFullYear()) * 12 +
        (latestObservedStart.getUTCMonth() - firstStageStart.getUTCMonth())) /
        windowMonths,
    ) + 1
  const defaultCurrentStageIndex = args.topic.papers.length > 0 ? chronologicalStageCount : 0
  const currentStageIndex =
    typeof args.requestedStageIndex === 'number' && Number.isFinite(args.requestedStageIndex)
      ? Math.max(0, Math.trunc(args.requestedStageIndex))
      : defaultCurrentStageIndex
  const targetStageIndex =
    (args.stageMode || 'next-stage') === 'next-stage'
      ? Math.max(1, currentStageIndex + 1)
      : Math.max(1, currentStageIndex)
  const stageStart = addUtcMonths(firstStageStart, Math.max(0, targetStageIndex - 1) * windowMonths)
  const endDateExclusive = addUtcMonths(stageStart, windowMonths)
  const anchorStageIndex = Math.max(1, Math.min(Math.max(currentStageIndex, 1), targetStageIndex))
  const requestedBranchId = args.requestedBranchId?.trim() || undefined
  const paperById = new Map(args.topic.papers.map((paper: any) => [paper.id, paper]))
  const anchorPaperIds = Array.from(temporalBuckets.paperAssignments.entries())
    .filter(([, assignment]) => assignment.stageIndex === anchorStageIndex)
    .map(([paperId]) => paperId)
  const anchorPapers = (anchorPaperIds.length > 0
    ? anchorPaperIds.map((paperId) => paperById.get(paperId)).filter(Boolean)
    : args.topic.papers.slice(0, 6)
  )
    .sort(
      (left: any, right: any) =>
        new Date(left.published).getTime() - new Date(right.published).getTime(),
    )
    .slice(-6)
.map((paper: any) => ({
      paperId: extractArxivId(paper.arxivUrl) || paper.id,
      title: paper.titleEn || paper.title || paper.titleZh || paper.id,
      published: new Date(paper.published).toISOString(),
      branchId: resolveTrackerPaperBranchId(args.topic, paper.id, requestedBranchId),
      // Include openAlexId if available (from previous discovery)
      openAlexId: paper.openAlexId ?? (paper.arxivUrl?.startsWith('https://openalex.org/')
        ? paper.arxivUrl.replace('https://openalex.org/', '')
        : undefined),
    }))
  const anchorNodes = args.topic.nodes
    .filter((node: any) => {
      const assignment = temporalBuckets.nodeAssignments.get(node.id)
      return assignment?.stageIndex === anchorStageIndex
    })
    .slice(0, 8)
    .map((node: any) => ({
      nodeId: node.id,
      title: node.nodeLabel,
      summary: clipText(node.nodeSummary, 180),
      branchId: requestedBranchId ?? resolveTrackerNodeBranchId(node),
    }))

  return {
    temporalBuckets,
    window: {
      currentStageIndex,
      targetStageIndex,
      windowMonths,
      stageLabel: formatStageWindowLabel(stageStart, windowMonths),
      startDate: stageStart,
      endDateExclusive,
      searchStartDate: stageStart,
      searchEndDateExclusive: endDateExclusive,
      anchorStageIndex,
      bootstrapMode: false,
      anchorPapers,
      anchorNodes,
    } satisfies DiscoveryStageWindow,
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
          /\b(?:build|create|establish|craft|follow|track|study|research|topic|topics|tracker|tracking|sustained|long-horizon|long horizon|long-term|persistent|distinguish|prioritize|compare|clarify|focus(?:ing)?(?: on)?|separate|between|across|over|while|where|what|which|that|this|these|those|current|next|round|stage|phase|mainline|paper|papers|listing|listings|explicit|judgment|judgments|evidence-aware|evidence|node|nodes|structure|structures|support|supported|advance|advances|advancing|include|includes|including|included)\b/giu,
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
  const record = await prisma.system_configs.findUnique({
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

function expandDiscoveryQueryVariants(value: string | null | undefined) {
  const normalized = normalizeDiscoveryTerm(value)
  if (!normalized) return []

  const lower = normalized.toLowerCase()
  const variants = [normalized]

  if (/\bvision[- ]language[- ]action\b/u.test(lower)) {
    variants.push(normalized.replace(/\bvision[- ]language[- ]action\b/giu, 'VLA'))
  }
  if (/\bvla\b/u.test(lower)) {
    variants.push(normalized.replace(/\bvla\b/giu, 'vision language action'))
  }
  if (/\bworld models\b/u.test(lower)) {
    variants.push(normalized.replace(/\bworld models\b/giu, 'world model'))
  }
  if (/\bworld model\b/u.test(lower) && !/\bworld models\b/u.test(lower)) {
    variants.push(normalized.replace(/\bworld model\b/giu, 'world models'))
    variants.push(normalized.replace(/\bworld model\b/giu, 'latent dynamics'))
    variants.push(normalized.replace(/\bworld model\b/giu, 'video prediction'))
    variants.push(normalized.replace(/\bworld model\b/giu, 'generative simulator'))
  }
  if (/\bautonomous driving\b/u.test(lower)) {
    variants.push(normalized.replace(/\bautonomous driving\b/giu, 'self-driving'))
    variants.push(normalized.replace(/\bautonomous driving\b/giu, 'driving'))
  }
  if (/\bself[- ]driving\b/u.test(lower)) {
    variants.push(normalized.replace(/\bself[- ]driving\b/giu, 'autonomous driving'))
  }
  if (/\bclosed loop\b/u.test(lower)) {
    variants.push(normalized.replace(/\bclosed loop\b/giu, 'closed-loop'))
  }
  if (/\bend to end\b/u.test(lower)) {
    variants.push(normalized.replace(/\bend to end\b/giu, 'end-to-end'))
  }
  if (/\blanguage-conditioned\b/u.test(lower)) {
    variants.push(normalized.replace(/\blanguage-conditioned\b/giu, 'instruction-conditioned'))
  }
  if (/\binstruction-conditioned\b/u.test(lower)) {
    variants.push(normalized.replace(/\binstruction-conditioned\b/giu, 'language-conditioned'))
  }
  if (/\bvision[- ]language[- ]model\b/u.test(lower)) {
    variants.push(normalized.replace(/\bvision[- ]language[- ]model\b/giu, 'vision language action'))
  }
  if (/\bscene token\b/u.test(lower)) {
    variants.push(normalized.replace(/\bscene token\b/giu, 'scene representation'))
    variants.push(normalized.replace(/\bscene token\b/giu, 'scene tokenized'))
  }
  if (/\baction tokenizer\b|\baction-tokenized\b/u.test(lower)) {
    variants.push(normalized.replace(/\baction tokenizer\b|\baction-tokenized\b/giu, 'policy tokenization'))
  }

  return uniqueNonEmpty(
    variants
      .map((item) => normalizeDiscoveryTerm(item))
      .filter((item): item is string => Boolean(item) && !isNoisyDiscoveryTerm(item)),
    10,
  )
}

function collectPatternMatchedDiscoveryTerms(
  values: string[],
  pattern: RegExp,
  fallbackLimit = 4,
) {
  const matched = uniqueNonEmpty(
    values.flatMap((value) => {
      const normalized = normalizeDiscoveryTerm(value)
      if (!normalized) return []
      return Array.from(normalized.matchAll(pattern))
        .map((match) => normalizeDiscoveryTerm(match[0]))
        .filter((item): item is string => Boolean(item))
    }),
    fallbackLimit * 2,
  ).filter((item) => isExternalDiscoveryQueryCandidate(item))

  return matched.slice(0, fallbackLimit)
}

function buildDiscoveryPairQueries(args: {
  leftTerms: string[]
  rightTerms: string[]
  limit: number
}) {
  const output: string[] = []

  for (const left of args.leftTerms) {
    const leftVariants = expandDiscoveryQueryVariants(left)
    for (const right of args.rightTerms) {
      const rightVariants = expandDiscoveryQueryVariants(right)
      for (const leftVariant of leftVariants) {
        for (const rightVariant of rightVariants) {
          if (discoveryTermsOverlap(leftVariant, rightVariant) >= 0.75) continue

          const combined = normalizeDiscoveryTerm(`${leftVariant} ${rightVariant}`)
          if (!combined || !isExternalDiscoveryQueryCandidate(combined)) continue

          output.push(combined)
          if (output.length >= args.limit * 3) {
            return compactDiscoveryTerms(output, args.limit)
          }
        }
      }
    }
  }

  return compactDiscoveryTerms(output, args.limit)
}

function buildDiscoveryQueries(baseAnchor: string, modifierTerms: string[], limit = DISCOVERY_QUERY_LIMIT) {
  const normalizedAnchor = normalizeDiscoveryTerm(baseAnchor)
  const queries: string[] = []

  const anchorVariants = expandDiscoveryQueryVariants(normalizedAnchor)
  if (anchorVariants.length > 0) {
    queries.push(...anchorVariants.filter((query) => isExternalDiscoveryQueryCandidate(query)))
  }

  for (const modifier of modifierTerms) {
    const modifierVariants = expandDiscoveryQueryVariants(modifier)
    for (const normalizedModifier of modifierVariants) {
      if (!isExternalDiscoveryQueryCandidate(normalizedModifier)) continue

      if (normalizedAnchor && discoveryTermsOverlap(normalizedAnchor, normalizedModifier) >= 0.75) {
        continue
      }

      const combined =
        normalizedAnchor && normalizedAnchor.length <= 42
          ? normalizeDiscoveryTerm(`${normalizedModifier} ${normalizedAnchor}`)
          : normalizedModifier
      const query =
        isExternalDiscoveryQueryCandidate(combined) && (combined?.length ?? 0) <= 72
          ? combined
          : normalizedModifier

      if (query) {
        queries.push(query)
      }
    }
    if (queries.length >= limit * 2) break
  }

  return compactDiscoveryTerms(queries.filter((query) => isExternalDiscoveryQueryCandidate(query)), limit)
}

function buildDurationAngleQueries(args: {
  baseAnchor: string
  stageLabel: string
  domainTerms: string[]
  problemTerms: string[]
  methodTerms: string[]
  angles: ReturnType<typeof normalizeDurationResearchAngles>
}) {
  const queryMeta = new Map<
    string,
    {
      rationale: string
      focus: DiscoveryQuery['focus']
    }
  >()

  const registerQuery = (
    query: string | null | undefined,
    rationale: string,
    focus: DiscoveryQuery['focus'],
  ) => {
    const normalized = normalizeDiscoveryTerm(query)
    if (!normalized || !isExternalDiscoveryQueryCandidate(normalized)) return
    if (!queryMeta.has(normalized)) {
      queryMeta.set(normalized, { rationale, focus })
    }
  }

  for (const angle of args.angles) {
    const focusTerms =
      angle.focus === 'method'
        ? args.methodTerms
        : angle.focus === 'citation' || angle.focus === 'merge'
          ? [...args.problemTerms, ...args.methodTerms]
          : args.problemTerms
    const angleTerms = prioritizeExternalDiscoveryTerms(
      [...angle.prompts, ...focusTerms],
      6,
    )
    const rationale = `${angle.label} lens for ${args.stageLabel}`

    for (const query of buildDiscoveryQueries(args.baseAnchor, angleTerms, 3)) {
      registerQuery(query, rationale, angle.focus)
    }

    for (const query of buildDiscoveryPairQueries({
      leftTerms: args.domainTerms.length > 0 ? args.domainTerms : [args.baseAnchor],
      rightTerms: angleTerms,
      limit: 2,
    })) {
      registerQuery(query, rationale, angle.focus)
    }
  }

  return {
    queries: [...queryMeta.keys()],
    queryMeta,
  }
}

const AUTONOMOUS_DRIVING_WORLD_MODEL_ERA_START_UTC_MS = Date.UTC(2023, 0, 1)

const AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS = [
  'end-to-end autonomous driving',
  'end-to-end self-driving',
  'end-to-end driving control',
  'camera to steering self-driving',
  'direct perception autonomous driving',
  'affordance learning autonomous driving',
  'driving policy learning',
  'imitation learning autonomous driving',
  'imitation learning for self-driving',
  'query-efficient imitation driving',
  'query-efficient driving policy',
  'conditional imitation driving',
  'conditional imitation learning driving',
  'behavior cloning driving',
  'behaviour cloning driving',
  'driving recovery policy',
  'recovery policy for self-driving',
  'intervention recovery driving',
  'learning by cheating autonomous driving',
  'chauffeurnet autonomous driving',
  'world on rails driving',
  'simulated driving policy learning',
  'visual attention self-driving',
  'causal attention self-driving',
  'interpretable self-driving',
  'cognitive model self-driving',
  'driving affordance prediction',
]

const AUTONOMOUS_DRIVING_WORLD_MODEL_QUERY_TERMS = [
  'closed-loop driving',
  'closed-loop autonomous driving',
  'closed-loop driving policy',
  'occupancy world model',
  'driving occupancy world model',
  'occupancy flow driving',
  'driving occupancy flow',
  'scene token driving',
  'scene tokenized driving',
  'scene token world model',
  'driving scene representation',
  'driving foundation model',
  'foundation model for autonomous driving',
  'latent dynamics driving',
  'latent driving world model',
  'generative driving simulator',
  'neural driving simulator',
  'counterfactual driving simulation',
  'controllable driving scene generation',
  'action-conditioned video generation driving',
  'ego-video prediction driving',
  'instruction-conditioned driving',
  'instruction-conditioned autonomous driving',
  'scene-centric driving planning',
  'BEV world model driving',
  'language-conditioned driving',
  'language-conditioned driving policy',
  'language-conditioned planning for driving',
  'action-tokenized driving',
  'driving action tokenizer',
  'multimodal driving policy',
  'planning-oriented driving world model',
  'world model for closed-loop driving',
  'OOD generalization driving policy',
  'long-tail autonomous driving',
]

const AUTONOMOUS_DRIVING_FAMILY_QUERY_TERMS = [
  'OccWorld autonomous driving',
  'Drive-WM autonomous driving',
  'DriveDreamer autonomous driving',
  'DriveDreamer2 autonomous driving',
  'DriveWorld autonomous driving',
  'DrivingWorld autonomous driving',
  'GAIA-1 autonomous driving',
  'GAIA-2 autonomous driving',
  'GenAD autonomous driving',
  'UniSim autonomous driving',
  'Vista autonomous driving',
  'HERMES self-driving world model',
  'driving vision language model',
  'driving VLM',
  'driving VLA',
]

function autonomousDrivingStageAnchorsLookWorldModelHeavy(values: string[]) {
  const combined = values.join(' ').toLowerCase()
  if (!combined) return false

  return /\bworld model\b|\boccupancy\b|\blatent dynamics\b|\bscene token\b|\bfoundation model\b|\blanguage-conditioned\b|\bvla\b|\baction token/u.test(
    combined,
  )
}

function isAutonomousDrivingBridgeStage(args: {
  topicId: string
  stageWindow: DiscoveryStageWindow
  anchorPaperTerms: string[]
  stageNodeTerms: string[]
}) {
  if (args.topicId !== 'autonomous-driving') return false

  const stageStartTimestamp = args.stageWindow.startDate.getTime()
  const preWorldModelEra =
    Number.isFinite(stageStartTimestamp) &&
    stageStartTimestamp < AUTONOMOUS_DRIVING_WORLD_MODEL_ERA_START_UTC_MS

  return (
    preWorldModelEra &&
    !autonomousDrivingStageAnchorsLookWorldModelHeavy([
      ...args.anchorPaperTerms,
      ...args.stageNodeTerms,
    ])
  )
}

function selectStageAwareDiscoveryAnchor(args: {
  topicDef: TopicDefinitionLike
  topic: NonNullable<TopicRecord>
  bridgeStage: boolean
  anchorPaperTerms: string[]
  stageNodeTerms: string[]
  topicSpecificTerms: string[]
}) {
  const sharedCandidates = [
    args.topicDef.nameEn,
    args.topic.nameEn,
    args.topicDef.focusLabel,
    args.topic.focusLabel,
    ...args.anchorPaperTerms,
    ...args.stageNodeTerms,
    ...args.topicDef.queryTags,
  ]

  if (!args.bridgeStage) {
    return selectDiscoveryAnchor(sharedCandidates)
  }

  const continuityCandidates = prioritizeExternalDiscoveryTerms(
    [
      ...args.stageNodeTerms,
      ...args.anchorPaperTerms,
      ...args.topicSpecificTerms,
      ...AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS,
    ],
    16,
  )
  const preferredContinuity =
    continuityCandidates.find((value) =>
      /\bend[- ]to[- ]end\b|\bimitation learning\b|\bconditional imitation\b|\brecovery\b|\battention\b|\bcognitive model\b|\binterpretable\b|\bdirect perception\b/iu.test(
        value,
      ),
    ) ?? continuityCandidates[0]

  return preferredContinuity || selectDiscoveryAnchor(sharedCandidates)
}

function buildTopicSpecificDiscoveryBoostTerms(args: {
  topicId: string
  stageWindow: DiscoveryStageWindow
  termPool: string[]
  anchorPaperTerms: string[]
  stageNodeTerms: string[]
}) {
  if (args.topicId !== 'autonomous-driving') return [] as string[]

  const bridgeStage = isAutonomousDrivingBridgeStage({
    topicId: args.topicId,
    stageWindow: args.stageWindow,
    anchorPaperTerms: args.anchorPaperTerms,
    stageNodeTerms: args.stageNodeTerms,
  })

  return compactDiscoveryTerms(
    [
      ...args.termPool,
      ...args.anchorPaperTerms,
      ...args.stageNodeTerms,
      ...AUTONOMOUS_DRIVING_FAMILY_QUERY_TERMS,
      ...(bridgeStage
        ? AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS
        : AUTONOMOUS_DRIVING_WORLD_MODEL_QUERY_TERMS),
      ...AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS.slice(0, 10),
      ...AUTONOMOUS_DRIVING_WORLD_MODEL_QUERY_TERMS.slice(0, 8),
      ...AUTONOMOUS_DRIVING_FAMILY_QUERY_TERMS.slice(0, 8),
      'recovery policy for autonomous driving',
      'driving affordance planning',
      'demonstration learning driving',
      'conditional imitation for self-driving',
      'instruction-conditioned driving planning',
      'planning-oriented autonomous driving world model',
    ],
    bridgeStage ? 28 : 24,
  )
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
          ? uniqueNonEmpty([...mergedQueryTags, ...staticTopic.queryTags], 12)
          : staticTopic.queryTags,
      problemPreference:
        mergedProblemPreference.length > 0
          ? uniqueNonEmpty([...mergedProblemPreference, ...staticTopic.problemPreference], 8)
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
              12,
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
              8,
            ),
      defaults: {
        bootstrapWindowDays: FALLBACK_BOOTSTRAP_WINDOW_DAYS,
        maxCandidates: 8,
      },
    }
  }
}

function buildDiscoveryPlan(args: {
  topic: NonNullable<TopicRecord>
  topicDef: TopicDefinitionLike
  input: PaperTrackerInput
  stageWindow: DiscoveryStageWindow
  discoveryQueryLimit?: number // 动态配置：发现查询上限
  discoveryRounds?: number // 动态配置：发现轮数
  semanticScholarLimit?: number // 动态配置：Semantic Scholar每查询上限
  maxPapersPerNode?: number // 动态配置：每节点论文上限
}) {
  // 使用动态配置或默认值
  const queryLimit = args.discoveryQueryLimit ?? DISCOVERY_QUERY_LIMIT
  const discoveryRounds = args.discoveryRounds ?? 2 // 默认2轮发现
  const semanticScholarLimit = args.semanticScholarLimit ?? 25 // 默认25篇每查询
  const maxPapersPerNode = args.maxPapersPerNode ?? 20 // 默认20篇每节点
  const anchorPapers = args.stageWindow.anchorPapers.map((paper) => paper.paperId)
  const stageNodeTerms = args.stageWindow.anchorNodes.flatMap((node) => [node.title, node.summary])
  const anchorPaperTerms = args.stageWindow.anchorPapers.flatMap((paper) => [paper.title])
  const bridgeStage = isAutonomousDrivingBridgeStage({
    topicId: args.topicDef.id,
    stageWindow: args.stageWindow,
    anchorPaperTerms,
    stageNodeTerms,
  })
  const topicSpecificTerms = buildTopicSpecificDiscoveryBoostTerms({
    topicId: args.topicDef.id,
    stageWindow: args.stageWindow,
    termPool: [
      args.topicDef.nameEn,
      args.topic.nameEn ?? args.topic.nameZh,
      args.topicDef.focusLabel,
      args.topic.focusLabel ?? args.topicDef.focusLabel,
      ...anchorPaperTerms,
      ...stageNodeTerms,
      ...args.topicDef.queryTags,
      ...args.topicDef.problemPreference,
    ],
    anchorPaperTerms,
    stageNodeTerms,
  })
const termPool = prioritizeExternalDiscoveryTerms(
    [
      args.topicDef.nameEn,
      args.topic.nameEn ?? args.topic.nameZh,
      args.topicDef.focusLabel,
      args.topic.focusLabel ?? args.topicDef.focusLabel,
      ...anchorPaperTerms,
      ...stageNodeTerms,
      ...args.topicDef.queryTags,
      ...args.topicDef.problemPreference,
      ...topicSpecificTerms,
    ],
    queryLimit * 7,
  )

  const baseAnchor = selectStageAwareDiscoveryAnchor({
    topicDef: args.topicDef,
    topic: args.topic,
    bridgeStage,
    anchorPaperTerms,
    stageNodeTerms,
    topicSpecificTerms,
  })
  const modifierTerms = prioritizeExternalDiscoveryTerms(
    [
      ...stageNodeTerms,
      ...anchorPaperTerms,
      ...(bridgeStage
        ? AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS
        : args.topicDef.problemPreference),
      ...(bridgeStage
        ? [
            ...args.topicDef.problemPreference,
            ...args.topicDef.queryTags.filter((term) => /\bdriving|self-driving|autonomous\b/iu.test(term)),
          ]
        : args.topicDef.queryTags),
      ...topicSpecificTerms,
    ],
    bridgeStage ? queryLimit * 6 : queryLimit * 5,
  )
  const domainTerms = collectPatternMatchedDiscoveryTerms(
    [baseAnchor, ...termPool],
    /\b(?:autonomous driving|self[- ]driving|driving|robotics?|navigation|embodied ai|embodied agents?)\b/giu,
    6,
  )
  const methodTerms = collectPatternMatchedDiscoveryTerms(
    bridgeStage ? [...AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS, baseAnchor, ...termPool] : [baseAnchor, ...termPool],
    bridgeStage
      ? /\b(?:end[- ]to[- ]end|imitation learning|behavior cloning|behaviour cloning|conditional imitation|direct perception|attention|visual attention|causal attention|interpretable|cognitive model)\b/giu
      : /\b(?:vision[- ]language[- ]action|vla|world models?|latent world models?|latent dynamics|video generation|foundation models?|diffusion|transformers?|end[- ]to[- ]end)\b/giu,
    bridgeStage ? 10 : 8,
  )
  const problemTerms = collectPatternMatchedDiscoveryTerms(
    bridgeStage ? [...AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS, ...termPool] : termPool,
    bridgeStage
      ? /\b(?:control|driving policy|policy learning|recovery|intervention|steering|simulation|attention|interpretable|dataset)\b/giu
      : /\b(?:planning|simulation|closed[- ]loop|control|forecasting|trajectory prediction|safety|policy learning|reasoning|action models?)\b/giu,
    bridgeStage ? 10 : 8,
  )
  const bridgeQueries = bridgeStage
    ? uniqueNonEmpty(
        [
          ...AUTONOMOUS_DRIVING_BRIDGE_QUERY_TERMS,
          ...buildDiscoveryPairQueries({
            leftTerms: ['autonomous driving', 'self-driving', 'driving'],
            rightTerms: [
              'end-to-end',
              'imitation learning',
              'recovery policy',
              'visual attention',
              'causal attention',
              'interpretable driving',
            ],
            limit: 8,
          }),
          ...buildDiscoveryPairQueries({
            leftTerms: anchorPaperTerms.length > 0 ? anchorPaperTerms : [baseAnchor],
            rightTerms: [
              'imitation learning',
              'recovery policy',
              'driving control',
              'visual attention',
              'self-driving',
            ],
            limit: 6,
          }),
        ],
        12,
      )
    : []
const topicSpecificQueryTerms = bridgeStage
    ? topicSpecificTerms.filter(
        (term) =>
          /\bend[- ]to[- ]end\b|\bimitation learning\b|\brecovery\b|\battention\b|\binterpretable\b|\bcognitive model\b|\bdirect perception\b|\bself-driving\b|\bautonomous driving\b/iu.test(
            term,
          ),
      )
    : topicSpecificTerms
  // 使用动态配置的queryLimit，而非硬编码DISCOVERY_QUERY_LIMIT
  const finalQueryLimit = bridgeStage ? queryLimit + 12 : queryLimit + 8
  const queryPairLimit = bridgeStage ? 8 : 6
  const topicSpecificPairLimit = bridgeStage ? 8 : 6
  const anchorNodeQueries = bridgeStage
    ? args.stageWindow.anchorNodes.flatMap((node) =>
        uniqueNonEmpty(
          [
            `${node.title} self-driving`,
            `${node.title} autonomous driving`,
          ],
          2,
        ),
      )
    : args.stageWindow.anchorNodes.map((node) => `${node.title} autonomous driving`)
  const queries = uniqueNonEmpty(
    [
      ...bridgeQueries,
      ...buildDiscoveryQueries(baseAnchor, modifierTerms, bridgeStage ? queryLimit + 6 : queryLimit + 4),
      ...buildDiscoveryPairQueries({
        leftTerms: domainTerms.length > 0 ? domainTerms : termPool.slice(0, 2),
        rightTerms: methodTerms.length > 0 ? methodTerms : modifierTerms.slice(0, 3),
        limit: queryPairLimit,
      }),
      ...buildDiscoveryPairQueries({
        leftTerms: domainTerms.length > 0 ? domainTerms : [baseAnchor],
        rightTerms: problemTerms.length > 0 ? problemTerms : modifierTerms.slice(0, 3),
        limit: queryPairLimit,
      }),
      ...buildDiscoveryPairQueries({
        leftTerms: methodTerms.length > 0 ? methodTerms : modifierTerms.slice(0, 3),
        rightTerms: problemTerms.length > 0 ? problemTerms : modifierTerms.slice(0, 3),
        limit: bridgeStage ? 6 : 4,
      }),
      ...buildDiscoveryPairQueries({
        leftTerms: anchorPaperTerms.length > 0 ? anchorPaperTerms : [baseAnchor],
        rightTerms: problemTerms.length > 0 ? problemTerms : modifierTerms.slice(0, 4),
        limit: bridgeStage ? 6 : 4,
      }),
      ...buildDiscoveryPairQueries({
        leftTerms: topicSpecificQueryTerms.slice(0, bridgeStage ? 10 : 6),
        rightTerms: [...problemTerms, ...methodTerms].slice(0, bridgeStage ? 10 : 8),
        limit: topicSpecificPairLimit,
      }),
      ...anchorPaperTerms,
      ...anchorNodeQueries,
      ...topicSpecificQueryTerms,
      ...modifierTerms,
    ],
    finalQueryLimit,
  )
  const targetBranchIds = uniqueNonEmpty([
    args.input.branchId,
    ...args.stageWindow.anchorPapers.map((paper) => paper.branchId),
    ...args.stageWindow.anchorNodes.map((node) => node.branchId),
  ])
  const structuredQueries: DiscoveryQuery[] = queries.map((query, index) => ({
    query,
    rationale:
      index === 0
        ? `Main stage discovery for ${args.stageWindow.stageLabel}`
        : `Broaden adjacent evidence for ${args.stageWindow.stageLabel}`,
    targetProblemIds: args.stageWindow.anchorNodes.map((node) => node.nodeId),
    targetBranchIds,
    targetAnchorPaperIds: anchorPapers,
    focus: index === 0 ? 'problem' : index % 2 === 0 ? 'method' : 'citation',
  }))

return {
    topicId: args.topic.id,
    branchId: args.input.branchId ?? targetBranchIds[0] ?? undefined,
    stageIndex: args.stageWindow.targetStageIndex,
    discoveryRounds, // 使用动态配置
    semanticScholarLimit, // 使用动态Semantic Scholar上限
    maxPapersPerNode, // 使用动态每节点论文上限
    queries:
      queries.length > 0
        ? queries
        : buildDiscoveryQueries(
            selectDiscoveryAnchor([args.topic.nameEn, args.topicDef.focusLabel, args.topic.focusLabel]),
            prioritizeExternalDiscoveryTerms([args.topicDef.focusLabel, args.topic.nameEn], 6),
            4,
          ),
    discoveryQueries: structuredQueries,
    stageLabel: args.stageWindow.stageLabel,
    anchorPapers,
    anchorPaperDetails: args.stageWindow.anchorPapers,
    anchorNodes: args.stageWindow.anchorNodes,
    startDate: args.stageWindow.startDate,
    endDateExclusive: args.stageWindow.endDateExclusive,
    searchStartDate: args.stageWindow.searchStartDate,
    searchEndDateExclusive: args.stageWindow.searchEndDateExclusive,
    bootstrapMode: args.stageWindow.bootstrapMode,
    windowMonths: args.stageWindow.windowMonths,
    maxCandidates: Math.max(args.input.maxCandidates || args.topicDef.defaults.maxCandidates || 8, 18),
    discoverySource: args.input.discoverySource || 'external-only',
  }
}

function buildMultiAngleDiscoveryPlan(args: {
  topic: NonNullable<TopicRecord>
  topicDef: TopicDefinitionLike
  input: PaperTrackerInput
  stageWindow: DiscoveryStageWindow
  discoveryQueryLimit?: number
  discoveryRounds?: number
  semanticScholarLimit?: number
  maxPapersPerNode?: number
  minimumUsefulPapersPerNode?: number
}) {
  const basePlan = buildDiscoveryPlan({
    topic: args.topic,
    topicDef: args.topicDef,
    input: args.input,
    stageWindow: args.stageWindow,
    discoveryQueryLimit: args.discoveryQueryLimit,
    discoveryRounds: args.discoveryRounds,
    semanticScholarLimit: args.semanticScholarLimit,
    maxPapersPerNode: args.maxPapersPerNode,
  })
  const normalizedAngles = normalizeDurationResearchAngles(
    args.input.durationResearchPolicy?.researchAngles,
  )

  if (normalizedAngles.length === 0) {
    return {
      ...basePlan,
      minimumUsefulPapersPerNode:
        args.minimumUsefulPapersPerNode ??
        args.input.minimumUsefulPapersPerNode ??
        Math.max(4, Math.ceil(basePlan.maxPapersPerNode / 2)),
    }
  }

  const anchorPaperTerms = args.stageWindow.anchorPapers.map((paper) => paper.title)
  const stageNodeTerms = args.stageWindow.anchorNodes.flatMap((node) => [node.title, node.summary])
  const bridgeStage = isAutonomousDrivingBridgeStage({
    topicId: args.topicDef.id,
    stageWindow: args.stageWindow,
    anchorPaperTerms,
    stageNodeTerms,
  })
  const baseAnchor = selectStageAwareDiscoveryAnchor({
    topicDef: args.topicDef,
    topic: args.topic,
    bridgeStage,
    anchorPaperTerms,
    stageNodeTerms,
    topicSpecificTerms: buildTopicSpecificDiscoveryBoostTerms({
      topicId: args.topicDef.id,
      stageWindow: args.stageWindow,
      termPool: [
        args.topicDef.nameEn,
        args.topic.nameEn ?? args.topic.nameZh,
        args.topicDef.focusLabel,
        args.topic.focusLabel ?? args.topicDef.focusLabel,
        ...anchorPaperTerms,
        ...stageNodeTerms,
        ...args.topicDef.queryTags,
        ...args.topicDef.problemPreference,
      ],
      anchorPaperTerms,
      stageNodeTerms,
    }),
  })
  const problemTerms = collectPatternMatchedDiscoveryTerms(
    basePlan.queries,
    bridgeStage
      ? /\b(?:control|driving policy|policy learning|recovery|intervention|steering|simulation|attention|interpretable|dataset)\b/giu
      : /\b(?:planning|simulation|closed[- ]loop|control|forecasting|trajectory prediction|safety|policy learning|reasoning|action models?)\b/giu,
    bridgeStage ? 10 : 8,
  )
  const methodTerms = collectPatternMatchedDiscoveryTerms(
    basePlan.queries,
    bridgeStage
      ? /\b(?:end[- ]to[- ]end|imitation learning|behavior cloning|behaviour cloning|conditional imitation|direct perception|attention|visual attention|causal attention|interpretable|cognitive model)\b/giu
      : /\b(?:vision[- ]language[- ]action|vla|world models?|latent world models?|latent dynamics|video generation|foundation models?|diffusion|transformers?|end[- ]to[- ]end)\b/giu,
    bridgeStage ? 10 : 8,
  )
  const domainTerms = collectPatternMatchedDiscoveryTerms(
    [
      baseAnchor,
      ...basePlan.queries,
      args.topicDef.nameEn,
      args.topicDef.focusLabel,
      ...args.topicDef.queryTags,
    ],
    /\b(?:autonomous driving|self[- ]driving|driving|robotics?|navigation|embodied ai|embodied agents?)\b/giu,
    6,
  )
  const durationAnglePlan = buildDurationAngleQueries({
    baseAnchor,
    stageLabel: args.stageWindow.stageLabel,
    domainTerms,
    problemTerms,
    methodTerms,
    angles: normalizedAngles,
  })
  const mergedQueries = uniqueNonEmpty(
    [...durationAnglePlan.queries, ...basePlan.queries],
    Math.max(basePlan.queries.length + durationAnglePlan.queries.length, basePlan.queries.length),
  )
  const structuredQueries = mergedQueries.map((query, index) => {
    const angleMeta = durationAnglePlan.queryMeta.get(query)
    const baseMeta = basePlan.discoveryQueries.find((entry) => entry.query === query)

    return {
      query,
      rationale:
        angleMeta?.rationale ??
        baseMeta?.rationale ??
        (index === 0
          ? `Main stage discovery for ${args.stageWindow.stageLabel}`
          : `Broaden adjacent evidence for ${args.stageWindow.stageLabel}`),
      targetProblemIds: baseMeta?.targetProblemIds ?? args.stageWindow.anchorNodes.map((node) => node.nodeId),
      targetBranchIds:
        baseMeta?.targetBranchIds ??
        uniqueNonEmpty([
          args.input.branchId,
          ...args.stageWindow.anchorPapers.map((paper) => paper.branchId),
          ...args.stageWindow.anchorNodes.map((node) => node.branchId),
        ]),
      targetAnchorPaperIds: baseMeta?.targetAnchorPaperIds ?? basePlan.anchorPapers,
      focus:
        angleMeta?.focus ??
        baseMeta?.focus ??
        (index === 0 ? 'problem' : index % 2 === 0 ? 'method' : 'citation'),
    } satisfies DiscoveryQuery
  })

  return {
    ...basePlan,
    queries: mergedQueries,
    discoveryQueries: structuredQueries,
    minimumUsefulPapersPerNode: Math.min(
      basePlan.maxPapersPerNode,
      args.minimumUsefulPapersPerNode ??
        args.input.minimumUsefulPapersPerNode ??
        Math.max(4, Math.ceil(basePlan.maxPapersPerNode / 2)),
    ),
  }
}

function mapExternalCandidateSourceToDiscoverySource(
  source: 'arxiv' | 'openalex' | 'semantic-scholar' | 'crossref',
): ArxivPaper['discoverySource'] {
  if (source === 'openalex') return 'openalex'
  if (source === 'semantic-scholar') return 'semantic-scholar'
  if (source === 'crossref') return 'crossref'
  return 'arxiv-api'
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
          'User-Agent': 'TraceMindResearch/1.0',
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
      'User-Agent': 'TraceMindResearch/1.0 (mailto:research@example.com)',
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
  admissionContext?: TopicAdmissionContext,
) {
  return papers.filter((paper) => {
    const fitScore = scorePaperDiscoveryFit(paper, topicDef, queries)
    const queryHits = collectMatchedQueries(paper, queries, queries.length)
    const titleText = `${paper.title} ${paper.summary}`.toLowerCase()
    const directTopicFit =
      /\bworld model\b|\bworld models\b/u.test(titleText) &&
      /\bautonomous driving\b|\bself-driving\b|\bself driving\b/u.test(titleText)
    const retainedByTopicGuard =
      admissionContext &&
      shouldRetainDiscoveredPaper({
        paper,
        topicDef,
        queries,
        admissionContext,
      })

    return fitScore >= 0.42 || queryHits.length > 0 || directTopicFit || Boolean(retainedByTopicGuard)
  })
}

function mergeDiscoveryResults(
  primary: ArxivPaper[],
  fallback: ArxivPaper[],
  topicDef: TopicDefinitionLike,
  queries: string[],
  admissionContext?: TopicAdmissionContext,
) {
  const merged: ArxivPaper[] = []
  const seen = new Set<string>()

  for (const paper of [...primary, ...fallback]) {
    const key = `${paper.id}::${paper.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(paper)
  }

  return filterDiscoveryResults(merged, topicDef, queries, admissionContext)
}

function buildPlanAdmissionContext(plan: ReturnType<typeof buildDiscoveryPlan>): TopicAdmissionContext {
  return {
    topicId: plan.topicId,
    targetStageIndex: plan.stageIndex,
    bootstrapMode: plan.bootstrapMode,
    stageLabel: plan.stageLabel,
    anchorPaperTitles: plan.anchorPaperDetails.map((paper) => paper.title),
    anchorNodeTexts: plan.anchorNodes.flatMap((node) => [node.title, node.summary]),
  }
}

function shouldRetainDiscoveredPaper(args: {
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  queries: string[]
  admissionContext: TopicAdmissionContext
}) {
  const signals = buildTopicAdmissionSignals(
    args.paper,
    args.topicDef,
    args.queries,
    args.admissionContext,
  )

  if (signals.directTopicLexicalFit) return true
  if (signals.earlyStageDrivingFit && !signals.earlyStageNoiseSignal) return true
  if (signals.hasWorldModelFamilySignal && signals.hasDrivingSignal) return true

  return passesTopicAdmissionGuard({
    paper: args.paper,
    topicDef: args.topicDef,
    queries: args.queries,
    candidateType: 'branch',
    admissionContext: args.admissionContext,
  })
}

function buildFollowOnDiscoveryQueries(args: {
  plan: ReturnType<typeof buildDiscoveryPlan>
  discovered: ArxivPaper[]
  topicDef: TopicDefinitionLike
}) {
  const admissionContext = buildPlanAdmissionContext(args.plan)
  const seedPapers = [...args.discovered]
    .filter((paper) =>
      shouldRetainDiscoveredPaper({
        paper,
        topicDef: args.topicDef,
        queries: args.plan.queries,
        admissionContext,
      }),
    )
    .sort(
      (left, right) =>
        scorePaperDiscoveryFit(right, args.topicDef, args.plan.queries) -
        scorePaperDiscoveryFit(left, args.topicDef, args.plan.queries),
    )
    .slice(0, Math.max(8, args.plan.maxCandidates)) // Changed from Math.max(4, Math.min(args.plan.maxCandidates, 8)) to allow more seed papers

  const existingQueries = new Set(
    args.plan.queries
      .map((query) => normalizeDiscoveryTerm(query)?.toLowerCase())
      .filter((query): query is string => Boolean(query)),
  )
  const terms = prioritizeExternalDiscoveryTerms(
    [
      ...seedPapers.map((paper) => paper.title),
      ...seedPapers.map((paper) => clipText(paper.summary, 96)),
      ...args.plan.queries,
      ...(args.topicDef.id === 'autonomous-driving'
        ? [
            ...AUTONOMOUS_DRIVING_WORLD_MODEL_QUERY_TERMS,
            ...AUTONOMOUS_DRIVING_FAMILY_QUERY_TERMS,
          ]
        : []),
    ],
    DISCOVERY_QUERY_LIMIT + 6,
  )

  return uniqueNonEmpty(
    terms.filter((query) => {
      const normalized = normalizeDiscoveryTerm(query)?.toLowerCase()
      if (!normalized) return false
      return !existingQueries.has(normalized)
    }),
    DISCOVERY_QUERY_LIMIT,
  ).map((query, index) => ({
    query,
    rationale: `Follow-on expansion for ${args.plan.stageLabel}`,
    targetProblemIds: args.plan.anchorNodes.map((node) => node.nodeId),
    targetBranchIds: args.plan.branchId ? [args.plan.branchId] : [],
    targetAnchorPaperIds: args.plan.anchorPapers,
    focus: index % 3 === 0 ? 'citation' : index % 3 === 1 ? 'merge' : 'method',
  } satisfies DiscoveryQuery))
}

function buildFollowOnDiscoveryAnchors(args: {
  plan: ReturnType<typeof buildDiscoveryPlan>
  discovered: ArxivPaper[]
}) {
  const anchors = [...args.plan.anchorPaperDetails]
  const seenPaperIds = new Set(anchors.map((anchor) => anchor.paperId))

  for (const paper of args.discovered) {
    if (seenPaperIds.has(paper.id)) continue
    anchors.push({
      paperId: paper.id,
      title: paper.title,
      published: paper.published,
      branchId: args.plan.branchId,
      // Use openAlexId directly from ArxivPaper (already extracted during discovery)
      openAlexId: paper.openAlexId,
    })
    seenPaperIds.add(paper.id)
    if (anchors.length >= Math.max(args.plan.anchorPaperDetails.length + 4, 6)) {
      break
    }
  }

  return anchors
}

async function discoverPapers(
  plan: ReturnType<typeof buildDiscoveryPlan>,
  topicDef: TopicDefinitionLike,
  context: SkillContext,
) {
  const discovered: ArxivPaper[] = []
  const seenDiscoveryKeys = new Set<string>()
  const startDate = new Date(plan.startDate)
  const endDate = new Date(plan.endDateExclusive.getTime() - 1)
  const admissionContext = buildPlanAdmissionContext(plan)
  const queryResults = await mapWithConcurrency(
    plan.queries.map((query, index) => ({ query, index })),
    DISCOVERY_QUERY_CONCURRENCY,
    async ({ query, index }) => {
      const cacheKey = `${query.toLowerCase()}::${startDate.toISOString().slice(0, 10)}::${endDate.toISOString().slice(0, 10)}::${plan.maxCandidates}`
      const cached = discoveryQueryCache.get(cacheKey)
      const cacheFresh =
        cached && Date.now() - cached.cachedAt <= DISCOVERY_QUERY_CACHE_TTL_MS

      if (cacheFresh) {
        return {
          index,
          query,
          papers: cached.papers,
        }
      }

      if (index > 0) {
        await sleep(
          Math.min(index, DISCOVERY_QUERY_CONCURRENCY) *
            Math.max(80, Math.round(DISCOVERY_QUERY_DELAY_MS / 3)),
        )
      }

      arxivRateLimitedUntil = Math.max(
        arxivRateLimitedUntil,
        await getSourceCooldownUntil('arxiv'),
      )

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
            maxResults: Math.max(10, plan.maxCandidates * 3),
          })
          if (results.length > 0) {
            await noteSourceSuccess('arxiv')
          }
        }
      } catch (error) {
        if (isRateLimitError(error)) {
          arxivRateLimitedUntil = Date.now() + ARXIV_RATE_LIMIT_COOLDOWN_MS
          await noteSourceRateLimit('arxiv', {
            defaultCooldownMs: ARXIV_RATE_LIMIT_COOLDOWN_MS,
          })
          context.logger.warn('arXiv query rate limited; entering cooldown window', {
            query,
            cooldownMs: ARXIV_RATE_LIMIT_COOLDOWN_MS,
          })
        } else if (isArxivUnavailableError(error)) {
          arxivRateLimitedUntil = Date.now() + ARXIV_UNAVAILABLE_COOLDOWN_MS
          await noteSourceRateLimit('arxiv', {
            defaultCooldownMs: ARXIV_UNAVAILABLE_COOLDOWN_MS,
          })
          context.logger.warn('arXiv query timed out; entering temporary cooldown window', {
            query,
            cooldownMs: ARXIV_UNAVAILABLE_COOLDOWN_MS,
            error,
          })
        } else {
          context.logger.warn('arXiv query failed', { query, error })
        }
      }

      results = filterDiscoveryResults(results, topicDef, plan.queries, admissionContext)

      if (results.length < Math.max(8, Math.ceil(plan.maxCandidates * 0.85))) {
        try {
          const fallbackResults = await searchOpenAlex({
            query,
            startDate,
            endDate,
            maxResults: Math.max(10, plan.maxCandidates * 3),
          })
          results = mergeDiscoveryResults(
            results,
            fallbackResults,
            topicDef,
            plan.queries,
            admissionContext,
          )
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

      return {
        index,
        query,
        papers: results,
      }
    },
  )

  for (const result of queryResults.sort((left, right) => left.index - right.index)) {
    for (const paper of result.papers) {
      const identityKeys = collectDiscoveryIdentityKeys(paper)
      if (identityKeys.some((key) => seenDiscoveryKeys.has(key))) continue
      identityKeys.forEach((key) => seenDiscoveryKeys.add(key))
      discovered.push(paper)
    }
  }

  function processDiscoveryCandidates(
    candidates: Awaited<ReturnType<typeof discoverWithSnowball>>,
    startDate: Date,
    endDate: Date,
    topicDef: TopicDefinitionLike,
    queries: string[],
    admissionContext: TopicAdmissionContext,
    seenDiscoveryKeys: Set<string>,
    discovered: ArxivPaper[]
  ) {
    for (const candidate of candidates) {
      const publishedAt = new Date(candidate.published)
      if (Number.isNaN(publishedAt.getTime())) continue
      if (publishedAt < startDate || publishedAt >= endDate) continue

      const arxivPaper: ArxivPaper = {
        id: candidate.paperId,
        title: candidate.title,
        summary: candidate.abstract,
        authors: candidate.authors,
        published: candidate.published,
        categories: [],
        primaryCategory: undefined,
        pdfUrl: candidate.pdfUrl,
        arxivUrl: candidate.arxivUrl ?? (candidate.source === 'arxiv' ? `https://arxiv.org/abs/${candidate.paperId}` : ''),
        openAlexId: candidate.openAlexId ?? (candidate.source === 'openalex' ? candidate.paperId : undefined),
        discoverySource: mapExternalCandidateSourceToDiscoverySource(candidate.source),
      }

      if (!shouldRetainDiscoveredPaper({
        paper: arxivPaper,
        topicDef,
        queries,
        admissionContext,
      })) {
        continue
      }

      const identityKeys = collectDiscoveryIdentityKeys(arxivPaper)
      if (identityKeys.some((key) => seenDiscoveryKeys.has(key))) continue
      identityKeys.forEach((key) => seenDiscoveryKeys.add(key))
      discovered.push(arxivPaper)
    }
  }

  if (plan.discoverySource !== 'internal-only' && plan.anchorPaperDetails.length > 0) {
    try {
      // 多轮发现循环 - 支持discoveryRounds配置（最多10轮）
      const totalRounds = Math.min(plan.discoveryRounds, 10) // 上限10轮

      for (let round = 1; round <= totalRounds; round++) {
        // 动态调整每轮参数：第一轮最深度，后续轮次逐渐收敛
        const snowballDepth = round === 1 ? 2 : Math.max(1, 2 - Math.floor((round - 1) / 3))
        const snowballMaxCandidates = round === 1 ? 30 : Math.max(15, 30 - (round - 1) * 3)
        const openAlexMaxCandidates = round === 1 ? 20 : Math.max(10, 20 - (round - 1) * 2)
        const maxResultsPerQuery = round === 1
          ? Math.max(10, Math.ceil(plan.maxCandidates * 1.25))
          : Math.max(6, plan.maxCandidates - (round - 1) * 2)
        const maxTotalCandidates = round === 1
          ? Math.max(plan.maxCandidates * 5, 72)
          : Math.max(plan.maxCandidates * 2, 36)

        // 获取本轮anchors
        const roundAnchors = round === 1
          ? plan.anchorPaperDetails
          : buildFollowOnDiscoveryAnchors({ plan, discovered })

        // 获取本轮queries
        const roundQueries = round === 1
          ? plan.discoveryQueries
          : buildFollowOnDiscoveryQueries({ plan, discovered, topicDef })

        if (roundQueries.length === 0 && round > 1) {
          // 没有新的查询，停止后续轮次
          break
        }

        // 执行发现
        const roundCandidates = await discoverWithSnowball({
          anchors: roundAnchors,
          queries: roundQueries,
          discoveryRound: round,
          maxWindowMonths: Math.max(plan.windowMonths, round),
          searchStartDate: plan.searchStartDate,
          searchEndDateExclusive: plan.searchEndDateExclusive,
          maxResultsPerQuery,
          maxTotalCandidates,
          semanticScholarLimit: plan.semanticScholarLimit,
          enableSnowball: true,
          snowballDepth,
          snowballMaxCandidates,
          enableOpenAlex: true,
          openAlexMaxCandidates,
        })

        // 处理本轮结果
        processDiscoveryCandidates(
          roundCandidates,
          startDate,
          endDate,
          topicDef,
          plan.queries,
          admissionContext,
          seenDiscoveryKeys,
          discovered
        )

        // 如果本轮发现数量太少，提前终止
        if (round > 1 && roundCandidates.length < 5) {
          break
        }
      }
    } catch (error) {
      context.logger.warn('Structured external discovery failed', {
        stageLabel: plan.stageLabel,
        error,
      })
    }
  }

  discovered.sort((left, right) => {
    const scoreDiff =
      scorePaperDiscoveryFit(right, topicDef, plan.queries) -
      scorePaperDiscoveryFit(left, topicDef, plan.queries)
    if (scoreDiff !== 0) return scoreDiff
    return Date.parse(right.published) - Date.parse(left.published)
  })
  return discovered.slice(0, Math.max(plan.maxCandidates * 4, 48))
}

function buildExistingPaperKeySet(topic: NonNullable<TopicRecord>) {
  return new Set(
    topic.papers.flatMap((paper: any) =>
      [
        paper.id,
        paper.title,
        paper.titleZh,
        normalizeTitleForDiscoveryKey(paper.title),
        normalizeTitleForDiscoveryKey(paper.titleZh),
        extractArxivId(paper.arxivUrl),
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  )
}

function normalizeTitleForDiscoveryKey(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function collectDiscoveryIdentityKeys(paper: {
  id?: string | null
  title?: string | null
  titleZh?: string | null
  arxivUrl?: string | null
}) {
  return uniqueNonEmpty(
    [
      paper.id,
      extractArxivId(paper.arxivUrl),
      normalizeTitleForDiscoveryKey(paper.title),
      normalizeTitleForDiscoveryKey(paper.titleZh),
    ],
    8,
  )
}

const PAPER_EVALUATION_GENERIC_TITLE_TOKENS = new Set([
  'autonomous',
  'driving',
  'self',
  'world',
  'model',
  'models',
  'vision',
  'language',
  'action',
  'end',
  'planning',
  'foundation',
  'based',
  'with',
  'for',
  'from',
  'via',
  'towards',
  'real',
  'open',
  'source',
  'initial',
  'survey',
  'driven',
])

function extractPaperSpecificTerms(value: string) {
  return uniqueNonEmpty(
    tokenizeSearchText(value)
      .map((token) => token.toLowerCase())
      .filter(
        (token) =>
          token.length >= 4 && !PAPER_EVALUATION_GENERIC_TITLE_TOKENS.has(token),
      ),
    8,
  )
}

function looksPaperSpecificEvaluationWeak(
  paper: ArxivPaper,
  evaluation: LlmPaperEvaluation,
) {
  const reason = evaluation.why.toLowerCase()
  const titleTerms = extractPaperSpecificTerms(paper.title)
  const reasonHasSpecificTitleTerm = titleTerms.some((token) => reason.includes(token))
  const genericReason =
    /\bthe topic is\b/u.test(reason) ||
    /\bit could help researchers understand the field better\b/u.test(reason) ||
    /\bmust be exactly as specified\b/u.test(reason) ||
    /\bperhaps requiring foundational\b/u.test(reason) ||
    /\bkeyword overlap fallback\b/u.test(reason) ||
    /^for autonomous driving\b/u.test(reason)

  return (
    evaluation.confidence <= 0.55 &&
    (!reasonHasSpecificTitleTerm || genericReason)
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
  // 广纳贤文: Support three-tier verdict (admit, candidate, reject)
  if (value === 'admit' || value === 'reject' || value === 'candidate') return value
  if (typeof value === 'string') {
    const lowered = value.toLowerCase()
    if (lowered.includes('admit') || lowered.includes('include')) return 'admit'
    if (lowered.includes('candidate') || lowered.includes('maybe') || lowered.includes('review')) return 'candidate'
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
    raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)?.[1] ?? raw.match(/\{[\s\S]*\}/u)?.[0] ?? raw

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
    const confidence = normalizeConfidence(parsed.confidence)

    // 广纳贤文: Lower thresholds for more papers per node (user expects 10-20+ papers)
    // 0.45+ → admitted (was 0.55)
    // 0.25-0.45 → candidate (was 0.35-0.55)
    // <0.25 → rejected
    const thresholdStatus = confidence >= 0.45 ? 'admit' : confidence >= 0.25 ? 'candidate' : 'reject'

    return {
      verdict: normalizeVerdict(parsed.verdict ?? parsed.decision ?? parsed.status, thresholdStatus),
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
  if (
    !('verdict' in lineMap) &&
    !('decision' in lineMap) &&
    !('status' in lineMap) &&
    !('candidatetype' in lineMap) &&
    !('confidence' in lineMap)
  ) {
    return null
  }

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
  // 广纳贤文: Add 'candidate' tier for medium-confidence papers
  const verdict =
    /\badmit\b|\binclude\b|\bshould enter\b|\bworth adding\b|\bhighly relevant\b|\bvery relevant\b/u.test(lower)
      ? 'admit'
      : /\bcandidate\b|\bmaybe\b|\breview\b|\bpossible\b|\bmoderate\b|\bpartial(?:ly)? relevant\b|\bpossible fit\b/u.test(lower)
        ? 'candidate'
        : /\breject\b|\bexclude\b|\bnot relevant\b|\bshould not\b|\bweak fit\b|\bpoor fit\b/u.test(lower)
          ? 'reject'
          : 'reject' // default to reject if unclear
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
  const combined = `${raw}\n${parsed.why}`.toLowerCase()
  const metaText =
    /\bthe user wants me to classify\b/u.test(combined) ||
    /\bi should classify\b/u.test(combined) ||
    /\bi need to classify\b/u.test(combined) ||
    /\bi will classify\b/u.test(combined) ||
    /\btask is to classify\b/u.test(combined) ||
    /\bpaper classifier\b/u.test(combined) ||
    /\bactive research topic\b/u.test(combined) ||
    /\bspecific research topic\b/u.test(combined) ||
    /\bthis paper should be evaluated\b/u.test(combined)
  const lowSignalReason =
    parsed.confidence === 0.5 &&
    (
      parsed.why.length < 24 ||
      /\b(?:llm evaluation|classification criteria|rejection criteria|key points|paper title suggests|the paper is titled|the paper introduces|let'?s analyze|citeintent)\b/u.test(
        combined,
      ) ||
      /[*_#`]/u.test(parsed.why) ||
      /(\b.{18,80}?\b)\s+\1/u.test(parsed.why)
    )

  if (source === 'text') {
    return metaText || lowSignalReason
  }

  return lowSignalReason
}

function buildPaperEvaluationPrompt(args: {
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  targetStageIndex: number
  admissionContext?: TopicAdmissionContext
}) {
  return [
    'Classify whether this paper should enter the active research topic.',
    'Admit papers when they either advance the mainline directly, widen the evidence base, provide a useful comparison, or transfer a nearby method into the topic.',
    'Use candidateType to express weight: direct = core mainline, branch = adjacent but worth retaining, transfer = cross-domain method that may reshape the topic.',
    'Reject papers that are only temporally nearby or lexically adjacent but belong to an unrelated domain.',
    'Transfer is only for papers whose method can clearly be carried into the same research problem, not for generic inspiration.',
    'Return one strict JSON object only with these exact keys:',
    '{"verdict":"admit|reject","candidateType":"direct|branch|transfer","citeIntent":"supporting|contrasting|method-using|background","confidence":0.0,"why":"brief reason"}',
    'If your gateway cannot preserve JSON, output exactly five plain lines using the same keys in key:value form and nothing else.',
    'Do not mention the user, the task, or your reasoning process.',
    `Topic zh title: ${args.topicDef.nameZh}`,
    `Topic en title: ${args.topicDef.nameEn}`,
    `Topic focus: ${args.topicDef.focusLabel}`,
    `Stage index: ${args.targetStageIndex}`,
    args.admissionContext?.stageLabel ? `Stage window: ${args.admissionContext.stageLabel}` : '',
    args.admissionContext && args.admissionContext.anchorPaperTitles.length > 0
      ? `Stage anchor papers: ${args.admissionContext.anchorPaperTitles.slice(0, 4).join(' | ')}`
      : '',
    args.admissionContext && args.admissionContext.anchorNodeTexts.length > 0
      ? `Stage anchor problems: ${args.admissionContext.anchorNodeTexts.slice(0, 3).join(' | ')}`
      : '',
    args.topicDef.id === 'autonomous-driving'
      ? 'For early autonomous-driving stages, admit papers that continue the same driving-control problem line even when they do not yet use explicit world-model wording.'
      : '',
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
    'If uncertain, prefer reject over admitting an off-topic transfer.',
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

  // NO FALLBACK: Use retry mechanism for paper evaluation
  return withRetry(
    async () => {
      return omniGateway.complete({
        task: 'general_chat',
        preferredSlot: 'language',
        messages: [
          {
            role: 'system',
            content: repair
              ? 'You are repairing a paper-classifier output. Output exactly five plain key:value lines with the keys verdict, candidateType, citeIntent, confidence, and why. Never mention the user, the task, or your reasoning process.'
              : 'You are a strict paper classifier. Output exactly five plain key:value lines with the keys verdict, candidateType, citeIntent, confidence, and why. Never mention the user, the task, or your reasoning process.',
          },
          {
            role: 'user',
            content: args.prompt,
          },
        ],
        json: false,
        temperature: 0,
        maxTokens: Math.min(args.input.maxTokens ?? (repair ? 120 : 140), repair ? 160 : 180),
      })
    },
    { maxRetries: 3 }
  )
}

async function evaluatePaperWithLLM(args: {
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  targetStageIndex: number
  input: PaperTrackerInput
  admissionContext?: TopicAdmissionContext
}) {
  const cacheKey = `${args.topicDef.id}:${args.targetStageIndex}:${args.paper.id}`
  const cached = paperEvaluationCache.get(cacheKey)
  if (cached && Date.now() - cached.cachedAt <= PAPER_EVALUATION_CACHE_TTL_MS) {
    return cached.evaluation
  }

  const prompt = buildPaperEvaluationPrompt({
    paper: args.paper,
    topicDef: args.topicDef,
    targetStageIndex: args.targetStageIndex,
    admissionContext: args.admissionContext,
  })
  const response = await requestPaperEvaluationCompletion({
    prompt,
    input: args.input,
  })

  if (response.usedFallback || response.issue) {
    throw new Error(
      response.issue
        ? `${response.issue.code}: ${response.issue.message}`
        : 'paper evaluation fell back to backend response',
    )
  }

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

  if (looksPaperSpecificEvaluationWeak(args.paper, parsed.evaluation)) {
    throw new Error(
      `Paper evaluation stayed too generic for ${args.paper.title}. response=${clipText(parsed.evaluation.why, 140)}`,
    )
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
  admissionContext?: TopicAdmissionContext,
) {
  const paperText = buildPaperSearchText(paper)
  const discoveryScore = scorePaperDiscoveryFit(paper, topicDef, queries)
  const matchedQueries = collectMatchedQueries(paper, queries, queries.length)
  const admissionSignals = admissionContext
    ? buildTopicAdmissionSignals(paper, topicDef, queries, admissionContext)
    : null
  const matchBoost =
    queries.length > 0 ? matchedQueries.length / Math.max(1, Math.min(queries.length, 6)) : 0
  const focusMatchScore = Math.max(
    queryMatchScore(topicDef.focusLabel, paperText),
    queryMatchScore(topicDef.nameEn, paperText),
    queryMatchScore(topicDef.nameZh, paperText),
  )
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
    focusMatchScore * 0.12 +
    (strongMainlineHit ? 0.2 : 0) +
    (strongTopicLexicalFit ? 0.16 : 0) +
    (exactTopicHit ? 0.08 : 0)
  if (admissionSignals?.earlyStageDrivingFit && !admissionSignals.earlyStageNoiseSignal) {
    score +=
      0.12 +
      Math.min(0.08, admissionSignals.stageAnchorHitCount * 0.04) +
      Math.min(0.1, admissionSignals.stageContinuityEvidenceScore * 0.02)
    score = Math.max(
      score,
      admissionSignals.stageContinuityEvidenceScore >= 4
        ? 0.64
        : matchedQueries.length >= 1
          ? 0.62
          : 0.56,
    )
  }
  if (strongTopicLexicalFit && exactTopicHit) {
    score = Math.max(score, 0.74)
  } else if (strongTopicLexicalFit) {
    score = Math.max(score, 0.64)
  } else if (strongMainlineHit && exactTopicHit) {
    score = Math.max(score, 0.68)
  }
  if (
    !strongMainlineHit &&
    !strongTopicLexicalFit &&
    !(admissionSignals?.earlyStageDrivingFit && !admissionSignals.earlyStageNoiseSignal)
  ) {
    score = Math.min(score, exactTopicHit ? 0.68 : 0.58)
  }
  if (admissionSignals?.earlyStageNoiseSignal) {
    score = Math.min(score, 0.34)
  }
  if (
    focusMatchScore < 0.38 &&
    matchedQueries.length === 0 &&
    !strongMainlineHit &&
    !(admissionSignals?.earlyStageDrivingFit && !admissionSignals.earlyStageNoiseSignal)
  ) {
    score = Math.min(score, 0.46)
  }

  return Math.min(0.92, score)
}

const GENERIC_TOPIC_ANCHOR_TOKENS = new Set([
  'paper',
  'papers',
  'research',
  'model',
  'models',
  'method',
  'methods',
  'approach',
  'approaches',
  'system',
  'systems',
  'study',
  'studies',
  'analysis',
  'learning',
  'deep',
  'neural',
  'ai',
])

function buildTopicAnchorTerms(topicDef: TopicDefinitionLike) {
  return prioritizeExternalDiscoveryTerms(
    [topicDef.nameEn, topicDef.nameZh, topicDef.focusLabel, ...topicDef.queryTags],
    12,
  ).filter((term) => {
    const tokens = tokenizeSearchText(term).filter(
      (token) => !GENERIC_TOPIC_ANCHOR_TOKENS.has(token),
    )
    return tokens.length >= 2 || /[\u4e00-\u9fff]{2,}/u.test(term)
  })
}

function collectTopicAnchorTokens(topicDef: TopicDefinitionLike) {
  return uniqueNonEmpty(
    buildTopicAnchorTerms(topicDef)
      .flatMap((term) => tokenizeSearchText(term))
      .filter((token) => !GENERIC_TOPIC_ANCHOR_TOKENS.has(token)),
    12,
  )
}

function buildStageAnchorTerms(context?: TopicAdmissionContext | null) {
  if (!context) return [] as string[]

  return prioritizeExternalDiscoveryTerms(
    [...context.anchorPaperTitles, ...context.anchorNodeTexts],
    10,
  ).filter((term) => {
    const tokens = tokenizeSearchText(term).filter(
      (token) => !GENERIC_TOPIC_ANCHOR_TOKENS.has(token),
    )
    return tokens.length >= 2
  })
}

function buildTopicAdmissionSignals(
  paper: ArxivPaper,
  topicDef: TopicDefinitionLike,
  queries: string[],
  admissionContext?: TopicAdmissionContext,
) {
  const paperText = buildPaperSearchText(paper)
  const matchedQueries = collectMatchedQueries(paper, queries, queries.length)
  const discoveryScore = scorePaperDiscoveryFit(paper, topicDef, queries)
  const mainlineTerms = prioritizeExternalDiscoveryTerms(
    [topicDef.focusLabel, ...topicDef.problemPreference, ...topicDef.queryTags],
    12,
  ).filter((term) => tokenizeSearchText(term).length >= 2)
  const strongTermHitCount = mainlineTerms.filter((term) => queryMatchScore(term, paperText) >= 0.72).length
  const anchorTerms = buildTopicAnchorTerms(topicDef)
  const anchorTermHitCount = anchorTerms.filter((term) => queryMatchScore(term, paperText) >= 0.62).length
  const anchorTokens = collectTopicAnchorTokens(topicDef)
  const anchorTokenHitCount = anchorTokens.filter((token) => paperText.includes(token)).length
  const stageAnchorTerms = buildStageAnchorTerms(admissionContext)
  const stageAnchorHitCount = stageAnchorTerms.filter((term) => queryMatchScore(term, paperText) >= 0.54).length
  const focusMatchScore = Math.max(
    queryMatchScore(topicDef.focusLabel, paperText),
    queryMatchScore(topicDef.nameEn, paperText),
    queryMatchScore(topicDef.nameZh, paperText),
  )
  const hasDrivingSignal = /\bautonomous driving\b|\bself-driving\b|\bself driving\b|\bautonomous vehicles?\b/u.test(
    paperText,
  )
  const hasWorldModelSignal = /\bworld model\b|\bworld models\b/u.test(paperText)
  const hasWorldModelFamilySignal =
    hasWorldModelSignal ||
    /\blatent (?:model|models|dynamics)\b|\boccupancy (?:model|models)\b|\bscene (?:model|models|token|tokens)\b|\bgenerative model\b|\bvideo prediction\b|\bclosed-loop simulation\b|\bsimulation\b|\bforecasting\b|\bdriving foundation model\b|\bfoundation model\b|\blanguage-conditioned\b|\brecovery policy\b|\baction token(?:ization|izer)?\b|\bmultimodal driving policy\b|\bood generalization\b|\blong-tail\b/u.test(
      paperText,
    )
  const autonomousDrivingBridgeSignal =
    /\bend[- ]to[- ]end\b|\bimitation learning\b|\bbehavior cloning\b|\bbehaviour cloning\b|\bconditional imitation\b|\bdirect perception\b|\bdriving policy\b|\brecovery policy\b|\brecovery\b|\bvisual attention\b|\bcausal attention\b|\battention\b|\binterpretable(?: learning)?\b|\bpolicy learning\b|\bdemonstration learning\b|\bdriving affordance\b/u.test(
      paperText,
    )
  const endToEndDrivingSignal = /\bend[- ]to[- ]end\b|\bdirect perception\b/u.test(paperText)
  const policyControlSignal =
    /\bsteering(?: angle| control)?\b|\bdriving action\b|\bcontrol network\b|\bexpert driver\b|\breference policy\b|\bpolicy\b/u.test(
      paperText,
    )
  const imitationRecoverySignal =
    /\bimitation learning\b|\bdagger\b|\bsafedagger\b|\bbehavior cloning\b|\bbehaviour cloning\b|\bconditional imitation\b|\brecovery\b|\bintervention\b|\bquery-efficient\b/u.test(
      paperText,
    )
  const interpretabilitySignal =
    /\bvisual attention\b|\bcausal attention\b|\bvisual explanations?\b|\binterpretable(?: learning)?\b|\bexplainable\b/u.test(
      paperText,
    )
  const dataInfrastructureSignal =
    /\bdataset\b|\bbenchmark\b|\btestbed\b|\bsensor(?:s)?\b|\bradar\b|\bv2x\b|\blocalization\b|\bmapping\b/u.test(
      paperText,
    )
  const perceptionStackSignal =
    /\bsemantic segmentation\b|\bsegmentation\b|\bdetection\b|\bclassification\b|\bperception\b|\bshared encoder\b/u.test(
      paperText,
    )
  const safetyVerificationSignal =
    /\bverification\b|\badversarial perturbations?\b|\bsatisfiability modulo theory\b|\bsmt\b|\bimage classification\b/u.test(
      paperText,
    )
  const humanRobotInteractionSignal =
    /\btrust(?:-aware|-seeking)?\b|\bhuman(?:-robot)?\b|\bsupervisor'?s?\b|\bcollaboration\b|\bterrain coverage\b|\baerial\b|\binteractive behavior adaptation\b/u.test(
      paperText,
    )
  const communicationInfrastructureSignal =
    /\b5g\b|\blte\b|\bwireless(?: networks?)?\b|\bradio frame\b|\bframe structure\b|\bsubframe\b|\bnumerolog(?:y|ies)\b|\bmmwave\b|\bdoppler\b|\bchannel coding\b|\bthroughput\b|\bnetwork slicing\b|\bv2v communications?\b/u.test(
      paperText,
    )
  const operationalDrivingControlSignal =
    endToEndDrivingSignal ||
    policyControlSignal ||
    imitationRecoverySignal ||
    interpretabilitySignal ||
    /\bsteering(?: angle| control)?\b|\begomotion\b|\bvehicle motion\b|\bdriving model\b|\bdriving behavior\b|\blane following\b|\bfree space\b|\bobstacle distance\b|\bcognitive map\b/u.test(
      paperText,
    )
  const stageAnchorText = (admissionContext?.anchorPaperTitles ?? []).join(' ').toLowerCase()
  const stageAnchorsAlreadyWorldModelHeavy =
    /\bworld model\b|\boccupancy\b|\blatent dynamics\b|\bscene token\b|\bfoundation model\b|\blanguage-conditioned\b|\bvla\b|\baction token/u.test(
      stageAnchorText,
    )
  const autonomousDrivingBridgeEra =
    topicDef.id === 'autonomous-driving' &&
    !stageAnchorsAlreadyWorldModelHeavy &&
    (admissionContext?.targetStageIndex ?? 1) <= 8
  const earlyStageDrivingFit =
    autonomousDrivingBridgeEra &&
    hasDrivingSignal &&
    autonomousDrivingBridgeSignal
  const stageContinuityEvidenceScore =
    matchedQueries.length +
    Math.min(2, stageAnchorHitCount) +
    (endToEndDrivingSignal ? 1 : 0) +
    (policyControlSignal ? 1 : 0) +
    (imitationRecoverySignal ? 1 : 0) +
    (interpretabilitySignal ? 1 : 0)
  const earlyStageNoiseSignal =
    (communicationInfrastructureSignal && !operationalDrivingControlSignal) ||
    (humanRobotInteractionSignal &&
      !policyControlSignal &&
      !imitationRecoverySignal &&
      !interpretabilitySignal) ||
    (safetyVerificationSignal && !policyControlSignal && !imitationRecoverySignal) ||
    (perceptionStackSignal &&
      !policyControlSignal &&
      !imitationRecoverySignal &&
      !interpretabilitySignal) ||
    (dataInfrastructureSignal &&
      stageContinuityEvidenceScore <= 3 &&
      !policyControlSignal &&
      !imitationRecoverySignal &&
      !interpretabilitySignal)
  const directTopicLexicalFit =
    hasWorldModelSignal && hasDrivingSignal
  const hasTopicAnchor =
    focusMatchScore >= 0.58 ||
    anchorTermHitCount >= 1 ||
    stageAnchorHitCount >= 1 ||
    earlyStageDrivingFit ||
    (anchorTokens.length > 0 &&
      anchorTokenHitCount >= Math.min(anchorTokens.length >= 4 ? 2 : 1, anchorTokens.length))

  return {
    matchedQueries,
    discoveryScore,
    strongTermHitCount,
    anchorTermHitCount,
    anchorTokenHitCount,
    stageAnchorHitCount,
    focusMatchScore,
    hasTopicAnchor,
    hasDrivingSignal,
    hasWorldModelSignal,
    hasWorldModelFamilySignal,
    directTopicLexicalFit,
    autonomousDrivingBridgeEra,
    autonomousDrivingBridgeSignal,
    earlyStageDrivingFit,
    endToEndDrivingSignal,
    policyControlSignal,
    imitationRecoverySignal,
    interpretabilitySignal,
    dataInfrastructureSignal,
    perceptionStackSignal,
    safetyVerificationSignal,
    humanRobotInteractionSignal,
    communicationInfrastructureSignal,
    operationalDrivingControlSignal,
    stageContinuityEvidenceScore,
    earlyStageNoiseSignal,
  }
}

function normalizeCandidateTypeBySignals(
  candidateType: 'direct' | 'branch' | 'transfer',
  signals: ReturnType<typeof buildTopicAdmissionSignals>,
) {
  if (candidateType === 'direct' && !signals.directTopicLexicalFit) {
    return signals.hasWorldModelFamilySignal || signals.earlyStageDrivingFit ? 'branch' : 'transfer'
  }

  if (
    candidateType === 'branch' &&
    !signals.hasWorldModelFamilySignal &&
    !signals.earlyStageDrivingFit &&
    signals.anchorTermHitCount < 2 &&
    signals.strongTermHitCount < 2
  ) {
    return 'transfer'
  }

  return candidateType
}

function passesTopicAdmissionGuard(args: {
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  queries: string[]
  candidateType: 'direct' | 'branch' | 'transfer'
  admissionContext?: TopicAdmissionContext
}) {
  const signals = buildTopicAdmissionSignals(
    args.paper,
    args.topicDef,
    args.queries,
    args.admissionContext,
  )

  if (!signals.hasTopicAnchor) return false
  if (signals.directTopicLexicalFit) return true
  if (signals.earlyStageDrivingFit) {
    if (signals.earlyStageNoiseSignal) return false

    if (args.candidateType === 'direct') {
      return (
        signals.discoveryScore >= 0.46 &&
        signals.stageContinuityEvidenceScore >= 4 &&
        (signals.matchedQueries.length >= 1 || signals.stageAnchorHitCount >= 1)
      )
    }

    if (args.candidateType === 'branch') {
      return (
        (
          signals.discoveryScore >= 0.38 &&
          signals.stageContinuityEvidenceScore >= 3
        ) ||
        (
          signals.discoveryScore >= 0.34 &&
          signals.stageContinuityEvidenceScore >= 5 &&
          (
            signals.matchedQueries.length >= 1 ||
            signals.stageAnchorHitCount >= 1 ||
            signals.anchorTermHitCount >= 1
          )
        )
      )
    }

    return (
      signals.discoveryScore >= 0.42 &&
      signals.stageContinuityEvidenceScore >= 4 &&
      signals.matchedQueries.length >= 1
    )
  }

  // 非早期桥接阶段仍需要保留最基本的主题锚点，避免明显离题论文进入主线。
  if (args.candidateType === 'direct') {
    return (
      (signals.hasWorldModelFamilySignal || signals.directTopicLexicalFit) &&
      signals.hasTopicAnchor &&
      signals.focusMatchScore >= 0.25 &&
      (
        signals.strongTermHitCount >= 1 ||
        signals.matchedQueries.length >= 1 ||
        signals.discoveryScore >= 0.25 ||
        signals.stageContinuityEvidenceScore >= 1
      )
    )
  }

  if (args.candidateType === 'branch') {
    return (
      (signals.hasWorldModelFamilySignal || signals.earlyStageDrivingFit) &&
      signals.hasTopicAnchor &&
      signals.focusMatchScore >= 0.20 &&
      (
        signals.strongTermHitCount >= 1 ||
        signals.matchedQueries.length >= 1 ||
        signals.discoveryScore >= 0.20 ||
        signals.stageContinuityEvidenceScore >= 1
      )
    )
  }

  return (
    signals.hasTopicAnchor &&
    (signals.hasWorldModelFamilySignal || signals.earlyStageDrivingFit || signals.matchedQueries.length >= 1) &&
    signals.focusMatchScore >= 0.15 &&
    signals.discoveryScore >= 0.15
  )
}

function enforceTopicAdmissionGuard(args: {
  candidate: PaperCandidate
  paper: ArxivPaper
  topicDef: TopicDefinitionLike
  queries: string[]
  admissionContext?: TopicAdmissionContext
}) {
  if (args.candidate.status === 'rejected') {
    return args.candidate
  }

  const signals = buildTopicAdmissionSignals(
    args.paper,
    args.topicDef,
    args.queries,
    args.admissionContext,
  )
  const normalizedCandidateType = normalizeCandidateTypeBySignals(
    args.candidate.candidateType,
    signals,
  )
  const normalizedCandidate =
    normalizedCandidateType === args.candidate.candidateType
      ? args.candidate
      : ({
          ...args.candidate,
          candidateType: normalizedCandidateType,
          citeIntent:
            normalizedCandidateType === 'direct'
              ? 'supporting'
              : normalizedCandidateType === 'branch'
                ? 'background'
                : 'method-using',
          why: clipText(
            `${args.candidate.why} Reclassified as ${normalizedCandidateType} because the paper does not state an explicit autonomous-driving world-model match strongly enough for the mainline.`,
            220,
          ),
        } satisfies PaperCandidate)

  if (
    passesTopicAdmissionGuard({
      paper: args.paper,
      topicDef: args.topicDef,
      queries: args.queries,
      admissionContext: args.admissionContext,
      candidateType: normalizedCandidateType,
    })
  ) {
    return normalizedCandidate
  }

  const rejectReasons: string[] = []

  if (!signals.hasTopicAnchor) {
    rejectReasons.push('missing_topic_anchor')
  }
  if (!signals.directTopicLexicalFit && !signals.earlyStageDrivingFit) {
    rejectReasons.push('no_lexical_fit')
  }
  if (normalizedCandidateType === 'direct' && signals.focusMatchScore < 0.68) {
    rejectReasons.push(`focusMatchScore_${signals.focusMatchScore.toFixed(2)}_below_0.68`)
  }
  if (normalizedCandidateType === 'branch' && signals.focusMatchScore < 0.56) {
    rejectReasons.push(`focusMatchScore_${signals.focusMatchScore.toFixed(2)}_below_0.56`)
  }
  if (!signals.hasWorldModelFamilySignal) {
    rejectReasons.push('missing_world_model_signal')
  }
  if (signals.strongTermHitCount < 1) {
    rejectReasons.push(`strongTermHitCount_${signals.strongTermHitCount}_below_1`)
  }
  if (signals.earlyStageNoiseSignal) {
    rejectReasons.push('early_stage_noise')
  }

  const clearlyOffTopic =
    !signals.hasTopicAnchor ||
    (!signals.directTopicLexicalFit &&
      !signals.earlyStageDrivingFit &&
      !signals.hasWorldModelFamilySignal)

  if (clearlyOffTopic) {
    return {
      ...normalizedCandidate,
      status: 'rejected' as const,
      why: clipText(
        `${normalizedCandidate.why} Rejected by the topic-domain guard (discoveryScore=${signals.discoveryScore.toFixed(2)}). Filters: ${rejectReasons.join(', ')}`,
        220,
      ),
      rejectReason: rejectReasons.join('; '),
      rejectFilter: 'topicAdmissionGuard',
      rejectScore: signals.discoveryScore,
    }
  }

  if (signals.discoveryScore >= 0.15) {
    return {
      ...normalizedCandidate,
      status: 'candidate' as const,
      why: clipText(
        `${normalizedCandidate.why} Sent to candidate pool (discoveryScore=${signals.discoveryScore.toFixed(2)}) for manual review. Filters: ${rejectReasons.join(', ')}`,
        220,
      ),
      rejectReason: rejectReasons.join('; '),
      rejectFilter: 'topicAdmissionGuard',
      rejectScore: signals.discoveryScore,
    }
  }

  return {
    ...normalizedCandidate,
    status: 'rejected' as const,
    why: clipText(
      `${normalizedCandidate.why} Rejected by the topic-domain guard (discoveryScore=${signals.discoveryScore.toFixed(2)} < 0.10). Filters: ${rejectReasons.join(', ')}`,
      220,
    ),
    rejectReason: rejectReasons.join('; '),
    rejectFilter: 'topicAdmissionGuard',
    rejectScore: signals.discoveryScore,
  }
}

function buildHeuristicCandidate(args: {
  paper: ArxivPaper
  confidence: number
  queryHits: string[]
  stageIndex: number
  windowMonths?: number
  bootstrapMode?: boolean
  topicDef?: TopicDefinitionLike
  queries?: string[]
  admissionContext?: TopicAdmissionContext
}) {
  const hasUsablePdf =
    resolveCandidateGroundablePdfUrl({
      pdfUrl: args.paper.pdfUrl ?? null,
      arxivUrl: args.paper.arxivUrl ?? null,
    }).length > 0
  const admissionSignals =
    args.topicDef && args.queries
      ? buildTopicAdmissionSignals(args.paper, args.topicDef, args.queries, args.admissionContext)
      : null
  const directTopicLexicalFit =
    /\bworld model\b|\bworld models\b/u.test(
      `${args.paper.title} ${args.paper.summary}`.toLowerCase(),
    ) &&
    /\bautonomous driving\b|\bself-driving\b|\bself driving\b/u.test(
      `${args.paper.title} ${args.paper.summary}`.toLowerCase(),
    )
  const stageAlignedBranchFit =
    admissionSignals?.earlyStageDrivingFit === true &&
    admissionSignals.earlyStageNoiseSignal !== true
  const directHeuristicFit =
    directTopicLexicalFit || (args.queryHits.length >= 1 && args.confidence >= 0.25)

  let status: 'admitted' | 'candidate' | 'rejected'

  if (args.bootstrapMode === true) {
    if (directTopicLexicalFit || args.queryHits.length >= 1 || args.confidence >= 0.20) {
      status = 'admitted'
    } else if (args.confidence >= 0.10) {
      status = 'candidate'
    } else {
      status = 'rejected'
    }
  } else {
    if (directHeuristicFit) {
      status = 'admitted'
    } else if (stageAlignedBranchFit || args.queryHits.length >= 1) {
      status = 'admitted'
    } else if (args.confidence >= 0.15 && (admissionSignals?.hasWorldModelFamilySignal || false)) {
      status = 'candidate'
    } else {
      status = 'rejected'
    }
  }

  if (!hasUsablePdf && status === 'admitted' && !directTopicLexicalFit) {
    status = args.confidence >= 0.18 ? 'candidate' : 'rejected'
  }

  const candidateType =
    directHeuristicFit
      ? 'direct'
      : stageAlignedBranchFit || (args.queryHits.length >= 1 && args.confidence >= 0.6)
        ? 'branch'
        : 'transfer'
  const citeIntent =
    candidateType === 'direct'
      ? 'supporting'
      : candidateType === 'branch'
        ? 'background'
        : 'method-using'

  const why =
    stageAlignedBranchFit
      ? `Heuristic fit from stage-aligned autonomous-driving continuity in ${args.admissionContext?.stageLabel ?? `stage ${args.stageIndex}`}.`
      : args.queryHits.length > 0
      ? `Heuristic fit from stage-aligned query overlap: ${args.queryHits.join(', ')}.`
      : directTopicLexicalFit
        ? 'Heuristic fit from a direct autonomous-driving world-model match.'
        : status === 'candidate'
          ? `Candidate pool entry (confidence=${args.confidence.toFixed(2)}) for manual review.`
          : 'Heuristic fallback from lexical and temporal relevance.'

  const groundedWhy = hasUsablePdf
    ? why
    : `${why} Full-text PDF is not directly groundable yet, so it stays out of the main admitted lane.`

  return {
    paperId: args.paper.id,
    title: args.paper.title,
    titleZh: args.paper.titleZh,
    published: args.paper.published,
    authors: args.paper.authors,
    candidateType,
    confidence: args.confidence,
    status,
    why: groundedWhy,
    citeIntent,
    earliestWindowMonths: args.windowMonths ?? 6,
    stageIndex: args.stageIndex,
    queryHits: args.queryHits,
    discoveryChannels: [args.paper.discoverySource ?? 'arxiv-api'],
    openAlexId: args.paper.openAlexId,
    arxivData: args.paper,
    discoverySource: args.paper.discoverySource,
  } satisfies PaperCandidate
}

function resolveBootstrapAnchorWindow(
  candidates: PaperCandidate[],
  windowMonths?: number,
): BootstrapAnchorWindow | null {
  const admitted = candidates.filter((candidate) => candidate.status === 'admitted')
  if (admitted.length === 0) return null

  const prioritized = admitted.filter((candidate) => candidate.candidateType === 'direct')
  const sourceCandidates = prioritized.length > 0 ? prioritized : admitted
  const sourceSeed = [...sourceCandidates]
    .map((candidate) => ({
      candidate,
      publishedAt: new Date(candidate.published),
    }))
    .filter((entry) => !Number.isNaN(entry.publishedAt.getTime()))
    .sort((left, right) => {
      const timeDiff = left.publishedAt.getTime() - right.publishedAt.getTime()
      if (timeDiff !== 0) return timeDiff
      return right.candidate.confidence - left.candidate.confidence
    })[0]

  if (!sourceSeed) return null

  const assignments = deriveTemporalStageBuckets({
    papers: admitted.map((candidate) => ({
      id: candidate.paperId,
      published: candidate.published,
    })),
    windowMonths,
    fallbackDate: sourceSeed.publishedAt,
  })
  const assignment = assignments.paperAssignments.get(sourceSeed.candidate.paperId)
  if (!assignment) return null

  return {
    bucketKey: assignment.bucketKey,
    label: formatStageWindowLabel(
      assignment.bucketStart,
      normalizeStageWindowMonths(windowMonths),
    ),
    bucketStart: assignment.bucketStart,
  }
}

function constrainBootstrapCandidatesToAnchorWindow(
  candidates: PaperCandidate[],
  windowMonths?: number,
) {
  const anchorWindow = resolveBootstrapAnchorWindow(candidates, windowMonths)
  if (!anchorWindow) {
    return {
      candidates,
      anchorWindow: null,
    }
  }

  const assignments = deriveTemporalStageBuckets({
    papers: candidates.map((candidate) => ({
      id: candidate.paperId,
      published: candidate.published,
    })),
    windowMonths,
    fallbackDate: anchorWindow.bucketStart,
  })

  return {
    anchorWindow,
    candidates: candidates.map((candidate) => {
      if (candidate.status !== 'admitted') return candidate

      const assignment = assignments.paperAssignments.get(candidate.paperId)
      if (!assignment || assignment.bucketKey === anchorWindow.bucketKey) {
        return candidate
      }

      return {
        ...candidate,
        status: 'rejected' as const,
        why: `${candidate.why} Deferred until ${formatStageWindowLabel(
          startOfUtcMonth(candidate.published) ?? assignment.bucketStart,
          normalizeStageWindowMonths(windowMonths),
        )} because bootstrap anchored stage 1 at ${anchorWindow.label}.`,
      }
    }),
  }
}

function shouldAdmitCandidate(evaluation: {
  verdict: 'admit' | 'candidate' | 'reject'
  candidateType: 'direct' | 'branch' | 'transfer'
  confidence: number
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
}, thresholds?: {
  directHighConfidenceThreshold?: number
  branchHighConfidenceThreshold?: number
}): 'admitted' | 'candidate' | 'rejected' {
  // 广纳贤文: Return status based on verdict
  if (evaluation.verdict === 'admit') {
    return 'admitted'
  }

  if (evaluation.verdict === 'candidate') {
    return 'candidate'
  }

  const directHighConfidenceThreshold =
    clampConfidence(thresholds?.directHighConfidenceThreshold, 0.5, 0.95) ?? 0.82
  const branchHighConfidenceThreshold = Math.min(
    directHighConfidenceThreshold,
    clampConfidence(thresholds?.branchHighConfidenceThreshold, 0.45, 0.95) ??
      Math.max(0.5, directHighConfidenceThreshold - 0.04),
  )

  // High-confidence papers can override reject verdict
  if (
    evaluation.candidateType === 'direct' &&
    evaluation.confidence >= directHighConfidenceThreshold
  ) {
    return 'admitted'
  }

  if (
    evaluation.candidateType === 'branch' &&
    evaluation.confidence >= branchHighConfidenceThreshold
  ) {
    return 'admitted'
  }

  // Medium confidence goes to candidate pool
  if (evaluation.confidence >= 0.35) {
    return 'candidate'
  }

  return 'rejected'
}

async function evaluateCandidates(args: {
  papers: ArxivPaper[]
  topic: NonNullable<TopicRecord>
  topicDef: TopicDefinitionLike
  queries: string[]
  targetStageIndex: number
  input: PaperTrackerInput
  context: SkillContext
  bootstrapMode?: boolean
  admissionContext?: TopicAdmissionContext
  targetCandidatesBeforeAdmission?: number
  highConfidenceThreshold?: number
  maxCandidates?: number // 动态配置：每阶段上限
  admissionThreshold?: number // 动态配置：准入阈值
}) {
  // 从配置获取maxCandidates，默认使用硬编码值
  const maxCandidatesLimit = Math.max(
    args.maxCandidates ?? PAPER_EVALUATION_LLM_MAX_CANDIDATES,
    args.targetCandidatesBeforeAdmission ?? 0,
  )
  // 从配置获取admissionThreshold，默认使用0.55
  const admissionThreshold = args.admissionThreshold ?? 0.55
  const directHighConfidenceThreshold =
    clampConfidence(args.highConfidenceThreshold, 0.5, 0.95) ??
    RESEARCH_CONFIG_DEFAULTS.HIGH_CONFIDENCE_THRESHOLD
  const branchHighConfidenceThreshold = Math.max(0.5, directHighConfidenceThreshold - 0.04)

  const existingKeys = buildExistingPaperKeySet(args.topic)
  const candidateSeeds = args.papers
    .filter(
      (paper) =>
        !existingKeys.has(paper.id) &&
        !existingKeys.has(paper.title) &&
        !existingKeys.has(paper.titleZh || ''),
    )
    .map((paper) => ({
      paper,
      confidence: calculateSimpleRelevance(
        paper,
        args.topicDef,
        args.queries,
        args.admissionContext,
      ),
      queryHits: collectMatchedQueries(paper, args.queries),
    }))

  // ========== NO FALLBACK: All candidates must go through LLM evaluation ==========
  // Removed bootstrapMode, heuristicCandidates, and overflowHeuristicCandidates paths
  // All papers are evaluated by LLM to ensure "LLM全程参与"

  // Increase LLM concurrency to handle more papers
  const effectiveConcurrency = Math.min(PAPER_EVALUATION_LLM_CONCURRENCY * 2, 10)

  // All candidates go through LLM evaluation - no heuristic shortcuts
  const llmCandidates = await mapWithConcurrency(
    candidateSeeds.slice(0, maxCandidatesLimit),
    effectiveConcurrency,
    async (seed) => {
      try {
        const evaluation = await evaluatePaperWithLLM({
          paper: seed.paper,
          topicDef: args.topicDef,
          targetStageIndex: args.targetStageIndex,
          input: args.input,
          admissionContext: args.admissionContext,
        })

        return enforceTopicAdmissionGuard({
          candidate: {
          paperId: seed.paper.id,
          title: seed.paper.title,
          titleZh: seed.paper.titleZh,
          published: seed.paper.published,
          authors: seed.paper.authors,
          candidateType: evaluation.candidateType,
          confidence: evaluation.confidence,
          status: shouldAdmitCandidate(evaluation, {
            directHighConfidenceThreshold,
            branchHighConfidenceThreshold,
          }),
          why: evaluation.why,
          citeIntent: evaluation.citeIntent,
          earliestWindowMonths: args.input.windowMonths ?? 6,
          stageIndex: args.targetStageIndex,
          queryHits: seed.queryHits,
          discoveryChannels: [seed.paper.discoverySource ?? 'arxiv-api'],
          arxivData: seed.paper,
          } satisfies PaperCandidate,
          paper: seed.paper,
          topicDef: args.topicDef,
          queries: args.queries,
          admissionContext: args.admissionContext,
        })
      } catch (error) {
        // NO FALLBACK: LLM evaluation failed - reject candidate instead of heuristic fallback
        args.context.logger.warn('LLM candidate evaluation failed; rejecting candidate', {
          paperId: seed.paper.id,
          error,
        })

        // Return rejected candidate instead of heuristic fallback
        return {
          paperId: seed.paper.id,
          title: seed.paper.title,
          titleZh: seed.paper.titleZh,
          published: seed.paper.published,
          authors: seed.paper.authors || [],
          stageIndex: args.targetStageIndex,
          queryHits: seed.queryHits,
          discoveryChannels: [seed.paper.discoverySource ?? 'arxiv-api'],
          arxivData: seed.paper,
          status: 'rejected' as const,
          candidateType: 'direct' as const,
          citeIntent: 'background' as const,
          confidence: 0,
          why: `LLM评估失败: ${error instanceof Error ? error.message : String(error)}`,
        } satisfies PaperCandidate
      }
    },
  )

  // Only LLM candidates now - no heuristic fallbacks
  const candidates = llmCandidates

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

/**
 * 广纳贤文: Persist candidates to the candidate pool for audit and review
 * Logs all papers including rejected ones for transparency
 */
async function persistCandidatePool(args: {
  topicId: string
  candidates: PaperCandidate[]
  context: SkillContext
  discoveryRound: 1 | 2
}) {
  const poolEntries = []

  for (const candidate of args.candidates) {
    try {
      // Create entry in candidate pool
      const poolEntry = await prisma.paper_candidate_pool.create({
        data: {
          id: `pool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          topicId: args.topicId,
          title: candidate.title,
          authors: JSON.stringify(candidate.authors ?? []),
          published: candidate.published ? new Date(candidate.published) : null,
          summary: candidate.arxivData?.summary ?? null,
          arxivUrl: candidate.arxivData?.arxivUrl ?? null,
          pdfUrl: candidate.arxivData?.pdfUrl ?? null,
          status: candidate.status, // admitted, candidate, or rejected
          confidence: candidate.confidence,
          candidateType: candidate.candidateType,
          discoverySource: candidate.discoverySource ?? candidate.arxivData?.discoverySource ?? null,
          discoveryChannels: JSON.stringify(candidate.discoveryChannels ?? []),
          queryHits: JSON.stringify(candidate.queryHits ?? []),
          // Rejection audit
          rejectReason: candidate.rejectReason ?? null,
          rejectFilter: candidate.rejectFilter ?? null,
          rejectScore: candidate.rejectScore ?? null,
          // Link to actual paper if admitted
          paperId: candidate.status === 'admitted' ? candidate.paperId : null,
        },
      })

      poolEntries.push(poolEntry)

      args.context.logger.info('[广纳贤文] Candidate pool entry created', {
        topicId: args.topicId,
        title: candidate.title,
        status: candidate.status,
        confidence: candidate.confidence,
        rejectReason: candidate.rejectReason,
      })
    } catch (error) {
      // Check if entry already exists
      const existingEntry = await prisma.paper_candidate_pool.findFirst({
        where: {
          topicId: args.topicId,
          title: candidate.title,
        },
      })

      if (existingEntry) {
        // Update existing entry
        await prisma.paper_candidate_pool.update({
          where: { id: existingEntry.id },
          data: {
            status: candidate.status,
            confidence: candidate.confidence,
            discoveryChannels: JSON.stringify([
              ...JSON.parse(existingEntry.discoveryChannels || '[]'),
              ...(candidate.discoveryChannels ?? []),
            ]),
            queryHits: JSON.stringify([
              ...JSON.parse(existingEntry.queryHits || '[]'),
              ...(candidate.queryHits ?? []),
            ]),
            rejectReason: candidate.rejectReason ?? existingEntry.rejectReason,
            rejectFilter: candidate.rejectFilter ?? existingEntry.rejectFilter,
          },
        })
        poolEntries.push(existingEntry)
      } else {
        args.context.logger.error('[广纳贤文] Failed to persist candidate pool entry', {
          title: candidate.title,
          error,
        })
      }
    }
  }

  return poolEntries
}

/**
 * Generate audit report for rejected papers
 */
function generateRejectionAuditReport(candidates: PaperCandidate[]): string {
  const rejected = candidates.filter(c => c.status === 'rejected')

  if (rejected.length === 0) {
    return 'No papers rejected in this discovery round.'
  }

  const reportLines = [
    `## Rejection Audit Report (${rejected.length} papers rejected)`,
    '',
    '| Title | Confidence | Reject Filter | Reject Reason |',
    '|-------|-----------|---------------|---------------|',
  ]

  for (const paper of rejected) {
    const titleShort = paper.title.slice(0, 50)
    reportLines.push(
      `| ${titleShort} | ${paper.confidence.toFixed(2)} | ${paper.rejectFilter ?? 'unknown'} | ${paper.rejectReason ?? paper.why.slice(0, 40)} |`
    )
  }

  return reportLines.join('\n')
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
          ? await prisma.papers.findFirst({
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
        // Persist openAlexId for future citation network traversal
        openAlexId: candidate.openAlexId ?? candidate.arxivData?.openAlexId ?? null,
        pdfUrl:
          normalizePdfUrl(candidate.arxivData?.pdfUrl ?? candidate.arxivData?.arxivUrl ?? null) ||
          null,
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
        updatedAt: new Date(),
      }

      if (existingPaper) {
        const persistedPaper = await prisma.papers.update({
          where: { id: existingPaper.id },
          data: paperData,
        })
        candidate.sourcePaperId = candidate.sourcePaperId ?? candidate.paperId
        candidate.paperId = persistedPaper.id
      } else {
        const paperId = `paper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const persistedPaper = await prisma.papers.create({
          data: {
            id: paperId,
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
      // BUG #3 fix: Mark persistence failure to prevent downstream usage
      candidate.persistenceFailed = true
    }
  }
}

function resolveCandidateGroundablePdfUrl(args: {
  pdfUrl?: string | null
  arxivUrl?: string | null
}) {
  const normalizedPdfUrl = normalizePdfUrl(args.pdfUrl ?? null)
  const normalizedArxivUrl = normalizePdfUrl(args.arxivUrl ?? null)
  const candidates = [normalizedPdfUrl, normalizedArxivUrl].filter(Boolean)

  return candidates.find((value) => {
    if (/^https?:\/\/(?:dx\.)?doi\.org\//iu.test(value)) return false
    if (/ieeexplore\.ieee\.org\/document\//iu.test(value)) return false
    if (/^https?:\/\/arxiv\.org\/pdf\//iu.test(value)) return true
    if (/\.pdf(?:[?#]|$)/iu.test(value) && !/ieeexplore\.ieee\.org/iu.test(value)) return true
    if (/^\/uploads\//u.test(value)) return true
    return false
  }) ?? ''
}

function resolveCandidatePdfUrl(candidate: PaperCandidate) {
  return resolveCandidateGroundablePdfUrl({
    pdfUrl: candidate.arxivData?.pdfUrl ?? null,
    arxivUrl: candidate.arxivData?.arxivUrl ?? null,
  })
}

async function groundPersistedCandidatesFromPdf(args: {
  candidates: PaperCandidate[]
  context: SkillContext
}) {
  const queue = args.candidates.filter((candidate) => {
    const paperId = candidate.paperId?.trim()
    return Boolean(paperId) && Boolean(resolveCandidatePdfUrl(candidate))
  })

  const outcomes = await mapWithConcurrency(
    queue,
    TRACKER_PDF_GROUNDING_CONCURRENCY,
    async (candidate) => {
      const paperId = candidate.paperId.trim()
      const pdfUrl = resolveCandidatePdfUrl(candidate)

      try {
        const result = await extractAndPersistPaperPdfFromUrl({
          paperId,
          paperTitle: candidate.titleZh || candidate.title,
          pdfUrl,
          force: false,
        })

        if (result.status === 'grounded') {
          args.context.logger.info('Grounded admitted paper from PDF during tracker commit', {
            paperId,
            sections: result.extractedCounts.sections,
            figures: result.extractedCounts.figures,
            tables: result.extractedCounts.tables,
            formulas: result.extractedCounts.formulas,
          })
        } else {
          args.context.logger.info('Skipped PDF grounding for admitted paper during tracker commit', {
            paperId,
            reason: result.reason,
          })
        }

        return result
      } catch (error) {
        args.context.logger.warn('Failed to ground admitted paper PDF during tracker commit', {
          paperId,
          pdfUrl,
          error,
        })
        return null
      }
    },
  )

  const groundedPaperIds: string[] = []
  let groundedCount = 0
  let skippedCount = 0

  for (const outcome of outcomes) {
    if (!outcome) continue
    if (outcome.status === 'grounded') {
      groundedCount += 1
      groundedPaperIds.push(outcome.paperId)
      continue
    }
    skippedCount += 1
  }

  return {
    attempted: queue.length,
    groundedCount,
    skippedCount,
    groundedPaperIds,
  }
}

function toTrackerStagePaper(paper: any): TrackerStagePaper {
  return {
    id: paper.id,
    title: paper.title,
    titleZh: paper.titleZh ?? null,
    titleEn: paper.titleEn ?? null,
    summary: paper.summary ?? '',
    explanation: paper.explanation ?? null,
    coverPath: paper.coverPath ?? null,
    figures: Array.isArray(paper.figures)
      ? paper.figures.map((figure: any) => ({
          id: figure.id,
          imagePath: figure.imagePath,
          caption: figure.caption,
          analysis: figure.analysis ?? null,
        }))
      : [],
  }
}

async function materializeTrackerStageCoverage(args: {
  topicId: string
  stageIndex: number
  stageLabel: string
  stageStartDate: Date
  stageEndDateExclusive: Date
  stageWindowMonths: number
  admittedPaperIds: string[]
  artifactMode?: TrackerStageMaterializationMode
  maxPapersPerNode?: number // 动态配置：每节点论文上限
  context: SkillContext
}): Promise<TrackerStageMaterializationResult> {
  const schedulerRuntime = enhancedTaskScheduler as unknown as {
    buildFallbackOrchestration: (input: {
      topic: any
      stage: any
      existingNodes: any[]
      candidatePapers: TrackerStagePaper[]
    }) => {
      stageTitle: string
      stageTitleEn: string
      stageSummary: string
      shouldAdvanceStage: boolean
      rationale: string
      nodeActions: Array<{
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
      }>
      openQuestions: string[]
    }
    applyResearchNodeActions: (input: {
      topicId: string
      stageIndex: number
      stageTitle: string
      orchestration: {
        stageTitle: string
        stageTitleEn: string
        stageSummary: string
        shouldAdvanceStage: boolean
        rationale: string
        nodeActions: Array<{
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
        }>
        openQuestions: string[]
      }
      candidatePapers: TrackerStagePaper[]
    }) => Promise<{ affectedNodeIds: string[] }>
  }
  const artifactMode = args.artifactMode ?? 'deferred'
  const stageQuery = {
    topicId: args.topicId,
    stageIndex: args.stageIndex,
  }

  const stagePaperWhereOr: Prisma.papersWhereInput[] = [
    {
      published: {
        gte: args.stageStartDate,
        lt: args.stageEndDateExclusive,
      },
    },
  ]
  if (args.admittedPaperIds.length > 0) {
    stagePaperWhereOr.push({ id: { in: args.admittedPaperIds } })
  }

  const topicStageMaterializationInclude = {
    topic_stages: {
      where: { order: args.stageIndex },
      orderBy: { order: 'asc' as const },
    },
    research_nodes: {
      where: stageQuery,
      include: {
        node_papers: {
          include: {
            papers: {
              select: {
                id: true,
              },
            },
          },
          orderBy: { order: 'asc' as const },
        },
      },
      orderBy: [{ createdAt: 'asc' as const }],
    },
    papers: {
      where: {
        OR: stagePaperWhereOr,
      },
      include: {
        figures: {
          orderBy: { number: 'asc' as const },
        },
      },
      orderBy: [{ published: 'asc' as const }, { createdAt: 'asc' as const }],
    },
  } satisfies Prisma.topicsInclude

  type TopicStageMaterializationRecord = Prisma.topicsGetPayload<{
    include: typeof topicStageMaterializationInclude
  }>

  const topicRecord: TopicStageMaterializationRecord | null = await prisma.topics.findUnique({
    where: { id: args.topicId },
    include: topicStageMaterializationInclude,
  })

  const topic = topicRecord
    ? {
        ...topicRecord,
        stages: topicRecord.topic_stages,
        nodes: topicRecord.research_nodes.map((node) => ({
          ...node,
          papers: node.node_papers.map((entry) => ({
            ...entry,
            paper: entry.papers,
          })),
        })),
        papers: topicRecord.papers,
      }
    : null

  if (!topic) {
    throw new Error(`Topic not found in database during stage materialization: ${args.topicId}`)
  }

  const stagePaperIds = new Set<string>(args.admittedPaperIds)
  for (const paper of topic.papers) {
    stagePaperIds.add(paper.id)
  }
  for (const node of topic.nodes) {
    for (const entry of node.papers) {
      if (entry.paperId) {
        stagePaperIds.add(entry.paperId)
      } else if (entry.paper?.id) {
        stagePaperIds.add(entry.paper.id)
      }
    }
  }

  const orderedStagePaperIds = [...stagePaperIds]
  const stagePapers =
    orderedStagePaperIds.length > 0
      ? await prisma.papers.findMany({
          where: {
            topicId: args.topicId,
            id: { in: orderedStagePaperIds },
          },
          include: {
            figures: {
              orderBy: { number: 'asc' },
            },
          },
          orderBy: [{ published: 'asc' }, { createdAt: 'asc' }],
        })
      : []
  const candidatePapers = stagePapers.map((paper: any) => toTrackerStagePaper(paper))
  const stage = topic.stages[0] ?? {
    order: args.stageIndex,
    name: args.stageLabel,
    nameEn: args.stageLabel,
    description: `Collects the papers mapped into ${args.stageLabel}.`,
    descriptionEn: `Collects the papers mapped into ${args.stageLabel}.`,
  }

const orchestration = schedulerRuntime.buildFallbackOrchestration({
    topic: {
      id: topic.id,
      language: topic.language,
      nameZh: topic.nameZh,
      nameEn: topic.nameEn,
      summary: topic.summary,
      focusLabel: topic.focusLabel,
      maxPapersPerNode: args.maxPapersPerNode ?? 20, // 使用动态每节点论文上限（嵌入到topic对象）
    },
    stage,
    existingNodes: topic.nodes,
    candidatePapers,
  })

  const nodeActionResult = await schedulerRuntime.applyResearchNodeActions({
    topicId: args.topicId,
    stageIndex: args.stageIndex,
    stageTitle: pickText(stage.name, args.stageLabel, `Stage ${args.stageIndex}`),
    orchestration,
    candidatePapers,
  })

  const affectedNodeIds = new Set(nodeActionResult.affectedNodeIds)
  const removedNodeIds = topic.nodes
    .map((node: any) => node.id)
    .filter((nodeId: string) => !affectedNodeIds.has(nodeId))

  if (removedNodeIds.length > 0) {
    await prisma.node_papers.deleteMany({
      where: {
        nodeId: { in: removedNodeIds },
      },
    })
    await prisma.research_nodes.deleteMany({
      where: {
        topicId: args.topicId,
        stageIndex: args.stageIndex,
        id: { in: removedNodeIds },
      },
    })
  }

  await saveTopicStageConfig(args.topicId, args.stageWindowMonths)
  await syncConfiguredTopicWorkflowSnapshot(args.topicId)

  let warmedNodeCount = 0
  let warmedPaperCount = 0
  if (artifactMode !== 'off') {
    const warmed = await orchestrateTopicReaderArtifacts(args.topicId, {
      limit: Math.max(affectedNodeIds.size, orderedStagePaperIds.length, 1),
      mode: artifactMode === 'quick' ? 'quick' : artifactMode === 'full' ? 'full' : 'deferred',
      entityIds: {
        nodeIds: [...affectedNodeIds],
        paperIds: orderedStagePaperIds,
      },
    })
    warmedNodeCount = warmed.warmedNodeCount
    warmedPaperCount = warmed.warmedPaperCount

    await refreshTopicViewModelSnapshot(args.topicId, {
      mode: artifactMode === 'full' ? 'full' : artifactMode === 'quick' ? 'quick' : 'deferred',
      stageWindowMonths: args.stageWindowMonths,
    })
    await syncConfiguredTopicWorkflowSnapshot(args.topicId)
  }

  args.context.logger.info('Paper tracker stage coverage materialized.', {
    topicId: args.topicId,
    stageIndex: args.stageIndex,
    stagePaperCount: orderedStagePaperIds.length,
    nodeCount: affectedNodeIds.size,
    removedNodeCount: removedNodeIds.length,
    artifactMode,
  })

  return {
    stageIndex: args.stageIndex,
    stagePaperIds: orderedStagePaperIds,
    affectedNodeIds: [...affectedNodeIds],
    removedNodeIds,
    warmedNodeCount,
    warmedPaperCount,
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

    // 加载研究追踪配置参数
    const researchConfig = await getResearchConfigParams(params.topicId)
    const effectiveResearchSettings = resolvePaperTrackerResearchSettings({
      input: params,
      researchConfig,
    })
    params.maxCandidates = effectiveResearchSettings.maxCandidatesPerStage
    params.maxPapersPerNode = effectiveResearchSettings.maxPapersPerNode
    params.minimumUsefulPapersPerNode = effectiveResearchSettings.minimumUsefulPapersPerNode
    researchConfig.maxCandidatesPerStage = effectiveResearchSettings.maxCandidatesPerStage
    researchConfig.maxPapersPerNode = effectiveResearchSettings.maxPapersPerNode
    researchConfig.minPapersPerNode = effectiveResearchSettings.minimumUsefulPapersPerNode
    researchConfig.targetCandidatesBeforeAdmission =
      effectiveResearchSettings.targetCandidatesBeforeAdmission
    researchConfig.highConfidenceThreshold = effectiveResearchSettings.highConfidenceThreshold

    const requestedWindowMonths = await resolveTrackerStageWindowMonths(
      params.topicId,
      params.windowMonths,
    )
    const { window: temporalStageWindow } = resolveTemporalDiscoveryWindow({
      topic,
      requestedWindowMonths,
      requestedStageIndex: params.stageIndex,
      requestedBranchId: params.branchId,
      stageMode: params.stageMode,
      bootstrapWindowDays: topicDef.defaults.bootstrapWindowDays,
    })
    const currentStageIndex = temporalStageWindow.currentStageIndex
    const targetStageIndex = temporalStageWindow.targetStageIndex
    const admissionContext: TopicAdmissionContext = {
      topicId: params.topicId,
      targetStageIndex,
      bootstrapMode: temporalStageWindow.bootstrapMode,
      stageLabel: temporalStageWindow.stageLabel,
      anchorPaperTitles: temporalStageWindow.anchorPapers.map(
        (paper: DiscoveryStageWindow['anchorPapers'][number]) => paper.title,
      ),
      anchorNodeTexts: temporalStageWindow.anchorNodes.flatMap(
        (node: DiscoveryStageWindow['anchorNodes'][number]) => [node.title, node.summary],
      ),
    }

    const discoveryPlan = buildMultiAngleDiscoveryPlan({
      topic,
      topicDef,
      input: params,
      stageWindow: temporalStageWindow,
      discoveryQueryLimit: researchConfig.discoveryQueryLimit, // 使用动态发现查询上限
      discoveryRounds: researchConfig.discoveryRounds, // 使用动态发现轮数
      semanticScholarLimit: researchConfig.semanticScholarLimit, // 使用动态Semantic Scholar上限
      maxPapersPerNode: researchConfig.maxPapersPerNode, // 使用动态每节点论文上限
    })

    const discoveredPapers = await discoverPapers(discoveryPlan, topicDef, context)
    const evaluatedCandidates = await evaluateCandidates({
      papers: discoveredPapers,
      topic,
      topicDef,
      queries: discoveryPlan.queries,
      targetStageIndex,
      input: params,
      context,
      bootstrapMode: temporalStageWindow.bootstrapMode,
      admissionContext,
      targetCandidatesBeforeAdmission: researchConfig.targetCandidatesBeforeAdmission,
      highConfidenceThreshold: researchConfig.highConfidenceThreshold,
      maxCandidates: researchConfig.maxCandidatesPerStage, // 使用动态配置
      admissionThreshold: researchConfig.admissionThreshold, // 使用动态准入阈值
    })
    const bootstrapConstraint =
      temporalStageWindow.bootstrapMode
        ? constrainBootstrapCandidatesToAnchorWindow(
            evaluatedCandidates,
            discoveryPlan.windowMonths,
          )
        : { candidates: evaluatedCandidates, anchorWindow: null as BootstrapAnchorWindow | null }
    const candidates = bootstrapConstraint.candidates
    const admittedCandidates = candidates.filter((candidate) => candidate.status === 'admitted')
    const groundedAdmittedCandidates = admittedCandidates.filter(
      (candidate) => Boolean(resolveCandidatePdfUrl(candidate)),
    )
    // Merge grounded first, then non-grounded, both sorted by confidence
    const finalCandidates = [
      ...groundedAdmittedCandidates,
      ...admittedCandidates.filter(
        c => !groundedAdmittedCandidates.some(g => g.paperId === c.paperId)
      ),
    ].slice(0, effectiveResearchSettings.maxCandidatesPerStage)
    const branchDecision = determineBranchAction(candidates, params.allowMerge !== false)
    let stageMaterialization: TrackerStageMaterializationResult | null = null
    let pdfGroundingSummary: {
      attempted: number
      groundedCount: number
      skippedCount: number
      groundedPaperIds: string[]
    } | null = null

if (params.mode !== 'dry-run' && params.mode !== 'inspect' && finalCandidates.length > 0) {

      await saveResultsToDatabase({
        topicId: params.topicId,
        candidates: finalCandidates,
        context,
      })

      // BUG #3 fix: Filter out candidates that failed persistence
      const successfullyPersistedCandidates = finalCandidates.filter(
        (candidate) => !candidate.persistenceFailed
      )

      if (successfullyPersistedCandidates.length > 0) {
        pdfGroundingSummary = await groundPersistedCandidatesFromPdf({
          candidates: successfullyPersistedCandidates,
          context,
        })

        stageMaterialization = await materializeTrackerStageCoverage({
          topicId: params.topicId,
          stageIndex: targetStageIndex,
          stageLabel: discoveryPlan.stageLabel,
          stageStartDate: discoveryPlan.startDate,
          stageEndDateExclusive: discoveryPlan.endDateExclusive,
          stageWindowMonths: discoveryPlan.windowMonths,
          admittedPaperIds: successfullyPersistedCandidates.map((candidate) => candidate.paperId),
          artifactMode: 'deferred',
          maxPapersPerNode: discoveryPlan.maxPapersPerNode, // 使用动态每节点论文上限
          context,
        })

        await researchMemory.addDiscoveryBatch(
          params.topicId,
          successfullyPersistedCandidates.map((candidate) => ({
            paperId: candidate.paperId,
            title: candidate.title,
            confidence: candidate.confidence,
            stageIndex: targetStageIndex,
            discoveredAt: new Date().toISOString(),
          })),
        )
      } else {
        // Log if all candidates failed persistence
        context.logger.warn('All admitted candidates failed persistence, skipping downstream operations')
      }
    }

    console.log(`[PaperTracker] Admission funnel for topic ${params.topicId}:`, {
      discovered: discoveredPapers.length,
      afterEvaluation: evaluatedCandidates.length,
      admitted: admittedCandidates.length,
      withPdfUrls: groundedAdmittedCandidates.length,
      finalAfterCap: finalCandidates.length,
      topCandidate: finalCandidates[0]?.paperId ?? 'none',
    })

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
          start: discoveryPlan.startDate.toISOString(),
          end: new Date(discoveryPlan.endDateExclusive.getTime() - 1).toISOString(),
        },
      },
      admittedCandidates: finalCandidates, // Hard cap enforced - maxCandidatesPerStage
      candidates,
      recommendations: finalCandidates.slice(0, 5).map((candidate) => ({
        paperId: candidate.paperId,
        candidateType: candidate.candidateType,
        confidence: candidate.confidence,
        why: candidate.why,
        status: candidate.status,
      })),
      selectedCandidate: finalCandidates[0] ?? null,
      topCandidates: finalCandidates.slice(0, 3).map(c => ({
        paperId: c.paperId,
        candidateType: c.candidateType,
        confidence: c.confidence,
        citeIntent: c.citeIntent,
        stageIndex: c.stageIndex,
      })),
      decisionSummary: `Discovered ${discoveredPapers.length} papers and admitted ${finalCandidates.length} (hard cap enforced) for stage ${targetStageIndex} (${discoveryPlan.stageLabel}).`,
      branchDecisionRationale: branchDecision.rationale,
      branchAction: branchDecision.action,
      selectedBranch: branchDecision.selectedBranch,
      pdfGroundingSummary,
      stageWindow: {
        stageIndex: targetStageIndex,
        windowMonths: discoveryPlan.windowMonths,
        paperCount: finalCandidates.length,
      },
      stageMaterialization,
      stageWindowDecision: {
        shouldAdvance: finalCandidates.length >= 3,
        rationale:
          temporalStageWindow.bootstrapMode && bootstrapConstraint.anchorWindow
            ? `Bootstrap anchored stage 1 at ${bootstrapConstraint.anchorWindow.label}; keep later-window papers for future stages.`
            : finalCandidates.length >= 3
              ? 'Enough new evidence was admitted to justify stage advancement.'
              : 'Keep consolidating the current stage before advancing.',
      },
      bootstrapAnchorStage:
        temporalStageWindow.bootstrapMode && bootstrapConstraint.anchorWindow
          ? bootstrapConstraint.anchorWindow.label
          : null,
      topicMemoryPatch: {
        lastDiscoveryAt: new Date().toISOString(),
        currentStage: targetStageIndex,
        admittedCount: finalCandidates.length,
      },
      paperCatalogPatch: {
        added: finalCandidates.map((candidate) => candidate.paperId),
        total: topic.papers.length + finalCandidates.length,
      },
      paperMetricsPatch: {
        discoveryRate:
          discoveredPapers.length > 0 ? finalCandidates.length / discoveredPapers.length : 0,
        averageConfidence:
          finalCandidates.length > 0
            ? finalCandidates.reduce((sum, candidate) => sum + candidate.confidence, 0) /
              finalCandidates.length
            : 0,
      },
      timelineContextPatch: {
        lastUpdate: new Date().toISOString(),
        stageCount: topic.stages.length,
        paperCount: topic.papers.length + finalCandidates.length,
      },
      runSummary: {
        duration: Date.now() - startTime,
        papersDiscovered: discoveredPapers.length,
        papersAdmitted: finalCandidates.length,
        stageAdvanced: finalCandidates.length >= 3,
      },
    }

    context.logger.info('Paper tracker execution completed', {
      topicId: params.topicId,
      discovered: discoveredPapers.length,
      admitted: finalCandidates.length, // Hard cap enforced
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
  calculateSimpleRelevance,
  buildTopicAdmissionSignals,
  normalizeCandidateTypeBySignals,
  buildHeuristicCandidate,
  resolveBootstrapAnchorWindow,
  constrainBootstrapCandidatesToAnchorWindow,
  resolveTemporalDiscoveryWindow,
  buildDiscoveryPlan,
  buildMultiAngleDiscoveryPlan,
  resolvePaperTrackerResearchSettings,
  shouldAdmitCandidate,
  materializeTrackerStageCoverage,
  parsePaperEvaluationJson,
  parsePaperEvaluationLines,
  inferPaperEvaluationFromText,
  looksMetaEvaluation,
  looksPaperSpecificEvaluationWeak,
  isArxivUnavailableError,
  passesTopicAdmissionGuard,
  enforceTopicAdmissionGuard,
}
