import assert from 'node:assert/strict'
import test from 'node:test'

test('normalizeChatAnswerText salvages the final answer from reasoning-heavy compatible responses', async () => {
  const imported = await import('../services/topics/alpha-topic.js')
  const root =
    ((imported as { default?: unknown }).default as { default?: unknown; __testing?: unknown } | undefined) ??
    (imported as unknown as { default?: unknown; __testing?: unknown })
  const alphaTopicModule = (
    root.__testing ? root : (root.default as { __testing: unknown } | undefined)
  ) as {
    __testing: {
      normalizeChatAnswerText: (value: string) => string
    }
  }
  const raw = `用户要求基于提供的上下文（authorContext、selectedEvidence、outputContract）来回答。

分析：
- 问题：请用两句话概括当前主题的主线判断，并点出一个最值得先读的节点。

检查：
- 是否直接回答：是。

两句话：
自动驾驶世界模型的研究主线正处于从模块化架构向端到端统一范式跃迁的关键阶段。
在这一演进链条中，node-2「世界模型的引入」构成了最值得先读的关键枢纽。`

  const normalized = alphaTopicModule.__testing.normalizeChatAnswerText(raw)

  assert.equal(
    normalized,
    `自动驾驶世界模型的研究主线正处于从模块化架构向端到端统一范式跃迁的关键阶段。
在这一演进链条中，node-2「世界模型的引入」构成了最值得先读的关键枢纽。`,
  )
})
