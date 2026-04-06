/* eslint-disable react-refresh/only-export-components */

import { useI18n } from '@/i18n'
import type { TopicResearchBrief } from '@/types/alpha'

type ResearchContextSummaryItem = {
  id: 'world' | 'guidance' | 'calibration'
  label: string
  value: string
}

function pickFirstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.replace(/\s+/gu, ' ').trim() ?? ''
    if (normalized) return normalized
  }

  return ''
}

function clipText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function latestDirectiveInstruction(brief: TopicResearchBrief | null) {
  if (!brief) return ''

  const activeDirective = brief.guidance.directives.find((directive) =>
    directive.status === 'accepted' ||
    directive.status === 'partial' ||
    directive.status === 'deferred' ||
    directive.status === 'consumed',
  )

  return activeDirective?.instruction ?? ''
}

export function buildResearchContextSummaryItems(
  brief: TopicResearchBrief | null,
  t: (key: string, fallback: string) => string,
): ResearchContextSummaryItem[] {
  if (!brief) return []

  const worldSummary = pickFirstText(
    brief.world.summary.currentFocus,
    brief.world.summary.thesis,
  )
  const guidanceSummary = pickFirstText(
    brief.guidance.latestApplication?.summary,
    brief.guidance.summary.latestDirective,
    latestDirectiveInstruction(brief),
  )
  const calibrationSummary = pickFirstText(
    brief.pipeline.currentStage?.durationDecision?.summary,
    brief.pipeline.lastRun?.durationDecision?.summary,
    brief.session.report?.headline,
    brief.session.progress?.latestSummary,
    brief.sessionMemory.summary.lastResearchMove,
    brief.sessionMemory.summary.currentFocus,
  )

  const items = [
    {
      id: 'world',
      label: t('workbench.worldEyebrow', 'Research world'),
      value: worldSummary,
    },
    {
      id: 'guidance',
      label: t('workbench.guidanceEyebrow', 'Guidance ledger'),
      value: guidanceSummary,
    },
    {
      id: 'calibration',
      label: t('workbench.calibrationEyebrow', 'Current calibration'),
      value: calibrationSummary,
    },
  ] satisfies ResearchContextSummaryItem[]

  return items
    .filter((item) => Boolean(item.value))
    .map((item) => ({
      ...item,
      value: clipText(item.value, 170),
    })) as ResearchContextSummaryItem[]
}

export function ResearchContextSummary({
  brief,
}: {
  brief: TopicResearchBrief | null
}) {
  const { t } = useI18n()
  const items = buildResearchContextSummaryItems(brief, t)

  if (items.length === 0) return null

  return (
    <div data-testid="research-context-summary" className="mt-2.5 space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          data-testid={`research-context-summary-${item.id}`}
          className="rounded-[14px] bg-white/72 px-3 py-2"
        >
          <div className="text-[9px] uppercase tracking-[0.16em] text-black/36">
            {item.label}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-black/64">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}
