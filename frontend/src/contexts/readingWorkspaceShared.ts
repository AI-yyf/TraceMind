import { createContext } from 'react'

import type { ContextPill, TopicWorkbenchTab } from '@/types/alpha'

export type WorkbenchStyle = 'brief' | 'balanced' | 'deep'
export type TopicSurfaceModePreference = 'graph' | 'dashboard'

export type ReadingTrailEntry = {
  id: string
  kind: 'topic' | 'node' | 'paper'
  topicId?: string
  nodeId?: string
  paperId?: string
  title: string
  route: string
  updatedAt: string
}

export type TopicWorkbenchState = {
  open: boolean
  activeTab: TopicWorkbenchTab
  historyOpen: boolean
  searchEnabled: boolean
  thinkingEnabled: boolean
  style: WorkbenchStyle
  contextPills: ContextPill[]
}

export type TopicSurfaceState = {
  mode: TopicSurfaceModePreference
}

export type ReadingWorkspaceState = {
  trail: ReadingTrailEntry[]
  workbenchByTopic: Record<string, TopicWorkbenchState>
  topicSurfaceByTopic: Record<string, TopicSurfaceState>
  pageScroll: Record<string, number>
}

export type ReadingWorkspaceContextValue = {
  state: ReadingWorkspaceState
  rememberTrail: (entry: Omit<ReadingTrailEntry, 'updatedAt'>) => void
  getTopicWorkbenchState: (topicId: string) => TopicWorkbenchState
  patchTopicWorkbenchState: (
    topicId: string,
    patch:
      | Partial<TopicWorkbenchState>
      | ((current: TopicWorkbenchState) => TopicWorkbenchState),
  ) => void
  getTopicSurfaceState: (topicId: string) => TopicSurfaceState
  patchTopicSurfaceState: (
    topicId: string,
    patch:
      | Partial<TopicSurfaceState>
      | ((current: TopicSurfaceState) => TopicSurfaceState),
  ) => void
  rememberPageScroll: (key: string, value: number) => void
  getPageScroll: (key: string) => number | null
}

export const ReadingWorkspaceContext = createContext<ReadingWorkspaceContextValue | null>(null)
