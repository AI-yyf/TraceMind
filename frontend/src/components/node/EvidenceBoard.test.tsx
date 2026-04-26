// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { EvidenceExplanation } from '@/types/alpha'
import { EvidenceBoard } from './EvidenceBoard'

describe('EvidenceBoard', () => {
  it('renders formula evidence with a single clean snippet and localized metadata', () => {
    const evidence: EvidenceExplanation[] = [
      {
        anchorId: 'formula:paper-1:eq-2',
        type: 'formula',
        route: '/node/node-1?evidence=formula%3Apaper-1-eq-2',
        title: 'Mass-energy equivalence',
        label: 'Eq. (2)',
        quote: 'E = mc^2',
        content: 'E = mc^2',
        formulaLatex: 'E = mc^2',
        page: 12,
        importance: 9,
        whyItMatters: 'Connects mass and energy in the node-level argument.',
      },
    ]

    render(<EvidenceBoard evidence={evidence} language="zh" />)

    expect(screen.getByTestId('node-evidence-board')).toBeVisible()
    expect(screen.getByText('证据')).toBeInTheDocument()
    expect(screen.getAllByText('公式')).toHaveLength(2)
    expect(screen.getByText('第 12 页')).toBeInTheDocument()
    expect(screen.getByText('核心证据')).toBeInTheDocument()
    expect(screen.getAllByText('E = mc^2')).toHaveLength(1)
    expect(
      screen.getByText('Connects mass and energy in the node-level argument.'),
    ).toBeInTheDocument()
  })
})
