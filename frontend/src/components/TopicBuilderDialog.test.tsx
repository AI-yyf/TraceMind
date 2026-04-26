// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { invalidateProductCopyCache } from '@/hooks/useProductCopy'
import { TopicBuilderDialog } from './TopicBuilderDialog'

function renderDialog() {
  return render(
    <I18nProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TopicBuilderDialog open onClose={() => undefined} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('TopicBuilderDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(
      'tracemind-language-preference',
      JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
    )
    invalidateProductCopyCache(null)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.includes('/api/prompt-templates/studio')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                productCopies: [],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (url.includes('/api/model-capabilities')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                userId: 'test-user',
                slots: {
                  language: {
                    configured: true,
                    provider: 'openai_compatible',
                    model: 'kimi-k2.5',
                    capability: null,
                    apiKeyStatus: 'configured',
                  },
                  multimodal: {
                    configured: false,
                    provider: null,
                    model: null,
                    capability: null,
                    apiKeyStatus: 'missing',
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (url.includes('/api/topic-gen/preview') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                nameZh: '偏好优化研究',
                nameEn: 'Preference Optimization Research',
                keywords: [
                  { zh: '偏好优化', en: 'preference optimization' },
                  { zh: '对齐', en: 'alignment' },
                ],
                summary: 'A stable mainline for preference optimization research.',
                summaryZh: '一条稳定的偏好优化研究主线。',
                summaryEn: 'A stable mainline for preference optimization research.',
                recommendedStages: 3,
                focusLabel: 'Optimization under limited preference signals',
                focusLabelZh: '有限偏好信号下的优化',
                focusLabelEn: 'Optimization under limited preference signals',
                primaryLanguage: 'en',
                locales: {
                  en: {
                    name: 'Preference Optimization Research',
                    summary: 'A stable mainline for preference optimization research.',
                    focusLabel: 'Optimization under limited preference signals',
                    description: 'English preview locale',
                  },
                  zh: {
                    name: '偏好优化研究',
                    summary: '一条稳定的偏好优化研究主线。',
                    focusLabel: '有限偏好信号下的优化',
                    description: '中文预览',
                  },
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (url.includes('/api/prompt-templates/runtime')) {
          return new Response(
            JSON.stringify({ success: true, data: { defaultLanguage: 'en' } }),
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
    invalidateProductCopyCache(null)
    vi.unstubAllGlobals()
  })

  it('renders the builder and preview structure in English when the primary language is English', async () => {
    renderDialog()

    expect(await screen.findByText('Build a New Topic')).toBeInTheDocument()
    expect(screen.getByText('Generate Preview')).toBeInTheDocument()

    fireEvent.change(screen.getByTestId('create-topic-description'), {
      target: {
        value:
          'Track how preference optimization methods diverge once they move beyond RLHF and start trading off data, stability, and alignment guarantees.',
      },
    })

    fireEvent.click(screen.getByTestId('create-topic-preview'))

    await waitFor(() => {
      expect(screen.getByText('Summary')).toBeInTheDocument()
      expect(screen.getByText('Keywords')).toBeInTheDocument()
      expect(screen.getByText('Structure')).toBeInTheDocument()
      expect(screen.getByText(/Chinese Anchor Summary/u)).toBeInTheDocument()
      expect(screen.getByText(/English Anchor Summary/u)).toBeInTheDocument()
      expect(screen.getByText(/Recommended Stages/u)).toBeInTheDocument()
    })
  })
})
