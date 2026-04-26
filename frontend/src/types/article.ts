/**
 * 节点文章化重构 - 类型定义
 * 
 * 学术海报风格：图为主60%+，文字精炼如摘要
 * 每篇论文按自然段落流转呈现，不机械分点
 */

// ============================================================================
// 论文段落类型 - 自然流转结构
// ============================================================================

/** 段落角色 - 自然流转中的语义角色 */
export type ParagraphRole =
  | 'thesis'        // 核心论点（海报标题级，20-30字）
  | 'argument'      // 论证段落（50-80字，围绕证据展开）
  | 'evidence'      // 证据锚点（图/表/公式的论点说明）
  | 'insight'       // 洞察收束（论文边界与接手点，20-30字）

/** 内联证据 - LLM生成的图表公式解读 */
export interface InlineEvidence {
  anchorId: string
  type: 'figure' | 'table' | 'formula'
  /** LLM生成的解读内容 */
  description: string
  /** 为什么这个证据重要 */
  whyItMatters: string
}

/** 论文自然段落 - 替代分点式subsection */
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

/**
 * @deprecated 使用 PaperParagraph 替代。保留向后兼容。
 * 论文子节内容 - 旧版分点式结构 */
export type PaperSubsectionKind = 
  | 'background'      // 研究背景
  | 'problem'         // 问题定义
  | 'method'          // 方法详解
  | 'experiment'      // 实验设计
  | 'results'         // 结果分析
  | 'contribution'    // 核心贡献
  | 'limitation'      // 局限与不足
  | 'significance'    // 学术意义

/** @deprecated 使用 PaperParagraph 替代 */
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

/** 完整论文文章块 - 学术海报风格 */
export interface PaperArticleBlock {
  type: 'paper-article'
  id: string
  paperId: string
  /** 论文在节点中的角色（源头/里程碑/分支/汇流） */
  role: PaperRoleInNode
  /** 论文标题 */
  title: string
  titleEn?: string
  /** 作者列表 */
  authors: string[]
  /** 发表日期 */
  publishedAt: string
  /** 引用数 */
  citationCount: number | null
  /** 论文来源URL */
  originalUrl?: string
  pdfUrl?: string
  /** 封面图 */
  coverImage?: string | null

  // === 海报风格核心内容 (v2) ===
  /** 核心论点（20-30字，海报标题级） */
  coreThesis?: string
  coreThesisEn?: string
  /** 自然段落流 - 替代分点式subsections */
  paragraphs?: PaperParagraph[]
  /** 收束洞察（20-30字，论文边界与接手点） */
  closingInsight?: string
  closingInsightEn?: string

  // === 向后兼容（旧版字段，新逻辑不再填充） ===
  /** @deprecated 使用 paragraphs 替代 */
  introduction?: string
  /** @deprecated 使用 paragraphs 替代 */
  subsections?: PaperSubsection[]
  /** @deprecated 使用 closingInsight 替代 */
  conclusion?: string

  // === 元信息 ===
  /** 总字数 */
  totalWordCount: number
  /** 阅读时间（分钟） */
  readingTimeMinutes: number
  /** 锚点ID，用于URL跳转 */
  anchorId: string
  /** 内容版本 - v2=海报风格自然段落, v1=旧版分点式 */
  contentVersion?: 'v1' | 'v2'
}

/** 论文在节点中的角色 */
export type PaperRoleInNode = 
  | 'origin'      // 源头论文 - 开创性工作
  | 'milestone'   // 里程碑 - 重大突破
  | 'branch'      // 分支点 - 新方向
  | 'confluence'  // 汇流点 - 整合多线
  | 'extension'   // 扩展 - 改进现有方法
  | 'baseline'    // 基线 - 对比基准

// ============================================================================
// 节点引言与总结
// ============================================================================

/** 节点引言块 */
export interface NodeIntroductionBlock {
  type: 'introduction'
  id: string
  /** 引言标题 */
  title: string
  /** 引言正文（200-300字） */
  content: string
  /** 该节点在整个主题中的位置说明 */
  contextStatement: string
  /** 核心问题 */
  coreQuestion: string
  /** 该节点涉及的关键方法/技术 */
  keyMethods: string[]
}

/** 节点综合块 - 跨论文的对比与综合 */
export interface NodeSynthesisBlock {
  type: 'synthesis'
  id: string
  /** 综合标题 */
  title: string
  /** 综合内容（300-500字） */
  content: string
  /** 对比表格数据 */
  comparisonTable?: PaperComparisonRow[]
  /** 方法演进时间线 */
  methodEvolution?: MethodEvolutionStep[]
  /** 关键洞察 */
  insights: string[]
}

/** 论文对比行 */
export interface PaperComparisonRow {
  dimension: string
  papers: Record<string, string>
}

/** 方法演进步骤 */
export interface MethodEvolutionStep {
  paperId: string
  paperTitle: string
  contribution: string
  improvementOverPrevious?: string
  fromPaperId?: string
  fromPaperTitle?: string
  toPaperId?: string
  toPaperTitle?: string
  transitionType?: 'method-evolution' | 'problem-shift' | 'scale-up' | 'scope-broaden' | 'complementary'
  anchorId?: string
  evidenceAnchorIds?: string[]
}

/** 节点结尾块 */
export interface NodeClosingBlock {
  type: 'closing'
  id: string
  /** 总结标题 */
  title: string
  /** 总结正文（150-200字） */
  content: string
  /** 关键结论 */
  keyTakeaways: string[]
  /** 与下一节点的衔接 */
  transitionToNext?: string
  /** 开放问题 */
  openQuestions?: string[]
}

/** 节点批判性分析块 */
export interface NodeCritiqueBlock {
  type: 'critique'
  id: string
  /** 批判性分析标题 */
  title: string
  /** 批判性分析总结（100-150字） */
  summary: string
  /** 批判性要点列表 */
  bullets: string[]
}

// ============================================================================
// 文章流块联合类型
// ============================================================================

/** 节点文章流块 - 新的文章化结构 */
export type NodeArticleFlowBlock =
  | NodeIntroductionBlock
  | PaperArticleBlock
  | NodeSynthesisBlock
  | NodeClosingBlock
  | PaperTransitionBlock
  | NodeCritiqueBlock

// ============================================================================
// 论文过渡段落 - 论文之间的自然过渡
// ============================================================================

/** 论文过渡段落 - 论文之间的自然过渡句 */
export interface PaperTransitionBlock {
  type: 'paper-transition'
  id: string
  /** 从哪篇论文过渡 */
  fromPaperId: string
  fromPaperTitle: string
  /** 过渡到哪篇论文 */
  toPaperId: string
  toPaperTitle: string
  /** 过渡内容（50-100字） */
  content: string
  /** 过渡类型 */
  transitionType: 'method-evolution' | 'problem-shift' | 'scale-up' | 'scope-broaden' | 'complementary'
  /** 锚点ID */
  anchorId: string
}

// ============================================================================
// 主题仪表盘类型
// ============================================================================

/** 研究主线条目 */
export interface ResearchThreadEntry {
  stageIndex: number
  nodeId: string
  nodeTitle: string
  thesis: string
  paperCount: number
  keyPaperTitle: string
  isMilestone: boolean
}

/** 方法演进条目 */
export interface MethodEvolutionEntry {
  year: number
  methodName: string
  paperId: string
  paperTitle: string
  contribution: string
  impact: 'high' | 'medium' | 'low'
}

/** 活跃作者 */
export interface ActiveAuthor {
  name: string
  affiliation?: string
  paperCount: number
  citationCount: number
  keyPapers: string[]
  researchFocus: string[]
}

/** 主题仪表盘数据 */
export interface TopicDashboard {
  topicId: string
  topicTitle: string
  
  // === 研究主线 ===
  researchThreads: ResearchThreadEntry[]
  
  // === 方法演进 ===
  methodEvolution: MethodEvolutionEntry[]
  
  // === 活跃作者 ===
  activeAuthors: ActiveAuthor[]
  
  // === 统计摘要 ===
  stats: {
    totalPapers: number
    mappedPapers: number
    pendingPapers: number
    totalNodes: number
    totalStages: number
    mappedStages: number
    timeSpanYears: number
    avgPapersPerNode: number
    citationCoverage: number  // 有多少论文有引用数据
  }
  
  // === 关键洞察 ===
  keyInsights: string[]
  
  // === 研究趋势 ===
  trends: {
    emergingTopics: string[]
    decliningTopics: string[]
    methodShifts: string[]
  }
  pendingPapers: Array<{
    paperId: string
    title: string
    publishedAt: string
    stageIndex: number | null
    stageLabel: string
    summary: string
    route: string
  }>
}

// ============================================================================
// 增强的节点视图模型
// ============================================================================

/** 增强版节点文章视图模型 */
export interface EnhancedNodeArticleViewModel {
  schemaVersion: '2.0'
  nodeId: string
  title: string
  titleEn: string
  headline: string
  subtitle: string
  summary: string
  explanation: string
  stageIndex: number
  stageLabel?: string
  updatedAt: string
  isMergeNode: boolean
  provisional: boolean
  
  topic: {
    topicId: string
    title: string
    route: string
  }
  
  // === 统计 ===
  stats: {
    paperCount: number
    figureCount: number
    tableCount: number
    formulaCount: number
    totalWordCount: number  // 新增：总字数
    readingTimeMinutes: number  // 新增：预估阅读时间
  }
  
  // === 文章流（新结构）===
  articleFlow: NodeArticleFlowBlock[]
  
  // === 论文角色（用于导航）===
  paperRoles: PaperRoleInNodeInfo[]
  
  // === 证据 ===
  evidence: EvidenceExplanation[]
  
  // === 批判性分析 ===
  critique: ReviewerCritique
  
  // === 核心判断（节点级别的一句话判断）===
  coreJudgment?: string
  coreJudgmentEn?: string
}

/** 论文角色信息（用于导航） */
export interface PaperRoleInNodeInfo {
  paperId: string
  title: string
  role: PaperRoleInNode
  roleLabel: string
  anchorId: string
}

/** 证据解释 */
export interface EvidenceExplanation {
  anchorId: string
  type: 'section' | 'figure' | 'table' | 'formula'
  route: string
  title: string
  label: string
  quote: string
  content: string
  page: number | null
  sourcePaperId?: string
  sourcePaperTitle?: string
  imagePath?: string | null
  whyItMatters?: string
  formulaLatex?: string | null
  explanation?: string
  importance?: number
}

/** 批判性分析 */
export interface ReviewerCritique {
  title: string
  summary: string
  bullets: string[]
}

// ============================================================================
// 搜索增强类型
// ============================================================================

/** Semantic Scholar 论文数据 */
export interface SemanticScholarPaper {
  paperId: string
  externalIds?: {
    ArXiv?: string
    DOI?: string
    PubMed?: string
  }
  title: string
  abstract: string
  authors: Array<{
    authorId?: string
    name: string
  }>
  year: number
  citationCount: number
  referenceCount: number
  influentialCitationCount?: number
  fieldsOfStudy?: string[]
  publicationTypes?: string[]
  publicationDate?: string
  journal?: {
    name?: string
  }
  venue?: string
  openAccessPdf?: {
    url: string
    status: string
  }
  tldr?: {
    model: string
    text: string
  }
}

/** 引用链分析结果 */
export interface CitationChainAnalysis {
  paperId: string
  title: string
  
  // 前向引用（被谁引用）
  forwardCitations: Array<{
    paperId: string
    title: string
    year: number
    citationCount: number
    relevanceScore: number
  }>
  
  // 后向引用（引用了谁）
  backwardReferences: Array<{
    paperId: string
    title: string
    year: number
    isKeyReference: boolean
  }>
  
  // 引用网络分析
  networkMetrics: {
    pageRank: number
    betweennessCentrality: number
    isHub: boolean
    isAuthority: boolean
  }
  
  // 源头识别
  originPapers: Array<{
    paperId: string
    title: string
    year: number
    depth: number  // 在引用链中的深度
  }>
}

/** 搜索查询扩展 */
export interface QueryExpansion {
  originalQuery: string
  expandedQueries: string[]
  expansionRationale: string
  suggestedFilters: {
    yearRange?: { start: number; end: number }
    fieldsOfStudy?: string[]
    venues?: string[]
  }
}

// ============================================================================
// 持续更新类型
// ============================================================================

/** 论文监控结果 */
export interface PaperMonitorResult {
  topicId: string
  checkedAt: string
  newPapersFound: number
  
  newPapers: Array<{
    paperId: string
    title: string
    authors: string[]
    year: number
    abstract: string
    relevanceScore: number
    suggestedNodeId?: string
    suggestedAction: 'add_to_existing' | 'create_new_node' | 'ignore'
  }>
  
  updateSuggestions: Array<{
    nodeId: string
    reason: string
    affectedPapers: string[]
  }>
}

/** 更新通知 */
export interface UpdateNotification {
  id: string
  topicId: string
  topicTitle: string
  type: 'new_papers' | 'content_update' | 'structure_update'
  title: string
  message: string
  createdAt: string
  isRead: boolean
  actions: Array<{
    label: string
    action: string
    params: Record<string, unknown>
  }>
}
