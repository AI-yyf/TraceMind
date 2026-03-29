import type { ProviderConfig, RuntimeProviderId } from './types.ts'

function readEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function resolveProviderConfig(providerId: RuntimeProviderId): ProviderConfig {
  if (providerId === 'openai-compatible') {
    return {
      id: providerId,
      label: 'OpenAI 兼容接口',
      apiKey: readEnv('OPENAI_API_KEY'),
      baseUrl: readEnv('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1',
      model: readEnv('OPENAI_MODEL') ?? 'gpt-4.1',
      supportsMultimodal: true,
      supportsDirectExecution: true,
    }
  }

  if (providerId === 'anthropic') {
    return {
      id: providerId,
      label: 'Anthropic 消息接口',
      apiKey: readEnv('ANTHROPIC_API_KEY'),
      baseUrl: readEnv('ANTHROPIC_BASE_URL') ?? 'https://api.anthropic.com',
      model: readEnv('ANTHROPIC_MODEL') ?? 'claude-3-7-sonnet-latest',
      supportsMultimodal: true,
      supportsDirectExecution: true,
    }
  }

  return {
    id: 'agent-skill',
    label: 'Agent Skill 任务包',
    model: 'agent-native',
    supportsMultimodal: true,
    supportsDirectExecution: false,
  }
}

export function listProviderConfigs() {
  return (['openai-compatible', 'anthropic', 'agent-skill'] as RuntimeProviderId[]).map((providerId) =>
    resolveProviderConfig(providerId),
  )
}

export function assertProviderCredentials(config: ProviderConfig) {
  if (!config.supportsDirectExecution) return
  if (!config.apiKey) {
    throw new Error(`缺少 ${config.label} 的 API Key，请先配置对应的环境变量。`)
  }
}
