import { prisma } from '../../lib/prisma'

export type SearchSourceName = 'openalex' | 'semantic-scholar' | 'arxiv' | 'crossref'

type SearchSourceHealthState = {
  source: SearchSourceName
  cooldownUntil: number
  consecutiveRateLimits: number
  lastRateLimitAt?: string
  lastSuccessAt?: string
  updatedAt: string
}

type CacheEntry = {
  state: SearchSourceHealthState
  syncedAt: number
}

const SEARCH_SOURCE_HEALTH_SYNC_INTERVAL_MS = 10_000
const cache = new Map<SearchSourceName, CacheEntry>()

function sourceHealthKey(source: SearchSourceName) {
  return `search-source-health:v1:${source}`
}

function createDefaultState(source: SearchSourceName): SearchSourceHealthState {
  const nowIso = new Date().toISOString()
  return {
    source,
    cooldownUntil: 0,
    consecutiveRateLimits: 0,
    updatedAt: nowIso,
  }
}

function parseState(source: SearchSourceName, value: string | null | undefined) {
  if (!value) return createDefaultState(source)

  try {
    const parsed = JSON.parse(value) as Partial<SearchSourceHealthState>
    return {
      ...createDefaultState(source),
      ...parsed,
      source,
      cooldownUntil:
        typeof parsed.cooldownUntil === 'number' && Number.isFinite(parsed.cooldownUntil)
          ? parsed.cooldownUntil
          : 0,
      consecutiveRateLimits:
        typeof parsed.consecutiveRateLimits === 'number' && Number.isFinite(parsed.consecutiveRateLimits)
          ? Math.max(0, Math.trunc(parsed.consecutiveRateLimits))
          : 0,
    } satisfies SearchSourceHealthState
  } catch {
    return createDefaultState(source)
  }
}

async function loadState(source: SearchSourceName, force = false) {
  const now = Date.now()
  const cached = cache.get(source)
  if (!force && cached && now - cached.syncedAt < SEARCH_SOURCE_HEALTH_SYNC_INTERVAL_MS) {
    return cached.state
  }

  const record = await prisma.system_configs.findUnique({
    where: { key: sourceHealthKey(source) },
    select: { value: true },
  })
  const state = parseState(source, record?.value)
  cache.set(source, { state, syncedAt: now })
  return state
}

async function saveState(state: SearchSourceHealthState) {
  cache.set(state.source, { state, syncedAt: Date.now() })
  await prisma.system_configs.upsert({
    where: { key: sourceHealthKey(state.source) },
    update: {
      value: JSON.stringify(state),
      updatedAt: new Date(),
    },
    create: {
      id: crypto.randomUUID(),
      key: sourceHealthKey(state.source),
      value: JSON.stringify(state),
      updatedAt: new Date(),
    },
  })
}

export async function getSourceCooldownUntil(source: SearchSourceName) {
  const state = await loadState(source)
  return state.cooldownUntil
}

export async function noteSourceRateLimit(
  source: SearchSourceName,
  options?: { retryAfterMs?: number; defaultCooldownMs?: number },
) {
  const current = await loadState(source, true)
  const now = Date.now()
  const cooldownMs =
    typeof options?.retryAfterMs === 'number' &&
    Number.isFinite(options.retryAfterMs) &&
    options.retryAfterMs > 0
      ? options.retryAfterMs
      : options?.defaultCooldownMs ?? 60_000

  const nextState: SearchSourceHealthState = {
    ...current,
    cooldownUntil: Math.max(current.cooldownUntil, now + cooldownMs),
    consecutiveRateLimits: current.consecutiveRateLimits + 1,
    lastRateLimitAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }
  await saveState(nextState)
  return nextState
}

export async function noteSourceSuccess(source: SearchSourceName) {
  const current = await loadState(source)
  if (current.consecutiveRateLimits === 0 && current.cooldownUntil < Date.now()) {
    return current
  }

  const now = new Date().toISOString()
  const nextState: SearchSourceHealthState = {
    ...current,
    consecutiveRateLimits: 0,
    cooldownUntil: current.cooldownUntil < Date.now() ? 0 : current.cooldownUntil,
    lastSuccessAt: now,
    updatedAt: now,
  }
  await saveState(nextState)
  return nextState
}

export const __testing = {
  createDefaultState,
  parseState,
  sourceHealthKey,
}
