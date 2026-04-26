import type { ArtifactManager, SkillContext, SkillInput, SkillOutput } from '../../../engine/contracts'
import { prisma } from '../../../shared/db'
import { researchMemory } from '../../../shared/research-memory'
import { getTopicDefinition } from '../../../topic-config/index'
import { omniGateway } from '../../../src/services/omni/gateway'
import { withRetry, LLMGenerationError, isRetryableError } from '../../../src/services/omni/retry'
import {
  getEditorialSystemPrompt,
  getPaperEditorialInstructions,
} from '../../../shared/editorial-prompt'
import {
  buildEvidenceContextFromPrismaPaper,
  formatEvidenceBlock,
  formatEvidenceIds,
  type EvidenceContext,
} from '../../../shared/evidence-context-builder'
import {
  CitationManager,
  type CitationPaper,
  type FormattedReference,
  type ReferenceList,
} from '../../../src/services/editorial/citation-manager'
import { appendTopicSessionMemoryEvent } from '../../../src/services/topics/topic-session-memory'
import {
  persistResearchJudgmentsFromPass,
} from '../../../src/services/generation/research-judgment-store'
import { type GenerationPassRecord } from '../../../src/services/generation/memory-store'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

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
  const byId = await prisma.papers.findUnique({
    where: { id: paperId },
    include: {
      figures: {
        select: {
          id: true,
          number: true,
          caption: true,
          page: true,
          imagePath: true,
          analysis: true,
        },
      },
      figure_groups: {
        select: {
          id: true,
          groupId: true,
          caption: true,
          page: true,
          subFigures: true,
        },
      },
      tables: {
        select: {
          id: true,
          number: true,
          caption: true,
          page: true,
          headers: true,
          rows: true,
          rawText: true,
        },
      },
      formulas: {
        select: {
          id: true,
          number: true,
          latex: true,
          rawText: true,
          page: true,
        },
      },
      paper_sections: {
        select: {
          id: true,
          sourceSectionTitle: true,
          editorialTitle: true,
          paragraphs: true,
          order: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (byId) return byId

  const alternatives = await prisma.papers.findMany({
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
      figure_groups: true,
      tables: true,
      formulas: true,
      paper_sections: {
        select: {
          id: true,
          sourceSectionTitle: true,
          editorialTitle: true,
          paragraphs: true,
          order: true,
        },
        orderBy: { order: 'asc' },
      },
    },
    take: 1,
  })

  return alternatives[0] ?? null
}

/**
 * Content generation error - thrown when LLM fails to generate valid content
 */
export class ContentGenerationError extends Error {
  constructor(
    message: string,
    public readonly paperId?: string,
    public readonly topicId?: string,
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'ContentGenerationError'
  }
}

/**
 * Quality validation: Detect template-like or AI-slop content
 * Returns error message if content fails quality check, null otherwise
 */
function validateContentQuality(content: GeneratedContent, paperTitle: string): string | null {
  const errors: string[] = []

  // Template phrase patterns (common AI-slop indicators)
  const templatePhrases = [
    '本文提出了',
    '这篇论文主要研究了',
    '该论文通过',
    '研究表明',
    '取得了一定成果',
    '具有重要意义',
    '为后续研究提供了',
    '本文首先',
    '本文接着',
    '最后本文',
    '综上所述',
    '总而言之',
    '这篇论文试图回应',
    '它的核心价值在于',
    '当前最重要的证据来自',
    '把这条主线向前推进了一步',
    '主线中承担一次新的机制推进',
  ]

  // Check each field for template phrases
  const checkField = (fieldName: string, text: string) => {
    const lowerText = text.toLowerCase()
    for (const phrase of templatePhrases) {
      if (lowerText.includes(phrase.toLowerCase())) {
        return `${fieldName}: contains template phrase "${phrase}"`
      }
    }
    return null
  }

  // Check all fields
  const fieldResults = [
    checkField('summary', content.summary),
    checkField('narrative', content.narrative),
    checkField('evidence', content.evidence),
    checkField('highlight', content.highlight),
    checkField('cardDigest', content.cardDigest),
    checkField('timelineDigest', content.timelineDigest),
  ]

  for (const err of fieldResults) {
    if (err) errors.push(err)
  }

  // Check minimum length requirements
  if (content.summary.length < 50) {
    errors.push('summary: too short (minimum 50 chars)')
  }
  if (content.narrative.length < 200) {
    errors.push('narrative: too short (minimum 200 chars)')
  }
  if (content.evidence.length < 80) {
    errors.push('evidence: too short (minimum 80 chars)')
  }

  // Check for hallucinated structure (common AI pattern)
  const aiStructurePatterns = [
    /^第一[,.，、]/,
    /^第二[,.，、]/,
    /^第三[,.，、]/,
    /^最后[,.，、]/,
    /^首先[,.，、]/,
  ]

  for (const pattern of aiStructurePatterns) {
    if (pattern.test(content.narrative)) {
      errors.push(`narrative: starts with AI structure pattern`)
      break
    }
  }

  return errors.length > 0 ? `Quality validation failed: ${errors.join('; ')}` : null
}

/**
 * Complete prompt with retry logic (3 attempts with exponential backoff)
 * NO FALLBACK: Throws error on failure instead of returning template content
 */
async function completePrompt(args: {
  prompt: string
  input: ContentGenesisInput
  temperature: number
  maxTokens: number
}): Promise<{ text: string }> {
  return withRetry(
    async () => {
      const result = await omniGateway.complete({
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

      // Validate result is not empty or template-like
      if (!result.text || result.text.trim().length < 10) {
        throw new Error('LLM returned empty or too short response')
      }

      return result
    },
    { maxRetries: 3 }
  )
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

  const editorialPrompt = getPaperEditorialInstructions('zh')

  // Build paper full text from sections (this is the key improvement!)
  const paperSections = args.paper.paper_sections || []
  let fullPaperText = ''
  if (paperSections.length > 0) {
    fullPaperText = paperSections
      .map((s: any) => {
        const title = s.editorialTitle || s.sourceSectionTitle || ''
        const paras = s.paragraphs || ''
        return title ? `## ${title}\n${paras}` : paras
      })
      .join('\n\n')
    // Limit to ~8000 chars to avoid token explosion
    if (fullPaperText.length > 8000) {
      fullPaperText = fullPaperText.substring(0, 8000) + '\n...[内容截断]'
    }
  }

  // ========== VLM PRE-ANALYSIS: True visual evidence analysis with image base64 ==========
  // If paper has figures with images, analyze them with VLM before LLM generation
  // CRITICAL: This must pass actual image data, not just text captions
  let vlmAnalysisText = ''
  const figures = args.paper.figures || []
  const tables = args.paper.tables || []
  const formulas = args.paper.formulas || []

  if (figures.length > 0) {
    console.log(`[ContentGenesis] Starting TRUE VLM visual analysis for ${figures.length} figures`)

    // Pick top figures for VLM analysis (limit to avoid token explosion)
    const topFigures = figures.slice(0, 5)

    try {
      // Build attachments with actual image base64 data
      const attachments: Array<{ type: 'image'; mimeType: string; base64: string }> = []
      const figureDescriptions: string[] = []

      for (const fig of topFigures) {
        const imagePath = fig.imagePath || fig.imageUrl
        if (!imagePath) continue

        // Try to read image file from disk
        let imageBase64: string | null = null
        try {
          // Handle both absolute paths and relative paths
          const fullPath = imagePath.startsWith('/') || imagePath.startsWith('F:')
            ? imagePath
            : `F:/DailyReport-main/skills-backend/${imagePath}`

          if (existsSync(fullPath)) {
            const imageData = await readFile(fullPath)
            imageBase64 = imageData.toString('base64')
            console.log(`[ContentGenesis] Loaded figure image: ${fig.figureNumber || '?'} (${imageBase64.length} bytes base64)`)
          } else {
            // Try uploads directory
            const uploadsPath = `F:/DailyReport-main/skills-backend/uploads/${imagePath}`
            if (existsSync(uploadsPath)) {
              const imageData = await readFile(uploadsPath)
              imageBase64 = imageData.toString('base64')
            }
          }
        } catch (readError) {
          console.warn(`[ContentGenesis] Could not read image file: ${imagePath}`, readError)
        }

        if (imageBase64) {
          // Determine mime type from extension or default to PNG
          const ext = imagePath.toLowerCase().split('.').pop() || 'png'
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
            : ext === 'png' ? 'image/png'
            : ext === 'gif' ? 'image/gif'
            : 'image/png'

          attachments.push({
            type: 'image',
            mimeType,
            base64: imageBase64,
          })

          const caption = fig.caption || fig.captionZh || '无标题'
          figureDescriptions.push(`Figure ${fig.figureNumber || attachments.length}: ${caption}`)
        }
      }

      if (attachments.length > 0) {
        // TRUE VLM call with actual image attachments
        console.log(`[ContentGenesis] Calling VLM with ${attachments.length} image attachments`)

        const vlmResult = await withRetry(
          async () => {
            return omniGateway.complete({
              task: 'figure_analysis',
              preferredSlot: 'multimodal',
              messages: [
                {
                  role: 'user',
                  content: [
                    '你是论文图表视觉分析专家。请仔细观察以下论文图表的视觉内容。',
                    '',
                    '图表列表：',
                    ...figureDescriptions,
                    '',
                    '请对每个图表进行深度视觉分析：',
                    '1. 描述图表中展示的具体数据、曲线、结构',
                    '2. 解释图表揭示了什么关键结论或模式',
                    '3. 指出图表之间的逻辑关系和证据链',
                    '4. 说明这些图表如何支撑论文的核心方法',
                    '',
                    '论文标题：' + paperInfo.title,
                    '研究主题：' + args.topicDef.focusLabel,
                  ].join('\n'),
                  attachments: attachments,
                },
              ],
              temperature: 0.25,
              maxTokens: 1200,
            })
          },
          { maxRetries: 2 }
        )

        vlmAnalysisText = vlmResult.text || ''
        console.log(`[ContentGenesis] TRUE VLM visual analysis complete: ${vlmAnalysisText.length} chars`)
      } else {
        console.warn(`[ContentGenesis] No image files could be loaded for VLM analysis`)
      }
    } catch (vlmError) {
      // VLM analysis failure is critical - log but don't fail entire generation
      console.warn(`[ContentGenesis] VLM visual analysis failed:`, vlmError)
      // Could throw ContentGenerationError here if VLM is mandatory
    }
  }

  // ========== VLM FORMULA ANALYSIS ==========
  // Formulas may have image representations that need VLM for LaTeX recognition
  if (formulas.length > 0) {
    console.log(`[ContentGenesis] Starting VLM formula analysis for ${formulas.length} formulas`)

    const formulaFigures = formulas.slice(0, 5).filter((f: any) => f.imagePath || f.imageUrl)

    if (formulaFigures.length > 0) {
      try {
        const formulaAttachments: Array<{ type: 'image'; mimeType: string; base64: string }> = []
        const formulaDescriptions: string[] = []

        for (const formula of formulaFigures) {
          const imagePath = formula.imagePath || formula.imageUrl
          if (!imagePath) continue

          try {
            const fullPath = imagePath.startsWith('/') || imagePath.startsWith('F:')
              ? imagePath
              : `F:/DailyReport-main/skills-backend/${imagePath}`

            if (existsSync(fullPath)) {
              const imageData = await readFile(fullPath)
              const imageBase64 = imageData.toString('base64')

              formulaAttachments.push({
                type: 'image',
                mimeType: 'image/png',
                base64: imageBase64,
              })

              formulaDescriptions.push(`Formula ${formula.formulaNumber || formulaAttachments.length}: ${formula.caption || '数学公式'}`)
            }
          } catch (readError) {
            console.warn(`[ContentGenesis] Could not read formula image: ${imagePath}`)
          }
        }

        if (formulaAttachments.length > 0) {
          const formulaResult = await withRetry(
            async () => {
              return omniGateway.complete({
                task: 'formula_recognition',
                preferredSlot: 'multimodal',
                messages: [
                  {
                    role: 'user',
                    content: [
                      '你是数学公式识别专家。请识别以下公式图片并解释其数学含义。',
                      '',
                      '公式列表：',
                      ...formulaDescriptions,
                      '',
                      '请对每个公式进行分析：',
                      '1. 识别公式的LaTeX表示',
                      '2. 解释公式的数学含义和作用',
                      '3. 说明公式在论文中的角色',
                    ].join('\n'),
                    attachments: formulaAttachments,
                  },
                ],
                temperature: 0.15,
                maxTokens: 800,
              })
            },
            { maxRetries: 2 }
          )

          if (formulaResult.text) {
            vlmAnalysisText += '\n\n【公式VLM分析】\n' + formulaResult.text
          }
        }
      } catch (formulaError) {
        console.warn(`[ContentGenesis] VLM formula analysis failed:`, formulaError)
      }
    }
  }
  // ========== END VLM FORMULA ANALYSIS ==========

  // Use unified evidence context builder (includes figureGroups!)
  const evidenceContext = buildEvidenceContextFromPrismaPaper(args.paper, {
    maxFigures: 10,
    maxFigureGroups: 5,
    maxTables: 5,
    maxFormulas: 8,
    includeAnalysis: true,
  })

  // Format evidence block for LLM
  const evidenceBlock = formatEvidenceBlock(evidenceContext, {
    language: 'zh',
    maxCaptionLength: 200,
    includePageNumbers: false,
  })

  // Format evidence IDs for reference
  const evidenceIds = formatEvidenceIds(evidenceContext)

  // ENHANCE: Attach VLM analysis to evidence block if available
  const enhancedEvidenceBlock = vlmAnalysisText
    ? `${evidenceBlock}\n\n【VLM深度分析】\n${vlmAnalysisText}`
    : evidenceBlock

  // Build full context for LLM (paper content + evidence)
  const hasFullText = fullPaperText.length > 500
  const paperContext = hasFullText
    ? `【论文全文内容】\n${fullPaperText}`
    : `【论文摘要】\n${paperInfo.summary}`

  // CRITICAL: New prompt structure that forces LLM to read the paper
  const promptPack = [
    {
      key: 'summary',
      prompt: [
        `${editorialPrompt}`,
        '',
        '你正在阅读一篇学术论文，请基于论文内容写出深度摘要。',
        '',
        '要求：',
        '1. 阅读论文内容，提炼核心研究问题',
        '2. 说明论文提出的方法如何解决这个问题',
        '3. 指出论文的关键贡献和局限性',
        '4. 字数180-260字',
        '',
        `主题: ${args.topicDef.nameZh} / ${args.topicDef.focusLabel}`,
        `论文: ${paperInfo.title}`,
        '',
        paperContext,
      ].join('\n'),
      temperature: args.input.temperature ?? 0.35,
      maxTokens: 320,
    },
    {
      key: 'narrative',
      prompt: [
        `${editorialPrompt}`,
        '',
        '你是一位学术编辑，正在为研究工作台撰写论文深度解读。',
        '请仔细阅读以下论文内容，然后撰写一篇500-800字的学术评述。',
        '',
        '写作要求：',
        '1. **研究背景**: 这篇论文要解决什么问题？为什么现在出现？',
        '2. **方法核心**: 用具体证据（Figure X/Table Y/Formula Z）说明方法如何工作',
        '3. **关键贡献**: 这篇论文真正推进了什么？不要泛泛而谈',
        '4. **局限性**: 审稿人会质疑什么？实验覆盖了什么/没覆盖什么？',
        '5. **后续问题**: 这篇论文留下什么问题给下一篇论文解决？',
        '',
        '禁止写成"本文提出了..."这种学生作文风格。要像资深研究员对同行解释。',
        '必须引用具体的图表公式编号（如Figure 3展示了...，Table 2对比了...）。',
        '',
        `主题: ${args.topicDef.nameZh} / ${args.topicDef.focusLabel}`,
        `论文: ${paperInfo.title}`,
        `作者: ${paperInfo.authors.join(', ')}`,
        `发表时间: ${paperInfo.published}`,
        '',
        paperContext,
        '',
        enhancedEvidenceBlock,
      ].join('\n'),
      temperature: args.input.temperature ?? 0.28,
      maxTokens: Math.min(args.input.maxTokens ?? 1200, 1400),
    },
    {
      key: 'evidence',
      prompt: [
        `你是论文审稿人，需要解释图表公式在论证中的作用。`,
        '',
        `可用证据: ${evidenceContext.counts.total === 0 ? '无' : evidenceIds}`,
        '',
        enhancedEvidenceBlock,
        '',
        '请写一段220-360字的证据分析，说明：',
        '1. 每个关键证据证明了什么论点',
        '2. 图表公式如何支持论文的核心方法',
        '3. 有没有其他解读方式或边界条件',
        '',
        paperContext,
      ].join('\n'),
      temperature: 0.22,
      maxTokens: 420,
    },
    {
      key: 'highlight',
      prompt: [
        '写一句强判断（40字以内），直接说明这篇论文的历史位置和核心推进。',
        '不要写"这篇论文很重要"，要写它到底推进了什么。',
        '',
        `论文: ${paperInfo.title}`,
        `主题: ${args.topicDef.focusLabel}`,
        paperContext,
      ].join('\n'),
      temperature: 0.45,
      maxTokens: 80,
    },
    {
      key: 'cardDigest',
      prompt: [
        '写一句卡片简介（80字以内），说明"为什么点开这篇论文值得"。',
        '要能说明这篇论文解决了什么具体问题，不要泛泛而谈。',
        '',
        `论文: ${paperInfo.title}`,
        `主题: ${args.topicDef.focusLabel}`,
        paperContext,
      ].join('\n'),
      temperature: 0.4,
      maxTokens: 120,
    },
    {
      key: 'timelineDigest',
      prompt: [
        '写一句时间线标注（60字以内），说明"这一跳为什么成立"。',
        '要点明这篇论文在研究主线中的转折意义。',
        '',
        `论文: ${paperInfo.title}`,
        `主题: ${args.topicDef.nameZh}`,
        paperContext,
      ].join('\n'),
      temperature: 0.35,
      maxTokens: 100,
    },
  ] as const

  // NO FALLBACK: All prompts must succeed via retry mechanism
  // If any prompt fails after retries, throw ContentGenerationError
  console.log(`[ContentGenesis] Generating 6-layer content for paper ${args.paper.titleZh || args.paper.title}`)

  const results = await Promise.all(
    promptPack.map(async (item, index) => {
      try {
        const result = await completePrompt({
          prompt: item.prompt,
          input: args.input,
          temperature: item.temperature,
          maxTokens: item.maxTokens,
        })
        console.log(`[ContentGenesis] Prompt ${index + 1}/${promptPack.length} (${item.key}) succeeded`)
        return { key: item.key, text: result.text }
      } catch (error) {
        console.error(`[ContentGenesis] Prompt ${index + 1}/${promptPack.length} (${item.key}) failed after retries:`, error)
        throw new ContentGenerationError(
          `Failed to generate ${item.key} for paper ${args.paper.titleZh || args.paper.title}: ${error instanceof Error ? error.message : String(error)}`,
          args.input.paperId,
          args.input.topicId,
          error instanceof Error ? error : new Error(String(error))
        )
      }
    })
  )

  // Build result object from successful completions
  const resultMap = new Map(results.map(r => [r.key, r.text]))

  const generatedContent: GeneratedContent = {
    summary: clipText(resultMap.get('summary')?.trim() || '', 500),
    narrative: clipText(resultMap.get('narrative')?.trim() || '', 1800),
    evidence: clipText(resultMap.get('evidence')?.trim() || '', 800),
    highlight: clipText(resultMap.get('highlight')?.trim() || '', 80),
    cardDigest: clipText(resultMap.get('cardDigest')?.trim() || '', 120),
    timelineDigest: clipText(resultMap.get('timelineDigest')?.trim() || '', 90),
  }

  // ========== QUALITY VALIDATION ==========
  // Validate content is not template-like or AI-slop
  const qualityError = validateContentQuality(generatedContent, paperInfo.title)
  if (qualityError) {
    console.warn(`[ContentGenesis] Quality validation warning: ${qualityError}`)
    // Log warning but don't fail - let user see the content
    // In future, could trigger regeneration with different temperature
  } else {
    console.log(`[ContentGenesis] Quality validation passed`)
  }

return generatedContent
}

function buildCoverageReport(paper: any) {
  const figures = paper.figures?.length || 0
  const figureGroups = paper.figure_groups?.length || 0
  const tables = paper.tables?.length || 0
  const formulas = paper.formulas?.length || 0
  const totalAssets = figures + figureGroups + tables + formulas

  return {
    coveredAssets: [
      `figures:${figures}`,
      `figureGroups:${figureGroups}`,
      `tables:${tables}`,
      `formulas:${formulas}`,
    ],
    uncoveredAssets: totalAssets === 0 ? ['visual-evidence-pending'] : [],
    inferenceWarnings:
      totalAssets === 0 ? ['Paper currently lacks extracted figures/tables/formulas.'] : [],
    coverageScore: totalAssets === 0 ? 0.6 : 1,
  }
}

/**
 * Build citation data for the paper and related papers
 */
function buildCitationData(paper: any, relatedPapers: any[]): ReferenceList {
  const citationManager = new CitationManager('ieee')

  // Add main paper
  const mainPaper: CitationPaper = {
    id: paper.id,
    title: paper.title,
    titleZh: paper.titleZh,
    titleEn: paper.titleEn || paper.title,
    authors: paper.authors,
    published: paper.published,
    arxivUrl: paper.arxivUrl,
    pdfUrl: paper.pdfUrl,
  }
  citationManager.addPaper(mainPaper)

  // Add related papers for cross-references
  relatedPapers.forEach((related) => {
    const relatedPaper: CitationPaper = {
      id: related.id,
      title: related.title,
      titleZh: related.titleZh,
      titleEn: related.titleEn || related.title,
      authors: related.authors,
      published: related.published,
      arxivUrl: related.arxivUrl,
      pdfUrl: related.pdfUrl,
    }
    citationManager.addPaper(relatedPaper)
  })

  // Generate reference list
  return citationManager.generateReferenceList()
}

/**
 * Format inline citation for a paper
 */
function formatInlineCitation(paperId: string, referenceList: ReferenceList): string {
  const marker = referenceList.markers.find((m) => m.paperId === paperId)
  return marker?.marker ?? '[?]'
}

async function persistGeneratedContent(args: {
  paperId: string
  generatedContent: GeneratedContent
  coverageScore: number
  context: SkillContext
}) {
  try {
    await prisma.papers.update({
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
    const topic = await prisma.topics.findUnique({
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

    const relatedPapers = await prisma.papers.findMany({
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
    const citationData = buildCitationData(paper, relatedPapers)

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
            ...(paper.figure_groups ?? []).slice(0, 2).map((figureGroup: any) => ({
              id: figureGroup.id,
              type: 'figureGroup',
              content: figureGroup.caption,
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
        // Citation data
        citation: {
          style: citationData.style,
          inlineCitation: formatInlineCitation(paper.id, citationData),
          reference: citationData.references.find((r) => r.paperId === paper.id),
          referenceList: citationData,
          bibtex: citationData.bibtexExport,
        },
      },
      artifacts: [],
    }

    // Record session memory event to build cognitive memory
    try {
      await appendTopicSessionMemoryEvent(params.topicId, {
        kind: 'content-generation',
        headline: `生成论文编辑内容: ${paper.titleZh || paper.title}`,
        summary: generatedContent.summary?.slice(0, 200) || '论文内容已生成',
        detail: generatedContent.highlight,
        paperIds: [paper.id],
        openQuestions: [],  // Content generation doesn't produce open questions directly
      })
      context.logger.info('Session memory event recorded for content genesis', {
        topicId: params.topicId,
        paperId: paper.id,
      })
    } catch (memErr) {
      // TypeScript strict mode: use cast for catch parameter
      const error = memErr as Error
      context.logger.warn('Failed to record session memory event', {
        topicId: params.topicId,
        error: error?.message || 'Unknown error',
      })
    }

    // Persist research judgments to build cognitive memory
    try {
      const judgmentRecord: GenerationPassRecord = {
        passId: `content-genesis-${randomUUID()}`,
        templateId: 'article.paper',
        language: 'zh',
        subjectType: 'paper',
        subjectId: paper.id,
        fingerprint: '',
        slot: 'language',
        status: 'ready',
        usedCache: false,
        attemptCount: 1,
        summary: generatedContent.summary?.slice(0, 240) || '',
        output: {
          headline: generatedContent.highlight,
          standfirst: generatedContent.summary,
          narrative: generatedContent.narrative,
          evidence: generatedContent.evidence,
          openQuestions: [],
          thesis: generatedContent.cardDigest,
        },
        updatedAt: new Date().toISOString(),
      }
      await persistResearchJudgmentsFromPass(params.topicId, judgmentRecord)
      context.logger.info('Research judgments persisted for content genesis', {
        topicId: params.topicId,
        paperId: paper.id,
      })
    } catch (judgmentErr) {
      // TypeScript strict mode: use cast for catch parameter
      const error = judgmentErr as Error
      context.logger.warn('Failed to persist research judgments', {
        topicId: params.topicId,
        error: error?.message || 'Unknown error',
      })
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
