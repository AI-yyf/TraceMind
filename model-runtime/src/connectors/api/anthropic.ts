import { assertProviderCredentials } from '../../config.ts'
import { flattenMessageContent, toAnthropicMessage } from '../../runtime/messages.ts'

import type { ProviderConfig, RuntimePromptRequest, RuntimeResponse } from '../../types.ts'

export async function runAnthropicConnector(
  config: ProviderConfig,
  request: RuntimePromptRequest,
): Promise<RuntimeResponse> {
  assertProviderCredentials(config)

  const systemMessage = request.messages.find((message) => message.role === 'system')
  const messages = request.messages.filter((message) => message.role !== 'system')

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey ?? '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? 2400,
      temperature: request.temperature ?? 0.2,
      system: systemMessage ? flattenMessageContent(systemMessage) : undefined,
      messages: messages.map(toAnthropicMessage),
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const content = (payload.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n')

  return {
    providerId: 'anthropic',
    model: request.model,
    createdAt: new Date().toISOString(),
    content,
    usage: {
      inputTokens: payload.usage?.input_tokens,
      outputTokens: payload.usage?.output_tokens,
      totalTokens: (payload.usage?.input_tokens ?? 0) + (payload.usage?.output_tokens ?? 0),
    },
    raw: payload,
  }
}
