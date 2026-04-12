import { prisma } from '../../lib/prisma'

const TOPIC_GUIDANCE_LEDGER_KEY_PREFIX = 'topic:guidance-ledger:v1:'
const MAX_TOPIC_GUIDANCE_DIRECTIVES = 48

export type TopicGuidanceMessageKind =
  | 'ask'
  | 'suggest'
  | 'challenge'
  | 'focus'
  | 'style'
  | 'command'

export type TopicGuidanceScopeType = 'topic' | 'stage' | 'node' | 'paper' | 'evidence'
export type TopicGuidanceDirectiveType =
  | 'suggest'
  | 'challenge'
  | 'focus'
  | 'style'
  | 'constraint'
  | 'command'
export type TopicGuidanceDirectiveStrength = 'soft' | 'strong'
export type TopicGuidanceDirectiveStatus =
  | 'accepted'
  | 'partial'
  | 'deferred'
  | 'rejected'
  | 'superseded'
  | 'consumed'
export type TopicGuidanceDirectiveWindow =
  | 'next-run'
  | 'until-cleared'
  | 'current-session'

export interface TopicGuidanceLatestApplicationDirective {
  directiveId: string
  directiveType: TopicGuidanceDirectiveType
  scopeLabel: string
  instruction: string
  status: TopicGuidanceDirectiveStatus
  note: string
}

export interface TopicGuidanceLatestApplication {
  appliedAt: string
  stageIndex: number | null
  summary: string
  directives: TopicGuidanceLatestApplicationDirective[]
}

export interface TopicGuidanceDirective {
  id: string
  topicId: string
  sourceMessageId: string
  messageKind: TopicGuidanceMessageKind
  scopeType: TopicGuidanceScopeType
  scopeId: string | null
  scopeLabel: string
  directiveType: TopicGuidanceDirectiveType
  instruction: string
  rationale: string
  effectSummary: string
  promptHint: string
  strength: TopicGuidanceDirectiveStrength
  status: TopicGuidanceDirectiveStatus
  appliesToRuns: TopicGuidanceDirectiveWindow
  lastAppliedAt: string | null
  lastAppliedStageIndex: number | null
  lastAppliedSummary: string
  createdAt: string
  updatedAt: string
}

export interface TopicGuidanceLedgerSummary {
  activeDirectiveCount: number
  acceptedDirectiveCount: number
  deferredDirectiveCount: number
  latestDirective: string
  focusHeadline: string
  styleHeadline: string
  challengeHeadline: string
  latestAppliedSummary: string
  latestAppliedAt: string | null
  latestAppliedDirectiveCount: number
}

export interface TopicGuidanceLedgerState {
  schemaVersion: 'topic-guidance-ledger-v1'
  topicId: string
  updatedAt: string | null
  directives: TopicGuidanceDirective[]
  latestApplication: TopicGuidanceLatestApplication | null
  summary: TopicGuidanceLedgerSummary
}

export interface TopicGuidanceReceipt {
  classification: TopicGuidanceMessageKind
  directiveId: string | null
  directiveType: TopicGuidanceDirectiveType | null
  status: TopicGuidanceDirectiveStatus | 'none'
  scopeLabel: string
  summary: string
  effectWindow: TopicGuidanceDirectiveWindow | 'none'
  promptHint: string
}

interface TopicGuidanceLedgerRecord {
  schemaVersion: 'topic-guidance-ledger-record-v1'
  topicId: string
  savedAt: string
  ledger: TopicGuidanceLedgerState
}

interface RecordDirectiveInput {
  topicId: string
  sourceMessageId: string
  messageKind: Exclude<TopicGuidanceMessageKind, 'ask'>
  instruction: string
  scopeType?: TopicGuidanceScopeType
  scopeId?: string | null
  scopeLabel?: string | null
}

interface UpdateDirectiveInput {
  topicId: string
  directiveId: string
  status?: TopicGuidanceDirectiveStatus
  effectSummary?: string
  promptHint?: string
}

interface RecordDirectiveApplicationInput {
  topicId: string
  stageIndex?: number | null
  summary: string
  directives: Array<{
    directiveId: string
    status?: TopicGuidanceDirectiveStatus
    note?: string
  }>
}

const ACTIVE_STATUSES = new Set<TopicGuidanceDirectiveStatus>([
  'accepted',
  'partial',
  'deferred',
])

const COMMAND_PATTERNS = [
  /\b(start|continue|resume|stop|pause|export)\b/iu,
  /\b\d+\s*(?:hour|hours|hr|hrs)\b/iu,
  /开始研究/u,
  /继续研究/u,
  /暂停研究/u,
  /停止研究/u,
  /延长研究/u,
  /导出/u,
  /研究を続ける/u,
  /研究を開始/u,
  /研究を停止/u,
  /계속 연구/u,
  /연구 계속/u,
  /연구 시작/u,
  /continuar investigaci(?:ó|o)n/iu,
  /continuar investigando/iu,
  /исследован/u,
  /продолжайт[еь].*исслед/u,
]

const STYLE_PATTERNS = [
  /\bstyle\b/iu,
  /\btone\b/iu,
  /\bwrite\b.+\b(?:more|less|like|with)\b/iu,
  /continuous article/iu,
  /mechanical bullet/iu,
  /clearer judgment/iu,
  /\bless\s+ai\b/iu,
  /风格/u,
  /语气/u,
  /写作/u,
  /命名/u,
  /小标题/u,
  /写得/u,
  /更像.*文章/u,
  /更像/u,
  /更克制/u,
  /更尖锐/u,
  /更简洁/u,
  /不要.*AI/u,
  /不要.*机器/u,
  /文体/u,
  /文章らしく/u,
  /スタイル/u,
  /もっと記事/u,
  /문체/u,
  /더.*글/u,
  /estilo/iu,
  /artículo continuo/iu,
]

const FOCUS_PATTERNS = [
  /\bfocus\b/iu,
  /\bonly\b.+\b(?:next|hour|hours|run|runs)\b/iu,
  /\bnext\s+\d+\s*(?:hour|hours|run|runs)\b/iu,
  /\bkeep\b.+\b(?:current|core|topic|node)\b/iu,
  /接下来.*(?:小时|一轮|本轮|下一轮)/u,
  /先围绕/u,
  /只研究/u,
  /重点关注/u,
  /不要继续/u,
  /不要扩题/u,
  /不要扩主题/u,
  /聚焦/u,
  /このノード/u,
  /この論文/u,
  /集中/u,
  /広げない/u,
  /여기에 집중/u,
  /지금 읽고 있는/u,
  /확장하지 마/u,
  /centrarse en/iu,
  /no ampliar/iu,
]

const CHALLENGE_PATTERNS = [
  /\bwrong\b/iu,
  /\bincorrect\b/iu,
  /\bshould(?:\s+not|n't)\b/iu,
  /\bdoesn't\b.+\bfit\b/iu,
  /不对/u,
  /不合理/u,
  /有问题/u,
  /太空泛/u,
  /不该/u,
  /质疑/u,
  /不清楚/u,
  /不准确/u,
  /有偏差/u,
  /異議/u,
  /おかしい/u,
  /見直して/u,
  /의문/u,
  /재검토/u,
  /cuestionar/iu,
  /poner en duda/iu,
]

const SUGGEST_PATTERNS = [
  /\bsuggest\b/iu,
  /\bprefer\b/iu,
  /\brather\b/iu,
  /\bit\s+would\s+be\s+better\b/iu,
  /建议/u,
  /希望/u,
  /最好/u,
  /更希望/u,
  /把重点/u,
  /请优先/u,
  /请保持/u,
  /提案/u,
  /〜したい/u,
  /優先して/u,
  /제안/u,
  /우선/u,
  /sugiero/iu,
  /propongo/iu,
]

const ASK_PATTERNS = [
  /\?$/,
  /？$/,
  /\bwhy\b/iu,
  /\bhow\b/iu,
  /\bwhat\b/iu,
  /\bwhich\b/iu,
  /\bexplain\b/iu,
  /\btell me\b/iu,
  /为什么/u,
  /如何/u,
  /怎么/u,
  /解释/u,
  /说明/u,
  /哪个/u,
  /哪些/u,
]

function topicGuidanceLedgerKey(topicId: string) {
  return `${TOPIC_GUIDANCE_LEDGER_KEY_PREFIX}${topicId}`
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function emptyTopicGuidanceLedger(topicId: string): TopicGuidanceLedgerState {
  return {
    schemaVersion: 'topic-guidance-ledger-v1',
    topicId,
    updatedAt: null,
    directives: [],
    latestApplication: null,
    summary: {
      activeDirectiveCount: 0,
      acceptedDirectiveCount: 0,
      deferredDirectiveCount: 0,
      latestDirective: '',
      focusHeadline: '',
      styleHeadline: '',
      challengeHeadline: '',
      latestAppliedSummary: '',
      latestAppliedAt: null,
      latestAppliedDirectiveCount: 0,
    },
  }
}

function normalizeDirectiveStatus(
  value: unknown,
): TopicGuidanceDirectiveStatus {
  return value === 'accepted' ||
    value === 'partial' ||
    value === 'deferred' ||
    value === 'rejected' ||
    value === 'superseded' ||
    value === 'consumed'
    ? value
    : 'accepted'
}

function normalizeDirectiveWindow(
  value: unknown,
): TopicGuidanceDirectiveWindow {
  return value === 'next-run' ||
    value === 'until-cleared' ||
    value === 'current-session'
    ? value
    : 'next-run'
}

function normalizeDirectiveType(
  value: unknown,
): TopicGuidanceDirectiveType {
  return value === 'suggest' ||
    value === 'challenge' ||
    value === 'focus' ||
    value === 'style' ||
    value === 'constraint' ||
    value === 'command'
    ? value
    : 'suggest'
}

function normalizeMessageKind(
  value: unknown,
): TopicGuidanceMessageKind {
  return value === 'ask' ||
    value === 'suggest' ||
    value === 'challenge' ||
    value === 'focus' ||
    value === 'style' ||
    value === 'command'
    ? value
    : 'ask'
}

function normalizeScopeType(
  value: unknown,
): TopicGuidanceScopeType {
  return value === 'topic' ||
    value === 'stage' ||
    value === 'node' ||
    value === 'paper' ||
    value === 'evidence'
    ? value
    : 'topic'
}

function summarizeGuidanceLedger(
  directives: TopicGuidanceDirective[],
  latestApplication: TopicGuidanceLatestApplication | null = null,
): TopicGuidanceLedgerSummary {
  const active = directives.filter((directive) => ACTIVE_STATUSES.has(directive.status))
  const latest = active[0] ?? directives[0] ?? null
  const focus = active.find((directive) => directive.directiveType === 'focus') ?? null
  const style = active.find((directive) => directive.directiveType === 'style') ?? null
  const challenge = active.find((directive) => directive.directiveType === 'challenge') ?? null

  return {
    activeDirectiveCount: active.length,
    acceptedDirectiveCount: active.filter((directive) =>
      directive.status === 'accepted' || directive.status === 'partial',
    ).length,
    deferredDirectiveCount: active.filter((directive) => directive.status === 'deferred').length,
    latestDirective: latest?.effectSummary ?? latest?.instruction ?? '',
    focusHeadline: focus?.instruction ?? '',
    styleHeadline: style?.instruction ?? '',
    challengeHeadline: challenge?.instruction ?? '',
    latestAppliedSummary: latestApplication?.summary ?? '',
    latestAppliedAt: latestApplication?.appliedAt ?? null,
    latestAppliedDirectiveCount: latestApplication?.directives.length ?? 0,
  }
}

function normalizeLatestApplication(
  value: unknown,
): TopicGuidanceLatestApplication | null {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  if (!record) return null

  const appliedAt =
    typeof record.appliedAt === 'string' && record.appliedAt.trim()
      ? record.appliedAt
      : null
  const summary = clipText(typeof record.summary === 'string' ? record.summary : '', 220)
  const directives = Array.isArray(record.directives)
    ? record.directives
        .map((item) => {
          const directive =
            item && typeof item === 'object' && !Array.isArray(item)
              ? (item as Record<string, unknown>)
              : null
          if (!directive) return null

          const directiveId =
            typeof directive.directiveId === 'string' && directive.directiveId.trim()
              ? directive.directiveId
              : ''
          if (!directiveId) return null

          return {
            directiveId,
            directiveType: normalizeDirectiveType(directive.directiveType),
            scopeLabel: clipText(typeof directive.scopeLabel === 'string' ? directive.scopeLabel : '', 80),
            instruction: clipText(typeof directive.instruction === 'string' ? directive.instruction : '', 220),
            status: normalizeDirectiveStatus(directive.status),
            note: clipText(typeof directive.note === 'string' ? directive.note : '', 180),
          } satisfies TopicGuidanceLatestApplicationDirective
        })
        .filter(
          (directive): directive is TopicGuidanceLatestApplicationDirective => Boolean(directive),
        )
        .slice(0, 6)
    : []

  if (!appliedAt || !summary || directives.length === 0) {
    return null
  }

  return {
    appliedAt,
    stageIndex:
      typeof record.stageIndex === 'number' && Number.isFinite(record.stageIndex)
        ? record.stageIndex
        : null,
    summary,
    directives,
  }
}

function normalizeLedgerState(
  topicId: string,
  value: string | null | undefined,
): TopicGuidanceLedgerState {
  if (!value) return emptyTopicGuidanceLedger(topicId)

  try {
    const parsed = JSON.parse(value) as Partial<TopicGuidanceLedgerRecord | TopicGuidanceLedgerState>
    const rawLedger =
      parsed && 'ledger' in parsed && parsed.ledger
        ? parsed.ledger
        : parsed
    const ledger =
      rawLedger && typeof rawLedger === 'object'
        ? (rawLedger as Partial<TopicGuidanceLedgerState>)
        : {}

    const directives = Array.isArray(ledger?.directives)
      ? ledger.directives
          .map((directive: Partial<TopicGuidanceDirective> | null) => {
            if (!directive || typeof directive !== 'object') return null

            const createdAt =
              typeof directive.createdAt === 'string' && directive.createdAt.trim()
                ? directive.createdAt
                : new Date().toISOString()
            const updatedAt =
              typeof directive.updatedAt === 'string' && directive.updatedAt.trim()
                ? directive.updatedAt
                : createdAt

            return {
              id:
                typeof directive.id === 'string' && directive.id.trim()
                  ? directive.id
                  : `guidance:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
              topicId:
                typeof directive.topicId === 'string' && directive.topicId.trim()
                  ? directive.topicId
                  : topicId,
              sourceMessageId:
                typeof directive.sourceMessageId === 'string' && directive.sourceMessageId.trim()
                  ? directive.sourceMessageId
                  : `message:${Date.now()}`,
              messageKind: normalizeMessageKind(directive.messageKind),
              scopeType: normalizeScopeType(directive.scopeType),
              scopeId:
                typeof directive.scopeId === 'string' && directive.scopeId.trim()
                  ? directive.scopeId
                  : null,
              scopeLabel:
                typeof directive.scopeLabel === 'string' && directive.scopeLabel.trim()
                  ? directive.scopeLabel
                  : '当前主题',
              directiveType: normalizeDirectiveType(directive.directiveType),
              instruction: clipText(
                typeof directive.instruction === 'string' ? directive.instruction : '',
                220,
              ),
              rationale: clipText(
                typeof directive.rationale === 'string' ? directive.rationale : '',
                220,
              ),
              effectSummary: clipText(
                typeof directive.effectSummary === 'string' ? directive.effectSummary : '',
                220,
              ),
              promptHint: clipText(
                typeof directive.promptHint === 'string' ? directive.promptHint : '',
                180,
              ),
              strength: directive.strength === 'strong' ? 'strong' : 'soft',
              status: normalizeDirectiveStatus(directive.status),
              appliesToRuns: normalizeDirectiveWindow(directive.appliesToRuns),
              lastAppliedAt:
                typeof directive.lastAppliedAt === 'string' && directive.lastAppliedAt.trim()
                  ? directive.lastAppliedAt
                  : null,
              lastAppliedStageIndex:
                typeof directive.lastAppliedStageIndex === 'number' &&
                Number.isFinite(directive.lastAppliedStageIndex)
                  ? directive.lastAppliedStageIndex
                  : null,
              lastAppliedSummary: clipText(
                typeof directive.lastAppliedSummary === 'string'
                  ? directive.lastAppliedSummary
                  : '',
                180,
              ),
              createdAt,
              updatedAt,
            } satisfies TopicGuidanceDirective
          })
          .filter((directive): directive is TopicGuidanceDirective => Boolean(directive))
          .sort(
            (left: TopicGuidanceDirective, right: TopicGuidanceDirective) =>
              Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
          )
          .slice(0, MAX_TOPIC_GUIDANCE_DIRECTIVES)
      : []
    const latestApplication = normalizeLatestApplication(ledger?.latestApplication)

    return {
      schemaVersion: 'topic-guidance-ledger-v1',
      topicId,
      updatedAt:
        typeof ledger?.updatedAt === 'string' && ledger.updatedAt.trim()
          ? ledger.updatedAt
          : directives[0]?.updatedAt ?? null,
      directives,
      latestApplication,
      summary: summarizeGuidanceLedger(directives, latestApplication),
    }
  } catch {
    return emptyTopicGuidanceLedger(topicId)
  }
}

function directiveTypeFromMessageKind(
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>,
): TopicGuidanceDirectiveType {
  if (kind === 'challenge') return 'challenge'
  if (kind === 'focus') return 'focus'
  if (kind === 'style') return 'style'
  if (kind === 'command') return 'command'
  return 'suggest'
}

function statusFromMessageKind(
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>,
): TopicGuidanceDirectiveStatus {
  if (kind === 'command') return 'deferred'
  return 'accepted'
}

function windowFromMessageKind(
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>,
): TopicGuidanceDirectiveWindow {
  if (kind === 'style') return 'until-cleared'
  if (kind === 'command') return 'current-session'
  return 'next-run'
}

function strengthFromMessageKind(
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>,
): TopicGuidanceDirectiveStrength {
  return kind === 'challenge' || kind === 'focus' ? 'strong' : 'soft'
}

function rationaleFromMessageKind(
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>,
  scopeLabel: string,
): string {
  if (kind === 'challenge') {
    return `Treat this as a structural critique against ${scopeLabel} and re-check the current grouping, naming, and representative evidence before the next update.`
  }
  if (kind === 'focus') {
    return `Narrow the next research cycles around ${scopeLabel} so search, admission, and writing all prioritize this line first.`
  }
  if (kind === 'style') {
    return `Use this as a durable writing calibration for ${scopeLabel} without rewriting established facts by hand.`
  }
  if (kind === 'command') {
    return `Interpret this as a system intent coming from the right rail, but execute the actual action through the research controls in the same sidebar.`
  }
  return `Absorb this as a user preference for ${scopeLabel} and let it shape the next research and writing passes.`
}

function effectSummaryFromDirective(args: {
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>
  instruction: string
  scopeLabel: string
}) {
  const instruction = clipText(args.instruction, 150)

  if (args.kind === 'challenge') {
    return `Marked as a high-priority challenge for ${args.scopeLabel}: ${instruction}`
  }
  if (args.kind === 'focus') {
    return `Upcoming research cycles will narrow around ${args.scopeLabel}: ${instruction}`
  }
  if (args.kind === 'style') {
    return `Future topic and node writing will follow this style calibration for ${args.scopeLabel}: ${instruction}`
  }
  if (args.kind === 'command') {
    return `Captured as a sidebar command intent for ${args.scopeLabel}: ${instruction}`
  }
  return `Accepted as an editorial preference for ${args.scopeLabel}: ${instruction}`
}

function promptHintFromDirective(args: {
  kind: Exclude<TopicGuidanceMessageKind, 'ask'>
  instruction: string
  scopeLabel: string
}) {
  if (args.kind === 'challenge') {
    return `请说明你将如何重审${args.scopeLabel}，并指出当前仍保留哪些判断。`
  }
  if (args.kind === 'focus') {
    return `请说明你接下来会如何围绕${args.scopeLabel}推进，并给出最先处理的线索。`
  }
  if (args.kind === 'style') {
    return `请说明你会如何把“${clipText(args.instruction, 60)}”落实到后续写作里。`
  }
  if (args.kind === 'command') {
    return `请概括这条系统动作接下来会如何在右侧栏中执行。`
  }
  return `请说明“${clipText(args.instruction, 60)}”会如何影响你下一轮研究。`
}

function shouldSupersede(
  existing: TopicGuidanceDirective,
  incoming: TopicGuidanceDirective,
) {
  if (!ACTIVE_STATUSES.has(existing.status)) return false
  if (existing.directiveType !== incoming.directiveType) return false

  if (
    incoming.directiveType === 'style' ||
    incoming.directiveType === 'focus' ||
    incoming.directiveType === 'command'
  ) {
    if (existing.scopeType !== incoming.scopeType) return false
    if ((existing.scopeId ?? null) !== (incoming.scopeId ?? null)) return false
    return true
  }

  return (
    existing.scopeType === incoming.scopeType &&
    (existing.scopeId ?? null) === (incoming.scopeId ?? null) &&
    existing.instruction === incoming.instruction
  )
}

export function classifyTopicGuidanceMessage(
  question: string,
): TopicGuidanceMessageKind {
  const normalized = question.replace(/\s+/gu, ' ').trim()
  if (!normalized) return 'ask'

  const styleMatch = STYLE_PATTERNS.some((pattern) => pattern.test(normalized))
  const focusMatch = FOCUS_PATTERNS.some((pattern) => pattern.test(normalized))
  const challengeMatch = CHALLENGE_PATTERNS.some((pattern) => pattern.test(normalized))
  const suggestMatch = SUGGEST_PATTERNS.some((pattern) => pattern.test(normalized))
  const askMatch = ASK_PATTERNS.some((pattern) => pattern.test(normalized))
  const commandMatch = COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))

  if (askMatch && !(styleMatch || focusMatch || challengeMatch || suggestMatch)) return 'ask'
  if (styleMatch) return 'style'
  if (focusMatch) return 'focus'
  if (challengeMatch) return 'challenge'
  if (suggestMatch) return 'suggest'
  if (commandMatch) return 'command'
  if (askMatch) return 'ask'

  return 'ask'
}

export async function loadTopicGuidanceLedger(
  topicId: string,
): Promise<TopicGuidanceLedgerState> {
  const record = await prisma.system_configs.findUnique({
    where: { key: topicGuidanceLedgerKey(topicId) },
  })

  return normalizeLedgerState(topicId, record?.value)
}

export async function saveTopicGuidanceLedger(
  state: TopicGuidanceLedgerState,
): Promise<TopicGuidanceLedgerState> {
  const directives = state.directives
    .slice(0, MAX_TOPIC_GUIDANCE_DIRECTIVES)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  const nextState: TopicGuidanceLedgerState = {
    ...state,
    schemaVersion: 'topic-guidance-ledger-v1',
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    directives,
    summary: summarizeGuidanceLedger(directives, state.latestApplication ?? null),
  }

  const payload: TopicGuidanceLedgerRecord = {
    schemaVersion: 'topic-guidance-ledger-record-v1',
    topicId: nextState.topicId,
    savedAt: new Date().toISOString(),
    ledger: nextState,
  }

  await prisma.system_configs.upsert({
    where: { key: topicGuidanceLedgerKey(nextState.topicId) },
    update: { value: JSON.stringify(payload), updatedAt: new Date() },
    create: {
      id: crypto.randomUUID(),
      key: topicGuidanceLedgerKey(nextState.topicId),
      value: JSON.stringify(payload),
      updatedAt: new Date(),
    },
  })

  return nextState
}

export async function recordTopicGuidanceDirective(
  input: RecordDirectiveInput,
): Promise<{
  ledger: TopicGuidanceLedgerState
  directive: TopicGuidanceDirective
  receipt: TopicGuidanceReceipt
}> {
  const now = new Date().toISOString()
  const scopeType = input.scopeType ?? 'topic'
  const scopeId = input.scopeId ?? null
  const scopeLabel = clipText(input.scopeLabel ?? '', 80) || '当前主题'
  const instruction = clipText(input.instruction, 220)
  const directiveType = directiveTypeFromMessageKind(input.messageKind)
  const status = statusFromMessageKind(input.messageKind)
  const appliesToRuns = windowFromMessageKind(input.messageKind)
  const strength = strengthFromMessageKind(input.messageKind)

  const directive: TopicGuidanceDirective = {
    id: `guidance:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    topicId: input.topicId,
    sourceMessageId: input.sourceMessageId,
    messageKind: input.messageKind,
    scopeType,
    scopeId,
    scopeLabel,
    directiveType,
    instruction,
    rationale: rationaleFromMessageKind(input.messageKind, scopeLabel),
    effectSummary: effectSummaryFromDirective({
      kind: input.messageKind,
      instruction,
      scopeLabel,
    }),
    promptHint: promptHintFromDirective({
      kind: input.messageKind,
      instruction,
      scopeLabel,
    }),
    strength,
    status,
    appliesToRuns,
    lastAppliedAt: null,
    lastAppliedStageIndex: null,
    lastAppliedSummary: '',
    createdAt: now,
    updatedAt: now,
  }

  const current = await loadTopicGuidanceLedger(input.topicId)
  const directives = current.directives
    .map((existing) =>
      shouldSupersede(existing, directive)
        ? {
            ...existing,
            status: 'superseded' as const,
            updatedAt: now,
          }
        : existing,
    )
    .filter((existing) => Boolean(existing.instruction))

  const ledger = await saveTopicGuidanceLedger({
    ...current,
    updatedAt: now,
    latestApplication: current.latestApplication,
    directives: [directive, ...directives].slice(0, MAX_TOPIC_GUIDANCE_DIRECTIVES),
    summary: summarizeGuidanceLedger([directive, ...directives], current.latestApplication),
  })

  return {
    ledger,
    directive,
    receipt: {
      classification: input.messageKind,
      directiveId: directive.id,
      directiveType,
      status,
      scopeLabel,
      summary: directive.effectSummary,
      effectWindow: appliesToRuns,
      promptHint: directive.promptHint,
    },
  }
}

export async function updateTopicGuidanceDirective(
  input: UpdateDirectiveInput,
): Promise<{
  ledger: TopicGuidanceLedgerState
  directive: TopicGuidanceDirective | null
}> {
  const now = new Date().toISOString()
  const current = await loadTopicGuidanceLedger(input.topicId)
  let updatedDirective: TopicGuidanceDirective | null = null

  const directives = current.directives.map((directive) => {
    if (directive.id !== input.directiveId) {
      return directive
    }

    updatedDirective = {
      ...directive,
      status: input.status ?? directive.status,
      effectSummary: clipText(input.effectSummary ?? directive.effectSummary, 220),
      promptHint: clipText(input.promptHint ?? directive.promptHint, 180),
      updatedAt: now,
    }

    return updatedDirective
  })

  const ledger = await saveTopicGuidanceLedger({
    ...current,
    updatedAt: now,
    latestApplication: current.latestApplication,
    directives,
    summary: summarizeGuidanceLedger(directives, current.latestApplication),
  })

  return {
    ledger,
    directive: updatedDirective,
  }
}

export function listActiveTopicGuidanceDirectives(
  ledger: TopicGuidanceLedgerState | null | undefined,
  limit = 6,
) {
  if (!ledger) return [] as TopicGuidanceDirective[]
  return ledger.directives
    .filter((directive) => ACTIVE_STATUSES.has(directive.status))
    .slice(0, limit)
}

export async function recordTopicGuidanceDirectiveApplication(
  input: RecordDirectiveApplicationInput,
): Promise<{
  ledger: TopicGuidanceLedgerState
  application: TopicGuidanceLatestApplication | null
}> {
  const now = new Date().toISOString()
  const current = await loadTopicGuidanceLedger(input.topicId)
  const directivePatchMap = new Map(
    input.directives
      .filter((directive) => typeof directive.directiveId === 'string' && directive.directiveId.trim())
      .map((directive) => [directive.directiveId, directive] as const),
  )
  if (directivePatchMap.size === 0) {
    return {
      ledger: current,
      application: current.latestApplication,
    }
  }

  const appliedDirectives: TopicGuidanceLatestApplicationDirective[] = []
  const directives = current.directives.map((directive) => {
    const patch = directivePatchMap.get(directive.id)
    if (!patch) {
      return directive
    }

    const nextStatus =
      patch.status ??
      (directive.appliesToRuns === 'until-cleared' ? directive.status : 'consumed')
    const note = clipText(patch.note ?? directive.lastAppliedSummary ?? input.summary, 180)
    const updatedDirective: TopicGuidanceDirective = {
      ...directive,
      status: nextStatus,
      effectSummary: note || directive.effectSummary,
      lastAppliedAt: now,
      lastAppliedStageIndex:
        typeof input.stageIndex === 'number' && Number.isFinite(input.stageIndex)
          ? input.stageIndex
          : directive.lastAppliedStageIndex,
      lastAppliedSummary: note,
      updatedAt: now,
    }

    appliedDirectives.push({
      directiveId: directive.id,
      directiveType: directive.directiveType,
      scopeLabel: directive.scopeLabel,
      instruction: directive.instruction,
      status: updatedDirective.status,
      note,
    })

    return updatedDirective
  })

  const application =
    appliedDirectives.length > 0
      ? {
          appliedAt: now,
          stageIndex:
            typeof input.stageIndex === 'number' && Number.isFinite(input.stageIndex)
              ? input.stageIndex
              : null,
          summary: clipText(input.summary, 220),
          directives: appliedDirectives.slice(0, 6),
        }
      : null

  const ledger = await saveTopicGuidanceLedger({
    ...current,
    updatedAt: now,
    directives,
    latestApplication: application ?? current.latestApplication,
    summary: summarizeGuidanceLedger(directives, application ?? current.latestApplication),
  })

  return {
    ledger,
    application: application ?? current.latestApplication,
  }
}

export function compactTopicGuidanceContext(
  ledger: TopicGuidanceLedgerState | null | undefined,
  limit = 6,
) {
  if (!ledger) {
    return {
      summary: emptyTopicGuidanceLedger('unknown').summary,
      activeDirectives: [] as Array<{
        directiveType: TopicGuidanceDirectiveType
        scopeLabel: string
        instruction: string
        effectSummary: string
        status: TopicGuidanceDirectiveStatus
        appliesToRuns: TopicGuidanceDirectiveWindow
      }>,
      latestApplication: null as null | {
        appliedAt: string
        stageIndex: number | null
        summary: string
        directives: TopicGuidanceLatestApplicationDirective[]
      },
    }
  }

  return {
    summary: ledger.summary,
    activeDirectives: listActiveTopicGuidanceDirectives(ledger, limit).map((directive) => ({
      directiveType: directive.directiveType,
      scopeLabel: directive.scopeLabel,
      instruction: directive.instruction,
      effectSummary: directive.effectSummary,
      status: directive.status,
      appliesToRuns: directive.appliesToRuns,
    })),
    latestApplication: ledger.latestApplication
      ? {
          appliedAt: ledger.latestApplication.appliedAt,
          stageIndex: ledger.latestApplication.stageIndex,
          summary: ledger.latestApplication.summary,
          directives: ledger.latestApplication.directives,
        }
      : null,
  }
}
