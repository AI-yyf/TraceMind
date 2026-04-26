/**
 * Paper Editorial Agent
 *
 * Specialized agent for generating deep academic paper analysis.
 * Focuses on single-paper deep reading with:
 * - Comprehensive paper analysis with academic style
 * - Method section analysis with formula grounding
 * - Experiment section analysis with table grounding
 * - Result interpretation with evidence chains
 * - Limitation and contribution assessment
 * - Reviewer-style critique
 *
 * Delegates model selection to OmniGateway, which resolves the user's
 * configured VLM/LLM from the model_configs table. No hardcoded model
 * or base URL fallbacks — OmniGateway handles the full resolution chain.
 */

import {
  getPaperEditorialInstructions,
  getEvidenceEditorialInstructions,
} from '../../../shared/editorial-prompt'
import {
  buildEvidenceContext,
  formatEvidenceBlock,
} from '../../../shared/evidence-context-builder'
import type { PromptLanguage } from '../generation/prompt-registry'
import { retryWithBackoff } from '../../utils/retry'
import { omniGateway } from '../omni/gateway'
import type { OmniTask, OmniMessage, OmniAttachment } from '../../../shared/model-config'
import type {
  EditorialAgentConfig,
  EditorialGenerationOptions,
  EditorialGenerationResult,
  NodeContext,
  PaperContext,
  PaperSection,
} from './types'

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

function resolvePaperEditorialEnvDefaults(): Partial<EditorialAgentConfig> {
  const rolePrefix = 'OMNI_ROLE_PAPER_WRITER'
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
 * Resolve the paper editorial agent configuration.
 *
 * OmniGateway handles model/key/baseUrl resolution from the user's
 * model_configs, so we no longer read env vars or use hardcoded
 * fallbacks for those fields. Only generation parameters (maxTokens,
 * temperature, passes, timeout) are configured here.
 */
function resolvePaperEditorialConfig(config?: Partial<EditorialAgentConfig>): EditorialAgentConfig {
  const envDefaults = resolvePaperEditorialEnvDefaults()
  return {
    // baseUrl, apiKey, model are intentionally omitted — OmniGateway resolves them
    baseUrl: config?.baseUrl ?? envDefaults.baseUrl,
    apiKey: config?.apiKey ?? envDefaults.apiKey,
    model: config?.model ?? envDefaults.model,
    defaultMaxTokens: config?.defaultMaxTokens ?? envDefaults.defaultMaxTokens ?? 16000,
    defaultTemperature: config?.defaultTemperature ?? envDefaults.defaultTemperature ?? 0.18,
    defaultPasses: config?.defaultPasses ?? 3,
    timeoutMs: config?.timeoutMs ?? 120000,
  }
}

/**
 * Paper Editorial Agent class
 */
export class PaperEditorialAgent {
  private config: EditorialAgentConfig

  constructor(config?: Partial<EditorialAgentConfig>) {
    this.config = resolvePaperEditorialConfig(config)
  }

  /**
   * Generate comprehensive paper analysis (完整论文分析)
   *
   * Deep review covering:
   * - Why this paper appears in current node
   * - Method line or problem line it advances
   * - Evidence (figures, formulas, experiments) supporting key judgments
   * - Boundaries and reviewer questions
   */
  async generateComprehensiveAnalysis(
    paper: PaperContext,
    nodeContext?: NodeContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = getPaperEditorialInstructions(language)

    const contextData = this.buildPaperContextData(paper, language, nodeContext)
    const userPrompt = this.buildComprehensiveAnalysisPrompt(paper, contextData, language)

    return this.generateMultiTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      passes: options?.passes ?? 3,
      maxTokens: options?.maxTokens ?? 32000,
    })
  }

  /**
   * Generate method section analysis (方法部分分析)
   *
   * Focuses on:
   * - Specific formulas and architecture diagrams
   * - Training objectives and loss functions
   * - Novel techniques and design rationale
   */
  async generateMethodSectionAnalysis(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = this.buildMethodAnalysisSystemPrompt(language)

    const methodSection = this.findMethodSection(paper)
    const contextData = this.buildMethodContextData(paper, methodSection, language)
    const userPrompt = this.buildMethodAnalysisPrompt(paper, contextData, language)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 8000,
    })
  }

  /**
   * Generate experiment section analysis (实验部分分析)
   *
   * Focuses on:
   * - Specific tables and performance comparisons
   * - Ablation analyses and key metrics
   * - Dataset descriptions and evaluation protocols
   */
  async generateExperimentSectionAnalysis(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = this.buildExperimentAnalysisSystemPrompt(language)

    const experimentSection = this.findExperimentSection(paper)
    const contextData = this.buildExperimentContextData(paper, experimentSection, language)
    const userPrompt = this.buildExperimentAnalysisPrompt(paper, contextData, language)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 8000,
    })
  }

  /**
   * Generate result interpretation (结果解释)
   *
   * Focuses on:
   * - Evidence-based result interpretation
   * - What the results actually prove vs. what authors claim
   * - Boundary conditions and limitations
   */
  async generateResultInterpretation(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = this.buildResultInterpretationSystemPrompt(language)

    const contextData = this.buildResultContextData(paper, language)
    const userPrompt = this.buildResultInterpretationPrompt(paper, contextData, language)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 4000,
    })
  }

  /**
   * Generate contribution assessment (贡献评估)
   *
   * Conservative assessment of paper contributions with:
   * - Actual advances vs. claimed advances
   * - Novelty assessment
   * - Impact potential
   */
  async generateContributionAssessment(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = this.buildContributionSystemPrompt(language)

    const contextData = this.buildContributionContextData(paper, language)
    const userPrompt = this.buildContributionPrompt(paper, contextData, language)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 3000,
    })
  }

  /**
   * Generate limitation analysis (局限分析)
   *
   * Honest assessment of limitations with:
   * - Explicit limitations acknowledged by authors
   * - Implicit limitations not discussed
   * - Questions reviewers would raise
   */
  async generateLimitationAnalysis(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = this.buildLimitationSystemPrompt(language)

    const contextData = this.buildLimitationContextData(paper, language)
    const userPrompt = this.buildLimitationPrompt(paper, contextData, language)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 3000,
    })
  }

  /**
   * Generate reviewer critique (审稿人视角)
   *
   * Simulates reviewer perspective with:
   * - Strengths and weaknesses
   * - Questions that would be raised
   * - Acceptance likelihood assessment
   */
  async generateReviewerCritique(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = this.buildReviewerCritiqueSystemPrompt(language)

    const contextData = this.buildReviewerContextData(paper, language)
    const userPrompt = this.buildReviewerCritiquePrompt(paper, contextData, language)

    return this.generateSingleTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      maxTokens: options?.maxTokens ?? 4000,
    })
  }

  /**
   * Generate integrated evidence analysis (整合证据分析)
   *
   * Combines all figures, tables, formulas into coherent analysis
   */
  async generateIntegratedEvidenceAnalysis(
    paper: PaperContext,
    options?: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const language = options?.language ?? this.detectLanguage(paper)
    const systemPrompt = getEvidenceEditorialInstructions(language)

    const contextData = this.buildEvidenceContextData(paper, language)
    const userPrompt = this.buildIntegratedEvidencePrompt(paper, contextData, language)

    return this.generateMultiTurn(systemPrompt, userPrompt, {
      ...options,
      language,
      passes: 2,
      maxTokens: options?.maxTokens ?? 8000,
    })
  }

  // ==================== Private Methods ====================

  /**
   * Generate with multi-turn for comprehensive content
   */
  private async generateMultiTurn(
    systemPrompt: string,
    userPrompt: string,
    options: EditorialGenerationOptions
  ): Promise<EditorialGenerationResult> {
    const passes = options.passes ?? this.config.defaultPasses
    let accumulatedContent = ''

    // Pass 1: Initial generation
    const initialResult = await this.generateSingleTurn(systemPrompt, userPrompt, options)
    accumulatedContent = initialResult.content

    // Pass 2+: Refinement
    for (let pass = 1; pass < passes; pass++) {
      const refinementPrompt = this.buildRefinementPrompt(
        accumulatedContent,
        pass,
        passes,
        options.language
      )

      const refinementSystem = this.buildRefinementSystemPrompt(
        systemPrompt,
        pass,
        options.language
      )

      const refinementResult = await this.generateSingleTurn(
        refinementSystem,
        refinementPrompt,
        { ...options, previousContext: accumulatedContent }
      )

      accumulatedContent = this.mergeContent(accumulatedContent, refinementResult.content, pass)
    }

    return {
      content: accumulatedContent,
      multiTurnUsed: passes > 1,
      passesCompleted: passes,
      provider: initialResult.provider,
      model: initialResult.model,
      reasoning: initialResult.reasoning,
    }
  }

  /**
   * Generate single turn
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

    // Build messages with previous context if available
    const effectiveSystemPrompt = systemPrompt
    let effectiveUserPrompt = userPrompt

    if (options.previousContext) {
      effectiveUserPrompt = `Previous context:\n${options.previousContext}\n\n${userPrompt}`
    }

    const { text, model, provider } = await this.callOmni(task, effectiveSystemPrompt, effectiveUserPrompt, {
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
   * Normalize content
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/\r\n/gu, '\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim()
  }

  /**
   * Detect language from paper
   */
  private detectLanguage(paper: PaperContext): PromptLanguage {
    return paper.titleZh && paper.titleZh.length > 0 ? 'zh' : 'en'
  }

  // ==================== Section Finding ====================

  /**
   * Find method section from paper sections
   */
  private findMethodSection(paper: PaperContext): PaperSection | undefined {
    return paper.sections.find(
      (section) =>
        section.sourceSectionTitle.toLowerCase().includes('method') ||
        section.sourceSectionTitle.toLowerCase().includes('approach') ||
        section.sourceSectionTitle.toLowerCase().includes('model') ||
        section.sourceSectionTitle.toLowerCase().includes('architecture')
    )
  }

  /**
   * Find experiment section from paper sections
   */
  private findExperimentSection(paper: PaperContext): PaperSection | undefined {
    return paper.sections.find(
      (section) =>
        section.sourceSectionTitle.toLowerCase().includes('experiment') ||
        section.sourceSectionTitle.toLowerCase().includes('evaluation') ||
        section.sourceSectionTitle.toLowerCase().includes('result')
    )
  }

  // ==================== Context Builders ====================

  /**
   * Build comprehensive paper context data
   */
  private buildPaperContextData(
    paper: PaperContext,
    language: PromptLanguage,
    nodeContext?: NodeContext
  ): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : (paper.titleEn ?? paper.title)
    parts.push(`论文标题: ${title}`)
    parts.push(`作者: ${paper.authors}`)
    parts.push(`发表日期: ${paper.published.toLocaleDateString()}`)
    parts.push(`摘要: ${paper.summary}`)

    // Node context
    if (nodeContext) {
      parts.push(`\n节点: ${nodeContext.nodeLabel}`)
      parts.push(`节点位置: 第 ${paper.nodePosition ?? '?'} 篇`)
      if (nodeContext.problemEntry) {
        parts.push(`节点问题入口: ${nodeContext.problemEntry}`)
      }
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
      }))
    )

    // Format evidence block for LLM
    const evidenceBlock = formatEvidenceBlock(evidenceContext, {
      language,
      maxCaptionLength: 200,
      includePageNumbers: false,
    })
    parts.push('')
    parts.push(evidenceBlock)

    // Sections
    if (paper.sections.length > 0) {
      parts.push(`\n章节结构:`)
      paper.sections.forEach((section) => {
        parts.push(`  ${section.order + 1}. ${section.editorialTitle}`)
      })
    }

    // Domain terms
    if (paper.domainTerms?.length) {
      parts.push(`\n领域术语: ${paper.domainTerms.join(', ')}`)
    }

    return parts.join('\n')
  }

  /**
   * Build method section context data
   */
  private buildMethodContextData(
    paper: PaperContext,
    methodSection: PaperSection | undefined,
    language: PromptLanguage
  ): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)

    if (methodSection) {
      parts.push(`\n方法章节: ${methodSection.editorialTitle}`)
      parts.push(`内容片段: ${methodSection.paragraphs}`)
    }

    // Relevant formulas
    const relevantFormulas = paper.formulas.filter(
      (formula) =>
        formula.rawText.toLowerCase().includes('loss') ||
        formula.rawText.toLowerCase().includes('objective') ||
        formula.rawText.toLowerCase().includes('function') ||
        formula.latex.toLowerCase().includes('loss')
    )

    if (relevantFormulas.length > 0) {
      parts.push(`\n方法相关公式:`)
      relevantFormulas.forEach((formula) => {
        parts.push(`- 公式 ${formula.number}: ${formula.latex}`)
        if (formula.constraintOrObjective) {
          parts.push(`  定义: ${formula.constraintOrObjective}`)
        }
      })
    }

    // Figures that might be architecture diagrams
    const architectureFigures = paper.figures.filter(
      (fig) =>
        fig.caption.toLowerCase().includes('architecture') ||
        fig.caption.toLowerCase().includes('framework') ||
        fig.caption.toLowerCase().includes('model') ||
        fig.caption.toLowerCase().includes('overview')
    )

    if (architectureFigures.length > 0) {
      parts.push(`\n架构图/框架图:`)
      architectureFigures.forEach((fig) => {
        parts.push(`- 图 ${fig.number}: ${fig.caption}`)
      })
    }

    return parts.join('\n')
  }

  /**
   * Build experiment section context data
   */
  private buildExperimentContextData(
    paper: PaperContext,
    experimentSection: PaperSection | undefined,
    language: PromptLanguage
  ): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)

    if (experimentSection) {
      parts.push(`\n实验章节: ${experimentSection.editorialTitle}`)
      parts.push(`内容片段: ${experimentSection.paragraphs}`)
    }

    // All tables for experiments
    if (paper.tables.length > 0) {
      parts.push(`\n实验表格:`)
      paper.tables.forEach((table) => {
        parts.push(`- 表 ${table.number}: ${table.caption}`)
        parts.push(`  表头: ${table.headers}`)
        if (table.keyMetrics?.length) {
          parts.push(`  关键指标: ${table.keyMetrics.join(', ')}`)
        }
      })
    }

    // Results-related figures
    const resultsFigures = paper.figures.filter(
      (fig) =>
        fig.caption.toLowerCase().includes('result') ||
        fig.caption.toLowerCase().includes('performance') ||
        fig.caption.toLowerCase().includes('comparison') ||
        fig.caption.toLowerCase().includes('curve') ||
        fig.caption.toLowerCase().includes('plot')
    )

    if (resultsFigures.length > 0) {
      parts.push(`\n结果图:`)
      resultsFigures.forEach((fig) => {
        parts.push(`- 图 ${fig.number}: ${fig.caption}`)
      })
    }

    return parts.join('\n')
  }

  /**
   * Build result interpretation context data
   */
  private buildResultContextData(paper: PaperContext, language: PromptLanguage): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)
    parts.push(`摘要要点: ${paper.summary}`)

    // Key tables and their implications
    if (paper.tables.length > 0) {
      parts.push(`\n主要结果表格:`)
      paper.tables.forEach((table) => {
        parts.push(`- 表 ${table.number}: ${table.caption}`)
        if (table.supportedJudgment) {
          parts.push(`  支撑判断: ${table.supportedJudgment}`)
        }
      })
    }

    // Author-claimed contributions
    if (paper.keyContributions?.length) {
      parts.push(`\n作者声明贡献:`)
      paper.keyContributions.forEach((contrib) => {
        parts.push(`- ${contrib}`)
      })
    }

    // Known limitations
    if (paper.limitations?.length) {
      parts.push(`\n作者承认局限:`)
      paper.limitations.forEach((lim) => {
        parts.push(`- ${lim}`)
      })
    }

    return parts.join('\n')
  }

  /**
   * Build contribution context data
   */
  private buildContributionContextData(paper: PaperContext, language: PromptLanguage): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)
    parts.push(`摘要: ${paper.summary}`)

    if (paper.keyContributions?.length) {
      parts.push(`\n作者声明贡献:`)
      paper.keyContributions.forEach((contrib) => parts.push(`- ${contrib}`))
    }

    if (paper.methodLine) {
      parts.push(`\n推进的方法线: ${paper.methodLine}`)
    }

    // Evidence strength summary using unified builder
    const evidenceContext = buildEvidenceContext(
      paper.figures.map((fig) => ({ id: fig.id, number: fig.number, caption: fig.caption, page: fig.page, imagePath: fig.imagePath, analysis: fig.analysis ?? null })),
      (paper.figureGroups ?? []).map((group) => ({ id: group.id, groupId: group.parentNumber.toString(), caption: group.caption, page: group.page, subFigures: group.subFigures ?? [] })),
      paper.tables.map((table) => ({ id: table.id, number: table.number, caption: table.caption, page: table.page, headers: table.headers ?? null, rows: table.rows ?? null, rawText: table.rawText })),
      paper.formulas.map((formula) => ({ id: formula.id, number: formula.number, latex: formula.latex, rawText: formula.rawText ?? null, page: formula.page }))
    )
    parts.push(`\n证据数量: 图 ${evidenceContext.counts.figures}, 组图 ${evidenceContext.counts.figureGroups}, 表 ${evidenceContext.counts.tables}, 公式 ${evidenceContext.counts.formulas}`)

    return parts.join('\n')
  }

  /**
   * Build limitation context data
   */
  private buildLimitationContextData(paper: PaperContext, language: PromptLanguage): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)
    parts.push(`摘要: ${paper.summary}`)

    if (paper.limitations?.length) {
      parts.push(`\n作者承认局限:`)
      paper.limitations.forEach((lim) => parts.push(`- ${lim}`))
    }

    // Potential issues from evidence gaps using unified builder
    const evidenceContext = buildEvidenceContext(
      paper.figures.map((fig) => ({ id: fig.id, number: fig.number, caption: fig.caption, page: fig.page, imagePath: fig.imagePath, analysis: fig.analysis ?? null })),
      (paper.figureGroups ?? []).map((group) => ({ id: group.id, groupId: group.parentNumber.toString(), caption: group.caption, page: group.page, subFigures: group.subFigures ?? [] })),
      paper.tables.map((table) => ({ id: table.id, number: table.number, caption: table.caption, page: table.page, headers: table.headers ?? null, rows: table.rows ?? null, rawText: table.rawText })),
      paper.formulas.map((formula) => ({ id: formula.id, number: formula.number, latex: formula.latex, rawText: formula.rawText ?? null, page: formula.page }))
    )
    parts.push(`\n潜在问题线索:`)
    parts.push(`- 图表数量: 图 ${evidenceContext.counts.figures}, 组图 ${evidenceContext.counts.figureGroups}, 表 ${evidenceContext.counts.tables}`)
    parts.push(`- 公式数量: ${evidenceContext.counts.formulas}`)

    return parts.join('\n')
  }

  /**
   * Build reviewer context data
   */
  private buildReviewerContextData(paper: PaperContext, language: PromptLanguage): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)
    parts.push(`作者: ${paper.authors}`)
    parts.push(`摘要: ${paper.summary}`)

    if (paper.keyContributions?.length) {
      parts.push(`\n声明贡献: ${paper.keyContributions.join('; ')}`)
    }

    if (paper.limitations?.length) {
      parts.push(`\n承认局限: ${paper.limitations.join('; ')}`)
    }

    // Evidence summary using unified builder
    const evidenceContext = buildEvidenceContext(
      paper.figures.map((fig) => ({ id: fig.id, number: fig.number, caption: fig.caption, page: fig.page, imagePath: fig.imagePath, analysis: fig.analysis ?? null })),
      (paper.figureGroups ?? []).map((group) => ({ id: group.id, groupId: group.parentNumber.toString(), caption: group.caption, page: group.page, subFigures: group.subFigures ?? [] })),
      paper.tables.map((table) => ({ id: table.id, number: table.number, caption: table.caption, page: table.page, headers: table.headers ?? null, rows: table.rows ?? null, rawText: table.rawText })),
      paper.formulas.map((formula) => ({ id: formula.id, number: formula.number, latex: formula.latex, rawText: formula.rawText ?? null, page: formula.page }))
    )
    parts.push(`\n证据情况: 图 ${evidenceContext.counts.figures}, 组图 ${evidenceContext.counts.figureGroups}, 表 ${evidenceContext.counts.tables}, 公式 ${evidenceContext.counts.formulas}`)

    return parts.join('\n')
  }

  /**
   * Build evidence context data
   */
  private buildEvidenceContextData(paper: PaperContext, language: PromptLanguage): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)
    parts.push(`研究问题: ${paper.researchProblem ?? paper.summary}`)

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
      }))
    )

    // Format evidence block for LLM
    const evidenceBlock = formatEvidenceBlock(evidenceContext, {
      language,
      maxCaptionLength: 200,
      includePageNumbers: false,
    })
    parts.push('')
    parts.push(evidenceBlock)

    return parts.join('\n')
  }

  /**
   * Build figure group context data for specialized figure group analysis
   */
  private buildFigureGroupContextData(
    paper: PaperContext,
    language: PromptLanguage
  ): string {
    const parts: string[] = []

    const title = language === 'zh' ? paper.titleZh : paper.title
    parts.push(`论文: ${title}`)

    const figureGroups = paper.figureGroups ?? []
    if (figureGroups.length === 0) {
      parts.push('\n该论文没有组图。')
      return parts.join('\n')
    }

    parts.push(`\n组图列表 (${figureGroups.length} 个):`)
    figureGroups.forEach((group) => {
      parts.push(`\n--- 组图 ${group.parentNumber} ---`)
      parts.push(`标题: ${group.caption}`)
      parts.push(`置信度: ${group.confidence ?? 'N/A'}`)

      if (group.subFigures?.length > 0) {
        parts.push(`子图数量: ${group.subFigures.length}`)
        group.subFigures.forEach((subFig) => {
          parts.push(`  [${subFig.index}] ${subFig.caption}`)
          if (subFig.confidence) {
            parts.push(`    置信度: ${subFig.confidence}`)
          }
        })
      }

      if (group.researchQuestion) {
        parts.push(`针对问题: ${group.researchQuestion}`)
      }

      if (group.keyObservations?.length) {
        parts.push(`关键观察:`)
        group.keyObservations.forEach((obs) => {
          parts.push(`  - ${obs}`)
        })
      }

      if (group.supportedJudgment) {
        parts.push(`支撑判断: ${group.supportedJudgment}`)
      }
    })

    return parts.join('\n')
  }

  // ==================== Prompt Builders ====================

  /**
   * Build comprehensive analysis prompt
   */
  private buildComprehensiveAnalysisPrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请为以下论文撰写深度分析，使用${langLabel}。

${contextData}

要求：
1. 说明论文为什么会在当前节点出现
2. 指出它真正推进了哪条方法线或问题线
3. 每个主要判断都要落回证据（图表、公式、实验）
4. 方法和实验部分必须围绕具体证据展开
5. 结果解释必须回到证据本身，不要只说"提升了 X%"
6. 贡献表述要保守，避免过度声明
7. 局限部分要诚实，指出审稿人可能质疑的地方

请撰写完整分析：`
  }

  /**
   * Build method analysis prompt
   */
  private buildMethodAnalysisPrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请分析以下论文的方法部分，使用${langLabel}。

${contextData}

要求：
1. 必须落回具体公式、结构图、训练目标或损失函数
2. 解释核心设计思想和动机
3. 说明公式定义的约束或优化目标
4. 不要泛泛陈述方法框架，要深入具体技术细节

请撰写方法分析：`
  }

  /**
   * Build experiment analysis prompt
   */
  private buildExperimentAnalysisPrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请分析以下论文的实验部分，使用${langLabel}。

${contextData}

要求：
1. 必须落回具体表格、性能对比数据
2. 解读 ablation 分析的关键发现
3. 不要跳过对比基线
4. 说明实验设计验证了什么假设

请撰写实验分析：`
  }

  /**
   * Build result interpretation prompt
   */
  private buildResultInterpretationPrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请解释以下论文的结果，使用${langLabel}。

${contextData}

要求：
1. 区分"作者声称了什么"和"证据实际支持了什么"
2. 指出哪些结果有强证据支撑，哪些可能过度解读
3. 说明边界条件：结果在什么条件下成立
4. 不要只说"提升了 X%"，要解释为什么提升

请撰写结果解释：`
  }

  /**
   * Build contribution prompt
   */
  private buildContributionPrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请评估以下论文的贡献，使用${langLabel}。

${contextData}

要求：
1. 区分"实际推进"和"声称推进"
2. 评估方法的创新程度：是增量改进还是实质性突破
3. 保守表述，避免"决定性突破"语言
4. 说明对后续研究的潜在影响

请撰写贡献评估：`
  }

  /**
   * Build limitation prompt
   */
  private buildLimitationPrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请分析以下论文的局限性，使用${langLabel}。

${contextData}

要求：
1. 列出作者明确承认的局限
2. 指出作者未讨论但可能存在的隐含局限
3. 预测审稿人最可能质疑的问题
4. 说明局限对结论的影响程度

请撰写局限分析：`
  }

  /**
   * Build reviewer critique prompt
   */
  private buildReviewerCritiquePrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请以审稿人视角评价以下论文，使用${langLabel}。

${contextData}

要求：
1. 列出论文的主要优点 (Strengths)
2. 列出论文的主要弱点 (Weaknesses)
3. 提出你在审稿中会提出的具体问题
4. 给出总体评价和可能的接受建议

请撰写审稿意见：`
  }

  /**
   * Build integrated evidence prompt
   */
  private buildIntegratedEvidencePrompt(
    paper: PaperContext,
    contextData: string,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `请整合分析以下论文的所有证据，使用${langLabel}。

${contextData}

要求：
1. 说明各条证据分别支撑什么判断
2. 指出哪些证据被多处引用，形成证据链
3. 检查是否有证据被遗漏或未充分利用
4. 评估证据整体的说服力

请撰写证据整合分析：`
  }

  // ==================== System Prompt Builders ====================

  /**
   * Build method analysis system prompt
   */
  private buildMethodAnalysisSystemPrompt(language: PromptLanguage): string {
    return `${getPaperEditorialInstructions(language)}

你现在专门分析论文的方法部分。必须落回具体公式、架构图、训练目标或损失函数，不要泛泛陈述方法框架。`
  }

  /**
   * Build experiment analysis system prompt
   */
  private buildExperimentAnalysisSystemPrompt(language: PromptLanguage): string {
    return `${getPaperEditorialInstructions(language)}

你现在专门分析论文的实验部分。必须落回具体表格、性能对比、ablation 分析，不要跳过对比基线。`
  }

  /**
   * Build result interpretation system prompt
   */
  private buildResultInterpretationSystemPrompt(language: PromptLanguage): string {
    return `${getPaperEditorialInstructions(language)}

你现在专门解释论文的结果。必须回到证据本身，区分"作者声称"和"证据支持"，说明边界条件。不要只说"提升了 X%"。`
  }

  /**
   * Build contribution system prompt
   */
  private buildContributionSystemPrompt(language: PromptLanguage): string {
    return `${getPaperEditorialInstructions(language)}

你现在专门评估论文的贡献。必须保守表述，区分实际推进和声称推进，评估创新程度，避免"决定性突破"语言。`
  }

  /**
   * Build limitation system prompt
   */
  private buildLimitationSystemPrompt(language: PromptLanguage): string {
    return `${getPaperEditorialInstructions(language)}

你现在专门分析论文的局限性。必须诚实指出局限，包括作者承认的和隐含的，预测审稿人质疑点。`
  }

  /**
   * Build reviewer critique system prompt
   */
  private buildReviewerCritiqueSystemPrompt(language: PromptLanguage): string {
    const baseInstructions = getPaperEditorialInstructions(language)
    const reviewerAddition = language === 'zh'
      ? `你现在扮演一位严格但公正的学术审稿人。请指出优点、弱点、具体问题，给出总体评价。`
      : `You are now acting as a rigorous but fair academic reviewer. Identify strengths, weaknesses, specific questions, and give an overall assessment.`

    return `${baseInstructions}

${reviewerAddition}`
  }

  /**
   * Build refinement system prompt
   */
  private buildRefinementSystemPrompt(
    originalSystemPrompt: string,
    passNumber: number,
    language: PromptLanguage
  ): string {
    const passNote = language === 'zh'
      ? `这是第 ${passNumber + 1} 轮精修。请继续完善内容，确保：检查遗漏的论文细节、补充缺失证据链、删除冗余、强化关键判断支撑。`
      : `This is pass ${passNumber + 1}. Continue refining: check for missing details, supplement evidence chains, remove redundancy, strengthen key judgment support.`

    return `${originalSystemPrompt}

${passNote}`
  }

  /**
   * Build refinement prompt
   */
  private buildRefinementPrompt(
    accumulatedContent: string,
    passNumber: number,
    totalPasses: number,
    language: PromptLanguage
  ): string {
    const langLabel = language === 'zh' ? '中文' : 'English'

    return `以下是已生成的内容（第 ${passNumber} 轮）：

${accumulatedContent}

请继续完善（使用${langLabel}），进行第 ${passNumber + 1}/${totalPasses} 轮精修。

精修重点：
1. 补充缺失的图表或公式分析
2. 强化证据链完整性
3. 删除冗余内容
4. 确保学术风格统一

请输出完善后的内容：`
  }

  /**
   * Merge content from passes
   */
  private mergeContent(previousContent: string, newContent: string, passNumber: number): string {
    if (passNumber === 1) {
      return newContent
    }
    // Use the refined content for subsequent passes
    return newContent.length > previousContent.length * 0.8 ? newContent : previousContent
  }
}

/**
 * Default export: singleton instance
 */
export const paperEditorialAgent = new PaperEditorialAgent()

/**
 * Create a new paper editorial agent with custom configuration
 */
export function createPaperEditorialAgent(config?: Partial<EditorialAgentConfig>): PaperEditorialAgent {
  return new PaperEditorialAgent(config)
}

export const __testing = {
  resolvePaperEditorialConfig,
}
