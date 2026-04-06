import { describe, expect, it } from 'vitest'

import type { ModelConfigResponse } from '@/types/alpha'
import { buildRolePayload } from './promptStudioModelConfig'

const providerCapability = {
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

const catalog: ModelConfigResponse['catalog'] = [
  {
    provider: 'openai_compatible',
    label: 'OpenAI Compatible',
    baseUrl: 'https://ai.1seey.com/v1',
    adapter: 'openai-compatible',
    providerAuthEnvVars: [],
    providerAuthChoices: [],
    models: [
      {
        id: 'Kimi-K2.5',
        label: 'Kimi-K2.5',
        slot: 'language',
        capabilities: providerCapability,
      },
    ],
  },
]

describe('buildRolePayload', () => {
  it('emits explicit null for a role that is switched back to inherited defaults', () => {
    const payload = buildRolePayload(
      {
        critic: {
          mode: 'default',
          form: {
            provider: '',
            model: '',
            baseUrl: '',
            apiKey: '',
            providerOptions: {},
            thinking: 'auto',
            citations: 'backend',
            parser: 'backend',
            temperature: '',
            maxTokens: '',
          },
        },
      },
      catalog,
      {
        critic: {
          provider: 'openai_compatible',
          model: 'legacy-critic',
          apiKeyStatus: 'configured',
        },
      },
    )

    expect(payload).toEqual({
      critic: null,
    })
  })

  it('keeps a valid custom role model payload when custom mode is enabled', () => {
    const payload = buildRolePayload(
      {
        critic: {
          mode: 'custom',
          form: {
            provider: 'openai_compatible',
            model: 'Kimi-K2.5',
            baseUrl: 'https://ai.1seey.com/v1',
            apiKey: '',
            providerOptions: {},
            thinking: 'on',
            citations: 'backend',
            parser: 'backend',
            temperature: '0.2',
            maxTokens: '512',
          },
        },
      },
      catalog,
    )

    expect(payload).toEqual({
      critic: {
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        baseUrl: 'https://ai.1seey.com/v1',
        apiKey: undefined,
        providerOptions: undefined,
        options: {
          thinking: 'on',
          citations: 'backend',
          parser: 'backend',
          temperature: 0.2,
          maxTokens: 512,
        },
      },
    })
  })
})
