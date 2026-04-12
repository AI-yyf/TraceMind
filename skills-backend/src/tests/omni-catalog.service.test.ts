import assert from 'node:assert/strict'
import test from 'node:test'

import { PROVIDER_CATALOG } from '../services/omni/catalog'

test('provider catalog exposes manifest-style auth metadata and config schemas', () => {
  assert.equal(PROVIDER_CATALOG.length > 0, true)

  for (const provider of PROVIDER_CATALOG) {
    assert.equal(provider.providerAuthEnvVars.length > 0, true, `${provider.provider} is missing auth env vars`)
    assert.equal(provider.providerAuthChoices.length > 0, true, `${provider.provider} is missing auth choices`)
    assert.ok(provider.configSchema, `${provider.provider} is missing config schema`)
    const configSchema = provider.configSchema
    assert.equal(configSchema.type, 'object')
    assert.equal(typeof configSchema.additionalProperties, 'boolean')

    for (const choice of provider.providerAuthChoices) {
      assert.equal(choice.provider, provider.provider)
      assert.equal(typeof choice.groupId, 'string')
      assert.equal(choice.groupId.length > 0, true)
      assert.equal(typeof choice.choiceLabel, 'string')
      assert.equal(choice.choiceLabel.length > 0, true)
    }

    for (const field of provider.configFields ?? []) {
      const schemaProperty = configSchema.properties[field.key as keyof typeof configSchema.properties]
      assert.ok(schemaProperty, `${provider.provider} missing schema property for ${field.key}`)
      assert.equal(schemaProperty.type, field.type)
      assert.equal(schemaProperty.title, field.label)
    }
  }
})

test('openai-compatible catalog entry keeps configurable transport options', () => {
  const compatibleProvider = PROVIDER_CATALOG.find((entry) => entry.provider === 'openai_compatible')

  assert.ok(compatibleProvider)

  const fieldKeys = new Set((compatibleProvider.configFields ?? []).map((field) => field.key))
  assert.equal(fieldKeys.has('headers'), true)
  assert.equal(fieldKeys.has('query'), true)
  assert.equal(fieldKeys.has('body'), true)
  assert.equal(fieldKeys.has('appId'), true)
  assert.equal(compatibleProvider.uiHints?.supportsCustomBaseUrl, true)
  assert.equal(compatibleProvider.uiHints?.supportsCustomHeaders, true)
  assert.equal(
    compatibleProvider.models.some((item) => item.id === 'Kimi-K2.5' && item.recommended === true),
    true,
  )
})
