import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Languages, Loader2, Sparkles } from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type { ModelCapabilitySummary, PromptLanguageCode } from '@/types/alpha'
import { ApiError, apiGet, apiPost } from '@/utils/api'
import { cn } from '@/utils/cn'
import {
  TOPIC_LANGUAGE_LABELS,
  TOPIC_SOURCE_PLACEHOLDERS,
  buildTopicAnchorLanguageOrder,
  normalizeAnchorDescriptions,
  resolvePreviewLocale,
  resolveTopicSourceLanguage,
  type TopicCreateLanguage,
  type TopicPreview,
} from '@/utils/topicCreate'

type CreateResponse = {
  topicId: string
}

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export function CreateTopicPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  useDocumentTitle(t('create.title', 'Build a New Topic'))

  const [sourceDescription, setSourceDescription] = useState('')
  const [anchorDescriptions, setAnchorDescriptions] = useState<Partial<Record<PromptLanguageCode, string>>>({})
  const [language, setLanguage] = useState<TopicCreateLanguage>('zh')
  const [preview, setPreview] = useState<TopicPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAnchors, setShowAnchors] = useState(false)
  const [capabilities, setCapabilities] = useState<ModelCapabilitySummary | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const sourceLanguage = resolveTopicSourceLanguage(language)
  const charCount = sourceDescription.trim().length
  const anchorLanguages = useMemo(
    () => buildTopicAnchorLanguageOrder(sourceLanguage),
    [sourceLanguage],
  )
  const normalizedAnchors = useMemo(
    () => normalizeAnchorDescriptions(sourceLanguage, anchorDescriptions),
    [anchorDescriptions, sourceLanguage],
  )
  const primaryPreviewLocale = resolvePreviewLocale(preview, sourceLanguage)
  const zhPreviewLocale = preview?.locales?.zh ?? null
  const enPreviewLocale = preview?.locales?.en ?? null
  const languageSlotConfigured = capabilities?.slots.language.configured ?? false
  const usingCompatibleGateway = capabilities?.slots.language.provider === 'openai_compatible'

  const createLanguageOptions = useMemo(
    () => [
      {
        value: 'zh' as const,
        badge: 'ZH',
        title: TOPIC_LANGUAGE_LABELS.zh,
        description: t(
          'create.languageOption.zh',
          'Create the topic from Simplified Chinese and generate the full 8-language research blueprint.',
        ),
      },
      {
        value: 'en' as const,
        badge: 'EN',
        title: TOPIC_LANGUAGE_LABELS.en,
        description: t(
          'create.languageOption.en',
          'Use English as the source language and expand it into a full 8-language research blueprint.',
        ),
      },
      {
        value: 'ja' as const,
        badge: 'JA',
        title: TOPIC_LANGUAGE_LABELS.ja,
        description: t(
          'create.languageOption.ja',
          'Start from Japanese and keep the same research judgment while building the 8-language blueprint.',
        ),
      },
      {
        value: 'ko' as const,
        badge: 'KO',
        title: TOPIC_LANGUAGE_LABELS.ko,
        description: t(
          'create.languageOption.ko',
          'Start from Korean and turn it into an 8-language topic blueprint without flattening the original nuance.',
        ),
      },
      {
        value: 'de' as const,
        badge: 'DE',
        title: TOPIC_LANGUAGE_LABELS.de,
        description: t(
          'create.languageOption.de',
          'Use German as the origin language and generate the full multilingual topic structure from it.',
        ),
      },
      {
        value: 'fr' as const,
        badge: 'FR',
        title: TOPIC_LANGUAGE_LABELS.fr,
        description: t(
          'create.languageOption.fr',
          'Use French as the source language and expand it into a complete topic blueprint across 8 languages.',
        ),
      },
      {
        value: 'es' as const,
        badge: 'ES',
        title: TOPIC_LANGUAGE_LABELS.es,
        description: t(
          'create.languageOption.es',
          'Use Spanish as the source language and unfold it into a full research topic blueprint in 8 languages.',
        ),
      },
      {
        value: 'ru' as const,
        badge: 'RU',
        title: TOPIC_LANGUAGE_LABELS.ru,
        description: t(
          'create.languageOption.ru',
          'Use Russian as the origin language and keep that framing while generating the 8-language blueprint.',
        ),
      },
      {
        value: 'bilingual' as const,
        badge: 'LEGACY',
        title: t('create.languageLegacyTitle', 'Chinese + English (Legacy)'),
        description: t(
          'create.languageLegacyDescription',
          'Keep the older bilingual entry point for workflows that still rely on Chinese narration plus English anchors.',
        ),
      },
    ],
    [t],
  )

  useEffect(() => {
    let alive = true

    apiGet<ModelCapabilitySummary>('/api/model-capabilities')
      .then((payload) => {
        if (alive) setCapabilities(payload)
      })
      .catch(() => {
        if (alive) setCapabilities(null)
      })

    return () => {
      alive = false
    }
  }, [])

  function updateAnchorDescription(languageCode: PromptLanguageCode, value: string) {
    setAnchorDescriptions((current) => {
      const next = { ...current }
      if (value.trim()) {
        next[languageCode] = value
      } else {
        delete next[languageCode]
      }
      return next
    })
  }

  async function generatePreview() {
    setLoadingPreview(true)
    setPreviewError(null)
    try {
      const response = await apiPost<
        TopicPreview,
        {
          language: TopicCreateLanguage
          sourceLanguage: PromptLanguageCode
          sourceDescription: string
          anchorDescriptions?: Partial<Record<PromptLanguageCode, string>>
        }
      >('/api/topic-gen/preview', {
        language,
        sourceLanguage,
        sourceDescription,
        anchorDescriptions: Object.keys(normalizedAnchors).length > 0 ? normalizedAnchors : undefined,
      })
      setPreview(response)
    } catch (error) {
      setPreview(null)
      setPreviewError(
        error instanceof ApiError
          ? error.message
          : t(
              'create.previewFailed',
              'Preview did not return successfully. Check the Prompt Studio model configuration or try again later.',
            ),
      )
    } finally {
      setLoadingPreview(false)
    }
  }

  async function createTopic() {
    if (!preview) return
    setSaving(true)
    setCreateError(null)
    try {
      const response = await apiPost<
        CreateResponse,
        {
          language: TopicCreateLanguage
          sourceLanguage: PromptLanguageCode
          sourceDescription: string
          anchorDescriptions?: Partial<Record<PromptLanguageCode, string>>
          preview: TopicPreview
        }
      >('/api/topic-gen/create', {
        language,
        sourceLanguage,
        sourceDescription,
        anchorDescriptions: Object.keys(normalizedAnchors).length > 0 ? normalizedAnchors : undefined,
        preview,
      })
      navigate(`/topic/${response.topicId}`)
    } catch (error) {
      setCreateError(
        error instanceof ApiError
          ? error.message
          : t(
              'create.saveFailed',
              'Topic creation did not finish successfully. Please retry after checking the model slot and backend status.',
            ),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1240px]">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('create.backHome', 'Back to Home')}
        </Link>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-[36px] border border-black/8 bg-white px-7 py-8 shadow-[var(--shadow-panel)] md:px-10">
            <div className="text-[11px] tracking-[0.28em] text-black/38">
              {t('create.eyebrow', 'Topic Creation')}
            </div>
            <h1 className="mt-4 font-display text-[38px] leading-[1.1] text-black md:text-[56px]">
              {t('create.title', 'Build a New Topic')}
            </h1>
            <p className="mt-5 max-w-3xl text-[15px] leading-8 text-black/64">
              {t(
                'create.description',
                'Describe the research direction in its native language. The system previews it first, then turns it into an expandable eight-language research topic.',
              )}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-[var(--surface-soft)] px-3 py-1.5 text-[12px] text-black/64">
                {languageSlotConfigured ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                {languageSlotConfigured
                  ? t('create.modelReady', 'Prompt Studio model ready')
                  : t('create.modelMissing', 'Configure model in Prompt Studio')}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-[var(--surface-soft)] px-3 py-1.5 text-[12px] text-black/64">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent-ink)]" />
                {t('create.nativeEightLanguages', '8-language native blueprint')}
              </div>
            </div>

            {usingCompatibleGateway ? (
              <div className="mt-4 rounded-[22px] border border-[#f59e0b]/25 bg-[var(--surface-accent)] px-4 py-3 text-[13px] leading-6 text-[var(--accent-ink)]">
                {t(
                  'create.compatibleHint',
                  'The current language slot is using an OpenAI-compatible gateway. Preview and 8-language creation still work, but weaker providers may fall back to the deterministic scaffold more often.',
                )}
              </div>
            ) : null}

            {previewError ? (
              <div className="mt-4 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
                {previewError}
              </div>
            ) : null}

            {createError ? (
              <div className="mt-4 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
                {createError}
              </div>
            ) : null}

            <div className="mt-8 grid gap-6">
              <label className="grid gap-2 text-sm text-black/66">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    {t('create.descriptionLabel', 'Source Description')}
                    <span className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-black/54">
                      {TOPIC_LANGUAGE_LABELS[sourceLanguage]}
                    </span>
                  </span>
                  <span className={cn('text-xs', charCount < 10 ? 'text-red-600' : 'text-black/42')}>
                    {charCount} / 10
                  </span>
                </div>
                <textarea
                  data-testid="create-topic-description"
                  value={sourceDescription}
                  onChange={(event) => setSourceDescription(event.target.value)}
                  rows={7}
                  placeholder={TOPIC_SOURCE_PLACEHOLDERS[sourceLanguage]}
                  className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4 text-[15px] leading-7 text-black outline-none transition focus:border-[#f59e0b] focus:ring-2 focus:ring-[rgba(245,158,11,0.14)]"
                />
                <span className="text-xs leading-6 text-black/44">
                  {t(
                    'create.descriptionHelp',
                    'This is the topic’s native input. The system uses it to generate the topic title, stage naming, research mainline, and multilingual presentation.',
                  )}
                </span>
              </label>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {createLanguageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLanguage(option.value)}
                    className={cn(
                      'rounded-[24px] border px-4 py-4 text-left transition',
                      language === option.value
                        ? 'border-[#f59e0b]/35 bg-[var(--surface-accent)] shadow-[0_14px_28px_rgba(245,158,11,0.08)]'
                        : 'border-black/8 bg-white hover:border-black/16',
                    )}
                  >
                    <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                      {option.badge}
                    </div>
                    <div className="mt-3 text-[16px] font-semibold text-black">{option.title}</div>
                    <div className="mt-2 text-[13px] leading-6 text-black/56">{option.description}</div>
                  </button>
                ))}
              </div>

              <section className="rounded-[28px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4">
                <button
                  type="button"
                  onClick={() => setShowAnchors((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <div className="inline-flex items-center gap-2 text-[13px] font-medium text-black/72">
                      <Languages className="h-4 w-4" />
                      {t('create.anchorTitle', 'Cross-language Anchors')}
                    </div>
                    <div className="mt-2 text-[12px] leading-6 text-black/48">
                      {t(
                        'create.anchorDescription',
                        'Optional. Add aliases, English keywords, or search anchors in other languages without overriding the primary creation judgment.',
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-black/42 transition',
                      showAnchors ? 'rotate-180' : '',
                    )}
                  />
                </button>

                {showAnchors ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {anchorLanguages.map((languageCode) => (
                      <label
                        key={languageCode}
                        className="grid gap-2 rounded-[22px] border border-white/70 bg-white px-3 py-3 text-sm text-black/62"
                      >
                        <span className="text-[12px] font-medium uppercase tracking-[0.12em] text-black/46">
                          {TOPIC_LANGUAGE_LABELS[languageCode]}
                        </span>
                        <textarea
                          value={anchorDescriptions[languageCode] ?? ''}
                          onChange={(event) =>
                            updateAnchorDescription(languageCode, event.target.value)
                          }
                          rows={3}
                          placeholder={renderTemplate(
                            t('create.anchorPlaceholder', '{language} search anchor (optional)'),
                            { language: TOPIC_LANGUAGE_LABELS[languageCode] },
                          )}
                          className="rounded-[18px] border border-black/8 bg-[var(--surface-soft)] px-3 py-3 text-[13px] leading-6 text-black outline-none transition focus:border-[#f59e0b] focus:ring-2 focus:ring-[rgba(245,158,11,0.12)]"
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
              </section>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  data-testid="create-topic-preview"
                  onClick={() => void generatePreview()}
                  disabled={sourceDescription.trim().length < 10 || loadingPreview}
                  className="inline-flex items-center gap-2 rounded-full border border-[#f59e0b]/35 bg-[var(--surface-accent)] px-5 py-3 text-sm text-[var(--accent-ink)] transition hover:shadow-[0_10px_24px_rgba(245,158,11,0.08)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {loadingPreview
                    ? t('create.previewLoading', 'Generating preview')
                    : t('create.previewButton', 'Generate Preview')}
                </button>
                <button
                  type="button"
                  data-testid="create-topic-save"
                  onClick={() => void createTopic()}
                  disabled={!preview || saving}
                  className="inline-flex items-center gap-2 rounded-full border border-black bg-black px-5 py-3 text-sm text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {saving
                    ? t('create.saveLoading', 'Saving')
                    : t('create.saveButton', 'Create Topic')}
                </button>
              </div>
            </div>
          </section>

          <aside
            data-testid="create-topic-preview-panel"
            className="rounded-[36px] border border-black/8 bg-white px-6 py-7 shadow-[var(--shadow-panel)]"
          >
            <div className="text-[11px] tracking-[0.24em] text-black/38">
              {t('create.previewEyebrow', 'Preview')}
            </div>
            {!preview ? (
              <div className="mt-6 rounded-[24px] border border-dashed border-black/10 bg-[var(--surface-soft)] px-4 py-8 text-[14px] leading-7 text-black/54">
                {t(
                  'create.previewEmpty',
                  'After preview generation, the primary title, multilingual anchors, summary, and stage recommendation will appear here.',
                )}
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <section className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-black/46">
                    {TOPIC_LANGUAGE_LABELS[sourceLanguage]}
                  </div>
                  <h2 className="mt-3 text-[24px] font-semibold leading-[1.2] text-black">
                    {primaryPreviewLocale?.name || preview.nameZh || preview.nameEn}
                  </h2>
                  <div className="mt-2 text-[13px] leading-6 text-black/52">
                    {t('create.anchorZh', 'Chinese Anchor')}: {zhPreviewLocale?.name || preview.nameZh}
                  </div>
                  <div className="mt-1 text-[13px] leading-6 text-black/46">
                    {t('create.anchorEn', 'English Anchor')}: {enPreviewLocale?.name || preview.nameEn}
                  </div>
                </section>

                <section className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                    {t('create.summaryTitle', 'Summary')}
                  </div>
                  <p className="mt-3 text-[14px] leading-7 text-black/64">
                    {primaryPreviewLocale?.summary || preview.summaryZh || preview.summary}
                  </p>
                  <p className="mt-3 text-[13px] leading-7 text-black/52">
                    {t('create.anchorSummaryZh', 'Chinese Anchor Summary')}:
                    {' '}
                    {zhPreviewLocale?.summary || preview.summaryZh || preview.summary}
                  </p>
                  <p className="mt-2 text-[13px] leading-7 text-black/48">
                    {t('create.anchorSummaryEn', 'English Anchor Summary')}:
                    {' '}
                    {enPreviewLocale?.summary || preview.summaryEn || preview.summary}
                  </p>
                </section>

                <section className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                    {t('create.keywordsTitle', 'Keywords')}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {preview.keywords.map((keyword) => (
                      <span
                        key={`${keyword.zh}-${keyword.en}`}
                        className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-3 py-1.5 text-[12px] text-black/70"
                      >
                        {keyword.zh && keyword.en
                          ? `${keyword.zh} / ${keyword.en}`
                          : keyword.zh || keyword.en}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="rounded-[24px] border border-black/8 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                    {t('create.structureTitle', 'Structure')}
                  </div>
                  <div className="mt-3 space-y-2 text-[14px] leading-7 text-black/64">
                    <div>
                      {t('create.focusTitle', 'Primary Focus')}:
                      {' '}
                      {primaryPreviewLocale?.focusLabel || preview.focusLabel}
                    </div>
                    <div>
                      {t('create.anchorZh', 'Chinese Anchor')}:
                      {' '}
                      {zhPreviewLocale?.focusLabel || preview.focusLabelZh || preview.focusLabel}
                    </div>
                    <div>
                      {t('create.anchorEn', 'English Anchor')}:
                      {' '}
                      {enPreviewLocale?.focusLabel || preview.focusLabelEn || preview.focusLabel}
                    </div>
                    <div>
                      {t('create.stageCountTitle', 'Recommended Stages')}:
                      {' '}
                      {renderTemplate(t('create.stageCountValue', '{count} stages'), {
                        count: preview.recommendedStages,
                      })}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}

export default CreateTopicPage
