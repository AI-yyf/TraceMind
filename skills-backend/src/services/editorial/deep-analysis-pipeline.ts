/**
 * Deep Analysis Pipeline - 三遍深度论文分析
 *
 * Pass 1: 结构提取 + 证据定位
 * Pass 2: 方法论深度分析（逐节）
 * Pass 3: 结果验证 + 证据交叉校验
 *
 * 目标：生成的内容足够深度，让用户不用看原文。
 */

import { omniGateway } from '../omni/gateway'
import type { OmniTask } from '../../../shared/model-config'
import { TokenBudgetManager } from './token-budget-manager'

// ─── 配置 ───────────────────────────────────────────────────────────

export interface DeepAnalysisConfig {
  /** 每节最大Token预算 */
  maxTokensPerSection: number
  /** 是否使用VLM分析图表 */
  enableVLMForEvidence: boolean
  /** 是否交叉校验声称与证据 */
  crossCheckEvidence: boolean
  /** 是否包含公式推导步骤 */
  includeDerivations: boolean
  /** 分析语言 */
  language: 'zh' | 'en'
}

const DEFAULT_CONFIG: DeepAnalysisConfig = {
  maxTokensPerSection: 8000,
  enableVLMForEvidence: true,
  crossCheckEvidence: true,
  includeDerivations: true,
  language: 'zh',
}

// ─── 结果类型 ───────────────────────────────────────────────────────

export interface DeepAnalysisResult {
  /** 逐节深度分析 */
  sections: SectionAnalysis[]
  /** 证据分析结果 */
  evidenceAnalysis: EvidenceAnalysisMap
  /** 带证据的主张 */
  claims: ClaimWithEvidence[]
  /** 整体置信度 */
  confidenceScore: number
  /** 预算使用统计 */
  budgetStats?: {
    totalBudget: number
    inputBudget: number
    outputBudget: number
    used: number
    remaining: number
    utilizationRate: number
  }
}

export interface SectionAnalysis {
  sectionId: string
  title: string
  type: 'methodology' | 'experiment' | 'result' | 'introduction' | 'discussion' | 'other'
  deepAnalysis: string
  keyPoints: string[]
  evidenceReferences: string[]
}

export interface ClaimWithEvidence {
  claim: string
  evidenceIds: string[]
  confidence: number
  validationNote?: string
}

export interface EvidenceAnalysisMap {
  figures: Map<string, { analysis: string; claims: string[] }>
  tables: Map<string, { analysis: string; claims: string[] }>
  formulas: Map<string, { analysis: string; derivation?: string }>
}

// ─── 内部中间类型 ───────────────────────────────────────────────────

interface StructureExtraction {
  sectionTypes: Array<{
    sectionId: string
    title: string
    type: SectionAnalysis['type']
  }>
  rawClaims: Array<{ claim: string; sectionId: string }>
}

interface MethodologyResult {
  sections: SectionAnalysis[]
  structure: StructureExtraction
}

// ─── 论文输入类型 ───────────────────────────────────────────────────

export interface DeepAnalysisPaper {
  id: string
  title: string
  sections: Array<{
    id: string
    editorialTitle: string
    sourceSectionTitle: string
    paragraphs: string
  }>
  figures: Array<{
    id: string
    number: number
    caption: string
    imagePath: string
    analysis?: string | null
  }>
  tables: Array<{
    id: string
    number: number
    caption: string
    rawText: string
    headers?: string | null
  }>
  formulas: Array<{
    id: string
    number: string
    latex: string
    rawText?: string | null
  }>
}

// ─── Pipeline ───────────────────────────────────────────────────────

export class DeepAnalysisPipeline {
  private config: DeepAnalysisConfig
  private budgetManager: TokenBudgetManager

  constructor(config?: Partial<DeepAnalysisConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.budgetManager = new TokenBudgetManager({
      totalBudget: 32000,
      outputReserveRatio: 0.3,
    })
  }

  /**
   * 执行三遍深度分析
   */
  async analyze(paper: DeepAnalysisPaper): Promise<DeepAnalysisResult> {
    // 重置预算管理器
    this.budgetManager.resetAllocations()

    // 计算预算分配
    const sections = paper.sections.map((s) => ({
      id: s.id,
      type: this.inferSectionType(s.editorialTitle || s.sourceSectionTitle),
      estimatedTokens: this.budgetManager.estimateTokens(s.paragraphs),
    }))

    const allocations = this.budgetManager.allocateSections(sections)

    // Pass 1: 结构提取 + 证据定位
    const structure = await this.extractStructure(paper)

    // Pass 2: 方法论深度分析（使用分配的预算）
    const methodology = await this.analyzeMethodology(paper, structure, allocations)

    // Pass 3: 结果验证 + 证据交叉校验
    const validated = await this.validateResults(paper, methodology)

    // 添加预算统计
    return {
      ...validated,
      budgetStats: this.budgetManager.getBudgetStats(),
    }
  }

  // ─── Pass 1: 结构提取 ──────────────────────────────────────────

  private async extractStructure(paper: DeepAnalysisPaper): Promise<StructureExtraction> {
    const languageLabel = this.config.language === 'zh' ? '中文' : 'English'

    const systemPrompt = `你是一位研究结构分析专家。请用${languageLabel}分析论文的结构，识别每节的研究角色。

输出JSON格式:
{
  "sectionTypes": [
    { "sectionId": "节ID", "title": "节标题", "type": "methodology|experiment|result|introduction|discussion|other" }
  ],
  "rawClaims": [
    { "claim": "论文中的关键主张", "sectionId": "来源节ID" }
  ]
}`

    const fullContent = paper.sections
      .map((s) => `## [${s.id}] ${s.editorialTitle || s.sourceSectionTitle}\n${s.paragraphs}`)
      .join('\n\n')

    const userPrompt = `论文标题: ${paper.title}

全文内容:
${fullContent}

请分析此论文的结构，为每节标注类型并提取关键主张。`

    const result = await omniGateway.complete({
      task: 'topic_summary' as OmniTask,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 8000,
      json: true,
    })

    return this.parseStructureResult(result.text)
  }

  private parseStructureResult(raw: string): StructureExtraction {
    const fallback: StructureExtraction = { sectionTypes: [], rawClaims: [] }

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as Partial<StructureExtraction>

      return {
        sectionTypes: Array.isArray(parsed.sectionTypes) ? parsed.sectionTypes : [],
        rawClaims: Array.isArray(parsed.rawClaims) ? parsed.rawClaims : [],
      }
    } catch {
      return fallback
    }
  }

  // ─── Pass 2: 方法论深度分析 ─────────────────────────────────────

  private async analyzeMethodology(
    paper: DeepAnalysisPaper,
    structure: StructureExtraction,
    allocations: Map<string, number>,
  ): Promise<MethodologyResult> {
    const languageLabel = this.config.language === 'zh' ? '中文' : 'English'

    // 对每个方法/实验/结果节深度分析
    const targetTypes = new Set<string>(['methodology', 'experiment', 'result', 'discussion'])
    const methodSectionIds = new Set(
      structure.sectionTypes
        .filter((s) => targetTypes.has(s.type))
        .map((s) => s.sectionId),
    )

    // 也通过标题关键词匹配，确保不遗漏
    const methodSections = paper.sections.filter((section) => {
      if (methodSectionIds.has(section.id)) return true
      const title = (section.editorialTitle || section.sourceSectionTitle).toLowerCase()
      return /(method|approach|experiment|result|evaluation|实验|方法|结果|讨论|discussion)/i.test(title)
    })

    const sectionAnalyses = await Promise.all(
      methodSections.map((section) =>
        this.analyzeSection(section, paper, languageLabel, allocations),
      ),
    )

    return { sections: sectionAnalyses, structure }
  }

  /**
   * 深度分析单节
   */
  private async analyzeSection(
    section: DeepAnalysisPaper['sections'][number],
    paper: DeepAnalysisPaper,
    languageLabel: string,
    allocations: Map<string, number>,
  ): Promise<SectionAnalysis> {
    const budget = allocations.get(section.id) ?? this.config.maxTokensPerSection

    const derivationInstruction = this.config.includeDerivations
      ? '\n7. 对关键公式，给出推导步骤或直觉解释'
      : ''

    const systemPrompt = `你是一位严谨的研究方法论分析专家。请用${languageLabel}对以下论文章节进行深度分析。

要求:
1. 不做摘要，要做深度解读
2. 每个方法步骤必须解释为什么这样做
3. 每个实验设置必须包含具体参数和数据集
4. 每个结果必须关联具体的图表公式编号
5. 指出该节对整体论文主张的贡献
6. 标注审稿人可能质疑的点${derivationInstruction}

深度分析要求:
- 每个方法步骤：不仅描述做什么，更要解释为什么这样选择
- 每个实验结果：必须关联具体图表编号，标注置信度
- 审稿人视角：指出每个主张可能被质疑的点
- 方法论贡献：解释该选择对整体论文主张的贡献
- 核心论点优先：每个分析段落的第一句话就是核心主张
- 证据锚定：不写"图X展示了..."，而写"Table 3显示XX在YY基准上提升Z%"

输出JSON格式:
{
  "deepAnalysis": "深度分析全文",
  "keyPoints": ["要点1", "要点2"],
  "evidenceReferences": ["图1", "表2", "公式3"]
}`

    // 构建证据上下文
    const evidenceContext = this.buildEvidenceContextForSection(section, paper)

    // 如果内容超出预算，裁剪到预算内
    const sectionContent = this.budgetManager.trimToBudget(section.paragraphs, budget)

    const userPrompt = `## ${section.editorialTitle || section.sourceSectionTitle}

${sectionContent}

${evidenceContext}

请深度分析此章节。`

    const result = await omniGateway.complete({
      task: 'topic_summary' as OmniTask,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: budget,
      json: true,
    })

    // 记录使用量（估算输出token）
    this.budgetManager.recordUsage(section.id, this.budgetManager.estimateTokens(result.text))

    return this.parseSectionAnalysis(section, result.text)
  }

  private parseSectionAnalysis(
    section: DeepAnalysisPaper['sections'][number],
    raw: string,
  ): SectionAnalysis {
    const title = section.editorialTitle || section.sourceSectionTitle

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as {
        deepAnalysis?: string
        keyPoints?: string[]
        evidenceReferences?: string[]
      }

      return {
        sectionId: section.id,
        title,
        type: this.inferSectionType(title),
        deepAnalysis: parsed.deepAnalysis ?? raw,
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        evidenceReferences: Array.isArray(parsed.evidenceReferences) ? parsed.evidenceReferences : [],
      }
    } catch {
      return {
        sectionId: section.id,
        title,
        type: this.inferSectionType(title),
        deepAnalysis: raw,
        keyPoints: [],
        evidenceReferences: [],
      }
    }
  }

  private inferSectionType(title: string): SectionAnalysis['type'] {
    const lower = title.toLowerCase()
    if (/(method|approach|方法)/i.test(lower)) return 'methodology'
    if (/(experiment|eval|实验)/i.test(lower)) return 'experiment'
    if (/(result|结果)/i.test(lower)) return 'result'
    if (/(intro|intro|引言|背景)/i.test(lower)) return 'introduction'
    if (/(discuss|讨论|结论|conclusion)/i.test(lower)) return 'discussion'
    return 'other'
  }

  // ─── Pass 3: 结果验证 ───────────────────────────────────────────

  private async validateResults(
    paper: DeepAnalysisPaper,
    methodology: MethodologyResult,
  ): Promise<DeepAnalysisResult> {
    const languageLabel = this.config.language === 'zh' ? '中文' : 'English'

    const systemPrompt = `你是一位严格的审稿人。请用${languageLabel}验证以下论文分析中每个主张是否被证据充分支持。

要求:
1. 对每个主张，检查是否有对应的图表或公式证据
2. 标注置信度 (0-1)
3. 指出证据链断裂的地方
4. 标注需要额外证据的主张

输出JSON格式:
{
  "claims": [
    { "claim": "主张内容", "evidenceIds": ["图1", "表2"], "confidence": 0.85, "validationNote": "验证备注" }
  ],
  "confidenceScore": 0.8
}`

    // 构建主张和证据的摘要
    const claimsSummary = methodology.sections
      .map((s) => `### ${s.title}\n${s.deepAnalysis?.slice(0, 2000)}`)
      .join('\n\n')

    const evidenceSummary = [
      `图表: ${paper.figures.map((f) => `图${f.number}: ${f.caption}`).join(', ')}`,
      `表格: ${paper.tables.map((t) => `表${t.number}: ${t.caption}`).join(', ')}`,
      `公式: ${paper.formulas.map((f) => `公式${f.number}: ${f.latex?.slice(0, 50)}`).join(', ')}`,
    ].join('\n')

    const result = await omniGateway.complete({
      task: 'topic_summary' as OmniTask,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `主张:\n${claimsSummary}\n\n可用证据:\n${evidenceSummary}\n\n请验证每个主张。` },
      ],
      maxTokens: 8000,
      json: true,
    })

    return this.buildValidationResult(paper, methodology, result.text)
  }

  private buildValidationResult(
    paper: DeepAnalysisPaper,
    methodology: MethodologyResult,
    raw: string,
  ): DeepAnalysisResult {
    const parsed = this.parseValidationResult(raw)

    // 构建证据分析Map
    const evidenceAnalysis: EvidenceAnalysisMap = {
      figures: new Map(),
      tables: new Map(),
      formulas: new Map(),
    }

    // 填充图表分析
    for (const fig of paper.figures) {
      const figKey = `图${fig.number}`
      const relatedClaims = parsed.claims
        .filter((c) => c.evidenceIds.some((eid) => eid.includes(figKey) || eid === fig.id))
        .map((c) => c.claim)

      evidenceAnalysis.figures.set(fig.id, {
        analysis: fig.analysis ?? '',
        claims: relatedClaims,
      })
    }

    // 填充表格分析
    for (const tbl of paper.tables) {
      const tblKey = `表${tbl.number}`
      const relatedClaims = parsed.claims
        .filter((c) => c.evidenceIds.some((eid) => eid.includes(tblKey) || eid === tbl.id))
        .map((c) => c.claim)

      evidenceAnalysis.tables.set(tbl.id, {
        analysis: tbl.caption,
        claims: relatedClaims,
      })
    }

    // 填充公式分析
    for (const fml of paper.formulas) {
      const fmlKey = `公式${fml.number}`
      const _relatedClaims = parsed.claims
        .filter((c) => c.evidenceIds.some((eid) => eid.includes(fmlKey) || eid === fml.id))

      evidenceAnalysis.formulas.set(fml.id, {
        analysis: fml.rawText ?? fml.latex,
        derivation: this.config.includeDerivations ? undefined : undefined,
      })
    }

    return {
      sections: methodology.sections,
      evidenceAnalysis,
      claims: parsed.claims,
      confidenceScore: parsed.confidenceScore,
    }
  }

  private parseValidationResult(raw: string): {
    claims: ClaimWithEvidence[]
    confidenceScore: number
  } {
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as {
        claims?: Array<{
          claim?: string
          evidenceIds?: string[]
          confidence?: number
          validationNote?: string
        }>
        confidenceScore?: number
      }

      return {
        claims: Array.isArray(parsed.claims)
          ? parsed.claims.map((c) => ({
              claim: c.claim ?? '',
              evidenceIds: Array.isArray(c.evidenceIds) ? c.evidenceIds : [],
              confidence: typeof c.confidence === 'number' ? c.confidence : 0.5,
              validationNote: c.validationNote,
            }))
          : [],
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.8,
      }
    } catch {
      return { claims: [], confidenceScore: 0.8 }
    }
  }

  // ─── 证据上下文构建 ─────────────────────────────────────────────

  private buildEvidenceContextForSection(
    _section: DeepAnalysisPaper['sections'][number],
    paper: DeepAnalysisPaper,
  ): string {
    const parts: string[] = []

    if (paper.figures?.length) {
      parts.push('相关图表:')
      for (const fig of paper.figures) {
        parts.push(`- 图 ${fig.number}: ${fig.caption}${fig.analysis ? ` (分析: ${fig.analysis})` : ''}`)
      }
    }

    if (paper.tables?.length) {
      parts.push('相关表格:')
      for (const tbl of paper.tables) {
        parts.push(`- 表 ${tbl.number}: ${tbl.caption}`)
        if (tbl.headers) {
          parts.push(`  列: ${tbl.headers}`)
        }
      }
    }

    if (paper.formulas?.length) {
      parts.push('相关公式:')
      for (const fml of paper.formulas) {
        parts.push(`- 公式 ${fml.number}: ${fml.latex}`)
      }
    }

    return parts.join('\n')
  }
}
