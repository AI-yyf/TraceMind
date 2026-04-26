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
} from './topic-session-memory'
import { collectTopicCognitiveMemory } from './topic-cognitive-memory'
import {
  collectNodeRelatedPaperIds,
  type AssociationNodeLike,
} from './node-paper-association'
import { resolvePaperAssetPath, resolvePaperSourceLinks } from '../paper-links'
import {
  deriveTemporalStageBuckets,
  normalizeStageWindowMonths,
} from './stage-buckets'
import { loadTopicStageConfig } from './topic-stage-config'
import {
  ensureConfiguredTopicMaterializedForNode,
  parseConfiguredTopicIdFromNodeId,
} from './topic-config-sync'
import { buildNodeArticleMarkdown } from './article-markdown'
import { hasMeaningfulDisplayText, pickMeaningfulDisplayText } from './display-text'
import { assertNodeViewModelContract } from './topic-contracts'
import {
  collectPaperFormulaArtifacts,
  countPaperFormulaArtifacts,
} from './synthetic-formulas'
import { logger } from '../../utils/logger'
import {
  broadcastResearchProgress,
  broadcastResearchComplete,
  broadcastResearchError,
} from '../../websocket/server'
import type { ArticleProgressReporter } from './deep-article-generator'
import { nodeEditorialAgent } from '../editorial/node-editorial-agent'
import { DeepAnalysisPipeline, type DeepAnalysisResult, type DeepAnalysisPaper } from '../editorial'
import type { PaperContext } from '../editorial/types'
import type { PosterStylePaperAnalysis, PaperParagraph } from '../../../shared/editorial-types'

type EvidenceType = 'figure' | 'table' | 'formula' | 'figureGroup'
type GenerateNodeEnhancedArticle = typeof import('./deep-article-generator').generateNodeEnhancedArticle

/**
 * Bilingual text helper for i18n support in alpha-reader.
 * Provides Chinese and English fallback text based on language preference.
 */
function bilingualText(
  language: string | undefined | null,
  zh: string,
  en: string,
): string {
  const lang = (language ?? 'zh').toLowerCase()
  return lang === 'zh' || lang.startsWith('zh') ? zh : en
}

/**
 * Evidence statistics text with i18n support.
 */
function evidenceStatsText(
  language: string | undefined | null,
  figureCount: number,
  tableCount: number,
  formulaCount: number,
): string {
  return bilingualText(
    language,
    `证据情况：${figureCount} 张图，${tableCount} 张表，${formulaCount} 个公式。`,
    `Evidence: ${figureCount} figures, ${tableCount} tables, ${formulaCount} formulas.`,
  )
}

/**
 * Fallback text for papers without complete content.
 */
function incompletePaperText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '当前仅完成题录级整理，后续还需要补齐摘要、正文与证据。',
    'Only bibliographic data is available. Abstract, content, and evidence extraction pending.',
  )
}

function noStableAbstractText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '当前数据库还没有稳定的摘要或正文段落，文章必须继续回到原文核对。',
    'No stable abstract or content paragraphs available. Manual verification from source required.',
  )
}

function incompletePaperNextRoundText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '当前仅完成题录级整理，后续还需要补齐摘要、正文与证据。',
    'Only bibliographic data is available. Abstract, content, and evidence extraction pending next round.',
  )
}

function directEvidenceText(language: string | undefined | null, figureCount: number, tableCount: number, formulaCount: number): string {
  return bilingualText(
    language,
    `当前可直接落在正文里的证据包括：${figureCount} 张图、${tableCount} 张表和 ${formulaCount} 个公式。`,
    `Direct evidence available: ${figureCount} figures, ${tableCount} tables, and ${formulaCount} formulas.`,
  )
}

function noEvidenceExtractedText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '当前数据库还没有提取到图、表、公式，仍需回到原文 PDF 核对决定性证据。',
    'No figures, tables, or formulas extracted yet. Manual verification from source PDF required for decisive evidence.',
  )
}

function incompletePaperNextRoundExtractText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '当前仅完成题录级整理，下一轮需要补齐摘要、正文与证据抽取。',
    'Only bibliographic data available. Abstract, content, and evidence extraction pending next round.',
  )
}

// Fallback paper section i18n helpers
function fallbackProblemTitle(language: string | undefined | null): string {
  return bilingualText(language, '问题与入口', 'Problem & Entry')
}

function fallbackMethodTitle(language: string | undefined | null): string {
  return bilingualText(language, '方法与结构', 'Method & Structure')
}

function fallbackEvidenceTitle(language: string | undefined | null): string {
  return bilingualText(language, '证据与结果', 'Evidence & Results')
}

function fallbackBoundaryTitle(language: string | undefined | null): string {
  return bilingualText(language, '边界与延伸', 'Boundary & Extension')
}

function fallbackMethodFormulaText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '从公式层面看，这篇工作把方法定义得更具体，适合和正文结构一起读。',
    'From the formula perspective, this work defines the method more concretely, suitable for reading alongside the main text structure.',
  )
}

function fallbackMethodNarrativeText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '这篇论文的方法主张主要体现在正文叙述与关键图示里，阅读时应把模块结构和任务目标一起理解。',
    'The method claims are primarily in the narrative and key figures. Read with module structure and task objectives in mind.',
  )
}

function fallbackEvidenceCoverageText(language: string | undefined | null, coverage: string): string {
  return bilingualText(
    language,
    `目前保留下来的直接证据包括 ${coverage}，足以作为判断结果的第一入口。`,
    `Direct evidence preserved includes ${coverage}, sufficient as first entry point for result judgment.`,
  )
}

function fallbackNoEvidenceText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '这篇论文当前更适合先从正文理解论证逻辑，再回到原文核对实验与比较设置。',
    'Better to understand the argument logic from the text first, then verify experiments and comparison settings from the source.',
  )
}

function fallbackEvidenceCaptionText(language: string | undefined | null, captionSummary: string): string {
  return bilingualText(
    language,
    `最值得优先查看的证据线索包括：${captionSummary}`,
    `Priority evidence to examine: ${captionSummary}`,
  )
}

function fallbackLowEvidenceText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '由于图表证据仍然偏少，这篇论文的结论更需要回到原文实验页继续核对比较对象、指标和设置。',
    'With limited figure/table evidence, conclusions require verification of comparison objects, metrics, and settings from the source.',
  )
}

function fallbackHasEvidenceText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '即便已经有局部图表证据，真正的判断仍然要放回节点内部，与前后论文并读。',
    'Even with partial evidence, real judgment requires reading within the node context alongside related papers.',
  )
}

function fallbackNodeContextText(language: string | undefined | null): string {
  return bilingualText(
    language,
    '把这篇论文放进节点主线之后，才能更清楚看见它究竟推进了问题，还是只是换了一种表述方式。',
    'Only after placing this paper in the node mainline can we see whether it advances the problem or merely reframes it.',
  )
}

function paperFormulaArtifacts(paper: any) {
  return collectPaperFormulaArtifacts(paper)
}

function paperEvidenceStats(paper: any) {
  return {
    figureCount: paper.figures.length,
    tableCount: paper.tables.length,
    formulaCount: countPaperFormulaArtifacts(paper),
    figureGroupCount: paper.figure_groups?.length ?? 0,
  }
}

type NodeEvidenceAudit = {
  status: 'complete' | 'needs_vlm_audit'
  warnings: Array<{
    code: 'missing_table_formula_coverage' | 'missing_visual_evidence' | 'thin_multi_paper_evidence'
    message: string
    severity: 'warning' | 'critical'
  }>
  requiredAction: string | null
}

function buildNodeEvidenceAudit(stats: {
  paperCount: number
  figureCount: number
  tableCount: number
  formulaCount: number
  figureGroupCount: number
}): NodeEvidenceAudit {
  const warnings: NodeEvidenceAudit['warnings'] = []

  if (stats.paperCount > 0 && stats.figureCount === 0 && stats.tableCount === 0 && stats.formulaCount === 0) {
    warnings.push({
      code: 'missing_visual_evidence',
      severity: 'critical',
      message: 'No figure, table, or formula evidence is available for this node.',
    })
  }

  if (stats.paperCount > 0 && stats.tableCount === 0 && stats.formulaCount === 0) {
    warnings.push({
      code: 'missing_table_formula_coverage',
      severity: 'warning',
      message: 'No table or formula evidence is available; run VLM-guided extraction audit before claiming full evidence coverage.',
    })
  }

  if (stats.paperCount >= 3 && stats.figureCount + stats.tableCount + stats.formulaCount < stats.paperCount) {
    warnings.push({
      code: 'thin_multi_paper_evidence',
      severity: 'warning',
      message: 'The node contains multiple papers but fewer visual/formula evidence anchors than papers.',
    })
  }

  return {
    status: warnings.length > 0 ? 'needs_vlm_audit' : 'complete',
    warnings,
    requiredAction: warnings.length > 0
      ? 'Run VLM-guided page/crop audit for missing tables, formulas, and weak visual evidence before final article claims are treated as complete.'
      : null,
  }
}

const READER_ARTIFACT_PREFIX = 'alpha:reader-artifact:'
const readerArtifactBuildQueue = new Map<string, Promise<unknown>>()
const NODE_READER_ARTIFACT_SCHEMA_VERSION = 'node-article-v7'
const PAPER_READER_ARTIFACT_SCHEMA_VERSION = 'paper-article-v3'
const DEFAULT_NODE_DEFERRED_ARTIFACT_DELAY_MS = 160
const ENHANCED_NODE_ARTICLE_TIMEOUT_MS = (() => {
  const configured = Number.parseInt(process.env.ENHANCED_NODE_ARTICLE_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(configured) && configured > 0 ? configured : 180000
})()
const HEURISTIC_NARRATIVE_RE =
  /heuristic fit|query overlap|lexical and temporal relevance|stage-aligned query overlap/iu
const LOW_SIGNAL_NODE_COPY_PATTERNS = [
  /\bnode-level judgment\b/iu,
  /\bgood node\b/iu,
  /\bstill do not know\b/iu,
  /\blacks enough visual evidence\b/iu,
  /如果读完这个节点后仍然不知道/u,
  /部分论文缺少足够的可视化或表格证据/u,
]
const LOW_SIGNAL_SECTION_TITLE_PATTERNS = [
  /^(?:table of contents|contents|acknowledg(?:e)?ments?|declaration|dedication|copyright|references|bibliography|appendix)$/iu,
  /^(?:topic placement|paper placement|category placement|node placement)$/iu,
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
  /\b(?:currently\s+)?grouped into \d+ node\(s\)\b/iu,
  /ieee xplore/iu,
  /cookie|privacy notice|sign in|purchase pdf|download pdf/iu,
  /submitted in partial fulfillment|this thesis is submitted|doctor of philosophy|master of science/iu,
  /contents?\s+chapter/iu,
  /list of figures|list of tables/iu,
  /references\s+\[\d+\]/iu,
]
const HTML_SECTION_NOISE_RE =
  /<(?:html|head|body|meta|script|div|span|title)\b|&nbsp;|document\.cookie/iu
const GENERIC_FIGURE_LABEL_RE = /^(?:(?:figure|fig\.?|[\u56fe\u5716]|鍥\??))\s*\d+[a-z]?(?:\s*[:.]?)?$/iu
const GENERIC_TABLE_LABEL_RE = /^(?:(?:table|tab\.?|[\u8868]|琛\??))\s*\d+[a-z]?(?:\s*[:.]?)?$/iu
const GENERIC_FORMULA_LABEL_RE = /^(?:(?:formula|equation|eq\.?|[\u516c\u5f0f]|鍏紡))\s*\d+[a-z]?(?:\s*[:.]?)?$/iu
const BODY_SECTION_TITLE_RE = /^(?:body section|section) \d+$/iu
const DEFAULT_NODE_ARTIFACT_TIMEOUT_MS = 2_000

type ReaderArtifactKind = 'paper' | 'node'
type ReaderArtifactVariant = 'default' | 'enhanced'
type ReaderArtifactWarmMode = 'full' | 'quick' | 'deferred'

interface ReaderArtifactRecord<T> {
  kind: ReaderArtifactKind
  entityId: string
  fingerprint: string
  updatedAt: string
  viewModel: T
}

function normalizeReaderPaperDisplayFields(paper: any) {
  const title = pickMeaningfulDisplayText(
    paper?.titleZh,
    paper?.titleEn,
    paper?.title,
    'Untitled paper',
  )
  const titleEn = pickMeaningfulDisplayText(
    paper?.titleEn,
    paper?.title,
    paper?.titleZh,
    title,
  )
  const titleZh = pickMeaningfulDisplayText(
    paper?.titleZh,
    paper?.titleEn,
    paper?.title,
    title,
  )

  return {
    ...paper,
    title,
    titleEn,
    titleZh,
  }
}

function normalizeReaderNodeDisplayFields(node: any) {
  const primaryPaper = node?.primaryPaper ?? node?.papers ?? null
  const primaryPaperTitle = pickMeaningfulDisplayText(
    primaryPaper?.titleZh,
    primaryPaper?.titleEn,
    primaryPaper?.title,
  )

  return {
    ...node,
    nodeLabel: pickMeaningfulDisplayText(
      node?.nodeLabel,
      node?.nodeSubtitle,
      primaryPaperTitle,
      'Research node',
    ),
    nodeSubtitle: pickMeaningfulDisplayText(
      node?.nodeSubtitle,
      primaryPaper?.titleEn,
      primaryPaper?.title,
      '',
    ),
  }
}

async function withReaderTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
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
      type: 'figure' | 'table' | 'formula' | 'figureGroup'
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
  tableHeaders?: string[]
  tableRows?: unknown[]
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

type EnhancedNodeArticleFlowBlock = import('./deep-article-generator').NodeArticleFlowBlock
type EnhancedPaperArticleBlock = Extract<EnhancedNodeArticleFlowBlock, { type: 'paper-article' }>
type EnhancedPaperTransitionBlock = Extract<EnhancedNodeArticleFlowBlock, { type: 'paper-transition' }>
type EnhancedPaperSubsectionKind = import('./deep-article-generator').PaperSubsectionKind

export interface NodeResearchMethodEntry {
  paperId: string
  paperTitle: string
  publishedAt?: string
  title: string
  titleEn?: string
  summary: string
  keyPoints: string[]
}

export interface NodeResearchEvolutionStep {
  paperId: string
  paperTitle: string
  contribution: string
  improvementOverPrevious?: string
  fromPaperId?: string
  fromPaperTitle?: string
  toPaperId?: string
  toPaperTitle?: string
  transitionType?: EnhancedPaperTransitionBlock['transitionType']
  anchorId?: string
  evidenceAnchorIds?: string[]
}

export interface NodeResearchPaperBrief {
  paperId: string
  paperTitle: string
  role: EnhancedPaperArticleBlock['role']
  publishedAt?: string
  summary: string
  contribution: string
  evidenceAnchorIds: string[]
  keyFigureIds: string[]
  keyTableIds: string[]
  keyFormulaIds: string[]
}

export interface NodeResearchEvidenceChain {
  paperId: string
  paperTitle: string
  subsectionKind: EnhancedPaperSubsectionKind
  subsectionTitle: string
  summary: string
  evidenceAnchorIds: string[]
}

export interface NodeResearchViewModel {
  evidence: {
    featuredAnchorIds: string[]
    supportingAnchorIds: string[]
    featured: EvidenceExplanation[]
    supporting: EvidenceExplanation[]
    paperBriefs: NodeResearchPaperBrief[]
    evidenceChains: NodeResearchEvidenceChain[]
    coverage: {
      totalEvidenceCount: number
      renderableEvidenceCount: number
      figureCount: number
      tableCount: number
      formulaCount: number
      figureGroupCount: number
      sectionCount: number
      featuredCount: number
      supportingCount: number
    }
  }
  methods: {
    entries: NodeResearchMethodEntry[]
    evolution: NodeResearchEvolutionStep[]
    dimensions: string[]
  }
  problems: {
    items: Array<{
      paperId: string
      paperTitle: string
      title: string
      titleEn?: string
      status: 'solved' | 'partial' | 'open'
    }>
    openQuestions: string[]
  }
  coreJudgment: {
    content: string
    contentEn: string
    confidence: 'high' | 'medium' | 'low' | 'speculative'
    quickTags: string[]
  } | null
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
  authors?: string[]
  citationCount?: number | null
  figuresCount: number
  tablesCount: number
  formulasCount: number
  figureGroupsCount: number
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
    figureGroupCount: number
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
  references?: Array<{
    paperId: string
    title: string
    titleEn?: string
    route?: string
    publishedAt?: string
    authors?: string[]
    citationCount?: number | null
    originalUrl?: string
    pdfUrl?: string
  }>
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
    figureGroupCount: number
  }
  evidenceAudit?: NodeEvidenceAudit
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
  articleMarkdown?: string
  critique: ReviewerCritique
  evidence: EvidenceExplanation[]
  /** 澧炲己鐗堟枃绔犳祦锛?-Pass娣卞害瑙ｆ瀽锛? 鍙€夛紝鐢ㄤ簬鏂版牸寮?*/
  enhancedArticleFlow?: EnhancedNodeArticleFlowBlock[]
  /** 鏍稿績鍒ゆ柇锛堣妭鐐圭骇鍒殑涓€鍙ヨ瘽鍒ゆ柇锛?*/
  coreJudgment?: {
    content: string
    contentEn: string
  }
  researchView?: NodeResearchViewModel
  references?: Array<{
    paperId: string
    title: string
    titleEn?: string
    route?: string
    publishedAt?: string
    authors?: string[]
    citationCount?: number | null
    originalUrl?: string
    pdfUrl?: string
  }>
}

type ReaderArtifactViewModel = NodeViewModel | PaperViewModel

function readerArtifactKey(
  kind: ReaderArtifactKind,
  entityId: string,
  variant: ReaderArtifactVariant = 'default',
) {
  return variant === 'default'
    ? `${READER_ARTIFACT_PREFIX}${kind}:${entityId}`
    : `${READER_ARTIFACT_PREFIX}${kind}:${variant}:${entityId}`
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
    Array.from((value ?? '').matchAll(/\b((?:19|20)\d{2})[.\-/\u5e74]\s*(\d{1,2})/gu)).map(
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
  if (!hasMeaningfulDisplayText(normalized)) return true
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

  if (actualPaperCount <= 1 && /妯法/u.test(normalized) && countDistinctNarrativeYears(normalized) >= 2) {
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

function pickMeaningfulNarrativeText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeReaderNarrative(value)
    if (hasMeaningfulDisplayText(normalized)) {
      return normalized
    }
  }

  return ''
}

function normalizePaperNarrativeText(value: string | null | undefined, maxLength = 320) {
  const normalized = clipText(pickMeaningfulNarrativeText(value), maxLength)
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
      .replace(/^abstract\b[^\p{L}\p{N}\u4e00-\u9fff]{0,12}/iu, '')
      .trim()
  }

  if (/^abstract\b/iu.test(normalized)) {
    return normalized.replace(/^abstract\b[^\p{L}\p{N}\u4e00-\u9fff]{0,12}/iu, '').trim()
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
  if (/[.!?銆傦紒锛?锛?]/u.test(normalized)) return false

  const tokens = normalized.split(/\s+/u).filter(Boolean)
  if (tokens.length < 3) return false

  const capitalizedTokens = tokens.filter((token) => /^[A-Z][A-Za-z0-9'’/\-]+$/u.test(token)).length
  const ratio = capitalizedTokens / tokens.length
  return ratio >= 0.6
}

function hasNarrativeSubstance(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return false
  if (normalized.length >= 140) return true
  if (/[.!?銆傦紒锛焆/u.test(normalized) && /[a-z\u4e00-\u9fff]/u.test(normalized)) return true
  return false
}

function cleanExtractedParagraph(value: string | null | undefined) {
  const stripped = stripFrontMatterLead(value ?? '')
  if (!stripped) return ''

  const abstractBody =
    stripped.match(/\babstract\b[^A-Za-z0-9]{0,8}(.*)$/iu)?.[1]?.trim() ?? ''
  const normalized = (abstractBody.length >= 40 ? abstractBody : stripped)
    .replace(/^[^\p{L}\p{N}\u4e00-\u9fff]+/u, '')
    .trim()
  if (!hasMeaningfulDisplayText(normalized)) return ''

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
  const paperTitle = pickMeaningfulDisplayText(
    paper.titleZh,
    paper.titleEn,
    paper.title,
    'This paper',
  )
  const sectionLead =
    getRenderablePaperSections(paper, 3)
      .flatMap((section: any) => section.renderParagraphs as string[])
      .map((paragraph: string) => clipText(paragraph, 180))
      .find((value: string) => value.length > 0) ?? ''

  const abstractLead = normalizePaperNarrativeText(
    pickMeaningfulNarrativeText(paper.summary, paper.explanation, paper.abstract),
    180,
  )
  const { figureCount, tableCount, formulaCount } = paperEvidenceStats(paper)
  const paperLanguage = paper.topic?.language
  const evidenceLine =
    figureCount + tableCount + formulaCount > 0
      ? bilingualText(paperLanguage, `当前抽取结果已经保留了 ${figureCount} 张图、${tableCount} 张表和 ${formulaCount} 个公式，可以直接作为论证证据。`, `Extraction results preserved ${figureCount} figures, ${tableCount} tables, and ${formulaCount} formulas, ready as argument evidence.`)
      : bilingualText(paperLanguage, '当前数据库还没有提取到图、表、公式，节点页先依赖摘要和正文，后续仍需回到原文核对。', 'No figures, tables, or formulas extracted yet. Node page relies on abstract and text for now; source verification pending.')

  return clipText(
    [abstractLead, sectionLead, evidenceLine]
      .filter(Boolean)
      .join(' ')
      .trim() || bilingualText(paper.topic?.language, `${paperTitle}目前更适合作为进入这个节点的单篇深读入口。`, `${paperTitle} currently serves best as a single-paper deep reading entry for this node.`),
    220,
  )
}

function buildNodeNarrativeSeed(args: {
  node: {
    nodeLabel: string
    nodeSubtitle?: string | null
    topic?: { language?: string | null } | null
  }
  papers: any[]
}) {
  const { node, papers } = args
  const language = node.topic?.language
  const primaryPaper = papers[0] ?? null
  const primaryPaperTitle = pickMeaningfulDisplayText(
    primaryPaper?.titleZh,
    primaryPaper?.titleEn,
    primaryPaper?.title,
    'Representative paper',
  )
  const abstractLead = primaryPaper
    ? normalizePaperNarrativeText(
        pickMeaningfulNarrativeText(
          primaryPaper.summary,
          primaryPaper.explanation,
          primaryPaper.abstract,
        ),
        180,
      )
    : ''
  const paperCount = papers.length
  const evidenceCount = papers.reduce(
    (count, paper) => {
      const { figureCount, tableCount, formulaCount } = paperEvidenceStats(paper)
      return count + figureCount + tableCount + formulaCount
    },
    0,
  )

  if (paperCount <= 1) {
    return {
      summary: clipText(
        bilingualText(language, `${node.nodeLabel}当前只纳入 1 篇论文：${primaryPaperTitle}，因此更适合写成围绕单篇论文展开的深读，而不是伪装成跨阶段综述。`, `${node.nodeLabel} currently includes only 1 paper: ${primaryPaperTitle}. Better written as a single-paper deep reading rather than a cross-stage survey.`),
        200,
      ),
      explanation: clipText(
        [
          abstractLead,
          evidenceCount > 0
            ? bilingualText(language, `当前证据层已经保留了 ${evidenceCount} 个图、表或公式，可以作为单篇深读的第一批锚点。`, `Evidence layer preserved ${evidenceCount} figures, tables, or formulas as initial anchors for deep reading.`)
            : bilingualText(language, '当前数据库还没有提取到图、表、公式，节点页应先围绕摘要与正文组织论证，并持续回到原文补证。', 'No figures, tables, or formulas extracted. Node page should organize arguments around abstract and text, with ongoing source verification.'),
        ]
          .filter(Boolean)
          .join(' ')
          .trim(),
        260,
      ),
      standfirst: clipText(
        [
          bilingualText(language, `${node.nodeLabel}当前应被视为"单篇深读入口"：${primaryPaperTitle}。`, `${node.nodeLabel} should be treated as a "single-paper deep reading entry": ${primaryPaperTitle}.`),
          abstractLead,
        ]
          .filter(Boolean)
          .join(' ')
          .trim(),
        280,
      ),
      headline: bilingualText(language, `先讲清 ${clipText(primaryPaperTitle, 36)} 在 ${node.nodeLabel} 里到底推进了什么`, `First clarify what ${clipText(primaryPaperTitle, 36)} actually advances in ${node.nodeLabel}`),
    }
  }

  const earliestPaper = [...papers]
    .sort((left, right) => +new Date(left.published) - +new Date(right.published))[0]
  const latestPaper = [...papers]
    .sort((left, right) => +new Date(right.published) - +new Date(left.published))[0]

  return {
    summary: clipText(
      `This node groups ${paperCount} papers around ${node.nodeLabel}, so the article should explain a real research line rather than list titles side by side.`,
      200,
    ),
    explanation: clipText(
      [
        earliestPaper
          ? `The line begins with ${earliestPaper.titleZh || earliestPaper.title} and later work extends it through ${latestPaper.titleZh || latestPaper.title}.`
          : '',
        abstractLead,
      ]
        .filter(Boolean)
        .join(' ')
        .trim(),
      260,
    ),
    standfirst: clipText(
      `The goal of this node is to show who first framed the problem, who strengthened the evidence, and who actually moved the method forward.`,
      280,
    ),
    headline: `Turn ${node.nodeLabel} into one readable research mainline.`,
  }
}

// ─── DeepAnalysisPipeline Integration Helpers ─────────────────────────────────

/**
 * Check if a paper has sufficient data for deep analysis
 * Requires: sections with content + at least some evidence (figures/tables/formulas)
 */
function hasSufficientDataForDeepAnalysis(paper: PaperContext): boolean {
  // Must have at least 2 sections with meaningful content
  const meaningfulSections = paper.sections.filter(
    (s) => s.paragraphs && s.paragraphs.trim().length > 100
  )
  if (meaningfulSections.length < 2) return false

  // Must have at least some evidence
  const evidenceCount =
    paper.figures.length + paper.tables.length + paper.formulas.length
  if (evidenceCount < 1) return false

  return true
}

/**
 * Convert PaperContext to DeepAnalysisPaper format
 */
function buildDeepAnalysisPaper(paper: PaperContext): DeepAnalysisPaper {
  return {
    id: paper.id,
    title: paper.titleZh || paper.title,
    sections: paper.sections.map((s) => ({
      id: s.id,
      editorialTitle: s.editorialTitle || s.sourceSectionTitle,
      sourceSectionTitle: s.sourceSectionTitle,
      paragraphs: s.paragraphs || '',
    })),
    figures: paper.figures.map((f) => ({
      id: f.id,
      number: f.number,
      caption: f.caption,
      imagePath: f.imagePath || '',
      analysis: f.analysis ?? null,
    })),
    tables: paper.tables.map((t) => ({
      id: t.id,
      number: t.number,
      caption: t.caption,
      rawText: t.rawText,
      headers: t.headers || null,
    })),
    formulas: paper.formulas.map((f) => ({
      id: f.id,
      number: f.number,
      latex: f.latex,
      rawText: f.rawText ?? null,
    })),
  }
}

/**
 * Convert DeepAnalysisResult to PosterStylePaperAnalysis format
 * This bridges the three-pass deep analysis output to the frontend-expected format
 */
function convertDeepAnalysisToPosterStyle(
  result: DeepAnalysisResult,
  paper: PaperContext
): PosterStylePaperAnalysis {
  // Build paragraphs from section analyses
  const paragraphs: PaperParagraph[] = []
  let sortIndex = 0

  // Add thesis paragraph from the first methodology section
  // Core claim first: the thesis paragraph must start with a strong, arguable claim
  const methodologySection = result.sections.find(
    (s) => s.type === 'methodology' || s.type === 'experiment'
  )
  if (methodologySection) {
    // Extract core thesis from key points, ensuring it's an arguable claim not a topic description
    const coreThesisFromPoints = methodologySection.keyPoints.slice(0, 2).join(' ')
    // Ensure the thesis starts with a claim, not a description
    const thesisContent = coreThesisFromPoints || methodologySection.deepAnalysis.slice(0, 80)
    paragraphs.push({
      role: 'thesis',
      content: thesisContent,
      wordCount: thesisContent.length,
      evidenceIds: methodologySection.evidenceReferences,
      sortIndex: sortIndex++,
    })
  }

  // Add evidence paragraphs BEFORE argument paragraphs (figure-dominant: evidence first)
  // This ensures evidence references are placed prominently, not buried in text
  for (const [figId, figAnalysis] of result.evidenceAnalysis.figures) {
    if (figAnalysis.claims.length > 0) {
      // Evidence paragraph: figure reference first, then analysis
      const evidenceContent = figAnalysis.analysis || figAnalysis.claims.join('; ')
      paragraphs.push({
        role: 'evidence',
        content: evidenceContent,
        wordCount: evidenceContent.length,
        evidenceIds: [figId],
        sortIndex: sortIndex++,
      })
    }
  }

  for (const [tblId, tblAnalysis] of result.evidenceAnalysis.tables) {
    if (tblAnalysis.claims.length > 0) {
      const evidenceContent = tblAnalysis.analysis || tblAnalysis.claims.join('; ')
      paragraphs.push({
        role: 'evidence',
        content: evidenceContent,
        wordCount: evidenceContent.length,
        evidenceIds: [tblId],
        sortIndex: sortIndex++,
      })
    }
  }

  // Add argument paragraphs from each section
  // Each paragraph must start with core claim, then evidence, then significance
  for (const section of result.sections) {
    // Skip if already used as thesis
    if (section === methodologySection && sortIndex === 1) continue

    // Split deep analysis into argument-sized chunks
    // Ensure each chunk starts with a core claim (first sentence = claim)
    const analysisChunks = splitAnalysisIntoChunks(section.deepAnalysis, 200)
    for (const chunk of analysisChunks) {
      paragraphs.push({
        role: 'argument',
        title: section.title,
        content: chunk,
        wordCount: chunk.length,
        evidenceIds: section.evidenceReferences,
        sortIndex: sortIndex++,
      })
    }
  }

  // Add insight paragraph from claims validation
  // Closing must connect to broader research question, not just list weaknesses
  const lowConfidenceClaims = result.claims.filter((c) => c.confidence < 0.7)
  const highConfidenceClaims = result.claims.filter((c) => c.confidence >= 0.7)
  const insightContent =
    lowConfidenceClaims.length > 0
      ? `审稿人可能质疑: ${lowConfidenceClaims.map((c) => c.claim).join('; ')}。下一步需要验证这些主张的边界条件。`
      : highConfidenceClaims.length > 0
        ? `核心主张置信度: ${(result.confidenceScore * 100).toFixed(0)}%。${highConfidenceClaims.slice(0, 2).map((c) => c.claim).join('；')}。`
        : `整体置信度: ${(result.confidenceScore * 100).toFixed(0)}%`

  paragraphs.push({
    role: 'insight',
    content: insightContent,
    wordCount: insightContent.length,
    evidenceIds: [],
    sortIndex: sortIndex++,
  })

  // Build core thesis from first thesis paragraph or first section
  // Must be an arguable claim, not a topic description
  const coreThesis =
    paragraphs.find((p) => p.role === 'thesis')?.content ||
    result.sections[0]?.deepAnalysis.slice(0, 60) ||
    paper.title.slice(0, 60)

  // Build closing insight from insight paragraph or claims
  // Must connect to broader research question
  const closingInsight =
    paragraphs.find((p) => p.role === 'insight')?.content ||
    result.claims.slice(0, 3).map((c) => c.claim).join('; ') ||
    '深度分析完成'

  return {
    coreThesis,
    paragraphs,
    closingInsight,
    contentVersion: 'v2',
  }
}

/**
 * Split a long analysis text into argument-sized chunks
 */
function splitAnalysisIntoChunks(text: string, maxChunkSize: number): string[] {
  if (!text || text.length <= maxChunkSize) {
    return text ? [text] : []
  }

  const chunks: string[] = []
  const sentences = text.split(/(?<=[。！？.!?])\s*/u)

  let currentChunk = ''
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence
    } else {
      currentChunk += sentence
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// ─── End DeepAnalysisPipeline Integration Helpers ─────────────────────────────

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

async function readReaderArtifact<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  variant: ReaderArtifactVariant = 'default',
) {
  const record = await prisma.system_configs.findUnique({
    where: { key: readerArtifactKey(kind, entityId, variant) },
  })

  if (!record?.value) return null

  try {
    const parsed = JSON.parse(record.value) as ReaderArtifactRecord<T>
    if (
      !parsed ||
      parsed.kind !== kind ||
      parsed.entityId !== entityId ||
      typeof parsed.fingerprint !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      !isReaderArtifactViewModelValid(kind, parsed.viewModel)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function persistReaderArtifact<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  fingerprint: string,
  viewModel: T,
  variant: ReaderArtifactVariant = 'default',
  options?: { skipArtifactIndex?: boolean },
) {
  const payload: ReaderArtifactRecord<T> = {
    kind,
    entityId,
    fingerprint,
    updatedAt: new Date().toISOString(),
    viewModel,
  }

await prisma.system_configs.upsert({
    where: { key: readerArtifactKey(kind, entityId, variant) },
    update: { value: JSON.stringify(payload), updatedAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      key: readerArtifactKey(kind, entityId, variant),
      value: JSON.stringify(payload),
      updatedAt: new Date(),
    },
  })

  if (variant === 'enhanced') {
    return
  }

  if (options?.skipArtifactIndex) {
    return
  }

  if (kind === 'node') {
    await upsertTopicArtifactIndexEntry(kind, viewModel as ReaderArtifactViewModel as NodeViewModel)
  } else {
    await upsertTopicArtifactIndexEntry(kind, viewModel as ReaderArtifactViewModel as PaperViewModel)
  }
}

function isReaderArtifactViewModelValid(
  kind: ReaderArtifactKind,
  viewModel: unknown,
) {
  if (kind !== 'node') return true

  const serialized = safeSerializeReaderArtifactViewModel(viewModel)
  if (serialized == null || hasLegacyReaderAssetPathLeak(serialized)) {
    return false
  }

  try {
    assertNodeViewModelContract(viewModel)
    return true
  } catch {
    return false
  }
}

function safeSerializeReaderArtifactViewModel(viewModel: unknown) {
  try {
    return JSON.stringify(viewModel)
  } catch {
    return null
  }
}

function hasLegacyReaderAssetPathLeak(serialized: string) {
  return (
    serialized.includes('images\\\\') ||
    serialized.includes('"/uploads/images/') ||
    serialized.includes('"imagePath":"images/') ||
    serialized.includes('"thumbnailPath":"images/') ||
    serialized.includes('"coverImage":"images/') ||
    serialized.includes('"imagePath":"uploads/') ||
    serialized.includes('"thumbnailPath":"uploads/') ||
    serialized.includes('"coverImage":"uploads/') ||
    serialized.includes('"imagePath":"papers/') ||
    serialized.includes('"thumbnailPath":"papers/') ||
    serialized.includes('"coverImage":"papers/')
  )
}

async function dropReaderArtifact(
  kind: ReaderArtifactKind,
  entityId: string,
  variant: ReaderArtifactVariant = 'default',
) {
  await prisma.system_configs.deleteMany({
    where: { key: readerArtifactKey(kind, entityId, variant) },
  })
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

function normalizeReaderFingerprintContext(value: unknown): unknown {
  if (value == null) return null

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeReaderFingerprintContext(entry))
      .filter((entry) => entry !== undefined)
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (
        /^(?:updatedAt|createdAt|savedAt|timestamp|initializedAt|lastCompactedAt)$/u.test(key) ||
        key === 'recentSessionEvents' ||
        key === 'recentEvents' ||
        key === 'recalledEvents'
      ) {
        continue
      }

      const normalized = normalizeReaderFingerprintContext(entry)
      if (normalized === undefined) continue
      output[key] = normalized
    }

    return output
  }

  if (typeof value === 'string') {
    return value.replace(/\s+/gu, ' ').trim()
  }

  return value
}

export async function buildPaperArtifactFingerprint(paperId: string) {
  const paper = await prisma.papers.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      topicId: true,
      updatedAt: true,
      node_papers: {
        select: {
          nodeId: true,
          research_nodes: {
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

  const [runtime, topicMemory, researchContext, modelConfigFingerprint, paperTemplate, reviewerTemplate] = await Promise.all([
    getGenerationRuntimeConfig(),
    loadTopicGenerationMemory(paper.topicId),
    loadReaderResearchPipelineContext({
      topicId: paper.topicId,
      paperIds: [paper.id],
      stageIndex:
        paper.node_papers
          .map((entry) => entry.research_nodes.stageIndex)
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
    relatedNodes: paper.node_papers.map((entry) => ({
      nodeId: entry.nodeId,
      updatedAt: entry.research_nodes.updatedAt.toISOString(),
    })),
    runtime,
    modelConfigFingerprint,
    promptTemplates: [paperTemplate, reviewerTemplate],
    topicMemoryUpdatedAt: topicMemory.updatedAt,
    researchContext: normalizeReaderFingerprintContext(researchContext),
  })
}

export async function buildNodeArtifactFingerprint(
  nodeId: string,
  variant: ReaderArtifactVariant = 'default',
) {
const node = await prisma.research_nodes.findUnique({
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
      papers: {
        select: {
          title: true,
          titleZh: true,
          titleEn: true,
        },
      },
      node_papers: {
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
    modelConfigFingerprint,
    nodeTemplate,
    comparisonTemplate,
    reviewerTemplate,
    effectiveStageWindowMonths,
  ] = await Promise.all([
    prisma.topic_stages.findFirst({
      where: {
        topicId: node.topicId,
        order: node.stageIndex,
      },
      select: {
        name: true,
        nameEn: true,
      },
    }),
    prisma.papers.findMany({
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
  const resolvedNodePapers = resolveNodeReadablePaperIds({
    node,
    papers: topicPapers,
    stageTitle: [stage?.name, stage?.nameEn].filter(Boolean).join(' '),
    stageScopedPaperIds: allowedPaperIds,
  })
  const relatedPaperMap = new Map(topicPapers.map((paper) => [paper.id, paper]))
  const relatedPapers = resolvedNodePapers.resolvedPaperIds
    .map((paperId) => relatedPaperMap.get(paperId) ?? null)
    .filter((paper): paper is (typeof topicPapers)[number] => Boolean(paper))
  const researchPipeline = await loadReaderResearchPipelineContext({
    topicId: node.topicId,
    nodeId: node.id,
    paperIds: relatedPapers.map((paper) => paper.id),
    stageIndex: node.stageIndex,
    historyLimit: 6,
  })

  const researchContextForFingerprint =
    variant === 'enhanced'
      ? {
          ...researchPipeline,
          sessionMemory: null,
          cognitiveMemory: null,
        }
      : researchPipeline

  return buildGenerationFingerprint({
    kind: 'node',
    artifactSchemaVersion: NODE_READER_ARTIFACT_SCHEMA_VERSION,
    nodeId: node.id,
    topicId: node.topicId,
    nodeUpdatedAt: variant === 'enhanced' ? undefined : node.updatedAt.toISOString(),
    primaryPaperId: node.primaryPaperId,
    relatedPapers: relatedPapers.map((paper) => ({
      paperId: paper.id,
      updatedAt: paper.updatedAt.toISOString(),
    })),
    runtime,
    modelConfigFingerprint,
    promptTemplates: [nodeTemplate, comparisonTemplate, reviewerTemplate],
    topicMemoryUpdatedAt: variant === 'enhanced' ? undefined : topicMemory.updatedAt,
    researchContext: normalizeReaderFingerprintContext(researchContextForFingerprint),
  })
}

async function buildEnhancedNodeArtifactFingerprint(nodeId: string) {
  return buildNodeArtifactFingerprint(nodeId, 'enhanced')
}

interface ReaderArtifactDriver<T> {
  kind: ReaderArtifactKind
  variant?: ReaderArtifactVariant
  buildFingerprint: (entityId: string) => Promise<string | null>
  buildViewModel: (entityId: string, options?: { quick?: boolean; enhanced?: boolean }) => Promise<T>
}

function deferredReaderArtifactsDisabled() {
  if (process.env.TOPIC_ARTIFACT_DISABLE_DEFERRED === '1') {
    return true
  }

  if (process.env.TOPIC_ARTIFACT_ALLOW_TEST_DEFERRED === '1') {
    return false
  }

  return (
    process.argv.includes('--test') ||
    process.execArgv.includes('--test') ||
    process.env.NODE_TEST_CONTEXT === 'child-v8' ||
    process.env.NODE_ENV === 'test'
  )
}

function readerArtifactQueueKey(
  kind: ReaderArtifactKind,
  entityId: string,
  variant: ReaderArtifactVariant = 'default',
) {
  return `${kind}:${variant}:${entityId}`
}

async function buildAndPersistReaderArtifact<T>(
  driver: ReaderArtifactDriver<T>,
  entityId: string,
  options?: { enhanced?: boolean },
) {
  const viewModel = await driver.buildViewModel(entityId, options)
  const fingerprint = await driver.buildFingerprint(entityId)
  if (fingerprint) {
    await persistReaderArtifact(
      driver.kind,
      entityId,
      fingerprint,
      viewModel,
      driver.variant ?? 'default',
    )
  }
  return viewModel
}

function queueReaderArtifactBuild<T>(
  driver: ReaderArtifactDriver<T>,
  entityId: string,
  options?: { enhanced?: boolean },
) {
  const queueKey = readerArtifactQueueKey(driver.kind, entityId, driver.variant ?? 'default')
  const existing = readerArtifactBuildQueue.get(queueKey)
  if (existing) return existing as Promise<T>

  const job = (async () => {
    try {
      return await buildAndPersistReaderArtifact(driver, entityId, options)
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
  options?: { forceRebuild?: boolean; enhanced?: boolean },
) {
  const resolvedVariant = driver.variant ?? 'default'
  const shouldQueueDeferredBuild =
    !deferredReaderArtifactsDisabled() &&
    (resolvedVariant !== 'default' || driver.kind === 'node')

  const scheduleDeferredBuild = () => {
    if (!shouldQueueDeferredBuild) return

    const launch = () =>
      void queueReaderArtifactBuild(driver, entityId, { enhanced: options?.enhanced }).catch((error) => {
        if (error instanceof AppError && error.statusCode === 404) {
          return
        }
      })

    if (driver.kind === 'node' && resolvedVariant === 'default') {
      setTimeout(launch, DEFAULT_NODE_DEFERRED_ARTIFACT_DELAY_MS)
      return
    }

    launch()
  }

  if (options?.forceRebuild) {
    return queueReaderArtifactBuild(driver, entityId, { enhanced: options?.enhanced })
  }

  const fingerprintBeforeBuild = await driver.buildFingerprint(entityId)
  if (fingerprintBeforeBuild) {
    const cached = await readReaderArtifact<T>(driver.kind, entityId, resolvedVariant)
    const cacheIsValid =
      cached != null && isReaderArtifactViewModelValid(driver.kind, cached.viewModel)

    if (cached?.fingerprint === fingerprintBeforeBuild && cacheIsValid) {
      return cached.viewModel
    }

    if (cached && !cacheIsValid) {
      await dropReaderArtifact(driver.kind, entityId, resolvedVariant)
    }

      if (cached) {
        const quickViewModel = await persistQuickReaderArtifact(
          driver.kind,
        entityId,
        driver.buildFingerprint,
        driver.buildViewModel,
          options?.enhanced,
          resolvedVariant,
        )
        scheduleDeferredBuild()
        return quickViewModel
      }
  }

  const quickViewModel = await persistQuickReaderArtifact(
    driver.kind,
    entityId,
    driver.buildFingerprint,
    driver.buildViewModel,
    options?.enhanced,
    resolvedVariant,
  )
  scheduleDeferredBuild()
  return quickViewModel
}

async function syncPersistedReaderArtifactFingerprint<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  buildFingerprint: (entityId: string) => Promise<string | null>,
  variant: ReaderArtifactVariant = 'default',
) {
  const [cached, fingerprint] = await Promise.all([
    readReaderArtifact<T>(kind, entityId, variant),
    buildFingerprint(entityId),
  ])

  if (cached && fingerprint && cached.fingerprint !== fingerprint) {
    await persistReaderArtifact(kind, entityId, fingerprint, cached.viewModel, variant)
  }
}

function buildDeferredArtifactFingerprint(fingerprint: string | null, entityId: string) {
  return fingerprint ? `quick:${fingerprint}` : `quick:${entityId}:${Date.now()}`
}

async function persistQuickReaderArtifact<T>(
  kind: ReaderArtifactKind,
  entityId: string,
  buildFingerprint: (entityId: string) => Promise<string | null>,
  buildViewModel: (entityId: string, options?: { quick?: boolean; enhanced?: boolean }) => Promise<T>,
  enhanced?: boolean,
  variant: ReaderArtifactVariant = 'default',
) {
  const [viewModel, fingerprint] = await Promise.all([
    buildViewModel(entityId, { quick: true, enhanced }),
    buildFingerprint(entityId),
  ])

  await persistReaderArtifact(
    kind,
    entityId,
    buildDeferredArtifactFingerprint(fingerprint, entityId),
    viewModel,
    variant,
    { skipArtifactIndex: true },
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
        .split(/(?<=[銆傦紒锛?!])/u)
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

function _joinStoredParagraphs(value: string | null | undefined, maxParts = 6) {
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
    if (
      !normalized ||
      looksLikeLowValueSectionBody(normalized) ||
      looksLikeBoilerplatePaperParagraph(normalized) ||
      seen.has(normalized)
    ) {
      continue
    }
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= maxParts) break
  }

  return output
}

function getRenderablePaperSections(paper: any, maxParts = 5) {
  const sections = Array.isArray(paper.paper_sections)
    ? paper.paper_sections
    : Array.isArray(paper.sections)
      ? paper.sections
      : null

  if (!sections) return [] as Array<any & { renderTitle: string; renderParagraphs: string[] }>

  return sections
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
    const normalized = cleanExtractedParagraph(value)
    if (
      !normalized ||
      looksLikeLowValueSectionBody(normalized) ||
      looksLikeBoilerplatePaperParagraph(normalized) ||
      seen.has(normalized)
    ) {
      continue
    }
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= maxParts) break
  }

  return output
}

function looksLikeBoilerplatePaperParagraph(value: string | null | undefined) {
  const normalized = normalizeReaderNarrative(value)
  if (!normalized) return true
  if (/^(?:source|url|doi)\s*:/iu.test(normalized)) return true
  if (/^https?:\/\//iu.test(normalized)) return true
  if (normalized.length <= 28 && !/[.!?:;]/u.test(normalized)) return true
  if (
    (normalized.match(/\b(?:figure|table|formula|appendix|chapter|section)\b/giu)?.length ?? 0) >= 3 &&
    normalized.length < 120
  ) {
    return true
  }
  return false
}

function buildPaperEvidenceCoverageLine(paper: any) {
  const { figureCount, tableCount, formulaCount } = paperEvidenceStats(paper)
  return [
    figureCount > 0 ? `${figureCount} figure${figureCount > 1 ? 's' : ''}` : '',
    tableCount > 0 ? `${tableCount} table${tableCount > 1 ? 's' : ''}` : '',
    formulaCount > 0 ? `${formulaCount} formula${formulaCount > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

function buildPaperEvidenceCaptionSummary(paper: any) {
  const formulaArtifacts = paperFormulaArtifacts(paper)
  return [
    ...paper.figures.slice(0, 1).map((figure: any) => clipText(figure.caption, 120)),
    ...paper.tables.slice(0, 1).map((table: any) => clipText(table.caption || table.rawText, 120)),
    ...formulaArtifacts.slice(0, 1).map((formula: any) => clipText(formula.rawText || formula.latex, 120)),
  ]
    .filter(Boolean)
    .join(' ')
}

function buildFigureWhyItMattersEditorial(figure: any, language?: string | null) {
  const evidenceText = [figure.caption, figure.analysis].filter(Boolean).join(' ')
  if (/(?:architecture|framework|overview|pipeline|policy|encoder|decoder|occupancy)/iu.test(evidenceText)) {
    return bilingualText(language, '这张图把方法结构讲清楚了。', 'This figure clarifies the method architecture.')
  }
  if (/(?:trajectory|prediction|simulation|rollout|future|qualitative|scenario)/iu.test(evidenceText)) {
    return bilingualText(language, '这张图展示的是模型输出与场景表现。', 'This figure shows model outputs and scenario performance.')
  }
  return GENERIC_FIGURE_LABEL_RE.test((figure.caption ?? '').trim())
    ? bilingualText(language, '这张图需要结合原论文查看细部标注。', 'This figure requires consulting the original paper for detailed annotations.')
    : bilingualText(language, '这张图直接支撑正文里的核心判断。', 'This figure directly supports a core judgment in the text.')
}

function buildTableWhyItMattersEditorial(table: any, language?: string | null) {
  const evidenceText = [table.caption, table.rawText].filter(Boolean).join(' ')
  if (/(?:leaderboard|ablation|result|benchmark|mAP|ADE|FDE|IoU|score|accuracy|collision|miss rate)/iu.test(evidenceText)) {
    return bilingualText(language, '这张表给出了最关键的结果比较。', 'This table provides the most critical result comparison.')
  }
  return bilingualText(language, '这张表适合用来做直接对照。', 'This table is suitable for direct comparison.')
}

function buildFormulaWhyItMattersEditorial(formula: any, language?: string | null) {
  const evidenceText = [sanitizeFormulaLatex(formula.latex), formula.rawText].filter(Boolean).join(' ')
  if (/(?:loss|objective|min|max|likelihood|cost)/iu.test(evidenceText)) {
    return bilingualText(language, '这条公式定义了优化目标。', 'This formula defines the optimization objective.')
  }
  return bilingualText(language, '这条公式说明了方法依赖的约束条件。', 'This formula explains the constraints the method depends on.')
}

function sanitizeFormulaLatex(value: string | null | undefined) {
  const latex = (value ?? '')
    .replace(/\r\n/gu, '\n')
    .replaceAll('\0', ' ')
    .replace(/\uFFFD/gu, ' ')
    .replace(/^\$+|\$+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()

  return latex
}

function looksLikeFormulaLatexNoise(value: string | null | undefined) {
  const latex = sanitizeFormulaLatex(value)
  if (!latex || latex.length < 5) return true
  if (/^[^A-Za-z\\\d]+$/u.test(latex)) return true
  if (/[\u02C6\u02C7\u02DC\u00AF]/u.test(latex) && !/\\(?:hat|tilde|bar|vec)/u.test(latex)) {
    return true
  }

  const hasSymbolicStructure =
    /[=+\-/*<>]/u.test(latex) ||
    /\\(?:frac|sum|prod|min|max|arg|max|min|log|exp|mathbb|mathbf|mathcal|cdot|left|right)/u.test(
      latex,
    )
  const alphaCount = latex.match(/[A-Za-z]/gu)?.length ?? 0

  if (!hasSymbolicStructure && alphaCount < 2) return true
  if ((latex.match(/[?]/gu)?.length ?? 0) >= 2) return true

  return false
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
      looksLikeFormulaLatexNoise(item.formulaLatex) ||
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

function resolveEvidenceImportance(item: EvidenceExplanation) {
  return Math.max(0, item.importance ?? scoreEvidenceForArticle(item))
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
  const figureLimit = limits?.figureLimit ?? 10
  const tableLimit = limits?.tableLimit ?? 10
  const formulaLimit = limits?.formulaLimit ?? 10
  const totalLimit = limits?.totalLimit ?? 10

  const ranked = evidence
    .filter(isRenderableEvidence)
    .map((item) => ({
      item,
      score: resolveEvidenceImportance(item),
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

function buildFallbackPaperSections(paper: any, evidence: EvidenceExplanation[], language?: string | null): ArticleSection[] {
  const evidenceCoverage = buildPaperEvidenceCoverageLine(paper)
  const evidenceCaptionSummary = buildPaperEvidenceCaptionSummary(paper)

  const sections: ArticleSection[] = [
    {
      id: 'paper-fallback-problem',
      kind: 'lead',
      title: fallbackProblemTitle(language),
      body: uniqueNarrativeParagraphs([
        normalizePaperNarrativeText(paper.summary, 320),
        paper.explanation ? normalizePaperNarrativeText(paper.explanation, 320) : '',
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table'], 3),
    },
    {
      id: 'paper-fallback-method',
      kind: 'paper-pass',
      title: fallbackMethodTitle(language),
      body: uniqueNarrativeParagraphs([
        paper.explanation ? normalizePaperNarrativeText(paper.explanation, 320) : '',
        paperEvidenceStats(paper).formulaCount > 0
          ? fallbackMethodFormulaText(language)
          : fallbackMethodNarrativeText(language),
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['formula', 'figure'], 3),
    },
    {
      id: 'paper-fallback-evidence',
      kind: 'evidence',
      title: fallbackEvidenceTitle(language),
      body: uniqueNarrativeParagraphs([
        evidenceCoverage
          ? fallbackEvidenceCoverageText(language, evidenceCoverage)
          : fallbackNoEvidenceText(language),
        evidenceCaptionSummary ? fallbackEvidenceCaptionText(language, evidenceCaptionSummary) : '',
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table', 'formula'], 5),
    },
    {
      id: 'paper-fallback-boundary',
      kind: 'paper-pass',
      title: fallbackBoundaryTitle(language),
      body: uniqueNarrativeParagraphs([
        paper.figures.length === 0 && paper.tables.length === 0
          ? fallbackLowEvidenceText(language)
          : fallbackHasEvidenceText(language),
        fallbackNodeContextText(language),
      ]),
      evidenceIds: buildSectionEvidenceIds(evidence, ['section', 'figure', 'table', 'formula'], 3),
    },
  ]

  return sections.filter((section) => section.body.length > 0)
}

type ReaderRouteContext = {
  nodeId?: string | null
  topicId?: string | null
  language?: string | null
}

function buildAnchoredRoute(basePath: string, params?: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (!value) continue
    searchParams.set(key, value)
  }
  const query = searchParams.toString()
  return query ? `${basePath}?${query}` : basePath
}

function topicRoute(topicId: string, params?: Record<string, string | null | undefined>) {
  return buildAnchoredRoute(`/topic/${topicId}`, params)
}

function nodeRoute(nodeId: string, params?: Record<string, string | null | undefined>) {
  return buildAnchoredRoute(`/node/${nodeId}`, params)
}

function resolveLinkedNodeId(paper: any) {
  const nodeCandidates = [
    paper?.nodeId,
    paper?.node?.id,
    ...(Array.isArray(paper?.node_papers)
      ? paper.node_papers.flatMap((entry: any) => [
          entry?.nodeId,
          entry?.node?.id,
          entry?.research_nodes?.id,
          entry?.researchNode?.id,
        ])
      : []),
  ]

  return (
    nodeCandidates.find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    ) ?? null
  )
}

function resolvePaperRouteContext(
  paper: any,
  preferred?: ReaderRouteContext,
): ReaderRouteContext {
  const nodeId = preferred?.nodeId ?? resolveLinkedNodeId(paper)
  const topicId =
    preferred?.topicId ??
    paper?.topicId ??
    paper?.topic?.id ??
    paper?.topics?.id ??
    null

  if (nodeId) {
    return {
      nodeId,
      topicId,
    }
  }

  if (topicId) {
    return {
      nodeId: null,
      topicId,
    }
  }

  return {}
}

function paperRoute(
  args: ReaderRouteContext & {
    paperId: string
    anchorId?: string
    evidenceId?: string
  },
) {
  if (args.nodeId) {
    return nodeRoute(args.nodeId, {
      anchor: args.evidenceId ? undefined : args.anchorId ?? `paper:${args.paperId}`,
      evidence: args.evidenceId,
    })
  }

  if (args.topicId) {
    return topicRoute(args.topicId, {
      anchor: args.evidenceId ? undefined : args.anchorId ?? `paper:${args.paperId}`,
      evidence: args.evidenceId,
    })
  }

  return '/'
}

function parseJsonUnknownArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function paperRoleLabel(index: number, isPrimary: boolean) {
  if (isPrimary) return 'Mainline paper'
  if (index === 1) return 'Supporting paper'
  if (index === 2) return 'Comparison paper'
  return 'Extension paper'
}

function buildReviewerCritique(kind: 'paper' | 'node', bullets: string[]): ReviewerCritique {
  return {
    title: 'Reviewer questions to keep asking',
    summary:
      kind === 'node'
        ? 'A node only stands if multiple papers truly push the same line forward, the cross-paper comparison is fair, and the remaining open problems are stated clearly.'
        : 'A paper only stands if its evidence is strong enough, the comparison setting is fair, and the conclusion does not overreach what the experiments actually support.',
    bullets,
  }
}

function buildSectionEvidenceIds(evidence: EvidenceExplanation[], kinds: Array<'section' | 'figure' | 'table' | 'formula' | 'figureGroup'>, limit = 3) {
  return evidence.filter((item) => kinds.includes(item.type)).slice(0, limit).map((item) => item.anchorId)
}

function _buildPaperEvidence(paper: any, routeContext?: ReaderRouteContext): EvidenceExplanation[] {
  const resolvedRouteContext = resolvePaperRouteContext(paper, routeContext)
  const renderableSections = getRenderablePaperSections(paper)
  return [
    ...renderableSections.map((section: any) => ({
      anchorId: `section:${section.id}`,
      type: 'section' as const,
      route: paperRoute({
        ...resolvedRouteContext,
        paperId: paper.id,
        evidenceId: `section:${section.id}`,
      }),
      title: section.renderTitle,
      label: `${paper.titleZh || paper.title} / ${section.renderTitle}`,
      quote: clipText(section.renderParagraphs.join('\n\n'), 220),
      content: section.renderParagraphs.join('\n\n'),
      page: null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      whyItMatters: 'This section provides body evidence that the article can quote and interpret directly.',
    })),
    ...paper.figures.map((figure: any) => ({
      anchorId: `figure:${figure.id}`,
      type: 'figure' as const,
      route: paperRoute({
        ...resolvedRouteContext,
        paperId: paper.id,
        evidenceId: `figure:${figure.id}`,
      }),
      title: `Figure ${figure.number}`,
      label: `${paper.titleZh || paper.title} / Figure ${figure.number}`,
      quote: clipText(figure.caption),
      content: `${figure.caption}\n\n${figure.analysis ?? ''}`.trim(),
      page: figure.page ?? null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      imagePath: resolvePaperAssetPath({ assetPath: figure.imagePath, paperId: paper.id }) ?? null,
      thumbnailPath: resolvePaperAssetPath({ assetPath: figure.thumbnailPath, paperId: paper.id }) ?? null,
      whyItMatters: 'This figure shows the key phenomenon or comparison result that the paper relies on.',
    })),
    ...paper.tables.map((table: any) => ({
      anchorId: `table:${table.id}`,
      type: 'table' as const,
      route: paperRoute({
        ...resolvedRouteContext,
        paperId: paper.id,
        evidenceId: `table:${table.id}`,
      }),
      title: `Table ${table.number}`,
      label: `${paper.titleZh || paper.title} / Table ${table.number}`,
      quote: clipText(table.caption),
      content: `${table.caption}\n\n${table.rawText}`.trim(),
      page: table.page ?? null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      whyItMatters: 'This table usually decides whether the claimed advantage over baselines actually holds.',
    })),
    ...paperFormulaArtifacts(paper).map((formula: any) => {
      const normalizedLatex = sanitizeFormulaLatex(formula.latex)
      return {
        anchorId: `formula:${formula.id}`,
        type: 'formula' as const,
        route: paperRoute({
          ...resolvedRouteContext,
          paperId: paper.id,
          evidenceId: `formula:${formula.id}`,
        }),
        title: `Formula ${formula.number}`,
        label: `${paper.titleZh || paper.title} / Formula ${formula.number}`,
        quote: clipText(formula.rawText || normalizedLatex),
        content: [normalizedLatex, formula.rawText ?? ''].filter(Boolean).join('\n\n').trim(),
        page: formula.page ?? null,
        sourcePaperId: paper.id,
        sourcePaperTitle: paper.titleZh || paper.title,
        formulaLatex: looksLikeFormulaLatexNoise(normalizedLatex) ? null : normalizedLatex,
        whyItMatters: '这条公式交代了方法背后的真实约束、目标函数或更新规则。',
      }
    }),
  ]
}

function finalizePaperEvidence(
  paper: any,
  evidence: EvidenceExplanation[],
  routeContext?: ReaderRouteContext,
) {
  const resolvedRouteContext = resolvePaperRouteContext(paper, routeContext)
  const figureById = new Map<
    string,
    { imagePath?: string | null; thumbnailPath?: string | null }
  >(paper.figures.map((figure: any) => [String(figure.id), figure]))
  const tableById = new Map<
    string,
    { headers?: string | null; rows?: string | null }
  >(paper.tables.map((table: any) => [String(table.id), table]))

  return evidence.map((item) => {
    const route =
      item.type === 'section'
        ? paperRoute({
            ...resolvedRouteContext,
            paperId: paper.id,
            evidenceId: item.anchorId,
          })
        : item.type === 'figure' || item.type === 'table' || item.type === 'formula'
          ? paperRoute({
              ...resolvedRouteContext,
              paperId: paper.id,
              evidenceId: item.anchorId,
            })
          : paperRoute({
              ...resolvedRouteContext,
              paperId: paper.id,
              anchorId: item.anchorId,
            })

    if (item.type === 'figure') {
      const figure = figureById.get(item.anchorId.replace(/^figure:/u, ''))
      return {
        ...item,
        route,
        imagePath:
          resolvePaperAssetPath({ assetPath: item.imagePath ?? figure?.imagePath ?? null, paperId: paper.id }) ??
          null,
        thumbnailPath:
          resolvePaperAssetPath({
            assetPath: item.thumbnailPath ?? figure?.thumbnailPath ?? null,
            paperId: paper.id,
          }) ?? null,
      }
    }

    if (item.type === 'table') {
      const table = tableById.get(item.anchorId.replace(/^table:/u, ''))
      return {
        ...item,
        route,
        tableHeaders: item.tableHeaders ?? parseJsonArray(table?.headers),
        tableRows: item.tableRows ?? parseJsonUnknownArray(table?.rows),
      }
    }

    return {
      ...item,
      route,
    }
  })
}

function buildRenderablePaperEvidence(paper: any, routeContext?: ReaderRouteContext): EvidenceExplanation[] {
  const renderableSections = getRenderablePaperSections(paper)
  const sectionEvidence = renderableSections.map((section: any) => ({
    anchorId: `section:${section.id}`,
    type: 'section' as const,
    route: '',
    title: section.renderTitle,
    label: `${paper.titleZh || paper.title} / ${section.renderTitle}`,
    quote: clipText(section.renderParagraphs.join('\n\n'), 220),
    content: section.renderParagraphs.join('\n\n'),
    page: null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    whyItMatters: 'This section gives the article a grounded place in the original body text.',
    importance: 6,
  }))

  const figureEvidence = paper.figures.map((figure: any) => ({
    anchorId: `figure:${figure.id}`,
    type: 'figure' as const,
    route: '',
    title: `Figure ${figure.number}`,
    label: `${paper.titleZh || paper.title} / Figure ${figure.number}`,
    quote: clipText(figure.caption),
    content: `${figure.caption}\n\n${figure.analysis ?? ''}`.trim(),
    page: figure.page ?? null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    imagePath: resolvePaperAssetPath({ assetPath: figure.imagePath, paperId: paper.id }) ?? null,
    whyItMatters: buildFigureWhyItMattersEditorial(figure, paper.topic?.language),
  }))

  const tableEvidence = paper.tables.map((table: any) => ({
    anchorId: `table:${table.id}`,
    type: 'table' as const,
    route: '',
    title: `Table ${table.number}`,
    label: `${paper.titleZh || paper.title} / Table ${table.number}`,
    quote: clipText(table.caption),
    content: `${table.caption}\n\n${table.rawText}`.trim(),
    page: table.page ?? null,
    sourcePaperId: paper.id,
    sourcePaperTitle: paper.titleZh || paper.title,
    whyItMatters: buildTableWhyItMattersEditorial(table, paper.topic?.language),
  }))

  const formulaEvidence = paperFormulaArtifacts(paper).map((formula: any) => {
    const normalizedLatex = sanitizeFormulaLatex(formula.latex)

    return {
      anchorId: `formula:${formula.id}`,
      type: 'formula' as const,
      route: '',
      title: `Formula ${formula.number}`,
      label: `${paper.titleZh || paper.title} / Formula ${formula.number}`,
      quote: clipText(formula.rawText || normalizedLatex),
      content: [normalizedLatex, formula.rawText ?? ''].filter(Boolean).join('\n\n').trim(),
      page: formula.page ?? null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      formulaLatex: looksLikeFormulaLatexNoise(normalizedLatex) ? null : normalizedLatex,
      whyItMatters: buildFormulaWhyItMattersEditorial(formula, paper.topic?.language),
    }
  })

  return finalizePaperEvidence(
    paper,
    [...sectionEvidence, ...figureEvidence, ...tableEvidence, ...formulaEvidence].map((item) => ({
      ...item,
      importance: resolveEvidenceImportance(item),
    })),
    routeContext,
  )
}

function inferResearchConfidence(
  evidence: EvidenceExplanation[],
): 'high' | 'medium' | 'low' | 'speculative' {
  if (evidence.length === 0) return 'speculative'

  const averageImportance =
    evidence.reduce((sum, item) => sum + (item.importance ?? 5), 0) / evidence.length

  if (averageImportance >= 8) return 'high'
  if (averageImportance >= 5) return 'medium'
  return 'low'
}

function inferProblemStatusFromResults(
  problemContent: string,
  resultsContent?: string,
): 'solved' | 'partial' | 'open' {
  const normalizedProblem = normalizeReaderNarrative(problemContent).toLowerCase()
  if (/(?:宸茶В鍐硘鎴愬姛瑙ｅ喅|褰诲簳瑙ｅ喅|solved|successfully)/iu.test(normalizedProblem)) return 'solved'
  if (/(?:閮ㄥ垎|鏀瑰杽|improved|partial|progress)/iu.test(normalizedProblem)) return 'partial'
  if (!resultsContent) return 'open'

  const normalizedResults = normalizeReaderNarrative(resultsContent).toLowerCase()
  if (/(?:鎴愬姛|瀹炵幇|杈惧埌|solved|achieved|effectively)/iu.test(normalizedResults)) return 'solved'
  if (/(?:閮ㄥ垎|鏀瑰杽|鎻愬崌|partial|improved|progress)/iu.test(normalizedResults)) return 'partial'
  return 'open'
}

function extractResearchMethodDimensions(
  entries: Array<{
    summary: string
    keyPoints: string[]
  }>,
) {
  const dimensions = new Set<string>()

  for (const entry of entries) {
    for (const point of entry.keyPoints.slice(0, 3)) {
      const trimmed = point.split(/[锛?锛?]/u)[0]?.trim() ?? ''
      if (trimmed.length >= 2 && trimmed.length <= 18) {
        dimensions.add(trimmed)
      }
    }
  }

  return Array.from(dimensions).slice(0, 6)
}

function stripResearchEvidenceMarkers(value: string) {
  return value.replace(/\[\[(figure|table|formula):[a-zA-Z0-9_-]+\]\]/gu, ' ')
}

function normalizeResearchEvidenceAnchorIds(anchorIds: string[]) {
  return Array.from(new Set(anchorIds.map((anchorId) => anchorId.trim()).filter(Boolean)))
}

function extractRenderableEvidenceAnchorIds(
  subsections: EnhancedPaperArticleBlock['subsections'],
) {
  return normalizeResearchEvidenceAnchorIds(
    subsections.flatMap((subsection) =>
      subsection.evidenceIds.filter((anchorId) =>
        anchorId.startsWith('figure:') ||
        anchorId.startsWith('table:') ||
        anchorId.startsWith('formula:'),
      ),
    ),
  )
}

function buildResearchPaperBriefs(
  papers: EnhancedPaperArticleBlock[],
  evidenceAnchorsByPaperId: Map<string, string[]>,
): NodeResearchPaperBrief[] {
  return papers.map((paper) => {
    const subsectionEvidenceAnchorIds = extractRenderableEvidenceAnchorIds(paper.subsections)
    const fallbackEvidenceAnchorIds = evidenceAnchorsByPaperId.get(paper.paperId) ?? []
    const evidenceAnchorIds = normalizeResearchEvidenceAnchorIds([
      ...subsectionEvidenceAnchorIds,
      ...fallbackEvidenceAnchorIds,
    ])
    const summarySource = [
      paper.introduction,
      ...paper.subsections
        .filter((subsection) =>
          subsection.kind === 'problem' ||
          subsection.kind === 'method' ||
          subsection.kind === 'results',
        )
        .map((subsection) => subsection.content)
        .slice(0, 3),
    ].join('\n')
    const contributionSource =
      paper.subsections.find((subsection) => subsection.kind === 'contribution')?.content ??
      paper.conclusion

    return {
      paperId: paper.paperId,
      paperTitle: paper.title,
      role: paper.role,
      publishedAt: paper.publishedAt,
      summary: clipText(
        normalizeReaderNarrative(stripResearchEvidenceMarkers(summarySource)),
        240,
      ),
      contribution: clipText(
        normalizeReaderNarrative(stripResearchEvidenceMarkers(contributionSource)),
        180,
      ),
      evidenceAnchorIds,
      keyFigureIds: evidenceAnchorIds.filter((anchorId) => anchorId.startsWith('figure:')).slice(0, 5),
      keyTableIds: evidenceAnchorIds.filter((anchorId) => anchorId.startsWith('table:')).slice(0, 5),
      keyFormulaIds: evidenceAnchorIds.filter((anchorId) => anchorId.startsWith('formula:')).slice(0, 5),
    }
  })
}

function buildResearchEvidenceChains(
  papers: EnhancedPaperArticleBlock[],
): NodeResearchEvidenceChain[] {
  return papers.flatMap((paper) =>
    paper.subsections
      .map((subsection) => {
        const evidenceAnchorIds = normalizeResearchEvidenceAnchorIds(
          subsection.evidenceIds.filter((anchorId) =>
            anchorId.startsWith('figure:') ||
            anchorId.startsWith('table:') ||
            anchorId.startsWith('formula:'),
          ),
        )

        if (evidenceAnchorIds.length === 0) return null

        return {
          paperId: paper.paperId,
          paperTitle: paper.title,
          subsectionKind: subsection.kind,
          subsectionTitle: subsection.title,
          summary: clipText(
            normalizeReaderNarrative(stripResearchEvidenceMarkers(subsection.content)),
            180,
          ),
          evidenceAnchorIds,
        } satisfies NodeResearchEvidenceChain
      })
      .filter((entry): entry is NodeResearchEvidenceChain => Boolean(entry)),
  )
}

function buildResearchEvolution(
  transitions: EnhancedPaperTransitionBlock[],
  paperBriefs: NodeResearchPaperBrief[],
): NodeResearchEvolutionStep[] {
  const paperBriefMap = new Map(paperBriefs.map((brief) => [brief.paperId, brief] as const))

  return transitions.map((transition) => {
    const targetBrief = paperBriefMap.get(transition.toPaperId)
    return {
      paperId: transition.toPaperId,
      paperTitle: transition.toPaperTitle,
      contribution: clipText(normalizeReaderNarrative(transition.content), 180),
      improvementOverPrevious: `${transition.fromPaperTitle} -> ${transition.toPaperTitle}`,
      fromPaperId: transition.fromPaperId,
      fromPaperTitle: transition.fromPaperTitle,
      toPaperId: transition.toPaperId,
      toPaperTitle: transition.toPaperTitle,
      transitionType: transition.transitionType,
      anchorId: targetBrief?.evidenceAnchorIds[0],
      evidenceAnchorIds: targetBrief?.evidenceAnchorIds.slice(0, 4) ?? [],
    }
  })
}

function buildNodeResearchView(args: {
  evidence: EvidenceExplanation[]
  enhancedArticleFlow?: EnhancedNodeArticleFlowBlock[]
  critique: ReviewerCritique
  coreJudgment?: { content: string; contentEn: string }
  papers?: any[]
}) {
  const sortedEvidence = [...args.evidence].sort(
    (left, right) => resolveEvidenceImportance(right) - resolveEvidenceImportance(left),
  )
  const renderableEvidence = sortedEvidence
    .filter(isRenderableEvidence)
    .filter((item) => !looksLikeEvidenceNoise(item))
  const paperCount = args.papers?.length || 1
  const scaledFigureLimit = Math.max(10, paperCount * 3)
  const scaledTableLimit = Math.max(10, paperCount * 2)
  const scaledFormulaLimit = Math.max(10, paperCount * 2)
  const scaledTotalLimit = Math.max(20, paperCount * 6)
  const prioritizedEvidence = selectArticleEvidence(renderableEvidence, {
    figureLimit: scaledFigureLimit,
    tableLimit: scaledTableLimit,
    formulaLimit: scaledFormulaLimit,
    totalLimit: scaledTotalLimit,
  })
  const backupEvidence = renderableEvidence.filter((item) => resolveEvidenceImportance(item) > 0)
  const perPaperCoverageEvidence = Array.from(
    new Map(
      backupEvidence
        .filter((item) => typeof item.sourcePaperId === 'string' && item.sourcePaperId.trim().length > 0)
        .map((item) => [item.sourcePaperId as string, item] as const),
    ).values(),
  )
  const evidenceAnchorsByPaperId = new Map<string, string[]>()
  for (const item of backupEvidence) {
    const paperId = typeof item.sourcePaperId === 'string' ? item.sourcePaperId : ''
    if (!paperId) continue
    const current = evidenceAnchorsByPaperId.get(paperId) ?? []
    if (!current.includes(item.anchorId)) {
      current.push(item.anchorId)
    }
    evidenceAnchorsByPaperId.set(paperId, current)
  }
  const focusEvidenceLimit = Math.max(12, paperCount * 3)
  const focusEvidence = Array.from(
    new Map(
      [...perPaperCoverageEvidence, ...prioritizedEvidence, ...backupEvidence].map(
        (item) => [item.anchorId, item] as const,
      ),
    ).values(),
  ).slice(0, focusEvidenceLimit)
  const featuredAnchorIds = focusEvidence.slice(0, Math.max(2, paperCount)).map((item) => item.anchorId)
  const supportingAnchorIds = focusEvidence.slice(Math.max(2, paperCount), focusEvidenceLimit).map((item) => item.anchorId)
  const evidenceByAnchorId = new Map(sortedEvidence.map((item) => [item.anchorId, item] as const))
  const featured = featuredAnchorIds
    .map((anchorId) => evidenceByAnchorId.get(anchorId))
    .filter((item): item is EvidenceExplanation => Boolean(item))
  const supporting = supportingAnchorIds
    .map((anchorId) => evidenceByAnchorId.get(anchorId))
    .filter((item): item is EvidenceExplanation => Boolean(item))
  const paperArticles =
    args.enhancedArticleFlow?.filter(
      (block): block is EnhancedPaperArticleBlock => block.type === 'paper-article',
    ) ?? []
  const paperTransitions =
    args.enhancedArticleFlow?.filter(
      (block): block is EnhancedPaperTransitionBlock => block.type === 'paper-transition',
    ) ?? []
  const paperBriefs = buildResearchPaperBriefs(paperArticles, evidenceAnchorsByPaperId)
  const evidenceChains = buildResearchEvidenceChains(paperArticles)

  const methodEntries =
    paperArticles
      .flatMap((block) =>
        block.subsections
          .filter((subsection) => subsection.kind === 'method')
          .map((subsection) => ({
            paperId: block.paperId,
            paperTitle: block.title,
            publishedAt: block.publishedAt,
            title: subsection.title,
            titleEn: subsection.titleEn,
            summary: clipText(normalizeReaderNarrative(subsection.content), 180),
            keyPoints: subsection.keyPoints.slice(0, 4),
          })),
      )
  const evolution = buildResearchEvolution(paperTransitions, paperBriefs)

  const problemItems =
    paperArticles
      .flatMap((block) => {
        const resultSections = block.subsections.filter((subsection) => subsection.kind === 'results')
        const resultsContent = resultSections.map((subsection) => subsection.content).join('\n')

        return block.subsections
          .filter((subsection) => subsection.kind === 'problem')
          .map((subsection) => ({
            paperId: block.paperId,
            paperTitle: block.title,
            title: subsection.title,
            titleEn: subsection.titleEn,
            status: inferProblemStatusFromResults(subsection.content, resultsContent),
          }))
      })

  const openQuestions = args.critique.bullets
    .filter((bullet) => /(?:future|open|need|remain|question|gap|boundary)/iu.test(bullet))
    .slice(0, 5) ??
    args.critique.bullets
      .filter((bullet) => /(?:寮€鏀緗future|open|need|remain|缂哄彛|闂)/iu.test(bullet))
      .slice(0, 5)

  const quickTagSource =
    methodEntries.flatMap((entry) => entry.keyPoints).slice(0, 6).length > 0
      ? methodEntries.flatMap((entry) => entry.keyPoints)
      : sortedEvidence.map((item) =>
          item.type === 'section'
            ? 'section' : item.type === 'figure' ? 'figure' : item.type === 'table' ? 'table' : 'formula',
        )
  const quickTags = Array.from(
    new Set(quickTagSource.map((item) => normalizeReaderNarrative(item)).filter(Boolean)),
  ).slice(0, 6)

  return {
    evidence: {
      featuredAnchorIds,
      supportingAnchorIds,
      featured,
      supporting,
      paperBriefs,
      evidenceChains,
      coverage: {
        totalEvidenceCount: sortedEvidence.length,
        renderableEvidenceCount: renderableEvidence.length,
        figureCount: sortedEvidence.filter((item) => item.type === 'figure').length,
        tableCount: sortedEvidence.filter((item) => item.type === 'table').length,
        formulaCount: sortedEvidence.filter((item) => item.type === 'formula').length,
        figureGroupCount: sortedEvidence.filter((item) => item.type === 'figureGroup').length,
        sectionCount: sortedEvidence.filter((item) => item.type === 'section').length,
        featuredCount: featured.length,
        supportingCount: supporting.length,
      },
    },
    methods: {
      entries: methodEntries,
      evolution,
      dimensions: extractResearchMethodDimensions(methodEntries),
    },
    problems: {
      items: problemItems,
      openQuestions,
    },
    coreJudgment: args.coreJudgment
      ? {
          ...args.coreJudgment,
          confidence: inferResearchConfidence(args.evidence),
          quickTags,
        }
      : null,
  } satisfies NonNullable<NodeViewModel['researchView']>
}

function buildPaperCritique(paper: any): ReviewerCritique {
  const { formulaCount } = paperEvidenceStats(paper)
  return buildReviewerCritique('paper', [
    paper.figures.length === 0
      ? 'Key visual evidence is still thin, so the conclusion risks leaning on narrative more than direct proof.'
      : 'Even when figures exist, they still need to be checked against the most decisive comparison setting.',
    paper.tables.length === 0
      ? 'Without a systematic comparison table, the claimed advantage over baselines remains fragile.'
      : 'The table results still need scrutiny around significance, fairness, and metric choice.',
    formulaCount === 0
      ? 'When a method lacks a clear formula or mechanism definition, its reproducibility boundary becomes vague.'
      : 'Even with formulas present, the assumptions and derivation steps still need to be checked carefully.',
  ])
}

function buildNodeCritique(node: any, papers: any[]): ReviewerCritique {
  const paperCount = papers.length
  return buildReviewerCritique('node', [
    paperCount > 1
      ? 'Even when several papers form a visible line, we still need to check whether they genuinely push one another forward under comparable settings.'
      : 'If the node is mainly supported by a single paper, the node itself is still structurally fragile.',
    papers.some((paper) => paper.figures.length === 0 && paper.tables.length === 0)
      ? 'Some papers still lack enough visual or tabular evidence, so the node-level evidence chain remains uneven.'
      : 'Even when every paper has figures or tables, the evidence may still not be directly comparable across papers.',
    'A node summary cannot stop at saying that these papers matter; it must say exactly which question was advanced and which question was merely reframed.',
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
          label: normalizeReaderNarrative(point.label) || args.fallback.points[index]?.label || `姣旇緝鐐?${index + 1}`,
          detail: looksLikeStaleNodeNarrative(point.detail, args.paperCount)
            ? ''
            : clipText(point.detail, 220),
        }))
        .filter((point) => point.detail).length > 0
        ? args.pass.points
            .map((point, index) => ({
              label: normalizeReaderNarrative(point.label) || args.fallback.points[index]?.label || `姣旇緝鐐?${index + 1}`,
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

function buildPaperArticleSections(paper: any, evidence: EvidenceExplanation[], language?: string | null): ArticleSection[] {
  const renderableSections = getRenderablePaperSections(paper)
  if (renderableSections.length === 0) {
    return buildFallbackPaperSections(paper, evidence, language)
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
        ? buildSectionEvidenceIds(evidence, ['figure', 'table'], 3)
        : index === 1
          ? buildSectionEvidenceIds(evidence, ['formula', 'figure'], 3)
          : buildSectionEvidenceIds(evidence, ['section', 'figure', 'table', 'formula'], 3),
  }))
}

function buildPaperSectionFlowBlocks(paper: any): ArticleFlowBlock[] {
  const paperTitle = paper.titleZh || paper.title
  const evidence = buildRenderablePaperEvidence(paper)
  const sectionLimit = paper.paper_sections?.length > 6 ? 2 : 3

  return buildPaperArticleSections(paper, evidence, paper.topic?.language).slice(0, sectionLimit).map((section) => ({
    id: `paper-section-flow-${section.id}`,
    type: 'text' as const,
    title: section.title,
    body: section.body,
    paperId: paper.id,
    paperTitle,
    anchorId: section.anchorId ?? section.id,
  }))
}

function buildPaperPass(
  paper: any,
  role: string,
  contribution: string,
  routeContext?: ReaderRouteContext,
): PaperRole {
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
    route: paperRoute({
      ...resolvePaperRouteContext(paper, routeContext),
      paperId: paper.id,
    }),
    summary:
      normalizePaperNarrativeText(
        pickMeaningfulNarrativeText(paper.summary, paper.explanation, paper.abstract),
        140,
      ) || clipText(buildPaperContributionSeed(paper), 140),
    publishedAt: paper.published.toISOString(),
    role,
    contribution: safeContribution,
    authors: parseJsonArray(paper.authors),
    citationCount: paper.citationCount ?? null,
    figuresCount: paper.figures.length,
    tablesCount: paper.tables.length,
    formulasCount: paperEvidenceStats(paper).formulaCount,
    figureGroupsCount: paper.figure_groups?.length ?? 0,
    coverImage: resolvePaperAssetPath({ assetPath: paper.coverPath, paperId: paper.id }) ?? null,
    originalUrl: links.originalUrl,
    pdfUrl: links.pdfUrl,
  }
}

function _buildCrossPaperPass(papers: any[]): CrossPaperComparisonBlock[] {
  if (papers.length <= 1) return []

  const sorted = [...papers].sort((left, right) => +left.published - +right.published)
  const firstPaper = sorted[0]
  return [
    {
      id: 'cross-paper-1',
      title: 'How multiple papers jointly form this node',
      summary: 'A node is not a stitched pile of summaries. It is a research line being pushed, corrected, and extended over time.',
      papers: sorted.map((paper, index) => ({
        paperId: paper.id,
        title: paper.titleZh || paper.title,
        route: paperRoute({
          ...resolvePaperRouteContext(paper),
          paperId: paper.id,
        }),
        role: paperRoleLabel(index, index === 0),
      })),
      points: [
        {
          label: 'Temporal progression',
          detail: firstPaper
            ? `The earliest anchor is ${firstPaper.titleZh || firstPaper.title}, and later work keeps pushing the same problem or method.`
            : 'The papers in this node should be read as a single line that later work keeps refining and extending.',
        },
        {
          label: 'Evidence relationship',
          detail: 'The papers in one node are not always directly comparable under a single benchmark, so the node should read like a progression chain rather than a leaderboard.',
        },
        {
          label: 'Still unresolved',
          detail: 'The hard question is usually not whether a method is new, but whether the advantage survives under harder settings and broader constraints.',
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
  language?: string | null,
): ArticleSection[] {
  const paperCount = papers.length
  const effectiveLanguage = language ?? node.topic?.language ?? 'zh'
  const leadEvidenceLimit = Math.max(3, Math.ceil(paperCount * 0.5))
  const lead = {
    id: 'node-lead',
    kind: 'lead' as const,
    title: synthesis.leadTitle,
    body: synthesis.lead,
    evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table'], leadEvidenceLimit),
  }

  const paperSections = papers.map((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    const paperEvidence = buildRenderablePaperEvidence(paper)
    const paperEvidenceLimit = Math.max(3, Math.min(5, paperEvidence.filter((e: EvidenceExplanation) => ['figure', 'table', 'formula'].includes(e.type)).length))
    const { figureCount, tableCount, formulaCount } = paperEvidenceStats(paper)
    return {
      id: `node-paper-${paper.id}`,
      kind: 'paper-pass' as const,
      title: pass?.overviewTitle || paper.titleZh || paper.title,
      paperId: paper.id,
      paperTitle: paper.titleZh || paper.title,
      body: pass?.body ?? [
        `${paperRoleLabel(index, index === 0)}：${normalizePaperNarrativeText(paper.summary, 180) || incompletePaperText(effectiveLanguage)}`,
        normalizePaperNarrativeText(paper.explanation ?? paper.summary, 200) || noStableAbstractText(effectiveLanguage),
        evidenceStatsText(effectiveLanguage, figureCount, tableCount, formulaCount),
      ],
      evidenceIds: buildSectionEvidenceIds(paperEvidence, ['figure', 'table', 'formula'], paperEvidenceLimit),
    }
  })

  const closingEvidenceLimit = Math.max(5, Math.ceil(paperCount * 1.5))
  const closingEvidence = {
    id: 'node-evidence',
    kind: 'evidence' as const,
    title: synthesis.evidenceTitle,
    body: synthesis.evidence,
    evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table', 'formula'], closingEvidenceLimit),
  }

  return [lead, ...paperSections, closingEvidence]
}

function buildTimeRangeLabel(values: string[]) {
  if (values.length === 0) return '鏃堕棿寰呭畾'
  const dates = values
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(+value))
    .sort((left, right) => +left - +right)
  if (dates.length === 0) return '鏃堕棿寰呭畾'
  const first = dates[0]
  const last = dates[dates.length - 1]
  const firstLabel = `${first.getFullYear()}.${`${first.getMonth() + 1}`.padStart(2, '0')}`
  const lastLabel = `${last.getFullYear()}.${`${last.getMonth() + 1}`.padStart(2, '0')}`
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} - ${lastLabel}`
}

function buildPreciseDateLabel(value: string | Date | null | undefined) {
  if (!value) return '鏃堕棿寰呭畾'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(+date)) return '鏃堕棿寰呭畾'
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
      figureGroupCount: acc.figureGroupCount + paper.figureGroupsCount,
    }),
    { paperCount: 0, figureCount: 0, tableCount: 0, formulaCount: 0, figureGroupCount: 0 },
  )
}

function buildNodeReferenceList(paperRoles: PaperRole[]) {
  const seen = new Set<string>()

  return paperRoles.reduce<Array<{
    paperId: string
    title: string
    titleEn?: string
    route?: string
    publishedAt?: string
    authors?: string[]
    citationCount?: number | null
    originalUrl?: string
    pdfUrl?: string
  }>>((entries, paper) => {
    if (seen.has(paper.paperId)) return entries
    seen.add(paper.paperId)
    entries.push({
      paperId: paper.paperId,
      title: paper.title,
      titleEn: paper.titleEn,
      route: paper.route,
      publishedAt: paper.publishedAt,
      authors: paper.authors,
      citationCount: paper.citationCount ?? null,
      originalUrl: paper.originalUrl,
      pdfUrl: paper.pdfUrl,
    })
    return entries
  }, [])
}

function filterNodeEvidenceByPaperIds(
  evidence: EvidenceExplanation[],
  allowedPaperIds: Set<string>,
  options?: { strictWhenEmpty?: boolean },
) {
  if (allowedPaperIds.size === 0) {
    if (options?.strictWhenEmpty) {
      return evidence.filter((item) => !item.sourcePaperId)
    }
    return evidence
  }

  return evidence.filter(
    (item) => !item.sourcePaperId || allowedPaperIds.has(item.sourcePaperId),
  )
}

function filterNodeSectionsByPaperIds(
  sections: ArticleSection[],
  allowedPaperIds: Set<string>,
  allowedEvidenceIds: Set<string>,
  options?: { strictWhenEmpty?: boolean },
) {
  if (allowedPaperIds.size === 0) {
    if (!options?.strictWhenEmpty) return sections

    return sections
      .filter((section) => !section.paperId)
      .map((section) => ({
        ...section,
        evidenceIds: Array.isArray(section.evidenceIds)
          ? section.evidenceIds.filter((evidenceId) => allowedEvidenceIds.has(evidenceId))
          : section.evidenceIds,
      }))
  }

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
  options?: { strictWhenEmpty?: boolean },
) {
  if (allowedPaperIds.size === 0) {
    if (!options?.strictWhenEmpty) return flow

    return flow.filter((block) => {
      if (block.type === 'paper-break') {
        return false
      }

      if (block.type === 'text') {
        return !block.paperId
      }

      if (block.type === 'comparison') {
        return false
      }

      if (block.type === 'figure' || block.type === 'table' || block.type === 'formula') {
        return !block.evidence.sourcePaperId
      }

      return true
    })
  }

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

function filterEnhancedNodeFlowByPaperIds(
  flow: import('./deep-article-generator').NodeArticleFlowBlock[] | undefined,
  allowedPaperIds: Set<string>,
  options?: { strictWhenEmpty?: boolean },
) {
  if (!Array.isArray(flow)) return flow
  if (allowedPaperIds.size === 0) {
    if (!options?.strictWhenEmpty) return flow
    return flow.filter(
      (block) =>
        block.type !== 'paper-article' &&
        block.type !== 'paper-transition' &&
        block.type !== 'synthesis',
    )
  }

  const filtered = flow.filter((block) => {
    if (block.type === 'paper-article') {
      return allowedPaperIds.has(block.paperId)
    }

    if (block.type === 'paper-transition') {
      return allowedPaperIds.has(block.fromPaperId) && allowedPaperIds.has(block.toPaperId)
    }

    return true
  })

  const filteredPaperCount = filtered.filter((block) => block.type === 'paper-article').length
  return filtered.filter((block) => {
    if (block.type === 'synthesis') {
      return filteredPaperCount > 1
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
  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    select: {
      createdAt: true,
      papers: {
        select: {
          id: true,
          published: true,
        },
      },
      research_nodes: {
        select: {
          id: true,
          primaryPaperId: true,
          updatedAt: true,
          createdAt: true,
          node_papers: {
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
    nodes: topic.research_nodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.node_papers.map((paper) => ({ paperId: paper.paperId })),
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
    id: string
    primaryPaperId?: string | null
    node_papers: Array<{
      paperId?: string | null
    }>
  },
  allowedPaperIds?: Set<string> | null,
) {
  return Array.from(
    new Set(
      [
        ...(node.primaryPaperId ? [node.primaryPaperId] : []),
        ...node.node_papers
          .map((entry) => entry.paperId)
          .filter(
            (paperId): paperId is string =>
              typeof paperId === 'string' && paperId.trim().length > 0,
          ),
      ].filter((paperId) => !allowedPaperIds || allowedPaperIds.has(paperId)),
    ),
  )
}

function shouldPreserveExplicitNodePaperSet(nodeId: string) {
  return Boolean(parseConfiguredTopicIdFromNodeId(nodeId))
}

function resolveNodeReadablePaperIds(args: {
  node: AssociationNodeLike & {
    id: string
  }
  papers: any[]
  stageTitle: string
  stageScopedPaperIds?: Set<string> | null
}) {
  const preserveExplicitPaperSet = shouldPreserveExplicitNodePaperSet(args.node.id)
  const linkedPaperIds = collectNodeLinkedPaperIds(
    args.node,
    preserveExplicitPaperSet ? null : args.stageScopedPaperIds,
  )

  if (preserveExplicitPaperSet) {
    return {
      preserveExplicitPaperSet,
      linkedPaperIds,
      resolvedPaperIds: linkedPaperIds,
    }
  }

  const relatedPaperIds = collectNodeRelatedPaperIds({
    node: args.node,
    stageTitle: args.stageTitle,
    papers: args.papers,
    allowedPaperIds: args.stageScopedPaperIds,
  })

  return {
    preserveExplicitPaperSet,
    linkedPaperIds,
    resolvedPaperIds: mergeNodePaperIdsByPriority(linkedPaperIds, relatedPaperIds),
  }
}

function mergeNodePaperIdsByPriority(primaryPaperIds: string[], supplementalPaperIds: string[]) {
  return Array.from(new Set([...primaryPaperIds, ...supplementalPaperIds]))
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
  let node = await prisma.research_nodes.findUnique({
    where: { id: nodeId },
    select: { topicId: true },
  })

  if (!node) {
    const materialized = await ensureConfiguredTopicMaterializedForNode(nodeId).catch((error) => {
      logger.warn('Configured topic materialization failed while resolving node stage window.', {
        nodeId,
        error,
      })
      return false
    })

    if (materialized) {
      node = await prisma.research_nodes.findUnique({
        where: { id: nodeId },
        select: { topicId: true },
      })
    }
  }

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

  if (shouldPreserveExplicitNodePaperSet(viewModel.nodeId)) {
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
  const effectivePaperRoles = stagePaperRoles
  const allowedPaperIds = new Set(effectivePaperRoles.map((paper) => paper.paperId))
  const filteredEvidence = filterNodeEvidenceByPaperIds(viewModel.evidence, allowedPaperIds, {
    strictWhenEmpty: true,
  })
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
    { strictWhenEmpty: true },
  )
  const filteredSections = filterNodeSectionsByPaperIds(
    viewModel.article.sections,
    allowedPaperIds,
    allowedEvidenceIds,
    { strictWhenEmpty: true },
  )
  const filteredEnhancedArticleFlow = filterEnhancedNodeFlowByPaperIds(
    viewModel.enhancedArticleFlow,
    allowedPaperIds,
    { strictWhenEmpty: true },
  )
  const filteredEnhancedPaperCount =
    filteredEnhancedArticleFlow?.filter((block) => block.type === 'paper-article').length ?? 0
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
    references: buildNodeReferenceList(effectivePaperRoles),
    enhancedArticleFlow: filteredEnhancedArticleFlow,
    coreJudgment:
      filteredEnhancedArticleFlow && filteredEnhancedPaperCount !== viewModel.paperRoles.length
        ? undefined
        : viewModel.coreJudgment,
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
  const evidenceTypeCount = evidence.filter((e) => ['figure', 'table', 'formula'].includes(e.type)).length
  const scaledFigureLimit = Math.max(5, Math.min(15, Math.ceil(evidenceTypeCount * 0.3)))
  const scaledTableLimit = Math.max(3, Math.min(10, Math.ceil(evidenceTypeCount * 0.2)))
  const scaledFormulaLimit = Math.max(2, Math.min(8, Math.ceil(evidenceTypeCount * 0.15)))
  const scaledTotalLimit = Math.max(10, Math.min(30, Math.ceil(evidenceTypeCount * 0.5)))
  const selectedEvidence = selectArticleEvidence(evidence, {
    figureLimit: scaledFigureLimit,
    tableLimit: scaledTableLimit,
    formulaLimit: scaledFormulaLimit,
    totalLimit: scaledTotalLimit,
  })
  const textBlocks: ArticleFlowBlock[] = [
    {
      id: 'paper-intro',
      type: 'text',
      title: '这篇论文究竟解决了什么',
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
      title: '结语',
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
  routeContext,
}: {
  papers: any[]
  paperPasses: NodePaperPass[]
  comparisonPass: CrossPaperComparisonBlock | null
  synthesisPass: NodeSynthesisPass
  critique: ReviewerCritique
  routeContext?: ReaderRouteContext
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
    const paperEvidence = buildRenderablePaperEvidence(paper, routeContext)
    const paperEvidenceTypeCount = paperEvidence.filter((e) => ['figure', 'table', 'formula'].includes(e.type)).length
    const scaledFigLimit = Math.max(5, Math.min(15, Math.ceil(paperEvidenceTypeCount * 0.3)))
    const scaledTblLimit = Math.max(3, Math.min(10, Math.ceil(paperEvidenceTypeCount * 0.2)))
    const scaledFmlLimit = Math.max(2, Math.min(8, Math.ceil(paperEvidenceTypeCount * 0.15)))
    const scaledTotalLimitPerPaper = Math.max(10, Math.min(30, Math.ceil(paperEvidenceTypeCount * 0.5)))
    const selectedEvidence = selectArticleEvidence(paperEvidence, {
      figureLimit: scaledFigLimit,
      tableLimit: scaledTblLimit,
      formulaLimit: scaledFmlLimit,
      totalLimit: scaledTotalLimitPerPaper,
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
        (normalizePaperNarrativeText(paper.explanation ?? paper.summary, 140) ||
          incompletePaperNextRoundText(routeContext?.language)),
      route: paperRoute({
        ...resolvePaperRouteContext(paper, routeContext),
        paperId: paper.id,
      }),
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
          normalizePaperNarrativeText(paper.summary, 180) || '当前还没有拿到可用摘要，需要继续回到原文核对。',
          normalizePaperNarrativeText(paper.explanation ?? paper.summary, 200) ||
            '这篇论文的细节仍主要依赖原文与后续 PDF 抽取，节点页暂时不能假装已经讲清。',
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
const loadedPaper = await prisma.papers.findUnique({
    where: { id: paperId },
    include: {
      topics: true,
      figures: true,
      figure_groups: true,
      tables: true,
      formulas: true,
      paper_sections: { orderBy: { order: 'asc' } },
      node_papers: {
        include: {
          research_nodes: true,
        },
      },
    },
  })

  if (!loadedPaper) throw new AppError(404, 'Paper not found.')

  const paper = normalizeReaderPaperDisplayFields({
    ...loadedPaper,
    topic: {
      ...loadedPaper.topics,
      nameZh: pickMeaningfulDisplayText(
        loadedPaper.topics.nameZh,
        loadedPaper.topics.nameEn,
        'Research topic',
      ),
      nameEn: pickMeaningfulDisplayText(
        loadedPaper.topics.nameEn,
        loadedPaper.topics.nameZh,
        'Research topic',
      ),
    },
    node_papers: loadedPaper.node_papers.map((entry) => ({
      ...entry,
      node: normalizeReaderNodeDisplayFields(entry.research_nodes),
    })),
  })

  const relatedNodes = paper.node_papers.map((entry: { node: { stageIndex: number; id: string; nodeLabel: string; nodeSubtitle: string | null; nodeSummary: string } }) => entry.node).sort((left: { stageIndex: number }, right: { stageIndex: number }) => left.stageIndex - right.stageIndex)
  const paperRouteContext = resolvePaperRouteContext(paper, {
    nodeId: relatedNodes[0]?.id ?? null,
    topicId: paper.topicId,
  })
  const researchPipelineContext = await loadReaderResearchPipelineContext({
    topicId: paper.topicId,
    paperIds: [paper.id],
    stageIndex: relatedNodes[0]?.stageIndex,
    historyLimit: 6,
  })
  const evidence = buildRenderablePaperEvidence(paper, paperRouteContext ?? undefined)
  const critiqueFallback = buildPaperCritique(paper)
  const storyFallback = {
    standfirst: clipText(`${paper.summary} ${paper.explanation ?? ''}`, 260),
    sections: buildPaperArticleSections(paper, evidence, loadedPaper.topics?.language).map((section) => ({
      title: section.title,
      body: section.body,
    })),
    closing: [
      'After reading the paper, the reader should be able to answer what gap it closes, what evidence it relies on, and what it still leaves unresolved.',
      'If those questions still feel blurry, the weakness usually lies in the evidence chain, the experimental boundary, or the reasoning structure rather than the page layout.',
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
            formulasCount: paperEvidenceStats(paper).formulaCount,
          },
          {
            summary: critiqueFallback.summary,
            bullets: critiqueFallback.bullets,
          },
          researchPipelineContext,
        ),
      ])

  const baseSections = buildPaperArticleSections(paper, evidence, loadedPaper.topics?.language)
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
    title: paper.title,
    titleEn: paper.titleEn ?? paper.title,
    summary: paper.summary,
    explanation: paper.explanation ?? paper.summary,
    publishedAt: paper.published.toISOString(),
    authors: parseJsonArray(paper.authors),
    citationCount: paper.citationCount ?? null,
    coverImage: resolvePaperAssetPath({ assetPath: paper.coverPath, paperId: paper.id }) ?? null,
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
      sectionCount: paper.paper_sections.length,
      figureCount: paper.figures.length,
      tableCount: paper.tables.length,
      formulaCount: paperEvidenceStats(paper).formulaCount,
      figureGroupCount: paper.figure_groups?.length ?? 0,
      relatedNodeCount: relatedNodes.length,
    },
    relatedNodes: relatedNodes.map((node: { id: string; nodeLabel: string; nodeSubtitle: string | null; nodeSummary: string; stageIndex: number }) => ({
      nodeId: node.id,
      title: pickMeaningfulDisplayText(
        node.nodeLabel === 'Research node' ? null : node.nodeLabel,
        node.nodeSubtitle,
        paper.title,
        'Research node',
      ),
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
  options?: { quick?: boolean; stageWindowMonths?: number; enhanced?: boolean; forceRegenerate?: boolean },
): Promise<NodeViewModel> {
  const quick = options?.quick === true
  const enableEnhanced = options?.enhanced === true
  // Enhanced node requests should not block on the slower legacy article pipeline.
  // We keep the legacy article shell grounded and deterministic, then layer the
  // enhanced long-form flow on top so the API always returns a readable article.
  const useFallbackReaderDraft = quick || enableEnhanced
const loadedNode = await prisma.research_nodes.findUnique({
    where: { id: nodeId },
    include: {
      topics: true,
      papers: {
        include: {
          figures: true,
          figure_groups: true,
          tables: true,
          formulas: true,
          paper_sections: { orderBy: { order: 'asc' } },
        },
      },
      node_papers: {
        include: {
          papers: {
            include: {
              figures: true,
              figure_groups: true,
              tables: true,
              formulas: true,
              paper_sections: { orderBy: { order: 'asc' } },
            },
          },
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!loadedNode) throw new AppError(404, 'Node not found.')

const node = normalizeReaderNodeDisplayFields({
    ...loadedNode,
    topic: {
      ...loadedNode.topics,
      nameZh: pickMeaningfulDisplayText(
        loadedNode.topics.nameZh,
        loadedNode.topics.nameEn,
        'Research topic',
      ),
      nameEn: pickMeaningfulDisplayText(
        loadedNode.topics.nameEn,
        loadedNode.topics.nameZh,
        'Research topic',
      ),
    },
    papers: loadedNode.papers ? normalizeReaderPaperDisplayFields(loadedNode.papers) : null,
    node_papers: loadedNode.node_papers.map((item) => ({
      ...item,
      papers: normalizeReaderPaperDisplayFields(item.papers),
    })),
  })

  const [stage, loadedTopicPapers] = await Promise.all([
    prisma.topic_stages.findFirst({
      where: {
        topicId: node.topicId,
        order: node.stageIndex,
      },
      select: {
        name: true,
        nameEn: true,
      },
    }),
    prisma.papers.findMany({
      where: { topicId: node.topicId },
      include: {
        figures: true,
        figure_groups: true,
        tables: true,
        formulas: true,
        paper_sections: { orderBy: { order: 'asc' } },
      },
      orderBy: { published: 'desc' },
    }),
  ])
  const topicPapers = loadedTopicPapers.map((paper) => normalizeReaderPaperDisplayFields(paper))

  const effectiveStageWindowMonths = await resolveTopicStageWindowMonths(node.topicId, options?.stageWindowMonths)
  const temporalStageBuckets = await loadTopicTemporalStageBuckets(
    node.topicId,
    effectiveStageWindowMonths,
  )
  const allowedPaperIds = collectNodeStageScopedPaperIds(node.id, temporalStageBuckets)
  const resolvedNodePapers = resolveNodeReadablePaperIds({
    node,
    papers: topicPapers,
    stageTitle: [stage?.name, stage?.nameEn].filter(Boolean).join(' '),
    stageScopedPaperIds: allowedPaperIds,
  })
  const paperById = new Map(topicPapers.map((paper) => [paper.id, paper]))
  const resolvedPaperIds = resolvedNodePapers.resolvedPaperIds
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
  const nodeRouteContext = {
    nodeId: node.id,
    topicId: node.topicId,
  } satisfies ReaderRouteContext
  const evidence = papers.flatMap((paper) => buildRenderablePaperEvidence(paper, nodeRouteContext))
  const stats = papers.reduce(
    (acc, paper) => ({
      paperCount: acc.paperCount + 1,
      figureCount: acc.figureCount + paper.figures.length,
      tableCount: acc.tableCount + paper.tables.length,
      formulaCount: acc.formulaCount + paperEvidenceStats(paper).formulaCount,
    }),
    { paperCount: 0, figureCount: 0, tableCount: 0, formulaCount: 0 },
  )
  const nodeNarrativeSeed = buildNodeNarrativeSeed({
    node,
    papers,
  })
  const evidenceAudit = buildNodeEvidenceAudit(stats)
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
        ? `${paper.title} anchors the node mainline`
        : `${paper.title} extends the node`,
    role: paperRoleLabel(index, paper.id === node.primaryPaperId),
    contribution: buildPaperContributionSeed(paper),
    body: [
      normalizePaperNarrativeText(paper.summary, 180) || 'Only title-level material is currently available for this paper.',
      getRenderablePaperSections(paper)[0]?.renderParagraphs[0] ??
        buildPaperContributionSeed(paper),
      (() => {
        const { figureCount, tableCount, formulaCount } = paperEvidenceStats(paper)
        return figureCount + tableCount + formulaCount > 0
      })()
        ? (() => {
            const { figureCount, tableCount, formulaCount } = paperEvidenceStats(paper)
            return directEvidenceText(node.topic?.language, figureCount, tableCount, formulaCount)
          })()
        : noEvidenceExtractedText(node.topic?.language),
    ],
  }))
  const fallbackComparisonPass: NodeComparisonPass =
    papers.length <= 1
      ? {
          title: 'Single-paper node',
          summary: 'This node is mainly supported by one paper, so it should read like a disciplined close reading rather than a stable cross-paper convergence.',
          points: [
            {
              label: 'Current status',
              detail: 'First explain the paper problem, method, evidence, and boundary clearly; only then decide whether the node itself is stable enough.',
            },
          ],
        }
      : {
          title: 'How several papers jointly form the node',
          summary: 'This node is not a stitched digest. It is a research line that keeps being advanced, corrected, and reinforced by several papers.',
          points: [
            {
              label: 'Temporal progression',
              detail: 'First identify who framed the key judgment, then see how later papers strengthen evidence, refine mechanism, or expand scope.',
            },
            {
              label: 'Evidence relationship',
              detail: 'These papers do not always live under identical settings, so they should be read as a progression chain rather than a direct leaderboard.',
            },
            {
              label: 'Open problem',
              detail: 'The hard question is whether those methods still hold once the setting becomes more complex, constrained, or realistic.',
            },
          ],
        }
  const fallbackSynthesisPass: NodeSynthesisPass = {
    headline: nodeNarrativeSeed.headline,
    standfirst: nodeNarrativeSeed.standfirst,
    leadTitle: 'Start by clarifying the node problem, judgment, and boundary',
    lead: [
      nodeNarrativeSeed.summary,
      nodeNarrativeSeed.explanation,
    ],
    evidenceTitle: 'Then check how figures, tables, and formulas support the node judgment',
    evidence: [
      stats.figureCount + stats.tableCount + stats.formulaCount > 0
        ? `The node currently preserves ${stats.figureCount} figures, ${stats.tableCount} tables, and ${stats.formulaCount} formulas, which is enough to keep the evidence layer visible while reading.`
        : 'The node still lacks extracted figures, tables, and formulas, so the next pass should prioritize the method figure, the main result table, and the key equation.',
      papers.length > 1
        ? 'A node is only convincing when those papers can be read as one advancing line instead of a loose pile of relevant titles.'
        : 'Because the current node still rests on a single paper, the article should stay honest and finish the paper-level close reading first.',
    ],
    closingTitle: 'Finally return to the questions this research line still leaves open',
    closing: [
      papers.length > 1
        ? 'The open issue is whether these papers really form a stable mainline, and which improvements are genuine rather than rhetorical reframings.'
        : 'The open issue is whether the route proposed by this paper still holds under broader data, harder constraints, and a more complete closed-loop evaluation.',
      'After finishing the node, the reader should at least be able to answer what problem was advanced, what evidence supports that claim, and what crucial verification is still missing.',
    ],
  }
  const rawPaperPasses = useFallbackReaderDraft
    ? fallbackPaperPasses
    : await generateNodePaperPasses(papers, node.primaryPaperId, researchPipelineContext)
  const paperPasses = rawPaperPasses.map((pass, index) =>
    sanitizeNodePaperPassOutput({
      paper: papers[index],
      pass,
      fallback: fallbackPaperPasses[index],
    }),
  )
  const rawComparisonPass = useFallbackReaderDraft
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
  const rawSynthesisPass = useFallbackReaderDraft
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
  const rawGeneratedCritique = useFallbackReaderDraft
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
        (normalizePaperNarrativeText(paper.explanation ?? paper.summary, 120) ||
          incompletePaperNextRoundExtractText(node.topic?.language)),
      nodeRouteContext,
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
            route: paperRoute({
              ...resolvePaperRouteContext(paper, nodeRouteContext),
              paperId: paper.id,
            }),
            role: paperPasses.find((item) => item.paperId === paper.id)?.role ?? paperRoleLabel(index, paper.id === node.primaryPaperId),
          })),
          points: comparisonPass.points,
        }
      : null
  const nodeSections = buildNodeSynthesisSections(node, papers, evidence, paperPasses, synthesisPass, node.topic?.language)
  const nodeFlow = buildNodeArticleFlow({
    papers,
    paperPasses,
    comparisonPass: comparisonBlock,
    synthesisPass,
    critique: generatedCritique,
    routeContext: nodeRouteContext,
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

  if (!useFallbackReaderDraft) {
    nodeSummary = editorialWriteback.summary
    nodeExplanation = editorialWriteback.explanation

    if (
      node.nodeSummary !== editorialWriteback.summary ||
      (node.nodeExplanation ?? node.nodeSummary) !== editorialWriteback.explanation ||
      (node.fullContent ?? '') !== editorialWriteback.fullContent
    ) {
      const updateResult = await prisma.research_nodes.updateMany({
        where: { id: node.id },
        data: {
          nodeSummary: editorialWriteback.summary,
          nodeExplanation: editorialWriteback.explanation,
          fullContent: editorialWriteback.fullContent,
        },
      })

      if (updateResult.count > 0) {
        const refreshedNode = await prisma.research_nodes.findUnique({
          where: { id: node.id },
          select: { updatedAt: true },
        })

        if (refreshedNode) {
          nodeUpdatedAt = refreshedNode.updatedAt.toISOString()
        }
      }
    }
  }

  // 可选：生成增强版文章流（Multi-Pass深度解析）
  let enhancedArticleFlow: import('./deep-article-generator.js').NodeArticleFlowBlock[] | undefined
  let coreJudgment: { content: string; contentEn: string } | undefined
  if (enableEnhanced && !quick) {
    // First, try to load persisted fullArticleFlow from the database
    // (skip if forceRegenerate is set, e.g. during rebuild)
    const forceRegenerate = options?.forceRegenerate === true
    const persistedFullArticleFlow = forceRegenerate ? null : loadedNode.fullArticleFlow
    if (persistedFullArticleFlow) {
      try {
        const parsed = JSON.parse(persistedFullArticleFlow) as {
          schemaVersion?: string
          flow?: unknown[]
          coreJudgment?: { content: string; contentEn: string }
          generatedAt?: string
        }
        if (Array.isArray(parsed.flow) && parsed.flow.length > 0) {
          enhancedArticleFlow = parsed.flow as import('./deep-article-generator.js').NodeArticleFlowBlock[]
          coreJudgment = parsed.coreJudgment
          logger.info('Loaded fullArticleFlow from database', {
            nodeId,
            flowLength: parsed.flow.length,
            generatedAt: parsed.generatedAt,
          })
        }
      } catch (parseErr) {
        logger.warn('Failed to parse persisted fullArticleFlow, will regenerate', {
          nodeId,
          err: parseErr instanceof Error ? parseErr.message : String(parseErr),
        })
      }
    }

    // If no persisted flow, generate fresh
    if (!enhancedArticleFlow) {
    logger.info('Generating enhanced article flow', {
      nodeId,
      enableEnhanced,
      quick,
    })
    try {
      const deepArticleModule = await import('./deep-article-generator.js')
      const generateNodeEnhancedArticle =
        ((deepArticleModule as { generateNodeEnhancedArticle?: unknown }).generateNodeEnhancedArticle ??
        (deepArticleModule as { default?: { generateNodeEnhancedArticle?: unknown } }).default
          ?.generateNodeEnhancedArticle ??
        (deepArticleModule as { 'module.exports'?: { generateNodeEnhancedArticle?: unknown } })[
          'module.exports'
        ]?.generateNodeEnhancedArticle) as GenerateNodeEnhancedArticle | undefined

if (typeof generateNodeEnhancedArticle !== 'function') {
        throw new Error('generateNodeEnhancedArticle export is unavailable.')
      }

      // 鍒涘缓WebSocket杩涘害鎶ュ憡鍣?
      const progressReporter: ArticleProgressReporter = {
        onStageStart: (stage: string, paperId?: string) => {
          broadcastResearchProgress(nodeId, {
            stage,
            paperId,
            status: 'started',
            timestamp: new Date().toISOString(),
          })
        },
        onStageComplete: (stage: string, _result: unknown) => {
          broadcastResearchProgress(nodeId, {
            stage,
            status: 'completed',
            timestamp: new Date().toISOString(),
          })
        },
        onProgress: (percent: number, message: string) => {
          broadcastResearchProgress(nodeId, {
            percent,
            message,
            status: 'progress',
            timestamp: new Date().toISOString(),
          })
        },
      }

      const result = await withReaderTimeout(generateNodeEnhancedArticle(nodeId, {
        papers: papers.map((p) => ({
          id: p.id,
          title: p.titleZh || p.title,
          titleEn: p.titleEn ?? undefined,
          authors: typeof p.authors === 'string' ? JSON.parse(p.authors) : p.authors,
          summary: p.summary,
          explanation: p.explanation ?? undefined,
          publishedAt: p.published?.toISOString(),
          pdfUrl: resolvePaperSourceLinks({
            arxivUrl: p.arxivUrl,
            pdfUrl: p.pdfUrl,
            pdfPath: p.pdfPath,
          }).pdfUrl ?? undefined,
          originalUrl: resolvePaperSourceLinks({
            arxivUrl: p.arxivUrl,
            pdfUrl: p.pdfUrl,
            pdfPath: p.pdfPath,
          }).originalUrl ?? undefined,
          citationCount: p.citationCount,
          coverImage: resolvePaperAssetPath({ assetPath: p.coverPath, paperId: p.id }) ?? undefined,
paper_sections: p.paper_sections.map((section: { id: string; editorialTitle: string | null; sourceSectionTitle: string; paragraphs: string }) => ({
            id: section.id,
            editorialTitle: section.editorialTitle,
            sourceSectionTitle: section.sourceSectionTitle,
            paragraphs: section.paragraphs,
          })),
          figures: p.figures.map((figure: { id: string; number: number | string; caption: string; analysis: string | null; page: number; imagePath: string; thumbnailPath: string | null }) => ({
            id: figure.id,
            number: figure.number,
            caption: figure.caption,
            analysis: figure.analysis,
            page: figure.page,
            imagePath: resolvePaperAssetPath({ assetPath: figure.imagePath, paperId: p.id }) ?? null,
            thumbnailPath: resolvePaperAssetPath({ assetPath: figure.thumbnailPath, paperId: p.id }) ?? null,
          })),
          tables: p.tables.map((table: { id: string; number: number | string; caption: string; rawText: string; page: number; headers?: string | null; rows?: string | null }) => ({
            id: table.id,
            number: table.number,
            caption: table.caption,
            rawText: table.rawText,
            page: table.page,
            headers: parseJsonArray(table.headers),
            rows: parseJsonUnknownArray(table.rows),
          })),
          formulas: p.formulas.map((formula: { id: string; number: number | string; latex: string; rawText: string | null; page: number }) => ({
            id: formula.id,
            number: formula.number,
            latex: formula.latex,
            rawText: formula.rawText,
            page: formula.page,
          })),
          evidence: buildRenderablePaperEvidence(p, nodeRouteContext),
        })),
        nodeContext: {
          title: node.nodeLabel,
          stageIndex: node.stageIndex,
          summary: nodeSummary,
          explanation: nodeExplanation ?? undefined,
        },
      }, progressReporter), ENHANCED_NODE_ARTICLE_TIMEOUT_MS, `Enhanced article flow for node ${nodeId}`)
      enhancedArticleFlow = result.flow
      coreJudgment = result.coreJudgment

      // Post-process: upgrade paper-article blocks to v2 poster-style format
      // using the NodeEditorialAgent for each paper in the flow
      if (Array.isArray(enhancedArticleFlow)) {
        const paperById = new Map(papers.map((p, idx) => [p.id, { paper: p, index: idx }]))

        // Build a NodeContext for the editorial agent
        const editorialNodeContext: import('../editorial/types').NodeContext = {
          id: node.id,
          topicId: node.topicId,
          stageIndex: node.stageIndex,
          nodeLabel: node.nodeLabel,
          nodeSubtitle: node.nodeSubtitle ?? undefined,
          nodeSummary: nodeSummary,
          nodeExplanation: nodeExplanation ?? undefined,
          papers: papers.map((p, idx) => ({
            id: p.id,
            topicId: node.topicId,
            title: p.titleEn || p.titleZh || p.title,
            titleZh: p.titleZh || p.title,
            titleEn: p.titleEn ?? undefined,
            authors: typeof p.authors === 'string' ? p.authors : (Array.isArray(p.authors) ? p.authors.join(', ') : String(p.authors ?? '')),
            published: p.published ?? new Date(),
            summary: p.summary ?? '',
            explanation: p.explanation ?? undefined,
            arxivUrl: p.arxivUrl ?? undefined,
            pdfUrl: p.pdfUrl ?? undefined,
            figures: p.figures.map((fig: { id: string; number: number | string; caption: string; analysis: string | null; page: number; imagePath: string }) => ({
              id: fig.id,
              paperId: p.id,
              number: typeof fig.number === 'number' ? fig.number : Number(fig.number),
              caption: fig.caption,
              page: fig.page,
              imagePath: fig.imagePath,
              analysis: fig.analysis ?? undefined,
            })),
            tables: p.tables.map((tbl: { id: string; number: number | string; caption: string; rawText: string; page: number; headers?: string | null; rows?: string | null }) => ({
              id: tbl.id,
              paperId: p.id,
              number: typeof tbl.number === 'number' ? tbl.number : Number(tbl.number),
              caption: tbl.caption,
              page: tbl.page,
              headers: tbl.headers ?? '',
              rows: tbl.rows ?? '',
              rawText: tbl.rawText,
            })),
            formulas: p.formulas.map((fml: { id: string; number: number | string; latex: string; rawText: string | null; page: number }) => ({
              id: fml.id,
              paperId: p.id,
              number: typeof fml.number === 'number' ? String(fml.number) : fml.number,
              latex: fml.latex,
              rawText: fml.rawText ?? '',
              page: fml.page,
            })),
            sections: p.paper_sections.map((sec: { id: string; editorialTitle: string | null; sourceSectionTitle: string; paragraphs: string }, secIdx: number) => ({
              id: sec.id,
              paperId: p.id,
              sourceSectionTitle: sec.sourceSectionTitle,
              editorialTitle: sec.editorialTitle ?? sec.sourceSectionTitle,
              paragraphs: sec.paragraphs,
              order: secIdx,
            })),
            nodePosition: idx + 1,
          })),
        }

        for (let i = 0; i < enhancedArticleFlow.length; i++) {
          const block = enhancedArticleFlow[i]
          if (block.type !== 'paper-article') continue

          const paperEntry = paperById.get(block.paperId)
          if (!paperEntry) continue

          const { paper: p, index: paperIdx } = paperEntry

          // Build PaperContext for this paper
          const paperContext: PaperContext = {
            id: p.id,
            topicId: node.topicId,
            title: p.titleEn || p.titleZh || p.title,
            titleZh: p.titleZh || p.title,
            titleEn: p.titleEn ?? undefined,
            authors: typeof p.authors === 'string' ? p.authors : (Array.isArray(p.authors) ? p.authors.join(', ') : String(p.authors ?? '')),
            published: p.published ?? new Date(),
            summary: p.summary ?? '',
            explanation: p.explanation ?? undefined,
            arxivUrl: p.arxivUrl ?? undefined,
            pdfUrl: p.pdfUrl ?? undefined,
            figures: p.figures.map((fig: { id: string; number: number | string; caption: string; analysis: string | null; page: number; imagePath: string }) => ({
              id: fig.id,
              paperId: p.id,
              number: typeof fig.number === 'number' ? fig.number : Number(fig.number),
              caption: fig.caption,
              page: fig.page,
              imagePath: fig.imagePath,
              analysis: fig.analysis ?? undefined,
            })),
            figureGroups: (p.figure_groups ?? []).map((fg: { id: string; groupId: string; caption: string; page: number; subFigures: string }) => {
              let subFigures: Array<{ index: string; imagePath: string; caption: string; confidence?: number }> = []
              try {
                subFigures = typeof fg.subFigures === 'string' ? JSON.parse(fg.subFigures) : fg.subFigures
              } catch {
                subFigures = []
              }
              return {
                id: fg.id,
                paperId: p.id,
                parentNumber: fg.groupId.replace(/^fg-/, '').split('-').pop() ?? fg.groupId,
                caption: fg.caption,
                page: fg.page,
                subFigures: subFigures.map((sf: { index: string; imagePath: string; caption: string; confidence?: number | null }) => ({
                  index: sf.index,
                  imagePath: sf.imagePath,
                  caption: sf.caption,
                  confidence: sf.confidence ?? undefined,
                })),
                confidence: 1.0,
              }
            }),
            tables: p.tables.map((tbl: { id: string; number: number | string; caption: string; rawText: string; page: number; headers?: string | null; rows?: string | null }) => ({
              id: tbl.id,
              paperId: p.id,
              number: typeof tbl.number === 'number' ? tbl.number : Number(tbl.number),
              caption: tbl.caption,
              page: tbl.page,
              headers: tbl.headers ?? '',
              rows: tbl.rows ?? '',
              rawText: tbl.rawText,
            })),
            formulas: p.formulas.map((fml: { id: string; number: number | string; latex: string; rawText: string | null; page: number }) => ({
              id: fml.id,
              paperId: p.id,
              number: typeof fml.number === 'number' ? String(fml.number) : fml.number,
              latex: fml.latex,
              rawText: fml.rawText ?? '',
              page: fml.page,
            })),
            sections: p.paper_sections.map((sec: { id: string; editorialTitle: string | null; sourceSectionTitle: string; paragraphs: string }, secIdx: number) => ({
              id: sec.id,
              paperId: p.id,
              sourceSectionTitle: sec.sourceSectionTitle,
              editorialTitle: sec.editorialTitle ?? sec.sourceSectionTitle,
              paragraphs: sec.paragraphs,
              order: secIdx,
            })),
            nodePosition: paperIdx + 1,
          }

          try {
            const allowPosterModelAssistance =
              (process.env.ENHANCED_ARTICLE_GENERATION_MODE ?? '').trim().toLowerCase() ===
              'model-assisted'
            // ── DeepAnalysisPipeline: 三遍深度分析（优先路径） ──
            // 当论文有完整数据（sections + 证据）时，使用三遍深度分析
            // 否则回退到 NodeEditorialAgent 的单遍分析
            let analysis: PosterStylePaperAnalysis | null = null
            let usedDeepAnalysis = false

            if (hasSufficientDataForDeepAnalysis(paperContext)) {
              try {
                const pipeline = new DeepAnalysisPipeline({
                  enableVLMForEvidence: true,
                  crossCheckEvidence: true,
                  includeDerivations: true,
                  language: 'zh',
                })

                const deepPaper = buildDeepAnalysisPaper(paperContext)
                const deepResult = await pipeline.analyze(deepPaper)
                analysis = convertDeepAnalysisToPosterStyle(deepResult, paperContext)
                usedDeepAnalysis = true

                logger.info('DeepAnalysisPipeline completed three-pass analysis', {
                  nodeId,
                  paperId: block.paperId,
                  sectionCount: deepResult.sections.length,
                  claimCount: deepResult.claims.length,
                  confidenceScore: deepResult.confidenceScore,
                })
              } catch (deepErr) {
                logger.warn('DeepAnalysisPipeline failed, falling back to NodeEditorialAgent', {
                  nodeId,
                  paperId: block.paperId,
                  err: deepErr instanceof Error ? deepErr.message : String(deepErr),
                })
                // Fall through to NodeEditorialAgent below
              }
            }

            // ── Fallback: NodeEditorialAgent 单遍分析 ──
            if (!analysis && allowPosterModelAssistance) {
              const editorialResult = await nodeEditorialAgent.generatePaperAnalysis(
                paperContext,
                editorialNodeContext,
              )

              if (editorialResult.isPosterStyle && editorialResult.paperAnalysis) {
                analysis = editorialResult.paperAnalysis as PosterStylePaperAnalysis
              }
            }

            if (analysis) {
              // Upgrade the block to v2 format
              const v2Block = {
                ...block,
                coreThesis: analysis.coreThesis,
                coreThesisEn: analysis.coreThesisEn,
                paragraphs: analysis.paragraphs,
                closingInsight: analysis.closingInsight,
                closingInsightEn: analysis.closingInsightEn,
                contentVersion: 'v2' as const,
              }
              enhancedArticleFlow[i] = v2Block
              logger.info('Upgraded paper-article block to v2 poster-style', {
                nodeId,
                paperId: block.paperId,
                coreThesis: analysis.coreThesis.slice(0, 50),
                deepAnalysis: usedDeepAnalysis,
              })
            } else {
              logger.info('Editorial agent returned non-poster-style result, keeping v1 format', {
                nodeId,
                paperId: block.paperId,
              })
            }
          } catch (editorialErr) {
            // Graceful fallback: keep v1 format if poster-style generation fails
            logger.warn('Poster-style generation failed, falling back to v1 format', {
              nodeId,
              paperId: block.paperId,
              err: editorialErr instanceof Error ? editorialErr.message : String(editorialErr),
            })
          }
        }
      }

      // Persist enhanced article flow to database so it survives restarts
      if (Array.isArray(result.flow) && result.flow.length > 0) {
        try {
          const fullArticleFlowPayload = JSON.stringify({
            schemaVersion: 'node-article-v6',
            flow: result.flow,
            coreJudgment: result.coreJudgment,
            generatedAt: new Date().toISOString(),
          })
          await prisma.research_nodes.update({
            where: { id: nodeId },
            data: {
              fullArticleFlow: fullArticleFlowPayload,
              editorialPromptHash: `v6:${Date.now()}`,
              updatedAt: new Date(),
            },
          })
          logger.info('Persisted fullArticleFlow to database', {
            nodeId,
            flowLength: result.flow.length,
          })
        } catch (persistErr) {
          logger.warn('Failed to persist fullArticleFlow to database', {
            nodeId,
            err: persistErr instanceof Error ? persistErr.message : String(persistErr),
          })
        }
      }

      // 广播完成消息
      broadcastResearchComplete(nodeId, {
        flow: result.flow,
        coreJudgment: result.coreJudgment,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      logger.warn('Failed to generate enhanced article flow', {
        nodeId,
        err,
        timeoutMs: ENHANCED_NODE_ARTICLE_TIMEOUT_MS,
      })
      // 广播错误消息
      broadcastResearchError(nodeId, err instanceof Error ? err.message : 'Enhanced article generation failed')
      // 失败时保持undefined，使用标准flow
    }
    } // end if (!enhancedArticleFlow)
  }

  const researchView = buildNodeResearchView({
    evidence,
    enhancedArticleFlow,
    critique: generatedCritique,
    coreJudgment,
    papers,
  })
  const articleMarkdown = buildNodeArticleMarkdown({
    language: node.topic.language,
    standfirst: synthesisPass.standfirst,
    summary: looksLikeStaleNodeNarrative(nodeSummary, papers.length)
      ? editorialWriteback.summary
      : nodeSummary,
    explanation: looksLikeStaleNodeNarrative(nodeExplanation, papers.length)
      ? editorialWriteback.explanation
      : nodeExplanation,
    paperRoles,
    articleSections: nodeSections.map((section) => ({
      title: section.title,
      body: section.body,
      paperId: section.paperId,
      paperTitle: section.paperTitle,
    })),
    closing: synthesisPass.closing,
    critique: generatedCritique,
    evidence,
    evidenceAudit,
    coreJudgment,
    enhancedArticleFlow,
  })

  return {
    schemaVersion: NODE_READER_ARTIFACT_SCHEMA_VERSION,
    nodeId: node.id,
    title: node.nodeLabel,
    titleEn: node.nodeSubtitle || node.papers?.titleEn || node.papers?.title,
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
    evidenceAudit,
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
    articleMarkdown,
    critique: generatedCritique,
    evidence,
    references: buildNodeReferenceList(paperRoles),
    enhancedArticleFlow,
    coreJudgment,
    researchView,
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
    const directViewModel = await buildNodeViewModel(nodeId, {
      quick: options?.enhanced !== true,
      stageWindowMonths: stageWindowRequest.effectiveStageWindowMonths,
      enhanced: options?.enhanced,
    })

    return applyTemporalStageLabelsToNodeViewModel(
      directViewModel,
      stageWindowRequest.effectiveStageWindowMonths,
    )
  }

  const nodeDriver: ReaderArtifactDriver<NodeViewModel> = {
    kind: 'node',
    buildFingerprint: buildNodeArtifactFingerprint,
    buildViewModel: (entityId, buildOptions) =>
      buildNodeViewModel(entityId, {
        ...buildOptions,
        stageWindowMonths: stageWindowRequest.configuredStageWindowMonths,
        enhanced: options?.enhanced,
      }),
  }
  const enhancedNodeDriver: ReaderArtifactDriver<NodeViewModel> = {
    ...nodeDriver,
    variant: 'enhanced',
    buildFingerprint: buildEnhancedNodeArtifactFingerprint,
  }

  let viewModel: NodeViewModel

  if (options?.enhanced) {
    const [cached, fingerprint] = await Promise.all([
      readReaderArtifact<NodeViewModel>('node', nodeId, 'enhanced'),
      buildEnhancedNodeArtifactFingerprint(nodeId),
    ])
    const enhancedCacheIsValid =
      cached != null && isReaderArtifactViewModelValid('node', cached.viewModel)

    const hasEnhancedCache =
      cached?.fingerprint === fingerprint &&
      enhancedCacheIsValid &&
      Array.isArray(cached.viewModel.enhancedArticleFlow) &&
      cached.viewModel.enhancedArticleFlow.length > 0

    if (hasEnhancedCache) {
      try {
        const deepArticleModule = await import('./deep-article-generator.js')
        const sanitizeNodeArticleFlow =
          ((deepArticleModule as { sanitizeNodeArticleFlow?: unknown }).sanitizeNodeArticleFlow ??
          (deepArticleModule as { default?: { sanitizeNodeArticleFlow?: unknown } }).default
            ?.sanitizeNodeArticleFlow) as
            | ((
                flow:
                  | import('./deep-article-generator.js').NodeArticleFlowBlock[]
                  | null
                  | undefined,
              ) => import('./deep-article-generator.js').NodeArticleFlowBlock[])
            | undefined

        viewModel = sanitizeNodeArticleFlow
          ? {
              ...cached.viewModel,
              enhancedArticleFlow: sanitizeNodeArticleFlow(cached.viewModel.enhancedArticleFlow),
            }
          : cached.viewModel
      } catch {
        viewModel = cached.viewModel
      }
    } else if (cached && !enhancedCacheIsValid) {
      await dropReaderArtifact('node', nodeId, 'enhanced')
      viewModel = await queueReaderArtifactBuild(enhancedNodeDriver, nodeId, { enhanced: true })
    } else if (cached?.fingerprint === fingerprint) {
      // Enhanced node requests should return the long-form article on the same request.
      // The enhanced builder now uses the fast grounded fallback path, so returning the
      // legacy cached view model would keep the node page stuck in the old interrupted flow.
      viewModel = await queueReaderArtifactBuild(enhancedNodeDriver, nodeId, { enhanced: true })
    } else {
      viewModel = await queueReaderArtifactBuild(enhancedNodeDriver, nodeId, { enhanced: true })
    }
  } else {
    try {
      viewModel = await withReaderTimeout(
        resolveReaderArtifact(nodeDriver, nodeId),
        DEFAULT_NODE_ARTIFACT_TIMEOUT_MS,
        `Default node artifact hydration for ${nodeId}`,
      )
    } catch (error) {
      logger.warn('Default node artifact hydration timed out; serving direct quick node view model.', {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      })
      viewModel = await buildNodeViewModel(nodeId, {
        quick: true,
        stageWindowMonths: stageWindowRequest.configuredStageWindowMonths,
      })
    }
  }

  return applyTemporalStageLabelsToNodeViewModel(
    viewModel,
    stageWindowRequest.effectiveStageWindowMonths,
  )
}

export async function rebuildNodeViewModel(
  nodeId: string,
  options?: { stageWindowMonths?: number; enhanced?: boolean },
): Promise<NodeViewModel> {
  const stageWindowRequest = await resolveNodeStageWindowRequest(
    nodeId,
    options?.stageWindowMonths,
  )

  if (!stageWindowRequest.matchesConfiguredWindow) {
    const directViewModel = await buildNodeViewModel(nodeId, {
      stageWindowMonths: stageWindowRequest.effectiveStageWindowMonths,
      enhanced: options?.enhanced,
    })

    return applyTemporalStageLabelsToNodeViewModel(
      directViewModel,
      stageWindowRequest.effectiveStageWindowMonths,
    )
  }

  const nodeDriver: ReaderArtifactDriver<NodeViewModel> = {
    kind: 'node',
    variant: options?.enhanced ? 'enhanced' : 'default',
    buildFingerprint: buildNodeArtifactFingerprint,
    buildViewModel: (entityId, buildOptions) =>
      buildNodeViewModel(entityId, {
        ...buildOptions,
        stageWindowMonths: stageWindowRequest.configuredStageWindowMonths,
        enhanced: options?.enhanced,
        forceRegenerate: true,
      }),
  }

  const viewModel = await resolveReaderArtifact(nodeDriver, nodeId, {
    forceRebuild: true,
    enhanced: options?.enhanced,
  })
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
  includeEnhancedNodes?: boolean
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
  const includeEnhancedNodes = options.includeEnhancedNodes ?? mode !== 'quick'
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
        ? prisma.research_nodes.findMany({
            where: {
              topicId,
              id: { in: scopedNodeIds },
            },
            select: { id: true },
            orderBy: [{ updatedAt: 'desc' }],
            take: Math.max(scopedNodeIds.length, limit),
          })
        : Promise.resolve<Array<{ id: string }>>([])
      : prisma.research_nodes.findMany({
          where: { topicId },
          select: { id: true },
          orderBy: [{ updatedAt: 'desc' }],
          take: limit,
        }),
    shouldScopePapers
      ? scopedPaperIds.length > 0
        ? prisma.papers.findMany({
            where: {
              topicId,
              id: { in: scopedPaperIds },
            },
            select: { id: true },
            orderBy: [{ updatedAt: 'desc' }],
            take: Math.max(scopedPaperIds.length, limit),
          })
        : Promise.resolve<Array<{ id: string }>>([])
      : prisma.papers.findMany({
          where: { topicId },
          select: { id: true },
          orderBy: [{ updatedAt: 'desc' }],
          take: limit,
        }),
  ])

  if (mode === 'full') {
    await runInBatches(nodes, 2, async (node) => {
      await rebuildNodeViewModel(node.id)
      if (includeEnhancedNodes) {
        await rebuildNodeViewModel(node.id, { enhanced: true })
      }
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
      if (includeEnhancedNodes) {
        await syncPersistedReaderArtifactFingerprint<NodeViewModel>(
          'node',
          node.id,
          buildEnhancedNodeArtifactFingerprint,
          'enhanced',
        )
      }
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
      const enhancedNodeDriver = {
        kind: 'node' as const,
        variant: 'enhanced' as const,
        buildFingerprint: buildEnhancedNodeArtifactFingerprint,
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

        if (includeEnhancedNodes) {
          void queueReaderArtifactBuild(enhancedNodeDriver, node.id, { enhanced: true }).catch((error) => {
            if (error instanceof AppError && error.statusCode === 404) {
              return
            }
            console.error(`[AlphaReader] Deferred enhanced node rebuild failed for ${node.id}:`, error)
          })
        }
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
    warmedEnhancedNodeCount: mode === 'full' && includeEnhancedNodes ? nodes.length : 0,
    warmedPaperCount: papers.length,
    queuedNodeCount: mode === 'deferred' ? nodes.length : 0,
    queuedEnhancedNodeCount: mode === 'deferred' && includeEnhancedNodes ? nodes.length : 0,
    queuedPaperCount: mode === 'deferred' ? papers.length : 0,
  }
}

export interface TopicReaderArtifactOrchestrationOptions {
  limit?: number
  mode?: ReaderArtifactWarmMode
  includeEnhancedNodes?: boolean
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
    includeEnhancedNodes: options.includeEnhancedNodes,
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
  paperRoute,
  looksLikeStaleNodeNarrative,
  extractNarrativePaperCountClaim,
  buildNodeNarrativeSeed,
  cleanExtractedParagraph,
  sanitizeStoredParagraphList,
  getRenderablePaperSections,
  selectArticleEvidence,
  buildNodeEvidenceAudit,
}
