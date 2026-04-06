import type { ContextPill } from '@/types/alpha'

export const MODEL_CONFIG_UPDATED_EVENT = 'model-config-updated'
export const PROMPT_STUDIO_UPDATED_EVENT = 'prompt-studio-updated'
export const TOPIC_CONTEXT_ADD_EVENT = 'topic-context-add'
export const TOPIC_QUESTION_SEED_EVENT = 'topic-question-seed'
export const TOPIC_WORKBENCH_OPEN_EVENT = 'topic-workbench-open'
export const TOPIC_EDIT_EVENT = 'topic-edit-request'
export const TOPIC_EXPORT_EVENT = 'topic-export-request'
export const TOPIC_REBUILD_EVENT = 'topic-rebuild-request'
export const QUEUED_TOPIC_CONTEXT_KEY = 'topic-context-queue'

export type QueuedTopicContext = {
  topicId: string
  pill: ContextPill
  question?: string
}

function readQueuedTopicContexts() {
  if (typeof window === 'undefined') return [] as QueuedTopicContext[]

  try {
    const raw = window.sessionStorage.getItem(QUEUED_TOPIC_CONTEXT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueuedTopicContext[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueuedTopicContexts(entries: QueuedTopicContext[]) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(QUEUED_TOPIC_CONTEXT_KEY, JSON.stringify(entries))
}

export function queueTopicContext(entry: QueuedTopicContext) {
  const current = readQueuedTopicContexts()
  const next = [
    entry,
    ...current.filter(
      (item) =>
        item.topicId !== entry.topicId ||
        item.pill.id !== entry.pill.id ||
        item.question !== entry.question,
    ),
  ]
  writeQueuedTopicContexts(next)
}

export function consumeQueuedTopicContexts(topicId: string) {
  const current = readQueuedTopicContexts()
  const matched = current.filter((item) => item.topicId === topicId)
  if (matched.length > 0) {
    writeQueuedTopicContexts(current.filter((item) => item.topicId !== topicId))
  }
  return matched
}
