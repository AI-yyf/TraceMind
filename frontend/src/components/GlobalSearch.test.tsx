// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '@/i18n'
import type { SearchResponse } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { GlobalSearch } from './GlobalSearch'

vi.mock('@/utils/api', () => {
  return {
    apiGet: vi.fn(),
  }
})

vi.mock('@/hooks/useProductCopy', () => ({
  useProductCopy: () => ({
    copy: (_id: string, fallback: string) => fallback,
  }),
}))

const apiGetMock = vi.mocked(apiGet)

function renderWithProviders(node: ReactNode) {
  localStorage.setItem(
    'tracemind-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(
    <I18nProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {node}
      </MemoryRouter>
    </I18nProvider>,
  )
}

async function flushUiCycle() {
  await act(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    await Promise.resolve()
    await Promise.resolve()
  })
}

function makeSearchResponse(items: SearchResponse['groups']): SearchResponse {
  return {
    query: 'retrieval',
    scope: 'global',
    totals: {
      all: items.flatMap((group) => group.items).length,
      topic: items.find((group) => group.group === 'topic')?.items.length ?? 0,
      node: items.find((group) => group.group === 'node')?.items.length ?? 0,
      paper: items.find((group) => group.group === 'paper')?.items.length ?? 0,
      evidence: items.find((group) => group.group === 'evidence')?.items.length ?? 0,
    },
    groups: items,
    facets: {
      stages: [
        { value: '2026.01', label: '2026.01', count: 1 },
        { value: '2026.03', label: '2026.03', count: 1 },
      ],
      topics: [
        { value: 'topic-1', label: 'Topic One', count: 1 },
        { value: 'topic-2', label: 'Topic Two', count: 1 },
      ],
    },
  }
}

function makeAllResponse() {
  return makeSearchResponse([
    {
      group: 'node',
      label: '鑺傜偣',
      items: [
        {
          id: 'node-1',
          kind: 'node',
          title: 'Topic one node',
          subtitle: 'Node summary',
          excerpt: 'Node excerpt',
          route: '/node/node-1',
          topicId: 'topic-1',
          topicTitle: 'Topic One',
          tags: ['retrieval'],
          matchedFields: ['title'],
          stageLabel: '2026.01',
          timeLabel: '01.10',
          relatedNodes: [
            {
              nodeId: 'node-1',
              title: 'Topic one node',
              stageIndex: 1,
              stageLabel: '2026.01',
              route: '/node/node-1',
            },
          ],
        },
      ],
    },
    {
      group: 'paper',
      label: '璁烘枃',
      items: [
        {
          id: 'paper-2',
          kind: 'paper',
          title: 'Topic two paper',
          subtitle: 'Paper summary',
          excerpt: 'Paper excerpt',
          route: '/node/node-2?anchor=paper%3Apaper-2',
          topicId: 'topic-2',
          topicTitle: 'Topic Two',
          tags: ['retrieval'],
          matchedFields: ['title'],
          stageLabel: '2026.03',
          timeLabel: '03.08',
        },
      ],
    },
  ])
}

function makeStageFilteredResponse() {
  return makeSearchResponse([
    {
      group: 'paper',
      label: '璁烘枃',
      items: [
        {
          id: 'paper-2',
          kind: 'paper',
          title: 'Topic two paper',
          subtitle: 'Paper summary',
          excerpt: 'Paper excerpt',
          route: '/node/node-2?anchor=paper%3Apaper-2',
          topicId: 'topic-2',
          topicTitle: 'Topic Two',
          tags: ['retrieval'],
          matchedFields: ['title'],
          stageLabel: '2026.03',
          timeLabel: '03.08',
        },
      ],
    },
  ])
}

function makeTopicFilteredResponse() {
  return makeSearchResponse([
    {
      group: 'node',
      label: '鑺傜偣',
      items: [
        {
          id: 'node-1',
          kind: 'node',
          title: 'Topic one node',
          subtitle: 'Node summary',
          excerpt: 'Node excerpt',
          route: '/node/node-1',
          topicId: 'topic-1',
          topicTitle: 'Topic One',
          tags: ['retrieval'],
          matchedFields: ['title'],
          stageLabel: '2026.01',
          timeLabel: '01.10',
          relatedNodes: [
            {
              nodeId: 'node-1',
              title: 'Topic one node',
              stageIndex: 1,
              stageLabel: '2026.01',
              route: '/node/node-1',
            },
          ],
        },
      ],
    },
  ])
}

function makeEmptyFilteredResponse() {
  return makeSearchResponse([])
}

describe('GlobalSearch backend-driven filters', () => {
  beforeEach(() => {
    localStorage.clear()
    apiGetMock.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('re-queries the backend when a stage filter is selected', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/topics') {
        return []
      }

      if (path.includes('&stages=2026.03')) {
        return makeStageFilteredResponse()
      }

      return makeAllResponse()
    })

    renderWithProviders(<GlobalSearch open onClose={vi.fn()} focusDelayMs={0} searchDebounceMs={0} />)
    await flushUiCycle()

    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'retrieval' },
    })
    await flushUiCycle()

    expect(apiGetMock).toHaveBeenCalledWith('/api/search?q=retrieval&scope=global&limit=28')
    expect(screen.getByTestId('global-search-topic-filter-topic-1')).toBeVisible()
    expect(screen.getByTestId('global-search-topic-filter-topic-2')).toBeVisible()
    expect(screen.getByTestId('global-search-stage-filters')).toBeVisible()

    fireEvent.click(screen.getByTestId('global-search-stage-filter-1'))
    await flushUiCycle()

    expect(apiGetMock).toHaveBeenLastCalledWith(
      '/api/search?q=retrieval&scope=global&stages=2026.03&limit=28',
    )
    expect(screen.getByText('Topic two paper')).toBeVisible()
    expect(screen.queryByText('Topic one node')).not.toBeInTheDocument()
  })

  it('combines topic and stage filters in backend requests', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/topics') {
        return []
      }

      if (path.includes('&topics=topic-1&stages=2026.03')) {
        return makeEmptyFilteredResponse()
      }

      if (path.includes('&topics=topic-1')) {
        return makeTopicFilteredResponse()
      }

      return makeAllResponse()
    })

    renderWithProviders(<GlobalSearch open onClose={vi.fn()} focusDelayMs={0} searchDebounceMs={0} />)
    await flushUiCycle()

    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'retrieval' },
    })
    await flushUiCycle()

    expect(screen.getByTestId('global-search-stage-filters')).toBeVisible()
    expect(screen.getByTestId('global-search-topic-filter-topic-1')).toBeVisible()
    expect(apiGetMock).toHaveBeenCalledWith('/api/search?q=retrieval&scope=global&limit=28')

    fireEvent.click(screen.getByTestId('global-search-topic-filter-topic-1'))
    await flushUiCycle()

    expect(apiGetMock).toHaveBeenLastCalledWith(
      '/api/search?q=retrieval&scope=global&topics=topic-1&limit=28',
    )
    expect(screen.getByText('Topic one node')).toBeVisible()
    expect(screen.queryByText('Topic two paper')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('global-search-stage-filter-1'))
    await flushUiCycle()

    expect(apiGetMock).toHaveBeenLastCalledWith(
      '/api/search?q=retrieval&scope=global&topics=topic-1&stages=2026.03&limit=28',
    )
    expect(
      screen.getByText(
        'No matching results yet. Try another keyword or narrow the search types first.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeVisible()
  })

  it('persists opened queries into recent search storage', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/topics') {
        return []
      }

      return makeAllResponse()
    })

    renderWithProviders(<GlobalSearch open onClose={vi.fn()} focusDelayMs={0} searchDebounceMs={0} />)
    await flushUiCycle()

    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'retrieval' },
    })
    await flushUiCycle()

    fireEvent.click(screen.getAllByRole('button', { name: 'Open Result' })[0]!)

    expect(localStorage.getItem('global-search:recent')).toContain('retrieval')
  })
})
