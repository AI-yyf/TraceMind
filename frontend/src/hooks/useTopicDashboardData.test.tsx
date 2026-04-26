// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from '@/utils/api'
import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { useTopicDashboardData } from './useTopicDashboardData'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
  }
})

const apiGetMock = vi.mocked(apiGet)

function createDashboardFixture(): TopicDashboardData {
  return {
    topicId: 'topic-1',
    topicTitle: 'Research Landscape',
    researchThreads: [
      {
        stageIndex: 1,
        nodeId: 'node-1',
        nodeTitle: 'Retriever-first systems',
        thesis: 'Retriever-centric systems stabilized the first mainline.',
        paperCount: 3,
        keyPaperTitle: 'Retriever Systems',
        isMilestone: true,
      },
    ],
    methodEvolution: [
      {
        year: 2024,
        methodName: 'Graph-grounded retrieval',
        paperId: 'paper-1',
        paperTitle: 'Graph-grounded retrieval',
        contribution: 'Introduced graph evidence routing.',
        impact: 'high',
      },
    ],
    activeAuthors: [
      {
        name: 'Alice Chen',
        affiliation: 'Example Lab',
        paperCount: 2,
        citationCount: 15,
        keyPapers: ['paper-1'],
        researchFocus: ['retrieval', 'grounding'],
      },
    ],
    stats: {
      totalPapers: 6,
      mappedPapers: 5,
      pendingPapers: 1,
      totalNodes: 4,
      totalStages: 3,
      mappedStages: 3,
      timeSpanYears: 2,
      avgPapersPerNode: 1.5,
      citationCoverage: 0.75,
    },
    keyInsights: ['Grounding quality improved after graph routing was introduced.'],
    trends: {
      emergingTopics: ['multimodal grounding'],
      decliningTopics: [],
      methodShifts: ['from isolated retrieval to graph-guided reasoning'],
    },
    pendingPapers: [
      {
        paperId: 'paper-2',
        title: 'Pending anchor paper',
        publishedAt: '2025-01-01T00:00:00.000Z',
        stageIndex: null,
        stageLabel: '',
        summary: '',
        route: '/topic/topic-1?anchor=paper%3Apaper-2',
      },
    ],
  }
}

function DashboardHookHarness({
  topicId,
  enabled = true,
  stageWindowMonths = 1,
}: {
  topicId: string
  enabled?: boolean
  stageWindowMonths?: number
}) {
  const { state } = useTopicDashboardData(
    topicId,
    enabled,
    'Dashboard unavailable',
    stageWindowMonths,
  )

  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="title">{state.status === 'ready' ? state.data.topicTitle : ''}</div>
      <div data-testid="error">{state.status === 'error' ? state.error : ''}</div>
    </div>
  )
}

describe('useTopicDashboardData', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('moves from loading to ready when an async dashboard request resolves with a valid contract', async () => {
    let resolveRequest: ((value: TopicDashboardData) => void) | undefined
    apiGetMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }) as ReturnType<typeof apiGet>,
    )

    render(<DashboardHookHarness topicId="topic-1" />)

    expect(screen.getByTestId('status')).toHaveTextContent('loading')

    resolveRequest?.(createDashboardFixture())

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('title')).toHaveTextContent('Research Landscape')
    expect(apiGetMock).toHaveBeenCalledWith('/api/topics/topic-1/dashboard?stageMonths=1')
  })

  it('fails explicitly when the backend dashboard payload drifts away from the contract', async () => {
    apiGetMock.mockResolvedValue({ topicId: 'topic-1', topicTitle: 'Broken payload' } as unknown)

    render(<DashboardHookHarness topicId="topic-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('error')
    })
    expect(screen.getByTestId('error')).toHaveTextContent(
      'Topic dashboard is missing "researchThreads".',
    )
  })

  it('does not issue a request when the hook is disabled', () => {
    render(<DashboardHookHarness topicId="topic-1" enabled={false} />)

    expect(screen.getByTestId('status')).toHaveTextContent('idle')
    expect(apiGetMock).not.toHaveBeenCalled()
  })
})