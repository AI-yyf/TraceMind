import {
  buildResearchNodesFromStageLedger,
  normalizeResearchNodes,
  resolveMainlineBranchId,
} from './research-graph'

type TopicDisplayBuilderArgs = {
  topicId: string
  nameZh: string
  nameEn: string
  focusLabel?: string
  originPaperId: string
  configuredPaperIds?: string[]
  frontendSummary?: {
    cardSummary?: string
    timelineGuide?: string
    researchBlurb?: string
  }
  topicMemory: Record<string, unknown>
  paperCatalog: Record<string, Record<string, unknown>>
  paperEditorialStore?: Record<string, Record<string, unknown>>
  nodeEditorialStore?: Record<string, Record<string, unknown>>
  topicEditorialEntry?: Record<string, unknown> | null
}

type TopicDisplayCollection = {
  schemaVersion: number
  topics: Array<Record<string, unknown>>
}

function collectTopicMemoryPaperIds(
  value: unknown,
  target: Set<string>,
  visited = new WeakSet<object>(),
) {
  if (!value || typeof value !== 'object') return
  if (visited.has(value as object)) return
  visited.add(value as object)

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTopicMemoryPaperIds(item, target, visited)
    }
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (/rejected/iu.test(key)) continue

    if (typeof child === 'string') {
      if (/paperid$/iu.test(key) || /originpaperid$/iu.test(key)) {
        const normalized = child.trim()
        if (normalized) target.add(normalized)
      }
      continue
    }

    if (Array.isArray(child)) {
      if (/paperids$/iu.test(key)) {
        for (const item of child) {
          if (typeof item !== 'string') continue
          const normalized = item.trim()
          if (normalized) target.add(normalized)
        }
        continue
      }

      for (const item of child) {
        collectTopicMemoryPaperIds(item, target, visited)
      }
      continue
    }

    collectTopicMemoryPaperIds(child, target, visited)
  }
}

function collectTopicDisplayPaperIds(args: {
  topicMemory: Record<string, unknown>
  originPaperId: string
  configuredPaperIds?: string[]
}) {
  const orderedIds: string[] = []
  const seen = new Set<string>()
  const push = (paperId: unknown) => {
    if (typeof paperId !== 'string') return
    const normalized = paperId.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    orderedIds.push(normalized)
  }

  const researchNodes = Array.isArray(args.topicMemory.researchNodes)
    ? (args.topicMemory.researchNodes as Array<Record<string, unknown>>)
    : []

  for (const node of researchNodes) {
    if (Array.isArray(node.paperIds)) {
      for (const paperId of node.paperIds) {
        push(paperId)
      }
    }

    push(node.primaryPaperId)
    push(node.paperId)
  }

  for (const paperId of args.configuredPaperIds ?? []) {
    push(paperId)
  }

  const memoryPaperIds = new Set<string>()
  collectTopicMemoryPaperIds(args.topicMemory, memoryPaperIds)
  for (const paperId of memoryPaperIds) {
    push(paperId)
  }

  push(args.originPaperId)
  return orderedIds
}

// 分支颜色配置 - 与前端统一
// 主线使用红色 (#dc2626)，其他分支使用以下配色
const BRANCH_COLOR_PALETTE = [
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#db2777', // pink-600
  '#0891b2', // cyan-600
  '#4f46e5', // indigo-600
]

/**
 * 构建主题展示数据
 */
export function buildTopicDisplay(args: TopicDisplayBuilderArgs): Record<string, unknown> {
  const {
    topicId,
    nameZh,
    nameEn,
    focusLabel,
    originPaperId,
    configuredPaperIds = [],
    frontendSummary,
    topicMemory,
    paperCatalog,
    paperEditorialStore = {},
    nodeEditorialStore = {},
    topicEditorialEntry = null,
  } = args

  // 1. 构建研究节点
  const normalizedNodes = normalizeResearchNodes(
    Array.isArray(topicMemory.researchNodes) && topicMemory.researchNodes.length > 0
      ? (topicMemory.researchNodes as unknown[])
      : buildResearchNodesFromStageLedger((topicMemory.stageLedger || {}) as Record<string, unknown>),
  )

  // 2. 解析论文目录
  const papers = collectTopicDisplayPaperIds({
    topicMemory,
    originPaperId,
    configuredPaperIds,
  })
    .map((paperId) => {
      const paperData = paperCatalog[paperId]
      if (!paperData) return null
      return {
        id: paperId,
        ...paperData,
      }
    })
    .filter(Boolean) as Array<Record<string, unknown> & { id: string }>

  // 3. 确定主线分支
  const mainlineBranchId = resolveMainlineBranchId(normalizedNodes)

  // 4. 为分支分配颜色
  const branchColors = assignBranchColors(normalizedNodes, mainlineBranchId)

  // 5. 构建展示数据
  return {
    topicId,
    nameZh,
    nameEn,
    focusLabel,
    originPaperId,
    frontendSummary,
    papers,
    researchNodes: normalizedNodes,
    mainlineBranchId,
    branchColors,
    paperEditorialStore,
    nodeEditorialStore,
    topicEditorialEntry,
    metadata: {
      totalPapers: papers.length,
      totalNodes: normalizedNodes.length,
      lastUpdated: new Date().toISOString(),
    },
  }
}

/**
 * 为分支分配颜色
 */
function assignBranchColors(
  nodes: Array<{ branchId?: string; sourceBranchIds?: string[] }>,
  mainlineBranchId: string
): Record<string, string> {
  const branchIds = [
    ...new Set(
      nodes
        .map((node) => {
          return typeof node.branchId === 'string'
            ? node.branchId
            : Array.isArray(node.sourceBranchIds) && typeof node.sourceBranchIds[0] === 'string'
              ? node.sourceBranchIds[0]
              : ''
        })
        .filter(Boolean),
    ),
  ]
  const colors: Record<string, string> = {}

  branchIds.forEach((branchId, index) => {
    if (branchId === mainlineBranchId) {
      colors[branchId] = '#dc2626' // 主线红色
    } else {
      colors[branchId] = BRANCH_COLOR_PALETTE[index % BRANCH_COLOR_PALETTE.length]
    }
  })

  return colors
}

/**
 * 构建主题展示集合
 */
export function buildTopicDisplayCollection(
  topics: TopicDisplayBuilderArgs[]
): TopicDisplayCollection {
  return {
    schemaVersion: 1,
    topics: topics.map((args) => buildTopicDisplay(args)),
  }
}

export function buildTopicDisplayEntry(args: TopicDisplayBuilderArgs): Record<string, unknown> {
  return buildTopicDisplay(args)
}

export function createEmptyTopicDisplayCollection(): TopicDisplayCollection {
  return {
    schemaVersion: 1,
    topics: [],
  }
}

export function upsertTopicDisplayEntry(
  collection: TopicDisplayCollection,
  entry: Record<string, unknown>,
): TopicDisplayCollection {
  const topicId = typeof entry.topicId === 'string' ? entry.topicId : ''
  if (!topicId) {
    return collection
  }

  const nextTopics = [...collection.topics]
  const index = nextTopics.findIndex((item) => item.topicId === topicId)
  if (index >= 0) {
    nextTopics[index] = {
      ...nextTopics[index],
      ...entry,
    }
  } else {
    nextTopics.push(entry)
  }

  return {
    schemaVersion: collection.schemaVersion ?? 1,
    topics: nextTopics,
  }
}

export default {
  buildTopicDisplay,
  buildTopicDisplayEntry,
  buildTopicDisplayCollection,
  createEmptyTopicDisplayCollection,
  upsertTopicDisplayEntry,
}
