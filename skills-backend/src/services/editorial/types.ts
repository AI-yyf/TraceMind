/**
 * Editorial Agent Types
 *
 * Context types for the journal editorial agent system that generates
 * academic content in the style of a research chronicle editor.
 *
 * Poster-style types (ParagraphRole, PaperParagraph, PaperSubsectionKind,
 * PaperSubsection, PosterStylePaperAnalysis, LegacyPaperAnalysis,
 * PaperAnalysisResult, InlineEvidence) are canonical in shared/editorial-types.ts.
 * They are re-exported here for backward compatibility with existing imports.
 */

import type { PromptLanguage } from '../generation/prompt-registry'
import type {
  ParagraphRole as ParagraphRoleType,
  PaperParagraph as PaperParagraphType,
  PaperSubsectionKind as PaperSubsectionKindType,
  PaperSubsection as PaperSubsectionType,
  PosterStylePaperAnalysis as PosterStylePaperAnalysisType,
  LegacyPaperAnalysis as LegacyPaperAnalysisType,
  PaperAnalysisResult as PaperAnalysisResultType,
  InlineEvidence as InlineEvidenceType,
} from '../../../shared/editorial-types'
import type { OmniTask } from '../../../shared/model-config'

// Re-export shared poster-style types for backward compatibility
export type {
  ParagraphRoleType as ParagraphRole,
  PaperParagraphType as PaperParagraph,
  PaperSubsectionKindType as PaperSubsectionKind,
  PaperSubsectionType as PaperSubsection,
  PosterStylePaperAnalysisType as PosterStylePaperAnalysis,
  LegacyPaperAnalysisType as LegacyPaperAnalysis,
  PaperAnalysisResultType as PaperAnalysisResult,
  InlineEvidenceType as InlineEvidence,
}

// Local type aliases for use within this file
type PaperAnalysisResult = PaperAnalysisResultType

/**
 * Figure sub-figure context for figure groups (组图)
 */
export interface FigureSubFigureContext {
  index: string
  imagePath: string
  caption: string
  confidence?: number
}

/**
 * Figure group context for generating figure group descriptions (组图)
 */
export interface FigureGroupContext {
  id: string
  paperId: string
  parentNumber: number | string
  caption: string
  page?: number
  subFigures: FigureSubFigureContext[]
  confidence: number
  /** The research question this figure group addresses */
  researchQuestion?: string
  /** Key observations from the figure group */
  keyObservations?: string[]
  /** What judgment this figure group supports */
  supportedJudgment?: string
  /** Domain-specific terminology to use */
  domainTerms?: string[]
}

/**
 * Figure context for generating figure descriptions
 */
export interface FigureContext {
  id: string
  paperId: string
  number: number
  caption: string
  page: number
  imagePath: string
  analysis?: string
  /** The research question this figure addresses */
  researchQuestion?: string
  /** Key observations from the figure */
  keyObservations?: string[]
  /** What judgment this figure supports */
  supportedJudgment?: string
  /** Alternative interpretations */
  alternativeInterpretations?: string[]
  /** Domain-specific terminology to use */
  domainTerms?: string[]
}

/**
 * Table context for generating table descriptions
 */
export interface TableContext {
  id: string
  paperId: string
  number: number
  caption: string
  page: number
  headers: string
  rows: string
  rawText: string
  /** Comparison baselines mentioned in the table */
  comparisonBaselines?: string[]
  /** Key metrics highlighted */
  keyMetrics?: string[]
  /** What judgment this table supports */
  supportedJudgment?: string
  /** Domain-specific terminology to use */
  domainTerms?: string[]
}

/**
 * Formula context for generating formula descriptions
 */
export interface FormulaContext {
  id: string
  paperId: string
  number: string
  latex: string
  rawText: string
  page: number
  /** What constraint or objective this formula defines */
  constraintOrObjective?: string
  /** Variables and their meanings */
  variableDefinitions?: Record<string, string>
  /** What judgment this formula supports */
  supportedJudgment?: string
  /** Domain-specific terminology to use */
  domainTerms?: string[]
}

/**
 * Paper context for generating paper analysis
 */
export interface PaperContext {
  id: string
  topicId: string
  title: string
  titleZh: string
  titleEn?: string
  authors: string
  published: Date
  summary: string
  explanation?: string
  arxivUrl?: string
  pdfUrl?: string
  /** Journal or venue name */
  journal?: string
  /** Volume number */
  volume?: string
  /** Issue number */
  issue?: string
  /** Page range */
  pages?: string
  /** DOI identifier */
  doi?: string
  /** Figures associated with this paper */
  figures: FigureContext[]
  /** Figure groups (组图) associated with this paper */
  figureGroups?: FigureGroupContext[]
  /** Tables associated with this paper */
  tables: TableContext[]
  /** Formulas associated with this paper */
  formulas: FormulaContext[]
  /** Sections of the paper */
  sections: PaperSection[]
  /** The research problem this paper addresses */
  researchProblem?: string
  /** Key contributions claimed */
  keyContributions?: string[]
  /** Method line this paper advances */
  methodLine?: string
  /** Limitations acknowledged */
  limitations?: string[]
  /** Position in the node (order) */
  nodePosition?: number
  /** Domain-specific terminology */
  domainTerms?: string[]
  /** Citation number in IEEE style (assigned by CitationManager) */
  citationNumber?: number
}

/**
 * Paper section structure
 */
export interface PaperSection {
  id: string
  paperId: string
  sourceSectionTitle: string
  editorialTitle: string
  paragraphs: string
  order: number
}

/**
 * Node context for generating node-level content
 */
export interface NodeContext {
  id: string
  topicId: string
  stageIndex: number
  nodeLabel: string
  nodeSubtitle?: string
  nodeSummary: string
  nodeExplanation?: string
  /** Papers in this node */
  papers: PaperContext[]
  /** Primary paper for this node */
  primaryPaper?: PaperContext
  /** The problem entry point for this node */
  problemEntry?: string
  /** Technical handles that recur across papers */
  technicalHandles?: string[]
  /** The overall judgment for this node */
  overallJudgment?: string
  /** What this node advances */
  advances?: string
  /** Problems left for next stage */
  problemsOut?: string[]
  /** Domain-specific terminology */
  domainTerms?: string[]
  /** Cross-paper evidence chains */
  crossPaperEvidence?: CrossPaperEvidence[]
}

/**
 * Cross-paper evidence relationship
 */
export interface CrossPaperEvidence {
  evidenceType: 'figure' | 'table' | 'formula' | 'experiment'
  paperIds: string[]
  description: string
  reusedOrStrengthened: boolean
}

/**
 * Reference entry for bibliography generation
 */
export interface ReferenceEntry {
  id: string
  paperId: string
  title: string
  authors: string
  published: Date
  journal?: string
  volume?: string
  issue?: string
  pages?: string
  doi?: string
  arxivId?: string
  url?: string
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
 * Formatted reference entry with all citation formats
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
 * Complete reference list with all citation data
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
 * Generation options for editorial agent
 */
export interface EditorialGenerationOptions {
  /** Output language (zh for Chinese topics, en for English topics) */
  language: PromptLanguage
  /** Maximum tokens for generation */
  maxTokens?: number
  /** Temperature for generation */
  temperature?: number
  /** Whether to use multi-turn generation for long content */
  multiTurn?: boolean
  /** Number of passes for multi-turn generation */
  passes?: number
  /** Domain-specific terminology to enforce */
  domainTerms?: string[]
  /** Previous generation context for continuity */
  previousContext?: string
  /** Citation style (ieee for numbered, apa for author-year) */
  citationStyle?: CitationStyle
  /** @internal OmniGateway task override for routing */
  _omniTask?: OmniTask
  /** @internal OmniGateway preferred slot override */
  _omniPreferredSlot?: 'language' | 'multimodal'
}

/**
 * Result from editorial generation
 */
export interface EditorialGenerationResult {
  /** Generated content */
  content: string
  /** Whether multi-turn was used */
  multiTurnUsed: boolean
  /** Number of passes completed */
  passesCompleted: number
  /** Provider used */
  provider: string
  /** Model used */
  model: string
  /** Reasoning trace (if available) */
  reasoning?: string
  /** Token usage */
  tokenUsage?: {
    prompt: number
    completion: number
    total: number
  }
  /** Structured paper analysis result (poster-style v2 or legacy v1) */
  paperAnalysis?: PaperAnalysisResult
  /** Whether the output is poster-style (v2) */
  isPosterStyle?: boolean
  /** Tokens used (simplified) */
  usedTokens?: number
}

/**
 * Editorial agent configuration
 *
 * baseUrl, apiKey, and model are optional because OmniGateway resolves
 * the actual provider/model/key from the user's model_configs. They are
 * kept as optional fields for backward compatibility with callers that
 * still pass explicit values (e.g. AcademicMarkdownGenerator).
 */
export interface EditorialAgentConfig {
  /** API base URL — optional, OmniGateway resolves this from user config */
  baseUrl?: string
  /** API key — optional, OmniGateway resolves this from user config */
  apiKey?: string
  /** Model name — optional, OmniGateway resolves this from user config */
  model?: string
  /** Default max tokens */
  defaultMaxTokens: number
  /** Default temperature */
  defaultTemperature: number
  /** Default multi-turn passes */
  defaultPasses: number
  /** Timeout for API calls (ms) */
  timeoutMs: number
}

/**
 * Multi-turn generation state
 */
export interface MultiTurnState {
  /** Current pass number */
  currentPass: number
  /** Total passes planned */
  totalPasses: number
  /** Accumulated content */
  accumulatedContent: string
  /** Context for next pass */
  nextPassContext: string
  /** Whether generation is complete */
  isComplete: boolean
}

export type EditorialTaskType =
  | 'node-introduction'
  | 'node-synthesis'
  | 'paper-analysis'
  | 'figure-description'
  | 'table-description'
  | 'formula-description'
  | 'reference-list'

/** 增强的编辑生成结果 - 包含结构化论文分析 */
export interface EnhancedEditorialGenerationResult extends EditorialGenerationResult {
  /** 结构化论文分析结果（如果适用） */
  paperAnalysis?: PaperAnalysisResult
  /** 是否为海报风格输出 */
  isPosterStyle?: boolean
}