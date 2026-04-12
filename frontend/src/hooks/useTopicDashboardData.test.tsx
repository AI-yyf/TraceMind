// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from '@/utils/api'
import { useTopicDashboardData } from './useTopicDashboardData'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
  }
})

const apiGetMock = vi.mocked(apiGet)

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

  it('moves from loading to ready when an async dashboard request resolves', async () => {
    let resolveRequest: ((value: { topicId: string; topicTitle: string }) => void) | undefined
    apiGetMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        }) as ReturnType<typeof apiGet>,
    )

    render(<DashboardHookHarness topicId="topic-1" />)

    expect(screen.getByTestId('status')).toHaveTextContent('loading')

    resolveRequest?.({
      topicId: 'topic-1',
      topicTitle: 'Research Landscape',
    })

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('ready')
    })
    expect(screen.getByTestId('title')).toHaveTextContent('Research Landscape')
    expect(apiGetMock).toHaveBeenCalledWith('/api/topics/topic-1/dashboard?stageMonths=1')
  })
})
