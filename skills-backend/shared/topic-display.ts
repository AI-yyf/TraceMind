import {
  buildResearchNodesFromStageLedger,
  normalizeResearchNodes,
  resolveMainlineBranchId,
} from './research-graph.ts'

type TopicDisplayBuilderArgs = {
  topicId: string
  nameZh: string
  nameEn: string
  focusLabel?: string
  originPaperId: string
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
    frontendSummary,
    topicMemory,
    paperCatalog,
    paperEditorialStore = {},
    nodeEditorialStore = {},
    topicEditorialEntry = null,
  } = args

  // 1. 构建研究节点
  const stageLedger = (topicMemory.stageLedger || {}) as Record<string, unknown>
  const researchNodes = buildResearchNodesFromStageLedger(stageLedger)
  const normalizedNodes = normalizeResearchNodes(researchNodes)

  // 2. 解析论文目录
  const papers = Object.entries(paperCatalog).map(([paperId, paperData]) => ({
    id: paperId,
    ...paperData,
  }))

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
  nodes: Array<Record<string, unknown>>,
  mainlineBranchId: string
): Record<string, string> {
  const branchIds = [...new Set(nodes.map((n) => n.branchId as string).filter(Boolean))]
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

export default {
  buildTopicDisplay,
  buildTopicDisplayCollection,
}
