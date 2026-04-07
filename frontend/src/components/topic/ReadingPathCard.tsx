import { ArrowRight } from 'lucide-react'

import { useI18n } from '@/i18n'

type ReadingPathEntry = {
  id: string
  title: string
  route: string
  kind: 'topic' | 'node' | 'paper'
}

export function ReadingPathCard({
  entries,
  onNavigate,
}: {
  entries: ReadingPathEntry[]
  onNavigate: (route: string) => void
}) {
  const { t } = useI18n()

  if (entries.length === 0) return null

  return (
    <section className="rounded-[18px] border border-black/8 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="text-[10px] uppercase tracking-[0.2em] text-black/34">
        {t('workbench.readingPath', 'Reading path')}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {entries.map((entry, index) => (
          <div key={entry.id} className="inline-flex items-center gap-1.5">
            {index > 0 ? <ArrowRight className="h-3.5 w-3.5 text-black/24" /> : null}
            <button
              type="button"
              onClick={() => onNavigate(entry.route)}
              className={`rounded-full px-2.5 py-1 text-[10px] transition ${
                index === entries.length - 1
                  ? 'bg-black text-white'
                  : 'bg-[var(--surface-soft)] text-black/60 hover:text-black'
              }`}
            >
              {entry.title}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
