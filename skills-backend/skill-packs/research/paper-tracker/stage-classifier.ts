/**
 * Stage 分类器
 * 实现"LLM 主判，时间辅判"的 Stage 归属判定
 */

import type { SystemConfig } from '../../../shared/config'
import type { StageContext } from '../../../shared/stage-context'
import type { Candidate } from './discovery-engine'

/** Stage 分类结果 */
export interface StageClassification {
  candidate: Candidate
  assignedStage: 'current' | 'next' | 'future'
  confidence: number
  reasoning: string
  factors: {
    problemDepth: number // 问题推进深度 (0-1)
    methodLevel: number // 方法层级 (0-1)
    ideaSpan: number // 思想跨度 (0-1)
    dependencyLevel: number // 对前一节点依赖程度 (0-1)
    temporalDistance: number // 时间距离（月）
  }
}

/** 分类结果桶 */
export interface ClassificationBuckets {
  currentStage: StageClassification[]
  nextStage: StageClassification[]
  rejected: StageClassification[]
}

export class StageClassifier {
  constructor(
    private config: SystemConfig,
    private llmClient: {
      generate: (params: { prompt: string; temperature: number; maxTokens: number }) => Promise<{ text: string }>
    }
  ) {}

  /**
   * 批量分类候选
   */
  async classify(candidates: Candidate[], stageContext: StageContext): Promise<ClassificationBuckets> {
    const classifications: StageClassification[] = []

    for (const candidate of candidates) {
      const classification = await this.classifySingle(candidate, stageContext)
      classifications.push(classification)
    }

    // 分桶
    return this.bucketClassifications(classifications)
  }

  /**
   * 分类单个候选
   */
  private async classifySingle(candidate: Candidate, stageContext: StageContext): Promise<StageClassification> {
    // 计算各维度得分
    const factors = await this.calculateFactors(candidate, stageContext)

    // 使用 LLM 进行综合判断
    const llmResult = await this.llmClassify(candidate, stageContext, factors)

    // 验证和修正
    return this.validateAndAdjust(llmResult, factors, stageContext)
  }

  /**
   * 计算各维度得分
   */
  private async calculateFactors(candidate: Candidate, stageContext: StageContext): Promise<StageClassification['factors']> {
    const published = new Date(candidate.published)
    const windowStart = new Date(stageContext.windowStart)
    const windowEnd = new Date(stageContext.windowEnd)

    // 时间距离（月）
    const temporalDistance = Math.max(0, (published.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24 * 30))

    // 问题推进深度（基于匹配的 problem node 层级）
    const problemDepth = this.calculateProblemDepth(candidate, stageContext)

    // 方法层级（基于论文标题和摘要中的方法关键词）
    const methodLevel = this.calculateMethodLevel(candidate, stageContext)

    // 思想跨度（基于与锚点论文的引用关系）
    const ideaSpan = await this.calculateIdeaSpan(candidate, stageContext)

    // 依赖程度（基于与上一 stage 节点的关联）
    const dependencyLevel = this.calculateDependencyLevel(candidate, stageContext)

    return {
      problemDepth,
      methodLevel,
      ideaSpan,
      dependencyLevel,
      temporalDistance,
    }
  }

  /**
   * 计算问题推进深度
   */
  private calculateProblemDepth(candidate: Candidate, stageContext: StageContext): number {
    // 基于匹配的 problem node 的层级
    const matchedProblems = candidate.matchedProblemNodeIds
    if (matchedProblems.length === 0) return 0.5

    // 简单实现：匹配的问题越多，深度越高
    return Math.min(1, 0.3 + matchedProblems.length * 0.2)
  }

  /**
   * 计算方法层级
   */
  private calculateMethodLevel(candidate: Candidate, stageContext: StageContext): number {
    const text = `${candidate.title} ${candidate.abstract}`.toLowerCase()

    // 方法层级关键词
    const foundationalMethods = ['baseline', 'standard', 'basic', 'traditional', 'conventional']
    const advancedMethods = ['novel', 'advanced', 'sophisticated', 'state-of-the-art', 'cutting-edge']
    const innovativeMethods = ['breakthrough', 'paradigm', 'revolutionary', 'transformative']

    let score = 0.5 // 默认中等

    if (foundationalMethods.some((kw) => text.includes(kw))) score -= 0.2
    if (advancedMethods.some((kw) => text.includes(kw))) score += 0.2
    if (innovativeMethods.some((kw) => text.includes(kw))) score += 0.4

    return Math.max(0, Math.min(1, score))
  }

  /**
   * 计算思想跨度
   */
  private async calculateIdeaSpan(candidate: Candidate, stageContext: StageContext): number {
    // TODO: 基于引用关系计算
    // 简化实现：基于作者数量和机构多样性
    const authorCount = candidate.authors.length
    return Math.min(1, 0.3 + authorCount * 0.1)
  }

  /**
   * 计算依赖程度
   */
  private calculateDependencyLevel(candidate: Candidate, stageContext: StageContext): number {
    // 基于与上一 stage 节点的引用关系
    const previousNodeIds = stageContext.sourceNodeIds
    if (previousNodeIds.length === 0) return 0.5

    // 简化实现：基于时间接近度
    const candidateDate = new Date(candidate.published)
    const previousDates = stageContext.timelineContext.previousNodes.map((n) => new Date(n.publishedDate))

    if (previousDates.length === 0) return 0.5

    const avgPreviousDate = new Date(previousDates.reduce((sum, d) => sum + d.getTime(), 0) / previousDates.length)
    const timeDiff = Math.abs(candidateDate.getTime() - avgPreviousDate.getTime())
    const monthsDiff = timeDiff / (1000 * 60 * 60 * 24 * 30)

    // 时间越接近，依赖程度越高
    return Math.max(0, Math.min(1, 1 - monthsDiff / 12))
  }

  /**
   * LLM 分类
   */
  private async llmClassify(
    candidate: Candidate,
    stageContext: StageContext,
    factors: StageClassification['factors']
  ): Promise<Pick<StageClassification, 'assignedStage' | 'confidence' | 'reasoning'>> {
    const prompt = this.buildClassificationPrompt(candidate, stageContext, factors)

    const response = await this.llmClient.generate({
      prompt,
      temperature: 0.3,
      maxTokens: 800,
    })

    return this.parseClassificationResponse(response.text)
  }

  /**
   * 构建分类提示词
   */
  private buildClassificationPrompt(
    candidate: Candidate,
    stageContext: StageContext,
    factors: StageClassification['factors']
  ): string {
    return `请判断以下论文属于哪个研究阶段。

论文信息:
- ID: ${candidate.paperId}
- 标题: ${candidate.title}
- 发表时间: ${candidate.published}
- 摘要: ${candidate.abstract.slice(0, 300)}...

当前阶段信息:
- 主题: ${stageContext.topicId}
- 当前阶段: ${stageContext.stageIndex}
- 时间窗: ${stageContext.windowStart} 至 ${stageContext.windowEnd}
- 来源分支: ${stageContext.sourceBranchIds.join(', ')}

评估维度:
- 问题推进深度: ${factors.problemDepth.toFixed(2)}
- 方法层级: ${factors.methodLevel.toFixed(2)}
- 思想跨度: ${factors.ideaSpan.toFixed(2)}
- 对前一节点依赖: ${factors.dependencyLevel.toFixed(2)}
- 时间距离: ${factors.temporalDistance.toFixed(1)} 月

请判断该论文属于：
- current: 当前阶段（${stageContext.stageIndex}）
- next: 下一阶段（${stageContext.stageIndex + 1}）
- future: 更远的未来阶段

请以 JSON 格式返回：
{
  "assignedStage": "current|next|future",
  "confidence": 0.0-1.0,
  "reasoning": "判断理由"
}`
  }

  /**
   * 解析分类响应
   */
  private parseClassificationResponse(text: string): Pick<StageClassification, 'assignedStage' | 'confidence' | 'reasoning'> {
    try {
      const parsed = JSON.parse(text)
      return {
        assignedStage: parsed.assignedStage || 'current',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || '未提供理由',
      }
    } catch {
      // 解析失败，使用默认值
      return {
        assignedStage: 'current',
        confidence: 0.5,
        reasoning: '解析失败，默认归为当前阶段',
      }
    }
  }

  /**
   * 验证和修正分类结果
   */
  private validateAndAdjust(
    llmResult: Pick<StageClassification, 'assignedStage' | 'confidence' | 'reasoning'>,
    factors: StageClassification['factors'],
    stageContext: StageContext
  ): StageClassification {
    let assignedStage = llmResult.assignedStage
    let reasoning = llmResult.reasoning
    let confidence = llmResult.confidence

    // 规则1: 如果时间跨度超过 2 年，强制归为 next 或 future
    if (factors.temporalDistance > 24) {
      if (assignedStage === 'current') {
        assignedStage = 'next'
        reasoning += ' [自动修正: 时间跨度超过2年，调整为next stage]'
        confidence *= 0.9
      }
    }

    // 规则2: 如果依赖程度很高，强制归为 current
    if (factors.dependencyLevel > 0.8 && assignedStage !== 'current') {
      assignedStage = 'current'
      reasoning += ' [自动修正: 对前一节点高度依赖，调整为current stage]'
      confidence = Math.max(confidence, 0.8)
    }

    // 规则3: 只允许 current 和 next，future 视为 next
    if (assignedStage === 'future') {
      assignedStage = 'next'
      reasoning += ' [自动修正: future 调整为 next stage]'
    }

    return {
      candidate: {} as Candidate, // 将在外层填充
      assignedStage: assignedStage as StageClassification['assignedStage'],
      confidence,
      reasoning,
      factors,
    }
  }

  /**
   * 分桶
   */
  private bucketClassifications(classifications: StageClassification[]): ClassificationBuckets {
    const buckets: ClassificationBuckets = {
      currentStage: [],
      nextStage: [],
      rejected: [],
    }

    for (const classification of classifications) {
      // 置信度低于阈值则拒绝
      if (classification.confidence < this.config.discovery.minConfidenceThreshold) {
        buckets.rejected.push(classification)
        continue
      }

      switch (classification.assignedStage) {
        case 'current':
          buckets.currentStage.push(classification)
          break
        case 'next':
          buckets.nextStage.push(classification)
          break
        default:
          buckets.rejected.push(classification)
      }
    }

    return buckets
  }

  /**
   * 获取分类统计
   */
  getClassificationStats(buckets: ClassificationBuckets): {
    total: number
    current: number
    next: number
    rejected: number
    avgConfidence: number
  } {
    const total = buckets.currentStage.length + buckets.nextStage.length + buckets.rejected.length
    const allClassifications = [...buckets.currentStage, ...buckets.nextStage, ...buckets.rejected]
    const avgConfidence =
      total > 0 ? allClassifications.reduce((sum, c) => sum + c.confidence, 0) / total : 0

    return {
      total,
      current: buckets.currentStage.length,
      next: buckets.nextStage.length,
      rejected: buckets.rejected.length,
      avgConfidence,
    }
  }
}

/**
 * 创建 Stage 分类器
 */
export function createStageClassifier(
  config: SystemConfig,
  llmClient: StageClassifier['llmClient']
): StageClassifier {
  return new StageClassifier(config, llmClient)
}
