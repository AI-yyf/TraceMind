import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as nodeEditorialTesting } from '../services/editorial/node-editorial-agent'
import { __testing as paperEditorialTesting } from '../services/editorial/paper-editorial-agent'

const EDITORIAL_ENV_KEYS = [
  'EDITORIAL_API_KEY',
  'EDITORIAL_BASE_URL',
  'EDITORIAL_MODEL',
  'MOONSHOT_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'DASHSCOPE_API_KEY',
  'DEEPSEEK_API_KEY',
  'OMNI_DEFAULT_API_KEY',
  'OMNI_DEFAULT_BASE_URL',
  'OMNI_DEFAULT_MAX_TOKENS',
  'OMNI_DEFAULT_MODEL',
  'OMNI_DEFAULT_PROVIDER',
  'OMNI_DEFAULT_TEMPERATURE',
  'OMNI_LANGUAGE_API_KEY',
  'OMNI_LANGUAGE_BASE_URL',
  'OMNI_LANGUAGE_MODEL',
  'OMNI_LANGUAGE_PROVIDER',
  'OMNI_LANGUAGE_TEMPERATURE',
  'OMNI_ROLE_NODE_WRITER_API_KEY',
  'OMNI_ROLE_NODE_WRITER_BASE_URL',
  'OMNI_ROLE_NODE_WRITER_MAX_TOKENS',
  'OMNI_ROLE_NODE_WRITER_MODEL',
  'OMNI_ROLE_NODE_WRITER_PROVIDER',
  'OMNI_ROLE_PAPER_WRITER_API_KEY',
  'OMNI_ROLE_PAPER_WRITER_BASE_URL',
  'OMNI_ROLE_PAPER_WRITER_MODEL',
  'OMNI_ROLE_PAPER_WRITER_PROVIDER',
] as const

async function withEnv(
  updates: Partial<Record<(typeof EDITORIAL_ENV_KEYS)[number], string>>,
  run: () => Promise<void> | void,
) {
  const previous = Object.fromEntries(
    EDITORIAL_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof EDITORIAL_ENV_KEYS)[number], string | undefined>

  for (const key of EDITORIAL_ENV_KEYS) {
    delete process.env[key]
  }

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value
  }

  try {
    await run()
  } finally {
    for (const key of EDITORIAL_ENV_KEYS) {
      const original = previous[key]
      if (typeof original === 'string') {
        process.env[key] = original
      } else {
        delete process.env[key]
      }
    }
  }
}

test('node editorial config prefers OMNI node_writer values over slot, default, and legacy editorial envs', async () => {
  await withEnv(
    {
      EDITORIAL_API_KEY: 'legacy-editorial-key',
      EDITORIAL_BASE_URL: 'https://legacy-editorial.example/v1',
      EDITORIAL_MODEL: 'legacy-editorial-model',
      OMNI_DEFAULT_API_KEY: 'default-omni-key',
      OMNI_DEFAULT_BASE_URL: 'https://default-omni.example/v1',
      OMNI_DEFAULT_MODEL: 'default-omni-model',
      OMNI_LANGUAGE_API_KEY: 'language-omni-key',
      OMNI_LANGUAGE_BASE_URL: 'https://language-omni.example/v1',
      OMNI_LANGUAGE_MODEL: 'language-omni-model',
      OMNI_LANGUAGE_TEMPERATURE: '0.41',
      OMNI_ROLE_NODE_WRITER_API_KEY: 'node-writer-key',
      OMNI_ROLE_NODE_WRITER_BASE_URL: 'https://node-writer.example/v1',
      OMNI_ROLE_NODE_WRITER_MODEL: 'node-writer-model',
      OMNI_ROLE_NODE_WRITER_MAX_TOKENS: '5120',
    },
    () => {
      const config = nodeEditorialTesting.resolveNodeEditorialConfig()

      assert.equal(config.apiKey, 'node-writer-key')
      assert.equal(config.baseUrl, 'https://node-writer.example/v1')
      assert.equal(config.model, 'node-writer-model')
      assert.equal(config.defaultMaxTokens, 5120)
      assert.equal(config.defaultTemperature, 0.41)
    },
  )
})

test('paper editorial config inherits OMNI language and default values when the paper_writer role only overrides the model', async () => {
  await withEnv(
    {
      OMNI_DEFAULT_API_KEY: 'default-omni-key',
      OMNI_DEFAULT_MAX_TOKENS: '3072',
      OMNI_LANGUAGE_BASE_URL: 'https://language-omni.example/v1',
      OMNI_LANGUAGE_TEMPERATURE: '0.27',
      OMNI_ROLE_PAPER_WRITER_MODEL: 'paper-writer-model',
    },
    () => {
      const config = paperEditorialTesting.resolvePaperEditorialConfig()

      assert.equal(config.apiKey, 'default-omni-key')
      assert.equal(config.baseUrl, 'https://language-omni.example/v1')
      assert.equal(config.model, 'paper-writer-model')
      assert.equal(config.defaultMaxTokens, 3072)
      assert.equal(config.defaultTemperature, 0.27)
    },
  )
})

test('paper editorial config ignores incompatible OMNI providers and falls back to legacy editorial envs', async () => {
  await withEnv(
    {
      EDITORIAL_API_KEY: 'legacy-editorial-key',
      EDITORIAL_BASE_URL: 'https://legacy-editorial.example/v1',
      EDITORIAL_MODEL: 'legacy-editorial-model',
      OMNI_DEFAULT_API_KEY: 'incompatible-omni-key',
      OMNI_LANGUAGE_PROVIDER: 'anthropic',
      OMNI_LANGUAGE_MODEL: 'claude-sonnet-test',
    },
    () => {
      const config = paperEditorialTesting.resolvePaperEditorialConfig()

      assert.equal(config.apiKey, 'legacy-editorial-key')
      assert.equal(config.baseUrl, 'https://legacy-editorial.example/v1')
      assert.equal(config.model, 'legacy-editorial-model')
    },
  )
})
