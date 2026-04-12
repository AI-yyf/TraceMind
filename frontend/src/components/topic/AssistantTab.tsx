import { useState, useCallback } from 'react'

import { AssistantEmptyState } from './AssistantEmptyState'
import { ConversationThread } from './ConversationThread'
import { CurrentReadingFocusCard } from './CurrentReadingFocusCard'
import { GuidanceLedgerCard } from './GuidanceLedgerCard'
import { ReadingPathCard } from './ReadingPathCard'
import { ResearchIntelPanel } from './ResearchIntelPanel'
import { ResearchSessionCard } from './ResearchSessionCard'
import { ResearchWorldCard } from './ResearchWorldCard'
import { WorkbenchPulseCard } from './WorkbenchPulseCard'
import { useI18n } from '@/i18n'
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
  const { t } = useI18n()
  const [assistantIntakeOpen, setAssistantIntakeOpen] = useState(false)

  const hasResearchIntel = Boolean(
    researchBriefState?.guidance || researchBriefState?.world || researchBriefState?.cognitiveMemory,
  )

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
          className={`rounded-[14px] border border-black/8 px-2.5 ${
            assistantIntakeOpen ? 'bg-[var(--surface-soft)] py-2' : 'bg-white py-1.5'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
              {t('workbench.contextIntakeTitle', 'Context intake')}
            </div>
            <button
              type="button"
              onClick={() => setAssistantIntakeOpen((current) => !current)}
              className="rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-[10px] text-black/56 transition hover:border-black/18 hover:text-black"
            >
              {assistantIntakeOpen
                ? t('workbench.contextIntakeHide', 'Hide')
                : t('workbench.contextIntakeShow', 'Show')}
            </button>
          </div>
          {!assistantIntakeOpen ? (
            <p className="mt-1 text-[10px] leading-4 text-black/48">
              {t(
                'workbench.contextIntakeSummary',
                'Reading focus and research context stay available without taking over the thread.',
              )}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {!compactSurface ? (
                <ResearchSessionCard
                  session={researchSession}
                  brief={researchBriefState}
                  durationHours={researchHours}
                  onDurationHoursChange={onSetResearchHours}
                  onStart={onStartResearch}
                  onStop={onStopResearch}
                  starting={researchStarting || researchLoading}
                  stopping={researchStopping}
                  onUsePrompt={onUsePrompt}
                />
              ) : null}

              <CurrentReadingFocusCard
                entry={currentReadingEntry}
                onNavigate={onNavigate}
              />

              {readingPathEntries.length > 0 ? (
                <ReadingPathCard
                  entries={readingPathEntries}
                  onNavigate={onNavigate}
                />
              ) : null}

              {!compactSurface ? (
                <ResearchIntelPanel
                  loading={researchLoading}
                  errorMessage={researchBriefError}
                  ready={hasResearchIntel}
                  onRetry={() => {
                    // Caller handles retry
                  }}
                  onUsePrompt={onUsePrompt}
                >
                  <GuidanceLedgerCard
                    guidance={researchBriefState?.guidance ?? null}
                    onUsePrompt={onUsePrompt}
                  />

                  <ResearchWorldCard
                    world={researchBriefState?.world ?? null}
                    onUsePrompt={onUsePrompt}
                  />

                  <WorkbenchPulseCard
                    brief={researchBriefState}
                    onUsePrompt={onUsePrompt}
                  />
                </ResearchIntelPanel>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}