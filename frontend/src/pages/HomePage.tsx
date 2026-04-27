import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'

import { OnboardingTour } from '@/components/OnboardingTour'
import { TopicBuilderDialog } from '@/components/TopicBuilderDialog'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import { ApiError, apiGet } from '@/utils/api'
import {
  assertBackendTopicCollectionContract,
  type BackendTopicListItem,
} from '@/utils/contracts'
import { getTopicLocalizedPair } from '@/utils/topicLocalization'
import { dedupeTopicPresentation } from '@/utils/topicPresentation'

type TopicCard = {
  id: string
  title: string
  titleSecondary?: string
  focusLabel?: string | null
  summary: string
  createdAt: string
}

export function HomePage() {
  const { t, preference } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [topics, setTopics] = useState<BackendTopicListItem[]>([])
  const [builderOpen, setBuilderOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useDocumentTitle(t('brand.title'))

  const loadTopics = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await apiGet<unknown>('/api/topics')
      assertBackendTopicCollectionContract(data)
      setTopics(dedupeTopicPresentation(data))
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.message
          : nextError instanceof Error
            ? nextError.message
            : t('home.backendUnavailable', 'Backend topics are unavailable right now.')
      setTopics([])
      setError(message || t('home.backendUnavailable', 'Backend topics are unavailable right now.'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    setBuilderOpen(true)
  }, [searchParams])

  function closeBuilder() {
    setBuilderOpen(false)
    if (searchParams.get('create') !== '1') return
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }

  const topicCards = useMemo<TopicCard[]>(
    () =>
      topics
        .map((topic) => {
          const localizedTitle = getTopicLocalizedPair(
            topic.localization,
            'name',
            preference,
            topic.nameZh,
            topic.nameEn ?? topic.nameZh,
          )
          const localizedSummary = getTopicLocalizedPair(
            topic.localization,
            'summary',
            preference,
            topic.summary ?? '',
            topic.summary ?? '',
          )
          const localizedFocusLabel = getTopicLocalizedPair(
            topic.localization,
            'focusLabel',
            preference,
            topic.focusLabel ?? '',
            topic.focusLabel ?? '',
          )

          return {
            id: topic.id,
            title: localizedTitle.primary,
            titleSecondary: localizedTitle.secondary,
            focusLabel: localizedFocusLabel.primary || topic.focusLabel,
            summary: localizedSummary.primary || topic.summary || '',
            createdAt: topic.createdAt ?? new Date().toISOString(),
          }
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [preference, topics],
  )

  return (
    <>
      <OnboardingTour />
      <TopicBuilderDialog open={builderOpen} onClose={closeBuilder} />

      <main className="px-4 pb-24 pt-10 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[1320px]">
          <section className="mx-auto flex min-h-[56vh] max-w-[920px] flex-col items-center justify-center text-center">
            <div className="text-[11px] uppercase tracking-[0.32em] text-black/30">
              {t('brand.subtitle')}
            </div>
            <h1 className="mt-8 font-display text-[62px] leading-none text-black md:text-[108px]">
              {t('brand.title')}
            </h1>
            <p className="mt-8 max-w-[860px] text-[17px] leading-9 text-black/62">
              {t('brand.tagline')}
            </p>
          </section>

          <section className="mx-auto mt-10 max-w-[980px]">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div className="text-left">
                <div className="text-[11px] uppercase tracking-[0.28em] text-black/30">
                  {t('brand.subtitle')}
                </div>
                <h2 className="mt-3 text-[28px] font-semibold text-black">
                  {t('home.title')}
                </h2>
                <p className="mt-3 text-[15px] leading-8 text-black/58">
                  {t('home.subtitle')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBuilderOpen(true)}
                data-onboarding="create-topic"
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-black/68 transition hover:border-black/18 hover:text-black"
              >
                <Plus className="h-4 w-4" />
                {t('home.create')}
              </button>
            </div>

            {loading ? (
              <div className="py-16 text-center text-[15px] leading-8 text-black/54">
                {t('common.loading', 'Loading...')}
              </div>
            ) : error ? (
              <div className="rounded-[24px] border border-red-200 bg-red-50/70 px-6 py-8 text-left">
                <div className="text-[11px] uppercase tracking-[0.24em] text-red-500/72">
                  {t('home.backendOnly', 'Backend source required')}
                </div>
                <p className="mt-3 text-[15px] leading-7 text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadTopics()}
                  className="mt-4 rounded-full bg-black px-4 py-2 text-sm text-white transition hover:bg-black/92"
                >
                  {t('common.retry', 'Retry')}
                </button>
              </div>
            ) : topicCards.length === 0 ? (
              <div className="py-16 text-center text-[15px] leading-8 text-black/54">
                {t('home.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {topicCards.map((topic) => (
                  <Link
                    key={topic.id}
                    to={`/topic/${topic.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-6 rounded-[26px] px-5 py-5 transition-all duration-200 hover:bg-gradient-to-r hover:from-amber-50/40 hover:to-transparent hover:shadow-sm"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-black/32 group-hover:text-amber-600/70">{topic.focusLabel}</div>
                      <h3 className="mt-3 text-[28px] font-semibold leading-[1.15] text-black group-hover:text-amber-900">{topic.title}</h3>
                      {topic.titleSecondary && topic.titleSecondary !== topic.title ? (
                        <div className="mt-2 text-[12px] uppercase tracking-[0.18em] text-black/40 group-hover:text-amber-600/60">
                          {topic.titleSecondary}
                        </div>
                      ) : null}
                      <p className="mt-3 line-clamp-2 text-[15px] leading-8 text-black/58">{topic.summary}</p>
                    </div>
                    <div className="shrink-0 text-sm text-black/46 transition-all duration-200 group-hover:text-amber-600 group-hover:translate-x-1">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

export default HomePage
