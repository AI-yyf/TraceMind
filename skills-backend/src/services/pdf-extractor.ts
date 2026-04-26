import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { logger } from '../utils/logger'
import {
  enhanceExtractedFiguresWithVision,
  identifyPagesNeedingVisionAnalysis,
} from './figure-vision'
import { enhanceExtractedFormulasWithVision } from './formula-vision'
import { collectPaperFormulaArtifacts } from './topics/synthetic-formulas'

// ---------------------------------------------------------------------------
// Extraction method types
// ---------------------------------------------------------------------------
export type ExtractionMethod = 'auto' | 'marker' | 'pymupdf' | 'arxiv-source' | 'vlm-enhanced'

export interface ExtractionMethodConfig {
  /** Preferred extraction method: 'auto' (try marker, fallback pymupdf), 'marker', or 'pymupdf' */
  method: ExtractionMethod
  /** Minimum confidence threshold for figures (0-1). Assets below this are filtered. */
  figureConfidenceThreshold: number
  /** Minimum confidence threshold for tables (0-1). Assets below this are filtered. */
  tableConfidenceThreshold: number
  /** Minimum confidence threshold for formulas (0-1). Assets below this are filtered. */
  formulaConfidenceThreshold: number
  /** Whether to include low-confidence assets with a warning flag */
  includeLowConfidenceAssets: boolean
  /** Enable VLM fallback for figure extraction when confidence is low */
  enableFigureVLMFallback: boolean
  /** Enable VLM fallback for formula extraction when confidence is low */
  enableFormulaVLMFallback: boolean
  /** Enable arXiv source fallback for high-quality figure extraction when PDF extraction yields low confidence */
  enableArxivSourceFallback: boolean
}

const DEFAULT_METHOD_CONFIG: ExtractionMethodConfig = {
  method: 'auto',
  // Lowered thresholds to capture more assets, relying on VLM/arXiv fallback for quality
  figureConfidenceThreshold: 0.55,  // Lowered from 0.80 to match uncaptioned figure confidence
  tableConfidenceThreshold: 0.50,   // Lowered from 0.75 to capture borderline tables
  formulaConfidenceThreshold: 0.50, // Lowered from 0.70 to capture text-recovery formulas
  includeLowConfidenceAssets: true,  // Keep low-confidence assets with warning flag for VLM fallback
  enableFigureVLMFallback: true,    // VLM will validate and improve low-confidence figures
  enableFormulaVLMFallback: true,   // VLM will validate and improve low-confidence formulas
  enableArxivSourceFallback: true,  // ArXiv source provides highest quality (0.90-0.95)
}

// ---------------------------------------------------------------------------
// Extracted asset types
// ---------------------------------------------------------------------------

export interface ExtractedFigure {
  id: string
  number: number
  caption: string
  page: number
  imagePath: string
  width: number
  height: number
  bbox: number[] | null
  confidence?: number | null
  extractionMethod?: string | null
  lowConfidenceWarning?: boolean
}

export interface FigureSubFigure {
  index: string
  figureId: string
  subId: string
  imagePath: string
  caption: string
  page: number
  confidence?: number | null
}

export interface ExtractedFigureGroup {
  groupId: string
  parentNumber: number | string
  caption: string
  subFigures: FigureSubFigure[]
  confidence: number
  extractionMethod: string
}

export interface ExtractedTable {
  id: string
  number: number
  caption: string
  page: number
  headers: string[]
  rows: Array<Record<string, string>>
  rawText: string
  bbox: number[]
  confidence?: number | null
  extractionMethod?: string | null
  lowConfidenceWarning?: boolean
}

export interface ExtractedFormula {
  id: string
  number: string
  latex: string
  rawText: string
  page: number
  type: 'inline' | 'display'
  bbox?: number[] | null
  imagePath?: string | null
  confidence?: number | null
  extractionMethod?: string | null
  lowConfidenceWarning?: boolean
}

export interface ExtractedSection {
  sourceSectionTitle: string
  editorialTitle: string
  paragraphs: string[]
  pageStart?: number
  pageEnd?: number
}

export interface ExtractedPage {
  pageNumber: number
  text: string
  blocks: Array<{
    bbox: number[]
    text: string
    type: string
  }>
}

export interface PDFExtractionResult {
  paperId: string
  paperTitle: string
  pageCount: number
  coverPath?: string
  abstract?: string
  fullText: string
  pages: ExtractedPage[]
  figures: ExtractedFigure[]
  tables: ExtractedTable[]
  formulas: ExtractedFormula[]
  figureGroups: ExtractedFigureGroup[]
  sections?: ExtractedSection[]
  markdown?: string
  metadata: {
    title: string
    author: string
    subject: string
    creator: string
    producer: string
  }
  /** Extraction method used: 'marker' or 'pymupdf' */
  extractionMethod?: string
  /** Whether Marker was available at extraction time */
  markerAvailable?: boolean
  /** Whether DocLayout-YOLO was available at extraction time */
  doclayoutYoloAvailable?: boolean
  /** Requested extraction method */
  requestedMethod?: string
  /** Breakdown of extraction methods used per asset type, for quality tracking */
  extractionMethodBreakdown?: {
    figures: Array<{ method: string; count: number }>
    tables: Array<{ method: string; count: number }>
    formulas: Array<{ method: string; count: number }>
  }
  /** Statistics about filtered assets */
  filterStats?: {
    figuresFiltered: number
    tablesFiltered: number
    formulasFiltered: number
  }
  /** Page images rendered for VLM fallback analysis */
  pageImages?: Array<{
    pageNumber: number
    path: string
    reason: 'no_figures' | 'low_confidence'
    figureCount: number
    avgConfidence: number
  }>
  qualityWarnings?: Array<{
    code:
      | 'missing_visual_assets'
      | 'missing_table_formula_coverage'
      | 'filtered_assets'
      | 'vlm_fallback_pages'
      | 'latent_coverage_gap'
    message: string
    severity: 'info' | 'warning' | 'critical'
  }>
}

export interface ExtractionOptions {
  extractFigures: boolean
  extractTables: boolean
  extractFormulas: boolean
  extractText: boolean
  figureMinSize?: { width: number; height: number }
  tableMinRows?: number
  /** Extraction method configuration */
  methodConfig?: Partial<ExtractionMethodConfig>
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  extractFigures: true,
  extractTables: true,
  extractFormulas: true,
  extractText: true,
  figureMinSize: { width: 100, height: 100 },
  tableMinRows: 2,
  methodConfig: DEFAULT_METHOD_CONFIG,
}

const PDF_MAGIC_HEADER = Buffer.from('%PDF-')

function resolvePdfExtractScriptPath() {
  return path.join(process.cwd(), 'scripts', 'pdf_extract.py')
}

function resolveMarkerExtractScriptPath() {
  return path.join(process.cwd(), 'scripts', 'marker_extract.py')
}

function normalizePdfBuffer(buffer: Buffer) {
  let start = 0
  while (start < buffer.length && /\s/u.test(String.fromCharCode(buffer[start] ?? 0))) {
    start += 1
  }
  return start > 0 ? buffer.subarray(start) : buffer
}

function isPdfBuffer(buffer: Buffer) {
  const normalized = normalizePdfBuffer(buffer)
  return normalized.subarray(0, PDF_MAGIC_HEADER.length).equals(PDF_MAGIC_HEADER)
}

function extractDoiFromValue(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null

  const doiUrlMatch = normalized.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/iu)
  if (doiUrlMatch) return decodeURIComponent(doiUrlMatch[1])

  const bareDoiMatch = normalized.match(/^(10\.\d{4,9}\/[^\s?#]+)$/iu)
  if (bareDoiMatch) return decodeURIComponent(bareDoiMatch[1])

  return null
}

function toAbsoluteUrl(candidate: string, baseUrl: string) {
  try {
    return new URL(candidate, baseUrl).toString()
  } catch {
    return null
  }
}

function collectPdfUrlsFromHtml(html: string, baseUrl: string) {
  const candidates = new Set<string>()

  const attributePatterns = [
    /<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["'][^>]*>/giu,
    /<meta[^>]+property=["']citation_pdf_url["'][^>]+content=["']([^"']+)["'][^>]*>/giu,
    /["'](https?:\/\/[^"']+\.pdf(?:\?[^"']*)?)["']/giu,
    /["'](\/[^"']+\.pdf(?:\?[^"']*)?)["']/giu,
    /["']((?:\.\/|\.\.\/)[^"']+\.pdf(?:\?[^"']*)?)["']/giu,
  ]

  for (const pattern of attributePatterns) {
    for (const match of html.matchAll(pattern)) {
      const candidate = match[1]?.trim()
      if (!candidate) continue
      const absolute = toAbsoluteUrl(candidate, baseUrl)
      if (absolute) candidates.add(absolute)
    }
  }

  return Array.from(candidates)
}

async function fetchCrossrefPdfUrls(doi: string) {
  const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: {
      'user-agent': 'TraceMind/1.0 (mailto:trace@example.com)',
      'accept': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Crossref lookup failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as {
    message?: {
      link?: Array<{ URL?: string | null }>
      resource?: { primary?: { URL?: string | null } | null } | null
    }
  }

  const candidates = new Set<string>()
  const links = Array.isArray(payload.message?.link) ? payload.message?.link : []
  for (const link of links) {
    const url = link?.URL?.trim()
    if (url) candidates.add(url)
  }

  const primaryUrl = payload.message?.resource?.primary?.URL?.trim()
  if (primaryUrl) {
    candidates.add(primaryUrl)

    const ieeeDocumentMatch = primaryUrl.match(/ieeexplore\.ieee\.org\/document\/(\d+)\/?$/iu)
    if (ieeeDocumentMatch) {
      const arnumber = ieeeDocumentMatch[1]
      candidates.add(`https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=${arnumber}`)
      candidates.add(`https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=${arnumber}&ref=`)
    }
  }

  return Array.from(candidates)
}

async function resolveAlternativePdfUrls(args: {
  requestedUrl: string
  finalUrl: string
  html: string
}) {
  const candidates = new Set<string>()

  for (const candidate of collectPdfUrlsFromHtml(args.html, args.finalUrl)) {
    candidates.add(candidate)
  }

  const doi =
    extractDoiFromValue(args.requestedUrl) ??
    extractDoiFromValue(args.finalUrl) ??
    extractDoiFromValue(args.html)

  if (doi) {
    try {
      for (const candidate of await fetchCrossrefPdfUrls(doi)) {
        candidates.add(candidate)
      }
    } catch (error) {
      logger.warn('Crossref PDF resolution failed during PDF download fallback', {
        doi,
        error,
      })
    }
  }

  return Array.from(candidates)
}

async function downloadPdfBufferWithFallback(
  pdfUrl: string,
  visited: Set<string>,
  depth: number,
): Promise<Buffer> {
  if (depth > 4) {
    throw new Error(`PDF download exceeded fallback depth while resolving ${pdfUrl}`)
  }

  if (visited.has(pdfUrl)) {
    throw new Error(`PDF download entered a resolution loop for ${pdfUrl}`)
  }
  visited.add(pdfUrl)

  const response = await fetch(pdfUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept': 'application/pdf,text/html;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') ?? ''
  if (isPdfBuffer(pdfBuffer)) {
    return pdfBuffer
  }

  const html =
    /^text\/html\b/iu.test(contentType) || /^application\/xhtml\+xml\b/iu.test(contentType)
      ? pdfBuffer.toString('utf8')
      : ''

  if (html) {
    const alternatives = await resolveAlternativePdfUrls({
      requestedUrl: pdfUrl,
      finalUrl: response.url,
      html,
    })

    for (const candidate of alternatives) {
      if (!candidate || visited.has(candidate)) continue
      try {
        return await downloadPdfBufferWithFallback(candidate, visited, depth + 1)
      } catch (error) {
        logger.warn('Alternative PDF candidate failed', {
          requestedUrl: pdfUrl,
          candidate,
          error,
        })
      }
    }
  }

  throw new Error(
    `Downloaded resource is not a valid PDF (content-type: ${contentType || 'unknown'}).`,
  )
}

function parseExtractionStdoutPayload(stdout: string) {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('Extractor returned empty stdout.')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const candidateStarts = Array.from(
      new Set(
        [trimmed.indexOf('{'), ...Array.from(trimmed.matchAll(/\n\{/gu)).map((match) => match.index + 1)].filter(
          (index): index is number => index >= 0,
        ),
      ),
    )

    for (const start of candidateStarts) {
      const candidate = trimmed.slice(start).trim()
      if (!candidate.startsWith('{')) continue

      try {
        return JSON.parse(candidate)
      } catch {
        continue
      }
    }
  }

  throw new Error('Could not find a valid JSON payload in extractor stdout.')
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toRowRecords(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) return []

  return value.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return []

    const entries = Object.entries(row as Record<string, unknown>).reduce<Record<string, string>>(
      (output, [key, cell]) => {
        const normalizedKey = key.trim()
        if (!normalizedKey) return output
        output[normalizedKey] = typeof cell === 'string' ? cell.trim() : String(cell ?? '')
        return output
      },
      {},
    )

    return Object.keys(entries).length > 0 ? [entries] : []
  })
}

const TABLE_RECOVERY_CAPTION_RE = /^(?:table|表)\s*(\d+)[\s.:：-]*(.*)$/iu
const RECOVERY_STOP_LINE_RE =
  /^(?:figure|fig(?:ure)?\.?|table|表|eq(?:uation)?\.?|equation|式)\b/iu
const RECOVERY_SECTION_TITLE_RE =
  /^(?:abstract|introduction|background|method|methods|approach|results?|discussion|conclusion|references?)$/iu
const FORMULA_RECOVERY_LATEX_RE =
  /\\(?:frac|sum|prod|min|max|argmax|argmin|theta|lambda|sigma|alpha|beta|gamma|mathbb|mathbf|mathcal|left|right|log|exp)/u
const FORMULA_RECOVERY_ASSIGNMENT_RE = /(?:<=|>=|:=|->|=>|=)/u
const FORMULA_RECOVERY_FUNCTION_RE = /\b[A-Za-z][A-Za-z0-9_]*\([^)]{1,80}\)/u

function normalizeRecoveryLine(value: string | null | undefined) {
  return (value ?? '')
    .replace(/\r\n/gu, '\n')
    .replaceAll('\0', ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function guessPageForSnippet(
  pages: ExtractedPage[],
  snippet: string,
  fallbackPage = 0,
) {
  const normalizedSnippet = normalizeRecoveryLine(snippet).toLowerCase()
  if (!normalizedSnippet) return fallbackPage

  const searchNeedle =
    normalizedSnippet.length > 96 ? normalizedSnippet.slice(0, 96) : normalizedSnippet

  for (const page of pages) {
    const normalizedPageText = normalizeRecoveryLine(page.text).toLowerCase()
    if (normalizedPageText.includes(searchNeedle)) {
      return page.pageNumber || fallbackPage
    }
  }

  return fallbackPage
}

function splitRecoveredCells(line: string) {
  const cleanedLine = (line ?? '').replace(/\r/gu, '').trim()
  if (!cleanedLine) return []

  const pipeCells = cleanedLine
    .replace(/^\|/u, '')
    .replace(/\|$/u, '')
    .split('|')
    .map((cell) => normalizeRecoveryLine(cell))
    .filter(Boolean)
  if (pipeCells.length >= 2) return pipeCells

  const tabCells = cleanedLine
    .split(/\t+/u)
    .map((cell) => normalizeRecoveryLine(cell))
    .filter(Boolean)
  if (tabCells.length >= 2) return tabCells

  const spacedCells = cleanedLine
    .split(/\s{2,}/u)
    .map((cell) => normalizeRecoveryLine(cell))
    .filter(Boolean)
  if (spacedCells.length >= 2) return spacedCells

  return []
}

function recoverTablesFromText(args: {
  sourceText: string
  pages: ExtractedPage[]
}) {
  const rawLines = args.sourceText.replace(/\r\n/gu, '\n').split('\n')
  const recoveredTables: ExtractedTable[] = []
  const seenCaptions = new Set<string>()

  for (let index = 0; index < rawLines.length; index += 1) {
    const caption = normalizeRecoveryLine(rawLines[index])
    const captionMatch = TABLE_RECOVERY_CAPTION_RE.exec(caption)
    if (!captionMatch) continue

    const normalizedCaption = caption.toLowerCase()
    if (seenCaptions.has(normalizedCaption)) continue
    seenCaptions.add(normalizedCaption)

    const bodyLines: string[] = []
    for (let lookahead = index + 1; lookahead < Math.min(rawLines.length, index + 8); lookahead += 1) {
      const rawCandidate = rawLines[lookahead] ?? ''
      const candidate = normalizeRecoveryLine(rawCandidate)
      if (!candidate) {
        if (bodyLines.length > 0) break
        continue
      }
      if (RECOVERY_STOP_LINE_RE.test(candidate) && bodyLines.length > 0) break
      if (RECOVERY_SECTION_TITLE_RE.test(candidate) && bodyLines.length > 0) break
      bodyLines.push(rawCandidate)
    }

    if (bodyLines.length === 0) continue

    const structuredRows = bodyLines
      .map((line) => splitRecoveredCells(line))
      .filter((cells) => cells.length >= 2)
    const page = guessPageForSnippet(args.pages, caption, 0)
    const number = Number(captionMatch[1]) || recoveredTables.length + 1

    if (structuredRows.length >= 2) {
      const headerCells = structuredRows[0].map((cell, cellIndex) => cell || `Column ${cellIndex + 1}`)
      const rows = structuredRows.slice(1).map((cells) =>
        headerCells.reduce<Record<string, string>>((record, header, headerIndex) => {
          record[header] = cells[headerIndex] ?? ''
          return record
        }, {}),
      )

      recoveredTables.push({
        id: `table_recovered_${recoveredTables.length + 1}`,
        number,
        caption,
        page,
        headers: headerCells,
        rows,
        rawText: [caption, ...bodyLines].join('\n'),
        bbox: [],
        confidence: 0.8,
        extractionMethod: 'text-recovery',
        lowConfidenceWarning: false,
      })
      continue
    }

    const observation = bodyLines.slice(0, 3).join(' ')
    if (!observation) continue

    recoveredTables.push({
      id: `table_recovered_${recoveredTables.length + 1}`,
      number,
      caption,
      page,
      headers: ['Observation'],
      rows: [{ Observation: observation }],
      rawText: [caption, ...bodyLines].join('\n'),
      bbox: [],
      confidence: 0.76,
      extractionMethod: 'text-recovery',
      lowConfidenceWarning: false,
    })
  }

  return recoveredTables.slice(0, 8)
}

function recoverFormulasFromText(args: {
  sourceText: string
  pages: ExtractedPage[]
  tables: ExtractedTable[]
}) {
  const pseudoSections =
    args.pages.length > 0
      ? args.pages
          .map((page) => ({
            id: `recovery-page-${page.pageNumber || 0}`,
            editorialTitle: `Page ${page.pageNumber || 0}`,
            sourceSectionTitle: `Page ${page.pageNumber || 0}`,
            paragraphs: page.text,
          }))
          .filter((page) => normalizeRecoveryLine(page.paragraphs).length > 0)
      : [
          {
            id: 'recovery-source',
            editorialTitle: 'Recovered formula context',
            sourceSectionTitle: 'Recovered formula context',
            paragraphs: args.sourceText,
          },
        ]

  const artifacts = collectPaperFormulaArtifacts({
    formulas: [],
    tables: args.tables.map((table) => ({
      id: table.id,
      number: table.number,
      caption: table.caption,
      rawText: table.rawText,
      page: table.page,
    })),
    paper_sections: pseudoSections,
  })
  const seen = new Set<string>()
  const recovered = artifacts
    .flatMap((artifact, index) => {
      const rawText = normalizeRecoveryLine(artifact.rawText || artifact.latex || '')
      const latex = normalizeRecoveryLine(artifact.latex || rawText)
      const primary = latex || rawText
      if (!primary) return []

      const dedupeKey = primary.toLowerCase()
      if (seen.has(dedupeKey)) return []
      seen.add(dedupeKey)

      return [
        {
          id: `formula_recovered_${index + 1}`,
          number: String(artifact.number ?? index + 1),
          latex,
          rawText: rawText || primary,
          page: artifact.page ?? guessPageForSnippet(args.pages, primary, 0),
          type: 'display',
          bbox: null,
          imagePath: null,
          confidence: 0.58,
          extractionMethod: 'text-recovery',
          lowConfidenceWarning: false,
        } satisfies ExtractedFormula,
      ]
    })
  if (recovered.length >= 8) {
    return recovered.slice(0, 8)
  }

  const lines = args.sourceText.replace(/\r\n/gu, '\n').split('\n')
  for (const line of lines) {
    const normalized = normalizeRecoveryLine(line)
    if (!normalized) continue

    const hasLatex = FORMULA_RECOVERY_LATEX_RE.test(normalized)
    const hasAssignment = FORMULA_RECOVERY_ASSIGNMENT_RE.test(normalized)
    const hasFunction = FORMULA_RECOVERY_FUNCTION_RE.test(normalized)
    const naturalWordCount = normalized.match(/\b[A-Za-z]{4,}\b/gu)?.length ?? 0

    if ((!hasLatex && !hasAssignment) || (!hasFunction && !hasLatex)) continue
    if (naturalWordCount > 7 && !hasLatex) continue

    const dedupeKey = normalized.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    recovered.push({
      id: `formula_recovered_${recovered.length + 1}`,
      number: String(recovered.length + 1),
      latex: normalized,
      rawText: normalized,
      page: guessPageForSnippet(args.pages, normalized, 0),
      type: 'display',
      bbox: null,
      imagePath: null,
      confidence: 0.58,
      extractionMethod: 'text-recovery',
      lowConfidenceWarning: false,
    })

    if (recovered.length >= 8) break
  }

  return recovered
}

/**
 * Detect figure groups from extracted figures for non-arXiv papers.
 * Uses caption patterns like "Figure 1(a)", "Figure 1(b)", "Fig. 2a, 2b" to identify groups.
 */
function detectFigureGroupsFromFigures(figures: ExtractedFigure[]): ExtractedFigureGroup[] {
  const groups: ExtractedFigureGroup[] = []
  const groupMap = new Map<number, ExtractedFigure[]>()

  // Pattern to match figure numbers with sub-figures: "1(a)", "1a", "2(b)", "2b", etc.
  const subFigurePattern = /^(\d+)\s*[\(\[]?([a-z])[\)\]]?/i
  const captionPattern = /fig(?:ure)?\.?\s*(\d+)\s*[\(\[]?([a-z])[\)\]]?/i

  for (const figure of figures) {
    const caption = figure.caption || ''

    // Try to extract parent number and sub-figure index from caption
    let parentNumber: number | null = null
    let subIndex: string | null = null

    // Match patterns like "Figure 1(a)" or "Fig. 2b"
    const captionMatch = caption.match(captionPattern)
    if (captionMatch) {
      parentNumber = parseInt(captionMatch[1], 10)
      subIndex = captionMatch[2].toLowerCase()
    }

    // Also try matching from figure number if caption doesn't have sub-index
    if (!subIndex && figure.number) {
      const numStr = String(figure.number)
      const numMatch = numStr.match(subFigurePattern)
      if (numMatch) {
        parentNumber = parseInt(numMatch[1], 10)
        subIndex = numMatch[2].toLowerCase()
      }
    }

    // If we found a sub-figure pattern, add it to the group
    if (parentNumber !== null && subIndex !== null) {
      if (!groupMap.has(parentNumber)) {
        groupMap.set(parentNumber, [])
      }
      groupMap.get(parentNumber)!.push(figure)
    }
  }

  // Convert groups to ExtractedFigureGroup format
  for (const [parentNumber, subFigures] of groupMap) {
    // Only create group if there are at least 2 sub-figures
    if (subFigures.length >= 2) {
      const groupId = `figure_group_${parentNumber}`
      const caption = subFigures[0]?.caption || `Figure ${parentNumber}`

      groups.push({
        groupId,
        parentNumber,
        caption,
        subFigures: subFigures.map((fig, idx) => ({
          index: String.fromCharCode(97 + idx), // a, b, c, ...
          figureId: fig.id,
          subId: `${fig.id}_sub_${idx}`,
          imagePath: fig.imagePath || '',
          caption: fig.caption,
          page: fig.page,
          confidence: fig.confidence,
        })),
        confidence: Math.min(...subFigures.map(f => f.confidence ?? 0.7)),
        extractionMethod: 'caption-pattern',
      })
    }
  }

  return groups
}

function normalizeExtractionResultPayload(
  result: any,
  paperId: string,
  paperTitle: string,
  methodConfig: ExtractionMethodConfig = DEFAULT_METHOD_CONFIG,
): PDFExtractionResult {
  const figureThreshold = methodConfig.figureConfidenceThreshold
  const tableThreshold = methodConfig.tableConfidenceThreshold
  const formulaThreshold = methodConfig.formulaConfidenceThreshold
  const includeLowConfidence = methodConfig.includeLowConfidenceAssets
  const pages: ExtractedPage[] = Array.isArray(result.pages)
    ? result.pages.map((page: any) => ({
        pageNumber: Number(page.pageNumber) || 0,
        text: typeof page.text === 'string' ? page.text : '',
        blocks: Array.isArray(page.blocks)
          ? page.blocks.map((block: any) => ({
              bbox: Array.isArray(block?.bbox) ? block.bbox : [],
              text: typeof block?.text === 'string' ? block.text : '',
              type: typeof block?.type === 'string' ? block.type : 'text',
            }))
          : [],
      }))
    : []
  const sections: ExtractedSection[] | undefined = Array.isArray(result.sections)
    ? result.sections.flatMap((section: any) => {
        const sourceSectionTitle =
          typeof section?.sourceSectionTitle === 'string'
            ? section.sourceSectionTitle.trim()
            : ''
        const editorialTitle =
          typeof section?.editorialTitle === 'string'
            ? section.editorialTitle.trim()
            : sourceSectionTitle
        const paragraphs = toStringArray(section?.paragraphs)

        if (!sourceSectionTitle || paragraphs.length === 0) return []

        return [
          {
            sourceSectionTitle,
            editorialTitle: editorialTitle || sourceSectionTitle,
            paragraphs,
            pageStart: Number(section?.pageStart) || undefined,
            pageEnd: Number(section?.pageEnd) || undefined,
          } satisfies ExtractedSection,
        ]
      })
    : undefined
  const recoverySourceText = [
    typeof result.fullText === 'string' ? result.fullText : '',
    typeof result.markdown === 'string' ? result.markdown : '',
    ...pages.map((page) => page.text),
    ...(sections?.flatMap((section) => section.paragraphs) ?? []),
  ].join('\n')

  // Filter figures by confidence threshold
  const allFigures = Array.isArray(result.figures)
    ? result.figures.map((figure: any, index: number) => {
        const confidence =
          typeof figure.confidence === 'number' && Number.isFinite(figure.confidence)
            ? figure.confidence
            : null
        const extractionMethod = figure.extractionMethod || null
        const lowConfidenceWarning = confidence !== null && confidence < figureThreshold

        return {
          id: figure.id,
          number: Number(figure.number) || index + 1,
          caption:
            (typeof figure.caption === 'string' && figure.caption.trim()) || `Figure ${index + 1}`,
          page: Number(figure.page) || 0,
          imagePath:
            (typeof figure.path === 'string' && figure.path) ||
            (typeof figure.imagePath === 'string' && figure.imagePath) ||
            '',
          width: Number(figure.width) || 0,
          height: Number(figure.height) || 0,
          bbox: Array.isArray(figure.bbox) ? figure.bbox : null,
          confidence,
          extractionMethod,
          lowConfidenceWarning,
        }
      })
    : []

  const figures = includeLowConfidence
    ? allFigures
    : allFigures.filter((f: ExtractedFigure) => f.confidence === null || (f.confidence ?? 0) >= figureThreshold)

  // Filter tables by confidence threshold
  const allTables = Array.isArray(result.tables)
    ? result.tables.map((table: any, index: number) => {
        const confidence =
          typeof table.confidence === 'number' && Number.isFinite(table.confidence)
            ? table.confidence
            : null
        const extractionMethod = table.extractionMethod || null
        const lowConfidenceWarning = confidence !== null && confidence < tableThreshold

        return {
          id: table.id,
          number: Number(table.number) || index + 1,
          caption:
            (typeof table.caption === 'string' && table.caption.trim()) || `Table ${index + 1}`,
          page: Number(table.page) || 0,
          headers: toStringArray(table.headers),
          rows: toRowRecords(table.rows),
          rawText:
            (typeof table.rawText === 'string' && table.rawText) ||
            (typeof table.text === 'string' && table.text) ||
            '',
          bbox: Array.isArray(table.bbox) ? table.bbox : [],
          confidence,
          extractionMethod,
          lowConfidenceWarning,
        }
      })
    : []

  const tables = includeLowConfidence
    ? allTables
    : allTables.filter((t: ExtractedTable) => t.confidence === null || (t.confidence ?? 0) >= tableThreshold)

  // Filter formulas by confidence threshold
  const allFormulas = Array.isArray(result.formulas)
    ? result.formulas.map((formula: any, index: number) => {
        const confidence =
          typeof formula.confidence === 'number' && Number.isFinite(formula.confidence)
            ? formula.confidence
            : null
        const extractionMethod = formula.extractionMethod || null
        const lowConfidenceWarning = confidence !== null && confidence < formulaThreshold

        return {
          id: formula.id,
          number:
            (typeof formula.number === 'string' && formula.number) ||
            String(formula.id?.split('_').pop() || index + 1),
          latex: typeof formula.latex === 'string' ? formula.latex : '',
          rawText:
            (typeof formula.raw === 'string' && formula.raw) ||
            (typeof formula.rawText === 'string' && formula.rawText) ||
            (typeof formula.latex === 'string' ? formula.latex : ''),
          page: Number(formula.page) || 0,
          type: formula.type === 'inline' ? 'inline' : 'display',
          bbox: Array.isArray(formula.bbox) ? formula.bbox : null,
          imagePath:
            (typeof formula.path === 'string' && formula.path) ||
            (typeof formula.imagePath === 'string' && formula.imagePath) ||
            null,
          confidence,
          extractionMethod,
          lowConfidenceWarning,
        }
      })
    : []

  const formulas = includeLowConfidence
    ? allFormulas
    : allFormulas.filter((f: ExtractedFormula) => f.confidence === null || (f.confidence ?? 0) >= formulaThreshold)

  const recoveredTables =
    tables.length === 0
      ? recoverTablesFromText({
          sourceText: recoverySourceText,
          pages,
        })
      : []
  const effectiveTables = tables.length > 0 ? tables : recoveredTables

  const recoveredFormulas =
    formulas.length === 0
      ? recoverFormulasFromText({
          sourceText: recoverySourceText,
          pages,
          tables: effectiveTables,
        })
      : []
  const effectiveFormulas = formulas.length > 0 ? formulas : recoveredFormulas

  // Parse figure groups (组图) from extraction result or detect from figures
  let figureGroups: ExtractedFigureGroup[] = Array.isArray(result.figureGroups)
    ? result.figureGroups.map((group: any) => ({
        groupId: String(group.groupId || ''),
        parentNumber: group.parentNumber ?? 0,
        caption: String(group.caption || ''),
        subFigures: Array.isArray(group.subFigures)
          ? group.subFigures.map((sub: any) => ({
              index: String(sub.index || ''),
              figureId: String(sub.figureId || ''),
              subId: String(sub.subId || ''),
              imagePath: String(sub.imagePath || ''),
              caption: String(sub.caption || ''),
              page: Number(sub.page) || 0,
              confidence: typeof sub.confidence === 'number' && Number.isFinite(sub.confidence) ? sub.confidence : null,
            }))
          : [],
        confidence: typeof group.confidence === 'number' && Number.isFinite(group.confidence) ? group.confidence : 0.5,
        extractionMethod: String(group.extractionMethod || 'pymupdf'),
      }))
    : []

  // Fallback: detect figure groups from extracted figures for non-arXiv papers
  if (figureGroups.length === 0 && figures.length >= 2) {
    figureGroups = detectFigureGroupsFromFigures(figures)
  }

  const pageImages = Array.isArray(result.pageImages)
    ? result.pageImages.map((pageImage: any) => ({
        pageNumber: Number(pageImage.pageNumber) || 0,
        path: typeof pageImage.path === 'string' ? pageImage.path : '',
        reason: pageImage.reason === 'no_figures' || pageImage.reason === 'low_confidence'
          ? pageImage.reason
          : 'no_figures',
        figureCount: Number(pageImage.figureCount) || 0,
        avgConfidence: Number(pageImage.avgConfidence) || 0,
      }))
    : undefined

  const qualityWarnings = buildExtractionQualityWarnings({
    pageCount: Number(result.pageCount) || 0,
    figures,
    tables: effectiveTables,
    formulas: effectiveFormulas,
    filteredCounts: {
      figures: allFigures.length - figures.length,
      tables: allTables.length - tables.length,
      formulas: allFormulas.length - formulas.length,
    },
    pageImages,
    sourceText: recoverySourceText,
  })

  return {
    paperId: result.paperId || paperId,
    paperTitle: result.paperTitle || paperTitle,
    pageCount: Number(result.pageCount) || 0,
    coverPath: typeof result.coverPath === 'string' ? result.coverPath : undefined,
    abstract: typeof result.abstract === 'string' ? result.abstract : undefined,
    fullText: typeof result.fullText === 'string' ? result.fullText : '',
    markdown: typeof result.markdown === 'string' ? result.markdown : undefined,
    pages,
    figures,
    tables: effectiveTables,
    formulas: effectiveFormulas,
    figureGroups,
    sections,
    metadata: {
      title: result.metadata?.title ?? '',
      author: result.metadata?.author ?? '',
      subject: result.metadata?.subject ?? '',
      creator: result.metadata?.creator ?? '',
      producer: result.metadata?.producer ?? '',
    },
    extractionMethod: result.extractionMethod || undefined,
    markerAvailable: result.markerAvailable ?? undefined,
    doclayoutYoloAvailable: result.doclayoutYoloAvailable ?? undefined,
    requestedMethod: result.requestedMethod ?? undefined,
    filterStats: {
      figuresFiltered: allFigures.length - figures.length,
      tablesFiltered: allTables.length - tables.length,
      formulasFiltered: allFormulas.length - formulas.length,
    },
    pageImages,
    qualityWarnings,
  }
}

/**
 * Extract arXiv ID from paper ID or title.
 * Paper IDs like "2301.10945" or "arXiv:2301.10945" are arXiv identifiers.
 */
function extractArxivIdFromPaperId(paperId: string, paperTitle: string): string | null {
  // Direct arXiv ID pattern in paperId
  const directMatch = paperId.match(/^(?:arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)$/iu)
  if (directMatch) return directMatch[1]

  // arXiv ID embedded in paperId with prefix
  const prefixedMatch = paperId.match(/arxiv[:_\-](\d{4}\.\d{4,5}(?:v\d+)?)/iu)
  if (prefixedMatch) return prefixedMatch[1]

  // Check title for arXiv ID pattern (e.g., "2301.10945 Some Title")
  const titleMatch = paperTitle.match(/(\d{4}\.\d{4,5}(?:v\d+)?)/u)
  if (titleMatch) return titleMatch[1]

  return null
}

/**
 * Merge arXiv source-extracted figures into the PDF extraction result.
 * Strategy: Replace low-confidence PDF figures with high-confidence source figures,
 * and add any source figures not present in the PDF extraction.
 */
function mergeArxivSourceFigures(
  pdfResult: PDFExtractionResult,
  arxivResult: import('./arxiv-source-extractor').ArxivExtractionResult,
  figureThreshold: number,
): PDFExtractionResult {
  const sourceFigures = arxivResult.figures
  const sourceFigureGroups = arxivResult.figureGroups

  // Index existing PDF figures by number
  const pdfFigureByNumber = new Map<number, ExtractedFigure>()
  for (const fig of pdfResult.figures) {
    pdfFigureByNumber.set(fig.number, fig)
  }

  const mergedFigures = [...pdfResult.figures]
  const replacedIndices = new Set<number>()

  // Replace low-confidence PDF figures with high-confidence source figures
  for (const sourceFig of sourceFigures) {
    const existingFig = pdfFigureByNumber.get(sourceFig.number)

    if (existingFig && (existingFig.confidence ?? 0) < figureThreshold && sourceFig.confidence > (existingFig.confidence ?? 0)) {
      // Replace with higher-confidence source figure
      const replaceIndex = mergedFigures.findIndex((f) => f.id === existingFig.id)
      if (replaceIndex >= 0) {
        mergedFigures[replaceIndex] = {
          ...existingFig,
          imagePath: sourceFig.imagePath || existingFig.imagePath,
          width: sourceFig.width || existingFig.width,
          height: sourceFig.height || existingFig.height,
          confidence: sourceFig.confidence,
          extractionMethod: `${existingFig.extractionMethod ?? 'pymupdf'}+arxiv-source`,
          lowConfidenceWarning: false,
        }
        replacedIndices.add(replaceIndex)
      }
    } else if (!existingFig && !sourceFig.isSubFigure) {
      // Add new figure from source not present in PDF extraction
      mergedFigures.push({
        id: sourceFig.id,
        number: sourceFig.number,
        caption: sourceFig.caption,
        page: 0,
        imagePath: sourceFig.imagePath,
        width: sourceFig.width,
        height: sourceFig.height,
        bbox: null,
        confidence: sourceFig.confidence,
        extractionMethod: 'arxiv-source',
        lowConfidenceWarning: false,
      })
    }
  }

  // Merge figure groups - source figure groups take priority
  const mergedFigureGroups = [...pdfResult.figureGroups]

  for (const sourceGroup of sourceFigureGroups) {
    const existingGroupIndex = mergedFigureGroups.findIndex(
      (g) => g.parentNumber === sourceGroup.parentNumber
    )

    if (existingGroupIndex >= 0) {
      // Upgrade existing group with source sub-figures if source has more sub-figures
      const existing = mergedFigureGroups[existingGroupIndex]
      if (sourceGroup.subFigures.length > existing.subFigures.length) {
        mergedFigureGroups[existingGroupIndex] = {
          ...existing,
          subFigures: sourceGroup.subFigures.map((sub) => ({
            index: sub.subId ?? String(sub.number),
            figureId: sub.id,
            subId: sub.subId ?? String(sub.number),
            imagePath: sub.imagePath,
            caption: sub.caption,
            page: 0,
            confidence: sub.confidence,
          })),
          confidence: Math.max(existing.confidence, sourceGroup.confidence),
          extractionMethod: `${existing.extractionMethod}+arxiv-source`,
        }
      }
    } else {
      // Add new figure group from source
      mergedFigureGroups.push({
        groupId: sourceGroup.groupId,
        parentNumber: sourceGroup.parentNumber,
        caption: sourceGroup.caption,
        subFigures: sourceGroup.subFigures.map((sub) => ({
          index: sub.subId ?? String(sub.number),
          figureId: sub.id,
          subId: sub.subId ?? String(sub.number),
          imagePath: sub.imagePath,
          caption: sub.caption,
          page: 0,
          confidence: sub.confidence,
        })),
        confidence: sourceGroup.confidence,
        extractionMethod: 'arxiv-source',
      })
    }
  }

  return {
    ...pdfResult,
    figures: mergedFigures,
    figureGroups: mergedFigureGroups,
  }
}

/**
 * Compute a breakdown of extraction methods used per asset type.
 * This helps with debugging and quality tracking.
 */
function computeExtractionMethodBreakdown(result: PDFExtractionResult): PDFExtractionResult['extractionMethodBreakdown'] {
  function countMethods(items: Array<{ extractionMethod?: string | null }>): Array<{ method: string; count: number }> {
    const map = new Map<string, number>()
    for (const item of items) {
      const method = item.extractionMethod || 'unknown'
      map.set(method, (map.get(method) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count)
  }

  return {
    figures: countMethods(result.figures),
    tables: countMethods(result.tables),
    formulas: countMethods(result.formulas),
  }
}

function countPatternMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length
}

export function detectLatentCoverageSignals(text: string | null | undefined) {
  const normalized = (text ?? '').toLowerCase()
  if (!normalized.trim()) {
    return {
      tableCueCount: 0,
      formulaCueCount: 0,
    }
  }

  return {
    tableCueCount:
      countPatternMatches(normalized, /\btable\s+\d+\b/gu) +
      countPatternMatches(normalized, /\|[^|\n]+\|[^|\n]+\|/gu),
    formulaCueCount:
      countPatternMatches(normalized, /\beq(?:uation)?\.?\s*\(?\d+\)?/gu) +
      countPatternMatches(normalized, /\\(?:frac|sum|prod|min|max|alpha|beta|gamma|theta|lambda)/gu) +
      countPatternMatches(normalized, /\b[a-z][a-z0-9_]{0,5}\s*=\s*[^=\n]{2,}/gu),
  }
}

export function buildExtractionQualityWarnings(args: {
  pageCount: number
  figures: ExtractedFigure[]
  tables: ExtractedTable[]
  formulas: ExtractedFormula[]
  filteredCounts: { figures: number; tables: number; formulas: number }
  pageImages?: PDFExtractionResult['pageImages']
  sourceText?: string
}): PDFExtractionResult['qualityWarnings'] {
  const warnings: NonNullable<PDFExtractionResult['qualityWarnings']> = []

  if (args.pageCount >= 2 && args.figures.length === 0 && args.tables.length === 0 && args.formulas.length === 0) {
    warnings.push({
      code: 'missing_visual_assets',
      severity: 'critical',
      message: 'No figures, tables, or formulas survived extraction for a multi-page paper.',
    })
  }

  if (args.pageCount >= 6 && args.figures.length > 0 && args.tables.length === 0 && args.formulas.length === 0) {
    warnings.push({
      code: 'missing_table_formula_coverage',
      severity: 'warning',
      message: 'Figures were extracted, but no tables or formulas were recovered from a long paper.',
    })
  }

  const filteredTotal = args.filteredCounts.figures + args.filteredCounts.tables + args.filteredCounts.formulas
  if (filteredTotal > 0) {
    warnings.push({
      code: 'filtered_assets',
      severity: filteredTotal >= 3 ? 'warning' : 'info',
      message: `${filteredTotal} low-confidence visual assets were filtered and may need fallback review.`,
    })
  }

  if ((args.pageImages?.length ?? 0) > 0) {
    warnings.push({
      code: 'vlm_fallback_pages',
      severity: 'warning',
      message: `${args.pageImages?.length ?? 0} pages were rendered for vision fallback because extraction looked incomplete.`,
    })
  }

  const latentSignals = detectLatentCoverageSignals(args.sourceText)
  if (args.tables.length === 0 && latentSignals.tableCueCount > 0) {
    warnings.push({
      code: 'latent_coverage_gap',
      severity: 'warning',
      message: `Detected ${latentSignals.tableCueCount} table-like cues in text, but no structured tables were extracted.`,
    })
  }
  if (args.formulas.length === 0 && latentSignals.formulaCueCount > 0) {
    warnings.push({
      code: 'latent_coverage_gap',
      severity: 'warning',
      message: `Detected ${latentSignals.formulaCueCount} equation-like cues in text, but no formulas were extracted.`,
    })
  }

  return warnings
}

export async function downloadPdfBufferFromUrl(pdfUrl: string) {
  return downloadPdfBufferWithFallback(pdfUrl, new Set<string>(), 0)
}

export async function extractPDFWithPython(
  pdfPath: string,
  outputDir: string,
  paperId: string,
  paperTitle: string,
  methodConfig?: Partial<ExtractionMethodConfig>,
): Promise<PDFExtractionResult> {
  const pdfExtractScriptPath = resolvePdfExtractScriptPath()
  const markerExtractScriptPath = resolveMarkerExtractScriptPath()
  const config: ExtractionMethodConfig = { ...DEFAULT_METHOD_CONFIG, ...methodConfig }

  if (!fs.existsSync(pdfExtractScriptPath)) {
    throw new Error(`Python script not found: ${pdfExtractScriptPath}`)
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`)
  }

  // Check Marker availability first for 'auto' method
  const markerAvailable = fs.existsSync(markerExtractScriptPath)
  const useMarkerPrimary = config.method === 'auto' || config.method === 'marker'

  // Try Marker first if available and method allows it
  if (useMarkerPrimary && markerAvailable) {
    logger.info('Attempting Marker extraction first', { paperId, pdfPath })

    try {
      const markerResult = await runPythonExtraction(
        markerExtractScriptPath,
        pdfPath,
        outputDir,
        paperId,
        paperTitle,
      )

      if (!markerResult.error) {
        logger.info('Marker extraction succeeded', {
          paperId,
          pageCount: markerResult.pageCount,
          figureCount: markerResult.figures?.length ?? 0,
          tableCount: markerResult.tables?.length ?? 0,
          formulaCount: markerResult.formulas?.length ?? 0,
          extractionMethod: 'marker',
        })

        let extractionResult = normalizeExtractionResultPayload(markerResult, paperId, paperTitle, config)
        extractionResult.markerAvailable = true

        // Apply VLM and ArXiv fallbacks as before
        extractionResult = await applyExtractionEnhancements(extractionResult, config, outputDir, paperId, paperTitle)

        // Attach extraction method breakdown
        extractionResult.extractionMethodBreakdown = computeExtractionMethodBreakdown(extractionResult)

        return extractionResult
      }

      // Marker failed but didn't crash - log and fall back to PyMuPDF
      logger.warn('Marker extraction failed, falling back to PyMuPDF', {
        paperId,
        error: markerResult.error,
        markerImportError: markerResult.markerImportError,
      })
    } catch (markerError) {
      logger.warn('Marker extraction threw exception, falling back to PyMuPDF', {
        paperId,
        error: markerError instanceof Error ? markerError.message : String(markerError),
      })
    }
  }

  // Fallback: PyMuPDF extraction
  logger.info('Using PyMuPDF extraction', {
    paperId,
    reason: useMarkerPrimary && !markerAvailable ? 'marker_not_available' : 'marker_failed',
  })

  const args = [pdfExtractScriptPath, pdfPath, outputDir, paperId, paperTitle]
  if (config.method === 'pymupdf') {
    args.push('--method=pymupdf')
  }

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', args, {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8')
    })

    pythonProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8')
    })

    pythonProcess.on('close', async (code: number) => {
      if (code !== 0) {
        logger.error('PDF extraction failed', { code, stderr })
        reject(new Error(`PDF extraction failed: ${stderr}`))
        return
      }

      try {
        const result = parseExtractionStdoutPayload(stdout)

        if (result.error) {
          reject(new Error(result.error))
          return
        }

        let extractionResult = normalizeExtractionResultPayload(result, paperId, paperTitle, config)
        extractionResult.markerAvailable = markerAvailable

        logger.info('PDF extraction completed', {
          paperId,
          pageCount: extractionResult.pageCount,
          figureCount: extractionResult.figures.length,
          tableCount: extractionResult.tables.length,
          formulaCount: extractionResult.formulas.length,
          sectionCount: extractionResult.sections?.length ?? 0,
          extractionMethod: extractionResult.extractionMethod,
          filterStats: extractionResult.filterStats,
        })

        // Apply VLM and ArXiv fallbacks using shared helper
        extractionResult = await applyExtractionEnhancements(extractionResult, config, outputDir, paperId, paperTitle)

        // Attach extraction method breakdown for quality tracking
        extractionResult.extractionMethodBreakdown = computeExtractionMethodBreakdown(extractionResult)

        resolve(extractionResult)
      } catch (error) {
        logger.error('Failed to parse extraction result', { error, stdout })
        reject(new Error(`Failed to parse extraction result: ${error}`))
      }
    })

    pythonProcess.on('error', (error) => {
      logger.error('Failed to start Python process', { error })
      reject(new Error(`Failed to start Python process: ${error.message}`))
    })
  })
}

/**
 * Run Python extraction script and return parsed result.
 */
async function runPythonExtraction(
  scriptPath: string,
  pdfPath: string,
  outputDir: string,
  paperId: string,
  paperTitle: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const args = [scriptPath, pdfPath, outputDir, paperId, paperTitle]
    const pythonProcess = spawn('python', args, {
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8')
    })

    pythonProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8')
    })

    pythonProcess.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`Python extraction failed with code ${code}: ${stderr}`))
        return
      }

      try {
        const result = parseExtractionStdoutPayload(stdout)
        resolve(result)
      } catch (parseError) {
        reject(new Error(`Failed to parse extraction result: ${parseError}`))
      }
    })

    pythonProcess.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`))
    })
  })
}

/**
 * Apply VLM and ArXiv source fallbacks to extraction result.
 */
async function applyExtractionEnhancements(
  extractionResult: PDFExtractionResult,
  config: ExtractionMethodConfig,
  outputDir: string,
  paperId: string,
  paperTitle: string,
): Promise<PDFExtractionResult> {
  // ArXiv source fallback: extract high-quality figures from LaTeX source
  if (config.enableArxivSourceFallback) {
    try {
      const arxivId = extractArxivIdFromPaperId(paperId, paperTitle)
      if (arxivId) {
        const { getArxivSourceExtractor } = await import('./arxiv-source-extractor.js')
        const arxivExtractor = getArxivSourceExtractor()
        const arxivResult = await arxivExtractor.extractFigures(arxivId, outputDir)

        if (arxivResult.sourceAvailable && arxivResult.figures.length > 0) {
          extractionResult = mergeArxivSourceFigures(extractionResult, arxivResult, config.figureConfidenceThreshold)

          logger.info('ArXiv source fallback applied', {
            paperId,
            arxivId,
            arxivFigureCount: arxivResult.figures.length,
            arxivFigureGroupCount: arxivResult.figureGroups.length,
            mergedFigureCount: extractionResult.figures.length,
          })
        }
      }
    } catch (error) {
      logger.warn('ArXiv source fallback failed, keeping original extraction', {
        paperId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // VLM enhancement: figure fallback for low-confidence or missing figures
  let enhancedResult = extractionResult
  if (config.enableFigureVLMFallback) {
    try {
      const pagesNeedingAnalysis = identifyPagesNeedingVisionAnalysis(extractionResult, outputDir)
      const lowConfidenceFigures = extractionResult.figures.filter(
        (f) => (f.confidence ?? 0) < config.figureConfidenceThreshold
      )

      if (pagesNeedingAnalysis.length > 0 || lowConfidenceFigures.length > 0) {
        logger.info('Applying figure VLM fallback', {
          paperId,
          pagesNeedingAnalysis: pagesNeedingAnalysis.length,
          lowConfidenceFigures: lowConfidenceFigures.length,
        })

        enhancedResult = await enhanceExtractedFiguresWithVision({
          result: extractionResult,
          outputRoot: outputDir,
          pageRegions: pagesNeedingAnalysis,
        })
      }
    } catch (error) {
      logger.warn('Figure VLM fallback failed, keeping original extraction', {
        paperId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // VLM enhancement: formula fallback for low-confidence formulas
  if (config.enableFormulaVLMFallback) {
    try {
      enhancedResult = await enhanceExtractedFormulasWithVision({
        result: enhancedResult,
        outputRoot: outputDir,
      })
    } catch (error) {
      logger.warn('Formula VLM fallback failed, keeping original extraction', {
        paperId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return enhancedResult
}

export class PDFExtractor {
  private options: ExtractionOptions
  private methodConfig: ExtractionMethodConfig

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.methodConfig = { ...DEFAULT_METHOD_CONFIG, ...options.methodConfig }
  }

  async extractFromFile(
    pdfPath: string,
    paperId: string,
    paperTitle: string,
    outputDir: string,
  ): Promise<PDFExtractionResult> {
    return extractPDFWithPython(pdfPath, outputDir, paperId, paperTitle, this.methodConfig)
  }

  async extractFromBuffer(
    pdfBuffer: Buffer,
    paperId: string,
    paperTitle: string,
    outputDir: string,
  ): Promise<PDFExtractionResult> {
    const tempPath = path.join(outputDir, `${paperId}_temp.pdf`)
    fs.writeFileSync(tempPath, pdfBuffer)

    try {
      return await this.extractFromFile(tempPath, paperId, paperTitle, outputDir)
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    }
  }

  async extractFromUrl(
    pdfUrl: string,
    paperId: string,
    paperTitle: string,
    outputDir: string,
  ): Promise<PDFExtractionResult> {
    const pdfBuffer = await downloadPdfBufferFromUrl(pdfUrl)
    return this.extractFromBuffer(pdfBuffer, paperId, paperTitle, outputDir)
  }

  /** Update extraction method configuration */
  setMethodConfig(config: Partial<ExtractionMethodConfig>): void {
    this.methodConfig = { ...this.methodConfig, ...config }
  }

  /** Get current method configuration */
  getMethodConfig(): ExtractionMethodConfig {
    return { ...this.methodConfig }
  }
}

let globalExtractor: PDFExtractor | null = null

export function initializePDFExtractor(options?: Partial<ExtractionOptions>): PDFExtractor {
  globalExtractor = new PDFExtractor(options)
  return globalExtractor
}

export function getPDFExtractor(): PDFExtractor {
  if (!globalExtractor) {
    globalExtractor = new PDFExtractor()
  }
  return globalExtractor
}

export const __testing = {
  isPdfBuffer,
  parseExtractionStdoutPayload,
  downloadPdfBufferFromUrl,
  normalizeExtractionResultPayload,
  DEFAULT_METHOD_CONFIG,
  buildExtractionQualityWarnings,
  detectLatentCoverageSignals,
}
