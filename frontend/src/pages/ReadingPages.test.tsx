// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { I18nProvider } from '@/i18n'
import type { NodeViewModel, PaperViewModel } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { NodePage } from './NodePage'
import { PaperPage } from './PaperPage'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
  }
})

vi.mock('@/components/topic/RightSidebarShell', () => ({
  RightSidebarShell: ({ onOpenCitation }: { onOpenCitation: (citation: { anchorId: string; type: 'figure'; route: string; label: string; quote: string }) => void }) => (
    <div data-testid="sidebar-shell-stub">
      <button
        type="button"
        data-testid="sidebar-open-citation"
        onClick={() =>
          onOpenCitation({
            anchorId: 'figure:broken',
            type: 'figure',
            route: '/paper/paper-1',
            label: 'Broken evidence',
            quote: 'Broken evidence',
          })
        }
      >
        Open citation
      </button>
    </div>
  ),
}))

const apiGetMock = vi.mocked(apiGet)

function renderWithProviders(node: ReactNode, initialEntry: string, path: string) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(
    <I18nProvider>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path={path} element={node} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  )
}

function makePaperViewModel(): PaperViewModel {
  return {
    schemaVersion: 'v1',
    paperId: 'paper-1',
    title: 'Paper title',
    titleEn: '',
    summary: 'Paper summary',
    explanation: 'Paper explanation',
    publishedAt: '2026-04-05',
    authors: ['Author'],
    citationCount: 3,
    coverImage: null,
    originalUrl: 'https://arxiv.org/abs/2604.12345',
    pdfUrl: 'https://arxiv.org/pdf/2604.12345.pdf',
    topic: {
      topicId: 'topic-1',
      title: 'Topic title',
      route: '/topic/topic-1',
    },
    stats: {
      sectionCount: 1,
      figureCount: 1,
      tableCount: 0,
      formulaCount: 0,
      relatedNodeCount: 1,
    },
    relatedNodes: [
      {
        nodeId: 'node-1',
        title: 'Node title',
        subtitle: 'Node subtitle',
        summary: 'Node summary',
        stageIndex: 1,
        stageLabel: '2026.04',
        route: '/node/node-1',
      },
    ],
    standfirst: 'Paper standfirst',
    article: {
      periodLabel: '04.05',
      timeRangeLabel: 'Current',
      flow: [
        {
          id: 'flow-1',
          type: 'text',
          title: 'Lead',
          body: ['paper-1《Paper title》 appears in node-1 as a core reference.'],
        },
        {
          id: 'flow-table',
          type: 'table',
          evidence: {
            anchorId: 'table:paper-1',
            type: 'table',
            route: '/paper/paper-1?anchor=table:paper-1',
            title: 'Results table',
            label: 'Paper title / Table 1',
            quote: 'Main comparison table',
            content:
              'Main comparison table\n\nModel | Score\n--- | ---\nPaper title | 0.91\nBaseline | 0.84',
            page: 1,
          },
        },
      ],
      sections: [],
      closing: [],
    },
    critique: {
      title: 'Critique',
      summary: 'Critique summary',
      bullets: ['Bullet'],
    },
    evidence: [],
  }
}

function makeNodeViewModel(): NodeViewModel {
  return {
    schemaVersion: 'v1',
    nodeId: 'node-1',
    title: 'Node title',
    titleEn: 'Node title en',
    headline: 'Node headline',
    subtitle: 'Node subtitle',
    summary: 'Node summary',
    explanation: 'Node explanation',
    stageIndex: 1,
    stageLabel: '2026.04',
    updatedAt: '2026-04-05T00:00:00.000Z',
    isMergeNode: false,
    provisional: false,
    topic: {
      topicId: 'topic-1',
      title: 'Topic title',
      route: '/topic/topic-1',
    },
    stats: {
      paperCount: 2,
      figureCount: 1,
      tableCount: 0,
      formulaCount: 0,
    },
    standfirst: 'Node standfirst',
    paperRoles: [
      {
        paperId: 'paper-1',
        title: 'Paper one',
        titleEn: 'Paper one',
        route: '/paper/paper-1',
        summary: 'Paper one summary',
        publishedAt: '2026-04-01T00:00:00.000Z',
        role: 'Core paper',
        contribution: 'Paper one contribution',
        figuresCount: 1,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
        originalUrl: 'https://arxiv.org/abs/2604.00001',
        pdfUrl: 'https://arxiv.org/pdf/2604.00001.pdf',
      },
      {
        paperId: 'paper-2',
        title: 'Paper two',
        titleEn: 'Paper two',
        route: '/paper/paper-2',
        summary: 'Paper two summary',
        publishedAt: '2026-04-02T00:00:00.000Z',
        role: 'Supporting paper',
        contribution: 'Paper two contribution',
        figuresCount: 0,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
        originalUrl: 'https://example.com/paper-two',
        pdfUrl: 'https://example.com/paper-two.pdf',
      },
    ],
    comparisonBlocks: [],
    article: {
      periodLabel: '04.05',
      timeRangeLabel: 'Current',
      flow: [
        {
          id: 'node-intro',
          type: 'text',
          title: 'Lead',
          body: ['node-1 builds on paper-1《Paper one》 to establish the mainline.'],
        },
        {
          id: 'paper-break-paper-1',
          type: 'paper-break',
          paperId: 'paper-1',
          title: 'Paper one',
          titleEn: 'Paper one',
          role: 'Core paper',
          contribution: 'Paper one contribution',
          route: '/paper/paper-1',
          publishedAt: '2026-04-01T00:00:00.000Z',
          originalUrl: 'https://arxiv.org/abs/2604.00001',
          pdfUrl: 'https://arxiv.org/pdf/2604.00001.pdf',
        },
        {
          id: 'paper-break-paper-2',
          type: 'paper-break',
          paperId: 'paper-2',
          title: 'Paper two',
          titleEn: 'Paper two',
          role: 'Supporting paper',
          contribution: 'Paper two contribution',
          route: '/paper/paper-2',
          publishedAt: '2026-04-02T00:00:00.000Z',
          originalUrl: 'https://example.com/paper-two',
          pdfUrl: 'https://example.com/paper-two.pdf',
        },
        {
          id: 'flow-table-node',
          type: 'table',
          evidence: {
            anchorId: 'table:node-1',
            type: 'table',
            route: '/node/node-1?anchor=table:node-1',
            title: 'Node table',
            label: 'Paper one / Table 1',
            quote: 'Node comparison table',
            content:
              'Node comparison table\n\nMethod | AP\n--- | ---\nPaper one | 0.91\nPaper two | 0.84',
            page: 1,
          },
        },
      ],
      sections: [],
      closing: [],
    },
    critique: {
      title: 'Critique',
      summary: 'Critique summary',
      bullets: ['Bullet'],
    },
    evidence: [],
  }
}

describe('Reading pages resilience', () => {
  beforeEach(() => {
    localStorage.clear()
    apiGetMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the node unavailable state when the node view model request fails', async () => {
    apiGetMock.mockImplementation(async () => {
      throw new Error('node fetch failed')
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByText('Node unavailable')).toBeInTheDocument()
  })

  it('renders paper source links and supports batch import actions on the node page', async () => {
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWriteText,
      },
    })

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/nodes/node-1/view-model') {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    expect(screen.getByText('Stage-locked article')).toBeVisible()
    expect(
      screen.getByText(
        'This node article now keeps only the papers that belong to 2026.04. To regroup stages, change the topic cadence from Topic List rather than editing the reading surface.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Manage topic cadence' })).toHaveAttribute(
      'href',
      '/manage/topics',
    )
    expect(screen.getByRole('link', { name: /Node title/ })).toHaveAttribute(
      'href',
      '/node/node-1?stageMonths=1',
    )
    expect(screen.getByRole('link', { name: '《Paper one》' })).toHaveAttribute(
      'href',
      '/node/node-1?anchor=paper%3Apaper-1&stageMonths=1',
    )
    expect(screen.getAllByRole('link', { name: 'Original source' })[0]).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/2604.00001',
    )
    expect(screen.getAllByRole('link', { name: 'Download PDF' })[0]).toHaveAttribute(
      'href',
      'https://arxiv.org/pdf/2604.00001.pdf',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select all papers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy import links' }))

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        ['https://arxiv.org/abs/2604.00001', 'https://example.com/paper-two'].join('\n'),
      )
    })

    expect(screen.getByRole('button', { name: 'Download 2 PDFs' })).toBeEnabled()
    expect(screen.getByText('Method')).toBeVisible()
    expect(screen.getByText('0.91')).toBeVisible()
  })

  it('keeps the node reading surface stable when a sidebar citation evidence request fails', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/nodes/node-1/view-model') {
        return makeNodeViewModel()
      }

      if (path === '/api/evidence/figure%3Abroken') {
        throw new Error('evidence unavailable')
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    fireEvent.click(screen.getByTestId('sidebar-open-citation'))

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/api/evidence/figure%3Abroken')
    })

    expect(screen.getByTestId('node-reading')).toBeVisible()
    expect(screen.getByTestId('node-article-flow')).toHaveTextContent('Paper one contribution')
  })

  it('uses the paper page only as a redirect surface back to the node article', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/papers/paper-1/view-model') {
        return makePaperViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<PaperPage />, '/paper/paper-1', '/paper/:paperId')

    expect(await screen.findByTestId('paper-redirect')).toBeVisible()
    expect(screen.getByText('Reading moved')).toBeVisible()
    expect(
      screen.getByText(
        'Paper pages are now treated as a fallback surface. The full explanation, evidence ordering, and critical reading live inside the node article.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to Topic' })).toHaveAttribute(
      'href',
      '/topic/topic-1?stageMonths=1',
    )
    expect(screen.getByRole('link', { name: 'Open node article' })).toHaveAttribute(
      'href',
      '/node/node-1?anchor=paper%3Apaper-1&stageMonths=1',
    )
    expect(screen.getByRole('link', { name: 'Original source' })).toHaveAttribute(
      'href',
      'https://arxiv.org/abs/2604.12345',
    )
    expect(screen.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      'https://arxiv.org/pdf/2604.12345.pdf',
    )
    expect(screen.getByRole('link', { name: /Node title/ })).toHaveAttribute(
      'href',
      '/node/node-1?anchor=paper%3Apaper-1&stageMonths=1',
    )
  })

  it('shows the paper unavailable state when the paper view model request fails', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<PaperPage />, '/paper/paper-1', '/paper/:paperId')

    expect(await screen.findByText('Paper unavailable')).toBeVisible()
  })
})
