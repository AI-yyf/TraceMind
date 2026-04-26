// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { I18nProvider, useI18n } from '@/i18n'
import { makeTopicResearchBrief } from '@/test/topicResearchBrief'
import type { TopicResearchBrief, TopicViewModel } from '@/types/alpha'
import { fetchTopicResearchBrief, primeTopicResearchBrief } from '@/utils/omniRuntimeCache'
import { apiGet } from '@/utils/api'
import { APP_STATE_STORAGE_KEYS, getTopicSearchRecentStorageKey } from '@/utils/appStateStorage'
import { TopicPage } from './TopicPage'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  }
})

vi.mock('@/utils/omniRuntimeCache', () => ({
  fetchTopicResearchBrief: vi.fn(),
  invalidateTopicResearchBrief: vi.fn(),
  primeTopicResearchBrief: vi.fn(),
}))

vi.mock('@/components/topic/RightSidebarShell', () => ({
  RightSidebarShell: ({
    references = [],
    selectedReferenceIds = [],
    onDownloadSelectedReferences,
  }: {
    references?: Array<{ paperId: string }>
    selectedReferenceIds?: string[]
    onDownloadSelectedReferences?: () => void
  }) => {
    const [searchParams] = useSearchParams()
    return (
      <div data-testid="topic-sidebar-stub">
        <div data-testid="topic-sidebar-reference-count">{references.length}</div>
        <div data-testid="topic-sidebar-selected-reference-count">{selectedReferenceIds.length}</div>
        <div data-testid="topic-sidebar-selected-evidence-anchor">
          {searchParams.get('evidence') ?? 'none'}
        </div>
        <button type="button" data-testid="topic-sidebar-download-references" onClick={() => onDownloadSelectedReferences?.()}>
          Download references
        </button>
      </div>
    )
  },
}))

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const fetchTopicResearchBriefMock = vi.mocked(fetchTopicResearchBrief)
const primeTopicResearchBriefMock = vi.mocked(primeTopicResearchBrief)
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

function renderWithProviders(node: ReactNode, initialEntry: string, path: string) {
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
          </Routes>
        </MemoryRouter>
      </KeyedReadingWorkspace>
    </I18nProvider>,
  )
}

function TopicLanguageHarness() {
  const { setPrimaryLanguage } = useI18n()

  return (
    <>
      <button
        type="button"
        data-testid="topic-switch-language"
        onClick={() => setPrimaryLanguage('zh')}
      >
        Switch language
      </button>
      <TopicPage />
    </>
  )
}

function TopicDisplayModeHarness() {
  const { setDisplayMode } = useI18n()

  return (
    <>
      <button
        type="button"
        data-testid="topic-switch-display-mode"
        onClick={() => setDisplayMode('bilingual')}
      >
        Switch display mode
      </button>
      <TopicPage />
    </>
  )
}

function makeTopicViewModel(windowMonths = 3): TopicViewModel {
  return {
    schemaVersion: 'topic-view-model-v2',
    topicId: 'topic-1',
    title: 'Topic title',
    titleEn: 'Topic title',
    subtitle: 'Focus',
    focusLabel: 'Focus',
    summary: 'Summary',
    description: 'Description',
    language: 'zh',
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
    generatedAt: '2026-04-05T00:00:00.000Z',
    localization: null,
    hero: {
      kicker: 'Topic',
      title: 'Topic title',
      standfirst: 'Standfirst',
      strapline: 'Strapline',
    },
    stageConfig: {
      windowMonths,
      defaultWindowMonths: 1,
      minWindowMonths: 1,
      maxWindowMonths: 24,
      adjustable: true,
    },
    summaryPanel: {
      thesis: 'Thesis',
      metaRows: [
        { label: 'Status', value: 'active' },
        { label: 'Language', value: 'ZH' },
      ],
      stats: [
        { label: 'Stages', value: 1 },
        { label: 'Nodes', value: 1 },
      ],
      actions: [],
    },
    stats: {
      stageCount: 1,
      nodeCount: 1,
      paperCount: 1,
      mappedPaperCount: 1,
      unmappedPaperCount: 0,
      evidenceCount: 4,
    },
    timeline: {
      stages: [
        {
          stageIndex: 1,
          title: '2026.01-2026.03',
          titleEn: '2026.01-2026.03',
          description: 'Timeline description',
          branchLabel: '2026.01-2026.03',
          branchColor: '#7d1938',
          yearLabel: '2026',
          dateLabel: '2026.01-2026.03',
          timeLabel: '2026.01-2026.03',
          stageThesis: 'Stage thesis',
          editorial: {
            kicker: 'Window',
            summary: 'Stage summary',
            transition: 'Stage transition',
          },
        },
      ],
    },
    graph: {
      columnCount: 1,
      lanes: [
        {
          id: 'lane:mainline',
          laneIndex: 0,
          branchIndex: null,
          isMainline: true,
          side: 'center',
          color: '#7d1938',
          roleLabel: 'Mainline',
          label: 'Node title',
          labelEn: 'Node title',
          legendLabel: 'Mainline Node title',
          legendLabelEn: 'Mainline Node title',
          description: 'Node summary',
          periodLabel: '2026.01-2026.03',
          nodeCount: 1,
          stageCount: 1,
          latestNodeId: 'node-1',
          latestAnchorId: 'node:node-1',
        },
      ],
      nodes: [
        {
          nodeId: 'node-1',
          anchorId: 'node:node-1',
          route: '/node/node-1',
          stageIndex: 1,
          title: 'Node title',
          titleEn: 'Node title',
          subtitle: 'Node subtitle',
          summary: 'Node summary',
          explanation: 'Node explanation',
          paperCount: 1,
          figureCount: 2,
          tableCount: 1,
          formulaCount: 1,
          figureGroupCount: 0,
          evidenceCount: 4,
          paperIds: ['paper-1'],
          primaryPaperTitle: 'Paper title',
          primaryPaperId: 'paper-1',
          coverImage: null,
          isMergeNode: false,
          provisional: false,
          updatedAt: '2026-04-05T00:00:00.000Z',
          branchLabel: '2026.01-2026.03',
          branchColor: '#7d1938',
          editorial: {
            eyebrow: 'Node',
            digest: 'Node digest',
            whyNow: 'Node why now',
            nextQuestion: 'Node next question',
          },
          branchPathId: 'branch:main',
          parentNodeIds: [],
          timeLabel: '2026.01-2026.03',
          layoutHint: {
            column: 1,
            span: 1,
            row: 1,
            emphasis: 'primary',
            laneIndex: 0,
            branchIndex: null,
            isMainline: true,
            side: 'center',
          },
          coverAsset: {
            imagePath: null,
            alt: 'Paper title',
            source: 'generated-brief',
          },
          cardEditorial: {
            eyebrow: 'Node',
            digest: 'Node digest',
            whyNow: 'Node why now',
            nextQuestion: 'Node next question',
          },
        },
      ],
    },
    generationState: {
      hero: 'ready',
      stageTimeline: 'ready',
      nodeCards: 'ready',
      closing: 'ready',
    },
    stages: [
      {
        stageIndex: 1,
        title: '2026.01-2026.03',
        titleEn: '2026.01-2026.03',
        description: 'Stage description',
        branchLabel: '2026.01-2026.03',
        branchColor: '#7d1938',
        editorial: {
          kicker: 'Window',
          summary: 'Stage summary',
          transition: 'Stage transition',
        },
        trackedPaperCount: 1,
        mappedPaperCount: 1,
        unmappedPaperCount: 0,
        nodes: [
          {
            nodeId: 'node-1',
            anchorId: 'node:node-1',
            route: '/node/node-1',
            title: 'Node title',
            titleEn: 'Node title',
            subtitle: 'Node subtitle',
            summary: 'Node summary',
            explanation: 'Node explanation',
            paperCount: 1,
            figureCount: 2,
            tableCount: 1,
            formulaCount: 1,
            figureGroupCount: 0,
            evidenceCount: 4,
            paperIds: ['paper-1'],
            primaryPaperTitle: 'Paper title',
            primaryPaperId: 'paper-1',
            coverImage: null,
            isMergeNode: false,
            provisional: false,
            updatedAt: '2026-04-05T00:00:00.000Z',
            branchLabel: '2026.01-2026.03',
            branchColor: '#7d1938',
            editorial: {
              eyebrow: 'Node',
              digest: 'Node digest',
              whyNow: 'Node why now',
              nextQuestion: 'Node next question',
            },
          },
        ],
      },
    ],
    papers: [
      {
        paperId: 'paper-1',
        anchorId: 'paper:paper-1',
        route: '/topic/topic-1?anchor=paper%3Apaper-1',
        title: 'Paper title',
        titleEn: 'Paper title',
        summary: 'Paper summary',
        explanation: 'Paper explanation',
        publishedAt: '2026-02-01T00:00:00.000Z',
        authors: ['Author'],
        citationCount: 1,
        originalUrl: 'https://example.com/paper-1',
        pdfUrl: 'https://example.com/paper-1.pdf',
        coverImage: null,
        figuresCount: 0,
        tablesCount: 0,
        formulasCount: 0,
        sectionsCount: 0,
      },
    ],
    unmappedPapers: [],
    narrativeArticle: 'Narrative article',
    closingEditorial: {
      title: 'Closing',
      paragraphs: ['Closing paragraph'],
      reviewerNote: 'Reviewer note',
    },
    resources: [],
    chatContext: {
      suggestedQuestions: ['What matters here?'],
    },
  }
}

function makeResearchBrief(): TopicResearchBrief {
  return makeTopicResearchBrief()
}

describe('TopicPage timeline map', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    apiGetMock.mockReset()
    fetchTopicResearchBriefMock.mockReset()
    primeTopicResearchBriefMock.mockReset()
    saveAsMock.mockReset()
    fetchTopicResearchBriefMock.mockResolvedValue(makeResearchBrief())
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('requests the topic view model and renders the timeline map', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const stageMonths = Number(new URL(`https://example.com${path}`).searchParams.get('stageMonths') ?? '1')
        return makeTopicViewModel(stageMonths)
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(apiGetMock).toHaveBeenCalledWith('/api/topics/topic-1/view-model?stageMonths=3')
    const stageMap = screen.getByTestId('topic-stage-map')
    expect(stageMap).toBeVisible()
    expect(screen.getByText('Summary')).toBeVisible()
    expect(screen.getByText('Description')).toBeVisible()
    expect(screen.getByText('Closing paragraph')).toBeVisible()
    expect(within(stageMap).getByRole('link', { name: 'Open article' })).toHaveAttribute(
      'href',
      '/node/node-1?stageMonths=3',
    )
    expect(screen.getByText('Papers 1')).toBeVisible()
    expect(screen.getByText('Fig 2')).toBeVisible()
    expect(screen.getByText('Tbl 1')).toBeVisible()
    expect(screen.getByText('Eq 1')).toBeVisible()
    expect(screen.getByTestId('topic-sidebar-stub')).toBeVisible()
    expect(screen.getByTestId('topic-sidebar-reference-count')).toHaveTextContent('1')
    expect(fetchTopicResearchBriefMock).toHaveBeenCalledWith('topic-1', { force: true })
  })

  it('clears persisted topic content before reloading after language changes', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      throw new Error(`Unexpected GET ${path}`)
    })
    localStorage.setItem('topic-chat:topic-1', JSON.stringify({ threads: [{ id: 'legacy-thread' }] }))
    localStorage.setItem('global-search:recent', JSON.stringify(['legacy query']))
    localStorage.setItem(getTopicSearchRecentStorageKey('topic-1'), JSON.stringify(['legacy topic query']))
    sessionStorage.setItem('topic-context-queue', JSON.stringify(['legacy context']))
    const legacyWorkspaceState = JSON.stringify({ workbenchByTopic: { 'topic-1': { open: true } } })
    sessionStorage.setItem(
      APP_STATE_STORAGE_KEYS.readingWorkspace,
      legacyWorkspaceState,
    )

    renderWithProviders(<TopicLanguageHarness />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(apiGetMock).toHaveBeenCalledTimes(1)
    expect(fetchTopicResearchBriefMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('topic-switch-language'))

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchTopicResearchBriefMock).toHaveBeenCalledTimes(2)
    expect(fetchTopicResearchBriefMock).toHaveBeenLastCalledWith('topic-1', { force: true })
    expect(localStorage.getItem('topic-chat:topic-1')).toBeNull()
    expect(localStorage.getItem('global-search:recent')).toBeNull()
    expect(localStorage.getItem(getTopicSearchRecentStorageKey('topic-1'))).toBeNull()
    expect(sessionStorage.getItem('topic-context-queue')).toBeNull()

    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.readingWorkspace)).not.toBe(
      legacyWorkspaceState,
    )
  })

  it('clears persisted topic content before reloading after display-mode i18n changes', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      throw new Error(`Unexpected GET ${path}`)
    })
    localStorage.setItem('topic-chat:topic-1', JSON.stringify({ threads: [{ id: 'legacy-thread' }] }))
    localStorage.setItem('global-search:recent', JSON.stringify(['legacy query']))
    localStorage.setItem(getTopicSearchRecentStorageKey('topic-1'), JSON.stringify(['legacy topic query']))
    sessionStorage.setItem('topic-context-queue', JSON.stringify(['legacy context']))
    const legacyWorkspaceState = JSON.stringify({ workbenchByTopic: { 'topic-1': { open: true } } })
    sessionStorage.setItem(
      APP_STATE_STORAGE_KEYS.readingWorkspace,
      legacyWorkspaceState,
    )

    renderWithProviders(
      <TopicDisplayModeHarness />,
      '/topic/topic-1?stageMonths=3',
      '/topic/:topicId',
    )

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(apiGetMock).toHaveBeenCalledTimes(1)
    expect(fetchTopicResearchBriefMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('topic-switch-display-mode'))

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledTimes(2)
    })
    expect(fetchTopicResearchBriefMock).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('topic-chat:topic-1')).toBeNull()
    expect(localStorage.getItem('global-search:recent')).toBeNull()
    expect(localStorage.getItem(getTopicSearchRecentStorageKey('topic-1'))).toBeNull()
    expect(sessionStorage.getItem('topic-context-queue')).toBeNull()
    expect(localStorage.getItem(APP_STATE_STORAGE_KEYS.languagePreference)).toContain(
      '"mode":"bilingual"',
    )

    expect(sessionStorage.getItem(APP_STATE_STORAGE_KEYS.readingWorkspace)).not.toBe(
      legacyWorkspaceState,
    )
  })

  it('downloads selected topic references through the workbench callback', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['pdf-bytes'], { type: 'application/pdf' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const zipFileSpy = vi.spyOn(JSZip.prototype, 'file')
    const zipGenerateSpy = vi.spyOn(JSZip.prototype, 'generateAsync').mockResolvedValue(
      new Blob(['zip-bytes'], { type: 'application/zip' }),
    )

    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(screen.getByTestId('topic-sidebar-selected-reference-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByTestId('topic-sidebar-download-references'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/pdf/proxy/paper-1')
    })

    expect(zipFileSpy).toHaveBeenCalledTimes(1)
    expect(zipGenerateSpy).toHaveBeenCalledTimes(1)
    expect(saveAsMock).toHaveBeenCalledTimes(1)

    zipFileSpy.mockRestore()
    zipGenerateSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('shows an explicit contract error when the backend view model has no graph layout', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        model.graph = null as never
        model.generationState = {
          hero: 'ready',
          stageTimeline: 'ready',
          nodeCards: 'ready',
          closing: 'ready',
        }
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByText(
        'Topic view model is missing graph layout from the backend contract.',
      ),
    ).toBeVisible()
  })

  it('rejects malformed evidence payloads without corrupting the topic workbench state', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      if (path === '/api/evidence/figure%3Abroken') {
        return {
          anchorId: 'figure:broken',
          type: 'figure',
        }
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(
      <TopicPage />,
      '/topic/topic-1?stageMonths=3&evidence=figure:broken',
      '/topic/:topicId',
    )

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(apiGetMock).not.toHaveBeenCalledWith('/api/evidence/figure%3Abroken')
    expect(screen.getByTestId('topic-sidebar-selected-evidence-anchor')).toHaveTextContent('figure:broken')
    expect(screen.getByTestId('topic-stage-map')).toBeVisible()
  })

  it('shows an explicit contract error when a graph node points to a missing lane', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        model.graph.nodes[0]!.layoutHint.laneIndex = 9
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByText(
        'Topic graph node 1 references lane 9, but the backend lane list does not contain that lane.',
      ),
    ).toBeVisible()
  })

  it('shows an explicit contract error when a lane points to a missing latest node anchor', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        model.graph.lanes[0]!.latestNodeId = 'missing-node'
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByText(
        'Topic graph lane 1 references latestNodeId "missing-node", but that node is missing from the backend payload.',
      ),
    ).toBeVisible()
  })

  it('keeps the timeline inside a stable reading width for a single-node stage', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()

    const canvas = screen.getByTestId('topic-stage-map-canvas')
    const width = Number.parseFloat(canvas.style.width)

    expect(Number.isFinite(width)).toBe(true)
    expect(width).toBeGreaterThan(400)
    expect(width).toBeLessThanOrEqual(1120)
  })

  it('omits empty placeholder stages from the visible map', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(1)
        model.stats.stageCount = 2
        model.timeline = {
          stages: [
            model.timeline!.stages[0],
            {
              stageIndex: 2,
              title: '2026.04-2026.06',
              titleEn: '2026.04-2026.06',
              description: 'Empty stage',
              branchLabel: '2026.04-2026.06',
              branchColor: '#7d1938',
              yearLabel: '2026',
              dateLabel: '2026.04-2026.06',
              timeLabel: '2026.04-2026.06',
              stageThesis: 'Empty stage thesis',
              editorial: {
                kicker: 'Window',
                summary: 'This stage exists only as a future placeholder.',
                transition: 'Transition',
              },
            },
          ],
        }
        model.stages = [
          model.stages[0],
          {
            stageIndex: 2,
            title: 'Stage 2',
            titleEn: 'Stage 2',
            description: 'Empty stage',
            branchLabel: '2026.04-2026.06',
            branchColor: '#7d1938',
            editorial: {
              kicker: 'Window',
              summary: 'This stage exists only as a future placeholder.',
              transition: 'Transition',
            },
            trackedPaperCount: 0,
            mappedPaperCount: 0,
            unmappedPaperCount: 0,
            nodes: [],
          },
        ]
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=1', '/topic/:topicId')

    const stageMap = await screen.findByTestId('topic-stage-map')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(within(stageMap).queryByText('2026.04-2026.06')).not.toBeInTheDocument()
    expect(within(stageMap).getByRole('link', { name: 'Open article' })).toHaveAttribute(
      'href',
      '/node/node-1?stageMonths=1',
    )
  })

  it('shows a later stage when tracked papers exist there even before a node forms', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(1)
        model.stats.stageCount = 2
        model.stats.paperCount = 2
        model.stats.mappedPaperCount = 1
        model.stats.unmappedPaperCount = 1
        model.timeline = {
          stages: [
            model.timeline!.stages[0],
            {
              stageIndex: 2,
              title: '2026.04-2026.06',
              titleEn: '2026.04-2026.06',
              description: 'A later bucket with one tracked paper awaiting node placement.',
              branchLabel: '2026.04-2026.06',
              branchColor: '#7d1938',
              yearLabel: '2026',
              dateLabel: '2026.04-2026.06',
              timeLabel: '2026.04-2026.06',
              stageThesis: 'Pending literature',
              editorial: {
                kicker: 'Window',
                summary: 'One tracked paper is waiting for node synthesis in this stage.',
                transition: 'Transition',
              },
            },
          ],
        }
        model.stages = [
          model.stages[0],
          {
            stageIndex: 2,
            title: 'Stage 2',
            titleEn: 'Stage 2',
            description: 'A later bucket with one tracked paper awaiting node placement.',
            branchLabel: '2026.04-2026.06',
            branchColor: '#7d1938',
            editorial: {
              kicker: 'Window',
              summary: 'One tracked paper is waiting for node synthesis in this stage.',
              transition: 'Transition',
            },
            trackedPaperCount: 1,
            mappedPaperCount: 0,
            unmappedPaperCount: 1,
            nodes: [],
          },
        ]
        model.unmappedPapers = [
          {
            paperId: 'paper-2',
            anchorId: 'paper:paper-2',
            route: '/topic/topic-1?anchor=paper%3Apaper-2',
            title: 'Awaiting synthesis paper',
            titleEn: 'Awaiting synthesis paper',
            summary: 'A pending paper that should stay visible at the topic level.',
            publishedAt: '2026-05-01T00:00:00.000Z',
            authors: ['Author 2'],
            citationCount: 0,
            coverImage: null,
            stageIndex: 2,
            stageLabel: '2026.04-2026.06',
          },
        ]
        model.papers.push({
          paperId: 'paper-2',
          anchorId: 'paper:paper-2',
          route: '/topic/topic-1?anchor=paper%3Apaper-2',
          title: 'Awaiting synthesis paper',
          titleEn: 'Awaiting synthesis paper',
          summary: 'A pending paper that should stay visible at the topic level.',
          explanation: 'Still waiting to be grouped into a problem node.',
          publishedAt: '2026-05-01T00:00:00.000Z',
          authors: ['Author 2'],
          citationCount: 0,
          coverImage: null,
          figuresCount: 0,
          tablesCount: 0,
          formulasCount: 0,
          sectionsCount: 0,
        })
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=1', '/topic/:topicId')

    const stageMap = await screen.findByTestId('topic-stage-map')

    expect(
      within(stageMap).getAllByText((_, element) => {
        const text = element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
        return text.includes('2026.04') && text.includes('2026.06')
      }).length,
    ).toBeGreaterThan(0)
  })

  it('keeps the topic canvas width stable when the right workbench is already open', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
    })
    sessionStorage.setItem(
      'reading-workspace:v1',
      JSON.stringify({
        trail: [],
        pageScroll: {},
        workbenchByTopic: {
          'topic-1': {
            open: true,
            activeTab: 'assistant',
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
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()
    expect(screen.getByRole('main')).not.toHaveStyle({ paddingRight: '416px' })
    expect(Number.parseFloat(screen.getByTestId('topic-stage-map-canvas').style.width)).toBeGreaterThan(400)
  })

  it('keeps up to ten parallel node cards inside the stable reading width', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        const laneLayout = [
          { laneIndex: 0, side: 'center' as const },
          { laneIndex: 1, side: 'right' as const },
          { laneIndex: -1, side: 'left' as const },
          { laneIndex: 2, side: 'right' as const },
          { laneIndex: -2, side: 'left' as const },
          { laneIndex: 3, side: 'right' as const },
          { laneIndex: -3, side: 'left' as const },
          { laneIndex: 4, side: 'right' as const },
          { laneIndex: -4, side: 'left' as const },
          { laneIndex: 5, side: 'right' as const },
        ]

        model.graph!.lanes = laneLayout.map((lane, index) => ({
          id: `lane-${index + 1}`,
          laneIndex: lane.laneIndex,
          branchIndex: null,
          isMainline: lane.laneIndex === 0,
          side: lane.side,
          color: '#7d1938',
          roleLabel: lane.laneIndex === 0 ? 'Mainline' : 'Branch',
          label: `Node ${index + 1}`,
          labelEn: `Node ${index + 1}`,
          legendLabel: `${lane.laneIndex === 0 ? 'Mainline' : 'Branch'} Node ${index + 1}`,
          legendLabelEn: `${lane.laneIndex === 0 ? 'Mainline' : 'Branch'} Node ${index + 1}`,
          description: `Node ${index + 1} summary`,
          periodLabel: '2026.01-2026.03',
          nodeCount: 1,
          stageCount: 1,
          latestNodeId: `node-${index + 1}`,
          latestAnchorId: `node:node-${index + 1}`,
        }))

        model.graph!.nodes = laneLayout.map((lane, index) => ({
          ...model.graph!.nodes[0],
          nodeId: `node-${index + 1}`,
          anchorId: `node:node-${index + 1}`,
          route: `/node/node-${index + 1}`,
          title: `Node ${index + 1}`,
          titleEn: `Node ${index + 1}`,
          summary: `Node ${index + 1} summary`,
          explanation: `Node ${index + 1} explanation`,
          primaryPaperTitle: `Paper ${index + 1}`,
          primaryPaperId: `paper-${index + 1}`,
          paperIds: [`paper-${index + 1}`],
          layoutHint: {
            column: index + 1,
            span: 1,
            row: 1,
            emphasis: lane.laneIndex === 0 ? 'primary' : 'branch',
            laneIndex: lane.laneIndex,
            branchIndex: null,
            isMainline: lane.laneIndex === 0,
            side: lane.side,
          },
        }))

        model.stages[0].nodes = model.graph!.nodes.map((node) => ({
          ...model.stages[0].nodes[0],
          nodeId: node.nodeId,
          anchorId: node.anchorId,
          route: node.route,
          title: node.title,
          titleEn: node.titleEn,
          summary: node.summary,
          explanation: node.explanation,
          primaryPaperTitle: node.primaryPaperTitle,
          primaryPaperId: node.primaryPaperId,
          paperIds: node.paperIds,
        }))

        model.papers = model.graph!.nodes.map((_, index) => ({
          ...model.papers[0],
          paperId: `paper-${index + 1}`,
          anchorId: `paper:paper-${index + 1}`,
          route: `/topic/topic-1?anchor=paper%3Apaper-${index + 1}`,
          title: `Paper ${index + 1}`,
          titleEn: `Paper ${index + 1}`,
        }))

        model.stats.nodeCount = model.graph!.nodes.length
        model.stats.paperCount = model.graph!.nodes.length
        model.stats.mappedPaperCount = model.graph!.nodes.length
        model.stages[0].trackedPaperCount = model.graph!.nodes.length
        model.stages[0].mappedPaperCount = model.graph!.nodes.length

        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    const stageMap = await screen.findByTestId('topic-stage-map')
    const canvas = screen.getByTestId('topic-stage-map-canvas')

    expect(within(stageMap).getAllByRole('link', { name: 'Open article' })).toHaveLength(10)
    expect(Number.parseFloat(canvas.style.width)).toBeGreaterThan(1600)
    expect(Number.parseFloat(canvas.style.width)).toBeLessThan(2400)
  })

  it('keeps split and merge stages readable inside the same fixed-width timeline canvas', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        model.stats.stageCount = 2
        model.stats.nodeCount = 5
        model.stats.paperCount = 5
        model.stats.mappedPaperCount = 5
        model.timeline = {
          stages: [
            model.timeline!.stages[0],
            {
              stageIndex: 2,
              title: '2026.04-2026.06',
              titleEn: '2026.04-2026.06',
              description: 'Merge stage',
              branchLabel: '2026.04-2026.06',
              branchColor: '#7d1938',
              yearLabel: '2026',
              dateLabel: '2026.04-2026.06',
              timeLabel: '2026.04-2026.06',
              stageThesis: 'Merge thesis',
              editorial: {
                kicker: 'Window',
                summary: 'Merge summary',
                transition: 'Merge transition',
              },
            },
          ],
        }

        const graphNodes = [
          {
            ...model.graph!.nodes[0],
            nodeId: 'node-root',
            anchorId: 'node:node-root',
            route: '/node/node-root',
            title: 'Root node',
            titleEn: 'Root node',
            primaryPaperTitle: 'Paper 1',
            primaryPaperId: 'paper-1',
            paperIds: ['paper-1'],
            parentNodeIds: [],
            stageIndex: 1,
            layoutHint: {
              column: 1,
              span: 1,
              row: 1,
              emphasis: 'primary' as const,
              laneIndex: 0,
              branchIndex: null,
              isMainline: true,
              side: 'center' as const,
            },
          },
          {
            ...model.graph!.nodes[0],
            nodeId: 'node-left',
            anchorId: 'node:node-left',
            route: '/node/node-left',
            title: 'Left branch',
            titleEn: 'Left branch',
            primaryPaperTitle: 'Paper 2',
            primaryPaperId: 'paper-2',
            paperIds: ['paper-2'],
            parentNodeIds: ['node-root'],
            stageIndex: 2,
            layoutHint: {
              column: 1,
              span: 1,
              row: 1,
              emphasis: 'branch' as const,
              laneIndex: -1,
              branchIndex: null,
              isMainline: false,
              side: 'left' as const,
            },
          },
          {
            ...model.graph!.nodes[0],
            nodeId: 'node-center',
            anchorId: 'node:node-center',
            route: '/node/node-center',
            title: 'Center branch',
            titleEn: 'Center branch',
            primaryPaperTitle: 'Paper 3',
            primaryPaperId: 'paper-3',
            paperIds: ['paper-3'],
            parentNodeIds: ['node-root'],
            stageIndex: 2,
            layoutHint: {
              column: 2,
              span: 1,
              row: 1,
              emphasis: 'primary' as const,
              laneIndex: 0,
              branchIndex: null,
              isMainline: true,
              side: 'center' as const,
            },
          },
          {
            ...model.graph!.nodes[0],
            nodeId: 'node-right',
            anchorId: 'node:node-right',
            route: '/node/node-right',
            title: 'Right branch',
            titleEn: 'Right branch',
            primaryPaperTitle: 'Paper 4',
            primaryPaperId: 'paper-4',
            paperIds: ['paper-4'],
            parentNodeIds: ['node-root'],
            stageIndex: 2,
            layoutHint: {
              column: 3,
              span: 1,
              row: 1,
              emphasis: 'branch' as const,
              laneIndex: 1,
              branchIndex: null,
              isMainline: false,
              side: 'right' as const,
            },
          },
          {
            ...model.graph!.nodes[0],
            nodeId: 'node-merge',
            anchorId: 'node:node-merge',
            route: '/node/node-merge',
            title: 'Merged node',
            titleEn: 'Merged node',
            primaryPaperTitle: 'Paper 5',
            primaryPaperId: 'paper-5',
            paperIds: ['paper-5'],
            parentNodeIds: ['node-left', 'node-center', 'node-right'],
            stageIndex: 2,
            layoutHint: {
              column: 2,
              span: 1,
              row: 2,
              emphasis: 'merge' as const,
              laneIndex: 0,
              branchIndex: null,
              isMainline: true,
              side: 'center' as const,
            },
          },
        ]

        model.graph!.lanes = [
          {
            id: 'lane-main',
            laneIndex: 0,
            branchIndex: null,
            isMainline: true,
            side: 'center',
            color: '#7d1938',
            roleLabel: 'Mainline',
            label: 'Mainline',
            labelEn: 'Mainline',
            legendLabel: 'Mainline Mainline',
            legendLabelEn: 'Mainline Mainline',
            description: 'Mainline',
            periodLabel: '2026.01-2026.06',
            nodeCount: 3,
            stageCount: 2,
            latestNodeId: 'node-merge',
            latestAnchorId: 'node:node-merge',
          },
          {
            id: 'lane-left',
            laneIndex: -1,
            branchIndex: null,
            isMainline: false,
            side: 'left',
            color: '#7d1938',
            roleLabel: 'Branch',
            label: 'Left',
            labelEn: 'Left',
            legendLabel: 'Branch Left',
            legendLabelEn: 'Branch Left',
            description: 'Left branch',
            periodLabel: '2026.04-2026.06',
            nodeCount: 1,
            stageCount: 1,
            latestNodeId: 'node-left',
            latestAnchorId: 'node:node-left',
          },
          {
            id: 'lane-right',
            laneIndex: 1,
            branchIndex: null,
            isMainline: false,
            side: 'right',
            color: '#7d1938',
            roleLabel: 'Branch',
            label: 'Right',
            labelEn: 'Right',
            legendLabel: 'Branch Right',
            legendLabelEn: 'Branch Right',
            description: 'Right branch',
            periodLabel: '2026.04-2026.06',
            nodeCount: 1,
            stageCount: 1,
            latestNodeId: 'node-right',
            latestAnchorId: 'node:node-right',
          },
        ]
        model.graph!.nodes = graphNodes
        model.stages = [
          {
            ...model.stages[0],
            stageIndex: 1,
            trackedPaperCount: 1,
            mappedPaperCount: 1,
            nodes: [
              {
                ...model.stages[0].nodes[0],
                nodeId: 'node-root',
                anchorId: 'node:node-root',
                route: '/node/node-root',
                title: 'Root node',
                titleEn: 'Root node',
                primaryPaperTitle: 'Paper 1',
                primaryPaperId: 'paper-1',
                paperIds: ['paper-1'],
              },
            ],
          },
          {
            ...model.stages[0],
            stageIndex: 2,
            title: 'Stage 2',
            titleEn: 'Stage 2',
            branchLabel: '2026.04-2026.06',
            trackedPaperCount: 4,
            mappedPaperCount: 4,
            nodes: graphNodes.slice(1).map((node) => ({
              ...model.stages[0].nodes[0],
              nodeId: node.nodeId,
              anchorId: node.anchorId,
              route: node.route,
              title: node.title,
              titleEn: node.titleEn,
              primaryPaperTitle: node.primaryPaperTitle,
              primaryPaperId: node.primaryPaperId,
              paperIds: node.paperIds,
            })),
          },
        ]
        model.papers = [1, 2, 3, 4, 5].map((index) => ({
          ...model.papers[0],
          paperId: `paper-${index}`,
          anchorId: `paper:paper-${index}`,
          route: `/topic/topic-1?anchor=paper%3Apaper-${index}`,
          title: `Paper ${index}`,
          titleEn: `Paper ${index}`,
        }))

        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()

    const stageMap = screen.getByTestId('topic-stage-map')
    const canvas = screen.getByTestId('topic-stage-map-canvas')

    expect(within(stageMap).getAllByRole('link', { name: 'Open article' })).toHaveLength(5)
    expect(Number.parseFloat(canvas.style.width)).toBeGreaterThan(800)
    expect(Number.parseFloat(canvas.style.width)).toBeLessThan(1400)
    expect(Number.parseFloat(canvas.style.minHeight)).toBeGreaterThan(420)
  })

  it('expands stage height when backend stage editorial text is longer than a single node card', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        model.stages[0]!.editorial.summary = Array(8)
          .fill('This stage explanation stays backend-authored and must remain fully visible inside the horizontal stage rail.')
          .join(' ')
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(
      await screen.findByRole('heading', { name: 'Topic title', level: 1 }),
    ).toBeVisible()

    const stageBand = screen.getByTestId('topic-stage-band-1')
    expect(Number.parseFloat(stageBand.style.height)).toBeGreaterThan(260)
  })

  it('trusts backend-provided node summaries, stage overviews, and lane labels directly', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const model = makeTopicViewModel(3)
        model.graph.lanes[0]!.label = 'Backend lane label'
        model.graph.lanes[0]!.labelEn = 'Backend lane label'
        model.graph.lanes[0]!.legendLabel = 'Backend lane label'
        model.graph.lanes[0]!.legendLabelEn = 'Backend lane label'
        model.graph.nodes[0]!.summary = 'Backend node summary stays authoritative'
        model.graph.nodes[0]!.explanation = 'Backend node explanation fallback'
        model.graph.nodes[0]!.cardEditorial.digest = 'Digest that TopicPage must ignore'
        model.graph.nodes[0]!.cardEditorial.whyNow = 'Why-now text that TopicPage must ignore'
        model.timeline!.stages[0]!.editorial.summary = 'Timeline stage summary that TopicPage must ignore'
        model.timeline!.stages[0]!.description = 'Timeline description that TopicPage must ignore'
        model.stages[0]!.editorial.summary = 'Backend stage editorial summary'
        model.stages[0]!.description = 'Stage description that TopicPage must ignore'
        model.stages[0]!.nodes[0]!.summary = model.graph.nodes[0]!.summary
        model.stages[0]!.nodes[0]!.explanation = model.graph.nodes[0]!.explanation
        model.stages[0]!.nodes[0]!.editorial.digest = 'Stage node digest that TopicPage must ignore'
        model.stages[0]!.nodes[0]!.editorial.whyNow = 'Stage node why-now that TopicPage must ignore'
        return model
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    const heading = await screen.findByRole('heading', { name: 'Topic title', level: 1 })
    expect(heading).toBeVisible()

    const stageMap = screen.getByTestId('topic-stage-map')

    expect(screen.getByText('Backend lane label')).toBeVisible()
    expect(within(stageMap).getByText('Backend stage editorial summary')).toBeVisible()
    expect(within(stageMap).getByText(/Backend node summary/)).toBeVisible()

    expect(screen.queryByText('Digest that TopicPage must ignore')).not.toBeInTheDocument()
    expect(screen.queryByText('Why-now text that TopicPage must ignore')).not.toBeInTheDocument()
    expect(within(stageMap).queryByText('Timeline stage summary that TopicPage must ignore')).not.toBeInTheDocument()
    expect(within(stageMap).queryByText('Timeline description that TopicPage must ignore')).not.toBeInTheDocument()
    expect(within(stageMap).queryByText('Stage description that TopicPage must ignore')).not.toBeInTheDocument()
  })
})
