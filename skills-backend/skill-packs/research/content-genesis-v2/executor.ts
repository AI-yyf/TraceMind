import type { ArtifactManager, SkillContext, SkillInput, SkillOutput } from '../../../engine/contracts.ts'
import { prisma } from '../../../shared/db.ts'
import { researchMemory } from '../../../shared/research-memory.ts'
import { getTopicDefinition } from '../../../topic-config/index.ts'
import { omniGateway } from '../../../src/services/omni/gateway.ts'

interface ContentGenesisInput {
  paperId: string
  topicId: string
  stageIndex?: number
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
  contentMode?: 'editorial' | 'summary' | 'detailed'
  providerId?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

interface TopicDefinitionLike {
  id: string
  nameZh: string
  nameEn: string
  focusLabel: string
}

interface GeneratedContent {
  summary: string
  narrative: string
  evidence: string
  highlight: string
  cardDigest: string
  timelineDigest: string
}

function clipText(value: string | null | undefined, maxLength = 180) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
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

function isMissingRecordError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2025',
  )
}

function isMissingResearchSubjectMessage(message: string) {
  return /\b(?:Topic|Paper) not found\b/iu.test(message)
}

async function resolveTopicDefinition(topicId: string, topic: any): Promise<TopicDefinitionLike> {
  try {
    const staticTopic = getTopicDefinition(topicId)
    return {
      id: staticTopic.id,
      nameZh: staticTopic.nameZh,
      nameEn: staticTopic.nameEn,
      focusLabel: staticTopic.focusLabel,
    }
  } catch {
    return {
      id: topic.id,
      nameZh: topic.nameZh || topic.nameEn || topic.id,
      nameEn: topic.nameEn || topic.nameZh || topic.id,
      focusLabel:
        topic.focusLabel || topic.summary || topic.description || topic.nameZh || topic.nameEn || topic.id,
    }
  }
}

async function resolvePaper(topicId: string, paperId: string) {
  const byId = await (prisma as any).paper.findUnique({
    where: { id: paperId },
    include: {
      figures: true,
      tables: true,
      formulas: true,
    },
  })

  if (byId) return byId

  const alternatives = await (prisma as any).paper.findMany({
    where: {
      topicId,
      OR: [
        { arxivUrl: { contains: paperId } },
        { title: { contains: paperId } },
        { titleZh: { contains: paperId } },
      ],
    },
    include: {
      figures: true,
      tables: true,
      formulas: true,
    },
    take: 1,
  })

  return alternatives[0] ?? null
}

async function completePrompt(args: {
  prompt: string
  input: ContentGenesisInput
  temperature: number
  maxTokens: number
}) {
  return omniGateway.complete({
    task: 'general_chat',
    preferredSlot: 'language',
    messages: [
      {
        role: 'user',
        content: args.prompt,
      },
    ],
    temperature: args.temperature,
    maxTokens: args.maxTokens,
  })
}

function buildFallbackContent(args: {
  topicDef: TopicDefinitionLike
  paper: any
  relatedPapers: any[]
}) {
  const authors = parseJsonStringArray(args.paper.authors)
  const title = args.paper.titleZh || args.paper.title
  const focus = args.topicDef.focusLabel
  const relatedLead = args.relatedPapers[0]?.titleZh || args.relatedPapers[0]?.title || '同主题既有论文'

  return {
    summary: `${title} 试图回应“${focus}”这条主线上的关键问题。它的核心价值在于把论文摘要中的机制、证据与应用意义压缩成一条可读判断。`,
    narrative: `${title} 由 ${authors.join('、') || '未知作者'} 提出，位于 ${args.topicDef.nameZh} 这条研究主线中更靠近“${focus}”的位置。论文首先试图说明当前方法真正的瓶颈是什么，其次给出自己的技术回应，最后再通过实验或案例证明方案值得被纳入主线。结合主题内已有工作来看，它与 ${relatedLead} 之间既有延续，也有角色差异，因此更适合被理解为主线推进中的一个清晰转折点，而不是孤立结果。`,
    evidence: `${title} 当前最重要的证据来自摘要与已有结构化资产。现阶段可以确认的是：论文确实在主题关注的方向上给出了一种可落回机制层的回答，但图表、公式与更细的实验边界还需要后续多模态解析继续补足。`,
    highlight: clipText(`${title} 把 ${focus} 这条主线向前推进了一步。`, 64),
    cardDigest: clipText(`${title} 围绕 ${focus} 给出新的方法判断，值得作为主题节点继续展开。`, 120),
    timelineDigest: clipText(`${title} 在 ${args.topicDef.nameZh} 主线中承担一次新的机制推进。`, 90),
  }
}

async function generateThreeLayerContent(args: {
  topicDef: TopicDefinitionLike
  paper: any
  relatedPapers: any[]
  input: ContentGenesisInput
}): Promise<GeneratedContent> {
  const authors = parseJsonStringArray(args.paper.authors)
  const paperInfo = {
    title: args.paper.title,
    titleZh: args.paper.titleZh || args.paper.title,
    summary: clipText(args.paper.summary, 2800),
    authors,
    published: args.paper.published,
    focusLabel: args.topicDef.focusLabel,
    relatedTitles: args.relatedPapers
      .slice(0, 4)
      .map((paper) => paper.titleZh || paper.title)
      .join(' / '),
  }

  const promptPack = [
    {
      key: 'summary',
      prompt: [
        'Write a 180-260 word Chinese summary.',
        `Topic: ${args.topicDef.nameZh} / ${args.topicDef.focusLabel}`,
        `Paper: ${paperInfo.title}`,
        `Summary: ${paperInfo.summary}`,
      ].join('\n'),
      temperature: args.input.temperature ?? 0.35,
      maxTokens: 320,
    },
    {
      key: 'narrative',
      prompt: [
        'Write a 500-800 word Chinese narrative with judgment, evidence awareness, and limitations.',
        `Topic: ${args.topicDef.nameZh} / ${args.topicDef.focusLabel}`,
        `Paper: ${paperInfo.title}`,
        `Authors: ${paperInfo.authors.join(', ')}`,
        `Published: ${paperInfo.published}`,
        `Related papers: ${paperInfo.relatedTitles || 'None'}`,
        `Summary: ${paperInfo.summary}`,
      ].join('\n'),
      temperature: args.input.temperature ?? 0.28,
      maxTokens: Math.min(args.input.maxTokens ?? 1200, 1400),
    },
    {
      key: 'evidence',
      prompt: [
        'Write a 220-360 word Chinese evidence note.',
        `Figures: ${args.paper.figures?.length || 0}`,
        `Tables: ${args.paper.tables?.length || 0}`,
        `Formulas: ${args.paper.formulas?.length || 0}`,
        `Summary: ${paperInfo.summary}`,
      ].join('\n'),
      temperature: 0.22,
      maxTokens: 420,
    },
    {
      key: 'highlight',
      prompt: `Write one Chinese highlight under 40 characters for ${paperInfo.title}.`,
      temperature: 0.45,
      maxTokens: 80,
    },
    {
      key: 'cardDigest',
      prompt: `Write one Chinese card blurb under 80 characters for ${paperInfo.title}.`,
      temperature: 0.4,
      maxTokens: 120,
    },
    {
      key: 'timelineDigest',
      prompt: `Write one Chinese timeline sentence under 60 characters for ${paperInfo.title}.`,
      temperature: 0.35,
      maxTokens: 100,
    },
  ] as const

  const fallback = buildFallbackContent(args)

  try {
    const results = await Promise.all(
      promptPack.map((item) =>
        completePrompt({
          prompt: item.prompt,
          input: args.input,
          temperature: item.temperature,
          maxTokens: item.maxTokens,
        }),
      ),
    )

    return {
      summary: clipText(results[0].text.trim(), 500) || fallback.summary,
      narrative: clipText(results[1].text.trim(), 1800) || fallback.narrative,
      evidence: clipText(results[2].text.trim(), 800) || fallback.evidence,
      highlight: clipText(results[3].text.trim(), 80) || fallback.highlight,
      cardDigest: clipText(results[4].text.trim(), 120) || fallback.cardDigest,
      timelineDigest: clipText(results[5].text.trim(), 90) || fallback.timelineDigest,
    }
  } catch {
    return fallback
  }
}

function buildCoverageReport(paper: any) {
  const figures = paper.figures?.length || 0
  const tables = paper.tables?.length || 0
  const formulas = paper.formulas?.length || 0
  const totalAssets = figures + tables + formulas

  return {
    coveredAssets: [
      `figures:${figures}`,
      `tables:${tables}`,
      `formulas:${formulas}`,
    ],
    uncoveredAssets: totalAssets === 0 ? ['visual-evidence-pending'] : [],
    inferenceWarnings:
      totalAssets === 0 ? ['Paper currently lacks extracted figures/tables/formulas.'] : [],
    coverageScore: totalAssets === 0 ? 0.6 : 1,
  }
}

async function persistGeneratedContent(args: {
  paperId: string
  generatedContent: GeneratedContent
  coverageScore: number
  context: SkillContext
}) {
  try {
    await (prisma as any).paper.update({
      where: { id: args.paperId },
      data: {
        explanation: args.generatedContent.narrative,
      },
    })
  } catch (error) {
    if (isMissingRecordError(error)) {
      args.context.logger.warn('Content genesis skipped because the paper disappeared before persistence.', {
        paperId: args.paperId,
      })
      return false
    }

    throw error
  }

  await researchMemory.addContentGeneration(args.paperId, {
    summary: args.generatedContent.summary,
    narrative: args.generatedContent.narrative,
    evidence: args.generatedContent.evidence,
    generatedAt: new Date().toISOString(),
    coverageScore: args.coverageScore,
  })

  args.context.logger.info('Content genesis persisted', { paperId: args.paperId })
  return true
}

export async function executeContentGenesis(
  input: SkillInput<ContentGenesisInput>,
  context: SkillContext,
  _artifactManager: ArtifactManager,
): Promise<SkillOutput> {
  const startTime = Date.now()
  const params = input.params

  context.logger.info('Starting content genesis execution', {
    topicId: params.topicId,
    paperId: params.paperId,
  })

  try {
    const topic = await (prisma as any).topic.findUnique({
      where: { id: params.topicId },
    })

    if (!topic) {
      throw new Error(`Topic not found: ${params.topicId}`)
    }

    const topicDef = await resolveTopicDefinition(params.topicId, topic)
    const paper = await resolvePaper(params.topicId, params.paperId)

    if (!paper) {
      throw new Error(`Paper not found: ${params.paperId}`)
    }

    const relatedPapers = await (prisma as any).paper.findMany({
      where: {
        topicId: params.topicId,
        id: { not: paper.id },
      },
      orderBy: { published: 'desc' },
      take: 6,
    })

    const generatedContent = await generateThreeLayerContent({
      topicDef,
      paper,
      relatedPapers,
      input: params,
    })
    const coverageReport = buildCoverageReport(paper)

    const persisted = await persistGeneratedContent({
      paperId: paper.id,
      generatedContent,
      coverageScore: coverageReport.coverageScore,
      context,
    })

    if (!persisted) {
      return {
        success: false,
        error: `Paper not found: ${paper.id}`,
        data: null,
        artifacts: [],
      }
    }

    return {
      success: true,
      data: {
        paperEditorial: {
          titleZh: paper.titleZh || paper.title,
          highlight: generatedContent.highlight,
          openingStandfirst: generatedContent.summary,
          sections: [
            {
              id: 'narrative',
              editorialTitle: '研究叙事',
              paragraphs: generatedContent.narrative.split(/\n{2,}/u).filter(Boolean),
              evidence: [],
            },
            {
              id: 'evidence',
              editorialTitle: '证据与边界',
              paragraphs: [generatedContent.evidence],
              evidence: [],
            },
          ],
          evidenceBlocks: [
            ...(paper.figures ?? []).slice(0, 3).map((figure: any) => ({
              id: figure.id,
              type: 'figure',
              content: figure.caption,
              source: paper.title,
            })),
            ...(paper.tables ?? []).slice(0, 2).map((table: any) => ({
              id: table.id,
              type: 'table',
              content: table.caption,
              source: paper.title,
            })),
          ],
          closingHandoff: [
            '下一步应继续核对图表、实验设置与批评链条，避免只停留在摘要层理解。',
          ],
          problemsOut: [
            {
              id: `problem-${paper.id}-scope`,
              description: '仍需继续核对方法适用边界与外部泛化条件。',
              relatedPapers: [paper.id],
              status: 'open',
            },
          ],
          coverCaption: generatedContent.highlight,
        },
        topicEditorialDelta: {
          addedPaperId: paper.id,
          topicId: params.topicId,
          stageIndex: params.stageIndex ?? null,
          generatedAt: new Date().toISOString(),
        },
        cardDigest: generatedContent.cardDigest,
        timelineDigest: generatedContent.timelineDigest,
        problemsOut: [
          {
            id: `problem-${paper.id}-scope`,
            description: '仍需继续核对方法适用边界与外部泛化条件。',
            relatedPapers: [paper.id],
            status: 'open',
          },
        ],
        contextUpdateProposal: {
          updateType: 'paper-content-generated',
          paperId: paper.id,
          generatedAt: new Date().toISOString(),
        },
        coverageReport,
        threeLayerContent: generatedContent,
      },
      artifacts: [],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (isMissingRecordError(error) || isMissingResearchSubjectMessage(message)) {
      context.logger.warn('Content genesis skipped because its research subject no longer exists.', {
        topicId: params.topicId,
        paperId: params.paperId,
        error: message,
      })
    } else {
      context.logger.error('Content genesis execution failed', { error })
    }
    return {
      success: false,
      error: message,
      data: null,
      artifacts: [],
    }
  } finally {
    context.logger.info('Content genesis finished', {
      topicId: params.topicId,
      paperId: params.paperId,
      duration: Date.now() - startTime,
    })
  }
}
