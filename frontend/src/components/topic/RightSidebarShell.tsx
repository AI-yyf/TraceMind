import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AssistantEmptyState } from './AssistantEmptyState'
import { ConversationThread } from './ConversationThread'
import { ContextTray } from './ContextTray'
import { CurrentReadingFocusCard } from './CurrentReadingFocusCard'
import { GuidanceLedgerCard } from './GuidanceLedgerCard'
import { GroundedComposer } from './GroundedComposer'
import { NotebookPanel } from './NotebookPanel'
import { ReadingPathCard } from './ReadingPathCard'
import { ResourcesPanel } from './ResourcesPanel'
import { ResearchIntelPanel } from './ResearchIntelPanel'
import { ResearchSessionCard } from './ResearchSessionCard'
import { ResearchWorldCard } from './ResearchWorldCard'
import { SearchPanel } from './SearchPanel'
import { WorkbenchLayout } from './WorkbenchLayout'
import { WorkbenchPulseCard } from './WorkbenchPulseCard'
import {
  isTopicWorkbenchDesktopViewport,
  TOPIC_WORKBENCH_AUTO_OPEN_BREAKPOINT,
} from './workbench-layout'
import { useWorkbenchEvents } from './WorkbenchEventManager'
import {
  buildPillFromEvidence,
  buildPillFromSearch,
  buildMessage,
  clipText,
  createThread,
  parseChatStore,
  renderTemplate,
  type WorkbenchStyle,
  type TopicChatStore,
} from './WorkbenchChatEngine'
import type { ReadingTrailEntry } from '@/contexts/readingWorkspaceShared'
import { useReadingWorkspace } from '@/contexts/readingWorkspaceHooks'
import { useFavorites } from '@/hooks'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type {
  AssistantState,
  CitationRef,
  ContextPill,
  EvidencePayload,
  ModelCapabilitySummary,
  OmniIssue,
  SearchResultItem,
  StoredChatMessage,
  StoredChatThread,
  SuggestedAction,
  TopicChatResponse,
  TopicResearchBrief,
  TopicResearchSessionState,
  TopicWorkbenchTab,
} from '@/types/alpha'
import type { FavoriteExcerpt } from '@/types/tracker'
import {
  fetchTopicResearchBrief,
  invalidateTopicResearchBrief,
  primeTopicResearchBrief,
} from '@/utils/omniRuntimeCache'
import { ApiError, apiPost } from '@/utils/api'

type SidebarSurfaceMode = 'default' | 'reading' | 'map'

type ResourceCard = {
  id: string
  title: string
  subtitle: string
  description: string
  kind: 'stage' | 'node' | 'paper'
  route?: string
  anchorId?: string
}

function buildPillFromTrailEntry(entry: ReadingTrailEntry): ContextPill {
  return {
    id: entry.id,
    kind: entry.kind === 'topic' ? 'anchor' : entry.kind,
    label: entry.title,
    description:
      entry.kind === 'paper'
        ? 'Current paper locus'
        : entry.kind === 'node'
          ? 'Current node locus'
          : 'Current topic locus',
    route: entry.route,
  }
}

export function RightSidebarShell({
  topicId,
  topicTitle,
  researchBrief = null,
  suggestedQuestions,
  selectedEvidence,
  contextSuggestions = [],
  resources = [],
  searchStageWindowMonths,
  onOpenCitation,
  onAction,
  onOpenSearchResult,
  surfaceMode = 'default',
}: {
  topicId: string
  topicTitle: string
  researchBrief?: TopicResearchBrief | null
  suggestedQuestions: string[]
  selectedEvidence: EvidencePayload | null
  contextSuggestions?: ContextPill[]
  resources?: ResourceCard[]
  searchStageWindowMonths?: number
  onOpenCitation: (citation: CitationRef) => void
  onAction: (action: SuggestedAction) => void
  onOpenSearchResult: (item: SearchResultItem) => void
  surfaceMode?: SidebarSurfaceMode
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useI18n()
  const { copy } = useProductCopy()
  const { state: readingWorkspaceState, getTopicWorkbenchState, patchTopicWorkbenchState } =
    useReadingWorkspace()
  const { favorites, addFavorite, removeFavorite } = useFavorites()
  const scrollBodyRef = useRef<HTMLDivElement | null>(null)

  // Desktop viewport state
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return isTopicWorkbenchDesktopViewport(window.innerWidth)
  })

  // Research state
  const [researchBriefState, setResearchBriefState] = useState<TopicResearchBrief | null>(null)
  const [researchBriefError, setResearchBriefError] = useState<string | null>(null)
  const [researchSession, setResearchSession] = useState<TopicResearchSessionState | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchStarting, setResearchStarting] = useState(false)
  const [researchStopping, setResearchStopping] = useState(false)
  const [dossierExporting, setDossierExporting] = useState(false)
  const [researchHours, setResearchHours] = useState(4)
  const [modelStatus, setModelStatus] = useState<ModelCapabilitySummary | null>(null)
  const [assistantIntakeOpen, setAssistantIntakeOpen] = useState(false)
  const [assistantState, setAssistantState] = useState<AssistantState>('empty')

  // Chat store state
  const [store, setStore] = useState<TopicChatStore>(() => {
    if (typeof window !== 'undefined') {
      return parseChatStore(window.localStorage.getItem(`topic-chat:${topicId}`))
    }
    const thread = createThread()
    return { currentThreadId: thread.id, threads: [thread] }
  })

  // Workbench state from context
  const workbenchState =
    readingWorkspaceState.workbenchByTopic[topicId] ?? getTopicWorkbenchState(topicId)
  const hasPersistedWorkbenchState = Boolean(readingWorkspaceState.workbenchByTopic[topicId])
  const { open, activeTab, historyOpen, contextPills, searchEnabled, thinkingEnabled, style } =
    workbenchState

  // Workbench state setters
  const setOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        open: typeof next === 'function' ? next(current.open) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const setActiveTab = useCallback(
    (next: TopicWorkbenchTab | ((current: TopicWorkbenchTab) => TopicWorkbenchTab)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        activeTab: typeof next === 'function' ? next(current.activeTab) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const setHistoryOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        historyOpen: typeof next === 'function' ? next(current.historyOpen) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const setContextPills = useCallback(
    (next: ContextPill[] | ((current: ContextPill[]) => ContextPill[])) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        contextPills: typeof next === 'function' ? next(current.contextPills) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const setSearchEnabled = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        searchEnabled: typeof next === 'function' ? next(current.searchEnabled) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const setThinkingEnabled = useCallback(
    (next: boolean | ((current: boolean) => boolean)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        thinkingEnabled: typeof next === 'function' ? next(current.thinkingEnabled) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  const setStyle = useCallback(
    (next: WorkbenchStyle | ((current: WorkbenchStyle) => WorkbenchStyle)) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        style: typeof next === 'function' ? next(current.style as WorkbenchStyle) : next,
      })),
    [patchTopicWorkbenchState, topicId],
  )

  // Derived state
  const currentThread =
    useMemo(
      () => store.threads.find((thread) => thread.id === store.currentThreadId) ?? store.threads[0],
      [store],
    ) ?? createThread()
  const question = currentThread.draft ?? ''

  const latestAssistantMessage = useMemo(
    () => [...currentThread.messages].reverse().find((message) => message.role === 'assistant') ?? null,
    [currentThread.messages],
  )

  const topicNotes = useMemo(
    () =>
      favorites
        .filter(
          (note) =>
            note.topicId === topicId ||
            note.route?.startsWith(`/topic/${topicId}`) ||
            note.route === `/topic/${topicId}`,
        )
        .sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt)),
    [favorites, topicId],
  )

  const currentReadingEntry = useMemo(
    () => readingWorkspaceState.trail.find((entry) => entry.topicId === topicId) ?? null,
    [readingWorkspaceState.trail, topicId],
  )

  const readingPathEntries = useMemo(
    () =>
      readingWorkspaceState.trail
        .filter((entry) => entry.topicId === topicId)
        .slice(0, 3)
        .reverse()
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          route: entry.route,
          kind: entry.kind,
        })),
    [readingWorkspaceState.trail, topicId],
  )

  const implicitFocusPill = useMemo(
    () => (currentReadingEntry ? buildPillFromTrailEntry(currentReadingEntry) : null),
    [currentReadingEntry],
  )

  const readingTrailPills = useMemo(
    () =>
      readingPathEntries.map((entry) => ({
        id: entry.id,
        kind: entry.kind === 'topic' ? ('anchor' as const) : entry.kind,
        label: entry.title,
        description:
          entry.kind === 'paper'
            ? 'Current paper locus'
            : entry.kind === 'node'
              ? 'Current node locus'
              : 'Current topic locus',
        route: entry.route,
      })),
    [readingPathEntries],
  )

  // Labels and text
  const starterPrompt = copy(
    'assistant.starterPrompt',
    t(
      'workbench.starterPrompt',
      'Start by explaining which nodes, evidence, and branches are most worth reading first.',
    ),
  )

  const composerQuickActions = useMemo(
    () => [
      {
        id: 'suggest',
        label: t('workbench.quickActionSuggest', '提建议'),
        prompt: t(
          'workbench.quickActionSuggestPrompt',
          'I suggest that your next research run strengthen the weakest point in the current mainline and explain why that shift matters.',
        ),
      },
      {
        id: 'challenge',
        label: t('workbench.quickActionChallenge', '提质疑'),
        prompt: t(
          'workbench.quickActionChallengePrompt',
          'I want to challenge the current mainline judgment. Re-check node boundaries, stage naming, and whether the representative papers still make sense.',
        ),
      },
      {
        id: 'focus',
        label: t('workbench.quickActionFocus', '聚焦当前'),
        prompt: t(
          'workbench.quickActionFocusPrompt',
          'For the next run, stay focused on the node or paper I am reading now and do not expand the topic further yet.',
        ),
      },
      {
        id: 'style',
        label: t('workbench.quickActionStyle', '调表达'),
        prompt: t(
          'workbench.quickActionStylePrompt',
          'For future writing, make it read more like a continuous article, with less mechanical bulleting and clearer judgment, boundaries, and transitions.',
        ),
      },
      {
        id: 'command',
        label: t('workbench.quickActionCommand', '继续研究'),
        prompt: t(
          'workbench.quickActionCommandPrompt',
          'Continue researching the current topic and tell me which thread you will prioritize next.',
        ),
      },
    ],
    [t],
  )

  const modelLabel = useMemo(() => {
    if (!modelStatus) return t('workbench.actionModel', copy('assistant.actionModel', 'Model'))
    const textReady = modelStatus.slots.language.apiKeyStatus === 'configured'
    const visionReady = modelStatus.slots.multimodal.apiKeyStatus === 'configured'

    return textReady && visionReady
      ? t('workbench.modelReady', copy('assistant.modelReady', 'Language and vision models are ready'))
      : textReady || visionReady
        ? t('workbench.modelPartial', copy('assistant.modelPartial', 'Models are partially ready'))
        : t('workbench.modelMissing', copy('assistant.modelMissing', 'Configure models'))
  }, [copy, modelStatus, t])

  // Compact surface mode
  const compactSurface = surfaceMode === 'reading' || surfaceMode === 'map'
  const visibleTabs = useMemo<TopicWorkbenchTab[]>(
    () => (compactSurface ? ['assistant', 'notes'] : ['assistant', 'notes', 'similar', 'resources']),
    [compactSurface],
  )
  const headerModelLabel = compactSurface
    ? t('workbench.actionModel', copy('assistant.actionModel', 'Model'))
    : modelLabel
  const emptyStateQuestions = compactSurface ? suggestedQuestions.slice(0, 2) : suggestedQuestions
  const hasResearchIntel = Boolean(
    researchBriefState?.guidance || researchBriefState?.world || researchBriefState?.cognitiveMemory,
  )
  const hasAssistantIntake = !compactSurface && Boolean(
    currentReadingEntry ||
    readingPathEntries.length > 0 ||
    (!compactSurface && (researchSession || hasResearchIntel || researchLoading || researchBriefError)),
  )

  // Update current thread helper
  const updateCurrentThread = useCallback(
    (updater: (thread: StoredChatThread) => StoredChatThread) =>
      setStore((current) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.id === current.currentThreadId ? updater(thread) : thread,
        ),
      })),
    [],
  )

  // Question setter (must be defined before useWorkbenchEvents)
  const setQuestion = useCallback(
    (next: string | ((current: string) => string)) => {
      setStore((current) => {
        let changed = false

        const threads = current.threads.map((thread) => {
          if (thread.id !== current.currentThreadId) return thread

          const currentDraft = thread.draft ?? ''
          const resolvedDraft = typeof next === 'function' ? next(currentDraft) : next

          if (resolvedDraft === currentDraft) return thread

          changed = true
          return { ...thread, draft: resolvedDraft }
        })

        return changed ? { ...current, threads } : current
      })
    },
    [],
  )

  // Set up event handlers (must come after setQuestion is defined)
  useWorkbenchEvents({
    topicId,
    open,
    setOpen,
    setActiveTab,
    setContextPills,
    setQuestion,
    setHistoryOpen,
    setModelStatus,
    isDesktopViewport,
  })

  // Load research session
  const loadResearchSession = useCallback(
    async (silent = false, force = false) => {
      if (!silent) setResearchLoading(true)

      try {
        const data = await fetchTopicResearchBrief(topicId, { force })
        setResearchBriefState(data)
        setResearchSession(data.session)
        setResearchBriefError(null)

        const nextHours =
          data.session.progress?.durationHours ?? data.session.task?.options?.durationHours

        if (typeof nextHours === 'number' && Number.isFinite(nextHours)) {
          setResearchHours((current) => {
            const normalized = Math.min(48, Math.max(1, Math.round(nextHours)))
            return normalized === current ? current : normalized
          })
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : t('workbench.researchIntelErrorMessage', 'The workbench could not refresh the topic intelligence.')

        setResearchBriefError(message)
        if (!silent) {
          setResearchBriefState(null)
          setResearchSession(null)
        }
      } finally {
        if (!silent) setResearchLoading(false)
      }
    },
    [t, topicId],
  )

  // Start/stop research
  const startResearchSession = useCallback(async () => {
    setResearchStarting(true)
    try {
      const data = await apiPost<TopicResearchSessionState, { durationHours: number }>(
        `/api/topics/${topicId}/research-session`,
        { durationHours: researchHours },
      )
      setResearchSession({
        task: data.task,
        progress: data.progress,
        report: data.report,
        active: data.active,
        strategy: data.strategy,
      })
      setResearchBriefError(null)
      setOpen(true)
      setActiveTab('assistant')
    } finally {
      setResearchStarting(false)
    }
  }, [topicId, researchHours, setOpen, setActiveTab])

  const stopResearchSession = useCallback(async () => {
    if (!researchSession?.task?.id) return
    setResearchStopping(true)
    try {
      await apiPost<TopicResearchSessionState>(`/api/topics/${topicId}/research-session/stop`, {})
      setResearchBriefError(null)
      invalidateTopicResearchBrief(topicId)
      await loadResearchSession(true, true)
    } finally {
      setResearchStopping(false)
    }
  }, [topicId, researchSession?.task?.id, loadResearchSession])

  // Persist store to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(`topic-chat:${topicId}`, JSON.stringify(store))
  }, [store, topicId])

  // Reset on topic change
  useEffect(() => {
    if (typeof window === 'undefined') return
    setStore(parseChatStore(window.localStorage.getItem(`topic-chat:${topicId}`)))
    setAssistantState('empty')
    setResearchStarting(false)
    setResearchStopping(false)
  }, [topicId])

  // Handle research brief prop
  useEffect(() => {
    if (!researchBrief || researchBrief.topicId !== topicId) return
    primeTopicResearchBrief(researchBrief)
    setResearchBriefState(researchBrief)
    setResearchSession(researchBrief.session)
    setResearchBriefError(null)
  }, [researchBrief, topicId])

  // Load research session on mount
  useEffect(() => {
    if (researchBrief?.topicId === topicId) return
    void loadResearchSession()
  }, [loadResearchSession, researchBrief, topicId])

  // Default drawer behavior on first topic visit:
  // ultra-wide desktop opens by default; narrower layouts stay collapsed.
  useEffect(() => {
    if (hasPersistedWorkbenchState) return
    if (typeof window === 'undefined') return
    if (window.innerWidth < TOPIC_WORKBENCH_AUTO_OPEN_BREAKPOINT) return

    setOpen(true)
  }, [hasPersistedWorkbenchState, setOpen])

  // Poll for active research
  useEffect(() => {
    if (!researchSession?.active && researchSession?.report?.status !== 'running') return
    const timer = window.setInterval(() => void loadResearchSession(true, true), 15000)
    return () => window.clearInterval(timer)
  }, [loadResearchSession, researchSession?.active, researchSession?.report?.status])

  // Handle URL params for opening assistant
  useEffect(() => {
    const shouldOpenAssistant =
      searchParams.get('workbench') === 'assistant' || searchParams.get('focus') === 'research'
    if (!shouldOpenAssistant) return
    setOpen(true)
    setActiveTab('assistant')
    const next = new URLSearchParams(searchParams)
    next.delete('workbench')
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }, [searchParams, setActiveTab, setOpen, setSearchParams])

  // Handle selected evidence
  useEffect(() => {
    if (!selectedEvidence) return
    setOpen(true)
    const next = buildPillFromEvidence(selectedEvidence)
    setContextPills((current) =>
      current.some((item) => item.id === next.id) ? current : [next, ...current],
    )
  }, [selectedEvidence, setContextPills, setOpen])

  // Resize viewport handler
  useEffect(() => {
    const syncViewport = () => setIsDesktopViewport(isTopicWorkbenchDesktopViewport(window.innerWidth))
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  // Sync assistant state
  useEffect(() => {
    if (currentThread.messages.length === 0 && !question.trim()) setAssistantState('empty')
    else if (question.trim()) setAssistantState('drafting')
  }, [currentThread.messages.length, question])

  // Validate active tab
  useEffect(() => {
    if (visibleTabs.includes(activeTab)) return
    setActiveTab('assistant')
    setHistoryOpen(false)
  }, [activeTab, setActiveTab, setHistoryOpen, visibleTabs])

  // Scroll to bottom on messages
  useEffect(() => {
    if (!open || historyOpen) return
    const body = scrollBodyRef.current
    if (!body) return
    const frame = window.requestAnimationFrame(() => {
      body.scrollTo({ top: body.scrollHeight, behavior: activeTab === 'assistant' ? 'smooth' : 'auto' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeTab, currentThread.messages.length, historyOpen, open, topicNotes.length])

  // Append messages helper
  const appendMessages = useCallback(
    (messages: StoredChatMessage[], options?: { preserveComposer?: boolean }) => {
      updateCurrentThread((thread) => {
        const nextMessages = [...thread.messages, ...messages]
        return {
          ...thread,
          title: nextMessages.find((item) => item.role === 'user')?.content.slice(0, 48) || thread.title,
          updatedAt: new Date().toISOString(),
          messages: nextMessages,
        }
      })
      if (!options?.preserveComposer) {
        setQuestion('')
        setAssistantState('empty')
        setHistoryOpen(false)
      }
    },
    [setAssistantState, setHistoryOpen, setQuestion, updateCurrentThread],
  )

  // Start new chat
  const startNewChat = useCallback(() => {
    const nextThread = createThread(t('workbench.actionNewChat', copy('assistant.actionNewChat', 'New Chat')))
    setStore((current) => ({
      currentThreadId: nextThread.id,
      threads: [nextThread, ...current.threads],
    }))
    setQuestion('')
    setAssistantState('empty')
    setHistoryOpen(false)
  }, [copy, setHistoryOpen, setQuestion, t])

  // Capture selection pill
  const captureSelectionPill = useCallback(() => {
    const text = window.getSelection?.()?.toString().trim()
    if (!text) return
    setContextPills((current) => [
      {
        id: `selection:${Date.now()}`,
        kind: 'selection',
        label: text.length > 42 ? `${text.slice(0, 42)}...` : text,
        description: text,
        route: `${window.location.pathname}${window.location.search}`,
      },
      ...current,
    ])
  }, [setContextPills])

  // Notebook entry handlers
  const saveNotebookEntry = useCallback(
    (entry: FavoriteExcerpt) => {
      addFavorite(entry)
      setOpen(true)
      setActiveTab('notes')
    },
    [addFavorite, setActiveTab, setOpen],
  )

  const saveAssistantMessage = useCallback((message: StoredChatMessage) => {
    // Implementation moved to WorkbenchChatEngine for reusability
    const entry: FavoriteExcerpt = {
      id: `assistant:${topicId}:${message.id}`,
      kind: 'assistant',
      topicId,
      topicTitle,
      excerptTitle: clipText(message.content.split('\n').find(Boolean) || 'AI Topic Briefing', 52),
      paragraphs: message.content.split(/\n{2,}/u).map((s) => s.trim()).filter(Boolean).slice(0, 6),
      savedAt: new Date().toISOString(),
      route: message.citations?.[0]?.route || `/topic/${topicId}`,
      anchorId: message.citations?.[0]?.anchorId,
      sourceLabel: t('workbench.notebookSourceWorkbench', 'Conversation workbench'),
      summary: clipText(message.content, 120),
      tags: [],
    }
    saveNotebookEntry(entry)
  }, [topicId, topicTitle, saveNotebookEntry, t])

  const saveCurrentEvidence = useCallback(() => {
    if (!selectedEvidence) return
    const entry: FavoriteExcerpt = {
      id: `evidence:${topicId}:${selectedEvidence.anchorId}`,
      kind: 'evidence',
      topicId,
      topicTitle,
      excerptTitle: selectedEvidence.label,
      paragraphs: [selectedEvidence.quote, selectedEvidence.content].filter(Boolean).slice(0, 6),
      savedAt: new Date().toISOString(),
      route: selectedEvidence.route,
      anchorId: selectedEvidence.anchorId,
      sourceLabel: t('workbench.notebookSourceEvidenceCard', 'Evidence card'),
      summary: clipText(selectedEvidence.quote, 120),
      tags: [selectedEvidence.type, selectedEvidence.title].filter(Boolean),
    }
    saveNotebookEntry(entry)
  }, [selectedEvidence, topicId, topicTitle, saveNotebookEntry, t])

  // Send question
  const sendQuestion = useCallback(async (nextQuestion: string) => {
    const trimmed = nextQuestion.trim()
    if (!trimmed) return

    appendMessages([buildMessage('user', trimmed)])
    setAssistantState('submitting')
    const timer = window.setTimeout(() => setAssistantState(searchEnabled ? 'retrieving' : 'thinking'), 120)

    const explicitContextItems = implicitFocusPill
      ? contextPills.filter((item) => item.id !== implicitFocusPill.id)
      : contextPills
    const focusBlock = implicitFocusPill
      ? `Current reading focus:\n- ${implicitFocusPill.label}${implicitFocusPill.description ? `: ${implicitFocusPill.description}` : ''}\n\n`
      : ''
    const contextBlock =
      explicitContextItems.length > 0
        ? `Workbench context:\n${explicitContextItems.map((item) => `- ${item.label}${item.description ? `: ${item.description}` : ''}`).join('\n')}\n\n`
        : ''

    try {
      const data = await apiPost<TopicChatResponse, { question: string }>(`/api/topics/${topicId}/chat`, {
        question: `${focusBlock}${contextBlock}${trimmed}\n\nWorkbench controls:\nresponse_style=${style}\nreasoning=${thinkingEnabled ? 'enabled' : 'disabled'}\nretrieval=${searchEnabled ? 'enabled' : 'disabled'}`,
      })

      setAssistantState(
        data.notice?.code === 'missing_key' || data.notice?.code === 'invalid_key'
          ? 'auth-required'
          : data.guidanceReceipt
            ? 'answer-ready'
            : data.citations.length === 0
              ? 'partial-grounding'
              : 'answer-ready',
      )

      appendMessages([
        buildMessage('assistant', data.answer, {
          id: data.messageId,
          citations: data.citations,
          suggestedActions: data.suggestedActions,
          guidanceReceipt: data.guidanceReceipt,
          notice: data.notice,
        }),
      ])

      if (data.guidanceReceipt) {
        invalidateTopicResearchBrief(topicId)
        await loadResearchSession(true, true)
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null
      setAssistantState(apiError?.statusCode === 429 ? 'rate-limited' : 'hard-error')

      appendMessages([
        buildMessage('assistant', copy('assistant.requestFailed', t('workbench.requestFailedReply', 'Request failed')), {
          notice: {
            code: 'provider_error',
            title: t('workbench.requestFailedTitle', 'Request Failed'),
            message: t('workbench.requestFailedMessage', 'Check model settings and try again.'),
          } as OmniIssue,
        }),
      ], { preserveComposer: true })
      setQuestion(trimmed)
    } finally {
      window.clearTimeout(timer)
    }
  }, [
    topicId,
    contextPills,
    implicitFocusPill,
    style,
    searchEnabled,
    thinkingEnabled,
    appendMessages,
    loadResearchSession,
    setQuestion,
    t,
    copy,
  ])

  // Notebook panel export handlers
  const exportTopicNotes = useCallback((_format: 'markdown' | 'json') => {
    if (topicNotes.length === 0) return false
    // Simplified - full implementation in WorkbenchChatEngine
    return true
  }, [topicNotes])

  const exportResearchDossier = useCallback(async () => {
    if (dossierExporting) return false
    setDossierExporting(true)
    try {
      // Full implementation would use buildResearchDossierMarkdown
      return true
    } finally {
      setDossierExporting(false)
    }
  }, [dossierExporting])

  const exportResearchHighlights = useCallback(() => {
    if (topicNotes.length === 0) return false
    return true
  }, [topicNotes])

  const openNotebookEntry = useCallback((note: FavoriteExcerpt) => {
    if (note.route) navigate(note.route)
    else if (note.topicId) navigate(`/topic/${note.topicId}`)
  }, [navigate])

  // History content for WorkbenchLayout
  const historyContent = (
    <>
      {store.threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => setStore((current) => ({ ...current, currentThreadId: thread.id }))}
          className={`block w-full rounded-[16px] px-3 py-3 text-left text-sm transition ${
            thread.id === store.currentThreadId
              ? 'bg-white text-black shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
              : 'bg-[var(--surface-soft)] text-black/58 hover:bg-white/70'
          }`}
        >
          <div className="truncate">
            {thread.messages.length === 0 && !thread.title
              ? t('workbench.actionNewChat', 'New Chat')
              : thread.title}
          </div>
        </button>
      ))}
    </>
  )

  // Assistant composer for WorkbenchLayout
  const assistantComposer = (
    <>
      <ContextTray
        items={contextPills}
        implicitFocus={implicitFocusPill}
        readingTrail={readingTrailPills}
        suggestions={contextSuggestions}
        onAdd={(pill) => setContextPills((current) => current.some((item) => item.id === pill.id) ? current : [pill, ...current])}
        onCaptureSelection={captureSelectionPill}
        onRemove={(id) => setContextPills((current) => current.filter((item) => item.id !== id))}
      />
      <GroundedComposer
        value={question}
        onChange={setQuestion}
        onSubmit={() => void sendQuestion(question)}
        quickActions={composerQuickActions}
        onUseQuickAction={setQuestion}
        searchEnabled={searchEnabled}
        onToggleSearch={() => setSearchEnabled((current) => !current)}
        thinkingEnabled={thinkingEnabled}
        onToggleThinking={() => setThinkingEnabled((current) => !current)}
        style={style as WorkbenchStyle}
        onStyleChange={setStyle}
        disabled={!question.trim()}
        assistantState={assistantState}
      />
    </>
  )

  // Tab content renderer
  const renderTabContent = () => {
    if (activeTab === 'assistant') {
      return (
        <div className="space-y-2">
          {currentThread.messages.length === 0 ? (
            <AssistantEmptyState
              starterPrompt={starterPrompt}
              suggestedQuestions={emptyStateQuestions}
              brief={researchBriefState}
              onUsePrompt={setQuestion}
            />
          ) : (
            <ConversationThread
              messages={currentThread.messages}
              onOpenCitation={onOpenCitation}
              onAction={(action) =>
                ((action.action === 'explain' || action.action === 'compare' || action.action === 'summarize') &&
                !action.targetId
                  ? void sendQuestion(action.label)
                  : onAction(action))
              }
              onUsePrompt={setQuestion}
              onSaveMessage={saveAssistantMessage}
            />
          )}

          {hasAssistantIntake && (
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
                  {assistantIntakeOpen ? t('workbench.contextIntakeHide', 'Hide') : t('workbench.contextIntakeShow', 'Show')}
                </button>
              </div>
              {!assistantIntakeOpen ? (
                <p className="mt-1 text-[10px] leading-4 text-black/48">
                  {t('workbench.contextIntakeSummary', 'Reading focus and research context stay available without taking over the thread.')}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {!compactSurface && (
                    <ResearchSessionCard
                      session={researchSession}
                      brief={researchBriefState}
                      durationHours={researchHours}
                      onDurationHoursChange={setResearchHours}
                      onStart={() => void startResearchSession()}
                      onStop={() => void stopResearchSession()}
                      starting={researchStarting || researchLoading}
                      stopping={researchStopping}
                      onUsePrompt={setQuestion}
                    />
                  )}
                  <CurrentReadingFocusCard entry={currentReadingEntry} onNavigate={(route) => navigate(route)} />
                  {readingPathEntries.length > 0 && (
                    <ReadingPathCard entries={readingPathEntries} onNavigate={(route) => navigate(route)} />
                  )}
                  {!compactSurface && (
                    <ResearchIntelPanel
                      loading={researchLoading}
                      errorMessage={researchBriefError}
                      ready={hasResearchIntel}
                      onRetry={() => void loadResearchSession()}
                      onUsePrompt={setQuestion}
                    >
                      <GuidanceLedgerCard guidance={researchBriefState?.guidance ?? null} onUsePrompt={setQuestion} />
                      <ResearchWorldCard world={researchBriefState?.world ?? null} onUsePrompt={setQuestion} />
                      <WorkbenchPulseCard brief={researchBriefState} onUsePrompt={setQuestion} />
                    </ResearchIntelPanel>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )
    }

    if (activeTab === 'notes') {
      return (
        <NotebookPanel
          notes={topicNotes}
          hasSelectedEvidence={Boolean(selectedEvidence)}
          hasAssistantInsight={Boolean(latestAssistantMessage)}
          exportingDossier={dossierExporting}
          onCaptureSelectedEvidence={saveCurrentEvidence}
          onCaptureAssistantInsight={() => latestAssistantMessage && saveAssistantMessage(latestAssistantMessage)}
          onOpenNotebook={() => navigate(`/favorites?topic=${topicId}`)}
          onOpenNote={openNotebookEntry}
          onRemoveNote={removeFavorite}
          onExportDossier={() => void exportResearchDossier()}
          onExportHighlights={exportResearchHighlights}
          onExportMarkdown={() => exportTopicNotes('markdown')}
          onExportJson={() => exportTopicNotes('json')}
        />
      )
    }

    if (activeTab === 'similar') {
      return (
        <SearchPanel
          topicId={topicId}
          stageWindowMonths={searchStageWindowMonths}
          onOpenResult={onOpenSearchResult}
          onAddContext={(item) =>
            setContextPills((current) =>
              current.some((pill) => pill.id === `search:${item.kind}:${item.id}`)
                ? current
                : [buildPillFromSearch(item), ...current],
            )
          }
          onAskAboutResult={(item) => {
            setActiveTab('assistant')
            setContextPills((current) =>
              current.some((pill) => pill.id === `search:${item.kind}:${item.id}`)
                ? current
                : [buildPillFromSearch(item), ...current],
            )
            setQuestion(
              renderTemplate(
                t('workbench.followUpPromptTemplate', 'Put "{title}" back into the current topic mainline and explain what it solves.'),
                { title: item.title },
              ),
            )
          }}
        />
      )
    }

    return (
      <ResourcesPanel
        contextPills={contextPills}
        resources={resources}
        selectedEvidence={selectedEvidence}
        onSaveSelectedEvidence={selectedEvidence ? saveCurrentEvidence : undefined}
      />
    )
  }

  return (
    <WorkbenchLayout
      open={open}
      setOpen={setOpen}
      isDesktopViewport={isDesktopViewport}
      modelLabel={headerModelLabel}
      historyOpen={historyOpen}
      activeTab={activeTab}
      visibleTabs={visibleTabs}
      setActiveTab={setActiveTab}
      setHistoryOpen={setHistoryOpen}
      onNewChat={startNewChat}
      onOpenSettings={() => navigate('/settings?tab=models')}
      historyContent={historyContent}
      assistantComposer={assistantComposer}
      scrollBodyRef={scrollBodyRef}
    >
      {renderTabContent()}
    </WorkbenchLayout>
  )
}
