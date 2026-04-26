/**
 * Research Quality Assessment Module
 *
 * Provides quality evaluation functions for iterative research refinement.
 * Implements the "polish loop" pattern for continuous improvement.
 */

import { prisma } from '../../../src/lib/prisma'
import { loadTopicResearchJudgmentState } from '../../../src/services/generation/research-judgment-store'
import { logger } from '../../../src/utils/logger'

export interface QualityAssessment {
  nodeStabilityScore: number    // 0-1, 节点稳定性（论文数量）
  evidenceCoverageScore: number // 0-1, 证据覆盖度（figures/tables/formulas）
  judgmentDensityScore: number  // 0-1, 判断密度
  contentQualityScore: number   // 0-1, 内容质量（fullArticleFlow存在性）
  overallScore: number          // 加权综合
  gaps: string[]               // 待修复的缺口
  details: {
    nodeCount: number
    nodesWithPapers: number
    paperCount: number
    papersWithEvidence: number
    judgmentCount: number
    nodesWithContent: number
  }
}

const QUALITY_WEIGHTS = {
  nodeStability: 0.25,
  evidenceCoverage: 0.30,
  judgmentDensity: 0.20,
  contentQuality: 0.25,
}

const QUALITY_THRESHOLD = 0.65
const STALL_QUALITY_THRESHOLD = 0.45

/**
 * Assess research quality for a topic at a specific stage.
 * Returns scores and identified gaps.
 */
export async function assessResearchQuality(args: {
  topicId: string
  stageIndex?: number
}): Promise<QualityAssessment> {
  const { topicId, stageIndex } = args

  // Fetch nodes and papers
  const nodes = await prisma.research_nodes.findMany({
    where: {
      topicId,
      ...(stageIndex !== undefined ? { stageIndex } : {}),
    },
    include: {
      node_papers: {
        include: {
          papers: {
            include: {
              figures: true,
              tables: true,
              formulas: true,
            },
          },
        },
      },
    },
  })

  // Fetch all papers for the topic
  const papers = await prisma.papers.findMany({
    where: { topicId },
    include: {
      figures: true,
      tables: true,
      formulas: true,
    },
  })

  // Load judgment state
  const judgmentState = await loadTopicResearchJudgmentState(topicId)

  // Calculate scores
  const details = {
    nodeCount: nodes.length,
    nodesWithPapers: nodes.filter(n => n.node_papers.length > 0).length,
    paperCount: papers.length,
    papersWithEvidence: papers.filter(p =>
      p.figures.length > 0 || p.tables.length > 0 || p.formulas.length > 0
    ).length,
    judgmentCount: judgmentState.judgments.length,
    nodesWithContent: nodes.filter(n => n.fullArticleFlow && n.fullArticleFlow.length > 100).length,
  }

  // Node stability: average papers per node
  const nodeStabilityScore = nodes.length > 0
    ? nodes.reduce((sum: number, node: { node_papers: unknown[] }) => {
        const paperCount = node.node_papers.length
        // 3-5 papers = stable (0.8), 1-2 = forming (0.5), 0 = nascent (0.2)
        const score = paperCount >= 3 ? 0.8 : paperCount >= 1 ? 0.5 : 0.2
        return sum + score
      }, 0) / nodes.length
    : 0.2 // No nodes = nascent

  // Evidence coverage: percentage of papers with evidence
  const evidenceCoverageScore = papers.length > 0
    ? details.papersWithEvidence / papers.length
    : 0

  // Judgment density: number of judgments relative to target
  const judgmentDensityScore = Math.min(1, judgmentState.judgments.length / 20)

  // Content quality: percentage of nodes with meaningful content
  const contentQualityScore = nodes.length > 0
    ? details.nodesWithContent / nodes.length
    : 0

  // Overall score (weighted average)
  const overallScore =
    nodeStabilityScore * QUALITY_WEIGHTS.nodeStability +
    evidenceCoverageScore * QUALITY_WEIGHTS.evidenceCoverage +
    judgmentDensityScore * QUALITY_WEIGHTS.judgmentDensity +
    contentQualityScore * QUALITY_WEIGHTS.contentQuality

  // Identify gaps
  const gaps: string[] = []
  if (nodeStabilityScore < 0.6) gaps.push('节点论文数不足')
  if (evidenceCoverageScore < 0.5) gaps.push('证据提取不完整')
  if (judgmentDensityScore < 0.4) gaps.push('判断记录稀疏')
  if (contentQualityScore < 0.6) gaps.push('节点内容待完善')

  const assessment: QualityAssessment = {
    nodeStabilityScore,
    evidenceCoverageScore,
    judgmentDensityScore,
    contentQualityScore,
    overallScore,
    gaps,
    details,
  }

  logger.info('Research quality assessment', {
    topicId,
    stageIndex,
    overallScore,
    gaps,
    details,
  })

  return assessment
}

/**
 * Determine if quality meets threshold for progressing.
 */
export function qualityMeetsThreshold(assessment: QualityAssessment): boolean {
  return assessment.overallScore >= QUALITY_THRESHOLD
}

/**
 * Determine if quality is critically low.
 */
export function qualityIsCritical(assessment: QualityAssessment): boolean {
  return assessment.overallScore < STALL_QUALITY_THRESHOLD
}

/**
 * Get refinement strategy based on gaps.
 */
export function getRefinementStrategy(gaps: string[]): {
  action: 'add-papers' | 'extract-evidence' | 'generate-judgments' | 'generate-content' | 'none'
  priority: number
} {
  if (gaps.includes('节点论文数不足')) {
    return { action: 'add-papers', priority: 1 }
  }
  if (gaps.includes('证据提取不完整')) {
    return { action: 'extract-evidence', priority: 2 }
  }
  if (gaps.includes('判断记录稀疏')) {
    return { action: 'generate-judgments', priority: 3 }
  }
  if (gaps.includes('节点内容待完善')) {
    return { action: 'generate-content', priority: 4 }
  }
  return { action: 'none', priority: 0 }
}

export const QUALITY_THRESHOLDS = {
  QUALITY_THRESHOLD,
  STALL_QUALITY_THRESHOLD,
}

export default {
  assessResearchQuality,
  qualityMeetsThreshold,
  qualityIsCritical,
  getRefinementStrategy,
  QUALITY_THRESHOLDS,
}
