import { useI18n } from '@/i18n'

export type TopicSurfaceMode = 'graph' | 'dashboard'

export function TopicSurfaceModeSwitch({
  mode,
  onChange,
}: {
  mode: TopicSurfaceMode
  onChange: (mode: TopicSurfaceMode) => void
}) {
  const { t } = useI18n()

  return (
    <div className="mt-5 flex gap-2">
      <button
        type="button"
        onClick={() => onChange('graph')}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          mode === 'graph'
            ? 'bg-black text-white'
            : 'bg-[var(--surface-soft)] text-black/58 hover:text-black'
        }`}
      >
        {t('topic.graph', 'Research Graph')}
      </button>
      <button
        type="button"
        onClick={() => onChange('dashboard')}
        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
          mode === 'dashboard'
            ? 'bg-black text-white'
            : 'bg-[var(--surface-soft)] text-black/58 hover:text-black'
        }`}
      >
        {t('dashboard.title', 'Research Dashboard')}
      </button>
    </div>
  )
}
