import type {
  ModelCapabilitySummary,
  ModelConfigResponse,
  TopicResearchBrief,
} from '@/types/alpha'

import { apiGet } from './api'

type CacheEntry<T> = {
  data: T
  fetchedAt: number
}

type FetchOptions = {
  force?: boolean
  maxAgeMs?: number
}

const DEFAULT_MODEL_CONFIG_MAX_AGE_MS = 30_000
const DEFAULT_MODEL_CAPABILITY_MAX_AGE_MS = 30_000
const DEFAULT_TOPIC_RESEARCH_BRIEF_MAX_AGE_MS = 12_000

const modelConfigCache = new Map<string, CacheEntry<ModelConfigResponse>>()
const modelConfigInflight = new Map<string, Promise<ModelConfigResponse>>()

const modelCapabilityCache = new Map<string, CacheEntry<ModelCapabilitySummary>>()
const modelCapabilityInflight = new Map<string, Promise<ModelCapabilitySummary>>()

const topicResearchBriefCache = new Map<string, CacheEntry<TopicResearchBrief>>()
const topicResearchBriefInflight = new Map<string, Promise<TopicResearchBrief>>()

function getFreshCacheValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  maxAgeMs: number,
) {
  const entry = cache.get(key)
  if (!entry) return null
  return Date.now() - entry.fetchedAt <= maxAgeMs ? entry.data : null
}

function setCacheValue<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T) {
  cache.set(key, {
    data,
    fetchedAt: Date.now(),
  })
  return data
}

async function fetchCachedResource<T>(
  key: string,
  cache: Map<string, CacheEntry<T>>,
  inflight: Map<string, Promise<T>>,
  loader: () => Promise<T>,
  options: FetchOptions,
  defaultMaxAgeMs: number,
) {
  const maxAgeMs = options.maxAgeMs ?? defaultMaxAgeMs

  if (!options.force) {
    const cached = getFreshCacheValue(cache, key, maxAgeMs)
    if (cached) return cached
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const nextPromise = loader()
    .then((data) => setCacheValue(cache, key, data))
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, nextPromise)
  return nextPromise
}

export function primeModelConfigResponse(data: ModelConfigResponse) {
  return setCacheValue(modelConfigCache, 'default', data)
}

export function invalidateModelConfigResponse() {
  modelConfigCache.clear()
  modelConfigInflight.clear()
}

export function fetchModelConfigResponse(options: FetchOptions = {}) {
  return fetchCachedResource(
    'default',
    modelConfigCache,
    modelConfigInflight,
    () => apiGet<ModelConfigResponse>('/api/model-configs'),
    options,
    DEFAULT_MODEL_CONFIG_MAX_AGE_MS,
  )
}

export function primeModelCapabilitySummary(data: ModelCapabilitySummary) {
  return setCacheValue(modelCapabilityCache, 'default', data)
}

export function invalidateModelCapabilitySummary() {
  modelCapabilityCache.clear()
  modelCapabilityInflight.clear()
}

export function fetchModelCapabilitySummary(options: FetchOptions = {}) {
  return fetchCachedResource(
    'default',
    modelCapabilityCache,
    modelCapabilityInflight,
    () => apiGet<ModelCapabilitySummary>('/api/model-capabilities'),
    options,
    DEFAULT_MODEL_CAPABILITY_MAX_AGE_MS,
  )
}

export function primeTopicResearchBrief(data: TopicResearchBrief) {
  return setCacheValue(topicResearchBriefCache, data.topicId, data)
}

export function invalidateTopicResearchBrief(topicId?: string) {
  if (!topicId) {
    topicResearchBriefCache.clear()
    topicResearchBriefInflight.clear()
    return
  }

  topicResearchBriefCache.delete(topicId)
  topicResearchBriefInflight.delete(topicId)
}

export function fetchTopicResearchBrief(topicId: string, options: FetchOptions = {}) {
  return fetchCachedResource(
    topicId,
    topicResearchBriefCache,
    topicResearchBriefInflight,
    () => apiGet<TopicResearchBrief>(`/api/topics/${topicId}/research-brief`),
    options,
    DEFAULT_TOPIC_RESEARCH_BRIEF_MAX_AGE_MS,
  )
}
