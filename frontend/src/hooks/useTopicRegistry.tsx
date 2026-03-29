import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { catalogTopicMap, paperMap, topicMap } from '@/data/tracker'
import type {
  ActiveTopicEntry,
  ArchivedTopicEntry,
  CatalogTopic,
  SearchItem,
  TopicId,
  TopicPreferenceOverrides,
  TrackerTopic,
} from '@/types/tracker'

const DEFAULT_TOPIC_ORDER: TopicId[] = [
  'autonomous-driving',
  'transformer-innovation',
  'bio-inspired-ml',
  'embodied-vla',
  'agent',
]

type TopicRegistryState = {
  active: ActiveTopicEntry[]
  archived: ArchivedTopicEntry[]
}

interface TopicRegistryContextValue {
  activeTopics: TrackerTopic[]
  archivedTopics: TrackerTopic[]
  allTopicMap: Record<TopicId, TrackerTopic>
  catalogMap: Record<TopicId, CatalogTopic>
  activeEntries: ActiveTopicEntry[]
  archivedEntries: ArchivedTopicEntry[]
  archiveTopic: (topicId: TopicId) => void
  restoreTopic: (topicId: TopicId) => void
  moveTopic: (topicId: TopicId, direction: 'up' | 'down') => void
  updateTopicPreferences: (topicId: TopicId, preferences: TopicPreferenceOverrides) => void
  resetTopicPreferences: (topicId: TopicId) => void
  getEffectivePreferences: (topicId: TopicId) => TopicPreferenceOverrides
  searchItems: SearchItem[]
}

const TopicRegistryContext = createContext<TopicRegistryContextValue | null>(null)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeTopicPreferences(value: unknown): TopicPreferenceOverrides | undefined {
  if (!isRecord(value)) return undefined

  const next: TopicPreferenceOverrides = {}

  if (Array.isArray(value.problemPreference)) {
    next.problemPreference = value.problemPreference.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
  }

  if (Array.isArray(value.queryTags)) {
    next.queryTags = value.queryTags.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
  }

  if (typeof value.maxPaperIntervalDays === 'number' && Number.isFinite(value.maxPaperIntervalDays)) {
    next.maxPaperIntervalDays = Math.max(1, Math.trunc(value.maxPaperIntervalDays))
  }

  if (typeof value.nameZh === 'string' && value.nameZh.trim().length > 0) {
    next.nameZh = value.nameZh.trim()
  }

  if (typeof value.focusLabel === 'string' && value.focusLabel.trim().length > 0) {
    next.focusLabel = value.focusLabel.trim()
  }

  if (typeof value.originQuestionDefinition === 'string' && value.originQuestionDefinition.trim().length > 0) {
    next.originQuestionDefinition = value.originQuestionDefinition.trim()
  }

  return Object.keys(next).length > 0 ? next : undefined
}

function sanitizeRegistryEntries(
  value: unknown,
  status: 'active' | 'archived',
): Array<ActiveTopicEntry | ArchivedTopicEntry> {
  if (!Array.isArray(value)) return []

  const now = new Date().toISOString()
  const knownTopicIds = new Set(Object.keys(topicMap) as TopicId[])
  const seen = new Set<string>()
  const sanitized: Array<ActiveTopicEntry | ArchivedTopicEntry> = []

  value.forEach((entry, index) => {
    if (!isRecord(entry)) return

    const topicId = typeof entry.topicId === 'string' ? (entry.topicId as TopicId) : null
    if (!topicId || !knownTopicIds.has(topicId) || seen.has(topicId)) return
    seen.add(topicId)

    const displayOrder =
      typeof entry.displayOrder === 'number' && Number.isFinite(entry.displayOrder)
        ? Math.max(0, Math.trunc(entry.displayOrder))
        : index
    const activatedAt =
      typeof entry.activatedAt === 'string' && entry.activatedAt.trim().length > 0
        ? entry.activatedAt
        : now
    const preferences = sanitizeTopicPreferences(entry.preferences)

    if (status === 'archived') {
      sanitized.push({
        topicId,
        status: 'archived',
        displayOrder,
        activatedAt,
        archivedAt:
          typeof entry.archivedAt === 'string' && entry.archivedAt.trim().length > 0
            ? entry.archivedAt
            : now,
        preferences,
      })
      return
    }

    sanitized.push({
      topicId,
      status: 'active',
      displayOrder,
      activatedAt,
      archivedAt: null,
      preferences,
    })
  })

  return sanitized
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((entry, index) => ({ ...entry, displayOrder: index }))
}

function getDefaultActiveTopics(): ActiveTopicEntry[] {
  const now = new Date().toISOString()
  return DEFAULT_TOPIC_ORDER
    .filter((topicId) => Boolean(topicMap[topicId]))
    .map((topicId, index) => ({
      topicId,
      status: 'active' as const,
      displayOrder: index,
      activatedAt: now,
    }))
}

function normalizeRegistryState(value: unknown): TopicRegistryState {
  const parsed = isRecord(value) ? value : {}
  const active = sanitizeRegistryEntries(parsed.active, 'active') as ActiveTopicEntry[]
  const activeIds = new Set(active.map((entry) => entry.topicId))
  const archived = (sanitizeRegistryEntries(parsed.archived, 'archived') as ArchivedTopicEntry[]).filter(
    (entry) => !activeIds.has(entry.topicId),
  )

  if (active.length === 0 && archived.length === 0) {
    return {
      active: getDefaultActiveTopics(),
      archived: [],
    }
  }

  return { active, archived }
}

function readTopicRegistryFromStorage(): TopicRegistryState {
  if (typeof window === 'undefined') {
    return {
      active: getDefaultActiveTopics(),
      archived: [],
    }
  }

  try {
    const raw = window.localStorage.getItem('topic-registry')
    if (!raw) {
      return {
        active: getDefaultActiveTopics(),
        archived: [],
      }
    }

    return normalizeRegistryState(JSON.parse(raw))
  } catch {
    return {
      active: getDefaultActiveTopics(),
      archived: [],
    }
  }
}

function writeTopicRegistryToStorage(registry: TopicRegistryState) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem('topic-registry', JSON.stringify(normalizeRegistryState(registry)))
  } catch {
    // ignore storage failures
  }
}

function buildSearchItems(): SearchItem[] {
  const items: SearchItem[] = []

  Object.values(topicMap).forEach((topic) => {
    items.push({
      id: `topic-${topic.id}`,
      kind: 'topic',
      title: topic.nameZh,
      subtitle: topic.focusLabel,
      href: `/topic/${topic.id}`,
      year: topic.originPaper.published.slice(0, 4),
      tags: topic.catalog.problemPreference.slice(0, 5),
    })
  })

  Object.values(paperMap).forEach((paper) => {
    items.push({
      id: `paper-${paper.id}`,
      kind: 'paper',
      title: paper.titleZh || paper.title,
      subtitle: `${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' 等' : ''}`,
      href: `/paper/${paper.id}`,
      year: paper.published.slice(0, 4),
      tags: paper.tags.slice(0, 5),
    })
  })

  return items
}

export function TopicRegistryProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<TopicRegistryState>(() => {
    const initial = readTopicRegistryFromStorage()
    writeTopicRegistryToStorage(initial)
    return initial
  })

  const updateRegistry = useCallback(
    (updater: (prev: TopicRegistryState) => TopicRegistryState) => {
      setRegistry((prev) => {
        const next = normalizeRegistryState(updater(prev))
        writeTopicRegistryToStorage(next)
        return next
      })
    },
    [],
  )

  const activeTopics = useMemo(() => {
    return [...registry.active]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((entry) => topicMap[entry.topicId])
      .filter((topic): topic is TrackerTopic => Boolean(topic))
  }, [registry.active])

  const archivedTopics = useMemo(() => {
    return [...registry.archived]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((entry) => topicMap[entry.topicId])
      .filter((topic): topic is TrackerTopic => Boolean(topic))
  }, [registry.archived])

  const allTopicMap = useMemo(() => topicMap, [])
  const catalogMap = useMemo(() => catalogTopicMap, [])

  const archiveTopic = useCallback(
    (topicId: TopicId) => {
      updateRegistry((prev) => {
        const entry = prev.active.find((item) => item.topicId === topicId)
        if (!entry) return prev

        return {
          active: prev.active.filter((item) => item.topicId !== topicId),
          archived: [
            ...prev.archived,
            {
              ...entry,
              status: 'archived',
              archivedAt: new Date().toISOString(),
            },
          ],
        }
      })
    },
    [updateRegistry],
  )

  const restoreTopic = useCallback(
    (topicId: TopicId) => {
      updateRegistry((prev) => {
        const entry = prev.archived.find((item) => item.topicId === topicId)
        if (!entry) return prev

        const maxOrder = Math.max(-1, ...prev.active.map((item) => item.displayOrder))
        return {
          active: [
            ...prev.active,
            {
              ...entry,
              status: 'active',
              displayOrder: maxOrder + 1,
              activatedAt: new Date().toISOString(),
              archivedAt: null,
            },
          ],
          archived: prev.archived.filter((item) => item.topicId !== topicId),
        }
      })
    },
    [updateRegistry],
  )

  const moveTopic = useCallback(
    (topicId: TopicId, direction: 'up' | 'down') => {
      updateRegistry((prev) => {
        const currentIndex = prev.active.findIndex((item) => item.topicId === topicId)
        if (currentIndex < 0) return prev

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
        if (targetIndex < 0 || targetIndex >= prev.active.length) return prev

        const nextActive = [...prev.active]
        const current = nextActive[currentIndex]
        nextActive[currentIndex] = nextActive[targetIndex]
        nextActive[targetIndex] = current

        return {
          ...prev,
          active: nextActive.map((item, index) => ({
            ...item,
            displayOrder: index,
          })),
        }
      })
    },
    [updateRegistry],
  )

  const updateTopicPreferences = useCallback(
    (topicId: TopicId, preferences: TopicPreferenceOverrides) => {
      updateRegistry((prev) => ({
        ...prev,
        active: prev.active.map((entry) =>
          entry.topicId === topicId
            ? {
                ...entry,
                preferences: sanitizeTopicPreferences(preferences) ?? undefined,
              }
            : entry,
        ),
      }))
    },
    [updateRegistry],
  )

  const resetTopicPreferences = useCallback(
    (topicId: TopicId) => {
      updateRegistry((prev) => ({
        ...prev,
        active: prev.active.map((entry) =>
          entry.topicId === topicId
            ? {
                ...entry,
                preferences: undefined,
              }
            : entry,
        ),
      }))
    },
    [updateRegistry],
  )

  const getEffectivePreferences = useCallback(
    (topicId: TopicId): TopicPreferenceOverrides => {
      const catalog = catalogTopicMap[topicId]
      const entry = registry.active.find((item) => item.topicId === topicId)
      const overrides = entry?.preferences ?? {}

      return {
        nameZh: overrides.nameZh ?? catalog?.nameZh,
        focusLabel: overrides.focusLabel ?? catalog?.focusLabel,
        originQuestionDefinition: overrides.originQuestionDefinition ?? catalog?.originQuestionDefinition,
        problemPreference: overrides.problemPreference ?? catalog?.problemPreference,
        queryTags: overrides.queryTags ?? catalog?.queryTags,
        maxPaperIntervalDays: overrides.maxPaperIntervalDays ?? 61,
      }
    },
    [registry.active],
  )

  const searchItems = useMemo(() => buildSearchItems(), [])

  const value: TopicRegistryContextValue = {
    activeTopics,
    archivedTopics,
    allTopicMap,
    catalogMap,
    activeEntries: registry.active,
    archivedEntries: registry.archived,
    archiveTopic,
    restoreTopic,
    moveTopic,
    updateTopicPreferences,
    resetTopicPreferences,
    getEffectivePreferences,
    searchItems,
  }

  return <TopicRegistryContext.Provider value={value}>{children}</TopicRegistryContext.Provider>
}

export function useTopicRegistry() {
  const context = useContext(TopicRegistryContext)
  if (!context) {
    throw new Error('useTopicRegistry must be used within TopicRegistryProvider')
  }
  return context
}
