import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelCapabilitySummary, ModelConfigResponse } from '@/types/alpha'
import { makeTopicResearchBrief } from '@/test/topicResearchBrief'

import {
  fetchModelCapabilitySummary,
  fetchModelConfigResponse,
  fetchTopicResearchBrief,
  invalidateModelCapabilitySummary,
  invalidateModelConfigResponse,
  invalidateTopicResearchBrief,
} from './omniRuntimeCache'

vi.mock('./api', () => ({
  apiGet: vi.fn(),
}))

const mockApiGet = vi.mocked((await import('./api')).apiGet)

const FULL_CAPABILITY = {
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
} as const

function makeModelConfigResponse(): ModelConfigResponse {
  return {
    userId: 'default',
    config: {
      language: {
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        baseUrl: 'https://ai.1seey.com/v1',
        apiKeyStatus: 'configured',
        apiKeyPreview: 'sk-***',
      },
      multimodal: {
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        baseUrl: 'https://ai.1seey.com/v1',
        apiKeyStatus: 'configured',
        apiKeyPreview: 'sk-***',
      },
      roles: {
        node_writer: {
          provider: 'openai_compatible',
          model: 'Kimi-K2.5',
          apiKeyStatus: 'configured',
          apiKeyPreview: 'sk-***',
        },
      },
      taskRouting: {
        topic_summary: 'research_judge',
      },
    },
    roleDefinitions: [
      {
        id: 'node_writer',
        label: 'Node Writer',
        description: 'Writes grounded node narratives.',
        preferredSlot: 'language',
        defaultTasks: ['topic_summary'],
      },
    ],
    routing: {
      topic_summary: {
        target: 'research_judge',
        defaultTarget: 'research_judge',
      },
    },
    catalog: [
      {
        provider: 'openai_compatible',
        label: 'OpenAI-Compatible',
        baseUrl: 'https://ai.1seey.com/v1',
        adapter: 'openai-compatible',
        providerAuthEnvVars: ['OPENAI_API_KEY'],
        providerAuthChoices: [],
        models: [
          {
            id: 'Kimi-K2.5',
            label: 'Kimi K2.5',
            slot: 'both',
            capabilities: FULL_CAPABILITY,
            recommended: true,
            description: 'Long-context multimodal model.',
          },
        ],
      },
    ],
    presets: [
      {
        id: 'compatible-kimi-dual',
        label: 'Compatible Kimi Dual-Slot',
        description: 'Kimi on both default slots.',
        language: {
          provider: 'openai_compatible',
          model: 'Kimi-K2.5',
        },
        multimodal: {
          provider: 'openai_compatible',
          model: 'Kimi-K2.5',
        },
      },
    ],
  }
}

function makeModelCapabilitySummary(): ModelCapabilitySummary {
  return {
    userId: 'default',
    slots: {
      language: {
        configured: true,
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        capability: FULL_CAPABILITY,
        apiKeyStatus: 'configured',
      },
      multimodal: {
        configured: true,
        provider: 'openai_compatible',
        model: 'Kimi-K2.5',
        capability: FULL_CAPABILITY,
        apiKeyStatus: 'configured',
      },
    },
    routing: {
      topic_summary: {
        target: 'research_judge',
        defaultTarget: 'research_judge',
      },
    },
    roleDefinitions: [
      {
        id: 'node_writer',
        label: 'Node Writer',
        description: 'Writes grounded node narratives.',
        preferredSlot: 'language',
        defaultTasks: ['topic_summary'],
      },
      {
        id: 'vision_reader',
        label: 'Vision Reader',
        description: 'Reads multimodal evidence.',
        preferredSlot: 'multimodal',
        defaultTasks: ['topic_chat_vision'],
      },
    ],
  }
}

describe('omniRuntimeCache', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
    invalidateModelConfigResponse()
    invalidateModelCapabilitySummary()
    invalidateTopicResearchBrief()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dedupes inflight model capability requests', async () => {
    let resolveRequest!: (value: ModelCapabilitySummary) => void
    const pending = new Promise<ModelCapabilitySummary>((resolve) => {
      resolveRequest = resolve
    })
    mockApiGet.mockReturnValueOnce(pending as Promise<unknown>)

    const first = fetchModelCapabilitySummary()
    const second = fetchModelCapabilitySummary()

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    resolveRequest(makeModelCapabilitySummary())

    const [left, right] = await Promise.all([first, second])
    expect(left).toEqual(right)
    expect(left.slots.language.model).toBe('Kimi-K2.5')
  })

  it('reuses model config cache until the ttl expires', async () => {
    vi.useFakeTimers()
    mockApiGet.mockResolvedValueOnce(makeModelConfigResponse())

    const first = await fetchModelConfigResponse()
    const second = await fetchModelConfigResponse()

    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)

    vi.advanceTimersByTime(30_001)
    mockApiGet.mockResolvedValueOnce(makeModelConfigResponse())

    await fetchModelConfigResponse()
    expect(mockApiGet).toHaveBeenCalledTimes(2)
  })

  it('bypasses fresh model config cache when force is requested', async () => {
    mockApiGet
      .mockResolvedValueOnce(makeModelConfigResponse())
      .mockResolvedValueOnce({
        ...makeModelConfigResponse(),
        config: {
          ...makeModelConfigResponse().config,
          language: {
            ...makeModelConfigResponse().config.language!,
            model: 'Kimi-K2.5-Refresh',
          },
        },
      })

    const first = await fetchModelConfigResponse()
    const refreshed = await fetchModelConfigResponse({ force: true })

    expect(mockApiGet).toHaveBeenCalledTimes(2)
    expect(first.config.language?.model).toBe('Kimi-K2.5')
    expect(refreshed.config.language?.model).toBe('Kimi-K2.5-Refresh')
  })

  it('invalidates only the targeted topic research brief cache entry', async () => {
    const firstTopic = makeTopicResearchBrief()
    const secondTopic = makeTopicResearchBrief((brief) => {
      brief.topicId = 'topic-2'
      brief.world.topicId = 'topic-2'
      brief.guidance.topicId = 'topic-2'
    })

    mockApiGet
      .mockResolvedValueOnce(firstTopic)
      .mockResolvedValueOnce(secondTopic)
      .mockResolvedValueOnce(
        makeTopicResearchBrief((brief) => {
          brief.sessionMemory.summary.currentFocus = 'Rebuilt focus'
        }),
      )

    const topicOneInitial = await fetchTopicResearchBrief('topic-1')
    const topicTwoInitial = await fetchTopicResearchBrief('topic-2')
    invalidateTopicResearchBrief('topic-1')
    const topicOneReloaded = await fetchTopicResearchBrief('topic-1')
    const topicTwoCached = await fetchTopicResearchBrief('topic-2')

    expect(mockApiGet).toHaveBeenCalledTimes(3)
    expect(topicOneInitial.sessionMemory.summary.currentFocus).toBe('')
    expect(topicOneReloaded.sessionMemory.summary.currentFocus).toBe('Rebuilt focus')
    expect(topicTwoCached).toEqual(topicTwoInitial)
  })

  it('does not cache contract-invalid model config payloads', async () => {
    mockApiGet
      .mockResolvedValueOnce({ userId: 'default', config: null })
      .mockResolvedValueOnce(makeModelConfigResponse())

    await expect(fetchModelConfigResponse()).rejects.toThrow()
    const recovered = await fetchModelConfigResponse()

    expect(mockApiGet).toHaveBeenCalledTimes(2)
    expect(recovered.config.language?.model).toBe('Kimi-K2.5')
  })
})
