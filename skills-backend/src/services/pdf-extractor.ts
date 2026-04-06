import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { logger } from '../utils/logger'

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
  tableMinRows: 2,
}

function resolvePdfExtractScriptPath() {
  return path.join(process.cwd(), 'scripts', 'pdf_extract.py')
}

export async function extractPDFWithPython(
  pdfPath: string,
  outputDir: string,
  paperId: string,
  paperTitle: string,
): Promise<PDFExtractionResult> {
  const scriptPath = resolvePdfExtractScriptPath()

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Python script not found: ${scriptPath}`)
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`)
  }

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(
      'python',
      [scriptPath, pdfPath, outputDir, paperId, paperTitle],
      {
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      },
    )

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

        const extractionResult: PDFExtractionResult = {
          paperId: result.paperId,
          paperTitle: result.paperTitle,
          pageCount: result.pageCount,
          coverPath: result.coverPath,
          abstract: result.abstract,
          fullText: result.fullText,
          pages: result.pages || [],
          figures: (result.figures || []).map((figure: any, index: number) => ({
            id: figure.id,
            number: index + 1,
            caption: `图 ${index + 1}`,
            page: figure.page,
            imagePath: figure.path,
            width: figure.width,
            height: figure.height,
            bbox: figure.bbox,
          })),
          tables: (result.tables || []).map((table: any, index: number) => ({
            id: table.id,
            number: index + 1,
            caption: `表 ${index + 1}`,
            page: table.page,
            headers: [],
            rows: [],
            rawText: table.text,
            bbox: table.bbox,
          })),
          formulas: (result.formulas || []).map((formula: any) => ({
            id: formula.id,
            number: formula.id.split('_').pop() || '1',
            latex: formula.latex,
            rawText: formula.raw,
            page: formula.page,
            type: formula.type,
          })),
          metadata: result.metadata,
        }

        logger.info('PDF extraction completed', {
          paperId,
          pageCount: extractionResult.pageCount,
          figureCount: extractionResult.figures.length,
          tableCount: extractionResult.tables.length,
          formulaCount: extractionResult.formulas.length,
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

export class PDFExtractor {
  private options: ExtractionOptions

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  async extractFromFile(
    pdfPath: string,
    paperId: string,
    paperTitle: string,
    outputDir: string,
  ): Promise<PDFExtractionResult> {
    return extractPDFWithPython(pdfPath, outputDir, paperId, paperTitle)
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
    const response = await fetch(pdfUrl)
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer())
    return this.extractFromBuffer(pdfBuffer, paperId, paperTitle, outputDir)
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
