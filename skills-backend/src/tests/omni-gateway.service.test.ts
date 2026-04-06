import assert from 'node:assert/strict'
import test from 'node:test'

import type { ResolvedProviderModelConfig } from '../services/omni/config-store'
import { __testing, omniGateway } from '../services/omni/gateway'
import type { OmniCompleteRequest } from '../services/omni/types'

function createConfig(
  overrides?: Partial<ResolvedProviderModelConfig>,
): ResolvedProviderModelConfig {
  return {
    provider: 'openai_compatible',
    model: 'moonshotai/kimi-k2.5',
    baseUrl: 'https://example.com/v1',
    apiKey: 'test-key',
    providerOptions: {},
    options: {
      thinking: 'auto',
      citations: 'backend',
      parser: 'backend',
      temperature: 0.1,
      maxTokens: 900,
    },
    ...overrides,
  }
}

function createRequest(
  overrides?: Partial<OmniCompleteRequest>,
): OmniCompleteRequest {
  return {
    task: 'topic_summary',
    json: true,
    maxTokens: 640,
    messages: [
      {
        role: 'system',
        content: 'You are a grounded research planner.',
      },
      {
        role: 'user',
        content: 'Return a compact topic blueprint.',
      },
    ],
    ...overrides,
  }
}

test('openai-compatible payload merges custom body overrides and thinking controls', () => {
  const payload = __testing.buildOpenAICompatiblePayload(
    createConfig({
      providerOptions: {
        body: {
          custom_flag: true,
          metadata: {
            lane: 'topic-gen',
          },
        },
      },
      options: {
        thinking: 'off',
        citations: 'backend',
        parser: 'backend',
        temperature: 0.3,
      },
    }),
    createRequest(),
    false,
  ) as Record<string, unknown>

  assert.equal(payload.custom_flag, true)
  assert.deepEqual(payload.metadata, { lane: 'topic-gen' })
  assert.deepEqual(payload.thinking, { type: 'disabled' })
  assert.equal(payload.stream, false)
  assert.equal(payload.temperature, 0.3)
  assert.deepEqual(payload.response_format, { type: 'json_object' })
})

test('openai-compatible payload mirrors explicit token budgets into max_completion_tokens when requested by provider body', () => {
  const payload = __testing.buildOpenAICompatiblePayload(
    createConfig({
      providerOptions: {
        body: {
          max_completion_tokens: 128,
        },
      },
    }),
    createRequest({
      maxTokens: 512,
    }),
    true,
  ) as Record<string, unknown>

  assert.equal(payload.max_tokens, 512)
  assert.equal(payload.max_completion_tokens, 512)
  assert.equal(payload.stream, true)
})

test('openai-compatible text parsing tolerates SSE-style payloads returned from non-stream requests', () => {
  const parsed = __testing.parseOpenAICompatibleTextResponse(
    [
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning":" Need JSON."},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"{\\"title\\":\\"Kimi\\"}"},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'),
  )

  assert.equal(parsed.text, '{"title":"Kimi"}')
  assert.equal(parsed.reasoning, 'Need JSON.')
})

test('openai-compatible text parsing recovers a final answer when a compatible model leaks analysis into text', () => {
  const parsed = __testing.parseOpenAICompatibleTextResponse(
    JSON.stringify({
      choices: [
        {
          message: {
            content: [
              'The user wants a concise summary of the topic.',
              '',
              'Key concepts:',
              '- multimodal evidence',
              '- long-horizon planning',
              '- research memory',
              '',
              'Final answer: Multimodal scientific agents focus on combining multimodal evidence, memory, and planning to support experimental reasoning.',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  assert.equal(
    parsed.text,
    'Multimodal scientific agents focus on combining multimodal evidence, memory, and planning to support experimental reasoning.',
  )
  assert.match(parsed.reasoning ?? '', /Key concepts:/)
})

test('openai-compatible text parsing falls back to the last concise paragraph when no explicit final-answer marker is present', () => {
  const parsed = __testing.parseOpenAICompatibleTextResponse(
    JSON.stringify({
      choices: [
        {
          message: {
            content: [
              '用户需要一句话总结这个主题。',
              '',
              '分析：需要覆盖多模态、实验规划和研究记忆。',
              '',
              '多模态科研智能体的研究重点，是把多源证据、长程规划与研究记忆整合进可解释的实验决策闭环中。',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  assert.equal(
    parsed.text,
    '多模态科研智能体的研究重点，是把多源证据、长程规划与研究记忆整合进可解释的实验决策闭环中。',
  )
  assert.match(parsed.reasoning ?? '', /分析：/)
})

test('openai-compatible retries with a larger token budget when a reasoning-heavy model returns reasoning only', async () => {
  const originalFetch = global.fetch
  const requestBudgets: number[] = []

  global.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { max_tokens?: number }
    requestBudgets.push(payload.max_tokens ?? 0)

    if (requestBudgets.length === 1) {
      return new Response(
        [
          'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning":" Need a bit more room."},"finish_reason":"length"}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        { status: 200 },
      )
    }

    return new Response(
      [
        'data: {"id":"chatcmpl-2","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning":" Final answer ready."},"finish_reason":null}]}',
        '',
        'data: {"id":"chatcmpl-2","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
      { status: 200 },
    )
  }) as typeof fetch

  try {
    const result = await (omniGateway as any).completeWithOpenAICompatibleAttempt(
      createConfig({
        model: 'Kimi-K2.5',
      }),
      createRequest({
        json: false,
        maxTokens: 64,
      }),
    )

    assert.equal(result.text, 'OK')
    assert.equal(requestBudgets.length, 2)
    assert.equal(requestBudgets[0], 64)
    assert.equal(requestBudgets[1], 256)
  } finally {
    global.fetch = originalFetch
  }
})
