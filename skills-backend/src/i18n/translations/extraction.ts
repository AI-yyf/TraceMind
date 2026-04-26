/**
 * Extraction quality warning translations for backend.
 */

import type { TranslationDictionary } from '../index'

const translations: TranslationDictionary = {
  // Quality warnings
  'extraction.warning.missingVisualAssets': {
    zh: '多页论文未提取到任何图表或公式',
    en: 'No figures, tables, or formulas survived extraction for a multi-page paper',
  },
  'extraction.warning.missingTableFormulaCoverage': {
    zh: '已提取图片，但长论文未提取到表格或公式',
    en: 'Figures were extracted, but no tables or formulas were recovered from a long paper',
  },
  'extraction.warning.filteredAssets': {
    zh: '低置信度视觉资产已被过滤，可能需要回退审查',
    en: 'Low-confidence visual assets were filtered and may need fallback review',
  },
  'extraction.warning.vlmFallbackPages': {
    zh: '部分页面已渲染用于视觉回退分析',
    en: 'Pages were rendered for vision fallback because extraction looked incomplete',
  },
  'extraction.warning.latentCoverageGap': {
    zh: '检测到文本中的表格/公式线索，但未提取到结构化内容',
    en: 'Detected table/formula cues in text, but no structured content was extracted',
  },

  // Extraction method names
  'extraction.method.marker': {
    zh: 'Marker',
    en: 'Marker',
  },
  'extraction.method.pymupdf': {
    zh: 'PyMuPDF',
    en: 'PyMuPDF',
  },
  'extraction.method.arxivSource': {
    zh: 'arXiv源码',
    en: 'arXiv Source',
  },
  'extraction.method.vlmEnhanced': {
    zh: 'VLM增强',
    en: 'VLM Enhanced',
  },
  'extraction.method.textRecovery': {
    zh: '文本恢复',
    en: 'Text Recovery',
  },
  'extraction.method.unknown': {
    zh: '未知',
    en: 'Unknown',
  },

  // Stats labels
  'extraction.stats.figures': {
    zh: '图片',
    en: 'Figures',
  },
  'extraction.stats.tables': {
    zh: '表格',
    en: 'Tables',
  },
  'extraction.stats.formulas': {
    zh: '公式',
    en: 'Formulas',
  },
  'extraction.stats.avgConfidence': {
    zh: '平均置信度',
    en: 'Average Confidence',
  },
  'extraction.stats.totalPapers': {
    zh: '论文总数',
    en: 'Total Papers',
  },
  'extraction.stats.extractionMethod': {
    zh: '提取方法',
    en: 'Extraction Method',
  },
  'extraction.stats.qualityWarnings': {
    zh: '质量警告',
    en: 'Quality Warnings',
  },
  'extraction.stats.noStats': {
    zh: '暂无提取统计数据',
    en: 'No extraction stats available',
  },
  'extraction.stats.paperNotFound': {
    zh: '论文提取统计不存在',
    en: 'Paper extraction stats not found',
  },
}

export default translations
