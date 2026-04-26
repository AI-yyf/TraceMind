import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { AssistantEmptyState } from './AssistantEmptyState'
import { ConversationThread } from './ConversationThread'
import { ContextTray } from './ContextTray'
import { CurrentReadingFocusCard } from './CurrentReadingFocusCard'
import { GuidanceLedgerCard } from './GuidanceLedgerCard'
import { GroundedComposer, type GroundedComposerMaterial } from './GroundedComposer'
import { ReadingPathCard } from './ReadingPathCard'
import { ReferencesPanel } from './ReferencesPanel'
import { ResourcesPanel } from './ResourcesPanel'
import { ResearchIntelPanel } from './ResearchIntelPanel'
import { ResearchSessionCard } from './ResearchSessionCard'
import { ResearchWorldCard } from './ResearchWorldCard'
import { NodePickerDialog } from './NodePickerDialog'
import { SearchPanel } from './SearchPanel'
import { WorkbenchPulseCard } from './WorkbenchPulseCard'
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
import { useWorkbenchEvents } from './WorkbenchEventManager'
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
  TopicChatWorkbenchPayload,
  TopicResearchView,
  TopicResearchBrief,
  TopicResearchSessionState,
  TopicWorkbenchTab,
  WorkbenchMaterialSummary,
  WorkbenchReferenceEntry,
} from '@/types/alpha'
import type { FavoriteExcerpt } from '@/types/tracker'
import {
  fetchTopicResearchBrief,
  invalidateTopicResearchBrief,
  primeTopicResearchBrief,
} from '@/utils/omniRuntimeCache'
import { ApiError, apiGet, apiPost } from '@/utils/api'
import {
  getTopicChatStorageKey,
  readLocalStorageItem,
  writeLocalStorageJson,
} from '@/utils/appStateStorage'
import { downloadNotebookTextFile, slugifyNotebookFilename } from '@/utils/researchNotebook'
import {
  DEFAULT_RESEARCH_DURATION_DAYS,
  durationDaysToHours,
  durationHoursToResearchDays,
} from '@/utils/researchDuration'
import {
  assertEvidencePayloadContract,
  assertTopicChatResponseContract,
  assertTopicNodePickerCollectionContract,
  assertTopicResearchSessionContract,
} from '@/utils/contracts'

type ResourceCard = {
  id: string
  title: string
  subtitle: string
  description: string
  kind: 'stage' | 'node' | 'paper'
  route?: string
  anchorId?: string
}

type WorkbenchChatAttachment = {
  type: 'image' | 'pdf'
  mimeType: string
  base64: string
}

type DraftWorkbenchMaterial = GroundedComposerMaterial & {
  sizeBytes: number
  attachment?: WorkbenchChatAttachment
}

type OmniParseResponse = {
  raw: {
    text: string
  }
}

const MAX_WORKBENCH_MATERIALS = 4
const MAX_WORKBENCH_TOTAL_BYTES = 7.5 * 1024 * 1024
const MAX_SINGLE_WORKBENCH_MATERIAL_BYTES = 4 * 1024 * 1024

// Utility functions (same as RightSidebarShell)
function formatMaterialBytes(value: number) {
  if (value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeMaterialText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function safeParseWorkbenchJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function collectWorkbenchStrings(
  input: unknown,
  options: { limit?: number; maxLength?: number; depth?: number } = {},
): string[] {
  const { limit = 6, maxLength = 140, depth = 0 } = options
  if (depth > 3 || limit <= 0) return []

  if (typeof input === 'string') {
    const normalized = normalizeMaterialText(input)
    return normalized ? [clipText(normalized, maxLength)] : []
  }

  if (Array.isArray(input)) {
    const output: string[] = []
    for (const item of input) {
      output.push(
        ...collectWorkbenchStrings(item, {
          limit: limit - output.length,
          maxLength,
          depth: depth + 1,
        }),
      )
      if (output.length >= limit) break
    }
    return output
  }

  if (!input || typeof input !== 'object') {
    return []
  }

  const output: string[] = []
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (['id', 'url', 'path', 'mimeType', 'type'].includes(key)) continue
    output.push(
      ...collectWorkbenchStrings(value, {
        limit: limit - output.length,
        maxLength,
        depth: depth + 1,
      }),
    )
    if (output.length >= limit) break
  }
  return output
}

function hasMeaningfulResearchIntel(brief: TopicResearchBrief | null | undefined) {
  if (!brief) return false

  const world = brief.world
  const guidance = brief.guidance
  const cognitiveMemory = brief.cognitiveMemory
  const sessionMemory = brief.sessionMemory
  const worldSummarySignals = [
    world.summary.thesis,
    world.summary.currentFocus,
    world.summary.continuity,
    world.summary.dominantQuestion,
    world.summary.dominantCritique,
    world.summary.agendaHeadline,
  ]

  const hasWorldIntel =
    worldSummarySignals.some((value) => Boolean(normalizeMaterialText(value))) ||
    world.stages.length > 0 ||
    world.nodes.length > 0 ||
    world.papers.length > 0 ||
    world.claims.length > 0 ||
    world.questions.length > 0 ||
    world.critiques.length > 0 ||
    world.agenda.length > 0

  const hasGuidanceIntel =
    guidance.directives.length > 0 ||
    Boolean(guidance.latestApplication?.directives.length) ||
    Boolean(normalizeMaterialText(guidance.latestApplication?.summary)) ||
    collectWorkbenchStrings(guidance.summary, { limit: 2, maxLength: 160 }).length > 0

  const hasCognitiveIntel =
    Boolean(normalizeMaterialText(cognitiveMemory.focus)) ||
    Boolean(normalizeMaterialText(cognitiveMemory.continuity)) ||
    Boolean(normalizeMaterialText(cognitiveMemory.conversationContract)) ||
    cognitiveMemory.projectMemories.length > 0 ||
    cognitiveMemory.feedbackMemories.length > 0 ||
    cognitiveMemory.referenceMemories.length > 0

  const hasSessionMemoryIntel =
    [
      sessionMemory.summary.currentFocus,
      sessionMemory.summary.continuity,
      sessionMemory.summary.lastResearchMove,
      sessionMemory.summary.lastUserIntent,
    ].some((value) => Boolean(normalizeMaterialText(value))) ||
    sessionMemory.summary.establishedJudgments.length > 0 ||
    sessionMemory.summary.openQuestions.length > 0 ||
    sessionMemory.summary.researchMomentum.length > 0 ||
    sessionMemory.recentEvents.length > 0

  return hasWorldIntel || hasGuidanceIntel || hasCognitiveIntel || hasSessionMemoryIntel
}

function extractMaterialIntelligence(rawText: string, fallbackName: string) {
  const parsed = safeParseWorkbenchJson<Record<string, unknown>>(rawText)

  if (parsed) {
    const directSummary =
      typeof parsed.summary === 'string'
        ? parsed.summary
        : typeof parsed.abstract === 'string'
          ? parsed.abstract
          : typeof parsed.description === 'string'
            ? parsed.description
            : typeof parsed.answer === 'string'
              ? parsed.answer
              : typeof parsed.thesis === 'string'
                ? parsed.thesis
                : typeof parsed.mainPoint === 'string'
                  ? parsed.mainPoint
                  : ''
    const highlights = Array.from(
      new Set(
        collectWorkbenchStrings(
          [
            parsed.highlights,
            parsed.keyPoints,
            parsed.bullets,
            parsed.claims,
            parsed.keyTerms,
            parsed.key_terms,
            parsed.sections,
            parsed.tables,
            parsed.figures,
          ],
          { limit: 3, maxLength: 100 },
        ),
      ),
    )

    return {
      summary:
        clipText(
          normalizeMaterialText(directSummary) ||
            collectWorkbenchStrings(parsed, { limit: 1, maxLength: 220 })[0] ||
            `Parsed material from ${fallbackName}.`,
          220,
        ) || `Parsed material from ${fallbackName}.`,
      highlights,
    }
  }

  const normalized = normalizeMaterialText(rawText)
  const fragments = normalized
    .split(/[。！？.!?;；]\s*/u)
    .map((item) => clipText(item, 96))
    .filter(Boolean)

  return {
    summary: clipText(normalized || `Parsed material from ${fallbackName}.`, 220),
    highlights: Array.from(new Set(fragments)).slice(0, 3),
  }
}

function summarizeLocalTextMaterial(name: string, text: string) {
  const normalized = normalizeMaterialText(text)
  const lines = normalized
    .split(/[\n。！？.!?;；]+/u)
    .map((item) => clipText(item, 96))
    .filter(Boolean)

  return {
    summary: clipText(normalized || `Text material supplied: ${name}.`, 220),
    highlights: Array.from(new Set(lines)).slice(0, 3),
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}.`))
    reader.readAsText(file)
  })
}

function resolveMaterialKind(file: File): WorkbenchMaterialSummary['kind'] | 'unsupported' {
  const mimeType = file.type.toLowerCase()

  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    /\.md$/iu.test(file.name) ||
    /\.txt$/iu.test(file.name) ||
    /\.json$/iu.test(file.name)
  ) {
    return 'text'
  }

  return 'unsupported'
}

function buildAutoMaterialPrompt(materials: WorkbenchMaterialSummary[]) {
  const labels = materials.map((material) => material.name).slice(0, 3)
  if (labels.length === 0) {
    return ''
  }

  return `Use the attached materials (${labels.join(', ')}) to refine the current topic judgment and explain what they change.`
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

export interface WorkbenchFullLayoutProps {
  topicId: string
  topicTitle: string
  researchBrief?: TopicResearchBrief | null
  suggestedQuestions?: string[]
  contextSuggestions?: ContextPill[]
  resources?: ResourceCard[]
  searchStageWindowMonths?: number
  onOpenCitation: (citation: CitationRef) => void
  onAction: (action: SuggestedAction) => void
  onOpenSearchResult: (item: SearchResultItem) => void
  references?: WorkbenchReferenceEntry[]
  referenceContextLabel?: string
  selectedReferenceIds?: string[]
  onToggleReferenceSelection?: (paperId: string) => void
  onSelectAllReferences?: () => void
  onClearReferenceSelection?: () => void
  onDownloadSelectedReferences?: () => void
  isDownloadingReferences?: boolean
  referenceDownloadProgress?: number
}

export function WorkbenchFullLayout({
  topicId,
  topicTitle,
  researchBrief = null,
  suggestedQuestions = [],
  contextSuggestions = [],
  resources = [],
  searchStageWindowMonths,
  onOpenCitation,
  onAction,
  onOpenSearchResult,
  references = [],
  referenceContextLabel,
  selectedReferenceIds = [],
  onToggleReferenceSelection,
  onSelectAllReferences,
  onClearReferenceSelection,
  onDownloadSelectedReferences,
  isDownloadingReferences = false,
  referenceDownloadProgress = 0,
}: WorkbenchFullLayoutProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useI18n()
  const { copy } = useProductCopy()
  const { state: readingWorkspaceState, getTopicWorkbenchState, patchTopicWorkbenchState } =
    useReadingWorkspace()
  const { favorites, addFavorite } = useFavorites()
  const mainScrollRef = useRef<HTMLDivElement | null>(null)

  // Research state
  const [research, setResearch] = useState<{
    brief: TopicResearchBrief | null
    error: string | null
    session: TopicResearchSessionState | null
    loading: boolean
    starting: boolean
    stopping: boolean
    durationDays: number
  }>({
    brief: null,
    error: null,
    session: null,
    loading: false,
    starting: false,
    stopping: false,
    durationDays: DEFAULT_RESEARCH_DURATION_DAYS,
  })

  const [modelStatus, setModelStatus] = useState<ModelCapabilitySummary | null>(null)
  const [assistantIntakeOpen, setAssistantIntakeOpen] = useState(false)
  const [assistantState, setAssistantState] = useState<AssistantState>('empty')
  const [agentBrief, setAgentBrief] = useState('')
  const [draftMaterials, setDraftMaterials] = useState<DraftWorkbenchMaterial[]>([])
  const [selectedEvidence, setSelectedEvidence] = useState<EvidencePayload | null>(null)
  const [draftHistoryIndex, setDraftHistoryIndex] = useState<number | null>(null)
  const [draftHistoryStash, setDraftHistoryStash] = useState('')

  // Node picker state
  const [paperToAdd, setPaperToAdd] = useState<SearchResultItem | null>(null)
  const [nodesForPicker, setNodesForPicker] = useState<Array<{ id: string; stageIndex: number; nodeLabel: string; nodeSubtitle?: string }>>([])
  const [nodesForPickerLoading, setNodesForPickerLoading] = useState(false)

  // Chat store state
  const [store, setStore] = useState<TopicChatStore>(() => {
    if (typeof window !== 'undefined') {
      return parseChatStore(readLocalStorageItem(getTopicChatStorageKey(topicId)))
    }
    const thread = createThread()
    return { currentThreadId: thread.id, threads: [thread] }
  })

  // Workbench state from context
  const workbenchState = readingWorkspaceState.workbenchByTopic[topicId] ?? getTopicWorkbenchState(topicId)
  const {
    activeTab,
    researchView,
    historyOpen,
    contextPills,
    searchEnabled,
    thinkingEnabled,
    style,
  } = workbenchState

  // Workbench state setters
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

  const setResearchView = useCallback(
    (
      next:
        | TopicResearchView
        | ((current: TopicResearchView) => TopicResearchView),
    ) =>
      patchTopicWorkbenchState(topicId, (current) => ({
        ...current,
        researchView:
          typeof next === 'function' ? next(current.researchView) : next,
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
  const submittedQuestionHistory = useMemo(() => {
    const seen = new Set<string>()
    const output: string[] = []

    for (let index = currentThread.messages.length - 1; index >= 0; index -= 1) {
      const message = currentThread.messages[index]
      if (message?.role !== 'user') continue

      const normalized = message.content.replace(/\s+/gu, ' ').trim()
      if (!normalized || seen.has(normalized)) continue

      seen.add(normalized)
      output.push(normalized)
    }

    return output
  }, [currentThread.messages])

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

  const activeWorkbenchMaterials = useMemo(
    () =>
      draftMaterials.filter(
        (material) => material.status === 'ready' || material.status === 'vision-only',
      ),
    [draftMaterials],
  )

  const structuredContextItems = useMemo(() => {
    const output: string[] = []

    if (implicitFocusPill?.label) {
      output.push(
        `Current reading focus: ${implicitFocusPill.label}${implicitFocusPill.description ? ` — ${implicitFocusPill.description}` : ''}`,
      )
    }

    const explicitContextItems = implicitFocusPill
      ? contextPills.filter((item) => item.id !== implicitFocusPill.id)
      : contextPills

    output.push(
      ...explicitContextItems.map(
        (item) => `${item.label}${item.description ? `: ${item.description}` : ''}`,
      ),
    )

    return output.slice(0, 8)
  }, [contextPills, implicitFocusPill])

  const canSubmitQuestion = useMemo(
    () =>
      Boolean(
        question.trim() || agentBrief.trim() || activeWorkbenchMaterials.length > 0,
      ),
    [activeWorkbenchMaterials.length, agentBrief, question],
  )

  // Labels and text
  const starterPrompt = copy(
    'assistant.starterPrompt',
    t(
      'topic.workbenchStarterPrompt',
      t(
        'workbench.starterPrompt',
        'Start by explaining which nodes, evidence, and branches are most worth reading first.',
      ),
    ),
  )
  const topicWorkbenchText = useCallback(
    (workbenchKey: string, fallback: string, topicKey?: string) =>
      t(topicKey ?? workbenchKey, t(workbenchKey, fallback)),
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

  const visibleTabs = useMemo<TopicWorkbenchTab[]>(
    () => ['assistant', 'research'],
    [],
  )
  const researchViews = useMemo<TopicResearchView[]>(
    () => ['search', 'references', 'resources'],
    [],
  )
  const researchViewLabels = useMemo<Record<TopicResearchView, string>>(
    () => ({
      search: topicWorkbenchText(
        'workbench.tabSearch',
        'Search',
        'topic.workbenchResearchViewSearch',
      ),
      references: topicWorkbenchText(
        'workbench.tabReferences',
        'References',
        'topic.workbenchResearchViewPapers',
      ),
      resources: topicWorkbenchText(
        'workbench.tabResources',
        'Resources',
        'topic.workbenchResearchViewEvidence',
      ),
    }),
    [topicWorkbenchText],
  )
  const headerModelLabel = modelLabel
  const emptyStateQuestions = suggestedQuestions.slice(0, 1)
  const emptyStateStarterPrompt = starterPrompt
  const emptyStateBrief = research.brief
  const hasResearchIntel = hasMeaningfulResearchIntel(research.brief)
  const hasAssistantIntake = Boolean(
    currentReadingEntry ||
    readingPathEntries.length > 0 ||
    research.session ||
    hasResearchIntel ||
    research.loading ||
    research.error,
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

  // Question setter
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

  const handleQuestionChange = useCallback(
    (next: string) => {
      setDraftHistoryIndex(null)
      setDraftHistoryStash('')
      setQuestion(next)
    },
    [setQuestion],
  )

  const navigateQuestionHistory = useCallback(
    (direction: 'up' | 'down') => {
      if (submittedQuestionHistory.length === 0) return false

      if (direction === 'up') {
        const nextIndex =
          draftHistoryIndex === null
            ? 0
            : Math.min(draftHistoryIndex + 1, submittedQuestionHistory.length - 1)

        if (draftHistoryIndex === null) {
          setDraftHistoryStash(question)
        }

        const nextDraft = submittedQuestionHistory[nextIndex]
        if (!nextDraft) return false

        setDraftHistoryIndex(nextIndex)
        setQuestion(nextDraft)
        return true
      }

      if (draftHistoryIndex === null) return false

      const nextIndex = draftHistoryIndex - 1
      if (nextIndex >= 0) {
        const nextDraft = submittedQuestionHistory[nextIndex]
        if (!nextDraft) return false

        setDraftHistoryIndex(nextIndex)
        setQuestion(nextDraft)
        return true
      }

      setDraftHistoryIndex(null)
      setQuestion(draftHistoryStash)
      setDraftHistoryStash('')
      return true
    },
    [draftHistoryIndex, draftHistoryStash, question, setQuestion, submittedQuestionHistory],
  )

  // Set up event handlers
  useWorkbenchEvents({
    topicId,
    open: true,
    setOpen: () => {},
    setActiveTab,
    setContextPills,
    setQuestion,
    setHistoryOpen,
    setModelStatus,
    isDesktopViewport: true,
  })

  // Load research session
  const loadResearchSession = useCallback(
    async (silent = false, force = false) => {
      if (!silent) setResearch((r) => ({ ...r, loading: true }))

      try {
        const data = await fetchTopicResearchBrief(topicId, { force })
        const nextHours =
          data.session.progress?.durationHours ?? data.session.task?.options?.durationHours
        const normalizedDurationDays =
          typeof nextHours === 'number' && Number.isFinite(nextHours)
            ? durationHoursToResearchDays(nextHours)
            : undefined

        setResearch((r) => ({
          ...r,
          brief: data,
          session: data.session,
          error: null,
          loading: silent ? r.loading : false,
          durationDays: normalizedDurationDays ?? r.durationDays,
        }))
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : t('workbench.researchIntelErrorMessage', 'The workbench could not refresh the topic intelligence.')

        setResearch((r) => ({
          ...r,
          error: message,
          brief: silent ? r.brief : null,
          session: silent ? r.session : null,
          loading: silent ? r.loading : false,
        }))
      }
    },
    [t, topicId],
  )

  // Start/stop research
  const startResearchSession = useCallback(async () => {
    setResearch((r) => ({ ...r, starting: true }))
    try {
      const data = await apiPost<unknown, { durationHours: number }>(
        `/api/topics/${topicId}/research-session`,
        { durationHours: durationDaysToHours(research.durationDays) },
      )
      assertTopicResearchSessionContract(data, topicId)
      setResearch((r) => ({ ...r, session: { task: data.task, progress: data.progress, report: data.report, active: data.active, strategy: data.strategy }, error: null }))
      setActiveTab('assistant')
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : t(
              'workbench.researchSessionStartErrorMessage',
              'The workbench could not start the topic research session just now.',
            )
      setResearch((r) => ({ ...r, error: message }))
    } finally {
      setResearch((r) => ({ ...r, starting: false }))
    }
  }, [topicId, research.durationDays, setActiveTab, t])

  const stopResearchSession = useCallback(async () => {
    if (!research.session?.task?.id) return
    setResearch((r) => ({ ...r, stopping: true }))
    try {
      const data = await apiPost<unknown>(`/api/topics/${topicId}/research-session/stop`, {})
      assertTopicResearchSessionContract(data, topicId)
      invalidateTopicResearchBrief(topicId)
      await loadResearchSession(true, true)
      setResearch((r) => ({ ...r, error: null }))
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : t(
              'workbench.researchSessionStopErrorMessage',
              'The workbench could not stop the topic research session just now.',
            )
      setResearch((r) => ({ ...r, error: message }))
    } finally {
      setResearch((r) => ({ ...r, stopping: false }))
    }
  }, [topicId, research.session?.task?.id, loadResearchSession, t])

  // Persist store to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    writeLocalStorageJson(getTopicChatStorageKey(topicId), store)
  }, [store, topicId])

  // Combined lifecycle effect
  useEffect(() => {
    if (typeof window === 'undefined') return
    setStore(parseChatStore(readLocalStorageItem(getTopicChatStorageKey(topicId))))
    setAssistantState('empty')
    setAgentBrief('')
    setDraftMaterials([])
    setDraftHistoryIndex(null)
    setDraftHistoryStash('')
    setResearch((r) => ({ ...r, starting: false, stopping: false }))

    if (researchBrief?.topicId === topicId) {
      primeTopicResearchBrief(researchBrief)
      setResearch((r) => ({ ...r, brief: researchBrief, session: researchBrief.session, error: null }))
    } else {
      void loadResearchSession()
    }

    const requestedFocus = searchParams.get('focus')
    const requestedResearchView =
      requestedFocus === 'references' || requestedFocus === 'resources' || requestedFocus === 'search'
        ? requestedFocus
        : null
    const requestedResearchSurface =
      requestedFocus === 'research' || Boolean(requestedResearchView)

    if (requestedResearchSurface) {
      setActiveTab('research')
      if (requestedResearchView) {
        setResearchView(requestedResearchView)
      }
      const next = new URLSearchParams(searchParams)
      next.delete('focus')
      setSearchParams(next, { replace: true })
    }
  }, [
    topicId,
    researchBrief,
    searchParams,
    setSearchParams,
    setActiveTab,
    setResearchView,
    loadResearchSession,
  ])

  useEffect(() => {
    setDraftHistoryIndex(null)
    setDraftHistoryStash('')
  }, [currentThread.id])

  // Poll for active research
  useEffect(() => {
    if (!research.session?.active && research.session?.report?.status !== 'running') return
    const timer = window.setInterval(() => void loadResearchSession(true, true), 15000)
    return () => window.clearInterval(timer)
  }, [loadResearchSession, research.session?.active, research.session?.report?.status])

  // Handle selected evidence
  useEffect(() => {
    const selectedEvidenceAnchorId = searchParams.get('evidence')
    if (!selectedEvidenceAnchorId) {
      setSelectedEvidence(null)
      return
    }

    let alive = true

    apiGet<unknown>(`/api/evidence/${encodeURIComponent(selectedEvidenceAnchorId)}`)
      .then((payload) => {
        assertEvidencePayloadContract(payload)
        if (alive) {
          setSelectedEvidence(payload)
        }
      })
      .catch(() => {
        if (alive) {
          setSelectedEvidence(null)
          const next = new URLSearchParams(searchParams)
          if (next.get('evidence') === selectedEvidenceAnchorId) {
            next.delete('evidence')
            setSearchParams(next, { replace: true })
          }
        }
      })

    return () => {
      alive = false
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!selectedEvidence) return
    const next = buildPillFromEvidence(selectedEvidence)
    setContextPills((current) =>
      current.some((item) => item.id === next.id) ? current : [next, ...current],
    )
  }, [selectedEvidence, setContextPills])

  // Fetch nodes for node picker when needed
  useEffect(() => {
    if (!paperToAdd) {
      setNodesForPicker([])
      return
    }
    let alive = true
    setNodesForPickerLoading(true)
    apiGet<
      Array<{
        id: string
        stageIndex: number
        nodeLabel: string
        nodeSubtitle?: string
      }>
    >(`/api/nodes?topicId=${encodeURIComponent(topicId)}`)
      .then((data) => {
        assertTopicNodePickerCollectionContract(data)
        if (alive) setNodesForPicker(data)
      })
      .catch(() => {
        if (alive) setNodesForPicker([])
      })
      .finally(() => {
        if (alive) setNodesForPickerLoading(false)
      })
    return () => {
      alive = false
    }
  }, [paperToAdd, topicId])

  // Sync assistant state + validate active tab + scroll to bottom
  useEffect(() => {
    if (currentThread.messages.length === 0 && !question.trim()) setAssistantState('empty')
    else if (question.trim()) setAssistantState('drafting')

    if (!visibleTabs.includes(activeTab)) {
      setActiveTab('assistant')
      setHistoryOpen(false)
    }

    if (!historyOpen) {
      const body = mainScrollRef.current
      if (body) {
        const frame = window.requestAnimationFrame(() => {
          body.scrollTo({ top: body.scrollHeight, behavior: activeTab === 'assistant' ? 'smooth' : 'auto' })
        })
        return () => window.cancelAnimationFrame(frame)
      }
    }
  }, [currentThread.messages.length, question, activeTab, visibleTabs, setActiveTab, setHistoryOpen, historyOpen, topicNotes.length])

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
        setDraftHistoryIndex(null)
        setDraftHistoryStash('')
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
    setAgentBrief('')
    setDraftMaterials([])
    setDraftHistoryIndex(null)
    setDraftHistoryStash('')
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

  const removeDraftMaterial = useCallback((id: string) => {
    setDraftMaterials((current) => current.filter((material) => material.id !== id))
  }, [])

  const clearDraftMaterials = useCallback(() => {
    setDraftMaterials([])
  }, [])

  const parseMaterialWithOmni = useCallback(async (attachment: WorkbenchChatAttachment, fileName: string) => {
    const parsed = await apiPost<
      OmniParseResponse,
      {
        task: 'document_parse'
        prompt: string
        attachments: WorkbenchChatAttachment[]
      }
    >('/api/omni/parse', {
      task: 'document_parse',
      prompt:
        'Distill this research material into compact JSON for a workbench handoff. Return a short summary, up to three highlights, and any figure, table, or formula cues that matter. Keep source terms and titles as-is.',
      attachments: [attachment],
    })

    return extractMaterialIntelligence(parsed.raw.text, fileName)
  }, [])

  const handleMaterialSelection = useCallback(
    async (files: FileList | null) => {
      const incoming = Array.from(files ?? [])
      if (incoming.length === 0) return

      let projectedBytes = draftMaterials.reduce((total, material) => total + material.sizeBytes, 0)
      let projectedCount = draftMaterials.length

      for (const file of incoming) {
        const materialId = `material:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
        const kind = resolveMaterialKind(file)
        const sizeLabel = formatMaterialBytes(file.size)
        const baseMaterial: DraftWorkbenchMaterial = {
          id: materialId,
          kind: kind === 'unsupported' ? 'text' : kind,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          sizeLabel,
          summary: '',
          highlights: [],
          status: 'parsing',
        }

        if (projectedCount >= MAX_WORKBENCH_MATERIALS) {
          setDraftMaterials((current) => [
            {
              ...baseMaterial,
              status: 'error',
              summary: 'Workbench material limit reached.',
              error: `Add up to ${MAX_WORKBENCH_MATERIALS} materials per turn to keep the handoff compact.`,
            },
            ...current,
          ])
          continue
        }

        if (kind === 'unsupported') {
          setDraftMaterials((current) => [
            {
              ...baseMaterial,
              status: 'error',
              summary: 'Unsupported material type.',
              error:
                'Use images, PDFs, or text notes so the workbench can ground the backend agent cleanly.',
            },
            ...current,
          ])
          continue
        }

        if (file.size > MAX_SINGLE_WORKBENCH_MATERIAL_BYTES) {
          setDraftMaterials((current) => [
            {
              ...baseMaterial,
              status: 'error',
              summary: 'Material exceeds the per-file limit.',
              error: `Keep each material under ${formatMaterialBytes(MAX_SINGLE_WORKBENCH_MATERIAL_BYTES)} to fit the current workbench pipeline.`,
            },
            ...current,
          ])
          continue
        }

        if (projectedBytes + file.size > MAX_WORKBENCH_TOTAL_BYTES) {
          setDraftMaterials((current) => [
            {
              ...baseMaterial,
              status: 'error',
              summary: 'Material exceeds the current workbench upload budget.',
              error: `Keep the total intake under ${formatMaterialBytes(MAX_WORKBENCH_TOTAL_BYTES)} per turn.`,
            },
            ...current,
          ])
          continue
        }

        projectedBytes += file.size
        projectedCount += 1

        setDraftMaterials((current) => [
          {
            ...baseMaterial,
            summary:
              kind === 'text'
                ? 'Preparing text material for the agent.'
                : 'Parsing material for the backend agent.',
          },
          ...current,
        ])

        let preparedAttachment: WorkbenchChatAttachment | undefined

        try {
          if (kind === 'text') {
            const text = await readFileAsText(file)
            const summary = summarizeLocalTextMaterial(file.name, text)

            setDraftMaterials((current) =>
              current.map((material) =>
                material.id === materialId
                  ? {
                      ...material,
                      summary: summary.summary,
                      highlights: summary.highlights,
                      status: 'ready',
                    }
                  : material,
              ),
            )
            continue
          }

          const dataUrl = await readFileAsDataUrl(file)
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : dataUrl
          preparedAttachment = {
            type: kind,
            mimeType: file.type || (kind === 'image' ? 'image/png' : 'application/pdf'),
            base64,
          }
          const parsed = await parseMaterialWithOmni(preparedAttachment, file.name)

          setDraftMaterials((current) =>
            current.map((material) =>
              material.id === materialId
                ? {
                    ...material,
                    summary: parsed.summary,
                    highlights: parsed.highlights,
                    status: 'ready',
                    attachment: kind === 'image' ? preparedAttachment : undefined,
                  }
                : material,
            ),
          )
        } catch (error) {
          setDraftMaterials((current) =>
            current.map((material) => {
              if (material.id !== materialId) return material

              if (kind === 'image' && preparedAttachment) {
                return {
                  ...material,
                  status: 'vision-only',
                  summary: `Visual material attached: ${file.name}.`,
                  highlights: [],
                  attachment: preparedAttachment,
                  error:
                    error instanceof Error
                      ? `${error.message} The image will still be available to the vision model.`
                      : 'The image could not be distilled automatically, but it will still be available to the vision model.',
                }
              }

              return {
                ...material,
                status: 'error',
                summary: `Could not prepare ${file.name}.`,
                error:
                  error instanceof Error
                    ? error.message
                    : 'The material could not be distilled for the workbench handoff.',
              }
            }),
          )
        }
      }
    },
    [draftMaterials, parseMaterialWithOmni],
  )

  // Notebook entry handlers
  const saveNotebookEntry = useCallback(
    (entry: FavoriteExcerpt) => {
      addFavorite(entry)
    },
    [addFavorite],
  )

  const saveAssistantMessage = useCallback((message: StoredChatMessage) => {
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

  const exportAssistantMessage = useCallback(
    (message: StoredChatMessage, format: 'md' | 'json' | 'txt') => {
      const titleSeed =
        message.content
          .split('\n')
          .map((line) => line.trim())
          .find(Boolean) ?? 'assistant-message'
      const stem = slugifyNotebookFilename(`${topicTitle || topicId}-${clipText(titleSeed, 48)}`)

      if (format === 'json') {
        downloadNotebookTextFile(
          `${stem}.json`,
          JSON.stringify(
            {
              topicId,
              topicTitle,
              exportedAt: new Date().toISOString(),
              message,
            },
            null,
            2,
          ),
          'application/json;charset=utf-8',
        )
        return
      }

      downloadNotebookTextFile(
        `${stem}.${format}`,
        message.content,
        format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8',
      )
    },
    [topicId, topicTitle],
  )

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
    const brief = agentBrief.trim()
    const messageMaterials: WorkbenchMaterialSummary[] = activeWorkbenchMaterials.map(
      ({ id, kind, name, mimeType, summary, highlights, status }) => ({
        id,
        kind,
        name,
        mimeType,
        summary,
        highlights,
        status,
      }),
    )
    const effectiveQuestion =
      trimmed || brief || buildAutoMaterialPrompt(messageMaterials)

    if (!effectiveQuestion.trim()) return

    const composerSnapshot = {
      question: trimmed,
      agentBrief,
      materials: draftMaterials,
    }

    appendMessages([
      buildMessage('user', effectiveQuestion, {
        workbench: {
          agentBrief: brief || undefined,
          materials: messageMaterials.length > 0 ? messageMaterials : undefined,
        },
      }),
    ])
    setAgentBrief('')
    setDraftMaterials([])
    setAssistantState('submitting')
    const timer = window.setTimeout(() => setAssistantState(searchEnabled ? 'retrieving' : 'thinking'), 120)

    try {
      const imageAttachments = activeWorkbenchMaterials
        .filter(
          (material): material is DraftWorkbenchMaterial & { attachment: WorkbenchChatAttachment } =>
            material.kind === 'image' && Boolean(material.attachment?.base64),
        )
        .map((material) => material.attachment)

      const workbenchPayload: TopicChatWorkbenchPayload = {
        controls: {
          responseStyle: style as WorkbenchStyle,
          reasoningEnabled: thinkingEnabled,
          retrievalEnabled: searchEnabled,
        },
        contextItems: structuredContextItems,
        agentBrief: brief || undefined,
        materials: messageMaterials.length > 0 ? messageMaterials : undefined,
      }

      const data = await apiPost<
        TopicChatResponse,
        {
          question: string
          attachments?: WorkbenchChatAttachment[]
          workbench: TopicChatWorkbenchPayload
        }
      >(`/api/topics/${topicId}/chat`, {
        question: effectiveQuestion,
        attachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        workbench: workbenchPayload,
      })
      assertTopicChatResponseContract(data)

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

      if (data.workbenchAction?.targetTab === 'assistant') {
        setActiveTab('assistant')
      }

      if (data.workbenchAction?.targetTab === 'research') {
        setActiveTab('research')
        if (data.workbenchAction.targetResearchView) {
          setResearchView(data.workbenchAction.targetResearchView)
        }
      }

      if (data.workbenchAction?.targetRoute) {
        const targetRoute = data.workbenchAction.targetRoute.trim()
        navigate(targetRoute)
      }

      if (
        data.guidanceReceipt ||
        data.workbenchAction?.kind === 'start-research' ||
        data.workbenchAction?.kind === 'stop-research'
      ) {
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
      setQuestion(composerSnapshot.question)
      setDraftHistoryIndex(null)
      setDraftHistoryStash('')
      setAgentBrief(composerSnapshot.agentBrief)
      setDraftMaterials(composerSnapshot.materials)
    } finally {
      window.clearTimeout(timer)
    }
  }, [
    activeWorkbenchMaterials,
    agentBrief,
    topicId,
    style,
    searchEnabled,
    thinkingEnabled,
    appendMessages,
    draftMaterials,
    navigate,
    loadResearchSession,
    setActiveTab,
    setAgentBrief,
    setDraftMaterials,
    setQuestion,
    setResearchView,
    structuredContextItems,
    t,
    copy,
  ])

  // History content
  const historyContent = (
    <>
      {store.threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => setStore((current) => ({ ...current, currentThreadId: thread.id }))}
          className={`block w-full rounded-[12px] px-3 py-3 text-left text-sm transition ${
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

  // Render assistant tab content
  const renderAssistantContent = () => (
    <div className="space-y-4">
      {currentThread.messages.length === 0 ? (
        <AssistantEmptyState
          starterPrompt={emptyStateStarterPrompt}
          suggestedQuestions={emptyStateQuestions}
          brief={emptyStateBrief}
          compact={false}
          surfaceMode="default"
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
          onExportMessage={exportAssistantMessage}
        />
      )}

      {hasAssistantIntake && (
        <section
          className={`border-t border-black/8 px-0 pt-4 ${
            assistantIntakeOpen ? 'pb-1' : 'pb-0'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">
              {topicWorkbenchText(
                'workbench.contextIntakeTitle',
                'Context intake',
                'topic.workbenchContextTitle',
              )}
            </div>
            <button
              type="button"
              onClick={() => setAssistantIntakeOpen((current) => !current)}
              className="rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-[10px] text-black/56 transition hover:border-black/18 hover:text-black"
            >
              {assistantIntakeOpen
                ? topicWorkbenchText(
                    'workbench.contextIntakeHide',
                    'Hide',
                    'topic.workbenchContextHide',
                  )
                : topicWorkbenchText(
                    'workbench.contextIntakeShow',
                    'Show',
                    'topic.workbenchContextShow',
                  )}
            </button>
          </div>
          {!assistantIntakeOpen ? (
            <p className="mt-1 text-[10px] leading-5 text-black/42">
              {topicWorkbenchText(
                'workbench.contextIntakeSummary',
                '需要时再展开研究上下文，不打断当前对话。',
                'topic.workbenchContextSummary',
              )}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <ResearchSessionCard
                session={research.session}
                brief={research.brief}
                durationDays={research.durationDays}
                onDurationDaysChange={(durationDays) =>
                  setResearch((r) => ({ ...r, durationDays }))
                }
                onStart={() => void startResearchSession()}
                onStop={() => void stopResearchSession()}
                starting={research.starting || research.loading}
                stopping={research.stopping}
                onUsePrompt={setQuestion}
              />
              <CurrentReadingFocusCard entry={currentReadingEntry} onNavigate={(route) => navigate(route)} />
              {readingPathEntries.length > 0 && (
                <ReadingPathCard entries={readingPathEntries} onNavigate={(route) => navigate(route)} />
              )}
              <ResearchIntelPanel
                loading={research.loading}
                errorMessage={research.error}
                ready={hasResearchIntel}
                onRetry={() => void loadResearchSession()}
                onUsePrompt={setQuestion}
              >
                <GuidanceLedgerCard guidance={research.brief?.guidance ?? null} onUsePrompt={setQuestion} />
                <ResearchWorldCard world={research.brief?.world ?? null} onUsePrompt={setQuestion} />
                <WorkbenchPulseCard brief={research.brief} onUsePrompt={setQuestion} />
              </ResearchIntelPanel>
            </div>
          )}
        </section>
      )}
    </div>
  )

  // Render research tab content
  const renderResearchContent = () => (
    <section data-testid="workbench-research-panel" className="space-y-4">
      <div className="rounded-[12px] bg-[var(--surface-soft)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
              {t('workbench.tabResearch', 'Research')}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-black/56">
              {topicWorkbenchText(
                'workbench.researchWorkspaceSummary',
                'Use one shared research workspace across the topic map and node article for search, references, and grounded context.',
                'topic.workbenchResearchSummary',
              )}
            </p>
          </div>
          <span className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/56">
            {researchViewLabels[researchView]}
          </span>
        </div>
        <div className="mt-3 inline-flex flex-wrap gap-1">
          {researchViews.map((view) => (
            <button
              key={view}
              type="button"
              data-testid={`workbench-research-view-${view}`}
              onClick={() => setResearchView(view)}
              className={
                researchView === view
                  ? 'rounded-full bg-black px-3 py-1.5 text-[11px] text-white transition'
                  : 'rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/58 transition hover:border-black/18 hover:text-black'
              }
            >
              {researchViewLabels[view]}
            </button>
          ))}
        </div>
      </div>

      {researchView === 'search' ? (
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
          onAddToNode={(item) => setPaperToAdd(item)}
        />
      ) : null}

      {researchView === 'references' ? (
        <ReferencesPanel
          references={references}
          contextLabel={referenceContextLabel}
          selectedPaperIds={selectedReferenceIds}
          onTogglePaperSelection={onToggleReferenceSelection}
          onSelectAllPapers={onSelectAllReferences}
          onClearPaperSelection={onClearReferenceSelection}
          onDownloadSelected={onDownloadSelectedReferences}
          isDownloading={isDownloadingReferences}
          downloadProgress={referenceDownloadProgress}
        />
      ) : null}

      {researchView === 'resources' ? (
        <ResourcesPanel
          resources={resources}
          selectedEvidence={selectedEvidence}
          onSaveSelectedEvidence={selectedEvidence ? saveCurrentEvidence : undefined}
        />
      ) : null}
    </section>
  )

  return (
    <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden">
      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/6 bg-white/96 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-[0.16em] text-black/40">
              {t('workbench.title', 'Workbench')}
            </span>
            <span className="text-xs text-black/30">|</span>
            <span className="max-w-[300px] truncate text-sm font-medium text-black/72" title={topicTitle}>
              {topicTitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((current) => !current)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                historyOpen
                  ? 'bg-black text-white'
                  : 'border border-black/10 bg-white text-black/60 hover:border-black/18 hover:text-black'
              }`}
            >
              {t('workbench.actionHistory', 'History')}
            </button>
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/60 transition hover:border-black/18 hover:text-black"
            >
              {t('workbench.actionNewChat', 'New Chat')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings?tab=models')}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/60 transition hover:border-black/18 hover:text-black"
            >
              {headerModelLabel}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-black/5 bg-white/74 px-4 py-2 backdrop-blur">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab)
                setHistoryOpen(false)
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                activeTab === tab
                  ? 'bg-black text-white'
                  : 'text-black/50 hover:bg-black/5 hover:text-black'
              }`}
            >
              {tab === 'assistant'
                ? t('workbench.tabAssistant', 'Assistant')
                : t('workbench.tabResearch', 'Research')}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div
          ref={mainScrollRef}
          className="relative flex-1 overflow-y-auto overscroll-contain bg-[#faf9f7]"
        >
          {/* History Overlay */}
          {historyOpen ? (
            <div className="absolute inset-x-4 top-4 z-10 max-w-md rounded-[20px] border border-black/8 bg-white/98 p-4 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
                  {t('workbench.actionHistory', 'History')}
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-full p-1 text-black/40 hover:bg-black/5 hover:text-black"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {historyContent}
              </div>
            </div>
          ) : null}

          {/* Main Content */}
          <div className={`mx-auto max-w-4xl px-4 py-6 ${historyOpen ? 'pointer-events-none opacity-15 blur-[1px]' : ''}`}>
            {activeTab === 'assistant' ? renderAssistantContent() : renderResearchContent()}
          </div>
        </div>

        {/* Composer Area */}
        {activeTab === 'assistant' && (
          <div className="border-t border-black/5 bg-white/88 p-3 backdrop-blur">
            {(contextPills.length > 0 || Boolean(implicitFocusPill) || readingTrailPills.length > 0) ? (
              <div className="mb-3">
                <ContextTray
                  items={contextPills}
                  implicitFocus={implicitFocusPill}
                  readingTrail={readingTrailPills}
                  suggestions={contextSuggestions}
                  onAdd={(pill) =>
                    setContextPills((current) =>
                      current.some((item) => item.id === pill.id) ? current : [pill, ...current],
                    )
                  }
                  onCaptureSelection={captureSelectionPill}
                  onRemove={(id) => setContextPills((current) => current.filter((item) => item.id !== id))}
                />
              </div>
            ) : null}
            <GroundedComposer
              value={question}
              onChange={handleQuestionChange}
              onSubmit={() => void sendQuestion(question)}
              onNavigateHistory={navigateQuestionHistory}
              searchEnabled={searchEnabled}
              onToggleSearch={() => setSearchEnabled((current) => !current)}
              thinkingEnabled={thinkingEnabled}
              onToggleThinking={() => setThinkingEnabled((current) => !current)}
              style={style as WorkbenchStyle}
              onStyleChange={setStyle}
              disabled={!canSubmitQuestion}
              assistantState={assistantState}
              agentBrief={agentBrief}
              onAgentBriefChange={setAgentBrief}
              materials={draftMaterials}
              onSelectFiles={handleMaterialSelection}
              onRemoveMaterial={removeDraftMaterial}
              onClearMaterials={clearDraftMaterials}
              compact={false}
              surfaceMode="default"
            />
          </div>
        )}
      </div>

      {/* Right Sidebar - Research Intel Panel */}
      <aside className="hidden w-[360px] flex-col border-l border-black/6 bg-white/96 lg:flex">
        <div className="flex-1 overflow-y-auto p-4">
          <ResearchIntelPanel
            loading={research.loading}
            errorMessage={research.error}
            ready={hasResearchIntel}
            onRetry={() => void loadResearchSession()}
            onUsePrompt={setQuestion}
          >
            <GuidanceLedgerCard guidance={research.brief?.guidance ?? null} onUsePrompt={setQuestion} />
            <ResearchWorldCard world={research.brief?.world ?? null} onUsePrompt={setQuestion} />
            <WorkbenchPulseCard brief={research.brief} onUsePrompt={setQuestion} />
          </ResearchIntelPanel>
        </div>
      </aside>

      <NodePickerDialog
        open={Boolean(paperToAdd)}
        onClose={() => setPaperToAdd(null)}
        paperId={paperToAdd?.id ?? ''}
        paperTitle={paperToAdd?.title ?? ''}
        nodes={nodesForPickerLoading ? [] : nodesForPicker}
        onSuccess={() => setPaperToAdd(null)}
      />
    </div>
  )
}
