import { Plus, X } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { ContextPill } from '@/types/alpha'

export function ContextTray({
  items,
  suggestions = [],
  onAdd,
  onCaptureSelection,
  onRemove,
}: {
  items: ContextPill[]
  suggestions?: ContextPill[]
  onAdd?: (pill: ContextPill) => void
  onCaptureSelection?: () => void
  onRemove: (id: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))

  if (items.length === 0 && suggestions.length === 0 && !onCaptureSelection) return null

  return (
    <div className="space-y-2 rounded-[18px] bg-[var(--surface-soft)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
          {workbenchText('assistant.contextLabel', 'workbench.context', 'Context')}
        </div>
        {items.length > 0 ? (
          <div className="rounded-full bg-white px-2 py-0.5 text-[10px] text-black/48">
            {items.length}
          </div>
        ) : null}
      </div>

      {(suggestions.length > 0 || onCaptureSelection) && (
        <div className="flex flex-wrap gap-2">
          {onCaptureSelection ? (
            <button
              type="button"
              data-testid="context-capture-selection"
              onClick={onCaptureSelection}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#f59e0b]/45 bg-white px-3 py-1 text-[10px] text-[var(--accent-ink)] transition hover:border-[#d97706]"
            >
              <Plus className="h-3.5 w-3.5" />
              {workbenchText(
                'assistant.captureSelection',
                'workbench.captureSelection',
                'Add Selection',
              )}
            </button>
          ) : null}

          {suggestions.map((item) => (
            <button
              key={`suggestion:${item.id}`}
              type="button"
              data-testid={`context-suggestion-${item.kind}`}
              onClick={() => onAdd?.(item)}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-white px-3 py-1 text-[10px] text-black/68 transition hover:border-black/16"
            >
              <Plus className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              data-testid={`context-pill-${item.kind}`}
              className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-3 py-1 text-[10px] text-black/68"
            >
              <span>{item.label}</span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`${copy('search.clear', t('search.clear', 'Remove'))} ${item.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
