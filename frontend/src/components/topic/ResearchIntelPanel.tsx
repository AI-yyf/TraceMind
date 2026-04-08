import type { ReactNode } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'

function ResearchIntelStateCard({
  tone,
  title,
  message,
  onRetry,
}: {
  tone: 'loading' | 'error' | 'empty'
  title: string
  message: string
  onRetry?: () => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()

  return (
    <article
      data-testid={
        tone === 'loading'
          ? 'topic-research-intel-loading'
          : tone === 'error'
            ? 'topic-research-intel-error'
            : 'topic-research-intel-empty'
      }
      className={`rounded-[16px] border px-3 py-3 ${
        tone === 'loading'
          ? 'border-black/6 bg-white/78 text-black/58'
          : tone === 'error'
            ? 'border-amber-200/90 bg-[linear-gradient(180deg,#fffaf3_0%,#ffffff_100%)] text-black/62'
            : 'border-black/8 bg-white text-black/62'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">{title}</div>
          <p className="mt-1.5 text-[11px] leading-5">{message}</p>
        </div>

        {tone === 'loading' ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-black/38" /> : null}
      </div>

      {tone === 'error' && onRetry ? (
        <button
          type="button"
          data-testid="topic-research-intel-retry"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/62 transition hover:border-black/14 hover:text-black"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('workbench.researchIntelRetry', copy('assistant.researchIntelRetry', 'Retry'))}
        </button>
      ) : null}
    </article>
  )
}

export function ResearchIntelPanel({
  loading,
  errorMessage,
  ready,
  onRetry,
  onUsePrompt,
  children,
}: {
  loading: boolean
  errorMessage: string | null
  ready: boolean
  onRetry: () => void
  onUsePrompt: (prompt: string) => void
  children?: ReactNode
}) {
  const { t } = useI18n()

  const emptyPrompts = [
    t(
      'workbench.researchIntelSeedThesis',
      'Summarize the current topic thesis and what it still cannot explain.',
    ),
    t(
      'workbench.researchIntelSeedGuidance',
      'Turn the current reading focus into durable guidance for the next research run.',
    ),
    t(
      'workbench.researchIntelSeedQuestion',
      'List the strongest open question and what evidence should settle it.',
    ),
  ]

  return (
    <section
      data-testid="topic-research-intel"
      className="rounded-[18px] border border-black/8 bg-[var(--surface-soft)] px-3 py-3"
    >
      <div className="max-w-[30ch]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-black/34">
          {t('workbench.researchIntelEyebrow', 'Research intel')}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-black/56">
          {t(
            'workbench.researchIntelDek',
            'The thesis, latest absorbed guidance, and current calibration stay visible here instead of collapsing into chat history.',
          )}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {loading && !ready ? (
          <ResearchIntelStateCard
            tone="loading"
            title={t('workbench.researchIntelLoadingTitle', 'Refreshing research intel')}
            message={t(
              'workbench.researchIntelLoadingMessage',
              'Pulling the latest thesis, absorbed guidance, and calibration notes from the backend.',
            )}
          />
        ) : null}

        {errorMessage ? (
          <ResearchIntelStateCard
            tone="error"
            title={t('workbench.researchIntelErrorTitle', 'Research intel unavailable')}
            message={errorMessage}
            onRetry={onRetry}
          />
        ) : null}

        {ready ? (
          children
        ) : !loading && !errorMessage ? (
          <div data-testid="topic-research-intel-empty" className="rounded-[16px] border border-black/8 bg-white px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
              {t('workbench.researchIntelEmptyTitle', 'No persistent intel yet')}
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-black/58">
              {t(
                'workbench.researchIntelEmptyMessage',
                'This topic already has a live workbench, but the backend has not written a stable thesis, absorbed guidance, or calibration memory here yet.',
              )}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {emptyPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onUsePrompt(prompt)}
                  className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
