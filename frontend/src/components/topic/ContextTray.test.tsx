// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { ContextPill } from '@/types/alpha'
import { ContextTray } from './ContextTray'

function renderTray(items: ContextPill[]) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({
      primary: 'en',
      secondary: 'zh',
      mode: 'monolingual',
    }),
  )

  return render(
    <I18nProvider>
      <ContextTray items={items} onRemove={() => {}} />
    </I18nProvider>,
  )
}

describe('ContextTray', () => {
  it('starts expanded when pinned context already exists on mount', async () => {
    const searchPill: ContextPill = {
      id: 'search:node:node-1',
      kind: 'search',
      label: 'Node search hit',
      description: 'Result promoted from topic search.',
      route: '/topic/topic-1',
    }

    renderTray([searchPill])

    expect(await screen.findByTestId('context-pill-search')).toBeVisible()
  })

  it('expands automatically when a new pinned context source is added', async () => {
    const searchPill: ContextPill = {
      id: 'search:node:node-1',
      kind: 'search',
      label: 'Node search hit',
      description: 'Result promoted from topic search.',
      route: '/topic/topic-1',
    }

    const view = renderTray([])
    view.rerender(
      <I18nProvider>
        <ContextTray items={[searchPill]} onRemove={() => {}} />
      </I18nProvider>,
    )

    expect(await screen.findByTestId('context-pill-search')).toBeVisible()
  })
})
