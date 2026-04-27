import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import {
  filterVisibleTopics,
  isSyntheticTopic,
  purgeSyntheticTopics,
} from '../services/topics/topic-visibility'

test('topic visibility flags synthetic regression and route-test topics', () => {
  assert.equal(
    isSyntheticTopic({
      id: 'prompt-templates-route-123-topic',
      nameEn: 'External Agent Route Test Topic',
    }),
    true,
  )

  assert.equal(
    isSyntheticTopic({
      id: 'custom-research-topic',
      nameEn: 'Graph-based Mechanistic Interpretability',
      summary: 'A real user-facing topic about circuit discovery.',
    }),
    false,
  )

  const filtered = filterVisibleTopics([
    { id: 'topic-alpha-route-999-topic', nameEn: 'Autonomous Driving World Models' },
    { id: 'agent', nameEn: 'Agent Systems' },
  ])

  assert.deepEqual(filtered.map((topic) => topic.id), ['agent'])
})

test('topic visibility purge removes synthetic topics from the active database', async () => {
  const syntheticTopicId = `prompt-templates-route-${Date.now()}-topic`
  const realTopicId = `real-topic-${Date.now()}`

  await prisma.topics.createMany({
    data: [
      {
        id: syntheticTopicId,
        nameZh: '外部代理测试主题',
        nameEn: 'External Agent Route Test Topic',
        language: 'zh',
        status: 'active',
        updatedAt: new Date(),
      },
      {
        id: realTopicId,
        nameZh: '真实主题',
        nameEn: 'Real Topic',
        language: 'zh',
        status: 'active',
        updatedAt: new Date(),
      },
    ],
  })

  try {
    const result = await purgeSyntheticTopics()
    assert.ok(result.topicIds.includes(syntheticTopicId))

    const [syntheticTopic, realTopic] = await Promise.all([
      prisma.topics.findUnique({ where: { id: syntheticTopicId } }),
      prisma.topics.findUnique({ where: { id: realTopicId } }),
    ])

    assert.equal(syntheticTopic, null)
    assert.ok(realTopic)
  } finally {
    await prisma.topics.deleteMany({
      where: {
        id: {
          in: [syntheticTopicId, realTopicId],
        },
      },
    })
  }
})
