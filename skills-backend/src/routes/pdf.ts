import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'
import { extractPDFWithPython } from '../../shared/pdf-extractor-impl'

const router = Router()

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads/pdfs'
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('只支持 PDF 文件'))
    }
  }
})

// 上传并提取 PDF
router.post('/extract', upload.single('pdf'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError(400, '请上传 PDF 文件')
  }

  const { paperId, paperTitle } = req.body
  if (!paperId) {
    throw new AppError(400, '请提供论文 ID')
  }

  const pdfPath = req.file.path
  const outputDir = process.env.UPLOAD_DIR || './uploads'

  logger.info('开始提取 PDF', { paperId, pdfPath })

  try {
    // 调用 Python 脚本提取
    const result = await extractPDFWithPython(
      pdfPath,
      outputDir,
      paperId,
      paperTitle || 'Unknown Paper'
    )

    // 保存提取结果到数据库
    await saveExtractionResult(paperId, result)

    logger.info('PDF 提取完成', {
      paperId,
      pageCount: result.pageCount,
      figureCount: result.figures.length,
      tableCount: result.tables.length,
      formulaCount: result.formulas.length
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
        formulas: result.formulas
      }
    })
  } catch (error) {
    logger.error('PDF 提取失败', { paperId, error })
    throw new AppError(500, `PDF 提取失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}))

// 从 URL 提取 PDF
router.post('/extract-from-url', asyncHandler(async (req, res) => {
  const { paperId, paperTitle, pdfUrl } = req.body

  if (!paperId || !pdfUrl) {
    throw new AppError(400, '请提供论文 ID 和 PDF URL')
  }

  const outputDir = process.env.UPLOAD_DIR || './uploads'

  logger.info('开始从 URL 提取 PDF', { paperId, pdfUrl })

  try {
    // 下载并提取
    const response = await fetch(pdfUrl)
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer())
    const tempPath = path.join(outputDir, `${paperId}_temp.pdf`)
    
    // 保存临时文件
    const fs = require('fs')
    fs.writeFileSync(tempPath, pdfBuffer)

    try {
      const result = await extractPDFWithPython(
        tempPath,
        outputDir,
        paperId,
        paperTitle || 'Unknown Paper'
      )

      // 保存提取结果
      await saveExtractionResult(paperId, result)

      // 更新论文的 pdfPath
      await prisma.paper.update({
        where: { id: paperId },
        data: { pdfUrl }
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
          formulaCount: result.formulas.length
        }
      })
    } finally {
      // 清理临时文件
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    }
  } catch (error) {
    logger.error('PDF URL 提取失败', { paperId, pdfUrl, error })
    throw new AppError(500, `PDF 提取失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}))

// 获取提取结果
router.get('/extract/:paperId', asyncHandler(async (req, res) => {
  const { paperId } = req.params

  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    include: {
      figures: true,
      tables: true,
      formulas: true
    }
  })

  if (!paper) {
    throw new AppError(404, '论文不存在')
  }

  res.json({
    success: true,
    data: {
      paperId,
      figures: paper.figures,
      tables: paper.tables,
      formulas: paper.formulas
    }
  })
}))

// 保存提取结果到数据库
async function saveExtractionResult(paperId: string, result: any) {
  // 保存图片
  for (const figure of result.figures) {
    await prisma.figure.create({
      data: {
        paperId,
        number: figure.number,
        caption: figure.caption,
        page: figure.page,
        imagePath: figure.imagePath
      }
    })
  }

  // 保存表格
  for (const table of result.tables) {
    await prisma.table.create({
      data: {
        paperId,
        number: table.number,
        caption: table.caption,
        page: table.page,
        headers: JSON.stringify(table.headers),
        rows: JSON.stringify(table.rows),
        rawText: table.rawText
      }
    })
  }

  // 保存公式
  for (const formula of result.formulas) {
    await prisma.formula.create({
      data: {
        paperId,
        number: formula.number,
        latex: formula.latex,
        rawText: formula.rawText,
        page: formula.page
      }
    })
  }

  // 更新论文封面
  if (result.coverPath) {
    await prisma.paper.update({
      where: { id: paperId },
      data: { coverPath: result.coverPath }
    })
  }
}

export default router
