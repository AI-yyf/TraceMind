import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppConfig, ResearchSessionConfig, ResearchProgress } from '@/types/config'
import { DEFAULT_CONFIG } from '@/types/config'
import { useWebSocket } from './useWebSocket'

const STORAGE_KEY = 'arxiv-chronicle-config'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

/**
 * 加载配置
 */
function loadConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // 合并默认配置和存储的配置
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        api: { ...DEFAULT_CONFIG.api, ...parsed.api },
        generation: { ...DEFAULT_CONFIG.generation, ...parsed.generation },
        research: {
          ...DEFAULT_CONFIG.research,
          ...parsed.research,
          discovery: { ...DEFAULT_CONFIG.research.discovery, ...parsed.research?.discovery },
          nodeGeneration: { ...DEFAULT_CONFIG.research.nodeGeneration, ...parsed.research?.nodeGeneration },
          branchManagement: { ...DEFAULT_CONFIG.research.branchManagement, ...parsed.research?.branchManagement },
        },
        prompts: { ...DEFAULT_CONFIG.prompts, ...parsed.prompts },
      }
    }
  } catch {
    console.error('Failed to load config from localStorage')
  }
  return DEFAULT_CONFIG
}

/**
 * 保存配置
 */
function saveConfig(config: AppConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...config,
      updatedAt: new Date().toISOString(),
    }))
  } catch {
    console.error('Failed to save config to localStorage')
  }
}

/**
 * 配置管理 Hook
 */
export function useConfig() {
  const [config, setConfigState] = useState<AppConfig>(DEFAULT_CONFIG)
  const [isLoaded, setIsLoaded] = useState(false)

  // 初始加载
  useEffect(() => {
    const loaded = loadConfig()
    setConfigState(loaded)
    setIsLoaded(true)
  }, [])

  // 保存配置
  useEffect(() => {
    if (isLoaded) {
      saveConfig(config)
    }
  }, [config, isLoaded])

  /**
   * 更新完整配置
   */
  const setConfig = useCallback((newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => {
    setConfigState(newConfig)
  }, [])

  /**
   * 更新 API 配置
   */
  const updateApiConfig = useCallback((apiConfig: Partial<AppConfig['api']>) => {
    setConfigState(prev => ({
      ...prev,
      api: { ...prev.api, ...apiConfig },
    }))
  }, [])

  /**
   * 更新生成配置
   */
  const updateGenerationConfig = useCallback((generationConfig: Partial<AppConfig['generation']>) => {
    setConfigState(prev => ({
      ...prev,
      generation: { ...prev.generation, ...generationConfig },
    }))
  }, [])

  /**
   * 更新研究配置
   */
  const updateResearchConfig = useCallback((researchConfig: Partial<AppConfig['research']>) => {
    setConfigState(prev => ({
      ...prev,
      research: { ...prev.research, ...researchConfig },
    }))
  }, [])

  /**
   * 更新提示词模板
   */
  const updatePromptTemplate = useCallback((key: keyof AppConfig['prompts'], template: string) => {
    setConfigState(prev => ({
      ...prev,
      prompts: { ...prev.prompts, [key]: template },
    }))
  }, [])

  /**
   * 重置配置
   */
  const resetConfig = useCallback(() => {
    setConfigState(DEFAULT_CONFIG)
  }, [])

  /**
   * 检查 API 是否已配置
   */
  const isApiConfigured = Boolean(config.api.apiKey)

  return {
    config,
    isLoaded,
    setConfig,
    updateApiConfig,
    updateGenerationConfig,
    updateResearchConfig,
    updatePromptTemplate,
    resetConfig,
    isApiConfigured,
  }
}

/**
 * 研究会话管理 Hook
 */
export function useResearchSession() {
  const [progress, setProgress] = useState<ResearchProgress | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  // WebSocket 连接
  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onProgress: (sid, data) => {
      if (sid === sessionIdRef.current) {
        setProgress(prev => {
          if (!prev) return null
          // 转换日志格式
          const newLogs = data.logs.map(log => ({
            timestamp: log.timestamp,
            level: log.level as 'info' | 'warn' | 'error' | 'success',
            message: log.message,
          }))
          return {
            ...prev,
            currentStage: data.stage,
            progress: data.progress,
            logs: [...prev.logs, ...newLogs],
          }
        })
      }
    },
    onComplete: (sid) => {
      if (sid === sessionIdRef.current) {
        setIsRunning(false)
        setProgress(prev => prev ? { ...prev, status: 'completed' as const } : null)
      }
    },
    onError: (sid, error) => {
      if (sid === sessionIdRef.current) {
        setIsRunning(false)
        setProgress(prev => prev ? { ...prev, status: 'error' as const } : null)
        console.error('Research session error:', error)
      }
    },
  })

  /**
   * 启动研究会话
   */
  const startResearch = useCallback(async (sessionConfig: ResearchSessionConfig, appConfig: AppConfig) => {
    if (isRunning) return

    try {
      // 调用后端 API 启动研究会话
      const response = await fetch(`${API_BASE_URL}/api/research/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicIds: sessionConfig.topicIds,
          mode: sessionConfig.mode,
          startStage: sessionConfig.startStage,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start research session')
      }

      const result = await response.json()
      const sessionId = result.data.sessionId
      sessionIdRef.current = sessionId

      setIsRunning(true)
      setProgress({
        sessionId,
        status: 'running',
        currentStage: '初始化',
        progress: 0,
        completedTopics: 0,
        totalTopics: sessionConfig.topicIds.length,
        logs: [{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `启动研究会话：主题 ${sessionConfig.topicIds.join(', ')}`,
        }],
        startedAt: new Date().toISOString(),
        topicProgress: sessionConfig.topicIds.map(id => ({
          topicId: id,
          topicName: id,
          status: 'pending',
          currentStage: 0,
          totalStages: 5,
          nodeCount: 0,
        })),
      })

      // 订阅 WebSocket 进度
      subscribe(sessionId)

      return sessionId
    } catch (error) {
      console.error('Failed to start research:', error)
      setIsRunning(false)
      throw error
    }
  }, [isRunning, subscribe])

  /**
   * 停止研究会话
   */
  const stopResearch = useCallback(() => {
    if (sessionIdRef.current) {
      unsubscribe(sessionIdRef.current)
    }
    setIsRunning(false)
    setProgress((prev) => prev ? { ...prev, status: 'paused' } : null)
  }, [unsubscribe])

  /**
   * 添加日志
   */
  const addLog = useCallback((level: ResearchProgress['logs'][0]['level'], message: string, details?: Record<string, unknown>) => {
    setProgress((prev) => {
      if (!prev) return null
      return {
        ...prev,
        logs: [...prev.logs, {
          timestamp: new Date().toISOString(),
          level,
          message,
          details,
        }],
      }
    })
  }, [])

  /**
   * 更新进度
   */
  const updateProgress = useCallback((stage: string, percent: number) => {
    setProgress((prev) => {
      if (!prev) return null
      return {
        ...prev,
        currentStage: stage,
        progress: percent,
      }
    })
  }, [])

  return {
    progress,
    isRunning,
    isConnected,
    startResearch,
    stopResearch,
    addLog,
    updateProgress,
  }
}
