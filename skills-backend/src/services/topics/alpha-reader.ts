import { prisma } from '../../lib/prisma'
import { AppError } from '../../middleware/errorHandler'
import { buildGenerationFingerprint, loadTopicGenerationMemory } from '../generation/memory-store'
import { upsertTopicArtifactIndexEntry } from '../generation/artifact-index'
import { getModelConfigFingerprint } from '../omni/config-store'
import { getGenerationRuntimeConfig, getPromptTemplate, PROMPT_TEMPLATE_IDS } from '../generation/prompt-registry'
import {
  type NodeComparisonPass,
  type NodePaperPass,
  type NodeSynthesisPass,
  generateNodeComparisonPass,
  generateNodePaperPasses,
  generateNodeSynthesisPass,
  generatePaperStoryPass,
  generateReviewerCritique,
} from './article-pipeline'
import {
  appendResearchPipelineEntry,
  buildResearchPipelineContext,
  loadResearchPipelineState,
  type ResearchPipelineEntry,
} from './research-pipeline'
import {
  compactTopicGuidanceContext,
  loadTopicGuidanceLedger,
} from './topic-guidance-ledger'
import {
  collectTopicSessionMemoryContext,
  loadTopicSessionMemory,
} from './topic-session-memory'
import { collectTopicCognitiveMemory } from './topic-cognitive-memory'
import { collectNodeRelatedPaperIds } from './node-paper-association'
import { resolvePaperSourceLinks } from '../paper-links'
import {
  deriveTemporalStageBuckets,
  normalizeStageWindowMonths,
} from './stage-buckets'
import { loadTopicStageConfig } from './topic-stage-config'
import { logger } from '../../utils/logger'

type EvidenceType = 'figure' | 'table' | 'formula'

const READER_ARTIFACT_PREFIX = 'alpha:reader-artifact:'
const readerArtifactBuildQueue = new Map<string, Promise<unknown>>()
const NODE_READER_ARTIFACT_SCHEMA_VERSION = 'node-article-v3'
const PAPER_READER_ARTIFACT_SCHEMA_VERSION = 'paper-article-v2'
const HEURISTIC_NARRATIVE_RE =
  /heuristic fit|query overlap|lexical and temporal relevance|stage-aligned query overlap/iu
const LOW_SIGNAL_NODE_COPY_PATTERNS = [
  /本节点.+篇论文横跨/u,
  /见证了.+三级跳/u,
  /节点级判断不能只停在/u,
  /一个好的节点应该/u,
  /如果读完这个节点后仍然不知道/u,
  /部分论文缺少足够的可视化或表格证据/u,
]
const LOW_SIGNAL_SECTION_TITLE_PATTERNS = [
  /^(?:table of contents|contents|acknowledg(?:e)?ments?|declaration|dedication|copyright|references|bibliography|appendix)$/iu,
]
const LOW_SIGNAL_SECTION_BODY_PATTERNS = [
  /table of contents/iu,
  /list of figures|list of tables/iu,
  /acknowledg(?:e)?ments?/iu,
  /declaration/iu,
  /dedication|dedicate this thesis/iu,
  /i would like to dedicate this thesis/iu,
  /all rights reserved/iu,
  /personal use is permitted/iu,
  /ieee xplore/iu,
  /cookie|privacy notice|sign in|purchase pdf|download pdf/iu,
  /submitted in partial fulfillment|this thesis is submitted|doctor of philosophy|master of science/iu,
  /contents?\s+chapter/iu,
  /list of figures|list of tables/iu,
  /references\s+\[\d+\]/iu,
]
const HTML_SECTION_NOISE_RE =
  /<(?:html|head|body|meta|script|div|span|title)\b|&nbsp;|document\.cookie/iu
const GENERIC_FIGURE_LABEL_RE = /^(?:图|figure)\s*\d+[a-z]?(?:\s*[:.]?)$/iu
const GENERIC_TABLE_LABEL_RE = /^(?:表|table)\s*\d+[a-z]?(?:\s*[:.]?)$/iu
const GENERIC_FORMULA_LABEL_RE = /^(?:公式|formula)\s*\d+[a-z]?(?:\s*[:.]?)$/iu
const BODY_SECTION_TITLE_RE = /^body section \d+$/iu

type ReaderArtifactKind = 'paper' | 'node'
type ReaderArtifactWarmMode = 'full' | 'quick' | 'deferred'

interface ReaderArtifactRecord<T> {
  kind: ReaderArtifactKind
  entityId: string
  fingerprint: string
  updatedAt: string
  viewModel: T
}

export interface ArticleSection {
  id: string
  kind: 'lead' | 'paper-pass' | 'comparison' | 'evidence' | 'figure' | 'table' | 'formula' | 'critique' | 'closing'
  title: string
  body: string[]
  anchorId?: string
  paperId?: string
  paperTitle?: string
  evidenceIds?: string[]
}

export type ArticleFlowBlock =
  | {
      id: string
      type: 'text'
      title?: string
      body: string[]
      anchorId?: string
      paperId?: string
      paperTitle?: string
    }
  | {
      id: string
      type: 'paper-break'
      paperId: string
      title: string
      titleEn?: string
      role: string
      contribution: string
      route: string
      publishedAt?: string
      originalUrl?: string
      pdfUrl?: string
    }
  | {
      id: string
      type: 'comparison'
      title: string
      summary: string
      points: Array<{
        label: string
        detail: string
      }>
    }
  | {
      id: string
      type: 'figure' | 'table' | 'formula'
      evidence: EvidenceExplanation
    }
  | {
      id: string
      type: 'critique'
      title: string
      summary: string
      bullets: string[]
    }
  | {
      id: string
      type: 'closing'
      title?: string
      body: string[]
    }

export interface EvidenceExplanation {
  anchorId: string
  type: 'section' | EvidenceType
  route: string
  title: string
  label: string
  quote: string
  content: string
  page: number | null
  sourcePaperId?: string
  sourcePaperTitle?: string
  imagePath?: string | null
  whyItMatters?: string
  formulaLatex?: string | null
  explanation?: string
  importance?: number
  placementHint?: string
  thumbnailPath?: string | null
}

export interface ReviewerCritique {
  title: string
  summary: string
  bullets: string[]
}

function isRenderableEvidence(
  item: EvidenceExplanation,
): item is EvidenceExplanation & { type: EvidenceType } {
  return item.type === 'figure' || item.type === 'table' || item.type === 'formula'
}

export interface CrossPaperComparisonBlock {
  id: string
  title: string
  summary: string
  papers: Array<{
    paperId: string
    title: string
    route: string
    role: string
  }>
  points: Array<{
    label: string
    detail: string
  }>
}

export interface PaperRole {
  paperId: string
  title: string
  titleEn: string
  route: string
  summary: string
  publishedAt: string
  role: string
  contribution: string
  figuresCount: number
  tablesCount: number
  formulasCount: number
  coverImage: string | null
  originalUrl?: string
  pdfUrl?: string
}

export interface PaperViewModel {
  schemaVersion: string
  paperId: string
  title: string
  titleEn: string
  summary: string
  explanation: string
  publishedAt: string
  authors: string[]
  citationCount: number | null
  coverImage: string | null
  originalUrl?: string
  pdfUrl?: string
  topic: {
    topicId: string
    title: string
    route: string
  }
  stageWindowMonths?: number
  stats: {
    sectionCount: number
    figureCount: number
    tableCount: number
    formulaCount: number
    relatedNodeCount: number
  }
  relatedNodes: Array<{
    nodeId: string
    title: string
    subtitle: string
    summary: string
    stageIndex: number
    stageLabel?: string
    route: string
  }>
  standfirst: string
  article: {
    periodLabel: string
    timeRangeLabel: string
    flow: ArticleFlowBlock[]
    sections: ArticleSection[]
    closing: string[]
  }
  critique: ReviewerCritique
  evidence: EvidenceExplanation[]
}

export interface NodeViewModel {
  schemaVersion: string
  nodeId: string
  title: string
  titleEn: string
  headline: string
  subtitle: string
  summary: string
  explanation: string
  stageIndex: number
  stageLabel?: string
  updatedAt: string
  isMergeNode: boolean
  provisional: boolean
  topic: {
    topicId: string
    title: string
    route: string
  }
  stageWindowMonths?: number
  stats: {
    paperCount: number
    figureCount: number
    tableCount: number
    formulaCount: number
  }
  standfirst: string
  paperRoles: PaperRole[]
  comparisonBlocks: CrossPaperComparisonBlock[]
  article: {
    periodLabel: string
    timeRangeLabel: string
    flow: ArticleFlowBlock[]
    sections: ArticleSection[]
    closing: string[]
  }
  critique: ReviewerCritique
  evidence: EvidenceExplanation[]
  /** 增强版文章流（8-Pass深度解析）- 可选，用于新格式 */
  enhancedArticleFlow?: import('./deep-article-generator').NodeArticleFlowBlock[]
}

type ReaderArtifactViewModel = NodeViewModel | PaperViewModel

function readerArtifactKey(kind: ReaderArtifactKind, entityId: string) {
  return `${READER_ARTIFACT_PREFIX}${kind}:${entityId}`
}

function normalizeReaderNarrative(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function countDistinctNarrativeYears(value: string | null | undefined) {
  return new Set(
    Array.from((value ?? '').matchAll(/\b((?:19|20)\d{2})\b/gu)).map((match) => match[1]),
  ).size
}

function countDistinctNarrativeYearMonths(value: string | null | undefined) {
  return new Set(
    Array.from((value ?? '').matchAll(/\b((?:19|20)\d{2})[.\-/年]\s*(\d{1,2})/gu)).map(
      (match) => `${match[1]}-${match[2].padStart(2, '0')}`,
    ),
  ).size
}

function parseChineseNumeral(value: string) {
  const normalized = value.trim()
  if (!normalized) return null
  if (/^\d+$/u.test(normalized)) {
    return Number.parseInt(normalized, 10)
  }

  const digitMap: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }

  if (normalized === '十') return 10
  if (normalized.startsWith('十')) {
    const units = digitMap[normalized.slice(1)] ?? 0
    return 10 + units
  }

  if (normalized.endsWith('十')) {
    const tens = digitMap[normalized.slice(0, -1)] ?? 1
    return tens * 10
  }

  const tenIndex = normalized.indexOf('十')
  if (tenIndex >= 0) {
    const tens = digitMap[normalized.slice(0, tenIndex)] ?? 1
    const units = digitMap[normalized.slice(tenIndex + 1)] ?? 0
    return tens * 10 + units
  }

  const direct = digitMap[normalized]
  return Number.isFinite(direct) ? direct : null
}

function extractNarrativePaperCountClaim(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return null

  const match = normalized.match(/([零〇一二两三四五六七八九十\d]+)\s*篇论文/u)
  if (!match?.[1]) return null
  return parseChineseNumeral(match[1])
}

function looksLikeStaleNodeNarrative(
  value: string | null | undefined,
  actualPaperCount: number,
) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return false
  if (HEURISTIC_NARRATIVE_RE.test(normalized)) return true
  if (LOW_SIGNAL_NODE_COPY_PATTERNS.some((pattern) => pattern.test(normalized))) return true

  const claimedPaperCount = extractNarrativePaperCountClaim(normalized)
  if (
    typeof claimedPaperCount === 'number' &&
    actualPaperCount > 0 &&
    claimedPaperCount !== actualPaperCount
  ) {
    return true
  }

  if (actualPaperCount <= 1 && /横跨/u.test(normalized) && countDistinctNarrativeYears(normalized) >= 2) {
    return true
  }

  if (actualPaperCount <= 1 && countDistinctNarrativeYearMonths(normalized) >= 2) {
    return true
  }

  return false
}

const LOW_SIGNAL_PAPER_SUMMARY_PATTERNS = [
  /^(?:computer science|artificial intelligence|reinforcement learning(?: in robotics)?|autonomous vehicle technology and safety|advanced neural network applications|multimodal machine learning applications|transportation and mobility innovations|computer graphics and visualization techniques|domain adaptation and few-shot learning)$/iu,
]

function normalizePaperNarrativeText(value: string | null | undefined, maxLength = 320) {
  const normalized = clipText(value ?? '', maxLength)
  if (!normalized) return ''
  if (HEURISTIC_NARRATIVE_RE.test(normalized)) return ''
  if (LOW_SIGNAL_PAPER_SUMMARY_PATTERNS.some((pattern) => pattern.test(normalized))) return ''
  if (normalized.length <= 96 && /^[A-Za-z][A-Za-z/&,\- ]+$/u.test(normalized) && !/[.?!:;]/u.test(normalized)) {
    return ''
  }
  return normalized
}

function stripFrontMatterLead(value: string) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return ''

  const abstractIndex = normalized.search(/\babstract\b/iu)
  if (abstractIndex > 0 && abstractIndex <= 240) {
    return normalized
      .slice(abstractIndex)
      .replace(/^abstract\b\s*[—:\-]?\s*/iu, '')
      .trim()
  }

  if (/^abstract\b/iu.test(normalized)) {
    return normalized.replace(/^abstract\b\s*[—:\-]?\s*/iu, '').trim()
  }

  const figureCaptionIndex = normalized.search(/\bfig(?:ure)?\.?\s*\d+[a-z]?\b/iu)
  if (figureCaptionIndex >= 0 && figureCaptionIndex <= 120) {
    const trimmed = normalized
      .replace(/^.*?\bfig(?:ure)?\.?\s*\d+[a-z]?\s*[:.]?\s*/iu, '')
      .trim()
    if (trimmed.length >= 80) {
      return trimmed
    }
  }

  return normalized
}

function looksLikeTitleFragment(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return false
  if (normalized.length > 180) return false
  if (/[.!?。！？:：;]/u.test(normalized)) return false

  const tokens = normalized.split(/\s+/u).filter(Boolean)
  if (tokens.length < 3) return false

  const capitalizedTokens = tokens.filter((token) => /^[A-Z][A-Za-z0-9'’:/\-]+$/u.test(token)).length
  const ratio = capitalizedTokens / tokens.length
  return ratio >= 0.6
}

function hasNarrativeSubstance(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return false
  if (normalized.length >= 140) return true
  if (/[.!?。！？]/u.test(normalized) && /[a-z\u4e00-\u9fff]/u.test(normalized)) return true
  return false
}

function cleanExtractedParagraph(value: string | null | undefined) {
  const stripped = stripFrontMatterLead(value ?? '')
  if (!stripped) return ''

  const abstractBody =
    stripped.match(/\babstract\b[^A-Za-z0-9]{0,8}(.*)$/iu)?.[1]?.trim() ?? ''
  const normalized = abstractBody.length >= 40 ? abstractBody : stripped

  if (looksLikeTitleFragment(normalized)) return ''
  if (LOW_SIGNAL_SECTION_BODY_PATTERNS.some((pattern) => pattern.test(normalized))) return ''
  if (HTML_SECTION_NOISE_RE.test(normalized)) return ''
  return normalized
}

function inferSectionTitleFromParagraphs(
  title: string,
  paragraphs: string[],
) {
  const normalizedTitle = normalizeReaderNarrative(title)
  if (!BODY_SECTION_TITLE_RE.test(normalizedTitle)) return normalizedTitle

  const content = paragraphs.join(' ')
  if (/(?:result|evaluation|benchmark|leaderboard|ablation|mAP|ADE|FDE|IoU|score)/iu.test(content)) {
    return 'Results and evidence'
  }
  if (/(?:architecture|framework|encoder|decoder|latent|policy|occupancy|world model|transformer|method)/iu.test(content)) {
    return 'Method and structure'
  }
  if (/(?:discussion|limitation|boundary|future work|open problem|challenge)/iu.test(content)) {
    return 'Boundary and discussion'
  }

  return 'Method and structure'
}

function buildPaperContributionSeed(paper: any) {
  const paperTitle = paper.titleZh || paper.title
  const sectionLead =
    getRenderablePaperSections(paper, 3)
      .flatMap((section: any) => section.renderParagraphs as string[])
      .map((paragraph: string) => clipText(paragraph, 180))
      .find((value: string) => value.length > 0) ?? ''

  const abstractLead = normalizePaperNarrativeText(paper.summary, 180)
  const evidenceLine =
    paper.figures.length + paper.tables.length + paper.formulas.length > 0
      ? `当前可直接提取 ${paper.figures.length} 张图、${paper.tables.length} 张表和 ${paper.formulas.length} 个公式。`
      : '当前数据库还没有提取到图、表、公式，需要结合原文继续核对关键证据。'

  return clipText(
    [abstractLead, sectionLead, evidenceLine]
      .filter(Boolean)
      .join(' ')
      .trim() || `《${paperTitle}》是这个节点当前最直接的论文入口。`,
    220,
  )
}

function buildNodeNarrativeSeed(args: {
  node: {
    nodeLabel: string
    nodeSubtitle?: string | null
  }
  papers: any[]
}) {
  const { node, papers } = args
  const primaryPaper = papers[0] ?? null
  const primaryPaperTitle = primaryPaper?.titleZh || primaryPaper?.title || '代表论文'
  const abstractLead = primaryPaper ? normalizePaperNarrativeText(primaryPaper.summary, 180) : ''
  const paperCount = papers.length
  const evidenceCount = papers.reduce(
    (count, paper) => count + paper.figures.length + paper.tables.length + paper.formulas.length,
    0,
  )

  if (paperCount <= 1) {
    return {
      summary: clipText(
        `当前阶段的「${node.nodeLabel}」节点只纳入《${primaryPaperTitle}》这一篇论文，因此它首先是一篇单篇深读入口，用来说明这条问题线到底从哪里起步。`,
        200,
      ),
      explanation: clipText(
        [
          abstractLead,
          evidenceCount > 0
            ? `现有证据里已经抽出 ${evidenceCount} 个图、表或公式，可以围绕关键实验继续细读。`
            : '目前还没有抽出图、表、公式，所以这篇文章更适合先讲清问题设定、方法机制和原文入口，再继续补证据。',
        ]
          .filter(Boolean)
          .join(' ')
          .trim(),
        260,
      ),
      standfirst: clipText(
        [
          `「${node.nodeLabel}」目前仍以《${primaryPaperTitle}》为单篇入口。`,
          abstractLead,
        ]
          .filter(Boolean)
          .join(' ')
          .trim(),
        280,
      ),
      headline: `先把《${clipText(primaryPaperTitle, 36)}》在「${node.nodeLabel}」里真正推进了什么讲清楚。`,
    }
  }

  const earliestPaper = [...papers]
    .sort((left, right) => +new Date(left.published) - +new Date(right.published))[0]
  const latestPaper = [...papers]
    .sort((left, right) => +new Date(right.published) - +new Date(left.published))[0]

  return {
    summary: clipText(
      `这一节点收拢了同一阶段里的 ${paperCount} 篇论文，围绕「${node.nodeLabel}」这一问题展开，而不是把论文标题机械并列。`,
      200,
    ),
    explanation: clipText(
      [
        earliestPaper
          ? `最早的入口是《${earliestPaper.titleZh || earliestPaper.title}》，较新的补充来自《${latestPaper.titleZh || latestPaper.title}》。`
          : '',
        abstractLead,
      ]
        .filter(Boolean)
        .join(' ')
        .trim(),
      260,
    ),
    standfirst: clipText(
      `这一节点把 ${paperCount} 篇论文压到同一条问题线上来读，目标是讲清谁先提出问题、谁补强证据、谁真正把方法推到了下一步。`,
      280,
    ),
    headline: `把「${node.nodeLabel}」拆成一条可以顺着读完的阶段内研究线。`,
  }
}

function sanitizeNodeParagraphs(
  values: Array<string | null | undefined>,
  actualPaperCount: number,
  fallback: string[],
) {
  const seen = new Set<string>()
  const sanitized = values
    .map((value) => cleanExtractedParagraph(value))
    .filter((value) => value.length > 0)
    .filter((value) => !looksLikeStaleNodeNarrative(value, actualPaperCount))
    .filter((value) => {
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })

  return sanitized.length > 0 ? sanitized : fallback
}

async function readReaderArtifact<T>(kind: ReaderArtifactKind, entityId: string) {
  const record = await prisma.systemConfig.findUnique({
    where: { key: readerArtifactKey(kind, entityId) },
  })

  if (!record?.value) return null

  try {
    return JSON.parse(record.value) as ReaderArtifactRecord<T>
  } catch {
    return null
  }
}

async function persistReaderArtifact<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  fingerprint: string,
  viewModel: T,
) {
  const payload: ReaderArtifactRecord<T> = {
    kind,
    entityId,
    fingerprint,
    updatedAt: new Date().toISOString(),
    viewModel,
  }

  await prisma.systemConfig.upsert({
    where: { key: readerArtifactKey(kind, entityId) },
    update: { value: JSON.stringify(payload) },
    create: { key: readerArtifactKey(kind, entityId), value: JSON.stringify(payload) },
  })

  if (kind === 'node') {
    await upsertTopicArtifactIndexEntry(kind, viewModel as ReaderArtifactViewModel as NodeViewModel)
  } else {
    await upsertTopicArtifactIndexEntry(kind, viewModel as ReaderArtifactViewModel as PaperViewModel)
  }
}

async function loadReaderResearchPipelineContext(args: {
  topicId: string
  nodeId?: string
  paperIds?: string[]
  stageIndex?: number
  historyLimit?: number
}) {
  const cognitiveSubject =
    typeof args.nodeId === 'string' && args.nodeId.trim()
      ? {
          subjectType: 'node' as const,
          subjectId: args.nodeId,
        }
      : Array.isArray(args.paperIds) &&
          args.paperIds.length === 1 &&
          typeof args.paperIds[0] === 'string' &&
          args.paperIds[0].trim()
        ? {
            subjectType: 'paper' as const,
            subjectId: args.paperIds[0],
          }
        : {
            subjectType: 'topic' as const,
            subjectId: args.topicId,
          }

  const [state, sessionMemory, guidance, cognitiveMemory] = await Promise.all([
    loadResearchPipelineState(args.topicId),
    collectTopicSessionMemoryContext(args.topicId, {
      recentLimit: 4,
    }),
    loadTopicGuidanceLedger(args.topicId),
    collectTopicCognitiveMemory({
      topicId: args.topicId,
      subjectType: cognitiveSubject.subjectType,
      subjectId: cognitiveSubject.subjectId,
      recentLimit: 6,
    }),
  ])

  return {
    ...buildResearchPipelineContext(state, {
      nodeId: args.nodeId,
      paperIds: args.paperIds,
      stageIndex: args.stageIndex,
      historyLimit: args.historyLimit,
    }),
    sessionMemory: sessionMemory.summary,
    recentSessionEvents: sessionMemory.recentEvents,
    guidance: compactTopicGuidanceContext(guidance),
    cognitiveMemory,
  }
}

export async function buildPaperArtifactFingerprint(paperId: string) {
  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      topicId: true,
      updatedAt: true,
      nodePapers: {
        select: {
          nodeId: true,
          node: {
            select: {
              updatedAt: true,
              stageIndex: true,
            },
          },
        },
      },
    },
  })

  if (!paper) return null

  const [runtime, topicMemory, sessionMemory, researchPipeline, modelConfigFingerprint, paperTemplate, reviewerTemplate] = await Promise.all([
    getGenerationRuntimeConfig(),
    loadTopicGenerationMemory(paper.topicId),
    loadTopicSessionMemory(paper.topicId),
    loadReaderResearchPipelineContext({
      topicId: paper.topicId,
      paperIds: [paper.id],
      stageIndex:
        paper.nodePapers
          .map((entry) => entry.node.stageIndex)
          .filter((value): value is number => typeof value === 'number')
          .sort((left, right) => left - right)[0] ?? undefined,
      historyLimit: 6,
    }),
    getModelConfigFingerprint(),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.ARTICLE_PAPER),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.ARTICLE_REVIEWER),
  ])

  return buildGenerationFingerprint({
    kind: 'paper',
    artifactSchemaVersion: PAPER_READER_ARTIFACT_SCHEMA_VERSION,
    paperId: paper.id,
    topicId: paper.topicId,
    paperUpdatedAt: paper.updatedAt.toISOString(),
    relatedNodes: paper.nodePapers.map((entry) => ({
      nodeId: entry.nodeId,
      updatedAt: entry.node.updatedAt.toISOString(),
    })),
    runtime,
    modelConfigFingerprint,
    promptTemplates: [paperTemplate, reviewerTemplate],
    topicMemoryUpdatedAt: topicMemory.updatedAt,
    sessionMemoryUpdatedAt: sessionMemory.updatedAt,
    researchPipeline,
  })
}

export async function buildNodeArtifactFingerprint(nodeId: string) {
  const node = await prisma.researchNode.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      topicId: true,
      stageIndex: true,
      nodeLabel: true,
      nodeSubtitle: true,
      nodeSummary: true,
      nodeExplanation: true,
      updatedAt: true,
      primaryPaperId: true,
      primaryPaper: {
        select: {
          title: true,
          titleZh: true,
          titleEn: true,
        },
      },
      papers: {
        select: {
          paperId: true,
        },
      },
    },
  })

  if (!node) return null

  const [
    stage,
    topicPapers,
    runtime,
    topicMemory,
    sessionMemory,
    modelConfigFingerprint,
    nodeTemplate,
    comparisonTemplate,
    reviewerTemplate,
    effectiveStageWindowMonths,
  ] = await Promise.all([
    prisma.topicStage.findFirst({
      where: {
        topicId: node.topicId,
        order: node.stageIndex,
      },
      select: {
        name: true,
        nameEn: true,
      },
    }),
    prisma.paper.findMany({
      where: { topicId: node.topicId },
      select: {
        id: true,
        title: true,
        titleZh: true,
        titleEn: true,
        summary: true,
        explanation: true,
        coverPath: true,
        updatedAt: true,
        published: true,
        figures: {
          select: {
            id: true,
          },
        },
      },
    }),
    getGenerationRuntimeConfig(),
    loadTopicGenerationMemory(node.topicId),
    loadTopicSessionMemory(node.topicId),
    getModelConfigFingerprint(),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.ARTICLE_NODE),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.ARTICLE_CROSS_PAPER),
    getPromptTemplate(PROMPT_TEMPLATE_IDS.ARTICLE_REVIEWER),
    resolveTopicStageWindowMonths(node.topicId),
  ])
  const temporalStageBuckets = await loadTopicTemporalStageBuckets(
    node.topicId,
    effectiveStageWindowMonths,
  )
  const allowedPaperIds = collectNodeStageScopedPaperIds(node.id, temporalStageBuckets)

  const relatedPaperIds = collectNodeRelatedPaperIds({
    node,
    stageTitle: [stage?.name, stage?.nameEn].filter(Boolean).join(' '),
    papers: topicPapers,
    allowedPaperIds,
  })
  const relatedPaperMap = new Map(topicPapers.map((paper) => [paper.id, paper]))
  const relatedPapers = relatedPaperIds
    .map((paperId) => relatedPaperMap.get(paperId) ?? null)
    .filter((paper): paper is (typeof topicPapers)[number] => Boolean(paper))
  const researchPipeline = await loadReaderResearchPipelineContext({
    topicId: node.topicId,
    nodeId: node.id,
    paperIds: relatedPapers.map((paper) => paper.id),
    stageIndex: node.stageIndex,
    historyLimit: 6,
  })

  return buildGenerationFingerprint({
    kind: 'node',
    artifactSchemaVersion: NODE_READER_ARTIFACT_SCHEMA_VERSION,
    nodeId: node.id,
    topicId: node.topicId,
    nodeUpdatedAt: node.updatedAt.toISOString(),
    primaryPaperId: node.primaryPaperId,
    relatedPapers: relatedPapers.map((paper) => ({
      paperId: paper.id,
      updatedAt: paper.updatedAt.toISOString(),
    })),
    runtime,
    modelConfigFingerprint,
    promptTemplates: [nodeTemplate, comparisonTemplate, reviewerTemplate],
    topicMemoryUpdatedAt: topicMemory.updatedAt,
    sessionMemoryUpdatedAt: sessionMemory.updatedAt,
    researchPipeline,
  })
}

interface ReaderArtifactDriver<T> {
  kind: ReaderArtifactKind
  buildFingerprint: (entityId: string) => Promise<string | null>
  buildViewModel: (entityId: string, options?: { quick?: boolean }) => Promise<T>
}

const DEFERRED_READER_ARTIFACTS_DISABLED =
  process.env.TOPIC_ARTIFACT_DISABLE_DEFERRED === '1' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT === 'child-v8' ||
  process.env.NODE_ENV === 'test'

function readerArtifactQueueKey(kind: ReaderArtifactKind, entityId: string) {
  return `${kind}:${entityId}`
}

async function buildAndPersistReaderArtifact<T>(
  driver: ReaderArtifactDriver<T>,
  entityId: string,
) {
  const viewModel = await driver.buildViewModel(entityId)
  const fingerprint = await driver.buildFingerprint(entityId)
  if (fingerprint) {
    await persistReaderArtifact(driver.kind, entityId, fingerprint, viewModel)
  }
  return viewModel
}

function queueReaderArtifactBuild<T>(
  driver: ReaderArtifactDriver<T>,
  entityId: string,
) {
  const queueKey = readerArtifactQueueKey(driver.kind, entityId)
  const existing = readerArtifactBuildQueue.get(queueKey)
  if (existing) return existing as Promise<T>

  const job = (async () => {
    try {
      return await buildAndPersistReaderArtifact(driver, entityId)
    } finally {
      readerArtifactBuildQueue.delete(queueKey)
    }
  })()

  readerArtifactBuildQueue.set(queueKey, job)
  return job
}

async function resolveReaderArtifact<T>(
  driver: ReaderArtifactDriver<T>,
  entityId: string,
  options?: { forceRebuild?: boolean },
) {
  if (options?.forceRebuild) {
    return queueReaderArtifactBuild(driver, entityId)
  }

  const fingerprintBeforeBuild = await driver.buildFingerprint(entityId)
  if (fingerprintBeforeBuild) {
    const cached = await readReaderArtifact<T>(driver.kind, entityId)
    if (cached?.fingerprint === fingerprintBeforeBuild) {
      return cached.viewModel
    }

    if (cached) {
      const quickViewModel = await persistQuickReaderArtifact(
        driver.kind,
        entityId,
        driver.buildFingerprint,
        driver.buildViewModel,
      )
      if (!DEFERRED_READER_ARTIFACTS_DISABLED) {
        void queueReaderArtifactBuild(driver, entityId).catch((error) => {
          if (error instanceof AppError && error.statusCode === 404) {
            return
          }
        })
      }
      return quickViewModel
    }
  }

  const quickViewModel = await persistQuickReaderArtifact(
    driver.kind,
    entityId,
    driver.buildFingerprint,
    driver.buildViewModel,
  )
  if (!DEFERRED_READER_ARTIFACTS_DISABLED) {
    void queueReaderArtifactBuild(driver, entityId).catch((error) => {
      if (error instanceof AppError && error.statusCode === 404) {
        return
      }
    })
  }
  return quickViewModel
}

async function syncPersistedReaderArtifactFingerprint<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  buildFingerprint: (entityId: string) => Promise<string | null>,
) {
  const [cached, fingerprint] = await Promise.all([
    readReaderArtifact<T>(kind, entityId),
    buildFingerprint(entityId),
  ])

  if (cached && fingerprint && cached.fingerprint !== fingerprint) {
    await persistReaderArtifact(kind, entityId, fingerprint, cached.viewModel)
  }
}

function buildDeferredArtifactFingerprint(fingerprint: string | null, entityId: string) {
  return fingerprint ? `quick:${fingerprint}` : `quick:${entityId}:${Date.now()}`
}

async function persistQuickReaderArtifact<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  buildFingerprint: (entityId: string) => Promise<string | null>,
  buildViewModel: (entityId: string, options?: { quick?: boolean }) => Promise<T>,
) {
  const [viewModel, fingerprint] = await Promise.all([
    buildViewModel(entityId, { quick: true }),
    buildFingerprint(entityId),
  ])

  await persistReaderArtifact(
    kind,
    entityId,
    buildDeferredArtifactFingerprint(fingerprint, entityId),
    viewModel,
  )

  return viewModel
}

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    await Promise.all(batch.map((item) => worker(item)))
  }
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
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

function splitParagraphs(value: string | null | undefined, maxParts = 5) {
  const raw = (value ?? '').split(/\n+/u).map((item) => item.trim()).filter(Boolean)
  if (raw.length > 0) return raw.slice(0, maxParts)

  const compact = clipText(value ?? '', 820)
  return compact
    ? compact
        .split(/(?<=[。！？?!])/u)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxParts)
    : []
}

function parseStoredParagraphs(value: string | null | undefined, maxParts = 5) {
  if (!value) return [] as string[]

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      const paragraphs = sanitizeStoredParagraphList(
        parsed.flatMap((item) => (typeof item === 'string' ? [item] : [])),
        maxParts,
      )

      if (paragraphs.length > 0) {
        return paragraphs
      }
    }

    if (typeof parsed === 'string') {
      return sanitizeStoredParagraphList(splitParagraphs(parsed, maxParts), maxParts)
    }
  } catch {
    return sanitizeStoredParagraphList(splitParagraphs(value, maxParts), maxParts)
  }

  return sanitizeStoredParagraphList(splitParagraphs(value, maxParts), maxParts)
}

function joinStoredParagraphs(value: string | null | undefined, maxParts = 6) {
  return parseStoredParagraphs(value, maxParts).join('\n\n')
}

function looksLikeLowValueSectionTitleText(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  return Boolean(normalized) && LOW_SIGNAL_SECTION_TITLE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function looksLikeLowValueSectionBody(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return true
  if (HTML_SECTION_NOISE_RE.test(normalized)) return true
  if ((normalized.match(/\.{4,}/gu)?.length ?? 0) >= 1 && /\d{1,4}$/u.test(normalized)) {
    return true
  }
  if (
    (normalized.match(/\b\d+\.\d+\b/gu)?.length ?? 0) >= 3 &&
    (((normalized.match(/\b(?:examples?|figure|fig\.?|table|chapter|appendix)\b/giu)?.length ??
      0) >= 2) ||
      (normalized.match(/\.{2,}/gu)?.length ?? 0) >= 1)
  ) {
    return true
  }
  return LOW_SIGNAL_SECTION_BODY_PATTERNS.some((pattern) => pattern.test(normalized))
}

function sanitizeStoredParagraphList(
  values: Array<string | null | undefined>,
  maxParts = 5,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = cleanExtractedParagraph(value)
    if (!normalized || looksLikeLowValueSectionBody(normalized) || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= maxParts) break
  }

  return output
}

function getRenderablePaperSections(paper: any, maxParts = 5) {
  if (!Array.isArray(paper.sections)) return [] as Array<any & { renderTitle: string; renderParagraphs: string[] }>

  return paper.sections
    .map((section: any) => {
      const rawTitle = normalizeReaderNarrative(
        section.editorialTitle || section.sourceSectionTitle,
      )
      const renderParagraphs = sanitizeStoredParagraphList(
        parseStoredParagraphs(section.paragraphs, maxParts),
        maxParts,
      )
      const renderTitle = inferSectionTitleFromParagraphs(rawTitle, renderParagraphs)
      if (
        !renderTitle ||
        looksLikeLowValueSectionTitleText(renderTitle) ||
        renderParagraphs.length === 0 ||
        !renderParagraphs.some((paragraph) => hasNarrativeSubstance(paragraph))
      ) {
        return null
      }

      return {
        ...section,
        renderTitle,
        renderParagraphs,
      }
    })
    .filter(
      (
        section: (any & { renderTitle: string; renderParagraphs: string[] }) | null,
      ): section is any & { renderTitle: string; renderParagraphs: string[] } => Boolean(section),
    )
}

function uniqueNarrativeParagraphs(values: Array<string | null | undefined>, maxParts = 4) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value?.replace(/\s+/gu, ' ').trim() ?? ''
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= maxParts) break
  }

  return output
}

function buildPaperEvidenceCoverageLine(paper: any) {
  return [
    paper.figures.length > 0 ? `${paper.figures.length} figure${paper.figures.length > 1 ? 's' : ''}` : '',
    paper.tables.length > 0 ? `${paper.tables.length} table${paper.tables.length > 1 ? 's' : ''}` : '',
    paper.formulas.length > 0 ? `${paper.formulas.length} formula${paper.formulas.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

function buildPaperEvidenceCaptionSummary(paper: any) {
  return [
    ...paper.figures.slice(0, 1).map((figure: any) => clipText(figure.caption, 120)),
    ...paper.tables.slice(0, 1).map((table: any) => clipText(table.caption || table.rawText, 120)),
    ...paper.formulas.slice(0, 1).map((formula: any) => clipText(formula.rawText || formula.latex, 120)),
  ]
    .filter(Boolean)
    .join(' ')
}

function buildFigureWhyItMatters(figure: any) {
  const evidenceText = [figure.caption, figure.analysis].filter(Boolean).join(' ')
  if (/(?:architecture|framework|overview|pipeline|policy|encoder|decoder|occupancy)/iu.test(evidenceText)) {
    return '这张图主要交代模型结构、状态表示或模块之间的连接方式。'
  }
  if (/(?:trajectory|prediction|simulation|rollout|future|qualitative|scenario)/iu.test(evidenceText)) {
    return '这张图主要展示预测或仿真输出，用来判断模型是否保留了驾驶场景的动态结构。'
  }
  return GENERIC_FIGURE_LABEL_RE.test((figure.caption ?? '').trim())
    ? '这张图是论文里的关键配图，建议结合原文页码继续核对具体标注。'
    : '这张图展示了论文声称成立的关键现象或比较结果。'
}

function buildTableWhyItMatters(table: any) {
  const evidenceText = [table.caption, table.rawText].filter(Boolean).join(' ')
  if (/(?:leaderboard|ablation|result|benchmark|mAP|ADE|FDE|IoU|score|accuracy|collision|miss rate)/iu.test(evidenceText)) {
    return '这张表给出定量结果或消融设置，是判断方法是否真的优于基线的关键证据。'
  }
  return '这张表通常直接决定论文与基线之间的优劣是否成立。'
}

function buildFormulaWhyItMatters(formula: any) {
  const evidenceText = [formula.latex, formula.rawText].filter(Boolean).join(' ')
  if (/(?:loss|objective|min|max|likelihood|cost)/iu.test(evidenceText)) {
    return '这个公式定义了训练目标或优化约束，决定方法究竟在学什么。'
  }
  return '这个公式说明了方法真正依赖的约束、目标或更新方式。'
}

function looksLikeEvidenceNoise(item: EvidenceExplanation) {
  const quote = normalizeReaderNarrative(item.quote)
  const content = normalizeReaderNarrative(item.content)

  if (!content) return true

  if (
    item.type === 'figure' &&
    GENERIC_FIGURE_LABEL_RE.test(quote) &&
    !normalizeReaderNarrative(item.explanation).length &&
    content.length <= 12
  ) {
    return true
  }

  if (
    item.type === 'table' &&
    (content.match(/\b\d+\.\d+\b/gu)?.length ?? 0) >= 3 &&
    (((content.match(/\b(?:examples?|figure|fig\.?|table|chapter|appendix)\b/giu)?.length ?? 0) >=
      3) ||
      (content.match(/\.{2,}/gu)?.length ?? 0) >= 1)
  ) {
    return true
  }

  if (
    item.type === 'table' &&
    GENERIC_TABLE_LABEL_RE.test(quote) &&
    (content.match(/[.!?]/gu)?.length ?? 0) >= 4 &&
    !/(?:leaderboard|ablation|result|benchmark|mAP|ADE|FDE|IoU|score|accuracy|collision|miss rate)/iu.test(
      content,
    )
  ) {
    return true
  }

  if (
    item.type === 'formula' &&
    (!item.formulaLatex ||
      item.formulaLatex.trim().length < 3 ||
      /^#+$/u.test(item.formulaLatex.trim()))
  ) {
    return true
  }

  return false
}

function scoreEvidenceForArticle(item: EvidenceExplanation) {
  const quote = normalizeReaderNarrative(item.quote)
  const content = normalizeReaderNarrative(item.content)
  let score = item.type === 'table' ? 7 : item.type === 'formula' ? 8 : item.type === 'section' ? 6 : 5

  if (looksLikeEvidenceNoise(item)) score -= 8
  if (item.type === 'figure' && GENERIC_FIGURE_LABEL_RE.test(quote)) score -= 5
  if (item.type === 'table' && GENERIC_TABLE_LABEL_RE.test(quote)) score -= 3
  if (item.type === 'formula' && GENERIC_FORMULA_LABEL_RE.test(quote)) score -= 3
  if (content.length >= 120) score += 2
  if (content.length >= 260) score += 1
  if (/(?:leaderboard|ablation|result|benchmark|mAP|ADE|FDE|IoU|score|accuracy|collision|miss rate)/iu.test(content)) score += 4
  if (/(?:architecture|framework|pipeline|encoder|decoder|policy|occupancy|latent|simulation|prediction|trajectory)/iu.test(content)) score += 2
  if (item.type === 'formula' && item.formulaLatex && /[A-Za-z]/u.test(item.formulaLatex) && /[=+\-/*]/u.test(item.formulaLatex)) score += 4
  if (item.type === 'figure' && item.imagePath) score += 1
  if (item.type === 'section' && !hasNarrativeSubstance(content)) score -= 3

  return score
}

function selectArticleEvidence(
  evidence: EvidenceExplanation[],
  limits?: {
    figureLimit?: number
    tableLimit?: number
    formulaLimit?: number
    totalLimit?: number
  },
) {
  const figureLimit = limits?.figureLimit ?? 2
  const tableLimit = limits?.tableLimit ?? 2
  const formulaLimit = limits?.formulaLimit ?? 1
  const totalLimit = limits?.totalLimit ?? 5

  const ranked = evidence
    .filter(isRenderableEvidence)
    .map((item) => ({
      item,
      score: item.importance ?? scoreEvidenceForArticle(item),
    }))
    .sort((left, right) => right.score - left.score)

  const counts = {
    figure: 0,
    table: 0,
    formula: 0,
  }
  const selected: EvidenceExplanation[] = []

  for (const entry of ranked) {
    if (selected.length >= totalLimit) break
    const item = entry.item
    if (looksLikeEvidenceNoise(item)) continue
    if (item.type === 'figure' && counts.figure >= figureLimit) continue
    if (item.type === 'table' && counts.table >= tableLimit) continue
    if (item.type === 'formula' && counts.formula >= formulaLimit) continue
    if (entry.score <= 0) continue

    selected.push(item)
    if (item.type === 'figure') counts.figure += 1
    if (item.type === 'table') counts.table += 1
    if (item.type === 'formula') counts.formula += 1
  }

  return selected
}

function buildFallbackPaperSections(paper: any, evidence: EvidenceExplanation[]): ArticleSection[] {
  const evidenceCoverage = buildPaperEvidenceCoverageLine(paper)
  const evidenceCaptionSummary = buildPaperEvidenceCaptionSummary(paper)
  const links = resolvePaperSourceLinks({
    arxivUrl: paper.arxivUrl,
    pdfUrl: paper.pdfUrl,
    pdfPath: paper.pdfPath,
  })

  const sections: ArticleSection[] = [
    {
      id: 'paper-fallback-problem',
      kind: 'lead',
      title: '问题与入口',
      body: uniqueNarrativeParagraphs([
        normalizePaperNarrativeText(paper.summary, 320),
        paper.explanation ? normalizePaperNarrativeText(paper.explanation, 320) : '',
        links.originalUrl ? `Source: ${links.originalUrl}` : '',
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table'], 2),
    },
    {
      id: 'paper-fallback-method',
      kind: 'paper-pass',
      title: '方法与结构',
      body: uniqueNarrativeParagraphs([
        paper.explanation ? normalizePaperNarrativeText(paper.explanation, 320) : '',
        paper.formulas.length > 0
          ? `The extracted formulas help anchor the method definition in this paper.`
          : 'The method description currently depends on summaries and extracted page text, so deeper section grounding is still missing.',
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['formula', 'figure'], 2),
    },
    {
      id: 'paper-fallback-evidence',
      kind: 'evidence',
      title: '结果与证据',
      body: uniqueNarrativeParagraphs([
        evidenceCoverage
          ? `Available evidence in this paper: ${evidenceCoverage}.`
          : 'No renderable figures, tables, or formulas have been extracted yet, so the evidence chain is still thin.',
        evidenceCaptionSummary ? `Visible evidence cues: ${evidenceCaptionSummary}` : '',
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table', 'formula'], 3),
    },
    {
      id: 'paper-fallback-boundary',
      kind: 'paper-pass',
      title: '边界与未决问题',
      body: uniqueNarrativeParagraphs([
        paper.figures.length === 0 && paper.tables.length === 0
          ? 'Because the paper still lacks extracted comparative figures or tables, the current reading surface cannot fully verify its claims against competing methods.'
          : 'The paper now exposes local evidence, but cross-paper comparison still needs the node article to close the loop.',
        'This fallback structure is used because stable native sections are still unavailable for the current PDF.',
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['section', 'figure', 'table', 'formula'], 2),
    },
  ]

  return sections.filter((section) => section.body.length > 0)
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

function paperRoleLabel(index: number, isPrimary: boolean) {
  if (isPrimary) return '主线论文'
  if (index === 1) return '补强论文'
  if (index === 2) return '横向对照'
  return '延展论文'
}

function buildReviewerCritique(kind: 'paper' | 'node', bullets: string[]): ReviewerCritique {
  return {
    title: '严厉审稿人会追问什么',
    summary:
      kind === 'node'
        ? '这一节点是否真的已经被多篇论文共同坐实，关键取决于跨论文比较是否充分、证据是否互相支持，以及仍未解决的问题是否被正面写清。'
        : '这篇论文是否站得住，不只取决于方法是否新，还取决于证据是否足够、比较是否公平、结论是否超出了实验真正支持的范围。',
    bullets,
  }
}

function buildSectionEvidenceIds(evidence: EvidenceExplanation[], kinds: Array<'section' | 'figure' | 'table' | 'formula'>, limit = 2) {
  return evidence.filter((item) => kinds.includes(item.type)).slice(0, limit).map((item) => item.anchorId)
}

function buildPaperEvidence(paper: any): EvidenceExplanation[] {
  const renderableSections = getRenderablePaperSections(paper)
  return [
    ...renderableSections.map((section: any) => ({
      anchorId: `section:${section.id}`,
      type: 'section' as const,
      route: paperRoute(paper.id, `section:${section.id}`),
      title: section.renderTitle,
      label: `${paper.titleZh || paper.title} / ${section.renderTitle}`,
      quote: clipText(section.renderParagraphs.join('\n\n'), 220),
      content: section.renderParagraphs.join('\n\n'),
      page: null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      whyItMatters: '这一章节提供了论证链中的正文依据。',
    })),
    ...paper.figures.map((figure: any) => ({
      anchorId: `figure:${figure.id}`,
      type: 'figure' as const,
      route: paperRoute(paper.id, undefined, `figure:${figure.id}`),
      title: `Figure ${figure.number}`,
      label: `${paper.titleZh || paper.title} / Figure ${figure.number}`,
      quote: clipText(figure.caption),
      content: `${figure.caption}\n\n${figure.analysis ?? ''}`.trim(),
      page: figure.page ?? null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      imagePath: figure.imagePath,
      whyItMatters: '这张图展示了论文声称成立的关键现象或比较结果。',
    })),
    ...paper.tables.map((table: any) => ({
      anchorId: `table:${table.id}`,
      type: 'table' as const,
      route: paperRoute(paper.id, undefined, `table:${table.id}`),
      title: `Table ${table.number}`,
      label: `${paper.titleZh || paper.title} / Table ${table.number}`,
      quote: clipText(table.caption),
      content: `${table.caption}\n\n${table.rawText}`.trim(),
      page: table.page ?? null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      whyItMatters: '这张表通常直接决定论文与基线之间的优劣是否成立。',
    })),
    ...paper.formulas.map((formula: any) => ({
      anchorId: `formula:${formula.id}`,
      type: 'formula' as const,
      route: paperRoute(paper.id, undefined, `formula:${formula.id}`),
      title: `Formula ${formula.number}`,
      label: `${paper.titleZh || paper.title} / Formula ${formula.number}`,
      quote: clipText(formula.rawText || formula.latex),
      content: `${formula.latex}\n\n${formula.rawText ?? ''}`.trim(),
      page: formula.page ?? null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      formulaLatex: formula.latex,
      whyItMatters: '这个公式说明了方法真正依赖的约束、目标或更新方式。',
    })),
  ]
}

function buildRenderablePaperEvidence(paper: any): EvidenceExplanation[] {
  const renderableSections = getRenderablePaperSections(paper)
  const sectionEvidence = renderableSections.map((section: any) => ({
    anchorId: `section:${section.id}`,
    type: 'section' as const,
    route: paperRoute(paper.id, `section:${section.id}`),
    title: section.renderTitle,
    label: `${paper.titleZh || paper.title} / ${section.renderTitle}`,
    quote: clipText(section.renderParagraphs.join('\n\n'), 220),
    content: section.renderParagraphs.join('\n\n'),
    page: null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    whyItMatters: '这一章节提供了论证链中的正文依据。',
    importance: 6,
  }))

  const figureEvidence = paper.figures.map((figure: any) => ({
    anchorId: `figure:${figure.id}`,
    type: 'figure' as const,
    route: paperRoute(paper.id, undefined, `figure:${figure.id}`),
    title: `Figure ${figure.number}`,
    label: `${paper.titleZh || paper.title} / Figure ${figure.number}`,
    quote: clipText(figure.caption),
    content: `${figure.caption}\n\n${figure.analysis ?? ''}`.trim(),
    page: figure.page ?? null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    imagePath: figure.imagePath,
    whyItMatters: buildFigureWhyItMatters(figure),
  }))

  const tableEvidence = paper.tables.map((table: any) => ({
    anchorId: `table:${table.id}`,
    type: 'table' as const,
    route: paperRoute(paper.id, undefined, `table:${table.id}`),
    title: `Table ${table.number}`,
    label: `${paper.titleZh || paper.title} / Table ${table.number}`,
    quote: clipText(table.caption),
    content: `${table.caption}\n\n${table.rawText}`.trim(),
    page: table.page ?? null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    whyItMatters: buildTableWhyItMatters(table),
  }))

  const formulaEvidence = paper.formulas.map((formula: any) => ({
    anchorId: `formula:${formula.id}`,
    type: 'formula' as const,
    route: paperRoute(paper.id, undefined, `formula:${formula.id}`),
    title: `Formula ${formula.number}`,
    label: `${paper.titleZh || paper.title} / Formula ${formula.number}`,
    quote: clipText(formula.rawText || formula.latex),
    content: `${formula.latex}\n\n${formula.rawText ?? ''}`.trim(),
    page: formula.page ?? null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    formulaLatex: formula.latex,
    whyItMatters: buildFormulaWhyItMatters(formula),
  }))

  return [...sectionEvidence, ...figureEvidence, ...tableEvidence, ...formulaEvidence].map((item) => ({
    ...item,
    importance: item.importance ?? scoreEvidenceForArticle(item),
  }))
}

function buildPaperCritique(paper: any): ReviewerCritique {
  return buildReviewerCritique('paper', [
    paper.figures.length === 0
      ? '关键可视化证据偏少，结论更像依赖叙述而不是直接证据。'
      : '图像证据虽然存在，但仍需确认是否真正覆盖最关键的比较场景。',
    paper.tables.length === 0
      ? '缺少系统对比表，方法优越性是否稳定仍然可疑。'
      : '表格结果还需要继续追问统计显著性、公平设置和评价指标选择。',
    paper.formulas.length === 0
      ? '方法描述若缺少清晰公式或机制定义，复现边界会变得模糊。'
      : '即使给出了公式，也仍要检查符号假设与推导跳步是否说清楚。',
  ])
}

function buildNodeCritique(node: any, papers: any[]): ReviewerCritique {
  const paperCount = papers.length
  return buildReviewerCritique('node', [
    paperCount > 1
      ? '节点内多篇论文虽然能形成主线，但是否真的彼此推进，仍要严格比较任务设定、评价指标和数据条件。'
      : '如果节点目前主要由一篇论文支撑，那么“节点成立”本身仍然偏脆弱。',
    papers.some((paper) => paper.figures.length === 0 && paper.tables.length === 0)
      ? '部分论文缺少足够的可视化或表格证据，节点整体证据链不够均衡。'
      : '即便每篇论文都有图表，也要警惕不同论文之间的证据并不总能直接横比。',
    '节点总结不能只停在“这些论文都很重要”，还必须明确哪些问题已被推进，哪些问题其实只是被重新表述。',
  ])
}

function sanitizeNodePaperPassOutput(args: {
  paper: any
  pass: NodePaperPass
  fallback: NodePaperPass
}) {
  return {
    ...args.pass,
    overviewTitle:
      looksLikeStaleNodeNarrative(args.pass.overviewTitle, 1) || !normalizeReaderNarrative(args.pass.overviewTitle)
        ? args.fallback.overviewTitle
        : clipText(args.pass.overviewTitle, 120),
    contribution: looksLikeStaleNodeNarrative(args.pass.contribution, 1)
      ? args.fallback.contribution
      : clipText(args.pass.contribution, 220),
    body: sanitizeNodeParagraphs(args.pass.body, 1, args.fallback.body),
  } satisfies NodePaperPass
}

function sanitizeNodeComparisonOutput(args: {
  paperCount: number
  pass: NodeComparisonPass
  fallback: NodeComparisonPass
}) {
  if (args.paperCount <= 1) {
    return args.fallback
  }

  return {
    title:
      looksLikeStaleNodeNarrative(args.pass.title, args.paperCount) || !normalizeReaderNarrative(args.pass.title)
        ? args.fallback.title
        : clipText(args.pass.title, 80),
    summary: looksLikeStaleNodeNarrative(args.pass.summary, args.paperCount)
      ? args.fallback.summary
      : clipText(args.pass.summary, 240),
    points:
      args.pass.points
        .map((point, index) => ({
          label: normalizeReaderNarrative(point.label) || args.fallback.points[index]?.label || `比较点 ${index + 1}`,
          detail: looksLikeStaleNodeNarrative(point.detail, args.paperCount)
            ? ''
            : clipText(point.detail, 220),
        }))
        .filter((point) => point.detail).length > 0
        ? args.pass.points
            .map((point, index) => ({
              label: normalizeReaderNarrative(point.label) || args.fallback.points[index]?.label || `比较点 ${index + 1}`,
              detail: looksLikeStaleNodeNarrative(point.detail, args.paperCount)
                ? ''
                : clipText(point.detail, 220),
            }))
            .filter((point) => point.detail)
        : args.fallback.points,
  } satisfies NodeComparisonPass
}

function sanitizeNodeSynthesisOutput(args: {
  paperCount: number
  pass: NodeSynthesisPass
  fallback: NodeSynthesisPass
}) {
  return {
    headline:
      looksLikeStaleNodeNarrative(args.pass.headline, args.paperCount) || !normalizeReaderNarrative(args.pass.headline)
        ? args.fallback.headline
        : clipText(args.pass.headline, 120),
    standfirst: looksLikeStaleNodeNarrative(args.pass.standfirst, args.paperCount)
      ? args.fallback.standfirst
      : clipText(args.pass.standfirst, 280),
    leadTitle:
      looksLikeStaleNodeNarrative(args.pass.leadTitle, args.paperCount) || !normalizeReaderNarrative(args.pass.leadTitle)
        ? args.fallback.leadTitle
        : clipText(args.pass.leadTitle, 80),
    lead: sanitizeNodeParagraphs(args.pass.lead, args.paperCount, args.fallback.lead),
    evidenceTitle:
      looksLikeStaleNodeNarrative(args.pass.evidenceTitle, args.paperCount) || !normalizeReaderNarrative(args.pass.evidenceTitle)
        ? args.fallback.evidenceTitle
        : clipText(args.pass.evidenceTitle, 80),
    evidence: sanitizeNodeParagraphs(args.pass.evidence, args.paperCount, args.fallback.evidence),
    closingTitle:
      looksLikeStaleNodeNarrative(args.pass.closingTitle, args.paperCount) || !normalizeReaderNarrative(args.pass.closingTitle)
        ? args.fallback.closingTitle
        : clipText(args.pass.closingTitle, 80),
    closing: sanitizeNodeParagraphs(args.pass.closing, args.paperCount, args.fallback.closing),
  } satisfies NodeSynthesisPass
}

function sanitizeReviewerCritiqueOutput(args: {
  critique: ReviewerCritique
  paperCount: number
  fallback: ReviewerCritique
}) {
  return {
    title:
      looksLikeStaleNodeNarrative(args.critique.title, args.paperCount) || !normalizeReaderNarrative(args.critique.title)
        ? args.fallback.title
        : clipText(args.critique.title, 80),
    summary: looksLikeStaleNodeNarrative(args.critique.summary, args.paperCount)
      ? args.fallback.summary
      : clipText(args.critique.summary, 220),
    bullets: sanitizeNodeParagraphs(args.critique.bullets, args.paperCount, args.fallback.bullets).slice(0, 3),
  } satisfies ReviewerCritique
}

function buildNodeEditorialWriteback(args: {
  node: {
    id: string
    nodeSummary: string
    nodeExplanation: string | null
    fullContent: string | null
  }
  papers: any[]
  comparisonPass: NodeComparisonPass
  synthesisPass: NodeSynthesisPass
  critique: ReviewerCritique
}) {
  const summary = clipText(
    pickText(
      args.synthesisPass.lead[0],
      args.synthesisPass.standfirst,
      args.node.nodeSummary,
      args.node.nodeExplanation,
    ),
    180,
  )
  const explanation = clipText(
    [
      args.synthesisPass.standfirst,
      args.synthesisPass.lead[1],
      args.comparisonPass.summary,
      args.comparisonPass.points[0]?.detail,
      args.critique.summary,
    ]
      .filter(Boolean)
      .join(' '),
    420,
  )
  const fullContent = JSON.stringify({
    schemaVersion: 'node-editorial-memory-v1',
    nodeId: args.node.id,
    paperCount: args.papers.length,
    headline: args.synthesisPass.headline,
    standfirst: args.synthesisPass.standfirst,
    summary,
    explanation,
    comparison: {
      title: args.comparisonPass.title,
      summary: args.comparisonPass.summary,
      points: args.comparisonPass.points.slice(0, 4),
    },
    critique: {
      title: args.critique.title,
      summary: args.critique.summary,
      bullets: args.critique.bullets.slice(0, 4),
    },
    updatedAt: new Date().toISOString(),
  })

  return {
    summary,
    explanation,
    fullContent,
  }
}

function buildPaperArticleSections(paper: any, evidence: EvidenceExplanation[]): ArticleSection[] {
  const renderableSections = getRenderablePaperSections(paper)
  if (renderableSections.length === 0) {
    return buildFallbackPaperSections(paper, evidence)
  }

  return renderableSections.map((section: any, index: number) => ({
    id: `paper-section-${section.id}`,
    kind: index === 0 ? 'lead' : index === 1 ? 'paper-pass' : 'evidence',
    title: section.renderTitle,
    body: section.renderParagraphs,
    anchorId: `section:${section.id}`,
    paperId: paper.id,
    paperTitle: paper.titleZh || paper.title,
    evidenceIds:
      index === 0
        ? buildSectionEvidenceIds(evidence, ['figure', 'table'], 2)
        : index === 1
          ? buildSectionEvidenceIds(evidence, ['formula', 'figure'], 2)
          : buildSectionEvidenceIds(evidence, ['section', 'figure', 'table', 'formula'], 2),
  }))
}

function buildPaperSectionFlowBlocks(paper: any): ArticleFlowBlock[] {
  const paperTitle = paper.titleZh || paper.title
  const evidence = buildRenderablePaperEvidence(paper)
  const sectionLimit = paper.sections?.length > 6 ? 2 : 3

  return buildPaperArticleSections(paper, evidence).slice(0, sectionLimit).map((section) => ({
    id: `paper-section-flow-${section.id}`,
    type: 'text' as const,
    title: section.title,
    body: section.body,
    paperId: paper.id,
    paperTitle,
    anchorId: section.anchorId ?? section.id,
  }))
}

function buildPaperPass(paper: any, role: string, contribution: string): PaperRole {
  const links = resolvePaperSourceLinks({
    arxivUrl: paper.arxivUrl,
    pdfUrl: paper.pdfUrl,
    pdfPath: paper.pdfPath,
  })
  const safeContribution = looksLikeStaleNodeNarrative(contribution, 1)
    ? buildPaperContributionSeed(paper)
    : clipText(contribution, 220)

  return {
    paperId: paper.id,
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn ?? paper.title,
    route: paperRoute(paper.id),
    summary: normalizePaperNarrativeText(paper.summary, 140),
    publishedAt: paper.published.toISOString(),
    role,
    contribution: safeContribution,
    figuresCount: paper.figures.length,
    tablesCount: paper.tables.length,
    formulasCount: paper.formulas.length,
    coverImage: paper.coverPath,
    originalUrl: links.originalUrl,
    pdfUrl: links.pdfUrl,
  }
}

function buildCrossPaperPass(papers: any[]): CrossPaperComparisonBlock[] {
  if (papers.length <= 1) return []

  const sorted = [...papers].sort((left, right) => +left.published - +right.published)
  const firstPaper = sorted[0]
  return [
    {
      id: 'cross-paper-1',
      title: '多篇论文如何共同形成这个节点',
      summary: '这个节点不是若干论文摘要的简单拼接，而是同一问题线在不同时间点上的推进、纠偏和补强。',
      papers: sorted.map((paper, index) => ({
        paperId: paper.id,
        title: paper.titleZh || paper.title,
        route: paperRoute(paper.id),
        role: paperRoleLabel(index, index === 0),
      })),
      points: [
        {
          label: '时间推进',
          detail: firstPaper
            ? `最早的论文是《${firstPaper.titleZh || firstPaper.title}》，后续工作在它提出的问题或方法上继续推进。`
            : '节点中的论文沿着同一问题线持续推进，越新的工作通常越强调修正、扩展或落地。',
        },
        {
          label: '证据关系',
          detail: '节点内的论文并不一定都能在同一条件下直接比较，因此更适合被理解为推进链，而不是简单排行榜。',
        },
        {
          label: '仍未解决',
          detail: '真正困难的部分通常不是有没有新方法，而是这些方法在更复杂场景下是否还能保持稳定优势。',
        },
      ],
    },
  ]
}

function buildNodeSynthesisSections(
  node: any,
  papers: any[],
  evidence: EvidenceExplanation[],
  paperPasses: NodePaperPass[],
  synthesis: NodeSynthesisPass,
): ArticleSection[] {
  const lead = {
    id: 'node-lead',
    kind: 'lead' as const,
    title: synthesis.leadTitle,
    body: synthesis.lead,
    evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table'], 2),
  }

  const paperSections = papers.map((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    return {
      id: `node-paper-${paper.id}`,
      kind: 'paper-pass' as const,
      title: pass?.overviewTitle || paper.titleZh || paper.title,
      paperId: paper.id,
      paperTitle: paper.titleZh || paper.title,
      body: pass?.body ?? [
        `${paperRoleLabel(index, index === 0)}：${normalizePaperNarrativeText(paper.summary, 180) || '当前仅拿到题录与链接，还没有可用摘要。'}`,
        normalizePaperNarrativeText(paper.explanation ?? paper.summary, 200) ||
          '当前数据库尚未抽到足够的摘要或正文段落，需要结合原文继续核对问题、方法和实验。',
        `证据侧重点：${paper.figures.length} 张图、${paper.tables.length} 张表、${paper.formulas.length} 个公式。`,
      ],
      evidenceIds: buildSectionEvidenceIds(buildRenderablePaperEvidence(paper), ['figure', 'table', 'formula'], 2),
    }
  })

  const closingEvidence = {
    id: 'node-evidence',
    kind: 'evidence' as const,
    title: synthesis.evidenceTitle,
    body: synthesis.evidence,
    evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table', 'formula'], 3),
  }

  return [lead, ...paperSections, closingEvidence]
}

function buildTimeRangeLabel(values: string[]) {
  if (values.length === 0) return '时间待定'
  const dates = values
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(+value))
    .sort((left, right) => +left - +right)
  if (dates.length === 0) return '时间待定'
  const first = dates[0]
  const last = dates[dates.length - 1]
  const firstLabel = `${first.getFullYear()}.${`${first.getMonth() + 1}`.padStart(2, '0')}`
  const lastLabel = `${last.getFullYear()}.${`${last.getMonth() + 1}`.padStart(2, '0')}`
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} - ${lastLabel}`
}

function buildPreciseDateLabel(value: string | Date | null | undefined) {
  if (!value) return '时间待定'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(+date)) return '时间待定'
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

function buildFallbackStageLabel(stageIndex: number | null | undefined) {
  return typeof stageIndex === 'number' ? `Stage ${stageIndex}` : ''
}

function buildNodeStatsFromPaperRoles(paperRoles: PaperRole[]) {
  return paperRoles.reduce(
    (acc, paper) => ({
      paperCount: acc.paperCount + 1,
      figureCount: acc.figureCount + paper.figuresCount,
      tableCount: acc.tableCount + paper.tablesCount,
      formulaCount: acc.formulaCount + paper.formulasCount,
    }),
    { paperCount: 0, figureCount: 0, tableCount: 0, formulaCount: 0 },
  )
}

function filterNodeEvidenceByPaperIds(
  evidence: EvidenceExplanation[],
  allowedPaperIds: Set<string>,
) {
  if (allowedPaperIds.size === 0) return evidence

  return evidence.filter(
    (item) => !item.sourcePaperId || allowedPaperIds.has(item.sourcePaperId),
  )
}

function filterNodeSectionsByPaperIds(
  sections: ArticleSection[],
  allowedPaperIds: Set<string>,
  allowedEvidenceIds: Set<string>,
) {
  if (allowedPaperIds.size === 0) return sections

  return sections
    .filter((section) => !section.paperId || allowedPaperIds.has(section.paperId))
    .map((section) => ({
      ...section,
      evidenceIds: Array.isArray(section.evidenceIds)
        ? section.evidenceIds.filter((evidenceId) => allowedEvidenceIds.has(evidenceId))
        : section.evidenceIds,
    }))
}

function filterNodeFlowByPaperIds(
  flow: ArticleFlowBlock[],
  allowedPaperIds: Set<string>,
  keepComparisonBlocks: boolean,
) {
  if (allowedPaperIds.size === 0) return flow

  return flow.filter((block) => {
    if (block.type === 'paper-break') {
      return allowedPaperIds.has(block.paperId)
    }

    if (block.type === 'text') {
      return !block.paperId || allowedPaperIds.has(block.paperId)
    }

    if (block.type === 'comparison') {
      return keepComparisonBlocks
    }

    if (block.type === 'figure' || block.type === 'table' || block.type === 'formula') {
      return !block.evidence.sourcePaperId || allowedPaperIds.has(block.evidence.sourcePaperId)
    }

    return true
  })
}

function sortPublishedValues(values: string[]) {
  return [...values]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => +new Date(left) - +new Date(right))
}

async function loadTopicTemporalStageBuckets(topicId: string, stageWindowMonths?: number) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      createdAt: true,
      papers: {
        select: {
          id: true,
          published: true,
        },
      },
      nodes: {
        select: {
          id: true,
          primaryPaperId: true,
          updatedAt: true,
          createdAt: true,
          papers: {
            select: {
              paperId: true,
            },
          },
        },
      },
    },
  })

  if (!topic) return null

  return deriveTemporalStageBuckets({
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: topic.nodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.papers.map((paper) => ({ paperId: paper.paperId })),
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
    })),
    windowMonths: normalizeStageWindowMonths(stageWindowMonths),
    fallbackDate: topic.createdAt,
  })
}

function collectNodeStageScopedPaperIds(
  nodeId: string,
  stageBuckets: Awaited<ReturnType<typeof loadTopicTemporalStageBuckets>>,
) {
  const nodeAssignment = stageBuckets?.nodeAssignments.get(nodeId) ?? stageBuckets?.fallbackAssignment ?? null
  if (!stageBuckets || !nodeAssignment) {
    return null
  }

  return new Set(
    Array.from(stageBuckets.paperAssignments.entries())
      .filter(([, assignment]) => assignment.bucketKey === nodeAssignment.bucketKey)
      .map(([paperId]) => paperId),
  )
}

function collectNodeLinkedPaperIds(
  node: {
    primaryPaperId?: string | null
    papers: Array<{
      paperId?: string | null
    }>
  },
  allowedPaperIds?: Set<string> | null,
) {
  return Array.from(
    new Set(
      [
        ...(node.primaryPaperId ? [node.primaryPaperId] : []),
        ...node.papers
          .map((entry) => entry.paperId)
          .filter(
            (paperId): paperId is string =>
              typeof paperId === 'string' && paperId.trim().length > 0,
          ),
      ].filter((paperId) => !allowedPaperIds || allowedPaperIds.has(paperId)),
    ),
  )
}

async function resolveTopicStageWindowMonths(
  topicId: string,
  stageWindowMonths?: number,
) {
  if (typeof stageWindowMonths === 'number' && Number.isFinite(stageWindowMonths)) {
    return normalizeStageWindowMonths(stageWindowMonths)
  }

  const config = await loadTopicStageConfig(topicId)
  return normalizeStageWindowMonths(config.windowMonths)
}

async function resolveNodeStageWindowRequest(
  nodeId: string,
  stageWindowMonths?: number,
) {
  const node = await prisma.researchNode.findUnique({
    where: { id: nodeId },
    select: { topicId: true },
  })

  if (!node) {
    throw new AppError(404, 'Node not found.')
  }

  const configuredStageWindowMonths = await resolveTopicStageWindowMonths(node.topicId)
  const effectiveStageWindowMonths =
    typeof stageWindowMonths === 'number' && Number.isFinite(stageWindowMonths)
      ? normalizeStageWindowMonths(stageWindowMonths)
      : configuredStageWindowMonths

  return {
    topicId: node.topicId,
    configuredStageWindowMonths,
    effectiveStageWindowMonths,
    matchesConfiguredWindow:
      effectiveStageWindowMonths === configuredStageWindowMonths,
  }
}

async function applyTemporalStageLabelsToPaperViewModel(
  viewModel: PaperViewModel,
  stageWindowMonths?: number,
): Promise<PaperViewModel> {
  const effectiveStageWindowMonths = await resolveTopicStageWindowMonths(
    viewModel.topic.topicId,
    stageWindowMonths,
  )
  const stageBuckets = await loadTopicTemporalStageBuckets(
    viewModel.topic.topicId,
    effectiveStageWindowMonths,
  )
  if (!stageBuckets) return viewModel

  return {
    ...viewModel,
    stageWindowMonths: effectiveStageWindowMonths,
    relatedNodes: viewModel.relatedNodes.map((node) => ({
      ...node,
      stageLabel:
        stageBuckets.nodeAssignments.get(node.nodeId)?.label ??
        buildFallbackStageLabel(node.stageIndex),
    })),
  }
}

async function applyTemporalStageLabelsToNodeViewModel(
  viewModel: NodeViewModel,
  stageWindowMonths?: number,
): Promise<NodeViewModel> {
  const effectiveStageWindowMonths = await resolveTopicStageWindowMonths(
    viewModel.topic.topicId,
    stageWindowMonths,
  )
  const stageBuckets = await loadTopicTemporalStageBuckets(
    viewModel.topic.topicId,
    effectiveStageWindowMonths,
  )
  if (!stageBuckets) return viewModel

  const nodeAssignment = stageBuckets.nodeAssignments.get(viewModel.nodeId)
  const stageLabel = nodeAssignment?.label ?? buildFallbackStageLabel(viewModel.stageIndex)

  if (!nodeAssignment) {
    return {
      ...viewModel,
      stageWindowMonths: effectiveStageWindowMonths,
      stageLabel,
    }
  }

  const stagePaperRoles = viewModel.paperRoles.filter(
    (paper) =>
      stageBuckets.paperAssignments.get(paper.paperId)?.bucketKey === nodeAssignment.bucketKey,
  )
  const effectivePaperRoles =
    stagePaperRoles.length > 0 ? stagePaperRoles : viewModel.paperRoles
  const allowedPaperIds = new Set(effectivePaperRoles.map((paper) => paper.paperId))
  const filteredEvidence = filterNodeEvidenceByPaperIds(viewModel.evidence, allowedPaperIds)
  const allowedEvidenceIds = new Set(filteredEvidence.map((item) => item.anchorId))
  const filteredComparisonBlocks = viewModel.comparisonBlocks
    .map((block) => ({
      ...block,
      papers: block.papers.filter((paper) => allowedPaperIds.has(paper.paperId)),
    }))
    .filter((block) => block.papers.length > 1)
  const filteredFlow = filterNodeFlowByPaperIds(
    viewModel.article.flow,
    allowedPaperIds,
    filteredComparisonBlocks.length > 0 && effectivePaperRoles.length > 1,
  )
  const filteredSections = filterNodeSectionsByPaperIds(
    viewModel.article.sections,
    allowedPaperIds,
    allowedEvidenceIds,
  )
  const publishedValues = sortPublishedValues(
    effectivePaperRoles.map((paper) => paper.publishedAt),
  )

  return {
    ...viewModel,
    stageWindowMonths: effectiveStageWindowMonths,
    stageLabel,
    stats: buildNodeStatsFromPaperRoles(effectivePaperRoles),
    paperRoles: effectivePaperRoles,
    comparisonBlocks: filteredComparisonBlocks,
    article: {
      ...viewModel.article,
      periodLabel:
        publishedValues.length > 0
          ? buildPreciseDateLabel(publishedValues[0])
          : viewModel.article.periodLabel,
      timeRangeLabel:
        publishedValues.length > 0
          ? buildTimeRangeLabel(publishedValues)
          : viewModel.article.timeRangeLabel,
      flow: filteredFlow,
      sections: filteredSections,
    },
    evidence: filteredEvidence,
  }
}

function buildEvidenceFlowBlocks(evidence: EvidenceExplanation[]) {
  return evidence
    .filter(isRenderableEvidence)
    .map((item) => ({
      id: `flow-${item.anchorId}`,
      type: item.type,
      evidence: item,
    }) satisfies ArticleFlowBlock)
}

function interleaveBlocks(textBlocks: ArticleFlowBlock[], evidenceBlocks: ArticleFlowBlock[]) {
  if (textBlocks.length === 0) return evidenceBlocks
  const queue = [...evidenceBlocks]
  const output: ArticleFlowBlock[] = []

  textBlocks.forEach((block, index) => {
    output.push(block)
    const remainingText = textBlocks.length - index
    const insertCount = Math.ceil(queue.length / remainingText)
    output.push(...queue.splice(0, insertCount))
  })

  return output
}

function buildPaperArticleFlow({
  paper,
  sections,
  story,
  critique,
  evidence,
}: {
  paper: any
  sections: ArticleSection[]
  story: { standfirst: string; closing: string[] }
  critique: ReviewerCritique
  evidence: EvidenceExplanation[]
}) {
  const selectedEvidence = selectArticleEvidence(evidence, {
    figureLimit: 3,
    tableLimit: 2,
    formulaLimit: 1,
    totalLimit: 6,
  })
  const textBlocks: ArticleFlowBlock[] = [
    {
      id: 'paper-intro',
      type: 'text',
      title: '这篇论文到底在解决什么',
      body: [story.standfirst],
      anchorId: 'paper:intro',
    },
    ...sections.map((section) => ({
      id: `flow-${section.id}`,
      type: 'text' as const,
      title: section.title,
      body: section.body,
      anchorId: section.anchorId ?? section.id,
      paperId: paper.id,
      paperTitle: paper.titleZh || paper.title,
    })),
  ]

  return [
    ...interleaveBlocks(textBlocks, buildEvidenceFlowBlocks(selectedEvidence)),
    {
      id: 'paper-critique',
      type: 'critique',
      title: critique.title,
      summary: critique.summary,
      bullets: critique.bullets,
    },
    {
      id: 'paper-closing',
      type: 'closing',
      title: '收束',
      body: story.closing,
    },
  ] satisfies ArticleFlowBlock[]
}

function buildNodeArticleFlow({
  papers,
  paperPasses,
  comparisonPass,
  synthesisPass,
  critique,
}: {
  papers: any[]
  paperPasses: NodePaperPass[]
  comparisonPass: CrossPaperComparisonBlock | null
  synthesisPass: NodeSynthesisPass
  critique: ReviewerCritique
}) {
  const flow: ArticleFlowBlock[] = [
    {
      id: 'node-intro',
      type: 'text',
      title: synthesisPass.leadTitle,
      body: synthesisPass.lead,
      anchorId: 'node:intro',
    },
  ]

  papers.forEach((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    const paperEvidence = buildRenderablePaperEvidence(paper)
    const selectedEvidence = selectArticleEvidence(paperEvidence, {
      figureLimit: 2,
      tableLimit: 2,
      formulaLimit: 1,
      totalLimit: papers.length > 1 ? 4 : 6,
    })
    const links = resolvePaperSourceLinks({
      arxivUrl: paper.arxivUrl,
      pdfUrl: paper.pdfUrl,
      pdfPath: paper.pdfPath,
    })
    flow.push({
      id: `paper-break-${paper.id}`,
      type: 'paper-break',
      paperId: paper.id,
      title: paper.titleZh || paper.title,
      titleEn: paper.titleEn ?? paper.title,
      role: pass?.role ?? paperRoleLabel(index, paper.id === papers[0]?.id),
      contribution:
        pass?.contribution ??
        (
          normalizePaperNarrativeText(paper.explanation ?? paper.summary, 140) ||
          '当前只完成了题录级入库，还需要继续补摘要、正文和证据抽取。'
        ),
      route: paperRoute(paper.id),
      publishedAt: paper.published.toISOString(),
      originalUrl: links.originalUrl,
      pdfUrl: links.pdfUrl,
    })
    flow.push({
      id: `paper-text-${paper.id}`,
      type: 'text',
      title: pass?.overviewTitle || `${paper.titleZh || paper.title} 在这个节点里推进了什么`,
      body:
        pass?.body ?? [
          normalizePaperNarrativeText(paper.summary, 180) || '当前还没有拿到可用摘要，需要回到原文继续核对。',
          normalizePaperNarrativeText(paper.explanation ?? paper.summary, 200) ||
            '这一篇论文的细节仍主要依赖原文链接与后续 PDF 抽取，节点页暂不假装已经讲清。',
        ],
      paperId: paper.id,
      paperTitle: paper.titleZh || paper.title,
    })
    flow.push(
      ...interleaveBlocks(
        buildPaperSectionFlowBlocks(paper),
        buildEvidenceFlowBlocks(selectedEvidence),
      ),
    )
  })

  if (comparisonPass) {
    flow.push({
      id: comparisonPass.id,
      type: 'comparison',
      title: comparisonPass.title,
      summary: comparisonPass.summary,
      points: comparisonPass.points,
    })
  }

  flow.push({
    id: 'node-evidence',
    type: 'text',
    title: synthesisPass.evidenceTitle,
    body: synthesisPass.evidence,
    anchorId: 'node:evidence',
  })

  flow.push({
    id: 'node-critique',
    type: 'critique',
    title: critique.title,
    summary: critique.summary,
    bullets: critique.bullets,
  })

  flow.push({
    id: 'node-closing',
    type: 'closing',
    title: synthesisPass.closingTitle,
    body: synthesisPass.closing,
  })

  return flow
}

async function buildPaperViewModel(
  paperId: string,
  options?: { quick?: boolean },
): Promise<PaperViewModel> {
  const quick = options?.quick === true
  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    include: {
      topic: true,
      figures: true,
      tables: true,
      formulas: true,
      sections: { orderBy: { order: 'asc' } },
      nodePapers: { include: { node: true } },
    },
  })

  if (!paper) throw new AppError(404, 'Paper not found.')

  const relatedNodes = paper.nodePapers.map((entry) => entry.node).sort((left, right) => left.stageIndex - right.stageIndex)
  const researchPipelineContext = await loadReaderResearchPipelineContext({
    topicId: paper.topicId,
    paperIds: [paper.id],
    stageIndex: relatedNodes[0]?.stageIndex,
    historyLimit: 6,
  })
  const evidence = buildRenderablePaperEvidence(paper)
  const critiqueFallback = buildPaperCritique(paper)
  const storyFallback = {
    standfirst: clipText(`${paper.summary} ${paper.explanation ?? ''}`, 260),
    sections: buildPaperArticleSections(paper, evidence).map((section) => ({
      title: section.title,
      body: section.body,
    })),
    closing: [
      '读完这篇论文后，读者至少应该能回答三个问题：它到底解决了什么缺口、它靠什么证据说服读者，以及它最终还没有解决什么。',
      '如果这些问题依然答不清，通常不是页面排版不够，而是论文本身的证据链、实验边界或论证结构还不够扎实。',
    ],
  }
  const [story, generatedCritique] = quick
    ? [
        storyFallback,
        {
          summary: critiqueFallback.summary,
          bullets: critiqueFallback.bullets,
        },
      ]
    : await Promise.all([
        generatePaperStoryPass(paper, storyFallback, researchPipelineContext),
        generateReviewerCritique(
          'paper',
          {
            topicId: paper.topicId,
            paperId: paper.id,
            title: paper.titleZh || paper.title,
            summary: paper.summary,
            explanation: paper.explanation ?? paper.summary,
            figuresCount: paper.figures.length,
            tablesCount: paper.tables.length,
            formulasCount: paper.formulas.length,
          },
          {
            summary: critiqueFallback.summary,
            bullets: critiqueFallback.bullets,
          },
          researchPipelineContext,
        ),
      ])

  const baseSections = buildPaperArticleSections(paper, evidence)
  const enrichedSections: ArticleSection[] = baseSections.map((section, index) => ({
    ...section,
    title: story.sections[index]?.title ?? section.title,
    body: story.sections[index]?.body?.length ? story.sections[index].body : section.body,
  }))
  const extraSections: ArticleSection[] = story.sections.slice(baseSections.length).map((section, index) => ({
    id: `paper-generated-${index + 1}`,
    kind: 'paper-pass',
    title: section.title,
    body: section.body,
  }))
  const articleSections = [...enrichedSections, ...extraSections]
  const paperFlow = buildPaperArticleFlow({
    paper,
    sections: articleSections,
    story,
    critique: {
      title: critiqueFallback.title,
      summary: generatedCritique.summary,
      bullets: generatedCritique.bullets,
    },
    evidence,
  })

  return {
    schemaVersion: PAPER_READER_ARTIFACT_SCHEMA_VERSION,
    paperId: paper.id,
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn ?? paper.title,
    summary: paper.summary,
    explanation: paper.explanation ?? paper.summary,
    publishedAt: paper.published.toISOString(),
    authors: parseJsonArray(paper.authors),
    citationCount: paper.citationCount ?? null,
    coverImage: paper.coverPath,
    ...resolvePaperSourceLinks({
      arxivUrl: paper.arxivUrl,
      pdfUrl: paper.pdfUrl,
      pdfPath: paper.pdfPath,
    }),
    topic: {
      topicId: paper.topicId,
      title: paper.topic.nameZh,
      route: `/topic/${paper.topicId}`,
    },
    stats: {
      sectionCount: paper.sections.length,
      figureCount: paper.figures.length,
      tableCount: paper.tables.length,
      formulaCount: paper.formulas.length,
      relatedNodeCount: relatedNodes.length,
    },
    relatedNodes: relatedNodes.map((node) => ({
      nodeId: node.id,
      title: node.nodeLabel,
      subtitle: node.nodeSubtitle ?? '',
      summary: node.nodeSummary,
      stageIndex: node.stageIndex,
      route: nodeRoute(node.id),
    })),
    standfirst: story.standfirst,
    article: {
      periodLabel: buildPreciseDateLabel(paper.published),
      timeRangeLabel: buildTimeRangeLabel([paper.published.toISOString()]),
      flow: paperFlow,
      sections: articleSections,
      closing: story.closing,
    },
    critique: {
      title: critiqueFallback.title,
      summary: generatedCritique.summary,
      bullets: generatedCritique.bullets,
    },
    evidence,
  }
}

async function buildNodeViewModel(
  nodeId: string,
  options?: { quick?: boolean; stageWindowMonths?: number; enhanced?: boolean },
): Promise<NodeViewModel> {
  const quick = options?.quick === true
  const enableEnhanced = options?.enhanced === true
  const node = await prisma.researchNode.findUnique({
    where: { id: nodeId },
    include: {
      topic: true,
      primaryPaper: {
        include: {
          figures: true,
          tables: true,
          formulas: true,
          sections: { orderBy: { order: 'asc' } },
        },
      },
      papers: {
        include: {
          paper: {
            include: {
              figures: true,
              tables: true,
              formulas: true,
              sections: { orderBy: { order: 'asc' } },
            },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!node) throw new AppError(404, 'Node not found.')

  const [stage, topicPapers] = await Promise.all([
    prisma.topicStage.findFirst({
      where: {
        topicId: node.topicId,
        order: node.stageIndex,
      },
      select: {
        name: true,
        nameEn: true,
      },
    }),
    prisma.paper.findMany({
      where: { topicId: node.topicId },
      include: {
        figures: true,
        tables: true,
        formulas: true,
        sections: { orderBy: { order: 'asc' } },
      },
      orderBy: { published: 'desc' },
    }),
  ])

  const effectiveStageWindowMonths = await resolveTopicStageWindowMonths(node.topicId, options?.stageWindowMonths)
  const temporalStageBuckets = await loadTopicTemporalStageBuckets(
    node.topicId,
    effectiveStageWindowMonths,
  )
  const allowedPaperIds = collectNodeStageScopedPaperIds(node.id, temporalStageBuckets)
  const linkedPaperIds = collectNodeLinkedPaperIds(node, allowedPaperIds)
  const relatedPaperIds =
    linkedPaperIds.length > 0
      ? linkedPaperIds
      : collectNodeRelatedPaperIds({
          node,
          stageTitle: [stage?.name, stage?.nameEn].filter(Boolean).join(' '),
          papers: topicPapers,
          allowedPaperIds,
        })
  const paperById = new Map(topicPapers.map((paper) => [paper.id, paper]))
  const resolvedPaperIds = Array.from(
    new Set(
      relatedPaperIds.concat(node.primaryPaperId ? [node.primaryPaperId] : []),
    ),
  ).filter((paperId) => !allowedPaperIds || allowedPaperIds.has(paperId))
  const papers = resolvedPaperIds
    .map((paperId) => paperById.get(paperId) ?? null)
    .filter((paper): paper is (typeof topicPapers)[number] => Boolean(paper))
  const researchPipelineContext = await loadReaderResearchPipelineContext({
    topicId: node.topicId,
    nodeId: node.id,
    paperIds: papers.map((paper) => paper.id),
    stageIndex: node.stageIndex,
    historyLimit: 6,
  })
  const evidence = papers.flatMap((paper) => buildRenderablePaperEvidence(paper))
  const stats = papers.reduce(
    (acc, paper) => ({
      paperCount: acc.paperCount + 1,
      figureCount: acc.figureCount + paper.figures.length,
      tableCount: acc.tableCount + paper.tables.length,
      formulaCount: acc.formulaCount + paper.formulas.length,
    }),
    { paperCount: 0, figureCount: 0, tableCount: 0, formulaCount: 0 },
  )
  const nodeNarrativeSeed = buildNodeNarrativeSeed({
    node,
    papers,
  })
  const normalizedNodeContext = {
    ...node,
    nodeSummary: looksLikeStaleNodeNarrative(node.nodeSummary, papers.length)
      ? nodeNarrativeSeed.summary
      : node.nodeSummary,
    nodeExplanation: looksLikeStaleNodeNarrative(node.nodeExplanation ?? node.nodeSummary, papers.length)
      ? nodeNarrativeSeed.explanation
      : node.nodeExplanation ?? node.nodeSummary,
  }

  const fallbackCritique = buildNodeCritique(node, papers)
  const fallbackPaperPasses = papers.map((paper, index) => ({
    paperId: paper.id,
    overviewTitle:
      paper.id === node.primaryPaperId
        ? `${paper.titleZh || paper.title} 为什么构成节点主线`
        : `${paper.titleZh || paper.title} 在这里补了什么`,
    role: paperRoleLabel(index, paper.id === node.primaryPaperId),
    contribution: buildPaperContributionSeed(paper),
    body: [
      normalizePaperNarrativeText(paper.summary, 180) || '当前仅完成题录级整理，还没有拿到可用摘要。',
      getRenderablePaperSections(paper)[0]?.renderParagraphs[0] ??
        buildPaperContributionSeed(paper),
      paper.figures.length + paper.tables.length + paper.formulas.length > 0
        ? `当前可直接核对 ${paper.figures.length} 张图、${paper.tables.length} 张表和 ${paper.formulas.length} 个公式。`
        : '当前数据库还没有提取到图、表、公式，需要结合原文 PDF 继续核对关键证据。',
    ],
  }))
  const fallbackComparisonPass: NodeComparisonPass =
    papers.length <= 1
      ? {
          title: '单篇论文节点',
          summary: '当前节点主要由一篇论文支撑，因此更像是进入单篇深读的入口，而不是稳定的跨论文汇流。',
          points: [
            {
              label: '当前状态',
              detail: '先把这篇论文的问题、方法、证据与边界讲清楚，再判断这个节点是否足够稳固。',
            },
          ],
        }
      : {
          title: '多篇论文如何共同形成这个节点',
          summary: '这个节点不是摘要拼接，而是同一问题线在不同论文中的推进、补强与纠偏。',
          points: [
            {
              label: '时间推进',
              detail: '先看谁最早提出关键判断，再看后续论文如何补证据、改机制、扩边界。',
            },
            {
              label: '证据关系',
              detail: '这些论文未必处在完全相同的实验条件里，因此更适合被理解成推进链，而不是简单排行榜。',
            },
            {
              label: '未解问题',
              detail: '真正困难的部分通常不是有没有新方法，而是这些方法在更复杂场景里是否仍然成立。',
            },
          ],
        }
  const fallbackSynthesisPass: NodeSynthesisPass = {
    headline: nodeNarrativeSeed.headline,
    standfirst: nodeNarrativeSeed.standfirst,
    leadTitle: '先把这个节点的问题、判断和边界说清楚',
    lead: [
      nodeNarrativeSeed.summary,
      nodeNarrativeSeed.explanation,
    ],
    evidenceTitle: '再看图、表、公式怎样支撑节点判断',
    evidence: [
      stats.figureCount + stats.tableCount + stats.formulaCount > 0
        ? `当前节点已抽取 ${stats.figureCount} 张图、${stats.tableCount} 张表和 ${stats.formulaCount} 个公式，可以围绕方法图、主结果表和关键公式继续精读。`
        : '当前节点还没有抽取出图、表、公式，所以证据层暂时只能依赖论文摘要与原文链接；下一步最需要补的是方法图、主结果表和关键公式。',
      papers.length > 1
        ? '真正的节点证据不是“论文很多”，而是这些论文能否围绕同一问题形成前后推进、互相补强或明确分歧。'
        : '既然当前阶段只有一篇论文，阅读重点就不该是假装存在跨论文汇流，而是把这篇论文的问题、方法、实验和边界讲扎实。',
    ],
    closingTitle: '最后回到这条研究线真正还没解决的问题',
    closing: [
      papers.length > 1
        ? '真正还没解决的问题，是这些论文之间到底有没有形成稳定主线，以及哪些改进只是换了表述而没有真正提升闭环能力。'
        : '真正还没解决的问题，是这篇论文提出的路线能不能在更多数据、更强约束和更完整的闭环评估里成立。',
      '读完节点之后，读者至少应该能回答三件事：这篇或这些论文解决了什么、靠什么证据站住、还缺什么关键验证。',
    ],
  }
  const rawPaperPasses = quick
    ? fallbackPaperPasses
    : await generateNodePaperPasses(papers, node.primaryPaperId, researchPipelineContext)
  const paperPasses = rawPaperPasses.map((pass, index) =>
    sanitizeNodePaperPassOutput({
      paper: papers[index],
      pass,
      fallback: fallbackPaperPasses[index],
    }),
  )
  const rawComparisonPass = quick
    ? fallbackComparisonPass
    : await generateNodeComparisonPass(
        normalizedNodeContext,
        papers,
        paperPasses,
        researchPipelineContext,
      )
  const comparisonPass = sanitizeNodeComparisonOutput({
    paperCount: papers.length,
    pass: rawComparisonPass,
    fallback: fallbackComparisonPass,
  })
  const rawSynthesisPass = quick
    ? fallbackSynthesisPass
    : await generateNodeSynthesisPass(
        normalizedNodeContext,
        papers,
        paperPasses,
        comparisonPass,
        researchPipelineContext,
      )
  const synthesisPass = sanitizeNodeSynthesisOutput({
    paperCount: papers.length,
    pass: rawSynthesisPass,
    fallback: fallbackSynthesisPass,
  })
  const rawGeneratedCritique = quick
    ? {
        summary: fallbackCritique.summary,
        bullets: fallbackCritique.bullets,
      }
    : await generateReviewerCritique(
        'node',
        {
          topicId: node.topicId,
          nodeId: node.id,
          nodeTitle: node.nodeLabel,
          nodeSummary: normalizedNodeContext.nodeSummary,
          nodeExplanation: normalizedNodeContext.nodeExplanation,
          papers: paperPasses,
          comparison: comparisonPass,
        },
        {
          summary: fallbackCritique.summary,
          bullets: fallbackCritique.bullets,
        },
        researchPipelineContext,
      )
  const generatedCritique = sanitizeReviewerCritiqueOutput({
    critique: {
      title: fallbackCritique.title,
      summary: rawGeneratedCritique.summary,
      bullets: rawGeneratedCritique.bullets,
    },
    paperCount: papers.length,
    fallback: fallbackCritique,
  })
  const paperRoles = papers.map((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    return buildPaperPass(
      paper,
      pass?.role ?? paperRoleLabel(index, paper.id === node.primaryPaperId),
      pass?.contribution ??
        (
          normalizePaperNarrativeText(paper.explanation ?? paper.summary, 120) ||
          '当前只完成了题录级入库，还需要继续补摘要、正文和证据抽取。'
        ),
    )
  })
  const comparisonBlock =
    papers.length > 1
      ? {
          id: 'cross-paper-1',
          title: comparisonPass.title,
          summary: comparisonPass.summary,
          papers: papers.map((paper, index) => ({
            paperId: paper.id,
            title: paper.titleZh || paper.title,
            route: paperRoute(paper.id),
            role: paperPasses.find((item) => item.paperId === paper.id)?.role ?? paperRoleLabel(index, paper.id === node.primaryPaperId),
          })),
          points: comparisonPass.points,
        }
      : null
  const nodeSections = buildNodeSynthesisSections(node, papers, evidence, paperPasses, synthesisPass)
  const nodeFlow = buildNodeArticleFlow({
    papers,
    paperPasses,
    comparisonPass: comparisonBlock,
    synthesisPass,
    critique: generatedCritique,
  })
  const primaryDate = [...papers]
    .map((paper) => paper.published)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => +left - +right)[0] ?? null
  const editorialWriteback = buildNodeEditorialWriteback({
    node: normalizedNodeContext,
    papers,
    comparisonPass,
    synthesisPass,
    critique: generatedCritique,
  })
  let nodeSummary = node.nodeSummary
  let nodeExplanation = node.nodeExplanation ?? node.nodeSummary
  let nodeUpdatedAt = node.updatedAt.toISOString()

  if (!quick) {
    nodeSummary = editorialWriteback.summary
    nodeExplanation = editorialWriteback.explanation

    if (
      node.nodeSummary !== editorialWriteback.summary ||
      (node.nodeExplanation ?? node.nodeSummary) !== editorialWriteback.explanation ||
      (node.fullContent ?? '') !== editorialWriteback.fullContent
    ) {
      const updateResult = await prisma.researchNode.updateMany({
        where: { id: node.id },
        data: {
          nodeSummary: editorialWriteback.summary,
          nodeExplanation: editorialWriteback.explanation,
          fullContent: editorialWriteback.fullContent,
        },
      })

      if (updateResult.count > 0) {
        const refreshedNode = await prisma.researchNode.findUnique({
          where: { id: node.id },
          select: { updatedAt: true },
        })

        if (refreshedNode) {
          nodeUpdatedAt = refreshedNode.updatedAt.toISOString()
        }
      }
    }
  }

  // 可选：生成增强版文章流（8-Pass深度解析）
  let enhancedArticleFlow: import('./deep-article-generator.js').NodeArticleFlowBlock[] | undefined
  if (enableEnhanced && !quick) {
    try {
      const { generateNodeEnhancedArticle } = await import('./deep-article-generator.js')
      enhancedArticleFlow = await generateNodeEnhancedArticle(nodeId, {
        papers: papers.map(p => ({
          id: p.id,
          title: p.titleZh || p.title,
          titleEn: p.titleEn ?? undefined,
          authors: typeof p.authors === 'string' ? JSON.parse(p.authors) : p.authors,
          summary: p.summary,
          explanation: p.explanation ?? undefined,
          publishedAt: p.published?.toISOString(),
          pdfUrl: p.pdfUrl ?? undefined,
          originalUrl: p.arxivUrl ?? undefined,
          citationCount: p.citationCount,
          coverImage: p.coverPath ?? undefined,
        })),
        nodeContext: {
          title: node.nodeLabel,
          stageIndex: node.stageIndex,
          summary: node.nodeSummary,
        },
      })
    } catch (err) {
      logger.warn('Failed to generate enhanced article flow', { nodeId, err })
      // 失败时保持undefined，使用标准flow
    }
  }

  return {
    schemaVersion: NODE_READER_ARTIFACT_SCHEMA_VERSION,
    nodeId: node.id,
    title: node.nodeLabel,
    titleEn: node.nodeSubtitle || node.primaryPaper.titleEn || node.primaryPaper.title,
    headline: synthesisPass.headline,
    subtitle: node.nodeSubtitle ?? '',
    summary: looksLikeStaleNodeNarrative(nodeSummary, papers.length)
      ? editorialWriteback.summary
      : nodeSummary,
    explanation: looksLikeStaleNodeNarrative(nodeExplanation, papers.length)
      ? editorialWriteback.explanation
      : nodeExplanation,
    stageIndex: node.stageIndex,
    updatedAt: nodeUpdatedAt,
    isMergeNode: node.isMergeNode,
    provisional: node.provisional,
    topic: {
      topicId: node.topicId,
      title: node.topic.nameZh,
      route: `/topic/${node.topicId}`,
    },
    stageWindowMonths: effectiveStageWindowMonths,
    stats,
    standfirst: synthesisPass.standfirst,
    paperRoles,
    comparisonBlocks: comparisonBlock ? [comparisonBlock] : [],
    article: {
      periodLabel: buildPreciseDateLabel(primaryDate),
      timeRangeLabel: buildTimeRangeLabel(papers.map((paper) => paper.published.toISOString())),
      flow: nodeFlow,
      sections: nodeSections,
      closing: synthesisPass.closing,
    },
    critique: generatedCritique,
    evidence,
    enhancedArticleFlow,
  }
}

export async function getPaperViewModel(
  paperId: string,
  options?: { stageWindowMonths?: number },
): Promise<PaperViewModel> {
  const viewModel = await resolveReaderArtifact(
    {
      kind: 'paper',
      buildFingerprint: buildPaperArtifactFingerprint,
      buildViewModel: buildPaperViewModel,
    },
    paperId,
  )
  return applyTemporalStageLabelsToPaperViewModel(viewModel, options?.stageWindowMonths)
}

export async function rebuildPaperViewModel(
  paperId: string,
  options?: { stageWindowMonths?: number },
): Promise<PaperViewModel> {
  const viewModel = await resolveReaderArtifact(
    {
      kind: 'paper',
      buildFingerprint: buildPaperArtifactFingerprint,
      buildViewModel: buildPaperViewModel,
    },
    paperId,
    { forceRebuild: true },
  )
  return applyTemporalStageLabelsToPaperViewModel(viewModel, options?.stageWindowMonths)
}

export async function getNodeViewModel(
  nodeId: string,
  options?: { stageWindowMonths?: number; enhanced?: boolean },
): Promise<NodeViewModel> {
  const stageWindowRequest = await resolveNodeStageWindowRequest(
    nodeId,
    options?.stageWindowMonths,
  )

  if (!stageWindowRequest.matchesConfiguredWindow) {
    const viewModel = await buildNodeViewModel(nodeId, {
      stageWindowMonths: stageWindowRequest.effectiveStageWindowMonths,
      enhanced: options?.enhanced,
    })
    return applyTemporalStageLabelsToNodeViewModel(
      viewModel,
      stageWindowRequest.effectiveStageWindowMonths,
    )
  }

  const viewModel = await resolveReaderArtifact(
    {
      kind: 'node',
      buildFingerprint: buildNodeArtifactFingerprint,
      buildViewModel: (entityId, buildOptions) =>
        buildNodeViewModel(entityId, {
          ...buildOptions,
          stageWindowMonths: stageWindowRequest.configuredStageWindowMonths,
          enhanced: options?.enhanced,
        }),
    },
    nodeId,
  )
  return applyTemporalStageLabelsToNodeViewModel(
    viewModel,
    stageWindowRequest.effectiveStageWindowMonths,
  )
}

export async function rebuildNodeViewModel(
  nodeId: string,
  options?: { stageWindowMonths?: number },
): Promise<NodeViewModel> {
  const stageWindowRequest = await resolveNodeStageWindowRequest(
    nodeId,
    options?.stageWindowMonths,
  )

  if (!stageWindowRequest.matchesConfiguredWindow) {
    const viewModel = await buildNodeViewModel(nodeId, {
      stageWindowMonths: stageWindowRequest.effectiveStageWindowMonths,
    })
    return applyTemporalStageLabelsToNodeViewModel(
      viewModel,
      stageWindowRequest.effectiveStageWindowMonths,
    )
  }

  const viewModel = await resolveReaderArtifact(
    {
      kind: 'node',
      buildFingerprint: buildNodeArtifactFingerprint,
      buildViewModel: (entityId, buildOptions) =>
        buildNodeViewModel(entityId, {
          ...buildOptions,
          stageWindowMonths: stageWindowRequest.configuredStageWindowMonths,
        }),
    },
    nodeId,
    { forceRebuild: true },
  )
  return applyTemporalStageLabelsToNodeViewModel(
    viewModel,
    stageWindowRequest.effectiveStageWindowMonths,
  )
}

async function buildQuickPaperViewModelForTest(
  paperId: string,
  stageWindowMonths?: number,
) {
  const viewModel = await buildPaperViewModel(paperId, { quick: true })
  return applyTemporalStageLabelsToPaperViewModel(viewModel, stageWindowMonths)
}

async function buildQuickNodeViewModelForTest(
  nodeId: string,
  stageWindowMonths?: number,
) {
  const viewModel = await buildNodeViewModel(nodeId, {
    quick: true,
    stageWindowMonths,
  })
  return applyTemporalStageLabelsToNodeViewModel(viewModel, stageWindowMonths)
}

export interface WarmTopicReaderArtifactOptions {
  limit?: number
  mode?: ReaderArtifactWarmMode
  entityIds?: {
    nodeIds?: string[]
    paperIds?: string[]
  }
}

export async function warmTopicReaderArtifacts(
  topicId: string,
  options: WarmTopicReaderArtifactOptions = {},
) {
  const runtime = await getGenerationRuntimeConfig()
  const limit = options.limit ?? runtime.researchArtifactRebuildLimit
  const mode = options.mode ?? 'full'
  const shouldScopeNodes = Array.isArray(options.entityIds?.nodeIds)
  const shouldScopePapers = Array.isArray(options.entityIds?.paperIds)
  const scopedNodeIds = Array.from(
    new Set((options.entityIds?.nodeIds ?? []).filter((value) => typeof value === 'string' && value.trim())),
  )
  const scopedPaperIds = Array.from(
    new Set((options.entityIds?.paperIds ?? []).filter((value) => typeof value === 'string' && value.trim())),
  )
  const [nodes, papers] = await Promise.all([
    shouldScopeNodes
      ? scopedNodeIds.length > 0
        ? prisma.researchNode.findMany({
            where: {
              topicId,
              id: { in: scopedNodeIds },
            },
            select: { id: true },
            orderBy: [{ updatedAt: 'desc' }],
            take: Math.max(scopedNodeIds.length, limit),
          })
        : Promise.resolve<Array<{ id: string }>>([])
      : prisma.researchNode.findMany({
          where: { topicId },
          select: { id: true },
          orderBy: [{ updatedAt: 'desc' }],
          take: limit,
        }),
    shouldScopePapers
      ? scopedPaperIds.length > 0
        ? prisma.paper.findMany({
            where: {
              topicId,
              id: { in: scopedPaperIds },
            },
            select: { id: true },
            orderBy: [{ updatedAt: 'desc' }],
            take: Math.max(scopedPaperIds.length, limit),
          })
        : Promise.resolve<Array<{ id: string }>>([])
      : prisma.paper.findMany({
          where: { topicId },
          select: { id: true },
          orderBy: [{ updatedAt: 'desc' }],
          take: limit,
        }),
  ])

  if (mode === 'full') {
    await runInBatches(nodes, 2, async (node) => {
      await rebuildNodeViewModel(node.id)
    })

    await runInBatches(papers, 2, async (paper) => {
      await rebuildPaperViewModel(paper.id)
    })

    await runInBatches(nodes, 3, async (node) => {
      await syncPersistedReaderArtifactFingerprint<NodeViewModel>(
        'node',
        node.id,
        buildNodeArtifactFingerprint,
      )
    })

    await runInBatches(papers, 3, async (paper) => {
      await syncPersistedReaderArtifactFingerprint<PaperViewModel>(
        'paper',
        paper.id,
        buildPaperArtifactFingerprint,
      )
    })
  } else {
    await runInBatches(nodes, 3, async (node) => {
      await persistQuickReaderArtifact(
        'node',
        node.id,
        buildNodeArtifactFingerprint,
        buildNodeViewModel,
      )
    })

    await runInBatches(papers, 3, async (paper) => {
      await persistQuickReaderArtifact(
        'paper',
        paper.id,
        buildPaperArtifactFingerprint,
        buildPaperViewModel,
      )
    })

    if (mode === 'deferred') {
      const nodeDriver = {
        kind: 'node' as const,
        buildFingerprint: buildNodeArtifactFingerprint,
        buildViewModel: buildNodeViewModel,
      }
      const paperDriver = {
        kind: 'paper' as const,
        buildFingerprint: buildPaperArtifactFingerprint,
        buildViewModel: buildPaperViewModel,
      }

      for (const node of nodes) {
        void queueReaderArtifactBuild(nodeDriver, node.id).catch((error) => {
          if (error instanceof AppError && error.statusCode === 404) {
            return
          }
          console.error(`[AlphaReader] Deferred node rebuild failed for ${node.id}:`, error)
        })
      }

      for (const paper of papers) {
        void queueReaderArtifactBuild(paperDriver, paper.id).catch((error) => {
          if (error instanceof AppError && error.statusCode === 404) {
            return
          }
          console.error(`[AlphaReader] Deferred paper rebuild failed for ${paper.id}:`, error)
        })
      }
    }
  }

  return {
    topicId,
    mode,
    warmedNodeCount: nodes.length,
    warmedPaperCount: papers.length,
    queuedNodeCount: mode === 'deferred' ? nodes.length : 0,
    queuedPaperCount: mode === 'deferred' ? papers.length : 0,
  }
}

export interface TopicReaderArtifactOrchestrationOptions {
  limit?: number
  mode?: ReaderArtifactWarmMode
  entityIds?: {
    nodeIds?: string[]
    paperIds?: string[]
  }
  pipelineEntry?: ResearchPipelineEntry
}

export async function orchestrateTopicReaderArtifacts(
  topicId: string,
  options: TopicReaderArtifactOrchestrationOptions = {},
) {
  const pipelineState = options.pipelineEntry
    ? await appendResearchPipelineEntry(topicId, options.pipelineEntry)
    : null
  const warmed = await warmTopicReaderArtifacts(topicId, {
    limit: options.limit,
    mode: options.mode,
    entityIds: options.entityIds,
  })

  return {
    ...warmed,
    pipelineUpdatedAt: pipelineState?.updatedAt ?? null,
    lastRunAt: pipelineState?.lastRun?.timestamp ?? null,
  }
}

export const __testing = {
  buildQuickPaperViewModelForTest,
  buildQuickNodeViewModelForTest,
  looksLikeStaleNodeNarrative,
  extractNarrativePaperCountClaim,
  buildNodeNarrativeSeed,
  cleanExtractedParagraph,
  sanitizeStoredParagraphList,
  getRenderablePaperSections,
  selectArticleEvidence,
}

