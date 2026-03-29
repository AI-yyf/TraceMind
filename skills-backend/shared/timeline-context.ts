import { asRecord, asString, asStringArray, clamp } from './research-graph.ts'

export type TimelineProblemStatus = 'origin' | 'active' | 'watch' | 'resolved'
export type TimelineBranchStatus = 'origin' | 'active' | 'candidate' | 'merged' | 'dormant' | 'resolved'

export interface TimelineProblemNode {
  id: string
  label: string
  question: string
  status: TimelineProblemStatus
  tags: string[]
  sourcePaperIds: string[]
  branchIds: string[]
  notes?: string
  lastUpdatedAt: string
  priorityScore: number
}

export interface TimelineMethodNode {
  id: string
  label: string
  summary: string
  sourcePaperIds: string[]
  relatedProblemIds: string[]
  lastUpdatedAt: string
}

export interface TimelineBranchNode {
  branchId: string
  label: string
  status: TimelineBranchStatus
  anchorPaperId: string
  stageIndex: number
  linkedProblemIds: string[]
  notes?: string
  lastUpdatedAt: string
}

export interface TimelineQualitySignal {
  id: string
  label: string
  assessment: string
  score: number
  sourcePaperIds: string[]
  lastUpdatedAt: string
}

export interface TimelineContext {
  schemaVersion: number
  topicId: string
  originPaperId: string
  problemSpace: {
    nodes: TimelineProblemNode[]
  }
  methodSpace: {
    nodes: TimelineMethodNode[]
  }
  branchSpace: {
    branches: TimelineBranchNode[]
  }
  qualitySpace: {
    signals: TimelineQualitySignal[]
  }
  lastUpdatedAt: string
}

type OriginTimelineArgs = {
  topicId: string
  originPaperId: string
  originQuestionDefinition: string
  originWhyThisCounts: string
  focusTags: string[]
  capabilityRefs: string[]
  timestamp?: string
}

type TimelinePatch = Partial<Omit<TimelineContext, 'schemaVersion' | 'topicId' | 'originPaperId'>> & {
  lastUpdatedAt?: string
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)),
  )
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function compareTimelineProblemStatus(left: TimelineProblemStatus, right: TimelineProblemStatus) {
  const rank = new Map<TimelineProblemStatus, number>([
    ['origin', 0],
    ['active', 1],
    ['watch', 2],
    ['resolved', 3],
  ])
  return (rank.get(left) ?? 9) - (rank.get(right) ?? 9)
}

function compareTimelineBranchStatus(left: TimelineBranchStatus, right: TimelineBranchStatus) {
  const rank = new Map<TimelineBranchStatus, number>([
    ['origin', 0],
    ['active', 1],
    ['candidate', 2],
    ['merged', 3],
    ['dormant', 4],
    ['resolved', 5],
  ])
  return (rank.get(left) ?? 9) - (rank.get(right) ?? 9)
}

function normalizeProblemNode(value: unknown, fallbackTimestamp: string) {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id, '')
  const label = asString(record.label, '')
  const question = asString(record.question, '')
  if (!id || !label || !question) return null

  const statusRaw = asString(record.status, 'active')
  const status: TimelineProblemStatus =
    statusRaw === 'origin' || statusRaw === 'watch' || statusRaw === 'resolved' ? statusRaw : 'active'

  return {
    id,
    label,
    question,
    status,
    tags: asStringArray(record.tags),
    sourcePaperIds: asStringArray(record.sourcePaperIds),
    branchIds: asStringArray(record.branchIds),
    notes: asString(record.notes, '') || undefined,
    lastUpdatedAt: asString(record.lastUpdatedAt, fallbackTimestamp),
    priorityScore: clamp(asNumber(record.priorityScore, 0.6), 0, 1),
  } satisfies TimelineProblemNode
}

function normalizeMethodNode(value: unknown, fallbackTimestamp: string) {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id, '')
  const label = asString(record.label, '')
  if (!id || !label) return null

  return {
    id,
    label,
    summary: asString(record.summary, ''),
    sourcePaperIds: asStringArray(record.sourcePaperIds),
    relatedProblemIds: asStringArray(record.relatedProblemIds),
    lastUpdatedAt: asString(record.lastUpdatedAt, fallbackTimestamp),
  } satisfies TimelineMethodNode
}

function normalizeBranchNode(value: unknown, fallbackTimestamp: string) {
  const record = asRecord(value)
  if (!record) return null
  const branchId = asString(record.branchId, '')
  const label = asString(record.label, '')
  const anchorPaperId = asString(record.anchorPaperId, '')
  if (!branchId || !label || !anchorPaperId) return null

  const statusRaw = asString(record.status, 'active')
  const status: TimelineBranchStatus =
    statusRaw === 'origin' ||
    statusRaw === 'candidate' ||
    statusRaw === 'merged' ||
    statusRaw === 'dormant' ||
    statusRaw === 'resolved'
      ? statusRaw
      : 'active'

  return {
    branchId,
    label,
    status,
    anchorPaperId,
    stageIndex: Math.max(1, Math.trunc(asNumber(record.stageIndex, 1))),
    linkedProblemIds: asStringArray(record.linkedProblemIds),
    notes: asString(record.notes, '') || undefined,
    lastUpdatedAt: asString(record.lastUpdatedAt, fallbackTimestamp),
  } satisfies TimelineBranchNode
}

function normalizeQualitySignal(value: unknown, fallbackTimestamp: string) {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id, '')
  const label = asString(record.label, '')
  const assessment = asString(record.assessment, '')
  if (!id || !label || !assessment) return null

  return {
    id,
    label,
    assessment,
    score: clamp(asNumber(record.score, 0.5), 0, 1),
    sourcePaperIds: asStringArray(record.sourcePaperIds),
    lastUpdatedAt: asString(record.lastUpdatedAt, fallbackTimestamp),
  } satisfies TimelineQualitySignal
}

function upsertById<T extends { id?: string; branchId?: string }>(
  collection: T[],
  next: T,
  keySelector: (value: T) => string,
  merge: (previous: T, incoming: T) => T,
) {
  const key = keySelector(next)
  const index = collection.findIndex((item) => keySelector(item) === key)
  if (index < 0) {
    collection.push(next)
    return collection
  }

  const updated = [...collection]
  updated[index] = merge(updated[index], next)
  return updated
}

export function createOriginTimelineContext(args: OriginTimelineArgs): TimelineContext {
  const timestamp = args.timestamp ?? new Date().toISOString()
  const originProblemId = `${args.topicId}:origin-problem`
  const originBranchId = `branch:${args.topicId}:origin`

  return {
    schemaVersion: 1,
    topicId: args.topicId,
    originPaperId: args.originPaperId,
    problemSpace: {
      nodes: [
        {
          id: originProblemId,
          label: '起源问题',
          question: args.originQuestionDefinition,
          status: 'origin',
          tags: uniqueStrings([...args.focusTags, ...args.capabilityRefs]).slice(0, 8),
          sourcePaperIds: [args.originPaperId],
          branchIds: [originBranchId],
          notes: args.originWhyThisCounts,
          lastUpdatedAt: timestamp,
          priorityScore: 0.95,
        },
      ],
    },
    methodSpace: {
      nodes: [],
    },
    branchSpace: {
      branches: [
        {
          branchId: originBranchId,
          label: '起源主线',
          status: 'origin',
          anchorPaperId: args.originPaperId,
          stageIndex: 1,
          linkedProblemIds: [originProblemId],
          notes: '从起源论文出发，等待下一个 stage 的动态发现。',
          lastUpdatedAt: timestamp,
        },
      ],
    },
    qualitySpace: {
      signals: [
        {
          id: `${args.topicId}:origin-audit`,
          label: '起源确认',
          assessment: args.originWhyThisCounts,
          score: 0.92,
          sourcePaperIds: [args.originPaperId],
          lastUpdatedAt: timestamp,
        },
      ],
    },
    lastUpdatedAt: timestamp,
  }
}

export function normalizeTimelineContext(
  value: unknown,
  fallback: OriginTimelineArgs,
): TimelineContext {
  const base = createOriginTimelineContext(fallback)
  const record = asRecord(value)
  if (!record) return base

  const timestamp = asString(record.lastUpdatedAt, base.lastUpdatedAt)
  const problems = Array.isArray(asRecord(record.problemSpace)?.nodes)
    ? (asRecord(record.problemSpace)?.nodes as unknown[])
        .map((node) => normalizeProblemNode(node, timestamp))
        .filter((node): node is TimelineProblemNode => Boolean(node))
    : []
  const methods = Array.isArray(asRecord(record.methodSpace)?.nodes)
    ? (asRecord(record.methodSpace)?.nodes as unknown[])
        .map((node) => normalizeMethodNode(node, timestamp))
        .filter((node): node is TimelineMethodNode => Boolean(node))
    : []
  const branches = Array.isArray(asRecord(record.branchSpace)?.branches)
    ? (asRecord(record.branchSpace)?.branches as unknown[])
        .map((node) => normalizeBranchNode(node, timestamp))
        .filter((node): node is TimelineBranchNode => Boolean(node))
    : []
  const signals = Array.isArray(asRecord(record.qualitySpace)?.signals)
    ? (asRecord(record.qualitySpace)?.signals as unknown[])
        .map((node) => normalizeQualitySignal(node, timestamp))
        .filter((node): node is TimelineQualitySignal => Boolean(node))
    : []

  return {
    ...base,
    schemaVersion: 1,
    topicId: asString(record.topicId, base.topicId),
    originPaperId: asString(record.originPaperId, base.originPaperId),
    problemSpace: {
      nodes: problems.length > 0 ? problems : base.problemSpace.nodes,
    },
    methodSpace: {
      nodes: methods,
    },
    branchSpace: {
      branches: branches.length > 0 ? branches : base.branchSpace.branches,
    },
    qualitySpace: {
      signals: signals.length > 0 ? signals : base.qualitySpace.signals,
    },
    lastUpdatedAt: timestamp,
  }
}

export function applyTimelineContextPatch(
  current: TimelineContext,
  patch: TimelinePatch | undefined,
): TimelineContext {
  if (!patch) return current
  const timestamp = patch.lastUpdatedAt ?? new Date().toISOString()
  let problems = [...current.problemSpace.nodes]
  let methods = [...current.methodSpace.nodes]
  let branches = [...current.branchSpace.branches]
  let signals = [...current.qualitySpace.signals]

  for (const node of patch.problemSpace?.nodes ?? []) {
    problems = upsertById(
      problems,
      {
        ...node,
        tags: uniqueStrings(node.tags ?? []),
        sourcePaperIds: uniqueStrings(node.sourcePaperIds ?? []),
        branchIds: uniqueStrings(node.branchIds ?? []),
        lastUpdatedAt: node.lastUpdatedAt ?? timestamp,
        priorityScore: clamp(asNumber(node.priorityScore, 0.6), 0, 1),
      } as TimelineProblemNode,
      (value) => value.id,
      (previous, incoming) => ({
        ...previous,
        ...incoming,
        tags: uniqueStrings([...previous.tags, ...incoming.tags]),
        sourcePaperIds: uniqueStrings([...previous.sourcePaperIds, ...incoming.sourcePaperIds]),
        branchIds: uniqueStrings([...previous.branchIds, ...incoming.branchIds]),
        lastUpdatedAt: incoming.lastUpdatedAt ?? previous.lastUpdatedAt,
        priorityScore: Math.max(previous.priorityScore, incoming.priorityScore),
        status:
          compareTimelineProblemStatus(previous.status, incoming.status) > 0
            ? previous.status
            : incoming.status,
      }),
    )
  }

  for (const node of patch.methodSpace?.nodes ?? []) {
    methods = upsertById(
      methods,
      {
        ...node,
        sourcePaperIds: uniqueStrings(node.sourcePaperIds ?? []),
        relatedProblemIds: uniqueStrings(node.relatedProblemIds ?? []),
        lastUpdatedAt: node.lastUpdatedAt ?? timestamp,
      } as TimelineMethodNode,
      (value) => value.id,
      (previous, incoming) => ({
        ...previous,
        ...incoming,
        sourcePaperIds: uniqueStrings([...previous.sourcePaperIds, ...incoming.sourcePaperIds]),
        relatedProblemIds: uniqueStrings([...previous.relatedProblemIds, ...incoming.relatedProblemIds]),
        lastUpdatedAt: incoming.lastUpdatedAt ?? previous.lastUpdatedAt,
      }),
    )
  }

  for (const node of patch.branchSpace?.branches ?? []) {
    branches = upsertById(
      branches,
      {
        ...node,
        linkedProblemIds: uniqueStrings(node.linkedProblemIds ?? []),
        lastUpdatedAt: node.lastUpdatedAt ?? timestamp,
      } as TimelineBranchNode,
      (value) => value.branchId,
      (previous, incoming) => ({
        ...previous,
        ...incoming,
        linkedProblemIds: uniqueStrings([...previous.linkedProblemIds, ...incoming.linkedProblemIds]),
        lastUpdatedAt: incoming.lastUpdatedAt ?? previous.lastUpdatedAt,
        stageIndex: Math.max(previous.stageIndex, incoming.stageIndex),
        status:
          compareTimelineBranchStatus(previous.status, incoming.status) > 0
            ? previous.status
            : incoming.status,
      }),
    )
  }

  for (const node of patch.qualitySpace?.signals ?? []) {
    signals = upsertById(
      signals,
      {
        ...node,
        sourcePaperIds: uniqueStrings(node.sourcePaperIds ?? []),
        lastUpdatedAt: node.lastUpdatedAt ?? timestamp,
        score: clamp(asNumber(node.score, 0.5), 0, 1),
      } as TimelineQualitySignal,
      (value) => value.id,
      (previous, incoming) => ({
        ...previous,
        ...incoming,
        sourcePaperIds: uniqueStrings([...previous.sourcePaperIds, ...incoming.sourcePaperIds]),
        lastUpdatedAt: incoming.lastUpdatedAt ?? previous.lastUpdatedAt,
        score: Math.max(previous.score, incoming.score),
      }),
    )
  }

  return {
    ...current,
    problemSpace: {
      nodes: problems,
    },
    methodSpace: {
      nodes: methods,
    },
    branchSpace: {
      branches,
    },
    qualitySpace: {
      signals,
    },
    lastUpdatedAt: timestamp,
  }
}

export function buildProblemNodesFromTimelineContext(args: {
  topicId: string
  originPaperId: string
  timelineContext: TimelineContext
  capabilityRefs: string[]
}) {
  return args.timelineContext.problemSpace.nodes.map((node, index) => ({
    id: node.id,
    stageTitle: node.label,
    stageDigest: node.notes ?? node.question,
    question: node.question,
    problemConstraints: [],
    requiredCapabilities: node.tags.length > 0 ? node.tags : args.capabilityRefs,
    parentPaperId: node.sourcePaperIds[node.sourcePaperIds.length - 1] ?? args.originPaperId,
    parentProblemNodeId: index === 0 ? null : args.timelineContext.problemSpace.nodes[0]?.id ?? null,
    directCandidates: [],
    transferCandidates: [],
    rejectedTransferCandidates: [],
    activeBranchIds: node.branchIds,
    resolutionStatus:
      node.status === 'resolved' ? 'resolved' : node.status === 'watch' ? 'branched' : 'open',
    confidence: clamp(node.priorityScore, 0.2, 1),
  }))
}
