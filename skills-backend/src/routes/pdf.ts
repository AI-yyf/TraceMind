import fs from 'fs'
import path from 'path'

import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { PdfExtractFromUrlSchema } from './schemas'
import {
  downloadPdfBufferFromUrl,
  extractPDFWithPython,
  type PDFExtractionResult,
} from '../services/pdf-extractor'
import { enhanceExtractedFormulasWithVision } from '../services/formula-vision'
import {
  computeExtractionStats,
  storeExtractionStats,
} from '../services/extraction-stats'
import { logger } from '../utils/logger'

const router = Router()

function resolveStoragePath(targetPath: string) {
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath)
}

function ensureDirectory(targetPath: string) {
  fs.mkdirSync(targetPath, { recursive: true })
  return targetPath
}

function getUploadRoot() {
  return ensureDirectory(
    resolveStoragePath(process.env.UPLOAD_DIR || './uploads'),
  )
}

function getUploadPdfDir() {
  return ensureDirectory(
    resolveStoragePath(process.env.UPLOAD_DIR || './uploads/pdfs'),
  )
}

function normalizePdfUrl(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim() ?? ''
  if (!value) return ''

  const arxivDoiMatch = value.match(
    /^https?:\/\/doi\.org\/10\.48550\/arxiv\.([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivDoiMatch) {
    return `https://arxiv.org/pdf/${arxivDoiMatch[1]}.pdf`
  }

  const arxivAbsMatch = value.match(
    /^https?:\/\/arxiv\.org\/abs\/([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivAbsMatch) {
    return `https://arxiv.org/pdf/${arxivAbsMatch[1]}.pdf`
  }

  const arxivPdfMatch = value.match(
    /^https?:\/\/arxiv\.org\/pdf\/([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivPdfMatch) {
    return `${value}.pdf`
  }

  return value
}

async function loadPaperLookup(paperId: string) {
  const paper = await prisma.papers.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      titleZh: true,
      pdfUrl: true,
    },
  })

  if (!paper) {
    throw new AppError(404, '论文不存在')
  }

  return paper
}

async function _resolvePdfExtractionRequest(body: {
  paperId?: string
  paperTitle?: string
  pdfUrl?: string
}) {
  const paperId = body.paperId?.trim() ?? ''
  if (!paperId) {
    throw new AppError(400, '请提供论文 ID')
  }

  const paper = await loadPaperLookup(paperId)
  const resolvedPdfUrl = normalizePdfUrl(body.pdfUrl || paper.pdfUrl)

  if (!resolvedPdfUrl) {
    throw new AppError(400, '请提供 PDF URL，或先为论文保存可访问的 PDF 地址')
  }

  return {
    paperId,
    paperTitle:
      body.paperTitle?.trim() || paper.titleZh?.trim() || paper.title.trim(),
    pdfUrl: resolvedPdfUrl,
  }
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
  }))
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

function looksLikeLowValueParagraph(value: string | null | undefined) {
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

function sanitizeSectionParagraphs(
  values: Array<string | null | undefined>,
  maxParagraphs = 4,
) {
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
    .split(/(?<=[。！？.!?])\s+/u)
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

function buildPaperSectionRowsFromExtraction(paperId: string, result: PDFExtractionResult) {
  const rows: Array<{
    id: string
    paperId: string
    sourceSectionTitle: string
    editorialTitle: string
    paragraphs: string
    order: number
  }> = []

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

async function persistExtractionResult(args: {
  paperId: string
  result: PDFExtractionResult
  pdfUrl?: string
  pdfPath?: string
  topicId?: string
}) {
  const { paperId, result, pdfUrl, pdfPath, topicId } = args
  const figureRows = buildFigureRows(paperId, result)
  const tableRows = buildTableRows(paperId, result)
  const formulaRows = buildFormulaRows(paperId, result)
  const sectionRows = buildPaperSectionRowsFromExtraction(paperId, result)
  const figureGroupRows = buildFigureGroupRows(paperId, result)
  const figurePaths = figureRows.map((figure) => figure.imagePath).filter(Boolean)
  const tablePaths = tableRows.map((table) => table.rawText ? `table_${table.number}` : null).filter(Boolean)
  const formulaPaths = formulaRows.map((formula) => formula.rawText ? `formula_${formula.number}` : null).filter(Boolean)
  const coverPath = result.coverPath || figurePaths[0] || null

  // Get topicId from paper if not provided
  let effectiveTopicId = topicId
  if (!effectiveTopicId) {
    const paper = await prisma.papers.findUnique({
      where: { id: paperId },
      select: { topicId: true },
    })
    effectiveTopicId = paper?.topicId ?? undefined
  }

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

  // Store extraction stats for quality tracking
  try {
    const stats = computeExtractionStats(result)
    await storeExtractionStats(stats, effectiveTopicId)
  } catch (error) {
    logger.warn('Failed to store extraction stats', { paperId, error })
    // Don't fail the extraction if stats storage fails
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadPdfDir())
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
      return
    }

    cb(new Error('只支持 PDF 文件'))
  },
})

router.post(
  '/extract',
  upload.single('pdf'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, '请上传 PDF 文件')
    }

    const paperId = String(req.body.paperId || '').trim()
    if (!paperId) {
      throw new AppError(400, '请提供论文 ID')
    }

    const paper = await loadPaperLookup(paperId)
    const outputDir = getUploadRoot()
    const paperTitle =
      String(req.body.paperTitle || '').trim() ||
      paper.titleZh?.trim() ||
      paper.title.trim()

    logger.info('Starting PDF extraction from upload', {
      paperId,
      pdfPath: req.file.path,
    })

    try {
        const extracted = await extractPDFWithPython(
          req.file.path,
          outputDir,
          paperId,
          paperTitle,
        )
        const result = await enhanceExtractedFormulasWithVision({
          result: extracted,
          outputRoot: outputDir,
        })

      await persistExtractionResult({
        paperId,
        result,
        pdfPath: req.file.path,
      })

      res.json({
        success: true,
        data: {
          paperId,
          pageCount: result.pageCount,
          coverPath: result.coverPath,
          abstract: result.abstract,
          figureCount: result.figures.length,
          figureGroupCount: result.figureGroups?.length ?? 0,
          tableCount: result.tables.length,
          formulaCount: result.formulas.length,
          figures: result.figures,
          figureGroups: result.figureGroups,
          tables: result.tables,
          formulas: result.formulas,
        },
      })
    } catch (error) {
      logger.error('PDF extraction from upload failed', { paperId, error })
      throw new AppError(
        500,
        `PDF 提取失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      )
    }
  }),
)

router.post(
  '/extract-from-url',
  validate(PdfExtractFromUrlSchema),
  asyncHandler(async (req, res) => {
    const { paperId, paperTitle } = req.body
    const pdfUrl = normalizePdfUrl(req.body.pdfUrl)
    const outputDir = getUploadRoot()
    const tempPath = path.join(outputDir, `${paperId}_temp.pdf`)

    logger.info('Starting PDF extraction from URL', {
      paperId,
      pdfUrl,
    })

    try {
      const pdfBuffer = await downloadPdfBufferFromUrl(pdfUrl)
      fs.writeFileSync(tempPath, pdfBuffer)

      const extracted = await extractPDFWithPython(
        tempPath,
        outputDir,
        paperId,
        paperTitle,
      )
      const result = await enhanceExtractedFormulasWithVision({
        result: extracted,
        outputRoot: outputDir,
      })

      await persistExtractionResult({
        paperId,
        result,
        pdfUrl,
      })

      res.json({
        success: true,
        data: {
          paperId,
          pageCount: result.pageCount,
          coverPath: result.coverPath,
          abstract: result.abstract,
          figureCount: result.figures.length,
          figureGroupCount: result.figureGroups?.length ?? 0,
          tableCount: result.tables.length,
          formulaCount: result.formulas.length,
          figures: result.figures,
          figureGroups: result.figureGroups,
          tables: result.tables,
          formulas: result.formulas,
        },
      })
    } catch (error) {
      logger.error('PDF extraction from URL failed', { paperId, pdfUrl, error })
      throw new AppError(
        500,
        `PDF 提取失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      )
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    }
  }),
)

router.get(
  '/extract/:paperId',
  asyncHandler(async (req, res) => {
    const { paperId } = req.params

    const paper = await prisma.papers.findUnique({
      where: { id: paperId },
      include: {
        figures: true,
        figure_groups: true,
        tables: true,
        formulas: true,
      },
    })

    if (!paper) {
      throw new AppError(404, '论文不存在')
    }

    res.json({
      success: true,
      data: {
        paperId,
        coverPath: paper.coverPath,
        figures: paper.figures,
        figureGroups: paper.figure_groups,
        tables: paper.tables,
        formulas: paper.formulas,
      },
    })
  }),
)

// Re-extract PDF for an existing paper with improved extraction logic
router.post(
  '/re-extract/:paperId',
  asyncHandler(async (req, res) => {
    const { paperId } = req.params

    const paper = await loadPaperLookup(paperId)
    const pdfUrl = normalizePdfUrl(paper.pdfUrl)

    if (!pdfUrl) {
      throw new AppError(400, '论文没有可用的 PDF URL，无法重新提取')
    }

    const outputDir = getUploadRoot()
    const tempPath = path.join(outputDir, `${paperId}_reextract_temp.pdf`)
    const paperTitle = paper.titleZh?.trim() || paper.title.trim()

    logger.info('Starting PDF re-extraction', {
      paperId,
      pdfUrl,
    })

    try {
      const pdfBuffer = await downloadPdfBufferFromUrl(pdfUrl)
      fs.writeFileSync(tempPath, pdfBuffer)

      const extracted = await extractPDFWithPython(
        tempPath,
        outputDir,
        paperId,
        paperTitle,
      )
      const result = await enhanceExtractedFormulasWithVision({
        result: extracted,
        outputRoot: outputDir,
      })

      await persistExtractionResult({
        paperId,
        result,
        pdfUrl,
      })

      logger.info('PDF re-extraction completed', {
        paperId,
        figureCount: result.figures.length,
        tableCount: result.tables.length,
        formulaCount: result.formulas.length,
      })

      res.json({
        success: true,
        data: {
          paperId,
          pageCount: result.pageCount,
          coverPath: result.coverPath,
          abstract: result.abstract,
          figureCount: result.figures.length,
          figureGroupCount: result.figureGroups?.length ?? 0,
          tableCount: result.tables.length,
          formulaCount: result.formulas.length,
          figures: result.figures,
          figureGroups: result.figureGroups,
          tables: result.tables,
          formulas: result.formulas,
          extractionMethod: result.extractionMethod,
        },
      })
    } catch (error) {
      logger.error('PDF re-extraction failed', { paperId, pdfUrl, error })
      throw new AppError(
        500,
        `PDF 重新提取失败: ${
          error instanceof Error ? error.message : '未知错误'
        }`,
      )
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    }
  }),
)

// Quality metrics endpoint for extraction statistics
router.get(
  '/quality-metrics/:paperId',
  asyncHandler(async (req, res) => {
    const { paperId } = req.params

    const paper = await prisma.papers.findUnique({
      where: { id: paperId },
      include: {
        figures: {
          select: {
            id: true,
            number: true,
            caption: true,
            page: true,
          },
        },
        tables: {
          select: {
            id: true,
            number: true,
            caption: true,
            page: true,
          },
        },
        formulas: {
          select: {
            id: true,
            number: true,
            latex: true,
            page: true,
          },
        },
        figure_groups: {
          select: {
            id: true,
            groupId: true,
            caption: true,
            subFigures: true,
          },
        },
      },
    })

    if (!paper) {
      throw new AppError(404, '论文不存在')
    }

    // Compute extraction method breakdown
    const methodBreakdown = {
      figures: computeMethodBreakdown(paper.figures),
      tables: computeMethodBreakdown(paper.tables),
      formulas: computeMethodBreakdown(paper.formulas),
    }

    // Compute quality metrics
    const metrics = {
      paperId,
      paperTitle: paper.titleZh || paper.title,
      pageCount: paper.pdfPath ? await estimatePageCount(paper.pdfPath) : 0,
      assetCounts: {
        figures: paper.figures.length,
        tables: paper.tables.length,
        formulas: paper.formulas.length,
        figureGroups: paper.figure_groups.length,
      },
      methodBreakdown,
      qualityScore: computeQualityScore({
        figureCount: paper.figures.length,
        tableCount: paper.tables.length,
        formulaCount: paper.formulas.length,
        methodBreakdown,
      }),
      lastExtracted: paper.updatedAt,
    }

    res.json({
      success: true,
      data: metrics,
    })
  }),
)

// Helper function to compute method breakdown
function computeMethodBreakdown(_assets: Array<{ id: string }>): Array<{ method: string; count: number }> {
  // Since we don't store extractionMethod in the database, return placeholder
  // In a real implementation, this would query the extraction metadata
  const methodMap = new Map<string, number>()
  methodMap.set('marker', 0)
  methodMap.set('pymupdf', 0)
  methodMap.set('arxiv-source', 0)
  methodMap.set('vlm-enhanced', 0)

  // Return breakdown with counts
  return Array.from(methodMap.entries())
    .map(([method, count]) => ({ method, count }))
    .filter((item) => item.count > 0 || methodMap.size > 0)
}

// Helper function to estimate page count from PDF
async function estimatePageCount(pdfPath: string): Promise<number> {
  try {
    const stats = fs.statSync(pdfPath)
    // Rough estimate: 50KB per page on average
    return Math.max(1, Math.floor(stats.size / 50000))
  } catch {
    return 0
  }
}

// Helper function to compute overall quality score
function computeQualityScore(args: {
  figureCount: number
  tableCount: number
  formulaCount: number
  methodBreakdown: {
    figures: Array<{ method: string; count: number }>
    tables: Array<{ method: string; count: number }>
    formulas: Array<{ method: string; count: number }>
  }
}): number {
  const { figureCount, tableCount, formulaCount } = args

  // Base score from asset coverage
  let score = 0

  // Figures: 0-40 points
  if (figureCount >= 5) score += 40
  else if (figureCount >= 3) score += 30
  else if (figureCount >= 1) score += 20

  // Tables: 0-30 points
  if (tableCount >= 3) score += 30
  else if (tableCount >= 1) score += 20

  // Formulas: 0-30 points
  if (formulaCount >= 5) score += 30
  else if (formulaCount >= 3) score += 20
  else if (formulaCount >= 1) score += 10

  return Math.min(100, score)
}

// PDF proxy route for batch download (avoids CORS issues)
router.get(
  '/proxy/:paperId',
  asyncHandler(async (req, res) => {
    const { paperId } = req.params

    const paper = await prisma.papers.findUnique({
      where: { id: paperId },
      select: {
        id: true,
        title: true,
        titleZh: true,
        pdfUrl: true,
        pdfPath: true,
      },
    })

    if (!paper) {
      throw new AppError(404, '论文不存在')
    }

    // Try local PDF first
    if (paper.pdfPath && fs.existsSync(paper.pdfPath)) {
      const filename = `${(paper.titleZh || paper.title).replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)}.pdf`
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      res.sendFile(path.resolve(paper.pdfPath))
      return
    }

    // Fall back to URL download
    const pdfUrl = normalizePdfUrl(paper.pdfUrl)
    if (!pdfUrl) {
      throw new AppError(400, '论文没有可用的 PDF')
    }

    logger.info('Proxying PDF download', { paperId, pdfUrl })

    try {
      const pdfBuffer = await downloadPdfBufferFromUrl(pdfUrl)
      const filename = `${(paper.titleZh || paper.title).replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)}.pdf`
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      res.setHeader('Content-Length', pdfBuffer.length)
      res.send(pdfBuffer)
    } catch (error) {
      logger.error('PDF proxy download failed', { paperId, pdfUrl, error })
      throw new AppError(
        500,
        `PDF 下载失败: ${error instanceof Error ? error.message : '未知错误'}`
      )
    }
  }),
)

export default router

export const __testing = {
  buildPaperSectionRowsFromExtraction,
  sanitizeSectionParagraphs,
  looksLikeLowValueParagraph,
  persistExtractionResult,
}
