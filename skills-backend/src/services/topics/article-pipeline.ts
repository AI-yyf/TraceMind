import { runStructuredGenerationPass } from '../generation/orchestrator'
import { PROMPT_TEMPLATE_IDS } from '../generation/prompt-registry'

export interface PipelineCritique {
  summary: string
  bullets: string[]
}

export interface NodePaperPass {
  paperId: string
  role: string
  contribution: string
  body: string[]
}

export interface NodeComparisonPass {
  title: string
  summary: string
  points: Array<{
    label: string
    detail: string
  }>
}

export interface NodeSynthesisPass {
  headline: string
  standfirst: string
  lead: string[]
  evidence: string[]
  closing: string[]
}

export interface PaperStoryPass {
  standfirst: string
  sections: Array<{
    title: string
    body: string[]
  }>
  closing: string[]
}

type SubjectType = 'node' | 'paper' | 'evidence'
const ARTICLE_GUIDANCE_RULE =
  'Treat accepted guidance as durable user calibration. Let it steer emphasis, structure, and caveats when the evidence supports it. Do not pretend the topic was already rewritten elsewhere; make this draft reflect the adjustment now and state what still stands or remains unresolved.'

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pickFirstText(...values: Array<unknown>) {
  for (const value of values) {
    const normalized = clipText(asString(value), 220)
    if (normalized) return normalized
  }
  return ''
}

function uniqueStrings(values: string[], limit = 6) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value.replace(/\s+/gu, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function sanitizeStringArray(values: unknown[], limit = 6, maxLength = 180) {
  return uniqueStrings(
    values
      .map((value) => clipText(asString(value), maxLength))
      .filter(Boolean),
    limit,
  )
}

function sanitizeMemoryLane(
  values: unknown[],
  limit = 4,
  maxLength = 180,
) {
  return uniqueStrings(
    values
      .map((value) => asRecord(value))
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .map((item) => {
        const title = clipText(asString(item.title), 72)
        const summary = clipText(asString(item.summary), maxLength)
        if (title && summary) return `${title}: ${summary}`
        return summary || title
      })
      .filter(Boolean),
    limit,
  )
}

function buildArticleAuthorBrief(researchPipelineContext?: Record<string, unknown>) {
  if (!researchPipelineContext) return null

  const guidance = asRecord(researchPipelineContext.guidance)
  const guidanceSummary = asRecord(guidance?.summary)
  const latestApplication = asRecord(guidance?.latestApplication)
  const cognitiveMemory = asRecord(researchPipelineContext.cognitiveMemory)
  const sessionMemory = asRecord(researchPipelineContext.sessionMemory)
  const currentStage = asRecord(researchPipelineContext.currentStage)
  const lastRun = asRecord(researchPipelineContext.lastRun)
  const subjectFocus = asRecord(researchPipelineContext.subjectFocus)

  const activeDirectives = asArray(guidance?.activeDirectives)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((directive) => ({
      directiveType: clipText(asString(directive.directiveType), 40) || 'guidance',
      scopeLabel: clipText(asString(directive.scopeLabel), 80) || 'current topic',
      summary: pickFirstText(
        directive.effectSummary,
        directive.instruction,
        directive.promptHint,
      ),
      promptHint: clipText(asString(directive.promptHint), 180),
      appliesToRuns: clipText(asString(directive.appliesToRuns), 40) || 'next-run',
      status: clipText(asString(directive.status), 32) || 'accepted',
    }))
    .filter((directive) => directive.summary)
    .slice(0, 4)

  const latestGuidanceDirectives = sanitizeStringArray(
    asArray(latestApplication?.directives).map((item) => {
      const directive = asRecord(item)
      if (!directive) return ''
      return [
        clipText(asString(directive.directiveType), 32),
        clipText(asString(directive.scopeLabel), 72),
        clipText(asString(directive.note), 140),
      ]
        .filter(Boolean)
        .join(' / ')
    }),
    4,
    180,
  )

  const projectMemories = sanitizeMemoryLane(
    asArray(cognitiveMemory?.projectMemories),
    4,
    180,
  )
  const feedbackMemories = sanitizeMemoryLane(
    asArray(cognitiveMemory?.feedbackMemories),
    4,
    180,
  )
  const referenceMemories = sanitizeMemoryLane(
    asArray(cognitiveMemory?.referenceMemories),
    4,
    180,
  )

  const pipelineSignals = sanitizeStringArray(
    [
      currentStage?.stageSummary,
      lastRun?.stageSummary,
      ...asArray(currentStage?.openQuestions),
      ...asArray(lastRun?.openQuestions),
      ...asArray(researchPipelineContext.continuityThreads),
      ...asArray(researchPipelineContext.globalOpenQuestions),
      ...asArray(subjectFocus?.relatedNodeActions),
      ...asArray(sessionMemory?.researchMomentum),
    ],
    6,
    200,
  )

  const openQuestions = sanitizeStringArray(
    [
      ...asArray(sessionMemory?.openQuestions),
      ...asArray(currentStage?.openQuestions),
      ...asArray(lastRun?.openQuestions),
      ...asArray(researchPipelineContext.globalOpenQuestions),
    ],
    6,
    180,
  )

  const focus = pickFirstText(
    cognitiveMemory?.focus,
    sessionMemory?.currentFocus,
    guidanceSummary?.focusHeadline,
    currentStage?.stageSummary,
    lastRun?.stageSummary,
    projectMemories[0],
    feedbackMemories[0],
  )

  const continuity = pickFirstText(
    cognitiveMemory?.continuity,
    sessionMemory?.continuity,
    guidanceSummary?.latestAppliedSummary,
    pipelineSignals[0],
    feedbackMemories[0],
    focus,
  )

  const conversationContract = pickFirstText(
    cognitiveMemory?.conversationContract,
    sessionMemory?.conversationStyle,
  )

  if (
    !focus &&
    !continuity &&
    activeDirectives.length === 0 &&
    projectMemories.length === 0 &&
    feedbackMemories.length === 0 &&
    referenceMemories.length === 0 &&
    pipelineSignals.length === 0 &&
    openQuestions.length === 0
  ) {
    return null
  }

  return {
    focus,
    continuity,
    conversationContract,
    guidanceRule: ARTICLE_GUIDANCE_RULE,
    activeDirectives,
    latestGuidanceApplication: {
      summary: pickFirstText(latestApplication?.summary, guidanceSummary?.latestAppliedSummary),
      appliedAt: clipText(asString(latestApplication?.appliedAt), 48) || null,
      stageIndex: asNumber(latestApplication?.stageIndex),
      directives: latestGuidanceDirectives,
    },
    openQuestions,
    pipelineSignals,
    projectMemories,
    feedbackMemories,
    referenceMemories,
  }
}

function sanitizeParagraphs(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback
  const next = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return next.length > 0 ? next : fallback
}

function sanitizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function paperRoleLabel(index: number, isPrimary: boolean) {
  if (isPrimary) return '主线论文'
  if (index === 1) return '补强论文'
  if (index === 2) return '横向对照'
  return '延展论文'
}

function normalizeTopicId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeSubjectId(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeIsoDate(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) return value
  return new Date().toISOString()
}

function mergeMemoryContext(
  baseContext: Record<string, unknown>,
  researchPipelineContext?: Record<string, unknown>,
) {
  if (!researchPipelineContext) return baseContext
  const authorBrief = buildArticleAuthorBrief(researchPipelineContext)
  return {
    ...baseContext,
    ...(authorBrief ? { authorBrief } : {}),
    researchPipeline: researchPipelineContext,
  }
}

function summarizePaper(paper: any) {
  return {
    paperId: paper.id,
    title: paper.titleZh || paper.title,
    titleEn: paper.titleEn ?? paper.title,
    publishedAt: normalizeIsoDate(paper.published),
    summary: clipText(paper.summary, 280),
    explanation: clipText(paper.explanation ?? paper.summary, 320),
    figures: Array.isArray(paper.figures) ? paper.figures.map((item: any) => clipText(item.caption, 140)).slice(0, 4) : [],
    tables: Array.isArray(paper.tables) ? paper.tables.map((item: any) => clipText(item.caption, 140)).slice(0, 3) : [],
    formulas: Array.isArray(paper.formulas)
      ? paper.formulas.map((item: any) => clipText(item.rawText || item.latex, 140)).slice(0, 3)
      : [],
  }
}

async function requestPipelineOutput<T>({
  topicId,
  subjectType,
  subjectId,
  templateId,
  userPayload,
  fallback,
  outputContract,
  memoryContext,
  maxTokens = 1800,
  summaryHint,
}: {
  topicId: string
  subjectType: SubjectType
  subjectId: string
  templateId: (typeof PROMPT_TEMPLATE_IDS)[keyof typeof PROMPT_TEMPLATE_IDS]
  userPayload: Record<string, unknown>
  fallback: T
  outputContract: string
  memoryContext?: Record<string, unknown>
  maxTokens?: number
  summaryHint?: string
}): Promise<T> {
  const result = await runStructuredGenerationPass<T>({
    topicId,
    subjectType,
    subjectId,
    templateId,
    input: userPayload,
    memoryContext,
    fallback,
    outputContract,
    maxTokens,
    summaryHint,
  })

  return result.output
}

export async function generateNodePaperPasses(
  papers: any[],
  primaryPaperId: string,
  researchPipelineContext?: Record<string, unknown>,
) {
  const topicId = normalizeTopicId(papers[0]?.topicId)
  const paperSummaries = papers.map((paper) => summarizePaper(paper))

  return Promise.all(
    papers.map(async (paper, index) => {
      const fallback: NodePaperPass = {
        paperId: paper.id,
        role: paperRoleLabel(index, paper.id === primaryPaperId),
        contribution: clipText(paper.explanation ?? paper.summary, 120),
        body: [
          clipText(paper.summary, 180),
          clipText(paper.explanation ?? paper.summary, 220),
          `证据重心：${paper.figures.length} 张图、${paper.tables.length} 张表、${paper.formulas.length} 个公式。`,
        ],
      }

      if (!topicId) return fallback

      const response = await requestPipelineOutput<Partial<NodePaperPass>>({
        topicId,
        subjectType: 'paper',
        subjectId: `${paper.id}:node-pass`,
        templateId: PROMPT_TEMPLATE_IDS.ARTICLE_NODE,
        userPayload: {
          mode: 'paper-pass',
          paper: summarizePaper(paper),
          paperIndex: index,
          paperCount: papers.length,
          primaryPaperId,
        },
        memoryContext: mergeMemoryContext(
          {
            papers: paperSummaries,
            primaryPaperId,
          },
          researchPipelineContext,
        ),
        fallback,
        outputContract: '{"paperId":"","role":"","contribution":"","body":["","",""]}',
        maxTokens: 1300,
        summaryHint: fallback.contribution,
      })

      return {
        paperId: paper.id,
        role: sanitizeString(response.paperId ? response.role : response.role, fallback.role),
        contribution: sanitizeString(response.contribution, fallback.contribution),
        body: sanitizeParagraphs(response.body, fallback.body),
      } satisfies NodePaperPass
    }),
  )
}

export async function generateNodeComparisonPass(
  node: any,
  papers: any[],
  paperPasses: NodePaperPass[],
  researchPipelineContext?: Record<string, unknown>,
) {
  if (papers.length <= 1) {
    return {
      title: '单篇论文节点',
      summary: '当前节点主要由一篇论文支撑，跨论文比较还没有真正展开。',
      points: [
        {
          label: '当前状态',
          detail: '节点目前仍然依赖单篇论文的论证，后续最好补入补强或对照工作。',
        },
        {
          label: '阅读重点',
          detail: '先把这篇论文的问题、方法、证据与边界看清，再判断节点是否已经足以成立。',
        },
      ],
    } satisfies NodeComparisonPass
  }

  const fallback: NodeComparisonPass = {
    title: '多篇论文如何共同形成这个节点',
    summary: '这个节点不是若干论文摘要的拼接，而是同一问题线在不同时间点上的推进、纠偏和补强。',
    points: [
      {
        label: '时间推进',
        detail: `最早的论文是 ${papers
          .slice()
          .sort((left, right) => +new Date(left.published) - +new Date(right.published))[0]?.titleZh || papers[0]?.title || '首篇论文'}，后续工作沿着它提出的问题继续推进。`,
      },
      {
        label: '证据关系',
        detail: '这些论文并不一定处在完全相同的实验条件里，因此更应该被看作推进链，而不是简单排行榜。',
      },
      {
        label: '仍未解决',
        detail: '真正困难的部分通常不是有没有新方法，而是这些方法在更复杂场景下是否还能保持稳定优势。',
      },
    ],
  }

  const topicId = normalizeTopicId(node?.topicId ?? papers[0]?.topicId)
  if (!topicId) return fallback

  const response = await requestPipelineOutput<Partial<NodeComparisonPass>>({
    topicId,
    subjectType: 'node',
    subjectId: normalizeSubjectId(node?.id, 'comparison'),
    templateId: PROMPT_TEMPLATE_IDS.ARTICLE_CROSS_PAPER,
    userPayload: {
      mode: 'cross-paper',
      node: {
        nodeId: node?.id,
        title: node?.nodeLabel,
        summary: node?.nodeSummary,
        explanation: node?.nodeExplanation,
      },
      papers: papers.map((paper) => summarizePaper(paper)),
      paperPasses,
    },
    memoryContext: mergeMemoryContext(
      {
        paperPasses,
        paperCount: papers.length,
      },
      researchPipelineContext,
    ),
    fallback,
    outputContract: '{"title":"","summary":"","points":[{"label":"","detail":""}]}',
    maxTokens: 1500,
    summaryHint: fallback.summary,
  })

  return {
    title: sanitizeString(response.title, fallback.title),
    summary: sanitizeString(response.summary, fallback.summary),
    points:
      Array.isArray(response.points) && response.points.length > 0
        ? response.points
            .map((point) => ({
              label: sanitizeString((point as { label?: unknown }).label, '比较点'),
              detail: sanitizeString((point as { detail?: unknown }).detail, ''),
            }))
            .filter((point) => point.detail)
        : fallback.points,
  } satisfies NodeComparisonPass
}

export async function generateNodeSynthesisPass(
  node: any,
  papers: any[],
  paperPasses: NodePaperPass[],
  comparison: NodeComparisonPass,
  researchPipelineContext?: Record<string, unknown>,
) {
  const fallback: NodeSynthesisPass = {
    headline: `${node.nodeLabel} 并不是单篇论文结论，而是围绕同一问题形成的一段研究推进。`,
    standfirst: clipText(`${node.nodeSummary} ${node.nodeExplanation ?? ''}`, 280),
    lead: [
      clipText(node.nodeSummary, 180),
      clipText(node.nodeExplanation ?? node.nodeSummary, 220),
    ],
    evidence: [
      '节点级判断不能只停在“论文很多”，而要看这些论文是否在问题、方法和结果层面形成能够互相支撑的论证链。',
      '图、表、公式在这里的意义，不是展示材料很多，而是帮助读者确认每篇论文到底贡献了哪一段关键证据。',
    ],
    closing: [
      '如果读者读完这个节点后仍然不知道每篇论文各自做了什么，那就说明节点级聚合仍然不够成功。',
      '一个好的节点文章，应该让读者至少看清：核心问题是什么、谁先提出、谁补强了证据、谁暴露了真正还难的部分。',
    ],
  }

  const topicId = normalizeTopicId(node?.topicId ?? papers[0]?.topicId)
  if (!topicId) return fallback

  const response = await requestPipelineOutput<Partial<NodeSynthesisPass>>({
    topicId,
    subjectType: 'node',
    subjectId: normalizeSubjectId(node?.id, 'synthesis'),
    templateId: PROMPT_TEMPLATE_IDS.ARTICLE_NODE,
    userPayload: {
      mode: 'node-synthesis',
      node: {
        nodeId: node?.id,
        title: node?.nodeLabel,
        subtitle: node?.nodeSubtitle,
        summary: node?.nodeSummary,
        explanation: node?.nodeExplanation,
      },
      papers: papers.map((paper) => summarizePaper(paper)),
      paperPasses,
      comparison,
    },
    memoryContext: mergeMemoryContext(
      {
        comparison,
        paperPasses,
      },
      researchPipelineContext,
    ),
    fallback,
    outputContract:
      '{"headline":"","standfirst":"","lead":["",""],"evidence":["",""],"closing":["",""]}',
    maxTokens: 1700,
    summaryHint: fallback.standfirst,
  })

  return {
    headline: sanitizeString(response.headline, fallback.headline),
    standfirst: sanitizeString(response.standfirst, fallback.standfirst),
    lead: sanitizeParagraphs(response.lead, fallback.lead),
    evidence: sanitizeParagraphs(response.evidence, fallback.evidence),
    closing: sanitizeParagraphs(response.closing, fallback.closing),
  } satisfies NodeSynthesisPass
}

export async function generateReviewerCritique(
  kind: 'node' | 'paper',
  payload: Record<string, unknown>,
  fallback: PipelineCritique,
  researchPipelineContext?: Record<string, unknown>,
) {
  const topicId = normalizeTopicId(payload.topicId)
  if (!topicId) return fallback

  const response = await requestPipelineOutput<Partial<PipelineCritique>>({
    topicId,
    subjectType: kind,
    subjectId:
      kind === 'node'
        ? normalizeSubjectId(payload.nodeId, 'node-reviewer')
        : normalizeSubjectId(payload.paperId, 'paper-reviewer'),
    templateId: PROMPT_TEMPLATE_IDS.ARTICLE_REVIEWER,
    userPayload: {
      mode: 'reviewer-critique',
      kind,
      ...payload,
    },
    memoryContext: mergeMemoryContext(
      {
        focus:
          kind === 'node'
            ? sanitizeString(payload.nodeTitle, '')
            : sanitizeString(payload.title, ''),
      },
      researchPipelineContext,
    ),
    fallback,
    outputContract: '{"summary":"","bullets":["","",""]}',
    maxTokens: 1200,
    summaryHint: fallback.summary,
  })

  return {
    summary: sanitizeString(response.summary, fallback.summary),
    bullets: sanitizeParagraphs(response.bullets, fallback.bullets),
  } satisfies PipelineCritique
}

export async function generatePaperStoryPass(
  paper: any,
  fallback: PaperStoryPass,
  researchPipelineContext?: Record<string, unknown>,
) {
  const topicId = normalizeTopicId(paper?.topicId)
  if (!topicId) return fallback

  const response = await requestPipelineOutput<Partial<PaperStoryPass>>({
    topicId,
    subjectType: 'paper',
    subjectId: normalizeSubjectId(paper?.id, 'paper-story'),
    templateId: PROMPT_TEMPLATE_IDS.ARTICLE_PAPER,
    userPayload: {
      mode: 'paper-story',
      paper: summarizePaper(paper),
      sections: Array.isArray(paper.sections)
        ? paper.sections.map((section: any) => ({
            sourceSectionTitle: section.sourceSectionTitle,
            editorialTitle: section.editorialTitle,
            paragraphs: clipText(section.paragraphs, 320),
          }))
        : [],
      evidence: {
        figures: Array.isArray(paper.figures)
          ? paper.figures.map((item: any) => clipText(item.caption, 160)).slice(0, 4)
          : [],
        tables: Array.isArray(paper.tables)
          ? paper.tables.map((item: any) => clipText(item.caption, 160)).slice(0, 3)
          : [],
        formulas: Array.isArray(paper.formulas)
          ? paper.formulas.map((item: any) => clipText(item.rawText || item.latex, 160)).slice(0, 3)
          : [],
      },
    },
    memoryContext: mergeMemoryContext(
      {
        sectionCount: Array.isArray(paper.sections) ? paper.sections.length : 0,
        figureCount: Array.isArray(paper.figures) ? paper.figures.length : 0,
        tableCount: Array.isArray(paper.tables) ? paper.tables.length : 0,
        formulaCount: Array.isArray(paper.formulas) ? paper.formulas.length : 0,
      },
      researchPipelineContext,
    ),
    fallback,
    outputContract:
      '{"standfirst":"","sections":[{"title":"","body":["",""]}],"closing":["",""]}',
    maxTokens: 1900,
    summaryHint: fallback.standfirst,
  })

  return {
    standfirst: sanitizeString(response.standfirst, fallback.standfirst),
    sections:
      Array.isArray(response.sections) && response.sections.length > 0
        ? response.sections
            .map((section) => ({
              title: sanitizeString((section as { title?: unknown }).title, '正文'),
              body: sanitizeParagraphs((section as { body?: unknown }).body, []),
            }))
            .filter((section) => section.body.length > 0)
        : fallback.sections,
    closing: sanitizeParagraphs(response.closing, fallback.closing),
  } satisfies PaperStoryPass
}

export const __testing = {
  buildArticleAuthorBrief,
  mergeMemoryContext,
}
