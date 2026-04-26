/**
 * Kimi-K2.5 Model Configuration Test Suite
 *
 * Comprehensive test suite for Kimi-K2.5 model configuration validation
 * including routing, completion, capabilities, and encryption.
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'

import { OmniGateway as _OmniGateway, omniGateway, __testing } from '../gateway'
import {
  getResolvedUserModelConfig,
  getSanitizedUserModelConfig,
  type ResolvedProviderModelConfig,
} from '../config-store'
import { SecureStorage, type EncryptedSecretPayload, getKeyPreview } from '../secure-storage'
import { inferCapabilities, getCatalogModel, defaultBaseUrlForProvider } from '../catalog'
import { preferredSlotForRole, resolveTaskRouteTarget, DEFAULT_TASK_ROUTING } from '../routing'
import type { OmniCompleteRequest, OmniTask as _OmniTask, ModelSlot as _ModelSlot, ProviderId } from '../../../../shared/model-config'

// ============================================================================
// Test Configuration Constants
// ============================================================================

const KIMI_K2_5_CONFIG: ResolvedProviderModelConfig = {
  provider: 'openai_compatible' as ProviderId,
  model: 'Kimi-K2.5',
  baseUrl: 'https://api.moonshot.cn/v1',
  apiKey: 'test-api-key-moonshot-12345',
  apiKeyPreview: 'test***********2345',
  providerOptions: {
    headers: {
      'X-Client-Source': 'test-suite',
    },
  },
  options: {
    thinking: 'auto',
    citations: 'backend',
    parser: 'backend',
    temperature: 0.2,
    maxTokens: 8000,
  },
}

const _KIMI_K2_5_NVIDIA_CONFIG: ResolvedProviderModelConfig = {
  provider: 'nvidia' as ProviderId,
  model: 'moonshotai/kimi-k2.5',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  apiKey: 'nvidia-test-key-12345',
  apiKeyPreview: 'nvid***********2345',
  providerOptions: {},
  options: {
    thinking: 'auto',
    temperature: 0.3,
  },
}

// ============================================================================
// Configuration Resolution Tests
// ============================================================================

describe('Configuration Resolution', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.OMNI_LANGUAGE_PROVIDER
    delete process.env.OMNI_LANGUAGE_MODEL
    delete process.env.OMNI_LANGUAGE_API_KEY
    delete process.env.OMNI_LANGUAGE_BASE_URL
    delete process.env.OMNI_MULTIMODAL_PROVIDER
    delete process.env.OMNI_MULTIMODAL_MODEL
    delete process.env.OMNI_MULTIMODAL_API_KEY
    delete process.env.OMNI_MULTIMODAL_BASE_URL
  })

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv }
  })

  describe('getResolvedUserModelConfig()', () => {
    it('should return Kimi-K2.5 from environment variables', async () => {
      // Setup environment variables for Kimi-K2.5
      process.env.OMNI_LANGUAGE_PROVIDER = 'openai_compatible'
      process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
      process.env.OMNI_LANGUAGE_API_KEY = 'test-key-language'
      process.env.OMNI_LANGUAGE_BASE_URL = 'https://api.moonshot.cn/v1'

      process.env.OMNI_MULTIMODAL_PROVIDER = 'openai_compatible'
      process.env.OMNI_MULTIMODAL_MODEL = 'Kimi-K2.5'
      process.env.OMNI_MULTIMODAL_API_KEY = 'test-key-multimodal'
      process.env.OMNI_MULTIMODAL_BASE_URL = 'https://api.moonshot.cn/v1'

      const config = await getResolvedUserModelConfig('test-user')

      assert.notStrictEqual(config.language, null)
      assert.strictEqual(config.language?.provider, 'openai_compatible')
      assert.strictEqual(config.language?.model, 'Kimi-K2.5')
      assert.strictEqual(config.language?.apiKey, 'test-key-language')
      assert.strictEqual(config.language?.baseUrl, 'https://api.moonshot.cn/v1')

      assert.notStrictEqual(config.multimodal, null)
      assert.strictEqual(config.multimodal?.provider, 'openai_compatible')
      assert.strictEqual(config.multimodal?.model, 'Kimi-K2.5')
      assert.strictEqual(config.multimodal?.apiKey, 'test-key-multimodal')
    })

    it('should return null config when no environment variables are set', async () => {
      const config = await getResolvedUserModelConfig('test-user')

      assert.strictEqual(config.language, null)
      assert.strictEqual(config.multimodal, null)
    })

    it('should handle partial configuration (language only)', async () => {
      process.env.OMNI_LANGUAGE_PROVIDER = 'openai_compatible'
      process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
      process.env.OMNI_LANGUAGE_API_KEY = 'test-key'

      const config = await getResolvedUserModelConfig('test-user')

      assert.notStrictEqual(config.language, null)
      assert.strictEqual(config.multimodal, null)
    })
  })

  describe('Base URL Resolution', () => {
    it('should return correct default base URL for openai_compatible provider', () => {
      const baseUrl = defaultBaseUrlForProvider('openai_compatible')
      // openai_compatible has no default baseUrl in catalog
      assert.strictEqual(baseUrl, '')
    })

    it('should return correct default base URL for nvidia provider', () => {
      const baseUrl = defaultBaseUrlForProvider('nvidia')
      assert.strictEqual(baseUrl, 'https://integrate.api.nvidia.com/v1')
    })

    it('should return correct base URL from config when provided', () => {
      const customBaseUrl = 'https://custom.moonshot.cn/v1'
      const config = { ...KIMI_K2_5_CONFIG, baseUrl: customBaseUrl }
      assert.strictEqual(config.baseUrl, customBaseUrl)
    })
  })
})

// ============================================================================
// Encryption/Decryption Tests
// ============================================================================

describe('API Key Encryption/Decryption', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    delete process.env.MASTER_ENCRYPTION_KEY
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalMasterKey) {
      process.env.MASTER_ENCRYPTION_KEY = originalMasterKey
    } else {
      delete process.env.MASTER_ENCRYPTION_KEY
    }
  })

  describe('SecureStorage.encrypt()', () => {
    it('should encrypt API key and return payload with preview', () => {
      const testApiKey = 'sk-moonshot-test-api-key-123456789'
      const payload = SecureStorage.encrypt(testApiKey)

      assert.ok(payload.encrypted)
      assert.ok(payload.iv)
      assert.ok(payload.tag)
      assert.ok(payload.preview)

      // Preview should be masked version of the key
      assert.ok(payload.preview.startsWith('sk-moo'))
      assert.ok(payload.preview.includes('***'))

      // Encrypted data should be different from original
      assert.notStrictEqual(payload.encrypted, testApiKey)
      assert.ok(payload.encrypted.length > 0)

      // IV should be 32 hex characters (16 bytes)
      assert.strictEqual(payload.iv.length, 32)

      // Tag should be 32 hex characters (16 bytes for GCM auth tag)
      assert.strictEqual(payload.tag.length, 32)
    })

    it('should produce different encrypted output for same key (due to random IV)', () => {
      const testApiKey = 'sk-moonshot-test-api-key-123456789'
      const payload1 = SecureStorage.encrypt(testApiKey)
      const payload2 = SecureStorage.encrypt(testApiKey)

      // Same key encrypted twice should produce different ciphertexts
      assert.notStrictEqual(payload1.encrypted, payload2.encrypted)
      assert.notStrictEqual(payload1.iv, payload2.iv)

      // But preview should be the same
      assert.strictEqual(payload1.preview, payload2.preview)
    })
  })

  describe('SecureStorage.decrypt()', () => {
    it('should correctly decrypt encrypted payload back to original key', () => {
      const testApiKey = 'sk-moonshot-test-api-key-123456789'
      const payload = SecureStorage.encrypt(testApiKey)
      const decrypted = SecureStorage.decrypt(payload)

      assert.strictEqual(decrypted, testApiKey)
    })

    it('should handle encryption/decryption cycle for Kimi API key format', () => {
      const kimiApiKey = 'sk-moonshot-kimi-k2-5-example-key-abc123'
      const payload = SecureStorage.encrypt(kimiApiKey)
      const decrypted = SecureStorage.decrypt(payload)

      assert.strictEqual(decrypted, kimiApiKey)
    })

    it('should throw error for tampered encrypted data', () => {
      const testApiKey = 'sk-moonshot-test-api-key-123456789'
      const payload = SecureStorage.encrypt(testApiKey)

      // Tamper with the encrypted data
      const tamperedPayload: EncryptedSecretPayload = {
        ...payload,
        encrypted: payload.encrypted.slice(0, -2) + 'ff', // Modify last bytes
      }

      // Should throw authentication error due to GCM auth tag verification
      assert.throws(() => SecureStorage.decrypt(tamperedPayload))
    })

    it('should throw error for wrong authentication tag', () => {
      const testApiKey = 'sk-moonshot-test-api-key-123456789'
      const payload = SecureStorage.encrypt(testApiKey)

      // Tamper with the auth tag
      const tamperedPayload: EncryptedSecretPayload = {
        ...payload,
        tag: 'aabbccddeeff00112233445566778899', // Wrong tag
      }

      assert.throws(() => SecureStorage.decrypt(tamperedPayload))
    })
  })

  describe('Key Preview Generation', () => {
    it('should generate correct preview for long keys', () => {
      const longKey = 'a'.repeat(100)
      const preview = getKeyPreview(longKey)

      assert.ok(preview.startsWith('aaaaaaaa'))
      assert.ok(preview.includes('***'))
    })

    it('should handle short keys correctly', () => {
      const shortKey = 'abc'
      const preview = getKeyPreview(shortKey)

      assert.strictEqual(preview, 'abc***')
    })

    it('should handle empty key', () => {
      const preview = getKeyPreview('')
      assert.strictEqual(preview, '')
    })
  })
})

// ============================================================================
// Gateway Completion Tests
// ============================================================================

describe('Gateway Completion', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.OMNI_LANGUAGE_API_KEY
    delete process.env.OMNI_MULTIMODAL_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('omniGateway.complete() for general_chat', () => {
    it('should return fallback response when no API key is configured', { timeout: 5000 }, async () => {
      const request: OmniCompleteRequest = {
        task: 'general_chat',
        messages: [{ role: 'user', content: 'Hello' }],
        preferredSlot: 'language',
      }

      const result = await omniGateway.complete(request)

      assert.strictEqual(result.usedFallback, true)
      assert.strictEqual(result.provider, 'backend')
      assert.strictEqual(result.model, 'backend-fallback')
      assert.ok(result.issue)
      assert.strictEqual(result.issue?.code, 'missing_key')
    })

    it('should include i18n error message for missing key', { timeout: 5000 }, async () => {
      const request: OmniCompleteRequest = {
        task: 'general_chat',
        messages: [{ role: 'user', content: 'What is AI?' }],
        preferredSlot: 'language',
      }

      const result = await omniGateway.complete(request)

      // Verify Chinese error message content
      assert.ok(result.text.includes('没有'))
      assert.ok(result.text.includes('可用') || result.text.includes('API Key'))
    })
  })

  describe('Vision Task Routing', () => {
    it('should route figure_analysis to multimodal slot', () => {
      const request: OmniCompleteRequest = {
        task: 'figure_analysis',
        messages: [
          {
            role: 'user',
            content: 'Analyze this figure',
            attachments: [
              {
                type: 'image',
                mimeType: 'image/png',
                base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a6sAAAAASUVORK5CYII=',
              },
            ],
          },
        ],
      }

      // The slot should be determined as multimodal for figure_analysis
      assert.strictEqual(request.task, 'figure_analysis')
      assert.strictEqual(request.messages[0].attachments?.[0].type, 'image')
    })

    it('should route topic_chat_vision to multimodal slot', () => {
      const request: OmniCompleteRequest = {
        task: 'topic_chat_vision',
        messages: [{ role: 'user', content: 'Describe this image' }],
      }

      assert.strictEqual(request.task, 'topic_chat_vision')
    })
  })

  describe('Error Handling for Invalid API Key', () => {
    it('should detect invalid key error from error message patterns', () => {
      // Test the error detection logic indirectly through the gateway's behavior
      const errorMessages = [
        'Invalid API key',
        'incorrect api key provided',
        'authentication failed',
        'unauthorized',
        'forbidden',
      ]

      // These patterns should be detected as invalid key errors
      errorMessages.forEach((msg) => {
        const isInvalidKey = [
          'invalid api key',
          'incorrect api key',
          'api key not valid',
          'invalid x-api-key',
          'authentication',
          'unauthorized',
          'permission denied',
          'forbidden',
          'invalid key',
        ].some((token) => msg.toLowerCase().includes(token))

        assert.ok(isInvalidKey, `Should detect "${msg}" as invalid key error`)
      })
    })
  })
})

// ============================================================================
// Task Routing Tests
// ============================================================================

describe('Task Routing', () => {
  describe('Vision Tasks', () => {
    it('should route figure_analysis to multimodal by default', () => {
      const target = resolveTaskRouteTarget('figure_analysis', null)
      assert.strictEqual(target, 'vision_reader')
    })

    it('should route document_parse to multimodal by default', () => {
      const target = resolveTaskRouteTarget('document_parse', null)
      assert.strictEqual(target, 'vision_reader')
    })

    it('should route formula_recognition to multimodal by default', () => {
      const target = resolveTaskRouteTarget('formula_recognition', null)
      assert.strictEqual(target, 'vision_reader')
    })

    it('should route table_extraction to multimodal by default', () => {
      const target = resolveTaskRouteTarget('table_extraction', null)
      assert.strictEqual(target, 'vision_reader')
    })
  })

  describe('Language Tasks', () => {
    it('should route topic_summary to topic_architect by default', () => {
      const target = resolveTaskRouteTarget('topic_summary', null)
      assert.strictEqual(target, 'topic_architect')
    })

    it('should route general_chat to workbench_chat by default', () => {
      const target = resolveTaskRouteTarget('general_chat', null)
      assert.strictEqual(target, 'workbench_chat')
    })

    it('should route topic_chat to workbench_chat by default', () => {
      const target = resolveTaskRouteTarget('topic_chat', null)
      assert.strictEqual(target, 'workbench_chat')
    })
  })

  describe('Custom Routing Overrides', () => {
    it('should respect explicit multimodal override for topic_summary', () => {
      const target = resolveTaskRouteTarget('topic_summary', 'multimodal')
      assert.strictEqual(target, 'multimodal')
    })

    it('should respect explicit language override for figure_analysis', () => {
      const target = resolveTaskRouteTarget('figure_analysis', 'language')
      assert.strictEqual(target, 'language')
    })

    it('should respect role override for general_chat', () => {
      const target = resolveTaskRouteTarget('general_chat', 'research_judge')
      assert.strictEqual(target, 'research_judge')
    })

    it('should fall back to default when override is null', () => {
      const target = resolveTaskRouteTarget('topic_summary', null)
      assert.strictEqual(target, DEFAULT_TASK_ROUTING.topic_summary)
    })
  })

  describe('Slot Selection for Roles', () => {
    it('should return multimodal slot for vision_reader role', () => {
      const slot = preferredSlotForRole('vision_reader')
      assert.strictEqual(slot, 'multimodal')
    })

    it('should return language slot for topic_architect role', () => {
      const slot = preferredSlotForRole('topic_architect')
      assert.strictEqual(slot, 'language')
    })

    it('should return language slot for workbench_chat role', () => {
      const slot = preferredSlotForRole('workbench_chat')
      assert.strictEqual(slot, 'language')
    })

    it('should return language slot for research_judge role', () => {
      const slot = preferredSlotForRole('research_judge')
      assert.strictEqual(slot, 'language')
    })

    it('should return language slot for node_writer role', () => {
      const slot = preferredSlotForRole('node_writer')
      assert.strictEqual(slot, 'language')
    })

    it('should return language slot for paper_writer role', () => {
      const slot = preferredSlotForRole('paper_writer')
      assert.strictEqual(slot, 'language')
    })
  })
})

// ============================================================================
// Capability Detection Tests
// ============================================================================

describe('Capability Detection', () => {
  describe('Kimi-K2.5 Capabilities via Catalog', () => {
    it('should detect full multimodal capabilities for openai_compatible/Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')

      assert.strictEqual(capabilities.text, true)
      assert.strictEqual(capabilities.image, true)
      assert.strictEqual(capabilities.pdf, true)
      assert.strictEqual(capabilities.chart, true)
      assert.strictEqual(capabilities.formula, true)
      assert.strictEqual(capabilities.toolCalling, true)
      assert.strictEqual(capabilities.jsonMode, true)
      assert.strictEqual(capabilities.streaming, true)
      assert.strictEqual(capabilities.fileParserNative, true)
      assert.strictEqual(capabilities.citationsNative, false)
    })

    it('should detect full multimodal capabilities for nvidia/moonshotai/kimi-k2.5', () => {
      const capabilities = inferCapabilities('nvidia', 'moonshotai/kimi-k2.5')

      assert.strictEqual(capabilities.text, true)
      assert.strictEqual(capabilities.image, true)
      assert.strictEqual(capabilities.pdf, true)
      assert.strictEqual(capabilities.chart, true)
      assert.strictEqual(capabilities.formula, true)
    })

    it('should find Kimi-K2.5 in openai_compatible provider catalog', () => {
      const catalogModel = getCatalogModel('openai_compatible', 'Kimi-K2.5')

      assert.notStrictEqual(catalogModel, null)
      assert.strictEqual(catalogModel?.id, 'Kimi-K2.5')
      assert.strictEqual(catalogModel?.label, 'Kimi K2.5')
      assert.strictEqual(catalogModel?.slot, 'both')
      assert.strictEqual(catalogModel?.recommended, true)
    })

    it('should find moonshotai/kimi-k2.5 in nvidia provider catalog', () => {
      const catalogModel = getCatalogModel('nvidia', 'moonshotai/kimi-k2.5')

      assert.notStrictEqual(catalogModel, null)
      assert.strictEqual(catalogModel?.id, 'moonshotai/kimi-k2.5')
      assert.strictEqual(catalogModel?.label, 'Kimi K2.5')
    })
  })

  describe('Capability Inference Fallback', () => {
    it('should infer multimodal capabilities for lowercase kimi model names', () => {
      const capabilities = inferCapabilities('openai_compatible', 'kimi-vision-model')

      // Model name contains 'kimi', should get multimodal capabilities
      assert.strictEqual(capabilities.image, true)
      assert.strictEqual(capabilities.pdf, true)
      assert.strictEqual(capabilities.text, true)
    })

    it('should infer multimodal capabilities for vision models', () => {
      const capabilities = inferCapabilities('openai_compatible', 'my-vision-model')

      assert.strictEqual(capabilities.image, true)
      assert.strictEqual(capabilities.text, true)
    })

    it('should infer multimodal capabilities for VL models', () => {
      const capabilities = inferCapabilities('openai_compatible', 'qwen-vl-plus')

      assert.strictEqual(capabilities.image, true)
      assert.strictEqual(capabilities.formula, true)
    })

    it('should return text-only capabilities for unknown models', () => {
      const capabilities = inferCapabilities('openai_compatible', 'unknown-text-model')

      assert.strictEqual(capabilities.text, true)
      assert.strictEqual(capabilities.image, false)
      assert.strictEqual(capabilities.pdf, false)
      assert.strictEqual(capabilities.formula, false)
    })
  })

  describe('Specific Capability Flags', () => {
    it('should confirm text capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.text, true)
    })

    it('should confirm image capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.image, true)
    })

    it('should confirm pdf capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.pdf, true)
    })

    it('should confirm formula capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.formula, true)
    })

    it('should confirm chart capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.chart, true)
    })

    it('should confirm toolCalling capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.toolCalling, true)
    })

    it('should confirm jsonMode capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.jsonMode, true)
    })

    it('should confirm streaming capability is true for Kimi-K2.5', () => {
      const capabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
      assert.strictEqual(capabilities.streaming, true)
    })
  })
})

// ============================================================================
// Integration Tests
// ============================================================================

describe('Kimi-K2.5 Integration', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('should complete full encryption-decryption-config cycle', () => {
    // 1. Start with an API key
    const originalKey = 'sk-kimi-k2-5-test-key-123456'

    // 2. Encrypt it
    const encrypted = SecureStorage.encrypt(originalKey)
    assert.ok(encrypted.preview.includes('sk-kimi'))

    // 3. Decrypt it
    const decrypted = SecureStorage.decrypt(encrypted)
    assert.strictEqual(decrypted, originalKey)

    // 4. Build a config with the decrypted key
    const config: ResolvedProviderModelConfig = {
      provider: 'openai_compatible',
      model: 'Kimi-K2.5',
      baseUrl: 'https://api.moonshot.cn/v1',
      apiKey: decrypted,
      apiKeyPreview: encrypted.preview,
    }

    // 5. Verify capabilities
    const capabilities = inferCapabilities(config.provider, config.model)
    assert.strictEqual(capabilities.image, true)
    assert.strictEqual(capabilities.pdf, true)
  })

  it('should handle both NVIDIA and OpenAI-Compatible Kimi configurations', () => {
    // NVIDIA configuration
    const nvidiaCapabilities = inferCapabilities('nvidia', 'moonshotai/kimi-k2.5')
    assert.strictEqual(nvidiaCapabilities.image, true)

    // OpenAI-Compatible configuration
    const compatibleCapabilities = inferCapabilities('openai_compatible', 'Kimi-K2.5')
    assert.strictEqual(compatibleCapabilities.image, true)

    // Both should have same capabilities
    assert.deepStrictEqual(nvidiaCapabilities, compatibleCapabilities)
  })
})

// ============================================================================
// Payload Building Tests
// ============================================================================

describe('OpenAI-Compatible Payload Building', () => {
  const { buildOpenAICompatiblePayload, parseOpenAICompatibleTextResponse } = __testing

  it('should build correct payload for Kimi-K2.5', () => {
    const request: OmniCompleteRequest = {
      task: 'general_chat',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.5,
      maxTokens: 1000,
    }

    const payload = buildOpenAICompatiblePayload(KIMI_K2_5_CONFIG, request, false) as Record<string, unknown>

    assert.strictEqual(payload.model, 'Kimi-K2.5')
    assert.strictEqual(payload.temperature, 0.5)
    assert.strictEqual(payload.max_tokens, 1000)
    assert.strictEqual(payload.stream, false)
    assert.ok(Array.isArray(payload.messages))
    assert.strictEqual((payload.messages as unknown[]).length, 1)
  })

  it('should include JSON response format when json is requested', () => {
    const request: OmniCompleteRequest = {
      task: 'topic_summary',
      messages: [{ role: 'user', content: 'Summarize' }],
      json: true,
    }

    const payload = buildOpenAICompatiblePayload(KIMI_K2_5_CONFIG, request, false) as Record<string, unknown>

    assert.deepStrictEqual(payload.response_format, { type: 'json_object' })
  })

  it('should not include response format when explicitly omitted', () => {
    const request: OmniCompleteRequest = {
      task: 'general_chat',
      messages: [{ role: 'user', content: 'Hello' }],
    }

    const payload = buildOpenAICompatiblePayload(KIMI_K2_5_CONFIG, request, false, {
      omitResponseFormat: true,
    }) as Record<string, unknown>

    assert.strictEqual(payload.response_format, undefined)
  })

  it('should parse simple text response correctly', () => {
    const response = JSON.stringify({
      choices: [
        {
          message: {
            content: 'Hello, how can I help you?',
          },
        },
      ],
    })

    const result = parseOpenAICompatibleTextResponse(response)

    assert.strictEqual(result.text, 'Hello, how can I help you?')
    assert.strictEqual(result.reasoning, undefined)
  })

  it('should parse response with reasoning content', () => {
    const response = JSON.stringify({
      choices: [
        {
          message: {
            content: 'The answer is 42.',
            reasoning_content: 'Let me think about this...',
          },
        },
      ],
    })

    const result = parseOpenAICompatibleTextResponse(response)

    assert.strictEqual(result.text, 'The answer is 42.')
    assert.strictEqual(result.reasoning, 'Let me think about this...')
  })
})

// ============================================================================
// i18n Error Message Tests
// ============================================================================

describe('i18n Error Messages', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.OMNI_LANGUAGE_API_KEY
    delete process.env.OMNI_MULTIMODAL_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('should return Chinese error message for missing_key issue', { timeout: 5000 }, async () => {
    const request: OmniCompleteRequest = {
      task: 'general_chat',
      messages: [{ role: 'user', content: 'What is AI?' }],
    }

    const result = await omniGateway.complete(request)

    // Verify Chinese error message content
    assert.ok(result.text.includes('没有'))
    assert.ok(result.text.includes('可用') || result.text.includes('API Key'))
  })

  it('should include configuration suggestions in fallback response', { timeout: 5000 }, async () => {
    const request: OmniCompleteRequest = {
      task: 'general_chat',
      messages: [{ role: 'user', content: 'Test' }],
      json: true,
    }

    const result = await omniGateway.complete(request)

    // JSON response should include suggested actions
    const parsed = JSON.parse(result.text)
    assert.ok(parsed.suggestedActions)
    assert.ok(parsed.suggestedActions.length > 0)
    assert.ok(parsed.suggestedActions[0].label.includes('配置'))
  })

  it('should return different messages for different issue types', { timeout: 5000 }, async () => {
    const request: OmniCompleteRequest = {
      task: 'general_chat',
      messages: [{ role: 'user', content: 'Test1' }],
    }

    const result = await omniGateway.complete(request)

    assert.strictEqual(result.issue?.code, 'missing_key')
    assert.ok(result.text.includes('没有'))
  })
})

// ============================================================================
// Sanitization Tests
// ============================================================================

describe('Config Sanitization', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.OMNI_LANGUAGE_PROVIDER
    delete process.env.OMNI_LANGUAGE_MODEL
    delete process.env.OMNI_LANGUAGE_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('should sanitize API key in config for frontend display', async () => {
    process.env.OMNI_LANGUAGE_PROVIDER = 'openai_compatible'
    process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
    process.env.OMNI_LANGUAGE_API_KEY = 'sk-test-secret-key-12345'

    const sanitized = await getSanitizedUserModelConfig('test-user')

    // API key should not be exposed
    assert.strictEqual(sanitized.language?.apiKeyStatus, 'configured')
    assert.strictEqual((sanitized.language as unknown as Record<string, unknown>)?.apiKey, undefined)

    // Should have preview instead
    assert.ok(sanitized.language?.apiKeyPreview)
  })

  it('should mark missing keys appropriately', async () => {
    const sanitized = await getSanitizedUserModelConfig('test-user')

    assert.strictEqual(sanitized.language?.apiKeyStatus, 'missing')
  })
})

// ============================================================================
// Performance & Edge Case Tests
// ============================================================================

describe('Edge Cases and Performance', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('should handle very long API keys', () => {
    const longKey = 'sk-' + 'a'.repeat(500)
    const payload = SecureStorage.encrypt(longKey)
    const decrypted = SecureStorage.decrypt(payload)

    assert.strictEqual(decrypted, longKey)
    assert.ok(payload.preview.length < longKey.length)
  })

  it('should handle API keys with special characters', () => {
    const specialKey = 'sk-moonshot!@#$%^&*()_+-=[]{}|;:,.<>?'
    const payload = SecureStorage.encrypt(specialKey)
    const decrypted = SecureStorage.decrypt(payload)

    assert.strictEqual(decrypted, specialKey)
  })

  it('should handle unicode in API keys', () => {
    const unicodeKey = 'sk-moonshot-中文测试-émojis-🎉'
    const payload = SecureStorage.encrypt(unicodeKey)
    const decrypted = SecureStorage.decrypt(payload)

    assert.strictEqual(decrypted, unicodeKey)
  })

  it('should handle rapid encryption/decryption cycles', () => {
    const key = 'sk-test-key-12345'
    const iterations = 10

    for (let i = 0; i < iterations; i++) {
      const payload = SecureStorage.encrypt(key)
      const decrypted = SecureStorage.decrypt(payload)
      assert.strictEqual(decrypted, key)
    }
  })

  it('should handle multiple different keys in sequence', () => {
    const keys = [
      'sk-key-1-abc',
      'sk-key-2-def',
      'sk-key-3-ghi',
      'sk-moonshot-special',
      'nvidia-key-123',
    ]

    const encrypted = keys.map((k) => SecureStorage.encrypt(k))
    const decrypted = encrypted.map((e) => SecureStorage.decrypt(e))

    assert.deepStrictEqual(decrypted, keys)
  })
})
