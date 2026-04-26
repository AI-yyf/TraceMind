import assert from 'node:assert/strict'
import test from 'node:test'

import { collectPaperFormulaArtifacts } from '../services/topics/synthetic-formulas'

test('synthetic formula recovery ignores topic-placement prose and noisy result sentences', () => {
  const artifacts = collectPaperFormulaArtifacts({
    formulas: [],
    tables: [
      {
        id: 'objective-table',
        number: 1,
        caption: 'Objective terms',
        rawText: 'Objective terms\nLoss = L_plan + lambda * L_ctrl\nPlanner score 0.81',
      },
      {
        id: 'results-table',
        number: 2,
        caption: 'Ablation results',
        rawText:
          'and on-policy trajectories - each substantially improve performance and together achieve 100%',
      },
      {
        id: 'ocr-garble-table',
        number: 3,
        caption: 'OCR fragments',
        rawText: 't = 1 K s* p k=1',
      },
    ],
    paper_sections: [
      {
        id: 'topic-placement',
        editorialTitle: 'Topic placement',
        sourceSectionTitle: 'Topic placement',
        paragraphs: 'It is currently grouped into 2 node(s): planning objective, closed-loop control.',
      },
    ],
  })

  assert.ok(
    artifacts.some((artifact) => /Loss = L_plan \+ lambda \* L_ctrl/u.test(artifact.rawText)),
    'expected to retain the table-derived objective formula',
  )
  assert.equal(
    artifacts.some((artifact) => /grouped into \d+ node\(s\)/iu.test(artifact.rawText)),
    false,
    'topic placement prose should never become a formula artifact',
  )
  assert.equal(
    artifacts.some((artifact) => /on-policy trajectories/iu.test(artifact.rawText)),
    false,
    'result prose should not be promoted into synthetic formula evidence',
  )
  assert.equal(
    artifacts.some((artifact) => /t = 1 K s\* p k=1/u.test(artifact.rawText)),
    false,
    'OCR-broken symbol chains should not be promoted into synthetic formula evidence',
  )
})

test('synthetic section formulas require explicit mathematical structure', () => {
  const artifacts = collectPaperFormulaArtifacts({
    formulas: [],
    tables: [],
    paper_sections: [
      {
        id: 'method-1',
        editorialTitle: 'Method',
        sourceSectionTitle: 'Method',
        paragraphs:
          'We optimize the following objective.\nJ(theta) = E[r_t]\nThis keeps the planner aligned with long-horizon reward.',
      },
      {
        id: 'results-1',
        editorialTitle: 'Results',
        sourceSectionTitle: 'Results',
        paragraphs: 'The policy improves performance and the model stays more stable across tasks.',
      },
    ],
  })

  assert.ok(
    artifacts.some((artifact) => artifact.sourceKind === 'section' && /J\(theta\) = E\[r_t\]/u.test(artifact.rawText)),
    'explicit equation structure in the section text should still be preserved',
  )
  assert.equal(
    artifacts.some((artifact) => /policy improves performance/iu.test(artifact.rawText)),
    false,
    'plain prose without mathematical structure should not become a section formula artifact',
  )
})
