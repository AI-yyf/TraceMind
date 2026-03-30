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
}

export interface ResearchNode {
  id: string
  branchId: string
  stageIndex: number
  paperId: string
  paperPublishedAt: string
  title?: string
  summary?: string
  isKeyPaper?: boolean
  status?: string
}

/**
 * 从 Stage Ledger 构建研究节点
 */
export function buildResearchNodesFromStageLedger(
  stageLedger: Record<string, unknown>
): ResearchNode[] {
  const nodes: ResearchNode[] = []

  Object.entries(stageLedger).forEach(([key, entry]) => {
    const stageEntry = entry as StageLedgerEntry
    if (stageEntry.selectedPaperId) {
      nodes.push({
        id: `${stageEntry.branchId}-${stageEntry.stageIndex}`,
        branchId: stageEntry.branchId,
        stageIndex: stageEntry.stageIndex,
        paperId: stageEntry.selectedPaperId,
        paperPublishedAt: stageEntry.windowEnd,
        status: stageEntry.status,
      })
    }
  })

  return nodes
}

/**
 * 规范化研究节点
 */
export function normalizeResearchNodes(nodes: ResearchNode[]): ResearchNode[] {
  // 按 branchId 和 stageIndex 排序
  return nodes.sort((a, b) => {
    if (a.branchId !== b.branchId) {
      return a.branchId.localeCompare(b.branchId)
    }
    return a.stageIndex - b.stageIndex
  })
}

/**
 * 解析主线分支 ID
 */
export function resolveMainlineBranchId(nodes: ResearchNode[]): string {
  if (nodes.length === 0) {
    return 'main'
  }

  // 找到节点最多的分支作为主分支
  const branchCounts: Record<string, number> = {}
  nodes.forEach((node) => {
    branchCounts[node.branchId] = (branchCounts[node.branchId] || 0) + 1
  })

  let mainBranchId = nodes[0].branchId
  let maxCount = 0

  Object.entries(branchCounts).forEach(([branchId, count]) => {
    if (count > maxCount) {
      maxCount = count
      mainBranchId = branchId
    }
  })

  return mainBranchId
}

export default {
  buildResearchNodesFromStageLedger,
  normalizeResearchNodes,
  resolveMainlineBranchId,
}
