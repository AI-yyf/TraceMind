import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildConfigureOmniUserModelConfig,
  parseConfigureOmniCliArgs,
} from '../services/omni/cli-config'

test('parseConfigureOmniCliArgs accepts a single shared model for both slots', () => {
  const parsed = parseConfigureOmniCliArgs([
    '--api-key=test-key',
    '--base-url=https://ai.1seey.com/v1',
    '--model=Kimi-K2.5',
    '--thinking=auto',
    '--citations=backend',
    '--parser=backend',
    '--temperature=0.2',
    '--max-tokens=4096',
  ])

  assert.deepEqual(parsed, {
    userId: undefined,
    provider: 'openai_compatible',
    baseUrl: 'https://ai.1seey.com/v1',
    apiKey: 'test-key',
    apiKeyEnv: undefined,
    model: 'Kimi-K2.5',
    languageModel: undefined,
    multimodalModel: undefined,
    thinking: 'auto',
    citations: 'backend',
    parser: 'backend',
    temperature: 0.2,
    maxTokens: 4096,
  })
})

test('parseConfigureOmniCliArgs rejects incomplete dual-slot input', () => {
  assert.throws(
    () =>
      parseConfigureOmniCliArgs([
        '--api-key=test-key',
        '--language-model=Kimi-K2.5',
      ]),
    /both --language-model and --multimodal-model are required/i,
  )
})

test('parseConfigureOmniCliArgs can resolve the API key from an environment variable', () => {
  const original = process.env.SUZHI_TEST_API_KEY

  try {
    process.env.SUZHI_TEST_API_KEY = 'env-secret'
    const parsed = parseConfigureOmniCliArgs([
      '--api-key-env=SUZHI_TEST_API_KEY',
      '--base-url=https://ai.1seey.com/v1',
      '--model=Kimi-K2.5',
    ])

    assert.equal(parsed.apiKey, 'env-secret')
    assert.equal(parsed.apiKeyEnv, 'SUZHI_TEST_API_KEY')
  } finally {
    if (typeof original === 'string') {
      process.env.SUZHI_TEST_API_KEY = original
    } else {
      delete process.env.SUZHI_TEST_API_KEY
    }
  }
})

test('parseConfigureOmniCliArgs rejects ambiguous inline and env API key input', () => {
  assert.throws(
    () =>
      parseConfigureOmniCliArgs([
        '--api-key=test-key',
        '--api-key-env=SUZHI_TEST_API_KEY',
        '--model=Kimi-K2.5',
      ]),
    /either --api-key or --api-key-env/i,
  )
})

test('buildConfigureOmniUserModelConfig mirrors language and vision roles onto the resolved slots', () => {
  const config = buildConfigureOmniUserModelConfig({
    provider: 'openai_compatible',
    baseUrl: 'https://ai.1seey.com/v1',
    apiKey: 'test-key',
    languageModel: 'Kimi-K2.5',
    multimodalModel: 'Kimi-K2.5',
    thinking: 'auto',
    citations: 'backend',
    parser: 'backend',
  })

  assert.equal(config.language?.provider, 'openai_compatible')
  assert.equal(config.language?.model, 'Kimi-K2.5')
  assert.equal(config.language?.baseUrl, 'https://ai.1seey.com/v1')
  assert.equal(config.multimodal?.model, 'Kimi-K2.5')
  assert.equal(config.roles?.workbench_chat?.model, 'Kimi-K2.5')
  assert.equal(config.roles?.node_writer?.model, 'Kimi-K2.5')
  assert.equal(config.roles?.vision_reader?.model, 'Kimi-K2.5')
  assert.equal(config.roles?.vision_reader?.provider, 'openai_compatible')
  assert.equal(config.roles?.workbench_chat?.apiKey, undefined)
  assert.equal(config.roles?.workbench_chat?.baseUrl, undefined)
  assert.equal(config.roles?.vision_reader?.apiKey, undefined)
  assert.equal(config.roles?.vision_reader?.baseUrl, undefined)
})
