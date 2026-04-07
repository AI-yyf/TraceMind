import type { PrismaClient } from '@prisma/client'

import { omniGateway } from '../omni/gateway'
import type { OmniCompleteRequest, OmniMessage, ResearchRoleId } from '../omni/types'

export type PaperSubsectionKind =
  | 'background'
  | 'problem'
  | 'method'
  | 'experiment'
  | 'results'
  | 'contribution'
  | 'limitation'
  | 'significance'

export type PaperRoleInNode =
  | 'origin'
  | 'milestone'
  | 'branch'
  | 'confluence'
  | 'extension'
  | 'baseline'

export interface PaperSubsection {
  kind: PaperSubsectionKind
  title: string
  titleEn?: string
  content: string
  contentEn?: string
  wordCount: number
  keyPoints: string[]
  evidenceIds: string[]
}

export interface PaperArticleBlock {
  type: 'paper-article'
  id: string
  paperId: string
  role: PaperRoleInNode
  title: string
  titleEn?: string
  authors: string[]
  publishedAt: string
  citationCount: number | null
  originalUrl?: string
  pdfUrl?: string
  coverImage?: string | null
  introduction: string
  subsections: PaperSubsection[]
  conclusion: string
  totalWordCount: number
  readingTimeMinutes: number
  anchorId: string
}

export interface NodeIntroductionBlock {
  type: 'introduction'
  id: string
  title: string
  content: string
  contextStatement: string
  coreQuestion: string
  keyMethods: string[]
}

export interface NodeSynthesisBlock {
  type: 'synthesis'
  id: string
  title: string
  content: string
  insights: string[]
}

export interface NodeClosingBlock {
  type: 'closing'
  id: string
  title: string
  content: string
  keyTakeaways: string[]
  transitionToNext?: string
}

export type NodeArticleFlowBlock =
  | NodeIntroductionBlock
  | PaperArticleBlock
  | NodeSynthesisBlock
  | NodeClosingBlock

export interface DeepArticleGenerationResult {
  nodeId: string
  schemaVersion: '2.0'
  articleFlow: NodeArticleFlowBlock[]
  stats: {
    paperCount: number
    totalWordCount: number
    readingTimeMinutes: number
  }
}

type SourcePaper = {
  id: string
  title: string
  titleZh?: string | null
  titleEn?: string | null
  authors?: unknown
  summary?: string | null
  explanation?: string | null
  abstract?: string | null
  publishedAt?: string | Date | null
  published?: string | Date | null
  citationCount?: number | null
  originalUrl?: string | null
  arxivUrl?: string | null
  pdfUrl?: string | null
  coverImage?: string | null
  coverPath?: string | null
  sections?: Array<{ id: string; editorialTitle: string; sourceSectionTitle: string; paragraphs: string }>
  figures?: Array<{ id: string }>
  tables?: Array<{ id: string }>
  formulas?: Array<{ id: string }>
}

type SourceNode = {
  nodeId: string
  title: string
  stageIndex: number
  summary?: string | null
  explanation?: string | null
}

const SUBSECTION_ORDER: PaperSubsectionKind[] = [
  'background',
  'problem',
  'method',
  'experiment',
  'results',
  'contribution',
  'limitation',
  'significance',
]

const SUBSECTION_TITLES: Record<PaperSubsectionKind, { zh: string; en: string }> = {
  background: { zh: '研究背景', en: 'Research Background' },
  problem: { zh: '问题定义', en: 'Problem Definition' },
  method: { zh: '方法解析', en: 'Methodology' },
  experiment: { zh: '实验设计', en: 'Experimental Design' },
  results: { zh: '结果分析', en: 'Results Analysis' },
  contribution: { zh: '核心贡献', en: 'Key Contributions' },
  limitation: { zh: '局限性', en: 'Limitations' },
  significance: { zh: '研究意义', en: 'Significance' },
}

const ROLE_LABELS: Record<PaperRoleInNode, { zh: string; en: string }> = {
  origin: { zh: '源头论文', en: 'Origin' },
  milestone: { zh: '里程碑论文', en: 'Milestone' },
  branch: { zh: '分支节点', en: 'Branch' },
  confluence: { zh: '汇流节点', en: 'Confluence' },
  extension: { zh: '扩展工作', en: 'Extension' },
  baseline: { zh: '基线工作', en: 'Baseline' },
}

function isZh(language: string) {
  return language === 'zh'
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/gu, ' ').trim() ?? ''
}

function clipText(value: string | null | undefined, maxLength: number) {
  const text = cleanText(value)
  if (!text) return ''
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

function parseAuthors(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') return item.name.trim()
        return ''
      })
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      return parseAuthors(JSON.parse(value))
    } catch {
      return value.split(/[;,，]/u).map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return new Date().toISOString()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function countWords(text: string, language: string) {
  const normalized = cleanText(text)
  if (!normalized) return 0
  return isZh(language)
    ? normalized.replace(/\s+/gu, '').length
    : normalized.split(/\s+/u).filter(Boolean).length
}

function readingMinutes(wordCount: number) {
  return Math.max(1, Math.ceil(wordCount / 260))
}

function localizedTitle(kind: PaperSubsectionKind, language: string) {
  return isZh(language) ? SUBSECTION_TITLES[kind].zh : SUBSECTION_TITLES[kind].en
}

function parseJson<T>(value: string): T | null {
  const trimmed = value.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/iu)?.[1] ?? trimmed
  try {
    return JSON.parse(fenced) as T
  } catch {
    return null
  }
}

async function callOmniJson<T>(role: ResearchRoleId, system: string, user: string, maxTokens: number) {
  const request: OmniCompleteRequest = {
    task: 'topic_summary',
    role,
    preferredSlot: 'language',
    messages: [
      { role: 'system', content: system } satisfies OmniMessage,
      { role: 'user', content: user } satisfies OmniMessage,
    ],
    json: true,
    temperature: 0.2,
    maxTokens,
  }

  if (!(await omniGateway.hasAvailableModel(request))) return null
  const result = await omniGateway.complete(request)
  return result.issue ? null : parseJson<T>(result.text)
}

function fallbackSubsections(paper: SourcePaper, language: string): PaperSubsection[] {
  const summary = cleanText(paper.abstract || paper.summary || paper.explanation)
  const title = paper.titleZh || paper.title
  const evidenceIds = [
    ...(paper.sections?.slice(0, 2).map((item) => item.id) ?? []),
    ...(paper.figures?.slice(0, 1).map((item) => item.id) ?? []),
    ...(paper.tables?.slice(0, 1).map((item) => item.id) ?? []),
    ...(paper.formulas?.slice(0, 1).map((item) => item.id) ?? []),
  ]

  return SUBSECTION_ORDER.map((kind) => {
    const text = isZh(language)
      ? `关于“${localizedTitle(kind, language)}”，当前能安全确认的信息主要来自已知摘要：${summary || `《${title}》的这一部分仍需要回到原文核对。`}`
      : `For "${localizedTitle(kind, language)}", the safe information currently comes from the available abstract: ${summary || `this part still needs the full paper for a reliable reconstruction.`}`

    return {
      kind,
      title: localizedTitle(kind, language),
      titleEn: SUBSECTION_TITLES[kind].en,
      content: clipText(text, 240),
      wordCount: countWords(text, language),
      keyPoints: isZh(language) ? ['保持保守表述', '需要原文核对'] : ['keep the claim conservative', 'verify with the full paper'],
      evidenceIds,
    }
  })
}

function mergeSubsections(
  generated: Array<Partial<PaperSubsection> & { kind?: string }> | undefined,
  paper: SourcePaper,
  language: string,
) {
  const fallback = new Map(fallbackSubsections(paper, language).map((item) => [item.kind, item] as const))
  return SUBSECTION_ORDER.map((kind) => {
    const item = generated?.find((entry) => entry.kind === kind)
    const base = fallback.get(kind)
    const content = cleanText(item?.content) || base?.content || ''
    return {
      kind,
      title: cleanText(item?.title) || base?.title || localizedTitle(kind, language),
      titleEn: cleanText(item?.titleEn) || base?.titleEn,
      content,
      contentEn: cleanText(item?.contentEn) || undefined,
      wordCount: typeof item?.wordCount === 'number' && item.wordCount > 0 ? item.wordCount : countWords(content, language),
      keyPoints: item?.keyPoints?.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) || base?.keyPoints || [],
      evidenceIds: item?.evidenceIds?.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) || base?.evidenceIds || [],
    }
  })
}

function determineRoles(papers: SourcePaper[]) {
  const sorted = [...papers].sort((left, right) => new Date(formatDate(left.publishedAt || left.published)).getTime() - new Date(formatDate(right.publishedAt || right.published)).getTime())
  const milestoneId = [...sorted].sort((left, right) => (right.citationCount ?? 0) - (left.citationCount ?? 0))[0]?.id

  return sorted.map((paper, index) => {
    if (index === 0) return { paper, role: 'origin' as const }
    if (paper.id === milestoneId && (paper.citationCount ?? 0) >= 200) return { paper, role: 'milestone' as const }
    if (index === sorted.length - 1 && sorted.length >= 3) return { paper, role: 'confluence' as const }
    return { paper, role: 'extension' as const }
  })
}

async function buildIntroduction(node: SourceNode, papers: SourcePaper[], language: string): Promise<NodeIntroductionBlock> {
  const generated = await callOmniJson<{
    content?: string
    contextStatement?: string
    coreQuestion?: string
    keyMethods?: string[]
  }>(
    'node_writer',
    isZh(language)
      ? '你是研究综述写作者。输出 JSON：content, contextStatement, coreQuestion, keyMethods。只基于已知材料，不编造。'
      : 'You are a research survey writer. Return JSON with content, contextStatement, coreQuestion, and keyMethods. Stay grounded in the provided material.',
    `${node.title}\n${clipText(node.explanation || node.summary, 220)}\n${papers.map((paper) => paper.titleZh || paper.title).join('、')}`,
    1200,
  )

  return {
    type: 'introduction',
    id: `${node.nodeId}-introduction`,
    title: isZh(language) ? '引言' : 'Introduction',
    content: cleanText(generated?.content) || (isZh(language)
      ? `这一节点围绕“${node.title}”展开，当前纳入 ${papers.length} 篇论文。${clipText(node.explanation || node.summary, 180) || '它的目标是先把这一段研究主线讲清楚。'}`
      : `This node focuses on "${node.title}" and currently includes ${papers.length} papers. ${clipText(node.explanation || node.summary, 180) || 'Its first goal is to make this part of the research line readable.'}`),
    contextStatement: cleanText(generated?.contextStatement) || (isZh(language) ? `这是第 ${node.stageIndex} 阶段中的一个研究节点。` : `This is a research node in stage ${node.stageIndex}.`),
    coreQuestion: cleanText(generated?.coreQuestion) || (isZh(language) ? '这个节点到底推进了什么判断？' : 'What judgment does this node move forward?'),
    keyMethods: generated?.keyMethods?.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) || [],
  }
}

async function buildPaperArticle(paper: SourcePaper, role: PaperRoleInNode, language: string): Promise<PaperArticleBlock> {
  const generated = await callOmniJson<{
    introduction?: string
    subsections?: Array<Partial<PaperSubsection> & { kind?: string }>
    conclusion?: string
  }>(
    'paper_writer',
    isZh(language)
      ? '你是论文深读写作者。输出 JSON：introduction, subsections, conclusion。subsections 必须覆盖 background/problem/method/experiment/results/contribution/limitation/significance，并且不要编造实验数据。'
      : 'You are a paper-reading writer. Return JSON with introduction, subsections, and conclusion. The subsections must cover background/problem/method/experiment/results/contribution/limitation/significance, and you must not fabricate data.',
    `${paper.titleZh || paper.title}\n${clipText(paper.abstract || paper.summary || paper.explanation, 360)}\n${ROLE_LABELS[role].zh}`,
    2600,
  )

  const subsections = mergeSubsections(generated?.subsections, paper, language)
  const introduction = cleanText(generated?.introduction) || clipText(paper.abstract || paper.summary || paper.explanation, 180) || (isZh(language) ? '这篇论文为当前节点提供了一个关键切口。' : 'This paper provides a key entry point for the current node.')
  const conclusion = cleanText(generated?.conclusion) || (isZh(language) ? '它的价值在于把当前问题线推进成一个可比较的研究单元。' : 'Its value lies in turning the current problem line into a comparable research unit.')
  const totalWordCount = countWords(introduction, language) + countWords(conclusion, language) + subsections.reduce((sum, item) => sum + item.wordCount, 0)

  return {
    type: 'paper-article',
    id: `${paper.id}-article`,
    paperId: paper.id,
    role,
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn || undefined,
    authors: parseAuthors(paper.authors),
    publishedAt: formatDate(paper.publishedAt || paper.published),
    citationCount: paper.citationCount ?? null,
    originalUrl: paper.originalUrl || paper.arxivUrl || undefined,
    pdfUrl: paper.pdfUrl || undefined,
    coverImage: paper.coverImage ?? paper.coverPath ?? null,
    introduction,
    subsections,
    conclusion,
    totalWordCount,
    readingTimeMinutes: readingMinutes(totalWordCount),
    anchorId: `paper:${paper.id}`,
  }
}

async function buildSynthesis(node: SourceNode, papers: PaperArticleBlock[], language: string): Promise<NodeSynthesisBlock | null> {
  if (papers.length < 2) return null
  const generated = await callOmniJson<{ content?: string; insights?: string[] }>(
    'critic',
    isZh(language)
      ? '你是研究线综述作者。输出 JSON：content, insights，总结多篇论文之间的方法演进与互补。'
      : 'You are a research-line summarizer. Return JSON with content and insights that explain methodological evolution and complementarity across papers.',
    `${node.title}\n${papers.map((paper) => paper.title).join('、')}`,
    1400,
  )

  return {
    type: 'synthesis',
    id: `${node.nodeId}-synthesis`,
    title: isZh(language) ? '综合比较' : 'Comparative Synthesis',
    content: cleanText(generated?.content) || (isZh(language)
      ? `把这些论文连起来看，可以更清楚地看到“${node.title}”如何从单点工作逐渐形成稳定的研究判断。`
      : `Taken together, these papers make it easier to see how "${node.title}" grows from isolated work into a more stable research judgment.`),
    insights: generated?.insights?.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) || [
      isZh(language) ? '节点内部已经形成了可比较的研究轨迹。' : 'A comparable research trajectory is now visible inside this node.',
    ],
  }
}

async function buildClosing(node: SourceNode, papers: PaperArticleBlock[], language: string): Promise<NodeClosingBlock> {
  const generated = await callOmniJson<{ content?: string; keyTakeaways?: string[] }>(
    'critic',
    isZh(language)
      ? '你是研究节点总结作者。输出 JSON：content, keyTakeaways，总结这一节点当前已经站稳的判断。'
      : 'You are a research-node summarizer. Return JSON with content and keyTakeaways summarizing what is currently established in this node.',
    `${node.title}\n${papers.length}`,
    1200,
  )

  return {
    type: 'closing',
    id: `${node.nodeId}-closing`,
    title: isZh(language) ? '总结' : 'Conclusion',
    content: cleanText(generated?.content) || (isZh(language)
      ? `到目前为止，这个节点已经把“${node.title}”整理成一条可读的研究推进线。`
      : `At this point, this node already turns "${node.title}" into a readable research progression.`),
    keyTakeaways: generated?.keyTakeaways?.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) || [
      isZh(language) ? '节点主线已经可读。' : 'The node main line is now readable.',
    ],
  }
}

async function buildArticleFlow(node: SourceNode, papers: SourcePaper[], language: string) {
  const introduction = await buildIntroduction(node, papers, language)
  const paperArticles = await Promise.all(determineRoles(papers).map(({ paper, role }) => buildPaperArticle(paper, role, language)))
  const synthesis = await buildSynthesis(node, paperArticles, language)
  const closing = await buildClosing(node, paperArticles, language)
  return [introduction, ...paperArticles, ...(synthesis ? [synthesis] : []), closing] satisfies NodeArticleFlowBlock[]
}

export async function generateDeepNodeArticle(
  prisma: PrismaClient,
  params: { nodeId: string; topicId: string; language: string; paperIds: string[] },
): Promise<DeepArticleGenerationResult> {
  const node = await prisma.researchNode.findUnique({
    where: { id: params.nodeId },
    select: { id: true, nodeLabel: true, stageIndex: true, nodeSummary: true, nodeExplanation: true },
  })

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`)
  }

  const papers = await prisma.paper.findMany({
    where: { topicId: params.topicId, id: { in: params.paperIds } },
    include: {
      sections: true,
      figures: { select: { id: true } },
      tables: { select: { id: true } },
      formulas: { select: { id: true } },
    },
  })

  const articleFlow = await buildArticleFlow(
    {
      nodeId: node.id,
      title: node.nodeLabel,
      stageIndex: node.stageIndex,
      summary: node.nodeSummary,
      explanation: node.nodeExplanation,
    },
    papers.map((paper) => ({
      ...paper,
      publishedAt: paper.published,
      originalUrl: paper.arxivUrl,
      coverImage: paper.coverPath,
    })),
    params.language,
  )

  const totalWordCount = articleFlow.reduce((sum, block) => sum + ('totalWordCount' in block ? block.totalWordCount : countWords(block.content, params.language)), 0)

  return {
    nodeId: params.nodeId,
    schemaVersion: '2.0',
    articleFlow,
    stats: {
      paperCount: articleFlow.filter((block): block is PaperArticleBlock => block.type === 'paper-article').length,
      totalWordCount,
      readingTimeMinutes: readingMinutes(totalWordCount),
    },
  }
}

export async function generateNodeEnhancedArticle(
  nodeId: string,
  options: {
    papers: Array<{
      id: string
      title: string
      titleEn?: string
      authors?: unknown
      summary?: string
      explanation?: string
      abstract?: string
      publishedAt?: string
      pdfUrl?: string
      originalUrl?: string
      citationCount?: number | null
      coverImage?: string | null
    }>
    nodeContext: {
      title: string
      stageIndex: number
      summary?: string
      explanation?: string
    }
  },
): Promise<NodeArticleFlowBlock[]> {
  return buildArticleFlow(
    {
      nodeId,
      title: options.nodeContext.title,
      stageIndex: options.nodeContext.stageIndex,
      summary: options.nodeContext.summary,
      explanation: options.nodeContext.explanation,
    },
    options.papers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      titleZh: paper.title,
      titleEn: paper.titleEn,
      authors: paper.authors,
      summary: paper.summary,
      explanation: paper.explanation,
      abstract: paper.abstract,
      publishedAt: paper.publishedAt,
      pdfUrl: paper.pdfUrl,
      originalUrl: paper.originalUrl,
      citationCount: paper.citationCount,
      coverImage: paper.coverImage,
    })),
    'zh',
  )
}
