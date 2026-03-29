/**
 * PDF 全量提取模块
 * 提取论文中的图片、表格、公式和全文文本
 */

import * as fs from 'fs'
import * as path from 'path'

// 提取结果类型定义
export interface ExtractedFigure {
  id: string
  number: number
  caption: string
  page: number
  imageData: Buffer
  imageFormat: 'png' | 'jpg' | 'svg'
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
 * 
 * 注意：这是一个框架实现。实际实现需要依赖 PyMuPDF (fitz)、pdf2image、
 * paddleocr 等 Python 库，或者使用 GROBID、PDFPlumber 等工具。
 * 
 * 在实际部署中，可以通过以下方式实现：
 * 1. 调用 Python 脚本进行提取
 * 2. 使用 Docker 容器运行提取服务
 * 3. 调用外部 API (如 GROBID)
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
    // 这里应该调用实际的提取逻辑
    // 目前返回一个模拟结果，展示数据结构
    
    console.warn(
      'PDFExtractor.extractFromBuffer is a stub. ' +
      'Please implement actual extraction using PyMuPDF, GROBID, or similar tools.'
    )

    return this.createStubResult(paperId, paperTitle)
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
   * 创建模拟结果（用于开发和测试）
   */
  private createStubResult(paperId: string, paperTitle: string): PDFExtractionResult {
    return {
      paperId,
      paperTitle,
      figures: [],
      tables: [],
      formulas: [],
      text: {
        fullText: '',
        pages: []
      },
      metadata: {
        pageCount: 0
      }
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
 * 使用外部 Python 脚本提取 PDF
 * 需要安装: pip install pymupdf pdf2image paddleocr
 */
export async function extractPDFWithPython(
  pdfPath: string,
  outputDir: string,
  paperId: string,
  paperTitle: string
): Promise<PDFExtractionResult> {
  const { spawn } = require('child_process')
  const path = require('path')

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'pdf_extract.py')
    
    const process = spawn('python', [
      scriptPath,
      pdfPath,
      outputDir,
      paperId,
      paperTitle
    ])

    let stdout = ''
    let stderr = ''

    process.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    process.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    process.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`PDF extraction failed: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch (error) {
        reject(new Error(`Failed to parse extraction result: ${error}`))
      }
    })
  })
}

/**
 * 使用 GROBID 提取 PDF
 * GROBID 是一个专门用于学术文献提取的工具
 */
export async function extractPDFWithGrobid(
  pdfPath: string,
  grobidUrl: string = 'http://localhost:8070'
): Promise<PDFExtractionResult> {
  const FormData = require('form-data')
  const fs = require('fs')

  const formData = new FormData()
  formData.append('input', fs.createReadStream(pdfPath))

  const response = await fetch(`${grobidUrl}/api/processFulltextDocument`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error(`GROBID extraction failed: ${response.status} ${response.statusText}`)
  }

  const teiXml = await response.text()
  
  // 解析 TEI XML 提取结构化数据
  // 这里需要实现 TEI XML 解析逻辑
  return parseGrobidTEI(teiXml)
}

/**
 * 解析 GROBID 返回的 TEI XML
 */
function parseGrobidTEI(teiXml: string): PDFExtractionResult {
  // 实现 TEI XML 解析
  // 提取标题、作者、摘要、正文、图表、公式等信息
  
  // 这是一个占位实现
  return {
    paperId: '',
    paperTitle: '',
    figures: [],
    tables: [],
    formulas: [],
    text: {
      fullText: '',
      pages: []
    },
    metadata: {
      pageCount: 0
    }
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
