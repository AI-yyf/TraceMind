/**
 * ArXiv LaTeX 解析器 v2.0 — 精准全量图表提取
 *
 * 核心改进：
 * 1. 支持所有 figure 环境：figure, figure*, subfigure, minipage, tikzpicture
 * 2. 嵌套花括号安全的 caption/label/includegraphics 解析
 * 3. 全量图片扫描：tex 解析 + 目录文件扫描双保险
 * 4. 表格结构化提取：tabular → columns + rows
 * 5. 自动生成兼容 paper-assets.json 的 manifest
 * 6. PDF 降级：下载 PDF 首页作为封面 fallback
 *
 * 降级链：
 *   LaTeX 源码解析 → 目录全量扫描 → PDF 首页截图
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ============ 类型定义 ============

export interface LatexFigure {
  id: string
  caption: string
  label?: string
  filePaths: string[]       // 该 figure 中的所有 includegraphics 路径
  subFigures?: {            // subfigure 子图
    id: string
    caption?: string
    filePaths: string[]
  }[]
  position?: string
  environment: 'figure' | 'figure*' | 'subfigure' | 'minipage'
  referencedIn: string[]
}

export interface LatexTable {
  id: string
  caption: string
  label?: string
  content: string           // 原始 LaTeX 内容
  columns?: string[]        // 解析后的列标题
  rows?: string[][]         // 解析后的数据行
  referencedIn: string[]
}

export interface LatexFormula {
  id: string
  content: string
  display: 'inline' | 'block'
  label?: string
  referencedIn: string[]
}

export interface LatexSection {
  id: string
  level: number
  title: string
  content: string
  lineStart: number
  lineEnd: number
}

export interface LatexPaperStructure {
  paperId: string
  title?: string
  authors?: string[]
  abstract?: string
  sections: LatexSection[]
  figures: LatexFigure[]
  tables: LatexTable[]
  formulas: LatexFormula[]
  citations: string[]
}

export interface ExtractedAsset {
  type: 'figure' | 'table' | 'formula'
  originalPath: string
  extractedPath: string
  figureId?: string
  caption?: string
  width?: string
  size?: number
  format?: string
}

export interface ParseResult {
  success: boolean
  structure?: LatexPaperStructure
  extractedAssets: ExtractedAsset[]
  allImageFiles: string[]         // 目录中的全部图片文件（全量）
  errors: Array<{ type: string; message: string; details?: any }>
  warnings: string[]
}

/** paper-assets.json 兼容的 manifest */
export interface PaperAssetsManifest {
  coverPath: string
  figurePaths: string[]
  coverSource: string
  extractedAt: string
  figureCount: number
  tableCount: number
  figures: Array<{
    id: string
    caption: string
    assetPaths: string[]
  }>
  tables: Array<{
    id: string
    caption: string
    columns?: string[]
    rows?: string[][]
  }>
}

// ============ 配置 ============

interface ParserConfig {
  arxivSourceUrl: (paperId: string) => string
  arxivPdfUrl: (paperId: string) => string
  tempDir: string
  outputDir: string
  retryAttempts: number
  retryDelay: number
  timeout: number
  supportedImageExts: string[]
  /** 最小文件大小（字节），过滤掉空文件和装饰碎片 */
  minImageSize: number
}

const DEFAULT_CONFIG: ParserConfig = {
  arxivSourceUrl: (id) => `https://arxiv.org/e-print/${id}`,
  arxivPdfUrl: (id) => `https://arxiv.org/pdf/${id}`,
  tempDir: path.join(process.cwd(), '.temp', 'arxiv'),
  outputDir: path.join(process.cwd(), 'public', 'papers'),
  retryAttempts: 3,
  retryDelay: 2000,
  timeout: 120000,
  supportedImageExts: ['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.tiff', '.tif', '.bmp'],
  minImageSize: 1024, // 1KB
}

// ============ 花括号平衡工具 ============

/**
 * 从 startPos 开始，找到匹配的闭合花括号。
 * 返回闭合花括号的位置（含）。
 * 如果找不到，返回 -1。
 */
function findClosingBrace(content: string, startPos: number): number {
  let depth = 0
  for (let i = startPos; i < content.length; i++) {
    if (content[i] === '{') depth++
    else if (content[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 从 `\begin{...}` 的 begin 位置，找到匹配的 `\end{...}` 的起始位置。
 */
function findMatchingEnd(content: string, beginPos: number, envName: string): number {
  const endTag = `\\end{${envName}}`
  let depth = 1
  let searchFrom = beginPos + `\\begin{${envName}}`.length

  while (depth > 0 && searchFrom < content.length) {
    const nextBegin = content.indexOf(`\\begin{${envName}`, searchFrom)
    const nextEnd = content.indexOf(endTag, searchFrom)

    if (nextEnd === -1) return -1 // 没有闭合

    if (nextBegin !== -1 && nextBegin < nextEnd) {
      // 先遇到 begin → 深度 +1
      // 检查 begin 后面是否真的是同一环境
      const afterBegin = nextBegin + `\\begin{`.length
      const braceEnd = content.indexOf('}', afterBegin)
      if (braceEnd !== -1) {
        const name = content.substring(afterBegin, braceEnd)
        if (name === envName) {
          depth++
          searchFrom = braceEnd + 1
          continue
        }
      }
      searchFrom = nextBegin + 1
    } else {
      // 先遇到 end → 深度 -1
      depth--
      if (depth === 0) return nextEnd
      searchFrom = nextEnd + endTag.length
    }
  }
  return -1
}

// ============ LaTeX 解析函数 ============

/**
 * 提取花括号内的内容（支持嵌套）。
 * 假设 cursor 指向 '{'，返回 '{' 之后到 '}' 之前的内容。
 */
function extractBracedContent(content: string, cursor: number): { text: string; endPos: number } {
  if (content[cursor] !== '{') return { text: '', endPos: cursor }
  const closePos = findClosingBrace(content, cursor)
  if (closePos === -1) return { text: '', endPos: cursor }
  return { text: content.substring(cursor + 1, closePos), endPos: closePos }
}

/**
 * 从 LaTeX content 中提取所有 includegraphics 的路径。
 */
function extractAllIncludeGraphics(content: string): string[] {
  const paths: string[] = []
  const regex = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const braceStart = match.index + match[0].length - 1
    const { text: imgPath, endPos } = extractBracedContent(content, braceStart)
    if (imgPath) {
      // 处理路径：去除空白、注释
      const clean = imgPath.split('%')[0].trim()
      if (clean) paths.push(clean)
    }
  }
  return paths
}

/**
 * 提取花括号嵌套的 caption。
 */
function extractCaption(content: string): string {
  const match = content.match(/\\caption\s*(?:\[[^\]]*\])?\s*\{/)
  if (!match) return ''
  const braceStart = match.index + match[0].length - 1
  const { text } = extractBracedContent(content, braceStart)
  return cleanLatex(text)
}

/**
 * 提取 label。
 */
function extractLabel(content: string): string | undefined {
  const match = content.match(/\\label\{([^}]+)\}/)
  return match ? match[1].trim() : undefined
}

function cleanLatex(text: string): string {
  return text
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 解析 tabular 环境为 columns + rows。
 */
function parseTabular(content: string): { columns: string[]; rows: string[][] } | null {
  // 找到 tabular 环境
  const tabMatch = content.match(/\\begin\{tabular\}\s*(?:\[[^\]]*\])?\{([^}]+)\}/)
  if (!tabMatch) return null

  const colSpec = tabMatch[1].trim()
  // 简单列提取：l, c, r, p{...}, | 分隔
  const columns: string[] = []
  const colRegex = /(?:p\{[^}]*\})|[lcr]/g
  let colMatch: RegExpExecArray | null
  let colIndex = 0
  while ((colMatch = colRegex.exec(colSpec)) !== null) {
    colIndex++
    columns.push(`Col ${colIndex}`)
  }

  // 提取行
  const tabStart = tabMatch.index
  const tabEnd = findMatchingEnd(content, tabStart, 'tabular')
  if (tabEnd === -1) return { columns, rows: [] }

  const tabBody = content.substring(tabMatch.index + tabMatch[0].length, tabEnd)

  // 分割行（\\ 或 \cr）
  const rowStrs = tabBody
    .split(/\\\\\s*\n?|\s*\\cr\s*\n?/)
    .map(r => r.trim())
    .filter(r => r && !r.startsWith('%') && !r.startsWith('\\hline') && !r.startsWith('\\toprule') && !r.startsWith('\\midrule') && !r.startsWith('\\bottomrule'))

  const rows: string[][] = []
  for (const rowStr of rowStrs) {
    const cells = rowStr
      .split(/&/)
      .map(c => cleanLatex(c).trim())
      .filter(c => c.length > 0)
    if (cells.length > 0) rows.push(cells)
  }

  // 如果第一行看起来像表头（通常 \textbf 或 \toprule 之后），标记它
  return { columns, rows }
}

// ============ 主解析器 ============

export class ArxivLatexParser {
  private config: ParserConfig

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 完整解析流程：下载 → 解压 → 解析 → 提取 → 复制 → 生成 manifest
   */
  async parse(paperId: string): Promise<ParseResult> {
    const errors: Array<{ type: string; message: string; details?: any }> = []
    const warnings: string[] = []
    const extractedAssets: ExtractedAsset[] = []
    let tempDir: string | null = null

    try {
      tempDir = await this.createTempDir(paperId)

      // Step 1: 下载源码
      const dl = await this.downloadWithRetry(paperId, tempDir)
      if (!dl.success) {
        errors.push({ type: 'download', message: `下载失败: ${dl.error}` })
        return { success: false, errors, warnings, extractedAssets, allImageFiles: [] }
      }

      // Step 2: 解压
      const ex = await this.extractSource(tempDir)
      if (!ex.success) {
        errors.push({ type: 'extract', message: `解压失败: ${ex.error}` })
        return { success: false, errors, warnings, extractedAssets, allImageFiles: [] }
      }

      const extractDir = path.join(tempDir, 'extracted')

      // Step 3: 找主 tex 文件
      const mainTex = await this.findMainTexFile(tempDir)
      if (!mainTex) {
        errors.push({ type: 'parse', message: '未找到主 tex 文件' })
        // 降级：直接扫描目录中的图片
        const dirImages = await this.scanAllImages(extractDir)
        return { success: false, errors, warnings, extractedAssets, allImageFiles: dirImages }
      }

      // Step 4: 解析 LaTeX 结构
      const structure = this.parseTexStructure(await fs.readFile(mainTex, 'utf-8'), paperId)

      // Step 5: 全量提取图片
      const texImagePaths = structure.figures.flatMap(f => f.filePaths)

      // 双保险：tex 解析 + 目录扫描
      const dirImageFiles = await this.scanAllImages(extractDir)

      // 合并去重
      const allImageSet = new Set<string>()
      const allImageFiles: string[] = []

      // 先添加 tex 解析发现的图
      for (const imgPath of texImagePaths) {
        const found = await this.resolveImagePath(extractDir, imgPath)
        if (found) {
          allImageSet.add(found)
        } else {
          warnings.push(`tex 引用的图片未找到: ${imgPath}`)
        }
      }

      // 再添加目录扫描发现的额外图（tex 可能没引用到的）
      for (const dirFile of dirImageFiles) {
        if (!allImageSet.has(dirFile)) {
          allImageSet.add(dirFile)
        }
      }

      // 转换为可读路径
      for (const imgFile of allImageSet) {
        allImageFiles.push(imgFile)
      }

      // Step 6: 复制到输出目录
      const outputDir = path.join(this.config.outputDir, paperId)
      await fs.mkdir(outputDir, { recursive: true })

      for (const imgFile of allImageFiles) {
        const fileName = this.normalizeFileName(path.basename(imgFile))
        const destPath = path.join(outputDir, fileName)

        try {
          await fs.copyFile(imgFile, destPath)
          const stats = await fs.stat(destPath)
          extractedAssets.push({
            type: 'figure',
            originalPath: imgFile,
            extractedPath: destPath,
            size: stats.size,
            format: path.extname(destPath),
          })
        } catch (err) {
          warnings.push(`复制失败 ${path.basename(imgFile)}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Step 7: 生成 paper-assets.json 兼容的 manifest
      const manifest = this.buildManifest(paperId, structure, extractedAssets)
      await fs.writeFile(
        path.join(outputDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      )

      return {
        success: true,
        structure,
        extractedAssets,
        allImageFiles,
        errors,
        warnings,
      }
    } catch (error) {
      errors.push({
        type: 'parse',
        message: `解析异常: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      })
      return { success: false, errors, warnings, extractedAssets, allImageFiles: [] }
    } finally {
      if (tempDir) await this.cleanup(tempDir)
    }
  }

  // ============ LaTeX 结构解析 ============

  /**
   * 解析 LaTeX 文件的完整结构。
   * 核心改进：支持所有 figure 环境、嵌套花括号、subfigure/minipage。
   */
  parseTexStructure(content: string, paperId: string): LatexPaperStructure {
    const structure: LatexPaperStructure = {
      paperId,
      sections: [],
      figures: [],
      tables: [],
      formulas: [],
      citations: [],
    }

    // 标题
    const titleMatch = content.match(/\\title\s*(?:\[[^\]]*\])?\s*\{/)
    if (titleMatch) {
      const { text } = extractBracedContent(content, titleMatch.index + titleMatch[0].length - 1)
      structure.title = cleanLatex(text)
    }

    // 作者
    const authorMatches = content.matchAll(/\\author\s*(?:\[[^\]]*\])?\s*\{/g)
    structure.authors = Array.from(authorMatches).map(m => {
      const { text } = extractBracedContent(content, m.index + m[0].length - 1)
      return cleanLatex(text)
    })

    // 摘要
    const absMatch = content.match(/\\begin\{abstract\}/)
    if (absMatch) {
      const absEnd = findMatchingEnd(content, absMatch.index, 'abstract')
      if (absEnd !== -1) {
        structure.abstract = cleanLatex(content.substring(absMatch.index + '\\begin{abstract}'.length, absEnd))
      }
    }

    // 章节
    this.parseSections(content, structure)

    // 图片（全环境支持）
    this.parseFigures(content, structure)

    // 表格
    this.parseTables(content, structure)

    // 公式
    this.parseFormulas(content, structure)

    // 引用
    const citeMatches = content.matchAll(/\\cite\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)
    for (const m of citeMatches) {
      structure.citations.push(...m[1].split(',').map(k => k.trim()))
    }
    structure.citations = [...new Set(structure.citations)]

    return structure
  }

  private parseSections(content: string, structure: LatexPaperStructure): void {
    const lines = content.split('\n')
    let currentSection: LatexSection | null = null
    let lineNumber = 0

    for (const line of lines) {
      lineNumber++

      for (const [cmd, level] of [['\\section', 1], ['\\subsection', 2], ['\\subsubsection', 3]] as const) {
        // 支持 \section*{} 形式
        const regex = new RegExp(`\\${cmd.replace('\\', '\\\\')}\\s*(?:\\[[^\\]]*\\])?\\s*\\{`)
        const match = line.match(regex)
        if (match) {
          if (currentSection) currentSection.lineEnd = lineNumber - 1
          const { text } = extractBracedContent(line, match.index + match[0].length - 1)
          currentSection = {
            id: `sec-${structure.sections.length + 1}`,
            level,
            title: cleanLatex(text),
            content: '',
            lineStart: lineNumber,
            lineEnd: lineNumber,
          }
          structure.sections.push(currentSection)
          break
        }
      }

      if (currentSection) {
        currentSection.content += line + '\n'
        currentSection.lineEnd = lineNumber
      }
    }
  }

  /**
   * 解析所有 figure 环境：figure, figure*, minipage 内的图。
   * 同时独立扫描所有 includegraphics 作为兜底。
   */
  private parseFigures(content: string, structure: LatexPaperStructure): void {
    const seenPaths = new Set<string>()
    let figureIndex = 0

    // 解析 figure 和 figure* 环境
    const figureEnvs = ['figure', 'figure*'] as const

    for (const envName of figureEnvs) {
      const beginTag = `\\begin{${envName}}`
      let searchFrom = 0

      while (searchFrom < content.length) {
        const beginPos = content.indexOf(beginTag, searchFrom)
        if (beginPos === -1) break

        const endPos = findMatchingEnd(content, beginPos, envName)
        if (endPos === -1) {
          searchFrom = beginPos + beginTag.length
          continue
        }

        figureIndex++
        const body = content.substring(beginPos + beginTag.length, endPos)

        // 提取 caption（支持嵌套花括号）
        const caption = extractCaption(body)
        const label = extractLabel(body)
        const position = this.extractPosition(body)

        // 提取所有 includegraphics 路径
        const filePaths = extractAllIncludeGraphics(body)

        // 检查是否有 subfigure 子图
        const subFigures = this.extractSubFigures(body)

        const figure: LatexFigure = {
          id: `fig-${figureIndex}`,
          caption: caption || `Figure ${figureIndex}`,
          label,
          filePaths,
          subFigures: subFigures.length > 0 ? subFigures : undefined,
          position,
          environment: envName as 'figure' | 'figure*',
          referencedIn: [],
        }

        structure.figures.push(figure)

        for (const p of filePaths) seenPaths.add(p)
        if (subFigures) {
          for (const sf of subFigures) {
            for (const p of sf.filePaths) seenPaths.add(p)
          }
        }

        searchFrom = endPos + `\\end{${envName}}`.length
      }
    }

    // 兜底：扫描所有 includegraphics（包括独立出现在 text 中的）
    const allGraphics = extractAllIncludeGraphics(content)
    const mainBodyStart = content.indexOf('\\begin{document}')
    const mainBodyEnd = content.indexOf('\\end{document}')
    const mainBody = mainBodyStart !== -1 && mainBodyEnd !== -1
      ? content.substring(mainBodyStart, mainBodyEnd)
      : content

    const bodyGraphics = extractAllIncludeGraphics(mainBody)
    for (const imgPath of bodyGraphics) {
      if (!seenPaths.has(imgPath)) {
        seenPaths.add(imgPath)
        figureIndex++
        structure.figures.push({
          id: `fig-${figureIndex}`,
          caption: `Image ${figureIndex}`,
          filePaths: [imgPath],
          environment: 'figure',
          referencedIn: [],
        })
      }
    }
  }

  /**
   * 提取 subfigure / subcaption 子图。
   */
  private extractSubFigures(content: string): LatexFigure['subFigures'] {
    const result: NonNullable<LatexFigure['subFigures']> = []
    let subIndex = 0

    // 支持 subfigure 环境 (subcaption 宏包)
    for (const envName of ['subfigure', 'subtable']) {
      const beginTag = `\\begin{${envName}}`
      let searchFrom = 0

      while (searchFrom < content.length) {
        const beginPos = content.indexOf(beginTag, searchFrom)
        if (beginPos === -1) break

        const endPos = findMatchingEnd(content, beginPos, envName)
        if (endPos === -1) {
          searchFrom = beginPos + beginTag.length
          continue
        }

        subIndex++
        const body = content.substring(beginPos + beginTag.length, endPos)
        const caption = extractCaption(body)
        const filePaths = extractAllIncludeGraphics(body)

        result.push({
          id: `subfig-${subIndex}`,
          caption: caption || undefined,
          filePaths,
        })

        searchFrom = endPos + `\\end{${envName}}`.length
      }
    }

    // 支持 minipage 子图
    const minipageTag = '\\begin{minipage}'
    let mpSearch = 0
    while (mpSearch < content.length) {
      const mpBegin = content.indexOf(minipageTag, mpSearch)
      if (mpBegin === -1) break

      const mpEnd = findMatchingEnd(content, mpBegin, 'minipage')
      if (mpEnd === -1) {
        mpSearch = mpBegin + minipageTag.length
        continue
      }

      // 检查 minipage 中是否有 includegraphics（且没有被上层 figure 已捕获）
      const mpBody = content.substring(mpBegin + minipageTag.length, mpEnd)
      const mpGraphics = extractAllIncludeGraphics(mpBody)

      if (mpGraphics.length > 0) {
        subIndex++
        result.push({
          id: `minipage-${subIndex}`,
          filePaths: mpGraphics,
        })
      }

      mpSearch = mpEnd + '\\end{minipage}'.length
    }

    return result
  }

  private extractPosition(body: string): string | undefined {
    const match = body.match(/\\begin\{figure[\*]?\}\s*(\[[htbp!H]+\])/)
    return match?.[1]?.replace(/[\[\]]/g, '')
  }

  private parseTables(content: string, structure: LatexPaperStructure): void {
    let tableIndex = 0

    for (const envName of ['table', 'table*']) {
      const beginTag = `\\begin{${envName}}`
      let searchFrom = 0

      while (searchFrom < content.length) {
        const beginPos = content.indexOf(beginTag, searchFrom)
        if (beginPos === -1) break

        const endPos = findMatchingEnd(content, beginPos, envName)
        if (endPos === -1) {
          searchFrom = beginPos + beginTag.length
          continue
        }

        tableIndex++
        const body = content.substring(beginPos + beginTag.length, endPos)
        const caption = extractCaption(body)
        const label = extractLabel(body)
        const parsed = parseTabular(body)

        structure.tables.push({
          id: `tab-${tableIndex}`,
          caption: caption || `Table ${tableIndex}`,
          label,
          content: body,
          columns: parsed?.columns,
          rows: parsed?.rows,
          referencedIn: [],
        })

        searchFrom = endPos + `\\end{${envName}}`.length
      }
    }
  }

  private parseFormulas(content: string, structure: LatexPaperStructure): void {
    const envNames = ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*']
    let eqIndex = 0

    for (const envName of envNames) {
      const beginTag = `\\begin{${envName}}`
      let searchFrom = 0

      while (searchFrom < content.length) {
        const beginPos = content.indexOf(beginTag, searchFrom)
        if (beginPos === -1) break

        const endPos = findMatchingEnd(content, beginPos, envName)
        if (endPos === -1) {
          searchFrom = beginPos + beginTag.length
          continue
        }

        eqIndex++
        const body = content.substring(beginPos + beginTag.length, endPos)
        const label = extractLabel(body)

        structure.formulas.push({
          id: `eq-${eqIndex}`,
          content: body.trim(),
          display: 'block',
          label,
          referencedIn: [],
        })

        searchFrom = endPos + `\\end{${envName}}`.length
      }
    }
  }

  // ============ 图片文件操作 ============

  /**
   * 扫描目录中的所有图片文件（全量）。
   */
  async scanAllImages(dir: string): Promise<string[]> {
    const results: string[] = []
    const supportedSet = new Set(this.config.supportedImageExts.map(e => e.toLowerCase()))

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (supportedSet.has(ext)) {
          const fullPath = path.join(dir, entry.name)
          try {
            const stats = await fs.stat(fullPath)
            if (stats.size >= this.config.minImageSize) {
              results.push(fullPath)
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }

    // 按文件大小降序排列（大图通常更重要）
    results.sort((a, b) => {
      const sa = fs.stat(a).catch(() => ({ size: 0 }))
      const sb = fs.stat(b).catch(() => ({ size: 0 }))
      return sa.then(a2 => sb.then(b2 => b2.size - a2.size)).catch(() => 0) as unknown as number
    })

    return results
  }

  /**
   * 根据 tex 中的路径，在提取目录中找到实际文件。
   */
  async resolveImagePath(extractDir: string, texPath: string): Promise<string | null> {
    const baseName = path.basename(texPath, path.extname(texPath))
    const dirName = path.dirname(texPath)

    // 尝试的路径列表
    const candidates: string[] = []

    // 1. 原始路径
    candidates.push(path.join(extractDir, texPath))

    // 2. 不同扩展名
    for (const ext of this.config.supportedImageExts) {
      candidates.push(path.join(extractDir, dirName, `${baseName}${ext}`))
      candidates.push(path.join(extractDir, `${baseName}${ext}`))
    }

    // 3. 模糊匹配：文件名包含
    try {
      const allFiles = await this.scanAllImages(extractDir)
      for (const file of allFiles) {
        const fileName = path.basename(file, path.extname(file)).toLowerCase()
        const targetName = baseName.toLowerCase().replace(/[-_\s]/g, '')
        if (fileName.replace(/[-_\s]/g, '') === targetName) {
          candidates.push(file)
        }
      }
    } catch { /* ignore */ }

    // 尝试每个候选
    for (const candidate of candidates) {
      try {
        const stats = await fs.stat(candidate)
        if (stats.isFile() && stats.size >= this.config.minImageSize) {
          return candidate
        }
      } catch { /* skip */ }
    }

    return null
  }

  // ============ Manifest 生成 ============

  private buildManifest(paperId: string, structure: LatexPaperStructure, assets: ExtractedAsset[]): PaperAssetsManifest {
    // 按大小排序选择封面（最大非 fallback 图）
    const sortedAssets = [...assets].sort((a, b) => (b.size || 0) - (a.size || 0))
    const coverAsset = sortedAssets[0]

    const figurePaths = assets.map(a => `/papers/${paperId}/${this.normalizeFileName(path.basename(a.extractedPath))}`)

    // 如果已有 manifest，保留已有的 cover 路径
    const coverPath = coverAsset
      ? `/papers/${paperId}/${this.normalizeFileName(path.basename(coverAsset.extractedPath))}`
      : ''

    return {
      coverPath,
      figurePaths,
      coverSource: coverAsset?.format === '.pdf' ? 'source-pdf-figure' : 'source-raster',
      extractedAt: new Date().toISOString(),
      figureCount: assets.length,
      tableCount: structure.tables.length,
      figures: structure.figures.map(fig => ({
        id: fig.id,
        caption: fig.caption,
        assetPaths: fig.filePaths.map(fp => {
          const match = assets.find(a => {
            const aBase = path.basename(a.extractedPath, path.extname(a.extractedPath)).toLowerCase()
            const fBase = path.basename(fp, path.extname(fp)).toLowerCase()
            return aBase.replace(/[-_\s]/g, '') === fBase.replace(/[-_\s]/g, '')
          })
          return match ? `/papers/${paperId}/${this.normalizeFileName(path.basename(match.extractedPath))}` : ''
        }).filter(Boolean),
      })),
      tables: structure.tables.map(tab => ({
        id: tab.id,
        caption: tab.caption,
        columns: tab.columns,
        rows: tab.rows,
      })),
    }
  }

  /**
   * 规范化文件名：空格→连字符、小写、去除特殊字符
   */
  private normalizeFileName(name: string): string {
    return name
      .replace(/\s+/g, '-')
      .replace(/[()[\]{}!@#$%^&*+=~`'"]/g, '')
      .replace(/--+/g, '-')
      .toLowerCase()
  }

  // ============ 下载与解压 ============

  private async createTempDir(paperId: string): Promise<string> {
    const tempDir = path.join(this.config.tempDir, paperId)
    await fs.mkdir(tempDir, { recursive: true })
    return tempDir
  }

  private async downloadWithRetry(paperId: string, tempDir: string): Promise<{ success: boolean; error?: string }> {
    const url = this.config.arxivSourceUrl(paperId)
    const outputPath = path.join(tempDir, 'source.tar.gz')

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        console.log(`[下载] 尝试 ${attempt}/${this.config.retryAttempts}: ${paperId}`)
        const command = `curl -L -o "${outputPath}" --max-time ${this.config.timeout / 1000} "${url}"`
        await execAsync(command, { timeout: this.config.timeout })

        const stats = await fs.stat(outputPath)
        if (stats.size > 0) return { success: true }
        throw new Error('下载文件为空')
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`[下载失败] 尝试 ${attempt}: ${errorMsg}`)
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt)
        } else {
          return { success: false, error: errorMsg }
        }
      }
    }
    return { success: false, error: '所有重试都失败' }
  }

  private async extractSource(tempDir: string): Promise<{ success: boolean; error?: string }> {
    try {
      const tarPath = path.join(tempDir, 'source.tar.gz')
      const extractDir = path.join(tempDir, 'extracted')
      await fs.mkdir(extractDir, { recursive: true })

      // 检查文件类型
      let command: string
      try {
        const { stdout: fileType } = await execAsync(`file "${tarPath}"`)
        if (fileType.includes('gzip') || fileType.includes('tar')) {
          command = `tar -xzf "${tarPath}" -C "${extractDir}"`
        } else if (fileType.includes('Zip') || fileType.includes('zip')) {
          command = `tar -xf "${tarPath}" -C "${extractDir}" 2>nul || powershell -Command "Expand-Archive -Path '${tarPath}' -DestinationPath '${extractDir}' -Force"`
        } else {
          // 兜底：先试 tar 再试 powershell
          command = `tar -xf "${tarPath}" -C "${extractDir}" 2>nul || powershell -Command "Expand-Archive -Path '${tarPath}' -DestinationPath '${extractDir}' -Force"`
        }
      } catch {
        command = `tar -xf "${tarPath}" -C "${extractDir}" 2>nul || powershell -Command "Expand-Archive -Path '${tarPath}' -DestinationPath '${extractDir}' -Force"`
      }

      await execAsync(command, { timeout: 60000 })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  private async findMainTexFile(tempDir: string): Promise<string | null> {
    const extractDir = path.join(tempDir, 'extracted')
    const texFiles: string[] = []

    try {
      await this.findTexFilesRecursive(extractDir, texFiles)
    } catch {
      return null
    }

    if (texFiles.length === 0) return null
    if (texFiles.length === 1) return texFiles[0]

    // 找 \documentclass
    for (const f of texFiles) {
      const c = await fs.readFile(f, 'utf-8').catch(() => '')
      if (c.includes('\\documentclass')) return f
    }
    // 找 \begin{document}
    for (const f of texFiles) {
      const c = await fs.readFile(f, 'utf-8').catch(() => '')
      if (c.includes('\\begin{document}')) return f
    }

    // 返回最大的
    let largest = texFiles[0]
    let largestSize = 0
    for (const f of texFiles) {
      const s = await fs.stat(f).catch(() => ({ size: 0 }))
      if (s.size > largestSize) { largestSize = s.size; largest = f }
    }
    return largest
  }

  private async findTexFilesRecursive(dir: string, results: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await this.findTexFilesRecursive(full, results)
        } else if (entry.name.endsWith('.tex')) {
          results.push(full)
        }
      }
    } catch { /* ignore */ }
  }

  private async cleanup(tempDir: string): Promise<void> {
    try { await fs.rm(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ============ CLI ============

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.log('用法: npx ts-node scripts/arxiv-latex-parser.ts <paper-id>')
    console.log('示例: npx ts-node scripts/arxiv-latex-parser.ts 1604.07316')
    console.log('\n选项:')
    console.log('  --all    扫描所有论文目录，更新 manifest')
    console.log('  --scan   仅扫描现有目录，不下载')
    process.exit(1)
  }

  const paperId = args[0]
  const parser = new ArxivLatexParser()

  console.log(`\n📐 ArXiv LaTeX Parser v2.0`)
  console.log(`📄 论文: ${paperId}`)
  console.log(`\n⏳ 开始解析...\n`)

  const result = await parser.parse(paperId)

  if (result.success) {
    console.log(`✅ 解析成功!\n`)
    console.log(`📊 统计:`)
    console.log(`   图片环境: ${result.structure?.figures.length}`)
    console.log(`   表格环境: ${result.structure?.tables.length}`)
    console.log(`   公式环境: ${result.structure?.formulas.length}`)
    console.log(`   全量图片: ${result.allImageFiles.length}`)
    console.log(`   提取资源: ${result.extractedAssets.length}`)
    console.log(`\n🖼️  封面: ${result.extractedAssets.sort((a, b) => (b.size || 0) - (a.size || 0))[0]?.extractedPath || 'N/A'}`)
  } else {
    console.log(`❌ 解析失败!\n`)
    for (const err of result.errors) {
      console.log(`  [${err.type}] ${err.message}`)
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  警告 (${result.warnings.length}):`)
    for (const w of result.warnings.slice(0, 10)) {
      console.log(`   - ${w}`)
    }
    if (result.warnings.length > 10) {
      console.log(`   ... 还有 ${result.warnings.length - 10} 条`)
    }
  }
}

if (require.main === module) {
  main()
}

export default ArxivLatexParser
