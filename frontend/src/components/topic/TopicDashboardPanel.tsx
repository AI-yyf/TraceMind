import { Loader2, RotateCcw } from 'lucide-react'

import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { useI18n } from '@/i18n'
import { TopicDashboard } from './TopicDashboard'

export type TopicDashboardPanelState =
  | { status: 'idle' | 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | { status: 'ready'; data: TopicDashboardData; error: null }

export function TopicDashboardPanel({
  state,
  onRetry,
  stageWindowMonths,
}: {
  state: TopicDashboardPanelState
  onRetry: () => void
  stageWindowMonths?: number
}) {
  const { t } = useI18n()

  return (
    <section
      data-testid="topic-dashboard-panel"
      className="mt-5 rounded-[30px] border border-black/8 bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)] md:p-6"
    >
      {state.status === 'ready' ? (
        <TopicDashboard dashboard={state.data} stageWindowMonths={stageWindowMonths} />
      ) : state.status === 'error' ? (
        <div
          data-testid="topic-dashboard-error"
          className="rounded-[20px] border border-amber-200/80 bg-[linear-gradient(180deg,#fffaf3_0%,#ffffff_100%)] px-4 py-5"
        >
          <div className="text-[10px] uppercase tracking-[0.2em] text-black/34">
            {t('dashboard.errorTitle', 'Dashboard unavailable')}
          </div>
          <p className="mt-2 text-sm leading-6 text-black/62">
            {state.error || t('dashboard.errorMessage', 'Dashboard data is unavailable right now.')}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:border-black/18 hover:text-black"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('common.retry', 'Retry')}
          </button>
        </div>
      ) : (
        <div
          data-testid="topic-dashboard-loading"
          className="flex items-center gap-3 py-12 text-center text-sm text-black/48"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('dashboard.loading', 'Loading dashboard data...')}
        </div>
      )}
    </section>
  )
}
