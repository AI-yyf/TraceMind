// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import type { ContextPill } from '@/types/alpha'
import { APP_STATE_STORAGE_KEYS } from './appStateStorage'
import { consumeQueuedTopicContexts, queueTopicContext } from './workbench-events'

function makePill(id: string, label: string): ContextPill {
  return {
    id,
    kind: 'node',
    label,
    route: `/node/${id}`,
  }
}

describe('workbench-events', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('deduplicates queued topic context entries while keeping the newest payload first', () => {
    queueTopicContext({
      topicId: 'topic-1',
      pill: makePill('node-1', 'Original'),
      question: 'What changed?',
    })

    queueTopicContext({
      topicId: 'topic-1',
      pill: makePill('node-1', 'Updated'),
      question: 'What changed?',
    })

    queueTopicContext({
      topicId: 'topic-1',
      pill: makePill('node-2', 'Second node'),
      question: 'What changed?',
    })

    const stored = JSON.parse(
      sessionStorage.getItem(APP_STATE_STORAGE_KEYS.topicContextQueue) ?? '[]',
    ) as Array<{ topicId: string; pill: ContextPill; question?: string }>

    expect(stored).toHaveLength(2)
    expect(stored[0]).toMatchObject({
      topicId: 'topic-1',
      pill: { id: 'node-2', label: 'Second node' },
      question: 'What changed?',
    })
    expect(stored[1]).toMatchObject({
      topicId: 'topic-1',
      pill: { id: 'node-1', label: 'Updated' },
      question: 'What changed?',
    })
  })

  it('consumes only the requested topic queue and leaves other topic entries intact', () => {
    queueTopicContext({
      topicId: 'topic-1',
      pill: makePill('node-1', 'Node 1'),
      question: 'Summarize this node',
    })
    queueTopicContext({
      topicId: 'topic-2',
      pill: makePill('node-2', 'Node 2'),
      question: 'Summarize this node',
    })
    queueTopicContext({
      topicId: 'topic-1',
      pill: makePill('node-3', 'Node 3'),
      question: 'Compare with prior work',
    })

    const consumed = consumeQueuedTopicContexts('topic-1')

    expect(consumed).toHaveLength(2)
    expect(consumed.map((entry) => entry.pill.id)).toEqual(['node-3', 'node-1'])

    const remaining = JSON.parse(
      sessionStorage.getItem(APP_STATE_STORAGE_KEYS.topicContextQueue) ?? '[]',
    ) as Array<{ topicId: string; pill: ContextPill; question?: string }>

    expect(remaining).toEqual([
      expect.objectContaining({
        topicId: 'topic-2',
        pill: expect.objectContaining({ id: 'node-2' }),
      }),
    ])
  })
})
