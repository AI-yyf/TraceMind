/**
 * 研究节点数据模型
 * 节点是研究脉络的核心抽象，可包含1篇或多篇论文
 */

import type { SystemConfig } from './config'

/** 节点状态 */
export type NodeStatus = 'provisional' | 'canonical' | 'archived' | 'deprecated'

/** 发现轮次记录 */
export interface DiscoveryRound {
  roundNumber: 1 | 2
  queries: string[]
  resultCount: number
  topCandidates: string[] // paperIds
}

/** 查询命中记录 */
export interface QueryHit {
  query: string
  paperId: string
  relevanceScore: number
}

/** 归并历史记录 */
export interface MergeRecord {
  type: 'merge' | 'split'
  timestamp: string
  sourceNodeIds?: string[] // merge时记录源节点
  targetNodeIds?: string[] // split时记录目标节点
  reason?: string
}

/** 研究节点 */
export interface ResearchNode {
  // 核心标识
  nodeId: string
  workspaceId?: string // 支持多租户（未来扩展）

  // 层级关系
  stageIndex: number
  topicId: string

  // 论文集合
  paperIds: string[]
  primaryPaperId: string
  paperWeights?: Record<string, number> // 论文重要性权重

  // 来源追溯
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  discoveryContext?: {
    discoveryRounds: DiscoveryRound[]
    queryHits: QueryHit[]
    confidenceScore: number
  }

  // 状态管理
  status: NodeStatus
  provisional: boolean

  // 内容
  nodeLabel: string
  nodeSummary: string
  nodeSubtitle?: string

  // 元数据
  isMergeNode: boolean
  mergeHistory?: MergeRecord[]
  tags: string[]
  warnings?: string[] // 约束警告

  // 时间戳
  discoveredAt: string
  canonicalizedAt?: string
  createdAt: string
  updatedAt: string

  // 版本控制
  version: number
  previousVersion?: string
  supersededBy?: string[] // 被哪些节点替代（拆分场景）
  mergedInto?: string // 合并到哪个节点
}

/** 节点创建参数 */
export interface NodeCreationProps {
  topicId: string
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  nodeLabel: string
  nodeSummary: string
  isMergeNode?: boolean
  discoveryContext?: ResearchNode['discoveryContext']
}

/** 节点拆分规格 */
export interface SplitSpec {
  splits: Array<{
    paperIds: string[]
    primaryPaperId: string
    label: string
    summary: string
    branchIds: string[]
  }>
}

/** 节点合并规格 */
export interface MergeSpec {
  primaryPaperId?: string
  label: string
  summary: string
}

/** 节点更新参数 */
export interface NodeUpdate {
  nodeLabel?: string
  nodeSummary?: string
  status?: NodeStatus
  paperIds?: string[]
  tags?: string[]
  supersededBy?: string[]
  mergedInto?: string
}

/**
 * 生成节点ID
 */
export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 创建新节点
 */
export function createResearchNode(props: NodeCreationProps): ResearchNode {
  const now = new Date().toISOString()

  return {
    nodeId: generateNodeId(),
    topicId: props.topicId,
    stageIndex: props.stageIndex,
    paperIds: props.paperIds,
    primaryPaperId: props.primaryPaperId,
    paperWeights: props.paperIds.reduce((acc, id) => {
      acc[id] = id === props.primaryPaperId ? 1.0 : 0.5
      return acc
    }, {} as Record<string, number>),
    sourceBranchIds: props.sourceBranchIds,
    sourceProblemNodeIds: props.sourceProblemNodeIds,
    discoveryContext: props.discoveryContext,
    status: 'provisional',
    provisional: true,
    nodeLabel: props.nodeLabel,
    nodeSummary: props.nodeSummary,
    isMergeNode: props.isMergeNode ?? false,
    tags: [],
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    version: 1
  }
}

/**
 * 提升节点为 canonical
 */
export function canonicalizeNode(node: ResearchNode): ResearchNode {
  return {
    ...node,
    status: 'canonical',
    provisional: false,
    canonicalizedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: node.version + 1
  }
}

/**
 * 归档节点
 */
export function archiveNode(node: ResearchNode, reason: string): ResearchNode {
  return {
    ...node,
    status: 'archived',
    updatedAt: new Date().toISOString(),
    version: node.version + 1,
    tags: [...node.tags, `archived:${reason}`]
  }
}

/**
 * 验证节点约束
 * 返回警告列表
 */
export function validateNodeConstraints(
  node: ResearchNode,
  config: SystemConfig
): string[] {
  const warnings: string[] = []

  // 检查论文数量
  if (node.paperIds.length > config.nodeMerge.maxPapersPerNode) {
    warnings.push(
      `论文数量${node.paperIds.length}超过建议值${config.nodeMerge.maxPapersPerNode}`
    )
  }

  // 检查时间跨度（如果有论文发布时间信息）
  // 这里简化处理，实际实现需要查询论文元数据

  return warnings
}

/**
 * 检查节点是否有效（未被废弃或归档）
 */
export function isNodeActive(node: ResearchNode): boolean {
  return node.status === 'provisional' || node.status === 'canonical'
}

/**
 * 获取节点显示标题
 */
export function getNodeDisplayTitle(node: ResearchNode): string {
  return node.nodeLabel || `节点 ${node.nodeId.slice(0, 8)}`
}

/**
 * 获取节点论文数量
 */
export function getNodePaperCount(node: ResearchNode): number {
  return node.paperIds.length
}
