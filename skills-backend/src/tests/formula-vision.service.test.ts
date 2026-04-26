import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as formulaVisionTesting } from '../services/formula-vision'
import type { ExtractedFormula } from '../services/pdf-extractor'

function createFormula(overrides: Partial<ExtractedFormula> = {}): ExtractedFormula {
  return {
    id: 'formula-1',
    number: '1',
    latex: 'L = L_task + lambda L_align',
    rawText: 'L = L_task + lambda L_align',
    page: 3,
    type: 'display',
    imagePath: 'formula-crops/page_3_formula_1.png',
    confidence: 0.74,
    ...overrides,
  }
}

test('formula vision flags noisy prose-like formulas for verification', () => {
  const needsVision = formulaVisionTesting.needsVisionVerification(
    createFormula({
      rawText:
        'The privileged agent sees the world through a ground-truth map M ∈ {0,1}^{W×H×7} and then continues the paragraph.',
      latex:
        'The privileged agent sees the world through a ground-truth map M ∈ {0,1}^{W×H×7} and then continues the paragraph.',
    }),
  )

  assert.equal(needsVision, true)
})

test('formula vision keeps clean short equations out of the expensive verification lane', () => {
  const needsVision = formulaVisionTesting.needsVisionVerification(
    createFormula({
      confidence: 0.91,
      rawText: 'J(theta) = E[r_t]',
      latex: 'J(theta) = E[r_t]',
    }),
  )

  assert.equal(needsVision, false)
})

test('formula vision drops candidates when VLM says the crop is not actually a formula', () => {
  const decision = formulaVisionTesting.applyRecognition(createFormula(), {
    isFormula: false,
    confidence: 0.88,
    explanation: 'This is prose, not a standalone formula.',
  })

  assert.equal(decision.keep, false)
})

test('formula vision upgrades latex when VLM returns a verified formula', () => {
  const decision = formulaVisionTesting.applyRecognition(createFormula(), {
    isFormula: true,
    latex: 'J(\\theta)=\\mathbb{E}[r_t]',
    rawText: 'J(theta) = E[r_t]',
    confidence: 0.93,
  })

  assert.equal(decision.keep, true)
  assert.equal(decision.formula.latex, 'J(\\theta)=\\mathbb{E}[r_t]')
  assert.equal(decision.formula.confidence, 0.93)
})
