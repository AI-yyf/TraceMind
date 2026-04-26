import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2, PlusCircle, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/UI'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import { formatDateTimeByLanguage } from '@/i18n/locale'
import { getLanguageMetadata, type LanguageCode } from '@/i18n/types'
import type { TopicLocalizationPayload } from '@/types/alpha'
import { apiGet, apiPatch, buildApiUrl, ApiError } from '@/utils/api'
import {
  assertTopicManagerTopicCollectionContract,
  assertTopicStageConfigResponseContract,
} from '@/utils/contracts'
import { getTopicLocalizedPair } from '@/utils/topicLocalization'
import { isRegressionSeedTopic } from '@/utils/topicPresentation'

type ManagedTopic = {
  id: string
  nameZh: string
  nameEn?: string | null
  focusLabel?: string | null
  summary?: string | null
  status: string
  language: string
  updatedAt: string
  paperCount?: number
  nodeCount?: number
  stageCount?: number
  localization?: TopicLocalizationPayload | null
  stageConfig?: {
    windowMonths: number
    updatedAt?: string | null
  } | null
}

const STAGE_CADENCE_PRESETS = [1, 3, 6, 12]

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function formatLanguage(language: string, t: (key: string, fallback?: string) => string) {
  if (language === 'bilingual') {
    return t('language.modeBilingual', 'Bilingual')
  }

  try {
    return getLanguageMetadata(language as LanguageCode).nameLocal
  } catch {
    return language
  }
}

function formatStatus(status: string, t: (key: string, fallback?: string) => string) {
  switch (status) {
    case 'active':
      return t('topic.statusActive', 'Active')
    case 'completed':
      return t('topic.statusCompleted', 'Completed')
    case 'paused':
      return t('topic.statusPaused', 'Paused')
    case 'archived':
      return t('topic.statusArchived', 'Archived')
    default:
      return status
  }
}

function formatMeaningfulDateTime(
  value: string | null | undefined,
  language: LanguageCode,
) {
  if (!value) return null

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null

  const date = new Date(timestamp)
  if (date.getUTCFullYear() <= 2000) return null

  return formatDateTimeByLanguage(timestamp, language)
}

function formatStageCadence(windowMonths: number, t: (key: string, fallback?: string) => string) {
  if (windowMonths === 1) {
    return t('manage.stageCadenceValueSingle', '1 month')
  }

  return renderTemplate(t('manage.stageCadenceValue', '{count} months'), {
    count: windowMonths,
  })
}

export function TopicManagerPage() {
  const navigate = useNavigate()
  const { t, preference } = useI18n()
  const [topics, setTopics] = useState<ManagedTopic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingStageTopicId, setSavingStageTopicId] = useState<string | null>(null)
  const [stageWindowDrafts, setStageWindowDrafts] = useState<Record<string, string>>({})
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} })

  useDocumentTitle(t('manage.title'))

  useEffect(() => {
    let alive = true

    setLoading(true)
    setError(null)

    apiGet<unknown>('/api/topics')
      .then((payload) => {
        if (!alive) return

        assertTopicManagerTopicCollectionContract(payload)

        const nextTopics = payload.filter((topic) => !isRegressionSeedTopic(topic))
        setTopics(nextTopics)
        setStageWindowDrafts(
          Object.fromEntries(
            nextTopics.map((topic) => [topic.id, String(topic.stageConfig?.windowMonths ?? 1)]),
          ),
        )
      })
      .catch((nextError) => {
        if (!alive) return
        const message =
          nextError instanceof ApiError
            ? nextError.message
            : nextError instanceof Error
              ? nextError.message
              : t('manage.empty', 'No topics yet.')
        setTopics([])
        setError(message)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [t])

  async function removeTopic(id: string) {
    setConfirmState({
      isOpen: true,
      title: t('manage.deleteConfirmTitle', '删除确认'),
      message: t('manage.deleteConfirmMessage', '确定要删除这个主题吗？此操作无法撤销。'),
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }))
        await fetch(buildApiUrl(`/api/topics/${id}`), {
          method: 'DELETE',
        })
        setTopics((current) => current.filter((item) => item.id !== id))
      },
    })
  }

  async function updateStageCadence(topicId: string, windowMonths: number) {
    setSavingStageTopicId(topicId)

    try {
      const payload = await apiPatch<unknown>(`/api/topics/${topicId}/stage-config`, { windowMonths })
      assertTopicStageConfigResponseContract(payload)

      setTopics((current) =>
        current.map((topic) =>
          topic.id === topicId
            ? {
                ...topic,
                stageConfig: {
                  windowMonths: payload.windowMonths,
                  updatedAt: payload.updatedAt ?? new Date().toISOString(),
                },
              }
            : topic,
        ),
      )
      setStageWindowDrafts((current) => ({
        ...current,
        [topicId]: String(payload.windowMonths),
      }))
    } finally {
      setSavingStageTopicId(null)
    }
  }

  function updateStageDraft(topicId: string, nextValue: string) {
    setStageWindowDrafts((current) => ({
      ...current,
      [topicId]: nextValue.replace(/[^\d]/gu, '').slice(0, 2),
    }))
  }

  async function applyStageDraft(topicId: string) {
    const parsed = Number(stageWindowDrafts[topicId] ?? '')
    if (!Number.isFinite(parsed)) return
    await updateStageCadence(topicId, parsed)
  }

  return (
    <main className="px-4 pb-16 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1260px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-black/8 px-4 py-2 text-sm text-black/72"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('manage.backHome')}
          </Link>

          <button
            type="button"
            onClick={() => navigate('/?create=1')}
            className="inline-flex items-center gap-2 rounded-full border border-black bg-black px-4 py-2.5 text-sm font-medium text-white"
          >
            <PlusCircle className="h-4 w-4" />
            {t('manage.createOnHome')}
          </button>
        </div>

        <section className="mt-6 rounded-[34px] border border-black/8 bg-white px-6 py-8 shadow-[var(--shadow-panel)] md:px-8">
          <div className="text-[11px] uppercase tracking-[0.28em] text-black/40">
            {t('manage.eyebrow')}
          </div>
          <h1 className="mt-4 font-display text-[36px] leading-[1.08] text-black md:text-[52px]">
            {t('manage.title')}
          </h1>
          <p className="mt-5 max-w-4xl text-[15px] leading-8 text-black/64">
            {t('manage.description')}
          </p>
          <p className="mt-4 max-w-4xl text-[13px] leading-7 text-black/52">
            {t(
              'manage.stageCadenceDescription',
              'Stage cadence now lives here instead of the topic reading surface. Set the publication-time window once for each topic, then let node and paper reading stay stable around that choice.',
            )}
          </p>
        </section>

        <section className="mt-8 grid gap-4">
          {loading ? (
            <div className="rounded-[28px] border border-dashed border-black/10 bg-[var(--surface-soft)] px-6 py-10 text-sm leading-7 text-black/54">
              {t('common.loading', 'Loading...')}
            </div>
          ) : error ? (
            <div className="rounded-[28px] border border-red-200 bg-red-50/70 px-6 py-10 text-sm leading-7 text-red-700">
              {error}
            </div>
          ) : topics.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-black/10 bg-[var(--surface-soft)] px-6 py-10 text-sm leading-7 text-black/54">
              {t('manage.empty')}
            </div>
          ) : (
            topics.map((topic) => {
              const title = getTopicLocalizedPair(
                topic.localization,
                'name',
                preference,
                topic.nameZh,
                topic.nameEn ?? topic.nameZh,
              )
              const focusLabel = getTopicLocalizedPair(
                topic.localization,
                'focusLabel',
                preference,
                topic.focusLabel ?? '',
                topic.focusLabel ?? '',
              )
              const summary = getTopicLocalizedPair(
                topic.localization,
                'summary',
                preference,
                topic.summary ?? '',
                topic.summary ?? '',
              )
              const stageWindowMonths = topic.stageConfig?.windowMonths ?? 1
              const saving = savingStageTopicId === topic.id
              const topicUpdatedAtLabel = formatMeaningfulDateTime(topic.updatedAt, preference.primary)
              const stageUpdatedAtLabel = formatMeaningfulDateTime(
                topic.stageConfig?.updatedAt ?? null,
                preference.primary,
              )

              return (
                <article
                  key={topic.id}
                  className="rounded-[28px] border border-black/8 bg-white px-6 py-6 shadow-[0_12px_32px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-black/40">
                        {formatLanguage(topic.language, t)} · {formatStatus(topic.status, t)}
                      </div>
                      <h2 className="mt-3 text-[24px] font-semibold leading-[1.2] text-black">
                        {title.primary}
                      </h2>
                      {title.secondary && title.secondary !== title.primary ? (
                        <div className="mt-1 text-[13px] text-black/42">{title.secondary}</div>
                      ) : null}
                      <div className="mt-3 text-[14px] text-black/54">{focusLabel.primary}</div>
                      <p className="mt-4 text-[15px] leading-8 text-black/64">{summary.primary}</p>
                      <div className="mt-4 flex flex-wrap gap-3 text-[12px] text-black/46">
                        <span>
                          {topic.paperCount ?? 0} {t('manage.paperUnit')}
                        </span>
                        <span>
                          {topic.nodeCount ?? 0} {t('manage.nodeUnit')}
                        </span>
                        <span>
                          {topic.stageCount ?? 0} {t('manage.stageUnit', 'stages')}
                        </span>
                        {topicUpdatedAtLabel ? <span>{topicUpdatedAtLabel}</span> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/topic/${topic.id}`}
                        className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-[var(--surface-soft)] px-4 py-2 text-sm text-black/68 transition hover:border-black/16"
                      >
                        {t('manage.open')}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeTopic(topic.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('manage.delete')}
                      </button>
                    </div>
                  </div>

                  <section className="mt-5 rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-black/38">
                          {t('manage.stageCadenceEyebrow', 'Stage cadence')}
                        </div>
                        <div className="mt-2 text-[14px] font-medium text-black">
                          {renderTemplate(
                            t(
                              'manage.stageCadenceHeadline',
                              'Current topic map cadence: {window}',
                            ),
                            { window: formatStageCadence(stageWindowMonths, t) },
                          )}
                        </div>
                        <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-black/56">
                          {t(
                            'manage.stageCadenceHint',
                            'This controls the default publication-time bucket used by the topic map and its linked node or paper reading routes. Reading pages stay stable; change cadence here when the research setting truly changes.',
                          )}
                        </p>
                        {stageUpdatedAtLabel ? (
                          <div className="mt-2 text-[11px] text-black/44">
                            {renderTemplate(
                              t(
                                'manage.stageCadenceUpdatedAt',
                                'Last adjusted at {time}',
                              ),
                              {
                                time: stageUpdatedAtLabel,
                              },
                            )}
                          </div>
                        ) : null}
                      </div>

                      {saving ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[12px] text-black/56">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('common.saving', 'Saving')}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {STAGE_CADENCE_PRESETS.map((preset) => {
                        const active = preset === stageWindowMonths

                        return (
                          <button
                            key={`${topic.id}:${preset}`}
                            type="button"
                            onClick={() => void updateStageCadence(topic.id, preset)}
                            disabled={saving}
                            className={`rounded-full px-3 py-2 text-[12px] transition ${
                              active
                                ? 'bg-black text-white'
                                : 'border border-black/10 bg-white text-black/62 hover:border-black/18 hover:text-black'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {formatStageCadence(preset, t)}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="text-[12px] text-black/52">
                        {t('manage.stageCadenceCustomLabel', 'Custom months')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={24}
                        step={1}
                        value={stageWindowDrafts[topic.id] ?? String(stageWindowMonths)}
                        onChange={(event) => updateStageDraft(topic.id, event.target.value)}
                        className="w-24 rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black outline-none transition focus:border-black/28"
                      />
                      <button
                        type="button"
                        onClick={() => void applyStageDraft(topic.id)}
                        disabled={
                          saving ||
                          Number(stageWindowDrafts[topic.id] ?? stageWindowMonths) === stageWindowMonths
                        }
                        className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:border-black/18 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {t('manage.stageCadenceApply', 'Apply')}
                      </button>
                    </div>
                  </section>
                </article>
              )
            })
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        variant="danger"
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </main>
  )
}

export default TopicManagerPage
