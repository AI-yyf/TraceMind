import { loadTopicDefinitions } from '../../../topic-config'
import {
  ensureConfiguredTopicMaterialized,
  pruneLegacySeedTopics,
} from './topic-config-sync'

type ScopedTopicRecord = {
  id: string
  papers: Array<{ id: string }>
  research_nodes: Array<{ id: string }>
}

type TopicScope = {
  topicIds: string[]
  paperIds: string[]
  nodeIds: string[]
}

type DeleteManyResult = {
  count: number
}

type DeleteManyDelegate = {
  deleteMany(args?: Record<string, unknown>): Promise<DeleteManyResult>
}

type TopicLookupDelegate = {
  findMany(args: any): Promise<ScopedTopicRecord[]>
  count(args?: any): Promise<number>
}

type TopicPruneFn = (topicIds?: readonly string[]) => Promise<string[]>

export type RuntimeResetPrisma = {
  topics: TopicLookupDelegate
  system_configs: DeleteManyDelegate
  research_sessions: DeleteManyDelegate
  topic_session_memories: DeleteManyDelegate
  topic_guidance_ledgers: DeleteManyDelegate
  research_pipeline_states: DeleteManyDelegate
  research_world_snapshots: DeleteManyDelegate
}

export type TopicRuntimeResetOptions = {
  topicId?: string | null
  clearSessions?: boolean
  clearRuntimeState?: boolean
  ensureCanonicalTopics?: boolean
  pruneLegacyTopics?: boolean
}

export type TopicRuntimeResetResult = {
  canonicalTopicIds: string[]
  scopedTopicId: string | null
  preservedTopicCount: number
  preservedTopicIds: string[]
  clearedSystemConfigs: number
  clearedResearchSessions: number
  clearedTopicSessionMemories: number
  clearedTopicGuidanceLedgers: number
  clearedResearchPipelineStates: number
  clearedResearchWorldSnapshots: number
  uploadsPreserved: true
}

const TOPIC_RUNTIME_CONFIG_PREFIXES = [
  'alpha:topic-artifact:',
  'alpha:reader-artifact:',
  'generation-artifact-index:v1:',
  'generation-memory:v1:',
  'generation-judgments:v1:',
  'discovery:',
  'topic-stage-config:v1:',
  'topic-research-world:v1:',
] as const

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

export function getCanonicalTopicIds() {
  return loadTopicDefinitions()
    .map((topic) => topic.id.trim())
    .filter(Boolean)
}

export function collectNonCanonicalTopicIds(topicIds: readonly string[], canonicalTopicIds: readonly string[]) {
  const canonicalSet = new Set(canonicalTopicIds)
  return uniqueIds([...topicIds]).filter((topicId) => !canonicalSet.has(topicId))
}

export async function ensureCanonicalTopicBaseline(topicId?: string | null) {
  const canonicalTopicIds = getCanonicalTopicIds()
  const targetTopicIds = topicId ? canonicalTopicIds.filter((id) => id === topicId) : canonicalTopicIds

  if (targetTopicIds.length === 0) {
    throw new Error(
      topicId
        ? `Topic "${topicId}" is not part of the canonical five-topic baseline.`
        : 'No canonical topics are configured.',
    )
  }

  for (const canonicalTopicId of targetTopicIds) {
    await ensureConfiguredTopicMaterialized(canonicalTopicId)
  }

  await pruneLegacySeedTopics()
  return canonicalTopicIds
}

export async function collectTopicScope(
  prisma: RuntimeResetPrisma,
  topicId?: string | null,
): Promise<TopicScope> {
  const topics = await prisma.topics.findMany({
    where: topicId ? { id: topicId } : {},
    select: {
      id: true,
      papers: { select: { id: true } },
      research_nodes: { select: { id: true } },
    },
  })

  return {
    topicIds: uniqueIds(topics.map((topic) => topic.id)),
    paperIds: uniqueIds(topics.flatMap((topic) => topic.papers.map((paper) => paper.id))),
    nodeIds: uniqueIds(topics.flatMap((topic) => topic.research_nodes.map((node) => node.id))),
  }
}

export function buildRuntimeSystemConfigFilters(scope: TopicScope, topicId?: string | null) {
  if (topicId) {
    return [
      { key: { startsWith: `alpha:topic-artifact:${topicId}:` } },
      { key: { startsWith: `generation-artifact-index:v1:${topicId}` } },
      { key: { startsWith: `generation-memory:v1:${topicId}` } },
      { key: { startsWith: `generation-judgments:v1:${topicId}` } },
      { key: { startsWith: `discovery:${topicId}` } },
      { key: { startsWith: `topic-stage-config:v1:${topicId}` } },
      { key: { startsWith: `topic-research-world:v1:${topicId}` } },
      { key: { startsWith: `topic:session-memory:v1:${topicId}` } },
      { key: { startsWith: `topic:guidance-ledger:v1:${topicId}` } },
      { key: { startsWith: `topic:${topicId}:research-report` } },
      { key: { startsWith: `topic:${topicId}:research-pipeline` } },
      ...scope.paperIds.map((id) => ({ key: { startsWith: `alpha:reader-artifact:paper:${id}` } })),
      ...scope.nodeIds.map((id) => ({ key: { startsWith: `alpha:reader-artifact:node:${id}` } })),
    ]
  }

  return [
    ...TOPIC_RUNTIME_CONFIG_PREFIXES.map((prefix) => ({
      key: { startsWith: prefix },
    })),
    ...scope.topicIds.flatMap((id) => [
      { key: { startsWith: `topic:session-memory:v1:${id}` } },
      { key: { startsWith: `topic:guidance-ledger:v1:${id}` } },
      { key: { startsWith: `topic:${id}:research-report` } },
      { key: { startsWith: `topic:${id}:research-pipeline` } },
    ]),
  ]
}

function buildRuntimeTableWhere(topicId?: string | null) {
  return topicId ? { topicId } : {}
}

function buildResearchSessionWhere(topicId?: string | null) {
  if (!topicId) return {}
  return {
    topicIds: {
      contains: JSON.stringify(topicId),
    },
  }
}

function resolvePreservedTopicIds(args: {
  scopeTopicIds: string[]
  canonicalTopicIds: string[]
  scopedTopicId: string | null
  ensureCanonicalTopics: boolean
}) {
  if (args.scopedTopicId) {
    return uniqueIds(
      args.scopeTopicIds.length > 0 ? args.scopeTopicIds : [args.scopedTopicId],
    )
  }

  if (args.ensureCanonicalTopics) {
    return uniqueIds(args.canonicalTopicIds)
  }

  return uniqueIds(args.scopeTopicIds)
}

export async function clearTopicRuntimeState(
  prisma: RuntimeResetPrisma,
  options: TopicRuntimeResetOptions = {},
  dependencies: {
    pruneTopics?: TopicPruneFn
    ensureCanonicalBaseline?: (topicId?: string | null) => Promise<string[]>
  } = {},
): Promise<TopicRuntimeResetResult> {
  const scopedTopicId = options.topicId?.trim() || null
  const ensureCanonicalTopics = options.ensureCanonicalTopics !== false
  const pruneLegacyTopics = options.pruneLegacyTopics !== false
  const clearSessions = options.clearSessions !== false
  const clearRuntimeState = options.clearRuntimeState === true
  const pruneTopics = dependencies.pruneTopics ?? pruneLegacySeedTopics
  const ensureCanonicalBaseline =
    dependencies.ensureCanonicalBaseline ?? ensureCanonicalTopicBaseline

  const canonicalTopicIds = ensureCanonicalTopics
    ? await ensureCanonicalBaseline(scopedTopicId)
    : getCanonicalTopicIds()

  if (!ensureCanonicalTopics && pruneLegacyTopics) {
    await pruneTopics()
  }

  if (ensureCanonicalTopics && pruneLegacyTopics && !scopedTopicId) {
    const allTopicIds = uniqueIds((await prisma.topics.findMany({
      select: {
        id: true,
        papers: { select: { id: true } },
        research_nodes: { select: { id: true } },
      },
    })).map((topic) => topic.id))
    const nonCanonicalTopicIds = collectNonCanonicalTopicIds(allTopicIds, canonicalTopicIds)
    if (nonCanonicalTopicIds.length > 0) {
      await pruneTopics(nonCanonicalTopicIds)
    }
  }

  const scope = await collectTopicScope(prisma, scopedTopicId)
  const filters = buildRuntimeSystemConfigFilters(scope, scopedTopicId)

  const systemConfigsResult =
    filters.length > 0
      ? await prisma.system_configs.deleteMany({
          where: {
            OR: filters,
          },
        })
      : { count: 0 }

  const researchSessionsResult = clearSessions
    ? await prisma.research_sessions.deleteMany({
        where: buildResearchSessionWhere(scopedTopicId),
      })
    : { count: 0 }

  const topicSessionMemoriesResult = clearRuntimeState
    ? await prisma.topic_session_memories.deleteMany({
        where: buildRuntimeTableWhere(scopedTopicId),
      })
    : { count: 0 }

  const topicGuidanceLedgersResult = clearRuntimeState
    ? await prisma.topic_guidance_ledgers.deleteMany({
        where: buildRuntimeTableWhere(scopedTopicId),
      })
    : { count: 0 }

  const researchPipelineStatesResult = clearRuntimeState
    ? await prisma.research_pipeline_states.deleteMany({
        where: buildRuntimeTableWhere(scopedTopicId),
      })
    : { count: 0 }

  const researchWorldSnapshotsResult = clearRuntimeState
    ? await prisma.research_world_snapshots.deleteMany({
        where: buildRuntimeTableWhere(scopedTopicId),
      })
    : { count: 0 }

  const preservedTopicIds = resolvePreservedTopicIds({
    scopeTopicIds: scope.topicIds,
    canonicalTopicIds,
    scopedTopicId,
    ensureCanonicalTopics,
  })

  return {
    canonicalTopicIds,
    scopedTopicId,
    preservedTopicCount: preservedTopicIds.length,
    preservedTopicIds,
    clearedSystemConfigs: systemConfigsResult.count,
    clearedResearchSessions: researchSessionsResult.count,
    clearedTopicSessionMemories: topicSessionMemoriesResult.count,
    clearedTopicGuidanceLedgers: topicGuidanceLedgersResult.count,
    clearedResearchPipelineStates: researchPipelineStatesResult.count,
    clearedResearchWorldSnapshots: researchWorldSnapshotsResult.count,
    uploadsPreserved: true,
  }
}
