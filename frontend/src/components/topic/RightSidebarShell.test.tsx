// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { ReadingWorkspaceProvider } from '@/contexts/ReadingWorkspaceContext'
import { I18nProvider } from '@/i18n'
import { makeTopicResearchBrief } from '@/test/topicResearchBrief'
import { ApiError, apiGet, apiPost } from '@/utils/api'
import { APP_STATE_STORAGE_KEYS, getTopicChatStorageKey } from '@/utils/appStateStorage'
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

function RouteProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

function renderWithProviders(
  node: ReactNode,
  initialEntry = '/topic/topic-1',
  primaryLanguage: 'en' | 'zh' = 'en',
) {
  localStorage.setItem(
    'tracemind-language-preference',
    JSON.stringify({
      primary: primaryLanguage,
      secondary: primaryLanguage === 'zh' ? 'en' : 'zh',
      mode: 'monolingual',
    }),
  )
  localStorage.setItem('topic-workbench:drawer-open', '1')

  return render(
    <I18nProvider>
      <ReadingWorkspaceProvider>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <RouteProbe />
          <Routes>
            <Route path="/topic/:topicId" element={node} />
            <Route path="/favorites" element={<div data-testid="favorites-page">Favorites</div>} />
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
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
      screen.getByText('Ready for the next question'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Preparing the answer')).not.toBeInTheDocument()
  })

  it('treats malformed chat responses as contract errors and restores the draft', async () => {
    apiPostMock.mockResolvedValueOnce({
      answer: 'This payload is missing messageId and suggestedActions.',
      citations: [],
    } as any)

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByTestId('topic-workbench-open'))
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))

    const composer = await screen.findByTestId('assistant-composer-input')
    const draft = 'Keep this question if the backend contract is malformed.'
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

    expect(screen.getByTestId('assistant-send-button')).not.toBeDisabled()
  })

  it('treats malformed research brief responses as contract errors', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/model-capabilities') {
        throw new Error('model capabilities unavailable')
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return {
          topicId: 'topic-1',
        } as any
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    await ensureWorkbenchVisible()
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))

    expect(await screen.findByTestId('topic-research-intel-error')).toHaveTextContent(
      'The workbench could not refresh the topic intelligence just now.',
    )
    expect(screen.getByTestId('topic-research-intel-retry')).toBeInTheDocument()
    expect(screen.getByTestId('topic-guidance-ledger-card')).toBeVisible()
    expect(screen.getByTestId('topic-research-world-card')).toBeVisible()
    expect(screen.getByTestId('topic-workbench-pulse-card')).toBeVisible()
  })

  it('restores and persists topic chat state through the shared storage key', async () => {
    sessionStorage.setItem(
      APP_STATE_STORAGE_KEYS.readingWorkspace,
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
    localStorage.setItem(
      getTopicChatStorageKey('topic-1'),
      JSON.stringify({
        currentThreadId: 'thread-1',
        threads: [
          {
            id: 'thread-1',
            title: 'Existing thread',
            createdAt: '2026-04-08T00:00:00.000Z',
            updatedAt: '2026-04-08T00:00:00.000Z',
            draft: 'Persisted draft',
            messages: [
              {
                id: 'assistant-1',
                role: 'assistant',
                content: 'Persisted answer',
                createdAt: '2026-04-08T00:00:00.000Z',
              },
            ],
          },
        ],
      }),
    )

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    expect(await screen.findByTestId('assistant-composer-input')).toHaveValue('Persisted draft')
    expect(screen.getByText('Persisted answer')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('assistant-composer-input'), {
      target: { value: 'Updated draft' },
    })

    await waitFor(() => {
      const stored = localStorage.getItem(getTopicChatStorageKey('topic-1'))
      expect(stored).toContain('"draft":"Updated draft"')
    })
  })

  it('re-renders immediately when the workbench is opened from the floating launcher', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
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

  it('opens the unified research tab for legacy research deep links', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
      '/topic/topic-1?workbench=assistant&focus=research',
    )

    expect(await screen.findByTestId('workbench-research-panel')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/topic/topic-1')
    })
  })

  it('keeps the sustained research cards visible inside the research tab workspace', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        researchBrief={makeTopicResearchBrief((brief) => {
          brief.world.summary.currentFocus = 'Stabilize the current thesis before widening the branch map.'
        })}
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
      '/topic/topic-1?workbench=research',
    )

    expect(await screen.findByTestId('workbench-research-panel')).toBeInTheDocument()
    expect(await screen.findByTestId('topic-research-session-card')).toBeVisible()
    expect(await screen.findByTestId('topic-research-intel')).toBeVisible()
    expect(await screen.findByTestId('topic-guidance-ledger-card')).toBeVisible()
    expect(await screen.findByTestId('topic-research-world-card')).toBeVisible()
    expect(await screen.findByTestId('topic-workbench-pulse-card')).toBeVisible()
  })

  it('hydrates selected evidence from the URL in the real sidebar resources view', async () => {
    const modelRequest = createDeferred<unknown>()
    const evidenceRequest = createDeferred<unknown>()
    const evidencePayload = {
      anchorId: 'figure:ok',
      type: 'figure',
      route: '/node/node-1?evidence=figure%3Aok',
      title: 'Figure title',
      label: 'Figure 1',
      quote: 'The figure establishes the stable evidence anchor.',
      content: 'The figure establishes the stable evidence anchor.',
      whyItMatters: 'This is the strongest current evidence signal.',
    }

    apiGetMock.mockImplementation((path: string) => {
      if (path === '/api/model-capabilities') {
        return modelRequest.promise
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return Promise.reject(new Error('research brief unavailable'))
      }

      if (path === '/api/evidence/figure%3Aok') {
        return evidenceRequest.promise
      }

      return Promise.reject(new Error(`Unexpected GET ${path}`))
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
      '/topic/topic-1?evidence=figure%3Aok',
    )

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/api/model-capabilities')
    })
    await act(async () => {
      modelRequest.reject(new Error('model capabilities unavailable'))
      await modelRequest.promise.catch(() => undefined)
    })

    await ensureWorkbenchVisible()
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))
    fireEvent.click(screen.getByTestId('sidebar-tab-research'))
    fireEvent.click(screen.getByTestId('workbench-research-view-resources'))

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/api/evidence/figure%3Aok')
    })
    await act(async () => {
      evidenceRequest.resolve(evidencePayload)
      await evidenceRequest.promise
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(await screen.findByTestId('topic-resources-panel')).toBeVisible()
    expect(screen.getByText('Current Evidence')).toBeInTheDocument()
    expect(screen.getByText('Figure 1')).toBeInTheDocument()
    expect(screen.getByText('This is the strongest current evidence signal.')).toBeInTheDocument()
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/topic/topic-1?evidence=figure%3Aok')
  })

  it('removes the evidence query param when real sidebar evidence hydration fails', async () => {
    const modelRequest = createDeferred<unknown>()
    const evidenceRequest = createDeferred<unknown>()

    apiGetMock.mockImplementation((path: string) => {
      if (path === '/api/model-capabilities') {
        return modelRequest.promise
      }

      if (path === '/api/topics/topic-1/research-brief') {
        return Promise.reject(new Error('research brief unavailable'))
      }

      if (path === '/api/evidence/figure%3Abroken') {
        return evidenceRequest.promise
      }

      return Promise.reject(new Error(`Unexpected GET ${path}`))
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
      '/topic/topic-1?evidence=figure%3Abroken',
    )

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/api/model-capabilities')
    })
    await act(async () => {
      modelRequest.reject(new Error('model capabilities unavailable'))
      await modelRequest.promise.catch(() => undefined)
    })

    await ensureWorkbenchVisible()

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/api/evidence/figure%3Abroken')
    })
    await act(async () => {
      evidenceRequest.reject(new Error('broken evidence payload'))
      await evidenceRequest.promise.catch(() => undefined)
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/topic/topic-1')
    })
    expect(screen.getByTestId('route-probe')).not.toHaveTextContent('evidence=')
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
        researchBrief={makeTopicResearchBrief()}
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    const quickAction = (
      await within(screen.getByTestId('topic-workbench-scroll')).findAllByRole('button')
    )[0]
    fireEvent.click(quickAction)

    expect(screen.getByTestId('assistant-composer-input')).toHaveValue(
      'Start by explaining which nodes, evidence, and branches are most worth reading first.',
    )
  })

  it('sends agent briefs and attached text materials through the unified workbench payload', async () => {
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
      messageId: 'assistant-material-1',
      answer: 'I absorbed the uploaded note and will keep that constraint in later turns.',
      citations: [],
      suggestedActions: [],
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    fireEvent.change(screen.getByTestId('assistant-agent-brief-input'), {
      target: { value: 'Keep the next answer constrained to deployment risks and failure modes.' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sources' }))
    const materialInput = screen.getByTestId('assistant-material-input')
    const noteFile = new File(
      ['Failure mode taxonomy\nSensor blackout\nPlanner latency spike\nRecovery envelope'],
      'deployment-notes.md',
      { type: 'text/markdown' },
    )

    fireEvent.change(materialInput, { target: { files: [noteFile] } })

    await waitFor(() => {
      expect(screen.getByText('deployment-notes.md')).toBeInTheDocument()
      expect(screen.getAllByText(/Failure mode taxonomy/i).length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getByTestId('assistant-composer-input'), {
      target: { value: 'What should the backend agent verify next?' },
    })
    fireEvent.click(screen.getByTestId('assistant-send-button'))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/topics/topic-1/chat',
        expect.objectContaining({
          question: 'What should the backend agent verify next?',
          workbench: expect.objectContaining({
            agentBrief: 'Keep the next answer constrained to deployment risks and failure modes.',
            materials: [
              expect.objectContaining({
                kind: 'text',
                name: 'deployment-notes.md',
              }),
            ],
          }),
        }),
      )
    })

    expect((await screen.findAllByText('Agent brief')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Materials( sent)?/).length).toBeGreaterThan(0)
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
        researchBrief={makeTopicResearchBrief()}
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    fireEvent.click(
      (
        await within(screen.getByTestId('topic-workbench-scroll')).findAllByRole('button')
      )[0],
    )
    fireEvent.click(screen.getByTestId('assistant-send-button'))

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/topics/topic-1/chat',
        expect.objectContaining({
          question: expect.stringContaining('nodes, evidence, and branches'),
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

  it('supports enter-to-send and arrow-key draft history in the unified composer', async () => {
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
      messageId: 'assistant-history-1',
      answer: 'First answer.',
      citations: [],
      suggestedActions: [],
    })
    apiPostMock.mockResolvedValueOnce({
      messageId: 'assistant-history-2',
      answer: 'Second answer.',
      citations: [],
      suggestedActions: [],
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    const composer = (await screen.findByTestId('assistant-composer-input')) as HTMLTextAreaElement

    fireEvent.change(composer, { target: { value: 'First prompt' } })
    composer.setSelectionRange(composer.value.length, composer.value.length)
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenNthCalledWith(
        1,
        '/api/topics/topic-1/chat',
        expect.objectContaining({ question: 'First prompt' }),
      )
    })
    await waitFor(() => {
      expect(composer).toHaveValue('')
    })

    fireEvent.change(composer, { target: { value: 'Second prompt' } })
    composer.setSelectionRange(composer.value.length, composer.value.length)
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenNthCalledWith(
        2,
        '/api/topics/topic-1/chat',
        expect.objectContaining({ question: 'Second prompt' }),
      )
    })
    await waitFor(() => {
      expect(composer).toHaveValue('')
    })

    composer.setSelectionRange(0, 0)
    fireEvent.keyDown(composer, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(composer).toHaveValue('Second prompt')

    composer.setSelectionRange(0, 0)
    fireEvent.keyDown(composer, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(composer).toHaveValue('First prompt')

    composer.setSelectionRange(composer.value.length, composer.value.length)
    fireEvent.keyDown(composer, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(composer).toHaveValue('Second prompt')

    composer.setSelectionRange(composer.value.length, composer.value.length)
    fireEvent.keyDown(composer, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(composer).toHaveValue('')
  })

  it('consumes workbench command routes by navigating to the research notebook surface', async () => {
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

    apiPostMock.mockResolvedValueOnce({
      messageId: 'assistant-export-1',
      answer: 'Queued a research dossier export.',
      citations: [],
      suggestedActions: [],
      workbenchAction: {
        kind: 'export-dossier',
        summary: 'Queued a research dossier export.',
        targetRoute: '/favorites?topic=topic-1',
      },
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    const composer = await screen.findByTestId('assistant-composer-input')
    fireEvent.change(composer, { target: { value: 'export dossier' } })
    fireEvent.click(screen.getByTestId('assistant-send-button'))

    await waitFor(() => {
      expect(screen.getByTestId('favorites-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/favorites?topic=topic-1')
  })

  it('auto-opens the workbench by default on ultra-wide first visit', async () => {
    vi.stubGlobal('innerWidth', 1800)

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
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
          workbench: expect.objectContaining({
            contextItems: expect.arrayContaining(['Current reading focus: Node focus — Current node locus']),
          }),
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
        return makeTopicResearchBrief()
      }

      throw new Error(`Unexpected GET ${path}`)
    })

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        suggestedQuestions={[]}
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

  it('surfaces the latest user steering from session memory inside the workbench pulse card', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        researchBrief={makeTopicResearchBrief((brief) => {
          brief.sessionMemory.summary.lastUserIntent =
            'Prioritize the benchmark mismatch before expanding the branch map.'
        })}
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    await ensureWorkbenchVisible()
    fireEvent.click(await screen.findByRole('button', { name: 'Show' }))

    expect(await screen.findByTestId('topic-workbench-pulse-card')).toBeVisible()
    expect(await screen.findByTestId('topic-workbench-latest-user-intent')).toHaveTextContent(
      'Prioritize the benchmark mismatch before expanding the branch map.',
    )
  })

  it('keeps compact map workbench unified across assistant and research while only showing the composer on assistant', async () => {
    const repeatedSummary =
      'This line should stay on the topic page instead of being repeated inside the compact map workbench.'

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        researchBrief={makeTopicResearchBrief((brief) => {
          brief.world.summary.currentFocus = repeatedSummary
        })}
        suggestedQuestions={[]}
        references={[
          {
            paperId: 'paper-1',
            title: 'Paper one',
            titleEn: 'Paper one',
            route: '/node/node-1?anchor=paper%3Apaper-1',
            authors: ['Author'],
            pdfUrl: 'https://example.com/paper-1.pdf',
          },
        ]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
        surfaceMode="map"
      />,
    )

    await ensureWorkbenchVisible()

    expect(screen.getByTestId('sidebar-tab-assistant')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-tab-research')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-tab-notes')).not.toBeInTheDocument()
    expect(screen.getByTestId('assistant-composer-input')).toBeInTheDocument()
    expect(screen.queryByText(repeatedSummary)).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('sidebar-tab-research'))

    await waitFor(() => {
      expect(screen.queryByTestId('assistant-composer-input')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('workbench-research-view-search')).toBeInTheDocument()
    expect(screen.getByTestId('workbench-research-view-resources')).toBeInTheDocument()
    expect(screen.getByTestId('workbench-research-view-references')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('workbench-research-view-resources'))
    expect(await screen.findByTestId('topic-resources-panel')).toBeVisible()

    fireEvent.click(screen.getByTestId('workbench-research-view-references'))

    expect(await screen.findByTestId('workbench-references-panel')).toBeVisible()
    expect(screen.getByText('Paper one')).toBeVisible()
    expect(screen.queryByTestId('assistant-composer-input')).not.toBeInTheDocument()
  })

  it('keeps the compact map empty state to a single actionable prompt', async () => {
    const latestDirective = 'Tighten the evidence chain before expanding the branch map.'
    const hiddenQuestion = 'Should stay hidden once the compact action is chosen'

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        researchBrief={makeTopicResearchBrief((brief) => {
          brief.guidance.latestApplication = {
            appliedAt: '2026-04-16T00:00:00.000Z',
            stageIndex: 2,
            summary: latestDirective,
            directives: [],
          }
          brief.world.agenda = [
            {
              id: 'agenda-1',
              kind: 'strengthen-node-evidence',
              targetType: 'topic',
              targetId: 'topic-1',
              title: 'Compare branch evidence',
              rationale: 'Keep the map grounded before adding new branches.',
              priorityScore: 0.82,
              suggestedPrompt: 'Compare branch evidence before adding more nodes.',
              status: 'queued',
            },
          ]
        })}
        suggestedQuestions={[hiddenQuestion]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
        surfaceMode="map"
      />,
    )

    await ensureWorkbenchVisible()

    expect(await screen.findByText(latestDirective)).toBeVisible()
    expect(screen.queryByText(hiddenQuestion)).not.toBeInTheDocument()
    expect(screen.queryByText('Compare branch evidence before adding more nodes.')).not.toBeInTheDocument()
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

  it('keeps reading mode on a single assistant workbench without reviving the old research panel', async () => {
    sessionStorage.setItem(
      'reading-workspace:v1',
      JSON.stringify({
        trail: [],
        pageScroll: {},
        workbenchByTopic: {
          'topic-1': {
            open: true,
            activeTab: 'research',
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

    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        researchBrief={makeTopicResearchBrief((brief) => {
          brief.world.summary.currentFocus = 'Keep the reading surface focused on evidence and references.'
        })}
        suggestedQuestions={['Should stay hidden in reading mode']}
        references={[
          {
            paperId: 'paper-1',
            title: 'Paper one',
            titleEn: 'Paper one',
            route: '/node/node-1?anchor=paper%3Apaper-1',
            authors: ['Author'],
            pdfUrl: 'https://example.com/paper-1.pdf',
          },
        ]}
        resources={[
          {
            id: 'node-resource-1',
            title: 'Figure anchor',
            subtitle: 'Node evidence',
            description: 'Evidence resource for the current node.',
            kind: 'node',
            route: '/node/node-1?evidence=figure%3Apaper-1-fig-1',
          },
        ]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
        surfaceMode="reading"
      />,
    )

    expect(await screen.findByTestId('assistant-composer-input')).toBeVisible()
    // Type in composer to reveal the reading panels (revealReadingPanels requires draft, messages, or materials)
    fireEvent.change(screen.getByTestId('assistant-composer-input'), {
      target: { value: 'test' },
    })

    expect(screen.queryByTestId('workbench-research-panel')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workbench-research-view-search')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workbench-research-view-references')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workbench-research-view-resources')).not.toBeInTheDocument()
    expect(await screen.findByTestId('workbench-references-panel')).toBeVisible()
    expect(screen.getByText('Figure anchor')).toBeVisible()
    expect(screen.queryByTestId('sidebar-tab-assistant')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-tab-research')).not.toBeInTheDocument()
    expect(screen.queryByText('Should stay hidden in reading mode')).not.toBeInTheDocument()
    expect(screen.queryByText('Context intake')).not.toBeInTheDocument()
    expect(screen.queryByText('Search')).not.toBeInTheDocument()
    expect(screen.queryByText('Reason')).not.toBeInTheDocument()
    expect(screen.queryByText('Balanced')).not.toBeInTheDocument()
    expect(screen.queryByText('Context')).not.toBeInTheDocument()
    expect(screen.queryByText('No pinned context')).not.toBeInTheDocument()
    expect(screen.queryByText('Add selection')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Use the suggestions below to continue from the current topic without repeating the page body.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Focus')).toBeVisible()
    expect(screen.getByText('Uploads')).toBeVisible()
  })

it('localizes the compact reading workbench copy', async () => {
    renderWithProviders(
      <RightSidebarShell
        topicId="topic-1"
        topicTitle="Reliability topic"
        researchBrief={makeTopicResearchBrief()}
        suggestedQuestions={[]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onOpenSearchResult={vi.fn()}
        surfaceMode="reading"
      />,
      '/topic/topic-1',
      'zh',
    )

    expect(await screen.findByTestId('assistant-composer-input')).toBeVisible()
    expect(screen.getByText('聚焦')).toBeVisible()
    expect(screen.getByText('资料')).toBeVisible()
    expect(screen.getByText('Enter 发送 | Shift+Enter 换行 | 上/下切换草稿')).toBeVisible()
    expect(screen.queryByText('Guide agent')).not.toBeInTheDocument()
  })
})
