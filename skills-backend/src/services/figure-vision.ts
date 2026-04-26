import fs from 'node:fs'
import path from 'node:path'

import { omniGateway } from './omni/gateway'
import type { OmniCompleteRequest, OmniMessage } from './omni/types'
import type { ExtractedFigure, PDFExtractionResult } from './pdf-extractor'
import { logger } from '../utils/logger'

/**
 * Maximum number of figure candidates to process with VLM.
 * Set high (50) because ALL figures MUST be extracted - VLM cost is acceptable.
 */
const FIGURE_VISION_MAX_CANDIDATES = 50

/**
 * Minimum confidence threshold for VLM-verified figures.
 * Figures below this threshold after VLM analysis are rejected.
 */
const FIGURE_VISION_MIN_CONFIDENCE = 0.60

/**
 * Confidence threshold below which figures require VLM enhancement.
 * Figures with confidence < 0.6 are candidates for VLM analysis.
 */
const FIGURE_VISION_ENHANCEMENT_THRESHOLD = 0.60

/**
 * VLM Figure Analysis payload structure
 */
type FigureAnalysisPayload = {
  isFigure: boolean
  caption?: string
  figureType?: string
  region?: {
    x: number
    y: number
    width: number
    height: number
  }
  confidence: number
  explanation?: string
}

/**
 * Page region for VLM analysis when no figures detected
 */
export interface PageRegionForAnalysis {
  pageNumber: number
  imagePath: string
  reason: 'no_figures' | 'low_confidence'
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

/**
 * Determine if a figure needs VLM verification
 */
function needsVisionVerification(figure: ExtractedFigure): boolean {
  if (!figure.imagePath) return false
  const confidence = figure.confidence ?? 0
  // All figures below threshold need verification
  if (confidence < FIGURE_VISION_ENHANCEMENT_THRESHOLD) return true
  // Uncaptioned figures with generic captions need verification
  if (figure.caption.match(/^Figure\s+\d+$/u) && confidence < 0.8) return true
  return false
}

/**
 * Calculate priority score for VLM processing
 * Higher score = higher priority for VLM analysis
 */
function visionPriorityScore(figure: ExtractedFigure): number {
  let score = 0
  // Lower confidence = higher priority
  score += Math.max(0, 1 - (figure.confidence ?? 0)) * 20
  // Generic captions need more help
  if (figure.caption.match(/^Figure\s+\d+$/u)) score += 10
  // Smaller figures might be missed detections
  if (figure.width < 200 || figure.height < 200) score += 5
  return score
}

/**
 * Select figures for VLM analysis, prioritized by need
 */
function selectVisionCandidates(result: PDFExtractionResult): ExtractedFigure[] {
  return result.figures
    .filter(needsVisionVerification)
    .sort((left, right) => visionPriorityScore(right) - visionPriorityScore(left))
    .slice(0, FIGURE_VISION_MAX_CANDIDATES)
}

/**
 * Build VLM request for figure analysis
 */
function buildFigureAnalysisRequest(
  base64: string,
  mimeType: string,
  figure: ExtractedFigure,
  context?: { pageNumber?: number; existingCaption?: string }
): OmniCompleteRequest {
  const contextInfo = context
    ? `Page ${context.pageNumber}. Existing caption hint: "${context.existingCaption || 'none'}"`
    : `Page ${figure.page}`

  return {
    task: 'figure_analysis',
    preferredSlot: 'multimodal',
    json: true,
    maxTokens: 800,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are a figure analysis expert. Analyze the image and return strict JSON with keys:
- isFigure (boolean): true if this is a scientific figure, chart, diagram, or illustration
- caption (string): the likely caption or description of the figure
- figureType (string): one of "chart", "diagram", "photo", "illustration", "schematic", "table_figure", "mixed", "unknown"
- region (object, optional): {x, y, width, height} if you can identify the figure bounds within the image
- confidence (number 0-1): your confidence this is a valid figure
- explanation (string): brief explanation of your analysis

Only mark isFigure=true for actual figures. Reject headers, footers, page numbers, and noise.`,
      } satisfies OmniMessage,
      {
        role: 'user',
        content: `Analyze this figure crop from a PDF. ${contextInfo}. Current caption: "${cleanText(figure.caption)}"`,
        attachments: [
          {
            type: 'image',
            mimeType,
            base64,
            caption: `Figure crop for page ${figure.page}`,
          },
        ],
      } satisfies OmniMessage,
    ],
  }
}

/**
 * Build VLM request for page region analysis (when no figures detected)
 */
function buildPageRegionAnalysisRequest(
  base64: string,
  mimeType: string,
  pageNumber: number
): OmniCompleteRequest {
  return {
    task: 'figure_analysis',
    preferredSlot: 'multimodal',
    json: true,
    maxTokens: 2000,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `You are a figure detection expert for academic PDFs. Analyze the page image and identify ALL figures.

Return strict JSON with keys:
- figures (array): list of detected figures, each with:
  - isFigure (boolean): always true for detected figures
  - caption (string): the caption text if visible, or "Figure N" if not found
  - figureType (string): one of "chart", "diagram", "photo", "illustration", "schematic", "table_figure", "mixed", "unknown"
  - region (object): {x, y, width, height} normalized to 0-1 relative coordinates
  - confidence (number 0-1): detection confidence
- hasFigures (boolean): true if any figures detected
- explanation (string): brief summary of what you found

Be thorough - identify ALL visual elements that could be figures, charts, or diagrams.`,
      } satisfies OmniMessage,
      {
        role: 'user',
        content: `Analyze this PDF page (page ${pageNumber}) and identify all figures, charts, and diagrams. Return their locations and captions.`,
        attachments: [
          {
            type: 'image',
            mimeType,
            base64,
            caption: `PDF page ${pageNumber}`,
          },
        ],
      } satisfies OmniMessage,
    ],
  }
}

/**
 * Read figure crop as base64
 */
function readFigureCropBase64(
  outputRoot: string,
  result: PDFExtractionResult,
  figure: ExtractedFigure
): { absolutePath: string; base64: string; mimeType: string } | null {
  if (!figure.imagePath) return null

  const absolutePath = path.resolve(outputRoot, result.paperId, figure.imagePath)
  if (!fs.existsSync(absolutePath)) return null

  const buffer = fs.readFileSync(absolutePath)
  return {
    absolutePath,
    base64: buffer.toString('base64'),
    mimeType: 'image/png',
  }
}

/**
 * Apply VLM analysis result to a figure
 */
function applyAnalysis(figure: ExtractedFigure, analysis: FigureAnalysisPayload | null): {
  keep: boolean
  figure: ExtractedFigure
} {
  if (!analysis) {
    // No analysis - keep original if confidence is acceptable
    const shouldKeep = (figure.confidence ?? 0) >= FIGURE_VISION_MIN_CONFIDENCE * 0.8
    return { keep: shouldKeep, figure }
  }

  const confidence =
    typeof analysis.confidence === 'number' && Number.isFinite(analysis.confidence)
      ? analysis.confidence
      : 0

  const isFigure = analysis.isFigure !== false

  if (!isFigure || confidence < FIGURE_VISION_MIN_CONFIDENCE) {
    return { keep: false, figure }
  }

  // Update figure with VLM analysis
  const updatedFigure: ExtractedFigure = {
    ...figure,
    caption: cleanText(analysis.caption) || figure.caption,
    confidence: Math.max(figure.confidence ?? 0, confidence),
    extractionMethod: figure.extractionMethod
      ? `${figure.extractionMethod}+vlm-enhanced`
      : 'vlm-enhanced',
  }

  return { keep: true, figure: updatedFigure }
}

/**
 * Main function: Enhance extracted figures with VLM analysis
 */
export async function enhanceExtractedFiguresWithVision(args: {
  result: PDFExtractionResult
  outputRoot: string
  pageRegions?: PageRegionForAnalysis[]
}): Promise<PDFExtractionResult> {
  const { result, outputRoot, pageRegions = [] } = args

  // Check if VLM is available
  const availabilityRequest = buildFigureAnalysisRequest(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a6sAAAAASUVORK5CYII=',
    'image/png',
    result.figures[0] ?? {
      id: 'test',
      number: 1,
      caption: 'Test',
      page: 1,
      imagePath: '',
      width: 100,
      height: 100,
      bbox: null,
    }
  )

  const hasModel = await omniGateway.hasAvailableModel(availabilityRequest)
  if (!hasModel) {
    logger.warn('Figure vision enhancement skipped: no multimodal figure_analysis model available')
    return result
  }

  const replacementMap = new Map<string, ExtractedFigure | null>()
  const newFigures: ExtractedFigure[] = []

  // Process existing low-confidence figures
  const candidates = selectVisionCandidates(result)
  logger.info('Starting figure VLM enhancement', {
    paperId: result.paperId,
    totalFigures: result.figures.length,
    candidatesForVLM: candidates.length,
  })

  for (const candidate of candidates) {
    const attachment = readFigureCropBase64(outputRoot, result, candidate)
    if (!attachment) continue

    try {
      const response = await omniGateway.complete(
        buildFigureAnalysisRequest(attachment.base64, attachment.mimeType, candidate, {
          pageNumber: candidate.page,
          existingCaption: candidate.caption,
        })
      )
      const analysis = parseJsonPayload<FigureAnalysisPayload>(response.text)
      const decision = applyAnalysis(candidate, analysis)
      replacementMap.set(candidate.id, decision.keep ? decision.figure : null)

      if (decision.keep) {
        logger.debug('Figure VLM analysis succeeded', {
          figureId: candidate.id,
          originalConfidence: candidate.confidence,
          newConfidence: decision.figure.confidence,
          caption: decision.figure.caption,
        })
      }
    } catch (error) {
      logger.warn('Figure VLM analysis failed', {
        figureId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      })
      // Keep original figure on error
      replacementMap.set(candidate.id, candidate)
    }
  }

  // Process page regions where no figures were detected
  for (const pageRegion of pageRegions) {
    const absolutePath = path.resolve(outputRoot, result.paperId, pageRegion.imagePath)
    if (!fs.existsSync(absolutePath)) continue

    try {
      const buffer = fs.readFileSync(absolutePath)
      const base64 = buffer.toString('base64')

      const response = await omniGateway.complete(
        buildPageRegionAnalysisRequest(base64, 'image/png', pageRegion.pageNumber)
      )

      const pageAnalysis = parseJsonPayload<{
        figures?: FigureAnalysisPayload[]
        hasFigures?: boolean
      }>(response.text)

      if (pageAnalysis?.figures && pageAnalysis.hasFigures) {
        for (const figAnalysis of pageAnalysis.figures) {
          if (!figAnalysis.isFigure) continue
          if (figAnalysis.confidence < FIGURE_VISION_MIN_CONFIDENCE) continue

          // Create new figure from VLM detection
          const figureIndex = result.figures.length + newFigures.length + 1
          const newFigure: ExtractedFigure = {
            id: `figure_vlm_${pageRegion.pageNumber}_${figureIndex}`,
            number: figureIndex,
            caption: cleanText(figAnalysis.caption) || `Figure ${figureIndex}`,
            page: pageRegion.pageNumber,
            imagePath: pageRegion.imagePath,
            width: 0, // Will be determined from image
            height: 0,
            bbox: figAnalysis.region
              ? [figAnalysis.region.x, figAnalysis.region.y, figAnalysis.region.width, figAnalysis.region.height]
              : null,
            confidence: figAnalysis.confidence,
            extractionMethod: 'vlm',
          }
          newFigures.push(newFigure)

          logger.info('VLM detected new figure on page', {
            pageNumber: pageRegion.pageNumber,
            figureId: newFigure.id,
            caption: newFigure.caption,
            confidence: newFigure.confidence,
          })
        }
      }
    } catch (error) {
      logger.warn('Page region VLM analysis failed', {
        pageNumber: pageRegion.pageNumber,
        reason: pageRegion.reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Build final result
  if (replacementMap.size === 0 && newFigures.length === 0) {
    return result
  }

  const updatedFigures = [
    // Keep figures not in replacement map
    ...result.figures.flatMap((figure) => {
      if (!replacementMap.has(figure.id)) return [figure]
      const replacement = replacementMap.get(figure.id)
      return replacement ? [replacement] : []
    }),
    // Add newly detected figures
    ...newFigures,
  ]

  // Re-number figures by page order
  updatedFigures.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return a.number - b.number
  })

  // Update figure numbers
  const finalFigures = updatedFigures.map((fig, index) => ({
    ...fig,
    number: index + 1,
    id: fig.id.startsWith('figure_vlm_') ? fig.id : `figure_${fig.page}_${index + 1}`,
  }))

  logger.info('Figure VLM enhancement completed', {
    paperId: result.paperId,
    originalCount: result.figures.length,
    finalCount: finalFigures.length,
    replaced: replacementMap.size,
    newlyDetected: newFigures.length,
  })

  return {
    ...result,
    figures: finalFigures,
  } satisfies PDFExtractionResult
}

/**
 * Identify pages that need VLM analysis for figure detection
 */
export function identifyPagesNeedingVisionAnalysis(
  result: PDFExtractionResult,
  outputRoot: string
): PageRegionForAnalysis[] {
  const pagesNeedingAnalysis: PageRegionForAnalysis[] = []

  // Use pageImages from extraction result if available
  if (result.pageImages && result.pageImages.length > 0) {
    for (const pageImage of result.pageImages) {
      pagesNeedingAnalysis.push({
        pageNumber: pageImage.pageNumber,
        imagePath: pageImage.path,
        reason: pageImage.reason,
      })
    }
    return pagesNeedingAnalysis
  }

  // Fallback: Group figures by page and check each page
  const figuresByPage = new Map<number, ExtractedFigure[]>()
  for (const figure of result.figures) {
    const page = figure.page
    if (!figuresByPage.has(page)) {
      figuresByPage.set(page, [])
    }
    figuresByPage.get(page)!.push(figure)
  }

  // Check each page
  for (let pageNum = 1; pageNum <= result.pageCount; pageNum++) {
    const pageFigures = figuresByPage.get(pageNum) ?? []

    // Case 1: No figures on page
    if (pageFigures.length === 0) {
      // Check if page image exists
      const pageImagePath = path.join(outputRoot, result.paperId, 'pages', `page_${pageNum}.png`)
      if (fs.existsSync(pageImagePath)) {
        pagesNeedingAnalysis.push({
          pageNumber: pageNum,
          imagePath: path.relative(path.join(outputRoot, result.paperId), pageImagePath),
          reason: 'no_figures',
        })
      }
      continue
    }

    // Case 2: Low confidence figures on page
    const avgConfidence =
      pageFigures.reduce((sum, f) => sum + (f.confidence ?? 0), 0) / pageFigures.length
    if (avgConfidence < FIGURE_VISION_ENHANCEMENT_THRESHOLD) {
      const pageImagePath = path.join(outputRoot, result.paperId, 'pages', `page_${pageNum}.png`)
      if (fs.existsSync(pageImagePath)) {
        pagesNeedingAnalysis.push({
          pageNumber: pageNum,
          imagePath: path.relative(path.join(outputRoot, result.paperId), pageImagePath),
          reason: 'low_confidence',
        })
      }
    }
  }

  return pagesNeedingAnalysis
}

export const __testing = {
  needsVisionVerification,
  applyAnalysis,
  FIGURE_VISION_MIN_CONFIDENCE,
  FIGURE_VISION_ENHANCEMENT_THRESHOLD,
}
