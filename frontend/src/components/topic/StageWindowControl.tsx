import { useId } from 'react'

import { cn } from '@/utils/cn'

type StageWindowControlProps = {
  value: number
  min: number
  max: number
  presets: number[]
  eyebrow: string
  title: string
  description?: string
  summary?: string
  stats?: string[]
  optionLabel: (months: number) => string
  numericLabel: string
  onChange: (nextValue: number) => void
  compact?: boolean
  className?: string
  testId?: string
}

export function StageWindowControl({
  value,
  min,
  max,
  presets,
  eyebrow,
  title,
  description,
  summary,
  stats = [],
  optionLabel,
  numericLabel,
  onChange,
  compact = false,
  className,
  testId,
}: StageWindowControlProps) {
  const rangeId = useId()

  const applyValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return
    const normalized = Math.min(max, Math.max(min, Math.trunc(nextValue)))
    if (normalized === value) return
    onChange(normalized)
  }

  return (
    <section
      data-testid={testId}
      className={cn(
        'rounded-[24px] border border-black/8 bg-white/86 shadow-[0_14px_32px_rgba(15,23,42,0.05)]',
        compact ? 'px-4 py-4' : 'px-5 py-5',
        className,
      )}
    >
      <div
        className={cn(
          'flex gap-4',
          compact ? 'flex-col lg:flex-row lg:items-start lg:justify-between' : 'flex-col xl:flex-row xl:items-start xl:justify-between',
        )}
      >
        <div className={cn('min-w-0', compact ? 'max-w-[640px]' : 'max-w-[720px]')}>
          <div className="text-[10px] uppercase tracking-[0.22em] text-black/36">{eyebrow}</div>
          <h3 className={cn('mt-2 font-display text-black', compact ? 'text-[18px] leading-[1.08]' : 'text-[22px] leading-[1.04]')}>
            {title}
          </h3>
          {description ? (
            <p className={cn('mt-2 text-black/56', compact ? 'text-[12px] leading-6' : 'text-[13px] leading-6')}>
              {description}
            </p>
          ) : null}
          {summary ? (
            <p className={cn('mt-3 text-black/64', compact ? 'text-[13px] leading-6' : 'text-[13px] leading-6')}>
              {summary}
            </p>
          ) : null}
          {stats.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-black/8 bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/56"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className={cn('w-full', compact ? 'lg:max-w-[360px]' : 'xl:max-w-[400px]')}>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => {
              const active = preset === value
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyValue(preset)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] transition',
                    active
                      ? 'border-[#d1aa5c]/50 bg-[var(--surface-accent)] text-[var(--accent-ink)]'
                      : 'border-black/10 bg-white text-black/58 hover:border-black/18 hover:text-black',
                  )}
                >
                  {optionLabel(preset)}
                </button>
              )
            })}
          </div>

          <div className="mt-3 rounded-[18px] border border-black/8 bg-[var(--surface-soft)] px-3 py-3">
            <div className="flex items-center justify-between gap-3 text-[11px] text-black/48">
              <label htmlFor={rangeId}>{optionLabel(value)}</label>
              <span>{min}-{max}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                id={rangeId}
                type="range"
                min={min}
                max={max}
                step={1}
                value={value}
                onChange={(event) => applyValue(Number(event.target.value))}
                className="min-w-0 flex-1 accent-black"
              />
              <input
                aria-label={numericLabel}
                type="number"
                min={min}
                max={max}
                step={1}
                value={value}
                onChange={(event) => applyValue(Number(event.target.value))}
                className="w-16 rounded-full border border-black/10 bg-white px-3 py-1.5 text-right text-[12px] text-black outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
