export type ProviderId =
  | 'nvidia'
  | 'openai_compatible'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'dashscope'
  | 'bigmodel'
  | 'ark'
  | 'hunyuan'
  | 'deepseek'

export type OmniTask =
  | 'general_chat'
  | 'topic_chat'
  | 'topic_chat_vision'
  | 'topic_summary'
  | 'document_parse'
  | 'figure_analysis'
  | 'formula_recognition'
  | 'table_extraction'
  | 'evidence_explainer'

export type ModelSlot = 'language' | 'multimodal'
export type ResearchRoleId =
  | 'workbench_chat'
  | 'topic_architect'
  | 'research_judge'
  | 'node_writer'
  | 'paper_writer'
  | 'critic'
  | 'localizer'
  | 'vision_reader'
export type TaskRouteTarget = ModelSlot | ResearchRoleId
export type ThinkingMode = 'on' | 'off' | 'auto'
export type CitationMode = 'native' | 'backend'
export type ParserMode = 'native' | 'backend'
export type ProviderAuthMethod = 'api-key' | 'oauth' | 'none'
export type ProviderConfigFieldType = 'string' | 'number' | 'boolean' | 'json'

export interface ProviderAuthChoice {
  provider: ProviderId
  method: ProviderAuthMethod
  choiceId: string
  choiceLabel: string
  choiceHint?: string
  groupId: string
  groupLabel: string
  groupHint?: string
}

export interface ProviderConfigField {
  key: string
  label: string
  description: string
  type: ProviderConfigFieldType
  placeholder?: string
  defaultValue?: string | number | boolean | Record<string, string> | null
  multiline?: boolean
}

export interface ProviderConfigSchema {
  type: 'object'
  additionalProperties: boolean
  properties: Record<
    string,
    {
      type: ProviderConfigFieldType
      title: string
      description?: string
      defaultValue?: string | number | boolean | Record<string, string> | null
      multiline?: boolean
    }
  >
}

export interface ProviderUiHints {
  supportsCustomBaseUrl?: boolean
  supportsCustomHeaders?: boolean
  tone?: 'global' | 'china' | 'custom'
  recommendedFor?: string[]
}

export interface ProviderContract {
  taskSupport?: Partial<Record<OmniTask, 'recommended' | 'supported' | 'limited'>>
  preferredSlots?: Partial<Record<OmniTask, ModelSlot>>
}

export interface ProviderModelRef {
  provider: ProviderId
  model: string
}

export interface ProviderModelOptions {
  thinking?: ThinkingMode
  citations?: CitationMode
  parser?: ParserMode
  temperature?: number
  maxTokens?: number
}

export interface ProviderModelConfig extends ProviderModelRef {
  baseUrl?: string
  apiKeyRef?: string
  apiKey?: string
  providerOptions?: Record<string, unknown>
  options?: ProviderModelOptions
}

export interface UserModelConfig {
  language?: ProviderModelConfig | null
  multimodal?: ProviderModelConfig | null
  roles?: Partial<Record<ResearchRoleId, ProviderModelConfig | null>>
  taskOverrides?: Partial<Record<OmniTask, ProviderModelRef>>
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>
}

export interface SanitizedProviderModelConfig extends ProviderModelRef {
  baseUrl?: string
  apiKeyRef?: string
  apiKeyStatus: 'configured' | 'missing'
  apiKeyPreview?: string
  providerOptions?: Record<string, unknown>
  options?: ProviderModelOptions
}

export interface SanitizedUserModelConfig {
  language: SanitizedProviderModelConfig | null
  multimodal: SanitizedProviderModelConfig | null
  roles?: Partial<Record<ResearchRoleId, SanitizedProviderModelConfig | null>>
  taskOverrides?: Partial<Record<OmniTask, ProviderModelRef>>
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>
}

export interface ProviderCapability {
  text: boolean
  image: boolean
  pdf: boolean
  chart: boolean
  formula: boolean
  citationsNative: boolean
  fileParserNative: boolean
  toolCalling: boolean
  jsonMode: boolean
  streaming: boolean
}

export interface ProviderCatalogModel {
  id: string
  label: string
  slot: 'language' | 'multimodal' | 'both'
  capabilities: ProviderCapability
  recommended?: boolean
  description?: string
}

export interface ProviderCatalogEntry {
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
  models: ProviderCatalogModel[]
}

export interface ModelPreset {
  id: string
  label: string
  description: string
  language: ProviderModelRef
  multimodal: ProviderModelRef
}

export interface OmniAttachment {
  type: 'image' | 'pdf' | 'table'
  mimeType: string
  url?: string
  base64?: string
  caption?: string
}

export interface OmniMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: OmniAttachment[]
}

export interface OmniCompleteRequest {
  task: OmniTask
  messages: OmniMessage[]
  preferredSlot?: ModelSlot
  role?: ResearchRoleId
  userId?: string
  json?: boolean
  temperature?: number
  maxTokens?: number
}

export type OmniIssueCode = 'missing_key' | 'invalid_key' | 'provider_error'

export interface OmniIssue {
  code: OmniIssueCode
  title: string
  message: string
  provider?: ProviderId | 'backend'
  model?: string
  slot?: ModelSlot
}

export interface OmniCompletionResult {
  text: string
  reasoning?: string
  provider: ProviderId | 'backend'
  model: string
  slot: ModelSlot
  capabilities: ProviderCapability
  usedFallback: boolean
  issue?: OmniIssue
}

export interface TopicCitationRef {
  anchorId: string
  type: 'paper' | 'node' | 'figure' | 'table' | 'formula' | 'section'
  route: string
  label: string
  quote: string
}

export interface SuggestedAction {
  label: string
  action: 'explain' | 'compare' | 'summarize' | 'navigate' | 'show_evidence'
  targetId?: string
  description?: string
}

export interface TopicGuidanceReceipt {
  classification: 'ask' | 'suggest' | 'challenge' | 'focus' | 'style' | 'command'
  directiveId: string | null
  directiveType: 'suggest' | 'challenge' | 'focus' | 'style' | 'constraint' | 'command' | null
  status: 'accepted' | 'partial' | 'deferred' | 'rejected' | 'superseded' | 'consumed' | 'none'
  scopeLabel: string
  summary: string
  effectWindow: 'next-run' | 'until-cleared' | 'current-session' | 'none'
  promptHint: string
}

export interface TopicWorkbenchAction {
  kind:
    | 'start-research'
    | 'stop-research'
    | 'export-dossier'
    | 'export-highlights'
    | 'export-notes'
  summary: string
  targetTab?: 'assistant' | 'notes'
  durationHours?: number
}

export interface TopicChatResponse {
  messageId: string
  answer: string
  citations: TopicCitationRef[]
  suggestedActions: SuggestedAction[]
  guidanceReceipt?: TopicGuidanceReceipt
  workbenchAction?: TopicWorkbenchAction
  notice?: OmniIssue
}
