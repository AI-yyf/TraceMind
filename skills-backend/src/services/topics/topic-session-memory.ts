import { prisma } from '../../lib/prisma'
import {
  getGenerationRuntimeConfig,
  getPromptTemplateContent,
  PROMPT_TEMPLATE_IDS,
} from '../generation/prompt-registry'
import { omniGateway } from '../omni/gateway'
import { inferResearchRoleForTemplate } from '../omni/routing'
import type {
  OmniCompleteRequest,
  OmniMessage,
  TopicCitationRef,
  TopicWorkbenchAction,
} from '../omni/types'
import { loadTopicResearchReport } from './research-report'
import type { TopicGuidanceReceipt } from './topic-guidance-ledger'

const TOPIC_SESSION_MEMORY_KEY_PREFIX = 'topic:session-memory:v1:'
const DEFAULT_CONVERSATION_STYLE =
  'Answer like the same scholar who has been building this topic: grounded in the topic, nodes, papers, and evidence; explicit about uncertainty; never padded with generic filler.'
const TOPIC_SESSION_MEMORY_COMPACTION_DISABLED =
  process.env.TOPIC_SESSION_MEMORY_DISABLE_COMPACTION === '1' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT === 'child-v8' ||
  process.env.NODE_ENV === 'test'

export type TopicSessionMemoryEventKind =
  | 'chat-user'
  | 'chat-assistant'
  | 'research-cycle'
  | 'research-status'
  | 'guidance-application'
  | 'artifact-rebuild'
  | 'content-generation'  // Added for content genesis events

export interface TopicSessionMemoryEvent {
  id: string
  kind: TopicSessionMemoryEventKind
  headline: string
  summary: string
  detail?: string
  stageIndex?: number | null
  nodeIds?: string[]
  paperIds?: string[]
  citationAnchorIds?: string[]
  openQuestions?: string[]
  createdAt: string
}

export interface TopicSessionMemorySummary {
  currentFocus: string
  continuity: string
  establishedJudgments: string[]
  openQuestions: string[]
  researchMomentum: string[]
  conversationStyle: string
  lastResearchMove: string
  lastUserIntent: string
}

export interface TopicSessionMemoryState {
  schemaVersion: 'topic-session-memory-v1'
  topicId: string
  updatedAt: string
  initializedAt: string | null
  lastCompactedAt: string | null
  totalEvents: number
  chatTurnsSinceCompaction: number
  researchCyclesSinceCompaction: number
  estimatedTokensSinceCompaction: number
  recentEvents: TopicSessionMemoryEvent[]
  summary: TopicSessionMemorySummary
}

export interface TopicSessionMemoryContext {
  updatedAt: string | null
  initializedAt: string | null
  lastCompactedAt: string | null
  summary: TopicSessionMemorySummary
  recentEvents: TopicSessionMemoryEvent[]
}

export interface TopicSessionMemoryRecallContext extends TopicSessionMemoryContext {
  recalledEvents: TopicSessionMemoryEvent[]
  recallQueryTokens: string[]
}

interface TopicSessionMemoryEventInput {
  kind: TopicSessionMemoryEventKind
  headline: string
  summary: string
  detail?: string
  stageIndex?: number | null
  nodeIds?: string[]
  paperIds?: string[]
  citationAnchorIds?: string[]
  openQuestions?: string[]
}

interface TopicChatWorkbenchControls {
  responseStyle?: 'brief' | 'balanced' | 'deep'
  reasoningEnabled?: boolean
  retrievalEnabled?: boolean
}

function topicSessionMemoryKey(topicId: string) {
  return `${TOPIC_SESSION_MEMORY_KEY_PREFIX}${topicId}`
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 6) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipText(value ?? '', 220)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function normalizeStringArray(values: unknown, limit = 6, maxLength = 180) {
  if (!Array.isArray(values)) return []
  return uniqueStrings(
    values.map((item) => (typeof item === 'string' ? clipText(item, maxLength) : '')),
    limit,
  )
}

const MEMORY_NOISE_PATTERNS = [
  /args\.[a-z0-9_.-]+/iu,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Unhandled|Exception)\b/iu,
  /\bis not iterable\b/iu,
  /\b(?:authorContext|selectedEvidence|outputContract|response_style|reasoning=|retrieval=|nodeActions|activeSessionId|taskId|schemaVersion)\b/iu,
  /\b(?:eventual consistency|metadata|manual annotation|label(?:ing)? algorithm|topic id|prompt echo)\b/iu,
  /用户\s*希望我基于提供的上下文/iu,
  /首先分析关键信息/iu,
  /\bWorkbench controls?:/iu,
  /(?:无关论文|数据污染|证据链断裂|技术管道|标签算法|人工标注|主题ID|元数据存储|分布式系统|修复技术)/u,
  /\bYC-Bench\b/iu,
  /暂时无法直接回答/u,
  /not enough structured evidence/iu,
]

const MEMORY_OPERATIONAL_PATTERN =
  /(?:执行|编排|管道|主题ID|元数据|task|session|scheduler|orchestration).{0,12}(?:故障|异常|阻塞|损坏|错误|中断|失效|failure|error)/iu

function isMemoryNoise(value: string) {
  const normalized = value.replace(/\s+/gu, ' ').trim()
  if (!normalized) return true
  if (MEMORY_OPERATIONAL_PATTERN.test(normalized)) return true
  return MEMORY_NOISE_PATTERNS.some((pattern) => pattern.test(normalized))
}

function sanitizeMemoryText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length < 12 && /[a-z]/iu.test(normalized) && !/\s/u.test(normalized)) return ''
  if (isMemoryNoise(normalized)) return ''
  return clipText(normalized, maxLength)
}

function sanitizeMemoryStringArray(values: unknown, limit = 6, maxLength = 180) {
  if (!Array.isArray(values)) return []

  const output: string[] = []
  const seen = new Set<string>()

  for (const item of values) {
    const sanitized =
      typeof item === 'string'
        ? sanitizeMemoryText(item, maxLength)
        : ''

    if (!sanitized || seen.has(sanitized)) continue
    seen.add(sanitized)
    output.push(sanitized)

    if (output.length >= limit) break
  }

  return output
}

function estimateTokenCount(values: string[]) {
  const charCount = values.join(' ').length
  return Math.max(1, Math.ceil(charCount / 4))
}

const ASCII_RECALL_STOPWORDS = new Set([
  'the',
  'and',
  'that',
  'this',
  'with',
  'from',
  'have',
  'what',
  'when',
  'where',
  'which',
  'about',
  'still',
  'into',
  'does',
  'your',
  'there',
  'their',
  'than',
  'them',
  'then',
  'been',
  'were',
  'will',
  'would',
  'should',
  'could',
  'also',
  'just',
  'more',
  'most',
  'very',
  'onto',
  'over',
  'under',
  'again',
  'user',
  'topic',
  'paper',
  'node',
  'stage',
])

function tokenizeRecallText(value: string, limit = 48) {
  const normalized = clipText(value, 2000).toLowerCase()
  const output: string[] = []
  const seen = new Set<string>()

  const pushToken = (token: string) => {
    const candidate = token.trim()
    if (!candidate || seen.has(candidate)) return
    seen.add(candidate)
    output.push(candidate)
  }

  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/gu) ?? []
  for (const token of asciiTokens) {
    if (ASCII_RECALL_STOPWORDS.has(token)) continue
    pushToken(token)
    if (output.length >= limit) return output
  }

  const cjkSegments =
    normalized.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,}/gu,
    ) ?? []

  for (const segment of cjkSegments) {
    if (segment.length <= 6) {
      pushToken(segment)
    }

    for (let index = 0; index < segment.length - 1; index += 1) {
      pushToken(segment.slice(index, index + 2))
      if (segment.length - index >= 3) {
        pushToken(segment.slice(index, index + 3))
      }
      if (output.length >= limit) return output
    }
  }

  return output.slice(0, limit)
}

function buildEventRecallText(event: TopicSessionMemoryEvent) {
  return [
    event.headline,
    event.summary,
    event.detail ?? '',
    ...(event.nodeIds ?? []),
    ...(event.paperIds ?? []),
    ...(event.citationAnchorIds ?? []),
    ...(event.openQuestions ?? []),
  ]
    .filter(Boolean)
    .join(' ')
}

function eventKindRecallWeight(kind: TopicSessionMemoryEventKind) {
  switch (kind) {
    case 'research-cycle':
      return 1.18
    case 'guidance-application':
      return 1.14
    case 'research-status':
      return 1.08
    case 'artifact-rebuild':
      return 1.04
    case 'chat-assistant':
      return 0.96
    case 'chat-user':
      return 0.9
    default:
      return 1
  }
}

function recallSessionMemoryEvents(
  memory: TopicSessionMemoryState,
  query: string,
  options: {
    recallLimit: number
    lookbackLimit: number
    recencyBias: number
  },
) {
  const recallQueryTokens = tokenizeRecallText(query, 32)
  if (!query.trim() || recallQueryTokens.length === 0) {
    return { recallQueryTokens, recalledEvents: [] as TopicSessionMemoryEvent[] }
  }

  const candidates = memory.recentEvents.slice(-options.lookbackLimit)
  const candidateCount = candidates.length
  const normalizedQuery = query.trim().toLowerCase()

  const scored = candidates
    .map((event, index) => {
      const recallText = buildEventRecallText(event).toLowerCase()
      const eventTokens = new Set(tokenizeRecallText(recallText, 64))
      const overlap = recallQueryTokens.filter((token) => eventTokens.has(token)).length
      const phraseHit =
        normalizedQuery.length >= 6 && recallText.includes(normalizedQuery) ? 1 : 0

      if (overlap === 0 && phraseHit === 0) {
        return null
      }

      const overlapScore =
        overlap / Math.max(1, Math.min(recallQueryTokens.length, 6))
      const densityBonus = overlap * 0.14
      const phraseBonus = phraseHit * 0.6
      const recencyScore =
        candidateCount <= 1 ? 1 : index / Math.max(1, candidateCount - 1)
      const score =
        (overlapScore + densityBonus + phraseBonus + recencyScore * options.recencyBias) *
        eventKindRecallWeight(event.kind)

      return { event, score }
    })
    .filter((item): item is { event: TopicSessionMemoryEvent; score: number } => item !== null)
    .sort((left, right) => right.score - left.score)

  return {
    recallQueryTokens,
    recalledEvents: scored.slice(0, options.recallLimit).map((item) => item.event),
  }
}

function emptySummary(): TopicSessionMemorySummary {
  return {
    currentFocus: '',
    continuity: '',
    establishedJudgments: [],
    openQuestions: [],
    researchMomentum: [],
    conversationStyle: DEFAULT_CONVERSATION_STYLE,
    lastResearchMove: '',
    lastUserIntent: '',
  }
}

function emptyState(topicId: string): TopicSessionMemoryState {
  return {
    schemaVersion: 'topic-session-memory-v1',
    topicId,
    updatedAt: new Date().toISOString(),
    initializedAt: null,
    lastCompactedAt: null,
    totalEvents: 0,
    chatTurnsSinceCompaction: 0,
    researchCyclesSinceCompaction: 0,
    estimatedTokensSinceCompaction: 0,
    recentEvents: [],
    summary: emptySummary(),
  }
}

function parseState(topicId: string, value: string | null | undefined) {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<TopicSessionMemoryState>
    const recentEvents = Array.isArray(parsed.recentEvents)
      ? parsed.recentEvents.map((event) => ({
          id:
            clipText(typeof event?.id === 'string' ? event.id : '', 80) ||
            `evt-${Date.now()}`,
          kind:
            event?.kind === 'chat-user' ||
            event?.kind === 'chat-assistant' ||
            event?.kind === 'research-cycle' ||
            event?.kind === 'research-status' ||
            event?.kind === 'guidance-application' ||
            event?.kind === 'artifact-rebuild'
              ? event.kind
              : 'research-status',
          headline: clipText(typeof event?.headline === 'string' ? event.headline : '', 140),
          summary: clipText(typeof event?.summary === 'string' ? event.summary : '', 260),
          detail:
            clipText(typeof event?.detail === 'string' ? event.detail : '', 420) || undefined,
          stageIndex: typeof event?.stageIndex === 'number' ? event.stageIndex : null,
          nodeIds: normalizeStringArray(event?.nodeIds, 8, 80),
          paperIds: normalizeStringArray(event?.paperIds, 12, 80),
          citationAnchorIds: normalizeStringArray(event?.citationAnchorIds, 8, 80),
          openQuestions: normalizeStringArray(event?.openQuestions, 6, 180),
          createdAt:
            typeof event?.createdAt === 'string' && event.createdAt.trim()
              ? event.createdAt
              : new Date().toISOString(),
        }))
      : []
    const summary = hydrateSummaryFromRecentEvents(
      sanitizeSummary(parsed.summary, emptySummary()),
      recentEvents,
    )

    return {
      ...emptyState(topicId),
      ...parsed,
      topicId,
      recentEvents,
      summary,
    } satisfies TopicSessionMemoryState
  } catch {
    return null
  }
}

function sanitizeSummary(
  value: unknown,
  fallback: TopicSessionMemorySummary,
): TopicSessionMemorySummary {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const establishedJudgments = sanitizeMemoryStringArray(record.establishedJudgments, 6, 200)
  const openQuestions = sanitizeMemoryStringArray(record.openQuestions, 6, 180)
  const researchMomentum = sanitizeMemoryStringArray(record.researchMomentum, 5, 180)
  const currentFocus = sanitizeMemoryText(
    typeof record.currentFocus === 'string' ? record.currentFocus : fallback.currentFocus,
    260,
  )
  const continuity = sanitizeMemoryText(
    typeof record.continuity === 'string' ? record.continuity : fallback.continuity,
    260,
  )
  const conversationStyle = sanitizeMemoryText(
    typeof record.conversationStyle === 'string'
      ? record.conversationStyle
      : fallback.conversationStyle,
    200,
  )
  const lastResearchMove = sanitizeMemoryText(
    typeof record.lastResearchMove === 'string'
      ? record.lastResearchMove
      : fallback.lastResearchMove,
    180,
  )
  const lastUserIntent = sanitizeMemoryText(
    typeof record.lastUserIntent === 'string'
      ? record.lastUserIntent
      : fallback.lastUserIntent,
    180,
  )

  return {
    currentFocus: currentFocus || fallback.currentFocus,
    continuity: continuity || fallback.continuity,
    establishedJudgments:
      establishedJudgments.length > 0 ? establishedJudgments : fallback.establishedJudgments,
    openQuestions: openQuestions.length > 0 ? openQuestions : fallback.openQuestions,
    researchMomentum: researchMomentum.length > 0 ? researchMomentum : fallback.researchMomentum,
    conversationStyle: conversationStyle || DEFAULT_CONVERSATION_STYLE,
    lastResearchMove: lastResearchMove || fallback.lastResearchMove,
    lastUserIntent: lastUserIntent || fallback.lastUserIntent,
  }
}

function summarizeWorkbenchControls(controls?: TopicChatWorkbenchControls) {
  if (!controls) return ''

  const parts = [
    controls.responseStyle ? `${controls.responseStyle} answer` : '',
    typeof controls.reasoningEnabled === 'boolean'
      ? controls.reasoningEnabled
        ? 'reasoning on'
        : 'reasoning off'
      : '',
    typeof controls.retrievalEnabled === 'boolean'
      ? controls.retrievalEnabled
        ? 'retrieval on'
        : 'retrieval off'
      : '',
  ].filter(Boolean)

  return parts.join(', ')
}

function describeGuidanceKind(
  receipt: Pick<TopicGuidanceReceipt, 'classification' | 'directiveType'> | null | undefined,
) {
  const kind = receipt?.directiveType ?? receipt?.classification ?? null
  switch (kind) {
    case 'suggest':
      return 'suggest'
    case 'challenge':
      return 'challenge'
    case 'focus':
      return 'focus'
    case 'style':
      return 'style'
    case 'constraint':
      return 'constraint'
    case 'command':
      return 'command'
    default:
      return null
  }
}

function buildUserChatHeadline(args: {
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
  agentBrief?: string
  materials?: Array<{ name: string }>
  contextItems?: string[]
  controls?: TopicChatWorkbenchControls
}) {
  const guidanceKind = describeGuidanceKind(args.guidanceReceipt)
  if (guidanceKind === 'command' || args.workbenchAction) return 'Workbench command'
  if (guidanceKind === 'focus') return 'User focus directive'
  if (guidanceKind === 'style') return 'User style directive'
  if (guidanceKind === 'suggest') return 'User suggestion'
  if (guidanceKind === 'challenge') return 'User challenge'
  if (guidanceKind === 'constraint') return 'User constraint'
  if (
    (args.materials?.length ?? 0) > 0 ||
    Boolean(args.agentBrief) ||
    (args.contextItems?.length ?? 0) > 0 ||
    Boolean(summarizeWorkbenchControls(args.controls))
  ) {
    return 'User workbench handoff'
  }
  return 'User follow-up'
}

function buildAssistantChatHeadline(args: {
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
}) {
  if (args.workbenchAction) return 'Workbench command result'

  const guidanceKind = describeGuidanceKind(args.guidanceReceipt)
  switch (guidanceKind) {
    case 'focus':
      return 'Focus receipt'
    case 'style':
      return 'Style receipt'
    case 'suggest':
      return 'Suggestion receipt'
    case 'challenge':
      return 'Challenge receipt'
    case 'constraint':
      return 'Constraint receipt'
    case 'command':
      return 'Command receipt'
    default:
      return 'Sidebar answer'
  }
}

function buildUserChatSummary(args: {
  question: string
  agentBrief?: string
  materialSummary: string[]
  contextItems?: string[]
}) {
  return clipText(
    args.question ||
      args.agentBrief ||
      args.contextItems?.[0] ||
      args.materialSummary[0] ||
      'Workbench follow-up',
    220,
  )
}

function buildUserChatDetail(args: {
  guidanceReceipt?: TopicGuidanceReceipt
  agentBrief?: string
  materials?: Array<{
    name: string
    summary: string
    highlights?: string[]
    kind?: 'image' | 'pdf' | 'text'
    status?: 'parsing' | 'ready' | 'vision-only' | 'error'
  }>
  contextItems?: string[]
  controls?: TopicChatWorkbenchControls
}) {
  const controlSummary = summarizeWorkbenchControls(args.controls)

  return clipText(
    [
      args.guidanceReceipt?.scopeLabel ? `Scope: ${args.guidanceReceipt.scopeLabel}` : '',
      args.guidanceReceipt?.summary ? `Recorded as: ${args.guidanceReceipt.summary}` : '',
      args.agentBrief ? `Agent brief: ${args.agentBrief}` : '',
      args.contextItems?.length ? `Context: ${args.contextItems.join(' | ')}` : '',
      controlSummary ? `Composer preferences: ${controlSummary}` : '',
      ...(args.materials ?? []).map((material) =>
        [
          `${material.kind ?? 'material'} ${material.name}`,
          material.summary,
          ...(material.highlights ?? []).slice(0, 3),
        ]
          .filter(Boolean)
          .join(' | '),
      ),
    ]
      .filter(Boolean)
      .join('\n'),
    420,
  )
}

function buildAssistantChatSummary(args: {
  answer: string
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
}) {
  return clipText(
    args.workbenchAction?.summary || args.guidanceReceipt?.summary || args.answer,
    240,
  )
}

function buildAssistantChatDetail(args: {
  answer: string
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
}) {
  const summary = buildAssistantChatSummary(args)

  return clipText(
    [
      args.guidanceReceipt
        ? `Guidance receipt: ${args.guidanceReceipt.classification}/${args.guidanceReceipt.status} on ${args.guidanceReceipt.scopeLabel}`
        : '',
      args.guidanceReceipt?.promptHint ? `Next prompt hint: ${args.guidanceReceipt.promptHint}` : '',
      args.workbenchAction
        ? `Workbench action: ${args.workbenchAction.kind}${args.workbenchAction.targetTab ? ` -> ${args.workbenchAction.targetTab}` : ''}${args.workbenchAction.targetResearchView ? `/${args.workbenchAction.targetResearchView}` : ''}`
        : '',
      args.answer && args.answer !== summary ? args.answer : '',
    ]
      .filter(Boolean)
      .join('\n'),
    420,
  )
}

function findLatestRecentEvent(
  recentEvents: TopicSessionMemoryEvent[],
  predicate: (event: TopicSessionMemoryEvent) => boolean,
) {
  for (let index = recentEvents.length - 1; index >= 0; index -= 1) {
    const event = recentEvents[index]
    if (predicate(event)) return event
  }
  return null
}

function isResearchSignalEvent(event: TopicSessionMemoryEvent) {
  return (
    event.kind === 'research-cycle' ||
    event.kind === 'research-status' ||
    event.kind === 'guidance-application' ||
    event.kind === 'artifact-rebuild'
  )
}

function hydrateSummaryFromRecentEvents(
  value: TopicSessionMemorySummary,
  recentEvents: TopicSessionMemoryEvent[],
) {
  const base = sanitizeSummary(value, emptySummary())
  if (recentEvents.length === 0) return base

  const latestUser = findLatestRecentEvent(recentEvents, (event) => event.kind === 'chat-user')
  const latestStyleUser = findLatestRecentEvent(
    recentEvents,
    (event) => event.kind === 'chat-user' && event.headline === 'User style directive',
  )
  const latestStyleReceipt = findLatestRecentEvent(
    recentEvents,
    (event) => event.kind === 'chat-assistant' && event.headline === 'Style receipt',
  )
  const latestFocusUser = findLatestRecentEvent(
    recentEvents,
    (event) => event.kind === 'chat-user' && event.headline === 'User focus directive',
  )
  const latestFocusReceipt = findLatestRecentEvent(
    recentEvents,
    (event) => event.kind === 'chat-assistant' && event.headline === 'Focus receipt',
  )
  const latestGuidanceReceipt = findLatestRecentEvent(
    recentEvents,
    (event) => event.kind === 'chat-assistant' && /receipt$/u.test(event.headline),
  )
  const researchEvents = recentEvents.filter(isResearchSignalEvent)
  const latestResearch = findLatestRecentEvent(recentEvents, isResearchSignalEvent)

  const lastUserIntent =
    sanitizeMemoryText(latestUser?.summary || latestUser?.headline || base.lastUserIntent, 180) ||
    base.lastUserIntent
  const conversationStyle =
    sanitizeMemoryText(
      latestStyleUser?.summary ||
        latestStyleReceipt?.summary ||
        latestStyleReceipt?.detail ||
        base.conversationStyle,
      200,
    ) ||
    base.conversationStyle ||
    DEFAULT_CONVERSATION_STYLE
  const currentFocus =
    sanitizeMemoryText(
      latestFocusUser?.summary ||
        latestFocusReceipt?.summary ||
        latestResearch?.summary ||
        base.currentFocus ||
        lastUserIntent,
      260,
    ) ||
    base.currentFocus ||
    lastUserIntent
  const lastResearchMove =
    sanitizeMemoryText(
      latestResearch?.headline || latestResearch?.summary || base.lastResearchMove,
      180,
    ) || base.lastResearchMove
  const openQuestions = sanitizeMemoryStringArray(
    [
      ...[...recentEvents].reverse().flatMap((event) => event.openQuestions ?? []),
      ...base.openQuestions,
    ],
    6,
    180,
  )
  const researchMomentum = sanitizeMemoryStringArray(
    [
      ...[...researchEvents]
        .reverse()
        .flatMap((event) => [event.headline, event.summary]),
      ...base.researchMomentum,
    ],
    5,
    180,
  )
  const continuity =
    sanitizeMemoryText(
      uniqueStrings(
        [
          lastResearchMove ? `Latest research move: ${lastResearchMove}` : '',
          currentFocus ? `Current focus: ${currentFocus}` : '',
          lastUserIntent ? `Latest user steering: ${lastUserIntent}` : '',
          latestGuidanceReceipt?.summary,
          ...[...researchEvents].reverse().slice(0, 2).map((event) => event.summary),
          base.continuity,
        ],
        5,
      ).join(' '),
      260,
    ) ||
    base.continuity ||
    currentFocus

  return sanitizeSummary(
    {
      ...base,
      currentFocus,
      continuity,
      openQuestions,
      researchMomentum,
      conversationStyle,
      lastResearchMove,
      lastUserIntent,
    },
    base,
  )
}

function buildSystemPrompt(
  systemPrompt: string,
  editorialPolicy: {
    identity: string
    mission: string
    reasoning: string
    style: string
    evidence: string
    industryLens: string
    continuity: string
  },
) {
  return [
    editorialPolicy.identity,
    'Global generation charter:',
    `Mission: ${editorialPolicy.mission}`,
    `Reasoning: ${editorialPolicy.reasoning}`,
    `Style: ${editorialPolicy.style}`,
    `Evidence: ${editorialPolicy.evidence}`,
    `Industry lens: ${editorialPolicy.industryLens}`,
    `Continuity: ${editorialPolicy.continuity}`,
    '',
    'Template-specific instruction:',
    systemPrompt,
  ].join('\n')
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)
    const extracted =
      fencedMatch?.[1] ??
      value.match(/\{[\s\S]*\}/u)?.[0] ??
      value.match(/\[[\s\S]*\]/u)?.[0] ??
      null

    if (!extracted) return null

    try {
      return JSON.parse(extracted) as T
    } catch {
      return null
    }
  }
}

function _extractOpenQuestionsFromText(value: string) {
  return uniqueStrings(
    value
      .split(/[?\n！？]/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 8)
      .map((item) => (/[?？!]$/u.test(item) ? item : `${item}?`)),
    4,
  )
}

function buildFallbackSummary(
  memory: TopicSessionMemoryState,
  topicInfo: {
    title: string
    summary: string
    focusLabel: string
  },
  latestResearchReport: Awaited<ReturnType<typeof loadTopicResearchReport>>,
) {
  const sanitizedExistingSummary = sanitizeSummary(memory.summary, emptySummary())
  const recentResearchEvents = [...memory.recentEvents]
    .filter(
      (event) =>
        event.kind === 'research-cycle' ||
        event.kind === 'research-status' ||
        event.kind === 'guidance-application',
    )
    .slice(-4)
    .reverse()
  const recentUserEvents = [...memory.recentEvents]
    .filter((event) => event.kind === 'chat-user')
    .slice(-3)
    .reverse()

  const currentFocus =
    sanitizeMemoryText(
      recentResearchEvents[0]?.summary ||
        latestResearchReport?.summary ||
        latestResearchReport?.headline ||
        sanitizedExistingSummary.currentFocus ||
        topicInfo.focusLabel ||
        topicInfo.summary,
      240,
    ) || topicInfo.title

  const lastResearchMove =
    sanitizeMemoryText(
      recentResearchEvents[0]?.headline ||
        recentResearchEvents[0]?.summary ||
        latestResearchReport?.latestStageSummary ||
        sanitizedExistingSummary.lastResearchMove,
      180,
    ) || ''

  const lastUserIntent =
    sanitizeMemoryText(
      recentUserEvents[0]?.summary ||
        recentUserEvents[0]?.headline ||
        sanitizedExistingSummary.lastUserIntent,
      180,
    ) || ''

  const continuity =
    clipText(
      uniqueStrings(
        [
          latestResearchReport?.headline
            ? `Current thread: ${latestResearchReport.headline}`
            : '',
          lastResearchMove ? `Latest research move: ${lastResearchMove}` : '',
          recentResearchEvents[0]?.summary,
          recentResearchEvents[1]?.summary,
        ],
        4,
      ).join(' '),
      260,
    ) || currentFocus

  const establishedJudgments = sanitizeMemoryStringArray(
    [
      ...sanitizedExistingSummary.establishedJudgments,
      ...(latestResearchReport?.keyMoves ?? []),
      latestResearchReport?.summary,
      ...recentResearchEvents.map((event) => event.summary),
    ],
    6,
    200,
  )

  const openQuestions = sanitizeMemoryStringArray(
    [
      ...sanitizedExistingSummary.openQuestions,
      ...recentResearchEvents.flatMap((event) => event.openQuestions ?? []),
      ...(latestResearchReport?.openQuestions ?? []),
    ],
    6,
    180,
  )

  const researchMomentum = sanitizeMemoryStringArray(
    [
      ...sanitizedExistingSummary.researchMomentum,
      ...(latestResearchReport?.keyMoves ?? []),
      latestResearchReport?.headline,
      ...recentResearchEvents.map((event) => event.headline || event.summary),
    ],
    5,
    180,
  )

  return sanitizeSummary(
    {
      currentFocus,
      continuity,
      establishedJudgments,
      openQuestions,
      researchMomentum,
      conversationStyle:
        sanitizedExistingSummary.conversationStyle || DEFAULT_CONVERSATION_STYLE,
      lastResearchMove,
      lastUserIntent,
    },
    emptySummary(),
  )
}

async function buildLLMSummary(
  topicId: string,
  memory: TopicSessionMemoryState,
): Promise<TopicSessionMemorySummary> {
  const runtime = await getGenerationRuntimeConfig()
  const [topic, latestResearchReport, template] = await Promise.all([
    prisma.topics.findUnique({
      where: { id: topicId },
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        summary: true,
        focusLabel: true,
      },
    }),
    loadTopicResearchReport(topicId),
    getPromptTemplateContent(PROMPT_TEMPLATE_IDS.TOPIC_SESSION_MEMORY, runtime.defaultLanguage),
  ])

  const topicInfo = {
    title: topic?.nameZh || topic?.nameEn || topicId,
    summary: topic?.summary ?? '',
    focusLabel: topic?.focusLabel ?? '',
  }
  const fallback = buildFallbackSummary(memory, topicInfo, latestResearchReport)
  const editorialPolicy =
    runtime.editorialPolicies[runtime.defaultLanguage] ?? runtime.editorialPolicies.zh

  const messages: OmniMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt(template.system, editorialPolicy),
    },
    {
      role: 'user',
      content: [
        template.user,
        JSON.stringify(
          {
            topic: topicInfo,
            latestResearchReport: latestResearchReport
              ? {
                  headline: clipText(latestResearchReport.headline, 180),
                  summary: clipText(latestResearchReport.summary, 220),
                  currentStage: latestResearchReport.currentStage,
                  discoveredPapers: latestResearchReport.discoveredPapers,
                  admittedPapers: latestResearchReport.admittedPapers,
                  generatedContents: latestResearchReport.generatedContents,
                }
              : null,
            existingSummary: memory.summary,
            recentEvents: memory.recentEvents.slice(-12),
            memoryStats: {
              totalEvents: memory.totalEvents,
              chatTurnsSinceCompaction: memory.chatTurnsSinceCompaction,
              researchCyclesSinceCompaction: memory.researchCyclesSinceCompaction,
              estimatedTokensSinceCompaction: memory.estimatedTokensSinceCompaction,
            },
            outputContract: fallback,
          },
          null,
          2,
        ),
        'Return JSON only.',
      ].join('\n\n'),
    },
  ]

  const request: OmniCompleteRequest = {
    task: 'topic_summary',
    role: inferResearchRoleForTemplate(PROMPT_TEMPLATE_IDS.TOPIC_SESSION_MEMORY),
    messages,
    json: true,
    maxTokens: 1200,
  }

  if (!(await omniGateway.hasAvailableModel(request))) {
    return fallback
  }

  // Add timeout protection to prevent blocking chat API
  const COMPACTION_TIMEOUT_MS = 15000 // 15 seconds max for compaction

  const resultPromise = omniGateway.complete(request)
  const timeoutPromise = new Promise<ReturnType<typeof omniGateway.complete>>((_, reject) => {
    setTimeout(() => reject(new Error('Session memory compaction timeout')), COMPACTION_TIMEOUT_MS)
  })

  let result
  try {
    result = await Promise.race([resultPromise, timeoutPromise])
  } catch (timeoutErr) {
    // On timeout, return fallback immediately without blocking
    console.warn(`[TopicSessionMemory] Compaction timed out for topic ${topicId}, using fallback`)
    return fallback
  }

  if (result.issue) {
    return fallback
  }

  const parsed = safeParseJson<Partial<TopicSessionMemorySummary>>(result.text)
  return sanitizeSummary(parsed, fallback)
}

function shouldCompact(
  memory: TopicSessionMemoryState,
  runtime: Awaited<ReturnType<typeof getGenerationRuntimeConfig>>,
  options?: { allowWhenCompactionDisabled?: boolean },
) {
  if (TOPIC_SESSION_MEMORY_COMPACTION_DISABLED && !options?.allowWhenCompactionDisabled) {
    return false
  }
  if (!runtime.topicSessionMemoryEnabled) return false
  if (memory.totalEvents < runtime.topicSessionMemoryInitEventCount) return false
  if (!memory.lastCompactedAt) return true
  if (memory.chatTurnsSinceCompaction >= runtime.topicSessionMemoryChatTurnsBetweenCompaction) {
    return true
  }
  if (
    memory.researchCyclesSinceCompaction >=
    runtime.topicSessionMemoryResearchCyclesBetweenCompaction
  ) {
    return true
  }
  return memory.estimatedTokensSinceCompaction >= runtime.topicSessionMemoryTokenThreshold
}

async function persistMemory(memory: TopicSessionMemoryState) {
  const payload: TopicSessionMemoryState = {
    ...memory,
    updatedAt: new Date().toISOString(),
  }

  await prisma.system_configs.upsert({
    where: { key: topicSessionMemoryKey(memory.topicId) },
    update: { value: JSON.stringify(payload), updatedAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      key: topicSessionMemoryKey(memory.topicId),
      value: JSON.stringify(payload),
      updatedAt: new Date(),
    },
  })

  return payload
}

export async function loadTopicSessionMemory(topicId: string): Promise<TopicSessionMemoryState> {
  const record = await prisma.system_configs.findUnique({
    where: { key: topicSessionMemoryKey(topicId) },
  })

  return parseState(topicId, record?.value) ?? emptyState(topicId)
}

export async function appendTopicSessionMemoryEvent(
  topicId: string,
  input: TopicSessionMemoryEventInput,
) {
  const runtime = await getGenerationRuntimeConfig()
  if (!runtime.topicSessionMemoryEnabled) {
    return loadTopicSessionMemory(topicId)
  }

  const memory = await loadTopicSessionMemory(topicId)
  const now = new Date().toISOString()
  const event: TopicSessionMemoryEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    headline: clipText(input.headline, 140),
    summary: clipText(input.summary, 260),
    detail: clipText(input.detail, 420) || undefined,
    stageIndex: typeof input.stageIndex === 'number' ? input.stageIndex : null,
    nodeIds: uniqueStrings(input.nodeIds ?? [], 8),
    paperIds: uniqueStrings(input.paperIds ?? [], 12),
    citationAnchorIds: uniqueStrings(input.citationAnchorIds ?? [], 8),
    openQuestions: uniqueStrings(input.openQuestions ?? [], 6),
    createdAt: now,
  }

  const estimatedTokens = estimateTokenCount([
    event.headline,
    event.summary,
    event.detail ?? '',
    ...(event.openQuestions ?? []),
  ])

  const next: TopicSessionMemoryState = {
    ...memory,
    updatedAt: now,
    totalEvents: memory.totalEvents + 1,
    recentEvents: [...memory.recentEvents, event].slice(
      -runtime.topicSessionMemoryRecentEventLimit,
    ),
    chatTurnsSinceCompaction:
      memory.chatTurnsSinceCompaction +
      (event.kind === 'chat-user' || event.kind === 'chat-assistant' ? 1 : 0),
    researchCyclesSinceCompaction:
      memory.researchCyclesSinceCompaction +
      (event.kind === 'research-cycle' || event.kind === 'guidance-application' ? 1 : 0),
    estimatedTokensSinceCompaction: memory.estimatedTokensSinceCompaction + estimatedTokens,
    summary: hydrateSummaryFromRecentEvents(
      memory.summary,
      [...memory.recentEvents, event].slice(-runtime.topicSessionMemoryRecentEventLimit),
    ),
  }

  if (shouldCompact(next, runtime)) {
    next.summary = await buildLLMSummary(topicId, next)
    next.initializedAt = next.initializedAt ?? now
    next.lastCompactedAt = now
    next.chatTurnsSinceCompaction = 0
    next.researchCyclesSinceCompaction = 0
    next.estimatedTokensSinceCompaction = 0
  }

  return persistMemory(next)
}

export async function recordTopicChatExchange(args: {
  topicId: string
  question: string
  agentBrief?: string
  contextItems?: string[]
  controls?: TopicChatWorkbenchControls
  materials?: Array<{
    name: string
    summary: string
    highlights?: string[]
    kind?: 'image' | 'pdf' | 'text'
    status?: 'parsing' | 'ready' | 'vision-only' | 'error'
  }>
  answer: string
  citations?: TopicCitationRef[]
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
}) {
  const materialSummary = uniqueStrings(
    (args.materials ?? []).flatMap((material) => [
      `${material.name}: ${material.summary}`,
      ...(material.highlights ?? []).map((highlight) => `${material.name}: ${highlight}`),
    ]),
    4,
  )
  const userSummary = buildUserChatSummary({
    question: args.question,
    agentBrief: args.agentBrief,
    materialSummary,
    contextItems: args.contextItems,
  })
  const userDetail = buildUserChatDetail({
    guidanceReceipt: args.guidanceReceipt,
    agentBrief: args.agentBrief,
    materials: args.materials,
    contextItems: args.contextItems,
    controls: args.controls,
  })

  await appendTopicSessionMemoryEvent(args.topicId, {
    kind: 'chat-user',
    headline: buildUserChatHeadline({
      guidanceReceipt: args.guidanceReceipt,
      workbenchAction: args.workbenchAction,
      agentBrief: args.agentBrief,
      materials: args.materials,
      contextItems: args.contextItems,
      controls: args.controls,
    }),
    summary: userSummary || clipText(args.question, 220),
    detail: userDetail || undefined,
    citationAnchorIds: uniqueStrings(args.citations?.map((item) => item.anchorId) ?? [], 6),
    openQuestions: _extractOpenQuestionsFromText(args.question),
  })

  return appendTopicSessionMemoryEvent(args.topicId, {
    kind: 'chat-assistant',
    headline: buildAssistantChatHeadline({
      guidanceReceipt: args.guidanceReceipt,
      workbenchAction: args.workbenchAction,
    }),
    summary: buildAssistantChatSummary({
      answer: args.answer,
      guidanceReceipt: args.guidanceReceipt,
      workbenchAction: args.workbenchAction,
    }),
    detail:
      buildAssistantChatDetail({
        answer: args.answer,
        guidanceReceipt: args.guidanceReceipt,
        workbenchAction: args.workbenchAction,
      }) || undefined,
    citationAnchorIds: uniqueStrings(args.citations?.map((item) => item.anchorId) ?? [], 6),
  })
}

export async function recordTopicResearchCycle(args: {
  topicId: string
  stageIndex: number
  headline?: string
  summary: string
  nodeTitles?: string[]
  paperIds?: string[]
  openQuestions?: string[]
}) {
  return appendTopicSessionMemoryEvent(args.topicId, {
    kind: 'research-cycle',
    headline: clipText(args.headline || `Stage ${args.stageIndex} research cycle`, 140),
    summary: clipText(args.summary, 240),
    stageIndex: args.stageIndex,
    paperIds: args.paperIds,
    openQuestions: args.openQuestions,
    nodeIds: args.nodeTitles,
  })
}

export async function recordTopicResearchStatus(args: {
  topicId: string
  stageIndex?: number | null
  headline: string
  summary: string
}) {
  return appendTopicSessionMemoryEvent(args.topicId, {
    kind: 'research-status',
    headline: args.headline,
    summary: args.summary,
    stageIndex: args.stageIndex,
  })
}

export async function recordTopicGuidanceApplication(args: {
  topicId: string
  stageIndex?: number | null
  headline: string
  summary: string
  detail?: string
}) {
  return appendTopicSessionMemoryEvent(args.topicId, {
    kind: 'guidance-application',
    headline: args.headline,
    summary: args.summary,
    detail: args.detail,
    stageIndex: args.stageIndex,
  })
}

export async function collectTopicSessionMemoryContext(
  topicId: string,
  options?: { recentLimit?: number },
): Promise<TopicSessionMemoryContext> {
  const memory = await loadTopicSessionMemory(topicId)
  const recentLimit = options?.recentLimit ?? 6

  return {
    updatedAt: memory.updatedAt ?? null,
    initializedAt: memory.initializedAt,
    lastCompactedAt: memory.lastCompactedAt,
    summary: memory.summary,
    recentEvents: [...memory.recentEvents].slice(-recentLimit).reverse(),
  }
}

export async function retrieveTopicSessionMemoryContext(
  topicId: string,
  options: {
    query: string
    recentLimit?: number
    recallLimit?: number
  },
): Promise<TopicSessionMemoryRecallContext> {
  const [runtime, memory] = await Promise.all([
    getGenerationRuntimeConfig(),
    loadTopicSessionMemory(topicId),
  ])
  const recentLimit = options.recentLimit ?? 6
  const baseContext: TopicSessionMemoryContext = {
    updatedAt: memory.updatedAt ?? null,
    initializedAt: memory.initializedAt,
    lastCompactedAt: memory.lastCompactedAt,
    summary: memory.summary,
    recentEvents: [...memory.recentEvents].slice(-recentLimit).reverse(),
  }

  if (!runtime.topicSessionMemoryRecallEnabled) {
    return {
      ...baseContext,
      recalledEvents: [],
      recallQueryTokens: [],
    }
  }

  const recall = recallSessionMemoryEvents(memory, options.query, {
    recallLimit: options.recallLimit ?? runtime.topicSessionMemoryRecallLimit,
    lookbackLimit: runtime.topicSessionMemoryRecallLookbackLimit,
    recencyBias: runtime.topicSessionMemoryRecallRecencyBias,
  })

  return {
    ...baseContext,
    recalledEvents: recall.recalledEvents,
    recallQueryTokens: recall.recallQueryTokens,
  }
}

export const __testing = {
  buildFallbackSummary,
  hydrateSummaryFromRecentEvents,
  shouldCompact: (
    memory: TopicSessionMemoryState,
    runtime: Awaited<ReturnType<typeof getGenerationRuntimeConfig>>,
  ) => shouldCompact(memory, runtime, { allowWhenCompactionDisabled: true }),
  sanitizeSummary,
  sanitizeMemoryText,
  recallSessionMemoryEvents,
  tokenizeRecallText,
}
