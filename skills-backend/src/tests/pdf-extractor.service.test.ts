import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as pdfExtractorTesting } from '../services/pdf-extractor'

test('pdf extractor parses trailing JSON payload after warning text', () => {
  const payload = pdfExtractorTesting.parseExtractionStdoutPayload(`
MuPDF warning: syntax error while parsing xref table
{"paperId":"paper-1","paperTitle":"Test Paper","pageCount":1,"fullText":"body","pages":[],"figures":[],"tables":[],"formulas":[],"metadata":{"title":"Test Paper","author":"","subject":"","creator":"","producer":""}}
`)

  assert.equal(payload.paperId, 'paper-1')
  assert.equal(payload.pageCount, 1)
})

test('pdf extractor recognizes real pdf buffers and rejects html buffers', () => {
  assert.equal(
    pdfExtractorTesting.isPdfBuffer(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n')),
    true,
  )
  assert.equal(
    pdfExtractorTesting.isPdfBuffer(
      Buffer.from('<html><body>Personal use is permitted.</body></html>'),
    ),
    false,
  )
})

test('pdf extractor preserves enriched captions tables sections and markdown from python payload', () => {
  const normalized = pdfExtractorTesting.normalizeExtractionResultPayload(
    {
      paperId: 'paper-2',
      paperTitle: 'Structured Paper',
      pageCount: 2,
      abstract: 'A short abstract',
      fullText: 'Full text',
      markdown: '# Structured Paper',
      pages: [{ pageNumber: 1, text: 'Body', blocks: [] }],
      figures: [
        {
          id: 'figure_1_1',
          number: 3,
          caption: 'Figure 3. Closed-loop planner',
          page: 1,
          path: 'images/page_1_figure_3.png',
          width: 1200,
          height: 800,
          bbox: [0, 0, 10, 10],
          confidence: 0.92,
        },
      ],
      tables: [
        {
          id: 'table_1_1',
          number: 1,
          caption: 'Table 1. Benchmark comparison',
          page: 1,
          headers: ['Method', 'Score'],
          rows: [{ Method: 'Ours', Score: '0.91' }],
          rawText: 'Method | Score\nOurs | 0.91',
          bbox: [1, 2, 3, 4],
          confidence: 0.94,
        },
      ],
      formulas: [
        {
          id: 'formula_1_1',
          number: '1',
          latex: 'J(theta)=E[r_t]',
          raw: 'J(theta)=E[r_t]',
          page: 1,
          type: 'display',
          bbox: [4, 5, 6, 7],
          confidence: 0.74,
        },
      ],
      sections: [
        {
          sourceSectionTitle: 'Method',
          editorialTitle: 'Method',
          paragraphs: ['The planner uses a closed-loop objective.'],
          pageStart: 1,
          pageEnd: 1,
        },
      ],
      metadata: { title: 'Structured Paper', author: 'Tester', subject: '', creator: '', producer: '' },
    },
    'paper-2',
    'Structured Paper',
  )

  assert.equal(normalized.figures[0]?.caption, 'Figure 3. Closed-loop planner')
  assert.equal(normalized.figures[0]?.imagePath, 'images/page_1_figure_3.png')
  assert.equal(normalized.tables[0]?.headers[0], 'Method')
  assert.equal(normalized.tables[0]?.rows[0]?.Score, '0.91')
  assert.equal(normalized.formulas[0]?.bbox?.[0], 4)
  assert.equal(normalized.sections?.[0]?.sourceSectionTitle, 'Method')
  assert.equal(normalized.markdown, '# Structured Paper')
})

test('pdf extractor flags incomplete visual extraction for fallback review', () => {
  const normalized = pdfExtractorTesting.normalizeExtractionResultPayload(
    {
      paperId: 'paper-3',
      paperTitle: 'Sparse Paper',
      pageCount: 3,
      fullText: 'Full text',
      pages: [],
      figures: [
        {
          id: 'figure_1_1',
          caption: 'Low confidence plot',
          page: 1,
          path: 'images/low.png',
          confidence: 0.1,
        },
      ],
      tables: [],
      formulas: [],
      pageImages: [
        {
          pageNumber: 1,
          path: 'pages/page_1.png',
          reason: 'low_confidence',
          figureCount: 1,
          avgConfidence: 0.1,
        },
      ],
      metadata: { title: 'Sparse Paper', author: '', subject: '', creator: '', producer: '' },
    },
    'paper-3',
    'Sparse Paper',
    { ...pdfExtractorTesting.DEFAULT_METHOD_CONFIG, includeLowConfidenceAssets: false },
  )

  assert.equal(normalized.figures.length, 0)
  assert.ok(normalized.qualityWarnings?.some((warning) => warning.code === 'missing_visual_assets'))
  assert.ok(normalized.qualityWarnings?.some((warning) => warning.code === 'filtered_assets'))
  assert.ok(normalized.qualityWarnings?.some((warning) => warning.code === 'vlm_fallback_pages'))
})

test('pdf extractor health warns when a paper has figures but no table or formula coverage', () => {
  const warnings = pdfExtractorTesting.buildExtractionQualityWarnings({
    pageCount: 12,
    figures: [
      {
        id: 'figure-1',
        number: 1,
        caption: 'Pipeline overview',
        page: 1,
        imagePath: 'figures/1.png',
        width: 800,
        height: 600,
        bbox: [0, 0, 800, 600],
      },
    ],
    tables: [],
    formulas: [],
    filteredCounts: { figures: 0, tables: 0, formulas: 0 },
  })

  assert.ok(warnings?.some((warning) => warning.code === 'missing_table_formula_coverage'))
})

test('pdf extractor flags latent table and formula coverage gaps from recovered text', () => {
  const signals = pdfExtractorTesting.detectLatentCoverageSignals(`
Table 1: Benchmark comparison
Eq. (1) defines the objective.
L = E[r_t] + lambda KL(q || p)
`)

  assert.equal(signals.tableCueCount > 0, true)
  assert.equal(signals.formulaCueCount > 0, true)

  const warnings = pdfExtractorTesting.buildExtractionQualityWarnings({
    pageCount: 8,
    figures: [],
    tables: [],
    formulas: [],
    filteredCounts: { figures: 0, tables: 0, formulas: 0 },
    sourceText: `
Table 1: Benchmark comparison
Eq. (1) defines the objective.
L = E[r_t] + lambda KL(q || p)
`,
  })

  assert.ok(warnings?.some((warning) => warning.code === 'latent_coverage_gap'))
  assert.ok(
    warnings?.some((warning) => /no structured tables were extracted|no formulas were extracted/u.test(warning.message)),
  )
})

test('pdf extractor recovers table and formula evidence from text when structured extraction is empty', () => {
  const normalized = pdfExtractorTesting.normalizeExtractionResultPayload(
    {
      paperId: 'paper-recovery',
      paperTitle: 'Recovered Evidence Paper',
      pageCount: 2,
      fullText: `
Table 1: Benchmark comparison
Method    Score
Ours      0.91
Baseline  0.82

Eq. (1) defines the objective.
J(theta) = E[r_t] + lambda KL(q || p)
`,
      pages: [
        {
          pageNumber: 1,
          text: `
Table 1: Benchmark comparison
Method    Score
Ours      0.91
Baseline  0.82

Eq. (1) defines the objective.
J(theta) = E[r_t] + lambda KL(q || p)
`,
          blocks: [],
        },
      ],
      figures: [],
      tables: [],
      formulas: [],
      metadata: {
        title: 'Recovered Evidence Paper',
        author: 'Tester',
        subject: '',
        creator: '',
        producer: '',
      },
    },
    'paper-recovery',
    'Recovered Evidence Paper',
  )

  assert.equal(normalized.tables.length >= 1, true)
  assert.equal(normalized.tables[0]?.extractionMethod, 'text-recovery')
  assert.equal(normalized.tables[0]?.headers[0], 'Method')
  assert.equal(normalized.tables[0]?.rows[0]?.Score, '0.91')
  assert.equal(normalized.formulas.length >= 1, true)
  assert.equal(normalized.formulas[0]?.extractionMethod, 'text-recovery')
  assert.match(normalized.formulas[0]?.rawText ?? '', /J\(theta\)/u)
})
