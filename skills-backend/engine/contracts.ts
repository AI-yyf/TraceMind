export type SkillId =
  | 'paper-tracker'
  | 'content-genesis-v2'
  | 'topic-visualizer'
  | 'orchestrator'

export type AgentTarget = 'codex' | 'claude-code' | 'generic'
export type SkillExecutionMode = 'agent-prompt' | 'json-contract' | 'local-script'
export type SkillStorageMode = 'canonical-only' | 'debug' | 'dry-run'

export interface SkillStoragePolicy {
  mode: SkillStorageMode
  root: string
  allowedCanonicalPaths: string[]
  allowDebugArtifacts: boolean
  notes: string[]
}

export interface SkillAttachment {
  kind: 'image' | 'pdf' | 'figure' | 'table-source' | 'file'
  name: string
  url?: string
  path?: string
  mimeType?: string
  text?: string
}

export interface SkillInputField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'string[]' | 'object' | 'attachment[]'
  required: boolean
  description: string
  example?: unknown
}

export interface SkillArtifactDescriptor {
  id: string
  label: string
  relativePath: string
  kind: 'json' | 'markdown' | 'typescript' | 'asset'
  retention: 'canonical' | 'ephemeral'
}

export interface SkillManifest {
  id: SkillId
  title: string
  summary: string
  description: string
  recommendedAgentTarget: AgentTarget
  defaultMode: SkillExecutionMode
  inputSchema: SkillInputField[]
  outputSchema: Record<string, unknown>
  artifacts: SkillArtifactDescriptor[]
  localCommand: string[]
}

export interface SkillContextTopic {
  id: string
  nameZh: string
  nameEn: string
  focusLabel?: string
  originPaperId: string
  queryTags: string[]
  problemPreference: string[]
  capabilityRefs: string[]
  frontendSummary?: {
    cardSummary: string
    timelineGuide: string
    researchBlurb: string
  }
  defaults?: Record<string, unknown>
}

export interface SkillContextPaper {
  id: string
  title: string
  published: string
  authors: string[]
  summary?: string
  topicIds?: string[]
}

export interface SkillLogger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  debug?(message: string, meta?: Record<string, unknown>): void
}

// Re-export new types for backward compatibility
export type { ResearchNode, NodeStatus, NodeCreationProps, NodeUpdate, SplitSpec, MergeSpec } from '../shared/research-node'
export type { StageContext, StageSelectionResult, TimeWindow, DecisionSignal } from '../shared/stage-context'
export type { SystemConfig, DiscoveryConfig, NodeMergeConfig, ContentGenConfig, DisplayConfig } from '../shared/config'

/** @deprecated Use ResearchNode from '../shared/research-node' instead */
export interface LegacyPaperNode {
  paperId: string
  stageIndex: number
  branchId: string
  status: 'provisional' | 'canonical' | 'archived'
}

/** Node-centric topic memory structure */
export interface NodeTopicMemory {
  schemaVersion: number
  topicId: string
  originPaper: {
    paperId: string
    published: string
  }
  researchNodes: Array<import('../shared/research-node').ResearchNode>
  stageRunLedger: Array<{
    stageIndex: number
    runId: string
    timestamp: string
    nodeIds: string[]
    status: 'running' | 'completed' | 'failed'
  }>
  provisionalNodes: Array<import('../shared/research-node').ResearchNode>
  branchTree: Record<string, unknown>
  problemNodes: Record<string, unknown>[]
  decisionLog: Record<string, unknown>[]
}

export interface SkillContextSnapshot {
  topic?: SkillContextTopic
  paper?: SkillContextPaper
  topicCatalog?: {
    topics: Array<Record<string, unknown>>
  }
  topicDisplayStore?: {
    schemaVersion?: number
    topics: Array<Record<string, unknown>>
  }
  /** @deprecated Use nodeTopicMemory instead */
  topicMemory?: Record<string, unknown>
  /** New node-centric topic memory */
  nodeTopicMemory?: NodeTopicMemory
  workflowTopicMemory?: Record<string, Record<string, unknown>>
  paperCatalog?: Record<string, unknown>
  paperAssets?: Record<string, unknown>
  paperMetrics?: Record<string, unknown>
  /** @deprecated Use nodeEditorialStore instead */
  paperEditorialStore?: Record<string, unknown>
  nodeEditorialStore?: Record<string, unknown>
  topicEditorialStore?: Array<Record<string, unknown>>
  decisionMemory?: {
    schemaVersion: number
    entries: Array<Record<string, unknown>>
  }
  executionMemory?: {
    schemaVersion: number
    skills: Record<string, unknown>
  }
  activeTopicIds: string[]
  generatedDataSummary: {
    paperCount: number
    topicCount: number
    capabilityCount: number
    nodeCount: number
  }
  logger: SkillLogger
  /** System configuration */
  systemConfig?: import('../shared/config').SystemConfig
}

export type SkillContext = SkillContextSnapshot

export interface ArtifactManager {
  addChange(change: SkillArtifactChange): void
  listChanges(): SkillArtifactChange[]
}

export interface SkillInput<TParams = Record<string, unknown>> {
  params: TParams
  request: SkillExecutionRequest
}

export interface SkillOutput<TData = Record<string, unknown>> {
  success: boolean
  data: TData | null
  error?: string
  artifacts?: SkillArtifactChange[]
}

export interface SkillExecutionRequest {
  skillId: SkillId
  input: Record<string, unknown>
  agentTarget?: AgentTarget
  mode?: SkillExecutionMode
  storageMode?: SkillStorageMode
}

export interface SkillExecutionPlan {
  manifest: SkillManifest
  mode: SkillExecutionMode
  agentTarget: AgentTarget
  storageMode: SkillStorageMode
  input: Record<string, unknown>
  context: SkillContextSnapshot
  attachments: SkillAttachment[]
  systemPrompt: string
  userPrompt: string
  suggestedCommand: string[]
  outputSchema: Record<string, unknown>
  storagePlan: {
    strategy: SkillStorageMode
    root: string
    notes: string[]
  }
}

export interface SkillArtifactChange {
  relativePath: string
  kind: 'json' | 'markdown' | 'typescript' | 'asset'
  retention: 'canonical' | 'ephemeral'
  description: string
  nextValue: unknown
}

export interface SkillExecutorResult {
  output: Record<string, unknown>
  artifactChanges?: SkillArtifactChange[]
  summary: string
  debugArtifacts?: SkillArtifactChange[]
}

export interface SkillExecutionResult {
  runId: string
  manifest: SkillManifest
  mode: SkillExecutionMode
  agentTarget: AgentTarget
  storageMode: SkillStorageMode
  input: Record<string, unknown>
  context: SkillContextSnapshot
  output: Record<string, unknown>
  artifactChanges: SkillArtifactChange[]
  persistedArtifacts: string[]
  summary: string
}

export interface SkillDefinition {
  manifest: SkillManifest
  execute: any
}
