import { buildExecutionMemoryChange } from '../shared/memory'

import {
  asRecord,
  asString,
  asStringArray,
  buildFallbackBranchRegistry,
  buildFallbackPaperRelations,
  normalizeBranchingDefaults,
  normalizeStageLedger,
  resolveMainlineBranchId,
} from '../../../shared/research-graph'
import { buildTopicDisplayEntry, upsertTopicDisplayEntry } from '../../../shared/topic-display'

import type {
  SkillArtifactChange,
  SkillContextSnapshot,
  SkillExecutionRequest,
} from '../../../engine/contracts'

export async function executeTopicVisualizer(args: {
  request: SkillExecutionRequest
  context: SkillContextSnapshot
}) {
  const topic = args.context.topic
  const topicMemory = asRecord(args.context.topicMemory)
  const workflowTopicMemory = args.context.workflowTopicMemory ?? {}
  const topicDisplayStore = {
    schemaVersion: args.context.topicDisplayStore?.schemaVersion ?? 1,
    topics: args.context.topicDisplayStore?.topics ?? [],
  }
  const paperCatalog = (args.context.paperCatalog ?? {}) as Record<string, Record<string, unknown>>
  if (!topic || !topicMemory) {
    throw new Error('topic-visualizer 需要合法的 topicId 和 canonical 主题记忆。')
  }

  const defaults = normalizeBranchingDefaults(topic.defaults as Record<string, unknown> | undefined)
  const branchRegistry = buildFallbackBranchRegistry({
    topicId: topic.id,
    topicOriginPaperId: topic.originPaperId,
    topicDefaults: defaults,
    topicMemory,
    paperCatalog,
  })
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: topic.id,
    branchRegistry,
  })
  const stageLedger = normalizeStageLedger(topicMemory.stageLedger)
  const paperRelations = buildFallbackPaperRelations({
    topicId: topic.id,
    topicMemory,
    branchRegistry,
  })
  const problemNodes = Array.isArray(topicMemory.problemNodes)
    ? (topicMemory.problemNodes as Array<Record<string, unknown>>)
    : []
  const requestedPaperIds = Array.isArray(args.request.input.paperIds)
    ? (args.request.input.paperIds as unknown[]).filter((item): item is string => typeof item === 'string')
    : []
  const allPaperIds = Array.from(
    new Set([
      ...asStringArray(topicMemory.publishedMainlinePaperIds),
      ...asStringArray(topicMemory.publishedBranchPaperIds),
      ...asStringArray(topicMemory.candidatePaperIds),
      ...paperRelations.map((entry) => entry.paperId),
    ]),
  )
  const scopedPaperIds = requestedPaperIds.length > 0 ? requestedPaperIds : allPaperIds
  const paperRelationMap = new Map(paperRelations.map((entry) => [entry.paperId, entry]))
  const problemMap = new Map(problemNodes.map((problemNode) => [asString(problemNode.id, ''), problemNode]))

  const rails = branchRegistry.map((branch) => ({
    id: branch.branchId,
    name: branch.label || branch.branchId,
    type: branch.branchType === 'transfer' ? 'inspiration-branch' : branch.branchType === 'merge' ? 'merge-branch' : 'problem-branch',
    status: branch.status,
    parentBranchId: branch.parentBranchId,
    rootProblemNodeId: branch.rootProblemNodeId,
    activeWindowMonths: branch.activeWindowMonths,
    stageIndex: branch.stageIndex,
    linkedProblemNodeIds: branch.linkedProblemNodeIds,
  }))

  const nodes = scopedPaperIds.map((paperId) => {
    const paper = paperCatalog[paperId] ?? {}
    const relation = paperRelationMap.get(paperId)
    const linkedQuestions = (relation?.problemNodeIds ?? [])
      .map((problemNodeId) => asString(problemMap.get(problemNodeId)?.question, ''))
      .filter(Boolean)
    return {
      id: `node:${paperId}`,
      paperId,
      title: String(paper.title ?? paperId),
      date: String(paper.published ?? ''),
      branchIds: relation?.branchIds ?? [mainlineBranchId],
      primaryBranchId: relation?.primaryBranchId ?? mainlineBranchId,
      problemNodeIds: relation?.problemNodeIds ?? [],
      problemLabel: linkedQuestions[0] ?? topic.problemPreference[0] ?? '',
      isOrigin: paperId === topic.originPaperId,
      isConvergence: relation?.isMergePaper ?? false,
      mergedBranchIds: relation?.mergedBranchIds ?? [],
      resolvedProblemIds: relation?.resolvedProblemIds ?? [],
    }
  })

  const stageWindows = stageLedger
    .filter((entry) => branchRegistry.some((branch) => branch.branchId === entry.branchId))
    .map((entry) => ({
      branchId: entry.branchId,
      stageIndex: entry.stageIndex,
      windowStart: entry.windowStart,
      windowEnd: entry.windowEnd,
      windowMonths: entry.windowMonths,
      candidatePaperIds: entry.candidatePaperIds,
      selectedPaperId: entry.selectedPaperId ?? null,
      status: entry.status,
      decisionSummary: entry.decisionSummary,
      builtAt: entry.builtAt,
    }))

  const mergeEvents = stageLedger.flatMap((entry) =>
    entry.mergeEvents.map((mergeEvent) => ({
      branchId: entry.branchId,
      stageIndex: entry.stageIndex,
      paperId: mergeEvent.paperId,
      mergedBranchIds: mergeEvent.mergedBranchIds,
      mergedIntoBranchId: entry.branchId,
    })),
  )

  const citationGraph = {
    nodes: nodes.map((node) => ({
      id: `graph:${node.paperId}`,
      paperId: node.paperId,
      title: node.title,
      year: Number(node.date.slice(0, 4)) || 0,
      branchIds: node.branchIds,
      isOrigin: node.isOrigin,
      isMergePaper: node.isConvergence,
    })),
    edges: stageLedger.flatMap((entry) => {
      if (!entry.selectedPaperId) return []
      return [
        {
          source: entry.anchorPaperId,
          target: entry.selectedPaperId,
          type: 'extends',
          strength: 0.85,
          branchId: entry.branchId,
        },
        ...entry.mergeEvents.flatMap((mergeEvent) =>
          mergeEvent.mergedBranchIds.map((mergedBranchId) => ({
            source: mergedBranchId,
            target: mergeEvent.paperId,
            type: 'merge',
            strength: 0.7,
            branchId: entry.branchId,
          })),
        ),
      ]
    }),
  }

  const convergences = nodes
    .filter((node) => node.isConvergence)
    .map((node) => ({
      paperId: node.paperId,
      date: node.date || topicMemory.lastBuiltAt || new Date().toISOString(),
      sourceBranches: node.mergedBranchIds,
      mergedFrom: node.problemNodeIds,
    }))

  const topicStats = {
    publishedPaperCount:
      asStringArray(topicMemory.publishedMainlinePaperIds).length +
      asStringArray(topicMemory.publishedBranchPaperIds).length,
    candidatePaperCount: asStringArray(topicMemory.candidatePaperIds).length,
    openProblemCount: problemNodes.filter((problemNode) => asString(problemNode.resolutionStatus, 'open') !== 'resolved').length,
    activeBranchCount: branchRegistry.filter((branch) => branch.status === 'active' || branch.status === 'candidate').length,
    dormantBranchCount: branchRegistry.filter((branch) => branch.status === 'dormant' || branch.status === 'pending-review').length,
    mergeEventCount: mergeEvents.length,
  }

  const nextTopicMemory = structuredClone(workflowTopicMemory)
  nextTopicMemory[topic.id] = {
    ...topicMemory,
    lastBuiltAt: new Date().toISOString(),
  }
  const topicEditorialEntry =
    Array.isArray(args.context.topicEditorialStore)
      ? args.context.topicEditorialStore.find((entry) => entry.id === topic.id) ?? null
      : null
  const topicDisplayPatch = buildTopicDisplayEntry({
    topicId: topic.id,
    nameZh: topic.nameZh,
    nameEn: topic.nameEn,
    focusLabel: topic.focusLabel,
    originPaperId: topic.originPaperId,
    frontendSummary: topic.frontendSummary,
    topicMemory: nextTopicMemory[topic.id],
    paperCatalog,
    paperEditorialStore:
      (args.context.paperEditorialStore ?? {}) as Record<string, Record<string, unknown>>,
    topicEditorialEntry,
  })
  const nextTopicDisplayStore = upsertTopicDisplayEntry(topicDisplayStore, topicDisplayPatch)

  const artifactChanges: SkillArtifactChange[] = [
    {
      relativePath: 'workflow/topic-memory.json',
      kind: 'json',
      retention: 'canonical',
      description: `Refresh visualizer build timestamp for ${topic.id}.`,
      nextValue: nextTopicMemory,
    },
    {
      relativePath: 'workflow/topic-display.json',
      kind: 'json',
      retention: 'canonical',
      description: `Refresh frontend display projection for ${topic.id}.`,
      nextValue: nextTopicDisplayStore,
    },
    buildExecutionMemoryChange({
      context: args.context,
      skillId: 'topic-visualizer',
      patch: {
        lastTopicId: topic.id,
        lastNodeCount: nodes.length,
        lastBranchCount: branchRegistry.length,
        lastMergeEventCount: mergeEvents.length,
      },
    }),
  ]

  return {
    output: {
      branchTimeline: {
        topicId: topic.id,
        rails,
        nodes,
        convergences,
        mergeEvents,
        activeBranches: branchRegistry.filter((branch) => branch.status === 'active' || branch.status === 'candidate'),
        dormantBranches: branchRegistry.filter((branch) => branch.status === 'dormant' || branch.status === 'pending-review'),
        stageWindows,
      },
      citationGraph,
      convergences,
      mergeEvents,
      activeBranches: branchRegistry.filter((branch) => branch.status === 'active' || branch.status === 'candidate'),
      dormantBranches: branchRegistry.filter((branch) => branch.status === 'dormant' || branch.status === 'pending-review'),
      stageWindows,
      topicStats,
      viewModelPatch: {
        topicId: topic.id,
        lastBuiltAt: nextTopicMemory[topic.id].lastBuiltAt,
        activeBranches: branchRegistry
          .filter((branch) => branch.status === 'active' || branch.status === 'candidate')
          .map((branch) => branch.branchId),
        dormantBranches: branchRegistry
          .filter((branch) => branch.status === 'dormant' || branch.status === 'pending-review')
          .map((branch) => branch.branchId),
        mergeEvents,
        stageWindows,
        stats: topicStats,
      },
      topicDisplayPatch,
    },
    artifactChanges,
    summary: `topic-visualizer 已为 ${topic.nameZh} 刷新 ${nodes.length} 个论文节点与展示投影。`,
  }
}
