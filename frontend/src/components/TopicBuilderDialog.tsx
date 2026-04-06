import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Languages, Loader2, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { ModelCapabilitySummary, PromptLanguageCode } from '@/types/alpha'
import { apiGet, apiPost } from '@/utils/api'
import { cn } from '@/utils/cn'
import {
  TOPIC_LANGUAGE_LABELS,
  TOPIC_SOURCE_PLACEHOLDERS,
  buildTopicAnchorLanguageOrder,
  normalizeAnchorDescriptions,
  normalizeTopicBuilderLanguage,
  resolvePreviewLocale,
  resolveTopicSourceLanguage,
  type TopicCreateLanguage,
  type TopicPreview,
} from '@/utils/topicCreate'

type CreateResponse = {
  topicId: string
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export function TopicBuilderDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { copy, language } = useProductCopy()
  const { t } = useI18n()
  const [builderLanguage, setBuilderLanguage] = useState<TopicCreateLanguage>(() =>
    normalizeTopicBuilderLanguage(language),
  )
  const [sourceDescription, setSourceDescription] = useState('')
  const [anchorDescriptions, setAnchorDescriptions] = useState<
    Partial<Record<PromptLanguageCode, string>>
  >({})
  const [preview, setPreview] = useState<TopicPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAnchors, setShowAnchors] = useState(false)
  const [modelStatus, setModelStatus] = useState<ModelCapabilitySummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBuilderLanguage(normalizeTopicBuilderLanguage(language))
      setSourceDescription('')
      setAnchorDescriptions({})
      setPreview(null)
      setLoadingPreview(false)
      setSaving(false)
      setShowAnchors(false)
      setNotice(null)
    }
  }, [language, open])

  useEffect(() => {
    if (!open) return

    let alive = true
    void apiGet<ModelCapabilitySummary>('/api/model-capabilities')
      .then((payload) => {
        if (alive) setModelStatus(payload)
      })
      .catch(() => {
        if (alive) setModelStatus(null)
      })

    return () => {
      alive = false
    }
  }, [open])

  const sourceLanguage = resolveTopicSourceLanguage(builderLanguage)
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
  const charCount = sourceDescription.trim().length
  const compatibleGatewayActive = modelStatus?.slots.language.provider === 'openai_compatible'
  const languageConfigured = modelStatus?.slots.language.configured ?? false
  const text = useCallback(
    (copyId: string, key: string, fallback: string) =>
      copy(copyId, t(key, fallback)),
    [copy, t],
  )
  const createLanguageOptions = useMemo(
    () => [
      {
        value: 'zh' as const,
        badge: 'ZH',
        title: TOPIC_LANGUAGE_LABELS.zh,
        description: text(
          'create.languageOption.zh',
          'create.languageOption.zh',
          'Create the topic from Simplified Chinese and generate the full 8-language research blueprint.',
        ),
      },
      {
        value: 'en' as const,
        badge: 'EN',
        title: TOPIC_LANGUAGE_LABELS.en,
        description: text(
          'create.languageOption.en',
          'create.languageOption.en',
          'Use English as the source language and expand it into a full 8-language research blueprint.',
        ),
      },
      {
        value: 'ja' as const,
        badge: 'JA',
        title: TOPIC_LANGUAGE_LABELS.ja,
        description: text(
          'create.languageOption.ja',
          'create.languageOption.ja',
          'Start from Japanese and keep the same research judgment while building the 8-language blueprint.',
        ),
      },
      {
        value: 'ko' as const,
        badge: 'KO',
        title: TOPIC_LANGUAGE_LABELS.ko,
        description: text(
          'create.languageOption.ko',
          'create.languageOption.ko',
          'Start from Korean and turn it into an 8-language topic blueprint without flattening the original nuance.',
        ),
      },
      {
        value: 'de' as const,
        badge: 'DE',
        title: TOPIC_LANGUAGE_LABELS.de,
        description: text(
          'create.languageOption.de',
          'create.languageOption.de',
          'Use German as the origin language and generate the full multilingual topic structure from it.',
        ),
      },
      {
        value: 'fr' as const,
        badge: 'FR',
        title: TOPIC_LANGUAGE_LABELS.fr,
        description: text(
          'create.languageOption.fr',
          'create.languageOption.fr',
          'Use French as the source language and expand it into a complete topic blueprint across 8 languages.',
        ),
      },
      {
        value: 'es' as const,
        badge: 'ES',
        title: TOPIC_LANGUAGE_LABELS.es,
        description: text(
          'create.languageOption.es',
          'create.languageOption.es',
          'Use Spanish as the source language and unfold it into a full research topic blueprint in 8 languages.',
        ),
      },
      {
        value: 'ru' as const,
        badge: 'RU',
        title: TOPIC_LANGUAGE_LABELS.ru,
        description: text(
          'create.languageOption.ru',
          'create.languageOption.ru',
          'Use Russian as the origin language and keep that framing while generating the 8-language blueprint.',
        ),
      },
      {
        value: 'bilingual' as const,
        badge: 'LEGACY',
        title: text(
          'create.languageLegacyTitle',
          'create.languageLegacyTitle',
          'Chinese + English (Legacy)',
        ),
        description: text(
          'create.languageLegacyDescription',
          'create.languageLegacyDescription',
          'Keep the older bilingual entry point for workflows that still rely on Chinese narration plus English anchors.',
        ),
      },
    ],
    [text],
  )

  if (!open) return null

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
    setNotice(null)
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
        language: builderLanguage,
        sourceLanguage,
        sourceDescription,
        anchorDescriptions:
          Object.keys(normalizedAnchors).length > 0 ? normalizedAnchors : undefined,
      })
      setPreview(response)
    } catch {
      setNotice(
        text(
          'create.previewFailed',
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
    setNotice(null)
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
        language: builderLanguage,
        sourceLanguage,
        sourceDescription,
        anchorDescriptions:
          Object.keys(normalizedAnchors).length > 0 ? normalizedAnchors : undefined,
        preview,
      })
      onClose()
      navigate(`/topic/${response.topicId}`)
    } catch {
      setNotice(
        text(
          'create.saveFailed',
          'create.saveFailed',
          'Topic save failed. Confirm the preview exists first, then check the backend and model configuration.',
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90] bg-white/88 backdrop-blur-sm"
        onClick={onClose}
        aria-label={text('create.close', 'create.close', 'Close topic builder')}
      />
      <div className="fixed inset-x-4 top-4 z-[91] mx-auto flex h-[min(860px,calc(100vh-2rem))] w-[min(1120px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[34px] border border-black/8 bg-white p-5 shadow-[0_32px_90px_rgba(15,23,42,0.12)] md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[760px]">
            <h2 className="text-[32px] font-semibold leading-[1.08] text-black">
              {text('create.title', 'create.title', 'Build a New Topic')}
            </h2>
            <p className="mt-4 text-[15px] leading-8 text-black/62">
              {text(
                'create.description',
                'create.description',
                'Describe the research direction in its native language. The system previews it first, then turns it into an expandable eight-language research topic.',
              )}
            </p>
            <p className="mt-3 text-[13px] leading-7 text-black/48">
              {text(
                'create.globalConfigNote',
                'create.globalConfigNote',
                'The current topic will inherit the models, prompts, research orchestration, and agent configuration from Prompt Studio.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-black/8 p-2 text-black/52 transition hover:border-black/16 hover:text-black"
            aria-label={text('create.close', 'create.close', 'Close topic builder')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-black/56">
            {TOPIC_LANGUAGE_LABELS[sourceLanguage]}
          </span>
          <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-black/56">
            {text('create.nativeEightLanguages', 'create.nativeEightLanguages', '8-language native blueprint')}
          </span>
          <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-black/56">
            {languageConfigured
              ? text('create.modelReady', 'create.modelReady', 'Prompt Studio model ready')
              : text('create.modelMissing', 'create.modelMissing', 'Configure model in Prompt Studio')}
          </span>
        </div>

        {compatibleGatewayActive ? (
          <div className="mt-4 rounded-[22px] border border-[#f59e0b]/25 bg-[rgba(245,158,11,0.08)] px-4 py-3 text-[12px] leading-6 text-[#8a5a12]">
            {text(
              'create.compatibleHint',
              'create.compatibleHint',
              'The current language slot is using an OpenAI-compatible gateway. Preview and 8-language creation will still work, but weak providers may fall back to the deterministic scaffold more often.',
            )}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-700">
            {notice}
          </div>
        ) : null}

        <div className="mt-6 grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-h-0 space-y-6 overflow-y-auto pr-1">
            <section className="rounded-[28px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                {t('create.languageTitle')}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {createLanguageOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setBuilderLanguage(option.value)}
                    className={cn(
                      'rounded-[22px] border px-4 py-4 text-left transition',
                      builderLanguage === option.value
                        ? 'border-[#f59e0b]/35 bg-[var(--surface-accent)] shadow-[0_14px_28px_rgba(245,158,11,0.08)]'
                        : 'border-black/8 bg-white hover:border-black/16',
                    )}
                  >
                    <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                      {option.badge}
                    </div>
                    <div className="mt-3 text-[15px] font-semibold text-black">
                      {option.title}
                    </div>
                    <div className="mt-2 text-[12px] leading-6 text-black/56">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <label className="grid gap-2 text-sm text-black/66">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  {text(
                    'create.descriptionLabel',
                    'create.descriptionLabel',
                    'Source Description',
                  )}
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
                rows={8}
                placeholder={TOPIC_SOURCE_PLACEHOLDERS[sourceLanguage]}
                className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4 text-[15px] leading-7 text-black outline-none transition focus:border-[#f59e0b] focus:ring-2 focus:ring-[rgba(245,158,11,0.14)]"
              />
            </label>

            <section className="rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-4 py-4">
              <button
                type="button"
                onClick={() => setShowAnchors((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <div className="inline-flex items-center gap-2 text-[13px] font-medium text-black/72">
                    <Languages className="h-4 w-4" />
                    {t('create.anchorTitle')}
                  </div>
                  <div className="mt-2 text-[12px] leading-6 text-black/48">
                    {t('create.anchorDescription')}
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
                      className="grid gap-2 rounded-[20px] border border-white/70 bg-white px-3 py-3 text-sm text-black/62"
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

            <div className="sticky bottom-0 z-10 flex flex-wrap gap-3 rounded-[22px] border border-black/8 bg-white/94 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] backdrop-blur">
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
                  ? text('create.previewLoading', 'create.previewLoading', 'Generating preview')
                  : text('create.previewButton', 'create.previewButton', 'Generate Preview')}
              </button>
              <button
                type="button"
                data-testid="create-topic-save"
                onClick={() => void createTopic()}
                disabled={!preview || saving}
                className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {saving
                  ? text('create.saveLoading', 'create.saveLoading', 'Saving')
                  : text('create.saveButton', 'create.saveButton', 'Create Topic')}
              </button>
            </div>
          </section>

          <aside
            data-testid="create-topic-preview-panel"
            className="min-h-0 overflow-y-auto rounded-[28px] bg-[var(--surface-soft)] p-5"
          >
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">
              {text('create.previewTitle', 'create.previewTitle', 'Preview')}
            </div>

            {!preview ? (
              <p className="mt-4 text-[14px] leading-7 text-black/58">
                {text(
                  'create.previewEmpty',
                  'create.previewEmpty',
                  'After preview generation, the primary title, multilingual anchors, summary, and stage recommendation will appear here.',
                )}
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <section className="rounded-[22px] bg-white px-4 py-4">
                  <div className="w-fit rounded-full border border-black/8 bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-black/46">
                    {TOPIC_LANGUAGE_LABELS[sourceLanguage]}
                  </div>
                  <h3 className="mt-3 text-[24px] font-semibold leading-[1.15] text-black">
                    {primaryPreviewLocale?.name || preview.nameZh || preview.nameEn}
                  </h3>
                  <div className="mt-2 text-[13px] leading-6 text-black/46">
                    {t('create.anchorZh')}: {zhPreviewLocale?.name || preview.nameZh}
                  </div>
                  <div className="mt-1 text-[13px] leading-6 text-black/42">
                    {t('create.anchorEn')}: {enPreviewLocale?.name || preview.nameEn}
                  </div>
                </section>

                <section className="rounded-[22px] bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                    {text('create.summaryTitle', 'create.summaryTitle', 'Summary')}
                  </div>
                  <p className="mt-3 text-[14px] leading-7 text-black/64">
                    {primaryPreviewLocale?.summary || preview.summaryZh || preview.summary}
                  </p>
                  <p className="mt-3 text-[13px] leading-7 text-black/52">
                    {text('create.anchorSummaryZh', 'create.anchorSummaryZh', 'Chinese Anchor Summary')}:
                    {' '}
                    {zhPreviewLocale?.summary || preview.summaryZh || preview.summary}
                  </p>
                  <p className="mt-2 text-[13px] leading-7 text-black/48">
                    {text('create.anchorSummaryEn', 'create.anchorSummaryEn', 'English Anchor Summary')}:
                    {' '}
                    {enPreviewLocale?.summary || preview.summaryEn || preview.summary}
                  </p>
                </section>

                <section className="rounded-[22px] bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                    {text('create.keywordsTitle', 'create.keywordsTitle', 'Keywords')}
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

                <section className="rounded-[22px] bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-black/40">
                    {text('create.structureTitle', 'create.structureTitle', 'Structure')}
                  </div>
                  <div className="mt-3 space-y-2 text-[14px] leading-7 text-black/64">
                    <div>
                      {text('create.focusTitle', 'create.focusTitle', 'Primary Focus')}:
                      {' '}
                      {primaryPreviewLocale?.focusLabel || preview.focusLabel}
                    </div>
                    <div>
                      {text('create.anchorZh', 'create.anchorZh', 'Chinese Anchor')}:
                      {' '}
                      {zhPreviewLocale?.focusLabel || preview.focusLabelZh || preview.focusLabel}
                    </div>
                    <div>
                      {text('create.anchorEn', 'create.anchorEn', 'English Anchor')}:
                      {' '}
                      {enPreviewLocale?.focusLabel || preview.focusLabelEn || preview.focusLabel}
                    </div>
                    <div>
                      {text('create.stageCountTitle', 'create.stageCountTitle', 'Recommended Stages')}:
                      {' '}
                      {renderTemplate(
                        text('create.stageCountValue', 'create.stageCountValue', '{count} stages'),
                        { count: preview.recommendedStages },
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
