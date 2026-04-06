import fs from 'node:fs'
import path from 'node:path'

export interface PaperFullContent {
  metadata: {
    id: string
    title: string
    authors: string[]
    published: string
    venue?: string
    pdfUrl: string
  }
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
  keyPoints: {
    problem: string
    method: string
    contribution: string
    results: string[]
    limitations: string[]
  }
  assets: {
    figures: ExtractedFigure[]
    tables: ExtractedTable[]
    formulas: ExtractedFormula[]
  }
}

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

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'papers')
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  async readPaperFull(paper: {
    id: string
    title: string
    authors: string[]
    published: string
    pdfUrl: string
    venue?: string
  }): Promise<PaperFullContent> {
    const pdfPath = await this.downloadPDF(paper.id, paper.pdfUrl)
    const fullText = await this.parseFullText(pdfPath)

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
      keyPoints: await this.extractKeyPoints(fullText),
      assets: {
        figures: await this.extractFigures(paper.id),
        tables: await this.extractTables(paper.id),
        formulas: await this.extractFormulas(paper.id),
      },
    }
  }

  private async downloadPDF(paperId: string, pdfUrl: string): Promise<string> {
    const pdfPath = path.join(this.tempDir, `${paperId}.pdf`)
    if (fs.existsSync(pdfPath)) return pdfPath

    const response = await fetch(pdfUrl)
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(pdfPath, buffer)
    return pdfPath
  }

  private async parseFullText(_pdfPath: string): Promise<PaperFullContent['fullText']> {
    return {
      abstract: '',
      introduction: '',
      relatedWork: '',
      method: '',
      experiments: '',
      results: '',
      discussion: '',
      conclusion: '',
    }
  }

  private async extractFigures(_paperId: string): Promise<ExtractedFigure[]> {
    return []
  }

  private async extractTables(_paperId: string): Promise<ExtractedTable[]> {
    return []
  }

  private async extractFormulas(_paperId: string): Promise<ExtractedFormula[]> {
    return []
  }

  private async extractKeyPoints(_fullText: PaperFullContent['fullText']): Promise<PaperFullContent['keyPoints']> {
    return {
      problem: '',
      method: '',
      contribution: '',
      results: [],
      limitations: [],
    }
  }
}
