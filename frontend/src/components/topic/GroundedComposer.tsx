import type { ReactNode } from 'react'
import { Loader2, Search, Send, Sparkles } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { AssistantState } from '@/types/alpha'

export function GroundedComposer({
  value,
  onChange,
  onSubmit,
  quickActions,
  onUseQuickAction,
  searchEnabled,
  onToggleSearch,
  thinkingEnabled,
  onToggleThinking,
  style,
  onStyleChange,
  disabled,
  assistantState,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  quickActions?: Array<{
    id: string
    label: string
    prompt: string
  }>
  onUseQuickAction?: (prompt: string) => void
  searchEnabled: boolean
  onToggleSearch: () => void
  thinkingEnabled: boolean
  onToggleThinking: () => void
  style: 'brief' | 'balanced' | 'deep'
  onStyleChange: (style: 'brief' | 'balanced' | 'deep') => void
  disabled: boolean
  assistantState: AssistantState
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))
  const busy =
    assistantState === 'submitting' ||
    assistantState === 'thinking' ||
    assistantState === 'retrieving'

  return (
    <div className="rounded-[14px] border border-black/10 bg-white px-1.5 py-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
      {quickActions && quickActions.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-1.5">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onUseQuickAction?.(action.prompt)}
              className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] text-black/58 transition hover:border-black/18 hover:text-black"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-1.5">
        <ComposerChip
          label={workbenchText('assistant.searchToggle', 'workbench.searchToggle', 'Search')}
          active={searchEnabled}
          onClick={onToggleSearch}
          icon={<Search className="h-3.5 w-3.5" />}
        />
        <ComposerChip
          label={workbenchText('assistant.thinkingToggle', 'workbench.thinkingToggle', 'Reason')}
          active={thinkingEnabled}
          onClick={onToggleThinking}
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
        {(['brief', 'balanced', 'deep'] as const).map((item) => (
          <ComposerChip
            key={item}
            label={
              item === 'brief'
                ? workbenchText('assistant.styleBrief', 'workbench.styleBrief', 'Brief')
                : item === 'balanced'
                  ? workbenchText('assistant.styleBalanced', 'workbench.styleBalanced', 'Balanced')
                  : workbenchText('assistant.styleDeep', 'workbench.styleDeep', 'Deep')
            }
            active={style === item}
            onClick={() => onStyleChange(item)}
          />
        ))}
      </div>

      <div className="rounded-[12px] bg-[var(--surface-soft)] px-2.5 py-2">
        <textarea
          data-testid="assistant-composer-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={workbenchText(
            'assistant.inputPlaceholder',
            'workbench.inputPlaceholder',
            'Ask about the current node, paper, figure, or the overall mainline.',
          )}
          className="min-h-[52px] w-full resize-none bg-transparent px-1.5 py-1 text-[13px] leading-5 text-black outline-none placeholder:text-black/32"
        />

        <div className="mt-2 flex items-center justify-between gap-2 px-1.5">
          <div className="inline-flex min-w-0 items-center gap-1.5 text-[10px] text-black/42">
            {busy ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f766e]" />
            )}
            <span className="truncate">
              {busy
                ? workbenchText(
                    'assistant.statusWorking',
                    'workbench.statusWorking',
                    'Preparing the answer',
                  )
                : workbenchText(
                    'assistant.statusReady',
                    'workbench.statusReady',
                    'Context is ready for the next question',
                  )}
            </span>
          </div>

          <button
            type="button"
            data-testid="assistant-send-button"
            onClick={onSubmit}
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-[10px] text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {workbenchText('assistant.send', 'workbench.send', 'Send')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ComposerChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] transition ${
        active ? 'bg-black text-white' : 'bg-[var(--surface-soft)] text-black/60 hover:text-black'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
