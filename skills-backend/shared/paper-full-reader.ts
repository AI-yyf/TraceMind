/**
 * 论文完整读取器
 * 实现PDF下载、完整文本解析、图表公式提取
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// 论文完整内容接口
export interface PaperFullContent {
  metadata: {
    id: string
    title: string
    authors: string[]
    published: string
    venue?: string
    pdfUrl: string
  }

  // 完整文本内容
  fullText: {
    abstract: string
    introduction: string
    relatedWork: string
    method: string
    experiments: string
    results: string
    discussion: string
    conclusion: string
  }

  // 结构化信息
  keyPoints: {
    problem: string
    method: string
    contribution: string
    results: string[]
    limitations: string[]
  }

  // 多媒体素材
  assets: {
    figures: ExtractedFigure[]
    tables: ExtractedTable[]
    formulas: ExtractedFormula[]
  }
}

// 提取的图
export interface ExtractedFigure {
  id: string
  paperId: string
  number: number
  caption: string
  page: number
  localPath: string
  publicUrl: string
  analysis?: {
    type: 'architecture' | 'result' | 'comparison' | 'ablation' | 'flow' | 'example'
    description: string
    keyElements: string[]
    mainFinding: string
  }
}

// 提取的表
export interface ExtractedTable {
  id: string
  paperId: string
  number: number
  caption: string
  page: number
  headers: string[]
  rows: Array<{
    dimension: string
    values: string[]
  }>
}

// 提取的公式
export interface ExtractedFormula {
  id: string
  paperId: string
  number: string
  latex: string
  context: string
  explanation?: {
    statement: string
    symbols: Array<{ symbol: string; meaning: string; domain?: string }>
    meaning: { mathematical: string; intuitive: string }
    usage: { where: string; how: string; result: string }
  }
}

export class PaperFullReader {
  private tempDir: string
  private assetsDir: string

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'papers')
    this.assetsDir = path.join(process.cwd(), 'public', 'assets', 'papers')
    this.ensureDirectories()
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(this.assetsDir, { recursive: true })
    }
  }

  /**
   * 完整读取论文
   */
  async readPaperFull(paper: {
    id: string
    title: string
    authors: string[]
    published: string
    pdfUrl: string
    venue?: string
  }): Promise<PaperFullContent> {
    console.log(`[PaperFullReader] 开始读取论文: ${paper.id}`)

    // 1. 下载PDF
    const pdfPath = await this.downloadPDF(paper.id, paper.pdfUrl)

    // 2. 解析完整文本
    const fullText = await this.parseFullText(pdfPath)

    // 3. 提取图表
    const figures = await this.extractFigures(pdfPath, paper.id)

    // 4. 提取表格
    const tables = await this.extractTables(pdfPath, paper.id)

    // 5. 提取公式
    const formulas = await this.extractFormulas(pdfPath, paper.id)

    // 6. 提取关键信息
    const keyPoints = await this.extractKeyPoints(fullText)

    // 7. 清理临时文件
    this.cleanup(pdfPath)

    console.log(`[PaperFullReader] 论文读取完成: ${paper.id}`)

    return {
      metadata: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors,
        published: paper.published,
        venue: paper.venue,
        pdfUrl: paper.pdfUrl,
      },
      fullText,
      keyPoints,
      assets: {
        figures,
        tables,
        formulas,
      },
    }
  }

  /**
   * 下载PDF
   */
  private async downloadPDF(paperId: string, pdfUrl: string): Promise<string> {
    const pdfPath = path.join(this.tempDir, `${paperId}.pdf`)

    // 如果已存在，直接返回
    if (fs.existsSync(pdfPath)) {
      return pdfPath
    }

    console.log(`[PaperFullReader] 下载PDF: ${pdfUrl}`)

    try {
      const response = await fetch(pdfUrl)
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      fs.writeFileSync(pdfPath, buffer)

      return pdfPath
    } catch (error) {
      console.error(`[PaperFullReader] PDF下载失败: ${paperId}`, error)
      throw error
    }
  }

  /**
   * 解析完整文本
   * 使用Python脚本调用PyMuPDF提取文本
   */
  private async parseFullText(pdfPath: string): Promise<PaperFullContent['fullText']> {
    console.log(`[PaperFullReader] 解析文本: ${pdfPath}`)

    try {
      // 调用Python脚本提取文本
      const scriptPath = path.join(__dirname, '..', 'scripts', 'extract_pdf_text.py')
      const result = execSync(`python "${scriptPath}" "${pdfPath}"`, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
      })

      const extracted = JSON.parse(result)

      return {
        abstract: extracted.abstract || '',
        introduction: extracted.introduction || '',
        relatedWork: extracted.relatedWork || '',
        method: extracted.method || '',
        experiments: extracted.experiments || '',
        results: extracted.results || '',
        discussion: extracted.discussion || '',
        conclusion: extracted.conclusion || '',
      }
    } catch (error)