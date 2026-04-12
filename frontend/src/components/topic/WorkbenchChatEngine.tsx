import { useCallback, useMemo, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  buildNotebookJson,
  buildNotebookMarkdown,
  buildResearchDossierMarkdown,
  buildResearchHighlightsMarkdown,
  downloadNotebookTextFile,
  slugifyNotebookFilename,
} from '@/utils/researchNotebook'
import { hasMeaningfulWorkbenchText, normalizeWorkbenchText, isWorkbenchNoiseText } from '@/utils/workbenchText'
import { ApiError, apiGet, apiPost } from '@/utils/api'
import {
  fetchTopicResearchBrief,
  invalidateTopicResearchBrief,
} from '@/utils/omniRuntimeCache'
import { useI18n } from '@/i18n'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useFavorites } from '@/hooks'
import { resolveLanguageLocale } from '@/i18n/locale'
import type {
  AssistantState,
  ContextPill,
  EvidencePayload,
  ModelCapabilitySummary,
  OmniIssue,
  SearchResultItem,
  StoredChatMessage,
  StoredChatThread,
  TopicChatResponse,
  TopicResearchBrief,
  TopicResearchExportBundle,
  TopicResearchSessionState,
  TopicWorkbenchTab,
} from '@/types/alpha'
import type { FavoriteExcerpt } from '@/types/tracker'

export type WorkbenchStyle = 'brief' | 'balanced' | 'deep'
export type TopicChatStore = { currentThreadId: string; threads: StoredChatThread[] }

export interface WorkbenchChatState {
  store: TopicChatStore
  assistantState: AssistantState
  researchBriefState: TopicResearchBrief | null
  researchBriefError: string | null
  researchSession: TopicResearchSessionState | null
  researchLoading: boolean
  researchStarting: boolean
  researchStopping: boolean
  dossierExporting: boolean
  researchHours: number
  modelStatus: ModelCapabilitySummary | null
}

export type WorkbenchChatAction =
  | { type: 'SET_STORE'; payload: TopicChatStore }
  | { type: 'SET_ASSISTANT_STATE'; payload: AssistantState }
  | { type: 'SET_RESEARCH_BRIEF'; payload: TopicResearchBrief | null }
  | { type: 'SET_RESEARCH_ERROR'; payload: string | null }
  | { type: 'SET_RESEARCH_SESSION'; payload: TopicResearchSessionState | null }
  | { type: 'SET_RESEARCH_LOADING'; payload: boolean }
  | { type: 'SET_RESEARCH_STARTING'; payload: boolean }
  | { type: 'SET_RESEARCH_STOPPING'; payload: boolean }
  | { type: 'SET_DOSSIER_EXPORTING'; payload: boolean }
  | { type: 'SET_RESEARCH_HOURS'; payload: number }
  | { type: 'SET_MODEL_STATUS'; payload: ModelCapabilitySummary | null }
  | { type: 'UPDATE_THREAD'; payload: (thread: StoredChatThread) => StoredChatThread }
  | { type: 'SET_QUESTION'; payload: string | ((current: string) => string) }
  | { type: 'APPEND_MESSAGES'; payload: { messages: StoredChatMessage[]; preserveComposer?: boolean } }
  | { type: 'RESET_FOR_TOPIC'; payload: { topicId: string } }

// Helper functions (moved from RightSidebarShell)
export function createThread(title = ''): StoredChatThread {
  const now = new Date().toISOString()
  return {
    id: `thread-${Date.now()}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    draft: '',
  }
}

export function isResearchStatusMessage(message: StoredChatMessage) {
  return message.role === 'assistant' && message.id.startsWith('research:')
}

export function compactThreadMessages(messages: StoredChatMessage[]) {
  const latestResearchMessage = [...messages].reverse().find(isResearchStatusMessage)
  if (!latestResearchMessage) return messages
  return messages.filter(
    (message) =>
      !isResearchStatusMessage(message) || message.id === latestResearchMessage.id,
  )
}

export function sanitizeStoredChatMessage(message: StoredChatMessage) {
  const content = normalizeWorkbenchText(message.content)
  if (!content) return null
  if (message.role === 'assistant' && isWorkbenchNoiseText(content)) return null
  return { ...message, content }
}

export function parseChatStore(value: string | null): TopicChatStore {
  if (!value) {
    const thread = createThread()
    return { currentThreadId: thread.id, threads: [thread] }
  }

  try {
    const parsed = JSON.parse(value) as TopicChatStore
    if (Array.isArray(parsed.threads) && parsed.threads.length > 0) {
      return {
        ...parsed,
        threads: parsed.threads.map((thread) => ({
          ...thread,
          title: hasMeaningfulWorkbenchText(thread.title) ? normalizeWorkbenchText(thread.title) : '',
          draft: typeof thread.draft === 'string' ? thread.draft : '',
          messages: compactThreadMessages(Array.isArray(thread.messages) ? thread.messages : [])
            .map((message) => sanitizeStoredChatMessage(message))
            .filter((message): message is StoredChatMessage => Boolean(message)),
        })),
      }
    }
  } catch {
    // Ignore malformed persisted data and recreate.
  }

  const thread = createThread()
  return { currentThreadId: thread.id, threads: [thread] }
}

export function buildMessage(
  role: 'assistant' | 'user',
  content: string,
  extra?: Partial<StoredChatMessage>,
): StoredChatMessage {
  return {
    id: extra?.id ?? `${role}-${Date.now()}`,
    role,
    content,
    citations: extra?.citations,
    suggestedActions: extra?.suggestedActions,
    guidanceReceipt: extra?.guidanceReceipt,
    notice: extra?.notice,
    createdAt: new Date().toISOString(),
  }
}

export function buildPillFromEvidence(evidence: EvidencePayload): ContextPill {
  return {
    id: `evidence:${evidence.anchorId}`,
    kind: 'evidence',
    label: evidence.label,
    description: evidence.quote,
    route: evidence.route,
    anchorId: evidence.anchorId,
  }
}

export function buildPillFromSearch(item: SearchResultItem): ContextPill {
  return {
    id: `search:${item.kind}:${item.id}`,
    kind: 'search',
    label: item.title,
    description: item.excerpt,
    route: item.route,
    anchorId: item.anchorId,
  }
}

export function clipText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export function splitNotebookParagraphs(content: string, maxParts = 6) {
  const parts = content
    .split(/\n{2,}/u)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length > 0) return parts.slice(0, maxParts)
  return content
    .split(/[。！？?!?]\s*/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxParts)
}

export function extractNotebookTitle(content: string, fallback: string) {
  const firstLine = content
    .split('\n')
    .map((line) => line.replace(/^[#>*\-\s]+/u, '').trim())
    .find(Boolean)
  return clipText(firstLine || fallback, 52)
}

export function getNotebookListDelimiters(
  language: 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru',
) {
  if (language === 'zh') {
    return { inline: '\u3001', block: '\uff1b' }
  }
  return { inline: ', ', block: '; ' }
}

export function buildAssistantNotebookEntry({
  topicId,
  topicTitle,
  language,
  message,
  fallbackTitle,
  evidencePrefix,
  sourceLabel,
  summaryTemplate,
  summaryFallback,
}: {
  topicId: string
  topicTitle: string
  language: 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'
  message: StoredChatMessage
  fallbackTitle: string
  evidencePrefix: string
  sourceLabel: string
  summaryTemplate: string
  summaryFallback: string
}): FavoriteExcerpt {
  const citedLabels = message.citations?.map((citation) => citation.label).filter(Boolean) ?? []
  const paragraphs = splitNotebookParagraphs(message.content)
  const route = message.citations?.[0]?.route || `/topic/${topicId}`
  const delimiters = getNotebookListDelimiters(language)

  return {
    id: `assistant:${topicId}:${message.id}`,
    kind: 'assistant',
    topicId,
    topicTitle,
    excerptTitle: extractNotebookTitle(message.content, fallbackTitle),
    paragraphs:
      citedLabels.length > 0
        ? [...paragraphs, `${evidencePrefix}${citedLabels.join(delimiters.block)}`]
        : paragraphs,
    savedAt: new Date().toISOString(),
    route,
    anchorId: message.citations?.[0]?.anchorId,
    sourceLabel,
    summary:
      citedLabels.length > 0
        ? renderTemplate(summaryTemplate, { labels: citedLabels.slice(0, 3).join(delimiters.inline) })
        : summaryFallback,
    tags: citedLabels.slice(0, 4),
  }
}

export function buildEvidenceNotebookEntry({
  topicId,
  topicTitle,
  evidence,
  figureSourceLabel,
  textSourceLabel,
}: {
  topicId: string
  topicTitle: string
  evidence: EvidencePayload
  figureSourceLabel: string
  textSourceLabel: string
}): FavoriteExcerpt {
  return {
    id: `evidence:${topicId}:${evidence.anchorId}`,
    kind: 'evidence',
    topicId,
    topicTitle,
    paperId:
      typeof evidence.metadata?.paperId === 'string' ? evidence.metadata.paperId : undefined,
    paperTitleZh: evidence.title,
    excerptTitle: evidence.label,
    paragraphs: [evidence.quote, evidence.content, evidence.whyItMatters]
      .filter((item): item is string => Boolean(item?.trim()))
      .map((item) => item.trim())
      .slice(0, 6),
    savedAt: new Date().toISOString(),
    route: evidence.route,
    anchorId: evidence.anchorId,
    sourceLabel: evidence.type === 'figure' || evidence.type === 'table' || evidence.type === 'formula'
      ? figureSourceLabel
      : textSourceLabel,
    summary: evidence.whyItMatters ? clipText(evidence.whyItMatters, 120) : clipText(evidence.quote, 120),
    tags: [evidence.type, evidence.title].filter(Boolean),
  }
}

// Initial state factory
export function createInitialWorkbenchChatState(topicId: string): WorkbenchChatState {
  const store =
    typeof window !== 'undefined'
      ? parseChatStore(window.localStorage.getItem(`topic-chat:${topicId}`))
      : { currentThreadId: createThread().id, threads: [createThread()] }

  return {
    store,
    assistantState: 'empty',
    researchBriefState: null,
    researchBriefError: null,
    researchSession: null,
    researchLoading: false,
    researchStarting: false,
    researchStopping: false,
    dossierExporting: false,
    researchHours: 4,
    modelStatus: null,
  }
}

// Reducer
export function workbenchChatReducer(
  state: WorkbenchChatState,
  action: WorkbenchChatAction,
): WorkbenchChatState {
  switch (action.type) {
    case 'SET_STORE':
      return { ...state, store: action.payload }
    case 'SET_ASSISTANT_STATE':
      return { ...state, assistantState: action.payload }
    case 'SET_RESEARCH_BRIEF':
      return { ...state, researchBriefState: action.payload }
    case 'SET_RESEARCH_ERROR':
      return { ...state, researchBriefError: action.payload }
    case 'SET_RESEARCH_SESSION':
      return { ...state, researchSession: action.payload }
    case 'SET_RESEARCH_LOADING':
      return { ...state, researchLoading: action.payload }
    case 'SET_RESEARCH_STARTING':
      return { ...state, researchStarting: action.payload }
    case 'SET_RESEARCH_STOPPING':
      return { ...state, researchStopping: action.payload }
    case 'SET_DOSSIER_EXPORTING':
      return { ...state, dossierExporting: action.payload }
    case 'SET_RESEARCH_HOURS':
      return { ...state, researchHours: action.payload }
    case 'SET_MODEL_STATUS':
      return { ...state, modelStatus: action.payload }
    case 'UPDATE_THREAD':
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((thread) =>
            thread.id === state.store.currentThreadId ? action.payload(thread) : thread,
          ),
        },
      }
    case 'SET_QUESTION':
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((thread) => {
            if (thread.id !== state.store.currentThreadId) return thread
            const currentDraft = thread.draft ?? ''
            const resolvedDraft =
              typeof action.payload === 'function' ? action.payload(currentDraft) : action.payload
            return resolvedDraft === currentDraft ? thread : { ...thread, draft: resolvedDraft }
          }),
        },
      }
    case 'APPEND_MESSAGES':
      return {
        ...state,
        store: {
          ...state.store,
          threads: state.store.threads.map((thread) => {
            if (thread.id !== state.store.currentThreadId) return thread
            const nextMessages = [...thread.messages, ...action.payload.messages]
            return {
              ...thread,
              title:
                nextMessages.find((item) => item.role === 'user')?.content.slice(0, 48) ||
                thread.title,
              updatedAt: new Date().toISOString(),
              messages: nextMessages,
            }
          }),
        },
      }
    case 'RESET_FOR_TOPIC':
      return {
        ...createInitialWorkbenchChatState(action.payload.topicId),
        assistantState: 'empty',
        researchStarting: false,
        researchStopping: false,
      }
    default:
      return state
  }
}

// Hook interface
export interface UseWorkbenchChatResult {
  // State
  store: TopicChatStore
  assistantState: AssistantState
  researchBriefState: TopicResearchBrief | null
  researchBriefError: string | null
  researchSession: TopicResearchSessionState | null
  researchLoading: boolean
  researchStarting: boolean
  researchStopping: boolean
  dossierExporting: boolean
  researchHours: number
  modelStatus: ModelCapabilitySummary | null
  currentThread: StoredChatThread
  question: string
  latestAssistantMessage: StoredChatMessage | null
  topicNotes: FavoriteExcerpt[]

  // Actions
  setStore: (store: TopicChatStore) => void
  setAssistantState: (state: AssistantState) => void
  setResearchBriefState: (brief: TopicResearchBrief | null) => void
  setResearchSession: (session: TopicResearchSessionState | null) => void
  setResearchBriefError: (error: string | null) => void
  setResearchLoading: (loading: boolean) => void
  setResearchStarting: (starting: boolean) => void
  setResearchStopping: (stopping: boolean) => void
  setDossierExporting: (exporting: boolean) => void
  setResearchHours: (hours: number) => void
  setModelStatus: (status: ModelCapabilitySummary | null) => void
  setQuestion: (question: string | ((current: string) => string)) => void
  appendMessages: (messages: StoredChatMessage[], options?: { preserveComposer?: boolean }) => void
  startNewChat: () => void
  loadResearchSession: (silent?: boolean, force?: boolean) => Promise<void>
  startResearchSession: () => Promise<void>
  stopResearchSession: () => Promise<void>
  sendQuestion: (nextQuestion: string) => Promise<void>
  saveAssistantMessage: (message: StoredChatMessage) => void
  saveCurrentEvidence: () => void
  exportTopicNotes: (format: 'markdown' | 'json') => boolean
  exportResearchDossier: () => Promise<boolean>
  exportResearchHighlights: () => boolean
  openNotebookEntry: (note: FavoriteExcerpt) => void
  captureSelectionPill: () => ContextPill | null
}

export function useWorkbenchChat(
  topicId: string,
  topicTitle: string,
  selectedEvidence: EvidencePayload | null,
  openWorkbench: () => void,
  setActiveTab: (tab: TopicWorkbenchTab) => void,
  style: WorkbenchStyle,
  searchEnabled: boolean,
  thinkingEnabled: boolean,
  contextPills: ContextPill[],
  implicitFocusPill: ContextPill | null,
): UseWorkbenchChatResult {
  const navigate = useNavigate()
  const { preference, t } = useI18n()
  const { copy } = useProductCopy()
  const { favorites, addFavorite } = useFavorites()

  // State management using reducer pattern (simplified - caller manages via useState/useReducer)
  const [state, dispatch] = useReducer(workbenchChatReducer, topicId, createInitialWorkbenchChatState)

  // Derived state
  const currentThread = useMemo(
    () => state.store.threads.find((thread) => thread.id === state.store.currentThreadId) ?? createThread(),
    [state.store],
  )
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

  // Action creators
  const setStore = useCallback((store: TopicChatStore) => dispatch({ type: 'SET_STORE', payload: store }), [])
  const setAssistantState = useCallback((s: AssistantState) => dispatch({ type: 'SET_ASSISTANT_STATE', payload: s }), [])
  const setResearchBriefState = useCallback((brief: TopicResearchBrief | null) => dispatch({ type: 'SET_RESEARCH_BRIEF', payload: brief }), [])
  const setResearchSession = useCallback((session: TopicResearchSessionState | null) => dispatch({ type: 'SET_RESEARCH_SESSION', payload: session }), [])
  const setResearchBriefError = useCallback((error: string | null) => dispatch({ type: 'SET_RESEARCH_ERROR', payload: error }), [])
  const setResearchLoading = useCallback((loading: boolean) => dispatch({ type: 'SET_RESEARCH_LOADING', payload: loading }), [])
  const setResearchStarting = useCallback((starting: boolean) => dispatch({ type: 'SET_RESEARCH_STARTING', payload: starting }), [])
  const setResearchStopping = useCallback((stopping: boolean) => dispatch({ type: 'SET_RESEARCH_STOPPING', payload: stopping }), [])
  const setDossierExporting = useCallback((exporting: boolean) => dispatch({ type: 'SET_DOSSIER_EXPORTING', payload: exporting }), [])
  const setResearchHours = useCallback((hours: number) => dispatch({ type: 'SET_RESEARCH_HOURS', payload: hours }), [])
  const setModelStatus = useCallback((status: ModelCapabilitySummary | null) => dispatch({ type: 'SET_MODEL_STATUS', payload: status }), [])
  const setQuestion = useCallback((q: string | ((current: string) => string)) => dispatch({ type: 'SET_QUESTION', payload: q }), [])

  const appendMessages = useCallback(
    (messages: StoredChatMessage[], options?: { preserveComposer?: boolean }) => {
      dispatch({ type: 'APPEND_MESSAGES', payload: { messages, preserveComposer: options?.preserveComposer } })
      if (!options?.preserveComposer) {
        dispatch({ type: 'SET_QUESTION', payload: '' })
        dispatch({ type: 'SET_ASSISTANT_STATE', payload: 'empty' })
      }
    },
    [],
  )

  const startNewChat = useCallback(() => {
    const nextThread = createThread(t('workbench.actionNewChat', copy('assistant.actionNewChat', 'New Chat')))
    dispatch({
      type: 'SET_STORE',
      payload: {
        currentThreadId: nextThread.id,
        threads: [nextThread, ...state.store.threads],
      },
    })
    dispatch({ type: 'SET_QUESTION', payload: '' })
    dispatch({ type: 'SET_ASSISTANT_STATE', payload: 'empty' })
  }, [state.store.threads, t, copy])

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
          const normalized = Math.min(48, Math.max(1, Math.round(nextHours)))
          if (normalized !== state.researchHours) {
            setResearchHours(normalized)
          }
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : t(
                'workbench.researchIntelErrorMessage',
                'The workbench could not refresh the topic intelligence just now. Your thread is still safe and you can retry.',
              )
        setResearchBriefError(message)
        if (!silent) {
          setResearchBriefState(null)
          setResearchSession(null)
        }
      } finally {
        if (!silent) setResearchLoading(false)
      }
    },
    [topicId, setResearchBriefError, setResearchBriefState, setResearchHours, setResearchLoading, setResearchSession, t, state.researchHours],
  )

  const startResearchSession = useCallback(async () => {
    setResearchStarting(true)

    try {
      const data = await apiPost<
        TopicResearchSessionState & { result?: unknown },
        { durationHours: number }
      >(`/api/topics/${topicId}/research-session`, {
        durationHours: state.researchHours,
      })

      setResearchSession({
        task: data.task,
        progress: data.progress,
        report: data.report,
        active: data.active,
        strategy: data.strategy,
      })
      setResearchBriefError(null)
      if (state.researchBriefState) {
        setResearchBriefState({
          ...state.researchBriefState,
          session: {
            task: data.task,
            progress: data.progress,
            report: data.report,
            active: data.active,
            strategy: data.strategy,
          },
        })
      }
      openWorkbench()
      setActiveTab('assistant')
    } finally {
      setResearchStarting(false)
    }
  }, [topicId, state.researchHours, state.researchBriefState, openWorkbench, setActiveTab, setResearchBriefError, setResearchBriefState, setResearchSession, setResearchStarting])

  const stopResearchSession = useCallback(async () => {
    if (!state.researchSession?.task?.id) return

    setResearchStopping(true)

    try {
      await apiPost<TopicResearchSessionState>(`/api/topics/${topicId}/research-session/stop`, {})
      setResearchBriefError(null)
      invalidateTopicResearchBrief(topicId)
      await loadResearchSession(true, true)
    } finally {
      setResearchStopping(false)
    }
  }, [topicId, state.researchSession?.task?.id, loadResearchSession, setResearchBriefError, setResearchStopping])

  const sendQuestion = useCallback(
    async (nextQuestion: string) => {
      const trimmed = nextQuestion.trim()
      if (!trimmed) return

      appendMessages([buildMessage('user', trimmed)])
      setAssistantState('submitting')
      const stateTransitionTimer = window.setTimeout(
        () => setAssistantState(searchEnabled ? 'retrieving' : 'thinking'),
        120,
      )

      const explicitContextItems = implicitFocusPill
        ? contextPills.filter((item) => item.id !== implicitFocusPill.id)
        : contextPills
      const focusBlock = implicitFocusPill
        ? `Current reading focus:\n- ${implicitFocusPill.label}${implicitFocusPill.description ? `: ${implicitFocusPill.description}` : ''}\n\n`
        : ''
      const contextBlock =
        explicitContextItems.length > 0
          ? `Workbench context:\n${explicitContextItems
              .map((item) => `- ${item.label}${item.description ? `: ${item.description}` : ''}`)
              .join('\n')}\n\n`
          : ''

      try {
        const data = await apiPost<TopicChatResponse, { question: string }>(
          `/api/topics/${topicId}/chat`,
          {
            question: `${focusBlock}${contextBlock}${trimmed}\n\nWorkbench controls:\nresponse_style=${style}\nreasoning=${thinkingEnabled ? 'enabled' : 'disabled'}\nretrieval=${searchEnabled ? 'enabled' : 'disabled'}`,
          },
        )

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

        if (data.workbenchAction) {
          // Handle workbench action (caller handles this via callback)
        } else if (data.guidanceReceipt) {
          invalidateTopicResearchBrief(topicId)
          await loadResearchSession(true, true)
        }
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null
        setAssistantState(apiError?.statusCode === 429 ? 'rate-limited' : 'hard-error')

        const notice: OmniIssue = {
          code: 'provider_error',
          title: t('workbench.requestFailedTitle', 'Request Failed'),
          message: t(
            'workbench.requestFailedMessage',
            'The workbench keeps your draft, context, and history. Check model settings and try again.',
          ),
        }

        appendMessages([
          buildMessage(
            'assistant',
            copy(
              'assistant.requestFailed',
              t(
                'workbench.requestFailedReply',
                'This request did not complete, but the workbench, draft, and context are still here.',
              ),
            ),
            { notice },
          ),
        ], { preserveComposer: true })
        setQuestion(trimmed)
      } finally {
        window.clearTimeout(stateTransitionTimer)
      }
    },
    [
      topicId,
      contextPills,
      implicitFocusPill,
      style,
      searchEnabled,
      thinkingEnabled,
      appendMessages,
      setAssistantState,
      loadResearchSession,
      setQuestion,
      t,
      copy,
    ],
  )

  const saveNotebookEntry = useCallback(
    (entry: FavoriteExcerpt) => {
      addFavorite(entry)
      openWorkbench()
      setActiveTab('notes')
    },
    [addFavorite, openWorkbench, setActiveTab],
  )

  const saveAssistantMessage = useCallback(
    (message: StoredChatMessage) => {
      saveNotebookEntry(
        buildAssistantNotebookEntry({
          topicId,
          topicTitle,
          language: preference.primary,
          message,
          fallbackTitle: t('workbench.notebookEntryTitle', 'AI Topic Briefing'),
          evidencePrefix: t('workbench.notebookCitationsPrefix', 'Related evidence: '),
          sourceLabel: t('workbench.notebookSourceWorkbench', 'Conversation workbench'),
          summaryTemplate: t('workbench.notebookSummaryEvidenceTemplate', 'Built around {labels}'),
          summaryFallback: t('workbench.notebookSummaryMainline', 'Built around the current topic mainline'),
        }),
      )
    },
    [topicId, topicTitle, preference.primary, saveNotebookEntry, t],
  )

  const saveCurrentEvidence = useCallback(() => {
    if (!selectedEvidence) return
    saveNotebookEntry(
      buildEvidenceNotebookEntry({
        topicId,
        topicTitle,
        evidence: selectedEvidence,
        figureSourceLabel: t('workbench.notebookSourceEvidenceCard', 'Evidence card'),
        textSourceLabel: t('workbench.notebookSourceEvidenceText', 'Body evidence'),
      }),
    )
  }, [topicId, topicTitle, selectedEvidence, saveNotebookEntry, t])

  const exportTopicNotes = useCallback(
    (format: 'markdown' | 'json') => {
      if (topicNotes.length === 0) return false

      const locale = resolveLanguageLocale(preference.primary)
      const title = renderTemplate(t('workbench.exportNotesTitle', '{topic} Research Notes'), { topic: topicTitle })
      const stem = slugifyNotebookFilename(title)
      const content =
        format === 'markdown'
          ? buildNotebookMarkdown(topicNotes, { [topicId]: topicTitle }, { title, locale })
          : buildNotebookJson(topicNotes)

      downloadNotebookTextFile(
        format === 'markdown' ? `${stem}.md` : `${stem}.json`,
        content,
        format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      )
      return true
    },
    [topicNotes, topicId, topicTitle, preference.primary, t],
  )

  const exportResearchDossier = useCallback(async () => {
    if (state.dossierExporting) return false

    setDossierExporting(true)

    try {
      const locale = resolveLanguageLocale(preference.primary)
      const bundle = await apiGet<TopicResearchExportBundle>(`/api/topics/${topicId}/export-bundle`)
      const title = renderTemplate(t('workbench.exportDossierTitle', '{topic} Research Dossier'), { topic: topicTitle })
      const stem = slugifyNotebookFilename(title)

      downloadNotebookTextFile(
        `${stem}.md`,
        buildResearchDossierMarkdown(bundle, topicNotes, { title, locale }),
        'text/markdown;charset=utf-8',
      )
      return true
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : t(
              'workbench.exportDossierFailed',
              copy('assistant.exportDossierFailed', 'Failed to export the research dossier. Please try again later.'),
            )
      window.alert(message)
      return false
    } finally {
      setDossierExporting(false)
    }
  }, [topicId, topicTitle, topicNotes, state.dossierExporting, preference.primary, setDossierExporting, t, copy])

  const exportResearchHighlights = useCallback(() => {
    if (topicNotes.length === 0) return false

    const locale = resolveLanguageLocale(preference.primary)
    const title = renderTemplate(t('workbench.exportHighlightsTitle', '{topic} Research Highlights'), { topic: topicTitle })
    const stem = slugifyNotebookFilename(title)

    downloadNotebookTextFile(
      `${stem}.md`,
      buildResearchHighlightsMarkdown(topicNotes, { [topicId]: topicTitle }, { title, locale }),
      'text/markdown;charset=utf-8',
    )
    return true
  }, [topicNotes, topicId, topicTitle, preference.primary, t])

  const openNotebookEntry = useCallback(
    (note: FavoriteExcerpt) => {
      if (note.route) {
        navigate(note.route)
        return
      }
      if (note.topicId) {
        navigate(`/topic/${note.topicId}`)
      }
    },
    [navigate],
  )

  const captureSelectionPill = useCallback(() => {
    const text = window.getSelection?.()?.toString().trim()
    if (!text) return null

    const pill: ContextPill = {
      id: `selection:${Date.now()}`,
      kind: 'selection',
      label: text.length > 42 ? `${text.slice(0, 42)}...` : text,
      description: text,
      route: `${window.location.pathname}${window.location.search}`,
    }
    return pill
  }, [])

  return {
    // State
    store: state.store,
    assistantState: state.assistantState,
    researchBriefState: state.researchBriefState,
    researchBriefError: state.researchBriefError,
    researchSession: state.researchSession,
    researchLoading: state.researchLoading,
    researchStarting: state.researchStarting,
    researchStopping: state.researchStopping,
    dossierExporting: state.dossierExporting,
    researchHours: state.researchHours,
    modelStatus: state.modelStatus,
    currentThread,
    question,
    latestAssistantMessage,
    topicNotes,

    // Actions
    setStore,
    setAssistantState,
    setResearchBriefState,
    setResearchSession,
    setResearchBriefError,
    setResearchLoading,
    setResearchStarting,
    setResearchStopping,
    setDossierExporting,
    setResearchHours,
    setModelStatus,
    setQuestion,
    appendMessages,
    startNewChat,
    loadResearchSession,
    startResearchSession,
    stopResearchSession,
    sendQuestion,
    saveAssistantMessage,
    saveCurrentEvidence,
    exportTopicNotes,
    exportResearchDossier,
    exportResearchHighlights,
    openNotebookEntry,
    captureSelectionPill,
  }
}
