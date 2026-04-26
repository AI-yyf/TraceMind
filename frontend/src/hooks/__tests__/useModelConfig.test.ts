import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useModelConfig } from '../useModelConfig'
import { ApiError } from '@/utils/api'
import type { ProviderId } from '@/types/alpha'

// ========== Mock API Utils ==========

vi.mock('@/utils/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number
    errorCode?: string
    details?: unknown
    constructor(message: string, statusCode: number, errorCode?: string, details?: unknown) {
      super(message)
      this.name = 'ApiError'
      this.statusCode = statusCode
      this.errorCode = errorCode
      this.details = details
    }
  },
}))

const mockApiGet = vi.mocked(await import('@/utils/api')).apiGet
const mockApiPost = vi.mocked(await import('@/utils/api')).apiPost

// ========== Test Data ==========

const mockSanitizedConfig = {
  language: {
    provider: 'openai_compatible',
    model: 'Kimi-K2.5',
    baseUrl: 'https://ai.1seey.com/v1',
    apiKeyStatus: 'configured',
    apiKeyPreview: 'sk-***',
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
    apiKeyStatus: 'configured',
    apiKeyPreview: 'sk-***',
    options: {
      thinking: 'auto',
      citations: 'backend',
      parser: 'backend',
    },
  },
}

const mockCatalog = [
  {
    provider: 'openai_compatible',
    label: 'OpenAI-Compatible',
    baseUrl: '',
    adapter: 'openai-compatible',
    providerAuthEnvVars: ['OPENAI_API_KEY'],
    models: [
      {
        id: 'Kimi-K2.5',
        label: 'Kimi K2.5',
        slot: 'both',
        capabilities: {
          text: true,
          image: true,
          pdf: true,
          chart: true,
          formula: true,
          citationsNative: false,
          fileParserNative: true,
          toolCalling: true,
          jsonMode: true,
          streaming: true,
        },
      },
    ],
  },
]

const mockSaveResponse = {
  userId: 'default',
  config: mockSanitizedConfig,
  slots: {
    language: {
      configured: true,
      provider: 'openai_compatible',
      model: 'Kimi-K2.5',
      apiKeyStatus: 'configured' as const,
    },
    multimodal: {
      configured: true,
      provider: 'openai_compatible',
      model: 'Kimi-K2.5',
      apiKeyStatus: 'configured' as const,
    },
  },
}

const mockPresets = [
  {
    id: 'compatible-kimi-dual',
    label: 'Compatible Kimi Dual',
    description: 'Kimi on both slots',
    language: { provider: 'openai_compatible', model: 'Kimi-K2.5' },
    multimodal: { provider: 'openai_compatible', model: 'Kimi-K2.5' },
  },
]

// ========== fetchConfig Tests ==========

describe('useModelConfig - fetchConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('成功获取配置时更新状态', async () => {
    mockApiGet.mockResolvedValueOnce(mockSanitizedConfig)

    const { result } = renderHook(() => useModelConfig())

    expect(result.current.status).toBe('idle')
    expect(result.current.config).toBeNull()

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(mockApiGet).toHaveBeenCalledWith('/api/omni/config')
    expect(result.current.status).toBe('success')
    expect(result.current.config).toEqual(mockSanitizedConfig)
    expect(result.current.error).toBeNull()
    expect(result.current.isStale).toBe(false)
  })

  it('获取配置失败时设置错误状态', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError('获取模型配置失败', 500))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('获取模型配置失败')
    expect(result.current.config).toBeNull()
  })

  it('处理 4xx 客户端错误', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError('请求参数无效', 400, 'INVALID_PARAMS'))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('请求参数无效')
  })

  it('处理网络错误', async () => {
    const networkError = new ApiError('fetch failed', 0)
    mockApiGet.mockRejectedValueOnce(networkError)

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('网络连接错误')
  })

  it('空配置时使用默认值', async () => {
    mockApiGet.mockResolvedValueOnce({
      language: null,
      multimodal: null,
    })

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.config).toEqual({
      language: null,
      multimodal: null,
    })
    expect(result.current.status).toBe('success')
  })

  it('避免重复请求', async () => {
    mockApiGet.mockResolvedValueOnce(mockSanitizedConfig)

    const { result } = renderHook(() => useModelConfig())

    // 同时发起多个请求
    await act(async () => {
      await Promise.all([
        result.current.fetchConfig(),
        result.current.fetchConfig(),
        result.current.fetchConfig(),
      ])
    })

    // 只应该调用一次
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })
})

// ========== saveConfig Tests ==========

describe('useModelConfig - saveConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('成功保存配置时更新状态', async () => {
    mockApiPost.mockResolvedValueOnce(mockSaveResponse)

    const { result } = renderHook(() => useModelConfig())

    const newConfig = {
      language: {
        provider: 'bigmodel' as const,
        model: 'glm-5',
      },
      multimodal: {
        provider: 'bigmodel' as const,
        model: 'glm-4.6v',
      },
    }

    await act(async () => {
      const success = await result.current.saveConfig(newConfig)
      expect(success).toBe(true)
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/omni/config', newConfig)
    expect(result.current.status).toBe('success')
    expect(result.current.config).toEqual(mockSanitizedConfig)
  })

  it('保存配置失败时返回 false', async () => {
    mockApiPost.mockRejectedValueOnce(new ApiError('保存模型配置失败', 500))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      const success = await result.current.saveConfig({ language: null })
      expect(success).toBe(false)
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('保存模型配置失败')
  })

  it('处理验证错误 (400)', async () => {
    mockApiPost.mockRejectedValueOnce(
      new ApiError('无效的 provider 类型', 400, 'VALIDATION_ERROR'),
    )

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      const success = await result.current.saveConfig({
        language: { provider: 'invalid' as unknown as ProviderId, model: 'test' },
      })
      expect(success).toBe(false)
    })

    expect(result.current.error).toContain('无效的 provider 类型')
  })

  it('避免重复保存请求', async () => {
    mockApiPost.mockResolvedValueOnce(mockSaveResponse)

    const { result } = renderHook(() => useModelConfig())

    const config = { language: null }

    await act(async () => {
      // 同时发起多个保存请求
      const results = await Promise.all([
        result.current.saveConfig(config),
        result.current.saveConfig(config),
      ])
      // 只有第一个应该成功
      expect(results).toContain(false)
    })

    expect(mockApiPost).toHaveBeenCalledTimes(1)
  })
})

// ========== Cache Behavior Tests ==========

describe('useModelConfig - 缓存行为', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('缓存有效时使用缓存数据', async () => {
    mockApiGet.mockResolvedValueOnce(mockSanitizedConfig)

    const { result } = renderHook(() => useModelConfig())

    // 第一次请求
    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(result.current.config).toEqual(mockSanitizedConfig)

    // 在缓存有效期内再次请求（不强制刷新）
    await act(async () => {
      await result.current.fetchConfig(false) // 不强制刷新
    })

    // 应该使用缓存，不再调用 API
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })

  it('强制刷新时忽略缓存', async () => {
    mockApiGet.mockResolvedValue(mockSanitizedConfig)

    const { result } = renderHook(() => useModelConfig())

    // 第一次请求
    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)

    // 强制刷新
    await act(async () => {
      await result.current.fetchConfig(true) // 强制刷新
    })

    // 应该再次调用 API
    expect(mockApiGet).toHaveBeenCalledTimes(2)
  })

  it('invalidateCache 清除所有缓存', async () => {
    mockApiGet.mockResolvedValue(mockSanitizedConfig)

    const { result } = renderHook(() => useModelConfig())

    // 获取配置并缓存
    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.isStale).toBe(false)

    // 清除缓存
    act(() => {
      result.current.invalidateCache()
    })

    expect(result.current.isStale).toBe(true)

    // 再次请求应该调用 API
    await act(async () => {
      await result.current.fetchConfig(false)
    })

    expect(mockApiGet).toHaveBeenCalledTimes(2)
  })

  it('缓存过期后自动重新获取', async () => {
    mockApiGet.mockResolvedValue(mockSanitizedConfig)

    const { result } = renderHook(() => useModelConfig())

    // 第一次请求
    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)

    // 等待缓存过期（超过 staleTime 30秒）
    await act(async () => {
      vi.advanceTimersByTime(35000)
      await result.current.fetchConfig(false)
    })

    // 缓存过期后应该重新获取
    expect(mockApiGet).toHaveBeenCalledTimes(2)
  })
})

// ========== Error Handling Tests ==========

describe('useModelConfig - 错误处理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clearError 清除错误状态', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError('测试错误', 500))

    const { result } = renderHook(() => useModelConfig())

    // 触发错误
    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBeTruthy()

    // 清除错误
    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('服务器错误 (5xx) 包含服务器错误标识', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError('Internal Server Error', 500))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.error).toContain('服务器错误')
  })

  it('客户端错误 (4xx) 直接显示错误消息', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError('无效的配置参数', 400))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.error).toContain('无效的配置参数')
  })

  it('非 ApiError 异常使用通用错误消息', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Unknown error'))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.error).toContain('Unknown error')
  })
})

// ========== fetchCatalog Tests ==========

describe('useModelConfig - fetchCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('成功获取目录', async () => {
    mockApiGet.mockResolvedValueOnce(mockCatalog)

    const { result } = renderHook(() => useModelConfig())

    expect(result.current.catalog).toEqual([])

    await act(async () => {
      await result.current.fetchCatalog()
    })

    expect(mockApiGet).toHaveBeenCalledWith('/api/omni/catalog')
    expect(result.current.catalog).toEqual(mockCatalog)
    expect(result.current.error).toBeNull()
  })

  it('获取目录失败时保留现有配置状态', async () => {
    // 先获取配置成功
    mockApiGet.mockResolvedValueOnce(mockSanitizedConfig)
    // 然后获取目录失败
    mockApiGet.mockRejectedValueOnce(new ApiError('获取模型目录失败', 500))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.status).toBe('success')

    await act(async () => {
      await result.current.fetchCatalog()
    })

    // 目录失败不应改变整体状态（因为配置已存在）
    expect(result.current.status).toBe('success')
    expect(result.current.error).toContain('获取模型目录失败')
  })

  it('空目录时使用空数组', async () => {
    mockApiGet.mockResolvedValueOnce([])

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchCatalog()
    })

    expect(result.current.catalog).toEqual([])
  })

  it('缓存有效时不重复请求目录', async () => {
    mockApiGet.mockResolvedValueOnce(mockCatalog)

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchCatalog()
      await result.current.fetchCatalog()
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(result.current.catalog).toEqual(mockCatalog)
  })
})

// ========== fetchPresets Tests ==========

describe('useModelConfig - fetchPresets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('成功获取预设', async () => {
    mockApiGet.mockResolvedValueOnce(mockPresets)

    const { result } = renderHook(() => useModelConfig())

    expect(result.current.presets).toEqual([])

    await act(async () => {
      await result.current.fetchPresets()
    })

    expect(mockApiGet).toHaveBeenCalledWith('/api/omni/presets')
    expect(result.current.presets).toEqual(mockPresets)
    expect(result.current.error).toBeNull()
  })

  it('获取预设失败时设置错误', async () => {
    mockApiGet.mockRejectedValueOnce(new ApiError('获取预设配置失败', 500))

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchPresets()
    })

    expect(result.current.error).toContain('获取预设配置失败')
  })

  it('空预设时使用空数组', async () => {
    mockApiGet.mockResolvedValueOnce([])

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchPresets()
    })

    expect(result.current.presets).toEqual([])
  })

  it('缓存有效时不重复请求预设', async () => {
    mockApiGet.mockResolvedValueOnce(mockPresets)

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchPresets()
      await result.current.fetchPresets()
    })

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(result.current.presets).toEqual(mockPresets)
  })
})

// ========== Concurrent Request Tests ==========

describe('useModelConfig - 并发请求', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('同时获取配置、目录和预设', async () => {
    mockApiGet.mockImplementation(async (path: string) => {
      if (path === '/api/omni/config') return mockSanitizedConfig
      if (path === '/api/omni/catalog') return mockCatalog
      if (path === '/api/omni/presets') return mockPresets
      return {}
    })

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await Promise.all([
        result.current.fetchConfig(),
        result.current.fetchCatalog(),
        result.current.fetchPresets(),
      ])
    })

    expect(result.current.config).toEqual(mockSanitizedConfig)
    expect(result.current.catalog).toEqual(mockCatalog)
    expect(result.current.presets).toEqual(mockPresets)
    expect(result.current.status).toBe('success')
  })
})

// ========== State Transition Tests ==========

describe('useModelConfig - 状态转换', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('状态正确转换: idle -> loading -> success', async () => {
    let resolveApi: (value: unknown) => void
    mockApiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApi = resolve
        }),
    )

    const { result } = renderHook(() => useModelConfig())

    expect(result.current.status).toBe('idle')

    // 开始请求
    act(() => {
      result.current.fetchConfig()
    })

    // 状态应该是 loading（因为 Promise 还没 resolve）
    // 注意：renderHook 可能不会立即反映 loading 状态

    // 完成请求
    await act(async () => {
      resolveApi!(mockSanitizedConfig)
    })

    expect(result.current.status).toBe('success')
  })

  it('状态正确转换: idle -> loading -> error', async () => {
    let rejectApi: (reason?: unknown) => void
    mockApiGet.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectApi = reject
        }),
    )

    const { result } = renderHook(() => useModelConfig())

    expect(result.current.status).toBe('idle')

    act(() => {
      result.current.fetchConfig()
    })

    await act(async () => {
      rejectApi!(new ApiError('错误', 500))
    })

    expect(result.current.status).toBe('error')
  })

  it('保存后状态从任意状态转为 success', async () => {
    // 先触发错误
    mockApiGet.mockRejectedValueOnce(new ApiError('初始错误', 500))
    // 然后保存成功
    mockApiPost.mockResolvedValueOnce(mockSaveResponse)

    const { result } = renderHook(() => useModelConfig())

    await act(async () => {
      await result.current.fetchConfig()
    })

    expect(result.current.status).toBe('error')

    await act(async () => {
      await result.current.saveConfig({ language: null })
    })

    expect(result.current.status).toBe('success')
  })
})
