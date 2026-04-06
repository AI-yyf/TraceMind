import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Loader2, MessageSquarePlus, Plus, Search } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { SearchResponse, SearchResultItem } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { cn } from '@/utils/cn'

const searchKinds = ['topic', 'node', 'paper', 'section', 'figure', 'table', 'formula'] as const

const recentKey = (topicId: string) => `topic-search:recent:${topicId}`

function formatStageLabel(stageLabel: string | undefined, stageIndex: number, fallback: string) {
  return stageLabel ?? fallback.replace('{stage}', String(stageIndex))
}

function readRecentQueries(topicId: string) {
  if (typeof window === 'undefined') return [] as string[]

  try {
    const raw = window.localStorage.getItem(recentKey(topicId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : []
  } catch {
    return []
  }
}

function rememberRecentQuery(topicId: string, query: string, current: string[]) {
  const trimmed = query.trim()
  if (trimmed.length < 2 || typeof window === 'undefined') return current
  const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 8)
  window.localStorage.setItem(recentKey(topicId), JSON.stringify(next))
  return next
}

export function SearchPanel({
  topicId,
  stageWindowMonths,
  onOpenResult,
  onAddContext,
  onAskAboutResult,
}: {
  topicId: string
  stageWindowMonths?: number
  onOpenResult: (item: SearchResultItem) => void
  onAddContext: (item: SearchResultItem) => void
  onAskAboutResult: (item: SearchResultItem) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const searchText = useCallback(
    (copyId: string, key: string, fallback: string) =>
      copy(copyId, t(key, fallback)),
    [copy, t],
  )
  const [query, setQuery] = useState('')
  const [selectedKinds, setSelectedKinds] = useState<string[]>([])
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [recentQueries, setRecentQueries] = useState<string[]>(() => readRecentQueries(topicId))
  const kindLabels = useMemo(
    () => ({
      topic: t('workbench.searchKindTopic', 'Topic'),
      node: t('workbench.searchKindNode', 'Node'),
      paper: t('workbench.searchKindPaper', 'Paper'),
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
  const helperLines = useMemo(
    () => [
      searchText(
        'search.hintLocate',
        'workbench.searchHintLocate',
        'Search sections, figures, tables, and formulas to jump directly to the right anchor.',
      ),
      searchText(
        'search.hintContext',
        'workbench.searchHintContext',
        'Any hit can be added to the current chat context immediately.',
      ),
    ],
    [searchText],
  )

  const flatItems = useMemo(
    () => result?.groups.flatMap((group) => group.items) ?? [],
    [result],
  )
  const stageFacets = useMemo(
    () => result?.facets?.stages ?? [],
    [result],
  )
  const typesParam = useMemo(
    () => (selectedKinds.length > 0 ? `&types=${selectedKinds.join(',')}` : ''),
    [selectedKinds],
  )
  const stagesParam = useMemo(
    () =>
      selectedStages.length > 0
        ? `&stages=${selectedStages.map((stage) => encodeURIComponent(stage)).join(',')}`
        : '',
    [selectedStages],
  )
  const stageWindowParam = useMemo(
    () => (stageWindowMonths ? `&stageMonths=${stageWindowMonths}` : ''),
    [stageWindowMonths],
  )

  useEffect(() => {
    setRecentQueries(readRecentQueries(topicId))
  }, [topicId])

  useEffect(() => {
    setSelectedStages((current) => {
      if (current.length === 0) return current

      const validStages = new Set(stageFacets.map((facet) => facet.value))
      const next = current.filter((item) => validStages.has(item))
      return next.length === current.length ? current : next
    })
  }, [stageFacets])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResult(null)
      return
    }

    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const payload = await apiGet<SearchResponse>(
          `/api/search?q=${encodeURIComponent(trimmed)}&scope=topic&topicId=${encodeURIComponent(topicId)}${typesParam}${stagesParam}${stageWindowParam}&limit=28`,
        )
        setResult(payload)
        setRecentQueries((current) => rememberRecentQuery(topicId, trimmed, current))
      } catch {
        setResult(null)
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => window.clearTimeout(timer)
  }, [query, stageWindowParam, stagesParam, topicId, typesParam])

  return (
    <div data-testid="topic-search-panel" className="flex h-full flex-col gap-4">
      <div className="rounded-[24px] bg-[var(--surface-soft)] px-4 py-4">
        <div className="flex items-center gap-2 rounded-[18px] bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          <Search className="h-4 w-4 text-black/40" />
          <input
            data-testid="topic-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchText(
              'search.topicPlaceholder',
              'workbench.searchTopicPlaceholder',
              'Search nodes, papers, figures, sections, and formulas inside this topic.',
            )}
            className="w-full bg-transparent text-[14px] text-black outline-none placeholder:text-black/32"
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-black/40" /> : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
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
                  : 'border-black/8 bg-white text-black/58 hover:border-black/16',
              )}
            >
              {kindLabels[kind]}
            </button>
          ))}
        </div>

        {query.trim() && stageFacets.length > 0 ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 text-[11px] text-black/42">
              <span>
                {searchText(
                  'search.stageFilterLabel',
                  'workbench.searchStageFilterLabel',
                  'Filter by stage',
                )}
              </span>
              {selectedStages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedStages([])}
                  className="text-black/48 transition hover:text-black"
                >
                  {searchText(
                    'search.clearStageFilter',
                    'workbench.searchClearStageFilter',
                    'Clear',
                  )}
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {stageFacets.map((facet) => {
                const active = selectedStages.includes(facet.value)

                return (
                  <button
                    key={facet.value}
                    type="button"
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
                        : 'border-black/8 bg-white text-black/58 hover:border-black/16',
                    )}
                  >
                    {facet.label} · {facet.count}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {query.trim() ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-black/40">
            <span>
              {searchText('search.resultsLabel', 'workbench.searchResultsLabel', 'Topic Results')}
            </span>
            <span>{flatItems.length}</span>
          </div>
        ) : recentQueries.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {recentQueries.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuery(item)}
                className="rounded-full bg-white px-3 py-2 text-[11px] text-black/62 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:text-black"
              >
                {item}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-2 text-[12px] leading-6 text-black/50">
            <p>
              {searchText(
                'search.topicDescription',
                'workbench.searchDescription',
                'Type a keyword to search the current topic for nodes, papers, and evidence, then open the hit, add it to context, or continue asking from there.',
              )}
            </p>
            {helperLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
        {query.trim() && result && flatItems.length === 0 ? (
          <div className="rounded-[22px] bg-[var(--surface-soft)] px-4 py-4 text-[13px] leading-6 text-black/56">
            {searchText(
              'search.empty',
              'workbench.searchEmpty',
              'No matching results yet. Try another keyword or narrow the search types first.',
            )}
          </div>
        ) : null}

        {result?.groups.map((group) => (
          <section key={group.group} className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/38">
              {groupLabels[group.group] ?? group.label}
            </div>

            <div className="space-y-3">
              {group.items.map((item) => (
                <article
                  key={`${group.group}-${item.id}-${item.anchorId ?? 'root'}`}
                  data-testid={`topic-search-result-${item.kind}`}
                  className="rounded-[22px] bg-[var(--surface-soft)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                        {[kindLabels[item.kind], item.stageLabel, item.timeLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <h3 className="mt-1 text-[15px] font-semibold leading-6 text-black">
                        {item.title}
                      </h3>
                      <div className="mt-1 text-[12px] text-black/46">
                        {[item.subtitle, item.topicTitle].filter(Boolean).join(' · ')}
                      </div>
                      {item.relatedNodes && item.relatedNodes.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.relatedNodes.slice(0, 3).map((location) => (
                            <button
                              key={`${item.id}-${location.nodeId}`}
                              type="button"
                              onClick={() =>
                                onOpenResult({
                                  ...item,
                                  route: location.route,
                                  anchorId: undefined,
                                })
                              }
                              className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/54"
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
                            <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/44">
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
                      onClick={() => onAddContext(item)}
                      className="rounded-full bg-white p-2 text-black/66 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:text-black"
                      aria-label={`${searchText('search.contextAction', 'workbench.searchContextAction', 'Add Context')} ${item.title}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="mt-3 text-[13px] leading-6 text-black/60">{item.excerpt}</p>

                  {item.matchedFields.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.matchedFields.slice(0, 4).map((field) => (
                        <span
                          key={field}
                          className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/50"
                        >
                          {matchFieldLabels[field] ?? field}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px]">
                    <button
                      type="button"
                      onClick={() => onOpenResult(item)}
                      className="inline-flex items-center gap-1.5 text-black/72 transition hover:text-black"
                    >
                      {searchText('search.openAction', 'workbench.searchOpenAction', 'Open Result')}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddContext(item)}
                      className="text-black/56 transition hover:text-black"
                    >
                      {searchText('search.contextAction', 'workbench.searchContextAction', 'Add Context')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAskAboutResult(item)}
                      className="inline-flex items-center gap-1.5 text-black/56 transition hover:text-black"
                    >
                      {searchText('search.followUpAction', 'workbench.searchFollowUpAction', 'Ask Follow-Up')}
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
