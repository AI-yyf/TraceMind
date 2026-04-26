import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

import type {
  UserModelConfig,
  SanitizedUserModelConfig,
  ProviderCatalogEntry,
  ModelPreset,
  ResearchRoleId,
  OmniTask,
  TaskRouteTarget,
  ProviderModelConfig,
  ProviderModelRef,
} from '@/types/config'
import { DEFAULT_MODEL_PRESETS } from '@/types/config'
import { useModelConfig, type ModelConfigStatus } from '@/hooks/useModelConfig'

// ========== Context State Types ==========

export interface ModelConfigContextState {
  config: SanitizedUserModelConfig | null
  catalog: ProviderCatalogEntry[]
  presets: ModelPreset[]
  status: ModelConfigStatus
  error: string | null
  isInitialized: boolean
  isUpdating: boolean
}

export interface ModelConfigContextActions {
  updateConfig: (config: UserModelConfig) => Promise<boolean>
  updateLanguageSlot: (slot: ProviderModelConfig | null) => Promise<boolean>
  updateMultimodalSlot: (slot: ProviderModelConfig | null) => Promise<boolean>
  updateRoleOverride: (roleId: ResearchRoleId, config: ProviderModelConfig | null) => Promise<boolean>
  updateTaskOverride: (task: OmniTask, ref: ProviderModelRef) => Promise<boolean>
  updateTaskRouting: (task: OmniTask, target: TaskRouteTarget) => Promise<boolean>
  applyPreset: (presetId: string) => Promise<boolean>
  resetConfig: () => Promise<boolean>
  refreshConfig: () => Promise<void>
  refreshCatalog: () => Promise<void>
  refreshPresets: () => Promise<void>
  clearError: () => void
}

export type ModelConfigContextValue = ModelConfigContextState & ModelConfigContextActions

// ========== Context Creation ==========

const ModelConfigContext = createContext<ModelConfigContextValue | null>(null)

// ========== Optimistic Update Helper ==========

interface OptimisticUpdate {
  previousConfig: SanitizedUserModelConfig | null
  timestamp: number
}

// ========== Default Sanitized Config ==========

const DEFAULT_SANITIZED_CONFIG: SanitizedUserModelConfig = {
  language: null,
  multimodal: null,
  roles: {},
  taskOverrides: {},
  taskRouting: {},
}

// ========== Helper: Convert UserModelConfig to SanitizedUserModelConfig ==========

function toSanitizedConfig(config: UserModelConfig): SanitizedUserModelConfig {
  return {
    language: config.language ? {
      provider: config.language.provider,
      model: config.language.model,
      baseUrl: config.language.baseUrl,
      apiKeyRef: config.language.apiKeyRef,
      apiKeyStatus: 'configured',
      apiKeyPreview: config.language.apiKey ? '****' : undefined,
      providerOptions: config.language.providerOptions,
      options: config.language.options,
    } : null,
    multimodal: config.multimodal ? {
      provider: config.multimodal.provider,
      model: config.multimodal.model,
      baseUrl: config.multimodal.baseUrl,
      apiKeyRef: config.multimodal.apiKeyRef,
      apiKeyStatus: 'configured',
      apiKeyPreview: config.multimodal.apiKey ? '****' : undefined,
      providerOptions: config.multimodal.providerOptions,
      options: config.multimodal.options,
    } : null,
    roles: config.roles ? Object.fromEntries(
      Object.entries(config.roles).map(([roleId, roleConfig]) => [
        roleId,
        roleConfig ? {
          provider: roleConfig.provider,
          model: roleConfig.model,
          baseUrl: roleConfig.baseUrl,
          apiKeyRef: roleConfig.apiKeyRef,
          apiKeyStatus: 'configured',
          apiKeyPreview: roleConfig.apiKey ? '****' : undefined,
          providerOptions: roleConfig.providerOptions,
          options: roleConfig.options,
        } : null,
      ])
    ) : {},
    taskOverrides: config.taskOverrides ?? {},
    taskRouting: config.taskRouting ?? {},
  }
}

// ========== Helper: Convert SanitizedUserModelConfig to UserModelConfig ==========

function toUserConfig(config: SanitizedUserModelConfig | null): UserModelConfig {
  if (!config) {
    return {
      language: null,
      multimodal: null,
      roles: {},
      taskOverrides: {},
      taskRouting: {},
    }
  }

  return {
    language: config.language ? {
      provider: config.language.provider,
      model: config.language.model,
      baseUrl: config.language.baseUrl,
      apiKeyRef: config.language.apiKeyRef,
      apiKey: '',
      providerOptions: config.language.providerOptions,
      options: config.language.options,
    } : null,
    multimodal: config.multimodal ? {
      provider: config.multimodal.provider,
      model: config.multimodal.model,
      baseUrl: config.multimodal.baseUrl,
      apiKeyRef: config.multimodal.apiKeyRef,
      apiKey: '',
      providerOptions: config.multimodal.providerOptions,
      options: config.multimodal.options,
    } : null,
    roles: config.roles ? Object.fromEntries(
      Object.entries(config.roles).map(([roleId, roleConfig]) => [
        roleId,
        roleConfig ? {
          provider: roleConfig.provider,
          model: roleConfig.model,
          baseUrl: roleConfig.baseUrl,
          apiKeyRef: roleConfig.apiKeyRef,
          apiKey: '',
          providerOptions: roleConfig.providerOptions,
          options: roleConfig.options,
        } : null,
      ])
    ) : {},
    taskOverrides: config.taskOverrides ?? {},
    taskRouting: config.taskRouting ?? {},
  }
}

// ========== Provider Implementation ==========

export function ModelConfigProvider({ children }: PropsWithChildren) {
  const modelConfigHook = useModelConfig()

  // Optimistic update tracking
  const optimisticUpdateRef = useRef<OptimisticUpdate | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Local optimistic state (shown while saving)
  const [optimisticConfig, setOptimisticConfig] = useState<SanitizedUserModelConfig | null>(null)

  // Determine which config to show (optimistic or actual)
  const displayedConfig = useMemo(() => {
    if (optimisticConfig !== null && isUpdating) {
      return optimisticConfig
    }
    return modelConfigHook.config ?? DEFAULT_SANITIZED_CONFIG
  }, [optimisticConfig, isUpdating, modelConfigHook.config])

  // Initialize on mount
  useEffect(() => {
    modelConfigHook.fetchConfig()
    modelConfigHook.fetchCatalog()
    modelConfigHook.fetchPresets()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isInitialized = useMemo(() => {
    return modelConfigHook.status !== 'idle' && modelConfigHook.config !== null
  }, [modelConfigHook.status, modelConfigHook.config])

  const clearError = useCallback(() => {
    modelConfigHook.clearError()
  }, [modelConfigHook])

  const rollbackOptimisticUpdate = useCallback(() => {
    if (optimisticUpdateRef.current) {
      setOptimisticConfig(optimisticUpdateRef.current.previousConfig)
      optimisticUpdateRef.current = null
    }
    setIsUpdating(false)
  }, [])

  const clearOptimisticUpdate = useCallback(() => {
    setOptimisticConfig(null)
    optimisticUpdateRef.current = null
    setIsUpdating(false)
  }, [])

  // Core update function with optimistic update support
  const updateConfig = useCallback(async (newConfig: UserModelConfig): Promise<boolean> => {
    // Store previous state for rollback
    optimisticUpdateRef.current = {
      previousConfig: displayedConfig,
      timestamp: Date.now(),
    }

    // Apply optimistic update immediately
    setOptimisticConfig(toSanitizedConfig(newConfig))
    setIsUpdating(true)

    // Invalidate cache before save
    modelConfigHook.invalidateCache()

    // Perform actual save
    const success = await modelConfigHook.saveConfig(newConfig)

    if (success) {
      clearOptimisticUpdate()
      // Refresh to get server-side sanitized config
      await modelConfigHook.fetchConfig(true)
    } else {
      rollbackOptimisticUpdate()
    }

    return success
  }, [displayedConfig, modelConfigHook, clearOptimisticUpdate, rollbackOptimisticUpdate])

  // Slot-specific update functions
  const updateLanguageSlot = useCallback(async (slot: ProviderModelConfig | null): Promise<boolean> => {
    const currentConfig = toUserConfig(displayedConfig)
    const newConfig: UserModelConfig = {
      ...currentConfig,
      language: slot,
    }
    return updateConfig(newConfig)
  }, [displayedConfig, updateConfig])

  const updateMultimodalSlot = useCallback(async (slot: ProviderModelConfig | null): Promise<boolean> => {
    const currentConfig = toUserConfig(displayedConfig)
    const newConfig: UserModelConfig = {
      ...currentConfig,
      multimodal: slot,
    }
    return updateConfig(newConfig)
  }, [displayedConfig, updateConfig])

  const updateRoleOverride = useCallback(async (
    roleId: ResearchRoleId,
    config: ProviderModelConfig | null
  ): Promise<boolean> => {
    const currentConfig = toUserConfig(displayedConfig)
    const newRoles = { ...currentConfig.roles }
    newRoles[roleId] = config

    const newConfig: UserModelConfig = {
      ...currentConfig,
      roles: newRoles,
    }
    return updateConfig(newConfig)
  }, [displayedConfig, updateConfig])

  const updateTaskOverride = useCallback(async (
    task: OmniTask,
    ref: ProviderModelRef
  ): Promise<boolean> => {
    const currentConfig = toUserConfig(displayedConfig)
    const newTaskOverrides = { ...currentConfig.taskOverrides }
    newTaskOverrides[task] = ref

    const newConfig: UserModelConfig = {
      ...currentConfig,
      taskOverrides: newTaskOverrides,
    }
    return updateConfig(newConfig)
  }, [displayedConfig, updateConfig])

  const updateTaskRouting = useCallback(async (
    task: OmniTask,
    target: TaskRouteTarget
  ): Promise<boolean> => {
    const currentConfig = toUserConfig(displayedConfig)
    const newTaskRouting = { ...currentConfig.taskRouting }
    newTaskRouting[task] = target

    const newConfig: UserModelConfig = {
      ...currentConfig,
      taskRouting: newTaskRouting,
    }
    return updateConfig(newConfig)
  }, [displayedConfig, updateConfig])

  // Apply preset from list
  const applyPreset = useCallback(async (presetId: string): Promise<boolean> => {
    // Find preset (use local presets or fallback to defaults)
    const presets = modelConfigHook.presets.length > 0 ? modelConfigHook.presets : DEFAULT_MODEL_PRESETS
    const preset = presets.find(p => p.id === presetId)

    if (!preset) {
      return false
    }

    const newConfig: UserModelConfig = {
      language: {
        provider: preset.language.provider,
        model: preset.language.model,
        apiKey: '',
        apiKeyRef: '',
      },
      multimodal: {
        provider: preset.multimodal.provider,
        model: preset.multimodal.model,
        apiKey: '',
        apiKeyRef: '',
      },
      roles: {},
      taskOverrides: {},
      taskRouting: {},
    }

    return updateConfig(newConfig)
  }, [modelConfigHook.presets, updateConfig])

  // Reset to empty defaults
  const resetConfig = useCallback(async (): Promise<boolean> => {
    const emptyConfig: UserModelConfig = {
      language: null,
      multimodal: null,
      roles: {},
      taskOverrides: {},
      taskRouting: {},
    }

    return updateConfig(emptyConfig)
  }, [updateConfig])

  // Refresh functions
  const refreshConfig = useCallback(async (): Promise<void> => {
    await modelConfigHook.fetchConfig(true)
  }, [modelConfigHook])

  const refreshCatalog = useCallback(async (): Promise<void> => {
    await modelConfigHook.fetchCatalog(true)
  }, [modelConfigHook])

  const refreshPresets = useCallback(async (): Promise<void> => {
    await modelConfigHook.fetchPresets(true)
  }, [modelConfigHook])

  // Context value
  const value = useMemo<ModelConfigContextValue>(() => ({
    config: displayedConfig,
    catalog: modelConfigHook.catalog,
    presets: modelConfigHook.presets,
    status: modelConfigHook.status,
    error: modelConfigHook.error,
    isInitialized,
    isUpdating,
    updateConfig,
    updateLanguageSlot,
    updateMultimodalSlot,
    updateRoleOverride,
    updateTaskOverride,
    updateTaskRouting,
    applyPreset,
    resetConfig,
    refreshConfig,
    refreshCatalog,
    refreshPresets,
    clearError,
  }), [
    displayedConfig,
    modelConfigHook.catalog,
    modelConfigHook.presets,
    modelConfigHook.status,
    modelConfigHook.error,
    isInitialized,
    isUpdating,
    updateConfig,
    updateLanguageSlot,
    updateMultimodalSlot,
    updateRoleOverride,
    updateTaskOverride,
    updateTaskRouting,
    applyPreset,
    resetConfig,
    refreshConfig,
    refreshCatalog,
    refreshPresets,
    clearError,
  ])

  return (
    <ModelConfigContext.Provider value={value}>
      {children}
    </ModelConfigContext.Provider>
  )
}

export default ModelConfigProvider
