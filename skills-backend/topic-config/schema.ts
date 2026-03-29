export type TopicPaperStatus = 'published' | 'seeded' | 'candidate'
export type StorageMode = 'canonical-only' | 'debug' | 'dry-run'

export interface TopicOriginRejectedCandidate {
  title: string
  paperId: string | null
  published: string
  reason: string
}

export interface TopicOriginDefinition {
  originPaperId: string
  originConfirmedAt: string
  originConfirmationMode: 'earliest-representative'
  originQuestionDefinition: string
  originWhyThisCounts: string
  earlierRejectedCandidates: TopicOriginRejectedCandidate[]
}

export interface TopicPreferredModels {
  'openai-compatible'?: string
  anthropic?: string
  'agent-skill'?: string
}

export interface TopicDefaults {
  bootstrapWindowDays: number
  maxPaperIntervalDays: number
  maxCandidates: number
  windowPolicy: 'auto' | 'fixed'
  minStageWindowMonths: number
  maxStageWindowMonths: number
  maxActiveBranches: number
  branchModel: 'problem-node-driven'
  allowBranchMerge: boolean
  storageMode: StorageMode
  preferredModels: TopicPreferredModels
}

export interface FrontendSummary {
  cardSummary: string
  timelineGuide: string
  researchBlurb: string
}

export interface TopicPaperReference {
  id: string
  version: string
  status: TopicPaperStatus
  role: string
}

export interface TopicDefinition {
  id: string
  nameZh: string
  nameEn: string
  focusLabel: string
  origin: TopicOriginDefinition
  queryTags: string[]
  problemPreference: string[]
  seedPapers: string[]
  capabilityRefs: string[]
  defaults: TopicDefaults
  frontendSummary: FrontendSummary
  expansionNote: string
  papers: TopicPaperReference[]
}

export interface CapabilityDefinition {
  id: string
  name: string
  definition: string
  mechanism: string
  applicabilitySignals: string[]
  antiSignals: string[]
  typicalTradeoffs: string[]
  relatedCapabilities: string[]
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`)
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${label} must be a string array.`)
  }
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`)
  }
}

export function assertCapabilityDefinition(value: unknown): asserts value is CapabilityDefinition {
  assertRecord(value, 'CapabilityDefinition')
  assertString(value.id, 'CapabilityDefinition.id')
  assertString(value.name, 'CapabilityDefinition.name')
  assertString(value.definition, 'CapabilityDefinition.definition')
  assertString(value.mechanism, 'CapabilityDefinition.mechanism')
  assertStringArray(value.applicabilitySignals, 'CapabilityDefinition.applicabilitySignals')
  assertStringArray(value.antiSignals, 'CapabilityDefinition.antiSignals')
  assertStringArray(value.typicalTradeoffs, 'CapabilityDefinition.typicalTradeoffs')
  assertStringArray(value.relatedCapabilities, 'CapabilityDefinition.relatedCapabilities')
}

export function assertTopicDefaults(value: unknown): asserts value is TopicDefaults {
  assertRecord(value, 'TopicDefaults')
  assertNumber(value.bootstrapWindowDays, 'TopicDefaults.bootstrapWindowDays')
  assertNumber(value.maxPaperIntervalDays, 'TopicDefaults.maxPaperIntervalDays')
  assertNumber(value.maxCandidates, 'TopicDefaults.maxCandidates')
  assertString(value.windowPolicy, 'TopicDefaults.windowPolicy')
  if (value.windowPolicy !== 'auto' && value.windowPolicy !== 'fixed') {
    throw new Error('TopicDefaults.windowPolicy must be auto or fixed.')
  }
  assertNumber(value.minStageWindowMonths, 'TopicDefaults.minStageWindowMonths')
  assertNumber(value.maxStageWindowMonths, 'TopicDefaults.maxStageWindowMonths')
  assertNumber(value.maxActiveBranches, 'TopicDefaults.maxActiveBranches')
  assertString(value.branchModel, 'TopicDefaults.branchModel')
  if (value.branchModel !== 'problem-node-driven') {
    throw new Error('TopicDefaults.branchModel must be problem-node-driven.')
  }
  if (typeof value.allowBranchMerge !== 'boolean') {
    throw new Error('TopicDefaults.allowBranchMerge must be a boolean.')
  }
  assertString(value.storageMode, 'TopicDefaults.storageMode')
  if (value.storageMode !== 'canonical-only' && value.storageMode !== 'debug' && value.storageMode !== 'dry-run') {
    throw new Error('TopicDefaults.storageMode must be canonical-only, debug, or dry-run.')
  }
  assertRecord(value.preferredModels, 'TopicDefaults.preferredModels')
}

export function assertTopicDefinition(value: unknown): asserts value is TopicDefinition {
  assertRecord(value, 'TopicDefinition')
  assertString(value.id, 'TopicDefinition.id')
  assertString(value.nameZh, 'TopicDefinition.nameZh')
  assertString(value.nameEn, 'TopicDefinition.nameEn')
  assertString(value.focusLabel, 'TopicDefinition.focusLabel')
  assertRecord(value.origin, 'TopicDefinition.origin')
  assertString(value.origin.originPaperId, 'TopicDefinition.origin.originPaperId')
  assertString(value.origin.originConfirmedAt, 'TopicDefinition.origin.originConfirmedAt')
  assertString(value.origin.originConfirmationMode, 'TopicDefinition.origin.originConfirmationMode')
  if (value.origin.originConfirmationMode !== 'earliest-representative') {
    throw new Error('TopicDefinition.origin.originConfirmationMode must be earliest-representative.')
  }
  assertString(value.origin.originQuestionDefinition, 'TopicDefinition.origin.originQuestionDefinition')
  assertString(value.origin.originWhyThisCounts, 'TopicDefinition.origin.originWhyThisCounts')
  if (!Array.isArray(value.origin.earlierRejectedCandidates)) {
    throw new Error('TopicDefinition.origin.earlierRejectedCandidates must be an array.')
  }
  for (const [index, candidate] of value.origin.earlierRejectedCandidates.entries()) {
    assertRecord(candidate, `TopicDefinition.origin.earlierRejectedCandidates[${index}]`)
    assertString(candidate.title, `TopicDefinition.origin.earlierRejectedCandidates[${index}].title`)
    if (candidate.paperId !== null) {
      assertString(candidate.paperId, `TopicDefinition.origin.earlierRejectedCandidates[${index}].paperId`)
    }
    assertString(candidate.published, `TopicDefinition.origin.earlierRejectedCandidates[${index}].published`)
    assertString(candidate.reason, `TopicDefinition.origin.earlierRejectedCandidates[${index}].reason`)
  }

  assertStringArray(value.queryTags, 'TopicDefinition.queryTags')
  assertStringArray(value.problemPreference, 'TopicDefinition.problemPreference')
  assertStringArray(value.seedPapers, 'TopicDefinition.seedPapers')
  assertStringArray(value.capabilityRefs, 'TopicDefinition.capabilityRefs')
  assertTopicDefaults(value.defaults)

  assertRecord(value.frontendSummary, 'TopicDefinition.frontendSummary')
  assertString(value.frontendSummary.cardSummary, 'TopicDefinition.frontendSummary.cardSummary')
  assertString(value.frontendSummary.timelineGuide, 'TopicDefinition.frontendSummary.timelineGuide')
  assertString(value.frontendSummary.researchBlurb, 'TopicDefinition.frontendSummary.researchBlurb')
  assertString(value.expansionNote, 'TopicDefinition.expansionNote')

  if (!Array.isArray(value.papers) || value.papers.length === 0) {
    throw new Error('TopicDefinition.papers must be a non-empty array.')
  }

  for (const [index, paper] of value.papers.entries()) {
    assertRecord(paper, `TopicDefinition.papers[${index}]`)
    assertString(paper.id, `TopicDefinition.papers[${index}].id`)
    assertString(paper.version, `TopicDefinition.papers[${index}].version`)
    assertString(paper.status, `TopicDefinition.papers[${index}].status`)
    if (paper.status !== 'published' && paper.status !== 'seeded' && paper.status !== 'candidate') {
      throw new Error(`TopicDefinition.papers[${index}].status must be published, seeded, or candidate.`)
    }
    assertString(paper.role, `TopicDefinition.papers[${index}].role`)
  }
}
