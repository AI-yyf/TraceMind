/**
 * LLM 双轮查询引擎
 * 实现智能双轮发现：第一轮生成初始查询，第二轮基于结果扩搜
 */

import type { SystemConfig } from '../../../shared/config'
import type { StageContext, DiscoveryRound, TimeWindow } from '../../../shared/stage-context'

/** 查询定义 */
export interface Query {
  id: string
  text: string
  type: 'core' | 'method' | 'bridge' | 'merge' | 'transfer'
  targetProblemId?: string
  targetCapabilityId?: string
}

/** 搜索结果 */
export interface SearchResult {
  paperId: string
  title: string
  abstract: string
  published: string
  authors: string[]
  relevanceScore: number
  matchedQueryIds: string[]
  source: 'arxiv' | 'openalex' | 'semantic-scholar'
  pdfUrl?: string
  categories?: string[]
  citationCount?: number
}

/** 候选论文 */
export interface Candidate {
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
}

/** 发现结果 */
export interface DiscoveryResult {
  rounds: DiscoveryRound[]
  candidates: Candidate[]
  summary: {
    totalCandidates: number
    round1Count: number
    round2Count: number
    uniquePapers: number
    executionTimeMs: number
  }
}

/** 发现缺口 */
interface DiscoveryGap {
  type: 'problem_coverage' | 'capability_coverage' | 'confidence_threshold'
  description: string
  affectedProblemIds: string[]
  severity: 'low' | 'medium' | 'high'
}

export class DiscoveryEngine {
  private round1Results: SearchResult[] = []
  private startTime: number = 0

  constructor(
    private config: SystemConfig,
    private llmClient: {
      generate: (params: { prompt: string; temperature: number; maxTokens: number }) => Promise<{ text: string }>
    },
    private searchProviders: Array<{
      name: string
      search: (query: string, options: { from: string; to: string }) => Promise<SearchResult[]>
    }>
  ) {}

  /**
   * 执行发现流程
   */
  async discover(stageContext: StageContext): Promise<DiscoveryResult> {
    this.startTime = Date.now()
    const rounds: DiscoveryRound[] = []

    // 第一轮：生成并执行初始查询
    const round1 = await this.executeRound1(stageContext)
    rounds.push(round1)
    this.round1Results = round1.results

    // 评估是否需要第二轮
    const needsRound2 = this.shouldExecuteRound2(round1, stageContext)

    if (needsRound2 && this.config.discovery.enableRound2) {
      const round2 = await this.executeRound2(stageContext, round1)
      rounds.push(round2)
    }

    // 合并结果
    const allCandidates = this.mergeRounds(rounds)

    // 去重和排序
    const uniqueCandidates = this.deduplicateAndRank(allCandidates)

    return {
      rounds,
      candidates: uniqueCandidates,
      summary: {
        totalCandidates: uniqueCandidates.length,
        round1Count: round1.candidates.length,
        round2Count: rounds[1]?.candidates.length || 0,
        uniquePapers: new Set(uniqueCandidates.map((c) => c.paperId)).size,
        executionTimeMs: Date.now() - this.startTime,
      },
    }
  }

  /**
   * 执行第一轮查询
   */
  private async executeRound1(stageContext: StageContext): Promise<DiscoveryRound> {
    const roundStartTime = Date.now()

    // 生成查询包
    const queries = await this.generateRound1Queries(stageContext)

    // 执行搜索
    const results = await this.executeSearches(queries, {
      from: stageContext.windowStart,
      to: stageContext.windowEnd,
    })

    // 提取候选
    const candidates = this.extractCandidates(results, stageContext, 1)

    return {
      roundNumber: 1,
      queries: queries.map((q) => q.text),
      results,
      candidates,
      executionTime: Date.now() - roundStartTime,
    }
  }

  /**
   * 生成第一轮查询
   */
  private async generateRound1Queries(stageContext: StageContext): Promise<Query[]> {
    const prompt = this.buildRound1Prompt(stageContext)

    const response = await this.llmClient.generate({
      prompt,
      temperature: 0.7,
      maxTokens: 2000,
    })

    // 解析并验证查询
    const queries = this.parseQueries(response.text, 1)
    return this.validateQueries(queries)
  }

  /**
   * 构建第一轮提示词
   */
  private buildRound1Prompt(stageContext: StageContext): string {
    const { topicId, stageIndex, sourceProblemNodeIds, decisionSignals, capabilityContext } =
      stageContext

    return `作为学术研究追踪专家，请为以下主题生成搜索查询。

主题: ${topicId}
当前阶段: ${stageIndex}
时间范围: ${stageContext.windowStart} 至 ${stageContext.windowEnd}

问题节点:
${sourceProblemNodeIds.map((id) => `- ${id}`).join('\n')}

决策信号:
${decisionSignals.map((s) => `- [${s.type}] ${s.description}`).join('\n')}

可用能力:
${capabilityContext.availableCapabilities.join(', ')}

能力缺口:
${capabilityContext.gapCapabilities.join(', ')}

请生成 5-8 个搜索查询，覆盖：
1. 当前问题线的核心问题
2. 方法变体和替代方案
3. 引用桥接（连接相关工作的论文）
4. 潜在合流点
5. 跨分支迁移机会

每个查询应该是具体的学术搜索语句，包含关键术语和方法名称。

请以 JSON 格式返回：
{
  "queries": [
    {
      "text": "搜索查询文本",
      "type": "core|method|bridge|merge|transfer",
      "targetProblemId": "问题ID（可选）",
      "targetCapabilityId": "能力ID（可选）"
    }
  ]
}`
  }

  /**
   * 评估是否需要第二轮
   */
  private shouldExecuteRound2(round1: DiscoveryRound, stageContext: StageContext): boolean {
    // 条件1: 第一轮候选不足
    if (round1.candidates.length < this.config.discovery.minCandidatesThreshold) {
      return true
    }

    // 条件2: 存在明显缺口
    const gaps = this.identifyGaps(round1, stageContext)
    if (gaps.some((g) => g.severity === 'high')) {
      return true
    }

    // 条件3: 高置信度候选比例低
    const highConfidenceRatio =
      round1.candidates.filter((c) => c.confidence > 0.8).length / round1.candidates.length

    if (highConfidenceRatio < 0.3) {
      return true
    }

    return false
  }

  /**
   * 识别发现缺口
   */
  private identifyGaps(round1: DiscoveryRound, stageContext: StageContext): DiscoveryGap[] {
    const gaps: DiscoveryGap[] = []

    // 检查问题覆盖
    const coveredProblemIds = new Set<string>()
    for (const candidate of round1.candidates) {
      for (const id of candidate.matchedProblemNodeIds) {
        coveredProblemIds.add(id)
      }
    }

    const uncoveredProblems = stageContext.sourceProblemNodeIds.filter(
      (id) => !coveredProblemIds.has(id)
    )

    if (uncoveredProblems.length > 0) {
      gaps.push({
        type: 'problem_coverage',
        description: `以下问题节点无候选覆盖: ${uncoveredProblems.join(', ')}`,
        affectedProblemIds: uncoveredProblems,
        severity: uncoveredProblems.length > 2 ? 'high' : 'medium',
      })
    }

    // 检查能力覆盖
    const coveredCapabilities = new Set<string>()
    for (const candidate of round1.candidates) {
      // 从查询命中推断能力覆盖
      for (const hit of candidate.queryHits) {
        if (hit.queryText.includes('capability:')) {
          const cap = hit.queryText.split('capability:')[1]?.split(' ')[0]
          if (cap) coveredCapabilities.add(cap)
        }
      }
    }

    const gapCapabilities = stageContext.capabilityContext.gapCapabilities.filter(
      (cap) => !coveredCapabilities.has(cap)
    )

    if (gapCapabilities.length > 0) {
      gaps.push({
        type: 'capability_coverage',
        description: `以下能力缺口未填补: ${gapCapabilities.join(', ')}`,
        affectedProblemIds: [],
        severity: gapCapabilities.length > 1 ? 'medium' : 'low',
      })
    }

    return gaps
  }

  /**
   * 执行第二轮查询
   */
  private async executeRound2(
    stageContext: StageContext,
    round1: DiscoveryRound
  ): Promise<DiscoveryRound> {
    const roundStartTime = Date.now()

    // 分析第一轮结果，识别缺口
    const gaps = this.identifyGaps(round1, stageContext)

    // 生成补充查询
    const queries = await this.generateRound2Queries(stageContext, round1, gaps)

    // 扩展时间窗
    const extendedWindow = this.extendTimeWindow({
      start: stageContext.windowStart,
      end: stageContext.windowEnd,
      months: stageContext.windowMonths,
    })

    // 执行搜索
    const results = await this.executeSearches(queries, {
      from: extendedWindow.start,
      to: extendedWindow.end,
    })

    // 提取候选（排除第一轮已有的）
    const existingIds = new Set(round1.candidates.map((c) => c.paperId))
    const candidates = this.extractCandidates(results, stageContext, 2).filter(
      (c) => !existingIds.has(c.paperId)
    )

    return {
      roundNumber: 2,
      queries: queries.map((q) => q.text),
      results,
      candidates,
      executionTime: Date.now() - roundStartTime,
    }
  }

  /**
   * 生成第二轮查询
   */
  private async generateRound2Queries(
    stageContext: StageContext,
    round1: DiscoveryRound,
    gaps: DiscoveryGap[]
  ): Promise<Query[]> {
    const prompt = this.buildRound2Prompt(stageContext, round1, gaps)

    const response = await this.llmClient.generate({
      prompt,
      temperature: 0.8,
      maxTokens: 1500,
    })

    const queries = this.parseQueries(response.text, 2)
    return this.validateQueries(queries)
  }

  /**
   * 构建第二轮提示词
   */
  private buildRound2Prompt(
    stageContext: StageContext,
    round1: DiscoveryRound,
    gaps: DiscoveryGap[]
  ): string {
    return `基于第一轮搜索结果，请生成补充查询以填补发现缺口。

主题: ${stageContext.topicId}
当前阶段: ${stageContext.stageIndex}

第一轮结果摘要:
- 总候选数: ${round1.candidates.length}
- 高置信度候选: ${round1.candidates.filter((c) => c.confidence > 0.8).length}

发现的缺口:
${gaps.map((g) => `- [${g.severity}] ${g.description}`).join('\n')}

现有候选的论文ID:
${round1.candidates.map((c) => `- ${c.paperId}: ${c.title}`).join('\n')}

请生成 3-5 个补充查询，专注于：
1. 填补未覆盖的问题节点
2. 探索替代方法路径
3. 发现跨领域迁移机会

避免与第一轮查询重复，优先探索新的角度。

请以 JSON 格式返回：
{
  "queries": [
    {
      "text": "搜索查询文本",
      "type": "core|method|bridge|merge|transfer",
      "rationale": "为什么需要这个查询"
    }
  ]
}`
  }

  /**
   * 执行搜索
   */
  private async executeSearches(
    queries: Query[],
    timeRange: { from: string; to: string }
  ): Promise<SearchResult[]> {
    const allResults: SearchResult[] = []

    for (const provider of this.searchProviders) {
      for (const query of queries) {
        try {
          const results = await provider.search(query.text, timeRange)

          // 标记查询来源
          for (const result of results) {
            result.matchedQueryIds = [query.id]
            result.source = provider.name as SearchResult['source']
          }

          allResults.push(...results)
        } catch (error) {
          console.warn(`搜索失败 [${provider.name}]: ${query.text}`, error)
        }
      }
    }

    return allResults
  }

  /**
   * 提取候选
   */
  private extractCandidates(
    results: SearchResult[],
    stageContext: StageContext,
    roundNumber: number
  ): Candidate[] {
    const candidates: Candidate[] = []

    for (const result of results) {
      // 计算置信度
      const confidence = this.calculateConfidence(result, stageContext)

      // 低于阈值则跳过
      if (confidence < this.config.discovery.minConfidenceThreshold) {
        continue
      }

      candidates.push({
        paperId: result.paperId,
        title: result.title,
        abstract: result.abstract,
        published: result.published,
        authors: result.authors,
        matchedBranchIds: this.inferMatchedBranches(result, stageContext),
        matchedProblemNodeIds: this.inferMatchedProblems(result, stageContext),
        discoveryRounds: [roundNumber],
        queryHits: result.matchedQueryIds.map((id) => ({
          queryId: id,
          queryText: '', // 从查询映射获取
          relevanceScore: result.relevanceScore,
        })),
        discoveryChannels: [result.source],
        confidence,
      })
    }

    return candidates
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(result: SearchResult, stageContext: StageContext): number {
    let score = result.relevanceScore

    // 时间相关性加分
    const published = new Date(result.published)
    const windowStart = new Date(stageContext.windowStart)
    const windowEnd = new Date(stageContext.windowEnd)

    if (published >= windowStart && published <= windowEnd) {
      score += 0.1
    }

    // 引用关系加分（如果有）
    // TODO: 检查与锚点论文的引用关系

    return Math.min(1, score)
  }

  /**
   * 推断匹配的分支
   */
  private inferMatchedBranches(result: SearchResult, stageContext: StageContext): string[] {
    // 基于查询匹配和论文内容推断
    return stageContext.sourceBranchIds.slice(0, 2)
  }

  /**
   * 推断匹配的问题节点
   */
  private inferMatchedProblems(result: SearchResult, stageContext: StageContext): string[] {
    // 基于查询匹配和论文内容推断
    return stageContext.sourceProblemNodeIds.slice(0, 2)
  }

  /**
   * 合并多轮结果
   */
  private mergeRounds(rounds: DiscoveryRound[]): Candidate[] {
    const candidateMap = new Map<string, Candidate>()

    for (const round of rounds) {
      for (const candidate of round.candidates) {
        const existing = candidateMap.get(candidate.paperId)

        if (existing) {
          // 合并轮次信息
          existing.discoveryRounds = [
            ...new Set([...existing.discoveryRounds, ...candidate.discoveryRounds]),
          ]
          existing.queryHits = [...existing.queryHits, ...candidate.queryHits]
          existing.discoveryChannels = [
            ...new Set([...existing.discoveryChannels, ...candidate.discoveryChannels]),
          ]
          existing.confidence = Math.max(existing.confidence, candidate.confidence)
        } else {
          candidateMap.set(candidate.paperId, { ...candidate })
        }
      }
    }

    return Array.from(candidateMap.values())
  }

  /**
   * 去重和排序
   */
  private deduplicateAndRank(candidates: Candidate[]): Candidate[] {
    // 按置信度排序
    return candidates.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * 解析查询
   */
  private parseQueries(text: string, roundNumber: number): Query[] {
    try {
      // 尝试解析 JSON
      const parsed = JSON.parse(text)
      if (parsed.queries && Array.isArray(parsed.queries)) {
        return parsed.queries.map((q: Record<string, string>, index: number) => ({
          id: `q${roundNumber}-${index}`,
          text: q.text || '',
          type: (q.type as Query['type']) || 'core',
          targetProblemId: q.targetProblemId,
          targetCapabilityId: q.targetCapabilityId,
        }))
      }
    } catch {
      // JSON 解析失败，使用文本解析
      const lines = text.split('\n').filter((l) => l.trim().startsWith('- ') || l.trim().match(/^\d+\./))
      return lines.map((line, index) => ({
        id: `q${roundNumber}-${index}`,
        text: line.replace(/^[-\d.\s]+/, '').trim(),
        type: 'core',
      }))
    }

    return []
  }

  /**
   * 验证查询
   */
  private validateQueries(queries: Query[]): Query[] {
    return queries.filter((q) => {
      // 非空检查
      if (!q.text || q.text.trim().length < 5) return false

      // 长度检查
      if (q.text.length > 500) return false

      return true
    })
  }

  /**
   * 扩展时间窗
   */
  private extendTimeWindow(current: TimeWindow): TimeWindow {
    const months = this.config.discovery.defaultWindowMonths
    const currentIndex = months.indexOf(current.months)
    const nextMonths = currentIndex >= 0 && currentIndex < months.length - 1 ? months[currentIndex + 1] : current.months + 2

    const endDate = new Date(current.start)
    endDate.setMonth(endDate.getMonth() + nextMonths)

    return {
      start: current.start,
      end: endDate.toISOString(),
      months: nextMonths,
    }
  }
}

/**
 * 创建发现引擎
 */
export function createDiscoveryEngine(
  config: SystemConfig,
  llmClient: DiscoveryEngine['llmClient'],
  searchProviders: DiscoveryEngine['searchProviders']
): DiscoveryEngine {
  return new DiscoveryEngine(config, llmClient, searchProviders)
}
