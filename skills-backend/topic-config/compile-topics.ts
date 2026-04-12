import fs from 'node:fs'
import path from 'node:path'

import {
  buildResearchNodesFromStageLedger,
  createResearchNodeId,
  normalizeBranchRegistry,
  normalizePaperRelations,
  normalizeResearchNodes,
  normalizeStageLedger,
  normalizeStageRunLedger,
  resolvePaperPublishedAt,
  syncLegacyBranchTree,
} from '../shared/research-graph'
import {
  normalizeDecisionMemoryFile,
  normalizeExecutionMemoryFile,
} from '../shared/research-memory'
import {
  buildProblemNodesFromTimelineContext,
  normalizeTimelineContext,
} from '../shared/timeline-context'
import {
  buildTopicDisplayEntry,
  createEmptyTopicDisplayCollection,
  upsertTopicDisplayEntry,
} from '../shared/topic-display'
import { loadCapabilityDefinitions, loadTopicDefaults, loadTopicDefinitions } from './index'
import type { TopicDefinition } from './schema'

type ExistingTopicMemory = Record<string, Record<string, unknown>>
type JsonRecord = Record<string, Record<string, unknown>>

const currentDir = __dirname
const repoRoot = path.resolve(currentDir, '..', '..')
const generatedRoot = path.join(repoRoot, 'generated-data', 'app-data')
const workflowRoot = path.join(generatedRoot, 'workflow')
const trackerContentRoot = path.join(generatedRoot, 'tracker-content')

const topicCatalogPath = path.join(workflowRoot, 'topic-catalog.json')
const topicMemoryPath = path.join(workflowRoot, 'topic-memory.json')
const topicDisplayPath = path.join(workflowRoot, 'topic-display.json')
const decisionMemoryPath = path.join(workflowRoot, 'decision-memory.json')
const executionMemoryPath = path.join(workflowRoot, 'execution-memory.json')
const capabilityLibraryPath = path.join(workflowRoot, 'capability-library.json')
const activeTopicsPath = path.join(workflowRoot, 'active-topics.json')
const paperCatalogPath = path.join(generatedRoot, 'paper-catalog.json')
const paperAssetsPath = path.join(generatedRoot, 'paper-assets.json')
const paperMetricsPath = path.join(generatedRoot, 'paper-metrics.json')
const paperEditorialPath = path.join(trackerContentRoot, 'paper-editorial.json')
const nodeEditorialPath = path.join(trackerContentRoot, 'node-editorial.json')
const topicEditorialPath = path.join(trackerContentRoot, 'topic-editorial.json')

function ensureDir(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath))
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, filePath)
}

function uniqueStrings(values: unknown, fallback: string[] = []) {
  if (!Array.isArray(values)) return [...fallback]
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function readExistingTopicMemory() {
  return readJsonFile<ExistingTopicMemory>(topicMemoryPath, {})
}

function readExistingPaperCatalog() {
  return readJsonFile<JsonRecord>(paperCatalogPath, {})
}

function readExistingPaperAssets() {
  return readJsonFile<JsonRecord>(paperAssetsPath, {})
}

function readExistingPaperMetrics() {
  return readJsonFile<JsonRecord>(paperMetricsPath, {})
}

function readExistingPaperEditorial() {
  return readJsonFile<JsonRecord>(paperEditorialPath, {})
}

function readExistingNodeEditorial() {
  return readJsonFile<JsonRecord>(nodeEditorialPath, {})
}

function readExistingTopicEditorial() {
  return readJsonFile<Array<Record<string, unknown>>>(topicEditorialPath, [])
}

function readExistingDecisionMemory() {
  if (!fs.existsSync(decisionMemoryPath)) {
    return {
      schemaVersion: 1,
      entries: [],
    }
  }

  return normalizeDecisionMemoryFile(readJsonFile(decisionMemoryPath, null))
}

function readExistingExecutionMemory() {
  if (!fs.existsSync(executionMemoryPath)) {
    return {
      schemaVersion: 1,
      skills: {},
    }
  }

  return normalizeExecutionMemoryFile(readJsonFile(executionMemoryPath, null))
}

function clearTrackerContentRoot() {
  ensureDir(trackerContentRoot)
  const resolvedTrackerRoot = path.resolve(trackerContentRoot)
  const resolvedGeneratedRoot = path.resolve(generatedRoot)
  if (!resolvedTrackerRoot.startsWith(resolvedGeneratedRoot)) {
    throw new Error(`Refusing to clear tracker-content outside generated-data: ${resolvedTrackerRoot}`)
  }

  for (const entry of fs.readdirSync(resolvedTrackerRoot, { withFileTypes: true })) {
    fs.rmSync(path.join(resolvedTrackerRoot, entry.name), {
      recursive: true,
      force: true,
    })
  }
}

function buildCatalogEntry(topic: TopicDefinition) {
  return {
    id: topic.id,
    nameZh: topic.nameZh,
    nameEn: topic.nameEn,
    focusLabel: topic.focusLabel,
    queryTags: topic.queryTags,
    problemPreference: topic.problemPreference,
    bootstrapWindowDays: topic.defaults.bootstrapWindowDays,
    expansionNote: topic.expansionNote,
    originPaperId: topic.origin.originPaperId,
    originConfirmedAt: topic.origin.originConfirmedAt,
    originConfirmationMode: topic.origin.originConfirmationMode,
    originQuestionDefinition: topic.origin.originQuestionDefinition,
    originWhyThisCounts: topic.origin.originWhyThisCounts,
    earlierRejectedCandidates: topic.origin.earlierRejectedCandidates,
    papers: topic.papers,
    frontendSummary: topic.frontendSummary,
    capabilityRefs: topic.capabilityRefs,
    defaults: topic.defaults,
  }
}

function buildOriginPaperCatalogEntry(topic: TopicDefinition, existingCatalog: JsonRecord) {
  const existing = existingCatalog[topic.origin.originPaperId] ?? {}
  const originReference =
    topic.papers.find((paper) => paper.id === topic.origin.originPaperId) ?? topic.papers[0]

  return {
    id: topic.origin.originPaperId,
    version:
      typeof existing.version === 'string'
        ? existing.version
        : originReference?.version ?? 'v1',
    title:
      typeof existing.title === 'string' && existing.title.trim().length > 0
        ? existing.title
        : topic.nameEn,
    summary:
      typeof existing.summary === 'string' && existing.summary.trim().length > 0
        ? existing.summary
        : topic.origin.originWhyThisCounts,
    published:
      typeof existing.published === 'string' && existing.published.trim().length > 0
        ? existing.published
        : `${topic.origin.originConfirmedAt}T00:00:00.000Z`,
    authors: Array.isArray(existing.authors) ? existing.authors : [],
    arxivUrl:
      typeof existing.arxivUrl === 'string' && existing.arxivUrl.trim().length > 0
        ? existing.arxivUrl
        : `https://arxiv.org/abs/${topic.origin.originPaperId}`,
    pdfUrl:
      typeof existing.pdfUrl === 'string' && existing.pdfUrl.trim().length > 0
        ? existing.pdfUrl
        : `https://arxiv.org/pdf/${topic.origin.originPaperId}.pdf`,
  }
}

function buildOriginOnlyPaperCatalog(topics: TopicDefinition[], existingCatalog: JsonRecord) {
  return Object.fromEntries(
    topics.map((topic) => [
      topic.origin.originPaperId,
      buildOriginPaperCatalogEntry(topic, existingCatalog),
    ]),
  ) as JsonRecord
}

function buildBaseTopicMemory(args: {
  topic: TopicDefinition
  paperCatalog: JsonRecord
}) {
  const now = new Date().toISOString()
  const timelineContext = normalizeTimelineContext(undefined, {
    topicId: args.topic.id,
    originPaperId: args.topic.origin.originPaperId,
    originQuestionDefinition: args.topic.origin.originQuestionDefinition,
    originWhyThisCounts: args.topic.origin.originWhyThisCounts,
    focusTags: [
      ...args.topic.queryTags.slice(0, 4),
      ...args.topic.problemPreference.slice(0, 4),
    ],
    capabilityRefs: args.topic.capabilityRefs,
    timestamp: now,
  })

  const originProblemId =
    timelineContext.problemSpace.nodes[0]?.id ?? `${args.topic.id}:origin-problem`
  const originBranchId = `branch:${args.topic.id}:origin`
  const originPublishedAt = resolvePaperPublishedAt(
    args.paperCatalog,
    args.topic.origin.originPaperId,
    now,
  )
  const originNodeId = createResearchNodeId({
    topicId: args.topic.id,
    stageIndex: 0,
    paperIds: [args.topic.origin.originPaperId],
  })

  const branchRegistry = [
    {
      branchId: originBranchId,
      rootProblemNodeId: originProblemId,
      parentBranchId: null,
      anchorPaperId: args.topic.origin.originPaperId,
      anchorPaperPublishedAt: originPublishedAt,
      lastTrackedPaperId: args.topic.origin.originPaperId,
      lastTrackedPublishedAt: originPublishedAt,
      stageIndex: 1,
      activeWindowMonths: 5,
      status: 'active' as const,
      priorityScore: 0.92,
      linkedProblemNodeIds: [originProblemId],
      mergedIntoBranchId: null,
      branchType: 'direct' as const,
      label: '源头主线',
      summary: '当前只保留起源论文，等待下一次 next-stage 动态发现。',
    },
  ]

  const paperRelations = [
    {
      paperId: args.topic.origin.originPaperId,
      nodeId: originNodeId,
      problemNodeIds: [originProblemId],
      branchIds: [originBranchId],
      primaryBranchId: originBranchId,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    },
  ]

  const researchNodes = [
    {
      nodeId: originNodeId,
      stageIndex: 0,
      paperIds: [args.topic.origin.originPaperId],
      primaryPaperId: args.topic.origin.originPaperId,
      sourceBranchIds: [originBranchId],
      sourceProblemNodeIds: [originProblemId],
      status: 'origin' as const,
      nodeLabel: '起源节点',
      nodeSummary: args.topic.origin.originWhyThisCounts,
      isMergeNode: false,
      provisional: false,
    },
  ]

  const topicMemory = {
    schemaVersion: 4,
    topicId: args.topic.id,
    timelineContext,
    originAudit: {
      passed: true,
      originPaperId: args.topic.origin.originPaperId,
      originConfirmedAt: args.topic.origin.originConfirmedAt,
      originConfirmationMode: args.topic.origin.originConfirmationMode,
      originQuestionDefinition: args.topic.origin.originQuestionDefinition,
      originWhyThisCounts: args.topic.origin.originWhyThisCounts,
      earlierRejectedCandidates: args.topic.origin.earlierRejectedCandidates,
    },
    publishedMainlinePaperIds: [args.topic.origin.originPaperId],
    publishedBranchPaperIds: [],
    candidatePaperIds: [],
    seedPaperIds: [],
    queryTags: args.topic.queryTags,
    capabilityRefs: args.topic.capabilityRefs,
    bootstrapWindowDays: args.topic.defaults.bootstrapWindowDays,
    windowPolicy: args.topic.defaults.windowPolicy,
    minStageWindowMonths: args.topic.defaults.minStageWindowMonths,
    maxStageWindowMonths: args.topic.defaults.maxStageWindowMonths,
    maxActiveBranches: args.topic.defaults.maxActiveBranches,
    branchModel: args.topic.defaults.branchModel,
    allowBranchMerge: args.topic.defaults.allowBranchMerge,
    expansionHistory: [
      {
        fromPaperId: args.topic.origin.originPaperId,
        windowDays: args.topic.defaults.bootstrapWindowDays,
        reason: '起源论文已确认，后续阶段将从这里继续动态发现。',
      },
    ],
    problemNodes: buildProblemNodesFromTimelineContext({
      topicId: args.topic.id,
      originPaperId: args.topic.origin.originPaperId,
      timelineContext,
      capabilityRefs: args.topic.capabilityRefs,
    }),
    branchTree: [],
    branchRegistry,
    stageLedger: [],
    stageRunLedger: [],
    researchNodes,
    provisionalNodes: [],
    paperRelations,
    recommendationQueue: [],
    decisionLog: [
      {
        id: `${args.topic.id}-origin-base`,
        timestamp: now,
        action: 'reset-origin-only',
        summary: '系统已回到起源态，等待后续 stage-first 动态发现。',
        affectedProblemIds: [originProblemId],
        affectedPaperIds: [args.topic.origin.originPaperId],
        rationale: '只保留主题与起源论文，后续候选必须通过运行时外部发现进入。',
      },
    ],
    lastBuiltAt: now,
    lastRewrittenAt: now,
  } as Record<string, unknown>

  topicMemory.branchTree = syncLegacyBranchTree({
    topicId: args.topic.id,
    topicMemory,
    branchRegistry,
    paperRelations,
  })

  return topicMemory
}

function mergeByKey<T extends object>(
  baseValues: T[],
  existingValues: T[],
  key: keyof T,
) {
  const byKey = new Map<string, T>()
  for (const value of [...baseValues, ...existingValues]) {
    const rawKey = value[key]
    const keyValue = typeof rawKey === 'string' ? rawKey : ''
    if (!keyValue) continue
    const previous = byKey.get(keyValue)
    byKey.set(keyValue, previous ? ({ ...previous, ...value } as T) : value)
  }
  return [...byKey.values()]
}

function ensureOriginRelation(args: {
  topic: TopicDefinition
  relations: ReturnType<typeof normalizePaperRelations>
}) {
  const originPaperId = args.topic.origin.originPaperId
  const originNodeId = createResearchNodeId({
    topicId: args.topic.id,
    stageIndex: 0,
    paperIds: [originPaperId],
  })
  const existing = args.relations.find((relation) => relation.paperId === originPaperId)
  if (existing) {
    return args.relations.map((relation) =>
      relation.paperId === originPaperId
        ? {
            ...relation,
            nodeId: relation.nodeId ?? originNodeId,
          }
        : relation,
    )
  }

  return [
    {
      paperId: originPaperId,
      nodeId: originNodeId,
      problemNodeIds: [`${args.topic.id}:origin-problem`],
      branchIds: [`branch:${args.topic.id}:origin`],
      primaryBranchId: `branch:${args.topic.id}:origin`,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    },
    ...args.relations,
  ]
}

function deriveStageRunLedger(args: {
  topicId: string
  stageLedger: ReturnType<typeof normalizeStageLedger>
  researchNodes: ReturnType<typeof normalizeResearchNodes>
}) {
  const grouped = new Map<number, Array<Record<string, unknown>>>()
  for (const entry of args.stageLedger) {
    const collection = grouped.get(entry.stageIndex) ?? []
    collection.push(entry as unknown as Record<string, unknown>)
    grouped.set(entry.stageIndex, collection)
  }

  return [...grouped.entries()].map(([stageIndex, entries]) => ({
    stageIndex,
    sourceBranchIds: uniqueStrings(entries.map((entry) => String(entry.branchId ?? ''))),
    sourceProblemNodeIds: [],
    sourceAnchorPaperIds: uniqueStrings(entries.map((entry) => String(entry.anchorPaperId ?? ''))),
    candidatePaperIds: uniqueStrings(
      entries.flatMap((entry) =>
        Array.isArray(entry.candidatePaperIds)
          ? (entry.candidatePaperIds as string[])
          : [],
      ),
    ),
    selectedNodeIds: args.researchNodes
      .filter((node) => node.stageIndex === stageIndex && !node.provisional)
      .map((node) => node.nodeId),
    provisionalNodeIds: args.researchNodes
      .filter((node) => node.stageIndex === stageIndex + 1 && node.provisional)
      .map((node) => node.nodeId),
    windowStart:
      entries
        .map((entry) => String(entry.windowStart ?? ''))
        .filter(Boolean)
        .sort()[0] ?? '',
    windowEnd:
      entries
        .map((entry) => String(entry.windowEnd ?? ''))
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? '',
    windowMonths:
      entries.reduce(
        (maxValue, entry) =>
          Math.max(maxValue, typeof entry.windowMonths === 'number' ? entry.windowMonths : 0),
        0,
      ) || 5,
    status: entries.some((entry) => entry.status === 'completed' || entry.status === 'merged')
      ? 'completed'
      : 'no-candidate',
    decisionSummary:
      entries
        .map((entry) => String(entry.decisionSummary ?? ''))
        .find((summary) => summary.trim().length > 0) ?? '',
    discoveryRounds: [],
    builtAt:
      entries
        .map((entry) => String(entry.builtAt ?? ''))
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? new Date().toISOString(),
  }))
}

function mergeTopicMemory(args: {
  topic: TopicDefinition
  baseTopicMemory: Record<string, unknown>
  existingTopicMemory: Record<string, unknown> | undefined
  paperCatalog: JsonRecord
}) {
  const existing = args.existingTopicMemory ?? {}
  const timelineContext = normalizeTimelineContext(existing.timelineContext, {
    topicId: args.topic.id,
    originPaperId: args.topic.origin.originPaperId,
    originQuestionDefinition: args.topic.origin.originQuestionDefinition,
    originWhyThisCounts: args.topic.origin.originWhyThisCounts,
    focusTags: [
      ...args.topic.queryTags.slice(0, 4),
      ...args.topic.problemPreference.slice(0, 4),
    ],
    capabilityRefs: args.topic.capabilityRefs,
    timestamp: new Date().toISOString(),
  })

  const branchRegistry = mergeByKey(
    normalizeBranchRegistry(args.baseTopicMemory.branchRegistry),
    normalizeBranchRegistry(existing.branchRegistry),
    'branchId',
  )
  const stageLedger = normalizeStageLedger(existing.stageLedger)
  const mergedPaperRelations = ensureOriginRelation({
    topic: args.topic,
    relations: mergeByKey(
      normalizePaperRelations(args.baseTopicMemory.paperRelations),
      normalizePaperRelations(existing.paperRelations),
      'paperId',
    ),
  })
  const derivedResearchNodes = buildResearchNodesFromStageLedger({
    topicId: args.topic.id,
    stageLedger,
    paperRelations: mergedPaperRelations,
  })
  const researchNodes = normalizeResearchNodes([
    ...normalizeResearchNodes(args.baseTopicMemory.researchNodes),
    ...normalizeResearchNodes(existing.researchNodes),
    ...derivedResearchNodes,
  ])
  const provisionalNodes = normalizeResearchNodes(existing.provisionalNodes)
  const stageRunLedger = normalizeStageRunLedger(existing.stageRunLedger)
  const normalizedStageRunLedger =
    stageRunLedger.length > 0
      ? stageRunLedger
      : normalizeStageRunLedger(
          deriveStageRunLedger({
            topicId: args.topic.id,
            stageLedger,
            researchNodes,
          }),
        )

  const problemNodes =
    Array.isArray(existing.problemNodes) && existing.problemNodes.length > 0
      ? (existing.problemNodes as Array<Record<string, unknown>>)
      : buildProblemNodesFromTimelineContext({
          topicId: args.topic.id,
          originPaperId: args.topic.origin.originPaperId,
          timelineContext,
          capabilityRefs: args.topic.capabilityRefs,
        })

  const publishedMainlinePaperIds = uniqueStrings(
    [
      args.topic.origin.originPaperId,
      ...uniqueStrings(existing.publishedMainlinePaperIds),
    ],
    [args.topic.origin.originPaperId],
  )
  const publishedBranchPaperIds = uniqueStrings(existing.publishedBranchPaperIds).filter(
    (paperId) => !publishedMainlinePaperIds.includes(paperId),
  )

  const mergedTopicMemory = {
    ...args.baseTopicMemory,
    ...existing,
    schemaVersion: 4,
    topicId: args.topic.id,
    timelineContext,
    originAudit: {
      ...(args.baseTopicMemory.originAudit as Record<string, unknown>),
      ...(typeof existing.originAudit === 'object' && existing.originAudit
        ? (existing.originAudit as Record<string, unknown>)
        : {}),
      originPaperId: args.topic.origin.originPaperId,
      originConfirmedAt: args.topic.origin.originConfirmedAt,
      originConfirmationMode: args.topic.origin.originConfirmationMode,
      originQuestionDefinition: args.topic.origin.originQuestionDefinition,
      originWhyThisCounts: args.topic.origin.originWhyThisCounts,
      earlierRejectedCandidates: args.topic.origin.earlierRejectedCandidates,
    },
    queryTags: args.topic.queryTags,
    capabilityRefs: args.topic.capabilityRefs,
    bootstrapWindowDays: args.topic.defaults.bootstrapWindowDays,
    windowPolicy: args.topic.defaults.windowPolicy,
    minStageWindowMonths: args.topic.defaults.minStageWindowMonths,
    maxStageWindowMonths: args.topic.defaults.maxStageWindowMonths,
    maxActiveBranches: args.topic.defaults.maxActiveBranches,
    branchModel: args.topic.defaults.branchModel,
    allowBranchMerge: args.topic.defaults.allowBranchMerge,
    publishedMainlinePaperIds,
    publishedBranchPaperIds,
    candidatePaperIds: uniqueStrings(existing.candidatePaperIds),
    seedPaperIds: [],
    problemNodes,
    branchRegistry,
    stageLedger,
    stageRunLedger: normalizedStageRunLedger,
    researchNodes,
    provisionalNodes,
    paperRelations: mergedPaperRelations,
    recommendationQueue:
      Array.isArray(existing.recommendationQueue) ? existing.recommendationQueue : [],
    decisionLog:
      Array.isArray(existing.decisionLog) && existing.decisionLog.length > 0
        ? existing.decisionLog
        : args.baseTopicMemory.decisionLog,
    lastBuiltAt:
      typeof existing.lastBuiltAt === 'string' && existing.lastBuiltAt.trim().length > 0
        ? existing.lastBuiltAt
        : String(args.baseTopicMemory.lastBuiltAt),
    lastRewrittenAt: new Date().toISOString(),
  } as Record<string, unknown>

  mergedTopicMemory.branchTree = syncLegacyBranchTree({
    topicId: args.topic.id,
    topicMemory: mergedTopicMemory,
    branchRegistry,
    paperRelations: mergedPaperRelations,
  })

  return mergedTopicMemory
}

function buildActiveTopics(topics: TopicDefinition[]) {
  return topics.map((topic, index) => ({
    topicId: topic.id,
    status: 'active',
    displayOrder: index,
    activatedAt: topic.origin.originConfirmedAt,
    archivedAt: null,
  }))
}

function buildTopicsWithDefaults() {
  const defaults = loadTopicDefaults()
  const capabilities = loadCapabilityDefinitions()
  const capabilityIds = new Set(capabilities.map((capability) => capability.id))
  const topics = loadTopicDefinitions().map((topic) => ({
    ...topic,
    defaults: {
      ...defaults,
      ...topic.defaults,
      preferredModels: {
        ...defaults.preferredModels,
        ...topic.defaults.preferredModels,
      },
    },
  }))

  const seen = new Set<string>()
  for (const topic of topics) {
    if (seen.has(topic.id)) {
      throw new Error(`Duplicate topic id found in topic-config: ${topic.id}`)
    }
    seen.add(topic.id)
    for (const capabilityRef of topic.capabilityRefs) {
      if (!capabilityIds.has(capabilityRef)) {
        throw new Error(`Topic ${topic.id} references unknown capability id: ${capabilityRef}`)
      }
    }
  }

  return {
    topics,
    capabilities,
  }
}

export interface CompileOptions {
  /** 安全模式：保留现有stage/content数据（默认true） */
  safeMode?: boolean
  /** 重置模式：清空所有数据回到起源态（危险操作） */
  resetOrigin?: boolean
  /** 只验证不写入 */
  validateOnly?: boolean
  /** 试运行模式：不实际写入文件 */
  dryRun?: boolean
}

export interface CompileResult {
  success: boolean
  warnings: string[]
  errors: string[]
  preserved?: {
    topicMemoryKeys: string[]
    paperCount: number
    nodeCount: number
  }
  written: boolean
  compiled?: ReturnType<typeof compileTopicsInternal>
}

function compileTopicsInternal(args?: { resetOrigin?: boolean }) {
  const resetOrigin = args?.resetOrigin === true
  const { topics, capabilities } = buildTopicsWithDefaults()
  const existingTopicMemory = resetOrigin ? {} : readExistingTopicMemory()
  const existingPaperCatalog = resetOrigin ? {} : readExistingPaperCatalog()
  const existingPaperAssets = resetOrigin ? {} : readExistingPaperAssets()
  const existingPaperMetrics = resetOrigin ? {} : readExistingPaperMetrics()
  const existingPaperEditorial = resetOrigin ? {} : readExistingPaperEditorial()
  const existingNodeEditorial = resetOrigin ? {} : readExistingNodeEditorial()
  const existingTopicEditorial = resetOrigin ? [] : readExistingTopicEditorial()
  const existingDecisionMemory = resetOrigin
    ? { schemaVersion: 1, entries: [] }
    : readExistingDecisionMemory()
  const existingExecutionMemory = resetOrigin
    ? { schemaVersion: 1, skills: {} }
    : readExistingExecutionMemory()

  const originOnlyPaperCatalog = buildOriginOnlyPaperCatalog(topics, existingPaperCatalog)
  const topicCatalog = {
    topics: topics.map(buildCatalogEntry),
  }

  const topicMemory = Object.fromEntries(
    topics.map((topic) => {
      const baseTopicMemory = buildBaseTopicMemory({
        topic,
        paperCatalog: originOnlyPaperCatalog,
      })

      return [
        topic.id,
        resetOrigin
          ? baseTopicMemory
          : mergeTopicMemory({
              topic,
              baseTopicMemory,
              existingTopicMemory: existingTopicMemory[topic.id],
              paperCatalog: {
                ...existingPaperCatalog,
                ...originOnlyPaperCatalog,
              },
            }),
      ]
    }),
  ) as Record<string, Record<string, unknown>>

  const paperCatalog = resetOrigin
    ? originOnlyPaperCatalog
    : ({
        ...existingPaperCatalog,
        ...originOnlyPaperCatalog,
      } as JsonRecord)

  const topicDisplay = topics.reduce((collection, topic) => {
    const topicEditorialEntry =
      existingTopicEditorial.find((entry) => entry.id === topic.id) ?? null
    return upsertTopicDisplayEntry(
      collection,
      buildTopicDisplayEntry({
        topicId: topic.id,
        nameZh: topic.nameZh,
        nameEn: topic.nameEn,
        focusLabel: topic.focusLabel,
        originPaperId: topic.origin.originPaperId,
        configuredPaperIds: topic.papers.map((paper) => paper.id),
        frontendSummary: topic.frontendSummary,
        topicMemory: topicMemory[topic.id],
        paperCatalog,
        paperEditorialStore: existingPaperEditorial,
        nodeEditorialStore: existingNodeEditorial,
        topicEditorialEntry,
      }),
    )
  }, createEmptyTopicDisplayCollection())

  return {
    topicCatalog,
    topicMemory,
    topicDisplay,
    capabilityLibrary: capabilities,
    activeTopics: buildActiveTopics(topics),
    decisionMemory: existingDecisionMemory,
    executionMemory: existingExecutionMemory,
    paperCatalog,
    paperAssets: resetOrigin ? {} : existingPaperAssets,
    paperMetrics: resetOrigin ? {} : existingPaperMetrics,
    paperEditorial: existingPaperEditorial,
    nodeEditorial: existingNodeEditorial,
    topicEditorial: existingTopicEditorial,
  }
}

/**
 * 安全编译主题配置
 * 默认安全模式，保留现有stage/content数据
 */
export function compileTopics(options: CompileOptions = {}): CompileResult {
  const {
    safeMode = true,
    resetOrigin = false,
    validateOnly = false,
    dryRun = false
  } = options

  const warnings: string[] = []
  const errors: string[] = []

  try {
    // 记录现有数据摘要（安全模式下）
    let preserved: CompileResult['preserved'] | undefined
    if (safeMode && !resetOrigin) {
      const existingTopicMemory = readExistingTopicMemory()
      const existingNodeEditorial = readExistingNodeEditorial()

      const nodeCount = Object.values(existingTopicMemory).reduce(
        (sum, tm) => sum + (Array.isArray((tm as Record<string, unknown>).researchNodes) ? ((tm as Record<string, unknown>).researchNodes as unknown[]).length : 0),
        0
      )

      preserved = {
        topicMemoryKeys: Object.keys(existingTopicMemory),
        paperCount: Object.keys(existingNodeEditorial).length,
        nodeCount
      }

      warnings.push(`安全模式：保留现有数据 - ${preserved.topicMemoryKeys.length}个主题, ${preserved.nodeCount}个节点`)
    }

    // 执行编译
    const compiled = compileTopicsInternal({ resetOrigin })

    // 验证结果
    const validation = validateCompiledData(compiled)
    errors.push(...validation.errors)
    warnings.push(...validation.warnings)

    if (errors.length > 0) {
      return {
        success: false,
        warnings,
        errors,
        preserved,
        written: false
      }
    }

    // 写入文件（非dryRun且非validateOnly时）
    let written = false
    if (!dryRun && !validateOnly) {
      writeCompiledOutput(compiled)
      written = true
      console.log(`✓ 主题编译完成${safeMode ? '（安全模式）' : ''}${resetOrigin ? '（重置模式）' : ''}`)
    } else {
      warnings.push(`${dryRun ? '试运行模式' : '验证模式'}：未实际写入文件`)
    }

    return {
      success: true,
      warnings,
      errors,
      preserved,
      written,
      compiled
    }

  } catch (error) {
    errors.push(`编译失败: ${error instanceof Error ? error.message : String(error)}`)
    return {
      success: false,
      warnings,
      errors,
      written: false
    }
  }
}

/**
 * 验证编译后的数据
 */
function validateCompiledData(compiled: ReturnType<typeof compileTopicsInternal>): {
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // 验证主题目录
  if (!compiled.topicCatalog?.topics || compiled.topicCatalog.topics.length === 0) {
    errors.push('主题目录为空')
  }

  // 验证主题记忆
  const topicIds = Object.keys(compiled.topicMemory)
  if (topicIds.length === 0) {
    errors.push('主题记忆为空')
  }

  // 验证每个主题的起源论文
  for (const [topicId, topicData] of Object.entries(compiled.topicMemory)) {
    const tm = topicData as Record<string, unknown>
    const originAudit = tm.originAudit as Record<string, unknown> | undefined
    if (!originAudit?.originPaperId) {
      errors.push(`主题 ${topicId} 缺少起源论文`)
    }
  }

  // 验证能力库
  if (!compiled.capabilityLibrary || compiled.capabilityLibrary.length === 0) {
    warnings.push('能力库为空')
  }

  return { errors, warnings }
}

function writeCompiledOutput(payload: ReturnType<typeof compileTopicsInternal>) {
  ensureDir(generatedRoot)
  ensureDir(workflowRoot)
  ensureDir(trackerContentRoot)
  writeJson(paperCatalogPath, payload.paperCatalog)
  writeJson(paperAssetsPath, payload.paperAssets)
  writeJson(paperMetricsPath, payload.paperMetrics)
  writeJson(paperEditorialPath, payload.paperEditorial)
  writeJson(nodeEditorialPath, payload.nodeEditorial)
  writeJson(topicEditorialPath, payload.topicEditorial)
  writeJson(topicCatalogPath, payload.topicCatalog)
  writeJson(topicMemoryPath, payload.topicMemory)
  writeJson(topicDisplayPath, payload.topicDisplay)
  writeJson(capabilityLibraryPath, payload.capabilityLibrary)
  writeJson(activeTopicsPath, payload.activeTopics)
  writeJson(decisionMemoryPath, payload.decisionMemory)
  writeJson(executionMemoryPath, payload.executionMemory)
}

/**
 * 安全编译主题（默认）
 * 保留现有stage/content数据
 */
export function writeCompiledTopics(options?: Omit<CompileOptions, 'resetOrigin'>) {
  const result = compileTopics({
    safeMode: true,
    resetOrigin: false,
    ...options
  })

  if (!result.success) {
    throw new Error(`编译失败: ${result.errors.join(', ')}`)
  }

  return result
}

/**
 * 重置到起源态（危险操作）
 * 清空所有数据，只保留起源论文
 */
export function writeResetOriginTopics(options?: Omit<CompileOptions, 'resetOrigin'>) {
  const result = compileTopics({
    safeMode: false,
    resetOrigin: true,
    ...options
  })

  if (!result.success) {
    throw new Error(`重置失败: ${result.errors.join(', ')}`)
  }

  // 清空tracker-content目录
  if (!options?.dryRun) {
    clearTrackerContentRoot()
  }

  return result
}

if (require.main === module) {
  const result = writeCompiledTopics()
  console.log('Safely compiled topic-config into canonical workflow data.')
  if (result.warnings.length > 0) {
    console.log('Warnings:', result.warnings.join('\n'))
  }
}
