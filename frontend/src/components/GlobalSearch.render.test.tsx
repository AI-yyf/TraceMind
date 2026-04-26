// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '@/i18n'
import { apiGet } from '@/utils/api'
import { GlobalSearch } from './GlobalSearch'

vi.mock('@/utils/api', () => ({
  apiGet: vi.fn(),
}))

vi.mock('@/hooks/useProductCopy', () => ({
  useProductCopy: () => ({
    copy: (_id: string, fallback: string) => fallback,
  }),
}))

const apiGetMock = vi.mocked(apiGet)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GlobalSearch render smoke test', () => {
  it('renders the search shell', async () => {
    apiGetMock.mockResolvedValue([])

    render(
      <I18nProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <GlobalSearch open onClose={vi.fn()} />
        </MemoryRouter>
      </I18nProvider>,
    )
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      await Promise.resolve()
    })

    expect(screen.getByTestId('global-search')).toBeVisible()
  })
})
