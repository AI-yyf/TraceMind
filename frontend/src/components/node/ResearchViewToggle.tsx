/**
 * ResearchViewToggle - Dual view switcher for NodePage
 * 
 * Allows users to toggle between Article View (default narrative)
 * and Research View (structured research data visualization)
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
    <div className="flex items-center gap-1 rounded-[12px] border border-black/8 bg-white/60 p-1">
      <button
        type="button"
        onClick={() => onChange('article')}
        className={`inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-all ${
          mode === 'article'
            ? 'bg-[linear-gradient(180deg,#f8f5f0_0%,#fff_100%)] text-black shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
            : 'text-black/48 hover:text-black/70 hover:bg-black/4'
        }`}
        aria-pressed={mode === 'article'}
      >
        <BookOpen className="h-4 w-4" />
        {t('node.articleView', 'Article View')}
      </button>
      
      <button
        type="button"
        onClick={() => onChange('research')}
        className={`inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-all ${
          mode === 'research'
            ? 'bg-[linear-gradient(180deg,#f8f5f0_0%,#fff_100%)] text-black shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
            : 'text-black/48 hover:text-black/70 hover:bg-black/4'
        }`}
        aria-pressed={mode === 'research'}
      >
        <Microscope className="h-4 w-4" />
        {t('node.researchView', 'Research View')}
      </button>
    </div>
  )
}

export default ResearchViewToggle