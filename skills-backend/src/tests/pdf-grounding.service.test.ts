import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing, buildPaperSectionRowsFromExtraction } from '../services/pdf-grounding'
import type { PDFExtractionResult } from '../services/pdf-extractor'

function createExtractionResult(overrides: Partial<PDFExtractionResult> = {}): PDFExtractionResult {
  return {
    paperId: 'paper-1',
    paperTitle: 'Structured Grounding Paper',
    pageCount: 2,
    abstract: 'Abstract paragraph.',
    fullText: 'Abstract paragraph.\nMethod body.\nResults body.',
    pages: [
      { pageNumber: 1, text: 'Abstract paragraph.\nMethod body.', blocks: [] },
      { pageNumber: 2, text: 'Results body.', blocks: [] },
    ],
    figures: [],
    tables: [],
    formulas: [],
    figureGroups: [],
    metadata: { title: 'Structured Grounding Paper', author: '', subject: '', creator: '', producer: '' },
    ...overrides,
  }
}

test('pdf grounding prefers structured extracted sections over page chunk fallback', () => {
  const rows = buildPaperSectionRowsFromExtraction(
    'paper-1',
    createExtractionResult({
      sections: [
        {
          sourceSectionTitle: 'Method',
          editorialTitle: 'Method',
          paragraphs: ['The method is recovered from structured extraction.'],
          pageStart: 1,
          pageEnd: 1,
        },
        {
          sourceSectionTitle: 'Results',
          editorialTitle: 'Results',
          paragraphs: ['The result section stays attached to the method narrative.'],
          pageStart: 2,
          pageEnd: 2,
        },
      ],
    }),
  )

  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.sourceSectionTitle, 'Method')
  assert.match(rows[0]?.paragraphs ?? '', /structured extraction/u)
  assert.equal(rows[1]?.sourceSectionTitle, 'Results')
})

test('pdf grounding drops low-value structured sections before persisting', () => {
  const rows = buildPaperSectionRowsFromExtraction(
    'paper-1',
    createExtractionResult({
      sections: [
        {
          sourceSectionTitle: 'References',
          editorialTitle: 'References',
          paragraphs: ['[1] Should be ignored'],
          pageStart: 2,
          pageEnd: 2,
        },
        {
          sourceSectionTitle: 'Method',
          editorialTitle: 'Method',
          paragraphs: ['Closed-loop control stays in the persisted section rows.'],
          pageStart: 1,
          pageEnd: 1,
        },
      ],
    }),
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.sourceSectionTitle, 'Method')
})

test('pdf grounding persists figure table and formula path summaries for reader views', () => {
  const summary = __testing.buildPersistedExtractionPathSummary({
    figureRows: [{ imagePath: '/uploads/paper/fig-1.png' }, { imagePath: '' }],
    tableRows: [
      { number: 1, rawText: 'Metric | Value' },
      { number: 2, rawText: '' },
    ],
    formulaRows: [
      { number: '1', rawText: 'E = mc^2' },
      { number: '2', rawText: '' },
    ],
  })

  assert.deepEqual(summary.figurePaths, ['/uploads/paper/fig-1.png'])
  assert.deepEqual(summary.tablePaths, ['table_1'])
  assert.deepEqual(summary.formulaPaths, ['formula_1'])
})
