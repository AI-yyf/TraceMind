// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { SearchResponse } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { SearchPanel } from './SearchPanel'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
  }
})

vi.mock('@/hooks/useProductCopy', () => ({
  useProductCopy: () => ({
    copy: (_id: string, fallback: string) => fallback,
  }),
}))

const apiGetMock = vi.mocked(apiGet)

function renderWithI18n(node: ReactNode) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(<I18nProvider>{node}</I18nProvider>)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeSearchResponse(stageLabels: string[]): SearchResponse {
  return {
    query: 'retrieval',
    scope: 'topic',
    totals: {
      all: 1,
      topic: 0,
      node: 1,
      paper: 0,
      evidence: 0,
    },
    groups: [
      {
        group: 'node',
        label: '节点',
        items: [
          {
            id: 'node-1',
            kind: 'node',
            title: 'Retrieval node',
            subtitle: 'Node summary',
            excerpt: 'Node excerpt',
            route: '/node/node-1',
            topicId: 'topic-1',
            topicTitle: 'Topic title',
            tags: ['retrieval'],
            matchedFields: ['title'],
            stageLabel: stageLabels[0],
            timeLabel: '04.05',
            relatedNodes: stageLabels.map((stageLabel, index) => ({
              nodeId: `node-${index + 1}`,
              title: `Node ${index + 1}`,
              stageIndex: index + 1,
              stageLabel,
              route: `/node/node-${index + 1}`,
            })),
          },
        ],
      },
    ],
    facets: {
      stages: stageLabels.map((label, index) => ({
        value: label,
        label,
        count: index + 1,
      })),
      topics: [],
    },
  }
}

describe('SearchPanel stage filters', () => {
  beforeEach(() => {
    localStorage.clear()
    apiGetMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('requests the backend with selected stage filters', async () => {
    apiGetMock.mockResolvedValue(makeSearchResponse(['2026.01', '2026.03']))

    renderWithI18n(
      <SearchPanel
        topicId="topic-1"
        onOpenResult={vi.fn()}
        onAddContext={vi.fn()}
        onAskAboutResult={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByTestId('topic-search-input'), {
      target: { value: 'retrieval' },
    })

    await sleep(260)

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(
        '/api/search?q=retrieval&scope=topic&topicId=topic-1&limit=28',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /^2026\.03\s*·\s*2$/u }))

    await sleep(260)

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenLastCalledWith(
        '/api/search?q=retrieval&scope=topic&topicId=topic-1&stages=2026.03&limit=28',
      )
    })
  })

  it('drops stale stage selections when refreshed facets no longer include them', async () => {
    let servedFilteredResponse = false

    apiGetMock.mockImplementation(async (path: string) => {
      if (path.includes('&stages=2026.03')) {
        servedFilteredResponse = true
        return makeSearchResponse(['2026.01'])
      }

      if (servedFilteredResponse) {
        return makeSearchResponse(['2026.01'])
      }

      return makeSearchResponse(['2026.01', '2026.03'])
    })

    renderWithI18n(
      <SearchPanel
        topicId="topic-1"
        onOpenResult={vi.fn()}
        onAddContext={vi.fn()}
        onAskAboutResult={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByTestId('topic-search-input'), {
      target: { value: 'retrieval' },
    })

    await sleep(260)
    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: /^2026\.03\s*·\s*2$/u }))

    await sleep(260)
    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledTimes(2)
    })

    await sleep(260)
    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledTimes(3)
    })

    expect(apiGetMock.mock.calls[1]?.[0]).toContain('&stages=2026.03')
    expect(apiGetMock.mock.calls[2]?.[0]).toBe(
      '/api/search?q=retrieval&scope=topic&topicId=topic-1&limit=28',
    )
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })
})
