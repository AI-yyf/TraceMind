import {
  searchPapers as searchSemanticScholarPapers,
  getCitations,
  getReferences,
  getPaperDetails,
  type SemanticScholarPaper,
} from '../../../src/services/search/semantic-scholar'

export type DiscoveryQuery = {
  query: string
  rationale: string
  targetProblemIds: string[]
  targetBranchIds?: string[]
  targetAnchorPaperIds?: string[]
  focus: 'problem' | 'method' | 'citation' | 'merge'
}

export type ExternalDiscoveryCandidate = {
  paperId: string
  title: string
  abstract: string
  published: string
  authors: string[]
  arxivUrl?: string
  pdfUrl?: string
  openAlexId?: string
  citationCount?: number | null
  source: 'arxiv' | 'openalex' | 'semantic-scholar'
  queryHits: string[]
  discoveryChannels: string[]
  discoveryRounds: number[]
  matchedBranchIds: string[]
  matchedProblemNodeIds: string[]
}

type StageAnchor = {
  paperId: string
  title: string
  published: string
  branchId?: string
}

type DiscoverExternalCandidatesArgs = {
  anchors: StageAnchor[]
  queries: DiscoveryQuery[]
  discoveryRound: 1 | 2
  maxWindowMonths: number
  searchStartDate?: Date
  searchEndDateExclusive?: Date
  maxResultsPerQuery?: number
  maxTotalCandidates?: number
  semanticScholarLimit?: number // 动态配置：Semantic Scholar每查询上限
}

const ARXIV_DISCOVERY_TIMEOUT_MS = 4_500
const OPENALEX_DISCOVERY_TIMEOUT_MS = 10_000
const SEMANTIC_SCHOLAR_MAX_RESULTS = 25 // Increased for broader discovery
const SEMANTIC_SCHOLAR_MAX_QUERY_BUDGET_PER_ROUND = 15 // More queries allowed per round
const ARXIV_RATE_LIMIT_DELAY_MS = 500 // arXiv requires delays between requests
const OPENALEX_RATE_LIMIT_DELAY_MS = 200 // OpenAlex polite pool

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function normalizeQueryKey(value: string) {
  return normalizeWhitespace(value).toLowerCase()
}

function normalizeTitle(value: string) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/giu, ' ')
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ')
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractTagValue(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i'))
  return match?.[1] ? decodeXmlEntities(stripHtml(match[1])) : ''
}

function extractAuthors(block: string) {
  return [...block.matchAll(/<name>([\s\S]*?)<\/name>/gi)]
    .map((match) => decodeXmlEntities(stripHtml(match[1] ?? '')).trim())
    .filter(Boolean)
}

function extractOpenAlexAbstract(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const inverted = value as Record<string, number[]>
  const positions = Object.entries(inverted).flatMap(([word, indexes]) =>
    Array.isArray(indexes)
      ? indexes
          .filter((index): index is number => typeof index === 'number' && Number.isFinite(index))
          .map((index) => ({ index, word }))
      : [],
  )
  return positions
    .sort((left, right) => left.index - right.index)
    .map((item) => item.word)
    .join(' ')
}

function normalizeOpenAlexPaperId(openAlexId: string, arxivId?: string | null) {
  if (arxivId) return arxivId
  const suffix = openAlexId.split('/').pop() ?? openAlexId
  return `openalex-${suffix}`
}

function normalizeSemanticScholarPaperId(paper: SemanticScholarPaper) {
  const arxivId = paper.externalIds?.ArXiv?.trim()
  if (arxivId) return arxivId

  const doi = paper.externalIds?.DOI?.trim()
  if (doi) return `doi:${doi.toLowerCase()}`

  return paper.paperId.trim() ? `s2:${paper.paperId.trim()}` : ''
}

function normalizeSemanticScholarPublishedAt(paper: SemanticScholarPaper) {
  if (typeof paper.publicationDate === 'string' && paper.publicationDate.trim().length > 0) {
    const parsed = new Date(paper.publicationDate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  if (typeof paper.year === 'number' && Number.isFinite(paper.year)) {
    return `${paper.year}-01-01T00:00:00.000Z`
  }

  return ''
}

function buildSemanticScholarUrl(paper: SemanticScholarPaper) {
  const arxivId = paper.externalIds?.ArXiv?.trim()
  if (arxivId) return `https://arxiv.org/abs/${arxivId}`

  const doi = paper.externalIds?.DOI?.trim()
  if (doi) return `https://doi.org/${doi}`

  return undefined
}

function deriveSemanticScholarYearBounds(
  anchors: StageAnchor[],
  maxWindowMonths: number,
  searchStartDate?: Date,
  searchEndDateExclusive?: Date,
) {
  let yearStart: number | null = null
  let yearEnd: number | null = null

  for (const anchor of anchors) {
    const anchorDate = new Date(anchor.published)
    if (Number.isNaN(anchorDate.getTime())) continue

    const anchorYear = anchorDate.getUTCFullYear()
    const endYear = new Date(addMonths(anchor.published, maxWindowMonths)).getUTCFullYear()
    yearStart = yearStart === null ? anchorYear : Math.min(yearStart, anchorYear)
    yearEnd = yearEnd === null ? endYear : Math.max(yearEnd, endYear)
  }

  if (searchStartDate && !Number.isNaN(searchStartDate.getTime())) {
    yearStart =
      yearStart === null
        ? searchStartDate.getUTCFullYear()
        : Math.min(yearStart, searchStartDate.getUTCFullYear())
  }

  if (searchEndDateExclusive && !Number.isNaN(searchEndDateExclusive.getTime())) {
    const inclusiveEnd = new Date(searchEndDateExclusive.getTime() - 1)
    yearEnd =
      yearEnd === null
        ? inclusiveEnd.getUTCFullYear()
        : Math.max(yearEnd, inclusiveEnd.getUTCFullYear())
  }

  return {
    // Keep the hard temporal filter in withinAnyWindow as the strict gate.
    // We widen API year bounds slightly because provider-side year filtering is coarse.
    yearStart: yearStart === null ? undefined : yearStart - 1,
    yearEnd: yearEnd === null ? undefined : yearEnd + 1,
  }
}

function extractArxivIdFromOpenAlex(work: Record<string, unknown>) {
  const ids =
    work.ids && typeof work.ids === 'object' && !Array.isArray(work.ids)
      ? (work.ids as Record<string, unknown>)
      : null
  const arxiv = typeof ids?.arxiv === 'string' ? ids.arxiv : ''
  const arxivMatch = arxiv.match(/arxiv\.org\/abs\/([^v<\s]+)(?:v\d+)?/i)
  if (arxivMatch?.[1]) return arxivMatch[1]

  const locations = Array.isArray(work.locations) ? work.locations : []
  for (const location of locations) {
    if (!location || typeof location !== 'object') continue
    const landingPageUrl =
      typeof (location as Record<string, unknown>).landing_page_url === 'string'
        ? String((location as Record<string, unknown>).landing_page_url)
        : ''
    const match = landingPageUrl.match(/arxiv\.org\/abs\/([^v<\s]+)(?:v\d+)?/i)
    if (match?.[1]) return match[1]
  }

  return null
}

function addMonths(value: string, months: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next.toISOString()
}

function parseArxivResponse(xml: string, discoveryQuery: DiscoveryQuery, discoveryRound: 1 | 2) {
  const candidates = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
    .map((match) => {
      const block = match[1]
      const idRaw = extractTagValue(block, 'id')
      const idMatch = idRaw.match(/arxiv\.org\/abs\/([^v<\s]+)(?:v\d+)?/i)
      const paperId = idMatch?.[1]?.trim() ?? ''
      const title = normalizeWhitespace(extractTagValue(block, 'title'))
      const summary = normalizeWhitespace(extractTagValue(block, 'summary'))
      const published = extractTagValue(block, 'published')
      if (!paperId || !title || !published) return null

      return {
        paperId,
        title,
        abstract: summary,
        published,
        authors: extractAuthors(block),
        arxivUrl: `https://arxiv.org/abs/${paperId}`,
        pdfUrl: `https://arxiv.org/pdf/${paperId}.pdf`,
        source: 'arxiv' as const,
        queryHits: [discoveryQuery.query],
        discoveryChannels: [`arxiv:${discoveryQuery.focus}`],
        discoveryRounds: [discoveryRound],
        matchedBranchIds: discoveryQuery.targetBranchIds ?? [],
        matchedProblemNodeIds: discoveryQuery.targetProblemIds,
      } as ExternalDiscoveryCandidate | null
    })
  return candidates.filter(
    (candidate): candidate is ExternalDiscoveryCandidate => candidate !== null,
  )
}

function normalizeOpenAlexWork(args: {
  work: Record<string, unknown>
  discoveryChannel: string
  query?: DiscoveryQuery
  discoveryRound: 1 | 2
}) {
  const openAlexId = typeof args.work.id === 'string' ? args.work.id : ''
  const title = normalizeWhitespace(typeof args.work.title === 'string' ? args.work.title : '')
  const published =
    typeof args.work.publication_date === 'string' && args.work.publication_date.trim().length > 0
      ? `${args.work.publication_date}T00:00:00.000Z`
      : typeof args.work.publication_year === 'number'
        ? `${args.work.publication_year}-01-01T00:00:00.000Z`
        : ''
  if (!openAlexId || !title || !published) return null

  const arxivId = extractArxivIdFromOpenAlex(args.work)
  const primaryLocation =
    args.work.primary_location &&
    typeof args.work.primary_location === 'object' &&
    !Array.isArray(args.work.primary_location)
      ? (args.work.primary_location as Record<string, unknown>)
      : null
  const landingPageUrl =
    typeof primaryLocation?.landing_page_url === 'string'
      ? primaryLocation.landing_page_url
      : arxivId
        ? `https://arxiv.org/abs/${arxivId}`
        : undefined
  const pdfUrl =
    typeof primaryLocation?.pdf_url === 'string'
      ? primaryLocation.pdf_url
      : arxivId
        ? `https://arxiv.org/pdf/${arxivId}.pdf`
        : undefined

  return {
    paperId: normalizeOpenAlexPaperId(openAlexId, arxivId),
    title,
    abstract: normalizeWhitespace(extractOpenAlexAbstract(args.work.abstract_inverted_index)),
    published,
    authors: Array.isArray(args.work.authorships)
      ? args.work.authorships
          .map((authorship) => {
            if (!authorship || typeof authorship !== 'object') return null
            const author =
              (authorship as Record<string, unknown>).author &&
              typeof (authorship as Record<string, unknown>).author === 'object' &&
              !Array.isArray((authorship as Record<string, unknown>).author)
                ? ((authorship as Record<string, unknown>).author as Record<string, unknown>)
                : null
            return typeof author?.display_name === 'string' ? author.display_name : null
          })
          .filter((author): author is string => Boolean(author))
      : [],
arxivUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : landingPageUrl,
    pdfUrl,
    openAlexId,
    citationCount:
      typeof args.work.cited_by_count === 'number' && Number.isFinite(args.work.cited_by_count)
        ? args.work.cited_by_count
        : null,
    source: 'openalex' as const,
    queryHits: args.query ? [args.query.query] : [],
    discoveryChannels: [args.discoveryChannel],
    discoveryRounds: [args.discoveryRound],
    matchedBranchIds: args.query?.targetBranchIds ?? [],
    matchedProblemNodeIds: args.query?.targetProblemIds ?? [],
  } as ExternalDiscoveryCandidate
}

function normalizeSemanticScholarCandidate(args: {
  paper: SemanticScholarPaper
  discoveryChannel: string
  query?: DiscoveryQuery
  discoveryRound: 1 | 2
}) {
  const paperId = normalizeSemanticScholarPaperId(args.paper)
  const title = normalizeWhitespace(args.paper.title)
  const published = normalizeSemanticScholarPublishedAt(args.paper)
  if (!paperId || !title || !published) return null

  const paperUrl = buildSemanticScholarUrl(args.paper)
  const pdfUrl = args.paper.openAccessPdf?.url?.trim() || undefined

return {
    paperId,
    title,
    abstract: normalizeWhitespace(args.paper.abstract ?? args.paper.tldr?.text ?? ''),
    published,
    authors: args.paper.authors
      .map((author) => normalizeWhitespace(author.name))
      .filter(Boolean),
    arxivUrl: paperUrl,
    pdfUrl,
    citationCount:
      typeof args.paper.citationCount === 'number' && Number.isFinite(args.paper.citationCount)
        ? args.paper.citationCount
        : null,
    source: 'semantic-scholar' as const,
    queryHits: args.query ? [args.query.query] : [],
    discoveryChannels: [args.discoveryChannel],
    discoveryRounds: [args.discoveryRound],
    matchedBranchIds: args.query?.targetBranchIds ?? [],
    matchedProblemNodeIds: args.query?.targetProblemIds ?? [],
  } as ExternalDiscoveryCandidate
}

function mergeDiscoveryCandidate(
  collection: Map<string, ExternalDiscoveryCandidate>,
  candidate: ExternalDiscoveryCandidate,
) {
  const key = candidate.paperId || normalizeTitle(candidate.title)
  const previous = collection.get(key)
  if (!previous) {
    collection.set(key, candidate)
    return
  }

  collection.set(key, {
    ...previous,
    ...candidate,
    abstract: candidate.abstract || previous.abstract,
    authors:
      previous.authors.length >= candidate.authors.length ? previous.authors : candidate.authors,
    arxivUrl: previous.arxivUrl ?? candidate.arxivUrl,
    pdfUrl: previous.pdfUrl ?? candidate.pdfUrl,
    openAlexId: previous.openAlexId ?? candidate.openAlexId,
    citationCount:
      previous.citationCount !== null && previous.citationCount !== undefined
        ? previous.citationCount
        : candidate.citationCount,
    queryHits: Array.from(new Set([...previous.queryHits, ...candidate.queryHits])),
    discoveryChannels: Array.from(
      new Set([...previous.discoveryChannels, ...candidate.discoveryChannels]),
    ),
    discoveryRounds: Array.from(
      new Set([...previous.discoveryRounds, ...candidate.discoveryRounds]),
    ).sort((left, right) => left - right),
    matchedBranchIds: Array.from(
      new Set([...previous.matchedBranchIds, ...candidate.matchedBranchIds]),
    ),
    matchedProblemNodeIds: Array.from(
      new Set([...previous.matchedProblemNodeIds, ...candidate.matchedProblemNodeIds]),
    ),
  })
}

function withinAnyWindow(args: {
  published: string
  anchors: StageAnchor[]
  query: DiscoveryQuery
  maxWindowMonths: number
  searchStartDate?: Date
  searchEndDateExclusive?: Date
}) {
  const publishedDate = new Date(args.published)
  if (Number.isNaN(publishedDate.getTime())) return false

  const withinSearchWindow =
    args.searchStartDate &&
    args.searchEndDateExclusive &&
    !Number.isNaN(args.searchStartDate.getTime()) &&
    !Number.isNaN(args.searchEndDateExclusive.getTime()) &&
    publishedDate.getTime() >= args.searchStartDate.getTime() &&
    publishedDate.getTime() < args.searchEndDateExclusive.getTime()

  const targetAnchorIds =
    args.query.targetAnchorPaperIds && args.query.targetAnchorPaperIds.length > 0
      ? new Set(args.query.targetAnchorPaperIds)
      : null
  const targetBranchIds =
    args.query.targetBranchIds && args.query.targetBranchIds.length > 0
      ? new Set(args.query.targetBranchIds)
      : null

  const scopedAnchors = args.anchors.filter((anchor) => {
    if (targetAnchorIds && targetAnchorIds.has(anchor.paperId)) return true
    if (targetBranchIds && anchor.branchId && targetBranchIds.has(anchor.branchId)) return true
    return !targetAnchorIds && !targetBranchIds
  })
  const relevantAnchors = scopedAnchors.length > 0 ? scopedAnchors : args.anchors
  if (relevantAnchors.length === 0) return Boolean(withinSearchWindow)

  if (withinSearchWindow) {
    return true
  }

  return relevantAnchors.some((anchor) => {
    const anchorDate = new Date(anchor.published)
    const windowEnd = new Date(addMonths(anchor.published, args.maxWindowMonths))
    if (
      Number.isNaN(anchorDate.getTime()) ||
      Number.isNaN(windowEnd.getTime())
    ) {
      return false
    }
    return (
      publishedDate.getTime() >= anchorDate.getTime() &&
      publishedDate.getTime() <= windowEnd.getTime()
    )
  })
}

function dedupeDiscoveryQueries(queries: DiscoveryQuery[]) {
  const seen = new Set<string>()
  const deduped: DiscoveryQuery[] = []

  for (const query of queries) {
    const normalized = normalizeQueryKey(query.query)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push({ ...query, query: normalizeWhitespace(query.query) })
  }

  return deduped
}

function looksRecallSensitiveDiscoveryQuery(query: string) {
  return /\b(?:world models?|vision[- ]language|vision[- ]language[- ]action|language-conditioned|instruction-conditioned|closed[- ]loop|simulation|counterfactual|occupancy|diffusion|foundation models?|decision transformer|affordance|scene tokens?|latent dynamics|generative)\b/iu.test(
    query,
  )
}

function resolveSemanticScholarQueryBudget(queryCount: number, maxTotalCandidates: number) {
  const adaptiveBudget = Math.min(
    10,
    Math.max(
      SEMANTIC_SCHOLAR_MAX_QUERY_BUDGET_PER_ROUND,
      Math.ceil(queryCount * 0.5),
      Math.ceil(maxTotalCandidates / 6),
    ),
  )
  return Math.max(SEMANTIC_SCHOLAR_MAX_QUERY_BUDGET_PER_ROUND, adaptiveBudget)
}

async function searchArxiv(query: DiscoveryQuery, maxResults: number, discoveryRound: 1 | 2) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
    query.query,
  )}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'daily-report-skill/4.0',
    },
    signal: AbortSignal.timeout(ARXIV_DISCOVERY_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`arXiv discovery failed with status ${response.status}.`)
  }

  return parseArxivResponse(await response.text(), query, discoveryRound)
}

async function searchOpenAlex(query: DiscoveryQuery, maxResults: number, discoveryRound: 1 | 2) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query.query)}&per-page=${maxResults}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'daily-report-skill/4.0',
    },
    signal: AbortSignal.timeout(OPENALEX_DISCOVERY_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`OpenAlex search failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> }
  const candidates = (payload.results ?? [])
    .map((work) =>
      normalizeOpenAlexWork({
        work,
        discoveryChannel: `openalex:${query.focus}`,
        query,
        discoveryRound,
      }),
    )
  return candidates.filter(
    (candidate): candidate is ExternalDiscoveryCandidate => candidate !== null,
  )
}

async function searchSemanticScholar(args: {
  query: DiscoveryQuery
  anchors: StageAnchor[]
  maxWindowMonths: number
  searchStartDate?: Date
  searchEndDateExclusive?: Date
  maxResults: number
  discoveryRound: 1 | 2
  semanticScholarLimit?: number // 动态配置：Semantic Scholar每查询上限
}) {
  const { yearStart, yearEnd } = deriveSemanticScholarYearBounds(
    args.anchors,
    args.maxWindowMonths,
    args.searchStartDate,
    args.searchEndDateExclusive,
  )
  const effectiveLimit = args.semanticScholarLimit ?? SEMANTIC_SCHOLAR_MAX_RESULTS
  const papers = await searchSemanticScholarPapers(args.query.query, {
    limit: Math.max(4, Math.min(args.maxResults, effectiveLimit)),
    yearStart,
    yearEnd,
  })

  return papers
    .map((paper) =>
      normalizeSemanticScholarCandidate({
        paper,
        discoveryChannel: `semantic-scholar:${args.query.focus}`,
        query: args.query,
        discoveryRound: args.discoveryRound,
      }),
    )
    .filter((candidate): candidate is ExternalDiscoveryCandidate => candidate !== null)
}

function selectBestOpenAlexWork(args: {
  title: string
  paperId: string
  results: ExternalDiscoveryCandidate[]
}) {
  const normalizedTarget = normalizeTitle(args.title)
  return [...args.results]
    .map((candidate) => {
      const normalizedCandidate = normalizeTitle(candidate.title)
      let score = 0
      if (candidate.paperId === args.paperId) score += 120
      if (normalizedCandidate === normalizedTarget) score += 100
      if (
        normalizedCandidate.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedCandidate)
      ) {
        score += 25
      }
      if (candidate.arxivUrl?.includes(args.paperId)) score += 40
      return {
        candidate,
        score,
      }
    })
    .sort((left, right) => right.score - left.score)[0]?.candidate ?? null
}

async function fetchOpenAlexWorksByIds(
  ids: string[],
  discoveryChannel: string,
  discoveryRound: 1 | 2,
) {
  const results: ExternalDiscoveryCandidate[] = []
  for (const id of ids) {
    const response = await fetch(`https://api.openalex.org/works/${encodeURIComponent(id)}`, {
      headers: {
        'User-Agent': 'daily-report-skill/4.0',
      },
      signal: AbortSignal.timeout(OPENALEX_DISCOVERY_TIMEOUT_MS),
    })
    if (!response.ok) continue
    const payload = (await response.json()) as Record<string, unknown>
    const normalized = normalizeOpenAlexWork({
      work: payload,
      discoveryChannel,
      discoveryRound,
    })
    if (normalized) {
      results.push(normalized)
    }
  }
  return results
}

async function fetchOpenAlexCitingWorks(
  citedByApiUrl: string,
  maxResults: number,
  discoveryRound: 1 | 2,
) {
  const url = `${citedByApiUrl}${citedByApiUrl.includes('?') ? '&' : '?'}per-page=${maxResults}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'daily-report-skill/4.0',
    },
    signal: AbortSignal.timeout(OPENALEX_DISCOVERY_TIMEOUT_MS),
  })
  if (!response.ok) return [] as ExternalDiscoveryCandidate[]
  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> }
  const candidates = (payload.results ?? [])
    .map((work) =>
      normalizeOpenAlexWork({
        work,
        discoveryChannel: 'openalex:citation-neighborhood',
        discoveryRound,
      }),
    )
  return candidates.filter(
    (candidate): candidate is ExternalDiscoveryCandidate => candidate !== null,
  )
}

async function discoverAnchorNeighborhood(args: {
  anchors: StageAnchor[]
  maxResultsPerAnchor: number
  discoveryRound: 1 | 2
}) {
  const discovered: ExternalDiscoveryCandidate[] = []
  for (const anchor of args.anchors) {
    const searchResults = await searchOpenAlex(
      {
        query: anchor.title,
        rationale: 'anchor-neighborhood',
        targetProblemIds: [],
        targetBranchIds: anchor.branchId ? [anchor.branchId] : [],
        targetAnchorPaperIds: [anchor.paperId],
        focus: 'citation',
      },
      Math.max(4, args.maxResultsPerAnchor),
      args.discoveryRound,
    )
    const best = selectBestOpenAlexWork({
      title: anchor.title,
      paperId: anchor.paperId,
      results: searchResults,
    })
    if (!best?.openAlexId) continue

    const response = await fetch(
      `https://api.openalex.org/works/${encodeURIComponent(best.openAlexId)}`,
      {
        headers: {
          'User-Agent': 'daily-report-skill/4.0',
        },
        signal: AbortSignal.timeout(OPENALEX_DISCOVERY_TIMEOUT_MS),
      },
    )
    if (!response.ok) continue

    const payload = (await response.json()) as Record<string, unknown>
    const relatedIds = Array.isArray(payload.related_works)
      ? payload.related_works
          .filter((id): id is string => typeof id === 'string')
          .slice(0, Math.max(args.maxResultsPerAnchor, 10))
      : []
    const referencedIds = Array.isArray(payload.referenced_works)
      ? payload.referenced_works
          .filter((id): id is string => typeof id === 'string')
          .slice(0, Math.max(args.maxResultsPerAnchor, 10))
      : []
    const citedByApiUrl =
      typeof payload.cited_by_api_url === 'string' ? payload.cited_by_api_url : ''

    const [relatedWorks, referencedWorks, citingWorks] = await Promise.all([
      fetchOpenAlexWorksByIds(
        relatedIds,
        'openalex:related',
        args.discoveryRound,
      ),
      fetchOpenAlexWorksByIds(
        referencedIds,
        'openalex:referenced',
        args.discoveryRound,
      ),
      citedByApiUrl
        ? fetchOpenAlexCitingWorks(
            citedByApiUrl,
            Math.max(args.maxResultsPerAnchor * 2, 12),
            args.discoveryRound,
          )
        : Promise.resolve([] as ExternalDiscoveryCandidate[]),
    ])

    for (const candidate of [...relatedWorks, ...referencedWorks, ...citingWorks]) {
      discovered.push({
        ...candidate,
        matchedBranchIds: anchor.branchId
          ? Array.from(new Set([...candidate.matchedBranchIds, anchor.branchId]))
          : candidate.matchedBranchIds,
      })
    }
  }

  return discovered
}

export async function discoverExternalCandidates(args: DiscoverExternalCandidatesArgs) {
const maxResultsPerQuery = args.maxResultsPerQuery ?? 25 // Increased for 200 candidates target
  const maxTotalCandidates = args.maxTotalCandidates ?? 200 // Target 200 candidates before admission
  const semanticScholarLimit = args.semanticScholarLimit ?? SEMANTIC_SCHOLAR_MAX_RESULTS // 使用动态配置或默认值
  const candidateMap = new Map<string, ExternalDiscoveryCandidate>()
  let semanticScholarQueriesUsed = 0
  const queryLimit = Math.max(40, Math.min(80, maxTotalCandidates)) // More queries for broader discovery
  const queries = dedupeDiscoveryQueries(args.queries)
    .filter((item) => item.query.length > 0)
    .slice(0, queryLimit)
  const semanticScholarQueryBudget = resolveSemanticScholarQueryBudget(
    queries.length,
    maxTotalCandidates,
  )

for (const query of queries) {
    // Sequential API calls with rate limit delays to avoid 429 errors
    let arxivResults: ExternalDiscoveryCandidate[] = []
    let openAlexResults: ExternalDiscoveryCandidate[] = []
    
    try {
      arxivResults = await searchArxiv(query, maxResultsPerQuery, args.discoveryRound)
      await sleep(ARXIV_RATE_LIMIT_DELAY_MS)
    } catch (error) {
      console.warn('[paper-tracker.discovery] arXiv structured query failed', {
        query: query.query,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
    
    try {
      openAlexResults = await searchOpenAlex(query, maxResultsPerQuery, args.discoveryRound)
      await sleep(OPENALEX_RATE_LIMIT_DELAY_MS)
    } catch (error) {
      console.warn('[paper-tracker.discovery] OpenAlex structured query failed', {
        query: query.query,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
    
    const combinedResults = [...arxivResults, ...openAlexResults]
    let semanticScholarResults: ExternalDiscoveryCandidate[] = []

    const shouldSupplementWithSemanticScholar =
      semanticScholarQueriesUsed < semanticScholarQueryBudget &&
      (
        combinedResults.length < Math.max(6, Math.ceil(maxResultsPerQuery * 0.7)) ||
        query.focus === 'citation' ||
        query.focus === 'merge' ||
        looksRecallSensitiveDiscoveryQuery(query.query)
      )

    if (shouldSupplementWithSemanticScholar) {
      semanticScholarQueriesUsed += 1

      try {
semanticScholarResults = await searchSemanticScholar({
          query,
          anchors: args.anchors,
          maxWindowMonths: args.maxWindowMonths,
          searchStartDate: args.searchStartDate,
          searchEndDateExclusive: args.searchEndDateExclusive,
          maxResults: Math.max(4, Math.min(maxResultsPerQuery, semanticScholarLimit)),
          discoveryRound: args.discoveryRound,
          semanticScholarLimit, // 传递动态上限
        })
      } catch (error) {
        console.warn('[paper-tracker.discovery] Semantic Scholar supplement failed', {
          query: query.query,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

    for (const candidate of [...combinedResults, ...semanticScholarResults]) {
      if (
        candidate.paperId === query.targetAnchorPaperIds?.[0] ||
        args.anchors.some((anchor) => anchor.paperId === candidate.paperId)
      ) {
        continue
      }
      if (
        withinAnyWindow({
          published: candidate.published,
          anchors: args.anchors,
          query,
          maxWindowMonths: args.maxWindowMonths,
          searchStartDate: args.searchStartDate,
          searchEndDateExclusive: args.searchEndDateExclusive,
        })
      ) {
        mergeDiscoveryCandidate(candidateMap, candidate)
      }
    }
  }

  const neighborhoodResults = await discoverAnchorNeighborhood({
    anchors: args.anchors,
    maxResultsPerAnchor: Math.max(6, Math.min(16, maxResultsPerQuery + 4)),
    discoveryRound: args.discoveryRound,
  })

  for (const candidate of neighborhoodResults) {
    if (args.anchors.some((anchor) => anchor.paperId === candidate.paperId)) continue
    if (
      args.anchors.some((anchor) =>
        withinAnyWindow({
          published: candidate.published,
          anchors: [anchor],
          query: {
            query: anchor.title,
            rationale: 'anchor-neighborhood',
            targetProblemIds: [],
            targetBranchIds: anchor.branchId ? [anchor.branchId] : [],
            targetAnchorPaperIds: [anchor.paperId],
            focus: 'citation',
          },
          maxWindowMonths: args.maxWindowMonths,
          searchStartDate: args.searchStartDate,
          searchEndDateExclusive: args.searchEndDateExclusive,
        }),
      )
    ) {
      mergeDiscoveryCandidate(candidateMap, candidate)
    }
  }

  return [...candidateMap.values()]
    .sort((left, right) => {
      const leftDate = new Date(left.published).getTime()
      const rightDate = new Date(right.published).getTime()
      const leftScore =
        left.queryHits.length +
        left.discoveryChannels.length * 0.5 +
        left.matchedBranchIds.length * 0.4 +
        left.matchedProblemNodeIds.length * 0.4 +
        (left.citationCount ?? 0) * 0.001
      const rightScore =
        right.queryHits.length +
        right.discoveryChannels.length * 0.5 +
        right.matchedBranchIds.length * 0.4 +
        right.matchedProblemNodeIds.length * 0.4 +
        (right.citationCount ?? 0) * 0.001
      return rightScore - leftScore || leftDate - rightDate
    })
    .slice(0, maxTotalCandidates)
}

export const __testing = {
  normalizeSemanticScholarCandidate,
  withinAnyWindow,
  deriveSemanticScholarYearBounds,
  dedupeDiscoveryQueries,
  resolveSemanticScholarQueryBudget,
}

/**
 * 广纳贤文: Snowball sampling for citation chain discovery
 * Traverses forward (citations) and backward (references) chains
 * to discover related papers through citation relationships
 */
export async function snowballDiscovery(
  seedPapers: Array<{ 
    paperId: string
    title: string
    semanticScholarId?: string
  }>,
  options?: {
    maxDepth?: number
    maxCandidates?: number
    discoveryRound?: 1 | 2
    focus?: 'forward' | 'backward' | 'both'
    yearStart?: number
    yearEnd?: number
  }
): Promise<ExternalDiscoveryCandidate[]> {
  const { maxDepth = 2, maxCandidates = 50, discoveryRound = 1, focus = 'both', yearStart, yearEnd } = options ?? {}
  
  if (seedPapers.length === 0) {
    return []
  }

  const candidateMap = new Map<string, ExternalDiscoveryCandidate>()
  const visitedIds = new Set<string>(seedPapers.map(p => p.paperId))
  
  // Convert arxiv IDs to Semantic Scholar IDs if needed
  const seedsWithS2Ids = await Promise.all(
    seedPapers.map(async (seed) => {
      if (seed.semanticScholarId) {
        return { ...seed, s2Id: seed.semanticScholarId }
      }
      // Try to find the paper via search to get S2 ID
      try {
        const results = await searchSemanticScholarPapers(seed.title, { limit: 1, yearStart, yearEnd })
        if (results.length > 0) {
          return { ...seed, s2Id: results[0].paperId }
        }
      } catch (error) {
        console.warn('[snowballDiscovery] Failed to find S2 ID for seed:', seed.paperId)
      }
      return { ...seed, s2Id: null }
    })
  )

  // BFS traversal of citation chains
  const queue: Array<{ s2Id: string; depth: number; type: 'forward' | 'backward' }> = []
  
  for (const seed of seedsWithS2Ids) {
    if (seed.s2Id) {
      if (focus === 'forward' || focus === 'both') {
        queue.push({ s2Id: seed.s2Id, depth: 0, type: 'forward' })
      }
      if (focus === 'backward' || focus === 'both') {
        queue.push({ s2Id: seed.s2Id, depth: 0, type: 'backward' })
      }
    }
  }

  while (queue.length > 0 && candidateMap.size < maxCandidates) {
    const current = queue.shift()
    if (!current) break
    
    if (current.depth >= maxDepth) continue
    
    try {
      let discoveredPapers: Array<{ paperId: string; title: string; year: number; citationCount?: number }>
      
      if (current.type === 'forward') {
        // Forward citations (papers that cite this paper)
        const citations = await getCitations(current.s2Id, Math.min(20, maxCandidates - candidateMap.size))
        discoveredPapers = citations.map(c => ({ ...c, citationCount: c.citationCount }))
      } else {
        // Backward references (papers this paper cites)
        const references = await getReferences(current.s2Id, Math.min(20, maxCandidates - candidateMap.size))
        discoveredPapers = references.map(r => ({ ...r, citationCount: undefined }))
      }

      for (const paper of discoveredPapers) {
        // Normalize paper ID (use s2: prefix for Semantic Scholar IDs)
        const normalizedId = `s2:${paper.paperId}`
        
        if (visitedIds.has(normalizedId)) continue
        visitedIds.add(normalizedId)

        // Fetch full paper details for abstract and authors
        const fullDetails = await getPaperDetails(paper.paperId)
        
        // Determine arxiv URL if available
        const arxivId = fullDetails?.externalIds?.ArXiv
        const arxivUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined
        
        const candidate: ExternalDiscoveryCandidate = {
          paperId: arxivId || normalizedId, // Prefer arxiv ID if available
          title: normalizeWhitespace(paper.title),
          abstract: normalizeWhitespace(fullDetails?.abstract ?? ''),
          published: `${paper.year}-01-01T00:00:00.000Z`,
          authors: fullDetails?.authors?.map(a => normalizeWhitespace(a.name)).filter(Boolean) ?? [],
          arxivUrl,
          pdfUrl: fullDetails?.openAccessPdf?.url ?? undefined,
          citationCount: paper.citationCount ?? fullDetails?.citationCount ?? null,
          source: 'semantic-scholar',
          queryHits: [],
          discoveryChannels: [`snowball:${current.type}:depth${current.depth}`],
          discoveryRounds: [discoveryRound],
          matchedBranchIds: [],
          matchedProblemNodeIds: [],
        }

        // Merge if already exists (update discovery channels)
        mergeDiscoveryCandidate(candidateMap, candidate)

        // Add to queue for next depth level
        if (current.depth + 1 < maxDepth && candidateMap.size < maxCandidates) {
          queue.push({
            s2Id: paper.paperId,
            depth: current.depth + 1,
            type: current.type,
          })
        }
      }
    } catch (error) {
      console.warn('[snowballDiscovery] Failed at depth', current.depth, 'for', current.s2Id, error)
    }
  }

  // Sort by citation count and depth
  return [...candidateMap.values()]
    .sort((a, b) => {
      const aDepth = parseInt(a.discoveryChannels[0]?.match(/depth(\d+)/)?.[1] ?? '0')
      const bDepth = parseInt(b.discoveryChannels[0]?.match(/depth(\d+)/)?.[1] ?? '0')
      // Prefer papers closer to seeds (lower depth)
      if (aDepth !== bDepth) return aDepth - bDepth
      // Then by citation count
      return (b.citationCount ?? 0) - (a.citationCount ?? 0)
    })
    .slice(0, maxCandidates)
}

/**
 * Combined discovery: regular search + snowball sampling
 * Implements the full "广纳贤文" discovery strategy
 */
export async function discoverWithSnowball(args: DiscoverExternalCandidatesArgs & {
  enableSnowball?: boolean
  snowballDepth?: number
  snowballMaxCandidates?: number
}): Promise<ExternalDiscoveryCandidate[]> {
  // First, run regular discovery
  const regularCandidates = await discoverExternalCandidates(args)
  
  if (!args.enableSnowball || args.anchors.length === 0) {
    return regularCandidates
  }

  // Prepare seed papers from anchors for snowball sampling
  const seeds = args.anchors.map(anchor => ({
    paperId: anchor.paperId,
    title: anchor.title,
    semanticScholarId: anchor.paperId.startsWith('s2:') 
      ? anchor.paperId.replace('s2:', '')
      : undefined,
  }))

  // Run snowball discovery
  const snowballCandidates = await snowballDiscovery(seeds, {
    maxDepth: args.snowballDepth ?? 2,
    maxCandidates: args.snowballMaxCandidates ?? 30,
    discoveryRound: args.discoveryRound,
    focus: 'both',
    yearStart: args.searchStartDate?.getUTCFullYear(),
    yearEnd: args.searchEndDateExclusive?.getUTCFullYear(),
  })

  // Merge results
  const mergedMap = new Map<string, ExternalDiscoveryCandidate>()
  
  for (const candidate of regularCandidates) {
    mergeDiscoveryCandidate(mergedMap, candidate)
  }
  
  for (const candidate of snowballCandidates) {
    mergeDiscoveryCandidate(mergedMap, candidate)
  }

  return [...mergedMap.values()]
    .sort((a, b) => {
      // Prioritize by discovery channels count and citation count
      const aScore = a.discoveryChannels.length + (a.citationCount ?? 0) * 0.001
      const bScore = b.discoveryChannels.length + (b.citationCount ?? 0) * 0.001
      return bScore - aScore
    })
    .slice(0, args.maxTotalCandidates ?? 144)
}
