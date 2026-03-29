import type {
  AgentTarget,
  SkillArtifactDescriptor,
  SkillContextSnapshot,
  SkillExecutionPlan,
  SkillId,
  SkillManifest,
  SkillStorageMode,
} from '../../skills-backend/runtime/contracts.ts'

export type RuntimeProviderId = 'openai-compatible' | 'anthropic' | 'agent-skill'
export type RuntimeRole = 'system' | 'user' | 'assistant'

export type RuntimeContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; imageUrl: string; detail?: 'low' | 'high' | 'auto' }
  | { type: 'file'; fileName: string; mimeType?: string; url?: string; localPath?: string; text?: string }

export interface RuntimeMessage {
  role: RuntimeRole
  content: RuntimeContentPart[]
}

export interface RuntimePromptRequest {
  providerId: RuntimeProviderId
  model: string
  messages: RuntimeMessage[]
  temperature?: number
  maxTokens?: number
}

export interface RuntimeUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface RuntimeResponse {
  providerId: RuntimeProviderId
  model: string
  createdAt: string
  content: string
  usage?: RuntimeUsage
  raw?: unknown
}

export interface ProviderConfig {
  id: RuntimeProviderId
  label: string
  baseUrl?: string
  apiKey?: string
  model: string
  supportsMultimodal: boolean
  supportsDirectExecution: boolean
}

export interface SkillRunRequest {
  skillId: SkillId
  input: Record<string, unknown>
  providerId?: RuntimeProviderId
  agentTarget?: AgentTarget
  storageMode?: SkillStorageMode
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface AgentSkillPacket {
  skillManifest: SkillManifest
  input: Record<string, unknown>
  contextSnapshot: SkillContextSnapshot
  allowedArtifacts: SkillArtifactDescriptor[]
  expectedOutputSchema: Record<string, unknown>
  storagePolicy: SkillExecutionPlan['storagePlan']
}

export interface AgentSkillEnvelope {
  providerId: 'agent-skill'
  agentTarget: AgentTarget
  connectorId: 'codex' | 'claude-code' | 'generic-agent'
  skillId: SkillId
  model: string
  plan: SkillExecutionPlan
  packet: AgentSkillPacket
  promptMarkdown: string
}
