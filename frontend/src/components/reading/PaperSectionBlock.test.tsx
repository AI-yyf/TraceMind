// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/i18n'
import type { EvidenceExplanation } from '@/types/alpha'
import { PaperSectionBlock } from './PaperSectionBlock'

function renderWithProviders(node: ReactNode) {
  localStorage.setItem(
    'arxiv-chronicle-language-preference',
    JSON.stringify({ primary: 'zh', secondary: 'en', mode: 'monolingual' }),
  )

  return render(
    <I18nProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </I18nProvider>,
  )
}

describe('PaperSectionBlock', () => {
  it('renders inline figure and table evidence for subsections', () => {
    const evidenceById = new Map<string, EvidenceExplanation>([
      [
        'figure:fig-1',
        {
          anchorId: 'figure:fig-1',
          type: 'figure',
          route: '/paper/paper-1?anchor=figure:fig-1',
          title: 'Figure 1',
          label: 'Paper / Figure 1',
          quote: 'Architecture overview.',
          content: 'Architecture overview.',
          page: 2,
          sourcePaperId: 'paper-1',
          sourcePaperTitle: 'Paper title',
          imagePath: '/uploads/figure-1.png',
          whyItMatters: 'It shows the model structure.',
        },
      ],
      [
        'table:tab-1',
        {
          anchorId: 'table:tab-1',
          type: 'table',
          route: '/paper/paper-1?anchor=table:tab-1',
          title: 'Table 1',
          label: 'Paper / Table 1',
          quote: 'Benchmark results.',
          content: 'Method | Score\n--- | ---\nOurs | 82.1',
          page: 5,
          sourcePaperId: 'paper-1',
          sourcePaperTitle: 'Paper title',
          whyItMatters: 'It verifies the main gain.',
        },
      ],
    ])

    renderWithProviders(
      <PaperSectionBlock
        paperId="paper-1"
        title="Paper title"
        titleEn="Paper title"
        authors={['Ada', 'Bo']}
        publishedAt="2026-01-05T00:00:00.000Z"
        citationCount={42}
        role="origin"
        introduction="This paper establishes the baseline for the node."
        subsections={[
          {
            kind: 'method',
            title: 'Methodology',
            content: 'The method relies on a structured world model.',
            wordCount: 12,
            keyPoints: [],
            evidenceIds: ['figure:fig-1'],
          },
          {
            kind: 'results',
            title: 'Results Analysis',
            content: 'The results improve benchmark performance.',
            wordCount: 10,
            keyPoints: [],
            evidenceIds: ['table:tab-1'],
          },
        ]}
        conclusion="The paper leaves a clear mechanism for later work to test."
        anchorId="anchor-paper-1"
        referenceMap={new Map()}
        evidenceById={evidenceById}
        stageWindowMonths={1}
      />,
    )

    expect(screen.getByText('Methodology')).toBeInTheDocument()
    expect(screen.getByText('Results Analysis')).toBeInTheDocument()
    expect(screen.getByText('Figure 1')).toBeInTheDocument()
    expect(screen.getByText('Table 1')).toBeInTheDocument()
    expect(screen.getByText('It shows the model structure.')).toBeInTheDocument()
    expect(screen.getByText('It verifies the main gain.')).toBeInTheDocument()
  })
})
