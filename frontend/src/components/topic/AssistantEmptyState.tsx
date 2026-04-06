import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { TopicResearchBrief } from '@/types/alpha'

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

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export function AssistantEmptyState({
  starterPrompt,
  suggestedQuestions,
  brief = null,
  onUsePrompt,
}: {
  starterPrompt: string
  suggestedQuestions: string[]
  brief?: TopicResearchBrief | null
  onUsePrompt: (prompt: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))

  const currentLine =
    brief?.world.summary.currentFocus ||
    brief?.world.summary.thesis ||
    brief?.sessionMemory.summary.currentFocus ||
    ''
  const latestDirective =
    brief?.guidance.latestApplication?.summary ||
    brief?.guidance.summary.latestDirective ||
    ''
  const agendaPrompts = uniqueStrings(
    brief?.world.agenda
      .slice(0, 2)
      .map((item) => item.suggestedPrompt || item.title) ?? [],
    2,
  )
  const starterActions = uniqueStrings(
    [starterPrompt, latestDirective, ...agendaPrompts, ...suggestedQuestions],
    5,
  )

  const metricChips = [
    renderTemplate(
      t('workbench.emptyDirectiveCount', '{count} active directives'),
      { count: brief?.guidance.summary.activeDirectiveCount ?? 0 },
    ),
    renderTemplate(
      t('workbench.emptyAgendaCount', '{count} agenda items'),
      { count: brief?.world.agenda.length ?? 0 },
    ),
    renderTemplate(
      t('workbench.emptyQuestionCount', '{count} open questions'),
      {
        count:
          brief?.world.questions.length ??
          brief?.pipeline.globalOpenQuestions.length ??
          0,
      },
    ),
  ]

  const capabilityChips = [
    t('workbench.capabilityExplain', 'Explain the mainline'),
    t('workbench.capabilityContext', 'Restore node context'),
    t('workbench.capabilityEvidence', 'Interrogate evidence'),
    t('workbench.capabilityCompare', 'Compare nearby papers'),
  ]

  return (
    <div className="space-y-2.5">
      <div className="rounded-[16px] bg-[var(--surface-soft)] px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.emptyEyebrow', 'Conversation Start')}
          </div>
          <div className="rounded-full bg-white px-2.5 py-1 text-[10px] text-black/50">
            {t('workbench.emptyGroundedStatus', 'Grounded in topic')}
          </div>
        </div>

        <div className="mt-2 rounded-[16px] bg-white/82 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.emptyCurrentLine', 'Current line')}
          </div>
          <p className="mt-1.5 text-[12px] leading-6 text-black/64">
            {currentLine ||
              workbenchText(
                'assistant.empty',
                'workbench.empty',
                'I stay with the current topic, so each turn helps clarify this research line instead of drifting into generic Q&A.',
              )}
          </p>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {[...metricChips, ...capabilityChips.slice(0, 2)].map((item) => (
            <span
              key={item}
              className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/58"
            >
              {item}
            </span>
          ))}
        </div>

        {latestDirective ? (
          <button
            type="button"
            onClick={() => onUsePrompt(latestDirective)}
            className="mt-2.5 block w-full rounded-[16px] border border-black/8 bg-white px-3 py-2.5 text-left transition hover:border-black/14"
          >
            <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
              {t('workbench.emptyLatestDirective', 'Latest absorbed guidance')}
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-black/60">{latestDirective}</p>
          </button>
        ) : null}

        <p className="mt-2 text-[11px] leading-5 text-black/48">
          {workbenchText(
            'assistant.capabilityLine',
            'workbench.capabilityLine',
            'Start from a node, evidence block, or search result to keep the next answer grounded.',
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {starterActions
          .filter(Boolean)
          .map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onUsePrompt(item)}
              className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[10px] text-black/66 shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:border-black/14 hover:text-black"
            >
              {item}
            </button>
          ))}
      </div>
    </div>
  )
}
