// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { I18nProvider } from '@/i18n'
import type { TopicResearchBrief, TopicViewModel } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import { TopicPage } from './TopicPage'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  }
})

vi.mock('@/components/topic/RightSidebarShell', () => ({
  RightSidebarShell: () => <div data-testid="topic-sidebar-stub" />,
}))

const apiGetMock = vi.mocked(apiGet)

function renderWithProviders(node: ReactNode, initialEntry: string, path: string) {
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
          </Routes>
        </MemoryRouter>
      </ReadingWorkspaceProvider>
    </I18nProvider>,
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
      metaRows: [],
      stats: [],
      actions: [],
    },
    stats: {
      stageCount: 1,
      nodeCount: 1,
      paperCount: 1,
      evidenceCount: 0,
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
        route: '/paper/paper-1',
        title: 'Paper title',
        titleEn: 'Paper title',
        summary: 'Paper summary',
        explanation: 'Paper explanation',
        publishedAt: '2026-02-01T00:00:00.000Z',
        authors: ['Author'],
        citationCount: 1,
        coverImage: null,
        figuresCount: 0,
        tablesCount: 0,
        formulasCount: 0,
        sectionsCount: 0,
      },
    ],
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
  return {
    topicId: 'topic-1',
  } as unknown as TopicResearchBrief
}

function makeDashboardResponse() {
  return {
    success: true,
    data: {
      topicId: 'topic-1',
      topicTitle: 'Topic title',
      researchThreads: [
        {
          stageIndex: 0,
          nodeId: 'node-1',
          nodeTitle: 'Node title',
          thesis: 'Mainline thesis',
          paperCount: 1,
          keyPaperTitle: 'Paper title',
          isMilestone: true,
        },
      ],
      methodEvolution: [],
      activeAuthors: [],
      stats: {
        totalPapers: 1,
        totalNodes: 1,
        totalStages: 1,
        timeSpanYears: 1,
        avgPapersPerNode: 1,
        citationCoverage: 1,
      },
      keyInsights: ['Insight one'],
      trends: {
        emergingTopics: [],
        decliningTopics: [],
        methodShifts: [],
      },
    },
  }
}

describe('TopicPage stage window controls', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    apiGetMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('requests the topic view model with the selected stage window and shows fixed cadence guidance', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        const stageMonths = Number(new URL(`https://example.com${path}`).searchParams.get('stageMonths') ?? '1')
        return makeTopicViewModel(stageMonths)
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return makeResearchBrief()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(await screen.findByText('Topic title')).toBeVisible()
    expect(apiGetMock).toHaveBeenCalledWith('/api/topics/topic-1/view-model?stageMonths=3')
    expect(
      screen.getByText(
        'This topic currently groups stages with a 3 months publication window. Change the cadence from Topic Management; the reading surface stays stable and does not rewrite structure here.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Manage topic cadence' })).toHaveAttribute(
      'href',
      '/manage/topics',
    )
    expect(screen.getByTestId('topic-stage-map')).toBeVisible()
    expect(screen.getByRole('link', { name: /Node title/i })).toHaveAttribute(
      'href',
      '/node/node-1?stageMonths=3',
    )
  })

  it('keeps the visible topic map dense by hiding empty placeholder stages', async () => {
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
            nodes: [],
          },
        ]
        return model
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return makeResearchBrief()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=1', '/topic/:topicId')

    const stageMap = await screen.findByTestId('topic-stage-map')

    expect(await screen.findByText('Topic title')).toBeVisible()
    expect(
      screen.getByText(
        'This topic currently groups stages with a 1 month publication window. Change the cadence from Topic Management; the reading surface stays stable and does not rewrite structure here.',
      ),
    ).toBeVisible()
    expect(within(stageMap).queryByText('This stage exists only as a future placeholder.')).not.toBeInTheDocument()
    expect(within(stageMap).queryByText('Stage 2')).not.toBeInTheDocument()
    expect(within(stageMap).getByRole('link', { name: /Node title/i })).toHaveAttribute(
      'href',
      '/node/node-1?stageMonths=1',
    )
  })

  it('reserves desktop space for the right workbench when the drawer is already open', async () => {
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

      if (path === '/api/topics/topic-1/research-brief') {
        return makeResearchBrief()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(await screen.findByText('Topic title')).toBeVisible()
    expect(screen.getByRole('main')).toHaveStyle({ paddingRight: '416px' })
  })

  it('loads dashboard lazily and supports retry after a dashboard fetch failure', async () => {
    let dashboardAttempts = 0

    apiGetMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/topics/topic-1/view-model')) {
        return makeTopicViewModel(3)
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return makeResearchBrief()
      }

      if (path === '/api/topics/topic-1/dashboard') {
        dashboardAttempts += 1
        if (dashboardAttempts === 1) {
          throw new Error('dashboard offline')
        }
        return makeDashboardResponse()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(<TopicPage />, '/topic/topic-1?stageMonths=3', '/topic/:topicId')

    expect(await screen.findByText('Topic title')).toBeVisible()
    expect(apiGetMock).not.toHaveBeenCalledWith('/api/topics/topic-1/dashboard')

    fireEvent.click(screen.getByRole('button', { name: 'Research Dashboard' }))

    expect(screen.queryByTestId('topic-stage-map')).not.toBeInTheDocument()
    expect(await screen.findByTestId('topic-dashboard-error')).toBeVisible()
    expect(screen.getByText('Dashboard data is unavailable right now.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.getByText('Insight one')).toBeVisible()
    })
    expect(screen.getByTestId('topic-dashboard-panel')).toBeVisible()
    expect(dashboardAttempts).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Research Graph' }))

    expect(await screen.findByTestId('topic-stage-map')).toBeVisible()
  })
})
