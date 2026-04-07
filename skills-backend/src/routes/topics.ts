import { Router } from 'express'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import {
  loadTopicGenerationMemory,
} from '../services/generation/memory-store'
import { collectTopicGenerationContext } from '../services/generation/research-judgment-store'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import {
  getTopicLocalization,
  getTopicLocalizationMap,
  type TopicLocalizationPayload,
} from '../services/topics/localization'
import {
  buildResearchPipelineContext,
  loadResearchPipelineState,
} from '../services/topics/research-pipeline'
import {
  loadTopicResearchReport,
  sanitizeResearchFacingSummary,
} from '../services/topics/research-report'
import { loadTopicGuidanceLedger } from '../services/topics/topic-guidance-ledger'
import {
  loadTopicStageConfig,
  loadTopicStageConfigMap,
  saveTopicStageConfig,
  type TopicStageConfigState,
} from '../services/topics/topic-stage-config'
import { syncTopicResearchWorldSnapshot } from '../services/topics/research-world'
import { collectTopicSessionMemoryContext } from '../services/topics/topic-session-memory'
import { buildTopicCognitiveMemory } from '../services/topics/topic-cognitive-memory'
import { logger } from '../utils/logger'

const router = Router()

const DEFAULT_RESEARCH_CONVERSATION_STYLE =
  'Answer like the same scholar who has been building this topic: stay grounded in stages, nodes, papers, and evidence; be explicit about uncertainty; avoid generic filler.'

const DEFAULT_RESEARCH_USER_INTENT =
  'Continue the current topic by examining the key judgments, node relationships, and unresolved questions.'

function safeParseError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

async function safeGetTopicLocalizationMap(topicIds: string[]) {
  try {
    return await getTopicLocalizationMap(topicIds)
  } catch (error) {
    logger.warn('Topic localization map unavailable during list render; falling back to null.', {
      topicIds,
      ...safeParseError(error),
    })
    return new Map<string, TopicLocalizationPayload>()
  }
}

async function safeLoadTopicStageConfigMap(topicIds: string[]) {
  try {
    return await loadTopicStageConfigMap(topicIds)
  } catch (error) {
    logger.warn('Topic stage config map unavailable during list render; falling back to defaults.', {
      topicIds,
      ...safeParseError(error),
    })
    return new Map<string, TopicStageConfigState>()
  }
}

function clipBriefText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function uniqueBriefLines(
  values: Array<string | null | undefined>,
  limit = 6,
  maxLength = 220,
) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipBriefText(value, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function mergeBriefNarrative(
  values: Array<string | null | undefined>,
  options?: { maxLength?: number; limit?: number },
) {
  const lines = uniqueBriefLines(values, options?.limit ?? 2, options?.maxLength ?? 220)
  return clipBriefText(lines.join(' '), options?.maxLength ?? 220)
}

function buildResearchBriefSessionSummary(args: {
  topic: {
    nameZh: string
    summary: string | null
    description: string | null
    focusLabel: string | null
  }
  report: Awaited<ReturnType<typeof loadTopicResearchReport>>
  pipeline: ReturnType<typeof buildResearchPipelineContext>
  generationContext: Awaited<ReturnType<typeof collectTopicGenerationContext>>
  summary: Awaited<ReturnType<typeof collectTopicSessionMemoryContext>>['summary']
  world: Awaited<ReturnType<typeof syncTopicResearchWorldSnapshot>>
  guidance: Awaited<ReturnType<typeof loadTopicGuidanceLedger>>
}) {
  const { topic, report, pipeline, generationContext, summary, world, guidance } = args
  const latestGuidanceSummary = sanitizeResearchFacingSummary(
    guidance.latestApplication?.summary || guidance.summary.latestAppliedSummary,
    guidance.latestApplication?.summary || guidance.summary.latestAppliedSummary || '',
  )
  const guidanceFocusHeadline = sanitizeResearchFacingSummary(
    guidance.summary.focusHeadline,
    guidance.summary.focusHeadline || '',
  )
  const guidanceStyleHeadline = sanitizeResearchFacingSummary(
    guidance.summary.styleHeadline,
    guidance.summary.styleHeadline || '',
  )
  const guidanceChallengeHeadline = sanitizeResearchFacingSummary(
    guidance.summary.challengeHeadline,
    guidance.summary.challengeHeadline || '',
  )
  const latestDirectiveHeadline = sanitizeResearchFacingSummary(
    guidance.summary.latestDirective,
    guidance.summary.latestDirective || '',
  )
  const guidanceNarrative = mergeBriefNarrative(
    [
      latestGuidanceSummary,
      guidanceFocusHeadline,
      guidanceChallengeHeadline,
      latestDirectiveHeadline,
    ],
    { maxLength: 240, limit: 3 },
  )

  return {
    currentFocus:
      summary.currentFocus ||
      world.summary.currentFocus ||
      guidanceFocusHeadline ||
      sanitizeResearchFacingSummary(
        report?.headline ||
          report?.summary ||
          topic.summary ||
          topic.focusLabel ||
          topic.nameZh,
        '',
      ),
    continuity: mergeBriefNarrative(
      [
        summary.continuity,
        guidanceNarrative,
        world.summary.continuity,
        report?.latestStageSummary,
        pipeline.lastRun?.stageSummary,
        pipeline.currentStage?.stageSummary,
        generationContext.continuityThreads[0],
        topic.description,
        topic.summary,
      ].map((value) => sanitizeResearchFacingSummary(value, value ?? '')),
      { maxLength: 260 },
    ),
    establishedJudgments:
      summary.establishedJudgments.length > 0
        ? summary.establishedJudgments
        : uniqueBriefLines(
            [
              world.summary.thesis,
              ...world.claims.slice(0, 4).map((claim) => claim.statement),
              ...(report?.keyMoves ?? []),
              ...generationContext.judgmentLedger,
            ],
            6,
            200,
          ),
    openQuestions:
      summary.openQuestions.length > 0
        ? summary.openQuestions
        : uniqueBriefLines(
            [
              world.summary.dominantQuestion,
              ...world.questions.slice(0, 4).map((question) => question.question),
              ...(report?.openQuestions ?? []),
              ...pipeline.globalOpenQuestions,
              ...generationContext.openQuestions,
            ],
            6,
            180,
          ),
    researchMomentum:
      summary.researchMomentum.length > 0
        ? summary.researchMomentum
        : uniqueBriefLines(
            [
              latestGuidanceSummary,
              guidanceFocusHeadline,
              latestDirectiveHeadline,
              world.summary.agendaHeadline,
              ...world.agenda.slice(0, 3).map((item) => item.title),
              ...(report?.keyMoves ?? []),
              ...pipeline.continuityThreads,
              ...generationContext.continuityThreads,
            ],
            5,
            180,
          ),
    legacyConversationStyle:
      summary.conversationStyle ||
      '像已经参与过这条主题编撰一样回答，优先沿阶段、节点、论文与证据推进。',
    legacyLastResearchMove: mergeBriefNarrative(
      [
        summary.lastResearchMove,
        latestGuidanceSummary,
        report?.latestStageSummary,
        pipeline.lastRun?.stageSummary,
        pipeline.currentStage?.stageSummary,
        generationContext.continuityThreads[0],
      ].map((value) => sanitizeResearchFacingSummary(value, value ?? '')),
      { maxLength: 180 },
    ),
    legacyLastUserIntent:
      summary.lastUserIntent || '围绕当前主题继续追问关键判断、节点关系与未解问题。',
    conversationStyle:
      summary.conversationStyle ||
      guidanceStyleHeadline ||
      DEFAULT_RESEARCH_CONVERSATION_STYLE,
    lastResearchMove: mergeBriefNarrative(
      [
        summary.lastResearchMove,
        latestGuidanceSummary,
        latestDirectiveHeadline,
        report?.latestStageSummary,
        pipeline.lastRun?.stageSummary,
        pipeline.currentStage?.stageSummary,
        generationContext.continuityThreads[0],
      ].map((value) => sanitizeResearchFacingSummary(value, value ?? '')),
      { maxLength: 180 },
    ),
    lastUserIntent:
      summary.lastUserIntent || latestDirectiveHeadline || DEFAULT_RESEARCH_USER_INTENT,
  }
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const topics = await prisma.topic.findMany({
      include: {
        _count: {
          select: {
            papers: true,
            nodes: true,
            stages: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
    const topicIds = topics.map((topic) => topic.id)

    const [localizationMap, stageConfigMap] = await Promise.all([
      safeGetTopicLocalizationMap(topicIds),
      safeLoadTopicStageConfigMap(topicIds),
    ])

    res.json({
      success: true,
      data: topics.map((topic) => {
        const stageConfig = stageConfigMap.get(topic.id)

        return {
          ...topic,
          paperCount: topic._count.papers,
          nodeCount: topic._count.nodes,
          stageCount: topic._count.stages,
          localization: localizationMap.get(topic.id) ?? null,
          stageConfig: stageConfig
            ? {
                windowMonths: stageConfig.windowMonths,
                updatedAt: stageConfig.updatedAt,
              }
            : null,
          _count: undefined,
        }
      }),
    })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const topic = await prisma.topic.findUnique({
      where: { id },
      include: {
        papers: {
          orderBy: { published: 'desc' },
        },
        nodes: {
          include: {
            papers: {
              include: {
                paper: true,
              },
            },
          },
          orderBy: { stageIndex: 'asc' },
        },
        stages: {
          orderBy: { order: 'asc' },
        },
      },
    })

    if (!topic) {
      throw new AppError(404, 'Topic not found.')
    }

    res.json({
      success: true,
      data: {
        ...topic,
        localization: await getTopicLocalization(id),
      },
    })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { nameZh, nameEn, focusLabel, summary, description } = req.body

    const topic = await prisma.topic.create({
      data: {
        nameZh,
        nameEn,
        focusLabel,
        summary,
        description,
      },
    })

    logger.info('Created topic', { topicId: topic.id, nameZh })

    res.status(201).json({
      success: true,
      data: topic,
    })
  }),
)

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { nameZh, nameEn, focusLabel, summary, description, status } = req.body

    const topic = await prisma.topic.update({
      where: { id },
      data: {
        nameZh,
        nameEn,
        focusLabel,
        summary,
        description,
        status,
      },
    })

    logger.info('Updated topic', { topicId: id })

    res.json({
      success: true,
      data: topic,
    })
  }),
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    await prisma.topic.delete({
      where: { id },
    })

    logger.info('Deleted topic', { topicId: id })

    res.json({
      success: true,
      message: 'Topic deleted.',
    })
  }),
)

router.get(
  '/:id/stage-config',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const topic = await prisma.topic.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!topic) {
      throw new AppError(404, 'Topic not found.')
    }

    const config = await loadTopicStageConfig(id)

    res.json({
      success: true,
      data: config,
    })
  }),
)

router.patch(
  '/:id/stage-config',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const topic = await prisma.topic.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!topic) {
      throw new AppError(404, 'Topic not found.')
    }

    const windowMonths = Number(req.body?.windowMonths)
    if (!Number.isFinite(windowMonths)) {
      throw new AppError(400, 'Stage cadence windowMonths is required.')
    }

    const config = await saveTopicStageConfig(id, windowMonths)

    res.json({
      success: true,
      data: config,
    })
  }),
)

router.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const [paperStats, nodeStats] = await Promise.all([
      prisma.paper.groupBy({
        by: ['status'],
        where: { topicId: id },
        _count: true,
      }),
      prisma.researchNode.groupBy({
        by: ['status'],
        where: { topicId: id },
        _count: true,
      }),
    ])

    res.json({
      success: true,
      data: {
        papers: paperStats,
        nodes: nodeStats,
      },
    })
  }),
)

router.get(
  '/:id/research-brief',
  asyncHandler(async (req, res) => {
    const { id } = req.params

    const [topic, session, pipelineState, sessionMemory, latestResearchReport, topicMemory, world, guidance] =
      await Promise.all([
        prisma.topic.findUnique({
          where: { id },
          select: {
            id: true,
            nameZh: true,
            nameEn: true,
            summary: true,
            description: true,
            focusLabel: true,
          },
        }),
        enhancedTaskScheduler.getTopicResearchState(id),
        loadResearchPipelineState(id),
        collectTopicSessionMemoryContext(id, { recentLimit: 8 }),
        loadTopicResearchReport(id),
        loadTopicGenerationMemory(id),
        syncTopicResearchWorldSnapshot(id),
        loadTopicGuidanceLedger(id),
      ])

    if (!topic) {
      throw new AppError(404, 'Topic not found.')
    }

    const pipeline = buildResearchPipelineContext(pipelineState, { historyLimit: 8 })
    const generationContext = await collectTopicGenerationContext(id, topicMemory, { limit: 12 })
    const report = session.report ?? latestResearchReport ?? null
    const mergedSessionMemory = {
      ...sessionMemory,
      summary: buildResearchBriefSessionSummary({
        topic,
        report,
        pipeline,
        generationContext,
        summary: sessionMemory.summary,
        world,
        guidance,
      }),
    }
    const cognitiveMemory = buildTopicCognitiveMemory({
      generationContext,
      sessionMemory: mergedSessionMemory,
      guidance,
      report,
      world,
    })

    res.json({
      success: true,
      data: {
        topicId: id,
        session: {
          ...session,
          report,
        },
        pipeline,
        sessionMemory: mergedSessionMemory,
        world,
        guidance,
        cognitiveMemory,
      },
    })
  }),
)

router.get(
  '/:id/dashboard',
  asyncHandler(async (req, res) => {
    const { id: topicId } = req.params

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      select: { id: true, nameZh: true, nameEn: true },
    })

    if (!topic) {
      throw new AppError(404, 'Topic not found.')
    }

    const [nodes, papers] = await Promise.all([
      prisma.researchNode.findMany({
        where: { topicId },
        include: {
          primaryPaper: {
            select: {
              id: true,
              title: true,
              titleZh: true,
              titleEn: true,
              summary: true,
              explanation: true,
              citationCount: true,
              published: true,
              tags: true,
            },
          },
          papers: {
            include: {
              paper: {
                select: {
                  id: true,
                  title: true,
                  titleZh: true,
                  titleEn: true,
                  summary: true,
                  explanation: true,
                  authors: true,
                  citationCount: true,
                  published: true,
                  tags: true,
                },
              },
            },
          },
        },
        orderBy: { stageIndex: 'asc' },
      }),
      prisma.paper.findMany({
        where: { topicId },
        select: {
          id: true,
          title: true,
          titleZh: true,
          titleEn: true,
          summary: true,
          explanation: true,
          authors: true,
          citationCount: true,
          published: true,
          tags: true,
        },
      }),
    ])

    const parseStringArray = (value: string | null | undefined) => {
      if (!value) return [] as string[]

      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => {
              if (typeof item === 'string') return item.trim()
              if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
                return item.name.trim()
              }
              return ''
            })
            .filter(Boolean)
        }
      } catch {
        // fall through
      }

      return value
        .replace(/\uFF0C/gu, ',')
        .split(/[;,]/u)
        .map((item) => item.trim())
        .filter(Boolean)
    }

    const cleanText = (value: string | null | undefined, maxLength = 200) => {
      const normalized = value?.replace(/\s+/gu, ' ').trim() ?? ''
      if (!normalized) return ''
      return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    }

    const paperTitle = (paper: { titleZh: string; titleEn: string | null; title: string }) =>
      paper.titleZh || paper.titleEn || paper.title

    const totalPapers = papers.length
    const totalNodes = nodes.length
    const totalStages = new Set(nodes.map((node) => node.stageIndex)).size
    const years = papers.map((paper) => new Date(paper.published).getFullYear())
    const timeSpanYears = years.length > 1 ? Math.max(...years) - Math.min(...years) : 0
    const avgPapersPerNode = totalNodes > 0 ? Number((totalPapers / totalNodes).toFixed(1)) : 0
    const citationCoverage =
      totalPapers > 0
        ? papers.filter((paper) => (paper.citationCount ?? 0) > 0).length / totalPapers
        : 0

    const researchThreads = nodes.map((node) => {
      const nodePapers = node.papers.map((item) => item.paper)
      const leadPaper = node.primaryPaper ?? nodePapers[0]

      return {
        stageIndex: node.stageIndex,
        nodeId: node.id,
        nodeTitle: node.nodeLabel,
        thesis: cleanText(node.nodeExplanation || node.nodeSummary, 200),
        paperCount: nodePapers.length,
        keyPaperTitle: leadPaper ? paperTitle(leadPaper) : '',
        isMilestone: (leadPaper?.citationCount ?? 0) >= 200,
      }
    })

    const methodEvolution = nodes
      .flatMap((node) =>
        node.papers.slice(0, 2).map(({ paper }) => ({
          year: new Date(paper.published).getFullYear(),
          methodName: paperTitle(paper).split(/[:：|]/u)[0]?.trim().slice(0, 60) || paperTitle(paper),
          paperId: paper.id,
          paperTitle: paperTitle(paper),
          contribution: cleanText(paper.explanation || paper.summary, 200),
          impact:
            (paper.citationCount ?? 0) > 500
              ? 'high' as const
              : (paper.citationCount ?? 0) > 100
                ? 'medium' as const
                : 'low' as const,
        })),
      )
      .sort((left, right) => left.year - right.year)

    const authorMap = new Map<
      string,
      {
        name: string
        affiliation: string | null
        paperCount: number
        citationCount: number
        keyPapers: string[]
        researchFocus: string[]
      }
    >()

    for (const paper of papers) {
      for (const authorName of parseStringArray(paper.authors)) {
        const existing = authorMap.get(authorName)
        if (existing) {
          existing.paperCount += 1
          existing.citationCount += paper.citationCount ?? 0
          if (existing.keyPapers.length < 3) existing.keyPapers.push(paperTitle(paper))
          existing.researchFocus = [...new Set([...existing.researchFocus, ...parseStringArray(paper.tags)])].slice(0, 4)
          continue
        }

        authorMap.set(authorName, {
          name: authorName,
          affiliation: null,
          paperCount: 1,
          citationCount: paper.citationCount ?? 0,
          keyPapers: [paperTitle(paper)],
          researchFocus: parseStringArray(paper.tags).slice(0, 4),
        })
      }
    }

    const activeAuthors = Array.from(authorMap.values())
      .sort((left, right) => right.paperCount - left.paperCount || right.citationCount - left.citationCount)
      .slice(0, 12)

    const keyInsights = nodes
      .map((node) => cleanText(node.nodeExplanation || node.nodeSummary, 180))
      .filter(Boolean)
      .slice(0, 5)

    const methodKeywords = papers
      .flatMap((paper) => `${paper.title} ${paper.titleZh} ${paper.titleEn ?? ''} ${paper.tags}`.match(
        /\b(?:Transformer|CNN|RNN|GAN|Diffusion|LLM|RL|Attention|VAE|BERT|GPT|ViT|CLIP)\b/gi,
      ) || [])
    const uniqueMethods = [...new Set(methodKeywords.map((keyword) => keyword.toLowerCase()))]

    res.json({
      success: true,
      data: {
        topicId,
        topicTitle: topic.nameZh || topic.nameEn || '',
        researchThreads,
        methodEvolution,
        activeAuthors,
        stats: {
          totalPapers,
          totalNodes,
          totalStages,
          timeSpanYears,
          avgPapersPerNode,
          citationCoverage,
        },
        keyInsights,
        trends: {
          emergingTopics: [],
          decliningTopics: [],
          methodShifts: uniqueMethods.length > 0 ? [`Methods: ${uniqueMethods.join(', ')}`] : [],
        },
      },
    })
  }),
)

export default router

export const __testing = {
  buildResearchBriefSessionSummary,
}
