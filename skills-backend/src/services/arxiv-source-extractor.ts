/**
 * ArXiv Source Extraction Service
 *
 * Downloads arXiv paper source tarballs (LaTeX + assets) and extracts
 * high-quality images directly from the source. This provides a fallback
 * when PDF extraction yields low-confidence figures.
 *
 * Pipeline:
 *   1. Download source tarball from arXiv e-print endpoint
 *   2. Find main .tex file
 *   3. Parse LaTeX for \includegraphics and \begin{figure} commands
 *   4. Match referenced image files to actual files in the tarball
 *   5. Return high-quality figure entries with source-based confidence
 *
 * Usage:
 *   const extractor = new ArxivSourceExtractor()
 *   const figures = await extractor.extractFigures('2301.10945', outputDir)
 */

import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as _crypto from 'crypto'

import { logger } from '../utils/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceFigure {
  id: string
  number: number
  caption: string
  imagePath: string
  width: number
  height: number
  confidence: number
  extractionMethod: 'arxiv_source'
  isSubFigure: boolean
  parentFigureNumber?: number
  subId?: string
  latexReference: string
}

export interface ArxivExtractionResult {
  arxivId: string
  figures: SourceFigure[]
  figureGroups: Array<{
    groupId: string
    parentNumber: number
    caption: string
    subFigures: SourceFigure[]
    confidence: number
    extractionMethod: 'arxiv_source'
  }>
  sourceAvailable: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARXIV_EPRINT_BASE = 'https://export.arxiv.org/e-print/'
const ARXIV_SOURCE_CACHE_DIR = 'arxiv-sources'
const REQUEST_TIMEOUT_MS = 30_000
const RATE_LIMIT_MS = 3_000  // 3 seconds between requests

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.pdf', '.eps', '.ps', '.tiff', '.tif', '.bmp',
])

const LATEX_FIGURE_ENV_RE = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g
const LATEX_FIGURE_STAR_ENV_RE = /\\begin\{figure\*\}[\s\S]*?\\end\{figure\*\}/g
const LATEX_INCLUDEGRAPHICS_RE = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g
const LATEX_CAPTION_RE = /\\caption(?:\[[^\]]*\])?\s*\{([^}]+)\}/g
const LATEX_LABEL_RE = /\\label\{([^}]+)\}/g
const LATEX_SUBFIGURE_RE = /\\subfloat\s*(?:\[[^\]]*\])?\s*\{[\s\S]*?\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g
const LATEX_SUBCAPTION_RE = /\\subfloat\s*\[([^]]*)\]/g
const FIGURE_NUMBER_RE = /(?:Figure|Fig\.?|图)\s*(\d+)/i

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

let lastRequestTime = 0

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastRequest))
  }

  lastRequestTime = Date.now()

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TraceMind/1.0 (research@example.com)',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  return response
}

// ---------------------------------------------------------------------------
// ArXiv Source Extractor
// ---------------------------------------------------------------------------

export class ArxivSourceExtractor {
  private cacheDir: string

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(process.cwd(), ARXIV_SOURCE_CACHE_DIR)
  }

  /**
   * Extract figures from arXiv paper source.
   *
   * @param arxivId - arXiv identifier (e.g., "2301.10945" or "2301.10945v1")
   * @param outputDir - Directory to save extracted images
   * @returns Extraction result with figures and figure groups
   */
  async extractFigures(arxivId: string, outputDir: string): Promise<ArxivExtractionResult> {
    const normalizedId = this.normalizeArxivId(arxivId)

    logger.info('Starting arXiv source extraction', { arxivId: normalizedId })

    try {
      // Step 1: Download source tarball
      const sourceDir = await this.downloadAndExtractSource(normalizedId)

      if (!sourceDir) {
        return {
          arxivId: normalizedId,
          figures: [],
          figureGroups: [],
          sourceAvailable: false,
          error: 'Failed to download source tarball',
        }
      }

      // Step 2: Find main TeX file
      const mainTexPath = this.findMainTexFile(sourceDir)

      if (!mainTexPath) {
        return {
          arxivId: normalizedId,
          figures: [],
          figureGroups: [],
          sourceAvailable: true,
          error: 'No main TeX file found in source',
        }
      }

      // Step 3: Parse LaTeX for figure references
      const latexContent = fs.readFileSync(mainTexPath, 'utf-8')
      const figureRefs = this.parseLatexFigures(latexContent)

      // Step 4: Index available image files
      const imageIndex = this.indexSourceImages(sourceDir)

      // Step 5: Match references to files and create figure entries
      const figures = this.matchAndExtractFigures(
        figureRefs,
        imageIndex,
        sourceDir,
        outputDir,
        normalizedId,
      )

      // Step 6: Detect figure groups
      const figureGroups = this.detectFigureGroups(figures)

      logger.info('ArXiv source extraction completed', {
        arxivId: normalizedId,
        figureCount: figures.length,
        figureGroupCount: figureGroups.length,
      })

      return {
        arxivId: normalizedId,
        figures,
        figureGroups,
        sourceAvailable: true,
      }
    } catch (error) {
      logger.warn('ArXiv source extraction failed', {
        arxivId: normalizedId,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        arxivId: normalizedId,
        figures: [],
        figureGroups: [],
        sourceAvailable: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Normalize arXiv ID to remove version suffix and URL prefixes.
   */
  private normalizeArxivId(arxivId: string): string {
    // Remove URL prefix if present
    let normalized = arxivId.replace(/^https?:\/\/arxiv\.org\/abs\//, '')
    normalized = normalized.replace(/^https?:\/\/arxiv\.org\/pdf\//, '')

    // Remove .pdf suffix
    normalized = normalized.replace(/\.pdf$/, '')

    // Keep version if present, otherwise use latest
    return normalized.trim()
  }

  /**
   * Download and extract arXiv source tarball.
   */
  private async downloadAndExtractSource(arxivId: string): Promise<string | null> {
    const sourceDir = path.join(this.cacheDir, arxivId.replace(/[/\\]/g, '_'))

    // Check cache
    if (fs.existsSync(path.join(sourceDir, '.extracted'))) {
      logger.info('Using cached arXiv source', { arxivId })
      return sourceDir
    }

    // Download source
    const url = `${ARXIV_EPRINT_BASE}${arxivId}`

    logger.info('Downloading arXiv source', { arxivId, url })

    let response: Response
    try {
      response = await rateLimitedFetch(url)
    } catch (error) {
      logger.warn('Failed to download arXiv source', { arxivId, error })
      return null
    }

    if (!response.ok) {
      logger.warn('arXiv source download failed', { arxivId, status: response.status })
      return null
    }

    // Save tarball
    fs.mkdirSync(sourceDir, { recursive: true })
    const tarPath = path.join(sourceDir, 'source.tar.gz')
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(tarPath, buffer)

    // Extract tarball using system tar command
    try {
      await this.extractTarball(tarPath, sourceDir)

      // Mark as extracted
      fs.writeFileSync(path.join(sourceDir, '.extracted'), new Date().toISOString())

      return sourceDir
    } catch (error) {
      logger.warn('Failed to extract arXiv source tarball', { arxivId, error })
      return null
    }
  }

  /**
   * Extract tarball using system tar command (works on Unix and Windows 10+).
   * Windows 10+ includes built-in tar in PATH, so we use it directly.
   */
  private extractTarball(tarPath: string, targetDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tarProcess = spawn('tar', ['-xzf', tarPath, '-C', targetDir], {
        timeout: 60_000,
      })

      let stderr = ''

      tarProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })

      tarProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`tar extraction failed (exit ${code}): ${stderr}`))
        } else {
          resolve()
        }
      })

      tarProcess.on('error', (error: Error) => {
        reject(new Error(`tar process failed: ${error.message}. On Windows, ensure tar is available (built-in on Windows 10+).`))
      })
    })
  }

  /**
   * Find the main TeX file in the extracted source.
   */
  private findMainTexFile(sourceDir: string): string | null {
    const files = this.walkDir(sourceDir, '.tex')

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8')
        if (content.includes('\\documentclass') || content.includes('\\begin{document}')) {
          return file
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return null
  }

  /**
   * Parse LaTeX content for figure references.
   */
  private parseLatexFigures(latexContent: string): Array<{
    type: 'figure' | 'includegraphics' | 'subfigure'
    graphicsPaths: string[]
    caption: string | null
    label: string | null
    figureNumber: number | null
    subId: string | null
  }> {
    const refs: Array<{
      type: 'figure' | 'includegraphics' | 'subfigure'
      graphicsPaths: string[]
      caption: string | null
      label: string | null
      figureNumber: number | null
      subId: string | null
    }> = []

    // Parse \begin{figure}...\end{figure} environments
    const figureEnvs = [
      ...latexContent.matchAll(LATEX_FIGURE_ENV_RE),
      ...latexContent.matchAll(LATEX_FIGURE_STAR_ENV_RE),
    ]

    let figureCounter = 1

    for (const envMatch of figureEnvs) {
      const envContent = envMatch[0]

      // Extract graphics paths
      const graphicsPaths: string[] = []
      for (const graphicMatch of envContent.matchAll(LATEX_INCLUDEGRAPHICS_RE)) {
        graphicsPaths.push(graphicMatch[1].trim())
      }

      // Extract caption
      let caption: string | null = null
      const captionMatches = [...envContent.matchAll(LATEX_CAPTION_RE)]
      if (captionMatches.length > 0) {
        caption = captionMatches[0][1].trim()
      }

      // Extract label
      let label: string | null = null
      const labelMatches = [...envContent.matchAll(LATEX_LABEL_RE)]
      if (labelMatches.length > 0) {
        label = labelMatches[0][1].trim()
      }

      // Try to extract figure number from caption
      let figureNumber: number | null = null
      if (caption) {
        const numMatch = caption.match(FIGURE_NUMBER_RE)
        if (numMatch) {
          figureNumber = parseInt(numMatch[1], 10)
        }
      }

      // Check for sub-figures
      const subFigMatches = [...envContent.matchAll(LATEX_SUBFIGURE_RE)]

      if (subFigMatches.length > 0) {
        // Multi-panel figure (组图)
        const subCaptMatches = [...envContent.matchAll(LATEX_SUBCAPTION_RE)]

        for (let i = 0; i < subFigMatches.length; i++) {
          const subGraphicPath = subFigMatches[i][1].trim()
          const subCaption = subCaptMatches[i]?.[1]?.trim() || null
          const subId = String.fromCharCode(97 + i)  // a, b, c, ...

          refs.push({
            type: 'subfigure',
            graphicsPaths: [subGraphicPath],
            caption: subCaption,
            label: label ? `${label}:${subId}` : null,
            figureNumber: figureNumber ?? figureCounter,
            subId,
          })
        }
      } else if (graphicsPaths.length > 0) {
        // Single figure
        refs.push({
          type: 'figure',
          graphicsPaths,
          caption,
          label,
          figureNumber: figureNumber ?? figureCounter,
          subId: null,
        })
      }

      figureCounter++
    }

    // Also find standalone \includegraphics (outside figure environments)
    for (const match of latexContent.matchAll(LATEX_INCLUDEGRAPHICS_RE)) {
      const graphicPath = match[1].trim()

      // Check if this graphic is already captured in a figure environment
      const alreadyCaptured = refs.some(
        (ref) => ref.graphicsPaths.includes(graphicPath)
      )

      if (!alreadyCaptured) {
        refs.push({
          type: 'includegraphics',
          graphicsPaths: [graphicPath],
          caption: null,
          label: null,
          figureNumber: figureCounter,
          subId: null,
        })
        figureCounter++
      }
    }

    return refs
  }

  /**
   * Index all image files in the source directory.
   */
  private indexSourceImages(sourceDir: string): Map<string, string> {
    const index = new Map<string, string>()
    const files = this.walkDir(sourceDir)

    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      if (IMAGE_EXTENSIONS.has(ext)) {
        // Index by lowercase basename and stem
        const basename = path.basename(file).toLowerCase()
        const stem = path.basename(file, ext).toLowerCase()

        index.set(basename, file)
        index.set(stem, file)

        // Also index relative path from source dir
        const relativePath = path.relative(sourceDir, file).replace(/\\/g, '/').toLowerCase()
        index.set(relativePath, file)
      }
    }

    return index
  }

  /**
   * Match figure references to actual image files and create figure entries.
   */
  private matchAndExtractFigures(
    figureRefs: Array<{
      type: string
      graphicsPaths: string[]
      caption: string | null
      label: string | null
      figureNumber: number | null
      subId: string | null
    }>,
    imageIndex: Map<string, string>,
    sourceDir: string,
    outputDir: string,
    arxivId: string,
  ): SourceFigure[] {
    const figures: SourceFigure[] = []
    const outputImagesDir = path.join(outputDir, 'arxiv-source-images')

    fs.mkdirSync(outputImagesDir, { recursive: true })

    let figureCounter = 1

    for (const ref of figureRefs) {
      const resolvedPaths: string[] = []

      for (const graphicPath of ref.graphicsPaths) {
        const resolved = this.resolveImagePath(graphicPath, imageIndex)
        if (resolved) {
          resolvedPaths.push(resolved)
        }
      }

      if (resolvedPaths.length === 0) {
        continue
      }

      // Use the first resolved image as the primary
      const sourcePath = resolvedPaths[0]
      const filename = `arxiv_source_figure_${figureCounter}.png`
      const targetPath = path.join(outputImagesDir, filename)

      try {
        // Copy or convert the image
        this.copyOrConvertImage(sourcePath, targetPath)

        // Get image dimensions
        const dimensions = this.getImageDimensions(targetPath)

        figures.push({
          id: `arxiv_source_figure_${figureCounter}`,
          number: ref.figureNumber ?? figureCounter,
          caption: ref.caption || `Figure ${ref.figureNumber ?? figureCounter}`,
          imagePath: targetPath,
          width: dimensions.width,
          height: dimensions.height,
          confidence: ref.type === 'subfigure' ? 0.90 : 0.95,
          extractionMethod: 'arxiv_source',
          isSubFigure: ref.type === 'subfigure',
          parentFigureNumber: ref.type === 'subfigure' ? ref.figureNumber ?? undefined : undefined,
          subId: ref.subId ?? undefined,
          latexReference: ref.graphicsPaths.join(', '),
        })

        figureCounter++
      } catch (error) {
        logger.warn('Failed to process source image', {
          arxivId,
          sourcePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return figures
  }

  /**
   * Resolve a LaTeX image path to an actual file.
   */
  private resolveImagePath(latexPath: string, imageIndex: Map<string, string>): string | null {
    // Normalize the path
    let normalized = latexPath.trim().replace(/\\/g, '/')

    // Remove leading ./ or /
    normalized = normalized.replace(/^\.\//, '').replace(/^\//, '')

    // Direct match
    if (imageIndex.has(normalized.toLowerCase())) {
      return imageIndex.get(normalized.toLowerCase())!
    }

    // Try without extension
    const ext = path.extname(normalized)
    const stem = ext ? normalized.slice(0, -ext.length) : normalized
    if (imageIndex.has(stem.toLowerCase())) {
      return imageIndex.get(stem.toLowerCase())!
    }

    // Try with various extensions
    for (const tryExt of ['.png', '.pdf', '.jpg', '.eps', '.jpeg', '.tiff']) {
      const candidate = `${stem}${tryExt}`.toLowerCase()
      if (imageIndex.has(candidate)) {
        return imageIndex.get(candidate)!
      }
    }

    // Try basename only
    const basename = path.basename(normalized).toLowerCase()
    if (imageIndex.has(basename)) {
      return imageIndex.get(basename)!
    }

    const basenameStem = path.basename(normalized, ext).toLowerCase()
    if (imageIndex.has(basenameStem)) {
      return imageIndex.get(basenameStem)!
    }

    return null
  }

  /**
   * Copy or convert an image file to PNG.
   */
  private copyOrConvertImage(sourcePath: string, targetPath: string): void {
    const ext = path.extname(sourcePath).toLowerCase()

    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
      // Direct copy for common formats
      fs.copyFileSync(sourcePath, targetPath.replace(/\.png$/, ext))
      return
    }

    if (ext === '.pdf' || ext === '.eps') {
      // Use sharp or ImageMagick for conversion (best effort)
      // For now, just copy and hope the consumer can handle it
      try {
        fs.copyFileSync(sourcePath, targetPath.replace(/\.png$/, ext))
      } catch {
        // If copy fails, skip this image
      }
      return
    }

    // For other formats, just copy directly
    try {
      fs.copyFileSync(sourcePath, targetPath)
    } catch {
      // Skip
    }
  }

  /**
   * Get image dimensions (best effort).
   */
  private getImageDimensions(imagePath: string): { width: number; height: number } {
    // Simple PNG header parsing for dimensions
    try {
      const buffer = fs.readFileSync(imagePath)

      // PNG dimensions are at bytes 16-23
      if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
        const width = buffer.readUInt32BE(16)
        const height = buffer.readUInt32BE(20)
        return { width, height }
      }

      // JPEG dimensions
      if (buffer.length > 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
        // Simple JPEG dimension extraction
        let offset = 2
        while (offset < buffer.length - 1) {
          if (buffer[offset] !== 0xFF) break
          const marker = buffer[offset + 1]
          if (marker === 0xC0 || marker === 0xC2) {
            const height = buffer.readUInt16BE(offset + 5)
            const width = buffer.readUInt16BE(offset + 7)
            return { width, height }
          }
          const segLength = buffer.readUInt16BE(offset + 2)
          offset += 2 + segLength
        }
      }
    } catch {
      // Ignore dimension extraction errors
    }

    return { width: 0, height: 0 }
  }

  /**
   * Detect figure groups from source figures.
   */
  private detectFigureGroups(figures: SourceFigure[]): Array<{
    groupId: string
    parentNumber: number
    caption: string
    subFigures: SourceFigure[]
    confidence: number
    extractionMethod: 'arxiv_source'
  }> {
    const groupMap = new Map<number, SourceFigure[]>()

    for (const figure of figures) {
      if (figure.isSubFigure && figure.parentFigureNumber) {
        if (!groupMap.has(figure.parentFigureNumber)) {
          groupMap.set(figure.parentFigureNumber, [])
        }
        groupMap.get(figure.parentFigureNumber)!.push(figure)
      }
    }

    return Array.from(groupMap.entries())
      .filter(([_, subFigures]) => subFigures.length >= 2)
      .map(([parentNumber, subFigures]) => ({
        groupId: `arxiv_source_figure_group_${parentNumber}`,
        parentNumber,
        caption: subFigures[0].caption,
        subFigures,
        confidence: Math.min(...subFigures.map(f => f.confidence)),
        extractionMethod: 'arxiv_source' as const,
      }))
  }

  /**
   * Walk directory recursively and return all files matching extension filter.
   */
  private walkDir(dir: string, extFilter?: string): string[] {
    const results: string[] = []

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          // Skip hidden directories and common non-source dirs
          if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name === 'node_modules') {
            continue
          }
          results.push(...this.walkDir(fullPath, extFilter))
        } else if (entry.isFile()) {
          if (!extFilter || path.extname(entry.name).toLowerCase() === extFilter) {
            results.push(fullPath)
          }
        }
      }
    } catch {
      // Directory may not exist or be readable
    }

    return results
  }
}

// Singleton instance
let globalExtractor: ArxivSourceExtractor | null = null

export function getArxivSourceExtractor(): ArxivSourceExtractor {
  if (!globalExtractor) {
    globalExtractor = new ArxivSourceExtractor()
  }
  return globalExtractor
}
