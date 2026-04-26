import { useState, useCallback } from 'react'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'

import { AssistantEmptyState } from './AssistantEmptyState'
import { ConversationThread } from './ConversationThread'
import { ResearchSessionCard } from './ResearchSessionCard'
import type {
  CitationRef,
  SuggestedAction,
  StoredChatMessage,
  StoredChatThread,
  TopicResearchBrief,
  TopicResearchSessionState,
} from '@/types/alpha'
import type { ReadingTrailEntry } from '@/contexts/ReadingWorkspaceContext'

export interface AssistantTabProps {
  // Thread data
  currentThread: StoredChatThread

  // Research state
  researchBriefState: TopicResearchBrief | null
  researchBriefError: string | null
  researchSession: TopicResearchSessionState | null
  researchLoading: boolean
  researchStarting: boolean
  researchStopping: boolean
  researchHours: number

  // Reading context
  currentReadingEntry: ReadingTrailEntry | null
  readingPathEntries: Array<{ id: string; title: string; route: string; kind: 'topic' | 'node' | 'paper' }>

  // Settings
  compactSurface: boolean
  starterPrompt: string
  suggestedQuestions: string[]

  // Actions
  setQuestion: (question: string | ((current: string) => string)) => void
  sendQuestion: (question: string) => Promise<void>
  onOpenCitation: (citation: CitationRef) => void
  onAction: (action: SuggestedAction) => void
  onSaveMessage: (message: StoredChatMessage) => void
  onNavigate: (route: string) => void
  onSetResearchHours: (hours: number) => void
  onStartResearch: () => void
  onStopResearch: () => void
  onUsePrompt: (prompt: string) => void
}

export function AssistantTab({
  currentThread,
  researchBriefState,
  researchBriefError,
  researchSession,
  researchLoading,
  researchStarting,
  researchStopping,
  researchHours,
  currentReadingEntry,
  readingPathEntries,
  compactSurface,
  starterPrompt,
  suggestedQuestions,
  setQuestion,
  sendQuestion,
  onOpenCitation,
  onAction,
  onSaveMessage,
  onNavigate,
  onSetResearchHours,
  onStartResearch,
  onStopResearch,
  onUsePrompt,
}: AssistantTabProps) {
  const [assistantIntakeOpen, setAssistantIntakeOpen] = useState(false)

  const hasResearchIntel = Boolean(
    researchBriefState?.guidance || researchBriefState?.world || researchBriefState?.cognitiveMemory,
  )

  // 计算上下文项数
  const readingCount = (currentReadingEntry ? 1 : 0) + (readingPathEntries.length > 0 ? 1 : 0)
  const researchCount = (hasResearchIntel || researchLoading || researchBriefError) && !compactSurface ? 1 : 0

  const hasAssistantIntake = !compactSurface && Boolean(
    currentReadingEntry ||
    readingPathEntries.length > 0 ||
    (!compactSurface && (researchSession || hasResearchIntel || researchLoading || researchBriefError)),
  )

  const handleThreadAction = useCallback(
    (action: SuggestedAction) => {
      if (
        (action.action === 'explain' || action.action === 'compare' || action.action === 'summarize') &&
        !action.targetId
      ) {
        void sendQuestion(action.label)
      } else {
        onAction(action)
      }
    },
    [sendQuestion, onAction],
  )

  return (
    <div className="space-y-2">
      {currentThread.messages.length === 0 ? (
        <AssistantEmptyState
          starterPrompt={starterPrompt}
          suggestedQuestions={suggestedQuestions}
          brief={researchBriefState}
          onUsePrompt={setQuestion}
        />
      ) : (
        <ConversationThread
          messages={currentThread.messages}
          onOpenCitation={onOpenCitation}
          onAction={handleThreadAction}
          onUsePrompt={setQuestion}
          onSaveMessage={onSaveMessage}
        />
      )}

      {hasAssistantIntake ? (
        <section
          className={`rounded-[14px] border border-black/8 ${
            assistantIntakeOpen ? 'bg-[var(--surface-soft)] px-3 py-3' : 'bg-white px-3 py-2'
          }`}
        >
          <button
            type="button"
            onClick={() => setAssistantIntakeOpen((current) => !current)}
            className="flex w-full items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-black/70">
                {assistantIntakeOpen ? '收起上下文' : '展开上下文'}
              </span>
              {!assistantIntakeOpen ? (
                <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-black/56">
                  {`${readingCount + researchCount}项`}
                </span>
              ) : null}
            </div>
            {assistantIntakeOpen ? (
              <ChevronUp className="h-4 w-4 text-black/48" />
            ) : (
              <ChevronDown className="h-4 w-4 text-black/48" />
            )}
          </button>

          {assistantIntakeOpen ? (
            <div className="mt-3 space-y-2">
              {!compactSurface ? (
                <ResearchSessionCard
                  session={researchSession}
                  brief={researchBriefState}
                  durationDays={researchHours}
                  onDurationDaysChange={onSetResearchHours}
                  onStart={onStartResearch}
                  onStop={onStopResearch}
                  starting={researchStarting || researchLoading}
                  stopping={researchStopping}
                  onUsePrompt={onUsePrompt}
                />
              ) : null}

              {/* 阅读路径 - inline merged card */}
              {(currentReadingEntry || readingPathEntries.length > 0) ? (
                <article className="rounded-[14px] border border-black/8 bg-white px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                    阅读路径
                  </div>
                  {currentReadingEntry ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] font-medium text-black">
                        {currentReadingEntry.title}
                      </span>
                      <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-black/56">
                        {currentReadingEntry.kind === 'paper' ? '论文' : currentReadingEntry.kind === 'node' ? '节点' : '主题'}
                      </span>
                    </div>
                  ) : null}
                  {readingPathEntries.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {readingPathEntries.map((entry, index) => (
                        <div key={entry.id} className="inline-flex items-center gap-1">
                          {index > 0 ? <ArrowRight className="h-3 w-3 text-black/24" /> : null}
                          <button
                            type="button"
                            onClick={() => onNavigate(entry.route)}
                            className={`rounded-full px-2 py-0.5 text-[10px] transition ${
                              index === readingPathEntries.length - 1
                                ? 'bg-black/8 text-black/70'
                                : 'bg-[var(--surface-soft)] text-black/56 hover:text-black/80'
                            }`}
                          >
                            {entry.title}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ) : null}

              {/* 研究上下文 - inline summary card */}
              {!compactSurface && (hasResearchIntel || researchLoading || researchBriefError) ? (
                <article className="rounded-[14px] border border-black/8 bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
                      研究上下文
                    </div>
                    {researchLoading ? (
                      <span className="text-[10px] text-black/48">加载中...</span>
                    ) : researchBriefError ? (
                      <span className="text-[10px] text-amber-600">获取失败</span>
                    ) : hasResearchIntel ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                        已就绪
                      </span>
                    ) : null}
                  </div>
                  {researchBriefState?.guidance?.summary?.focusHeadline ? (
                    <p className="mt-2 text-[11px] leading-5 text-black/62">
                      {researchBriefState.guidance.summary.focusHeadline}
                    </p>
                  ) : researchBriefState?.world?.summary?.thesis ? (
                    <p className="mt-2 text-[11px] leading-5 text-black/62">
                      {researchBriefState.world.summary.thesis}
                    </p>
                  ) : researchBriefError ? (
                    <p className="mt-2 text-[11px] leading-5 text-black/50">
                      {researchBriefError}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] leading-5 text-black/50">
                      启动研究以获取智能上下文摘要
                    </p>
                  )}
                </article>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
