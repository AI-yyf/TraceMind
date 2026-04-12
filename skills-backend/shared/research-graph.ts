import type { ResearchNode as CanonicalResearchNode, NodeStatus } from './research-node'

export type WindowPolicy = 'auto' | 'fixed'
export type BranchModel = 'problem-node-driven'
export type BranchRegistryStatus = string

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

export interface MergeEvent {
  paperId: string
  mergedBranchIds: string[]
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
  builtAt: string
  mergeEvents: MergeEvent[]
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
  status: 'running' | 'completed' | 'failed' | 'no-candidate'
  decisionSummary: string
  discoveryRounds: Array<Record<string, unknown>>
  builtAt: string
}

export interface PaperRelation {
  paperId: string
  nodeId: string
  problemNodeIds: string[]
  branchIds: string[]
  primaryBranchId: string
  isMergePaper: boolean
  mergedBranchIds: string[]
  resolvedProblemIds: string[]
}

export type ResearchGraphNode = CanonicalResearchNode & {
  branchId?: string
  id?: string
  paperId?: string
  paperPublishedAt?: string
  title?: string
  summary?: string
  isKeyPaper?: boolean
}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function uniqueStrings(values: unknown, fallback: string[] = []): string[] {
  const input = Array.isArray(values) ? values : fallback
  return Array.from(new Set(asStringArray(input)))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function resolveNodeStatus(value: unknown, fallback: NodeStatus): NodeStatus {
  return value === 'canonical' || value === 'archived' || value === 'deprecated' || value === 'provisional'
    ? value
    : fallback
}

export function normalizeBranchingDefaults(
  value?: Record<string, unknown> | BranchingDefaults,
): BranchingDefaults {
  return {
    windowPolicy: value?.windowPolicy === 'fixed' ? 'fixed' : 'auto',
    minStageWindowMonths: Math.max(1, Math.trunc(asNumber(value?.minStageWindowMonths, 5))),
    maxStageWindowMonths: Math.max(1, Math.trunc(asNumber(value?.maxStageWindowMonths, 12))),
    maxActiveBranches: Math.max(1, Math.trunc(asNumber(value?.maxActiveBranches, 4))),
    branchModel: 'problem-node-driven',
    allowBranchMerge: asBoolean(value?.allowBranchMerge, true),
    maxCandidates: Math.max(1, Math.trunc(asNumber(value?.maxCandidates, 8))),
  }
}

export function normalizeBranchRegistry(value: unknown): BranchRegistryEntry[] {
  if (!Array.isArray(value)) return []
  const normalized: BranchRegistryEntry[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) continue
    const branchId = asString(record.branchId)
    if (!branchId) continue
    const anchorPaperId = asString(record.anchorPaperId)
    const timestamp = asString(record.anchorPaperPublishedAt, new Date().toISOString())
    normalized.push({
      branchId,
      rootProblemNodeId: asString(record.rootProblemNodeId, `${branchId}:problem`),
      parentBranchId: asString(record.parentBranchId, '') || null,
      anchorPaperId,
      anchorPaperPublishedAt: timestamp,
      lastTrackedPaperId: asString(record.lastTrackedPaperId, anchorPaperId),
      lastTrackedPublishedAt: asString(record.lastTrackedPublishedAt, timestamp),
      stageIndex: Math.max(1, Math.trunc(asNumber(record.stageIndex, 1))),
      activeWindowMonths: Math.max(1, Math.trunc(asNumber(record.activeWindowMonths, 5))),
      status: asString(record.status, 'active'),
      priorityScore: clamp(asNumber(record.priorityScore, 0.5), 0, 1),
      linkedProblemNodeIds: uniqueStrings(record.linkedProblemNodeIds),
      mergedIntoBranchId: asString(record.mergedIntoBranchId, '') || null,
      branchType:
        record.branchType === 'transfer' || record.branchType === 'merge' ? record.branchType : 'direct',
      label: asString(record.label, '') || undefined,
      summary: asString(record.summary, '') || undefined,
    })
  }
  return normalized.sort(
    (left, right) => left.stageIndex - right.stageIndex || left.branchId.localeCompare(right.branchId),
  )
}

export function normalizePaperRelations(value: unknown): PaperRelation[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) return null
      const paperId = asString(record.paperId)
      if (!paperId) return null
      const branchIds = uniqueStrings(record.branchIds)
      const primaryBranchId = asString(record.primaryBranchId, branchIds[0] ?? 'main')
      return {
        paperId,
        nodeId: asString(record.nodeId, `node:${paperId}`),
        problemNodeIds: uniqueStrings(record.problemNodeIds),
        branchIds,
        primaryBranchId,
        isMergePaper: asBoolean(record.isMergePaper, false),
        mergedBranchIds: uniqueStrings(record.mergedBranchIds),
        resolvedProblemIds: uniqueStrings(record.resolvedProblemIds),
      } satisfies PaperRelation
    })
    .filter((entry): entry is PaperRelation => Boolean(entry))
}

export function normalizeStageLedger(value: unknown): StageLedgerEntry[] {
  if (!Array.isArray(value)) return []
  const normalized: StageLedgerEntry[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) continue
    const branchId = asString(record.branchId)
    if (!branchId) continue
    const mergeEvents: MergeEvent[] = []
    if (Array.isArray(record.mergeEvents)) {
      for (const event of record.mergeEvents) {
        const eventRecord = asRecord(event)
        if (!eventRecord) continue
        const paperId = asString(eventRecord.paperId)
        if (!paperId) continue
        mergeEvents.push({
          paperId,
          mergedBranchIds: uniqueStrings(eventRecord.mergedBranchIds),
        })
      }
    }
    normalized.push({
      branchId,
      stageIndex: Math.max(1, Math.trunc(asNumber(record.stageIndex, 1))),
      windowStart: asString(record.windowStart, ''),
      windowEnd: asString(record.windowEnd, ''),
      windowMonths: Math.max(1, Math.trunc(asNumber(record.windowMonths, 5))),
      anchorPaperId: asString(record.anchorPaperId, ''),
      candidatePaperIds: uniqueStrings(record.candidatePaperIds),
      selectedPaperId: asString(record.selectedPaperId, '') || null,
      status:
        record.status === 'completed' ||
        record.status === 'no-candidate' ||
        record.status === 'merged' ||
        record.status === 'skipped'
          ? record.status
          : 'planned',
      decisionSummary: asString(record.decisionSummary, ''),
      builtAt: asString(record.builtAt, new Date().toISOString()),
      mergeEvents,
    })
  }
  return normalized.sort(
    (left, right) => left.stageIndex - right.stageIndex || left.branchId.localeCompare(right.branchId),
  )
}

export function normalizeStageRunLedger(value: unknown): StageRunLedgerEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const record = asRecord(entry)
      if (!record) return null
      return {
        stageIndex: Math.max(1, Math.trunc(asNumber(record.stageIndex, 1))),
        sourceBranchIds: uniqueStrings(record.sourceBranchIds),
        sourceProblemNodeIds: uniqueStrings(record.sourceProblemNodeIds),
        sourceAnchorPaperIds: uniqueStrings(record.sourceAnchorPaperIds),
        candidatePaperIds: uniqueStrings(record.candidatePaperIds),
        selectedNodeIds: uniqueStrings(record.selectedNodeIds),
        provisionalNodeIds: uniqueStrings(record.provisionalNodeIds),
        windowStart: asString(record.windowStart, ''),
        windowEnd: asString(record.windowEnd, ''),
        windowMonths: Math.max(1, Math.trunc(asNumber(record.windowMonths, 5))),
        status:
          record.status === 'running' ||
          record.status === 'completed' ||
          record.status === 'failed' ||
          record.status === 'no-candidate'
            ? record.status
            : 'completed',
        decisionSummary: asString(record.decisionSummary, ''),
        discoveryRounds: Array.isArray(record.discoveryRounds)
          ? record.discoveryRounds.filter(isRecord)
          : [],
        builtAt: asString(record.builtAt, new Date().toISOString()),
      } satisfies StageRunLedgerEntry
    })
    .filter((entry): entry is StageRunLedgerEntry => Boolean(entry))
    .sort((left, right) => left.stageIndex - right.stageIndex)
}

export function resolvePaperPublishedAt(
  paperCatalog: Record<string, Record<string, unknown>>,
  paperId: string,
  fallback: string,
): string {
  return asString(paperCatalog[paperId]?.published, fallback)
}

export function createResearchNodeId(args: {
  topicId: string
  stageIndex: number
  paperIds: string[]
}): string {
  const paperSegment = [...args.paperIds].sort().join('+') || 'empty'
  return `${args.topicId}:stage-${args.stageIndex}:${paperSegment}`
}

function normalizeGraphNode(value: unknown): ResearchGraphNode | null {
  const record = asRecord(value)
  if (!record) return null
  const nodeId = asString(record.nodeId, asString(record.id))
  const primaryPaperId = asString(record.primaryPaperId, asString(record.paperId))
  const branchId = asString(record.branchId, asStringArray(record.sourceBranchIds)[0] ?? '')
  if (!nodeId || !primaryPaperId) return null
  const discoveredAt = asString(
    record.discoveredAt,
    asString(record.paperPublishedAt, asString(record.createdAt, new Date().toISOString())),
  )
  const status = resolveNodeStatus(record.status, asBoolean(record.provisional, false) ? 'provisional' : 'canonical')

  return {
    nodeId,
    id: nodeId,
    topicId: asString(record.topicId, ''),
    stageIndex: Math.max(0, Math.trunc(asNumber(record.stageIndex, 0))),
    paperIds: uniqueStrings(record.paperIds, [primaryPaperId]),
    primaryPaperId,
    sourceBranchIds: uniqueStrings(record.sourceBranchIds, branchId ? [branchId] : []),
    sourceProblemNodeIds: uniqueStrings(record.sourceProblemNodeIds),
    status,
    provisional: asBoolean(record.provisional, status === 'provisional'),
    nodeLabel: asString(record.nodeLabel, asString(record.title, primaryPaperId)),
    nodeSummary: asString(record.nodeSummary, asString(record.summary, '')),
    isMergeNode: asBoolean(record.isMergeNode, false),
    tags: uniqueStrings(record.tags),
    discoveredAt,
    createdAt: asString(record.createdAt, discoveredAt),
    updatedAt: asString(record.updatedAt, discoveredAt),
    version: Math.max(1, Math.trunc(asNumber(record.version, 1))),
    branchId,
    paperId: primaryPaperId,
    paperPublishedAt: asString(record.paperPublishedAt, discoveredAt),
    title: asString(record.title, '') || undefined,
    summary: asString(record.summary, '') || undefined,
    isKeyPaper: asBoolean(record.isKeyPaper, false),
  }
}

export function buildResearchNodesFromStageLedger(
  input:
    | Record<string, unknown>
    | {
        topicId: string
        stageLedger: unknown
        paperRelations?: unknown
      },
): ResearchGraphNode[] {
  if (
    isRecord(input) &&
    'topicId' in input &&
    ('stageLedger' in input || 'paperRelations' in input)
  ) {
    const topicId = asString(input.topicId, '')
    const stageLedger = normalizeStageLedger(input.stageLedger)
    const paperRelations = normalizePaperRelations(input.paperRelations)
    const relationMap = new Map(paperRelations.map((relation) => [relation.paperId, relation]))
    return stageLedger
      .filter((entry) => Boolean(entry.selectedPaperId))
      .map((entry) => {
        const selectedPaperId = entry.selectedPaperId as string
        const relation = relationMap.get(selectedPaperId)
        const nodeId =
          relation?.nodeId ??
          createResearchNodeId({
            topicId,
            stageIndex: entry.stageIndex,
            paperIds: [selectedPaperId],
          })
        return normalizeGraphNode({
          nodeId,
          topicId,
          stageIndex: entry.stageIndex,
          paperIds: [selectedPaperId],
          primaryPaperId: selectedPaperId,
          sourceBranchIds: uniqueStrings([entry.branchId, ...(relation?.branchIds ?? [])]),
          sourceProblemNodeIds: relation?.problemNodeIds ?? [],
          status: 'canonical',
          provisional: false,
          nodeLabel: selectedPaperId,
          nodeSummary: entry.decisionSummary,
          isMergeNode: entry.mergeEvents.length > 0 || relation?.isMergePaper === true,
          tags: [],
          discoveredAt: entry.windowEnd || entry.builtAt,
          createdAt: entry.builtAt,
          updatedAt: entry.builtAt,
          version: 1,
          branchId: relation?.primaryBranchId ?? entry.branchId,
          paperId: selectedPaperId,
          paperPublishedAt: entry.windowEnd || entry.builtAt,
        }) as ResearchGraphNode
      })
  }

  const stageLedger =
    Array.isArray(input)
      ? normalizeStageLedger(input)
      : isRecord(input)
        ? normalizeStageLedger(Object.values(input))
        : []

  return stageLedger
    .filter((entry) => Boolean(entry.selectedPaperId))
    .map((entry) =>
      normalizeGraphNode({
        id: `${entry.branchId}-${entry.stageIndex}`,
        nodeId: `${entry.branchId}-${entry.stageIndex}`,
        stageIndex: entry.stageIndex,
        primaryPaperId: entry.selectedPaperId,
        paperId: entry.selectedPaperId,
        paperIds: [entry.selectedPaperId],
        branchId: entry.branchId,
        sourceBranchIds: [entry.branchId],
        sourceProblemNodeIds: [],
        paperPublishedAt: entry.windowEnd,
        discoveredAt: entry.windowEnd,
        createdAt: entry.builtAt,
        updatedAt: entry.builtAt,
        nodeLabel: entry.selectedPaperId,
        nodeSummary: entry.decisionSummary,
        status: entry.status === 'planned' ? 'provisional' : 'canonical',
        provisional: entry.status === 'planned',
        isMergeNode: entry.mergeEvents.length > 0,
        tags: [],
        version: 1,
      }) as ResearchGraphNode,
    )
}

export function normalizeResearchNodes(nodes: unknown): ResearchGraphNode[] {
  if (!Array.isArray(nodes)) return []
  const byNodeId = new Map<string, ResearchGraphNode>()
  const pickEarlierDate = (left: string, right: string) => {
    const leftTime = Date.parse(left)
    const rightTime = Date.parse(right)
    if (Number.isNaN(leftTime)) return right
    if (Number.isNaN(rightTime)) return left
    return leftTime <= rightTime ? left : right
  }
  const pickLaterDate = (left: string, right: string) => {
    const leftTime = Date.parse(left)
    const rightTime = Date.parse(right)
    if (Number.isNaN(leftTime)) return right
    if (Number.isNaN(rightTime)) return left
    return leftTime >= rightTime ? left : right
  }

  for (const node of nodes) {
    const normalized = normalizeGraphNode(node)
    if (!normalized) continue

    const existing = byNodeId.get(normalized.nodeId)
    if (!existing) {
      byNodeId.set(normalized.nodeId, normalized)
      continue
    }

    byNodeId.set(normalized.nodeId, {
      ...existing,
      topicId: existing.topicId || normalized.topicId,
      stageIndex: Math.min(existing.stageIndex, normalized.stageIndex),
      paperIds: uniqueStrings([...existing.paperIds, ...normalized.paperIds]),
      sourceBranchIds: uniqueStrings([...existing.sourceBranchIds, ...normalized.sourceBranchIds]),
      sourceProblemNodeIds: uniqueStrings([
        ...existing.sourceProblemNodeIds,
        ...normalized.sourceProblemNodeIds,
      ]),
      status:
        existing.status === 'canonical' || normalized.status === 'canonical'
          ? 'canonical'
          : existing.status === 'archived' || normalized.status === 'archived'
            ? 'archived'
            : existing.status === 'deprecated' || normalized.status === 'deprecated'
              ? 'deprecated'
              : 'provisional',
      provisional: existing.provisional && normalized.provisional,
      nodeLabel:
        existing.nodeLabel.length >= normalized.nodeLabel.length
          ? existing.nodeLabel
          : normalized.nodeLabel,
      nodeSummary:
        existing.nodeSummary.length >= normalized.nodeSummary.length
          ? existing.nodeSummary
          : normalized.nodeSummary,
      isMergeNode: existing.isMergeNode || normalized.isMergeNode,
      tags: uniqueStrings([...existing.tags, ...normalized.tags]),
      discoveredAt: pickEarlierDate(existing.discoveredAt, normalized.discoveredAt),
      createdAt: pickEarlierDate(existing.createdAt, normalized.createdAt),
      updatedAt: pickLaterDate(existing.updatedAt, normalized.updatedAt),
      version: Math.max(existing.version, normalized.version),
      branchId: existing.branchId || normalized.branchId,
      title: existing.title || normalized.title,
      summary: existing.summary || normalized.summary,
      isKeyPaper: existing.isKeyPaper || normalized.isKeyPaper,
    })
  }

  return [...byNodeId.values()].sort((left, right) => {
    const leftBranch = left.branchId ?? left.sourceBranchIds[0] ?? ''
    const rightBranch = right.branchId ?? right.sourceBranchIds[0] ?? ''
    if (leftBranch !== rightBranch) {
      return leftBranch.localeCompare(rightBranch)
    }
    if (left.stageIndex !== right.stageIndex) {
      return left.stageIndex - right.stageIndex
    }
    return left.nodeId.localeCompare(right.nodeId)
  })
}

export function buildFallbackBranchRegistry(args: {
  topicId: string
  topicOriginPaperId: string
  topicDefaults?: Record<string, unknown> | BranchingDefaults
  topicMemory?: Record<string, unknown>
  paperCatalog?: Record<string, Record<string, unknown>>
}): BranchRegistryEntry[] {
  const normalized = normalizeBranchRegistry(args.topicMemory?.branchRegistry)
  if (normalized.length > 0) {
    return normalized
  }

  const defaults = normalizeBranchingDefaults(args.topicDefaults)
  const publishedAt = resolvePaperPublishedAt(
    args.paperCatalog ?? {},
    args.topicOriginPaperId,
    new Date().toISOString(),
  )
  return [
    {
      branchId: `branch:${args.topicId}:origin`,
      rootProblemNodeId: `${args.topicId}:origin-problem`,
      parentBranchId: null,
      anchorPaperId: args.topicOriginPaperId,
      anchorPaperPublishedAt: publishedAt,
      lastTrackedPaperId: args.topicOriginPaperId,
      lastTrackedPublishedAt: publishedAt,
      stageIndex: 1,
      activeWindowMonths: defaults.minStageWindowMonths,
      status: 'active',
      priorityScore: 0.95,
      linkedProblemNodeIds: [`${args.topicId}:origin-problem`],
      mergedIntoBranchId: null,
      branchType: 'direct',
      label: 'origin',
      summary: 'Fallback origin branch',
    },
  ]
}

export function buildFallbackPaperRelations(args: {
  topicId: string
  topicMemory?: Record<string, unknown>
  branchRegistry: BranchRegistryEntry[]
}): PaperRelation[] {
  const normalized = normalizePaperRelations(args.topicMemory?.paperRelations)
  if (normalized.length > 0) {
    return normalized
  }

  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry: args.branchRegistry,
  })
  const publishedMainlinePaperIds = asStringArray(args.topicMemory?.publishedMainlinePaperIds)
  const publishedBranchPaperIds = asStringArray(args.topicMemory?.publishedBranchPaperIds)
  const candidatePaperIds = asStringArray(args.topicMemory?.candidatePaperIds)

  const relations: PaperRelation[] = [
    ...publishedMainlinePaperIds.map((paperId) => ({
      paperId,
      nodeId: `node:${paperId}`,
      problemNodeIds: [],
      branchIds: [mainlineBranchId],
      primaryBranchId: mainlineBranchId,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    })),
    ...publishedBranchPaperIds.map((paperId) => ({
      paperId,
      nodeId: `node:${paperId}`,
      problemNodeIds: [],
      branchIds: args.branchRegistry.map((branch) => branch.branchId),
      primaryBranchId: args.branchRegistry[0]?.branchId ?? mainlineBranchId,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    })),
    ...candidatePaperIds.map((paperId) => ({
      paperId,
      nodeId: `node:${paperId}`,
      problemNodeIds: [],
      branchIds: [],
      primaryBranchId: mainlineBranchId,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    })),
  ]

  return normalizePaperRelations(relations)
}

export function syncLegacyBranchTree(args: {
  topicId: string
  topicMemory?: Record<string, unknown>
  branchRegistry: BranchRegistryEntry[]
  paperRelations: PaperRelation[]
}): Array<Record<string, unknown>> {
  return args.branchRegistry.map((branch) => ({
    branchId: branch.branchId,
    parentBranchId: branch.parentBranchId,
    rootProblemNodeId: branch.rootProblemNodeId,
    anchorPaperId: branch.anchorPaperId,
    linkedProblemNodeIds: branch.linkedProblemNodeIds,
    paperIds: args.paperRelations
      .filter((relation) => relation.branchIds.includes(branch.branchId))
      .map((relation) => relation.paperId),
    status: branch.status,
    stageIndex: branch.stageIndex,
    label: branch.label ?? branch.branchId,
  }))
}

export function resolveMainlineBranchId(
  input:
    | ResearchGraphNode[]
    | {
        topicId: string
        branchRegistry: BranchRegistryEntry[]
      },
): string {
  if (Array.isArray(input)) {
    if (input.length === 0) return 'main'
    const branchCounts = new Map<string, number>()
    for (const node of input) {
      const branchId = node.branchId ?? node.sourceBranchIds[0] ?? 'main'
      branchCounts.set(branchId, (branchCounts.get(branchId) ?? 0) + 1)
    }
    return [...branchCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'main'
  }

  const originBranch =
    input.branchRegistry.find((branch) => branch.parentBranchId === null) ??
    input.branchRegistry.find((branch) => branch.status === 'active') ??
    input.branchRegistry[0]
  return originBranch?.branchId ?? `branch:${input.topicId}:origin`
}

export default {
  asRecord,
  asString,
  asStringArray,
  buildFallbackBranchRegistry,
  buildFallbackPaperRelations,
  buildResearchNodesFromStageLedger,
  clamp,
  createResearchNodeId,
  normalizeBranchingDefaults,
  normalizeBranchRegistry,
  normalizePaperRelations,
  normalizeResearchNodes,
  normalizeStageLedger,
  normalizeStageRunLedger,
  resolveMainlineBranchId,
  resolvePaperPublishedAt,
  syncLegacyBranchTree,
  uniqueStrings,
}
