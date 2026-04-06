import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import {
  classifyTopicGuidanceMessage,
  loadTopicGuidanceLedger,
  recordTopicGuidanceDirective,
  recordTopicGuidanceDirectiveApplication,
} from '../services/topics/topic-guidance-ledger'

test('topic guidance classifier keeps ordinary research questions as asks', () => {
  assert.equal(
    classifyTopicGuidanceMessage('请用两段话概括当前主题最值得先读的节点，并说明原因。'),
    'ask',
  )
  assert.equal(
    classifyTopicGuidanceMessage('现在最值得先读哪个节点，为什么？'),
    'ask',
  )
})

test('topic guidance ledger keeps style directives persistent while recording latest application', async () => {
  const topicId = `guidance-style-${Date.now()}`
  const key = `topic:guidance-ledger:v1:${topicId}`

  try {
    const recorded = await recordTopicGuidanceDirective({
      topicId,
      sourceMessageId: 'msg-style',
      messageKind: 'style',
      instruction: 'Write with tighter structure and less filler.',
      scopeType: 'topic',
      scopeLabel: 'Current topic',
    })

    const applied = await recordTopicGuidanceDirectiveApplication({
      topicId,
      stageIndex: 2,
      summary: 'Stage 2 applied 1 guidance directive.',
      directives: [
        {
          directiveId: recorded.directive.id,
          note: 'Latest cycle tightened the stage narrative and preserved the same factual line.',
        },
      ],
    })

    const latestDirective = applied.ledger.directives.find(
      (directive) => directive.id === recorded.directive.id,
    )

    assert.ok(applied.application)
    assert.equal(applied.application?.stageIndex, 2)
    assert.equal(applied.application?.directives.length, 1)
    assert.equal(applied.ledger.summary.latestAppliedDirectiveCount, 1)
    assert.equal(latestDirective?.status, 'accepted')
    assert.equal(latestDirective?.lastAppliedStageIndex, 2)
    assert.ok(latestDirective?.lastAppliedSummary.includes('tightened the stage narrative'))

    const reloaded = await loadTopicGuidanceLedger(topicId)
    assert.equal(reloaded.latestApplication?.directives[0]?.directiveId, recorded.directive.id)
    assert.equal(reloaded.directives[0]?.status, 'accepted')
  } finally {
    await prisma.systemConfig.deleteMany({
      where: { key },
    })
  }
})

test('topic guidance ledger consumes next-run directives after they are applied', async () => {
  const topicId = `guidance-focus-${Date.now()}`
  const key = `topic:guidance-ledger:v1:${topicId}`

  try {
    const recorded = await recordTopicGuidanceDirective({
      topicId,
      sourceMessageId: 'msg-focus',
      messageKind: 'focus',
      instruction: 'Keep the next cycle centered on the current core node.',
      scopeType: 'topic',
      scopeLabel: 'Current topic',
    })

    const applied = await recordTopicGuidanceDirectiveApplication({
      topicId,
      stageIndex: 1,
      summary: 'Stage 1 applied 1 guidance directive.',
      directives: [
        {
          directiveId: recorded.directive.id,
          note: 'Latest cycle kept the stage centered on the current node before expanding further.',
        },
      ],
    })

    const latestDirective = applied.ledger.directives.find(
      (directive) => directive.id === recorded.directive.id,
    )

    assert.equal(latestDirective?.status, 'consumed')
    assert.equal(applied.application?.directives[0]?.status, 'consumed')
    assert.equal(applied.ledger.summary.latestAppliedDirectiveCount, 1)
  } finally {
    await prisma.systemConfig.deleteMany({
      where: { key },
    })
  }
})
