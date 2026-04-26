// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE } from '@/components/topic/workbench-layout'
import { I18nProvider, useI18n } from '@/i18n'
import type { NodeViewModel } from '@/types/alpha'
import type { NodeArticleFlowBlock } from '@/types/article'
import { apiGet } from '@/utils/api'
import { NodePage } from './NodePage'

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
    references = [],
    selectedReferenceIds = [],
    onDownloadSelectedReferences,
  }: {
    onOpenCitation: (citation: {
      anchorId: string
      type: 'figure'
      route: string
      label: string
      quote: string
    }) => void
    references?: Array<{ paperId: string }>
    selectedReferenceIds?: string[]
    onDownloadSelectedReferences?: () => void
  }) => {
    const [searchParams] = useSearchParams()
    return (
      <div data-testid="sidebar-shell-stub">
        <div data-testid="sidebar-reference-count">{references.length}</div>
        <div data-testid="sidebar-selected-reference-count">{selectedReferenceIds.length}</div>
        <div data-testid="sidebar-selected-evidence-anchor">
          {searchParams.get('evidence') ?? 'none'}
        </div>
        <button
          type="button"
          data-testid="sidebar-open-citation"
          onClick={() =>
              onOpenCitation({
                anchorId: 'figure:broken',
                type: 'figure',
                route: '/node/node-1?evidence=figure%3Abroken',
                label: 'Broken evidence',
                quote: 'Broken evidence',
              })
          }
        >
          Open citation
        </button>
        <button
          type="button"
          data-testid="sidebar-download-references"
          onClick={() => onDownloadSelectedReferences?.()}
        >
          Download references
        </button>
      </div>
    )
  },
}))

const apiGetMock = vi.mocked(apiGet)
const saveAsMock = vi.mocked(saveAs)

function KeyedReadingWorkspace({ children }: { children: ReactNode }) {
  const { preference, contentEpoch } = useI18n()
  return (
    <ReadingWorkspaceProvider
      key={`reading-workspace:${contentEpoch}:${preference.primary}:${preference.secondary}:${preference.mode}`}
    >
      {children}
    </ReadingWorkspaceProvider>
  )
}

function renderWithProviders(
  node: ReactNode,
  initialEntry: string,
  path: string,
  extraRoutes: ReactNode[] = [],
) {
  localStorage.setItem(
    'tracemind-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(
    <I18nProvider>
      <KeyedReadingWorkspace>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path={path} element={node} />
            {extraRoutes}
          </Routes>
        </MemoryRouter>
      </KeyedReadingWorkspace>
    </I18nProvider>,
  )
}

function NodeLanguageHarness() {
  const { setPrimaryLanguage } = useI18n()

  return (
    <>
      <button
        type="button"
        data-testid="node-switch-language"
        onClick={() => setPrimaryLanguage('zh')}
      >
        Switch language
      </button>
      <NodePage />
    </>
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search || '?'}</div>
}

function NodeLocationHarness() {
  return (
    <>
      <LocationProbe />
      <NodePage />
    </>
  )
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

function makeNodeViewModel(): NodeViewModel {
  const featuredFigure = {
    anchorId: 'figure:paper-1-fig-1',
    type: 'figure' as const,
    route: '/node/node-1?evidence=figure%3Apaper-1-fig-1',
    title: 'Figure 1',
    label: 'Paper one / Figure 1',
    quote: 'Paper one carries the main visual comparison.',
    content: 'Paper one carries the main visual comparison.',
    page: 1,
    sourcePaperId: 'paper-1',
    sourcePaperTitle: 'Paper one',
    imagePath: '/uploads/paper-1-fig-1.png',
    whyItMatters: 'This figure anchors the first judgment.',
  }
  const supportingTable = {
    anchorId: 'table:paper-1-table-1',
    type: 'table' as const,
    route: '/node/node-1?evidence=table%3Apaper-1-table-1',
    title: 'Table 1',
    label: 'Paper one / Table 1',
    quote: 'Node comparison table',
    content: 'Node comparison table\n\nMethod | AP\n--- | ---\nPaper one | 0.91\nPaper two | 0.84',
    page: 1,
    sourcePaperId: 'paper-1',
    sourcePaperTitle: 'Paper one',
    tableHeaders: ['Method', 'AP'],
    tableRows: [
      ['Paper one', '0.91'],
      ['Paper two', '0.84'],
    ],
  }
  const extensionSection = {
    anchorId: 'section:paper-2-results',
    type: 'section' as const,
    route: '/node/node-1?evidence=section%3Apaper-2-results',
    title: 'Results',
    label: 'Paper two / Results',
    quote: 'Paper two broadens the same line with a broader evidence surface.',
    content: 'Paper two broadens the same line with a broader evidence surface.',
    page: 2,
    sourcePaperId: 'paper-2',
    sourcePaperTitle: 'Paper two',
    whyItMatters: 'This paragraph explains the scope extension.',
  }
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
      tableCount: 1,
      formulaCount: 0,
    },
    standfirst:
      'If readers still cannot tell what each paper did, the node organization is still not successful.',
    paperRoles: [
      {
        paperId: 'paper-1',
        title: 'Paper one',
        titleEn: 'Paper one',
        route: '/node/node-1?anchor=paper%3Apaper-1',
        summary: 'Paper one summary',
        publishedAt: '2026-04-01T00:00:00.000Z',
        role: 'origin',
        contribution: 'Paper one contribution',
        authors: ['Author'],
        citationCount: 3,
        figuresCount: 1,
        tablesCount: 1,
        formulasCount: 0,
        coverImage: null,
        originalUrl: 'https://example.com/paper-one',
        pdfUrl: 'https://example.com/paper-one.pdf',
      },
      {
        paperId: 'paper-2',
        title: 'Paper two',
        titleEn: 'Paper two',
        route: '/node/node-1?anchor=paper%3Apaper-2',
        summary: 'Paper two summary',
        publishedAt: '2026-04-02T00:00:00.000Z',
        role: 'extension',
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
          role: 'origin',
          contribution: 'Paper one contribution',
          route: '/node/node-1?anchor=paper%3Apaper-1',
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
          role: 'extension',
          contribution: 'Paper two contribution',
          route: '/node/node-1?anchor=paper%3Apaper-2',
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
    evidence: [featuredFigure, supportingTable, extensionSection],
    references: [
      {
        paperId: 'paper-1',
        title: 'Paper one',
        titleEn: 'Paper one',
        route: '/node/node-1?anchor=paper%3Apaper-1',
        publishedAt: '2026-04-01T00:00:00.000Z',
        authors: ['Author'],
        citationCount: 3,
        originalUrl: 'https://example.com/paper-one',
        pdfUrl: 'https://example.com/paper-one.pdf',
      },
      {
        paperId: 'paper-2',
        title: 'Paper two',
        titleEn: 'Paper two',
        route: '/node/node-1?anchor=paper%3Apaper-2',
        publishedAt: '2026-04-02T00:00:00.000Z',
        authors: ['Author', 'Author Two'],
        citationCount: 1,
        originalUrl: 'https://example.com/paper-two',
        pdfUrl: 'https://example.com/paper-two.pdf',
      },
    ],
    researchView: {
      evidence: {
        featuredAnchorIds: [featuredFigure.anchorId, supportingTable.anchorId],
        supportingAnchorIds: [extensionSection.anchorId],
        featured: [featuredFigure, supportingTable],
        supporting: [extensionSection],
        paperBriefs: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            role: 'origin',
            publishedAt: '2026-04-01T00:00:00.000Z',
            summary: 'Paper one establishes the node mainline with one decisive figure and table.',
            contribution: 'Carries the primary visual comparison and the quantitative summary table.',
            evidenceAnchorIds: [featuredFigure.anchorId, supportingTable.anchorId],
            keyFigureIds: [featuredFigure.anchorId],
            keyTableIds: [supportingTable.anchorId],
            keyFormulaIds: [],
          },
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            role: 'extension',
            publishedAt: '2026-04-02T00:00:00.000Z',
            summary: 'Paper two explains how the mainline broadens into a wider setting.',
            contribution: 'Provides the scope-extension narrative that links the second paper back to the node.',
            evidenceAnchorIds: [extensionSection.anchorId],
            keyFigureIds: [],
            keyTableIds: [],
            keyFormulaIds: [],
          },
        ],
        evidenceChains: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            subsectionKind: 'results',
            subsectionTitle: 'Main comparison',
            summary: 'The figure and table jointly ground the node-level comparison.',
            evidenceAnchorIds: [featuredFigure.anchorId, supportingTable.anchorId],
          },
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            subsectionKind: 'significance',
            subsectionTitle: 'Scope extension',
            summary: 'The second paper explains why the same line extends beyond the origin setup.',
            evidenceAnchorIds: [extensionSection.anchorId],
          },
        ],
        coverage: {
          totalEvidenceCount: 3,
          renderableEvidenceCount: 2,
          figureCount: 1,
          tableCount: 1,
          formulaCount: 0,
          sectionCount: 1,
          featuredCount: 2,
          supportingCount: 1,
        },
      },
      methods: {
        entries: [
          {
            paperId: 'paper-1',
            paperTitle: 'Paper one',
            publishedAt: '2026-04-01T00:00:00.000Z',
            title: 'Method',
            titleEn: 'Method',
            summary: 'Enhanced method walkthrough.',
            keyPoints: ['Key method point'],
          },
        ],
        evolution: [
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            contribution: 'Paper two extends the same node judgment into a broader scope.',
            fromPaperId: 'paper-1',
            fromPaperTitle: 'Paper one',
            toPaperId: 'paper-2',
            toPaperTitle: 'Paper two',
            transitionType: 'scope-broaden',
            anchorId: extensionSection.anchorId,
            evidenceAnchorIds: [extensionSection.anchorId],
          },
        ],
        dimensions: ['Key method point'],
      },
      problems: {
        items: [
          {
            paperId: 'paper-2',
            paperTitle: 'Paper two',
            title: 'Generalization gap',
            titleEn: 'Generalization gap',
            status: 'partial',
          },
        ],
        openQuestions: ['What evidence still closes the generalization gap?'],
      },
      coreJudgment: {
        content: 'Node title establishes the mainline judgment.',
        contentEn: 'Node title establishes the mainline judgment.',
        confidence: 'medium',
        quickTags: ['Key method point'],
      },
    },
    enhancedArticleFlow,
  }
}

const NODE_VIEW_MODEL_PATH = '/api/nodes/node-1/view-model'
const NODE_VIEW_MODEL_ENHANCED_PATH = '/api/nodes/node-1/view-model?enhanced=true'
const NODE_VIEW_MODEL_STAGE_PATH = '/api/nodes/node-1/view-model?stageMonths=1'
const NODE_VIEW_MODEL_STAGE_ENHANCED_PATH = '/api/nodes/node-1/view-model?stageMonths=1&enhanced=true'

function isNodeViewModelRequest(path: string, options?: { stageMonths?: boolean; enhanced?: boolean }) {
  if (options?.stageMonths) {
    return options.enhanced ? path === NODE_VIEW_MODEL_STAGE_ENHANCED_PATH : path === NODE_VIEW_MODEL_STAGE_PATH
  }

  return options?.enhanced ? path === NODE_VIEW_MODEL_ENHANCED_PATH : path === NODE_VIEW_MODEL_PATH
}

describe('Reading pages resilience', () => {
  beforeEach(() => {
    localStorage.clear()
    apiGetMock.mockReset()
    setViewportWidth(900)
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

  it('keeps the quick node article visible while the enhanced article request continues in the background', async () => {
    let resolveEnhanced: ((value: NodeViewModel) => void) | null = null

    apiGetMock.mockImplementation((path: string) => {
      if (isNodeViewModelRequest(path)) {
        const quickModel = makeNodeViewModel()
        quickModel.enhancedArticleFlow = undefined
        return Promise.resolve(quickModel)
      }

      if (isNodeViewModelRequest(path, { enhanced: true })) {
        return new Promise<NodeViewModel>((resolve) => {
          resolveEnhanced = resolve
        })
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    expect(screen.queryByText('Loading node...')).not.toBeInTheDocument()
    expect(screen.getByTestId('node-article-enhancing-status')).toBeVisible()

    if (!resolveEnhanced) {
      throw new Error('Expected the enhanced node request to remain pending.')
    }

    (resolveEnhanced as (value: NodeViewModel) => void)(makeNodeViewModel())

    await waitFor(() => {
      expect(screen.queryByTestId('node-article-enhancing-status')).not.toBeInTheDocument()
    })
  })

  it('keeps legacy flow evidence blocks visible before the enhanced article arrives', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (isNodeViewModelRequest(path)) {
        const quickModel = makeNodeViewModel()
        quickModel.enhancedArticleFlow = undefined
        return Promise.resolve(quickModel)
      }

      if (isNodeViewModelRequest(path, { enhanced: true })) {
        return new Promise<NodeViewModel>(() => {})
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    await screen.findByText('Node comparison table')
    const articleFlow = screen.getByTestId('node-article-flow')
    expect(within(articleFlow).getByText('Node comparison table')).toBeVisible()
    expect(within(articleFlow).getByText('0.84')).toBeVisible()
  })

  it('renders a continuous node article while moving references and batch PDF download into the right workbench', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
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
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
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
    expect(screen.queryByTestId('node-paper-bundle-trigger')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Reference List/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download Selected PDFs' })).not.toBeInTheDocument()
    expect(screen.getByTestId('sidebar-reference-count')).toHaveTextContent('2')
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-selected-reference-count')).toHaveTextContent('2')
    })

    fireEvent.click(screen.getByTestId('sidebar-download-references'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/pdf/proxy/paper-1',
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/pdf/proxy/paper-2',
    )
    expect(zipFileSpy).toHaveBeenCalledTimes(2)
    expect(zipGenerateSpy).toHaveBeenCalledTimes(1)
    expect(saveAsMock).toHaveBeenCalledTimes(1)

    expect(screen.getByText('Enhanced method walkthrough.')).toBeVisible()
    expect(screen.getByText('Paper two extends the same line with a broader evidence surface.')).toBeVisible()
    expect(screen.getByText('Enhanced results walkthrough for Paper two.')).toBeVisible()
    expect(screen.getByText('Meaningful closing point.')).toBeVisible()
    expect(screen.getByText('The node now reads as one continuous article.')).toBeVisible()
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

  it('clears persisted reader content before reloading the node view model after language changes', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })
    localStorage.setItem('topic-chat:topic-1', JSON.stringify({ threads: [{ id: 'legacy-thread' }] }))
    localStorage.setItem('global-search:recent', JSON.stringify(['legacy query']))
    sessionStorage.setItem('topic-context-queue', JSON.stringify(['legacy context']))

    renderWithProviders(<NodeLanguageHarness />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    const initialRequestCount = apiGetMock.mock.calls.length

    fireEvent.click(screen.getByTestId('node-switch-language'))

    await waitFor(() => {
      expect(apiGetMock.mock.calls.length).toBeGreaterThan(initialRequestCount)
    })
    expect(localStorage.getItem('topic-chat:topic-1')).toBeNull()
    expect(localStorage.getItem('global-search:recent')).toBeNull()
    expect(sessionStorage.getItem('topic-context-queue')).toBeNull()
  })

  it('keeps the node reading surface stable when a sidebar citation evidence request fails', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        return makeNodeViewModel()
      }

      if (
        isNodeViewModelRequest(path, { stageMonths: true }) ||
        isNodeViewModelRequest(path, { stageMonths: true, enhanced: true })
      ) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    fireEvent.click(screen.getByTestId('sidebar-open-citation'))

    await waitFor(() => {
      expect(screen.getByTestId('node-reading')).toBeVisible()
      expect(screen.getByTestId('sidebar-selected-evidence-anchor')).toHaveTextContent('figure:broken')
    })
    expect(screen.getByTestId('node-article-flow')).toHaveTextContent(
      'Enhanced introduction for Paper one.',
    )
  })

  it('rejects malformed sidebar evidence payloads without polluting node workbench state', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        return makeNodeViewModel()
      }

      if (
        isNodeViewModelRequest(path, { stageMonths: true }) ||
        isNodeViewModelRequest(path, { stageMonths: true, enhanced: true })
      ) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    fireEvent.click(screen.getByTestId('sidebar-open-citation'))

    expect(apiGetMock).not.toHaveBeenCalledWith('/api/evidence/figure%3Abroken')
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-selected-evidence-anchor')).toHaveTextContent('figure:broken')
    })
    expect(screen.getByTestId('node-article-flow')).toHaveTextContent(
      'Enhanced introduction for Paper one.',
    )
  })

  it('shows an explicit contract error when node references drift away from paperRoles', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        const model = makeNodeViewModel()
        model.references = [model.references[0]!]
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(
      await screen.findByText(
        'Node references are out of sync with paperRoles; the workbench reference list must cover every node paper.',
      ),
    ).toBeVisible()
  })

  it('renders the research view with an evidence-first board when switched from article mode', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Research View' }))

    expect(await screen.findByTestId('node-research-header')).toBeVisible()
    expect(await screen.findByTestId('node-research-view')).toBeVisible()
    expect(screen.queryByTestId('node-article-flow')).not.toBeInTheDocument()
    expect(screen.queryByText('Enhanced introduction for Paper one.')).not.toBeInTheDocument()
  })

  it('renders the research view immediately when the URL requests it', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (
        isNodeViewModelRequest(path, { stageMonths: true }) ||
        isNodeViewModelRequest(path, { stageMonths: true, enhanced: true })
      ) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1?stageMonths=1&view=research', '/node/:nodeId')

    const readingSurface = await screen.findByTestId('node-reading')

    expect(readingSurface).toHaveAttribute('data-node-main-view', 'research')
    expect(screen.getByTestId('node-research-header')).toBeVisible()
    expect(screen.getByTestId('node-research-view')).toBeVisible()
    expect(screen.queryByTestId('node-article-flow')).not.toBeInTheDocument()
  })

  it('removes the research view query flag without dropping the active evidence anchor', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (
        isNodeViewModelRequest(path, { stageMonths: true }) ||
        isNodeViewModelRequest(path, { stageMonths: true, enhanced: true })
      ) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(
      <NodeLocationHarness />,
      '/node/node-1?stageMonths=1&view=research&evidence=figure%3Apaper-1-fig-1',
      '/node/:nodeId',
    )

    expect(await screen.findByTestId('node-research-header')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Article View' }))

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?stageMonths=1&evidence=figure%3Apaper-1-fig-1',
      )
    })
    expect(screen.getByTestId('node-article-flow')).toBeVisible()
    expect(screen.queryByTestId('node-research-header')).not.toBeInTheDocument()
  })

  it('keeps desktop node reading on a single main canvas and exposes the article/research toggle', async () => {
    setViewportWidth(1280)

    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    expect(await screen.findByTestId('node-reading')).toBeVisible()
    expect(screen.getByTestId('node-article-flow')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Research View' })).toBeVisible()
    expect(screen.queryByTestId('node-desktop-dual-pane')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-research-pane')).not.toBeInTheDocument()
  })

  it('keeps the desktop article canvas wide even when the workbench starts open', async () => {
    setViewportWidth(1600)
    sessionStorage.setItem(
      'reading-workspace:v1',
      JSON.stringify({
        trail: [],
        pageScroll: {},
        workbenchByTopic: {
          'topic-1': {
            open: true,
            activeTab: 'assistant',
            researchView: 'search',
            historyOpen: false,
            searchEnabled: true,
            thinkingEnabled: true,
            style: 'balanced',
            contextPills: [],
          },
        },
      }),
    )

    apiGetMock.mockImplementation(async (path: string) => {
      if (isNodeViewModelRequest(path) || isNodeViewModelRequest(path, { enhanced: true })) {
        return makeNodeViewModel()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<NodePage />, '/node/node-1', '/node/:nodeId')

    const readingSurface = await screen.findByTestId('node-reading')
    const shell = readingSurface.firstElementChild as HTMLElement | null

    expect(readingSurface.style.paddingRight).toBe('')
    expect(shell).not.toBeNull()
    expect(shell?.style.maxWidth).toContain(
      `calc(100vw - ${TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE + 40}px)`,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Research View' }))
    expect(await screen.findByTestId('node-research-view')).toBeVisible()
    expect(screen.queryByTestId('node-desktop-dual-pane')).not.toBeInTheDocument()
    expect(screen.queryByTestId('node-research-pane')).not.toBeInTheDocument()
  })
})
