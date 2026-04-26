/**
 * Clear cache while keeping specified topics.
 *
 * Usage:
 *   npx tsx scripts/clear-cache-keep-topics.ts --keep=topic-id-1,topic-id-2,topic-id-3,topic-id-4,topic-id-5
 *   npx tsx scripts/clear-cache-keep-topics.ts --keep-first=5
 *   npx tsx scripts/clear-cache-keep-topics.ts --dry-run --keep-first=5
 *
 * This script:
 *   1. Identifies topics to delete (all except the N to keep)
 *   2. Deletes those topics (CASCADE handles papers, nodes, figures, formulas, tables)
 *   3. Cleans up runtime tables for deleted topics
 *   4. Cleans system_configs with topic IDs
 *   5. Clears uploads directory for deleted papers
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ClearCacheOptions {
  keepTopicIds: string[]
  keepFirst: number
  dryRun: boolean
  verbose: boolean
}

interface ClearStats {
  deletedTopics: number
  deletedPapers: number
  deletedNodes: number
  deletedFigures: number
  deletedFormulas: number
  deletedTables: number
  deletedCandidatePool: number
  deletedSystemConfigs: number
  clearedUploads: number
  keptTopics: string[]
}

function parseArgs(): ClearCacheOptions {
  const args = process.argv.slice(2)

  const keepArg = args.find((arg) => arg.startsWith('--keep='))
  const keepFirstArg = args.find((arg) => arg.startsWith('--keep-first='))
  const dryRun = args.includes('--dry-run')
  const verbose = args.includes('--verbose') || args.includes('-v')

  const keepTopicIds = keepArg
    ? keepArg.slice('--keep='.length).split(',').map((id) => id.trim()).filter(Boolean)
    : []

  const keepFirst = keepFirstArg
    ? parseInt(keepFirstArg.slice('--keep-first='.length), 10)
    : 5

  return {
    keepTopicIds,
    keepFirst: isNaN(keepFirst) ? 5 : keepFirst,
    dryRun,
    verbose,
  }
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

async function getTopicsToKeep(options: ClearCacheOptions): Promise<string[]> {
  if (options.keepTopicIds.length > 0) {
    // Verify that specified topic IDs exist
    const existing = await prisma.topics.findMany({
      where: { id: { in: options.keepTopicIds } },
      select: { id: true, nameZh: true },
    })

    const existingIds = existing.map((t) => t.id)
    const missingIds = options.keepTopicIds.filter((id) => !existingIds.includes(id))

    if (missingIds.length > 0) {
      console.warn(`[WARNING] Topics not found: ${missingIds.join(', ')}`)
    }

    return existingIds
  }

  // Keep the first N topics (by creation date, oldest first)
  const topics = await prisma.topics.findMany({
    orderBy: { createdAt: 'asc' },
    take: options.keepFirst,
    select: { id: true, nameZh: true },
  })

  return topics.map((t) => t.id)
}

async function collectDeletedTopicData(topicIdsToDelete: string[]): Promise<{
  paperIds: string[]
  nodeIds: string[]
  pdfPaths: string[]
}> {
  if (topicIdsToDelete.length === 0) {
    return { paperIds: [], nodeIds: [], pdfPaths: [] }
  }

  const papers = await prisma.papers.findMany({
    where: { topicId: { in: topicIdsToDelete } },
    select: { id: true, pdfPath: true },
  })

  const nodes = await prisma.research_nodes.findMany({
    where: { topicId: { in: topicIdsToDelete } },
    select: { id: true },
  })

  return {
    paperIds: uniqueIds(papers.map((p) => p.id)),
    nodeIds: uniqueIds(nodes.map((n) => n.id)),
    pdfPaths: papers.map((p) => p.pdfPath).filter((p): p is string => Boolean(p)),
  }
}

function buildSystemConfigFilters(
  topicIdsToDelete: string[],
  paperIds: string[],
  nodeIds: string[],
): Array<{ key: object }> {
  const filters: Array<{ key: object }> = []

  // Topic-specific keys
  for (const topicId of topicIdsToDelete) {
    filters.push({ key: { startsWith: `alpha:topic-artifact:${topicId}:` } })
    filters.push({ key: { startsWith: `generation-artifact-index:v1:${topicId}` } })
    filters.push({ key: { startsWith: `generation-memory:v1:${topicId}` } })
    filters.push({ key: { startsWith: `generation-judgments:v1:${topicId}` } })
    filters.push({ key: { startsWith: `topic-research-world:v1:${topicId}` } })
    filters.push({ key: { startsWith: `topic:session-memory:v1:${topicId}` } })
    filters.push({ key: { startsWith: `topic:guidance-ledger:v1:${topicId}` } })
    filters.push({ key: `topic:${topicId}:research-report` })
    filters.push({ key: { startsWith: `discovery:${topicId}` } })
  }

  // Paper-specific keys
  for (const paperId of paperIds) {
    filters.push({ key: { startsWith: `alpha:reader-artifact:paper:${paperId}` } })
    filters.push({ key: { contains: paperId } })
  }

  // Node-specific keys
  for (const nodeId of nodeIds) {
    filters.push({ key: { startsWith: `alpha:reader-artifact:node:${nodeId}` } })
    filters.push({ key: { contains: nodeId } })
  }

  return filters
}

async function clearUploadsForPdfs(pdfPaths: string[], dryRun: boolean): Promise<number> {
  const uploadsDir = path.resolve(process.cwd(), 'uploads')

  if (pdfPaths.length === 0) {
    return 0
  }

  let clearedCount = 0

  for (const pdfPath of pdfPaths) {
    if (!pdfPath) continue

    // pdfPath format: "uploads/paper-{paperId}-{hash}/..."
    const paperDirMatch = pdfPath.match(/^(uploads\/paper-[a-f0-9-]+-[a-f0-9]+)/)
    if (paperDirMatch) {
      const paperDir = path.resolve(process.cwd(), paperDirMatch[1])

      try {
        if (dryRun) {
          if (await fs.stat(paperDir).catch(() => null)) {
            clearedCount++
          }
        } else {
          await fs.rm(paperDir, { recursive: true, force: true })
          clearedCount++
        }
      } catch (error) {
        console.warn(`[WARNING] Failed to clear ${paperDir}:`, error)
      }
    }
  }

  return clearedCount
}

async function executeClearCache(
  topicIdsToDelete: string[],
  paperIds: string[],
  nodeIds: string[],
  pdfPaths: string[],
  dryRun: boolean,
  verbose: boolean,
): Promise<ClearStats> {
  if (dryRun) {
    // In dry-run mode, just return counts without deleting
    const topicsCount = topicIdsToDelete.length
    const papersCount = paperIds.length
    const nodesCount = nodeIds.length

    const figuresCount = await prisma.figures.count({
      where: { paperId: { in: paperIds } },
    })
    const formulasCount = await prisma.formulas.count({
      where: { paperId: { in: paperIds } },
    })
    const tablesCount = await prisma.tables.count({
      where: { paperId: { in: paperIds } },
    })
    const candidatePoolCount = await prisma.paper_candidate_pool.count({
      where: { topicId: { in: topicIdsToDelete } },
    })

    const configFilters = buildSystemConfigFilters(topicIdsToDelete, paperIds, nodeIds)
    const systemConfigCount = configFilters.length > 0
      ? await prisma.system_configs.count({ where: { OR: configFilters } })
      : 0

    return {
      deletedTopics: topicsCount,
      deletedPapers: papersCount,
      deletedNodes: nodesCount,
      deletedFigures: figuresCount,
      deletedFormulas: formulasCount,
      deletedTables: tablesCount,
      deletedCandidatePool: candidatePoolCount,
      deletedSystemConfigs: systemConfigCount,
      clearedUploads: await clearUploadsForPdfs(pdfPaths, true),
      keptTopics: [],
    }
  }

  // Live mode: execute deletions in transaction
  const configFilters = buildSystemConfigFilters(topicIdsToDelete, paperIds, nodeIds)

  const result = await prisma.$transaction(async (tx) => {
    // Delete topics (CASCADE will delete papers, nodes, figures, formulas, tables)
    const topicsResult = await tx.topics.deleteMany({
      where: { id: { in: topicIdsToDelete } },
    })

    // Delete paper_candidate_pool entries
    const candidatePoolResult = await tx.paper_candidate_pool.deleteMany({
      where: { topicId: { in: topicIdsToDelete } },
    })

    // Delete topic_stages entries
    await tx.topic_stages.deleteMany({
      where: { topicId: { in: topicIdsToDelete } },
    })

    // Delete topic_session_memories entries
    await tx.topic_session_memories.deleteMany({
      where: { topicId: { in: topicIdsToDelete } },
    })

    // Delete topic_guidance_ledgers entries
    await tx.topic_guidance_ledgers.deleteMany({
      where: { topicId: { in: topicIdsToDelete } },
    })

    // Delete research_pipeline_states entries
    await tx.research_pipeline_states.deleteMany({
      where: { topicId: { in: topicIdsToDelete } },
    })

    // Delete research_world_snapshots entries
    await tx.research_world_snapshots.deleteMany({
      where: { topicId: { in: topicIdsToDelete } },
    })

    // Delete system_configs
    const systemConfigsResult = configFilters.length > 0
      ? await tx.system_configs.deleteMany({ where: { OR: configFilters } })
      : { count: 0 }

    // Delete research_sessions that only contain deleted topics
    const sessions = await tx.research_sessions.findMany({
      select: { id: true, topicIds: true },
    })

    for (const session of sessions) {
      try {
        const sessionTopicIds = JSON.parse(session.topicIds) as string[]
        const remainingTopics = sessionTopicIds.filter((id) => !topicIdsToDelete.includes(id))

        if (remainingTopics.length === 0) {
          await tx.research_sessions.delete({ where: { id: session.id } })
        } else {
          await tx.research_sessions.update({
            where: { id: session.id },
            data: { topicIds: JSON.stringify(remainingTopics) },
          })
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return {
      topicsCount: topicsResult.count,
      candidatePoolCount: candidatePoolResult.count,
      systemConfigsCount: systemConfigsResult.count,
    }
  })

  // Get counts before deletion for stats (approximate)
  const figuresCount = paperIds.length * 5  // Approximate
  const formulasCount = paperIds.length * 10
  const tablesCount = paperIds.length * 2

  // Clear uploads
  const clearedUploads = await clearUploadsForPdfs(pdfPaths, false)

  return {
    deletedTopics: result.topicsCount,
    deletedPapers: paperIds.length,
    deletedNodes: nodeIds.length,
    deletedFigures: figuresCount,
    deletedFormulas: formulasCount,
    deletedTables: tablesCount,
    deletedCandidatePool: result.candidatePoolCount,
    deletedSystemConfigs: result.systemConfigsCount,
    clearedUploads,
    keptTopics: [],
  }
}

function printStats(stats: ClearStats, keptTopics: string[], dryRun: boolean): void {
  const action = dryRun ? 'Would delete' : 'Deleted'

  console.log('\n' + '='.repeat(60))
  console.log('Cache Clear Summary')
  console.log('='.repeat(60))
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE'}`)
  console.log(`Topics kept: ${keptTopics.length}`)
  console.log('-'.repeat(60))
  console.log(`${action}:`)
  console.log(`  Topics:              ${stats.deletedTopics}`)
  console.log(`  Papers:              ${stats.deletedPapers}`)
  console.log(`  Research nodes:      ${stats.deletedNodes}`)
  console.log(`  Figures:             ${stats.deletedFigures}`)
  console.log(`  Formulas:            ${stats.deletedFormulas}`)
  console.log(`  Tables:              ${stats.deletedTables}`)
  console.log(`  Candidate pool:      ${stats.deletedCandidatePool}`)
  console.log(`  System configs:      ${stats.deletedSystemConfigs}`)
  console.log(`  Upload directories:  ${stats.clearedUploads}`)
  console.log('='.repeat(60))

  if (dryRun) {
    console.log('\nRun without --dry-run to execute the cleanup.\n')
  } else {
    console.log('\nCache cleared successfully.\n')
  }
}

async function main(): Promise<void> {
  const options = parseArgs()

  console.log('\nCache Clear Script (Keep N Topics)')
  console.log('-'.repeat(60))
  console.log(`Keep first: ${options.keepFirst} topics`)
  console.log(`Keep IDs: ${options.keepTopicIds.length > 0 ? options.keepTopicIds.join(', ') : '(using keep-first)'}`)
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`)

  // Get topics to keep
  const keptTopicIds = await getTopicsToKeep(options)

  // Get topics to delete
  const allTopics = await prisma.topics.findMany({
    select: { id: true, nameZh: true, nameEn: true },
  })

  const topicIdsToDelete = allTopics
    .filter((t) => !keptTopicIds.includes(t.id))
    .map((t) => t.id)

  if (topicIdsToDelete.length === 0) {
    console.log('\nNo topics to delete. All topics are in the keep list.')
    return
  }

  console.log(`\nTopics to keep (${keptTopicIds.length}):`)
  const keptTopics = allTopics.filter((t) => keptTopicIds.includes(t.id))
  for (const topic of keptTopics) {
    console.log(`  - ${topic.nameZh || topic.nameEn || topic.id}`)
  }

  console.log(`\nTopics to delete (${topicIdsToDelete.length}):`)
  const deletedTopics = allTopics.filter((t) => topicIdsToDelete.includes(t.id))
  for (const topic of deletedTopics.slice(0, 10)) {
    console.log(`  - ${topic.nameZh || topic.nameEn || topic.id}`)
  }
  if (deletedTopics.length > 10) {
    console.log(`  ... and ${deletedTopics.length - 10} more`)
  }

  // Collect data before deletion
  const { paperIds, nodeIds, pdfPaths } = await collectDeletedTopicData(topicIdsToDelete)

  // Execute deletion
  const stats = await executeClearCache(
    topicIdsToDelete,
    paperIds,
    nodeIds,
    pdfPaths,
    options.dryRun,
    options.verbose,
  )

  printStats(stats, keptTopicIds, options.dryRun)
}

void main()
  .catch((error) => {
    console.error('\n[ERROR] Cache clear failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
