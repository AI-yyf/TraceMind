import { defaultBaseUrlForProvider } from './catalog'
import type {
  CitationMode,
  ParserMode,
  ProviderId,
  ProviderModelConfig,
  ThinkingMode,
  UserModelConfig,
} from './types'

const LANGUAGE_ROLE_IDS = [
  'workbench_chat',
  'topic_architect',
  'research_judge',
  'node_writer',
  'paper_writer',
  'critic',
  'localizer',
] as const

const MULTIMODAL_ROLE_IDS = ['vision_reader'] as const

const PROVIDERS = new Set<ProviderId>([
  'nvidia',
  'openai_compatible',
  'openai',
  'anthropic',
  'google',
  'dashscope',
  'bigmodel',
  'ark',
  'hunyuan',
  'deepseek',
])

const THINKING_MODES = new Set<ThinkingMode>(['on', 'off', 'auto'])
const CITATION_MODES = new Set<CitationMode>(['native', 'backend'])
const PARSER_MODES = new Set<ParserMode>(['native', 'backend'])

export type ConfigureOmniCliOptions = {
  userId?: string
  provider: ProviderId
  baseUrl?: string
  apiKey: string
  apiKeyEnv?: string
  model?: string
  languageModel?: string
  multimodalModel?: string
  thinking?: ThinkingMode
  citations?: CitationMode
  parser?: ParserMode
  temperature?: number
  maxTokens?: number
}

function normalizeString(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseOptionValue(args: string[], name: string) {
  const prefix = `--${name}=`
  const match = args.find((arg) => arg.startsWith(prefix))
  return normalizeString(match?.slice(prefix.length))
}

function resolveApiKeyFromArgs(args: string[], env: NodeJS.ProcessEnv) {
  const apiKey = parseOptionValue(args, 'api-key')
  const apiKeyEnv = parseOptionValue(args, 'api-key-env')

  if (apiKey && apiKeyEnv) {
    throw new Error('Use either --api-key or --api-key-env, not both.')
  }

  if (apiKeyEnv) {
    const resolved = env[apiKeyEnv]?.trim()
    if (!resolved) {
      throw new Error(`Environment variable ${apiKeyEnv} is empty or not set.`)
    }

    return {
      apiKey: resolved,
      apiKeyEnv,
    }
  }

  if (!apiKey) {
    throw new Error('api-key is required. Pass --api-key or --api-key-env=ENV_VAR_NAME.')
  }

  return {
    apiKey,
    apiKeyEnv: undefined,
  }
}

function parseOptionalNumber(value: string | undefined, label: string) {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return parsed
}

function assertEnumValue<T extends string>(
  value: string | undefined,
  allowed: Set<T>,
  label: string,
): T | undefined {
  if (!value) return undefined
  if (!allowed.has(value as T)) {
    throw new Error(`${label} must be one of: ${Array.from(allowed).join(', ')}.`)
  }
  return value as T
}

function buildSlotConfig(
  provider: ProviderId,
  model: string,
  apiKey: string,
  baseUrl: string | undefined,
  options: {
    thinking?: ThinkingMode
    citations?: CitationMode
    parser?: ParserMode
    temperature?: number
    maxTokens?: number
  },
): ProviderModelConfig {
  const normalizedOptions = {
    thinking: options.thinking,
    citations: options.citations,
    parser: options.parser,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  }

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    options: Object.values(normalizedOptions).some((value) => value !== undefined)
      ? normalizedOptions
      : undefined,
  }
}

function buildInheritedRoleConfig(slot: ProviderModelConfig): ProviderModelConfig {
  return {
    provider: slot.provider,
    model: slot.model,
  }
}

export function parseConfigureOmniCliArgs(args: string[]): ConfigureOmniCliOptions {
  const providerValue = parseOptionValue(args, 'provider') ?? 'openai_compatible'
  if (!PROVIDERS.has(providerValue as ProviderId)) {
    throw new Error(`provider must be one of: ${Array.from(PROVIDERS).join(', ')}.`)
  }

  const { apiKey, apiKeyEnv } = resolveApiKeyFromArgs(args, process.env)

  const model = parseOptionValue(args, 'model')
  const languageModel = parseOptionValue(args, 'language-model')
  const multimodalModel = parseOptionValue(args, 'multimodal-model')

  if (!model && !languageModel && !multimodalModel) {
    throw new Error('Provide --model or both --language-model and --multimodal-model.')
  }

  if (!model && (!languageModel || !multimodalModel)) {
    throw new Error('When --model is omitted, both --language-model and --multimodal-model are required.')
  }

  const temperature = parseOptionalNumber(parseOptionValue(args, 'temperature'), 'temperature')
  if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
    throw new Error('temperature must be between 0 and 2.')
  }

  const maxTokens = parseOptionalNumber(parseOptionValue(args, 'max-tokens'), 'max-tokens')
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) {
    throw new Error('max-tokens must be a positive integer.')
  }

  return {
    userId: parseOptionValue(args, 'user-id'),
    provider: providerValue as ProviderId,
    baseUrl: parseOptionValue(args, 'base-url'),
    apiKey,
    apiKeyEnv,
    model,
    languageModel,
    multimodalModel,
    thinking: assertEnumValue(parseOptionValue(args, 'thinking'), THINKING_MODES, 'thinking'),
    citations: assertEnumValue(parseOptionValue(args, 'citations'), CITATION_MODES, 'citations'),
    parser: assertEnumValue(parseOptionValue(args, 'parser'), PARSER_MODES, 'parser'),
    temperature,
    maxTokens,
  }
}

export function buildConfigureOmniUserModelConfig(options: ConfigureOmniCliOptions): UserModelConfig {
  const baseUrl = normalizeString(options.baseUrl) || defaultBaseUrlForProvider(options.provider)
  const languageModel = normalizeString(options.languageModel) || normalizeString(options.model)
  const multimodalModel = normalizeString(options.multimodalModel) || normalizeString(options.model)

  if (!languageModel || !multimodalModel) {
    throw new Error('Both language and multimodal models must resolve to non-empty values.')
  }

  const slotOptions = {
    thinking: options.thinking,
    citations: options.citations,
    parser: options.parser,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  }

  const language = buildSlotConfig(
    options.provider,
    languageModel,
    options.apiKey,
    baseUrl,
    slotOptions,
  )
  const multimodal = buildSlotConfig(
    options.provider,
    multimodalModel,
    options.apiKey,
    baseUrl,
    slotOptions,
  )

  const roles = Object.fromEntries([
    ...LANGUAGE_ROLE_IDS.map((roleId) => [roleId, buildInheritedRoleConfig(language)] as const),
    ...MULTIMODAL_ROLE_IDS.map((roleId) => [roleId, buildInheritedRoleConfig(multimodal)] as const),
  ])

  return {
    language,
    multimodal,
    roles,
  }
}
