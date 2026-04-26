import assert from 'node:assert/strict'
import test from 'node:test'

import { getResolvedUserModelConfig } from '../services/omni/config-store'

const ENV_KEYS = [
  'OMNI_LANGUAGE_PROVIDER',
  'OMNI_LANGUAGE_MODEL',
  'OMNI_LANGUAGE_BASE_URL',
  'OMNI_LANGUAGE_API_KEY',
  'MOONSHOT_API_KEY',
] as const

function restoreEnv(snapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key]
    if (typeof value === 'string') {
      process.env[key] = value
      continue
    }

    delete process.env[key]
  }
}

test('getResolvedUserModelConfig falls back to MOONSHOT_API_KEY for kimi-compatible language slots', { concurrency: false }, async () => {
  const snapshot = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>

  try {
    process.env.OMNI_LANGUAGE_PROVIDER = 'openai_compatible'
    process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
    process.env.OMNI_LANGUAGE_BASE_URL = 'https://ai.1seey.com/v1'
    delete process.env.OMNI_LANGUAGE_API_KEY
    process.env.MOONSHOT_API_KEY = 'moonshot-secret'

    const config = await getResolvedUserModelConfig('env-fallback-kimi')

    assert.equal(config.language?.provider, 'openai_compatible')
    assert.equal(config.language?.model, 'Kimi-K2.5')
    assert.equal(config.language?.baseUrl, 'https://ai.1seey.com/v1')
    assert.equal(config.language?.apiKey, 'moonshot-secret')
    assert.equal(config.language?.apiKeyPreview, 'MOONSHOT_API_KEY (env)')
  } finally {
    restoreEnv(snapshot)
  }
})

test('getResolvedUserModelConfig prefers the slot API key over provider-specific fallback env vars', { concurrency: false }, async () => {
  const snapshot = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>

  try {
    process.env.OMNI_LANGUAGE_PROVIDER = 'openai_compatible'
    process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
    process.env.OMNI_LANGUAGE_BASE_URL = 'https://ai.1seey.com/v1'
    process.env.OMNI_LANGUAGE_API_KEY = 'slot-secret'
    process.env.MOONSHOT_API_KEY = 'moonshot-secret'

    const config = await getResolvedUserModelConfig('env-slot-kimi')

    assert.equal(config.language?.apiKey, 'slot-secret')
    assert.equal(config.language?.apiKeyPreview, 'OMNI_LANGUAGE_API_KEY (env)')
  } finally {
    restoreEnv(snapshot)
  }
})
