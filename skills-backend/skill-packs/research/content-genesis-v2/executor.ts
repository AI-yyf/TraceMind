import type { SkillContext, SkillInput, SkillOutput, ArtifactManager } from '../../../engine/contracts.ts'
import { multimodalClient } from '../../../shared/multimodal-client.ts'
import { getTopicDefinition } from '../../../topic-config/index.ts'
import { prisma } from '../../../shared/db.ts'
import { researchMemory } from '../../../shared/research-memory.ts'

interface ContentGenesisInput {
  paperId: string
  topicId: string
  branchId?: string
  stageIndex?: number
  problemNodeIds?: string[]
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
  coverageStrict?: boolean
  contentMode?: 'editorial' | 'summary' | 'detailed'
  providerId?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

interface PaperEditorial {
  titleZh: string
  highlight: string
  openingStandfirst: string
  sections: EditorialSection[]
  evidenceBlocks: EvidenceBlock[]
  closingHandoff: string[]
  problemsOut: ProblemOut[]
  coverCaption: string
}

interface EditorialSection {
  id: string
  editorialTitle: string
  paragraphs: string[]
  evidence: Evidence[]
}

interface Evidence {
  id: string
  type: 'figure' | 'table' | 'formula' | 'text'
  reference: string
  description: string
}

interface EvidenceBlock {
  id: string
  type: string
  content: string
  source: string
}

interface ProblemOut {
  id: string
  description: string
  relatedPapers: string[]
  status: 'open' | 'resolved' | 'ongoing'
}

interface CoverageReport {
  coveredAssets: string[]
  uncoveredAssets: string[]
  inferenceWarnings: string[]
  coverageScore: number
}

interface GeneratedContent {
  summary: string      // 第一层：摘要
  narrative: string    // 第二层：叙述
  evidence: string     // 第三层：证据
  highlight: string
  cardDigest: string
  timelineDigest: string
}

export async function executeContentGenesis(
  input: SkillInput<ContentGenesisInput>,
  context: SkillContext,
  artifactManager: ArtifactManager
): Promise<SkillOutput> {
  const startTime = Date.now()
  const params = input.params

  context.logger.info('Starting content genesis execution', {
    paperId: params.paperId,
    topicId: params.topicId,
  })

  try {
    // 1. 加载主题定义
    const topicDef = await getTopicDefinition(params.topicId)
    if (!topicDef) {
      throw new Error(`Topic definition not found: ${params.topicId}`)
    }

    // 2. 获取论文信息
    const paper = await prisma.paper.findFirst({
      where: {
        OR: [
          { id: params.paperId },
          { arxivId: params.paperId },
        ],
      },
      include: {
        figures: true,
        tables: true,
        formulas: true,
        nodePapers: {
          include: {
            node: true,
          },
        },
      },
    })

    if (!paper) {
      throw new Error(`Paper not found: ${params.paperId}`)
    }

    // 3. 获取相关论文（同主题的其他论文）
    const relatedPapers = await prisma.paper.findMany({
      where: {
        topicId: params.topicId,
        id: { not: paper.id },
      },
      take: 10,
      orderBy: { published: 'desc' },
    })

    // 4. 生成三层内容
    const generatedContent = await generateThreeLayerContent({
      paper,
      relatedPapers,
      topicDef,
      params,
      context,
    })

    // 5. 生成论文社论结构
    const paperEditorial = await generatePaperEditorial({
      paper,
      generatedContent,
      topicDef,
      params,
      context,
    })

    // 6. 生成覆盖报告
    const coverageReport = await generateCoverageReport({
      paper,
      paperEditorial,
      params,
    })

    // 7. 构建输出
    const output: SkillOutput = {
      success: true,
      data: {
        paperEditorial: {
          titleZh: paperEditorial.titleZh,
          highlight: paperEditorial.highlight,
          openingStandfirst: paperEditorial.openingStandfirst,
          sections: paperEditorial.sections,
          evidenceBlocks: paperEditorial.evidenceBlocks,
          closingHandoff: paperEditorial.closingHandoff,
          problemsOut: paperEditorial.problemsOut,
          coverCaption: paperEditorial.coverCaption,
        },
        topicEditorialDelta: {
          addedPaperId: paper.id,
          stageIndex: params.stageIndex,
          branchId: params.branchId,
          generatedAt: new Date().toISOString(),
        },
        cardDigest: generatedContent.cardDigest,
        timelineDigest: generatedContent.timelineDigest,
        problemsOut: paperEditorial.problemsOut,
        contextUpdateProposal: {
          updateType: 'paper-content-generated',
          paperId: paper.id,
          generatedSections: paperEditorial.sections.length,
          evidenceCount: paperEditorial.evidenceBlocks.length,
        },
        coverageReport: {
          coveredAssets: coverageReport.coveredAssets,
          uncoveredAssets: coverageReport.uncoveredAssets,
          inferenceWarnings: coverageReport.inferenceWarnings,
          coverageScore: coverageReport.coverageScore,
        },
        // 额外的三层内容
        threeLayerContent: {
          summary: generatedContent.summary,
          narrative: generatedContent.narrative,
          evidence: generatedContent.evidence,
        },
      },
      artifacts: [],
    }

    // 8. 保存到数据库
    await saveContentToDatabase({
      paperId: paper.id,
      generatedContent,
      paperEditorial,
      coverageReport,
      context,
    })

    context.logger.info('Content genesis execution completed', {
      duration: Date.now() - startTime,
      paperId: paper.id,
    })

    return output
  } catch (error) {
    context.logger.error('Content genesis execution failed', { error })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: null,
    }
  }
}

// 生成三层内容
async function generateThreeLayerContent({
  paper,
  relatedPapers,
  topicDef,
  params,
  context,
}: {
  paper: any
  relatedPapers: any[]
  topicDef: any
  params: ContentGenesisInput
  context: SkillContext
}): Promise<GeneratedContent> {
  // 准备论文信息
  const paperInfo = {
    title: paper.title,
    titleZh: paper.titleZh,
    summary: paper.summary,
    authors: paper.authors,
    published: paper.published,
    categories: paper.categories,
  }

  // 准备相关论文信息
  const relatedInfo = relatedPapers.map(p => ({
    title: p.title,
    summary: p.summary?.substring(0, 500),
  }))

  // 第一层：生成摘要（中文，面向普通读者）
  const summaryPrompt = `请为以下学术论文生成一段简洁的中文摘要（200-300字），面向非专业读者：

论文标题：${paperInfo.title}
论文摘要：${paperInfo.summary?.substring(0, 2000)}

要求：
1. 用通俗易懂的语言解释核心贡献
2. 说明这项研究为什么重要
3. 避免过多技术术语

请直接返回摘要内容。`

  const summaryResponse = await multimodalClient.complete({
    taskType: 'content-generation',
    prompt: summaryPrompt,
    providerId: params.providerId,
    model: params.model,
    temperature: params.temperature || 0.5,
    maxTokens: params.maxTokens || 800,
  })

  // 第二层：生成叙述（学术风格，详细阐述）
  const narrativePrompt = `请为以下学术论文生成详细的中文叙述内容（800-1200字）：

论文标题：${paperInfo.title}
论文摘要：${paperInfo.summary?.substring(0, 3000)}
作者：${paperInfo.authors?.join(', ')}
发表时间：${paperInfo.published}

主题背景：${topicDef.focusLabel}

相关研究：
${relatedInfo.map((r, i) => `${i + 1}. ${r.title}`).join('\n')}

要求：
1. 详细阐述研究背景、方法、结果和意义
2. 与相关研究进行对比
3. 指出创新点和局限性
4. 使用学术但易读的语言

请直接返回叙述内容。`

  const narrativeResponse = await multimodalClient.complete({
    taskType: 'content-generation',
    prompt: narrativePrompt,
    providerId: params.providerId,
    model: params.model,
    temperature: params.temperature || 0.4,
    maxTokens: params.maxTokens || 2000,
  })

  // 第三层：生成证据（技术细节，公式、图表分析）
  const evidencePrompt = `请分析以下学术论文的技术细节和证据：

论文标题：${paperInfo.title}
论文摘要：${paperInfo.summary?.substring(0, 3000)}

论文图表信息：
- 图表数量：${paper.figures?.length || 0}
- 表格数量：${paper.tables?.length || 0}
- 公式数量：${paper.formulas?.length || 0}

要求：
1. 提取关键实验结果和数据
2. 分析主要图表展示的内容
3. 总结技术贡献的具体证据
4. 用中文撰写，600-800字

请直接返回证据分析内容。`

  const evidenceResponse = await multimodalClient.complete({
    taskType: 'content-generation',
    prompt: evidencePrompt,
    providerId: params.providerId,
    model: params.model,
    temperature: params.temperature || 0.3,
    maxTokens: params.maxTokens || 1500,
  })

  // 生成亮点
  const highlightPrompt = `请为以下论文生成一句吸引人的亮点描述（50字以内）：

论文标题：${paperInfo.title}
论文摘要：${paperInfo.summary?.substring(0, 1500)}

要求：
1. 突出核心创新
2. 简洁有力
3. 中文撰写

请直接返回亮点描述。`

  const highlightResponse = await multimodalClient.complete({
    taskType: 'content-generation',
    prompt: highlightPrompt,
    providerId: params.providerId,
    model: params.model,
    temperature: params.temperature || 0.6,
    maxTokens: 200,
  })

  // 生成卡片摘要（用于首页展示）
  const cardDigestPrompt = `请为以下论文生成一段简短的中文卡片摘要（80-120字），用于在主题卡片中展示：

论文标题：${paperInfo.title}
核心内容：${summaryResponse.text.substring(0, 500)}

要求：
1. 简洁明了
2. 突出价值
3. 吸引点击阅读

请直接返回卡片摘要。`

  const cardDigestResponse = await multimodalClient.complete({
    taskType: 'content-generation',
    prompt: cardDigestPrompt,
    providerId: params.providerId,
    model: params.model,
    temperature: params.temperature || 0.5,
    maxTokens: 300,
  })

  // 生成时间线摘要（用于时间线展示）
  const timelineDigestPrompt = `请为以下论文生成一句时间线摘要（30字以内），用于在时间线上展示：

论文标题：${paperInfo.title}
发表时间：${paperInfo.published}

要求：
1. 一句话概括
2. 包含时间感
3. 中文撰写

请直接返回时间线摘要。`

  const timelineDigestResponse = await multimodalClient.complete({
    taskType: 'content-generation',
    prompt: timelineDigestPrompt,
    providerId: params.providerId,
    model: params.model,
    temperature: params.temperature || 0.5,
    maxTokens: 150,
  })

  return {
    summary: summaryResponse.text.trim(),
    narrative: narrativeResponse.text.trim(),
    evidence: evidenceResponse.text.trim(),
    highlight: highlightResponse.text.trim(),
    cardDigest: cardDigestResponse.text.trim(),
    timelineDigest: timelineDigestResponse.text.trim(),
  }
}

// 生成论文社论结构
async function generatePaperEditorial({
  paper,
  generatedContent,
  topicDef,
  params,
  context,
}: {
  paper: any
  generatedContent: GeneratedContent
  topicDef: any
  params: ContentGenesisInput
  context: SkillContext
}): Promise<PaperEditorial> {
  // 将叙述内容分段
  const narrativeParagraphs = generatedContent.narrative
    .split('\n\n')
    .filter(p => p.trim().length > 0)

  // 构建章节
  const sections: EditorialSection[] = [
    {
      id: 'background',
      editorialTitle: '研究背景',
      paragraphs: narrativeParagraphs.slice(0, 2),
      evidence: [],
    },
    {
      id: 'method',
      editorialTitle: '方法与创新',
      paragraphs: narrativeParagraphs.slice(2, 4),
      evidence: paper.figures?.slice(0, 2).map((f: any, i: number) => ({
        id: f.id || `fig-${i}`,
        type: 'figure' as const,
        reference: f.caption || `图 ${i + 1}`,
        description: f.analysis || '论文关键图表',
      })) || [],
    },
    {
      id: 'results',
      editorialTitle: '实验结果',
      paragraphs: narrativeParagraphs.slice(4, 6),
      evidence: paper.tables?.slice(0, 1).map((t: any, i: number) => ({
        id: t.id || `tab-${i}`,
        type: 'table' as const,
        reference: t.caption || `表 ${i + 1}`,
        description: t.analysis || '实验数据表',
      })) || [],
    },
  ]

  // 构建证据块
  const evidenceBlocks: EvidenceBlock[] = [
    ...(paper.figures?.map((f: any, i: number) => ({
      id: f.id || `figure-${i}`,
      type: 'figure',
      content: f.caption || `图 ${i + 1}`,
      source: paper.title,
    })) || []),
    ...(paper.tables?.map((t: any, i: number) => ({
      id: t.id || `table-${i}`,
      type: 'table',
      content: t.caption || `表 ${i + 1}`,
      source: paper.title,
    })) || []),
    ...(paper.formulas?.map((f: any, i: number) => ({
      id: f.id || `formula-${i}`,
      type: 'formula',
      content: f.latex || f.content || `公式 ${i + 1}`,
      source: paper.title,
    })) || []),
  ]

  // 生成待解决问题
  const problemsOut: ProblemOut[] = [
    {
      id: `problem-${paper.id}-1`,
      description: '需要进一步验证的方法泛化性',
      relatedPapers: [paper.id],
      status: 'open',
    },
    {
      id: `problem-${paper.id}-2`,
      description: '与其他方法的对比分析',
      relatedPapers: relatedPapers.slice(0, 3).map(p => p.id),
      status: 'ongoing',
    },
  ]

  // 生成封面说明
  const coverCaption = `${paper.titleZh || paper.title} - ${generatedContent.highlight}`

  return {
    titleZh: paper.titleZh || paper.title,
    highlight: generatedContent.highlight,
    openingStandfirst: generatedContent.summary,
    sections,
    evidenceBlocks,
    closingHandoff: [
      '这项研究为领域带来了新的视角和方法。',
      '后续研究可以在此基础上进一步探索。',
    ],
    problemsOut,
    coverCaption,
  }
}

// 生成覆盖报告
async function generateCoverageReport({
  paper,
  paperEditorial,
  params,
}: {
  paper: any
  paperEditorial: PaperEditorial
  params: ContentGenesisInput
}): Promise<CoverageReport> {
  const coveredAssets: string[] = []
  const uncoveredAssets: string[] = []
  const inferenceWarnings: string[] = []

  // 检查图表覆盖
  if (paper.figures?.length > 0) {
    const coveredFigures = paperEditorial.evidenceBlocks.filter(
      e => e.type === 'figure'
    ).length
    coveredAssets.push(`${coveredFigures}/${paper.figures.length} 图表`)

    if (coveredFigures < paper.figures.length) {
      uncoveredAssets.push(`${paper.figures.length - coveredFigures} 个图表未分析`)
    }
  }

  // 检查表格覆盖
  if (paper.tables?.length > 0) {
    const coveredTables = paperEditorial.evidenceBlocks.filter(
      e => e.type === 'table'
    ).length
    coveredAssets.push(`${coveredTables}/${paper.tables.length} 表格`)

    if (coveredTables < paper.tables.length) {
      uncoveredAssets.push(`${paper.tables.length - coveredTables} 个表格未分析`)
    }
  }

  // 检查公式覆盖
  if (paper.formulas?.length > 0) {
    const coveredFormulas = paperEditorial.evidenceBlocks.filter(
      e => e.type === 'formula'
    ).length
    coveredAssets.push(`${coveredFormulas}/${paper.formulas.length} 公式`)

    if (coveredFormulas < paper.formulas.length) {
      uncoveredAssets.push(`${paper.formulas.length - coveredFormulas} 个公式未分析`)
    }
  }

  // 生成警告
  if (paper.figures?.length === 0 && paper.tables?.length === 0) {
    inferenceWarnings.push('论文缺少可分析的多模态资源')
  }

  // 计算覆盖分数
  const totalAssets = (paper.figures?.length || 0) + (paper.tables?.length || 0) + (paper.formulas?.length || 0)
  const coveredCount = paperEditorial.evidenceBlocks.length
  const coverageScore = totalAssets > 0 ? coveredCount / totalAssets : 0.8

  return {
    coveredAssets,
    uncoveredAssets,
    inferenceWarnings,
    coverageScore: Math.min(1, coverageScore),
  }
}

// 保存内容到数据库
async function saveContentToDatabase({
  paperId,
  generatedContent,
  paperEditorial,
  coverageReport,
  context,
}: {
  paperId: string
  generatedContent: GeneratedContent
  paperEditorial: PaperEditorial
  coverageReport: CoverageReport
  context: SkillContext
}) {
  context.logger.info('Saving content to database', { paperId })

  try {
    // 更新论文内容
    await prisma.paper.update({
      where: { id: paperId },
      data: {
        explanation: generatedContent.summary,
        highlight: generatedContent.highlight,
        cardDigest: generatedContent.cardDigest,
        timelineDigest: generatedContent.timelineDigest,
      },
    })

    // 保存到研究记忆
    await researchMemory.addContentGeneration(paperId, {
      summary: generatedContent.summary,
      narrative: generatedContent.narrative,
      evidence: generatedContent.evidence,
      generatedAt: new Date().toISOString(),
      coverageScore: coverageReport.coverageScore,
    })

    context.logger.info('Content saved successfully', { paperId })
  } catch (error) {
    context.logger.error('Failed to save content', { paperId, error })
    throw error
  }
}
