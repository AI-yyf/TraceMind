// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const translate = (key: string, fallback?: string) => fallback ?? key

vi.mock('@/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/i18n')>('@/i18n')

  return {
    ...actual,
    useI18n: () => ({
      t: translate,
      preference: {
        primary: 'en',
        secondary: 'zh',
        mode: 'monolingual',
      },
    }),
  }
})

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
  return {
    ...actual,
    apiGet: vi.fn(),
    apiPatch: vi.fn(),
  }
})

import { apiGet } from '@/utils/api'
import { TopicManagerPage } from './TopicManagerPage'

const apiGetMock = vi.mocked(apiGet)

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TopicManagerPage />
    </MemoryRouter>,
  )
}

describe('TopicManagerPage', () => {
  beforeEach(() => {
    apiGetMock.mockReset()
  })

  it('renders topics from the wrapped backend topics payload used by the homepage', async () => {
    apiGetMock.mockResolvedValue([
      {
        id: 'autonomous-driving',
        nameZh: '自动驾驶 VLA 世界模型',
        nameEn: 'Autonomous Driving VLA World Models',
        focusLabel: 'Focus',
        summary: 'Track world-model progress for driving agents.',
        status: 'active',
        language: 'zh',
        updatedAt: '2026-04-20T12:00:00.000Z',
        paperCount: 4,
        nodeCount: 4,
        stageCount: 3,
        localization: null,
        stageConfig: {
          windowMonths: 3,
          updatedAt: '2026-04-20T12:00:00.000Z',
        },
      },
    ] as never)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('自动驾驶 VLA 世界模型')).toBeInTheDocument()
    })

    expect(screen.getByText('Track world-model progress for driving agents.')).toBeInTheDocument()
    expect(apiGetMock).toHaveBeenCalledWith('/api/topics')
  })
})
