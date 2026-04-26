import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing as topicGenerateTesting } from '../scripts/topic-generate'

const TOPIC_GENERATE_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'MOONSHOT_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OMNI_DEFAULT_API_KEY',
  'OMNI_DEFAULT_BASE_URL',
  'OMNI_DEFAULT_MODEL',
  'OMNI_DEFAULT_PROVIDER',
  'OMNI_LANGUAGE_API_KEY',
  'OMNI_LANGUAGE_BASE_URL',
  'OMNI_LANGUAGE_MODEL',
  'OMNI_LANGUAGE_PROVIDER',
  'OMNI_ROLE_TOPIC_ARCHITECT_API_KEY',
  'OMNI_ROLE_TOPIC_ARCHITECT_BASE_URL',
  'OMNI_ROLE_TOPIC_ARCHITECT_MODEL',
  'OMNI_ROLE_TOPIC_ARCHITECT_PROVIDER',
] as const

async function withEnv(
  updates: Partial<Record<(typeof TOPIC_GENERATE_ENV_KEYS)[number], string>>,
  run: () => Promise<void> | void,
) {
  const previous = Object.fromEntries(
    TOPIC_GENERATE_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof TOPIC_GENERATE_ENV_KEYS)[number], string | undefined>

  for (const key of TOPIC_GENERATE_ENV_KEYS) {
    delete process.env[key]
  }

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value
  }

  try {
    await run()
  } finally {
    for (const key of TOPIC_GENERATE_ENV_KEYS) {
      const original = previous[key]
      if (typeof original === 'string') {
        process.env[key] = original
      } else {
        delete process.env[key]
      }
    }
  }
}

test('topic generation prefers OMNI topic_architect settings over legacy OPENAI_* envs', async () => {
  await withEnv(
    {
      OPENAI_API_KEY: 'legacy-openai-key',
      OPENAI_BASE_URL: 'https://legacy-openai.example/v1',
      OPENAI_MODEL: 'legacy-openai-model',
      OMNI_ROLE_TOPIC_ARCHITECT_PROVIDER: 'openai_compatible',
      OMNI_ROLE_TOPIC_ARCHITECT_API_KEY: 'topic-architect-key',
      OMNI_ROLE_TOPIC_ARCHITECT_BASE_URL: 'https://topic-architect.example/v1',
      OMNI_ROLE_TOPIC_ARCHITECT_MODEL: 'topic-architect-model',
    },
    () => {
      const config = topicGenerateTesting.resolveOpenAIClientConfig()

      assert.equal(config.apiKey, 'topic-architect-key')
      assert.equal(config.baseUrl, 'https://topic-architect.example/v1')
      assert.equal(config.model, 'topic-architect-model')
    },
  )
})

test('topic generation inherits OMNI default credentials when topic_architect only overrides the model', async () => {
  await withEnv(
    {
      OMNI_DEFAULT_API_KEY: 'default-omni-key',
      OMNI_LANGUAGE_BASE_URL: 'https://language-omni.example/v1',
      OMNI_ROLE_TOPIC_ARCHITECT_MODEL: 'topic-architect-model',
    },
    () => {
      const config = topicGenerateTesting.resolveOpenAIClientConfig()

      assert.equal(config.apiKey, 'default-omni-key')
      assert.equal(config.baseUrl, 'https://language-omni.example/v1')
      assert.equal(config.model, 'topic-architect-model')
    },
  )
})

test('topic generation falls back to MOONSHOT_API_KEY before generic OPENAI_API_KEY for Kimi-compatible gateways', async () => {
  await withEnv(
    {
      MOONSHOT_API_KEY: 'moonshot-key',
      OPENAI_API_KEY: 'generic-openai-key',
      OMNI_LANGUAGE_PROVIDER: 'openai_compatible',
      OMNI_LANGUAGE_BASE_URL: 'https://ai.1seey.com/v1',
      OMNI_LANGUAGE_MODEL: 'Kimi-K2.5',
    },
    () => {
      const config = topicGenerateTesting.resolveOpenAIClientConfig()

      assert.equal(config.apiKey, 'moonshot-key')
      assert.equal(config.baseUrl, 'https://ai.1seey.com/v1')
      assert.equal(config.model, 'Kimi-K2.5')
    },
  )
})
