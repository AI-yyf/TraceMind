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
  source: 'arxiv' | 'openalex'
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
  maxResultsPerQuery?: number
  maxTotalCandidates?: number
}

const ARXIV_DISCOVERY_TIMEOUT_MS = 4_500
const OPENALEX_DISCOVERY_TIMEOUT_MS = 10_000

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
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
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
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
      } satisfies ExternalDiscoveryCandidate
    })
    .filter((candidate): candidate is ExternalDiscoveryCandidate => Boolean(candidate))
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
  } satisfies ExternalDiscoveryCandidate
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
}) {
  const publishedDate = new Date(args.published)
  if (Number.isNaN(publishedDate.getTime())) return false

  const targetAnchorIds =
    args.query.targetAnchorPaperIds && args.query.targetAnchorPaperIds.length > 0
      ? new Set(args.query.targetAnchorPaperIds)
      : null
  const targetBranchIds =
    args.query.targetBranchIds && args.query.targetBranchIds.length > 0
      ? new Set(args.query.targetBranchIds)
      : null

  const relevantAnchors = args.anchors.filter((anchor) => {
    if (targetAnchorIds && targetAnchorIds.has(anchor.paperId)) return true
    if (targetBranchIds && anchor.branchId && targetBranchIds.has(anchor.branchId)) return true
    return !targetAnchorIds && !targetBranchIds
  })

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
  return (payload.results ?? [])
    .map((work) =>
      normalizeOpenAlexWork({
        work,
        discoveryChannel: `openalex:${query.focus}`,
        query,
        discoveryRound,
      }),
    )
    .filter((candidate): candidate is ExternalDiscoveryCandidate => Boolean(candidate))
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
  return (payload.results ?? [])
    .map((work) =>
      normalizeOpenAlexWork({
        work,
        discoveryChannel: 'openalex:citation-neighborhood',
        discoveryRound,
      }),
    )
    .filter((candidate): candidate is ExternalDiscoveryCandidate => Boolean(candidate))
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
          .slice(0, args.maxResultsPerAnchor)
      : []
    const referencedIds = Array.isArray(payload.referenced_works)
      ? payload.referenced_works
          .filter((id): id is string => typeof id === 'string')
          .slice(0, args.maxResultsPerAnchor)
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
        ? fetchOpenAlexCitingWorks(citedByApiUrl, args.maxResultsPerAnchor, args.discoveryRound)
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
  const maxResultsPerQuery = args.maxResultsPerQuery ?? 6
  const maxTotalCandidates = args.maxTotalCandidates ?? 24
  const candidateMap = new Map<string, ExternalDiscoveryCandidate>()

  for (const query of args.queries.slice(0, 8).filter((item) => item.query.trim().length > 0)) {
    const [arxivResult, openAlexResult] = await Promise.allSettled([
      searchArxiv(query, maxResultsPerQuery, args.discoveryRound),
      searchOpenAlex(query, maxResultsPerQuery, args.discoveryRound),
    ])
    const arxivResults = arxivResult.status === 'fulfilled' ? arxivResult.value : []
    const openAlexResults = openAlexResult.status === 'fulfilled' ? openAlexResult.value : []

    if (arxivResult.status === 'rejected') {
      console.warn('[paper-tracker.discovery] arXiv structured query failed', {
        query: query.query,
        reason: arxivResult.reason instanceof Error ? arxivResult.reason.message : String(arxivResult.reason),
      })
    }

    if (openAlexResult.status === 'rejected') {
      console.warn('[paper-tracker.discovery] OpenAlex structured query failed', {
        query: query.query,
        reason:
          openAlexResult.reason instanceof Error
            ? openAlexResult.reason.message
            : String(openAlexResult.reason),
      })
    }

    for (const candidate of [...arxivResults, ...openAlexResults]) {
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
        })
      ) {
        mergeDiscoveryCandidate(candidateMap, candidate)
      }
    }
  }

  const neighborhoodResults = await discoverAnchorNeighborhood({
    anchors: args.anchors,
    maxResultsPerAnchor: Math.max(3, Math.min(6, maxResultsPerQuery)),
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
