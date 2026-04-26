import type {
  EvidencePayload,
  ExternalAgentAssetRecord,
  ModelCapabilitySummary,
  ModelConfigResponse,
  ModelConfigSaveResponse,
  NodeViewModel,
  PaperViewModel,
  ProductCopyRecord,
  PromptLanguageOption,
  PromptStudioBundle,
  PromptTemplateRecord,
  ResearchMode,
  ResearchPipelineContextSummary,
  ResearchTaskConfig,
  ResearchTaskProgress,
  SearchResponse,
  StageLocaleMap,
  TopicExportStageDossier,
  TopicGraphLane,
  TopicGraphNode,
  TopicChatResponse,
  TopicLocalizationPayload,
  TopicNodeCard,
  TopicResearchExportBatch,
  TopicResearchExportBundle,
  TopicResearchBrief,
  TopicResearchSessionState,
  TopicViewModel,
  GenerationRuntimeConfig,
} from '@/types/alpha'
import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import type {
  ModelPreset,
  ProviderCapability,
  ProviderCatalogEntry,
  ProviderConfigField,
  ProviderModelRef,
  ProviderUiHints,
  SanitizedProviderModelConfig,
  SanitizedUserModelConfig,
} from '@/types/config'

export type BackendTopicListItem = {
  id: string
  nameZh: string
  nameEn?: string | null
  focusLabel?: string | null
  summary?: string | null
  createdAt?: string
  localization?: TopicLocalizationPayload | null
}

export type TopicNodePickerItem = {
  id: string
  stageIndex: number
  nodeLabel: string
  nodeSubtitle?: string
}

const SEARCH_RESULT_KINDS = ['topic', 'node', 'paper', 'section', 'figure', 'table', 'formula'] as const
const SEARCH_GROUP_KINDS = ['topic', 'node', 'paper', 'evidence'] as const
const SUGGESTED_ACTION_KINDS = ['explain', 'compare', 'summarize', 'navigate', 'show_evidence'] as const
const CITATION_TYPES = ['paper', 'node', 'figure', 'table', 'formula', 'section'] as const
const GUIDANCE_CLASSIFICATIONS = ['ask', 'suggest', 'challenge', 'focus', 'style', 'command'] as const
const GUIDANCE_DIRECTIVE_TYPES = ['suggest', 'challenge', 'focus', 'style', 'constraint', 'command'] as const
const GUIDANCE_STATUSES = ['accepted', 'partial', 'deferred', 'rejected', 'superseded', 'consumed', 'none'] as const
const GUIDANCE_WINDOWS = ['next-run', 'until-cleared', 'current-session', 'none'] as const
const WORKBENCH_ACTION_KINDS = [
  'start-research',
  'stop-research',
  'export-dossier',
  'export-highlights',
  'export-notes',
] as const
const WORKBENCH_TABS = ['assistant', 'research'] as const
const RESEARCH_VIEWS = ['search', 'references', 'resources'] as const
const LANE_SIDES = ['left', 'center', 'right'] as const
const NODE_EMPHASIS = ['primary', 'merge', 'branch'] as const
const ARTICLE_SECTION_KINDS = [
  'lead',
  'paper-pass',
  'comparison',
  'evidence',
  'figure',
  'table',
  'formula',
  'critique',
  'closing',
] as const
const ARTICLE_FLOW_TRANSITION_TYPES = [
  'method-evolution',
  'problem-shift',
  'scale-up',
  'scope-broaden',
  'complementary',
] as const
const RESOURCE_KINDS = ['stage', 'node', 'paper'] as const
const NODE_EVIDENCE_TYPES = ['section', 'figure', 'table', 'formula'] as const
const NODE_PROBLEM_STATUSES = ['solved', 'partial', 'open'] as const
const RESEARCH_CONFIDENCE = ['high', 'medium', 'low', 'speculative'] as const
const RESEARCH_MODES = ['stage-rounds', 'duration'] as const
const RESEARCH_PROGRESS_STATUSES = ['active', 'paused', 'completed', 'failed'] as const
const RESEARCH_RUN_STATUSES = ['running', 'completed', 'failed', 'paused'] as const
const RESEARCH_TRIGGERS = ['manual', 'scheduled'] as const
const RESEARCH_NODE_ACTIONS = ['create', 'update', 'merge', 'strengthen'] as const
const RESEARCH_DURATION_ACTIONS = ['stay', 'advance', 'cycle-reset'] as const
const RESEARCH_DURATION_REASONS = [
  'orchestration',
  'stall-limit',
  'progress-made',
  'await-more-evidence',
] as const
const RESEARCH_WORLD_CLAIM_STATUSES = ['accepted', 'contested', 'rejected', 'superseded'] as const
const RESEARCH_WORLD_PRIORITIES = ['critical', 'important', 'follow-up'] as const
const RESEARCH_WORLD_AGENDA_KINDS = [
  'resolve-question',
  'repair-critique',
  'stabilize-node',
  're-evaluate-stage',
  'pick-node-figure',
  'strengthen-node-evidence',
] as const
const RESEARCH_WORLD_MATURITY = ['nascent', 'forming', 'stable', 'contested'] as const
const RESEARCH_WORLD_STAGE_STATUSES = ['forming', 'stable', 'contested'] as const
const RESEARCH_WORLD_SCOPE_TYPES = ['topic', 'stage', 'node', 'paper'] as const
const RESEARCH_WORLD_CLAIM_KINDS = ['finding', 'mechanism', 'comparison', 'limitation'] as const
const RESEARCH_WORLD_SOURCES = ['judgment', 'report', 'session'] as const
const RESEARCH_WORLD_QUESTION_SOURCES = ['judgment', 'report', 'pipeline', 'session'] as const
const RESEARCH_WORLD_CRITIQUE_TARGETS = ['topic', 'stage', 'node', 'paper', 'claim'] as const
const RESEARCH_WORLD_CRITIQUE_SEVERITIES = ['high', 'medium', 'low'] as const
const SESSION_MEMORY_EVENT_KINDS = [
  'chat-user',
  'chat-assistant',
  'research-cycle',
  'research-status',
  'guidance-application',
  'artifact-rebuild',
] as const
const GUIDANCE_STRENGTHS = ['soft', 'strong'] as const
const GUIDANCE_SCOPE_TYPES = ['topic', 'stage', 'node', 'paper', 'evidence'] as const
const COGNITIVE_MEMORY_KINDS = ['project', 'feedback', 'reference'] as const
const COGNITIVE_MEMORY_SOURCES = [
  'generation',
  'session',
  'guidance',
  'report',
  'world',
] as const
const RESEARCH_ACTIONS = ['discover', 'refresh', 'sync'] as const
const PROVIDER_ADAPTERS = ['openai-compatible', 'anthropic', 'google'] as const
const MODEL_SLOTS = ['language', 'multimodal', 'both'] as const
const API_KEY_STATUSES = ['configured', 'missing'] as const
const HEALTH_STATUSES = ['ok', 'error'] as const
const PROMPT_LANGUAGE_CODES = ['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru'] as const
const PROMPT_FAMILIES = ['topic', 'article', 'evidence', 'visual'] as const
const ASSET_FORMATS = ['markdown', 'json'] as const
const EXTERNAL_AGENT_ASSET_IDS = ['readme', 'promptGuide', 'superPrompt', 'configExample'] as const

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertContract(isRecord(value), message)
}

function assertOwnProperty(value: Record<string, unknown>, key: string, message: string) {
  assertContract(Object.prototype.hasOwnProperty.call(value, key), message)
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  assertContract(Array.isArray(value), message)
}

function assertString(
  value: unknown,
  message: string,
  options: { allowEmpty?: boolean } = {},
): asserts value is string {
  assertContract(typeof value === 'string', message)
  if (!options.allowEmpty) {
    assertContract(value.trim().length > 0, message)
  }
}

function assertOptionalString(
  value: unknown,
  message: string,
  options: { allowEmpty?: boolean } = {},
) {
  if (value == null) return
  assertString(value, message, options)
}

function assertNodePickerItem(
  value: unknown,
  message: string,
): asserts value is TopicNodePickerItem {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertNumber(value.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
  assertString(value.nodeLabel, `${message} is missing "nodeLabel".`)
  assertOptionalString(value.nodeSubtitle, `${message} has an invalid "nodeSubtitle".`, {
    allowEmpty: true,
  })
}

function assertBoolean(value: unknown, message: string): asserts value is boolean {
  assertContract(typeof value === 'boolean', message)
}

function assertNumber(
  value: unknown,
  message: string,
  options: { integer?: boolean; min?: number } = {},
): asserts value is number {
  assertContract(typeof value === 'number' && Number.isFinite(value), message)
  if (options.integer) {
    assertContract(Number.isInteger(value), message)
  }
  if (typeof options.min === 'number') {
    assertContract(value >= options.min, message)
  }
}

function assertStringArray(
  value: unknown,
  message: string,
  options: { allowEmptyStrings?: boolean } = {},
): asserts value is string[] {
  assertArray(value, message)
  value.forEach((item, index) =>
    assertString(
      item,
      `${message} (item ${index + 1})`,
      options.allowEmptyStrings ? { allowEmpty: true } : undefined,
    ),
  )
}

function assertOneOf<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
  message: string,
): asserts value is TAllowed[number] {
  assertString(value, message)
  assertContract(allowed.includes(value as TAllowed[number]), message)
}

function collectUniqueIds(items: Iterable<string>, message: (id: string) => string) {
  const seen = new Set<string>()
  for (const item of items) {
    assertContract(!seen.has(item), message(item))
    seen.add(item)
  }
  return seen
}

function assertFacetEntry(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.value, `${message} is missing "value".`)
  assertString(value.label, `${message} is missing "label".`)
  assertNumber(value.count, `${message} is missing "count".`, { integer: true, min: 0 })
}

function assertSearchResultItem(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.kind, SEARCH_RESULT_KINDS, `${message} has an unsupported "kind".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.subtitle, `${message} is missing "subtitle".`, { allowEmpty: true })
  assertString(value.excerpt, `${message} is missing "excerpt".`, { allowEmpty: true })
  assertString(value.route, `${message} is missing "route".`)
  assertStringArray(value.tags, `${message} is missing "tags".`, { allowEmptyStrings: true })
  assertStringArray(
    value.matchedFields,
    `${message} is missing "matchedFields".`,
    { allowEmptyStrings: true },
  )
  assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, { allowEmpty: true })
  assertOptionalString(value.topicId, `${message} has an invalid "topicId".`, { allowEmpty: true })
  assertOptionalString(value.topicTitle, `${message} has an invalid "topicTitle".`, { allowEmpty: true })
  assertOptionalString(value.stageLabel, `${message} has an invalid "stageLabel".`, { allowEmpty: true })
  assertOptionalString(value.timeLabel, `${message} has an invalid "timeLabel".`, { allowEmpty: true })
  assertOptionalString(value.nodeId, `${message} has an invalid "nodeId".`, { allowEmpty: true })
  assertOptionalString(value.nodeTitle, `${message} has an invalid "nodeTitle".`, { allowEmpty: true })
  assertOptionalString(value.nodeRoute, `${message} has an invalid "nodeRoute".`, { allowEmpty: true })
  assertOptionalString(value.locationLabel, `${message} has an invalid "locationLabel".`, { allowEmpty: true })

  if (value.relatedNodes != null) {
    assertArray(value.relatedNodes, `${message} has an invalid "relatedNodes" collection.`)
    value.relatedNodes.forEach((entry, index) => {
      assertRecord(entry, `${message} related node ${index + 1} is invalid.`)
      assertString(entry.nodeId, `${message} related node ${index + 1} is missing "nodeId".`)
      assertString(entry.title, `${message} related node ${index + 1} is missing "title".`)
      const normalizedStageIndex =
        typeof entry.stageIndex === 'number'
          ? entry.stageIndex
          : Number.isFinite(Number(entry.stageIndex))
            ? Number(entry.stageIndex)
            : 0
      entry.stageIndex = normalizedStageIndex
      assertNumber(
        entry.stageIndex,
        `${message} related node ${index + 1} is missing "stageIndex".`,
        { integer: true, min: 0 },
      )
      assertOptionalString(
        entry.stageLabel,
        `${message} related node ${index + 1} has an invalid "stageLabel".`,
        { allowEmpty: true },
      )
      assertString(entry.route, `${message} related node ${index + 1} is missing "route".`)
    })
  }
}

export function assertEvidencePayloadContract(
  value: unknown,
): asserts value is EvidencePayload {
  assertRecord(value, 'Evidence payload is unavailable from the backend contract.')
  assertString(value.anchorId, 'Evidence payload is missing "anchorId".')
  assertOneOf(value.type, CITATION_TYPES, 'Evidence payload has an unsupported "type".')
  assertContract(
    value.anchorId.startsWith(`${value.type}:`),
    `Evidence payload anchorId "${value.anchorId}" does not match type "${value.type}".`,
  )
  assertString(value.route, 'Evidence payload is missing "route".')
  assertString(value.title, 'Evidence payload is missing "title".')
  assertString(value.label, 'Evidence payload is missing "label".')
  assertString(value.quote, 'Evidence payload is missing "quote".', { allowEmpty: true })
  assertString(value.content, 'Evidence payload is missing "content".', { allowEmpty: true })
  if (value.page != null) {
    assertNumber(value.page, 'Evidence payload has an invalid "page".', { integer: true, min: 0 })
  }
  assertOptionalString(value.sourcePaperId, 'Evidence payload has an invalid "sourcePaperId".')
  assertOptionalString(value.sourcePaperTitle, 'Evidence payload has an invalid "sourcePaperTitle".', {
    allowEmpty: true,
  })
  assertOptionalString(value.imagePath, 'Evidence payload has an invalid "imagePath".')
  assertOptionalString(
    value.whyItMatters,
    'Evidence payload has an invalid "whyItMatters".',
    { allowEmpty: true },
  )
  assertOptionalString(value.formulaLatex, 'Evidence payload has an invalid "formulaLatex".', {
    allowEmpty: true,
  })
  if (value.tableHeaders != null) {
    assertStringArray(value.tableHeaders, 'Evidence payload has an invalid "tableHeaders".', {
      allowEmptyStrings: true,
    })
  }
  if (value.tableRows != null) {
    assertArray(value.tableRows, 'Evidence payload has an invalid "tableRows".')
  }
  assertOptionalString(
    value.placementHint,
    'Evidence payload has an invalid "placementHint".',
    { allowEmpty: true },
  )
  if (value.importance != null) {
    assertNumber(value.importance, 'Evidence payload has an invalid "importance".', { min: 0 })
  }
  assertOptionalString(value.thumbnailPath, 'Evidence payload has an invalid "thumbnailPath".')
  if (value.metadata != null) {
    assertRecord(value.metadata, 'Evidence payload has an invalid "metadata".')
  }
}

function assertSearchGroup(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(value.group, SEARCH_GROUP_KINDS, `${message} has an unsupported "group".`)
  assertString(value.label, `${message} is missing "label".`)
  assertArray(value.items, `${message} is missing "items".`)
  value.items.forEach((item, index) =>
    assertSearchResultItem(item, `${message} item ${index + 1}`),
  )
}

function assertTopicCardEditorial(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.eyebrow, `${message} is missing "eyebrow".`)
  assertString(value.digest, `${message} is missing "digest".`)
  assertString(value.whyNow, `${message} is missing "whyNow".`)
  assertString(value.nextQuestion, `${message} is missing "nextQuestion".`)
}

function assertTopicStageEditorial(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.kicker, `${message} is missing "kicker".`)
  assertString(value.summary, `${message} is missing "summary".`)
  assertString(value.transition, `${message} is missing "transition".`)
}

function assertPaperEntry(
  value: unknown,
  message: string,
): asserts value is TopicViewModel['papers'][number] {
  assertRecord(value, message)
  assertString(value.paperId, `${message} is missing "paperId".`)
  assertString(value.anchorId, `${message} is missing "anchorId".`)
  assertString(value.route, `${message} is missing "route".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.titleEn, `${message} is missing "titleEn".`)
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertString(value.explanation, `${message} is missing "explanation".`, { allowEmpty: true })
  assertString(value.publishedAt, `${message} is missing "publishedAt".`)
  assertStringArray(value.authors, `${message} is missing "authors".`, { allowEmptyStrings: true })
  if (value.citationCount != null) {
    assertNumber(value.citationCount, `${message} has an invalid "citationCount".`, {
      integer: true,
      min: 0,
    })
  }
  assertNumber(value.figuresCount, `${message} is missing "figuresCount".`, { integer: true, min: 0 })
  assertNumber(value.tablesCount, `${message} is missing "tablesCount".`, { integer: true, min: 0 })
  assertNumber(value.formulasCount, `${message} is missing "formulasCount".`, { integer: true, min: 0 })
  assertNumber(value.sectionsCount, `${message} is missing "sectionsCount".`, { integer: true, min: 0 })
  assertContract(
    value.coverImage == null || typeof value.coverImage === 'string',
    `${message} has an invalid "coverImage".`,
  )
  assertOptionalString(value.originalUrl, `${message} has an invalid "originalUrl".`, { allowEmpty: true })
  assertOptionalString(value.pdfUrl, `${message} has an invalid "pdfUrl".`, { allowEmpty: true })
}

function assertResourceEntry(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.kind, RESOURCE_KINDS, `${message} has an unsupported "kind".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.subtitle, `${message} is missing "subtitle".`, { allowEmpty: true })
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertString(value.route, `${message} is missing "route".`)
  assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, { allowEmpty: true })
}

function assertTopicNodeCard(value: unknown, message: string): asserts value is TopicNodeCard {
  assertRecord(value, message)
  const record = value as Record<string, unknown>
  if (record['figureCount'] == null) record['figureCount'] = 0
  if (record['tableCount'] == null) record['tableCount'] = 0
  if (record['formulaCount'] == null) record['formulaCount'] = 0
  if (record['evidenceCount'] == null) {
    record['evidenceCount'] =
      (typeof record['figureCount'] === 'number' ? record['figureCount'] : 0) +
      (typeof record['tableCount'] === 'number' ? record['tableCount'] : 0) +
      (typeof record['formulaCount'] === 'number' ? record['formulaCount'] : 0)
  }
  assertString(value.nodeId, `${message} is missing "nodeId".`)
  assertString(value.anchorId, `${message} is missing "anchorId".`)
  assertString(value.route, `${message} is missing "route".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.titleEn, `${message} is missing "titleEn".`)
  assertString(value.subtitle, `${message} is missing "subtitle".`, { allowEmpty: true })
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertString(value.explanation, `${message} is missing "explanation".`, { allowEmpty: true })
  assertNumber(value.paperCount, `${message} is missing "paperCount".`, { integer: true, min: 0 })
  assertNumber(value.figureCount, `${message} is missing "figureCount".`, { integer: true, min: 0 })
  assertNumber(value.tableCount, `${message} is missing "tableCount".`, { integer: true, min: 0 })
  assertNumber(value.formulaCount, `${message} is missing "formulaCount".`, { integer: true, min: 0 })
  assertNumber(value.evidenceCount, `${message} is missing "evidenceCount".`, { integer: true, min: 0 })
  assertStringArray(value.paperIds, `${message} is missing "paperIds".`)
  assertContract(value.paperIds.length > 0, `${message} must include at least one "paperId".`)
  assertString(value.primaryPaperTitle, `${message} is missing "primaryPaperTitle".`)
  assertString(value.primaryPaperId, `${message} is missing "primaryPaperId".`)
  assertContract(
    value.paperIds.includes(value.primaryPaperId),
    `${message} must include its "primaryPaperId" inside "paperIds".`,
  )
  assertContract(
    value.coverImage == null || typeof value.coverImage === 'string',
    `${message} has an invalid "coverImage".`,
  )
  assertBoolean(value.isMergeNode, `${message} is missing "isMergeNode".`)
  assertBoolean(value.provisional, `${message} is missing "provisional".`)
  assertString(value.updatedAt, `${message} is missing "updatedAt".`)
  assertString(value.branchLabel, `${message} is missing "branchLabel".`)
  assertString(value.branchColor, `${message} is missing "branchColor".`)
  assertTopicCardEditorial(value.editorial, `${message} editorial`)
}

function assertTopicGraphLane(value: unknown, message: string): asserts value is TopicGraphLane {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertNumber(value.laneIndex, `${message} is missing "laneIndex".`, { integer: true })
  if (value.branchIndex != null) {
    assertNumber(value.branchIndex, `${message} has an invalid "branchIndex".`, {
      integer: true,
      min: 0,
    })
  }
  assertBoolean(value.isMainline, `${message} is missing "isMainline".`)
  assertOneOf(value.side, LANE_SIDES, `${message} has an unsupported "side".`)
  assertString(value.color, `${message} is missing "color".`)
  assertString(value.roleLabel, `${message} is missing "roleLabel".`)
  assertString(value.label, `${message} is missing "label".`)
  assertString(value.labelEn, `${message} is missing "labelEn".`)
  assertString(value.legendLabel, `${message} is missing "legendLabel".`)
  assertString(value.legendLabelEn, `${message} is missing "legendLabelEn".`)
  assertString(value.description, `${message} is missing "description".`)
  assertString(value.periodLabel, `${message} is missing "periodLabel".`)
  assertNumber(value.nodeCount, `${message} is missing "nodeCount".`, { integer: true, min: 0 })
  assertNumber(value.stageCount, `${message} is missing "stageCount".`, { integer: true, min: 0 })
  assertString(value.latestNodeId, `${message} is missing "latestNodeId".`)
  assertString(value.latestAnchorId, `${message} is missing "latestAnchorId".`)
}

function assertTopicGraphNode(
  value: unknown,
  message: string,
  stageIndexes: Set<number>,
  laneIndexes: Set<number>,
  paperIds: Set<string>,
): asserts value is TopicGraphNode {
  assertTopicNodeCard(value, message)
  assertRecord(value, message)
  const graphNode = value as TopicGraphNode
  assertNumber(graphNode.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
  assertContract(
    stageIndexes.has(graphNode.stageIndex),
    `${message} references stage ${String(graphNode.stageIndex)}, but the backend timeline does not contain that stage.`,
  )
  assertString(graphNode.branchPathId, `${message} is missing "branchPathId".`)
  assertStringArray(graphNode.parentNodeIds, `${message} is missing "parentNodeIds".`, {
    allowEmptyStrings: true,
  })
  assertString(graphNode.timeLabel, `${message} is missing "timeLabel".`)
  assertRecord(graphNode.layoutHint, `${message} is missing "layoutHint".`)
  assertNumber(graphNode.layoutHint.column, `${message} layout is missing "column".`, {
    integer: true,
    min: 1,
  })
  assertNumber(graphNode.layoutHint.span, `${message} layout is missing "span".`, {
    integer: true,
    min: 1,
  })
  assertNumber(graphNode.layoutHint.row, `${message} layout is missing "row".`, {
    integer: true,
    min: 1,
  })
  assertOneOf(
    graphNode.layoutHint.emphasis,
    NODE_EMPHASIS,
    `${message} layout has an unsupported "emphasis".`,
  )
  assertNumber(graphNode.layoutHint.laneIndex, `${message} layout is missing "laneIndex".`, {
    integer: true,
  })
  assertContract(
    laneIndexes.has(graphNode.layoutHint.laneIndex),
    `${message} references lane ${String(graphNode.layoutHint.laneIndex)}, but the backend lane list does not contain that lane.`,
  )
  if (graphNode.layoutHint.branchIndex != null) {
    assertNumber(
      graphNode.layoutHint.branchIndex,
      `${message} layout has an invalid "branchIndex".`,
      { integer: true, min: 0 },
    )
  }
  assertBoolean(graphNode.layoutHint.isMainline, `${message} layout is missing "isMainline".`)
  assertOneOf(graphNode.layoutHint.side, LANE_SIDES, `${message} layout has an unsupported "side".`)
  assertRecord(graphNode.coverAsset, `${message} is missing "coverAsset".`)
  assertContract(
    graphNode.coverAsset.imagePath == null || typeof graphNode.coverAsset.imagePath === 'string',
    `${message} coverAsset has an invalid "imagePath".`,
  )
  assertString(graphNode.coverAsset.alt, `${message} coverAsset is missing "alt".`)
  assertOneOf(
    graphNode.coverAsset.source,
    ['paper-cover', 'node-cover', 'generated-brief'] as const,
    `${message} coverAsset has an unsupported "source".`,
  )
  assertTopicCardEditorial(graphNode.cardEditorial, `${message} cardEditorial`)

  graphNode.paperIds.forEach((paperId, index) =>
    assertContract(
      paperIds.has(paperId),
      `${message} references paper "${paperId}" at index ${index + 1}, but that paper is missing from the backend contract.`,
    ),
  )
}

function assertCitations(value: unknown, message: string) {
  assertArray(value, message)
  value.forEach((citation, index) => {
    assertRecord(citation, `${message} item ${index + 1} is invalid.`)
    assertString(citation.anchorId, `${message} item ${index + 1} is missing "anchorId".`)
    assertOneOf(
      citation.type,
      CITATION_TYPES,
      `${message} item ${index + 1} has an unsupported "type".`,
    )
    assertString(citation.route, `${message} item ${index + 1} is missing "route".`)
    assertString(citation.label, `${message} item ${index + 1} is missing "label".`)
    assertString(citation.quote, `${message} item ${index + 1} is missing "quote".`, {
      allowEmpty: true,
    })
  })
}

function assertEvidenceExplanation(
  value: unknown,
  message: string,
  sourcePaperIds?: Set<string>,
) {
  assertRecord(value, message)
  assertString(value.anchorId, `${message} is missing "anchorId".`)
  assertOneOf(value.type, NODE_EVIDENCE_TYPES, `${message} has an unsupported "type".`)
  assertString(value.route, `${message} is missing "route".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.label, `${message} is missing "label".`)
  assertString(value.quote, `${message} is missing "quote".`, { allowEmpty: true })
  assertString(value.content, `${message} is missing "content".`, { allowEmpty: true })
  assertContract(
    value.page == null || (typeof value.page === 'number' && Number.isFinite(value.page) && value.page >= 0),
    `${message} has an invalid "page".`,
  )
  assertOptionalString(value.sourcePaperId, `${message} has an invalid "sourcePaperId".`)
  if (sourcePaperIds && value.sourcePaperId) {
    assertContract(
      sourcePaperIds.has(value.sourcePaperId as string),
      `${message} references missing paper "${value.sourcePaperId}".`,
    )
  }
  assertOptionalString(value.sourcePaperTitle, `${message} has an invalid "sourcePaperTitle".`, {
    allowEmpty: true,
  })
  assertContract(
    value.imagePath == null || typeof value.imagePath === 'string',
    `${message} has an invalid "imagePath".`,
  )
  assertOptionalString(value.whyItMatters, `${message} has an invalid "whyItMatters".`, {
    allowEmpty: true,
  })
  assertContract(
    value.formulaLatex == null || typeof value.formulaLatex === 'string',
    `${message} has an invalid "formulaLatex".`,
  )
  if (value.tableHeaders != null) {
    assertStringArray(value.tableHeaders, `${message} has an invalid "tableHeaders".`, {
      allowEmptyStrings: true,
    })
  }
  if (value.tableRows != null) {
    assertArray(value.tableRows, `${message} has an invalid "tableRows".`)
  }
  assertOptionalString(value.explanation, `${message} has an invalid "explanation".`, {
    allowEmpty: true,
  })
  if (value.importance != null) {
    assertNumber(value.importance, `${message} has an invalid "importance".`, { min: 0 })
  }
  assertOptionalString(value.placementHint, `${message} has an invalid "placementHint".`, {
    allowEmpty: true,
  })
  assertContract(
    value.thumbnailPath == null || typeof value.thumbnailPath === 'string',
    `${message} has an invalid "thumbnailPath".`,
  )
}

function assertReviewerCritique(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertStringArray(value.bullets, `${message} is missing "bullets".`, { allowEmptyStrings: true })
}

function assertArticleSection(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.kind, ARTICLE_SECTION_KINDS, `${message} has an unsupported "kind".`)
  assertString(value.title, `${message} is missing "title".`)
  assertStringArray(value.body, `${message} is missing "body".`, { allowEmptyStrings: true })
  assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, { allowEmpty: true })
  assertOptionalString(value.paperId, `${message} has an invalid "paperId".`, { allowEmpty: true })
  assertOptionalString(value.paperTitle, `${message} has an invalid "paperTitle".`, { allowEmpty: true })
  if (value.evidenceIds != null) {
    assertStringArray(value.evidenceIds, `${message} has an invalid "evidenceIds".`, {
      allowEmptyStrings: true,
    })
  }
}

function assertArticleFlowBlock(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(
    value.type,
    ['text', 'paper-break', 'comparison', 'figure', 'table', 'formula', 'critique', 'closing', 'paper-transition'] as const,
    `${message} has an unsupported "type".`,
  )

  switch (value.type) {
    case 'text':
      assertOptionalString(value.title, `${message} has an invalid "title".`, { allowEmpty: true })
      assertStringArray(value.body, `${message} is missing "body".`, { allowEmptyStrings: true })
      assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, { allowEmpty: true })
      assertOptionalString(value.paperId, `${message} has an invalid "paperId".`, { allowEmpty: true })
      assertOptionalString(value.paperTitle, `${message} has an invalid "paperTitle".`, {
        allowEmpty: true,
      })
      return
    case 'paper-break':
      assertString(value.paperId, `${message} is missing "paperId".`)
      assertString(value.title, `${message} is missing "title".`)
      assertOptionalString(value.titleEn, `${message} has an invalid "titleEn".`, { allowEmpty: true })
      assertString(value.role, `${message} is missing "role".`)
      assertString(value.contribution, `${message} is missing "contribution".`)
      assertString(value.route, `${message} is missing "route".`)
      assertOptionalString(value.publishedAt, `${message} has an invalid "publishedAt".`, {
        allowEmpty: true,
      })
      assertOptionalString(value.originalUrl, `${message} has an invalid "originalUrl".`, {
        allowEmpty: true,
      })
      assertOptionalString(value.pdfUrl, `${message} has an invalid "pdfUrl".`, { allowEmpty: true })
      return
    case 'comparison':
      assertString(value.title, `${message} is missing "title".`)
      assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
      assertArray(value.points, `${message} is missing "points".`)
      value.points.forEach((point, index) => {
        assertRecord(point, `${message} point ${index + 1} is invalid.`)
        assertString(point.label, `${message} point ${index + 1} is missing "label".`)
        assertString(point.detail, `${message} point ${index + 1} is missing "detail".`, {
          allowEmpty: true,
        })
      })
      return
    case 'figure':
    case 'table':
    case 'formula':
      assertEvidenceExplanation(value.evidence, `${message} evidence`)
      return
    case 'critique':
      assertString(value.title, `${message} is missing "title".`)
      assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
      assertStringArray(value.bullets, `${message} is missing "bullets".`, {
        allowEmptyStrings: true,
      })
      return
    case 'closing':
      assertOptionalString(value.title, `${message} has an invalid "title".`, { allowEmpty: true })
      assertStringArray(value.body, `${message} is missing "body".`, { allowEmptyStrings: true })
      return
    case 'paper-transition':
      assertString(value.fromPaperId, `${message} is missing "fromPaperId".`)
      assertString(value.fromPaperTitle, `${message} is missing "fromPaperTitle".`)
      assertString(value.toPaperId, `${message} is missing "toPaperId".`)
      assertString(value.toPaperTitle, `${message} is missing "toPaperTitle".`)
      assertString(value.content, `${message} is missing "content".`, { allowEmpty: true })
      assertOneOf(
        value.transitionType,
        ARTICLE_FLOW_TRANSITION_TYPES,
        `${message} has an unsupported "transitionType".`,
      )
      assertString(value.anchorId, `${message} is missing "anchorId".`)
      return
  }
}

function assertCrossPaperComparisonBlock(
  value: unknown,
  message: string,
  paperIds?: Set<string>,
) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertArray(value.papers, `${message} is missing "papers".`)
  value.papers.forEach((paper, index) => {
    assertRecord(paper, `${message} paper ${index + 1} is invalid.`)
    assertString(paper.paperId, `${message} paper ${index + 1} is missing "paperId".`)
    if (paperIds) {
      assertContract(
        paperIds.has(paper.paperId),
        `${message} paper ${index + 1} references missing paper "${paper.paperId}".`,
      )
    }
    assertString(paper.title, `${message} paper ${index + 1} is missing "title".`)
    assertString(paper.route, `${message} paper ${index + 1} is missing "route".`)
    assertString(paper.role, `${message} paper ${index + 1} is missing "role".`)
  })
  assertArray(value.points, `${message} is missing "points".`)
  value.points.forEach((point, index) => {
    assertRecord(point, `${message} point ${index + 1} is invalid.`)
    assertString(point.label, `${message} point ${index + 1} is missing "label".`)
    assertString(point.detail, `${message} point ${index + 1} is missing "detail".`, {
      allowEmpty: true,
    })
  })
}

function assertSuggestedActions(value: unknown, message: string) {
  assertArray(value, message)
  value.forEach((action, index) => {
    assertRecord(action, `${message} item ${index + 1} is invalid.`)
    assertString(action.label, `${message} item ${index + 1} is missing "label".`)
    assertOneOf(
      action.action,
      SUGGESTED_ACTION_KINDS,
      `${message} item ${index + 1} has an unsupported "action".`,
    )
    assertOptionalString(
      action.targetId,
      `${message} item ${index + 1} has an invalid "targetId".`,
      { allowEmpty: true },
    )
    assertOptionalString(
      action.description,
      `${message} item ${index + 1} has an invalid "description".`,
      { allowEmpty: true },
    )
  })
}

function assertGuidanceReceipt(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(
    value.classification,
    GUIDANCE_CLASSIFICATIONS,
    `${message} has an unsupported "classification".`,
  )
  if (value.directiveId != null) {
    assertString(value.directiveId, `${message} has an invalid "directiveId".`)
  }
  if (value.directiveType != null) {
    assertOneOf(
      value.directiveType,
      GUIDANCE_DIRECTIVE_TYPES,
      `${message} has an unsupported "directiveType".`,
    )
  }
  assertOneOf(value.status, GUIDANCE_STATUSES, `${message} has an unsupported "status".`)
  assertString(value.scopeLabel, `${message} is missing "scopeLabel".`)
  assertString(value.summary, `${message} is missing "summary".`)
  assertOneOf(value.effectWindow, GUIDANCE_WINDOWS, `${message} has an unsupported "effectWindow".`)
  assertString(value.promptHint, `${message} is missing "promptHint".`, { allowEmpty: true })
}

function assertWorkbenchAction(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(value.kind, WORKBENCH_ACTION_KINDS, `${message} has an unsupported "kind".`)
  assertString(value.summary, `${message} is missing "summary".`)
  if (value.targetTab != null) {
    assertOneOf(value.targetTab, WORKBENCH_TABS, `${message} has an unsupported "targetTab".`)
  }
  if (value.targetResearchView != null) {
    assertOneOf(
      value.targetResearchView,
      RESEARCH_VIEWS,
      `${message} has an unsupported "targetResearchView".`,
    )
  }
  assertOptionalString(value.targetRoute, `${message} has an invalid "targetRoute".`, {
    allowEmpty: true,
  })
  if (value.durationHours != null) {
    assertNumber(value.durationHours, `${message} has an invalid "durationHours".`, {
      integer: true,
      min: 1,
    })
  }
}

function assertNotice(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(
    value.code,
    ['missing_key', 'invalid_key', 'provider_error'] as const,
    `${message} has an unsupported "code".`,
  )
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.message, `${message} is missing "message".`)
  assertOptionalString(value.provider, `${message} has an invalid "provider".`, { allowEmpty: true })
  assertOptionalString(value.model, `${message} has an invalid "model".`, { allowEmpty: true })
  if (value.slot != null) {
    assertOneOf(value.slot, ['language', 'multimodal'] as const, `${message} has an unsupported "slot".`)
  }
}

function assertProviderCapability(value: unknown, message: string): asserts value is ProviderCapability {
  assertRecord(value, message)
  assertBoolean(value.text, `${message} is missing "text".`)
  assertBoolean(value.image, `${message} is missing "image".`)
  assertBoolean(value.pdf, `${message} is missing "pdf".`)
  assertBoolean(value.chart, `${message} is missing "chart".`)
  assertBoolean(value.formula, `${message} is missing "formula".`)
  assertBoolean(value.citationsNative, `${message} is missing "citationsNative".`)
  assertBoolean(value.fileParserNative, `${message} is missing "fileParserNative".`)
  assertBoolean(value.toolCalling, `${message} is missing "toolCalling".`)
  assertBoolean(value.jsonMode, `${message} is missing "jsonMode".`)
  assertBoolean(value.streaming, `${message} is missing "streaming".`)
}

function assertPromptLanguageOption(
  value: unknown,
  message: string,
): asserts value is PromptLanguageOption {
  assertRecord(value, message)
  assertOneOf(value.code, PROMPT_LANGUAGE_CODES, `${message} has an unsupported "code".`)
  assertString(value.label, `${message} is missing "label".`)
  assertString(value.nativeName, `${message} is missing "nativeName".`)
  if (value.isDefault != null) {
    assertBoolean(value.isDefault, `${message} has an invalid "isDefault".`)
  }
}

function assertPromptTemplateContent(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.system, `${message} is missing "system".`, { allowEmpty: true })
  assertString(value.user, `${message} is missing "user".`, { allowEmpty: true })
  assertString(value.notes, `${message} is missing "notes".`, { allowEmpty: true })
}

function assertPromptTemplateRecord(
  value: unknown,
  message: string,
): asserts value is PromptTemplateRecord {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.family, PROMPT_FAMILIES, `${message} has an unsupported "family".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertOneOf(value.slot, ['language', 'multimodal'] as const, `${message} has an unsupported "slot".`)
  assertNumber(value.order, `${message} is missing "order".`)
  assertStringArray(value.tags, `${message} is missing "tags".`, { allowEmptyStrings: true })
  assertBoolean(value.builtIn, `${message} is missing "builtIn".`)
  assertRecord(value.languageContents, `${message} is missing "languageContents".`)
  for (const language of PROMPT_LANGUAGE_CODES) {
    assertPromptTemplateContent(
      value.languageContents[language],
      `${message} languageContents.${language}`,
    )
  }
}

function assertProductCopyRecord(
  value: unknown,
  message: string,
): asserts value is ProductCopyRecord {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertString(value.section, `${message} is missing "section".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertNumber(value.order, `${message} is missing "order".`)
  assertBoolean(value.multiline, `${message} is missing "multiline".`)
  assertBoolean(value.builtIn, `${message} is missing "builtIn".`)
  assertRecord(value.languageContents, `${message} is missing "languageContents".`)
  for (const language of PROMPT_LANGUAGE_CODES) {
    assertString(
      value.languageContents[language],
      `${message} languageContents.${language} is missing.`,
      { allowEmpty: true },
    )
  }
}

function assertExternalAgentAssetRecord(
  value: unknown,
  message: string,
): asserts value is ExternalAgentAssetRecord {
  assertRecord(value, message)
  assertOneOf(value.id, EXTERNAL_AGENT_ASSET_IDS, `${message} has an unsupported "id".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertString(value.path, `${message} is missing "path".`)
  assertOneOf(value.format, ASSET_FORMATS, `${message} has an unsupported "format".`)
  assertBoolean(value.builtIn, `${message} is missing "builtIn".`)
  assertString(value.content, `${message} is missing "content".`, { allowEmpty: true })
}

export function assertGenerationRuntimeConfigContract(
  value: unknown,
): asserts value is GenerationRuntimeConfig {
  assertRecord(value, 'Generation runtime config is unavailable from the backend contract.')
  assertOneOf(value.defaultLanguage, PROMPT_LANGUAGE_CODES, 'Generation runtime config has an unsupported "defaultLanguage".')
  ;[
    'cacheGeneratedOutputs',
    'contextAwareCacheReuse',
    'useTopicMemory',
    'usePreviousPassOutputs',
    'preferMultimodalEvidence',
    'topicSessionMemoryEnabled',
    'topicSessionMemoryRecallEnabled',
  ].forEach((key) => assertBoolean(value[key], `Generation runtime config is missing "${key}".`))
  ;[
    'staleContextRefinePasses',
    'maxRetriesPerPass',
    'topicPreviewPasses',
    'topicBlueprintPasses',
    'topicLocalizationPasses',
    'topicChatPasses',
    'stageNamingPasses',
    'nodeArticlePasses',
    'paperArticlePasses',
    'selfRefinePasses',
    'researchOrchestrationPasses',
    'researchReportPasses',
    'researchCycleDelayMs',
    'researchStageStallLimit',
    'researchStagePaperLimit',
    'researchArtifactRebuildLimit',
    'nodeCardFigureCandidateLimit',
    'topicSessionMemoryInitEventCount',
    'topicSessionMemoryChatTurnsBetweenCompaction',
    'topicSessionMemoryResearchCyclesBetweenCompaction',
    'topicSessionMemoryTokenThreshold',
    'topicSessionMemoryRecentEventLimit',
    'topicSessionMemoryRecallLimit',
    'topicSessionMemoryRecallLookbackLimit',
    'maxEvidencePerArticle',
    'contextWindowStages',
    'contextWindowNodes',
  ].forEach((key) => assertNumber(value[key], `Generation runtime config is missing "${key}".`, { min: 0 }))
  assertNumber(value.languageTemperature, 'Generation runtime config is missing "languageTemperature".')
  assertNumber(value.multimodalTemperature, 'Generation runtime config is missing "multimodalTemperature".')
  assertNumber(value.topicSessionMemoryRecallRecencyBias, 'Generation runtime config is missing "topicSessionMemoryRecallRecencyBias".')
  assertRecord(value.editorialPolicies, 'Generation runtime config is missing "editorialPolicies".')
  for (const language of PROMPT_LANGUAGE_CODES) {
    const policy = value.editorialPolicies[language]
    assertRecord(policy, `Generation runtime config editorialPolicies.${language} is invalid.`)
    ;['identity', 'mission', 'reasoning', 'style', 'evidence', 'industryLens', 'continuity', 'refinement'].forEach((key) =>
      assertString(policy[key], `Generation runtime config editorialPolicies.${language}.${key} is missing.`, {
        allowEmpty: true,
      }),
    )
  }
}

export function assertPromptStudioBundleContract(
  value: unknown,
): asserts value is PromptStudioBundle {
  assertRecord(value, 'Prompt studio bundle is unavailable from the backend contract.')
  assertArray(value.languages, 'Prompt studio bundle is missing "languages".')
  value.languages.forEach((language, index) =>
    assertPromptLanguageOption(language, `Prompt studio language ${index + 1}`),
  )
  assertArray(value.templates, 'Prompt studio bundle is missing "templates".')
  value.templates.forEach((template, index) =>
    assertPromptTemplateRecord(template, `Prompt studio template ${index + 1}`),
  )
  assertArray(value.productCopies, 'Prompt studio bundle is missing "productCopies".')
  value.productCopies.forEach((copy, index) =>
    assertProductCopyRecord(copy, `Prompt studio product copy ${index + 1}`),
  )
  assertGenerationRuntimeConfigContract(value.runtime)
  if (value.runtimeMeta != null) {
    assertRecord(value.runtimeMeta, 'Prompt studio bundle has an invalid "runtimeMeta" payload.')
    assertString(value.runtimeMeta.key, 'Prompt studio bundle runtimeMeta is missing "key".')
    assertNumber(value.runtimeMeta.revision, 'Prompt studio bundle runtimeMeta is missing "revision".', {
      integer: true,
      min: 0,
    })
    assertString(value.runtimeMeta.hash, 'Prompt studio bundle runtimeMeta is missing "hash".')
    assertOwnProperty(
      value.runtimeMeta,
      'updatedAt',
      'Prompt studio bundle runtimeMeta is missing "updatedAt".',
    )
    if (value.runtimeMeta.updatedAt != null) {
      assertString(value.runtimeMeta.updatedAt, 'Prompt studio bundle runtimeMeta has an invalid "updatedAt".')
    }
    assertString(value.runtimeMeta.source, 'Prompt studio bundle runtimeMeta is missing "source".')
    assertOwnProperty(value.runtimeMeta, 'actor', 'Prompt studio bundle runtimeMeta is missing "actor".')
    if (value.runtimeMeta.actor != null) {
      assertString(value.runtimeMeta.actor, 'Prompt studio bundle runtimeMeta has an invalid "actor".', {
        allowEmpty: true,
      })
    }
    assertNumber(value.runtimeMeta.sizeBytes, 'Prompt studio bundle runtimeMeta is missing "sizeBytes".', {
      integer: true,
      min: 0,
    })
    assertStringArray(value.runtimeMeta.topLevelKeys, 'Prompt studio bundle runtimeMeta is missing "topLevelKeys".', {
      allowEmptyStrings: false,
    })
    assertBoolean(value.runtimeMeta.legacy, 'Prompt studio bundle runtimeMeta is missing "legacy".')
  }
  if (value.runtimeHistory != null) {
    assertArray(value.runtimeHistory, 'Prompt studio bundle has an invalid "runtimeHistory" payload.')
    value.runtimeHistory.forEach((entry, index) => {
      assertRecord(entry, `Prompt studio runtime history ${index + 1} is invalid.`)
      assertString(entry.key, `Prompt studio runtime history ${index + 1} is missing "key".`)
      assertNumber(entry.revision, `Prompt studio runtime history ${index + 1} is missing "revision".`, {
        integer: true,
        min: 0,
      })
      assertString(entry.hash, `Prompt studio runtime history ${index + 1} is missing "hash".`)
      assertOwnProperty(
        entry,
        'updatedAt',
        `Prompt studio runtime history ${index + 1} is missing "updatedAt".`,
      )
      if (entry.updatedAt != null) {
        assertString(entry.updatedAt, `Prompt studio runtime history ${index + 1} has an invalid "updatedAt".`)
      }
      assertString(entry.source, `Prompt studio runtime history ${index + 1} is missing "source".`)
      assertOwnProperty(entry, 'actor', `Prompt studio runtime history ${index + 1} is missing "actor".`)
      if (entry.actor != null) {
        assertString(entry.actor, `Prompt studio runtime history ${index + 1} has an invalid "actor".`, {
          allowEmpty: true,
        })
      }
      assertNumber(entry.sizeBytes, `Prompt studio runtime history ${index + 1} is missing "sizeBytes".`, {
        integer: true,
        min: 0,
      })
      assertStringArray(entry.topLevelKeys, `Prompt studio runtime history ${index + 1} is missing "topLevelKeys".`)
      assertBoolean(entry.legacy, `Prompt studio runtime history ${index + 1} is missing "legacy".`)
      assertOwnProperty(
        entry,
        'previousHash',
        `Prompt studio runtime history ${index + 1} is missing "previousHash".`,
      )
      if (entry.previousHash != null) {
        assertString(entry.previousHash, `Prompt studio runtime history ${index + 1} has an invalid "previousHash".`)
      }
      assertStringArray(entry.warnings, `Prompt studio runtime history ${index + 1} is missing "warnings".`, {
        allowEmptyStrings: true,
      })
    })
  }
  assertRecord(value.externalAgents, 'Prompt studio bundle is missing "externalAgents".')
  assertString(value.externalAgents.rootDir, 'Prompt studio externalAgents is missing "rootDir".')
  assertString(value.externalAgents.readmePath, 'Prompt studio externalAgents is missing "readmePath".')
  assertString(value.externalAgents.promptGuidePath, 'Prompt studio externalAgents is missing "promptGuidePath".')
  assertString(value.externalAgents.superPromptPath, 'Prompt studio externalAgents is missing "superPromptPath".')
  assertString(value.externalAgents.configExamplePath, 'Prompt studio externalAgents is missing "configExamplePath".')
  assertArray(value.externalAgents.assets, 'Prompt studio externalAgents is missing "assets".')
  value.externalAgents.assets.forEach((asset, index) =>
    assertExternalAgentAssetRecord(asset, `Prompt studio external agent asset ${index + 1}`),
  )
}

export function assertExternalAgentJobPackageContract(
  value: unknown,
): asserts value is {
  schemaVersion: 'external-agent-job-v2'
  jobId: string
  generatedAt: string
  language: (typeof PROMPT_LANGUAGE_CODES)[number]
  subject: { type: 'generic' | 'topic' | 'node' | 'paper'; id: string | null; topicId: string | null; title: string; route: string | null; summary: string; snapshot: unknown }
  scaffold: { rootDir: string; readmePath: string; promptGuidePath: string; superPromptPath: string; configExamplePath: string; assets: ExternalAgentAssetRecord[]; supportedAgents: string[]; workflow: string[] }
  savedPath?: string
} {
  assertRecord(value, 'External agent job package is unavailable from the backend contract.')
  assertContract(value.schemaVersion === 'external-agent-job-v2', 'External agent job package has an unsupported "schemaVersion".')
  assertString(value.jobId, 'External agent job package is missing "jobId".')
  assertString(value.generatedAt, 'External agent job package is missing "generatedAt".')
  assertOneOf(value.language, PROMPT_LANGUAGE_CODES, 'External agent job package has an unsupported "language".')
  assertRecord(value.template, 'External agent job package is missing "template".')
  const template = value.template
  assertString(template.id, 'External agent job package template is missing "id".')
  assertOneOf(template.family, PROMPT_FAMILIES, 'External agent job package template has an unsupported "family".')
  assertOneOf(template.slot, ['language', 'multimodal'] as const, 'External agent job package template has an unsupported "slot".')
  ;['title', 'description', 'system', 'user', 'notes'].forEach((key) =>
    assertString(template[key], `External agent job package template is missing "${key}".`, {
      allowEmpty: true,
    }),
  )
  assertStringArray(template.tags, 'External agent job package template is missing "tags".', { allowEmptyStrings: true })
  assertGenerationRuntimeConfigContract(value.runtime)
  assertRecord(value.editorialPolicy, 'External agent job package is missing "editorialPolicy".')
  const editorialPolicy = value.editorialPolicy
  ;['identity', 'mission', 'reasoning', 'style', 'evidence', 'industryLens', 'continuity', 'refinement'].forEach((key) =>
    assertString(editorialPolicy[key], `External agent job package editorialPolicy is missing "${key}".`, {
      allowEmpty: true,
    }),
  )
  assertRecord(value.modelTarget, 'External agent job package is missing "modelTarget".')
  assertOneOf(value.modelTarget.slot, ['language', 'multimodal'] as const, 'External agent job package modelTarget has an unsupported "slot".')
  assertBoolean(value.modelTarget.configured, 'External agent job package modelTarget is missing "configured".')
  if (value.modelTarget.provider != null) {
    assertString(value.modelTarget.provider, 'External agent job package modelTarget has an invalid "provider".')
  }
  if (value.modelTarget.model != null) {
    assertString(value.modelTarget.model, 'External agent job package modelTarget has an invalid "model".')
  }
  assertOptionalString(value.modelTarget.baseUrl, 'External agent job package modelTarget has an invalid "baseUrl".', { allowEmpty: true })
  assertOneOf(value.modelTarget.apiKeyStatus, API_KEY_STATUSES, 'External agent job package modelTarget has an unsupported "apiKeyStatus".')
  assertRecord(value.subject, 'External agent job package is missing "subject".')
  assertOneOf(value.subject.type, ['generic', 'topic', 'node', 'paper'] as const, 'External agent job package subject has an unsupported "type".')
  if (value.subject.id != null) assertString(value.subject.id, 'External agent job package subject has an invalid "id".')
  if (value.subject.topicId != null) assertString(value.subject.topicId, 'External agent job package subject has an invalid "topicId".')
  assertString(value.subject.title, 'External agent job package subject is missing "title".', { allowEmpty: true })
  if (value.subject.route != null) assertString(value.subject.route, 'External agent job package subject has an invalid "route".')
  assertString(value.subject.summary, 'External agent job package subject is missing "summary".', { allowEmpty: true })
  assertRecord(value.scaffold, 'External agent job package is missing "scaffold".')
  const scaffold = value.scaffold
  ;['rootDir', 'readmePath', 'promptGuidePath', 'superPromptPath', 'configExamplePath'].forEach((key) =>
    assertString(scaffold[key], `External agent job package scaffold is missing "${key}".`),
  )
  assertArray(scaffold.assets, 'External agent job package scaffold is missing "assets".')
  scaffold.assets.forEach((asset, index) =>
    assertExternalAgentAssetRecord(asset, `External agent job package asset ${index + 1}`),
  )
  assertStringArray(scaffold.supportedAgents, 'External agent job package scaffold is missing "supportedAgents".', { allowEmptyStrings: true })
  assertStringArray(scaffold.workflow, 'External agent job package scaffold is missing "workflow".', { allowEmptyStrings: true })
  assertOptionalString(value.savedPath, 'External agent job package has an invalid "savedPath".', { allowEmpty: true })
}

export function assertTopicNodePickerCollectionContract(
  value: unknown,
): asserts value is TopicNodePickerItem[] {
  assertArray(value, 'Topic node picker collection is unavailable from the backend contract.')
  value.forEach((item, index) => {
    assertNodePickerItem(item, `Topic node picker item ${index + 1}`)
  })
}

function assertProviderModelRef(value: unknown, message: string): asserts value is ProviderModelRef {
  assertRecord(value, message)
  assertString(value.provider, `${message} is missing "provider".`)
  assertString(value.model, `${message} is missing "model".`)
}

function assertProviderUiHints(value: unknown, message: string): asserts value is ProviderUiHints {
  assertRecord(value, message)
  if (value.supportsCustomBaseUrl != null) {
    assertBoolean(value.supportsCustomBaseUrl, `${message} has an invalid "supportsCustomBaseUrl".`)
  }
  if (value.supportsCustomHeaders != null) {
    assertBoolean(value.supportsCustomHeaders, `${message} has an invalid "supportsCustomHeaders".`)
  }
  if (value.tone != null) {
    assertOneOf(value.tone, ['global', 'china', 'custom'] as const, `${message} has an unsupported "tone".`)
  }
  if (value.recommendedFor != null) {
    assertStringArray(value.recommendedFor, `${message} has an invalid "recommendedFor".`, {
      allowEmptyStrings: true,
    })
  }
}

function assertProviderConfigField(value: unknown, message: string): asserts value is ProviderConfigField {
  assertRecord(value, message)
  assertString(value.key, `${message} is missing "key".`)
  assertString(value.label, `${message} is missing "label".`)
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertOneOf(value.type, ['string', 'number', 'boolean', 'json'] as const, `${message} has an unsupported "type".`)
  assertOptionalString(value.placeholder, `${message} has an invalid "placeholder".`, { allowEmpty: true })
  if (value.multiline != null) {
    assertBoolean(value.multiline, `${message} has an invalid "multiline".`)
  }
}

function assertSanitizedProviderModelConfig(
  value: unknown,
  message: string,
): asserts value is SanitizedProviderModelConfig {
  assertRecord(value, message)
  assertString(value.provider, `${message} is missing "provider".`)
  assertString(value.model, `${message} is missing "model".`)
  assertOptionalString(value.baseUrl, `${message} has an invalid "baseUrl".`, { allowEmpty: true })
  assertOptionalString(value.apiKeyRef, `${message} has an invalid "apiKeyRef".`, { allowEmpty: true })
  assertOneOf(value.apiKeyStatus, API_KEY_STATUSES, `${message} has an unsupported "apiKeyStatus".`)
  assertOptionalString(value.apiKeyPreview, `${message} has an invalid "apiKeyPreview".`, { allowEmpty: true })
  if (value.providerOptions != null) {
    assertRecord(value.providerOptions, `${message} has an invalid "providerOptions".`)
  }
  if (value.options != null) {
    assertRecord(value.options, `${message} has an invalid "options".`)
    if (value.options.thinking != null) {
      assertOneOf(value.options.thinking, ['on', 'off', 'auto'] as const, `${message} options has an unsupported "thinking".`)
    }
    if (value.options.citations != null) {
      assertOneOf(value.options.citations, ['native', 'backend'] as const, `${message} options has an unsupported "citations".`)
    }
    if (value.options.parser != null) {
      assertOneOf(value.options.parser, ['native', 'backend'] as const, `${message} options has an unsupported "parser".`)
    }
    if (value.options.temperature != null) {
      assertNumber(value.options.temperature, `${message} options has an invalid "temperature".`)
    }
    if (value.options.maxTokens != null) {
      assertNumber(value.options.maxTokens, `${message} options has an invalid "maxTokens".`, {
        integer: true,
        min: 1,
      })
    }
  }
}

export function assertSanitizedUserModelConfigContract(
  value: unknown,
): asserts value is SanitizedUserModelConfig {
  assertRecord(value, 'Sanitized user model config is unavailable from the backend contract.')
  if (value.language != null) {
    assertSanitizedProviderModelConfig(value.language, 'Sanitized model config language slot')
  }
  if (value.multimodal != null) {
    assertSanitizedProviderModelConfig(value.multimodal, 'Sanitized model config multimodal slot')
  }
  if (value.roles != null) {
    assertRecord(value.roles, 'Sanitized model config has an invalid "roles" payload.')
    Object.entries(value.roles).forEach(([roleId, roleConfig]) => {
      if (roleConfig != null) {
        assertSanitizedProviderModelConfig(roleConfig, `Sanitized model config role "${roleId}"`)
      }
    })
  }
  if (value.taskOverrides != null) {
    assertRecord(value.taskOverrides, 'Sanitized model config has an invalid "taskOverrides" payload.')
    Object.entries(value.taskOverrides).forEach(([taskId, override]) =>
      assertProviderModelRef(override, `Sanitized model config task override "${taskId}"`),
    )
  }
  if (value.taskRouting != null) {
    assertRecord(value.taskRouting, 'Sanitized model config has an invalid "taskRouting" payload.')
    Object.entries(value.taskRouting).forEach(([taskId, routeTarget]) =>
      assertString(routeTarget, `Sanitized model config task routing "${taskId}" is invalid.`),
    )
  }
  if (value.categories != null) {
    assertRecord(value.categories, 'Sanitized model config has an invalid "categories" payload.')
  }
  if (value.disabledCategories != null) {
    assertStringArray(value.disabledCategories, 'Sanitized model config has an invalid "disabledCategories" payload.', {
      allowEmptyStrings: true,
    })
  }
}

export function assertProviderCatalogContract(
  value: unknown,
): asserts value is ProviderCatalogEntry[] {
  assertArray(value, 'Provider catalog is unavailable from the backend contract.')
  value.forEach((entry, index) => {
    const message = `Provider catalog entry ${index + 1}`
    assertRecord(entry, `${message} is invalid.`)
    assertString(entry.provider, `${message} is missing "provider".`)
    assertString(entry.label, `${message} is missing "label".`)
    assertString(entry.baseUrl, `${message} is missing "baseUrl".`, { allowEmpty: true })
    assertOneOf(entry.adapter, PROVIDER_ADAPTERS, `${message} has an unsupported "adapter".`)
    assertStringArray(entry.providerAuthEnvVars, `${message} is missing "providerAuthEnvVars".`, {
      allowEmptyStrings: true,
    })
    if (entry.configFields != null) {
      assertArray(entry.configFields, `${message} has an invalid "configFields" collection.`)
      entry.configFields.forEach((field, fieldIndex) =>
        assertProviderConfigField(field, `${message} config field ${fieldIndex + 1}`),
      )
    }
    if (entry.uiHints != null) {
      assertProviderUiHints(entry.uiHints, `${message} uiHints`)
    }
    assertArray(entry.models, `${message} is missing "models".`)
    entry.models.forEach((model, modelIndex) => {
      assertRecord(model, `${message} model ${modelIndex + 1} is invalid.`)
      assertString(model.id, `${message} model ${modelIndex + 1} is missing "id".`)
      assertString(model.label, `${message} model ${modelIndex + 1} is missing "label".`)
      assertOneOf(model.slot, MODEL_SLOTS, `${message} model ${modelIndex + 1} has an unsupported "slot".`)
      assertProviderCapability(model.capabilities, `${message} model ${modelIndex + 1} capabilities`)
      if (model.recommended != null) {
        assertBoolean(model.recommended, `${message} model ${modelIndex + 1} has an invalid "recommended".`)
      }
      assertOptionalString(model.description, `${message} model ${modelIndex + 1} has an invalid "description".`, {
        allowEmpty: true,
      })
    })
  })
}

export function assertModelPresetContract(value: unknown): asserts value is ModelPreset[] {
  assertArray(value, 'Model presets are unavailable from the backend contract.')
  value.forEach((preset, index) => {
    const message = `Model preset ${index + 1}`
    assertRecord(preset, `${message} is invalid.`)
    assertString(preset.id, `${message} is missing "id".`)
    assertString(preset.label, `${message} is missing "label".`)
    assertString(preset.description, `${message} is missing "description".`, { allowEmpty: true })
    assertProviderModelRef(preset.language, `${message} language`)
    assertProviderModelRef(preset.multimodal, `${message} multimodal`)
  })
}

function assertModelRoleDefinition(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertString(value.label, `${message} is missing "label".`)
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertOneOf(value.preferredSlot, ['language', 'multimodal'] as const, `${message} has an unsupported "preferredSlot".`)
  assertStringArray(value.defaultTasks, `${message} is missing "defaultTasks".`, { allowEmptyStrings: true })
}

function assertModelRoutingRecord(value: unknown, message: string) {
  assertRecord(value, message)
  Object.entries(value).forEach(([taskId, route]) => {
    assertRecord(route, `${message} task "${taskId}" is invalid.`)
    assertString(route.target, `${message} task "${taskId}" is missing "target".`)
    assertString(route.defaultTarget, `${message} task "${taskId}" is missing "defaultTarget".`)
  })
}

function assertModelCapabilitySlot(value: unknown, message: string) {
  assertRecord(value, message)
  assertBoolean(value.configured, `${message} is missing "configured".`)
  if (value.provider != null) {
    assertString(value.provider, `${message} has an invalid "provider".`)
  }
  if (value.model != null) {
    assertString(value.model, `${message} has an invalid "model".`)
  }
  if (value.capability != null) {
    assertProviderCapability(value.capability, `${message} capability`)
  }
  assertOneOf(value.apiKeyStatus, API_KEY_STATUSES, `${message} has an unsupported "apiKeyStatus".`)
}

export function assertModelConfigResponseContract(
  value: unknown,
): asserts value is ModelConfigResponse {
  assertRecord(value, 'Model config response is unavailable from the backend contract.')
  assertString(value.userId, 'Model config response is missing "userId".')
  assertSanitizedUserModelConfigContract(value.config)
  if (value.roleDefinitions != null) {
    assertArray(value.roleDefinitions, 'Model config response has an invalid "roleDefinitions" payload.')
    value.roleDefinitions.forEach((definition, index) =>
      assertModelRoleDefinition(definition, `Model config role definition ${index + 1}`),
    )
  }
  if (value.routing != null) {
    assertModelRoutingRecord(value.routing, 'Model config response routing')
  }
  assertProviderCatalogContract(value.catalog)
  assertModelPresetContract(value.presets)
}

export function assertModelCapabilitySummaryContract(
  value: unknown,
): asserts value is ModelCapabilitySummary {
  assertRecord(value, 'Model capability summary is unavailable from the backend contract.')
  assertString(value.userId, 'Model capability summary is missing "userId".')
  assertRecord(value.slots, 'Model capability summary is missing "slots".')
  assertModelCapabilitySlot(value.slots.language, 'Model capability summary language slot')
  assertModelCapabilitySlot(value.slots.multimodal, 'Model capability summary multimodal slot')
  if (value.roles != null) {
    assertRecord(value.roles, 'Model capability summary has an invalid "roles" payload.')
    Object.entries(value.roles).forEach(([roleId, role]) => {
      assertRecord(role, `Model capability summary role "${roleId}" is invalid.`)
      assertBoolean(role.configured, `Model capability summary role "${roleId}" is missing "configured".`)
      assertOneOf(
        role.source,
        ['role', 'default-language', 'default-multimodal', 'missing'] as const,
        `Model capability summary role "${roleId}" has an unsupported "source".`,
      )
      if (role.provider != null) {
        assertString(role.provider, `Model capability summary role "${roleId}" has an invalid "provider".`)
      }
      if (role.model != null) {
        assertString(role.model, `Model capability summary role "${roleId}" has an invalid "model".`)
      }
      if (role.capability != null) {
        assertProviderCapability(role.capability, `Model capability summary role "${roleId}" capability`)
      }
      assertOneOf(role.apiKeyStatus, API_KEY_STATUSES, `Model capability summary role "${roleId}" has an unsupported "apiKeyStatus".`)
      assertOneOf(role.preferredSlot, ['language', 'multimodal'] as const, `Model capability summary role "${roleId}" has an unsupported "preferredSlot".`)
      assertStringArray(role.defaultTasks, `Model capability summary role "${roleId}" is missing "defaultTasks".`, {
        allowEmptyStrings: true,
      })
      assertString(role.label, `Model capability summary role "${roleId}" is missing "label".`)
      assertString(role.description, `Model capability summary role "${roleId}" is missing "description".`, {
        allowEmpty: true,
      })
    })
  }
  if (value.routing != null) {
    assertModelRoutingRecord(value.routing, 'Model capability summary routing')
  }
  if (value.roleDefinitions != null) {
    assertArray(value.roleDefinitions, 'Model capability summary has an invalid "roleDefinitions" payload.')
    value.roleDefinitions.forEach((definition, index) =>
      assertModelRoleDefinition(definition, `Model capability role definition ${index + 1}`),
    )
  }
}

export function assertModelConfigSaveResponseContract(
  value: unknown,
): asserts value is ModelConfigSaveResponse {
  assertRecord(value, 'Model config save response is unavailable from the backend contract.')
  assertString(value.userId, 'Model config save response is missing "userId".')
  assertSanitizedUserModelConfigContract(value.config)
  assertRecord(value.slots, 'Model config save response is missing "slots".')
  assertModelCapabilitySlot(value.slots.language, 'Model config save response language slot')
  assertModelCapabilitySlot(value.slots.multimodal, 'Model config save response multimodal slot')
  if (value.roles != null) {
    assertModelCapabilitySummaryContract({
      userId: value.userId,
      slots: value.slots,
      roles: value.roles,
    })
  }
  if (value.routing != null) {
    assertModelRoutingRecord(value.routing, 'Model config save response routing')
  }
  if (value.validationIssues != null) {
    assertArray(value.validationIssues, 'Model config save response has an invalid "validationIssues" payload.')
    value.validationIssues.forEach((issue, index) =>
      assertNotice(issue, `Model config save response validation issue ${index + 1}`),
    )
  }
}

export function assertHealthStatusContract(
  value: unknown,
): asserts value is { status: 'ok' | 'error' } {
  assertRecord(value, 'Health status payload is unavailable from the backend contract.')
  assertOneOf(value.status, HEALTH_STATUSES, 'Health status payload has an unsupported "status".')
}

export function assertTopicManagerTopicCollectionContract(
  value: unknown,
): asserts value is Array<{
  id: string
  nameZh: string
  nameEn?: string | null
  focusLabel?: string | null
  summary?: string | null
  status: string
  language: string
  updatedAt: string
  paperCount?: number
  nodeCount?: number
  stageCount?: number
  localization?: TopicLocalizationPayload | null
  stageConfig?: {
    windowMonths: number
    updatedAt?: string | null
  } | null
}> {
  assertArray(value, 'Topic manager topics payload is unavailable from the backend contract.')
  value.forEach((topic, index) => {
    const message = `Topic manager topic ${index + 1}`
    assertRecord(topic, `${message} is invalid.`)
    assertString(topic.id, `${message} is missing "id".`)
    assertString(topic.nameZh, `${message} is missing "nameZh".`)
    assertOptionalString(topic.nameEn, `${message} has an invalid "nameEn".`, { allowEmpty: true })
    assertOptionalString(topic.focusLabel, `${message} has an invalid "focusLabel".`, { allowEmpty: true })
    assertOptionalString(topic.summary, `${message} has an invalid "summary".`, { allowEmpty: true })
    assertString(topic.status, `${message} is missing "status".`)
    assertString(topic.language, `${message} is missing "language".`)
    assertString(topic.updatedAt, `${message} is missing "updatedAt".`)
    if (topic.paperCount != null) {
      assertNumber(topic.paperCount, `${message} has an invalid "paperCount".`, { integer: true, min: 0 })
    }
    if (topic.nodeCount != null) {
      assertNumber(topic.nodeCount, `${message} has an invalid "nodeCount".`, { integer: true, min: 0 })
    }
    if (topic.stageCount != null) {
      assertNumber(topic.stageCount, `${message} has an invalid "stageCount".`, { integer: true, min: 0 })
    }
    assertContract(
      topic.localization == null || isRecord(topic.localization),
      `${message} has an invalid "localization" payload.`,
    )
    if (topic.stageConfig != null) {
      assertRecord(topic.stageConfig, `${message} has an invalid "stageConfig" payload.`)
      assertNumber(topic.stageConfig.windowMonths, `${message} stageConfig is missing "windowMonths".`, {
        integer: true,
        min: 1,
      })
      assertOptionalString(topic.stageConfig.updatedAt, `${message} stageConfig has an invalid "updatedAt".`, {
        allowEmpty: true,
      })
    }
  })
}

export function assertTopicStageConfigResponseContract(
  value: unknown,
): asserts value is { windowMonths: number; updatedAt?: string | null } {
  assertRecord(value, 'Topic stage config response is unavailable from the backend contract.')
  assertNumber(value.windowMonths, 'Topic stage config response is missing "windowMonths".', {
    integer: true,
    min: 1,
  })
  assertOptionalString(value.updatedAt, 'Topic stage config response has an invalid "updatedAt".', {
    allowEmpty: true,
  })
}

export function assertTaskTopicStagesContract(
  value: unknown,
): asserts value is Array<{
  id: string
  order: number
  name: string
  nameEn?: string | null
  localization?: { locales: StageLocaleMap } | null
}> {
  assertArray(value, 'Task topic stages payload is unavailable from the backend contract.')
  value.forEach((stage, index) => {
    const message = `Task topic stage ${index + 1}`
    assertRecord(stage, `${message} is invalid.`)
    assertString(stage.id, `${message} is missing "id".`)
    assertNumber(stage.order, `${message} is missing "order".`, { integer: true, min: 0 })
    assertString(stage.name, `${message} is missing "name".`)
    assertOptionalString(stage.nameEn, `${message} has an invalid "nameEn".`, { allowEmpty: true })
    if (stage.localization != null) {
      assertRecord(stage.localization, `${message} has an invalid "localization" payload.`)
      assertRecord(stage.localization.locales, `${message} localization is missing "locales".`)
    }
  })
}

export function assertResearchSessionStartResponseContract(
  value: unknown,
): asserts value is { sessionId: string } {
  assertRecord(value, 'Research session start response is unavailable from the backend contract.')
  assertString(value.sessionId, 'Research session start response is missing "sessionId".')
}

export function assertZoteroConfigResponseContract(
  value: unknown,
): asserts value is {
  configured: boolean
  config: {
    userId: string | null
    username: string | null
    enabled: boolean
    hasApiKey: boolean
  } | null
} {
  assertRecord(value, 'Zotero config response is unavailable from the backend contract.')
  assertBoolean(value.configured, 'Zotero config response is missing "configured".')
  if (value.config != null) {
    assertRecord(value.config, 'Zotero config response has an invalid "config" payload.')
    assertContract(
      value.config.userId == null || typeof value.config.userId === 'string',
      'Zotero config response has an invalid "config.userId".',
    )
    assertContract(
      value.config.username == null || typeof value.config.username === 'string',
      'Zotero config response has an invalid "config.username".',
    )
    assertBoolean(value.config.enabled, 'Zotero config response is missing "config.enabled".')
    assertBoolean(value.config.hasApiKey, 'Zotero config response is missing "config.hasApiKey".')
  }
}

export function assertZoteroCollectionsResponseContract(
  value: unknown,
): asserts value is {
  success: boolean
  collections: Array<{ key: string; name: string; parent: string | null }>
} {
  assertRecord(value, 'Zotero collections response is unavailable from the backend contract.')
  assertBoolean(value.success, 'Zotero collections response is missing "success".')
  assertArray(value.collections, 'Zotero collections response is missing "collections".')
  value.collections.forEach((collection, index) => {
    const message = `Zotero collection ${index + 1}`
    assertRecord(collection, `${message} is invalid.`)
    assertString(collection.key, `${message} is missing "key".`)
    assertString(collection.name, `${message} is missing "name".`)
    assertContract(
      collection.parent == null || typeof collection.parent === 'string',
      `${message} has an invalid "parent".`,
    )
  })
}

export function assertZoteroTestResponseContract(
  value: unknown,
): asserts value is { success: boolean; username?: string; error?: string } {
  assertRecord(value, 'Zotero test response is unavailable from the backend contract.')
  assertBoolean(value.success, 'Zotero test response is missing "success".')
  assertOptionalString(value.username, 'Zotero test response has an invalid "username".', { allowEmpty: true })
  assertOptionalString(value.error, 'Zotero test response has an invalid "error".', { allowEmpty: true })
}

export function assertZoteroExportResponseContract(
  value: unknown,
): asserts value is {
  success: boolean
  exportedCount: number
  errors: string[]
  collectionKey?: string
} {
  assertRecord(value, 'Zotero export response is unavailable from the backend contract.')
  assertBoolean(value.success, 'Zotero export response is missing "success".')
  assertNumber(value.exportedCount, 'Zotero export response is missing "exportedCount".', {
    integer: true,
    min: 0,
  })
  assertStringArray(value.errors, 'Zotero export response is missing "errors".', {
    allowEmptyStrings: true,
  })
  assertOptionalString(value.collectionKey, 'Zotero export response has an invalid "collectionKey".', {
    allowEmpty: true,
  })
}

export function assertZoteroExportStatusResponseContract(
  value: unknown,
): asserts value is {
  exported: boolean
  collectionKey: string | null
  exportedAt: string | null
  topicName: string | null
} {
  assertRecord(value, 'Zotero export status response is unavailable from the backend contract.')
  assertBoolean(value.exported, 'Zotero export status response is missing "exported".')
  assertContract(
    value.collectionKey == null || typeof value.collectionKey === 'string',
    'Zotero export status response has an invalid "collectionKey".',
  )
  assertContract(
    value.exportedAt == null || typeof value.exportedAt === 'string',
    'Zotero export status response has an invalid "exportedAt".',
  )
  assertContract(
    value.topicName == null || typeof value.topicName === 'string',
    'Zotero export status response has an invalid "topicName".',
  )
}

export function assertPromptStudioSummaryContract(
  value: unknown,
): asserts value is { productCopies?: unknown[]; templates?: unknown[] } {
  assertRecord(value, 'Prompt studio summary is unavailable from the backend contract.')
  if (value.productCopies != null) {
    assertArray(value.productCopies, 'Prompt studio summary has an invalid "productCopies" payload.')
  }
  if (value.templates != null) {
    assertArray(value.templates, 'Prompt studio summary has an invalid "templates" payload.')
  }
}

function assertResearchModeValue(value: unknown, message: string): asserts value is ResearchMode {
  assertOneOf(value, RESEARCH_MODES, message)
}

function assertResearchTaskProgressContract(
  value: unknown,
  message: string,
): asserts value is ResearchTaskProgress {
  assertRecord(value, message)
  assertString(value.taskId, `${message} is missing "taskId".`)
  assertString(value.topicId, `${message} is missing "topicId".`)
  assertString(value.topicName, `${message} is missing "topicName".`)
  assertResearchModeValue(value.researchMode, `${message} has an unsupported "researchMode".`)
  if (value.durationHours != null) {
    assertNumber(value.durationHours, `${message} has an invalid "durationHours".`, { min: 1 })
  }
  assertNumber(value.currentStage, `${message} is missing "currentStage".`, { integer: true, min: 1 })
  assertNumber(value.totalStages, `${message} is missing "totalStages".`, { integer: true, min: 1 })
  assertNumber(value.stageProgress, `${message} is missing "stageProgress".`, { min: 0 })
  assertNumber(value.currentStageRuns, `${message} is missing "currentStageRuns".`, { integer: true, min: 0 })
  assertNumber(value.currentStageTargetRuns, `${message} is missing "currentStageTargetRuns".`, {
    integer: true,
    min: 0,
  })
  if (value.stageRunMap != null) {
    assertRecord(value.stageRunMap, `${message} has an invalid "stageRunMap".`)
    Object.entries(value.stageRunMap).forEach(([stageIndex, runCount]) =>
      assertNumber(runCount, `${message} stageRunMap entry "${stageIndex}" is invalid.`, {
        integer: true,
        min: 0,
      }),
    )
  }
  assertNumber(value.totalRuns, `${message} is missing "totalRuns".`, { integer: true, min: 0 })
  assertNumber(value.successfulRuns, `${message} is missing "successfulRuns".`, { integer: true, min: 0 })
  assertNumber(value.failedRuns, `${message} is missing "failedRuns".`, { integer: true, min: 0 })
  assertOptionalString(value.lastRunAt, `${message} has an invalid "lastRunAt".`)
  if (value.lastRunResult != null) {
    assertOneOf(value.lastRunResult, ['success', 'failed', 'partial'] as const, `${message} has an unsupported "lastRunResult".`)
  }
  assertNumber(value.discoveredPapers, `${message} is missing "discoveredPapers".`, { integer: true, min: 0 })
  assertNumber(value.admittedPapers, `${message} is missing "admittedPapers".`, { integer: true, min: 0 })
  assertNumber(value.generatedContents, `${message} is missing "generatedContents".`, { integer: true, min: 0 })
  // Evidence counts
  assertNumber(value.figureCount, `${message} is missing "figureCount".`, { integer: true, min: 0 })
  assertNumber(value.tableCount, `${message} is missing "tableCount".`, { integer: true, min: 0 })
  assertNumber(value.formulaCount, `${message} is missing "formulaCount".`, { integer: true, min: 0 })
  assertNumber(value.figureGroupCount, `${message} is missing "figureGroupCount".`, { integer: true, min: 0 })
  assertOptionalString(value.startedAt, `${message} has an invalid "startedAt".`)
  assertOptionalString(value.deadlineAt, `${message} has an invalid "deadlineAt".`)
  assertOptionalString(value.completedAt, `${message} has an invalid "completedAt".`)
  assertOptionalString(value.activeSessionId, `${message} has an invalid "activeSessionId".`)
  assertNumber(value.completedStageCycles, `${message} is missing "completedStageCycles".`, { integer: true, min: 0 })
  assertNumber(value.currentStageStalls, `${message} is missing "currentStageStalls".`, { integer: true, min: 0 })
  assertOptionalString(value.latestSummary, `${message} has an invalid "latestSummary".`, { allowEmpty: true })
  assertOneOf(value.status, RESEARCH_PROGRESS_STATUSES, `${message} has an unsupported "status".`)
}

function assertTaskOptionsContract(value: unknown, message: string) {
  assertRecord(value, message)
  if (value.maxResults != null) {
    assertNumber(value.maxResults, `${message} has an invalid "maxResults".`, { integer: true, min: 1 })
  }
  assertNullableInteger(value.stageIndex, `${message} has an invalid "stageIndex".`, 1)
  if (value.maxIterations != null) {
    assertNumber(value.maxIterations, `${message} has an invalid "maxIterations".`, { integer: true, min: 1 })
  }
  if (value.stageDurationDays != null) {
    assertNumber(value.stageDurationDays, `${message} has an invalid "stageDurationDays".`, {
      integer: true,
      min: 1,
    })
  }
  if (value.durationHours != null) {
    assertNumber(value.durationHours, `${message} has an invalid "durationHours".`, { min: 1 })
  }
  if (value.cycleDelayMs != null) {
    assertNumber(value.cycleDelayMs, `${message} has an invalid "cycleDelayMs".`, { integer: true, min: 250 })
  }
  if (value.stageRounds != null) {
    assertArray(value.stageRounds, `${message} has an invalid "stageRounds".`)
    value.stageRounds.forEach((round, index) => {
      assertRecord(round, `${message} stageRound ${index + 1} is invalid.`)
      assertNumber(round.stageIndex, `${message} stageRound ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 1,
      })
      assertNumber(round.rounds, `${message} stageRound ${index + 1} is missing "rounds".`, {
        integer: true,
        min: 1,
      })
    })
  }
}

function assertResearchTaskConfigContract(
  value: unknown,
  message: string,
): asserts value is ResearchTaskConfig {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertString(value.name, `${message} is missing "name".`)
  assertString(value.cronExpression, `${message} is missing "cronExpression".`)
  assertBoolean(value.enabled, `${message} is missing "enabled".`)
  assertOptionalString(value.topicId, `${message} has an invalid "topicId".`)
  assertOneOf(value.action, RESEARCH_ACTIONS, `${message} has an unsupported "action".`)
  if (value.researchMode != null) {
    assertResearchModeValue(value.researchMode, `${message} has an unsupported "researchMode".`)
  }
  if (value.options != null) {
    assertTaskOptionsContract(value.options, `${message} options`)
  }
  if (value.progress != null) {
    assertResearchTaskProgressContract(value.progress, `${message} progress`)
  }
}

function assertTaskExecutionHistoryRecord(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertString(value.taskId, `${message} is missing "taskId".`)
  assertString(value.runAt, `${message} is missing "runAt".`)
  assertNumber(value.duration, `${message} is missing "duration".`, { integer: true, min: 0 })
  assertOneOf(value.status, ['success', 'failed', 'partial'] as const, `${message} has an unsupported "status".`)
  assertNumber(value.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
  assertNumber(value.papersDiscovered, `${message} is missing "papersDiscovered".`, { integer: true, min: 0 })
  if (value.papersPromoted != null) {
    assertNumber(value.papersPromoted, `${message} has an invalid "papersPromoted".`, {
      integer: true,
      min: 0,
    })
  }
  if (value.papersMerged != null) {
    assertNumber(value.papersMerged, `${message} has an invalid "papersMerged".`, {
      integer: true,
      min: 0,
    })
  }
  if (value.papersAdmitted != null) {
    assertNumber(value.papersAdmitted, `${message} has an invalid "papersAdmitted".`, {
      integer: true,
      min: 0,
    })
  }
  if (value.contentsGenerated != null) {
    assertNumber(value.contentsGenerated, `${message} has an invalid "contentsGenerated".`, {
      integer: true,
      min: 0,
    })
  }
  assertOptionalString(value.error, `${message} has an invalid "error".`, { allowEmpty: true })
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
}

export function assertTaskListContract(value: unknown): asserts value is ResearchTaskConfig[] {
  assertArray(value, 'Task list is unavailable from the backend contract.')
  value.forEach((task, index) => assertResearchTaskConfigContract(task, `Task list entry ${index + 1}`))
}

export function assertTaskTopicsContract(value: unknown): asserts value is BackendTopicListItem[] {
  assertBackendTopicCollectionContract(value)
}

export function assertTaskCronPresetsContract(
  value: unknown,
): asserts value is Array<{ label: string; value: string; description: string }> {
  assertArray(value, 'Task cron presets are unavailable from the backend contract.')
  value.forEach((preset, index) => {
    const message = `Task cron preset ${index + 1}`
    assertRecord(preset, `${message} is invalid.`)
    assertString(preset.label, `${message} is missing "label".`)
    assertString(preset.value, `${message} is missing "value".`)
    assertString(preset.description, `${message} is missing "description".`, { allowEmpty: true })
  })
}

export function assertTaskDetailResponseContract(
  value: unknown,
): asserts value is {
  task: ResearchTaskConfig
  progress: ResearchTaskProgress | null
  history: Array<{
    id: string
    taskId: string
    runAt: string
    duration: number
    status: 'success' | 'failed' | 'partial'
    stageIndex: number
    papersDiscovered: number
    papersPromoted?: number
    papersAdmitted?: number
    papersMerged?: number
    contentsGenerated?: number
    error?: string
    summary: string
  }>
} {
  assertRecord(value, 'Task detail response is unavailable from the backend contract.')
  assertResearchTaskConfigContract(value.task, 'Task detail response task')
  if (value.progress != null) {
    assertResearchTaskProgressContract(value.progress, 'Task detail response progress')
  }
  assertArray(value.history, 'Task detail response is missing "history".')
  value.history.forEach((record, index) =>
    assertTaskExecutionHistoryRecord(record, `Task detail history entry ${index + 1}`),
  )
}

export function assertTaskMutationAckContract(
  value: unknown,
): asserts value is { success: boolean } {
  assertRecord(value, 'Task mutation acknowledgement is unavailable from the backend contract.')
  assertBoolean(value.success, 'Task mutation acknowledgement is missing "success".')
}

export function assertBackendTopicCollectionContract(
  value: unknown,
): asserts value is BackendTopicListItem[] {
  assertArray(value, 'Backend topics payload is unavailable.')
  value.forEach((topic, index) => {
    const message = `Backend topic ${index + 1}`
    assertRecord(topic, `${message} is invalid.`)
    assertString(topic.id, `${message} is missing "id".`)
    assertString(topic.nameZh, `${message} is missing "nameZh".`)
    assertOptionalString(topic.nameEn, `${message} has an invalid "nameEn".`, { allowEmpty: true })
    assertOptionalString(topic.focusLabel, `${message} has an invalid "focusLabel".`, { allowEmpty: true })
    assertOptionalString(topic.summary, `${message} has an invalid "summary".`, { allowEmpty: true })
    assertOptionalString(topic.createdAt, `${message} has an invalid "createdAt".`, { allowEmpty: true })
    assertContract(
      topic.localization == null || isRecord(topic.localization),
      `${message} has an invalid "localization" payload.`,
    )
  })
}

function assertTopicDashboardResearchThread(value: unknown, message: string) {
  assertRecord(value, message)
  assertNumber(value.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
  assertString(value.nodeId, `${message} is missing "nodeId".`)
  assertString(value.nodeTitle, `${message} is missing "nodeTitle".`)
  assertString(value.thesis, `${message} is missing "thesis".`, { allowEmpty: true })
  assertNumber(value.paperCount, `${message} is missing "paperCount".`, { integer: true, min: 0 })
  assertString(value.keyPaperTitle, `${message} is missing "keyPaperTitle".`, { allowEmpty: true })
  assertBoolean(value.isMilestone, `${message} is missing "isMilestone".`)
}

function assertTopicDashboardMethodEvolutionEntry(value: unknown, message: string) {
  assertRecord(value, message)
  assertNumber(value.year, `${message} is missing "year".`, { integer: true, min: 0 })
  assertString(value.methodName, `${message} is missing "methodName".`)
  assertString(value.paperId, `${message} is missing "paperId".`)
  assertString(value.paperTitle, `${message} is missing "paperTitle".`)
  assertString(value.contribution, `${message} is missing "contribution".`, { allowEmpty: true })
  assertOneOf(value.impact, ['high', 'medium', 'low'] as const, `${message} has an unsupported "impact".`)
}

function assertTopicDashboardActiveAuthor(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.name, `${message} is missing "name".`)
  assertOptionalString(value.affiliation, `${message} has an invalid "affiliation".`, {
    allowEmpty: true,
  })
  assertNumber(value.paperCount, `${message} is missing "paperCount".`, { integer: true, min: 0 })
  assertNumber(value.citationCount, `${message} is missing "citationCount".`, {
    integer: true,
    min: 0,
  })
  assertStringArray(value.keyPapers, `${message} is missing "keyPapers".`)
  assertStringArray(value.researchFocus, `${message} is missing "researchFocus".`)
}

function assertTopicDashboardPendingPaper(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.paperId, `${message} is missing "paperId".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.publishedAt, `${message} is missing "publishedAt".`)
  if (value.stageIndex != null) {
    assertNumber(value.stageIndex, `${message} has an invalid "stageIndex".`, {
      integer: true,
      min: 1,
    })
  }
  assertString(value.stageLabel, `${message} is missing "stageLabel".`, { allowEmpty: true })
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertString(value.route, `${message} is missing "route".`)
}

export function assertTopicDashboardContract(
  value: unknown,
): asserts value is TopicDashboardData {
  assertRecord(value, 'Topic dashboard is unavailable from the backend contract.')
  assertString(value.topicId, 'Topic dashboard is missing "topicId".')
  assertString(value.topicTitle, 'Topic dashboard is missing "topicTitle".')
  assertArray(value.researchThreads, 'Topic dashboard is missing "researchThreads".')
  value.researchThreads.forEach((entry, index) =>
    assertTopicDashboardResearchThread(entry, `Topic dashboard research thread ${index + 1}`),
  )
  assertArray(value.methodEvolution, 'Topic dashboard is missing "methodEvolution".')
  value.methodEvolution.forEach((entry, index) =>
    assertTopicDashboardMethodEvolutionEntry(entry, `Topic dashboard method evolution ${index + 1}`),
  )
  assertArray(value.activeAuthors, 'Topic dashboard is missing "activeAuthors".')
  value.activeAuthors.forEach((entry, index) =>
    assertTopicDashboardActiveAuthor(entry, `Topic dashboard active author ${index + 1}`),
  )
  assertRecord(value.stats, 'Topic dashboard is missing "stats".')
  assertNumber(value.stats.totalPapers, 'Topic dashboard stats are missing "totalPapers".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.mappedPapers, 'Topic dashboard stats are missing "mappedPapers".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.pendingPapers, 'Topic dashboard stats are missing "pendingPapers".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.totalNodes, 'Topic dashboard stats are missing "totalNodes".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.totalStages, 'Topic dashboard stats are missing "totalStages".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.mappedStages, 'Topic dashboard stats are missing "mappedStages".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.timeSpanYears, 'Topic dashboard stats are missing "timeSpanYears".', {
    integer: true,
    min: 0,
  })
  assertNumber(
    value.stats.avgPapersPerNode,
    'Topic dashboard stats are missing "avgPapersPerNode".',
    { min: 0 },
  )
  assertNumber(
    value.stats.citationCoverage,
    'Topic dashboard stats are missing "citationCoverage".',
    { min: 0 },
  )
  assertStringArray(value.keyInsights, 'Topic dashboard is missing "keyInsights".', {
    allowEmptyStrings: true,
  })
  assertRecord(value.trends, 'Topic dashboard is missing "trends".')
  assertStringArray(value.trends.emergingTopics, 'Topic dashboard trends are missing "emergingTopics".', {
    allowEmptyStrings: true,
  })
  assertStringArray(value.trends.decliningTopics, 'Topic dashboard trends are missing "decliningTopics".', {
    allowEmptyStrings: true,
  })
  assertStringArray(value.trends.methodShifts, 'Topic dashboard trends are missing "methodShifts".', {
    allowEmptyStrings: true,
  })
  assertArray(value.pendingPapers, 'Topic dashboard is missing "pendingPapers".')
  value.pendingPapers.forEach((entry, index) =>
    assertTopicDashboardPendingPaper(entry, `Topic dashboard pending paper ${index + 1}`),
  )
}
export function assertSearchResponseContract(
  value: unknown,
  expectedScope?: SearchResponse['scope'],
): asserts value is SearchResponse {
  assertRecord(value, 'Search response is unavailable from the backend contract.')
  assertString(value.query, 'Search response is missing "query".', { allowEmpty: true })
  assertOneOf(value.scope, ['global', 'topic'] as const, 'Search response has an unsupported "scope".')
  if (expectedScope) {
    assertContract(
      value.scope === expectedScope,
      `Search response scope drifted to "${String(value.scope)}" instead of "${expectedScope}".`,
    )
  }
  assertRecord(value.totals, 'Search response is missing "totals".')
  assertNumber(value.totals.all, 'Search totals are missing "all".', { integer: true, min: 0 })
  assertNumber(value.totals.topic, 'Search totals are missing "topic".', { integer: true, min: 0 })
  assertNumber(value.totals.node, 'Search totals are missing "node".', { integer: true, min: 0 })
  assertNumber(value.totals.paper, 'Search totals are missing "paper".', { integer: true, min: 0 })
  assertNumber(value.totals.evidence, 'Search totals are missing "evidence".', { integer: true, min: 0 })
  assertArray(value.groups, 'Search response is missing grouped results.')
  value.groups.forEach((group, index) => assertSearchGroup(group, `Search group ${index + 1}`))

  if (value.facets != null) {
    assertRecord(value.facets, 'Search response facets are invalid.')
    assertArray(value.facets.stages, 'Search stage facets are invalid.')
    assertArray(value.facets.topics, 'Search topic facets are invalid.')
    value.facets.stages.forEach((entry, index) =>
      assertFacetEntry(entry, `Search stage facet ${index + 1}`),
    )
    value.facets.topics.forEach((entry, index) =>
      assertFacetEntry(entry, `Search topic facet ${index + 1}`),
    )
  }
}

export function assertTopicChatResponseContract(
  value: unknown,
): asserts value is TopicChatResponse {
  assertRecord(value, 'Topic chat response is unavailable from the backend contract.')
  assertString(value.messageId, 'Topic chat response is missing "messageId".')
  assertString(value.answer, 'Topic chat response is missing "answer".')
  assertCitations(value.citations, 'Topic chat response citations')
  assertSuggestedActions(value.suggestedActions, 'Topic chat response suggested actions')

  if (value.guidanceReceipt != null) {
    assertGuidanceReceipt(value.guidanceReceipt, 'Topic chat response guidanceReceipt')
  }

  if (value.workbenchAction != null) {
    assertWorkbenchAction(value.workbenchAction, 'Topic chat response workbenchAction')
  }

  if (value.notice != null) {
    assertNotice(value.notice, 'Topic chat response notice')
  }
}

export function assertTopicViewModelContract(
  value: unknown,
): asserts value is TopicViewModel {
  assertRecord(value, 'Topic view model is unavailable from the backend contract.')
  assertString(value.schemaVersion, 'Topic view model is missing "schemaVersion".')
  assertString(value.topicId, 'Topic view model is missing "topicId".')
  assertString(value.title, 'Topic view model is missing "title".')
  assertString(value.titleEn, 'Topic view model is missing "titleEn".')
  assertString(value.subtitle, 'Topic view model is missing "subtitle".', { allowEmpty: true })
  assertString(value.focusLabel, 'Topic view model is missing "focusLabel".', { allowEmpty: true })
  assertString(value.summary, 'Topic view model is missing "summary".', { allowEmpty: true })
  assertString(value.description, 'Topic view model is missing "description".', { allowEmpty: true })
  assertString(value.language, 'Topic view model is missing "language".')
  assertString(value.status, 'Topic view model is missing "status".')
  assertString(value.createdAt, 'Topic view model is missing "createdAt".')
  assertString(value.updatedAt, 'Topic view model is missing "updatedAt".')
  assertString(value.generatedAt, 'Topic view model is missing "generatedAt".')
  assertContract(
    value.localization == null || isRecord(value.localization),
    'Topic view model has an invalid localization payload from the backend contract.',
  )

  assertRecord(value.hero, 'Topic view model is missing hero content from the backend contract.')
  assertString(value.hero.kicker, 'Topic hero is missing "kicker".', { allowEmpty: true })
  assertString(value.hero.title, 'Topic hero is missing "title".')
  assertString(value.hero.standfirst, 'Topic hero is missing "standfirst".', { allowEmpty: true })
  assertString(value.hero.strapline, 'Topic hero is missing "strapline".', { allowEmpty: true })

  assertRecord(value.stageConfig, 'Topic view model is missing stageConfig from the backend contract.')
  assertNumber(value.stageConfig.windowMonths, 'Topic stageConfig is missing "windowMonths".', {
    integer: true,
    min: 1,
  })
  assertNumber(
    value.stageConfig.defaultWindowMonths,
    'Topic stageConfig is missing "defaultWindowMonths".',
    { integer: true, min: 1 },
  )
  assertNumber(value.stageConfig.minWindowMonths, 'Topic stageConfig is missing "minWindowMonths".', {
    integer: true,
    min: 1,
  })
  assertNumber(value.stageConfig.maxWindowMonths, 'Topic stageConfig is missing "maxWindowMonths".', {
    integer: true,
    min: 1,
  })
  assertBoolean(value.stageConfig.adjustable, 'Topic stageConfig is missing "adjustable".')

  assertRecord(value.summaryPanel, 'Topic view model is missing summaryPanel from the backend contract.')
  assertString(value.summaryPanel.thesis, 'Topic summary panel is missing "thesis".', {
    allowEmpty: true,
  })
  assertArray(value.summaryPanel.metaRows, 'Topic summary panel is missing "metaRows".')
  assertArray(value.summaryPanel.stats, 'Topic summary panel is missing "stats".')
  assertArray(value.summaryPanel.actions, 'Topic summary panel is missing "actions".')

  assertRecord(value.stats, 'Topic view model is missing stats from the backend contract.')
  assertNumber(value.stats.stageCount, 'Topic stats are missing "stageCount".', { integer: true, min: 0 })
  assertNumber(value.stats.nodeCount, 'Topic stats are missing "nodeCount".', { integer: true, min: 0 })
  assertNumber(value.stats.paperCount, 'Topic stats are missing "paperCount".', { integer: true, min: 0 })
  assertNumber(value.stats.mappedPaperCount, 'Topic stats are missing "mappedPaperCount".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.unmappedPaperCount, 'Topic stats are missing "unmappedPaperCount".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.evidenceCount, 'Topic stats are missing "evidenceCount".', {
    integer: true,
    min: 0,
  })

  assertRecord(value.timeline, 'Topic view model is missing timeline from the backend contract.')
  assertArray(value.timeline.stages, 'Topic view model is missing timeline stages from the backend contract.')
  assertContract(
    value.timeline.stages.length > 0,
    'Topic view model is missing timeline stages from the backend contract.',
  )

  const timelineStageIndexes = new Set<number>()
  value.timeline.stages.forEach((stage, index) => {
    const message = `Topic timeline stage ${index + 1}`
    assertRecord(stage, `${message} is invalid.`)
    assertNumber(stage.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
    assertContract(
      !timelineStageIndexes.has(stage.stageIndex),
      `${message} duplicates stage index ${String(stage.stageIndex)} in the backend payload.`,
    )
    timelineStageIndexes.add(stage.stageIndex)
    assertString(stage.title, `${message} is missing "title".`)
    assertString(stage.titleEn, `${message} is missing "titleEn".`)
    assertString(stage.description, `${message} is missing "description".`, { allowEmpty: true })
    assertString(stage.branchLabel, `${message} is missing "branchLabel".`)
    assertString(stage.branchColor, `${message} is missing "branchColor".`)
    assertString(stage.yearLabel, `${message} is missing "yearLabel".`, { allowEmpty: true })
    assertString(stage.dateLabel, `${message} is missing "dateLabel".`, { allowEmpty: true })
    assertString(stage.timeLabel, `${message} is missing "timeLabel".`, { allowEmpty: true })
    assertString(stage.stageThesis, `${message} is missing "stageThesis".`, { allowEmpty: true })
    assertTopicStageEditorial(stage.editorial, `${message} editorial`)
  })

  assertArray(value.stages, 'Topic view model is missing stage sections from the backend contract.')
  assertContract(
    value.stages.length > 0,
    'Topic view model is missing stage sections from the backend contract.',
  )
  const stageSectionIndexes = new Set<number>()
  value.stages.forEach((stage, index) => {
    const message = `Topic stage section ${index + 1}`
    assertRecord(stage, `${message} is invalid.`)
    assertNumber(stage.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
    stageSectionIndexes.add(stage.stageIndex)
    assertString(stage.title, `${message} is missing "title".`)
    assertString(stage.titleEn, `${message} is missing "titleEn".`)
    assertString(stage.description, `${message} is missing "description".`, { allowEmpty: true })
    assertString(stage.branchLabel, `${message} is missing "branchLabel".`)
    assertString(stage.branchColor, `${message} is missing "branchColor".`)
    assertTopicStageEditorial(stage.editorial, `${message} editorial`)
    assertNumber(stage.trackedPaperCount, `${message} is missing "trackedPaperCount".`, {
      integer: true,
      min: 0,
    })
    assertNumber(stage.mappedPaperCount, `${message} is missing "mappedPaperCount".`, {
      integer: true,
      min: 0,
    })
    assertNumber(stage.unmappedPaperCount, `${message} is missing "unmappedPaperCount".`, {
      integer: true,
      min: 0,
    })
    assertArray(stage.nodes, `${message} is missing "nodes".`)
    stage.nodes.forEach((node, nodeIndex) =>
      assertTopicNodeCard(node, `${message} node ${nodeIndex + 1}`),
    )
  })

  assertContract(
    timelineStageIndexes.size === stageSectionIndexes.size &&
      [...timelineStageIndexes].every((stageIndex) => stageSectionIndexes.has(stageIndex)),
    'Topic timeline stages and topic stages are out of sync in the backend payload.',
  )

  assertRecord(value.graph, 'Topic view model is missing graph layout from the backend contract.')
  assertNumber(value.graph.columnCount, 'Topic graph is missing "columnCount".', {
    integer: true,
    min: 1,
  })
  assertArray(value.graph.lanes, 'Topic view model is missing graph lanes from the backend contract.')
  assertArray(value.graph.nodes, 'Topic view model is missing graph nodes from the backend contract.')
  assertContract(
    value.graph.lanes.length <= 10,
    'Topic graph returned more than 10 timelines, which exceeds the supported contract.',
  )

  const graphLanes = value.graph.lanes as TopicGraphLane[]
  const graphNodes = value.graph.nodes as TopicGraphNode[]
  const laneIds = new Set<string>()
  const laneIndexes = new Set<number>()
  graphLanes.forEach((lane, index) => {
    const message = `Topic graph lane ${index + 1}`
    assertTopicGraphLane(lane, message)
    assertContract(!laneIds.has(lane.id), `${message} duplicates lane id "${lane.id}".`)
    assertContract(
      !laneIndexes.has(lane.laneIndex),
      `${message} duplicates lane index ${String(lane.laneIndex)}.`,
    )
    laneIds.add(lane.id)
    laneIndexes.add(lane.laneIndex)
  })

  assertArray(value.papers, 'Topic view model is missing paper entries from the backend contract.')
  const papers = value.papers as TopicViewModel['papers']
  const paperIds = new Set<string>()
  papers.forEach((paper, index) => {
    assertPaperEntry(paper, `Topic paper ${index + 1}`)
    assertContract(
      !paperIds.has(paper.paperId),
      `Topic paper ${index + 1} duplicates paperId "${paper.paperId}".`,
    )
    paperIds.add(paper.paperId)
  })

  const nodeIds = new Set<string>()
  graphNodes.forEach((node, index) => {
    assertTopicGraphNode(
      node,
      `Topic graph node ${index + 1}`,
      timelineStageIndexes,
      laneIndexes,
      paperIds,
    )
    assertContract(
      !nodeIds.has(node.nodeId),
      `Topic graph node ${index + 1} duplicates nodeId "${node.nodeId}".`,
    )
    nodeIds.add(node.nodeId)
  })

  graphNodes.forEach((node, index) => {
    node.parentNodeIds.forEach((parentNodeId, parentIndex) =>
      assertContract(
        !parentNodeId || nodeIds.has(parentNodeId),
        `Topic graph node ${index + 1} parent ${parentIndex + 1} references "${parentNodeId}", but that node is missing from the backend payload.`,
      ),
    )
  })

  graphLanes.forEach((lane, index) => {
    assertContract(
      nodeIds.has(lane.latestNodeId),
      `Topic graph lane ${index + 1} references latestNodeId "${lane.latestNodeId}", but that node is missing from the backend payload.`,
    )
    assertContract(
      graphNodes.some((node) => node.anchorId === lane.latestAnchorId),
      `Topic graph lane ${index + 1} references latestAnchorId "${lane.latestAnchorId}", but that anchor is missing from the backend payload.`,
    )
  })

  assertRecord(
    value.generationState,
    'Topic view model is missing generation state from the backend contract.',
  )
  assertString(value.generationState.hero, 'Topic generationState is missing "hero".')
  assertString(value.generationState.stageTimeline, 'Topic generationState is missing "stageTimeline".')
  assertString(value.generationState.nodeCards, 'Topic generationState is missing "nodeCards".')
  assertString(value.generationState.closing, 'Topic generationState is missing "closing".')

  assertArray(value.resources, 'Topic view model is missing research resources from the backend contract.')
  value.resources.forEach((resource, index) =>
    assertResourceEntry(resource, `Topic resource ${index + 1}`),
  )

  assertRecord(value.chatContext, 'Topic view model is missing chatContext from the backend contract.')
  assertStringArray(
    value.chatContext.suggestedQuestions,
    'Topic view model is missing chat suggested questions from the backend contract.',
  )

  assertArray(value.unmappedPapers, 'Topic view model is missing unmappedPapers from the backend contract.')
  value.unmappedPapers.forEach((paper, index) => {
    const message = `Topic unmapped paper ${index + 1}`
    assertRecord(paper, `${message} is invalid.`)
    assertString(paper.paperId, `${message} is missing "paperId".`)
    assertString(paper.anchorId, `${message} is missing "anchorId".`)
    assertString(paper.route, `${message} is missing "route".`)
    assertString(paper.title, `${message} is missing "title".`)
    assertString(paper.titleEn, `${message} is missing "titleEn".`)
    assertString(paper.summary, `${message} is missing "summary".`, { allowEmpty: true })
    assertString(paper.publishedAt, `${message} is missing "publishedAt".`)
    assertStringArray(paper.authors, `${message} is missing "authors".`, { allowEmptyStrings: true })
    if (paper.citationCount != null) {
      assertNumber(paper.citationCount, `${message} has an invalid "citationCount".`, {
        integer: true,
        min: 0,
      })
    }
    assertContract(
      paper.coverImage == null || typeof paper.coverImage === 'string',
      `${message} has an invalid "coverImage".`,
    )
    if (paper.stageIndex != null) {
      assertNumber(paper.stageIndex, `${message} has an invalid "stageIndex".`, {
        integer: true,
        min: 1,
      })
    }
    assertString(paper.stageLabel, `${message} is missing "stageLabel".`, { allowEmpty: true })
  })

  assertString(value.narrativeArticle, 'Topic view model is missing "narrativeArticle".', {
    allowEmpty: true,
  })
  assertOptionalString(value.articleMarkdown, 'Topic view model has an invalid "articleMarkdown".', {
    allowEmpty: true,
  })
  assertRecord(
    value.closingEditorial,
    'Topic view model is missing closingEditorial from the backend contract.',
  )
  assertString(value.closingEditorial.title, 'Topic closingEditorial is missing "title".', {
    allowEmpty: true,
  })
  assertStringArray(
    value.closingEditorial.paragraphs,
    'Topic closingEditorial is missing "paragraphs".',
    { allowEmptyStrings: true },
  )
  assertString(
    value.closingEditorial.reviewerNote,
    'Topic closingEditorial is missing "reviewerNote".',
    { allowEmpty: true },
  )
}

export function assertNodeViewModelContract(
  value: unknown,
): asserts value is NodeViewModel {
  assertRecord(value, 'Node view model is unavailable from the backend contract.')
  assertString(value.schemaVersion, 'Node view model is missing "schemaVersion".')
  assertString(value.nodeId, 'Node view model is missing "nodeId".')
  assertString(value.title, 'Node view model is missing "title".')
  assertString(value.titleEn, 'Node view model is missing "titleEn".')
  assertNumber(value.stageIndex, 'Node view model is missing "stageIndex".', { integer: true, min: 0 })
  assertRecord(value.topic, 'Node view model is missing topic routing metadata.')
  assertString(value.topic.topicId, 'Node topic metadata is missing "topicId".')
  assertString(value.topic.route, 'Node topic metadata is missing "route".')
  assertRecord(value.stats, 'Node view model is missing "stats".')
  assertNumber(value.stats.paperCount, 'Node stats are missing "paperCount".', {
    integer: true,
    min: 0,
  })
  assertArray(value.paperRoles, 'Node view model is missing "paperRoles".')
  assertContract(value.paperRoles.length > 0, 'Node view model must include at least one paper role.')
  const paperRoleIds = new Set<string>()
  value.paperRoles.forEach((paperRole, index) => {
    assertRecord(paperRole, `Node paperRole ${index + 1} is invalid.`)
    assertString(paperRole.paperId, `Node paperRole ${index + 1} is missing "paperId".`)
    assertString(paperRole.title, `Node paperRole ${index + 1} is missing "title".`)
    assertString(paperRole.titleEn, `Node paperRole ${index + 1} is missing "titleEn".`)
    assertString(paperRole.route, `Node paperRole ${index + 1} is missing "route".`)
    assertString(paperRole.publishedAt, `Node paperRole ${index + 1} is missing "publishedAt".`)
    assertContract(
      !paperRoleIds.has(paperRole.paperId),
      `Node paperRole ${index + 1} duplicates paperId "${paperRole.paperId}".`,
    )
    paperRoleIds.add(paperRole.paperId)
  })
  assertContract(
    value.stats.paperCount === paperRoleIds.size,
    'Node stats.paperCount does not match the number of paperRoles returned by the backend.',
  )

  assertRecord(value.article, 'Node view model is missing "article".')
  assertArray(value.article.flow, 'Node article is missing "flow".')
  assertArray(value.article.sections, 'Node article is missing "sections".')
  assertStringArray(value.article.closing, 'Node article is missing "closing".', {
    allowEmptyStrings: true,
  })
  assertOptionalString(value.articleMarkdown, 'Node view model has an invalid "articleMarkdown".', {
    allowEmpty: true,
  })
  assertRecord(value.critique, 'Node view model is missing "critique".')
  assertString(value.critique.title, 'Node critique is missing "title".')
  assertStringArray(value.critique.bullets, 'Node critique is missing "bullets".', {
    allowEmptyStrings: true,
  })

  assertArray(value.evidence, 'Node view model is missing "evidence".')
  const evidenceAnchorIds = new Set<string>()
  value.evidence.forEach((entry, index) => {
    assertRecord(entry, `Node evidence ${index + 1} is invalid.`)
    assertString(entry.anchorId, `Node evidence ${index + 1} is missing "anchorId".`)
    assertOneOf(
      entry.type,
      NODE_EVIDENCE_TYPES,
      `Node evidence ${index + 1} has an unsupported "type".`,
    )
    assertString(entry.route, `Node evidence ${index + 1} is missing "route".`)
    if (entry.sourcePaperId != null) {
      assertString(entry.sourcePaperId, `Node evidence ${index + 1} has an invalid "sourcePaperId".`)
      assertContract(
        paperRoleIds.has(entry.sourcePaperId),
        `Node evidence ${index + 1} references missing paper "${entry.sourcePaperId}".`,
      )
    }
    assertContract(
      !evidenceAnchorIds.has(entry.anchorId),
      `Node evidence ${index + 1} duplicates anchorId "${entry.anchorId}".`,
    )
    evidenceAnchorIds.add(entry.anchorId)
  })

  assertRecord(
    value.researchView,
    'Node research view is unavailable because the backend did not return structured node research data.',
  )
  assertRecord(value.researchView.evidence, 'Node research view is missing evidence focus groups.')
  assertStringArray(
    value.researchView.evidence.featuredAnchorIds,
    'Node research view is missing "featuredAnchorIds".',
  )
  assertStringArray(
    value.researchView.evidence.supportingAnchorIds,
    'Node research view is missing "supportingAnchorIds".',
  )
  ;[
    ...value.researchView.evidence.featuredAnchorIds,
    ...value.researchView.evidence.supportingAnchorIds,
  ].forEach((anchorId, index) =>
    assertContract(
      evidenceAnchorIds.has(anchorId),
      `Node research view evidence anchor ${index + 1} references missing evidence "${anchorId}".`,
    ),
  )
  assertArray(value.researchView.evidence.featured, 'Node research view is missing "featured" evidence payloads.')
  value.researchView.evidence.featured.forEach((entry, index) =>
    assertEvidenceExplanation(entry, `Node research featured evidence ${index + 1}`, paperRoleIds),
  )
  assertArray(value.researchView.evidence.supporting, 'Node research view is missing "supporting" evidence payloads.')
  value.researchView.evidence.supporting.forEach((entry, index) =>
    assertEvidenceExplanation(entry, `Node research supporting evidence ${index + 1}`, paperRoleIds),
  )
  assertArray(value.researchView.evidence.paperBriefs, 'Node research view is missing "paperBriefs".')
  value.researchView.evidence.paperBriefs.forEach((entry, index) => {
    assertRecord(entry, `Node research paper brief ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research paper brief ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research paper brief ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertString(entry.paperTitle, `Node research paper brief ${index + 1} is missing "paperTitle".`)
    assertString(entry.role, `Node research paper brief ${index + 1} is missing "role".`)
    assertString(entry.summary, `Node research paper brief ${index + 1} is missing "summary".`, {
      allowEmpty: true,
    })
    assertString(entry.contribution, `Node research paper brief ${index + 1} is missing "contribution".`, {
      allowEmpty: true,
    })
    assertStringArray(
      entry.evidenceAnchorIds,
      `Node research paper brief ${index + 1} is missing "evidenceAnchorIds".`,
    )
    assertStringArray(entry.keyFigureIds, `Node research paper brief ${index + 1} is missing "keyFigureIds".`)
    assertStringArray(entry.keyTableIds, `Node research paper brief ${index + 1} is missing "keyTableIds".`)
    assertStringArray(entry.keyFormulaIds, `Node research paper brief ${index + 1} is missing "keyFormulaIds".`)
  })
  assertArray(value.researchView.evidence.evidenceChains, 'Node research view is missing "evidenceChains".')
  value.researchView.evidence.evidenceChains.forEach((entry, index) => {
    assertRecord(entry, `Node research evidence chain ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research evidence chain ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research evidence chain ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertString(entry.paperTitle, `Node research evidence chain ${index + 1} is missing "paperTitle".`)
    assertString(entry.subsectionKind, `Node research evidence chain ${index + 1} is missing "subsectionKind".`)
    assertString(entry.subsectionTitle, `Node research evidence chain ${index + 1} is missing "subsectionTitle".`)
    assertString(entry.summary, `Node research evidence chain ${index + 1} is missing "summary".`, {
      allowEmpty: true,
    })
    assertStringArray(
      entry.evidenceAnchorIds,
      `Node research evidence chain ${index + 1} is missing "evidenceAnchorIds".`,
    )
  })
  assertRecord(value.researchView.evidence.coverage, 'Node research view is missing "coverage".')
  const coverage = value.researchView.evidence.coverage
  ;([
    'totalEvidenceCount',
    'renderableEvidenceCount',
    'figureCount',
    'tableCount',
    'formulaCount',
    'sectionCount',
    'featuredCount',
    'supportingCount',
  ] as const).forEach((field) =>
    assertNumber(
      coverage[field],
      `Node research view coverage is missing "${field}".`,
      { integer: true, min: 0 },
    ),
  )

  assertRecord(value.researchView.methods, 'Node research view is missing methods.')
  assertArray(value.researchView.methods.entries, 'Node research methods are missing "entries".')
  value.researchView.methods.entries.forEach((entry, index) => {
    assertRecord(entry, `Node research method entry ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research method entry ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research method entry ${index + 1} references missing paper "${entry.paperId}".`,
    )
  })
  assertArray(value.researchView.methods.evolution, 'Node research methods are missing "evolution".')
  value.researchView.methods.evolution.forEach((entry, index) => {
    assertRecord(entry, `Node research evolution ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research evolution ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research evolution ${index + 1} references missing paper "${entry.paperId}".`,
    )
    if (entry.fromPaperId != null) {
      assertString(entry.fromPaperId, `Node research evolution ${index + 1} has an invalid "fromPaperId".`)
    }
    if (entry.toPaperId != null) {
      assertString(entry.toPaperId, `Node research evolution ${index + 1} has an invalid "toPaperId".`)
    }
    if (entry.anchorId != null) {
      assertString(entry.anchorId, `Node research evolution ${index + 1} has an invalid "anchorId".`)
      assertContract(
        evidenceAnchorIds.has(entry.anchorId),
        `Node research evolution ${index + 1} references missing evidence "${entry.anchorId}".`,
      )
    }
    if (entry.evidenceAnchorIds != null) {
      assertStringArray(
        entry.evidenceAnchorIds,
        `Node research evolution ${index + 1} has an invalid "evidenceAnchorIds".`,
      )
    }
  })
  assertStringArray(value.researchView.methods.dimensions, 'Node research methods are missing "dimensions".', {
    allowEmptyStrings: true,
  })
  assertRecord(value.researchView.problems, 'Node research view is missing problems.')
  assertArray(value.researchView.problems.items, 'Node research problems are missing "items".')
  value.researchView.problems.items.forEach((entry, index) => {
    assertRecord(entry, `Node research problem ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research problem ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research problem ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertOneOf(
      entry.status,
      NODE_PROBLEM_STATUSES,
      `Node research problem ${index + 1} has an unsupported "status".`,
    )
  })
  assertStringArray(value.researchView.problems.openQuestions, 'Node research problems are missing "openQuestions".', {
    allowEmptyStrings: true,
  })
  if (value.researchView.coreJudgment != null) {
    assertRecord(value.researchView.coreJudgment, 'Node research coreJudgment is invalid.')
    assertOneOf(
      value.researchView.coreJudgment.confidence,
      RESEARCH_CONFIDENCE,
      'Node research coreJudgment has an unsupported "confidence".',
    )
  }

  assertArray(
    value.references,
    'Node references are unavailable because the backend did not return the right workbench reference list.',
  )
  const referencePaperIds = new Set<string>()
  value.references.forEach((reference, index) => {
    assertRecord(reference, `Node reference ${index + 1} is invalid.`)
    assertString(reference.paperId, `Node reference ${index + 1} is missing "paperId".`)
    assertString(reference.title, `Node reference ${index + 1} is missing "title".`)
    assertContract(
      paperRoleIds.has(reference.paperId),
      `Node reference ${index + 1} references missing paper "${reference.paperId}".`,
    )
    assertContract(
      !referencePaperIds.has(reference.paperId),
      `Node reference ${index + 1} duplicates paperId "${reference.paperId}".`,
    )
    referencePaperIds.add(reference.paperId)
  })
  assertContract(
    referencePaperIds.size === paperRoleIds.size &&
      [...paperRoleIds].every((paperId) => referencePaperIds.has(paperId)),
    'Node references are out of sync with paperRoles; the workbench reference list must cover every node paper.',
  )
}

function assertNullableInteger(value: unknown, message: string, min = 0) {
  if (value == null) return
  assertNumber(value, message, { integer: true, min })
}

function assertResearchPipelineActionSummary(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(value.action, RESEARCH_NODE_ACTIONS, `${message} has an unsupported "action".`)
  if (value.nodeId != null) {
    assertString(value.nodeId, `${message} has an invalid "nodeId".`)
  }
  if (value.mergeIntoNodeId != null) {
    assertString(value.mergeIntoNodeId, `${message} has an invalid "mergeIntoNodeId".`)
  }
  assertString(value.title, `${message} is missing "title".`)
  assertStringArray(value.paperIds, `${message} is missing "paperIds".`)
  assertString(value.rationale, `${message} is missing "rationale".`, { allowEmpty: true })
}

function assertResearchPipelineDurationDecisionSummary(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(value.action, RESEARCH_DURATION_ACTIONS, `${message} has an unsupported "action".`)
  assertOneOf(value.reason, RESEARCH_DURATION_REASONS, `${message} has an unsupported "reason".`)
  assertNumber(value.currentStage, `${message} is missing "currentStage".`, { integer: true, min: 1 })
  assertNumber(value.nextStage, `${message} is missing "nextStage".`, { integer: true, min: 1 })
  assertBoolean(value.madeProgress, `${message} is missing "madeProgress".`)
  assertNumber(value.stallCountBefore, `${message} is missing "stallCountBefore".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.stallCountAfter, `${message} is missing "stallCountAfter".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.stallLimit, `${message} is missing "stallLimit".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.completedStageCycles, `${message} is missing "completedStageCycles".`, {
    integer: true,
    min: 0,
  })
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertString(value.rationale, `${message} is missing "rationale".`, { allowEmpty: true })
}

function assertResearchPipelineEntrySummary(value: unknown, message: string) {
  assertRecord(value, message)
  assertOptionalString(value.timestamp, `${message} has an invalid "timestamp".`)
  assertNullableInteger(value.stageIndex, `${message} has an invalid "stageIndex".`, 1)
  assertNullableInteger(value.roundIndex, `${message} has an invalid "roundIndex".`, 1)
  assertNumber(value.discovered, `${message} is missing "discovered".`, { integer: true, min: 0 })
  assertNumber(value.admitted, `${message} is missing "admitted".`, { integer: true, min: 0 })
  assertNumber(value.contentsGenerated, `${message} is missing "contentsGenerated".`, {
    integer: true,
    min: 0,
  })
  assertString(value.stageSummary, `${message} is missing "stageSummary".`, { allowEmpty: true })
  assertBoolean(value.shouldAdvanceStage, `${message} is missing "shouldAdvanceStage".`)
  if (value.durationDecision != null) {
    assertResearchPipelineDurationDecisionSummary(
      value.durationDecision,
      `${message} durationDecision`,
    )
  }
  assertStringArray(value.openQuestions, `${message} is missing "openQuestions".`, {
    allowEmptyStrings: true,
  })
  assertArray(value.nodeActions, `${message} is missing "nodeActions".`)
  value.nodeActions.forEach((entry, index) =>
    assertResearchPipelineActionSummary(entry, `${message} nodeAction ${index + 1}`),
  )
}

function assertResearchPipelineContextSummary(
  value: unknown,
  message: string,
): asserts value is ResearchPipelineContextSummary {
  assertRecord(value, message)
  assertOptionalString(value.updatedAt, `${message} has an invalid "updatedAt".`)
  if (value.lastRun != null) {
    assertResearchPipelineEntrySummary(value.lastRun, `${message} lastRun`)
  }
  if (value.currentStage != null) {
    assertResearchPipelineEntrySummary(value.currentStage, `${message} currentStage`)
  }
  assertArray(value.recentHistory, `${message} is missing "recentHistory".`)
  value.recentHistory.forEach((entry, index) =>
    assertResearchPipelineEntrySummary(entry, `${message} recentHistory ${index + 1}`),
  )
  assertStringArray(value.globalOpenQuestions, `${message} is missing "globalOpenQuestions".`, {
    allowEmptyStrings: true,
  })
  assertStringArray(value.continuityThreads, `${message} is missing "continuityThreads".`, {
    allowEmptyStrings: true,
  })
  assertRecord(value.subjectFocus, `${message} is missing "subjectFocus".`)
  assertOptionalString(value.subjectFocus.nodeId, `${message} subjectFocus has an invalid "nodeId".`)
  assertStringArray(value.subjectFocus.paperIds, `${message} subjectFocus is missing "paperIds".`)
  assertNullableInteger(value.subjectFocus.stageIndex, `${message} subjectFocus has an invalid "stageIndex".`, 1)
  assertArray(value.subjectFocus.relatedHistory, `${message} subjectFocus is missing "relatedHistory".`)
  value.subjectFocus.relatedHistory.forEach((entry, index) =>
    assertResearchPipelineEntrySummary(entry, `${message} subjectFocus relatedHistory ${index + 1}`),
  )
  assertStringArray(
    value.subjectFocus.relatedNodeActions,
    `${message} subjectFocus is missing "relatedNodeActions".`,
    { allowEmptyStrings: true },
  )
}

function assertResearchTaskConfig(value: unknown, message: string, topicId: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertString(value.name, `${message} is missing "name".`)
  assertString(value.cronExpression, `${message} is missing "cronExpression".`)
  assertBoolean(value.enabled, `${message} is missing "enabled".`)
  if (value.topicId != null) {
    assertString(value.topicId, `${message} has an invalid "topicId".`)
    assertContract(
      value.topicId === topicId,
      `${message} drifted to topicId "${value.topicId}" instead of "${topicId}".`,
    )
  }
  assertOneOf(
    value.action,
    ['discover', 'refresh', 'sync'] as const,
    `${message} has an unsupported "action".`,
  )
  if (value.researchMode != null) {
    assertOneOf(value.researchMode, RESEARCH_MODES, `${message} has an unsupported "researchMode".`)
  }
  if (value.options != null) {
    assertRecord(value.options, `${message} options are invalid.`)
    if (value.options.stageDurationDays != null) {
      assertNumber(
        value.options.stageDurationDays,
        `${message} options have an invalid "stageDurationDays".`,
        {
          integer: true,
          min: 1,
        },
      )
    }
    if (value.options.durationHours != null) {
      assertNumber(value.options.durationHours, `${message} options have an invalid "durationHours".`, {
        min: 1,
      })
    }
    if (value.options.cycleDelayMs != null) {
      assertNumber(value.options.cycleDelayMs, `${message} options have an invalid "cycleDelayMs".`, {
        integer: true,
        min: 0,
      })
    }
    assertNullableInteger(value.options.stageIndex, `${message} options have an invalid "stageIndex".`, 1)
    if (value.options.maxIterations != null) {
      assertNumber(value.options.maxIterations, `${message} options have an invalid "maxIterations".`, {
        integer: true,
        min: 1,
      })
    }
    if (value.options.stageRounds != null) {
      assertArray(value.options.stageRounds, `${message} options have an invalid "stageRounds".`)
      value.options.stageRounds.forEach((entry, index) => {
        assertRecord(entry, `${message} stageRound ${index + 1} is invalid.`)
        assertNumber(entry.stageIndex, `${message} stageRound ${index + 1} is missing "stageIndex".`, {
          integer: true,
          min: 1,
        })
        assertNumber(entry.rounds, `${message} stageRound ${index + 1} is missing "rounds".`, {
          integer: true,
          min: 1,
        })
      })
    }
  }
}

function assertResearchTaskProgress(value: unknown, message: string, topicId: string) {
  assertRecord(value, message)
  assertString(value.taskId, `${message} is missing "taskId".`)
  assertString(value.topicId, `${message} is missing "topicId".`)
  assertContract(
    value.topicId === topicId,
    `${message} drifted to topicId "${value.topicId}" instead of "${topicId}".`,
  )
  assertString(value.topicName, `${message} is missing "topicName".`)
  assertOneOf(value.researchMode, RESEARCH_MODES, `${message} has an unsupported "researchMode".`)
  if (value.durationHours != null) {
    assertNumber(value.durationHours, `${message} has an invalid "durationHours".`, { min: 1 })
  }
  assertNumber(value.currentStage, `${message} is missing "currentStage".`, { integer: true, min: 0 })
  assertNumber(value.totalStages, `${message} is missing "totalStages".`, { integer: true, min: 0 })
  assertNumber(value.stageProgress, `${message} is missing "stageProgress".`, { min: 0 })
  assertNumber(value.currentStageRuns, `${message} is missing "currentStageRuns".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.currentStageTargetRuns, `${message} is missing "currentStageTargetRuns".`, {
    integer: true,
    min: 0,
  })
  assertRecord(value.stageRunMap, `${message} is missing "stageRunMap".`)
  Object.entries(value.stageRunMap).forEach(([key, runCount]) =>
    assertNumber(runCount, `${message} stageRunMap entry "${key}" is invalid.`, {
      integer: true,
      min: 0,
    }),
  )
  assertNumber(value.totalRuns, `${message} is missing "totalRuns".`, { integer: true, min: 0 })
  assertNumber(value.successfulRuns, `${message} is missing "successfulRuns".`, { integer: true, min: 0 })
  assertNumber(value.failedRuns, `${message} is missing "failedRuns".`, { integer: true, min: 0 })
  assertNumber(value.discoveredPapers, `${message} is missing "discoveredPapers".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.admittedPapers, `${message} is missing "admittedPapers".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.generatedContents, `${message} is missing "generatedContents".`, {
    integer: true,
    min: 0,
  })
  assertOptionalString(value.lastRunAt, `${message} has an invalid "lastRunAt".`)
  if (value.lastRunResult != null) {
    assertOneOf(
      value.lastRunResult,
      ['success', 'failed', 'partial'] as const,
      `${message} has an unsupported "lastRunResult".`,
    )
  }
  assertOptionalString(value.startedAt, `${message} has an invalid "startedAt".`)
  assertOptionalString(value.deadlineAt, `${message} has an invalid "deadlineAt".`)
  assertOptionalString(value.completedAt, `${message} has an invalid "completedAt".`)
  assertOptionalString(value.activeSessionId, `${message} has an invalid "activeSessionId".`)
  assertNumber(value.completedStageCycles, `${message} is missing "completedStageCycles".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.currentStageStalls, `${message} is missing "currentStageStalls".`, {
    integer: true,
    min: 0,
  })
  assertOptionalString(value.latestSummary, `${message} has an invalid "latestSummary".`, {
    allowEmpty: true,
  })
  assertOneOf(value.status, RESEARCH_PROGRESS_STATUSES, `${message} has an unsupported "status".`)
}

function assertResearchRunReport(value: unknown, message: string, topicId: string) {
  assertRecord(value, message)
  assertString(value.schemaVersion, `${message} is missing "schemaVersion".`)
  assertString(value.reportId, `${message} is missing "reportId".`)
  assertString(value.taskId, `${message} is missing "taskId".`)
  assertString(value.topicId, `${message} is missing "topicId".`)
  assertContract(
    value.topicId === topicId,
    `${message} drifted to topicId "${value.topicId}" instead of "${topicId}".`,
  )
  assertString(value.topicName, `${message} is missing "topicName".`)
  assertOneOf(value.researchMode, RESEARCH_MODES, `${message} has an unsupported "researchMode".`)
  assertOneOf(value.trigger, RESEARCH_TRIGGERS, `${message} has an unsupported "trigger".`)
  assertOneOf(value.status, RESEARCH_RUN_STATUSES, `${message} has an unsupported "status".`)
  if (value.durationHours != null) {
    assertNumber(value.durationHours, `${message} has an invalid "durationHours".`, { min: 1 })
  }
  assertString(value.startedAt, `${message} is missing "startedAt".`)
  assertOptionalString(value.deadlineAt, `${message} has an invalid "deadlineAt".`)
  assertOptionalString(value.completedAt, `${message} has an invalid "completedAt".`)
  assertString(value.updatedAt, `${message} is missing "updatedAt".`)
  assertNumber(value.currentStage, `${message} is missing "currentStage".`, { integer: true, min: 0 })
  assertNumber(value.totalStages, `${message} is missing "totalStages".`, { integer: true, min: 0 })
  assertNumber(value.completedStageCycles, `${message} is missing "completedStageCycles".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.totalRuns, `${message} is missing "totalRuns".`, { integer: true, min: 0 })
  assertNumber(value.successfulRuns, `${message} is missing "successfulRuns".`, { integer: true, min: 0 })
  assertNumber(value.failedRuns, `${message} is missing "failedRuns".`, { integer: true, min: 0 })
  assertNumber(value.discoveredPapers, `${message} is missing "discoveredPapers".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.admittedPapers, `${message} is missing "admittedPapers".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.generatedContents, `${message} is missing "generatedContents".`, {
    integer: true,
    min: 0,
  })
  assertOptionalString(value.latestStageSummary, `${message} has an invalid "latestStageSummary".`, {
    allowEmpty: true,
  })
  assertString(value.headline, `${message} is missing "headline".`, { allowEmpty: true })
  assertString(value.dek, `${message} is missing "dek".`, { allowEmpty: true })
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertStringArray(value.paragraphs, `${message} is missing "paragraphs".`, {
    allowEmptyStrings: true,
  })
  assertStringArray(value.keyMoves, `${message} is missing "keyMoves".`, {
    allowEmptyStrings: true,
  })
  assertStringArray(value.openQuestions, `${message} is missing "openQuestions".`, {
    allowEmptyStrings: true,
  })
  assertArray(value.latestNodeActions, `${message} is missing "latestNodeActions".`)
  value.latestNodeActions.forEach((entry, index) => {
    assertRecord(entry, `${message} latestNodeAction ${index + 1} is invalid.`)
    assertOneOf(
      entry.action,
      RESEARCH_NODE_ACTIONS,
      `${message} latestNodeAction ${index + 1} has an unsupported "action".`,
    )
    assertNullableInteger(
      entry.stageIndex,
      `${message} latestNodeAction ${index + 1} has an invalid "stageIndex".`,
      1,
    )
    assertString(entry.title, `${message} latestNodeAction ${index + 1} is missing "title".`)
    assertString(
      entry.rationale,
      `${message} latestNodeAction ${index + 1} is missing "rationale".`,
      { allowEmpty: true },
    )
    assertOptionalString(
      entry.nodeId,
      `${message} latestNodeAction ${index + 1} has an invalid "nodeId".`,
    )
    assertOptionalString(
      entry.mergeIntoNodeId,
      `${message} latestNodeAction ${index + 1} has an invalid "mergeIntoNodeId".`,
    )
  })
}

function assertTopicResearchSessionState(value: unknown, message: string, topicId: string) {
  assertRecord(value, message)
  if (value.task != null) {
    assertResearchTaskConfig(value.task, `${message} task`, topicId)
  }
  if (value.progress != null) {
    assertResearchTaskProgress(value.progress, `${message} progress`, topicId)
  }
  if (value.report != null) {
    assertResearchRunReport(value.report, `${message} report`, topicId)
  }
  assertBoolean(value.active, `${message} is missing "active".`)
  assertRecord(value.strategy, `${message} is missing "strategy".`)
  assertNumber(value.strategy.cycleDelayMs, `${message} strategy is missing "cycleDelayMs".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.strategy.stageStallLimit, `${message} strategy is missing "stageStallLimit".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.strategy.reportPasses, `${message} strategy is missing "reportPasses".`, {
    integer: true,
    min: 0,
  })
  assertNumber(
    value.strategy.currentStageStalls,
    `${message} strategy is missing "currentStageStalls".`,
    { integer: true, min: 0 },
  )
}

function assertTopicSessionMemoryContext(value: unknown, message: string) {
  assertRecord(value, message)
  assertOptionalString(value.updatedAt, `${message} has an invalid "updatedAt".`)
  assertOptionalString(value.initializedAt, `${message} has an invalid "initializedAt".`)
  assertOptionalString(value.lastCompactedAt, `${message} has an invalid "lastCompactedAt".`)
  assertRecord(value.summary, `${message} is missing "summary".`)
  assertString(value.summary.currentFocus, `${message} summary is missing "currentFocus".`, {
    allowEmpty: true,
  })
  assertString(value.summary.continuity, `${message} summary is missing "continuity".`, {
    allowEmpty: true,
  })
  assertStringArray(
    value.summary.establishedJudgments,
    `${message} summary is missing "establishedJudgments".`,
    { allowEmptyStrings: true },
  )
  assertStringArray(value.summary.openQuestions, `${message} summary is missing "openQuestions".`, {
    allowEmptyStrings: true,
  })
  assertStringArray(
    value.summary.researchMomentum,
    `${message} summary is missing "researchMomentum".`,
    { allowEmptyStrings: true },
  )
  assertString(value.summary.conversationStyle, `${message} summary is missing "conversationStyle".`, {
    allowEmpty: true,
  })
  assertString(value.summary.lastResearchMove, `${message} summary is missing "lastResearchMove".`, {
    allowEmpty: true,
  })
  assertString(value.summary.lastUserIntent, `${message} summary is missing "lastUserIntent".`, {
    allowEmpty: true,
  })
  assertArray(value.recentEvents, `${message} is missing "recentEvents".`)
  value.recentEvents.forEach((entry, index) => {
    assertRecord(entry, `${message} recentEvent ${index + 1} is invalid.`)
    assertString(entry.id, `${message} recentEvent ${index + 1} is missing "id".`)
    assertOneOf(
      entry.kind,
      SESSION_MEMORY_EVENT_KINDS,
      `${message} recentEvent ${index + 1} has an unsupported "kind".`,
    )
    assertString(entry.headline, `${message} recentEvent ${index + 1} is missing "headline".`)
    assertString(entry.summary, `${message} recentEvent ${index + 1} is missing "summary".`, {
      allowEmpty: true,
    })
    assertOptionalString(entry.detail, `${message} recentEvent ${index + 1} has an invalid "detail".`, {
      allowEmpty: true,
    })
    assertNullableInteger(
      entry.stageIndex,
      `${message} recentEvent ${index + 1} has an invalid "stageIndex".`,
      1,
    )
    if (entry.nodeIds != null) {
      assertStringArray(entry.nodeIds, `${message} recentEvent ${index + 1} has an invalid "nodeIds".`)
    }
    if (entry.paperIds != null) {
      assertStringArray(entry.paperIds, `${message} recentEvent ${index + 1} has an invalid "paperIds".`)
    }
    if (entry.citationAnchorIds != null) {
      assertStringArray(
        entry.citationAnchorIds,
        `${message} recentEvent ${index + 1} has an invalid "citationAnchorIds".`,
      )
    }
    if (entry.openQuestions != null) {
      assertStringArray(
        entry.openQuestions,
        `${message} recentEvent ${index + 1} has an invalid "openQuestions".`,
        { allowEmptyStrings: true },
      )
    }
    assertString(entry.createdAt, `${message} recentEvent ${index + 1} is missing "createdAt".`)
  })
}

function assertTopicResearchWorld(
  value: unknown,
  message: string,
  topicId: string,
) {
  assertRecord(value, message)
  assertString(value.schemaVersion, `${message} is missing "schemaVersion".`)
  assertString(value.topicId, `${message} is missing "topicId".`)
  assertContract(
    value.topicId === topicId,
    `${message} drifted to topicId "${value.topicId}" instead of "${topicId}".`,
  )
  assertNumber(value.version, `${message} is missing "version".`, { integer: true, min: 0 })
  assertString(value.updatedAt, `${message} is missing "updatedAt".`)
  assertString(value.language, `${message} is missing "language".`)
  assertRecord(value.summary, `${message} is missing "summary".`)
  assertString(value.summary.thesis, `${message} summary is missing "thesis".`, { allowEmpty: true })
  assertString(value.summary.currentFocus, `${message} summary is missing "currentFocus".`, {
    allowEmpty: true,
  })
  assertString(value.summary.continuity, `${message} summary is missing "continuity".`, {
    allowEmpty: true,
  })
  assertString(
    value.summary.dominantQuestion,
    `${message} summary is missing "dominantQuestion".`,
    { allowEmpty: true },
  )
  assertString(
    value.summary.dominantCritique,
    `${message} summary is missing "dominantCritique".`,
    { allowEmpty: true },
  )
  assertString(value.summary.agendaHeadline, `${message} summary is missing "agendaHeadline".`, {
    allowEmpty: true,
  })
  assertOneOf(
    value.summary.maturity,
    RESEARCH_WORLD_MATURITY,
    `${message} summary has an unsupported "maturity".`,
  )

  assertArray(value.stages, `${message} is missing "stages".`)
  const stages = value.stages as Array<Record<string, unknown>>
  const stageIds = collectUniqueIds(
    stages.map((stage, index) => {
      assertRecord(stage, `${message} stage ${index + 1} is invalid.`)
      assertString(stage.id, `${message} stage ${index + 1} is missing "id".`)
      assertNumber(stage.stageIndex, `${message} stage ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 1,
      })
      assertString(stage.title, `${message} stage ${index + 1} is missing "title".`)
      assertString(stage.titleEn, `${message} stage ${index + 1} is missing "titleEn".`)
      assertString(stage.summary, `${message} stage ${index + 1} is missing "summary".`, {
        allowEmpty: true,
      })
      assertStringArray(stage.nodeIds, `${message} stage ${index + 1} is missing "nodeIds".`)
      assertStringArray(stage.paperIds, `${message} stage ${index + 1} is missing "paperIds".`)
      assertOneOf(
        stage.confidence,
        RESEARCH_CONFIDENCE,
        `${message} stage ${index + 1} has an unsupported "confidence".`,
      )
      assertOneOf(
        stage.status,
        RESEARCH_WORLD_STAGE_STATUSES,
        `${message} stage ${index + 1} has an unsupported "status".`,
      )
      return stage.id
    }),
    (id) => `${message} contains duplicate stage id "${id}".`,
  )
  const stageIndexes = new Set<number>()
  stages.forEach((stage, index) => {
    const stageIndex = stage.stageIndex as number
    assertContract(
      !stageIndexes.has(stageIndex),
      `${message} stage ${index + 1} duplicates stageIndex ${String(stageIndex)}.`,
    )
    stageIndexes.add(stageIndex)
  })

  assertArray(value.papers, `${message} is missing "papers".`)
  const papers = value.papers as Array<Record<string, unknown>>
  const paperIds = collectUniqueIds(
    papers.map((paper, index) => {
      assertRecord(paper, `${message} paper ${index + 1} is invalid.`)
      assertString(paper.id, `${message} paper ${index + 1} is missing "id".`)
      assertString(paper.title, `${message} paper ${index + 1} is missing "title".`)
      assertString(paper.titleEn, `${message} paper ${index + 1} is missing "titleEn".`)
      assertString(paper.summary, `${message} paper ${index + 1} is missing "summary".`, {
        allowEmpty: true,
      })
      assertContract(
        paper.coverImage == null || typeof paper.coverImage === 'string',
        `${message} paper ${index + 1} has an invalid "coverImage".`,
      )
      assertString(paper.publishedAt, `${message} paper ${index + 1} is missing "publishedAt".`)
      assertStringArray(paper.nodeIds, `${message} paper ${index + 1} is missing "nodeIds".`)
      assertArray(paper.stageIndexes, `${message} paper ${index + 1} is missing "stageIndexes".`)
      const paperStageIndexes = paper.stageIndexes as unknown[]
      paperStageIndexes.forEach((stageIndex, stageIndexPosition) =>
        assertNumber(
          stageIndex,
          `${message} paper ${index + 1} stageIndex ${stageIndexPosition + 1} is invalid.`,
          { integer: true, min: 1 },
        ),
      )
      return paper.id
    }),
    (id) => `${message} contains duplicate paper id "${id}".`,
  )

  assertArray(value.nodes, `${message} is missing "nodes".`)
  const nodes = value.nodes as Array<Record<string, unknown>>
  const nodeIds = collectUniqueIds(
    nodes.map((node, index) => {
      assertRecord(node, `${message} node ${index + 1} is invalid.`)
      assertString(node.id, `${message} node ${index + 1} is missing "id".`)
      assertNumber(node.stageIndex, `${message} node ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 1,
      })
      assertContract(
        stageIndexes.has(node.stageIndex),
        `${message} node ${index + 1} references missing stageIndex ${String(node.stageIndex)}.`,
      )
      assertString(node.title, `${message} node ${index + 1} is missing "title".`)
      assertString(node.subtitle, `${message} node ${index + 1} is missing "subtitle".`, {
        allowEmpty: true,
      })
      assertString(node.summary, `${message} node ${index + 1} is missing "summary".`, {
        allowEmpty: true,
      })
      assertStringArray(node.paperIds, `${message} node ${index + 1} is missing "paperIds".`)
      if (node.primaryPaperId != null) {
        assertString(node.primaryPaperId, `${message} node ${index + 1} has an invalid "primaryPaperId".`)
      }
      assertContract(
        node.coverImage == null || typeof node.coverImage === 'string',
        `${message} node ${index + 1} has an invalid "coverImage".`,
      )
      assertOneOf(
        node.confidence,
        RESEARCH_CONFIDENCE,
        `${message} node ${index + 1} has an unsupported "confidence".`,
      )
      assertOneOf(
        node.maturity,
        RESEARCH_WORLD_MATURITY,
        `${message} node ${index + 1} has an unsupported "maturity".`,
      )
      assertString(node.keyQuestion, `${message} node ${index + 1} is missing "keyQuestion".`, {
        allowEmpty: true,
      })
      assertString(
        node.dominantCritique,
        `${message} node ${index + 1} is missing "dominantCritique".`,
        { allowEmpty: true },
      )
      return node.id
    }),
    (id) => `${message} contains duplicate node id "${id}".`,
  )

  stages.forEach((stage, index) => {
    const stageNodeIds = stage.nodeIds as string[]
    const stagePaperIds = stage.paperIds as string[]
    stageNodeIds.forEach((nodeId, nodeIndex) =>
      assertContract(
        nodeIds.has(nodeId),
        `${message} stage ${index + 1} node ${nodeIndex + 1} references missing node "${nodeId}".`,
      ),
    )
    stagePaperIds.forEach((paperId, paperIndex) =>
      assertContract(
        paperIds.has(paperId),
        `${message} stage ${index + 1} paper ${paperIndex + 1} references missing paper "${paperId}".`,
      ),
    )
  })
  nodes.forEach((node, index) => {
    const nodePaperIds = node.paperIds as string[]
    nodePaperIds.forEach((paperId, paperIndex) =>
      assertContract(
        paperIds.has(paperId),
        `${message} node ${index + 1} paper ${paperIndex + 1} references missing paper "${paperId}".`,
      ),
    )
    if (node.primaryPaperId != null) {
      assertContract(
        nodePaperIds.includes(node.primaryPaperId as string),
        `${message} node ${index + 1} primaryPaperId "${node.primaryPaperId}" is missing from paperIds.`,
      )
    }
  })
  papers.forEach((paper, index) => {
    const paperNodeIds = paper.nodeIds as string[]
    const paperStageIndexes = paper.stageIndexes as unknown[]
    paperNodeIds.forEach((nodeId, nodeIndex) =>
      assertContract(
        nodeIds.has(nodeId),
        `${message} paper ${index + 1} node ${nodeIndex + 1} references missing node "${nodeId}".`,
      ),
    )
    paperStageIndexes.forEach((stageIndex, stageIndexPosition) => {
      assertNumber(
        stageIndex,
        `${message} paper ${index + 1} stageIndex ${stageIndexPosition + 1} is invalid.`,
        { integer: true, min: 1 },
      )
      assertContract(
        stageIndexes.has(stageIndex),
        `${message} paper ${index + 1} stageIndex ${stageIndexPosition + 1} references missing stage ${String(stageIndex)}.`,
      )
    })
  })

  const claimIds = new Set<string>()
  assertArray(value.claims, `${message} is missing "claims".`)
  const claims = value.claims as Array<Record<string, unknown>>
  claims.forEach((claim, index) => {
    assertRecord(claim, `${message} claim ${index + 1} is invalid.`)
    assertString(claim.id, `${message} claim ${index + 1} is missing "id".`)
    assertContract(!claimIds.has(claim.id), `${message} claim ${index + 1} duplicates id "${claim.id}".`)
    claimIds.add(claim.id)
    assertOneOf(claim.scope, RESEARCH_WORLD_SCOPE_TYPES, `${message} claim ${index + 1} has an unsupported "scope".`)
    assertString(claim.scopeId, `${message} claim ${index + 1} is missing "scopeId".`)
    assertString(claim.statement, `${message} claim ${index + 1} is missing "statement".`)
    assertOneOf(claim.kind, RESEARCH_WORLD_CLAIM_KINDS, `${message} claim ${index + 1} has an unsupported "kind".`)
    assertOneOf(
      claim.confidence,
      RESEARCH_CONFIDENCE,
      `${message} claim ${index + 1} has an unsupported "confidence".`,
    )
    assertOneOf(
      claim.status,
      RESEARCH_WORLD_CLAIM_STATUSES,
      `${message} claim ${index + 1} has an unsupported "status".`,
    )
    assertStringArray(claim.supportPaperIds, `${message} claim ${index + 1} is missing "supportPaperIds".`)
    assertStringArray(claim.supportNodeIds, `${message} claim ${index + 1} is missing "supportNodeIds".`)
    assertOneOf(claim.source, RESEARCH_WORLD_SOURCES, `${message} claim ${index + 1} has an unsupported "source".`)
    if (claim.scope === 'topic') {
      assertContract(
        claim.scopeId === topicId,
        `${message} claim ${index + 1} must reference topicId "${topicId}" when scope is "topic".`,
      )
    } else if (claim.scope === 'stage') {
      assertContract(
        stageIds.has(claim.scopeId),
        `${message} claim ${index + 1} references missing stage "${claim.scopeId}".`,
      )
    } else if (claim.scope === 'node') {
      assertContract(
        nodeIds.has(claim.scopeId),
        `${message} claim ${index + 1} references missing node "${claim.scopeId}".`,
      )
    } else {
      assertContract(
        paperIds.has(claim.scopeId),
        `${message} claim ${index + 1} references missing paper "${claim.scopeId}".`,
      )
    }
    claim.supportPaperIds.forEach((paperId, paperIndex) =>
      assertContract(
        paperIds.has(paperId),
        `${message} claim ${index + 1} supportPaperId ${paperIndex + 1} references missing paper "${paperId}".`,
      ),
    )
    claim.supportNodeIds.forEach((nodeId, nodeIndex) =>
      assertContract(
        nodeIds.has(nodeId),
        `${message} claim ${index + 1} supportNodeId ${nodeIndex + 1} references missing node "${nodeId}".`,
      ),
    )
  })

  assertArray(value.questions, `${message} is missing "questions".`)
  const questions = value.questions as Array<Record<string, unknown>>
  questions.forEach((question, index) => {
    assertRecord(question, `${message} question ${index + 1} is invalid.`)
    assertString(question.id, `${message} question ${index + 1} is missing "id".`)
    assertOneOf(
      question.scope,
      RESEARCH_WORLD_SCOPE_TYPES,
      `${message} question ${index + 1} has an unsupported "scope".`,
    )
    assertString(question.scopeId, `${message} question ${index + 1} is missing "scopeId".`)
    assertString(question.question, `${message} question ${index + 1} is missing "question".`)
    assertOneOf(
      question.priority,
      RESEARCH_WORLD_PRIORITIES,
      `${message} question ${index + 1} has an unsupported "priority".`,
    )
    assertOneOf(
      question.source,
      RESEARCH_WORLD_QUESTION_SOURCES,
      `${message} question ${index + 1} has an unsupported "source".`,
    )
    assertOneOf(
      question.status,
      ['open'] as const,
      `${message} question ${index + 1} has an unsupported "status".`,
    )
  })

  assertArray(value.critiques, `${message} is missing "critiques".`)
  const critiques = value.critiques as Array<Record<string, unknown>>
  critiques.forEach((critique, index) => {
    assertRecord(critique, `${message} critique ${index + 1} is invalid.`)
    assertString(critique.id, `${message} critique ${index + 1} is missing "id".`)
    assertOneOf(
      critique.targetType,
      RESEARCH_WORLD_CRITIQUE_TARGETS,
      `${message} critique ${index + 1} has an unsupported "targetType".`,
    )
    assertString(critique.targetId, `${message} critique ${index + 1} is missing "targetId".`)
    assertString(critique.summary, `${message} critique ${index + 1} is missing "summary".`, {
      allowEmpty: true,
    })
    assertOneOf(
      critique.source,
      RESEARCH_WORLD_SOURCES,
      `${message} critique ${index + 1} has an unsupported "source".`,
    )
    assertOneOf(
      critique.severity,
      RESEARCH_WORLD_CRITIQUE_SEVERITIES,
      `${message} critique ${index + 1} has an unsupported "severity".`,
    )
    assertBoolean(critique.resolved, `${message} critique ${index + 1} is missing "resolved".`)
  })

  assertArray(value.agenda, `${message} is missing "agenda".`)
  const agenda = value.agenda as Array<Record<string, unknown>>
  agenda.forEach((item, index) => {
    assertRecord(item, `${message} agenda item ${index + 1} is invalid.`)
    assertString(item.id, `${message} agenda item ${index + 1} is missing "id".`)
    assertOneOf(
      item.kind,
      RESEARCH_WORLD_AGENDA_KINDS,
      `${message} agenda item ${index + 1} has an unsupported "kind".`,
    )
    assertOneOf(
      item.targetType,
      RESEARCH_WORLD_CRITIQUE_TARGETS,
      `${message} agenda item ${index + 1} has an unsupported "targetType".`,
    )
    assertString(item.targetId, `${message} agenda item ${index + 1} is missing "targetId".`)
    assertString(item.title, `${message} agenda item ${index + 1} is missing "title".`)
    assertString(item.rationale, `${message} agenda item ${index + 1} is missing "rationale".`, {
      allowEmpty: true,
    })
    assertNumber(item.priorityScore, `${message} agenda item ${index + 1} is missing "priorityScore".`)
    assertString(
      item.suggestedPrompt,
      `${message} agenda item ${index + 1} is missing "suggestedPrompt".`,
      { allowEmpty: true },
    )
    assertOneOf(
      item.status,
      ['queued'] as const,
      `${message} agenda item ${index + 1} has an unsupported "status".`,
    )
  })

  const assertWorldTarget = (targetType: string, targetId: string, detail: string) => {
    if (targetType === 'topic') {
      assertContract(targetId === topicId, `${detail} must reference topicId "${topicId}".`)
      return
    }
    if (targetType === 'stage') {
      assertContract(stageIds.has(targetId), `${detail} references missing stage "${targetId}".`)
      return
    }
    if (targetType === 'node') {
      assertContract(nodeIds.has(targetId), `${detail} references missing node "${targetId}".`)
      return
    }
    if (targetType === 'paper') {
      assertContract(paperIds.has(targetId), `${detail} references missing paper "${targetId}".`)
      return
    }
    assertContract(claimIds.has(targetId), `${detail} references missing claim "${targetId}".`)
  }

  questions.forEach((question, index) =>
    assertWorldTarget(
      question.scope as string,
      question.scopeId as string,
      `${message} question ${index + 1}`,
    ),
  )
  critiques.forEach((critique, index) =>
    assertWorldTarget(
      critique.targetType as string,
      critique.targetId as string,
      `${message} critique ${index + 1}`,
    ),
  )
  agenda.forEach((item, index) =>
    assertWorldTarget(
      item.targetType as string,
      item.targetId as string,
      `${message} agenda item ${index + 1}`,
    ),
  )
}

function assertTopicGuidanceLedgerState(
  value: unknown,
  message: string,
  topicId: string,
) {
  assertRecord(value, message)
  assertString(value.schemaVersion, `${message} is missing "schemaVersion".`)
  assertString(value.topicId, `${message} is missing "topicId".`)
  assertContract(
    value.topicId === topicId,
    `${message} drifted to topicId "${value.topicId}" instead of "${topicId}".`,
  )
  assertOptionalString(value.updatedAt, `${message} has an invalid "updatedAt".`)
  assertArray(value.directives, `${message} is missing "directives".`)
  const directives = value.directives as Array<Record<string, unknown>>
  const directiveStatuses = GUIDANCE_STATUSES.filter((status) => status !== 'none')
  const directiveWindows = GUIDANCE_WINDOWS.filter((window) => window !== 'none')
  const directiveIds = collectUniqueIds(
    directives.map((directive, index) => {
      assertRecord(directive, `${message} directive ${index + 1} is invalid.`)
      assertString(directive.id, `${message} directive ${index + 1} is missing "id".`)
      assertString(directive.topicId, `${message} directive ${index + 1} is missing "topicId".`)
      assertContract(
        directive.topicId === topicId,
        `${message} directive ${index + 1} drifted to topicId "${directive.topicId}" instead of "${topicId}".`,
      )
      assertString(
        directive.sourceMessageId,
        `${message} directive ${index + 1} is missing "sourceMessageId".`,
      )
      assertOneOf(
        directive.messageKind,
        GUIDANCE_CLASSIFICATIONS,
        `${message} directive ${index + 1} has an unsupported "messageKind".`,
      )
      assertOneOf(
        directive.scopeType,
        GUIDANCE_SCOPE_TYPES,
        `${message} directive ${index + 1} has an unsupported "scopeType".`,
      )
      if (directive.scopeId != null) {
        assertString(directive.scopeId, `${message} directive ${index + 1} has an invalid "scopeId".`, {
          allowEmpty: true,
        })
      }
      assertString(directive.scopeLabel, `${message} directive ${index + 1} is missing "scopeLabel".`, {
        allowEmpty: true,
      })
      assertOneOf(
        directive.directiveType,
        GUIDANCE_DIRECTIVE_TYPES,
        `${message} directive ${index + 1} has an unsupported "directiveType".`,
      )
      assertString(
        directive.instruction,
        `${message} directive ${index + 1} is missing "instruction".`,
      )
      assertString(directive.rationale, `${message} directive ${index + 1} is missing "rationale".`, {
        allowEmpty: true,
      })
      assertString(
        directive.effectSummary,
        `${message} directive ${index + 1} is missing "effectSummary".`,
        { allowEmpty: true },
      )
      assertString(directive.promptHint, `${message} directive ${index + 1} is missing "promptHint".`, {
        allowEmpty: true,
      })
      assertOneOf(
        directive.strength,
        GUIDANCE_STRENGTHS,
        `${message} directive ${index + 1} has an unsupported "strength".`,
      )
      assertOneOf(
        directive.status,
        directiveStatuses,
        `${message} directive ${index + 1} has an unsupported "status".`,
      )
      assertOneOf(
        directive.appliesToRuns,
        directiveWindows,
        `${message} directive ${index + 1} has an unsupported "appliesToRuns".`,
      )
      assertOptionalString(
        directive.lastAppliedAt,
        `${message} directive ${index + 1} has an invalid "lastAppliedAt".`,
      )
      assertNullableInteger(
        directive.lastAppliedStageIndex,
        `${message} directive ${index + 1} has an invalid "lastAppliedStageIndex".`,
        1,
      )
      assertString(
        directive.lastAppliedSummary,
        `${message} directive ${index + 1} is missing "lastAppliedSummary".`,
        { allowEmpty: true },
      )
      assertString(directive.createdAt, `${message} directive ${index + 1} is missing "createdAt".`)
      assertString(directive.updatedAt, `${message} directive ${index + 1} is missing "updatedAt".`)
      return directive.id
    }),
    (id) => `${message} contains duplicate directive id "${id}".`,
  )

  if (value.latestApplication != null) {
    assertRecord(value.latestApplication, `${message} latestApplication is invalid.`)
    assertString(value.latestApplication.appliedAt, `${message} latestApplication is missing "appliedAt".`)
    assertNullableInteger(
      value.latestApplication.stageIndex,
      `${message} latestApplication has an invalid "stageIndex".`,
      1,
    )
    assertString(value.latestApplication.summary, `${message} latestApplication is missing "summary".`, {
      allowEmpty: true,
    })
    assertArray(value.latestApplication.directives, `${message} latestApplication is missing "directives".`)
    value.latestApplication.directives.forEach((directive, index) => {
      assertRecord(directive, `${message} latestApplication directive ${index + 1} is invalid.`)
      assertString(
        directive.directiveId,
        `${message} latestApplication directive ${index + 1} is missing "directiveId".`,
      )
      assertContract(
        directiveIds.has(directive.directiveId),
        `${message} latestApplication directive ${index + 1} references missing directive "${directive.directiveId}".`,
      )
      assertOneOf(
        directive.directiveType,
        GUIDANCE_DIRECTIVE_TYPES,
        `${message} latestApplication directive ${index + 1} has an unsupported "directiveType".`,
      )
      assertString(
        directive.scopeLabel,
        `${message} latestApplication directive ${index + 1} is missing "scopeLabel".`,
        { allowEmpty: true },
      )
      assertString(
        directive.instruction,
        `${message} latestApplication directive ${index + 1} is missing "instruction".`,
      )
      assertOneOf(
        directive.status,
        directiveStatuses,
        `${message} latestApplication directive ${index + 1} has an unsupported "status".`,
      )
      assertString(
        directive.note,
        `${message} latestApplication directive ${index + 1} is missing "note".`,
        { allowEmpty: true },
      )
    })
  }

  assertRecord(value.summary, `${message} is missing "summary".`)
  assertNumber(value.summary.activeDirectiveCount, `${message} summary is missing "activeDirectiveCount".`, {
    integer: true,
    min: 0,
  })
  assertNumber(
    value.summary.acceptedDirectiveCount,
    `${message} summary is missing "acceptedDirectiveCount".`,
    { integer: true, min: 0 },
  )
  assertNumber(
    value.summary.deferredDirectiveCount,
    `${message} summary is missing "deferredDirectiveCount".`,
    { integer: true, min: 0 },
  )
  assertString(value.summary.latestDirective, `${message} summary is missing "latestDirective".`, {
    allowEmpty: true,
  })
  assertString(value.summary.focusHeadline, `${message} summary is missing "focusHeadline".`, {
    allowEmpty: true,
  })
  assertString(value.summary.styleHeadline, `${message} summary is missing "styleHeadline".`, {
    allowEmpty: true,
  })
  assertString(
    value.summary.challengeHeadline,
    `${message} summary is missing "challengeHeadline".`,
    { allowEmpty: true },
  )
  assertString(
    value.summary.latestAppliedSummary,
    `${message} summary is missing "latestAppliedSummary".`,
    { allowEmpty: true },
  )
  assertOptionalString(
    value.summary.latestAppliedAt,
    `${message} summary has an invalid "latestAppliedAt".`,
  )
  assertNumber(
    value.summary.latestAppliedDirectiveCount,
    `${message} summary is missing "latestAppliedDirectiveCount".`,
    { integer: true, min: 0 },
  )
}

function assertTopicCognitiveMemoryEntry(
  value: unknown,
  message: string,
  expectedKind: (typeof COGNITIVE_MEMORY_KINDS)[number],
) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.kind, COGNITIVE_MEMORY_KINDS, `${message} has an unsupported "kind".`)
  assertContract(value.kind === expectedKind, `${message} must have kind "${expectedKind}".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.summary, `${message} is missing "summary".`, { allowEmpty: true })
  assertOneOf(value.source, COGNITIVE_MEMORY_SOURCES, `${message} has an unsupported "source".`)
  assertOptionalString(value.updatedAt, `${message} has an invalid "updatedAt".`)
}

function assertTopicCognitiveMemoryPack(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.focus, `${message} is missing "focus".`, { allowEmpty: true })
  assertString(value.continuity, `${message} is missing "continuity".`, { allowEmpty: true })
  assertString(
    value.conversationContract,
    `${message} is missing "conversationContract".`,
    { allowEmpty: true },
  )
  assertArray(value.projectMemories, `${message} is missing "projectMemories".`)
  value.projectMemories.forEach((entry, index) =>
    assertTopicCognitiveMemoryEntry(entry, `${message} projectMemory ${index + 1}`, 'project'),
  )
  assertArray(value.feedbackMemories, `${message} is missing "feedbackMemories".`)
  value.feedbackMemories.forEach((entry, index) =>
    assertTopicCognitiveMemoryEntry(entry, `${message} feedbackMemory ${index + 1}`, 'feedback'),
  )
  assertArray(value.referenceMemories, `${message} is missing "referenceMemories".`)
  value.referenceMemories.forEach((entry, index) =>
    assertTopicCognitiveMemoryEntry(entry, `${message} referenceMemory ${index + 1}`, 'reference'),
  )
}

function assertMissingKey(value: Record<string, unknown>, key: string, message: string) {
  assertContract(!(key in value), message)
}

function assertTopicExportStageDossier(
  value: unknown,
  message: string,
  topicNodeIds: Set<string>,
): asserts value is TopicExportStageDossier {
  assertRecord(value, message)
  assertMissingKey(value, 'paperCount', `${message} must not expose retired "paperCount".`)
  assertMissingKey(value, 'paperIds', `${message} must not expose retired "paperIds".`)
  assertNumber(value.stageIndex, `${message} is missing "stageIndex".`, { integer: true, min: 1 })
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.titleEn, `${message} is missing "titleEn".`)
  assertString(value.description, `${message} is missing "description".`, { allowEmpty: true })
  assertString(value.branchLabel, `${message} is missing "branchLabel".`)
  assertString(value.branchColor, `${message} is missing "branchColor".`)
  assertString(value.yearLabel, `${message} is missing "yearLabel".`, { allowEmpty: true })
  assertString(value.dateLabel, `${message} is missing "dateLabel".`, { allowEmpty: true })
  assertString(value.timeLabel, `${message} is missing "timeLabel".`, { allowEmpty: true })
  assertString(value.stageThesis, `${message} is missing "stageThesis".`, { allowEmpty: true })
  assertTopicStageEditorial(value.editorial, `${message} editorial`)
  assertNumber(value.nodeCount, `${message} is missing "nodeCount".`, { integer: true, min: 0 })
  assertStringArray(value.nodeIds, `${message} is missing "nodeIds".`)
  assertContract(
    value.nodeCount === value.nodeIds.length,
    `${message} nodeCount does not match the number of nodeIds.`,
  )
  value.nodeIds.forEach((nodeId, index) =>
    assertContract(
      topicNodeIds.has(nodeId),
      `${message} nodeId ${index + 1} references missing topic node "${nodeId}".`,
    ),
  )
  assertResearchPipelineContextSummary(value.pipeline, `${message} pipeline`)
}

function assertNotebookNodeDossier(
  value: unknown,
  message: string,
  topicId: string,
  topicStageIndexes: Set<number>,
  topicPaperIds: Set<string>,
): asserts value is NodeViewModel {
  assertNodeViewModelContract(value)
  assertRecord(value, message)
  assertContract(
    value.topic.topicId === topicId,
    `${message} drifted to topicId "${value.topic.topicId}" instead of "${topicId}".`,
  )
  assertContract(
    topicStageIndexes.has(value.stageIndex),
    `${message} references missing stageIndex ${String(value.stageIndex)}.`,
  )
  assertString(value.headline, `${message} is missing "headline".`, { allowEmpty: true })
  assertString(value.standfirst, `${message} is missing "standfirst".`, { allowEmpty: true })
  const paperRoleIds = new Set<string>()
  value.paperRoles.forEach((paperRole, index) => {
    assertString(paperRole.summary, `${message} paperRole ${index + 1} is missing "summary".`, {
      allowEmpty: true,
    })
    assertString(paperRole.role, `${message} paperRole ${index + 1} is missing "role".`)
    assertString(
      paperRole.contribution,
      `${message} paperRole ${index + 1} is missing "contribution".`,
      { allowEmpty: true },
    )
    assertContract(
      topicPaperIds.has(paperRole.paperId),
      `${message} paperRole ${index + 1} references missing topic paper "${paperRole.paperId}".`,
    )
    paperRoleIds.add(paperRole.paperId)
  })
  assertArray(value.comparisonBlocks, `${message} is missing "comparisonBlocks".`)
  value.comparisonBlocks.forEach((block, index) =>
    assertCrossPaperComparisonBlock(block, `${message} comparisonBlock ${index + 1}`, paperRoleIds),
  )
  value.article.flow.forEach((block, index) =>
    assertArticleFlowBlock(block, `${message} article flow ${index + 1}`),
  )
  value.article.sections.forEach((section, index) =>
    assertArticleSection(section, `${message} article section ${index + 1}`),
  )
  assertReviewerCritique(value.critique, `${message} critique`)
  const evidenceAnchorIds = new Set<string>()
  value.evidence.forEach((entry, index) => {
    assertEvidenceExplanation(entry, `${message} evidence ${index + 1}`, paperRoleIds)
    assertContract(
      !evidenceAnchorIds.has(entry.anchorId),
      `${message} evidence ${index + 1} duplicates anchorId "${entry.anchorId}".`,
    )
    evidenceAnchorIds.add(entry.anchorId)
  })
}

export function assertPaperViewModelContract(
  value: unknown,
): asserts value is PaperViewModel {
  assertRecord(value, 'Paper view model is unavailable from the backend contract.')
  assertString(value.schemaVersion, 'Paper view model is missing "schemaVersion".')
  assertString(value.paperId, 'Paper view model is missing "paperId".')
  assertString(value.title, 'Paper view model is missing "title".')
  assertString(value.titleEn, 'Paper view model is missing "titleEn".')
  assertString(value.summary, 'Paper view model is missing "summary".', { allowEmpty: true })
  assertString(value.explanation, 'Paper view model is missing "explanation".', {
    allowEmpty: true,
  })
  assertString(value.publishedAt, 'Paper view model is missing "publishedAt".')
  assertStringArray(value.authors, 'Paper view model is missing "authors".', {
    allowEmptyStrings: true,
  })
  assertContract(
    value.citationCount == null ||
      (typeof value.citationCount === 'number' &&
        Number.isFinite(value.citationCount) &&
        value.citationCount >= 0),
    'Paper view model has an invalid "citationCount".',
  )
  assertContract(
    value.coverImage == null || typeof value.coverImage === 'string',
    'Paper view model has an invalid "coverImage".',
  )
  assertOptionalString(value.originalUrl, 'Paper view model has an invalid "originalUrl".', {
    allowEmpty: true,
  })
  assertOptionalString(value.pdfUrl, 'Paper view model has an invalid "pdfUrl".', { allowEmpty: true })
  assertRecord(value.topic, 'Paper view model is missing topic metadata.')
  assertString(value.topic.topicId, 'Paper topic metadata is missing "topicId".')
  assertString(value.topic.title, 'Paper topic metadata is missing "title".')
  assertString(value.topic.route, 'Paper topic metadata is missing "route".')
  if (value.stageWindowMonths != null) {
    assertNumber(value.stageWindowMonths, 'Paper view model has an invalid "stageWindowMonths".', {
      integer: true,
      min: 1,
    })
  }
  assertRecord(value.stats, 'Paper view model is missing "stats".')
  assertNumber(value.stats.sectionCount, 'Paper stats are missing "sectionCount".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.figureCount, 'Paper stats are missing "figureCount".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.tableCount, 'Paper stats are missing "tableCount".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.formulaCount, 'Paper stats are missing "formulaCount".', {
    integer: true,
    min: 0,
  })
  assertNumber(value.stats.relatedNodeCount, 'Paper stats are missing "relatedNodeCount".', {
    integer: true,
    min: 0,
  })
  assertArray(value.relatedNodes, 'Paper view model is missing "relatedNodes".')
  const relatedNodeIds = collectUniqueIds(
    value.relatedNodes.map((node, index) => {
      assertRecord(node, `Paper relatedNode ${index + 1} is invalid.`)
      assertString(node.nodeId, `Paper relatedNode ${index + 1} is missing "nodeId".`)
      assertString(node.title, `Paper relatedNode ${index + 1} is missing "title".`)
      assertString(node.subtitle, `Paper relatedNode ${index + 1} is missing "subtitle".`, {
        allowEmpty: true,
      })
      assertString(node.summary, `Paper relatedNode ${index + 1} is missing "summary".`, {
        allowEmpty: true,
      })
      assertNumber(node.stageIndex, `Paper relatedNode ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 0,
      })
      assertOptionalString(
        node.stageLabel,
        `Paper relatedNode ${index + 1} has an invalid "stageLabel".`,
        { allowEmpty: true },
      )
      assertString(node.route, `Paper relatedNode ${index + 1} is missing "route".`)
      return node.nodeId
    }),
    (nodeId) => `Paper relatedNodes duplicate nodeId "${nodeId}".`,
  )
  assertContract(
    relatedNodeIds.size === value.stats.relatedNodeCount,
    'Paper stats.relatedNodeCount does not match the number of relatedNodes returned by the backend.',
  )
  assertString(value.standfirst, 'Paper view model is missing "standfirst".', { allowEmpty: true })
  assertRecord(value.article, 'Paper view model is missing "article".')
  assertString(value.article.periodLabel, 'Paper article is missing "periodLabel".', {
    allowEmpty: true,
  })
  assertString(value.article.timeRangeLabel, 'Paper article is missing "timeRangeLabel".', {
    allowEmpty: true,
  })
  assertArray(value.article.flow, 'Paper article is missing "flow".')
  value.article.flow.forEach((block, index) =>
    assertArticleFlowBlock(block, `Paper article flow ${index + 1}`),
  )
  assertArray(value.article.sections, 'Paper article is missing "sections".')
  value.article.sections.forEach((section, index) =>
    assertArticleSection(section, `Paper article section ${index + 1}`),
  )
  assertStringArray(value.article.closing, 'Paper article is missing "closing".', {
    allowEmptyStrings: true,
  })
  assertReviewerCritique(value.critique, 'Paper critique')
  assertArray(value.evidence, 'Paper view model is missing "evidence".')
  value.evidence.forEach((entry, index) =>
    assertEvidenceExplanation(entry, `Paper evidence ${index + 1}`),
  )
  if (value.references != null) {
    assertArray(value.references, 'Paper references are invalid.')
    value.references.forEach((reference, index) => {
      assertRecord(reference, `Paper reference ${index + 1} is invalid.`)
      assertString(reference.paperId, `Paper reference ${index + 1} is missing "paperId".`)
      assertString(reference.title, `Paper reference ${index + 1} is missing "title".`)
      assertOptionalString(reference.titleEn, `Paper reference ${index + 1} has an invalid "titleEn".`, {
        allowEmpty: true,
      })
      assertOptionalString(reference.route, `Paper reference ${index + 1} has an invalid "route".`, {
        allowEmpty: true,
      })
      assertOptionalString(
        reference.publishedAt,
        `Paper reference ${index + 1} has an invalid "publishedAt".`,
        { allowEmpty: true },
      )
      if (reference.authors != null) {
        assertStringArray(
          reference.authors,
          `Paper reference ${index + 1} has an invalid "authors".`,
          { allowEmptyStrings: true },
        )
      }
      assertContract(
        reference.citationCount == null ||
          (typeof reference.citationCount === 'number' &&
            Number.isFinite(reference.citationCount) &&
            reference.citationCount >= 0),
        `Paper reference ${index + 1} has an invalid "citationCount".`,
      )
      assertOptionalString(reference.originalUrl, `Paper reference ${index + 1} has an invalid "originalUrl".`, {
        allowEmpty: true,
      })
      assertOptionalString(reference.pdfUrl, `Paper reference ${index + 1} has an invalid "pdfUrl".`, {
        allowEmpty: true,
      })
    })
  }
}

export function assertTopicResearchExportBundleContract(
  value: unknown,
): asserts value is TopicResearchExportBundle {
  assertRecord(value, 'Topic research export bundle is unavailable from the backend contract.')
  assertContract(
    value.schemaVersion === 'topic-export-bundle-v2',
    `Topic research export bundle has an unsupported schemaVersion "${String(value.schemaVersion)}".`,
  )
  assertMissingKey(
    value,
    'paperDossiers',
    'Topic research export bundle must not expose retired "paperDossiers".',
  )
  assertString(value.exportedAt, 'Topic research export bundle is missing "exportedAt".')
  assertTopicViewModelContract(value.topic)
  const topicId = value.topic.topicId
  if (value.report != null) {
    assertResearchRunReport(value.report, 'Topic research export bundle report', topicId)
  }
  assertTopicResearchWorld(value.world, 'Topic research export bundle world', topicId)
  assertTopicGuidanceLedgerState(value.guidance, 'Topic research export bundle guidance', topicId)
  assertRecord(value.pipeline, 'Topic research export bundle is missing "pipeline".')
  assertOptionalString(value.pipeline.updatedAt, 'Topic research export bundle pipeline has an invalid "updatedAt".')
  assertResearchPipelineContextSummary(value.pipeline.overview, 'Topic research export bundle pipeline overview')
  assertTopicSessionMemoryContext(value.sessionMemory, 'Topic research export bundle sessionMemory')

  const topicNodeIds = new Set(value.topic.graph.nodes.map((node) => node.nodeId))
  const topicPaperIds = new Set(value.topic.papers.map((paper) => paper.paperId))
  const topicStageIndexes = new Set(value.topic.stages.map((stage) => stage.stageIndex))

  assertArray(value.stageDossiers, 'Topic research export bundle is missing "stageDossiers".')
  const stageIndexes = collectUniqueIds(
    value.stageDossiers.map((stage, index) => {
      assertTopicExportStageDossier(stage, `Topic export stageDossier ${index + 1}`, topicNodeIds)
      return String(stage.stageIndex)
    }),
    (stageIndex) => `Topic export stageDossiers duplicate stageIndex "${stageIndex}".`,
  )
  assertContract(
    stageIndexes.size === topicStageIndexes.size &&
      [...topicStageIndexes].every((stageIndex) => stageIndexes.has(String(stageIndex))),
    'Topic export stageDossiers are out of sync with the topic stages returned by the backend.',
  )

  assertArray(value.nodeDossiers, 'Topic research export bundle is missing "nodeDossiers".')
  const nodeDossierIds = collectUniqueIds(
    value.nodeDossiers.map((node, index) => {
      assertNotebookNodeDossier(
        node,
        `Topic export nodeDossier ${index + 1}`,
        topicId,
        topicStageIndexes,
        topicPaperIds,
      )
      return node.nodeId
    }),
    (nodeId) => `Topic export nodeDossiers duplicate nodeId "${nodeId}".`,
  )
  assertContract(
    nodeDossierIds.size === topicNodeIds.size &&
      [...topicNodeIds].every((nodeId) => nodeDossierIds.has(nodeId)),
    'Topic export nodeDossiers are out of sync with the topic graph returned by the backend.',
  )
}

export function assertTopicResearchExportBatchContract(
  value: unknown,
): asserts value is TopicResearchExportBatch {
  assertRecord(value, 'Topic research export batch is unavailable from the backend contract.')
  assertContract(
    value.schemaVersion === 'topic-export-batch-v2',
    `Topic research export batch has an unsupported schemaVersion "${String(value.schemaVersion)}".`,
  )
  assertString(value.exportedAt, 'Topic research export batch is missing "exportedAt".')
  assertNumber(value.topicCount, 'Topic research export batch is missing "topicCount".', {
    integer: true,
    min: 0,
  })
  assertArray(value.bundles, 'Topic research export batch is missing "bundles".')
  value.bundles.forEach((bundle) => assertTopicResearchExportBundleContract(bundle))
  assertContract(
    value.topicCount === value.bundles.length,
    'Topic research export batch topicCount does not match the number of bundles returned by the backend.',
  )
}

export function assertTopicResearchSessionContract(
  value: unknown,
  topicId: string,
): asserts value is TopicResearchSessionState {
  assertTopicResearchSessionState(
    value,
    'Topic research session is unavailable from the backend contract.',
    topicId,
  )
}

export function assertTopicResearchBriefContract(
  value: unknown,
): asserts value is TopicResearchBrief {
  assertRecord(value, 'Topic research brief is unavailable from the backend contract.')
  assertString(value.topicId, 'Topic research brief is missing "topicId".')
  assertTopicResearchSessionState(value.session, 'Topic research brief session', value.topicId)
  assertResearchPipelineContextSummary(value.pipeline, 'Topic research brief pipeline')
  assertTopicSessionMemoryContext(value.sessionMemory, 'Topic research brief sessionMemory')
  assertTopicResearchWorld(value.world, 'Topic research brief world', value.topicId)
  assertTopicGuidanceLedgerState(value.guidance, 'Topic research brief guidance', value.topicId)
  assertTopicCognitiveMemoryPack(value.cognitiveMemory, 'Topic research brief cognitiveMemory')
}
