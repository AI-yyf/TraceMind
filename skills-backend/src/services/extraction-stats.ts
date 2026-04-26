/**
 * Extraction Stats Service
 * Tracks and reports PDF extraction quality metrics.
 */

import { prisma } from '../lib/prisma'
import { logger } from '../utils/logger'
import type { PDFExtractionResult } from './pdf-extractor'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityWarning {
  code: 'missing_visual_assets' | 'missing_table_formula_coverage' | 'filtered_assets' | 'vlm_fallback_pages' | 'latent_coverage_gap'
  message: string
  messageKey: string
  severity: 'info' | 'warning' | 'critical'
  details?: Record<string, unknown>
}

export interface AssetTypeStats {
  total: number
  avgConfidence: number | null
  methods: Record<string, number>
}

export interface ExtractionStats {
  paperId: string
  paperTitle?: string
  figures: AssetTypeStats
  tables: AssetTypeStats
  formulas: AssetTypeStats
  qualityWarnings: QualityWarning[]
  extractionMethod: string
  pageCount: number
  timestamp: string
}

export interface ExtractionSummary {
  totalPapers: number
  totalFigures: number
  totalTables: number
  totalFormulas: number
  avgFigureConfidence: number | null
  avgTableConfidence: number | null
  avgFormulaConfidence: number | null
  extractionMethods: Record<string, number>
  warningCounts: Record<string, number>
  papersWithWarnings: number
  lastUpdated: string
}

export interface TopicExtractionSummary extends ExtractionSummary {
  topicId: string
  topicName: string
}

// ---------------------------------------------------------------------------
// i18n Keys for Quality Warnings
// ---------------------------------------------------------------------------

const QUALITY_WARNING_I18N_KEYS: Record<QualityWarning['code'], string> = {
  missing_visual_assets: 'extraction.warning.missingVisualAssets',
  missing_table_formula_coverage: 'extraction.warning.missingTableFormulaCoverage',
  filtered_assets: 'extraction.warning.filteredAssets',
  vlm_fallback_pages: 'extraction.warning.vlmFallbackPages',
  latent_coverage_gap: 'extraction.warning.latentCoverageGap',
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Compute extraction stats from PDF extraction result.
 */
export function computeExtractionStats(
  result: PDFExtractionResult,
  paperTitle?: string,
): ExtractionStats {
  // Compute figure stats
  const figureStats = computeAssetTypeStats(result.figures)

  // Compute table stats
  const tableStats = computeAssetTypeStats(result.tables)

  // Compute formula stats
  const formulaStats = computeAssetTypeStats(result.formulas)

  // Map quality warnings to i18n-aware format
  const qualityWarnings: QualityWarning[] = (result.qualityWarnings ?? []).map(warning => ({
    code: warning.code,
    message: warning.message,
    messageKey: QUALITY_WARNING_I18N_KEYS[warning.code],
    severity: warning.severity,
  }))

  return {
    paperId: result.paperId,
    paperTitle,
    figures: figureStats,
    tables: tableStats,
    formulas: formulaStats,
    qualityWarnings,
    extractionMethod: result.extractionMethod ?? 'unknown',
    pageCount: result.pageCount,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Compute stats for a single asset type.
 */
function computeAssetTypeStats(
  assets: Array<{ confidence?: number | null; extractionMethod?: string | null }>,
): AssetTypeStats {
  const validAssets = assets.filter(a => a.confidence !== null && a.confidence !== undefined)

  const avgConfidence = validAssets.length > 0
    ? validAssets.reduce((sum, a) => sum + (a.confidence ?? 0), 0) / validAssets.length
    : null

  const methods: Record<string, number> = {}
  for (const asset of assets) {
    const method = asset.extractionMethod ?? 'unknown'
    methods[method] = (methods[method] ?? 0) + 1
  }

  return {
    total: assets.length,
    avgConfidence: avgConfidence !== null ? Math.round(avgConfidence * 1000) / 1000 : null,
    methods,
  }
}

/**
 * Store extraction stats in database.
 */
export async function storeExtractionStats(
  stats: ExtractionStats,
  topicId?: string,
): Promise<void> {
  try {
    await prisma.extraction_stats.upsert({
      where: { paperId: stats.paperId },
      create: {
        id: `es-${stats.paperId}`,
        paperId: stats.paperId,
        topicId,
        extractionMethod: stats.extractionMethod,
        figureCount: stats.figures.total,
        figureAvgConf: stats.figures.avgConfidence,
        figureMethods: JSON.stringify(stats.figures.methods),
        tableCount: stats.tables.total,
        tableAvgConf: stats.tables.avgConfidence,
        tableMethods: JSON.stringify(stats.tables.methods),
        formulaCount: stats.formulas.total,
        formulaAvgConf: stats.formulas.avgConfidence,
        formulaMethods: JSON.stringify(stats.formulas.methods),
        qualityWarnings: JSON.stringify(stats.qualityWarnings),
        pageCount: stats.pageCount,
        extractedAt: new Date(),
      },
      update: {
        topicId,
        extractionMethod: stats.extractionMethod,
        figureCount: stats.figures.total,
        figureAvgConf: stats.figures.avgConfidence,
        figureMethods: JSON.stringify(stats.figures.methods),
        tableCount: stats.tables.total,
        tableAvgConf: stats.tables.avgConfidence,
        tableMethods: JSON.stringify(stats.tables.methods),
        formulaCount: stats.formulas.total,
        formulaAvgConf: stats.formulas.avgConfidence,
        formulaMethods: JSON.stringify(stats.formulas.methods),
        qualityWarnings: JSON.stringify(stats.qualityWarnings),
        pageCount: stats.pageCount,
        extractedAt: new Date(),
      },
    })

    logger.debug('Stored extraction stats', { paperId: stats.paperId })
  } catch (error) {
    logger.error('Failed to store extraction stats', { paperId: stats.paperId, error })
    throw error
  }
}

/**
 * Get extraction stats for a specific paper.
 */
export async function getExtractionStats(paperId: string): Promise<ExtractionStats | null> {
  const record = await prisma.extraction_stats.findUnique({
    where: { paperId },
    include: {
      papers: {
        select: { title: true, titleZh: true },
      },
    },
  })

  if (!record) return null

  return {
    paperId: record.paperId,
    paperTitle: record.papers?.titleZh || record.papers?.title,
    figures: {
      total: record.figureCount,
      avgConfidence: record.figureAvgConf,
      methods: JSON.parse(record.figureMethods) as Record<string, number>,
    },
    tables: {
      total: record.tableCount,
      avgConfidence: record.tableAvgConf,
      methods: JSON.parse(record.tableMethods) as Record<string, number>,
    },
    formulas: {
      total: record.formulaCount,
      avgConfidence: record.formulaAvgConf,
      methods: JSON.parse(record.formulaMethods) as Record<string, number>,
    },
    qualityWarnings: JSON.parse(record.qualityWarnings) as QualityWarning[],
    extractionMethod: record.extractionMethod,
    pageCount: record.pageCount,
    timestamp: record.extractedAt.toISOString(),
  }
}

/**
 * Get extraction stats for multiple papers by topic.
 */
export async function getExtractionStatsByTopic(topicId: string): Promise<ExtractionStats[]> {
  const records = await prisma.extraction_stats.findMany({
    where: { topicId },
    include: {
      papers: {
        select: { title: true, titleZh: true },
      },
    },
    orderBy: { extractedAt: 'desc' },
  })

  return records.map(record => ({
    paperId: record.paperId,
    paperTitle: record.papers?.titleZh || record.papers?.title,
    figures: {
      total: record.figureCount,
      avgConfidence: record.figureAvgConf,
      methods: JSON.parse(record.figureMethods) as Record<string, number>,
    },
    tables: {
      total: record.tableCount,
      avgConfidence: record.tableAvgConf,
      methods: JSON.parse(record.tableMethods) as Record<string, number>,
    },
    formulas: {
      total: record.formulaCount,
      avgConfidence: record.formulaAvgConf,
      methods: JSON.parse(record.formulaMethods) as Record<string, number>,
    },
    qualityWarnings: JSON.parse(record.qualityWarnings) as QualityWarning[],
    extractionMethod: record.extractionMethod,
    pageCount: record.pageCount,
    timestamp: record.extractedAt.toISOString(),
  }))
}

/**
 * Get aggregated extraction summary across all papers or by topic.
 */
export async function getExtractionSummary(topicId?: string): Promise<ExtractionSummary | TopicExtractionSummary> {
  const whereClause = topicId ? { topicId } : {}

  const records = await prisma.extraction_stats.findMany({
    where: whereClause,
    select: {
      figureCount: true,
      figureAvgConf: true,
      tableCount: true,
      tableAvgConf: true,
      formulaCount: true,
      formulaAvgConf: true,
      extractionMethod: true,
      qualityWarnings: true,
      extractedAt: true,
    },
  })

  if (records.length === 0) {
    const emptySummary: ExtractionSummary = {
      totalPapers: 0,
      totalFigures: 0,
      totalTables: 0,
      totalFormulas: 0,
      avgFigureConfidence: null,
      avgTableConfidence: null,
      avgFormulaConfidence: null,
      extractionMethods: {},
      warningCounts: {},
      papersWithWarnings: 0,
      lastUpdated: new Date().toISOString(),
    }

    if (topicId) {
      const topic = await prisma.topics.findUnique({
        where: { id: topicId },
        select: { nameZh: true, nameEn: true },
      })
      return {
        ...emptySummary,
        topicId,
        topicName: topic?.nameZh || topic?.nameEn || topicId,
      }
    }

    return emptySummary
  }

  // Aggregate totals
  const totalFigures = records.reduce((sum, r) => sum + r.figureCount, 0)
  const totalTables = records.reduce((sum, r) => sum + r.tableCount, 0)
  const totalFormulas = records.reduce((sum, r) => sum + r.formulaCount, 0)

  // Compute average confidences (only from records with valid values)
  const figureConfs = records.filter(r => r.figureAvgConf !== null).map(r => r.figureAvgConf!)
  const tableConfs = records.filter(r => r.tableAvgConf !== null).map(r => r.tableAvgConf!)
  const formulaConfs = records.filter(r => r.formulaAvgConf !== null).map(r => r.formulaAvgConf!)

  const avgFigureConfidence = figureConfs.length > 0
    ? Math.round((figureConfs.reduce((a, b) => a + b, 0) / figureConfs.length) * 1000) / 1000
    : null
  const avgTableConfidence = tableConfs.length > 0
    ? Math.round((tableConfs.reduce((a, b) => a + b, 0) / tableConfs.length) * 1000) / 1000
    : null
  const avgFormulaConfidence = formulaConfs.length > 0
    ? Math.round((formulaConfs.reduce((a, b) => a + b, 0) / formulaConfs.length) * 1000) / 1000
    : null

  // Aggregate extraction methods
  const extractionMethods: Record<string, number> = {}
  for (const record of records) {
    extractionMethods[record.extractionMethod] = (extractionMethods[record.extractionMethod] ?? 0) + 1
  }

  // Aggregate warning counts
  const warningCounts: Record<string, number> = {}
  let papersWithWarnings = 0

  for (const record of records) {
    const warnings = JSON.parse(record.qualityWarnings) as QualityWarning[]
    if (warnings.length > 0) {
      papersWithWarnings++
      for (const warning of warnings) {
        warningCounts[warning.code] = (warningCounts[warning.code] ?? 0) + 1
      }
    }
  }

  // Find most recent extraction
  const lastUpdated = records.reduce((latest, r) => {
    const extracted = new Date(r.extractedAt)
    return extracted > latest ? extracted : latest
  }, new Date(0))

  const summary: ExtractionSummary = {
    totalPapers: records.length,
    totalFigures,
    totalTables,
    totalFormulas,
    avgFigureConfidence,
    avgTableConfidence,
    avgFormulaConfidence,
    extractionMethods,
    warningCounts,
    papersWithWarnings,
    lastUpdated: lastUpdated.toISOString(),
  }

  if (topicId) {
    const topic = await prisma.topics.findUnique({
      where: { id: topicId },
      select: { nameZh: true, nameEn: true },
    })
    return {
      ...summary,
      topicId,
      topicName: topic?.nameZh || topic?.nameEn || topicId,
    }
  }

  return summary
}

/**
 * Get extraction summary for all topics.
 */
export async function getAllTopicsExtractionSummary(): Promise<TopicExtractionSummary[]> {
  // Get unique topic IDs from extraction stats
  const topicIds = await prisma.extraction_stats.findMany({
    where: { topicId: { not: null } },
    select: { topicId: true },
    distinct: ['topicId'],
  })

  const summaries: TopicExtractionSummary[] = []

  for (const { topicId } of topicIds) {
    if (!topicId) continue
    const summary = await getExtractionSummary(topicId) as TopicExtractionSummary
    summaries.push(summary)
  }

  return summaries.sort((a, b) => b.totalPapers - a.totalPapers)
}

/**
 * Delete extraction stats for a paper.
 */
export async function deleteExtractionStats(paperId: string): Promise<void> {
  await prisma.extraction_stats.delete({
    where: { paperId },
  }).catch(() => {
    // Ignore if not found
  })
}
