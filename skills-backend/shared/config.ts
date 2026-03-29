/**
 * 系统配置模块
 * 支持全局默认配置和按主题覆盖
 */

// ========== 多模态模型配置 ==========

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'local' | 'custom'

export type ModelCapability = 'vision' | 'text' | 'code' | 'math' | 'analysis'

export interface CustomModelConfig {
  /** 模型唯一标识 */
  id: string
  /** 模型名称（显示用） */
  name: string
  /** 提供商类型 */
  provider: ModelProvider
  /** 模型标识 */
  model: string
  /** API配置 */
  apiKey: string
  baseUrl?: string
  /** 生成参数（完全可自定义） */
  parameters: {
    temperature: number
    maxTokens: number
    topP?: number
    frequencyPenalty?: number
    presencePenalty?: number
    [key: string]: any
  }
  /** 模型用途标签 */
  capabilities: ModelCapability[]
  /** 是否启用 */
  enabled: boolean
}

export interface MultiModalConfig {
  /** 用户可以配置任意数量的模型 */
  models: CustomModelConfig[]
  /** 用途映射（自由指定哪个模型用于什么任务） */
  taskMapping: {
    figureAnalysis: string
    contentGeneration: string
    formulaRecognition: string
    ocr: string
    tableExtraction: string
    [taskName: string]: string
  }
  /** 备用策略 */
  fallbackStrategy: {
    enabled: boolean
    fallbackModelId?: string
    retryCount: number
  }
}

export interface DiscoveryConfig {
  /** 默认时间窗（月），按优先级排序 */
  defaultWindowMonths: number[]
  /** 每轮最大候选数 */
  maxCandidatesPerRound: number
  /** 最大查询轮数 */
  maxRounds: number
  /** 是否启用第二轮查询 */
  enableRound2: boolean
  /** 最小置信度阈值 */
  minConfidenceThreshold: number
  /** 最小候选数阈值（触发第二轮） */
  minCandidatesThreshold: number
}

export interface NodeMergeConfig {
  /** 单节点最大论文数 */
  maxPapersPerNode: number
  /** 单节点最大时间跨度（月） */
  maxTimeSpanMonths: number
  /** 是否启用跨分支归并 */
  enableCrossBranchMerge: boolean
  /** 是否启用同分支归并 */
  enableSameBranchMerge: boolean
  /** 归并置信度阈值 */
  confidenceThreshold: number
}

export interface ContentGenConfig {
  /** 最小字数 */
  minWordCount: number
  /** 最大字数 */
  maxWordCount: number
  /** 是否启用多模态 */
  enableMultimodal: boolean
  /** 覆盖率阈值 */
  coverageThreshold: number
  /** 最大重试次数 */
  maxRetryAttempts: number
}

export interface DisplayConfig {
  /** 每阶段最大节点数 */
  maxNodesPerStage: number
  /** 每节点最大展示论文数 */
  maxPapersPerNode: number
  /** 是否启用懒加载 */
  enableLazyLoad: boolean
  /** 缓存过期时间（分钟） */
  cacheExpiryMinutes: number
}

export interface SystemConfig {
  discovery: DiscoveryConfig
  nodeMerge: NodeMergeConfig
  contentGen: ContentGenConfig
  display: DisplayConfig
  multimodal: MultiModalConfig
}

/** 主题级配置覆盖 */
export type TopicConfigOverrides = Partial<{
  [topicId: string]: Partial<SystemConfig>
}>

/** 完整配置结构 */
export interface AppConfig {
  version: string
  defaults: SystemConfig
  topicOverrides: TopicConfigOverrides
}

// 默认多模态配置
export const DEFAULT_MULTIMODAL_CONFIG: MultiModalConfig = {
  models: [
    {
      id: 'gpt-4o-vision',
      name: 'GPT-4o Vision',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY || '',
      parameters: {
        temperature: 0.3,
        maxTokens: 4000,
        topP: 1
      },
      capabilities: ['vision', 'text', 'analysis'],
      enabled: true
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      parameters: {
        temperature: 0.4,
        maxTokens: 8000,
        topP: 1
      },
      capabilities: ['text', 'code', 'math'],
      enabled: true
    },
    {
      id: 'gemini-pro-vision',
      name: 'Gemini Pro Vision',
      provider: 'google',
      model: 'gemini-pro-vision',
      apiKey: process.env.GOOGLE_API_KEY || '',
      parameters: {
        temperature: 0.3,
        maxTokens: 4000,
        topP: 1
      },
      capabilities: ['vision', 'text'],
      enabled: false
    },
    {
      id: 'local-llava',
      name: '本地LLaVA模型',
      provider: 'local',
      model: 'llava-v1.5-13b',
      baseUrl: 'http://localhost:8000',
      apiKey: '',
      parameters: {
        temperature: 0.3,
        maxTokens: 2000,
        topP: 1
      },
      capabilities: ['vision', 'text'],
      enabled: false
    }
  ],
  taskMapping: {
    figureAnalysis: 'gpt-4o-vision',
    contentGeneration: 'claude-3-opus',
    formulaRecognition: 'gpt-4o-vision',
    ocr: 'gpt-4o-vision',
    tableExtraction: 'gpt-4o-vision'
  },
  fallbackStrategy: {
    enabled: true,
    fallbackModelId: 'claude-3-opus',
    retryCount: 2
  }
}

// 默认配置
export const DEFAULT_CONFIG: SystemConfig = {
  discovery: {
    defaultWindowMonths: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    maxCandidatesPerRound: 50,
    maxRounds: 2,
    enableRound2: true,
    minConfidenceThreshold: 0.6,
    minCandidatesThreshold: 5
  },
  nodeMerge: {
    maxPapersPerNode: 10,
    maxTimeSpanMonths: 12,
    enableCrossBranchMerge: true,
    enableSameBranchMerge: true,
    confidenceThreshold: 0.7
  },
  contentGen: {
    minWordCount: 2000,
    maxWordCount: 3000,
    enableMultimodal: true,
    coverageThreshold: 0.8,
    maxRetryAttempts: 3
  },
  display: {
    maxNodesPerStage: 20,
    maxPapersPerNode: 10,
    enableLazyLoad: true,
    cacheExpiryMinutes: 60
  },
  multimodal: DEFAULT_MULTIMODAL_CONFIG
}

// 主题级覆盖示例
export const DEFAULT_TOPIC_OVERRIDES: TopicConfigOverrides = {
  // Agent领域发展快，时间窗更短
  agent: {
    discovery: {
      defaultWindowMonths: [3, 4, 5, 6, 7, 8]
    } as Partial<DiscoveryConfig>
  },
  // 自动驾驶论文多，放宽限制
  'autonomous-driving': {
    nodeMerge: {
      maxPapersPerNode: 15
    } as Partial<NodeMergeConfig>
  }
}

/**
 * 合并配置
 * 优先级: 主题覆盖 > 默认值
 */
export function mergeConfig(
  defaults: SystemConfig,
  topicOverride?: Partial<SystemConfig>
): SystemConfig {
  if (!topicOverride) return defaults

  return {
    discovery: { ...defaults.discovery, ...topicOverride.discovery },
    nodeMerge: { ...defaults.nodeMerge, ...topicOverride.nodeMerge },
    contentGen: { ...defaults.contentGen, ...topicOverride.contentGen },
    display: { ...defaults.display, ...topicOverride.display },
    multimodal: topicOverride.multimodal 
      ? mergeMultimodalConfig(defaults.multimodal, topicOverride.multimodal)
      : defaults.multimodal
  }
}

/**
 * 合并多模态配置
 */
export function mergeMultimodalConfig(
  defaults: MultiModalConfig,
  override: Partial<MultiModalConfig>
): MultiModalConfig {
  return {
    models: override.models || defaults.models,
    taskMapping: { ...defaults.taskMapping, ...override.taskMapping },
    fallbackStrategy: { ...defaults.fallbackStrategy, ...override.fallbackStrategy }
  }
}

/**
 * 获取主题配置
 */
export function getTopicConfig(
  topicId: string,
  appConfig: AppConfig
): SystemConfig {
  const override = appConfig.topicOverrides[topicId]
  return mergeConfig(appConfig.defaults, override)
}

/**
 * 配置验证
 */
export interface ValidationError {
  path: string
  message: string
}

export function validateConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    errors.push({ path: '', message: '配置必须是对象' })
    return errors
  }

  const cfg = config as Partial<SystemConfig>

  // 验证 discovery
  if (cfg.discovery) {
    const d = cfg.discovery
    if (!Array.isArray(d.defaultWindowMonths) || d.defaultWindowMonths.length === 0) {
      errors.push({ path: 'discovery.defaultWindowMonths', message: '必须是至少包含一个元素的数组' })
    }
    if (typeof d.maxCandidatesPerRound !== 'number' || d.maxCandidatesPerRound <= 0) {
      errors.push({ path: 'discovery.maxCandidatesPerRound', message: '必须是正数' })
    }
    if (typeof d.minConfidenceThreshold !== 'number' || d.minConfidenceThreshold < 0 || d.minConfidenceThreshold > 1) {
      errors.push({ path: 'discovery.minConfidenceThreshold', message: '必须在0-1之间' })
    }
  }

  // 验证 nodeMerge
  if (cfg.nodeMerge) {
    const n = cfg.nodeMerge
    if (typeof n.maxPapersPerNode !== 'number' || n.maxPapersPerNode <= 0) {
      errors.push({ path: 'nodeMerge.maxPapersPerNode', message: '必须是正数' })
    }
    if (typeof n.maxTimeSpanMonths !== 'number' || n.maxTimeSpanMonths <= 0) {
      errors.push({ path: 'nodeMerge.maxTimeSpanMonths', message: '必须是正数' })
    }
  }

  // 验证 contentGen
  if (cfg.contentGen) {
    const c = cfg.contentGen
    if (typeof c.minWordCount !== 'number' || c.minWordCount <= 0) {
      errors.push({ path: 'contentGen.minWordCount', message: '必须是正数' })
    }
    if (typeof c.maxWordCount !== 'number' || c.maxWordCount < (c.minWordCount || 0)) {
      errors.push({ path: 'contentGen.maxWordCount', message: '必须大于minWordCount' })
    }
  }

  return errors
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(): Partial<SystemConfig> {
  const config: Partial<SystemConfig> = {}

  // Discovery
  if (process.env.DISCOVERY_MAX_ROUNDS) {
    config.discovery = {
      ...config.discovery,
      maxRounds: parseInt(process.env.DISCOVERY_MAX_ROUNDS, 10)
    }
  }
  if (process.env.DISCOVERY_ENABLE_ROUND2) {
    config.discovery = {
      ...config.discovery,
      enableRound2: process.env.DISCOVERY_ENABLE_ROUND2 === 'true'
    }
  }

  // NodeMerge
  if (process.env.NODE_MERGE_MAX_PAPERS) {
    config.nodeMerge = {
      ...config.nodeMerge,
      maxPapersPerNode: parseInt(process.env.NODE_MERGE_MAX_PAPERS, 10)
    }
  }

  // ContentGen
  if (process.env.CONTENT_GEN_MAX_RETRIES) {
    config.contentGen = {
      ...config.contentGen,
      maxRetryAttempts: parseInt(process.env.CONTENT_GEN_MAX_RETRIES, 10)
    }
  }

  return config
}
