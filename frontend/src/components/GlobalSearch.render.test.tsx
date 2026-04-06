// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { I18nProvider } from '@/i18n'
import { GlobalSearch } from './GlobalSearch'

vi.mock('@/utils/api', () => ({
  apiGet: vi.fn(),
}))

vi.mock('@/hooks/useProductCopy', () => ({
  useProductCopy: () => ({
    copy: (_id: string, fallback: string) => fallback,
  }),
}))

vi.mock('@/hooks', () => ({
  useTopicRegistry: () => ({
    activeTopics: [],
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GlobalSearch render smoke test', () => {
  it('renders the search shell', () => {
    render(
      <I18nProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <GlobalSearch open onClose={vi.fn()} />
        </MemoryRouter>
      </I18nProvider>,
    )

    expect(screen.getByTestId('global-search')).toBeVisible()
  })
})
