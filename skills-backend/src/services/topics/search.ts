import { prisma } from '../../lib/prisma'
import { AppError } from '../../middleware/errorHandler'
import { resolvePaperSourceLinks } from '../paper-links'
import { deriveTemporalStageBuckets, normalizeStageWindowMonths } from './stage-buckets'

type SearchScope = 'global' | 'topic'
type SearchKind = 'topic' | 'node' | 'paper' | 'section' | 'figure' | 'table' | 'formula'
type SearchGroupKind = 'topic' | 'node' | 'paper' | 'evidence'

export interface SearchResultItem {
  id: string
  kind: SearchKind
  title: string
  subtitle: string
  excerpt: string
  route: string
  anchorId?: string
  topicId?: string
  topicTitle?: string
  tags: string[]
  publishedAt?: string
  matchedFields: string[]
  stageLabel?: string
  timeLabel?: string
  nodeId?: string
  nodeTitle?: string
  nodeRoute?: string
  locationLabel?: string
  relatedNodes?: Array<{
    nodeId: string
    title: string
    stageIndex: number
    stageLabel?: string
    route: string
  }>
  quickActions?: Array<{
    id: 'open' | 'add-context' | 'follow-up'
    label: string
  }>
}

export interface SearchFacetEntry {
  value: string
  label: string
  count: number
}

export interface SearchCandidate extends SearchResultItem {
  group: SearchGroupKind
  score: number
}

export interface SearchResponse {
  query: string
  scope: SearchScope
  totals: {
    all: number
    topic: number
    node: number
    paper: number
    evidence: number
  }
  groups: Array<{
    group: SearchGroupKind
    label: string
    items: SearchResultItem[]
  }>
  facets: {
    stages: SearchFacetEntry[]
    topics: SearchFacetEntry[]
  }
}

interface SearchOptions {
  q: string
  scope: SearchScope
  topicId?: string
  topics?: string[]
  types?: SearchKind[]
  stages?: string[]
  limit?: number
  stageWindowMonths?: number
}

type RankTuple = [
  titleRank: number,
  summaryRank: number,
  tagRank: number,
  evidenceRank: number,
  kindRank: number,
  recencyRank: number,
  matchedFieldRank: number,
]

const DEFAULT_TYPES: SearchKind[] = ['topic', 'node', 'paper', 'section', 'figure', 'table', 'formula']
const GROUP_ORDER: SearchGroupKind[] = ['topic', 'node', 'paper', 'evidence']
const GROUP_LABELS: Record<SearchGroupKind, string> = {
  topic: '主题',
  node: '节点',
  paper: '论文',
  evidence: '证据',
}
const EVIDENCE_KINDS = new Set<SearchKind>(['section', 'figure', 'table', 'formula'])
const KIND_PRIORITY: Record<SearchKind, number> = {
  node: 7,
  paper: 6,
  section: 5,
  figure: 5,
  table: 5,
  formula: 5,
  topic: 4,
}

function resolveGroupLabel(group: SearchGroupKind) {
  switch (group) {
    case 'topic':
      return '主题'
    case 'node':
      return '节点'
    case 'paper':
      return '论文'
    case 'evidence':
      return '证据'
    default:
      return group
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim().toLowerCase()
}

function tokenizeQuery(value: string) {
  return normalizeText(value)
    .split(/[\s/_,.;:|+-]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
}

function clipText(value: string | null | undefined, maxLength = 180) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function isRegressionSeedText(value: string | null | undefined) {
  const text = normalizeText(value)
  return (
    text.includes('create a regression topic') ||
    text.includes('create a regres') ||
    text.includes('seeded for regression coverage')
  )
}

function parseJsonArray(value: string | null | undefined) {
  if (!value) return [] as string[]
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function parseAuthors(value: string | null | undefined) {
  const parsed = parseJsonArray(value)
  if (parsed.length > 0) return parsed

  return (value ?? '')
    .split(/[;,，；]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractSourceSearchTokens(values: Array<string | null | undefined>) {
  const tokens = new Set<string>()

  for (const rawValue of values) {
    const value = rawValue?.trim()
    if (!value) continue

    tokens.add(value)
    tokens.add(value.replace(/^https?:\/\//iu, ''))

    const arxivMatch = value.match(/\b(\d{4}\.\d{4,5})(?:v\d+)?\b/iu)
    if (arxivMatch) {
      tokens.add(arxivMatch[1])
    }

    try {
      const parsedUrl = new URL(value)
      tokens.add(parsedUrl.hostname)
      for (const part of parsedUrl.pathname.split('/')) {
        const normalizedPart = decodeURIComponent(part).trim()
        if (!normalizedPart) continue
        tokens.add(normalizedPart)
        tokens.add(normalizedPart.replace(/\.pdf$/iu, ''))
      }
    } catch {
      for (const part of value.split(/[/?#=&._-]+/u)) {
        const normalizedPart = part.trim()
        if (!normalizedPart) continue
        tokens.add(normalizedPart)
      }
    }
  }

  return Array.from(tokens).filter(Boolean)
}

function sectionRoute(paperId: string, sectionId: string) {
  return `/paper/${paperId}?anchor=section:${sectionId}`
}

function evidenceRoute(paperId: string, type: 'figure' | 'table' | 'formula', id: string) {
  return `/paper/${paperId}?evidence=${type}:${id}`
}

function nodeRoute(nodeId: string) {
  return `/node/${nodeId}`
}

function fallbackStageLabel(stageIndex: number) {
  return `阶段 ${stageIndex}`
}

function resolveStageLabelFallback(stageIndex: number) {
  return ['阶段', String(stageIndex)].join(' ')
}

type SearchNodeLocation = NonNullable<SearchResultItem['relatedNodes']>[number]

function buildLocationLabel(locations: SearchNodeLocation[]) {
  if (locations.length === 0) return undefined

  const [primary, ...rest] = locations
  const base = [primary.stageLabel ?? resolveStageLabelFallback(primary.stageIndex), primary.title]
    .filter(Boolean)
    .join(' · ')

  return rest.length > 0 ? `${base} +${rest.length}` : base
}

function normalizeStageFilterValues(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  )
}

function normalizeTopicFilterValues(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function getCandidateStageLabels(
  candidate: Pick<SearchResultItem, 'stageLabel' | 'relatedNodes'>,
) {
  const labels = new Set<string>()

  if (candidate.stageLabel) {
    labels.add(candidate.stageLabel)
  }

  for (const location of candidate.relatedNodes ?? []) {
    if (location.stageLabel) {
      labels.add(location.stageLabel)
    }
  }

  return Array.from(labels)
}

function parseStageFacetSortKey(label: string) {
  const match = label.match(/(\d{4})\.(\d{2})/u)
  if (!match) return Number.MAX_SAFE_INTEGER

  return Number.parseInt(`${match[1]}${match[2]}`, 10)
}

function buildStageFacets(candidates: SearchCandidate[]) {
  const facets = new Map<string, SearchFacetEntry>()

  for (const candidate of candidates) {
    for (const label of getCandidateStageLabels(candidate)) {
      const normalized = normalizeText(label)
      if (!normalized) continue

      const current = facets.get(normalized)
      if (current) {
        current.count += 1
        continue
      }

      facets.set(normalized, {
        value: label,
        label,
        count: 1,
      })
    }
  }

  return Array.from(facets.values()).sort((left, right) => {
    const byTime = parseStageFacetSortKey(left.label) - parseStageFacetSortKey(right.label)
    if (byTime !== 0) return byTime
    return left.label.localeCompare(right.label, 'zh-CN')
  })
}

function buildTopicFacets(candidates: SearchCandidate[]) {
  const facets = new Map<string, SearchFacetEntry>()

  for (const candidate of candidates) {
    const value = candidate.kind === 'topic' ? candidate.id : candidate.topicId
    const label = candidate.kind === 'topic' ? candidate.title : candidate.topicTitle
    if (!value || !label) continue

    const current = facets.get(value)
    if (current) {
      current.count += 1
      continue
    }

    facets.set(value, {
      value,
      label,
      count: 1,
    })
  }

  return Array.from(facets.values()).sort((left, right) => {
    if (left.count !== right.count) return right.count - left.count
    return left.label.localeCompare(right.label, 'zh-CN')
  })
}

function matchesStageFilters(candidate: SearchCandidate, stageFilters: string[]) {
  if (stageFilters.length === 0) return true

  return getCandidateStageLabels(candidate)
    .map((label) => normalizeText(label))
    .some((label) => stageFilters.includes(label))
}

function matchesTopicFilters(candidate: SearchCandidate, topicFilters: string[]) {
  if (topicFilters.length === 0) return true

  const candidateTopicId = candidate.kind === 'topic' ? candidate.id : candidate.topicId
  if (!candidateTopicId) return false

  return topicFilters.includes(candidateTopicId)
}

function tokenCoverage(tokens: string[], normalizedValue: string) {
  if (tokens.length <= 1) return 0
  const matched = tokens.filter((token) => normalizedValue.includes(token)).length
  if (matched === tokens.length) return 3
  if (matched >= Math.ceil(tokens.length * 0.66)) return 2
  if (matched > 0) return 1
  return 0
}

function fieldRank(query: string, value: string) {
  const normalizedValue = normalizeText(value)
  if (!query || !normalizedValue) return 0
  if (normalizedValue === query) return 6
  if (normalizedValue.startsWith(query)) return 5
  if (normalizedValue.includes(query)) return 4

  const tokenScore = tokenCoverage(tokenizeQuery(query), normalizedValue)
  if (tokenScore === 3) return 3
  if (tokenScore === 2) return 2
  if (tokenScore === 1) return 1
  return 0
}

function tagRank(query: string, tags: string[]) {
  return tags.reduce((highest, tag) => Math.max(highest, fieldRank(query, tag)), 0)
}

function collectMatchedFields(query: string, fields: Record<string, string>) {
  const tokens = tokenizeQuery(query)
  return Object.entries(fields)
    .filter(([, value]) => {
      const normalized = normalizeText(value)
      if (normalized.includes(query)) return true
      return tokens.length > 1 ? tokens.some((token) => normalized.includes(token)) : false
    })
    .map(([field]) => field)
}

function formatTimeLabel(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return undefined
  return `${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

function buildRankTuple(query: string, candidate: SearchCandidate, scope: SearchScope): RankTuple {
  const titleRank = fieldRank(query, candidate.title)
  const subtitleRank = fieldRank(query, candidate.subtitle)
  const excerptRank = fieldRank(query, candidate.excerpt)
  const summaryRank = EVIDENCE_KINDS.has(candidate.kind)
    ? subtitleRank
    : Math.max(subtitleRank, excerptRank)
  const evidenceRank = EVIDENCE_KINDS.has(candidate.kind) ? excerptRank : 0
  const tagScore = tagRank(query, candidate.tags)
  const recencyRank =
    scope === 'global' && candidate.publishedAt
      ? Date.parse(candidate.publishedAt) || 0
      : 0

  return [
    titleRank,
    summaryRank,
    tagScore,
    evidenceRank,
    KIND_PRIORITY[candidate.kind],
    recencyRank,
    candidate.matchedFields.length,
  ]
}

function tupleToScore(tuple: RankTuple) {
  return (
    tuple[0] * 1_000_000_000_000 +
    tuple[1] * 10_000_000_000 +
    tuple[2] * 100_000_000 +
    tuple[3] * 1_000_000 +
    tuple[4] * 10_000 +
    tuple[5]
  )
}

function compareRankTuples(left: RankTuple, right: RankTuple) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return right[index] - left[index]
    }
  }
  return 0
}

function hasVisibleMatch(tuple: RankTuple) {
  return tuple[0] > 0 || tuple[1] > 0 || tuple[2] > 0 || tuple[3] > 0
}

export function rankSearchCandidates(query: string, candidates: SearchCandidate[], scope: SearchScope): SearchCandidate[] {
  const normalizedQuery = normalizeText(query)

  return candidates
    .map((candidate) => {
      const rank = buildRankTuple(normalizedQuery, candidate, scope)
      return {
        candidate: {
          ...candidate,
          score: tupleToScore(rank),
        },
        rank,
      }
    })
    .filter((entry) => hasVisibleMatch(entry.rank))
    .sort((left, right) => {
      const byRank = compareRankTuples(left.rank, right.rank)
      if (byRank !== 0) return byRank
      return left.candidate.title.localeCompare(right.candidate.title, 'zh-CN')
    })
    .map((entry) => entry.candidate)
}

function groupRankedResults(
  query: string,
  scope: SearchScope,
  ranked: SearchCandidate[],
  limit: number,
  facets: SearchResponse['facets'],
): SearchResponse {
  const limited = ranked.slice(0, limit)

  return {
    query,
    scope,
    totals: {
      all: ranked.length,
      topic: ranked.filter((item) => item.group === 'topic').length,
      node: ranked.filter((item) => item.group === 'node').length,
      paper: ranked.filter((item) => item.group === 'paper').length,
      evidence: ranked.filter((item) => item.group === 'evidence').length,
    },
    groups: GROUP_ORDER
      .map((group) => ({
        group,
        label: resolveGroupLabel(group),
        items: limited
          .filter((item) => item.group === group)
          .map(({ group: _group, score: _score, ...item }) => item),
      }))
      .filter((group) => group.items.length > 0),
    facets,
  }
}

async function loadTopicKeywordMap(topicIds: string[]) {
  if (topicIds.length === 0) return new Map<string, string[]>()

  const configs = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: topicIds.map((topicId) => `topic:${topicId}:keywords`),
      },
    },
  })

  return new Map(
    configs.map((config) => {
      const keywords = (() => {
        try {
          const parsed = JSON.parse(config.value)
          return Array.isArray(parsed)
            ? parsed
                .flatMap((item) =>
                  typeof item === 'string'
                    ? [item]
                    : item && typeof item === 'object'
                      ? [
                          String((item as Record<string, unknown>).zh ?? ''),
                          String((item as Record<string, unknown>).en ?? ''),
                        ]
                      : [],
                )
                .filter(Boolean)
            : []
        } catch {
          return [] as string[]
        }
      })()

      return [config.key.replace(/^topic:/u, '').replace(/:keywords$/u, ''), keywords]
    }),
  )
}

export async function searchResearchCorpus({
  q,
  scope,
  topicId,
  topics: topicFilters,
  types,
  stages,
  limit = 20,
  stageWindowMonths,
}: SearchOptions): Promise<SearchResponse> {
  const query = q.trim()
  if (!query) {
    return {
      query: '',
      scope,
      totals: { all: 0, topic: 0, node: 0, paper: 0, evidence: 0 },
      groups: [],
      facets: {
        stages: [],
        topics: [],
      },
    }
  }

  if (scope === 'topic' && !topicId) {
    throw new AppError(400, 'topicId is required when scope=topic.')
  }

  const allowedTypes = new Set(types ?? DEFAULT_TYPES)
  const resolvedStageWindowMonths = normalizeStageWindowMonths(stageWindowMonths)
  const topicWhere = scope === 'topic' ? { id: topicId } : undefined
  const paperWhere = scope === 'topic' ? { topicId } : undefined
  const nodeWhere = scope === 'topic' ? { topicId } : undefined

  const [fetchedTopics, fetchedPapers, fetchedNodes] = await Promise.all([
    prisma.topic.findMany({
      where: topicWhere,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.paper.findMany({
      where: paperWhere,
      include: {
        sections: { orderBy: { order: 'asc' } },
        figures: true,
        tables: true,
        formulas: true,
      },
      orderBy: { published: 'desc' },
    }),
    prisma.researchNode.findMany({
      where: nodeWhere,
      include: {
        topic: true,
        papers: {
          select: {
            paperId: true,
            paper: {
              select: {
                tags: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const visibleTopics = fetchedTopics.filter(
    (topic) =>
      !isRegressionSeedText(topic.nameZh) &&
      !isRegressionSeedText(topic.nameEn) &&
      !isRegressionSeedText(topic.summary) &&
      !isRegressionSeedText(topic.description),
  )
  const visibleTopicIds = new Set(visibleTopics.map((topic) => topic.id))
  const visiblePapers = fetchedPapers.filter((paper) => visibleTopicIds.has(paper.topicId))
  const visibleNodes = fetchedNodes.filter((node) => visibleTopicIds.has(node.topicId))

  const topicKeywordMap = await loadTopicKeywordMap(visibleTopics.map((topic) => topic.id))
  const topicTitleMap = new Map(visibleTopics.map((topic) => [topic.id, topic.nameZh]))
  const temporalStages = deriveTemporalStageBuckets({
    papers: visiblePapers.map((paper) => ({
      id: paper.id,
      published: paper.published,
    })),
    nodes: visibleNodes.map((node) => ({
      id: node.id,
      primaryPaperId: node.primaryPaperId,
      papers: node.papers,
      updatedAt: node.updatedAt,
      createdAt: node.createdAt,
    })),
    windowMonths: resolvedStageWindowMonths,
  })
  const nodeLocationsByPaperId = new Map<string, SearchNodeLocation[]>()

  for (const node of visibleNodes) {
    const stageLabel =
      temporalStages.nodeAssignments.get(node.id)?.label ?? resolveStageLabelFallback(node.stageIndex)
    const location = {
      nodeId: node.id,
      title: node.nodeLabel,
      stageIndex: node.stageIndex,
      stageLabel,
      route: nodeRoute(node.id),
    } satisfies SearchNodeLocation
    const linkedPaperIds = Array.from(
      new Set([
        node.primaryPaperId,
        ...node.papers.map((entry) => entry.paperId),
      ].filter((paperId): paperId is string => Boolean(paperId))),
    )

    for (const paperId of linkedPaperIds) {
      const current = nodeLocationsByPaperId.get(paperId) ?? []
      if (!current.some((item) => item.nodeId === location.nodeId)) {
        current.push(location)
      }
      nodeLocationsByPaperId.set(paperId, current)
    }
  }

  for (const locations of nodeLocationsByPaperId.values()) {
    locations.sort((left, right) =>
      left.stageIndex - right.stageIndex || left.title.localeCompare(right.title, 'zh-CN'),
    )
  }

  const normalizedQuery = normalizeText(query)
  const selectedTopicFilters = normalizeTopicFilterValues(
    scope === 'global'
      ? [...(topicFilters ?? []), ...(topicId ? [topicId] : [])]
      : undefined,
  )
  const selectedStageFilters = normalizeStageFilterValues(stages)
  const candidates: SearchCandidate[] = []

  if (allowedTypes.has('topic')) {
    for (const topic of visibleTopics) {
      const tags = topicKeywordMap.get(topic.id) ?? []
      candidates.push({
        id: topic.id,
        kind: 'topic',
        group: 'topic',
        title: topic.nameZh,
        subtitle: topic.focusLabel ?? topic.nameEn ?? 'Research Topic',
        excerpt: clipText(topic.summary || topic.description),
        route: `/topic/${topic.id}`,
        topicId: topic.id,
        topicTitle: topic.nameZh,
        tags,
        publishedAt: topic.updatedAt.toISOString(),
        timeLabel: formatTimeLabel(topic.updatedAt),
        quickActions: [{ id: 'open', label: 'open' }],
        matchedFields: collectMatchedFields(normalizedQuery, {
          title: topic.nameZh,
          subtitle: `${topic.nameEn ?? ''} ${topic.focusLabel ?? ''}`,
          excerpt: `${topic.summary ?? ''} ${topic.description ?? ''}`,
          tags: tags.join(' '),
        }),
        score: 0,
      })
    }
  }

  if (allowedTypes.has('node')) {
    for (const node of visibleNodes) {
      const tags = Array.from(
        new Set(
          node.papers.flatMap((entry) => parseJsonArray(entry.paper?.tags)),
        ),
      )
      const stageLabel =
        temporalStages.nodeAssignments.get(node.id)?.label ?? resolveStageLabelFallback(node.stageIndex)
      const locationLabel = buildLocationLabel([
        {
          nodeId: node.id,
          title: node.nodeLabel,
          stageIndex: node.stageIndex,
          stageLabel,
          route: nodeRoute(node.id),
        },
      ])
      const enrichedTags = [...new Set([...tags, node.nodeLabel, stageLabel, node.topic.nameZh])]
      const nodeCandidate: SearchCandidate = {
        id: node.id,
        kind: 'node',
        group: 'node',
        title: node.nodeLabel,
        subtitle: node.nodeSubtitle ?? `${node.topic.nameZh} / 第 ${node.stageIndex} 阶段`,
        excerpt: clipText(node.nodeSummary || node.nodeExplanation),
        route: nodeRoute(node.id),
        anchorId: `node:${node.id}`,
        topicId: node.topicId,
        topicTitle: node.topic.nameZh,
        tags: enrichedTags,
        publishedAt: node.updatedAt.toISOString(),
        stageLabel: `阶段 ${node.stageIndex}`,
        timeLabel: formatTimeLabel(node.updatedAt),
        nodeId: node.id,
        nodeTitle: node.nodeLabel,
        nodeRoute: nodeRoute(node.id),
        locationLabel,
        relatedNodes: [
          {
            nodeId: node.id,
            title: node.nodeLabel,
            stageIndex: node.stageIndex,
            stageLabel,
            route: nodeRoute(node.id),
          },
        ],
        quickActions: [
          { id: 'open', label: 'open' },
          { id: 'add-context', label: 'add-context' },
          { id: 'follow-up', label: 'follow-up' },
        ],
        matchedFields: collectMatchedFields(normalizedQuery, {
          title: node.nodeLabel,
          subtitle: `${node.nodeSubtitle ?? ''} ${node.topic.nameZh}`,
          excerpt: `${node.nodeSummary ?? ''} ${node.nodeExplanation ?? ''}`,
          tags: tags.join(' '),
        }),
        score: 0,
      }
      nodeCandidate.subtitle = node.nodeSubtitle ?? `${node.topic.nameZh} / ${stageLabel}`
      nodeCandidate.stageLabel = stageLabel
      nodeCandidate.matchedFields = collectMatchedFields(normalizedQuery, {
        title: node.nodeLabel,
        subtitle: `${node.nodeSubtitle ?? ''} ${node.topic.nameZh} ${locationLabel ?? ''}`,
        excerpt: `${node.nodeSummary ?? ''} ${node.nodeExplanation ?? ''}`,
        tags: enrichedTags.join(' '),
      })
      candidates.push(nodeCandidate)
    }
  }

  for (const paper of visiblePapers) {
    const tags = parseJsonArray(paper.tags)
    const authors = parseAuthors(paper.authors)
    const links = resolvePaperSourceLinks({
      arxivUrl: paper.arxivUrl,
      pdfUrl: paper.pdfUrl,
      pdfPath: paper.pdfPath,
    })
    const sourceTokens = extractSourceSearchTokens([
      paper.arxivUrl,
      paper.pdfUrl,
      paper.pdfPath,
      links.originalUrl,
      links.pdfUrl,
    ])
    const paperLocations = nodeLocationsByPaperId.get(paper.id) ?? []
    const primaryLocation = paperLocations[0]
    const paperStageLabel =
      primaryLocation?.stageLabel ??
      temporalStages.paperAssignments.get(paper.id)?.label
    const locationLabel = buildLocationLabel(paperLocations)
    const locationTags = paperLocations.flatMap((location) =>
      [location.title, location.stageLabel].filter(Boolean) as string[],
    )
    const enrichedTags = [...new Set([...tags, ...locationTags, ...authors, ...sourceTokens])]

    if (allowedTypes.has('paper')) {
      candidates.push({
        id: paper.id,
        kind: 'paper',
        group: 'paper',
        title: paper.titleZh || paper.title,
        subtitle: paper.titleEn ?? paper.title,
        excerpt: clipText(paper.summary || paper.explanation),
        route: `/paper/${paper.id}`,
        anchorId: `paper:${paper.id}`,
        topicId: paper.topicId,
        topicTitle: topicTitleMap.get(paper.topicId),
        tags: enrichedTags,
        publishedAt: paper.published.toISOString(),
        stageLabel: paperStageLabel,
        timeLabel: formatTimeLabel(paper.published),
        nodeId: primaryLocation?.nodeId,
        nodeTitle: primaryLocation?.title,
        nodeRoute: primaryLocation?.route,
        locationLabel,
        relatedNodes: paperLocations,
        quickActions: [
          { id: 'open', label: 'open' },
          { id: 'add-context', label: 'add-context' },
          { id: 'follow-up', label: 'follow-up' },
        ],
        matchedFields: collectMatchedFields(normalizedQuery, {
          title: `${paper.titleZh || ''} ${paper.title}`,
          subtitle: `${paper.titleEn ?? ''} ${authors.join(' ')} ${locationLabel ?? ''}`,
          excerpt: `${paper.summary ?? ''} ${paper.explanation ?? ''}`,
          tags: enrichedTags.join(' '),
          source: sourceTokens.join(' '),
        }),
        score: 0,
      })
    }

    if (allowedTypes.has('section')) {
      for (const section of paper.sections) {
        candidates.push({
          id: section.id,
          kind: 'section',
          group: 'evidence',
          title: section.editorialTitle || section.sourceSectionTitle,
          subtitle: paper.titleZh || paper.title,
          excerpt: clipText(section.paragraphs),
          route: sectionRoute(paper.id, section.id),
          anchorId: `section:${section.id}`,
          topicId: paper.topicId,
          topicTitle: topicTitleMap.get(paper.topicId),
          tags: enrichedTags,
          publishedAt: paper.published.toISOString(),
          stageLabel: paperStageLabel,
          timeLabel: formatTimeLabel(paper.published),
          nodeId: primaryLocation?.nodeId,
          nodeTitle: primaryLocation?.title,
          nodeRoute: primaryLocation?.route,
          locationLabel,
          relatedNodes: paperLocations,
          quickActions: [
            { id: 'open', label: 'open' },
            { id: 'add-context', label: 'add-context' },
            { id: 'follow-up', label: 'follow-up' },
          ],
          matchedFields: collectMatchedFields(normalizedQuery, {
            title: `${section.editorialTitle || ''} ${section.sourceSectionTitle}`,
            subtitle: `${paper.titleZh || paper.title} ${locationLabel ?? ''} ${authors.join(' ')}`,
            excerpt: section.paragraphs,
            tags: enrichedTags.join(' '),
            source: sourceTokens.join(' '),
          }),
          score: 0,
        })
      }
    }

    if (allowedTypes.has('figure')) {
      for (const figure of paper.figures) {
        candidates.push({
          id: figure.id,
          kind: 'figure',
          group: 'evidence',
          title: `Figure ${figure.number}`,
          subtitle: paper.titleZh || paper.title,
          excerpt: clipText(`${figure.caption} ${figure.analysis ?? ''}`),
          route: evidenceRoute(paper.id, 'figure', figure.id),
          anchorId: `figure:${figure.id}`,
          topicId: paper.topicId,
          topicTitle: topicTitleMap.get(paper.topicId),
          tags: enrichedTags,
          publishedAt: paper.published.toISOString(),
          stageLabel: paperStageLabel,
          timeLabel: formatTimeLabel(paper.published),
          nodeId: primaryLocation?.nodeId,
          nodeTitle: primaryLocation?.title,
          nodeRoute: primaryLocation?.route,
          locationLabel,
          relatedNodes: paperLocations,
          quickActions: [
            { id: 'open', label: 'open' },
            { id: 'add-context', label: 'add-context' },
            { id: 'follow-up', label: 'follow-up' },
          ],
          matchedFields: collectMatchedFields(normalizedQuery, {
            title: `${figure.number} ${figure.caption}`,
            subtitle: `${paper.titleZh || paper.title} ${locationLabel ?? ''} ${authors.join(' ')}`,
            excerpt: `${figure.caption} ${figure.analysis ?? ''}`,
            tags: enrichedTags.join(' '),
            source: sourceTokens.join(' '),
          }),
          score: 0,
        })
      }
    }

    if (allowedTypes.has('table')) {
      for (const table of paper.tables) {
        candidates.push({
          id: table.id,
          kind: 'table',
          group: 'evidence',
          title: `Table ${table.number}`,
          subtitle: paper.titleZh || paper.title,
          excerpt: clipText(`${table.caption} ${table.rawText}`),
          route: evidenceRoute(paper.id, 'table', table.id),
          anchorId: `table:${table.id}`,
          topicId: paper.topicId,
          topicTitle: topicTitleMap.get(paper.topicId),
          tags: enrichedTags,
          publishedAt: paper.published.toISOString(),
          stageLabel: paperStageLabel,
          timeLabel: formatTimeLabel(paper.published),
          nodeId: primaryLocation?.nodeId,
          nodeTitle: primaryLocation?.title,
          nodeRoute: primaryLocation?.route,
          locationLabel,
          relatedNodes: paperLocations,
          quickActions: [
            { id: 'open', label: 'open' },
            { id: 'add-context', label: 'add-context' },
            { id: 'follow-up', label: 'follow-up' },
          ],
          matchedFields: collectMatchedFields(normalizedQuery, {
            title: `${table.number} ${table.caption}`,
            subtitle: `${paper.titleZh || paper.title} ${locationLabel ?? ''} ${authors.join(' ')}`,
            excerpt: `${table.caption} ${table.rawText}`,
            tags: enrichedTags.join(' '),
            source: sourceTokens.join(' '),
          }),
          score: 0,
        })
      }
    }

    if (allowedTypes.has('formula')) {
      for (const formula of paper.formulas) {
        candidates.push({
          id: formula.id,
          kind: 'formula',
          group: 'evidence',
          title: `Formula ${formula.number}`,
          subtitle: paper.titleZh || paper.title,
          excerpt: clipText(`${formula.rawText} ${formula.latex}`),
          route: evidenceRoute(paper.id, 'formula', formula.id),
          anchorId: `formula:${formula.id}`,
          topicId: paper.topicId,
          topicTitle: topicTitleMap.get(paper.topicId),
          tags: enrichedTags,
          publishedAt: paper.published.toISOString(),
          stageLabel: paperStageLabel,
          timeLabel: formatTimeLabel(paper.published),
          nodeId: primaryLocation?.nodeId,
          nodeTitle: primaryLocation?.title,
          nodeRoute: primaryLocation?.route,
          locationLabel,
          relatedNodes: paperLocations,
          quickActions: [
            { id: 'open', label: 'open' },
            { id: 'add-context', label: 'add-context' },
            { id: 'follow-up', label: 'follow-up' },
          ],
          matchedFields: collectMatchedFields(normalizedQuery, {
            title: `${formula.number} ${formula.rawText}`,
            subtitle: `${paper.titleZh || paper.title} ${locationLabel ?? ''} ${authors.join(' ')}`,
            excerpt: `${formula.rawText} ${formula.latex}`,
            tags: enrichedTags.join(' '),
            source: sourceTokens.join(' '),
          }),
          score: 0,
        })
      }
    }
  }

  const ranked = rankSearchCandidates(query, candidates, scope)
  const facets = {
    stages: buildStageFacets(ranked),
    topics: buildTopicFacets(ranked),
  }
  const filtered =
    selectedTopicFilters.length > 0 || selectedStageFilters.length > 0
      ? ranked.filter(
          (candidate) =>
            matchesTopicFilters(candidate, selectedTopicFilters) &&
            matchesStageFilters(candidate, selectedStageFilters),
        )
      : ranked

  return groupRankedResults(query, scope, filtered, limit, facets)
}
