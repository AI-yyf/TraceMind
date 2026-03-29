import { assertProviderCredentials } from '../../config.ts'
import { toOpenAIMessage } from '../../runtime/messages.ts'

import type { ProviderConfig, RuntimePromptRequest, RuntimeResponse } from '../../types.ts'

export async function runOpenAICompatibleConnector(
  config: ProviderConfig,
  request: RuntimePromptRequest,
): Promise<RuntimeResponse> {
  assertProviderCredentials(config)

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 2400,
      messages: request.messages.map(toOpenAIMessage),
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }

  const choice = payload.choices?.[0]?.message?.content
  const content =
    typeof choice === 'string'
      ? choice
      : Array.isArray(choice)
        ? choice.map((part) => part.text ?? '').join('\n')
        : ''

  return {
    providerId: 'openai-compatible',
    model: request.model,
    createdAt: new Date().toISOString(),
    content,
    usage: {
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
    },
    raw: payload,
  }
}
