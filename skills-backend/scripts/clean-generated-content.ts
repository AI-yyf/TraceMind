import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface CleanupStats {
  topics: { updated: number }
  researchNodes: { updated: number }
  papers: { updated: number }
  paperSections: { preserved: number }
  figures: { updated: number }
  systemConfigs: { deleted: number }
}

type TopicScope = {
  topicIds: string[]
  paperIds: string[]
  nodeIds: string[]
}

function parseArgs() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const topicIdArg = args.find((arg) => arg.startsWith('--topic-id='))
  const topicId = topicIdArg ? topicIdArg.split('=')[1] : null

  return { dryRun, topicId }
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

async function collectTopicScope(topicId: string | null): Promise<TopicScope> {
  const topics = await prisma.topics.findMany({
    where: topicId ? { id: topicId } : {},
    select: {
      id: true,
      papers: {
        select: { id: true },
      },
      research_nodes: {
        select: { id: true },
      },
    },
  })

  return {
    topicIds: uniqueIds(topics.map((topic) => topic.id)),
    paperIds: uniqueIds(topics.flatMap((topic) => topic.papers.map((paper) => paper.id))),
    nodeIds: uniqueIds(topics.flatMap((topic) => topic.research_nodes.map((node) => node.id))),
  }
}

function buildSystemConfigFilters(scope: TopicScope, topicId: string | null) {
  if (topicId) {
    return [
      { key: { startsWith: `alpha:topic-artifact:${topicId}:` } },
      { key: { startsWith: `generation-artifact-index:v1:${topicId}` } },
      { key: { startsWith: `generation-memory:v1:${topicId}` } },
      { key: { startsWith: `generation-judgments:v1:${topicId}` } },
      { key: { startsWith: `topic-research-world:v1:${topicId}` } },
      { key: { startsWith: `topic:session-memory:v1:${topicId}` } },
      { key: { startsWith: `topic:guidance-ledger:v1:${topicId}` } },
      { key: `topic:${topicId}:research-report` },
      { key: { startsWith: `discovery:${topicId}` } },
      ...scope.paperIds.map((id) => ({ key: { startsWith: `alpha:reader-artifact:paper:${id}` } })),
      ...scope.nodeIds.map((id) => ({ key: { startsWith: `alpha:reader-artifact:node:${id}` } })),
    ]
  }

  return [
    { key: { startsWith: 'alpha:topic-artifact:' } },
    { key: { startsWith: 'alpha:reader-artifact:' } },
    { key: { startsWith: 'generation-artifact-index:v1:' } },
    { key: { startsWith: 'generation-memory:v1:' } },
    { key: { startsWith: 'generation-judgments:v1:' } },
    { key: { startsWith: 'topic-research-world:v1:' } },
    { key: { startsWith: 'topic:session-memory:v1:' } },
    { key: { startsWith: 'topic:guidance-ledger:v1:' } },
    { key: { contains: ':research-report' } },
    { key: { startsWith: 'discovery:' } },
  ]
}

async function getPreviewStats(topicId: string | null): Promise<CleanupStats> {
  const topicFilter = topicId ? { topicId } : {}
  const scope = await collectTopicScope(topicId)
  const configFilters = buildSystemConfigFilters(scope, topicId)

  const [
    topicsCount,
    researchNodesCount,
    papersCount,
    paperSectionsCount,
    figuresCount,
    systemConfigCount,
  ] = await Promise.all([
    prisma.topics.count({ where: topicId ? { id: topicId } : {} }),
    prisma.research_nodes.count({ where: topicFilter }),
    prisma.papers.count({ where: topicFilter }),
    prisma.paper_sections.count({
      where: topicId ? { papers: { topicId } } : {},
    }),
    prisma.figures.count({
      where: topicId ? { papers: { topicId } } : {},
    }),
    configFilters.length > 0 ? prisma.system_configs.count({ where: { OR: configFilters } }) : 0,
  ])

  return {
    topics: { updated: topicsCount },
    researchNodes: { updated: researchNodesCount },
    papers: { updated: papersCount },
    paperSections: { preserved: paperSectionsCount },
    figures: { updated: figuresCount },
    systemConfigs: { deleted: systemConfigCount },
  }
}

async function executeCleanup(topicId: string | null): Promise<CleanupStats> {
  const topicFilter = topicId ? { topicId } : {}
  const scope = await collectTopicScope(topicId)
  const configFilters = buildSystemConfigFilters(scope, topicId)

  const result = await prisma.$transaction(async (tx) => {
    const topicsResult = await tx.topics.updateMany({
      where: topicId ? { id: topicId } : {},
      data: {
        summary: null,
        description: null,
      },
    })

    const researchNodesResult = await tx.research_nodes.updateMany({
      where: topicFilter,
      data: {
        nodeSummary: '',
        nodeExplanation: null,
        fullContent: null,
        fullArticleFlow: null,
        editorialPromptHash: null,
      },
    })

    const papersResult = await tx.papers.updateMany({
      where: topicFilter,
      data: {
        summary: '',
        explanation: null,
      },
    })

    const paperSectionsCount = await tx.paper_sections.count({
      where: topicId ? { papers: { topicId } } : {},
    })

    const figuresResult = await tx.figures.updateMany({
      where: topicId ? { papers: { topicId } } : {},
      data: {
        analysis: null,
      },
    })

    const systemConfigsResult =
      configFilters.length > 0
        ? await tx.system_configs.deleteMany({
            where: {
              OR: configFilters,
            },
          })
        : { count: 0 }

    return {
      topics: { updated: topicsResult.count },
      researchNodes: { updated: researchNodesResult.count },
      papers: { updated: papersResult.count },
      paperSections: { preserved: paperSectionsCount },
      figures: { updated: figuresResult.count },
      systemConfigs: { deleted: systemConfigsResult.count },
    }
  })

  return result
}

function printStats(stats: CleanupStats, dryRun: boolean) {
  const action = dryRun ? 'Would affect' : 'Affected'
  console.log(`\n${'='.repeat(50)}`)
  console.log(`${action} records:`)
  console.log('='.repeat(50))
  console.log(`  Topics:         ${stats.topics.updated} (summary, description -> NULL)`)
  console.log(
    `  Research nodes: ${stats.researchNodes.updated} (summary/explanation/article fields cleared)`,
  )
  console.log(`  Papers:         ${stats.papers.updated} (summary/explanation cleared)`)
  console.log(`  Paper sections: ${stats.paperSections.preserved} (preserved as source evidence)`)
  console.log(`  Figures:        ${stats.figures.updated} (analysis -> NULL)`)
  console.log(`  System configs: ${stats.systemConfigs.deleted} (derived caches deleted)`)
  console.log('='.repeat(50))

  if (dryRun) {
    console.log('\nDRY RUN: no changes were made.\n')
  } else {
    console.log('\nCleanup completed successfully.\n')
  }
}

async function main() {
  const { dryRun, topicId } = parseArgs()

  console.log('\nGenerated Content Cleanup Script')
  console.log('-'.repeat(50))
  console.log(`Target: ${topicId ? topicId : 'ALL topics'}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)

  const stats = dryRun ? await getPreviewStats(topicId) : await executeCleanup(topicId)
  printStats(stats, dryRun)
}

void main()
  .catch((error) => {
    console.error('\nCleanup failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
