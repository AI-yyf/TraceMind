import { ChevronRight, History, MessageSquarePlus, Settings2 } from 'lucide-react'

import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'

export function AssistantHeader({
  modelLabel,
  onNewChat,
  onToggleHistory,
  onOpenSettings,
  onToggleCollapse,
  collapsed,
}: {
  modelLabel: string
  onNewChat: () => void
  onToggleHistory: () => void
  onOpenSettings: () => void
  onToggleCollapse: () => void
  collapsed: boolean
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))

  const actions = [
    {
      id: 'new-chat',
      label: workbenchText('assistant.actionNewChat', 'workbench.actionNewChat', 'New Chat'),
      icon: MessageSquarePlus,
      onClick: onNewChat,
    },
    {
      id: 'history',
      label: workbenchText('assistant.actionHistory', 'workbench.actionHistory', 'History'),
      icon: History,
      onClick: onToggleHistory,
    },
    {
      id: 'settings',
      label: workbenchText('assistant.actionModel', 'workbench.actionModel', 'Model'),
      icon: Settings2,
      onClick: onOpenSettings,
    },
  ] as const

  return (
    <header className="bg-white/94 px-2.5 pb-2 pt-2.5 backdrop-blur">
      <div className="flex items-center justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/32">
            {workbenchText('assistant.title', 'workbench.title', 'Research Workbench')}
          </div>
          <div className="mt-1 text-[10px] leading-5 text-black/46">{modelLabel}</div>
        </div>

        <div className="flex items-center gap-1">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] p-2 text-black/58 transition hover:bg-black/[0.04] hover:text-black"
                aria-label={action.label}
                title={action.label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}

          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'rounded-full border border-black/8 bg-white p-2 text-black/48 transition hover:border-black/16 hover:text-black',
              collapsed && 'rotate-180',
            )}
            aria-label={workbenchText(
              'assistant.actionCollapse',
              'workbench.actionCollapse',
              'Collapse Workbench',
            )}
            title={workbenchText(
              'assistant.actionCollapse',
              'workbench.actionCollapse',
              'Collapse Workbench',
            )}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
