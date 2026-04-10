import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'

import { TopicBuilderDialog } from '@/components/TopicBuilderDialog'
import { OnboardingTour } from '@/components/OnboardingTour'
import { getTopicDisplay } from '@/data/topicDisplay'
import { useTopicRegistry } from '@/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type { TopicLocalizationPayload } from '@/types/alpha'
import { buildApiUrl } from '@/utils/api'
import { getTopicLocalizedPair } from '@/utils/topicLocalization'
import { dedupeTopicPresentation, isRegressionSeedTopic } from '@/utils/topicPresentation'

type BackendTopic = {
  id: string
  nameZh: string
  nameEn?: string | null
  focusLabel?: string | null
  summary?: string | null
  createdAt?: string
  status?: string
  language?: string
  localization?: TopicLocalizationPayload | null
}

type TopicCard = {
  id: string
  title: string
  titleSecondary?: string
  focusLabel?: string | null
  summary: string
  createdAt: string
}

export function HomePage() {
  const { activeTopics } = useTopicRegistry()
  const { t, preference } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [backendTopics, setBackendTopics] = useState<BackendTopic[]>([])
  const [builderOpen, setBuilderOpen] = useState(false)

  useDocumentTitle(t('brand.title'))

  useEffect(() => {
    let alive = true

    async function loadBackendTopics() {
      try {
        const response = await fetch(buildApiUrl('/api/topics'))
        if (!response.ok) return

        const payload = (await response.json()) as {
          success: boolean
          data?: BackendTopic[]
        }

        if (alive) {
          setBackendTopics(payload.data ?? [])
        }
      } catch {
        // 静默处理错误，使用 registry 数据
      }
    }

    void loadBackendTopics()

    return () => {
      alive = false
    }
  }, [])

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

  const topicCards = useMemo<TopicCard[]>(() => {
    const registryCards = activeTopics.map((topic) => {
      const display = getTopicDisplay(topic.id)
      return {
        id: topic.id,
        title: topic.nameZh,
        titleSecondary: topic.nameZh,
        focusLabel: topic.focusLabel,
        summary: display?.hero.summary ?? topic.summary ?? topic.timelineDigest,
        createdAt: topic.originPaper.published,
      }
    })

    const backendCards = backendTopics
      .filter((topic) => !isRegressionSeedTopic(topic))
      .map((topic) => {
        const registry = registryCards.find((item) => item.id === topic.id)
        const localizedTitle = getTopicLocalizedPair(
          topic.localization,
          'name',
          preference,
          registry?.title ?? topic.nameZh,
          topic.nameEn ?? registry?.titleSecondary ?? topic.nameZh,
        )
        const localizedSummary = getTopicLocalizedPair(
          topic.localization,
          'summary',
          preference,
          registry?.summary ?? topic.summary ?? '',
          topic.summary ?? registry?.summary ?? '',
        )
        const localizedFocusLabel = getTopicLocalizedPair(
          topic.localization,
          'focusLabel',
          preference,
          registry?.focusLabel ?? topic.focusLabel ?? '',
          topic.focusLabel ?? registry?.focusLabel ?? '',
        )

        return {
          id: topic.id,
          title: localizedTitle.primary,
          titleSecondary: localizedTitle.secondary,
          focusLabel: localizedFocusLabel.primary || registry?.focusLabel || topic.focusLabel,
          summary: localizedSummary.primary || registry?.summary || topic.summary || '',
          createdAt: topic.createdAt ?? registry?.createdAt ?? new Date().toISOString(),
        }
      })

    const backendIds = new Set(backendCards.map((item) => item.id))
    const mergedCards = [...backendCards, ...registryCards.filter((item) => !backendIds.has(item.id))].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )

    return dedupeTopicPresentation(mergedCards)
  }, [activeTopics, backendTopics, preference])

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
                  {t('home.title')}
                </div>
                <h2 className="mt-3 text-[28px] font-semibold text-black">
                  {t('home.subtitle')}
                </h2>
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

            {topicCards.length === 0 ? (
              <div className="py-16 text-center text-[15px] leading-8 text-black/54">
                {t('home.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {topicCards.map((topic) => (
                  <Link
                    key={topic.id}
                    to={`/topic/${topic.id}`}
                    className="group flex items-center justify-between gap-6 rounded-[26px] px-5 py-5 transition hover:bg-black/[0.028]"
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-black/32">{topic.focusLabel}</div>
                      <h3 className="mt-3 text-[28px] font-semibold leading-[1.15] text-black">{topic.title}</h3>
                      {topic.titleSecondary && topic.titleSecondary !== topic.title ? (
                        <div className="mt-2 text-[12px] uppercase tracking-[0.18em] text-black/40">
                          {topic.titleSecondary}
                        </div>
                      ) : null}
                      <p className="mt-3 line-clamp-2 text-[15px] leading-8 text-black/58">{topic.summary}</p>
                    </div>
                    <div className="shrink-0 text-sm text-black/46 transition group-hover:text-black">
                      <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
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
