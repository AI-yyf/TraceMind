// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useSystemInitMock } = vi.hoisted(() => ({
  useSystemInitMock: vi.fn(),
}))

vi.mock('@/hooks/useSystemInit', () => ({
  useSystemInit: useSystemInitMock,
}))

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

import { SystemInitCheck } from './SystemInitCheck'

function renderCheck() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SystemInitCheck>
        <div data-testid="system-ready">Ready</div>
      </SystemInitCheck>
    </MemoryRouter>,
  )
}

describe('SystemInitCheck', () => {
  beforeEach(() => {
    useSystemInitMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a clean ASCII loading fallback while initialization is checking', () => {
    useSystemInitMock.mockReturnValue({
      status: 'checking',
      config: null,
      error: null,
      checkAgain: vi.fn(),
    })

    renderCheck()

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByTestId('system-ready')).not.toBeInTheDocument()
  })

  it('shows the guarded setup checklist until topics and models are available', () => {
    const checkAgain = vi.fn()
    useSystemInitMock.mockReturnValue({
      status: 'uninitialized',
      config: {
        hasTopics: false,
        hasModelConfig: false,
        hasPromptTemplates: true,
        backendHealthy: true,
      },
      error: null,
      checkAgain,
    })

    renderCheck()

    expect(screen.getByTestId('system-init-check')).toBeInTheDocument()
    expect(screen.getByText('System Setup')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create topic' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))

    expect(checkAgain).toHaveBeenCalledTimes(1)
  })

  it('renders the protected app once initialization is ready', () => {
    useSystemInitMock.mockReturnValue({
      status: 'ready',
      config: {
        hasTopics: true,
        hasModelConfig: true,
        hasPromptTemplates: true,
        backendHealthy: true,
      },
      error: null,
      checkAgain: vi.fn(),
    })

    renderCheck()

    expect(screen.getByTestId('system-ready')).toBeInTheDocument()
  })
})
