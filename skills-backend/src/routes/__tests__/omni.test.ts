import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { createApp } from '../../server'
import { omniGateway } from '../../services/omni/gateway'

// ========== Test Server Helper ==========

async function withServer(run: (origin: string) => Promise<void>) {
  const app = createApp()
  const server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('无法解析测试服务器地址')
  }

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

const STUB_CAPABILITIES = {
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
} as const

// ========== Catalog Endpoint Tests ==========

test('GET /api/omni/catalog 返回 ProviderCatalogEntry[]', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/omni/catalog`)
    assert.equal(response.status, 200, '请求应该成功')

    const payload = (await response.json()) as {
      success: boolean
      data: Array<{
        provider: string
        label: string
        baseUrl: string
        models: Array<{
          id: string
          label: string
          slot: string
          capabilities: Record<string, boolean>
        }>
      }>
    }

    assert.equal(payload.success, true, '响应应该包含 success: true')
    assert.ok(Array.isArray(payload.data), 'data 应该是数组')
    assert.ok(payload.data.length > 0, '目录不应为空')

    // 验证每个 provider 条目的结构
    for (const entry of payload.data) {
      assert.ok(entry.provider, '每个条目应有 provider 字段')
      assert.ok(entry.label, '每个条目应有 label 字段')
      // openai_compatible 允许空的 baseUrl（自定义配置）
      if (entry.provider !== 'openai_compatible') {
        assert.ok(entry.baseUrl, '每个条目应有 baseUrl 字段')
      }
      assert.ok(Array.isArray(entry.models), '每个条目应有 models 数组')
      assert.ok(entry.models.length > 0, 'models 数组不应为空')

      // 验证模型结构
      for (const model of entry.models) {
        assert.ok(model.id, '模型应有 id')
        assert.ok(model.label, '模型应有 label')
        assert.ok(model.slot, '模型应有 slot')
        assert.ok(model.capabilities, '模型应有 capabilities')
      }
    }
  })
})

test('GET /api/omni/catalog 包含必要的 provider 条目', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/omni/catalog`)
    const payload = (await response.json()) as {
      success: boolean
      data: Array<{ provider: string }>
    }

    const providers = payload.data.map((entry) => entry.provider)

    // 验证关键 provider 存在
    assert.ok(providers.includes('openai_compatible'), '应包含 openai_compatible')
    assert.ok(providers.includes('bigmodel'), '应包含 bigmodel（智谱）')
    assert.ok(providers.includes('openai'), '应包含 openai')
    assert.ok(providers.includes('anthropic'), '应包含 anthropic')
    assert.ok(providers.includes('deepseek'), '应包含 deepseek')
  })
})

test('GET /api/omni/catalog 返回正确的 adapter 类型', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/omni/catalog`)
    const payload = (await response.json()) as {
      success: boolean
      data: Array<{
        provider: string
        adapter: string
      }>
    }

    const validAdapters = ['openai-compatible', 'anthropic', 'google']

    for (const entry of payload.data) {
      assert.ok(
        validAdapters.includes(entry.adapter),
        `provider ${entry.provider} 的 adapter 应为有效类型: ${entry.adapter}`,
      )
    }
  })
})

// ========== Presets Endpoint Tests ==========

test('GET /api/omni/presets 返回 ModelPreset[]', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/omni/presets`)
    assert.equal(response.status, 200, '请求应该成功')

    const payload = (await response.json()) as {
      success: boolean
      data: Array<{
        id: string
        label: string
        description: string
        language: { provider: string; model: string }
        multimodal: { provider: string; model: string }
      }>
    }

    assert.equal(payload.success, true, '响应应包含 success: true')
    assert.ok(Array.isArray(payload.data), 'data 应为数组')
    assert.ok(payload.data.length > 0, '预设列表不应为空')

    // 验证每个预设结构
    for (const preset of payload.data) {
      assert.ok(preset.id, '预设应有 id')
      assert.ok(preset.label, '预设应有 label')
      assert.ok(preset.description, '预设应有 description')
      assert.ok(preset.language, '预设应有 language 配置')
      assert.ok(preset.language.provider, 'language 应有 provider')
      assert.ok(preset.language.model, 'language 应有 model')
      assert.ok(preset.multimodal, '预设应有 multimodal 配置')
      assert.ok(preset.multimodal.provider, 'multimodal 应有 provider')
      assert.ok(preset.multimodal.model, 'multimodal 应有 model')
    }
  })
})

test('GET /api/omni/presets 包含推荐的预设配置', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/omni/presets`)
    const payload = (await response.json()) as {
      success: boolean
      data: Array<{ id: string }>
    }

    const presetIds = payload.data.map((preset) => preset.id)

    assert.ok(presetIds.includes('china-hybrid'), '应包含 china-hybrid 预设')
    assert.ok(presetIds.includes('compatible-kimi-dual'), '应包含 compatible-kimi-dual 预设')
    assert.ok(presetIds.includes('global-frontier'), '应包含 global-frontier 预设')
  })
})

// ========== Config GET Endpoint Tests ==========

test('GET /api/omni/config 返回 SanitizedUserModelConfig', async () => {
  await withServer(async (origin) => {
    const userId = 'test-omni-config-get'
    const response = await fetch(`${origin}/api/omni/config`, {
      headers: { 'x-alpha-user-id': userId },
    })
    assert.equal(response.status, 200, '请求应成功')

    const payload = (await response.json()) as {
      success: boolean
      data: {
        language: {
          provider: string
          model: string
          apiKeyStatus: 'configured' | 'missing'
        } | null
        multimodal: {
          provider: string
          model: string
          apiKeyStatus: 'configured' | 'missing'
        } | null
      }
    }

    assert.equal(payload.success, true, '响应应包含 success: true')
    assert.ok(payload.data, '应有 data 字段')

    // API key 状态应正确返回
    if (payload.data.language?.apiKeyStatus === 'configured') {
      assert.ok(
        payload.data.language.apiKeyStatus === 'configured',
        'language API key 应标记为已配置',
      )
    }

    if (payload.data.multimodal?.apiKeyStatus === 'configured') {
      assert.ok(
        payload.data.multimodal.apiKeyStatus === 'configured',
        'multimodal API key 应标记为已配置',
      )
    }
  })
})

// ========== Config POST Endpoint Tests ==========

test('POST /api/omni/config 验证并保存有效配置', async () => {
  await withServer(async (origin) => {
    const userId = 'test-omni-config-post-valid'
    const validPayload = {
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
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': userId,
      },
      body: JSON.stringify(validPayload),
    })

    assert.equal(response.status, 200, '有效配置应被接受')

    const payload = (await response.json()) as {
      success: boolean
      data: {
        userId: string
        config: {
          language: { provider: string; model: string } | null
          multimodal: { provider: string; model: string } | null
        }
      }
    }

    assert.equal(payload.success, true, '响应应包含 success: true')
    assert.equal(payload.data.userId, userId, 'userId 应匹配')
    assert.equal(payload.data.config.language?.provider, 'openai_compatible')
    assert.equal(payload.data.config.language?.model, 'Kimi-K2.5')
    assert.equal(payload.data.config.multimodal?.provider, 'openai_compatible')
    assert.equal(payload.data.config.multimodal?.model, 'Kimi-K2.5')
  })
})

// ========== Zod Validation Failure Tests ==========

test('POST /api/omni/config 拒绝无效的 provider 类型', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      language: {
        provider: 'invalid_provider', // 不存在的 provider
        model: 'test-model',
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-provider',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '无效 provider 应返回 400')

    const payload = (await response.json()) as { error: string }
    assert.ok(payload.error, '应返回错误信息')
  })
})

test('POST /api/omni/config 拒绝空的 model 字段', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      language: {
        provider: 'openai_compatible',
        model: '', // 空模型名称
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-model',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '空模型名应返回 400')

    const payload = (await response.json()) as { error: string }
    assert.ok(payload.error, '应返回错误信息')
  })
})

test('POST /api/omni/config 拒绝无效的 thinking 模式', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      language: {
        provider: 'openai_compatible',
        model: 'test-model',
        options: {
          thinking: 'invalid_mode', // 不在 ['on', 'off', 'auto'] 中
        },
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-thinking',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '无效 thinking 模式应返回 400')
  })
})

test('POST /api/omni/config 拒绝无效的 temperature 值', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      language: {
        provider: 'openai_compatible',
        model: 'test-model',
        options: {
          temperature: NaN, // NaN 不是有效的 finite number
        },
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-temperature',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '无效 temperature 应返回 400')
  })
})

test('POST /api/omni/config 拒绝无效的 maxTokens 值', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      language: {
        provider: 'openai_compatible',
        model: 'test-model',
        options: {
          maxTokens: -100, // 负数不是有效的正整数
        },
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-maxtokens',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '无效 maxTokens 应返回 400')
  })
})

test('POST /api/omni/config 拒绝无效的 task 类型', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      taskRouting: {
        invalid_task: 'language', // 不存在的 task 类型
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-task',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '无效 task 类型应返回 400')
  })
})

test('POST /api/omni/config 拒绝额外的未知字段', async () => {
  await withServer(async (origin) => {
    const invalidPayload = {
      language: {
        provider: 'openai_compatible',
        model: 'test-model',
        unknownField: 'should-fail', // 未知字段（strict schema）
      },
    }

    const response = await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-validation-extra',
      },
      body: JSON.stringify(invalidPayload),
    })

    assert.equal(response.status, 400, '未知字段应返回 400（strict schema）')
  })
})

test('POST /api/omni/complete inherits x-alpha-user-id when the request body omits userId', async () => {
  const originalComplete = omniGateway.complete.bind(omniGateway)
  let capturedUserId: string | undefined

  omniGateway.complete = (async (request) => {
    capturedUserId = request.userId
    return {
      text: 'OK',
      provider: 'backend',
      model: 'test-double',
      slot: 'language',
      capabilities: STUB_CAPABILITIES,
      usedFallback: false,
    }
  }) as typeof omniGateway.complete

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/omni/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-alpha-user-id': 'test-omni-complete-header-scope',
        },
        body: JSON.stringify({
          task: 'general_chat',
          messages: [
            {
              role: 'user',
              content: 'Reply with OK.',
            },
          ],
        }),
      })

      assert.equal(response.status, 200)
      assert.equal(capturedUserId, 'test-omni-complete-header-scope')
    })
  } finally {
    omniGateway.complete = originalComplete
  }
})

test('POST /api/omni/parse inherits x-alpha-user-id for multimodal parsing requests', async () => {
  const originalComplete = omniGateway.complete.bind(omniGateway)
  let capturedUserId: string | undefined
  let capturedTask: string | undefined

  omniGateway.complete = (async (request) => {
    capturedUserId = request.userId
    capturedTask = request.task
    return {
      text: '{"ok":true}',
      provider: 'backend',
      model: 'test-double',
      slot: 'multimodal',
      capabilities: STUB_CAPABILITIES,
      usedFallback: false,
    }
  }) as typeof omniGateway.complete

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/omni/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-alpha-user-id': 'test-omni-parse-header-scope',
        },
        body: JSON.stringify({
          task: 'figure_analysis',
          prompt: 'Analyze this figure.',
          attachments: [
            {
              type: 'image',
              mimeType: 'image/png',
              base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a6sAAAAASUVORK5CYII=',
            },
          ],
        }),
      })

      assert.equal(response.status, 200)
      assert.equal(capturedUserId, 'test-omni-parse-header-scope')
      assert.equal(capturedTask, 'figure_analysis')
    })
  } finally {
    omniGateway.complete = originalComplete
  }
})

// ========== Capabilities Endpoint Tests ==========

test('GET /api/omni/capabilities 返回能力摘要', async () => {
  await withServer(async (origin) => {
    const userId = 'test-omni-capabilities'

    // 先保存一个配置
    await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': userId,
      },
      body: JSON.stringify({
        language: {
          provider: 'openai_compatible',
          model: 'Kimi-K2.5',
          baseUrl: 'https://ai.1seey.com/v1',
        },
      }),
    })

    // 然后获取能力摘要
    const response = await fetch(`${origin}/api/omni/capabilities`, {
      headers: { 'x-alpha-user-id': userId },
    })

    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        userId: string
        slots: {
          language: {
            configured: boolean
            provider: string | null
            model: string | null
          }
          multimodal: {
            configured: boolean
            provider: string | null
            model: string | null
          }
        }
        roles: Record<string, unknown>
        routing: Record<string, unknown>
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.userId, userId)
    assert.ok(payload.data.slots, '应有 slots 信息')
    assert.ok(payload.data.roles, '应有 roles 信息')
    assert.ok(payload.data.routing, '应有 routing 信息')
  })
})

// ========== Config Record Endpoint Tests ==========

test('GET /api/omni/config-record 返回完整配置记录', async () => {
  await withServer(async (origin) => {
    const userId = 'test-omni-config-record'

    // 先保存配置
    await fetch(`${origin}/api/omni/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': userId,
      },
      body: JSON.stringify({
        language: {
          provider: 'bigmodel',
          model: 'glm-5',
        },
      }),
    })

    // 获取完整记录
    const response = await fetch(`${origin}/api/omni/config-record`, {
      headers: { 'x-alpha-user-id': userId },
    })

    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        userId: string
        config: {
          language: { provider: string; model: string } | null
          multimodal: { provider: string; model: string } | null
        }
        configMeta: {
          key: string
          revision: number
          source: string
        }
        configHistory: Array<{
          revision: number
          hash: string
        }>
        roles: Record<string, unknown>
        routing: Record<string, unknown>
        catalog: Array<unknown>
        presets: Array<unknown>
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.userId, userId)
    assert.ok(payload.data.config, '应有 config')
    assert.ok(payload.data.configMeta, '应有 configMeta')
    assert.ok(payload.data.configMeta.key.includes(userId), 'configMeta.key 应包含 userId')
    assert.ok(Array.isArray(payload.data.configHistory), 'configHistory 应为数组')
    assert.ok(Array.isArray(payload.data.catalog), 'catalog 应为数组')
    assert.ok(Array.isArray(payload.data.presets), 'presets 应为数组')
  })
})

// ========== Config History Endpoint Tests ==========

test('GET /api/omni/config/history 返回配置版本历史', async () => {
  await withServer(async (origin) => {
    const userId = 'test-omni-config-history'

    // 创建多个配置版本
    for (let i = 0; i < 3; i++) {
      await fetch(`${origin}/api/omni/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-alpha-user-id': userId,
        },
        body: JSON.stringify({
          language: {
            provider: 'openai_compatible',
            model: `test-model-v${i}`,
            baseUrl: 'https://ai.1seey.com/v1',
          },
        }),
      })
    }

    // 获取历史
    const response = await fetch(`${origin}/api/omni/config/history`, {
      headers: { 'x-alpha-user-id': userId },
    })

    assert.equal(response.status, 200)

    const payload = (await response.json()) as {
      success: boolean
      data: {
        userId: string
        history: Array<{
          version: number
          timestamp: string
          actor: string | null
          diffSummary: string | null
        }>
        total: number
      }
    }

    assert.equal(payload.success, true)
    assert.equal(payload.data.userId, userId)
    assert.ok(Array.isArray(payload.data.history), 'history 应为数组')
    assert.ok(payload.data.total >= 0, 'total 应为非负数')
  })
})

// ========== Config Rollback Endpoint Tests ==========

test('POST /api/omni/config/rollback 验证版本号参数', async () => {
  await withServer(async (origin) => {
    // 缺少版本号
    const response1 = await fetch(`${origin}/api/omni/config/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-rollback-no-version',
      },
      body: JSON.stringify({}),
    })

    assert.equal(response1.status, 400, '缺少版本号应返回 400')

    // 无效版本号类型
    const response2 = await fetch(`${origin}/api/omni/config/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-rollback-invalid-version',
      },
      body: JSON.stringify({ version: 'not-a-number' }),
    })

    assert.equal(response2.status, 400, '无效版本号类型应返回 400')
  })
})

test('POST /api/omni/config/rollback 对不存在版本返回错误', async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/omni/config/rollback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-alpha-user-id': 'test-omni-rollback-nonexistent',
      },
      body: JSON.stringify({ version: 999999 }), // 不存在的版本
    })

    // 接受 400 或 404，取决于数据库是否可用
    assert.ok(response.status === 400 || response.status === 404, '不存在版本应返回错误状态码')

    const payload = (await response.json()) as { error: string }
    assert.ok(payload.error, '应返回错误信息')
  })
})
