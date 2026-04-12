import { useEffect } from 'react'
import {
  MODEL_CONFIG_UPDATED_EVENT,
  TOPIC_CONTEXT_ADD_EVENT,
  TOPIC_QUESTION_SEED_EVENT,
  TOPIC_WORKBENCH_OPEN_EVENT,
  consumeQueuedTopicContexts,
} from '@/utils/workbench-events'
import {
  fetchModelCapabilitySummary,
  invalidateModelCapabilitySummary,
} from '@/utils/omniRuntimeCache'
import type { ContextPill, ModelCapabilitySummary, TopicWorkbenchTab } from '@/types/alpha'

export interface UseWorkbenchEventsOptions {
  topicId: string
  open: boolean
  setOpen: (value: boolean | ((current: boolean) => boolean)) => void
  setActiveTab: (tab: TopicWorkbenchTab | ((current: TopicWorkbenchTab) => TopicWorkbenchTab)) => void
  setContextPills: (pills: ContextPill[] | ((current: ContextPill[]) => ContextPill[])) => void
  setQuestion: (question: string | ((current: string) => string)) => void
  setHistoryOpen: (value: boolean | ((current: boolean) => boolean)) => void
  setModelStatus: (status: ModelCapabilitySummary | null) => void
  isDesktopViewport: boolean
}

export interface UseWorkbenchEventsResult {
  // No return values - this hook only sets up event listeners
}

export function useWorkbenchEvents(options: UseWorkbenchEventsOptions): void {
  const {
    topicId,
    open,
    setOpen,
    setActiveTab,
    setContextPills,
    setQuestion,
    setHistoryOpen,
    setModelStatus,
    isDesktopViewport,
  } = options

  // Model config updated event
  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const response = await fetchModelCapabilitySummary()
        if (alive) setModelStatus(response)
      } catch {
        if (alive) setModelStatus(null)
      }
    }

    void load()

    const onUpdate = () => {
      invalidateModelCapabilitySummary()
      void fetchModelCapabilitySummary({ force: true })
        .then((response) => {
          if (alive) setModelStatus(response)
        })
        .catch(() => {
          if (alive) setModelStatus(null)
        })
    }
    window.addEventListener(MODEL_CONFIG_UPDATED_EVENT, onUpdate)

    return () => {
      alive = false
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, onUpdate)
    }
  }, [setModelStatus])

  // Consume queued topic contexts
  useEffect(() => {
    const queued = consumeQueuedTopicContexts(topicId)
    if (queued.length === 0) return

    setOpen(true)
    setActiveTab('assistant')
    setContextPills((current) => {
      const seen = new Set(current.map((item) => item.id))
      const next = [...current]

      queued.forEach((entry) => {
        if (seen.has(entry.pill.id)) return
        seen.add(entry.pill.id)
        next.unshift(entry.pill)
      })

      return next
    })

    const seededQuestion = queued.map((entry) => entry.question).find(Boolean)
    if (seededQuestion) {
      setQuestion((current) => current.trim() || seededQuestion || '')
    }
  }, [topicId, setOpen, setActiveTab, setContextPills, setQuestion])

  // TOPIC_CONTEXT_ADD_EVENT
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ContextPill>
      if (!customEvent.detail) return
      setOpen(true)
      setContextPills((current) =>
        current.some((item) => item.id === customEvent.detail.id)
          ? current
          : [customEvent.detail, ...current],
      )
    }

    window.addEventListener(TOPIC_CONTEXT_ADD_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(TOPIC_CONTEXT_ADD_EVENT, handler as EventListener)
  }, [setOpen, setContextPills])

  // TOPIC_QUESTION_SEED_EVENT
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      if (!customEvent.detail) return
      setOpen(true)
      setActiveTab('assistant')
      setQuestion((current) => current.trim() || customEvent.detail)
    }

    window.addEventListener(TOPIC_QUESTION_SEED_EVENT, handler as EventListener)
    return () =>
      window.removeEventListener(TOPIC_QUESTION_SEED_EVENT, handler as EventListener)
  }, [setOpen, setActiveTab, setQuestion])

  // TOPIC_WORKBENCH_OPEN_EVENT
  useEffect(() => {
    const openWorkbench = () => {
      setOpen(true)
      setActiveTab('assistant')
    }

    window.addEventListener(TOPIC_WORKBENCH_OPEN_EVENT, openWorkbench)
    return () =>
      window.removeEventListener(TOPIC_WORKBENCH_OPEN_EVENT, openWorkbench)
  }, [setOpen, setActiveTab])

  // Keyboard events (Escape)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setHistoryOpen(false)
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setHistoryOpen, setOpen])

  // Sync viewport on resize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // This effect should be handled by the parent component
    // that manages isDesktopViewport state
  }, [isDesktopViewport])

  // Close history when workbench closes
  useEffect(() => {
    if (!open) {
      setHistoryOpen(false)
    }
  }, [open, setHistoryOpen])
}