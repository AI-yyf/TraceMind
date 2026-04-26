/**
 * 统一模型配置类型定义
 * 前后端共享的规范类型系统
 *
 * 注意：中文是默认表达语言，Provider标签使用中文
 */

// ========== Provider 定义 ==========

/**
 * 模型提供商标识（10种）
 * 包含国际提供商和中国本土提供商
 */
export type ProviderId =
  | 'nvidia'
  | 'openai_compatible'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'dashscope'    // 阿里百炼
  | 'bigmodel'     // 智谱
  | 'ark'          // 火山方舟
  | 'hunyuan'      // 腾讯混元
  | 'deepseek'

/**
 * Provider 中文标签映射
 */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  nvidia: 'NVIDIA Integrate',
  openai_compatible: 'OpenAI-Compatible / 自定义',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  dashscope: '阿里百炼',
  bigmodel: '智谱',
  ark: '火山方舟',
  hunyuan: '腾讯混元',
  deepseek: 'DeepSeek',
}

/**
 * Provider 适配器类型
 */
export type ProviderAdapter = 'openai-compatible' | 'anthropic' | 'google'

// ========== Task 和 Role 定义 ==========

/**
 * Omni 任务类型（9种）
 */
export type OmniTask =
  | 'general_chat'
  | 'topic_chat'
  | 'topic_chat_vision'
  | 'topic_summary'
  | 'document_parse'
  | 'figure_analysis'
  | 'formula_recognition'
  | 'table_extraction'
  | 'evidence_explainer'

/**
 * Omni 任务中文标签映射
 */
export const OMNI_TASK_LABELS: Record<OmniTask, string> = {
  general_chat: '通用对话',
  topic_chat: '主题对话',
  topic_chat_vision: '视觉对话',
  topic_summary: '主题摘要',
  document_parse: '文档解析',
  figure_analysis: '图表分析',
  formula_recognition: '公式识别',
  table_extraction: '表格提取',
  evidence_explainer: '证据解释',
}

/**
 * 模型槽位（语言/多模态）
 */
export type ModelSlot = 'language' | 'multimodal'

/**
 * 研究角色标识（8种）
 * Agent系统中的角色分工
 */
export type ResearchRoleId =
  | 'workbench_chat'
  | 'topic_architect'
  | 'research_judge'
  | 'node_writer'
  | 'paper_writer'
  | 'critic'
  | 'localizer'
  | 'vision_reader'

/**
 * 研究角色中文标签映射
 */
export const RESEARCH_ROLE_LABELS: Record<ResearchRoleId, string> = {
  workbench_chat: '工作台对话',
  topic_architect: '主题架构师',
  research_judge: '研究裁判',
  node_writer: '节点撰写者',
  paper_writer: '论文撰写者',
  critic: '评论家',
  localizer: '本地化专员',
  vision_reader: '视觉阅读器',
}

/**
 * 任务路由目标（槽位或角色）
 */
export type TaskRouteTarget = ModelSlot | ResearchRoleId

// ========== 能力定义 ==========

/**
 * Provider 能力定义（10布尔字段）
 * 描述模型的具体能力支持
 */
export interface ProviderCapability {
  /** 文本生成 */
  text: boolean
  /** 图像理解 */
  image: boolean
  /** PDF解析 */
  pdf: boolean
  /** 图表分析 */
  chart: boolean
  /** 公式识别 */
  formula: boolean
  /** 原生引用支持 */
  citationsNative: boolean
  /** 原生文件解析 */
  fileParserNative: boolean
  /** 工具调用 */
  toolCalling: boolean
  /** JSON模式 */
  jsonMode: boolean
  /** 流式输出 */
  streaming: boolean
}

/**
 * 默认文本能力
 */
export const TEXT_ONLY_CAPABILITY: ProviderCapability = {
  text: true,
  image: false,
  pdf: false,
  chart: false,
  formula: false,
  citationsNative: false,
  fileParserNative: false,
  toolCalling: true,
  jsonMode: true,
  streaming: true,
}

/**
 * 默认多模态能力
 */
export const MULTIMODAL_FULL_CAPABILITY: ProviderCapability = {
  text: true,
  image: true,
  pdf: true,
  chart: true,
  formula: true,
  citationsNative: false,
  fileParserNative: true,
  toolCalling: true,
  jsonMode: true,
  streaming: true,
}

/**
 * Anthropic 原生能力（带引用）
 */
export const ANTHROPIC_NATIVE_CAPABILITY: ProviderCapability = {
  ...MULTIMODAL_FULL_CAPABILITY,
  citationsNative: true,
}

// ========== 配置接口 ==========

/**
 * 思考模式
 */
export type ThinkingMode = 'on' | 'off' | 'auto'

/**
 * 引用模式
 */
export type CitationMode = 'native' | 'backend'

/**
 * 解析模式
 */
export type ParserMode = 'native' | 'backend'

/**
 * 模型选项
 */
export interface ProviderModelOptions {
  thinking?: ThinkingMode
  citations?: CitationMode
  parser?: ParserMode
  temperature?: number
  maxTokens?: number
}

/**
 * Provider 模型引用
 */
export interface ProviderModelRef {
  provider: ProviderId
  model: string
}

/**
 * Provider 模型配置
 */
export interface ProviderModelConfig extends ProviderModelRef {
  baseUrl?: string
  apiKeyRef?: string
  apiKey?: string
  providerOptions?: Record<string, unknown>
  options?: ProviderModelOptions
}

/**
 * 用户模型配置
 * 包含语言槽位、多模态槽位、角色覆盖、任务路由、Categories配置
 */
export interface UserModelConfig {
  language?: ProviderModelConfig | null
  multimodal?: ProviderModelConfig | null
  roles?: Partial<Record<ResearchRoleId, ProviderModelConfig | null>>
  taskOverrides?: Partial<Record<OmniTask, ProviderModelRef>>
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>
  categories?: CategoriesConfig
  disabledCategories?: string[]
}

/**
 * 已清理的 Provider 模型配置（用于前端展示）
 * API key 被掩码处理
 */
export interface SanitizedProviderModelConfig extends ProviderModelRef {
  baseUrl?: string
  apiKeyRef?: string
  apiKeyStatus: 'configured' | 'missing'
  apiKeyPreview?: string
  providerOptions?: Record<string, unknown>
  options?: ProviderModelOptions
}

/**
 * 已清理的用户模型配置（用于前端展示）
 */
export interface SanitizedUserModelConfig {
  language: SanitizedProviderModelConfig | null
  multimodal: SanitizedProviderModelConfig | null
  roles?: Partial<Record<ResearchRoleId, SanitizedProviderModelConfig | null>>
  taskOverrides?: Partial<Record<OmniTask, ProviderModelRef>>
  taskRouting?: Partial<Record<OmniTask, TaskRouteTarget>>
  categories?: CategoriesConfig
  disabledCategories?: string[]
}

// ========== 预设和目录 ==========

/**
 * 模型预设
 */
export interface ModelPreset {
  id: string
  label: string
  description: string
  language: ProviderModelRef
  multimodal: ProviderModelRef
}

/**
 * Provider 目录模型
 */
export interface ProviderCatalogModel {
  id: string
  label: string
  slot: 'language' | 'multimodal' | 'both'
  capabilities: ProviderCapability
  recommended?: boolean
  description?: string
}

/**
 * Provider UI 提示
 */
export interface ProviderUiHints {
  supportsCustomBaseUrl?: boolean
  supportsCustomHeaders?: boolean
  tone?: 'global' | 'china' | 'custom'
  recommendedFor?: string[]
}

/**
 * Provider 配置字段
 */
export interface ProviderConfigField {
  key: string
  label: string
  description: string
  type: 'string' | 'number' | 'boolean' | 'json'
  placeholder?: string
  defaultValue?: string | number | boolean | Record<string, string> | null
  multiline?: boolean
}

/**
 * Provider 目录条目
 */
export interface ProviderCatalogEntry {
  provider: ProviderId
  label: string
  baseUrl: string
  adapter: ProviderAdapter
  providerAuthEnvVars: string[]
  configFields?: ProviderConfigField[]
  uiHints?: ProviderUiHints
  models: ProviderCatalogModel[]
}

// ========== 配置历史 ==========

/**
 * 配置历史条目
 */
export interface ConfigHistoryEntry {
  version: number
  timestamp: string
  actor: string
  diffSummary: string
  config: UserModelConfig
}

/**
 * 配置版本信息
 */
export interface ConfigVersionInfo {
  currentVersion: number
  historyCount: number
  lastModified: string
  lastActor: string
}

// ========== 消息和请求 ==========

/**
 * Omni 附件
 */
export interface OmniAttachment {
  type: 'image' | 'pdf' | 'table'
  mimeType: string
  url?: string
  base64?: string
  caption?: string
}

/**
 * Omni 消息
 */
export interface OmniMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: OmniAttachment[]
}

/**
 * Omni 完成请求
 */
export interface OmniCompleteRequest {
  task: OmniTask
  messages: OmniMessage[]
  preferredSlot?: ModelSlot
  role?: ResearchRoleId
  userId?: string
  json?: boolean
  temperature?: number
  maxTokens?: number
}

/**
 * Omni 问题码
 */
export type OmniIssueCode = 'missing_key' | 'invalid_key' | 'provider_error'

/**
 * Omni 问题
 */
export interface OmniIssue {
  code: OmniIssueCode
  title: string
  message: string
  provider?: ProviderId | 'backend'
  model?: string
  slot?: ModelSlot
}

/**
 * Omni 完成结果
 */
export interface OmniCompletionResult {
  text: string
  reasoning?: string
  provider: ProviderId | 'backend'
  model: string
  slot: ModelSlot
  capabilities: ProviderCapability
  usedFallback: boolean
  issue?: OmniIssue
}

// ========== 迁移兼容类型 ==========

/**
 * 旧版 ModelProvider（已废弃）
 * @deprecated 使用 ProviderId 替代
 */
export type LegacyModelProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'local' | 'custom'

/**
 * 旧版到新版 Provider 映射
 */
export const LEGACY_PROVIDER_MAP: Record<LegacyModelProvider, ProviderId> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  azure: 'openai_compatible',
  local: 'openai_compatible',
  custom: 'openai_compatible',
}

/**
 * 旧版 ModelCapability（已废弃）
 * @deprecated 使用 ProviderCapability 替代
 */
export type LegacyModelCapability = 'vision' | 'text' | 'code' | 'math' | 'analysis'

/**
 * 旧版能力到新版能力映射
 */
export function mapLegacyCapability(cap: LegacyModelCapability): Partial<ProviderCapability> {
  switch (cap) {
    case 'vision':
      return { image: true, pdf: true, chart: true, formula: true }
    case 'text':
      return { text: true }
    case 'code':
      return { text: true, toolCalling: true }
    case 'math':
      return { text: true, formula: true }
    case 'analysis':
      return { text: true, jsonMode: true }
    default:
      return {}
  }
}

// ========== 默认预设 ==========

/**
 * 默认预设列表
 */
export const DEFAULT_MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'china-hybrid',
    label: '中国混合（推荐）',
    description: '默认 GLM-5 用于文本，GLM-4.6V 用于多模态。推荐中国部署。',
    language: { provider: 'bigmodel', model: 'glm-5' },
    multimodal: { provider: 'bigmodel', model: 'glm-4.6v' },
  },
  {
    id: 'compatible-kimi-dual',
    label: '兼容 Kimi 双槽位',
    description: '单一 OpenAI-Compatible 网关，Kimi 覆盖两个默认槽位。',
    language: { provider: 'openai_compatible', model: 'Kimi-K2.5' },
    multimodal: { provider: 'openai_compatible', model: 'Kimi-K2.5' },
  },
  {
    id: 'nvidia-integrate',
    label: 'NVIDIA Integrate',
    description: '官方 NVIDIA Integrate 预设，强文本 + 长上下文多模态。',
    language: { provider: 'nvidia', model: 'minimaxai/minimax-m2.5' },
    multimodal: { provider: 'nvidia', model: 'moonshotai/kimi-k2.5' },
  },
  {
    id: 'global-frontier',
    label: '全球前沿',
    description: 'OpenAI 用于语言，Anthropic 用于多模态深度阅读。',
    language: { provider: 'openai', model: 'gpt-5.4' },
    multimodal: { provider: 'anthropic', model: 'claude-sonnet-4-0' },
  },
  {
    id: 'china-max',
    label: '中国最强',
    description: '顶尖本土推理 + 多模态配对。',
    language: { provider: 'deepseek', model: 'deepseek-reasoner' },
    multimodal: { provider: 'dashscope', model: 'qwen3-vl-plus' },
  },
]

// ========== Zod 验证 Schema（导出供运行时使用） ==========

// 注意：Zod schema 需要在运行时导入 zod 库
// 这里只导出类型，实际 schema 定义在 config-store.ts 中

/**
 * ProviderId 验证正则
 */
export const PROVIDER_ID_PATTERN = /^(nvidia|openai_compatible|openai|anthropic|google|dashscope|bigmodel|ark|hunyuan|deepseek)$/

/**
 * OmniTask 验证正则
 */
export const OMNI_TASK_PATTERN = /^(general_chat|topic_chat|topic_chat_vision|topic_summary|document_parse|figure_analysis|formula_recognition|table_extraction|evidence_explainer)$/

/**
 * ResearchRoleId 验证正则
 */
export const RESEARCH_ROLE_PATTERN = /^(workbench_chat|topic_architect|research_judge|node_writer|paper_writer|critic|localizer|vision_reader)$/

/**
 * ModelSlot 验证正则
 */
export const MODEL_SLOT_PATTERN = /^(language|multimodal)$/

// ========== Runtime Fallback 配置 ==========

/**
 * 错误分类类型
 */
export type FallbackErrorClass =
  | 'quota_exceeded'
  | 'missing_api_key'
  | 'model_not_found'
  | 'rate_limited'
  | 'provider_error'
  | 'timeout'
  | 'unknown'

/**
 * Runtime Fallback 配置
 * 定义模型切换策略
 */
export interface RuntimeFallbackConfig {
  /** 是否启用运行时回退 (默认: false) */
  enabled?: boolean
  /** 触发回退的 HTTP 状态码 (默认: [400, 429, 503, 529]) */
  retry_on_errors?: number[]
  /** 每次会话最大回退尝试次数 (默认: 3, 范围: 1-20) */
  max_fallback_attempts?: number
  /** 回退冷却时间 (秒) (默认: 60) */
  cooldown_seconds?: number
  /** 会话超时时间 (秒) (默认: 30) */
  timeout_seconds?: number
  /** 切换模型时是否显示通知 (默认: true) */
  notify_on_fallback?: boolean
}

/**
 * Runtime Fallback 默认配置
 */
export const DEFAULT_RUNTIME_FALLBACK_CONFIG: RuntimeFallbackConfig = {
  enabled: false,
  retry_on_errors: [400, 429, 503, 529],
  max_fallback_attempts: 3,
  cooldown_seconds: 60,
  timeout_seconds: 30,
  notify_on_fallback: true,
}

/**
 * Fallback 状态机状态
 */
export type FallbackStateStatus =
  | 'idle'
  | 'active'
  | 'cooldown'
  | 'exhausted'

/**
 * Fallback 状态
 * 追踪当前回退会话的状态
 */
export interface FallbackState {
  /** 原始模型标识 */
  originalModel: string
  /** 当前使用的模型标识 */
  currentModel: string
  /** 当前回退索引 */
  fallbackIndex: number
  /** 已失败的模型列表 */
  failedModels: string[]
  /** 最后一次错误时间戳 */
  lastErrorTime: number
  /** 状态机当前状态 */
  status: FallbackStateStatus
  /** 最后一次错误分类 */
  lastErrorClass?: FallbackErrorClass
  /** 最后一次错误消息 */
  lastErrorMessage?: string
  /** 会话开始时间 */
  sessionStartTime: number
  /** 回退尝试次数 */
  attemptCount: number
}

/**
 * 创建初始 Fallback 状态
 */
export function createInitialFallbackState(originalModel: string): FallbackState {
  return {
    originalModel,
    currentModel: originalModel,
    fallbackIndex: 0,
    failedModels: [],
    lastErrorTime: 0,
    status: 'idle',
    sessionStartTime: Date.now(),
    attemptCount: 0,
  }
}

/**
 * Fallback 决策结果
 */
export interface FallbackDecision {
  /** 是否应该触发回退 */
  shouldFallback: boolean
  /** 下一个回退模型 (如果应该回退) */
  nextModel?: string
  /** 回退原因 */
  reason?: string
  /** 状态更新 */
  stateUpdate?: Partial<FallbackState>
}

/**
 * Provider 能力匹配要求
 */
export interface FallbackModelRequirement {
  /** 需要的槽位 */
  slot: ModelSlot
  /** 是否需要视觉能力 */
  requiresVision: boolean
}

// ========== Category 定义 ==========

/**
 * 内置 Category 名称（8种）
 * 参考 opencode 的 category system
 */
export type BuiltinCategoryName =
  | 'visual-engineering'
  | 'ultrabrain'
  | 'deep'
  | 'artistry'
  | 'quick'
  | 'unspecified-low'
  | 'unspecified-high'
  | 'writing'

/**
 * Category ID（内置 + 自定义字符串）
 */
export type CategoryId = BuiltinCategoryName | (string & {})

/**
 * 内置 Category 中文标签映射
 */
export const CATEGORY_LABELS: Record<BuiltinCategoryName, string> = {
  'visual-engineering': '视觉工程',
  'ultrabrain': '深度大脑',
  'deep': '深度研究',
  'artistry': '创意艺术',
  'quick': '快速执行',
  'unspecified-low': '通用低优先级',
  'unspecified-high': '通用高优先级',
  'writing': '文档撰写',
}

/**
 * 思考配置
 */
export interface CategoryThinkingConfig {
  type: 'enabled' | 'disabled'
  budgetTokens?: number
}

/**
 * Fallback 模型条目（字符串或带配置的对象）
 */
export type FallbackModelEntry = string | {
  model: string
  variant?: string
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  temperature?: number
  top_p?: number
  maxTokens?: number
  thinking?: CategoryThinkingConfig
}

/**
 * Category 配置接口
 */
export interface CategoryConfig {
  /** 人类可读描述，显示在任务提示中 */
  description?: string
  /** 主模型 ID（provider/model 格式） */
  model?: string
  /** 回退模型链 */
  fallback_models?: FallbackModelEntry | FallbackModelEntry[]
  /** 模型变体：max, high, medium, low, xhigh */
  variant?: string
  /** 采样温度 (0-2) */
  temperature?: number
  /** Top-p 采样 (0-1) */
  top_p?: number
  /** 最大响应 tokens */
  maxTokens?: number
  /** Anthropic extended thinking 配置 */
  thinking?: CategoryThinkingConfig
  /** OpenAI reasoning effort */
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  /** 文本详细程度 */
  textVerbosity?: 'low' | 'medium' | 'high'
  /** 允许的工具列表 */
  tools?: Record<string, boolean>
  /** 添加到系统提示的文本 */
  prompt_append?: string
  /** 最大提示 tokens */
  max_prompt_tokens?: number
  /** 标记为不稳定 agent（强制后台模式） */
  is_unstable_agent?: boolean
  /** 禁用此 category */
  disable?: boolean
}

/**
 * 所有 Categories 配置（内置 + 自定义）
 */
export type CategoriesConfig = Record<string, CategoryConfig>

/**
 * 内置 Category 验证正则
 */
export const BUILTIN_CATEGORY_PATTERN = /^(visual-engineering|ultrabrain|deep|artistry|quick|unspecified-low|unspecified-high|writing)$/