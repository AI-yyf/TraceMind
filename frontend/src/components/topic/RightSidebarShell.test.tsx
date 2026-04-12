// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { I18nProvider } from '@/i18n'
import { ApiError, apiGet, apiPost } from '@/utils/api'
import { RightSidebarShell } from './RightSidebarShell'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPost: vi.fn(),
  }
})

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)

function renderWithProviders(node: ReactNode) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )
  localStorage.setItem('topic-workbench:drawer-open', '1')

  return render(
    <I18nProvider>
      <ReadingWorkspaceProvider>
        <MemoryRouter
          initialEntries={['/topic/topic-1']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/topic/:topicId" element={node} />
          </Routes>
        </MemoryRouter>
      </ReadingWorkspaceProvider>
    </I18nProvider>,
  )
}

async function ensureWorkbenchVisible() {
  const openButton = screen.queryByTestId('topic-workbench-open')
  if (openButton) {
    fireEvent.click(openButton)
  }
}

describe('RightSidebarShell failure recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    apiGetMock.mockReset()
    apiPostMock.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/model-capabilities') {
        throw new Error('model capabilities unavailable')
      }

      if (path === '/api/topics/topic-1/research-brief') {
        throw new Error('research brief unavailable')
      }

      throw new Error(`Unexpected GET ${path}`)
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('restores the draft and clears busy state after a failed chat request', async () => {
    apiPostMock.mockRejectedValueOnce(new ApiError('Provider offline', 500))

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId('topic-workbench-open'))
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))

    const composer = await screen.findByTestId('assistant-composer-input')
    const draft = 'Keep this question available if the model call fails.'

    fireEvent.change(composer, { target: { value: draft } })
    fireEvent.click(screen.getByTestId('assistant-send-button'))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/topics/topic-1/chat',
        expect.objectContaining({
          question: expect.stringContaining(draft),
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('assistant-composer-input')).toHaveValue(draft)
    })

    await new Promise((resolve) => window.setTimeout(resolve, 180))

    expect(screen.getByTestId('assistant-composer-input')).toHaveValue(draft)
    expect(screen.getByTestId('topic-research-intel-error')).toHaveTextContent(
      'The workbench could not refresh the topic intelligence just now.',
    )
    expect(screen.getByTestId('topic-research-intel-retry')).toBeInTheDocument()
    expect(
      screen.getByText('Context is ready for the next question'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Preparing the answer')).not.toBeInTheDocument()
  })

  it('re-renders immediately when the workbench is opened from the floating launcher', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId('topic-workbench-open'))

    await waitFor(() => {
      expect(screen.queryByTestId('topic-workbench-open')).not.toBeInTheDocument()
    })
  })

  it('offers localized quick actions that prefill the composer draft', async () => {
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

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    const suggestButton = await screen.findByRole('button', { name: 'Suggest' })
    fireEvent.click(suggestButton)

    expect(screen.getByTestId('assistant-composer-input')).toHaveValue(
      'I suggest that your next research run strengthen the weakest point in the current mainline and explain why that shift matters.',
    )
  })

  it('sends a quick action through chat and renders the returned guidance receipt', async () => {
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

    apiPostMock.mockResolvedValueOnce({
      messageId: 'assistant-guidance-1',
      answer: 'I accept your request and will strengthen the weakest point in the current mainline next.',
      citations: [],
      suggestedActions: [],
      guidanceReceipt: {
        classification: 'suggest',
        directiveId: 'guidance-1',
        directiveType: 'suggest',
        status: 'accepted',
        scopeLabel: 'Current topic',
        summary:
          'Accepted as an editorial preference for Current topic: strengthen the weakest point in the current mainline.',
        effectWindow: 'next-run',
        promptHint: 'Please explain how this will change the next research pass.',
      },
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Suggest' }))
    fireEvent.click(screen.getByTestId('assistant-send-button'))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/topics/topic-1/chat',
        expect.objectContaining({
          question: expect.stringContaining(
            'I suggest that your next research run strengthen the weakest point in the current mainline and explain why that shift matters.',
          ),
        }),
      )
    })

    const receipt = await screen.findByTestId('guidance-receipt')
    expect(within(receipt).getByText('Guidance receipt')).toBeInTheDocument()
    expect(within(receipt).getByText('Suggest')).toBeInTheDocument()
    expect(within(receipt).getByText('Current topic')).toBeInTheDocument()
    expect(
      within(receipt).getByText(
        'Accepted as an editorial preference for Current topic: strengthen the weakest point in the current mainline.',
      ),
    ).toBeInTheDocument()
  })

  it('auto-opens the workbench by default on ultra-wide first visit', async () => {
    vi.stubGlobal('innerWidth', 1800)

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.queryByTestId('topic-workbench-open')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('right-sidebar-shell')).toBeInTheDocument()
  })

  it('keeps the current reading focus visible and injects it into chat grounding by default', async () => {
    sessionStorage.setItem(
      'reading-workspace:v1',
      JSON.stringify({
        trail: [
          {
            id: 'node:node-1',
            kind: 'node',
            topicId: 'topic-1',
            nodeId: 'node-1',
            title: 'Node focus',
            route: '/node/node-1?stageMonths=1',
            updatedAt: '2026-04-08T00:00:00.000Z',
          },
        ],
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
    apiPostMock.mockResolvedValueOnce({
      messageId: 'assistant-1',
      answer: 'Grounded answer.',
      citations: [],
      suggestedActions: [],
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))
    expect(await screen.findByTestId('current-reading-focus')).toHaveTextContent('Node focus')

    fireEvent.change(screen.getByTestId('assistant-composer-input'), {
      target: { value: 'Explain the current judgment.' },
    })
    fireEvent.click(screen.getByTestId('assistant-send-button'))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/topics/topic-1/chat',
        expect.objectContaining({
          question: expect.stringContaining('Current reading focus:\n- Node focus: Current node locus'),
        }),
      )
    })
  })

  it('shows a stable empty research intel state when the topic has no durable backend intel yet', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/model-capabilities') {
        throw new Error('model capabilities unavailable')
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return {
          topicId: 'topic-1',
          session: {
            task: null,
            progress: null,
            report: null,
            active: false,
            strategy: {
              cycleDelayMs: 0,
              stageStallLimit: 0,
              reportPasses: 0,
              currentStageStalls: 0,
            },
          },
          pipeline: {
            updatedAt: null,
            lastRun: null,
            currentStage: null,
            recentHistory: [],
            globalOpenQuestions: [],
            continuityThreads: [],
            subjectFocus: {
              nodeId: null,
              paperIds: [],
              stageIndex: null,
              relatedHistory: [],
              relatedNodeActions: [],
            },
          },
          sessionMemory: {
            updatedAt: null,
            initializedAt: null,
            lastCompactedAt: null,
            summary: {
              currentFocus: '',
              continuity: '',
              establishedJudgments: [],
              openQuestions: [],
              researchMomentum: [],
              conversationStyle: '',
              lastResearchMove: '',
              lastUserIntent: '',
            },
            recentEvents: [],
          },
          world: null,
          guidance: null,
          cognitiveMemory: null,
        } as any
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    await ensureWorkbenchVisible()
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))
    expect(await screen.findByTestId('topic-research-intel-empty')).toBeVisible()
    expect(screen.getByText('No persistent intel yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This topic already has a live workbench, but the backend has not written a stable thesis, absorbed guidance, or calibration memory here yet.',
      ),
    ).toBeVisible()
  })

  it('keeps compact map workbench focused on assistant and notes, and only shows the composer on assistant', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
        surfaceMode="map"
      />,
    )

    await ensureWorkbenchVisible()

    expect(screen.getByTestId('sidebar-tab-assistant')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-tab-notes')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-tab-similar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-tab-resources')).not.toBeInTheDocument()
    expect(screen.getByTestId('assistant-composer-input')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('sidebar-tab-notes'))

    await waitFor(() => {
      expect(screen.queryByTestId('assistant-composer-input')).not.toBeInTheDocument()
    })
  })

  it('keeps context collapsed by default in compact map workbench while preserving the current reading focus summary', async () => {
    sessionStorage.setItem(
      'reading-workspace:v1',
      JSON.stringify({
        trail: [
          {
            id: 'node:node-1',
            kind: 'node',
            topicId: 'topic-1',
            nodeId: 'node-1',
            title: 'Node focus',
            route: '/node/node-1?stageMonths=1',
            updatedAt: '2026-04-08T00:00:00.000Z',
          },
        ],
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

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        selectedEvidence={null}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
        surfaceMode="map"
      />,
    )

    expect(await screen.findByText('Current focus: Node focus')).toBeVisible()
    expect(screen.queryByTestId('current-reading-focus')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Context/i }))

    expect(await screen.findByTestId('current-reading-focus')).toHaveTextContent('Node focus')
  })
})
