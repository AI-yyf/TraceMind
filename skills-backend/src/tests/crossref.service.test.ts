import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as crossrefTesting } from '../services/search/crossref'

test('crossref transform extracts DOI, arXiv links, and direct pdf links when present', () => {
  const transformed = crossrefTesting.transformCrossrefWork({
    DOI: '10.48550/arXiv.2401.12345',
    title: ['A Test Paper'],
    author: [{ given: 'Ada', family: 'Lovelace' }],
    issued: { 'date-parts': [[2024, 1, 20]] },
    link: [
      {
        URL: 'https://arxiv.org/pdf/2401.12345.pdf',
        'content-type': 'application/pdf',
      },
    ],
    resource: {
      primary: {
        URL: 'https://arxiv.org/abs/2401.12345',
      },
    },
    'is-referenced-by-count': 42,
  })

  assert.ok(transformed)
  assert.equal(transformed?.doi, '10.48550/arXiv.2401.12345')
  assert.equal(transformed?.arxivUrl, 'https://arxiv.org/abs/2401.12345')
  assert.equal(transformed?.pdfUrl, 'https://arxiv.org/pdf/2401.12345.pdf')
  assert.equal(transformed?.published, '2024-01-20T00:00:00.000Z')
  assert.equal(transformed?.citationCount, 42)
})

test('crossref transform falls back to doi landing page when no direct pdf exists', () => {
  const transformed = crossrefTesting.transformCrossrefWork({
    DOI: '10.1109/test.2024.123456',
    title: ['Publisher Landing Page Paper'],
    issued: { 'date-parts': [[2024]] },
    resource: {
      primary: {
        URL: 'https://ieeexplore.ieee.org/document/123456/',
      },
    },
  })

  assert.ok(transformed)
  assert.equal(transformed?.doi, '10.1109/test.2024.123456')
  assert.equal(transformed?.landingPageUrl, 'https://ieeexplore.ieee.org/document/123456/')
  assert.equal(transformed?.pdfUrl, undefined)
})
