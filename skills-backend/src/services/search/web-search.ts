/**
 * Web Search Service
 * 使用 Serper/Exa API 进行网页搜索，增强论文发现能力
 *
 * 功能：
 * - 通用网页搜索（用于查找论文下载链接、作者主页、相关资源）
 * - 学术专用搜索（用于深度发现学术博客、技术报告、项目页面）
 * - 搜索结果解析和论文识别
 */

/** Serper 搜索响应 */
interface SerperResponse {
  organic: Array<{
    title: string
    link: string
    snippet: string
    date?: string
    position: number
  }>
  knowledgeGraph?: {
    title?: string
    type?: string
    description?: string
  }
  relatedSearches?: Array<{
    query: string
  }>
}

/** Exa 搜索响应 */
interface ExaResponse {
  results: Array<{
    title: string
    url: string
    snippet: string
    author?: string
    publishedDate?: string
    score: number
  }>
}

/** 统一网页搜索结果 */
export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: 'serper' | 'exa'
  /** 发布日期 */
  publishedDate?: string
  /** 作者（如果有） */
  author?: string
  /** 相关度分数 */
  score?: number
  /** 检测到的论文类型 */
  paperType?: 'arxiv' | 'pdf' | 'github' | 'blog' | 'unknown'
  /** 可能的 ArXiv ID */
  arxivId?: string
  /** 可能的论文标题 */
  inferredTitle?: string
}

/** Web Search 配置 */
export interface WebSearchConfig {
  /** Serper API Key */
  serperApiKey?: string
  /** Exa API Key */
  exaApiKey?: string
  /** 搜索结果数量限制 */
  maxResults?: number
  /** 搜索超时（毫秒） */
  timeoutMs?: number
  /** 是否优先使用 Exa（学术搜索更精准） */
  preferExa?: boolean
}

const DEFAULT_CONFIG: Required<Omit<WebSearchConfig, 'serperApiKey' | 'exaApiKey'>> = {
  maxResults: 10,
  timeoutMs: 15000,
  preferExa: true,
}

/** ArXiv URL 模式 */
const ARXIV_PATTERNS = {
  absUrl: /arxiv\.org\/abs\/(\d+\.\d+(?:v\d+)?)/,
  pdfUrl: /arxiv\.org\/pdf\/(\d+\.\d+(?:v\d+)?)/,
  pdfDirect: /arxiv\.org\/pdf\/([a-z-]+\/\d+|\d+\.\d+)/,
}

/** PDF 链接模式 */
const PDF_PATTERNS = {
  pdfUrl: /\.pdf$/i,
  pdfContentType: /content-type:\s*application\/pdf/i,
}

/** GitHub 模式 */
const GITHUB_PATTERNS = {
  repoUrl: /github\.com\/([^/]+)\/([^/]+)/,
}

/**
 * Web Search 服务类
 */
export class WebSearchService {
  private config: Required<WebSearchConfig> & { serperApiKey?: string; exaApiKey?: string }
  private static instance: WebSearchService | null = null

  constructor(config: WebSearchConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      serperApiKey: config.serperApiKey || process.env.SERPER_API_KEY || '',
      exaApiKey: config.exaApiKey || process.env.EXA_API_KEY || '',
    }
  }

  static getInstance(config?: WebSearchConfig): WebSearchService {
    if (!WebSearchService.instance) {
      WebSearchService.instance = new WebSearchService(config)
    }
    return WebSearchService.instance
  }

  /**
   * 执行通用网页搜索
   * 自动选择 Serper 或 Exa
   */
  async search(query: string, options?: { academic?: boolean }): Promise<WebSearchResult[]> {
    // 优先使用 Exa 进行学术搜索
    if (this.config.preferExa && this.config.exaApiKey && options?.academic) {
      return this.exaSearch(query)
    }

    // 使用 Serper 进行通用搜索
    if (this.config.serperApiKey) {
      return this.serperSearch(query)
    }

    // 尝试 Exa 作为后备
    if (this.config.exaApiKey) {
      return this.exaSearch(query)
    }

    console.warn('[WebSearch] No API key configured for Serper or Exa')
    return []
  }

  /**
   * 搜索论文相关资源
   * 用于查找论文下载链接、GitHub 实现、博客解析等
   */
  async searchPaperResources(paperTitle: string): Promise<WebSearchResult[]> {
    const searchQueries = [
      `"${paperTitle}" pdf`,
      `"${paperTitle}" github`,
      `"${paperTitle}" implementation`,
      `"${paperTitle}" arxiv`,
    ]

    const results = await Promise.all(
      searchQueries.map((query) => this.search(query, { academic: true }))
    )

    // 合并去重
    const allResults = results.flat()
    const seen = new Set<string>()
    return allResults.filter((result) => {
      const key = result.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, this.config.maxResults * 2)
  }

  /**
   * 搜索特定论文的 PDF 下载链接
   */
  async findPaperPdf(paperTitle: string, doi?: string): Promise<string | null> {
    const query = doi
      ? `"${paperTitle}" ${doi} pdf`
      : `"${paperTitle}" pdf download`

    const results = await this.search(query, { academic: true })
    const pdfResult = results.find((r) =>
      PDF_PATTERNS.pdfUrl.test(r.url) ||
      ARXIV_PATTERNS.pdfUrl.test(r.url) ||
      ARXIV_PATTERNS.pdfDirect.test(r.url)
    )

    return pdfResult?.url || null
  }

  /**
   * 解析搜索结果，识别论文类型
   */
  parseResultType(result: WebSearchResult): WebSearchResult {
    const url = result.url.toLowerCase()

    // ArXiv 检测
    for (const pattern of Object.values(ARXIV_PATTERNS)) {
      const match = url.match(pattern)
      if (match) {
        result.paperType = 'arxiv'
        result.arxivId = match[1]
        result.inferredTitle = result.title.replace(/\s*-\s*arXiv.*$/i, '').trim()
        return result
      }
    }

    // GitHub 检测
    const githubMatch = url.match(GITHUB_PATTERNS.repoUrl)
    if (githubMatch) {
      result.paperType = 'github'
      return result
    }

    // PDF 检测
    if (PDF_PATTERNS.pdfUrl.test(url)) {
      result.paperType = 'pdf'
      return result
    }

    result.paperType = 'unknown'
    return result
  }

  /**
   * 使用 Serper API 搜索
   */
  private async serperSearch(query: string): Promise<WebSearchResult[]> {
    if (!this.config.serperApiKey) {
      return []
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.config.serperApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          num: this.config.maxResults,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.warn(`[WebSearch] Serper API error: ${response.status}`)
        return []
      }

      const data: SerperResponse = await response.json()

      return data.organic
        .slice(0, this.config.maxResults)
        .map((item) => {
          const result: WebSearchResult = {
            title: item.title,
            url: item.link,
            snippet: item.snippet,
            source: 'serper',
            publishedDate: item.date,
          }
          return this.parseResultType(result)
        })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[WebSearch] Serper request timed out')
      } else {
        console.error('[WebSearch] Serper error:', error)
      }
      return []
    }
  }

  /**
   * 使用 Exa API 搜索（更适合学术内容）
   */
  private async exaSearch(query: string): Promise<WebSearchResult[]> {
    if (!this.config.exaApiKey) {
      return []
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'x-api-key': this.config.exaApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          numResults: this.config.maxResults,
          useAutoprompt: true,
          type: 'neural',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        console.warn(`[WebSearch] Exa API error: ${response.status}`)
        return []
      }

      const data: ExaResponse = await response.json()

      return data.results
        .slice(0, this.config.maxResults)
        .map((item) => {
          const result: WebSearchResult = {
            title: item.title,
            url: item.url,
            snippet: item.snippet,
            source: 'exa',
            publishedDate: item.publishedDate,
            author: item.author,
            score: item.score,
          }
          return this.parseResultType(result)
        })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[WebSearch] Exa request timed out')
      } else {
        console.error('[WebSearch] Exa error:', error)
      }
      return []
    }
  }

  /**
   * 检查是否配置了 API Key
   */
  isConfigured(): boolean {
    return !!(this.config.serperApiKey || this.config.exaApiKey)
  }

  /**
   * 获取配置状态
   */
  getConfigStatus(): { serper: boolean; exa: boolean } {
    return {
      serper: !!this.config.serperApiKey,
      exa: !!this.config.exaApiKey,
    }
  }
}

export default WebSearchService
