import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { TopicWorkbenchTab } from '@/types/alpha'
import { cn } from '@/utils/cn'

export function SidebarToolTabs({
  activeTab,
  onChange,
  tabs,
}: {
  activeTab: TopicWorkbenchTab
  onChange: (tab: TopicWorkbenchTab) => void
  tabs?: TopicWorkbenchTab[]
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const workbenchText = (copyId: string, key: string, fallback: string) =>
    copy(copyId, t(key, fallback))

  const labels: Record<TopicWorkbenchTab, string> = {
    assistant: workbenchText('assistant.tabAssistant', 'workbench.tabAssistant', 'Assistant'),
    notes: workbenchText('assistant.tabNotes', 'workbench.tabNotes', 'Notes'),
    similar: workbenchText('assistant.tabSimilar', 'workbench.tabSearch', 'Search'),
    resources: workbenchText('assistant.tabResources', 'workbench.tabResources', 'Resources'),
  }
  const visibleTabs =
    tabs && tabs.length > 0 ? tabs : (Object.keys(labels) as TopicWorkbenchTab[])

  return (
    <div
      data-testid="sidebar-tool-tabs"
      className="inline-flex max-w-full items-center gap-1"
    >
      {visibleTabs.map((tab) => (
        <button
          key={tab}
          type="button"
          data-testid={`sidebar-tab-${tab}`}
          onClick={() => onChange(tab)}
          className={cn(
            'rounded-full px-2.5 py-1 text-[10px] transition',
            activeTab === tab
              ? 'bg-black text-white'
              : 'bg-[var(--surface-soft)] text-black/52 hover:text-black',
          )}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  )
}
