/**
 * Stage 上下文构建器
 * 负责构建完整的 Stage 上下文，包括时间窗、决策信号、时间线上下文等
 */

import type { SystemConfig } from '../../../shared/config'
import type {
  StageContext,
  StageSelectionResult,
  TimeWindow,
  TimelineContext,
  CapabilityContext,
  DecisionSignal,
} from '../../../shared/stage-context'
import type { TopicMemory, BranchInfo } from './stage-selector'

export interface StageContextBuilderOptions {
  config: SystemConfig
  explicitTimeWindow?: TimeWindow
}

export class StageContextBuilder {
  constructor(private options: StageContextBuilderOptions) {}

  /**
   * 构建 Stage 上下文
   */
  build(
    topicId: string,
    stageIndex: number,
    selection: StageSelectionResult,
    topicMemory: TopicMemory
  ): StageContext {
    // 1. 确定时间窗
    const timeWindow = this.determineTimeWindow(topicId, stageIndex, topicMemory)

    // 2. 收集决策信号
    const decisionSignals = this.collectDecisionSignals(topicId, stageIndex, selection, topicMemory)

    // 3. 加载时间线上下文
    const timelineContext = this.buildTimelineContext(topicId, stageIndex, topicMemory)

    // 4. 构建能力上下文
    const capabilityContext = this.buildCapabilityContext(topicId, stageIndex, topicMemory)

    // 5. 收集锚点论文
    const anchorPaperIds = this.collectAnchorPapers(selection, topicMemory)

    return {
      contextId: this.generateContextId(),
      topicId,
      stageIndex,
      sourceBranchIds: selection.sourceBranchIds,
      sourceProblemNodeIds: selection.sourceProblemNodeIds,
      sourceAnchorPaperIds: anchorPaperIds,
      sourceNodeIds: this.getPreviousStageNodes(topicId, stageIndex, topicMemory),
      windowStart: timeWindow.start,
      windowEnd: timeWindow.end,
      windowMonths: timeWindow.months,
      decisionSignals,
      timelineContext,
      capabilityContext,
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * 确定时间窗
   * 从上一 stage 的最后节点时间开始
   */
  private determineTimeWindow(
    topicId: string,
    stageIndex: number,
    topicMemory: TopicMemory
  ): TimeWindow {
    // 如果显式指定了时间窗，直接使用
    if (this.options.explicitTimeWindow) {
      return this.options.explicitTimeWindow
    }

    // 从上一 stage 的最后节点时间开始
    const previousNodes = topicMemory.researchNodes?.filter(
      (n) => n.stageIndex === stageIndex - 1 && n.status === 'canonical'
    ) || []

    let startDate: Date
    if (previousNodes.length > 0) {
      // 使用上一 stage 最后节点的 discoveredAt
      const lastNode = previousNodes.sort(
        (a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime()
      )[0]
      startDate = new Date(lastNode.discoveredAt)
    } else {
      // 使用起源论文时间
      startDate = new Date(topicMemory.originPaper.published)
    }

    // 默认使用配置中的第一个时间窗
    const windowMonths = this.options.config.discovery.defaultWindowMonths[0] || 5
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + windowMonths)

    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      months: windowMonths,
    }
  }

  /**
   * 收集决策信号
   */
  private collectDecisionSignals(
    topicId: string,
    stageIndex: number,
    selection: StageSelectionResult,
    topicMemory: TopicMemory
  ): DecisionSignal[] {
    const signals: DecisionSignal[] = []

    // 从 decision log 中提取相关信号
    const relevantDecisions = topicMemory.decisionLog?.filter(
      (d) =>
        d.stageIndex === stageIndex - 1 ||
        d.affectedProblemIds.some((id) =>
          selection.sourceProblemNodeIds.includes(id)
        )
    ) || []

    for (const decision of relevantDecisions) {
      // 分支信号
      if (decision.action === 'branch_out' || decision.actionKind === 'branch') {
        signals.push({
          type: 'branch_out',
          source: decision.branchId || decision.affectedProblemIds[0] || '',
          description: decision.summary,
          confidence: 0.8,
          timestamp: decision.timestamp,
        })
      }

      // 合流信号
      if (decision.action === 'branch_merge' || decision.mergeTargetBranchIds) {
        signals.push({
          type: 'branch_merge',
          source: decision.branchId || '',
          target: decision.mergeTargetBranchIds?.[0],
          description: decision.summary,
          confidence: 0.85,
          timestamp: decision.timestamp,
        })
      }

      // 方法转变信号
      if (decision.action === 'method_shift') {
        signals.push({
          type: 'method_shift',
          source: decision.affectedProblemIds[0] || '',
          description: decision.summary,
          confidence: 0.75,
          timestamp: decision.timestamp,
        })
      }
    }

    // 从 branch registry 中提取活跃分支信号
    const activeBranches = topicMemory.branchRegistry?.filter(
      (b) =>
        b.stageIndex === stageIndex &&
        (b.status === 'active' || b.status === 'candidate')
    ) || []

    for (const branch of activeBranches) {
      if (branch.priorityScore > 0.8) {
        signals.push({
          type: 'capability_gap',
          source: branch.branchId,
          description: `高优先级分支 ${branch.label || branch.branchId} 需要填补能力缺口`,
          confidence: branch.priorityScore,
          timestamp: new Date().toISOString(),
        })
      }
    }

    return signals
  }

  /**
   * 构建时间线上下文
   */
  private buildTimelineContext(
    topicId: string,
    stageIndex: number,
    topicMemory: TopicMemory
  ): TimelineContext {
    // 获取上一 stage 的节点
    const previousNodes = topicMemory.researchNodes?.filter(
      (n) => n.stageIndex < stageIndex && n.status === 'canonical'
    ) || []

    const previousNodeContexts = previousNodes.map((n) => ({
      nodeId: n.nodeId,
      stageIndex: n.stageIndex,
      publishedDate: n.discoveredAt,
      paperId: n.primaryPaperId,
    }))

    // 构建 stage 边界
    const stageBoundaries: TimelineContext['stageBoundaries'] = []
    for (let i = 1; i <= stageIndex; i++) {
      const stageNodes = topicMemory.researchNodes?.filter(
        (n) => n.stageIndex === i && n.status === 'canonical'
      ) || []

      if (stageNodes.length > 0) {
        const dates = stageNodes.map((n) => new Date(n.discoveredAt))
        stageBoundaries.push({
          stageIndex: i,
          startDate: new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString(),
          endDate: new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString(),
        })
      }
    }

    return {
      previousNodes: previousNodeContexts,
      originPaper: topicMemory.originPaper,
      stageBoundaries,
    }
  }

  /**
   * 构建能力上下文
   */
  private buildCapabilityContext(
    topicId: string,
    stageIndex: number,
    topicMemory: TopicMemory
  ): CapabilityContext {
    // 从 capability refs 获取可用能力
    const availableCapabilities = topicMemory.capabilityRefs || []

    // 从 problem nodes 获取所需能力
    const requiredCapabilities = new Set<string>()
    const problemNodes = topicMemory.problemNodes || []
    for (const problem of problemNodes) {
      for (const cap of problem.requiredCapabilities || []) {
        requiredCapabilities.add(cap)
      }
    }

    // 计算能力缺口
    const gapCapabilities = Array.from(requiredCapabilities).filter(
      (cap) => !availableCapabilities.includes(cap)
    )

    return {
      availableCapabilities,
      requiredCapabilities: Array.from(requiredCapabilities),
      gapCapabilities,
    }
  }

  /**
   * 收集锚点论文
   */
  private collectAnchorPapers(
    selection: StageSelectionResult,
    topicMemory: TopicMemory
  ): string[] {
    const anchorIds: string[] = []

    // 从上一 stage 的节点中获取锚点
    const previousNodes = topicMemory.researchNodes?.filter(
      (n) =>
        n.stageIndex < selection.stageIndex &&
        (n.status === 'canonical' || n.status === 'provisional')
    ) || []

    for (const node of previousNodes) {
      anchorIds.push(node.primaryPaperId)
    }

    // 从分支注册表获取锚点
    for (const branchId of selection.sourceBranchIds) {
      const branch = topicMemory.branchRegistry?.find((b) => b.branchId === branchId)
      if (branch) {
        anchorIds.push(branch.anchorPaperId)
      }
    }

    return [...new Set(anchorIds)]
  }

  /**
   * 获取上一 stage 的节点 ID
   */
  private getPreviousStageNodes(
    topicId: string,
    stageIndex: number,
    topicMemory: TopicMemory
  ): string[] {
    const previousNodes = topicMemory.researchNodes?.filter(
      (n) => n.stageIndex === stageIndex - 1 && n.status === 'canonical'
    ) || []

    return previousNodes.map((n) => n.nodeId)
  }

  /**
   * 生成上下文 ID
   */
  private generateContextId(): string {
    return `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * 创建 Stage 上下文构建器
 */
export function createStageContextBuilder(
  config: SystemConfig,
  explicitTimeWindow?: TimeWindow
): StageContextBuilder {
  return new StageContextBuilder({ config, explicitTimeWindow })
}
