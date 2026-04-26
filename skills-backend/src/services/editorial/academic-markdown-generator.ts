/**
 * Academic Markdown Generator
 *
 * Generates clean, publication-quality Markdown for research node articles.
 * Replaces the previous JSON-structured output with direct Markdown that
 * renders correctly in ArticleMarkdown.tsx.
 *
 * Key design principles:
 * 1. NO redundant headers — each ## is a meaningful, unique section title
 * 2. Figures inline — images appear where discussed, not in a separate gallery
 * 3. No "Figure X shows..." — instead: "The comparison in Table 2 shows XX improvement over YY baseline"
 * 4. Evidence IDs embedded — uses `![[figure:id]]` syntax the frontend can resolve
 * 5. Bilingual support — outputs both Chinese and English when configured
 *
 * Delegates model selection to OmniGateway, which resolves the user's
 * configured VLM/LLM from the model_configs table.
 *
 * Output structure:
 * ```markdown
 * # {Node Title}
 *
 * {Standfirst — 1-paragraph core problem statement}
 *
 * ## {Core Thesis / 核心论点}
 *
 * {Detailed thesis elaboration}
 *
 * ## {First Paper Title}
 *
 * {Paper contribution overview — what it proves, what it advances}
 *
 * ![Figure 1]({image_path})
 * *Figure 1: {caption}* — {why this matters}
 *
 * {Method/experiment description with figure/table references}
 *
 * $$
 * formula
 * $$
 *
 * ## {Second Paper Title}
 *
 * {...}
 *
 * ## {Synthesis / 综合讨论}
 *
 * {Cross-paper comparison, evidence chains, overall judgment}
 *
 * ## {Open Problems / 仍待解决的问题}
 *
 * {Remaining questions, handoff points}
 * ```
 */

import {
  getAcademicMarkdownSystemPrompt,
  getAcademicMarkdownChapterPrompt,
  getAcademicMarkdownSynthesisPrompt,
  getAcademicMarkdownStandfirstPrompt,
} from '../../../shared/editorial-prompt'
import type { PromptLanguage } from '../generation/prompt-registry'
import { retryWithBackoff } from '../../utils/retry'
import { omniGateway } from '../omni/gateway'
import type { OmniTask } from '../../../shared/model-config'
import type {
  EditorialAgentConfig,
  FigureContext,
  FormulaContext,
  NodeContext,
  PaperContext,
  TableContext,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for markdown article generation */
export interface MarkdownArticleOptions {
  /** Output language */
  language?: PromptLanguage
  /** Maximum tokens per LLM call */
  maxTokens?: number
  /** Temperature for generation */
  temperature?: number
  /** Whether to generate bilingual output (zh + en) */
  bilingual?: boolean
  /** Whether to include figure images inline */
  inlineFigures?: boolean
  /** Whether to include formulas inline */
  inlineFormulas?: boolean
}

/** Result of a single chapter generation */
export interface ChapterGenerationResult {
  /** Paper ID this chapter covers */
  paperId: string
  /** Paper title used as the ## heading */
  paperTitle: string
  /** Generated markdown content for this chapter */
  markdown: string
  /** Evidence IDs referenced in this chapter */
  evidenceIds: string[]
  /** Token usage for this generation */
  tokenUsage?: { prompt: number; completion: number; total: number }
}

/** Result of the full markdown article generation */
export interface MarkdownArticleResult {
  /** Complete markdown article */
  markdown: string
  /** Individual chapter results */
  chapters: ChapterGenerationResult[]
  /** Standfirst paragraph */
  standfirst: string
  /** Synthesis section */
  synthesis: string
  /** Open problems section */
  openProblems: string
  /** Total token usage across all calls */
  totalTokenUsage?: { prompt: number; completion: number; total: number }
  /** Model used */
  model: string
}

// ---------------------------------------------------------------------------
// Evidence ID helpers
// ---------------------------------------------------------------------------

/**
 * Build an evidence reference string that the frontend can resolve.
 *
 * Formats:
 * - `![[figure:abc123]]` — inline figure embed
 * - `![[table:def456]]`  — inline table embed
 * - `![[formula:ghi789]]` — inline formula embed
 */
export function buildEvidenceRef(type: 'figure' | 'table' | 'formula', id: string): string {
  return `![[${type}:${id}]]`
}

/**
 * Build a markdown image tag for a figure with caption and significance.
 *
 * Output format:
 * ```
 * ![Figure 1](image_path)
 * *Figure 1: caption* — why this matters
 * ```
 */
export function buildFigureMarkdown(
  figure: FigureContext,
  significance?: string
): string {
  const alt = `Figure ${figure.number}`
  const imgTag = `![${alt}](${figure.imagePath})`
  const captionLine = `*${alt}: ${figure.caption}*`
  const fullLine = significance
    ? `${captionLine} — ${significance}`
    : captionLine

  return `${imgTag}\n${fullLine}`
}

/**
 * Build a markdown formula block.
 *
 * Output format:
 * ```
 * $$
 * \mathcal{L} = ...
 * $$
 * ```
 */
export function buildFormulaMarkdown(formula: FormulaContext): string {
  return `$$\n${formula.latex}\n$$`
}

/**
 * Build a markdown table from TableContext.
 */
export function buildTableMarkdown(table: TableContext): string {
  const headerLine = `| ${table.headers} |`
  const separatorLine = `| ${table.headers.split('|').map(() => '---').join(' | ')} |`
  const rows = table.rows
    ? `\n${table.rows}`
    : ''

  return `${headerLine}\n${separatorLine}${rows}`
}

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

/**
 * Build a concise context summary for a paper, optimized for markdown generation.
 * Only includes information the LLM needs to write the chapter.
 */
function buildPaperChapterContext(
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

  if (paper.researchProblem) {
    parts.push(`研究问题: ${paper.researchProblem}`)
  }

  if (paper.keyContributions?.length) {
    parts.push(`核心贡献: ${paper.keyContributions.join('; ')}`)
  }

  if (paper.methodLine) {
    parts.push(`方法线: ${paper.methodLine}`)
  }

  if (paper.limitations?.length) {
    parts.push(`已知局限: ${paper.limitations.join('; ')}`)
  }

  // Figures — include image paths for inline embedding
  if (paper.figures.length > 0) {
    parts.push(`\n图表 (${paper.figures.length} 个):`)
    paper.figures.forEach((fig) => {
      parts.push(`- 图 ${fig.number}: ${fig.caption}`)
      parts.push(`  路径: ${fig.imagePath}`)
      parts.push(`  证据ID: figure:${fig.id}`)
      if (fig.analysis) {
        parts.push(`  分析: ${fig.analysis}`)
      }
    })
  }

  // Tables
  if (paper.tables.length > 0) {
    parts.push(`\n表格 (${paper.tables.length} 个):`)
    paper.tables.forEach((table) => {
      parts.push(`- 表 ${table.number}: ${table.caption}`)
      parts.push(`  证据ID: table:${table.id}`)
      if (table.keyMetrics?.length) {
        parts.push(`  关键指标: ${table.keyMetrics.join(', ')}`)
      }
    })
  }

  // Formulas
  if (paper.formulas.length > 0) {
    parts.push(`\n公式 (${paper.formulas.length} 个):`)
    paper.formulas.forEach((formula) => {
      parts.push(`- 公式 ${formula.number}: ${formula.latex}`)
      parts.push(`  证据ID: formula:${formula.id}`)
      if (formula.variableDefinitions) {
        const defs = Object.entries(formula.variableDefinitions)
          .map(([v, m]) => `${v}: ${m}`)
          .join(', ')
        parts.push(`  变量: ${defs}`)
      }
    })
  }

  // Node position context
  if (nodeContext && paper.nodePosition) {
    parts.push(`\n节点位置: 第 ${paper.nodePosition} 篇，共 ${nodeContext.papers.length} 篇`)
    parts.push(`节点: ${nodeContext.nodeLabel}`)
  }

  return parts.join('\n')
}

/**
 * Build context for the standfirst (opening paragraph).
 */
function buildStandfirstContext(node: NodeContext, language: PromptLanguage): string {
  const parts: string[] = []

  parts.push(`节点标题: ${node.nodeLabel}`)
  if (node.nodeSubtitle) {
    parts.push(`副标题: ${node.nodeSubtitle}`)
  }
  parts.push(`摘要: ${node.nodeSummary}`)

  if (node.problemEntry) {
    parts.push(`问题入口: ${node.problemEntry}`)
  }

  if (node.technicalHandles?.length) {
    parts.push(`技术抓手: ${node.technicalHandles.join(', ')}`)
  }

  // Brief paper list
  parts.push(`\n论文列表 (${node.papers.length} 篇):`)
  node.papers.forEach((paper, index) => {
    const title = language === 'zh' ? paper.titleZh : (paper.titleEn ?? paper.title)
    parts.push(`${index + 1}. ${title} (${paper.published.toLocaleDateString()})`)
  })

  return parts.join('\n')
}

/**
 * Build context for the synthesis section.
 */
function buildSynthesisContext(node: NodeContext, language: PromptLanguage): string {
  const parts: string[] = []

  parts.push(`节点: ${node.nodeLabel}`)
  parts.push(`论文数量: ${node.papers.length}`)

  // Paper summaries
  parts.push(`\n论文列表:`)
  node.papers.forEach((paper, index) => {
    const title = language === 'zh' ? paper.titleZh : (paper.titleEn ?? paper.title)
    parts.push(`${index + 1}. ${title}`)
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

  if (node.advances) {
    parts.push(`\n推进内容: ${node.advances}`)
  }

  if (node.problemsOut?.length) {
    parts.push(`\n遗留问题: ${node.problemsOut.join('; ')}`)
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// AcademicMarkdownGenerator class
// ---------------------------------------------------------------------------

export class AcademicMarkdownGenerator {
  private config: EditorialAgentConfig
  /** The actual model used, resolved from OmniGateway */
  private resolvedModel: string | null = null

  constructor(config: EditorialAgentConfig) {
    this.config = config
  }

  // ==================== Public API ====================

  /**
   * Generate a complete academic markdown article for a research node.
   *
   * The article follows this structure:
   * 1. # Node Title
   * 2. Standfirst (core problem statement)
   * 3. ## Core Thesis
   * 4. ## Paper 1 Title (chapter)
   * 5. ## Paper 2 Title (chapter)
   * 6. ...
   * 7. ## Synthesis
   * 8. ## Open Problems
   *
   * Each chapter is generated independently for quality and token efficiency,
   * then assembled into the final article.
   */
  async generateMarkdownArticle(
    node: NodeContext,
    options?: MarkdownArticleOptions
  ): Promise<MarkdownArticleResult> {
    const language = options?.language ?? this.detectLanguage(node)
    const bilingual = options?.bilingual ?? false
    const inlineFigures = options?.inlineFigures ?? true
    const inlineFormulas = options?.inlineFormulas ?? true

    // Step 1: Generate standfirst
    const standfirst = await this.generateStandfirst(node, language)

    // Step 2: Generate core thesis
    const coreThesis = await this.generateCoreThesis(node, language)

    // Step 3: Generate each paper chapter
    const chapters: ChapterGenerationResult[] = []
    let totalPrompt = 0
    let totalCompletion = 0

    for (const paper of node.papers) {
      const chapter = await this.generatePaperChapter(
        paper,
        node,
        language,
        { bilingual, inlineFigures, inlineFormulas }
      )
      chapters.push(chapter)
      if (chapter.tokenUsage) {
        totalPrompt += chapter.tokenUsage.prompt
        totalCompletion += chapter.tokenUsage.completion
      }
    }

    // Step 4: Generate synthesis
    const synthesis = await this.generateSynthesis(node, language)

    // Step 5: Generate open problems
    const openProblems = await this.generateOpenProblems(node, language)

    // Step 6: Assemble the full article
    const markdown = this.assembleArticle(
      node,
      standfirst,
      coreThesis,
      chapters,
      synthesis,
      openProblems,
      language
    )

    return {
      markdown,
      chapters,
      standfirst,
      synthesis,
      openProblems,
      totalTokenUsage: {
        prompt: totalPrompt,
        completion: totalCompletion,
        total: totalPrompt + totalCompletion,
      },
      model: this.resolvedModel ?? this.config.model ?? 'unknown',
    }
  }

  /**
   * Generate just the standfirst paragraph.
   */
  async generateStandfirst(
    node: NodeContext,
    language: PromptLanguage
  ): Promise<string> {
    const systemPrompt = getAcademicMarkdownSystemPrompt('standfirst', language)
    const contextData = buildStandfirstContext(node, language)
    const userPrompt = getAcademicMarkdownStandfirstPrompt(contextData, language)

    const result = await this.callLlm(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0.15,
    })

    return this.cleanMarkdownOutput(result.text)
  }

  /**
   * Generate the core thesis section.
   */
  async generateCoreThesis(
    node: NodeContext,
    language: PromptLanguage
  ): Promise<string> {
    const systemPrompt = getAcademicMarkdownSystemPrompt('core-thesis', language)
    const contextData = buildStandfirstContext(node, language)
    const langLabel = language === 'zh' ? '中文' : 'English'

    const userPrompt = `请为以下研究节点撰写核心论点部分，使用${langLabel}。

${contextData}

要求：
1. 用一个 ## 标题概括节点的核心论点（不是"核心论点"这种泛标题，而是具体的判断句）
2. 正文详细阐述这个论点：为什么这个节点在当前时间点出现、它推进了什么认知
3. 1-2段，每段100-150字
4. 直接输出Markdown，不要输出JSON或额外说明

请开始撰写：`

    const result = await this.callLlm(systemPrompt, userPrompt, {
      maxTokens: 3000,
      temperature: 0.15,
    })

    return this.cleanMarkdownOutput(result.text)
  }

  /**
   * Generate a single paper chapter.
   */
  async generatePaperChapter(
    paper: PaperContext,
    node: NodeContext,
    language: PromptLanguage,
    options?: { bilingual?: boolean; inlineFigures?: boolean; inlineFormulas?: boolean }
  ): Promise<ChapterGenerationResult> {
    const bilingual = options?.bilingual ?? false
    const inlineFigures = options?.inlineFigures ?? true
    const inlineFormulas = options?.inlineFormulas ?? true

    const systemPrompt = getAcademicMarkdownSystemPrompt('paper-chapter', language)
    const contextData = buildPaperChapterContext(paper, language, node)

    // Build evidence ID list
    const evidenceIds: string[] = []
    paper.figures.forEach((fig) => evidenceIds.push(`figure:${fig.id}`))
    paper.tables.forEach((table) => evidenceIds.push(`table:${table.id}`))
    paper.formulas.forEach((formula) => evidenceIds.push(`formula:${formula.id}`))

    // Build inline evidence templates
    const inlineTemplates: string[] = []
    if (inlineFigures) {
      paper.figures.forEach((fig) => {
        inlineTemplates.push(`图 ${fig.number}: ![Figure ${fig.number}](${fig.imagePath})\n*Figure ${fig.number}: ${fig.caption}* — {为什么这个图重要}`)
      })
    }
    if (inlineFormulas) {
      paper.formulas.forEach((formula) => {
        inlineTemplates.push(`公式 ${formula.number}: $$\n${formula.latex}\n$$`)
      })
    }

    const userPrompt = getAcademicMarkdownChapterPrompt(
      contextData,
      evidenceIds,
      inlineTemplates,
      language,
      bilingual
    )

    const result = await this.callLlm(systemPrompt, userPrompt, {
      maxTokens: 16000,
      temperature: 0.18,
    })

    const markdown = this.cleanMarkdownOutput(result.text)

    return {
      paperId: paper.id,
      paperTitle: language === 'zh' ? paper.titleZh : (paper.titleEn ?? paper.title),
      markdown,
      evidenceIds,
      tokenUsage: result.tokenUsage,
    }
  }

  /**
   * Generate the synthesis section.
   */
  async generateSynthesis(
    node: NodeContext,
    language: PromptLanguage
  ): Promise<string> {
    const systemPrompt = getAcademicMarkdownSystemPrompt('synthesis', language)
    const contextData = buildSynthesisContext(node, language)
    const userPrompt = getAcademicMarkdownSynthesisPrompt(contextData, language)

    const result = await this.callLlm(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0.18,
    })

    return this.cleanMarkdownOutput(result.text)
  }

  /**
   * Generate the open problems section.
   */
  async generateOpenProblems(
    node: NodeContext,
    language: PromptLanguage
  ): Promise<string> {
    const systemPrompt = getAcademicMarkdownSystemPrompt('open-problems', language)
    const langLabel = language === 'zh' ? '中文' : 'English'

    const problemsContext: string[] = []
    if (node.problemsOut?.length) {
      problemsContext.push(`已知遗留问题: ${node.problemsOut.join('; ')}`)
    }
    if (node.advances) {
      problemsContext.push(`已推进内容: ${node.advances}`)
    }

    // Collect limitations from papers
    const allLimitations = node.papers
      .flatMap((p) => p.limitations ?? [])
    if (allLimitations.length > 0) {
      problemsContext.push(`各论文局限: ${allLimitations.join('; ')}`)
    }

    const userPrompt = `请为以下研究节点撰写"仍待解决的问题"部分，使用${langLabel}。

节点: ${node.nodeLabel}

${problemsContext.join('\n')}

要求：
1. 用一个 ## 标题概括（如"仍待解决的问题"或"Open Problems"）
2. 列出2-4个具体的、可接手的研究问题
3. 每个问题说明：为什么重要、当前卡在哪里、下一篇论文可以怎么接
4. 直接输出Markdown，不要输出JSON或额外说明

请开始撰写：`

    const result = await this.callLlm(systemPrompt, userPrompt, {
      maxTokens: 1200,
      temperature: 0.18,
    })

    return this.cleanMarkdownOutput(result.text)
  }

  // ==================== Assembly ====================

  /**
   * Assemble the full article from generated sections.
   */
  private assembleArticle(
    node: NodeContext,
    standfirst: string,
    coreThesis: string,
    chapters: ChapterGenerationResult[],
    synthesis: string,
    openProblems: string,
    language: PromptLanguage
  ): string {
    const parts: string[] = []

    // # Node Title
    const nodeTitle = language === 'zh' ? node.nodeLabel : (node.nodeSubtitle ?? node.nodeLabel)
    parts.push(`# ${nodeTitle}`)
    parts.push('')

    // Standfirst
    parts.push(standfirst)
    parts.push('')

    // Core Thesis
    parts.push(coreThesis)
    parts.push('')

    // Paper chapters
    for (const chapter of chapters) {
      parts.push(chapter.markdown)
      parts.push('')
    }

    // Synthesis
    parts.push(synthesis)
    parts.push('')

    // Open Problems
    parts.push(openProblems)

    return this.normalizeArticle(parts.join('\n'))
  }

  // ==================== LLM Call ====================

  /**
   * Call the LLM API via OmniGateway.
   *
   * OmniGateway resolves the model, baseUrl, and apiKey from the user's
   * model_configs — we do NOT use this.config for those fields.
   */
  private async callLlm(
    systemPrompt: string,
    userPrompt: string,
    options: { maxTokens?: number; temperature?: number; task?: OmniTask }
  ): Promise<{
    text: string
    reasoning?: string
    tokenUsage?: { prompt: number; completion: number; total: number }
    model: string
    provider: string
  }> {
    const task: OmniTask = options.task ?? 'topic_summary'

    const result = await retryWithBackoff(
      async () => {
        const response = await omniGateway.complete({
          task,
          preferredSlot: 'language',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: options.temperature ?? 0.18,
          maxTokens: options.maxTokens ?? 16000,
          // Key: no model, baseUrl, or apiKey — OmniGateway resolves from user config
        })

        if (response.issue) {
          throw new Error(`OmniGateway error: ${response.issue.message}`)
        }

        return {
          text: response.text ?? '',
          reasoning: response.reasoning,
          tokenUsage: undefined, // OmniGateway doesn't return token usage in this format
          model: response.model,
          provider: response.provider,
        }
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )

    // Track the resolved model for reporting
    this.resolvedModel = result.model

    return result
  }

  // ==================== Utilities ====================

  /**
   * Clean LLM output to ensure it's valid Markdown.
   *
   * Removes:
   * - Wrapping code blocks (```markdown ... ```)
   * - Leading/trailing JSON artifacts
   * - Excessive blank lines
   */
  private cleanMarkdownOutput(raw: string): string {
    let cleaned = raw.trim()

    // Remove wrapping code blocks
    cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n?/u, '')
    cleaned = cleaned.replace(/\n?```\s*$/u, '')

    // Remove any leading "Here is..." preamble lines
    cleaned = cleaned.replace(/^(?:Here is|以下是|以下是生成的|下面是)[^\n]*\n*/u, '')

    return cleaned.trim()
  }

  /**
   * Normalize the assembled article.
   */
  private normalizeArticle(article: string): string {
    return article
      .replace(/\r\n/gu, '\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim()
  }

  /**
   * Detect language from node context.
   */
  private detectLanguage(node: NodeContext): PromptLanguage {
    const hasChinesePapers = node.papers.some(
      (paper) => paper.titleZh && paper.titleZh.length > 0
    )
    return hasChinesePapers ? 'zh' : 'en'
  }
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/**
 * Create an AcademicMarkdownGenerator from the same config used by NodeEditorialAgent.
 */
export function createAcademicMarkdownGenerator(
  config: EditorialAgentConfig
): AcademicMarkdownGenerator {
  return new AcademicMarkdownGenerator(config)
}
