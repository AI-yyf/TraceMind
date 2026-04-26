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
      route: '/node/node-1?evidence=table%3Abroken-1',
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
      route: '/node/node-1?evidence=table%3Astructured-1',
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

  it('prefers backend structured table rows when they are available', () => {
    const evidence: EvidenceExplanation = {
      anchorId: 'table:structured-backend-1',
      type: 'table',
      route: '/node/node-1?evidence=table:structured-backend-1',
      title: 'Table 3',
      label: 'Paper / Table 3',
      quote: 'Node comparison table',
      content: 'Unstructured OCR text that should not be used as the table surface.',
      page: 3,
      sourcePaperId: 'paper-1',
      sourcePaperTitle: 'Paper title',
      whyItMatters: 'It proves the backend can hand structured table data directly to the article.',
      tableHeaders: ['Method', 'ADE', 'FDE'],
      tableRows: [
        ['Mainline', '0.91', '1.42'],
        { Method: 'Branch', ADE: 1.04, FDE: 1.58 },
      ],
    }

    render(
      <ReadingEvidenceBlock
        anchorId="anchor-table-structured-backend-1"
        evidence={evidence}
        highlighted={false}
        whyItMattersLabel="Why it matters: "
      />,
    )

    expect(screen.getByText('Method')).toBeInTheDocument()
    expect(screen.getByText('ADE')).toBeInTheDocument()
    expect(screen.getByText('FDE')).toBeInTheDocument()
    expect(screen.getByText('Mainline')).toBeInTheDocument()
    expect(screen.getByText('1.42')).toBeInTheDocument()
    expect(screen.getByText('Branch')).toBeInTheDocument()
    expect(screen.getByText('1.58')).toBeInTheDocument()
  })

  it('keeps inline figures centered and visually constrained inside article flow', () => {
    const evidence: EvidenceExplanation = {
      anchorId: 'figure:inline-1',
      type: 'figure',
      route: '/node/node-1?evidence=figure%3Ainline-1',
      title: 'Figure 4',
      label: 'Paper / Figure 4',
      quote: 'Compact inline figure',
      content: 'Compact inline figure',
      page: 2,
      sourcePaperId: 'paper-1',
      sourcePaperTitle: 'Paper title',
      imagePath: '/uploads/inline-figure.png',
      whyItMatters: 'It should sit inside the article without breaking the page rhythm.',
    }

    const { container } = render(
      <ReadingEvidenceBlock
        anchorId="anchor-figure-inline-1"
        evidence={evidence}
        highlighted={false}
        whyItMattersLabel="Why it matters: "
        variant="article-inline"
      />,
    )

    const image = container.querySelector('img')
    expect(image).toBeInTheDocument()
    expect(image?.className).toContain('max-w-[72%]')
    expect(image?.className).toContain('mx-auto')
  })
})
