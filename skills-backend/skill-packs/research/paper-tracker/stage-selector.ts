/**
 * Stage 选择器
 * 负责选择当前要处理的 Stage，并收集该 Stage 的所有 active/candidate 分支
 */

import type { SystemConfig } from '../../../shared/config'
import type {
  StageSelectionResult,
  TimeWindow,
} from '../../../shared/stage-context'

/** 分支状态 */
export type BranchStatus = 'active' | 'candidate' | 'archived' | 'merged'

/** 分支信息 */
export interface BranchInfo {
  branchId: string
  stageIndex: number
  status: BranchStatus
  rootProblemNodeId: string
  anchorPaperId: string
  lastTrackedPaperId?: string
  label?: string
  priorityScore?: number
}

/** 决策记录 */
export interface DecisionRecord {
  stageIndex: number
  branchId?: string
  action?: string
  actionKind?: string
  summary: string
  timestamp: string
  affectedProblemIds: string[]
  mergeTargetBranchIds?: string[]
}

/** 问题节点 */
export interface ProblemNode {
  nodeId: string
  requiredCapabilities?: string[]
}

/** 主题记忆接口（简化版） */
export interface TopicMemory {
  topicId: string
  originPaper: {
    paperId: string
    published: string
  }
  branchRegistry: BranchInfo[]
  researchNodes: Array<{
    nodeId: string
    stageIndex: number
    status: string
    discoveredAt: string
    primaryPaperId: string
  }>
  decisionLog?: DecisionRecord[]
  capabilityRefs?: string[]
  problemNodes?: ProblemNode[]
}

export class StageSelector {
  constructor(private config: SystemConfig) {}

  /**
   * 选择 Stage
   * @param topicId 主题ID
   * @param topicMemory 主题记忆
   * @param explicitStageIndex 显式指定的 Stage 索引（可选）
   */
  selectStage(
    topicId: string,
    topicMemory: TopicMemory,
    explicitStageIndex?: number
  ): StageSelectionResult {
    // 1. 如果显式指定，直接使用
    if (explicitStageIndex !== undefined) {
      return this.selectExplicitStage(topicId, explicitStageIndex, topicMemory)
    }

    // 2. 获取所有 active/candidate 分支
    const branches = this.getActiveBranches(topicMemory)

    // 3. 边界情况: 无 active 分支
    if (branches.length === 0) {
      return this.handleNoActiveBranches(topicId, topicMemory)
    }

    // 4. 按 stageIndex 分组
    const stageGroups = this.groupByStageIndex(branches)

    // 5. 选择最小 stageIndex
    const stageIndices = Object.keys(stageGroups).map(Number).sort((a, b) => a - b)
    const minStageIndex = stageIndices[0]

    // 6. 收集该 stage 的所有分支
    const selectedBranches = stageGroups[minStageIndex]

    return {
      stageIndex: minStageIndex,
      sourceBranchIds: selectedBranches.map(b => b.branchId),
      sourceProblemNodeIds: selectedBranches.map(b => b.rootProblemNodeId),
      selectionReason: `最早未完成阶段: ${minStageIndex}，包含 ${selectedBranches.length} 个分支`,
      confidence: 0.95
    }
  }

  /**
   * 显式选择指定 Stage
   */
  private selectExplicitStage(
    topicId: string,
    stageIndex: number,
    topicMemory: TopicMemory
  ): StageSelectionResult {
    const branches = topicMemory.branchRegistry.filter(
      b => b.stageIndex === stageIndex && (b.status === 'active' || b.status === 'candidate')
    )

    if (branches.length === 0) {
      return {
        stageIndex,
        sourceBranchIds: [],
        sourceProblemNodeIds: [],
        selectionReason: `显式指定阶段 ${stageIndex}，但该阶段无 active/candidate 分支`,
        confidence: 0.7
      }
    }

    return {
      stageIndex,
      sourceBranchIds: branches.map(b => b.branchId),
      sourceProblemNodeIds: branches.map(b => b.rootProblemNodeId),
      selectionReason: `显式指定阶段 ${stageIndex}，包含 ${branches.length} 个分支`,
      confidence: 0.95
    }
  }

  /**
   * 处理无 active 分支的情况
   */
  private handleNoActiveBranches(
    topicId: string,
    topicMemory: TopicMemory
  ): StageSelectionResult {
    // 策略1: 查找最近完成的 stage，+1
    const lastCompletedStage = this.findLastCompletedStage(topicMemory)
    if (lastCompletedStage !== null) {
      return {
        stageIndex: lastCompletedStage + 1,
        sourceBranchIds: [],
        sourceProblemNodeIds: [],
        selectionReason: `无 active 分支，基于上一完成阶段 ${lastCompletedStage} +1`,
        confidence: 0.8
      }
    }

    // 策略2: 从起源开始
    return {
      stageIndex: 1,
      sourceBranchIds: [`branch:${topicId}:origin`],
      sourceProblemNodeIds: [`${topicId}:origin-problem`],
      selectionReason: '无 active 分支，从起源阶段开始',
      confidence: 1.0
    }
  }

  /**
   * 获取所有 active/candidate 分支
   */
  private getActiveBranches(topicMemory: TopicMemory): BranchInfo[] {
    return topicMemory.branchRegistry.filter(
      b => b.status === 'active' || b.status === 'candidate'
    )
  }

  /**
   * 按 stageIndex 分组
   */
  private groupByStageIndex(branches: BranchInfo[]): Record<number, BranchInfo[]> {
    return branches.reduce((groups, branch) => {
      const index = branch.stageIndex
      if (!groups[index]) {
        groups[index] = []
      }
      groups[index].push(branch)
      return groups
    }, {} as Record<number, BranchInfo[]>)
  }

  /**
   * 查找最近完成的 stage
   */
  private findLastCompletedStage(topicMemory: TopicMemory): number | null {
    const completedStages = topicMemory.researchNodes
      .filter(n => n.status === 'canonical')
      .map(n => n.stageIndex)

    if (completedStages.length === 0) {
      return null
    }

    return Math.max(...completedStages)
  }

  /**
   * 确定时间窗
   * 从上一 stage 的最后节点时间开始
   */
  determineTimeWindow(
    topicMemory: TopicMemory,
    stageIndex: number,
    existingWindow?: TimeWindow
  ): TimeWindow {
    // 如果已有时间窗，直接返回
    if (existingWindow) {
      return existingWindow
    }

    // 从上一 stage 的最后节点时间开始
    const previousNodes = topicMemory.researchNodes.filter(
      n => n.stageIndex === stageIndex - 1 && n.status === 'canonical'
    )

    let startDate: Date
    if (previousNodes.length > 0) {
      // 使用上一 stage 最后节点的 discoveredAt
      const lastNode = previousNodes[previousNodes.length - 1]
      startDate = new Date(lastNode.nodeId.split('-')[1] || Date.now()) // 从 nodeId 解析时间
      if (isNaN(startDate.getTime())) {
        startDate = new Date(topicMemory.originPaper.published)
      }
    } else {
      // 使用起源论文时间
      startDate = new Date(topicMemory.originPaper.published)
    }

    // 默认使用配置中的第一个时间窗
    const windowMonths = this.config.discovery.defaultWindowMonths[0] || 5
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + windowMonths)

    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      months: windowMonths
    }
  }

  /**
   * 扩展时间窗
   * 当候选不足时使用
   */
  extendTimeWindow(currentWindow: TimeWindow): TimeWindow {
    // 找到下一个时间窗大小
    const currentIndex = this.config.discovery.defaultWindowMonths.indexOf(currentWindow.months)
    const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0
    const newMonths = this.config.discovery.defaultWindowMonths[nextIndex]

    if (!newMonths || newMonths <= currentWindow.months) {
      // 已经是最大时间窗，扩展一个月
      const endDate = new Date(currentWindow.end)
      endDate.setMonth(endDate.getMonth() + 1)
      return {
        start: currentWindow.start,
        end: endDate.toISOString(),
        months: currentWindow.months + 1
      }
    }

    const endDate = new Date(currentWindow.start)
    endDate.setMonth(endDate.getMonth() + newMonths)

    return {
      start: currentWindow.start,
      end: endDate.toISOString(),
      months: newMonths
    }
  }
}
