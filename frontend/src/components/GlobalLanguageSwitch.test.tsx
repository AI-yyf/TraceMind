// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { GlobalLanguageSwitch } from './GlobalLanguageSwitch'

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>)
}

describe('GlobalLanguageSwitch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/prompt-templates/runtime')) {
          return new Response(
            JSON.stringify({ success: true, data: { defaultLanguage: 'zh' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('defaults to the browser language when no stored preference exists', async () => {
    renderWithI18n(<GlobalLanguageSwitch />)

    await waitFor(() => {
      expect(screen.getByTestId('language-menu-toggle')).toBeInTheDocument()
    })

    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByTestId('language-menu-toggle')).toHaveTextContent('English')
  })

  it('switches the primary language to English from the visible quick action', async () => {
    localStorage.setItem(
      'tracemind-language-preference',
      JSON.stringify({ primary: 'zh', secondary: 'en', mode: 'monolingual' }),
    )

    renderWithI18n(<GlobalLanguageSwitch />)

    await waitFor(() => expect(screen.getByTestId('language-menu-toggle')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('language-menu-toggle'))
    fireEvent.click(screen.getByTestId('language-quick-en'))

    await waitFor(() => {
      expect(screen.getByTestId('language-menu-toggle')).toHaveTextContent('English')
    })

    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('tracemind-language-preference')).toContain('"primary":"en"')
  })

  it('can turn on bilingual mode from the expanded panel', async () => {
    renderWithI18n(<GlobalLanguageSwitch />)

    await waitFor(() => expect(screen.getByTestId('language-menu-toggle')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('language-menu-toggle'))
    fireEvent.click(screen.getByTestId('language-mode-bilingual'))

    expect(localStorage.getItem('tracemind-language-preference')).toContain(
      '"mode":"bilingual"',
    )
  })

  it('supports collapsing the bottom language settings bar', async () => {
    renderWithI18n(<GlobalLanguageSwitch />)

    await waitFor(() => expect(screen.getByTestId('language-menu-toggle')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('language-menu-toggle'))
    expect(screen.getByTestId('language-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('language-collapse-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('language-panel')).not.toBeInTheDocument()
    })
  })
})
