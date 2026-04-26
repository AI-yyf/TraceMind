import React from 'react'
import { BarChart3, GitBranch, Lightbulb, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { useI18n } from '@/i18n'
import { canonicalizePaperLikeRoute } from '@/utils/readingRoutes'
import { withStageWindowRoute } from '@/utils/stageWindow'

interface TopicDashboardProps {
  dashboard: TopicDashboardData
  stageWindowMonths?: number
}

function isHeuristicNarrative(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return false

  return /heuristic fit|stage-aligned query overlap|lexical and temporal relevance|reclassified as branch because|does not state an explicit|query overlap/iu.test(
    text,
  )
}

export const TopicDashboard: React.FC<TopicDashboardProps> = ({
  dashboard,
  stageWindowMonths,
}) => {
  const { t } = useI18n()
  const stats = dashboard.stats ?? {
    totalPapers: 0,
    mappedPapers: 0,
    pendingPapers: 0,
    totalNodes: 0,
    totalStages: 0,
    mappedStages: 0,
    timeSpanYears: 0,
    avgPapersPerNode: 0,
    citationCoverage: 0,
  }
  const mappedPapers = stats.mappedPapers ?? stats.totalPapers ?? 0
  const pendingPaperCount = stats.pendingPapers ?? 0
  const mappedStages = stats.mappedStages ?? stats.totalStages ?? 0
  const researchThreads = Array.isArray(dashboard.researchThreads)
    ? dashboard.researchThreads.slice(0, 4)
    : []
  const methodEvolution = Array.isArray(dashboard.methodEvolution)
    ? dashboard.methodEvolution
        .filter((item) => !isHeuristicNarrative(item.contribution))
        .slice(0, 4)
    : []
  const activeAuthors = Array.isArray(dashboard.activeAuthors)
    ? dashboard.activeAuthors.slice(0, 6)
    : []
  const methodShifts = Array.isArray(dashboard.trends?.methodShifts)
    ? dashboard.trends.methodShifts
        .slice(0, 4)
        .map((shift) => shift.replace(/^Methods:\s*/iu, '').trim())
        .filter(Boolean)
    : []
  const keyInsights = Array.isArray(dashboard.keyInsights)
    ? dashboard.keyInsights.filter((item) => !isHeuristicNarrative(item)).slice(0, 2)
    : []
  const pendingPapers = Array.isArray(dashboard.pendingPapers)
    ? dashboard.pendingPapers.slice(0, 4)
    : []

  const statItems = [
    { label: t('dashboard.stats.trackedPapers', 'Tracked papers'), value: stats.totalPapers },
    { label: t('dashboard.stats.mappedPapers', 'Mapped papers'), value: mappedPapers },
    { label: t('dashboard.stats.pendingPapers', 'Pending papers'), value: pendingPaperCount },
    { label: t('dashboard.stats.totalNodes'), value: stats.totalNodes },
    { label: t('dashboard.stats.totalStages'), value: stats.totalStages },
    { label: t('dashboard.stats.mappedStages', 'Mapped stages'), value: mappedStages },
    {
      label: t('dashboard.stats.timeSpan'),
      value:
        stats.timeSpanYears > 0
          ? `${stats.timeSpanYears} ${t('dashboard.stats.years')}`
          : `<1 ${t('dashboard.stats.years')}`,
    },
    {
      label: t('dashboard.stats.avgPapersPerNode'),
      value: stats.avgPapersPerNode.toFixed(1),
    },
    {
      label: t('dashboard.stats.citationCoverage'),
      value: `${Math.round(stats.citationCoverage * 100)}%`,
    },
  ]

  return (
    <div className="rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,#fffef9_0%,#ffffff_100%)] px-3 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[420px]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
            {t('dashboard.title', 'Research Dashboard')}
          </div>
          <h3 className="mt-1 text-[16px] font-semibold leading-[1.08] text-black">
            {dashboard.topicTitle || t('dashboard.title', 'Research Dashboard')}
          </h3>
          <p className="mt-1 text-[10.5px] leading-5 text-black/54">
            {t(
              'dashboard.mapCompanion',
              'Keep the map, the nodeed literature, and the still-unmapped papers in one place so breadth never disappears behind the current graph.',
            )}
          </p>
        </div>

        <div className="grid min-w-[260px] grid-cols-3 gap-1.5 sm:grid-cols-5 xl:grid-cols-9">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="rounded-[12px] border border-black/8 bg-white/88 px-2 py-1.5"
            >
              <div className="text-[14px] font-semibold leading-none text-[#7d1938]">
                {item.value}
              </div>
              <div className="mt-0.5 text-[9px] leading-4 text-black/48">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.95fr)]">
        <section className="rounded-[14px] border border-black/8 bg-white/78 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-[#7d1938]" />
            <h4 className="text-[12px] font-semibold text-black">
              {t('dashboard.threads.title', 'Research Threads')}
            </h4>
          </div>

          <div className="mt-2.5 space-y-2">
            {researchThreads.length > 0 ? (
              researchThreads.map((thread) => (
                <div
                  key={thread.nodeId}
                  className="border-l-2 pl-2.5"
                  style={{
                    borderColor: thread.isMilestone ? '#d1aa5c' : '#7d1938',
                  }}
                >
                  <div className="text-[9px] uppercase tracking-[0.14em] text-black/38">
                    {t('dashboard.threads.stage', 'Stage')} {thread.stageIndex} 路 {thread.paperCount}{' '}
                    {t('dashboard.threads.papers', 'papers')}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold leading-5 text-black">
                    {thread.nodeTitle}
                  </div>
                  <p className="mt-0.5 line-clamp-3 text-[10.5px] leading-5 text-black/60">
                    {thread.thesis}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-black/48">
                {t('dashboard.empty.noThreads', 'No research threads available yet.')}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[14px] border border-black/8 bg-white/78 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#7d1938]" />
            <h4 className="text-[12px] font-semibold text-black">
              {t('dashboard.evolution.title', 'Method Evolution')}
            </h4>
          </div>

          <div className="mt-2.5 space-y-2">
            {methodEvolution.length > 0 ? (
              methodEvolution.map((item) => (
                <div
                  key={`${item.paperId}-${item.year}`}
                  className="rounded-[12px] bg-[var(--surface-soft)]/55 px-2.5 py-2"
                >
                  <div className="text-[9px] uppercase tracking-[0.14em] text-black/38">
                    {item.year} 路 {t(`dashboard.evolution.impact.${item.impact}`)}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold leading-5 text-black">
                    {item.methodName}
                  </div>
                  <p className="mt-0.5 line-clamp-3 text-[10.5px] leading-5 text-black/60">
                    {item.contribution}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-black/48">
                {t('dashboard.empty.noEvolution', 'No method evolution data available yet.')}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[14px] border border-black/8 bg-white/78 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#7d1938]" />
            <h4 className="text-[12px] font-semibold text-black">
              {t('dashboard.authors.title', 'Active Authors')}
            </h4>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {activeAuthors.length > 0 ? (
              activeAuthors.map((author) => (
                <div
                  key={author.name}
                  className="rounded-full border border-black/8 bg-[var(--surface-soft)]/55 px-2.5 py-1"
                >
                  <div className="text-[10px] font-semibold text-black">{author.name}</div>
                  <div className="text-[9px] text-black/46">
                    {author.paperCount} {t('dashboard.authors.paperCount', 'papers')} 路 {author.citationCount}{' '}
                    {t('dashboard.authors.citations', 'citations')}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-black/48">
                {t('dashboard.empty.noAuthors', 'No active author data available yet.')}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[14px] border border-black/8 bg-white/78 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-[#7d1938]" />
            <h4 className="text-[12px] font-semibold text-black">
              {t('dashboard.pending.title', 'Pending Literature')}
            </h4>
          </div>

          <div className="mt-2.5 space-y-2">
            {pendingPapers.length > 0 ? (
              pendingPapers.map((paper) => (
                <Link
                  key={paper.paperId}
                  to={withStageWindowRoute(
                    canonicalizePaperLikeRoute({
                      paperId: paper.paperId,
                      route: paper.route,
                      topicId: dashboard.topicId,
                    }),
                    stageWindowMonths ?? 1,
                  )}
                  className="block rounded-[12px] border border-dashed border-black/10 bg-[#fcfaf6] px-2.5 py-2 transition hover:border-black/18 hover:bg-white"
                >
                  <div className="text-[9px] uppercase tracking-[0.14em] text-black/38">
                    {paper.stageLabel || t('dashboard.pending.unassigned', 'Awaiting node placement')}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-5 text-black">
                    {paper.title}
                  </div>
                  <p className="mt-0.5 line-clamp-3 text-[10.5px] leading-5 text-black/60">
                    {paper.summary}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-[11px] text-black/48">
                {t('dashboard.pending.empty', 'All tracked papers in this stage window are already placed into nodes.')}
              </p>
            )}
          </div>

          <div className="mt-3 border-t border-black/8 pt-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-[#7d1938]" />
              <h4 className="text-[12px] font-semibold text-black">
                {t('dashboard.insights.title', 'Key Insights')}
              </h4>
            </div>

            <div className="mt-2 space-y-1.5">
              {keyInsights.length > 0 ? (
                keyInsights.map((insight) => (
                  <p key={insight} className="text-[10.5px] leading-5 text-black/62">
                    {insight}
                  </p>
                ))
              ) : (
                <p className="text-[11px] text-black/48">
                  {t('dashboard.empty.noInsights', 'No key insights available yet.')}
                </p>
              )}
            </div>

            {methodShifts.length > 0 ? (
              <div className="mt-3 rounded-[12px] bg-[#fbfaf6] px-2.5 py-2.5">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-black/36">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>{t('dashboard.evolution.title', 'Method Evolution')}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {methodShifts.map((shift) => (
                    <span
                      key={shift}
                      className="rounded-full border border-black/8 bg-white px-2 py-0.5 text-[9px] text-black/56"
                    >
                      {shift}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
