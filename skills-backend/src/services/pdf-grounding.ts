import fs from 'node:fs'
import path from 'node:path'

import { prisma } from '../lib/prisma'
import {
  downloadPdfBufferFromUrl,
  extractPDFWithPython,
  type PDFExtractionResult,
} from './pdf-extractor'
import { enhanceExtractedFormulasWithVision } from './formula-vision'

type PaperGroundingLookup = {
  id: string
  title: string
  titleZh: string | null
  pdfUrl: string | null
  arxivUrl: string | null
  _count?: {
    sections: number
    figures: number
    tables: number
    formulas: number
    figure_groups: number
  }
}

export type PersistedPaperSectionRow = {
  id: string
  paperId: string
  sourceSectionTitle: string
  editorialTitle: string
  paragraphs: string
  order: number
}

export type PaperPdfGroundingResult =
  | {
      status: 'grounded'
      paperId: string
      pdfUrl: string
      result: PDFExtractionResult
      extractedCounts: {
        sections: number
        figures: number
        tables: number
        formulas: number
        figureGroups: number
      }
    }
  | {
      status: 'skipped'
      paperId: string
      reason: 'missing-pdf-url' | 'already-grounded'
      existingCounts?: {
        sections: number
        figures: number
        tables: number
        formulas: number
        figureGroups: number
      }
    }

function resolveStoragePath(targetPath: string) {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath)
}

function ensureDirectory(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true })
  return targetPath
}

export function getPdfGroundingOutputRoot() {
  return ensureDirectory(resolveStoragePath(process.env.UPLOAD_DIR || './uploads'))
}

export function getPdfGroundingUploadPdfDir() {
  const configured = process.env.UPLOAD_PDF_DIR?.trim()
  const target = configured || path.join(getPdfGroundingOutputRoot(), 'pdfs')
  return ensureDirectory(resolveStoragePath(target))
}

export function normalizePdfUrl(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim() ?? ''
  if (!value) return ''

  const arxivDoiMatch = value.match(
    /^https?:\/\/doi\.org\/10\.48550\/arxiv\.([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivDoiMatch) {
    return `https://arxiv.org/pdf/${arxivDoiMatch[1]}.pdf`
  }

  const arxivAbsMatch = value.match(/^https?:\/\/arxiv\.org\/abs\/([\d.]+)(?:v\d+)?$/iu)
  if (arxivAbsMatch) {
    return `https://arxiv.org/pdf/${arxivAbsMatch[1]}.pdf`
  }

  const arxivPdfMatch = value.match(/^https?:\/\/arxiv\.org\/pdf\/([\d.]+)(?:v\d+)?$/iu)
  if (arxivPdfMatch) {
    return value.endsWith('.pdf') ? value : `${value}.pdf`
  }

  return value
}

function buildFigureRows(paperId: string, result: PDFExtractionResult) {
  return result.figures.map((figure) => ({
    id: crypto.randomUUID(),
    paperId,
    number: figure.number,
    caption: figure.caption,
    page: figure.page,
    imagePath: figure.imagePath,
  }))
}

/**
 * Priority patterns for selecting representative figures
 * Matches architecture, framework, pipeline, method diagrams, etc.
 */
const TOPIC_FIGURE_PRIORITY_PATTERNS = [
  /\b(architecture|framework|pipeline|overview|method|model|system|workflow|diagram|design|training|inference)\b/iu,
  /(架构|框架|流程|方法|模型|系统|示意|总览|概览|训练|推理|原理图)/u,
]

/**
 * Score a figure caption based on priority patterns
 * Higher scores indicate more representative figures (architecture diagrams, method illustrations)
 */
function scoreFigureCaption(caption: string | null | undefined): number {
  if (!caption) return 0

  const normalized = caption.replace(/\s+/gu, ' ').trim()
  if (!normalized) return 0

  return TOPIC_FIGURE_PRIORITY_PATTERNS.reduce(
    (score, pattern) => (pattern.test(normalized) ? score + 3 : score),
    Math.min(2, Math.floor(normalized.length / 48)),
  )
}

/**
 * Select the most representative figure from extracted figures
 * Prioritizes architecture diagrams, method illustrations, and framework overviews
 */
function pickRepresentativeFigureImage(
  figures: Array<{ imagePath?: string | null; caption?: string | null }>,
): string | null {
  if (!figures?.length) return null

  const candidate = [...figures]
    .filter((figure) => typeof figure.imagePath === 'string' && Boolean(figure.imagePath.trim()))
    .sort((left, right) => scoreFigureCaption(right.caption) - scoreFigureCaption(left.caption))[0]

  return candidate?.imagePath ?? null
}

function buildTableRows(paperId: string, result: PDFExtractionResult) {
  return result.tables.map((table) => ({
    id: crypto.randomUUID(),
    paperId,
    number: table.number,
    caption: table.caption,
    page: table.page,
    headers: JSON.stringify(table.headers),
    rows: JSON.stringify(table.rows),
    rawText: table.rawText,
  }))
}

function buildFormulaRows(paperId: string, result: PDFExtractionResult) {
  return result.formulas.map((formula) => ({
    id: crypto.randomUUID(),
    paperId,
    number: formula.number,
    latex: formula.latex,
    rawText: formula.rawText,
    page: formula.page,
    imagePath: formula.imagePath,  // Preserve image path for VLM formula recognition
  }))
}

function buildPersistedExtractionPathSummary(args: {
  figureRows: Array<{ imagePath?: string | null }>
  tableRows: Array<{ number: number; rawText?: string | null }>
  formulaRows: Array<{ number: string; rawText?: string | null }>
}) {
  return {
    figurePaths: args.figureRows.map((figure) => figure.imagePath).filter(Boolean),
    tablePaths: args.tableRows
      .map((table) => (table.rawText ? `table_${table.number}` : null))
      .filter(Boolean),
    formulaPaths: args.formulaRows
      .map((formula) => (formula.rawText ? `formula_${formula.number}` : null))
      .filter(Boolean),
  }
}

function normalizeSectionText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

const LOW_VALUE_SECTION_TITLE_RE =
  /^(?:table of contents|contents|acknowledg(?:e)?ments?|declaration|dedication|copyright|about the author|author biography|curriculum vitae|references|bibliography|appendix)$/iu
const LOW_VALUE_SECTION_TEXT_RE =
  /(?:table of contents|list of figures|list of tables|acknowledg(?:e)?ments?|declaration|dedication|dedicate this thesis|all rights reserved|personal use is permitted|ieee xplore|cookie|privacy notice|javascript|sign in|institutional access|purchase pdf|download pdf|submitted in partial fulfillment|this thesis is submitted|doctor of philosophy|master of science)/iu
const HTML_NOISE_RE = /<(?:html|head|body|meta|script|div|span|title)\b|&nbsp;|document\.cookie/iu

function looksLikeLowValueSectionTitle(value: string | null | undefined) {
  const normalized = normalizeSectionText(value)
  return Boolean(normalized) && LOW_VALUE_SECTION_TITLE_RE.test(normalized)
}

export function looksLikeLowValueParagraph(value: string | null | undefined) {
  const normalized = normalizeSectionText(value)
  if (!normalized) return true
  if (HTML_NOISE_RE.test(normalized)) return true
  if (LOW_VALUE_SECTION_TEXT_RE.test(normalized)) return true
  if ((normalized.match(/\.{4,}/gu)?.length ?? 0) >= 1 && /\d{1,4}$/u.test(normalized)) {
    return true
  }
  if (/^\d{1,4}$/u.test(normalized)) return true
  return false
}

export function sanitizeSectionParagraphs(values: Array<string | null | undefined>, maxParagraphs = 4) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = normalizeSectionText(value)
    if (!normalized || looksLikeLowValueParagraph(normalized) || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= maxParagraphs) break
  }

  return output
}

function splitSectionParagraphs(value: string | null | undefined, maxParagraphs = 4) {
  const rawText = value ?? ''
  const normalized = normalizeSectionText(rawText)
  if (!normalized) return [] as string[]

  const directParagraphs = rawText
    .split(/\n+/u)
    .map((item) => normalizeSectionText(item))
    .filter(Boolean)

  if (directParagraphs.length > 1) {
    return sanitizeSectionParagraphs(directParagraphs, maxParagraphs)
  }

  const sentences = normalized
    .split(/(?<=[。！？?!])\s+/u)
    .map((item) => normalizeSectionText(item))
    .filter(Boolean)

  if (sentences.length <= 1) {
    return sanitizeSectionParagraphs([normalized], maxParagraphs)
  }

  const paragraphs: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > 320 && current) {
      paragraphs.push(current)
      current = sentence
    } else {
      current = next
    }
  }

  if (current) {
    paragraphs.push(current)
  }

  return sanitizeSectionParagraphs(paragraphs, maxParagraphs)
}

function buildPageChunkParagraphs(value: string | null | undefined, maxParagraphs = 3) {
  const normalized = normalizeSectionText(value)
  if (!normalized) return [] as string[]

  const chunks: string[] = []
  let cursor = 0

  while (cursor < normalized.length && chunks.length < maxParagraphs) {
    const remaining = normalized.slice(cursor)
    if (remaining.length <= 440) {
      chunks.push(remaining.trim())
      break
    }

    const boundaryCandidates = [
      remaining.lastIndexOf('。', 420),
      remaining.lastIndexOf('.', 420),
      remaining.lastIndexOf('！', 420),
      remaining.lastIndexOf('?', 420),
      remaining.lastIndexOf('；', 420),
      remaining.lastIndexOf(';', 420),
    ].filter((index) => index >= 180)

    const boundary = boundaryCandidates.length > 0 ? Math.max(...boundaryCandidates) + 1 : 420
    chunks.push(remaining.slice(0, boundary).trim())
    cursor += boundary
  }

  return sanitizeSectionParagraphs(chunks.filter(Boolean), maxParagraphs)
}

function detectPageSectionTitle(result: PDFExtractionResult, pageNumber: number) {
  const page = result.pages.find((entry) => entry.pageNumber === pageNumber)
  if (!page) return ''

  const heading = page.blocks
    .map((block) => normalizeSectionText(block.text))
    .find(
      (text) =>
        text.length >= 4 &&
        text.length <= 80 &&
        !/^fig(?:ure)?\s*\d+|^table\s*\d+|^references?$/iu.test(text) &&
        /^(?:\d+(?:\.\d+)*\s+)?(?:abstract|introduction|background|related work|method|methods|approach|model|architecture|training|experiments?|results?|discussion|analysis|ablation|conclusion|limitations?)$/iu.test(
          text,
        ),
    )

  return heading ?? ''
}

function buildPageSectionTitle(index: number, explicitTitle: string | null | undefined) {
  const title = normalizeSectionText(explicitTitle)
  if (title) return title
  if (index === 1) return 'Introduction'
  if (index === 2) return 'Method'
  if (index === 3) return 'Experiments'
  return `Section ${index}`
}

function buildPageEditorialTitle(index: number, explicitTitle: string | null | undefined) {
  const title = normalizeSectionText(explicitTitle)
  if (title) return title
  if (index === 1) return 'Problem and entry'
  if (index === 2) return 'Method and structure'
  if (index === 3) return 'Results and evidence'
  return `Body section ${index}`
}

export function buildPaperSectionRowsFromExtraction(
  paperId: string,
  result: PDFExtractionResult,
): PersistedPaperSectionRow[] {
  const rows: PersistedPaperSectionRow[] = []

  const pushSection = (sourceSectionTitle: string, editorialTitle: string, paragraphs: string[]) => {
    if (looksLikeLowValueSectionTitle(sourceSectionTitle)) return
    const cleanedParagraphs = sanitizeSectionParagraphs(paragraphs)
    if (cleanedParagraphs.length === 0) return

    rows.push({
      id: crypto.randomUUID(),
      paperId,
      sourceSectionTitle,
      editorialTitle,
      paragraphs: JSON.stringify(cleanedParagraphs),
      order: rows.length + 1,
    })
  }

  if (Array.isArray(result.sections) && result.sections.length > 0) {
    for (const section of result.sections) {
      if (rows.length >= 10) break

      const sourceSectionTitle = normalizeSectionText(section.sourceSectionTitle)
      const editorialTitle = normalizeSectionText(section.editorialTitle) || sourceSectionTitle
      const paragraphs = sanitizeSectionParagraphs(section.paragraphs, 4)

      pushSection(sourceSectionTitle, editorialTitle, paragraphs)
    }

    if (rows.length > 0) {
      return rows.slice(0, 10)
    }
  }

  const abstractParagraphs = sanitizeSectionParagraphs(splitSectionParagraphs(result.abstract, 3), 3)
  if (abstractParagraphs.length > 0) {
    pushSection('Abstract', 'Abstract and entry', abstractParagraphs)
  }

  for (const [pageIndex, page] of result.pages.entries()) {
    if (rows.length >= 8) break

    const explicitTitle = detectPageSectionTitle(result, page.pageNumber)
    if (looksLikeLowValueSectionTitle(explicitTitle) || looksLikeLowValueParagraph(page.text)) {
      continue
    }

    const paragraphs = buildPageChunkParagraphs(page.text, pageIndex === 0 ? 2 : 3)
    if (paragraphs.length === 0) continue
    const nextIndex = rows.length + 1

    pushSection(
      buildPageSectionTitle(nextIndex, explicitTitle),
      buildPageEditorialTitle(nextIndex, explicitTitle),
      paragraphs,
    )
  }

  if (rows.length === 0) {
    pushSection('Body', 'Body overview', splitSectionParagraphs(result.fullText, 4))
  }

  return rows.slice(0, 10)
}

function buildFigureGroupRows(paperId: string, result: PDFExtractionResult) {
  if (!Array.isArray(result.figureGroups) || result.figureGroups.length === 0) {
    return []
  }

  return result.figureGroups.map((group) => ({
    id: `fg-${paperId}-${group.groupId}`,
    paperId,
    groupId: group.groupId,
    caption: group.caption || '',
    page: group.subFigures.length > 0 ? group.subFigures[0].page : 0,
    subFigures: JSON.stringify(
      group.subFigures.map((sf) => ({
        index: sf.index,
        figureId: sf.figureId,
        subId: sf.subId,
        imagePath: sf.imagePath,
        caption: sf.caption,
        page: sf.page,
        confidence: sf.confidence ?? null,
      })),
    ),
  }))
}

export async function persistExtractionResult(args: {
  paperId: string
  result: PDFExtractionResult
  pdfUrl?: string
  pdfPath?: string
}) {
  const { paperId, result, pdfUrl, pdfPath } = args
  const figureRows = buildFigureRows(paperId, result)
  const tableRows = buildTableRows(paperId, result)
  const formulaRows = buildFormulaRows(paperId, result)
  const sectionRows = buildPaperSectionRowsFromExtraction(paperId, result)
  const figureGroupRows = buildFigureGroupRows(paperId, result)
  const { figurePaths, tablePaths, formulaPaths } = buildPersistedExtractionPathSummary({
    figureRows,
    tableRows,
    formulaRows,
  })
  // Smart figure selection: prioritize architecture/method diagrams over first figure
  const coverPath = pickRepresentativeFigureImage(result.figures) || null

  await prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.figures.deleteMany({ where: { paperId } }),
      tx.tables.deleteMany({ where: { paperId } }),
      tx.formulas.deleteMany({ where: { paperId } }),
      tx.paper_sections.deleteMany({ where: { paperId } }),
      tx.figure_groups.deleteMany({ where: { paperId } }),
    ])

    if (figureRows.length > 0) {
      await tx.figures.createMany({ data: figureRows })
    }

    if (tableRows.length > 0) {
      await tx.tables.createMany({ data: tableRows })
    }

    if (formulaRows.length > 0) {
      await tx.formulas.createMany({ data: formulaRows })
    }

    if (sectionRows.length > 0) {
      await tx.paper_sections.createMany({ data: sectionRows })
    }

    if (figureGroupRows.length > 0) {
      await tx.figure_groups.createMany({ data: figureGroupRows })
    }

    await tx.papers.update({
      where: { id: paperId },
      data: {
        pdfUrl: pdfUrl ?? undefined,
        pdfPath: pdfPath ?? undefined,
        coverPath,
        figurePaths: JSON.stringify(figurePaths),
        tablePaths: JSON.stringify(tablePaths),
        formulaPaths: JSON.stringify(formulaPaths),
      },
    })
  })
}

export const __testing = {
  buildPersistedExtractionPathSummary,
}

async function loadPaperGroundingLookup(
  paperId: string,
  _includeCounts = false,
): Promise<PaperGroundingLookup | null> {
  return prisma.papers.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      titleZh: true,
      pdfUrl: true,
      arxivUrl: true,
      _count: {
        select: {
          paper_sections: true,
          figures: true,
          tables: true,
          formulas: true,
          figure_groups: true,
        },
      },
    },
  }) as Promise<PaperGroundingLookup | null>
}

export async function extractAndPersistPaperPdfFromUrl(args: {
  paperId: string
  paperTitle?: string
  pdfUrl?: string | null
  force?: boolean
  outputDir?: string
}): Promise<PaperPdfGroundingResult> {
  const lookup = await loadPaperGroundingLookup(args.paperId, true)
  if (!lookup) {
    throw new Error(`Paper not found for PDF grounding: ${args.paperId}`)
  }

  const existingCounts = {
    sections: lookup._count?.sections ?? 0,
    figures: lookup._count?.figures ?? 0,
    tables: lookup._count?.tables ?? 0,
    formulas: lookup._count?.formulas ?? 0,
    figureGroups: lookup._count?.figure_groups ?? 0,
  }
  const existingEvidenceCount =
    existingCounts.sections + existingCounts.figures + existingCounts.tables + existingCounts.formulas

  if (!args.force && existingEvidenceCount > 0) {
    return {
      status: 'skipped',
      paperId: lookup.id,
      reason: 'already-grounded',
      existingCounts,
    }
  }

  const resolvedPdfUrl = normalizePdfUrl(args.pdfUrl || lookup.pdfUrl || lookup.arxivUrl)
  if (!resolvedPdfUrl) {
    return {
      status: 'skipped',
      paperId: lookup.id,
      reason: 'missing-pdf-url',
    }
  }

  const outputDir = ensureDirectory(resolveStoragePath(args.outputDir || getPdfGroundingOutputRoot()))
  const tempPath = path.join(
    getPdfGroundingUploadPdfDir(),
    `${lookup.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`,
  )
  const paperTitle = args.paperTitle?.trim() || lookup.titleZh?.trim() || lookup.title

  try {
    const pdfBuffer = await downloadPdfBufferFromUrl(resolvedPdfUrl)
    fs.writeFileSync(tempPath, pdfBuffer)

    const extracted = await extractPDFWithPython(tempPath, outputDir, lookup.id, paperTitle)
    const result = await enhanceExtractedFormulasWithVision({
      result: extracted,
      outputRoot: outputDir,
    })
    const sectionRows = buildPaperSectionRowsFromExtraction(lookup.id, result)

    await persistExtractionResult({
      paperId: lookup.id,
      result,
      pdfUrl: resolvedPdfUrl,
    })

    return {
      status: 'grounded',
      paperId: lookup.id,
      pdfUrl: resolvedPdfUrl,
      result,
      extractedCounts: {
        sections: sectionRows.length,
        figures: result.figures.length,
        tables: result.tables.length,
        formulas: result.formulas.length,
        figureGroups: result.figureGroups.length,
      },
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
  }
}
