import { Clock3, Loader2, PauseCircle, Sparkles } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { formatDateTimeByLanguage, resolveLanguageLocale } from '@/i18n/locale'
import type {
  TopicResearchBrief,
  TopicResearchSessionState,
} from '@/types/alpha'

function formatTime(
  value: string | null | undefined,
  language: Parameters<typeof resolveLanguageLocale>[0],
) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return formatDateTimeByLanguage(date, language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRemaining(
  deadlineAt: string | null | undefined,
  language: Parameters<typeof resolveLanguageLocale>[0],
) {
  if (!deadlineAt) return null

  const remainingMs = new Date(deadlineAt).getTime() - Date.now()
  if (!Number.isFinite(remainingMs)) return null

  const formatter = new Intl.RelativeTimeFormat(resolveLanguageLocale(language), {
    numeric: 'auto',
  })
  if (remainingMs <= 0) return formatter.format(0, 'minute')

  const totalMinutes = Math.max(1, Math.round(remainingMs / 60000))
  if (totalMinutes < 60) return formatter.format(totalMinutes, 'minute')
  return formatter.format(Math.max(1, Math.round(totalMinutes / 60)), 'hour')
}

function formatCadence(
  cycleDelayMs: number | null | undefined,
  language: Parameters<typeof resolveLanguageLocale>[0],
) {
  if (!cycleDelayMs || !Number.isFinite(cycleDelayMs)) return null

  const locale = resolveLanguageLocale(language)
  if (cycleDelayMs < 60_000) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'short',
    }).format(Math.max(1, Math.round(cycleDelayMs / 1000)))
  }

  if (cycleDelayMs < 3_600_000) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'minute',
      unitDisplay: 'short',
    }).format(Math.max(1, Math.round(cycleDelayMs / 60_000)))
  }

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'hour',
    unitDisplay: 'short',
  }).format(Math.max(1, Math.round(cycleDelayMs / 3_600_000)))
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function buildStableTextItems(
  values: Array<string | null | undefined>,
  prefix: string,
  limit?: number,
) {
  const counts = new Map<string, number>()
  const output: Array<{ id: string; text: string }> = []

  for (const value of values) {
    const text = value?.trim()
    if (!text) continue

    const occurrence = counts.get(text) ?? 0
    counts.set(text, occurrence + 1)
    output.push({
      id: `${prefix}:${occurrence}:${text.slice(0, 48)}`,
      text,
    })

    if (typeof limit === 'number' && output.length >= limit) break
  }

  return output
}

function formatDecisionStageLabel(
  currentStage: number,
  nextStage: number,
  translate: (key: string, fallback: string) => string,
) {
  if (currentStage === nextStage) {
    return renderTemplate(
      translate('workbench.researchDecisionStageCurrent', 'Stage {stage}'),
      { stage: currentStage },
    )
  }

  return renderTemplate(
    translate('workbench.researchDecisionStageTransition', 'Stage {current} -> {next}'),
    {
      current: currentStage,
      next: nextStage,
    },
  )
}

export function ResearchSessionCard({
  session,
  brief = null,
  durationHours,
  onDurationHoursChange,
  onStart,
  onStop,
  starting,
  stopping = false,
  onUsePrompt,
}: {
  session: TopicResearchSessionState | null
  brief?: TopicResearchBrief | null
  durationHours: number
  onDurationHoursChange: (value: number) => void
  onStart: () => void
  onStop?: () => void
  starting: boolean
  stopping?: boolean
  onUsePrompt: (prompt: string) => void
}) {
  const { copy } = useProductCopy()
  const { preference, t } = useI18n()
  const language = preference.primary
  const text = (copyId: string, key: string, fallback: string) => copy(copyId, t(key, fallback))

  const report = session?.report ?? null
  const progress = session?.progress ?? null
  const running = Boolean(session?.active || progress?.activeSessionId || report?.status === 'running')
  const startedAt = formatTime(report?.startedAt ?? progress?.startedAt, language)
  const deadlineAt = formatTime(report?.deadlineAt ?? progress?.deadlineAt, language)
  const remaining = formatRemaining(report?.deadlineAt ?? progress?.deadlineAt, language)
  const cadenceLabel = formatCadence(session?.strategy?.cycleDelayMs, language)
  const latestDecision =
    brief?.pipeline.currentStage?.durationDecision ??
    brief?.pipeline.lastRun?.durationDecision ??
    null

  const displayDiscovered = Math.max(report?.discoveredPapers ?? 0, progress?.discoveredPapers ?? 0)
  const displayAdmitted = Math.max(report?.admittedPapers ?? 0, progress?.admittedPapers ?? 0)
  const displayGenerated = Math.max(report?.generatedContents ?? 0, progress?.generatedContents ?? 0)

  const title = text(
    'assistant.researchTitle',
    'workbench.researchTitle',
    'Keep research running beside the topic, not on top of the topic.',
  )
  const dek =
    (running ? report?.headline : report?.dek) ||
    text(
      'assistant.researchDek',
      'workbench.researchDek',
      'Start a sustained run here, let the backend keep searching and refining, then return to the thread when you want to steer it.',
    )

  const summary =
    latestDecision?.summary ||
    report?.headline ||
    report?.summary ||
    progress?.latestSummary ||
    ''
  const reportParagraphs = (
    report?.paragraphs.length
      ? report.paragraphs
      : [report?.summary || report?.latestStageSummary || progress?.latestSummary || '']
  )
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)
  const keyMoves = buildStableTextItems(report?.keyMoves.slice(0, 3) ?? [], 'move')
  const openQuestions = buildStableTextItems(report?.openQuestions.slice(0, 2) ?? [], 'question')
  const keyedReportParagraphs = buildStableTextItems(reportParagraphs.slice(1), 'report')

  const decisionActionLabel = latestDecision
    ? latestDecision.action === 'advance'
      ? text('assistant.researchDecisionAdvance', 'workbench.researchDecisionAdvance', 'Advance')
      : latestDecision.action === 'cycle-reset'
        ? text('assistant.researchDecisionCycleReset', 'workbench.researchDecisionCycleReset', 'Cycle reset')
        : text('assistant.researchDecisionStay', 'workbench.researchDecisionStay', 'Stay')
    : ''
  const decisionReasonLabel = latestDecision
    ? latestDecision.reason === 'orchestration'
      ? text('assistant.researchDecisionReasonOrchestration', 'workbench.researchDecisionReasonOrchestration', 'Orchestration judgment')
      : latestDecision.reason === 'stall-limit'
        ? text('assistant.researchDecisionReasonStallLimit', 'workbench.researchDecisionReasonStallLimit', 'Stall limit')
        : latestDecision.reason === 'progress-made'
          ? text('assistant.researchDecisionReasonProgressMade', 'workbench.researchDecisionReasonProgressMade', 'Progress made')
          : text('assistant.researchDecisionReasonAwaitEvidence', 'workbench.researchDecisionReasonAwaitEvidence', 'Awaiting evidence')
    : ''
  const decisionStageLabel = latestDecision
    ? formatDecisionStageLabel(latestDecision.currentStage, latestDecision.nextStage, t)
    : ''
  const decisionStallLabel =
    latestDecision && latestDecision.stallLimit > 0
      ? renderTemplate(
          t('workbench.researchDecisionStalls', 'Stalls {current}/{limit}'),
          {
            current: latestDecision.stallCountAfter,
            limit: latestDecision.stallLimit,
          },
        )
      : ''

  const quickQuestions = buildStableTextItems(
    [
      latestDecision
        ? latestDecision.action === 'advance'
          ? renderTemplate(
              t(
                'workbench.researchDecisionPromptAdvance',
                'Explain why stage {current} was ready to move into stage {next}.',
              ),
              {
                current: latestDecision.currentStage,
                next: latestDecision.nextStage,
              },
            )
          : latestDecision.action === 'cycle-reset'
            ? renderTemplate(
                t(
                  'workbench.researchDecisionPromptReset',
                  'Explain why the sweep reset after stage {current}, and what the next pass should revisit first.',
                ),
                {
                  current: latestDecision.currentStage,
                },
              )
            : renderTemplate(
                t(
                  'workbench.researchDecisionPromptStay',
                  'Explain what still prevents stage {stage} from advancing, and what evidence is missing.',
                ),
                {
                  stage: latestDecision.currentStage,
                },
              )
        : '',
      summary
        ? renderTemplate(
            t(
              'workbench.researchQuickSummary',
              'Continue from "{summary}" and explain the most important shift in this run.',
            ),
            { summary },
          )
        : '',
      t(
        'workbench.researchQuickBestNode',
        'After this run, which node should I read first, and why?',
      ),
      t(
        'workbench.researchQuickOpenQuestions',
        'What still feels unresolved after this research pass?',
      ),
    ],
    'quick',
    4,
  )

  const inputLocked = starting || running || stopping
  const hasExpandedDetails = Boolean(
    report || latestDecision || session?.strategy || quickQuestions.length > 0,
  )

  const statusLabel = stopping
    ? text('assistant.researchStatusStopping', 'workbench.researchStatusStopping', 'Stopping')
    : running
      ? text('assistant.researchStatusRunning', 'workbench.researchStatusRunning', 'Researching')
      : progress?.status === 'failed' || report?.status === 'failed'
        ? text('assistant.researchStatusFailed', 'workbench.researchStatusFailed', 'Interrupted')
        : progress?.status === 'completed' || report?.status === 'completed'
          ? text('assistant.researchStatusCompleted', 'workbench.researchStatusCompleted', 'Completed')
          : progress?.status === 'paused' || report?.status === 'paused'
            ? text('assistant.researchStatusPaused', 'workbench.researchStatusPaused', 'Paused')
            : text('assistant.researchStatusIdle', 'workbench.researchStatusIdle', 'Idle')

  const statusTone = stopping
    ? 'bg-amber-50 text-amber-700'
    : running
      ? 'bg-[#f4eee3] text-[#8a5a12]'
      : progress?.status === 'failed' || report?.status === 'failed'
        ? 'bg-red-50 text-red-700'
        : 'bg-[var(--surface-soft)] text-black/54'

  const timingLine = stopping
    ? text(
        'assistant.researchStoppingHint',
        'workbench.researchStoppingHint',
        'The current run is closing cleanly and will keep its latest judgments in the sidebar.',
      )
    : running
      ? remaining ||
        (deadlineAt
          ? renderTemplate(
              t('workbench.researchRunningUntil', 'Expected to wrap by {deadline}'),
              { deadline: deadlineAt },
            )
          : text('assistant.researchRunningHint', 'workbench.researchRunningHint', 'Research is running in the background.'))
      : startedAt
        ? renderTemplate(
            t(
              'workbench.researchLastRunWindow',
              'Last run started at {startedAt}{deadlineClause}',
            ),
            {
              startedAt,
              deadlineClause: deadlineAt
                ? renderTemplate(
                    t('workbench.researchDeadlineClause', ', aiming to close at {deadline}'),
                    { deadline: deadlineAt },
                  )
                : '',
            },
          )
        : text('assistant.researchIdleHint', 'workbench.researchIdleHint', 'No sustained run is active for this topic yet.')

  return (
    <section
      data-testid="topic-research-session-card"
      className="rounded-[18px] border border-black/8 bg-white px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
            {text('assistant.researchEyebrow', 'workbench.researchEyebrow', 'Sustained research')}
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-[14px] font-semibold leading-5 text-black">
            {title}
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-black/54">{dek}</p>
        </div>

        <div className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] ${statusTone}`}>
          {statusLabel}
        </div>
      </div>

      <div className="mt-3 rounded-[18px] bg-[var(--surface-soft)] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 text-[11px] text-black/56">
            <Clock3 className="h-3.5 w-3.5" />
            <span>{text('assistant.researchDurationLabel', 'workbench.researchDurationLabel', 'Duration')}</span>
          </div>

          <input
            type="number"
            min={1}
            max={48}
            value={durationHours}
            disabled={inputLocked}
            onChange={(event) => onDurationHoursChange(Number(event.target.value) || 1)}
            className="h-8 w-14 rounded-full border border-black/10 bg-white px-3 text-center text-[12px] text-black outline-none disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-black/42"
          />

          <span className="text-[11px] text-black/48">
            {text('assistant.researchDurationUnit', 'workbench.researchDurationUnit', 'hours')}
          </span>

          <div className="flex flex-wrap gap-1.5">
            {[2, 4, 8].map((hours) => (
              <button
                key={hours}
                type="button"
                disabled={inputLocked}
                onClick={() => onDurationHoursChange(hours)}
                className={`rounded-full px-2.5 py-1 text-[10px] transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  durationHours === hours
                    ? 'bg-black text-white'
                    : 'bg-white text-black/58 hover:text-black'
                }`}
              >
                {hours}h
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {running && onStop ? (
              <button
                type="button"
                data-testid="topic-research-stop"
                onClick={onStop}
                disabled={stopping || starting}
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] text-black/70 transition hover:border-black/18 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {stopping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                {stopping
                  ? text('assistant.researchStopPending', 'workbench.researchStopPending', 'Stopping')
                  : text('assistant.researchStop', 'workbench.researchStop', 'Stop run')}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onStart}
              disabled={starting || running || stopping}
              className="inline-flex items-center gap-2 rounded-full bg-black px-3 py-1.5 text-[10px] text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {starting
                ? text('assistant.researchStarting', 'workbench.researchStarting', 'Starting')
                : text('assistant.researchStart', 'workbench.researchStart', 'Start run')}
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] leading-5 text-black/48">{timingLine}</div>

        {summary ? (
          <div className="mt-2.5 rounded-[14px] bg-white px-3 py-2.5">
            <p className="line-clamp-2 text-[11px] leading-5 text-black/62">{summary}</p>
          </div>
        ) : null}
      </div>

      {hasExpandedDetails ? (
        <details className="mt-2.5 rounded-[16px] border border-black/6 bg-white/88 px-3 py-2.5">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-black/56">
            {text('assistant.researchReceiptToggle', 'workbench.researchReceiptToggle', 'View research details')}
          </summary>

          <div className="mt-2.5 space-y-2.5">
            {(report || latestDecision) ? (
              <div className="grid grid-cols-3 gap-2">
                <StatCell label={text('assistant.researchStatDiscovered', 'workbench.researchStatDiscovered', 'Found')} value={displayDiscovered} />
                <StatCell label={text('assistant.researchStatAdmitted', 'workbench.researchStatAdmitted', 'Admitted')} value={displayAdmitted} />
                <StatCell label={text('assistant.researchStatGenerated', 'workbench.researchStatGenerated', 'Updated')} value={displayGenerated} />
              </div>
            ) : null}

            {latestDecision ? (
              <div className="rounded-[16px] border border-black/6 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                    {text('assistant.researchDecisionEyebrow', 'workbench.researchDecisionEyebrow', 'Latest stage decision')}
                  </div>
                  <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/62">
                    {decisionActionLabel}
                  </span>
                  <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/62">
                    {decisionStageLabel}
                  </span>
                  <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/62">
                    {decisionReasonLabel}
                  </span>
                  {decisionStallLabel ? (
                    <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/62">
                      {decisionStallLabel}
                    </span>
                  ) : null}
                </div>
                {latestDecision.rationale && latestDecision.rationale !== latestDecision.summary ? (
                  <p className="mt-2 text-[10px] leading-5 text-black/52">
                    {latestDecision.rationale}
                  </p>
                ) : null}
              </div>
            ) : null}

            {session?.strategy ? (
              <div className="rounded-[14px] bg-[var(--surface-soft)] px-3 py-2 text-[10px] leading-5 text-black/56">
                {renderTemplate(
                  t(
                    'workbench.researchStrategyHint',
                    'The backend keeps researching on a {cadence} cadence. After {stalls} stalled passes, it advances or resets the stage sweep instead of looping forever.',
                  ),
                  {
                    cadence: cadenceLabel ?? t('workbench.researchCadenceFallback', '1 min'),
                    stalls: session.strategy.stageStallLimit,
                  },
                )}
              </div>
            ) : null}

            {keyedReportParagraphs.length > 0 ? (
              <div className="space-y-2">
                {keyedReportParagraphs.map((paragraph) => (
                  <p key={paragraph.id} className="text-[10px] leading-5 text-black/60">
                    {paragraph.text}
                  </p>
                ))}
              </div>
            ) : null}

            {keyMoves.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                  {text('assistant.researchKeyMoves', 'workbench.researchKeyMoves', 'Key moves')}
                </div>
                <div className="space-y-1">
                  {keyMoves.map((item) => (
                    <p key={item.id} className="text-[10px] leading-5 text-black/58">
                      {item.text}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {openQuestions.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                  {text('assistant.researchOpenQuestions', 'workbench.researchOpenQuestions', 'Open questions')}
                </div>
                <div className="space-y-1">
                  {openQuestions.map((item) => (
                    <p key={item.id} className="text-[10px] leading-5 text-black/58">
                      {item.text}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {quickQuestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {quickQuestions.slice(0, 2).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onUsePrompt(item.text)}
                    className="rounded-full border border-black/8 bg-white px-3 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[16px] bg-[var(--surface-soft)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">{label}</div>
      <div className="mt-1.5 text-[16px] font-semibold text-black">{value}</div>
    </article>
  )
}
