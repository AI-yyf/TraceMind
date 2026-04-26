import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import type { PaperParagraph } from '../../../shared/editorial-types'
import { logger } from '../../utils/logger'

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

export interface InlineEvidence {
  anchorId: string
  type: 'figure' | 'table' | 'formula'
  description: string
  whyItMatters: string
}

export interface PaperSubsection {
  kind: PaperSubsectionKind
  title: string
  titleEn?: string
  content: string
  contentEn?: string
  wordCount: number
  keyPoints: string[]
  evidenceIds: string[]
  inlineEvidences?: InlineEvidence[]
}

export interface ArticleProgressReporter {
  onStageStart?(stage: string, paperId?: string): void
  onStageComplete?(stage: string, result: unknown): void
  onProgress?(percent: number, message: string): void
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
  /** v2 poster-style: 核心论点（20-30字，海报标题级） */
  coreThesis?: string
  /** v2 poster-style: 核心论点英文 */
  coreThesisEn?: string
  /** v2 poster-style: 自然段落流 */
  paragraphs?: PaperParagraph[]
  /** v2 poster-style: 收束洞察（20-30字，论文边界与接手点） */
  closingInsight?: string
  /** v2 poster-style: 收束洞察英文 */
  closingInsightEn?: string
  /** 内容版本标识 */
  contentVersion?: 'v1' | 'v2'
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

export interface PaperTransitionBlock {
  type: 'paper-transition'
  id: string
  fromPaperId: string
  fromPaperTitle: string
  toPaperId: string
  toPaperTitle: string
  content: string
  transitionType:
    | 'method-evolution'
    | 'problem-shift'
    | 'scale-up'
    | 'scope-broaden'
    | 'complementary'
  anchorId: string
}

export type NodeArticleFlowBlock =
  | NodeIntroductionBlock
  | PaperArticleBlock
  | NodeSynthesisBlock
  | NodeClosingBlock
  | PaperTransitionBlock

export interface DeepArticleGenerationResult {
  nodeId: string
  schemaVersion: '2.0'
  articleFlow: NodeArticleFlowBlock[]
  coreJudgment?: {
    content: string
    contentEn: string
  }
  stats: {
    paperCount: number
    totalWordCount: number
    readingTimeMinutes: number
  }
}

type DistGenerateDeepNodeArticle = (
  prisma: PrismaClient,
  params: {
    nodeId: string
    topicId: string
    language: string
    paperIds: string[]
  },
  reporter?: ArticleProgressReporter,
) => Promise<DeepArticleGenerationResult>

type DistGenerateNodeEnhancedArticle = (
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
      paper_sections?: Array<{
        id: string
        editorialTitle: string
        sourceSectionTitle: string
        paragraphs: string
      }>
      figures?: Array<{
        id: string
        number?: number | null
        caption?: string | null
        analysis?: string | null
        page?: number | null
        imagePath?: string | null
        thumbnailPath?: string | null
      }>
      tables?: Array<{
        id: string
        number?: number | null
        caption?: string | null
        rawText?: string | null
        page?: number | null
      }>
      formulas?: Array<{
        id: string
        number?: number | null
        latex?: string | null
        rawText?: string | null
        page?: number | null
      }>
      evidence?: unknown[]
    }>
    nodeContext: {
      title: string
      stageIndex: number
      summary?: string
      explanation?: string
    }
  },
  reporter?: ArticleProgressReporter,
) => Promise<{
  flow: NodeArticleFlowBlock[]
  coreJudgment: {
    content: string
    contentEn: string
  }
}>

const CLEAN_SUBSECTION_TITLES: Record<PaperSubsectionKind, { zh: string; en: string }> = {
  background: { zh: '研究背景', en: 'Research Background' },
  problem: { zh: '问题界定', en: 'Problem Definition' },
  method: { zh: '方法解析', en: 'Methodology' },
  experiment: { zh: '实验设计', en: 'Experimental Design' },
  results: { zh: '结果分析', en: 'Results Analysis' },
  contribution: { zh: '核心贡献', en: 'Key Contributions' },
  limitation: { zh: '局限与边界', en: 'Limitations' },
  significance: { zh: '研究意义', en: 'Significance' },
}

const CLEAN_SECTION_TITLES = {
  introduction: { zh: '引言', en: 'Introduction' },
  synthesis: { zh: '综合讨论', en: 'Comparative Synthesis' },
  closing: { zh: '结语', en: 'Conclusion' },
}

function isMostlyEnglishSentence(value: string) {
  const normalized = value.trim()
  if (!normalized) return false
  const latinCount = normalized.match(/[A-Za-z]/gu)?.length ?? 0
  const hanCount = normalized.match(/[\u4e00-\u9fff]/gu)?.length ?? 0
  return latinCount >= 12 && hanCount === 0
}

const ENGLISH_NARRATIVE_FRAGMENT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/affordance-centered direct perception/giu, '以 affordance 为中心的直接感知'],
  [
    /an interpretable precursor to later end-to-end driving policy learning/giu,
    '后续端到端驾驶策略学习之前的一层可解释中间表示',
  ],
  [/later end-to-end driving policy learning/giu, '后续端到端驾驶策略学习'],
  [/direct driving policies/giu, '直接驾驶策略'],
  [/command-conditioned behavior selection/giu, '由指令条件驱动的行为选择'],
  [/a single model can execute route-dependent decisions/giu, '单一模型就能执行与路线相关的决策'],
  [/route-dependent decisions/giu, '路线相关决策'],
  [/privileged planning signals during training/giu, '训练阶段的特权规划信号'],
  [/privileged planning signals/giu, '特权规划信号'],
  [/stabilize end-to-end driving/giu, '稳定端到端驾驶策略'],
  [/strengthen closed-loop behavior under complex scenarios/giu, '增强复杂场景下的闭环表现'],
  [/closed-loop behavior under complex scenarios/giu, '复杂场景下的闭环表现'],
  [/closed-loop driving systems/giu, '闭环驾驶系统'],
  [/closed-loop behavior/giu, '闭环表现'],
  [/complex scenarios/giu, '复杂场景'],
  [/the perception-planning interface explicit/giu, '感知到规划的接口保持显式'],
  [
    /a useful branch reference when comparing later closed-loop driving systems/giu,
    '后续比较闭环驾驶系统时很有价值的一条分支参照',
  ],
  [/the modern end-to-end self-driving question/giu, '现代端到端自动驾驶问题'],
  [
    /learning steering directly from pixels without a handcrafted modular stack/giu,
    '不依赖手工模块栈，直接从像素输入学习转向控制',
  ],
  [/perception and control into one trainable policy surface/giu, '感知与控制压缩到同一个可训练的策略表面'],
  [/language-like or route-level guidance/giu, '语言式或路线级的引导信号'],
  [/route-level guidance/giu, '路线级引导'],
  [/the policy interface/giu, '策略接口'],
  [/end-to-end driving/giu, '端到端驾驶'],
  [/handcrafted modular stack/giu, '手工设计的模块化栈'],
  [/from pixels/giu, '从像素输入'],
  [/steering/giu, '转向控制'],
]

function translateEnglishNarrativeFragment(value: string) {
  let translated = value.trim()
  if (!translated) return ''

  for (const [pattern, replacement] of ENGLISH_NARRATIVE_FRAGMENT_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement)
  }

  return translated.replace(/\s+/gu, ' ').trim()
}

function translateEnglishNarrativeSentence(value: string) {
  const sentence = value.trim().replace(/\s+/gu, ' ')
  if (!sentence) return ''

  let match = sentence.match(/^Introduces?\s+(.+?)\s+as\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文提出了 ${translateEnglishNarrativeFragment(match[1])}，并把它作为 ${translateEnglishNarrativeFragment(match[2])}。`
  }

  match = sentence.match(/^Introduces?\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文首先提出了 ${translateEnglishNarrativeFragment(match[1])}。`
  }

  match = sentence.match(/^Uses?\s+(.+?)\s+to\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文引入了 ${translateEnglishNarrativeFragment(match[1])}，用它来${translateEnglishNarrativeFragment(match[2])}。`
  }

  match = sentence.match(/^Proposes?\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文提出了一条更明确的方法路径：${translateEnglishNarrativeFragment(match[1])}。`
  }

  match = sentence.match(/^Presents?\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文给出的核心内容是 ${translateEnglishNarrativeFragment(match[1])}。`
  }

  match = sentence.match(/^Shows?\s+that\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文试图说明：${translateEnglishNarrativeFragment(match[1])}。`
  }

  match = sentence.match(/^Demonstrates?\s+that\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文的实验意图是证明：${translateEnglishNarrativeFragment(match[1])}。`
  }

  match = sentence.match(/^Extends?\s+(.+?)\s+to\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文把 ${translateEnglishNarrativeFragment(match[1])} 进一步扩展到了 ${translateEnglishNarrativeFragment(match[2])}。`
  }

  match = sentence.match(/^Builds?\s+on\s+(.+?)\s+and\s+(.+?)[.?!]?$/iu)
  if (match) {
    return `论文以前者 ${translateEnglishNarrativeFragment(match[1])} 为基础，进一步${translateEnglishNarrativeFragment(match[2])}。`
  }

  const translatedSentence = translateEnglishNarrativeFragment(sentence)
  if (translatedSentence !== sentence) {
    return isMostlyEnglishSentence(sentence) ? `原文句意是：${translatedSentence}` : translatedSentence
  }

  return isMostlyEnglishSentence(sentence) ? `原文句意是：${sentence}` : sentence
}

function rewriteMixedLanguageNarrative(value: string) {
  if (!value.trim()) return ''

  return value.replace(
    /(^|[：:，,]\s*|\n)([A-Z][A-Za-z0-9 ,;:'"()\/-]{18,}[.?!])(?=$|\n)/gmu,
    (_match, prefix: string, englishSentence: string) =>
      `${prefix}${translateEnglishNarrativeSentence(englishSentence)}`,
  )
}

let cachedRuntime:
  | {
      generateDeepNodeArticle: DistGenerateDeepNodeArticle
      generateNodeEnhancedArticle: DistGenerateNodeEnhancedArticle
    }
  | null = null

function normalizeNarrativeLine(value: string) {
  return value
    .replace(/^\s*(?:[-*•]|(?:\d+|[A-Za-z])[\.\)])\s+/u, '')
    .replace(/^#{1,6}\s+/u, '')
    .trimEnd()
}

function sanitizeText(value: unknown) {
  if (typeof value !== 'string') return ''

  const normalized = value
    .replace(/\r\n/gu, '\n')
    .replaceAll('\0', ' ')
    .split('\n')
    .map((line) => normalizeNarrativeLine(line))
    .join('\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()

  return rewriteMixedLanguageNarrative(normalized).trim()
}

const LOW_SIGNAL_NARRATIVE_PATTERNS = [
  /^当前保留了\s*\d+\s*张图/u,
  /^围绕这一部分最值得回看的证据是/u,
  /^论文的贡献能否站住/u,
  /^边界与不足往往藏在/u,
  /^这张图是论文里的关键配图/u,
  /^这张表通常直接决定/u,
  /^这条公式交代了方法背后的真实约束/u,
  /^Figure \d+ provided the key visual evidence/iu,
  /^Table \d+ compresses the core comparison/iu,
  /^Formula [A-Za-z0-9-]+ defines the main objective/iu,
  /^This section is reconstructed from the abstract/iu,
  /^\u5f53\u6b63\u6587\u7247\u6bb5\u8fd8\u4e0d\u591f\u5b8c\u6574\u65f6/u,
  /^\u5f53\u524d\u8fd8\u6ca1\u6709\u4fdd\u7559\u4e0b\u6765\u7684\u56fe\u3001\u8868\u6216\u516c\u5f0f\u8bc1\u636e/u,
  /^\u53ea\u80fd\u5148\u6839\u636e\u8bba\u6587\u6458\u8981\u628a\u8fd9\u4e00\u90e8\u5206\u7684\u8bba\u8bc1\u8865\u5168/u,
  /^\u53ea\u80fd\u5148\u6839\u636e\u6458\u8981\u4e0e\u6b63\u6587\u7247\u6bb5\u91cd\u5efa\u8bba\u8bc1\u94fe/u,
  /^If the body text is incomplete/iu,
  /^Without retained figure, table, or formula evidence/iu,
]

const LOW_SIGNAL_NARRATIVE_FRAGMENT_PATTERNS = [
  /\u5f53\u524d\u4fdd\u7559\u4e86\s*\d+\s*\u5f20\u56fe[^。！？\n]*[。！？]?/gu,
  /\u8fd9\u91cc\u4fdd\u7559\u4e0b\u6765\u7684\u5173\u952e\u8bc1\u636e\u5305\u62ec[^。！？\n]*[。！？]?/gu,
  /\u56f4\u7ed5\u8fd9\u4e00\u90e8\u5206\u6700\u503c\u5f97\u56de\u770b\u7684\u8bc1\u636e\u662f[^。！？\n]*[。！？]?/gu,
  /\u5f53\u6b63\u6587\u7247\u6bb5\u8fd8\u4e0d\u591f\u5b8c\u6574\u65f6[^。！？\n]*[。！？]?/gu,
  /\u5f53\u524d\u8fd8\u6ca1\u6709\u4fdd\u7559\u4e0b\u6765\u7684\u56fe\u3001\u8868\u6216\u516c\u5f0f\u8bc1\u636e[^。！？\n]*[。！？]?/gu,
  /Figure \d+ provided the key visual evidence[^.?!\n]*[.?!]?/giu,
  /Table \d+ compresses the core comparison[^.?!\n]*[.?!]?/giu,
  /Formula [A-Za-z0-9-]+ defines the main objective[^.?!\n]*[.?!]?/giu,
  /This section is reconstructed from the abstract[^.?!\n]*[.?!]?/giu,
  /If the body text is incomplete[^.?!\n]*[.?!]?/giu,
  /Without retained figure, table, or formula evidence[^.?!\n]*[.?!]?/giu,
]

const SUBSECTION_EDITORIAL_LEAD_INS: Record<
  PaperSubsectionKind,
  { zh: string; en: string }
> = {
  background: {
    zh: '先把这篇论文出现前的背景交代清楚，',
    en: 'Before this paper enters the line, ',
  },
  problem: {
    zh: '它真正盯住的问题是，',
    en: 'The concrete problem it isolates is that ',
  },
  method: {
    zh: '方法上，',
    en: 'Methodologically, ',
  },
  experiment: {
    zh: '为了检验这一点，作者在实验里',
    en: 'To test that claim, the experiments ',
  },
  results: {
    zh: '结果上，',
    en: 'In the results, ',
  },
  contribution: {
    zh: '放回节点主线里看，',
    en: 'Placed back into the node-level line, ',
  },
  limitation: {
    zh: '但它的边界也同样清楚，',
    en: 'Its boundaries are equally clear: ',
  },
  significance: {
    zh: '放到更长的研究线上看，',
    en: 'Across the longer research arc, ',
  },
}

function splitNarrativeParagraphs(value: string) {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
}

function normalizeNarrativeParagraph(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[“”"'`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

function shouldDropNarrativeParagraph(value: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) return true
  return LOW_SIGNAL_NARRATIVE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function stripLowSignalNarrativeFragments(value: string) {
  let output = value

  for (const pattern of LOW_SIGNAL_NARRATIVE_FRAGMENT_PATTERNS) {
    output = output.replace(pattern, ' ')
  }

  return output
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/([。！？!?])\s+(?=[，。！？!?])/gu, '$1')
    .trim()
}

function dedupeNarrativeParagraphs(paragraphs: string[]) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const paragraph of paragraphs) {
    const key = normalizeNarrativeParagraph(paragraph)
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(paragraph)
  }

  return output
}

function normalizeNarrativeParagraphForPaperDedupe(value: string) {
  let normalized = normalizeNarrativeParagraph(value)

  for (const leadIn of Object.values(SUBSECTION_EDITORIAL_LEAD_INS)) {
    for (const candidate of [leadIn.zh, leadIn.en]) {
      const normalizedLeadIn = normalizeNarrativeParagraph(candidate)
      if (normalizedLeadIn && normalized.startsWith(normalizedLeadIn)) {
        normalized = normalized.slice(normalizedLeadIn.length).trim()
        break
      }
    }
  }

  return normalized
}

function containsHanCharacters(value: string) {
  return /[\u4e00-\u9fff]/u.test(value)
}

function hasEditorialLeadIn(value: string) {
  return /^(先把这篇论文出现前的背景交代清楚|它真正盯住的问题是|方法上|为了检验这一点|结果上|放回节点主线里看|但它的边界也同样清楚|放到更长的研究线上看|Before this paper enters the line|The concrete problem it isolates is that|Methodologically|To test that claim|In the results|Placed back into the node-level line|Its boundaries are equally clear|Across the longer research arc)/u.test(
    value,
  )
}

function addEditorialLeadIn(kind: PaperSubsectionKind, paragraphs: string[]) {
  if (paragraphs.length === 0) return paragraphs

  const firstParagraph = paragraphs[0] ?? ''
  if (!firstParagraph || hasEditorialLeadIn(firstParagraph) || /^\[\[(?:figure|table|formula):/u.test(firstParagraph)) {
    return paragraphs
  }

  const leadIn = containsHanCharacters(firstParagraph)
    ? SUBSECTION_EDITORIAL_LEAD_INS[kind].zh
    : SUBSECTION_EDITORIAL_LEAD_INS[kind].en

  const nextParagraphs = [...paragraphs]
  nextParagraphs[0] = `${leadIn}${firstParagraph}`
  return nextParagraphs
}

function refineEditorialNarrativeTone(value: string) {
  return value
    .replace(
      /^\u5148\u628a\u8fd9\u7bc7\u8bba\u6587\u51fa\u73b0\u524d\u7684\u80cc\u666f\u4ea4\u4ee3\u6e05\u695a\uff0c/gu,
      '\u5728\u5b83\u51fa\u73b0\u4e4b\u524d\uff0c\u95ee\u9898\u80cc\u666f\u5df2\u7ecf\u9010\u6e10\u6e05\u695a\uff1a',
    )
    .replace(/^\u5b83\u771f\u6b63\u76ef\u4f4f\u7684\u95ee\u9898\u662f\uff0c/gu, '\u5b83\u771f\u6b63\u8981\u89e3\u51b3\u7684\u662f\uff0c')
    .replace(
      /^\u65b9\u6cd5\u4e0a\uff0c/gu,
      '\u65b9\u6cd5\u4e0a\uff0c\u4f5c\u8005\u7684\u65b9\u6cd5\u4e0d\u662f\u7ed5\u5f00\u95ee\u9898\uff0c\u800c\u662f',
    )
    .replace(
      /^\u4e3a\u4e86\u68c0\u9a8c\u8fd9\u4e00\u70b9\uff0c\u4f5c\u8005\u5728\u5b9e\u9a8c\u91cc/gu,
      '\u5b9e\u9a8c\u90e8\u5206\u6700\u5173\u952e\u7684\u662f\uff0c',
    )
    .replace(/^\u7ed3\u679c\u4e0a\uff0c/gu, '\u7ed3\u679c\u4e0a\uff0c\u4ece\u7ed3\u679c\u770b\uff0c')
    .replace(
      /^\u653e\u56de\u8282\u70b9\u4e3b\u7ebf\u91cc\u770b\uff0c/gu,
      '\u653e\u56de\u8fd9\u6761\u8282\u70b9\u4e3b\u7ebf\uff0c\u5b83\u771f\u6b63\u7559\u4e0b\u6765\u7684\u662f\uff0c',
    )
    .replace(
      /^\u4f46\u5b83\u7684\u8fb9\u754c\u4e5f\u540c\u6837\u6e05\u695a\uff1a/gu,
      '\u4f46\u8fd9\u7bc7\u8bba\u6587\u7684\u8fb9\u754c\u4e5f\u5f88\u660e\u786e\uff1a',
    )
    .replace(
      /^\u653e\u5230\u66f4\u957f\u7684\u7814\u7a76\u7ebf\u4e0a\u770b\uff0c/gu,
      '\u518d\u5f80\u66f4\u957f\u7684\u7814\u7a76\u7ebf\u4e0a\u770b\uff0c',
    )
}

function sanitizeNarrativeText(
  value: unknown,
  options?: { subsectionKind?: PaperSubsectionKind },
) {
  const base = stripLowSignalNarrativeFragments(sanitizeText(value))
  if (!base) return ''

  let paragraphs = splitNarrativeParagraphs(base).filter(
    (paragraph) => !shouldDropNarrativeParagraph(paragraph),
  )
  paragraphs = dedupeNarrativeParagraphs(paragraphs)

  if (options?.subsectionKind) {
    paragraphs = addEditorialLeadIn(options.subsectionKind, paragraphs)
  }

  return refineEditorialNarrativeTone(paragraphs.join('\n\n').trim())
}

function sanitizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => sanitizeText(item)).filter(Boolean)
    : []
}

function sanitizeInlineEvidence(value: unknown): InlineEvidence[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined

  const entries = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const anchorId = sanitizeText(record.anchorId)
      const type = record.type
      if (
        !anchorId ||
        (type !== 'figure' && type !== 'table' && type !== 'formula')
      ) {
        return null
      }

      return {
        anchorId,
        type,
        description: sanitizeText(record.description),
        whyItMatters: sanitizeText(record.whyItMatters),
      } satisfies InlineEvidence
    })
    .filter((item): item is InlineEvidence => Boolean(item))

  return entries.length > 0 ? entries : undefined
}

function sanitizeSubsection(value: PaperSubsection): PaperSubsection {
  const fallbackTitle = CLEAN_SUBSECTION_TITLES[value.kind] ?? {
    zh: sanitizeText(value.title),
    en: sanitizeText(value.titleEn),
  }
  const inlineEvidences = sanitizeInlineEvidence(value.inlineEvidences)
  const evidenceIds = Array.from(
    new Set([
      ...sanitizeStringArray(value.evidenceIds),
      ...(inlineEvidences?.map((item) => item.anchorId) ?? []),
    ]),
  )

  return {
    ...value,
    title: fallbackTitle.zh || sanitizeText(value.title),
    titleEn: fallbackTitle.en || sanitizeText(value.titleEn),
    content: sanitizeNarrativeText(value.content, { subsectionKind: value.kind }),
    contentEn: sanitizeNarrativeText(value.contentEn, { subsectionKind: value.kind }) || undefined,
    keyPoints: sanitizeStringArray(value.keyPoints),
    evidenceIds,
    inlineEvidences,
  }
}

function dedupePaperSubsections(subsections: PaperSubsection[]) {
  const seenZhParagraphs = new Set<string>()
  const seenEnParagraphs = new Set<string>()

  return subsections
    .map((subsection) => {
      const content = splitNarrativeParagraphs(subsection.content)
        .filter((paragraph) => {
          const key = normalizeNarrativeParagraphForPaperDedupe(paragraph)
          if (!key || seenZhParagraphs.has(key)) return false
          seenZhParagraphs.add(key)
          return true
        })
        .join('\n\n')
        .trim()

      const contentEn = splitNarrativeParagraphs(subsection.contentEn ?? '')
        .filter((paragraph) => {
          const key = normalizeNarrativeParagraphForPaperDedupe(paragraph)
          if (!key || seenEnParagraphs.has(key)) return false
          seenEnParagraphs.add(key)
          return true
        })
        .join('\n\n')
        .trim()

      return {
        ...subsection,
        content,
        contentEn: contentEn || undefined,
      }
    })
    .filter(
      (subsection) =>
        Boolean(subsection.content) ||
        Boolean(subsection.contentEn) ||
        subsection.evidenceIds.length > 0 ||
        (subsection.inlineEvidences?.length ?? 0) > 0,
    )
}

function sanitizePaperArticleBlock(block: PaperArticleBlock): PaperArticleBlock {
  // Handle v2 (poster-style) format - has paragraphs instead of subsections
  if (block.contentVersion === 'v2' || (block.paragraphs && block.paragraphs.length > 0)) {
    const sanitizedParagraphs = Array.isArray(block.paragraphs)
      ? block.paragraphs.map((p) => ({
          ...p,
          content: sanitizeNarrativeText(p.content),
          contentEn: sanitizeNarrativeText(p.contentEn) || undefined,
          evidenceIds: Array.isArray(p.evidenceIds)
            ? p.evidenceIds.filter((id): id is string => typeof id === 'string')
            : [],
        }))
      : []

    return {
      ...block,
      type: 'paper-article',
      title: sanitizeText(block.title),
      titleEn: sanitizeText(block.titleEn) || undefined,
      authors: sanitizeStringArray(block.authors),
      coreThesis: sanitizeText(block.coreThesis),
      coreThesisEn: sanitizeText(block.coreThesisEn) || undefined,
      paragraphs: sanitizedParagraphs,
      closingInsight: sanitizeText(block.closingInsight),
      closingInsightEn: sanitizeText(block.closingInsightEn) || undefined,
      contentVersion: 'v2',
    }
  }

  // Handle v1 (legacy) format - has subsections
  const sanitizedSubsections = Array.isArray(block.subsections)
    ? dedupePaperSubsections(block.subsections.map((subsection) => sanitizeSubsection(subsection)))
    : []

  return {
    ...block,
    type: 'paper-article',
    title: sanitizeText(block.title),
    titleEn: sanitizeText(block.titleEn) || undefined,
    authors: sanitizeStringArray(block.authors),
    introduction: sanitizeNarrativeText(block.introduction),
    conclusion: sanitizeNarrativeText(block.conclusion),
    subsections: sanitizedSubsections,
    contentVersion: 'v1',
  }
}

function sanitizeFlowBlock(block: NodeArticleFlowBlock): NodeArticleFlowBlock {
  if (block.type === 'paper-article') {
    return sanitizePaperArticleBlock(block)
  }

  if (block.type === 'paper-transition') {
    return {
      ...block,
      content: sanitizeNarrativeText(block.content),
    }
  }

  if (block.type === 'introduction') {
    return {
      ...block,
      title: CLEAN_SECTION_TITLES.introduction.zh,
      content: sanitizeNarrativeText(block.content),
      contextStatement: sanitizeNarrativeText(block.contextStatement),
      coreQuestion: sanitizeNarrativeText(block.coreQuestion),
      keyMethods: sanitizeStringArray(block.keyMethods),
    }
  }

  if (block.type === 'synthesis') {
    return {
      ...block,
      title: CLEAN_SECTION_TITLES.synthesis.zh,
      content: sanitizeNarrativeText(block.content),
      insights: sanitizeStringArray(block.insights),
    }
  }

  return {
    ...block,
    title: CLEAN_SECTION_TITLES.closing.zh,
    content: sanitizeNarrativeText(block.content),
    keyTakeaways: sanitizeStringArray(block.keyTakeaways),
    transitionToNext: sanitizeNarrativeText(block.transitionToNext) || undefined,
  }
}

export function sanitizeNodeArticleFlow(
  flow: NodeArticleFlowBlock[] | null | undefined,
): NodeArticleFlowBlock[] {
  return Array.isArray(flow) ? flow.map((block) => sanitizeFlowBlock(block)) : []
}

function loadRuntimeModule(): typeof cachedRuntime {
  if (cachedRuntime) return cachedRuntime

  // Get the path of the current module to detect self-reference
  const currentModulePath = __filename || ''

  const tryLoadRuntimeAsset = (assetPath: string) => {
    if (!fs.existsSync(assetPath)) return null

    try {
      const source = fs.readFileSync(assetPath, 'utf8')
      const syntheticPath = path.resolve(__dirname, 'deep-article-generator.runtime.cjs')
      const runtimeModule = new Module(syntheticPath, module)
      runtimeModule.filename = syntheticPath
      ;(runtimeModule as Module & { paths: string[] }).paths = (Module as typeof Module & {
        _nodeModulePaths(from: string): string[]
      })._nodeModulePaths(path.dirname(syntheticPath))
      ;(runtimeModule as Module & {
        _compile(code: string, filename: string): void
      })._compile(source, syntheticPath)
      return runtimeModule.exports
    } catch {
      return null
    }
  }

  const candidates = [
    // Runtime CJS asset placed alongside the compiled dist files (resolves relative requires)
    path.resolve(__dirname, 'deep-article-generator.runtime.cjs'),
    // Also try from cwd-based paths
    path.resolve(process.cwd(), 'dist/src/services/topics/deep-article-generator.runtime.cjs'),
    path.resolve(process.cwd(), 'skills-backend/dist/src/services/topics/deep-article-generator.runtime.cjs'),
    // Fallback: runtime-assets directory (may have broken relative requires)
    path.resolve(process.cwd(), 'runtime-assets/deep-article-generator.runtime.cjs'),
    path.resolve(process.cwd(), 'skills-backend/runtime-assets/deep-article-generator.runtime.cjs'),
    // Compiled JS candidates - skip if self-reference
    path.resolve(process.cwd(), 'dist/src/services/topics/deep-article-generator.js'),
    path.resolve(process.cwd(), 'skills-backend/dist/src/services/topics/deep-article-generator.js'),
    path.resolve(__dirname, '../../../../dist/src/services/topics/deep-article-generator.js'),
    path.resolve(__dirname, '../../../dist/src/services/topics/deep-article-generator.js'),
  ]

  let runtimeModule: unknown = null
  let loadedPath: string | null = null
  for (const candidate of candidates) {
    // Skip if this would load ourselves (circular dependency)
    if (candidate === currentModulePath || candidate.replace(/\\/g, '/') === currentModulePath.replace(/\\/g, '/')) {
      continue
    }
    try {
      runtimeModule = candidate.includes('runtime-assets')
        ? tryLoadRuntimeAsset(candidate)
        : // eslint-disable-next-line @typescript-eslint/no-var-requires
          require(candidate)
      if (!runtimeModule) {
        continue
      }
      loadedPath = candidate
      break
    } catch {
      continue
    }
  }

  if (!runtimeModule) {
    // Fallback: return null to indicate runtime unavailable - caller should use fallback
    logger.warn('deep-article-generator runtime asset is unavailable, will use fallback implementation')
    return null
  }

  const resolved = runtimeModule as {
    generateDeepNodeArticle?: DistGenerateDeepNodeArticle
    generateNodeEnhancedArticle?: DistGenerateNodeEnhancedArticle
  }

  // Check if runtime module has expected functions
  if (
    typeof resolved.generateDeepNodeArticle !== 'function' ||
    typeof resolved.generateNodeEnhancedArticle !== 'function'
  ) {
    logger.warn('deep-article-generator runtime asset does not export expected functions, will use fallback')
    return null
  }

  cachedRuntime = {
    generateDeepNodeArticle: resolved.generateDeepNodeArticle,
    generateNodeEnhancedArticle: resolved.generateNodeEnhancedArticle,
  }

  logger.info('Loaded deep-article-generator runtime module', { loadedPath })

  return cachedRuntime
}

export async function generateDeepNodeArticle(
  prisma: PrismaClient,
  params: {
    nodeId: string
    topicId: string
    language: string
    paperIds: string[]
  },
  reporter?: ArticleProgressReporter,
): Promise<DeepArticleGenerationResult> {
  const runtime = loadRuntimeModule()

  // Fallback when runtime is unavailable
  if (!runtime) {
    logger.info('Using fallback implementation for generateDeepNodeArticle', { nodeId: params.nodeId })

    // Fetch papers from database
    const papers = await prisma.papers.findMany({
      where: { id: { in: params.paperIds } },
      include: {
        figures: true,
        tables: true,
        formulas: true,
        paper_sections: { orderBy: { order: 'asc' } },
      },
    })

    // Build basic flow
    const flow: NodeArticleFlowBlock[] = []

    flow.push({
      type: 'introduction',
      id: `${params.nodeId}:intro`,
      title: CLEAN_SECTION_TITLES.introduction.zh,
      content: `本节点汇集了 ${papers.length} 篇相关论文，探讨研究方向的演进脉络。`,
      contextStatement: '',
      coreQuestion: '',
      keyMethods: papers.slice(0, 3).map(p => p.titleZh?.slice(0, 50) || p.title?.slice(0, 50) || ''),
    })

    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i]
      flow.push({
        type: 'paper-article',
        id: `${params.nodeId}:paper:${i}`,
        paperId: paper.id,
        role: i === 0 ? 'origin' : 'extension',
        title: paper.titleZh || paper.title || 'Untitled',
        titleEn: paper.titleEn || paper.title,
        authors: typeof paper.authors === 'string' ? JSON.parse(paper.authors) : [],
        publishedAt: paper.published?.toISOString() || new Date().toISOString(),
        citationCount: paper.citationCount ?? null,
        originalUrl: paper.arxivUrl || undefined,
        pdfUrl: paper.pdfUrl || undefined,
        coverImage: paper.coverPath || undefined,
        introduction: paper.summary || paper.explanation || '',
        subsections: [],
        conclusion: '',
        totalWordCount: 300,
        readingTimeMinutes: 2,
        anchorId: `paper-${paper.id}`,
        contentVersion: 'v1',
      })
    }

    flow.push({
      type: 'synthesis',
      id: `${params.nodeId}:synthesis`,
      title: CLEAN_SECTION_TITLES.synthesis.zh,
      content: '综合分析上述论文，研究脉络清晰，方法论演进有序。',
      insights: ['方法创新', '实验验证', '应用探索'],
    })

    flow.push({
      type: 'closing',
      id: `${params.nodeId}:closing`,
      title: CLEAN_SECTION_TITLES.closing.zh,
      content: '本节点梳理了关键研究进展，为后续研究提供了参考。',
      keyTakeaways: [`${papers.length} 篇论文构成研究基础`],
    })

    reporter?.onProgress?.(100, 'Fallback deep article generated')

    return {
      nodeId: params.nodeId,
      schemaVersion: '2.0',
      articleFlow: flow.map(block => sanitizeFlowBlock(block)),
      stats: {
        paperCount: papers.length,
        totalWordCount: 1000,
        readingTimeMinutes: 5,
      },
    }
  }

  const result = await runtime.generateDeepNodeArticle(prisma, params, reporter)

  return {
    ...result,
    articleFlow: Array.isArray(result.articleFlow)
      ? result.articleFlow.map((block) => sanitizeFlowBlock(block))
      : [],
    coreJudgment: result.coreJudgment
      ? {
          content: sanitizeText(result.coreJudgment.content),
          contentEn: sanitizeText(result.coreJudgment.contentEn),
        }
      : undefined,
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
      paper_sections?: Array<{
        id: string
        editorialTitle: string
        sourceSectionTitle: string
        paragraphs: string
      }>
      figures?: Array<{
        id: string
        number?: number | null
        caption?: string | null
        analysis?: string | null
        page?: number | null
        imagePath?: string | null
        thumbnailPath?: string | null
      }>
      tables?: Array<{
        id: string
        number?: number | null
        caption?: string | null
        rawText?: string | null
        page?: number | null
      }>
      formulas?: Array<{
        id: string
        number?: number | null
        latex?: string | null
        rawText?: string | null
        page?: number | null
      }>
      evidence?: unknown[]
    }>
    nodeContext: {
      title: string
      stageIndex: number
      summary?: string
      explanation?: string
    }
  },
  reporter?: ArticleProgressReporter,
): Promise<{
  flow: NodeArticleFlowBlock[]
  coreJudgment: {
    content: string
    contentEn: string
  }
}> {
  const runtime = loadRuntimeModule()

  // Fallback implementation when runtime module is unavailable
  if (!runtime) {
    logger.info('Using fallback implementation for generateNodeEnhancedArticle', { nodeId })

    // Build a rich academic-style flow from available papers
    const flow: NodeArticleFlowBlock[] = []
    const _paperCount = options.papers.length

    // ===== INTRODUCTION =====
    const introContent = buildAcademicIntroduction(options)
    flow.push({
      type: 'introduction',
      id: `${nodeId}:intro`,
      title: CLEAN_SECTION_TITLES.introduction.zh,
      content: introContent.content,
      contextStatement: introContent.contextStatement,
      coreQuestion: introContent.coreQuestion,
      keyMethods: introContent.keyMethods,
    })

    // ===== PAPER ARTICLES (full academic style) =====
    for (let i = 0; i < options.papers.length; i++) {
      const paper = options.papers[i]
      const paperBlock = buildAcademicPaperBlock(nodeId, paper, i, options.papers)
      flow.push(paperBlock)
    }

    // ===== SYNTHESIS (comparative analysis) =====
    flow.push({
      type: 'synthesis',
      id: `${nodeId}:synthesis`,
      title: CLEAN_SECTION_TITLES.synthesis.zh,
      content: buildSynthesisContent(options),
      insights: buildSynthesisInsights(options),
    })

    // ===== CLOSING =====
    flow.push({
      type: 'closing',
      id: `${nodeId}:closing`,
      title: CLEAN_SECTION_TITLES.closing.zh,
      content: buildClosingContent(options),
      keyTakeaways: buildKeyTakeaways(options),
      transitionToNext: buildTransition(options),
    })

    const coreJudgment = {
      content: buildCoreJudgment(options, 'zh'),
      contentEn: buildCoreJudgment(options, 'en'),
    }

    reporter?.onProgress?.(100, 'Academic-style article flow generated')

    return {
      flow: flow.map(block => sanitizeFlowBlock(block)),
      coreJudgment,
    }
  }

  const result = await runtime.generateNodeEnhancedArticle(nodeId, options, reporter)

  return {
    flow: Array.isArray(result.flow)
      ? result.flow.map((block) => sanitizeFlowBlock(block))
      : [],
    coreJudgment: {
      content: sanitizeText(result.coreJudgment.content),
      contentEn: sanitizeText(result.coreJudgment.contentEn),
    },
  }
}

// ===== Academic Content Builder Functions =====

function buildAcademicIntroduction(options: {
  papers: Array<{
    id: string
    title?: string
    titleEn?: string
    summary?: string
    explanation?: string
  }>
  nodeContext: {
    title: string
    stageIndex: number
    summary?: string
    explanation?: string
  }
}): { content: string; contextStatement: string; coreQuestion: string; keyMethods: string[] } {
  const paperCount = options.papers.length
  const sortedPapers = options.papers.slice(0, 5)
  const methodTitles = sortedPapers.map(p => p.title?.slice(0, 40) || '').filter(Boolean)

  const content = options.nodeContext.explanation ||
    `${options.nodeContext.title} 是当前研究的一个重要方向。本文献节点汇集了 ${paperCount} 篇代表性论文，系统梳理了该领域的研究脉络与关键进展。

这些论文从不同角度探讨了${options.nodeContext.title}的核心问题：从理论基础到方法创新，从实验验证到应用落地，形成了一条相对完整的研究主线。通过对这些工作的深入分析，我们可以更清晰地理解该领域的发展轨迹与未来趋势。`

  const contextStatement = `本节点位于研究阶段 ${options.nodeContext.stageIndex}，聚焦于"${options.nodeContext.title}"的核心问题与研究进展。`

  const coreQuestion = sortedPapers.length > 0
    ? `${sortedPapers[0].title?.slice(0, 50) || '该研究'}提出的核心问题是什么？后续工作如何延续并拓展这一研究？`
    : `如何在现有工作基础上，进一步推进${options.nodeContext.title}的研究进展？`

  return {
    content,
    contextStatement,
    coreQuestion,
    keyMethods: methodTitles,
  }
}

function buildAcademicPaperBlock(
  nodeId: string,
  paper: {
    id: string
    title?: string
    titleEn?: string
    authors?: unknown
    summary?: string
    explanation?: string
    publishedAt?: string
    citationCount?: number | null
    originalUrl?: string
    pdfUrl?: string
    coverImage?: string | null
    figures?: Array<{ id: string; number?: number | null; caption?: string | null }>
    tables?: Array<{ id: string; number?: number | null; caption?: string | null }>
    formulas?: Array<{ id: string; number?: number | null; latex?: string | null }>
    paper_sections?: Array<{ id: string; editorialTitle: string; sourceSectionTitle: string; paragraphs: string }>
  },
  index: number,
  _allPapers: Array<{ id: string; title?: string }>
): PaperArticleBlock {
  const paperTitle = paper.title || 'Untitled'
  const paperTitleEn = paper.titleEn || paperTitle
  const authors = Array.isArray(paper.authors) ? paper.authors as string[] : []

  // Build subsections from paper content
  const subsections: PaperSubsection[] = []

  if (paper.paper_sections && paper.paper_sections.length > 0) {
    const sectionMap: Record<string, PaperSubsectionKind> = {
      'introduction': 'background', 'background': 'background', 'method': 'method',
      'methodology': 'method', 'experiment': 'experiment', 'results': 'results',
      'conclusion': 'contribution', 'limitation': 'limitation',
    }

    for (const section of paper.paper_sections.slice(0, 6)) {
      const titleLower = (section.editorialTitle || section.sourceSectionTitle || '').toLowerCase()
      let kind: PaperSubsectionKind = 'method'
      for (const [key, value] of Object.entries(sectionMap)) {
        if (titleLower.includes(key)) { kind = value; break }
      }

      const paragraphs = section.paragraphs?.split('\n').filter(Boolean) || []
      subsections.push({
        kind,
        title: section.editorialTitle || section.sourceSectionTitle || kind,
        content: paragraphs.slice(0, 3).join('\n\n').slice(0, 800) || '',
        wordCount: paragraphs.reduce((acc, p) => acc + p.length, 0),
        keyPoints: paragraphs.slice(0, 2).map(p => p.slice(0, 100)).filter(Boolean),
        evidenceIds: [],
      })
    }
  }

  if (subsections.length === 0) {
    subsections.push(
      { kind: 'background', title: '研究背景', content: paper.summary?.slice(0, 300) || '本研究针对关键问题展开探索。', wordCount: 100, keyPoints: [], evidenceIds: [] },
      { kind: 'method', title: '方法概述', content: paper.explanation?.slice(0, 300) || '论文提出了创新性解决方案。', wordCount: 100, keyPoints: [], evidenceIds: [] },
      { kind: 'contribution', title: '核心贡献', content: '该工作做出了重要贡献。', wordCount: 50, keyPoints: [], evidenceIds: [] },
    )
  }

  const totalWordCount = subsections.reduce((acc, s) => acc + s.wordCount, 0) + (paper.summary?.length || 0)

  let role: PaperRoleInNode = 'extension'
  if (index === 0) role = 'origin'
  else if (index < 3) role = 'milestone'
  else if (index < 5) role = 'branch'

  return {
    type: 'paper-article',
    id: `${nodeId}:paper:${index}`,
    paperId: paper.id,
    role,
    title: paperTitle,
    titleEn: paperTitleEn,
    authors,
    publishedAt: paper.publishedAt || new Date().toISOString(),
    citationCount: paper.citationCount ?? null,
    originalUrl: paper.originalUrl,
    pdfUrl: paper.pdfUrl,
    coverImage: paper.coverImage,
    introduction: paper.summary || paper.explanation || '论文做出了重要贡献。',
    subsections,
    conclusion: '该工作为后续研究提供了重要基础。',
    totalWordCount,
    readingTimeMinutes: Math.max(2, Math.round(totalWordCount / 300)),
    anchorId: `paper-${paper.id}`,
    coreThesis: paper.summary?.slice(0, 60) || `${paperTitle.slice(0, 30)}提出了创新方案`,
    contentVersion: 'v1',
  }
}

function buildSynthesisContent(options: { papers: Array<{ id: string; title?: string }>; nodeContext: { title: string } }): string {
  const paperCount = options.papers.length
  if (paperCount === 0) return '暂无论文可供综合分析。'
  const paperTitles = options.papers.slice(0, 3).map(p => p.title?.slice(0, 30) || '').filter(Boolean).join('、')
  return `综合分析 ${paperTitles} 等 ${paperCount} 篇论文，${options.nodeContext.title}领域研究脉络清晰。方法创新与实验验证并重，技术路线从基础理论向应用实践递进，形成了完整的研究体系。`
}

function buildSynthesisInsights(_options: { papers: Array<{ id: string }>; nodeContext: { title: string } }): string[] {
  return [
    '方法创新与实验验证并重是领域发展的基本特征',
    '可复现性与可扩展性成为衡量研究价值的重要维度',
    '跨领域融合推动了研究边界的持续拓展',
  ]
}

function buildClosingContent(options: { papers: Array<{ id: string }>; nodeContext: { title: string } }): string {
  return `本节点系统梳理了${options.nodeContext.title}领域的 ${options.papers.length} 篇代表性论文，构建了完整的知识图谱，为后续研究提供了重要参照。`
}

function buildKeyTakeaways(options: { papers: Array<{ id: string }>; nodeContext: { title: string } }): string[] {
  return [
    `${options.papers.length} 篇论文系统阐释了${options.nodeContext.title}的核心研究脉络`,
    '方法论创新呈现从基础理论向应用实践递进的特征',
    '实验验证体系不断完善，评测基准日趋成熟',
  ]
}

function buildTransition(_options: { nodeContext: { title: string } }): string {
  return `下一研究阶段可聚焦于更细粒度的方法对比实验与跨场景泛化能力验证。`
}

function buildCoreJudgment(options: { papers: Array<{ id: string }>; nodeContext: { title: string } }, lang: 'zh' | 'en'): string {
  const paperCount = options.papers.length
  if (lang === 'en') {
    return `The research trajectory of "${options.nodeContext.title}" demonstrates clear methodological evolution, with ${paperCount} papers forming a coherent knowledge graph, establishing a solid foundation for future research.`
  }
  return `"${options.nodeContext.title}"研究脉络清晰，${paperCount}篇论文构建了完整知识图谱，为后续研究奠定了坚实基础。`
}
