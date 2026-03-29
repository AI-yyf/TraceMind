export type TopicId = string

export type PaperStatus = 'published' | 'seeded' | 'candidate'
export type TopicRegistryStatus = 'active' | 'archived'
export type CandidateType = 'direct' | 'branch' | 'transfer'
export type CandidateStatus = 'watch' | 'selected' | 'branch_active' | 'rejected' | 'promoted'
export type BranchStatus = 'candidate' | 'branch_active' | 'promoted_to_mainline' | 'merged' | 'archived'
export type BranchType = 'mainline' | 'direct' | 'transfer' | 'merge'
export type ProblemResolutionStatus = 'open' | 'branched' | 'merged' | 'resolved'

export interface ProblemTrace {
  id: string
  question: string
  whyItMatters: string
  tags: string[]
  nextCandidates?: string[]
  problemConstraints?: string[]
  requiredCapabilities?: string[]
  potentialTransferDirections?: string[]
}

export interface EvidenceTable {
  columns: string[]
  rows: string[][]
  note?: string
}

export interface EvidenceItem {
  id: string
  title: string
  type: 'figure' | 'table' | 'formula'
  assetPath?: string | null
  latex?: string | string[]
  caption: string
  analysis: string[]
  placement: number
  table?: EvidenceTable
}

export interface PaperSection {
  id: string
  sourceSectionTitle: string
  editorialTitle: string
  paragraphs: string[]
  evidence: EvidenceItem[]
}

export interface PaperEditorial {
  titleZh: string
  topicIds: TopicId[]
  status?: PaperStatus
  tags: string[]
  highlight: string
  cardDigest: string
  timelineDigest: string
  openingStandfirst: string
  coverCaption: string
  sections: PaperSection[]
  closingHandoff: string[]
  problemsOut?: ProblemTrace[]
  problemTags?: string[]
  branchContext?: BranchContext
}

export interface PaperEditorialSeed {
  id?: string
  titleZh?: string
  topicIds?: TopicId[]
  status?: PaperStatus
  tags?: string[]
  highlight?: string
  cardDigest?: string
  timelineDigest?: string
  openingStandfirst?: string
  coverCaption?: string
  sections?: unknown
  closingHandoff?: unknown
  problemsOut?: unknown
  problemTags?: string[]
  branchContext?: unknown
  [key: string]: unknown
}

export type PaperEditorialMap = Record<string, PaperEditorialSeed>

export interface TopicTimelineEntry {
  paperId: string
  context: string
  gapNote?: string
}

export interface OriginRejectedCandidate {
  title: string
  paperId?: string | null
  published: string
  reason: string
}

export interface TopicOriginAudit {
  originPaperId: string
  originConfirmedAt: string
  originConfirmationMode: 'earliest-representative'
  originQuestionDefinition: string
  originWhyThisCounts: string
  earlierRejectedCandidates: OriginRejectedCandidate[]
}

export interface TopicEditorial {
  id: TopicId
  nameZh: string
  nameEn: string
  focusLabel: string
  summary: string
  timelineDigest: string
  editorialThesis: string
  entries: TopicTimelineEntry[]
  originAudit: TopicOriginAudit
}

export interface TopicEditorialSeed {
  id: TopicId
  nameZh?: string
  nameEn?: string
  focusLabel?: string
  summary?: string
  timelineDigest?: string
  editorialThesis?: string
  entries?: TopicTimelineEntry[]
  originAudit?: TopicOriginAudit
  capabilityRefs?: string[]
  [key: string]: unknown
}

export interface CatalogTopicPaper {
  id: string
  version: string
  status: PaperStatus
  role: string
}

export interface CatalogTopic {
  id: TopicId
  nameZh: string
  nameEn: string
  focusLabel: string
  frontendSummary?: {
    cardSummary: string
    timelineGuide: string
    researchBlurb: string
  }
  queryTags: string[]
  problemPreference: string[]
  bootstrapWindowDays: number
  expansionNote: string
  originPaperId: string
  originConfirmedAt: string
  originConfirmationMode: 'earliest-representative'
  originQuestionDefinition: string
  originWhyThisCounts: string
  earlierRejectedCandidates: OriginRejectedCandidate[]
  papers: CatalogTopicPaper[]
}

export interface ActiveTopicEntry {
  topicId: TopicId
  status: TopicRegistryStatus
  displayOrder: number
  activatedAt: string
  archivedAt?: string | null
  /** 用户自定义偏好覆盖（可选，不设置则使用当前主题配置中的默认值） */
  preferences?: TopicPreferenceOverrides
}

/** 用户可自定义的主题偏好 */
export interface TopicPreferenceOverrides {
  /** 问题偏好列表（覆盖 catalog.problemPreference） */
  problemPreference?: string[]
  /** 查询标签列表（覆盖 catalog.queryTags） */
  queryTags?: string[]
  /** 论文最大时间间隔天数（覆盖 catalog.maxPaperIntervalDays） */
  maxPaperIntervalDays?: number
  /** 主题自定义中文名称 */
  nameZh?: string
  /** 主题自定义一句话描述 */
  focusLabel?: string
  /** 主题核心问题定义 */
  originQuestionDefinition?: string
}

export interface ArchivedTopicEntry extends ActiveTopicEntry {
  status: 'archived'
}

export interface CapabilityRef {
  id: string
  name: string
  definition: string
  mechanism: string
  applicabilitySignals: string[]
  antiSignals: string[]
  typicalTradeoffs: string[]
  relatedCapabilities: string[]
}

export interface ResearchCandidate {
  paperId: string
  candidateType: CandidateType
  supportedProblemIds: string[]
  supportedCapabilityIds: string[]
  whyThisCouldWork: string
  requiredAssumptions: string[]
  expectedFailureModes: string[]
  noveltyVsMainline: string
  selectionScore: number
  status: CandidateStatus
  sourceTopicId?: TopicId | null
}

export interface ProblemNode {
  id: string
  stageTitle: string
  stageDigest: string
  question: string
  problemConstraints: string[]
  requiredCapabilities: string[]
  parentPaperId: string
  parentProblemNodeId?: string | null
  directCandidates: ResearchCandidate[]
  transferCandidates: ResearchCandidate[]
  rejectedTransferCandidates: ResearchCandidate[]
  activeBranchIds: string[]
  resolutionStatus: ProblemResolutionStatus
  confidence: number
}

export interface BranchNode {
  id: string
  rootProblemNodeId: string
  label: string
  branchType: BranchType
  paperPath: string[]
  status: BranchStatus
  summary: string
  promotionPolicy: string
  mergeBackPolicy: string
  supersededBy?: string | null
  rewriteImpact: string
}

export interface RecommendationEntry {
  paperId: string
  derivedFromProblemIds: string[]
  candidateType: CandidateType
  why: string
  confidence: number
  status: 'queued' | 'selected' | 'deferred'
  branchId?: string
  stageIndex?: number
  mergeTargetBranchIds?: string[]
}

export interface DecisionLogEntry {
  id: string
  timestamp: string
  action: string
  summary: string
  affectedProblemIds: string[]
  affectedPaperIds: string[]
  rationale: string
  branchId?: string | null
  stageIndex?: number | null
  windowMonths?: number | null
  selectedPaperId?: string | null
  deferredPaperIds?: string[]
  resolvedProblemIds?: string[]
  mergeTargetBranchIds?: string[]
  actionKind?: string
}

export interface BranchRegistryEntry {
  branchId: string
  rootProblemNodeId: string
  parentBranchId?: string | null
  anchorPaperId: string
  anchorPaperPublishedAt: string
  lastTrackedPaperId: string
  lastTrackedPublishedAt: string
  stageIndex: number
  activeWindowMonths: number
  status: 'active' | 'candidate' | 'merged' | 'dormant' | 'resolved' | 'pending-review'
  priorityScore: number
  linkedProblemNodeIds: string[]
  mergedIntoBranchId?: string | null
  branchType?: 'direct' | 'transfer' | 'merge'
  label?: string
  summary?: string
}

export interface StageLedgerEntry {
  branchId: string
  stageIndex: number
  windowStart: string
  windowEnd: string
  windowMonths: number
  anchorPaperId: string
  candidatePaperIds: string[]
  selectedPaperId?: string | null
  status: 'planned' | 'completed' | 'no-candidate' | 'merged' | 'skipped'
  decisionSummary: string
  mergeEvents: Array<{
    paperId: string
    mergedBranchIds: string[]
  }>
  builtAt: string
}

export interface PaperRelationEntry {
  paperId: string
  problemNodeIds: string[]
  branchIds: string[]
  primaryBranchId: string
  isMergePaper: boolean
  mergedBranchIds: string[]
  resolvedProblemIds: string[]
}

export interface TopicMemory {
  schemaVersion: number
  topicId: TopicId
  timelineContext?: Record<string, unknown>
  originAudit: TopicOriginAudit & {
    passed?: boolean
    checkedWindow?: {
      beforeOriginFrom: string
      beforeOriginTo: string
    }
  }
  publishedMainlinePaperIds: string[]
  publishedBranchPaperIds: string[]
  candidatePaperIds: string[]
  seedPaperIds: string[]
  queryTags: string[]
  capabilityRefs: string[]
  bootstrapWindowDays: number
  windowPolicy?: 'auto' | 'fixed'
  minStageWindowMonths?: number
  maxStageWindowMonths?: number
  maxActiveBranches?: number
  branchModel?: 'problem-node-driven'
  allowBranchMerge?: boolean
  expansionHistory: Array<{
    fromPaperId: string
    windowDays: number
    reason: string
  }>
  problemNodes: ProblemNode[]
  branchTree: BranchNode[]
  branchRegistry?: BranchRegistryEntry[]
  stageLedger?: StageLedgerEntry[]
  paperRelations?: PaperRelationEntry[]
  recommendationQueue: RecommendationEntry[]
  decisionLog: DecisionLogEntry[]
  lastBuiltAt: string
  lastRewrittenAt: string
  /** 研究节点列表（节点中心架构） */
  researchNodes?: ResearchNode[]
}

export interface TopicCandidatePreview {
  candidate: ResearchCandidate
  paper: TrackerPaper | null
  sourceTopic: TrackerTopic | null
  capabilities: CapabilityRef[]
}

export interface BranchContext {
  branchId: string | null
  branchLabel: string | null
  stageIndex: number | null
  problemNodeIds: string[]
  isMergePaper: boolean
  mergedBranchIds: string[]
}

export interface TopicStage {
  id: string
  order: number
  problemNode: ProblemNode
  parentPaper: TrackerPaper | null
  activeBranchIds: string[]
  directCandidates: TopicCandidatePreview[]
  transferCandidates: TopicCandidatePreview[]
  selectedCandidate: TopicCandidatePreview | null
  mergeBranches: BranchNode[]
}

export interface TrackerPaper {
  id: string
  title: string
  titleZh: string
  /** 英文标题 */
  titleEn?: string
  published: string
  authors: string[]
  summary: string
  /** 论文内容详细讲解 */
  explanation?: string
  arxivUrl: string
  pdfUrl: string
  citationCount: number | null
  citationSource: string
  citationRetrievedAt: string
  coverPath: string | null
  coverSource: string | null
  /** 封面图片 URL */
  coverImage?: string
  figurePaths: string[]
  topicIds: TopicId[]
  status: PaperStatus
  tags: string[]
  highlight: string
  cardDigest: string
  timelineDigest: string
  openingStandfirst: string
  coverCaption: string
  sections: PaperSection[]
  closingHandoff: string[]
  problemsOut: ProblemTrace[]
  problemTags: string[]
  contentMode: 'editorial' | 'seed'
  branchContext: BranchContext
  role?: string
}

export interface TrackerTopic extends TopicEditorial {
  papers: TrackerPaper[]
  originPaper: TrackerPaper
  catalog: CatalogTopic
  memory: TopicMemory
  capabilityRefs: CapabilityRef[]
  stages: TopicStage[]
  recommendationQueue: RecommendationEntry[]
}

export interface SearchItem {
  id: string
  kind: 'topic' | 'paper' | 'candidate' | 'research'
  title: string
  subtitle: string
  href: string
  year: string
  tags: string[]
}

export interface FavoriteExcerpt {
  id: string
  paperId: string
  paperTitleZh: string
  topicId?: TopicId
  excerptTitle: string
  paragraphs: string[]
  savedAt: string
}

// ========== 节点中心类型 (Node-Centric Types) ==========

/** 节点状态 */
export type NodeStatus = 'provisional' | 'canonical' | 'archived' | 'deprecated'

/** 研究节点 - 前端展示用 */
export interface TrackerNode {
  nodeId: string
  topicId: TopicId
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  paperCount: number
  nodeLabel: string
  nodeSummary: string
  /** 节点详细讲解 - 比摘要更详细的内容解读 */
  nodeExplanation?: string
  /** 节点配图 URL */
  nodeCoverImage?: string
  status: NodeStatus
  sourceBranchIds: string[]
  sourceBranchLabels: string[]
  sourceBranchColors: string[]
  isMergeNode: boolean
  updatedAt: string
  discoveredAt: string
  provisional: boolean
}

/** 研究节点 - 后端存储用 */
export interface ResearchNode {
  nodeId: string
  topicId: string
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  paperWeights?: Record<string, number>
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  discoveryContext?: {
    discoveryRounds: Array<{
      roundNumber: 1 | 2
      queries: string[]
      resultCount: number
      topCandidates: string[]
    }>
    queryHits: Array<{
      query: string
      paperId: string
      relevanceScore: number
    }>
    confidenceScore: number
  }
  status: NodeStatus
  provisional: boolean
  nodeLabel: string
  nodeSummary: string
  nodeSubtitle?: string
  isMergeNode: boolean
  mergeHistory?: Array<{
    type: 'merge' | 'split'
    timestamp: string
    sourceNodeIds?: string[]
    targetNodeIds?: string[]
    reason?: string
  }>
  tags: string[]
  warnings?: string[]
  discoveredAt: string
  canonicalizedAt?: string
  createdAt: string
  updatedAt: string
  version: number
  previousVersion?: string
  supersededBy?: string[]
  mergedInto?: string
}
