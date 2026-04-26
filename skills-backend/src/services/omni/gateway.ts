import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

import { defaultBaseUrlForProvider, inferCapabilities } from './catalog'
import { getResolvedUserModelConfig, type ResolvedProviderModelConfig } from './config-store'
import { isResearchRoleId, preferredSlotForRole, resolveTaskRouteTarget } from './routing'
import { LLMGenerationError } from './retry'
import type {
  ModelSlot,
  OmniAttachment,
  OmniCompleteRequest,
  OmniCompletionResult,
  OmniIssue,
  OmniMessage,
  OmniTask,
  ProviderId,
  ProviderModelRef,
  ResearchRoleId,
  TaskRouteTarget,
} from './types'

const COMPATIBLE_PROVIDER_HEADERS: Partial<Record<ProviderId, Record<string, string>>> = {
  deepseek: { 'X-Client-Source': 'tracemind-alpha' },
}

const VALIDATION_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a6sAAAAASUVORK5CYII='

type OpenAICompatibleOutput = {
  text: string
  reasoning?: string
}

type OpenAICompatiblePayloadOptions = {
  omitResponseFormat?: boolean
  omitImplicitMaxTokens?: boolean
  maxTokensOverride?: number
  disableReasoningOnlyRetry?: boolean
}

type OpenAICompatibleRequestProfile = {
  preferNonStreamFirst: boolean
  omitImplicitMaxTokens: boolean
  preferPromptOnlyJson: boolean
  reasoningOnlyRetryTokens?: number
}

function wantsVision(task: OmniTask, messages: OmniMessage[]) {
  if (
    task === 'topic_chat_vision' ||
    task === 'document_parse' ||
    task === 'figure_analysis' ||
    task === 'formula_recognition' ||
    task === 'table_extraction'
  ) {
    return true
  }

  return messages.some((message) =>
    message.attachments?.some((attachment) => attachment.type === 'image' || attachment.type === 'pdf'),
  )
}

function chooseSlot(task: OmniTask, messages: OmniMessage[]): ModelSlot {
  return wantsVision(task, messages) ? 'multimodal' : 'language'
}

function slotCandidates(
  preferredSlot: ModelSlot,
  language: ResolvedProviderModelConfig | null,
  multimodal: ResolvedProviderModelConfig | null,
): Array<{ slot: ModelSlot; config: ResolvedProviderModelConfig | null }> {
  return preferredSlot === 'multimodal'
    ? [
        { slot: 'multimodal', config: multimodal },
        { slot: 'language', config: language },
      ]
    : [
        { slot: 'language', config: language },
        { slot: 'multimodal', config: multimodal },
      ]
}

function supportsRequest(config: ResolvedProviderModelConfig, requiresVision: boolean) {
  const capability = inferCapabilities(config.provider, config.model)
  return !requiresVision || capability.image || capability.pdf
}

function roleSelectionSlot(role: ResearchRoleId, requiresVision: boolean): ModelSlot {
  if (requiresVision) return 'multimodal'
  return preferredSlotForRole(role)
}

function slotCandidatesForRole(
  role: ResearchRoleId,
  language: ResolvedProviderModelConfig | null,
  multimodal: ResolvedProviderModelConfig | null,
  requiresVision: boolean,
) {
  return slotCandidates(roleSelectionSlot(role, requiresVision), language, multimodal)
}

function chunkText(value: string, size = 120) {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks
}

function normalizeBase64Payload(attachment: OmniAttachment): { mimeType: string; data: string } | null {
  if (attachment.base64) {
    return { mimeType: attachment.mimeType, data: attachment.base64 }
  }

  if (attachment.url?.startsWith('data:')) {
    const match = attachment.url.match(/^data:(.+?);base64,(.+)$/u)
    if (match) {
      return { mimeType: match[1], data: match[2] }
    }
  }

  return null
}

function buildOpenAIContent(message: OmniMessage) {
  if (!message.attachments?.length) return message.content

  const content: Array<Record<string, unknown>> = [{ type: 'text', text: message.content }]

  for (const attachment of message.attachments) {
    const payload = normalizeBase64Payload(attachment)
    if (!payload) continue

    if (attachment.type === 'image') {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${payload.mimeType};base64,${payload.data}`,
        },
      })
    }
  }

  return content
}

function buildAnthropicContent(message: OmniMessage) {
  const content: Array<Record<string, unknown>> = [{ type: 'text', text: message.content }]

  for (const attachment of message.attachments ?? []) {
    const payload = normalizeBase64Payload(attachment)
    if (!payload || attachment.type !== 'image') continue

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: payload.mimeType,
        data: payload.data,
      },
    })
  }

  return content
}

function buildGoogleParts(message: OmniMessage) {
  const parts: Array<Record<string, unknown>> = [{ text: message.content }]

  for (const attachment of message.attachments ?? []) {
    const payload = normalizeBase64Payload(attachment)
    if (!payload || attachment.type !== 'image') continue
    parts.push({
      inlineData: {
        mimeType: payload.mimeType,
        data: payload.data,
      },
    })
  }

  return parts
}

function joinUrl(baseUrl: string, pathname: string) {
  return `${baseUrl.replace(/\/+$/u, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

function normalizeStringRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key.trim(), typeof nested === 'string' ? nested.trim() : String(nested ?? '').trim()] as const)
      .filter(([key, nested]) => key.length > 0 && nested.length > 0),
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeUnknownRecord(value: unknown) {
  if (!isPlainObject(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key.trim(), nested] as const)
      .filter(([key]) => key.length > 0),
  )
}

function mergeJsonRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue

    const existing = merged[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = mergeJsonRecords(existing, value)
      continue
    }

    merged[key] = value
  }

  return merged
}

function getProviderOptionString(config: ResolvedProviderModelConfig, key: string) {
  const value = config.providerOptions?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function buildCompatibleHeaders(config: ResolvedProviderModelConfig) {
  const extraHeaders = normalizeStringRecord(config.providerOptions?.headers)
  const headers: Record<string, string> = {
    ...COMPATIBLE_PROVIDER_HEADERS[config.provider],
    ...extraHeaders,
  }

  const organization = getProviderOptionString(config, 'organization')
  if (organization) {
    headers['OpenAI-Organization'] = organization
  }

  const project = getProviderOptionString(config, 'project')
  if (project) {
    headers['OpenAI-Project'] = project
  }

  const appId = getProviderOptionString(config, 'appId')
  if (appId) {
    headers['X-Client-App'] = appId
  }

  return headers
}

function buildCompatibleUrl(config: ResolvedProviderModelConfig, pathname: string) {
  const url = new URL(joinUrl(config.baseUrl || defaultBaseUrlForProvider(config.provider), pathname))
  const query = normalizeStringRecord(config.providerOptions?.query)

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
}

function buildCompatibleThinkingBody(config: ResolvedProviderModelConfig) {
  switch (config.options?.thinking) {
    case 'off':
      return { thinking: { type: 'disabled' } }
    case 'on':
      return { thinking: { type: 'enabled' } }
    default:
      return {}
  }
}

function buildCompatibleBodyOverrides(config: ResolvedProviderModelConfig) {
  return mergeJsonRecords(
    buildCompatibleThinkingBody(config),
    normalizeUnknownRecord(config.providerOptions?.body),
  )
}

function pushUniqueFragment(target: string[], value: unknown) {
  if (typeof value !== 'string') return
  if (!value) return
  target.push(value)
}

function collectContentFragments(
  value: unknown,
  textParts: string[],
  reasoningParts: string[],
  defaultTarget: 'text' | 'reasoning' = 'text',
) {
  if (!value) return

  if (typeof value === 'string') {
    if (defaultTarget === 'reasoning') {
      reasoningParts.push(value)
    } else {
      textParts.push(value)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectContentFragments(item, textParts, reasoningParts, defaultTarget)
    }
    return
  }

  if (typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  const inferredTarget =
    typeof record.type === 'string' &&
    /(reason|think|thought)/iu.test(record.type)
      ? 'reasoning'
      : defaultTarget

  collectContentFragments(record.text, textParts, reasoningParts, inferredTarget)
  collectContentFragments(record.content, textParts, reasoningParts, inferredTarget)
  collectContentFragments(record.input_text, textParts, reasoningParts, inferredTarget)
  collectContentFragments(record.output_text, textParts, reasoningParts, inferredTarget)
  collectContentFragments(record.reasoning_content, textParts, reasoningParts, 'reasoning')
  collectContentFragments(record.reasoning, textParts, reasoningParts, 'reasoning')
  collectContentFragments(record.reasoning_text, textParts, reasoningParts, 'reasoning')
  collectContentFragments(record.thinking, textParts, reasoningParts, 'reasoning')
  collectContentFragments(record.text_delta, textParts, reasoningParts, inferredTarget)
  collectContentFragments(record.delta, textParts, reasoningParts, inferredTarget)
  collectContentFragments(record.message, textParts, reasoningParts, inferredTarget)
}

function collectOpenAICompatibleFragments(source: unknown) {
  const textParts: string[] = []
  const reasoningParts: string[] = []

  collectContentFragments(source, textParts, reasoningParts)

  if (typeof source === 'object' && source) {
    const record = source as Record<string, unknown>
    pushUniqueFragment(textParts, record.refusal)
    collectContentFragments(record.refusal, textParts, reasoningParts, 'text')
  }

  return {
    rawText: textParts.join(''),
    rawReasoning: reasoningParts.join(''),
  }
}

function consumeOpenAICompatibleEventBlock(
  block: string,
  textParts: string[],
  reasoningParts: string[],
) {
  const dataLines = block
    .split(/\r?\n/gu)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())

  if (dataLines.length === 0) return

  const payload = dataLines.join('\n')
  if (!payload || payload === '[DONE]') return

  const parsed = JSON.parse(payload) as {
    choices?: Array<{ delta?: unknown; message?: unknown }>
  }
  const choice = parsed.choices?.[0]
  const fragments = collectOpenAICompatibleFragments(choice?.delta ?? choice?.message ?? parsed)
  if (fragments.rawText) textParts.push(fragments.rawText)
  if (fragments.rawReasoning) reasoningParts.push(fragments.rawReasoning)
}

function parseOpenAICompatibleEventStream(raw: string) {
  const textParts: string[] = []
  const reasoningParts: string[] = []

  for (const block of raw.split(/\r?\n\r?\n/gu)) {
    if (!block.trim()) continue
    consumeOpenAICompatibleEventBlock(block, textParts, reasoningParts)
  }

  return finalizeOpenAICompatibleOutput(textParts.join(''), reasoningParts.join('\n'))
}

function parseOpenAICompatibleTextResponse(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { choices?: Array<{ message?: unknown; delta?: unknown }> }
    const choice = parsed.choices?.[0]
    const fragments = collectOpenAICompatibleFragments(choice?.message ?? choice?.delta ?? parsed)
    return finalizeOpenAICompatibleOutput(fragments.rawText, fragments.rawReasoning)
  } catch {
    if (/^\s*data:/mu.test(raw)) {
      const streamed = parseOpenAICompatibleEventStream(raw)
      if (streamed.text || streamed.reasoning) {
        return streamed
      }
    }

    return finalizeOpenAICompatibleOutput(raw)
  }
}

function stripThinkBlocks(value: string) {
  const reasoningBlocks: string[] = []
  let text = value.replace(/<think>([\s\S]*?)<\/think>/giu, (_match, block: string) => {
    const normalized = normalizeWhitespace(block)
    if (normalized) {
      reasoningBlocks.push(normalized)
    }
    return '\n'
  })

  const openThinkIndex = text.toLowerCase().lastIndexOf('<think>')
  if (openThinkIndex !== -1) {
    const trailingBlock = normalizeWhitespace(text.slice(openThinkIndex + '<think>'.length))
    if (trailingBlock) {
      reasoningBlocks.push(trailingBlock)
    }
    text = text.slice(0, openThinkIndex)
  }

  text = text.replace(/<\/think>/giu, '\n')

  return {
    text: normalizeWhitespace(text),
    reasoning: reasoningBlocks.join('\n\n').trim(),
  }
}

function looksLikeInlineReasoningLeak(value: string) {
  const normalized = normalizeWhitespace(value)
  if (!normalized) return false

  const lower = normalized.toLowerCase()
  let score = 0

  const directMarkers = [
    'the user wants',
    'user wants',
    'first, let',
    "let's analyze",
    'key concepts',
    'analysis:',
    'final answer',
    'direct answer',
    '需要先',
    '首先',
    '分析：',
    '关键概念',
    '最终回答',
    '直接回答',
    '一句话概括',
  ]

  for (const marker of directMarkers) {
    if (lower.includes(marker)) {
      score += 1
    }
  }

  if (/^(?:用户|the user|user)/iu.test(normalized)) {
    score += 1
  }

  if ((normalized.match(/\n\s*[-*•]\s+/gu) ?? []).length > 0) {
    score += 1
  }

  return score >= 2
}

function looksLikeRecoveredAnswer(value: string) {
  const normalized = normalizeWhitespace(value)
  if (!normalized || normalized.length > 320) return false
  if (/^(?:用户|the user|user|首先|first|analysis|分析|key concepts?|需要|let me|让我|检查|plan)/iu.test(normalized)) {
    return false
  }
  if (/^(?:[-*•]|\d+\.)\s+/u.test(normalized)) {
    return false
  }
  return true
}

function recoverInlineReasoningLeak(value: string): OpenAICompatibleOutput {
  const normalized = normalizeWhitespace(value)
  if (!looksLikeInlineReasoningLeak(normalized)) {
    return { text: normalized }
  }

  const markerPatterns = [
    /(?:^|\n)\s*(?:final answer|direct answer|answer|response)\s*[:：]\s*/giu,
    /(?:^|\n)\s*(?:最终回答|最后回答|直接回答|回答|答复|一句话概括|一句话回答|简短回答|结论)\s*[:：]\s*/giu,
  ]

  let startIndex = -1
  for (const pattern of markerPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      startIndex = Math.max(startIndex, match.index + match[0].length)
    }
  }

  if (startIndex >= 0) {
    const reasoning = normalizeWhitespace(normalized.slice(0, startIndex))
    const candidate = normalizeWhitespace(normalized.slice(startIndex))
    if (candidate && looksLikeRecoveredAnswer(candidate) && !looksLikeInlineReasoningLeak(candidate)) {
      return {
        text: candidate,
        reasoning: reasoning || undefined,
      }
    }
  }

  const paragraphs = normalized.split(/\n{2,}/gu).map((entry) => normalizeWhitespace(entry)).filter(Boolean)
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const candidate = paragraphs[index]
    if (!looksLikeRecoveredAnswer(candidate) || looksLikeInlineReasoningLeak(candidate)) {
      continue
    }

    const reasoning = normalizeWhitespace(paragraphs.slice(0, index).join('\n\n'))
    if (reasoning) {
      return {
        text: candidate,
        reasoning,
      }
    }
  }

  return { text: normalized }
}

function finalizeOpenAICompatibleOutput(rawText: string, rawReasoning = ''): OpenAICompatibleOutput {
  const thinkSplit = stripThinkBlocks(rawText)
  const normalizedReasoning = normalizeWhitespace([rawReasoning, thinkSplit.reasoning].filter(Boolean).join('\n\n'))
  const containsThinkMarkup = /<think>/iu.test(rawText)
  const normalizedText =
    thinkSplit.text ||
    (containsThinkMarkup ? '' : normalizeWhitespace(rawText)) ||
    normalizedReasoning
  const recovered = recoverInlineReasoningLeak(normalizedText)
  const mergedReasoning = normalizeWhitespace(
    [normalizedReasoning, recovered.reasoning].filter(Boolean).join('\n\n'),
  )

  return {
    text: recovered.text,
    reasoning: mergedReasoning || undefined,
  }
}

function isReasoningOnlyCompatibleOutput(output: OpenAICompatibleOutput) {
  const text = normalizeWhitespace(output.text)
  const reasoning = normalizeWhitespace(output.reasoning ?? '')
  return Boolean(reasoning) && Boolean(text) && text === reasoning
}

function timeoutTierForRequest(config: ResolvedProviderModelConfig, request: OmniCompleteRequest) {
  const model = config.model.toLowerCase()
  const reasoningModel = /(reason|think|kimi|m2\.5|glm5|deepseek|sonnet)/iu.test(model)
  const visionTask = wantsVision(request.task, request.messages)
  // Kimi models require longer timeout due to extended reasoning
  const kimiModel = /kimi/iu.test(model)

  let baseMs = 25000

  switch (request.task) {
    case 'topic_chat':
    case 'topic_summary':
      baseMs = kimiModel ? 120000 : 40000
      break
    case 'topic_chat_vision':
    case 'evidence_explainer':
      baseMs = kimiModel ? 180000 : 65000
      break
    case 'document_parse':
    case 'figure_analysis':
    case 'formula_recognition':
    case 'table_extraction':
      baseMs = kimiModel ? 240000 : 90000
      break
    default:
      baseMs = kimiModel ? 90000 : 25000
      break
  }

  if (request.json) baseMs += 10000
  if (visionTask && !kimiModel) baseMs += 15000
  if (reasoningModel && !kimiModel) baseMs += 20000

  return {
    streamMs: baseMs,
    nonStreamMs: baseMs + 30000,
  }
}

function buildOpenAICompatiblePayload(
  config: ResolvedProviderModelConfig,
  request: OmniCompleteRequest,
  stream: boolean,
  options?: OpenAICompatiblePayloadOptions,
) {
  const bodyOverrides = buildCompatibleBodyOverrides(config)
  const payload = mergeJsonRecords(bodyOverrides, {
    model: config.model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: buildOpenAIContent(message),
    })),
    temperature: request.temperature ?? config.options?.temperature ?? 0.2,
    stream,
  })

  const resolvedMaxTokens =
    options?.maxTokensOverride ??
    request.maxTokens ??
    (options?.omitImplicitMaxTokens ? undefined : config.options?.maxTokens ?? 8000)

  if (typeof resolvedMaxTokens === 'number' && Number.isFinite(resolvedMaxTokens)) {
    payload.max_tokens = resolvedMaxTokens
    if (Object.prototype.hasOwnProperty.call(bodyOverrides, 'max_completion_tokens')) {
      payload.max_completion_tokens = resolvedMaxTokens
    }
  }

  if (request.json && !options?.omitResponseFormat) {
    payload.response_format = { type: 'json_object' }
  }

  return payload
}

function buildFetchError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

async function parseProviderResponseError(response: Response) {
  const raw = await response.text()

  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
    const message =
      parsed.error?.message ||
      parsed.message ||
      raw ||
      `Provider request failed with status ${response.status}.`
    return buildFetchError(response.status, message)
  } catch {
    return buildFetchError(
      response.status,
      raw || `Provider request failed with status ${response.status}.`,
    )
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers = new Headers(init.headers)
  headers.set('connection', 'close')

  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw buildFetchError(408, `${timeoutLabel} timed out after ${timeoutMs}ms.`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function combineProviderErrors(primary: unknown, fallback: unknown) {
  const combined = buildFetchError(
    getErrorStatus(fallback) ?? getErrorStatus(primary) ?? 500,
    `Stream-first request failed: ${getErrorMessage(primary)} Fallback request failed: ${getErrorMessage(fallback)}`,
  )
  return combined
}

function combineJsonCompatibilityErrors(
  primary: unknown,
  fallback: unknown,
  labels?: {
    primary: string
    fallback: string
  },
) {
  const primaryLabel = labels?.primary ?? 'Primary structured output request'
  const fallbackLabel = labels?.fallback ?? 'Fallback structured output request'

  return buildFetchError(
    getErrorStatus(fallback) ?? getErrorStatus(primary) ?? 500,
    `${primaryLabel} failed: ${getErrorMessage(primary)} ${fallbackLabel} failed: ${getErrorMessage(fallback)}`,
  )
}

function shouldRetryOpenAICompatibleWithoutStream(error: unknown) {
  if (isInvalidKeyError(error)) return false
  const status = getErrorStatus(error)
  if (!status) return true
  return status === 408 || status === 409 || status === 422 || status === 429 || status >= 500 || status === 400
}

function resolveOpenAICompatibleRequestProfile(
  config: ResolvedProviderModelConfig,
  request: OmniCompleteRequest,
): OpenAICompatibleRequestProfile {
  const customCompatibleProvider = config.provider === 'openai_compatible'
  const model = config.model.toLowerCase()
  const reasoningHeavyCompatibleModel = /(kimi|moonshot|deepseek|glm|qwen|doubao)/iu.test(model)

  return {
    // Custom OpenAI-compatible gateways often delay SSE headers heavily on structured requests.
    preferNonStreamFirst:
      customCompatibleProvider && (request.json === true || reasoningHeavyCompatibleModel),
    // When no explicit output budget is required, letting the provider choose its own cap is more stable.
    omitImplicitMaxTokens: customCompatibleProvider && typeof request.maxTokens !== 'number',
    // Most custom gateways emulate the OpenAI surface but behave better when JSON is requested via prompt only.
    preferPromptOnlyJson: customCompatibleProvider && request.json === true,
    // Some reasoning-heavy compatible models can consume the full budget in hidden reasoning and omit a final answer.
    reasoningOnlyRetryTokens:
      customCompatibleProvider && reasoningHeavyCompatibleModel ? 256 : undefined,
  }
}

async function readOpenAICompatibleStream(response: Response, timeoutMs: number) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw buildFetchError(502, 'Provider stream did not include a readable body.')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  const textParts: string[] = []
  const reasoningParts: string[] = []
  const deadline = Date.now() + timeoutMs

  const readWithTimeout = async (remainingMs: number) =>
    new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
      const timer = setTimeout(() => {
        void reader.cancel('stream timeout')
        reject(buildFetchError(408, `Provider stream body timed out after ${timeoutMs}ms.`))
      }, remainingMs)

      reader.read().then(
        (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
    })

  const consumeEvent = (block: string) => {
    consumeOpenAICompatibleEventBlock(block, textParts, reasoningParts)
  }

  while (true) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      await reader.cancel('stream timeout')
      throw buildFetchError(408, `Provider stream body timed out after ${timeoutMs}ms.`)
    }

    const { done, value } = await readWithTimeout(remainingMs)
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let boundary = buffer.search(/\r?\n\r?\n/u)
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + (buffer.slice(boundary, boundary + 4).startsWith('\r\n\r\n') ? 4 : 2))
      if (block.trim()) {
        consumeEvent(block)
      }
      boundary = buffer.search(/\r?\n\r?\n/u)
    }

    if (done) break
  }

  if (buffer.trim()) {
    consumeEvent(buffer)
  }

  return finalizeOpenAICompatibleOutput(textParts.join(''), reasoningParts.join('\n'))
}

function findTaskOverrideMatch(
  taskOverride: ProviderModelRef | undefined,
  language: ResolvedProviderModelConfig | null,
  multimodal: ResolvedProviderModelConfig | null,
  roles: Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>> | undefined,
  requiresVision: boolean,
): { slot: ModelSlot; config: ResolvedProviderModelConfig } | null {
  if (!taskOverride) return null

  const slotMatch = [...slotCandidates('language', language, multimodal), ...slotCandidates('multimodal', language, multimodal)]
    .find(
      (entry) =>
        entry.config &&
        entry.config.provider === taskOverride.provider &&
        entry.config.model === taskOverride.model &&
        supportsRequest(entry.config, requiresVision),
    )

  if (slotMatch?.config) {
    return { slot: slotMatch.slot, config: slotMatch.config }
  }

  for (const [roleId, config] of Object.entries(roles ?? {}) as Array<
    [ResearchRoleId, ResolvedProviderModelConfig | null]
  >) {
    if (!config) continue
    if (config.provider !== taskOverride.provider || config.model !== taskOverride.model) continue
    if (!supportsRequest(config, requiresVision)) continue
    return {
      slot: roleSelectionSlot(roleId, requiresVision),
      config,
    }
  }

  return null
}

function pickFirstConfiguredSlot(
  candidates: Array<{ slot: ModelSlot; config: ResolvedProviderModelConfig | null }>,
  requiresVision: boolean,
): { slot: ModelSlot; config: ResolvedProviderModelConfig } | null {
  for (const entry of candidates) {
    if (!entry.config) continue
    if (!supportsRequest(entry.config, requiresVision)) continue
    return { slot: entry.slot, config: entry.config }
  }

  return null
}

function selectConfiguredSlot(
  preferredSlot: ModelSlot,
  routedTarget: TaskRouteTarget,
  taskOverride: ProviderModelRef | undefined,
  language: ResolvedProviderModelConfig | null,
  multimodal: ResolvedProviderModelConfig | null,
  roles: Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>> | undefined,
  requiresVision: boolean,
): { slot: ModelSlot; config: ResolvedProviderModelConfig } | null {
  const overrideMatch = findTaskOverrideMatch(
    taskOverride,
    language,
    multimodal,
    roles,
    requiresVision,
  )
  if (overrideMatch) return overrideMatch

  if (isResearchRoleId(routedTarget)) {
    const roleConfig = roles?.[routedTarget] ?? null
    if (roleConfig && supportsRequest(roleConfig, requiresVision)) {
      return {
        slot: roleSelectionSlot(routedTarget, requiresVision),
        config: roleConfig,
      }
    }

    const fallbackFromRole = pickFirstConfiguredSlot(
      slotCandidatesForRole(routedTarget, language, multimodal, requiresVision),
      requiresVision,
    )
    if (fallbackFromRole) return fallbackFromRole
  } else {
    const explicitSlot = pickFirstConfiguredSlot(
      slotCandidates(routedTarget, language, multimodal),
      requiresVision,
    )
    if (explicitSlot) return explicitSlot
  }

  return pickFirstConfiguredSlot(slotCandidates(preferredSlot, language, multimodal), requiresVision)
}

function stringifyIssueFallback(prompt: string, issue: OmniIssue, requestJson?: boolean) {
  const answer =
    issue.code === 'missing_key'
      ? `\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u6a21\u578b API Key\u3002\u4f60\u7684\u95ee\u9898\u662f\u201c${prompt}\u201d\u3002\u8bf7\u5148\u914d\u7f6e Key\uff0c\u6216\u8005\u66f4\u6362\u4e00\u4e2a\u53ef\u7528\u7684 Key \u540e\u518d\u7ee7\u7eed\u3002`
      : issue.code === 'invalid_key'
        ? `\u5f53\u524d\u6a21\u578b Key \u53ef\u80fd\u5df2\u5931\u6548\u6216\u88ab\u63d0\u4f9b\u5546\u62d2\u7edd\u3002\u4f60\u7684\u95ee\u9898\u662f\u201c${prompt}\u201d\u3002\u8bf7\u66f4\u6362\u4e00\u4e2a\u65b0\u7684 Key\uff0c\u6216\u8005\u5207\u6362\u5230\u5176\u4ed6\u53ef\u7528\u6a21\u578b\u540e\u518d\u8bd5\u3002`
        : `\u5f53\u524d\u6a21\u578b\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528\u3002\u4f60\u7684\u95ee\u9898\u662f\u201c${prompt}\u201d\u3002\u8bf7\u7a0d\u540e\u91cd\u8bd5\uff0c\u6216\u8005\u66f4\u6362\u53e6\u4e00\u4e2a\u6a21\u578b Key\u3002`

  if (!requestJson) {
    return answer
  }

  return JSON.stringify({
    answer,
    citations: [],
    suggestedActions: [
      {
        label: '\u914d\u7f6e\u8bed\u8a00\u6a21\u578b',
        action: 'navigate',
        targetId: 'language',
        description: '\u68c0\u67e5\u6216\u91cd\u65b0\u586b\u5199\u6587\u672c\u6a21\u578b Key\u3002',
      },
      {
        label: '\u914d\u7f6e\u591a\u6a21\u6001\u6a21\u578b',
        action: 'navigate',
        targetId: 'multimodal',
        description: '\u68c0\u67e5\u6216\u91cd\u65b0\u586b\u5199\u591a\u6a21\u6001\u6a21\u578b Key\u3002',
      },
    ],
  })
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown provider error'
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || !error) return undefined
  if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return (error as { status: number }).status
  }

  const nestedError = 'error' in error ? (error as { error?: unknown }).error : undefined
  if (
    nestedError &&
    typeof nestedError === 'object' &&
    'status' in nestedError &&
    typeof (nestedError as { status?: unknown }).status === 'number'
  ) {
    return (nestedError as { status: number }).status
  }

  return undefined
}

function isInvalidKeyError(error: unknown) {
  const status = getErrorStatus(error)
  if (status === 401 || status === 403) {
    return true
  }

  const message = getErrorMessage(error).toLowerCase()
  return [
    'invalid api key',
    'incorrect api key',
    'api key not valid',
    'invalid x-api-key',
    'authentication',
    'unauthorized',
    'permission denied',
    'forbidden',
    'invalid key',
  ].some((token) => message.includes(token))
}

export class OmniGateway {
  async validateSlot(slot: ModelSlot, userId?: string): Promise<OmniIssue | null> {
    const result = await this.complete({
      task: slot === 'multimodal' ? 'topic_chat_vision' : 'general_chat',
      preferredSlot: slot,
      userId,
      messages:
        slot === 'multimodal'
          ? [
              {
                role: 'user',
                content: 'Describe this image in one short sentence.',
                attachments: [
                  {
                    type: 'image',
                    mimeType: 'image/png',
                    base64: VALIDATION_IMAGE_BASE64,
                  },
                ],
              },
            ]
          : [
              {
                role: 'user',
                content: 'Reply with OK.',
              },
            ],
      temperature: 0,
      maxTokens: slot === 'multimodal' ? 32 : 8,
    })

    return result.issue ?? null
  }

  async hasAvailableModel(request: OmniCompleteRequest): Promise<boolean> {
    if (
      process.argv.includes('--test') ||
      process.execArgv.includes('--test') ||
      process.env.NODE_TEST_CONTEXT === 'child-v8' ||
      process.env.NODE_ENV === 'test'
    ) {
      return false
    }

    const { selection } = await this.resolveSelection(request)
    return Boolean(selection?.config?.apiKey)
  }

  async complete(request: OmniCompleteRequest): Promise<OmniCompletionResult> {
    const { preferredSlot, selection } = await this.resolveSelection(request)

    // NO FALLBACK: Throw error when no API key available
    if (!selection?.config?.apiKey) {
      throw new LLMGenerationError(
        `No API key configured for ${preferredSlot} slot. Please configure a ${preferredSlot === 'multimodal' ? 'multimodal' : 'language'} model key.`,
        0,
        new Error('missing_key'),
        'backend',
        'backend-fallback'
      )
    }

    const capabilities = inferCapabilities(selection.config.provider, selection.config.model)

    try {
      if (selection.config.provider === 'anthropic') {
        const text = await this.completeWithAnthropic(selection.config, request)
        return {
          text,
          reasoning: undefined,
          provider: selection.config.provider,
          model: selection.config.model,
          slot: selection.slot,
          capabilities,
          usedFallback: false,
        }
      }

      if (selection.config.provider === 'google') {
        const text = await this.completeWithGoogle(selection.config, request)
        return {
          text,
          reasoning: undefined,
          provider: selection.config.provider,
          model: selection.config.model,
          slot: selection.slot,
          capabilities,
          usedFallback: false,
        }
      }

      const output = await this.completeWithOpenAICompatible(selection.config, request)
      return {
        text: output.text,
        reasoning: output.reasoning,
        provider: selection.config.provider,
        model: selection.config.model,
        slot: selection.slot,
        capabilities,
        usedFallback: false,
      }
    } catch (error) {
      // NO FALLBACK: Throw error instead of returning template content
      const err = error instanceof Error ? error : new Error(String(error))
      throw new LLMGenerationError(
        `LLM call failed for ${selection.config.provider}/${selection.config.model}: ${err.message}`,
        1,
        err,
        selection.config.provider,
        selection.config.model
      )
    }
  }

  streamFromCompletion(result: OmniCompletionResult) {
    return chunkText(result.text)
  }

  private async resolveSelection(request: OmniCompleteRequest) {
    const userConfig = await getResolvedUserModelConfig(request.userId)
    const preferredSlot = request.preferredSlot ?? chooseSlot(request.task, request.messages)
    const requiresVision = wantsVision(request.task, request.messages)
    const routedTarget =
      request.role ?? resolveTaskRouteTarget(request.task, userConfig.taskRouting?.[request.task] ?? null)
    const selection = selectConfiguredSlot(
      preferredSlot,
      routedTarget,
      userConfig.taskOverrides?.[request.task],
      userConfig.language,
      userConfig.multimodal,
      userConfig.roles,
      requiresVision,
    )

    return { preferredSlot, routedTarget, selection }
  }

  private async completeWithOpenAICompatible(
    config: ResolvedProviderModelConfig,
    request: OmniCompleteRequest,
  ) {
    const profile = resolveOpenAICompatibleRequestProfile(config, request)

    if (request.json && profile.preferPromptOnlyJson) {
      try {
        return await this.completeWithOpenAICompatibleAttempt(config, request, {
          omitResponseFormat: true,
        })
      } catch (promptOnlyJsonError) {
        try {
          return await this.completeWithOpenAICompatibleAttempt(config, request)
        } catch (nativeJsonError) {
          throw combineJsonCompatibilityErrors(promptOnlyJsonError, nativeJsonError, {
            primary: 'Prompt-only JSON request',
            fallback: 'Native JSON compatibility retry',
          })
        }
      }
    }

    try {
      return await this.completeWithOpenAICompatibleAttempt(config, request)
    } catch (nativeJsonError) {
      if (!request.json) {
        throw nativeJsonError
      }

      try {
        return await this.completeWithOpenAICompatibleAttempt(config, request, {
          omitResponseFormat: true,
        })
      } catch (promptOnlyJsonError) {
        throw combineJsonCompatibilityErrors(nativeJsonError, promptOnlyJsonError, {
          primary: 'Native JSON response request',
          fallback: 'Prompt-only JSON retry',
        })
      }
    }
  }

  private async completeWithOpenAICompatibleAttempt(
    config: ResolvedProviderModelConfig,
    request: OmniCompleteRequest,
    options?: OpenAICompatiblePayloadOptions,
  ): Promise<OpenAICompatibleOutput> {
    const url = buildCompatibleUrl(config, '/chat/completions')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey ?? ''}`,
      'Content-Type': 'application/json',
      ...buildCompatibleHeaders(config),
    }
    const timeouts = timeoutTierForRequest(config, request)
    const profile = resolveOpenAICompatibleRequestProfile(config, request)
    let streamError: unknown = null
    const payloadOptions: OpenAICompatiblePayloadOptions = {
      ...options,
      omitImplicitMaxTokens:
        options?.omitImplicitMaxTokens ?? profile.omitImplicitMaxTokens,
    }

    const requestNonStream = async () => {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            ...headers,
            Accept: 'application/json',
          },
          body: JSON.stringify(buildOpenAICompatiblePayload(config, request, false, payloadOptions)),
        },
        timeouts.nonStreamMs,
        `${config.provider}/${config.model} completion request`,
      )

      if (!response.ok) {
        throw await parseProviderResponseError(response)
      }

      const raw = await response.text()
      const completed = parseOpenAICompatibleTextResponse(raw)

      if (completed.text || completed.reasoning) {
        return completed
      }

      throw buildFetchError(502, 'Provider completion returned an empty response.')
    }

    const requestStream = async () => {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            ...headers,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(buildOpenAICompatiblePayload(config, request, true, payloadOptions)),
        },
        timeouts.streamMs,
        `${config.provider}/${config.model} stream request`,
      )

      if (!response.ok) {
        throw await parseProviderResponseError(response)
      }

      const streamed = await readOpenAICompatibleStream(response, timeouts.streamMs)
      if (streamed.text || streamed.reasoning) {
        return streamed
      }

      throw buildFetchError(502, 'Provider stream returned an empty response.')
    }

    const executeRequest = async () => {
      if (profile.preferNonStreamFirst) {
        try {
          return await requestNonStream()
        } catch (nonStreamError) {
          if (!shouldRetryOpenAICompatibleWithoutStream(nonStreamError)) {
            throw nonStreamError
          }

          try {
            return await requestStream()
          } catch (streamFallbackError) {
            throw combineProviderErrors(nonStreamError, streamFallbackError)
          }
        }
      }

      try {
        return await requestStream()
      } catch (error) {
        streamError = error
        if (!shouldRetryOpenAICompatibleWithoutStream(error)) {
          throw error
        }
      }

      try {
        return await requestNonStream()
      } catch (fallbackError) {
        if (streamError) {
          throw combineProviderErrors(streamError, fallbackError)
        }
        throw fallbackError
      }
    }

    const completed = await executeRequest()

    if (
      !payloadOptions.disableReasoningOnlyRetry &&
      profile.reasoningOnlyRetryTokens &&
      isReasoningOnlyCompatibleOutput(completed)
    ) {
      const currentBudget = request.maxTokens ?? config.options?.maxTokens ?? 0
      const retryBudget = Math.max(profile.reasoningOnlyRetryTokens, currentBudget * 2)

      if (retryBudget > currentBudget) {
        try {
          return await this.completeWithOpenAICompatibleAttempt(
            config,
            { ...request, maxTokens: retryBudget },
            {
              ...payloadOptions,
              maxTokensOverride: retryBudget,
              disableReasoningOnlyRetry: true,
            },
          )
        } catch {
          return completed
        }
      }
    }

    return completed
  }

  private async completeWithAnthropic(config: ResolvedProviderModelConfig, request: OmniCompleteRequest) {
    const client = new Anthropic({
      apiKey: config.apiKey ?? '',
      baseURL: config.baseUrl || defaultBaseUrlForProvider(config.provider),
      defaultHeaders: normalizeStringRecord(config.providerOptions?.headers),
    })

    const systemMessages = request.messages.filter((message) => message.role === 'system')
    const userMessages = request.messages.filter((message) => message.role !== 'system')

    const response = await client.messages.create({
      model: config.model,
      system: systemMessages.map((message) => message.content).join('\n\n'),
      messages: userMessages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: buildAnthropicContent(message),
      })) as unknown as Anthropic.Messages.MessageParam[],
      temperature: request.temperature ?? config.options?.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? config.options?.maxTokens ?? 8000,
    })

    return response.content
      .map((part) => ('text' in part ? part.text : ''))
      .join('\n')
      .trim()
  }

  private async completeWithGoogle(config: ResolvedProviderModelConfig, request: OmniCompleteRequest) {
    const client = new GoogleGenerativeAI(config.apiKey ?? '')
    const model = client.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: request.temperature ?? config.options?.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? config.options?.maxTokens ?? 8000,
      },
    } as unknown as Parameters<typeof client.getGenerativeModel>[0])

    const parts = request.messages.flatMap((message) => {
      const prefix =
        message.role === 'system'
          ? `[system]\n${message.content}`
          : message.role === 'assistant'
            ? `[assistant]\n${message.content}`
            : message.content
      return buildGoogleParts({ ...message, content: prefix })
    })

    const response = await model.generateContent(parts as unknown as Parameters<typeof model.generateContent>[0])
    return response.response.text()
  }

  private buildProviderIssue(
    selection: { slot: ModelSlot; config: ResolvedProviderModelConfig },
    error: unknown,
  ): OmniIssue {
    if (isInvalidKeyError(error)) {
      return {
        code: 'invalid_key',
        title: '\u5f53\u524d Key \u65e0\u6548\u6216\u5df2\u5931\u6548',
        message: `\u5f53\u524d ${selection.config.provider} / ${selection.config.model} \u7684 Key \u88ab\u62d2\u7edd\u6216\u5df2\u5931\u6548\uff0c\u8bf7\u66f4\u6362\u4e00\u4e2a\u65b0\u7684 Key \u540e\u518d\u8bd5\u3002`,
        provider: selection.config.provider,
        model: selection.config.model,
        slot: selection.slot,
      }
    }

    return {
      code: 'provider_error',
      title: '\u6a21\u578b\u670d\u52a1\u6682\u65f6\u4e0d\u53ef\u7528',
      message: `\u5f53\u524d ${selection.config.provider} / ${selection.config.model} \u8c03\u7528\u5931\u8d25\uff1a${getErrorMessage(error)}`,
      provider: selection.config.provider,
      model: selection.config.model,
      slot: selection.slot,
    }
  }

  private buildBackendFallback(request: OmniCompleteRequest, issue?: OmniIssue) {
    const lastUserMessage = [...request.messages].reverse().find((message) => message.role === 'user')
    const prompt =
      lastUserMessage?.content?.trim() || '\u8bf7\u57fa\u4e8e\u5df2\u6709\u8d44\u6599\u7ee7\u7eed\u6574\u7406\u3002'

    return stringifyIssueFallback(
      prompt,
      issue ?? {
        code: 'missing_key',
        title: '\u672a\u68c0\u6d4b\u5230\u53ef\u7528\u7684 Key',
        message: '\u8bf7\u5148\u914d\u7f6e\u8bed\u8a00\u6a21\u578b\u6216\u591a\u6a21\u6001\u6a21\u578b Key\u3002',
        provider: 'backend',
        model: 'backend-fallback',
      },
      request.json,
    )
  }
}

export const omniGateway = new OmniGateway()

export const __testing = {
  buildCompatibleBodyOverrides,
  buildOpenAICompatiblePayload,
  parseOpenAICompatibleTextResponse,
}
