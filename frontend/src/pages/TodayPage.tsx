import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock3, GitBranch, Layers3 } from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import { formatDateTimeByLanguage } from '@/i18n/locale'
import type { TopicViewModel } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { isRegressionSeedTopic } from '@/utils/topicPresentation'

type TopicSummary = {
  id: string
  nameZh: string
}

type TopicSnapshot = {
  topicId: string
  topicTitle: string
  focusLabel: string
  latestNode: TopicViewModel['stages'][number]['nodes'][number] | null
  latestNodeStage: number | null
  updatedAt: string
  stats: TopicViewModel['stats']
}

function endOfDayIso(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString()
}

function firstSentence(value: string | null | undefined, max = 140) {
  const normalized = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!normalized) return ''
  const [sentence] = normalized.split(/[。！？.!?；;]+/u)
  return sentence.length <= max ? sentence : `${sentence.slice(0, Math.max(0, max - 3))}...`
}

export default function TodayPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [snapshots, setSnapshots] = useState<TopicSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const { t, preference } = useI18n()

  const title = t('today.title')
  const isToday = selectedDate === new Date().toISOString().slice(0, 10)
  const pageTitle = isToday ? title : `${selectedDate} · ${title}`

  useDocumentTitle(pageTitle)

  useEffect(() => {
    let alive = true

    async function loadSnapshots() {
      setLoading(true)

      try {
        const topics = (await apiGet<TopicSummary[]>('/api/topics')).filter(
          (topic) => !isRegressionSeedTopic(topic),
        )
        const cutoff = endOfDayIso(selectedDate)

        const viewModels = await Promise.all(
          topics.map(async (topic) => {
            try {
              return await apiGet<TopicViewModel>(`/api/topics/${topic.id}/view-model`)
            } catch {
              return null
            }
          }),
        )

        if (!alive) return

        const nextSnapshots = viewModels
          .filter((viewModel): viewModel is TopicViewModel => Boolean(viewModel))
          .map((viewModel) => {
            const latestNode =
              viewModel.stages
                .flatMap((stage) =>
                  stage.nodes.map((node) => ({
                    ...node,
                    stageIndex: stage.stageIndex,
                  })),
                )
                .filter((node) => node.updatedAt <= cutoff)
                .sort(
                  (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
                )[0] ?? null

            return {
              topicId: viewModel.topicId,
              topicTitle: viewModel.title,
              focusLabel: viewModel.subtitle,
              latestNode,
              latestNodeStage: latestNode?.stageIndex ?? null,
              updatedAt: latestNode?.updatedAt ?? viewModel.updatedAt,
              stats: viewModel.stats,
            } satisfies TopicSnapshot
          })
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))

        setSnapshots(nextSnapshots)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadSnapshots()
    return () => {
      alive = false
    }
  }, [selectedDate])

  const description = useMemo(() => t('today.description'), [t])
  const updatedTopics = snapshots.filter((snapshot) => snapshot.latestNode)
  const latestUpdatedAt = updatedTopics[0]?.updatedAt ?? snapshots[0]?.updatedAt ?? null

  return (
    <main className="px-4 pb-20 pt-8 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[980px]">
        <header className="mx-auto max-w-[920px] text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-black/30">
            {t('today.eyebrow')}
          </div>
          <h1 className="mt-4 font-display text-[38px] leading-[1.08] text-black md:text-[54px]">
            {pageTitle}
          </h1>
          <p className="mt-5 text-[16px] leading-9 text-black/62">{description}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <label className="inline-flex items-center gap-3 rounded-full border border-black/8 bg-white px-4 py-2.5">
              <CalendarDays className="h-4 w-4 text-black/44" />
              <input
                type="date"
                value={selectedDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent text-sm text-black outline-none"
              />
            </label>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-black/8 bg-white px-5 py-4 text-left">
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">{t('today.metricTopics')}</div>
              <div className="mt-2 text-[26px] font-semibold text-black">
                {snapshots.length}
              </div>
              <div className="mt-1 text-[13px] leading-6 text-black/54">
                {t('today.metricTopicsDesc')}
              </div>
            </div>
            <div className="rounded-[24px] border border-black/8 bg-white px-5 py-4 text-left">
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">{t('today.metricProgress')}</div>
              <div className="mt-2 text-[26px] font-semibold text-black">
                {updatedTopics.length}
              </div>
              <div className="mt-1 text-[13px] leading-6 text-black/54">
                {isToday ? t('today.metricProgressToday') : t('today.metricProgressPast')}
              </div>
            </div>
            <div className="rounded-[24px] border border-black/8 bg-white px-5 py-4 text-left">
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/34">{t('today.metricLatest')}</div>
              <div className="mt-2 text-[18px] font-semibold text-black">
                {latestUpdatedAt
                  ? formatDateTimeByLanguage(latestUpdatedAt, preference.primary)
                  : t('today.metricLatestEmpty')}
              </div>
              <div className="mt-1 text-[13px] leading-6 text-black/54">
                {t('today.metricLatestDesc')}
              </div>
            </div>
          </div>
        </header>

        <section className="mt-10 grid gap-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-black/56">
              {t('today.loading')}
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-16 text-center text-sm leading-8 text-black/54">
              {t('today.empty')}
            </div>
          ) : (
            snapshots.map((snapshot) => (
              <article
                key={snapshot.topicId}
                className="rounded-[28px] border border-black/8 bg-white px-6 py-6 transition hover:shadow-[0_16px_36px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-black/36">
                      <span>{snapshot.focusLabel || t('today.cardEyebrow')}</span>
                      <span>·</span>
                      <span>
                        {formatDateTimeByLanguage(snapshot.updatedAt, preference.primary)}
                      </span>
                    </div>
                    <h2 className="mt-3 text-[26px] font-semibold leading-[1.15] text-black">
                      {snapshot.topicTitle}
                    </h2>

                    {snapshot.latestNode ? (
                      <div className="mt-5 rounded-[22px] bg-[var(--surface-soft)] px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-black/36">
                          <span>
                            {t('today.stageLabel')} {snapshot.latestNodeStage}
                          </span>
                          <span>·</span>
                          <span>
                            {formatDateTimeByLanguage(
                              snapshot.latestNode.updatedAt,
                              preference.primary,
                            )}
                          </span>
                        </div>
                        <h3 className="mt-3 text-[20px] font-semibold text-black">
                          {snapshot.latestNode.title}
                        </h3>
                        <p className="mt-3 text-[14px] leading-7 text-black/62">
                          {firstSentence(snapshot.latestNode.summary || snapshot.latestNode.explanation, 180)}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5 text-[14px] leading-7 text-black/56">
                        {t('today.noNode')}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-black/44">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers3 className="h-3.5 w-3.5" />
                        {snapshot.stats.stageCount} {t('today.stageUnit')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5" />
                        {snapshot.stats.nodeCount} {t('today.nodeUnit')}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateTimeByLanguage(snapshot.updatedAt, preference.primary, {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {snapshot.latestNode ? (
                      <Link
                        to={`/node/${snapshot.latestNode.nodeId}`}
                        className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/60 transition hover:border-black/16 hover:text-black"
                      >
                        {t('today.openNode')}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <Link
                      to={`/topic/${snapshot.topicId}`}
                      className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/92"
                    >
                      {t('today.openTopic')}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  )
}
