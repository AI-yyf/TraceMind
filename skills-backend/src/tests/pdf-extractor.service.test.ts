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
