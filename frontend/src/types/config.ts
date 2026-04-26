// ========== 统一模型配置导入（来自 backend shared module） ==========

import type {
  ProviderId,
} from '../../../skills-backend/shared/model-config'

// ========== Category 配置类型 ==========

/**
 * 任务分类标识（8 种内置 Category）
 * 用于 Oh My OpenCode 的 task() 工具分类调度
 */
export type CategoryId =
  | 'visual-engineering'
  | 'ultrabrain'
  | 'deep'
  | 'artistry'
  | 'quick'
  | 'unspecified-low'
  | 'unspecified-high'
  | 'writing'

/**
 * Category 中文标签映射
 */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  'visual-engineering': '视觉工程',
  'ultrabrain': '深度推理',
  'deep': '深度研究',
  'artistry': '艺术创意',
  'quick': '快速任务',
  'unspecified-low': '通用低',
  'unspecified-high': '通用高',
  'writing': '文档写作',
}

/**
 * Category 英文标签映射
 */
export const CATEGORY_LABELS_EN: Record<CategoryId, string> = {
  'visual-engineering': 'Visual Engineering',
  'ultrabrain': 'Ultrabrain',
  'deep': 'Deep Research',
  'artistry': 'Artistry',
  'quick': 'Quick Tasks',
  'unspecified-low': 'Unspecified Low',
  'unspecified-high': 'Unspecified High',
  'writing': 'Writing',
}

/**
 * Category 描述映射
 */
export const CATEGORY_DESCRIPTIONS: Record<CategoryId, string> = {
  'visual-engineering': '前端、UI/UX、设计、动画',
  'ultrabrain': '深度逻辑推理、复杂架构决策',
  'deep': '自主问题解决、彻底研究',
  'artistry': '创意/非传统方法',
  'quick': '简单任务、typo 修复、单文件更改',
  'unspecified-low': '通用任务、低努力',
  'unspecified-high': '通用任务、高努力',
  'writing': '文档、散文、技术写作',
}

/**
 * Category 默认模型映射（参考 configuration.md）
 */
export const CATEGORY_DEFAULT_MODELS: Record<CategoryId, { model: string; variant?: string }> = {
  'visual-engineering': { model: 'google/gemini-3.1-pro', variant: 'high' },
  'ultrabrain': { model: 'openai/gpt-5.4', variant: 'xhigh' },
  'deep': { model: 'openai/gpt-5.4', variant: 'medium' },
  'artistry': { model: 'google/gemini-3.1-pro', variant: 'high' },
  'quick': { model: 'openai/gpt-5.4-mini' },
  'unspecified-low': { model: 'anthropic/claude-sonnet-4-6' },
  'unspecified-high': { model: 'anthropic/claude-opus-4-6', variant: 'max' },
  'writing': { model: 'google/gemini-3-flash' },
}

/**
 * 模型变体类型
 */
export type ModelVariant = 'max' | 'high' | 'medium' | 'low' | 'xhigh'

/**
 * Category 配置选项
 */
export interface CategoryConfigOptions {
  /** 模型标识 (provider/model 格式) */
  model?: string
  /** 备用模型列表 */
  fallback_models?: string[]
  /** 模型变体 */
  variant?: ModelVariant
  /** 温度参数 */
  temperature?: number
  /** Top-p 参数 */
  top_p?: number
  /** 最大 token 数 */
  maxTokens?: number
  /** 描述（用于 task() 工具提示） */
  description?: string
  /** OpenAI reasoning effort */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  /** Anthropic extended thinking */
  thinking?: { type: 'enabled' | 'disabled'; budgetTokens?: number }
}

/**
 * Category 配置记录
 */
export interface CategoryConfigRecord extends CategoryConfigOptions {
  /** Category ID */
  id: CategoryId
  /** 中文标签 */
  label: string
  /** 英文标签 */
  labelEn: string
  /** 描述 */
  description: string
  /** 是否使用默认配置 */
  useDefault: boolean
}

/**
 * 用户 Category 配置
 */
export interface UserCategoryConfig {
  categories: Partial<Record<CategoryId, CategoryConfigOptions>>
}

/**
 * 所有内置 Category 列表
 */
export const ALL_CATEGORIES: CategoryId[] = [
  'visual-engineering',
  'ultrabrain',
  'deep',
  'artistry',
  'quick',
  'unspecified-low',
  'unspecified-high',
  'writing',
]

// ========== 类型别名（向后兼容） ==========

/**
 * 模型提供商类型（向后兼容别名）
 * @deprecated 使用 ProviderId 替代。旧值映射：
 * - 'openai' → 'openai'
 * - 'anthropic' → 'anthropic'
 * - 'google' → 'google'
 * - 'azure' → 'openai_compatible'
 * - 'local' → 'openai_compatible'
 * - 'custom' → 'openai_compatible'
 */
export type ModelProvider = ProviderId

/**
 * 模型能力标签（向后兼容别名）
 * @deprecated 使用 ProviderCapability 替代。旧值映射（通过 mapLegacyCapability）：
 * - 'vision' → { image, pdf, chart, formula: true }
 * - 'text' → { text: true }
 * - 'code' → { text, toolCalling: true }
 * - 'math' → { text, formula: true }
 * - 'analysis' → { text, jsonMode: true }
 */
export type ModelCapability = 'vision' | 'text' | 'code' | 'math' | 'analysis'

/**
 * 自定义模型配置
 * @deprecated 建议使用 ProviderModelConfig 替代，此接口保留向后兼容
 *
 * 与 ProviderModelConfig 的映射关系：
 * - id → 可映射到 options 中的自定义标识
 * - name → UI 显示名称，不在 ProviderModelConfig 中
 * - provider → ProviderModelConfig.provider
 * - model → ProviderModelConfig.model
 * - apiKey → ProviderModelConfig.apiKey
 * - baseUrl → ProviderModelConfig.baseUrl
 * - parameters → ProviderModelConfig.options (部分字段映射)
 * - capabilities → ProviderCapability 的布尔字段组合
 * - enabled → UI 状态，不在 ProviderModelConfig 中
 */
export interface CustomModelConfig {
  /** 模型唯一标识 */
  id: string
  /** 模型名称（显示用） */
  name: string
  /** 提供商类型 */
  provider: ProviderId
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
    [key: string]: unknown
  }
  /** 模型用途标签（映射到 ProviderCapability） */
  capabilities: ModelCapability[]
  /** 是否启用 */
  enabled: boolean
}

/**
 * 任务-模型映射
 */
export interface TaskMapping {
  figureAnalysis: string
  contentGeneration: string
  formulaRecognition: string
  ocr: string
  tableExtraction: string
  [taskName: string]: string
}

/**
 * 备用策略配置
 */
export interface FallbackStrategy {
  enabled: boolean
  fallbackModelId?: string
  retryCount: number
}

/**
 * 多模态配置（新架构）
 */
export interface MultiModalConfig {
  /** 用户可以配置任意数量的模型 */
  models: CustomModelConfig[]
  /** 用途映射（自由指定哪个模型用于什么任务） */
  taskMapping: TaskMapping
  /** 备用策略 */
  fallbackStrategy: FallbackStrategy
}

/**
 * API 配置类型（兼容旧版）
 * @deprecated 使用 ProviderId 替代。映射关系：
 * - 'openai' → 'openai' (ProviderId)
 * - 'anthropic' → 'anthropic' (ProviderId)
 * - 'custom' → 'openai_compatible' (ProviderId)
 */
export type ApiProvider = 'openai' | 'anthropic' | 'custom'

/**
 * 多模态能力配置（兼容旧版）
 * @deprecated 使用 ProviderCapability 替代。ProviderCapability 提供更细粒度的能力描述：
 * - enableVision → ProviderCapability.image
 * - 其他字段已迁移至 ProviderModelConfig.options
 */
export interface MultimodalConfig {
  /** 是否启用视觉理解 */
  enableVision: boolean
  /** 是否启用图像生成 */
  enableImageGeneration: boolean
  /** 图像生成模型 */
  imageGenerationModel?: string
  /** 图像理解模型 */
  visionModel?: string
  /** 最大图像尺寸 */
  maxImageSize: number
  /** 支持的图像格式 */
  supportedFormats: string[]
}

/**
 * API 配置类型（兼容旧版）
 * @deprecated 使用 ProviderModelConfig 替代。字段映射：
 * - provider → ProviderModelConfig.provider (使用 ProviderId)
 * - baseUrl → ProviderModelConfig.baseUrl
 * - apiKey → ProviderModelConfig.apiKey
 * - model → ProviderModelConfig.model
 * - enabled → UI 状态管理，不在 ProviderModelConfig 中
 * - multimodal → ProviderCapability 布尔字段组合
 * - organizationId → ProviderModelConfig.providerOptions.organizationId
 * - customHeaders → ProviderModelConfig.providerOptions.customHeaders
 */
export interface ApiConfig {
  /** API 提供商 */
  provider: ApiProvider
  /** API 基础 URL */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 模型名称 */
  model: string
  /** 是否启用 */
  enabled: boolean
  /** 多模态配置 */
  multimodal: MultimodalConfig
  /** 组织 ID (OpenAI) */
  organizationId?: string
  /** 自定义请求头 */
  customHeaders?: Record<string, string>
}

/**
 * LLM 生成参数配置
 */
export interface GenerationConfig {
  /** 温度参数 (0-2) - 控制创造性，研究建议 0.3-0.7 */
  temperature: number
  /** 最大 token 数 */
  maxTokens: number
  /** Top P 采样 */
  topP: number
  /** Top K 采样 */
  topK?: number
  /** 频率惩罚 (-2 to 2) */
  frequencyPenalty: number
  /** 存在惩罚 (-2 to 2) */
  presencePenalty: number
  /** 重复惩罚 */
  repetitionPenalty?: number
  /** 上下文窗口 */
  contextWindow: number
  /** 是否启用 JSON 模式 */
  jsonMode: boolean
  /** 是否启用流式输出 */
  streaming: boolean
  /** 超时时间（秒） */
  timeout: number
  /** 重试次数 */
  retryCount: number
}

/**
 * 研究流程配置
 */
export interface ResearchConfig {
  /** 发现阶段配置 */
  discovery: {
    /** 每轮候选论文数量 */
    candidatePoolSize: number
    /** 是否启用双轮发现 */
    enableDualRound: boolean
    /** 相关性阈值 (0-1) */
    relevanceThreshold: number
    /** 方法论评估深度 */
    methodologyDepth: 'shallow' | 'medium' | 'deep'
    /** 搜索范围（年） */
    searchYearRange: number
    /** 最大搜索论文数 */
    maxSearchResults: number
  }
  /** 节点生成配置 */
  nodeGeneration: {
    /** 节点摘要长度 */
    summaryLength: 'concise' | 'standard' | 'detailed'
    /** 是否生成节点配图描述 */
    generateImagePrompt: boolean
    /** 是否自动提取关键引用 */
    extractKeyCitations: boolean
    /** 是否生成英文摘要 */
    generateEnglishSummary: boolean
    /** 是否分析论文图表 */
    analyzeFigures: boolean
  }
  /** 分支管理配置 */
  branchManagement: {
    /** 最大并行分支数 */
    maxParallelBranches: number
    /** 汇流检测敏感度 */
    mergeSensitivity: 'low' | 'medium' | 'high'
    /** 分支休眠阈值（天数） */
    dormantThreshold: number
    /** 是否自动归档休眠分支 */
    autoArchiveDormant: boolean
  }
  /** 批量研究配置 */
  batchResearch: {
    /** 是否启用批量模式 */
    enabled: boolean
    /** 同时处理的主题数 */
    concurrentTopics: number
    /** 每个主题的最大阶段数 */
    maxStagesPerTopic: number
    /** 失败后重试次数 */
    retryFailed: number
    /** 是否跳过已完成的主题 */
    skipCompleted: boolean
    /** 完成阈值（节点数） */
    completionThreshold: number
  }
}

/**
 * 提示词模板配置
 */
export interface PromptTemplateConfig {
  /** 阶段选择提示词 */
  stageSelection: string
  /** 论文发现提示词 */
  paperDiscovery: string
  /** 节点摘要生成提示词 */
  nodeSummary: string
  /** 分支分析提示词 */
  branchAnalysis: string
  /** 图像分析提示词 */
  imageAnalysis: string
  /** 配图生成提示词 */
  imageGeneration: string
  /** 自定义系统提示词 */
  customSystemPrompt: string
}

/**
 * 完整应用配置
 */
export interface AppConfig {
  /** API 配置（兼容旧版） */
  api: ApiConfig
  /** 多模态模型配置（新架构） */
  multimodal: MultiModalConfig
  /** 生成参数 */
  generation: GenerationConfig
  /** 研究流程配置 */
  research: ResearchConfig
  /** 提示词模板 */
  prompts: PromptTemplateConfig
  /** 版本号 */
  version: string
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 默认多模态配置
 */
export const DEFAULT_MULTIMODAL_CONFIG: MultiModalConfig = {
  models: [
    {
      id: 'gpt-4o-vision',
      name: 'GPT-4o Vision',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',
      parameters: {
        temperature: 0.3,
        maxTokens: 4000,
        topP: 1,
      },
      capabilities: ['vision', 'text', 'analysis'],
      enabled: true,
    },
    {
      id: 'claude-3-opus',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      model: 'claude-3-opus-20240229',
      apiKey: '',
      parameters: {
        temperature: 0.4,
        maxTokens: 8000,
        topP: 1,
      },
      capabilities: ['text', 'code', 'math'],
      enabled: true,
    },
    {
      id: 'gemini-pro-vision',
      name: 'Gemini Pro Vision',
      provider: 'google',
      model: 'gemini-pro-vision',
      apiKey: '',
      parameters: {
        temperature: 0.3,
        maxTokens: 4000,
        topP: 1,
      },
      capabilities: ['vision', 'text'],
      enabled: false,
    },
    {
      id: 'local-llava',
      name: '本地 LLaVA 模型',
      provider: 'openai_compatible',
      model: 'llava-v1.5-13b',
      baseUrl: 'http://localhost:8000',
      apiKey: '',
      parameters: {
        temperature: 0.3,
        maxTokens: 2000,
        topP: 1,
      },
      capabilities: ['vision', 'text'],
      enabled: false,
    },
  ],
  taskMapping: {
    figureAnalysis: 'gpt-4o-vision',
    contentGeneration: 'claude-3-opus',
    formulaRecognition: 'gpt-4o-vision',
    ocr: 'gpt-4o-vision',
    tableExtraction: 'gpt-4o-vision',
  },
  fallbackStrategy: {
    enabled: true,
    fallbackModelId: 'claude-3-opus',
    retryCount: 2,
  },
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: AppConfig = {
  api: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
    enabled: false,
    multimodal: {
      enableVision: true,
      enableImageGeneration: false,
      imageGenerationModel: 'dall-e-3',
      visionModel: 'gpt-4o',
      maxImageSize: 20 * 1024 * 1024, // 20MB
      supportedFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
    },
    organizationId: '',
    customHeaders: {},
  },
  multimodal: DEFAULT_MULTIMODAL_CONFIG,
  generation: {
    temperature: 0.5,
    maxTokens: 4096,
    topP: 0.9,
    topK: 50,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    repetitionPenalty: 1.0,
    contextWindow: 128000,
    jsonMode: true,
    streaming: true,
    timeout: 120,
    retryCount: 3,
  },
  research: {
    discovery: {
      candidatePoolSize: 10,
      enableDualRound: true,
      relevanceThreshold: 0.7,
      methodologyDepth: 'medium',
      searchYearRange: 5,
      maxSearchResults: 50,
    },
    nodeGeneration: {
      summaryLength: 'standard',
      generateImagePrompt: true,
      extractKeyCitations: true,
      generateEnglishSummary: true,
      analyzeFigures: true,
    },
    branchManagement: {
      maxParallelBranches: 5,
      mergeSensitivity: 'medium',
      dormantThreshold: 90,
      autoArchiveDormant: true,
    },
    batchResearch: {
      enabled: true,
      concurrentTopics: 2,
      maxStagesPerTopic: 10,
      retryFailed: 2,
      skipCompleted: true,
      completionThreshold: 5,
    },
  },
  prompts: {
    stageSelection: `你是一位研究阶段分析专家。请基于当前主题的上下文，分析应该推进到哪个研究阶段。

输入：
- 主题名称：{topicName}
- 当前阶段：{currentStage}
- 问题定义：{problemDefinition}
- 已有节点：{existingNodes}

输出要求（JSON格式）：
{
  "recommendedStage": number,
  "stageTitle": string,
  "stageObjective": string,
  "keyQuestions": string[],
  "rationale": string
}`,

    paperDiscovery: `你是一位学术论文发现专家。请基于给定的研究阶段上下文，发现相关的候选论文。

输入：
- 阶段上下文：{stageContext}
- 搜索范围：{searchScope}
- 排除列表：{excludedPapers}

输出要求（JSON格式）：
{
  "candidates": [
    {
      "title": string,
      "authors": string[],
      "year": number,
      "abstract": string,
      "relevanceScore": number,
      "methodologyMatch": string,
      "reasoning": string
    }
  ]
}`,

    nodeSummary: `你是一位学术内容凝练专家。请基于论文内容生成节点的摘要和标签。

输入：
- 论文标题：{paperTitle}
- 论文摘要：{paperAbstract}
- 所属分支：{branchLabels}
- 阶段索引：{stageIndex}

输出要求（JSON格式）：
{
  "nodeLabel": string,
  "nodeSummary": string,
  "nodeExplanation": string,
  "keyContributions": string[],
  "imagePrompt": string,
  "englishSummary": string
}`,

    branchAnalysis: `你是一位研究分支分析专家。请分析当前节点与现有分支的关系。

输入：
- 节点信息：{nodeInfo}
- 现有分支：{existingBranches}
- 汇流候选：{mergeCandidates}

输出要求（JSON格式）：
{
  "recommendedBranchId": string,
  "createNewBranch": boolean,
  "newBranchLabel": string,
  "isMergeNode": boolean,
  "mergedBranchIds": string[],
  "branchStatus": "active" | "candidate" | "dormant"
}`,

    imageAnalysis: `你是一位学术论文图像分析专家。请分析论文中的图表内容。

输入：
- 图像：{image}
- 论文标题：{paperTitle}
- 图表标题：{figureCaption}

输出要求（JSON格式）：
{
  "figureType": "chart" | "diagram" | "table" | "image",
  "description": string,
  "keyInsights": string[],
  "relevanceToPaper": string
}`,

    imageGeneration: `为学术研究节点生成配图描述。请生成一个适合作为论文节点封面的图像提示词。

输入：
- 节点标题：{nodeTitle}
- 节点摘要：{nodeSummary}
- 所属领域：{field}

输出要求：
生成一个详细的图像生成提示词（英文），用于 DALL-E 或类似模型。`,

    customSystemPrompt: '你是一位专业的学术研究助手，擅长分析论文、发现研究脉络、凝练学术观点。请始终输出结构化的 JSON 响应。',
  },
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
}

/**
 * 研究会话配置
 */
export interface ResearchSessionConfig {
  /** 目标主题ID列表（批量模式） */
  topicIds: string[]
  /** 研究模式 */
  mode: 'full' | 'discovery-only' | 'node-only' | 'branch-only' | 'batch'
  /** 起始阶段 */
  startStage: number
  /** 目标阶段 */
  targetStage?: number
  /** 是否使用缓存 */
  useCache: boolean
  /** 是否生成配图 */
  generateImages: boolean
  /** 实时输出到前端 */
  streamOutput: boolean
  /** 批量配置 */
  batchOptions?: {
    /** 跳过已完成的主题 */
    skipCompleted: boolean
    /** 完成阈值 */
    completionThreshold: number
    /** 同时处理数 */
    concurrent: number
  }
}

/**
 * 研究进度状态
 */
export interface ResearchProgress {
  /** 会话ID */
  sessionId: string
  /** 当前状态 */
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error'
  /** 当前阶段 */
  currentStage: string
  /** 当前主题 */
  currentTopic?: string
  /** 进度百分比 */
  progress: number
  /** 已完成的主题数 */
  completedTopics: number
  /** 总主题数 */
  totalTopics: number
  /** 日志消息 */
  logs: ResearchLogEntry[]
  /** 主题进度详情 */
  topicProgress: TopicProgressEntry[]
  /** 开始时间 */
  startedAt: string
  /** 预计完成时间 */
  estimatedCompleteAt?: string
}

export interface ResearchLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  topicId?: string
  details?: Record<string, unknown>
}

export interface TopicProgressEntry {
  topicId: string
  topicName: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  currentStage: number
  totalStages: number
  nodeCount: number
  startedAt?: string
  completedAt?: string
  error?: string
}

/**
 * 主题研究状态
 */
export interface TopicResearchStatus {
  topicId: string
  topicName: string
  /** 研究状态 */
  status: 'not-started' | 'in-progress' | 'completed' | 'failed'
  /** 当前阶段 */
  currentStage: number
  /** 总节点数 */
  nodeCount: number
  /** 是否达到完成阈值 */
  isCompleted: boolean
  /** 最后研究时间 */
  lastResearchAt?: string
  /** 错误信息 */
  error?: string
}

// ========== 统一模型配置类型重导出 ==========

/**
 * 重导出 backend shared module 的统一类型
 * 这些类型是前后端共享的标准类型定义
 */
export type {
  ProviderId,
  ProviderCapability,
  ProviderModelConfig,
  ProviderModelRef,
  ProviderModelOptions,
  UserModelConfig,
  SanitizedUserModelConfig,
  SanitizedProviderModelConfig,
  ProviderCatalogEntry,
  ProviderCatalogModel,
  ModelPreset,
  OmniTask,
  ResearchRoleId,
  ModelSlot,
  TaskRouteTarget,
  OmniMessage,
  OmniAttachment,
  OmniCompleteRequest,
  OmniCompletionResult,
  ThinkingMode,
  CitationMode,
  ParserMode,
  ProviderAdapter,
  ProviderUiHints,
  ProviderConfigField,
  ConfigHistoryEntry,
  ConfigVersionInfo,
} from '../../../skills-backend/shared/model-config'

/**
 * 重导出常量和辅助函数
 */
export {
  PROVIDER_LABELS,
  OMNI_TASK_LABELS,
  RESEARCH_ROLE_LABELS,
  TEXT_ONLY_CAPABILITY,
  MULTIMODAL_FULL_CAPABILITY,
  ANTHROPIC_NATIVE_CAPABILITY,
  LEGACY_PROVIDER_MAP,
  DEFAULT_MODEL_PRESETS,
} from '../../../skills-backend/shared/model-config'
