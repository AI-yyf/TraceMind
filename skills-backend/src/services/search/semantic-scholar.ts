/**
 * Semantic Scholar API 搜索服务
 *
 * 免费层限制：100 requests / 5 minutes
 * 提供论文搜索、引用链分析、作者信息等功能
 *
 * 增强：三轮扩搜 + 作者网络分析 + Venue聚类
 * "广纳贤文" - 全方位论文发现
 */

import fetch from 'node-fetch'
import { retryWithBackoff } from '../../utils/retry'
import {
  getSourceCooldownUntil,
  noteSourceRateLimit,
  noteSourceSuccess,
} from './source-health'

const SEMANTIC_SCHOLAR_RATE_LIMIT_COOLDOWN_MS = 120_000

const SEMANTIC_SCHOLAR_API_BASE = 'https://api.semanticscholar.org/graph/v1'
const RATE_LIMIT_DELAY_MS = 3000 // 3秒延迟以遵守速率限制

// 论文完整字段选择
const PAPER_FIELDS = [
  'paperId',
  'externalIds',
  'title',
  'abstract',
  'authors',
  'year',
  'citationCount',
  'referenceCount',
  'influentialCitationCount',
  'fieldsOfStudy',
  'publicationTypes',
  'publicationDate',
  'journal',
  'venue',
  'openAccessPdf',
  'tldr',
  'url',
  'publicationVenue',
].join(',')

// 作者字段选择
const AUTHOR_FIELDS = [
  'authorId',
  'name',
  'aliases',
  'affiliations',
  'homepage',
  'hIndex',
  'paperCount',
  'citationCount',
].join(',')

export interface SemanticScholarPaper {
  paperId: string
  externalIds?: {
    ArXiv?: string
    DOI?: string
    PubMed?: string
    MAG?: string
    ACL?: string
    DBLP?: string
  }
  title: string
  abstract?: string
  authors: Array<{
    authorId?: string
    name: string
  }>
  year: number
  citationCount: number
  referenceCount: number
  influentialCitationCount?: number
  fieldsOfStudy?: string[]
  publicationTypes?: string[]
  publicationDate?: string
  journal?: { name?: string; pages?: string; volume?: string }
  venue?: string
  publicationVenue?: { id?: string; name?: string; type?: string; alternate_names?: string[] }
  openAccessPdf?: { url: string; status: string }
  tldr?: { model: string; text: string }
  url?: string
}

export interface SemanticScholarAuthor {
  authorId: string
  name: string
  aliases?: string[]
  affiliations?: string[]
  homepage?: string
  hIndex?: number
  paperCount?: number
  citationCount?: number
}

/** 作者网络分析结果 */
export interface AuthorNetworkResult {
  /** 核心作者 */
  coreAuthors: Array<{
    authorId: string
    name: string
    hIndex: number
    paperCount: number
    citationCount: number
    isKeyAuthor: boolean
  }>
  /** 合作者网络 */
  coAuthorNetwork: Array<{
    authorId: string
    name: string
    collaborationCount: number
    sharedPapers: string[]
  }>
  /** 同作者相关论文 */
  sameAuthorPapers: SemanticScholarPaper[]
}

/** Venue聚类结果 */
export interface VenueClusterResult {
  /** 核心Venue */
  primaryVenue: {
    name: string
    type: 'journal' | 'conference' | 'repository' | 'other'
    paperCount: number
    avgCitationCount: number
  }
  /** 相关Venue列表 */
  relatedVenues: Array<{
    name: string
    type: string
    paperCount: number
    similarity: number
  }>
  /** 同Venue论文 */
  venuePapers: SemanticScholarPaper[]
}

/** 扩搜配置 */
export interface ExpandedSearchConfig {
  /** 扩搜深度 (0-3) */
  expansionDepth?: number
  /** 年份范围 */
  yearStart?: number
  yearEnd?: number
  /** 是否启用作者网络分析 */
  enableAuthorNetwork?: boolean
  /** 是否启用Venue聚类 */
  enableVenueClustering?: boolean
  /** 作者网络扩搜上限 */
  authorNetworkLimit?: number
  /** Venue聚类扩搜上限 */
  venueClusterLimit?: number
  /** LLM生成的查询 (来自discovery-engine) */
  llmGeneratedQueries?: string[]
  /** 最小质量分数阈值 */
  minQualityScore?: number
}

/** 增强的扩搜结果 */
export interface EnhancedExpandedSearchResult {
  /** 基础查询结果 */
  queryResults: SemanticScholarPaper[]
  /** 引用链扩展结果 */
  citationResults: SemanticScholarPaper[]
  /** 作者网络扩展结果 */
  authorNetworkResults?: AuthorNetworkResult
  /** Venue聚类扩展结果 */
  venueClusterResults?: VenueClusterResult
  /** 所有扩展查询 */
  expandedQueries: string[]
  /** LLM生成的查询 */
  llmQueries: string[]
  /** 统计信息 */
  stats: {
    totalFound: number
    queryRoundCount: number
    citationRoundCount: number
    authorNetworkCount: number
    venueClusterCount: number
    uniquePapers: number
    executionTimeMs: number
    sources: string[]
  }
}

export interface CitationChainResult {
  paperId: string
  title: string
  forwardCitations: Array<{
    paperId: string
    title: string
    year: number
    citationCount: number
    relevanceScore: number
  }>
  backwardReferences: Array<{
    paperId: string
    title: string
    year: number
    isKeyReference: boolean
  }>
}

export interface QueryExpansionResult {
  originalQuery: string
  expandedQueries: string[]
  rationale: string
}

// 速率限制器
class RateLimiter {
  private lastRequestTime = 0
  private minDelay = RATE_LIMIT_DELAY_MS
  private cooldownUntil = 0

  async throttle(): Promise<void> {
    const now = Date.now()
    const persistedCooldownUntil = await getSourceCooldownUntil('semantic-scholar')
    this.cooldownUntil = Math.max(this.cooldownUntil, persistedCooldownUntil)
    if (now < this.cooldownUntil) {
      await new Promise(resolve => setTimeout(resolve, this.cooldownUntil - now))
    }
    const afterCooldown = Date.now()
    const elapsed = afterCooldown - this.lastRequestTime
    if (elapsed < this.minDelay) {
      await new Promise(resolve => setTimeout(resolve, this.minDelay - elapsed))
    }
    this.lastRequestTime = Date.now()
  }

  noteRateLimit(retryAfterMs?: number) {
    const cooldownMs =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : SEMANTIC_SCHOLAR_RATE_LIMIT_COOLDOWN_MS
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + cooldownMs)
    void noteSourceRateLimit('semantic-scholar', {
      retryAfterMs,
      defaultCooldownMs: SEMANTIC_SCHOLAR_RATE_LIMIT_COOLDOWN_MS,
    }).catch(() => undefined)
  }
}

const rateLimiter = new RateLimiter()

// 搜索论文
export async function searchPapers(
  query: string,
  options: {
    limit?: number
    yearStart?: number
    yearEnd?: number
    fieldsOfStudy?: string[]
  } = {}
): Promise<SemanticScholarPaper[]> {
  await rateLimiter.throttle()

  const { limit = 20, yearStart, yearEnd, fieldsOfStudy } = options

  const params = new URLSearchParams({
    query,
    limit: limit.toString(),
    fields: PAPER_FIELDS,
  })

  if (yearStart) params.append('yearStart', yearStart.toString())
  if (yearEnd) params.append('yearEnd', yearEnd.toString())
  if (fieldsOfStudy?.length) {
    params.append('fieldsOfStudy', fieldsOfStudy.join(','))
  }

  const url = `${SEMANTIC_SCHOLAR_API_BASE}/paper/search?${params.toString()}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          const error = new Error(`Semantic Scholar API error: ${response.status}`)
          const retryAfter = response.headers.get('retry-after')
          const retryAfterMs =
            retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : undefined
          if (response.status === 429) {
            rateLimiter.noteRateLimit(retryAfterMs)
          }
          (error as Error & { statusCode?: number; retryAfterMs?: number }).statusCode = response.status
          ;(error as Error & { statusCode?: number; retryAfterMs?: number }).retryAfterMs = retryAfterMs
          throw error
        }

        const data = await response.json() as { data: SemanticScholarPaper[] }
        void noteSourceSuccess('semantic-scholar').catch(() => undefined)
        return data.data || []
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  } catch (error) {
    if (
      (error instanceof Error && error.message.includes('429')) ||
      (typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        (error as { statusCode?: number }).statusCode === 429)
    ) {
      rateLimiter.noteRateLimit()
    }
    console.error('Semantic Scholar search failed:', error)
    return []
  }
}

// 获取论文详情
export async function getPaperDetails(paperId: string): Promise<SemanticScholarPaper | null> {
  await rateLimiter.throttle()

  const url = `${SEMANTIC_SCHOLAR_API_BASE}/paper/${paperId}?fields=${PAPER_FIELDS}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          const error = new Error(`Semantic Scholar API error: ${response.status}`)
          const retryAfter = response.headers.get('retry-after')
          const retryAfterMs =
            retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : undefined
          if (response.status === 429) {
            rateLimiter.noteRateLimit(retryAfterMs)
          }
          (error as Error & { statusCode?: number; retryAfterMs?: number }).statusCode = response.status
          ;(error as Error & { statusCode?: number; retryAfterMs?: number }).retryAfterMs = retryAfterMs
          throw error
        }

        void noteSourceSuccess('semantic-scholar').catch(() => undefined)
        return await response.json() as SemanticScholarPaper
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  } catch (error) {
    if (
      (error instanceof Error && error.message.includes('429')) ||
      (typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        (error as { statusCode?: number }).statusCode === 429)
    ) {
      rateLimiter.noteRateLimit()
    }
    console.error('Failed to fetch paper details:', error)
    return null
  }
}

// 获取引用链（前向引用）
export async function getCitations(
  paperId: string,
  limit = 100
): Promise<Array<{ paperId: string; title: string; year: number; citationCount: number }>> {
  await rateLimiter.throttle()

  const fields = 'paperId,title,year,citationCount'
  const url = `${SEMANTIC_SCHOLAR_API_BASE}/paper/${paperId}/citations?fields=${fields}&limit=${limit}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          const error = new Error(`Semantic Scholar API error: ${response.status}`)
          const retryAfter = response.headers.get('retry-after')
          const retryAfterMs =
            retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : undefined
          if (response.status === 429) {
            rateLimiter.noteRateLimit(retryAfterMs)
          }
          (error as Error & { statusCode?: number; retryAfterMs?: number }).statusCode = response.status
          ;(error as Error & { statusCode?: number; retryAfterMs?: number }).retryAfterMs = retryAfterMs
          throw error
        }

        const data = await response.json() as {
          data: Array<{ citingPaper: { paperId: string; title: string; year: number; citationCount: number } }>
        }

        void noteSourceSuccess('semantic-scholar').catch(() => undefined)
        return (data.data || []).map(item => item.citingPaper)
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  } catch (error) {
    if (
      (error instanceof Error && error.message.includes('429')) ||
      (typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        (error as { statusCode?: number }).statusCode === 429)
    ) {
      rateLimiter.noteRateLimit()
    }
    console.error('Failed to fetch citations:', error)
    return []
  }
}

// 获取参考文献（后向引用）
export async function getReferences(
  paperId: string,
  limit = 100
): Promise<Array<{ paperId: string; title: string; year: number }>> {
  await rateLimiter.throttle()

  const fields = 'paperId,title,year'
  const url = `${SEMANTIC_SCHOLAR_API_BASE}/paper/${paperId}/references?fields=${fields}&limit=${limit}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          const error = new Error(`Semantic Scholar API error: ${response.status}`)
          const retryAfter = response.headers.get('retry-after')
          const retryAfterMs =
            retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : undefined
          if (response.status === 429) {
            rateLimiter.noteRateLimit(retryAfterMs)
          }
          (error as Error & { statusCode?: number; retryAfterMs?: number }).statusCode = response.status
          ;(error as Error & { statusCode?: number; retryAfterMs?: number }).retryAfterMs = retryAfterMs
          throw error
        }

        const data = await response.json() as {
          data: Array<{ citedPaper: { paperId: string; title: string; year: number } }>
        }

        void noteSourceSuccess('semantic-scholar').catch(() => undefined)
        return (data.data || []).map(item => item.citedPaper)
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  } catch (error) {
    if (
      (error instanceof Error && error.message.includes('429')) ||
      (typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        (error as { statusCode?: number }).statusCode === 429)
    ) {
      rateLimiter.noteRateLimit()
    }
    console.error('Failed to fetch references:', error)
    return []
  }
}

// 生成扩展查询（内部使用）
export function generateExpandedQueries(
  originalQuery: string,
  results: SemanticScholarPaper[]
): string[] {
  const queries: string[] = []

  // 从结果中提取关键词
  const keywords = new Set<string>()
  results.slice(0, 5).forEach(paper => {
    paper.fieldsOfStudy?.forEach(field => keywords.add(field))
    // 从标题中提取关键词（简单实现）
    const titleWords = paper.title
      .split(/\s+/)
      .filter(w => w.length > 4 && !['using', 'based', 'with', 'from', 'through'].includes(w.toLowerCase()))
    titleWords.slice(0, 3).forEach(w => keywords.add(w))
  })

  // 生成扩展查询
  const keywordArray = Array.from(keywords).slice(0, 5)
  if (keywordArray.length >= 2) {
    queries.push(`${originalQuery} ${keywordArray[0]}`)
    queries.push(`${originalQuery} ${keywordArray.slice(0, 2).join(' ')}`)
  }

  // 添加方法变体
  const methodVariants = ['method', 'approach', 'framework', 'algorithm', 'model']
  methodVariants.forEach(variant => {
    if (!originalQuery.toLowerCase().includes(variant)) {
      queries.push(`${originalQuery} ${variant}`)
    }
  })

  return queries.slice(0, 5)
}

// 识别源头论文
export async function identifyOriginPapers(
  papers: SemanticScholarPaper[]
): Promise<Array<{ paperId: string; title: string; year: number; depth: number }>> {
  const origins: Array<{ paperId: string; title: string; year: number; depth: number }> = []
  const visited = new Set<string>()

  async function traceBack(paperId: string, currentDepth: number): Promise<void> {
    if (currentDepth > 3 || visited.has(paperId)) return
    visited.add(paperId)

    const references = await getReferences(paperId, 20)

    // 找到最早的引用
    const earliestRef = references
      .filter(r => r.year)
      .sort((a, b) => a.year - b.year)[0]

    if (earliestRef && earliestRef.year < 2000) {
      origins.push({
        paperId: earliestRef.paperId,
        title: earliestRef.title,
        year: earliestRef.year,
        depth: currentDepth,
      })
    } else if (earliestRef) {
      await traceBack(earliestRef.paperId, currentDepth + 1)
    }
  }

  // 对前5篇论文进行溯源
  for (const paper of papers.slice(0, 5)) {
    await traceBack(paper.paperId, 0)
  }

  return origins
}

// 计算论文影响力分数
export function calculateImpactScore(paper: SemanticScholarPaper): number {
  const citationScore = Math.log10(Math.max(1, paper.citationCount)) * 10
  const influentialScore = (paper.influentialCitationCount || 0) * 2
  const recencyBonus = paper.year >= 2020 ? 5 : 0
  return citationScore + influentialScore + recencyBonus
}

// ============================================
// 作者网络分析
// ============================================

/**
 * 获取作者详情
 * @param authorId 作者ID
 */
export async function getAuthorDetails(authorId: string): Promise<SemanticScholarAuthor | null> {
  await rateLimiter.throttle()

  const url = `${SEMANTIC_SCHOLAR_API_BASE}/author/${authorId}?fields=${AUTHOR_FIELDS}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          console.warn(`[作者信息获取失败] 作者ID: ${authorId}, 状态: ${response.status}`)
          return null
        }

        return await response.json() as SemanticScholarAuthor
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  } catch (error) {
    console.error('[作者信息获取异常]', authorId, error)
    return null
  }
}

/**
 * 获取作者的论文列表
 * @param authorId 作者ID
 * @param limit 论文数量限制
 */
export async function getAuthorPapers(
  authorId: string,
  limit = 50
): Promise<SemanticScholarPaper[]> {
  await rateLimiter.throttle()

  const url = `${SEMANTIC_SCHOLAR_API_BASE}/author/${authorId}/papers?fields=${PAPER_FIELDS}&limit=${limit}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          console.warn(`[作者论文获取失败] 作者ID: ${authorId}, 状态: ${response.status}`)
          return []
        }

        const data = await response.json() as { data: SemanticScholarPaper[] }
        return data.data || []
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    )
  } catch (error) {
    console.error('[作者论文获取异常]', authorId, error)
    return []
  }
}

/**
 * 分析作者网络
 * 识别核心作者、合作者网络、同作者相关论文
 */
export async function analyzeAuthorNetwork(
  seedPapers: SemanticScholarPaper[],
  config: { maxAuthors?: number; minHIndex?: number; minCollaborations?: number } = {}
): Promise<AuthorNetworkResult> {
  const { maxAuthors = 10, minHIndex = 5, minCollaborations = 2 } = config

  // 收集所有作者
  const authorMap = new Map<string, {
    name: string
    papers: string[]
    coAuthors: Map<string, number>
  }>()

  for (const paper of seedPapers) {
    for (const author of paper.authors) {
      if (!author.authorId) continue

      const existing = authorMap.get(author.authorId) || {
        name: author.name,
        papers: [],
        coAuthors: new Map<string, number>(),
      }

      existing.papers.push(paper.paperId)

      // 记录合作者
      for (const otherAuthor of paper.authors) {
        if (otherAuthor.authorId && otherAuthor.authorId !== author.authorId) {
          existing.coAuthors.set(
            otherAuthor.authorId,
            (existing.coAuthors.get(otherAuthor.authorId) || 0) + 1
          )
        }
      }

      authorMap.set(author.authorId, existing)
    }
  }

  // 获取作者详细信息并筛选核心作者
  const coreAuthors: AuthorNetworkResult['coreAuthors'] = []

  const authorEntries = Array.from(authorMap.entries())
  for (const [authorId, info] of authorEntries) {
    if (coreAuthors.length >= maxAuthors) break

    const details = await getAuthorDetails(authorId)
    if (!details) continue

    // 过滤低影响力作者
    if ((details.hIndex || 0) < minHIndex && info.papers.length < 3) continue

    coreAuthors.push({
      authorId,
      name: details.name || info.name,
      hIndex: details.hIndex || 0,
      paperCount: details.paperCount || info.papers.length,
      citationCount: details.citationCount || 0,
      isKeyAuthor: (details.hIndex || 0) >= 10 || info.papers.length >= 3,
    })
  }

  // 构建合作者网络
  const coAuthorNetwork: AuthorNetworkResult['coAuthorNetwork'] = []

  for (const [_authorId2, info] of authorEntries) {
    const coAuthorEntries = Array.from(info.coAuthors.entries())
    for (const [coAuthorId, count] of coAuthorEntries) {
      if (count < minCollaborations) continue

      const coAuthorInfo = authorMap.get(coAuthorId)
      if (!coAuthorInfo) continue

      coAuthorNetwork.push({
        authorId: coAuthorId,
        name: coAuthorInfo.name,
        collaborationCount: count,
        sharedPapers: info.papers.filter(p => coAuthorInfo.papers.includes(p)),
      })
    }
  }

  // 获取同作者的相关论文
  const sameAuthorPapers: SemanticScholarPaper[] = []
  const seenPaperIds = new Set(seedPapers.map(p => p.paperId))

  // 获取核心作者的其他高质量论文
  for (const coreAuthor of coreAuthors.slice(0, 5)) {
    const papers = await getAuthorPapers(coreAuthor.authorId, 20)

    for (const paper of papers) {
      if (seenPaperIds.has(paper.paperId)) continue
      seenPaperIds.add(paper.paperId)

      // 只添加高影响力论文
      if (paper.citationCount >= 50 || (paper.influentialCitationCount ?? 0) >= 5) {
        sameAuthorPapers.push(paper)
      }
    }
  }

  return {
    coreAuthors,
    coAuthorNetwork,
    sameAuthorPapers,
  }
}

// ============================================
// Venue聚类分析
// ============================================

/**
 * 分析Venue聚类
 * 识别核心venue、相关venue、同venue论文
 */
export async function analyzeVenueCluster(
  seedPapers: SemanticScholarPaper[],
  config: { maxVenues?: number; minPapersPerVenue?: number } = {}
): Promise<VenueClusterResult> {
  const { maxVenues = 5, minPapersPerVenue = 2 } = config

  // 收集venue信息
  const venueMap = new Map<string, {
    papers: SemanticScholarPaper[]
    type: 'journal' | 'conference' | 'repository' | 'other'
    totalCitations: number
  }>()

  for (const paper of seedPapers) {
    const venueName = paper.journal?.name || paper.venue || 'Unknown'
    const venueType = inferVenueType(venueName, paper.publicationTypes)

    const existing = venueMap.get(venueName) || {
      papers: [],
      type: venueType,
      totalCitations: 0,
    }

    existing.papers.push(paper)
    existing.totalCitations += paper.citationCount

    venueMap.set(venueName, existing)
  }

  // 选择主要venue
  const venueEntries = Array.from(venueMap.entries())
    .filter(([_, info]) => info.papers.length >= minPapersPerVenue)
    .sort((a, b) => b[1].totalCitations - a[1].totalCitations)

  if (venueEntries.length === 0) {
    // 无足够venue数据，返回默认结果
    return {
      primaryVenue: {
        name: 'arXiv',
        type: 'repository',
        paperCount: 0,
        avgCitationCount: 0,
      },
      relatedVenues: [],
      venuePapers: [],
    }
  }

  const [primaryVenueName, primaryInfo] = venueEntries[0]

  const primaryVenue = {
    name: primaryVenueName,
    type: primaryInfo.type,
    paperCount: primaryInfo.papers.length,
    avgCitationCount: Math.round(primaryInfo.totalCitations / primaryInfo.papers.length),
  }

  // 构建相关venue列表
  const relatedVenues: VenueClusterResult['relatedVenues'] = venueEntries
    .slice(1, maxVenues)
    .map(([name, info]) => ({
      name,
      type: info.type,
      paperCount: info.papers.length,
      similarity: calculateVenueSimilarity(primaryVenueName, name),
    }))

  // 搜索同venue的其他论文
  const venuePapers: SemanticScholarPaper[] = []
  const seenPaperIds = new Set(seedPapers.map(p => p.paperId))

  if (primaryVenueName !== 'Unknown' && primaryVenueName !== 'arXiv') {
    // 使用venue名称搜索更多论文
    const venueQuery = `"${primaryVenueName}"`
    const additionalPapers = await searchPapers(venueQuery, { limit: 30 })

    for (const paper of additionalPapers) {
      if (seenPaperIds.has(paper.paperId)) continue
      // 只添加与venue匹配的论文
      if (paper.venue?.toLowerCase().includes(primaryVenueName.toLowerCase()) ||
          paper.journal?.name?.toLowerCase().includes(primaryVenueName.toLowerCase())) {
        seenPaperIds.add(paper.paperId)
        venuePapers.push(paper)
      }
    }
  }

  return {
    primaryVenue,
    relatedVenues,
    venuePapers,
  }
}

/**
 * 推断venue类型
 */
function inferVenueType(
  venue: string,
  publicationTypes?: string[]
): 'journal' | 'conference' | 'repository' | 'other' {
  const venueLower = venue.toLowerCase()

  if (venueLower.includes('arxiv') || venueLower.includes('ssrn')) {
    return 'repository'
  }

  if (publicationTypes?.includes('Conference')) {
    return 'conference'
  }

  if (publicationTypes?.includes('JournalArticle')) {
    return 'journal'
  }

  // 基于venue名称推断
  if (venueLower.match(/conference|proc\.|icml|iclr|neurips|cvpr|iccv|eccv|aaai|ijcai|acl|emnlp/i)) {
    return 'conference'
  }

  if (venueLower.match(/journal|j\.|transactions|letters|review|nature|science|pnas/i)) {
    return 'journal'
  }

  return 'other'
}

/**
 * 计算venue相似度
 */
function calculateVenueSimilarity(venue1: string, venue2: string): number {
  const v1 = venue1.toLowerCase()
  const v2 = venue2.toLowerCase()

  // 完全相同
  if (v1 === v2) return 1.0

  // 同类型venue
  const v1Type = inferVenueType(venue1)
  const v2Type = inferVenueType(venue2)

  if (v1Type === v2Type) return 0.5

  // 关键词重叠
  const words1 = v1.split(/\s+/)
  const words2 = v2.split(/\s+/)

  const intersection = words1.filter(w => words2.includes(w)).length
  const union = Math.max(words1.length, words2.length)

  return union > 0 ? intersection / union : 0
}

// ============================================
// 增强的三轮扩搜
// ============================================

/**
 * 执行增强的三轮扩搜
 * 第1轮：原始查询 + LLM生成查询
 * 第2轮：引用扩展 + 作者网络扩展
 * 第3轮：Venue聚类扩展 + 深度引用链追踪
 */
export async function performEnhancedExpandedSearch(
  originalQuery: string,
  config: ExpandedSearchConfig = {}
): Promise<EnhancedExpandedSearchResult> {
  const startTime = Date.now()
  const {
    expansionDepth = 3,
    yearStart,
    yearEnd,
    enableAuthorNetwork = true,
    enableVenueClustering = true,
    authorNetworkLimit = 30,
    venueClusterLimit = 20,
    llmGeneratedQueries = [],
    minQualityScore = 0,
  } = config

  const allPapers: SemanticScholarPaper[] = []
  const seenPaperIds = new Set<string>()
  const sources: string[] = ['query-round-1']
  let llmQueries: string[] = []

  // ===== 第1轮：原始查询和LLM生成查询 =====

  console.log('[第1轮扩搜] 执行原始查询...')
  const queryResults = await searchPapers(originalQuery, { limit: 20, yearStart, yearEnd })

  for (const paper of queryResults) {
    if (!seenPaperIds.has(paper.paperId)) {
      seenPaperIds.add(paper.paperId)
      allPapers.push(paper)
    }
  }

  // 生成扩展查询
  const expandedQueries = generateExpandedQueries(originalQuery, queryResults)

  // 执行LLM生成查询（来自discovery-engine）
  if (llmGeneratedQueries.length > 0) {
    console.log(`[LLM查询扩搜] 执行 ${llmGeneratedQueries.length} 个LLM生成的查询...`)
    llmQueries = llmGeneratedQueries

    for (const query of llmGeneratedQueries.slice(0, 5)) {
      const results = await searchPapers(query, { limit: 10, yearStart, yearEnd })

      for (const paper of results) {
        if (!seenPaperIds.has(paper.paperId)) {
          seenPaperIds.add(paper.paperId)
          allPapers.push(paper)
          sources.push('llm-query')
        }
      }
    }
  }

  // ===== 第2轮：引用扩展 =====

  console.log('[第2轮扩搜] 执行引用链扩展...')
  const citationResults: SemanticScholarPaper[] = []
  sources.push('citation-round-2')

  if (expansionDepth >= 2 && queryResults.length > 0) {
    // 获取高引用论文的引用
    const topPapers = queryResults
      .filter(p => p.citationCount > 0)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 5)

    for (const paper of topPapers) {
      const citations = await getCitations(paper.paperId, 30)

      for (const citation of citations.slice(0, 10)) {
        if (seenPaperIds.has(citation.paperId)) continue

        const details = await getPaperDetails(citation.paperId)
        if (details && details.citationCount >= minQualityScore) {
          seenPaperIds.add(details.paperId)
          citationResults.push(details)
          allPapers.push(details)
        }
      }
    }

    // 后向引用扩展
    for (const paper of topPapers.slice(0, 3)) {
      const references = await getReferences(paper.paperId, 20)

      for (const ref of references.slice(0, 8)) {
        if (seenPaperIds.has(ref.paperId)) continue

        const details = await getPaperDetails(ref.paperId)
        if (details && details.year >= (yearStart || 2000)) {
          seenPaperIds.add(details.paperId)
          citationResults.push(details)
          allPapers.push(details)
        }
      }
    }
  }

  // ===== 第3轮：作者网络和Venue聚类 =====

  let authorNetworkResults: AuthorNetworkResult | undefined
  let venueClusterResults: VenueClusterResult | undefined

  // 作者网络扩展
  if (expansionDepth >= 3 && enableAuthorNetwork && allPapers.length > 0) {
    console.log('[第3轮扩搜] 执行作者网络分析...')
    sources.push('author-network-round-3')

    authorNetworkResults = await analyzeAuthorNetwork(allPapers.slice(0, 20))

    for (const paper of authorNetworkResults.sameAuthorPapers.slice(0, authorNetworkLimit)) {
      if (!seenPaperIds.has(paper.paperId)) {
        seenPaperIds.add(paper.paperId)
        allPapers.push(paper)
      }
    }
  }

  // Venue聚类扩展
  if (expansionDepth >= 3 && enableVenueClustering && allPapers.length > 0) {
    console.log('[第3轮扩搜] 执行Venue聚类分析...')
    sources.push('venue-cluster-round-3')

    venueClusterResults = await analyzeVenueCluster(allPapers.slice(0, 20))

    for (const paper of venueClusterResults.venuePapers.slice(0, venueClusterLimit)) {
      if (!seenPaperIds.has(paper.paperId)) {
        seenPaperIds.add(paper.paperId)
        allPapers.push(paper)
      }
    }
  }

  // 过滤和排序
  const filteredPapers = allPapers
    .filter(p => calculateImpactScore(p) >= minQualityScore)
    .sort((a, b) => calculateImpactScore(b) - calculateImpactScore(a))

  const executionTimeMs = Date.now() - startTime

  console.log(`[扩搜完成] 共发现 ${filteredPapers.length} 篇论文，耗时 ${executionTimeMs}ms`)

  return {
    queryResults: filteredPapers.slice(0, 50),
    citationResults,
    authorNetworkResults,
    venueClusterResults,
    expandedQueries,
    llmQueries,
    stats: {
      totalFound: filteredPapers.length,
      queryRoundCount: queryResults.length,
      citationRoundCount: citationResults.length,
      authorNetworkCount: authorNetworkResults?.sameAuthorPapers.length || 0,
      venueClusterCount: venueClusterResults?.venuePapers.length || 0,
      uniquePapers: seenPaperIds.size,
      executionTimeMs,
      sources,
    },
  }
}

/**
 * 快速扩搜函数（兼容旧接口）
 */
export async function performExpandedSearch(
  originalQuery: string,
  options: {
    expansionDepth?: number
    yearStart?: number
    yearEnd?: number
  } = {}
): Promise<{
  queryResults: SemanticScholarPaper[]
  citationResults: SemanticScholarPaper[]
  expandedQueries: string[]
}> {
  const result = await performEnhancedExpandedSearch(originalQuery, {
    expansionDepth: options.expansionDepth,
    yearStart: options.yearStart,
    yearEnd: options.yearEnd,
    enableAuthorNetwork: (options.expansionDepth ?? 2) >= 3,
    enableVenueClustering: (options.expansionDepth ?? 2) >= 3,
  })

  return {
    queryResults: result.queryResults,
    citationResults: result.citationResults,
    expandedQueries: [...result.expandedQueries, ...result.llmQueries],
  }
}

/**
 * 从DiscoveryEngine集成查询生成
 * 接收LLM生成的查询并执行搜索
 */
export async function executeDiscoveryQueries(
  queries: Array<{ text: string; type: string }>,
  timeRange: { from: string; to: string }
): Promise<SemanticScholarPaper[]> {
  const yearStart = new Date(timeRange.from).getFullYear()
  const yearEnd = new Date(timeRange.to).getFullYear()

  const allPapers: SemanticScholarPaper[] = []
  const seenPaperIds = new Set<string>()

  for (const query of queries) {
    console.log(`[Discovery查询] 类型: ${query.type}, 查询: ${query.text}`)

    const results = await searchPapers(query.text, {
      limit: 15,
      yearStart,
      yearEnd,
    })

    for (const paper of results) {
      if (!seenPaperIds.has(paper.paperId)) {
        seenPaperIds.add(paper.paperId)
        allPapers.push(paper)
      }
    }
  }

  // 按影响力排序
  return allPapers.sort((a, b) => calculateImpactScore(b) - calculateImpactScore(a))
}
