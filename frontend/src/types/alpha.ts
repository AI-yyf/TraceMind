import type {
  ProviderCapability,
  ProviderId,
  ProviderModelRef,
  ResearchRoleId,
  TaskRouteTarget,
  ProviderModelConfig,
  UserModelConfig,
  SanitizedProviderModelConfig,
  ProviderUiHints,
  ProviderConfigField,
} from './config'
import type { MethodEvolutionStep, PaperRoleInNode, PaperSubsectionKind } from './article'

export type {
  ProviderCapability,
  ProviderId,
  ProviderModelRef,
  ResearchRoleId,
  TaskRouteTarget,
  ProviderModelConfig,
  UserModelConfig,
  SanitizedProviderModelConfig,
  ProviderUiHints,
  ProviderConfigField,
}

export type TopicCardEditorial = {
  eyebrow: string
  digest: string
  whyNow: string
  nextQuestion: string
}

export type TopicStageEditorial = {
  kicker: string
  summary: string
  transition: string
}

export type TopicClosingEditorial = {
  title: string
  paragraphs: string[]
  reviewerNote: string
}

export type TopicHero = {
  kicker: string
  title: string
  standfirst: string
  strapline: string
}

export type TopicNodeCard = {
  nodeId: string
  anchorId: string
  route: string
  title: string
  titleEn: string
  subtitle: string
  summary: string
  explanation: string
  paperCount: number
  figureCount: number
  tableCount: number
  formulaCount: number
  figureGroupCount: number
  evidenceCount: number
  paperIds: string[]
  primaryPaperTitle: string
  primaryPaperId: string
  coverImage: string | null
  isMergeNode: boolean
  provisional: boolean
  updatedAt: string
  branchLabel: string
  branchColor: string
  editorial: TopicCardEditorial
}

export type TopicSummaryPanel = {
  thesis: string
  metaRows: Array<{
    label: string
    value: string
  }>
  stats: Array<{
    label: string
    value: number
  }>
  actions: Array<{
    id: 'start' | 'edit' | 'export' | 'delete' | 'rebuild'
    label: string
  }>
}

export type TopicStageConfig = {
  windowMonths: number
  defaultWindowMonths: number
  minWindowMonths: number
  maxWindowMonths: number
  adjustable: boolean
}

export type TopicLocaleRecord = {
  name: string
  summary: string
  focusLabel: string
  description: string
}

export type StageLocaleRecord = {
  name: string
  description: string
}

export type TopicLocaleMap = Record<PromptLanguageCode, TopicLocaleRecord>
export type StageLocaleMap = Record<PromptLanguageCode, StageLocaleRecord>

export type TopicLocalizationPayload = {
  schemaVersion: string
  languageMode: string
  primaryLanguage: PromptLanguageCode
  topic: {
    primaryLanguage: PromptLanguageCode
    recommendedStages: number
    nameZh: string
    nameEn: string
    summary: string
    summaryZh: string
    summaryEn: string
    focusLabel: string
    focusLabelZh: string
    focusLabelEn: string
    keywords: Array<{
      zh: string
      en: string
      localized: Record<PromptLanguageCode, string>
    }>
    locales: TopicLocaleMap
  }
  stages: Array<{
    order: number
    name: string
    nameEn: string
    description: string
    descriptionEn: string
    locales: StageLocaleMap
  }>
  preview?: unknown
  createdAt?: string
}

export type TopicTimelineStage = {
  stageIndex: number
  title: string
  titleEn: string
  description: string
  locales?: StageLocaleMap
  branchLabel: string
  branchColor: string
  yearLabel: string
  dateLabel: string
  timeLabel: string
  /** Formatted time label with specific format (e.g., "23.01", "23.01-03", "23.01.15-03.20") */
  formattedTimeLabel?: string
  /** Time label format type used for this stage */
  timeLabelFormat?: 'year' | 'year-month' | 'month' | 'month-range' | 'date-range'
  stageThesis: string
  editorial: TopicStageEditorial
}

/** Supported stage time label formats for multi-timeline display */
export type StageTimeLabelFormat = 'year' | 'year-month' | 'month' | 'month-range' | 'date-range'

/** Helper type for stage time range information */
export type StageTimeRange = {
  startDate: Date
  endDate: Date
  format: StageTimeLabelFormat
  formattedLabel: string
}

export type TopicGraphNode = TopicNodeCard & {
  stageIndex: number
  branchPathId: string
  parentNodeIds: string[]
  timeLabel: string
  layoutHint: {
    column: number
    span: number
    row: number
    emphasis: 'primary' | 'merge' | 'branch'
    laneIndex: number
    branchIndex: number | null
    isMainline: boolean
    side: 'left' | 'center' | 'right'
  }
  coverAsset: {
    imagePath: string | null
    alt: string
    source: 'paper-cover' | 'node-cover' | 'generated-brief'
  }
  cardEditorial: TopicCardEditorial
}

export type TopicGraphLane = {
  id: string
  laneIndex: number
  branchIndex: number | null
  isMainline: boolean
  side: 'left' | 'center' | 'right'
  color: string
  roleLabel: string
  label: string
  labelEn: string
  legendLabel: string
  legendLabelEn: string
  description: string
  periodLabel: string
  nodeCount: number
  stageCount: number
  latestNodeId: string
  latestAnchorId: string
  /** Reference to parent timeline for multi-timeline support */
  timelineId?: string
}

export type TopicGraphTimeline = {
  timelineId: string
  label: string
  labelEn?: string
  color: string
  isPrimary: boolean
  /** Lane index range this timeline covers [start, end] */
  laneRange: [number, number]
  /** Period label for this timeline (e.g., "2023.01-03") */
  periodLabel: string
  /** Sort order for timeline display */
  order?: number
  /** Description of this timeline's focus or scope */
  description?: string
}

export type TopicViewModel = {
  /** Schema version - always provided by backend */
  schemaVersion: string
  topicId: string
  title: string
  titleEn: string
  subtitle: string
  focusLabel: string
  summary: string
  description: string
  language: string
  status: string
  createdAt: string
  updatedAt: string
  generatedAt: string
  localization?: TopicLocalizationPayload | null
  hero: TopicHero
  stageConfig: TopicStageConfig
  /** Summary panel - always provided by backend */
  summaryPanel: TopicSummaryPanel
  stats: {
    stageCount: number
    nodeCount: number
    paperCount: number
    mappedPaperCount: number
    unmappedPaperCount: number
    evidenceCount: number
  }
  /** Timeline stages - always provided by backend */
  timeline: {
    stages: TopicTimelineStage[]
  }
  /** Graph layout - always provided by backend */
  graph: {
    columnCount: number
    lanes: TopicGraphLane[]
    nodes: TopicGraphNode[]
    /** Multi-timeline support - groups lanes into timelines (max 10) */
    timelines?: TopicGraphTimeline[]
  }
  /** Generation state - always provided by backend */
  generationState: {
    hero: 'ready' | 'pending'
    stageTimeline: 'ready' | 'pending'
    nodeCards: 'ready' | 'pending'
    closing: 'ready' | 'pending'
  }
  stages: Array<{
    stageIndex: number
    title: string
    titleEn: string
    description: string
    locales?: StageLocaleMap
    branchLabel: string
    branchColor: string
    editorial: TopicStageEditorial
    trackedPaperCount: number
    mappedPaperCount: number
    unmappedPaperCount: number
    nodes: TopicNodeCard[]
  }>
  papers: Array<{
    paperId: string
    anchorId: string
    route: string
    title: string
    titleEn: string
    summary: string
    explanation: string
    publishedAt: string
    authors: string[]
    citationCount: number | null
    coverImage: string | null
    originalUrl?: string
    pdfUrl?: string
    figuresCount: number
    tablesCount: number
    formulasCount: number
    sectionsCount: number
  }>
  unmappedPapers: Array<{
    paperId: string
    anchorId: string
    route: string
    title: string
    titleEn: string
    summary: string
    publishedAt: string
    authors: string[]
    citationCount: number | null
    coverImage: string | null
    stageIndex: number | null
    stageLabel: string
  }>
  narrativeArticle: string
  articleMarkdown?: string
  closingEditorial: TopicClosingEditorial
  resources: Array<{
    id: string
    kind: 'stage' | 'node' | 'paper'
    title: string
    subtitle: string
    description: string
    route: string
    anchorId?: string
  }>
  chatContext: {
    suggestedQuestions: string[]
  }
}

export type ArticleSectionKind =
  | 'lead'
  | 'paper-pass'
  | 'comparison'
  | 'evidence'
  | 'figure'
  | 'table'
  | 'formula'
  | 'critique'
  | 'closing'

export type ArticleSection = {
  id: string
  kind: ArticleSectionKind
  title: string
  body: string[]
  anchorId?: string
  paperId?: string
  paperTitle?: string
  evidenceIds?: string[]
}

export type ArticleFlowBlock =
  | {
      id: string
      type: 'text'
      title?: string
      body: string[]
      anchorId?: string
      paperId?: string
      paperTitle?: string
    }
  | {
      id: string
      type: 'paper-break'
      paperId: string
      title: string
      titleEn?: string
      role: string
      contribution: string
      route: string
      publishedAt?: string
      originalUrl?: string
      pdfUrl?: string
    }
  | {
      id: string
      type: 'comparison'
      title: string
      summary: string
      points: Array<{
        label: string
        detail: string
      }>
    }
  | {
      id: string
      type: 'figure' | 'table' | 'formula'
      evidence: EvidenceExplanation
    }
  | {
      id: string
      type: 'critique'
      title: string
      summary: string
      bullets: string[]
    }
  | {
      id: string
      type: 'closing'
      title?: string
      body: string[]
    }
  | {
      id: string
      type: 'paper-transition'
      fromPaperId: string
      fromPaperTitle: string
      toPaperId: string
      toPaperTitle: string
      content: string
      transitionType: 'method-evolution' | 'problem-shift' | 'scale-up' | 'scope-broaden' | 'complementary'
      anchorId: string
    }

export type CrossPaperComparisonBlock = {
  id: string
  title: string
  summary: string
  papers: Array<{
    paperId: string
    title: string
    route: string
    role: string
  }>
  points: Array<{
    label: string
    detail: string
  }>
}

export type ReviewerCritique = {
  title: string
  summary: string
  bullets: string[]
}

export type EvidenceExplanation = {
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
  tableHeaders?: string[]
  tableRows?: unknown[]
  explanation?: string
  importance?: number
  placementHint?: string
  thumbnailPath?: string | null
}

export type PaperRole = {
  paperId: string
  title: string
  titleEn: string
  route: string
  summary: string
  publishedAt: string
  role: string
  contribution: string
  authors?: string[]
  citationCount?: number | null
  figuresCount: number
  tablesCount: number
  formulasCount: number
  coverImage: string | null
  originalUrl?: string
  pdfUrl?: string
}

export type WorkbenchReferenceEntry = {
  paperId: string
  title: string
  titleEn?: string
  publishedAt?: string
  authors?: string[]
  journal?: string
  doi?: string
  citationCount?: number | null
  originalUrl?: string
  pdfUrl?: string
  route?: string
  summary?: string
  explanation?: string
}

export type PaperArticleViewModel = {
  schemaVersion: string
  paperId: string
  title: string
  titleEn: string
  summary: string
  explanation: string
  publishedAt: string
  authors: string[]
  citationCount: number | null
  coverImage: string | null
  originalUrl?: string
  pdfUrl?: string
  topic: {
    topicId: string
    title: string
    route: string
  }
  stageWindowMonths?: number
  stats: {
    sectionCount: number
    figureCount: number
    tableCount: number
    formulaCount: number
    relatedNodeCount: number
  }
  relatedNodes: Array<{
    nodeId: string
    title: string
    subtitle: string
    summary: string
    stageIndex: number
    stageLabel?: string
    route: string
  }>
  standfirst: string
  article: {
    periodLabel: string
    timeRangeLabel: string
    flow: ArticleFlowBlock[]
    sections: ArticleSection[]
    closing: string[]
  }
  articleMarkdown?: string
  critique: ReviewerCritique
  evidence: EvidenceExplanation[]
  references?: Array<{
    paperId: string
    title: string
    publishedAt?: string
    authors?: string[]
    citationCount?: number | null
    originalUrl?: string
    pdfUrl?: string
  }>
}

export type NodeResearchPaperBrief = {
  paperId: string
  paperTitle: string
  role: PaperRoleInNode
  publishedAt?: string
  summary: string
  contribution: string
  evidenceAnchorIds: string[]
  keyFigureIds: string[]
  keyTableIds: string[]
  keyFormulaIds: string[]
}

export type NodeResearchEvidenceChain = {
  paperId: string
  paperTitle: string
  subsectionKind: PaperSubsectionKind
  subsectionTitle: string
  summary: string
  evidenceAnchorIds: string[]
}

export type NodeResearchMethodEvolution = MethodEvolutionStep & {
  fromPaperId?: string
  fromPaperTitle?: string
  toPaperId?: string
  toPaperTitle?: string
  transitionType?: 'method-evolution' | 'problem-shift' | 'scale-up' | 'scope-broaden' | 'complementary'
  anchorId?: string
  evidenceAnchorIds?: string[]
}

export type NodeResearchView = {
  evidence: {
    featuredAnchorIds: string[]
    supportingAnchorIds: string[]
    featured: EvidenceExplanation[]
    supporting: EvidenceExplanation[]
    paperBriefs: NodeResearchPaperBrief[]
    evidenceChains: NodeResearchEvidenceChain[]
    coverage: {
      totalEvidenceCount: number
      renderableEvidenceCount: number
      figureCount: number
      tableCount: number
      formulaCount: number
      sectionCount: number
      featuredCount: number
      supportingCount: number
    }
  }
  methods: {
    entries: Array<{
      paperId: string
      paperTitle: string
      publishedAt?: string
      title: string
      titleEn?: string
      summary: string
      keyPoints: string[]
    }>
    evolution: NodeResearchMethodEvolution[]
    dimensions: string[]
  }
  problems: {
    items: Array<{
      paperId: string
      paperTitle: string
      title: string
      titleEn?: string
      status: 'solved' | 'partial' | 'open'
    }>
    openQuestions: string[]
  }
  coreJudgment: {
    content: string
    contentEn: string
    confidence: 'high' | 'medium' | 'low' | 'speculative'
    quickTags: string[]
  } | null
}

export type NodeArticleViewModel = {
  schemaVersion: string
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
  stageWindowMonths?: number
  stats: {
    paperCount: number
    figureCount: number
    tableCount: number
    formulaCount: number
  }
  standfirst: string
  paperRoles: PaperRole[]
  comparisonBlocks: CrossPaperComparisonBlock[]
  article: {
    periodLabel: string
    timeRangeLabel: string
    flow: ArticleFlowBlock[]
    sections: ArticleSection[]
    closing: string[]
  }
  articleMarkdown?: string
  critique: ReviewerCritique
  evidence: EvidenceExplanation[]
  /** 增强版文章流（8-Pass深度解析） */
  enhancedArticleFlow?: import('./article').NodeArticleFlowBlock[]
  /** 核心判断（节点级别的一句话判断） */
  coreJudgment?: {
    content: string
    contentEn: string
  }
  researchView: NodeResearchView
}

export type PaperViewModel = PaperArticleViewModel
export type NodeViewModel = NodeArticleViewModel & {
  references: WorkbenchReferenceEntry[]
}

export type SearchResultKind =
  | 'topic'
  | 'node'
  | 'paper'
  | 'section'
  | 'figure'
  | 'table'
  | 'formula'

export type SearchResultGroupKind = 'topic' | 'node' | 'paper' | 'evidence'

export type SearchResultItem = {
  id: string
  kind: SearchResultKind
  title: string
  subtitle: string
  excerpt: string
  route: string
  anchorId?: string
  topicId?: string
  topicTitle?: string
  tags: string[]
  publishedAt?: string
  matchedFields: string[]
  stageLabel?: string
  timeLabel?: string
  nodeId?: string
  nodeTitle?: string
  nodeRoute?: string
  locationLabel?: string
  relatedNodes?: Array<{
    nodeId: string
    title: string
    stageIndex: number
    stageLabel?: string
    route: string
  }>
  quickActions?: Array<{
    id: 'open' | 'add-context' | 'follow-up'
    label: string
  }>
}

export type PromptLanguageCode = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'

export type PromptLanguageOption = {
  code: PromptLanguageCode
  label: string
  nativeName: string
  isDefault?: boolean
}

export type PromptTemplateContent = {
  system: string
  user: string
  notes: string
}

export type PromptTemplateRecord = {
  id: string
  family: 'topic' | 'article' | 'evidence' | 'visual'
  title: string
  description: string
  slot: 'language' | 'multimodal'
  order: number
  tags: string[]
  builtIn: boolean
  languageContents: Record<PromptLanguageCode, PromptTemplateContent>
}

export type PromptTemplatePatch = {
  id: string
  languageContents: Partial<Record<PromptLanguageCode, Partial<PromptTemplateContent>>>
}

export type ProductCopyRecord = {
  id: string
  section: string
  title: string
  description: string
  order: number
  multiline: boolean
  builtIn: boolean
  languageContents: Record<PromptLanguageCode, string>
}

export type ProductCopyPatch = {
  id: string
  languageContents: Partial<Record<PromptLanguageCode, string>>
}

export type ExternalAgentAssetId = 'readme' | 'promptGuide' | 'superPrompt' | 'configExample'

export type ExternalAgentAssetRecord = {
  id: ExternalAgentAssetId
  title: string
  description: string
  path: string
  format: 'markdown' | 'json'
  builtIn: boolean
  content: string
}

export type ExternalAgentAssetPatch = {
  id: ExternalAgentAssetId
  content: string
}

export type GenerationRuntimeConfig = {
  defaultLanguage: PromptLanguageCode
  cacheGeneratedOutputs: boolean
  contextAwareCacheReuse: boolean
  staleContextRefinePasses: number
  useTopicMemory: boolean
  usePreviousPassOutputs: boolean
  preferMultimodalEvidence: boolean
  maxRetriesPerPass: number
  topicPreviewPasses: number
  topicBlueprintPasses: number
  topicLocalizationPasses: number
  topicChatPasses: number
  stageNamingPasses: number
  nodeArticlePasses: number
  paperArticlePasses: number
  selfRefinePasses: number
  researchOrchestrationPasses: number
  researchReportPasses: number
  researchCycleDelayMs: number
  researchStageStallLimit: number
  researchStagePaperLimit: number
  researchArtifactRebuildLimit: number
  nodeCardFigureCandidateLimit: number
  topicSessionMemoryEnabled: boolean
  topicSessionMemoryInitEventCount: number
  topicSessionMemoryChatTurnsBetweenCompaction: number
  topicSessionMemoryResearchCyclesBetweenCompaction: number
  topicSessionMemoryTokenThreshold: number
  topicSessionMemoryRecentEventLimit: number
  topicSessionMemoryRecallEnabled: boolean
  topicSessionMemoryRecallLimit: number
  topicSessionMemoryRecallLookbackLimit: number
  topicSessionMemoryRecallRecencyBias: number
  languageTemperature: number
  multimodalTemperature: number
  maxEvidencePerArticle: number
  contextWindowStages: number
  contextWindowNodes: number
  editorialPolicies: Record<
    PromptLanguageCode,
    {
      identity: string
      mission: string
      reasoning: string
      style: string
      evidence: string
      industryLens: string
      continuity: string
      refinement: string
    }
  >
}

export type PromptStudioBundle = {
  languages: PromptLanguageOption[]
  templates: PromptTemplateRecord[]
  productCopies: ProductCopyRecord[]
  runtime: GenerationRuntimeConfig
  runtimeMeta?: {
    key: string
    revision: number
    hash: string
    updatedAt: string | null
    source: string
    actor: string | null
    sizeBytes: number
    topLevelKeys: string[]
    legacy: boolean
  }
  runtimeHistory?: Array<{
    key: string
    revision: number
    hash: string
    updatedAt: string | null
    source: string
    actor: string | null
    sizeBytes: number
    topLevelKeys: string[]
    legacy: boolean
    previousHash: string | null
    warnings: string[]
  }>
  externalAgents: {
    rootDir: string
    readmePath: string
    promptGuidePath: string
    superPromptPath: string
    configExamplePath: string
    assets: ExternalAgentAssetRecord[]
  }
}

export type SearchResultGroup = {
  group: SearchResultGroupKind
  label: string
  items: SearchResultItem[]
}

export type SearchFacetEntry = {
  value: string
  label: string
  count: number
}

export type SearchResponse = {
  query: string
  scope: 'global' | 'topic'
  totals: {
    all: number
    topic: number
    node: number
    paper: number
    evidence: number
  }
  groups: SearchResultGroup[]
  facets?: {
    stages: SearchFacetEntry[]
    topics: SearchFacetEntry[]
  }
}

export type TopicResearchView = 'search' | 'references' | 'resources'

export type TopicWorkbenchTab = 'assistant' | 'research'

export type AssistantState =
  | 'empty'
  | 'drafting'
  | 'submitting'
  | 'thinking'
  | 'retrieving'
  | 'answer-ready'
  | 'partial-grounding'
  | 'auth-required'
  | 'rate-limited'
  | 'hard-error'

export type ContextPill = {
  id: string
  kind: 'selection' | 'anchor' | 'stage' | 'node' | 'paper' | 'evidence' | 'search'
  label: string
  description?: string
  route?: string
  anchorId?: string
}

export type CitationRef = {
  anchorId: string
  type: 'paper' | 'node' | 'figure' | 'table' | 'formula' | 'section'
  route: string
  label: string
  quote: string
}

export type SuggestedAction = {
  label: string
  action: 'explain' | 'compare' | 'summarize' | 'navigate' | 'show_evidence'
  targetId?: string
  description?: string
}

export type TopicGuidanceReceipt = {
  classification: 'ask' | 'suggest' | 'challenge' | 'focus' | 'style' | 'command'
  directiveId: string | null
  directiveType: 'suggest' | 'challenge' | 'focus' | 'style' | 'constraint' | 'command' | null
  status: 'accepted' | 'partial' | 'deferred' | 'rejected' | 'superseded' | 'consumed' | 'none'
  scopeLabel: string
  summary: string
  effectWindow: 'next-run' | 'until-cleared' | 'current-session' | 'none'
  promptHint: string
}

export type TopicWorkbenchAction = {
  kind:
    | 'start-research'
    | 'stop-research'
    | 'export-dossier'
    | 'export-highlights'
    | 'export-notes'
  summary: string
  targetTab?: 'assistant' | 'research'
  targetResearchView?: TopicResearchView
  targetRoute?: string
  durationHours?: number
}

export type TopicChatResponse = {
  messageId: string
  answer: string
  citations: CitationRef[]
  suggestedActions: SuggestedAction[]
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
  notice?: OmniIssue
}

export type ResearchMode = 'stage-rounds' | 'duration'

export type ResearchTaskProgress = {
  taskId: string
  topicId: string
  topicName: string
  researchMode: ResearchMode
  durationHours: number | null
  currentStage: number
  totalStages: number
  stageProgress: number
  currentStageRuns: number
  currentStageTargetRuns: number
  stageRunMap: Record<string, number>
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | null
  lastRunResult: 'success' | 'failed' | 'partial' | null
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  // Evidence counts
  figureCount: number
  tableCount: number
  formulaCount: number
  figureGroupCount: number
  startedAt: string | null
  deadlineAt: string | null
  completedAt: string | null
  activeSessionId: string | null
  completedStageCycles: number
  currentStageStalls: number
  latestSummary: string | null
  status: 'active' | 'paused' | 'completed' | 'failed'
}

export type ResearchRunReport = {
  schemaVersion: string
  reportId: string
  taskId: string
  topicId: string
  topicName: string
  researchMode: ResearchMode
  trigger: 'manual' | 'scheduled'
  status: 'running' | 'completed' | 'failed' | 'paused'
  durationHours: number | null
  startedAt: string
  deadlineAt: string | null
  completedAt: string | null
  updatedAt: string
  currentStage: number
  totalStages: number
  completedStageCycles: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  latestStageSummary: string | null
  headline: string
  dek: string
  summary: string
  paragraphs: string[]
  keyMoves: string[]
  openQuestions: string[]
  latestNodeActions: Array<{
    action: 'create' | 'update' | 'merge' | 'strengthen'
    stageIndex: number | null
    title: string
    rationale: string
    nodeId?: string | null
    mergeIntoNodeId?: string | null
  }>
}

export type ResearchPipelineActionSummary = {
  action: 'create' | 'update' | 'merge' | 'strengthen'
  nodeId: string | null
  mergeIntoNodeId: string | null
  title: string
  paperIds: string[]
  rationale: string
}

export type ResearchPipelineDurationDecisionSummary = {
  action: 'stay' | 'advance' | 'cycle-reset'
  reason: 'orchestration' | 'stall-limit' | 'progress-made' | 'await-more-evidence'
  currentStage: number
  nextStage: number
  madeProgress: boolean
  stallCountBefore: number
  stallCountAfter: number
  stallLimit: number
  completedStageCycles: number
  summary: string
  rationale: string
}

export type ResearchPipelineEntrySummary = {
  timestamp: string | null
  stageIndex: number | null
  roundIndex: number | null
  discovered: number
  admitted: number
  contentsGenerated: number
  stageSummary: string
  shouldAdvanceStage: boolean
  durationDecision: ResearchPipelineDurationDecisionSummary | null
  openQuestions: string[]
  nodeActions: ResearchPipelineActionSummary[]
}

export type ResearchPipelineContextSummary = {
  updatedAt: string | null
  lastRun: ResearchPipelineEntrySummary | null
  currentStage: ResearchPipelineEntrySummary | null
  recentHistory: ResearchPipelineEntrySummary[]
  globalOpenQuestions: string[]
  continuityThreads: string[]
  subjectFocus: {
    nodeId: string | null
    paperIds: string[]
    stageIndex: number | null
    relatedHistory: ResearchPipelineEntrySummary[]
    relatedNodeActions: string[]
  }
}

export type ResearchWorldConfidence = 'high' | 'medium' | 'low' | 'speculative'
export type ResearchWorldClaimStatus = 'accepted' | 'contested' | 'rejected' | 'superseded'
export type ResearchWorldQuestionPriority = 'critical' | 'important' | 'follow-up'
export type ResearchWorldAgendaKind =
  | 'resolve-question'
  | 'repair-critique'
  | 'stabilize-node'
  | 're-evaluate-stage'
  | 'pick-node-figure'
  | 'strengthen-node-evidence'

export type TopicResearchWorldSummary = {
  thesis: string
  currentFocus: string
  continuity: string
  dominantQuestion: string
  dominantCritique: string
  agendaHeadline: string
  maturity: 'nascent' | 'forming' | 'stable' | 'contested'
}

export type TopicResearchWorldStage = {
  id: string
  stageIndex: number
  title: string
  titleEn: string
  summary: string
  nodeIds: string[]
  paperIds: string[]
  confidence: ResearchWorldConfidence
  status: 'forming' | 'stable' | 'contested'
}

export type TopicResearchWorldNode = {
  id: string
  stageIndex: number
  title: string
  subtitle: string
  summary: string
  paperIds: string[]
  primaryPaperId: string | null
  coverImage: string | null
  confidence: ResearchWorldConfidence
  maturity: 'nascent' | 'forming' | 'stable' | 'contested'
  keyQuestion: string
  dominantCritique: string
}

export type TopicResearchWorldPaper = {
  id: string
  title: string
  titleEn: string
  summary: string
  coverImage: string | null
  publishedAt: string
  nodeIds: string[]
  stageIndexes: number[]
}

export type TopicResearchWorldClaim = {
  id: string
  scope: 'topic' | 'stage' | 'node' | 'paper'
  scopeId: string
  statement: string
  kind: 'finding' | 'mechanism' | 'comparison' | 'limitation'
  confidence: ResearchWorldConfidence
  status: ResearchWorldClaimStatus
  supportPaperIds: string[]
  supportNodeIds: string[]
  source: 'judgment' | 'report' | 'session'
}

export type TopicResearchWorldQuestion = {
  id: string
  scope: 'topic' | 'stage' | 'node' | 'paper'
  scopeId: string
  question: string
  priority: ResearchWorldQuestionPriority
  source: 'judgment' | 'report' | 'pipeline' | 'session'
  status: 'open'
}

export type TopicResearchWorldCritique = {
  id: string
  targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim'
  targetId: string
  summary: string
  source: 'judgment' | 'report' | 'session'
  severity: 'high' | 'medium' | 'low'
  resolved: false
}

export type TopicResearchWorldAgendaItem = {
  id: string
  kind: ResearchWorldAgendaKind
  targetType: 'topic' | 'stage' | 'node' | 'paper' | 'claim'
  targetId: string
  title: string
  rationale: string
  priorityScore: number
  suggestedPrompt: string
  status: 'queued'
}

export type TopicResearchWorld = {
  schemaVersion: string
  topicId: string
  version: number
  updatedAt: string
  language: string
  summary: TopicResearchWorldSummary
  stages: TopicResearchWorldStage[]
  nodes: TopicResearchWorldNode[]
  papers: TopicResearchWorldPaper[]
  claims: TopicResearchWorldClaim[]
  questions: TopicResearchWorldQuestion[]
  critiques: TopicResearchWorldCritique[]
  agenda: TopicResearchWorldAgendaItem[]
}

export type TopicGuidanceLatestApplicationDirective = {
  directiveId: string
  directiveType: 'suggest' | 'challenge' | 'focus' | 'style' | 'constraint' | 'command'
  scopeLabel: string
  instruction: string
  status: 'accepted' | 'partial' | 'deferred' | 'rejected' | 'superseded' | 'consumed'
  note: string
}

export type TopicGuidanceLatestApplication = {
  appliedAt: string
  stageIndex: number | null
  summary: string
  directives: TopicGuidanceLatestApplicationDirective[]
}

export type TopicGuidanceDirective = {
  id: string
  topicId: string
  sourceMessageId: string
  messageKind: 'ask' | 'suggest' | 'challenge' | 'focus' | 'style' | 'command'
  scopeType: 'topic' | 'stage' | 'node' | 'paper' | 'evidence'
  scopeId: string | null
  scopeLabel: string
  directiveType: 'suggest' | 'challenge' | 'focus' | 'style' | 'constraint' | 'command'
  instruction: string
  rationale: string
  effectSummary: string
  promptHint: string
  strength: 'soft' | 'strong'
  status: 'accepted' | 'partial' | 'deferred' | 'rejected' | 'superseded' | 'consumed'
  appliesToRuns: 'next-run' | 'until-cleared' | 'current-session'
  lastAppliedAt: string | null
  lastAppliedStageIndex: number | null
  lastAppliedSummary: string
  createdAt: string
  updatedAt: string
}

export type TopicGuidanceLedgerSummary = {
  activeDirectiveCount: number
  acceptedDirectiveCount: number
  deferredDirectiveCount: number
  latestDirective: string
  focusHeadline: string
  styleHeadline: string
  challengeHeadline: string
  latestAppliedSummary: string
  latestAppliedAt: string | null
  latestAppliedDirectiveCount: number
}

export type TopicGuidanceLedgerState = {
  schemaVersion: string
  topicId: string
  updatedAt: string | null
  directives: TopicGuidanceDirective[]
  latestApplication: TopicGuidanceLatestApplication | null
  summary: TopicGuidanceLedgerSummary
}

export type TopicExportStageDossier = {
  stageIndex: number
  title: string
  titleEn: string
  description: string
  branchLabel: string
  branchColor: string
  yearLabel: string
  dateLabel: string
  timeLabel: string
  stageThesis: string
  editorial: TopicStageEditorial
  nodeCount: number
  nodeIds: string[]
  pipeline: ResearchPipelineContextSummary
}

export type TopicResearchExportBundle = {
  schemaVersion: string
  exportedAt: string
  topic: TopicViewModel
  report: ResearchRunReport | null
  world: TopicResearchWorld
  guidance: TopicGuidanceLedgerState
  pipeline: {
    updatedAt: string | null
    overview: ResearchPipelineContextSummary
  }
  sessionMemory: TopicSessionMemoryContext
  stageDossiers: TopicExportStageDossier[]
  nodeDossiers: NodeViewModel[]
}

export type TopicResearchExportBatch = {
  schemaVersion: string
  exportedAt: string
  topicCount: number
  bundles: TopicResearchExportBundle[]
}

export type ResearchTaskConfig = {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
  topicId?: string
  action: 'discover' | 'refresh' | 'sync'
  researchMode?: ResearchMode
  options?: {
    stageDurationDays?: number
    durationHours?: number
    cycleDelayMs?: number
    stageIndex?: number
    maxIterations?: number
    stageRounds?: Array<{ stageIndex: number; rounds: number }>
  }
}

export type TopicResearchSessionState = {
  task: ResearchTaskConfig | null
  progress: ResearchTaskProgress | null
  report: ResearchRunReport | null
  active: boolean
  strategy: {
    cycleDelayMs: number
    stageStallLimit: number
    reportPasses: number
    currentStageStalls: number
  }
}

export type TopicResearchBrief = {
  topicId: string
  session: TopicResearchSessionState
  pipeline: ResearchPipelineContextSummary
  sessionMemory: TopicSessionMemoryContext
  world: TopicResearchWorld
  guidance: TopicGuidanceLedgerState
  cognitiveMemory: TopicCognitiveMemoryPack
}

export type TopicSessionMemoryEvent = {
  id: string
  kind:
    | 'chat-user'
    | 'chat-assistant'
    | 'research-cycle'
    | 'research-status'
    | 'guidance-application'
    | 'artifact-rebuild'
  headline: string
  summary: string
  detail?: string
  stageIndex?: number | null
  nodeIds?: string[]
  paperIds?: string[]
  citationAnchorIds?: string[]
  openQuestions?: string[]
  createdAt: string
}

export type TopicSessionMemorySummary = {
  currentFocus: string
  continuity: string
  establishedJudgments: string[]
  openQuestions: string[]
  researchMomentum: string[]
  conversationStyle: string
  lastResearchMove: string
  lastUserIntent: string
}

export type TopicSessionMemoryContext = {
  updatedAt: string | null
  initializedAt: string | null
  lastCompactedAt: string | null
  summary: TopicSessionMemorySummary
  recentEvents: TopicSessionMemoryEvent[]
}

export type WorkbenchMaterialKind = 'image' | 'pdf' | 'text'

export type WorkbenchMaterialStatus = 'parsing' | 'ready' | 'vision-only' | 'error'

export type WorkbenchMaterialSummary = {
  id: string
  kind: WorkbenchMaterialKind
  name: string
  mimeType: string
  summary: string
  highlights?: string[]
  status?: WorkbenchMaterialStatus
}

export type TopicChatWorkbenchPayload = {
  controls?: {
    responseStyle?: 'brief' | 'balanced' | 'deep'
    reasoningEnabled?: boolean
    retrievalEnabled?: boolean
  }
  contextItems?: string[]
  agentBrief?: string
  materials?: WorkbenchMaterialSummary[]
}

export type TopicCognitiveMemoryKind = 'project' | 'feedback' | 'reference'

export type TopicCognitiveMemorySource =
  | 'generation'
  | 'session'
  | 'guidance'
  | 'report'
  | 'world'

export type TopicCognitiveMemoryEntry = {
  id: string
  kind: TopicCognitiveMemoryKind
  title: string
  summary: string
  source: TopicCognitiveMemorySource
  updatedAt: string | null
}

export type TopicCognitiveMemoryPack = {
  focus: string
  continuity: string
  conversationContract: string
  projectMemories: TopicCognitiveMemoryEntry[]
  feedbackMemories: TopicCognitiveMemoryEntry[]
  referenceMemories: TopicCognitiveMemoryEntry[]
}

export type StoredChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  citations?: CitationRef[]
  suggestedActions?: SuggestedAction[]
  guidanceReceipt?: TopicGuidanceReceipt
  notice?: OmniIssue
  workbench?: Pick<TopicChatWorkbenchPayload, 'agentBrief' | 'materials'>
  createdAt: string
}

export type TopicNote = {
  id: string
  content: string
  updatedAt: string
}

export type StoredChatThread = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: StoredChatMessage[]
  draft?: string
}

export type EvidencePayload = {
  anchorId: string
  type: 'paper' | 'node' | 'figure' | 'table' | 'formula' | 'section'
  route: string
  title: string
  label: string
  quote: string
  content: string
  page?: number | null
  sourcePaperId?: string
  sourcePaperTitle?: string
  imagePath?: string | null
  whyItMatters?: string
  formulaLatex?: string | null
  tableHeaders?: string[]
  tableRows?: unknown[]
  placementHint?: string
  importance?: number
  thumbnailPath?: string | null
  metadata?: Record<string, unknown>
}

export type ProviderAuthChoice = {
  provider: ProviderId
  method: 'api-key' | 'oauth' | 'none'
  choiceId: string
  choiceLabel: string
  choiceHint?: string
  groupId: string
  groupLabel: string
  groupHint?: string
}

export type ProviderConfigSchema = {
  type: 'object'
  additionalProperties: boolean
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'json'
      title: string
      description?: string
      defaultValue?: string | number | boolean | Record<string, string> | null
      multiline?: boolean
    }
  >
}

export type ProviderContract = {
  taskSupport?: Partial<
    Record<
      | 'general_chat'
      | 'topic_chat'
      | 'topic_chat_vision'
      | 'topic_summary'
      | 'document_parse'
      | 'figure_analysis'
      | 'formula_recognition'
      | 'table_extraction'
      | 'evidence_explainer',
      'recommended' | 'supported' | 'limited'
    >
  >
  preferredSlots?: Partial<
    Record<
      | 'general_chat'
      | 'topic_chat'
      | 'topic_chat_vision'
      | 'topic_summary'
      | 'document_parse'
      | 'figure_analysis'
      | 'formula_recognition'
      | 'table_extraction'
      | 'evidence_explainer',
      'language' | 'multimodal'
    >
  >
}

export type OmniIssue = {
  code: 'missing_key' | 'invalid_key' | 'provider_error'
  title: string
  message: string
  provider?: ProviderId | 'backend'
  model?: string
  slot?: 'language' | 'multimodal'
}

export type ModelConfigResponse = {
  userId: string
  config: {
    language: SanitizedProviderModelConfig | null
    multimodal: SanitizedProviderModelConfig | null
    roles?: Partial<Record<ResearchRoleId, SanitizedProviderModelConfig | null>>
    taskOverrides?: Partial<Record<string, ProviderModelRef>>
    taskRouting?: Partial<Record<string, TaskRouteTarget>>
  }
  roleDefinitions?: Array<{
    id: ResearchRoleId
    label: string
    description: string
    preferredSlot: 'language' | 'multimodal'
    defaultTasks: string[]
  }>
  routing?: Record<
    string,
    {
      target: TaskRouteTarget
      defaultTarget: TaskRouteTarget
    }
  >
  catalog: Array<{
    provider: ProviderId
    label: string
    baseUrl: string
    adapter: 'openai-compatible' | 'anthropic' | 'google'
    providerAuthEnvVars: string[]
    providerAuthChoices: ProviderAuthChoice[]
    configFields?: ProviderConfigField[]
    configSchema?: ProviderConfigSchema
    uiHints?: ProviderUiHints
    contracts?: ProviderContract
    models: Array<{
      id: string
      label: string
      slot: 'language' | 'multimodal' | 'both'
      capabilities: ProviderCapability
      recommended?: boolean
      description?: string
    }>
  }>
  presets: Array<{
    id: string
    label: string
    description: string
    language: ProviderModelRef
    multimodal: ProviderModelRef
  }>
}

export type ModelCapabilitySummary = {
  userId: string
  slots: {
    language: {
      configured: boolean
      provider: ProviderId | null
      model: string | null
      capability: ProviderCapability | null
      apiKeyStatus: 'configured' | 'missing'
    }
    multimodal: {
      configured: boolean
      provider: ProviderId | null
      model: string | null
      capability: ProviderCapability | null
      apiKeyStatus: 'configured' | 'missing'
    }
  }
  roles?: Record<
    ResearchRoleId,
    {
      configured: boolean
      source: 'role' | 'default-language' | 'default-multimodal' | 'missing'
      provider: ProviderId | null
      model: string | null
      capability: ProviderCapability | null
      apiKeyStatus: 'configured' | 'missing'
      preferredSlot: 'language' | 'multimodal'
      defaultTasks: string[]
      label: string
      description: string
    }
  >
  routing?: Record<
    string,
    {
      target: TaskRouteTarget
      defaultTarget: TaskRouteTarget
    }
  >
  roleDefinitions?: Array<{
    id: ResearchRoleId
    label: string
    description: string
    preferredSlot: 'language' | 'multimodal'
    defaultTasks: string[]
  }>
}

export type ModelConfigSaveResponse = {
  userId: string
  config: {
    language: SanitizedProviderModelConfig | null
    multimodal: SanitizedProviderModelConfig | null
    roles?: Partial<Record<ResearchRoleId, SanitizedProviderModelConfig | null>>
    taskOverrides?: Partial<Record<string, ProviderModelRef>>
    taskRouting?: Partial<Record<string, TaskRouteTarget>>
  }
  slots: ModelCapabilitySummary['slots']
  roles?: ModelCapabilitySummary['roles']
  routing?: ModelCapabilitySummary['routing']
  validationIssues?: OmniIssue[]
}
