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
    research: workbenchText('assistant.tabResearch', 'workbench.tabResearch', 'Research'),
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
            'rounded-full border px-2.5 py-1 text-[10px] transition',
            activeTab === tab
              ? 'border-black/14 bg-black/[0.04] text-black/78'
              : 'border-transparent bg-transparent text-black/46 hover:border-black/8 hover:bg-black/[0.02] hover:text-black/72',
          )}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  )
}
