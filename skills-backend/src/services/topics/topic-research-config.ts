import {
  readVersionedSystemConfig,
  writeVersionedSystemConfig,
} from '../system-config-journal'
import { getTopicDefinition } from '../../../topic-config'

const TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION = 'topic-research-config-v1'
const TOPIC_RESEARCH_CONFIG_KEY_PREFIX = 'topic-research-config:v1:'

// Hard limits aligned with the current Suzhi research product contract.
const DEFAULT_MAX_CANDIDATES_PER_STAGE = 200
const DEFAULT_DISCOVERY_QUERY_LIMIT = 500
const DEFAULT_MAX_PAPERS_PER_NODE = 20
const DEFAULT_MAX_BRANCHES = 9
const DEFAULT_ADMISSION_THRESHOLD = 0.45
const DEFAULT_SEMANTIC_SCHOLAR_LIMIT = 100
const DEFAULT_DISCOVERY_ROUNDS = 10

// 广纳贤文策略: 新增配置项
const DEFAULT_MIN_PAPERS_PER_NODE = 10
const DEFAULT_TARGET_CANDIDATES_BEFORE_ADMISSION = 150
const DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.75

export interface TopicResearchConfigState {
  schemaVersion: typeof TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION
  topicId: string
  maxCandidatesPerStage: number
  discoveryQueryLimit: number
  maxPapersPerNode: number
  maxBranches: number
  admissionThreshold: number
  semanticScholarLimit: number
  discoveryRounds: number
  minPapersPerNode: number
  targetCandidatesBeforeAdmission: number
  highConfidenceThreshold: number
  updatedAt: string
}

function topicResearchConfigKey(topicId: string) {
  return `${TOPIC_RESEARCH_CONFIG_KEY_PREFIX}${topicId}`
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function resolveDefaultResearchConfig(topicId: string): Partial<TopicResearchConfigState> {
  try {
    const topicDefinition = getTopicDefinition(topicId)
    const defaults = topicDefinition.defaults as unknown as Record<string, unknown>

    return {
      maxCandidatesPerStage:
        typeof defaults.maxCandidates === 'number'
          ? clampValue(defaults.maxCandidates, 20, DEFAULT_MAX_CANDIDATES_PER_STAGE)
          : DEFAULT_MAX_CANDIDATES_PER_STAGE,
      maxPapersPerNode:
        typeof defaults.maxPapersPerNode === 'number'
          ? clampValue(defaults.maxPapersPerNode, 5, DEFAULT_MAX_PAPERS_PER_NODE)
          : DEFAULT_MAX_PAPERS_PER_NODE,
    }
  } catch {
    return {}
  }
}

function buildFallback(topicId: string): TopicResearchConfigState {
  const topicDefaults = resolveDefaultResearchConfig(topicId)

  return {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId,
    maxCandidatesPerStage:
      topicDefaults.maxCandidatesPerStage ?? DEFAULT_MAX_CANDIDATES_PER_STAGE,
    discoveryQueryLimit: DEFAULT_DISCOVERY_QUERY_LIMIT,
    maxPapersPerNode: topicDefaults.maxPapersPerNode ?? DEFAULT_MAX_PAPERS_PER_NODE,
    maxBranches: DEFAULT_MAX_BRANCHES,
    admissionThreshold: DEFAULT_ADMISSION_THRESHOLD,
    semanticScholarLimit: DEFAULT_SEMANTIC_SCHOLAR_LIMIT,
    discoveryRounds: DEFAULT_DISCOVERY_ROUNDS,
    minPapersPerNode: DEFAULT_MIN_PAPERS_PER_NODE,
    targetCandidatesBeforeAdmission: DEFAULT_TARGET_CANDIDATES_BEFORE_ADMISSION,
    highConfidenceThreshold: DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    updatedAt: new Date(0).toISOString(),
  }
}

function parseTopicResearchConfig(
  topicId: string,
  value: unknown,
): TopicResearchConfigState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Partial<TopicResearchConfigState>
  if (candidate.topicId && candidate.topicId !== topicId) return null

  return {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId,
    maxCandidatesPerStage: clampValue(
      typeof candidate.maxCandidatesPerStage === 'number'
        ? candidate.maxCandidatesPerStage
        : DEFAULT_MAX_CANDIDATES_PER_STAGE,
      20,
      DEFAULT_MAX_CANDIDATES_PER_STAGE,
    ),
    discoveryQueryLimit: clampValue(
      typeof candidate.discoveryQueryLimit === 'number'
        ? candidate.discoveryQueryLimit
        : DEFAULT_DISCOVERY_QUERY_LIMIT,
      100,
      800,
    ),
    maxPapersPerNode: clampValue(
      typeof candidate.maxPapersPerNode === 'number'
        ? candidate.maxPapersPerNode
        : DEFAULT_MAX_PAPERS_PER_NODE,
      5,
      DEFAULT_MAX_PAPERS_PER_NODE,
    ),
    maxBranches: clampValue(
      typeof candidate.maxBranches === 'number'
        ? candidate.maxBranches
        : DEFAULT_MAX_BRANCHES,
      1,
      DEFAULT_MAX_BRANCHES,
    ),
    admissionThreshold: clampValue(
      typeof candidate.admissionThreshold === 'number'
        ? candidate.admissionThreshold
        : DEFAULT_ADMISSION_THRESHOLD,
      0.25,
      0.75,
    ),
    semanticScholarLimit: clampValue(
      typeof candidate.semanticScholarLimit === 'number'
        ? candidate.semanticScholarLimit
        : DEFAULT_SEMANTIC_SCHOLAR_LIMIT,
      20,
      150,
    ),
    discoveryRounds: clampValue(
      typeof candidate.discoveryRounds === 'number'
        ? candidate.discoveryRounds
        : DEFAULT_DISCOVERY_ROUNDS,
      2,
      DEFAULT_DISCOVERY_ROUNDS,
    ),
    minPapersPerNode: clampValue(
      typeof candidate.minPapersPerNode === 'number'
        ? candidate.minPapersPerNode
        : DEFAULT_MIN_PAPERS_PER_NODE,
      3,
      DEFAULT_MAX_PAPERS_PER_NODE,
    ),
    targetCandidatesBeforeAdmission: clampValue(
      typeof candidate.targetCandidatesBeforeAdmission === 'number'
        ? candidate.targetCandidatesBeforeAdmission
        : DEFAULT_TARGET_CANDIDATES_BEFORE_ADMISSION,
      50,
      DEFAULT_MAX_CANDIDATES_PER_STAGE,
    ),
    highConfidenceThreshold: clampValue(
      typeof candidate.highConfidenceThreshold === 'number'
        ? candidate.highConfidenceThreshold
        : DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
      0.5,
      0.95,
    ),
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : new Date().toISOString(),
  }
}

export async function loadTopicResearchConfig(
  topicId: string,
): Promise<TopicResearchConfigState> {
  const fallback = buildFallback(topicId)
  const record = await readVersionedSystemConfig({
    key: topicResearchConfigKey(topicId),
    parse: (value) => parseTopicResearchConfig(topicId, value),
    fallback,
  })

  return record.value
}

export async function loadTopicResearchConfigMap(
  topicIds: string[],
): Promise<Map<string, TopicResearchConfigState>> {
  const uniqueTopicIds = Array.from(
    new Set(topicIds.filter((topicId) => typeof topicId === 'string' && topicId.trim())),
  )

  if (uniqueTopicIds.length === 0) {
    return new Map<string, TopicResearchConfigState>()
  }

  const records = await Promise.all(
    uniqueTopicIds.map(async (topicId) => [topicId, await loadTopicResearchConfig(topicId)] as const),
  )

  return new Map(records)
}

function safeNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export async function saveTopicResearchConfig(
  topicId: string,
  params: Partial<Omit<TopicResearchConfigState, 'schemaVersion' | 'topicId' | 'updatedAt'>>,
): Promise<TopicResearchConfigState> {
  const currentConfig = await loadTopicResearchConfig(topicId)

  const nextValue: TopicResearchConfigState = {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId,
    maxCandidatesPerStage: clampValue(
      safeNumber(params.maxCandidatesPerStage, currentConfig.maxCandidatesPerStage),
      20,
      DEFAULT_MAX_CANDIDATES_PER_STAGE,
    ),
    discoveryQueryLimit: clampValue(
      safeNumber(params.discoveryQueryLimit, currentConfig.discoveryQueryLimit),
      100,
      800,
    ),
    maxPapersPerNode: clampValue(
      safeNumber(params.maxPapersPerNode, currentConfig.maxPapersPerNode),
      5,
      DEFAULT_MAX_PAPERS_PER_NODE,
    ),
    maxBranches: clampValue(
      safeNumber(params.maxBranches, currentConfig.maxBranches),
      1,
      DEFAULT_MAX_BRANCHES,
    ),
    admissionThreshold: clampValue(
      safeNumber(params.admissionThreshold, currentConfig.admissionThreshold),
      0.25,
      0.75,
    ),
    semanticScholarLimit: clampValue(
      safeNumber(params.semanticScholarLimit, currentConfig.semanticScholarLimit),
      20,
      150,
    ),
    discoveryRounds: clampValue(
      safeNumber(params.discoveryRounds, currentConfig.discoveryRounds),
      2,
      DEFAULT_DISCOVERY_ROUNDS,
    ),
    minPapersPerNode: clampValue(
      safeNumber(params.minPapersPerNode, currentConfig.minPapersPerNode),
      3,
      DEFAULT_MAX_PAPERS_PER_NODE,
    ),
    targetCandidatesBeforeAdmission: clampValue(
      safeNumber(params.targetCandidatesBeforeAdmission, currentConfig.targetCandidatesBeforeAdmission),
      50,
      DEFAULT_MAX_CANDIDATES_PER_STAGE,
    ),
    highConfidenceThreshold: clampValue(
      safeNumber(params.highConfidenceThreshold, currentConfig.highConfidenceThreshold),
      0.5,
      0.95,
    ),
    updatedAt: new Date().toISOString(),
  }

  const record = await writeVersionedSystemConfig({
    key: topicResearchConfigKey(topicId),
    value: nextValue,
    parse: (value) => parseTopicResearchConfig(topicId, value),
    fallback: buildFallback(topicId),
    source: 'topic-research-config',
  })

  return record.value
}

export async function loadGlobalResearchConfig(): Promise<TopicResearchConfigState> {
  const record = await readVersionedSystemConfig({
    key: topicResearchConfigKey('global'),
    parse: (value) => parseTopicResearchConfig('global', value),
    fallback: buildFallback('global'),
  })

  return record.value
}

export async function saveGlobalResearchConfig(
  params: Partial<Omit<TopicResearchConfigState, 'schemaVersion' | 'topicId' | 'updatedAt'>>,
): Promise<TopicResearchConfigState> {
  const currentConfig = await loadGlobalResearchConfig()

  const nextValue: TopicResearchConfigState = {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId: 'global',
    maxCandidatesPerStage: clampValue(
      safeNumber(params.maxCandidatesPerStage, currentConfig.maxCandidatesPerStage),
      20,
      DEFAULT_MAX_CANDIDATES_PER_STAGE,
    ),
    discoveryQueryLimit: clampValue(
      safeNumber(params.discoveryQueryLimit, currentConfig.discoveryQueryLimit),
      100,
      800,
    ),
    maxPapersPerNode: clampValue(
      safeNumber(params.maxPapersPerNode, currentConfig.maxPapersPerNode),
      5,
      DEFAULT_MAX_PAPERS_PER_NODE,
    ),
    maxBranches: clampValue(
      safeNumber(params.maxBranches, currentConfig.maxBranches),
      1,
      DEFAULT_MAX_BRANCHES,
    ),
    admissionThreshold: clampValue(
      safeNumber(params.admissionThreshold, currentConfig.admissionThreshold),
      0.25,
      0.75,
    ),
    semanticScholarLimit: clampValue(
      safeNumber(params.semanticScholarLimit, currentConfig.semanticScholarLimit),
      20,
      150,
    ),
    discoveryRounds: clampValue(
      safeNumber(params.discoveryRounds, currentConfig.discoveryRounds),
      2,
      DEFAULT_DISCOVERY_ROUNDS,
    ),
    minPapersPerNode: clampValue(
      safeNumber(params.minPapersPerNode, currentConfig.minPapersPerNode),
      3,
      DEFAULT_MAX_PAPERS_PER_NODE,
    ),
    targetCandidatesBeforeAdmission: clampValue(
      safeNumber(params.targetCandidatesBeforeAdmission, currentConfig.targetCandidatesBeforeAdmission),
      50,
      DEFAULT_MAX_CANDIDATES_PER_STAGE,
    ),
    highConfidenceThreshold: clampValue(
      safeNumber(params.highConfidenceThreshold, currentConfig.highConfidenceThreshold),
      0.5,
      0.95,
    ),
    updatedAt: new Date().toISOString(),
  }

  const record = await writeVersionedSystemConfig({
    key: topicResearchConfigKey('global'),
    value: nextValue,
    parse: (value) => parseTopicResearchConfig('global', value),
    fallback: buildFallback('global'),
    source: 'topic-research-config',
  })

  return record.value
}

export const RESEARCH_CONFIG_DEFAULTS = {
  MAX_CANDIDATES_PER_STAGE: DEFAULT_MAX_CANDIDATES_PER_STAGE,
  DISCOVERY_QUERY_LIMIT: DEFAULT_DISCOVERY_QUERY_LIMIT,
  MAX_PAPERS_PER_NODE: DEFAULT_MAX_PAPERS_PER_NODE,
  MAX_BRANCHES: DEFAULT_MAX_BRANCHES,
  ADMISSION_THRESHOLD: DEFAULT_ADMISSION_THRESHOLD,
  SEMANTIC_SCHOLAR_LIMIT: DEFAULT_SEMANTIC_SCHOLAR_LIMIT,
  DISCOVERY_ROUNDS: DEFAULT_DISCOVERY_ROUNDS,
  // 广纳贤文策略: 新增配置
  MIN_PAPERS_PER_NODE: DEFAULT_MIN_PAPERS_PER_NODE,
  TARGET_CANDIDATES_BEFORE_ADMISSION: DEFAULT_TARGET_CANDIDATES_BEFORE_ADMISSION,
  HIGH_CONFIDENCE_THRESHOLD: DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
}
