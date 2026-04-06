// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/i18n')>('@/i18n')

  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, fallback?: string) => fallback ?? key,
      preference: {
        primary: 'en',
        secondary: 'zh',
        mode: 'monolingual',
      },
    }),
  }
})

import { ResearchPage } from './ResearchPage'

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ResearchPage />
    </MemoryRouter>,
  )
}

describe('ResearchPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes('/api/tasks/topics')) {
          return jsonResponse({ success: true, data: [] })
        }

        if (url.includes('/api/tasks/cron-expressions')) {
          return jsonResponse({
            success: true,
            data: [
              {
                label: 'Daily',
                value: '0 20 * * *',
                description: 'Run every day at 20:00',
              },
            ],
          })
        }

        if (/\/api\/tasks$/u.test(url)) {
          return jsonResponse({ success: true, data: [] })
        }

        return jsonResponse({ success: true, data: {} })
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders orchestration fallback copy in English when translations fall back to provided labels', async () => {
    renderPage()

    expect(
      await screen.findByText(
        'Choose one or more topics below to schedule and launch them from the same workbench.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search topics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Task queue' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search tasks, topics, or schedule cadence')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Selected topics' }))

    await waitFor(() => {
      expect(
        screen.getByText('Select topics on the left first to show only their matching tasks here.'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('No tasks match the current filters. Switch back to "All" or try another keyword.'),
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Current task' })).toBeInTheDocument()
  })
})
