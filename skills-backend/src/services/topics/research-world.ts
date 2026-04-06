import { prisma } from '../../lib/prisma'
import {
  buildGenerationFingerprint,
  loadTopicGenerationMemory,
} from '../generation/memory-store'
import {
  collectTopicGenerationContext,
  loadTopicResearchJudgmentState,
  type ResearchJudgment,
} from '../generation/research-judgment-store'
import {
  buildResearchPipelineContext,
  loadResearchPipelineState,
  type ResearchPipelineContextOptions,
} from './research-pipeline'
import { loadTopicResearchReport } from './research-report'
import { collectTopicSessionMemoryContext } from './topic-session-memory'

const RESEARCH_WORLD_KEY_PREFIX = 'topic-research-world:v1:'
const MAX_WORLD_CLAIMS = 40
const MAX_WORLD_HIGHLIGHTS = 12
const MAX_WORLD_QUESTIONS = 16
const MAX_WORLD_CRITIQUES = 16
const MAX_WORLD_AGENDA_ITEMS = 18

export type ResearchWorldConfidence = 'high' | 'medium' | 'low' | 'speculative'
export type ResearchWorldClaimStatus = 'accepted' | 'contested' | 'rejected' | 'superseded'
export type ResearchWorldQuestionPriority = 'critical' | 'important' | 'follow-up'
export type ResearchWorldAgendaKind =
  | 'resolve-question'
  | 'repair-critique'
  | 'stabilize-node'
  | 're-evaluate-stage'
  | 'pick-node-figure'
  | 'strengthen-node-evidence'

export interface TopicResearchWorldSummary {
  thesis: string
  currentFocus: string
  continuity: string
  dominantQuestion: string
  dominantCritique: string
  agendaHeadline: string
  maturity: 'nascent' | 'forming' | 'stable' | 'contested'
}

export interface TopicResearchWorldStage {
  id: string
  stageIndex: number
  title: string
  titleEn: string
  summary: string
  nodeIds: string[]
  paperIds: string[]
  confidence: ResearchWorldConfidence
  status: 'forming' | 'stable' | 'contested'
}

export interface TopicResearchWorldNode {
  id: string
  stageIndex: number
  title: string
  subtitle: string
  summary: string
  paperIds: string[]
  primaryPaperId: string | null
  coverImage: string | null
  confidence: ResearchWorldConfidence
  maturity: 'nascent' | 'forming' | 'stable' | 'contested'
  keyQuestion: string
  dominantCritique: string
}

export interface TopicResearchWorldPaper {
  id: string
  title: string
  titleEn: string
  summary: string
  coverImage: string | null
  publishedAt: string
  nodeIds: string[]
  stageIndexes: number[]
}

export interface TopicResearchWorldClaim {
  id: string
  scope: 'topic' | 'stage' | 'node' | 'paper'
  scopeId: string
  statement: string
  kind: 'finding' | 'mechanism' | 'comparison' | 'limitation'
  confidence: ResearchWorldConfidence
  status: ResearchWorldClaimStatus
  supportPaperIds: string[]
  supportNodeIds: string[]
  source: 'judgment' | 'report' | 'session' | 'structure'
}

export interface TopicResearchWorldHighlight {
  id: string
  scope: 'topic' | 'stage' | 'node' | 'paper'
  scopeId: string
  title: string
  detail: string
  source: 'judgment' | 'report' | 'session' | 'structure'
}

export interface TopicResearchWorldQuestion {
  id: string
  scope: 'topic' | 'stage' | 'node' | 'paper'
  scopeId: string
  question: string
  priority: ResearchWorldQuestionPriority
  source: 'judgment' | 'report' | 'pipeline' | 'session' | 'structure'
  status: 'open'
}

export interface TopicResearchWorldCritique {
  id: string
  targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim'
  targetId: string
  summary: string
  source: 'judgment' | 'report' | 'session' | 'structure'
  severity: 'high' | 'medium' | 'low'
  resolved: false
}

export interface TopicResearchWorldAgendaItem {
  id: string
  kind: ResearchWorldAgendaKind
  targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim'
  targetId: string
  title: string
  rationale: string
  priorityScore: number
  suggestedPrompt: string
  status: 'queued'
}

export interface TopicResearchWorld {
  schemaVersion: 'topic-research-world-v2'
  topicId: string
  version: number
  updatedAt: string
  language: string
  summary: TopicResearchWorldSummary
  stages: TopicResearchWorldStage[]
  nodes: TopicResearchWorldNode[]
  papers: TopicResearchWorldPaper[]
  claims: TopicResearchWorldClaim[]
  highlights: TopicResearchWorldHighlight[]
  questions: TopicResearchWorldQuestion[]
  critiques: TopicResearchWorldCritique[]
  agenda: TopicResearchWorldAgendaItem[]
}

interface TopicResearchWorldRecord {
  schemaVersion: 'topic-research-world-record-v1'
  topicId: string
  fingerprint: string
  savedAt: string
  world: TopicResearchWorld
}

type WorldScope = 'topic' | 'stage' | 'node' | 'paper'

function researchWorldKey(topicId: string) {
  return `${RESEARCH_WORLD_KEY_PREFIX}${topicId}`
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function uniqueStrings(
  values: Array<string | null | undefined>,
  limit = 8,
  maxLength = 220,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipText(value, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function dedupeById<T extends { id: string }>(items: T[], limit: number) {
  const seen = new Set<string>()
  const output: T[] = []

  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    output.push(item)
    if (output.length >= limit) break
  }

  return output
}

function confidenceBucket(value: number): ResearchWorldConfidence {
  if (value >= 0.8) return 'high'
  if (value >= 0.58) return 'medium'
  if (value >= 0.38) return 'low'
  return 'speculative'
}

function severityFromConfidence(confidence: ResearchWorldConfidence) {
  if (confidence === 'high') return 'high' as const
  if (confidence === 'medium') return 'medium' as const
  return 'low' as const
}

function normalizeScope(subjectType: ResearchJudgment['subjectType']): WorldScope {
  if (subjectType === 'stage') return 'stage'
  if (subjectType === 'node') return 'node'
  if (subjectType === 'paper') return 'paper'
  return 'topic'
}

function claimKindFromJudgment(
  judgment: ResearchJudgment,
): TopicResearchWorldClaim['kind'] | null {
  if (judgment.kind === 'comparison') return 'comparison'
  if (judgment.kind === 'method-note') return 'mechanism'
  if (judgment.kind === 'finding' || judgment.kind === 'claim') return 'finding'
  return null
}

function buildQuestionPriority(input: {
  source: TopicResearchWorldQuestion['source']
  scope: TopicResearchWorldQuestion['scope']
}) {
  if (input.source === 'report') return 'critical' as const
  if (input.scope === 'stage' || input.scope === 'node') return 'important' as const
  return 'follow-up' as const
}

function buildQuestionId(scope: string, scopeId: string, question: string) {
  return `question:${scope}:${scopeId}:${buildGenerationFingerprint(clipText(question, 180))}`
}

function buildCritiqueId(targetType: string, targetId: string, summary: string) {
  return `critique:${targetType}:${targetId}:${buildGenerationFingerprint(clipText(summary, 180))}`
}

function buildHighlightId(scope: string, scopeId: string, title: string) {
  return `highlight:${scope}:${scopeId}:${buildGenerationFingerprint(clipText(title, 160))}`
}

function buildAgendaId(
  kind: ResearchWorldAgendaKind,
  targetType: string,
  targetId: string,
  title: string,
) {
  return `agenda:${kind}:${targetType}:${targetId}:${buildGenerationFingerprint(clipText(title, 120))}`
}

function buildAgendaPrompt(
  kind: ResearchWorldAgendaKind,
  title: string,
  detail: string,
) {
  const focus = clipText(title, 140)
  const context = clipText(detail, 180)

  switch (kind) {
    case 'resolve-question':
      return `Continue the topic research mainline and answer this unresolved question: ${focus}`
    case 'repair-critique':
      return `Repair this reviewer-style critique and explain why the revised topic structure is stronger: ${focus}`
    case 'stabilize-node':
      return `Recalibrate the node "${focus}" so its boundaries, paper grouping, and core judgment become more stable.`
    case 're-evaluate-stage':
      return `Re-evaluate the stage "${focus}" and judge whether its name, thesis, and node grouping are truly aligned.`
    case 'pick-node-figure':
      return `Choose the most representative mechanism-first figure for the node "${focus}" and justify the selection.`
    case 'strengthen-node-evidence':
      return `Strengthen the evidence behind the node "${focus}", or narrow the claim if the evidence still does not hold.`
    default:
      return context || focus
  }
}

function looksLikeWorldPlaceholder(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return true

  return (
    /\bkeyword overlap fallback\b/iu.test(normalized) ||
    /\bcandidate cluster\b/iu.test(normalized) ||
    /\bNo new papers were admitted in this round\b/iu.test(normalized) ||
    /\bevidence consolidation mode\b/iu.test(normalized) ||
    /证据收束与判断校准模式/u.test(normalized) ||
    /候选簇/u.test(normalized)
  )
}

function claimKindFromText(value: string): TopicResearchWorldClaim['kind'] {
  if (/\b(compare|comparison|versus|vs\.?)\b/iu.test(value) || /比较|对照|张力/u.test(value)) {
    return 'comparison'
  }

  if (
    /\b(mechanism|pipeline|architecture|latent|diffusion|planning|simulation)\b/iu.test(value) ||
    /机制|架构|规划|仿真|推理/u.test(value)
  ) {
    return 'mechanism'
  }

  if (/\b(limit|limitation|boundary|risk|uncertain)\b/iu.test(value) || /限制|边界|风险|不足/u.test(value)) {
    return 'limitation'
  }

  return 'finding'
}

function parseStoredWorld(value: string | null | undefined) {
  if (!value) return null

  try {
    return JSON.parse(value) as TopicResearchWorldRecord
  } catch {
    return null
  }
}

function topicPipelineContextOptions(
  stageIndex?: number,
  paperIds?: string[],
): ResearchPipelineContextOptions {
  return {
    stageIndex,
    paperIds,
    historyLimit: 6,
  }
}

async function saveTopicResearchWorldRecord(record: TopicResearchWorldRecord) {
  await prisma.systemConfig.upsert({
    where: { key: researchWorldKey(record.topicId) },
    update: { value: JSON.stringify(record) },
    create: {
      key: researchWorldKey(record.topicId),
      value: JSON.stringify(record),
    },
  })
}

function buildTopicResearchWorldFingerprint(input: unknown) {
  return buildGenerationFingerprint(input)
}

export async function loadTopicResearchWorld(topicId: string) {
  const record = await prisma.systemConfig.findUnique({
    where: { key: researchWorldKey(topicId) },
  })

  return parseStoredWorld(record?.value)?.world ?? null
}

export async function buildTopicResearchWorld(topicId: string): Promise<{
  fingerprint: string
  world: TopicResearchWorld
}> {
  const [topic, topicMemory, judgmentState, pipelineState, sessionMemory, report] =
    await Promise.all([
      prisma.topic.findUnique({
        where: { id: topicId },
        select: {
          id: true,
          nameZh: true,
          nameEn: true,
          summary: true,
          description: true,
          focusLabel: true,
          language: true,
          updatedAt: true,
          stages: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              name: true,
              nameEn: true,
              description: true,
              descriptionEn: true,
            },
          },
          nodes: {
            orderBy: [{ stageIndex: 'asc' }, { updatedAt: 'desc' }],
            select: {
              id: true,
              stageIndex: true,
              nodeLabel: true,
              nodeSubtitle: true,
              nodeSummary: true,
              nodeExplanation: true,
              nodeCoverImage: true,
              isMergeNode: true,
              provisional: true,
              primaryPaperId: true,
              updatedAt: true,
              papers: {
                orderBy: { order: 'asc' },
                select: {
                  paperId: true,
                },
              },
            },
          },
          papers: {
            orderBy: { published: 'desc' },
            select: {
              id: true,
              title: true,
              titleZh: true,
              titleEn: true,
              summary: true,
              explanation: true,
              coverPath: true,
              published: true,
              updatedAt: true,
              nodePapers: {
                select: {
                  nodeId: true,
                },
              },
            },
          },
        },
      }),
      loadTopicGenerationMemory(topicId),
      loadTopicResearchJudgmentState(topicId),
      loadResearchPipelineState(topicId),
      collectTopicSessionMemoryContext(topicId, { recentLimit: 8 }),
      loadTopicResearchReport(topicId),
    ])

  if (!topic) {
    throw new Error(`Topic not found: ${topicId}`)
  }

  const generationContext = await collectTopicGenerationContext(topicId, topicMemory, {
    limit: 12,
  })
  const pipelineOverview = buildResearchPipelineContext(pipelineState, { historyLimit: 8 })
  const nodeById = new Map(topic.nodes.map((node) => [node.id, node] as const))

  const claims: TopicResearchWorldClaim[] = []
  const questions: TopicResearchWorldQuestion[] = []
  const critiques: TopicResearchWorldCritique[] = []

  judgmentState.judgments.forEach((judgment) => {
    const scope = normalizeScope(judgment.subjectType)
    const scopeId = judgment.scopeId || topicId

    if (judgment.kind === 'open-question') {
      questions.push({
        id: buildQuestionId(scope, scopeId, judgment.content),
        scope,
        scopeId,
        question: clipText(judgment.content, 180),
        priority: buildQuestionPriority({ source: 'judgment', scope }),
        source: 'judgment',
        status: 'open',
      })
      return
    }

    if (judgment.kind === 'error-correction') {
      critiques.push({
        id: buildCritiqueId(scope, scopeId, judgment.content),
        targetType: scope,
        targetId: scopeId,
        summary: clipText(judgment.content, 180),
        source: 'judgment',
        severity: severityFromConfidence(judgment.confidence),
        resolved: false,
      })
      return
    }

    const kind = claimKindFromJudgment(judgment)
    if (!kind) return

    const supportPaperIds =
      scope === 'paper'
        ? [scopeId]
        : scope === 'node'
          ? nodeById.get(scopeId)?.papers.map((paper) => paper.paperId) ?? []
          : []
    const supportNodeIds =
      scope === 'node'
        ? [scopeId]
        : scope === 'paper'
          ? topic.papers
              .find((paper) => paper.id === scopeId)
              ?.nodePapers.map((entry) => entry.nodeId) ?? []
          : []

    claims.push({
      id: `claim:${scope}:${scopeId}:${judgment.id}`,
      scope,
      scopeId,
      statement: clipText(judgment.content, 220),
      kind,
      confidence: judgment.confidence,
      status: kind === 'comparison' ? 'contested' : 'accepted',
      supportPaperIds,
      supportNodeIds,
      source: 'judgment',
    })
  })

  uniqueStrings(report?.openQuestions ?? [], 6, 180).forEach((question) => {
    questions.push({
      id: buildQuestionId('topic', topicId, question),
      scope: 'topic',
      scopeId: topicId,
      question,
      priority: 'critical',
      source: 'report',
      status: 'open',
    })
  })

  uniqueStrings(pipelineOverview.globalOpenQuestions, 6, 180).forEach((question) => {
    questions.push({
      id: buildQuestionId('topic', topicId, question),
      scope: 'topic',
      scopeId: topicId,
      question,
      priority: 'important',
      source: 'pipeline',
      status: 'open',
    })
  })

  uniqueStrings(sessionMemory.summary.openQuestions, 6, 180).forEach((question) => {
    questions.push({
      id: buildQuestionId('topic', topicId, question),
      scope: 'topic',
      scopeId: topicId,
      question,
      priority: 'follow-up',
      source: 'session',
      status: 'open',
    })
  })

  uniqueStrings(generationContext.reviewerWatchpoints, 8, 180).forEach((critique) => {
    critiques.push({
      id: buildCritiqueId('topic', topicId, critique),
      targetType: 'topic',
      targetId: topicId,
      summary: critique,
      source: 'session',
      severity: 'medium',
      resolved: false,
    })
  })

  uniqueStrings(report?.keyMoves ?? [], 6, 200).forEach((statement) => {
    claims.push({
      id: `claim:topic:${topicId}:report:${buildGenerationFingerprint(statement)}`,
      scope: 'topic',
      scopeId: topicId,
      statement,
      kind: 'finding',
      confidence: 'medium',
      status: 'accepted',
      supportPaperIds: [],
      supportNodeIds: [],
      source: 'report',
    })
  })

  uniqueStrings(sessionMemory.summary.establishedJudgments, 6, 180).forEach((statement) => {
    claims.push({
      id: `claim:topic:${topicId}:session:${buildGenerationFingerprint(statement)}`,
      scope: 'topic',
      scopeId: topicId,
      statement,
      kind: 'finding',
      confidence: 'medium',
      status: 'accepted',
      supportPaperIds: [],
      supportNodeIds: [],
      source: 'session',
    })
  })

  const stageContextByIndex = new Map(
    topic.stages.map((stage) => {
      const paperIds = uniqueStrings(
        topic.nodes
          .filter((node) => node.stageIndex === stage.order)
          .flatMap((node) => node.papers.map((entry) => entry.paperId)),
        24,
        80,
      )

      return [
        stage.order,
        buildResearchPipelineContext(
          pipelineState,
          topicPipelineContextOptions(stage.order, paperIds),
        ),
      ] as const
    }),
  )

  const stages: TopicResearchWorldStage[] = topic.stages.map((stage) => {
    const stageNodes = topic.nodes.filter((node) => node.stageIndex === stage.order)
    const stagePaperIds = uniqueStrings(
      stageNodes.flatMap((node) => node.papers.map((entry) => entry.paperId)),
      24,
      80,
    )
    const stageContext = stageContextByIndex.get(stage.order)
    const confidenceScore =
      stageNodes.length >= 3
        ? 0.82
        : stageNodes.length === 2
          ? 0.66
          : stageNodes.length === 1
            ? 0.5
            : 0.32

    return {
      id: stage.id,
      stageIndex: stage.order,
      title: stage.name,
      titleEn: stage.nameEn ?? stage.name,
      summary: clipText(
        stageContext?.currentStage?.stageSummary ||
          stageContext?.lastRun?.stageSummary ||
          stage.description ||
          stage.descriptionEn,
        220,
      ),
      nodeIds: stageNodes.map((node) => node.id),
      paperIds: stagePaperIds,
      confidence: confidenceBucket(confidenceScore),
      status: stageNodes.some((node) => node.isMergeNode || node.provisional)
        ? 'contested'
        : stageNodes.length >= 2
          ? 'stable'
          : 'forming',
    }
  })

  const seedQuestions = dedupeById(questions, MAX_WORLD_QUESTIONS)
  const seedCritiques = dedupeById(critiques, MAX_WORLD_CRITIQUES)

  const nodes: TopicResearchWorldNode[] = topic.nodes.map((node) => {
    const paperIds = node.papers.map((entry) => entry.paperId)
    const relatedQuestions = seedQuestions.filter(
      (question) => question.scope === 'node' && question.scopeId === node.id,
    )
    const relatedCritiques = seedCritiques.filter(
      (critique) => critique.targetType === 'node' && critique.targetId === node.id,
    )
    const confidenceScore = node.provisional
      ? 0.36
      : node.isMergeNode
        ? 0.52
        : paperIds.length >= 3
          ? 0.82
          : paperIds.length === 2
            ? 0.68
            : 0.54

    return {
      id: node.id,
      stageIndex: node.stageIndex,
      title: node.nodeLabel,
      subtitle: node.nodeSubtitle ?? '',
      summary: clipText(node.nodeExplanation || node.nodeSummary, 220),
      paperIds,
      primaryPaperId: node.primaryPaperId,
      coverImage: node.nodeCoverImage,
      confidence: confidenceBucket(confidenceScore),
      maturity: node.provisional
        ? 'nascent'
        : node.isMergeNode
          ? 'contested'
          : paperIds.length >= 3
            ? 'stable'
            : 'forming',
      keyQuestion: relatedQuestions[0]?.question ?? '',
      dominantCritique: relatedCritiques[0]?.summary ?? '',
    }
  })

  const papers: TopicResearchWorldPaper[] = topic.papers.map((paper) => {
    const nodeIds = paper.nodePapers.map((entry) => entry.nodeId)
    const stageIndexes = uniqueStrings(
      nodeIds.map((nodeId) => String(nodeById.get(nodeId)?.stageIndex ?? '')),
      8,
      12,
    )
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))

    return {
      id: paper.id,
      title: paper.titleZh || paper.title,
      titleEn: paper.titleEn ?? paper.title,
      summary: clipText(paper.explanation || paper.summary, 220),
      coverImage: paper.coverPath,
      publishedAt: paper.published.toISOString(),
      nodeIds,
      stageIndexes,
    }
  })

  const useEnglish = topic.language === 'en'

  nodes.forEach((node) => {
    if (
      !claims.some((claim) => claim.scope === 'node' && claim.scopeId === node.id) &&
      !looksLikeWorldPlaceholder(node.summary)
    ) {
      const statement = clipText(node.summary, 220)
      claims.push({
        id: `claim:node:${node.id}:structure:${buildGenerationFingerprint(statement)}`,
        scope: 'node',
        scopeId: node.id,
        statement,
        kind: claimKindFromText(statement),
        confidence: node.confidence,
        status: node.maturity === 'stable' ? 'accepted' : 'contested',
        supportPaperIds: node.paperIds,
        supportNodeIds: [node.id],
        source: 'structure',
      })
    }
  })

  stages.forEach((stage) => {
    if (
      !claims.some((claim) => claim.scope === 'stage' && claim.scopeId === String(stage.stageIndex)) &&
      !looksLikeWorldPlaceholder(stage.summary)
    ) {
      const statement = clipText(stage.summary, 220)
      claims.push({
        id: `claim:stage:${stage.stageIndex}:structure:${buildGenerationFingerprint(statement)}`,
        scope: 'stage',
        scopeId: String(stage.stageIndex),
        statement,
        kind: claimKindFromText(statement),
        confidence: stage.confidence,
        status: stage.status === 'stable' ? 'accepted' : 'contested',
        supportPaperIds: stage.paperIds,
        supportNodeIds: stage.nodeIds,
        source: 'structure',
      })
    }
  })

  if (claims.length === 0) {
    const topicStatement = clipText(
      report?.summary || report?.headline || topic.summary || topic.focusLabel,
      220,
    )
    if (!looksLikeWorldPlaceholder(topicStatement)) {
      claims.push({
        id: `claim:topic:${topicId}:structure:${buildGenerationFingerprint(topicStatement)}`,
        scope: 'topic',
        scopeId: topicId,
        statement: topicStatement,
        kind: claimKindFromText(topicStatement),
        confidence: 'medium',
        status: 'accepted',
        supportPaperIds: [],
        supportNodeIds: [],
        source: 'structure',
      })
    }
  }

  nodes.forEach((node) => {
    if (!questions.some((question) => question.scope === 'node' && question.scopeId === node.id)) {
      if (node.paperIds.length <= 1) {
        const question = useEnglish
          ? `Should "${node.title}" stay as a narrow single-paper reading entry, or does it need corroborating papers before the node can be treated as stable?`
          : `“${node.title}”应该继续保持为单篇深读入口，还是需要补入互证论文后才能被视为稳定节点？`
        questions.push({
          id: buildQuestionId('node', node.id, question),
          scope: 'node',
          scopeId: node.id,
          question,
          priority: 'important',
          source: 'structure',
          status: 'open',
        })
      } else if (node.maturity !== 'stable') {
        const question = useEnglish
          ? `Do the papers inside "${node.title}" really sustain one shared judgment line, or are we still over-grouping by topical vocabulary?`
          : `“${node.title}”里的这些论文真的支撑同一条判断主线吗，还是我们仍然只是按主题词把它们暂时并在一起？`
        questions.push({
          id: buildQuestionId('node', node.id, question),
          scope: 'node',
          scopeId: node.id,
          question,
          priority: 'important',
          source: 'structure',
          status: 'open',
        })
      }
    }

    if (!critiques.some((critique) => critique.targetType === 'node' && critique.targetId === node.id)) {
      if (node.maturity === 'nascent') {
        const summary = useEnglish
          ? `The node "${node.title}" is still provisional and may be over-claiming relative to its current evidence density.`
          : `节点“${node.title}”仍然偏临时，当前证据密度还不足以支撑过强结论。`
        critiques.push({
          id: buildCritiqueId('node', node.id, summary),
          targetType: 'node',
          targetId: node.id,
          summary,
          source: 'structure',
          severity: 'medium',
          resolved: false,
        })
      } else if (node.maturity === 'contested') {
        const summary = useEnglish
          ? `The node "${node.title}" still needs boundary repair before it can be trusted as a stable synthesis unit.`
          : `节点“${node.title}”仍然需要继续修边界，才能被视为稳定的综合判断单元。`
        critiques.push({
          id: buildCritiqueId('node', node.id, summary),
          targetType: 'node',
          targetId: node.id,
          summary,
          source: 'structure',
          severity: 'medium',
          resolved: false,
        })
      }
    }
  })

  stages.forEach((stage) => {
    if (
      stage.status !== 'stable' &&
      !critiques.some(
        (critique) => critique.targetType === 'stage' && critique.targetId === String(stage.stageIndex),
      )
    ) {
      const summary = useEnglish
        ? `Stage "${stage.title}" still looks under-formed and may need a sharper thesis, split, or rename.`
        : `阶段“${stage.title}”仍然偏松散，可能需要更明确的阶段主张、拆分或重命名。`
      critiques.push({
        id: buildCritiqueId('stage', String(stage.stageIndex), summary),
        targetType: 'stage',
        targetId: String(stage.stageIndex),
        summary,
        source: 'structure',
        severity: stage.status === 'contested' ? 'high' : 'medium',
        resolved: false,
      })
    }
  })

  const sortedClaims = dedupeById(claims, MAX_WORLD_CLAIMS)
  const sortedQuestions = dedupeById(questions, MAX_WORLD_QUESTIONS)
  const sortedCritiques = dedupeById(critiques, MAX_WORLD_CRITIQUES)
  const highlights: TopicResearchWorldHighlight[] = []

  sortedClaims.slice(0, 6).forEach((claim) => {
    highlights.push({
      id: buildHighlightId(claim.scope, claim.scopeId, claim.statement),
      scope: claim.scope,
      scopeId: claim.scopeId,
      title: claim.statement,
      detail:
        claim.supportPaperIds.length > 0
          ? useEnglish
            ? `Grounded by ${claim.supportPaperIds.length} paper(s).`
            : `由 ${claim.supportPaperIds.length} 篇论文支撑。`
          : useEnglish
            ? 'Grounded by the current topic structure and report state.'
            : '由当前主题结构与研究报告共同支撑。',
      source: claim.source,
    })
  })

  uniqueStrings(report?.keyMoves ?? [], 4, 180).forEach((move) => {
    highlights.push({
      id: buildHighlightId('topic', topicId, move),
      scope: 'topic',
      scopeId: topicId,
      title: move,
      detail: clipText(report?.summary || report?.headline || move, 220),
      source: 'report',
    })
  })

  nodes
    .filter((node) => !looksLikeWorldPlaceholder(node.summary))
    .slice(0, 4)
    .forEach((node) => {
      highlights.push({
        id: buildHighlightId('node', node.id, node.title),
        scope: 'node',
        scopeId: node.id,
        title: node.title,
        detail: clipText(node.summary, 220),
        source: 'structure',
      })
    })

  const sortedHighlights = dedupeById(highlights, MAX_WORLD_HIGHLIGHTS)
  const enrichedNodes = nodes.map((node) => ({
    ...node,
    keyQuestion:
      sortedQuestions.find(
        (question) => question.scope === 'node' && question.scopeId === node.id,
      )?.question ?? node.keyQuestion,
    dominantCritique:
      sortedCritiques.find(
        (critique) => critique.targetType === 'node' && critique.targetId === node.id,
      )?.summary ?? node.dominantCritique,
  }))

  const agenda: TopicResearchWorldAgendaItem[] = []

  sortedQuestions.slice(0, 6).forEach((question, index) => {
    const priorityScore =
      question.priority === 'critical'
        ? 96 - index
        : question.priority === 'important'
          ? 86 - index
          : 74 - index

    agenda.push({
      id: buildAgendaId('resolve-question', question.scope, question.scopeId, question.question),
      kind: 'resolve-question',
      targetType: question.scope,
      targetId: question.scopeId,
      title: question.question,
      rationale: `This unresolved question is still blocking a more stable judgment for ${question.scope}.`,
      priorityScore,
      suggestedPrompt: buildAgendaPrompt(
        'resolve-question',
        question.question,
        question.question,
      ),
      status: 'queued',
    })
  })

  sortedCritiques.slice(0, 5).forEach((critique, index) => {
    agenda.push({
      id: buildAgendaId('repair-critique', critique.targetType, critique.targetId, critique.summary),
      kind: 'repair-critique',
      targetType: critique.targetType,
      targetId: critique.targetId,
      title: critique.summary,
      rationale:
        'A reviewer-style warning is still unresolved and should be repaired before the next compile.',
      priorityScore: 90 - index,
      suggestedPrompt: buildAgendaPrompt(
        'repair-critique',
        critique.summary,
        critique.summary,
      ),
      status: 'queued',
    })
  })

  enrichedNodes
    .filter((node) => node.maturity === 'nascent' || node.maturity === 'contested')
    .slice(0, 5)
    .forEach((node, index) => {
      agenda.push({
        id: buildAgendaId('stabilize-node', 'node', node.id, node.title),
        kind: 'stabilize-node',
        targetType: 'node',
        targetId: node.id,
        title: node.title,
        rationale:
          'This node is still provisional or contested and needs sharper boundaries, paper grouping, or claim repair.',
        priorityScore: 82 - index,
        suggestedPrompt: buildAgendaPrompt('stabilize-node', node.title, node.summary),
        status: 'queued',
      })
    })

  enrichedNodes
    .filter((node) => !node.coverImage)
    .slice(0, 4)
    .forEach((node, index) => {
      agenda.push({
        id: buildAgendaId('pick-node-figure', 'node', node.id, node.title),
        kind: 'pick-node-figure',
        targetType: 'node',
        targetId: node.id,
        title: node.title,
        rationale:
          'This node still lacks a stable representative figure and needs a mechanism-first image judgment.',
        priorityScore: 72 - index,
        suggestedPrompt: buildAgendaPrompt('pick-node-figure', node.title, node.summary),
        status: 'queued',
      })
    })

  stages
    .filter((stage) => stage.status !== 'stable')
    .slice(0, 3)
    .forEach((stage, index) => {
      agenda.push({
        id: buildAgendaId('re-evaluate-stage', 'stage', String(stage.stageIndex), stage.title),
        kind: 're-evaluate-stage',
        targetType: 'stage',
        targetId: String(stage.stageIndex),
        title: stage.title,
        rationale:
          'This stage still looks under-formed and may need renaming, splitting, or a clearer stage thesis.',
        priorityScore: 68 - index,
        suggestedPrompt: buildAgendaPrompt('re-evaluate-stage', stage.title, stage.summary),
        status: 'queued',
      })
    })

  enrichedNodes
    .filter((node) => node.paperIds.length <= 1)
    .slice(0, 4)
    .forEach((node, index) => {
      agenda.push({
        id: buildAgendaId('strengthen-node-evidence', 'node', node.id, node.title),
        kind: 'strengthen-node-evidence',
        targetType: 'node',
        targetId: node.id,
        title: node.title,
        rationale:
          'This node is still supported by too little evidence and may need new papers or a narrower claim.',
        priorityScore: 64 - index,
        suggestedPrompt: buildAgendaPrompt(
          'strengthen-node-evidence',
          node.title,
          node.summary,
        ),
        status: 'queued',
      })
    })

  const sortedAgenda = dedupeById(
    agenda.sort((left, right) => right.priorityScore - left.priorityScore),
    MAX_WORLD_AGENDA_ITEMS,
  )

  const summary: TopicResearchWorldSummary = {
    thesis: clipText(
      generationContext.judgmentLedger[0] ||
        report?.headline ||
        report?.summary ||
        topic.summary ||
        topic.focusLabel,
      220,
    ),
    currentFocus: clipText(
      sessionMemory.summary.currentFocus ||
        report?.headline ||
        pipelineOverview.currentStage?.stageSummary ||
        generationContext.judgmentLedger[0],
      220,
    ),
    continuity: clipText(
      sessionMemory.summary.continuity ||
        report?.latestStageSummary ||
        pipelineOverview.lastRun?.stageSummary ||
        generationContext.continuityThreads[0],
      220,
    ),
    dominantQuestion: sortedQuestions[0]?.question ?? '',
    dominantCritique: sortedCritiques[0]?.summary ?? '',
    agendaHeadline: sortedAgenda[0]?.title ?? '',
    maturity: enrichedNodes.some((node) => node.maturity === 'contested')
      ? 'contested'
      : enrichedNodes.filter((node) => node.maturity === 'stable').length >=
          Math.max(2, Math.floor(enrichedNodes.length / 2))
        ? 'stable'
        : enrichedNodes.some((node) => node.maturity === 'forming')
          ? 'forming'
          : 'nascent',
  }

  const fingerprint = buildTopicResearchWorldFingerprint({
    builderVersion: 'topic-research-world-v2',
    topic: {
      id: topic.id,
      updatedAt: topic.updatedAt.toISOString(),
      nameZh: topic.nameZh,
      nameEn: topic.nameEn,
      summary: topic.summary,
      description: topic.description,
      focusLabel: topic.focusLabel,
      language: topic.language,
    },
    stages: topic.stages,
    nodes: topic.nodes.map((node) => ({
      id: node.id,
      stageIndex: node.stageIndex,
      updatedAt: node.updatedAt.toISOString(),
      nodeLabel: node.nodeLabel,
      nodeSubtitle: node.nodeSubtitle,
      provisional: node.provisional,
      isMergeNode: node.isMergeNode,
      coverImage: node.nodeCoverImage,
      paperIds: node.papers.map((entry) => entry.paperId),
    })),
    papers: topic.papers.map((paper) => ({
      id: paper.id,
      updatedAt: paper.updatedAt.toISOString(),
      title: paper.title,
      titleZh: paper.titleZh,
      titleEn: paper.titleEn,
      coverPath: paper.coverPath,
      nodeIds: paper.nodePapers.map((entry) => entry.nodeId),
    })),
    reportUpdatedAt: report?.updatedAt ?? null,
    pipelineUpdatedAt: pipelineState.updatedAt ?? null,
    sessionMemoryUpdatedAt: sessionMemory.updatedAt,
    topicMemoryUpdatedAt: topicMemory.updatedAt,
    judgmentStateUpdatedAt: judgmentState.updatedAt,
  })

  const world: TopicResearchWorld = {
    schemaVersion: 'topic-research-world-v2',
    topicId,
    version: 2,
    updatedAt: new Date().toISOString(),
    language: topic.language,
    summary,
    stages,
    nodes: enrichedNodes,
    papers,
    claims: sortedClaims,
    highlights: sortedHighlights,
    questions: sortedQuestions,
    critiques: sortedCritiques,
    agenda: sortedAgenda,
  }

  return {
    fingerprint,
    world,
  }
}

export async function syncTopicResearchWorldSnapshot(
  topicId: string,
  options?: { force?: boolean },
) {
  const [existing, next] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: researchWorldKey(topicId) },
    }),
    buildTopicResearchWorld(topicId),
  ])

  const parsed = parseStoredWorld(existing?.value)
  if (!options?.force && parsed?.fingerprint === next.fingerprint) {
    return parsed.world
  }

  await saveTopicResearchWorldRecord({
    schemaVersion: 'topic-research-world-record-v1',
    topicId,
    fingerprint: next.fingerprint,
    savedAt: new Date().toISOString(),
    world: next.world,
  })

  return next.world
}
