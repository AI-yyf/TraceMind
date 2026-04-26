/**
 * ResearchViewToggle - Dual-view switcher for the node surface
 */

import { BookOpen, Microscope } from 'lucide-react'

import { useI18n } from '@/i18n'

export type ViewMode = 'article' | 'research'

export interface ResearchViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ResearchViewToggle({ mode, onChange }: ResearchViewToggleProps) {
  const { t } = useI18n()

  return (
    <div
      data-testid="node-main-view-toggle"
      className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-[var(--surface-soft)] p-1"
    >
      <button
        type="button"
        onClick={() => onChange('article')}
        data-testid="node-main-view-article"
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition ${
          mode === 'article'
            ? 'bg-white text-black shadow-[0_4px_12px_rgba(15,23,42,0.08)]'
            : 'text-black/48 hover:bg-white/70 hover:text-black/70'
        }`}
        aria-pressed={mode === 'article'}
        aria-label={t('node.articleView', '文章视图')}
      >
        <BookOpen className="h-4 w-4" />
        {t('node.articleView', '文章视图')}
      </button>

      <button
        type="button"
        onClick={() => onChange('research')}
        data-testid="node-main-view-research"
        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition ${
          mode === 'research'
            ? 'bg-white text-black shadow-[0_4px_12px_rgba(15,23,42,0.08)]'
            : 'text-black/48 hover:bg-white/70 hover:text-black/70'
        }`}
        aria-pressed={mode === 'research'}
        aria-label={t('node.researchView', '研究视图')}
      >
        <Microscope className="h-4 w-4" />
        {t('node.researchView', '研究视图')}
      </button>
    </div>
  )
}

export default ResearchViewToggle
