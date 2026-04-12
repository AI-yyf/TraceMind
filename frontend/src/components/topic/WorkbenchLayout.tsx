import { useState, useEffect, ReactNode, useRef } from 'react'
import { MessageSquare } from 'lucide-react'

import { AssistantHeader } from './AssistantHeader'
import { SidebarToolTabs } from './SidebarToolTabs'
import { TOPIC_WORKBENCH_DESKTOP_WIDTH, isTopicWorkbenchDesktopViewport } from './workbench-layout'
import { useI18n } from '@/i18n'
import { useProductCopy } from '@/hooks/useProductCopy'
import type { TopicWorkbenchTab } from '@/types/alpha'

export interface WorkbenchLayoutProps {
  open: boolean
  setOpen: (value: boolean | ((current: boolean) => boolean)) => void
  isDesktopViewport: boolean
  modelLabel: string
  historyOpen: boolean
  activeTab: TopicWorkbenchTab
  visibleTabs: TopicWorkbenchTab[]
  setActiveTab: (tab: TopicWorkbenchTab | ((current: TopicWorkbenchTab) => TopicWorkbenchTab)) => void
  setHistoryOpen: (value: boolean | ((current: boolean) => boolean)) => void
  onNewChat: () => void
  onOpenSettings: () => void
  children: ReactNode
  historyContent?: ReactNode
  assistantComposer?: ReactNode
  scrollBodyRef?: React.RefObject<HTMLDivElement>
}

export function WorkbenchLayout({
  open,
  setOpen,
  isDesktopViewport,
  modelLabel,
  historyOpen,
  activeTab,
  visibleTabs,
  setActiveTab,
  setHistoryOpen,
  onNewChat,
  onOpenSettings,
  children,
  historyContent,
  assistantComposer,
  scrollBodyRef,
}: WorkbenchLayoutProps) {
  const { t } = useI18n()
  const { copy } = useProductCopy()
  const internalScrollBodyRef = useRef<HTMLDivElement | null>(null)
  const effectiveScrollBodyRef = scrollBodyRef ?? internalScrollBodyRef

  const drawerButtonLabel = t(
    'workbench.drawerButton',
    copy('assistant.drawerButton', 'Open Workbench'),
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="topic-workbench-open"
        className="fixed bottom-4 right-4 z-[82] inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-[13px] text-black shadow-[0_18px_36px_rgba(15,23,42,0.10)] transition hover:border-black/16 hover:shadow-[0_22px_40px_rgba(15,23,42,0.12)]"
      >
        <MessageSquare className="h-4 w-4" />
        {drawerButtonLabel}
      </button>
    )
  }

  return (
    <>
      {!isDesktopViewport ? (
        <button
          type="button"
          className="fixed inset-0 z-[82] bg-black/10 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-label={t('workbench.actionCollapse', copy('assistant.actionCollapse', 'Collapse Workbench'))}
        />
      ) : null}

      <aside
        data-testid="right-sidebar-shell"
        data-topic-workbench="true"
        className="fixed bottom-2 right-2 top-2 z-[83] flex w-[min(92vw,376px)] flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.10)] transition 2xl:w-[392px]"
        style={
          isDesktopViewport
            ? {
                width: `${TOPIC_WORKBENCH_DESKTOP_WIDTH}px`,
                maxWidth: `${TOPIC_WORKBENCH_DESKTOP_WIDTH}px`,
              }
            : undefined
        }
      >
        <div data-testid="topic-workbench" className="absolute left-0 top-0 h-px w-px" aria-hidden="true" />

        <AssistantHeader
          modelLabel={modelLabel}
          onNewChat={onNewChat}
          onToggleHistory={() => setHistoryOpen((current) => !current)}
          onOpenSettings={onOpenSettings}
          onToggleCollapse={() => setOpen(false)}
          collapsed={false}
        />

        <div className="border-b border-black/6 bg-white px-2.5 py-1.5">
          <SidebarToolTabs
            activeTab={activeTab}
            tabs={visibleTabs}
            onChange={(tab) => {
              setActiveTab(tab)
              setHistoryOpen(false)
            }}
          />
        </div>

        <div
          ref={effectiveScrollBodyRef}
          data-testid="topic-workbench-scroll"
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {historyOpen ? (
            <div className="absolute inset-x-2.5 top-2.5 z-10 rounded-[20px] border border-black/8 bg-white/98 p-3 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur">
              <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-black/36">
                {t('workbench.actionHistory', copy('assistant.actionHistory', 'History'))}
              </div>
              <div className="space-y-2">
                {historyContent}
              </div>
            </div>
          ) : null}

          <div className={historyOpen ? 'pointer-events-none opacity-15 blur-[1px]' : ''}>
            {children}
          </div>
        </div>

        {activeTab === 'assistant' && assistantComposer ? (
          <div className="border-t border-black/6 bg-white p-1.5">
            {assistantComposer}
          </div>
        ) : null}
      </aside>
    </>
  )
}

// Helper function to check desktop viewport
function useIsDesktopViewport() {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return isTopicWorkbenchDesktopViewport(window.innerWidth)
  })

  useEffect(() => {
    const syncViewport = () =>
      setIsDesktopViewport(isTopicWorkbenchDesktopViewport(window.innerWidth))
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  return isDesktopViewport
}

void useIsDesktopViewport
