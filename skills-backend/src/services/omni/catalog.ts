import type {
  ModelPreset,
  ProviderCapability,
  ProviderContract,
  ProviderConfigField,
  ProviderCatalogEntry,
  ProviderCatalogModel,
  ProviderId,
} from './types'

const textOnly: ProviderCapability = {
  text: true,
  image: false,
  pdf: false,
  chart: false,
  formula: false,
  citationsNative: false,
  fileParserNative: false,
  toolCalling: true,
  jsonMode: true,
  streaming: true,
}

const multimodalFull: ProviderCapability = {
  text: true,
  image: true,
  pdf: true,
  chart: true,
  formula: true,
  citationsNative: false,
  fileParserNative: true,
  toolCalling: true,
  jsonMode: true,
  streaming: true,
}

const anthropicNative: ProviderCapability = {
  ...multimodalFull,
  citationsNative: true,
}

function model(
  id: string,
  label: string,
  slot: ProviderCatalogModel['slot'],
  capabilities: ProviderCapability,
  description?: string,
  recommended = false,
): ProviderCatalogModel {
  return { id, label, slot, capabilities, description, recommended }
}

function configField(
  key: string,
  label: string,
  description: string,
  type: ProviderConfigField['type'],
  options?: Omit<ProviderConfigField, 'key' | 'label' | 'description' | 'type'>,
): ProviderConfigField {
  return {
    key,
    label,
    description,
    type,
    placeholder: options?.placeholder,
    defaultValue: options?.defaultValue,
    multiline: options?.multiline,
  }
}

function buildConfigSchema(fields: ProviderConfigField[]) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    properties: Object.fromEntries(
      fields.map((field) => [
        field.key,
        {
          type: field.type,
          title: field.label,
          description: field.description,
          defaultValue: field.defaultValue,
          multiline: field.multiline,
        },
      ]),
    ),
  }
}

function hasLanguageModel(models: ProviderCatalogModel[]) {
  return models.some((item) => item.slot === 'language' || item.slot === 'both')
}

function hasMultimodalModel(models: ProviderCatalogModel[]) {
  return models.some((item) => item.slot === 'multimodal' || item.slot === 'both')
}

function buildContracts(models: ProviderCatalogModel[]): ProviderContract {
  const supportsLanguage = hasLanguageModel(models)
  const supportsMultimodal = hasMultimodalModel(models)

  return {
    preferredSlots: {
      general_chat: supportsLanguage ? 'language' : supportsMultimodal ? 'multimodal' : undefined,
      topic_chat: supportsLanguage ? 'language' : supportsMultimodal ? 'multimodal' : undefined,
      topic_chat_vision: supportsMultimodal ? 'multimodal' : supportsLanguage ? 'language' : undefined,
      topic_summary: supportsLanguage ? 'language' : supportsMultimodal ? 'multimodal' : undefined,
      document_parse: supportsMultimodal ? 'multimodal' : undefined,
      figure_analysis: supportsMultimodal ? 'multimodal' : undefined,
      formula_recognition: supportsMultimodal ? 'multimodal' : undefined,
      table_extraction: supportsMultimodal ? 'multimodal' : undefined,
      evidence_explainer: supportsMultimodal ? 'multimodal' : supportsLanguage ? 'language' : undefined,
    },
    taskSupport: {
      general_chat: supportsLanguage ? 'recommended' : supportsMultimodal ? 'supported' : undefined,
      topic_chat: supportsLanguage ? 'recommended' : supportsMultimodal ? 'supported' : undefined,
      topic_chat_vision: supportsMultimodal ? 'recommended' : supportsLanguage ? 'limited' : undefined,
      topic_summary: supportsLanguage ? 'recommended' : supportsMultimodal ? 'supported' : undefined,
      document_parse: supportsMultimodal ? 'recommended' : supportsLanguage ? 'limited' : undefined,
      figure_analysis: supportsMultimodal ? 'recommended' : supportsLanguage ? 'limited' : undefined,
      formula_recognition: supportsMultimodal ? 'recommended' : supportsLanguage ? 'limited' : undefined,
      table_extraction: supportsMultimodal ? 'recommended' : supportsLanguage ? 'limited' : undefined,
      evidence_explainer: supportsMultimodal ? 'recommended' : supportsLanguage ? 'supported' : undefined,
    },
  }
}

const compatibleConfigFields = [
  configField(
    'headers',
    'Custom Headers (JSON)',
    'Merged into every OpenAI-compatible request. Use this for gateway routing headers or app attribution.',
    'json',
    {
      placeholder: '{\n  "HTTP-Referer": "https://your-app.example",\n  "X-Title": "Research Chronicle"\n}',
      defaultValue: {},
      multiline: true,
    },
  ),
  configField(
    'query',
    'Query Params (JSON)',
    'Optional query parameters appended to the completion endpoint.',
    'json',
    {
      placeholder: '{\n  "api-version": "2024-12-01-preview"\n}',
      defaultValue: {},
      multiline: true,
    },
  ),
  configField(
    'body',
    'Request Body Overrides (JSON)',
    'Merged into every OpenAI-compatible request body before the core model/messages fields are applied. Use this for provider-specific parameters such as thinking controls.',
    'json',
    {
      placeholder:
        '{\n  "thinking": {\n    "type": "disabled"\n  },\n  "max_completion_tokens": 1024\n}',
      defaultValue: {},
      multiline: true,
    },
  ),
  configField(
    'appId',
    'Client Label',
    'A readable client or routing label that some gateways log for observability.',
    'string',
    {
      placeholder: 'research-chronicle',
      defaultValue: '',
    },
  ),
  configField(
    'topicGenerationMode',
    'Topic Generation Mode',
    'Controls the 8-language topic creation path. Use "native" for full blueprint plus localization generation, "patches-only" to localize via language patches, or "scaffold" for deterministic fallback creation.',
    'string',
    {
      placeholder: 'native',
      defaultValue: 'native',
    },
  ),
]

const openaiConfigFields = [
  configField(
    'organization',
    'OpenAI Organization',
    'Optional OpenAI organization header for enterprise or team routing.',
    'string',
    {
      placeholder: 'org_...',
      defaultValue: '',
    },
  ),
  configField(
    'project',
    'OpenAI Project',
    'Optional OpenAI project header for usage isolation.',
    'string',
    {
      placeholder: 'proj_...',
      defaultValue: '',
    },
  ),
  ...compatibleConfigFields,
]

const anthropicConfigFields = [
  configField(
    'headers',
    'Anthropic Headers (JSON)',
    'Optional extra request headers, for example beta feature flags.',
    'json',
    {
      placeholder: '{\n  "anthropic-beta": "prompt-caching-2024-07-31"\n}',
      defaultValue: {},
      multiline: true,
    },
  ),
]

function apiKeyChoice(
  provider: ProviderId,
  groupLabel: string,
  groupHint: string,
  choiceLabel: string,
) {
  return {
    provider,
    method: 'api-key' as const,
    choiceId: `${provider}-api-key`,
    choiceLabel,
    groupId: provider,
    groupLabel,
    groupHint,
  }
}

function providerEntry(
  entry: Omit<ProviderCatalogEntry, 'providerAuthChoices' | 'configSchema' | 'contracts'> & {
    providerAuthChoices?: ProviderCatalogEntry['providerAuthChoices']
    contracts?: ProviderCatalogEntry['contracts']
  },
): ProviderCatalogEntry {
  const configFields = entry.configFields ?? []

  return {
    ...entry,
    providerAuthChoices:
      entry.providerAuthChoices ??
      [apiKeyChoice(entry.provider, entry.label, 'API key authentication', `${entry.label} API key`)],
    contracts: entry.contracts ?? buildContracts(entry.models),
    configSchema: buildConfigSchema(configFields),
  }
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  providerEntry({
    provider: 'nvidia',
    label: 'NVIDIA Integrate',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['NVIDIA_API_KEY'],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'global',
      recommendedFor: ['long-context reading', 'China-friendly fallback', 'custom routing'],
    },
    models: [
      model('minimaxai/minimax-m2.5', 'MiniMax M2.5', 'language', textOnly, 'Fast high-end text model on NVIDIA Integrate.', true),
      model('moonshotai/kimi-k2.5', 'Kimi K2.5', 'both', multimodalFull, 'Long-context multimodal model on NVIDIA Integrate.'),
      model('z-ai/glm5', 'GLM-5', 'language', textOnly, 'Strong Chinese reasoning model on NVIDIA Integrate.', true),
      model('z-ai/glm4.7', 'GLM 4.7', 'language', textOnly, 'Stable text model on NVIDIA Integrate.'),
    ],
  }),
  providerEntry({
    provider: 'openai_compatible',
    label: 'OpenAI-Compatible / Custom',
    baseUrl: '',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'DASHSCOPE_API_KEY', 'MOONSHOT_API_KEY'],
    providerAuthChoices: [
      apiKeyChoice(
        'openai_compatible',
        'Compatible Gateway',
        'Custom base URL plus API key',
        'Compatible API key',
      ),
    ],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'custom',
      recommendedFor: ['custom gateways', 'self-hosted routing', 'OpenAI-compatible proxies'],
    },
    models: [
      model('minimaxai/minimax-m2.5', 'MiniMax M2.5', 'language', textOnly, 'Example model id for OpenAI-compatible gateways.'),
      model('Kimi-K2.5', 'Kimi K2.5', 'both', multimodalFull, 'Common Moonshot-compatible gateway id for long-context multimodal work.', true),
      model('moonshotai/kimi-k2.5', 'Kimi K2.5', 'both', multimodalFull, 'Example multimodal model id for OpenAI-compatible gateways.'),
      model('z-ai/glm5', 'GLM-5', 'language', textOnly, 'Example Chinese reasoning model id for OpenAI-compatible gateways.'),
      model('z-ai/glm4.7', 'GLM 4.7', 'language', textOnly, 'Example text model id for OpenAI-compatible gateways.'),
    ],
  }),
  providerEntry({
    provider: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['OPENAI_API_KEY'],
    configFields: openaiConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'global',
      recommendedFor: ['frontier reasoning', 'stable multimodal generation'],
    },
    models: [
      model('gpt-5.4', 'GPT-5.4', 'both', multimodalFull, 'Global default for reasoning and multimodal tasks.', true),
      model('gpt-4o', 'GPT-4o', 'both', multimodalFull, 'Fast multimodal fallback.'),
    ],
  }),
  providerEntry({
    provider: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    adapter: 'anthropic',
    providerAuthEnvVars: ['ANTHROPIC_API_KEY'],
    configFields: anthropicConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'global',
      recommendedFor: ['long-form editorial writing', 'grounded analysis'],
    },
    models: [
      model('claude-sonnet-4-0', 'Claude Sonnet 4.x', 'both', anthropicNative, 'Long-form grounded analysis.', true),
      model('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'both', anthropicNative),
    ],
  }),
  providerEntry({
    provider: 'google',
    label: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    adapter: 'google',
    providerAuthEnvVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    uiHints: {
      supportsCustomBaseUrl: false,
      supportsCustomHeaders: false,
      tone: 'global',
      recommendedFor: ['document reasoning', 'multimodal evidence parsing'],
    },
    models: [
      model('gemini-2.5-pro', 'Gemini 2.5 Pro', 'both', multimodalFull, 'Long-context document reasoning.', true),
      model('gemini-2.0-flash', 'Gemini 2.0 Flash', 'both', multimodalFull),
    ],
  }),
  providerEntry({
    provider: 'dashscope',
    label: '\u963f\u91cc\u767e\u70bc',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['DASHSCOPE_API_KEY'],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'china',
      recommendedFor: ['domestic deployment', 'Chinese multimodal stack'],
    },
    models: [
      model('qwen3-max', 'Qwen3 Max', 'language', textOnly, 'Top-tier Chinese reasoning model.', true),
      model('qwen3-vl-plus', 'Qwen3 VL Plus', 'multimodal', multimodalFull, 'Best first-wave domestic multimodal option.', true),
      model('deepseek-chat', 'DeepSeek Chat (via DashScope)', 'language', textOnly),
      model('deepseek-reasoner', 'DeepSeek Reasoner (via DashScope)', 'language', textOnly),
    ],
  }),
  providerEntry({
    provider: 'bigmodel',
    label: '\u667a\u8c31',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['BIGMODEL_API_KEY', 'ZHIPU_API_KEY'],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'china',
      recommendedFor: ['Default text agent pairing', 'Default multimodal choice', 'Chinese reasoning'],
    },
    models: [
      model('glm-5', 'GLM-5', 'language', textOnly, 'Strong Chinese reasoning.', true),
      model('glm-4.6', 'GLM-4.6', 'language', textOnly),
      model('glm-4.6v', 'GLM-4.6V', 'multimodal', multimodalFull, 'Vision-first GLM option.', true),
      model('glm-4.6v-flash', 'GLM-4.6V Flash', 'multimodal', multimodalFull),
    ],
  }),
  providerEntry({
    provider: 'ark',
    label: '\u706b\u5c71\u65b9\u821f',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['ARK_API_KEY', 'VOLCENGINE_API_KEY'],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'china',
      recommendedFor: ['Doubao routing', 'domestic reasoning deployment'],
    },
    models: [
      model('doubao-seed-1.6', 'Doubao Seed 1.6', 'language', textOnly),
      model('doubao-seed-1.6-thinking', 'Doubao Seed 1.6 Thinking', 'language', textOnly, 'Reasoning-centric domestic option.', true),
      model('doubao-1.5-thinking-vision-pro', 'Doubao Thinking Vision Pro', 'multimodal', multimodalFull, 'High-end domestic multimodal option.', true),
    ],
  }),
  providerEntry({
    provider: 'hunyuan',
    label: '\u817e\u8baf\u6df7\u5143',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['HUNYUAN_API_KEY', 'TENCENTCLOUD_SECRETID'],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'china',
      recommendedFor: ['Tencent ecosystem', 'domestic multimodal reading'],
    },
    models: [
      model('hunyuan-t1-latest', 'Hunyuan T1 Think', 'language', textOnly, 'Reasoning-oriented Hunyuan.', true),
      model('hunyuan-standard', 'Hunyuan Instruct', 'language', textOnly),
      model('hunyuan-vision', 'Hunyuan Vision', 'multimodal', multimodalFull, 'Vision-capable Hunyuan.', true),
    ],
  }),
  providerEntry({
    provider: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['DEEPSEEK_API_KEY'],
    configFields: compatibleConfigFields,
    uiHints: {
      supportsCustomBaseUrl: true,
      supportsCustomHeaders: true,
      tone: 'china',
      recommendedFor: ['deep reasoning', 'Chinese-language synthesis'],
    },
    models: [
      model('deepseek-chat', 'DeepSeek Chat', 'language', textOnly),
      model('deepseek-reasoner', 'DeepSeek Reasoner', 'language', textOnly, 'Strong text-only deep reasoning.', true),
    ],
  }),
]

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'china-hybrid',
    label: 'China Hybrid (Recommended)',
    description: 'Default GLM-5 for text agents and GLM-4.6V for multimodal. Recommended pairing for Chinese deployment.',
    language: { provider: 'bigmodel', model: 'glm-5' },
    multimodal: { provider: 'bigmodel', model: 'glm-4.6v' },
  },
  {
    id: 'compatible-kimi-dual',
    label: 'Compatible Kimi Dual-Slot',
    description: 'One OpenAI-compatible gateway, Kimi on both default slots, and research roles inherit unless you override them.',
    language: { provider: 'openai_compatible', model: 'Kimi-K2.5' },
    multimodal: { provider: 'openai_compatible', model: 'Kimi-K2.5' },
  },
  {
    id: 'nvidia-integrate',
    label: 'NVIDIA Integrate',
    description: 'Official NVIDIA Integrate preset with a strong text model plus a long-context multimodal pair.',
    language: { provider: 'nvidia', model: 'minimaxai/minimax-m2.5' },
    multimodal: { provider: 'nvidia', model: 'moonshotai/kimi-k2.5' },
  },
  {
    id: 'global-frontier',
    label: 'Global Frontier',
    description: 'OpenAI for language, Anthropic for multimodal grounded reading.',
    language: { provider: 'openai', model: 'gpt-5.4' },
    multimodal: { provider: 'anthropic', model: 'claude-sonnet-4-0' },
  },
  {
    id: 'china-max',
    label: 'China Max',
    description: 'Top-end domestic reasoning plus multimodal pairing.',
    language: { provider: 'deepseek', model: 'deepseek-reasoner' },
    multimodal: { provider: 'dashscope', model: 'qwen3-vl-plus' },
  },
]

function findProvider(provider: ProviderId) {
  return PROVIDER_CATALOG.find((entry) => entry.provider === provider)
}

export function defaultBaseUrlForProvider(provider: ProviderId): string {
  return findProvider(provider)?.baseUrl ?? ''
}

export function getCatalogModel(provider: ProviderId, modelId: string): ProviderCatalogModel | null {
  return findProvider(provider)?.models.find((entry) => entry.id === modelId) ?? null
}

export function inferCapabilities(provider: ProviderId, modelId: string): ProviderCapability {
  const fromCatalog = getCatalogModel(provider, modelId)
  if (fromCatalog) return fromCatalog.capabilities

  const loweredModel = modelId.toLowerCase()
  if (
    loweredModel.includes('kimi') ||
    loweredModel.includes('vision') ||
    loweredModel.includes('vl') ||
    loweredModel.includes('4o') ||
    loweredModel.includes('gemini') ||
    loweredModel.includes('sonnet')
  ) {
    return multimodalFull
  }

  return textOnly
}
