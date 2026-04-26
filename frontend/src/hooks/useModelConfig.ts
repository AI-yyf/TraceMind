import { useCallback, useRef, useState } from 'react'

import { apiGet, apiPost, ApiError } from '@/utils/api'
import type {
  UserModelConfig,
  SanitizedUserModelConfig,
  ProviderCatalogEntry,
  ModelPreset,
} from '@/types/config'
import {
  assertModelConfigSaveResponseContract,
  assertModelPresetContract,
  assertProviderCatalogContract,
  assertSanitizedUserModelConfigContract,
} from '@/utils/contracts'

// ========== Error Messages (Chinese) ==========

const ERROR_MESSAGES = {
  fetchConfig: '获取模型配置失败',
  saveConfig: '保存模型配置失败',
  fetchCatalog: '获取模型目录失败',
  fetchPresets: '获取预设配置失败',
  network: '网络连接错误，请检查网络后重试',
  unknown: '未知错误，请稍后重试',
}

function getErrorMessage(error: unknown, operation: keyof typeof ERROR_MESSAGES): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return `${ERROR_MESSAGES[operation]}：服务器错误`
    }
    if (error.statusCode >= 400 && error.statusCode < 500) {
      return `${ERROR_MESSAGES[operation]}：${error.message}`
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return ERROR_MESSAGES.network
    }
    return `${ERROR_MESSAGES[operation]}：${error.message}`
  }
  if (error instanceof Error) {
    return `${ERROR_MESSAGES[operation]}：${error.message}`
  }
  return ERROR_MESSAGES.unknown
}

// ========== Cache Entry ==========

interface CacheEntry<T> {
  data: T
  timestamp: number
  staleTime: number
}

const CACHE_STALE_TIME_MS = 30_000 // 30 seconds
const CACHE_MAX_AGE_MS = 60_000 // 60 seconds

function isCacheFresh(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.timestamp < entry.staleTime
}

function isCacheValid(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.timestamp < CACHE_MAX_AGE_MS
}

// ========== Hook State Types ==========

export type ModelConfigStatus = 'idle' | 'loading' | 'success' | 'error'

export interface ModelConfigState {
  config: SanitizedUserModelConfig | null
  catalog: ProviderCatalogEntry[]
  presets: ModelPreset[]
  status: ModelConfigStatus
  error: string | null
  isStale: boolean
}

export interface UseModelConfigReturn extends ModelConfigState {
  fetchConfig: (forceRefresh?: boolean) => Promise<void>
  saveConfig: (config: UserModelConfig) => Promise<boolean>
  fetchCatalog: (forceRefresh?: boolean) => Promise<void>
  fetchPresets: (forceRefresh?: boolean) => Promise<void>
  invalidateCache: () => void
  clearError: () => void
}

// ========== Default State ==========

// ========== Hook Implementation ==========

export function useModelConfig(): UseModelConfigReturn {
  const [state, setState] = useState<ModelConfigState>({
    config: null,
    catalog: [],
    presets: [],
    status: 'idle',
    error: null,
    isStale: false,
  })

  // Cache refs for stale-while-revalidate
  const configCacheRef = useRef<CacheEntry<SanitizedUserModelConfig> | null>(null)
  const catalogCacheRef = useRef<CacheEntry<ProviderCatalogEntry[]> | null>(null)
  const presetsCacheRef = useRef<CacheEntry<ModelPreset[]> | null>(null)

  // Track pending requests to avoid duplicate fetches
  const pendingRequestsRef = useRef<Set<string>>(new Set())

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null, status: prev.status === 'error' ? 'idle' : prev.status }))
  }, [])

  const invalidateCache = useCallback(() => {
    configCacheRef.current = null
    catalogCacheRef.current = null
    presetsCacheRef.current = null
    setState(prev => ({ ...prev, isStale: true }))
  }, [])

  const fetchConfig = useCallback(async (forceRefresh = false): Promise<void> => {
    const requestKey = 'config'

    // Avoid duplicate requests
    if (pendingRequestsRef.current.has(requestKey)) {
      return
    }

    // Check cache (stale-while-revalidate pattern)
    const cache = configCacheRef.current
    if (!forceRefresh && cache && isCacheFresh(cache)) {
      // Cache is fresh, use it immediately
      setState(prev => ({
        ...prev,
        config: cache.data,
        status: 'success',
        error: null,
        isStale: false,
      }))
      return
    }

    if (!forceRefresh && cache && isCacheValid(cache)) {
      // Cache is stale but valid, show stale data and revalidate in background
      setState(prev => ({
        ...prev,
        config: cache.data,
        status: 'success',
        error: null,
        isStale: true,
      }))
    } else {
      // No valid cache, show loading
      setState(prev => ({ ...prev, status: 'loading', error: null }))
    }

    pendingRequestsRef.current.add(requestKey)

    try {
      const response = await apiGet<unknown>('/api/omni/config')
      assertSanitizedUserModelConfigContract(response)
      const config = response

      // Update cache
      configCacheRef.current = {
        data: config,
        timestamp: Date.now(),
        staleTime: CACHE_STALE_TIME_MS,
      }

      setState(prev => ({
        ...prev,
        config,
        status: 'success',
        error: null,
        isStale: false,
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'fetchConfig')
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
        isStale: false,
      }))
    } finally {
      pendingRequestsRef.current.delete(requestKey)
    }
  }, [])

  const saveConfig = useCallback(async (config: UserModelConfig): Promise<boolean> => {
    const requestKey = 'saveConfig'

    if (pendingRequestsRef.current.has(requestKey)) {
      return false
    }

    setState(prev => ({ ...prev, status: 'loading', error: null }))
    pendingRequestsRef.current.add(requestKey)

    try {
      const response = await apiPost<unknown, UserModelConfig>('/api/omni/config', config)
      assertModelConfigSaveResponseContract(response)
      const savedConfig: SanitizedUserModelConfig = response.config

      // Update cache
      configCacheRef.current = {
        data: savedConfig,
        timestamp: Date.now(),
        staleTime: CACHE_STALE_TIME_MS,
      }

      setState(prev => ({
        ...prev,
        config: savedConfig,
        status: 'success',
        error: null,
        isStale: false,
      }))

      return true
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'saveConfig')
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }))
      return false
    } finally {
      pendingRequestsRef.current.delete(requestKey)
    }
  }, [])

  const fetchCatalog = useCallback(async (forceRefresh = false): Promise<void> => {
    const requestKey = 'catalog'

    if (pendingRequestsRef.current.has(requestKey)) {
      return
    }

    const cache = catalogCacheRef.current
    if (!forceRefresh && cache && isCacheFresh(cache)) {
      setState(prev => ({
        ...prev,
        catalog: cache.data,
        error: null,
      }))
      return
    }

    if (!forceRefresh && cache && isCacheValid(cache)) {
      setState(prev => ({
        ...prev,
        catalog: cache.data,
        error: null,
        isStale: true,
      }))
    } else {
      setState(prev => ({ ...prev, status: 'loading', error: null }))
    }

    pendingRequestsRef.current.add(requestKey)

    try {
      const response = await apiGet<unknown>('/api/omni/catalog')
      assertProviderCatalogContract(response)
      const catalog: ProviderCatalogEntry[] = response

      catalogCacheRef.current = {
        data: catalog,
        timestamp: Date.now(),
        staleTime: CACHE_STALE_TIME_MS,
      }

      setState(prev => ({
        ...prev,
        catalog,
        error: null,
        isStale: false,
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'fetchCatalog')
      setState(prev => ({
        ...prev,
        status: prev.config ? 'success' : 'error',
        error: errorMessage,
      }))
    } finally {
      pendingRequestsRef.current.delete(requestKey)
    }
  }, [])

  const fetchPresets = useCallback(async (forceRefresh = false): Promise<void> => {
    const requestKey = 'presets'

    if (pendingRequestsRef.current.has(requestKey)) {
      return
    }

    const cache = presetsCacheRef.current
    if (!forceRefresh && cache && isCacheFresh(cache)) {
      setState(prev => ({
        ...prev,
        presets: cache.data,
        error: null,
      }))
      return
    }

    if (!forceRefresh && cache && isCacheValid(cache)) {
      setState(prev => ({
        ...prev,
        presets: cache.data,
        error: null,
        isStale: true,
      }))
    } else {
      setState(prev => ({ ...prev, status: 'loading', error: null }))
    }

    pendingRequestsRef.current.add(requestKey)

    try {
      const response = await apiGet<unknown>('/api/omni/presets')
      assertModelPresetContract(response)
      const presets: ModelPreset[] = response

      presetsCacheRef.current = {
        data: presets,
        timestamp: Date.now(),
        staleTime: CACHE_STALE_TIME_MS,
      }

      setState(prev => ({
        ...prev,
        presets,
        error: null,
        isStale: false,
      }))
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'fetchPresets')
      setState(prev => ({
        ...prev,
        status: prev.config ? 'success' : 'error',
        error: errorMessage,
      }))
    } finally {
      pendingRequestsRef.current.delete(requestKey)
    }
  }, [])

  return {
    ...state,
    fetchConfig,
    saveConfig,
    fetchCatalog,
    fetchPresets,
    invalidateCache,
    clearError,
  }
}

export default useModelConfig
