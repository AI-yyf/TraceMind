/**
 * Semantic Scholar API 搜索服务
 * 
 * 免费层限制：100 requests / 5 minutes
 * 提供论文搜索、引用链分析、作者信息等功能
 */

import fetch from 'node-fetch'

const SEMANTIC_SCHOLAR_API_BASE = 'https://api.semanticscholar.org/graph/v1'
const RATE_LIMIT_DELAY_MS = 3000 // 3秒延迟以遵守速率限制

// 论文字段选择 - 优化免费层使用
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
].join(',')

export interface SemanticScholarPaper {
  paperId: string
  externalIds?: {
    ArXiv?: string
    DOI?: string
    PubMed?: string
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
  journal?: { name?: string }
  venue?: string
  openAccessPdf?: { url: string; status: string }
  tldr?: { model: string; text: string }
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

  async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.minDelay) {
      await new Promise(resolve => setTimeout(resolve, this.minDelay - elapsed))
    }
    this.lastRequestTime = Date.now()
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
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Semantic Scholar API error: ${response.status}`)
    }

    const data = await response.json() as { data: SemanticScholarPaper[] }
    return data.data || []
  } catch (error) {
    console.error('Semantic Scholar search failed:', error)
    return []
  }
}

// 获取论文详情
export async function getPaperDetails(paperId: string): Promise<SemanticScholarPaper | null> {
  await rateLimiter.throttle()

  const url = `${SEMANTIC_SCHOLAR_API_BASE}/paper/${paperId}?fields=${PAPER_FIELDS}`

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Semantic Scholar API error: ${response.status}`)
    }

    return await response.json() as SemanticScholarPaper
  } catch (error) {
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
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Semantic Scholar API error: ${response.status}`)
    }

    const data = await response.json() as {
      data: Array<{ citingPaper: { paperId: string; title: string; year: number; citationCount: number } }>
    }

    return (data.data || []).map(item => item.citingPaper)
  } catch (error) {
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
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Semantic Scholar API error: ${response.status}`)
    }

    const data = await response.json() as {
      data: Array<{ citedPaper: { paperId: string; title: string; year: number } }>
    }

    return (data.data || []).map(item => item.citedPaper)
  } catch (error) {
    console.error('Failed to fetch references:', error)
    return []
  }
}

// 三轮扩搜策略
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
  const { expansionDepth = 2, yearStart, yearEnd } = options

  // 第1轮：原始查询
  const queryResults = await searchPapers(originalQuery, { limit: 20, yearStart, yearEnd })

  // 生成扩展查询
  const expandedQueries = generateExpandedQueries(originalQuery, queryResults)

  // 第2轮：扩展查询搜索
  let expansionResults: SemanticScholarPaper[] = []
  if (expansionDepth >= 1) {
    for (const query of expandedQueries.slice(0, 3)) {
      const results = await searchPapers(query, { limit: 10, yearStart, yearEnd })
      expansionResults = [...expansionResults, ...results]
    }
  }

  // 第3轮：引用扩展
  const citationResults: SemanticScholarPaper[] = []
  if (expansionDepth >= 2 && queryResults.length > 0) {
    // 获取前3篇高引用论文的引用
    const topPapers = queryResults
      .filter(p => p.citationCount > 0)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, 3)

    for (const paper of topPapers) {
      const citations = await getCitations(paper.paperId, 20)
      // 获取引用论文的详细信息
      for (const citation of citations.slice(0, 5)) {
        const details = await getPaperDetails(citation.paperId)
        if (details) {
          citationResults.push(details)
        }
      }
    }
  }

  // 去重
  const allResults = [...queryResults, ...expansionResults, ...citationResults]
  const seen = new Set<string>()
  const uniqueResults = allResults.filter(paper => {
    if (seen.has(paper.paperId)) return false
    seen.add(paper.paperId)
    return true
  })

  return {
    queryResults: uniqueResults.slice(0, 50),
    citationResults,
    expandedQueries,
  }
}

// 生成扩展查询
function generateExpandedQueries(
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
