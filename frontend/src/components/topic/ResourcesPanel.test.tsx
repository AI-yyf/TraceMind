// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'
import { ResourcesPanel } from './ResourcesPanel'

vi.mock('@/hooks/useProductCopy', () => ({
  useProductCopy: () => ({
    copy: (_copyId: string, fallback: string) => fallback,
  }),
}))

describe('ResourcesPanel', () => {
  it('renders figure evidence with an inline proof image for the workbench', () => {
    render(
      <I18nProvider>
        <ResourcesPanel
          resources={[]}
          selectedEvidence={{
            anchorId: 'figure:fig-1',
            type: 'figure',
            route: '/node/node-1?evidence=figure%3Afig-1',
            title: 'Topic figure',
            label: 'Core figure',
            quote: 'The central chart for this node.',
            content: 'A grounded visual comparison.',
            imagePath: '/uploads/paper-1/images/figure-1.png',
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('img', { name: 'Topic figure' })).toHaveAttribute(
      'src',
      expect.stringContaining('/uploads/paper-1/images/figure-1.png'),
    )
  })

  it('renders formula evidence with formula-aware presentation', () => {
    render(
      <I18nProvider>
        <ResourcesPanel
          resources={[]}
          selectedEvidence={{
            anchorId: 'formula:eq-1',
            type: 'formula',
            route: '/node/node-1?evidence=formula%3Aeq-1',
            title: 'Equation 1',
            label: 'Core equation',
            quote: 'The key equation for the node.',
            content: 'f(x)=x^2',
            formulaLatex: 'f(x)=x^2',
          }}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('Core equation')).toBeVisible()
    expect(screen.getByText('formula')).toBeVisible()
    expect(screen.getByText(/\\\[f\(x\)=x\^2\\\]/)).toBeInTheDocument()
  })
})
