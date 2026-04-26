import type {
  BuiltinCategoryName,
  CategoryConfig,
  CategoriesConfig,
  CategoryId,
  ProviderId,
  ProviderModelRef,
} from './types'

/**
 * Category 定义接口
 */
export interface CategoryDefinition {
  id: BuiltinCategoryName
  label: string
  description: string
  defaultModel: string
  defaultVariant?: string
  defaultFallbackChain?: string[]
  recommendedFor: string[]
}

/**
 * 内置 Category 定义（参考 opencode 实现）
 */
export const BUILTIN_CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: 'visual-engineering',
    label: '视觉工程',
    description: '前端开发、UI/UX 设计、动画、样式调整、布局优化',
    defaultModel: 'google/gemini-2.5-pro',
    defaultVariant: 'high',
    defaultFallbackChain: [
      'zai-coding-plan/glm-5',
      'anthropic/claude-sonnet-4-0',
      'bigmodel/glm-5',
      'kimi-for-coding/k2p5',
    ],
    recommendedFor: ['frontend', 'ui-design', 'animation', 'styling', 'layout'],
  },
  {
    id: 'ultrabrain',
    label: '深度大脑',
    description: '深度逻辑推理、复杂架构设计、算法分析、高难度问题求解',
    defaultModel: 'openai/gpt-5.4',
    defaultVariant: 'xhigh',
    defaultFallbackChain: [
      'google/gemini-2.5-pro',
      'anthropic/claude-opus-4',
      'zai-coding-plan/glm-5',
    ],
    recommendedFor: ['deep-reasoning', 'architecture', 'algorithms', 'complex-problems'],
  },
  {
    id: 'deep',
    label: '深度研究',
    description: '自主问题解决、彻底研究、深度代码分析、跨文件理解',
    defaultModel: 'openai/gpt-5.4',
    defaultVariant: 'medium',
    defaultFallbackChain: [
      'anthropic/claude-opus-4',
      'google/gemini-2.5-pro',
    ],
    recommendedFor: ['autonomous-work', 'thorough-research', 'code-analysis', 'cross-file'],
  },
  {
    id: 'artistry',
    label: '创意艺术',
    description: '创意方案、非传统方法、设计探索、艺术性表达',
    defaultModel: 'google/gemini-2.5-pro',
    defaultVariant: 'high',
    defaultFallbackChain: [
      'anthropic/claude-opus-4',
      'openai/gpt-5.4',
    ],
    recommendedFor: ['creative', 'unconventional', 'design-exploration', 'artistic'],
  },
  {
    id: 'quick',
    label: '快速执行',
    description: '简单任务、拼写修正、单文件修改、快速修复',
    defaultModel: 'openai/gpt-4.1-mini',
    defaultVariant: undefined,
    defaultFallbackChain: [
      'anthropic/claude-haiku-4',
      'google/gemini-2.0-flash',
      'bigmodel/glm-4.6',
    ],
    recommendedFor: ['trivial', 'typos', 'single-file', 'quick-fixes'],
  },
  {
    id: 'unspecified-low',
    label: '通用低优先级',
    description: '通用任务、低复杂度工作、常规操作',
    defaultModel: 'anthropic/claude-sonnet-4-0',
    defaultVariant: undefined,
    defaultFallbackChain: [
      'openai/gpt-4.1',
      'kimi-for-coding/k2p5',
      'google/gemini-2.0-flash',
      'bigmodel/glm-4.6',
    ],
    recommendedFor: ['general-low', 'routine', 'low-complexity'],
  },
  {
    id: 'unspecified-high',
    label: '通用高优先级',
    description: '通用任务、高复杂度工作、重要决策',
    defaultModel: 'anthropic/claude-opus-4',
    defaultVariant: 'max',
    defaultFallbackChain: [
      'openai/gpt-5.4',
      'zai-coding-plan/glm-5',
      'kimi-for-coding/k2p5',
      'bigmodel/glm-5',
    ],
    recommendedFor: ['general-high', 'important', 'high-complexity', 'decision'],
  },
  {
    id: 'writing',
    label: '文档撰写',
    description: '文档编写、技术文章、说明文本、报告撰写',
    defaultModel: 'google/gemini-2.0-flash',
    defaultVariant: undefined,
    defaultFallbackChain: [
      'kimi-for-coding/k2p5',
      'anthropic/claude-sonnet-4-0',
      'bigmodel/glm-4.6',
    ],
    recommendedFor: ['documentation', 'prose', 'technical-writing', 'reports'],
  },
]

/**
 * 默认 Categories 配置
 * 基于 opencode 的 DEFAULT_CATEGORIES 实现
 */
export const DEFAULT_CATEGORIES: CategoriesConfig = Object.fromEntries(
  BUILTIN_CATEGORY_DEFINITIONS.map((def) => [
    def.id,
    {
      description: def.description,
      model: def.defaultModel,
      fallback_models: def.defaultFallbackChain,
      variant: def.defaultVariant,
    } satisfies CategoryConfig,
  ]),
)

const BUILTIN_CATEGORY_MAP = new Map(
  BUILTIN_CATEGORY_DEFINITIONS.map((def) => [def.id, def] as const),
)

/**
 * 检查是否为内置 Category
 */
export function isBuiltinCategory(categoryId: string): categoryId is BuiltinCategoryName {
  return BUILTIN_CATEGORY_MAP.has(categoryId as BuiltinCategoryName)
}

/**
 * 获取 Category 定义
 */
export function getCategoryDefinition(categoryId: BuiltinCategoryName): CategoryDefinition | null {
  return BUILTIN_CATEGORY_MAP.get(categoryId) ?? null
}

/**
 * 解析模型字符串为 ProviderModelRef
 * 格式: "provider/model" 或 "model"
 */
function parseModelString(modelStr: string): ProviderModelRef {
  const parts = modelStr.split('/')
  if (parts.length === 2) {
    return { provider: parts[0] as ProviderId, model: parts[1] }
  }
  return { provider: 'openai_compatible' as ProviderId, model: modelStr }
}

/**
 * 解析带变体的模型字符串
 * 格式: "provider/model(variant)" 或 "model(variant)"
 */
function parseModelWithVariant(modelStr: string): { ref: ProviderModelRef; variant?: string } {
  const variantMatch = modelStr.match(/\(([^)]+)\)$/)
  const variant = variantMatch?.[1]
  const cleanModel = variantMatch ? modelStr.slice(0, modelStr.lastIndexOf('(')) : modelStr
  const ref = parseModelString(cleanModel)
  return { ref, variant }
}

/**
 * 解析 Category 模型配置
 * 优先级：用户配置 > Category 默认
 *
 * @param categoryId - Category ID
 * @param userCategories - 用户自定义 Categories 配置
 * @param userDefaultModel - 用户默认模型（作为最终 fallback）
 * @returns 解析后的模型引用和配置
 */
export function resolveCategoryModel(
  categoryId: CategoryId,
  userCategories?: CategoriesConfig | null,
  userDefaultModel?: ProviderModelRef | null,
): {
  model: ProviderModelRef
  variant?: string
  fallbackChain: ProviderModelRef[]
  config: CategoryConfig
  isDefault: boolean
} {
  const userCategoryConfig = userCategories?.[categoryId]
  const builtinDef = isBuiltinCategory(categoryId)
    ? getCategoryDefinition(categoryId)
    : null

  if (userCategoryConfig?.model) {
    const parsed = parseModelWithVariant(userCategoryConfig.model)
    const explicitVariant = userCategoryConfig.variant ?? parsed.variant
    const fallbackChain = resolveFallbackChain(userCategoryConfig.fallback_models)

    return {
      model: parsed.ref,
      variant: explicitVariant,
      fallbackChain,
      config: userCategoryConfig,
      isDefault: false,
    }
  }

  if (builtinDef) {
    const parsed = parseModelWithVariant(builtinDef.defaultModel)
    const fallbackChain = builtinDef.defaultFallbackChain
      ? builtinDef.defaultFallbackChain.map((m) => parseModelString(m))
      : []

    return {
      model: parsed.ref,
      variant: builtinDef.defaultVariant ?? parsed.variant,
      fallbackChain,
      config: DEFAULT_CATEGORIES[builtinDef.id],
      isDefault: true,
    }
  }

  if (userDefaultModel) {
    return {
      model: userDefaultModel,
      variant: undefined,
      fallbackChain: [],
      config: {},
      isDefault: true,
    }
  }

  return {
    model: { provider: 'bigmodel', model: 'glm-5' },
    variant: undefined,
    fallbackChain: [
      { provider: 'openai', model: 'gpt-4.1' },
      { provider: 'anthropic', model: 'claude-sonnet-4-0' },
    ],
    config: {},
    isDefault: true,
  }
}

/**
 * 解析 fallback_models 配置为 ProviderModelRef 数组
 */
function resolveFallbackChain(
  fallbackModels?: CategoryConfig['fallback_models'],
): ProviderModelRef[] {
  if (!fallbackModels) return []

  const entries = Array.isArray(fallbackModels) ? fallbackModels : [fallbackModels]

  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return parseModelString(entry)
    }
    return parseModelString(entry.model)
  })
}

/**
 * 获取所有可用的 Categories
 * 合并内置和用户自定义
 */
export function getAvailableCategories(
  userCategories?: CategoriesConfig | null,
  disabledCategories?: string[],
): CategoryId[] {
  const disabledSet = new Set(disabledCategories ?? [])
  const builtinIds = BUILTIN_CATEGORY_DEFINITIONS
    .map((def) => def.id)
    .filter((id) => !disabledSet.has(id))

  const customIds = Object.keys(userCategories ?? {})
    .filter((id) => !isBuiltinCategory(id) && !disabledSet.has(id))

  return [...builtinIds, ...customIds]
}

/**
 * 获取 Category 配置摘要
 */
export function getCategorySummary(
  userCategories?: CategoriesConfig | null,
): {
  builtin: Array<{ id: BuiltinCategoryName; label: string; description: string; model: string }>
  custom: Array<{ id: string; description?: string; model?: string }>
} {
  const builtin = BUILTIN_CATEGORY_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    model: userCategories?.[def.id]?.model ?? def.defaultModel,
  }))

  const custom = Object.entries(userCategories ?? {})
    .filter(([id]) => !isBuiltinCategory(id))
    .map(([id, config]) => ({
      id,
      description: config.description,
      model: config.model,
    }))

  return { builtin, custom }
}