/**
 * ArXiv 搜索提供者
 * 实现论文搜索功能，从 ArXiv 获取学术论文元数据
 */

import https from 'https'
import { URL } from 'url'
import type { SearchResult } from './discovery-engine'

const ARXIV_API_BASE = 'http://export.arxiv.org/api/query'

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const protocol = parsedUrl.protocol === 'https:' ? https : require('http')

    protocol.get(url, (res: any) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location
        if (redirectUrl) {
          httpGet(redirectUrl).then(resolve).catch(reject)
          return
        }
      }

      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function parseArxivXml(xml: string): SearchResult[] {
  const results: SearchResult[] = []

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1]

    const idMatch = /<id>([^<]+)<\/id>/.exec(entry)
    const titleMatch = /<title>([^<]+)<\/title>/.exec(entry)
    const abstractMatch = /<summary>([^<]+)<\/summary>/.exec(entry)
    const publishedMatch = /<published>([^<]+)<\/published>/.exec(entry)
    const pdfMatch = /<link[^>]*title="pdf"[^>]*href="([^"]+)"[^>]*\/?>/.exec(entry) ||
                     /<link[^>]*href="([^"]+\.pdf)"[^>]*title="pdf"[^>]*\/?>/.exec(entry)

    const authorMatches = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g) || []
    const authors = authorMatches.map(m => {
      const nameMatch = /<name>([^<]+)<\/name>/.exec(m)
      return nameMatch ? nameMatch[1] : 'Unknown'
    })

    const categoryMatch = entry.match(/<category[^>]*term="([^"]+)"[^>]*\/>/)
    const categories = categoryMatch ? [categoryMatch[1]] : []

    if (idMatch && titleMatch) {
      const arxivId = idMatch[1].split('/').pop() || ''
      const pdfUrl = pdfMatch ? pdfMatch[1] :
        `https://arxiv.org/pdf/${arxivId}.pdf`

      results.push({
        paperId: arxivId,
        title: titleMatch[1].replace(/\n/g, ' ').trim(),
        abstract: abstractMatch ? abstractMatch[1].replace(/\n/g, ' ').trim() : '',
        published: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
        authors,
        relevanceScore: 0.8,
        matchedQueryIds: [],
        source: 'arxiv',
        pdfUrl,
        categories,
      })
    }
  }

  return results
}

export function createArxivSearchProvider() {
  return {
    name: 'arxiv' as const,

    async search(
      query: string,
      options: { from: string; to: string }
    ): Promise<SearchResult[]> {
      try {
        const params = new URLSearchParams({
          search_query: `all:${query}`,
          start: '0',
          max_results: '20',
          sortBy: 'relevance',
          sortOrder: 'descending',
        })

        const url = `${ARXIV_API_BASE}?${params.toString()}`
        const xml = await httpGet(url)
        const results = parseArxivXml(xml)

        const fromDate = new Date(options.from)
        const toDate = new Date(options.to)

        return results.filter(r => {
          const pubDate = new Date(r.published)
          return pubDate >= fromDate && pubDate <= toDate
        })
      } catch (error) {
        console.error('[ArXiv Provider] Search failed:', error)
        return []
      }
    },

    async getPaperDetails(arxivId: string): Promise<Partial<SearchResult> | null> {
      try {
        const url = `${ARXIV_API_BASE}?id_list=${arxivId}`
        const xml = await httpGet(url)
        const results = parseArxivXml(xml)
        return results[0] || null
      } catch (error) {
        console.error('[ArXiv Provider] Get paper failed:', error)
        return null
      }
    },

    async downloadPdf(arxivId: string): Promise<Buffer | null> {
      return new Promise((resolve) => {
        const url = `https://arxiv.org/pdf/${arxivId}.pdf`
        https.get(url, (res) => {
          if (res.statusCode === 200) {
            const chunks: Buffer[] = []
            res.on('data', (chunk: Buffer) => chunks.push(chunk))
            res.on('end', () => resolve(Buffer.concat(chunks)))
          } else {
            resolve(null)
          }
        }).on('error', () => resolve(null))
      })
    },
  }
}

export type ArxivSearchProvider = ReturnType<typeof createArxivSearchProvider>
