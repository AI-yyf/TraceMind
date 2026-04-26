/**
 * 搜索结果聚合器
 * 实现跨提供者结果整合、去重和质量评分
 *
 * 功能说明：
 * - 多来源聚合：整合 Semantic Scholar、ArXiv、OpenAlex 三大论文数据库结果
 * - 智能去重：基于 DOI、ArXiv ID、Semantic Scholar ID、标题相似度进行多重匹配
 * - 质量评分：综合引用数、影响力引用、Venue质量、发表年份计算综合评分
 * - 可配置阈值：支持设置最小引用数、最小质量分数等过滤条件
 *
 * "广纳贤文" - 全面发现高质量论文
 */

import type { SemanticScholarPaper } from './semantic-scholar'
import type { SearchResult } from '../../../skill-packs/research/paper-tracker/discovery-engine'
import { WebSearchService, type WebSearchResult } from './web-search'

/** 聚合配置 */
export interface AggregatorConfig {
  /** 最小引用数阈值 */
  minCitations?: number
  /** 最小质量分数阈值 (0-100) */
  minQualityScore?: number
  /** 最小影响力引用数阈值 */
  minInfluentialCitations?: number
  /** 是否启用venue质量加权 */
  enableVenueBoost?: boolean
  /** 高质量venue列表（期刊/会议） */
  highQualityVenues?: string[]
  /** 去重时标题相似度阈值 (0-1) */
  titleSimilarityThreshold?: number
  enableBroadCandidateAdmission?: boolean
  /** 时间窗口：最小年份 */
  yearStart?: number
  /** 时间窗口：最大年份 */
  yearEnd?: number
  /** 是否启用时间窗口过滤 */
  enableTimeWindowFilter?: boolean
}

/** 聚合后的论文结果 */
export interface AggregatedPaper {
  /** 论文唯一标识 */
  paperId: string
  /** 标题 */
  title: string
  /** 摘要 */
  abstract?: string
  /** 作者列表 */
  authors: Array<{
    authorId?: string
    name: string
  }>
  /** 发表年份 */
  year: number
  /** DOI */
  doi?: string
  /** ArXiv ID */
  arxivId?: string
  /** Semantic Scholar ID */
  semanticScholarId?: string
  /** OpenAlex ID */
  openAlexId?: string
  /** 引用数 */
  citationCount: number
  /** 影响力引用数 */
  influentialCitationCount?: number
  /** 参考文献数 */
  referenceCount?: number
  /** 发表场所 */
  venue?: string
  /** 期刊名称 */
  journal?: string
  /** 发表类型 */
  publicationTypes?: string[]
  /** 研究领域 */
  fieldsOfStudy?: string[]
  /** PDF开放访问链接 */
  openAccessPdf?: string
  /** TLDR摘要 */
  tldr?: string
  /** 质量分数 */
  qualityScore: number
  /** 数据来源提供者 */
  sources: Array<'semantic-scholar' | 'arxiv' | 'openalex' | 'web-search'>
  /** 来源权重 */
  sourceWeights: Record<string, number>
  /** 去重匹配的论文ID */
  duplicateIds?: string[]
}

/** 聚合结果 */
export interface AggregationResult {
  /** 聚合后的论文列表 */
  papers: AggregatedPaper[]
  /** 聚合统计 */
  stats: {
    /** 输入总论文数 */
    totalInput: number
    /** 去重后论文数 */
    totalAfterDedup: number
    /** 质量过滤后论文数 */
    totalAfterQualityFilter: number
    /** 各来源贡献数 */
    sourceCounts: Record<string, number>
    /** 去重匹配数 */
    duplicateMatches: number
    /** 执行时间(ms) */
    executionTimeMs: number
    /** Web搜索结果数 */
    webSearchResults?: number
    /** Web搜索是否启用 */
    webSearchEnabled?: boolean
  }
  /** 被过滤的论文 */
  filteredPapers: AggregatedPaper[]
}

/** 默认配置 */
const DEFAULT_CONFIG: AggregatorConfig = {
  minCitations: 0,
  minQualityScore: 0,
  minInfluentialCitations: 0,
  enableVenueBoost: true,
  highQualityVenues: [
    'Nature', 'Science', 'PNAS', 'Cell',
    'NeurIPS', 'ICML', 'ICLR', 'ACL', 'EMNLP', 'NAACL',
    'CVPR', 'ICCV', 'ECCV', 'AAAI', 'IJCAI',
    'JMLR', 'PAMI', 'ACM Computing Surveys'
  ],
  titleSimilarityThreshold: 0.85,
  enableBroadCandidateAdmission: true,
  enableTimeWindowFilter: false,
}

/**
 * 搜索结果聚合器类
 */
export class SearchAggregator {
  private config: AggregatorConfig

  constructor(config: Partial<AggregatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 聚合多来源搜索结果
   * @param semanticScholarResults Semantic Scholar 搜索结果
   * @param arxivResults ArXiv 搜索结果
   * @param openAlexResults OpenAlex 搜索结果
   * @returns 聚合结果
   */
  async aggregateResults(
    semanticScholarResults: SemanticScholarPaper[] = [],
    arxivResults: SearchResult[] = [],
    openAlexResults: SearchResult[] = []
  ): Promise<AggregationResult> {
    const startTime = Date.now()

    // 转换为统一格式
    const normalizedPapers: AggregatedPaper[] = []

    // 处理 Semantic Scholar 结果
    for (const paper of semanticScholarResults) {
      normalizedPapers.push(this.normalizeSemanticScholar(paper))
    }

    // 处理 ArXiv 结果
    for (const result of arxivResults) {
      normalizedPapers.push(this.normalizeArxiv(result))
    }

    // 处理 OpenAlex 结果
    for (const result of openAlexResults) {
      normalizedPapers.push(this.normalizeOpenAlex(result))
    }

    // 计算初始统计
    const totalInput = normalizedPapers.length
    const sourceCounts: Record<string, number> = {
      'semantic-scholar': semanticScholarResults.length,
      'arxiv': arxivResults.length,
      'openalex': openAlexResults.length,
    }

    // 第一步：去重
    const deduplicatedPapers = this.deduplicatePapers(normalizedPapers)
    const duplicateMatches = totalInput - deduplicatedPapers.length

    // 第一步半：时间窗口过滤（如果启用）
    const timeFilteredPapers = this.filterByTimeWindow(deduplicatedPapers)

    // 第二步：计算质量分数
    const scoredPapers = timeFilteredPapers.map(paper => ({
      ...paper,
      qualityScore: this.calculateQualityScore(paper),
    }))

    // 第三步：质量过滤
    const { filtered, passed } = this.filterByQuality(scoredPapers)

    const executionTimeMs = Date.now() - startTime

    return {
      papers: passed,
      stats: {
        totalInput,
        totalAfterDedup: deduplicatedPapers.length,
        totalAfterQualityFilter: passed.length,
        sourceCounts,
        duplicateMatches,
        executionTimeMs,
      },
      filteredPapers: filtered,
    }
  }

  /**
   * 聚合多来源搜索结果（包含Web搜索）
   *
   * 此方法在aggregateResults基础上增加了网页搜索功能：
   * - 并行执行学术数据库搜索和网页搜索
   * - 网页搜索结果用于补充发现论文的PDF链接、GitHub实现等资源
   * - 如果未配置API Key，自动降级为仅学术搜索
   *
   * @param query 搜索查询词（用于Web搜索）
   * @param semanticScholarResults Semantic Scholar搜索结果
   * @param arxivResults ArXiv搜索结果
   * @param openAlexResults OpenAlex搜索结果
   * @param webSearchOptions Web搜索选项
   * @returns 聚合结果（包含webSearch统计信息）
   */
  async aggregateWithWebSearch(
    query: string,
    semanticScholarResults: SemanticScholarPaper[] = [],
    arxivResults: SearchResult[] = [],
    openAlexResults: SearchResult[] = [],
    webSearchOptions?: {
      academic?: boolean
      maxWebResults?: number
    }
  ): Promise<AggregationResult> {
    const startTime = Date.now()
    const webSearchService = WebSearchService.getInstance()

    // 检查Web搜索是否可用
    const webSearchEnabled = webSearchService.isConfigured()
    const _webResults: WebSearchResult[] = []

    // 并行执行学术搜索聚合和Web搜索
    const [academicResult, webSearchResults] = await Promise.all([
      // 学术搜索结果聚合
      this.aggregateResults(semanticScholarResults, arxivResults, openAlexResults),

      // Web搜索（仅在配置了API Key时执行）
      webSearchEnabled
        ? webSearchService.search(query, {
            academic: webSearchOptions?.academic ?? true
          }).catch(error => {
            console.warn('[SearchAggregator] Web search failed:', error)
            return [] as WebSearchResult[]
          })
        : Promise.resolve([] as WebSearchResult[])
    ])

    // 如果Web搜索没有结果，直接返回学术搜索结果
    if (webSearchResults.length === 0) {
      return {
        ...academicResult,
        stats: {
          ...academicResult.stats,
          webSearchResults: 0,
          webSearchEnabled,
          executionTimeMs: Date.now() - startTime,
        }
      }
    }

    // 转换Web搜索结果为AggregatedPaper格式
    const normalizedWebPapers = webSearchResults
      .slice(0, webSearchOptions?.maxWebResults ?? 10)
      .map(result => this.normalizeWebSearch(result))

    // 将Web搜索结果与学术搜索结果合并
    const allPapers = [...academicResult.papers, ...normalizedWebPapers]
    const allFiltered = [...academicResult.filteredPapers, ...normalizedWebPapers.filter(p => p.qualityScore < (this.config.minQualityScore || 0))]

    // 更新来源统计
    const sourceCounts = {
      ...academicResult.stats.sourceCounts,
      'web-search': normalizedWebPapers.length,
    }

    return {
      papers: allPapers,
      stats: {
        ...academicResult.stats,
        totalInput: academicResult.stats.totalInput + normalizedWebPapers.length,
        sourceCounts,
        webSearchResults: webSearchResults.length,
        webSearchEnabled,
        executionTimeMs: Date.now() - startTime,
      },
      filteredPapers: allFiltered,
    }
  }

  /**
   * 转换 Semantic Scholar 论文格式
   */
  private normalizeSemanticScholar(paper: SemanticScholarPaper): AggregatedPaper {
    return {
      paperId: paper.paperId,
      title: paper.title,
      abstract: paper.abstract,
      authors: paper.authors,
      year: paper.year,
      doi: paper.externalIds?.DOI,
      arxivId: paper.externalIds?.ArXiv,
      semanticScholarId: paper.paperId,
      openAlexId: undefined,
      citationCount: paper.citationCount || 0,
      influentialCitationCount: paper.influentialCitationCount || 0,
      referenceCount: paper.referenceCount,
      venue: paper.venue,
      journal: paper.journal?.name,
      publicationTypes: paper.publicationTypes,
      fieldsOfStudy: paper.fieldsOfStudy,
      openAccessPdf: paper.openAccessPdf?.url,
      tldr: paper.tldr?.text,
      qualityScore: 0, // 后续计算
      sources: ['semantic-scholar'],
      sourceWeights: { 'semantic-scholar': 1.0 },
    }
  }

  /**
   * 转换 ArXiv 结果格式
   */
  private normalizeArxiv(result: SearchResult): AggregatedPaper {
    const year = new Date(result.published).getFullYear()
    return {
      paperId: result.paperId,
      title: result.title,
      abstract: result.abstract,
      authors: result.authors.map(name => ({ name })),
      year,
      doi: undefined,
      arxivId: result.paperId,
      semanticScholarId: undefined,
      openAlexId: undefined,
      citationCount: result.citationCount || 0,
      influentialCitationCount: 0,
      referenceCount: undefined,
      venue: 'arXiv',
      journal: undefined,
      publicationTypes: ['preprint'],
      fieldsOfStudy: result.categories,
      openAccessPdf: result.pdfUrl,
      tldr: undefined,
      qualityScore: 0,
      sources: ['arxiv'],
      sourceWeights: { 'arxiv': 0.7 }, // ArXiv权重较低（预印本）
    }
  }

  /**
   * 转换 Web Search 结果格式
   * 将网页搜索结果转换为AggregatedPaper格式（用于补充发现）
   */
  private normalizeWebSearch(result: WebSearchResult): AggregatedPaper {
    // 尝试从URL提取年份
    let year = new Date().getFullYear()
    if (result.publishedDate) {
      const parsedYear = new Date(result.publishedDate).getFullYear()
      if (!isNaN(parsedYear)) {
        year = parsedYear
      }
    }

    return {
      paperId: `web-${Buffer.from(result.url).toString('base64').slice(0, 16)}`,
      title: result.title,
      abstract: result.snippet,
      authors: result.author ? [{ name: result.author }] : [],
      year,
      doi: undefined,
      arxivId: result.arxivId,
      semanticScholarId: undefined,
      openAlexId: undefined,
      citationCount: 0,
      influentialCitationCount: 0,
      referenceCount: undefined,
      venue: result.paperType === 'arxiv' ? 'arXiv' : 'Web',
      journal: undefined,
      publicationTypes: result.paperType ? [result.paperType] : ['web'],
      fieldsOfStudy: undefined,
      openAccessPdf: result.paperType === 'pdf' || result.paperType === 'arxiv' ? result.url : undefined,
      tldr: undefined,
      qualityScore: 0,
      sources: ['web-search'],
      sourceWeights: { 'web-search': 0.5 }, // Web搜索结果权重较低
    }
  }

  /**
   * 转换 OpenAlex 结果格式
   */
  private normalizeOpenAlex(result: SearchResult): AggregatedPaper {
    const year = new Date(result.published).getFullYear()
    const doiMatch = result.paperId.match(/^10\.\d{4,}\/[^\s]+/)
    return {
      paperId: result.paperId,
      title: result.title,
      abstract: result.abstract,
      authors: result.authors.map(name => ({ name })),
      year,
      doi: doiMatch ? result.paperId : undefined,
      arxivId: undefined,
      semanticScholarId: undefined,
      openAlexId: result.paperId,
      citationCount: result.citationCount || 0,
      influentialCitationCount: 0,
      referenceCount: undefined,
      venue: undefined,
      journal: undefined,
      publicationTypes: undefined,
      fieldsOfStudy: result.categories,
      openAccessPdf: result.pdfUrl,
      tldr: undefined,
      qualityScore: 0,
      sources: ['openalex'],
      sourceWeights: { 'openalex': 0.85 },
    }
  }

  /**
   * 去重论文
   * 使用多层匹配策略：DOI → Semantic Scholar ID → ArXiv ID → 标题相似度
   */
  private deduplicatePapers(papers: AggregatedPaper[]): AggregatedPaper[] {
    const deduplicatedMap = new Map<string, AggregatedPaper>()
    const keyToCanonicalKey = new Map<string, string>()
    const duplicates: Map<string, string[]> = new Map()

    for (const paper of papers) {
      // 生成多个可能的匹配键
      const matchKeys = this.generateMatchKeys(paper)

      // 查找现有匹配
      let matchedKey: string | null = null
      for (const key of matchKeys) {
        const existingCanonicalKey = keyToCanonicalKey.get(key)
        if (existingCanonicalKey) {
          matchedKey = existingCanonicalKey
          break
        }
      }

      if (matchedKey) {
        // 合合重复论文信息
        const existing = deduplicatedMap.get(matchedKey)!
        const merged = this.mergePapers(existing, paper)

        // 记录重复ID
        const existingDuplicates = duplicates.get(matchedKey) || []
        existingDuplicates.push(paper.paperId)
        duplicates.set(matchedKey, existingDuplicates)

        merged.duplicateIds = existingDuplicates
        deduplicatedMap.set(matchedKey, merged)
        // Keep DOI / arXiv / title aliases pointing to one canonical paper record.
        for (const key of this.generateMatchKeys(merged)) {
          keyToCanonicalKey.set(key, matchedKey)
        }
      } else {
        // 新论文，使用第一个匹配键存储
        const primaryKey = matchKeys[0] ?? `paper:${paper.paperId}`
        deduplicatedMap.set(primaryKey, paper)
        for (const key of matchKeys) {
          keyToCanonicalKey.set(key, primaryKey)
        }
      }
    }

    return Array.from(deduplicatedMap.values())
  }

  /**
   * 生成匹配键
   */
  private generateMatchKeys(paper: AggregatedPaper): string[] {
    const keys: string[] = []

    // DOI 匹配（最可靠）
    if (paper.doi) {
      keys.push(`doi:${paper.doi.toLowerCase()}`)
    }

    // Semantic Scholar ID 匹配
    if (paper.semanticScholarId) {
      keys.push(`s2:${paper.semanticScholarId}`)
    }

    // ArXiv ID 匹配
    if (paper.arxivId) {
      keys.push(`arxiv:${paper.arxivId}`)
    }

    // OpenAlex ID 匹配
    if (paper.openAlexId) {
      keys.push(`openalex:${paper.openAlexId}`)
    }

    // 标题标准化作为最后匹配键
    const normalizedTitle = this.normalizeTitle(paper.title)
    keys.push(`title:${normalizedTitle}`)

    return keys
  }

  /**
   * 标准化标题用于匹配
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) // 取前100字符避免过长
  }

  /**
   * 计算标题相似度
   */
  private calculateTitleSimilarity(title1: string, title2: string): number {
    const normalized1 = this.normalizeTitle(title1)
    const normalized2 = this.normalizeTitle(title2)

    // Jaccard 相似度
    const words1Arr = normalized1.split(' ')
    const words2Arr = normalized2.split(' ')

    const intersection = words1Arr.filter(w => words2Arr.includes(w))
    const unionSize = words1Arr.length + words2Arr.filter(w => !words1Arr.includes(w)).length

    return unionSize > 0 ? intersection.length / unionSize : 0
  }

  /**
   * 合合两篇重复论文的信息
   */
  private mergePapers(existing: AggregatedPaper, newPaper: AggregatedPaper): AggregatedPaper {
    // 合合来源
    const allSources = [...existing.sources, ...newPaper.sources]
    const sources = allSources.filter((s, i) => allSources.indexOf(s) === i) // 去重
    const sourceWeights = { ...existing.sourceWeights, ...newPaper.sourceWeights }

    // 选择更完整的数据
    return {
      paperId: existing.paperId,
      title: existing.title.length >= newPaper.title.length ? existing.title : newPaper.title,
      abstract: existing.abstract || newPaper.abstract,
      authors: existing.authors.length >= newPaper.authors.length ? existing.authors : newPaper.authors,
      year: existing.year || newPaper.year,
      doi: existing.doi || newPaper.doi,
      arxivId: existing.arxivId || newPaper.arxivId,
      semanticScholarId: existing.semanticScholarId || newPaper.semanticScholarId,
      openAlexId: existing.openAlexId || newPaper.openAlexId,
      citationCount: Math.max(existing.citationCount, newPaper.citationCount),
      influentialCitationCount: Math.max(
        existing.influentialCitationCount || 0,
        newPaper.influentialCitationCount || 0
      ),
      referenceCount: existing.referenceCount || newPaper.referenceCount,
      venue: existing.venue || newPaper.venue,
      journal: existing.journal || newPaper.journal,
      publicationTypes: existing.publicationTypes || newPaper.publicationTypes,
      fieldsOfStudy: (existing.fieldsOfStudy?.length ?? 0) >= (newPaper.fieldsOfStudy?.length ?? 0)
        ? existing.fieldsOfStudy
        : newPaper.fieldsOfStudy,
      openAccessPdf: existing.openAccessPdf || newPaper.openAccessPdf,
      tldr: existing.tldr || newPaper.tldr,
      qualityScore: 0, // 重新计算
      sources,
      sourceWeights,
      duplicateIds: existing.duplicateIds,
    }
  }

  /**
   * 计算质量分数
   * 综合考虑引用数、影响力引用、venue质量、发表年份
   */
  private calculateQualityScore(paper: AggregatedPaper): number {
    let score = 0

    // 引用数贡献 (log scale, 最大40分)
    const citationScore = Math.min(40, Math.log10(Math.max(1, paper.citationCount)) * 10)
    score += citationScore

    // 影响力引用贡献 (每个2分, 最大20分)
    const influentialScore = Math.min(20, (paper.influentialCitationCount || 0) * 2)
    score += influentialScore

    // Venue质量贡献
    if (this.config.enableVenueBoost && paper.venue) {
      const venueBoost = this.getVenueBoost(paper.venue, paper.journal)
      score += venueBoost
    }

    // 发表年份贡献 (近年加分)
    const currentYear = new Date().getFullYear()
    const yearDiff = currentYear - paper.year
    if (yearDiff <= 1) {
      score += 10 // 当年或去年发表
    } else if (yearDiff <= 3) {
      score += 5 // 近3年
    }

    // 来源权重调整
    const avgSourceWeight = Object.values(paper.sourceWeights).reduce((a, b) => a + b, 0) / paper.sources.length
    score *= avgSourceWeight

    // 多来源加分（越多来源说明论文越重要）
    if (paper.sources.length > 1) {
      score += 5 * (paper.sources.length - 1)
    }

    return Math.round(score)
  }

  /**
   * 获取venue质量加成
   */
  private getVenueBoost(venue: string, journal?: string): number {
    const highQualityVenues = this.config.highQualityVenues || []

    // 检查venue或journal是否在高质量列表
    const venueName = journal || venue
    for (const hqVenue of highQualityVenues) {
      if (venueName.toLowerCase().includes(hqVenue.toLowerCase())) {
        return 15 // 高质量venue加15分
      }
    }

    // 会议论文一般质量较高
    if (venue?.toLowerCase().includes('conference') ||
        venue?.toLowerCase().includes('proc.') ||
        venue?.toLowerCase().match(/ic[mlr]|cvpr|eccv|aaai|ijcai/i)) {
      return 8
    }

    // 期刊
    if (journal) {
      return 5
    }

    return 0
  }

  /**
   * 按时间窗口过滤论文
   * 确保纳入每一个stage窗口期的论文都应该是这个stage时间内的
   */
  private filterByTimeWindow(papers: AggregatedPaper[]): AggregatedPaper[] {
    if (!this.config.enableTimeWindowFilter) {
      return papers
    }

    const yearStart = this.config.yearStart
    const yearEnd = this.config.yearEnd

    if (!yearStart && !yearEnd) {
      return papers
    }

    return papers.filter(paper => {
      const paperYear = paper.year

      // 没有年份信息的论文保留（后续可人工筛选）
      if (!paperYear || !Number.isFinite(paperYear)) {
        return true
      }

      // 检查是否在时间窗口内
      if (yearStart && yearEnd) {
        return paperYear >= yearStart && paperYear <= yearEnd
      }

      if (yearStart) {
        return paperYear >= yearStart
      }

      if (yearEnd) {
        return paperYear <= yearEnd
      }

      return true
    })
  }

  /**
   * 按质量过滤论文
   */
  private filterByQuality(papers: AggregatedPaper[]): {
    filtered: AggregatedPaper[]
    passed: AggregatedPaper[]
  } {
    const filtered: AggregatedPaper[] = []
    const passed: AggregatedPaper[] = []

    for (const paper of papers) {
      const shouldKeepBroadCandidate =
        this.config.enableBroadCandidateAdmission !== false && this.isBroadButUsefulCandidate(paper)
      const meetsThreshold =
        paper.qualityScore >= (this.config.minQualityScore || 0) &&
        paper.citationCount >= (this.config.minCitations || 0) &&
        (paper.influentialCitationCount || 0) >= (this.config.minInfluentialCitations || 0)

      if (meetsThreshold || shouldKeepBroadCandidate) {
        passed.push(paper)
      } else {
        filtered.push(paper)
      }
    }

    // 按质量分数排序
    passed.sort((a, b) => b.qualityScore - a.qualityScore)

    return { filtered, passed }
  }

  private isBroadButUsefulCandidate(paper: AggregatedPaper): boolean {
    const currentYear = new Date().getFullYear()
    const isRecent = Number.isFinite(paper.year) && paper.year >= currentYear - 2
    const hasAccessibleFullText = Boolean(paper.openAccessPdf || paper.arxivId)
    const hasEnoughSubstance = Boolean(
      paper.abstract?.trim() || paper.tldr?.trim() || paper.fieldsOfStudy?.length,
    )
    const isCorroborated = paper.sources.length > 1
    const isDirectAcademicHit = paper.sources.some((source) =>
      source === 'arxiv' || source === 'semantic-scholar' || source === 'openalex',
    )

    return isDirectAcademicHit && hasEnoughSubstance && (isRecent || hasAccessibleFullText || isCorroborated)
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<AggregatorConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AggregatorConfig {
    return this.config
  }
}

/**
 * 创建搜索聚合器
 */
export function createSearchAggregator(config: Partial<AggregatorConfig> = {}): SearchAggregator {
  return new SearchAggregator(config)
}

/**
 * 创建带时间窗口的搜索聚合器
 * 用于确保论文搜索结果按stage时间窗口过滤
 */
export function createTimeWindowAggregator(
  yearStart: number,
  yearEnd: number,
  config: Partial<AggregatorConfig> = {}
): SearchAggregator {
  return new SearchAggregator({
    ...config,
    enableTimeWindowFilter: true,
    yearStart,
    yearEnd,
  })
}

/**
 * 根据stage窗口月数计算时间范围
 * @param stageWindowMonths stage窗口月数
 * @param currentYear 当前年份
 * @returns {yearStart, yearEnd}
 */
export function calculateTimeWindowFromStage(
  stageWindowMonths: number
): { yearStart: number; yearEnd: number } {
  // 假设stage从当前年份开始，向前推stageWindowMonths个月
  const stageEndDate = new Date()
  const stageStartDate = new Date(stageEndDate)
  stageStartDate.setMonth(stageStartDate.getMonth() - stageWindowMonths)

  return {
    yearStart: stageStartDate.getFullYear(),
    yearEnd: stageEndDate.getFullYear(),
  }
}

/**
 * 快速聚合函数
 */
export async function aggregatePapers(
  semanticScholarResults: SemanticScholarPaper[],
  arxivResults: SearchResult[],
  openAlexResults: SearchResult[],
  config: Partial<AggregatorConfig> = {}
): Promise<AggregationResult> {
  const aggregator = new SearchAggregator(config)
  return aggregator.aggregateResults(semanticScholarResults, arxivResults, openAlexResults)
}

/**
 * 快速聚合函数（包含Web搜索）
 *
 * 使用示例:
 * ```typescript
 * const result = await aggregatePapersWithWebSearch(
 *   'transformer architecture',
 *   s2Results,
 *   arxivResults,
 *   openAlexResults,
 *   {},
 *   { academic: true, maxWebResults: 10 }
 * )
 * ```
 *
 * 环境变量配置:
 * - SERPER_API_KEY: Serper API密钥
 * - EXA_API_KEY: Exa API密钥
 *
 * 如果没有配置API Key，自动降级为仅学术搜索
 */
export async function aggregatePapersWithWebSearch(
  query: string,
  semanticScholarResults: SemanticScholarPaper[],
  arxivResults: SearchResult[],
  openAlexResults: SearchResult[],
  config: Partial<AggregatorConfig> = {},
  webSearchOptions?: { academic?: boolean; maxWebResults?: number }
): Promise<AggregationResult> {
  const aggregator = new SearchAggregator(config)
  return aggregator.aggregateWithWebSearch(
    query,
    semanticScholarResults,
    arxivResults,
    openAlexResults,
    webSearchOptions
  )
}
