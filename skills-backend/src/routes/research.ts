import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { prisma } from '../lib/prisma'
import { deleteSession, getAllSessions, getSession, setSession } from '../lib/redis'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { CreateResearchSessionSchema } from './schemas'
import {
  enhancedTaskScheduler,
  STAGE_DURATION_DAYS_DEFAULT,
  STAGE_DURATION_DAYS_MAX,
  STAGE_DURATION_DAYS_MIN,
} from '../services/enhanced-scheduler'
import { computeDurationProgress } from '../services/scheduler-utils'
import {
  groundStageCandidatePoolEntries,
  listStageCandidatePoolEntries,
} from '../services/stage-candidate-pool'
import { filterVisibleTopics } from '../services/topics/topic-visibility'

const router = Router()

// ============================================================================
// Types for Topics Overview Endpoint
// ============================================================================

interface TopicResearchBriefOverview {
  stageCount: number
  nodeCount: number
  paperCount: number
  lastResearchAt: string | null
  status: 'running' | 'paused' | 'idle' | 'completed'
}

interface TopicResearchOverviewItem {
  id: string
  title: string
  titleEn: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  researchBrief: TopicResearchBriefOverview | null
}

interface TopicsOverviewResponse {
  success: boolean
  topics: TopicResearchOverviewItem[]
}

// ============================================================================
// GET /api/research/topics/overview - Global Research Overview
// ============================================================================

router.get(
  '/topics/overview',
  asyncHandler(async (_req, res) => {
    const topics = filterVisibleTopics(
      await prisma.topics.findMany({
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            papers: true,
            research_nodes: true,
            topic_stages: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    )

    const overview: TopicResearchOverviewItem[] = await Promise.all(
      topics.map(async (topic) => {
        try {
          const state = await enhancedTaskScheduler.getTopicResearchState(topic.id)
          const progress = state.progress

          let status: TopicResearchBriefOverview['status'] = 'idle'
          if (state.active) {
            status = 'running'
          } else if (progress?.status === 'completed') {
            status = 'completed'
          } else if (progress?.status === 'paused' || progress?.status === 'interrupted') {
            status = 'paused'
          } else if (progress?.status === 'failed') {
            status = 'paused'
          }

          const brief: TopicResearchBriefOverview = {
            stageCount: topic._count.topic_stages,
            nodeCount: topic._count.research_nodes,
            paperCount: topic._count.papers,
            lastResearchAt: progress?.lastRunAt ?? null,
            status,
          }

          return {
            id: topic.id,
            title: topic.nameZh || topic.nameEn || '',
            titleEn: topic.nameEn,
            description: topic.description,
            createdAt: topic.createdAt.toISOString(),
            updatedAt: topic.updatedAt.toISOString(),
            researchBrief: brief,
          }
        } catch (error) {
          // If we can't get research state, return topic with null brief
          return {
            id: topic.id,
            title: topic.nameZh || topic.nameEn || '',
            titleEn: topic.nameEn,
            description: topic.description,
            createdAt: topic.createdAt.toISOString(),
            updatedAt: topic.updatedAt.toISOString(),
            researchBrief: {
              stageCount: topic._count.topic_stages,
              nodeCount: topic._count.research_nodes,
              paperCount: topic._count.papers,
              lastResearchAt: null,
              status: 'idle' as const,
            },
          }
        }
      }),
    )

    const response: TopicsOverviewResponse = {
      success: true,
      topics: overview,
    }

    res.json(response)
  }),
)

const stageCandidatePoolQuerySchema = z.object({
  status: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean) as Array<'admitted' | 'candidate' | 'rejected'>
        : undefined,
    ),
  limit: z.coerce.number().int().positive().max(1000).default(200),
})

const stageCandidatePoolGroundSchema = z.object({
  statuses: z
    .array(z.enum(['admitted', 'candidate', 'rejected']))
    .optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  force: z.coerce.boolean().optional().default(false),
})

router.get(
  '/topics/:topicId/stages/:stageIndex/candidate-pool',
  asyncHandler(async (req, res) => {
    const query = stageCandidatePoolQuerySchema.parse(req.query)
    const stageIndex = Number.parseInt(req.params.stageIndex, 10)
    if (!Number.isFinite(stageIndex) || stageIndex <= 0) {
      throw new AppError(400, 'stageIndex must be a positive integer.')
    }

    const data = await listStageCandidatePoolEntries({
      topicId: req.params.topicId,
      stageIndex,
      statuses: query.status,
      limit: query.limit,
    })

    res.json({
      success: true,
      data,
    })
  }),
)

router.post(
  '/topics/:topicId/stages/:stageIndex/candidate-pool/ground',
  asyncHandler(async (req, res) => {
    const body = stageCandidatePoolGroundSchema.parse(req.body)
    const stageIndex = Number.parseInt(req.params.stageIndex, 10)
    if (!Number.isFinite(stageIndex) || stageIndex <= 0) {
      throw new AppError(400, 'stageIndex must be a positive integer.')
    }

    const data = await groundStageCandidatePoolEntries({
      topicId: req.params.topicId,
      stageIndex,
      statuses: body.statuses,
      limit: body.limit,
      force: body.force,
    })

    res.json({
      success: true,
      data,
    })
  }),
)

const SESSION_KEY_PREFIX = 'research:session:'
const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60

type LegacyResearchLogLevel = 'info' | 'warn' | 'error' | 'success'

type LegacyResearchLog = {
  timestamp: string
  level: LegacyResearchLogLevel
  message: string
}

type CompatibilitySessionRecord = {
  id: string
  topicIds: string[]
  researchMode: 'duration'
  durationHours: number
  stageDurationDays: number
  mode: 'full'
  status: 'running' | 'paused' | 'completed' | 'failed'
  progress: number
  currentStage: string
  currentTopicIndex: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  logs: LegacyResearchLog[]
}

type CompatibilitySessionView = CompatibilitySessionRecord & {
  totalTopics: number
  deadlineAt: string | null
  latestSummary: string | null
  results: {
    discoveredPapers: number
    admittedPapers: number
    generatedContents: number
    errors: Array<{ topicId?: string; error: string }>
  }
  topicProgress: Array<{
    topicId: string
    topicName: string
    status: 'pending' | 'running' | 'paused' | 'completed' | 'error'
    currentStage: number
    totalStages: number
    nodeCount: number
  }>
  schedulerState: unknown
}

function uniqueTopicIds(values: unknown) {
  if (!Array.isArray(values)) return []
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function parseStoredLogs(value: unknown): LegacyResearchLog[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (entry): entry is LegacyResearchLog =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as LegacyResearchLog).timestamp === 'string' &&
        typeof (entry as LegacyResearchLog).level === 'string' &&
        typeof (entry as LegacyResearchLog).message === 'string',
    )
    .map((entry): LegacyResearchLog => ({
      timestamp: entry.timestamp,
      level:
        entry.level === 'warn' ||
        entry.level === 'error' ||
        entry.level === 'success'
          ? entry.level
          : 'info',
      message: entry.message.trim(),
    }))
    .filter((entry) => Boolean(entry.message))
}

function parseDbTopicIds(value: string) {
  try {
    const parsed = JSON.parse(value)
    return uniqueTopicIds(parsed)
  } catch {
    return []
  }
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return []
  }
}

function clampStageDurationDays(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return STAGE_DURATION_DAYS_DEFAULT
  }

  return Math.min(
    STAGE_DURATION_DAYS_MAX,
    Math.max(STAGE_DURATION_DAYS_MIN, Math.trunc(value as number)),
  )
}

function resolveDurationOptions(body: Record<string, unknown>) {
  const requestedStageDurationDays =
    typeof body.stageDurationDays === 'number' && Number.isFinite(body.stageDurationDays)
      ? body.stageDurationDays
      : undefined
  const requestedDurationHours =
    typeof body.durationHours === 'number' && Number.isFinite(body.durationHours)
      ? body.durationHours
      : undefined

  const stageDurationDays =
    requestedStageDurationDays !== undefined
      ? clampStageDurationDays(requestedStageDurationDays)
      : clampStageDurationDays(
          requestedDurationHours !== undefined
            ? Math.ceil(requestedDurationHours / 24)
            : STAGE_DURATION_DAYS_DEFAULT,
        )

  const durationHours = Math.min(
    STAGE_DURATION_DAYS_MAX * 24,
    Math.max(STAGE_DURATION_DAYS_MIN * 24, requestedDurationHours ?? stageDurationDays * 24),
  )

  return {
    stageDurationDays,
    durationHours,
  }
}

function mapTopicProgressStatus(
  status: 'active' | 'paused' | 'completed' | 'failed' | 'interrupted' | null | undefined,
  active: boolean,
): 'pending' | 'running' | 'paused' | 'completed' | 'error' {
  if (active || status === 'active') return 'running'
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'error'
  if (status === 'paused' || status === 'interrupted') return 'paused'
  return 'pending'
}

function mapSessionStatus(args: {
  activeTopics: number
  completedTopics: number
  failedTopics: number
  totalTopics: number
}) {
  if (args.activeTopics > 0) return 'running' as const
  if (args.failedTopics > 0) return 'failed' as const
  if (args.totalTopics > 0 && args.completedTopics === args.totalTopics) {
    return 'completed' as const
  }
  return 'paused' as const
}

function buildStageLabel(args: {
  currentStage?: number | null
  latestSummary?: string | null
  totalTopics?: number
}) {
  const summary = args.latestSummary?.trim()
  if (summary) return summary
  if (typeof args.currentStage === 'number' && Number.isFinite(args.currentStage)) {
    return `Stage ${args.currentStage} deep research`
  }
  if ((args.totalTopics ?? 0) > 1) {
    return 'Multi-topic duration research'
  }
  return 'Duration research'
}

function appendLogIfChanged(
  logs: LegacyResearchLog[],
  entry: LegacyResearchLog | null,
): LegacyResearchLog[] {
  if (!entry) return logs
  const lastLog = logs.at(-1)
  if (
    lastLog?.level === entry.level &&
    lastLog?.message === entry.message
  ) {
    return logs
  }
  return [...logs, entry]
}

function buildInitialCompatibilityRecord(args: {
  sessionId: string
  topicIds: string[]
  durationHours: number
  stageDurationDays: number
}): CompatibilitySessionRecord {
  const now = new Date().toISOString()
  return {
    id: args.sessionId,
    topicIds: args.topicIds,
    researchMode: 'duration' as const,
    durationHours: args.durationHours,
    stageDurationDays: args.stageDurationDays,
    mode: 'full',
    status: 'running' as const,
    progress: 0,
    currentStage: buildStageLabel({ totalTopics: args.topicIds.length }),
    currentTopicIndex: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    logs: [
      {
        timestamp: now,
        level: 'info' as const,
        message:
          args.topicIds.length > 1
            ? `Started duration research across ${args.topicIds.length} topics.`
            : `Started duration research for topic ${args.topicIds[0]}.`,
      },
    ],
  }
}

async function persistCompatibilitySession(record: CompatibilitySessionRecord) {
  await setSession(`${SESSION_KEY_PREFIX}${record.id}`, record, DEFAULT_SESSION_TTL_SECONDS)
  await prisma.research_sessions.upsert({
    where: { id: record.id },
    update: {
      topicIds: JSON.stringify(record.topicIds),
      mode: record.researchMode,
      status: record.status,
      currentStage: record.currentStage,
      progress: record.progress,
      logs: JSON.stringify(record.logs),
      completedAt: record.completedAt ? new Date(record.completedAt) : null,
      error: record.status === 'failed' ? record.logs.at(-1)?.message ?? null : null,
    },
    create: {
      id: record.id,
      topicIds: JSON.stringify(record.topicIds),
      mode: record.researchMode,
      status: record.status,
      currentStage: record.currentStage,
      progress: record.progress,
      logs: JSON.stringify(record.logs),
      createdAt: new Date(record.createdAt),
      completedAt: record.completedAt ? new Date(record.completedAt) : null,
      error: record.status === 'failed' ? record.logs.at(-1)?.message ?? null : null,
    },
  })
}

async function loadCompatibilitySessionRecord(sessionId: string) {
  const cached = await getSession<CompatibilitySessionRecord>(`${SESSION_KEY_PREFIX}${sessionId}`)
  if (cached) {
    return {
      ...cached,
      topicIds: uniqueTopicIds(cached.topicIds),
      logs: parseStoredLogs(cached.logs),
    }
  }

  const dbSession = await prisma.research_sessions.findUnique({
    where: { id: sessionId },
  })

  if (!dbSession) {
    return null
  }

  return {
    id: dbSession.id,
    topicIds: parseDbTopicIds(dbSession.topicIds),
    researchMode: 'duration' as const,
    durationHours: STAGE_DURATION_DAYS_DEFAULT * 24,
    stageDurationDays: STAGE_DURATION_DAYS_DEFAULT,
    mode: 'full' as const,
    status: (
      dbSession.status === 'completed'
        ? 'completed'
        : dbSession.status === 'failed'
          ? 'failed'
          : dbSession.status === 'stopped'
            ? 'paused'
            : 'running') as CompatibilitySessionRecord['status'],
    progress: Math.round(dbSession.progress),
    currentStage: dbSession.currentStage?.trim() || 'Duration research',
    currentTopicIndex: 0,
    createdAt: dbSession.createdAt.toISOString(),
    updatedAt: dbSession.completedAt?.toISOString() ?? dbSession.createdAt.toISOString(),
    completedAt: dbSession.completedAt?.toISOString() ?? null,
    logs: parseStoredLogs(safeParseJson(dbSession.logs)),
  }
}

async function projectCompatibilitySession(
  record: CompatibilitySessionRecord,
): Promise<CompatibilitySessionView> {
  if (record.topicIds.length === 0) {
    throw new AppError(500, `Research session ${record.id} lost its topic mapping.`)
  }

  if (record.topicIds.length === 1) {
    const topicId = record.topicIds[0]
    const state = await enhancedTaskScheduler.getTopicResearchState(topicId)
    const progressValue = state.progress
      ? state.progress.researchMode === 'duration'
        ? computeDurationProgress(state.progress)
        : Math.round(state.progress.stageProgress)
      : record.progress
    const latestSummary = state.progress?.latestSummary ?? state.report?.summary ?? null
    const status = state.active
      ? 'running'
      : state.progress?.status === 'failed'
        ? 'failed'
        : state.progress?.status === 'completed'
          ? 'completed'
          : 'paused'
    const nextRecord: CompatibilitySessionRecord = {
      ...record,
      status,
      progress: progressValue,
      currentStage: buildStageLabel({
        currentStage: state.progress?.currentStage,
        latestSummary,
      }),
      currentTopicIndex: 0,
      updatedAt: new Date().toISOString(),
      completedAt:
        state.progress?.completedAt ??
        (status === 'completed' || status === 'failed' ? new Date().toISOString() : null),
      logs: appendLogIfChanged(
        record.logs,
        latestSummary
          ? {
              timestamp: new Date().toISOString(),
              level: status === 'failed' ? 'error' : status === 'completed' ? 'success' : 'info',
              message: latestSummary,
            }
          : null,
      ),
    }

    await persistCompatibilitySession(nextRecord)

    return {
      ...nextRecord,
      totalTopics: 1,
      deadlineAt: state.progress?.deadlineAt ?? null,
      latestSummary,
      results: {
        discoveredPapers: state.progress?.discoveredPapers ?? 0,
        admittedPapers: state.progress?.admittedPapers ?? 0,
        generatedContents: state.progress?.generatedContents ?? 0,
        errors:
          status === 'failed'
            ? [{
                topicId,
                error: state.report?.summary || state.progress?.latestSummary || 'Research failed.',
              }]
            : [],
      },
      topicProgress: [
        {
          topicId,
          topicName: state.progress?.topicName ?? topicId,
          status: mapTopicProgressStatus(state.progress?.status, state.active),
          currentStage: state.progress?.currentStage ?? 1,
          totalStages: state.progress?.totalStages ?? 0,
          nodeCount: 0,
        },
      ],
      schedulerState: state,
    }
  }

  const state = await enhancedTaskScheduler.getMultiTopicResearchState(record.topicIds)
  const firstActiveIndex = state.sessions.findIndex((session) => session.active)
  const leadSession =
    state.sessions[firstActiveIndex >= 0 ? firstActiveIndex : 0] ?? null
  const latestSummary =
    leadSession?.progress?.latestSummary ??
    leadSession?.report?.summary ??
    null
  const status = mapSessionStatus({
    activeTopics: state.aggregate.activeTopics,
    completedTopics: state.aggregate.completedTopics,
    failedTopics: state.aggregate.failedTopics,
    totalTopics: state.aggregate.totalTopics,
  })
  const nextRecord: CompatibilitySessionRecord = {
    ...record,
    status,
    progress: Math.round(state.aggregate.overallProgress),
    currentStage: buildStageLabel({
      currentStage: leadSession?.progress?.currentStage,
      latestSummary,
      totalTopics: record.topicIds.length,
    }),
    currentTopicIndex: firstActiveIndex >= 0 ? firstActiveIndex : 0,
    updatedAt: new Date().toISOString(),
    completedAt:
      status === 'completed' || status === 'failed'
        ? new Date().toISOString()
        : null,
    logs: appendLogIfChanged(
      record.logs,
      latestSummary
        ? {
            timestamp: new Date().toISOString(),
            level: status === 'failed' ? 'error' : status === 'completed' ? 'success' : 'info',
            message: latestSummary,
          }
        : null,
    ),
  }

  await persistCompatibilitySession(nextRecord)

  return {
    ...nextRecord,
    totalTopics: state.aggregate.totalTopics,
    deadlineAt: state.aggregate.deadlineAt,
    latestSummary,
    results: {
      discoveredPapers: state.aggregate.totalDiscoveredPapers,
      admittedPapers: state.aggregate.totalAdmittedPapers,
      generatedContents: state.aggregate.totalGeneratedContents,
      errors: state.sessions
        .filter((session) => Boolean(session.error))
        .map((session) => ({
          topicId: session.topicId,
          error: session.error as string,
        })),
    },
    topicProgress: state.sessions.map((session) => ({
      topicId: session.topicId,
      topicName: session.progress?.topicName ?? session.topicId,
      status: mapTopicProgressStatus(session.progress?.status, session.active),
      currentStage: session.progress?.currentStage ?? 1,
      totalStages: session.progress?.totalStages ?? 0,
      nodeCount: 0,
    })),
    schedulerState: state,
  }
}

async function loadProjectedSession(sessionId: string) {
  const record = await loadCompatibilitySessionRecord(sessionId)
  if (!record) {
    throw new AppError(404, 'Research session not found.')
  }

  return projectCompatibilitySession(record)
}

router.post(
  '/sessions',
  validate(CreateResearchSessionSchema),
  asyncHandler(async (req, res) => {
    const topicIds = uniqueTopicIds(req.body.topicIds)
    if (topicIds.length === 0) {
      throw new AppError(400, 'topicIds must contain at least one topic ID.')
    }

    const { durationHours, stageDurationDays } = resolveDurationOptions(req.body)
    const sessionId = uuidv4()

    const record = buildInitialCompatibilityRecord({
      sessionId,
      topicIds,
      durationHours,
      stageDurationDays,
    })

    await persistCompatibilitySession(record)

    try {
      if (topicIds.length === 1) {
        await enhancedTaskScheduler.startTopicResearchSession(topicIds[0], {
          durationHours,
          stageDurationDays,
        })
      } else {
        await enhancedTaskScheduler.startMultiTopicResearchSession(topicIds, {
          durationHours,
          stageDurationDays,
        })
      }
    } catch (error) {
      const failedRecord: CompatibilitySessionRecord = {
        ...record,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        logs: appendLogIfChanged(record.logs, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: error instanceof Error ? error.message : 'Failed to start duration research.',
        }),
      }
      await persistCompatibilitySession(failedRecord)
      throw error
    }

    const projected = await loadProjectedSession(sessionId)

    res.status(201).json({
      sessionId,
      status: projected.status,
      data: projected,
    })
  }),
)

router.get(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const session = await loadProjectedSession(req.params.id)
    res.json({ success: true, data: session })
  }),
)

router.get(
  '/sessions',
  asyncHandler(async (_req, res) => {
    const cachedSessions = await getAllSessions<CompatibilitySessionRecord>(`${SESSION_KEY_PREFIX}*`)
    const records: CompatibilitySessionRecord[] =
      cachedSessions.size > 0
        ? Array.from(cachedSessions.values())
        : (
            await prisma.research_sessions.findMany({
              orderBy: { createdAt: 'desc' },
              take: 50,
            })
          ).map((session) => ({
            id: session.id,
            topicIds: parseDbTopicIds(session.topicIds),
            researchMode: 'duration' as const,
            durationHours: STAGE_DURATION_DAYS_DEFAULT * 24,
            stageDurationDays: STAGE_DURATION_DAYS_DEFAULT,
            mode: 'full' as const,
            status: (
              session.status === 'completed'
                ? 'completed'
                : session.status === 'failed'
                  ? 'failed'
                  : session.status === 'stopped'
                    ? 'paused'
                    : 'running') as CompatibilitySessionRecord['status'],
            progress: Math.round(session.progress),
            currentStage: session.currentStage?.trim() || 'Duration research',
            currentTopicIndex: 0,
            createdAt: session.createdAt.toISOString(),
            updatedAt: session.completedAt?.toISOString() ?? session.createdAt.toISOString(),
            completedAt: session.completedAt?.toISOString() ?? null,
            logs: parseStoredLogs(safeParseJson(session.logs)),
          }))

    const sessions = await Promise.all(
      records
        .map((record) => ({
          ...record,
          topicIds: uniqueTopicIds(record.topicIds),
          logs: parseStoredLogs(record.logs),
        }))
        .filter((record) => record.topicIds.length > 0)
        .map((record) => projectCompatibilitySession(record)),
    )

    res.json({ success: true, data: sessions })
  }),
)

router.post(
  '/sessions/:id/stop',
  asyncHandler(async (req, res) => {
    const record = await loadCompatibilitySessionRecord(req.params.id)
    if (!record) {
      throw new AppError(404, 'Research session not found.')
    }

    if (record.topicIds.length === 1) {
      await enhancedTaskScheduler.stopTopicResearchSession(record.topicIds[0])
    } else {
      await enhancedTaskScheduler.stopMultiTopicResearchSession(record.topicIds)
    }

    const projected = await loadProjectedSession(req.params.id)
    const stoppedRecord: CompatibilitySessionRecord = {
      ...projected,
      status: 'paused',
      updatedAt: new Date().toISOString(),
      completedAt: projected.completedAt,
      logs: appendLogIfChanged(projected.logs, {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'Research session was stopped manually.',
      }),
    }
    await persistCompatibilitySession(stoppedRecord)

    res.json({
      success: true,
      message: 'Research session stopped.',
      data: {
        ...projected,
        ...stoppedRecord,
      },
    })
  }),
)

router.delete(
  '/sessions/:id',
  asyncHandler(async (req, res) => {
    const sessionId = req.params.id
    await deleteSession(`${SESSION_KEY_PREFIX}${sessionId}`)
    await prisma.research_sessions.deleteMany({
      where: { id: sessionId },
    })

    res.json({ success: true })
  }),
)

export default router
