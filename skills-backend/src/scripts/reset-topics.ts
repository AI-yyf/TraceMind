import fs from 'node:fs/promises'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

async function clearTopicUploads() {
  const uploadsDir = path.resolve(process.cwd(), 'uploads')
  const workspaceRoot = path.resolve(process.cwd())

  if (!uploadsDir.startsWith(workspaceRoot)) {
    throw new Error(`Refusing to clear uploads outside workspace: ${uploadsDir}`)
  }

  await fs.rm(uploadsDir, { recursive: true, force: true })
  await fs.mkdir(uploadsDir, { recursive: true })
}

async function main() {
  const topics = await prisma.topic.findMany({
    select: {
      id: true,
      papers: {
        select: { id: true },
      },
      nodes: {
        select: { id: true },
      },
    },
  })

  const topicIds = uniqueIds(topics.map((topic) => topic.id))
  const paperIds = uniqueIds(topics.flatMap((topic) => topic.papers.map((paper) => paper.id)))
  const nodeIds = uniqueIds(topics.flatMap((topic) => topic.nodes.map((node) => node.id)))

  await prisma.$transaction([
    prisma.researchSession.deleteMany({}),
    prisma.topic.deleteMany({}),
  ])

  const keyFilters = [
    { key: { startsWith: 'topic:' } },
    { key: { startsWith: 'topic-stage-config:v1:' } },
    { key: { startsWith: 'alpha:topic-artifact:' } },
    { key: { startsWith: 'alpha:reader-artifact:' } },
    { key: { startsWith: 'generation-artifact-index:v1:' } },
    { key: { startsWith: 'discovery:' } },
    ...topicIds.map((id) => ({ key: { contains: id } })),
    ...paperIds.map((id) => ({ key: { contains: id } })),
    ...nodeIds.map((id) => ({ key: { contains: id } })),
  ]

  const deletedConfigs = await prisma.systemConfig.deleteMany({
    where: {
      OR: keyFilters,
    },
  })

  await clearTopicUploads()

  console.log(
    JSON.stringify(
      {
        success: true,
        deletedTopics: topicIds.length,
        deletedPapers: paperIds.length,
        deletedNodes: nodeIds.length,
        deletedSystemConfigs: deletedConfigs.count,
      },
      null,
      2,
    ),
  )
}

void main()
  .catch((error) => {
    console.error('[reset-topics] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
