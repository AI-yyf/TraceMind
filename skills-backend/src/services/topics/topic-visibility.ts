import { prisma } from '../../lib/prisma'
import { logger } from '../../utils/logger'

type TopicLike = {
  id?: string | null
  nameZh?: string | null
  nameEn?: string | null
  summary?: string | null
  description?: string | null
}

const SYNTHETIC_TOPIC_ID_PATTERNS = [
  /^topic-alpha-route-/iu,
  /^prompt-templates-route-/iu,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
]

const SYNTHETIC_TOPIC_TEXT_PATTERNS = [
  /\bexternal agent route test topic\b/iu,
  /\bcreate a regression topic\b/iu,
  /\bcreate a regres\b/iu,
  /\bseeded for regression coverage\b/iu,
  /外部代理测试主题/u,
]

const TOPIC_RUNTIME_CONFIG_PREFIXES = [
  'alpha:topic-artifact:',
  'alpha:reader-artifact:',
  'generation-artifact-index:v1:',
  'generation-memory:v1:',
  'generation-judgments:v1:',
  'topic-stage-config:v1:',
  'topic:session-memory:v1:',
  'topic:guidance-ledger:v1:',
  'topic-research-world:v1:',
  'cross-topic-index:v1:',
] as const

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

export function isSyntheticTopic(topic: TopicLike) {
  const id = normalizeText(topic.id)
  const combinedText = [
    topic.nameZh,
    topic.nameEn,
    topic.summary,
    topic.description,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ')

  if (SYNTHETIC_TOPIC_ID_PATTERNS.some((pattern) => pattern.test(id))) {
    return true
  }

  return SYNTHETIC_TOPIC_TEXT_PATTERNS.some((pattern) => pattern.test(combinedText))
}

export function filterVisibleTopics<T extends TopicLike>(topics: T[]) {
  return topics.filter((topic) => !isSyntheticTopic(topic))
}

function buildSyntheticTopicConfigFilters(args: {
  topicIds: string[]
  paperIds: string[]
  nodeIds: string[]
}) {
  return [
    ...args.topicIds.map((topicId) => ({ key: { contains: topicId } })),
    ...args.paperIds.map((paperId) => ({ key: { contains: paperId } })),
    ...args.nodeIds.map((nodeId) => ({ key: { contains: nodeId } })),
  ]
}

export async function purgeSyntheticTopics() {
  const syntheticTopics = await prisma.topics.findMany({
    where: {
      OR: [
        { id: { startsWith: 'topic-alpha-route-' } },
        { id: { startsWith: 'prompt-templates-route-' } },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      summary: true,
      description: true,
      papers: {
        select: {
          id: true,
        },
      },
      research_nodes: {
        select: {
          id: true,
        },
      },
    },
  })

  const extraSyntheticTopics = await prisma.topics.findMany({
    where: {
      OR: [
        { nameZh: { contains: '外部代理测试主题' } },
        { nameEn: { contains: 'External Agent Route Test Topic' } },
        { nameEn: { contains: 'Create a Regression Topic' } },
        { nameEn: { contains: 'Create A Regression Topic' } },
      ],
    },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      summary: true,
      description: true,
      papers: {
        select: {
          id: true,
        },
      },
      research_nodes: {
        select: {
          id: true,
        },
      },
    },
  })

  const topicsById = new Map<string, (typeof syntheticTopics)[number]>()
  for (const topic of [...syntheticTopics, ...extraSyntheticTopics]) {
    if (isSyntheticTopic(topic)) {
      topicsById.set(topic.id, topic)
    }
  }

  const topics = [...topicsById.values()]
  if (topics.length === 0) {
    return { deletedTopicCount: 0, topicIds: [] as string[] }
  }

  const topicIds = topics.map((topic) => topic.id)
  const paperIds = Array.from(new Set(topics.flatMap((topic) => topic.papers.map((paper) => paper.id))))
  const nodeIds = Array.from(new Set(topics.flatMap((topic) => topic.research_nodes.map((node) => node.id))))

  const systemConfigFilters = buildSyntheticTopicConfigFilters({
    topicIds,
    paperIds,
    nodeIds,
  })

  await prisma.system_configs.deleteMany({
    where: {
      OR: [
        ...systemConfigFilters,
        ...TOPIC_RUNTIME_CONFIG_PREFIXES.flatMap((prefix) =>
          topicIds.map((topicId) => ({
            key: {
              startsWith: `${prefix}${topicId}`,
            },
          })),
        ),
      ],
    },
  })

  await prisma.research_sessions.deleteMany({
    where: {
      OR: topicIds.map((topicId) => ({
        topicIds: {
          contains: topicId,
        },
      })),
    },
  })

  await prisma.topics.deleteMany({
    where: {
      id: {
        in: topicIds,
      },
    },
  })

  logger.info('Purged synthetic test topics from the active database.', {
    topicIds,
    deletedTopicCount: topicIds.length,
  })

  return {
    deletedTopicCount: topicIds.length,
    topicIds,
  }
}
