// ========== Import shared types from model-config.ts ==========

import type {
  ProviderId,
  OmniTask,
  ModelSlot,
  ResearchRoleId,
  TaskRouteTarget,
  ThinkingMode,
  CitationMode,
  ParserMode,
  ProviderCapability,
  ProviderModelRef,
  ProviderModelOptions,
  ProviderModelConfig,
  UserModelConfig,
  SanitizedProviderModelConfig,
  SanitizedUserModelConfig,
  ModelPreset,
  ProviderCatalogModel,
  ProviderUiHints,
  ProviderConfigField,
  OmniAttachment,
  OmniMessage,
  OmniCompleteRequest,
  OmniIssueCode,
  OmniIssue,
  OmniCompletionResult,
  BuiltinCategoryName,
  CategoryId,
  CategoryConfig,
  CategoriesConfig,
  CategoryThinkingConfig,
  FallbackModelEntry,
} from '../../../shared/model-config'

// ========== Re-export imported types for convenience ==========

export type {
  ProviderId,
  OmniTask,
  ModelSlot,
  ResearchRoleId,
  TaskRouteTarget,
  ThinkingMode,
  CitationMode,
  ParserMode,
  ProviderCapability,
  ProviderModelRef,
  ProviderModelOptions,
  ProviderModelConfig,
  UserModelConfig,
  SanitizedProviderModelConfig,
  SanitizedUserModelConfig,
  ModelPreset,
  ProviderCatalogModel,
  ProviderUiHints,
  ProviderConfigField,
  OmniAttachment,
  OmniMessage,
  OmniCompleteRequest,
  OmniIssueCode,
  OmniIssue,
  OmniCompletionResult,
  BuiltinCategoryName,
  CategoryId,
  CategoryConfig,
  CategoriesConfig,
  CategoryThinkingConfig,
  FallbackModelEntry,
}

// ========== Types unique to omni service ==========

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

export interface ProviderContract {
  taskSupport?: Partial<Record<OmniTask, 'recommended' | 'supported' | 'limited'>>
  preferredSlots?: Partial<Record<OmniTask, ModelSlot>>
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
  targetTab?: 'assistant' | 'research'
  targetResearchView?: 'search' | 'references' | 'resources'
  targetRoute?: string
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
