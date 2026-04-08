import type { ReadingTrailEntry } from '@/contexts/ReadingWorkspaceContext'
import { useI18n } from '@/i18n'

function kindLabel(
  kind: ReadingTrailEntry['kind'],
  t: (key: string, fallback: string) => string,
) {
  if (kind === 'paper') return t('workbench.focusKindPaper', 'Paper')
  if (kind === 'node') return t('workbench.focusKindNode', 'Node')
  return t('workbench.focusKindTopic', 'Topic')
}

export function CurrentReadingFocusCard({
  entry,
  onNavigate,
}: {
  entry: ReadingTrailEntry | null
  onNavigate: (route: string) => void
}) {
  const { t } = useI18n()

  if (!entry) return null

  return (
    <section
      data-testid="current-reading-focus"
      className="rounded-[18px] border border-black/8 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/34">
            {t('workbench.currentFocus', 'Current reading focus')}
          </div>
          <div className="mt-1 text-[13px] font-medium leading-6 text-black">
            {entry.title}
          </div>
        </div>
        <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/56">
          {kindLabel(entry.kind, t)}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-black/58">
        {t(
          'workbench.currentFocusDek',
          'The workbench keeps this artifact grounded by default so follow-up questions stay attached to the page you are reading now.',
        )}
      </p>

      <button
        type="button"
        onClick={() => onNavigate(entry.route)}
        className="mt-3 inline-flex rounded-full border border-black/10 bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/62 transition hover:border-black/16 hover:text-black"
      >
        {t('workbench.returnToFocus', 'Return to this focus')}
      </button>
    </section>
  )
}
