import { useMemo } from 'react'
import { paperMap } from '../data/tracker'
import type {
  BranchRegistryEntry,
  PaperRelationEntry,
  StageLedgerEntry,
  TrackerPaper,
  TrackerTopic,
} from '../types/tracker'
import type {
  BranchConnection,
  BranchNode,
  BranchTimelineData,
  TimelinePaperNode,
} from '../components/timeline/BranchTimeline'
import type {
  CitationEdge,
  CitationGraphData,
  CitationNode,
} from '../components/visualization/CitationGraph'

const BRANCH_COLORS = ['#DC2626', '#2563EB', '#059669', '#7C3AED', '#D97706', '#0891B2', '#0F766E', '#9333EA']

export function useBranchTimelineData(topic: TrackerTopic | null): BranchTimelineData {
  return useMemo(() => {
    if (!topic) {
      return {
        papers: new Map(),
        branches: new Map(),
        connections: [],
        timeGroups: [],
      }
    }

    return buildBranchTimelineData(topic)
  }, [topic])
}

function buildBranchTimelineData(topic: TrackerTopic): BranchTimelineData {
  const hasStructuredMemory =
    Boolean(topic.memory.branchRegistry?.length) ||
    Boolean(topic.memory.stageLedger?.length) ||
    Boolean(topic.memory.paperRelations?.length)

  if (hasStructuredMemory) {
    return buildStructuredBranchTimelineData(topic)
  }

  return buildLegacyBranchTimelineData(topic)
}

function resolveStructuredMainlineBranchId(topic: TrackerTopic) {
  const explicitMainline = (topic.memory.branchRegistry ?? []).find(
    (branch) =>
      !branch.parentBranchId &&
      branch.anchorPaperId === topic.originPaper.id &&
      branch.branchType !== 'transfer',
  )

  return explicitMainline?.branchId ?? `branch:${topic.id}:origin`
}

function buildStructuredBranchTimelineData(topic: TrackerTopic): BranchTimelineData {
  const papers = new Map<string, TimelinePaperNode>()
  const branches = new Map<string, BranchNode>()
  const connections: BranchConnection[] = []
  const timeGroups: BranchTimelineData['timeGroups'] = []
  const mainlineBranchId = resolveStructuredMainlineBranchId(topic)

  const relationMap = new Map(
    (topic.memory.paperRelations ?? []).map((entry) => [entry.paperId, entry]),
  )
  const branchEntries = [...(topic.memory.branchRegistry ?? [])].sort(compareBranchEntries)
  const branchEntryMap = new Map(branchEntries.map((entry) => [entry.branchId, entry]))
  const problemMap = new Map(topic.memory.problemNodes.map((problem) => [problem.id, problem]))
  const stageLedger = topic.memory.stageLedger ?? []
  const anchoredBranchCount = new Map<string, number>()

  branches.set('main', {
    id: 'main',
    name: '主线',
    type: 'main',
    status: 'active',
    color: BRANCH_COLORS[0],
    lane: 0,
    paperIds: [],
    childBranchIds: [],
    startDate: topic.originPaper.published,
    endDate: topic.originPaper.published,
  })

  branchEntries.forEach((branch, index) => {
    if (branch.branchId === mainlineBranchId) {
      const mainBranch = branches.get('main')
      if (mainBranch) {
        mainBranch.startDate = toDateOnly(branch.anchorPaperPublishedAt) || mainBranch.startDate
        mainBranch.endDate = toDateOnly(branch.lastTrackedPublishedAt) || mainBranch.endDate
      }

      anchoredBranchCount.set(
        branch.anchorPaperId,
        (anchoredBranchCount.get(branch.anchorPaperId) ?? 0) + 1,
      )
      return
    }

    branches.set(branch.branchId, {
      id: branch.branchId,
      name: formatStructuredBranchName(branch, topic, problemMap),
      type: mapStructuredBranchType(branch),
      status: mapStructuredBranchStatus(branch.status),
      color: BRANCH_COLORS[(index + 1) % BRANCH_COLORS.length],
      lane: index + 1,
      paperIds: [],
      parentBranchId: undefined,
      childBranchIds: [],
      mergedIntoBranchId: branch.mergedIntoBranchId ?? undefined,
      startDate: toDateOnly(branch.anchorPaperPublishedAt),
      endDate: toDateOnly(branch.lastTrackedPublishedAt),
    })

    anchoredBranchCount.set(
      branch.anchorPaperId,
      (anchoredBranchCount.get(branch.anchorPaperId) ?? 0) + 1,
    )
  })

  const allPaperIds = collectStructuredPaperIds(topic, branchEntries, stageLedger, relationMap)
  const sortedPapers = Array.from(allPaperIds)
    .map((id) => paperMap[id])
    .filter((paper): paper is TrackerPaper => Boolean(paper))
    .sort(comparePapers)

  for (const paper of sortedPapers) {
    const relation = relationMap.get(paper.id)
    const branchId = resolveStructuredPaperBranchId(
      topic,
      paper,
      relation,
      branchEntryMap,
      mainlineBranchId,
    )

    if (!branches.has(branchId) && branchId !== 'main') {
      branches.set(branchId, {
        id: branchId,
        name: paper.branchContext.branchLabel ?? shorten(branchId.replace(/^branch:/, ''), 24),
        type: 'problem-branch',
        status: 'active',
        color: BRANCH_COLORS[branches.size % BRANCH_COLORS.length],
        lane: branches.size,
        paperIds: [],
        childBranchIds: [],
        startDate: paper.published,
        endDate: paper.published,
      })
    }

    papers.set(paper.id, {
      ...paper,
      branchId,
      role: 'trunk',
      parentId: undefined,
      childrenIds: [],
    })

    const branch = branches.get(branchId)
    if (branch && !branch.paperIds.includes(paper.id)) {
      branch.paperIds.push(paper.id)
    }
  }

  for (const branch of branches.values()) {
    branch.paperIds = uniquePaperIds(branch.paperIds, papers)

    if (branch.paperIds.length > 0) {
      branch.startDate = papers.get(branch.paperIds[0])?.published ?? branch.startDate
      branch.endDate = papers.get(branch.paperIds[branch.paperIds.length - 1])?.published ?? branch.endDate
    }
  }

  for (const entry of branchEntries) {
    const branch = branches.get(entry.branchId)
    if (!branch) continue

    const inferredParent =
      normalizeBranchId(relationMap.get(entry.anchorPaperId)?.primaryBranchId, topic.id, mainlineBranchId) ?? 'main'
    const parentBranchId =
      entry.parentBranchId && branches.has(entry.parentBranchId)
        ? entry.parentBranchId
        : entry.branchId === inferredParent
          ? 'main'
          : inferredParent

    branch.parentBranchId = parentBranchId

    const parent = branches.get(parentBranchId)
    if (parent && !parent.childBranchIds.includes(branch.id)) {
      parent.childBranchIds.push(branch.id)
    }
  }

  const connectionSet = new Set<string>()

  for (const branch of branches.values()) {
    if (branch.id === 'main') continue

    const entry = branchEntryMap.get(branch.id)
    const branchPaperIds = branch.paperIds.filter((paperId) => papers.has(paperId))

    if (entry && branchPaperIds.length > 0 && entry.anchorPaperId !== branchPaperIds[0]) {
      addConnection(connections, connectionSet, {
        from: entry.anchorPaperId,
        to: branchPaperIds[0],
        type: 'branches',
        strength: 0.95,
      })
    }

    for (let index = 1; index < branchPaperIds.length; index += 1) {
      addConnection(connections, connectionSet, {
        from: branchPaperIds[index - 1],
        to: branchPaperIds[index],
        type: 'continues',
        strength: 0.8,
      })
    }
  }

  for (const entry of stageLedger) {
    if (entry.selectedPaperId && entry.anchorPaperId !== entry.selectedPaperId) {
      addConnection(connections, connectionSet, {
        from: entry.anchorPaperId,
        to: entry.selectedPaperId,
        type: entry.status === 'merged' ? 'merges' : 'continues',
        strength: entry.status === 'merged' ? 0.95 : 0.75,
      })
    }

    for (const mergeEvent of entry.mergeEvents) {
      for (const mergedBranchId of mergeEvent.mergedBranchIds) {
        const mergedBranch =
          branches.get(normalizeBranchId(mergedBranchId, topic.id, mainlineBranchId) ?? mergedBranchId)
        const mergeSourcePaperId = mergedBranch?.paperIds[mergedBranch.paperIds.length - 1]

        if (!mergeSourcePaperId || mergeSourcePaperId === mergeEvent.paperId) continue

        addConnection(connections, connectionSet, {
          from: mergeSourcePaperId,
          to: mergeEvent.paperId,
          type: 'merges',
          strength: 1,
        })
      }
    }
  }

  for (const connection of connections) {
    const target = papers.get(connection.to)
    const source = papers.get(connection.from)

    if (!target || !source) continue

    if (!target.parentId) {
      target.parentId = source.id
    }

    if (!source.childrenIds.includes(target.id)) {
      source.childrenIds.push(target.id)
    }
  }

  for (const node of papers.values()) {
    const relation = relationMap.get(node.id)
    const branch = branches.get(node.branchId)

    if (node.id === topic.originPaper.id) {
      node.role = 'origin'
      continue
    }

    if (node.branchContext.isMergePaper || relation?.isMergePaper) {
      node.role = 'merge-point'
      continue
    }

    if ((anchoredBranchCount.get(node.id) ?? 0) > 0) {
      node.role = 'fork-point'
      continue
    }

    if (branch && branch.id !== 'main' && branch.paperIds[0] === node.id) {
      node.role = 'branch-first'
      continue
    }

    if (branch?.status === 'dormant' && branch.paperIds[branch.paperIds.length - 1] === node.id) {
      node.role = 'dead-end'
    }
  }

  const groupMap = new Map<string, string[]>()

  for (const node of papers.values()) {
    const key = monthKey(node.published)
    const existing = groupMap.get(key) ?? []
    existing.push(node.id)
    groupMap.set(key, existing)
  }

  for (const [date, paperIds] of groupMap) {
    timeGroups.push({
      date,
      year: date.slice(0, 4),
      month: date.slice(5, 7),
      papers: uniquePaperIds(paperIds, papers),
    })
  }

  return {
    papers,
    branches,
    connections,
    timeGroups: timeGroups.sort((left, right) => left.date.localeCompare(right.date)),
  }
}

function collectStructuredPaperIds(
  topic: TrackerTopic,
  branchEntries: BranchRegistryEntry[],
  stageLedger: StageLedgerEntry[],
  relationMap: Map<string, PaperRelationEntry>,
) {
  const paperIds = new Set<string>()

  paperIds.add(topic.originPaper.id)
  topic.papers.forEach((paper) => paperIds.add(paper.id))

  for (const entry of branchEntries) {
    paperIds.add(entry.anchorPaperId)
    paperIds.add(entry.lastTrackedPaperId)
  }

  for (const entry of stageLedger) {
    paperIds.add(entry.anchorPaperId)
    entry.candidatePaperIds.forEach((paperId) => paperIds.add(paperId))
    if (entry.selectedPaperId) {
      paperIds.add(entry.selectedPaperId)
    }
    entry.mergeEvents.forEach((event) => {
      paperIds.add(event.paperId)
    })
  }

  for (const paperId of relationMap.keys()) {
    paperIds.add(paperId)
  }

  return paperIds
}

function resolveStructuredPaperBranchId(
  topic: TrackerTopic,
  paper: TrackerPaper,
  relation: PaperRelationEntry | undefined,
  branchEntryMap: Map<string, BranchRegistryEntry>,
  mainlineBranchId: string,
) {
  const branchContextId = normalizeBranchId(paper.branchContext.branchId, topic.id, mainlineBranchId)
  if (branchContextId) return branchContextId

  if (paper.id === topic.originPaper.id) return 'main'

  const primaryBranchId = normalizeBranchId(relation?.primaryBranchId, topic.id, mainlineBranchId)
  if (primaryBranchId) return primaryBranchId

  const relationBranchId = relation?.branchIds
    ?.map((branchId) => normalizeBranchId(branchId, topic.id, mainlineBranchId))
    .find((branchId): branchId is string => Boolean(branchId && branchEntryMap.has(branchId)))

  if (relationBranchId) return relationBranchId

  return 'main'
}

function normalizeBranchId(value: string | null | undefined, topicId: string, mainlineBranchId?: string) {
  if (!value) return null
  if (
    value === 'main' ||
    value === `main:${topicId}` ||
    value === mainlineBranchId ||
    value === `branch:${topicId}:origin`
  ) {
    return 'main'
  }
  return value
}

function compareBranchEntries(left: BranchRegistryEntry, right: BranchRegistryEntry) {
  const statusPriority = (status: BranchRegistryEntry['status']) => {
    switch (status) {
      case 'active':
        return 0
      case 'candidate':
        return 1
      case 'resolved':
        return 2
      case 'merged':
        return 3
      case 'dormant':
        return 4
      case 'pending-review':
        return 5
      default:
        return 6
    }
  }

  return (
    statusPriority(left.status) - statusPriority(right.status) ||
    right.priorityScore - left.priorityScore ||
    left.stageIndex - right.stageIndex ||
    left.lastTrackedPublishedAt.localeCompare(right.lastTrackedPublishedAt)
  )
}

function mapStructuredBranchStatus(status: BranchRegistryEntry['status']): BranchNode['status'] {
  switch (status) {
    case 'dormant':
    case 'pending-review':
      return 'dormant'
    case 'merged':
    case 'resolved':
      return 'absorbed'
    default:
      return 'active'
  }
}

function mapStructuredBranchType(branch: BranchRegistryEntry): BranchNode['type'] {
  switch (branch.branchType) {
    case 'transfer':
      return 'inspiration-branch'
    case 'merge':
      return 'method-branch'
    default:
      return 'problem-branch'
  }
}

function formatStructuredBranchName(
  branch: BranchRegistryEntry,
  topic: TrackerTopic,
  problemMap: Map<string, TrackerTopic['memory']['problemNodes'][number]>,
) {
  const problem = branch.linkedProblemNodeIds
    .map((problemId) => problemMap.get(problemId))
    .find(Boolean)
  const lastPaper = paperMap[branch.lastTrackedPaperId]
  const typeLabel =
    branch.branchType === 'transfer' ? '迁移' : branch.branchType === 'merge' ? '合流' : '主干'
  const focus =
    problem?.stageTitle ||
    problem?.question ||
    lastPaper?.titleZh ||
    lastPaper?.title ||
    branch.label ||
    branch.branchId.replace(`branch:${topic.id}:`, '')

  return `${typeLabel} · ${shorten(focus, 20)}`
}

function addConnection(
  connections: BranchConnection[],
  connectionSet: Set<string>,
  connection: BranchConnection,
) {
  const key = `${connection.from}:${connection.to}:${connection.type}`
  if (connectionSet.has(key)) return
  connectionSet.add(key)
  connections.push(connection)
}

function uniquePaperIds(paperIds: string[], papers: Map<string, TimelinePaperNode>) {
  return Array.from(new Set(paperIds))
    .filter((paperId) => papers.has(paperId))
    .sort((left, right) => comparePapers(papers.get(left)!, papers.get(right)!))
}

function comparePapers(left: Pick<TrackerPaper, 'published'>, right: Pick<TrackerPaper, 'published'>) {
  return new Date(left.published).getTime() - new Date(right.published).getTime()
}

function monthKey(date: string) {
  const value = toDateOnly(date)
  return value.length >= 7 ? value.slice(0, 7) : value
}

function toDateOnly(date: string) {
  return typeof date === 'string' ? date.slice(0, 10) : ''
}

function shorten(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}...`
}

function buildLegacyBranchTimelineData(topic: TrackerTopic): BranchTimelineData {
  const papers = new Map<string, TimelinePaperNode>()
  const branches = new Map<string, BranchNode>()
  const connections: BranchConnection[] = []
  const timeGroups: BranchTimelineData['timeGroups'] = []

  const allPaperIds = new Set<string>()
  allPaperIds.add(topic.originPaper.id)
  topic.papers.forEach((paper) => allPaperIds.add(paper.id))
  topic.stages.forEach((stage) => {
    if (stage.parentPaper) allPaperIds.add(stage.parentPaper.id)
  })

  const branchMap = inferLegacyBranches(topic, allPaperIds)

  const sortedPapers = Array.from(allPaperIds)
    .map((id) => paperMap[id])
    .filter((paper): paper is TrackerPaper => Boolean(paper))
    .sort(comparePapers)

  for (let index = 0; index < sortedPapers.length; index += 1) {
    const paper = sortedPapers[index]
    const branchInfo = branchMap.get(paper.id) ?? { branchId: 'main', role: 'trunk' as const }

    papers.set(paper.id, {
      ...paper,
      branchId: branchInfo.branchId,
      role: branchInfo.role,
      parentId: index > 0 ? sortedPapers[index - 1]?.id : undefined,
      childrenIds: [],
    })
  }

  for (const node of papers.values()) {
    if (node.parentId && papers.has(node.parentId)) {
      const parent = papers.get(node.parentId)!
      if (!parent.childrenIds.includes(node.id)) {
        parent.childrenIds.push(node.id)
      }
    }
  }

  branches.set('main', {
    id: 'main',
    name: '主线',
    type: 'main',
    status: 'active',
    color: BRANCH_COLORS[0],
    lane: 0,
    paperIds: [],
    startDate: '',
    endDate: '',
    childBranchIds: [],
  })

  for (const [paperId, node] of papers) {
    const branch = branches.get(node.branchId)
    if (branch) {
      branch.paperIds.push(paperId)
      continue
    }

    const branchIndex = branches.size
    branches.set(node.branchId, {
      id: node.branchId,
      name: getLegacyBranchName(node.branchId, node),
      type: inferLegacyBranchType(node),
      status: 'active',
      color: BRANCH_COLORS[branchIndex % BRANCH_COLORS.length],
      lane: branchIndex,
      paperIds: [paperId],
      startDate: node.published,
      endDate: node.published,
      childBranchIds: [],
    })
  }

  for (const branch of branches.values()) {
    const branchPapers = branch.paperIds
      .map((paperId) => papers.get(paperId))
      .filter((paper): paper is TimelinePaperNode => Boolean(paper))
      .sort(comparePapers)

    if (branchPapers.length > 0) {
      branch.startDate = branch.startDate || branchPapers[0].published
      branch.endDate = branchPapers[branchPapers.length - 1].published
    }
  }

  for (const node of papers.values()) {
    if (node.parentId && papers.has(node.parentId)) {
      const parent = papers.get(node.parentId)!
      connections.push({
        from: parent.id,
        to: node.id,
        type: parent.branchId === node.branchId ? 'continues' : 'branches',
        strength: 1,
      })
    }
  }

  const groupMap = new Map<string, string[]>()

  for (const node of papers.values()) {
    const key = monthKey(node.published)
    const group = groupMap.get(key) ?? []
    group.push(node.id)
    groupMap.set(key, group)
  }

  for (const [date, paperIds] of groupMap) {
    timeGroups.push({
      date,
      year: date.slice(0, 4),
      month: date.slice(5, 7),
      papers: paperIds,
    })
  }

  return {
    papers,
    branches,
    connections,
    timeGroups: timeGroups.sort((left, right) => left.date.localeCompare(right.date)),
  }
}

function inferLegacyBranches(
  topic: TrackerTopic,
  allPaperIds: Set<string>,
): Map<string, { branchId: string; role: TimelinePaperNode['role'] }> {
  const result = new Map<string, { branchId: string; role: TimelinePaperNode['role'] }>()

  if (topic.memory?.branchTree && topic.memory.branchTree.length > 0) {
    for (const branch of topic.memory.branchTree) {
      for (const paperId of branch.paperPath) {
        let role: TimelinePaperNode['role'] = 'trunk'
        if (paperId === branch.paperPath[0]) {
          role = branch.branchType === 'mainline' ? 'trunk' : 'branch-first'
        }
        result.set(paperId, { branchId: branch.id, role })
      }
    }
  }

  for (const paperId of allPaperIds) {
    if (result.has(paperId)) continue

    const paper = paperMap[paperId]
    if (!paper) continue

    const isInspiration = paper.tags.some((tag) =>
      tag.includes('灵感') || tag.includes('跨领域') || tag.includes('先例'),
    )

    if (isInspiration && paperId !== topic.originPaper.id) {
      result.set(paperId, {
        branchId: `inspiration-${paperId.slice(-4)}`,
        role: 'branch-first',
      })
    }
  }

  if (topic.stages.length > 0) {
    for (const stage of topic.stages) {
      if (stage.parentPaper && !result.has(stage.parentPaper.id) && stage.mergeBranches.length > 0) {
        result.set(stage.parentPaper.id, {
          branchId: 'main',
          role: 'merge-point',
        })
      }
    }
  }

  for (const paperId of allPaperIds) {
    if (result.has(paperId)) continue

    result.set(paperId, {
      branchId: 'main',
      role: paperId === topic.originPaper.id ? 'origin' : 'trunk',
    })
  }

  return result
}

function getLegacyBranchName(branchId: string, node?: TimelinePaperNode) {
  if (branchId.startsWith('inspiration-')) {
    return '灵感探索'
  }
  if (branchId === 'main') return '主线'
  if (node?.problemTags?.length) {
    return node.problemTags[0]
  }
  return `分支 ${branchId}`
}

function inferLegacyBranchType(node: TimelinePaperNode): BranchNode['type'] {
  if (node.branchId.startsWith('inspiration-')) return 'inspiration-branch'
  if (node.tags.some((tag) => tag.includes('问题'))) return 'problem-branch'
  if (node.tags.some((tag) => tag.includes('方法'))) return 'method-branch'
  return 'problem-branch'
}

export function useCitationGraphData(
  centerPaper: TrackerPaper,
  relatedPapers: TrackerPaper[],
): CitationGraphData {
  return useMemo(() => buildCitationGraphData(centerPaper, relatedPapers), [centerPaper, relatedPapers])
}

function buildCitationGraphData(
  centerPaper: TrackerPaper,
  relatedPapers: TrackerPaper[],
): CitationGraphData {
  const nodes: CitationNode[] = []
  const edges: CitationEdge[] = []

  nodes.push({
    id: centerPaper.id,
    paper: centerPaper,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 20,
    mass: 2,
    level: 0,
  })

  const sortedRelated = [...relatedPapers].sort(comparePapers)

  for (const paper of sortedRelated) {
    const centerDate = new Date(centerPaper.published).getTime()
    const paperDate = new Date(paper.published).getTime()
    const isBefore = paperDate < centerDate
    const sharedAuthors = getSharedAuthors(centerPaper, paper)
    const tagSimilarity = getTagSimilarity(centerPaper.tags, paper.tags)
    const isRelated = sharedAuthors.length > 0 || tagSimilarity > 0.2

    nodes.push({
      id: paper.id,
      paper,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 6 + (paper.citationCount || 0) / 20,
      mass: 1,
      level: isRelated ? 1 : 2,
    })

    if (isRelated) {
      edges.push({
        source: isBefore ? paper.id : centerPaper.id,
        target: isBefore ? centerPaper.id : paper.id,
        type: isBefore ? 'cited-by' : 'cites',
        strength: 0.5 + tagSimilarity * 0.5,
      })
      continue
    }

    edges.push({
      source: centerPaper.id,
      target: paper.id,
      type: 'related',
      strength: 0.2,
    })
  }

  return {
    nodes,
    edges,
    centerNodeId: centerPaper.id,
  }
}

function getSharedAuthors(left: TrackerPaper, right: TrackerPaper) {
  const leftAuthors = new Set(left.authors.map((name) => normalizeAuthorName(name)))
  const rightAuthors = new Set(right.authors.map((name) => normalizeAuthorName(name)))
  return [...leftAuthors].filter((author) => rightAuthors.has(author))
}

function normalizeAuthorName(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)
}

function getTagSimilarity(tagsA: string[], tagsB: string[]) {
  if (tagsA.length === 0 || tagsB.length === 0) return 0

  const left = new Set(tagsA.map((tag) => tag.toLowerCase()))
  const right = new Set(tagsB.map((tag) => tag.toLowerCase()))
  const intersection = new Set([...left].filter((tag) => right.has(tag)))
  const union = new Set([...left, ...right])

  return union.size === 0 ? 0 : intersection.size / union.size
}
