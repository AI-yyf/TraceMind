import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../routes/topic-gen'

test('openai-compatible topic generation profiles keep structured JSON generation in single-pass mode', () => {
  const compatibleProfile = __testing.buildTopicGenerationPassProfile(
    { provider: 'openai_compatible' },
    3,
  )
  const openAIProfile = __testing.buildTopicGenerationPassProfile(
    { provider: 'openai' },
    3,
  )

  assert.deepEqual(compatibleProfile, {
    requestJson: true,
    attemptLimit: 1,
  })
  assert.deepEqual(openAIProfile, {
    requestJson: true,
    attemptLimit: 3,
  })
})

test('topic generation strategy defaults compatible providers to native generation instead of scaffold mode', () => {
  assert.deepEqual(
    __testing.resolveTopicGenerationStrategy({
      provider: 'openai_compatible',
    }),
    {
      mode: 'native',
      usesCompatibleGateway: true,
    },
  )
})

test('topic generation strategy honors explicit provider override modes', () => {
  assert.deepEqual(
    __testing.resolveTopicGenerationStrategy({
      provider: 'openai_compatible',
      providerOptions: {
        topicGenerationMode: 'patches-only',
      },
    }),
    {
      mode: 'patches-only',
      usesCompatibleGateway: true,
    },
  )

  assert.deepEqual(
    __testing.resolveTopicGenerationStrategy({
      provider: 'openai',
      providerOptions: {
        topicGenerationMode: 'scaffold',
      },
    }),
    {
      mode: 'scaffold',
      usesCompatibleGateway: false,
    },
  )
})
