import { useI18n } from '@/i18n'
import { useProductCopy } from '@/hooks/useProductCopy'
import type { TopicCognitiveMemoryEntry, TopicResearchBrief } from '@/types/alpha'
import { clipText, renderTemplate } from './WorkbenchChatEngine'

function uniqueStrings(values: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value?.replace(/\s+/gu, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function uniquePromptActions(
  values: Array<{ id?: string; label: string; prompt: string } | null | undefined>,
  limit = 3,
) {
  const seen = new Set<string>()
  const output: Array<{ id: string; label: string; prompt: string }> = []

  for (const value of values) {
    if (!value) continue
    const label = value.label.replace(/\s+/gu, ' ').trim()
    const prompt = value.prompt.replace(/\s+/gu, ' ').trim()
    if (!label || !prompt) continue
    const key = `${label}::${prompt}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ id: value.id ?? key, label, prompt })
    if (output.length >= limit) break
  }

  return output
}

function buildCognitivePrompt(
  entry: TopicCognitiveMemoryEntry,
  translate: (key: string, fallback: string) => string,
) {
  const title = localizeCognitiveEntryTitle(entry.title, translate)
  return renderTemplate(
    translate(
      'workbench.calibrationPromptTemplate',
      'Continue from "{title}" and explain how it should shape the current research mainline: {summary}',
    ),
    {
      title: clipText(title, 48),
      summary: clipText(entry.summary, 180),
    },
  )
}

function memorySourceLabel(
  source: TopicCognitiveMemoryEntry['source'],
  translate: (key: string, fallback: string) => string,
) {
  if (source === 'guidance') return translate('workbench.calibrationSourceGuidance', 'Guidance')
  if (source === 'report') return translate('workbench.calibrationSourceReport', 'Report')
  if (source === 'world') return translate('workbench.calibrationSourceWorld', 'World')
  if (source === 'generation') return translate('workbench.calibrationSourceGeneration', 'Generation')
  return translate('workbench.calibrationSourceSession', 'Session')
}

function normalizeInlineLabel(value: string) {
  return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase()
}

function localizeCognitiveEntryTitle(
  value: string,
  translate: (key: string, fallback: string) => string,
) {
  const normalized = normalizeInlineLabel(value)

  if (normalized === 'current focus') {
    return translate('workbench.cognitiveCurrentFocus', 'Current focus')
  }
  if (normalized === 'established judgment') {
    return translate('workbench.cognitiveEstablishedJudgment', 'Established judgment')
  }
  if (normalized === 'conversation contract') {
    return translate('workbench.cognitiveConversationContract', 'Conversation contract')
  }
  if (normalized === 'reviewer watchpoint') {
    return translate('workbench.cognitiveReviewerWatchpoint', 'Reviewer watchpoint')
  }

  return value
}

function isGenericReferenceLabel(
  value: string,
  translate: (key: string, fallback: string) => string,
) {
  const normalized = normalizeInlineLabel(value)
  const genericLabels = [
    'open question',
    'open questions',
    'question',
    'questions',
    translate('workbench.openQuestions', 'Questions'),
  ].map((item) => normalizeInlineLabel(item))

  return genericLabels.includes(normalized)
}

function buildCalibrationActionLabel(
  entry: TopicCognitiveMemoryEntry,
  translate: (key: string, fallback: string) => string,
) {
  const sourceLabel = memorySourceLabel(entry.source, translate)
  const title = clipText(localizeCognitiveEntryTitle(entry.title, translate), 24)
  const summary = clipText(entry.summary, 24)

  if (!title) {
    return clipText(`${sourceLabel} · ${summary}`, 36)
  }

  if (isGenericReferenceLabel(entry.title, translate) || normalizeInlineLabel(title) === normalizeInlineLabel(summary)) {
    return clipText(`${sourceLabel} · ${summary}`, 36)
  }

  return clipText(`${sourceLabel} · ${title}`, 36)
}

function PulseMemoryLane({
  title,
  entries,
  onUsePrompt,
  tone = 'soft',
  translate,
}: {
  title: string
  entries: TopicCognitiveMemoryEntry[]
  onUsePrompt: (prompt: string) => void
  tone?: 'soft' | 'accent'
  translate: (key: string, fallback: string) => string
}) {
  if (entries.length === 0) return null

  return (
    <div className="mt-2.5 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">{title}</div>
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onUsePrompt(buildCognitivePrompt(entry, translate))}
          className={`block w-full rounded-[16px] border px-3 py-2.5 text-left transition ${
            tone === 'accent'
              ? 'border-black/8 bg-white hover:border-black/16'
              : 'border-black/6 bg-white/78 hover:border-black/12'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-[11px] font-medium leading-5 text-black">
              {localizeCognitiveEntryTitle(entry.title, translate)}
            </div>
            <div className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-black/34">
              {memorySourceLabel(entry.source, translate)}
            </div>
          </div>
          <p className="mt-1 text-[10px] leading-5 text-black/58">{entry.summary}</p>
        </button>
      ))}
    </div>
  )
}

export function WorkbenchPulseCard({
  brief,
  onUsePrompt,
}: {
  brief: TopicResearchBrief | null
  onUsePrompt: (prompt: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const report = brief?.session.report ?? null
  const memory = brief?.sessionMemory.summary ?? null
  const pipeline = brief?.pipeline ?? null
  const world = brief?.world ?? null
  const guidanceSummary = brief?.guidance.summary ?? null
  const latestGuidance = brief?.guidance.latestApplication ?? null
  const cognitive = brief?.cognitiveMemory ?? null
  const latestDecision =
    pipeline?.currentStage?.durationDecision ??
    pipeline?.lastRun?.durationDecision ??
    null
  const decisionActionLabel = latestDecision
    ? latestDecision.action === 'advance'
      ? t('workbench.researchDecisionAdvance', 'Advance')
      : latestDecision.action === 'cycle-reset'
        ? t('workbench.researchDecisionCycleReset', 'Cycle reset')
        : t('workbench.researchDecisionStay', 'Stay')
    : ''
  const decisionStageLabel = latestDecision
    ? renderTemplate(
        latestDecision.currentStage === latestDecision.nextStage
          ? t('workbench.researchDecisionStageCurrent', 'Stage {stage}')
          : t('workbench.researchDecisionStageTransition', 'Stage {current} -> {next}'),
        latestDecision.currentStage === latestDecision.nextStage
          ? { stage: latestDecision.currentStage }
          : {
              current: latestDecision.currentStage,
              next: latestDecision.nextStage,
            },
      )
    : ''
  const decisionPrompt = latestDecision
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
    : ''

  const title =
    cognitive?.focus ||
    world?.summary.currentFocus ||
    memory?.currentFocus ||
    report?.headline ||
    latestDecision?.summary ||
    t('workbench.pulseFallbackTitle', 'The research thread is still taking shape.')
  const summary =
    cognitive?.continuity ||
    world?.summary.continuity ||
    memory?.continuity ||
    report?.summary ||
    latestDecision?.rationale ||
    guidanceSummary?.latestAppliedSummary ||
    ''
  const conversationContract =
    cognitive?.conversationContract ||
    memory?.conversationStyle ||
    ''
  const preserveEntries = cognitive?.projectMemories.slice(0, 2) ?? []
  const adjustEntries = cognitive?.feedbackMemories.slice(0, 2) ?? []
  const referenceEntries = cognitive?.referenceMemories.slice(0, 2) ?? []
  const applyingNext = uniqueStrings(
    [
      latestDecision?.summary,
      latestGuidance?.summary,
      ...adjustEntries.map((entry) => entry.summary),
      guidanceSummary?.latestDirective,
    ],
    3,
  )
  const questions = uniqueStrings(
    [
      ...referenceEntries.map((entry) => entry.summary),
      world?.summary.dominantQuestion,
      ...(report?.openQuestions ?? []),
      ...(pipeline?.globalOpenQuestions ?? []),
      ...(memory?.openQuestions ?? []),
    ],
    2,
  )
  const quickPrompts = uniquePromptActions(
    [
      decisionPrompt
        ? {
            id: `decision:${latestDecision?.currentStage ?? 'unknown'}:${latestDecision?.nextStage ?? 'unknown'}`,
            label: decisionActionLabel || t('workbench.calibrationPromptDecision', 'Stage decision'),
            prompt: decisionPrompt,
          }
        : null,
      ...referenceEntries.map((entry) => ({
        id: `reference:${entry.id}`,
        label: buildCalibrationActionLabel(entry, t),
        prompt: buildCognitivePrompt(entry, t),
      })),
      latestGuidance?.directives[0]
        ? {
            id: `guidance:${latestGuidance.directives[0].instruction}`,
            label: clipText(latestGuidance.directives[0].instruction, 36),
            prompt: latestGuidance.directives[0].instruction,
          }
        : null,
    ],
    2,
  )

  if (
    !brief ||
    (!title &&
      !summary &&
      !conversationContract &&
      preserveEntries.length === 0 &&
      adjustEntries.length === 0 &&
      questions.length === 0)
  ) {
    return null
  }

  return (
    <section
      data-testid="topic-workbench-pulse-card"
      className="rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,#fffdf9_0%,#f8f5ef_100%)] px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
          {t('workbench.calibrationEyebrow', copy('assistant.calibrationEyebrow', 'Current calibration'))}
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/56">
          {brief.session.active
            ? t('workbench.researchStatusRunning', 'Researching')
            : report?.status === 'completed'
              ? t('workbench.researchStatusCompleted', 'Completed')
              : report?.status === 'failed'
                ? t('workbench.researchStatusFailed', 'Interrupted')
                : report?.status === 'paused'
                  ? t('workbench.researchStatusPaused', 'Paused')
                  : t('workbench.researchStatusIdle', 'Idle')}
        </div>
      </div>

      <h3 className="mt-2 text-[14px] font-semibold leading-6 text-black">{title}</h3>
      {summary ? (
        <p className="mt-2 text-[11px] leading-6 text-black/60">{clipText(summary, 220)}</p>
      ) : null}

      {conversationContract ? (
        <div className="mt-2 rounded-[16px] bg-white/82 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.calibrationContract', copy('assistant.calibrationContract', 'How I should continue'))}
          </div>
          <p className="mt-1 text-[10px] leading-5 text-black/58">{clipText(conversationContract, 220)}</p>
        </div>
      ) : null}

      {latestDecision ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/60">
            {decisionActionLabel}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/60">
            {decisionStageLabel}
          </span>
        </div>
      ) : null}

      {applyingNext.length > 0 ? (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.calibrationApplyingNext', copy('assistant.calibrationApplyingNext', 'Applying next'))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {applyingNext.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onUsePrompt(item)}
                className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <PulseMemoryLane
        title={t('workbench.calibrationPreserveTitle', copy('assistant.calibrationPreserve', 'Will preserve'))}
        entries={preserveEntries}
        onUsePrompt={onUsePrompt}
        translate={t}
      />

      <PulseMemoryLane
        title={t('workbench.calibrationAdjustTitle', copy('assistant.calibrationAdjust', 'Will adjust'))}
        entries={adjustEntries}
        onUsePrompt={onUsePrompt}
        tone="accent"
        translate={t}
      />

      {questions.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {questions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onUsePrompt(item)}
              className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      {quickPrompts.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {quickPrompts.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onUsePrompt(item.prompt)}
              className="rounded-full bg-black px-2.5 py-1 text-[10px] text-white transition hover:bg-black/92"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}