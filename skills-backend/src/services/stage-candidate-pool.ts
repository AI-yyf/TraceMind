import { createHash, randomUUID } from 'node:crypto'

import type { paper_candidate_pool, Prisma } from '@prisma/client'

import { prisma } from '../lib/prisma'
import {
  extractAndPersistPaperPdfFromUrl,
  normalizePdfUrl,
} from './pdf-grounding'

type CandidatePoolStatus = 'admitted' | 'candidate' | 'rejected'
type CandidatePoolDownloadStatus =
  | 'pending'
  | 'missing-pdf-url'
  | 'grounded'
  | 'already-grounded'
  | 'failed'

export interface StageCandidatePoolSourceCandidate {
  paperId: string
  sourcePaperId?: string
  title: string
  titleZh?: string
  published: string
  authors: string[]
  confidence: number
  status: CandidatePoolStatus
  candidateType?: string
  discoverySource?: string
  discoveryChannels?: string[]
  queryHits?: string[]
  rejectReason?: string
  rejectFilter?: string
  rejectScore?: number
  branchId?: string
  stageIndex?: number
  openAlexId?: string
  snowballParentId?: string
  snowballDepth?: number
  snowballType?: 'forward' | 'backward'
  arxivData?: {
    title?: string
    summary?: string
    arxivUrl?: string
    pdfUrl?: string
    openAlexId?: string
    discoverySource?: string
  }
}

export interface StageCandidatePoolPersistArgs {
  topicId: string
  stageIndex: number
  stageLabel: string
  stageStartDate: Date
  stageEndDateExclusive: Date
  recallRunId: string
  querySetHash: string
  candidates: StageCandidatePoolSourceCandidate[]
}

export interface StageCandidatePoolListArgs {
  topicId: string
  stageIndex: number
  statuses?: CandidatePoolStatus[]
  limit?: number
}

export interface StageCandidatePoolGroundArgs {
  topicId: string
  stageIndex: number
  statuses?: CandidatePoolStatus[]
  limit?: number
  force?: boolean
}

export interface StageCandidatePoolSummary {
  topicId: string
  stageIndex: number
  total: number
  admitted: number
  candidate: number
  rejected: number
  grounded: number
  readyForDownload: number
  missingPdf: number
}

const DEFAULT_COMPACT_RETENTION_DAYS = 30
const DEFAULT_EPHEMERAL_RETENTION_DAYS = 7
const CANDIDATE_POOL_GROUNDING_CONCURRENCY = 3

function stableHash(parts: Array<string | number | null | undefined>) {
  return createHash('sha1')
    .update(
      parts
        .map((part) => `${part ?? ''}`.trim().toLowerCase())
        .join('::'),
    )
    .digest('hex')
}

function normalizeTitleKey(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function clipText(value: string | null | undefined, max = 1000) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 3))}...`
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? [])
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  )
}

function parseJsonStringArray(raw: string | null | undefined) {
  if (!raw) return [] as string[]
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
      : []
  } catch {
    return []
  }
}

function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function resolveRetentionTier(status: CandidatePoolStatus) {
  if (status === 'admitted') return 'core'
  if (status === 'candidate') return 'compact'
  return 'ephemeral'
}

function resolveRetentionExpiry(status: CandidatePoolStatus, now: Date) {
  if (status === 'admitted') return null
  if (status === 'candidate') return addDays(now, DEFAULT_COMPACT_RETENTION_DAYS)
  return addDays(now, DEFAULT_EPHEMERAL_RETENTION_DAYS)
}

function resolveCandidatePdfUrl(candidate: StageCandidatePoolSourceCandidate) {
  const normalizedPdf = normalizePdfUrl(candidate.arxivData?.pdfUrl ?? '')
  const normalizedArxiv = normalizePdfUrl(candidate.arxivData?.arxivUrl ?? '')
  return [normalizedPdf, normalizedArxiv].find((value) => {
    if (!value) return false
    if (/^https?:\/\/(?:dx\.)?doi\.org\//iu.test(value)) return false
    if (/ieeexplore\.ieee\.org\/document\//iu.test(value)) return false
    if (/^https?:\/\/arxiv\.org\/pdf\//iu.test(value)) return true
    if (/\.pdf(?:[?#]|$)/iu.test(value) && !/ieeexplore\.ieee\.org/iu.test(value)) return true
    if (/^\/uploads\//u.test(value)) return true
    return false
  }) ?? ''
}

function resolveEntryPdfUrl(entry: Pick<paper_candidate_pool, 'pdfUrl' | 'arxivUrl'>) {
  const normalizedPdf = normalizePdfUrl(entry.pdfUrl ?? '')
  const normalizedArxiv = normalizePdfUrl(entry.arxivUrl ?? '')
  return [normalizedPdf, normalizedArxiv].find(Boolean) ?? ''
}

function buildPoolEntryId(args: {
  topicId: string
  stageIndex: number
  sourcePaperId?: string | null
  title: string
}) {
  return `pool-${stableHash([
    args.topicId,
    args.stageIndex,
    args.sourcePaperId ?? '',
    normalizeTitleKey(args.title),
  ])}`
}

export function buildStageQuerySetHash(queries: string[]) {
  const normalized = queries
    .map((query) => query.trim().toLowerCase())
    .filter(Boolean)
    .sort()
  return stableHash(normalized)
}

function toPoolOrderBy(): Prisma.paper_candidate_poolOrderByWithRelationInput[] {
  return [
    { confidence: 'desc' },
    { hasStructuredEvidence: 'desc' },
    { lastSeenAt: 'desc' },
  ]
}

export async function buildStageCandidatePoolSummary(args: {
  topicId: string
  stageIndex: number
}): Promise<StageCandidatePoolSummary> {
  const entries = await prisma.paper_candidate_pool.findMany({
    where: {
      topicId: args.topicId,
      stageIndex: args.stageIndex,
    },
    select: {
      status: true,
      downloadStatus: true,
    },
  })

  return entries.reduce<StageCandidatePoolSummary>(
    (summary, entry) => {
      summary.total += 1
      if (entry.status === 'admitted') summary.admitted += 1
      if (entry.status === 'candidate') summary.candidate += 1
      if (entry.status === 'rejected') summary.rejected += 1
      if (
        entry.downloadStatus === 'grounded' ||
        entry.downloadStatus === 'already-grounded'
      ) {
        summary.grounded += 1
      }
      if (entry.downloadStatus === 'pending') {
        summary.readyForDownload += 1
      }
      if (entry.downloadStatus === 'missing-pdf-url') {
        summary.missingPdf += 1
      }
      return summary
    },
    {
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      total: 0,
      admitted: 0,
      candidate: 0,
      rejected: 0,
      grounded: 0,
      readyForDownload: 0,
      missingPdf: 0,
    },
  )
}

export async function listStageCandidatePoolEntries(args: StageCandidatePoolListArgs) {
  const entries = await prisma.paper_candidate_pool.findMany({
    where: {
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      status: args.statuses?.length ? { in: args.statuses } : undefined,
    },
    orderBy: toPoolOrderBy(),
    take: Math.max(1, Math.min(args.limit ?? 200, 1000)),
  })

  return {
    entries: entries.map((entry) => ({
      ...entry,
      authors: parseJsonStringArray(entry.authors),
      discoveryChannels: parseJsonStringArray(entry.discoveryChannels),
      queryHits: parseJsonStringArray(entry.queryHits),
    })),
    summary: await buildStageCandidatePoolSummary({
      topicId: args.topicId,
      stageIndex: args.stageIndex,
    }),
  }
}

export async function upsertStageCandidatePoolEntries(args: StageCandidatePoolPersistArgs) {
  const now = new Date()

  for (const candidate of args.candidates) {
    const sourcePaperId = candidate.sourcePaperId?.trim() || candidate.paperId?.trim() || null
    const pdfUrl = resolveCandidatePdfUrl(candidate)
    const arxivUrl = normalizePdfUrl(candidate.arxivData?.arxivUrl ?? '')
    const retentionTier = resolveRetentionTier(candidate.status)
    const retentionExpiresAt = resolveRetentionExpiry(candidate.status, now)
    const entryId = buildPoolEntryId({
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      sourcePaperId,
      title: candidate.title,
    })

    const existing = await prisma.paper_candidate_pool.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        paperId: true,
        downloadStatus: true,
        discoveryChannels: true,
        queryHits: true,
      },
    })

    const downloadStatus: CandidatePoolDownloadStatus =
      existing?.downloadStatus === 'grounded' || existing?.downloadStatus === 'already-grounded'
        ? (existing.downloadStatus as CandidatePoolDownloadStatus)
        : pdfUrl
          ? 'pending'
          : 'missing-pdf-url'

    await prisma.paper_candidate_pool.upsert({
      where: { id: entryId },
      update: {
        paperId: existing?.paperId ?? null,
        sourcePaperId,
        topicId: args.topicId,
        title: candidate.title,
        authors: serializeJson(candidate.authors),
        published: candidate.published ? new Date(candidate.published) : null,
        summary: clipText(candidate.arxivData?.summary, 2400) || null,
        arxivUrl: arxivUrl || null,
        pdfUrl: pdfUrl || null,
        openAlexId: candidate.openAlexId ?? candidate.arxivData?.openAlexId ?? null,
        branchId: candidate.branchId ?? null,
        stageIndex: args.stageIndex,
        stageLabel: args.stageLabel,
        stageStartDate: args.stageStartDate,
        stageEndDateExclusive: args.stageEndDateExclusive,
        recallRunId: args.recallRunId,
        querySetHash: args.querySetHash,
        status: candidate.status,
        confidence: candidate.confidence,
        candidateType: candidate.candidateType ?? null,
        discoverySource:
          candidate.discoverySource ??
          candidate.arxivData?.discoverySource ??
          null,
        discoveryChannels: serializeJson(
          uniqueStrings([
            ...parseJsonStringArray(existing?.discoveryChannels),
            ...(candidate.discoveryChannels ?? []),
          ]),
        ),
        queryHits: serializeJson(
          uniqueStrings([
            ...parseJsonStringArray(existing?.queryHits),
            ...(candidate.queryHits ?? []),
          ]),
        ),
        downloadStatus,
        rejectReason: candidate.rejectReason ?? null,
        rejectFilter: candidate.rejectFilter ?? null,
        rejectScore: candidate.rejectScore ?? null,
        snowballParentId: candidate.snowballParentId ?? null,
        snowballDepth: candidate.snowballDepth ?? null,
        snowballType: candidate.snowballType ?? null,
        retentionTier,
        retentionExpiresAt,
        lastSeenAt: now,
      },
      create: {
        id: entryId,
        topicId: args.topicId,
        paperId: null,
        sourcePaperId,
        title: candidate.title,
        authors: serializeJson(candidate.authors),
        published: candidate.published ? new Date(candidate.published) : null,
        summary: clipText(candidate.arxivData?.summary, 2400) || null,
        arxivUrl: arxivUrl || null,
        pdfUrl: pdfUrl || null,
        openAlexId: candidate.openAlexId ?? candidate.arxivData?.openAlexId ?? null,
        semanticScholarId: null,
        branchId: candidate.branchId ?? null,
        stageIndex: args.stageIndex,
        stageLabel: args.stageLabel,
        stageStartDate: args.stageStartDate,
        stageEndDateExclusive: args.stageEndDateExclusive,
        recallRunId: args.recallRunId,
        querySetHash: args.querySetHash,
        status: candidate.status,
        confidence: candidate.confidence,
        candidateType: candidate.candidateType ?? null,
        discoverySource:
          candidate.discoverySource ??
          candidate.arxivData?.discoverySource ??
          null,
        discoveryChannels: serializeJson(uniqueStrings(candidate.discoveryChannels ?? [])),
        queryHits: serializeJson(uniqueStrings(candidate.queryHits ?? [])),
        downloadStatus,
        downloadError: null,
        downloadAttemptedAt: null,
        groundedAt: null,
        evidenceCount: 0,
        hasStructuredEvidence: false,
        retentionTier,
        retentionExpiresAt,
        lastSeenAt: now,
        rejectReason: candidate.rejectReason ?? null,
        rejectFilter: candidate.rejectFilter ?? null,
        rejectScore: candidate.rejectScore ?? null,
        snowballParentId: candidate.snowballParentId ?? null,
        snowballDepth: candidate.snowballDepth ?? null,
        snowballType: candidate.snowballType ?? null,
        reviewedAt: null,
        reviewedBy: null,
        reviewDecision: null,
        reviewComment: null,
      },
    })
  }

  return buildStageCandidatePoolSummary({
    topicId: args.topicId,
    stageIndex: args.stageIndex,
  })
}

export async function syncStageCandidatePoolPaperLinks(args: {
  topicId: string
  stageIndex: number
  mappings: Array<{
    sourcePaperId?: string | null
    title: string
    linkedPaperId: string
  }>
}) {
  for (const mapping of args.mappings) {
    const entryId = buildPoolEntryId({
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      sourcePaperId: mapping.sourcePaperId ?? null,
      title: mapping.title,
    })
    const whereClauses: Prisma.paper_candidate_poolWhereInput[] = [{ id: entryId }]
    if (mapping.sourcePaperId?.trim()) {
      whereClauses.push({
        topicId: args.topicId,
        stageIndex: args.stageIndex,
        sourcePaperId: mapping.sourcePaperId.trim(),
      })
    }

    await prisma.paper_candidate_pool.updateMany({
      where: {
        OR: whereClauses,
      },
      data: {
        paperId: mapping.linkedPaperId,
        lastSeenAt: new Date(),
      },
    })
  }
}

async function ensureCandidatePoolPaperRecord(entry: paper_candidate_pool) {
  const lookupConditions = [
    entry.paperId ? { id: entry.paperId } : null,
    entry.arxivUrl ? { arxivUrl: entry.arxivUrl } : null,
    entry.sourcePaperId ? { id: entry.sourcePaperId } : null,
    { topicId: entry.topicId, title: entry.title },
  ].filter(Boolean) as Prisma.papersWhereInput[]

  const existing =
    lookupConditions.length > 0
      ? await prisma.papers.findFirst({
          where: {
            OR: lookupConditions,
          },
        })
      : null

  const titleZh = entry.title
  const paperData = {
    topicId: entry.topicId,
    title: entry.title,
    titleZh,
    titleEn: entry.title,
    authors: serializeJson(parseJsonStringArray(entry.authors)),
    published: entry.published ?? new Date(),
    summary: entry.summary ?? '',
    explanation:
      entry.reviewComment ||
      entry.rejectReason ||
      `Stage ${entry.stageIndex ?? '?'} candidate pool paper.`,
    arxivUrl: entry.arxivUrl ?? null,
    openAlexId: entry.openAlexId ?? null,
    pdfUrl: resolveEntryPdfUrl(entry) || null,
    status: entry.status === 'admitted' ? 'candidate' : 'candidate-pool',
    tags: serializeJson(
      uniqueStrings([
        ...(parseJsonStringArray(entry.discoveryChannels)),
        ...(parseJsonStringArray(entry.queryHits)),
        entry.stageLabel ?? null,
      ]),
    ),
    figurePaths: '[]',
    tablePaths: '[]',
    formulaPaths: '[]',
    contentMode: 'editorial',
    updatedAt: new Date(),
  }

  if (existing) {
    const paper = await prisma.papers.update({
      where: { id: existing.id },
      data: paperData,
      select: { id: true },
    })
    return paper.id
  }

  const created = await prisma.papers.create({
    data: {
      id: `paper-pool-${randomUUID()}`,
      ...paperData,
    },
    select: { id: true },
  })
  return created.id
}

function countExtractedEvidence(input: {
  sections?: number
  figures?: number
  tables?: number
  formulas?: number
}) {
  return (
    (input.sections ?? 0) +
    (input.figures ?? 0) +
    (input.tables ?? 0) +
    (input.formulas ?? 0)
  )
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
) {
  const limit = Math.max(1, concurrency)
  const results: TOutput[] = new Array(items.length)
  let cursor = 0

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursor
        cursor += 1
        if (index >= items.length) break
        results[index] = await worker(items[index], index)
      }
    }),
  )

  return results
}

export async function groundStageCandidatePoolEntries(args: StageCandidatePoolGroundArgs) {
  const queue = await prisma.paper_candidate_pool.findMany({
    where: {
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      status: args.statuses?.length ? { in: args.statuses } : { in: ['admitted', 'candidate'] },
    },
    orderBy: toPoolOrderBy(),
    take: Math.max(1, Math.min(args.limit ?? 50, 200)),
  })

  const grounded = await mapWithConcurrency(
    queue,
    CANDIDATE_POOL_GROUNDING_CONCURRENCY,
    async (entry) => {
      const attemptedAt = new Date()
      const pdfUrl = resolveEntryPdfUrl(entry)

      if (!pdfUrl) {
        await prisma.paper_candidate_pool.update({
          where: { id: entry.id },
          data: {
            downloadStatus: 'missing-pdf-url',
            downloadError: 'No directly groundable PDF URL found for this candidate.',
            downloadAttemptedAt: attemptedAt,
            lastSeenAt: attemptedAt,
          },
        })
        return {
          entryId: entry.id,
          status: 'missing-pdf-url' as const,
          paperId: entry.paperId,
        }
      }

      const linkedPaperId = entry.paperId ?? (await ensureCandidatePoolPaperRecord(entry))

      try {
        const result = await extractAndPersistPaperPdfFromUrl({
          paperId: linkedPaperId,
          paperTitle: entry.title,
          pdfUrl,
          force: args.force ?? false,
        })
        const evidenceCount =
          result.status === 'grounded'
            ? countExtractedEvidence(result.extractedCounts)
            : countExtractedEvidence(result.existingCounts ?? {})

        const downloadStatus: CandidatePoolDownloadStatus =
          result.status === 'grounded' ? 'grounded' : 'already-grounded'

        await prisma.paper_candidate_pool.update({
          where: { id: entry.id },
          data: {
            paperId: linkedPaperId,
            pdfUrl,
            downloadStatus,
            downloadError: null,
            downloadAttemptedAt: attemptedAt,
            groundedAt: evidenceCount > 0 ? attemptedAt : null,
            evidenceCount,
            hasStructuredEvidence: evidenceCount > 0,
            lastSeenAt: attemptedAt,
          },
        })

        return {
          entryId: entry.id,
          status: downloadStatus,
          paperId: linkedPaperId,
          evidenceCount,
        }
      } catch (error) {
        await prisma.paper_candidate_pool.update({
          where: { id: entry.id },
          data: {
            paperId: linkedPaperId,
            pdfUrl,
            downloadStatus: 'failed',
            downloadError: clipText(error instanceof Error ? error.message : String(error), 400),
            downloadAttemptedAt: attemptedAt,
            lastSeenAt: attemptedAt,
          },
        })

        return {
          entryId: entry.id,
          status: 'failed' as const,
          paperId: linkedPaperId,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )

  return {
    entries: grounded,
    summary: await buildStageCandidatePoolSummary({
      topicId: args.topicId,
      stageIndex: args.stageIndex,
    }),
  }
}
