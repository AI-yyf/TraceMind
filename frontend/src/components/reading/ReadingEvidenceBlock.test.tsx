// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { EvidenceExplanation } from '@/types/alpha'
import { ReadingEvidenceBlock } from './ReadingEvidenceBlock'

describe('ReadingEvidenceBlock', () => {
  it('reconstructs degraded linearized table evidence into readable entries', () => {
    const evidence: EvidenceExplanation = {
      anchorId: 'table:broken-1',
      type: 'table',
      route: '/paper/paper-1?anchor=table:broken-1',
      title: 'Table 2',
      label: 'Paper / Table 2',
      quote: '表 2',
      content: `表 2

Action Probability

58
78

159

f(a|s)
29

480

3

119

4

3

Stride of 1

8
8

32
Fully Connected Layer

Stride of 2

32

32

640`,
      page: 7,
      sourcePaperId: 'paper-1',
      sourcePaperTitle: 'Paper title',
      whyItMatters: 'It preserves the architecture-related settings captured from the paper.',
    }

    const { container } = render(
      <ReadingEvidenceBlock
        anchorId="anchor-table-broken-1"
        evidence={evidence}
        highlighted={false}
        whyItMattersLabel="Why it matters: "
      />,
    )

    expect(container.querySelector('dl')).toBeInTheDocument()
    expect(container.querySelector('pre')).not.toBeInTheDocument()
    expect(screen.getByText('Action Probability')).toBeInTheDocument()
    expect(screen.getByText('58 78 · 159')).toBeInTheDocument()
    expect(screen.getByText('Stride of 2')).toBeInTheDocument()
    expect(screen.getByText('32 · 32 · 640')).toBeInTheDocument()
  })

  it('keeps structured markdown tables as real tables', () => {
    const evidence: EvidenceExplanation = {
      anchorId: 'table:structured-1',
      type: 'table',
      route: '/paper/paper-1?anchor=table:structured-1',
      title: 'Table 1',
      label: 'Paper / Table 1',
      quote: 'Benchmark results.',
      content: 'Benchmark results.\n\nMethod | Score\n--- | ---\nOurs | 82.1',
      page: 5,
      sourcePaperId: 'paper-1',
      sourcePaperTitle: 'Paper title',
      whyItMatters: 'It verifies the main gain.',
    }

    const { container } = render(
      <ReadingEvidenceBlock
        anchorId="anchor-table-structured-1"
        evidence={evidence}
        highlighted={false}
        whyItMattersLabel="Why it matters: "
      />,
    )

    expect(container.querySelector('table')).toBeInTheDocument()
    expect(screen.getByText('Method')).toBeInTheDocument()
    expect(screen.getByText('Score')).toBeInTheDocument()
    expect(screen.getByText('Ours')).toBeInTheDocument()
    expect(screen.getByText('82.1')).toBeInTheDocument()
  })
})
