import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { TopicResearchBrief } from '@/types/alpha'
import {
  filterMeaningfulWorkbenchStrings,
  sanitizeWorkbenchText,
} from '@/utils/workbenchText'

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
  const worldSummary = brief?.world?.summary
  const worldAgenda = brief?.world?.agenda ?? []
  const sessionSummary = brief?.sessionMemory?.summary
  const guidanceSummary = brief?.guidance?.summary

  const currentLine = sanitizeWorkbenchText(
    worldSummary?.currentFocus ||
      worldSummary?.thesis ||
      sessionSummary?.currentFocus ||
      '',
    240,
  )
  const latestDirective = sanitizeWorkbenchText(
    brief?.guidance?.latestApplication?.summary ||
      guidanceSummary?.latestDirective ||
      '',
    220,
  )
  const agendaPrompts = filterMeaningfulWorkbenchStrings(
    worldAgenda.slice(0, 2).map((item) => item.suggestedPrompt || item.title) ?? [],
    2,
    120,
  )
  const starterActions = uniqueStrings(
    filterMeaningfulWorkbenchStrings(
      [starterPrompt, latestDirective, ...agendaPrompts, ...suggestedQuestions],
      4,
      140,
    ),
    4,
  )
  const shouldSurfaceDirective = Boolean(latestDirective) && !starterActions.includes(latestDirective)

  return (
    <div className="space-y-2">
      <div className="rounded-[14px] border border-black/8 bg-[var(--surface-soft)] px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
          {t('workbench.emptyEyebrow', 'Conversation start')}
        </div>
        <p className="mt-1.5 text-[12px] leading-5 text-black/64">
          {currentLine ||
            workbenchText(
              'assistant.empty',
              'workbench.empty',
              'Ask from the current topic line and I will keep the answer grounded in what you are reading.',
            )}
        </p>
      </div>

      {shouldSurfaceDirective ? (
        <button
          type="button"
          onClick={() => onUsePrompt(latestDirective)}
          className="block w-full rounded-[12px] border border-black/8 bg-white px-3 py-2 text-left transition hover:border-black/14"
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
            {t('workbench.emptyLatestDirective', 'Latest guidance')}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-black/58">{latestDirective}</p>
        </button>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {starterActions
          .filter(Boolean)
          .map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onUsePrompt(item)}
              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/66 transition hover:border-black/16 hover:text-black"
            >
              {item}
            </button>
          ))}
      </div>
      {guidanceSummary?.activeDirectiveCount ? (
        <p className="text-[10px] text-black/42">
          {t('workbench.emptyDirectiveCount', '{count} active directives').replace(
            '{count}',
            String(guidanceSummary.activeDirectiveCount),
          )}
        </p>
      ) : null}
    </div>
  )
}
