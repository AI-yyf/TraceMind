import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ProviderIdSchema,
  OmniTaskSchema,
  ResearchRoleIdSchema,
  ModelSlotSchema,
  ThinkingModeSchema,
  CitationModeSchema,
  ParserModeSchema,
  ProviderCapabilitySchema,
  ProviderModelOptionsSchema,
  ProviderModelRefSchema,
  ProviderModelConfigSchema,
  UserModelConfigSchema,
  SanitizedProviderModelConfigSchema,
  SanitizedUserModelConfigSchema as _SanitizedUserModelConfigSchema,
  OmniAttachmentSchema,
  OmniMessageSchema,
  OmniCompleteRequestSchema,
  OmniIssueSchema,
  OmniCompletionResultSchema,
  validateUserModelConfig,
  validateProviderModelConfig,
  validateOmniCompleteRequest,
  validateProviderCapability,
  validateProviderId,
  validateOmniTask,
  validateResearchRoleId,
  DEFAULT_TEXT_CAPABILITY,
  DEFAULT_MULTIMODAL_CAPABILITY,
} from '../validation-schemas'

// ========== ProviderIdSchema Tests ==========

test('ProviderIdSchema accepts all valid provider IDs', () => {
  const validProviders = [
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
  ]

  for (const provider of validProviders) {
    const result = ProviderIdSchema.safeParse(provider)
    assert.equal(result.success, true, `${provider} should be valid`)
    if (result.success) {
      assert.equal(result.data, provider)
    }
  }
})

test('ProviderIdSchema rejects invalid provider IDs', () => {
  const invalidProviders = [
    'azure',
    'invalid_provider',
    '',
    'OPENAI', // case-sensitive
    'openai-compatible', // underscore required
    'custom',
  ]

  for (const provider of invalidProviders) {
    const result = ProviderIdSchema.safeParse(provider)
    assert.equal(result.success, false, `${provider} should be invalid`)
  }
})

test('ProviderIdSchema returns Chinese error message', () => {
  const result = ProviderIdSchema.safeParse('invalid')
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(
      result.error.errors[0]?.message.includes('无效'),
      'Error message should be in Chinese',
    )
  }
})

// ========== OmniTaskSchema Tests ==========

test('OmniTaskSchema accepts all valid task types', () => {
  const validTasks = [
    'general_chat',
    'topic_chat',
    'topic_chat_vision',
    'topic_summary',
    'document_parse',
    'figure_analysis',
    'formula_recognition',
    'table_extraction',
    'evidence_explainer',
  ]

  for (const task of validTasks) {
    const result = OmniTaskSchema.safeParse(task)
    assert.equal(result.success, true, `${task} should be valid`)
    if (result.success) {
      assert.equal(result.data, task)
    }
  }
})

test('OmniTaskSchema rejects invalid task types', () => {
  const invalidTasks = ['chat', 'invalid_task', '', 'GENERAL_CHAT', 'paper_analysis']

  for (const task of invalidTasks) {
    const result = OmniTaskSchema.safeParse(task)
    assert.equal(result.success, false, `${task} should be invalid`)
  }
})

// ========== ResearchRoleIdSchema Tests ==========

test('ResearchRoleIdSchema accepts all valid role IDs', () => {
  const validRoles = [
    'workbench_chat',
    'topic_architect',
    'research_judge',
    'node_writer',
    'paper_writer',
    'critic',
    'localizer',
    'vision_reader',
  ]

  for (const role of validRoles) {
    const result = ResearchRoleIdSchema.safeParse(role)
    assert.equal(result.success, true, `${role} should be valid`)
    if (result.success) {
      assert.equal(result.data, role)
    }
  }
})

test('ResearchRoleIdSchema rejects invalid role IDs', () => {
  const invalidRoles = ['admin', 'invalid_role', '', 'TOPIC_ARCHITECT', 'assistant']

  for (const role of invalidRoles) {
    const result = ResearchRoleIdSchema.safeParse(role)
    assert.equal(result.success, false, `${role} should be invalid`)
  }
})

// ========== ModelSlotSchema Tests ==========

test('ModelSlotSchema accepts valid slots', () => {
  const result1 = ModelSlotSchema.safeParse('language')
  assert.equal(result1.success, true)
  if (result1.success) {
    assert.equal(result1.data, 'language')
  }

  const result2 = ModelSlotSchema.safeParse('multimodal')
  assert.equal(result2.success, true)
  if (result2.success) {
    assert.equal(result2.data, 'multimodal')
  }
})

test('ModelSlotSchema rejects invalid slots', () => {
  const invalidSlots = ['vision', 'text', '', 'LANGUAGE', 'both']

  for (const slot of invalidSlots) {
    const result = ModelSlotSchema.safeParse(slot)
    assert.equal(result.success, false, `${slot} should be invalid`)
  }
})

// ========== ThinkingModeSchema Tests ==========

test('ThinkingModeSchema accepts valid thinking modes', () => {
  const validModes = ['on', 'off', 'auto']

  for (const mode of validModes) {
    const result = ThinkingModeSchema.safeParse(mode)
    assert.equal(result.success, true, `${mode} should be valid`)
  }
})

test('ThinkingModeSchema rejects invalid thinking modes', () => {
  const invalidModes = ['enabled', 'disabled', '', 'ON', 'true']

  for (const mode of invalidModes) {
    const result = ThinkingModeSchema.safeParse(mode)
    assert.equal(result.success, false, `${mode} should be invalid`)
  }
})

// ========== CitationModeSchema Tests ==========

test('CitationModeSchema accepts valid citation modes', () => {
  const result1 = CitationModeSchema.safeParse('native')
  assert.equal(result1.success, true)

  const result2 = CitationModeSchema.safeParse('backend')
  assert.equal(result2.success, true)
})

test('CitationModeSchema rejects invalid citation modes', () => {
  const invalidModes = ['auto', 'both', '', 'NATIVE', 'on']

  for (const mode of invalidModes) {
    const result = CitationModeSchema.safeParse(mode)
    assert.equal(result.success, false, `${mode} should be invalid`)
  }
})

// ========== ParserModeSchema Tests ==========

test('ParserModeSchema accepts valid parser modes', () => {
  const result1 = ParserModeSchema.safeParse('native')
  assert.equal(result1.success, true)

  const result2 = ParserModeSchema.safeParse('backend')
  assert.equal(result2.success, true)
})

// ========== ProviderCapabilitySchema Tests ==========

test('ProviderCapabilitySchema accepts valid capability object', () => {
  const validCapability = {
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

  const result = ProviderCapabilitySchema.safeParse(validCapability)
  assert.equal(result.success, true)
})

test('ProviderCapabilitySchema rejects non-boolean capability fields', () => {
  const invalidCapability = {
    text: 'yes', // string instead of boolean
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

  const result = ProviderCapabilitySchema.safeParse(invalidCapability)
  assert.equal(result.success, false)
})

test('ProviderCapabilitySchema uses passthrough for extra fields', () => {
  const capabilityWithExtra = {
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
    customField: 'extra', // extra field
  }

  const result = ProviderCapabilitySchema.safeParse(capabilityWithExtra)
  assert.equal(result.success, true, 'passthrough should allow extra fields')
})

// ========== ProviderModelOptionsSchema Tests ==========

test('ProviderModelOptionsSchema accepts valid options', () => {
  const validOptions = {
    thinking: 'auto',
    citations: 'native',
    parser: 'backend',
    temperature: 0.7,
    maxTokens: 4096,
  }

  const result = ProviderModelOptionsSchema.safeParse(validOptions)
  assert.equal(result.success, true)
})

test('ProviderModelOptionsSchema validates temperature range', () => {
  // Valid temperature
  const result1 = ProviderModelOptionsSchema.safeParse({ temperature: 0 })
  assert.equal(result1.success, true)

  const result2 = ProviderModelOptionsSchema.safeParse({ temperature: 2 })
  assert.equal(result2.success, true)

  const result3 = ProviderModelOptionsSchema.safeParse({ temperature: 1.5 })
  assert.equal(result3.success, true)

  // Invalid temperature - below 0
  const result4 = ProviderModelOptionsSchema.safeParse({ temperature: -0.1 })
  assert.equal(result4.success, false, 'temperature below 0 should be invalid')

  // Invalid temperature - above 2
  const result5 = ProviderModelOptionsSchema.safeParse({ temperature: 2.1 })
  assert.equal(result5.success, false, 'temperature above 2 should be invalid')
})

test('ProviderModelOptionsSchema validates maxTokens is positive integer', () => {
  // Valid maxTokens
  const result1 = ProviderModelOptionsSchema.safeParse({ maxTokens: 1 })
  assert.equal(result1.success, true)

  const result2 = ProviderModelOptionsSchema.safeParse({ maxTokens: 4096 })
  assert.equal(result2.success, true)

  // Invalid maxTokens - negative
  const result3 = ProviderModelOptionsSchema.safeParse({ maxTokens: -1 })
  assert.equal(result3.success, false, 'negative maxTokens should be invalid')

  // Invalid maxTokens - zero
  const result4 = ProviderModelOptionsSchema.safeParse({ maxTokens: 0 })
  assert.equal(result4.success, false, 'zero maxTokens should be invalid')

  // Invalid maxTokens - non-integer
  const result5 = ProviderModelOptionsSchema.safeParse({ maxTokens: 1.5 })
  assert.equal(result5.success, false, 'non-integer maxTokens should be invalid')
})

// ========== ProviderModelRefSchema Tests ==========

test('ProviderModelRefSchema accepts valid model reference', () => {
  const validRef = {
    provider: 'openai',
    model: 'gpt-5.4',
  }

  const result = ProviderModelRefSchema.safeParse(validRef)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal(result.data.provider, 'openai')
    assert.equal(result.data.model, 'gpt-5.4')
  }
})

test('ProviderModelRefSchema rejects missing required fields', () => {
  // Missing provider
  const result1 = ProviderModelRefSchema.safeParse({ model: 'gpt-5.4' })
  assert.equal(result1.success, false)

  // Missing model
  const result2 = ProviderModelRefSchema.safeParse({ provider: 'openai' })
  assert.equal(result2.success, false)

  // Empty model
  const result3 = ProviderModelRefSchema.safeParse({ provider: 'openai', model: '' })
  assert.equal(result3.success, false)
})

// ========== ProviderModelConfigSchema Tests ==========

test('ProviderModelConfigSchema accepts valid config', () => {
  const validConfig = {
    provider: 'bigmodel',
    model: 'glm-5',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyRef: 'BIGMODEL_API_KEY',
    apiKey: 'sk-test-key',
    options: {
      thinking: 'auto',
      temperature: 0.8,
    },
  }

  const result = ProviderModelConfigSchema.safeParse(validConfig)
  assert.equal(result.success, true)
})

test('ProviderModelConfigSchema validates baseUrl as URL', () => {
  // Valid URL
  const result1 = ProviderModelConfigSchema.safeParse({
    provider: 'openai_compatible',
    model: 'test-model',
    baseUrl: 'https://api.example.com/v1',
  })
  assert.equal(result1.success, true)

  // Invalid URL
  const result2 = ProviderModelConfigSchema.safeParse({
    provider: 'openai_compatible',
    model: 'test-model',
    baseUrl: 'not-a-url',
  })
  assert.equal(result2.success, false, 'invalid URL should be rejected')
})

test('ProviderModelConfigSchema allows optional fields to be omitted', () => {
  const minimalConfig = {
    provider: 'openai_compatible',
    model: 'test-model',
  }

  const result = ProviderModelConfigSchema.safeParse(minimalConfig)
  assert.equal(result.success, true)
})

// ========== UserModelConfigSchema Tests ==========

test('UserModelConfigSchema accepts valid config with both slots', () => {
  const validConfig = {
    language: {
      provider: 'openai_compatible',
      model: 'Kimi-K2.5',
      baseUrl: 'https://ai.1seey.com/v1',
    },
    multimodal: {
      provider: 'openai_compatible',
      model: 'Kimi-K2.5',
      baseUrl: 'https://ai.1seey.com/v1',
    },
  }

  const result = UserModelConfigSchema.safeParse(validConfig)
  assert.equal(result.success, true)
})

test('UserModelConfigSchema accepts config with only language slot', () => {
  const config = {
    language: {
      provider: 'bigmodel',
      model: 'glm-5',
    },
    multimodal: null,
  }

  const result = UserModelConfigSchema.safeParse(config)
  assert.equal(result.success, true)
})

test('UserModelConfigSchema accepts config with roles', () => {
  const config = {
    language: {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    roles: {
      topic_architect: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-0',
      },
      critic: null,
    },
  }

  const result = UserModelConfigSchema.safeParse(config)
  assert.equal(result.success, true)
})

test('UserModelConfigSchema accepts config with taskOverrides', () => {
  const config = {
    language: {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    taskOverrides: {
      document_parse: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-0',
      },
    },
  }

  const result = UserModelConfigSchema.safeParse(config)
  assert.equal(result.success, true)
})

test('UserModelConfigSchema accepts config with taskRouting', () => {
  const config = {
    language: {
      provider: 'openai',
      model: 'gpt-5.4',
    },
    taskRouting: {
      document_parse: 'multimodal',
      topic_chat: 'language',
    },
  }

  const result = UserModelConfigSchema.safeParse(config)
  assert.equal(result.success, true)
})

test('UserModelConfigSchema rejects invalid role ID', () => {
  const config = {
    roles: {
      invalid_role: { // invalid role ID
        provider: 'openai',
        model: 'test',
      },
    },
  }

  const result = UserModelConfigSchema.safeParse(config)
  assert.equal(result.success, false)
})

test('UserModelConfigSchema rejects invalid task ID in taskRouting', () => {
  const config = {
    taskRouting: {
      invalid_task: 'language',
    },
  }

  const result = UserModelConfigSchema.safeParse(config)
  assert.equal(result.success, false)
})

test('UserModelConfigSchema accepts empty config', () => {
  const result = UserModelConfigSchema.safeParse({})
  assert.equal(result.success, true)
})

// ========== SanitizedProviderModelConfigSchema Tests ==========

test('SanitizedProviderModelConfigSchema requires apiKeyStatus', () => {
  const valid = {
    provider: 'openai',
    model: 'gpt-5.4',
    apiKeyStatus: 'configured',
  }

  const result1 = SanitizedProviderModelConfigSchema.safeParse(valid)
  assert.equal(result1.success, true)

  // Missing apiKeyStatus
  const invalid = {
    provider: 'openai',
    model: 'gpt-5.4',
  }

  const result2 = SanitizedProviderModelConfigSchema.safeParse(invalid)
  assert.equal(result2.success, false)
})

test('SanitizedProviderModelConfigSchema validates apiKeyStatus enum', () => {
  const result1 = SanitizedProviderModelConfigSchema.safeParse({
    provider: 'openai',
    model: 'gpt-5.4',
    apiKeyStatus: 'configured',
  })
  assert.equal(result1.success, true)

  const result2 = SanitizedProviderModelConfigSchema.safeParse({
    provider: 'openai',
    model: 'gpt-5.4',
    apiKeyStatus: 'missing',
  })
  assert.equal(result2.success, true)

  const result3 = SanitizedProviderModelConfigSchema.safeParse({
    provider: 'openai',
    model: 'gpt-5.4',
    apiKeyStatus: 'invalid',
  })
  assert.equal(result3.success, false)
})

// ========== OmniAttachmentSchema Tests ==========

test('OmniAttachmentSchema accepts valid image attachment', () => {
  const valid = {
    type: 'image',
    mimeType: 'image/png',
    url: 'https://example.com/image.png',
    caption: 'Test image',
  }

  const result = OmniAttachmentSchema.safeParse(valid)
  assert.equal(result.success, true)
})

test('OmniAttachmentSchema accepts valid PDF attachment with base64', () => {
  const valid = {
    type: 'pdf',
    mimeType: 'application/pdf',
    base64: 'base64-encoded-data',
  }

  const result = OmniAttachmentSchema.safeParse(valid)
  assert.equal(result.success, true)
})

test('OmniAttachmentSchema validates attachment type enum', () => {
  const invalid = {
    type: 'video', // invalid type
    mimeType: 'video/mp4',
    url: 'https://example.com/video.mp4',
  }

  const result = OmniAttachmentSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

test('OmniAttachmentSchema requires mimeType', () => {
  const invalid = {
    type: 'image',
    // missing mimeType
  }

  const result = OmniAttachmentSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

// ========== OmniMessageSchema Tests ==========

test('OmniMessageSchema accepts valid messages', () => {
  const systemMessage = { role: 'system', content: 'System prompt' }
  const userMessage = { role: 'user', content: 'User input' }
  const assistantMessage = { role: 'assistant', content: 'AI response' }

  assert.equal(OmniMessageSchema.safeParse(systemMessage).success, true)
  assert.equal(OmniMessageSchema.safeParse(userMessage).success, true)
  assert.equal(OmniMessageSchema.safeParse(assistantMessage).success, true)
})

test('OmniMessageSchema accepts messages with attachments', () => {
  const message = {
    role: 'user',
    content: 'Analyze this image',
    attachments: [
      {
        type: 'image',
        mimeType: 'image/png',
        url: 'https://example.com/image.png',
      },
    ],
  }

  const result = OmniMessageSchema.safeParse(message)
  assert.equal(result.success, true)
})

test('OmniMessageSchema validates role enum', () => {
  const invalid = {
    role: 'admin', // invalid role
    content: 'Test',
  }

  const result = OmniMessageSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

// ========== OmniCompleteRequestSchema Tests ==========

test('OmniCompleteRequestSchema accepts valid request', () => {
  const valid = {
    task: 'general_chat',
    messages: [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'User input' },
    ],
    preferredSlot: 'language',
    temperature: 0.7,
    maxTokens: 4096,
  }

  const result = OmniCompleteRequestSchema.safeParse(valid)
  assert.equal(result.success, true)
})

test('OmniCompleteRequestSchema requires at least one message', () => {
  const invalid = {
    task: 'general_chat',
    messages: [], // empty messages array
  }

  const result = OmniCompleteRequestSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

test('OmniCompleteRequestSchema requires task field', () => {
  const invalid = {
    messages: [{ role: 'user', content: 'Test' }],
  }

  const result = OmniCompleteRequestSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

// ========== OmniIssueSchema Tests ==========

test('OmniIssueSchema accepts valid issue', () => {
  const valid = {
    code: 'missing_key',
    title: 'API Key Missing',
    message: 'The API key for openai provider is not configured',
    provider: 'openai',
    slot: 'language',
  }

  const result = OmniIssueSchema.safeParse(valid)
  assert.equal(result.success, true)
})

test('OmniIssueSchema validates issue code enum', () => {
  const invalid = {
    code: 'unknown_error', // invalid code
    title: 'Error',
    message: 'Something went wrong',
  }

  const result = OmniIssueSchema.safeParse(invalid)
  assert.equal(result.success, false)
})

// ========== OmniCompletionResultSchema Tests ==========

test('OmniCompletionResultSchema accepts valid result', () => {
  const valid = {
    text: 'AI response text',
    provider: 'openai',
    model: 'gpt-5.4',
    slot: 'language',
    capabilities: DEFAULT_TEXT_CAPABILITY,
    usedFallback: false,
  }

  const result = OmniCompletionResultSchema.safeParse(valid)
  assert.equal(result.success, true)
})

test('OmniCompletionResultSchema accepts result with reasoning', () => {
  const valid = {
    text: 'Response',
    reasoning: 'Internal reasoning process',
    provider: 'anthropic',
    model: 'claude-sonnet-4-0',
    slot: 'multimodal',
    capabilities: DEFAULT_MULTIMODAL_CAPABILITY,
    usedFallback: true,
  }

  const result = OmniCompletionResultSchema.safeParse(valid)
  assert.equal(result.success, true)
})

test('OmniCompletionResultSchema accepts backend as provider', () => {
  const valid = {
    text: 'Backend response',
    provider: 'backend',
    model: 'internal',
    slot: 'language',
    capabilities: DEFAULT_TEXT_CAPABILITY,
    usedFallback: false,
  }

  const result = OmniCompletionResultSchema.safeParse(valid)
  assert.equal(result.success, true)
})

// ========== Validation Helper Function Tests ==========

test('validateUserModelConfig returns success for valid config', () => {
  const result = validateUserModelConfig({
    language: { provider: 'openai', model: 'gpt-5.4' },
    multimodal: { provider: 'anthropic', model: 'claude-sonnet-4-0' },
  })

  assert.equal(result.success, true)
  assert.ok(result.data, 'should return data on success')
})

test('validateUserModelConfig returns errors for invalid config', () => {
  const result = validateUserModelConfig({
    language: { provider: 'invalid', model: '' },
  })

  assert.equal(result.success, false)
  assert.ok(result.errors, 'should return errors on failure')
  assert.ok(result.errors!.length > 0, 'should have at least one error')
})

test('validateProviderModelConfig returns success for valid config', () => {
  const result = validateProviderModelConfig({
    provider: 'bigmodel',
    model: 'glm-5',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  })

  assert.equal(result.success, true)
  assert.ok(result.data)
})

test('validateProviderModelConfig returns errors for missing fields', () => {
  const result = validateProviderModelConfig({})

  assert.equal(result.success, false)
  assert.ok(result.errors)
})

test('validateOmniCompleteRequest validates request structure', () => {
  const valid = validateOmniCompleteRequest({
    task: 'topic_chat',
    messages: [{ role: 'user', content: 'Hello' }],
  })

  assert.equal(valid.success, true)

  const invalid = validateOmniCompleteRequest({
    task: 'invalid_task',
    messages: [],
  })

  assert.equal(invalid.success, false)
})

test('validateProviderCapability validates capability object', () => {
  const valid = validateProviderCapability(DEFAULT_TEXT_CAPABILITY)
  assert.equal(valid.success, true)

  const invalid = validateProviderCapability({
    text: 'yes', // should be boolean
    image: false,
  })
  assert.equal(invalid.success, false)
})

test('validateProviderId returns single error string', () => {
  const valid = validateProviderId('openai')
  assert.equal(valid.success, true)
  assert.equal(valid.data, 'openai')

  const invalid = validateProviderId('invalid')
  assert.equal(invalid.success, false)
  assert.ok(invalid.error, 'should have error string')
})

test('validateOmniTask returns single error string', () => {
  const valid = validateOmniTask('document_parse')
  assert.equal(valid.success, true)
  assert.equal(valid.data, 'document_parse')

  const invalid = validateOmniTask('unknown_task')
  assert.equal(invalid.success, false)
  assert.ok(invalid.error)
})

test('validateResearchRoleId returns single error string', () => {
  const valid = validateResearchRoleId('topic_architect')
  assert.equal(valid.success, true)
  assert.equal(valid.data, 'topic_architect')

  const invalid = validateResearchRoleId('unknown_role')
  assert.equal(invalid.success, false)
  assert.ok(invalid.error)
})

// ========== Default Capability Constants Tests ==========

test('DEFAULT_TEXT_CAPABILITY has correct structure', () => {
  assert.equal(DEFAULT_TEXT_CAPABILITY.text, true)
  assert.equal(DEFAULT_TEXT_CAPABILITY.image, false)
  assert.equal(DEFAULT_TEXT_CAPABILITY.pdf, false)
  assert.equal(DEFAULT_TEXT_CAPABILITY.toolCalling, true)
  assert.equal(DEFAULT_TEXT_CAPABILITY.jsonMode, true)
  assert.equal(DEFAULT_TEXT_CAPABILITY.streaming, true)
})

test('DEFAULT_MULTIMODAL_CAPABILITY has correct structure', () => {
  assert.equal(DEFAULT_MULTIMODAL_CAPABILITY.text, true)
  assert.equal(DEFAULT_MULTIMODAL_CAPABILITY.image, true)
  assert.equal(DEFAULT_MULTIMODAL_CAPABILITY.pdf, true)
  assert.equal(DEFAULT_MULTIMODAL_CAPABILITY.chart, true)
  assert.equal(DEFAULT_MULTIMODAL_CAPABILITY.formula, true)
  assert.equal(DEFAULT_MULTIMODAL_CAPABILITY.fileParserNative, true)
})
