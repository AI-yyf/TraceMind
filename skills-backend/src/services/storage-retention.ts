import fs from 'node:fs'
import path from 'node:path'

import cron from 'node-cron'

import { prisma } from '../lib/prisma'
import { logger } from '../utils/logger'
import { getPdfGroundingUploadPdfDir } from './pdf-grounding'

const DEFAULT_CANDIDATE_POOL_RETENTION_DAYS = 30
const DEFAULT_REJECTED_POOL_RETENTION_DAYS = 7
const DEFAULT_SESSION_RETENTION_DAYS = 30
const DEFAULT_ORPHAN_PDF_RETENTION_DAYS = 2
const DEFAULT_STORAGE_CLEANUP_CRON = '17 4 * * *'

function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function subtractDays(base: Date, days: number) {
  return addDays(base, -days)
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface StorageRetentionSweepResult {
  candidatePoolDeleted: number
  candidatePoolRefreshed: number
  orphanCandidatePapersDeleted: number
  researchSessionsDeleted: number
  staleSystemConfigsDeleted: number
  orphanPdfFilesDeleted: number
}

const PROCESS_SYSTEM_CONFIG_PREFIXES = [
  'alpha:topic-artifact:',
  'alpha:reader-artifact:',
  'generation-artifact-index:v1:',
  'generation-memory:v1:',
  'generation-judgments:v1:',
  'topic:session-memory:v1:',
  'topic:guidance-ledger:v1:',
  'topic-research-world:v1:',
  'cross-topic-index:v1:',
] as const

async function refreshCandidatePoolRetention(now: Date) {
  const candidateCutoff = addDays(
    now,
    parsePositiveInteger(process.env.TRACEMIND_CANDIDATE_POOL_RETENTION_DAYS, DEFAULT_CANDIDATE_POOL_RETENTION_DAYS),
  )
  const rejectedCutoff = addDays(
    now,
    parsePositiveInteger(process.env.TRACEMIND_REJECTED_POOL_RETENTION_DAYS, DEFAULT_REJECTED_POOL_RETENTION_DAYS),
  )

  const admittedRefresh = await prisma.paper_candidate_pool.updateMany({
    where: {
      status: 'admitted',
    },
    data: {
      retentionTier: 'core',
      retentionExpiresAt: null,
    },
  })

  const candidateRefresh = await prisma.paper_candidate_pool.updateMany({
    where: {
      status: 'candidate',
      OR: [{ retentionExpiresAt: null }, { retentionTier: { not: 'compact' } }],
    },
    data: {
      retentionTier: 'compact',
      retentionExpiresAt: candidateCutoff,
    },
  })

  const rejectedRefresh = await prisma.paper_candidate_pool.updateMany({
    where: {
      status: 'rejected',
      OR: [{ retentionExpiresAt: null }, { retentionTier: { not: 'ephemeral' } }],
    },
    data: {
      retentionTier: 'ephemeral',
      retentionExpiresAt: rejectedCutoff,
    },
  })

  return admittedRefresh.count + candidateRefresh.count + rejectedRefresh.count
}

async function pruneExpiredCandidatePool(now: Date) {
  const expired = await prisma.paper_candidate_pool.findMany({
    where: {
      retentionExpiresAt: { lt: now },
      status: { not: 'admitted' },
    },
    select: {
      id: true,
      paperId: true,
    },
  })

  if (expired.length === 0) {
    return {
      deletedCount: 0,
      orphanCandidatePapersDeleted: 0,
    }
  }

  const deleted = await prisma.paper_candidate_pool.deleteMany({
    where: {
      id: { in: expired.map((entry) => entry.id) },
    },
  })

  const paperIds = Array.from(
    new Set(
      expired
        .map((entry) => entry.paperId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )

  let orphanCandidatePapersDeleted = 0

  for (const paperId of paperIds) {
    const paper = await prisma.papers.findUnique({
      where: { id: paperId },
      select: {
        id: true,
        status: true,
        _count: {
          select: {
            node_papers: true,
          },
        },
      },
    })

    if (!paper || paper.status !== 'candidate-pool' || paper._count.node_papers > 0) {
      continue
    }

    const stillReferenced = await prisma.paper_candidate_pool.count({
      where: {
        paperId,
      },
    })
    if (stillReferenced > 0) continue

    await prisma.papers.delete({
      where: { id: paperId },
    })
    orphanCandidatePapersDeleted += 1
  }

  return {
    deletedCount: deleted.count,
    orphanCandidatePapersDeleted,
  }
}

async function pruneResearchSessions(now: Date) {
  const cutoff = subtractDays(
    now,
    parsePositiveInteger(process.env.TRACEMIND_RESEARCH_SESSION_RETENTION_DAYS, DEFAULT_SESSION_RETENTION_DAYS),
  )

  const deleted = await prisma.research_sessions.deleteMany({
    where: {
      status: { in: ['completed', 'failed', 'stopped'] },
      createdAt: { lt: cutoff },
    },
  })

  return deleted.count
}

async function pruneStaleSystemConfigs(now: Date) {
  const cutoff = subtractDays(
    now,
    parsePositiveInteger(
      process.env.TRACEMIND_PROCESS_CONFIG_RETENTION_DAYS,
      DEFAULT_CANDIDATE_POOL_RETENTION_DAYS,
    ),
  )

  const deletedByPrefix = await prisma.system_configs.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      OR: PROCESS_SYSTEM_CONFIG_PREFIXES.map((prefix) => ({
        key: { startsWith: prefix },
      })),
    },
  })

  const deletedPipelineStates = await prisma.system_configs.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      AND: [
        { key: { startsWith: 'topic:' } },
        { key: { endsWith: ':research-pipeline' } },
      ],
    },
  })

  return deletedByPrefix.count + deletedPipelineStates.count
}

async function pruneOrphanPdfFiles(now: Date) {
  const pdfDir = getPdfGroundingUploadPdfDir()
  if (!fs.existsSync(pdfDir)) return 0

  const cutoff = subtractDays(
    now,
    parsePositiveInteger(process.env.TRACEMIND_ORPHAN_PDF_RETENTION_DAYS, DEFAULT_ORPHAN_PDF_RETENTION_DAYS),
  )

  const referencedPdfPaths = new Set(
    (
      await prisma.papers.findMany({
        where: {
          pdfPath: { not: null },
        },
        select: {
          pdfPath: true,
        },
      })
    )
      .map((paper) => paper.pdfPath)
      .filter((value): value is string => Boolean(value))
      .map((value) => path.resolve(value)),
  )

  let deleted = 0
  for (const file of fs.readdirSync(pdfDir)) {
    const absolutePath = path.resolve(pdfDir, file)
    const stats = fs.statSync(absolutePath)
    if (!stats.isFile()) continue
    if (stats.mtime >= cutoff) continue
    if (referencedPdfPaths.has(absolutePath)) continue
    fs.unlinkSync(absolutePath)
    deleted += 1
  }

  return deleted
}

export async function runStorageRetentionSweep(): Promise<StorageRetentionSweepResult> {
  const now = new Date()
  const candidatePoolRefreshed = await refreshCandidatePoolRetention(now)
  const candidatePoolPrune = await pruneExpiredCandidatePool(now)
  const researchSessionsDeleted = await pruneResearchSessions(now)
  const staleSystemConfigsDeleted = await pruneStaleSystemConfigs(now)
  const orphanPdfFilesDeleted = await pruneOrphanPdfFiles(now)

  return {
    candidatePoolDeleted: candidatePoolPrune.deletedCount,
    candidatePoolRefreshed,
    orphanCandidatePapersDeleted: candidatePoolPrune.orphanCandidatePapersDeleted,
    researchSessionsDeleted,
    staleSystemConfigsDeleted,
    orphanPdfFilesDeleted,
  }
}

export function startStorageRetentionCron() {
  const enabled = (process.env.TRACEMIND_STORAGE_CLEANUP_DISABLED ?? '').trim().toLowerCase()
  if (enabled === '1' || enabled === 'true' || enabled === 'yes') {
    logger.info('Storage retention cron disabled by environment flag.')
    return
  }

  const expression = (process.env.TRACEMIND_STORAGE_CLEANUP_CRON ?? DEFAULT_STORAGE_CLEANUP_CRON).trim()
  if (!cron.validate(expression)) {
    logger.warn('Invalid storage retention cron expression. Skipping startup.', { expression })
    return
  }

  cron.schedule(expression, () => {
    void runStorageRetentionSweep()
      .then((summary) => {
        logger.info('Storage retention sweep completed.', summary)
      })
      .catch((error) => {
        logger.warn('Storage retention sweep failed.', { error })
      })
  })

  logger.info('Storage retention cron scheduled.', { expression })
}
