import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Keyboard,
  Loader2,
  MessageSquarePlus,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useTopicRegistry } from '@/hooks'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { ContextPill, SearchResponse, SearchResultItem } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { cn } from '@/utils/cn'
import { resolvePrimaryReadingRouteForPaper } from '@/utils/readingRoutes'
import { isRegressionSeedTopic } from '@/utils/topicPresentation'
import {
  TOPIC_CONTEXT_ADD_EVENT,
  TOPIC_QUESTION_SEED_EVENT,
  queueTopicContext,
} from '@/utils/workbench-events'

type GlobalSearchProps = {
  open: boolean
  onClose: () => void
}

type QuickActionId = 'open' | 'add-context' | 'follow-up'

const searchKinds = ['topic', 'node', 'paper', 'section', 'figure', 'table', 'formula'] as const
const recentSearchStorageKey = 'global-search:recent'

function readRecentSearches() {
  if (typeof window === 'undefined') return [] as string[]

  try {
    const raw = window.localStorage.getItem(recentSearchStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : []
  } catch {
    return []
  }
}

function buildContextPill(item: SearchResultItem): ContextPill {
  return {
    id: `search:${item.kind}:${item.id}`,
    kind: 'search',
    label: item.title,
    description: item.excerpt,
    route: item.route,
    anchorId: item.anchorId,
  }
}

function getOwningTopicId(item: SearchResultItem) {
  if (item.kind === 'topic') return item.id
  return item.topicId ?? ''
}

function buildTopicAnchorRoute(item: SearchResultItem) {
  const topicId = getOwningTopicId(item)
  if (!topicId) return item.route
  return item.anchorId
    ? `/topic/${topicId}?anchor=${encodeURIComponent(item.anchorId)}`
    : `/topic/${topicId}`
}

function buildFollowUpPrompt(
  item: SearchResultItem,
  translate: (key: string, fallback: string) => string,
) {
  return translate(
    'topic.followUpPromptTemplate',
    'Place "{title}" back into the current topic mainline: what did it advance, what evidence supports it, and what remains unresolved?',
  ).replace('{title}', item.title)
}

function searchItemKey(item: SearchResultItem) {
  return `${item.kind}:${item.id}:${item.anchorId ?? ''}`
}

function formatStageLabel(stageLabel: string | undefined, stageIndex: number, fallback: string) {
  return stageLabel ?? fallback.replace('{stage}', String(stageIndex))
}

function collectStageLabels(item: SearchResultItem) {
  const labels = new Set<string>()

  if (item.stageLabel) {
    labels.add(item.stageLabel)
  }

  for (const location of item.relatedNodes ?? []) {
    if (location.stageLabel) {
      labels.add(location.stageLabel)
    }
  }

  return Array.from(labels)
}

function buildStageFacetsFromGroups(groups: SearchResponse['groups']) {
  const facets = new Map<string, { value: string; label: string; count: number }>()

  for (const group of groups) {
    for (const item of group.items) {
      for (const label of collectStageLabels(item)) {
        const current = facets.get(label)
        if (current) {
          current.count += 1
          continue
        }

        facets.set(label, {
          value: label,
          label,
          count: 1,
        })
      }
    }
  }

  return Array.from(facets.values()).sort((left, right) => left.label.localeCompare(right.label))
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeTopics } = useTopicRegistry()
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const searchText = useCallback(
    (id: string, fallback: string) => copy(id, t(id, fallback)),
    [copy, t],
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [selectedKinds, setSelectedKinds] = useState<string[]>([])
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches())
  const activeStageWindowMonths = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const value = Number(params.get('stageMonths'))
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null
  }, [location.search])

  const kindLabels = useMemo(
    () => ({
      topic: t('search.filterTopics', 'Topics'),
      node: t('search.filterNodes', 'Nodes'),
      paper: t('search.filterPapers', 'Papers'),
      section: t('workbench.searchKindSection', 'Section'),
      figure: t('workbench.searchKindFigure', 'Figure'),
      table: t('workbench.searchKindTable', 'Table'),
      formula: t('workbench.searchKindFormula', 'Formula'),
    }) satisfies Record<(typeof searchKinds)[number], string>,
    [t],
  )
  const groupLabels = useMemo<Record<'topic' | 'node' | 'paper' | 'evidence', string>>(
    () => ({
      topic: t('workbench.searchGroupTopic', 'Topics'),
      node: t('workbench.searchGroupNode', 'Nodes'),
      paper: t('workbench.searchGroupPaper', 'Papers'),
      evidence: t('workbench.searchGroupEvidence', 'Evidence'),
    }),
    [t],
  )

  const matchFieldLabels = useMemo<Record<string, string>>(
    () => ({
      title: t('workbench.searchMatchTitle', 'Title'),
      subtitle: t('workbench.searchMatchSubtitle', 'Subtitle'),
      excerpt: t('workbench.searchMatchExcerpt', 'Excerpt'),
      tags: t('workbench.searchMatchTags', 'Tags'),
      source: t('workbench.searchMatchSource', 'Source'),
    }),
    [t],
  )
  const stageLabelFallback = useMemo(
    () => t('workbench.nodeStageLabel', 'Stage {stage}'),
    [t],
  )

  const hintItems = useMemo(
    () => [
      searchText(
        'search.hintLocate',
        'Search sections, figures, tables, and formulas to jump directly to the exact anchor in the reading surface.',
      ),
      searchText(
        'search.hintContext',
        'Add a hit to the right workbench and keep asking questions without leaving your current reading position.',
      ),
      searchText(
        'search.hintFilter',
        'Filter by type first, then narrow by topic when you want to inspect one thread inside a larger branching map.',
      ),
    ],
    [searchText],
  )

  const visibleGroups = useMemo(() => {
    if (!result) return []

    return result.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.kind === 'topic') {
            return !isRegressionSeedTopic({
              nameZh: item.title,
              summary: `${item.subtitle ?? ''} ${item.excerpt ?? ''}`,
            })
          }

          if (item.topicTitle) {
            return !isRegressionSeedTopic({
              nameZh: item.topicTitle,
              summary: item.excerpt,
            })
          }

          return true
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [result])

  const topicFilters = useMemo(() => {
    if (result?.facets?.topics && result.facets.topics.length > 0) {
      return result.facets.topics.map((topic) => ({
        id: topic.value,
        title: topic.label,
      }))
    }

    const options = new Map<string, { id: string; title: string; count: number }>()

    for (const group of visibleGroups) {
      for (const item of group.items) {
        if (item.kind === 'topic') {
          const key = item.title.trim().toLowerCase()
          const existing = options.get(key)
          options.set(key, {
            id: existing?.id ?? item.id,
            title: existing?.title ?? item.title,
            count: (existing?.count ?? 0) + 1,
          })
          continue
        }

        if (item.topicId && item.topicTitle) {
          const key = item.topicTitle.trim().toLowerCase()
          const existing = options.get(key)
          options.set(key, {
            id: existing?.id ?? item.topicId,
            title: existing?.title ?? item.topicTitle,
            count: (existing?.count ?? 0) + 1,
          })
        }
      }
    }

    return Array.from(options.values())
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
      .map(({ id, title }) => ({ id, title }))
  }, [result?.facets?.topics, visibleGroups])

  const stageFacets = useMemo(
    () =>
      result?.facets?.stages && result.facets.stages.length > 0
        ? result.facets.stages
        : buildStageFacetsFromGroups(visibleGroups),
    [result?.facets?.stages, visibleGroups],
  )

  const filteredGroups = useMemo(() => visibleGroups, [visibleGroups])

  const flatItems = useMemo(
    () => filteredGroups.flatMap((group) => group.items),
    [filteredGroups],
  )

  const visibleTotals = useMemo(
    () =>
      filteredGroups.reduce(
        (totals, group) => {
          totals.all += group.items.length
          if (group.group === 'topic') totals.topic += group.items.length
          if (group.group === 'node') totals.node += group.items.length
          if (group.group === 'paper') totals.paper += group.items.length
          if (group.group === 'evidence') totals.evidence += group.items.length
          return totals
        },
        { all: 0, topic: 0, node: 0, paper: 0, evidence: 0 },
      ),
    [filteredGroups],
  )

  const starterQueries = useMemo(() => {
    const liveTopics = activeTopics
      .filter((topic) => !isRegressionSeedTopic(topic))
      .flatMap((topic) => [
        topic.nameZh,
        topic.focusLabel,
        topic.originPaper?.titleZh,
        topic.originPaper?.title,
      ])
      .filter((value): value is string => Boolean(value && value.trim()))
      .slice(0, 6)

    const fallbacks = [
      t('search.starterAutonomousDriving', 'autonomous driving'),
      t('search.starterWorldModel', 'world model'),
      t('search.starterEmbodiedAI', 'embodied intelligence'),
      t('search.starterScientificReading', 'scientific reading'),
    ]

    return [...new Set([...liveTopics, ...fallbacks])].slice(0, 6)
  }, [activeTopics, t])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    setSelectedIndex(-1)
  }, [query, selectedKinds, selectedStages, selectedTopicId])

  useEffect(() => {
    if (!selectedTopicId) return
    if (topicFilters.some((topic) => topic.id === selectedTopicId)) return
    setSelectedTopicId('')
  }, [selectedTopicId, topicFilters])

  useEffect(() => {
    setSelectedStages((current) => {
      if (current.length === 0) return current
      const validStages = new Set(stageFacets.map((facet) => facet.value))
      const next = current.filter((item) => validStages.has(item))
      return next.length === current.length ? current : next
    })
  }, [stageFacets])

  useEffect(() => {
    if (selectedIndex < flatItems.length) return
    setSelectedIndex(flatItems.length - 1)
  }, [flatItems.length, selectedIndex])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || !open) {
      setResult(null)
      if (!trimmed) {
        setSelectedStages((current) => (current.length === 0 ? current : []))
      }
      return
    }

    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const types = selectedKinds.length > 0 ? `&types=${selectedKinds.join(',')}` : ''
        const topics = selectedTopicId ? `&topics=${encodeURIComponent(selectedTopicId)}` : ''
        const stages =
          selectedStages.length > 0
            ? `&stages=${selectedStages.map((stage) => encodeURIComponent(stage)).join(',')}`
            : ''
        const stageWindowParam = activeStageWindowMonths ? `&stageMonths=${activeStageWindowMonths}` : ''
        const payload = await apiGet<SearchResponse>(
          `/api/search?q=${encodeURIComponent(trimmed)}&scope=global${types}${topics}${stages}${stageWindowParam}&limit=28`,
        )
        setResult(payload)
      } catch {
        setResult(null)
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => window.clearTimeout(timer)
  }, [activeStageWindowMonths, open, query, selectedKinds, selectedStages, selectedTopicId])

  useEffect(() => {
    if (selectedIndex < 0) return
    const element = resultsRef.current?.querySelector(`[data-idx="${selectedIndex}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  function rememberQuery(value: string) {
    const trimmed = value.trim()
    if (trimmed.length < 2 || typeof window === 'undefined') return

    const next = [trimmed, ...recentSearches.filter((item) => item !== trimmed)].slice(0, 8)
    setRecentSearches(next)
    window.localStorage.setItem(recentSearchStorageKey, JSON.stringify(next))
  }

  function scopedRoute(route: string) {
    if (!activeStageWindowMonths) return route

    const [pathname, search = ''] = route.split('?')
    const params = new URLSearchParams(search)
    params.set('stageMonths', String(activeStageWindowMonths))
    const nextSearch = params.toString()
    return nextSearch ? `${pathname}?${nextSearch}` : pathname
  }

  function handleOpen(item: SearchResultItem) {
    rememberQuery(query)
    const resolvedRoute =
      item.kind === 'paper'
        ? resolvePrimaryReadingRouteForPaper({
            paperId: item.id,
            route: item.route,
            anchorId: item.anchorId,
            nodeRoute: item.nodeRoute,
            relatedNodes: item.relatedNodes,
            topicId: item.topicId,
          })
        : item.route
    const targetRoute = scopedRoute(resolvedRoute)

    navigate(targetRoute)
    onClose()
  }

  function handleQuickAction(item: SearchResultItem, action: QuickActionId) {
    if (action === 'open') {
      handleOpen(item)
      return
    }

    const topicId = getOwningTopicId(item)
    if (!topicId) {
      handleOpen(item)
      return
    }

    const pill = buildContextPill(item)
    const onSameTopicPage =
      typeof window !== 'undefined' && window.location.pathname === `/topic/${topicId}`
    const followUpPrompt = buildFollowUpPrompt(item, t)

    rememberQuery(query)

    if (onSameTopicPage) {
      window.dispatchEvent(new CustomEvent(TOPIC_CONTEXT_ADD_EVENT, { detail: pill }))
      if (action === 'follow-up') {
        window.dispatchEvent(
          new CustomEvent(TOPIC_QUESTION_SEED_EVENT, { detail: followUpPrompt }),
        )
      }
      if (item.anchorId) {
        navigate(`/topic/${topicId}?anchor=${encodeURIComponent(item.anchorId)}`)
      }
      onClose()
      return
    }

    queueTopicContext({
      topicId,
      pill,
      question: action === 'follow-up' ? followUpPrompt : undefined,
    })

    navigate(buildTopicAnchorRoute(item))
    onClose()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) => Math.min(current + 1, flatItems.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault()
      const target = flatItems[selectedIndex]
      if (target) handleOpen(target)
    }
  }

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-white/84 backdrop-blur-sm"
        onClick={onClose}
        aria-label={searchText('search.close', 'Close Search')}
      />

      <div
        data-testid="global-search"
        className="fixed inset-x-4 top-4 z-[90] mx-auto flex max-h-[min(860px,calc(100vh-2rem))] w-[min(92vw,72rem)] flex-col overflow-hidden rounded-[34px] border border-black/8 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]"
      >
        <div className="border-b border-black/8 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.24em] text-black/38">
                {searchText('search.title', 'Global Search')}
              </div>
              <div className="mt-2 max-w-[760px] text-[13px] leading-6 text-black/52">
                {searchText(
                  'search.description',
                  'Search topics, nodes, papers, sections, figures, and formulas in one place, then open them, jump back into a topic, or add them to the workbench.',
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/8 p-2 text-black/52 transition hover:border-black/14 hover:text-black"
              aria-label={searchText('search.close', 'Close Search')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-3">
            <Search className="h-4 w-4 text-black/42" />
            <input
              data-testid="global-search-input"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchText(
                'search.placeholder',
                'Search topics, nodes, papers, sections, figures, and formulas',
              )}
              className="w-full bg-transparent text-sm text-black outline-none placeholder:text-black/32"
            />
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-black/42" /> : null}
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  setSelectedTopicId('')
                  setSelectedStages([])
                }}
                className="rounded-full p-1 text-black/38 transition hover:bg-white hover:text-black"
                aria-label={searchText('search.clear', 'Clear Search')}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {searchKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() =>
                  setSelectedKinds((current) =>
                    current.includes(kind)
                      ? current.filter((item) => item !== kind)
                      : [...current, kind],
                  )
                }
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] transition',
                  selectedKinds.includes(kind)
                    ? 'border-[#f59e0b]/35 bg-[var(--surface-accent)] text-[var(--accent-ink)]'
                    : 'border-black/8 bg-white text-black/58 hover:border-black/14 hover:text-black',
                )}
              >
                {kindLabels[kind]}
              </button>
            ))}
          </div>

          {topicFilters.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedTopicId('')}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[11px] transition',
                  !selectedTopicId ? 'bg-black text-white' : 'bg-[var(--surface-soft)] text-black/58',
                )}
              >
                {searchText('search.allTopics', 'All Topics')}
              </button>
              {topicFilters.slice(0, 6).map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  data-testid={`global-search-topic-filter-${topic.id}`}
                  onClick={() => setSelectedTopicId(topic.id)}
                  className={cn(
                    'max-w-[11rem] truncate rounded-full px-3 py-1.5 text-[11px] transition',
                    selectedTopicId === topic.id ? 'bg-black text-white' : 'bg-[var(--surface-soft)] text-black/58',
                  )}
                  title={topic.title}
                >
                  {topic.title}
                </button>
              ))}
            </div>
          ) : null}

          {query.trim() && stageFacets.length > 0 ? (
            <div
              data-testid="global-search-stage-filters"
              className="mt-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-3 text-[11px] text-black/42">
                <span>
                  {searchText('search.stageFilterLabel', 'Filter by stage')}
                </span>
                {selectedStages.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedStages([])}
                    className="text-black/48 transition hover:text-black"
                  >
                    {searchText('search.clearStageFilter', 'Clear')}
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {stageFacets.map((facet, index) => {
                  const active = selectedStages.includes(facet.value)

                  return (
                    <button
                      key={facet.value}
                      type="button"
                      data-testid={`global-search-stage-filter-${index}`}
                      onClick={() =>
                        setSelectedStages((current) =>
                          current.includes(facet.value)
                            ? current.filter((item) => item !== facet.value)
                            : [...current, facet.value],
                        )
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[11px] transition',
                        active
                          ? 'border-[#7d1938]/28 bg-[#f6ecef] text-[#7d1938]'
                          : 'border-black/8 bg-white text-black/58 hover:border-black/14 hover:text-black',
                      )}
                    >
                      {facet.label} · {facet.count}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-r border-black/8 bg-[var(--surface-soft)] px-5 py-5">
            <div className="space-y-5">
              <section>
                <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
                  {searchText('search.recentTitle', 'Recent Searches')}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentSearches.length > 0 ? (
                    recentSearches.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setQuery(item)}
                        className="rounded-full bg-white px-3 py-2 text-[11px] text-black/62 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:text-black"
                      >
                        {item}
                      </button>
                    ))
                  ) : (
                    <div className="text-[12px] leading-6 text-black/46">
                      {searchText(
                        'search.recentEmpty',
                        'Your recent searches appear here so you can return to earlier research threads.',
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
                  {searchText('search.recommendTitle', 'Suggested Starting Points')}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {starterQueries.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setQuery(item)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] text-black/62 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:text-black"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {item}
                    </button>
                  ))}
                </div>
              </section>

              {result ? (
                <section className="rounded-[24px] bg-white px-4 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
                    {searchText('search.resultsLabel', 'Search Results')}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <CountChip label={searchText('search.resultsAll', 'All')} value={visibleTotals.all} />
                    <CountChip label={t('search.filterTopics', 'Topics')} value={visibleTotals.topic} />
                    <CountChip label={t('search.filterNodes', 'Nodes')} value={visibleTotals.node} />
                    <CountChip label={t('search.filterPapers', 'Papers')} value={visibleTotals.paper} />
                    <CountChip label={searchText('search.resultsEvidence', 'Evidence')} value={visibleTotals.evidence} />
                  </div>
                </section>
              ) : null}

              <section className="rounded-[24px] bg-white px-4 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-2 text-[12px] text-black/56">
                  <Keyboard className="h-4 w-4" />
                  <span>Enter</span>
                  <ArrowDown className="h-3.5 w-3.5" />
                  <ArrowUp className="h-3.5 w-3.5" />
                </div>
                <p className="mt-3 text-[12px] leading-6 text-black/52">
                  {searchText(
                    'search.keyboardHint',
                    'Press Enter to open a result, and use the arrow keys to move through the list.',
                  )}
                </p>
              </section>

              <section className="rounded-[24px] bg-white px-4 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
                  {searchText('search.title', 'Global Search')}
                </div>
                <div className="mt-3 space-y-3 text-[12px] leading-6 text-black/56">
                  {hintItems.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </section>
            </div>
          </aside>

          <div ref={resultsRef} className="min-h-0 overflow-y-auto px-5 py-5">
            {!query.trim() ? (
              <div className="text-[14px] leading-7 text-black/56">
                {searchText(
                  'search.idle',
                  'Once you start typing, grouped results for topics, nodes, papers, and evidence appear here.',
                )}
              </div>
            ) : null}

            {query.trim() && result ? (
              <div className="mb-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-black/36">
                <span>{searchText('search.resultsLabel', 'Search Results')}</span>
                <span>{flatItems.length}</span>
              </div>
            ) : null}

            {query.trim() && result && flatItems.length === 0 ? (
              <div className="text-[14px] leading-7 text-black/56">
                {searchText(
                  'search.empty',
                  'No matching results yet. Try another keyword or narrow the search types first.',
                )}
              </div>
            ) : null}

            <div className="space-y-6">
              {filteredGroups.map((group) => (
                <section
                  key={group.group}
                  data-testid={`global-search-group-${group.group}`}
                  className="space-y-3"
                >
                  <div className="text-[11px] uppercase tracking-[0.24em] text-black/38">
                    {groupLabels[group.group] ?? group.label}
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const absoluteIndex = flatItems.findIndex(
                        (candidate) => searchItemKey(candidate) === searchItemKey(item),
                      )

                      return (
                        <article
                          key={`${group.group}-${item.id}-${item.anchorId ?? 'root'}`}
                          data-idx={absoluteIndex}
                          data-testid={`global-search-result-${item.kind}`}
                          onClick={() => handleQuickAction(item, 'open')}
                          className={cn(
                            'cursor-pointer rounded-[24px] border border-black/8 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)] transition',
                            selectedIndex === absoluteIndex &&
                              'border-[#f59e0b]/35 bg-[var(--surface-accent)]',
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                                {[kindLabels[item.kind], item.stageLabel, item.timeLabel]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                              <h3 className="mt-1 text-[16px] font-semibold leading-6 text-black">
                                {item.title}
                              </h3>
                              <div className="mt-1 text-[12px] leading-6 text-black/46">
                                {[item.subtitle, item.topicTitle].filter(Boolean).join(' · ')}
                              </div>
                              {item.relatedNodes && item.relatedNodes.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {item.relatedNodes.slice(0, 3).map((location) => (
                                    <button
                                      key={`${item.id}-${location.nodeId}`}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        rememberQuery(query)
                                        navigate(scopedRoute(location.route))
                                        onClose()
                                      }}
                                      className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/54"
                                    >
                                      {[
                                        formatStageLabel(
                                          location.stageLabel,
                                          location.stageIndex,
                                          stageLabelFallback,
                                        ),
                                        location.title,
                                      ].join(' · ')}
                                    </button>
                                  ))}
                                  {item.relatedNodes.length > 3 ? (
                                    <span className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/44">
                                      +{item.relatedNodes.length - 3}
                                    </span>
                                  ) : null}
                                </div>
                              ) : item.locationLabel ? (
                                <div className="mt-2 text-[11px] leading-5 text-black/52">
                                  {item.locationLabel}
                                </div>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleQuickAction(item, 'add-context')
                              }}
                              className="rounded-full border border-black/8 bg-[var(--surface-soft)] p-2 text-black/64 transition hover:border-black/16 hover:text-black"
                              aria-label={`${searchText('search.contextAction', 'Add Context')} ${item.title}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <p className="mt-3 text-[14px] leading-7 text-black/58">{item.excerpt}</p>

                          {item.matchedFields.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.matchedFields.slice(0, 4).map((field) => (
                                <span
                                  key={field}
                                  className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/52"
                                >
                                  {matchFieldLabels[field] ?? field}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleQuickAction(item, 'open')
                              }}
                              className="inline-flex items-center gap-1.5 text-black/72 transition hover:text-black"
                            >
                              {searchText('search.openAction', 'Open Result')}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>

                            {getOwningTopicId(item) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleQuickAction(item, 'add-context')
                                  }}
                                  className="text-black/56 transition hover:text-black"
                                >
                                  {searchText('search.contextAction', 'Add Context')}
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleQuickAction(item, 'follow-up')
                                  }}
                                  className="inline-flex items-center gap-1.5 text-black/56 transition hover:text-black"
                                >
                                  {searchText('search.followUpAction', 'Ask Follow-Up')}
                                  <MessageSquarePlus className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-soft)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">{label}</div>
      <div className="mt-1 text-[16px] font-semibold text-black">{value}</div>
    </div>
  )
}
