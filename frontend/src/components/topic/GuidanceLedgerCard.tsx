import { Compass, MessageSquare, ScanSearch, Wand2 } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { TopicGuidanceDirective, TopicGuidanceLedgerState } from '@/types/alpha'

function directiveTone(status: TopicGuidanceDirective['status']) {
  if (status === 'accepted' || status === 'partial') return 'bg-emerald-50 text-emerald-700'
  if (status === 'deferred') return 'bg-amber-50 text-amber-700'
  if (status === 'consumed') return 'bg-sky-50 text-sky-700'
  if (status === 'superseded') return 'bg-black/[0.04] text-black/48'
  return 'bg-black/[0.04] text-black/56'
}

function directiveIcon(type: TopicGuidanceDirective['directiveType']) {
  if (type === 'challenge') return ScanSearch
  if (type === 'focus') return Compass
  if (type === 'style') return Wand2
  return MessageSquare
}

function directiveTypeLabel(
  directive: TopicGuidanceDirective,
  t: (key: string, fallback: string) => string,
) {
  if (directive.directiveType === 'challenge') {
    return t('workbench.guidanceTypeChallenge', 'Challenge')
  }
  if (directive.directiveType === 'focus') {
    return t('workbench.guidanceTypeFocus', 'Focus')
  }
  if (directive.directiveType === 'style') {
    return t('workbench.guidanceTypeStyle', 'Style')
  }
  if (directive.directiveType === 'command') {
    return t('workbench.guidanceTypeCommand', 'Command')
  }
  return t('workbench.guidanceTypeSuggest', 'Suggest')
}

function directiveWindowLabel(
  directive: TopicGuidanceDirective,
  t: (key: string, fallback: string) => string,
) {
  if (directive.appliesToRuns === 'until-cleared') {
    return t('workbench.guidanceWindowPersistent', 'Until changed')
  }
  if (directive.appliesToRuns === 'current-session') {
    return t('workbench.guidanceWindowSession', 'Current session')
  }
  return t('workbench.guidanceWindowNextRun', 'Next run')
}

function directiveStatusLabel(
  directive: TopicGuidanceDirective,
  t: (key: string, fallback: string) => string,
) {
  if (directive.status === 'accepted') {
    return t('workbench.guidanceStatusAccepted', 'Accepted')
  }
  if (directive.status === 'partial') {
    return t('workbench.guidanceStatusPartial', 'Partial')
  }
  if (directive.status === 'deferred') {
    return t('workbench.guidanceStatusDeferred', 'Deferred')
  }
  if (directive.status === 'superseded') {
    return t('workbench.guidanceStatusSuperseded', 'Superseded')
  }
  if (directive.status === 'consumed') {
    return t('workbench.guidanceStatusConsumed', 'Applied')
  }
  if (directive.status === 'rejected') {
    return t('workbench.guidanceStatusRejected', 'Rejected')
  }
  return t('workbench.guidanceStatusNone', 'Tracked')
}

export function GuidanceLedgerCard({
  guidance,
  onUsePrompt,
}: {
  guidance: TopicGuidanceLedgerState | null
  onUsePrompt: (prompt: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()

  if (!guidance) return null

  const latestApplication = guidance.latestApplication
  const latestApplicationDirectives = latestApplication?.directives.slice(0, 2) ?? []
  const latestDirectiveIds = new Set(
    latestApplication?.directives.map((directive) => directive.directiveId) ?? [],
  )
  const visibleDirectives = guidance.directives
    .filter(
      (directive) =>
        directive.status === 'accepted' ||
        directive.status === 'partial' ||
        directive.status === 'deferred' ||
        latestDirectiveIds.has(directive.id),
    )
    .slice(0, 3)

  const title =
    latestApplication?.summary ||
    guidance.summary.latestDirective ||
    guidance.summary.focusHeadline ||
    guidance.summary.styleHeadline ||
    guidance.summary.challengeHeadline

  return (
    <section
      data-testid="topic-guidance-ledger-card"
      className="rounded-[18px] border border-black/8 bg-white px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
          {t('workbench.guidanceEyebrow', copy('assistant.guidanceEyebrow', 'Guidance ledger'))}
        </div>
        <div className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/56">
          {guidance.summary.activeDirectiveCount}{' '}
          {t('workbench.guidanceActiveCount', copy('assistant.guidanceActiveCount', 'active'))}
        </div>
      </div>

      <h3 className="mt-2 text-[14px] font-semibold leading-6 text-black">
        {title ||
          t(
            'workbench.guidanceEmptyTitle',
            copy('assistant.guidanceEmptyTitle', 'No persistent guidance yet'),
          )}
      </h3>

      <p className="mt-1.5 text-[11px] leading-6 text-black/58">
        {latestApplication
          ? t(
              'workbench.guidanceLatestDek',
              copy(
                'assistant.guidanceLatestDek',
                'The latest research cycle has already absorbed part of this rail and written the adjustment back into the topic memory.',
              ),
            )
          : visibleDirectives.length > 0
            ? t(
                'workbench.guidanceDek',
                copy(
                  'assistant.guidanceDek',
                  'Suggestions in this rail become durable instructions for future research and writing, instead of disappearing inside chat history.',
                ),
              )
            : t(
                'workbench.guidanceEmptyDek',
                copy(
                  'assistant.guidanceEmptyDek',
                  'Use this rail to suggest focus, challenge the structure, or tune the writing tone. The system will absorb it into later runs.',
                ),
              )}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatCell
          label={t('workbench.guidanceStatAccepted', copy('assistant.guidanceStatAccepted', 'Accepted'))}
          value={guidance.summary.acceptedDirectiveCount}
        />
        <StatCell
          label={t('workbench.guidanceStatDeferred', copy('assistant.guidanceStatDeferred', 'Deferred'))}
          value={guidance.summary.deferredDirectiveCount}
        />
        <StatCell
          label={t('workbench.guidanceStatTracked', copy('assistant.guidanceStatTracked', 'Tracked'))}
          value={guidance.directives.length}
        />
      </div>

      {latestApplication ? (
        <div className="mt-2.5 rounded-[16px] border border-black/6 bg-white px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
              {t('workbench.guidanceLatestApplied', 'Applied in latest run')}
            </div>
            {latestApplication.stageIndex ? (
              <div className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-black/56">
                {`${t('workbench.guidanceLatestStageLabel', 'Stage')} ${latestApplication.stageIndex}`}
              </div>
            ) : null}
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-black/60">{latestApplication.summary}</p>

          {latestApplicationDirectives.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
                {t('workbench.guidanceLatestDirectives', 'What changed')}
              </div>
              {latestApplicationDirectives.map((directive) => (
                <button
                  key={directive.directiveId}
                  type="button"
                  onClick={() => onUsePrompt(directive.instruction)}
                  className="block w-full rounded-[14px] border border-black/6 bg-[var(--surface-soft)] px-3 py-2 text-left text-[10px] leading-5 text-black/60 transition hover:border-black/12 hover:text-black"
                  title={directive.note || directive.instruction}
                >
                  <div className="font-medium text-black/70">{directive.instruction}</div>
                  {directive.note ? <div className="mt-1 text-black/52">{directive.note}</div> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {visibleDirectives.length > 0 ? (
        <div className="mt-2.5 space-y-2">
          {visibleDirectives.map((directive) => {
            const Icon = directiveIcon(directive.directiveType)
            const appliedInLatestRun = latestDirectiveIds.has(directive.id)
            const summaryText =
              appliedInLatestRun && directive.lastAppliedSummary
                ? directive.lastAppliedSummary
                : directive.effectSummary

            return (
              <article
                key={directive.id}
                className="rounded-[16px] border border-black/6 bg-[var(--surface-soft)] px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-black/34">
                      <Icon className="h-3.5 w-3.5" />
                      <span>{directiveTypeLabel(directive, t)}</span>
                    </div>
                    <div className="mt-1.5 text-[11px] font-medium leading-5 text-black">
                      {directive.instruction}
                    </div>
                  </div>

                  <div
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${directiveTone(directive.status)}`}
                  >
                    {directiveStatusLabel(directive, t)}
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] leading-5 text-black/56">
                  <span>
                    {directive.scopeLabel} / {directiveWindowLabel(directive, t)}
                  </span>
                  {appliedInLatestRun ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-sky-700">
                      {t('workbench.guidanceLatestRunBadge', 'Latest run')}
                    </span>
                  ) : null}
                </div>

                {summaryText ? (
                  <p className="mt-1.5 text-[10px] leading-5 text-black/58">{summaryText}</p>
                ) : null}

                {directive.promptHint ? (
                  <button
                    type="button"
                    onClick={() => onUsePrompt(directive.promptHint)}
                    className="mt-2 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/62 transition hover:border-black/16 hover:text-black"
                  >
                    {t('workbench.guidancePromptCta', copy('assistant.guidancePromptCta', 'Continue from this'))}
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[
            t(
              'workbench.guidanceSeedFocus',
              'For the next hour, stay with the most decisive node and do not widen the topic.',
            ),
            t(
              'workbench.guidanceSeedStyle',
              'Make the stage naming a little more restrained, closer to article subheads.',
            ),
            t(
              'workbench.guidanceSeedSuggest',
              'Put more weight on mechanism-level judgment, not just performance listing.',
            ),
          ].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onUsePrompt(prompt)}
              className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[14px] bg-[var(--surface-soft)] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-black">{value}</div>
    </article>
  )
}
