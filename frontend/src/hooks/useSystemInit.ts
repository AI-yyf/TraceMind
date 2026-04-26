import { useCallback, useEffect, useState } from 'react'

import { apiGet } from '@/utils/api'
import {
  assertBackendTopicCollectionContract,
  assertHealthStatusContract,
  assertPromptStudioSummaryContract,
} from '@/utils/contracts'
import { fetchModelConfigResponse } from '@/utils/omniRuntimeCache'

export type SystemInitStatus = 'checking' | 'uninitialized' | 'ready' | 'error'

export interface SystemConfig {
  hasTopics: boolean
  hasModelConfig: boolean
  hasPromptTemplates: boolean
  backendHealthy: boolean
}

export interface SystemInitState {
  status: SystemInitStatus
  config: SystemConfig | null
  error: Error | null
  checkAgain: () => void
}

async function checkSystemInit(): Promise<{ status: SystemInitStatus; config: SystemConfig | null }> {
  try {
    let backendHealthy = false
    try {
      const health = await apiGet<unknown>('/health')
      assertHealthStatusContract(health)
      backendHealthy = health.status === 'ok'
    } catch {
      backendHealthy = false
    }

    let hasTopics = false
    try {
      const topics = await apiGet<unknown>('/api/topics')
      assertBackendTopicCollectionContract(topics)
      hasTopics = topics.length > 0
    } catch {
      hasTopics = false
    }

    let hasModelConfig = false
    try {
      const modelConfig = await fetchModelConfigResponse()
      hasModelConfig = Boolean(modelConfig.config?.language || modelConfig.config?.multimodal)
    } catch {
      hasModelConfig = false
    }

    let hasPromptTemplates = false
    try {
      const bundle = await apiGet<unknown>('/api/prompt-templates/studio')
      assertPromptStudioSummaryContract(bundle)
      hasPromptTemplates =
        (Array.isArray(bundle.productCopies) && bundle.productCopies.length > 0) ||
        (Array.isArray(bundle.templates) && bundle.templates.length > 0)
    } catch {
      hasPromptTemplates = false
    }

    const config: SystemConfig = {
      hasTopics,
      hasModelConfig,
      hasPromptTemplates,
      backendHealthy,
    }

    if (!backendHealthy) {
      return { status: 'error', config }
    }

    if (!hasTopics) {
      return { status: 'uninitialized', config }
    }

    return { status: 'ready', config }
  } catch {
    return {
      status: 'error',
      config: {
        hasTopics: false,
        hasModelConfig: false,
        hasPromptTemplates: false,
        backendHealthy: false,
      },
    }
  }
}

export function useSystemInit(): SystemInitState {
  const [status, setStatus] = useState<SystemInitStatus>('checking')
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const check = useCallback(async () => {
    setStatus('checking')
    setError(null)

    try {
      const result = await checkSystemInit()
      setStatus(result.status)
      setConfig(result.config)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return {
    status,
    config,
    error,
    checkAgain: check,
  }
}
