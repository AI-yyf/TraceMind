/**
 * 节点归并引擎
 * 实现多分支同论文、同分支多论文的节点归并
 * 集成多模态分析和内容生成
 */

import type { SystemConfig } from '../../../shared/config'
import type { StageContext } from '../../../shared/stage-context'
import type {
  ResearchNode,
  NodeCreationProps,
  MergeRecord,
} from '../../../shared/research-node'
import { createResearchNode } from '../../../shared/research-node'
import type { Candidate } from './discovery-engine'
import type { ClassificationBuckets } from './stage-classifier'
import type { MultiModalClient } from '../../../shared/multimodal-client'
import type { FigureAnalyzer, CompleteFigure } from '../../../shared/figure-analyzer'
import type { MultiPaperContentGenerator, PaperAssets, MultiPaperContent } from '../../../shared/multi-paper-generator'
import type { PDFExtractor, PDFExtractionResult } from '../../../shared/pdf-extractor'
import type { TrackerPaper } from '../../../shared/research-node'

/** 归并结果 */
export interface MergeResult {
  nodes: ResearchNode[]
  provisionalNodes: ResearchNode[]
  mergeRecords: MergeRecord[]
  conflicts: MergeConflict[]
  stats: {
    totalCandidates: number
    mergedNodes: number
    singlePaperNodes: number
    multiPaperNodes: number
  }
}

/** 归并冲突 */
export interface MergeConflict {
  type: 'paper_count_exceeded' | 'time_span_exceeded' | 'contradictory_merge'
  description: string
  affectedPaperIds: string[]
  suggestedAction: 'split' | 'warn' | 'ignore'
}

/** 论文分组 */
interface PaperGroup {
  paperId: string
  candidates: Candidate[]
  branches: string[]
}

/** 分支分组 */
interface BranchGroup {
  branchId: string
  papers: string[]
  mergeReason?: string
  confidence?: number
}

// 扩展的节点数据，包含完整内容
export interface EnrichedResearchNode extends ResearchNode {
  fullContent?: {
    summary: {
      oneLine: string
      keyContribution: string
      mainResults: string[]
    }
    narrative: {
      title: string
      subtitle: string
      openingStandfirst: string
      sections: Array<{
        title: string
        paragraphs: Array<{
          text: string
          figures?: string[]
          tables?: string[]
          formulas?: string[]
        }>
      }>
      closingHandoff: string
    }
    details: {
      title: string
      subtitle: string
      openingStandfirst: string
      sections: Array<{
        title: string
        paragraphs: Array<{
          text: string
          figures?: string[]
          tables?: string[]
          formulas?: string[]
        }>
      }>
      closingHandoff: string
    }
  }
  assets?: {
    figures: CompleteFigure[]
    tables: PDFExtractionResult['tables']
    formulas: PDFExtractionResult['formulas']
  }
  representativeFigure?: {
    id: string
    url: string
    caption: string
    paperId: string
    paperTitle: string
  } | null
}

// 论文元数据（用于提取）
interface PaperMetadata {
  paperId: string
  title: string
  authors: string[]
  year: number
  pdfUrl?: string
}

export class NodeMerger {
  constructor(
    private config: SystemConfig,
    private llmClient: {
      generate: (params: { prompt: string; temperature: number; maxTokens: number }) => Promise<{ text: string }>
    },
    private multimodalClient?: MultiModalClient,
    private figureAnalyzer?: FigureAnalyzer,
    private contentGenerator?: MultiPaperContentGenerator,
    private pdfExtractor?: PDFExtractor
  ) {}

  /**
   * 执行节点归并
   */
  async merge(
    buckets: ClassificationBuckets,
    stageContext: StageContext
  ): Promise<MergeResult> {
    const conflicts: MergeConflict[] = []
    const mergeRecords: MergeRecord[] = []

    // 1. 处理 current stage 候选
    const currentCandidates = buckets.currentStage.map((c) => c.candidate)
    const currentNodes = await this.mergeCandidates(currentCandidates, stageContext, conflicts, mergeRecords)

    // 2. 处理 next stage 候选（provisional）
    const nextCandidates = buckets.nextStage.map((c) => c.candidate)
    const provisionalNodes = await this.mergeCandidates(nextCandidates, stageContext, conflicts, mergeRecords, true)

    // 3. 验证节点约束
    const validatedCurrentNodes = this.validateNodeConstraints(currentNodes, conflicts)
    const validatedProvisionalNodes = this.validateNodeConstraints(provisionalNodes, conflicts)

    // 4. 生成统计
    const stats = this.generateStats(currentCandidates, validatedCurrentNodes)

    return {
      nodes: validatedCurrentNodes,
      provisionalNodes: validatedProvisionalNodes,
      mergeRecords,
      conflicts,
      stats,
    }
  }

  /**
   * 归并候选
   */
  private async mergeCandidates(
    candidates: Candidate[],
    stageContext: StageContext,
    conflicts: MergeConflict[],
    mergeRecords: MergeRecord[],
    isProvisional: boolean = false
  ): Promise<ResearchNode[]> {
    if (candidates.length === 0) return []

    // 步骤1: 按 paperId 分组（多分支同论文强制归并）
    const paperGroups = this.groupByPaperId(candidates)

    // 步骤2: 同分支多论文归并（需 LLM 判定）
    const branchGroups = await this.mergeWithinBranches(paperGroups, stageContext, conflicts)

    // 步骤3: 创建节点
    const nodes: ResearchNode[] = []
    for (const group of branchGroups) {
      const node = await this.createNodeFromGroup(group, stageContext, isProvisional)
      nodes.push(node)

      // 记录归并历史
      if (group.papers.length > 1) {
        mergeRecords.push({
          type: 'merge',
          timestamp: new Date().toISOString(),
          sourceNodeIds: group.papers.map((p) => `paper-${p}`),
          reason: group.mergeReason,
        })
      }
    }

    return nodes
  }

  /**
   * 按 paperId 分组
   * 同一篇论文被多个分支命中时，强制归并为一个节点
   */
  private groupByPaperId(candidates: Candidate[]): PaperGroup[] {
    const paperMap = new Map<string, PaperGroup>()

    for (const candidate of candidates) {
      const existing = paperMap.get(candidate.paperId)

      if (existing) {
        // 合并分支信息
        existing.candidates.push(candidate)
        for (const branchId of candidate.matchedBranchIds) {
          if (!existing.branches.includes(branchId)) {
            existing.branches.push(branchId)
          }
        }
      } else {
        paperMap.set(candidate.paperId, {
          paperId: candidate.paperId,
          candidates: [candidate],
          branches: [...candidate.matchedBranchIds],
        })
      }
    }

    return Array.from(paperMap.values())
  }

  /**
   * 同分支内多论文归并
   */
  private async mergeWithinBranches(
    paperGroups: PaperGroup[],
    stageContext: StageContext,
    conflicts: MergeConflict[]
  ): Promise<BranchGroup[]> {
    // 按分支分组
    const branchPaperMap = new Map<string, string[]>()

    for (const group of paperGroups) {
      for (const branchId of group.branches) {
        const existing = branchPaperMap.get(branchId) || []
        if (!existing.includes(group.paperId)) {
          existing.push(group.paperId)
        }
        branchPaperMap.set(branchId, existing)
      }
    }

    const result: BranchGroup[] = []

    for (const [branchId, paperIds] of branchPaperMap) {
      if (paperIds.length === 1) {
        // 单论文，无需归并
        result.push({
          branchId,
          papers: paperIds,
          mergeReason: '单论文，无需归并',
        })
      } else {
        // 多论文，需要 LLM 判定是否归并
        const shouldMerge = await this.shouldMergePapers(paperIds, stageContext, branchId)

        if (shouldMerge.merge) {
          result.push({
            branchId,
            papers: paperIds,
            mergeReason: shouldMerge.reason,
            confidence: shouldMerge.confidence,
          })
        } else {
          // 不归并，每篇论文独立成节点
          for (const paperId of paperIds) {
            result.push({
              branchId,
              papers: [paperId],
              mergeReason: 'LLM判定不归并',
            })
          }
        }
      }
    }

    return result
  }

  /**
   * 判定是否应该归并多篇论文
   */
  private async shouldMergePapers(
    paperIds: string[],
    stageContext: StageContext,
    branchId: string
  ): Promise<{ merge: boolean; reason: string; confidence: number }> {
    // 预检查: 约束条件
    if (paperIds.length > this.config.nodeMerge.maxPapersPerNode) {
      return {
        merge: false,
        reason: `论文数量${paperIds.length}超过限制${this.config.nodeMerge.maxPapersPerNode}`,
        confidence: 1.0,
      }
    }

    // 检查时间跨度
    const timeSpanCheck = await this.checkTimeSpan(paperIds)
    if (!timeSpanCheck.valid) {
      return {
        merge: false,
        reason: timeSpanCheck.reason,
        confidence: 1.0,
      }
    }

    // LLM 判定
    const prompt = this.buildMergeEvaluationPrompt(paperIds, stageContext, branchId)

    try {
      const response = await this.llmClient.generate({
        prompt,
        temperature: 0.3,
        maxTokens: 500,
      })

      return this.parseMergeDecision(response.text)
    } catch {
      // LLM 失败时，默认不归并
      return {
        merge: false,
        reason: 'LLM判定失败，默认不归并',
        confidence: 0.5,
      }
    }
  }

  /**
   * 检查论文时间跨度
   */
  private async checkTimeSpan(paperIds: string[]): Promise<{ valid: boolean; reason?: string }> {
    // 获取论文发布时间
    const paperDates = await this.getPaperPublishDates(paperIds)
    
    if (paperDates.length < 2) {
      return { valid: true }
    }

    // 计算时间跨度（月）
    const dates = paperDates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime())
    const earliest = dates[0]
    const latest = dates[dates.length - 1]
    
    const monthsDiff = (latest.getFullYear() - earliest.getFullYear()) * 12 + 
                       (latest.getMonth() - earliest.getMonth())

    if (monthsDiff > this.config.nodeMerge.maxTimeSpanMonths) {
      return {
        valid: false,
        reason: `论文时间跨度${monthsDiff}个月超过限制${this.config.nodeMerge.maxTimeSpanMonths}个月`
      }
    }

    return { valid: true }
  }

  /**
   * 获取论文发布时间
   */
  private async getPaperPublishDates(paperIds: string[]): Promise<string[]> {
    // 这里应该从数据库获取论文发布时间
    // 简化实现：返回模拟数据
    // 实际实现应该查询数据库
    return paperIds.map(() => new Date().toISOString())
  }

  /**
   * 构建归并评估提示词
   */
  private buildMergeEvaluationPrompt(
    paperIds: string[],
    stageContext: StageContext,
    branchId: string
  ): string {
    return `请判断以下论文是否应该归并为同一个研究节点。

分支: ${branchId}
主题: ${stageContext.topicId}
阶段: ${stageContext.stageIndex}

论文列表:
${paperIds.map((id) => `- ${id}`).join('\n')}

归并判定标准:
1. 解决的是同一问题层
2. 推进的是同一方法动作
3. 彼此不是明显前后依赖关系
4. 可以被视为同一个研究节点的不同方面

请以 JSON 格式返回：
{
  "merge": true|false,
  "reason": "归并或不归并的理由",
  "confidence": 0.0-1.0
}`
  }

  /**
   * 解析归并决策
   */
  private parseMergeDecision(text: string): { merge: boolean; reason: string; confidence: number } {
    try {
      const parsed = JSON.parse(text)
      return {
        merge: !!parsed.merge,
        reason: parsed.reason || '未提供理由',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
      }
    } catch {
      // 解析失败，尝试文本匹配
      const merge = text.toLowerCase().includes('"merge": true')
      return {
        merge,
        reason: merge ? '基于文本匹配判定归并' : '基于文本匹配判定不归并',
        confidence: 0.6,
      }
    }
  }

  /**
   * 从分组创建节点（增强版，支持多模态分析）
   */
  private async createNodeFromGroup(
    group: BranchGroup,
    stageContext: StageContext,
    isProvisional: boolean,
    paperMetadataMap?: Map<string, PaperMetadata>
  ): Promise<EnrichedResearchNode> {
    // 获取主论文（第一个）
    const primaryPaperId = group.papers[0]

    // 收集来源分支
    const sourceBranchIds = [group.branchId]

    // 收集来源问题节点
    const sourceProblemNodeIds = stageContext.sourceProblemNodeIds

    // 基础节点属性
    const props: NodeCreationProps = {
      topicId: stageContext.topicId,
      stageIndex: stageContext.stageIndex,
      paperIds: group.papers,
      primaryPaperId,
      sourceBranchIds,
      sourceProblemNodeIds,
      nodeLabel: '', // 稍后填充
      nodeSummary: '', // 稍后填充
      isMergeNode: group.papers.length > 1,
    }

    const node = createResearchNode(props) as EnrichedResearchNode

    // 如果启用了多模态分析且有多篇论文，执行完整流程
    if (group.papers.length > 1 && this.config.contentGen.enableMultimodal) {
      try {
        await this.enrichMultiPaperNode(node, group, paperMetadataMap)
      } catch (error) {
        console.error('Failed to enrich multi-paper node:', error)
        // 降级为基础内容生成
        const { label, summary } = await this.generateNodeContent(group, stageContext)
        node.nodeLabel = label
        node.nodeSummary = summary
      }
    } else {
      // 单论文或禁用多模态，使用基础内容生成
      const { label, summary } = await this.generateNodeContent(group, stageContext)
      node.nodeLabel = label
      node.nodeSummary = summary
    }

    // 设置 provisional 状态
    if (isProvisional) {
      node.status = 'provisional'
      node.provisional = true
    }

    return node
  }

  /**
   * 丰富多论文节点内容
   * 执行PDF提取、图片分析、内容生成等完整流程
   */
  private async enrichMultiPaperNode(
    node: EnrichedResearchNode,
    group: BranchGroup,
    paperMetadataMap?: Map<string, PaperMetadata>
  ): Promise<void> {
    if (!this.pdfExtractor || !this.figureAnalyzer || !this.contentGenerator) {
      throw new Error('Required services not initialized for multi-paper enrichment')
    }

    // 1. 收集所有论文的PDF素材
    const paperAssets: PaperAssets[] = []

    for (const paperId of group.papers) {
      const metadata = paperMetadataMap?.get(paperId)
      if (!metadata) continue

      try {
        // 提取PDF内容
        let extractionResult: PDFExtractionResult

        if (metadata.pdfUrl) {
          extractionResult = await this.pdfExtractor.extractFromUrl(
            metadata.pdfUrl,
            paperId,
            metadata.title
          )
        } else {
          // 如果没有PDF URL，创建空结果
          extractionResult = {
            paperId,
            paperTitle: metadata.title,
            figures: [],
            tables: [],
            formulas: [],
            text: { fullText: '', pages: [] },
            metadata: { pageCount: 0 }
          }
        }

        // 2. 使用多模态模型深度分析所有图表
        const analyzedFigures = await this.figureAnalyzer.analyzeFigures(extractionResult.figures)

        paperAssets.push({
          paperId,
          paperTitle: metadata.title,
          authors: metadata.authors,
          year: metadata.year,
          figures: analyzedFigures,
          tables: extractionResult.tables,
          formulas: extractionResult.formulas,
          text: extractionResult.text
        })
      } catch (error) {
        console.error(`Failed to process paper ${paperId}:`, error)
        // 继续处理其他论文
      }
    }

    if (paperAssets.length === 0) {
      throw new Error('No paper assets could be extracted')
    }

    // 3. 调用多论文内容生成
    const multiPaperContent = await this.contentGenerator.generate(paperAssets)

    // 4. 填充节点数据
    this.populateNodeWithContent(node, multiPaperContent, paperAssets)
  }

  /**
   * 使用生成的内容填充节点
   */
  private populateNodeWithContent(
    node: EnrichedResearchNode,
    content: MultiPaperContent,
    paperAssets: PaperAssets[]
  ): void {
    // 基础信息
    node.nodeLabel = content.title
    node.nodeSubtitle = content.subtitle
    node.nodeSummary = content.summary.oneLine
    node.nodeExplanation = content.narrative.openingStandfirst

    // 完整内容
    node.fullContent = {
      summary: content.summary,
      narrative: content.narrative,
      details: content.details
    }

    // 代表性图片
    node.representativeFigure = content.representativeFigure

    // 全量素材
    node.assets = {
      figures: paperAssets.flatMap(a => a.figures),
      tables: paperAssets.flatMap(a => a.tables),
      formulas: paperAssets.flatMap(a => a.formulas)
    }
  }

  /**
   * 生成节点内容
   */
  private async generateNodeContent(
    group: BranchGroup,
    stageContext: StageContext
  ): Promise<{ label: string; summary: string }> {
    if (group.papers.length === 1) {
      // 单论文节点，使用论文标题
      return {
        label: `节点 ${group.papers[0].slice(0, 8)}`,
        summary: `基于论文 ${group.papers[0]} 的研究节点`,
      }
    }

    // 多论文节点，需要生成统一标签
    return {
      label: `合并节点 (${group.papers.length}篇)`,
      summary: `包含 ${group.papers.length} 篇相关论文的研究节点。${group.mergeReason || ''}`,
    }
  }

  /**
   * 验证节点约束
   */
  private validateNodeConstraints(nodes: ResearchNode[], conflicts: MergeConflict[]): ResearchNode[] {
    return nodes.map((node) => {
      const warnings: string[] = []

      // 检查论文数量
      if (node.paperIds.length > this.config.nodeMerge.maxPapersPerNode) {
        warnings.push(`论文数量${node.paperIds.length}超过建议值${this.config.nodeMerge.maxPapersPerNode}`)
        conflicts.push({
          type: 'paper_count_exceeded',
          description: `节点 ${node.nodeId} 包含 ${node.paperIds.length} 篇论文，超过限制`,
          affectedPaperIds: node.paperIds,
          suggestedAction: 'split',
        })
      }

      // 检查时间跨度
      const timeSpanWarning = await this.checkNodeTimeSpan(node)
      if (timeSpanWarning) {
        warnings.push(timeSpanWarning)
        conflicts.push({
          type: 'time_span_exceeded',
          description: timeSpanWarning,
          affectedPaperIds: node.paperIds,
          suggestedAction: 'review',
        })
      }

      if (warnings.length > 0) {
        node.warnings = warnings
      }

      return node
    })
  }

  /**
   * 检查节点时间跨度
   */
  private async checkNodeTimeSpan(node: ResearchNode): Promise<string | null> {
    const paperDates = await this.getPaperPublishDates(node.paperIds)
    
    if (paperDates.length < 2) {
      return null
    }

    const dates = paperDates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime())
    const earliest = dates[0]
    const latest = dates[dates.length - 1]
    
    const monthsDiff = (latest.getFullYear() - earliest.getFullYear()) * 12 + 
                       (latest.getMonth() - earliest.getMonth())

    if (monthsDiff > this.config.nodeMerge.maxTimeSpanMonths) {
      return `节点论文时间跨度${monthsDiff}个月，超过建议值${this.config.nodeMerge.maxTimeSpanMonths}个月`
    }

    return null
  }

  /**
   * 生成统计
   */
  private generateStats(candidates: Candidate[], nodes: ResearchNode[]) {
    const singlePaperNodes = nodes.filter((n) => n.paperIds.length === 1).length
    const multiPaperNodes = nodes.filter((n) => n.paperIds.length > 1).length

    return {
      totalCandidates: candidates.length,
      mergedNodes: multiPaperNodes,
      singlePaperNodes,
      multiPaperNodes,
    }
  }

  /**
   * 拆分节点
   */
  async splitNode(node: ResearchNode, splitSpec: { paperGroups: string[][] }): Promise<ResearchNode[]> {
    if (node.paperIds.length < 2) {
      throw new Error('单论文节点不可拆分')
    }

    const newNodes: ResearchNode[] = []

    for (let i = 0; i < splitSpec.paperGroups.length; i++) {
      const paperGroup = splitSpec.paperGroups[i]
      const primaryPaperId = paperGroup[0]

      const props: NodeCreationProps = {
        topicId: node.topicId,
        stageIndex: node.stageIndex,
        paperIds: paperGroup,
        primaryPaperId,
        sourceBranchIds: node.sourceBranchIds,
        sourceProblemNodeIds: node.sourceProblemNodeIds,
        nodeLabel: `${node.nodeLabel} (拆分${i + 1})`,
        nodeSummary: `从节点 ${node.nodeId} 拆分出的子节点`,
        isMergeNode: false,
      }

      const newNode = createResearchNode(props)
      newNode.previousVersion = node.nodeId
      newNodes.push(newNode)
    }

    return newNodes
  }
}

/**
 * 创建节点归并引擎（基础版）
 */
export function createNodeMerger(
  config: SystemConfig,
  llmClient: NodeMerger['llmClient']
): NodeMerger {
  return new NodeMerger(config, llmClient)
}

/**
 * 创建增强型节点归并引擎（支持多模态分析）
 */
export function createEnrichedNodeMerger(
  config: SystemConfig,
  llmClient: NodeMerger['llmClient'],
  multimodalClient: MultiModalClient,
  figureAnalyzer: FigureAnalyzer,
  contentGenerator: MultiPaperContentGenerator,
  pdfExtractor: PDFExtractor
): NodeMerger {
  return new NodeMerger(
    config,
    llmClient,
    multimodalClient,
    figureAnalyzer,
    contentGenerator,
    pdfExtractor
  )
}
