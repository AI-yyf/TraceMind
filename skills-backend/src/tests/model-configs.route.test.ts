import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { createApp } from '../server'

async function withServer(run: (origin: string) => Promise<void>) {
  const app = createApp()
  const server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not resolve test server address.')
  }

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('POST /api/model-configs rejects malformed payloads without overwriting the stored config', async () => {
  const userId = 'test-model-configs-route'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })

  try {
    await withServer(async (origin) => {
      const validPayload = {
        language: {
          provider: 'openai_compatible',
          model: 'test-language-model',
          baseUrl: 'https://example.com/v1',
          options: {
            thinking: 'auto',
            citations: 'backend',
            parser: 'backend',
            temperature: 0.2,
          },
        },
        multimodal: {
          provider: 'openai_compatible',
          model: 'test-vision-model',
          baseUrl: 'https://example.com/v1',
          options: {
            thinking: 'auto',
            citations: 'backend',
            parser: 'backend',
            temperature: 0.1,
          },
        },
        roles: {
          node_writer: {
            provider: 'openai_compatible',
            model: 'test-node-writer-model',
            baseUrl: 'https://example.com/v1',
            options: {
              thinking: 'on',
              citations: 'backend',
              parser: 'backend',
              temperature: 0.15,
            },
          },
        },
        taskRouting: {
          topic_summary: 'research_judge',
          document_parse: 'vision_reader',
        },
      }

      const saveResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify(validPayload),
      })

      assert.equal(saveResponse.status, 200)
      const savePayload = (await saveResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: { model: string } | null
            multimodal: { model: string } | null
            roles?: {
              node_writer?: { model: string } | null
            }
            taskRouting?: {
              topic_summary?: string
            }
          }
          roles?: {
            node_writer?: {
              source: string
            }
          }
          routing?: {
            topic_summary?: {
              target: string
            }
          }
          roleDefinitions?: Array<{
            id: string
          }>
          configRecord: {
            meta: {
              key: string
              revision: number
              source: string
            }
            history: Array<{
              revision: number
              hash: string
            }>
          }
        }
      }
      assert.equal(savePayload.success, true)
      assert.equal(savePayload.data.config.roles?.node_writer?.model, 'test-node-writer-model')
      assert.equal(savePayload.data.config.taskRouting?.topic_summary, 'research_judge')
      assert.equal(savePayload.data.roles?.node_writer?.source, 'role')
      assert.equal(savePayload.data.routing?.topic_summary?.target, 'research_judge')
      assert.ok((savePayload.data.roleDefinitions?.length ?? 0) > 0)
      assert.equal(savePayload.data.configRecord.meta.key, configKey)
      assert.ok(savePayload.data.configRecord.meta.revision >= 1)
      assert.equal(savePayload.data.configRecord.meta.source, 'omni.model-config')
      assert.ok(Array.isArray(savePayload.data.configRecord.history))

      const invalidResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          modelType: 'topicChat',
          updates: { temperature: 0.33 },
        }),
      })

      assert.equal(invalidResponse.status, 400)

      const getResponse = await fetch(`${origin}/api/model-configs`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(getResponse.status, 200)

      const payload = (await getResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: { model: string } | null
            multimodal: { model: string } | null
            roles?: {
              node_writer?: { model: string } | null
            }
            taskRouting?: {
              topic_summary?: string
              document_parse?: string
            }
          }
          roles?: {
            node_writer?: {
              source: string
            }
          }
          routing?: {
            topic_summary?: {
              target: string
            }
          }
          roleDefinitions?: Array<{
            id: string
          }>
          configMeta: {
            key: string
            revision: number
            source: string
          }
          configHistory: Array<{
            revision: number
            hash: string
          }>
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.config.language?.model, 'test-language-model')
      assert.equal(payload.data.config.multimodal?.model, 'test-vision-model')
      assert.equal(payload.data.config.roles?.node_writer?.model, 'test-node-writer-model')
      assert.equal(payload.data.config.taskRouting?.topic_summary, 'research_judge')
      assert.equal(payload.data.config.taskRouting?.document_parse, 'vision_reader')
      assert.equal(payload.data.roles?.node_writer?.source, 'role')
      assert.equal(payload.data.routing?.topic_summary?.target, 'research_judge')
      assert.ok((payload.data.roleDefinitions?.length ?? 0) > 0)
      assert.equal(payload.data.configMeta.key, configKey)
      assert.ok(payload.data.configMeta.revision >= 1)
      assert.equal(payload.data.configMeta.source, 'omni.model-config')
      assert.ok(Array.isArray(payload.data.configHistory))
    })
  } finally {
    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('GET /api/model-configs treats provider environment variables as usable API keys', async () => {
  const userId = 'test-model-configs-env-fallback'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })
  const envKeys = ['MOONSHOT_API_KEY', 'OMNI_DEFAULT_API_KEY', 'OMNI_LANGUAGE_API_KEY'] as const
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

  process.env.MOONSHOT_API_KEY = 'env-fallback-key'
  delete process.env.OMNI_DEFAULT_API_KEY
  delete process.env.OMNI_LANGUAGE_API_KEY

  try {
    await withServer(async (origin) => {
      const saveResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          language: {
            provider: 'openai_compatible',
            model: 'moonshotai/kimi-k2.5',
            baseUrl: 'https://ai.1seey.com/v1',
            options: {
              thinking: 'auto',
              citations: 'backend',
              parser: 'backend',
            },
          },
        }),
      })

      assert.equal(saveResponse.status, 200)

      const getResponse = await fetch(`${origin}/api/model-configs`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(getResponse.status, 200)

      const payload = (await getResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: {
              provider: string
              model: string
              apiKeyStatus: 'configured' | 'missing'
              apiKeyPreview?: string
            } | null
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.config.language?.provider, 'openai_compatible')
      assert.equal(payload.data.config.language?.model, 'moonshotai/kimi-k2.5')
      assert.equal(payload.data.config.language?.apiKeyStatus, 'configured')
      assert.equal(payload.data.config.language?.apiKeyPreview, 'MOONSHOT_API_KEY (env)')
    })
  } finally {
    for (const key of envKeys) {
      const original = originalEnv[key]
      if (typeof original === 'string') {
        process.env[key] = original
      } else {
        delete process.env[key]
      }
    }

    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('GET /api/model-configs bootstraps a language slot entirely from OMNI_LANGUAGE_* env vars', async () => {
  const userId = 'test-model-configs-slot-env-bootstrap'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })
  const envKeys = [
    'OMNI_LANGUAGE_PROVIDER',
    'OMNI_LANGUAGE_MODEL',
    'OMNI_LANGUAGE_BASE_URL',
    'OMNI_LANGUAGE_API_KEY',
    'OMNI_LANGUAGE_HEADERS_JSON',
    'OMNI_LANGUAGE_THINKING',
    'OMNI_LANGUAGE_MAX_TOKENS',
  ] as const
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

  process.env.OMNI_LANGUAGE_PROVIDER = 'openai_compatible'
  process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
  process.env.OMNI_LANGUAGE_BASE_URL = 'https://ai.1seey.com/v1'
  process.env.OMNI_LANGUAGE_API_KEY = 'slot-env-key'
  process.env.OMNI_LANGUAGE_HEADERS_JSON = JSON.stringify({ 'X-Test-Route': 'suzhi' })
  process.env.OMNI_LANGUAGE_THINKING = 'off'
  process.env.OMNI_LANGUAGE_MAX_TOKENS = '256'

  await prisma.systemConfig.deleteMany({
    where: { key: configKey },
  })

  try {
    await withServer(async (origin) => {
      const getResponse = await fetch(`${origin}/api/model-configs`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(getResponse.status, 200)

      const payload = (await getResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: {
              provider: string
              model: string
              baseUrl?: string
              apiKeyStatus: 'configured' | 'missing'
              apiKeyPreview?: string
              providerOptions?: {
                headers?: Record<string, string>
              }
              options?: {
                thinking?: string
                maxTokens?: number
              }
            } | null
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.config.language?.provider, 'openai_compatible')
      assert.equal(payload.data.config.language?.model, 'Kimi-K2.5')
      assert.equal(payload.data.config.language?.baseUrl, 'https://ai.1seey.com/v1')
      assert.equal(payload.data.config.language?.apiKeyStatus, 'configured')
      assert.equal(payload.data.config.language?.apiKeyPreview, 'OMNI_LANGUAGE_API_KEY (env)')
      assert.deepEqual(payload.data.config.language?.providerOptions?.headers, {
        'X-Test-Route': 'suzhi',
      })
      assert.equal(payload.data.config.language?.options?.thinking, 'off')
      assert.equal(payload.data.config.language?.options?.maxTokens, 256)

      const capabilitiesResponse = await fetch(`${origin}/api/model-capabilities`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(capabilitiesResponse.status, 200)

      const capabilitiesPayload = (await capabilitiesResponse.json()) as {
        success: boolean
        data: {
          userId: string
          slots: {
            language: {
              configured: boolean
              provider: string | null
              model: string | null
              apiKeyStatus: 'configured' | 'missing'
            }
          }
        }
      }

      assert.equal(capabilitiesPayload.success, true)
      assert.equal(capabilitiesPayload.data.userId, userId)
      assert.equal(capabilitiesPayload.data.slots.language.configured, true)
      assert.equal(capabilitiesPayload.data.slots.language.provider, 'openai_compatible')
      assert.equal(capabilitiesPayload.data.slots.language.model, 'Kimi-K2.5')
      assert.equal(capabilitiesPayload.data.slots.language.apiKeyStatus, 'configured')
    })
  } finally {
    for (const key of envKeys) {
      const original = originalEnv[key]
      if (typeof original === 'string') {
        process.env[key] = original
      } else {
        delete process.env[key]
      }
    }

    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('GET /api/model-configs bootstraps both default slots from OMNI_DEFAULT_* plus slot model ids', async () => {
  const userId = 'test-model-configs-default-env-bootstrap'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })
  const envKeys = [
    'OMNI_DEFAULT_PROVIDER',
    'OMNI_DEFAULT_BASE_URL',
    'OMNI_DEFAULT_API_KEY',
    'OMNI_DEFAULT_APP_ID',
    'OMNI_LANGUAGE_MODEL',
    'OMNI_MULTIMODAL_MODEL',
  ] as const
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

  process.env.OMNI_DEFAULT_PROVIDER = 'openai_compatible'
  process.env.OMNI_DEFAULT_BASE_URL = 'https://ai.1seey.com/v1'
  process.env.OMNI_DEFAULT_API_KEY = 'default-env-key'
  process.env.OMNI_DEFAULT_APP_ID = 'suzhi'
  process.env.OMNI_LANGUAGE_MODEL = 'Kimi-K2.5'
  process.env.OMNI_MULTIMODAL_MODEL = 'Kimi-K2.5'

  await prisma.systemConfig.deleteMany({
    where: { key: configKey },
  })

  try {
    await withServer(async (origin) => {
      const getResponse = await fetch(`${origin}/api/model-configs`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(getResponse.status, 200)

      const payload = (await getResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: {
              provider: string
              model: string
              baseUrl?: string
              apiKeyStatus: 'configured' | 'missing'
              apiKeyPreview?: string
              providerOptions?: {
                appId?: string
              }
            } | null
            multimodal: {
              provider: string
              model: string
              baseUrl?: string
              apiKeyStatus: 'configured' | 'missing'
              apiKeyPreview?: string
              providerOptions?: {
                appId?: string
              }
            } | null
          }
          roles?: {
            node_writer?: {
              source: string
              model: string | null
            }
            vision_reader?: {
              source: string
              model: string | null
            }
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.config.language?.provider, 'openai_compatible')
      assert.equal(payload.data.config.language?.model, 'Kimi-K2.5')
      assert.equal(payload.data.config.language?.baseUrl, 'https://ai.1seey.com/v1')
      assert.equal(payload.data.config.language?.apiKeyStatus, 'configured')
      assert.equal(payload.data.config.language?.apiKeyPreview, 'OMNI_DEFAULT_API_KEY (env)')
      assert.equal(payload.data.config.language?.providerOptions?.appId, 'suzhi')

      assert.equal(payload.data.config.multimodal?.provider, 'openai_compatible')
      assert.equal(payload.data.config.multimodal?.model, 'Kimi-K2.5')
      assert.equal(payload.data.config.multimodal?.baseUrl, 'https://ai.1seey.com/v1')
      assert.equal(payload.data.config.multimodal?.apiKeyStatus, 'configured')
      assert.equal(payload.data.config.multimodal?.apiKeyPreview, 'OMNI_DEFAULT_API_KEY (env)')
      assert.equal(payload.data.config.multimodal?.providerOptions?.appId, 'suzhi')

      assert.equal(payload.data.roles?.node_writer?.source, 'default-language')
      assert.equal(payload.data.roles?.node_writer?.model, 'Kimi-K2.5')
      assert.equal(payload.data.roles?.vision_reader?.source, 'default-multimodal')
      assert.equal(payload.data.roles?.vision_reader?.model, 'Kimi-K2.5')
    })
  } finally {
    for (const key of envKeys) {
      const original = originalEnv[key]
      if (typeof original === 'string') {
        process.env[key] = original
      } else {
        delete process.env[key]
      }
    }

    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('POST /api/model-configs preserves existing slots and roles during partial updates while respecting explicit clears', async () => {
  const userId = 'test-model-configs-partial-updates'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })
  const envKeys = [
    'OMNI_DEFAULT_PROVIDER',
    'OMNI_DEFAULT_BASE_URL',
    'OMNI_DEFAULT_API_KEY',
    'OMNI_DEFAULT_APP_ID',
    'OMNI_LANGUAGE_PROVIDER',
    'OMNI_LANGUAGE_MODEL',
    'OMNI_LANGUAGE_BASE_URL',
    'OMNI_LANGUAGE_API_KEY',
    'OMNI_MULTIMODAL_PROVIDER',
    'OMNI_MULTIMODAL_MODEL',
    'OMNI_MULTIMODAL_BASE_URL',
    'OMNI_MULTIMODAL_API_KEY',
  ] as const
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

  for (const key of envKeys) {
    delete process.env[key]
  }

  try {
    await withServer(async (origin) => {
      const baseHeaders = {
        'Content-Type': 'application/json',
        'x-alpha-user-id': userId,
      }

      const initialResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          language: {
            provider: 'openai_compatible',
            model: 'kimi-language',
            baseUrl: 'https://ai.1seey.com/v1',
            options: {
              thinking: 'auto',
              citations: 'backend',
              parser: 'backend',
            },
          },
          multimodal: {
            provider: 'openai_compatible',
            model: 'kimi-vision',
            baseUrl: 'https://ai.1seey.com/v1',
            options: {
              thinking: 'auto',
              citations: 'backend',
              parser: 'backend',
            },
          },
          roles: {
            node_writer: {
              provider: 'openai_compatible',
              model: 'node-writer-v1',
              baseUrl: 'https://ai.1seey.com/v1',
              options: {
                thinking: 'on',
                citations: 'backend',
                parser: 'backend',
              },
            },
          },
        }),
      })

      assert.equal(initialResponse.status, 200)

      const patchRolesResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          roles: {
            critic: {
              provider: 'openai_compatible',
              model: 'critic-v2',
              baseUrl: 'https://ai.1seey.com/v1',
              options: {
                thinking: 'on',
                citations: 'backend',
                parser: 'backend',
              },
            },
          },
        }),
      })

      assert.equal(patchRolesResponse.status, 200)

      const afterRolePatchResponse = await fetch(`${origin}/api/model-configs`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(afterRolePatchResponse.status, 200)

      const afterRolePatch = (await afterRolePatchResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: { model: string } | null
            multimodal: { model: string } | null
            roles?: {
              node_writer?: { model: string } | null
              critic?: { model: string } | null
            }
          }
          roles?: {
            node_writer?: { source: string }
            critic?: { source: string }
          }
        }
      }

      assert.equal(afterRolePatch.success, true)
      assert.equal(afterRolePatch.data.config.language?.model, 'kimi-language')
      assert.equal(afterRolePatch.data.config.multimodal?.model, 'kimi-vision')
      assert.equal(afterRolePatch.data.config.roles?.node_writer?.model, 'node-writer-v1')
      assert.equal(afterRolePatch.data.config.roles?.critic?.model, 'critic-v2')
      assert.equal(afterRolePatch.data.roles?.node_writer?.source, 'role')
      assert.equal(afterRolePatch.data.roles?.critic?.source, 'role')

      const clearResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          multimodal: null,
          roles: {
            node_writer: null,
          },
        }),
      })

      assert.equal(clearResponse.status, 200)

      const finalResponse = await fetch(`${origin}/api/model-configs`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(finalResponse.status, 200)

      const finalPayload = (await finalResponse.json()) as {
        success: boolean
        data: {
          config: {
            language: { model: string } | null
            multimodal: { model: string } | null
            roles?: {
              node_writer?: { model: string } | null
              critic?: { model: string } | null
            }
          }
          roles?: {
            critic?: { source: string }
            vision_reader?: { source: string }
          }
        }
      }

      assert.equal(finalPayload.success, true)
      assert.equal(finalPayload.data.config.language?.model, 'kimi-language')
      assert.equal(finalPayload.data.config.multimodal, null)
      assert.equal(finalPayload.data.config.roles?.node_writer, undefined)
      assert.equal(finalPayload.data.config.roles?.critic?.model, 'critic-v2')
      assert.equal(finalPayload.data.roles?.critic?.source, 'role')
      assert.equal(finalPayload.data.roles?.vision_reader?.source, 'missing')
    })
  } finally {
    for (const key of envKeys) {
      const original = originalEnv[key]
      if (typeof original === 'string') {
        process.env[key] = original
      } else {
        delete process.env[key]
      }
    }

    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('GET /api/model-capabilities respects x-alpha-user-id scoped config', async () => {
  const userId = 'test-model-capabilities-user-scope'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })
  const originalMoonshotKey = process.env.MOONSHOT_API_KEY

  process.env.MOONSHOT_API_KEY = 'env-fallback-key'

  try {
    await withServer(async (origin) => {
      const saveResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          language: {
            provider: 'openai_compatible',
            model: 'moonshotai/kimi-k2.5',
            baseUrl: 'https://ai.1seey.com/v1',
            options: {
              thinking: 'auto',
              citations: 'backend',
              parser: 'backend',
            },
          },
        }),
      })

      assert.equal(saveResponse.status, 200)

      const capabilitiesResponse = await fetch(`${origin}/api/model-capabilities`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(capabilitiesResponse.status, 200)

      const payload = (await capabilitiesResponse.json()) as {
        success: boolean
        data: {
          userId: string
          slots: {
            language: {
              configured: boolean
              model: string | null
            }
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.userId, userId)
      assert.equal(payload.data.slots.language.configured, true)
      assert.equal(payload.data.slots.language.model, 'moonshotai/kimi-k2.5')
    })
  } finally {
    if (typeof originalMoonshotKey === 'string') {
      process.env.MOONSHOT_API_KEY = originalMoonshotKey
    } else {
      delete process.env.MOONSHOT_API_KEY
    }

    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})

test('GET /api/model-capabilities exposes effective research roles even when only default slots are configured', async () => {
  const userId = 'test-model-capabilities-research-roles'
  const configKey = `alpha:user-model-config:${userId}`
  const originalRecord = await prisma.systemConfig.findUnique({
    where: { key: configKey },
  })

  try {
    await withServer(async (origin) => {
      const saveResponse = await fetch(`${origin}/api/model-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-alpha-user-id': userId },
        body: JSON.stringify({
          language: {
            provider: 'openai_compatible',
            model: 'Kimi-K2.5',
            baseUrl: 'https://ai.1seey.com/v1',
            options: {
              thinking: 'auto',
              citations: 'backend',
              parser: 'backend',
            },
          },
          multimodal: {
            provider: 'openai_compatible',
            model: 'Kimi-K2.5',
            baseUrl: 'https://ai.1seey.com/v1',
            options: {
              thinking: 'auto',
              citations: 'backend',
              parser: 'backend',
            },
          },
        }),
      })

      assert.equal(saveResponse.status, 200)

      const capabilitiesResponse = await fetch(`${origin}/api/model-capabilities`, {
        headers: { 'x-alpha-user-id': userId },
      })
      assert.equal(capabilitiesResponse.status, 200)

      const payload = (await capabilitiesResponse.json()) as {
        success: boolean
        data: {
          roles: {
            node_writer: {
              configured: boolean
              source: string
              model: string | null
            }
            vision_reader: {
              configured: boolean
              source: string
              model: string | null
            }
          }
          routing: {
            topic_summary: {
              target: string
              defaultTarget: string
            }
          }
        }
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data.roles.node_writer.configured, true)
      assert.equal(payload.data.roles.node_writer.source, 'default-language')
      assert.equal(payload.data.roles.node_writer.model, 'Kimi-K2.5')
      assert.equal(payload.data.roles.vision_reader.configured, true)
      assert.equal(payload.data.roles.vision_reader.source, 'default-multimodal')
      assert.equal(payload.data.roles.vision_reader.model, 'Kimi-K2.5')
      assert.equal(payload.data.routing.topic_summary.target, 'topic_architect')
      assert.equal(payload.data.routing.topic_summary.defaultTarget, 'topic_architect')
    })
  } finally {
    if (originalRecord) {
      await prisma.systemConfig.upsert({
        where: { key: configKey },
        update: { value: originalRecord.value },
        create: { key: configKey, value: originalRecord.value },
      })
    } else {
      await prisma.systemConfig.deleteMany({
        where: { key: configKey },
      })
    }
  }
})
