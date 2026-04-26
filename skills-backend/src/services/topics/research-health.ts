import { prisma } from '../../lib/prisma'

export type ResearchHealthStatus = 'excellent' | 'ready' | 'needs-attention' | 'insufficient'
export type ResearchHealthIssueCode =
  | 'no-topics'
  | 'low-paper-depth'
  | 'low-node-depth'
  | 'missing-figures'
  | 'missing-tables'
  | 'missing-formulas'
  | 'missing-sections'

export interface ResearchHealthIssue {
  code: ResearchHealthIssueCode
  severity: 'info' | 'warning' | 'critical'
  i18nKey: string
  values: Record<string, number>
}

export interface ResearchHealthTopicSummary {
  id: string
  nameZh: string
  nameEn: string | null
  paperCount: number
  nodeCount: number
  maxPapersOnNode: number
  articleNodeCount: number
  paperAssetCoverage: {
    total: number
    withFigures: number
    withTables: number
    withFormulas: number
    withSections: number
  }
}

export interface ResearchHealthReport {
  status: ResearchHealthStatus
  i18nKey: string
  totals: {
    topics: number
    papers: number
    nodes: number
    articleNodes: number
    maxPapersOnNode: number
    papersWithFigures: number
    papersWithTables: number
    papersWithFormulas: number
    papersWithSections: number
  }
  thresholds: {
    canonicalTopics: number
    targetPapersPerNode: number
    maxPapersPerStage: number
  }
  issues: ResearchHealthIssue[]
  recommendations: Array<{
    i18nKey: string
    values: Record<string, number>
  }>
  topics: ResearchHealthTopicSummary[]
}

const CANONICAL_TOPIC_TARGET = 5
const TARGET_PAPERS_PER_NODE = 10
const MAX_PAPERS_PER_STAGE = 200

function hasArticleFlow(node: { fullArticleFlow: string | null; fullContent: string | null }) {
  return Boolean(node.fullArticleFlow?.trim() || node.fullContent?.trim())
}

function createIssue(
  code: ResearchHealthIssueCode,
  severity: ResearchHealthIssue['severity'],
  values: Record<string, number>,
): ResearchHealthIssue {
  return {
    code,
    severity,
    i18nKey: `research.health.issue.${code}`,
    values,
  }
}

function divide(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function resolveStatus(issues: ResearchHealthIssue[]): ResearchHealthStatus {
  if (issues.some((issue) => issue.severity === 'critical')) return 'insufficient'
  if (issues.some((issue) => issue.severity === 'warning')) return 'needs-attention'
  if (issues.length > 0) return 'ready'
  return 'excellent'
}

export async function buildResearchHealthReport(): Promise<ResearchHealthReport> {
  const topics = await prisma.topics.findMany({
    orderBy: { id: 'asc' },
    include: {
      research_nodes: {
        select: {
          id: true,
          fullArticleFlow: true,
          fullContent: true,
          _count: { select: { node_papers: true } },
        },
      },
      papers: {
        select: {
          id: true,
          _count: {
            select: {
              figures: true,
              tables: true,
              formulas: true,
              paper_sections: true,
            },
          },
        },
      },
    },
  })

  const topicSummaries: ResearchHealthTopicSummary[] = topics.map((topic) => {
    const withFigures = topic.papers.filter((paper) => paper._count.figures > 0).length
    const withTables = topic.papers.filter((paper) => paper._count.tables > 0).length
    const withFormulas = topic.papers.filter((paper) => paper._count.formulas > 0).length
    const withSections = topic.papers.filter((paper) => paper._count.paper_sections > 0).length

    return {
      id: topic.id,
      nameZh: topic.nameZh,
      nameEn: topic.nameEn,
      paperCount: topic.papers.length,
      nodeCount: topic.research_nodes.length,
      maxPapersOnNode: Math.max(0, ...topic.research_nodes.map((node) => node._count.node_papers)),
      articleNodeCount: topic.research_nodes.filter(hasArticleFlow).length,
      paperAssetCoverage: {
        total: topic.papers.length,
        withFigures,
        withTables,
        withFormulas,
        withSections,
      },
    }
  })

  const totals = topicSummaries.reduce(
    (acc, topic) => {
      acc.papers += topic.paperCount
      acc.nodes += topic.nodeCount
      acc.articleNodes += topic.articleNodeCount
      acc.maxPapersOnNode = Math.max(acc.maxPapersOnNode, topic.maxPapersOnNode)
      acc.papersWithFigures += topic.paperAssetCoverage.withFigures
      acc.papersWithTables += topic.paperAssetCoverage.withTables
      acc.papersWithFormulas += topic.paperAssetCoverage.withFormulas
      acc.papersWithSections += topic.paperAssetCoverage.withSections
      return acc
    },
    {
      topics: topicSummaries.length,
      papers: 0,
      nodes: 0,
      articleNodes: 0,
      maxPapersOnNode: 0,
      papersWithFigures: 0,
      papersWithTables: 0,
      papersWithFormulas: 0,
      papersWithSections: 0,
    },
  )

  const issues: ResearchHealthIssue[] = []
  if (totals.topics === 0) {
    issues.push(createIssue('no-topics', 'critical', { expected: CANONICAL_TOPIC_TARGET, actual: 0 }))
  }
  if (totals.papers < totals.topics * TARGET_PAPERS_PER_NODE) {
    issues.push(
      createIssue('low-paper-depth', 'warning', {
        expected: totals.topics * TARGET_PAPERS_PER_NODE,
        actual: totals.papers,
      }),
    )
  }
  if (totals.maxPapersOnNode < TARGET_PAPERS_PER_NODE) {
    issues.push(
      createIssue('low-node-depth', 'warning', {
        expected: TARGET_PAPERS_PER_NODE,
        actual: totals.maxPapersOnNode,
      }),
    )
  }
  if (divide(totals.papersWithFigures, totals.papers) < 0.95) {
    issues.push(createIssue('missing-figures', 'warning', { expected: totals.papers, actual: totals.papersWithFigures }))
  }
  if (divide(totals.papersWithTables, totals.papers) < 0.5) {
    issues.push(createIssue('missing-tables', 'warning', { expected: Math.ceil(totals.papers * 0.5), actual: totals.papersWithTables }))
  }
  if (divide(totals.papersWithFormulas, totals.papers) < 0.5) {
    issues.push(createIssue('missing-formulas', 'warning', { expected: Math.ceil(totals.papers * 0.5), actual: totals.papersWithFormulas }))
  }
  if (divide(totals.papersWithSections, totals.papers) < 0.95) {
    issues.push(createIssue('missing-sections', 'warning', { expected: totals.papers, actual: totals.papersWithSections }))
  }

  const status = resolveStatus(issues)

  return {
    status,
    i18nKey: `research.health.status.${status}`,
    totals,
    thresholds: {
      canonicalTopics: CANONICAL_TOPIC_TARGET,
      targetPapersPerNode: TARGET_PAPERS_PER_NODE,
      maxPapersPerStage: MAX_PAPERS_PER_STAGE,
    },
    issues,
    recommendations: issues.map((issue) => ({
      i18nKey: `research.health.recommendation.${issue.code}`,
      values: issue.values,
    })),
    topics: topicSummaries,
  }
}
