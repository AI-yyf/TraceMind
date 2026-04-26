import { type ReactNode, useRef } from 'react'
import { MessageSquare } from 'lucide-react'

import { AssistantHeader } from './AssistantHeader'
import { SidebarToolTabs } from './SidebarToolTabs'
import { TOPIC_WORKBENCH_DESKTOP_WIDTH } from './workbench-layout'
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
  const showTabs = visibleTabs.length > 1

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
        className="fixed bottom-4 right-4 z-[82] inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/96 px-4 py-2.5 text-[13px] text-black shadow-[0_14px_30px_rgba(15,23,42,0.10)] backdrop-blur transition hover:border-black/14 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
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
        className="fixed bottom-3 right-3 top-3 z-[83] flex w-[min(96vw,480px)] flex-col overflow-hidden rounded-[22px] border border-black/6 bg-[rgba(255,252,248,0.96)] shadow-[0_14px_38px_rgba(15,23,42,0.10)] backdrop-blur transition 2xl:w-[520px]"
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

        {showTabs ? (
          <div className="border-b border-black/5 bg-white/74 px-3 py-1.5 backdrop-blur">
            <SidebarToolTabs
              activeTab={activeTab}
              tabs={visibleTabs}
              onChange={(tab) => {
                setActiveTab(tab)
                setHistoryOpen(false)
              }}
            />
          </div>
        ) : null}

        <div
          ref={effectiveScrollBodyRef}
          data-testid="topic-workbench-scroll"
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
          style={{ scrollbarGutter: 'stable both-edges' }}
        >
          {historyOpen ? (
            <div className="absolute inset-x-3 top-3 z-10 rounded-[20px] border border-black/8 bg-white/98 p-3 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur">
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
          <div className="border-t border-black/5 bg-white/88 p-2 backdrop-blur">
            {assistantComposer}
          </div>
        ) : null}
      </aside>
    </>
  )
}
