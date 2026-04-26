// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '@/i18n'
import { makeTopicViewModel } from '@/test/topicResearchBrief'
import { apiGet } from '@/utils/api'
import TodayPage from './TodayPage'

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
  }
})

const apiGetMock = vi.mocked(apiGet)

function makeBackendTopicListItem(id = 'topic-1', title = 'Topic One') {
  return {
    id,
    nameZh: id === 'topic-1' ? '主题一' : '主题二',
    nameEn: title,
    focusLabel: 'Focus',
    summary: 'Summary',
    createdAt: '2026-04-15T00:00:00.000Z',
    localization: {
      title,
    },
  }
}

function renderTodayPage() {
  return render(
    <I18nProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TodayPage />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('TodayPage', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
    window.localStorage.clear()
  })

  it('shows an explicit backend contract error when the topic list is malformed', async () => {
    apiGetMock.mockResolvedValue([
      {
        id: 'topic-1',
      },
    ] as never)

    renderTodayPage()

    await waitFor(() => {
      expect(screen.getByText(/backend topic 1 is missing "nameZh"/i)).toBeInTheDocument()
    })
  })

  it('shows an explicit backend contract error when a topic view model is malformed', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/topics') {
        return [makeBackendTopicListItem()] as never
      }

      if (path === '/api/topics/topic-1/view-model') {
        return {
          topicId: 'topic-1',
        } as never
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    renderTodayPage()

    await waitFor(() => {
      expect(screen.getByText(/topic view model is missing "schemaVersion"/i)).toBeInTheDocument()
    })
  })

  it('does not silently skip malformed topic snapshots when one backend topic drifts', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/topics') {
        return [
          makeBackendTopicListItem('topic-1', 'Topic One'),
          makeBackendTopicListItem('topic-2', 'Topic Two'),
        ] as never
      }

      if (path === '/api/topics/topic-1/view-model') {
        return makeTopicViewModel() as never
      }

      if (path === '/api/topics/topic-2/view-model') {
        return {
          topicId: 'topic-2',
        } as never
      }

      throw new Error(`Unexpected request: ${path}`)
    })

    renderTodayPage()

    await waitFor(() => {
      expect(screen.getByText(/topic view model is missing "schemaVersion"/i)).toBeInTheDocument()
    })

    expect(screen.queryByText('Topic title')).not.toBeInTheDocument()
  })
})
