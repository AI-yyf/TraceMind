import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { makeTopicResearchExportBundle } from '@/test/topicResearchBrief'
import { useWorkbenchChat } from './WorkbenchChatEngine'

vi.mock('@/utils/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number

    constructor(message: string, statusCode = 500) {
      super(message)
      this.name = 'ApiError'
      this.statusCode = statusCode
    }
  },
}))

vi.mock('@/utils/omniRuntimeCache', () => ({
  fetchTopicResearchBrief: vi.fn(),
  invalidateTopicResearchBrief: vi.fn(),
}))

vi.mock('@/hooks/useProductCopy', () => ({
  useProductCopy: () => ({
    copy: (_key: string, fallback: string) => fallback,
  }),
}))

vi.mock('@/hooks', () => ({
  useFavorites: () => ({
    favorites: [],
    addFavorite: vi.fn(),
  }),
}))

const mockedApiModule = await import('@/utils/api')
const mockApiGet = vi.mocked(mockedApiModule.apiGet)
const mockApiPost = vi.mocked(mockedApiModule.apiPost)

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider>{children}</I18nProvider>
    </MemoryRouter>
  )
}

describe('useWorkbenchChat', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    window.localStorage.clear()
  })

  it('sends a plain question plus a structured workbench payload to topic chat', async () => {
    mockApiPost.mockResolvedValue({
      messageId: 'msg-1',
      answer: 'Grounded answer',
      citations: [],
      suggestedActions: [],
    })

    const { result } = renderHook(
      () =>
        useWorkbenchChat(
          'topic-1',
          'Autonomous Driving World Models',
          null,
          vi.fn(),
          vi.fn(),
          'deep',
          true,
          true,
          [
            {
              id: 'node-pill',
              kind: 'node',
              label: 'Node focus',
              description: 'Current node locus',
            },
          ],
          {
            id: 'focus-pill',
            kind: 'selection',
            label: 'Quoted passage',
            description: 'A current reading selection',
          },
        ),
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.sendQuestion('  What changed after reading this evidence?  ')
    })

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith('/api/topics/topic-1/chat', {
      question: 'What changed after reading this evidence?',
      workbench: {
        controls: {
          responseStyle: 'deep',
          reasoningEnabled: true,
          retrievalEnabled: true,
        },
        contextItems: [
          'Current reading focus: Quoted passage - A current reading selection',
          'Node focus: Current node locus',
        ],
      },
    })
    expect(result.current.currentThread.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(result.current.currentThread.messages[0]?.content).toBe(
      'What changed after reading this evidence?',
    )
  })

  it('surfaces export bundle contract drift instead of silently falling back', async () => {
    mockApiGet.mockResolvedValue(
      makeTopicResearchExportBundle((bundle) => {
        bundle.stageDossiers[0]!.nodeIds[0] = 'node-missing'
      }) as never,
    )

    const { result } = renderHook(
      () =>
        useWorkbenchChat(
          'topic-1',
          'Autonomous Driving World Models',
          null,
          vi.fn(),
          vi.fn(),
          'deep',
          true,
          true,
          [],
          null,
        ),
      { wrapper: Wrapper },
    )

    let exported = true
    await act(async () => {
      exported = await result.current.exportResearchDossier()
    })

    expect(exported).toBe(false)
    expect(mockApiGet).toHaveBeenCalledWith('/api/topics/topic-1/export-bundle')
    expect(result.current.dossierExportError).toMatch(/references missing topic node "node-missing"/i)
  })
})
