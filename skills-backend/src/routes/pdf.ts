import fs from 'fs'
import path from 'path'

import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import {
  extractPDFWithPython,
  type PDFExtractionResult,
} from '../services/pdf-extractor'
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
  const paper = await prisma.paper.findUnique({
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

async function resolvePdfExtractionRequest(body: {
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
    paperId,
    number: figure.number,
    caption: figure.caption,
    page: figure.page,
    imagePath: figure.imagePath,
  }))
}

function buildTableRows(paperId: string, result: PDFExtractionResult) {
  return result.tables.map((table) => ({
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
    paperId,
    number: formula.number,
    latex: formula.latex,
    rawText: formula.rawText,
    page: formula.page,
  }))
}

async function persistExtractionResult(args: {
  paperId: string
  result: PDFExtractionResult
  pdfUrl?: string
  pdfPath?: string
}) {
  const { paperId, result, pdfUrl, pdfPath } = args
  const figureRows = buildFigureRows(paperId, result)
  const tableRows = buildTableRows(paperId, result)
  const formulaRows = buildFormulaRows(paperId, result)
  const figurePaths = figureRows.map((figure) => figure.imagePath).filter(Boolean)
  const coverPath = result.coverPath || figurePaths[0] || null

  await prisma.$transaction(async (tx) => {
    await Promise.all([
      tx.figure.deleteMany({ where: { paperId } }),
      tx.table.deleteMany({ where: { paperId } }),
      tx.formula.deleteMany({ where: { paperId } }),
    ])

    if (figureRows.length > 0) {
      await tx.figure.createMany({ data: figureRows })
    }

    if (tableRows.length > 0) {
      await tx.table.createMany({ data: tableRows })
    }

    if (formulaRows.length > 0) {
      await tx.formula.createMany({ data: formulaRows })
    }

    await tx.paper.update({
      where: { id: paperId },
      data: {
        pdfUrl: pdfUrl ?? undefined,
        pdfPath: pdfPath ?? undefined,
        coverPath,
        figurePaths: JSON.stringify(figurePaths),
      },
    })
  })
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
      const result = await extractPDFWithPython(
        req.file.path,
        outputDir,
        paperId,
        paperTitle,
      )

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
          tableCount: result.tables.length,
          formulaCount: result.formulas.length,
          figures: result.figures,
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
  asyncHandler(async (req, res) => {
    const { paperId, paperTitle, pdfUrl } = await resolvePdfExtractionRequest(
      req.body ?? {},
    )
    const outputDir = getUploadRoot()
    const tempPath = path.join(outputDir, `${paperId}_temp.pdf`)

    logger.info('Starting PDF extraction from URL', {
      paperId,
      pdfUrl,
    })

    try {
      const response = await fetch(pdfUrl)
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`)
      }

      const pdfBuffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(tempPath, pdfBuffer)

      const result = await extractPDFWithPython(
        tempPath,
        outputDir,
        paperId,
        paperTitle,
      )

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
          tableCount: result.tables.length,
          formulaCount: result.formulas.length,
          figures: result.figures,
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

    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        figures: true,
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
        tables: paper.tables,
        formulas: paper.formulas,
      },
    })
  }),
)

export default router
