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
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {node}
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('PaperSectionBlock', () => {
  it('renders all paper evidence instead of truncating unembedded items', () => {
    const evidenceById = new Map<string, EvidenceExplanation>([
      [
        'figure:fig-1',
        {
          anchorId: 'figure:fig-1',
          type: 'figure',
          route: '/node/node-1?evidence=figure%3Afig-1',
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
        'formula:eq-1',
        {
          anchorId: 'formula:eq-1',
          type: 'formula',
          route: '/node/node-1?evidence=formula%3Aeq-1',
          title: 'Formula 1',
          label: 'Paper / Formula 1',
          quote: 'L = ||x-y||',
          content: 'L = ||x-y||',
          page: 3,
          sourcePaperId: 'paper-1',
          sourcePaperTitle: 'Paper title',
          formulaLatex: 'L = ||x-y||',
          whyItMatters: 'It fixes the learning objective.',
        },
      ],
      [
        'table:tab-1',
        {
          anchorId: 'table:tab-1',
          type: 'table',
          route: '/node/node-1?evidence=table%3Atab-1',
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

    expect(screen.queryByText('Methodology')).not.toBeInTheDocument()
    expect(screen.queryByText('Results Analysis')).not.toBeInTheDocument()
    expect(screen.getByText('Figure 1')).toBeInTheDocument()
    expect(screen.getByText('Formula 1')).toBeInTheDocument()
    expect(screen.getByText('Table 1')).toBeInTheDocument()
    expect(screen.getByText('It shows the model structure.')).toBeInTheDocument()
    expect(screen.getByText('It fixes the learning objective.')).toBeInTheDocument()
    expect(screen.getByText('It verifies the main gain.')).toBeInTheDocument()
    expect(
      screen.getByText('The paper leaves a clear mechanism for later work to test.'),
    ).toBeInTheDocument()
    expect(screen.getByText('结语')).toBeInTheDocument()
  })
})
