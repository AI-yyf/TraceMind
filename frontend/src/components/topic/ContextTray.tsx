import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { ContextPill } from '@/types/alpha'

export function ContextTray({
  items,
  implicitFocus = null,
  readingTrail = [],
  suggestions = [],
  onAdd,
  onCaptureSelection,
  onRemove,
}: {
  items: ContextPill[]
  implicitFocus?: ContextPill | null
  readingTrail?: ContextPill[]
  suggestions?: ContextPill[]
  onAdd?: (pill: ContextPill) => void
  onCaptureSelection?: () => void
  onRemove: (id: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))
  const [expanded, setExpanded] = useState(() => items.length > 0)
  const previousPinnedCountRef = useRef(items.length)
  const intakeAvailable = suggestions.length > 0 || Boolean(onCaptureSelection)
  const visibleTrail = readingTrail.filter((item) => item.id !== implicitFocus?.id).slice(0, 3)
  const collapsedSummary =
    implicitFocus?.label
      ? t('workbench.contextCollapsedFocus', 'Current focus: {label}').replace(
          '{label}',
          implicitFocus.label,
        )
      : items.length > 0
        ? t('workbench.contextCollapsedHint', 'Expand to review, remove, or add context sources.')
        : intakeAvailable
          ? t(
              'workbench.contextCollapsedPrompt',
              'Expand when you want to add reading selections or related sources.',
            )
          : t(
              'workbench.contextCollapsedAuto',
              'Current reading focus will still ground your next turn.',
            )

  useEffect(() => {
    if (items.length > previousPinnedCountRef.current) {
      setExpanded(true)
    }
    previousPinnedCountRef.current = items.length
  }, [items.length])

  if (
    items.length === 0 &&
    suggestions.length === 0 &&
    !onCaptureSelection &&
    !implicitFocus &&
    visibleTrail.length === 0
  ) {
    return null
  }

  return (
    <div className="rounded-[14px] border border-black/8 bg-[var(--surface-soft)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex min-w-0 items-center gap-2 text-left"
        >
          <span className="text-[10px] uppercase tracking-[0.16em] text-black/34">
            {workbenchText('assistant.contextLabel', 'workbench.context', 'Context')}
          </span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-black/50">
            {items.length > 0
              ? t('workbench.contextPinnedCount', '{count} pinned').replace('{count}', String(items.length))
              : t('workbench.contextPinnedEmpty', 'No pinned context')}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-black/44 transition ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {onCaptureSelection ? (
          <button
            type="button"
            data-testid="context-capture-selection"
            onClick={() => {
              onCaptureSelection()
              setExpanded(true)
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/64 transition hover:border-black/18 hover:text-black"
          >
            <Plus className="h-3 w-3" />
            {workbenchText(
              'assistant.captureSelection',
              'workbench.captureSelection',
              'Add selection',
            )}
          </button>
        ) : null}
      </div>

      {!expanded ? (
        <p className="mt-1.5 text-[10px] leading-4 text-black/48">
          {collapsedSummary}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {implicitFocus ? (
            <div
              data-testid="current-reading-focus"
              className="rounded-[12px] border border-black/8 bg-white px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
                {t('workbench.currentFocus', 'Current focus')}
              </div>
              <div className="mt-1 text-[11px] font-medium leading-5 text-black">
                {implicitFocus.label}
              </div>
              {implicitFocus.description ? (
                <p className="mt-1 text-[10px] leading-4 text-black/52">
                  {implicitFocus.description}
                </p>
              ) : null}
            </div>
          ) : null}

          {visibleTrail.length > 0 ? (
            <div className="rounded-[12px] border border-black/8 bg-white px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
                {t('workbench.recentPath', 'Recent path')}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {visibleTrail.map((item) => (
                  <span
                    key={`trail:${item.id}`}
                    className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-black/54"
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((item) => (
                <button
                  key={`suggestion:${item.id}`}
                  type="button"
                  data-testid={`context-suggestion-${item.kind}`}
                  onClick={() => onAdd?.(item)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/68 transition hover:border-black/16"
                >
                  <Plus className="h-3 w-3" />
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          {items.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid={`context-pill-${item.kind}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/68"
                >
                  <span>{item.label}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    aria-label={`${copy('search.clear', t('search.clear', 'Remove'))} ${item.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
