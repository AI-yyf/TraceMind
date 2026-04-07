/**
 * 主题仪表盘组件
 * 
 * 展示主题的研究主线、方法演进、活跃作者等宏观视角
 * 使用 Tailwind CSS（与项目其他部分一致）
 */

import React from 'react'
import { TrendingUp, Users, Lightbulb, BarChart3 } from 'lucide-react'
import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { useI18n } from '@/i18n'

interface TopicDashboardProps {
  dashboard: TopicDashboardData
}

export const TopicDashboard: React.FC<TopicDashboardProps> = ({ dashboard }) => {
  return (
    <div className="space-y-6">
      {/* 统计摘要 */}
      <StatsSection dashboard={dashboard} />

      {/* 研究主线 */}
      <ResearchThreadsSection threads={dashboard.researchThreads} />

      {/* 方法演进 */}
      <MethodEvolutionSection evolution={dashboard.methodEvolution} />

      {/* 活跃作者 */}
      <ActiveAuthorsSection authors={dashboard.activeAuthors} />

      {/* 关键洞察 */}
      {dashboard.keyInsights.length > 0 && (
        <KeyInsightsSection insights={dashboard.keyInsights} />
      )}
    </div>
  )
}

// 统计摘要
const StatsSection: React.FC<{ dashboard: TopicDashboardData }> = ({ dashboard }) => {
  const { t } = useI18n()
  const { stats } = dashboard

  const statItems = [
    { label: t('dashboard.stats.totalPapers'), value: stats.totalPapers },
    { label: t('dashboard.stats.totalNodes'), value: stats.totalNodes },
    { label: t('dashboard.stats.totalStages'), value: stats.totalStages },
    { label: t('dashboard.stats.timeSpan'), value: `${stats.timeSpanYears} ${t('dashboard.stats.years')}` },
    { label: t('dashboard.stats.avgPapersPerNode'), value: stats.avgPapersPerNode.toFixed(1) },
    { label: t('dashboard.stats.citationCoverage'), value: `${(stats.citationCoverage * 100).toFixed(0)}%` },
  ]

  return (
    <div className="rounded-2xl border border-black/8 bg-[var(--surface-soft)] p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-black/48" />
        <h3 className="text-sm font-semibold text-black">
          {t('dashboard.stats.title')}
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
        {statItems.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-lg font-semibold text-amber-700">
              {item.value}
            </div>
            <div className="text-[10px] text-black/48 mt-0.5">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 研究主线
const ResearchThreadsSection: React.FC<{ threads: TopicDashboardData['researchThreads'] }> = ({ threads }) => {
  const { t } = useI18n()

  if (!threads || threads.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-black/48" />
          <h3 className="text-sm font-semibold text-black">
            {t('dashboard.threads.title')}
          </h3>
        </div>
        <p className="text-sm text-black/48">
          {t('dashboard.empty.noThreads')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-black/48" />
        <h3 className="text-sm font-semibold text-black">
          {t('dashboard.threads.title')}
        </h3>
      </div>
      <p className="text-xs text-black/48 mb-3">
        {t('dashboard.threads.description')}
      </p>

      <div className="space-y-2">
        {threads.map((thread) => (
          <div
            key={thread.nodeId}
            className={`rounded-xl border p-3 transition ${
              thread.isMilestone
                ? 'border-amber-300/60 bg-amber-50/60'
                : 'border-black/8 bg-white'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                thread.isMilestone
                  ? 'bg-amber-600 text-white'
                  : 'bg-black/[0.06] text-black/58'
              }`}>
                {t('dashboard.threads.stage')} {thread.stageIndex + 1}
              </span>
              {thread.isMilestone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <Lightbulb className="h-3 w-3" />
                  {t('dashboard.threads.milestone')}
                </span>
              )}
            </div>
            <div className="text-sm font-semibold text-black">
              {thread.nodeTitle}
            </div>
            <div className="mt-0.5 text-xs text-black/56">
              {thread.thesis}
            </div>
            <div className="mt-1 flex gap-3 text-[10px] text-black/48">
              <span>
                {thread.paperCount} {t('dashboard.threads.papers')}
              </span>
              <span>
                {t('dashboard.threads.keyPaper')}: {thread.keyPaperTitle}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 方法演进
const MethodEvolutionSection: React.FC<{ evolution: TopicDashboardData['methodEvolution'] }> = ({ evolution }) => {
  const { t } = useI18n()

  if (!evolution || evolution.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-black/48" />
          <h3 className="text-sm font-semibold text-black">
            {t('dashboard.evolution.title')}
          </h3>
        </div>
        <p className="text-sm text-black/48">
          {t('dashboard.empty.noEvolution')}
        </p>
      </div>
    )
  }

  const getImpactStyle = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-green-100 text-green-700 border-green-200'
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200'
      default: return 'bg-black/[0.04] text-black/56 border-black/8'
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="h-4 w-4 text-black/48" />
        <h3 className="text-sm font-semibold text-black">
          {t('dashboard.evolution.title')}
        </h3>
      </div>
      <p className="text-xs text-black/48 mb-3">
        {t('dashboard.evolution.description')}
      </p>

      <div className="space-y-2">
        {evolution.map((item) => (
          <div
            key={`${item.paperId}-${item.year}`}
            className="rounded-xl border border-black/8 bg-white p-3"
          >
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {item.year}
              </span>
              <span className="text-sm font-semibold text-black">
                {item.methodName}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getImpactStyle(item.impact)}`}>
                {t(`dashboard.evolution.impact.${item.impact}`)}
              </span>
            </div>
            <div className="text-xs text-black/56">
              {item.contribution}
            </div>
            <div className="mt-0.5 text-[10px] text-black/40">
              {item.paperTitle}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 活跃作者
const ActiveAuthorsSection: React.FC<{ authors: TopicDashboardData['activeAuthors'] }> = ({ authors }) => {
  const { t } = useI18n()

  if (!authors || authors.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-black/48" />
          <h3 className="text-sm font-semibold text-black">
            {t('dashboard.authors.title')}
          </h3>
        </div>
        <p className="text-sm text-black/48">
          {t('dashboard.empty.noAuthors')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-black/48" />
          <h3 className="text-sm font-semibold text-black">
            {t('dashboard.authors.title')}
          </h3>
        </div>
        <p className="text-xs text-black/48 mb-3">
          {t('dashboard.authors.description')}
        </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {authors.map((author) => (
          <div
            key={author.name}
            className="rounded-xl border border-black/8 bg-white p-3"
          >
            <div className="text-sm font-semibold text-black">
              {author.name}
            </div>
            {author.affiliation && (
              <div className="text-[10px] text-black/48 mt-0.5">
                {author.affiliation}
              </div>
            )}
            <div className="mt-1 flex gap-3 text-[10px] text-black/56">
              <span>
                {author.paperCount} {t('dashboard.authors.paperCount')}
              </span>
              <span>
                {author.citationCount} {t('dashboard.authors.citations')}
              </span>
            </div>
            {author.researchFocus.length > 0 && (
              <div className="mt-1.5">
                <span className="text-[10px] text-black/40">
                  {t('dashboard.authors.focus')}:
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {author.researchFocus.map((focus) => (
                    <span
                      key={focus}
                      className="inline-block rounded-full border border-black/10 px-2 py-0.5 text-[10px] text-black/56"
                    >
                      {focus}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 关键洞察
const KeyInsightsSection: React.FC<{ insights: string[] }> = ({ insights }) => {
  const { t } = useI18n()

  return (
    <div className="rounded-2xl border border-blue-200/60 bg-blue-50/50 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-black">
          {t('dashboard.insights.title')}
        </h3>
      </div>
      <ul className="ml-4 space-y-1">
        {insights.map((insight, index) => (
          <li key={index} className="text-sm text-black/68 list-disc">
            {insight}
          </li>
        ))}
      </ul>
    </div>
  )
}
