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

type EvidenceType = 'figure' | 'table' | 'formula'

const READER_ARTIFACT_PREFIX = 'alpha:reader-artifact:'
const readerArtifactBuildQueue = new Map<string, Promise<unknown>>()

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
}

type ReaderArtifactViewModel = NodeViewModel | PaperViewModel

function readerArtifactKey(kind: ReaderArtifactKind, entityId: string) {
  return `${READER_ARTIFACT_PREFIX}${kind}:${entityId}`
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

  const [stage, topicPapers, runtime, topicMemory, sessionMemory, modelConfigFingerprint, nodeTemplate, comparisonTemplate, reviewerTemplate] = await Promise.all([
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
  ])

  const relatedPaperIds = collectNodeRelatedPaperIds({
    node,
    stageTitle: [stage?.name, stage?.nameEn].filter(Boolean).join(' '),
    papers: topicPapers,
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

  if (!DEFERRED_READER_ARTIFACTS_DISABLED) {
    void queueReaderArtifactBuild(driver, entityId).catch((error) => {
      if (error instanceof AppError && error.statusCode === 404) {
        return
      }
    })
  }
  return driver.buildViewModel(entityId, { quick: true })
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

function splitParagraphs(value: string | null | undefined, maxParts = 3) {
  const raw = (value ?? '').split(/\n+/u).map((item) => item.trim()).filter(Boolean)
  if (raw.length > 0) return raw.slice(0, maxParts)

  const compact = clipText(value ?? '', 360)
  return compact ? compact.split(/(?<=[。！？.!?])/u).map((item) => item.trim()).filter(Boolean).slice(0, maxParts) : []
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
  return [
    ...paper.sections.slice(0, 4).map((section: any) => ({
      anchorId: `section:${section.id}`,
      type: 'section' as const,
      route: paperRoute(paper.id, `section:${section.id}`),
      title: section.editorialTitle || section.sourceSectionTitle,
      label: `${paper.titleZh || paper.title} / ${section.editorialTitle || section.sourceSectionTitle}`,
      quote: clipText(section.paragraphs),
      content: section.paragraphs,
      page: null,
      sourcePaperId: paper.id,
      sourcePaperTitle: paper.titleZh || paper.title,
      whyItMatters: '这一章节提供了论文论证链条中的正文依据。',
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
      whyItMatters: '这张表通常直接决定论文和基线之间的优劣是否成立。',
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

function buildPaperCritique(paper: any): ReviewerCritique {
  return buildReviewerCritique('paper', [
    paper.figures.length === 0 ? '关键可视化证据偏少，结论更像依赖叙述而不是直接证据。' : '图表虽然存在，但仍需确认是否真正覆盖最关键的比较场景。',
    paper.tables.length === 0 ? '缺少系统对比表，方法优越性是否稳定仍然可疑。' : '表格结果需要继续追问统计显著性、公平设置和评价指标选择。',
    paper.formulas.length === 0 ? '方法描述若缺少清晰公式或机制定义，复现边界会变得模糊。' : '公式定义存在时，也仍要检查符号假设和推导跳步是否充分说明。',
  ])
}

function buildNodeCritique(node: any, papers: any[]): ReviewerCritique {
  const paperCount = papers.length
  return buildReviewerCritique('node', [
    paperCount > 1 ? '节点内多篇论文虽然能形成主线，但是否真的彼此推进，需要严格比较任务设定、评价指标和数据条件。' : '如果节点目前主要由一篇论文支撑，那么“节点成立”本身就仍然偏脆弱。',
    papers.some((paper) => paper.figures.length === 0 && paper.tables.length === 0) ? '部分论文缺少足够的可视化或表格证据，节点整体证据链不够均衡。' : '即便每篇论文都有图表，也要警惕不同论文之间证据不可直接横比。',
    '节点总结不能只停在“这些论文都很重要”，还必须明确哪些问题已被推进、哪些问题其实只是被重新表述。',
  ])
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
  if (paper.sections.length === 0) {
    return [
      {
        id: 'paper-lead',
        kind: 'lead',
        title: '这篇论文到底在解决什么',
        body: splitParagraphs(`${paper.summary}\n${paper.explanation ?? ''}`, 3),
        evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table', 'formula'], 2),
      },
    ]
  }

  return paper.sections.slice(0, 5).map((section: any, index: number) => ({
    id: `paper-section-${section.id}`,
    kind: index === 0 ? 'lead' : index === 1 ? 'paper-pass' : 'evidence',
    title: section.editorialTitle || section.sourceSectionTitle,
    body: splitParagraphs(section.paragraphs, 3),
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

function buildPaperPass(paper: any, role: string, contribution: string): PaperRole {
  const links = resolvePaperSourceLinks({
    arxivUrl: paper.arxivUrl,
    pdfUrl: paper.pdfUrl,
    pdfPath: paper.pdfPath,
  })

  return {
    paperId: paper.id,
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn ?? paper.title,
    route: paperRoute(paper.id),
    summary: clipText(paper.summary, 140),
    publishedAt: paper.published.toISOString(),
    role,
    contribution,
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
  return [
    {
      id: 'cross-paper-1',
      title: '多篇论文如何形成这个节点',
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
          detail: `最早的论文是 ${(sorted[0].titleZh || sorted[0].title)}，后续工作在它提出的问题或方法上继续推进。`,
        },
        {
          label: '证据关系',
          detail: '节点内的论文并不一定都在同一条件下可直接比较，因此需要把它们视为“推进链”而不是简单排行榜。',
        },
        {
          label: '仍未解决',
          detail: '真正难的部分通常不是有没有新方法，而是这些方法在更复杂场景下是否还能保持稳定优势。',
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
    title: '这个节点到底在讲什么',
    body: synthesis.lead,
    evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table'], 2),
  }

  const paperSections = papers.map((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    return {
    id: `node-paper-${paper.id}`,
    kind: 'paper-pass' as const,
    title: paper.titleZh || paper.title,
    paperId: paper.id,
    paperTitle: paper.titleZh || paper.title,
    body: pass?.body ?? [
      `${paperRoleLabel(index, index === 0)}：${clipText(paper.summary, 180)}`,
      clipText(paper.explanation ?? paper.summary, 200),
      `证据侧重点：${paper.figures.length} 张图、${paper.tables.length} 张表、${paper.formulas.length} 个公式。`,
    ],
    evidenceIds: buildSectionEvidenceIds(buildPaperEvidence(paper), ['figure', 'table', 'formula'], 2),
  }})

  const closingEvidence = {
    id: 'node-evidence',
    kind: 'evidence' as const,
    title: '这些证据为什么足以支撑这个节点',
    body: synthesis.evidence,
    evidenceIds: buildSectionEvidenceIds(evidence, ['figure', 'table', 'formula'], 3),
  }

  return [lead, ...paperSections, closingEvidence]
}

function buildTimeRangeLabel(values: string[]) {
  if (values.length === 0) return '时间待定'
  const dates = values.map((value) => new Date(value)).filter((value) => !Number.isNaN(+value)).sort((left, right) => +left - +right)
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
    ...interleaveBlocks(textBlocks, buildEvidenceFlowBlocks(evidence)),
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
      title: '这个节点到底在讲什么',
      body: synthesisPass.lead,
      anchorId: 'node:intro',
    },
  ]

  papers.forEach((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    const paperEvidence = buildPaperEvidence(paper)
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
      contribution: pass?.contribution ?? clipText(paper.explanation ?? paper.summary, 140),
      route: paperRoute(paper.id),
      publishedAt: paper.published.toISOString(),
      originalUrl: links.originalUrl,
      pdfUrl: links.pdfUrl,
    })
    flow.push({
      id: `paper-text-${paper.id}`,
      type: 'text',
      title: paper.titleZh || paper.title,
      body:
        pass?.body ?? [
          clipText(paper.summary, 180),
          clipText(paper.explanation ?? paper.summary, 200),
        ],
      paperId: paper.id,
      paperTitle: paper.titleZh || paper.title,
    })
    flow.push(...buildEvidenceFlowBlocks(paperEvidence))
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
    title: '关键证据为什么能撑住这个节点',
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
    title: '收束',
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
  const evidence = buildPaperEvidence(paper)
  const critiqueFallback = buildPaperCritique(paper)
  const storyFallback = {
    standfirst: clipText(`${paper.summary} ${paper.explanation ?? ''}`, 260),
    sections: buildPaperArticleSections(paper, evidence).map((section) => ({
      title: section.title,
      body: section.body,
    })),
    closing: [
      '读完这篇论文后，读者至少应当能够回答三个问题：它到底解决了哪个缺口、它靠什么证据说服读者、以及它到底还没解决什么。',
      '如果这些问题仍然答不清，那么问题通常不在页面排版，而在论文本身的证据链条还不够扎实。',
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
    schemaVersion: 'paper-article-v2',
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
  options?: { quick?: boolean },
): Promise<NodeViewModel> {
  const quick = options?.quick === true
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

  const relatedPaperIds = collectNodeRelatedPaperIds({
    node,
    stageTitle: [stage?.name, stage?.nameEn].filter(Boolean).join(' '),
    papers: topicPapers,
  })
  const paperById = new Map(topicPapers.map((paper) => [paper.id, paper]))
  const effectiveStageWindowMonths = await resolveTopicStageWindowMonths(node.topicId)
  const temporalStageBuckets = await loadTopicTemporalStageBuckets(
    node.topicId,
    effectiveStageWindowMonths,
  )
  const nodeBucketKey = temporalStageBuckets?.nodeAssignments.get(node.id)?.bucketKey
  const stageScopedPaperIds =
    nodeBucketKey && temporalStageBuckets
      ? relatedPaperIds.filter(
          (paperId) =>
            temporalStageBuckets.paperAssignments.get(paperId)?.bucketKey === nodeBucketKey,
        )
      : relatedPaperIds
  const resolvedPaperIds = Array.from(
    new Set(
      (stageScopedPaperIds.length > 0 ? stageScopedPaperIds : relatedPaperIds).concat(
        node.primaryPaperId ? [node.primaryPaperId] : [],
      ),
    ),
  )
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
  const evidence = papers.flatMap((paper) => buildPaperEvidence(paper))
  const stats = papers.reduce(
    (acc, paper) => ({
      paperCount: acc.paperCount + 1,
      figureCount: acc.figureCount + paper.figures.length,
      tableCount: acc.tableCount + paper.tables.length,
      formulaCount: acc.formulaCount + paper.formulas.length,
    }),
    { paperCount: 0, figureCount: 0, tableCount: 0, formulaCount: 0 },
  )

  const fallbackCritique = buildNodeCritique(node, papers)
  const fallbackPaperPasses = papers.map((paper, index) => ({
    paperId: paper.id,
    role: paperRoleLabel(index, paper.id === node.primaryPaperId),
    contribution: clipText(paper.explanation ?? paper.summary, 120),
    body: [
      clipText(paper.summary, 180),
      clipText(paper.explanation ?? paper.summary, 220),
      `证据重心：${paper.figures.length} 张图，${paper.tables.length} 张表，${paper.formulas.length} 个公式。`,
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
              detail: '先看谁最早提出关键判断，再看后续论文如何补证据、改机制、拓边界。',
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
    headline: `${node.nodeLabel} 不是单篇结论，而是一段围绕同一问题形成的研究推进。`,
    standfirst: clipText(`${node.nodeSummary} ${node.nodeExplanation ?? ''}`, 280),
    lead: [
      clipText(node.nodeSummary, 180),
      clipText(node.nodeExplanation ?? node.nodeSummary, 220),
    ],
    evidence: [
      '节点级判断不能只停在“论文很多”，而要看这些论文是否在问题、方法与结果层面形成了能互相支撑的论证链。',
      '图、表、公式在这里的意义不是材料很多，而是帮助读者确认每篇论文到底贡献了哪一段关键证据。',
    ],
    closing: [
      '如果读完这个节点后仍然不知道每篇论文各自做了什么，那就说明节点级组织仍然不够成功。',
      '一个好的节点应该让读者看清核心问题、关键推进、证据强弱，以及仍未解决的部分。',
    ],
  }
  const paperPasses = quick
    ? fallbackPaperPasses
    : await generateNodePaperPasses(papers, node.primaryPaperId, researchPipelineContext)
  const comparisonPass = quick
    ? fallbackComparisonPass
    : await generateNodeComparisonPass(
        node,
        papers,
        paperPasses,
        researchPipelineContext,
      )
  const synthesisPass = quick
    ? fallbackSynthesisPass
    : await generateNodeSynthesisPass(
        node,
        papers,
        paperPasses,
        comparisonPass,
        researchPipelineContext,
      )
  const generatedCritique = quick
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
          nodeSummary: node.nodeSummary,
          nodeExplanation: node.nodeExplanation,
          papers: paperPasses,
          comparison: comparisonPass,
        },
        {
          summary: fallbackCritique.summary,
          bullets: fallbackCritique.bullets,
        },
        researchPipelineContext,
      )
  const paperRoles = papers.map((paper, index) => {
    const pass = paperPasses.find((item) => item.paperId === paper.id)
    return buildPaperPass(
      paper,
      pass?.role ?? paperRoleLabel(index, paper.id === node.primaryPaperId),
      pass?.contribution ?? clipText(paper.explanation ?? paper.summary, 120),
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
    critique: {
      title: fallbackCritique.title,
      summary: generatedCritique.summary,
      bullets: generatedCritique.bullets,
    },
  })
  const primaryDate = [...papers]
    .map((paper) => paper.published)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => +left - +right)[0] ?? null
  const editorialWriteback = buildNodeEditorialWriteback({
    node,
    papers,
    comparisonPass,
    synthesisPass,
    critique: {
      title: fallbackCritique.title,
      summary: generatedCritique.summary,
      bullets: generatedCritique.bullets,
    },
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

  return {
    schemaVersion: 'node-article-v2',
    nodeId: node.id,
    title: node.nodeLabel,
    titleEn: node.nodeSubtitle || node.primaryPaper.titleEn || node.primaryPaper.title,
    headline: synthesisPass.headline,
    subtitle: node.nodeSubtitle ?? '',
    summary: nodeSummary,
    explanation: nodeExplanation,
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
    critique: {
      title: fallbackCritique.title,
      summary: generatedCritique.summary,
      bullets: generatedCritique.bullets,
    },
    evidence,
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
  options?: { stageWindowMonths?: number },
): Promise<NodeViewModel> {
  const viewModel = await resolveReaderArtifact(
    {
      kind: 'node',
      buildFingerprint: buildNodeArtifactFingerprint,
      buildViewModel: buildNodeViewModel,
    },
    nodeId,
  )
  return applyTemporalStageLabelsToNodeViewModel(viewModel, options?.stageWindowMonths)
}

export async function rebuildNodeViewModel(
  nodeId: string,
  options?: { stageWindowMonths?: number },
): Promise<NodeViewModel> {
  const viewModel = await resolveReaderArtifact(
    {
      kind: 'node',
      buildFingerprint: buildNodeArtifactFingerprint,
      buildViewModel: buildNodeViewModel,
    },
    nodeId,
    { forceRebuild: true },
  )
  return applyTemporalStageLabelsToNodeViewModel(viewModel, options?.stageWindowMonths)
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
