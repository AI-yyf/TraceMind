import {
  readVersionedSystemConfig,
  writeVersionedSystemConfig,
} from '../system-config-journal'
import { getTopicDefinition } from '../../../topic-config'

const TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION = 'topic-research-config-v1'
const TOPIC_RESEARCH_CONFIG_KEY_PREFIX = 'topic-research-config:v1:'

// Default values aligned with "广纳贤文" strategy
const DEFAULT_MAX_CANDIDATES_PER_STAGE = 100
const DEFAULT_DISCOVERY_QUERY_LIMIT = 200
const DEFAULT_MAX_PAPERS_PER_NODE = 20
const DEFAULT_ADMISSION_THRESHOLD = 0.55
const DEFAULT_SEMANTIC_SCHOLAR_LIMIT = 25
const DEFAULT_DISCOVERY_ROUNDS = 2

export interface TopicResearchConfigState {
  schemaVersion: typeof TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION
  topicId: string
  maxCandidatesPerStage: number
  discoveryQueryLimit: number
  maxPapersPerNode: number
  admissionThreshold: number
  semanticScholarLimit: number
  discoveryRounds: number
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
      maxCandidatesPerStage: typeof defaults.maxCandidates === 'number' 
        ? clampValue(defaults.maxCandidates, 10, 100) 
        : DEFAULT_MAX_CANDIDATES_PER_STAGE,
      maxPapersPerNode: typeof defaults.maxPapersPerNode === 'number'
        ? clampValue(defaults.maxPapersPerNode, 5, 30)
        : DEFAULT_MAX_PAPERS_PER_NODE,
    }
  } catch {
    // Topic may be user-created; use global defaults
    return {}
  }
}

function buildFallback(topicId: string): TopicResearchConfigState {
  const topicDefaults = resolveDefaultResearchConfig(topicId)
  
  return {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId,
    maxCandidatesPerStage: topicDefaults.maxCandidatesPerStage ?? DEFAULT_MAX_CANDIDATES_PER_STAGE,
    discoveryQueryLimit: DEFAULT_DISCOVERY_QUERY_LIMIT,
    maxPapersPerNode: topicDefaults.maxPapersPerNode ?? DEFAULT_MAX_PAPERS_PER_NODE,
    admissionThreshold: DEFAULT_ADMISSION_THRESHOLD,
    semanticScholarLimit: DEFAULT_SEMANTIC_SCHOLAR_LIMIT,
    discoveryRounds: DEFAULT_DISCOVERY_ROUNDS,
    updatedAt: new Date(0).toISOString(),
  }
}

function parseTopicResearchConfig(topicId: string, value: unknown): TopicResearchConfigState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const candidate = value as Partial<TopicResearchConfigState>
  if (candidate.topicId && candidate.topicId !== topicId) return null

  return {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId,
    maxCandidatesPerStage: clampValue(
      typeof candidate.maxCandidatesPerStage === 'number' ? candidate.maxCandidatesPerStage : DEFAULT_MAX_CANDIDATES_PER_STAGE,
      10,
      100
    ),
    discoveryQueryLimit: clampValue(
      typeof candidate.discoveryQueryLimit === 'number' ? candidate.discoveryQueryLimit : DEFAULT_DISCOVERY_QUERY_LIMIT,
      50,
      300
    ),
    maxPapersPerNode: clampValue(
      typeof candidate.maxPapersPerNode === 'number' ? candidate.maxPapersPerNode : DEFAULT_MAX_PAPERS_PER_NODE,
      5,
      30
    ),
    admissionThreshold: clampValue(
      typeof candidate.admissionThreshold === 'number' ? candidate.admissionThreshold : DEFAULT_ADMISSION_THRESHOLD,
      0.15,
      0.85
    ),
    semanticScholarLimit: clampValue(
      typeof candidate.semanticScholarLimit === 'number' ? candidate.semanticScholarLimit : DEFAULT_SEMANTIC_SCHOLAR_LIMIT,
      10,
      50
    ),
    discoveryRounds: clampValue(
      typeof candidate.discoveryRounds === 'number' ? candidate.discoveryRounds : DEFAULT_DISCOVERY_ROUNDS,
      1,
      4
    ),
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim()
        ? candidate.updatedAt
        : new Date().toISOString(),
  }
}

export async function loadTopicResearchConfig(topicId: string): Promise<TopicResearchConfigState> {
  const fallback = buildFallback(topicId)
  const record = await readVersionedSystemConfig({
    key: topicResearchConfigKey(topicId),
    parse: (value) => parseTopicResearchConfig(topicId, value),
    fallback,
  })

  return record.value
}

export async function loadTopicResearchConfigMap(topicIds: string[]): Promise<Map<string, TopicResearchConfigState>> {
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

export async function saveTopicResearchConfig(
  topicId: string,
  params: Partial<Omit<TopicResearchConfigState, 'schemaVersion' | 'topicId' | 'updatedAt'>>
): Promise<TopicResearchConfigState> {
  const currentConfig = await loadTopicResearchConfig(topicId)
  
  // Helper to safely parse numeric values
  const safeNumber = (value: unknown, fallback: number): number => {
    if (value === undefined || value === null) return fallback
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback
  }
  
  const nextValue: TopicResearchConfigState = {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId,
    maxCandidatesPerStage: clampValue(
      safeNumber(params.maxCandidatesPerStage, currentConfig.maxCandidatesPerStage),
      10,
      100
    ),
    discoveryQueryLimit: clampValue(
      safeNumber(params.discoveryQueryLimit, currentConfig.discoveryQueryLimit),
      50,
      300
    ),
    maxPapersPerNode: clampValue(
      safeNumber(params.maxPapersPerNode, currentConfig.maxPapersPerNode),
      5,
      30
    ),
    admissionThreshold: clampValue(
      safeNumber(params.admissionThreshold, currentConfig.admissionThreshold),
      0.15,
      0.85
    ),
    semanticScholarLimit: clampValue(
      safeNumber(params.semanticScholarLimit, currentConfig.semanticScholarLimit),
      10,
      50
    ),
    discoveryRounds: clampValue(
      safeNumber(params.discoveryRounds, currentConfig.discoveryRounds),
      1,
      4
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

// Global research config (not topic-specific, used when no topic config exists)
export async function loadGlobalResearchConfig(): Promise<TopicResearchConfigState> {
  const record = await readVersionedSystemConfig({
    key: topicResearchConfigKey('global'),
    parse: (value) => parseTopicResearchConfig('global', value),
    fallback: buildFallback('global'),
  })

  return record.value
}

export async function saveGlobalResearchConfig(
  params: Partial<Omit<TopicResearchConfigState, 'schemaVersion' | 'topicId' | 'updatedAt'>>
): Promise<TopicResearchConfigState> {
  const currentConfig = await loadGlobalResearchConfig()
  
  // Helper to safely parse numeric values
  const safeNumber = (value: unknown, fallback: number): number => {
    if (value === undefined || value === null) return fallback
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback
  }
  
  const nextValue: TopicResearchConfigState = {
    schemaVersion: TOPIC_RESEARCH_CONFIG_SCHEMA_VERSION,
    topicId: 'global',
    maxCandidatesPerStage: clampValue(
      safeNumber(params.maxCandidatesPerStage, currentConfig.maxCandidatesPerStage),
      10,
      100
    ),
    discoveryQueryLimit: clampValue(
      safeNumber(params.discoveryQueryLimit, currentConfig.discoveryQueryLimit),
      50,
      300
    ),
    maxPapersPerNode: clampValue(
      safeNumber(params.maxPapersPerNode, currentConfig.maxPapersPerNode),
      5,
      30
    ),
    admissionThreshold: clampValue(
      safeNumber(params.admissionThreshold, currentConfig.admissionThreshold),
      0.15,
      0.85
    ),
    semanticScholarLimit: clampValue(
      safeNumber(params.semanticScholarLimit, currentConfig.semanticScholarLimit),
      10,
      50
    ),
    discoveryRounds: clampValue(
      safeNumber(params.discoveryRounds, currentConfig.discoveryRounds),
      1,
      4
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

// Export defaults for use in executor and discovery modules
export const RESEARCH_CONFIG_DEFAULTS = {
  MAX_CANDIDATES_PER_STAGE: DEFAULT_MAX_CANDIDATES_PER_STAGE,
  DISCOVERY_QUERY_LIMIT: DEFAULT_DISCOVERY_QUERY_LIMIT,
  MAX_PAPERS_PER_NODE: DEFAULT_MAX_PAPERS_PER_NODE,
  ADMISSION_THRESHOLD: DEFAULT_ADMISSION_THRESHOLD,
  SEMANTIC_SCHOLAR_LIMIT: DEFAULT_SEMANTIC_SCHOLAR_LIMIT,
  DISCOVERY_ROUNDS: DEFAULT_DISCOVERY_ROUNDS,
}
