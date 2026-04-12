// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { I18nProvider } from '@/i18n'
import type { NodeViewModel, PaperViewModel } from '@/types/alpha'
import type { NodeArticleFlowBlock } from '@/types/article'
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

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}))

vi.mock('@/components/topic/RightSidebarShell', () => ({
  RightSidebarShell: ({
    onOpenCitation,
  }: {
    onOpenCitation: (citation: {
      anchorId: string
      type: 'figure'
      route: string
      label: string
      quote: string
    }) => void
  }) => (
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
const saveAsMock = vi.mocked(saveAs)

function renderWithProviders(
  node: ReactNode,
  initialEntry: string,
  path: string,
  extraRoutes: ReactNode[] = [],
) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(
    <I18nProvider>
      <ReadingWorkspaceProvider>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path={path} element={node} />
            {extraRoutes}
          </Routes>
        </MemoryRouter>
      </ReadingWorkspaceProvider>
    </I18nProvider>,
  )
}

function RedirectProbe() {
  const location = useLocation()
  return (
    <div data-testid="paper-redirect-target">
      <div data-testid="paper-redirect-path">{location.pathname}</div>
      <div data-testid="paper-redirect-search">{location.search}</div>
    </div>
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
          body: ['paper-1《Paper title》 appears in node-1《Node title》 as a core reference.'],
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
  const enhancedArticleFlow: NodeArticleFlowBlock[] = [
    {
      type: 'paper-article',
      id: 'paper-1-article',
      paperId: 'paper-1',
      role: 'origin',
      title: 'Paper one',
      titleEn: 'Paper one',
      authors: ['Author'],
      publishedAt: '2026-04-01T00:00:00.000Z',
      citationCount: 3,
      originalUrl: 'https://example.com/paper-one',
      pdfUrl: 'https://example.com/paper-one.pdf',
      introduction: 'Enhanced introduction for Paper one.',
      subsections: [
        {
          kind: 'method',
          title: 'Method',
          titleEn: 'Method',
          content: 'Enhanced method walkthrough.',
          wordCount: 42,
          keyPoints: ['Key method point'],
          evidenceIds: [],
        },
      ],
      conclusion: 'Enhanced conclusion for Paper one.',
      totalWordCount: 120,
      readingTimeMinutes: 1,
      anchorId: 'paper:paper-1',
    },
    {
      type: 'paper-transition',
      id: 'paper-transition-1-2',
      fromPaperId: 'paper-1',
      fromPaperTitle: 'Paper one',
      toPaperId: 'paper-2',
      toPaperTitle: 'Paper two',
      content: 'Paper two extends the same line with a broader evidence surface.',
      transitionType: 'scope-broaden',
      anchorId: 'transition-paper-1-paper-2',
    },
    {
      type: 'paper-article',
      id: 'paper-2-article',
      paperId: 'paper-2',
      role: 'extension',
      title: 'Paper two',
      titleEn: 'Paper two',
      authors: ['Author', 'Author Two'],
      publishedAt: '2026-04-02T00:00:00.000Z',
      citationCount: 1,
      originalUrl: 'https://example.com/paper-two',
      pdfUrl: 'https://example.com/paper-two.pdf',
      introduction: 'Enhanced introduction for Paper two.',
      subsections: [
        {
          kind: 'results',
          title: 'Results',
          titleEn: 'Results',
          content: 'Enhanced results walkthrough for Paper two.',
          wordCount: 46,
          keyPoints: ['Key results point'],
          evidenceIds: [],
        },
      ],
      conclusion: 'Enhanced conclusion for Paper two.',
      totalWordCount: 126,
      readingTimeMinutes: 1,
      anchorId: 'paper:paper-2',
    },
    {
      type: 'closing',
      id: 'node-closing-enhanced',
      title: 'Conclusion',
      content: 'Meaningful closing point.',
      keyTakeaways: ['The node now reads as one continuous article.'],
    },
  ]

  return {
    schemaVersion: 'v1',
    nodeId: 'node-1',
    title: 'Node title',
    titleEn: 'Node title en',
    headline: 'Node title builds on paper-1《Paper one》 to establish the mainline.',
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
    standfirst:
      'If readers still cannot tell what each paper did, the node organization is still not successful.',
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
        authors: ['Author'],
        citationCount: 3,
        figuresCount: 1,
        tablesCount: 0,
        formulasCount: 0,
        coverImage: null,
        originalUrl: 'https://example.com/paper-one',
        pdfUrl: 'https://example.com/paper-one.pdf',
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
        authors: ['Author', 'Author Two'],
        citationCount: 1,
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
          body: ['node-1《Node title》 builds on paper-1《Paper one》 to establish the mainline.'],
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
          originalUrl: 'https://example.com/paper-one',
          pdfUrl: 'https://example.com/paper-one.pdf',
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
        {
          id: 'node-closing',
          type: 'closing',
          body: [
            'A good node should help the reader see the strongest evidence and the remaining gap.',
            'Meaningful closing point.',
          ],
        },
      ],
      sections: [],
      closing: ['Meaningful closing point.'],
    },
    critique: {
      title: 'Critique',
      summary: 'Critique summary',
      bullets: ['Bullet'],
    },
    evidence: [],
    enhancedArticleFlow,
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

  it('renders a continuous node article with a paper bundle, references, and batch PDF download', async () => {
    const fetchMock = vi.fn(async () => ({
      blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const zipFileSpy = vi.spyOn(JSZip.prototype, 'file')
    const zipGenerateSpy = vi.spyOn(JSZip.prototype, 'generateAsync').mockResolvedValue(
      new Blob(['zip-bytes'], { type: 'application/zip' }),
    )

    sessionStorage.setItem(
      'reading-workspace:v1',
      JSON.stringify({
        trail: [],
        pageScroll: {},
        workbenchByTopic: {},
        topicSurfaceByTopic: {
          'topic-1': {
            mode: 'dashboard',
          },
        },
      }),
    )

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/nodes/node-1/view-model?enhanced=true') {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    expect(screen.queryByText('Stage-locked article')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage topic cadence' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Topic' })).toHaveAttribute(
      'href',
      '/topic/topic-1?anchor=node%3Anode-1&stageMonths=1',
    )
    expect(screen.getByRole('heading', { name: 'Node title' })).toBeVisible()
    expect(screen.getByRole('link', { name: '《Paper one》' })).toHaveAttribute(
      'href',
      '/node/node-1?anchor=paper%3Apaper-1&stageMonths=1',
    )

    const articleFlow = screen.getByTestId('node-article-flow')
    expect(within(articleFlow).getByText('Enhanced introduction for Paper one.')).toBeVisible()
    expect(
      within(articleFlow).queryByRole('link', { name: 'Original source' }),
    ).not.toBeInTheDocument()
    expect(within(articleFlow).queryByRole('link', { name: 'Download PDF' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('node-paper-bundle-trigger'))
    const paperBundle = await screen.findByTestId('node-paper-bundle')
    expect(within(paperBundle).getByText('Paper bundle')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Select all papers' }))
    const downloadButton = screen.getByRole('button', { name: 'Download 2 PDFs' })
    expect(downloadButton).toBeEnabled()
    fireEvent.click(downloadButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.com/paper-one.pdf',
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/paper-two.pdf',
    )
    expect(zipFileSpy).toHaveBeenCalledTimes(2)
    expect(zipGenerateSpy).toHaveBeenCalledTimes(1)
    expect(saveAsMock).toHaveBeenCalledTimes(1)

    expect(screen.getByText('Enhanced method walkthrough.')).toBeVisible()
    expect(screen.getByText('Paper two extends the same line with a broader evidence surface.')).toBeVisible()
    expect(screen.getByText('Enhanced results walkthrough for Paper two.')).toBeVisible()
    expect(screen.getByText('Meaningful closing point.')).toBeVisible()
    expect(screen.getByText('The node now reads as one continuous article.')).toBeVisible()
    const referencesHeading = screen.getByRole('heading', { name: 'Reference List' })
    expect(referencesHeading).toBeVisible()
    const referencesFooter = referencesHeading.closest('footer')
    expect(referencesFooter).not.toBeNull()
    const referencesList = within(referencesFooter!).getByRole('list')
    expect(
      within(referencesList).getAllByRole('link', { name: 'Download PDF' }).length,
    ).toBe(2)
    expect(
      within(referencesList).getAllByRole('link', { name: 'Original source' }).length,
    ).toBe(2)
    expect(
      screen.queryByText(/If readers still cannot tell what each paper did/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'A good node should help the reader see the strongest evidence and the remaining gap.',
      ),
    ).not.toBeInTheDocument()

    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('reading-workspace:v1') ?? '{}') as {
        trail?: Array<{ id: string; route: string }>
      }
      expect(stored.trail?.find((entry) => entry.id === 'topic:topic-1')?.route).toBe(
        '/topic/topic-1?anchor=node%3Anode-1&stageMonths=1',
      )
    })

    zipFileSpy.mockRestore()
    zipGenerateSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('keeps the node reading surface stable when a sidebar citation evidence request fails', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/nodes/node-1/view-model?enhanced=true') {
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
    expect(screen.getByTestId('node-article-flow')).toHaveTextContent(
      'Enhanced introduction for Paper one.',
    )
  })

  it('redirects the paper route back into the node article when a related node exists', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/papers/paper-1/view-model') {
        return makePaperViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<PaperPage />, '/paper/paper-1', '/paper/:paperId', [
      <Route key="node-probe" path="/node/:nodeId" element={<RedirectProbe />} />,
    ])

    expect(await screen.findByTestId('paper-redirect-target')).toBeVisible()
    expect(screen.getByTestId('paper-redirect-path')).toHaveTextContent('/node/node-1')
    expect(screen.getByTestId('paper-redirect-search')).toHaveTextContent(
      '?anchor=paper%3Apaper-1&stageMonths=1',
    )

    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('reading-workspace:v1') ?? '{}') as {
        trail?: Array<{ id: string; title: string; route: string }>
      }
      expect(stored.trail?.some((entry) => entry.id === 'paper:paper-1')).toBe(true)
      expect(stored.trail?.find((entry) => entry.id === 'paper:paper-1')?.route).toBe(
        '/node/node-1?anchor=paper%3Apaper-1&stageMonths=1',
      )
    })
  })

  it('shows the paper unavailable state when the paper view model request fails', async () => {
    apiGetMock.mockImplementation(async () => {
      throw new Error('paper fetch failed')
    })

    renderWithProviders(<PaperPage />, '/paper/paper-1', '/paper/:paperId')

    expect(await screen.findByText('Paper unavailable')).toBeVisible()
  })
})
