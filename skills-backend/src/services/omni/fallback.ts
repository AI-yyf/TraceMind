/**
 * Runtime Fallback Service
 * 实现模型 API 失败时的自动切换机制
 *
 * 参考 opencode 的 reactive error recovery 系统
 */

import type {
  FallbackErrorClass,
  FallbackState,
  FallbackStateStatus,
  FallbackDecision,
  RuntimeFallbackConfig,
  FallbackModelRequirement,
  ModelSlot,
  ProviderId,
} from '../../../shared/model-config'
import {
  DEFAULT_RUNTIME_FALLBACK_CONFIG,
  createInitialFallbackState,
} from '../../../shared/model-config'

// ========== Error Classification ==========

/**
 * 错误分类的关键词映射
 */
const ERROR_CLASS_KEYWORDS: Record<FallbackErrorClass, string[]> = {
  quota_exceeded: [
    'quota',
    'limit exceeded',
    'usage limit',
    'rate limit exceeded',
    'monthly limit',
    'daily limit',
    '配额',
    '额度',
    '限额',
  ],
  missing_api_key: [
    'missing api key',
    'api key not found',
    'no api key',
    '缺少',
    '未配置',
    'missing key',
    'key not found',
  ],
  model_not_found: [
    'model not found',
    'model unavailable',
    'model does not exist',
    'invalid model',
    'unknown model',
    '模型不存在',
    '模型不可用',
  ],
  rate_limited: [
    'rate limit',
    'too many requests',
    '请求过于频繁',
    '限流',
    '429',
  ],
  provider_error: [
    'provider error',
    'service unavailable',
    'internal error',
    'server error',
    'provider unavailable',
    '服务不可用',
    '内部错误',
  ],
  timeout: [
    'timeout',
    'timed out',
    '超时',
    '请求超时',
    'connection timeout',
  ],
  unknown: [],
}

/**
 * HTTP 状态码到错误分类的映射
 */
const STATUS_CODE_CLASS_MAP: Record<number, FallbackErrorClass> = {
  400: 'provider_error',
  401: 'missing_api_key',
  403: 'missing_api_key',
  404: 'model_not_found',
  408: 'timeout',
  429: 'rate_limited',
  500: 'provider_error',
  502: 'provider_error',
  503: 'provider_error',
  504: 'timeout',
  529: 'rate_limited',
}

/**
 * 分类错误类型
 * 根据 HTTP 状态码和错误消息判断错误类型
 */
export function classifyError(error: unknown): FallbackErrorClass {
  const status = getErrorStatus(error)
  const message = getErrorMessage(error).toLowerCase()

  // 优先使用状态码映射
  if (status && STATUS_CODE_CLASS_MAP[status]) {
    return STATUS_CODE_CLASS_MAP[status]
  }

  // 根据关键词匹配
  for (const [errorClass, keywords] of Object.entries(ERROR_CLASS_KEYWORDS)) {
    if (errorClass === 'unknown') continue
    for (const keyword of keywords) {
      if (message.includes(keyword.toLowerCase())) {
        return errorClass as FallbackErrorClass
      }
    }
  }

  // 检查特定的错误对象结构
  if (isQuotaExceededError(error)) {
    return 'quota_exceeded'
  }

  if (isMissingApiKeyError(error)) {
    return 'missing_api_key'
  }

  if (isModelNotFoundError(error)) {
    return 'model_not_found'
  }

  return 'unknown'
}

/**
 * 检查是否为配额超限错误
 */
function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false

  const record = error as Record<string, unknown>
  const nestedError = record.error as Record<string, unknown> | undefined
  const errorType = (nestedError?.type ?? record.type) as string | undefined

  if (typeof errorType === 'string') {
    const quotaTypes = ['insufficient_quota', 'quota_exceeded', 'rate_limit_exceeded']
    return quotaTypes.some((t) => errorType.toLowerCase().includes(t))
  }

  return false
}

/**
 * 检查是否为缺少 API Key 错误
 */
function isMissingApiKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false

  const record = error as Record<string, unknown>
  const nestedError = record.error as Record<string, unknown> | undefined
  const errorType = (nestedError?.type ?? record.type) as string | undefined

  if (typeof errorType === 'string') {
    const missingKeyTypes = ['invalid_api_key', 'missing_api_key', 'authentication_error']
    return missingKeyTypes.some((t) => errorType.toLowerCase().includes(t))
  }

  const status = getErrorStatus(error)
  return status === 401 || status === 403
}

/**
 * 检查是否为模型不存在错误
 */
function isModelNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || !error) return false

  const record = error as Record<string, unknown>
  const nestedError = record.error as Record<string, unknown> | undefined
  const errorType = (nestedError?.type ?? record.type) as string | undefined

  if (typeof errorType === 'string') {
    const notFoundTypes = ['model_not_found', 'invalid_model', 'unknown_model']
    return notFoundTypes.some((t) => errorType.toLowerCase().includes(t))
  }

  const status = getErrorStatus(error)
  return status === 404
}

/**
 * 获取错误状态码
 */
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

/**
 * 获取错误消息
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && error) {
    const record = error as Record<string, unknown>
    const nestedError = record.error as Record<string, unknown> | undefined
    const message = (nestedError?.message ?? record.message ?? record.error) as string | undefined
    if (typeof message === 'string') {
      return message
    }
  }

  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

// ========== Fallback State Machine ==========

/**
 * Fallback State Machine 状态转换
 */
export function transitionFallbackState(
  state: FallbackState,
  action: 'error' | 'success' | 'timeout' | 'reset',
  error?: unknown,
): FallbackState {
  const now = Date.now()

  switch (action) {
    case 'error':
      return handleErrorTransition(state, error, now)

    case 'success':
      return handleSuccessTransition(state)

    case 'timeout':
      return handleTimeoutTransition(state, now)

    case 'reset':
      return createInitialFallbackState(state.originalModel)

    default:
      return state
  }
}

/**
 * 处理错误状态转换
 */
function handleErrorTransition(
  state: FallbackState,
  error: unknown,
  now: number,
): FallbackState {
  const errorClass = classifyError(error)
  const errorMessage = getErrorMessage(error)

  // 将当前模型添加到失败列表
  const failedModels = [...state.failedModels]
  if (!failedModels.includes(state.currentModel)) {
    failedModels.push(state.currentModel)
  }

  // 更新状态
  const newAttemptCount = state.attemptCount + 1
  const newStatus = determineStatusAfterError(state, errorClass, newAttemptCount)

  return {
    ...state,
    failedModels,
    lastErrorTime: now,
    lastErrorClass: errorClass,
    lastErrorMessage: errorMessage,
    attemptCount: newAttemptCount,
    status: newStatus,
  }
}

/**
 * 根据错误类型确定新状态
 */
function determineStatusAfterError(
  state: FallbackState,
  errorClass: FallbackErrorClass,
  attemptCount: number,
): FallbackStateStatus {
  // 配额或 Key 错误直接进入 exhausted 状态
  if (errorClass === 'quota_exceeded' || errorClass === 'missing_api_key') {
    return 'exhausted'
  }

  // 达到最大尝试次数
  if (attemptCount >= DEFAULT_RUNTIME_FALLBACK_CONFIG.max_fallback_attempts!) {
    return 'exhausted'
  }

  // 其他情况保持 active
  return 'active'
}

/**
 * 处理成功状态转换
 */
function handleSuccessTransition(state: FallbackState): FallbackState {
  // 成功后重置状态，但保留原始模型信息
  return {
    ...createInitialFallbackState(state.originalModel),
    // 如果使用的是回退模型成功，标记为已使用回退
    currentModel: state.currentModel,
    status: state.currentModel !== state.originalModel ? 'cooldown' : 'idle',
  }
}

/**
 * 处理超时状态转换
 */
function handleTimeoutTransition(state: FallbackState, now: number): FallbackState {
  const failedModels = [...state.failedModels]
  if (!failedModels.includes(state.currentModel)) {
    failedModels.push(state.currentModel)
  }

  const newAttemptCount = state.attemptCount + 1
  const newStatus = newAttemptCount >= DEFAULT_RUNTIME_FALLBACK_CONFIG.max_fallback_attempts!
    ? 'exhausted'
    : 'active'

  return {
    ...state,
    failedModels,
    lastErrorTime: now,
    lastErrorClass: 'timeout',
    lastErrorMessage: 'Request timed out',
    attemptCount: newAttemptCount,
    status: newStatus,
  }
}

// ========== Cooldown Mechanism ==========

/**
 * 检查是否在冷却期内
 */
export function isInCooldown(
  state: FallbackState,
  config: RuntimeFallbackConfig = DEFAULT_RUNTIME_FALLBACK_CONFIG,
): boolean {
  if (state.status !== 'cooldown') return false

  const cooldownMs = (config.cooldown_seconds ?? DEFAULT_RUNTIME_FALLBACK_CONFIG.cooldown_seconds!) * 1000
  const elapsed = Date.now() - state.lastErrorTime

  return elapsed < cooldownMs
}

/**
 * 计算剩余冷却时间（秒）
 */
export function getRemainingCooldownSeconds(
  state: FallbackState,
  config: RuntimeFallbackConfig = DEFAULT_RUNTIME_FALLBACK_CONFIG,
): number {
  if (state.status !== 'cooldown') return 0

  const cooldownMs = (config.cooldown_seconds ?? DEFAULT_RUNTIME_FALLBACK_CONFIG.cooldown_seconds!) * 1000
  const elapsed = Date.now() - state.lastErrorTime
  const remainingMs = cooldownMs - elapsed

  return Math.max(0, Math.ceil(remainingMs / 1000))
}

/**
 * 检查会话是否超时
 */
export function isSessionTimeout(
  state: FallbackState,
  config: RuntimeFallbackConfig = DEFAULT_RUNTIME_FALLBACK_CONFIG,
): boolean {
  const timeoutSeconds = config.timeout_seconds ?? DEFAULT_RUNTIME_FALLBACK_CONFIG.timeout_seconds!
  if (timeoutSeconds === 0) return false

  const timeoutMs = timeoutSeconds * 1000
  const elapsed = Date.now() - state.sessionStartTime

  return elapsed >= timeoutMs
}

// ========== Fallback Decision Logic ==========

/**
 * 判断是否应该触发回退
 */
export function shouldTriggerFallback(
  state: FallbackState,
  error: unknown,
  config: RuntimeFallbackConfig = DEFAULT_RUNTIME_FALLBACK_CONFIG,
): FallbackDecision {
  // 未启用回退
  if (!config.enabled) {
    return { shouldFallback: false }
  }

  // 已耗尽
  if (state.status === 'exhausted') {
    return {
      shouldFallback: false,
      reason: 'Fallback attempts exhausted',
    }
  }

  // 在冷却期内
  if (isInCooldown(state, config)) {
    const remaining = getRemainingCooldownSeconds(state, config)
    return {
      shouldFallback: false,
      reason: `In cooldown period (${remaining}s remaining)`,
    }
  }

  // 分类错误
  const errorClass = classifyError(error)
  const status = getErrorStatus(error)

  // 检查是否在允许回退的错误列表中
  const retryOnErrorCodes = config.retry_on_errors ?? DEFAULT_RUNTIME_FALLBACK_CONFIG.retry_on_errors!
  const shouldRetryByStatus = status && retryOnErrorCodes.includes(status)

  // 特定的错误类型直接拒绝回退
  if (errorClass === 'missing_api_key') {
    return {
      shouldFallback: false,
      reason: 'API key is missing or invalid - cannot fallback',
      stateUpdate: { status: 'exhausted' },
    }
  }

  // 配额超限可以尝试回退到其他 provider
  if (errorClass === 'quota_exceeded') {
    return {
      shouldFallback: true,
      reason: 'Quota exceeded - switching to alternate provider',
    }
  }

  // 模型不存在可以尝试回退
  if (errorClass === 'model_not_found') {
    return {
      shouldFallback: true,
      reason: 'Model not found - switching to alternate model',
    }
  }

  // 根据状态码判断
  if (shouldRetryByStatus) {
    return {
      shouldFallback: true,
      reason: `Status code ${status} triggers fallback`,
    }
  }

  // 其他错误类型（rate_limited, provider_error, timeout）允许回退
  if (['rate_limited', 'provider_error', 'timeout'].includes(errorClass)) {
    return {
      shouldFallback: true,
      reason: `${errorClass} error triggers fallback`,
    }
  }

  return { shouldFallback: false }
}

// ========== Fallback Model Selection ==========

/**
 * 内置的 Provider 回退链
 * 根据 Provider 类型定义备选模型
 */
const PROVIDER_FALLBACK_CHAINS: Record<ProviderId, string[]> = {
  bigmodel: ['glm-4', 'glm-3-turbo'],
  openai: ['gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-0', 'claude-haiku-4-5'],
  google: ['gemini-2-flash', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat'],
  dashscope: ['qwen-max', 'qwen-plus'],
  ark: ['doubao-pro-32k', 'doubao-lite-32k'],
  hunyuan: ['hunyuan-lite', 'hunyuan-standard'],
  nvidia: ['meta/llama-3.1-8b-instruct', 'mistralai/mistral-7b-instruct'],
  openai_compatible: [],
}

/**
 * 语言槽位默认回退链
 */
const LANGUAGE_SLOT_FALLBACK_CHAIN: string[] = [
  'bigmodel/glm-4',
  'openai/gpt-4o-mini',
  'anthropic/claude-haiku-4-5',
  'google/gemini-2-flash',
]

/**
 * 多模态槽位默认回退链
 */
const MULTIMODAL_SLOT_FALLBACK_CHAIN: string[] = [
  'bigmodel/glm-4v',
  'anthropic/claude-sonnet-4-0',
  'google/gemini-2-flash',
  'openai/gpt-4o-mini',
]

/**
 * 获取下一个回退模型
 */
export function getNextFallbackModel(
  state: FallbackState,
  requirement: FallbackModelRequirement,
  fallbackModels?: string[],
): string | null {
  // 优先使用用户配置的回退链
  if (fallbackModels && fallbackModels.length > 0) {
    return selectNextModelFromChain(state, fallbackModels)
  }

  // 使用槽位默认回退链
  const slotChain = requirement.slot === 'multimodal'
    ? MULTIMODAL_SLOT_FALLBACK_CHAIN
    : LANGUAGE_SLOT_FALLBACK_CHAIN

  // 如果需要视觉能力且在语言槽，切换到多模态链
  const effectiveChain = requirement.requiresVision && requirement.slot === 'language'
    ? MULTIMODAL_SLOT_FALLBACK_CHAIN
    : slotChain

  return selectNextModelFromChain(state, effectiveChain)
}

/**
 * 从回退链中选择下一个可用模型
 */
function selectNextModelFromChain(
  state: FallbackState,
  chain: string[],
): string | null {
  // 从当前索引开始查找
  const startIndex = state.fallbackIndex + 1

  for (let i = startIndex; i < chain.length; i++) {
    const candidateModel = chain[i]
    // 跳过已失败的模型
    if (!state.failedModels.includes(candidateModel)) {
      return candidateModel
    }
  }

  // 如果正序没找到，从头开始再找一次（跳过已失败的）
  for (let i = 0; i < startIndex; i++) {
    const candidateModel = chain[i]
    if (!state.failedModels.includes(candidateModel)) {
      return candidateModel
    }
  }

  return null
}

/**
 * 根据 Provider 获取回退链
 */
export function getFallbackChainForProvider(provider: ProviderId): string[] {
  return PROVIDER_FALLBACK_CHAINS[provider] ?? []
}

// ========== Fallback Manager ==========

/**
 * Fallback 状态管理器
 * 管理多个槽位的回退状态
 */
export class FallbackManager {
  private states: Map<string, FallbackState> = new Map()
  private config: RuntimeFallbackConfig

  constructor(config: RuntimeFallbackConfig = DEFAULT_RUNTIME_FALLBACK_CONFIG) {
    this.config = { ...DEFAULT_RUNTIME_FALLBACK_CONFIG, ...config }
  }

  /**
   * 获取槽位状态
   */
  getState(slot: ModelSlot, modelId: string): FallbackState {
    const key = `${slot}:${modelId}`
    const existing = this.states.get(key)

    if (existing) {
      return existing
    }

    const newState = createInitialFallbackState(modelId)
    this.states.set(key, newState)
    return newState
  }

  /**
   * 更新状态
   */
  updateState(slot: ModelSlot, modelId: string, state: FallbackState): void {
    const key = `${slot}:${modelId}`
    this.states.set(key, state)
  }

  /**
   * 处理错误并决定是否回退
   */
  handleError(
    slot: ModelSlot,
    modelId: string,
    error: unknown,
    requirement: FallbackModelRequirement,
    fallbackModels?: string[],
  ): FallbackDecision {
    const state = this.getState(slot, modelId)
    const decision = shouldTriggerFallback(state, error, this.config)

    if (decision.shouldFallback) {
      const nextModel = getNextFallbackModel(state, requirement, fallbackModels)

      if (nextModel) {
        const newState = transitionFallbackState(state, 'error', error)
        newState.currentModel = nextModel
        newState.fallbackIndex = state.fallbackIndex + 1

        this.updateState(slot, modelId, newState)

        return {
          shouldFallback: true,
          nextModel,
          reason: decision.reason,
          stateUpdate: newState,
        }
      }

      // 没有可用的回退模型
      return {
        shouldFallback: false,
        reason: 'No available fallback models',
        stateUpdate: { status: 'exhausted' },
      }
    }

    // 不应该回退，更新状态
    const newState = transitionFallbackState(state, 'error', error)
    this.updateState(slot, modelId, newState)

    return {
      ...decision,
      stateUpdate: newState,
    }
  }

  /**
   * 处理成功响应
   */
  handleSuccess(slot: ModelSlot, modelId: string): void {
    const state = this.getState(slot, modelId)
    const newState = transitionFallbackState(state, 'success')
    this.updateState(slot, modelId, newState)
  }

  /**
   * 重置状态
   */
  reset(slot: ModelSlot, modelId: string): void {
    const state = this.getState(slot, modelId)
    const newState = transitionFallbackState(state, 'reset')
    this.updateState(slot, modelId, newState)
  }

  /**
   * 清理过期状态
   */
  cleanupExpiredStates(maxAgeMs: number = 3600000): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    const entries = Array.from(this.states.entries())
    for (const [key, state] of entries) {
      const age = now - state.sessionStartTime
      if (age > maxAgeMs) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.states.delete(key)
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): RuntimeFallbackConfig {
    return this.config
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RuntimeFallbackConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ========== Export Testing Helpers ==========

export const __testing = {
  classifyError,
  getErrorStatus,
  getErrorMessage,
  isInCooldown,
  getRemainingCooldownSeconds,
  isSessionTimeout,
  selectNextModelFromChain,
  PROVIDER_FALLBACK_CHAINS,
  LANGUAGE_SLOT_FALLBACK_CHAIN,
  MULTIMODAL_SLOT_FALLBACK_CHAIN,
}