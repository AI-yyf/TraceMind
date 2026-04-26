/**
 * OpenAlex API 搜索服务
 *
 * OpenAlex 是一个开放学术论文数据库，覆盖超过250M论文
 * 免费使用，Polite Pool认证可提升速率限制
 *
 * 核心功能：
 * - searchWorks(query, filters) - 搜索论文
 * - getWork(id) - 获取单篇论文详情
 * - getCitationNetwork(workId) - 引用网络遍历
 * - batchGetWorks(ids) - 批量获取
 * - reconstructAbstract(invertedIndex) - 摘要重建
 *
 * "广纳贤文" - 全方位论文发现补充来源
 */

import fetch from 'node-fetch'
import { retryWithBackoff } from '../../utils/retry'
import {
  getSourceCooldownUntil,
  noteSourceRateLimit,
  noteSourceSuccess,
} from './source-health'

const OPENALEX_API_BASE = 'https://api.openalex.org'
const RATE_LIMIT_DELAY_MS = 200 // Polite Pool: ~10 requests/second
const MAX_BATCH_SIZE = 50 // OpenAlex batch endpoint limit
const OPENALEX_RATE_LIMIT_COOLDOWN_MS = 60_000

// Polite Pool email (从环境变量获取，提升速率限制)
const OPENALEX_EMAIL = process.env.OPENALEX_EMAIL || ''

// 论文完整字段选择
const WORK_FIELDS = [
  'id',
  'doi',
  'title',
  'display_name',
  'publication_year',
  'publication_date',
  'ids',           // 包含 arxiv, pmid, pmcid 等
  'authorships',
  'cited_by_count',
  'cited_by_api_url',
  'counts_by_year',
  'referenced_works',
  'related_works',
  'abstract_inverted_index',
  'primary_location',
  'locations',
  'type',
  'type_crossref',
  'open_access',
  'keywords',
  'concepts',
  'mesh',
  'language',
  'is_retracted',
  'is_paratext',
].join(',')

// ============================================
// TypeScript Types
// ============================================

/** OpenAlex Source (期刊/会议/仓库) */
export interface OpenAlexSource {
  id: string
  display_name?: string
  type?: string
  host_organization?: string
  host_organization_name?: string
  works_count?: number
  cited_by_count?: number
  issn_l?: string
  issn?: string[]
  is_oa?: boolean
}

/** OpenAlex Location */
interface OpenAlexLocation {
  source?: OpenAlexSource
  landing_page_url?: string
  pdf_url?: string
  is_oa?: boolean
  oa_status?: string
  license?: string
  version?: string
}

/** OpenAlex Work (论文) */
export interface OpenAlexWork {
  id: string                    // OpenAlex ID: https://openalex.org/W...
  doi?: string                  // DOI: https://doi.org/10.xxx
  title?: string                // 标题 (deprecated, use display_name)
  display_name?: string         // 显示标题
  publication_year?: number     // 发表年份
  publication_date?: string     // 发表日期 (YYYY-MM-DD)
  ids?: {
    openalex?: string           // OpenAlex ID
    doi?: string                // DOI URL
    arxiv?: string              // ArXiv URL
    pmid?: string               // PubMed ID URL
    pmcid?: string              // PMC ID URL
    mag?: string                // Microsoft Academic Graph ID
    wikidata?: string           // Wikidata ID
  }
  authorships?: Array<{
    author?: {
      id?: string
      display_name?: string
      orcid?: string
    }
    institutions?: Array<{
      id?: string
      display_name?: string
      ror?: string
      country_code?: string
      type?: string
    }>
    is_corresponding?: boolean
    raw_author_name?: string
    raw_affiliation_string?: string
  }>
  cited_by_count?: number       // 被引次数
  cited_by_api_url?: string     // 获取引用列表的API URL
  counts_by_year?: Array<{
    year: number
    cited_by_count: number
  }>
  referenced_works?: string[]   // 参考文献ID列表
  related_works?: string[]      // 相关论文ID列表
  abstract_inverted_index?: Record<string, number[]> // 摘要倒排索引
  primary_location?: OpenAlexLocation
  locations?: OpenAlexLocation[]
  type?: string                 // article, book, dissertation, etc.
  type_crossref?: string
  open_access?: {
    is_oa?: boolean
    oa_status?: string
    oa_url?: string
    any_repository_has_fulltext?: boolean
  }
  keywords?: Array<{
    id?: string
    display_name?: string
    score?: number
  }>
  concepts?: Array<{
    id?: string
    wikidata?: string
    display_name?: string
    level?: number
    score?: number
  }>
  mesh?: Array<{
    descriptor_ui?: string
    descriptor_name?: string
    qualifier_ui?: string
    qualifier_name?: string
    is_major_topic?: boolean
  }>
  language?: string
  is_retracted?: boolean
  is_paratext?: boolean         // 是否为副文本 (封面、目录等)
}

/** OpenAlex Author */
export interface OpenAlexAuthor {
  id: string
  display_name?: string
  orcid?: string
  works_count?: number
  cited_by_count?: number
  h_index?: number
  i10_index?: number
  affiliation?: Array<{
    institution?: {
      id?: string
      display_name?: string
      ror?: string
      country_code?: string
      type?: string
    }
    years?: number[]
  }>
}

/** 搜索过滤条件 */
export interface OpenAlexSearchFilters {
  /** 年份范围 */
  from_year?: number
  to_year?: number
  /** 论文类型 */
  type?: 'article' | 'book' | 'dissertation' | 'preprint' | 'conference-paper'
  /** 是否开放获取 */
  is_oa?: boolean
  /** 最小引用数 */
  min_cited_by_count?: number
  /** 是否有全文 */
  has_fulltext?: boolean
  /** 概念ID过滤 */
  concepts_id?: string[]
  /** 期刊/会议ID */
  source_id?: string
  /** 作者ID */
  author_id?: string
  /** DOI过滤 */
  doi?: string
  /** 语言 */
  language?: string
  /** 排除副文本 */
  exclude_paratext?: boolean
  /** 排除撤稿 */
  exclude_retracted?: boolean
}

/** 搜索结果 */
export interface OpenAlexSearchResult {
  results: OpenAlexWork[]
  meta: {
    count?: number              // 总匹配数
    db_response_time_ms?: number
    page?: number
    per_page?: number
    next_page?: string          // 下一页URL
    next_cursor?: string        // 游标分页
  }
  group_by?: Array<{
    key?: string
    key_display_name?: string
    count?: number
  }>
}

/** 引用网络结果 */
export interface CitationNetworkResult {
  workId: string
  forwardCitations: Array<{
    workId: string
    title: string
    year: number
    citationCount: number
    openAccessUrl?: string
  }>
  backwardReferences: Array<{
    workId: string
    title: string
    year: number
    isKeyReference: boolean
  }>
  relatedWorks: Array<{
    workId: string
    title: string
    year: number
    citationCount: number
  }>
}

/** 内部论文格式 (转换后的统一格式) */
export interface OpenAlexPaper {
  paperId: string               // 标准化ID (优先arxiv, 其次doi, 最后openalex)
  title: string
  titleEn: string               // 英文标题
  authors: string[]
  publishedAt: string           // ISO日期
  publishedYear: number
  summary: string               // 从倒排索引重建的摘要
  citationCount: number
  referenceCount: number        // 参考文献
  journal?: string
  venue?: string
  venueType?: 'journal' | 'conference' | 'repository' | 'other'
  pdfUrl?: string
  arxivUrl?: string
  doi?: string
  arxivId?: string
  openAlexId: string
  concepts?: string[]
  keywords?: string[]
  isRetracted: boolean
  isOpenAccess: boolean
  oaStatus?: string
  source: 'openalex'
}

/** 搜索选项 */
export interface SearchWorksOptions {
  limit?: number                // 每页数量 (max: 200)
  page?: number                 // 页码
  cursor?: string               // 游标分页 (推荐)
  sort?: 'cited_by_count' | 'publication_year' | 'relevance_score'
  sortDirection?: 'desc' | 'asc'
  select?: string[]             // 字段选择
  filters?: OpenAlexSearchFilters
  groupBy?: string              // 分组字段
  searchFields?: string[]       // 搜索字段: title, display_name, abstract
}

// ============================================
// Rate Limiter
// ============================================

class RateLimiter {
  private lastRequestTime = 0
  private minDelay = RATE_LIMIT_DELAY_MS
  private cooldownUntil = 0

  async throttle(): Promise<void> {
    const now = Date.now()
    const persistedCooldownUntil = await getSourceCooldownUntil('openalex')
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
        : OPENALEX_RATE_LIMIT_COOLDOWN_MS
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + cooldownMs)
    void noteSourceRateLimit('openalex', {
      retryAfterMs,
      defaultCooldownMs: OPENALEX_RATE_LIMIT_COOLDOWN_MS,
    }).catch(() => undefined)
  }
}

const rateLimiter = new RateLimiter()

// ============================================
// Core Functions
// ============================================

/**
 * 重建摘要 (从倒排索引)
 * OpenAlex使用倒排索引存储摘要以节省空间
 *
 * @param invertedIndex 倒排索引对象 {word: [position1, position2, ...]}
 * @returns 重建的摘要文本
 */
export function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string {
  if (!invertedIndex || typeof invertedIndex !== 'object' || Array.isArray(invertedIndex)) {
    return ''
  }

  // 将所有单词及其位置展平为数组
  const positions: Array<{ index: number; word: string }> = []

  for (const [word, indexes] of Object.entries(invertedIndex)) {
    if (!Array.isArray(indexes)) continue

    for (const index of indexes) {
      if (typeof index === 'number' && Number.isFinite(index)) {
        positions.push({ index, word })
      }
    }
  }

  // 按位置排序并拼接
  return positions
    .sort((a, b) => a.index - b.index)
    .map(item => item.word)
    .join(' ')
}

/**
 * 构建过滤条件字符串
 */
function buildFilterString(filters: OpenAlexSearchFilters): string {
  const parts: string[] = []

  if (filters.from_year !== undefined) {
    parts.push(`from_publication_year:${filters.from_year}`)
  }
  if (filters.to_year !== undefined) {
    parts.push(`to_publication_year:${filters.to_year}`)
  }
  if (filters.type) {
    parts.push(`type:${filters.type}`)
  }
  if (filters.is_oa !== undefined) {
    parts.push(`is_oa:${filters.is_oa}`)
  }
  if (filters.min_cited_by_count !== undefined) {
    parts.push(`cited_by_count:>${filters.min_cited_by_count - 1}`)
  }
  if (filters.has_fulltext) {
    parts.push(`has_fulltext:true`)
  }
  if (filters.concepts_id?.length) {
    parts.push(`concepts.id:${filters.concepts_id.join('|')}`)
  }
  if (filters.source_id) {
    parts.push(`primary_location.source.id:${filters.source_id}`)
  }
  if (filters.author_id) {
    parts.push(`authorships.author.id:${filters.author_id}`)
  }
  if (filters.doi) {
    parts.push(`doi:"${filters.doi}"`)
  }
  if (filters.language) {
    parts.push(`language:${filters.language}`)
  }
  if (filters.exclude_paratext) {
    parts.push(`is_paratext:false`)
  }
  if (filters.exclude_retracted) {
    parts.push(`is_retracted:false`)
  }

  return parts.join(',')
}

/**
 * 获取请求头 (Polite Pool认证)
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'TraceMind-DailyReport/2.0',
  }

  // Polite Pool: 添加mailto参数可提升速率限制
  if (OPENALEX_EMAIL) {
    headers['mailto'] = OPENALEX_EMAIL
  }

  return headers
}

/**
 * 搜索论文
 *
 * @param query 搜索查询
 * @param options 搜索选项
 * @returns 搜索结果
 */
export async function searchWorks(
  query: string,
  options: SearchWorksOptions = {}
): Promise<OpenAlexSearchResult> {
  await rateLimiter.throttle()

  const { limit = 20, page, cursor, sort, sortDirection, select, filters, groupBy, searchFields } = options

  const params = new URLSearchParams()
  params.append('search', query)
  params.append('per_page', String(Math.min(limit, 200)))

  if (page) params.append('page', String(page))
  if (cursor) params.append('cursor', cursor)
  if (sort) params.append('sort', sort)
  if (sortDirection) params.append('sort_direction', sortDirection)
  if (select?.length) params.append('select', select.join(','))
  else params.append('select', WORK_FIELDS)
  if (filters) {
    const filterStr = buildFilterString(filters)
    if (filterStr) params.append('filter', filterStr)
  }
  if (groupBy) params.append('group_by', groupBy)
  if (searchFields?.length) params.append('search_field', searchFields.join(','))

  const url = `${OPENALEX_API_BASE}/works?${params.toString()}${OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(OPENALEX_EMAIL)}` : ''}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: getHeaders(),
          signal: AbortSignal.timeout(10_000),
        })

        if (!response.ok) {
          const error = new Error(`OpenAlex API error: ${response.status}`)
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

        void noteSourceSuccess('openalex').catch(() => undefined)
        return await response.json() as OpenAlexSearchResult
      },
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        shouldRetry: (error: Error) => {
          const statusCode = (error as Error & { statusCode?: number }).statusCode
          // 429 rate limit, 503 service unavailable
          return statusCode === 429 || statusCode === 503 || statusCode === 502
        },
      }
    )
  } catch (error) {
    console.error('[OpenAlex] Search failed:', error)
    return { results: [], meta: {} }
  }
}

/**
 * 获取单篇论文详情
 *
 * @param id OpenAlex ID (W...) 或 DOI
 * @returns 论文详情
 */
export async function getWork(id: string): Promise<OpenAlexWork | null> {
  await rateLimiter.throttle()

  // 支持多种ID格式
  let workId = id
  if (!id.startsWith('W') && !id.startsWith('https://openalex.org/')) {
    // 如果不是OpenAlex ID，尝试作为DOI查询
    if (id.startsWith('10.')) {
      workId = `doi:${id}`
    } else if (id.startsWith('https://doi.org/')) {
      workId = `doi:${id.replace('https://doi.org/', '')}`
    }
  }

  // 标准化OpenAlex ID
  if (workId.startsWith('W') && !workId.startsWith('https://')) {
    workId = `https://openalex.org/${workId}`
  }

  const url = `${OPENALEX_API_BASE}/works/${encodeURIComponent(workId)}?select=${WORK_FIELDS}${OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(OPENALEX_EMAIL)}` : ''}`

  try {
    return await retryWithBackoff(
      async () => {
        const response = await fetch(url, {
          headers: getHeaders(),
          signal: AbortSignal.timeout(10_000),
        })

        if (!response.ok) {
          if (response.status === 404) return null
          const error = new Error(`OpenAlex API error: ${response.status}`)
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

        void noteSourceSuccess('openalex').catch(() => undefined)
        return await response.json() as OpenAlexWork
      },
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        shouldRetry: (error: Error) => {
          const statusCode = (error as Error & { statusCode?: number }).statusCode
          return statusCode === 429 || statusCode === 503 || statusCode === 502
        },
      }
    )
  } catch (error) {
    console.error('[OpenAlex] Get work failed:', id, error)
    return null
  }
}

/**
 * 批量获取论文
 *
 * @param ids OpenAlex ID列表 (最多50个)
 * @returns 论文列表
 */
export async function batchGetWorks(ids: string[]): Promise<OpenAlexWork[]> {
  if (ids.length === 0) return []

  // 分批处理 (OpenAlex限制最多50个)
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
    batches.push(ids.slice(i, i + MAX_BATCH_SIZE))
  }

  const results: OpenAlexWork[] = []

  for (const batch of batches) {
    await rateLimiter.throttle()

    // 标准化IDs
    const normalizedIds = batch.map(id => {
      if (id.startsWith('W') && !id.startsWith('https://')) {
        return `https://openalex.org/${id}`
      }
      return id
    })

    // 使用filter参数批量查询
    const filterStr = normalizedIds.map(id => `id:${id}`).join('|')
    const url = `${OPENALEX_API_BASE}/works?filter=${encodeURIComponent(filterStr)}&select=${WORK_FIELDS}&per_page=${MAX_BATCH_SIZE}${OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(OPENALEX_EMAIL)}` : ''}`

    try {
      const response = await retryWithBackoff(
        async () => {
          const res = await fetch(url, {
            headers: getHeaders(),
            signal: AbortSignal.timeout(15_000),
          })

          if (!res.ok) {
            const error = new Error(`OpenAlex batch query error: ${res.status}`)
            ;(error as Error & { statusCode?: number }).statusCode = res.status
            throw error
          }

          return await res.json() as OpenAlexSearchResult
        },
        {
          maxAttempts: 3,
          baseDelayMs: 500,
        }
      )

      results.push(...(response.results || []))
    } catch (error) {
      console.error('[OpenAlex] Batch query failed:', error)
    }
  }

  return results
}

/**
 * 获取引用网络
 * 遍历前向引用和后向引用
 *
 * @param workId OpenAlex ID
 * @param options 配置选项
 * @returns 引用网络结果
 */
export async function getCitationNetwork(
  workId: string,
  options: {
    maxForwardCitations?: number
    maxBackwardReferences?: number
    maxRelatedWorks?: number
    minCitationCount?: number
  } = {}
): Promise<CitationNetworkResult> {
  const { maxForwardCitations = 20, maxBackwardReferences = 20, maxRelatedWorks = 10, minCitationCount = 0 } = options

  // 先获取论文详情
  const work = await getWork(workId)
  if (!work) {
    return {
      workId,
      forwardCitations: [],
      backwardReferences: [],
      relatedWorks: [],
    }
  }

  // 获取前向引用 (cited_by_api_url)
  const forwardCitations: CitationNetworkResult['forwardCitations'] = []
  if (work.cited_by_api_url) {
    await rateLimiter.throttle()

    try {
      const citationsUrl = `${work.cited_by_api_url}?select=id,display_name,publication_year,cited_by_count,open_access&per_page=${maxForwardCitations}&sort=cited_by_count:desc${OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(OPENALEX_EMAIL)}` : ''}`

      const response = await fetch(citationsUrl, {
        headers: getHeaders(),
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) {
        const data = await response.json() as OpenAlexSearchResult
        for (const citingWork of (data.results || [])) {
          if (citingWork.cited_by_count && citingWork.cited_by_count >= minCitationCount) {
            forwardCitations.push({
              workId: citingWork.id || '',
              title: citingWork.display_name || '',
              year: citingWork.publication_year || 0,
              citationCount: citingWork.cited_by_count || 0,
              openAccessUrl: citingWork.open_access?.oa_url,
            })
          }
        }
      }
    } catch (error) {
      console.error('[OpenAlex] Get forward citations failed:', error)
    }
  }

  // 获取后向引用 (referenced_works)
  const backwardReferences: CitationNetworkResult['backwardReferences'] = []
  if (work.referenced_works?.length) {
    const refIds = work.referenced_works.slice(0, maxBackwardReferences)
    const refWorks = await batchGetWorks(refIds)

    for (const refWork of refWorks) {
      // 判断是否为关键引用 (引用数较高)
      const isKeyReference = (refWork.cited_by_count || 0) >= 50
      backwardReferences.push({
        workId: refWork.id || '',
        title: refWork.display_name || '',
        year: refWork.publication_year || 0,
        isKeyReference,
      })
    }
  }

  // 获取相关论文 (related_works)
  const relatedWorks: CitationNetworkResult['relatedWorks'] = []
  if (work.related_works?.length) {
    const relatedIds = work.related_works.slice(0, maxRelatedWorks)
    const relatedWorksData = await batchGetWorks(relatedIds)

    for (const relatedWork of relatedWorksData) {
      relatedWorks.push({
        workId: relatedWork.id || '',
        title: relatedWork.display_name || '',
        year: relatedWork.publication_year || 0,
        citationCount: relatedWork.cited_by_count || 0,
      })
    }
  }

  return {
    workId: work.id || workId,
    forwardCitations,
    backwardReferences,
    relatedWorks,
  }
}

/**
 * 获取作者详情
 *
 * @param authorId OpenAlex Author ID (A...)
 * @returns 作者详情
 */
export async function getAuthor(authorId: string): Promise<OpenAlexAuthor | null> {
  await rateLimiter.throttle()

  let id = authorId
  if (!id.startsWith('A') && !id.startsWith('https://openalex.org/')) {
    id = `https://openalex.org/${id}`
  }
  if (id.startsWith('A') && !id.startsWith('https://')) {
    id = `https://openalex.org/${id}`
  }

  const url = `${OPENALEX_API_BASE}/authors/${encodeURIComponent(id)}${OPENALEX_EMAIL ? `?mailto=${encodeURIComponent(OPENALEX_EMAIL)}` : ''}`

  try {
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`OpenAlex API error: ${response.status}`)
    }

    return await response.json() as OpenAlexAuthor
  } catch (error) {
    console.error('[OpenAlex] Get author failed:', authorId, error)
    return null
  }
}

/**
 * 获取作者论文列表
 *
 * @param authorId OpenAlex Author ID
 * @param options 搜索选项
 * @returns 论文列表
 */
export async function getAuthorWorks(
  authorId: string,
  options: {
    limit?: number
    sort?: 'cited_by_count' | 'publication_year'
    minCitationCount?: number
  } = {}
): Promise<OpenAlexWork[]> {
  const { limit = 50, sort = 'cited_by_count', minCitationCount = 0 } = options

  let id = authorId
  if (id.startsWith('A') && !id.startsWith('https://')) {
    id = `https://openalex.org/${id}`
  }

  const params = new URLSearchParams()
  params.append('filter', `authorships.author.id:${id}`)
  params.append('select', WORK_FIELDS)
  params.append('per_page', String(Math.min(limit, 200)))
  params.append('sort', `${sort}:desc`)
  if (minCitationCount > 0) {
    params.append('filter', `authorships.author.id:${id},cited_by_count:>${minCitationCount - 1}`)
  }
  if (OPENALEX_EMAIL) {
    params.append('mailto', OPENALEX_EMAIL)
  }

  const url = `${OPENALEX_API_BASE}/works?${params.toString()}`

  await rateLimiter.throttle()

  try {
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`)
    }

    const data = await response.json() as OpenAlexSearchResult
    return data.results || []
  } catch (error) {
    console.error('[OpenAlex] Get author works failed:', authorId, error)
    return []
  }
}

// ============================================
// Data Transformation
// ============================================

/**
 * 提取ArXiv ID
 */
export function extractArxivId(work: OpenAlexWork): string | null {
  // 从ids字段提取
  if (work.ids?.arxiv) {
    const match = work.ids.arxiv.match(/arxiv\.org\/abs\/([^v<\s]+)(?:v\d+)?/i)
    return match?.[1] || null
  }

  // 从locations提取
  for (const location of (work.locations || [])) {
    if (location.landing_page_url) {
      const match = location.landing_page_url.match(/arxiv\.org\/abs\/([^v<\s]+)(?:v\d+)?/i)
      if (match?.[1]) return match[1]
    }
  }

  return null
}

/**
 * 标准化论文ID (统一格式)
 */
export function normalizePaperId(work: OpenAlexWork): string {
  const arxivId = extractArxivId(work)
  if (arxivId) return arxivId

  const doi = work.doi || work.ids?.doi
  if (doi) {
    const doiClean = doi.replace('https://doi.org/', '')
    return `doi:${doiClean.toLowerCase()}`
  }

  // 使用OpenAlex ID作为后备
  const openalexId = work.id?.split('/').pop() || ''
  return `openalex:${openalexId}`
}

/**
 * 转换为内部论文格式
 */
export function transformToInternalPaper(work: OpenAlexWork): OpenAlexPaper | null {
  if (!work.id || !work.display_name) return null

  const arxivId = extractArxivId(work)
  const doi = work.doi || work.ids?.doi
  const openalexId = work.id.split('/').pop() || ''

  // 提取作者列表
  const authors = (work.authorships || [])
    .map(authorship => authorship.author?.display_name || authorship.raw_author_name || '')
    .filter(Boolean)

  // 确定venue信息
  const primarySource = work.primary_location?.source
  const journal = primarySource?.display_name
  const venueType = (primarySource?.type as OpenAlexPaper['venueType']) || 'other'
  const venue = work.type === 'conference-paper' ? primarySource?.display_name : journal

  // 获取PDF URL
  const pdfUrl = work.primary_location?.pdf_url || work.open_access?.oa_url

  // 提取概念和关键词
  const concepts = (work.concepts || [])
    .filter(c => c.score && c.score >= 0.3)
    .map(c => c.display_name || '')
    .filter(Boolean)

  const keywords = (work.keywords || [])
    .map(k => k.display_name || '')
    .filter(Boolean)

  // 确定发表日期
  let publishedAt = work.publication_date
  if (!publishedAt && work.publication_year) {
    publishedAt = `${work.publication_year}-01-01`
  }

  return {
    paperId: normalizePaperId(work),
    title: work.display_name,
    titleEn: work.display_name,
    authors,
    publishedAt: publishedAt || '',
    publishedYear: work.publication_year || 0,
    summary: reconstructAbstract(work.abstract_inverted_index),
    citationCount: work.cited_by_count || 0,
    referenceCount: work.referenced_works?.length || 0,
    journal,
    venue,
    venueType,
    pdfUrl,
    arxivUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
    doi: doi?.replace('https://doi.org/', ''),
    arxivId: arxivId || undefined,
    openAlexId: openalexId,
    concepts,
    keywords,
    isRetracted: work.is_retracted || false,
    isOpenAccess: work.open_access?.is_oa || false,
    oaStatus: work.open_access?.oa_status,
    source: 'openalex',
  }
}

/**
 * 批量转换为内部论文格式
 */
export function transformToInternalPapers(works: OpenAlexWork[]): OpenAlexPaper[] {
  return works
    .map(transformToInternalPaper)
    .filter((paper): paper is OpenAlexPaper => paper !== null)
}

/**
 * 获取venue/source详情
 */
export async function getSource(sourceId: string): Promise<OpenAlexSource | null> {
  await rateLimiter.throttle()

  let id = sourceId
  if (!id.startsWith('S') && !id.startsWith('https://openalex.org/')) {
    id = `https://openalex.org/${id}`
  }
  if (id.startsWith('S') && !id.startsWith('https://')) {
    id = `https://openalex.org/${id}`
  }

  const url = `${OPENALEX_API_BASE}/sources/${encodeURIComponent(id)}${OPENALEX_EMAIL ? `?mailto=${encodeURIComponent(OPENALEX_EMAIL)}` : ''}`

  try {
    const response = await fetch(url, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`OpenAlex API error: ${response.status}`)
    }

    return await response.json() as OpenAlexSource
  } catch (error) {
    console.error('[OpenAlex] Get source failed:', sourceId, error)
    return null
  }
}

/**
 * 按venue搜索论文
 */
export async function searchWorksByVenue(
  venueId: string,
  options: {
    limit?: number
    yearStart?: number
    yearEnd?: number
    minCitationCount?: number
  } = {}
): Promise<OpenAlexWork[]> {
  const { limit = 30, yearStart, yearEnd, minCitationCount } = options

  const filters: OpenAlexSearchFilters = {
    source_id: venueId,
    exclude_paratext: true,
    exclude_retracted: true,
  }

  if (yearStart) filters.from_year = yearStart
  if (yearEnd) filters.to_year = yearEnd
  if (minCitationCount) filters.min_cited_by_count = minCitationCount

  const result = await searchWorks('', {
    limit,
    sort: 'cited_by_count',
    filters,
  })

  return result.results
}

/**
 * 高级发现搜索 (广纳贤文)
 * 使用多种策略确保不遗漏高质量论文
 */
export async function discoverySearch(
  query: string,
  config: {
    yearStart?: number
    yearEnd?: number
    minCitationCount?: number
    maxResults?: number
    enableConceptExpansion?: boolean
    enableVenueExpansion?: boolean
    excludeRetracted?: boolean
  } = {}
): Promise<OpenAlexPaper[]> {
  const {
    yearStart,
    yearEnd,
    minCitationCount = 10,
    maxResults = 50,
    enableConceptExpansion = true,
    excludeRetracted = true,
  } = config

  const filters: OpenAlexSearchFilters = {
    type: 'article',
    min_cited_by_count: minCitationCount,
    exclude_paratext: true,
    exclude_retracted: excludeRetracted,
    has_fulltext: true,
  }

  if (yearStart) filters.from_year = yearStart
  if (yearEnd) filters.to_year = yearEnd

  // 第一轮：主查询
  const mainResults = await searchWorks(query, {
    limit: maxResults,
    sort: 'relevance_score',
    filters,
  })

  const allWorks: OpenAlexWork[] = [...(mainResults.results || [])]
  const seenIds = new Set(allWorks.map(w => w.id))

  // 第二轮：概念扩展
  if (enableConceptExpansion && allWorks.length > 0) {
    // 提取主要概念
    const conceptIds = new Set<string>()
    for (const work of allWorks.slice(0, 10)) {
      for (const concept of (work.concepts || [])) {
        if (concept.score && concept.score >= 0.5 && concept.id) {
          conceptIds.add(concept.id)
        }
      }
    }

    // 使用概念进行补充搜索
    for (const conceptId of Array.from(conceptIds).slice(0, 3)) {
      const conceptFilter = { ...filters, concepts_id: [conceptId] }
      const conceptResults = await searchWorks(query, {
        limit: 15,
        filters: conceptFilter,
      })

      for (const work of (conceptResults.results || [])) {
        if (!seenIds.has(work.id)) {
          seenIds.add(work.id || '')
          allWorks.push(work)
        }
      }
    }
  }

  // 转换为内部格式
  return transformToInternalPapers(allWorks.slice(0, maxResults))
}

// ============================================
// Export Testing Utilities
// ============================================

export const __testing = {
  reconstructAbstract,
  normalizePaperId,
  extractArxivId,
  buildFilterString,
}
