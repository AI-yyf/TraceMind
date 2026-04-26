import fetch from 'node-fetch'

import { retryWithBackoff } from '../../utils/retry'
import {
  getSourceCooldownUntil,
  noteSourceRateLimit,
  noteSourceSuccess,
} from './source-health'

const CROSSREF_API_BASE = 'https://api.crossref.org'
const CROSSREF_RATE_LIMIT_DELAY_MS = 300
const CROSSREF_RATE_LIMIT_COOLDOWN_MS = 60_000
const CROSSREF_USER_AGENT = 'TraceMind/1.0 (mailto:trace@example.com)'

export interface CrossrefWork {
  DOI?: string
  title?: string[]
  author?: Array<{ given?: string; family?: string; name?: string }>
  abstract?: string
  issued?: { 'date-parts'?: number[][] }
  published?: { 'date-parts'?: number[][] }
  'published-print'?: { 'date-parts'?: number[][] }
  'published-online'?: { 'date-parts'?: number[][] }
  publisher?: string
  type?: string
  'container-title'?: string[]
  resource?: { primary?: { URL?: string } }
  link?: Array<{ URL?: string; 'content-type'?: string; 'intended-application'?: string }>
  'is-referenced-by-count'?: number
}

class RateLimiter {
  private lastRequestTime = 0
  private cooldownUntil = 0

  async throttle() {
    const persistedCooldown = await getSourceCooldownUntil('crossref')
    this.cooldownUntil = Math.max(this.cooldownUntil, persistedCooldown)

    const now = Date.now()
    if (now < this.cooldownUntil) {
      await new Promise((resolve) => setTimeout(resolve, this.cooldownUntil - now))
    }

    const afterCooldown = Date.now()
    const elapsed = afterCooldown - this.lastRequestTime
    if (elapsed < CROSSREF_RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, CROSSREF_RATE_LIMIT_DELAY_MS - elapsed))
    }
    this.lastRequestTime = Date.now()
  }

  noteRateLimit(retryAfterMs?: number) {
    const cooldownMs =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : CROSSREF_RATE_LIMIT_COOLDOWN_MS
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + cooldownMs)
    void noteSourceRateLimit('crossref', {
      retryAfterMs,
      defaultCooldownMs: CROSSREF_RATE_LIMIT_COOLDOWN_MS,
    }).catch(() => undefined)
  }
}

const rateLimiter = new RateLimiter()

function pickFirstText(values: string[] | undefined) {
  return Array.isArray(values) ? (values[0] ?? '').replace(/\s+/gu, ' ').trim() : ''
}

function buildPublishedAt(work: CrossrefWork) {
  const parts =
    work.issued?.['date-parts']?.[0] ??
    work['published-print']?.['date-parts']?.[0] ??
    work['published-online']?.['date-parts']?.[0] ??
    work.published?.['date-parts']?.[0] ??
    []

  const [year, month = 1, day = 1] = parts
  if (typeof year !== 'number' || !Number.isFinite(year)) return ''
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`
}

function extractAuthors(work: CrossrefWork) {
  return (work.author ?? [])
    .map((author) => [author.given, author.family].filter(Boolean).join(' ').trim() || author.name?.trim() || '')
    .filter(Boolean)
}

function normalizeDoi(doi: string | undefined) {
  const normalized = doi?.trim()
  return normalized ? normalized.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '') : ''
}

function extractArxivIdFromCrossref(work: CrossrefWork) {
  const doi = normalizeDoi(work.DOI)
  const doiMatch = doi.match(/^10\.48550\/arxiv\.(.+)$/iu)
  if (doiMatch) return doiMatch[1]

  const primaryUrl = work.resource?.primary?.URL?.trim() ?? ''
  const primaryMatch = primaryUrl.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/iu)
  if (primaryMatch) return primaryMatch[1]

  return ''
}

function pickPdfUrl(work: CrossrefWork) {
  const linkUrls = (work.link ?? [])
    .map((link) => link.URL?.trim() ?? '')
    .filter(Boolean)

  const directPdf = linkUrls.find((url) => /\.pdf(?:[?#]|$)/iu.test(url))
  if (directPdf) return directPdf

  const arxivId = extractArxivIdFromCrossref(work)
  if (arxivId) return `https://arxiv.org/pdf/${arxivId}.pdf`

  return ''
}

function pickLandingPageUrl(work: CrossrefWork) {
  const primary = work.resource?.primary?.URL?.trim()
  if (primary) return primary
  const doi = normalizeDoi(work.DOI)
  return doi ? `https://doi.org/${doi}` : ''
}

async function performRequest<T>(url: string) {
  await rateLimiter.throttle()

  return retryWithBackoff(
    async () => {
      const response = await fetch(url, {
        headers: {
          'user-agent': CROSSREF_USER_AGENT,
          'accept': 'application/json',
        },
      })

      if (!response.ok) {
        const error = new Error(`Crossref API error: ${response.status}`) as Error & {
          statusCode?: number
          retryAfterMs?: number
        }
        const retryAfter = response.headers.get('retry-after')
        const retryAfterMs =
          retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : undefined
        error.statusCode = response.status
        error.retryAfterMs = retryAfterMs
        if (response.status === 429) {
          rateLimiter.noteRateLimit(retryAfterMs)
        }
        throw error
      }

      void noteSourceSuccess('crossref').catch(() => undefined)
      return (await response.json()) as T
    },
    {
      maxAttempts: 3,
      baseDelayMs: 400,
    },
  )
}

export async function searchWorksByTitle(query: string, limit = 10): Promise<CrossrefWork[]> {
  const params = new URLSearchParams({
    'query.title': query,
    rows: String(limit),
    select:
      'DOI,title,author,abstract,issued,published,published-print,published-online,publisher,type,container-title,resource,link,is-referenced-by-count',
  })

  const url = `${CROSSREF_API_BASE}/works?${params.toString()}`

  try {
    const payload = await performRequest<{ message?: { items?: CrossrefWork[] } }>(url)
    return payload.message?.items ?? []
  } catch {
    return []
  }
}

export async function getWorkByDoi(doi: string): Promise<CrossrefWork | null> {
  const normalized = normalizeDoi(doi)
  if (!normalized) return null

  try {
    const payload = await performRequest<{ message?: CrossrefWork }>(
      `${CROSSREF_API_BASE}/works/${encodeURIComponent(normalized)}`,
    )
    return payload.message ?? null
  } catch {
    return null
  }
}

export type CrossrefPaper = {
  paperId: string
  title: string
  abstract: string
  authors: string[]
  published: string
  citationCount: number
  doi?: string
  arxivUrl?: string
  pdfUrl?: string
  landingPageUrl?: string
}

export function transformCrossrefWork(work: CrossrefWork): CrossrefPaper | null {
  const title = pickFirstText(work.title)
  if (!title) return null

  const doi = normalizeDoi(work.DOI)
  const arxivId = extractArxivIdFromCrossref(work)
  const published = buildPublishedAt(work)
  const landingPageUrl = pickLandingPageUrl(work)
  const pdfUrl = pickPdfUrl(work)

  return {
    paperId: doi ? `doi:${doi.toLowerCase()}` : landingPageUrl || title,
    title,
    abstract: (work.abstract ?? '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim(),
    authors: extractAuthors(work),
    published,
    citationCount:
      typeof work['is-referenced-by-count'] === 'number' && Number.isFinite(work['is-referenced-by-count'])
        ? work['is-referenced-by-count']
        : 0,
    doi: doi || undefined,
    arxivUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
    pdfUrl: pdfUrl || undefined,
    landingPageUrl: landingPageUrl || undefined,
  }
}

export const __testing = {
  normalizeDoi,
  extractArxivIdFromCrossref,
  pickPdfUrl,
  buildPublishedAt,
  transformCrossrefWork,
}
