import fs from 'node:fs'
import path from 'node:path'

import { omniGateway } from './omni/gateway'
import type { OmniCompleteRequest, OmniMessage } from './omni/types'
import type { ExtractedFormula, PDFExtractionResult } from './pdf-extractor'
import { logger } from '../utils/logger'

const FORMULA_VISION_MAX_CANDIDATES = 50
const FORMULA_VISION_MIN_CONFIDENCE = 0.72

type FormulaRecognitionPayload = {
  isFormula?: boolean
  latex?: string
  rawText?: string
  confidence?: number
  explanation?: string
}

function cleanText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function parseJsonPayload<T>(value: string): T | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/iu)?.[1] ?? trimmed
  try {
    return JSON.parse(fenced) as T
  } catch {
    return null
  }
}

function formulaWordCount(formula: ExtractedFormula) {
  return cleanText(formula.rawText).match(/\b[A-Za-z]{3,}\b/gu)?.length ?? 0
}

function looksLikeCleanEquation(formula: ExtractedFormula) {
  const text = cleanText(formula.latex || formula.rawText)
  if (!text) return false
  if (/\\(?:frac|sum|prod|min|max|argmax|argmin|theta|lambda|sigma|alpha|beta|gamma|mathbb|mathbf|mathcal)/u.test(text)) {
    return true
  }
  if (/(?:<=|>=|:=|->|=>|=)/u.test(text) && formulaWordCount(formula) <= 4) {
    return true
  }
  return false
}

function needsVisionVerification(formula: ExtractedFormula) {
  if (!formula.imagePath) return false
  if ((formula.confidence ?? 0) < 0.8) return true
  if (!looksLikeCleanEquation(formula)) return true
  if (formulaWordCount(formula) > 5) return true
  return false
}

function visionPriorityScore(formula: ExtractedFormula) {
  let score = 0
  score += formulaWordCount(formula) * 2
  score += Math.max(0, 1 - (formula.confidence ?? 0)) * 10
  if (!looksLikeCleanEquation(formula)) score += 4
  if (!formula.latex || formula.latex === formula.rawText) score += 2
  return score
}

function selectVisionCandidates(result: PDFExtractionResult) {
  return result.formulas
    .filter(needsVisionVerification)
    .sort((left, right) => visionPriorityScore(right) - visionPriorityScore(left))
    .slice(0, FORMULA_VISION_MAX_CANDIDATES)
}

function buildFormulaRecognitionRequest(base64: string, mimeType: string, formula: ExtractedFormula): OmniCompleteRequest {
  return {
    task: 'formula_recognition',
    preferredSlot: 'multimodal',
    json: true,
    maxTokens: 500,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Return strict JSON with keys: isFormula (boolean), latex (string), rawText (string), confidence (0-1 number), explanation (string). Only mark isFormula=true when the crop is primarily a mathematical formula or equation line. Do not hallucinate missing symbols.',
      } satisfies OmniMessage,
      {
        role: 'user',
        content: `Recognize this formula crop. Existing OCR candidate: "${cleanText(formula.rawText)}"`,
        attachments: [
          {
            type: 'image',
            mimeType,
            base64,
            caption: `Formula crop for page ${formula.page}`,
          },
        ],
      } satisfies OmniMessage,
    ],
  }
}

function readFormulaCropBase64(outputRoot: string, result: PDFExtractionResult, formula: ExtractedFormula) {
  if (!formula.imagePath) return null

  const absolutePath = path.resolve(outputRoot, result.paperId, formula.imagePath)
  if (!fs.existsSync(absolutePath)) return null

  const buffer = fs.readFileSync(absolutePath)
  return {
    absolutePath,
    base64: buffer.toString('base64'),
    mimeType: 'image/png',
  }
}

function applyRecognition(formula: ExtractedFormula, recognition: FormulaRecognitionPayload | null) {
  if (!recognition) {
    return { keep: false, formula }
  }

  const confidence =
    typeof recognition.confidence === 'number' && Number.isFinite(recognition.confidence)
      ? recognition.confidence
      : 0
  const latex = cleanText(recognition.latex)
  const rawText = cleanText(recognition.rawText) || latex
  const isFormula = recognition.isFormula !== false && Boolean(latex || rawText)

  if (!isFormula || confidence < FORMULA_VISION_MIN_CONFIDENCE) {
    return { keep: false, formula }
  }

  return {
    keep: true,
    formula: {
      ...formula,
      latex: latex || formula.latex,
      rawText: rawText || formula.rawText,
      confidence: Math.max(formula.confidence ?? 0, confidence),
      extractionMethod: formula.extractionMethod
        ? `${formula.extractionMethod}+vlm-enhanced`
        : 'vlm-enhanced',
    } satisfies ExtractedFormula,
  }
}

export async function enhanceExtractedFormulasWithVision(args: {
  result: PDFExtractionResult
  outputRoot: string
}) {
  const { result, outputRoot } = args
  const candidates = selectVisionCandidates(result)

  if (candidates.length === 0) {
    return result
  }

  const availabilityRequest = buildFormulaRecognitionRequest(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a6sAAAAASUVORK5CYII=',
    'image/png',
    candidates[0],
  )

  const hasModel = await omniGateway.hasAvailableModel(availabilityRequest)
  if (!hasModel) {
    logger.warn('Formula vision verification skipped: no multimodal formula_recognition model available')
    return result
  }

  const replacementMap = new Map<string, ExtractedFormula | null>()

  for (const candidate of candidates) {
    const attachment = readFormulaCropBase64(outputRoot, result, candidate)
    if (!attachment) continue

    try {
      const response = await omniGateway.complete(
        buildFormulaRecognitionRequest(attachment.base64, attachment.mimeType, candidate),
      )
      const recognition = parseJsonPayload<FormulaRecognitionPayload>(response.text)
      const decision = applyRecognition(candidate, recognition)
      replacementMap.set(candidate.id, decision.keep ? decision.formula : null)
    } catch (error) {
      logger.warn('Formula vision verification failed', {
        formulaId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (replacementMap.size === 0) {
    return result
  }

  return {
    ...result,
    formulas: result.formulas.flatMap((formula) => {
      if (!replacementMap.has(formula.id)) return [formula]
      const replacement = replacementMap.get(formula.id)
      return replacement ? [replacement] : []
    }),
  } satisfies PDFExtractionResult
}

export const __testing = {
  needsVisionVerification,
  applyRecognition,
}
