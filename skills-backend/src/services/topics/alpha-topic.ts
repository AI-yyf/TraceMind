import { prisma } from '../../lib/prisma'
import { AppError } from '../../middleware/errorHandler'
import { logger } from '../../utils/logger'
import {
  buildGenerationFingerprint,
  loadTopicGenerationMemory,
  updateTopicSnapshot,
} from '../generation/memory-store'
import { collectTopicGenerationContext } from '../generation/research-judgment-store'
import { runStructuredGenerationPass } from '../generation/orchestrator'
import {
  getGenerationRuntimeConfig,
  getPromptTemplate,
  getPromptTemplateContent,
  PROMPT_TEMPLATE_IDS,
  renderPromptVariables,
} from '../generation/prompt-registry'
import { getModelConfigFingerprint } from '../omni/config-store'
import { omniGateway } from '../omni/gateway'
import { inferResearchRoleForTemplate } from '../omni/routing'
import {
  getStageLocalization,
  getTopicLocalization,
  type TopicLocalizationLanguage,
  type StageLocaleMap,
  type TopicLocalizationPayload,
} from './localization'
import {
  DEFAULT_STAGE_WINDOW_MONTHS,
  MAX_STAGE_WINDOW_MONTHS,
  MIN_STAGE_WINDOW_MONTHS,
  deriveTemporalStageBuckets,
  normalizeStageWindowMonths,
} from './stage-buckets'
import {
  buildNodeArtifactFingerprint,
  rebuildNodeViewModel,
  type NodeViewModel,
} from './alpha-reader'
import {
  scoreRelatedPaperAgainstNode,
} from './node-paper-association'
import {
  loadTopicResearchReport,
  sanitizeResearchFacingSummary,
  type ResearchRunReport,
} from './research-report'
import {
  syncTopicResearchWorldSnapshot,
  type TopicResearchWorld,
} from './research-world'
import {
  buildResearchPipelineContext,
  loadResearchPipelineState,
  type ResearchPipelineState,
} from './research-pipeline'
import {
  collectTopicSessionMemoryContext,
  loadTopicSessionMemory,
  recordTopicChatExchange,
  retrieveTopicSessionMemoryContext,
} from './topic-session-memory'
import { loadTopicStageConfig } from './topic-stage-config'
import { buildTopicCognitiveMemory } from './topic-cognitive-memory'
import { parseTopicChatCommand } from './topic-chat-command'
import {
  classifyTopicGuidanceMessage,
  compactTopicGuidanceContext,
  loadTopicGuidanceLedger,
  recordTopicGuidanceDirective,
  type TopicGuidanceDirective,
  type TopicGuidanceReceipt,
  type TopicGuidanceScopeType,
} from './topic-guidance-ledger'
import type {
  OmniAttachment,
  OmniCompleteRequest,
  OmniIssue,
  OmniMessage,
  SuggestedAction,
  TopicGuidanceReceipt as OmniTopicGuidanceReceipt,
  TopicChatResponse,
  TopicCitationRef,
} from '../omni/types'

const TOPIC_ARTIFACT_PREFIX = 'alpha:topic-artifact:'

type EvidenceType = 'paper' | 'node' | 'figure' | 'table' | 'formula' | 'section'
type TopicGenerationContext = Awaited<ReturnType<typeof collectTopicGenerationContext>>

interface TopicCardEditorial {
  eyebrow: string
  digest: string
  whyNow: string
  nextQuestion: string
}

export interface TopicStageEditorial {
  kicker: string
  summary: string
  transition: string
}

interface TopicClosingEditorial {
  title: string
  paragraphs: string[]
  reviewerNote: string
}

interface GeneratedTopicHero {
  kicker: string
  title: string
  standfirst: string
  strapline: string
  thesis: string
}

interface GeneratedTopicStageEditorial {
  title: string
  titleEn: string
  kicker: string
  summary: string
  transition: string
  stageThesis: string
}

interface TopicNodeCard {
  nodeId: string
  anchorId: string
  route: string
  title: string
  titleEn: string
  subtitle: string
  summary: string
  explanation: string
  paperCount: number
  paperIds: string[]
  primaryPaperTitle: string
  primaryPaperId: string
  coverImage: string | null
  isMergeNode: boolean
  provisional: boolean
  updatedAt: string
  branchLabel: string
  branchColor: string
  editorial: TopicCardEditorial
}

interface TopicSummaryPanel {
  thesis: string
  metaRows: Array<{
    label: string
    value: string
  }>
  stats: Array<{
    label: string
    value: number
  }>
  actions: Array<{
    id: 'start' | 'edit' | 'export' | 'delete' | 'rebuild'
    label: string
  }>
}

interface TopicTimelineStage {
  stageIndex: number
  title: string
  titleEn: string
  description: string
  locales?: StageLocaleMap
  branchLabel: string
  branchColor: string
  yearLabel: string
  dateLabel: string
  timeLabel: string
  stageThesis: string
  editorial: TopicStageEditorial
}

interface TopicGraphNode {
  nodeId: string
  anchorId: string
  route: string
  stageIndex: number
  title: string
  titleEn: string
  subtitle: string
  summary: string
  explanation: string
  paperCount: number
  paperIds: string[]
  primaryPaperTitle: string
  primaryPaperId: string
  coverImage: string | null
  isMergeNode: boolean
  provisional: boolean
  updatedAt: string
  branchLabel: string
  branchColor: string
  branchPathId: string
  parentNodeIds: string[]
  timeLabel: string
  layoutHint: {
    column: number
    span: number
    row: number
    emphasis: 'primary' | 'merge' | 'branch'
    laneIndex: number
    branchIndex: number | null
    isMainline: boolean
    side: 'left' | 'center' | 'right'
  }
  coverAsset: {
    imagePath: string | null
    alt: string
    source: 'paper-cover' | 'node-cover' | 'generated-brief'
  }
  cardEditorial: TopicCardEditorial
}

interface TopicGraphLane {
  id: string
  laneIndex: number
  branchIndex: number | null
  isMainline: boolean
  side: 'left' | 'center' | 'right'
  color: string
  roleLabel: string
  label: string
  labelEn: string
  description: string
  periodLabel: string
  nodeCount: number
  stageCount: number
  latestNodeId: string
  latestAnchorId: string
}

interface TopicStageConfig {
  windowMonths: number
  defaultWindowMonths: number
  minWindowMonths: number
  maxWindowMonths: number
  adjustable: boolean
}

export interface TopicViewModel {
  schemaVersion: string
  topicId: string
  title: string
  titleEn: string
  subtitle: string
  focusLabel: string
  summary: string
  description: string
  language: string
  status: string
  createdAt: string
  updatedAt: string
  generatedAt: string
  localization?: TopicLocalizationPayload | null
  hero: {
    kicker: string
    title: string
    standfirst: string
    strapline: string
  }
  stageConfig: TopicStageConfig
  summaryPanel: TopicSummaryPanel
  stats: {
    stageCount: number
    nodeCount: number
    paperCount: number
    evidenceCount: number
  }
  timeline: {
    stages: TopicTimelineStage[]
  }
  graph: {
    columnCount: number
    lanes: TopicGraphLane[]
    nodes: TopicGraphNode[]
  }
  generationState: {
    hero: 'ready' | 'pending'
    stageTimeline: 'ready' | 'pending'
    nodeCards: 'ready' | 'pending'
    closing: 'ready' | 'pending'
  }
  stages: Array<{
    stageIndex: number
    title: string
    titleEn: string
    description: string
    locales?: StageLocaleMap
    branchLabel: string
    branchColor: string
    editorial: TopicStageEditorial
    nodes: TopicNodeCard[]
  }>
  papers: Array<{
    paperId: string
    anchorId: string
    route: string
    title: string
    titleEn: string
    summary: string
    explanation: string
    publishedAt: string
    authors: string[]
    citationCount: number | null
    coverImage: string | null
    figuresCount: number
    tablesCount: number
    formulasCount: number
    sectionsCount: number
  }>
  narrativeArticle: string
  closingEditorial: TopicClosingEditorial
  resources: Array<{
    id: string
    kind: 'stage' | 'node' | 'paper'
    title: string
    subtitle: string
    description: string
    route: string
    anchorId?: string
  }>
  chatContext: {
    suggestedQuestions: string[]
  }
}

type TopicPipelineContext = ReturnType<typeof buildResearchPipelineContext>

interface TopicResearchSignals {
  generationContext: TopicGenerationContext
  latestResearchReport: ResearchRunReport | null
  pipelineState: ResearchPipelineState
  pipelineOverview: TopicPipelineContext
  sessionMemory: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>
  nodeReaderById: Map<string, NodeViewModel>
}

const TOPIC_VIEW_MODEL_SCHEMA = 'topic-workbench-v10'

export interface EvidencePayload {
  anchorId: string
  type: EvidenceType
  route: string
  title: string
  label: string
  quote: string
  content: string
  whyItMatters?: string
  placementHint?: string
  importance?: number
  thumbnailPath?: string | null
  metadata?: Record<string, unknown>
}

interface TopicCorpusChunk {
  anchorId: string
  type: EvidenceType
  route: string
  label: string
  quote: string
  content: string
}

interface TopicArtifactRecord {
  schemaVersion: 'topic-artifact-v1'
  topicId: string
  fingerprint: string
  updatedAt: string
  viewModel: TopicViewModel
}

type TopicViewModelBuildOptions = {
  quick?: boolean
  stageWindowMonths?: number
}

function resolveStageWindowMonths(stageWindowMonths?: number | null) {
  return normalizeStageWindowMonths(stageWindowMonths)
}

async function resolveTopicStageWindowMonths(
  topicId: string,
  stageWindowMonths?: number | null,
) {
  if (typeof stageWindowMonths === 'number' && Number.isFinite(stageWindowMonths)) {
    return resolveStageWindowMonths(stageWindowMonths)
  }

  const config = await loadTopicStageConfig(topicId)
  return resolveStageWindowMonths(config.windowMonths)
}

function topicArtifactKey(topicId: string, stageWindowMonths = DEFAULT_STAGE_WINDOW_MONTHS) {
  return `${TOPIC_ARTIFACT_PREFIX}${topicId}:window-${resolveStageWindowMonths(stageWindowMonths)}`
}

const topicArtifactBuildQueue = new Map<string, Promise<TopicViewModel>>()
const DEFERRED_TOPIC_ARTIFACTS_DISABLED =
  process.env.TOPIC_ARTIFACT_DISABLE_DEFERRED === '1' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT === 'child-v8' ||
  process.env.NODE_ENV === 'test'

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseJsonValue<T>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function clipText(value: string, maxLength = 240) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function normalizeTopicSentence(value: string | null | undefined) {
  return value?.replace(/\s+/gu, ' ').trim() ?? ''
}

const TOPIC_LOW_SIGNAL_PATTERNS = [
  /并不是单篇论文结论/u,
  /围绕同一问题形成的一段研究推进/u,
  /节点级判断不能只停在/u,
  /图、表、公式在这里的意义/u,
  /如果节点目前主要由一篇论文支撑/u,
  /节点总结不能只停在/u,
  /多篇论文共同坐实/u,
  /this node is not a single-paper conclusion/iu,
  /formed around the same question/iu,
  /if the node is mainly supported by a single paper/iu,
  /the node judgment cannot stop at/iu,
]

function isLowSignalTopicSentence(value: string | null | undefined) {
  const normalized = normalizeTopicSentence(value)
  if (!normalized) return true
  if (looksLikeTopicMapCardNoise(normalized)) return true
  return TOPIC_LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))
}

function collectReadableTopicStrings(
  values: Array<string | null | undefined>,
  limit = 4,
  maxLength = 220,
) {
  const preferred = uniqueStrings(
    values.filter((value) => !isLowSignalTopicSentence(value)),
    limit,
    maxLength,
  )

  if (preferred.length > 0) return preferred
  return uniqueStrings(
    values
      .map((value) => sanitizeTopicSentenceCandidate(value, maxLength))
      .filter(Boolean),
    limit,
    maxLength,
  )
}

function stripTopicTrailingPunctuation(value: string | null | undefined) {
  return normalizeTopicSentence(value).replace(/[。！？!?；;：:，,、]+$/u, '')
}

function ensureTopicSentence(value: string | null | undefined) {
  const normalized = normalizeTopicSentence(value)
  if (!normalized) return ''
  return /[。！？!?]$/u.test(normalized) ? normalized : `${normalized}。`
}

function quoteTopicLabel(value: string | null | undefined) {
  const normalized = stripTopicTrailingPunctuation(value)
  return normalized ? `「${normalized}」` : ''
}

function joinQuotedTopicLabels(values: Array<string | null | undefined>, limit = 2) {
  const labels = uniqueStrings(
    values.map((value) => stripTopicTrailingPunctuation(value)),
    limit,
    36,
  )

  return labels.map((label) => `「${label}」`).join('、')
}

function pickReadableTopicLine(values: Array<string | null | undefined>, maxLength = 180) {
  return collectReadableTopicStrings(values, 1, maxLength)[0] ?? ''
}

function normalizeTopicEchoKey(value: string | null | undefined) {
  return stripTopicTrailingPunctuation(value).replace(/\s+/gu, '').toLowerCase()
}

function isTopicEchoSentence(
  value: string | null | undefined,
  references: Array<string | null | undefined>,
) {
  const normalized = normalizeTopicSentence(value)
  const candidateKey = normalizeTopicEchoKey(value)
  if (!candidateKey) return true

  if (candidateKey.length <= 8 && !/[。！？!?：:，,、;；\s]/u.test(normalized)) {
    return true
  }

  return references.some((reference) => {
    const referenceKey = normalizeTopicEchoKey(reference)
    if (!referenceKey) return false
    if (
      candidateKey === referenceKey ||
      candidateKey === `研究${referenceKey}` ||
      candidateKey === `关于${referenceKey}` ||
      candidateKey === `聚焦${referenceKey}`
    ) {
      return true
    }

    return (
      referenceKey.length >= 4 &&
      candidateKey.includes(referenceKey) &&
      Math.abs(candidateKey.length - referenceKey.length) <= 4
    )
  })
}

function pickDistinctReadableTopicLine(
  values: Array<string | null | undefined>,
  references: Array<string | null | undefined>,
  maxLength = 180,
) {
  const candidates = collectReadableTopicStrings(values, 6, maxLength)
  return candidates.find((value) => !isTopicEchoSentence(value, references)) ?? ''
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
) {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1))
  const results = new Array<TOutput>(items.length)
  let cursor = 0

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

function sanitizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function sanitizeParagraphs(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const next = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return next.length > 0 ? next : fallback
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 8, maxLength = 220) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = clipText(value, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function pickTopicMapNodePaperIds(args: {
  nodePaperIds: string[]
  stageScopedPaperIds?: Set<string> | null
  readerPaperIds?: string[]
}) {
  const scopedReaderPaperIds = uniqueStrings(
    (args.readerPaperIds ?? []).filter(
      (paperId) => !args.stageScopedPaperIds || args.stageScopedPaperIds.has(paperId),
    ),
    16,
    80,
  )
  if (scopedReaderPaperIds.length > 0) {
    return scopedReaderPaperIds
  }

  const scopedNodePaperIds = uniqueStrings(
    args.nodePaperIds.filter(
      (paperId) => !args.stageScopedPaperIds || args.stageScopedPaperIds.has(paperId),
    ),
    16,
    80,
  )
  if (scopedNodePaperIds.length > 0) {
    return scopedNodePaperIds
  }

  return scopedReaderPaperIds
}

function readStringArray(value: unknown, maxLength = 220) {
  return Array.isArray(value)
    ? uniqueStrings(
        value.map((item) => (typeof item === 'string' ? item : null)),
        6,
        maxLength,
      )
    : []
}

function summarizeBodyLines(value: unknown, limit = 2, maxLength = 220) {
  return Array.isArray(value)
    ? uniqueStrings(
        value.map((item) => (typeof item === 'string' ? item : null)),
        limit,
        maxLength,
      )
    : []
}

function readFullContentSummary(fullContent: Record<string, unknown> | null) {
  const summary = fullContent?.summary
  const summaryRecord =
    summary && typeof summary === 'object' && !Array.isArray(summary)
      ? (summary as Record<string, unknown>)
      : null

  return {
    oneLine:
      typeof summaryRecord?.oneLine === 'string'
        ? clipText(summaryRecord.oneLine, 180)
        : '',
    keyContribution:
      typeof summaryRecord?.keyContribution === 'string'
        ? clipText(summaryRecord.keyContribution, 220)
        : '',
    mainResults: readStringArray(summaryRecord?.mainResults, 180),
  }
}

const TOPIC_FIGURE_PRIORITY_PATTERNS = [
  /\b(architecture|framework|pipeline|overview|method|model|system|workflow|diagram|design|training|inference)\b/iu,
  /(架构|框架|流程|方法|模型|系统|示意|总览|概览|训练|推理|原理图)/u,
]

function scoreFigureCaption(caption: string | null | undefined) {
  if (!caption) return 0

  const normalized = caption.replace(/\s+/gu, ' ').trim()
  if (!normalized) return 0

  return TOPIC_FIGURE_PRIORITY_PATTERNS.reduce(
    (score, pattern) => (pattern.test(normalized) ? score + 3 : score),
    Math.min(2, Math.floor(normalized.length / 48)),
  )
}

function pickRepresentativeFigureImage(
  paper: Pick<TopicDisplayPaperShape, 'figures'> | null | undefined,
) {
  if (!paper?.figures?.length) return null

  const candidate = [...paper.figures]
    .filter((figure) => typeof figure.imagePath === 'string' && Boolean(figure.imagePath.trim()))
    .sort((left, right) => scoreFigureCaption(right.caption) - scoreFigureCaption(left.caption))[0]

  return candidate?.imagePath ?? null
}

function buildNodeCoverImage(args: {
  node: {
    nodeCoverImage: string | null
    primaryPaperId: string | null
    papers: Array<{ paperId: string | null }>
    primaryPaper: {
      coverPath: string | null
    }
  }
  reader: NodeViewModel | null
  rawPaperById: Map<string, TopicDisplayPaperShape>
  paperIds?: Array<string | null | undefined>
}) {
  const { node, reader, rawPaperById, paperIds } = args
  const relatedPaperIds = Array.from(
    new Set(
      (paperIds?.length
        ? paperIds
        : [node.primaryPaperId, ...node.papers.map((item) => item.paperId)]
      ).filter((paperId): paperId is string => typeof paperId === 'string' && Boolean(paperId.trim())),
    ),
  )
  const relatedPapers = relatedPaperIds
    .map((paperId) => rawPaperById.get(paperId) ?? null)
    .filter((paper): paper is TopicDisplayPaperShape => Boolean(paper))

  const relatedFigureImage = relatedPapers
    .map((paper) => pickRepresentativeFigureImage(paper))
    .find((imagePath): imagePath is string => Boolean(imagePath))

  const evidenceFigure =
    reader?.evidence.find(
      (item) => item.type === 'figure' && Boolean(item.imagePath || item.thumbnailPath),
    ) ??
    reader?.evidence.find((item) => Boolean(item.imagePath || item.thumbnailPath)) ??
    null

  return (
    node.nodeCoverImage ??
    evidenceFigure?.imagePath ??
    evidenceFigure?.thumbnailPath ??
    relatedFigureImage ??
    reader?.paperRoles.find((item) => item.coverImage)?.coverImage ??
    relatedPapers.find((paper) => Boolean(paper?.coverPath))?.coverPath ??
    node.primaryPaper.coverPath ??
    null
  )
}

const TOPIC_RELATED_PAPER_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'using',
  'based',
  'through',
  'autonomous',
  'driving',
  'vehicle',
  'vehicles',
  'study',
  'analysis',
  'system',
  'framework',
  'data',
  'dataset',
  'datasets',
  'results',
  'result',
  'problem',
  'problems',
  'task',
  'tasks',
  'approach',
  'approaches',
  'paper',
  'papers',
  'behavior',
  'behaviour',
  'large',
  'scale',
  'traffic',
  'research',
  'topic',
  'stage',
  'method',
  'methods',
  '问题',
  '研究',
  '方法',
  '阶段',
  '主题',
  '系统',
  '框架',
  '自动驾驶',
])

const TOPIC_RELATION_FAMILIES: Array<{
  trigger: RegExp
  matches: RegExp[]
  bonus: number
}> = [
  {
    trigger: /(世界模型|world model|world models)/iu,
    matches: [/(世界模型)/iu, /\bworld models?\b/iu],
    bonus: 6,
  },
  {
    trigger: /(多模态|multimodal)/iu,
    matches: [/(多模态)/iu, /\bmultimodal\b/iu],
    bonus: 5,
  },
  {
    trigger: /(生成式|generative|generation)/iu,
    matches: [/(生成式)/iu, /\bgenerative\b/iu, /\bgeneration\b/iu],
    bonus: 4,
  },
  {
    trigger: /(统一|unified|single-stage|uniad)/iu,
    matches: [/(统一)/iu, /\bunified\b/iu, /\bsingle stage\b/iu, /\bsingle-stage\b/iu, /\buniad\b/iu],
    bonus: 4,
  },
]

function normalizeTopicRelationText(value: string | null | undefined) {
  return normalizeTopicSentence(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{Script=Han}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function collectTopicRelationKeywords(values: Array<string | null | undefined>, limit = 18) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = normalizeTopicRelationText(value)
    if (!normalized) continue

    const hanTokens = normalized.match(/[\p{Script=Han}]{2,12}/gu) ?? []
    for (const token of hanTokens) {
      if (TOPIC_RELATED_PAPER_STOPWORDS.has(token) || seen.has(token)) continue
      seen.add(token)
      output.push(token)
      if (output.length >= limit) return output
    }

    const latinTokens = normalized
      .split(/\s+/u)
      .filter((token) => token.length >= 4 && !TOPIC_RELATED_PAPER_STOPWORDS.has(token))

    for (let index = 0; index < latinTokens.length; index += 1) {
      const token = latinTokens[index]
      if (!seen.has(token)) {
        seen.add(token)
        output.push(token)
        if (output.length >= limit) return output
      }

      const nextToken = latinTokens[index + 1]
      if (!nextToken) continue
      const phrase = `${token} ${nextToken}`
      if (seen.has(phrase)) continue
      seen.add(phrase)
      output.push(phrase)
      if (output.length >= limit) return output
    }
  }

  return output
}

function topicRelationKeywordWeight(keyword: string) {
  if (/[\p{Script=Han}]/u.test(keyword)) {
    return keyword.length >= 4 ? 4 : 3
  }

  if (keyword.includes(' ')) return 4
  if (keyword.length >= 9) return 3
  if (keyword.length >= 6) return 2
  return 1
}

type TopicRelatedPaperScore = {
  score: number
  keywordScore: number
  assetScore: number
  matchCount: number
  strongMatchCount: number
}

function scoreTopicRelatedPaper(
  paper: TopicDisplayPaperShape,
  keywords: string[],
  referenceText = '',
) : TopicRelatedPaperScore {
  const haystack = normalizeTopicRelationText(
    [
      paper.titleZh,
      paper.titleEn,
      paper.title,
      paper.summary,
      paper.explanation,
    ]
      .filter(Boolean)
      .join(' '),
  )

  if (!haystack) {
    return {
      score: 0,
      keywordScore: 0,
      assetScore: 0,
      matchCount: 0,
      strongMatchCount: 0,
    }
  }

  let keywordScore = 0
  let matchCount = 0
  let strongMatchCount = 0
  for (const keyword of keywords) {
    if (!keyword || !haystack.includes(keyword)) continue
    const weight = topicRelationKeywordWeight(keyword)
    keywordScore += weight
    matchCount += 1
    if (weight >= 3 || keyword.includes(' ')) {
      strongMatchCount += 1
    }
  }

  for (const family of TOPIC_RELATION_FAMILIES) {
    if (!family.trigger.test(referenceText)) continue
    if (!family.matches.some((pattern) => pattern.test(haystack))) continue
    keywordScore += family.bonus
    matchCount += 1
    strongMatchCount += 1
  }

  const assetScore = (paper.figures.length > 0 ? 1 : 0) + (paper.coverPath ? 1 : 0)

  return {
    score: keywordScore + assetScore,
    keywordScore,
    assetScore,
    matchCount,
    strongMatchCount,
  }
}

function collectNodeDisplayPaperIds(args: {
  node: {
    primaryPaperId: string | null
    nodeLabel: string
    nodeSubtitle: string | null
    nodeSummary: string
    nodeExplanation: string | null
    primaryPaper: {
      title: string
      titleZh: string | null
      titleEn: string | null
    }
    papers: Array<{
      paperId: string | null
    }>
  }
  stageTitle: string
  papers: TopicDisplayPaperShape[]
}) {
  const linkedIds = Array.from(
    new Set(
      [args.node.primaryPaperId, ...args.node.papers.map((item) => item.paperId)].filter(
        (paperId): paperId is string => typeof paperId === 'string' && Boolean(paperId.trim()),
      ),
    ),
  )

  const keywords = collectTopicRelationKeywords([
    args.node.nodeLabel,
    args.node.nodeSubtitle,
    args.node.nodeSummary,
    args.node.nodeExplanation,
    args.node.primaryPaper.titleZh,
    args.node.primaryPaper.titleEn,
    args.node.primaryPaper.title,
    args.stageTitle,
  ])
  const referenceText = [
    args.node.nodeLabel,
    args.node.nodeSubtitle,
    args.node.nodeSummary,
    args.node.nodeExplanation,
    args.node.primaryPaper.titleZh,
    args.node.primaryPaper.titleEn,
    args.node.primaryPaper.title,
    args.stageTitle,
  ]
    .filter(Boolean)
    .join(' ')

  if (keywords.length === 0) return linkedIds

  const scoredSupplementals = args.papers
    .filter((paper) => !linkedIds.includes(paper.id))
    .map((paper) => ({
      paperId: paper.id,
      relation: scoreTopicRelatedPaper(paper, keywords, referenceText),
      publishedAt: paper.published.getTime(),
    }))
    .sort((left, right) => {
      if (right.relation.score !== left.relation.score) {
        return right.relation.score - left.relation.score
      }
      if (right.relation.keywordScore !== left.relation.keywordScore) {
        return right.relation.keywordScore - left.relation.keywordScore
      }
      return right.publishedAt - left.publishedAt
    })

  const supplementalIds = scoredSupplementals
    .filter(
      (paper) =>
        paper.relation.keywordScore >= 4 &&
        (paper.relation.strongMatchCount >= 1 || paper.relation.matchCount >= 2),
    )
    .slice(0, 6)
    .map((paper) => paper.paperId)

  const fallbackIds =
    supplementalIds.length === 0 && linkedIds.length <= 1
      ? scoredSupplementals
          .filter(
            (paper) =>
              paper.relation.keywordScore >= 3 &&
              paper.relation.strongMatchCount >= 1 &&
              paper.relation.assetScore >= 1,
          )
          .slice(0, 2)
          .map((paper) => paper.paperId)
      : []

  return [...linkedIds, ...(supplementalIds.length > 0 ? supplementalIds : fallbackIds)]
}

function normalizeTopicMapCardKey(value: string | null | undefined) {
  return normalizeTopicSentence(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function stripTopicMapCardIds(value: string | null | undefined) {
  return normalizeTopicSentence(value)
    .replace(/[\(（]\s*(?:node|paper|stage)[-:][^)）\s]+[\)）]/giu, ' ')
    .replace(/\b(?:node|paper|stage)[-:][\w-]+\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

const TOPIC_MAP_CARD_NOISE_PATTERNS = [
  /^\.{2,}$/u,
  /^…{2,}$/u,
  /当前节点主要由一篇论文支撑/u,
  /跨论文比较还没有真正展开/u,
  /节点目前仍然依赖单篇论文/u,
  /后续最好补入/u,
  /过早纳入/u,
  /证据真空/u,
  /结构性证据真空/u,
  /零架构图/u,
  /零数学公式/u,
  /零系统对比/u,
  /本轮/u,
  /下一次研究/u,
  /研究循环/u,
  /主要由一篇论文支撑/u,
  /cross-paper comparison has not/u,
  /currently mainly supported by a single paper/iu,
  /evidence vacuum/iu,
  /prematurely elevated/iu,
]

const TOPIC_MAP_CARD_PROMPT_LEAK_PATTERNS = [
  /\bthe user wants\b/iu,
  /\bkey requirements?\b/iu,
  /\bstructure plan\b/iu,
  /\bsummary context\b/iu,
  /\bintroduction\s*:/iu,
  /\bcritical judgment\s*:/iu,
  /\bevidence awareness\s*:/iu,
  /\blimitations?\s*:/iu,
  /\bconclusion\s*:/iu,
  /\breference paper\b/iu,
  /\brelated papers? to mention\b/iu,
  /\btone\s*:/iu,
  /\bnote\s*:/iu,
  /\b500-800\s*word\b/iu,
  /\bchinese narrative\b/iu,
  /\bkeyword overlap fallback\b/iu,
  /\bshould treat this as\b/iu,
  /\bfuture date\b/iu,
  /^brief reason$/iu,
  /^autonomous vehicle technology and safety$/iu,
  /published\s+dec(?:ember)?\s+\d{1,2},\s+\d{4}/iu,
]

const TOPIC_MAP_CARD_PROCESS_PATTERNS = [
  /(?:\d+\s*小时?\s*)?研究已(?:暂停|完成|结束|中止)/u,
  /这轮\s*\d+\s*小时?\s*研究已/u,
  /系统围绕当前主题主线持续检索/u,
  /持续检索、纳入、改写并回看/u,
  /已经完成\s*\d+\s*次研究循环/u,
  /累计发现\s*\d+\s*篇候选论文/u,
  /触发\s*\d+\s*次内容重建/u,
  /本轮没有新的论文被纳入主线/u,
  /当前停留在第\s*\d+\s*\/\s*\d+\s*阶段/u,
  /正在检索并筛选新的论文候选/u,
  /按预设轮次机械停下/u,
  /证据收束与判断校准/u,
  /\bcandidate papers?\b/iu,
  /\bresearch (?:run|cycle)\b/iu,
  /\badmitted\b/iu,
  /\brebuilt or refreshed\b/iu,
]

function looksLikeTopicPromptLeak(value: string | null | undefined) {
  const normalized = stripTopicTrailingPunctuation(stripTopicMapCardIds(value))
  if (!normalized) return false
  return TOPIC_MAP_CARD_PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(normalized))
}

function looksLikeTopicProcessLeak(value: string | null | undefined) {
  const normalized = stripTopicTrailingPunctuation(stripTopicMapCardIds(value))
  if (!normalized) return false
  return TOPIC_MAP_CARD_PROCESS_PATTERNS.some((pattern) => pattern.test(normalized))
}

function stripInlineTopicOperationalClauses(value: string | null | undefined) {
  return stripTopicMapCardIds(value)
    .replace(/(?:^|[：:，,]\s*)(?:\d+\s*小时?\s*)?研究已(?:暂停|完成|结束|中止)[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)系统围绕当前主题主线持续检索[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)持续检索、纳入、改写并回看[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)已经完成\s*\d+\s*次研究循环[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)累计发现\s*\d+\s*篇候选论文[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)触发\s*\d+\s*次内容重建[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)本轮没有新的论文被纳入主线[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)当前停留在第\s*\d+\s*\/\s*\d+\s*阶段[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)正在检索并筛选新的论文候选[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)按预设轮次机械停下[^。！？!?；;]*/gu, ' ')
    .replace(/(?:^|[：:，,]\s*)证据收束与判断校准[^。！？!?；;]*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[：:，,、]+$/u, '')
    .trim()
}

function looksLikeTopicMapCardNoise(value: string | null | undefined) {
  const normalized = stripTopicTrailingPunctuation(stripTopicMapCardIds(value))
  if (!normalized) return true
  if (normalized.length < 6) return true
  if (looksLikeTopicChatOperationalNoise(normalized)) return true
  if (looksLikeTopicPromptLeak(normalized)) return true
  if (looksLikeTopicProcessLeak(normalized)) return true
  return TOPIC_MAP_CARD_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function splitTopicMapCardSentences(value: string | null | undefined) {
  const normalized = stripInlineTopicOperationalClauses(value)
    .replace(/\.{3,}|…{2,}/gu, '。')
    .replace(/\s+/gu, ' ')
    .trim()

  if (!normalized) return []

  return normalized
    .split(/(?<=[。！？!?；;])\s*|\n+/u)
    .map((sentence) => stripTopicTrailingPunctuation(sentence))
    .filter(Boolean)
}

function collectTopicMapCardSentences(
  values: Array<string | null | undefined>,
  limit = 2,
  maxLength = 160,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    for (const sentence of splitTopicMapCardSentences(value)) {
      if (looksLikeTopicMapCardNoise(sentence)) continue
      const normalized = clipText(ensureTopicSentence(sentence), maxLength)
      const key = normalizeTopicMapCardKey(normalized)
      if (!key || seen.has(key)) continue
      seen.add(key)
      output.push(normalized)
      if (output.length >= limit) return output
    }
  }

  return output
}

function sanitizeTopicSentenceCandidate(
  value: string | null | undefined,
  maxLength: number,
) {
  const picked = collectTopicMapCardSentences([value], 1, maxLength)[0]
  if (picked) return picked

  const normalized = stripInlineTopicOperationalClauses(value)
    .replace(/\.{3,}|…{2,}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()

  if (!normalized || looksLikeTopicMapCardNoise(normalized)) {
    return ''
  }

  const clipped = clipText(normalized, maxLength)
  return looksLikeTopicMapCardNoise(clipped) ? '' : clipped
}

function sanitizeTopicUserFacingSentence(
  value: string | null | undefined,
  fallback = '',
  maxLength = 180,
) {
  return (
    sanitizeTopicSentenceCandidate(value, maxLength) ||
    sanitizeTopicSentenceCandidate(fallback, maxLength)
  )
}

function sanitizeTopicUserFacingParagraphs(
  values: Array<string | null | undefined>,
  fallback: string[],
  limit = 3,
  maxLength = 220,
) {
  const next = uniqueStrings(
    values
      .map((value) => sanitizeTopicUserFacingSentence(value, '', maxLength))
      .filter(Boolean),
    limit,
    maxLength,
  )

  if (next.length > 0) return next

  const fallbackParagraphs = uniqueStrings(
    fallback
      .map((value) => sanitizeTopicUserFacingSentence(value, '', maxLength))
      .filter(Boolean),
    limit,
    maxLength,
  )

  return fallbackParagraphs
}

function buildTopicPaperSummary(args: {
  paperTitle: string
  summary: string | null | undefined
  explanation: string | null | undefined
}) {
  return (
    sanitizeTopicUserFacingSentence(args.summary, '', 180) ||
    sanitizeTopicUserFacingSentence(args.explanation, '', 180) ||
    clipText(`这篇论文为当前主题补充了与「${clipText(args.paperTitle, 36)}」相关的研究线索。`, 180)
  )
}

function buildTopicPaperExplanation(args: {
  paperTitle: string
  summary: string | null | undefined
  explanation: string | null | undefined
}) {
  return (
    sanitizeTopicUserFacingSentence(args.explanation, '', 220) ||
    sanitizeTopicUserFacingSentence(args.summary, '', 220) ||
    clipText(`《${clipText(args.paperTitle, 48)}》目前可作为这一主题中的相关入口，用来补充方法、证据或邻近问题。`, 220)
  )
}

function compactEnglishTopicMapTitle(value: string, maxLength = 38) {
  const normalized = normalizeTopicSentence(value)
  if (!normalized) return ''

  let compact = normalized
    .replace(
      /^(analysis|study|understanding|rethinking|exploring|revisiting|investigating|examining)\s+of\s+/iu,
      '',
    )
    .replace(/^(towards|toward)\s+/iu, '')
    .replace(/^(a|an|the)\s+/iu, '')

  const connector = compact.match(/\s+(using|with|via|through|from|for|based on|under)\s+/iu)
  if (connector?.index && connector.index >= 16) {
    compact = compact.slice(0, connector.index)
  }

  compact = compact
    .replace(/\b(large[- ]scale|dataset|datasets)\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()

  return clipText(compact || normalized, maxLength)
}

function compactTopicMapNodeTitle(args: {
  nodeTitle: string
  nodeSubtitle?: string | null
  primaryPaperTitle?: string | null
}) {
  const rawTitle = normalizeTopicSentence(args.nodeTitle)
  const subtitle = normalizeTopicSentence(args.nodeSubtitle)
  const primaryPaperTitle = normalizeTopicSentence(args.primaryPaperTitle)
  const rawKey = normalizeTopicMapCardKey(rawTitle)
  const primaryKey = normalizeTopicMapCardKey(primaryPaperTitle)
  const titleLooksLikePaper =
    Boolean(rawTitle) &&
    (rawTitle.length > 34 ||
      (rawKey.length > 0 && rawKey === primaryKey) ||
      (!/[\p{Script=Han}]/u.test(rawTitle) && rawTitle.split(/\s+/u).length >= 6))

  if (!titleLooksLikePaper && rawTitle.length <= 26) {
    return clipText(rawTitle, 26)
  }

  if (subtitle && subtitle.length <= 18 && !looksLikeTopicMapCardNoise(subtitle)) {
    return clipText(subtitle, 22)
  }

  if (!/[\p{Script=Han}]/u.test(rawTitle)) {
    return compactEnglishTopicMapTitle(rawTitle)
  }

  if (/[:：]/u.test(rawTitle)) {
    const segments = rawTitle
      .split(/[:：]/u)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .sort((left, right) => left.length - right.length)
    if (segments[0]) {
      return clipText(segments[0], 22)
    }
  }

  return clipText(rawTitle || primaryPaperTitle || '研究节点', 24)
}

function buildTopicMapNodeSummary(args: {
  nodeTitle: string
  primaryPaperTitle: string
  paperCount: number
  candidates: Array<string | null | undefined>
}) {
  const focusLabel = stripTopicTrailingPunctuation(args.nodeTitle) || stripTopicTrailingPunctuation(args.primaryPaperTitle) || '当前节点'
  const primaryPaperTitle = stripTopicTrailingPunctuation(args.primaryPaperTitle) || focusLabel

  if (args.paperCount > 1) {
    return clipText(`该节点当前纳入 ${args.paperCount} 篇论文，核心聚焦「${focusLabel}」。`, 118)
  }

  return clipText(`该节点当前以《${primaryPaperTitle}》为入口，先说明「${focusLabel}」这条问题线。`, 118)

  const picked = collectTopicMapCardSentences(args.candidates, 1, 118)[0]
  if (picked) return picked

  if (args.paperCount > 1) {
    return clipText(
      `这一节点汇集了 ${args.paperCount} 篇相关研究，用来比较「${args.nodeTitle}」在不同方法里的共同推进与关键分歧。`,
      118,
    )
  }

  return clipText(
    `这一节点以《${args.primaryPaperTitle || '代表论文'}》为入口，概括「${args.nodeTitle}」当前最值得保留的研究判断。`,
    118,
  )
}

function buildTopicMapNodeExplanation(args: {
  nodeTitle: string
  primaryPaperTitle: string
  paperCount: number
  summary: string
  candidates: Array<string | null | undefined>
}) {
  const focusLabel = stripTopicTrailingPunctuation(args.nodeTitle) || stripTopicTrailingPunctuation(args.primaryPaperTitle) || '当前节点'
  const primaryPaperTitle = stripTopicTrailingPunctuation(args.primaryPaperTitle) || focusLabel

  if (args.paperCount > 1) {
    return clipText(
      `这一节点把同一时间阶段内与「${focusLabel}」直接相关的 ${args.paperCount} 篇论文放在一起，阅读时先看主线论文，再比较方法、证据和仍未闭合的问题。`,
      188,
    )
  }

  return clipText(
    `这一节点目前只纳入 1 篇论文，重点是读清《${primaryPaperTitle}》如何定义「${focusLabel}」、采用什么方法，以及证据边界停在什么位置。`,
    188,
  )

  const summaryKey = normalizeTopicMapCardKey(args.summary)
  const picked = collectTopicMapCardSentences(args.candidates, 3, 160).filter(
    (sentence) => normalizeTopicMapCardKey(sentence) !== summaryKey,
  )

  if (picked.length > 0) {
    return clipText(picked.slice(0, 2).join(' '), 188)
  }

  if (args.paperCount > 1) {
    return clipText(
      `这一节点目前纳入了 ${args.paperCount} 篇论文，用来比较不同工作怎样推进「${args.nodeTitle}」这一问题。`,
      188,
    )
  }

  return clipText(
    `这一节点目前主要以《${args.primaryPaperTitle || '代表论文'}》为入口，帮助读者先抓住「${args.nodeTitle}」的核心问题、方法线索与证据边界。`,
    188,
  )
}

function toResearchQuestion(value: string | null | undefined, prefix: string) {
  if (!value) return ''

  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (/[?？]$/u.test(normalized)) return normalized
  return `${prefix}${normalized}`
}

function rewriteNodeCritiqueQuestion(args: {
  nodeTitle: string
  primaryPaperTitle: string
  critique: string | null | undefined
  evidenceCount: number
}) {
  const { nodeTitle, primaryPaperTitle, critique, evidenceCount } = args
  const normalized = normalizeTopicSentence(critique)
  if (!normalized) return ''

  if (/主要由一篇论文支撑/u.test(normalized)) {
    return `围绕「${nodeTitle}」还需要继续判断：目前主要依赖《${primaryPaperTitle}》这一篇论文，这究竟足以构成稳定节点，还是把单篇结果过早上升成阶段判断？`
  }

  if (/可视化|图表|表格/u.test(normalized)) {
    return evidenceCount > 0
      ? `围绕「${nodeTitle}」还需要继续补证：现有图表证据是否真的对应了这个节点最关键的机制与结果，还是仍然停留在间接支持？`
      : `围绕「${nodeTitle}」还需要继续补证：当前几乎没有图表或公式证据去直接展示关键机制与结果，现有判断仍偏文字转述。`
  }

  if (/哪些问题已被推进|重新表述/u.test(normalized)) {
    return `围绕「${nodeTitle}」还需要继续拆解：这篇论文到底真正推进了什么，又有哪些困难只是被重新命名，而没有被解决？`
  }

  return toResearchQuestion(normalized, `围绕「${nodeTitle}」还需要继续判断：`)
}

function buildNodeFallbackQuestion(args: {
  node: TopicNodeCard
  reader: NodeViewModel | null
}) {
  const { node, reader } = args
  const primaryPaperTitle = reader?.paperRoles[0]?.title || node.primaryPaperTitle || '这篇论文'
  const evidenceCount =
    (reader?.stats.figureCount ?? 0) +
    (reader?.stats.tableCount ?? 0) +
    (reader?.stats.formulaCount ?? 0)

  if ((reader?.paperRoles.length ?? 0) > 1) {
    return `围绕「${node.title}」还需要继续比较：这些论文各自推进的是同一个判断，还是只是在相邻问题上形成了看起来相似的合流？`
  }

  if (evidenceCount === 0) {
    return `围绕「${node.title}」还需要继续补证：目前几乎只能依赖《${primaryPaperTitle}》的文字总结，关键机制与结果还缺少图表或公式证据来直接支撑。`
  }

  return `围绕「${node.title}」还需要继续判断：《${primaryPaperTitle}》给出的证据，究竟是在建立一个稳定节点，还是只说明了阶段性可行性？`
}

function pickStageReportSummary(
  latestResearchReport: ResearchRunReport | null,
  stageIndex: number,
) {
  if (!latestResearchReport) return ''
  if (latestResearchReport.currentStage !== stageIndex) return ''
  return sanitizeResearchFacingSummary(
    latestResearchReport.latestStageSummary ||
      latestResearchReport.summary ||
      latestResearchReport.headline,
    '',
  )
}

function buildStageResearchEditorial(args: {
  stage: TopicViewModel['stages'][number]
  previousStageTitle: string | null
  pipeline: TopicPipelineContext
  latestResearchReport: ResearchRunReport | null
  generationContext: TopicGenerationContext
}) {
  const { stage, previousStageTitle, pipeline, latestResearchReport, generationContext } = args
  const nodeCount = stage.nodes.length
  const paperCount = stage.nodes.reduce((count, node) => count + (node.paperCount ?? 0), 0)
  const focusNodes = uniqueStrings(stage.nodes.map((node) => stripTopicTrailingPunctuation(node.title)), 3, 24)
  const focusLabel = focusNodes.join('、') || stripTopicTrailingPunctuation(stage.title) || `Stage ${stage.stageIndex}`

  return {
    summary: clipText(
      `该阶段当前纳入 ${paperCount} 篇论文、形成 ${nodeCount} 个节点，重点集中在「${focusLabel}」。`,
      180,
    ),
    transition: clipText(
      previousStageTitle
        ? `相较上一阶段「${stripTopicTrailingPunctuation(previousStageTitle)}」，这一阶段把同一时间窗内的材料重新收束到「${focusLabel}」，便于继续按阶段阅读。`
        : `这一阶段从「${focusLabel}」开始整理同一时间窗内的论文与节点，为后续阶段继续扩展主线与支线。`,
      180,
    ),
    stageThesis: clipText(`纳入 ${paperCount} 篇论文，聚焦 ${focusLabel}`, 110),
  }

  const leadNodeLabels = joinQuotedTopicLabels(
    stage.nodes.map((node) => node.title),
    stage.nodes.length > 1 ? 2 : 1,
  )
  const summaryLead = pickReadableTopicLine(
    [
      pickStageReportSummary(latestResearchReport, stage.stageIndex),
      pipeline.currentStage?.stageSummary,
      ...stage.nodes.slice(0, 2).flatMap((node) => [
        node.editorial.digest,
        node.summary,
        node.explanation,
      ]),
      stage.editorial.summary,
      stage.description,
    ],
    200,
  )
  const summary = clipText(
    ensureTopicSentence(
      summaryLead
        ? leadNodeLabels
          ? `这一阶段真正立住的判断，是围绕${leadNodeLabels}逐步展开的：${stripTopicTrailingPunctuation(summaryLead)}`
          : summaryLead
        : leadNodeLabels
          ? `这一阶段开始围绕${leadNodeLabels}重新组织证据与判断`
          : stage.editorial.summary,
    ) || ensureTopicSentence(stage.editorial.summary),
    220,
  )
  const continuityLead = pickReadableTopicLine(
    [
      pipeline.subjectFocus.relatedNodeActions[0],
      pipeline.continuityThreads[0],
      generationContext.continuityThreads[0],
      latestResearchReport?.keyMoves?.[0],
      stage.nodes[0]?.editorial.whyNow,
      stage.editorial.transition,
    ],
    170,
  )
  const openQuestion = pickReadableTopicLine(
    [
      stage.nodes[0]?.editorial.nextQuestion,
      pipeline.currentStage?.openQuestions?.[0],
      pipeline.globalOpenQuestions[0],
      latestResearchReport?.openQuestions?.[0],
      generationContext.openQuestions[0],
    ],
    150,
  )
  const transition = clipText(
    ensureTopicSentence(
      previousStageTitle
        ? openQuestion
          ? `从${quoteTopicLabel(previousStageTitle)}走到${quoteTopicLabel(stage.title)}之后，研究的判断重心进一步转向${leadNodeLabels || quoteTopicLabel(stage.title) || '关键节点'}；接下来最需要继续追问的是：${stripTopicTrailingPunctuation(openQuestion)}`
          : continuityLead
            ? `从${quoteTopicLabel(previousStageTitle)}走到${quoteTopicLabel(stage.title)}，主线不再只是重复前一阶段，而是开始把证据重心压到${leadNodeLabels || quoteTopicLabel(stage.title) || '这里'}：${stripTopicTrailingPunctuation(continuityLead)}`
            : `和${quoteTopicLabel(previousStageTitle)}相比，这一步真正推进的是${leadNodeLabels || quoteTopicLabel(stage.title) || '关键节点'}，研究开始在这里重新划分证据强弱与节点边界`
        : openQuestion
          ? `主线最初不是先追求完整答案，而是先从${leadNodeLabels || quoteTopicLabel(stage.title) || '一个关键起点'}出发，把第一个必须回答的问题压缩清楚：${stripTopicTrailingPunctuation(openQuestion)}`
          : continuityLead
            ? `主线正是从${leadNodeLabels || quoteTopicLabel(stage.title) || '这里'}起步：${stripTopicTrailingPunctuation(continuityLead)}`
            : `主线先从${leadNodeLabels || quoteTopicLabel(stage.title) || '这里'}起步，把最初的可行性与判断边界压缩成可验证的起点`,
    ) || ensureTopicSentence(stage.editorial.transition),
    180,
  )
  const stageThesis =
    clipText(stripTopicTrailingPunctuation(summary), 110) ||
    clipText(stripTopicTrailingPunctuation(summaryLead), 110) ||
    clipText(stripTopicTrailingPunctuation(stage.editorial.summary), 110)

  return {
    summary,
    transition,
    stageThesis,
  }
}

function buildNodeResearchContent(args: {
  node: TopicNodeCard
  stageIndex: number
  fullContentSummary: ReturnType<typeof readFullContentSummary>
  reader: NodeViewModel | null
  pipeline: TopicPipelineContext
  latestResearchReport: ResearchRunReport | null
  generationContext: TopicGenerationContext
}) {
  const { node, stageIndex, fullContentSummary, reader, pipeline, latestResearchReport, generationContext } = args
  const primaryPaperTitle = reader?.paperRoles[0]?.title || node.primaryPaperTitle || '这篇论文'
  const evidenceCount =
    (reader?.stats.figureCount ?? 0) +
    (reader?.stats.tableCount ?? 0) +
    (reader?.stats.formulaCount ?? 0)
  const reportNodeActions =
    latestResearchReport?.latestNodeActions.filter(
      (action) =>
        action.nodeId === node.nodeId ||
        action.mergeIntoNodeId === node.nodeId ||
        (action.stageIndex === stageIndex && action.title.trim() === node.title.trim()),
    ) ?? []

  const digest = buildTopicMapNodeSummary({
    nodeTitle: node.title,
    primaryPaperTitle,
    paperCount: node.paperCount,
    candidates: [
      reader?.summary,
      fullContentSummary.oneLine,
      fullContentSummary.keyContribution,
      reader?.headline,
      reader?.paperRoles[0]?.contribution,
      reportNodeActions[0]?.title,
      node.summary,
      node.explanation,
    ],
  })

  const explanation = buildTopicMapNodeExplanation({
    nodeTitle: node.title,
    primaryPaperTitle,
    paperCount: node.paperCount,
    summary: digest,
    candidates: [
      reportNodeActions[0]?.rationale,
      reader?.explanation,
      reader?.comparisonBlocks[0]?.summary,
      reader?.paperRoles[0]?.contribution,
      ...summarizeBodyLines(reader?.article.sections?.[0]?.body, 2, 220),
      fullContentSummary.keyContribution,
      ...fullContentSummary.mainResults,
      node.explanation,
      pipeline.currentStage?.stageSummary,
    ],
  })

  const nodeLocalQuestions = [
    rewriteNodeCritiqueQuestion({
      nodeTitle: node.title,
      primaryPaperTitle,
      critique: reader?.critique?.bullets?.[0],
      evidenceCount,
    }),
    rewriteNodeCritiqueQuestion({
      nodeTitle: node.title,
      primaryPaperTitle,
      critique: reader?.critique?.bullets?.[1],
      evidenceCount,
    }),
    rewriteNodeCritiqueQuestion({
      nodeTitle: node.title,
      primaryPaperTitle,
      critique: reader?.critique?.bullets?.[2],
      evidenceCount,
    }),
    reportNodeActions[0]?.rationale
      ? toResearchQuestion(
          clipText(reportNodeActions[0].rationale, 130),
          `围绕「${node.title}」还需要继续确认：`,
        )
      : '',
    reader?.paperRoles.length && reader.paperRoles.length > 1
      ? `还需要继续比较：${reader.paperRoles[0].title} 与 ${reader.paperRoles[1].title} 在「${node.title}」里究竟分别推进了什么？`
      : '',
    buildNodeFallbackQuestion({ node, reader }),
  ]

  const nextQuestion =
    collectReadableTopicStrings(
      [
        ...nodeLocalQuestions,
        ...(pipeline.currentStage?.openQuestions ?? []),
        ...generationContext.openQuestions,
        ...pipeline.globalOpenQuestions,
        ...(latestResearchReport?.openQuestions ?? []),
        node.editorial.nextQuestion,
      ],
      1,
      160,
    )[0] || node.editorial.nextQuestion

  return {
    summary: digest,
    explanation,
    editorial: {
      eyebrow: node.editorial.eyebrow,
      digest: clipText(digest, 160),
      whyNow: clipText(explanation, 200),
      nextQuestion: clipText(nextQuestion, 140),
    } satisfies TopicCardEditorial,
  }
}

function buildTopicNarrativeSegments(args: {
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>
  stages: TopicViewModel['stages']
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  sessionMemory: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>
}) {
  const { topic, stages, latestResearchReport, pipelineOverview, sessionMemory } = args
  return uniqueStrings(
    [
      latestResearchReport?.summary,
      ...(latestResearchReport?.paragraphs ?? []),
      sessionMemory.summary.currentFocus,
      sessionMemory.summary.continuity,
      pipelineOverview.currentStage?.stageSummary,
      ...stages.slice(0, 3).map((stage) => `${stage.title}: ${stage.editorial.summary}`),
      topic.summary,
      topic.description,
    ],
    5,
    280,
  )
}

function buildTopicClosingFallback(args: {
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>
  stages: TopicViewModel['stages']
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  generationContext: TopicGenerationContext
  displayPaperCount: number
}) {
  const { topic, stages, latestResearchReport, pipelineOverview, generationContext, displayPaperCount } = args
  const paragraphs = uniqueStrings(
    [
      sanitizeResearchFacingSummary(
        latestResearchReport?.summary ||
          latestResearchReport?.dek ||
          topic.description ||
          topic.summary,
        '',
      ),
      latestResearchReport?.openQuestions[0]
        ? `现在仍待继续判断的问题是：${latestResearchReport.openQuestions[0]}`
        : '',
      pipelineOverview.globalOpenQuestions[0]
        ? `研究编排层目前仍保留一个关键追问：${pipelineOverview.globalOpenQuestions[0]}`
        : '',
      `从结构上看，这个主题当前形成了 ${stages.length} 个阶段、${topic.nodes.length} 个节点和 ${displayPaperCount} 篇论文组成的主链路，但真正稳固的判断仍然要回到节点内部的证据与跨论文比较。`,
    ],
    3,
    260,
  )

  return {
    title: '这一主题现在走到了哪里',
    paragraphs,
    reviewerNote:
      uniqueStrings(
        [
          generationContext.reviewerWatchpoints[0],
          '如果只看主题级时间线而不进入节点文章，读者仍然可能高估主线清晰度。真正的难点仍在于多篇论文之间的分工、证据强弱和未解决问题。',
        ],
        1,
        190,
      )[0] || '',
  } satisfies TopicClosingEditorial
}

function buildTopicSuggestedQuestions(args: {
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  sessionMemory: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>
}) {
  const { topic, latestResearchReport, pipelineOverview, sessionMemory } = args
  return uniqueStrings(
    [
      ...(latestResearchReport?.openQuestions ?? []).map((item) => `请继续判断：${item}`),
      ...pipelineOverview.globalOpenQuestions.map((item) => `这个问题现在可以怎样判断：${item}`),
      sessionMemory.summary.currentFocus
        ? `请把「${sessionMemory.summary.currentFocus}」展开成当前主题的主线。`
        : '',
      `请按阶段解释 ${topic.nameZh} 的演进路线。`,
      '如果我现在开始读这个主题，应该先看哪个节点？为什么？',
    ],
    4,
    180,
  )
}

async function loadTopicResearchSignals(
  topicId: string,
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>,
  options?: { quick?: boolean; stageWindowMonths?: number },
): Promise<TopicResearchSignals> {
  const quick = options?.quick === true
  const [topicMemory, latestResearchReport, pipelineState, sessionMemory, nodeReaders] = await Promise.all([
    loadTopicGenerationMemory(topicId),
    loadTopicResearchReport(topicId),
    loadResearchPipelineState(topicId),
    collectTopicSessionMemoryContext(topicId, { recentLimit: 6 }),
    quick
      ? Promise.resolve([] as Array<readonly [string, NodeViewModel]>)
      : mapWithConcurrency(topic.nodes, 2, async (node) => {
          try {
            const viewModel = await rebuildNodeViewModel(node.id, {
              stageWindowMonths: options?.stageWindowMonths,
            })
            return [node.id, viewModel] as const
          } catch (error) {
            logger.warn('Failed to rebuild node reader artifact while building topic view model.', {
              topicId,
              nodeId: node.id,
              error,
            })
            return null
          }
        }).then((items) => items.filter((item): item is readonly [string, NodeViewModel] => item !== null)),
  ])

  return {
    generationContext: await collectTopicGenerationContext(topicId, topicMemory, { limit: 12 }),
    latestResearchReport,
    pipelineState,
    pipelineOverview: buildResearchPipelineContext(pipelineState, { historyLimit: 8 }),
    sessionMemory,
    nodeReaderById: new Map(nodeReaders),
  }
}

type TopicDisplayPaperShape = {
  id: string
  title: string
  titleZh: string | null
  titleEn: string | null
  summary: string
  explanation: string | null
  published: Date
  authors: string
  citationCount: number | null
  coverPath: string | null
  figures: Array<{
    id: string
    number: number | string
    imagePath: string
    caption: string
    analysis: string | null
  }>
  tables: Array<{
    id: string
    number: number | string
    caption: string
    rawText: string
  }>
  formulas: Array<{
    id: string
    number: number | string
    latex: string
    rawText: string | null
  }>
  sections: Array<{
    id: string
    editorialTitle: string | null
    sourceSectionTitle: string
    paragraphs: string
  }>
}

type TopicDisplayNodeShape = {
  primaryPaperId: string | null
  papers: Array<{
    paperId: string | null
  }>
}

function selectTopicPapersByNodeOrder<
  TPaper extends { id: string },
  TTopic extends {
    papers: TPaper[]
    nodes: TopicDisplayNodeShape[]
  },
>(topic: TTopic): TPaper[] {
  const paperById = new Map(topic.papers.map((paper) => [paper.id, paper]))
  const orderedPaperIds: string[] = []
  const seenPaperIds = new Set<string>()

  for (const node of topic.nodes) {
    const candidateIds = [node.primaryPaperId, ...node.papers.map((paper) => paper.paperId)].filter(
      (paperId): paperId is string => typeof paperId === 'string' && Boolean(paperId),
    )

    for (const paperId of candidateIds) {
      if (seenPaperIds.has(paperId) || !paperById.has(paperId)) continue
      seenPaperIds.add(paperId)
      orderedPaperIds.push(paperId)
    }
  }

  const selected = orderedPaperIds
    .map((paperId) => paperById.get(paperId) ?? null)
    .filter((paper): paper is TPaper => Boolean(paper))

  if (selected.length === 0) return topic.papers

  const supplemental = topic.papers.filter((paper) => !seenPaperIds.has(paper.id))
  return [...selected, ...supplemental]
}

function selectTopicDisplayPapers<
  TPaper extends TopicDisplayPaperShape,
  TTopic extends {
    papers: TPaper[]
    nodes: TopicDisplayNodeShape[]
  },
>(topic: TTopic): TPaper[] {
  return selectTopicPapersByNodeOrder<TPaper, TTopic>(topic)
}

function countPaperEvidence(papers: Array<Pick<TopicDisplayPaperShape, 'figures' | 'tables' | 'formulas' | 'sections'>>) {
  return papers.reduce(
    (count, paper) =>
      count + paper.figures.length + paper.tables.length + paper.formulas.length + paper.sections.length,
    0,
  )
}

const MAINLINE_BRANCH_ID = 'branch:main'
const MAINLINE_BRANCH_COLOR = '#8f1d3b'
const BRANCH_COLORS = ['#9d174d', '#0f766e', '#2563eb', '#65a30d', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#b45309', '#4f46e5']
const BRANCH_LANES = [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5] as const
const GRAPH_COLUMN_COUNT = BRANCH_LANES.length + 1
const GRAPH_CENTER_COLUMN = Math.floor(GRAPH_COLUMN_COUNT / 2) + 1

function pickBranchColor(index: number) {
  return BRANCH_COLORS[index % BRANCH_COLORS.length]
}

function laneToColumn(laneIndex: number) {
  return GRAPH_CENTER_COLUMN + laneIndex
}

function branchIndexForLane(laneIndex: number) {
  return BRANCH_LANES.findIndex((candidate) => candidate === laneIndex)
}

function laneSortWeight(laneIndex: number) {
  const absolute = Math.abs(laneIndex)
  const sideBias = laneIndex < 0 ? 0 : laneIndex > 0 ? 1 : -1
  return absolute * 10 + sideBias
}

function laneSide(laneIndex: number): 'left' | 'center' | 'right' {
  if (laneIndex === 0) return 'center'
  return laneIndex < 0 ? 'left' : 'right'
}

function splitParagraphs(value: string | null | undefined, maxParts = 3) {
  return (value ?? '')
    .split(/\n+/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxParts)
}

function formatStageDateLabel(value: Date | null | undefined, mode: 'year' | 'month' = 'month') {
  if (!value) return mode === 'year' ? '未知' : '时间待定'
  const year = value.getFullYear()
  if (mode === 'year') return String(year)
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  return `${year}.${month}`
}

function formatMonthDayLabel(value: Date | null | undefined) {
  if (!value) return '待定'
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${month}.${day}`
}

function formatPreciseDateLabel(value: Date | null | undefined) {
  if (!value) return '时间待定'
  return `${value.getFullYear()}.${formatMonthDayLabel(value)}`
}

function buildLaneSummaries(nodes: TopicGraphNode[]): TopicGraphLane[] {
  const laneMap = new Map<number, TopicGraphNode[]>()

  for (const node of nodes) {
    const current = laneMap.get(node.layoutHint.laneIndex) ?? []
    current.push(node)
    laneMap.set(node.layoutHint.laneIndex, current)
  }

  return [...laneMap.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([laneIndex, laneNodes]) => {
      const ordered = [...laneNodes].sort((left, right) => left.stageIndex - right.stageIndex)
      const firstNode = ordered[0]
      const latestNode = ordered[ordered.length - 1]
      const stageCount = new Set(ordered.map((node) => node.stageIndex)).size
      const periodLabel =
        firstNode.timeLabel === latestNode.timeLabel
          ? latestNode.timeLabel
          : `${firstNode.timeLabel}—${latestNode.timeLabel}`

      return {
        id: latestNode.layoutHint.isMainline
          ? 'lane:mainline'
          : `lane:${latestNode.layoutHint.branchIndex ?? laneIndex}`,
        laneIndex,
        branchIndex: latestNode.layoutHint.branchIndex,
        isMainline: latestNode.layoutHint.isMainline,
        side: latestNode.layoutHint.side,
        color: latestNode.layoutHint.isMainline ? MAINLINE_BRANCH_COLOR : latestNode.branchColor,
        roleLabel: latestNode.layoutHint.isMainline
          ? '主线'
          : `分支 ${String((latestNode.layoutHint.branchIndex ?? 0) + 1).padStart(2, '0')}`,
        label: latestNode.title,
        labelEn: latestNode.titleEn,
        description: clipText(
          latestNode.cardEditorial.whyNow || latestNode.cardEditorial.digest || latestNode.summary,
          88,
        ),
        periodLabel,
        nodeCount: ordered.length,
        stageCount,
        latestNodeId: latestNode.nodeId,
        latestAnchorId: latestNode.anchorId,
      } satisfies TopicGraphLane
    })
}

function ensureTopicGraphLanes(viewModel: TopicViewModel): TopicViewModel {
  const needsGraphNodes = !Array.isArray(viewModel.graph.nodes) || viewModel.graph.nodes.length === 0
  const hydratedGraph = needsGraphNodes ? buildGraphLayout(viewModel.stages) : viewModel.graph

  if (hydratedGraph.lanes?.length && !needsGraphNodes) return viewModel

  return {
    ...viewModel,
    graph: hydratedGraph.lanes?.length
      ? hydratedGraph
      : {
          ...hydratedGraph,
          lanes: buildLaneSummaries(hydratedGraph.nodes),
        },
  }
}

function buildGraphLayout(stages: TopicViewModel['stages']) {
  const allNodes: TopicGraphNode[] = []
  let branchSerial = 0

  stages.forEach((stage, stageRowIndex) => {
    const previousStageNodes = allNodes
      .filter((node) => node.stageIndex === stage.stageIndex - 1)
      .sort(
        (left, right) =>
          laneSortWeight(left.layoutHint.laneIndex) - laneSortWeight(right.layoutHint.laneIndex),
      )
    const previousMainline = previousStageNodes.find((node) => node.layoutHint.isMainline) ?? null
    const previousBranches = previousStageNodes.filter((node) => !node.layoutHint.isMainline)
    const reusableBranches = [...previousBranches]
    const occupiedLanes = new Set<number>([0])

    stage.nodes.forEach((node, nodeIndex) => {
      const isMainline = nodeIndex === 0
      let laneIndex = 0
      let branchIndex: number | null = null
      let branchPathId = MAINLINE_BRANCH_ID
      let branchColor = MAINLINE_BRANCH_COLOR
      const parentNodeIds: string[] = []

      if (isMainline) {
        if (previousMainline) parentNodeIds.push(previousMainline.nodeId)
        if (node.isMergeNode) {
          const mergeParent = previousBranches[0]
          if (mergeParent && !parentNodeIds.includes(mergeParent.nodeId)) {
            parentNodeIds.push(mergeParent.nodeId)
          }
        }
      } else {
        const inheritedBranch = reusableBranches.shift() ?? null
        if (inheritedBranch) {
          laneIndex = inheritedBranch.layoutHint.laneIndex
          branchIndex = inheritedBranch.layoutHint.branchIndex ?? branchIndexForLane(laneIndex)
          branchPathId = inheritedBranch.branchPathId
          branchColor = inheritedBranch.branchColor
          parentNodeIds.push(inheritedBranch.nodeId)
        } else {
          const nextLane =
            BRANCH_LANES.find((candidate) => !occupiedLanes.has(candidate)) ??
            BRANCH_LANES[Math.max(0, Math.min(nodeIndex - 1, BRANCH_LANES.length - 1))]
          laneIndex = nextLane
          branchIndex = branchIndexForLane(laneIndex)
          branchPathId = `branch:${stage.stageIndex}:${++branchSerial}`
          branchColor = pickBranchColor(branchIndex >= 0 ? branchIndex : nodeIndex - 1)
          if (previousMainline) {
            parentNodeIds.push(previousMainline.nodeId)
          } else if (previousStageNodes[0]) {
            parentNodeIds.push(previousStageNodes[0].nodeId)
          }
        }

        if (node.isMergeNode) {
          const mergeParent =
            (previousMainline && !parentNodeIds.includes(previousMainline.nodeId) ? previousMainline : null) ??
            previousBranches.find((candidate) => !parentNodeIds.includes(candidate.nodeId)) ??
            null
          if (mergeParent) parentNodeIds.push(mergeParent.nodeId)
        }
      }

      occupiedLanes.add(laneIndex)

      allNodes.push({
        nodeId: node.nodeId,
        anchorId: node.anchorId,
        route: node.route,
        stageIndex: stage.stageIndex,
        title: node.title,
        titleEn: node.titleEn,
        subtitle: node.subtitle,
        summary: node.summary,
        explanation: node.explanation,
        paperCount: node.paperCount,
        paperIds: node.paperIds,
        primaryPaperTitle: node.primaryPaperTitle,
        primaryPaperId: node.primaryPaperId,
        coverImage: node.coverImage,
        isMergeNode: node.isMergeNode,
        provisional: node.provisional,
        updatedAt: node.updatedAt,
        branchLabel: node.branchLabel,
        branchColor,
        branchPathId,
        parentNodeIds: [...new Set(parentNodeIds)],
        timeLabel: formatMonthDayLabel(new Date(node.updatedAt)),
        layoutHint: {
          column: laneToColumn(laneIndex),
          span: 1,
          row: stageRowIndex + 1,
          emphasis: node.isMergeNode ? 'merge' : isMainline ? 'primary' : 'branch',
          laneIndex,
          branchIndex,
          isMainline,
          side: laneSide(laneIndex),
        },
        coverAsset: {
          imagePath: node.coverImage,
          alt: `${node.title} cover`,
          source: node.coverImage ? 'node-cover' : 'generated-brief',
        },
        cardEditorial: node.editorial,
      })
    })
  })

  return {
    columnCount: GRAPH_COLUMN_COUNT,
    lanes: buildLaneSummaries(allNodes),
    nodes: allNodes,
  }
}

function buildTopicSnapshot(topic: Awaited<ReturnType<typeof loadTopicForArtifact>>, stages: TopicViewModel['stages']) {
  const displayPapers = selectTopicDisplayPapers(topic)

  return {
    topicId: topic.id,
    title: topic.nameZh,
    titleEn: topic.nameEn ?? '',
    focusLabel: topic.focusLabel ?? '',
    summary: clipText(topic.summary ?? topic.description ?? '', 320),
    description: clipText(topic.description ?? topic.summary ?? '', 420),
    language: topic.language,
    status: topic.status,
    stageCount: stages.length,
    nodeCount: topic.nodes.length,
    paperCount: displayPapers.length,
    stages: stages.map((stage) => ({
      stageIndex: stage.stageIndex,
      title: stage.title,
      titleEn: stage.titleEn,
      description: clipText(stage.description, 240),
      nodes: stage.nodes.map((node) => ({
        nodeId: node.nodeId,
        title: node.title,
        titleEn: node.titleEn,
        summary: clipText(node.summary, 220),
        explanation: clipText(node.explanation, 220),
        paperCount: node.paperCount,
        primaryPaperTitle: node.primaryPaperTitle,
      })),
    })),
    papers: displayPapers.slice(0, 24).map((paper) => ({
      paperId: paper.id,
      title: paper.titleZh || paper.title,
      titleEn: paper.titleEn ?? paper.title,
      publishedAt: paper.published.toISOString(),
      summary: clipText(paper.summary, 220),
    })),
  }
}

async function generateStageEditorial(
  topicId: string,
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>,
  stage: TopicViewModel['stages'][number],
  previousStage: TopicViewModel['stages'][number] | null,
) {
  const fallback: GeneratedTopicStageEditorial = {
    title: stage.title,
    titleEn: stage.titleEn,
    kicker: stage.editorial.kicker,
    summary: stage.editorial.summary,
    transition: stage.editorial.transition,
    stageThesis: clipText(stage.editorial.summary, 110),
  }

  return runStructuredGenerationPass<GeneratedTopicStageEditorial>({
    topicId,
    subjectType: 'stage',
    subjectId: String(stage.stageIndex),
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_STAGE_TIMELINE,
    input: {
      topic: {
        title: topic.nameZh,
        titleEn: topic.nameEn ?? topic.nameZh,
        focusLabel: topic.focusLabel ?? '',
        summary: topic.summary ?? topic.description ?? '',
      },
      stage: {
        stageIndex: stage.stageIndex,
        currentTitle: stage.title,
        currentTitleEn: stage.titleEn,
        description: stage.description,
        nodeCount: stage.nodes.length,
        nodeTitles: stage.nodes.map((node) => node.title),
        representativePapers: stage.nodes.slice(0, 4).map((node) => node.primaryPaperTitle),
      },
      previousStage: previousStage
        ? {
            stageIndex: previousStage.stageIndex,
            title: previousStage.title,
            summary: previousStage.editorial.summary,
          }
        : null,
    },
    memoryContext: {
      topicSummary: topic.summary ?? topic.description ?? '',
      previousStage: previousStage
        ? {
            title: previousStage.title,
            transition: previousStage.editorial.transition,
          }
        : null,
    },
    fallback,
    outputContract:
      '{"title":"","titleEn":"","kicker":"","summary":"","transition":"","stageThesis":""}',
    summaryHint: fallback.summary,
    maxTokens: 1200,
  })
}

async function generateNodeCardEditorial(
  topicId: string,
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>,
  stage: TopicViewModel['stages'][number],
  node: TopicNodeCard,
) {
  return runStructuredGenerationPass<TopicCardEditorial>({
    topicId,
    subjectType: 'node',
    subjectId: node.nodeId,
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_NODE_CARD,
    input: {
      topic: {
        title: topic.nameZh,
        focusLabel: topic.focusLabel ?? '',
      },
      stage: {
        stageIndex: stage.stageIndex,
        title: stage.title,
      },
      node: {
        title: node.title,
        titleEn: node.titleEn,
        summary: node.summary,
        explanation: node.explanation,
        paperCount: node.paperCount,
        primaryPaperTitle: node.primaryPaperTitle,
        branchLabel: node.branchLabel,
        isMergeNode: node.isMergeNode,
      },
    },
    memoryContext: {
      stageThesis: stage.editorial.summary,
      topicSummary: topic.summary ?? topic.description ?? '',
    },
    fallback: node.editorial,
    outputContract:
      '{"eyebrow":"","digest":"","whyNow":"","nextQuestion":""}',
    summaryHint: node.editorial.digest,
    maxTokens: 900,
  })
}

async function generateTopicHero(
  topicId: string,
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>,
  stages: TopicViewModel['stages'],
  paperCount: number,
) {
  const fallback: GeneratedTopicHero = {
    kicker: '主题编年',
    title: `从问题源头到当前分支：${topic.nameZh}`,
    standfirst: clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的研究脉络正在持续展开。`, 220),
    strapline: topic.focusLabel ?? topic.nameEn ?? '研究焦点',
    thesis: clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的核心判断仍在形成。`, 160),
  }

  return runStructuredGenerationPass<GeneratedTopicHero>({
    topicId,
    subjectType: 'topic',
    subjectId: topic.id,
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_HERO,
    input: {
      topic: {
        title: topic.nameZh,
        titleEn: topic.nameEn ?? topic.nameZh,
        focusLabel: topic.focusLabel ?? '',
        summary: topic.summary ?? '',
        description: topic.description ?? '',
        paperCount,
        nodeCount: topic.nodes.length,
      },
      stages: stages.map((stage) => ({
        stageIndex: stage.stageIndex,
        title: stage.title,
        summary: stage.editorial.summary,
        nodeCount: stage.nodes.length,
      })),
    },
    fallback,
    outputContract:
      '{"kicker":"","title":"","standfirst":"","strapline":"","thesis":""}',
    summaryHint: fallback.standfirst,
    maxTokens: 1400,
  })
}

async function generateTopicClosing(
  topicId: string,
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>,
  stages: TopicViewModel['stages'],
  fallback: TopicClosingEditorial,
  paperCount: number,
) {
  return runStructuredGenerationPass<TopicClosingEditorial>({
    topicId,
    subjectType: 'topic',
    subjectId: `${topic.id}:closing`,
    templateId: PROMPT_TEMPLATE_IDS.TOPIC_CLOSING,
    input: {
      topic: {
        title: topic.nameZh,
        titleEn: topic.nameEn ?? topic.nameZh,
        focusLabel: topic.focusLabel ?? '',
        summary: topic.summary ?? '',
        description: topic.description ?? '',
      },
      stages: stages.map((stage) => ({
        stageIndex: stage.stageIndex,
        title: stage.title,
        stageThesis: stage.editorial.summary,
        nodeCount: stage.nodes.length,
        representativeNodes: stage.nodes.slice(0, 4).map((node) => node.title),
      })),
      totals: {
        stageCount: stages.length,
        nodeCount: topic.nodes.length,
        paperCount,
      },
    },
    fallback,
    outputContract:
      '{"title":"","paragraphs":["",""],"reviewerNote":""}',
    summaryHint: fallback.paragraphs[0] ?? fallback.title,
    maxTokens: 1600,
  })
}

function paperRoute(paperId: string, anchorId?: string, evidenceId?: string) {
  const params = new URLSearchParams()
  if (anchorId) params.set('anchor', anchorId)
  if (evidenceId) params.set('evidence', evidenceId)
  const query = params.toString()
  return query ? `/paper/${paperId}?${query}` : `/paper/${paperId}`
}

function nodeRoute(nodeId: string) {
  return `/node/${nodeId}`
}

function topicEvidenceRoute(topicId: string, anchorId: string) {
  return `/topic/${topicId}?evidence=${encodeURIComponent(anchorId)}`
}

function uniqueByAnchor<T extends { anchorId: string }>(items: T[]) {
  return items.filter(
    (item, index, collection) =>
      collection.findIndex((candidate) => candidate.anchorId === item.anchorId) === index,
  )
}

type TopicChatComposerStyle = 'brief' | 'balanced' | 'deep'

interface ParsedTopicChatRequest {
  rawQuestion: string
  userQuestion: string
  retrievalQuery: string
  contextItems: string[]
  controls: {
    responseStyle: TopicChatComposerStyle
    reasoningEnabled: boolean
    retrievalEnabled: boolean
  }
}

interface TopicGuidanceScopeResolution {
  scopeType: TopicGuidanceScopeType
  scopeId: string | null
  scopeLabel: string
  citations: TopicCitationRef[]
}

interface TopicChatCatalogPaper {
  paperId: string
  anchorId: string
  route: string
  title: string
  titleEn: string
  summary: string
  explanation: string
  aliases: string[]
  stageIndex: number | null
  stageTitle: string
  nodeId: string | null
  nodeTitle: string | null
  nodeSummary: string
}

interface TopicChatCatalog {
  topicId: string
  topicTitle: string
  stageCount: number
  nodeCount: number
  paperCount: number
  papers: TopicChatCatalogPaper[]
}

type TopicChatCatalogSourcePaper = {
  id: string
  title: string
  titleZh: string | null
  titleEn: string | null
  summary: string
  explanation: string | null
}

type TopicChatCatalogSourceNode = TopicDisplayNodeShape & {
  id: string
  stageIndex: number | null
  nodeLabel: string
  nodeSummary: string
  nodeExplanation: string | null
}

type TopicChatCatalogSource = {
  id: string
  nameZh: string
  stages: Array<{
    order: number
    name: string
  }>
  nodes: TopicChatCatalogSourceNode[]
  papers: TopicChatCatalogSourcePaper[]
}

const ASCII_QUESTION_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'answer',
  'article',
  'current',
  'direct',
  'explain',
  'for',
  'how',
  'in',
  'is',
  'it',
  'its',
  'mainline',
  'many',
  'of',
  'paper',
  'papers',
  'please',
  'role',
  'show',
  'tell',
  'that',
  'the',
  'theme',
  'this',
  'topic',
  'what',
  'which',
])

const CJK_QUESTION_STOPWORDS = new Set([
  '主题',
  '当前',
  '主线',
  '展示',
  '多少',
  '几篇',
  '直接',
  '回答',
  '论文',
  '文章',
  '这篇',
  '那个',
  '这个',
  '里面',
  '什么',
  '角色',
  '请直',
  '请问',
  '说明',
  '解释',
  '在哪',
  '属于',
  '扮演',
  '情况',
  '作用',
])

const COUNT_QUERY_HINT =
  /(how many|多少|几篇|几个|何篇|何個|몇\s*편|몇\s*개|몇\s*단계|combien|cu[aá]nt[ao]s?|сколько|wie viele)/iu

const PAPER_QUERY_HINT =
  /(paper|papers|论文|論文|논문|article|articles|papier|papiers|art[íi]culos|стат(?:ья|ей|ьи)|arbeiten?)/iu

const NODE_QUERY_HINT =
  /(node|nodes|节点|節點|노드|n[oœ]uds?|nodos?|узл|knoten)/iu

const STAGE_QUERY_HINT =
  /(stage|stages|阶段|階段|ステージ|단계|étapes|etapas|этап|phasen?)/iu

function normalizeLookupText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[\s"'`“”‘’《》【】\[\]{}()<>:：;；,，.。!?！？/\\|_]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function extractAsciiAliases(value: string | null | undefined) {
  return (value ?? '').match(/[A-Za-z][A-Za-z0-9-]{2,}/gu) ?? []
}

function parseTopicChatRequest(rawQuestion: string): ParsedTopicChatRequest {
  const normalized = rawQuestion.replace(/\r\n/gu, '\n').trim()
  const controlsMatch = normalized.match(/\n{2,}Workbench controls:\n([\s\S]*)$/u)
  const body = controlsMatch ? normalized.slice(0, controlsMatch.index).trim() : normalized
  const controlsBlock = controlsMatch?.[1] ?? ''
  const contextItems: string[] = []
  let userQuestion = body

  if (body.startsWith('Workbench context:\n')) {
    const separator = body.indexOf('\n\n')
    const contextBlock = separator >= 0 ? body.slice(0, separator) : body
    userQuestion = separator >= 0 ? body.slice(separator + 2).trim() : ''
    contextItems.push(
      ...contextBlock
        .split('\n')
        .slice(1)
        .map((line) => line.replace(/^-+\s*/u, '').trim())
        .filter(Boolean),
    )
  }

  const controlMap = new Map<string, string>()
  controlsBlock
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [key, ...rest] = line.split('=')
      if (!key || rest.length === 0) return
      controlMap.set(key.trim(), rest.join('=').trim())
    })

  const responseStyle = controlMap.get('response_style')
  const resolvedStyle: TopicChatComposerStyle =
    responseStyle === 'brief' || responseStyle === 'deep' ? responseStyle : 'balanced'
  const reasoningEnabled = controlMap.get('reasoning') !== 'disabled'
  const retrievalEnabled = controlMap.get('retrieval') !== 'disabled'
  const cleanQuestion = userQuestion.trim() || normalized
  const retrievalQuery = [cleanQuestion, ...contextItems].filter(Boolean).join('\n')

  return {
    rawQuestion: normalized,
    userQuestion: cleanQuestion,
    retrievalQuery,
    contextItems,
    controls: {
      responseStyle: resolvedStyle,
      reasoningEnabled,
      retrievalEnabled,
    },
  }
}

function questionTokens(question: string) {
  const lowered = question.toLowerCase()
  const asciiTokens = (lowered.match(/[a-z0-9-]{2,}/gu) ?? []).filter(
    (token) => !ASCII_QUESTION_STOPWORDS.has(token),
  )
  const cjkSegments = lowered.match(/[\p{Script=Han}]{2,}/gu) ?? []
  const cjkTokens = cjkSegments.flatMap((segment) => {
    const output: string[] = []

    if (segment.length >= 2 && !CJK_QUESTION_STOPWORDS.has(segment)) {
      output.push(segment)
    }

    for (let index = 0; index < segment.length - 1; index += 1) {
      const bigram = segment.slice(index, index + 2)
      if (!CJK_QUESTION_STOPWORDS.has(bigram)) {
        output.push(bigram)
      }

      if (segment.length - index >= 3) {
        const trigram = segment.slice(index, index + 3)
        if (!CJK_QUESTION_STOPWORDS.has(trigram)) {
          output.push(trigram)
        }
      }
    }

    return output
  })

  return Array.from(new Set([...asciiTokens, ...cjkTokens].filter(Boolean)))
}

function scoreChunk(question: string, chunk: TopicCorpusChunk) {
  const normalizedLabel = normalizeLookupText(chunk.label)
  const normalizedQuote = normalizeLookupText(chunk.quote)
  const normalizedContent = normalizeLookupText(`${chunk.label} ${chunk.quote} ${chunk.content}`)
  const tokens = questionTokens(question)
  if (tokens.length === 0) return 0

  return tokens.reduce((score, token) => {
    const normalizedToken = normalizeLookupText(token)
    if (!normalizedToken) return score
    if (normalizedLabel.includes(normalizedToken)) {
      return score + Math.max(4, normalizedToken.length + 2)
    }
    if (normalizedQuote.includes(normalizedToken)) {
      return score + Math.max(3, normalizedToken.length + 1)
    }
    if (!normalizedContent.includes(normalizedToken)) return score
    return score + (normalizedToken.length > 3 ? 3 : 1)
  }, 0)
}

function selectTopicChatChunks(question: string, corpus: TopicCorpusChunk[]) {
  const scored = corpus
    .map((chunk) => ({ chunk, score: scoreChunk(question, chunk) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (scored.length === 0) return []

  const topScore = scored[0]?.score ?? 0
  const threshold = Math.max(3, Math.ceil(topScore * 0.45))

  return scored
    .filter((entry, index) => index < 3 && entry.score >= threshold)
    .map((entry) => entry.chunk)
}

async function loadTopicForArtifact(topicId: string) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
      },
      papers: {
        include: {
          figures: true,
          tables: true,
          formulas: true,
          sections: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { published: 'desc' },
      },
      nodes: {
        include: {
          primaryPaper: true,
          papers: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: [{ stageIndex: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!topic) {
    throw new AppError(404, 'Topic not found.')
  }

  return topic
}

type ArtifactTopicRecord = Awaited<ReturnType<typeof loadTopicForArtifact>>
type ArtifactTopicPaper = ArtifactTopicRecord['papers'][number]

const FALLBACK_NODE_TOPIC_KEYWORDS = new Set([
  'autonomous driving',
  'self driving',
  'self-driving',
  'world model',
  'world models',
  'vision language action',
  'vla',
])

type FallbackNodeTheme = {
  id:
    | 'survey-agenda'
    | 'simulation-prediction'
    | 'pretraining-general'
    | 'scene-understanding'
    | 'generative-realworld'
    | 'diffusion-generation'
    | 'planning-forecasting'
    | 'planning-latent'
    | 'occupancy-vla'
    | 'occupancy-world'
    | 'unified-vla'
    | 'planning-vla'
    | 'generic-world-model'
  label: string
  subtitle: string
  summaryLead: string
  priority: number
  titlePatterns: RegExp[]
  bodyPatterns?: RegExp[]
}

const FALLBACK_NODE_THEME_CATALOG: FallbackNodeTheme[] = [
  {
    id: 'survey-agenda',
    label: '综述与研究议程',
    subtitle: '先收拢赛道边界、方法谱系与未解问题',
    summaryLead: '用综述或立场论文重新标定驾驶世界模型赛道',
    priority: 16,
    titlePatterns: [/\bsurvey\b/iu, /\bposition\b/iu, /\bperspective\b/iu, /\bprospective\b/iu, /\breview\b/iu],
  },
  {
    id: 'occupancy-vla',
    label: '占用式 VLA 世界模型',
    subtitle: '把占用表示、语言接口和动作生成接到同一条链上',
    summaryLead: '让占用建模进入语言-动作闭环',
    priority: 15,
    titlePatterns: [/\boccllama\b/iu, /\boccupancy\b/iu, /\blanguage[- ]action\b/iu, /\bvla\b/iu],
    bodyPatterns: [/\boccupancy\b/iu, /\blanguage\b/iu, /\baction\b/iu, /\bvla\b/iu],
  },
  {
    id: 'planning-vla',
    label: '世界模型与规划交错耦合',
    subtitle: '让世界建模与规划步骤在同一体系里轮转',
    summaryLead: '把世界建模和规划耦合成可迭代闭环',
    priority: 14,
    titlePatterns: [/\binterleaved\b/iu, /\bplanning\b/iu, /\bvla\b/iu],
    bodyPatterns: [/\binterleaved\b/iu, /\bplanning\b/iu, /\blanguage\b/iu, /\baction\b/iu],
  },
  {
    id: 'unified-vla',
    label: 'VLA 世界模型的隐空间统一',
    subtitle: '把视觉、语言、动作压进统一潜空间',
    summaryLead: '尝试把 VLA 世界模型统一到共享潜空间里',
    priority: 13,
    titlePatterns: [/\bdriveworld-vla\b/iu, /\bunified\b/iu, /\blatent[- ]space\b/iu, /\bvla\b/iu],
    bodyPatterns: [/\bunified\b/iu, /\blatent\b/iu, /\blanguage\b/iu, /\baction\b/iu],
  },
  {
    id: 'planning-latent',
    label: '潜空间规划与强化学习',
    subtitle: '让潜空间思考直接服务控制与闭环决策',
    summaryLead: '把潜空间世界模型接到规划与强化学习控制上',
    priority: 12,
    titlePatterns: [/\bthink2drive\b/iu, /\blatent\b/iu, /\breinforcement learning\b/iu, /\bthinking\b/iu],
    bodyPatterns: [/\blatent\b/iu, /\breinforcement\b/iu, /\bcontrol\b/iu, /\bplanning\b/iu],
  },
  {
    id: 'planning-forecasting',
    label: '多视角预测与规划',
    subtitle: '让世界模型直接承担未来预测与轨迹规划',
    summaryLead: '把未来预测和规划能力压到世界模型里',
    priority: 11,
    titlePatterns: [/\bforecasting\b/iu, /\bfuture\b/iu, /\bplanning\b/iu, /\bmultiview\b/iu],
    bodyPatterns: [/\bforecasting\b/iu, /\bplanning\b/iu, /\bfuture\b/iu, /\btrajectory\b/iu],
  },
  {
    id: 'scene-understanding',
    label: '4D 场景理解世界模型',
    subtitle: '把时空场景表示预训练成可复用认知底座',
    summaryLead: '先把动态场景理解能力练成世界模型底座',
    priority: 10,
    titlePatterns: [/\bscene understanding\b/iu, /\b4d\b/iu, /\bdriveworld\b/iu],
    bodyPatterns: [/\bscene understanding\b/iu, /\b4d\b/iu, /\bspatiotemporal\b/iu],
  },
  {
    id: 'pretraining-general',
    label: '通用预训练世界模型',
    subtitle: '把驾驶场景压缩成统一、可迁移的基础表示',
    summaryLead: '把世界模型当成自动驾驶的通用预训练底座',
    priority: 9,
    titlePatterns: [/\buniworld\b/iu, /\bpre[- ]training\b/iu, /\bpretraining\b/iu, /\bfoundation\b/iu, /\bgeneral world model\b/iu, /\badriver\b/iu],
    bodyPatterns: [/\bpre[- ]train/iu, /\bfoundation\b/iu, /\bgeneral world model\b/iu],
  },
  {
    id: 'generative-realworld',
    label: '真实数据驱动的生成式世界模型',
    subtitle: '让真实驾驶数据直接驱动场景演化生成',
    summaryLead: '把真实驾驶数据接入生成式世界模型',
    priority: 8,
    titlePatterns: [/\bdrivedreamer\b/iu, /\breal[- ]world[- ]driven\b/iu, /\breal[- ]world[- ]drive\b/iu],
    bodyPatterns: [/\breal[- ]world\b/iu, /\bgenerative\b/iu, /\bdreamer\b/iu],
  },
  {
    id: 'diffusion-generation',
    label: '扩散式驾驶世界模型',
    subtitle: '用扩散生成去学习场景演化与行为先验',
    summaryLead: '把扩散生成能力引入驾驶世界建模',
    priority: 7,
    titlePatterns: [/\bdiffusion\b/iu, /\bgenerative\b/iu, /\bcopilot4d\b/iu],
    bodyPatterns: [/\bdiffusion\b/iu, /\bgenerative\b/iu],
  },
  {
    id: 'simulation-prediction',
    label: '仿真与运动预测世界模型',
    subtitle: '先从数据驱动仿真和行为预测切入世界建模',
    summaryLead: '从仿真和运动预测起步搭建世界模型',
    priority: 6,
    titlePatterns: [/\btrafficbots\b/iu, /\bsimulation\b/iu, /\bmotion prediction\b/iu],
    bodyPatterns: [/\bsimulation\b/iu, /\bmotion prediction\b/iu, /\bbehavior\b/iu],
  },
  {
    id: 'occupancy-world',
    label: '3D 占用世界模型',
    subtitle: '用占用表示追踪场景结构与未来演化',
    summaryLead: '以 3D 占用表示构建场景世界模型',
    priority: 5,
    titlePatterns: [/\boccworld\b/iu, /\boccupancy\b/iu],
    bodyPatterns: [/\boccupancy\b/iu, /\b3d\b/iu],
  },
  {
    id: 'generic-world-model',
    label: '驾驶世界模型主线',
    subtitle: '回到同月核心论文，梳理问题、方法与证据边界',
    summaryLead: '沿着同月核心论文整理驾驶世界模型主线',
    priority: 1,
    titlePatterns: [],
    bodyPatterns: [],
  },
]

function buildFallbackNodeReferenceValues(papers: ArtifactTopicPaper[]) {
  return papers.flatMap((paper) => [
    paper.titleZh,
    paper.titleEn,
    paper.title,
    paper.explanation,
    paper.summary,
  ])
}

function buildFallbackNodeHaystack(papers: ArtifactTopicPaper[]) {
  return normalizeTopicSentence(buildFallbackNodeReferenceValues(papers).join(' '))
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function scoreFallbackNodeTheme(theme: FallbackNodeTheme, papers: ArtifactTopicPaper[]) {
  const titleHaystack = normalizeTopicSentence(
    papers.map((paper) => [paper.titleZh, paper.titleEn, paper.title].filter(Boolean).join(' ')).join(' '),
  )
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  const fullHaystack = buildFallbackNodeHaystack(papers)
  const titlePatterns = theme.titlePatterns ?? []
  const bodyPatterns = theme.bodyPatterns ?? titlePatterns
  let score = 0

  for (const pattern of titlePatterns) {
    if (pattern.test(titleHaystack)) score += 4
  }

  for (const pattern of bodyPatterns) {
    if (pattern.test(fullHaystack)) score += 2
  }

  return score
}

function detectFallbackNodeTheme(papers: ArtifactTopicPaper[]) {
  const scored = FALLBACK_NODE_THEME_CATALOG.map((theme) => ({
    theme,
    score: scoreFallbackNodeTheme(theme, papers),
  }))
    .sort((left, right) => right.score - left.score || right.theme.priority - left.theme.priority)

  return scored[0]?.score > 0
    ? scored[0].theme
    : FALLBACK_NODE_THEME_CATALOG.find((theme) => theme.id === 'generic-world-model')!
}

function detectFallbackNodeThemeId(paper: ArtifactTopicPaper) {
  return detectFallbackNodeTheme([paper]).id
}

function stripFallbackPaperPrefix(title: string) {
  const normalized = title.replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  const segments = normalized.split(':')
  if (segments.length < 2) return normalized
  const lead = segments[0]?.trim() ?? ''
  const remainder = segments.slice(1).join(':').trim()
  if (!remainder || lead.length > 28) return normalized
  return remainder
}

function buildFallbackPaperLeadTitle(paper: ArtifactTopicPaper) {
  const title = paper.titleZh || paper.titleEn || paper.title
  return clipText(stripFallbackPaperPrefix(title), 54)
}

function joinFallbackPaperTitles(papers: ArtifactTopicPaper[], limit = 2) {
  return papers
    .slice(0, limit)
    .map((paper) => `《${buildFallbackPaperLeadTitle(paper)}》`)
    .join('、')
}

function formatFallbackNodeKeyword(keyword: string) {
  const normalized = keyword.trim()
  if (!normalized) return ''
  if (/^vision language action$/iu.test(normalized)) return 'VLA'
  if (/^world models?$/iu.test(normalized)) return '世界模型'
  if (/^closed loop$/iu.test(normalized)) return '闭环'
  if (/^end to end$/iu.test(normalized) || /^end-to-end$/iu.test(normalized)) return '端到端'
  if (/^occupancy$/iu.test(normalized)) return '占用建模'
  if (/^diffusion$/iu.test(normalized)) return '扩散生成'
  return normalized
    .replace(/\bworld models?\b/giu, '世界模型')
    .replace(/\bautonomous driving\b/giu, '自动驾驶')
    .replace(/\bself[- ]driving\b/giu, '自动驾驶')
    .replace(/\bvision language action\b/giu, 'VLA')
    .replace(/\bclosed[- ]loop\b/giu, '闭环')
    .replace(/\bend[- ]to[- ]end\b/giu, '端到端')
    .replace(/\blatent\b/giu, '隐空间')
    .replace(/\boccupancy\b/giu, '占用')
    .replace(/\bdiffusion\b/giu, '扩散')
}

function chooseFallbackPrimaryPaper(papers: ArtifactTopicPaper[]) {
  return [...papers].sort((left, right) => {
    const leftKeywords = collectTopicRelationKeywords(buildFallbackNodeReferenceValues([left]), 12)
    const rightKeywords = collectTopicRelationKeywords(buildFallbackNodeReferenceValues([right]), 12)
    return (
      rightKeywords.length - leftKeywords.length ||
      new Date(left.published).getTime() - new Date(right.published).getTime() ||
      right.title.length - left.title.length
    )
  })[0]
}

function buildFallbackNodeLabel(papers: ArtifactTopicPaper[]) {
  const theme = detectFallbackNodeTheme(papers)
  if (theme.id !== 'generic-world-model') {
    return clipText(theme.label, 42)
  }

  const primaryPaper = chooseFallbackPrimaryPaper(papers)
  const keywords = collectTopicRelationKeywords(buildFallbackNodeReferenceValues(papers), 24).filter(
    (keyword) => !FALLBACK_NODE_TOPIC_KEYWORDS.has(keyword.toLowerCase()),
  )
  const leadKeyword = formatFallbackNodeKeyword(keywords[0] ?? '')
  const secondaryKeyword = formatFallbackNodeKeyword(
    keywords.find((keyword) => keyword.toLowerCase() !== (keywords[0] ?? '').toLowerCase()) ?? '',
  )

  if (leadKeyword && secondaryKeyword) {
    return clipText(`${leadKeyword} · ${secondaryKeyword}`, 42)
  }
  if (leadKeyword) {
    return clipText(leadKeyword, 42)
  }
  return clipText(buildFallbackPaperLeadTitle(primaryPaper), 42)
}

function buildFallbackNodeSubtitle(papers: ArtifactTopicPaper[]) {
  const theme = detectFallbackNodeTheme(papers)
  if (theme.id !== 'generic-world-model') {
    return clipText(theme.subtitle, 72)
  }

  const keywords = collectTopicRelationKeywords(buildFallbackNodeReferenceValues(papers), 18).filter(
    (keyword) => !FALLBACK_NODE_TOPIC_KEYWORDS.has(keyword.toLowerCase()),
  )
  const subtitle = keywords.slice(0, 3).map((keyword) => formatFallbackNodeKeyword(keyword)).filter(Boolean)
  return clipText(subtitle.join(' / '), 72)
}

function buildFallbackNodeSummary(args: {
  label: string
  papers: ArtifactTopicPaper[]
}) {
  const fallbackPrimaryPaper = chooseFallbackPrimaryPaper(args.papers)
  const label = stripTopicTrailingPunctuation(args.label) || '当前节点'
  const primaryPaperTitle =
    stripTopicTrailingPunctuation(fallbackPrimaryPaper.titleZh || fallbackPrimaryPaper.title) || label

  if (args.papers.length <= 1) {
    return clipText(`该节点当前仅纳入 1 篇论文，以《${primaryPaperTitle}》为入口，先说明「${label}」这条问题线。`, 200)
  }

  return clipText(`该节点当前纳入 ${args.papers.length} 篇同阶段论文，围绕「${label}」比较它们的对象、方法与证据。`, 200)

  const primaryPaper = chooseFallbackPrimaryPaper(args.papers)
  const theme = detectFallbackNodeTheme(args.papers)
  if (args.papers.length <= 1) {
    return clipText(
      `${theme.summaryLead}。当前这一节点先以《${buildFallbackPaperLeadTitle(primaryPaper)}》为入口，读它如何定义问题、构造世界表示，并把证据边界停在哪一层。`,
      200,
    )
  }

  return clipText(
    `这一节点把同期 ${args.papers.length} 篇论文收拢到「${args.label}」之下，先用 ${joinFallbackPaperTitles(args.papers)} 建立主线，再比较它们在建模对象、控制闭环或语言接口上的关键分歧。`,
    200,
  )
}

function buildFallbackNodeExplanation(args: {
  label: string
  papers: ArtifactTopicPaper[]
}) {
  const fallbackPrimaryPaper = chooseFallbackPrimaryPaper(args.papers)
  const label = stripTopicTrailingPunctuation(args.label) || '当前节点'
  const primaryPaperTitle =
    stripTopicTrailingPunctuation(fallbackPrimaryPaper.titleZh || fallbackPrimaryPaper.title) || label

  if (args.papers.length <= 1) {
    return clipText(`这一节点目前只有 1 篇论文，阅读重点是看《${primaryPaperTitle}》如何界定「${label}」、给出什么证据，以及还有哪些地方没有闭合。`, 220)
  }

  return clipText(`这一节点把同一阶段内与「${label}」直接相关的 ${args.papers.length} 篇论文放在一起，帮助读者在不跳出阶段边界的前提下看清共同问题与主要分歧。`, 220)

  const primaryPaper = chooseFallbackPrimaryPaper(args.papers)
  const theme = detectFallbackNodeTheme(args.papers)
  const firstPaperTitle = primaryPaper.titleZh || primaryPaper.title
  if (args.papers.length <= 1) {
    return clipText(
      primaryPaper.explanation ||
        `先从「${firstPaperTitle}」读起，用它建立「${args.label}」的起点判断，再沿着论文里的方法设计、实验对象和失败边界去核对这条主线是否站得住。`,
      220,
    )
  }

  return clipText(
    `当前先用「${firstPaperTitle}」做入口，再把同月问题相近的论文并入这个节点，帮助读者在不跳出阶段边界的前提下，看清「${args.label}」怎样从 ${theme.subtitle.replace(/。$/u, '')}，以及还有哪些证据没有闭合。`,
    220,
  )
}

function refineFallbackNodeThemeCluster(papers: ArtifactTopicPaper[]) {
  const themeId = detectFallbackNodeThemeId(papers[0]!)
  const remaining = [...papers].sort(
    (left, right) =>
      new Date(left.published).getTime() - new Date(right.published).getTime() ||
      right.title.length - left.title.length,
  )
  const clusters: ArtifactTopicPaper[][] = []

  while (remaining.length > 0) {
    const anchor = remaining.shift()
    if (!anchor) break

    const anchorReferenceValues = buildFallbackNodeReferenceValues([anchor])
    const anchorKeywords = collectTopicRelationKeywords(anchorReferenceValues, 18)
    const cluster = [anchor]
    const deferred: ArtifactTopicPaper[] = []

    for (const candidate of remaining) {
      const relation = scoreRelatedPaperAgainstNode({
        paper: candidate,
        keywords: anchorKeywords,
        referenceValues: anchorReferenceValues,
      })
      const sameTheme = detectFallbackNodeThemeId(candidate) === themeId
      const stronglyRelated =
        sameTheme &&
        (relation.score >= 8 ||
          relation.strongMatchCount >= 2 ||
          relation.conceptScore >= 4 ||
          relation.titleMatchCount >= 1 ||
          relation.matchCount >= 2) ||
        (relation.conceptMatches.includes('world-model') &&
          relation.conceptMatches.some((concept) =>
            ['dynamics', 'generative', 'multimodal', 'language', 'unified'].includes(concept),
          ))

      if (stronglyRelated) {
        cluster.push(candidate)
      } else {
        deferred.push(candidate)
      }
    }

    clusters.push(cluster)
    remaining.splice(0, remaining.length, ...deferred)
  }

  return clusters
}

function synthesizeFallbackNodeClusters(papers: ArtifactTopicPaper[]) {
  const orderedPapers = [...papers].sort(
    (left, right) =>
      new Date(left.published).getTime() - new Date(right.published).getTime() ||
      right.title.length - left.title.length,
  )
  const groups = new Map<string, ArtifactTopicPaper[]>()

  for (const paper of orderedPapers) {
    const themeId = detectFallbackNodeThemeId(paper)
    const current = groups.get(themeId) ?? []
    current.push(paper)
    groups.set(themeId, current)
  }

  return Array.from(groups.values()).flatMap((group) => refineFallbackNodeThemeCluster(group))
}

function isLegacyFallbackNodeLabel(label: string | null | undefined) {
  const normalized = label?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!normalized) return false
  if (!normalized.includes('·')) return false

  const [left, right] = normalized.split('·').map((segment) => segment.trim())
  if (!left || !right) return false

  const looksLegacySegment = (segment: string) =>
    /^[a-z0-9-]+(?:\s+[a-z0-9-]+){0,3}$/iu.test(segment) ||
    /^[a-z0-9-]+(?:\s+[a-z0-9-]+){0,2}\s+[\u4e00-\u9fff]{1,6}$/u.test(segment)

  return looksLegacySegment(left) && looksLegacySegment(right)
}

function shouldResynthesizeFallbackNodes(
  topic: ArtifactTopicRecord,
  stageWindowMonths: number,
) {
  if (topic.papers.length === 0) return false
  if (topic.nodes.length === 0) return true

  const allFallbackNodes = topic.nodes.every((node) => node.status === 'fallback')
  if (allFallbackNodes) {
    const temporalBuckets = deriveTemporalStageBuckets({
      papers: topic.papers.map((paper) => ({
        id: paper.id,
        published: paper.published,
      })),
      windowMonths: stageWindowMonths,
      fallbackDate: topic.createdAt,
    })
    const assignedStageIndexes = new Set(
      Array.from(temporalBuckets.paperAssignments.values()).map((assignment) => assignment.stageIndex),
    )
    const nodeStageIndexes = new Set(topic.nodes.map((node) => node.stageIndex))
    const coveredPaperIds = new Set(
      topic.nodes.flatMap((node) => node.papers.map((paper) => paper.paperId)),
    )

    if (topic.papers.some((paper) => !coveredPaperIds.has(paper.id))) {
      return true
    }

    if (Array.from(assignedStageIndexes).some((stageIndex) => !nodeStageIndexes.has(stageIndex))) {
      return true
    }
  }

  const legacyNodeCount = topic.nodes.filter((node) => isLegacyFallbackNodeLabel(node.nodeLabel)).length
  if (legacyNodeCount === topic.nodes.length) {
    return true
  }

  return (
    legacyNodeCount >= Math.max(3, Math.ceil(topic.nodes.length * 0.8)) &&
    topic.nodes.every((node) => node.status === 'active')
  )
}

async function syncTopicTemporalStructure(topicId: string, stageWindowMonths: number) {
  const topic = await loadTopicForArtifact(topicId)
  const temporalBuckets = deriveTemporalStageBuckets({
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: topic.nodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.papers.map((item) => ({ paperId: item.paperId })),
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
    })),
    windowMonths: stageWindowMonths,
    fallbackDate: topic.createdAt,
  })

  await prisma.$transaction(async (tx) => {
    await tx.topicStage.deleteMany({ where: { topicId } })

    if (temporalBuckets.buckets.length > 0) {
      await tx.topicStage.createMany({
        data: temporalBuckets.buckets.map((bucket) => ({
          topicId,
          order: bucket.stageIndex,
          name: bucket.label,
          nameEn: bucket.labelEn,
          description: bucket.description,
          descriptionEn: bucket.descriptionEn,
        })),
      })
    }

    for (const node of topic.nodes) {
      const nextStageIndex =
        temporalBuckets.nodeAssignments.get(node.id)?.stageIndex ??
        temporalBuckets.fallbackAssignment?.stageIndex ??
        node.stageIndex

      if (nextStageIndex !== node.stageIndex) {
        await tx.researchNode.update({
          where: { id: node.id },
          data: { stageIndex: nextStageIndex },
        })
      }
    }
  })

  return temporalBuckets
}

async function ensureFallbackResearchNodesFromPapers(topicId: string, stageWindowMonths: number) {
  const topic = await loadTopicForArtifact(topicId)
  if (!shouldResynthesizeFallbackNodes(topic, stageWindowMonths)) {
    return false
  }

  const temporalBuckets = deriveTemporalStageBuckets({
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    windowMonths: stageWindowMonths,
    fallbackDate: topic.createdAt,
  })
  const papersByStage = new Map<number, ArtifactTopicPaper[]>()

  for (const paper of [...topic.papers].sort((left, right) => +left.published - +right.published)) {
    const assignment = temporalBuckets.paperAssignments.get(paper.id) ?? temporalBuckets.fallbackAssignment
    const stageIndex = assignment?.stageIndex ?? 1
    const current = papersByStage.get(stageIndex) ?? []
    current.push(paper)
    papersByStage.set(stageIndex, current)
  }

  await prisma.$transaction(async (tx) => {
    if (topic.nodes.length > 0) {
      await tx.researchNode.deleteMany({ where: { topicId } })
    }

    for (const [stageIndex, stagePapers] of papersByStage.entries()) {
      const clusters = synthesizeFallbackNodeClusters(stagePapers)
      for (const cluster of clusters) {
        const primaryPaper = chooseFallbackPrimaryPaper(cluster)
        const label = buildFallbackNodeLabel(cluster)
        const subtitle = buildFallbackNodeSubtitle(cluster)
        const summary = buildFallbackNodeSummary({ label, papers: cluster })
        const explanation = buildFallbackNodeExplanation({ label, papers: cluster })
        const node = await tx.researchNode.create({
          data: {
            topicId,
            stageIndex,
            nodeLabel: label,
            nodeSubtitle: subtitle || null,
            nodeSummary: summary,
            nodeExplanation: explanation,
            nodeCoverImage: primaryPaper.coverPath ?? null,
            status: 'fallback',
            isMergeNode: false,
            provisional: false,
            primaryPaperId: primaryPaper.id,
          },
        })

        await tx.nodePaper.createMany({
          data: cluster.map((paper, order) => ({
            nodeId: node.id,
            paperId: paper.id,
            order,
          })),
        })
      }
    }
  })

  logger.info('Synthesized fallback research nodes from paper clusters.', {
    topicId,
    stageWindowMonths,
    paperCount: topic.papers.length,
    stageCount: papersByStage.size,
    regeneratedExistingNodes: topic.nodes.length > 0,
  })

  return true
}

async function loadTopicChatCatalogSource(topicId: string): Promise<TopicChatCatalogSource> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      nameZh: true,
      stages: {
        select: {
          order: true,
          name: true,
        },
        orderBy: { order: 'asc' },
      },
      papers: {
        select: {
          id: true,
          title: true,
          titleZh: true,
          titleEn: true,
          summary: true,
          explanation: true,
        },
        orderBy: { published: 'desc' },
      },
      nodes: {
        select: {
          id: true,
          stageIndex: true,
          nodeLabel: true,
          nodeSummary: true,
          nodeExplanation: true,
          primaryPaperId: true,
          papers: {
            select: {
              paperId: true,
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: [{ stageIndex: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!topic) {
    throw new AppError(404, 'Topic not found.')
  }

  return topic
}

async function buildTopicArtifactFingerprint(
  topicId: string,
  options?: TopicViewModelBuildOptions,
) {
  return buildTopicArtifactFingerprintV2(topicId, options)

  const [topic, localization, runtime, topicMemory, sessionMemory, latestResearchReport, modelConfigFingerprint, stageTemplate, nodeCardTemplate, heroTemplate, closingTemplate] =
    await Promise.all([
      loadTopicForArtifact(topicId),
      getTopicLocalization(topicId),
      getGenerationRuntimeConfig(),
      loadTopicGenerationMemory(topicId),
      loadTopicSessionMemory(topicId),
      loadTopicResearchReport(topicId),
      getModelConfigFingerprint(),
      getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_STAGE_TIMELINE),
      getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_NODE_CARD),
      getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_HERO),
      getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_CLOSING),
    ])

  return buildGenerationFingerprint({
    kind: 'topic',
    topicId,
    topic: {
      id: topic.id,
      updatedAt: topic.updatedAt.toISOString(),
      nameZh: topic.nameZh,
      nameEn: topic.nameEn,
      focusLabel: topic.focusLabel,
      summary: topic.summary,
      description: topic.description,
      language: topic.language,
      status: topic.status,
      stages: topic.stages.map((stage) => ({
        id: stage.id,
        order: stage.order,
        name: stage.name,
        nameEn: stage.nameEn,
        description: stage.description,
        descriptionEn: stage.descriptionEn,
      })),
      nodes: topic.nodes.map((node) => ({
        id: node.id,
        stageIndex: node.stageIndex,
        updatedAt: node.updatedAt.toISOString(),
        nodeLabel: node.nodeLabel,
        nodeSubtitle: node.nodeSubtitle,
        nodeSummary: node.nodeSummary,
        nodeExplanation: node.nodeExplanation,
        nodeCoverImage: node.nodeCoverImage,
        status: node.status,
        isMergeNode: node.isMergeNode,
        provisional: node.provisional,
        primaryPaperId: node.primaryPaperId,
        primaryPaper: {
          id: node.primaryPaper.id,
          title: node.primaryPaper.title,
          titleZh: node.primaryPaper.titleZh,
          titleEn: node.primaryPaper.titleEn,
          coverPath: node.primaryPaper.coverPath,
          published: node.primaryPaper.published.toISOString(),
        },
        paperIds: node.papers.map((item) => item.paperId),
      })),
      papers: topic.papers.map((paper) => ({
        id: paper.id,
        updatedAt: paper.updatedAt.toISOString(),
        title: paper.title,
        titleZh: paper.titleZh,
        titleEn: paper.titleEn,
        summary: paper.summary,
        explanation: paper.explanation,
        published: paper.published.toISOString(),
        citationCount: paper.citationCount,
        coverPath: paper.coverPath,
        authors: paper.authors,
        figureCount: paper.figures.length,
        tableCount: paper.tables.length,
        formulaCount: paper.formulas.length,
        sectionCount: paper.sections.length,
      })),
    },
    localization,
    runtime,
    latestResearchReport,
    modelConfigFingerprint,
    promptTemplates: [stageTemplate, nodeCardTemplate, heroTemplate, closingTemplate],
    topicMemoryUpdatedAt: topicMemory.updatedAt,
    sessionMemoryUpdatedAt: sessionMemory.updatedAt,
  })
}

export async function buildTopicViewModel(
  topicId: string,
  options?: TopicViewModelBuildOptions,
): Promise<TopicViewModel> {
  const resolvedStageWindowMonths = resolveStageWindowMonths(options?.stageWindowMonths)
  await syncTopicTemporalStructure(topicId, resolvedStageWindowMonths)
  await ensureFallbackResearchNodesFromPapers(topicId, resolvedStageWindowMonths)
  await syncTopicTemporalStructure(topicId, resolvedStageWindowMonths)
  return buildTopicViewModelResearchAware(topicId, {
    ...options,
    stageWindowMonths: resolvedStageWindowMonths,
  })

  const quick = options?.quick === true
  const stageWindowMonths = resolveStageWindowMonths(options?.stageWindowMonths)
  const [topic, localization] = await Promise.all([
    loadTopicForArtifact(topicId),
    getTopicLocalization(topicId),
  ])
  const temporalBuckets = deriveTemporalStageBuckets({
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: topic.nodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.papers.map((item) => ({ paperId: item.paperId })),
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
    })),
    windowMonths: stageWindowMonths,
    fallbackDate: topic.createdAt,
  })
  const stageBucketByIndex = new Map(
    temporalBuckets.buckets.map((bucket) => [bucket.stageIndex, bucket] as const),
  )
  const stageMap = new Map(
    temporalBuckets.buckets.map((bucket) => [
      bucket.stageIndex,
      {
        name: bucket.label,
        nameEn: bucket.labelEn,
        description: bucket.description,
      },
    ] as const),
  )
  const nodesByStage = new Map<number, typeof topic.nodes>()

  for (const node of topic.nodes) {
    const current = nodesByStage.get(node.stageIndex) ?? []
    current.push(node)
    nodesByStage.set(node.stageIndex, current)
  }

  const stageKeys = [...new Set([...nodesByStage.keys(), ...topic.stages.map((stage) => stage.order)])].sort((left, right) => left - right)

  const baseStages: TopicViewModel['stages'] = stageKeys.map((stageIndex, stageListIndex) => {
      const stage = stageMap.get(stageIndex)
    const stageLocalization = null as { locales: StageLocaleMap } | null
      const stageNodes = nodesByStage.get(stageIndex) ?? []
      const branchColor = pickBranchColor(stageListIndex)
      const stageTitle =
        stageLocalization?.locales.zh.name ?? stage?.name ?? `闃舵 ${stageIndex}`
      const stageTitleEn =
        stageLocalization?.locales.en.name ?? stage?.nameEn ?? `Stage ${stageIndex}`
      const stageDescription =
        stageLocalization?.locales.zh.description ??
        stage?.description ??
        `${topic.nameZh} 在这一阶段开始形成更明确的研究分支与代表节点。`

      return {
        stageIndex,
        title: stage?.name ?? `阶段 ${stageIndex}`,
        titleEn: stage?.nameEn ?? `Stage ${stageIndex}`,
        description:
          stage?.description ?? `${topic.nameZh} 在这一阶段开始形成更明确的研究分支与代表节点。`,
        branchLabel: stage?.name ?? `阶段 ${stageIndex}`,
        branchColor,
        locales: stageLocalization?.locales,
        editorial: {
          kicker: `Stage ${stageIndex}`,
          summary: clipText(stage?.description ?? `${topic.nameZh} 在这一阶段围绕同一问题线继续分化与汇流。`, 120),
          transition: clipText(`这一阶段真正重要的是：研究主线开始围绕“${stage?.name ?? `阶段 ${stageIndex}`}”形成更明确的节点分工。`, 120),
        },
        nodes: stageNodes.map((node) => {
          const fullContent = parseJsonValue<Record<string, unknown>>(node.fullContent)
          const summarySection = fullContent?.summary as Record<string, unknown> | undefined
          const summaryOverride =
            typeof summarySection?.oneLine === 'string' ? summarySection.oneLine : undefined
          const compactTitle = compactTopicMapNodeTitle({
            nodeTitle: node.nodeLabel,
            nodeSubtitle: node.nodeSubtitle,
            primaryPaperTitle: node.primaryPaper.titleZh || node.primaryPaper.title,
          })
          const titleEn =
            typeof fullContent?.titleEn === 'string'
              ? String(fullContent.titleEn)
              : compactTitle === node.nodeLabel
                ? node.nodeSubtitle || node.primaryPaper.titleEn || node.primaryPaper.title
                : compactTitle
          const digest = summaryOverride ?? node.nodeSummary
          const explanation = node.nodeExplanation ?? node.nodeSummary

          return {
            nodeId: node.id,
            anchorId: `node:${node.id}`,
            route: nodeRoute(node.id),
            title: compactTitle,
            titleEn,
            subtitle: node.nodeSubtitle ?? '',
            summary: digest,
            explanation,
            paperCount: node.papers.length,
            paperIds: node.papers.map((item) => item.paperId),
            primaryPaperTitle: node.primaryPaper.titleZh || node.primaryPaper.title,
            primaryPaperId: node.primaryPaper.id,
            coverImage: node.nodeCoverImage ?? node.primaryPaper.coverPath,
            isMergeNode: node.isMergeNode,
            provisional: node.provisional,
            updatedAt: node.updatedAt.toISOString(),
            branchLabel: stage?.name ?? `阶段 ${stageIndex}`,
            branchColor,
            editorial: {
              eyebrow: node.isMergeNode ? '汇流研究节点' : '研究节点',
              digest: clipText(digest, 120),
              whyNow: clipText(explanation, 110),
              nextQuestion: clipText(`下一步需要继续追问：${node.primaryPaper.titleZh || node.primaryPaper.title} 之后还有哪些证据能真正把这个节点坐实？`, 110),
            },
          }
        }),
      }
    })

  await updateTopicSnapshot(topic.id, buildTopicSnapshot(topic, baseStages))

  const stageThesisByIndex = new Map<number, string>()
  const stageGenerationResults = quick
    ? []
    : await mapWithConcurrency(baseStages, 3, (stage, index) =>
        generateStageEditorial(
          topic.id,
          topic,
          stage,
          index > 0 ? baseStages[index - 1] : null,
        ),
      )

  const stagedShells: TopicViewModel['stages'] = baseStages.map((stage, index) => {
    const generated = stageGenerationResults[index]?.output
    const merged = {
      ...stage,
      title: sanitizeString(generated?.title, stage.title),
      titleEn: sanitizeString(generated?.titleEn, stage.titleEn),
      branchLabel: sanitizeString(generated?.title, stage.branchLabel),
      editorial: {
        kicker: sanitizeString(generated?.kicker, stage.editorial.kicker),
        summary: sanitizeString(generated?.summary, stage.editorial.summary),
        transition: sanitizeString(generated?.transition, stage.editorial.transition),
      },
      nodes: stage.nodes.map((node) => ({
        ...node,
        branchLabel: sanitizeString(generated?.title, node.branchLabel),
      })),
    }

    stageThesisByIndex.set(
      stage.stageIndex,
      sanitizeString(generated?.stageThesis, clipText(merged.editorial.summary, 110)),
    )

    return merged
  })

  const nodeGenerationResults: Array<{ stageIndex: number; nodeId: string; usedFallback: boolean }> = []
  const stages: TopicViewModel['stages'] = quick
    ? stagedShells
    : await mapWithConcurrency(stagedShells, 3, async (stage) => {
        const generatedNodes = await mapWithConcurrency(stage.nodes, 3, async (node) => {
          const result = await generateNodeCardEditorial(topic.id, topic, stage, node)
          nodeGenerationResults.push({
            stageIndex: stage.stageIndex,
            nodeId: node.nodeId,
            usedFallback: result.usedFallback,
          })

          return {
            ...node,
            editorial: {
              eyebrow: sanitizeString(result.output.eyebrow, node.editorial.eyebrow),
              digest: sanitizeString(result.output.digest, node.editorial.digest),
              whyNow: sanitizeString(result.output.whyNow, node.editorial.whyNow),
              nextQuestion: sanitizeString(result.output.nextQuestion, node.editorial.nextQuestion),
            },
          } satisfies TopicNodeCard
        })

        return {
          ...stage,
          nodes: generatedNodes,
        }
      })

  if (!quick) {
    await updateTopicSnapshot(topic.id, buildTopicSnapshot(topic, stages))
  }

  const displayPapers = selectTopicDisplayPapers(topic)
  const papers = displayPapers.map((paper) => ({
    paperId: paper.id,
    anchorId: `paper:${paper.id}`,
    route: paperRoute(paper.id),
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn ?? paper.title,
    summary: paper.summary,
    explanation: paper.explanation ?? paper.summary,
    publishedAt: paper.published.toISOString(),
    authors: parseJsonArray(paper.authors),
    citationCount: paper.citationCount ?? null,
    coverImage: paper.coverPath,
    figuresCount: paper.figures.length,
    tablesCount: paper.tables.length,
    formulasCount: paper.formulas.length,
    sectionsCount: paper.sections.length,
  }))

  const evidenceCount = countPaperEvidence(displayPapers)

  const timelineStages = stages.map((stage) => {
    const stageBucket = stageBucketByIndex.get(stage.stageIndex)

    return {
      ...stage,
      yearLabel: stageBucket?.yearLabel ?? '',
      dateLabel: stageBucket?.dateLabel ?? stage.title,
      timeLabel: stageBucket?.timeLabel ?? stage.title,
      stageThesis: stageThesisByIndex.get(stage.stageIndex) ?? clipText(stage.editorial.summary, 110),
    }
  })

  const graph = buildGraphLayout(stages)
  const heroFallback: GeneratedTopicHero = {
    kicker: '主题编年',
    title: `从问题源头到当前分支：${topic.nameZh}`,
    standfirst: clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的研究脉络正在持续展开。`, 220),
    strapline: topic.focusLabel ?? topic.nameEn ?? '研究焦点',
    thesis: clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的核心判断仍在形成。`, 160),
  }

  const summaryPanel: TopicSummaryPanel = {
    thesis: clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的主线仍在持续推进。`, 180),
    metaRows: [
      { label: 'language', value: topic.language },
      { label: 'status', value: topic.status },
      { label: 'createdAt', value: topic.createdAt.toISOString() },
      { label: 'updatedAt', value: topic.updatedAt.toISOString() },
    ],
    stats: [
      { label: 'stages', value: stages.length },
      { label: 'nodes', value: topic.nodes.length },
      { label: 'papers', value: displayPapers.length },
      { label: 'evidence', value: evidenceCount },
    ],
    actions: [
      { id: 'start', label: 'Start' },
      { id: 'edit', label: 'Edit' },
      { id: 'export', label: 'Export' },
      { id: 'delete', label: 'Delete' },
      { id: 'rebuild', label: 'Refresh' },
    ],
  }

  const narrativeSegments = [
    topic.summary,
    topic.description,
    ...stages.map((stage) => `${stage.title}：${stage.editorial.summary}`),
  ].filter(Boolean)

  const closingParagraphs = [
    clipText(topic.description ?? topic.summary ?? `${topic.nameZh} 仍在继续展开。`, 220),
    clipText(
      `从阶段组织来看，这个主题已经形成 ${stages.length} 个阶段、${topic.nodes.length} 个节点和 ${displayPapers.length} 篇论文组成的主链路，但真正稳固的结论仍然要回到节点内部的证据与跨论文比较。`,
      220,
    ),
  ].filter(Boolean)

  const closingFallback: TopicClosingEditorial = {
    title: '这一主题现在走到哪里？',
    paragraphs: closingParagraphs,
    reviewerNote: clipText(
      '如果只看主题级时间线而不进入节点文章，读者仍可能高估主线清晰度。真正的难点仍在于多篇论文之间的分工、证据强弱和未解决问题。',
      180,
    ),
  }
  const [heroResult, closingResult] = quick
    ? [
        { output: heroFallback, usedFallback: true },
        { output: closingFallback, usedFallback: true },
      ]
    : await Promise.all([
        generateTopicHero(topic.id, topic, stages, displayPapers.length),
        generateTopicClosing(topic.id, topic, stages, closingFallback, displayPapers.length),
      ])

  summaryPanel.thesis = sanitizeString(
    heroResult.output.thesis,
    clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的主线仍在继续推进。`, 180),
  )

  const resources = [
    ...stages.slice(0, 2).map((stage) => ({
      id: `stage:${stage.stageIndex}`,
      kind: 'stage' as const,
      title: stage.title,
      subtitle: stage.titleEn,
      description: stage.editorial.summary,
      route: `/topic/${topic.id}?anchor=stage:${stage.stageIndex}`,
      anchorId: `stage:${stage.stageIndex}`,
    })),
    ...stages.flatMap((stage) => stage.nodes.slice(0, 1)).slice(0, 2).map((node) => ({
      id: `node:${node.nodeId}`,
      kind: 'node' as const,
      title: node.title,
      subtitle: node.titleEn,
      description: node.editorial.digest,
      route: node.route,
      anchorId: node.anchorId,
    })),
    ...papers.slice(0, 2).map((paper) => ({
      id: `paper:${paper.paperId}`,
      kind: 'paper' as const,
      title: paper.title,
      subtitle: paper.titleEn,
      description: paper.explanation,
      route: paper.route,
      anchorId: paper.anchorId,
    })),
  ]

  const resolvedHero = {
    kicker: sanitizeString(heroResult.output.kicker, '主题编年'),
    title: sanitizeString(heroResult.output.title, `从问题源头到当前分支：${topic.nameZh}`),
    standfirst: sanitizeString(
      heroResult.output.standfirst,
      clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的研究脉络正在持续展开。`, 220),
    ),
    strapline: sanitizeString(heroResult.output.strapline, topic.focusLabel ?? topic.nameEn ?? '研究焦点'),
  }

  const generationState: TopicViewModel['generationState'] = {
    hero: quick || heroResult.usedFallback ? 'pending' : 'ready',
    stageTimeline: quick || stageGenerationResults.some((result) => result.usedFallback) ? 'pending' : 'ready',
    nodeCards: quick || nodeGenerationResults.some((result) => result.usedFallback) ? 'pending' : 'ready',
    closing: quick || closingResult.usedFallback ? 'pending' : 'ready',
  }

  const resolvedClosingEditorial: TopicClosingEditorial = {
    title: sanitizeString(closingResult.output.title, closingFallback.title),
    paragraphs: sanitizeParagraphs(closingResult.output.paragraphs, closingFallback.paragraphs),
    reviewerNote: sanitizeString(closingResult.output.reviewerNote, closingFallback.reviewerNote),
  }

  const localizedTopicTitle =
    localization?.topic.locales.zh.name ?? topic.nameZh
  const localizedTopicTitleEn =
    localization?.topic.locales.en.name ?? topic.nameEn ?? topic.nameZh
  const localizedFocusLabel =
    localization?.topic.locales.zh.focusLabel ?? topic.focusLabel ?? topic.nameEn ?? '研究焦点'
  const localizedSummary =
    localization?.topic.locales.zh.summary ??
    topic.summary ??
    topic.description ??
    '该主题正在等待生成摘要。'
  const localizedDescription =
    localization?.topic.locales.zh.description ?? topic.description ?? topic.summary ?? ''

  const viewModel: TopicViewModel = {
    schemaVersion: TOPIC_VIEW_MODEL_SCHEMA,
    topicId: topic.id,
    title: topic.nameZh,
    titleEn: topic.nameEn ?? topic.nameZh,
    subtitle: topic.focusLabel ?? topic.nameEn ?? '主题研究编年',
    focusLabel: topic.focusLabel ?? topic.nameEn ?? '研究焦点',
    summary: topic.summary ?? topic.description ?? '该主题正在等待生成摘要。',
    description: topic.description ?? topic.summary ?? '',
    language: topic.language,
    status: topic.status,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    generatedAt: new Date().toISOString(),
    localization,
    hero: {
      kicker: '主题编年',
      title: `从问题源头到当前分支：${topic.nameZh}`,
      standfirst: clipText(topic.summary ?? topic.description ?? `${topic.nameZh} 的研究脉络正在持续展开。`, 220),
      strapline: topic.focusLabel ?? topic.nameEn ?? '研究焦点',
    },
    stageConfig: {
      windowMonths: stageWindowMonths,
      defaultWindowMonths: DEFAULT_STAGE_WINDOW_MONTHS,
      minWindowMonths: MIN_STAGE_WINDOW_MONTHS,
      maxWindowMonths: MAX_STAGE_WINDOW_MONTHS,
      adjustable: true,
    },
    summaryPanel,
    stats: {
      stageCount: stages.length,
      nodeCount: topic.nodes.length,
      paperCount: displayPapers.length,
      evidenceCount,
    },
    timeline: {
      stages: timelineStages,
    },
    graph,
    generationState: {
      hero: 'ready',
      stageTimeline: 'ready',
      nodeCards: 'ready',
      closing: 'ready',
    },
    stages,
    papers,
    narrativeArticle: narrativeSegments.join('\n\n'),
    closingEditorial: {
      title: '这一主题现在走到了哪里',
      paragraphs: closingParagraphs,
      reviewerNote: clipText('如果只看主题级时间线而不进入节点文章，读者仍然可能高估主线清晰度。真正的难点仍在于多篇论文之间的分工、证据强弱和未解决问题。', 180),
    },
    resources,
    chatContext: {
      suggestedQuestions: [
        '这个主题目前最关键的研究转折是什么？',
        `请按阶段解释 ${topic.nameZh} 的演进路线。`,
        '如果我现在开始读这个主题，应该先看哪个节点？为什么？',
      ],
    },
  }

  viewModel.hero = resolvedHero
  viewModel.generationState = generationState
  viewModel.closingEditorial = resolvedClosingEditorial

  return viewModel
}

function buildTopicHeroFallbackV2(args: {
  localizedTopicTitle: string
  localizedTopicTitleEn: string
  localizedFocusLabel: string
  stages: TopicViewModel['stages']
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  sessionMemory: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>
}) {
  const {
    localizedTopicTitle,
    localizedTopicTitleEn,
    localizedFocusLabel,
    stages,
    latestResearchReport,
    pipelineOverview,
    sessionMemory,
  } = args
  const firstStage = stages[0] ?? null
  const lastStage = stages[stages.length - 1] ?? null
  const currentAnchor =
    joinQuotedTopicLabels(lastStage?.nodes.map((node) => node.title) ?? [], 2) ||
    quoteTopicLabel(lastStage?.title) ||
    quoteTopicLabel(localizedTopicTitle) ||
    '当前判断'
  const echoReferences = [localizedTopicTitle, localizedFocusLabel, localizedTopicTitleEn]
  const stageSpan =
    firstStage && lastStage
      ? firstStage.stageIndex === lastStage.stageIndex
        ? `围绕${quoteTopicLabel(firstStage.title) || '当前阶段'}`
        : `从${quoteTopicLabel(firstStage.title) || '起点'}走到${quoteTopicLabel(lastStage.title) || '当前阶段'}`
      : `围绕${quoteTopicLabel(localizedTopicTitle) || '当前主题'}`
  const continuity = stripTopicTrailingPunctuation(
    pickDistinctReadableTopicLine(
      [
        sessionMemory.summary.continuity,
        latestResearchReport?.dek,
        latestResearchReport?.keyMoves?.[0],
        pipelineOverview.currentStage?.stageSummary,
        lastStage?.editorial.summary,
      ],
      echoReferences,
      140,
    ),
  )
  const judgmentFocus =
    stripTopicTrailingPunctuation(
      pickDistinctReadableTopicLine(
        [
          sessionMemory.summary.currentFocus,
          latestResearchReport?.summary,
          latestResearchReport?.headline,
          pipelineOverview.currentStage?.stageSummary,
        ],
        echoReferences,
        150,
      ),
    ) || `围绕${currentAnchor}形成的判断`

  return {
    kicker: '研究主线',
    title:
      firstStage && lastStage && firstStage.stageIndex !== lastStage.stageIndex
        ? `从${stripTopicTrailingPunctuation(firstStage.title)}到${stripTopicTrailingPunctuation(lastStage.title)}：${localizedTopicTitle}`
        : `沿着研究主线重读：${localizedTopicTitle}`,
    standfirst: clipText(
      ensureTopicSentence(
        `这不是一个静态的话题标签，而是在追踪${stageSpan}的一条研究主线；当前的判断重心已经推到${currentAnchor}`,
      ) || ensureTopicSentence(localizedTopicTitle),
      220,
    ),
    strapline: localizedFocusLabel || localizedTopicTitleEn || '研究焦点',
    thesis: clipText(
      ensureTopicSentence(
        continuity
          ? continuity.includes('判断') || continuity.includes('主线')
            ? `当前最重要的，不是继续放大主题外延，而是回到当前主线本身：${continuity}`
            : `当前最重要的，不是继续放大主题外延，而是判断：${continuity}`
          : `当前最重要的，不是再堆更多材料，而是确认${judgmentFocus}究竟能否真正站成稳定主线`,
      ) || ensureTopicSentence(judgmentFocus),
      160,
    ),
  } satisfies GeneratedTopicHero
}

function buildTopicNarrativeSegmentsV2(args: {
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>
  stages: TopicViewModel['stages']
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  sessionMemory: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>
}) {
  const { topic, stages, latestResearchReport, pipelineOverview, sessionMemory } = args
  const firstStage = stages[0] ?? null
  const lastStage = stages[stages.length - 1] ?? null
  const stageSpine = joinQuotedTopicLabels(
    [
      firstStage?.title,
      stages[Math.min(1, Math.max(0, stages.length - 1))]?.title,
      lastStage?.title,
    ],
    Math.min(3, Math.max(1, stages.length)),
  )
  const currentAnchor =
    joinQuotedTopicLabels(lastStage?.nodes.map((node) => node.title) ?? [], 2) ||
    quoteTopicLabel(lastStage?.title) ||
    '当前阶段'
  const echoReferences = [topic.nameZh, topic.focusLabel, topic.summary, topic.description]
  const currentJudgment = stripTopicTrailingPunctuation(
    pickDistinctReadableTopicLine(
      [
        latestResearchReport?.summary,
        sessionMemory.summary.currentFocus,
        pipelineOverview.currentStage?.stageSummary,
        latestResearchReport?.headline,
      ],
      echoReferences,
      180,
    ),
  )
  const continuity = stripTopicTrailingPunctuation(
    pickDistinctReadableTopicLine(
      [
        sessionMemory.summary.continuity,
        latestResearchReport?.dek,
        latestResearchReport?.keyMoves?.[0],
        pipelineOverview.currentStage?.stageSummary,
      ],
      echoReferences,
      170,
    ),
  )
  const openQuestion = stripTopicTrailingPunctuation(
    pickReadableTopicLine(
      [
        latestResearchReport?.openQuestions[0],
        pipelineOverview.globalOpenQuestions[0],
        sessionMemory.summary.openQuestions[0],
      ],
      150,
    ),
  )

  return collectReadableTopicStrings(
    [
      ensureTopicSentence(
        currentJudgment
          ? `这个主题并不是把与${quoteTopicLabel(topic.nameZh) || '当前问题'}相关的论文顺着时间排开，而是在追踪一条逐步收束的研究主线：${currentJudgment}`
          : '这个主题并不是把相关论文简单并列，而是在追踪一个核心判断如何被提出、加固、分叉，再重新收束成可阅读的主线',
      ),
      ensureTopicSentence(
        firstStage || lastStage
          ? `从结构上看，目前这条主线已经展开为${stages.length}个阶段、${topic.nodes.length}个节点，关键转折主要落在${stageSpine || quoteTopicLabel(firstStage?.title) || '各个阶段'}，如今的判断重心落在${currentAnchor}`
          : '当前主题已经开始从若干零散论文，收束成一条可以按阶段阅读的研究链条',
      ),
      ensureTopicSentence(
        openQuestion
          ? `现在真正还没有闭合的，不是“有没有更多论文”，而是：${openQuestion}`
          : continuity
            ? `现在真正需要继续盯住的，是这条主线能否经得起下一轮证据回填与节点修正：${continuity}`
            : '接下来最重要的工作，不是继续扩展题目边界，而是回到节点内部核对证据、比较分工，并修正过早上升的判断',
      ),
    ],
    3,
    280,
  )
}

function buildTopicClosingFallbackV2(args: {
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>
  stages: TopicViewModel['stages']
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  generationContext: TopicGenerationContext
  displayPaperCount: number
}) {
  const { topic, stages, latestResearchReport, pipelineOverview, generationContext, displayPaperCount } = args
  const lastStage = stages[stages.length - 1] ?? null
  const currentAnchor =
    joinQuotedTopicLabels(lastStage?.nodes.map((node) => node.title) ?? [], 2) ||
    quoteTopicLabel(lastStage?.title) ||
    '当前主线'
  const echoReferences = [topic.nameZh, topic.focusLabel, topic.summary, topic.description]
  const currentJudgment = stripTopicTrailingPunctuation(
    pickDistinctReadableTopicLine(
      [
        latestResearchReport?.summary,
        latestResearchReport?.dek,
        pipelineOverview.currentStage?.stageSummary,
        lastStage?.editorial.summary,
        topic.summary,
      ],
      echoReferences,
      180,
    ),
  )
  const openQuestion = stripTopicTrailingPunctuation(
    pickReadableTopicLine(
      [
        latestResearchReport?.openQuestions[0],
        pipelineOverview.globalOpenQuestions[0],
        generationContext.openQuestions[0],
      ],
      160,
    ),
  )
  const reviewerNote =
    ensureTopicSentence(
      pickReadableTopicLine(
        [
          generationContext.reviewerWatchpoints[0],
          '如果只看主题页而不继续下钻到节点与论文正文，最容易忽略的是：主线看上去连续，并不等于每个节点都已经被同等强度的证据支撑',
        ],
        190,
      ),
    ) || ''

  return {
    title: '这条研究主线目前站在什么位置',
    paragraphs: collectReadableTopicStrings(
      [
        ensureTopicSentence(
          currentJudgment
            ? `读到这里，可以先把这个主题理解为一条已经开始收束的研究链：${currentJudgment}`
            : '读到这里，这个主题已经不再只是若干相关论文的并列，而是开始收束成一条可以按阶段重读的研究主线',
        ),
        ensureTopicSentence(
          `从结构上看，它目前被整理成${stages.length}个阶段、${topic.nodes.length}个节点与${displayPaperCount}篇论文，当前最需要回看的位置，是${currentAnchor}`,
        ),
        ensureTopicSentence(
          openQuestion
            ? `但这条主线还没有真正闭合。接下来最值得继续判断的是：${openQuestion}`
            : '但这条主线还没有真正闭合。接下来真正值得继续追的，不是泛泛增加材料，而是回到节点内部检查跨论文分工、证据强弱与反例是否足以支撑最终结论',
        ),
      ],
      3,
      260,
    ),
    reviewerNote,
  } satisfies TopicClosingEditorial
}

function buildTopicSuggestedQuestionsV2(args: {
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>
  latestResearchReport: ResearchRunReport | null
  pipelineOverview: TopicPipelineContext
  sessionMemory: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>
}) {
  const { topic, latestResearchReport, pipelineOverview, sessionMemory } = args
  const openQuestions = uniqueStrings(
    [
      ...(latestResearchReport?.openQuestions ?? []),
      ...pipelineOverview.globalOpenQuestions,
    ]
      .map((item) => sanitizeTopicUserFacingSentence(item, '', 150))
      .filter(Boolean),
    3,
    150,
  )
  const currentFocus = sanitizeTopicUserFacingSentence(sessionMemory.summary.currentFocus, '', 140)

  return uniqueStrings(
    [
      ...openQuestions.map((item) => `这个问题现在可以怎样判断：${stripTopicTrailingPunctuation(item)}？`),
      currentFocus
        ? `请把“${stripTopicTrailingPunctuation(currentFocus)}”改写成当前主题的研究主线。`
        : '',
      `请按阶段解释 ${topic.nameZh} 的演进路径。`,
      '如果我现在开始读这个主题，应该先看哪个节点，为什么？',
    ],
    4,
    180,
  )
}

async function buildTopicArtifactFingerprintV2(
  topicId: string,
  options?: TopicViewModelBuildOptions,
) {
  const stageWindowMonths = resolveStageWindowMonths(options?.stageWindowMonths)
  const [
    topic,
    localization,
    runtime,
    topicMemory,
    sessionMemory,
    latestResearchReport,
    pipelineState,
    modelConfigFingerprint,
    stageTemplate,
    nodeCardTemplate,
    heroTemplate,
    closingTemplate,
  ] = await Promise.all([
    loadTopicForArtifact(topicId),
    getTopicLocalization(topicId),
    getGenerationRuntimeConfig(),
    loadTopicGenerationMemory(topicId),
    loadTopicSessionMemory(topicId),
    loadTopicResearchReport(topicId),
    loadResearchPipelineState(topicId),
    getModelConfigFingerprint(),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_STAGE_TIMELINE),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_NODE_CARD),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_HERO),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.TOPIC_CLOSING),
  ])

  const pipelineOverview = buildResearchPipelineContext(pipelineState, { historyLimit: 6 })
  const temporalBuckets = deriveTemporalStageBuckets({
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: topic.nodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.papers.map((item) => ({ paperId: item.paperId })),
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
    })),
    windowMonths: stageWindowMonths,
    fallbackDate: topic.createdAt,
  })
  const nodeArtifactFingerprints = await mapWithConcurrency(topic.nodes, 3, async (node) => {
    try {
      return {
        nodeId: node.id,
        fingerprint: await buildNodeArtifactFingerprint(node.id),
      }
    } catch (error) {
      logger.warn('Failed to load node artifact fingerprint while building topic fingerprint.', {
        topicId,
        nodeId: node.id,
        error,
      })
      return {
        nodeId: node.id,
        fingerprint: null,
      }
    }
  })

  return buildGenerationFingerprint({
    kind: 'topic',
    topicId,
    stageConfig: {
      windowMonths: stageWindowMonths,
      defaultWindowMonths: DEFAULT_STAGE_WINDOW_MONTHS,
      minWindowMonths: MIN_STAGE_WINDOW_MONTHS,
      maxWindowMonths: MAX_STAGE_WINDOW_MONTHS,
    },
    topic: {
      id: topic.id,
      updatedAt: topic.updatedAt.toISOString(),
      nameZh: topic.nameZh,
      nameEn: topic.nameEn,
      focusLabel: topic.focusLabel,
      summary: topic.summary,
      description: topic.description,
      language: topic.language,
      status: topic.status,
      stages: topic.stages.map((stage) => ({
        id: stage.id,
        order: stage.order,
        name: stage.name,
        nameEn: stage.nameEn,
        description: stage.description,
        descriptionEn: stage.descriptionEn,
      })),
      nodes: topic.nodes.map((node) => ({
        id: node.id,
        stageIndex: node.stageIndex,
        updatedAt: node.updatedAt.toISOString(),
        nodeLabel: node.nodeLabel,
        nodeSubtitle: node.nodeSubtitle,
        nodeSummary: node.nodeSummary,
        nodeExplanation: node.nodeExplanation,
        nodeCoverImage: node.nodeCoverImage,
        status: node.status,
        isMergeNode: node.isMergeNode,
        provisional: node.provisional,
        primaryPaperId: node.primaryPaperId,
        primaryPaper: {
          id: node.primaryPaper.id,
          title: node.primaryPaper.title,
          titleZh: node.primaryPaper.titleZh,
          titleEn: node.primaryPaper.titleEn,
          coverPath: node.primaryPaper.coverPath,
          published: node.primaryPaper.published.toISOString(),
        },
        paperIds: node.papers.map((item) => item.paperId),
      })),
      papers: topic.papers.map((paper) => ({
        id: paper.id,
        updatedAt: paper.updatedAt.toISOString(),
        title: paper.title,
        titleZh: paper.titleZh,
        titleEn: paper.titleEn,
        summary: paper.summary,
        explanation: paper.explanation,
        published: paper.published.toISOString(),
        citationCount: paper.citationCount,
        coverPath: paper.coverPath,
        authors: paper.authors,
        figureCount: paper.figures.length,
        tableCount: paper.tables.length,
        formulaCount: paper.formulas.length,
        sectionCount: paper.sections.length,
      })),
    },
    temporalBuckets: temporalBuckets.buckets.map((bucket) => ({
      bucketKey: bucket.bucketKey,
      stageIndex: bucket.stageIndex,
      label: bucket.label,
      labelEn: bucket.labelEn,
      dateLabel: bucket.dateLabel,
      timeLabel: bucket.timeLabel,
      yearLabel: bucket.yearLabel,
      paperIds: bucket.paperIds,
      nodeIds: bucket.nodeIds,
    })),
    localization,
    runtime,
    latestResearchReport,
    researchPipeline: {
      updatedAt: pipelineState.updatedAt ?? null,
      lastRun: pipelineOverview.lastRun,
      currentStage: pipelineOverview.currentStage,
      globalOpenQuestions: pipelineOverview.globalOpenQuestions,
      continuityThreads: pipelineOverview.continuityThreads,
    },
    nodeArtifactFingerprints,
    modelConfigFingerprint,
    promptTemplates: [stageTemplate, nodeCardTemplate, heroTemplate, closingTemplate],
    topicMemoryUpdatedAt: topicMemory.updatedAt,
    sessionMemoryUpdatedAt: sessionMemory.updatedAt,
  })
}

async function buildTopicViewModelResearchAware(
  topicId: string,
  options?: TopicViewModelBuildOptions,
): Promise<TopicViewModel> {
  const quick = options?.quick === true
  const stageWindowMonths = resolveStageWindowMonths(options?.stageWindowMonths)
  const [topic, localization] = await Promise.all([
    loadTopicForArtifact(topicId),
    getTopicLocalization(topicId),
  ])
  const researchSignals = await loadTopicResearchSignals(topicId, topic, {
    quick,
    stageWindowMonths,
  })
  const rawPaperById = new Map(topic.papers.map((paper) => [paper.id, paper]))
  const localizedTopicTitle = localization?.topic.locales.zh.name ?? topic.nameZh
  const localizedTopicTitleEn =
    localization?.topic.locales.en.name ?? topic.nameEn ?? topic.nameZh
  const localizedFocusLabel =
    localization?.topic.locales.zh.focusLabel ?? topic.focusLabel ?? topic.nameEn ?? '研究焦点'
  const localizedSummary =
    localization?.topic.locales.zh.summary ??
    topic.summary ??
    topic.description ??
    '该主题正在等待更完整的研究摘要。'
  const localizedDescription =
    localization?.topic.locales.zh.description ?? topic.description ?? topic.summary ?? ''
  const temporalBuckets = deriveTemporalStageBuckets({
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: topic.nodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.papers.map((item) => ({ paperId: item.paperId })),
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
    })),
    windowMonths: stageWindowMonths,
    fallbackDate: topic.createdAt,
  })
  const stageBucketByIndex = new Map(
    temporalBuckets.buckets.map((bucket) => [bucket.stageIndex, bucket] as const),
  )
  const stageMap = new Map(
    temporalBuckets.buckets.map((bucket) => [
      bucket.stageIndex,
      {
        name: bucket.label,
        nameEn: bucket.labelEn,
        description: bucket.description,
      },
    ] as const),
  )
  const nodesByStage = new Map<number, typeof topic.nodes>()

  for (const node of topic.nodes) {
    const stageAssignment = temporalBuckets.nodeAssignments.get(node.id) ?? temporalBuckets.fallbackAssignment
    const stageIndex = stageAssignment?.stageIndex ?? 1
    const current = nodesByStage.get(stageIndex) ?? []
    current.push(node)
    nodesByStage.set(stageIndex, current)
  }

  const stageKeys = temporalBuckets.buckets.map((bucket) => bucket.stageIndex)
  const stageEditorialFallbackByIndex = new Map<
    number,
    ReturnType<typeof buildStageResearchEditorial>
  >()

  const baseStages: TopicViewModel['stages'] = stageKeys.map((stageIndex, stageListIndex) => {
    const stageBucket = stageBucketByIndex.get(stageIndex)
    const stage = {
      name: stageBucket?.label ?? `Stage ${stageIndex}`,
      nameEn: stageBucket?.labelEn ?? `Stage ${stageIndex}`,
      description:
        stageBucket?.description ??
        `Collect the papers and nodes that entered ${topic.nameZh} during Stage ${stageIndex}.`,
    }
    const stageLocalization = null as { locales: StageLocaleMap } | null
    const stageNodes = nodesByStage.get(stageIndex) ?? []
    const branchColor = pickBranchColor(stageListIndex)
    const stageTitle = stageLocalization?.locales.zh.name ?? stage?.name ?? `阶段 ${stageIndex}`
    const stageTitleEn = stageLocalization?.locales.en.name ?? stage?.nameEn ?? `Stage ${stageIndex}`
    const stageDescription =
      stageLocalization?.locales.zh.description ??
      stage?.description ??
      `${topic.nameZh} 在这一阶段开始形成更明确的研究分支与代表节点。`
    const stagePipeline = buildResearchPipelineContext(researchSignals.pipelineState, {
      paperIds: uniqueStrings(
        stageNodes.flatMap((node) => node.papers.map((item) => item.paperId)),
        16,
        80,
      ),
      historyLimit: 6,
    })
    const previousStageIndex = stageListIndex > 0 ? stageKeys[stageListIndex - 1] : null
    const previousStageRecord =
      typeof previousStageIndex === 'number' ? stageMap.get(previousStageIndex) : null
    const previousStageLocalization = null as { locales: StageLocaleMap } | null
    const previousStageTitle =
      previousStageLocalization?.locales.zh.name ??
      previousStageRecord?.name ??
      (typeof previousStageIndex === 'number' ? `阶段 ${previousStageIndex}` : null)

    const stageCards = stageNodes.map((node) => {
      const fullContent = parseJsonValue<Record<string, unknown>>(node.fullContent)
      const fullContentSummary = readFullContentSummary(fullContent)
      const reader = researchSignals.nodeReaderById.get(node.id) ?? null
      const nodeAssignment = temporalBuckets.nodeAssignments.get(node.id) ?? temporalBuckets.fallbackAssignment
      const stageScopedPaperIds = nodeAssignment
        ? new Set(
            Array.from(temporalBuckets.paperAssignments.entries())
              .filter(([, assignment]) => assignment.bucketKey === nodeAssignment.bucketKey)
              .map(([paperId]) => paperId),
          )
        : null
      const compactTitle = compactTopicMapNodeTitle({
        nodeTitle: node.nodeLabel,
        nodeSubtitle: node.nodeSubtitle,
        primaryPaperTitle: node.primaryPaper.titleZh || node.primaryPaper.title,
      })
      const titleEn =
        typeof fullContent?.titleEn === 'string'
          ? String(fullContent.titleEn)
          : compactTitle === node.nodeLabel
            ? reader?.titleEn || node.nodeSubtitle || node.primaryPaper.titleEn || node.primaryPaper.title
            : compactTitle
      const digest = fullContentSummary.oneLine || reader?.headline || node.nodeSummary
      const explanation = reader?.standfirst || node.nodeExplanation || node.nodeSummary
      const nodeDisplayPaperIds = pickTopicMapNodePaperIds({
        nodePaperIds: node.papers.map((item) => item.paperId),
        stageScopedPaperIds,
        readerPaperIds: reader?.paperRoles.map((paper) => paper.paperId),
      })
      const coverImage = buildNodeCoverImage({
        node,
        reader,
        rawPaperById,
        paperIds: nodeDisplayPaperIds,
      })
      const nodeCard: TopicNodeCard = {
        nodeId: node.id,
        anchorId: `node:${node.id}`,
        route: nodeRoute(node.id),
        title: compactTitle,
        titleEn,
        subtitle: node.nodeSubtitle ?? reader?.subtitle ?? '',
        summary: digest,
        explanation,
        paperCount: nodeDisplayPaperIds.length,
        paperIds: nodeDisplayPaperIds,
        primaryPaperTitle: node.primaryPaper.titleZh || node.primaryPaper.title,
        primaryPaperId: node.primaryPaper.id,
        coverImage,
        isMergeNode: node.isMergeNode,
        provisional: node.provisional,
        updatedAt: node.updatedAt.toISOString(),
        branchLabel: stageTitle,
        branchColor,
        editorial: {
          eyebrow: node.isMergeNode ? '汇流研究节点' : '研究节点',
          digest: clipText(digest, 140),
          whyNow: clipText(explanation, 180),
          nextQuestion: clipText(
            `下一步需要继续追问：${node.primaryPaper.titleZh || node.primaryPaper.title} 之后还有哪些证据能真正把这个节点坐实？`,
            140,
          ),
        },
      }

      const nodeResearchContent = buildNodeResearchContent({
        node: nodeCard,
        stageIndex: node.stageIndex,
        fullContentSummary,
        reader,
        pipeline: buildResearchPipelineContext(researchSignals.pipelineState, {
          stageIndex: node.stageIndex,
          nodeId: node.id,
          paperIds: nodeCard.paperIds,
          historyLimit: 6,
        }),
        latestResearchReport: researchSignals.latestResearchReport,
        generationContext: researchSignals.generationContext,
      })

      return {
        ...nodeCard,
        summary: nodeResearchContent.summary,
        explanation: nodeResearchContent.explanation,
        editorial: nodeResearchContent.editorial,
      }
    })

    const baseStage: TopicViewModel['stages'][number] = {
      stageIndex,
      title: stageTitle,
      titleEn: stageTitleEn,
      description: stageDescription,
      branchLabel: stageTitle,
      branchColor,
      locales: stageLocalization?.locales,
      editorial: {
        kicker: `Stage ${stageIndex}`,
        summary: clipText(
          stageDescription || `${topic.nameZh} 在这一阶段围绕同一问题线继续分化与汇流。`,
          140,
        ),
        transition: clipText(
          `这一阶段真正重要的是：研究主线开始围绕“${stageTitle}”形成更明确的节点分工。`,
          140,
        ),
      },
      nodes: stageCards,
    }

    const stageResearchEditorial = buildStageResearchEditorial({
      stage: baseStage,
      previousStageTitle,
      pipeline: stagePipeline,
      latestResearchReport: researchSignals.latestResearchReport,
      generationContext: researchSignals.generationContext,
    })
    stageEditorialFallbackByIndex.set(stageIndex, stageResearchEditorial)

    return {
      ...baseStage,
      editorial: {
        ...baseStage.editorial,
        summary: stageResearchEditorial.summary,
        transition: stageResearchEditorial.transition,
      },
      nodes: stageCards,
    }
  })

  await updateTopicSnapshot(topic.id, buildTopicSnapshot(topic, baseStages))

  const stageThesisByIndex = new Map<number, string>()
  const stageGenerationResults: Array<Awaited<ReturnType<typeof generateStageEditorial>>> = quick
    ? []
    : await mapWithConcurrency(baseStages, 3, (stage, index) =>
        generateStageEditorial(
          topic.id,
          topic,
          stage,
          index > 0 ? baseStages[index - 1] : null,
        ),
      )

  const stagedShells: TopicViewModel['stages'] = baseStages.map((stage, index) => {
    const generated = stageGenerationResults[index]?.output
    const editorialFallback =
      stageEditorialFallbackByIndex.get(stage.stageIndex) ?? {
        summary: stage.editorial.summary,
        transition: stage.editorial.transition,
        stageThesis: clipText(stage.editorial.summary, 110),
      }

    const merged = {
      ...stage,
      title: sanitizeString(generated?.title, stage.title),
      titleEn: sanitizeString(generated?.titleEn, stage.titleEn),
      branchLabel: sanitizeString(generated?.title, stage.branchLabel),
      editorial: {
        kicker: sanitizeString(generated?.kicker, stage.editorial.kicker),
        summary: sanitizeTopicUserFacingSentence(
          sanitizeString(generated?.summary, editorialFallback.summary),
          editorialFallback.summary,
          180,
        ),
        transition: sanitizeTopicUserFacingSentence(
          sanitizeString(generated?.transition, editorialFallback.transition),
          editorialFallback.transition,
          180,
        ),
      },
      nodes: stage.nodes.map((node) => ({
        ...node,
        branchLabel: sanitizeString(generated?.title, node.branchLabel),
      })),
    }

    stageThesisByIndex.set(
      stage.stageIndex,
      sanitizeString(generated?.stageThesis, editorialFallback.stageThesis),
    )

    return merged
  })

  const nodeGenerationResults: Array<{ stageIndex: number; nodeId: string; usedFallback: boolean }> = []
  const stages: TopicViewModel['stages'] = quick
    ? stagedShells
    : await mapWithConcurrency(stagedShells, 3, async (stage) => {
        const generatedNodes = await mapWithConcurrency(stage.nodes, 3, async (node) => {
          const result = await generateNodeCardEditorial(topic.id, topic, stage, node)
          nodeGenerationResults.push({
            stageIndex: stage.stageIndex,
            nodeId: node.nodeId,
            usedFallback: result.usedFallback,
          })

          const compactTitle = compactTopicMapNodeTitle({
            nodeTitle: node.title,
            nodeSubtitle: node.subtitle,
            primaryPaperTitle: node.primaryPaperTitle,
          })
          const safeSummary = sanitizeTopicUserFacingSentence(
            node.summary,
            buildTopicMapNodeSummary({
              nodeTitle: compactTitle,
              primaryPaperTitle: node.primaryPaperTitle,
              paperCount: node.paperCount,
              candidates: [],
            }),
            150,
          )
          const safeExplanation = sanitizeTopicUserFacingSentence(
            node.explanation,
            safeSummary,
            200,
          )
          const safeTitleEnCandidate = sanitizeString(node.titleEn, compactTitle)
          const safeTitleEn =
            normalizeTopicMapCardKey(safeTitleEnCandidate) === normalizeTopicMapCardKey(node.title)
              ? compactTitle
              : clipText(safeTitleEnCandidate, 80)

          return {
            ...node,
            title: compactTitle,
            titleEn: safeTitleEn,
            summary: safeSummary,
            explanation: safeExplanation,
            editorial: {
              eyebrow: sanitizeString(result.output.eyebrow, node.editorial.eyebrow),
              digest: sanitizeTopicUserFacingSentence(
                sanitizeString(result.output.digest, node.editorial.digest),
                safeSummary,
                160,
              ),
              whyNow: sanitizeTopicUserFacingSentence(
                sanitizeString(result.output.whyNow, node.editorial.whyNow),
                safeExplanation,
                200,
              ),
              nextQuestion: sanitizeTopicUserFacingSentence(
                sanitizeString(result.output.nextQuestion, node.editorial.nextQuestion),
                node.editorial.nextQuestion,
                160,
              ),
            },
          } satisfies TopicNodeCard
        })

        return {
          ...stage,
          nodes: generatedNodes,
        }
      })

  if (!quick) {
    await updateTopicSnapshot(topic.id, buildTopicSnapshot(topic, stages))
  }

  const displayPapers = selectTopicDisplayPapers(topic)
  const papers = displayPapers.map((paper) => ({
    paperId: paper.id,
    anchorId: `paper:${paper.id}`,
    route: paperRoute(paper.id),
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn ?? paper.title,
    summary: buildTopicPaperSummary({
      paperTitle: paper.titleZh || paper.title,
      summary: paper.summary,
      explanation: paper.explanation,
    }),
    explanation: buildTopicPaperExplanation({
      paperTitle: paper.titleZh || paper.title,
      summary: paper.summary,
      explanation: paper.explanation,
    }),
    publishedAt: paper.published.toISOString(),
    authors: parseJsonArray(paper.authors),
    citationCount: paper.citationCount ?? null,
    coverImage: paper.coverPath ?? pickRepresentativeFigureImage(paper),
    figuresCount: paper.figures.length,
    tablesCount: paper.tables.length,
    formulasCount: paper.formulas.length,
    sectionsCount: paper.sections.length,
  }))

  const evidenceCount = countPaperEvidence(displayPapers)

  const timelineStages = stages.map((stage) => {
    const stageSourceNodes = nodesByStage.get(stage.stageIndex) ?? []
    const stageDates = stageSourceNodes
      .map((node) => node.primaryPaper?.published ?? node.updatedAt)
      .filter((value): value is Date => value instanceof Date)
    const leadDate = [...stageDates].sort((left, right) => +left - +right)[0] ?? null

    return {
      ...stage,
      yearLabel: formatStageDateLabel(leadDate, 'year'),
      dateLabel: formatMonthDayLabel(leadDate),
      timeLabel: formatPreciseDateLabel(leadDate),
      stageThesis: stageThesisByIndex.get(stage.stageIndex) ?? clipText(stage.editorial.summary, 110),
    }
  })

  const graph = buildGraphLayout(stages)
  const heroFallback = buildTopicHeroFallbackV2({
    localizedTopicTitle,
    localizedTopicTitleEn,
    localizedFocusLabel,
    stages,
    latestResearchReport: researchSignals.latestResearchReport,
    pipelineOverview: researchSignals.pipelineOverview,
    sessionMemory: researchSignals.sessionMemory,
  })

  const summaryPanel: TopicSummaryPanel = {
    thesis: heroFallback.thesis,
    metaRows: [
      { label: 'language', value: topic.language },
      { label: 'status', value: topic.status },
      { label: 'createdAt', value: topic.createdAt.toISOString() },
      { label: 'updatedAt', value: topic.updatedAt.toISOString() },
    ],
    stats: [
      { label: 'stages', value: stages.length },
      { label: 'nodes', value: topic.nodes.length },
      { label: 'papers', value: displayPapers.length },
      { label: 'evidence', value: evidenceCount },
    ],
    actions: [
      { id: 'start', label: 'Start' },
      { id: 'edit', label: 'Edit' },
      { id: 'export', label: 'Export' },
      { id: 'delete', label: 'Delete' },
      { id: 'rebuild', label: 'Refresh' },
    ],
  }

  const narrativeSegments = buildTopicNarrativeSegmentsV2({
    topic,
    stages,
    latestResearchReport: researchSignals.latestResearchReport,
    pipelineOverview: researchSignals.pipelineOverview,
    sessionMemory: researchSignals.sessionMemory,
  })
  const closingFallback = buildTopicClosingFallbackV2({
    topic,
    stages,
    latestResearchReport: researchSignals.latestResearchReport,
    pipelineOverview: researchSignals.pipelineOverview,
    generationContext: researchSignals.generationContext,
    displayPaperCount: displayPapers.length,
  })
  const [heroResult, closingResult] = quick
    ? [
        { output: heroFallback, usedFallback: true },
        { output: closingFallback, usedFallback: true },
      ]
    : await Promise.all([
        generateTopicHero(topic.id, topic, stages, displayPapers.length),
        generateTopicClosing(topic.id, topic, stages, closingFallback, displayPapers.length),
      ])

  summaryPanel.thesis = sanitizeTopicUserFacingSentence(
    sanitizeString(heroResult.output.thesis, heroFallback.thesis),
    heroFallback.thesis,
    180,
  )

  const resources = [
    ...stages.slice(0, 2).map((stage) => ({
      id: `stage:${stage.stageIndex}`,
      kind: 'stage' as const,
      title: stage.title,
      subtitle: stage.titleEn,
      description: sanitizeTopicUserFacingSentence(stage.editorial.summary, '', 180),
      route: `/topic/${topic.id}?anchor=stage:${stage.stageIndex}`,
      anchorId: `stage:${stage.stageIndex}`,
    })),
    ...stages
      .flatMap((stage) => stage.nodes.slice(0, 1))
      .slice(0, 2)
      .map((node) => ({
        id: `node:${node.nodeId}`,
        kind: 'node' as const,
        title: node.title,
        subtitle: node.titleEn,
        description: sanitizeTopicUserFacingSentence(node.editorial.digest, node.summary, 180),
        route: node.route,
        anchorId: node.anchorId,
      })),
    ...papers.slice(0, 2).map((paper) => ({
      id: `paper:${paper.paperId}`,
      kind: 'paper' as const,
      title: paper.title,
      subtitle: paper.titleEn,
      description: sanitizeTopicUserFacingSentence(paper.explanation, paper.summary, 180),
      route: paper.route,
      anchorId: paper.anchorId,
    })),
  ]

  const resolvedHero = {
    kicker: sanitizeString(heroResult.output.kicker, heroFallback.kicker),
    title: sanitizeString(heroResult.output.title, heroFallback.title),
    standfirst: sanitizeTopicUserFacingSentence(
      sanitizeString(heroResult.output.standfirst, heroFallback.standfirst),
      heroFallback.standfirst,
      220,
    ),
    strapline: sanitizeString(heroResult.output.strapline, heroFallback.strapline),
  }

  const generationState: TopicViewModel['generationState'] = {
    hero: quick || heroResult.usedFallback ? 'pending' : 'ready',
    stageTimeline: quick || stageGenerationResults.some((result) => result.usedFallback) ? 'pending' : 'ready',
    nodeCards: quick || nodeGenerationResults.some((result) => result.usedFallback) ? 'pending' : 'ready',
    closing: quick || closingResult.usedFallback ? 'pending' : 'ready',
  }

  const resolvedClosingEditorial: TopicClosingEditorial = {
    title: sanitizeString(closingResult.output.title, closingFallback.title),
    paragraphs: sanitizeTopicUserFacingParagraphs(
      Array.isArray(closingResult.output.paragraphs)
        ? closingResult.output.paragraphs
        : [],
      closingFallback.paragraphs,
      3,
      220,
    ),
    reviewerNote: sanitizeString(closingResult.output.reviewerNote, closingFallback.reviewerNote),
  }

  return {
    schemaVersion: TOPIC_VIEW_MODEL_SCHEMA,
    topicId: topic.id,
    title: localizedTopicTitle,
    titleEn: localizedTopicTitleEn,
    subtitle: localizedFocusLabel,
    focusLabel: localizedFocusLabel,
    summary: localizedSummary,
    description: localizedDescription,
    language: topic.language,
    status: topic.status,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    generatedAt: new Date().toISOString(),
    localization,
    hero: resolvedHero,
    stageConfig: {
      windowMonths: stageWindowMonths,
      defaultWindowMonths: DEFAULT_STAGE_WINDOW_MONTHS,
      minWindowMonths: MIN_STAGE_WINDOW_MONTHS,
      maxWindowMonths: MAX_STAGE_WINDOW_MONTHS,
      adjustable: true,
    },
    summaryPanel,
    stats: {
      stageCount: stages.length,
      nodeCount: topic.nodes.length,
      paperCount: displayPapers.length,
      evidenceCount,
    },
    timeline: {
      stages: timelineStages,
    },
    graph,
    generationState,
    stages,
    papers,
    narrativeArticle:
      sanitizeTopicUserFacingParagraphs(
        narrativeSegments,
        [resolvedHero.standfirst],
        3,
        220,
      ).join('\n\n'),
    closingEditorial: resolvedClosingEditorial,
    resources,
    chatContext: {
      suggestedQuestions: uniqueStrings(
        buildTopicSuggestedQuestionsV2({
          topic,
          latestResearchReport: researchSignals.latestResearchReport,
          pipelineOverview: researchSignals.pipelineOverview,
          sessionMemory: researchSignals.sessionMemory,
        }).filter((item) => !looksLikeTopicMapCardNoise(item) && !looksLikeTopicProcessLeak(item)),
        4,
        180,
      ),
    },
  }
}

async function persistTopicArtifact(
  topicId: string,
  viewModel: TopicViewModel,
  fingerprint: string,
  options?: TopicViewModelBuildOptions,
) {
  const stageWindowMonths = resolveStageWindowMonths(options?.stageWindowMonths)
  const payload: TopicArtifactRecord = {
    schemaVersion: 'topic-artifact-v1',
    topicId,
    fingerprint,
    updatedAt: new Date().toISOString(),
    viewModel,
  }

  await prisma.systemConfig.upsert({
    where: { key: topicArtifactKey(topicId, stageWindowMonths) },
    update: { value: JSON.stringify(payload) },
    create: {
      key: topicArtifactKey(topicId, stageWindowMonths),
      value: JSON.stringify(payload),
    },
  })
}

function queueTopicArtifactRebuild(topicId: string, options?: TopicViewModelBuildOptions) {
  const stageWindowMonths = resolveStageWindowMonths(options?.stageWindowMonths)
  const queueKey = topicArtifactKey(topicId, stageWindowMonths)
  const existing = topicArtifactBuildQueue.get(queueKey)
  if (existing) return existing

  const job = (async () => {
    try {
      const rebuilt = await buildTopicViewModel(topicId, { stageWindowMonths })
      await persistTopicArtifact(
        topicId,
        rebuilt,
        await buildTopicArtifactFingerprint(topicId, { stageWindowMonths }),
        { stageWindowMonths },
      )
      return rebuilt
    } finally {
      topicArtifactBuildQueue.delete(queueKey)
    }
  })()

  topicArtifactBuildQueue.set(queueKey, job)
  return job
}

function buildDeferredTopicArtifactFingerprint(fingerprint: string | null, topicId: string) {
  return fingerprint ? `quick:${fingerprint}` : `quick:${topicId}:${Date.now()}`
}

export async function getTopicViewModel(
  topicId: string,
  options?: TopicViewModelBuildOptions,
): Promise<TopicViewModel> {
  const stageWindowMonths = await resolveTopicStageWindowMonths(topicId, options?.stageWindowMonths)
  const artifactRecord = await prisma.systemConfig.findUnique({
    where: { key: topicArtifactKey(topicId, stageWindowMonths) },
  })

  if (artifactRecord) {
    try {
      const parsed = JSON.parse(artifactRecord.value) as TopicArtifactRecord | TopicViewModel
      const cachedFingerprint = 'fingerprint' in parsed ? parsed.fingerprint : null
      const cachedViewModel = 'viewModel' in parsed ? parsed.viewModel : parsed
      const hasDates =
        typeof cachedViewModel.createdAt === 'string' &&
        typeof cachedViewModel.updatedAt === 'string' &&
        !Number.isNaN(Date.parse(cachedViewModel.createdAt)) &&
        !Number.isNaN(Date.parse(cachedViewModel.updatedAt))

      if (cachedViewModel.schemaVersion === TOPIC_VIEW_MODEL_SCHEMA && hasDates) {
        const fingerprint =
          cachedFingerprint && 'viewModel' in parsed
            ? await buildTopicArtifactFingerprint(topicId, { stageWindowMonths })
            : null

        if (cachedFingerprint && cachedFingerprint === fingerprint) {
          return ensureTopicGraphLanes(cachedViewModel)
        }

        const quickViewModel = await buildTopicViewModel(topicId, { quick: true, stageWindowMonths })
        await persistTopicArtifact(
          topicId,
          quickViewModel,
          buildDeferredTopicArtifactFingerprint(fingerprint, topicId),
          { stageWindowMonths },
        )
        if (!DEFERRED_TOPIC_ARTIFACTS_DISABLED) {
          void queueTopicArtifactRebuild(topicId, { stageWindowMonths }).catch((error) => {
            if (error instanceof AppError && error.statusCode === 404) {
              return
            }

            logger.warn('Deferred topic artifact rebuild failed while serving quick topic view model.', {
              topicId,
              error,
            })
          })
        }
        return ensureTopicGraphLanes(quickViewModel)
      }
    } catch (error) {
      logger.warn('Failed to parse cached topic artifact, rebuilding.', { topicId, error })
    }
  }

  if (!DEFERRED_TOPIC_ARTIFACTS_DISABLED) {
    void queueTopicArtifactRebuild(topicId, { stageWindowMonths }).catch((error) => {
      if (error instanceof AppError && error.statusCode === 404) {
        return
      }

      logger.warn('Deferred topic artifact rebuild failed while serving uncached topic view model.', {
        topicId,
        error,
      })
    })
  }
  return buildTopicViewModel(topicId, { quick: true, stageWindowMonths })
}

export async function rebuildTopicViewModel(
  topicId: string,
  options?: TopicViewModelBuildOptions,
) {
  const stageWindowMonths = await resolveTopicStageWindowMonths(topicId, options?.stageWindowMonths)
  const rebuilt = await buildTopicViewModel(topicId, { stageWindowMonths })
  await persistTopicArtifact(
    topicId,
    rebuilt,
    await buildTopicArtifactFingerprint(topicId, { stageWindowMonths }),
    { stageWindowMonths },
  )
  return rebuilt
}

export async function refreshTopicViewModelSnapshot(
  topicId: string,
  options: { mode?: 'full' | 'quick' | 'deferred'; stageWindowMonths?: number } = {},
) {
  const mode = options.mode ?? 'full'
  const stageWindowMonths = await resolveTopicStageWindowMonths(topicId, options.stageWindowMonths)

  if (mode === 'full') {
    return rebuildTopicViewModel(topicId, { stageWindowMonths })
  }

  const [quickViewModel, fingerprint] = await Promise.all([
    buildTopicViewModel(topicId, { quick: true, stageWindowMonths }),
    buildTopicArtifactFingerprint(topicId, { stageWindowMonths }),
  ])

  await persistTopicArtifact(
    topicId,
    quickViewModel,
    buildDeferredTopicArtifactFingerprint(fingerprint, topicId),
    { stageWindowMonths },
  )

  if (mode === 'deferred') {
    void queueTopicArtifactRebuild(topicId, { stageWindowMonths }).catch((error) => {
      if (error instanceof AppError && error.statusCode === 404) {
        return
      }
      logger.warn('Deferred topic artifact rebuild failed.', { topicId, error })
    })
  }

  return quickViewModel
}

function buildTopicScopeChunks(
  topic: TopicChatCatalogSource,
): TopicCorpusChunk[] {
  const displayPapers = selectTopicPapersByNodeOrder<
    TopicChatCatalogSourcePaper,
    TopicChatCatalogSource
  >(topic)
  const chunks: TopicCorpusChunk[] = []

  for (const node of topic.nodes) {
    chunks.push({
      anchorId: `node:${node.id}`,
      type: 'node',
      route: nodeRoute(node.id),
      label: node.nodeLabel,
      quote: clipText(node.nodeSummary),
      content: `${node.nodeSummary}\n${node.nodeExplanation ?? ''}`,
    })
  }

  for (const paper of displayPapers) {
    chunks.push({
      anchorId: `paper:${paper.id}`,
      type: 'paper',
      route: paperRoute(paper.id),
      label: paper.titleZh || paper.title,
      quote: clipText(paper.summary),
      content: `${paper.summary}\n${paper.explanation ?? ''}`,
    })
  }

  return chunks
}

function buildTopicCorpusFromTopic(
  topic: Awaited<ReturnType<typeof loadTopicForArtifact>>,
): TopicCorpusChunk[] {
  const displayPapers = selectTopicDisplayPapers(topic)
  const chunks = buildTopicScopeChunks(topic)

  for (const paper of displayPapers) {

    for (const section of paper.sections) {
      chunks.push({
        anchorId: `section:${section.id}`,
        type: 'section',
        route: paperRoute(paper.id, `section:${section.id}`),
        label: `${paper.titleZh || paper.title} / ${section.editorialTitle || section.sourceSectionTitle}`,
        quote: clipText(section.paragraphs),
        content: section.paragraphs,
      })
    }

    for (const figure of paper.figures) {
      chunks.push({
        anchorId: `figure:${figure.id}`,
        type: 'figure',
        route: topicEvidenceRoute(topic.id, `figure:${figure.id}`),
        label: `${paper.titleZh || paper.title} / Figure ${figure.number}`,
        quote: clipText(figure.caption),
        content: `${figure.caption}\n${figure.analysis ?? ''}`,
      })
    }

    for (const table of paper.tables) {
      chunks.push({
        anchorId: `table:${table.id}`,
        type: 'table',
        route: topicEvidenceRoute(topic.id, `table:${table.id}`),
        label: `${paper.titleZh || paper.title} / Table ${table.number}`,
        quote: clipText(table.caption),
        content: `${table.caption}\n${table.rawText}`,
      })
    }

    for (const formula of paper.formulas) {
      chunks.push({
        anchorId: `formula:${formula.id}`,
        type: 'formula',
        route: topicEvidenceRoute(topic.id, `formula:${formula.id}`),
        label: `${paper.titleZh || paper.title} / Formula ${formula.number}`,
        quote: clipText(formula.rawText || formula.latex),
        content: `${formula.latex}\n${formula.rawText}`,
      })
    }
  }

  return chunks
}

async function buildTopicCorpus(topicId: string): Promise<TopicCorpusChunk[]> {
  const topic = await loadTopicForArtifact(topicId)
  return buildTopicCorpusFromTopic(topic)
}

function buildTopicChatCatalog(
  topic: TopicChatCatalogSource,
): TopicChatCatalog {
  const displayPapers = selectTopicPapersByNodeOrder<
    TopicChatCatalogSourcePaper,
    TopicChatCatalogSource
  >(topic)
  const stageTitleByIndex = new Map(topic.stages.map((stage) => [stage.order, stage.name]))

  const papers = displayPapers.map((paper) => {
    const linkedNode =
      topic.nodes.find(
        (node) =>
          node.primaryPaperId === paper.id ||
          node.papers.some((paperLink) => paperLink.paperId === paper.id),
      ) ?? null
    const aliases = Array.from(
      new Set(
        [
          paper.titleZh || paper.title,
          paper.title,
          paper.titleEn ?? '',
          ...extractAsciiAliases(paper.titleZh || paper.title),
          ...extractAsciiAliases(paper.titleEn),
          ...extractAsciiAliases(paper.title),
        ]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    )

    return {
      paperId: paper.id,
      anchorId: `paper:${paper.id}`,
      route: paperRoute(paper.id),
      title: paper.titleZh || paper.title,
      titleEn: paper.titleEn ?? paper.title,
      summary: paper.summary,
      explanation: paper.explanation ?? '',
      aliases,
      stageIndex: linkedNode?.stageIndex ?? null,
      stageTitle:
        (typeof linkedNode?.stageIndex === 'number'
          ? stageTitleByIndex.get(linkedNode.stageIndex)
          : null) ?? '',
      nodeId: linkedNode?.id ?? null,
      nodeTitle: linkedNode?.nodeLabel ?? null,
      nodeSummary: linkedNode?.nodeSummary ?? '',
    } satisfies TopicChatCatalogPaper
  })

  return {
    topicId: topic.id,
    topicTitle: topic.nameZh,
    stageCount: topic.stages.length,
    nodeCount: topic.nodes.length,
    paperCount: papers.length,
    papers,
  }
}

function detectTopicCountMetric(question: string) {
  if (!COUNT_QUERY_HINT.test(question)) return null
  if (PAPER_QUERY_HINT.test(question)) return 'papers' as const
  if (NODE_QUERY_HINT.test(question)) return 'nodes' as const
  if (STAGE_QUERY_HINT.test(question)) return 'stages' as const
  return null
}

function buildCatalogCitation(
  paper: TopicChatCatalogPaper,
  kind: 'paper' | 'node' = 'paper',
): TopicCitationRef | null {
  if (kind === 'node' && paper.nodeId && paper.nodeTitle) {
    return {
      anchorId: `node:${paper.nodeId}`,
      type: 'node',
      route: nodeRoute(paper.nodeId),
      label: paper.nodeTitle,
      quote: clipText(paper.nodeSummary || paper.explanation || paper.summary, 160),
    }
  }

  return {
    anchorId: paper.anchorId,
    type: 'paper',
    route: paper.route,
    label: paper.title,
    quote: clipText(paper.explanation || paper.summary, 160),
  }
}

function buildDirectSuggestedActions(catalog: TopicChatCatalog): SuggestedAction[] {
  return catalog.papers.slice(0, 3).map((paper) => ({
    label: `查看 ${paper.title}`,
    action: 'navigate',
    targetId: paper.anchorId,
    description: clipText(paper.explanation || paper.summary, 100),
  }))
}

function buildTopicChatChunkCitation(chunk: TopicCorpusChunk): TopicCitationRef {
  return {
    anchorId: chunk.anchorId,
    type: chunk.type,
    route: chunk.route,
    label: chunk.label,
    quote: chunk.quote,
  }
}

function resolveTopicGuidanceScope(args: {
  question: string
  selected: TopicCorpusChunk[]
  catalog: TopicChatCatalog
}): TopicGuidanceScopeResolution {
  const selectedCitations = uniqueByAnchor(
    args.selected.slice(0, 2).map((chunk) => buildTopicChatChunkCitation(chunk)),
  )
  const selectedLead = args.selected[0] ?? null

  if (selectedLead?.type === 'node') {
    return {
      scopeType: 'node',
      scopeId: selectedLead.anchorId.slice('node:'.length),
      scopeLabel: selectedLead.label,
      citations: selectedCitations,
    }
  }

  if (selectedLead?.type === 'paper') {
    return {
      scopeType: 'paper',
      scopeId: selectedLead.anchorId.slice('paper:'.length),
      scopeLabel: selectedLead.label,
      citations: selectedCitations,
    }
  }

  if (
    selectedLead &&
    (selectedLead.type === 'figure' ||
      selectedLead.type === 'table' ||
      selectedLead.type === 'formula' ||
      selectedLead.type === 'section')
  ) {
    return {
      scopeType: 'evidence',
      scopeId: selectedLead.anchorId,
      scopeLabel: selectedLead.label,
      citations: selectedCitations,
    }
  }

  const stageMatch =
    args.question.match(/第\s*(\d+)\s*阶段/u) ??
    args.question.match(/\bstage\s+(\d+)\b/iu)
  const stageIndex = stageMatch?.[1] ? Number(stageMatch[1]) : null
  if (stageIndex && Number.isFinite(stageIndex)) {
    const stagePaper = args.catalog.papers.find((paper) => paper.stageIndex === stageIndex) ?? null

    return {
      scopeType: 'stage',
      scopeId: String(stageIndex),
      scopeLabel: stagePaper?.stageTitle
        ? `第 ${stageIndex} 阶段「${stagePaper.stageTitle}」`
        : `第 ${stageIndex} 阶段`,
      citations: stagePaper
        ? uniqueByAnchor(
            [buildCatalogCitation(stagePaper)].filter((item): item is TopicCitationRef => Boolean(item)),
          )
        : [],
    }
  }

  const matchedPaper = matchTopicPaperFromQuestion(args.question, args.catalog)
  if (matchedPaper?.nodeId && matchedPaper.nodeTitle && /节点|node/u.test(args.question)) {
    return {
      scopeType: 'node',
      scopeId: matchedPaper.nodeId,
      scopeLabel: matchedPaper.nodeTitle,
      citations: uniqueByAnchor(
        [
          buildCatalogCitation(matchedPaper, 'node'),
          buildCatalogCitation(matchedPaper),
        ].filter((item): item is TopicCitationRef => Boolean(item)),
      ),
    }
  }

  if (matchedPaper) {
    return {
      scopeType: 'paper',
      scopeId: matchedPaper.paperId,
      scopeLabel: matchedPaper.title,
      citations: uniqueByAnchor(
        [buildCatalogCitation(matchedPaper)].filter((item): item is TopicCitationRef => Boolean(item)),
      ),
    }
  }

  return {
    scopeType: 'topic',
    scopeId: null,
    scopeLabel: args.catalog.topicTitle,
    citations: selectedCitations,
  }
}

function buildGuidanceSuggestedActions(args: {
  directive: TopicGuidanceDirective
}): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  if (args.directive.promptHint) {
    actions.push({
      label: args.directive.promptHint,
      action: 'summarize',
      description: args.directive.effectSummary,
    })
  }

  if (args.directive.directiveType === 'challenge') {
    actions.push({
      label: `请解释你为什么仍然保留当前关于${args.directive.scopeLabel}的判断`,
      action: 'explain',
      description: args.directive.effectSummary,
    })
  } else if (args.directive.directiveType === 'focus') {
    actions.push({
      label: `请给出围绕${args.directive.scopeLabel}的下一步研究计划`,
      action: 'summarize',
      description: args.directive.effectSummary,
    })
  } else if (args.directive.directiveType === 'style') {
    actions.push({
      label: '请示范你接下来会如何按这条风格要求继续写',
      action: 'summarize',
      description: args.directive.effectSummary,
    })
  }

  return actions.slice(0, 3)
}

function matchTopicPaperFromQuestion(
  question: string,
  catalog: TopicChatCatalog,
) {
  const normalizedQuestion = normalizeLookupText(question)
  let bestMatch: { paper: TopicChatCatalogPaper; score: number } | null = null

  for (const paper of catalog.papers) {
    for (const alias of paper.aliases) {
      const normalizedAlias = normalizeLookupText(alias)
      if (!normalizedAlias) continue

      let score = 0
      if (normalizedQuestion.includes(normalizedAlias)) {
        score = normalizedAlias.length + 24
      } else if (
        alias.length >= 3 &&
        question.toLowerCase().includes(alias.toLowerCase())
      ) {
        score = alias.length + 18
      }

      if (!score) continue
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { paper, score }
      }
    }
  }

  return bestMatch?.paper ?? null
}

function extractExplicitPaperCandidate(question: string) {
  const quotedCandidate =
    question.match(/《([^》]{2,80})》/u)?.[1] ??
    question.match(/“([^”]{2,80})”/u)?.[1] ??
    question.match(/"([^"]{2,80})"/u)?.[1] ??
    null

  if (quotedCandidate) return quotedCandidate.trim()

  const prefixedCandidate =
    question.match(/([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,4})\s*(?:这篇论文|这篇文章|paper|论文|文章)/iu)?.[1] ??
    null

  if (prefixedCandidate) return prefixedCandidate.trim()

  const asciiCandidates = question.match(/[A-Za-z][A-Za-z0-9-]{2,}(?:\s+[A-Za-z][A-Za-z0-9-]{2,}){0,4}/gu) ?? []
  const rankedAsciiCandidate = [...asciiCandidates]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => candidate.includes('-') || /[A-Z]/u.test(candidate))

  return rankedAsciiCandidate?.trim() ?? null
}

function looksLikeSpecificPaperQuestion(question: string) {
  return /(paper|papers|论文|文章|扮演什么角色|什么角色|属于哪一阶段|属于哪个节点|在哪个节点|where does|what role)/iu.test(
    question,
  )
}

function buildDirectTopicChatResponse(
  question: string,
  catalog: TopicChatCatalog,
): TopicChatResponse | null {
  const countMetric = detectTopicCountMetric(question)
  if (countMetric) {
    const metricValue =
      countMetric === 'papers'
        ? catalog.paperCount
        : countMetric === 'nodes'
          ? catalog.nodeCount
          : catalog.stageCount
    const metricLabel =
      countMetric === 'papers' ? '篇论文' : countMetric === 'nodes' ? '个节点' : '个阶段'
    const stageLead = catalog.papers[0]
    const latestPaper = catalog.papers[catalog.papers.length - 1]

    return {
      messageId: `msg_${Date.now()}`,
      answer: `当前主题主线展示 ${metricValue} ${metricLabel}。主线从${stageLead?.title ?? '早期节点'}一路推进到${latestPaper?.title ?? '当前阶段'}，这就是现在主题页上正在被持续打磨的核心研究链。`,
      citations: uniqueByAnchor(
        [stageLead, latestPaper]
          .map((paper) => (paper ? buildCatalogCitation(paper) : null))
          .filter((citation): citation is TopicCitationRef => Boolean(citation)),
      ),
      suggestedActions: buildDirectSuggestedActions(catalog),
    }
  }

  const matchedPaper = matchTopicPaperFromQuestion(question, catalog)
  if (matchedPaper) {
    const stageLabel =
      matchedPaper.stageIndex && matchedPaper.stageTitle
        ? `第 ${matchedPaper.stageIndex} 阶段「${matchedPaper.stageTitle}」`
        : '当前主题主线'
    const nodeLabel = matchedPaper.nodeTitle ? `节点「${matchedPaper.nodeTitle}」` : '当前主线叙事'

    return {
      messageId: `msg_${Date.now()}`,
      answer: `${matchedPaper.title} 在当前主题里已经被纳入 ${stageLabel} 的 ${nodeLabel}。它承担的角色是：${clipText(
        matchedPaper.explanation || matchedPaper.summary,
        180,
      )}${matchedPaper.nodeSummary ? ` 更具体地说，这个节点目前把它概括为：${clipText(matchedPaper.nodeSummary, 160)}` : ''}`,
      citations: uniqueByAnchor(
        [
          buildCatalogCitation(matchedPaper, 'node'),
          buildCatalogCitation(matchedPaper, 'paper'),
        ].filter((citation): citation is TopicCitationRef => Boolean(citation)),
      ),
      suggestedActions: [
        matchedPaper.nodeId
          ? {
              label: `查看 ${matchedPaper.nodeTitle}`,
              action: 'navigate',
              targetId: `node:${matchedPaper.nodeId}`,
              description: clipText(matchedPaper.nodeSummary || matchedPaper.summary, 100),
            }
          : {
              label: `查看 ${matchedPaper.title}`,
              action: 'navigate',
              targetId: matchedPaper.anchorId,
              description: clipText(matchedPaper.summary, 100),
            },
      ],
    }
  }

  const explicitCandidate = extractExplicitPaperCandidate(question)
  if (explicitCandidate && looksLikeSpecificPaperQuestion(question)) {
    const paperListLead = catalog.papers.slice(0, 5).map((paper) => paper.title).join('、')

    return {
      messageId: `msg_${Date.now()}`,
      answer: `${explicitCandidate} 不在当前主题主线展示的 ${catalog.paperCount} 篇论文里，所以我现在不能把它解释成这条主线中的既有角色。当前主线收录的是 ${paperListLead}。如果后续持续研究发现它与这条演进链存在直接证据联系，再把它补成新节点或分支会更严谨。`,
      citations: [],
      suggestedActions: [
        {
          label: '请先概览当前主线论文',
          action: 'summarize',
          description: '回看这条主题主线当前已经纳入的论文与节点分工。',
        },
        ...buildDirectSuggestedActions(catalog).slice(0, 2),
      ],
    }
  }

  return null
}

function serializePromptBlock(value: unknown, maxLength = 2400) {
  const serialized = JSON.stringify(value ?? null, null, 2)
  if (serialized.length <= maxLength) return serialized
  return `${serialized.slice(0, Math.max(0, maxLength - 3))}...`
}

function buildPromptList(title: string, items: string[]) {
  if (items.length === 0) return `${title}：暂无`
  return `${title}：\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
}

function looksLikeTopicChatOperationalNoise(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return false

  return [
    '持续研究回执',
    '执行层故障',
    'args.orchestration',
    '17篇关联论文',
    '数据污染',
    '主题id识别错误',
    '编排动作迭代器',
    'internal fault',
  ].some((marker) => normalized.toLowerCase().includes(marker.toLowerCase()))
}

function compactTopicChatResearchReport(report: ResearchRunReport | null) {
  if (!report) return null

  const hasNoResearchYield =
    report.successfulRuns === 0 &&
    report.discoveredPapers === 0 &&
    report.admittedPapers === 0 &&
    report.generatedContents === 0
  const isOperationalFailure =
    report.failedRuns > 0 &&
    (report.status === 'failed' || report.status === 'paused')

  if (hasNoResearchYield && isOperationalFailure) {
    return null
  }

  return {
    ...report,
    latestStageSummary: sanitizeResearchFacingSummary(report.latestStageSummary) || null,
    headline: clipText(report.headline, 120),
    dek: clipText(report.dek, 180),
    summary: clipText(report.summary, 240),
    paragraphs: report.paragraphs.slice(0, 2).map((item) => clipText(item, 220)),
    keyMoves: report.keyMoves.slice(0, 4).map((item) => clipText(item, 180)),
    openQuestions: report.openQuestions.slice(0, 4).map((item) => clipText(item, 180)),
  }
}

function refreshTopicChatResearchReport(args: {
  report: ReturnType<typeof compactTopicChatResearchReport>
  world: ReturnType<typeof compactTopicChatResearchWorld>
  sessionSummary: Awaited<ReturnType<typeof retrieveTopicSessionMemoryContext>>['summary']
  recentEvents: Awaited<ReturnType<typeof retrieveTopicSessionMemoryContext>>['recentEvents']
}) {
  const { report, world, sessionSummary, recentEvents } = args
  if (!report) return null

  const reportLooksStale =
    report.status === 'running' &&
    report.successfulRuns === 0 &&
    report.discoveredPapers === 0 &&
    report.admittedPapers === 0 &&
    report.generatedContents === 0
  const worldSignals =
    (world?.counts.papers ?? 0) > 0 ||
    (world?.counts.nodes ?? 0) > 0 ||
    Boolean(world?.summary.currentFocus) ||
    Boolean(world?.summary.continuity)
  const sessionSignals =
    Boolean(sessionSummary.currentFocus) ||
    Boolean(sessionSummary.lastResearchMove) ||
    Boolean(sessionSummary.continuity) ||
    recentEvents.length > 0

  if (!reportLooksStale || (!worldSignals && !sessionSignals)) {
    return report
  }

  const synthesizedHeadline =
    pickDistinctReadableTopicLine(
      [
        sessionSummary.currentFocus,
        sessionSummary.lastResearchMove,
        world?.summary.currentFocus,
        report.headline,
        report.summary,
      ],
      [],
      120,
    ) || report.headline
  const synthesizedSummary =
    pickDistinctReadableTopicLine(
      [
        sessionSummary.lastResearchMove,
        sessionSummary.currentFocus,
        sessionSummary.continuity,
        world?.summary.currentFocus,
        world?.summary.continuity,
        report.summary,
      ],
      [],
      220,
    ) || report.summary
  const synthesizedStageSummary =
    pickDistinctReadableTopicLine(
      [
        sessionSummary.lastResearchMove,
        sessionSummary.currentFocus,
        world?.summary.currentFocus,
        report.latestStageSummary,
        report.summary,
      ],
      [],
      220,
    ) || report.latestStageSummary || report.summary

  return {
    ...report,
    headline: clipText(synthesizedHeadline, 120),
    summary: clipText(synthesizedSummary, 240),
    latestStageSummary: clipText(synthesizedStageSummary, 220) || null,
    discoveredPapers: Math.max(report.discoveredPapers, world?.counts.papers ?? 0),
    admittedPapers: Math.max(report.admittedPapers, world?.counts.papers ?? 0),
    generatedContents: Math.max(report.generatedContents, world?.counts.nodes ?? 0),
  }
}

function compactTopicChatResearchWorld(world: TopicResearchWorld | null) {
  if (!world) return null

  return {
    summary: {
      thesis: clipText(world.summary.thesis, 180),
      currentFocus: clipText(world.summary.currentFocus, 180),
      continuity: clipText(world.summary.continuity, 180),
      dominantQuestion: clipText(world.summary.dominantQuestion, 180),
      dominantCritique: clipText(world.summary.dominantCritique, 180),
      agendaHeadline: clipText(world.summary.agendaHeadline, 180),
      maturity: world.summary.maturity,
    },
    counts: {
      stages: world.stages.length,
      nodes: world.nodes.length,
      papers: world.papers.length,
    },
    claims: world.claims.slice(0, 4).map((claim) => ({
      scope: claim.scope,
      scopeId: claim.scopeId,
      statement: clipText(claim.statement, 180),
      confidence: claim.confidence,
      status: claim.status,
    })),
    highlights: world.highlights.slice(0, 4).map((highlight) => ({
      scope: highlight.scope,
      scopeId: highlight.scopeId,
      title: clipText(highlight.title, 180),
      detail: clipText(highlight.detail, 180),
    })),
    questions: world.questions.slice(0, 4).map((question) => ({
      scope: question.scope,
      scopeId: question.scopeId,
      question: clipText(question.question, 180),
      priority: question.priority,
    })),
    critiques: world.critiques.slice(0, 3).map((critique) => ({
      targetType: critique.targetType,
      targetId: critique.targetId,
      summary: clipText(critique.summary, 180),
      severity: critique.severity,
    })),
    agenda: world.agenda.slice(0, 4).map((item) => ({
      kind: item.kind,
      targetType: item.targetType,
      targetId: item.targetId,
      title: clipText(item.title, 180),
      rationale: clipText(item.rationale, 180),
      suggestedPrompt: clipText(item.suggestedPrompt, 200),
    })),
  }
}

function sanitizeTopicChatSessionSummary(summary: Awaited<ReturnType<typeof retrieveTopicSessionMemoryContext>>['summary']) {
  return {
    ...summary,
    currentFocus: looksLikeTopicChatOperationalNoise(summary.currentFocus) ? '' : summary.currentFocus,
    continuity: looksLikeTopicChatOperationalNoise(summary.continuity) ? '' : summary.continuity,
    establishedJudgments: summary.establishedJudgments.filter((item) => !looksLikeTopicChatOperationalNoise(item)),
    researchMomentum: summary.researchMomentum.filter((item) => !looksLikeTopicChatOperationalNoise(item)),
    lastResearchMove: looksLikeTopicChatOperationalNoise(summary.lastResearchMove)
      ? ''
      : summary.lastResearchMove,
  }
}

function filterTopicChatSessionEvents(
  events: Awaited<ReturnType<typeof retrieveTopicSessionMemoryContext>>['recentEvents'],
) {
  return events.filter((event) => {
    const text = [event.headline, event.summary, event.detail ?? ''].join(' ')
    return !looksLikeTopicChatOperationalNoise(text)
  })
}

async function buildTopicChatAuthorContext(topicId: string, question: string) {
  const [memory, latestResearchReport, sessionMemory, world, guidance] = await Promise.all([
    loadTopicGenerationMemory(topicId),
    loadTopicResearchReport(topicId),
    retrieveTopicSessionMemoryContext(topicId, {
      query: question,
      recentLimit: 5,
    }),
    syncTopicResearchWorldSnapshot(topicId),
    loadTopicGuidanceLedger(topicId),
  ])
  const context = await collectTopicGenerationContext(topicId, memory, {
    subjectType: 'topic',
    limit: 10,
  })
  const compactResearchReport = compactTopicChatResearchReport(latestResearchReport)
  const sanitizedSessionSummary = sanitizeTopicChatSessionSummary(sessionMemory.summary)
  const recentSessionEvents = filterTopicChatSessionEvents(sessionMemory.recentEvents)
  const recalledSessionEvents = filterTopicChatSessionEvents(sessionMemory.recalledEvents)
  const compactWorld = compactTopicChatResearchWorld(world)
  const refreshedResearchReport = refreshTopicChatResearchReport({
    report: compactResearchReport,
    world: compactWorld,
    sessionSummary: sanitizedSessionSummary,
    recentEvents: recentSessionEvents,
  })
  const cognitiveMemory = buildTopicCognitiveMemory({
    generationContext: context,
    sessionMemory: {
      ...sessionMemory,
      summary: sanitizedSessionSummary,
      recentEvents: recentSessionEvents,
      recalledEvents: recalledSessionEvents,
    },
    guidance,
    report: latestResearchReport,
    world,
  })

  return {
    topicSnapshot: context.topicSnapshot,
    world,
    judgmentLedger: uniqueStrings(
      [
        ...context.judgmentLedger,
        ...(compactWorld?.claims.map((claim) => claim.statement) ?? []),
        ...(compactWorld?.highlights.map((highlight) => highlight.title) ?? []),
        compactWorld?.summary.thesis,
      ],
      6,
      180,
    ),
    openQuestions: uniqueStrings(
      [
        ...context.openQuestions,
        ...(compactWorld?.questions.map((item) => item.question) ?? []),
        compactWorld?.summary.dominantQuestion,
      ],
      5,
      180,
    ),
    reviewerWatchpoints: uniqueStrings(
      [
        ...context.reviewerWatchpoints,
        ...(compactWorld?.critiques.map((critique) => critique.summary) ?? []),
        compactWorld?.summary.dominantCritique,
      ],
      5,
      180,
    ),
    continuityThreads: uniqueStrings(
      [
        ...context.continuityThreads,
        compactWorld?.summary.continuity,
        compactWorld?.summary.currentFocus,
        compactWorld?.summary.agendaHeadline,
      ],
      5,
      180,
    ),
    latestResearchReport: refreshedResearchReport,
    sessionMemory: sanitizedSessionSummary,
    recentSessionEvents,
    recalledSessionEvents,
    cognitiveMemory,
    guidance,
  }
}

type TopicGuidanceAuthorContext = {
  world: Awaited<ReturnType<typeof syncTopicResearchWorldSnapshot>>
  sessionMemory: ReturnType<typeof sanitizeTopicChatSessionSummary>
  openQuestions: string[]
  reviewerWatchpoints: string[]
  continuityThreads: string[]
}

async function buildTopicGuidanceAuthorContext(
  topicId: string,
  question: string,
): Promise<TopicGuidanceAuthorContext> {
  const [latestResearchReport, sessionMemory, world] = await Promise.all([
    loadTopicResearchReport(topicId),
    retrieveTopicSessionMemoryContext(topicId, {
      query: question,
      recentLimit: 5,
    }),
    syncTopicResearchWorldSnapshot(topicId),
  ])

  const sanitizedSessionSummary = sanitizeTopicChatSessionSummary(sessionMemory.summary)
  const compactWorld = compactTopicChatResearchWorld(world)
  const compactResearchReport = compactTopicChatResearchReport(latestResearchReport)
  const refreshedResearchReport = refreshTopicChatResearchReport({
    report: compactResearchReport,
    world: compactWorld,
    sessionSummary: sanitizedSessionSummary,
    recentEvents: filterTopicChatSessionEvents(sessionMemory.recentEvents),
  })

  return {
    world,
    sessionMemory: sanitizedSessionSummary,
    openQuestions: uniqueStrings(
      [
        ...sanitizedSessionSummary.openQuestions,
        ...(compactWorld?.questions.map((item) => item.question) ?? []),
        compactWorld?.summary.dominantQuestion,
      ],
      5,
      180,
    ),
    reviewerWatchpoints: uniqueStrings(
      [
        refreshedResearchReport?.latestStageSummary,
        ...(compactWorld?.critiques.map((critique) => critique.summary) ?? []),
        compactWorld?.summary.dominantCritique,
      ],
      5,
      180,
    ),
    continuityThreads: uniqueStrings(
      [
        sanitizedSessionSummary.continuity,
        sanitizedSessionSummary.currentFocus,
        compactWorld?.summary.continuity,
        compactWorld?.summary.currentFocus,
        compactWorld?.summary.agendaHeadline,
      ],
      5,
      180,
    ),
  }
}

function buildTopicChatPrompt(
  question: string,
  chunks: TopicCorpusChunk[],
  authorContext: Awaited<ReturnType<typeof buildTopicChatAuthorContext>>,
) {
  const evidenceLines = chunks
    .map(
      (chunk, index) =>
        `${index + 1}. anchorId=${chunk.anchorId}\nlabel=${chunk.label}\nroute=${chunk.route}\nquote=${chunk.quote}\ncontent=${clipText(chunk.content, 600)}`,
    )
    .join('\n\n')

  return [
    '你是当前主题页的作者、编排者与讲解者，记得自己已经如何命名阶段、组织节点、归纳论文与证据。',
    '你和用户保持交流关系，不要求用户监督你；你的任务是把这条研究主线解释清楚、补足上下文，并诚实指出证据边界。',
    '你只能基于给定证据和当前主题记忆回答，不能编造不存在的结论、节点、论文关系和 anchorId。',
    '回答要像研究文章中的一段清晰解释：先直接回答，再说明它在主题主线中的位置，最后指出关键证据、边界或未决问题。',
    '如果证据不足，要明确说明不足，而不是用空泛套话补齐。',
    '请输出 JSON，格式为：',
    '{"answer":"...","citations":[{"anchorId":"...","label":"...","quote":"..."}],"suggestedActions":[{"label":"...","action":"summarize","targetId":"...","description":"..."}]}',
    'citations 最多 4 条，anchorId 只能从证据列表中选择。',
    '',
    '当前主题记忆快照：',
    serializePromptBlock(authorContext.topicSnapshot),
    '',
    buildPromptList('research world summary', [
      authorContext.world.summary.thesis,
      authorContext.world.summary.currentFocus,
      authorContext.world.summary.continuity,
      authorContext.world.summary.agendaHeadline,
    ]),
    '',
    buildPromptList(
      'established world claims',
      authorContext.world.claims.slice(0, 4).map((claim) => claim.statement),
    ),
    '',
    buildPromptList(
      'research highlights',
      authorContext.world.highlights.slice(0, 4).map((item) => `${item.title}: ${item.detail}`),
    ),
    '',
    buildPromptList('既有判断与阶段线索', authorContext.judgmentLedger),
    '',
    buildPromptList('连续性线索', authorContext.continuityThreads),
    '',
    buildPromptList('仍待继续追问的问题', authorContext.openQuestions),
    '',
    buildPromptList(
      'typed project memory',
      authorContext.cognitiveMemory.projectMemories
        .slice(0, 4)
        .map((item) => `${item.title}: ${item.summary}`),
    ),
    '',
    buildPromptList(
      'typed feedback memory',
      authorContext.cognitiveMemory.feedbackMemories
        .slice(0, 4)
        .map((item) => `${item.title}: ${item.summary}`),
    ),
    '',
    buildPromptList(
      'typed reference memory',
      authorContext.cognitiveMemory.referenceMemories
        .slice(0, 4)
        .map((item) => `${item.title}: ${item.summary}`),
    ),
    '',
    buildPromptList(
      'active world agenda',
      authorContext.world.agenda.slice(0, 4).map((item) => item.title),
    ),
    '',
    buildPromptList('编排时保留的审阅提醒', authorContext.reviewerWatchpoints),
    '',
    buildPromptList('主题会话记忆', [
      authorContext.sessionMemory.currentFocus,
      authorContext.sessionMemory.continuity,
      ...authorContext.sessionMemory.establishedJudgments,
      ...authorContext.sessionMemory.researchMomentum,
      authorContext.sessionMemory.lastResearchMove,
      authorContext.sessionMemory.lastUserIntent,
    ]),
    '',
    `用户问题：${question}`,
    '',
    '证据列表：',
    evidenceLines,
  ].join('\n')
}

function buildPromptStudioSystemPrompt(templateSystemPrompt: string, editorialPolicy: {
  identity: string
  mission: string
  reasoning: string
  style: string
  evidence: string
  industryLens: string
  continuity: string
}) {
  return [
    editorialPolicy.identity,
    'Global generation charter:',
    `Mission: ${editorialPolicy.mission}`,
    `Reasoning: ${editorialPolicy.reasoning}`,
    `Style: ${editorialPolicy.style}`,
    `Evidence: ${editorialPolicy.evidence}`,
    `Industry lens: ${editorialPolicy.industryLens}`,
    `Continuity: ${editorialPolicy.continuity}`,
    '',
    'Template-specific instruction:',
    templateSystemPrompt,
  ].join('\n')
}

async function buildPromptStudioTopicChatPrompt(
  request: ParsedTopicChatRequest,
  chunks: TopicCorpusChunk[],
  authorContext: Awaited<ReturnType<typeof buildTopicChatAuthorContext>>,
) {
  const runtime = await getGenerationRuntimeConfig()
  const language = runtime.defaultLanguage
  const template = await getPromptTemplateContent(PROMPT_TEMPLATE_IDS.TOPIC_CHAT, language)
  const editorialPolicy = runtime.editorialPolicies[language] ?? runtime.editorialPolicies.zh

  const topicSnapshotRecord =
    authorContext.topicSnapshot && typeof authorContext.topicSnapshot === 'object'
      ? (authorContext.topicSnapshot as Record<string, unknown>)
      : null
  const compactWorld = compactTopicChatResearchWorld(authorContext.world)
  const compactAuthorContext = {
    topic: {
      title: sanitizeString(topicSnapshotRecord?.title, ''),
      titleEn: sanitizeString(topicSnapshotRecord?.titleEn, ''),
      focusLabel: sanitizeString(topicSnapshotRecord?.focusLabel, ''),
      summary: clipText(sanitizeString(topicSnapshotRecord?.summary, ''), 220),
      stageCount:
        typeof topicSnapshotRecord?.stageCount === 'number' ? topicSnapshotRecord.stageCount : null,
      nodeCount:
        typeof topicSnapshotRecord?.nodeCount === 'number' ? topicSnapshotRecord.nodeCount : null,
      paperCount:
        typeof topicSnapshotRecord?.paperCount === 'number' ? topicSnapshotRecord.paperCount : null,
    },
    world: compactWorld,
    judgmentLedger: authorContext.judgmentLedger.slice(0, 4).map((item) => clipText(item, 180)),
    continuityThreads: authorContext.continuityThreads.slice(0, 4).map((item) => clipText(item, 180)),
    openQuestions: authorContext.openQuestions.slice(0, 3).map((item) => clipText(item, 180)),
    reviewerWatchpoints: authorContext.reviewerWatchpoints.slice(0, 3).map((item) => clipText(item, 180)),
    cognitiveMemory: {
      focus: clipText(authorContext.cognitiveMemory.focus, 180),
      continuity: clipText(authorContext.cognitiveMemory.continuity, 180),
      conversationContract: clipText(authorContext.cognitiveMemory.conversationContract, 180),
      projectMemories: authorContext.cognitiveMemory.projectMemories.slice(0, 4).map((item) => ({
        title: clipText(item.title, 80),
        summary: clipText(item.summary, 160),
        source: item.source,
      })),
      feedbackMemories: authorContext.cognitiveMemory.feedbackMemories.slice(0, 4).map((item) => ({
        title: clipText(item.title, 80),
        summary: clipText(item.summary, 160),
        source: item.source,
      })),
      referenceMemories: authorContext.cognitiveMemory.referenceMemories.slice(0, 4).map((item) => ({
        title: clipText(item.title, 80),
        summary: clipText(item.summary, 160),
        source: item.source,
      })),
    },
    sessionMemory: {
      currentFocus: clipText(authorContext.sessionMemory.currentFocus, 180),
      continuity: clipText(authorContext.sessionMemory.continuity, 180),
      establishedJudgments: authorContext.sessionMemory.establishedJudgments
        .slice(0, 4)
        .map((item) => clipText(item, 160)),
      openQuestions: authorContext.sessionMemory.openQuestions
        .slice(0, 4)
        .map((item) => clipText(item, 160)),
      researchMomentum: authorContext.sessionMemory.researchMomentum
        .slice(0, 4)
        .map((item) => clipText(item, 160)),
      conversationStyle: clipText(authorContext.sessionMemory.conversationStyle, 160),
      lastResearchMove: clipText(authorContext.sessionMemory.lastResearchMove, 160),
      lastUserIntent: clipText(authorContext.sessionMemory.lastUserIntent, 160),
    },
    recentSessionEvents: authorContext.recentSessionEvents.slice(0, 4).map((event) => ({
      kind: event.kind,
      headline: clipText(event.headline, 120),
      summary: clipText(event.summary, 160),
      stageIndex: event.stageIndex,
      createdAt: event.createdAt,
    })),
    recalledSessionEvents: authorContext.recalledSessionEvents.slice(0, 4).map((event) => ({
      kind: event.kind,
      headline: clipText(event.headline, 120),
      summary: clipText(event.summary, 160),
      stageIndex: event.stageIndex,
      createdAt: event.createdAt,
    })),
    guidance: compactTopicGuidanceContext(authorContext.guidance),
    latestResearchReport: authorContext.latestResearchReport
      ? {
          status: authorContext.latestResearchReport.status,
          headline: clipText(authorContext.latestResearchReport.headline, 180),
          summary: clipText(authorContext.latestResearchReport.summary, 220),
          currentStage: authorContext.latestResearchReport.currentStage,
          discoveredPapers: authorContext.latestResearchReport.discoveredPapers,
          admittedPapers: authorContext.latestResearchReport.admittedPapers,
          generatedContents: authorContext.latestResearchReport.generatedContents,
        }
      : null,
    currentStateRule:
      'Treat the research world as the canonical cross-stage state. When the latestResearchReport shows a newer run-level change, prefer that newer report for immediate status.',
    memoryRoutingRule:
      'Treat recalledSessionEvents as the most question-relevant long-memory slices when they add context beyond the latest research report.',
    guidanceRule:
      'Treat accepted guidance as durable user calibration. Do not pretend the artifact has already been rewritten; instead explain what will change in the next research or writing cycle and what judgment still stands.',
  }
  const structureByStyle =
    request.controls.responseStyle === 'brief'
      ? [
          'answer the user in one tight paragraph',
          'cite only the most decisive evidence',
          'close with one concrete boundary or caveat',
        ]
      : request.controls.responseStyle === 'deep'
        ? [
            'answer directly, then unfold the stage and node context in depth',
            'make the evidence chain explicit instead of gesturing at it',
            'close with the strongest unresolved doubt or challenge',
          ]
        : [
            'answer directly',
            'place the answer back into the topic mainline',
            'point out the most important evidence boundary or unresolved doubt',
          ]

  return {
    systemPrompt: buildPromptStudioSystemPrompt(template.system, editorialPolicy),
    userPrompt: [
      renderPromptVariables(template.user, {}),
      JSON.stringify(
        {
          authorContext: compactAuthorContext,
          question: clipText(request.userQuestion, 220),
          composerContext: request.contextItems.slice(0, 6).map((item) => clipText(item, 180)),
          workbenchControls: {
            responseStyle: request.controls.responseStyle,
            reasoningEnabled: request.controls.reasoningEnabled,
            retrievalEnabled: request.controls.retrievalEnabled,
          },
          selectedEvidence: chunks.map((chunk) => ({
            anchorId: chunk.anchorId,
            type: chunk.type,
            route: chunk.route,
            label: chunk.label,
            quote: chunk.quote,
            content: clipText(chunk.content, 180),
          })),
          outputContract: {
            mode: 'plain_text_answer',
            language: 'follow the user question when reasonable',
            structure: structureByStyle,
            outputRules: [
              'do not return JSON',
              'do not return markdown code fences',
              'do not reveal chain-of-thought or self-reflection',
            ],
          },
        },
        null,
        2,
      ),
      'Return the final answer as plain text only.',
    ].join('\n\n'),
  }
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)
    const extracted =
      fencedMatch?.[1] ??
      value.match(/\{[\s\S]*\}/u)?.[0] ??
      value.match(/\[[\s\S]*\]/u)?.[0] ??
      null

    if (!extracted) return null

    try {
      return JSON.parse(extracted) as T
    } catch {
      return null
    }
  }
}

function normalizeChatAnswerText(value: string) {
  const fencedMatch = value.match(/```(?:text|markdown)?\s*([\s\S]*?)\s*```/iu)
  const withoutFence = fencedMatch?.[1] ?? value
  const normalized = withoutFence
    .replace(/^(?:answer|response|回答|答复)\s*[:：]\s*/iu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()

  if (looksLikeReasoningLeak(normalized)) {
    return salvageAnswerFromReasoningLeak(normalized)
  }

  return normalized
}

function salvageAnswerFromReasoningLeak(value: string) {
  const markerPatterns = [
    /(?:^|\n)\s*(?:最终回答|最后回答|回答|答复|最终答复|两句话|简短回答|直接回答)\s*[:：]\s*/giu,
    /(?:^|\n)\s*(?:final answer|answer|response)\s*[:：]\s*/giu,
  ]
  let startIndex = -1

  for (const pattern of markerPatterns) {
    for (const match of value.matchAll(pattern)) {
      startIndex = Math.max(startIndex, match.index + match[0].length)
    }
  }

  if (startIndex < 0) return ''

  let candidate = value.slice(startIndex).trim()
  const boundaryMatch = candidate.match(
    /\n\s*(?:位置说明|关键证据(?:与边界)?|证据边界|检查|分析|补充说明|why it matters|evidence|checks?)\s*[:：]/iu,
  )
  if (boundaryMatch?.index) {
    candidate = candidate.slice(0, boundaryMatch.index).trim()
  }

  candidate = candidate.replace(/\n{3,}/gu, '\n\n').trim()
  if (!candidate) return ''

  return looksLikeReasoningLeak(candidate) ? '' : candidate
}

function looksLikeReasoningLeak(value: string) {
  if (!value.trim()) return false

  const lower = value.toLowerCase()
  const directMarkers = [
    'authorcontext',
    'selectedevidence',
    'outputcontract',
    'structured input',
    'outputrules',
    '让我们组织语言',
    '让我组织语言',
  ]

  if (directMarkers.some((marker) => lower.includes(marker))) {
    return true
  }

  const heuristicMarkers = [
    '首先分析关键信息',
    '关键问题：',
    '写作策略',
    '最终输出要求',
    '用户希望我基于提供的上下文',
    'first, let\'s analyze',
    'let me organize the answer',
  ]

  return heuristicMarkers.filter((marker) => lower.includes(marker.toLowerCase())).length >= 2
}

function buildFallbackSuggestedActions(chunks: TopicCorpusChunk[]): SuggestedAction[] {
  return chunks.slice(0, 3).map((chunk) => ({
    label: chunk.type === 'node' ? `\u67e5\u770b${chunk.label}` : `\u5b9a\u4f4d${chunk.label}`,
    action:
      chunk.type === 'figure' || chunk.type === 'table' || chunk.type === 'formula'
        ? 'show_evidence'
        : 'navigate',
    targetId: chunk.anchorId,
    description: chunk.quote,
  }))
}

function normalizeCitationsFromChunks(
  requested: Array<{ anchorId: string; label?: string; quote?: string }> | undefined,
  chunks: TopicCorpusChunk[],
): TopicCitationRef[] {
  const chunkMap = new Map(chunks.map((chunk) => [chunk.anchorId, chunk]))
  const picked = requested?.length
    ? requested
        .map((citation) => {
          const matched = chunkMap.get(citation.anchorId)
          if (!matched) return null
          return {
            anchorId: matched.anchorId,
            type: matched.type,
            route: matched.route,
            label: citation.label || matched.label,
            quote: citation.quote || matched.quote,
          } satisfies TopicCitationRef
        })
        .filter((citation): citation is TopicCitationRef => Boolean(citation))
    : []

  if (picked.length > 0) {
    return uniqueByAnchor(picked)
  }

  return chunks.slice(0, 3).map((chunk) => ({
    anchorId: chunk.anchorId,
    type: chunk.type,
    route: chunk.route,
    label: chunk.label,
    quote: chunk.quote,
  }))
}

function buildFallbackChatResponse(
  question: string,
  chunks: TopicCorpusChunk[],
  authorContext: Awaited<ReturnType<typeof buildTopicChatAuthorContext>>,
  notice?: OmniIssue,
): TopicChatResponse {
  const citations = normalizeCitationsFromChunks(undefined, chunks)
  const evidenceSummary = citations.map((citation) => `${citation.label}\uff1a${citation.quote}`).join('\n')
  const continuityLead = authorContext.continuityThreads[0]
  const openQuestion = authorContext.openQuestions[0]
  const recalledLead = authorContext.recalledSessionEvents[0]
  const worldLead = clipText(
    [
      authorContext.world.summary.thesis,
      authorContext.world.summary.currentFocus,
      authorContext.world.summary.continuity,
    ]
      .filter(Boolean)
      .join(' '),
    280,
  )
  const researchLead = authorContext.latestResearchReport
    ? clipText(
        `${authorContext.latestResearchReport.headline || authorContext.latestResearchReport.summary}${
          authorContext.latestResearchReport.summary &&
          authorContext.latestResearchReport.summary !== authorContext.latestResearchReport.headline
            ? ` ${authorContext.latestResearchReport.summary}`
            : ''
        }`,
        320,
      )
    : clipText(
        worldLead ||
          recalledLead?.summary ||
          recalledLead?.headline ||
          authorContext.sessionMemory.lastResearchMove ||
          authorContext.sessionMemory.currentFocus ||
          authorContext.sessionMemory.continuity,
        260,
      )

  return {
    messageId: `msg_${Date.now()}`,
    answer:
      chunks.length === 0
        ? `当前这个主题还没有足够的结构化证据，因此我暂时无法直接回答“${question}”。${
            researchLead ? `不过，最近一轮持续研究已经得到这样的判断：${researchLead}。` : ''
          }你可以先重建主题 artifact，或者补齐模型配置后再继续追问。`
        : `基于当前主题页已经整理好的证据，我更倾向于这样理解“${question}”：

${researchLead ? `最近一轮持续研究回执：${researchLead}\n\n` : ''}${
            continuityLead ? `主线位置：${continuityLead}\n\n` : ''
          }${evidenceSummary}${
            openQuestion ? `\n\n继续追问的方向：${openQuestion}` : ''
          }`,
    citations,
    suggestedActions: buildFallbackSuggestedActions(chunks),
    notice,
  }
}

function resolveGuidanceReceiptLanguage(
  language: string | null | undefined,
): TopicLocalizationLanguage {
  const normalized = (language ?? '').toLowerCase()
  if (normalized.startsWith('en')) return 'en'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('de')) return 'de'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('ru')) return 'ru'
  return 'zh'
}

function buildGuidanceReceiptAnswer(args: {
  directive: TopicGuidanceDirective
  authorContext: TopicGuidanceAuthorContext
}) {
  const currentJudgment = clipText(
    [
      args.authorContext.world.summary.currentFocus,
      args.authorContext.world.summary.thesis,
      args.authorContext.sessionMemory.currentFocus,
      args.authorContext.continuityThreads[0],
    ]
      .filter(Boolean)
      .join(' '),
    180,
  )
  const openBoundary = clipText(
    args.authorContext.world.summary.dominantQuestion ||
      args.authorContext.openQuestions[0] ||
      args.authorContext.reviewerWatchpoints[0],
    160,
  )
  const language = resolveGuidanceReceiptLanguage(args.authorContext.world.language)
  const scope = args.directive.scopeLabel

  if (language === 'en') {
    if (args.directive.directiveType === 'challenge') {
      return `I elevated your challenge to "${scope}" into the next structural review. It will not rewrite the current presentation directly; instead I will re-check node boundaries, stage naming, and representative papers in the next pass. I still keep this mainline for now: ${currentJudgment || 'The current line still stands, but its boundary needs another check.'}${openBoundary ? ` The next boundary to verify is: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `I accept your request to focus on "${scope}". The next few cycles will narrow retrieval, admission, and writing priority around this range instead of widening the topic again. I still start from this current line: ${currentJudgment || 'Keep the existing topic mainline stable first.'}${openBoundary ? ` I will question this next: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `I accept the expression calibration for "${scope}". It will not hand-edit existing factual judgments; it will shape the next round of topic, node, and paper writing so the prose stays more restrained, more article-like, and clearer about doubt and boundaries. I still keep this research judgment: ${currentJudgment || 'The current mainline judgment remains in place.'}`
    }

    if (args.directive.directiveType === 'command') {
      return `I recorded this system action intent in the topic guidance ledger. The actual start, pause, and extension controls still run through the research control card in the right rail so system state and visible state stay aligned. I will keep moving along this current line: ${currentJudgment || 'Continue advancing around the current topic mainline.'}`
    }

    return `I accept your suggestion about "${scope}". It will not rewrite the current page directly; it will change how I choose emphasis, organize judgment, and unfold evidence in the next research and writing run. I still keep this mainline judgment: ${currentJudgment || 'The existing mainline judgment still stands.'}${openBoundary ? ` I will keep asking: ${openBoundary}` : ''}`
  }

  if (language === 'ja') {
    if (args.directive.directiveType === 'challenge') {
      return `あなたの「${scope}」への異議は、次の構造レビューで優先的に再点検します。今の表示を直接書き換えるのではなく、次のパスでノード境界、段階命名、代表論文の妥当性を見直します。現時点で維持する主線は次の通りです：${currentJudgment || '現行の主線はまだ有効ですが、境界は再確認が必要です。'}${openBoundary ? ` 次に最も確認したい境界は：${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `「${scope}」に絞るという要請を受け入れます。次の数ラウンドでは、話題を広げるよりも、この範囲に沿って検索、採用、執筆の優先度を絞ります。現在の起点として保つ主線は：${currentJudgment || 'まず既存の主線を安定させます。'}${openBoundary ? ` 次に優先して問い直すのは：${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `「${scope}」に関する表現の調整を受け入れます。既存の事実判断を手で書き換えるのではなく、次のテーマ・ノード・論文執筆に反映し、より抑制的で記事らしく、疑義と境界も明示する書き方に寄せます。現在も維持する研究判断は：${currentJudgment || '現行の主線判断は維持します。'}`
    }

    if (args.directive.directiveType === 'command') {
      return `このシステム操作の意図は現在のトピックのガイダンス台帳に記録しました。実際の開始・停止・延長は右レールの研究制御カードで即時に実行し、内部状態と表示状態がずれないようにします。現在はこの主線に沿って連続性を保ちます：${currentJudgment || '現在のトピック主線に沿って進めます。'}`
    }

    return `「${scope}」についての提案を受け入れます。現在のページを直接書き換えるのではなく、次の研究と執筆で、重点の置き方、判断の組み立て、証拠の展開の仕方に反映します。現時点で維持する主線判断は：${currentJudgment || '現行の主線判断はまだ有効です。'}${openBoundary ? ` あわせて追い続ける問いは：${openBoundary}` : ''}`
  }

  if (language === 'ko') {
    if (args.directive.directiveType === 'challenge') {
      return `"${scope}"에 대한 이의 제기를 다음 구조 검토에서 우선 재점검 대상으로 올려두었습니다. 현재 화면을 바로 다시 쓰지는 않고, 다음 패스에서 노드 경계, 단계 명명, 대표 논문 구성을 다시 확인하겠습니다. 지금도 유지하는 주선 판단은 다음과 같습니다: ${currentJudgment || '현재 주선은 아직 유효하지만 경계는 다시 확인해야 합니다.'}${openBoundary ? ` 다음에 가장 먼저 검증할 경계는: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `"${scope}"에 집중하라는 요청을 받아들입니다. 다음 몇 차례 연구에서는 주제를 넓히기보다 이 범위 안에서 검색, 채택, 글쓰기 우선순위를 더 좁혀가겠습니다. 지금의 출발선으로 유지하는 주선은: ${currentJudgment || '먼저 기존 주선을 안정적으로 유지하겠습니다.'}${openBoundary ? ` 다음으로 우선 확인할 질문은: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `"${scope}"에 관한 표현 보정을 받아들입니다. 기존 사실 판단을 손으로 다시 쓰는 것이 아니라, 다음 주제·노드·논문 글쓰기에 반영해 더 절제되고 글답게 만들면서도 의문과 경계를 더 분명히 남기겠습니다. 지금도 유지하는 연구 판단은: ${currentJudgment || '현재 주선 판단은 유지합니다.'}`
    }

    if (args.directive.directiveType === 'command') {
      return `이 시스템 동작 의도는 현재 주제의 가이던스 원장에 기록했습니다. 실제 시작, 일시정지, 연구 연장은 오른쪽 레일의 연구 제어 카드에서 즉시 실행해 시스템 상태와 표시 상태가 어긋나지 않게 하겠습니다. 지금은 이 주선을 따라 연속성을 유지합니다: ${currentJudgment || '현재 주제의 주선을 따라 계속 진행합니다.'}`
    }

    return `"${scope}"에 대한 제안을 받아들입니다. 현재 페이지를 바로 다시 쓰지는 않고, 다음 연구와 글쓰기에서 무엇에 무게를 둘지, 판단을 어떻게 조직할지, 증거를 어떻게 펼칠지에 영향을 주겠습니다. 지금도 유지하는 주선 판단은: ${currentJudgment || '현재 주선 판단은 여전히 유효합니다.'}${openBoundary ? ` 동시에 계속 추적할 질문은: ${openBoundary}` : ''}`
  }

  if (language === 'de') {
    if (args.directive.directiveType === 'challenge') {
      return `Ihren Einwand zu "${scope}" habe ich in die nächste Strukturprüfung mit hoher Priorität übernommen. Die aktuelle Darstellung wird nicht direkt umgeschrieben; stattdessen prüfe ich im nächsten Durchlauf Knotenabgrenzung, Phasenbenennung und repräsentative Arbeiten erneut. Vorläufig halte ich weiterhin diese Hauptlinie: ${currentJudgment || 'Die aktuelle Hauptlinie steht noch, ihre Grenze muss aber erneut geprüft werden.'}${openBoundary ? ` Als Nächstes muss vor allem diese Grenze geprüft werden: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `Ich übernehme Ihren Fokus auf "${scope}". In den nächsten Zyklen verenge ich Recherche, Aufnahme und Schreibpriorität auf diesen Bereich, statt das Thema weiter auszudehnen. Ausgangspunkt bleibt dabei diese aktuelle Linie: ${currentJudgment || 'Zuerst bleibt die bestehende Hauptlinie stabil.'}${openBoundary ? ` Als Nächstes frage ich vorrangig nach: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `Ich übernehme die stilistische Kalibrierung für "${scope}". Vorhandene Sachurteile werden nicht manuell umgeschrieben; stattdessen wirkt die Anpassung in der nächsten Runde bei Thema-, Knoten- und Paper-Texten, damit der Ton zurückhaltender, artikelhafter und klarer in Bezug auf Zweifel und Grenzen bleibt. Dieses Forschungsurteil halte ich weiterhin: ${currentJudgment || 'Das aktuelle Hauptlinien-Urteil bleibt bestehen.'}`
    }

    if (args.directive.directiveType === 'command') {
      return `Diese Systemaktion habe ich im Guidance-Ledger des Themas vermerkt. Das eigentliche Starten, Pausieren oder Verlängern der Forschung läuft weiterhin über die Steuerkarte in der rechten Leiste, damit Systemzustand und sichtbarer Zustand zusammenbleiben. Ich bewege mich vorerst weiter entlang dieser Linie: ${currentJudgment || 'Weiter entlang der aktuellen Themen-Hauptlinie.'}`
    }

    return `Ich übernehme Ihren Hinweis zu "${scope}". Die aktuelle Seite wird nicht direkt umgeschrieben; in der nächsten Forschungs- und Schreibrunde verändert sich aber, wie ich Schwerpunkte setze, Urteile ordne und Evidenz entf alte. Diese Hauptlinien-Einschätzung behalte ich vorerst bei: ${currentJudgment || 'Die bestehende Hauptlinien-Einschätzung bleibt vorerst bestehen.'}${openBoundary ? ` Gleichzeitig verfolge ich weiter: ${openBoundary}` : ''}`
  }

  if (language === 'fr') {
    if (args.directive.directiveType === 'challenge') {
      return `J’ai remonté votre contestation sur "${scope}" comme point prioritaire de la prochaine relecture structurelle. Je ne réécris pas directement l’affichage actuel ; je vais d’abord reverifier les frontières des noeuds, le nommage des phases et les articles représentatifs au prochain passage. Pour l’instant, je maintiens cette ligne directrice : ${currentJudgment || 'La ligne actuelle tient encore, mais ses frontières doivent être revérifiées.'}${openBoundary ? ` La prochaine limite à vérifier en priorité est : ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `J’accepte votre demande de focalisation sur "${scope}". Dans les prochains cycles, je resserre la recherche, l’admission et la priorité d’écriture sur cette zone au lieu d’élargir encore le sujet. Le point de départ que je maintiens reste : ${currentJudgment || 'Je garde d’abord la ligne principale actuelle stable.'}${openBoundary ? ` Je vais prioritairement réinterroger : ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `J’accepte cet ajustement d’expression pour "${scope}". Il ne réécrit pas à la main les jugements factuels existants ; il s’appliquera à la prochaine écriture des thèmes, noeuds et articles pour rendre le ton plus retenu, plus proche d’un article, tout en laissant visibles les doutes et les limites. Je maintiens encore ce jugement de recherche : ${currentJudgment || 'Le jugement principal actuel reste en place.'}`
    }

    if (args.directive.directiveType === 'command') {
      return `J’ai enregistré cette intention d’action système dans le registre de guidance du sujet. Le démarrage, la pause et l’extension réels passent toujours par la carte de contrôle de recherche dans la barre latérale droite afin que l’état système et l’état visible restent alignés. Je continue donc sur cette ligne : ${currentJudgment || 'Je poursuis autour de la ligne principale actuelle du sujet.'}`
    }

    return `J’accepte votre suggestion sur "${scope}". Elle ne réécrit pas directement la page actuelle ; elle modifie la manière dont je hiérarchise, organise le jugement et déroule la preuve dans le prochain cycle de recherche et d’écriture. Je maintiens pour l’instant cette ligne directrice : ${currentJudgment || 'Le jugement principal actuel reste valable.'}${openBoundary ? ` Et je continue aussi à suivre : ${openBoundary}` : ''}`
  }

  if (language === 'es') {
    if (args.directive.directiveType === 'challenge') {
      return `He elevado tu cuestionamiento sobre "${scope}" a revisión prioritaria en la próxima pasada estructural. No reescribirá directamente la presentación actual; en la siguiente ronda volveré a comprobar los límites de los nodos, el nombre de las etapas y los artículos representativos. Por ahora sigo manteniendo esta línea principal: ${currentJudgment || 'La línea actual sigue en pie, pero su frontera necesita otra comprobación.'}${openBoundary ? ` El siguiente borde que más necesito verificar es: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `Acepto tu petición de concentrarme en "${scope}". En los próximos ciclos voy a estrechar la búsqueda, la admisión y la prioridad de escritura alrededor de este rango en lugar de seguir ampliando el tema. La línea de partida que sigo manteniendo es: ${currentJudgment || 'Primero estabilizo la línea principal existente.'}${openBoundary ? ` La próxima pregunta que priorizaré es: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `Acepto este ajuste de estilo para "${scope}". No reescribirá manualmente los juicios fácticos existentes; se aplicará en la siguiente ronda de escritura de temas, nodos y artículos para que el tono sea más sobrio, más parecido a un artículo y más claro sobre dudas y límites. Sigo manteniendo este juicio de investigación: ${currentJudgment || 'El juicio principal actual sigue vigente.'}`
    }

    if (args.directive.directiveType === 'command') {
      return `He registrado esta intención de acción del sistema en el libro de guía del tema. El inicio, la pausa y la extensión reales de la investigación siguen ejecutándose desde la tarjeta de control en la barra derecha, para que el estado del sistema y el estado visible no se desalineen. Por ahora continúo por esta línea: ${currentJudgment || 'Seguir avanzando alrededor de la línea principal actual del tema.'}`
    }

    return `Acepto tu sugerencia sobre "${scope}". No reescribirá directamente la página actual; influirá en cómo priorizo, organizo el juicio y despliego la evidencia en la próxima ronda de investigación y escritura. Por ahora sigo manteniendo este juicio principal: ${currentJudgment || 'El juicio principal existente sigue siendo válido.'}${openBoundary ? ` Al mismo tiempo seguiré preguntando por: ${openBoundary}` : ''}`
  }

  if (language === 'ru') {
    if (args.directive.directiveType === 'challenge') {
      return `Я поднял ваше возражение по "${scope}" до приоритетной перепроверки в следующем структурном проходе. Текущая витрина не будет переписана напрямую; в следующем цикле я заново проверю границы узлов, названия этапов и набор репрезентативных работ. Пока я сохраняю такую главную линию: ${currentJudgment || 'Текущая линия пока остается в силе, но ее границы нужно перепроверить.'}${openBoundary ? ` Следующая граница для проверки: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'focus') {
      return `Я принимаю вашу просьбу сфокусироваться на "${scope}". В ближайших циклах я сузю поиск, допуск и приоритет письма вокруг этого диапазона вместо того, чтобы снова расширять тему. В качестве текущей линии я пока сохраняю следующее: ${currentJudgment || 'Сначала удерживаю существующую основную линию.'}${openBoundary ? ` Следующий вопрос, который я проверю в первую очередь: ${openBoundary}` : ''}`
    }

    if (args.directive.directiveType === 'style') {
      return `Я принимаю эту калибровку формулировок для "${scope}". Она не будет вручную переписывать уже принятые фактические суждения; она начнет действовать в следующем раунде написания темы, узлов и статей, чтобы текст был сдержаннее, ближе к исследовательской статье и яснее показывал сомнения и границы. Я по-прежнему сохраняю такое исследовательское суждение: ${currentJudgment || 'Текущее основное суждение сохраняется.'}`
    }

    if (args.directive.directiveType === 'command') {
      return `Я записал это системное действие в guidance-ledger текущей темы. Реальный запуск, пауза и продление исследования по-прежнему выполняются через карточку управления в правой панели, чтобы системное состояние и видимое состояние не расходились. Пока я продолжаю держаться этой линии: ${currentJudgment || 'Продолжаю двигаться вокруг текущей основной линии темы.'}`
    }

    return `Я принимаю ваше предложение по "${scope}". Оно не перепишет текущую страницу напрямую; оно повлияет на то, как я расставлю акценты, организую суждение и разверну доказательства в следующем исследовательском и писательском проходе. Пока я сохраняю такое основное суждение: ${currentJudgment || 'Существующее основное суждение пока остается в силе.'}${openBoundary ? ` И одновременно я продолжу уточнять: ${openBoundary}` : ''}`
  }

  if (args.directive.directiveType === 'challenge') {
    return `我已经把你对“${scope}”的质疑提升为高优先级重审。它不会直接改写现有展示，而会在下一轮结构复核里优先检查节点边界、阶段命名与代表论文是否需要调整。当前我仍暂时保留这条主线判断：${currentJudgment || '现有主线仍然成立，但需要继续核对边界。'}${openBoundary ? ` 接下来最需要核对的是：${openBoundary}` : ''}`
  }

  if (args.directive.directiveType === 'focus') {
    return `我接受你对“${scope}”的聚焦要求。接下来若干轮研究会先围绕这条范围收紧检索、纳入与写作优先级，而不是继续无边界扩张。当前主线起点仍然是：${currentJudgment || '先稳住现有主题主线。'}${openBoundary ? ` 我会优先追问：${openBoundary}` : ''}`
  }

  if (args.directive.directiveType === 'style') {
    return `我接受你关于“${scope}”的表达校准。它不会手工篡改既有事实判断，而会从下一轮主题、节点与论文写作里生效，让表述更克制、更像文章，也更明确地保留质疑与边界。当前我仍坚持这条研究判断：${currentJudgment || '现有主线判断仍然保留。'}`
  }

  if (args.directive.directiveType === 'command') {
    return `我收到了这条系统动作意图，并已把它记入当前主题的指导账本。真正的开始、暂停、延长研究等动作仍通过右侧栏里的研究控制卡立即执行，这样不会让系统状态和展示状态脱节。当前我会继续沿着这条主线保持连续性：${currentJudgment || '继续围绕当前主题主线推进。'}`
  }

  return `我接受你关于“${scope}”的建议。它不会直接重写当前页面，而会在下一轮研究与写作里影响我如何取舍重点、组织判断和展开证据。当前我仍保留这条主线判断：${currentJudgment || '现有主线判断仍然成立。'}${openBoundary ? ` 同时我会继续追问：${openBoundary}` : ''}`
}
function buildGuidanceReceiptResponse(args: {
  directive: TopicGuidanceDirective
  receipt: OmniTopicGuidanceReceipt
  citations: TopicCitationRef[]
  authorContext: TopicGuidanceAuthorContext
}): TopicChatResponse {
  return {
    messageId: `msg_${Date.now()}`,
    answer: buildGuidanceReceiptAnswer({
      directive: args.directive,
      authorContext: args.authorContext,
    }),
    citations: args.citations,
    suggestedActions: buildGuidanceSuggestedActions({
      directive: args.directive,
    }),
    guidanceReceipt: args.receipt,
  }
}

export async function answerTopicQuestion(
  topicId: string,
  question: string,
  attachments?: OmniAttachment[],
  options?: { deferRecording?: boolean },
): Promise<TopicChatResponse> {
  const parsedRequest = parseTopicChatRequest(question)
  const explicitCommand = parseTopicChatCommand(question)
  const persistExchange = (response: TopicChatResponse) => {
    if (options?.deferRecording) return

    void recordTopicChatExchange({
      topicId,
      question: parsedRequest.userQuestion,
      answer: response.answer,
      citations: response.citations,
    }).catch(() => undefined)
  }
  const topicCatalogSource = await loadTopicChatCatalogSource(topicId)
  const catalog = buildTopicChatCatalog(topicCatalogSource)
  if (!explicitCommand) {
    const directResponse = buildDirectTopicChatResponse(
      parsedRequest.userQuestion,
      catalog,
    )

    if (directResponse) {
      persistExchange(directResponse)
      return directResponse
    }
  }

  const messageKind = explicitCommand
    ? 'command'
    : classifyTopicGuidanceMessage(parsedRequest.userQuestion)

  if (messageKind !== 'ask') {
    const scopeChunks = buildTopicScopeChunks(topicCatalogSource)
    const selectedScopeChunks = selectTopicChatChunks(parsedRequest.retrievalQuery, scopeChunks)
    const scopeResolution = resolveTopicGuidanceScope({
      question: parsedRequest.userQuestion,
      selected: selectedScopeChunks,
      catalog,
    })
    const recorded = await recordTopicGuidanceDirective({
      topicId,
      sourceMessageId: `chat-user:${Date.now()}`,
      messageKind,
      instruction: parsedRequest.userQuestion,
      scopeType: scopeResolution.scopeType,
      scopeId: scopeResolution.scopeId,
      scopeLabel: scopeResolution.scopeLabel,
    })
    const authorContext = await buildTopicGuidanceAuthorContext(
      topicId,
      parsedRequest.userQuestion,
    )

    const response = buildGuidanceReceiptResponse({
      directive: recorded.directive,
      receipt: recorded.receipt,
      citations: scopeResolution.citations,
      authorContext,
    })
    persistExchange(response)
    return response
  }

  const topic = await loadTopicForArtifact(topicId)
  const corpus = buildTopicCorpusFromTopic(topic)
  const selected = selectTopicChatChunks(parsedRequest.retrievalQuery, corpus)
  const groundedSelection =
    selected.length > 0 ? selected : corpus.slice(0, Math.min(3, corpus.length))
  const authorContext = await buildTopicChatAuthorContext(topicId, parsedRequest.userQuestion)

  let response: TopicChatResponse

  if (groundedSelection.length === 0) {
    response = buildFallbackChatResponse(parsedRequest.userQuestion, [], authorContext)
    persistExchange(response)
    return response
  }

  const promptPayload = await buildPromptStudioTopicChatPrompt(
    parsedRequest,
    groundedSelection,
    authorContext,
  )
  const messages: OmniMessage[] = [
    {
      role: 'system',
      content: promptPayload.systemPrompt,
    },
    {
      role: 'user',
      content: promptPayload.userPrompt,
      attachments,
    },
  ]

  const request: OmniCompleteRequest = {
    task: attachments?.length ? 'topic_chat_vision' : 'topic_chat',
    role: inferResearchRoleForTemplate(PROMPT_TEMPLATE_IDS.TOPIC_CHAT),
    messages,
    maxTokens: 900,
  }

  const hasAvailableModel = await omniGateway.hasAvailableModel(request)
  if (!hasAvailableModel) {
    response = buildFallbackChatResponse(parsedRequest.userQuestion, selected, authorContext, {
      code: 'missing_key',
      title:
        request.task === 'topic_chat_vision'
          ? '\u672a\u68c0\u6d4b\u5230\u53ef\u7528\u7684\u591a\u6a21\u6001 Key'
          : '\u672a\u68c0\u6d4b\u5230\u53ef\u7528\u7684\u6a21\u578b Key',
      message:
        request.task === 'topic_chat_vision'
          ? '\u8bf7\u5148\u586b\u5199\u6216\u66f4\u6362\u591a\u6a21\u6001\u6a21\u578b Key\uff0c\u5426\u5219\u7cfb\u7edf\u53ea\u80fd\u4f7f\u7528\u540e\u7aef\u964d\u7ea7\u56de\u7b54\u3002'
          : '\u8bf7\u5148\u586b\u5199\u6216\u66f4\u6362\u8bed\u8a00\u6a21\u578b Key\uff0c\u5426\u5219\u7cfb\u7edf\u53ea\u80fd\u4f7f\u7528\u540e\u7aef\u964d\u7ea7\u56de\u7b54\u3002',
      provider: 'backend',
      model: 'backend-fallback',
      slot: request.task === 'topic_chat_vision' ? 'multimodal' : 'language',
    })
    persistExchange(response)
    return response
  }

  const result = await omniGateway.complete(request)

  if (result.issue) {
    response = buildFallbackChatResponse(
      parsedRequest.userQuestion,
      groundedSelection,
      authorContext,
      result.issue,
    )
    persistExchange(response)
    return response
  }

  const parsed = safeParseJson<{
    answer?: string
    citations?: Array<{ anchorId: string; label?: string; quote?: string }>
    suggestedActions?: SuggestedAction[]
  }>(result.text)
  const answer = normalizeChatAnswerText(parsed?.answer ?? result.text)

  if (!answer) {
    response = buildFallbackChatResponse(
      parsedRequest.userQuestion,
      groundedSelection,
      authorContext,
      result.issue,
    )
    persistExchange(response)
    return response
  }

  response = {
    messageId: `msg_${Date.now()}`,
    answer,
    citations: normalizeCitationsFromChunks(parsed?.citations, groundedSelection),
    suggestedActions:
      parsed?.suggestedActions?.length && parsed.suggestedActions.length > 0
        ? parsed.suggestedActions.slice(0, 4)
        : buildFallbackSuggestedActions(groundedSelection),
    notice: result.issue,
  }

  persistExchange(response)

  return response
}

export async function getEvidenceByAnchorId(anchorId: string): Promise<EvidencePayload> {
  const [type, entityId] = anchorId.split(':')

  if (!type || !entityId) {
    throw new AppError(400, 'Invalid anchorId.')
  }

  if (type === 'node') {
    const node = await prisma.researchNode.findUnique({
      where: { id: entityId },
      include: {
        primaryPaper: true,
      },
    })
    if (!node) throw new AppError(404, 'Evidence not found.')

    return {
      anchorId,
      type: 'node',
      route: nodeRoute(node.id),
      title: node.nodeLabel,
      label: node.nodeLabel,
      quote: clipText(node.nodeSummary),
      content: `${node.nodeSummary}\n\n${node.nodeExplanation ?? ''}`,
      whyItMatters: '这是主题图中的一个研究节点，负责把几篇关键论文组织成一条可阅读的推进链。',
      placementHint: 'graph-node',
      importance: 0.76,
      metadata: {
        topicId: node.topicId,
        primaryPaperId: node.primaryPaperId,
        primaryPaperTitle: node.primaryPaper.titleZh || node.primaryPaper.title,
        updatedAt: node.updatedAt.toISOString(),
      },
    }
  }

  if (type === 'paper') {
    const paper = await prisma.paper.findUnique({
      where: { id: entityId },
      include: {
        figures: true,
        tables: true,
        formulas: true,
        sections: true,
      },
    })
    if (!paper) throw new AppError(404, 'Evidence not found.')

    return {
      anchorId,
      type: 'paper',
      route: paperRoute(paper.id),
      title: paper.titleZh || paper.title,
      label: paper.titleZh || paper.title,
      quote: clipText(paper.summary),
      content: `${paper.summary}\n\n${paper.explanation ?? ''}`,
      whyItMatters: '这是进入单篇文章深读的入口，负责把主题图中的某一跳落回论文本身。',
      placementHint: 'article-header',
      importance: 0.68,
      metadata: {
        topicId: paper.topicId,
        publishedAt: paper.published.toISOString(),
        authors: parseJsonArray(paper.authors),
        figuresCount: paper.figures.length,
        tablesCount: paper.tables.length,
        formulasCount: paper.formulas.length,
        sectionsCount: paper.sections.length,
      },
    }
  }

  if (type === 'section') {
    const section = await prisma.paperSection.findUnique({
      where: { id: entityId },
      include: {
        paper: true,
      },
    })
    if (!section) throw new AppError(404, 'Evidence not found.')

    return {
      anchorId,
      type: 'section',
      route: paperRoute(section.paperId, anchorId),
      title: section.editorialTitle || section.sourceSectionTitle,
      label: `${section.paper.titleZh || section.paper.title} / ${section.editorialTitle || section.sourceSectionTitle}`,
      quote: clipText(section.paragraphs),
      content: section.paragraphs,
      whyItMatters: '这一段正文承担了论证链里的文本证据角色，用来支撑节点或论文页中的具体判断。',
      placementHint: 'inline-text',
      importance: 0.62,
      metadata: {
        topicId: section.paper.topicId,
        paperId: section.paperId,
      },
    }
  }

  if (type === 'figure') {
    const figure = await prisma.figure.findUnique({
      where: { id: entityId },
      include: {
        paper: true,
      },
    })
    if (!figure) throw new AppError(404, 'Evidence not found.')

    return {
      anchorId,
      type: 'figure',
      route: paperRoute(figure.paperId, undefined, anchorId),
      title: `Figure ${figure.number}`,
      label: `${figure.paper.titleZh || figure.paper.title} / Figure ${figure.number}`,
      quote: clipText(figure.caption),
      content: `${figure.caption}\n\n${figure.analysis ?? ''}`,
      whyItMatters: '这张图不是配图，而是论证中的可视化证据，需要说明它究竟证明了哪一段判断。',
      placementHint: 'inline-figure',
      importance: 0.91,
      thumbnailPath: figure.imagePath,
      metadata: {
        topicId: figure.paper.topicId,
        paperId: figure.paperId,
        imagePath: figure.imagePath,
        page: figure.page,
      },
    }
  }

  if (type === 'table') {
    const table = await prisma.table.findUnique({
      where: { id: entityId },
      include: {
        paper: true,
      },
    })
    if (!table) throw new AppError(404, 'Evidence not found.')

    return {
      anchorId,
      type: 'table',
      route: paperRoute(table.paperId, undefined, anchorId),
      title: `Table ${table.number}`,
      label: `${table.paper.titleZh || table.paper.title} / Table ${table.number}`,
      quote: clipText(table.caption),
      content: `${table.caption}\n\n${table.rawText}`,
      whyItMatters: '这张表通常直接决定论文与基线之间的优劣关系是否成立，需要解释比较条件和结论边界。',
      placementHint: 'inline-table',
      importance: 0.84,
      metadata: {
        topicId: table.paper.topicId,
        paperId: table.paperId,
        page: table.page,
        headers: parseJsonArray(table.headers),
        rows: parseJsonValue<unknown[]>(table.rows) ?? [],
      },
    }
  }

  if (type === 'formula') {
    const formula = await prisma.formula.findUnique({
      where: { id: entityId },
      include: {
        paper: true,
      },
    })
    if (!formula) throw new AppError(404, 'Evidence not found.')

    return {
      anchorId,
      type: 'formula',
      route: paperRoute(formula.paperId, undefined, anchorId),
      title: `Formula ${formula.number}`,
      label: `${formula.paper.titleZh || formula.paper.title} / Formula ${formula.number}`,
      quote: clipText(formula.rawText || formula.latex),
      content: `${formula.latex}\n\n${formula.rawText}`,
      whyItMatters: '这个公式说明方法真正依赖的目标、约束或更新方式，需要解释它在论证中的位置。',
      placementHint: 'inline-formula',
      importance: 0.78,
      metadata: {
        topicId: formula.paper.topicId,
        paperId: formula.paperId,
        page: formula.page,
      },
    }
  }

throw new AppError(404, 'Evidence not found.')
}

export const __testing = {
  buildGraphLayout,
  BRANCH_LANES,
  MAINLINE_BRANCH_COLOR,
  parseTopicChatRequest,
  buildDirectTopicChatResponse,
  normalizeChatAnswerText,
  looksLikeReasoningLeak,
  selectTopicDisplayPapers,
  compactTopicMapNodeTitle,
  buildTopicMapNodeSummary,
  sanitizeTopicUserFacingSentence,
  sanitizeTopicUserFacingParagraphs,
  looksLikeTopicProcessLeak,
  looksLikeTopicPromptLeak,
  countPaperEvidence,
  compactTopicChatResearchReport,
  detectFallbackNodeThemeId,
  buildFallbackNodeLabel,
  synthesizeFallbackNodeClusters,
  isLegacyFallbackNodeLabel,
  pickTopicMapNodePaperIds,
}
