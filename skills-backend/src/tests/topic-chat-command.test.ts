import assert from 'node:assert/strict'
import test from 'node:test'

import { parseTopicChatCommand } from '../services/topics/topic-chat-command'

test('topic chat command parser ignores guidance-style duration suggestions', () => {
  assert.equal(
    parseTopicChatCommand('接下来一小时先围绕当前主线节点继续研究，不要继续扩题。'),
    null,
  )
})

test('topic chat command parser still accepts explicit start requests', () => {
  assert.deepEqual(parseTopicChatCommand('请开始研究 2 小时'), {
    action: 'start-research',
    durationHours: 2,
  })
})
