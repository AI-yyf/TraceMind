import { useI18n } from '@/i18n'
import type { TopicResearchBrief } from '@/types/alpha'
import {
  filterMeaningfulWorkbenchStrings,
  sanitizeWorkbenchText,
} from '@/utils/workbenchText'

type EmptyStateSurfaceMode = 'default' | 'reading' | 'map'

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
  compact = false,
  surfaceMode = 'default',
  onUsePrompt,
}: {
  starterPrompt: string
  suggestedQuestions: string[]
  brief?: TopicResearchBrief | null
  compact?: boolean
  surfaceMode?: EmptyStateSurfaceMode
  onUsePrompt: (prompt: string) => void
}) {
  const { t } = useI18n()
  const surfaceText = (workbenchKey: string, fallback: string, topicKey?: string) =>
    t(surfaceMode === 'reading' ? workbenchKey : topicKey ?? workbenchKey, t(workbenchKey, fallback))
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
  const compactAction =
    uniqueStrings(
      filterMeaningfulWorkbenchStrings(
        [latestDirective, starterPrompt, ...agendaPrompts, ...suggestedQuestions],
        1,
        120,
      ),
      1,
    )[0] ?? ''
  const hasGroundedContext = Boolean(currentLine || latestDirective || brief)
  const visibleStarterActions = !compact && hasGroundedContext ? starterActions : []

  if (compact && !compactAction) {
    return null
  }

  if (!compact && !hasGroundedContext && starterActions.length === 0) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <p className="max-w-[280px] text-center text-[12px] leading-6 text-black/36">
          {surfaceText(
            'workbench.emptyBlankState',
            '从这里开始提问。工作台会围绕当前主题逐步收束，不抢占主内容。',
            'topic.workbenchEmptyBlankState',
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!compact ? (
        <div className="py-6">
          <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
            {surfaceText('workbench.emptyEyebrow', 'Conversation start', 'topic.workbenchEmptyEyebrow')}
          </div>
          <p className="mt-2 max-w-[320px] text-[13px] leading-7 text-black/60">
            {currentLine ||
              surfaceText(
                'workbench.empty',
                '从当前主题直接发问，我会把回答收束在你正在阅读的主线上。',
                'topic.workbenchEmpty',
              )}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onUsePrompt(compactAction)}
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/66 transition hover:border-black/16 hover:text-black"
          >
            {compactAction}
          </button>
        </div>
      )}

      {!compact && shouldSurfaceDirective ? (
        <button
          type="button"
          onClick={() => onUsePrompt(latestDirective)}
          className="block w-full border-t border-black/8 pt-3 text-left transition hover:text-black"
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
            {surfaceText(
              'workbench.emptyLatestDirective',
              'Latest guidance',
              'topic.workbenchLatestDirective',
            )}
          </div>
          <p className="mt-1 max-w-[320px] text-[12px] leading-6 text-black/58">{latestDirective}</p>
        </button>
      ) : null}

      {!compact ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleStarterActions
            .filter(Boolean)
            .map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onUsePrompt(item)}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/64 transition hover:border-black/16 hover:text-black"
              >
                {item}
              </button>
            ))}
        </div>
      ) : null}
      {!compact && guidanceSummary?.activeDirectiveCount ? (
        <p className="text-[10px] text-black/42">
          {surfaceText(
            'workbench.emptyDirectiveCount',
            '{count} active directives',
            'topic.workbenchDirectiveCount',
          ).replace(
            '{count}',
            String(guidanceSummary.activeDirectiveCount),
          )}
        </p>
      ) : null}
    </div>
  )
}
