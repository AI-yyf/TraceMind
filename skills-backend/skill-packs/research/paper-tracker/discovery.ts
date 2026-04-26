import {
  searchPapers as searchSemanticScholarPapers,
  getCitations,
  getReferences,
  getPaperDetails,
  type SemanticScholarPaper,
} from '../../../src/services/search/semantic-scholar'

import {
  searchWorks as searchOpenAlexWorks,
  getWork as getOpenAlexWork,
  batchGetWorks as batchGetOpenAlexWorks,
  getCitationNetwork as getOpenAlexCitationNetwork,
  reconstructAbstract,
  extractArxivId,
  normalizePaperId,
  transformToInternalPaper,
  type OpenAlexWork,
  type OpenAlexPaper,
} from '../../../src/services/search/openalex'
import {
  searchWorksByTitle as searchCrossrefWorksByTitle,
  transformCrossrefWork,
  type CrossrefWork,
} from '../../../src/services/search/crossref'
import {
  getSourceCooldownUntil,
  noteSourceRateLimit,
  noteSourceSuccess,
} from '../../../src/services/search/source-health'

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
  source: 'arxiv' | 'openalex' | 'semantic-scholar' | 'crossref'
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
  openAlexId?: string
}

type DiscoverExternalCandidatesArgs = {
  anchors: StageAnchor[]
  queries: DiscoveryQuery[]
  discoveryRound: number
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
const CROSSREF_MAX_RESULTS = 12
const CROSSREF_MAX_QUERY_BUDGET_PER_ROUND = 10
const ARXIV_RATE_LIMIT_DELAY_MS = 500 // arXiv requires delays between requests
const OPENALEX_RATE_LIMIT_DELAY_MS = 200 // OpenAlex polite pool
const CROSSREF_RATE_LIMIT_DELAY_MS = 250
const ARXIV_TITLE_BACKFILL_LIMIT_PER_QUERY = 2
const ARXIV_TITLE_BACKFILL_MAX_RESULTS = 5

// MMR (Maximal Marginal Relevance) constants for diversity scoring
const MMR_LAMBDA = 0.7 // Weight for relevance vs diversity (0.7 = prioritize relevance)
const MMR_MIN_SIMILARITY_THRESHOLD = 0.3 // Minimum similarity to be considered redundant

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * MMR Diversity Scoring - Prevents redundant discoveries
 * Formula: MMR = λ * relevance - (1-λ) * max_similarity_to_selected
 *
 * Inspired by OpenClaw/CCB patterns for diverse paper discovery
 */
function computeTitleSimilarity(title1: string, title2: string): number {
  const tokens1 = new Set(tokenizeTitle(title1))
  const tokens2 = new Set(tokenizeTitle(title2))

  if (tokens1.size === 0 || tokens2.size === 0) return 0

  // Jaccard similarity with word overlap
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)))
  const union = new Set([...tokens1, ...tokens2])

  // Weight by common academic terms overlap
  const academicTerms1 = extractAcademicTerms(title1)
  const academicTerms2 = extractAcademicTerms(title2)
  const academicOverlap = academicTerms1.filter(t => academicTerms2.includes(t)).length

  // Combined similarity score
  const jaccard = intersection.size / union.size
  const academicBonus = Math.min(0.3, academicOverlap * 0.05)

  return jaccard + academicBonus
}

function tokenizeTitle(title: string): string[] {
  return normalizeWhitespace(title)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]+/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

function extractAcademicTerms(title: string): string[] {
  const academicPatterns = [
    /\b(?:attention|transformer|diffusion|world model|latent|embedding|foundation|neural|deep|learning|reinforcement|imitation|autonomous|driving|planning|control|policy|prediction|forecasting|perception|sensor|vision|language|multimodal|cross-modal|temporal|spatial|generative|discriminative|supervised|unsupervised|self-supervised|semi-supervised|transfer|multi-task|few-shot|zero-shot|prompt|fine-tune|pretrain|downstream|benchmark|dataset|simulation|real-world|closed-loop|open-loop|end-to-end|modular|hybrid|intervention|safety|robustness|uncertainty|calibration|interpretability|explainability)\b/gi
  ]

  const terms: string[] = []
  for (const pattern of academicPatterns) {
    const matches = title.match(pattern) || []
    terms.push(...matches.map(m => m.toLowerCase()))
  }
  return terms
}

/**
 * Apply MMR diversity filtering to discovery candidates
 * Selects candidates that maximize relevance while minimizing redundancy
 */
function applyMmrDiversityFilter(
  candidates: ExternalDiscoveryCandidate[],
  maxResults: number,
  relevanceScores?: Map<string, number>
): ExternalDiscoveryCandidate[] {
  if (candidates.length <= maxResults) return candidates

  const selected: ExternalDiscoveryCandidate[] = []
  const remaining = [...candidates]

  // Get initial relevance scores (citation count as proxy)
  const getRelevance = (c: ExternalDiscoveryCandidate): number => {
    if (relevanceScores?.has(c.paperId)) return relevanceScores.get(c.paperId)!
    // Use citation count + depth bonus as relevance proxy
    const depth = parseInt(c.discoveryChannels[0]?.match(/depth(\d+)/)?.[1] ?? '0')
    const citationBonus = (c.citationCount ?? 0) / 100
    const depthPenalty = depth * 0.1
    return 1 - depthPenalty + citationBonus
  }

  while (selected.length < maxResults && remaining.length > 0) {
    let bestMmrScore = -Infinity
    let bestCandidate: ExternalDiscoveryCandidate | null = null
    let bestIndex = -1

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const relevance = getRelevance(candidate)

      // Compute max similarity to already selected candidates
      let maxSimToSelected = 0
      for (const selectedCandidate of selected) {
        const sim = computeTitleSimilarity(candidate.title, selectedCandidate.title)
        if (sim > maxSimToSelected) maxSimToSelected = sim
      }

      // MMR score: λ * relevance - (1-λ) * max_similarity
      const mmrScore = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSimToSelected

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore
        bestCandidate = candidate
        bestIndex = i
      }
    }

    if (bestCandidate && bestIndex >= 0) {
      selected.push(bestCandidate)
      remaining.splice(bestIndex, 1)
    } else {
      break
    }
  }

  return selected
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
  // Use imported reconstructAbstract from openalex.ts client
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  return reconstructAbstract(value as Record<string, number[]>)
}

/**
 * Co-Citation Analysis - Finds papers frequently cited together with seeds
 * This implements the OpenClaw/CCB pattern for discovering semantically related papers
 *
 * Two papers are co-cited if they appear together in reference lists of other papers.
 * High co-citation count indicates semantic relatedness even without keyword overlap.
 */
interface CoCitationResult {
  paperId: string
  title: string
  coCitationCount: number
  coCitedWithSeeds: string[] // IDs of seed papers that are co-cited with this paper
}

async function fetchCoCitationNetwork(
  seedPaperIds: string[],
  maxResults: number,
  discoveryRound: number
): Promise<ExternalDiscoveryCandidate[]> {
  // Use Semantic Scholar API to get papers that cite multiple seed papers
  // This is the co-citation network analysis

  const candidates: ExternalDiscoveryCandidate[] = []

  try {
    // For each seed, fetch papers that cite it
    const citingPapersBySeed = new Map<string, Set<string>>()

    for (const seedId of seedPaperIds.slice(0, 3)) { // Limit to 3 seeds for efficiency
      try {
        const normalizedSeedId = seedId.startsWith('s2:') ? seedId.replace('s2:', '') : seedId

        // Use Semantic Scholar citations endpoint
        const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/${normalizedSeedId}/citations?fields=paperId,title,year,authors,abstract,externalIds&limit=50`

        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'daily-report-co-citation-analysis',
          },
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) continue

        const data = await response.json() as { data?: Array<{ citedPaper: SemanticScholarPaper }> }
        const citingPaperIds = new Set<string>()

        for (const citation of data.data || []) {
          const paperId = normalizeSemanticScholarPaperId(citation.citedPaper)
          if (paperId) {
            citingPaperIds.add(paperId)
            citingPapersBySeed.set(seedId, citingPaperIds)
          }
        }
      } catch (error) {
        console.warn('[fetchCoCitationNetwork] Failed for seed:', seedId, error)
      }

      // Rate limiting
      await sleep(200)
    }

    // Find intersection: papers that cite multiple seeds (co-cited papers)
    const allCitingPapers = new Map<string, number>() // paperId -> count of seeds it cites
    const paperDetails = new Map<string, SemanticScholarPaper>()

    for (const [_seedId, paperIds] of citingPapersBySeed) {
      for (const paperId of paperIds) {
        allCitingPapers.set(paperId, (allCitingPapers.get(paperId) || 0) + 1)
      }
    }

    // Sort by co-citation count (papers citing multiple seeds are most relevant)
    const coCitedPapers = [...allCitingPapers.entries()]
      .filter(([, count]) => count >= 2) // Must cite at least 2 seeds to be co-cited
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults)

    // Convert to discovery candidates
    for (const [paperId, coCiteCount] of coCitedPapers) {
      candidates.push({
        paperId,
        title: '', // Would need to fetch details
        abstract: '',
        published: '',
        authors: [],
        citationCount: null,
        source: 'semantic-scholar',
        queryHits: [],
        discoveryChannels: [`co-citation:${coCiteCount}seeds`],
        discoveryRounds: [discoveryRound],
        matchedBranchIds: [],
        matchedProblemNodeIds: [],
        // Co-citation strength indicates semantic relatedness
        _coCitationScore: coCiteCount,
      } as ExternalDiscoveryCandidate & { _coCitationScore: number })
    }

  } catch (error) {
    console.warn('[fetchCoCitationNetwork] Co-citation analysis failed:', error)
  }

  return candidates
}

function normalizeOpenAlexPaperId(openAlexId: string, arxivId?: string | null) {
  // Use imported normalizePaperId from openalex.ts for consistency
  if (arxivId) return arxivId
  // Fallback to openalex- prefix for backward compatibility
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
  // Use imported extractArxivId from openalex.ts client
  // Cast through unknown first for type safety
  const workTyped = work as unknown as OpenAlexWork
  return extractArxivId(workTyped)
}

function addMonths(value: string, months: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next.toISOString()
}

function parseArxivResponse(xml: string, discoveryQuery: DiscoveryQuery, discoveryRound: number) {
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
  discoveryRound: number // 支持多轮发现（1-10）
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
  discoveryRound: number // 支持多轮发现（1-10）
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
  const minimumBudget = Math.min(6, SEMANTIC_SCHOLAR_MAX_QUERY_BUDGET_PER_ROUND)
  const adaptiveBudget = Math.max(
    minimumBudget,
    Math.ceil(queryCount * 0.2),
    Math.ceil(maxTotalCandidates / 20),
  )
  return Math.min(SEMANTIC_SCHOLAR_MAX_QUERY_BUDGET_PER_ROUND, adaptiveBudget)
}

async function searchArxiv(query: DiscoveryQuery, maxResults: number, discoveryRound: number) {
  const cooldownUntil = await getSourceCooldownUntil('arxiv')
  if (Date.now() < cooldownUntil) {
    return []
  }

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
    if (response.status === 429) {
      await noteSourceRateLimit('arxiv', { defaultCooldownMs: 15 * 60 * 1000 })
    }
    throw new Error(`arXiv discovery failed with status ${response.status}.`)
  }

  await noteSourceSuccess('arxiv')
  return parseArxivResponse(await response.text(), query, discoveryRound)
}

async function searchOpenAlex(query: DiscoveryQuery, maxResults: number, discoveryRound: number) {
  try {
    const result = await searchOpenAlexWorks(query.query, {
      limit: maxResults,
      filters: {
        type: 'article',
        has_fulltext: true,
        exclude_paratext: true,
        exclude_retracted: true,
      },
    })

    const candidates = (result.results || [])
      .map((work) =>
        normalizeOpenAlexWork({
          work: work as unknown as Record<string, unknown>,
          discoveryChannel: `openalex:${query.focus}`,
          query,
          discoveryRound,
        }),
      )
    return candidates.filter(
      (candidate): candidate is ExternalDiscoveryCandidate => candidate !== null,
    )
  } catch (error) {
    console.warn('[paper-tracker.discovery] OpenAlex search failed', {
      query: query.query,
      reason: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function searchSemanticScholar(args: {
  query: DiscoveryQuery
  anchors: StageAnchor[]
  maxWindowMonths: number
  searchStartDate?: Date
  searchEndDateExclusive?: Date
  maxResults: number
  discoveryRound: number // 支持多轮发现（1-10）
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

function normalizeCrossrefWork(args: {
  work: CrossrefWork
  discoveryChannel: string
  query?: DiscoveryQuery
  discoveryRound: number
}): ExternalDiscoveryCandidate | null {
  const normalized = transformCrossrefWork(args.work)
  if (!normalized || !normalized.title || !normalized.published) return null

  return {
    paperId: normalized.paperId,
    title: normalized.title,
    abstract: normalized.abstract,
    published: normalized.published,
    authors: normalized.authors,
    arxivUrl: normalized.arxivUrl,
    pdfUrl: normalized.pdfUrl ?? normalized.landingPageUrl,
    citationCount: normalized.citationCount,
    source: 'crossref' as const,
    queryHits: args.query ? [args.query.query] : [],
    discoveryChannels: [args.discoveryChannel],
    discoveryRounds: [args.discoveryRound],
    matchedBranchIds: args.query?.targetBranchIds ?? [],
    matchedProblemNodeIds: args.query?.targetProblemIds ?? [],
  }
}

async function searchCrossref(args: {
  query: DiscoveryQuery
  maxResults: number
  discoveryRound: number
  searchStartDate?: Date
  searchEndDateExclusive?: Date
}) {
  const works = await searchCrossrefWorksByTitle(
    args.query.query,
    Math.max(4, Math.min(args.maxResults, CROSSREF_MAX_RESULTS)),
  )
  await sleep(CROSSREF_RATE_LIMIT_DELAY_MS)

  return works
    .map((work) =>
      normalizeCrossrefWork({
        work,
        discoveryChannel: `crossref:${args.query.focus}`,
        query: args.query,
        discoveryRound: args.discoveryRound,
      }),
    )
    .filter((candidate): candidate is ExternalDiscoveryCandidate => {
      if (!candidate) return false
      const publishedAt = new Date(candidate.published)
      if (Number.isNaN(publishedAt.getTime())) return false
      if (args.searchStartDate && publishedAt < args.searchStartDate) return false
      if (args.searchEndDateExclusive && publishedAt >= args.searchEndDateExclusive) return false
      return true
    })
}

function hasArxivDirectAccess(candidate: ExternalDiscoveryCandidate) {
  return (
    /^https?:\/\/arxiv\.org\/abs\//iu.test(candidate.arxivUrl ?? '') ||
    /^https?:\/\/arxiv\.org\/pdf\//iu.test(candidate.pdfUrl ?? '')
  )
}

async function supplementCandidatesWithArxivBackfill(args: {
  candidates: ExternalDiscoveryCandidate[]
  query: DiscoveryQuery
  discoveryRound: number
}) {
  const targets = args.candidates
    .filter((candidate) => candidate.source !== 'arxiv' && !hasArxivDirectAccess(candidate))
    .sort((left, right) => (right.citationCount ?? 0) - (left.citationCount ?? 0))
    .slice(0, ARXIV_TITLE_BACKFILL_LIMIT_PER_QUERY)

  const updates = new Map<string, ExternalDiscoveryCandidate>()

  for (const candidate of targets) {
    try {
      const matches = await searchArxiv(
        {
          ...args.query,
          query: `"${candidate.title}"`,
        },
        ARXIV_TITLE_BACKFILL_MAX_RESULTS,
        args.discoveryRound,
      )
      await sleep(ARXIV_RATE_LIMIT_DELAY_MS)

      const best = matches
        .map((match) => ({
          match,
          score: computeTitleSimilarity(candidate.title, match.title),
        }))
        .filter((entry) => entry.score >= 0.82 || normalizeTitle(entry.match.title) === normalizeTitle(candidate.title))
        .sort((left, right) => right.score - left.score)[0]?.match

      if (!best) continue

      updates.set(candidate.paperId, {
        ...candidate,
        arxivUrl: best.arxivUrl ?? candidate.arxivUrl,
        pdfUrl: best.pdfUrl ?? candidate.pdfUrl,
        discoveryChannels: Array.from(
          new Set([...candidate.discoveryChannels, `arxiv:title-backfill:${args.query.focus}`]),
        ),
      })
    } catch (error) {
      console.warn('[paper-tracker.discovery] arXiv title backfill failed', {
        title: candidate.title,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return args.candidates.map((candidate) => updates.get(candidate.paperId) ?? candidate)
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
  discoveryRound: number, // 支持多轮发现（1-10）
) {
  const results: ExternalDiscoveryCandidate[] = []

  try {
    const works = await batchGetOpenAlexWorks(ids)

    for (const work of works) {
      const normalized = normalizeOpenAlexWork({
        work: work as unknown as Record<string, unknown>,
        discoveryChannel,
        discoveryRound,
      })
      if (normalized) {
        results.push(normalized)
      }
    }
  } catch (error) {
    console.warn('[fetchOpenAlexWorksByIds] Batch fetch failed', {
      ids,
      reason: error instanceof Error ? error.message : String(error),
    })
  }

  return results
}

async function fetchOpenAlexCitingWorks(
  citedByApiUrl: string,
  maxResults: number,
  discoveryRound: number, // 支持多轮发现（1-10）
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
  discoveryRound: number
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

// Use Promise.allSettled to preserve partial success on timeout/failure
    const [relatedWorksResult, referencedWorksResult, citingWorksResult] = await Promise.allSettled([
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

    // Extract successful results, log failures
    const relatedWorks = relatedWorksResult.status === 'fulfilled'
      ? relatedWorksResult.value
      : (() => { console.warn('[discoverAnchorNeighborhood] related works fetch failed', relatedWorksResult.reason); return [] })()
    const referencedWorks = referencedWorksResult.status === 'fulfilled'
      ? referencedWorksResult.value
      : (() => { console.warn('[discoverAnchorNeighborhood] referenced works fetch failed', referencedWorksResult.reason); return [] })()
    const citingWorks = citingWorksResult.status === 'fulfilled'
      ? citingWorksResult.value
      : (() => { console.warn('[discoverAnchorNeighborhood] citing works fetch failed', citingWorksResult.reason); return [] })()

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
  const crossrefQueryBudget = Math.min(
    CROSSREF_MAX_QUERY_BUDGET_PER_ROUND,
    Math.max(4, Math.ceil(queries.length * 0.2)),
  )
  let crossrefQueriesUsed = 0

for (const query of queries) {
    // Sequential API calls with rate limit delays to avoid 429 errors
    let arxivResults: ExternalDiscoveryCandidate[] = []
    let openAlexResults: ExternalDiscoveryCandidate[] = []
    let crossrefResults: ExternalDiscoveryCandidate[] = []

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
    const shouldSupplementWithCrossref =
      crossrefQueriesUsed < crossrefQueryBudget &&
      (combinedResults.length < Math.max(8, Math.ceil(maxResultsPerQuery * 0.8)) ||
        looksRecallSensitiveDiscoveryQuery(query.query))

    if (shouldSupplementWithCrossref) {
      crossrefQueriesUsed += 1
      try {
        crossrefResults = await searchCrossref({
          query,
          maxResults: Math.max(4, Math.min(maxResultsPerQuery, CROSSREF_MAX_RESULTS)),
          discoveryRound: args.discoveryRound,
          searchStartDate: args.searchStartDate,
          searchEndDateExclusive: args.searchEndDateExclusive,
        })
      } catch (error) {
        console.warn('[paper-tracker.discovery] Crossref supplement failed', {
          query: query.query,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }

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

    const enrichedCandidates = await supplementCandidatesWithArxivBackfill({
      candidates: [...combinedResults, ...crossrefResults, ...semanticScholarResults],
      query,
      discoveryRound: args.discoveryRound,
    })

    for (const candidate of enrichedCandidates) {
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

// Sort by relevance score first
  const sortedCandidates = [...candidateMap.values()]
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

  // Apply MMR diversity filtering to ensure non-redundant discoveries
  // This implements the OpenClaw/CCB pattern for diverse paper collection
  const diverseCandidates = applyMmrDiversityFilter(sortedCandidates, maxTotalCandidates)

  return diverseCandidates
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
    discoveryRound?: number
    focus?: 'forward' | 'backward' | 'both'
    yearStart?: number
    yearEnd?: number
  }
): Promise<ExternalDiscoveryCandidate[]> {
  const { maxDepth = 2, maxCandidates = 200, discoveryRound = 1, focus = 'both', yearStart, yearEnd } = options ?? {}

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
 * 广纳贤文: OpenAlex专用发现函数
 * 利用OpenAlex的citation network和related works功能进行深度发现
 *
 * 特性：
 * - 引用网络遍历（前向/后向引用）
 * - 相关论文推荐
 * - 概念扩展搜索
 * - 批量获取效率优化
 */
export async function openAlexDiscovery(
  seedPapers: Array<{
    paperId: string
    title: string
    openAlexId?: string
  }>,
  options?: {
    maxDepth?: number
    maxCandidates?: number
    discoveryRound?: number
    minCitationCount?: number
    yearStart?: number
    yearEnd?: number
    enableConceptExpansion?: boolean
  }
): Promise<ExternalDiscoveryCandidate[]> {
  const {
    maxDepth = 2,
    maxCandidates = 200,
    discoveryRound = 1,
    minCitationCount = 10,
    yearStart,
    yearEnd,
    enableConceptExpansion = true,
  } = options ?? {}

  if (seedPapers.length === 0) {
    return []
  }

  const candidateMap = new Map<string, ExternalDiscoveryCandidate>()
  const visitedIds = new Set<string>(seedPapers.map(p => p.paperId))

  // Convert paper IDs to OpenAlex IDs if needed
  const seedsWithOAIds = await Promise.all(
    seedPapers.map(async (seed) => {
      if (seed.openAlexId) {
        return { ...seed, oaId: seed.openAlexId }
      }

      // Try to find the paper via search to get OpenAlex ID
      try {
        const result = await searchOpenAlexWorks(seed.title, {
          limit: 5,
          filters: yearStart || yearEnd ? { from_year: yearStart, to_year: yearEnd } : undefined,
        })

        if (result.results && result.results.length > 0) {
          // Find best match by title similarity
          const bestMatch = result.results.find(w =>
            w.display_name?.toLowerCase().includes(seed.title.toLowerCase().slice(0, 30)) ||
            seed.title.toLowerCase().includes(w.display_name?.toLowerCase().slice(0, 30) || '')
          )
          if (bestMatch?.id) {
            return { ...seed, oaId: bestMatch.id }
          }
        }
      } catch (error) {
        console.warn('[openAlexDiscovery] Failed to find OA ID for seed:', seed.paperId)
      }
      return { ...seed, oaId: null }
    })
  )

  // BFS traversal of citation networks
  const queue: Array<{ oaId: string; depth: number }> = []

  for (const seed of seedsWithOAIds) {
    if (seed.oaId) {
      queue.push({ oaId: seed.oaId, depth: 0 })
    }
  }

  while (queue.length > 0 && candidateMap.size < maxCandidates) {
    const current = queue.shift()
    if (!current) break

    if (current.depth >= maxDepth) continue

    try {
      // Get citation network using OpenAlex client
      const network = await getOpenAlexCitationNetwork(current.oaId, {
        maxForwardCitations: Math.min(20, maxCandidates - candidateMap.size),
        maxBackwardReferences: Math.min(15, maxCandidates - candidateMap.size),
        maxRelatedWorks: Math.min(10, maxCandidates - candidateMap.size),
        minCitationCount,
      })

      // Process forward citations
      for (const citation of network.forwardCitations) {
        const paperId = citation.openAccessUrl?.match(/arxiv\.org\/abs\/([^v<\s]+)/i)?.[1] ||
          `openalex:${citation.workId.split('/').pop()}`

        if (visitedIds.has(paperId)) continue
        visitedIds.add(paperId)

        // Year filter
        if (yearStart && citation.year < yearStart) continue
        if (yearEnd && citation.year > yearEnd) continue

        const candidate: ExternalDiscoveryCandidate = {
          paperId,
          title: normalizeWhitespace(citation.title),
          abstract: '',
          published: `${citation.year}-01-01T00:00:00.000Z`,
          authors: [],
          citationCount: citation.citationCount,
          pdfUrl: citation.openAccessUrl,
          openAlexId: citation.workId,
          source: 'openalex',
          queryHits: [],
          discoveryChannels: [`openalex:citation-forward:depth${current.depth}`],
          discoveryRounds: [discoveryRound],
          matchedBranchIds: [],
          matchedProblemNodeIds: [],
        }

        mergeDiscoveryCandidate(candidateMap, candidate)

        // Add to queue for next depth
        if (current.depth + 1 < maxDepth && candidateMap.size < maxCandidates) {
          queue.push({ oaId: citation.workId, depth: current.depth + 1 })
        }
      }

      // Process backward references
      for (const ref of network.backwardReferences) {
        const paperId = `openalex:${ref.workId.split('/').pop()}`

        if (visitedIds.has(paperId)) continue
        visitedIds.add(paperId)

        // Year filter
        if (yearStart && ref.year < yearStart) continue
        if (yearEnd && ref.year > yearEnd) continue

        // Fetch full details for abstract and authors
        const fullWork = await getOpenAlexWork(ref.workId)

        const candidate: ExternalDiscoveryCandidate = {
          paperId,
          title: normalizeWhitespace(ref.title),
          abstract: normalizeWhitespace(fullWork ? reconstructAbstract(fullWork.abstract_inverted_index) : ''),
          published: `${ref.year}-01-01T00:00:00.000Z`,
          authors: fullWork?.authorships?.map(a => a.author?.display_name || '').filter(Boolean) || [],
          citationCount: fullWork?.cited_by_count ?? null,
          openAlexId: ref.workId,
          source: 'openalex',
          queryHits: [],
          discoveryChannels: [`openalex:reference-backward:depth${current.depth}`],
          discoveryRounds: [discoveryRound],
          matchedBranchIds: [],
          matchedProblemNodeIds: [],
        }

        mergeDiscoveryCandidate(candidateMap, candidate)

        // Add to queue for next depth (only for key references)
        if (ref.isKeyReference && current.depth + 1 < maxDepth && candidateMap.size < maxCandidates) {
          queue.push({ oaId: ref.workId, depth: current.depth + 1 })
        }
      }

      // Process related works
      for (const related of network.relatedWorks) {
        const paperId = `openalex:${related.workId.split('/').pop()}`

        if (visitedIds.has(paperId)) continue
        visitedIds.add(paperId)

        // Year filter
        if (yearStart && related.year < yearStart) continue
        if (yearEnd && related.year > yearEnd) continue

        const candidate: ExternalDiscoveryCandidate = {
          paperId,
          title: normalizeWhitespace(related.title),
          abstract: '',
          published: `${related.year}-01-01T00:00:00.000Z`,
          authors: [],
          citationCount: related.citationCount,
          openAlexId: related.workId,
          source: 'openalex',
          queryHits: [],
          discoveryChannels: [`openalex:related:depth${current.depth}`],
          discoveryRounds: [discoveryRound],
          matchedBranchIds: [],
          matchedProblemNodeIds: [],
        }

        mergeDiscoveryCandidate(candidateMap, candidate)
      }
    } catch (error) {
      console.warn('[openAlexDiscovery] Failed at depth', current.depth, 'for', current.oaId, error)
    }
  }

  // Concept expansion: search by concepts extracted from discovered papers
  if (enableConceptExpansion && candidateMap.size < maxCandidates) {
    const conceptCounts = new Map<string, number>()

    // This would require fetching full work details for concept extraction
    // For efficiency, we skip this in the initial pass
    // Concepts can be used in subsequent discovery rounds
  }

  // Sort by citation count and depth, then apply MMR diversity
  const sortedCandidates = [...candidateMap.values()]
    .sort((a, b) => {
      const aDepth = parseInt(a.discoveryChannels[0]?.match(/depth(\d+)/)?.[1] ?? '0')
      const bDepth = parseInt(b.discoveryChannels[0]?.match(/depth(\d+)/)?.[1] ?? '0')
      // Prefer papers closer to seeds (lower depth)
      if (aDepth !== bDepth) return aDepth - bDepth
      // Then by citation count
      return (b.citationCount ?? 0) - (a.citationCount ?? 0)
    })

  // Apply MMR diversity filtering to ensure non-redundant discoveries
  // This implements the OpenClaw/CCB pattern for diverse paper collection
  const diverseCandidates = applyMmrDiversityFilter(sortedCandidates, maxCandidates)

  return diverseCandidates
}

/**
 * Combined discovery: regular search + snowball sampling
 * Implements the full "广纳贤文" discovery strategy
 */
export async function discoverWithSnowball(args: DiscoverExternalCandidatesArgs & {
  enableSnowball?: boolean
  snowballDepth?: number
  snowballMaxCandidates?: number
  enableOpenAlex?: boolean
  openAlexMaxCandidates?: number
}): Promise<ExternalDiscoveryCandidate[]> {
  // First, run regular discovery
  const regularCandidates = await discoverExternalCandidates(args)

  // Prepare seed papers from anchors for snowball sampling
  const seeds = args.anchors.map(anchor => ({
    paperId: anchor.paperId,
    title: anchor.title,
    semanticScholarId: anchor.paperId.startsWith('s2:')
      ? anchor.paperId.replace('s2:', '')
      : undefined,
    openAlexId: anchor.openAlexId,
  }))

  const mergedMap = new Map<string, ExternalDiscoveryCandidate>()

  // Add regular candidates
  for (const candidate of regularCandidates) {
    mergeDiscoveryCandidate(mergedMap, candidate)
  }

  // Run snowball discovery (Semantic Scholar citation chain)
  if (args.enableSnowball && seeds.length > 0) {
    const snowballCandidates = await snowballDiscovery(seeds, {
      maxDepth: args.snowballDepth ?? 2,
      maxCandidates: args.snowballMaxCandidates ?? 30,
      discoveryRound: args.discoveryRound,
      focus: 'both',
      yearStart: args.searchStartDate?.getUTCFullYear(),
      yearEnd: args.searchEndDateExclusive?.getUTCFullYear(),
    })

    for (const candidate of snowballCandidates) {
      mergeDiscoveryCandidate(mergedMap, candidate)
    }
  }

  // Run co-citation network analysis for semantically related papers
  // This discovers papers that cite multiple seed papers (co-cited papers)
  // Papers co-cited together are often semantically related even without keyword overlap
  if (seeds.length >= 2) {
    try {
      const seedPaperIds = seeds.map(s => s.semanticScholarId ?? s.paperId)
      const coCitationCandidates = await fetchCoCitationNetwork(
        seedPaperIds,
        Math.min(15, args.maxTotalCandidates ?? 144),
        args.discoveryRound
      )

      for (const candidate of coCitationCandidates) {
        mergeDiscoveryCandidate(mergedMap, candidate)
      }
    } catch (error) {
      console.warn('[discoverWithSnowball] Co-citation analysis failed:', error)
    }
  }

  // Run OpenAlex discovery for broader coverage ("广纳贤文")
  if (args.enableOpenAlex !== false && seeds.length > 0) {
    try {
      const openAlexCandidates = await openAlexDiscovery(seeds, {
        maxDepth: args.snowballDepth ?? 2,
        maxCandidates: args.openAlexMaxCandidates ?? 20,
        discoveryRound: args.discoveryRound,
        minCitationCount: 5,
        yearStart: args.searchStartDate?.getUTCFullYear(),
        yearEnd: args.searchEndDateExclusive?.getUTCFullYear(),
        enableConceptExpansion: true,
      })

      for (const candidate of openAlexCandidates) {
        mergeDiscoveryCandidate(mergedMap, candidate)
      }
    } catch (error) {
      console.warn('[discoverWithSnowball] OpenAlex discovery failed:', error)
    }
  }

  // Sort by relevance score
  const sortedCandidates = [...mergedMap.values()]
    .sort((a, b) => {
      // Prioritize by discovery channels count and citation count
      const aScore = a.discoveryChannels.length + (a.citationCount ?? 0) * 0.001
      const bScore = b.discoveryChannels.length + (b.citationCount ?? 0) * 0.001
      return bScore - aScore
    })

  // Apply MMR diversity filtering for final selection
  const maxTotal = args.maxTotalCandidates ?? 144
  const diverseCandidates = applyMmrDiversityFilter(sortedCandidates, maxTotal)

  return diverseCandidates
}
