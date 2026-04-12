import { prisma } from '../../lib/prisma'
import {
  readVersionedSystemConfig,
  writeVersionedSystemConfig,
} from '../system-config-journal'
import { getTopicDefinition } from '../../../topic-config'
import {
  DEFAULT_STAGE_WINDOW_MONTHS,
  normalizeStageWindowMonths,
} from './stage-buckets'

const TOPIC_STAGE_CONFIG_SCHEMA_VERSION = 'topic-stage-config-v1'
const TOPIC_STAGE_CONFIG_KEY_PREFIX = 'topic-stage-config:v1:'

export interface TopicStageConfigState {
  schemaVersion: typeof TOPIC_STAGE_CONFIG_SCHEMA_VERSION
  topicId: string
  windowMonths: number
  updatedAt: string
}

function topicStageConfigKey(topicId: string) {
  return `${TOPIC_STAGE_CONFIG_KEY_PREFIX}${topicId}`
}

export function resolvePreferredTopicStageWindowMonths(topicId: string) {
  try {
    const topicDefinition = getTopicDefinition(topicId)
const explicitDefault = (topicDefinition.defaults as unknown as Record<string, unknown>)
      .defaultStageWindowMonths

    if (typeof explicitDefault === 'number' && Number.isFinite(explicitDefault)) {
      return normalizeStageWindowMonths(explicitDefault)
    }

    if (
      typeof topicDefinition.defaults.maxStageWindowMonths === 'number' &&
      Number.isFinite(topicDefinition.defaults.maxStageWindowMonths)
    ) {
      return normalizeStageWindowMonths(topicDefinition.defaults.maxStageWindowMonths)
    }

    if (
      typeof topicDefinition.defaults.minStageWindowMonths === 'number' &&
      Number.isFinite(topicDefinition.defaults.minStageWindowMonths)
    ) {
      return normalizeStageWindowMonths(topicDefinition.defaults.minStageWindowMonths)
    }
  } catch {
    // The topic may be user-created rather than config-backed; fall back to the global default.
  }

  return DEFAULT_STAGE_WINDOW_MONTHS
}

function buildFallback(topicId: string): TopicStageConfigState {
  return {
    schemaVersion: TOPIC_STAGE_CONFIG_SCHEMA_VERSION,
    topicId,
    windowMonths: resolvePreferredTopicStageWindowMonths(topicId),
    updatedAt: new Date(0).toISOString(),
  }
}

function parseTopicStageConfig(topicId: string, value: unknown): TopicStageConfigState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Partial<TopicStageConfigState>
  if (candidate.topicId && candidate.topicId !== topicId) return null

  return {
    schemaVersion: TOPIC_STAGE_CONFIG_SCHEMA_VERSION,
    topicId,
    windowMonths: normalizeStageWindowMonths(candidate.windowMonths),
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : new Date().toISOString(),
  }
}

export async function loadTopicStageConfig(topicId: string) {
  const fallback = buildFallback(topicId)
  const record = await readVersionedSystemConfig({
    key: topicStageConfigKey(topicId),
    parse: (value) => parseTopicStageConfig(topicId, value),
    fallback,
  })

  return record.value
}

export async function loadTopicStageConfigMap(topicIds: string[]) {
  const uniqueTopicIds = Array.from(
    new Set(topicIds.filter((topicId) => typeof topicId === 'string' && topicId.trim())),
  )

  if (uniqueTopicIds.length === 0) {
    return new Map<string, TopicStageConfigState>()
  }

  const records = await Promise.all(
    uniqueTopicIds.map(async (topicId) => [topicId, await loadTopicStageConfig(topicId)] as const),
  )

  return new Map(records)
}

export async function saveTopicStageConfig(topicId: string, windowMonths: number) {
  const topicArtifacts = await prisma.topics.findUnique({
    where: { id: topicId },
    select: {
      papers: {
        select: { id: true },
      },
      research_nodes: {
        select: { id: true },
      },
    },
  })
  const nextValue: TopicStageConfigState = {
    schemaVersion: TOPIC_STAGE_CONFIG_SCHEMA_VERSION,
    topicId,
    windowMonths: normalizeStageWindowMonths(windowMonths),
    updatedAt: new Date().toISOString(),
  }

  const record = await writeVersionedSystemConfig({
    key: topicStageConfigKey(topicId),
    value: nextValue,
    parse: (value) => parseTopicStageConfig(topicId, value),
    fallback: buildFallback(topicId),
    source: 'topic-stage-config',
  })
  const readerArtifactPrefixes = [
    ...(topicArtifacts?.papers.map((paper) => `alpha:reader-artifact:paper:${paper.id}`) ?? []),
    ...(topicArtifacts?.research_nodes.map((node) => `alpha:reader-artifact:node:${node.id}`) ?? []),
  ]

  await prisma.system_configs.deleteMany({
    where: {
      OR: [
        {
          key: {
            startsWith: `alpha:topic-artifact:${topicId}:window-`,
          },
        },
        ...(
          readerArtifactPrefixes.length > 0
            ? readerArtifactPrefixes.map((prefix) => ({
                key: {
                  startsWith: prefix,
                },
              }))
            : [
                {
                  key: '__never__',
                },
              ]
        ),
      ],
    },
  })

  return record.value
}
