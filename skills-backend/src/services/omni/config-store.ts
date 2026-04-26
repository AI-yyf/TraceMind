import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, unlink, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { prisma } from '../../lib/prisma'
import { logger } from '../../utils/logger'
import { defaultBaseUrlForProvider, inferCapabilities, MODEL_PRESETS, PROVIDER_CATALOG } from './catalog'
import { SecureStorage, type EncryptedSecretPayload } from './secure-storage'
import type { ProviderId, OmniTask, ResearchRoleId } from '../../../shared/model-config'
import {
  listVersionedSystemConfigHistory,
  readVersionedSystemConfig,
  writeVersionedSystemConfig,
  type VersionedSystemConfigHistoryEntry,
  type VersionedSystemConfigMeta,
} from '../system-config-journal'
import {
  DEFAULT_TASK_ROUTING,
  RESEARCH_ROLE_DEFINITIONS,
  RESEARCH_ROLE_IDS,
  preferredSlotForRole,
  resolveTaskRouteTarget,
} from './routing'
import type {
  ModelSlot,
  ProviderCapability,
  ProviderModelConfig,
  ProviderModelOptions,
  ProviderModelRef,
  SanitizedProviderModelConfig,
  SanitizedUserModelConfig,
  TaskRouteTarget,
  UserModelConfig,
  CategoriesConfig,
} from './types'

// ========== Async Mutex Implementation for File Locking ==========

class AsyncMutex {
  private locked = false
  private queue: Array<{ resolve: () => void; reject: (err: Error) => void }> = []

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject })
    })
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next.resolve()
    } else {
      this.locked = false
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

// Config-specific mutex instances
const userConfigMutexes = new Map<string, AsyncMutex>()

function getUserConfigMutex(userId: string): AsyncMutex {
  if (!userConfigMutexes.has(userId)) {
    userConfigMutexes.set(userId, new AsyncMutex())
  }
  return userConfigMutexes.get(userId)!
}

// ========== Backup Mechanism ==========

const BACKUP_DIR = join(process.cwd(), 'data', 'config-backups')
const MAX_BACKUP_FILES = 8

async function ensureBackupDir(): Promise<void> {
  try {
    await mkdir(BACKUP_DIR, { recursive: true })
  } catch {
    // Directory already exists
  }
}

async function createConfigBackup(userId: string, config: UserModelConfig): Promise<string> {
  await ensureBackupDir()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(BACKUP_DIR, `user-config-${userId}-${timestamp}.bak`)
  await writeFile(backupPath, JSON.stringify(config, null, 2), 'utf-8')

  // Cleanup old backups beyond the limit
  try {
    const files = await readdir(BACKUP_DIR)
    const backupFiles = files.filter(f => f.startsWith(`user-config-${userId}`)).sort()
    if (backupFiles.length > MAX_BACKUP_FILES) {
      const toDelete = backupFiles.slice(0, backupFiles.length - MAX_BACKUP_FILES)
      for (const file of toDelete) {
        await unlink(join(BACKUP_DIR, file))
      }
    }
  } catch {
    // Ignore cleanup errors
  }

  return backupPath
}

async function restoreFromBackup(userId: string): Promise<UserModelConfig | null> {
  try {
    const backupPattern = `user-config-${userId}`
    const files = await readdir(BACKUP_DIR)
    const matchingFiles = files.filter(f => f.startsWith(backupPattern)).sort().reverse()

    if (matchingFiles.length === 0) return null

    const latestBackup = matchingFiles[0]
    const content = await readFile(join(BACKUP_DIR, latestBackup), 'utf-8')
    return JSON.parse(content) as UserModelConfig
  } catch (error) {
    logger.warn('Failed to restore from backup', { userId, error })
    return null
  }
}

// ========== Model Config History Table Operations ==========

interface ModelConfigHistoryRecord {
  id: string
  version: number
  configJson: string
  actor: string | null
  diffSummary: string | null
  createdAt: Date
}

async function getNextConfigVersion(): Promise<number> {
  const latest = await prisma.model_config_history.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  return (latest?.version ?? 0) + 1
}

async function writeModelConfigHistory(
  config: UserModelConfig,
  actor: string | null,
  diffSummary: string | null,
): Promise<ModelConfigHistoryRecord> {
  const version = await getNextConfigVersion()
  const record = await prisma.model_config_history.create({
    data: {
      id: randomUUID(),
      version,
      configJson: JSON.stringify(config),
      actor,
      diffSummary,
    },
  })
  return record
}

async function listModelConfigHistory(limit: number = 12): Promise<ModelConfigHistoryRecord[]> {
  return prisma.model_config_history.findMany({
    orderBy: { version: 'desc' },
    take: limit,
  })
}

async function getModelConfigByVersion(version: number): Promise<UserModelConfig | null> {
  const record = await prisma.model_config_history.findUnique({
    where: { version },
  })
  if (!record) return null
  return JSON.parse(record.configJson) as UserModelConfig
}

function computeDiffSummary(previous: UserModelConfig | null, next: UserModelConfig): string {
  const changes: string[] = []

  if (previous?.language?.provider !== next.language?.provider) {
    changes.push(`language.provider: ${previous?.language?.provider ?? 'none'} → ${next.language?.provider ?? 'none'}`)
  }
  if (previous?.language?.model !== next.language?.model) {
    changes.push(`language.model: ${previous?.language?.model ?? 'none'} → ${next.language?.model ?? 'none'}`)
  }
  if (previous?.multimodal?.provider !== next.multimodal?.provider) {
    changes.push(`multimodal.provider: ${previous?.multimodal?.provider ?? 'none'} → ${next.multimodal?.provider ?? 'none'}`)
  }
  if (previous?.multimodal?.model !== next.multimodal?.model) {
    changes.push(`multimodal.model: ${previous?.multimodal?.model ?? 'none'} → ${next.multimodal?.model ?? 'none'}`)
  }

  const prevRoleKeys = previous?.roles ? Object.keys(previous.roles) : []
  const nextRoleKeys = next.roles ? Object.keys(next.roles) : []
  if (prevRoleKeys.length !== nextRoleKeys.length || !prevRoleKeys.every(k => nextRoleKeys.includes(k))) {
    changes.push(`roles: ${prevRoleKeys.length} → ${nextRoleKeys.length}`)
  }

  return changes.length > 0 ? changes.join('; ') : 'no significant changes'
}

const DEFAULT_USER_ID = 'default'
const USER_MODEL_CONFIG_PREFIX = 'alpha:user-model-config:'
const SECRET_PREFIX = 'alpha:secret:model-api-key:'
const DEFAULT_ENV_PREFIX = 'OMNI_DEFAULT'
const SLOT_ENV_PREFIX: Record<ModelSlot, string> = {
  language: 'OMNI_LANGUAGE',
  multimodal: 'OMNI_MULTIMODAL',
}
const secretRecordCache = new Map<string, { rawValue: string; resolved: { key: string; preview: string } | null }>()

type SecretRecord = EncryptedSecretPayload & {
  provider: string
  updatedAt: string
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export interface ResolvedProviderModelConfig extends ProviderModelConfig {
  apiKey?: string
  apiKeyPreview?: string
}

export interface ResolvedUserModelConfig {
  language: ResolvedProviderModelConfig | null
  multimodal: ResolvedProviderModelConfig | null
  roles?: Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>>
  taskOverrides?: Partial<Record<OmniTask, ProviderModelRef>>
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>
  categories?: CategoriesConfig
  disabledCategories?: string[]
}

export interface UserModelConfigRecord {
  config: SanitizedUserModelConfig
  meta: VersionedSystemConfigMeta
  history: VersionedSystemConfigHistoryEntry[]
}

function userConfigKey(userId: string) {
  return `${USER_MODEL_CONFIG_PREFIX}${userId}`
}

function secretKey(secretRef: string) {
  return `${SECRET_PREFIX}${secretRef}`
}

function providerAuthEnvVars(provider: string) {
  return PROVIDER_CATALOG.find((entry) => entry.provider === provider)?.providerAuthEnvVars ?? []
}

function orderedProviderAuthEnvVars(
  provider: string,
  context?: { model?: string | null; baseUrl?: string | null },
) {
  const defaults = providerAuthEnvVars(provider)
  if (provider !== 'openai_compatible') {
    return defaults
  }

  const haystack = `${context?.model ?? ''} ${context?.baseUrl ?? ''}`.toLowerCase()
  const preferred: string[] = []

  if (/(?:kimi|moonshot|1seey\.com)/iu.test(haystack)) {
    preferred.push('MOONSHOT_API_KEY')
  }
  if (/(?:openrouter)/iu.test(haystack)) {
    preferred.push('OPENROUTER_API_KEY')
  }
  if (/(?:dashscope|aliyuncs|qwen)/iu.test(haystack)) {
    preferred.push('DASHSCOPE_API_KEY')
  }
  if (/(?:deepseek)/iu.test(haystack)) {
    preferred.push('DEEPSEEK_API_KEY')
  }
  if (/(?:openai)/iu.test(haystack)) {
    preferred.push('OPENAI_API_KEY')
  }

  return Array.from(new Set([...preferred, ...defaults]))
}

function getDefaultEnvValue(key: string) {
  const value = process.env[`${DEFAULT_ENV_PREFIX}_${key}`]?.trim()
  return value ? value : undefined
}

function slotEnvPrefix(slot: ModelSlot) {
  return SLOT_ENV_PREFIX[slot]
}

function getSlotEnvValue(slot: ModelSlot, key: string) {
  const value = process.env[`${slotEnvPrefix(slot)}_${key}`]?.trim()
  if (value) return value
  return getDefaultEnvValue(key)
}

function roleEnvPrefix(role: ResearchRoleId) {
  return `OMNI_ROLE_${role.toUpperCase()}`
}

function getRoleEnvValue(role: ResearchRoleId, key: string) {
  const value = process.env[`${roleEnvPrefix(role)}_${key}`]?.trim()
  if (value) return value
  return getSlotEnvValue(preferredSlotForRole(role), key)
}

function hasRoleEnvOverride(role: ResearchRoleId) {
  const prefix = `${roleEnvPrefix(role)}_`

  return Object.entries(process.env).some(
    ([key, value]) => key.startsWith(prefix) && typeof value === 'string' && value.trim().length > 0,
  )
}

function normalizeProviderId(value?: string | null): ProviderId | null {
  if (!value) return null
  const provider = value.trim()
  if (!provider) return null
  return PROVIDER_CATALOG.some((entry) => entry.provider === provider)
    ? (provider as ProviderId)
    : null
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`
}

function sanitizeProviderOptionValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => sanitizeProviderOptionValue(item))
      .filter((item) => item !== undefined)
    return items.length > 0 ? items : undefined
  }

  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key.trim(), sanitizeProviderOptionValue(nested)] as const)
      .filter(([key, nested]) => key.length > 0 && nested !== undefined),
  )

  return Object.keys(record).length > 0 ? record : undefined
}

function normalizeProviderOptions(options?: Record<string, unknown> | null) {
  if (!options || typeof options !== 'object') return undefined
  const sanitized = sanitizeProviderOptionValue(options)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return undefined
  }
  return sanitized as Record<string, unknown>
}

function parseJsonObjectEnv(value?: string) {
  if (!value) return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Ignore invalid env JSON and fall back to the remaining config.
  }

  return undefined
}

function parseNumberEnv(value?: string) {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseEnumEnv<T extends string>(value: string | undefined, allowed: readonly T[]) {
  if (!value) return undefined
  return allowed.includes(value as T) ? (value as T) : undefined
}

function normalizeSlotConfig(config?: ProviderModelConfig | null): ProviderModelConfig | null {
  if (!config?.provider || !config.model) return null

  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl?.trim() || defaultBaseUrlForProvider(config.provider),
    apiKeyRef: config.apiKeyRef?.trim() || undefined,
    apiKey: config.apiKey?.trim() || undefined,
    providerOptions: normalizeProviderOptions(config.providerOptions),
    options: {
      thinking: config.options?.thinking ?? 'auto',
      citations: config.options?.citations ?? 'backend',
      parser: config.options?.parser ?? 'backend',
      temperature: config.options?.temperature,
      maxTokens: config.options?.maxTokens,
    },
  }
}

function normalizeRoleConfigs(
  roles?: Partial<Record<ResearchRoleId, ProviderModelConfig | null>>,
): Partial<Record<ResearchRoleId, ProviderModelConfig | null>> | undefined {
  if (!roles) return undefined

  const entries = Object.entries(roles)
    .map(([role, config]) => [role as ResearchRoleId, normalizeSlotConfig(config)] as const)
    .filter(([role, config]) => RESEARCH_ROLE_IDS.includes(role) && Boolean(config))

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeTaskRouting(
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>,
): Partial<Record<OmniTask, TaskRouteTarget>> | undefined {
  if (!taskRouting) return undefined

  const entries = Object.entries(taskRouting).filter(
    ([task, target]) => Boolean(DEFAULT_TASK_ROUTING[task as OmniTask]) && Boolean(target),
  ) as Array<[OmniTask, TaskRouteTarget]>

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function sanitizeSlotConfig(config: ResolvedProviderModelConfig | null): SanitizedProviderModelConfig | null {
  if (!config) return null

  const persistedSecretPreview =
    config.apiKeyRef && config.apiKey
      ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}`
      : undefined

  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyRef: config.apiKeyRef,
    apiKeyStatus: config.apiKey ? 'configured' : 'missing',
    apiKeyPreview: persistedSecretPreview ?? config.apiKeyPreview,
    providerOptions: normalizeProviderOptions(config.providerOptions),
    options: config.options,
  }
}

function sanitizeRoleConfigs(
  roles?: Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>>,
): Partial<Record<ResearchRoleId, SanitizedProviderModelConfig | null>> | undefined {
  if (!roles) return undefined

  const entries = Object.entries(roles)
    .map(([role, config]) => [role as ResearchRoleId, sanitizeSlotConfig(config ?? null)] as const)
    .filter(([, config]) => Boolean(config))

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function mergeResolvedOptions(
  base?: ProviderModelOptions | null,
  override?: ProviderModelOptions | null,
): ProviderModelOptions | undefined {
  const merged: ProviderModelOptions = {
    thinking: override?.thinking ?? base?.thinking,
    citations: override?.citations ?? base?.citations,
    parser: override?.parser ?? base?.parser,
    temperature: override?.temperature ?? base?.temperature,
    maxTokens: override?.maxTokens ?? base?.maxTokens,
  }

  return Object.values(merged).some((value) => value !== undefined) ? merged : undefined
}

function inheritResolvedRoleConfig(
  roleConfig: ResolvedProviderModelConfig | null,
  fallbackSlotConfig: ResolvedProviderModelConfig | null,
) {
  if (!roleConfig) return null
  if (!fallbackSlotConfig) return roleConfig
  if (roleConfig.provider !== fallbackSlotConfig.provider) return roleConfig

  const inheritsFallbackSecret = !roleConfig.apiKeyRef

  return {
    provider: roleConfig.provider,
    model: roleConfig.model,
    baseUrl: roleConfig.baseUrl?.trim() || fallbackSlotConfig.baseUrl,
    apiKeyRef: roleConfig.apiKeyRef ?? fallbackSlotConfig.apiKeyRef,
    // Role entries that only override model/options should inherit the slot secret
    // instead of replacing it with a generic provider env key discovered at hydrate time.
    apiKey: inheritsFallbackSecret ? fallbackSlotConfig.apiKey ?? roleConfig.apiKey : roleConfig.apiKey,
    apiKeyPreview: inheritsFallbackSecret
      ? fallbackSlotConfig.apiKeyPreview ?? roleConfig.apiKeyPreview
      : roleConfig.apiKeyPreview,
    providerOptions: normalizeProviderOptions({
      ...(fallbackSlotConfig.providerOptions ?? {}),
      ...(roleConfig.providerOptions ?? {}),
    }),
    options: mergeResolvedOptions(fallbackSlotConfig.options, roleConfig.options),
  } satisfies ResolvedProviderModelConfig
}

async function getRawUserConfig(userId: string): Promise<UserModelConfig | null> {
  const record = await readVersionedSystemConfig<UserModelConfig | null>({
    key: userConfigKey(userId),
    parse: (value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as UserModelConfig)
        : null,
    fallback: null,
  })

  return record.value
}

async function getSecret(secretRef?: string): Promise<{ key: string; preview: string } | null> {
  if (!secretRef) return null

  const record = await prisma.system_configs.findUnique({
    where: { key: secretKey(secretRef) },
  })
  if (!record) return null

  const cached = secretRecordCache.get(secretRef)
  if (cached?.rawValue === record.value) {
    return cached.resolved
  }

  try {
    const parsed = JSON.parse(record.value) as SecretRecord
    const resolved = {
      key: SecureStorage.decrypt(parsed),
      preview: parsed.preview,
    }
    secretRecordCache.set(secretRef, {
      rawValue: record.value,
      resolved,
    })
    return resolved
  } catch (error) {
    logger.warn('Model secret could not be decrypted; falling back to an unconfigured slot.', {
      secretRef,
      error: error instanceof Error ? error.message : String(error),
    })
    secretRecordCache.set(secretRef, {
      rawValue: record.value,
      resolved: null,
    })
    return null
  }
}

function getEnvSecret(
  provider: string,
  context?: { model?: string | null; baseUrl?: string | null },
): { key: string; preview: string } | null {
  for (const envVar of orderedProviderAuthEnvVars(provider, context)) {
    const value = process.env[envVar]?.trim()
    if (!value) continue

    return {
      key: value,
      preview: `${envVar} (env)`,
    }
  }

  return null
}

function getSlotEnvSecret(slot: ModelSlot): { key: string; preview: string } | null {
  const envVar = `${slotEnvPrefix(slot)}_API_KEY`
  const value = process.env[envVar]?.trim()
  if (value) {
    return {
      key: value,
      preview: `${envVar} (env)`,
    }
  }

  return null
}

function getDefaultEnvSecret(): { key: string; preview: string } | null {
  const defaultEnvVar = `${DEFAULT_ENV_PREFIX}_API_KEY`
  const defaultValue = process.env[defaultEnvVar]?.trim()
  if (!defaultValue) return null
  return {
    key: defaultValue,
    preview: `${defaultEnvVar} (env)`,
  }
}

function getRoleEnvSecret(role: ResearchRoleId): { key: string; preview: string } | null {
  const envVar = `${roleEnvPrefix(role)}_API_KEY`
  const value = process.env[envVar]?.trim()
  if (!value) return getSlotEnvSecret(preferredSlotForRole(role))

  return {
    key: value,
    preview: `${envVar} (env)`,
  }
}

function buildEnvProviderOptions(getValue: (key: string) => string | undefined) {
  const merged = {
    ...(parseJsonObjectEnv(getValue('PROVIDER_OPTIONS_JSON')) ?? {}),
  }

  const headers = parseJsonObjectEnv(getValue('HEADERS_JSON'))
  if (headers) merged.headers = headers

  const query = parseJsonObjectEnv(getValue('QUERY_JSON'))
  if (query) merged.query = query

  const body = parseJsonObjectEnv(getValue('BODY_JSON'))
  if (body) merged.body = body

  const appId = getValue('APP_ID')
  if (appId) merged.appId = appId

  const topicGenerationMode = getValue('TOPIC_GENERATION_MODE')
  if (topicGenerationMode) merged.topicGenerationMode = topicGenerationMode

  return normalizeProviderOptions(merged)
}

function buildSlotEnvProviderOptions(slot: ModelSlot) {
  return buildEnvProviderOptions((key) => getSlotEnvValue(slot, key))
}

function buildRoleEnvProviderOptions(role: ResearchRoleId) {
  return buildEnvProviderOptions((key) => getRoleEnvValue(role, key))
}

function buildEnvOptions(getValue: (key: string) => string | undefined): ProviderModelOptions {
  return {
    thinking: parseEnumEnv(getValue('THINKING'), ['on', 'off', 'auto']) ?? 'auto',
    citations: parseEnumEnv(getValue('CITATIONS'), ['native', 'backend']) ?? 'backend',
    parser: parseEnumEnv(getValue('PARSER'), ['native', 'backend']) ?? 'backend',
    temperature: parseNumberEnv(getValue('TEMPERATURE')),
    maxTokens: parseNumberEnv(getValue('MAX_TOKENS')),
  }
}

function buildSlotEnvOptions(slot: ModelSlot): ProviderModelOptions {
  return buildEnvOptions((key) => getSlotEnvValue(slot, key))
}

function buildRoleEnvOptions(role: ResearchRoleId): ProviderModelOptions {
  return buildEnvOptions((key) => getRoleEnvValue(role, key))
}

function getEnvBootstrapConfig(args: {
  getValue: (key: string) => string | undefined
  getSecret: () => { key: string; preview: string } | null
  buildProviderOptions: () => Record<string, unknown> | undefined
  buildOptions: () => ProviderModelOptions
}): ResolvedProviderModelConfig | null {
  const model = args.getValue('MODEL')
  const baseUrl = args.getValue('BASE_URL')
  const provider =
    normalizeProviderId(args.getValue('PROVIDER')) ??
    (model && baseUrl ? 'openai_compatible' : null)

  if (!provider || !model) return null

  const localSecret = args.getSecret()
  const providerSecret = !localSecret ? getEnvSecret(provider, { model, baseUrl }) : null
  const defaultSecret = !localSecret && !providerSecret ? getDefaultEnvSecret() : null

  return {
    provider,
    model,
    baseUrl: baseUrl || defaultBaseUrlForProvider(provider),
    apiKey: localSecret?.key ?? providerSecret?.key ?? defaultSecret?.key,
    apiKeyPreview: localSecret?.preview ?? providerSecret?.preview ?? defaultSecret?.preview,
    providerOptions: args.buildProviderOptions(),
    options: args.buildOptions(),
  }
}

function getEnvBootstrapSlot(slot: ModelSlot): ResolvedProviderModelConfig | null {
  return getEnvBootstrapConfig({
    getValue: (key) => getSlotEnvValue(slot, key),
    getSecret: () => getSlotEnvSecret(slot),
    buildProviderOptions: () => buildSlotEnvProviderOptions(slot),
    buildOptions: () => buildSlotEnvOptions(slot),
  })
}

function getEnvBootstrapRole(role: ResearchRoleId): ResolvedProviderModelConfig | null {
  if (!hasRoleEnvOverride(role)) return null

  return getEnvBootstrapConfig({
    getValue: (key) => getRoleEnvValue(role, key),
    getSecret: () => getRoleEnvSecret(role),
    buildProviderOptions: () => buildRoleEnvProviderOptions(role),
    buildOptions: () => buildRoleEnvOptions(role),
  })
}

async function storeSecret(provider: string, apiKey: string): Promise<{ apiKeyRef: string; preview: string }> {
  const apiKeyRef = randomUUID()
  const encrypted = SecureStorage.encrypt(apiKey)

  const payload: SecretRecord = {
    ...encrypted,
    provider,
    updatedAt: new Date().toISOString(),
  }

await prisma.system_configs.upsert({
    where: { key: secretKey(apiKeyRef) },
    update: { value: JSON.stringify(payload), updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: secretKey(apiKeyRef), value: JSON.stringify(payload), updatedAt: new Date() },
  })
  secretRecordCache.delete(apiKeyRef)

  return { apiKeyRef, preview: encrypted.preview }
}

function normalizeOverrides(
  taskOverrides?: Partial<Record<OmniTask, ProviderModelRef>>,
): Partial<Record<OmniTask, ProviderModelRef>> | undefined {
  if (!taskOverrides) return undefined
  const entries = Object.entries(taskOverrides).filter(
    ([, value]) => Boolean(value?.provider) && Boolean(value?.model),
  ) as Array<[OmniTask, ProviderModelRef]>

  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

async function hydrateSlot(
  config: ProviderModelConfig,
  slot?: ModelSlot,
): Promise<ResolvedProviderModelConfig> {
  const secret = await getSecret(config.apiKeyRef)
  const slotEnvSecret = !secret && slot ? getSlotEnvSecret(slot) : null
  const envSecret =
    !secret && !slotEnvSecret
      ? getEnvSecret(config.provider, { model: config.model, baseUrl: config.baseUrl })
      : null
  const defaultEnvSecret =
    !secret && !slotEnvSecret && !envSecret
      ? getDefaultEnvSecret()
      : null
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl?.trim() || defaultBaseUrlForProvider(config.provider),
    apiKeyRef: config.apiKeyRef,
    apiKey: secret?.key ?? slotEnvSecret?.key ?? envSecret?.key ?? defaultEnvSecret?.key,
    apiKeyPreview:
      secret?.preview ?? slotEnvSecret?.preview ?? envSecret?.preview ?? defaultEnvSecret?.preview,
    providerOptions: normalizeProviderOptions(config.providerOptions),
    options: config.options,
  }
}

async function resolveSlotForSave(
  incoming: ProviderModelConfig | null,
  existing: ResolvedProviderModelConfig | null,
  options?: { preserveMissingBaseUrl?: boolean },
): Promise<ResolvedProviderModelConfig | null> {
  if (!incoming) return null

  const canReuseExistingSecret =
    Boolean(existing?.apiKeyRef) &&
    existing?.provider === incoming.provider &&
    (!incoming.apiKeyRef || incoming.apiKeyRef === existing.apiKeyRef)

  let apiKeyRef = incoming.apiKeyRef ?? (canReuseExistingSecret ? existing?.apiKeyRef : undefined)
  let apiKey = canReuseExistingSecret ? existing?.apiKey : undefined
  let apiKeyPreview = canReuseExistingSecret ? existing?.apiKeyPreview : undefined

  if (incoming.apiKey) {
    const storedSecret = await storeSecret(incoming.provider, incoming.apiKey)
    apiKeyRef = storedSecret.apiKeyRef
    apiKey = incoming.apiKey
    apiKeyPreview = storedSecret.preview
  } else if (apiKeyRef) {
    const secret = await getSecret(apiKeyRef)
    apiKey = secret?.key
    apiKeyPreview = secret?.preview
  }

  return {
    provider: incoming.provider,
    model: incoming.model,
    baseUrl: incoming.baseUrl?.trim() || (options?.preserveMissingBaseUrl ? undefined : defaultBaseUrlForProvider(incoming.provider)),
    apiKeyRef,
    apiKey,
    apiKeyPreview,
    providerOptions: normalizeProviderOptions(incoming.providerOptions),
    options: incoming.options,
  }
}

async function resolveRoleConfigsForSave(
  incoming: Partial<Record<ResearchRoleId, ProviderModelConfig | null>> | undefined,
  existing: Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>> | undefined,
) {
  if (!incoming) return existing

  const entries = await Promise.all(
    RESEARCH_ROLE_DEFINITIONS.map(async (definition) => {
      if (!hasOwn(incoming, definition.id)) {
        return [definition.id, existing?.[definition.id] ?? null] as const
      }

      const next = await resolveSlotForSave(
        normalizeSlotConfig(incoming[definition.id]),
        existing?.[definition.id] ?? null,
        { preserveMissingBaseUrl: true },
      )

      return [definition.id, next] as const
    }),
  )

  const activeEntries = entries.filter(([, config]) => Boolean(config))
  return activeEntries.length > 0
    ? (Object.fromEntries(activeEntries) as Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>>)
    : undefined
}

function serializeResolvedConfig(
  config: ResolvedProviderModelConfig | null,
): ProviderModelConfig | null {
  if (!config) return null

  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKeyRef: config.apiKeyRef,
    providerOptions: normalizeProviderOptions(config.providerOptions),
    options: config.options,
  }
}

export async function getResolvedUserModelConfig(userId = DEFAULT_USER_ID): Promise<ResolvedUserModelConfig> {
  const raw = await getRawUserConfig(userId)
  const languageInput = normalizeSlotConfig(raw?.language)
  const multimodalInput = normalizeSlotConfig(raw?.multimodal)
  const envLanguage = getEnvBootstrapSlot('language')
  const envMultimodal = getEnvBootstrapSlot('multimodal')
  const language = languageInput ? await hydrateSlot(languageInput, 'language') : envLanguage
  const multimodal = multimodalInput ? await hydrateSlot(multimodalInput, 'multimodal') : envMultimodal
  const roleInputs = normalizeRoleConfigs(raw?.roles)
  const roleEntries = await Promise.all(
    RESEARCH_ROLE_DEFINITIONS.map(async (definition) => {
      const roleInput = roleInputs?.[definition.id]
      const fallbackSlotConfig = definition.preferredSlot === 'multimodal' ? multimodal : language
      const hydrated = roleInput
        ? inheritResolvedRoleConfig(await hydrateSlot(roleInput), fallbackSlotConfig)
        : getEnvBootstrapRole(definition.id)

      return [definition.id, hydrated] as const
    }),
  )
  const roles =
    roleEntries.filter(([, config]) => Boolean(config)).length > 0
      ? (Object.fromEntries(
          roleEntries.filter(([, config]) => Boolean(config)),
        ) as Partial<Record<ResearchRoleId, ResolvedProviderModelConfig | null>>)
      : undefined

  return {
    language,
    multimodal,
    roles,
    taskOverrides: normalizeOverrides(raw?.taskOverrides),
    taskRouting: normalizeTaskRouting(raw?.taskRouting),
    categories: raw?.categories,
    disabledCategories: raw?.disabledCategories,
  }
}

export async function getSanitizedUserModelConfig(userId = DEFAULT_USER_ID): Promise<SanitizedUserModelConfig> {
  const resolved = await getResolvedUserModelConfig(userId)
  return {
    language: sanitizeSlotConfig(resolved.language),
    multimodal: sanitizeSlotConfig(resolved.multimodal),
    roles: sanitizeRoleConfigs(resolved.roles),
    taskOverrides: resolved.taskOverrides,
    taskRouting: resolved.taskRouting,
    categories: resolved.categories,
    disabledCategories: resolved.disabledCategories,
  }
}

export async function getModelConfigFingerprint(userId = DEFAULT_USER_ID) {
  const config = await getSanitizedUserModelConfig(userId)
  return createHash('sha1').update(stableStringify(config)).digest('hex')
}

export async function saveUserModelConfig(
  incomingConfig: UserModelConfig,
  userId = DEFAULT_USER_ID,
): Promise<SanitizedUserModelConfig> {
  const mutex = getUserConfigMutex(userId)

  return mutex.runExclusive(async () => {
    const existing = await getResolvedUserModelConfig(userId)
    const previousConfig = await getRawUserConfig(userId)

    const language = hasOwn(incomingConfig, 'language')
      ? await resolveSlotForSave(normalizeSlotConfig(incomingConfig.language), existing.language)
      : existing.language
    const multimodal = hasOwn(incomingConfig, 'multimodal')
      ? await resolveSlotForSave(normalizeSlotConfig(incomingConfig.multimodal), existing.multimodal)
      : existing.multimodal
    const roles = hasOwn(incomingConfig, 'roles')
      ? await resolveRoleConfigsForSave(incomingConfig.roles, existing.roles)
      : existing.roles

    const nextConfig: UserModelConfig = {
      language: serializeResolvedConfig(language),
      multimodal: serializeResolvedConfig(multimodal),
      roles:
        roles && Object.keys(roles).length > 0
          ? Object.fromEntries(
              Object.entries(roles)
                .map(([role, config]) => [role, serializeResolvedConfig(config ?? null)] as const)
                .filter(([, config]) => Boolean(config)),
            ) as Partial<Record<ResearchRoleId, ProviderModelConfig | null>>
          : undefined,
      taskOverrides: normalizeOverrides(incomingConfig.taskOverrides ?? existing.taskOverrides),
      taskRouting: normalizeTaskRouting(incomingConfig.taskRouting ?? existing.taskRouting),
      categories: incomingConfig.categories ?? existing.categories,
      disabledCategories: incomingConfig.disabledCategories ?? existing.disabledCategories,
    }

    // Create backup before critical write
    try {
      await createConfigBackup(userId, nextConfig)
      logger.info('Config backup created', { userId })
    } catch (error) {
      logger.warn('Failed to create config backup', { userId, error })
    }

    // Compute diff summary for history
    const diffSummary = computeDiffSummary(previousConfig, nextConfig)

    // Write to versioned system config
    await writeVersionedSystemConfig({
      key: userConfigKey(userId),
      value: nextConfig,
      parse: (value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as UserModelConfig)
          : null,
      fallback: null,
      source: 'omni.model-config',
      actor: userId,
    })

    // Write to dedicated model_config_history table
    try {
      await writeModelConfigHistory(nextConfig, userId, diffSummary)
      logger.info('Model config history recorded', { userId, diffSummary })
    } catch (error) {
      logger.warn('Failed to write model config history', { userId, error })
    }

    return {
      language: sanitizeSlotConfig(language),
      multimodal: sanitizeSlotConfig(multimodal),
      roles: sanitizeRoleConfigs(roles),
      taskOverrides: nextConfig.taskOverrides,
      taskRouting: nextConfig.taskRouting,
      categories: nextConfig.categories,
      disabledCategories: nextConfig.disabledCategories,
    }
  })
}

export async function getUserModelConfigRecord(userId = DEFAULT_USER_ID): Promise<UserModelConfigRecord> {
  const key = userConfigKey(userId)
  const [config, metaRecord, history] = await Promise.all([
    getSanitizedUserModelConfig(userId),
    readVersionedSystemConfig<UserModelConfig | null>({
      key,
      parse: (value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as UserModelConfig)
          : null,
      fallback: null,
    }),
    listVersionedSystemConfigHistory(key, 12),
  ])

  return {
    config,
    meta: metaRecord.meta,
    history,
  }
}

function configuredCapability(config: ResolvedProviderModelConfig | null): ProviderCapability | null {
  if (!config) return null
  return inferCapabilities(config.provider, config.model)
}

function slotSummary(config: ResolvedProviderModelConfig | null) {
  return {
    configured: Boolean(config),
    provider: config?.provider ?? null,
    model: config?.model ?? null,
    capability: configuredCapability(config),
    apiKeyStatus: config?.apiKey ? 'configured' : 'missing',
  }
}

function resolveEffectiveRoleConfig(
  role: ResearchRoleId,
  config: ResolvedUserModelConfig,
) {
  const direct = config.roles?.[role] ?? null
  if (direct) {
    return {
      source: 'role' as const,
      slot: preferredSlotForRole(role),
      config: direct,
    }
  }

  const fallbackSlot = preferredSlotForRole(role)
  const fallbackConfig = fallbackSlot === 'multimodal' ? config.multimodal : config.language

  return {
    source: fallbackConfig ? (`default-${fallbackSlot}` as const) : ('missing' as const),
    slot: fallbackSlot,
    config: fallbackConfig,
  }
}

export async function getModelCapabilitySummary(userId = DEFAULT_USER_ID) {
  const config = await getResolvedUserModelConfig(userId)
  const roles = Object.fromEntries(
    RESEARCH_ROLE_DEFINITIONS.map((definition) => {
      const effective = resolveEffectiveRoleConfig(definition.id, config)

      return [
        definition.id,
        {
          configured: Boolean(effective.config),
          source: effective.source,
          provider: effective.config?.provider ?? null,
          model: effective.config?.model ?? null,
          capability: configuredCapability(effective.config),
          apiKeyStatus: effective.config?.apiKey ? 'configured' : 'missing',
          preferredSlot: definition.preferredSlot,
          defaultTasks: definition.defaultTasks,
          label: definition.label,
          description: definition.description,
        },
      ]
    }),
  ) as Record<
    ResearchRoleId,
    {
      configured: boolean
      source: 'role' | 'default-language' | 'default-multimodal' | 'missing'
      provider: ProviderId | null
      model: string | null
      capability: ProviderCapability | null
      apiKeyStatus: 'configured' | 'missing'
      preferredSlot: ModelSlot
      defaultTasks: OmniTask[]
      label: string
      description: string
    }
  >

  const routing = Object.fromEntries(
    Object.entries(DEFAULT_TASK_ROUTING).map(([task, defaultTarget]) => {
      const taskId = task as OmniTask
      return [
        taskId,
        {
          target: resolveTaskRouteTarget(taskId, config.taskRouting?.[taskId] ?? null),
          defaultTarget,
        },
      ]
    }),
  ) as Record<OmniTask, { target: TaskRouteTarget; defaultTarget: TaskRouteTarget }>

  return {
    userId,
    slots: {
      language: slotSummary(config.language),
      multimodal: slotSummary(config.multimodal),
    },
    roles,
    routing,
    roleDefinitions: RESEARCH_ROLE_DEFINITIONS,
    catalog: PROVIDER_CATALOG,
    presets: MODEL_PRESETS,
  }
}

// ========== Exported Model Config History API ==========

export interface ModelConfigHistoryEntry {
  version: number
  config: UserModelConfig
  actor: string | null
  diffSummary: string | null
  createdAt: string
}

export async function listConfigVersionHistory(limit: number = 12): Promise<ModelConfigHistoryEntry[]> {
  const records = await listModelConfigHistory(limit)
  return records.map((r) => ({
    version: r.version,
    config: JSON.parse(r.configJson) as UserModelConfig,
    actor: r.actor,
    diffSummary: r.diffSummary,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function getConfigByVersion(version: number): Promise<ModelConfigHistoryEntry | null> {
  const config = await getModelConfigByVersion(version)
  if (!config) return null

  const record = await prisma.model_config_history.findUnique({
    where: { version },
  })

  if (!record) return null

  return {
    version: record.version,
    config,
    actor: record.actor,
    diffSummary: record.diffSummary,
    createdAt: record.createdAt.toISOString(),
  }
}

export async function rollbackConfigToVersion(version: number, userId: string = DEFAULT_USER_ID): Promise<SanitizedUserModelConfig | null> {
  const historicalConfig = await getModelConfigByVersion(version)
  if (!historicalConfig) return null

  return saveUserModelConfig(historicalConfig, userId)
}

export async function restoreConfigFromBackup(userId: string = DEFAULT_USER_ID): Promise<SanitizedUserModelConfig | null> {
  const backupConfig = await restoreFromBackup(userId)
  if (!backupConfig) return null

  return saveUserModelConfig(backupConfig, userId)
}
