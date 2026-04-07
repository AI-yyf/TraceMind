import capabilityLibraryJson from '@generated/workflow/capability-library.json'
import topicCatalogJson from '@generated/workflow/topic-catalog.json'
import topicMemoryJson from '@generated/workflow/topic-memory.json'
import paperAssets from '@generated/paper-assets.json'
import paperCatalog from '@generated/paper-catalog.json'
import paperMetrics from '@generated/paper-metrics.json'
import runtimePaperEditorialJson from '@generated/tracker-content/paper-editorial.json'
import runtimeTopicEditorialJson from '@generated/tracker-content/topic-editorial.json'
import type {
  BranchContext,
  BranchNode,
  CapabilityRef,
  CatalogTopic,
  PaperEditorialMap,
  PaperEditorialSeed,
  PaperSection,
  ProblemNode,
  ProblemTrace,
  RecommendationEntry,
  ResearchCandidate,
  SearchItem,
  TopicEditorialSeed,
  TopicCandidatePreview,
  TopicId,
  TopicMemory,
  TopicStage,
  TrackerPaper,
  TrackerTopic,
  TrackerNode,
  ResearchNode,
} from '@/types/tracker'
import {
  localizeFocusLabel,
} from '@/utils/researchCopy'
import { resolvePrimaryReadingRouteForPaper } from '@/utils/readingRoutes'

type CatalogEntry = {
  title: string
  summary: string
  published: string
  authors: string[]
  arxivUrl?: string
  pdfUrl?: string
}
type MetricsEntry = { citationCount: number | null; source: string; retrievedAt: string }
type AssetsEntry = {
  coverPath: string | null
  coverSource?: string | null
  figurePaths: string[]
}
type PaperCatalogCollection = { version: string; papers: Record<string, CatalogEntry> }
type PaperAssetsCollection = { version: string; papers: Record<string, AssetsEntry> }
type PaperMetricsCollection = { version: string; metrics: Record<string, MetricsEntry> }
type CapabilityLibraryCollection = {
  version: string
  capabilities: Array<{ id: string; name: string; description?: string }>
}
type TopicCatalogSeed = Omit<CatalogTopic, 'focusLabel'> & { focusLabel?: string }
type TopicCatalogCollection = { topics: TopicCatalogSeed[] }
type RawTopicMemory = Record<string, Record<string, unknown>>
type EditorialCollection<T> = { version: string; editorials: Record<string, T> }

const catalogRecord = ((paperCatalog as unknown as PaperCatalogCollection).papers ?? {}) as Record<string, CatalogEntry>
const metricsRecord = ((paperMetrics as unknown as PaperMetricsCollection).metrics ?? {}) as Record<string, MetricsEntry>
const assetsRecord = ((paperAssets as unknown as PaperAssetsCollection).papers ?? {}) as Record<string, AssetsEntry>
const capabilityLibrary = (
  (capabilityLibraryJson as unknown as CapabilityLibraryCollection).capabilities ?? []
).map((capability) => ({
  id: capability.id,
  name: capability.name,
  definition: capability.description ?? capability.name,
  mechanism: capability.description ?? capability.name,
  applicabilitySignals: [],
  antiSignals: [],
  typicalTradeoffs: [],
  relatedCapabilities: [],
})) as CapabilityRef[]
const capabilityMap = Object.fromEntries(capabilityLibrary.map((item) => [item.id, item])) as Record<string, CapabilityRef>
const topicCatalogSeeds = (topicCatalogJson as TopicCatalogCollection).topics
const rawTopicMemory = ((topicMemoryJson as unknown as { version: string; topics: RawTopicMemory }).topics ?? {}) as RawTopicMemory
const runtimePaperEditorial = (
  (runtimePaperEditorialJson as unknown as EditorialCollection<PaperEditorialSeed>).editorials ?? {}
) as PaperEditorialMap
const runtimeTopicEditorial = Object.values(
  (runtimeTopicEditorialJson as unknown as EditorialCollection<TopicEditorialSeed>).editorials ?? {},
) as TopicEditorialSeed[]

const mergedPaperEditorial: PaperEditorialMap = runtimePaperEditorial

const mergedTopicEditorial = Object.values(
  [...runtimeTopicEditorial].reduce<Record<string, TopicEditorialSeed>>((acc, item) => {
    const previous = acc[item.id] ?? {}
    acc[item.id] = {
      ...previous,
      ...item,
      entries:
        Array.isArray(previous.entries) || Array.isArray(item.entries)
          ? [
              ...((Array.isArray(previous.entries) ? previous.entries : []) as NonNullable<TopicEditorialSeed['entries']>),
              ...((Array.isArray(item.entries) ? item.entries : []) as NonNullable<TopicEditorialSeed['entries']>),
            ].filter(
              (entry, index, collection) =>
                collection.findIndex((candidate) => candidate.paperId === entry.paperId) === index,
            )
          : undefined,
    }
    return acc
  }, {}),
)

const editorialByTopicId = Object.fromEntries(mergedTopicEditorial.map((topic) => [topic.id, topic])) as Record<string, TopicEditorialSeed>

const topicCatalog = topicCatalogSeeds.map((seed) => ({
  ...seed,
  focusLabel: seed.focusLabel ?? '',
})) satisfies CatalogTopic[]

export const catalogTopicMap: Record<TopicId, CatalogTopic> = Object.fromEntries(
  topicCatalog.map((topic) => [topic.id, topic]),
) as Record<TopicId, CatalogTopic>

export { capabilityLibrary, capabilityMap, topicCatalog }

const paperMembership = new Map<
  string,
  Array<{
    topicId: TopicId
    status: TrackerPaper['status']
    role: string
  }>
>()

for (const topic of topicCatalog) {
  for (const paper of topic.papers) {
    const current = paperMembership.get(paper.id) ?? []
    current.push({
      topicId: topic.id,
      status: paper.status,
      role: paper.role,
    })
    paperMembership.set(paper.id, current)
  }
}

const papersById: Record<string, TrackerPaper> = Object.fromEntries(
  Object.entries(catalogRecord).map(([paperId, catalog]) => {
    const editorial = mergedPaperEditorial[paperId] as PaperEditorialSeed | undefined
    const metrics = metricsRecord[paperId]
    const assets = assetsRecord[paperId]
    const memberships = paperMembership.get(paperId) ?? []
    const status = editorial?.status ?? inferPaperStatus(memberships.map((item) => item.status))
    const topicIds = memberships.map((item) => item.topicId)
    const tags = editorial?.tags ?? []
    const titleZh = editorial?.titleZh ?? catalog.title
    const summary = catalog.summary ?? ''

    return [
      paperId,
      {
        id: paperId,
        title: catalog.title,
        titleZh,
        published: catalog.published,
        authors: catalog.authors,
        summary,
        arxivUrl: catalog.arxivUrl ?? '',
        pdfUrl: catalog.pdfUrl ?? '',
        citationCount: metrics?.citationCount ?? null,
        citationSource: metrics?.source ?? 'OpenAlex',
        citationRetrievedAt: metrics?.retrievedAt ?? '',
        coverPath: assets?.coverPath ?? null,
        coverSource: assets?.coverSource ?? null,
        figurePaths: assets?.figurePaths ?? [],
        topicIds,
        status,
        tags,
        highlight: editorial?.highlight ?? '',
        cardDigest: editorial?.cardDigest ?? buildCardDigest(summary, titleZh),
        timelineDigest: editorial?.timelineDigest ?? buildTimelineDigest(summary, titleZh),
        openingStandfirst:
          editorial?.openingStandfirst ??
          '这篇论文已经进入主题追踪，但尚未完成正式长文深写。当前页面保留论文摘要、证据资源与问题位置，供后续 skill 继续续写。',
        coverCaption:
          editorial?.coverCaption ??
          '当前封面仅用于保留论文入口与图像证据资源；正式长文完成后，这里会替换成对应的编辑性封面说明。',
        sections: asPaperSections(editorial?.sections),
        closingHandoff: asClosingHandoff(editorial?.closingHandoff),
        problemsOut: asProblemTraces(editorial?.problemsOut),
        problemTags: editorial?.problemTags ?? [],
        branchContext: asBranchContext(editorial?.branchContext),
        contentMode: editorial ? 'editorial' : 'seed',
        role: memberships[0]?.role ?? '',
      } satisfies TrackerPaper,
    ]
  }),
)

export const paperMap = papersById

const topicMemory = Object.fromEntries(
  topicCatalog.map((topic) => [topic.id, normalizeTopicMemory(topic, rawTopicMemory[topic.id] ?? {})]),
) as Record<TopicId, TopicMemory>

export const topicMemoryMap = topicMemory

const builtTopics: Array<TrackerTopic | null> = topicCatalog.map((catalogTopic) => {
  const editorial = editorialByTopicId[catalogTopic.id] ?? {
    id: catalogTopic.id,
    nameZh: catalogTopic.nameZh,
    nameEn: catalogTopic.nameEn,
    focusLabel: localizeFocusLabel(catalogTopic.focusLabel, catalogTopic.nameEn),
    summary: catalogTopic.frontendSummary?.researchBlurb ?? catalogTopic.expansionNote,
    timelineDigest: catalogTopic.frontendSummary?.timelineGuide ?? catalogTopic.expansionNote,
    editorialThesis: catalogTopic.frontendSummary?.cardSummary ?? catalogTopic.expansionNote,
    entries: [],
    originAudit: {
      originPaperId: catalogTopic.originPaperId,
      originConfirmedAt: catalogTopic.originConfirmedAt,
      originConfirmationMode: catalogTopic.originConfirmationMode,
      originQuestionDefinition: catalogTopic.originQuestionDefinition,
      originWhyThisCounts: catalogTopic.originWhyThisCounts,
      earlierRejectedCandidates: catalogTopic.earlierRejectedCandidates,
    },
  }

  const memory = topicMemory[catalogTopic.id]
  const publishedIds = memory.publishedMainlinePaperIds
    .concat(memory.publishedBranchPaperIds)
    .filter((paperId, index, collection) => collection.indexOf(paperId) === index)

  const papers = publishedIds
    .map((paperId) => papersById[paperId])
    .filter((paper): paper is TrackerPaper => Boolean(paper))
  const originPaper = papersById[catalogTopic.originPaperId]
  if (!originPaper) return null

  const stages = buildTopicStages(memory, papersById)
  const capabilityRefs = memory.capabilityRefs.map((id) => capabilityMap[id]).filter(Boolean)
  const summary =
    asOptionalString(editorial.summary) ??
    asOptionalString(editorial.editorialThesis) ??
    asOptionalString(editorial.timelineDigest) ??
    catalogTopic.expansionNote

  return {
    id: catalogTopic.id,
    nameZh: asOptionalString(editorial.nameZh) ?? catalogTopic.nameZh,
    nameEn: asOptionalString(editorial.nameEn) ?? catalogTopic.nameEn,
    focusLabel: localizeFocusLabel(asOptionalString(editorial.focusLabel) ?? catalogTopic.focusLabel, catalogTopic.nameEn),
    summary,
    timelineDigest: asOptionalString(editorial.timelineDigest) ?? summary,
    editorialThesis: asOptionalString(editorial.editorialThesis) ?? summary,
    entries: asTopicTimelineEntries(editorial.entries, papers),
    originAudit: normalizeTopicOriginAudit(catalogTopic, editorial.originAudit),
    papers,
    originPaper,
    catalog: catalogTopic,
    memory,
    capabilityRefs,
    stages,
    recommendationQueue: memory.recommendationQueue,
  } satisfies TrackerTopic
})

export const allTopics = builtTopics.filter((topic): topic is TrackerTopic => topic !== null)
export const topics = allTopics
export const topicMap: Record<TopicId, TrackerTopic> = Object.fromEntries(
  topics.map((topic) => [topic.id, topic]),
) as Record<TopicId, TrackerTopic>
export const allTopicMap = topicMap

export function buildSearchItems(selectedTopics: TrackerTopic[]) {
  const publishedPapers = selectedTopics.flatMap((topic) => topic.papers)
  const candidateEntries = selectedTopics.flatMap((topic) =>
    topic.stages.flatMap((stage) => [...stage.directCandidates, ...stage.transferCandidates].map((item) => ({ topic, item }))),
  )

  return [
    ...selectedTopics.map((topic) => ({
      id: `topic-${topic.id}`,
      kind: 'topic' as const,
      title: topic.nameZh,
      subtitle: topic.editorialThesis,
      href: `/topic/${topic.id}`,
      year: topic.originPaper.published.slice(0, 4),
      tags: topic.capabilityRefs.map((item) => item.name).slice(0, 4),
    })),
    ...publishedPapers.map((paper) => ({
      id: `paper-${paper.id}`,
      kind: 'paper' as const,
      title: paper.titleZh,
      subtitle: `${paper.title} · ${paper.timelineDigest}`,
      href: resolvePrimaryReadingRouteForPaper({
        paperId: paper.id,
        route: `/paper/${paper.id}${paper.topicIds[0] ? `?theme=${paper.topicIds[0]}` : ''}`,
        nodeRoute: (() => {
          const paperNode = getNodeByPaperId(paper.id)
          return paperNode ? `/node/${paperNode.nodeId}` : undefined
        })(),
        topicId: paper.topicIds[0],
      }),
      year: paper.published.slice(0, 4),
      tags: paper.tags,
    })),
    ...candidateEntries
      .filter((entry, index, collection) => {
        const key = `${entry.topic.id}:${entry.item.candidate.paperId}`
        return collection.findIndex((candidateEntry) => `${candidateEntry.topic.id}:${candidateEntry.item.candidate.paperId}` === key) === index
      })
      .map(({ topic, item }) => ({
        id: `candidate-${topic.id}-${item.candidate.paperId}`,
        kind: 'candidate' as const,
        title: item.paper?.titleZh ?? item.candidate.paperId,
        subtitle: item.candidate.whyThisCouldWork,
        href: `/topic/${topic.id}?workbench=assistant&focus=research`,
        year: item.paper?.published.slice(0, 4) ?? '',
        tags: item.capabilities.map((capability) => capability.name),
      })),
  ] satisfies SearchItem[]
}

export const searchItems = buildSearchItems(topics)

export function getTopicEntry(topicId: TopicId, paperId: string) {
  return topicMap[topicId]?.entries.find((entry) => entry.paperId === paperId) ?? null
}

// ========== 节点中心数据 (Node-Centric Data) ==========

/**
 * 获取所有主题的最新节点
 * 用于今日主题页
 */
export function getLatestNodesByTopic(date?: string): Record<string, TrackerNode> {
  const result: Record<string, TrackerNode> = {}
  const targetDate = date ? new Date(date) : new Date()
  
  for (const topic of topics) {
    // 获取该主题的最新节点
    const latestNode = getTopicLatestNode(topic.id, targetDate)
    if (latestNode) {
      result[topic.id] = latestNode
    }
  }
  
  return result
}

/**
 * 获取指定主题的最新节点
 */
export function getTopicLatestNode(topicId: TopicId, beforeDate: Date = new Date()): TrackerNode | null {
  const topic = topicMap[topicId]
  if (!topic) return null
  
  // 从 topic memory 中获取节点
  const memory = topicMemoryMap[topicId]
  if (!memory) return null
  
  // 查找最新的 canonical 节点
  const nodes = memory.researchNodes || []
  const validNodes = nodes.filter(
    (n): n is ResearchNode & { updatedAt: string } => 
      (n.status === 'canonical' || n.status === 'provisional') &&
      new Date(n.updatedAt || n.createdAt) <= beforeDate
  )
  
  if (validNodes.length === 0) return null
  
  // 按更新时间排序，取最新
  const latest = validNodes.sort(
    (a: ResearchNode & { updatedAt: string }, b: ResearchNode & { updatedAt: string }) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0]
  
  return buildTrackerNode(topic, latest)
}

/**
 * 构建 TrackerNode
 */
function buildTrackerNode(topic: TrackerTopic, node: ResearchNode): TrackerNode {
  const paperCount = node.paperIds?.length || 1
  const primaryPaper = paperMap[node.primaryPaperId]
  
  // 获取分支标签和颜色
  const sourceBranchLabels: string[] = []
  const sourceBranchColors: string[] = []
  
  for (const branchId of node.sourceBranchIds || []) {
    const branch = topic.memory.branchTree.find(b => b.id === branchId)
    if (branch) {
      sourceBranchLabels.push(branch.label || branchId)
      // 根据分支类型分配颜色
      const color = branch.branchType === 'transfer' ? '#f59e0b' : 
                    branch.branchType === 'merge' ? '#8b5cf6' : '#3b82f6'
      sourceBranchColors.push(color)
    }
  }
  
  return {
    nodeId: node.nodeId,
    topicId: topic.id,
    stageIndex: node.stageIndex,
    paperIds: node.paperIds || [node.primaryPaperId],
    primaryPaperId: node.primaryPaperId,
    paperCount,
    nodeLabel: node.nodeLabel || primaryPaper?.titleZh || '未命名节点',
    nodeSummary: node.nodeSummary || primaryPaper?.summary || '',
    status: node.status as TrackerNode['status'],
    sourceBranchIds: node.sourceBranchIds || [],
    sourceBranchLabels,
    sourceBranchColors,
    isMergeNode: node.isMergeNode || false,
    updatedAt: node.updatedAt,
    discoveredAt: node.discoveredAt,
    provisional: node.provisional || node.status === 'provisional'
  }
}

/**
 * 通过节点ID获取节点
 */
export function getNodeById(nodeId: string): TrackerNode | null {
  for (const topic of topics) {
    const memory = topicMemoryMap[topic.id]
    if (!memory) continue
    
    const node = memory.researchNodes?.find((n: ResearchNode) => n.nodeId === nodeId)
    if (node) {
      return buildTrackerNode(topic, node)
    }
  }
  return null
}

/**
 * 通过论文ID获取所属节点
 */
export function getNodeByPaperId(paperId: string): TrackerNode | null {
  for (const topic of topics) {
    const memory = topicMemoryMap[topic.id]
    if (!memory) continue
    
    const node = memory.researchNodes?.find(
      (n: ResearchNode) => n.paperIds?.includes(paperId) || n.primaryPaperId === paperId
    )
    if (node) {
      return buildTrackerNode(topic, node)
    }
  }
  return null
}

function buildTopicStages(
  memory: TopicMemory,
  papers: Record<string, TrackerPaper>,
) : TopicStage[] {
  return memory.problemNodes.map((problemNode, index) => {
    const directCandidates = buildCandidatePreviews(problemNode.directCandidates, papers)
    const transferCandidates = buildCandidatePreviews(problemNode.transferCandidates, papers)
    const mergeBranches = memory.branchTree.filter(
      (branch) => branch.rootProblemNodeId === problemNode.id && branch.status === 'merged',
    )

    return {
      id: problemNode.id,
      order: index,
      problemNode,
      parentPaper: papers[problemNode.parentPaperId] ?? null,
      activeBranchIds: problemNode.activeBranchIds,
      directCandidates,
      transferCandidates,
      selectedCandidate:
        directCandidates.find((item) => item.candidate.status === 'selected') ??
        transferCandidates.find((item) => item.candidate.status === 'selected') ??
        null,
      mergeBranches,
    } satisfies TopicStage
  })
}

function buildCandidatePreviews(
  candidates: ResearchCandidate[],
  papers: Record<string, TrackerPaper>,
) : TopicCandidatePreview[] {
  return candidates.map((candidate) => ({
    candidate,
    paper: papers[candidate.paperId] ?? null,
    sourceTopic: null,
    capabilities: candidate.supportedCapabilityIds.map((id) => capabilityMap[id]).filter(Boolean),
  })) satisfies TopicCandidatePreview[]
}

function normalizeTopicMemory(topic: CatalogTopic, rawMemory: Record<string, unknown>) {
  const isStructuredMemory =
    typeof rawMemory.schemaVersion === 'number' && rawMemory.schemaVersion >= 2 && Array.isArray(rawMemory.problemNodes)

  if (isStructuredMemory) {
    const publishedMainlinePaperIds = uniqueOrderedStrings([
      topic.originPaperId,
      ...asStringArray(rawMemory.publishedMainlinePaperIds, [topic.originPaperId]),
    ])
    const publishedBranchPaperIds = asStringArray(rawMemory.publishedBranchPaperIds, []).filter(
      (paperId) => !publishedMainlinePaperIds.includes(paperId),
    )
    const candidatePaperIds = asStringArray(
      rawMemory.candidatePaperIds,
      topic.papers.filter((paper) => paper.status !== 'published').map((paper) => paper.id),
    ).filter((paperId) => !publishedMainlinePaperIds.includes(paperId) && !publishedBranchPaperIds.includes(paperId))
    const seedPaperIds = asStringArray(
      rawMemory.seedPaperIds,
      topic.papers.filter((paper) => paper.status === 'seeded').map((paper) => paper.id),
    ).filter((paperId) => !publishedMainlinePaperIds.includes(paperId) && !publishedBranchPaperIds.includes(paperId))
    const minStageWindowMonths = clampNumber(asNumber(rawMemory.minStageWindowMonths, 2), 1, 12)
    const maxStageWindowMonths = clampNumber(
      asNumber(rawMemory.maxStageWindowMonths, 8),
      minStageWindowMonths,
      18,
    )
    const branchRegistry = asBranchRegistry(rawMemory.branchRegistry)
    const stageLedger = asStageLedger(rawMemory.stageLedger)
    const paperRelations = asPaperRelations(rawMemory.paperRelations)

    return {
      schemaVersion: asNumber(rawMemory.schemaVersion, 2),
      topicId: topic.id,
      timelineContext: isRecord(rawMemory.timelineContext) ? rawMemory.timelineContext : undefined,
      originAudit: normalizeOriginAudit(topic, rawMemory.originAudit as Record<string, unknown>),
      publishedMainlinePaperIds,
      publishedBranchPaperIds,
      candidatePaperIds,
      seedPaperIds,
      queryTags: asStringArray(rawMemory.queryTags, topic.queryTags),
      capabilityRefs: asStringArray(rawMemory.capabilityRefs, inferTopicCapabilities(topic.problemPreference)),
      bootstrapWindowDays: asNumber(rawMemory.bootstrapWindowDays, topic.bootstrapWindowDays),
      windowPolicy: rawMemory.windowPolicy === 'fixed' ? 'fixed' : 'auto',
      minStageWindowMonths,
      maxStageWindowMonths,
      maxActiveBranches: clampNumber(asNumber(rawMemory.maxActiveBranches, 10), 1, 20),
      branchModel: rawMemory.branchModel === 'problem-node-driven' ? 'problem-node-driven' : 'problem-node-driven',
      allowBranchMerge: rawMemory.allowBranchMerge === false ? false : true,
      expansionHistory: asExpansionHistory(rawMemory.expansionHistory, topic),
      problemNodes: asProblemNodes(rawMemory.problemNodes, topic),
      branchTree: asBranchNodes(rawMemory.branchTree, branchRegistry, paperRelations),
      branchRegistry,
      stageLedger,
      paperRelations,
      recommendationQueue: asRecommendationQueue(rawMemory.recommendationQueue),
      decisionLog: asDecisionLog(rawMemory.decisionLog),
      lastBuiltAt: asString(rawMemory.lastBuiltAt, new Date().toISOString()),
      lastRewrittenAt: asString(rawMemory.lastRewrittenAt, asString(rawMemory.lastBuiltAt, new Date().toISOString())),
    } satisfies TopicMemory
  }

  return migrateLegacyMemory(topic, rawMemory)
}

function migrateLegacyMemory(topic: CatalogTopic, rawMemory: Record<string, unknown>) {
  const legacyProblemGraph = (rawMemory.problemGraph as Record<string, Array<Record<string, unknown>>>) ?? {}
  const publishedMainlinePaperIds = asStringArray(rawMemory.publishedPaperIds, [topic.originPaperId])
  const seedPaperIds = asStringArray(
    rawMemory.seedPaperIds,
    topic.papers.filter((paper) => paper.status === 'seeded').map((paper) => paper.id),
  )
  const problemNodes = Object.entries(legacyProblemGraph).flatMap(([parentPaperId, problems], groupIndex) =>
    (problems ?? []).map((problem, index) => {
      const question = asString(problem.question, '待补全问题')
      const problemTags = asStringArray(problem.problemTags, [])
      const requiredCapabilities = inferRequiredCapabilities(problemTags.concat(topic.problemPreference))
      const nextCandidates = asStringArray(problem.nextCandidates, [])
      const selectedNextPaperId = asString(problem.selectedNextPaperId, nextCandidates[0] ?? '')

      return {
        id: asString(problem.id, `${topic.id}-problem-${groupIndex + 1}-${index + 1}`),
        stageTitle: question,
        stageDigest: asString(problem.whyThisPaperSolvesWhichProblem, '这一阶段围绕未解问题展开，并等待下一篇论文接手。'),
        question,
        problemConstraints: inferProblemConstraints(question, problemTags),
        requiredCapabilities,
        parentPaperId,
        parentProblemNodeId: null,
        directCandidates: nextCandidates.map((paperId, candidateIndex) =>
          buildCandidate({
            paperId,
            candidateType: 'direct',
            supportedProblemIds: [asString(problem.id, `${topic.id}-problem-${groupIndex + 1}-${index + 1}`)],
            supportedCapabilityIds: requiredCapabilities,
            whyThisCouldWork:
              paperId === selectedNextPaperId
                ? asString(problem.whyThisPaperSolvesWhichProblem, '它是当前问题最直接的承接候选。')
                : `它与“${question}”共享关键能力需求，因此仍保留为同题候选。`,
            requiredAssumptions: buildAssumptions(requiredCapabilities),
            expectedFailureModes: buildFailureModes(requiredCapabilities),
            noveltyVsMainline:
              candidateIndex === 0 ? '当前最直接的续写路径。' : '作为备选路径保留，用于和主干方案对照。',
            selectionScore: paperId === selectedNextPaperId ? 0.92 : Math.max(0.58, 0.78 - candidateIndex * 0.08),
            status: paperId === selectedNextPaperId ? 'selected' : 'watch',
            sourceTopicId: topic.id,
          }),
        ),
        transferCandidates: [],
        rejectedTransferCandidates: [],
        activeBranchIds: nextCandidates.map((paperId) => `branch:${topic.id}:${paperId}`),
        resolutionStatus: nextCandidates.length > 0 ? 'branched' : 'open',
        confidence: 0.72,
      } satisfies ProblemNode
    }),
  )

  const problemNodesWithTransfers = problemNodes.map((problemNode) => ({
    ...problemNode,
    transferCandidates: inferTransferCandidates(problemNode, topic),
  }))

  const branchTree = problemNodesWithTransfers.flatMap((problemNode) =>
    [...problemNode.directCandidates, ...problemNode.transferCandidates].map((candidate) =>
      buildBranchNode(problemNode, candidate),
    ),
  )

  const selectedProblemId = asStringArray((rawMemory.nextRecommendation as Record<string, unknown>)?.derivedFromProblemIds, [problemNodesWithTransfers[0]?.id ?? ''])[0]
  const selectedPaperId = asString((rawMemory.nextRecommendation as Record<string, unknown>)?.paperId, problemNodesWithTransfers[0]?.directCandidates[0]?.paperId ?? '')

  const recommendationQueue = buildRecommendationQueue(problemNodesWithTransfers, selectedProblemId, selectedPaperId)

  return {
    schemaVersion: 2,
    topicId: topic.id,
    timelineContext: undefined,
    originAudit: normalizeOriginAudit(topic, (rawMemory.originAudit as Record<string, unknown>) ?? {}),
    publishedMainlinePaperIds,
    publishedBranchPaperIds: [],
    candidatePaperIds: seedPaperIds
      .concat(problemNodesWithTransfers.flatMap((problemNode) => problemNode.transferCandidates.map((candidate) => candidate.paperId)))
      .filter((paperId, index, collection) => collection.indexOf(paperId) === index),
    seedPaperIds,
    queryTags: asStringArray(rawMemory.queryTags, topic.queryTags),
    capabilityRefs: inferTopicCapabilities(topic.problemPreference),
    bootstrapWindowDays: asNumber(rawMemory.bootstrapWindowDays, topic.bootstrapWindowDays),
    expansionHistory: asExpansionHistory(rawMemory.expansionHistory, topic),
    problemNodes: problemNodesWithTransfers,
    branchTree,
    recommendationQueue,
    decisionLog: [
      {
        id: `${topic.id}-migration-origin`,
        timestamp: new Date().toISOString(),
        action: 'migrate-origin-audit',
        summary: '源头审计迁移到 topic-memory v2。',
        affectedProblemIds: [],
        affectedPaperIds: [topic.originPaperId],
        rationale: '沿用既有源头审计结果，并将 skill 输入范围限制在主题内部。',
      },
      {
        id: `${topic.id}-migration-problems`,
        timestamp: new Date().toISOString(),
        action: 'migrate-problem-graph',
        summary: '旧 problemGraph 已迁移为问题节点与候选集合。',
        affectedProblemIds: problemNodesWithTransfers.map((problem) => problem.id),
        affectedPaperIds: seedPaperIds,
        rationale: '把单线 next recommendation 升级成问题树、候选和分支结构。',
      },
    ],
    lastBuiltAt: asString(rawMemory.lastBuiltAt, new Date().toISOString()),
    lastRewrittenAt: asString(rawMemory.lastBuiltAt, new Date().toISOString()),
  } satisfies TopicMemory
}

function normalizeOriginAudit(topic: CatalogTopic, rawOriginAudit: Record<string, unknown>) {
  return {
    passed: rawOriginAudit.passed === false ? false : true,
    originPaperId: asString(rawOriginAudit.originPaperId, topic.originPaperId),
    originConfirmedAt: asString(rawOriginAudit.originConfirmedAt, topic.originConfirmedAt),
    originConfirmationMode: 'earliest-representative' as const,
    originQuestionDefinition: asString(rawOriginAudit.originQuestionDefinition, topic.originQuestionDefinition),
    originWhyThisCounts: asString(rawOriginAudit.originWhyThisCounts, topic.originWhyThisCounts),
    earlierRejectedCandidates: (rawOriginAudit.earlierRejectedCandidates as CatalogTopic['earlierRejectedCandidates']) ?? topic.earlierRejectedCandidates,
    checkedWindow:
      (rawOriginAudit.checkedWindow as { beforeOriginFrom: string; beforeOriginTo: string } | undefined) ??
      inferCheckedWindow(topic.originPaperId, catalogRecord[topic.originPaperId]?.published ?? ''),
  }
}

function buildBranchNode(problemNode: ProblemNode, candidate: ResearchCandidate) {
  return {
    id: `branch:${problemNode.id}:${candidate.paperId}`,
    rootProblemNodeId: problemNode.id,
    label: candidate.candidateType === 'direct' ? '主干候选分支' : '迁移候选分支',
    branchType: candidate.candidateType === 'transfer' ? 'transfer' : 'direct',
    paperPath: [candidate.paperId],
    status: candidate.status === 'selected' ? 'branch_active' : 'candidate',
    summary: candidate.whyThisCouldWork,
    promotionPolicy: '当候选论文完成正式长文深写后，可晋级为主时间线或已成形分支。',
    mergeBackPolicy: '后续通过汇流章节解释该分支是否重写主干或保持并行路径。',
    supersededBy: null,
    rewriteImpact: candidate.candidateType === 'direct' ? '优先影响主时间线的下一阶段排序。' : '作为迁移路径挑战当前主线的单一路径假设。',
  } satisfies BranchNode
}

function buildRecommendationQueue(
  problemNodes: ProblemNode[],
  selectedProblemId: string,
  selectedPaperId: string,
): RecommendationEntry[] {
  const queue: RecommendationEntry[] = problemNodes.flatMap((problemNode) => {
    const candidates = [...problemNode.directCandidates, ...problemNode.transferCandidates]
    return candidates
      .filter((candidate) => candidate.status !== 'rejected')
      .map((candidate) => ({
        paperId: candidate.paperId,
        derivedFromProblemIds: [problemNode.id],
        candidateType: candidate.candidateType,
        why: candidate.whyThisCouldWork,
        confidence: candidate.selectionScore,
        status:
          candidate.paperId === selectedPaperId && problemNode.id === selectedProblemId
            ? 'selected'
            : candidate.status === 'selected'
              ? 'queued'
              : 'deferred',
      }))
  })

  return queue.sort((left, right) => right.confidence - left.confidence)
}

function inferTransferCandidates(problemNode: ProblemNode, topic: CatalogTopic) {
  const requiredCapabilities = problemNode.requiredCapabilities
  if (requiredCapabilities.length === 0) return []

  const currentTopicPaperIds = new Set(topic.papers.map((paper) => paper.id))
  const scoredCandidates = topicCatalog
    .filter((candidateTopic) => candidateTopic.id !== topic.id)
    .flatMap((candidateTopic) =>
      candidateTopic.papers.map((paper) => {
        const otherCapabilities = inferTopicCapabilities(candidateTopic.problemPreference)
        const shared = otherCapabilities.filter((capabilityId) => requiredCapabilities.includes(capabilityId))
        return {
          paper,
          candidateTopic,
          shared,
          score: shared.length / Math.max(requiredCapabilities.length, 1),
        }
      }),
    )
    .filter(({ paper, shared }) => shared.length > 0 && !currentTopicPaperIds.has(paper.id))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)

  return scoredCandidates.map(({ paper, candidateTopic, shared, score }) =>
    buildCandidate({
      paperId: paper.id,
      candidateType: 'transfer',
      supportedProblemIds: [problemNode.id],
      supportedCapabilityIds: shared,
      whyThisCouldWork: `${candidateTopic.nameZh} 主题中的这篇论文并非为当前问题而写，但它在 ${shared
        .map((capabilityId) => capabilityMap[capabilityId]?.name ?? capabilityId)
        .join('、')} 上提供了可迁移机制，可用来挑战主线的单一续写路径。`,
      requiredAssumptions: buildAssumptions(shared),
      expectedFailureModes: buildFailureModes(shared),
      noveltyVsMainline: `它来自 ${candidateTopic.nameZh} 主题，因此更适合作为迁移路径而非默认主干。`,
      selectionScore: Number(Math.min(0.86, 0.45 + score * 0.4).toFixed(2)),
      status: 'watch',
      sourceTopicId: candidateTopic.id,
    }),
  )
}

function buildCandidate(candidate: ResearchCandidate) {
  return candidate
}

function inferTopicCapabilities(problemPreference: string[]) {
  const matched = new Set<string>()
  for (const keyword of problemPreference) {
    const normalizedKeyword = keyword.toLowerCase()
    for (const capability of capabilityLibrary) {
      if (capability.applicabilitySignals.some((signal) => normalizedKeyword.includes(signal.toLowerCase()) || signal.toLowerCase().includes(normalizedKeyword))) {
        matched.add(capability.id)
      }
    }
  }
  return Array.from(matched)
}

function inferRequiredCapabilities(signals: string[]) {
  const matched = new Set<string>()
  for (const signal of signals) {
    const normalizedSignal = signal.toLowerCase()
    for (const capability of capabilityLibrary) {
      if (capability.applicabilitySignals.some((item) => normalizedSignal.includes(item.toLowerCase()) || item.toLowerCase().includes(normalizedSignal))) {
        matched.add(capability.id)
      }
    }
  }
  return Array.from(matched)
}

function inferProblemConstraints(question: string, tags: string[]) {
  const constraints = [`当前问题围绕“${question}”展开，不能脱离既有主题主线的定义边界。`]
  constraints.push(
    ...tags.slice(0, 2).map((tag) => `后续方法至少要回应“${tag}”这一机制要求，而不是只提升表面指标。`),
  )
  return constraints
}

function buildAssumptions(capabilityIds: string[]) {
  return capabilityIds.slice(0, 2).map((capabilityId) => {
    const capability = capabilityMap[capabilityId]
    return capability
      ? `当前主题能够满足“${capability.name}”迁移所需的数据、状态或反馈条件。`
      : '当前主题具备支持该候选迁移的最小训练与评估条件。'
  })
}

function buildFailureModes(capabilityIds: string[]) {
  return capabilityIds.slice(0, 2).map((capabilityId) => {
    const capability = capabilityMap[capabilityId]
    return capability
      ? `若 ${capability.name} 依赖的假设在当前主题里不成立，这条路径可能只改善局部环节而无法真正解决主问题。`
      : '候选机制可能只对表面指标有效，而不能真正消解问题本体。'
  })
}



function inferPaperStatus(statuses: TrackerPaper['status'][]) {
  if (statuses.includes('published')) return 'published'
  if (statuses.includes('seeded')) return 'seeded'
  return 'candidate'
}

function buildCardDigest(summary: string, _title: string) {
  return /[\u4e00-\u9fff]/.test(summary) ? truncate(summary, 72) : ''
}

function buildTimelineDigest(summary: string, _title: string) {
  return /[\u4e00-\u9fff]/.test(summary) ? truncate(summary, 96) : ''
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}...`
}

function asString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? uniqueOrderedStrings(value.filter((item): item is string => typeof item === 'string'))
    : uniqueOrderedStrings(fallback)
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function uniqueOrderedStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function safeDateString(value: unknown, fallback = '') {
  const text = asString(value, fallback)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString()
}

function compareDateStrings(left: string, right: string) {
  return (new Date(left).getTime() || 0) - (new Date(right).getTime() || 0)
}

function asExpansionHistory(value: unknown, topic: CatalogTopic) {
  if (Array.isArray(value)) {
    return value.filter((item): item is TopicMemory['expansionHistory'][number] => Boolean(item))
  }

  return [
    {
      fromPaperId: topic.originPaperId,
      windowDays: topic.bootstrapWindowDays,
      reason: topic.expansionNote,
    },
  ]
}

function asProblemNodes(value: unknown, topic: CatalogTopic) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is ProblemNode => Boolean(item))
    .map((problemNode, index) => ({
      ...problemNode,
      id: asString(problemNode.id, `${topic.id}-problem-${index + 1}`),
      stageTitle: asString(problemNode.stageTitle, asString(problemNode.question, `问题阶段 ${index + 1}`)),
      stageDigest: asString(problemNode.stageDigest, asString(problemNode.question, topic.expansionNote)),
      question: asString(problemNode.question, `待补全问题 ${index + 1}`),
      problemConstraints: asStringArray(problemNode.problemConstraints, []),
      requiredCapabilities: problemNode.requiredCapabilities?.length
        ? uniqueOrderedStrings(problemNode.requiredCapabilities)
        : inferTopicCapabilities(topic.problemPreference),
      activeBranchIds: asStringArray(problemNode.activeBranchIds, []),
      directCandidates: Array.isArray(problemNode.directCandidates) ? problemNode.directCandidates : [],
      transferCandidates: Array.isArray(problemNode.transferCandidates) ? problemNode.transferCandidates : [],
      rejectedTransferCandidates: Array.isArray(problemNode.rejectedTransferCandidates)
        ? problemNode.rejectedTransferCandidates
        : [],
      confidence: clampNumber(asNumber(problemNode.confidence, 0.6), 0, 1),
    }))
}

function mapBranchRegistryStatusToLegacyStatus(
  status: NonNullable<TopicMemory['branchRegistry']>[number]['status'],
): BranchNode['status'] {
  switch (status) {
    case 'merged':
      return 'merged'
    case 'resolved':
      return 'promoted_to_mainline'
    case 'dormant':
    case 'pending-review':
      return 'archived'
    case 'candidate':
      return 'candidate'
    default:
      return 'branch_active'
  }
}

function asBranchNodes(
  value: unknown,
  branchRegistry: NonNullable<TopicMemory['branchRegistry']>,
  paperRelations: NonNullable<TopicMemory['paperRelations']>,
) {
  if (Array.isArray(value) && value.length > 0) {
    const byId = new Map<string, BranchNode>()
    for (const item of value) {
      if (!isRecord(item)) continue
      const id = asString(item.id, '')
      if (!id) continue

      const branch: BranchNode = {
        id,
        rootProblemNodeId: asString(item.rootProblemNodeId, ''),
        label: asString(item.label, id.replace(/^branch:/, '')),
        branchType: item.branchType === 'transfer' ? 'transfer' : item.branchType === 'merge' ? 'merge' : 'direct',
        paperPath: asStringArray(item.paperPath, []),
        status:
          item.status === 'candidate' ||
          item.status === 'branch_active' ||
          item.status === 'promoted_to_mainline' ||
          item.status === 'merged' ||
          item.status === 'archived'
            ? item.status
            : 'candidate',
        summary: asString(item.summary, ''),
        promotionPolicy: asString(item.promotionPolicy, ''),
        mergeBackPolicy: asString(item.mergeBackPolicy, ''),
        supersededBy: asOptionalString(item.supersededBy) ?? null,
        rewriteImpact: asString(item.rewriteImpact, ''),
      }

      const previous = byId.get(id)
      byId.set(
        id,
        previous
          ? {
              ...branch,
              paperPath: uniqueOrderedStrings([...previous.paperPath, ...branch.paperPath]),
              summary: branch.summary || previous.summary,
              promotionPolicy: branch.promotionPolicy || previous.promotionPolicy,
              mergeBackPolicy: branch.mergeBackPolicy || previous.mergeBackPolicy,
              rewriteImpact: branch.rewriteImpact || previous.rewriteImpact,
            }
          : branch,
      )
    }

    return [...byId.values()]
  }

  return branchRegistry.map((branch) => ({
    id: branch.branchId,
    rootProblemNodeId: branch.rootProblemNodeId,
    label: branch.label ?? branch.branchId.replace(/^branch:/, ''),
    branchType:
      (branch.branchType === 'transfer'
        ? 'transfer'
        : branch.branchType === 'merge'
          ? 'merge'
          : 'direct') as BranchNode['branchType'],
    paperPath: uniqueOrderedStrings(
      paperRelations
        .filter((relation) => relation.branchIds.includes(branch.branchId))
        .map((relation) => relation.paperId),
    ),
    status: mapBranchRegistryStatusToLegacyStatus(branch.status),
    summary: branch.summary ?? '',
    promotionPolicy: '',
    mergeBackPolicy: '',
    supersededBy: branch.mergedIntoBranchId ?? null,
    rewriteImpact: '',
  }))
}

function asBranchRegistry(value: unknown) {
  if (!Array.isArray(value)) return []

  const byId = new Map<string, NonNullable<TopicMemory['branchRegistry']>[number]>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const branchId = asString(item.branchId, '')
    const rootProblemNodeId = asString(item.rootProblemNodeId, '')
    const anchorPaperId = asString(item.anchorPaperId, '')
    if (!branchId || !rootProblemNodeId || !anchorPaperId) continue

    const nextEntry: NonNullable<TopicMemory['branchRegistry']>[number] = {
      branchId,
      rootProblemNodeId,
      parentBranchId: asOptionalString(item.parentBranchId) ?? null,
      anchorPaperId,
      anchorPaperPublishedAt: safeDateString(item.anchorPaperPublishedAt, ''),
      lastTrackedPaperId: asString(item.lastTrackedPaperId, anchorPaperId),
      lastTrackedPublishedAt: safeDateString(item.lastTrackedPublishedAt, safeDateString(item.anchorPaperPublishedAt, '')),
      stageIndex: Math.max(1, Math.trunc(asNumber(item.stageIndex, 1))),
      activeWindowMonths: clampNumber(asNumber(item.activeWindowMonths, 2), 1, 18),
      status:
        item.status === 'active' ||
        item.status === 'candidate' ||
        item.status === 'merged' ||
        item.status === 'dormant' ||
        item.status === 'resolved' ||
        item.status === 'pending-review'
          ? item.status
          : 'active',
      priorityScore: clampNumber(asNumber(item.priorityScore, 0.5), 0, 1),
      linkedProblemNodeIds: asStringArray(item.linkedProblemNodeIds, []),
      mergedIntoBranchId: asOptionalString(item.mergedIntoBranchId) ?? null,
      branchType: item.branchType === 'transfer' || item.branchType === 'merge' ? item.branchType : 'direct',
      label: asOptionalString(item.label),
      summary: asOptionalString(item.summary),
    }

    const previous = byId.get(branchId)
    byId.set(
      branchId,
      previous
        ? {
            ...nextEntry,
            linkedProblemNodeIds: uniqueOrderedStrings([
              ...previous.linkedProblemNodeIds,
              ...nextEntry.linkedProblemNodeIds,
            ]),
            priorityScore: Math.max(previous.priorityScore, nextEntry.priorityScore),
            label: nextEntry.label ?? previous.label,
            summary: nextEntry.summary ?? previous.summary,
          }
        : nextEntry,
    )
  }

  return [...byId.values()].sort((left, right) => {
    return (
      left.stageIndex - right.stageIndex ||
      compareDateStrings(left.lastTrackedPublishedAt, right.lastTrackedPublishedAt)
    )
  })
}

function asStageLedger(value: unknown) {
  if (!Array.isArray(value)) return []

  const byKey = new Map<string, NonNullable<TopicMemory['stageLedger']>[number]>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const branchId = asString(item.branchId, '')
    if (!branchId) continue
    const stageIndex = Math.max(1, Math.trunc(asNumber(item.stageIndex, 1)))
    const key = `${branchId}:${stageIndex}`

    const nextEntry: NonNullable<TopicMemory['stageLedger']>[number] = {
      branchId,
      stageIndex,
      windowStart: safeDateString(item.windowStart, ''),
      windowEnd: safeDateString(item.windowEnd, ''),
      windowMonths: clampNumber(asNumber(item.windowMonths, 2), 1, 18),
      anchorPaperId: asString(item.anchorPaperId, ''),
      candidatePaperIds: asStringArray(item.candidatePaperIds, []),
      selectedPaperId: asOptionalString(item.selectedPaperId) ?? null,
      status:
        item.status === 'completed' ||
        item.status === 'no-candidate' ||
        item.status === 'merged' ||
        item.status === 'skipped'
          ? item.status
          : 'planned',
      decisionSummary: asString(item.decisionSummary, ''),
      mergeEvents: Array.isArray(item.mergeEvents)
        ? item.mergeEvents
            .filter(isRecord)
            .map((mergeEvent) => ({
              paperId: asString(mergeEvent.paperId, ''),
              mergedBranchIds: asStringArray(mergeEvent.mergedBranchIds, []),
            }))
            .filter((mergeEvent) => mergeEvent.paperId.length > 0)
        : [],
      builtAt: safeDateString(item.builtAt, ''),
    }

    const previous = byKey.get(key)
    byKey.set(
      key,
      previous
        ? {
            ...nextEntry,
            candidatePaperIds: uniqueOrderedStrings([
              ...previous.candidatePaperIds,
              ...nextEntry.candidatePaperIds,
            ]),
            mergeEvents: uniqueMergeEvents([...previous.mergeEvents, ...nextEntry.mergeEvents]),
            selectedPaperId: nextEntry.selectedPaperId ?? previous.selectedPaperId ?? null,
            decisionSummary: nextEntry.decisionSummary || previous.decisionSummary,
          }
        : nextEntry,
    )
  }

  return [...byKey.values()].sort((left, right) => {
    return compareDateStrings(left.windowStart, right.windowStart) || left.stageIndex - right.stageIndex
  })
}

function uniqueMergeEvents(events: NonNullable<TopicMemory['stageLedger']>[number]['mergeEvents']) {
  const byPaperId = new Map<string, NonNullable<TopicMemory['stageLedger']>[number]['mergeEvents'][number]>()
  for (const event of events) {
    const previous = byPaperId.get(event.paperId)
    byPaperId.set(event.paperId, {
      paperId: event.paperId,
      mergedBranchIds: uniqueOrderedStrings([
        ...(previous?.mergedBranchIds ?? []),
        ...event.mergedBranchIds,
      ]),
    })
  }
  return [...byPaperId.values()]
}

function asPaperRelations(value: unknown) {
  if (!Array.isArray(value)) return []

  const byPaperId = new Map<string, NonNullable<TopicMemory['paperRelations']>[number]>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const paperId = asString(item.paperId, '')
    if (!paperId) continue

    const nextEntry: NonNullable<TopicMemory['paperRelations']>[number] = {
      paperId,
      problemNodeIds: asStringArray(item.problemNodeIds, []),
      branchIds: asStringArray(item.branchIds, []),
      primaryBranchId: asString(item.primaryBranchId, asStringArray(item.branchIds, [])[0] ?? 'main'),
      isMergePaper: item.isMergePaper === true,
      mergedBranchIds: asStringArray(item.mergedBranchIds, []),
      resolvedProblemIds: asStringArray(item.resolvedProblemIds, []),
    }

    const previous = byPaperId.get(paperId)
    byPaperId.set(
      paperId,
      previous
        ? {
            paperId,
            problemNodeIds: uniqueOrderedStrings([
              ...previous.problemNodeIds,
              ...nextEntry.problemNodeIds,
            ]),
            branchIds: uniqueOrderedStrings([
              ...previous.branchIds,
              ...nextEntry.branchIds,
            ]),
            primaryBranchId: nextEntry.primaryBranchId || previous.primaryBranchId,
            isMergePaper: previous.isMergePaper || nextEntry.isMergePaper,
            mergedBranchIds: uniqueOrderedStrings([
              ...previous.mergedBranchIds,
              ...nextEntry.mergedBranchIds,
            ]),
            resolvedProblemIds: uniqueOrderedStrings([
              ...previous.resolvedProblemIds,
              ...nextEntry.resolvedProblemIds,
            ]),
          }
        : nextEntry,
    )
  }

  return [...byPaperId.values()]
}

function asRecommendationQueue(value: unknown) {
  if (!Array.isArray(value)) return []

  const byKey = new Map<string, RecommendationEntry>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const paperId = asString(item.paperId, '')
    if (!paperId) continue
    const branchId = asOptionalString(item.branchId)
    const stageIndex = typeof item.stageIndex === 'number' ? Math.max(1, Math.trunc(item.stageIndex)) : undefined
    const key = `${paperId}:${branchId ?? 'global'}:${stageIndex ?? 0}`
    byKey.set(key, {
      paperId,
      derivedFromProblemIds: asStringArray(item.derivedFromProblemIds, []),
      candidateType:
        item.candidateType === 'branch' || item.candidateType === 'transfer' ? item.candidateType : 'direct',
      why: asString(item.why, ''),
      confidence: clampNumber(asNumber(item.confidence, 0.5), 0, 1),
      status: item.status === 'selected' || item.status === 'deferred' ? item.status : 'queued',
      ...(branchId ? { branchId } : {}),
      ...(stageIndex ? { stageIndex } : {}),
      ...(Array.isArray(item.mergeTargetBranchIds)
        ? { mergeTargetBranchIds: asStringArray(item.mergeTargetBranchIds, []) }
        : {}),
    })
  }

  return [...byKey.values()].sort((left, right) => right.confidence - left.confidence)
}

function asDecisionLog(value: unknown) {
  if (!Array.isArray(value)) return []

  const byId = new Map<string, TopicMemory['decisionLog'][number]>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const id = asString(item.id, '')
    if (!id) continue
    byId.set(id, {
      id,
      timestamp: safeDateString(item.timestamp, new Date(0).toISOString()),
      action: asString(item.action, 'decision'),
      summary: asString(item.summary, ''),
      affectedProblemIds: asStringArray(item.affectedProblemIds, []),
      affectedPaperIds: asStringArray(item.affectedPaperIds, []),
      rationale: asString(item.rationale, ''),
      ...(typeof item.branchId === 'string' ? { branchId: item.branchId } : {}),
      ...(typeof item.stageIndex === 'number' ? { stageIndex: Math.max(1, Math.trunc(item.stageIndex)) } : {}),
      ...(typeof item.windowMonths === 'number' ? { windowMonths: Math.max(1, Math.trunc(item.windowMonths)) } : {}),
      ...(typeof item.selectedPaperId === 'string' ? { selectedPaperId: item.selectedPaperId } : {}),
      ...(Array.isArray(item.deferredPaperIds) ? { deferredPaperIds: asStringArray(item.deferredPaperIds, []) } : {}),
      ...(Array.isArray(item.resolvedProblemIds) ? { resolvedProblemIds: asStringArray(item.resolvedProblemIds, []) } : {}),
      ...(Array.isArray(item.mergeTargetBranchIds)
        ? { mergeTargetBranchIds: asStringArray(item.mergeTargetBranchIds, []) }
        : {}),
      ...(typeof item.actionKind === 'string' ? { actionKind: item.actionKind } : {}),
    })
  }

  return [...byId.values()].sort((left, right) => compareDateStrings(left.timestamp, right.timestamp))
}

function asPaperSections(value: unknown): PaperSection[] {
  if (!Array.isArray(value)) return []
  return value.filter(isPaperSection)
}

function isPaperSection(value: unknown): value is PaperSection {
  if (!value || typeof value !== 'object') return false
  const section = value as Record<string, unknown>
  return (
    typeof section.id === 'string' &&
    typeof section.sourceSectionTitle === 'string' &&
    typeof section.editorialTitle === 'string' &&
    Array.isArray(section.paragraphs) &&
    Array.isArray(section.evidence)
  )
}

function asClosingHandoff(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const question = asOptionalString(record.question)
      const whyItMatters = asOptionalString(record.whyItMatters)
      if (!question) return null
      return whyItMatters ? `${question} ${whyItMatters}` : question
    })
    .filter((item): item is string => Boolean(item))
}

function asProblemTraces(value: unknown): ProblemTrace[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is ProblemTrace => {
    if (!item || typeof item !== 'object') return false
    const problem = item as Record<string, unknown>
    return typeof problem.id === 'string' && typeof problem.question === 'string' && typeof problem.whyItMatters === 'string'
  })
}

function asBranchContext(value: unknown): BranchContext {
  if (!value || typeof value !== 'object') {
    return {
      branchId: null,
      branchLabel: null,
      stageIndex: null,
      problemNodeIds: [],
      isMergePaper: false,
      mergedBranchIds: [],
    }
  }

  const record = value as Record<string, unknown>

  return {
    branchId: typeof record.branchId === 'string' ? record.branchId : null,
    branchLabel: typeof record.branchLabel === 'string' ? record.branchLabel : null,
    stageIndex: typeof record.stageIndex === 'number' ? Math.max(1, Math.trunc(record.stageIndex)) : null,
    problemNodeIds: asStringArray(record.problemNodeIds, []),
    isMergePaper: record.isMergePaper === true,
    mergedBranchIds: asStringArray(record.mergedBranchIds, []),
  }
}

function asTopicTimelineEntries(value: unknown, papers: TrackerPaper[]) {
  if (Array.isArray(value)) {
    const entries = value.filter((item): item is TrackerTopic['entries'][number] => {
      if (!item || typeof item !== 'object') return false
      const entry = item as Record<string, unknown>
      return typeof entry.paperId === 'string' && typeof entry.context === 'string'
    })
    if (entries.length > 0) {
      return entries.filter(
        (entry, index, collection) =>
          collection.findIndex((candidate) => candidate.paperId === entry.paperId) === index,
      )
    }
  }

  return papers.map((paper) => ({
    paperId: paper.id,
    context: paper.timelineDigest || paper.cardDigest || paper.summary,
  }))
}

function normalizeTopicOriginAudit(topic: CatalogTopic, originAudit: unknown) {
  if (originAudit && typeof originAudit === 'object') {
    const parsed = originAudit as Record<string, unknown>
    if (
      typeof parsed.originPaperId === 'string' &&
      typeof parsed.originConfirmedAt === 'string' &&
      typeof parsed.originQuestionDefinition === 'string' &&
      typeof parsed.originWhyThisCounts === 'string' &&
      Array.isArray(parsed.earlierRejectedCandidates)
    ) {
      return {
        originPaperId: parsed.originPaperId,
        originConfirmedAt: parsed.originConfirmedAt,
        originConfirmationMode: 'earliest-representative' as const,
        originQuestionDefinition: parsed.originQuestionDefinition,
        originWhyThisCounts: parsed.originWhyThisCounts,
        earlierRejectedCandidates: parsed.earlierRejectedCandidates as CatalogTopic['earlierRejectedCandidates'],
      }
    }
  }

  return {
    originPaperId: topic.originPaperId,
    originConfirmedAt: topic.originConfirmedAt,
    originConfirmationMode: 'earliest-representative' as const,
    originQuestionDefinition: topic.originQuestionDefinition,
    originWhyThisCounts: topic.originWhyThisCounts,
    earlierRejectedCandidates: topic.earlierRejectedCandidates,
  }
}

function inferCheckedWindow(originPaperId: string, published: string) {
  const year = published ? published.slice(0, 4) : ''
  if (originPaperId === '1604.07316') {
    return { beforeOriginFrom: '2015-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  if (originPaperId === '1706.03762') {
    return { beforeOriginFrom: '2014-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  if (originPaperId === '1803.08554') {
    return { beforeOriginFrom: '2002-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  if (originPaperId === '2204.01691' || originPaperId === '2210.03629') {
    return { beforeOriginFrom: '2021-01-01', beforeOriginTo: published.slice(0, 10) }
  }
  return { beforeOriginFrom: `${year || '2010'}-01-01`, beforeOriginTo: published.slice(0, 10) }
}

/**
 * 获取指定主题的所有节点
 */
export function getTopicNodes(topicId: TopicId): TrackerNode[] {
  const topic = topicMap[topicId]
  if (!topic) return []

  const memory = topicMemoryMap[topicId]
  if (!memory) return []

  const nodes = memory.researchNodes || []
  return nodes
    .filter((n): n is ResearchNode => n.status === 'canonical' || n.status === 'provisional')
    .map((node) => buildTrackerNode(topic, node))
    .sort((a, b) => a.stageIndex - b.stageIndex || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * 通过论文ID获取论文记录
 */
export function getPaperRecord(paperId: string): TrackerPaper | null {
  return paperMap[paperId] || null
}
