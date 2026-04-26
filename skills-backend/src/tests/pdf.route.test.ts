import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { __testing as pdfRouteTesting } from '../routes/pdf'
import { PdfExtractFromUrlSchema } from '../routes/schemas'
import { __testing as pdfExtractorTesting } from '../services/pdf-extractor'
import type { PDFExtractionResult } from '../services/pdf-extractor'

function createTestId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test('persistExtractionResult stores extracted paper sections alongside evidence assets', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('pdf-topic'),
      nameZh: 'PDF Extraction Topic',
      nameEn: 'PDF Extraction Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: createTestId('pdf-paper'),
      topicId: topic.id,
      title: 'PDF Grounding Paper',
      titleZh: 'PDF Grounding Paper',
      titleEn: 'PDF Grounding Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-04-01T00:00:00.000Z'),
      summary: 'A paper used to validate PDF extraction persistence.',
      explanation: 'The route should persist both evidence rows and reconstructed paper sections.',
      figurePaths: '[]',
      tablePaths: '[]',
      tags: JSON.stringify(['pdf', 'grounding']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const extraction: PDFExtractionResult = {
    paperId: paper.id,
    paperTitle: paper.title,
    pageCount: 2,
    coverPath: '/uploads/test-cover.png',
    abstract:
      'This abstract explains the problem framing of the paper and why the method matters for grounded reading.',
    fullText:
      'Introduction. The paper introduces a grounded extraction pipeline. Method. The model aligns sections with evidence blocks.',
    pages: [
      {
        pageNumber: 1,
        text: 'Introduction. The paper introduces a grounded extraction pipeline for node articles.',
        blocks: [
          { bbox: [0, 0, 100, 20], text: 'Introduction', type: 'text' },
          {
            bbox: [0, 24, 400, 120],
            text: 'The paper introduces a grounded extraction pipeline for node articles.',
            type: 'text',
          },
        ],
      },
      {
        pageNumber: 2,
        text: 'Method. The model aligns sections with evidence blocks and stage-local reading.',
        blocks: [
          { bbox: [0, 0, 100, 20], text: 'Method', type: 'text' },
          {
            bbox: [0, 24, 400, 120],
            text: 'The model aligns sections with evidence blocks and stage-local reading.',
            type: 'text',
          },
        ],
      },
    ],
    figures: [
      {
        id: 'fig-1',
        number: 1,
        caption: 'Overview figure',
        page: 1,
        imagePath: '/uploads/test-figure.png',
        width: 400,
        height: 280,
        bbox: [0, 0, 200, 140],
      },
    ],
    tables: [],
    formulas: [],
    figureGroups: [],
    metadata: {
      title: paper.title,
      author: 'Codex Test',
      subject: '',
      creator: '',
      producer: '',
    },
  }

  try {
    await pdfRouteTesting.persistExtractionResult({
      paperId: paper.id,
      result: extraction,
      pdfPath: '/uploads/test-paper.pdf',
    })

    const sections = await prisma.paper_sections.findMany({
      where: { paperId: paper.id },
      orderBy: { order: 'asc' },
    })
    const figures = await prisma.figures.findMany({
      where: { paperId: paper.id },
    })

    assert.ok(sections.length >= 2, `expected extracted sections, got ${sections.length}`)
    assert.equal(sections[0]?.sourceSectionTitle, 'Abstract')
    assert.deepEqual(JSON.parse(sections[0]?.paragraphs ?? '[]').length > 0, true)
    assert.equal(figures.length, 1)
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('persistExtractionResult stores text-recovered tables and formulas for downstream grounding', async () => {
  const topic = await prisma.topics.create({
    data: {
      id: createTestId('pdf-recovered-topic'),
      nameZh: 'PDF Recovered Topic',
      nameEn: 'PDF Recovered Topic',
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  const paper = await prisma.papers.create({
    data: {
      id: createTestId('pdf-recovered-paper'),
      topicId: topic.id,
      title: 'Recovered Grounding Paper',
      titleZh: 'Recovered Grounding Paper',
      titleEn: 'Recovered Grounding Paper',
      authors: JSON.stringify(['Codex Test']),
      published: new Date('2025-04-01T00:00:00.000Z'),
      summary: 'A paper used to validate recovered table and formula persistence.',
      explanation: 'The route should persist text-recovered assets for downstream reader and editorial flows.',
      figurePaths: '[]',
      tablePaths: '[]',
      formulaPaths: '[]',
      tags: JSON.stringify(['pdf', 'recovery']),
      status: 'candidate',
      updatedAt: new Date(),
    },
  })

  const extraction = pdfExtractorTesting.normalizeExtractionResultPayload(
    {
      paperId: paper.id,
      paperTitle: paper.title,
      pageCount: 1,
      abstract: 'Recovered text should still become structured grounding evidence.',
      fullText: `
Table 1: Benchmark comparison
Method    Score
Ours      0.91
Baseline  0.82

Eq. (1)
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

Eq. (1)
J(theta) = E[r_t] + lambda KL(q || p)
`,
          blocks: [],
        },
      ],
      figures: [],
      tables: [],
      formulas: [],
      figureGroups: [],
      metadata: {
        title: paper.title,
        author: 'Codex Test',
        subject: '',
        creator: '',
        producer: '',
      },
    },
    paper.id,
    paper.title,
  )

  try {
    await pdfRouteTesting.persistExtractionResult({
      paperId: paper.id,
      result: extraction,
      pdfPath: '/uploads/recovered-paper.pdf',
    })

    const [tables, formulas] = await Promise.all([
      prisma.tables.findMany({
        where: { paperId: paper.id },
        orderBy: { number: 'asc' },
      }),
      prisma.formulas.findMany({
        where: { paperId: paper.id },
        orderBy: { page: 'asc' },
      }),
    ])

    assert.equal(tables.length >= 1, true)
    assert.equal(formulas.length >= 1, true)
    assert.equal(tables[0]?.caption.includes('Table 1'), true)
    assert.match(formulas[0]?.latex ?? '', /J\(theta\)/u)
  } finally {
    await prisma.topics.delete({
      where: { id: topic.id },
    })
  }
})

test('pdf route drops front-matter and html-like noise from extracted paper sections', () => {
  const rows = pdfRouteTesting.buildPaperSectionRowsFromExtraction('paper-noise', {
    paperId: 'paper-noise',
    paperTitle: 'Noisy Thesis Style PDF',
    pageCount: 3,
    abstract:
      'This abstract introduces a driving world model and explains why stage-local evidence matters.',
    fullText:
      'Table of Contents ... 1 Introduction. We study stage-local node reading with grounded evidence.',
    pages: [
      {
        pageNumber: 1,
        text: 'Acknowledgements. I thank my supervisor for support.',
        blocks: [
          { bbox: [0, 0, 100, 20], text: 'Acknowledgements', type: 'text' },
        ],
      },
      {
        pageNumber: 2,
        text: 'Table of Contents ........ 1 Introduction ........ 3 Method ........ 5',
        blocks: [
          { bbox: [0, 0, 100, 20], text: 'Table of Contents', type: 'text' },
        ],
      },
      {
        pageNumber: 3,
        text: 'Introduction. We study grounded node articles that keep figures, tables, and formulas close to the narrative.',
        blocks: [
          { bbox: [0, 0, 100, 20], text: 'Introduction', type: 'text' },
        ],
      },
    ],
    figures: [],
    tables: [],
    formulas: [],
    figureGroups: [],
    metadata: {
      title: 'Noisy Thesis Style PDF',
      author: 'Codex Test',
      subject: '',
      creator: '',
      producer: '',
    },
  })

  assert.ok(rows.length >= 2)
  assert.equal(rows[0]?.sourceSectionTitle, 'Abstract')
  assert.ok(rows.every((row) => !/Acknowledgements|Table of Contents/iu.test(row.sourceSectionTitle)))
  assert.ok(rows.some((row) => /Introduction/iu.test(row.sourceSectionTitle)))
})

test('pdf route flags html landing-page text as low-value content', () => {
  assert.equal(
    pdfRouteTesting.looksLikeLowValueParagraph(
      '<html><head><title>IEEE Xplore</title></head><body>Personal use is permitted.</body></html>',
    ),
    true,
  )

  assert.deepEqual(
    pdfRouteTesting.sanitizeSectionParagraphs([
      'Table of Contents ........ 1',
      'Introduction to grounded node articles.',
    ]),
    ['Introduction to grounded node articles.'],
  )
})

test('pdf extract schema accepts canonical arxiv paper ids', () => {
  assert.doesNotThrow(() =>
    PdfExtractFromUrlSchema.parse({
      body: {
        paperId: '1706.03762',
        paperTitle: 'Attention Is All You Need',
        pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
      },
    }),
  )
})
