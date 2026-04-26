/**
 * Citation Manager
 *
 * Generates academic citation entries from paper metadata.
 * Supports IEEE numbered style (default), APA author-year style, and BibTeX export.
 *
 * Key features:
 * - IEEE numbered style: [1], [2], [3] sequential numbering
 * - APA author-year style: (Author et al., Year)
 * - BibTeX export for reference managers
 * - Handles Chinese and English author names
 * - DOI and arXiv links when available
 */

import type { PaperContext } from './types'

// ============================================================================
// Citation Types
// ============================================================================

/**
 * Citation style options
 */
export type CitationStyle = 'ieee' | 'apa'

/**
 * Citation marker for inline references
 */
export interface CitationMarker {
  /** Unique identifier for the citation */
  id: string
  /** Paper ID being cited */
  paperId: string
  /** Citation number (IEEE) or author-year (APA) */
  marker: string
  /** Position in the text (character offset) */
  position?: number
}

/**
 * Formatted reference entry
 */
export interface FormattedReference {
  /** Unique reference ID */
  id: string
  /** Paper ID */
  paperId: string
  /** Citation number (IEEE style) */
  number: number
  /** Formatted reference text */
  text: string
  /** DOI link if available */
  doi?: string
  /** arXiv link if available */
  arxiv?: string
  /** BibTeX entry */
  bibtex: string
}

/**
 * Complete reference list
 */
export interface ReferenceList {
  /** Citation style used */
  style: CitationStyle
  /** All formatted references */
  references: FormattedReference[]
  /** Inline citation markers */
  markers: CitationMarker[]
  /** BibTeX export string */
  bibtexExport: string
}

/**
 * Paper metadata for citation generation
 */
export interface CitationPaper {
  id: string
  title: string
  titleZh?: string
  titleEn?: string
  authors: string
  published: Date | string
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  arxivUrl?: string
  pdfUrl?: string
}

// ============================================================================
// Author Name Utilities
// ============================================================================

/**
 * Parse authors string into array of author names
 * Handles both JSON array format and comma/semicolon separated strings
 */
export function parseAuthors(authorsString: string): string[] {
  if (!authorsString || authorsString.trim() === '') {
    return []
  }

  // Try JSON parse first
  try {
    const parsed = JSON.parse(authorsString)
    if (Array.isArray(parsed)) {
      return parsed.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    }
  } catch {
    // Not JSON, continue with string parsing
  }

  // Split by common separators
  const separators = /[，,;、]/u
  const authors = authorsString
    .split(separators)
    .map((a) => a.trim())
    .filter((a) => a.length > 0)

  return authors
}

/**
 * Check if a name is likely Chinese
 */
function isChineseName(name: string): boolean {
  // Chinese names typically have 2-4 characters and are all Chinese characters
  const chinesePattern = /^[\u4e00-\u9fff\u3400-\u4dbf]{2,4}$/u
  return chinesePattern.test(name)
}

/**
 * Format author name for IEEE style
 * - English: "Last, F." or "Last, First Middle"
 * - Chinese: Keep as-is (family name first is standard)
 */
function formatAuthorIEEE(author: string): string {
  const trimmed = author.trim()
  if (!trimmed) return ''

  // Chinese name - keep as-is
  if (isChineseName(trimmed)) {
    return trimmed
  }

  // Check if already in "Last, First" format
  if (trimmed.includes(',')) {
    return trimmed
  }

  // Split into parts
  const parts = trimmed.split(/\s+/u)
  if (parts.length === 1) {
    return trimmed
  }

  // Last name is the final part
  const lastName = parts[parts.length - 1]
  const firstNames = parts.slice(0, -1)

  // Abbreviate first names
  const initials = firstNames.map((n) => (n[0] ?? '') + '.').join(' ')

  return `${lastName}, ${initials}`
}

/**
 * Format author name for APA style
 * - English: "Last, F. M." format
 * - Chinese: Keep as-is
 */
function formatAuthorAPA(author: string): string {
  return formatAuthorIEEE(author) // Same formatting for individual names
}

/**
 * Format author list for IEEE style
 * - 1 author: "A."
 * - 2 authors: "A. and B."
 * - 3+ authors: "A., B., C., and D." (use "et al." in-text for 6+)
 */
function formatAuthorsIEEE(authors: string[]): string {
  if (authors.length === 0) return 'Unknown Author'
  if (authors.length === 1) return formatAuthorIEEE(authors[0]!)
  if (authors.length === 2) {
    return `${formatAuthorIEEE(authors[0]!)} and ${formatAuthorIEEE(authors[1]!)}`
  }

  // 3-5 authors: list all
  if (authors.length <= 5) {
    const allButLast = authors.slice(0, -1).map(formatAuthorIEEE)
    const last = formatAuthorIEEE(authors[authors.length - 1]!)
    return `${allButLast.join(', ')}, and ${last}`
  }

  // 6+ authors: list first author + "et al."
  return `${formatAuthorIEEE(authors[0]!)} et al.`
}

/**
 * Format author list for APA style
 * - 1 author: "A."
 * - 2 authors: "A., & B."
 * - 3-20 authors: list all with & before last
 * - 21+ authors: first 19, ..., last author
 */
function formatAuthorsAPA(authors: string[]): string {
  if (authors.length === 0) return 'Unknown Author'
  if (authors.length === 1) return formatAuthorAPA(authors[0]!)
  if (authors.length === 2) {
    return `${formatAuthorAPA(authors[0]!)}, \& ${formatAuthorAPA(authors[1]!)}`
  }

  // 3-20 authors
  if (authors.length <= 20) {
    const allButLast = authors.slice(0, -1).map(formatAuthorAPA)
    const last = formatAuthorAPA(authors[authors.length - 1]!)
    return `${allButLast.join(', ')}, \& ${last}`
  }

  // 21+ authors: first 19, ..., last
  const first19 = authors.slice(0, 19).map(formatAuthorAPA)
  const last = formatAuthorAPA(authors[authors.length - 1]!)
  return `${first19.join(', ')}, ... ${last}`
}

/**
 * Get author-year citation marker for APA style
 * Returns "(Author et al., Year)" or "(Author, Year)" format
 */
function getAuthorYearMarker(authors: string[], year: number): string {
  if (authors.length === 0) {
    return `(Unknown, ${year})`
  }

  const firstAuthor = authors[0]!
  const lastName = firstAuthor.includes(',')
    ? firstAuthor.split(',')[0]!
    : firstAuthor.split(/\s+/u).pop() ?? firstAuthor

  if (authors.length === 1) {
    return `(${lastName}, ${year})`
  }

  if (authors.length <= 5) {
    return `(${lastName} et al., ${year})`
  }

  return `(${lastName} et al., ${year})`
}

// ============================================================================
// DOI and arXiv Utilities
// ============================================================================

/**
 * Extract DOI from URL or direct string
 */
function extractDOI(doiOrUrl?: string): string | undefined {
  if (!doiOrUrl) return undefined

  // Direct DOI format
  const doiPattern = /^10\.\d{4,}\/[^\s]+$/u
  if (doiPattern.test(doiOrUrl)) {
    return doiOrUrl
  }

  // DOI URL format
  const doiUrlPattern = /https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,}\/[^\s]+)/u
  const match = doiOrUrl.match(doiUrlPattern)
  if (match) {
    return match[1]
  }

  return undefined
}

/**
 * Extract arXiv ID from URL
 */
function extractArxivId(arxivUrl?: string): string | undefined {
  if (!arxivUrl) return undefined

  // New format: https://arxiv.org/abs/YYMM.NNNNN
  const newPattern = /arxiv\.org\/abs\/(\d{4}\.\d{4,5})/iu
  const newMatch = arxivUrl.match(newPattern)
  if (newMatch) {
    return newMatch[1]
  }

  // Old format: https://arxiv.org/abs/category/YYMMNNN
  const oldPattern = /arxiv\.org\/abs\/([a-z-]+\/\d{7})/iu
  const oldMatch = arxivUrl.match(oldPattern)
  if (oldMatch) {
    return oldMatch[1]
  }

  return undefined
}

/**
 * Format DOI as URL
 */
function formatDOIUrl(doi?: string): string | undefined {
  if (!doi) return undefined
  return `https://doi.org/${doi}`
}

/**
 * Format arXiv as URL
 */
function formatArxivUrl(arxivId?: string): string | undefined {
  if (!arxivId) return undefined
  return `https://arxiv.org/abs/${arxivId}`
}

// ============================================================================
// Citation Formatting
// ============================================================================

/**
 * Format year from date
 */
function getYear(date: Date | string): number {
  if (typeof date === 'string') {
    return new Date(date).getFullYear() || new Date().getFullYear()
  }
  return date.getFullYear()
}

/**
 * Format a single reference in IEEE style
 *
 * Format: Author(s), "Title," Journal/venue, vol. X, no. Y, pp. Z-Z, Year.
 * For arXiv: Author(s), "Title," arXiv:YYMM.NNNNN, Year.
 */
function formatReferenceIEEE(paper: CitationPaper, number: number): string {
  const authors = parseAuthors(paper.authors)
  const authorStr = formatAuthorsIEEE(authors)
  const year = getYear(paper.published)
  const title = paper.titleEn || paper.title

  let ref = `[${number}] ${authorStr}, "${title},"`

  // Add venue/journal
  if (paper.journal) {
    ref += ` ${paper.journal}`
    if (paper.volume) ref += `, vol. ${paper.volume}`
    if (paper.issue) ref += `, no. ${paper.issue}`
    if (paper.pages) ref += `, pp. ${paper.pages}`
  } else {
    // arXiv paper
    const arxivId = extractArxivId(paper.arxivUrl)
    if (arxivId) {
      ref += ` arXiv:${arxivId}`
    }
  }

  ref += `, ${year}.`

  // Add DOI if available
  const doi = extractDOI(paper.doi)
  if (doi) {
    ref += ` doi: ${doi}.`
  }

  return ref
}

/**
 * Format a single reference in APA style
 *
 * Format: Author(s). (Year). Title. Journal/venue, vol(issue), pages. DOI
 */
function formatReferenceAPA(paper: CitationPaper): string {
  const authors = parseAuthors(paper.authors)
  const authorStr = formatAuthorsAPA(authors)
  const year = getYear(paper.published)
  const title = paper.titleEn || paper.title

  let ref = `${authorStr} (${year}). ${title}.`

  // Add venue/journal
  if (paper.journal) {
    ref += ` ${paper.journal}`
    if (paper.volume) {
      ref += `, ${paper.volume}`
      if (paper.issue) ref += `(${paper.issue})`
    }
    if (paper.pages) ref += `, ${paper.pages}`
    ref += '.'
  }

  // Add DOI if available
  const doi = extractDOI(paper.doi)
  if (doi) {
    ref += ` https://doi.org/${doi}`
  } else {
    // Add arXiv URL if available
    const arxivId = extractArxivId(paper.arxivUrl)
    if (arxivId) {
      ref += ` https://arxiv.org/abs/${arxivId}`
    }
  }

  return ref
}

/**
 * Generate BibTeX entry for a paper
 */
function generateBibtex(paper: CitationPaper, citeKey?: string): string {
  const authors = parseAuthors(paper.authors)
  const year = getYear(paper.published)
  const title = paper.titleEn || paper.title

  // Generate citation key: firstAuthorYear or provided key
  const firstAuthor = authors[0]?.split(/\s+/u).pop() ?? 'Unknown'
  const safeFirstAuthor = firstAuthor.replace(/[^a-zA-Z]/gu, '')
  const key = citeKey || `${safeFirstAuthor}${year}`

  // Determine entry type
  const arxivId = extractArxivId(paper.arxivUrl)
  const isArxiv = !paper.journal && arxivId

  const lines: string[] = []

  if (isArxiv) {
    lines.push(`@article{${key},`)
    lines.push(`  title     = {${title}},`)
    lines.push(`  author    = {${authors.join(' and ')}}`)
    lines.push(`  year      = {${year}},`)
    lines.push(`  eprint    = {${arxivId}},`)
    lines.push(`  archivePrefix = {arXiv},`)
    if (paper.doi) {
      lines.push(`  doi       = {${paper.doi}},`)
    }
  } else {
    lines.push(`@article{${key},`)
    lines.push(`  title     = {${title}},`)
    lines.push(`  author    = {${authors.join(' and ')}}`)
    lines.push(`  year      = {${year}},`)
    if (paper.journal) {
      lines.push(`  journal   = {${paper.journal}},`)
    }
    if (paper.volume) {
      lines.push(`  volume    = {${paper.volume}},`)
    }
    if (paper.issue) {
      lines.push(`  number    = {${paper.issue}},`)
    }
    if (paper.pages) {
      lines.push(`  pages     = {${paper.pages}},`)
    }
    if (paper.doi) {
      lines.push(`  doi       = {${paper.doi}},`)
    }
  }

  lines.push('}')

  return lines.join('\n')
}

// ============================================================================
// Citation Manager Class
// ============================================================================

/**
 * Citation Manager
 *
 * Manages citation generation, formatting, and reference list creation.
 */
export class CitationManager {
  private style: CitationStyle
  private papers: Map<string, CitationPaper>
  private citationOrder: string[]
  private citationNumber: Map<string, number>

  constructor(style: CitationStyle = 'ieee') {
    this.style = style
    this.papers = new Map()
    this.citationOrder = []
    this.citationNumber = new Map()
  }

  /**
   * Add a paper to the citation manager
   */
  addPaper(paper: CitationPaper): void {
    if (!this.papers.has(paper.id)) {
      this.papers.set(paper.id, paper)
    }
  }

  /**
   * Add multiple papers
   */
  addPapers(papers: CitationPaper[]): void {
    papers.forEach((p) => this.addPaper(p))
  }

  /**
   * Add paper from PaperContext (editorial agent format)
   */
  addPaperFromContext(paper: PaperContext): void {
    this.addPaper({
      id: paper.id,
      title: paper.title,
      titleZh: paper.titleZh,
      titleEn: paper.titleEn,
      authors: paper.authors,
      published: paper.published,
      journal: paper.journal,
      volume: paper.volume,
      issue: paper.issue,
      pages: paper.pages,
      doi: paper.doi,
      arxivUrl: paper.arxivUrl,
      pdfUrl: paper.pdfUrl,
    })
  }

  /**
   * Get citation marker for a paper
   * - IEEE: [1], [2], [3]
   * - APA: (Author et al., Year)
   */
  getCitationMarker(paperId: string): CitationMarker {
    const paper = this.papers.get(paperId)
    if (!paper) {
      return {
        id: `cite-${paperId}`,
        paperId,
        marker: '[?]',
      }
    }

    // Track citation order for IEEE numbering
    if (!this.citationOrder.includes(paperId)) {
      this.citationOrder.push(paperId)
      this.citationNumber.set(paperId, this.citationOrder.length)
    }

    let marker: string
    if (this.style === 'ieee') {
      const num = this.citationNumber.get(paperId)!
      marker = `[${num}]`
    } else {
      const authors = parseAuthors(paper.authors)
      const year = getYear(paper.published)
      marker = getAuthorYearMarker(authors, year)
    }

    return {
      id: `cite-${paperId}`,
      paperId,
      marker,
    }
  }

  /**
   * Get multiple citation markers (for citing multiple papers at once)
   * IEEE: [1]-[3] or [1], [3], [5]
   * APA: (Author1 et al., Year1; Author2 et al., Year2)
   */
  getMultiCitationMarker(paperIds: string[]): CitationMarker[] {
    return paperIds.map((id) => this.getCitationMarker(id))
  }

  /**
   * Format inline citation text
   * IEEE: [1], [1, 2], [1]-[3]
   * APA: (Author et al., Year)
   */
  formatInlineCitation(paperIds: string | string[]): string {
    const ids = Array.isArray(paperIds) ? paperIds : [paperIds]
    const markers = this.getMultiCitationMarker(ids)

    if (this.style === 'ieee') {
      // Sort by citation number
      const numbers = markers
        .map((m) => parseInt(m.marker.slice(1, -1), 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b)

      if (numbers.length === 0) return '[?]'
      if (numbers.length === 1) return `[${numbers[0]}]`

      // Check for consecutive range
      const isConsecutive = numbers.length > 2 &&
        numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1)

      if (isConsecutive) {
        return `[${numbers[0]}-${numbers[numbers.length - 1]}]`
      }

      return `[${numbers.join(', ')}]`
    }

    // APA style - join with semicolons
    return markers.map((m) => m.marker).join('; ')
  }

  /**
   * Generate formatted reference list
   */
  generateReferenceList(): ReferenceList {
    const references: FormattedReference[] = []
    const markers: CitationMarker[] = []

    // Sort papers by citation order (for IEEE) or alphabetically (for APA)
    let sortedPaperIds: string[]
    if (this.style === 'ieee') {
      sortedPaperIds = this.citationOrder
    } else {
      // APA: sort by first author's last name
      sortedPaperIds = Array.from(this.papers.keys()).sort((a, b) => {
        const paperA = this.papers.get(a)!
        const paperB = this.papers.get(b)!
        const authorsA = parseAuthors(paperA.authors)
        const authorsB = parseAuthors(paperB.authors)
        const lastA = authorsA[0]?.split(/\s+/u).pop() ?? ''
        const lastB = authorsB[0]?.split(/\s+/u).pop() ?? ''
        return lastA.localeCompare(lastB)
      })
    }

    sortedPaperIds.forEach((paperId, index) => {
      const paper = this.papers.get(paperId)!
      const number = this.style === 'ieee' ? index + 1 : 0

      const formattedRef: FormattedReference = {
        id: `ref-${paperId}`,
        paperId,
        number,
        text: this.style === 'ieee'
          ? formatReferenceIEEE(paper, number)
          : formatReferenceAPA(paper),
        bibtex: generateBibtex(paper),
      }

      // Add DOI link
      const doi = extractDOI(paper.doi)
      if (doi) {
        formattedRef.doi = formatDOIUrl(doi)
      }

      // Add arXiv link
      const arxivId = extractArxivId(paper.arxivUrl)
      if (arxivId) {
        formattedRef.arxiv = formatArxivUrl(arxivId)
      }

      references.push(formattedRef)

      // Add marker
      markers.push(this.getCitationMarker(paperId))
    })

    // Generate BibTeX export
    const bibtexExport = references
      .map((r) => r.bibtex)
      .join('\n\n')

    return {
      style: this.style,
      references,
      markers,
      bibtexExport,
    }
  }

  /**
   * Get BibTeX export for all papers
   */
  getBibtexExport(): string {
    const references = this.generateReferenceList()
    return references.bibtexExport
  }

  /**
   * Clear all papers and reset citation order
   */
  clear(): void {
    this.papers.clear()
    this.citationOrder = []
    this.citationNumber.clear()
  }

  /**
   * Set citation style
   */
  setStyle(style: CitationStyle): void {
    this.style = style
    // Reset citation order when changing style
    this.citationOrder = []
    this.citationNumber.clear()
  }

  /**
   * Get current style
   */
  getStyle(): CitationStyle {
    return this.style
  }

  /**
   * Get number of papers
   */
  getPaperCount(): number {
    return this.papers.size
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new CitationManager instance
 */
export function createCitationManager(style: CitationStyle = 'ieee'): CitationManager {
  return new CitationManager(style)
}

/**
 * Quick helper to format a single reference
 */
export function formatSingleReference(
  paper: CitationPaper,
  style: CitationStyle = 'ieee',
  number: number = 1
): string {
  if (style === 'ieee') {
    return formatReferenceIEEE(paper, number)
  }
  return formatReferenceAPA(paper)
}

/**
 * Quick helper to generate BibTeX for a single paper
 */
export function formatSingleBibtex(paper: CitationPaper, citeKey?: string): string {
  return generateBibtex(paper, citeKey)
}

// ============================================================================
// Export Types - types are exported from ./types.ts
// ============================================================================
