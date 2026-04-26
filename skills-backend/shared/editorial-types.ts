/**
 * Editorial Types - Shared between frontend and backend
 *
 * These types define the poster-style paper analysis structure used by:
 * - Backend: node-editorial-agent.ts, editorial/types.ts
 * - Frontend: types/article.ts
 *
 * This file serves as the canonical source for these types.
 * Both frontend and backend should import from here to ensure type convergence.
 */

// ============================================================================
// 段落角色类型 - 自然流转中的语义角色
// ============================================================================

/**
 * 段落角色 - 自然流转中的语义角色
 *
 * - thesis: 核心论点（海报标题级，20-30字）
 * - argument: 论证段落（50-80字，围绕证据展开）
 * - evidence: 证据锚点（图/表/公式的论点说明）
 * - insight: 洞察收束（论文边界与接手点，20-30字）
 */
export type ParagraphRole =
  | 'thesis'
  | 'argument'
  | 'evidence'
  | 'insight'

// ============================================================================
// 内联证据类型
// ============================================================================

/**
 * 内联证据 - LLM生成的图表公式解读
 */
export interface InlineEvidence {
  anchorId: string
  type: 'figure' | 'figureGroup' | 'table' | 'formula'
  /** LLM生成的解读内容 */
  description: string
  /** 为什么这个证据重要 */
  whyItMatters: string
}

// ============================================================================
// 论文段落类型
// ============================================================================

/**
 * 论文自然段落 - 替代分点式subsection
 *
 * 海报风格的核心结构单元，每个段落有明确的语义角色。
 */
export interface PaperParagraph {
  /** 段落角色 */
  role: ParagraphRole
  /** 段落标题（可选，用于视觉分隔） */
  title?: string
  titleEn?: string
  /** 段落正文 */
  content: string
  contentEn?: string
  /** 段落字数 */
  wordCount: number
  /** 引用证据ID列表 */
  evidenceIds: string[]
  /** 内联证据 - 嵌入的图表公式解读 */
  inlineEvidences?: InlineEvidence[]
  /** 段落排序索引 */
  sortIndex: number
}

// ============================================================================
// 旧版分点式类型（向后兼容）
// ============================================================================

/**
 * @deprecated 使用 PaperParagraph 替代。保留向后兼容。
 * 论文子节类型 - 旧版分点式结构
 */
export type PaperSubsectionKind =
  | 'background'
  | 'problem'
  | 'method'
  | 'experiment'
  | 'results'
  | 'contribution'
  | 'limitation'
  | 'significance'

/**
 * @deprecated 使用 PaperParagraph 替代。保留向后兼容。
 * 论文子节内容 - 旧版分点式结构
 */
export interface PaperSubsection {
  kind: PaperSubsectionKind
  title: string
  titleEn?: string
  content: string
  contentEn?: string
  wordCount: number
  keyPoints: string[]
  evidenceIds: string[]
  inlineEvidences?: InlineEvidence[]
}

// ============================================================================
// 论文分析结果类型
// ============================================================================

/**
 * 海报风格论文分析结果 - v2格式
 */
export interface PosterStylePaperAnalysis {
  /** 核心论点（20-30字，海报标题级） */
  coreThesis: string
  coreThesisEn?: string
  /** 自然段落流 */
  paragraphs: PaperParagraph[]
  /** 收束洞察（20-30字，论文边界与接手点） */
  closingInsight: string
  closingInsightEn?: string
  /** 内容版本标识 */
  contentVersion: 'v2'
}

/**
 * 旧版分点式论文分析结果 - v1格式
 * @deprecated 使用 PosterStylePaperAnalysis 替代
 */
export interface LegacyPaperAnalysis {
  /** @deprecated 使用 paragraphs 替代 */
  introduction?: string
  /** @deprecated 使用 paragraphs 替代 */
  subsections: PaperSubsection[]
  /** @deprecated 使用 closingInsight 替代 */
  conclusion?: string
  /** 内容版本标识 */
  contentVersion: 'v1'
}

/**
 * 论文分析结果联合类型 - 支持v1/v2两种格式
 */
export type PaperAnalysisResult = PosterStylePaperAnalysis | LegacyPaperAnalysis

// ============================================================================
// 论文在节点中的角色
// ============================================================================

/**
 * 论文在节点中的角色
 */
export type PaperRoleInNode =
  | 'origin'      // 源头论文 - 开创性工作
  | 'milestone'   // 里程碑 - 重大突破
  | 'branch'      // 分支点 - 新方向
  | 'confluence'  // 汇流点 - 整合多线
  | 'extension'   // 扩展 - 改进现有方法
  | 'baseline'    // 基线 - 对比基准

// ============================================================================
// 辅助函数类型签名
// ============================================================================

/**
 * 判断是否为海报风格分析结果
 */
export function isPosterStyleAnalysis(
  result: PaperAnalysisResult
): result is PosterStylePaperAnalysis {
  return result.contentVersion === 'v2'
}

/**
 * 判断是否为旧版分点式分析结果
 */
export function isLegacyAnalysis(
  result: PaperAnalysisResult
): result is LegacyPaperAnalysis {
  return result.contentVersion === 'v1'
}