export type WindowPolicy = 'auto' | 'fixed'
export type BranchModel = 'problem-node-driven'
export type BranchRegistryStatus =
  | 'active'
  | 'candidate'
  | 'merged'
  | 'dormant'
  | 'resolved'
  | 'pending-review'

export interface BranchingDefaults {
  windowPolicy: WindowPolicy
  minStageWindowMonths: number
  maxStageWindowMonths: number
  maxActiveBranches: number
  branchModel: BranchModel
  allowBranchMerge: boolean
  maxCandidates: number
}

export interface BranchRegistryEntry {
  branchId: string
  rootProblemNodeId: string
  parentBranchId: string | null
  anchorPaperId: string
  anchorPaperPublishedAt: string
  lastTrackedPaperId: string
  lastTrackedPublishedAt: string
  stageIndex: number
  activeWindowMonths: number
  status: BranchRegistryStatus
  priorityScore: number
  linkedProblemNodeIds: string[]
  mergedIntoBranchId?: string | null
  branchType?: 'direct' | 'transfer' | 'merge'
  label?: string
  summary?: string
}

export interface StageLedgerEntry {
  branchId: string
  stageIndex: number
  windowStart: string
  windowEnd: string
  windowMonths: number
  anchorPaperId: string
  candidatePaperIds: string[]
  selectedPaperId?: string | null
  status: 'planned' | 'completed' | 'no-candidate' | 'merged' | 'skipped'
  decisionSummary: string
  mergeEvents: Array<{
    paperId: string
    mergedBranchIds: string[]
  }>
  builtAt: string
}

export interface PaperRelationEntry {
  paperId: string
  nodeId?: string | null
  problemNodeIds: string[]
  branchIds: string[]
  primaryBranchId: string
  isMergePaper: boolean
  mergedBranchIds: string[]
  resolvedProblemIds: string[]
}

export type ResearchNodeStatus =
  | 'origin'
  | 'selected'
  | 'committed'
  | 'provisional'
  | 'merged'
  | 'no-candidate'

export interface ResearchNode {
  nodeId: string
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  status: ResearchNodeStatus
  nodeLabel: string
  nodeSummary: string
  isMergeNode: boolean
  provisional: boolean
}

export interface StageRunLedgerEntry {
  stageIndex: number
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  sourceAnchorPaperIds: string[]
  candidatePaperIds: string[]
  selectedNodeIds: string[]
  provisionalNodeIds: string[]
  windowStart: string
  windowEnd: string
  windowMonths: number
  status: 'completed' | 'no-candidate'
  decisionSummary: string
  discoveryRounds: Array<{
    round: number
    queryCount: number
    candidatePaperIds: string[]
  }>
  builtAt: string
}

export interface BranchSelection {
  branch: BranchRegistryEntry
  priority: number
}

export interface StageWindowResolution {
  windowMonths: number
  windowStart: string
  windowEnd: string
  candidatePaperIds: string[]
  status: 'selected' | 'no-candidate'
}

export interface BranchCandidateRecord {
  paperId: string
  title: string
  published: string
  authors: string[]
  candidateType: 'direct' | 'branch' | 'transfer'
  why: string
  supportedProblemIds: string[]
  supportedCapabilityIds: string[]
  status: string
  baseConfidence: number
  problemNodeId: string
  sourceTopicId?: string | null
  mergeTargetBranchIds: string[]
}

export function resolveMainlineBranchId(args: {
  topicId: string
  branchRegistry: BranchRegistryEntry[]
}) {
  const directOriginBranch =
    args.branchRegistry.find((branch) => branch.branchId === `branch:${args.topicId}:origin`) ??
    args.branchRegistry.find((branch) => branch.branchType === 'direct' && branch.parentBranchId === null) ??
    args.branchRegistry.find((branch) => branch.branchType === 'direct') ??
    args.branchRegistry[0]

  return directOriginBranch?.branchId ?? `branch:${args.topicId}:origin`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown) {
  return isRecord(value) ? value : null
}

export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export function asStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : fallback
}

export function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function parseDate(value: string | undefined | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toIsoString(value: string | undefined | null, fallback: string) {
  const date = parseDate(value)
  return date ? date.toISOString() : fallback
}

export function addMonths(value: string, months: number) {
  const date = parseDate(value)
  if (!date) return value
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next.toISOString()
}

export function daysBetween(start: string, end: string) {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  if (!startDate || !endDate) return 0
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
}

export function monthsBetween(start: string, end: string) {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  if (!startDate || !endDate) return Number.POSITIVE_INFINITY
  if (endDate.getTime() < startDate.getTime()) return Number.NEGATIVE_INFINITY
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
}

export function normalizeBranchingDefaults(defaults: Record<string, unknown> | undefined): BranchingDefaults {
  const minStageWindowMonths = clamp(asNumber(defaults?.minStageWindowMonths, 2), 1, 12)
  const maxStageWindowMonths = clamp(
    asNumber(defaults?.maxStageWindowMonths, Math.max(minStageWindowMonths, 8)),
    minStageWindowMonths,
    18,
  )

  return {
    windowPolicy: defaults?.windowPolicy === 'fixed' ? 'fixed' : 'auto',
    minStageWindowMonths,
    maxStageWindowMonths,
    maxActiveBranches: clamp(asNumber(defaults?.maxActiveBranches, 10), 1, 20),
    branchModel: 'problem-node-driven',
    allowBranchMerge: asBoolean(defaults?.allowBranchMerge, true),
    maxCandidates: clamp(asNumber(defaults?.maxCandidates, 8), 1, 20),
  }
}

export function resolvePaperPublishedAt(
  paperCatalog: Record<string, Record<string, unknown>>,
  paperId: string,
  fallback: string,
) {
  const paper = paperCatalog[paperId]
  return toIsoString(asString(paper?.published, fallback), fallback)
}

function mapLegacyBranchStatus(problemNode: Record<string, unknown>, branchNode: Record<string, unknown> | null): BranchRegistryStatus {
  const branchStatus = asString(branchNode?.status, '')
  if (branchStatus === 'merged') return 'merged'
  if (branchStatus === 'promoted_to_mainline') return 'resolved'
  if (branchStatus === 'archived') return 'dormant'
  if (branchStatus === 'candidate') return 'candidate'
  if (branchStatus === 'branch_active') return 'active'

  const resolutionStatus = asString(problemNode.resolutionStatus, '')
  if (resolutionStatus === 'resolved') return 'resolved'
  if (resolutionStatus === 'merged') return 'merged'
  if (resolutionStatus === 'branched') return 'active'
  return 'active'
}

function inferBranchType(problemNode: Record<string, unknown>, branchNode: Record<string, unknown> | null) {
  const branchType = asString(branchNode?.branchType, '')
  if (branchType === 'transfer') return 'transfer'
  if (branchType === 'merge') return 'merge'

  const transferPaperIds = new Set(
    asStringArray(problemNode.transferCandidates).flatMap(() => []),
  )
  return transferPaperIds.size > 0 ? 'transfer' : 'direct'
}

export function createBranchId(problemNodeId: string, anchorPaperId: string) {
  return `branch:${problemNodeId}:${anchorPaperId}`
}

export function normalizeBranchRegistry(value: unknown) {
  if (!Array.isArray(value)) return [] as BranchRegistryEntry[]
  const normalized = value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      branchId: asString(entry.branchId, ''),
      rootProblemNodeId: asString(entry.rootProblemNodeId, ''),
      parentBranchId: entry.parentBranchId === null ? null : asString(entry.parentBranchId, '') || null,
      anchorPaperId: asString(entry.anchorPaperId, ''),
      anchorPaperPublishedAt: asString(entry.anchorPaperPublishedAt, ''),
      lastTrackedPaperId: asString(entry.lastTrackedPaperId, asString(entry.anchorPaperId, '')),
      lastTrackedPublishedAt: asString(entry.lastTrackedPublishedAt, asString(entry.anchorPaperPublishedAt, '')),
      stageIndex: Math.max(1, asNumber(entry.stageIndex, 1)),
      activeWindowMonths: Math.max(1, asNumber(entry.activeWindowMonths, 2)),
      status:
        entry.status === 'candidate' ||
        entry.status === 'merged' ||
        entry.status === 'dormant' ||
        entry.status === 'resolved' ||
        entry.status === 'pending-review'
          ? entry.status
          : 'active',
      priorityScore: clamp(asNumber(entry.priorityScore, 0.5), 0, 1),
      linkedProblemNodeIds: uniqueStrings(asStringArray(entry.linkedProblemNodeIds)),
      mergedIntoBranchId: entry.mergedIntoBranchId === null ? null : asString(entry.mergedIntoBranchId, '') || null,
      branchType:
        entry.branchType === 'transfer' || entry.branchType === 'merge' ? entry.branchType : 'direct',
      label: asString(entry.label, ''),
      summary: asString(entry.summary, ''),
    }))
    .filter((entry) => entry.branchId && entry.rootProblemNodeId && entry.anchorPaperId)

  const byBranchId = new Map<string, BranchRegistryEntry>()
  for (const entry of normalized) {
    const previous = byBranchId.get(entry.branchId)
    if (!previous) {
      byBranchId.set(entry.branchId, entry)
      continue
    }

    const nextTrackedAt = parseDate(entry.lastTrackedPublishedAt)?.getTime() ?? 0
    const previousTrackedAt = parseDate(previous.lastTrackedPublishedAt)?.getTime() ?? 0
    const dominant =
      entry.stageIndex > previous.stageIndex || nextTrackedAt > previousTrackedAt
        ? entry
        : previous

    byBranchId.set(entry.branchId, {
      ...dominant,
      linkedProblemNodeIds: uniqueStrings([
        ...previous.linkedProblemNodeIds,
        ...entry.linkedProblemNodeIds,
      ]),
      parentBranchId: dominant.parentBranchId ?? previous.parentBranchId ?? entry.parentBranchId ?? null,
      mergedIntoBranchId:
        dominant.mergedIntoBranchId ?? previous.mergedIntoBranchId ?? entry.mergedIntoBranchId ?? null,
      label: dominant.label || previous.label || entry.label || '',
      summary: dominant.summary || previous.summary || entry.summary || '',
      priorityScore: clamp(Math.max(previous.priorityScore, entry.priorityScore), 0, 1),
    })
  }

  return [...byBranchId.values()].sort((left, right) => {
    return (
      left.stageIndex - right.stageIndex ||
      (parseDate(left.lastTrackedPublishedAt)?.getTime() ?? 0) -
        (parseDate(right.lastTrackedPublishedAt)?.getTime() ?? 0)
    )
  })
}

export function normalizeStageLedger(value: unknown) {
  if (!Array.isArray(value)) return [] as StageLedgerEntry[]
  const normalized = value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      branchId: asString(entry.branchId, ''),
      stageIndex: Math.max(1, asNumber(entry.stageIndex, 1)),
      windowStart: asString(entry.windowStart, ''),
      windowEnd: asString(entry.windowEnd, ''),
      windowMonths: Math.max(1, asNumber(entry.windowMonths, 2)),
      anchorPaperId: asString(entry.anchorPaperId, ''),
      candidatePaperIds: uniqueStrings(asStringArray(entry.candidatePaperIds)),
      selectedPaperId: entry.selectedPaperId === null ? null : asString(entry.selectedPaperId, '') || null,
      status:
        entry.status === 'completed' ||
        entry.status === 'no-candidate' ||
        entry.status === 'merged' ||
        entry.status === 'skipped'
          ? entry.status
          : 'planned',
      decisionSummary: asString(entry.decisionSummary, ''),
      mergeEvents: Array.isArray(entry.mergeEvents)
        ? entry.mergeEvents
            .filter((mergeEvent): mergeEvent is Record<string, unknown> => isRecord(mergeEvent))
            .map((mergeEvent) => ({
              paperId: asString(mergeEvent.paperId, ''),
              mergedBranchIds: uniqueStrings(asStringArray(mergeEvent.mergedBranchIds)),
            }))
            .filter((mergeEvent) => mergeEvent.paperId.length > 0)
        : [],
      builtAt: asString(entry.builtAt, ''),
    }))
    .filter((entry) => entry.branchId.length > 0)

  const byStageKey = new Map<string, StageLedgerEntry>()
  for (const entry of normalized) {
    const key = `${entry.branchId}:${entry.stageIndex}`
    const previous = byStageKey.get(key)
    if (!previous) {
      byStageKey.set(key, entry)
      continue
    }

    const previousTime = parseDate(previous.builtAt)?.getTime() ?? 0
    const nextTime = parseDate(entry.builtAt)?.getTime() ?? 0
    const dominant = nextTime >= previousTime ? entry : previous

    byStageKey.set(key, {
      ...dominant,
      candidatePaperIds: uniqueStrings([
        ...previous.candidatePaperIds,
        ...entry.candidatePaperIds,
      ]),
      selectedPaperId: dominant.selectedPaperId ?? previous.selectedPaperId ?? entry.selectedPaperId ?? null,
      mergeEvents: [
        ...previous.mergeEvents,
        ...entry.mergeEvents,
      ].reduce<StageLedgerEntry['mergeEvents']>((collection, mergeEvent) => {
        const existingIndex = collection.findIndex((item) => item.paperId === mergeEvent.paperId)
        if (existingIndex < 0) {
          collection.push({
            paperId: mergeEvent.paperId,
            mergedBranchIds: uniqueStrings(mergeEvent.mergedBranchIds),
          })
          return collection
        }

        collection[existingIndex] = {
          paperId: mergeEvent.paperId,
          mergedBranchIds: uniqueStrings([
            ...collection[existingIndex].mergedBranchIds,
            ...mergeEvent.mergedBranchIds,
          ]),
        }
        return collection
      }, []),
      decisionSummary:
        dominant.decisionSummary ||
        previous.decisionSummary ||
        entry.decisionSummary ||
        'Stage ledger entry preserved from canonical memory.',
    })
  }

  return [...byStageKey.values()].sort((left, right) => {
    return (
      (parseDate(left.windowStart)?.getTime() ?? 0) - (parseDate(right.windowStart)?.getTime() ?? 0) ||
      left.stageIndex - right.stageIndex
    )
  })
}

export function normalizePaperRelations(value: unknown) {
  if (!Array.isArray(value)) return [] as PaperRelationEntry[]
  const normalized = value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      paperId: asString(entry.paperId, ''),
      nodeId: entry.nodeId === null ? null : asString(entry.nodeId, '') || null,
      problemNodeIds: uniqueStrings(asStringArray(entry.problemNodeIds)),
      branchIds: uniqueStrings(asStringArray(entry.branchIds)),
      primaryBranchId: asString(entry.primaryBranchId, asString(asStringArray(entry.branchIds)[0], '')),
      isMergePaper: asBoolean(entry.isMergePaper, false),
      mergedBranchIds: uniqueStrings(asStringArray(entry.mergedBranchIds)),
      resolvedProblemIds: uniqueStrings(asStringArray(entry.resolvedProblemIds)),
    }))
    .filter((entry) => entry.paperId.length > 0)

  const byPaperId = new Map<string, PaperRelationEntry>()
  for (const entry of normalized) {
    const previous = byPaperId.get(entry.paperId)
    if (!previous) {
      byPaperId.set(entry.paperId, entry)
      continue
    }

    byPaperId.set(entry.paperId, {
      paperId: entry.paperId,
      nodeId: entry.nodeId ?? previous.nodeId ?? null,
      problemNodeIds: uniqueStrings([
        ...previous.problemNodeIds,
        ...entry.problemNodeIds,
      ]),
      branchIds: uniqueStrings([
        ...previous.branchIds,
        ...entry.branchIds,
      ]),
      primaryBranchId: entry.primaryBranchId || previous.primaryBranchId,
      isMergePaper: previous.isMergePaper || entry.isMergePaper,
      mergedBranchIds: uniqueStrings([
        ...previous.mergedBranchIds,
        ...entry.mergedBranchIds,
      ]),
      resolvedProblemIds: uniqueStrings([
        ...previous.resolvedProblemIds,
        ...entry.resolvedProblemIds,
      ]),
    })
  }

  return [...byPaperId.values()]
}

export function createResearchNodeId(args: {
  topicId: string
  stageIndex: number
  paperIds: string[]
}) {
  const normalizedPaperIds = uniqueStrings(args.paperIds).sort()
  const suffix = normalizedPaperIds.join('__') || 'empty'
  return `node:${args.topicId}:stage-${Math.max(0, args.stageIndex)}:${suffix}`
}

export function normalizeResearchNodes(value: unknown) {
  if (!Array.isArray(value)) return [] as ResearchNode[]

  const byNodeId = new Map<string, ResearchNode>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const nodeId = asString(item.nodeId, '')
    const primaryPaperId = asString(item.primaryPaperId, '')
    if (!nodeId || !primaryPaperId) continue

    const nextNode: ResearchNode = {
      nodeId,
      stageIndex: Math.max(0, asNumber(item.stageIndex, 1)),
      paperIds: uniqueStrings(asStringArray(item.paperIds, [primaryPaperId])),
      primaryPaperId,
      sourceBranchIds: uniqueStrings(asStringArray(item.sourceBranchIds)),
      sourceProblemNodeIds: uniqueStrings(asStringArray(item.sourceProblemNodeIds)),
      status:
        item.status === 'origin' ||
        item.status === 'selected' ||
        item.status === 'committed' ||
        item.status === 'provisional' ||
        item.status === 'merged' ||
        item.status === 'no-candidate'
          ? item.status
          : 'committed',
      nodeLabel: asString(item.nodeLabel, primaryPaperId),
      nodeSummary: asString(item.nodeSummary, ''),
      isMergeNode: asBoolean(item.isMergeNode, false),
      provisional: asBoolean(item.provisional, false),
    }

    const previous = byNodeId.get(nodeId)
    byNodeId.set(
      nodeId,
      previous
        ? {
            ...nextNode,
            paperIds: uniqueStrings([...previous.paperIds, ...nextNode.paperIds]),
            sourceBranchIds: uniqueStrings([
              ...previous.sourceBranchIds,
              ...nextNode.sourceBranchIds,
            ]),
            sourceProblemNodeIds: uniqueStrings([
              ...previous.sourceProblemNodeIds,
              ...nextNode.sourceProblemNodeIds,
            ]),
            nodeLabel: nextNode.nodeLabel || previous.nodeLabel,
            nodeSummary: nextNode.nodeSummary || previous.nodeSummary,
            isMergeNode: previous.isMergeNode || nextNode.isMergeNode,
            provisional: previous.provisional || nextNode.provisional,
          }
        : nextNode,
    )
  }

  return [...byNodeId.values()].sort((left, right) => {
    return (
      left.stageIndex - right.stageIndex ||
      left.primaryPaperId.localeCompare(right.primaryPaperId)
    )
  })
}

export function normalizeStageRunLedger(value: unknown) {
  if (!Array.isArray(value)) return [] as StageRunLedgerEntry[]

  const byStageIndex = new Map<number, StageRunLedgerEntry>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const stageIndex = Math.max(1, asNumber(item.stageIndex, 1))
    const nextEntry: StageRunLedgerEntry = {
      stageIndex,
      sourceBranchIds: uniqueStrings(asStringArray(item.sourceBranchIds)),
      sourceProblemNodeIds: uniqueStrings(asStringArray(item.sourceProblemNodeIds)),
      sourceAnchorPaperIds: uniqueStrings(asStringArray(item.sourceAnchorPaperIds)),
      candidatePaperIds: uniqueStrings(asStringArray(item.candidatePaperIds)),
      selectedNodeIds: uniqueStrings(asStringArray(item.selectedNodeIds)),
      provisionalNodeIds: uniqueStrings(asStringArray(item.provisionalNodeIds)),
      windowStart: asString(item.windowStart, ''),
      windowEnd: asString(item.windowEnd, ''),
      windowMonths: Math.max(1, asNumber(item.windowMonths, 5)),
      status: item.status === 'no-candidate' ? 'no-candidate' : 'completed',
      decisionSummary: asString(item.decisionSummary, ''),
      discoveryRounds: Array.isArray(item.discoveryRounds)
        ? item.discoveryRounds
            .filter((round): round is Record<string, unknown> => isRecord(round))
            .map((round, index) => ({
              round: Math.max(1, asNumber(round.round, index + 1)),
              queryCount: Math.max(0, asNumber(round.queryCount, 0)),
              candidatePaperIds: uniqueStrings(asStringArray(round.candidatePaperIds)),
            }))
        : [],
      builtAt: asString(item.builtAt, ''),
    }

    const previous = byStageIndex.get(stageIndex)
    if (!previous) {
      byStageIndex.set(stageIndex, nextEntry)
      continue
    }

    const previousBuiltAt = parseDate(previous.builtAt)?.getTime() ?? 0
    const nextBuiltAt = parseDate(nextEntry.builtAt)?.getTime() ?? 0
    const dominant = nextBuiltAt >= previousBuiltAt ? nextEntry : previous
    byStageIndex.set(stageIndex, {
      ...dominant,
      sourceBranchIds: uniqueStrings([
        ...previous.sourceBranchIds,
        ...nextEntry.sourceBranchIds,
      ]),
      sourceProblemNodeIds: uniqueStrings([
        ...previous.sourceProblemNodeIds,
        ...nextEntry.sourceProblemNodeIds,
      ]),
      sourceAnchorPaperIds: uniqueStrings([
        ...previous.sourceAnchorPaperIds,
        ...nextEntry.sourceAnchorPaperIds,
      ]),
      candidatePaperIds: uniqueStrings([
        ...previous.candidatePaperIds,
        ...nextEntry.candidatePaperIds,
      ]),
      selectedNodeIds: uniqueStrings([
        ...previous.selectedNodeIds,
        ...nextEntry.selectedNodeIds,
      ]),
      provisionalNodeIds: uniqueStrings([
        ...previous.provisionalNodeIds,
        ...nextEntry.provisionalNodeIds,
      ]),
      discoveryRounds:
        dominant.discoveryRounds.length > 0
          ? dominant.discoveryRounds
          : previous.discoveryRounds.length > 0
            ? previous.discoveryRounds
            : nextEntry.discoveryRounds,
      decisionSummary:
        dominant.decisionSummary ||
        previous.decisionSummary ||
        nextEntry.decisionSummary,
    })
  }

  return [...byStageIndex.values()].sort((left, right) => left.stageIndex - right.stageIndex)
}

export function upsertStageRunLedgerEntry(entries: StageRunLedgerEntry[], nextEntry: StageRunLedgerEntry) {
  const index = entries.findIndex((entry) => entry.stageIndex === nextEntry.stageIndex)
  if (index >= 0) {
    const updated = [...entries]
    updated[index] = nextEntry
    return updated
  }
  return [...entries, nextEntry]
}

export function buildResearchNodesFromStageLedger(args: {
  topicId: string
  stageLedger: StageLedgerEntry[]
  paperRelations: PaperRelationEntry[]
}) {
  const relationMap = new Map(args.paperRelations.map((entry) => [entry.paperId, entry]))
  const nodes: ResearchNode[] = []

  for (const entry of args.stageLedger) {
    if (!entry.selectedPaperId) continue
    const relation = relationMap.get(entry.selectedPaperId)
    const nodeId =
      relation?.nodeId ??
      createResearchNodeId({
        topicId: args.topicId,
        stageIndex: entry.stageIndex,
        paperIds: [entry.selectedPaperId],
      })
    nodes.push({
      nodeId,
      stageIndex: entry.stageIndex,
      paperIds: [entry.selectedPaperId],
      primaryPaperId: entry.selectedPaperId,
      sourceBranchIds: uniqueStrings([
        entry.branchId,
        ...(relation?.branchIds ?? []),
      ]),
      sourceProblemNodeIds: relation?.problemNodeIds ?? [],
      status: entry.status === 'merged' ? 'merged' : 'committed',
      nodeLabel: entry.selectedPaperId,
      nodeSummary: entry.decisionSummary,
      isMergeNode: entry.mergeEvents.some((event) => event.paperId === entry.selectedPaperId),
      provisional: false,
    })
  }

  return normalizeResearchNodes(nodes)
}

export function selectStageForTracking(args: {
  branchRegistry: BranchRegistryEntry[]
  explicitStageIndex?: number
  explicitBranchId?: string
}) {
  if (args.branchRegistry.length === 0) return null

  const activeBranches = args.branchRegistry.filter(
    (branch) => branch.status === 'active' || branch.status === 'candidate',
  )
  if (activeBranches.length === 0) return null

  const explicitStage =
    typeof args.explicitStageIndex === 'number' && Number.isFinite(args.explicitStageIndex)
      ? Math.max(1, Math.trunc(args.explicitStageIndex))
      : null
  const explicitBranch = args.explicitBranchId
    ? activeBranches.find((branch) => branch.branchId === args.explicitBranchId) ?? null
    : null
  const stageIndex =
    explicitStage ??
    explicitBranch?.stageIndex ??
    Math.min(...activeBranches.map((branch) => Math.max(1, branch.stageIndex)))

  const cohort = activeBranches.filter((branch) => Math.max(1, branch.stageIndex) === stageIndex)
  if (cohort.length === 0) return null

  return {
    stageIndex,
    branches: cohort,
  }
}

export function buildFallbackBranchRegistry(args: {
  topicId: string
  topicOriginPaperId: string
  topicDefaults: BranchingDefaults
  topicMemory: Record<string, unknown>
  paperCatalog: Record<string, Record<string, unknown>>
}) {
  const existing = normalizeBranchRegistry(args.topicMemory.branchRegistry)
  const existingMap = new Map(existing.map((entry) => [entry.branchId, entry]))
  const problemNodes = Array.isArray(args.topicMemory.problemNodes)
    ? (args.topicMemory.problemNodes as Array<Record<string, unknown>>)
    : []
  const branchTree = Array.isArray(args.topicMemory.branchTree)
    ? (args.topicMemory.branchTree as Array<Record<string, unknown>>)
    : []
  const built: BranchRegistryEntry[] = []

  for (const problemNode of problemNodes) {
    const problemNodeId = asString(problemNode.id, '')
    if (!problemNodeId) continue
    const parentPaperId = asString(problemNode.parentPaperId, args.topicOriginPaperId)
    const matchingTreeBranches = branchTree.filter((branch) => asString(branch.rootProblemNodeId, '') === problemNodeId)
    const branchIds = uniqueStrings([
      ...asStringArray(problemNode.activeBranchIds),
      ...matchingTreeBranches.map((branch) => asString(branch.id, '')),
    ])
    const ensuredBranchIds = branchIds.length > 0 ? branchIds : [createBranchId(problemNodeId, parentPaperId)]

    for (const branchId of ensuredBranchIds) {
      const existingEntry = existingMap.get(branchId)
      const branchNode =
        matchingTreeBranches.find((candidate) => asString(candidate.id, '') === branchId) ??
        branchTree.find((candidate) => asString(candidate.id, '') === branchId) ??
        null
      const paperPath = branchNode ? asStringArray(branchNode.paperPath) : []
      const anchorPaperId = existingEntry?.anchorPaperId || parentPaperId
      const anchorPaperPublishedAt =
        existingEntry?.anchorPaperPublishedAt ||
        resolvePaperPublishedAt(args.paperCatalog, anchorPaperId, new Date().toISOString())
      const lastTrackedPaperId = existingEntry?.lastTrackedPaperId || paperPath[paperPath.length - 1] || anchorPaperId
      const lastTrackedPublishedAt =
        existingEntry?.lastTrackedPublishedAt ||
        resolvePaperPublishedAt(args.paperCatalog, lastTrackedPaperId, anchorPaperPublishedAt)

      built.push({
        branchId,
        rootProblemNodeId: problemNodeId,
        parentBranchId:
          existingEntry?.parentBranchId ??
          (branchNode ? (asString(branchNode.parentBranchId, '') || null) : null),
        anchorPaperId,
        anchorPaperPublishedAt,
        lastTrackedPaperId,
        lastTrackedPublishedAt,
        stageIndex: existingEntry?.stageIndex ?? 1,
        activeWindowMonths: existingEntry?.activeWindowMonths ?? args.topicDefaults.minStageWindowMonths,
        status: existingEntry?.status ?? mapLegacyBranchStatus(problemNode, branchNode),
        priorityScore:
          existingEntry?.priorityScore ??
          clamp(asNumber(problemNode.confidence, 0.55), 0.15, 1),
        linkedProblemNodeIds: uniqueStrings([
          ...(existingEntry?.linkedProblemNodeIds ?? []),
          problemNodeId,
        ]),
        mergedIntoBranchId: existingEntry?.mergedIntoBranchId ?? null,
        branchType:
          existingEntry?.branchType ??
          (branchNode && asString(branchNode.branchType, '') === 'transfer' ? 'transfer' : 'direct'),
        label:
          existingEntry?.label ||
          asString(branchNode?.label, asString(problemNode.stageTitle, `研究支线 ${problemNodeId}`)),
        summary:
          existingEntry?.summary ||
          asString(branchNode?.summary, asString(problemNode.stageDigest, asString(problemNode.question, ''))),
      })
    }
  }

  if (built.length === 0) {
    const originPublishedAt = resolvePaperPublishedAt(args.paperCatalog, args.topicOriginPaperId, new Date().toISOString())
    built.push({
      branchId: `branch:${args.topicId}:origin`,
      rootProblemNodeId: `${args.topicId}:origin`,
      parentBranchId: null,
      anchorPaperId: args.topicOriginPaperId,
      anchorPaperPublishedAt: originPublishedAt,
      lastTrackedPaperId: args.topicOriginPaperId,
      lastTrackedPublishedAt: originPublishedAt,
      stageIndex: 1,
      activeWindowMonths: args.topicDefaults.minStageWindowMonths,
      status: 'active',
      priorityScore: 0.5,
      linkedProblemNodeIds: [],
      mergedIntoBranchId: null,
      branchType: 'direct',
      label: '源头主线',
      summary: '这是根据主题源头自动补出的回退主线。',
    })
  }

  return uniqueByBranchId([...existing, ...built])
}

function uniqueByBranchId(entries: BranchRegistryEntry[]) {
  const byId = new Map<string, BranchRegistryEntry>()
  for (const entry of entries) {
    const previous = byId.get(entry.branchId)
    byId.set(entry.branchId, previous ? { ...previous, ...entry } : entry)
  }
  return [...byId.values()]
}

export function buildFallbackPaperRelations(args: {
  topicId: string
  topicMemory: Record<string, unknown>
  branchRegistry: BranchRegistryEntry[]
}) {
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry: args.branchRegistry,
  })
  const existing = normalizePaperRelations(args.topicMemory.paperRelations)
  const relationMap = new Map(existing.map((entry) => [entry.paperId, { ...entry }]))
  const publishedMainlinePaperIds = asStringArray(args.topicMemory.publishedMainlinePaperIds)
  const publishedBranchPaperIds = asStringArray(args.topicMemory.publishedBranchPaperIds)
  const problemNodes = Array.isArray(args.topicMemory.problemNodes)
    ? (args.topicMemory.problemNodes as Array<Record<string, unknown>>)
    : []
  const branchTree = Array.isArray(args.topicMemory.branchTree)
    ? (args.topicMemory.branchTree as Array<Record<string, unknown>>)
    : []

  const upsert = (paperId: string, patch: Partial<PaperRelationEntry>) => {
    if (!paperId) return
    const current = relationMap.get(paperId) ?? {
      paperId,
      nodeId: null,
      problemNodeIds: [],
      branchIds: [],
      primaryBranchId: mainlineBranchId,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    }
    relationMap.set(paperId, {
      ...current,
      ...patch,
      nodeId: patch.nodeId ?? current.nodeId ?? null,
      problemNodeIds: uniqueStrings([...(current.problemNodeIds ?? []), ...(patch.problemNodeIds ?? [])]),
      branchIds: uniqueStrings([...(current.branchIds ?? []), ...(patch.branchIds ?? [])]),
      mergedBranchIds: uniqueStrings([...(current.mergedBranchIds ?? []), ...(patch.mergedBranchIds ?? [])]),
      resolvedProblemIds: uniqueStrings([...(current.resolvedProblemIds ?? []), ...(patch.resolvedProblemIds ?? [])]),
      primaryBranchId: patch.primaryBranchId ?? current.primaryBranchId,
      isMergePaper: patch.isMergePaper ?? current.isMergePaper,
    })
  }

  for (const paperId of publishedMainlinePaperIds) {
    upsert(paperId, {
      branchIds: [mainlineBranchId],
      primaryBranchId: mainlineBranchId,
    })
  }

  for (const paperId of publishedBranchPaperIds) {
    const relationBranchIds = branchTree
      .filter((branch) => asStringArray(branch.paperPath).includes(paperId))
      .map((branch) => asString(branch.id, ''))
    upsert(paperId, {
      branchIds: relationBranchIds,
      primaryBranchId: relationBranchIds[0] ?? mainlineBranchId,
    })
  }

  for (const problemNode of problemNodes) {
    const problemNodeId = asString(problemNode.id, '')
    const branchIds = uniqueStrings([
      ...asStringArray(problemNode.activeBranchIds),
      ...args.branchRegistry
        .filter((branch) => branch.rootProblemNodeId === problemNodeId)
        .map((branch) => branch.branchId),
    ])
    const candidateGroups = [
      ...((Array.isArray(problemNode.directCandidates) ? problemNode.directCandidates : []) as Array<Record<string, unknown>>),
      ...((Array.isArray(problemNode.transferCandidates) ? problemNode.transferCandidates : []) as Array<Record<string, unknown>>),
      ...((Array.isArray(problemNode.rejectedTransferCandidates)
        ? problemNode.rejectedTransferCandidates
        : []) as Array<Record<string, unknown>>),
    ]

    for (const candidate of candidateGroups) {
      const paperId = asString(candidate.paperId, '')
      if (!paperId) continue
      upsert(paperId, {
        problemNodeIds: [problemNodeId],
        branchIds,
        primaryBranchId: branchIds[0] ?? mainlineBranchId,
        resolvedProblemIds:
          asString(candidate.status, '') === 'promoted' || asString(problemNode.resolutionStatus, '') === 'resolved'
            ? [problemNodeId]
            : [],
      })
    }
  }

  return [...relationMap.values()].map((entry) => ({
    ...entry,
    isMergePaper: entry.isMergePaper || entry.branchIds.length > 1 || entry.mergedBranchIds.length > 0,
  }))
}

export function syncLegacyBranchTree(args: {
  topicId: string
  topicMemory: Record<string, unknown>
  branchRegistry: BranchRegistryEntry[]
  paperRelations: PaperRelationEntry[]
}) {
  const existing = Array.isArray(args.topicMemory.branchTree)
    ? (args.topicMemory.branchTree as Array<Record<string, unknown>>)
    : []
  const existingMap = new Map(existing.map((entry) => [asString(entry.id, ''), entry]))
  return args.branchRegistry.map((branch) => {
    const previous = existingMap.get(branch.branchId)
    const relationPaperIds = args.paperRelations
      .filter((entry) => entry.branchIds.includes(branch.branchId))
      .map((entry) => entry.paperId)
    const paperPath = uniqueStrings([
      ...asStringArray(previous?.paperPath),
      ...relationPaperIds,
      branch.lastTrackedPaperId,
    ]).filter((paperId) => paperId !== branch.anchorPaperId || relationPaperIds.includes(paperId))

    return {
      id: branch.branchId,
      rootProblemNodeId: branch.rootProblemNodeId,
      label: branch.label || asString(previous?.label, branch.branchId),
      branchType:
        branch.branchType === 'transfer'
          ? 'transfer'
          : branch.branchType === 'merge'
            ? 'merge'
            : 'direct',
      paperPath,
      status:
        branch.status === 'merged'
          ? 'merged'
          : branch.status === 'resolved'
            ? 'promoted_to_mainline'
            : branch.status === 'dormant' || branch.status === 'pending-review'
              ? 'archived'
              : branch.status === 'candidate'
                ? 'candidate'
                : 'branch_active',
      summary: branch.summary || asString(previous?.summary, ''),
      promotionPolicy: asString(previous?.promotionPolicy, '当分支论文已经成为最清晰的主线下一跳时，再提升进入主线。'),
      mergeBackPolicy: asString(previous?.mergeBackPolicy, '当分支论文同时解决多个开放问题时，再考虑汇回主线。'),
      supersededBy: branch.mergedIntoBranchId ?? previous?.supersededBy ?? null,
      rewriteImpact: asString(previous?.rewriteImpact, '会同步更新 canonical 分支关系以及下游主题展示视图。'),
      parentBranchId: branch.parentBranchId,
    }
  })
}

export function selectBranchForTracking(args: {
  branchRegistry: BranchRegistryEntry[]
  decisionEntries: Array<Record<string, unknown>>
  problemNodes: Array<Record<string, unknown>>
  explicitBranchId?: string
}) {
  if (args.explicitBranchId) {
    const explicit = args.branchRegistry.find((branch) => branch.branchId === args.explicitBranchId)
    return explicit ? { branch: explicit, priority: explicit.priorityScore } : null
  }

  const problemMap = new Map(args.problemNodes.map((problemNode) => [asString(problemNode.id, ''), problemNode]))
  const branchScores = args.branchRegistry
    .filter((branch) => branch.status !== 'merged' && branch.status !== 'resolved')
    .map((branch) => {
      const branchEntries = args.decisionEntries.filter((entry) => asString(entry.branchId, '') === branch.branchId)
      const selectedHits = branchEntries.filter((entry) => asString(entry.selectedPaperId, '')).length
      const deferredHits = branchEntries.reduce(
        (total, entry) => total + asStringArray(entry.deferredPaperIds).length,
        0,
      )
      const noCandidateHits = branchEntries.filter((entry) => asString(entry.actionKind, '') === 'no-candidate').length
      const problemPriority =
        branch.linkedProblemNodeIds.length > 0
          ? branch.linkedProblemNodeIds.reduce((total, problemId) => {
              const problemNode = problemMap.get(problemId)
              return total + asNumber(problemNode?.confidence, 0.5)
            }, 0) / branch.linkedProblemNodeIds.length
          : 0.5
      const freshnessBonus =
        branch.status === 'active' ? 0.08 : branch.status === 'candidate' ? 0.03 : branch.status === 'pending-review' ? -0.02 : -0.08
      const stalePenalty = daysBetween(branch.lastTrackedPublishedAt, new Date().toISOString()) > 365 ? 0.06 : 0
      const priority = Number(
        clamp(
          branch.priorityScore +
            problemPriority * 0.2 +
            freshnessBonus +
            Math.min(0.12, selectedHits * 0.03) -
            Math.min(0.18, deferredHits * 0.02) -
            Math.min(0.16, noCandidateHits * 0.05) -
            stalePenalty,
          0,
          2,
        ).toFixed(3),
      )
      return {
        branch,
        priority,
      }
    })
    .sort((left, right) => right.priority - left.priority)

  return branchScores[0] ?? null
}

export function resolveStageWindow(args: {
  anchorPaperPublishedAt: string
  candidateDates: Array<{ paperId: string; published: string }>
  defaults: BranchingDefaults
  requestedWindowMonths?: number
}) : StageWindowResolution {
  const windowStart = args.anchorPaperPublishedAt
  const uniqueCandidates = args.candidateDates
    .filter((candidate) => parseDate(candidate.published))
    .sort((left, right) => {
      const leftDate = parseDate(left.published)
      const rightDate = parseDate(right.published)
      if (!leftDate || !rightDate) return 0
      return leftDate.getTime() - rightDate.getTime()
    })
  const candidatesByWindow = new Map<number, string[]>()
  const monthsToTry = args.requestedWindowMonths
    ? [clamp(args.requestedWindowMonths, args.defaults.minStageWindowMonths, args.defaults.maxStageWindowMonths)]
    : Array.from(
        { length: args.defaults.maxStageWindowMonths - args.defaults.minStageWindowMonths + 1 },
        (_, index) => args.defaults.minStageWindowMonths + index,
      )

  for (const windowMonths of monthsToTry) {
    const windowEnd = addMonths(args.anchorPaperPublishedAt, windowMonths)
    const filtered = uniqueCandidates
      .filter((candidate) => {
        const publishedAt = parseDate(candidate.published)
        const anchorDate = parseDate(args.anchorPaperPublishedAt)
        const windowEndDate = parseDate(windowEnd)
        if (!publishedAt || !anchorDate || !windowEndDate) return false
        return publishedAt.getTime() >= anchorDate.getTime() && publishedAt.getTime() <= windowEndDate.getTime()
      })
      .map((candidate) => candidate.paperId)
    candidatesByWindow.set(windowMonths, uniqueStrings(filtered))
    if (filtered.length >= 1 && filtered.length <= 4) {
      return {
        windowMonths,
        windowStart,
        windowEnd,
        candidatePaperIds: uniqueStrings(filtered),
        status: 'selected',
      }
    }
  }

  for (const windowMonths of monthsToTry) {
    const candidatePaperIds = candidatesByWindow.get(windowMonths) ?? []
    if (candidatePaperIds.length > 0) {
      return {
        windowMonths,
        windowStart,
        windowEnd: addMonths(args.anchorPaperPublishedAt, windowMonths),
        candidatePaperIds,
        status: 'selected',
      }
    }
  }

  const fallbackWindowMonths = monthsToTry[monthsToTry.length - 1] ?? args.defaults.maxStageWindowMonths
  return {
    windowMonths: fallbackWindowMonths,
    windowStart,
    windowEnd: addMonths(args.anchorPaperPublishedAt, fallbackWindowMonths),
    candidatePaperIds: [],
    status: 'no-candidate',
  }
}

export function upsertStageLedgerEntry(entries: StageLedgerEntry[], nextEntry: StageLedgerEntry) {
  const index = entries.findIndex(
    (entry) => entry.branchId === nextEntry.branchId && entry.stageIndex === nextEntry.stageIndex,
  )
  if (index >= 0) {
    const updated = [...entries]
    updated[index] = nextEntry
    return updated
  }
  return [...entries, nextEntry]
}
