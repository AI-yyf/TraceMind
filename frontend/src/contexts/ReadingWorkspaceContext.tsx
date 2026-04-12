import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import type { ContextPill } from '@/types/alpha'
import {
  ReadingWorkspaceContext,
  type ReadingTrailEntry,
  type ReadingWorkspaceContextValue,
  type ReadingWorkspaceState,
  type TopicSurfaceState,
  type TopicWorkbenchState,
} from './readingWorkspaceShared'

export type {
  ReadingTrailEntry,
  ReadingWorkspaceContextValue,
  ReadingWorkspaceState,
  TopicSurfaceModePreference,
  TopicSurfaceState,
  TopicWorkbenchState,
  WorkbenchStyle,
} from './readingWorkspaceShared'

const storageKey = 'reading-workspace:v1'

const defaultTopicWorkbenchState = (): TopicWorkbenchState => ({
  open: false,
  activeTab: 'assistant',
  historyOpen: false,
  searchEnabled: true,
  thinkingEnabled: true,
  style: 'balanced',
  contextPills: [],
})

const defaultTopicSurfaceState = (): TopicSurfaceState => ({
  mode: 'graph',
})

function areContextPillsEqual(left: ContextPill[], right: ContextPill[]) {
  if (left === right) return true
  if (left.length !== right.length) return false

  return left.every((pill, index) => {
    const peer = right[index]
    return (
      pill.id === peer.id &&
      pill.kind === peer.kind &&
      pill.label === peer.label &&
      pill.description === peer.description &&
      pill.route === peer.route &&
      pill.anchorId === peer.anchorId
    )
  })
}

function areTopicWorkbenchStatesEqual(left: TopicWorkbenchState, right: TopicWorkbenchState) {
  return (
    left.open === right.open &&
    left.activeTab === right.activeTab &&
    left.historyOpen === right.historyOpen &&
    left.searchEnabled === right.searchEnabled &&
    left.thinkingEnabled === right.thinkingEnabled &&
    left.style === right.style &&
    areContextPillsEqual(left.contextPills, right.contextPills)
  )
}

function areTopicSurfaceStatesEqual(left: TopicSurfaceState, right: TopicSurfaceState) {
  return left.mode === right.mode
}

function parseWorkspaceState(value: string | null): ReadingWorkspaceState {
  if (!value) {
    return {
      trail: [],
      workbenchByTopic: {},
      topicSurfaceByTopic: {},
      pageScroll: {},
    }
  }

  try {
    const parsed = JSON.parse(value) as Partial<ReadingWorkspaceState>
    return {
      trail: Array.isArray(parsed.trail)
        ? parsed.trail.filter(
            (entry): entry is ReadingTrailEntry =>
              Boolean(entry) &&
              typeof entry.id === 'string' &&
              typeof entry.kind === 'string' &&
              typeof entry.title === 'string' &&
              typeof entry.route === 'string',
          )
        : [],
      workbenchByTopic:
        parsed.workbenchByTopic && typeof parsed.workbenchByTopic === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.workbenchByTopic).map(([topicId, rawState]) => {
                const record = rawState as Partial<TopicWorkbenchState> | null | undefined
                return [
                  topicId,
                  {
                    ...defaultTopicWorkbenchState(),
                    ...record,
                    contextPills: Array.isArray(record?.contextPills)
                      ? record.contextPills.filter(
                          (pill): pill is ContextPill =>
                            Boolean(pill) &&
                            typeof pill.id === 'string' &&
                            typeof pill.kind === 'string' &&
                            typeof pill.label === 'string',
                        )
                      : [],
                  },
                ]
              }),
            )
          : {},
      topicSurfaceByTopic:
        parsed.topicSurfaceByTopic && typeof parsed.topicSurfaceByTopic === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.topicSurfaceByTopic).map(([topicId, rawState]) => {
                const record = rawState as Partial<TopicSurfaceState> | null | undefined
                return [
                  topicId,
                  {
                    ...defaultTopicSurfaceState(),
                    ...record,
                    mode: record?.mode === 'dashboard' ? 'dashboard' : 'graph',
                  },
                ]
              }),
            )
          : {},
      pageScroll:
        parsed.pageScroll && typeof parsed.pageScroll === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.pageScroll).filter(
                (entry): entry is [string, number] =>
                  typeof entry[0] === 'string' &&
                  typeof entry[1] === 'number' &&
                  Number.isFinite(entry[1]),
              ),
            )
          : {},
    }
  } catch {
    return {
      trail: [],
      workbenchByTopic: {},
      topicSurfaceByTopic: {},
      pageScroll: {},
    }
  }
}

export function ReadingWorkspaceProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<ReadingWorkspaceState>(() => {
    if (typeof window === 'undefined') {
      return {
        trail: [],
        workbenchByTopic: {},
        topicSurfaceByTopic: {},
        pageScroll: {},
      }
    }

    return parseWorkspaceState(window.sessionStorage.getItem(storageKey))
  })
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(storageKey, JSON.stringify(state))
  }, [state])

  const rememberTrail = useCallback((entry: Omit<ReadingTrailEntry, 'updatedAt'>) => {
    setState((current) => {
      const currentTopEntry = current.trail[0]
      if (
        currentTopEntry?.id === entry.id &&
        currentTopEntry.title === entry.title &&
        currentTopEntry.route === entry.route &&
        currentTopEntry.kind === entry.kind &&
        currentTopEntry.topicId === entry.topicId &&
        currentTopEntry.nodeId === entry.nodeId &&
        currentTopEntry.paperId === entry.paperId
      ) {
        return current
      }

      const nextEntry: ReadingTrailEntry = {
        ...entry,
        updatedAt: new Date().toISOString(),
      }
      const withoutCurrent = current.trail.filter((item) => item.id !== entry.id)

      return {
        ...current,
        trail: [nextEntry, ...withoutCurrent].slice(0, 8),
      }
    })
  }, [])

  const getTopicWorkbenchState = useCallback((topicId: string) => {
    return stateRef.current.workbenchByTopic[topicId] ?? defaultTopicWorkbenchState()
  }, [])

  const patchTopicWorkbenchState = useCallback<
    ReadingWorkspaceContextValue['patchTopicWorkbenchState']
  >((topicId, patch) => {
    setState((current) => {
      const previous = current.workbenchByTopic[topicId] ?? defaultTopicWorkbenchState()
      const next =
        typeof patch === 'function'
          ? patch(previous)
          : {
              ...previous,
              ...patch,
            }

      if (areTopicWorkbenchStatesEqual(previous, next)) {
        return current
      }

      return {
        ...current,
        workbenchByTopic: {
          ...current.workbenchByTopic,
          [topicId]: next,
        },
      }
    })
  }, [])

  const getTopicSurfaceState = useCallback((topicId: string) => {
    return stateRef.current.topicSurfaceByTopic[topicId] ?? defaultTopicSurfaceState()
  }, [])

  const patchTopicSurfaceState = useCallback<
    ReadingWorkspaceContextValue['patchTopicSurfaceState']
  >((topicId, patch) => {
    setState((current) => {
      const previous = current.topicSurfaceByTopic[topicId] ?? defaultTopicSurfaceState()
      const next =
        typeof patch === 'function'
          ? patch(previous)
          : {
              ...previous,
              ...patch,
            }

      if (areTopicSurfaceStatesEqual(previous, next)) {
        return current
      }

      return {
        ...current,
        topicSurfaceByTopic: {
          ...current.topicSurfaceByTopic,
          [topicId]: next,
        },
      }
    })
  }, [])

  const rememberPageScroll = useCallback((key: string, value: number) => {
    setState((current) => {
      if (current.pageScroll[key] === value) {
        return current
      }

      return {
        ...current,
        pageScroll: {
          ...current.pageScroll,
          [key]: value,
        },
      }
    })
  }, [])

  const getPageScroll = useCallback((key: string) => {
    return typeof stateRef.current.pageScroll[key] === 'number'
      ? stateRef.current.pageScroll[key]
      : null
  }, [])

  const value = useMemo<ReadingWorkspaceContextValue>(
    () => ({
      state,
      rememberTrail,
      getTopicWorkbenchState,
      patchTopicWorkbenchState,
      getTopicSurfaceState,
      patchTopicSurfaceState,
      rememberPageScroll,
      getPageScroll,
    }),
    [
      state,
      getPageScroll,
      getTopicSurfaceState,
      getTopicWorkbenchState,
      patchTopicSurfaceState,
      patchTopicWorkbenchState,
      rememberPageScroll,
      rememberTrail,
    ],
  )

  return (
    <ReadingWorkspaceContext.Provider value={value}>
      {children}
    </ReadingWorkspaceContext.Provider>
  )
}
