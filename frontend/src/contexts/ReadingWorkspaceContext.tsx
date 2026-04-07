import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'

import type { ContextPill, TopicWorkbenchTab } from '@/types/alpha'

type WorkbenchStyle = 'brief' | 'balanced' | 'deep'

type ReadingTrailEntry = {
  id: string
  kind: 'topic' | 'node' | 'paper'
  topicId?: string
  nodeId?: string
  paperId?: string
  title: string
  route: string
  updatedAt: string
}

type TopicWorkbenchState = {
  open: boolean
  activeTab: TopicWorkbenchTab
  historyOpen: boolean
  searchEnabled: boolean
  thinkingEnabled: boolean
  style: WorkbenchStyle
  contextPills: ContextPill[]
}

type ReadingWorkspaceState = {
  trail: ReadingTrailEntry[]
  workbenchByTopic: Record<string, TopicWorkbenchState>
  pageScroll: Record<string, number>
}

type ReadingWorkspaceContextValue = {
  state: ReadingWorkspaceState
  rememberTrail: (entry: Omit<ReadingTrailEntry, 'updatedAt'>) => void
  getTopicWorkbenchState: (topicId: string) => TopicWorkbenchState
  patchTopicWorkbenchState: (
    topicId: string,
    patch:
      | Partial<TopicWorkbenchState>
      | ((current: TopicWorkbenchState) => TopicWorkbenchState),
  ) => void
  rememberPageScroll: (key: string, value: number) => void
  getPageScroll: (key: string) => number | null
}

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

const ReadingWorkspaceContext = createContext<ReadingWorkspaceContextValue | null>(null)

function parseWorkspaceState(value: string | null): ReadingWorkspaceState {
  if (!value) {
    return {
      trail: [],
      workbenchByTopic: {},
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
        pageScroll: {},
      }
    }

    return parseWorkspaceState(window.sessionStorage.getItem(storageKey))
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(storageKey, JSON.stringify(state))
  }, [state])

  const value = useMemo<ReadingWorkspaceContextValue>(
    () => ({
      state,
      rememberTrail(entry) {
        setState((current) => {
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
      },
      getTopicWorkbenchState(topicId) {
        return state.workbenchByTopic[topicId] ?? defaultTopicWorkbenchState()
      },
      patchTopicWorkbenchState(topicId, patch) {
        setState((current) => {
          const previous = current.workbenchByTopic[topicId] ?? defaultTopicWorkbenchState()
          const next =
            typeof patch === 'function'
              ? patch(previous)
              : {
                  ...previous,
                  ...patch,
                }

          return {
            ...current,
            workbenchByTopic: {
              ...current.workbenchByTopic,
              [topicId]: next,
            },
          }
        })
      },
      rememberPageScroll(key, value) {
        setState((current) => ({
          ...current,
          pageScroll: {
            ...current.pageScroll,
            [key]: value,
          },
        }))
      },
      getPageScroll(key) {
        return typeof state.pageScroll[key] === 'number' ? state.pageScroll[key] : null
      },
    }),
    [state],
  )

  return (
    <ReadingWorkspaceContext.Provider value={value}>
      {children}
    </ReadingWorkspaceContext.Provider>
  )
}

export function useReadingWorkspace() {
  const context = useContext(ReadingWorkspaceContext)
  if (!context) {
    throw new Error('useReadingWorkspace must be used within ReadingWorkspaceProvider')
  }
  return context
}

export function usePageScrollRestoration(
  pageKey: string,
  options?: {
    enabled?: boolean
    skipInitialRestore?: boolean
  },
) {
  const { rememberPageScroll, getPageScroll } = useReadingWorkspace()
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return

    if (!options?.skipInitialRestore) {
      const saved = getPageScroll(pageKey)
      if (typeof saved === 'number' && saved > 0) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: saved, behavior: 'auto' })
        })
      }
    }

    const onScroll = () => rememberPageScroll(pageKey, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      rememberPageScroll(pageKey, window.scrollY)
      window.removeEventListener('scroll', onScroll)
    }
  }, [enabled, getPageScroll, options?.skipInitialRestore, pageKey, rememberPageScroll])
}
