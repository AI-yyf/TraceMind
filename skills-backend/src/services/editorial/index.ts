/**
 * Editorial Service Index
 *
 * Export all editorial agent types and classes for academic content generation.
 */

// Types
export type {
  EditorialAgentConfig,
  EditorialGenerationOptions,
  EditorialGenerationResult,
  EditorialTaskType,
  FigureContext,
  FormulaContext,
  MultiTurnState,
  NodeContext,
  PaperContext,
  PaperSection,
  ReferenceEntry,
  TableContext,
  CrossPaperEvidence,
  // Poster-style types (v2)
  ParagraphRole,
  PaperParagraph,
  PaperSubsectionKind,
  PaperSubsection,
  PosterStylePaperAnalysis,
  LegacyPaperAnalysis,
  PaperAnalysisResult,
  // Citation types
  CitationStyle,
  CitationMarker,
  FormattedReference,
  ReferenceList,
} from './types'

// Academic Markdown Generator types
export type {
  MarkdownArticleOptions,
  MarkdownArticleResult,
  ChapterGenerationResult,
} from './academic-markdown-generator'

// Academic Markdown Generator utilities
export {
  buildEvidenceRef,
  buildFigureMarkdown,
  buildFormulaMarkdown,
  buildTableMarkdown,
  createAcademicMarkdownGenerator,
} from './academic-markdown-generator'

// Academic Markdown Generator class
export { AcademicMarkdownGenerator } from './academic-markdown-generator'

// Node Editorial Agent
export {
  NodeEditorialAgent,
  nodeEditorialAgent,
  createNodeEditorialAgent,
} from './node-editorial-agent'

// Paper Editorial Agent
export {
  PaperEditorialAgent,
  paperEditorialAgent,
  createPaperEditorialAgent,
} from './paper-editorial-agent'

// Deep Analysis Pipeline
export { DeepAnalysisPipeline } from './deep-analysis-pipeline'
export type {
  DeepAnalysisConfig,
  DeepAnalysisResult,
  DeepAnalysisPaper,
  SectionAnalysis,
  ClaimWithEvidence,
  EvidenceAnalysisMap,
} from './deep-analysis-pipeline'

// Token Budget Manager
export { TokenBudgetManager } from './token-budget-manager'
export type { TokenBudgetConfig, SectionBudget } from './token-budget-manager'

// Citation Manager
export {
  CitationManager,
  createCitationManager,
  formatSingleReference,
  formatSingleBibtex,
  parseAuthors,
} from './citation-manager'
export type {
  CitationPaper,
} from './citation-manager'