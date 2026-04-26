import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as alphaReaderTesting } from '../services/topics/alpha-reader'
import { buildNodeArticleMarkdown } from '../services/topics/article-markdown'

test('node evidence audit requires VLM review when table and formula coverage is missing', () => {
  const audit = alphaReaderTesting.buildNodeEvidenceAudit({
    paperCount: 4,
    figureCount: 2,
    tableCount: 0,
    formulaCount: 0,
    figureGroupCount: 0,
  })

  assert.equal(audit.status, 'needs_vlm_audit')
  assert.ok(audit.warnings.some((warning) => warning.code === 'missing_table_formula_coverage'))
  assert.ok(audit.warnings.some((warning) => warning.code === 'thin_multi_paper_evidence'))
  assert.match(audit.requiredAction ?? '', /VLM-guided/u)
})

test('node article markdown exposes evidence gate instead of hiding weak extraction', () => {
  const markdown = buildNodeArticleMarkdown({
    language: 'en',
    standfirst: 'This node compares several papers around one research question.',
    summary: 'The current judgment is promising but evidence extraction is incomplete.',
    explanation: 'The article must not claim full certainty until table and formula extraction is audited.',
    paperRoles: [
      {
        paperId: 'paper-a',
        title: 'Paper A',
        route: '/paper/paper-a',
        contribution: 'Frames the central method.',
      },
    ],
    articleSections: [
      {
        title: 'Paper A',
        body: ['Paper A frames the method but needs visual evidence checks.'],
        paperId: 'paper-a',
        paperTitle: 'Paper A',
      },
    ],
    closing: ['Do not finalize the node until extraction coverage is repaired.'],
    critique: {
      summary: 'The evidence boundary is not complete.',
      bullets: ['Missing table/formula evidence.'],
    },
    evidence: [],
    evidenceAudit: {
      status: 'needs_vlm_audit',
      warnings: [
        {
          code: 'missing_table_formula_coverage',
          severity: 'warning',
          message: 'No table or formula evidence is available.',
        },
      ],
      requiredAction: 'Run VLM-guided extraction audit before final claims.',
    },
  })

  assert.match(markdown, /Evidence completeness gate/u)
  assert.match(markdown, /missing_table_formula_coverage/u)
  assert.match(markdown, /Run VLM-guided extraction audit/u)
})
