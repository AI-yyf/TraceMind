// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
