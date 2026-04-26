import type { TopicChatResponse } from '../omni/types'
import type { NodeViewModel, PaperViewModel } from './alpha-reader'
import type { EvidencePayload, TopicViewModel } from './alpha-topic'
import type {
  TopicExportBundle,
  TopicExportBundleBatch,
  TopicExportStageDossier,
} from './export-bundle'

const CITATION_TYPES = ['paper', 'node', 'figure', 'table', 'formula', 'section'] as const
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
const NODE_EVIDENCE_TYPES = ['section', 'figure', 'table', 'formula'] as const
const NODE_PROBLEM_STATUSES = ['solved', 'partial', 'open'] as const
const RESEARCH_CONFIDENCE = ['high', 'medium', 'low', 'speculative'] as const
const RESEARCH_MODES = ['stage-rounds', 'duration'] as const
const RESEARCH_PROGRESS_STATUSES = ['active', 'paused', 'completed', 'failed'] as const
const RESEARCH_RUN_STATUSES = ['running', 'completed', 'failed', 'paused'] as const
const RESEARCH_TRIGGERS = ['manual', 'scheduled'] as const
const RESEARCH_NODE_ACTIONS = ['create', 'update', 'merge', 'strengthen'] as const
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
const RESEARCH_WORLD_SOURCES = ['judgment', 'report', 'session', 'structure'] as const
const RESEARCH_WORLD_QUESTION_SOURCES = ['judgment', 'report', 'pipeline', 'session', 'structure'] as const
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
const GUIDANCE_CLASSIFICATIONS = ['ask', 'suggest', 'challenge', 'focus', 'style', 'command'] as const
const GUIDANCE_STATUSES = ['accepted', 'partial', 'deferred', 'rejected', 'superseded', 'consumed', 'none'] as const
const GUIDANCE_WINDOWS = ['next-run', 'until-cleared', 'current-session', 'none'] as const
const GUIDANCE_DIRECTIVE_TYPES = ['suggest', 'challenge', 'focus', 'style', 'constraint', 'command'] as const
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

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertMissingKey(value: Record<string, unknown>, key: string, message: string) {
  assertContract(!(key in value), message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertContract(isRecord(value), message)
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  assertContract(Array.isArray(value), message)
}

function assertString(value: unknown, message: string, allowEmpty = false): asserts value is string {
  assertContract(typeof value === 'string', message)
  if (!allowEmpty) {
    assertContract(value.trim().length > 0, message)
  }
}

function assertOptionalString(value: unknown, message: string, allowEmpty = false) {
  if (value == null) return
  assertString(value, message, allowEmpty)
}

function assertOptionalAssetPath(value: unknown, message: string) {
  if (value == null) return
  assertString(value, message)
  assertContract(!value.includes('\\'), message)

  if (/^(?:https?:\/\/|data:)/iu.test(value)) {
    return
  }

  assertContract(
    value.startsWith('/uploads/') || value.startsWith('/papers/'),
    message,
  )
  assertContract(!value.startsWith('/uploads/images/'), message)
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
  if (options.integer) assertContract(Number.isInteger(value), message)
  if (typeof options.min === 'number') assertContract(value >= options.min, message)
}

function assertStringArray(value: unknown, message: string, allowEmptyStrings = false): asserts value is string[] {
  assertArray(value, message)
  value.forEach((item, index) => assertString(item, `${message} (item ${index + 1})`, allowEmptyStrings))
}

function assertTopicCardEditorial(value: unknown, message: string) {
    assertRecord(value, `${message} is invalid.`)
    // Allow missing editorial fields with fallback to empty strings
    // This ensures backwards compatibility while content generation is improved
    if (value.eyebrow === undefined || value.eyebrow === null) {
      value.eyebrow = ''
    }
    if (value.digest === undefined || value.digest === null) {
      value.digest = ''
    }
    if (value.whyNow === undefined || value.whyNow === null) {
      value.whyNow = ''
    }
    if (value.nextQuestion === undefined || value.nextQuestion === null) {
      value.nextQuestion = ''
    }
    assertString(value.eyebrow, `${message} is missing "eyebrow".`, true)
    assertString(value.digest, `${message} is missing "digest".`, true)
    assertString(value.whyNow, `${message} is missing "whyNow".`, true)
    assertString(value.nextQuestion, `${message} is missing "nextQuestion".`, true)
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

export type BackendTopicListItem = {
  id: string
  nameZh: string
  nameEn?: string | null
  focusLabel?: string | null
  summary?: string | null
  createdAt?: string
  localization?: Record<string, unknown> | null
}

export function assertEvidencePayloadContract(value: unknown): asserts value is EvidencePayload {
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
  assertString(value.quote, 'Evidence payload is missing "quote".', true)
  assertString(value.content, 'Evidence payload is missing "content".', true)
  assertOptionalString(value.whyItMatters, 'Evidence payload has an invalid "whyItMatters".', true)
  assertOptionalString(value.placementHint, 'Evidence payload has an invalid "placementHint".', true)
  if (value.importance != null) {
    assertNumber(value.importance, 'Evidence payload has an invalid "importance".', { min: 0 })
  }
  assertOptionalAssetPath(value.thumbnailPath, 'Evidence payload has an invalid "thumbnailPath".')
  if (value.metadata != null) {
    assertRecord(value.metadata, 'Evidence payload has an invalid "metadata".')
  }
}

export function assertTopicChatResponseContract(value: unknown): asserts value is TopicChatResponse {
  assertRecord(value, 'Topic chat response is unavailable from the backend contract.')
  assertString(value.messageId, 'Topic chat response is missing "messageId".')
  assertString(value.answer, 'Topic chat response is missing "answer".')
  assertArray(value.citations, 'Topic chat response is missing "citations".')
  value.citations.forEach((citation, index) => {
    assertRecord(citation, `Topic chat citation ${index + 1} is invalid.`)
    assertString(citation.anchorId, `Topic chat citation ${index + 1} is missing "anchorId".`)
    assertOneOf(citation.type, CITATION_TYPES, `Topic chat citation ${index + 1} has an unsupported "type".`)
    assertString(citation.route, `Topic chat citation ${index + 1} is missing "route".`)
    assertString(citation.label, `Topic chat citation ${index + 1} is missing "label".`)
    assertString(citation.quote, `Topic chat citation ${index + 1} is missing "quote".`, true)
  })
  assertArray(value.suggestedActions, 'Topic chat response is missing "suggestedActions".')
  value.suggestedActions.forEach((action, index) => {
    assertRecord(action, `Topic chat suggestedAction ${index + 1} is invalid.`)
    assertString(action.label, `Topic chat suggestedAction ${index + 1} is missing "label".`)
    assertOneOf(
      action.action,
      ['explain', 'compare', 'summarize', 'navigate', 'show_evidence'] as const,
      `Topic chat suggestedAction ${index + 1} has an unsupported "action".`,
    )
    assertOptionalString(action.targetId, `Topic chat suggestedAction ${index + 1} has an invalid "targetId".`, true)
    assertOptionalString(action.description, `Topic chat suggestedAction ${index + 1} has an invalid "description".`, true)
  })
  if (value.workbenchAction != null) {
    assertRecord(value.workbenchAction, 'Topic chat workbenchAction is invalid.')
    assertOneOf(value.workbenchAction.kind, WORKBENCH_ACTION_KINDS, 'Topic chat workbenchAction has an unsupported "kind".')
    assertString(value.workbenchAction.summary, 'Topic chat workbenchAction is missing "summary".')
    if (value.workbenchAction.targetTab != null) {
      assertOneOf(value.workbenchAction.targetTab, WORKBENCH_TABS, 'Topic chat workbenchAction has an unsupported "targetTab".')
    }
    if (value.workbenchAction.targetResearchView != null) {
      assertOneOf(
        value.workbenchAction.targetResearchView,
        RESEARCH_VIEWS,
        'Topic chat workbenchAction has an unsupported "targetResearchView".',
      )
    }
  }
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
    assertOptionalString(topic.nameEn, `${message} has an invalid "nameEn".`, true)
    assertOptionalString(topic.focusLabel, `${message} has an invalid "focusLabel".`, true)
    assertOptionalString(topic.summary, `${message} has an invalid "summary".`, true)
    assertOptionalString(topic.createdAt, `${message} has an invalid "createdAt".`, true)
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
  assertString(value.thesis, `${message} is missing "thesis".`, true)
  assertNumber(value.paperCount, `${message} is missing "paperCount".`, { integer: true, min: 0 })
  assertString(value.keyPaperTitle, `${message} is missing "keyPaperTitle".`, true)
  assertBoolean(value.isMilestone, `${message} is missing "isMilestone".`)
}

function assertTopicDashboardMethodEvolutionEntry(value: unknown, message: string) {
  assertRecord(value, message)
  assertNumber(value.year, `${message} is missing "year".`, { integer: true, min: 0 })
  assertString(value.methodName, `${message} is missing "methodName".`)
  assertString(value.paperId, `${message} is missing "paperId".`)
  assertString(value.paperTitle, `${message} is missing "paperTitle".`)
  assertString(value.contribution, `${message} is missing "contribution".`, true)
  assertOneOf(value.impact, ['high', 'medium', 'low'] as const, `${message} has an unsupported "impact".`)
}

function assertTopicDashboardActiveAuthor(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.name, `${message} is missing "name".`)
  assertOptionalString(value.affiliation, `${message} has an invalid "affiliation".`, true)
  assertNumber(value.paperCount, `${message} is missing "paperCount".`, { integer: true, min: 0 })
  assertNumber(value.citationCount, `${message} is missing "citationCount".`, { integer: true, min: 0 })
  assertStringArray(value.keyPapers, `${message} is missing "keyPapers".`, true)
  assertStringArray(value.researchFocus, `${message} is missing "researchFocus".`, true)
}

function assertTopicDashboardPendingPaper(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.paperId, `${message} is missing "paperId".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.publishedAt, `${message} is missing "publishedAt".`)
  if (value.stageIndex != null) {
    assertNumber(value.stageIndex, `${message} has an invalid "stageIndex".`, { integer: true, min: 1 })
  }
  assertString(value.stageLabel, `${message} is missing "stageLabel".`, true)
  assertString(value.summary, `${message} is missing "summary".`, true)
  assertString(value.route, `${message} is missing "route".`)
}

export function assertTopicDashboardContract(value: unknown) {
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
  assertNumber(value.stats.totalPapers, 'Topic dashboard stats are missing "totalPapers".', { integer: true, min: 0 })
  assertNumber(value.stats.mappedPapers, 'Topic dashboard stats are missing "mappedPapers".', { integer: true, min: 0 })
  assertNumber(value.stats.pendingPapers, 'Topic dashboard stats are missing "pendingPapers".', { integer: true, min: 0 })
  assertNumber(value.stats.totalNodes, 'Topic dashboard stats are missing "totalNodes".', { integer: true, min: 0 })
  assertNumber(value.stats.totalStages, 'Topic dashboard stats are missing "totalStages".', { integer: true, min: 0 })
  assertNumber(value.stats.mappedStages, 'Topic dashboard stats are missing "mappedStages".', { integer: true, min: 0 })
  assertNumber(value.stats.timeSpanYears, 'Topic dashboard stats are missing "timeSpanYears".', { integer: true, min: 0 })
  assertNumber(value.stats.avgPapersPerNode, 'Topic dashboard stats are missing "avgPapersPerNode".', { min: 0 })
  assertNumber(value.stats.citationCoverage, 'Topic dashboard stats are missing "citationCoverage".', { min: 0 })
  assertStringArray(value.keyInsights, 'Topic dashboard is missing "keyInsights".', true)
  assertRecord(value.trends, 'Topic dashboard is missing "trends".')
  assertStringArray(value.trends.emergingTopics, 'Topic dashboard trends are missing "emergingTopics".', true)
  assertStringArray(value.trends.decliningTopics, 'Topic dashboard trends are missing "decliningTopics".', true)
  assertStringArray(value.trends.methodShifts, 'Topic dashboard trends are missing "methodShifts".', true)
  assertArray(value.pendingPapers, 'Topic dashboard is missing "pendingPapers".')
  value.pendingPapers.forEach((entry, index) =>
    assertTopicDashboardPendingPaper(entry, `Topic dashboard pending paper ${index + 1}`),
  )
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
  assertString(value.quote, `${message} is missing "quote".`, true)
  assertString(value.content, `${message} is missing "content".`, true)
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
  assertOptionalString(value.sourcePaperTitle, `${message} has an invalid "sourcePaperTitle".`, true)
  assertOptionalAssetPath(value.imagePath, `${message} has an invalid "imagePath".`)
  assertOptionalString(value.whyItMatters, `${message} has an invalid "whyItMatters".`, true)
  assertContract(
    value.formulaLatex == null || typeof value.formulaLatex === 'string',
    `${message} has an invalid "formulaLatex".`,
  )
  if (value.tableHeaders != null) {
    assertStringArray(value.tableHeaders, `${message} has an invalid "tableHeaders".`, true)
  }
  if (value.tableRows != null) {
    assertArray(value.tableRows, `${message} has an invalid "tableRows".`)
  }
  assertOptionalString(value.explanation, `${message} has an invalid "explanation".`, true)
  if (value.importance != null) {
    assertNumber(value.importance, `${message} has an invalid "importance".`, { min: 0 })
  }
  assertOptionalString(value.placementHint, `${message} has an invalid "placementHint".`, true)
  assertOptionalAssetPath(value.thumbnailPath, `${message} has an invalid "thumbnailPath".`)
}

function assertReviewerCritique(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.summary, `${message} is missing "summary".`, true)
  assertStringArray(value.bullets, `${message} is missing "bullets".`, true)
}

function assertArticleSection(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.kind, ARTICLE_SECTION_KINDS, `${message} has an unsupported "kind".`)
  assertString(value.title, `${message} is missing "title".`)
  assertStringArray(value.body, `${message} is missing "body".`, true)
  assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, true)
  assertOptionalString(value.paperId, `${message} has an invalid "paperId".`, true)
  assertOptionalString(value.paperTitle, `${message} has an invalid "paperTitle".`, true)
  if (value.evidenceIds != null) {
    assertStringArray(value.evidenceIds, `${message} has an invalid "evidenceIds".`, true)
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
      assertOptionalString(value.title, `${message} has an invalid "title".`, true)
      assertStringArray(value.body, `${message} is missing "body".`, true)
      assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, true)
      assertOptionalString(value.paperId, `${message} has an invalid "paperId".`, true)
      assertOptionalString(value.paperTitle, `${message} has an invalid "paperTitle".`, true)
      return
    case 'paper-break':
      assertString(value.paperId, `${message} is missing "paperId".`)
      assertString(value.title, `${message} is missing "title".`)
      assertOptionalString(value.titleEn, `${message} has an invalid "titleEn".`, true)
      assertString(value.role, `${message} is missing "role".`)
      assertString(value.contribution, `${message} is missing "contribution".`)
      assertString(value.route, `${message} is missing "route".`)
      assertOptionalString(value.publishedAt, `${message} has an invalid "publishedAt".`, true)
      assertOptionalString(value.originalUrl, `${message} has an invalid "originalUrl".`, true)
      assertOptionalString(value.pdfUrl, `${message} has an invalid "pdfUrl".`, true)
      return
    case 'comparison':
      assertString(value.title, `${message} is missing "title".`)
      assertString(value.summary, `${message} is missing "summary".`, true)
      assertArray(value.points, `${message} is missing "points".`)
      value.points.forEach((point, index) => {
        assertRecord(point, `${message} point ${index + 1} is invalid.`)
        assertString(point.label, `${message} point ${index + 1} is missing "label".`)
        assertString(point.detail, `${message} point ${index + 1} is missing "detail".`, true)
      })
      return
    case 'figure':
    case 'table':
    case 'formula':
      assertEvidenceExplanation(value.evidence, `${message} evidence`)
      return
    case 'critique':
      assertString(value.title, `${message} is missing "title".`)
      assertString(value.summary, `${message} is missing "summary".`, true)
      assertStringArray(value.bullets, `${message} is missing "bullets".`, true)
      return
    case 'closing':
      assertOptionalString(value.title, `${message} has an invalid "title".`, true)
      assertStringArray(value.body, `${message} is missing "body".`, true)
      return
    case 'paper-transition':
      assertString(value.fromPaperId, `${message} is missing "fromPaperId".`)
      assertString(value.fromPaperTitle, `${message} is missing "fromPaperTitle".`)
      assertString(value.toPaperId, `${message} is missing "toPaperId".`)
      assertString(value.toPaperTitle, `${message} is missing "toPaperTitle".`)
      assertString(value.content, `${message} is missing "content".`, true)
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
  assertString(value.summary, `${message} is missing "summary".`, true)
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
    assertString(point.detail, `${message} point ${index + 1} is missing "detail".`, true)
  })
}

export function assertTopicViewModelContract(value: unknown): asserts value is TopicViewModel {
  assertRecord(value, 'Topic view model is unavailable from the backend contract.')
  assertString(value.schemaVersion, 'Topic view model is missing "schemaVersion".')
  assertString(value.topicId, 'Topic view model is missing "topicId".')
  assertString(value.title, 'Topic view model is missing "title".')
  assertString(value.titleEn, 'Topic view model is missing "titleEn".')
  assertString(value.summary, 'Topic view model is missing "summary".', true)
  assertString(value.description, 'Topic view model is missing "description".', true)
  assertRecord(value.stageConfig, 'Topic view model is missing "stageConfig".')
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
  assertContract(
    value.stageConfig.minWindowMonths <= value.stageConfig.defaultWindowMonths &&
      value.stageConfig.defaultWindowMonths <= value.stageConfig.maxWindowMonths,
    'Topic stageConfig window bounds are inconsistent.',
  )
  assertContract(
    value.stageConfig.minWindowMonths <= value.stageConfig.windowMonths &&
      value.stageConfig.windowMonths <= value.stageConfig.maxWindowMonths,
    'Topic stageConfig windowMonths falls outside the advertised bounds.',
  )
  assertRecord(value.timeline, 'Topic view model is missing "timeline".')
  assertArray(value.timeline.stages, 'Topic timeline stages are missing.')
  assertContract(value.timeline.stages.length > 0, 'Topic timeline stages are missing.')
  const stageIndexes = new Set<number>()
  value.timeline.stages.forEach((stage, index) => {
    assertRecord(stage, `Topic timeline stage ${index + 1} is invalid.`)
    assertNumber(stage.stageIndex, `Topic timeline stage ${index + 1} is missing "stageIndex".`, {
      integer: true,
      min: 1,
    })
    assertContract(!stageIndexes.has(stage.stageIndex), `Topic timeline stage ${index + 1} duplicates stageIndex ${String(stage.stageIndex)}.`)
    stageIndexes.add(stage.stageIndex)
    assertString(stage.title, `Topic timeline stage ${index + 1} is missing "title".`)
    assertString(stage.titleEn, `Topic timeline stage ${index + 1} is missing "titleEn".`)
    assertString(stage.branchLabel, `Topic timeline stage ${index + 1} is missing "branchLabel".`)
    assertString(stage.branchColor, `Topic timeline stage ${index + 1} is missing "branchColor".`)
  })
  assertArray(value.stages, 'Topic stage sections are missing.')
  const stageSections = value.stages as Array<Record<string, unknown>>
  const stageSectionIndexes = new Set<number>()
  stageSections.forEach((stage, index) => {
    assertRecord(stage, `Topic stage section ${index + 1} is invalid.`)
    assertNumber(stage.stageIndex, `Topic stage section ${index + 1} is missing "stageIndex".`, { integer: true, min: 1 })
    stageSectionIndexes.add(stage.stageIndex)
    assertArray(stage.nodes, `Topic stage section ${index + 1} is missing "nodes".`)
  })
  assertContract(
    stageIndexes.size === stageSectionIndexes.size &&
      [...stageIndexes].every((stageIndex) => stageSectionIndexes.has(stageIndex)),
    'Topic timeline stages and stage sections are out of sync.',
  )
  assertRecord(value.graph, 'Topic view model is missing "graph".')
  assertNumber(value.graph.columnCount, 'Topic graph is missing "columnCount".', { integer: true, min: 1 })
  assertArray(value.graph.lanes, 'Topic graph is missing "lanes".')
  assertArray(value.graph.nodes, 'Topic graph is missing "nodes".')
  assertContract(value.graph.lanes.length <= 10, 'Topic graph returned more than 10 timelines.')
  const graphLanes = value.graph.lanes as Array<Record<string, unknown>>
  const graphNodes = value.graph.nodes as Array<Record<string, unknown>>
  const laneIndexes = new Set<number>()
  graphLanes.forEach((lane, index) => {
    assertRecord(lane, `Topic graph lane ${index + 1} is invalid.`)
    assertString(lane.id, `Topic graph lane ${index + 1} is missing "id".`)
    assertNumber(lane.laneIndex, `Topic graph lane ${index + 1} is missing "laneIndex".`, { integer: true })
    assertContract(!laneIndexes.has(lane.laneIndex), `Topic graph lane ${index + 1} duplicates laneIndex ${String(lane.laneIndex)}.`)
    laneIndexes.add(lane.laneIndex)
    assertContract(
      lane.branchIndex == null || (typeof lane.branchIndex === 'number' && Number.isInteger(lane.branchIndex)),
      `Topic graph lane ${index + 1} has an invalid "branchIndex".`,
    )
    assertBoolean(lane.isMainline, `Topic graph lane ${index + 1} is missing "isMainline".`)
    assertOneOf(lane.side, LANE_SIDES, `Topic graph lane ${index + 1} has an unsupported "side".`)
    assertString(lane.color, `Topic graph lane ${index + 1} is missing "color".`)
    assertString(lane.roleLabel, `Topic graph lane ${index + 1} is missing "roleLabel".`)
    assertString(lane.label, `Topic graph lane ${index + 1} is missing "label".`)
    assertString(lane.labelEn, `Topic graph lane ${index + 1} is missing "labelEn".`)
    assertString(lane.legendLabel, `Topic graph lane ${index + 1} is missing "legendLabel".`)
    assertString(lane.legendLabelEn, `Topic graph lane ${index + 1} is missing "legendLabelEn".`)
    assertString(lane.description, `Topic graph lane ${index + 1} is missing "description".`, true)
    assertString(lane.periodLabel, `Topic graph lane ${index + 1} is missing "periodLabel".`, true)
    assertNumber(lane.nodeCount, `Topic graph lane ${index + 1} is missing "nodeCount".`, { integer: true, min: 0 })
    assertNumber(lane.stageCount, `Topic graph lane ${index + 1} is missing "stageCount".`, { integer: true, min: 0 })
    assertString(lane.latestNodeId, `Topic graph lane ${index + 1} is missing "latestNodeId".`)
    assertString(lane.latestAnchorId, `Topic graph lane ${index + 1} is missing "latestAnchorId".`)
  })
  assertArray(value.papers, 'Topic view model is missing "papers".')
  const paperIds = collectUniqueIds(
    value.papers.map((paper, index) => {
      assertRecord(paper, `Topic paper ${index + 1} is invalid.`)
      assertString(paper.paperId, `Topic paper ${index + 1} is missing "paperId".`)
      assertString(paper.anchorId, `Topic paper ${index + 1} is missing "anchorId".`)
      assertString(paper.route, `Topic paper ${index + 1} is missing "route".`)
      return paper.paperId
    }),
    (paperId) => `Topic papers duplicate paperId "${paperId}".`,
  )
  const nodeIds = new Set<string>()
  const nodeAnchorIds = new Set<string>()
  const graphNodeById = new Map<string, Record<string, unknown>>()
  graphNodes.forEach((node, index) => {
    assertRecord(node, `Topic graph node ${index + 1} is invalid.`)
    assertString(node.nodeId, `Topic graph node ${index + 1} is missing "nodeId".`)
    assertString(node.anchorId, `Topic graph node ${index + 1} is missing "anchorId".`)
    assertContract(!nodeIds.has(node.nodeId), `Topic graph node ${index + 1} duplicates nodeId "${node.nodeId}".`)
    assertContract(!nodeAnchorIds.has(node.anchorId), `Topic graph node ${index + 1} duplicates anchorId "${node.anchorId}".`)
    nodeIds.add(node.nodeId)
    nodeAnchorIds.add(node.anchorId)
    graphNodeById.set(node.nodeId, node)
    assertNumber(node.stageIndex, `Topic graph node ${index + 1} is missing "stageIndex".`, { integer: true, min: 1 })
    assertContract(stageIndexes.has(node.stageIndex), `Topic graph node ${index + 1} references missing stage ${String(node.stageIndex)}.`)
    assertArray(node.paperIds, `Topic graph node ${index + 1} is missing "paperIds".`)
    ;(node.paperIds as unknown[]).forEach((paperId, paperIndex) => {
      assertString(paperId, `Topic graph node ${index + 1} paper ${paperIndex + 1} is invalid.`)
      assertContract(
        paperIds.has(paperId),
        `Topic graph node ${index + 1} paper ${paperIndex + 1} references missing paper "${paperId}".`,
      )
    })
    assertTopicCardEditorial(node.editorial, `Topic graph node ${index + 1} editorial`)
    assertRecord(node.layoutHint, `Topic graph node ${index + 1} is missing "layoutHint".`)
    assertNumber(node.layoutHint.laneIndex, `Topic graph node ${index + 1} layout is missing "laneIndex".`, { integer: true })
    assertContract(
      laneIndexes.has(node.layoutHint.laneIndex),
      `Topic graph node ${index + 1} references missing lane ${String(node.layoutHint.laneIndex)}.`,
    )
    assertOneOf(node.layoutHint.emphasis, NODE_EMPHASIS, `Topic graph node ${index + 1} has an unsupported layout emphasis.`)
    assertOneOf(node.layoutHint.side, LANE_SIDES, `Topic graph node ${index + 1} has an unsupported layout side.`)
    assertTopicCardEditorial(node.cardEditorial, `Topic graph node ${index + 1} cardEditorial`)
  })
  graphNodes.forEach((node, index) => {
    assertArray(node.parentNodeIds, `Topic graph node ${index + 1} is missing "parentNodeIds".`)
    ;(node.parentNodeIds as unknown[]).forEach((parentNodeId, parentIndex) => {
      assertString(parentNodeId, `Topic graph node ${index + 1} parent ${parentIndex + 1} is invalid.`, true)
      if (parentNodeId) {
        assertContract(nodeIds.has(parentNodeId), `Topic graph node ${index + 1} references missing parent node "${parentNodeId}".`)
      }
    })
  })
  stageSections.forEach((stage, index) => {
    const stageNodes = stage.nodes as Array<Record<string, unknown>>
    stageNodes.forEach((node, nodeIndex) => {
      const message = `Topic stage section ${index + 1} node ${nodeIndex + 1}`
      assertRecord(node, `${message} is invalid.`)
      assertString(node.nodeId, `${message} is missing "nodeId".`)
      assertString(node.anchorId, `${message} is missing "anchorId".`)
      assertString(node.route, `${message} is missing "route".`)
      assertString(node.title, `${message} is missing "title".`)
      assertString(node.titleEn, `${message} is missing "titleEn".`, true)
      assertString(node.subtitle, `${message} is missing "subtitle".`, true)
      assertString(node.summary, `${message} is missing "summary".`, true)
      assertString(node.explanation, `${message} is missing "explanation".`, true)
      assertNumber(node.paperCount, `${message} is missing "paperCount".`, { integer: true, min: 0 })
      assertNumber(node.figureCount, `${message} is missing "figureCount".`, { integer: true, min: 0 })
      assertNumber(node.tableCount, `${message} is missing "tableCount".`, { integer: true, min: 0 })
      assertNumber(node.formulaCount, `${message} is missing "formulaCount".`, { integer: true, min: 0 })
      assertNumber(node.evidenceCount, `${message} is missing "evidenceCount".`, { integer: true, min: 0 })
      assertStringArray(node.paperIds, `${message} is missing "paperIds".`)
      assertString(node.primaryPaperTitle, `${message} is missing "primaryPaperTitle".`, true)
      assertOptionalString(node.primaryPaperId, `${message} has an invalid "primaryPaperId".`)
      assertOptionalAssetPath(node.coverImage, `${message} has an invalid "coverImage".`)
      assertBoolean(node.isMergeNode, `${message} is missing "isMergeNode".`)
      assertBoolean(node.provisional, `${message} is missing "provisional".`)
      assertString(node.updatedAt, `${message} is missing "updatedAt".`)
      assertString(node.branchLabel, `${message} is missing "branchLabel".`)
      assertString(node.branchColor, `${message} is missing "branchColor".`)
      assertTopicCardEditorial(node.editorial, `${message} editorial`)
      const graphNode = graphNodeById.get(node.nodeId as string)
      assertContract(graphNode, `${message} references missing graph node "${node.nodeId}".`)
      const nodePaperIds = node.paperIds as string[]
      nodePaperIds.forEach((paperId, paperIndex) =>
        assertContract(
          paperIds.has(paperId),
          `${message} paper ${paperIndex + 1} references missing paper "${paperId}".`,
        ),
      )
      if (typeof node.primaryPaperId === 'string' && node.primaryPaperId.trim().length > 0) {
        assertContract(
          nodePaperIds.includes(node.primaryPaperId),
          `${message} primaryPaperId "${node.primaryPaperId}" is missing from paperIds.`,
        )
      }
      assertContract(
        nodePaperIds.length === (node.paperCount as number),
        `${message} paperCount does not match paperIds length.`,
      )
      assertContract(
        (graphNode?.primaryPaperId as string | undefined) === node.primaryPaperId,
        `${message} drifted from graph node primaryPaperId.`,
      )
    })
  })
  graphLanes.forEach((lane, index) => {
    assertString(lane.latestNodeId, `Topic graph lane ${index + 1} is missing "latestNodeId".`)
    assertString(lane.latestAnchorId, `Topic graph lane ${index + 1} is missing "latestAnchorId".`)
    assertContract(nodeIds.has(lane.latestNodeId), `Topic graph lane ${index + 1} references missing latestNodeId "${lane.latestNodeId}".`)
    assertContract(nodeAnchorIds.has(lane.latestAnchorId), `Topic graph lane ${index + 1} references missing latestAnchorId "${lane.latestAnchorId}".`)
  })
}

export function assertNodeViewModelContract(value: unknown): asserts value is NodeViewModel {
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
  assertNumber(value.stats.paperCount, 'Node stats are missing "paperCount".', { integer: true, min: 0 })
  assertArray(value.paperRoles, 'Node view model is missing "paperRoles".')
  assertContract(value.paperRoles.length > 0, 'Node view model must include at least one paper role.')
  const paperRoleIds = collectUniqueIds(
    value.paperRoles.map((paperRole, index) => {
      assertRecord(paperRole, `Node paperRole ${index + 1} is invalid.`)
      assertString(paperRole.paperId, `Node paperRole ${index + 1} is missing "paperId".`)
      assertString(paperRole.title, `Node paperRole ${index + 1} is missing "title".`)
      assertString(paperRole.titleEn, `Node paperRole ${index + 1} is missing "titleEn".`)
      assertString(paperRole.route, `Node paperRole ${index + 1} is missing "route".`)
      assertString(paperRole.publishedAt, `Node paperRole ${index + 1} is missing "publishedAt".`)
      return paperRole.paperId
    }),
    (paperId) => `Node paperRoles duplicate paperId "${paperId}".`,
  )
  assertContract(
    value.stats.paperCount === paperRoleIds.size,
    'Node stats.paperCount does not match the number of paperRoles returned by the backend.',
  )
  assertRecord(value.article, 'Node view model is missing "article".')
  assertArray(value.article.flow, 'Node article is missing "flow".')
  assertArray(value.article.sections, 'Node article is missing "sections".')
  assertStringArray(value.article.closing, 'Node article is missing "closing".', true)
  assertRecord(value.critique, 'Node view model is missing "critique".')
  assertString(value.critique.title, 'Node critique is missing "title".')
  assertStringArray(value.critique.bullets, 'Node critique is missing "bullets".', true)
  assertArray(value.evidence, 'Node view model is missing "evidence".')
  const evidenceAnchorIds = collectUniqueIds(
    value.evidence.map((entry, index) => {
      assertRecord(entry, `Node evidence ${index + 1} is invalid.`)
      assertString(entry.anchorId, `Node evidence ${index + 1} is missing "anchorId".`)
      assertOneOf(entry.type, NODE_EVIDENCE_TYPES, `Node evidence ${index + 1} has an unsupported "type".`)
      assertString(entry.route, `Node evidence ${index + 1} is missing "route".`)
      if (entry.sourcePaperId != null) {
        assertString(entry.sourcePaperId, `Node evidence ${index + 1} has an invalid "sourcePaperId".`)
        assertContract(
          paperRoleIds.has(entry.sourcePaperId),
          `Node evidence ${index + 1} references missing paper "${entry.sourcePaperId}".`,
        )
      }
      return entry.anchorId
    }),
    (anchorId) => `Node evidence duplicates anchorId "${anchorId}".`,
  )
  assertRecord(
    value.researchView,
    'Node research view is unavailable because the backend did not return structured node research data.',
  )
  const researchView = value.researchView as unknown as NonNullable<NodeViewModel['researchView']>
  assertRecord(researchView.evidence, 'Node research view is missing evidence focus groups.')
  assertStringArray(researchView.evidence.featuredAnchorIds, 'Node research view is missing "featuredAnchorIds".')
  assertStringArray(researchView.evidence.supportingAnchorIds, 'Node research view is missing "supportingAnchorIds".')
  ;[
    ...researchView.evidence.featuredAnchorIds,
    ...researchView.evidence.supportingAnchorIds,
  ].forEach((anchorId, index) =>
    assertContract(
      evidenceAnchorIds.has(anchorId),
      `Node research view evidence anchor ${index + 1} references missing evidence "${anchorId}".`,
    ),
  )
  assertArray(researchView.evidence.featured, 'Node research view is missing "featured" evidence payloads.')
  const featuredEvidenceIds = collectUniqueIds(
    researchView.evidence.featured.map((entry, index) => {
      assertEvidenceExplanation(entry, `Node research featured evidence ${index + 1}`, paperRoleIds)
      return entry.anchorId
    }),
    (anchorId) => `Node research featured evidence duplicates anchorId "${anchorId}".`,
  )
  researchView.evidence.featuredAnchorIds.forEach((anchorId, index) =>
    assertContract(
      featuredEvidenceIds.has(anchorId),
      `Node research featured anchor ${index + 1} is missing payload "${anchorId}".`,
    ),
  )
  assertArray(researchView.evidence.supporting, 'Node research view is missing "supporting" evidence payloads.')
  const supportingEvidenceIds = collectUniqueIds(
    researchView.evidence.supporting.map((entry, index) => {
      assertEvidenceExplanation(entry, `Node research supporting evidence ${index + 1}`, paperRoleIds)
      return entry.anchorId
    }),
    (anchorId) => `Node research supporting evidence duplicates anchorId "${anchorId}".`,
  )
  researchView.evidence.supportingAnchorIds.forEach((anchorId, index) =>
    assertContract(
      supportingEvidenceIds.has(anchorId),
      `Node research supporting anchor ${index + 1} is missing payload "${anchorId}".`,
    ),
  )
  assertArray(researchView.evidence.paperBriefs, 'Node research view is missing "paperBriefs".')
  researchView.evidence.paperBriefs.forEach((entry, index) => {
    assertRecord(entry, `Node research paper brief ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research paper brief ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research paper brief ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertString(entry.paperTitle, `Node research paper brief ${index + 1} is missing "paperTitle".`)
    assertString(entry.role, `Node research paper brief ${index + 1} is missing "role".`)
    assertOptionalString(entry.publishedAt, `Node research paper brief ${index + 1} has an invalid "publishedAt".`)
    assertString(entry.summary, `Node research paper brief ${index + 1} is missing "summary".`, true)
    assertString(
      entry.contribution,
      `Node research paper brief ${index + 1} is missing "contribution".`,
      true,
    )
    assertStringArray(
      entry.evidenceAnchorIds,
      `Node research paper brief ${index + 1} is missing "evidenceAnchorIds".`,
    )
    entry.evidenceAnchorIds.forEach((anchorId, anchorIndex) =>
      assertContract(
        evidenceAnchorIds.has(anchorId),
        `Node research paper brief ${index + 1} evidenceAnchorId ${anchorIndex + 1} references missing evidence "${anchorId}".`,
      ),
    )
    ;[
      ['keyFigureIds', 'figure:'],
      ['keyTableIds', 'table:'],
      ['keyFormulaIds', 'formula:'],
    ].forEach(([field, prefix]) => {
      assertStringArray(entry[field], `Node research paper brief ${index + 1} is missing "${field}".`)
      entry[field].forEach((anchorId: string, anchorIndex: number) => {
        assertContract(
          anchorId.startsWith(prefix),
          `Node research paper brief ${index + 1} ${field} ${anchorIndex + 1} must start with "${prefix}".`,
        )
        assertContract(
          evidenceAnchorIds.has(anchorId),
          `Node research paper brief ${index + 1} ${field} ${anchorIndex + 1} references missing evidence "${anchorId}".`,
        )
      })
    })
  })
  assertArray(researchView.evidence.evidenceChains, 'Node research view is missing "evidenceChains".')
  researchView.evidence.evidenceChains.forEach((entry, index) => {
    assertRecord(entry, `Node research evidence chain ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research evidence chain ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research evidence chain ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertString(entry.paperTitle, `Node research evidence chain ${index + 1} is missing "paperTitle".`)
    assertString(
      entry.subsectionKind,
      `Node research evidence chain ${index + 1} is missing "subsectionKind".`,
    )
    assertString(
      entry.subsectionTitle,
      `Node research evidence chain ${index + 1} is missing "subsectionTitle".`,
    )
    assertString(entry.summary, `Node research evidence chain ${index + 1} is missing "summary".`, true)
    assertStringArray(
      entry.evidenceAnchorIds,
      `Node research evidence chain ${index + 1} is missing "evidenceAnchorIds".`,
    )
    entry.evidenceAnchorIds.forEach((anchorId, anchorIndex) =>
      assertContract(
        evidenceAnchorIds.has(anchorId),
        `Node research evidence chain ${index + 1} evidenceAnchorId ${anchorIndex + 1} references missing evidence "${anchorId}".`,
      ),
    )
  })
  assertRecord(researchView.evidence.coverage, 'Node research view is missing "coverage".')
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
      researchView.evidence.coverage[field],
      `Node research view coverage is missing "${field}".`,
      { integer: true, min: 0 },
    ),
  )
  assertRecord(researchView.methods, 'Node research view is missing methods.')
  assertArray(researchView.methods.entries, 'Node research methods are missing "entries".')
  researchView.methods.entries.forEach((entry, index) => {
    assertRecord(entry, `Node research method entry ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research method entry ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research method entry ${index + 1} references missing paper "${entry.paperId}".`,
    )
  })
  assertArray(researchView.methods.evolution, 'Node research methods are missing "evolution".')
  researchView.methods.evolution.forEach((entry, index) => {
    assertRecord(entry, `Node research evolution ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research evolution ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research evolution ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertString(entry.paperTitle, `Node research evolution ${index + 1} is missing "paperTitle".`)
    assertString(entry.contribution, `Node research evolution ${index + 1} is missing "contribution".`, true)
    assertOptionalString(
      entry.improvementOverPrevious,
      `Node research evolution ${index + 1} has an invalid "improvementOverPrevious".`,
      true,
    )
    assertOptionalString(
      entry.fromPaperId,
      `Node research evolution ${index + 1} has an invalid "fromPaperId".`,
    )
    if (entry.fromPaperId != null) {
      assertContract(
        paperRoleIds.has(entry.fromPaperId),
        `Node research evolution ${index + 1} references missing fromPaperId "${entry.fromPaperId}".`,
      )
    }
    assertOptionalString(
      entry.fromPaperTitle,
      `Node research evolution ${index + 1} has an invalid "fromPaperTitle".`,
      true,
    )
    assertOptionalString(entry.toPaperId, `Node research evolution ${index + 1} has an invalid "toPaperId".`)
    if (entry.toPaperId != null) {
      assertContract(
        paperRoleIds.has(entry.toPaperId),
        `Node research evolution ${index + 1} references missing toPaperId "${entry.toPaperId}".`,
      )
    }
    assertOptionalString(
      entry.toPaperTitle,
      `Node research evolution ${index + 1} has an invalid "toPaperTitle".`,
      true,
    )
    if (entry.transitionType != null) {
      assertOneOf(
        entry.transitionType,
        ARTICLE_FLOW_TRANSITION_TYPES,
        `Node research evolution ${index + 1} has an unsupported "transitionType".`,
      )
    }
    assertOptionalString(entry.anchorId, `Node research evolution ${index + 1} has an invalid "anchorId".`)
    if (entry.anchorId != null) {
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
      entry.evidenceAnchorIds.forEach((anchorId, anchorIndex) =>
        assertContract(
          evidenceAnchorIds.has(anchorId),
          `Node research evolution ${index + 1} evidenceAnchorId ${anchorIndex + 1} references missing evidence "${anchorId}".`,
        ),
      )
    }
  })
  assertStringArray(researchView.methods.dimensions, 'Node research methods are missing "dimensions".', true)
  assertRecord(researchView.problems, 'Node research view is missing problems.')
  assertArray(researchView.problems.items, 'Node research problems are missing "items".')
  researchView.problems.items.forEach((entry, index) => {
    assertRecord(entry, `Node research problem ${index + 1} is invalid.`)
    assertString(entry.paperId, `Node research problem ${index + 1} is missing "paperId".`)
    assertContract(
      paperRoleIds.has(entry.paperId),
      `Node research problem ${index + 1} references missing paper "${entry.paperId}".`,
    )
    assertOneOf(entry.status, NODE_PROBLEM_STATUSES, `Node research problem ${index + 1} has an unsupported "status".`)
  })
  assertStringArray(researchView.problems.openQuestions, 'Node research problems are missing "openQuestions".', true)
  if (researchView.coreJudgment != null) {
    assertRecord(researchView.coreJudgment, 'Node research coreJudgment is invalid.')
    assertOneOf(
      researchView.coreJudgment.confidence,
      RESEARCH_CONFIDENCE,
      'Node research coreJudgment has an unsupported "confidence".',
    )
  }
  assertArray(
    value.references,
    'Node references are unavailable because the backend did not return the right workbench reference list.',
  )
  const referencePaperIds = collectUniqueIds(
    value.references.map((reference, index) => {
      assertRecord(reference, `Node reference ${index + 1} is invalid.`)
      assertString(reference.paperId, `Node reference ${index + 1} is missing "paperId".`)
      assertString(reference.title, `Node reference ${index + 1} is missing "title".`)
      assertContract(
        paperRoleIds.has(reference.paperId),
        `Node reference ${index + 1} references missing paper "${reference.paperId}".`,
      )
      return reference.paperId
    }),
    (paperId) => `Node references duplicate paperId "${paperId}".`,
  )
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
  assertOptionalString(value.nodeId, `${message} has an invalid "nodeId".`)
  assertOptionalString(value.mergeIntoNodeId, `${message} has an invalid "mergeIntoNodeId".`)
  assertString(value.title, `${message} is missing "title".`)
  assertStringArray(value.paperIds, `${message} is missing "paperIds".`)
  assertString(value.rationale, `${message} is missing "rationale".`, true)
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
  assertString(value.stageSummary, `${message} is missing "stageSummary".`, true)
  assertBoolean(value.shouldAdvanceStage, `${message} is missing "shouldAdvanceStage".`)
  if (value.durationDecision != null) {
    assertRecord(value.durationDecision, `${message} durationDecision is invalid.`)
    assertString(value.durationDecision.summary, `${message} durationDecision is missing "summary".`, true)
    assertString(value.durationDecision.rationale, `${message} durationDecision is missing "rationale".`, true)
  }
  assertStringArray(value.openQuestions, `${message} is missing "openQuestions".`, true)
  assertArray(value.nodeActions, `${message} is missing "nodeActions".`)
  value.nodeActions.forEach((entry, index) =>
    assertResearchPipelineActionSummary(entry, `${message} nodeAction ${index + 1}`),
  )
}

function assertResearchPipelineContextSummary(value: unknown, message: string) {
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
  assertStringArray(value.globalOpenQuestions, `${message} is missing "globalOpenQuestions".`, true)
  assertStringArray(value.continuityThreads, `${message} is missing "continuityThreads".`, true)
  assertRecord(value.subjectFocus, `${message} is missing "subjectFocus".`)
  assertOptionalString(value.subjectFocus.nodeId, `${message} subjectFocus has an invalid "nodeId".`)
  assertStringArray(value.subjectFocus.paperIds, `${message} subjectFocus is missing "paperIds".`)
  assertNullableInteger(value.subjectFocus.stageIndex, `${message} subjectFocus has an invalid "stageIndex".`, 1)
  assertArray(value.subjectFocus.relatedHistory, `${message} subjectFocus is missing "relatedHistory".`)
  value.subjectFocus.relatedHistory.forEach((entry, index) =>
    assertResearchPipelineEntrySummary(entry, `${message} subjectFocus relatedHistory ${index + 1}`),
  )
  assertStringArray(value.subjectFocus.relatedNodeActions, `${message} subjectFocus is missing "relatedNodeActions".`, true)
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
  assertOneOf(value.action, ['discover', 'refresh', 'sync'] as const, `${message} has an unsupported "action".`)
  if (value.researchMode != null) {
    assertOneOf(value.researchMode, RESEARCH_MODES, `${message} has an unsupported "researchMode".`)
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
  assertOptionalString(value.latestSummary, `${message} has an invalid "latestSummary".`, true)
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
  assertString(value.startedAt, `${message} is missing "startedAt".`)
  assertString(value.updatedAt, `${message} is missing "updatedAt".`)
  assertString(value.headline, `${message} is missing "headline".`, true)
  assertString(value.dek, `${message} is missing "dek".`, true)
  assertString(value.summary, `${message} is missing "summary".`, true)
  assertStringArray(value.paragraphs, `${message} is missing "paragraphs".`, true)
  assertStringArray(value.keyMoves, `${message} is missing "keyMoves".`, true)
  assertStringArray(value.openQuestions, `${message} is missing "openQuestions".`, true)
  assertArray(value.latestNodeActions, `${message} is missing "latestNodeActions".`)
  value.latestNodeActions.forEach((entry, index) => {
    assertRecord(entry, `${message} latestNodeAction ${index + 1} is invalid.`)
    assertOneOf(
      entry.action,
      RESEARCH_NODE_ACTIONS,
      `${message} latestNodeAction ${index + 1} has an unsupported "action".`,
    )
    assertString(entry.title, `${message} latestNodeAction ${index + 1} is missing "title".`)
    assertString(entry.rationale, `${message} latestNodeAction ${index + 1} is missing "rationale".`, true)
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

export function assertTopicResearchSessionContract(value: unknown, topicId: string) {
  assertTopicResearchSessionState(
    value,
    'Topic research session is unavailable from the backend contract.',
    topicId,
  )
}

function assertTopicSessionMemoryContext(value: unknown, message: string) {
  assertRecord(value, message)
  assertOptionalString(value.updatedAt, `${message} has an invalid "updatedAt".`)
  assertOptionalString(value.initializedAt, `${message} has an invalid "initializedAt".`)
  assertOptionalString(value.lastCompactedAt, `${message} has an invalid "lastCompactedAt".`)
  assertRecord(value.summary, `${message} is missing "summary".`)
  assertString(value.summary.currentFocus, `${message} summary is missing "currentFocus".`, true)
  assertString(value.summary.continuity, `${message} summary is missing "continuity".`, true)
  assertStringArray(value.summary.establishedJudgments, `${message} summary is missing "establishedJudgments".`, true)
  assertStringArray(value.summary.openQuestions, `${message} summary is missing "openQuestions".`, true)
  assertStringArray(value.summary.researchMomentum, `${message} summary is missing "researchMomentum".`, true)
  assertString(value.summary.conversationStyle, `${message} summary is missing "conversationStyle".`, true)
  assertString(value.summary.lastResearchMove, `${message} summary is missing "lastResearchMove".`, true)
  assertString(value.summary.lastUserIntent, `${message} summary is missing "lastUserIntent".`, true)
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
    assertString(entry.summary, `${message} recentEvent ${index + 1} is missing "summary".`, true)
    assertString(entry.createdAt, `${message} recentEvent ${index + 1} is missing "createdAt".`)
  })
}

function assertTopicResearchWorld(value: unknown, message: string, topicId: string) {
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
  assertString(value.summary.thesis, `${message} summary is missing "thesis".`, true)
  assertString(value.summary.currentFocus, `${message} summary is missing "currentFocus".`, true)
  assertString(value.summary.continuity, `${message} summary is missing "continuity".`, true)
  assertString(value.summary.dominantQuestion, `${message} summary is missing "dominantQuestion".`, true)
  assertString(value.summary.dominantCritique, `${message} summary is missing "dominantCritique".`, true)
  assertString(value.summary.agendaHeadline, `${message} summary is missing "agendaHeadline".`, true)
  assertOneOf(value.summary.maturity, RESEARCH_WORLD_MATURITY, `${message} summary has an unsupported "maturity".`)

  assertArray(value.stages, `${message} is missing "stages".`)
  const stages = value.stages as Array<Record<string, unknown>>
  const stageIndexes = new Set<number>()
  const stageIds = collectUniqueIds(
    stages.map((stage, index) => {
      assertRecord(stage, `${message} stage ${index + 1} is invalid.`)
      assertString(stage.id, `${message} stage ${index + 1} is missing "id".`)
      assertNumber(stage.stageIndex, `${message} stage ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 0,
      })
      stageIndexes.add(stage.stageIndex as number)
      assertString(stage.title, `${message} stage ${index + 1} is missing "title".`)
      assertString(stage.titleEn, `${message} stage ${index + 1} is missing "titleEn".`)
      assertString(stage.summary, `${message} stage ${index + 1} is missing "summary".`, true)
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

  assertArray(value.nodes, `${message} is missing "nodes".`)
  const nodes = value.nodes as Array<Record<string, unknown>>
  const nodeIds = collectUniqueIds(
    nodes.map((node, index) => {
      assertRecord(node, `${message} node ${index + 1} is invalid.`)
      assertString(node.id, `${message} node ${index + 1} is missing "id".`)
      assertNumber(node.stageIndex, `${message} node ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 0,
      })
      assertString(node.title, `${message} node ${index + 1} is missing "title".`)
      assertString(node.subtitle, `${message} node ${index + 1} is missing "subtitle".`, true)
      assertString(node.summary, `${message} node ${index + 1} is missing "summary".`, true)
      assertStringArray(node.paperIds, `${message} node ${index + 1} is missing "paperIds".`)
      assertOptionalString(node.primaryPaperId, `${message} node ${index + 1} has an invalid "primaryPaperId".`)
      assertOptionalAssetPath(node.coverImage, `${message} node ${index + 1} has an invalid "coverImage".`)
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
      assertString(node.keyQuestion, `${message} node ${index + 1} is missing "keyQuestion".`, true)
      assertString(node.dominantCritique, `${message} node ${index + 1} is missing "dominantCritique".`, true)
      return node.id
    }),
    (id) => `${message} contains duplicate node id "${id}".`,
  )

  assertArray(value.papers, `${message} is missing "papers".`)
  const papers = value.papers as Array<Record<string, unknown>>
  const paperIds = collectUniqueIds(
    papers.map((paper, index) => {
      assertRecord(paper, `${message} paper ${index + 1} is invalid.`)
      assertString(paper.id, `${message} paper ${index + 1} is missing "id".`)
      assertString(paper.title, `${message} paper ${index + 1} is missing "title".`)
      assertString(paper.titleEn, `${message} paper ${index + 1} is missing "titleEn".`)
      assertString(paper.summary, `${message} paper ${index + 1} is missing "summary".`, true)
      assertOptionalAssetPath(paper.coverImage, `${message} paper ${index + 1} has an invalid "coverImage".`)
      assertString(paper.publishedAt, `${message} paper ${index + 1} is missing "publishedAt".`)
      assertStringArray(paper.nodeIds, `${message} paper ${index + 1} is missing "nodeIds".`)
      assertArray(paper.stageIndexes, `${message} paper ${index + 1} is missing "stageIndexes".`)
      ;(paper.stageIndexes as unknown[]).forEach((stageIndex, stageIndexPosition) => {
        assertNumber(
          stageIndex,
          `${message} paper ${index + 1} stageIndex ${stageIndexPosition + 1} is invalid.`,
          { integer: true, min: 0 },
        )
      })
      return paper.id
    }),
    (id) => `${message} contains duplicate paper id "${id}".`,
  )

  assertArray(value.claims, `${message} is missing "claims".`)
  const claims = value.claims as Array<Record<string, unknown>>
  const claimIds = collectUniqueIds(
    claims.map((claim, index) => {
      assertRecord(claim, `${message} claim ${index + 1} is invalid.`)
      assertString(claim.id, `${message} claim ${index + 1} is missing "id".`)
      assertOneOf(claim.scope, RESEARCH_WORLD_SCOPE_TYPES, `${message} claim ${index + 1} has an unsupported "scope".`)
      assertString(claim.scopeId, `${message} claim ${index + 1} is missing "scopeId".`)
      assertString(claim.statement, `${message} claim ${index + 1} is missing "statement".`)
      assertOneOf(claim.kind, RESEARCH_WORLD_CLAIM_KINDS, `${message} claim ${index + 1} has an unsupported "kind".`)
      assertOneOf(claim.confidence, RESEARCH_CONFIDENCE, `${message} claim ${index + 1} has an unsupported "confidence".`)
      assertOneOf(
        claim.status,
        RESEARCH_WORLD_CLAIM_STATUSES,
        `${message} claim ${index + 1} has an unsupported "status".`,
      )
      assertStringArray(claim.supportPaperIds, `${message} claim ${index + 1} is missing "supportPaperIds".`)
      assertStringArray(claim.supportNodeIds, `${message} claim ${index + 1} is missing "supportNodeIds".`)
      assertOneOf(claim.source, RESEARCH_WORLD_SOURCES, `${message} claim ${index + 1} has an unsupported "source".`)
      return claim.id
    }),
    (id) => `${message} contains duplicate claim id "${id}".`,
  )

  assertArray(value.highlights, `${message} is missing "highlights".`)
  const highlights = value.highlights as Array<Record<string, unknown>>
  collectUniqueIds(
    highlights.map((highlight, index) => {
      assertRecord(highlight, `${message} highlight ${index + 1} is invalid.`)
      assertString(highlight.id, `${message} highlight ${index + 1} is missing "id".`)
      assertOneOf(
        highlight.scope,
        RESEARCH_WORLD_SCOPE_TYPES,
        `${message} highlight ${index + 1} has an unsupported "scope".`,
      )
      assertString(highlight.scopeId, `${message} highlight ${index + 1} is missing "scopeId".`)
      assertString(highlight.title, `${message} highlight ${index + 1} is missing "title".`)
      assertString(highlight.detail, `${message} highlight ${index + 1} is missing "detail".`, true)
      assertOneOf(
        highlight.source,
        RESEARCH_WORLD_SOURCES,
        `${message} highlight ${index + 1} has an unsupported "source".`,
      )
      return highlight.id
    }),
    (id) => `${message} contains duplicate highlight id "${id}".`,
  )

  assertArray(value.questions, `${message} is missing "questions".`)
  const questions = value.questions as Array<Record<string, unknown>>
  questions.forEach((question, index) => {
    assertRecord(question, `${message} question ${index + 1} is invalid.`)
    assertString(question.id, `${message} question ${index + 1} is missing "id".`)
    assertOneOf(question.scope, RESEARCH_WORLD_SCOPE_TYPES, `${message} question ${index + 1} has an unsupported "scope".`)
    assertString(question.scopeId, `${message} question ${index + 1} is missing "scopeId".`)
    assertString(question.question, `${message} question ${index + 1} is missing "question".`)
    assertOneOf(question.priority, RESEARCH_WORLD_PRIORITIES, `${message} question ${index + 1} has an unsupported "priority".`)
    assertOneOf(
      question.source,
      RESEARCH_WORLD_QUESTION_SOURCES,
      `${message} question ${index + 1} has an unsupported "source".`,
    )
    assertOneOf(question.status, ['open'] as const, `${message} question ${index + 1} has an unsupported "status".`)
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
    assertString(critique.summary, `${message} critique ${index + 1} is missing "summary".`, true)
    assertOneOf(critique.source, RESEARCH_WORLD_SOURCES, `${message} critique ${index + 1} has an unsupported "source".`)
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
    assertOneOf(item.kind, RESEARCH_WORLD_AGENDA_KINDS, `${message} agenda item ${index + 1} has an unsupported "kind".`)
    assertOneOf(
      item.targetType,
      RESEARCH_WORLD_CRITIQUE_TARGETS,
      `${message} agenda item ${index + 1} has an unsupported "targetType".`,
    )
    assertString(item.targetId, `${message} agenda item ${index + 1} is missing "targetId".`)
    assertString(item.title, `${message} agenda item ${index + 1} is missing "title".`)
    assertString(item.rationale, `${message} agenda item ${index + 1} is missing "rationale".`, true)
    assertNumber(item.priorityScore, `${message} agenda item ${index + 1} is missing "priorityScore".`)
    assertString(item.suggestedPrompt, `${message} agenda item ${index + 1} is missing "suggestedPrompt".`, true)
    assertOneOf(item.status, ['queued'] as const, `${message} agenda item ${index + 1} has an unsupported "status".`)
  })

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
    if (typeof node.primaryPaperId === 'string' && node.primaryPaperId.trim().length > 0) {
      assertContract(
        nodePaperIds.includes(node.primaryPaperId),
        `${message} node ${index + 1} primaryPaperId "${node.primaryPaperId}" is missing from paperIds.`,
      )
    }
  })
  papers.forEach((paper, index) => {
    const paperNodeIds = paper.nodeIds as string[]
    paperNodeIds.forEach((nodeId, nodeIndex) =>
      assertContract(
        nodeIds.has(nodeId),
        `${message} paper ${index + 1} node ${nodeIndex + 1} references missing node "${nodeId}".`,
      ),
    )
    const paperStageIndexes = paper.stageIndexes as number[]
    paperStageIndexes.forEach((stageIndex, stageIndexPosition) =>
      assertContract(
        stageIndexes.has(stageIndex),
        `${message} paper ${index + 1} stageIndex ${stageIndexPosition + 1} references missing stage index ${String(stageIndex)}.`,
      ),
    )
  })
  claims.forEach((claim, index) => {
    const supportPaperIds = claim.supportPaperIds as string[]
    const supportNodeIds = claim.supportNodeIds as string[]
    supportPaperIds.forEach((paperId, paperIndex) =>
      assertContract(
        paperIds.has(paperId),
        `${message} claim ${index + 1} supportPaperId ${paperIndex + 1} references missing paper "${paperId}".`,
      ),
    )
    supportNodeIds.forEach((nodeId, nodeIndex) =>
      assertContract(
        nodeIds.has(nodeId),
        `${message} claim ${index + 1} supportNodeId ${nodeIndex + 1} references missing node "${nodeId}".`,
      ),
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
  highlights.forEach((highlight, index) =>
    assertWorldTarget(
      highlight.scope as string,
      highlight.scopeId as string,
      `${message} highlight ${index + 1}`,
    ),
  )
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

export function assertTopicResearchWorldContract(
  value: unknown,
  topicId: string,
  message = 'Topic research world',
) {
  assertTopicResearchWorld(value, message, topicId)
}

function assertTopicGuidanceLedgerState(value: unknown, message: string, topicId: string) {
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
      assertOptionalString(directive.scopeId, `${message} directive ${index + 1} has an invalid "scopeId".`, true)
      assertString(directive.scopeLabel, `${message} directive ${index + 1} is missing "scopeLabel".`, true)
      assertOneOf(
        directive.directiveType,
        GUIDANCE_DIRECTIVE_TYPES,
        `${message} directive ${index + 1} has an unsupported "directiveType".`,
      )
      assertString(directive.instruction, `${message} directive ${index + 1} is missing "instruction".`)
      assertString(directive.rationale, `${message} directive ${index + 1} is missing "rationale".`, true)
      assertString(directive.effectSummary, `${message} directive ${index + 1} is missing "effectSummary".`, true)
      assertString(directive.promptHint, `${message} directive ${index + 1} is missing "promptHint".`, true)
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
        true,
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
    assertString(value.latestApplication.summary, `${message} latestApplication is missing "summary".`, true)
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
        true,
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
      assertString(directive.note, `${message} latestApplication directive ${index + 1} is missing "note".`, true)
    })
  }

  assertRecord(value.summary, `${message} is missing "summary".`)
  assertNumber(value.summary.activeDirectiveCount, `${message} summary is missing "activeDirectiveCount".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.summary.acceptedDirectiveCount, `${message} summary is missing "acceptedDirectiveCount".`, {
    integer: true,
    min: 0,
  })
  assertNumber(value.summary.deferredDirectiveCount, `${message} summary is missing "deferredDirectiveCount".`, {
    integer: true,
    min: 0,
  })
  assertString(value.summary.latestDirective, `${message} summary is missing "latestDirective".`, true)
  assertString(value.summary.focusHeadline, `${message} summary is missing "focusHeadline".`, true)
  assertString(value.summary.styleHeadline, `${message} summary is missing "styleHeadline".`, true)
  assertString(value.summary.challengeHeadline, `${message} summary is missing "challengeHeadline".`, true)
  assertString(value.summary.latestAppliedSummary, `${message} summary is missing "latestAppliedSummary".`, true)
  assertOptionalString(value.summary.latestAppliedAt, `${message} summary has an invalid "latestAppliedAt".`)
  assertNumber(
    value.summary.latestAppliedDirectiveCount,
    `${message} summary is missing "latestAppliedDirectiveCount".`,
    { integer: true, min: 0 },
  )
}

function assertTopicCognitiveMemoryPack(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.focus, `${message} is missing "focus".`, true)
  assertString(value.continuity, `${message} is missing "continuity".`, true)
  assertString(value.conversationContract, `${message} is missing "conversationContract".`, true)
  ;[
    ['projectMemories', 'project'],
    ['feedbackMemories', 'feedback'],
    ['referenceMemories', 'reference'],
  ].forEach(([field, expectedKind]) => {
    const entries = value[field]
    assertArray(entries, `${message} is missing "${field}".`)
    entries.forEach((entry, index) => {
      assertRecord(entry, `${message} ${field} entry ${index + 1} is invalid.`)
      assertString(entry.id, `${message} ${field} entry ${index + 1} is missing "id".`)
      assertOneOf(
        entry.kind,
        COGNITIVE_MEMORY_KINDS,
        `${message} ${field} entry ${index + 1} has an unsupported "kind".`,
      )
      assertContract(
        entry.kind === expectedKind,
        `${message} ${field} entry ${index + 1} must have kind "${expectedKind}".`,
      )
      assertString(entry.title, `${message} ${field} entry ${index + 1} is missing "title".`)
      assertString(entry.summary, `${message} ${field} entry ${index + 1} is missing "summary".`, true)
      assertOneOf(
        entry.source,
        COGNITIVE_MEMORY_SOURCES,
        `${message} ${field} entry ${index + 1} has an unsupported "source".`,
      )
      assertOptionalString(
        entry.updatedAt,
        `${message} ${field} entry ${index + 1} has an invalid "updatedAt".`,
      )
    })
  })
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
  assertString(value.description, `${message} is missing "description".`, true)
  assertString(value.branchLabel, `${message} is missing "branchLabel".`)
  assertString(value.branchColor, `${message} is missing "branchColor".`)
  assertString(value.yearLabel, `${message} is missing "yearLabel".`, true)
  assertString(value.dateLabel, `${message} is missing "dateLabel".`, true)
  assertString(value.timeLabel, `${message} is missing "timeLabel".`, true)
  assertString(value.stageThesis, `${message} is missing "stageThesis".`, true)
  assertRecord(value.editorial, `${message} editorial is invalid.`)
  assertString(value.editorial.kicker, `${message} editorial is missing "kicker".`)
  assertString(value.editorial.summary, `${message} editorial is missing "summary".`)
  assertString(value.editorial.transition, `${message} editorial is missing "transition".`)
  assertNumber(value.nodeCount, `${message} is missing "nodeCount".`, { integer: true, min: 0 })
  assertStringArray(value.nodeIds, `${message} is missing "nodeIds".`)
  assertContract(value.nodeCount === value.nodeIds.length, `${message} nodeCount does not match the number of nodeIds.`)
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
  assertString(value.headline, `${message} is missing "headline".`, true)
  assertString(value.standfirst, `${message} is missing "standfirst".`, true)
  const paperRoleIds = new Set<string>()
  value.paperRoles.forEach((paperRole, index) => {
    assertString(paperRole.summary, `${message} paperRole ${index + 1} is missing "summary".`, true)
    assertString(paperRole.role, `${message} paperRole ${index + 1} is missing "role".`)
    assertString(paperRole.contribution, `${message} paperRole ${index + 1} is missing "contribution".`, true)
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
  assertString(value.summary, 'Paper view model is missing "summary".', true)
  assertString(value.explanation, 'Paper view model is missing "explanation".', true)
  assertString(value.publishedAt, 'Paper view model is missing "publishedAt".')
  assertStringArray(value.authors, 'Paper view model is missing "authors".', true)
  assertContract(
    value.citationCount == null ||
      (typeof value.citationCount === 'number' &&
        Number.isFinite(value.citationCount) &&
        value.citationCount >= 0),
    'Paper view model has an invalid "citationCount".',
  )
  assertOptionalAssetPath(value.coverImage, 'Paper view model has an invalid "coverImage".')
  assertOptionalString(value.originalUrl, 'Paper view model has an invalid "originalUrl".', true)
  assertOptionalString(value.pdfUrl, 'Paper view model has an invalid "pdfUrl".', true)
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
  assertNumber(value.stats.sectionCount, 'Paper stats are missing "sectionCount".', { integer: true, min: 0 })
  assertNumber(value.stats.figureCount, 'Paper stats are missing "figureCount".', { integer: true, min: 0 })
  assertNumber(value.stats.tableCount, 'Paper stats are missing "tableCount".', { integer: true, min: 0 })
  assertNumber(value.stats.formulaCount, 'Paper stats are missing "formulaCount".', { integer: true, min: 0 })
  assertNumber(value.stats.relatedNodeCount, 'Paper stats are missing "relatedNodeCount".', { integer: true, min: 0 })
  assertArray(value.relatedNodes, 'Paper view model is missing "relatedNodes".')
  const relatedNodeIds = collectUniqueIds(
    value.relatedNodes.map((node, index) => {
      assertRecord(node, `Paper relatedNode ${index + 1} is invalid.`)
      assertString(node.nodeId, `Paper relatedNode ${index + 1} is missing "nodeId".`)
      assertString(node.title, `Paper relatedNode ${index + 1} is missing "title".`)
      assertString(node.subtitle, `Paper relatedNode ${index + 1} is missing "subtitle".`, true)
      assertString(node.summary, `Paper relatedNode ${index + 1} is missing "summary".`, true)
      assertNumber(node.stageIndex, `Paper relatedNode ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 0,
      })
      assertOptionalString(node.stageLabel, `Paper relatedNode ${index + 1} has an invalid "stageLabel".`, true)
      assertString(node.route, `Paper relatedNode ${index + 1} is missing "route".`)
      return node.nodeId
    }),
    (nodeId) => `Paper relatedNodes duplicate nodeId "${nodeId}".`,
  )
  assertContract(
    relatedNodeIds.size === value.stats.relatedNodeCount,
    'Paper stats.relatedNodeCount does not match the number of relatedNodes returned by the backend.',
  )
  assertString(value.standfirst, 'Paper view model is missing "standfirst".', true)
  assertRecord(value.article, 'Paper view model is missing "article".')
  assertString(value.article.periodLabel, 'Paper article is missing "periodLabel".', true)
  assertString(value.article.timeRangeLabel, 'Paper article is missing "timeRangeLabel".', true)
  assertArray(value.article.flow, 'Paper article is missing "flow".')
  value.article.flow.forEach((block, index) =>
    assertArticleFlowBlock(block, `Paper article flow ${index + 1}`),
  )
  assertArray(value.article.sections, 'Paper article is missing "sections".')
  value.article.sections.forEach((section, index) =>
    assertArticleSection(section, `Paper article section ${index + 1}`),
  )
  assertStringArray(value.article.closing, 'Paper article is missing "closing".', true)
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
      assertOptionalString(reference.titleEn, `Paper reference ${index + 1} has an invalid "titleEn".`, true)
      assertOptionalString(reference.route, `Paper reference ${index + 1} has an invalid "route".`, true)
      assertOptionalString(reference.publishedAt, `Paper reference ${index + 1} has an invalid "publishedAt".`, true)
      if (reference.authors != null) {
        assertStringArray(reference.authors, `Paper reference ${index + 1} has an invalid "authors".`, true)
      }
      assertContract(
        reference.citationCount == null ||
          (typeof reference.citationCount === 'number' &&
            Number.isFinite(reference.citationCount) &&
            reference.citationCount >= 0),
        `Paper reference ${index + 1} has an invalid "citationCount".`,
      )
      assertOptionalString(reference.originalUrl, `Paper reference ${index + 1} has an invalid "originalUrl".`, true)
      assertOptionalString(reference.pdfUrl, `Paper reference ${index + 1} has an invalid "pdfUrl".`, true)
    })
  }
}

export function assertTopicResearchExportBundleContract(
  value: unknown,
): asserts value is TopicExportBundle {
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
): asserts value is TopicExportBundleBatch {
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

export function assertTopicResearchBriefContract(value: unknown) {
  assertRecord(value, 'Topic research brief is unavailable from the backend contract.')
  assertString(value.topicId, 'Topic research brief is missing "topicId".')
  assertTopicResearchSessionState(value.session, 'Topic research brief session', value.topicId)
  assertResearchPipelineContextSummary(value.pipeline, 'Topic research brief pipeline')
  assertTopicSessionMemoryContext(value.sessionMemory, 'Topic research brief sessionMemory')
  assertTopicResearchWorld(value.world, 'Topic research brief world', value.topicId)
  assertTopicGuidanceLedgerState(value.guidance, 'Topic research brief guidance', value.topicId)
  assertTopicCognitiveMemoryPack(value.cognitiveMemory, 'Topic research brief cognitiveMemory')
}
