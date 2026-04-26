/**
 * Node Editorial Agent
 *
 * Generates academic journal-style content for research nodes using LLM.
 * Implements multi-turn generation for comprehensive content with:
 * - Node overview (introduction section)
 * - Paper summaries with academic style
 * - Figure/table/formula descriptions naturally integrated
 * - Node synthesis (conclusion section)
 * - Reference list
 *
 * Delegates model selection to OmniGateway, which resolves the user's
 * configured VLM/LLM from the model_configs table. No hardcoded model
 * or base URL fallbacks — OmniGateway handles the full resolution chain.
 */

import {
  getEditorialSystemPrompt,
  getNodeEditorialInstructions,
  getPaperEditorialInstructions,
  getEvidenceEditorialInstructions,
  getSynthesisEditorialInstructions,
  generatePosterStyleAnalysisPrompt,
} from '../../../shared/editorial-prompt'
import {
  buildEvidenceContext,
  formatEvidenceBlock,
  formatEvidenceIds,
} from '../../../shared/evidence-context-builder'
import type { PromptLanguage } from '../generation/prompt-registry'
import { retryWithBackoff } from '../../utils/retry'
import { omniGateway } from '../omni/gateway'
import type { OmniTask, OmniMessage, OmniAttachment } from '../../../shared/model-config'
import {
  AcademicMarkdownGenerator,
  type MarkdownArticleOptions,
  type MarkdownArticleResult,
} from './academic-markdown-generator'
import {
  CitationManager,
  type ReferenceList,
} from './citation-manager'
import type {
  EditorialAgentConfig,
  EditorialGenerationOptions,
  EditorialGenerationResult,
  FigureContext,
  FormulaContext,
  MultiTurnState,
  NodeContext,
  PaperContext,
  PaperAnalysisResult,
  PosterStylePaperAnalysis,
  LegacyPaperAnalysis,
  PaperParagraph,
  ParagraphRole,
  PaperSubsectionKind,
  ReferenceEntry,
  TableContext,
} from './types'

// 分段温度: 不同写作阶段使用不同温度
interface SectionTemperatureConfig {
  introduction: number    // 总述 - 较高温度(0.50)，创意性
  paperAnalysis: number   // 论文分析 - 中等(0.38)，平衡性
  synthesis: number       // 综合 - 较低(0.28)，严谨性
  evidence: number        // 证据 - 低(0.22)，准确性
}

const DEFAULT_SECTION_TEMPERATURES: SectionTemperatureConfig = {
  introduction: 0.50,
  paperAnalysis: 0.38,
  synthesis: 0.28,
  evidence: 0.22,
}

function readEnv(key: string) {
  const value = process.env[key]?.trim()
  return value ? value : undefined
}

function readNumberEnv(key: string) {
  const value = readEnv(key)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isCompatibleEditorialProvider(value: string | undefined) {
  if (!value) return true
  return value === 'openai_compatible' || value === 'openai'
}

function resolveNodeEditorialEnvDefaults(): Partial<EditorialAgentConfig> {
  const rolePrefix = 'OMNI_ROLE_NODE_WRITER'
  const slotPrefix = 'OMNI_LANGUAGE'
  const defaultPrefix = 'OMNI_DEFAULT'
  const inferredProvider =
    readEnv(`${rolePrefix}_PROVIDER`) ??
    readEnv(`${slotPrefix}_PROVIDER`) ??
    readEnv(`${defaultPrefix}_PROVIDER`) ??
    (
      (readEnv(`${rolePrefix}_MODEL`) ||
        readEnv(`${slotPrefix}_MODEL`) ||
        readEnv(`${defaultPrefix}_MODEL`)) &&
      (readEnv(`${rolePrefix}_BASE_URL`) ||
        readEnv(`${slotPrefix}_BASE_URL`) ||
        readEnv(`${defaultPrefix}_BASE_URL`))
        ? 'openai_compatible'
        : undefined
    )

  if (!isCompatibleEditorialProvider(inferredProvider)) {
    return {
      apiKey: readEnv('EDITORIAL_API_KEY'),
      baseUrl: readEnv('EDITORIAL_BASE_URL'),
      model: readEnv('EDITORIAL_MODEL'),
    }
  }

  return {
    apiKey:
      readEnv(`${rolePrefix}_API_KEY`) ??
      readEnv(`${slotPrefix}_API_KEY`) ??
      readEnv(`${defaultPrefix}_API_KEY`) ??
      readEnv('EDITORIAL_API_KEY'),
    baseUrl:
      readEnv(`${rolePrefix}_BASE_URL`) ??
      readEnv(`${slotPrefix}_BASE_URL`) ??
      readEnv(`${defaultPrefix}_BASE_URL`) ??
      readEnv('EDITORIAL_BASE_URL'),
    model:
      readEnv(`${rolePrefix}_MODEL`) ??
      readEnv(`${slotPrefix}_MODEL`) ??
      readEnv(`${defaultPrefix}_MODEL`) ??
      readEnv('EDITORIAL_MODEL'),
    defaultMaxTokens:
      readNumberEnv(`${rolePrefix}_MAX_TOKENS`) ??
      readNumberEnv(`${slotPrefix}_MAX_TOKENS`) ??
      readNumberEnv(`${defaultPrefix}_MAX_TOKENS`),
    defaultTemperature:
      readNumberEnv(`${rolePrefix}_TEMPERATURE`) ??
      readNumberEnv(`${slotPrefix}_TEMPERATURE`) ??
      readNumberEnv(`${defaultPrefix}_TEMPERATURE`),
  }
}

/**
 * Resolve the editorial agent configuration.
 *
 * OmniGateway handles model/key/baseUrl resolution from the user's
 * model_configs, so we no longer read env vars or use hardcoded
 * fallbacks for those fields. Only generation parameters (maxTokens,
 * temperature, passes, timeout) are configured here.
 */
function resolveNodeEditorialConfig(config?: Partial<EditorialAgentConfig>): EditorialAgentConfig {
  const envDefaults = resolveNodeEditorialEnvDefaults()
  return {
    // baseUrl, apiKey, model are intentionally omitted — OmniGateway resolves them
    baseUrl: config?.baseUrl ?? envDefaults.baseUrl,
    apiKey: config?.apiKey ?? envDefaults.apiKey,
    model: config?.model ?? envDefaults.model,
    /*
    defaultMaxTokens: config?.defaultMaxTokens ?? 16000,  // 提升到16000以支持更深分析
    defaultTemperature: config?.defaultTemperature ?? 0.18,
    */
    defaultMaxTokens: config?.defaultMaxTokens ?? envDefaults.defaultMaxTokens ?? 16000,
    defaultTemperature: config?.defaultTemperature ?? envDefaults.defaultTemperature ?? 0.18,
    defaultPasses: config?.defaultPasses ?? 3,
    timeoutMs: config?.timeoutMs ?? 120000,
  }
}

/**
 * Node Editorial Agent class
 */
export class NodeEditorialAgent {
  private config: EditorialAgentConfig

  constructor(config?: Partial<EditorialAgentConfig>) {
    this.config = resolveNodeEditorialConfig(config)
  }

  /**
   * Generate node introduction (总述部分)
   *
   * Explains the problem entry, first paper's initial setup,
   * last paper's stage landing point, and recurring technical handles.
   */
  async generateNodeIntroduction(
    node: NodeContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(node)
    const systemPrompt = getEditorialSystemPrompt('node-introduction', language)

    const contextData = this.buildNodeIntroductionContext(node, language)
    const userPrompt = this.buildNodeIntroductionUserPrompt(node, language, contextData)

    return this.generateWithMultiTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      multiTurn: options?.multiTurn ?? true,
      passes: options?.passes ?? 2,
      temperature: options?.temperature ?? DEFAULT_SECTION_TEMPERATURES.introduction,
    })
  }

  /**
   * Generate paper analysis (论文分析)
   *
   * Deep review of a single paper with academic poster style,
   * integrating figures, tables, and formulas.
   * Outputs structured JSON with coreThesis, paragraphs, closingInsight.
   */
  async generatePaperAnalysis(
    paper: PaperContext,
    nodeContext?: NodeContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguageFromTitle(paper)
    const systemPrompt = getPaperEditorialInstructions(language)

    const contextData = this.buildPaperAnalysisContext(paper, language, nodeContext)
    const userPrompt = this.buildPaperAnalysisUserPrompt(paper, language, contextData)

    const rawResult = await this.generateWithMultiTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      multiTurn: options?.multiTurn ?? false, // Single turn for structured JSON
      passes: options?.passes ?? 1,
      maxTokens: options?.maxTokens ?? 32000,
      _omniTask: 'topic_summary',
    })

    // Parse the poster-style JSON response
    let paperAnalysis = this.parsePosterStyleResponse(rawResult.content, paper)

    // Ensure bilingual content is complete
    if (paperAnalysis.contentVersion === 'v2') {
      paperAnalysis = await this.ensureBilingualContent(paperAnalysis, language)
    }

    return {
      ...rawResult,
      paperAnalysis,
      isPosterStyle: paperAnalysis.contentVersion === 'v2',
    }
  }

  /**
   * Generate figure description (图表描述)
   *
   * Explains what the figure proves, what phenomenon it shows,
   * and which argument in the main text it supports.
   * Tries VLM image analysis first if image is available.
   */
  async generateFigureDescription(
    figure: FigureContext,
    paperContext?: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? 'zh'

    // Try VLM analysis if image is available
    if (figure.imagePath) {
      try {
        const imageBase64 = await this.loadImageAsBase64(figure.imagePath)
        if (imageBase64) {
          return await this.analyzeFigureWithVLM(figure, imageBase64, language, paperContext, options)
        }
      } catch (error) {
        console.warn('[NodeEditorialAgent] VLM figure analysis failed, falling back to text-only', {
          figureId: figure.id,
          figureNumber: figure.number,
          imagePath: figure.imagePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Text-only fallback
    const systemPrompt = getEvidenceEditorialInstructions(language)
    const userPrompt = this.buildFigureDescriptionUserPrompt(figure, language, paperContext)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 800,
      _omniTask: 'figure_analysis',
      _omniPreferredSlot: 'multimodal',
    })
  }

  /**
   * Generate table description (表格描述)
   *
   * Explains what the table proves, comparison baselines,
   * and which argument in the main text it supports.
   * Tries VLM image analysis if table image is available.
   */
  async generateTableDescription(
    table: TableContext,
    paperContext?: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? 'zh'

    // Try VLM analysis if image is available (tables may have screenshots)
    if ((table as TableContext & { imagePath?: string }).imagePath) {
      try {
        const imageBase64 = await this.loadImageAsBase64(
          (table as TableContext & { imagePath?: string }).imagePath!
        )
        if (imageBase64) {
          return await this.analyzeTableWithVLM(table, imageBase64, language, paperContext, options)
        }
      } catch (error) {
        console.warn('[NodeEditorialAgent] VLM table analysis failed, falling back to text-only', {
          tableId: table.id,
          tableNumber: table.number,
          imagePath: (table as TableContext & { imagePath?: string }).imagePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Text-only fallback
    const systemPrompt = getEvidenceEditorialInstructions(language)
    const userPrompt = this.buildTableDescriptionUserPrompt(table, language, paperContext)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 800,
      _omniTask: 'table_extraction',
      _omniPreferredSlot: 'multimodal',
    })
  }

  /**
   * Generate formula description (公式描述)
   *
   * Explains what constraint or objective the formula defines,
   * and which argument in the main text it supports.
   * Tries VLM image analysis if formula image is available.
   */
  async generateFormulaDescription(
    formula: FormulaContext,
    paperContext?: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? 'zh'

    // Try VLM analysis if image is available (formulas may have screenshots)
    if ((formula as FormulaContext & { imagePath?: string }).imagePath) {
      try {
        const imageBase64 = await this.loadImageAsBase64(
          (formula as FormulaContext & { imagePath?: string }).imagePath!
        )
        if (imageBase64) {
          return await this.analyzeFormulaWithVLM(formula, imageBase64, language, paperContext, options)
        }
      } catch (error) {
        console.warn('[NodeEditorialAgent] VLM formula analysis failed, falling back to text-only', {
          formulaId: formula.id,
          formulaNumber: formula.number,
          imagePath: (formula as FormulaContext & { imagePath?: string }).imagePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Text-only fallback
    const systemPrompt = getEvidenceEditorialInstructions(language)
    const userPrompt = this.buildFormulaDescriptionUserPrompt(formula, language, paperContext)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 600,
      _omniTask: 'formula_recognition',
      _omniPreferredSlot: 'multimodal',
    })
  }

  /**
   * Generate node synthesis (总结部分)
   *
   * Cross-paper synthesis with evidence chains,
   * overall judgment, and problems for next stage.
   */
  async generateNodeSynthesis(
    node: NodeContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(node)
    const systemPrompt = getSynthesisEditorialInstructions(language)

    const contextData = this.buildNodeSynthesisContext(node, language)
    const userPrompt = this.buildNodeSynthesisUserPrompt(node, language, contextData)

    return this.generateWithMultiTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      multiTurn: options?.multiTurn ?? true,
      passes: options?.passes ?? 2,
      temperature: options?.temperature ?? DEFAULT_SECTION_TEMPERATURES.synthesis,
    })
  }

  /**
   * Generate reference list (参考文献)
   *
   * Academic-style bibliography for the node's papers.
   * Uses CitationManager for proper IEEE/APA formatting.
   */
  async generateReferenceList(
    papers: PaperContext[],
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const style = options?.citationStyle ?? 'ieee'

    // Use CitationManager for proper formatting
    const citationManager = new CitationManager(style)

    papers.forEach((paper) => {
      citationManager.addPaperFromContext(paper)
    })

    const referenceList = citationManager.generateReferenceList()

    // Format reference list as text
    const referenceText = referenceList.references
      .map((ref) => ref.text)
      .join('\n\n')

    return {
      content: referenceText,
      multiTurnUsed: false,
      passesCompleted: 1,
      provider: 'citation-manager',
      model: 'local',
      // Include structured citation data
      paperAnalysis: {
        coreThesis: 'References',
        paragraphs: referenceList.references.map((ref, index) => ({
          role: 'evidence' as ParagraphRole,
          content: ref.text,
          wordCount: ref.text.length,
          evidenceIds: [],
          sortIndex: index,
        })),
        closingInsight: `Total ${referenceList.references.length} references`,
        contentVersion: 'v2',
      },
    }
  }

  /**
   * Generate reference list with BibTeX export
   */
  generateReferenceListWithBibtex(
    papers: PaperContext[],
    style: 'ieee' | 'apa' = 'ieee'
  ): ReferenceList {
    const citationManager = new CitationManager(style)

    papers.forEach((paper) => {
      citationManager.addPaperFromContext(paper)
    })

    return citationManager.generateReferenceList()
  }

  /**
   * Get inline citation marker for a paper
   */
  getCitationMarker(paper: PaperContext, style: 'ieee' | 'apa' = 'ieee'): string {
    const citationManager = new CitationManager(style)
    citationManager.addPaperFromContext(paper)
    return citationManager.formatInlineCitation(paper.id)
  }

  /**
   * Generate complete node article with multi-turn
   *
   * Combines introduction, paper analyses, and synthesis
   * into a comprehensive academic article.
   */
  async generateCompleteNodeArticle(
    node: NodeContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(node)
    const systemPrompt = getNodeEditorialInstructions(language)

    // Build comprehensive context
    const contextData = this.buildCompleteNodeArticleContext(node, language)
    const userPrompt = this.buildCompleteNodeArticleUserPrompt(node, language, contextData)

    // Use multi-turn with more passes for complete article
    return this.generateWithMultiTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      multiTurn: true,
      passes: options?.passes ?? 4,
      maxTokens: options?.maxTokens ?? 64000,
    })
  }

  /**
   * Generate a clean academic Markdown article for a research node.
   *
   * Unlike generateCompleteNodeArticle which produces free-form text,
   * this method uses AcademicMarkdownGenerator to produce structured
   * Markdown with:
   * - No redundant headers (each ## is meaningful and unique)
   * - Figures inline where discussed
   * - Evidence IDs embedded (![[figure:id]] syntax)
   * - Proper argument flow (thesis → evidence → conclusion)
   *
   * The output can be directly rendered by ArticleMarkdown.tsx.
   */
  async generateMarkdownArticle(
    node: NodeContext,
    options?: MarkdownArticleOptions
  ): Promise<MarkdownArticleResult> {
    const generator = new AcademicMarkdownGenerator(this.config)
    return generator.generateMarkdownArticle(node, options)
  }

  // ==================== Private Methods ====================

  /**
   * Generate with multi-turn for long content
   */
  private async generateWithMultiTurn(
    systemPrompt: string,
    userPrompt: string,
    options: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const passes = options.passes ?? this.config.defaultPasses
    const multiTurn = options.multiTurn ?? passes > 1

    if (!multiTurn || passes <= 1) {
      return this.generateSingleTurn(systemPrompt, userPrompt, options)
    }

    const state: MultiTurnState = {
      currentPass: 0,
      totalPasses: passes,
      accumulatedContent: '',
      nextPassContext: '',
      isComplete: false,
    }

    // Pass 1: Initial generation
    const initialResult = await this.generateSingleTurn(systemPrompt, userPrompt, options)
    state.accumulatedContent = initialResult.content
    state.currentPass = 1

    // Pass 2+: Refinement and expansion
    while (state.currentPass < state.totalPasses) {
      const refinementPrompt = this.buildRefinementPrompt(
        state.accumulatedContent,
        state.currentPass,
        state.totalPasses,
        options.language
      )

      const refinementResult = await this.generateSingleTurn(
        this.buildRefinementSystemPrompt(systemPrompt, state.currentPass, state.totalPasses, options.language),
        refinementPrompt,
        {
          ...options,
          previousContext: state.accumulatedContent,
          maxTokens: options.maxTokens ?? this.config.defaultMaxTokens,
        }
      )

      state.accumulatedContent = this.mergeContent(
        state.accumulatedContent,
        refinementResult.content,
        state.currentPass,
        options.language
      )
      state.currentPass++
    }

    state.isComplete = true

    return {
      content: state.accumulatedContent,
      multiTurnUsed: true,
      passesCompleted: state.totalPasses,
      provider: initialResult.provider,
      model: initialResult.model,
      reasoning: initialResult.reasoning,
    }
  }

  /**
   * Generate single turn (single API call)
   */
  private async generateSingleTurn(
    systemPrompt: string,
    userPrompt: string,
    options: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const maxTokens = options.maxTokens ?? this.config.defaultMaxTokens
    const temperature = options.temperature ?? this.config.defaultTemperature

    // Determine task based on context hints
    const task: OmniTask = options._omniTask ?? 'topic_summary'
    const preferredSlot: 'language' | 'multimodal' = options._omniPreferredSlot ?? 'language'

    const { text, model, provider } = await this.callOmni(task, systemPrompt, userPrompt, {
      maxTokens,
      preferredSlot,
      temperature,
    })

    return {
      content: this.normalizeContent(text),
      multiTurnUsed: false,
      passesCompleted: 1,
      provider,
      model,
    }
  }

  /**
   * Call the LLM API via OmniGateway.
   *
   * OmniGateway resolves the model, baseUrl, and apiKey from the user's
   * model_configs — we do NOT pass those fields here.
   */
  private async callOmni(
    task: OmniTask,
    systemPrompt: string,
    userPrompt: string,
    options: {
      maxTokens?: number
      preferredSlot?: 'language' | 'multimodal'
      temperature?: number
      json?: boolean
      attachments?: OmniAttachment[]
    } = {}
  ): Promise<{ text: string; model: string; provider: string }> {
    const messages: OmniMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userPrompt,
        ...(options.attachments?.length ? { attachments: options.attachments } : {}),
      },
    ]

    return retryWithBackoff(
      async () => {
        const result = await omniGateway.complete({
          task,
          preferredSlot: options.preferredSlot ?? 'language',
          messages,
          maxTokens: options.maxTokens ?? this.config.defaultMaxTokens,
          temperature: options.temperature ?? this.config.defaultTemperature,
          json: options.json,
          // Key: no model, baseUrl, or apiKey — OmniGateway resolves from user config
        })

        if (result.issue) {
          throw new Error(`OmniGateway error: ${result.issue.message}`)
        }

        return {
          text: result.text ?? '',
          model: result.model,
          provider: result.provider,
        }
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  }

  /**
   * Load an image file as base64 string
   */
  private async loadImageAsBase64(imagePath: string): Promise<string | null> {
    const fs = await import('fs')
    const path = await import('path')

    try {
      const absolutePath = path.isAbsolute(imagePath)
        ? imagePath
        : path.resolve(process.cwd(), imagePath.replace(/^\//u, ''))

      if (!fs.existsSync(absolutePath)) return null

      const buffer = fs.readFileSync(absolutePath)
      return buffer.toString('base64')
    } catch {
      return null
    }
  }

  /**
   * Analyze a figure using VLM (vision-language model) with image input
   */
  private async analyzeFigureWithVLM(
    figure: FigureContext,
    imageBase64: string,
    language: PromptLanguage,
    paperContext?: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const languageLabel = language === 'zh' ? '中文' : 'English'
    const systemPrompt = `你是一位严谨的研究图表分析专家。请用${languageLabel}深入分析以下学术图表。要求：
1. 准确描述图表展示的数据和趋势
2. 指出关键数值和对比关系
3. 解释图表支持的方法论主张
4. 指出图表的局限性和可能的审稿人质疑点`

    const userPrompt = `图 ${figure.number}: ${figure.caption || '无标题'}
${figure.analysis ? `已有文本分析: ${figure.analysis}` : ''}
${paperContext ? `论文: ${language === 'zh' ? paperContext.titleZh : paperContext.title}` : ''}

请深入分析此图。`

    const { text, model, provider } = await this.callOmni('figure_analysis', systemPrompt, userPrompt, {
      maxTokens: options?.maxTokens ?? 4000,
      preferredSlot: 'multimodal',
      attachments: [{
        type: 'image',
        mimeType: 'image/png',
        base64: imageBase64,
      }],
    })

    return {
      content: this.normalizeContent(text),
      isPosterStyle: false,
      paperAnalysis: undefined,
      usedTokens: 0,
      multiTurnUsed: false,
      passesCompleted: 1,
      provider,
      model,
    }
  }

  /**
   * Analyze a table using VLM with image input (optional, for table screenshots)
   */
  private async analyzeTableWithVLM(
    table: TableContext,
    imageBase64: string,
    language: PromptLanguage,
    paperContext?: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const languageLabel = language === 'zh' ? '中文' : 'English'
    const systemPrompt = `你是一位严谨的研究数据分析专家。请用${languageLabel}深入分析以下学术表格。要求：
1. 准确描述表格展示的数据和对比关系
2. 指出关键指标和性能差异
3. 解释表格支持的研究结论
4. 指出对比基线和潜在局限`

    const userPrompt = `表 ${table.number}: ${table.caption}
${paperContext ? `论文: ${language === 'zh' ? paperContext.titleZh : paperContext.title}` : ''}

请深入分析此表。`

    const { text, model, provider } = await this.callOmni('table_extraction', systemPrompt, userPrompt, {
      maxTokens: options?.maxTokens ?? 4000,
      preferredSlot: 'multimodal',
      attachments: [{
        type: 'image',
        mimeType: 'image/png',
        base64: imageBase64,
      }],
    })

    return {
      content: this.normalizeContent(text),
      isPosterStyle: false,
      paperAnalysis: undefined,
      usedTokens: 0,
      multiTurnUsed: false,
      passesCompleted: 1,
      provider,
      model,
    }
  }

  /**
   * Analyze a formula using VLM with image input (optional, for formula screenshots)
   */
  private async analyzeFormulaWithVLM(
    formula: FormulaContext,
    imageBase64: string,
    language: PromptLanguage,
    paperContext?: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const languageLabel = language === 'zh' ? '中文' : 'English'
    const systemPrompt = `你是一位严谨的数学公式分析专家。请用${languageLabel}深入分析以下学术公式。要求：
1. 准确识别公式中的数学符号和运算关系
2. 解释公式定义的约束或优化目标
3. 说明公式在论证中的作用
4. 指出公式的设计意图和潜在局限`

    const userPrompt = `公式 ${formula.number}: ${formula.latex || formula.rawText}
${paperContext ? `论文: ${language === 'zh' ? paperContext.titleZh : paperContext.title}` : ''}

请深入分析此公式。`

    const { text, model, provider } = await this.callOmni('formula_recognition', systemPrompt, userPrompt, {
      maxTokens: options?.maxTokens ?? 4000,
      preferredSlot: 'multimodal',
      attachments: [{
        type: 'image',
        mimeType: 'image/png',
        base64: imageBase64,
      }],
    })

    return {
      content: this.normalizeContent(text),
      isPosterStyle: false,
      paperAnalysis: undefined,
      usedTokens: 0,
      multiTurnUsed: false,
      passesCompleted: 1,
      provider,
      model,
    }
  }

  /**
   * Normalize generated content
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/\r\n/gu, '\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim()
  }

  /**
   * Detect language from node context
   */
  private detectLanguage(node: NodeContext): PromptLanguage {
    // Check if node has Chinese papers
    const hasChinesePapers = node.papers.some((paper) => paper.titleZh && paper.titleZh.length > 0)
    return hasChinesePapers ? 'zh' : 'en'
  }

  /**
   * Detect language from paper title
   */
  private detectLanguageFromTitle(paper: PaperContext): PromptLanguage {
    // If titleZh exists and is not empty, use Chinese
    if (paper.titleZh && paper.titleZh.length > 0) {
      return 'zh'
    }
    // Default to English for international papers
    return 'en'
  }

  // ==================== Context Builders ====================

  /**
   * Build node introduction context data
   */
  private buildNodeIntroductionContext(node: NodeContext, language: PromptLanguage): string {
    const parts: string[] = []

    parts.push(`节点名称: ${node.nodeLabel}`)
    if (node.nodeSubtitle) {
      parts.push(`节点副标题: ${node.nodeSubtitle}`)
    }
    parts.push(`节点摘要: ${node.nodeSummary}`)
    parts.push(`阶段索引: ${node.stageIndex}`)
    parts.push(`论文数量: ${node.papers.length}`)

    // First and last paper context
    if (node.papers.length > 0) {
      const firstPaper = node.papers[0]
      const lastPaper = node.papers[node.papers.length - 1]

      parts.push(`\n第一篇论文 (${firstPaper.published.toLocaleDateString()}):`)
      parts.push(`- 标题: ${language === 'zh' ? firstPaper.titleZh : firstPaper.title}`)
      parts.push(`- 摘要概要: ${firstPaper.summary}`)

      parts.push(`\n最后一篇论文 (${lastPaper.published.toLocaleDateString()}):`)
      parts.push(`- 标题: ${language === 'zh' ? lastPaper.titleZh : lastPaper.title}`)
      parts.push(`- 摘要概要: ${lastPaper.summary}`)
    }

    // Problem entry
    if (node.problemEntry) {
      parts.push(`\n问题入口: ${node.problemEntry}`)
    }

    // Technical handles
    if (node.technicalHandles?.length) {
      parts.push(`\n技术抓手: ${node.technicalHandles.join(', ')}`)
    }

    return parts.join('\n')
  }

  /**
   * Build node introduction user prompt
   */
  private buildNodeIntroductionUserPrompt(
    node: NodeContext,
    language: PromptLanguage,
    contextData: string
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请为以下研究节点撰写总述部分（引言），使用${langLabel}。

${contextData}

要求：
1. 说明节点的问题入口、第一篇论文的起始设定、最后一篇论文的阶段性落点
2. 指明贯穿节点的技术抓手
3. 解释这个节点为什么会在当前时间点出现
4. 写成连续叙事，不要写成项目符号堆砌
5. 语言清晰，保留必要的英文锚点（论文标题、方法名、模型名等）

请开始撰写：`
  }

  /**
   * Build paper analysis context data
   */
  private buildPaperAnalysisContext(
    paper: PaperContext,
    language: PromptLanguage,
    nodeContext?: NodeContext
  ): string {
    const parts: string[] = []

    parts.push(`论文标题: ${language === 'zh' ? paper.titleZh : paper.title}`)
    parts.push(`作者: ${paper.authors}`)
    parts.push(`发表日期: ${paper.published.toLocaleDateString()}`)
    parts.push(`摘要: ${paper.summary}`)

    // CRITICAL: Include full paper content from sections (not just section titles!)
    if (paper.sections.length > 0) {
      parts.push(`\n【论文全文内容】`)
      let fullContent = ''
      paper.sections.forEach((section) => {
        const title = section.editorialTitle || section.sourceSectionTitle
        const content = section.paragraphs || ''
        if (title) {
          fullContent += `\n## ${title}\n`
        }
        if (content) {
          fullContent += content + '\n'
        }
      })
      parts.push(fullContent)
    }

    // Use unified evidence context builder (includes figureGroups!)
    const evidenceContext = buildEvidenceContext(
      paper.figures.map((fig) => ({
        id: fig.id,
        number: fig.number,
        caption: fig.caption,
        page: fig.page,
        imagePath: fig.imagePath,
        analysis: fig.analysis ?? null,
      })),
      (paper.figureGroups ?? []).map((group) => ({
        id: group.id,
        groupId: group.parentNumber.toString(),
        caption: group.caption,
        page: group.page,
        subFigures: group.subFigures ?? [],
      })),
      paper.tables.map((table) => ({
        id: table.id,
        number: table.number,
        caption: table.caption,
        page: table.page,
        headers: table.headers ?? null,
        rows: table.rows ?? null,
        rawText: table.rawText,
      })),
      paper.formulas.map((formula) => ({
        id: formula.id,
        number: formula.number,
        latex: formula.latex,
        rawText: formula.rawText ?? null,
        page: formula.page,
      })),
      {
        maxFigures: 100,
        maxFigureGroups: 50,
        maxTables: 50,
        maxFormulas: 80,
        includeAnalysis: true,
      }
    )

    // Format evidence block for LLM
    const evidenceBlock = formatEvidenceBlock(evidenceContext, {
      language,
      maxCaptionLength: 200,
      includePageNumbers: false,
    })
    parts.push('')
    parts.push(evidenceBlock)

    // Node position
    if (nodeContext && paper.nodePosition) {
      parts.push(`\n节点位置: 第 ${paper.nodePosition} 篇，共 ${nodeContext.papers.length} 篇`)
      parts.push(`节点名称: ${nodeContext.nodeLabel}`)
    }

    return parts.join('\n')
  }

  /**
   * Build paper analysis user prompt
   */
  private buildPaperAnalysisUserPrompt(
    paper: PaperContext,
    language: PromptLanguage,
    contextData: string
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    // Build evidence IDs using unified builder
    const evidenceContext = buildEvidenceContext(
      paper.figures.map((fig) => ({
        id: fig.id,
        number: fig.number,
        caption: fig.caption,
        page: fig.page,
        imagePath: fig.imagePath,
        analysis: fig.analysis ?? null,
      })),
      (paper.figureGroups ?? []).map((group) => ({
        id: group.id,
        groupId: group.parentNumber.toString(),
        caption: group.caption,
        page: group.page,
        subFigures: group.subFigures ?? [],
      })),
      paper.tables.map((table) => ({
        id: table.id,
        number: table.number,
        caption: table.caption,
        page: table.page,
        headers: table.headers ?? null,
        rows: table.rows ?? null,
        rawText: table.rawText,
      })),
      paper.formulas.map((formula) => ({
        id: formula.id,
        number: formula.number,
        latex: formula.latex,
        rawText: formula.rawText ?? null,
        page: formula.page,
      }))
    )
    const evidenceIds = formatEvidenceIds(evidenceContext)

    return `你是资深学术编辑，正在为研究工作台撰写论文深度解读。请基于论文全文内容，使用${langLabel}撰写海报式分析。

${contextData}

可用证据ID: ${evidenceIds}

关键要求：
1. **阅读论文全文**，不要只基于摘要生成内容
2. **引用具体证据**：每个论点必须关联具体的图表公式编号（fig1, table2, eq3等）
3. **深度解读**：不要写"本文提出了..."这种学生作文风格，要像资深研究员对同行解释
4. **诚实边界**：指出实验没覆盖什么，审稿人会质疑什么

输出严格的JSON格式：
{
  "coreThesis": "20-30字核心论点，海报标题级",
  "coreThesisEn": "English translation of core thesis (20-30 words)",
  "paragraphs": [
    {"role": "thesis", "content": "...", "contentEn": "...", "wordCount": 25, "evidenceIds": []},
    {"role": "argument", "content": "...", "contentEn": "...", "wordCount": 65, "evidenceIds": ["fig1", "table2"]},
    {"role": "evidence", "content": "...", "contentEn": "...", "wordCount": 50, "evidenceIds": ["eq3"]},
    {"role": "insight", "content": "...", "contentEn": "...", "wordCount": 30, "evidenceIds": []}
  ],
  "closingInsight": "20-30字收束洞察，论文边界与接手点",
  "closingInsightEn": "English translation of closing insight (20-30 words)"
}

段落写作原则：
- thesis段落：开篇即点明核心推进，不铺垫背景
- argument段落：围绕具体图表、公式、实验数据展开
  - 不写"图X展示了..."，而写"Table 3显示XX在YY基准上提升Z%"
  - 不写"提出了XX方法"，而写"Eq.5定义的损失函数将XX约束引入"
- evidence段落：图表公式的论点说明，一句话抓住为什么重要
- insight段落：诚实边界 + 接手点，"审稿人会质疑XX，下一篇论文需要验证YY"
- 每段50-80字，evidenceIds引用可用证据ID列表中的ID
- 不允许跳过任何图表公式

绝对禁止：
- 分点式 subsections（background/problem/method/experiment/results...）
- 空泛描述"图X展示了..."
- 过度贡献声明（"决定性突破"）

${generatePosterStyleAnalysisPrompt(language)}

请直接输出JSON：`
  }

  /**
   * Build figure description user prompt
   */
  private buildFigureDescriptionUserPrompt(
    figure: FigureContext,
    language: PromptLanguage,
    paperContext?: PaperContext
  ): string {
    const parts: string[] = []

    parts.push(`图 ${figure.number}: ${figure.caption}`)
    parts.push(`所在页面: ${figure.page}`)

    if (figure.analysis) {
      parts.push(`现有分析: ${figure.analysis}`)
    }

    if (paperContext) {
      parts.push(`\n论文: ${language === 'zh' ? paperContext.titleZh : paperContext.title}`)
      parts.push(`研究问题: ${paperContext.researchProblem ?? paperContext.summary}`)
    }

    if (figure.researchQuestion) {
      parts.push(`\n该图针对的研究问题: ${figure.researchQuestion}`)
    }

    if (figure.keyObservations?.length) {
      parts.push(`关键观察: ${figure.keyObservations.join(', ')}`)
    }

    return `请解释以下图表在论证中的作用，使用${language === 'zh' ? '中文' : 'English'}。

${parts.join('\n')}

请回答：
1. 这条证据想证明什么判断
2. 它真正展示了什么现象或数据
3. 它支撑了正文里的哪一段论点
4. 它是否存在替代解释或边界条件

不要只描述"图里有什么"，要回到研究问题本身。`
  }

  /**
   * Build table description user prompt
   */
  private buildTableDescriptionUserPrompt(
    table: TableContext,
    language: PromptLanguage,
    paperContext?: PaperContext
  ): string {
    const parts: string[] = []

    parts.push(`表 ${table.number}: ${table.caption}`)
    parts.push(`表头: ${table.headers}`)
    parts.push(`所在页面: ${table.page}`)

    if (paperContext) {
      parts.push(`\n论文: ${language === 'zh' ? paperContext.titleZh : paperContext.title}`)
    }

    if (table.keyMetrics?.length) {
      parts.push(`关键指标: ${table.keyMetrics.join(', ')}`)
    }

    return `请解释以下表格在论证中的作用，使用${language === 'zh' ? '中文' : 'English'}。

${parts.join('\n')}

请回答：
1. 这条证据想证明什么判断
2. 它展示了什么数据对比
3. 不要跳过对比基线
4. 它支撑了正文里的哪一段论点

不要只描述"表里有什么"，要回到研究问题本身。`
  }

  /**
   * Build formula description user prompt
   */
  private buildFormulaDescriptionUserPrompt(
    formula: FormulaContext,
    language: PromptLanguage,
    paperContext?: PaperContext
  ): string {
    const parts: string[] = []

    parts.push(`公式 ${formula.number}:`)
    parts.push(`LaTeX: ${formula.latex}`)
    parts.push(`原始文本: ${formula.rawText}`)
    parts.push(`所在页面: ${formula.page}`)

    if (paperContext) {
      parts.push(`\n论文: ${language === 'zh' ? paperContext.titleZh : paperContext.title}`)
    }

    if (formula.variableDefinitions) {
      parts.push(`\n变量定义:`)
      Object.entries(formula.variableDefinitions).forEach(([varName, meaning]) => {
        parts.push(`- ${varName}: ${meaning}`)
      })
    }

    return `请解释以下公式在论证中的作用，使用${language === 'zh' ? '中文' : 'English'}。

${parts.join('\n')}

请回答：
1. 这条证据想证明什么判断
2. 它定义了什么约束或目标
3. 它支撑了正文里的哪一段论点
4. 如果是损失函数或训练目标，解释其设计意图

不要把公式当成装饰，它是论证的核心。`
  }

  /**
   * Build node synthesis context data
   */
  private buildNodeSynthesisContext(node: NodeContext, language: PromptLanguage): string {
    const parts: string[] = []

    parts.push(`节点: ${node.nodeLabel}`)
    parts.push(`论文数量: ${node.papers.length}`)

    // Paper summaries for synthesis
    parts.push(`\n论文列表:`)
    node.papers.forEach((paper, index) => {
      const title = language === 'zh' ? paper.titleZh : paper.title
      parts.push(`${index + 1}. ${title} (${paper.published.toLocaleDateString()})`)
      if (paper.keyContributions?.length) {
        parts.push(`   贡献: ${paper.keyContributions.join(', ')}`)
      }
    })

    // Cross-paper evidence
    if (node.crossPaperEvidence?.length) {
      parts.push(`\n跨论文证据链:`)
      node.crossPaperEvidence.forEach((evidence) => {
        parts.push(`- ${evidence.evidenceType}: ${evidence.description}`)
        parts.push(`  涉及论文: ${evidence.paperIds.join(', ')}`)
        parts.push(`  类型: ${evidence.reusedOrStrengthened ? '复用/补强' : '分歧/替代'}`)
      })
    }

    // Advances
    if (node.advances) {
      parts.push(`\n推进内容: ${node.advances}`)
    }

    // Problems out
    if (node.problemsOut?.length) {
      parts.push(`\n遗留问题: ${node.problemsOut.join('; ')}`)
    }

    return parts.join('\n')
  }

  /**
   * Build node synthesis user prompt
   */
  private buildNodeSynthesisUserPrompt(
    node: NodeContext,
    language: PromptLanguage,
    contextData: string
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请为以下研究节点撰写总结部分（收束），使用${langLabel}。

${contextData}

要求：
1. 把多篇论文放在一起，说明这条问题线到底推进了什么
2. 指出哪些证据被多篇论文复用或补强
3. 说明哪些地方出现了分歧或替代路线
4. 给出节点的整体判断，不是"哪篇最好"
5. 指出下一个阶段最需要解决的问题是什么

不要写成"这篇好、那篇也好"的并列评价。请开始撰写：`
  }

  /**
   * Build reference list user prompt
   */
  private buildReferenceListUserPrompt(
    references: ReferenceEntry[],
    language: PromptLanguage
  ): string {
    const parts: string[] = []

    parts.push(`参考文献列表 (${references.length} 条):`)

    references.forEach((ref, index) => {
      parts.push(`\n${index + 1}. ${ref.title}`)
      parts.push(`   作者: ${ref.authors}`)
      parts.push(`   发表: ${ref.published.toLocaleDateString()}`)
      if (ref.arxivId) {
        parts.push(`   arXiv: ${ref.arxivId}`)
      }
      if (ref.url) {
        parts.push(`   URL: ${ref.url}`)
      }
    })

    const formatNote = language === 'zh'
      ? '使用中文期刊标准格式：作者. 标题. 发表年份. arXiv/DOI. URL.'
      : 'Use standard academic citation format: Author(s). Title. Year. arXiv/DOI. URL.'

    return `请将以下论文整理为标准学术参考文献列表，使用${language === 'zh' ? '中文' : 'English'}格式。

${parts.join('\n')}

${formatNote}

请直接输出参考文献列表，不需要额外说明：`
  }

  /**
   * Build complete node article context
   */
  private buildCompleteNodeArticleContext(node: NodeContext, language: PromptLanguage): string {
    const introContext = this.buildNodeIntroductionContext(node, language)
    const synthesisContext = this.buildNodeSynthesisContext(node, language)

    const parts: string[] = []
    parts.push('=== 节点总述信息 ===')
    parts.push(introContext)
    parts.push('\n=== 各论文详情 ===')

    node.papers.forEach((paper, index) => {
      const paperContext = this.buildPaperAnalysisContext(paper, language, node)
      parts.push(`\n--- 论文 ${index + 1} ---`)
      parts.push(paperContext)
    })

    parts.push('\n=== 节点综合信息 ===')
    parts.push(synthesisContext)

    return parts.join('\n')
  }

  /**
   * Build complete node article user prompt
   */
  private buildCompleteNodeArticleUserPrompt(
    node: NodeContext,
    language: PromptLanguage,
    contextData: string
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请为以下研究节点撰写完整的学术评述文章，使用${langLabel}。

${contextData}

结构要求：
1. 总述部分：说明节点的问题入口、起始设定、落点和技术抓手
2. 分述部分：逐篇论文展开，每篇围绕图表、公式、实验数据
3. 收束部分：跨论文综合、证据链、整体判断、下一步问题

写作原则：
- 正文要有连续叙事，不要写成项目符号堆砌
- 每个 major 判断都要落回证据
- 解释图表时，要回到研究问题本身
- 不允许跳过输入里的论文、figure、table、formula
- 贡献表述要保守，不要轻易写成"彻底解决"或"决定性突破"

请开始撰写完整文章：`
  }

  /**
   * Build refinement system prompt
   */
  private buildRefinementSystemPrompt(
    originalSystemPrompt: string,
    currentPass: number,
    totalPasses: number,
    language: PromptLanguage
  ): string {
    const passContext = language === 'zh'
      ? `这是第 ${currentPass + 1} 轮精修（共 ${totalPasses} 轮）。请继续完善和扩展内容。`
      : `This is pass ${currentPass + 1} of ${totalPasses}. Continue refining and expanding the content.`

    return `${originalSystemPrompt}

${passContext}

精修要求：
- 检查是否有遗漏的论文、图表、公式
- 补充缺失的证据链和论证
- 删除重复或冗余的内容
- 强化关键判断的支撑
- 确保学术风格的连贯性`
  }

  /**
   * Build refinement prompt for multi-turn
   */
  private buildRefinementPrompt(
    accumulatedContent: string,
    currentPass: number,
    totalPasses: number,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `以下是已生成的内容（第 ${currentPass} 轮）：

${accumulatedContent}

请继续完善这篇文章（使用${langLabel}），进行第 ${currentPass + 1}/${totalPasses} 轮精修。

精修重点：
1. 补充缺失的论文分析或图表描述
2. 强化证据链的完整性
3. 删除冗余或重复内容
4. 确保学术风格的统一
5. 检查引用和参考文献的完整性

请输出完善后的内容：`
  }

  /**
   * Merge content from different passes
   */
  private mergeContent(
    previousContent: string,
    newContent: string,
    passNumber: number,
    _language: PromptLanguage
  ): string {
    // For pass 1, just use the new content
    if (passNumber === 1) {
      return newContent
    }

    // For subsequent passes, intelligently merge
    // Simple strategy: use the new content as it's refined
    // More sophisticated strategies could be added here

    // Check if new content is substantially different
    if (newContent.length > previousContent.length * 0.8) {
      // New content seems comprehensive, use it
      return newContent
    }

    // Otherwise, append additions to previous
    const previousSections = previousContent.split('\n\n')
    const newSections = newContent.split('\n\n')

    // Find unique additions
    const additions = newSections.filter(
      (section) => !previousSections.some((prev) => prev.includes(section.slice(0, 50)))
    )

    if (additions.length > 0) {
      return `${previousContent}\n\n${additions.join('\n\n')}`
    }

    return previousContent
  }

  /**
   * Parse poster-style JSON response from LLM
   *
   * Attempts to extract coreThesis, paragraphs, closingInsight from the response.
   * Falls back to legacy subsections format if poster-style parsing fails.
   */
  private parsePosterStyleResponse(rawContent: string, paper: PaperContext): PaperAnalysisResult {
    // Try to extract JSON from the response
    const jsonStr = this.extractJsonFromResponse(rawContent)

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>

        // Check if it's poster-style format (has coreThesis + paragraphs)
        if (this.isPosterStyleFormat(parsed)) {
          return this.buildPosterStyleResult(parsed, paper)
        }

        // Check if it's legacy subsections format
        if (this.isLegacyFormat(parsed)) {
          return this.buildLegacyResult(parsed)
        }
      } catch {
        // JSON parse failed, fall through to legacy conversion
      }
    }

    // Fallback: convert raw text content to legacy format
    return this.convertRawTextToLegacy(rawContent, paper)
  }

  /**
   * Extract JSON string from LLM response
   *
   * Handles cases where JSON is wrapped in markdown code blocks
   * or has surrounding text.
   */
  private extractJsonFromResponse(content: string): string | null {
    // Try to find JSON in markdown code block first
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/u)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }

    // Try to find raw JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/u)
    if (jsonMatch) {
      return jsonMatch[0]
    }

    return null
  }

  /**
   * Check if parsed JSON is poster-style format
   */
  private isPosterStyleFormat(parsed: Record<string, unknown>): boolean {
    return (
      typeof parsed['coreThesis'] === 'string' &&
      Array.isArray(parsed['paragraphs']) &&
      typeof parsed['closingInsight'] === 'string'
    )
  }

  /**
   * Check if parsed JSON is legacy subsections format
   */
  private isLegacyFormat(parsed: Record<string, unknown>): boolean {
    return (
      Array.isArray(parsed['subsections']) ||
      typeof parsed['introduction'] === 'string' ||
      typeof parsed['conclusion'] === 'string'
    )
  }

  /**
   * Build PosterStylePaperAnalysis from parsed JSON
   */
  private buildPosterStyleResult(
    parsed: Record<string, unknown>,
    _paper: PaperContext
  ): PosterStylePaperAnalysis {
    const coreThesis = String(parsed['coreThesis'] ?? '')
    const closingInsight = String(parsed['closingInsight'] ?? '')
    const rawParagraphs = parsed['paragraphs'] as Array<Record<string, unknown>> ?? []

    const paragraphs: PaperParagraph[] = rawParagraphs.map((p, index) => ({
      role: this.validateParagraphRole(String(p['role'] ?? 'argument')),
      title: typeof p['title'] === 'string' ? p['title'] : undefined,
      content: String(p['content'] ?? ''),
      wordCount: typeof p['wordCount'] === 'number' ? p['wordCount'] : this.countWords(String(p['content'] ?? '')),
      evidenceIds: Array.isArray(p['evidenceIds'])
        ? (p['evidenceIds'] as string[]).filter((id): id is string => typeof id === 'string')
        : [],
      sortIndex: index,
    }))

    // Ensure at least one thesis paragraph exists
    if (!paragraphs.some((p) => p.role === 'thesis')) {
      paragraphs.unshift({
        role: 'thesis',
        content: coreThesis,
        wordCount: this.countWords(coreThesis),
        evidenceIds: [],
        sortIndex: 0,
      })
      // Re-index
      paragraphs.forEach((p, i) => { p.sortIndex = i })
    }

    return {
      coreThesis,
      coreThesisEn: typeof parsed['coreThesisEn'] === 'string' ? parsed['coreThesisEn'] : undefined,
      paragraphs,
      closingInsight,
      closingInsightEn: typeof parsed['closingInsightEn'] === 'string' ? parsed['closingInsightEn'] : undefined,
      contentVersion: 'v2',
    }
  }

  /**
   * Build LegacyPaperAnalysis from parsed JSON
   */
  private buildLegacyResult(parsed: Record<string, unknown>): LegacyPaperAnalysis {
    const rawSubsections = parsed['subsections'] as Array<Record<string, unknown>> ?? []

    return {
      introduction: typeof parsed['introduction'] === 'string' ? parsed['introduction'] : undefined,
      subsections: rawSubsections.map((s) => ({
        kind: this.validateSubsectionKind(String(s['kind'] ?? 'background')),
        title: String(s['title'] ?? ''),
        content: String(s['content'] ?? ''),
        wordCount: typeof s['wordCount'] === 'number' ? s['wordCount'] : 0,
        keyPoints: Array.isArray(s['keyPoints']) ? (s['keyPoints'] as string[]) : [],
        evidenceIds: Array.isArray(s['evidenceIds']) ? (s['evidenceIds'] as string[]) : [],
      })),
      conclusion: typeof parsed['conclusion'] === 'string' ? parsed['conclusion'] : undefined,
      contentVersion: 'v1',
    }
  }

  /**
   * Convert raw text content to legacy format as fallback
   */
  private convertRawTextToLegacy(rawContent: string, _paper: PaperContext): LegacyPaperAnalysis {
    // Split content into rough sections by double newlines
    const sections = rawContent.split(/\n{2,}/u).filter((s) => s.trim().length > 0)

    const subsections = sections.map((section, index) => ({
      kind: this.inferSubsectionKind(section, index, sections.length) as PaperSubsectionKind,
      title: this.extractSectionTitle(section),
      content: section.trim(),
      wordCount: this.countWords(section),
      keyPoints: [],
      evidenceIds: [],
    }))

    return {
      introduction: subsections.length > 0 ? subsections[0].content : rawContent,
      subsections,
      conclusion: subsections.length > 1 ? subsections[subsections.length - 1].content : undefined,
      contentVersion: 'v1',
    }
  }

  /**
   * Validate paragraph role, defaulting to 'argument' if invalid
   */
  private validateParagraphRole(role: string): ParagraphRole {
    const validRoles: ParagraphRole[] = ['thesis', 'argument', 'evidence', 'insight']
    return validRoles.includes(role as ParagraphRole) ? (role as ParagraphRole) : 'argument'
  }

  /**
   * Validate subsection kind, defaulting to 'background' if invalid
   */
  private validateSubsectionKind(kind: string): PaperSubsectionKind {
    const validKinds: PaperSubsectionKind[] = [
      'background', 'problem', 'method', 'experiment',
      'results', 'contribution', 'limitation', 'significance'
    ]
    return validKinds.includes(kind as PaperSubsectionKind) ? (kind as PaperSubsectionKind) : 'background'
  }

  /**
   * Count words in text (handles both Chinese and English)
   */
  private countWords(text: string): number {
    // Chinese characters count as individual words
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/gu) ?? []).length
    // English words
    const englishWords = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/gu, ' ')
      .split(/\s+/u)
      .filter((w) => w.length > 0).length
    return chineseChars + englishWords
  }

  /**
   * Infer subsection kind from content and position
   */
  private inferSubsectionKind(
    _section: string,
    index: number,
    total: number
  ): PaperSubsectionKind {
    if (index === 0) return 'background'
    if (index === total - 1) return 'significance'
    if (index === 1) return 'problem'
    if (index === 2) return 'method'
    if (index === 3) return 'experiment'
    if (index === 4) return 'results'
    return 'contribution'
  }

  /**
   * Extract section title from content (first line or heading)
   */
  private extractSectionTitle(section: string): string {
    const firstLine = section.split('\n')[0]?.trim() ?? ''
    // Remove markdown heading markers
    const cleaned = firstLine.replace(/^#{1,6}\s*/u, '').trim()
    // Truncate if too long
    return cleaned.length > 200 ? cleaned.slice(0, 197) + '...' : cleaned
  }

  /**
   * Extract arxiv ID from URL
   */
  private extractArxivId(arxivUrl?: string): string | undefined {
    if (!arxivUrl) return undefined
    const match = arxivUrl.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/u)
    return match?.[1]
  }

  /**
   * Validate bilingual completeness of a poster-style paper analysis.
   *
   * Checks that all required English fields are present and have
   * sufficient content length.
   */
  private validateBilingualContent(content: PosterStylePaperAnalysis): boolean {
    if (!content.coreThesisEn || content.coreThesisEn.length < 20) return false
    for (const para of content.paragraphs) {
      if (!para.contentEn || para.contentEn.length < 20) return false
    }
    if (!content.closingInsightEn || content.closingInsightEn.length < 10) return false
    return true
  }

  /**
   * Ensure bilingual content is complete.
   *
   * If validation fails, generates supplementary English content
   * via a follow-up LLM call.
   */
  private async ensureBilingualContent(
    content: PosterStylePaperAnalysis,
    language: PromptLanguage
  ): Promise<PosterStylePaperAnalysis> {
    if (this.validateBilingualContent(content)) {
      return content
    }

    console.warn('[NodeEditorialAgent] Bilingual validation failed, generating English supplement', {
      coreThesisEn: content.coreThesisEn?.length ?? 0,
      paragraphsMissingEn: content.paragraphs.filter(p => !p.contentEn || p.contentEn.length < 20).length,
      closingInsightEn: content.closingInsightEn?.length ?? 0,
    })

    const supplement = await this.generateEnglishSupplement(content, language)
    return { ...content, ...supplement }
  }

  /**
   * Generate English supplement for missing bilingual fields.
   *
   * Makes a follow-up LLM call to translate/generate English versions
   * of coreThesis, paragraphs, and closingInsight.
   */
  private async generateEnglishSupplement(
    content: PosterStylePaperAnalysis,
    _language: PromptLanguage
  ): Promise<Partial<PosterStylePaperAnalysis>> {
    const systemPrompt = `You are an academic translation expert. Translate the following Chinese academic content into precise, formal academic English. Maintain the original logical structure and argumentation. Use standard English terminology for technical terms.`

    const paragraphsData = content.paragraphs.map((p, i) => ({
      index: i,
      role: p.role,
      content: p.content,
      contentEn: p.contentEn ?? '',
    }))

    const userPrompt = `Translate the following academic paper analysis into English. Output strict JSON format.

Core thesis (Chinese): ${content.coreThesis}
${content.coreThesisEn ? `Core thesis (existing English): ${content.coreThesisEn}` : ''}

Paragraphs:
${paragraphsData.map(p => `[${p.index}] (${p.role}): ${p.content}${p.contentEn ? `\n  Existing English: ${p.contentEn}` : ''}`).join('\n')}

Closing insight (Chinese): ${content.closingInsight}
${content.closingInsightEn ? `Closing insight (existing English): ${content.closingInsightEn}` : ''}

Output JSON:
{
  "coreThesisEn": "English translation of core thesis (20-30 words)",
  "paragraphContentEn": ["English translation of paragraph 0", "English translation of paragraph 1", ...],
  "closingInsightEn": "English translation of closing insight (20-30 words)"
}

Requirements:
1. Accurate academic English translation
2. Preserve logical structure and argumentation
3. Use standard English terminology for technical terms
4. Each paragraph translation should be 50-80 words

Output JSON directly:`

    try {
      const { text } = await this.callOmni('topic_summary', systemPrompt, userPrompt, {
        maxTokens: 4000,
        preferredSlot: 'language',
        temperature: 0.15,
      })

      const jsonStr = this.extractJsonFromResponse(text)
      if (!jsonStr) return {}

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>

      const result: Partial<PosterStylePaperAnalysis> = {}

      if (typeof parsed['coreThesisEn'] === 'string' && parsed['coreThesisEn'].length >= 20) {
        result.coreThesisEn = parsed['coreThesisEn']
      }

      if (typeof parsed['closingInsightEn'] === 'string' && parsed['closingInsightEn'].length >= 10) {
        result.closingInsightEn = parsed['closingInsightEn']
      }

      if (Array.isArray(parsed['paragraphContentEn'])) {
        const enContents = parsed['paragraphContentEn'] as string[]
        result.paragraphs = content.paragraphs.map((para, i) => {
          const enContent = enContents[i]
          if (enContent && typeof enContent === 'string' && enContent.length >= 20) {
            return { ...para, contentEn: enContent }
          }
          return para
        })
      }

      return result
    } catch (error) {
      console.warn('[NodeEditorialAgent] English supplement generation failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {}
    }
  }
}

// ============================================================================
// Style Metrics - 编辑风格质量指标
// ============================================================================

/**
 * Evidence input for style metrics calculation
 */
export interface EvidenceForMetrics {
  id: string
  type: 'figure' | 'figureGroup' | 'table' | 'formula'
}

/**
 * Style metrics result - 编辑风格质量指标
 *
 * 用于评估生成内容是否符合写作风格要求：
 * - 证据覆盖度（claim-to-evidence ratio）
 * - 可读性指标
 * - 学术风格符合度
 */
export interface StyleMetrics {
  /** 证据覆盖率 (0-1) - 有证据支撑的论点比例 */
  evidenceCoverage: number
  /** 论点/证据比 - 每个证据支撑的论点数量 */
  claimToEvidenceRatio: number
  /** 可读性分数 (0-100) - 基于句子长度和段落结构 */
  readabilityScore: number
  /** 学术语气分数 (0-1) - 检测是否使用学术表达 */
  academicToneScore: number
  /** 平均句子长度 (字符数) */
  averageSentenceLength: number
  /** 段落数量 */
  paragraphCount: number
  /** 平均段落长度 (字符数) */
  averageParagraphLength: number
  /** 引用的图表数量 */
  referencedFigures: number
  /** 引用的表格数量 */
  referencedTables: number
  /** 引用的公式数量 */
  referencedFormulas: number
  /** 总证据引用数 */
  totalEvidenceReferences: number
}

/**
 * 计算编辑风格质量指标
 *
 * 纯函数，无副作用。分析生成内容的质量指标：
 * - 论点数量 vs 证据数量
 * - 句子长度分布
 * - 段落结构
 * - 是否引用了图表/公式
 *
 * @param content - 生成的文本内容
 * @param evidence - 可用的证据列表
 * @returns StyleMetrics - 风格质量指标
 *
 * @example
 * ```typescript
 * const metrics = calculateStyleMetrics(generatedContent, [
 *   { id: 'fig1', type: 'figure' },
 *   { id: 'table1', type: 'table' },
 *   { id: 'eq1', type: 'formula' },
 * ])
 * console.log(`证据覆盖率: ${metrics.evidenceCoverage.toFixed(2)}`)
 * ```
 */
export function calculateStyleMetrics(
  content: string,
  evidence: EvidenceForMetrics[] = []
): StyleMetrics {
  // 1. 分析段落结构
  const paragraphs = content
    .split(/\n{2,}/u)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  const paragraphCount = paragraphs.length
  const totalLength = content.length
  const averageParagraphLength = paragraphCount > 0 ? totalLength / paragraphCount : 0

  // 2. 分析句子结构
  // 中文句子分隔：句号、问号、感叹号
  // 英文句子分隔：. ! ? 后跟空格或换行
  const sentences = content
    .split(/[。！？.!?](?:\s|$|\n)/u)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const sentenceCount = sentences.length
  const totalSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0)
  const averageSentenceLength = sentenceCount > 0 ? totalSentenceLength / sentenceCount : 0

  // 3. 检测证据引用
  // 证据ID格式: fig1, fig2, table1, eq1, figGroup1
  const figureRefs = (content.match(/fig(?:ure)?\s*\d+|图\s*\d+/giu) ?? []).length
  const tableRefs = (content.match(/table\s*\d+|表\s*\d+/giu) ?? []).length
  const formulaRefs = (content.match(/eq(?:uation)?\.?\s*\d+|公式\s*\d+/giu) ?? []).length
  const figGroupRefs = (content.match(/figGroup\d+|组图\s*\d+/giu) ?? []).length

  const referencedFigures = figureRefs + figGroupRefs
  const referencedTables = tableRefs
  const referencedFormulas = formulaRefs
  const totalEvidenceReferences = referencedFigures + referencedTables + referencedFormulas

  // 4. 计算证据覆盖率
  // 论点数量估计：段落中包含判断性词汇的句子
  const claimIndicators = [
    // 中文论点指示词
    '证明', '表明', '显示', '说明', '意味着', '揭示了', '证实',
    '验证了', '实现了', '提出了', '发现了', '改进了', '提升了',
    // 英文论点指示词
    'shows', 'demonstrates', 'proves', 'indicates', 'suggests',
    'reveals', 'confirms', 'validates', 'achieves', 'improves',
  ]
  const claimPattern = new RegExp(claimIndicators.join('|'), 'giu')
  const claimCount = (content.match(claimPattern) ?? []).length

  // 证据覆盖率：有证据支撑的论点比例
  const availableEvidence = evidence.length
  const evidenceCoverage = claimCount > 0 && availableEvidence > 0
    ? Math.min(1, totalEvidenceReferences / Math.max(claimCount, 1))
    : 0

  // 论点/证据比：每个证据支撑的论点数量
  const claimToEvidenceRatio = totalEvidenceReferences > 0
    ? claimCount / totalEvidenceReferences
    : 0

  // 5. 计算可读性分数 (0-100)
  // 基于句子长度和段落结构的综合评分
  // 理想句子长度：中文 20-40 字，英文 15-25 词
  const idealSentenceLength = 30 // 混合文本的理想值
  const sentenceLengthDeviation = Math.abs(averageSentenceLength - idealSentenceLength)
  const sentenceLengthScore = Math.max(0, 100 - sentenceLengthDeviation * 2)

  // 理想段落长度：150-300 字符
  const idealParagraphLength = 200
  const paragraphLengthDeviation = Math.abs(averageParagraphLength - idealParagraphLength)
  const paragraphLengthScore = Math.max(0, 100 - paragraphLengthDeviation * 0.3)

  // 段落数量评分：3-10 个段落为理想
  const idealParagraphCount = 6
  const paragraphCountDeviation = Math.abs(paragraphCount - idealParagraphCount)
  const paragraphCountScore = Math.max(0, 100 - paragraphCountDeviation * 10)

  const readabilityScore = (sentenceLengthScore + paragraphLengthScore + paragraphCountScore) / 3

  // 6. 计算学术语气分数 (0-1)
  // 检测是否使用学术表达
  const academicIndicators = [
    // 中文学术表达
    '本文', '本研究', '该研究', '实验结果', '研究表明', '数据表明',
    '分析表明', '综上所述', '值得注意的是', '进一步分析', '对比分析',
    '实验验证', '理论分析', '实证研究', '定量分析', '定性分析',
    // 英文学术表达
    'this paper', 'this study', 'the results', 'our analysis',
    'we demonstrate', 'we show', 'in conclusion', 'furthermore',
    'moreover', 'specifically', 'notably', 'in contrast',
  ]
  const academicPattern = new RegExp(academicIndicators.join('|'), 'giu')
  const academicMatches = (content.match(academicPattern) ?? []).length

  // 非学术表达检测
  const nonAcademicIndicators = [
    // 非学术表达
    '我觉得', '我认为', '感觉', '好像', '大概', '应该',
    'I think', 'I feel', 'maybe', 'probably', 'I guess',
  ]
  const nonAcademicPattern = new RegExp(nonAcademicIndicators.join('|'), 'giu')
  const nonAcademicMatches = (content.match(nonAcademicPattern) ?? []).length

  // 学术语气分数：学术表达越多越好，非学术表达越少越好
  const academicRatio = academicMatches / Math.max(sentenceCount, 1)
  const nonAcademicPenalty = nonAcademicMatches * 0.1
  const academicToneScore = Math.max(0, Math.min(1, academicRatio * 5 - nonAcademicPenalty))

  return {
    evidenceCoverage,
    claimToEvidenceRatio,
    readabilityScore,
    academicToneScore,
    averageSentenceLength,
    paragraphCount,
    averageParagraphLength,
    referencedFigures,
    referencedTables,
    referencedFormulas,
    totalEvidenceReferences,
  }
}

/**
 * Default export: singleton instance
 */
export const nodeEditorialAgent = new NodeEditorialAgent()

/**
 * Create a new editorial agent with custom configuration
 */
export function createNodeEditorialAgent(config?: Partial<EditorialAgentConfig>): NodeEditorialAgent {
  return new NodeEditorialAgent(config)
}

export const __testing = {
  resolveNodeEditorialConfig,
}
