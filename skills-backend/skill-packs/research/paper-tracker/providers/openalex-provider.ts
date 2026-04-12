/**
 * OpenAlex 搜索提供者
 * 实现论文搜索功能，从 OpenAlex 获取学术论文元数据
 * OpenAlex 是免费开放的学术作品目录
 */

import https from 'https'
import type { SearchResult } from '../discovery-engine'

const OPENALEX_API_BASE = 'https://api.openalex.org'

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location
        if (redirectUrl) {
          httpGet(redirectUrl).then(resolve).catch(reject)
          return
        }
      }

      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function parseOpenAlexWork(work: any): SearchResult {
  const authors = work.authorships?.map((a: any) =>
    a.author?.display_name || 'Unknown'
  ) || []

  const concepts = work.concepts?.map((c: any) => c.display_name) || []

  const publishedDate = work.publication_date ||
    work.created_date ||
    new Date().toISOString()

  const relevanceScore = work.relevance_score || 0.5

  return {
    paperId: work.doi?.replace('https://doi.org/', '') || work.id,
    title: work.display_name || 'Untitled',
    abstract: work.abstract_inverted_index ?
      reconstructAbstract(work.abstract_inverted_index) :
      '',
    published: publishedDate,
    authors,
    relevanceScore: relevanceScore,
    matchedQueryIds: [],
    source: 'openalex',
    pdfUrl: work.open_access?.pdf_url || '',
    categories: concepts,
    citationCount: work.cited_by_count || 0,
  }
}

function reconstructAbstract(invertedIndex: Record<string, Array<[number, number]>>): string {
  const wordPositions: Array<{ word: string; pos: number }> = []

  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const [pos] of positions) {
      wordPositions.push({ word, pos })
    }
  }

  wordPositions.sort((a, b) => a.pos - b.pos)
  return wordPositions.map(w => w.word).join(' ')
}

export function createOpenAlexSearchProvider() {
  return {
    name: 'openalex' as const,

    async search(
      query: string,
      options: { from: string; to: string }
    ): Promise<SearchResult[]> {
      try {
        const fromYear = new Date(options.from).getFullYear()
        const toYear = new Date(options.to).getFullYear()

        const params = new URLSearchParams({
          'search': query,
          'filter': `publication_year:${fromYear}-${toYear},type:article`,
          'per-page': '20',
          'sort': 'relevance_score:desc',
        })

        const url = `${OPENALEX_API_BASE}/works?${params.toString()}`
        const response = await httpGet(url)
        const data = JSON.parse(response)

        const works = Array.isArray(data.results) ? data.results : []

        return works.map((work: any) => ({
          ...parseOpenAlexWork(work),
          relevanceScore: calculateRelevance(work, query),
        }))
      } catch (error) {
        console.error('[OpenAlex Provider] Search failed:', error)
        return []
      }
    },

    async getPaperDetails(doi: string): Promise<Partial<SearchResult> | null> {
      try {
        const cleanDoi = doi.replace('https://doi.org/', '')
        const url = `${OPENALEX_API_BASE}/works/https://doi.org/${cleanDoi}`
        const response = await httpGet(url)
        const work = JSON.parse(response)
        return parseOpenAlexWork(work)
      } catch (error) {
        console.error('[OpenAlex Provider] Get paper failed:', error)
        return null
      }
    },

    async getCitations(doi: string): Promise<string[]> {
      try {
        const cleanDoi = doi.replace('https://doi.org/', '')
        const params = new URLSearchParams({
          'filter': `referenced_works:https://doi.org/${cleanDoi}`,
          'per-page': '50',
        })

        const url = `${OPENALEX_API_BASE}/works?${params.toString()}`
        const response = await httpGet(url)
        const data = JSON.parse(response)

        const works = Array.isArray(data.results) ? data.results : []
        return works.map((w: any) => w.doi).filter(Boolean)
      } catch (error) {
        console.error('[OpenAlex Provider] Get citations failed:', error)
        return []
      }
    },
  }
}

function calculateRelevance(work: any, query: string): number {
  let score = work.relevance_score || 0.5

  const queryWords = query.toLowerCase().split(/\s+/)
  const titleWords = (work.display_name || '').toLowerCase()

  for (const word of queryWords) {
    if (titleWords.includes(word)) {
      score += 0.1
    }
  }

  return Math.min(1, score)
}

export type OpenAlexSearchProvider = ReturnType<typeof createOpenAlexSearchProvider>
