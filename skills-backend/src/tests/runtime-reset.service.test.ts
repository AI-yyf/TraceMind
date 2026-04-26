import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRuntimeSystemConfigFilters,
  clearTopicRuntimeState,
  collectNonCanonicalTopicIds,
  getCanonicalTopicIds,
  type RuntimeResetPrisma,
} from '../services/topics/runtime-reset'

function createMockPrisma(
  topics: Array<{
    id: string
    papers?: Array<{ id: string }>
    research_nodes?: Array<{ id: string }>
  }> = [
    {
      id: 'agent',
      papers: [{ id: 'paper-a' }, { id: 'paper-b' }],
      research_nodes: [{ id: 'node-a' }, { id: 'node-b' }],
    },
  ],
): RuntimeResetPrisma & {
  calls: {
    systemConfigsWhere: Array<Record<string, unknown>>
    researchSessionsWhere: Array<Record<string, unknown>>
    topicSessionMemoriesWhere: Array<Record<string, unknown>>
    topicGuidanceLedgersWhere: Array<Record<string, unknown>>
    researchPipelineStatesWhere: Array<Record<string, unknown>>
    researchWorldSnapshotsWhere: Array<Record<string, unknown>>
  }
} {
  const calls = {
    systemConfigsWhere: [] as Array<Record<string, unknown>>,
    researchSessionsWhere: [] as Array<Record<string, unknown>>,
    topicSessionMemoriesWhere: [] as Array<Record<string, unknown>>,
    topicGuidanceLedgersWhere: [] as Array<Record<string, unknown>>,
    researchPipelineStatesWhere: [] as Array<Record<string, unknown>>,
    researchWorldSnapshotsWhere: [] as Array<Record<string, unknown>>,
  }

  return {
    calls,
    topics: {
      async findMany() {
        return topics.map((topic) => ({
          id: topic.id,
          papers: topic.papers ?? [],
          research_nodes: topic.research_nodes ?? [],
        }))
      },
      async count() {
        return topics.length
      },
    },
    system_configs: {
      async deleteMany(args = {}) {
        calls.systemConfigsWhere.push(args.where as Record<string, unknown>)
        return { count: 7 }
      },
    },
    research_sessions: {
      async deleteMany(args = {}) {
        calls.researchSessionsWhere.push(args.where as Record<string, unknown>)
        return { count: 2 }
      },
    },
    topic_session_memories: {
      async deleteMany(args = {}) {
        calls.topicSessionMemoriesWhere.push(args.where as Record<string, unknown>)
        return { count: 1 }
      },
    },
    topic_guidance_ledgers: {
      async deleteMany(args = {}) {
        calls.topicGuidanceLedgersWhere.push(args.where as Record<string, unknown>)
        return { count: 1 }
      },
    },
    research_pipeline_states: {
      async deleteMany(args = {}) {
        calls.researchPipelineStatesWhere.push(args.where as Record<string, unknown>)
        return { count: 1 }
      },
    },
    research_world_snapshots: {
      async deleteMany(args = {}) {
        calls.researchWorldSnapshotsWhere.push(args.where as Record<string, unknown>)
        return { count: 1 }
      },
    },
  }
}

test('getCanonicalTopicIds keeps the canonical five-topic baseline', () => {
  assert.deepEqual([...getCanonicalTopicIds()].sort(), [
    'agent',
    'autonomous-driving',
    'bio-inspired-ml',
    'embodied-vla',
    'transformer-innovation',
  ])
})

test('collectNonCanonicalTopicIds isolates non-canonical topics during runtime reset', () => {
  assert.deepEqual(
    collectNonCanonicalTopicIds(
      [
        'agent',
        'autonomous-driving',
        'legacy-upload-topic',
        'transformer-innovation',
        'agent',
      ],
      getCanonicalTopicIds(),
    ),
    ['legacy-upload-topic'],
  )
})

test('buildRuntimeSystemConfigFilters scopes runtime caches to a single preserved topic', () => {
  const filters = buildRuntimeSystemConfigFilters(
    {
      topicIds: ['agent'],
      paperIds: ['paper-a'],
      nodeIds: ['node-a'],
    },
    'agent',
  )

  assert.deepEqual(filters, [
    { key: { startsWith: 'alpha:topic-artifact:agent:' } },
    { key: { startsWith: 'generation-artifact-index:v1:agent' } },
    { key: { startsWith: 'generation-memory:v1:agent' } },
    { key: { startsWith: 'generation-judgments:v1:agent' } },
    { key: { startsWith: 'discovery:agent' } },
    { key: { startsWith: 'topic-stage-config:v1:agent' } },
    { key: { startsWith: 'topic-research-world:v1:agent' } },
    { key: { startsWith: 'topic:session-memory:v1:agent' } },
    { key: { startsWith: 'topic:guidance-ledger:v1:agent' } },
    { key: { startsWith: 'topic:agent:research-report' } },
    { key: { startsWith: 'topic:agent:research-pipeline' } },
    { key: { startsWith: 'alpha:reader-artifact:paper:paper-a' } },
    { key: { startsWith: 'alpha:reader-artifact:node:node-a' } },
  ])
})

test('buildRuntimeSystemConfigFilters includes research-world snapshots during global resets', () => {
  const filters = buildRuntimeSystemConfigFilters(
    {
      topicIds: ['agent'],
      paperIds: ['paper-a'],
      nodeIds: ['node-a'],
    },
    null,
  )

  assert.deepEqual(filters, [
    { key: { startsWith: 'alpha:topic-artifact:' } },
    { key: { startsWith: 'alpha:reader-artifact:' } },
    { key: { startsWith: 'generation-artifact-index:v1:' } },
    { key: { startsWith: 'generation-memory:v1:' } },
    { key: { startsWith: 'generation-judgments:v1:' } },
    { key: { startsWith: 'discovery:' } },
    { key: { startsWith: 'topic-stage-config:v1:' } },
    { key: { startsWith: 'topic-research-world:v1:' } },
    { key: { startsWith: 'topic:session-memory:v1:agent' } },
    { key: { startsWith: 'topic:guidance-ledger:v1:agent' } },
    { key: { startsWith: 'topic:agent:research-report' } },
    { key: { startsWith: 'topic:agent:research-pipeline' } },
  ])
})

test('clearTopicRuntimeState clears caches and runtime state without deleting topics', async () => {
  const prisma = createMockPrisma()

  const result = await clearTopicRuntimeState(prisma, {
    topicId: 'agent',
    ensureCanonicalTopics: false,
    pruneLegacyTopics: false,
  })

  assert.equal(result.preservedTopicCount, 1)
  assert.deepEqual(result.preservedTopicIds, ['agent'])
  assert.equal(result.clearedSystemConfigs, 7)
  assert.equal(result.clearedResearchSessions, 2)
  assert.equal(result.clearedTopicSessionMemories, 0)
  assert.equal(result.clearedTopicGuidanceLedgers, 0)
  assert.equal(result.clearedResearchPipelineStates, 0)
  assert.equal(result.clearedResearchWorldSnapshots, 0)
  assert.equal(result.uploadsPreserved, true)

  assert.deepEqual(prisma.calls.researchSessionsWhere, [
    {
      topicIds: {
        contains: '"agent"',
      },
    },
  ])
  assert.deepEqual(prisma.calls.topicSessionMemoriesWhere, [])
  assert.deepEqual(prisma.calls.topicGuidanceLedgersWhere, [])
  assert.deepEqual(prisma.calls.researchPipelineStatesWhere, [])
  assert.deepEqual(prisma.calls.researchWorldSnapshotsWhere, [])
})

test('clearTopicRuntimeState fully clears runtime tables when clearRuntimeState is enabled', async () => {
  const prisma = createMockPrisma()

  const result = await clearTopicRuntimeState(prisma, {
    topicId: 'agent',
    ensureCanonicalTopics: false,
    pruneLegacyTopics: false,
    clearRuntimeState: true,
  })

  assert.equal(result.preservedTopicCount, 1)
  assert.equal(result.clearedTopicSessionMemories, 1)
  assert.equal(result.clearedTopicGuidanceLedgers, 1)
  assert.equal(result.clearedResearchPipelineStates, 1)
  assert.equal(result.clearedResearchWorldSnapshots, 1)

  assert.deepEqual(prisma.calls.topicSessionMemoriesWhere, [{ topicId: 'agent' }])
  assert.deepEqual(prisma.calls.topicGuidanceLedgersWhere, [{ topicId: 'agent' }])
  assert.deepEqual(prisma.calls.researchPipelineStatesWhere, [{ topicId: 'agent' }])
  assert.deepEqual(prisma.calls.researchWorldSnapshotsWhere, [{ topicId: 'agent' }])
})

test('clearTopicRuntimeState prunes non-canonical topics during a global canonical reset', async () => {
  const prisma = createMockPrisma([
    {
      id: 'agent',
      papers: [{ id: 'paper-a' }],
      research_nodes: [{ id: 'node-a' }],
    },
    {
      id: 'autonomous-driving',
      papers: [{ id: 'paper-b' }],
      research_nodes: [{ id: 'node-b' }],
    },
    {
      id: 'bio-inspired-ml',
      papers: [{ id: 'paper-c' }],
      research_nodes: [{ id: 'node-c' }],
    },
    {
      id: 'embodied-vla',
      papers: [{ id: 'paper-d' }],
      research_nodes: [{ id: 'node-d' }],
    },
    {
      id: 'transformer-innovation',
      papers: [{ id: 'paper-e' }],
      research_nodes: [{ id: 'node-e' }],
    },
    {
      id: 'legacy-upload-topic',
      papers: [{ id: 'paper-z' }],
      research_nodes: [{ id: 'node-z' }],
    },
  ])
  const prunedTopicIds: string[][] = []

  const result = await clearTopicRuntimeState(
    prisma,
    {
      ensureCanonicalTopics: true,
      pruneLegacyTopics: true,
    },
    {
      async ensureCanonicalBaseline() {
        return getCanonicalTopicIds()
      },
      async pruneTopics(topicIds = []) {
        prunedTopicIds.push([...topicIds])
        return [...topicIds]
      },
    },
  )

  assert.deepEqual(prunedTopicIds, [['legacy-upload-topic']])
  assert.equal(result.preservedTopicCount, getCanonicalTopicIds().length)
  assert.deepEqual(result.preservedTopicIds, getCanonicalTopicIds())
})

test('clearTopicRuntimeState can prune legacy topics without re-running canonical baseline setup', async () => {
  const prisma = createMockPrisma([
    {
      id: 'agent',
      papers: [{ id: 'paper-a' }],
      research_nodes: [{ id: 'node-a' }],
    },
    {
      id: 'legacy-upload-topic',
      papers: [{ id: 'paper-z' }],
      research_nodes: [{ id: 'node-z' }],
    },
  ])
  const prunedTopicIds: string[][] = []

  const result = await clearTopicRuntimeState(
    prisma,
    {
      ensureCanonicalTopics: false,
      pruneLegacyTopics: true,
      clearRuntimeState: true,
    },
    {
      async pruneTopics(topicIds = []) {
        prunedTopicIds.push([...topicIds])
        return [...topicIds]
      },
    },
  )

  assert.deepEqual(prunedTopicIds, [[]])
  assert.deepEqual(result.preservedTopicIds.sort(), ['agent', 'legacy-upload-topic'])
  assert.equal(result.uploadsPreserved, true)
  assert.deepEqual(prisma.calls.topicSessionMemoriesWhere, [{}])
  assert.deepEqual(prisma.calls.topicGuidanceLedgersWhere, [{}])
  assert.deepEqual(prisma.calls.researchPipelineStatesWhere, [{}])
  assert.deepEqual(prisma.calls.researchWorldSnapshotsWhere, [{}])
})
