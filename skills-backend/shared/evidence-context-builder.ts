/**
 * Evidence Context Builder - Unified Evidence Pipeline
 *
 * This module provides a unified evidence handling pipeline for all content
 * generation agents (content-genesis-v2, node-editorial-agent, paper-editorial-agent).
 *
 * Key design principles:
 * 1. Single source of truth for evidence formatting
 * 2. Includes figures, tables, formulas, AND figureGroups
 * 3. Consistent evidence ID generation (fig1, table2, eq3, figGroup4)
 * 4. Reusable across all generators
 *
 * ## Architecture Overview
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Evidence Context Builder                      │
 * │                    (shared/evidence-context-builder.ts)          │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  buildEvidenceContext()  →  EvidenceContext                     │
 * │  formatEvidenceBlock()    →  string (for LLM prompts)            │
 * │  formatEvidenceIds()      →  string (evidence ID list)          │
 * └─────────────────────────────────────────────────────────────────┘
 *                              ▲
 *                              │ uses
 *          ┌───────────────────┼───────────────────┐
 *          │                   │                   │
 * ┌────────┴────────┐ ┌────────┴────────┐ ┌────────┴────────┐
 * │ content-genesis │ │ node-editorial  │ │ paper-editorial │
 * │      -v2        │ │     -agent      │ │     -agent      │
 * └─────────────────┘ └─────────────────┘ └─────────────────┘
 * ```
 *
 * ## Evidence Types
 *
 * - **FigureEvidence**: Single figure with caption, analysis, page
 * - **FigureGroupEvidence**: Group of sub-figures (组图) with parent number
 * - **TableEvidence**: Table with headers, raw text
 * - **FormulaEvidence**: Formula with LaTeX, raw text
 *
 * ## Evidence IDs
 *
 * Evidence IDs follow a consistent naming convention:
 * - Figures: `fig1`, `fig2`, ...
 * - Figure Groups: `figGroup1`, `figGroup2`, ...
 * - Tables: `table1`, `table2`, ...
 * - Formulas: `eq1`, `eq2`, ...
 *
 * ## Usage Example
 *
 * ```typescript
 * import { buildEvidenceContextFromPrismaPaper, formatEvidenceBlock } from '../shared/evidence-context-builder'
 *
 * // Build from Prisma query result
 * const evidenceContext = buildEvidenceContextFromPrismaPaper(paper, {
 *   maxFigures: 10,
 *   maxFigureGroups: 5,
 *   maxTables: 5,
 *   maxFormulas: 8,
 * })
 *
 * // Format for LLM prompt
 * const evidenceBlock = formatEvidenceBlock(evidenceContext, { language: 'zh' })
 *
 * // Get evidence IDs for reference
 * const evidenceIds = formatEvidenceIds(evidenceContext)
 * ```
 *
 * ## Integration Points
 *
 * 1. **content-genesis-v2/executor.ts**: Uses `buildEvidenceContextFromPrismaPaper`
 *    to build evidence from Prisma query, then `formatEvidenceBlock` for LLM prompts.
 *
 * 2. **node-editorial-agent.ts**: Uses `buildEvidenceContext` in
 *    `buildPaperAnalysisContext` to format evidence for paper analysis.
 *
 * 3. **paper-editorial-agent.ts**: Uses `buildEvidenceContext` in
 *    `buildEvidenceContextData` and other context builders.
 *
 * ## Database Schema
 *
 * The `figure_groups` table in Prisma schema:
 * ```prisma
 * model figure_groups {
 *   id         String   @id
 *   paperId    String
 *   groupId    String
 *   caption    String
 *   page       Int
 *   subFigures String   // JSON array of sub-figures
 *   createdAt  DateTime @default(now())
 *   papers     papers   @relation(...)
 * }
 * ```
 *
 * @module evidence-context-builder
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Raw figure data from database
 */
export interface RawFigureData {
  id: string
  number: number | string
  caption: string
  page?: number
  imagePath?: string
  analysis?: string | null
}

/**
 * Raw figure group data from database
 */
export interface RawFigureGroupData {
  id: string
  groupId: string
  caption: string
  page?: number
  subFigures: string | Array<{
    index: string
    imagePath: string
    caption: string
    confidence?: number
  }>
}

/**
 * Raw table data from database
 */
export interface RawTableData {
  id: string
  number: number | string
  caption: string
  page?: number
  headers?: string | null
  rows?: string | null
  rawText?: string
}

/**
 * Raw formula data from database
 */
export interface RawFormulaData {
  id: string
  number: number | string
  latex?: string
  rawText?: string | null
  page?: number
}

/**
 * Normalized figure evidence
 */
export interface FigureEvidence {
  id: string
  evidenceId: string // e.g., "fig1"
  type: 'figure'
  number: number
  caption: string
  page?: number
  imagePath?: string
  analysis?: string
}

/**
 * Normalized figure group evidence
 */
export interface FigureGroupEvidence {
  id: string
  evidenceId: string // e.g., "figGroup1"
  type: 'figureGroup'
  parentNumber: string
  caption: string
  page?: number
  subFigures: Array<{
    index: string
    caption: string
    confidence?: number
  }>
}

/**
 * Normalized table evidence
 */
export interface TableEvidence {
  id: string
  evidenceId: string // e.g., "table1"
  type: 'table'
  number: number
  caption: string
  page?: number
  headers?: string
  rawText?: string
}

/**
 * Normalized formula evidence
 */
export interface FormulaEvidence {
  id: string
  evidenceId: string // e.g., "eq1"
  type: 'formula'
  number: string
  latex?: string
  rawText?: string
  page?: number
}

/**
 * Unified evidence context
 */
export interface EvidenceContext {
  figures: FigureEvidence[]
  figureGroups: FigureGroupEvidence[]
  tables: TableEvidence[]
  formulas: FormulaEvidence[]

  /** All evidence IDs for reference */
  allEvidenceIds: string[]

  /** Summary counts */
  counts: {
    figures: number
    figureGroups: number
    tables: number
    formulas: number
    total: number
  }
}

/**
 * Options for building evidence context
 */
export interface BuildEvidenceContextOptions {
  /** Maximum figures to include (default: 10) */
  maxFigures?: number
  /** Maximum figure groups to include (default: 5) */
  maxFigureGroups?: number
  /** Maximum tables to include (default: 5) */
  maxTables?: number
  /** Maximum formulas to include (default: 8) */
  maxFormulas?: number
  /** Whether to include analysis text for figures */
  includeAnalysis?: boolean
}

/**
 * Options for formatting evidence block
 */
export interface FormatEvidenceBlockOptions {
  /** Language for labels (defaults to 'zh') */
  language?: string
  /** Maximum caption length */
  maxCaptionLength?: number
  /** Whether to include page numbers */
  includePageNumbers?: boolean
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clip text to maximum length with ellipsis
 */
function clipText(value: string | null | undefined, maxLength: number): string {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

/**
 * Parse JSON string array safely
 */
function parseJsonSubFigures(value: unknown): Array<{ index: string; imagePath: string; caption: string; confidence?: number }> {
  if (Array.isArray(value)) return value as Array<{ index: string; imagePath: string; caption: string; confidence?: number }>
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Array<{ index: string; imagePath: string; caption: string; confidence?: number }> : []
  } catch {
    return []
  }
}

// ============================================================================
// Evidence Context Builder
// ============================================================================

/**
 * Build unified evidence context from raw paper data
 *
 * This is the single source of truth for evidence handling across all generators.
 */
export function buildEvidenceContext(
  figures: RawFigureData[] = [],
  figureGroups: RawFigureGroupData[] = [],
  tables: RawTableData[] = [],
  formulas: RawFormulaData[] = [],
  options: BuildEvidenceContextOptions = {}
): EvidenceContext {
  const {
    maxFigures = 100,
    maxFigureGroups = 50,
    maxTables = 50,
    maxFormulas = 80,
    includeAnalysis = true,
  } = options

  // Normalize figures
  const normalizedFigures: FigureEvidence[] = figures
    .slice(0, maxFigures)
    .map((fig, index) => ({
      id: fig.id,
      evidenceId: `fig${typeof fig.number === 'number' ? fig.number : index + 1}`,
      type: 'figure' as const,
      number: typeof fig.number === 'number' ? fig.number : Number(fig.number) || index + 1,
      caption: fig.caption || '',
      page: fig.page,
      imagePath: fig.imagePath,
      analysis: includeAnalysis ? fig.analysis ?? undefined : undefined,
    }))

  // Normalize figure groups
  const normalizedFigureGroups: FigureGroupEvidence[] = figureGroups
    .slice(0, maxFigureGroups)
    .map((group) => {
      const subFigures = parseJsonSubFigures(group.subFigures)
      const parentNumber = group.groupId.replace(/^fg-/, '').split('-').pop() ?? group.groupId

      return {
        id: group.id,
        evidenceId: `figGroup${parentNumber}`,
        type: 'figureGroup' as const,
        parentNumber,
        caption: group.caption || '',
        page: group.page,
        subFigures: subFigures.map((sf) => ({
          index: sf.index,
          caption: sf.caption,
          confidence: sf.confidence,
        })),
      }
    })

  // Normalize tables
  const normalizedTables: TableEvidence[] = tables
    .slice(0, maxTables)
    .map((table, index) => ({
      id: table.id,
      evidenceId: `table${typeof table.number === 'number' ? table.number : index + 1}`,
      type: 'table' as const,
      number: typeof table.number === 'number' ? table.number : Number(table.number) || index + 1,
      caption: table.caption || '',
      page: table.page,
      headers: table.headers ?? undefined,
      rawText: table.rawText,
    }))

  // Normalize formulas
  const normalizedFormulas: FormulaEvidence[] = formulas
    .slice(0, maxFormulas)
    .map((formula) => ({
      id: formula.id,
      evidenceId: `eq${formula.number}`,
      type: 'formula' as const,
      number: String(formula.number),
      latex: formula.latex,
      rawText: formula.rawText ?? undefined,
      page: formula.page,
    }))

  // Build all evidence IDs
  const allEvidenceIds: string[] = [
    ...normalizedFigures.map((f) => f.evidenceId),
    ...normalizedFigureGroups.map((g) => g.evidenceId),
    ...normalizedTables.map((t) => t.evidenceId),
    ...normalizedFormulas.map((f) => f.evidenceId),
  ]

  const counts = {
    figures: normalizedFigures.length,
    figureGroups: normalizedFigureGroups.length,
    tables: normalizedTables.length,
    formulas: normalizedFormulas.length,
    total: allEvidenceIds.length,
  }

  return {
    figures: normalizedFigures,
    figureGroups: normalizedFigureGroups,
    tables: normalizedTables,
    formulas: normalizedFormulas,
    allEvidenceIds,
    counts,
  }
}

// ============================================================================
// Evidence Block Formatter
// ============================================================================

/**
 * Format evidence context as a text block for LLM prompts
 *
 * This produces a consistent evidence block format that all generators can use.
 */
export function formatEvidenceBlock(
  context: EvidenceContext,
  options: FormatEvidenceBlockOptions = {}
): string {
  const {
    language = 'zh',
    maxCaptionLength = 200,
    includePageNumbers = false,
  } = options

  const labels = {
    zh: {
      summary: (c: typeof context.counts) =>
        c.total === 0
          ? '当前还没有保留下来的图、表或公式证据。'
          : `当前保留了 ${c.figures} 张图、${c.figureGroups} 个组图、${c.tables} 张表和 ${c.formulas} 个公式。`,
      figures: '【图片详情】',
      figureGroups: '【组图详情】',
      tables: '【表格详情】',
      formulas: '【公式详情】',
      figure: '图',
      figureGroup: '组图',
      table: '表',
      formula: '公式',
      subFigures: '子图',
      columns: '列',
      page: '页',
    },
    en: {
      summary: (c: typeof context.counts) =>
        c.total === 0
          ? 'No figures, tables, or formulas have been retained.'
          : `Retained ${c.figures} figures, ${c.figureGroups} figure groups, ${c.tables} tables, and ${c.formulas} formulas.`,
      figures: '[Figure Details]',
      figureGroups: '[Figure Group Details]',
      tables: '[Table Details]',
      formulas: '[Formula Details]',
      figure: 'Figure',
      figureGroup: 'Figure Group',
      table: 'Table',
      formula: 'Formula',
      subFigures: 'Sub-figures',
      columns: 'Columns',
      page: 'p.',
    },
  }

  // Normalize language: use 'zh' for Chinese, default to 'en' for all other languages
  const normalizedLanguage: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'
  const l = labels[normalizedLanguage]
  const parts: string[] = []

  // Summary
  parts.push(l.summary(context.counts))

  // Figures
  if (context.figures.length > 0) {
    parts.push('')
    parts.push(l.figures)
    context.figures.forEach((fig) => {
      let line = `${l.figure} ${fig.number}: ${clipText(fig.caption, maxCaptionLength)}`
      if (includePageNumbers && fig.page !== undefined) {
        line += ` (${l.page}${fig.page})`
      }
      parts.push(line)
      if (fig.analysis) {
        parts.push(`  分析: ${clipText(fig.analysis, 150)}`)
      }
    })
  }

  // Figure Groups
  if (context.figureGroups.length > 0) {
    parts.push('')
    parts.push(l.figureGroups)
    context.figureGroups.forEach((group) => {
      parts.push(`${l.figureGroup} ${group.parentNumber}: ${clipText(group.caption, maxCaptionLength)}`)
      if (group.subFigures.length > 0) {
        parts.push(`  ${l.subFigures}: ${group.subFigures.map((sf) => sf.index).join(', ')}`)
      }
    })
  }

  // Tables
  if (context.tables.length > 0) {
    parts.push('')
    parts.push(l.tables)
    context.tables.forEach((table) => {
      let line = `${l.table} ${table.number}: ${clipText(table.caption, maxCaptionLength)}`
      if (table.headers) {
        const headers = clipText(table.headers, 80)
        line += ` [${l.columns}: ${headers}]`
      }
      parts.push(line)
    })
  }

  // Formulas
  if (context.formulas.length > 0) {
    parts.push('')
    parts.push(l.formulas)
    context.formulas.forEach((formula) => {
      const text = formula.latex || formula.rawText || ''
      parts.push(`${l.formula} ${formula.number}: ${clipText(text, 100)}`)
    })
  }

  return parts.join('\n')
}

/**
 * Format evidence IDs for LLM reference
 */
export function formatEvidenceIds(context: EvidenceContext): string {
  return context.allEvidenceIds.join(', ')
}

/**
 * Build evidence context from Prisma paper include result
 *
 * Convenience function for use with Prisma queries that include
 * figures, figure_groups, tables, and formulas.
 */
export function buildEvidenceContextFromPrismaPaper(
  paper: {
    figures?: RawFigureData[]
    figure_groups?: RawFigureGroupData[]
    tables?: RawTableData[]
    formulas?: RawFormulaData[]
  },
  options?: BuildEvidenceContextOptions
): EvidenceContext {
  return buildEvidenceContext(
    paper.figures ?? [],
    paper.figure_groups ?? [],
    paper.tables ?? [],
    paper.formulas ?? [],
    options
  )
}

// ============================================================================
// Exports
// ============================================================================

export default {
  buildEvidenceContext,
  buildEvidenceContextFromPrismaPaper,
  formatEvidenceBlock,
  formatEvidenceIds,
}
