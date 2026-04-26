// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { StoredChatMessage } from '@/types/alpha'
import { ConversationThread } from './ConversationThread'

function renderWithI18n(node: ReactNode) {
  localStorage.setItem(
    'tracemind-language-preference',
    JSON.stringify({ primary: 'en', secondary: 'zh', mode: 'monolingual' }),
  )

  return render(<I18nProvider>{node}</I18nProvider>)
}

function makeMessage(
  overrides?: Partial<StoredChatMessage>,
): StoredChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'The system absorbed your change.',
    citations: [],
    suggestedActions: [{ label: 'Explain why', action: 'explain' }],
    guidanceReceipt: {
      classification: 'focus',
      directiveId: 'directive-1',
      directiveType: 'focus',
      status: 'accepted',
      scopeLabel: 'RLHF alternatives',
      summary: 'The next run will stay on RLHF alternatives before widening the topic again.',
      effectWindow: 'next-run',
      promptHint: 'Tell me how you will handle RLHF alternatives next.',
    },
    createdAt: '2026-04-04T00:00:00.000Z',
    ...overrides,
  }
}

describe('ConversationThread guidance receipts', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it.each([
    ['suggest', 'Suggest'],
    ['focus', 'Focus'],
    ['challenge', 'Challenge'],
    ['command', 'Command'],
  ] as const)('renders the %s classification badge', (classification, label) => {
    renderWithI18n(
      <ConversationThread
        messages={[makeMessage({ guidanceReceipt: { ...makeMessage().guidanceReceipt!, classification } })]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onUsePrompt={vi.fn()}
      />,
    )

    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent(label)
    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent('Next run')
    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent('Accepted')
    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent('You raised')
    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent(
      'The next run will stay on RLHF alternatives before widening the topic again.',
    )
  })

  it('shows the receipt CTA and seeds the composer prompt without auto-sending', () => {
    const onUsePrompt = vi.fn()
    const onAction = vi.fn()

    renderWithI18n(
      <ConversationThread
        messages={[makeMessage()]}
        onOpenCitation={vi.fn()}
        onAction={onAction}
        onUsePrompt={onUsePrompt}
      />,
    )

    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent(
      'The next run will stay on RLHF alternatives before widening the topic again.',
    )
    expect(screen.getByRole('button', { name: 'Explain why' })).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('guidance-receipt-cta'))

    expect(onUsePrompt).toHaveBeenCalledWith(
      'Tell me how you will handle RLHF alternatives next.',
    )
    expect(onAction).not.toHaveBeenCalled()
  })

  it('omits the CTA when the receipt has no prompt hint', () => {
    renderWithI18n(
      <ConversationThread
        messages={[
          makeMessage({
            guidanceReceipt: {
              ...makeMessage().guidanceReceipt!,
              classification: 'command',
              promptHint: '',
            },
          }),
        ]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onUsePrompt={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('guidance-receipt-cta')).not.toBeInTheDocument()
  })

  it('surfaces the retained judgment line when the assistant answer still preserves a current thesis', () => {
    renderWithI18n(
      <ConversationThread
        messages={[
          makeMessage({
            content:
              'I will narrow the next run to RLHF alternatives. I still keep the current mainline centered on preference optimization and evidence boundaries.',
          }),
        ]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onUsePrompt={vi.fn()}
      />,
    )

    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent('I still hold')
    expect(screen.getByTestId('guidance-receipt')).toHaveTextContent(
      'I still keep the current mainline centered on preference optimization and evidence boundaries.',
    )
  })

  it('renders export actions for assistant messages when an export handler is supplied', () => {
    const onExportMessage = vi.fn()

    renderWithI18n(
      <ConversationThread
        messages={[makeMessage()]}
        onOpenCitation={vi.fn()}
        onAction={vi.fn()}
        onUsePrompt={vi.fn()}
        onExportMessage={onExportMessage}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Export Markdown' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export TXT' }))

    expect(onExportMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'assistant-1' }), 'md')
    expect(onExportMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'assistant-1' }), 'json')
    expect(onExportMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: 'assistant-1' }), 'txt')
  })
})
