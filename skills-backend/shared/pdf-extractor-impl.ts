/**
 * PDF 提取器实现
 * 调用 Python 脚本进行实际的 PDF 提取
 */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { logger } from '../src/utils/logger'

// 提取结果类型定义
export interface ExtractedFigure {
  id: string
  number: number
  caption: string
  page: number
  imagePath: string
  width: number
  height: number
  bbox: number[] | null
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
}

export interface ExtractedFormula {
  id: string
  number: string
  latex: string
  rawText: string
  page: number
  type: 'inline' | 'display'
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
  metadata: {
    title: string
    author: string
    subject: string
    creator: string
    producer: string
  }
}

// 提取选项
export interface ExtractionOptions {
  extractFigures: boolean
  extractTables: boolean
  extractFormulas: boolean
  extractText: boolean
  figureMinSize?: { width: number; height: number }
  tableMinRows?: number
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  extractFigures: true,
  extractTables: true,
  extractFormulas: true,
  extractText: true,
  figureMinSize: { width: 100, height: 100 },
  tableMinRows: 2
}

/**
 * 使用 Python 脚本提取 PDF
 */
export async function extractPDFWithPython(
  pdfPath: string,
  outputDir: string,
  paperId: string,
  paperTitle: string
): Promise<PDFExtractionResult> {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'pdf_extract.py')
  
  // 检查 Python 脚本是否存在
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found: ${scriptPath}`)
  }

  // 检查 PDF 是否存在
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`)
  }

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [
      scriptPath,
      pdfPath,
      outputDir,
      paperId,
      paperTitle
    ])

    let stdout = ''
    let stderr = ''

    pythonProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    pythonProcess.on('close', (code: number) => {
      if (code !== 0) {
        logger.error('PDF extraction failed', { code, stderr })
        reject(new Error(`PDF extraction failed: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout)
        
        if (result.error) {
          reject(new Error(result.error))
          return
        }

        // 转换结果为标准格式
        const extractionResult: PDFExtractionResult = {
          paperId: result.paperId,
          paperTitle: result.paperTitle,
          pageCount: result.pageCount,
          coverPath: result.coverPath,
          abstract: result.abstract,
          fullText: result.fullText,
          pages: result.pages || [],
          figures: (result.figures || []).map((fig: any, index: number) => ({
            id: fig.id,
            number: index + 1,
            caption: `图 ${index + 1}`,
            page: fig.page,
            imagePath: fig.path,
            width: fig.width,
            height: fig.height,
            bbox: fig.bbox
          })),
          tables: (result.tables || []).map((table: any, index: number) => ({
            id: table.id,
            number: index + 1,
            caption: `表 ${index + 1}`,
            page: table.page,
            headers: [],
            rows: [],
            rawText: table.text,
            bbox: table.bbox
          })),
          formulas: (result.formulas || []).map((formula: any) => ({
            id: formula.id,
            number: formula.id.split('_').pop() || '1',
            latex: formula.latex,
            rawText: formula.raw,
            page: formula.page,
            type: formula.type
          })),
          metadata: result.metadata
        }

        logger.info('PDF extraction completed', {
          paperId,
          pageCount: extractionResult.pageCount,
          figureCount: extractionResult.figures.length,
          tableCount: extractionResult.tables.length,
          formulaCount: extractionResult.formulas.length
        })

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
 * PDF 提取器类
 */
export class PDFExtractor {
  private options: ExtractionOptions

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 从文件路径提取 PDF
   */
  async extractFromFile(
    pdfPath: string,
    paperId: string,
    paperTitle: string,
    outputDir: string
  ): Promise<PDFExtractionResult> {
    return extractPDFWithPython(pdfPath, outputDir, paperId, paperTitle)
  }

  /**
   * 从 Buffer 提取 PDF
   */
  async extractFromBuffer(
    pdfBuffer: Buffer,
    paperId: string,
    paperTitle: string,
    outputDir: string
  ): Promise<PDFExtractionResult> {
    // 保存临时文件
    const tempPath = path.join(outputDir, `${paperId}_temp.pdf`)
    fs.writeFileSync(tempPath, pdfBuffer)

    try {
      const result = await this.extractFromFile(tempPath, paperId, paperTitle, outputDir)
      return result
    } finally {
      // 清理临时文件
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    }
  }

  /**
   * 从 URL 下载并提取 PDF
   */
  async extractFromUrl(
    pdfUrl: string,
    paperId: string,
    paperTitle: string,
    outputDir: string
  ): Promise<PDFExtractionResult> {
    // 下载 PDF
    const response = await fetch(pdfUrl)
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer())
    return this.extractFromBuffer(pdfBuffer, paperId, paperTitle, outputDir)
  }
}

// 导出单例实例
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
