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
    <header className="border-b border-black/6 bg-white px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-black/78">
            {workbenchText('assistant.title', 'workbench.title', 'Assistant')}
          </div>
          <div className="truncate text-[10px] leading-4 text-black/42">{modelLabel}</div>
        </div>

        <div className="flex items-center gap-1">
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] p-1.5 text-black/54 transition hover:bg-black/[0.04] hover:text-black"
                aria-label={action.label}
                title={action.label}
              >
                <Icon className="h-3 w-3" />
              </button>
            )
          })}

          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'rounded-full border border-black/8 bg-white p-1.5 text-black/48 transition hover:border-black/16 hover:text-black',
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
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </header>
  )
}
