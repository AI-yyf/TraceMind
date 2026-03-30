/**
 * PDF 全量提取模块
 * 提取论文中的图片、表格、公式和全文文本
 */

import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { prisma } from './db'

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)
const exists = promisify(fs.exists)

// 提取结果类型定义
export interface ExtractedFigure {
  id: string
  number: number
  caption: string
  page: number
  imagePath: string
  imageFormat: 'png' | 'jpg'
  width: number
  height: number
  bbox: { x: number; y: number; width: number; height: number }
}

export interface ExtractedTable {
  id: string
  number: number
  caption: string
  page: number
  headers: string[]
  rows: Array<Record<string, string>>
  rawText: string
  bbox: { x: number; y: number; width: number; height: number }
}

export interface ExtractedFormula {
  id: string
  number: string
  latex: string
  rawText: string
  page: number
  bbox: { x: number; y: number; width: number; height: number }
}

export interface ExtractedText {
  fullText: string
  pages: Array<{
    pageNumber: number
    text: string
    sections: Array<{
      title: string
      text: string
    }>
  }>
}

export interface PDFExtractionResult {
  paperId: string
  paperTitle: string
  figures: ExtractedFigure[]
  tables: ExtractedTable[]
  formulas: ExtractedFormula[]
  text: ExtractedText
  metadata: {
    pageCount: number
    title?: string
    authors?: string[]
    abstract?: string
    keywords?: string[]
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
  ocrEnabled?: boolean
}

const DEFAULT_OPTIONS: ExtractionOptions = {
  extractFigures: true,
  extractTables: true,
  extractFormulas: true,
  extractText: true,
  figureMinSize: { width: 100, height: 100 },
  tableMinRows: 2,
  ocrEnabled: false
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
    paperTitle: string
  ): Promise<PDFExtractionResult> {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`)
    }

    const pdfBuffer = fs.readFileSync(pdfPath)
    return this.extractFromBuffer(pdfBuffer, paperId, paperTitle)
  }

  /**
   * 从 Buffer 提取 PDF
   */
  async extractFromBuffer(
    pdfBuffer: Buffer,
    paperId: string,
    paperTitle: string
  ): Promise<PDFExtractionResult> {
    // 创建临时文件
    const tempDir = path.join(process.cwd(), 'temp', 'pdf', paperId)
    await this.ensureDir(tempDir)
    
    const tempPdfPath = path.join(tempDir, 'input.pdf')
    await writeFile(tempPdfPath, pdfBuffer)

    // 调用 Python 脚本进行提取
    return this.extractWithPython(tempPdfPath, tempDir, paperId, paperTitle)
  }

  /**
   * 从 URL 提取 PDF
   */
  async extractFromUrl(
    pdfUrl: string,
    paperId: string,
    paperTitle: string
  ): Promise<PDFExtractionResult> {
    const response = await fetch(pdfUrl)
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer())
    return this.extractFromBuffer(pdfBuffer, paperId, paperTitle)
  }

  /**
   * 使用 Python 脚本提取 PDF
   */
  private async extractWithPython(
    pdfPath: string,
    outputDir: string,
    paperId: string,
    paperTitle: string
  ): Promise<PDFExtractionResult> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '..', 'scripts', 'pdf_extract.py')
      
      // 检查 Python 脚本是否存在
      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Python script not found: ${scriptPath}`))
        return
      }

      const pythonProcess = spawn('python', [
        scriptPath,
        pdfPath,
        outputDir,
        paperId,
        paperTitle
      ], {
        timeout: 300000 // 5分钟超时
      })

      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
        console.log(`[PDF Extract] ${data.toString()}`)
      })

      pythonProcess.on('close', async (code: number) => {
        if (code !== 0) {
          reject(new Error(`PDF extraction failed with code ${code}: ${stderr}`))
          return
        }

        try {
          const result = JSON.parse(stdout) as PDFExtractionResult
          
          // 保存提取结果到数据库
          await this.saveExtractionResult(result, paperId)
          
          resolve(result)
        } catch (error) {
          reject(new Error(`Failed to parse extraction result: ${error}`))
        }
      })

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`))
      })
    })
  }

  /**
   * 保存提取结果到数据库
   */
  private async saveExtractionResult(result: PDFExtractionResult, paperId: string): Promise<void> {
    try {
      // 查找对应的论文记录
      const paper = await prisma.paper.findFirst({
        where: {
          OR: [
            { id: paperId },
            { arxivId: paperId }
          ]
        }
      })

      if (!paper) {
        console.warn(`Paper not found for extraction result: ${paperId}`)
        return
      }

      // 保存图表
      for (const figure of result.figures) {
        await prisma.figure.upsert({
          where: { id: figure.id },
          update: {
            caption: figure.caption,
            page: figure.page,
            path: figure.imagePath,
            width: figure.width,
            height: figure.height,
          },
          create: {
            id: figure.id,
            paperId: paper.id,
            caption: figure.caption,
            page: figure.page,
            path: figure.imagePath,
            width: figure.width,
            height: figure.height,
          }
        })
      }

      // 保存表格
      for (const table of result.tables) {
        await prisma.table.upsert({
          where: { id: table.id },
          update: {
            caption: table.caption,
            page: table.page,
            data: table.rows,
            rawText: table.rawText,
          },
          create: {
            id: table.id,
            paperId: paper.id,
            caption: table.caption,
            page: table.page,
            data: table.rows,
            rawText: table.rawText,
          }
        })
      }

      // 保存公式
      for (const formula of result.formulas) {
        await prisma.formula.upsert({
          where: { id: formula.id },
          update: {
            latex: formula.latex,
            rawText: formula.rawText,
            page: formula.page,
          },
          create: {
            id: formula.id,
            paperId: paper.id,
            latex: formula.latex,
            rawText: formula.rawText,
            page: formula.page,
          }
        })
      }

      console.log(`Saved extraction result for paper ${paperId}: ${result.figures.length} figures, ${result.tables.length} tables, ${result.formulas.length} formulas`)
    } catch (error) {
      console.error(`Failed to save extraction result: ${error}`)
      throw error
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!await exists(dir)) {
      await mkdir(dir, { recursive: true })
    }
  }

  /**
   * 更新提取选项
   */
  setOptions(options: Partial<ExtractionOptions>) {
    this.options = { ...this.options, ...options }
  }
}

/**
 * 提取 PDF 并分析图表（完整流程）
 */
export async function extractAndAnalyzePDF(
  pdfUrl: string,
  paperId: string,
  paperTitle: string,
  language: 'zh' | 'en' = 'zh'
): Promise<PDFExtractionResult> {
  const extractor = new PDFExtractor()
  
  // 1. 提取 PDF 内容
  console.log(`[PDF] Starting extraction for ${paperTitle}...`)
  const extractionResult = await extractor.extractFromUrl(pdfUrl, paperId, paperTitle)
  
  console.log(`[PDF] Extraction complete: ${extractionResult.figures.length} figures, ${extractionResult.tables.length} tables`)
  
  return extractionResult
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
