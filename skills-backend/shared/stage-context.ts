/**
 * Stage 上下文数据模型
 * 描述单次发现流程的完整上下文
 */

import type { ResearchNode } from './research-node'

export interface DiscoveryRound {
  roundNumber: 1 | 2
  queries: string[]
  results?: Array<{
    paperId: string
    title: string
    abstract: string
    published: string
    authors: string[]
    relevanceScore: number
    matchedQueryIds: string[]
    source: string
    pdfUrl?: string
    categories?: string[]
    citationCount?: number
  }>
  candidates?: Array<{
    paperId: string
    title: string
    abstract: string
    published: string
    authors: string[]
    matchedBranchIds: string[]
    matchedProblemNodeIds: string[]
    discoveryRounds: number[]
    queryHits: Array<{
      queryId: string
      queryText: string
      relevanceScore: number
    }>
    discoveryChannels: string[]
    confidence: number
  }>
  executionTime?: number
  resultCount?: number
  topCandidates?: string[]
}

/** 决策信号 */
export interface DecisionSignal {
  type: 'branch_out' | 'branch_merge' | 'capability_gap' | 'method_shift' | 'problem_solved'
  source: string // branchId 或 nodeId
  target?: string
  description: string
  confidence: number
  timestamp: string
}

/** 时间线上下文 */
export interface TimelineContext {
  previousNodes: Array<{
    nodeId: string
    stageIndex: number
    publishedDate: string
    paperId: string
  }>
  originPaper: {
    paperId: string
    published: string
  }
  stageBoundaries: Array<{
    stageIndex: number
    startDate: string
    endDate: string
  }>
}

/** 能力上下文 */
export interface CapabilityContext {
  availableCapabilities: string[]
  requiredCapabilities: string[]
  gapCapabilities: string[]
}

/** 时间窗 */
export interface TimeWindow {
  start: string
  end: string
  months: number
}

/** Stage 上下文 */
export interface StageContext {
  /** 上下文唯一ID */
  contextId: string
  /** 主题ID */
  topicId: string
  /** 阶段索引 */
  stageIndex: number

  // 来源信息
  /** 来源分支ID列表 */
  sourceBranchIds: string[]
  /** 来源问题节点ID列表 */
  sourceProblemNodeIds: string[]
  /** 锚点论文ID列表 */
  sourceAnchorPaperIds: string[]
  /** 上一stage的节点ID列表 */
  sourceNodeIds: string[]

  // 时间范围
  /** 时间窗开始 */
  windowStart: string
  /** 时间窗结束 */
  windowEnd: string
  /** 时间窗跨度（月） */
  windowMonths: number

  // 决策信号
  decisionSignals: DecisionSignal[]

  // 关联数据
  timelineContext: TimelineContext
  capabilityContext: CapabilityContext

  // 元数据
  createdAt: string
}

/** Stage 选择结果 */
export interface StageSelectionResult {
  stageIndex: number
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  selectionReason: string
  confidence: number
}

/**
 * 生成上下文ID
 */
export function generateContextId(): string {
  return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 创建 Stage 上下文
 */
export function createStageContext(
  topicId: string,
  stageIndex: number,
  selection: StageSelectionResult,
  timeWindow: TimeWindow,
  previousNodes: ResearchNode[],
  originPaper: { paperId: string; published: string }
): StageContext {
  const now = new Date().toISOString()

  return {
    contextId: generateContextId(),
    topicId,
    stageIndex,
    sourceBranchIds: selection.sourceBranchIds,
    sourceProblemNodeIds: selection.sourceProblemNodeIds,
    sourceAnchorPaperIds: previousNodes.map(n => n.primaryPaperId),
    sourceNodeIds: previousNodes.map(n => n.nodeId),
    windowStart: timeWindow.start,
    windowEnd: timeWindow.end,
    windowMonths: timeWindow.months,
    decisionSignals: [],
    timelineContext: {
      previousNodes: previousNodes.map(n => ({
        nodeId: n.nodeId,
        stageIndex: n.stageIndex,
        publishedDate: n.discoveredAt, // 简化处理
        paperId: n.primaryPaperId
      })),
      originPaper,
      stageBoundaries: []
    },
    capabilityContext: {
      availableCapabilities: [],
      requiredCapabilities: [],
      gapCapabilities: []
    },
    createdAt: now
  }
}

/**
 * 添加决策信号
 */
export function addDecisionSignal(
  context: StageContext,
  signal: Omit<DecisionSignal, 'timestamp'>
): StageContext {
  return {
    ...context,
    decisionSignals: [
      ...context.decisionSignals,
      {
        ...signal,
        timestamp: new Date().toISOString()
      }
    ]
  }
}

/**
 * 计算时间窗内的月份差
 */
export function calculateWindowMonths(start: string, end: string): number {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const diffMs = endDate.getTime() - startDate.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30))
}

/**
 * 扩展时间窗
 */
export function extendTimeWindow(
  window: TimeWindow,
  additionalMonths: number
): TimeWindow {
  const endDate = new Date(window.end)
  endDate.setMonth(endDate.getMonth() + additionalMonths)

  return {
    start: window.start,
    end: endDate.toISOString(),
    months: window.months + additionalMonths
  }
}

/**
 * 验证时间窗
 */
export function validateTimeWindow(window: TimeWindow): boolean {
  const start = new Date(window.start)
  const end = new Date(window.end)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false
  }

  if (end <= start) {
    return false
  }

  const actualMonths = calculateWindowMonths(window.start, window.end)
  return actualMonths === window.months
}
