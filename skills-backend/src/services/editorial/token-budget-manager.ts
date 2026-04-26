/**
 * Token Budget Manager - Token预算管理
 *
 * 确保深度分析时有效利用模型窗口，避免超限失败。
 * 支持分段处理、优先级裁剪、预算分配策略。
 */

export interface TokenBudgetConfig {
  /** 总预算 (默认32000) */
  totalBudget: number
  /** 保留给输出的预算比例 (默认0.3) */
  outputReserveRatio: number
  /** 是否启用优先级裁剪 */
  enablePriorityTrimming: boolean
  /** 各部分优先级权重 */
  priorityWeights: {
    title: number
    abstract: number
    methodology: number
    results: number
    discussion: number
    figures: number
    tables: number
    formulas: number
  }
}

export interface SectionBudget {
  sectionId: string
  allocated: number
  used: number
  priority: number
}

const DEFAULT_CONFIG: TokenBudgetConfig = {
  totalBudget: 32000,
  outputReserveRatio: 0.3,
  enablePriorityTrimming: true,
  priorityWeights: {
    title: 1.0,
    abstract: 0.9,
    methodology: 1.0,
    results: 1.0,
    discussion: 0.8,
    figures: 0.7,
    tables: 0.7,
    formulas: 0.6,
  },
}

export class TokenBudgetManager {
  private config: TokenBudgetConfig
  private allocations: Map<string, SectionBudget> = new Map()

  constructor(config?: Partial<TokenBudgetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 计算可用输入预算
   */
  getAvailableInputBudget(): number {
    return Math.floor(this.config.totalBudget * (1 - this.config.outputReserveRatio))
  }

  /**
   * 为章节分配预算
   */
  allocateSections(
    sections: Array<{
      id: string
      type: 'methodology' | 'experiment' | 'result' | 'introduction' | 'discussion' | 'other'
      estimatedTokens: number
    }>
  ): Map<string, number> {
    const totalInputBudget = this.getAvailableInputBudget()
    const totalEstimated = sections.reduce((sum, s) => sum + s.estimatedTokens, 0)

    const allocations = new Map<string, number>()

    if (totalEstimated <= totalInputBudget) {
      // 不需要裁剪
      sections.forEach((s) => allocations.set(s.id, s.estimatedTokens))
    } else {
      // 需要按优先级分配
      const prioritized = sections
        .map((s) => ({
          ...s,
          priority: this.getSectionPriority(s.type),
        }))
        .sort((a, b) => b.priority - a.priority)

      let remaining = totalInputBudget
      for (const section of prioritized) {
        const allocated = Math.min(section.estimatedTokens, remaining)
        allocations.set(section.id, allocated)
        remaining -= allocated
        if (remaining <= 0) break
      }
    }

    // 同步到 this.allocations 以支持 recordUsage 和 getBudgetStats
    this.allocations.clear()
    sections.forEach((s) => {
      const allocated = allocations.get(s.id) ?? 0
      this.allocations.set(s.id, {
        sectionId: s.id,
        allocated,
        used: 0,
        priority: this.getSectionPriority(s.type),
      })
    })

    return allocations
  }

  /**
   * 获取章节优先级
   */
  private getSectionPriority(type: string): number {
    const weights = this.config.priorityWeights
    switch (type) {
      case 'methodology':
        return weights.methodology
      case 'experiment':
        return weights.results
      case 'result':
        return weights.results
      case 'discussion':
        return weights.discussion
      case 'introduction':
        return weights.abstract
      default:
        return 0.5
    }
  }

  /**
   * 估算文本Token数
   */
  estimateTokens(text: string): number {
    // 简化估算: 中文约0.5字/token，英文约0.25字/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = text.length - chineseChars
    return Math.ceil(chineseChars * 2 + otherChars * 0.25)
  }

  /**
   * 裁剪文本到预算内
   */
  trimToBudget(text: string, budget: number): string {
    const estimated = this.estimateTokens(text)
    if (estimated <= budget) return text

    // 按段落裁剪，保留优先级高的段落
    const paragraphs = text.split(/\n\n+/)
    let result = ''
    let currentTokens = 0

    for (const para of paragraphs) {
      const paraTokens = this.estimateTokens(para)
      if (currentTokens + paraTokens <= budget) {
        result += para + '\n\n'
        currentTokens += paraTokens
      } else {
        break
      }
    }

    return result.trim()
  }

  /**
   * 分配证据预算
   */
  allocateEvidenceBudget(evidence: {
    figures: number
    tables: number
    formulas: number
  }): { figures: number; tables: number; formulas: number } {
    const totalInputBudget = this.getAvailableInputBudget()
    const evidenceBudget = totalInputBudget * 0.3 // 30%用于证据

    const total = evidence.figures + evidence.tables + evidence.formulas
    if (total === 0) return { figures: 0, tables: 0, formulas: 0 }

    const ratio = evidenceBudget / total
    return {
      figures: Math.floor(evidence.figures * ratio),
      tables: Math.floor(evidence.tables * ratio),
      formulas: Math.floor(evidence.formulas * ratio),
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TokenBudgetConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TokenBudgetConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 重置分配
   */
  resetAllocations(): void {
    this.allocations.clear()
  }

  /**
   * 记录使用量
   */
  recordUsage(sectionId: string, used: number): void {
    const allocation = this.allocations.get(sectionId)
    if (allocation) {
      allocation.used = used
    }
  }

  /**
   * 获取分配信息
   */
  getAllocation(sectionId: string): SectionBudget | undefined {
    return this.allocations.get(sectionId)
  }

  /**
   * 获取所有分配
   */
  getAllAllocations(): Map<string, SectionBudget> {
    return new Map(this.allocations)
  }

  /**
   * 计算剩余预算
   */
  getRemainingBudget(): number {
    const totalUsed = Array.from(this.allocations.values()).reduce((sum, a) => sum + a.used, 0)
    return this.getAvailableInputBudget() - totalUsed
  }

  /**
   * 检查是否超预算
   */
  isOverBudget(): boolean {
    return this.getRemainingBudget() < 0
  }

  /**
   * 获取预算使用统计
   */
  getBudgetStats(): {
    totalBudget: number
    inputBudget: number
    outputBudget: number
    used: number
    remaining: number
    utilizationRate: number
  } {
    const inputBudget = this.getAvailableInputBudget()
    const used = Array.from(this.allocations.values()).reduce((sum, a) => sum + a.used, 0)
    const remaining = inputBudget - used

    return {
      totalBudget: this.config.totalBudget,
      inputBudget,
      outputBudget: Math.floor(this.config.totalBudget * this.config.outputReserveRatio),
      used,
      remaining,
      utilizationRate: inputBudget > 0 ? used / inputBudget : 0,
    }
  }
}
