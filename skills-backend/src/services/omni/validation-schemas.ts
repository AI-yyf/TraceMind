/**
 * Zod 验证 Schema 定义
 * 用于模型配置的运行时验证
 *
 * 特性：
 * - 使用 .passthrough() 保持向后兼容性
 * - 中文错误消息
 * - 完整类型导出供前端使用
 */

import { z } from 'zod'

// ========== 中文错误消息 ==========

const zhMessages = {
  // Provider 相关
  invalidProvider: '无效的模型提供商，必须是以下之一: nvidia, openai_compatible, openai, anthropic, google, dashscope, bigmodel, ark, hunyuan, deepseek',

  // Task 相关
  invalidTask: '无效的任务类型，必须是以下之一: general_chat, topic_chat, topic_chat_vision, topic_summary, document_parse, figure_analysis, formula_recognition, table_extraction, evidence_explainer',

  // Role 相关
  invalidRole: '无效的研究角色，必须是以下之一: workbench_chat, topic_architect, research_judge, node_writer, paper_writer, critic, localizer, vision_reader',

  // Slot 相关
  invalidSlot: '无效的模型槽位，必须是 language 或 multimodal',

  // 能力相关
  capabilityBoolean: '能力字段必须为布尔值',

  // 配置相关
  providerRequired: '提供商标识不能为空',
  modelRequired: '模型名称不能为空',
  invalidBaseUrl: '无效的 Base URL 格式',
  invalidApiKey: 'API Key 必须为字符串',
  invalidTemperature: '温度值必须在 0-2 之间',
  invalidMaxTokens: 'maxTokens 必须为正整数',

  // 通用
  invalidJson: '无效的 JSON 格式',
  invalidString: '必须为字符串',
  invalidNumber: '必须为数字',
  invalidBoolean: '必须为布尔值',
}

// ========== 枚举 Schema 定义 ==========

/**
 * ProviderId 枚举 Schema（10种提供商）
 */
export const ProviderIdSchema = z.enum(
  [
    'nvidia',
    'openai_compatible',
    'openai',
    'anthropic',
    'google',
    'dashscope',
    'bigmodel',
    'ark',
    'hunyuan',
    'deepseek',
  ],
  {
    errorMap: () => ({ message: zhMessages.invalidProvider }),
  }
)

/**
 * OmniTask 枚举 Schema（9种任务）
 */
export const OmniTaskSchema = z.enum(
  [
    'general_chat',
    'topic_chat',
    'topic_chat_vision',
    'topic_summary',
    'document_parse',
    'figure_analysis',
    'formula_recognition',
    'table_extraction',
    'evidence_explainer',
  ],
  {
    errorMap: () => ({ message: zhMessages.invalidTask }),
  }
)

/**
 * ResearchRoleId 枚举 Schema（8种角色）
 */
export const ResearchRoleIdSchema = z.enum(
  [
    'workbench_chat',
    'topic_architect',
    'research_judge',
    'node_writer',
    'paper_writer',
    'critic',
    'localizer',
    'vision_reader',
  ],
  {
    errorMap: () => ({ message: zhMessages.invalidRole }),
  }
)

/**
 * ModelSlot 枚举 Schema
 */
export const ModelSlotSchema = z.enum(['language', 'multimodal'], {
  errorMap: () => ({ message: zhMessages.invalidSlot }),
})

/**
 * TaskRouteTarget Schema（槽位或角色）
 */
export const TaskRouteTargetSchema = z.union([ModelSlotSchema, ResearchRoleIdSchema], {
  errorMap: () => ({ message: '任务路由目标必须是有效的槽位或研究角色' }),
})

/**
 * ThinkingMode Schema
 */
export const ThinkingModeSchema = z.enum(['on', 'off', 'auto'], {
  errorMap: () => ({ message: '思考模式必须是 on、off 或 auto' }),
})

/**
 * CitationMode Schema
 */
export const CitationModeSchema = z.enum(['native', 'backend'], {
  errorMap: () => ({ message: '引用模式必须是 native 或 backend' }),
})

/**
 * ParserMode Schema
 */
export const ParserModeSchema = z.enum(['native', 'backend'], {
  errorMap: () => ({ message: '解析模式必须是 native 或 backend' }),
})

// ========== 能力 Schema 定义 ==========

/**
 * ProviderCapability Schema（10个布尔字段）
 * 描述模型的具体能力支持
 */
export const ProviderCapabilitySchema = z
  .object({
    /** 文本生成 */
    text: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: text` }),
    }),
    /** 图像理解 */
    image: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: image` }),
    }),
    /** PDF解析 */
    pdf: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: pdf` }),
    }),
    /** 图表分析 */
    chart: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: chart` }),
    }),
    /** 公式识别 */
    formula: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: formula` }),
    }),
    /** 原生引用支持 */
    citationsNative: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: citationsNative` }),
    }),
    /** 原生文件解析 */
    fileParserNative: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: fileParserNative` }),
    }),
    /** 工具调用 */
    toolCalling: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: toolCalling` }),
    }),
    /** JSON模式 */
    jsonMode: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: jsonMode` }),
    }),
    /** 流式输出 */
    streaming: z.boolean({
      errorMap: () => ({ message: `${zhMessages.capabilityBoolean}: streaming` }),
    }),
  })
  .passthrough()

// ========== 模型选项 Schema ==========

/**
 * ProviderModelOptions Schema
 */
export const ProviderModelOptionsSchema = z
  .object({
    thinking: ThinkingModeSchema.optional(),
    citations: CitationModeSchema.optional(),
    parser: ParserModeSchema.optional(),
    temperature: z
      .number({
        errorMap: () => ({ message: zhMessages.invalidTemperature }),
      })
      .min(0, { message: '温度值不能小于 0' })
      .max(2, { message: '温度值不能大于 2' })
      .optional(),
    maxTokens: z
      .number({
        errorMap: () => ({ message: zhMessages.invalidMaxTokens }),
      })
      .int({ message: 'maxTokens 必须为整数' })
      .positive({ message: 'maxTokens 必须为正数' })
      .optional(),
  })
  .passthrough()

// ========== 模型配置 Schema ==========

/**
 * ProviderModelRef Schema（基础模型引用）
 */
export const ProviderModelRefSchema = z.object({
  provider: ProviderIdSchema,
  model: z
    .string({
      errorMap: () => ({ message: zhMessages.modelRequired }),
    })
    .min(1, { message: '模型名称不能为空' }),
})

/**
 * ProviderModelConfig Schema（完整模型配置）
 */
export const ProviderModelConfigSchema = ProviderModelRefSchema.extend({
  baseUrl: z
    .string({
      errorMap: () => ({ message: zhMessages.invalidBaseUrl }),
    })
    .url({ message: 'Base URL 必须是有效的 URL' })
    .optional(),
  apiKeyRef: z
    .string({
      errorMap: () => ({ message: zhMessages.invalidApiKey }),
    })
    .optional(),
  apiKey: z
    .string({
      errorMap: () => ({ message: zhMessages.invalidApiKey }),
    })
    .optional(),
  providerOptions: z
    .record(z.unknown(), {
      errorMap: () => ({ message: zhMessages.invalidJson }),
    })
    .optional(),
  options: ProviderModelOptionsSchema.optional(),
}).passthrough()

/**
 * UserModelConfig Schema（用户模型配置）
 * 包含语言槽位、多模态槽位、角色覆盖、任务路由
 */
export const UserModelConfigSchema = z
  .object({
    language: ProviderModelConfigSchema.nullable().optional(),
    multimodal: ProviderModelConfigSchema.nullable().optional(),
    roles: z
      .record(ResearchRoleIdSchema, ProviderModelConfigSchema.nullable())
      .optional(),
    taskOverrides: z.record(OmniTaskSchema, ProviderModelRefSchema).optional(),
    taskRouting: z.record(OmniTaskSchema, TaskRouteTargetSchema).optional(),
  })
  .passthrough()

// ========== 清理配置 Schema ==========

/**
 * SanitizedProviderModelConfig Schema（用于前端展示，API key 已掩码）
 */
export const SanitizedProviderModelConfigSchema = ProviderModelRefSchema.extend({
  baseUrl: z.string().optional(),
  apiKeyRef: z.string().optional(),
  apiKeyStatus: z.enum(['configured', 'missing'], {
    errorMap: () => ({ message: 'API Key 状态必须是 configured 或 missing' }),
  }),
  apiKeyPreview: z.string().optional(),
  providerOptions: z.record(z.unknown()).optional(),
  options: ProviderModelOptionsSchema.optional(),
}).passthrough()

/**
 * SanitizedUserModelConfig Schema（用于前端展示）
 */
export const SanitizedUserModelConfigSchema = z
  .object({
    language: SanitizedProviderModelConfigSchema.nullable(),
    multimodal: SanitizedProviderModelConfigSchema.nullable(),
    roles: z
      .record(ResearchRoleIdSchema, SanitizedProviderModelConfigSchema.nullable())
      .optional(),
    taskOverrides: z.record(OmniTaskSchema, ProviderModelRefSchema).optional(),
    taskRouting: z.record(OmniTaskSchema, TaskRouteTargetSchema).optional(),
  })
  .passthrough()

// ========== 目录相关 Schema ==========

/**
 * ProviderCatalogModel Schema
 */
export const ProviderCatalogModelSchema = z
  .object({
    id: z.string().min(1, { message: '模型 ID 不能为空' }),
    label: z.string().min(1, { message: '模型标签不能为空' }),
    slot: z.enum(['language', 'multimodal', 'both'], {
      errorMap: () => ({ message: '槽位必须是 language、multimodal 或 both' }),
    }),
    capabilities: ProviderCapabilitySchema,
    recommended: z.boolean().optional(),
    description: z.string().optional(),
  })
  .passthrough()

// ========== 请求 Schema ==========

/**
 * OmniAttachment Schema
 */
export const OmniAttachmentSchema = z
  .object({
    type: z.enum(['image', 'pdf', 'table'], {
      errorMap: () => ({ message: '附件类型必须是 image、pdf 或 table' }),
    }),
    mimeType: z.string().min(1, { message: 'MIME 类型不能为空' }),
    url: z.string().url().optional(),
    base64: z.string().optional(),
    caption: z.string().optional(),
  })
  .passthrough()

/**
 * OmniMessage Schema
 */
export const OmniMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant'], {
      errorMap: () => ({ message: '消息角色必须是 system、user 或 assistant' }),
    }),
    content: z.string(),
    attachments: z.array(OmniAttachmentSchema).optional(),
  })
  .passthrough()

/**
 * OmniCompleteRequest Schema
 */
export const OmniCompleteRequestSchema = z
  .object({
    task: OmniTaskSchema,
    messages: z.array(OmniMessageSchema).min(1, { message: '消息列表不能为空' }),
    preferredSlot: ModelSlotSchema.optional(),
    role: ResearchRoleIdSchema.optional(),
    userId: z.string().optional(),
    json: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  })
  .passthrough()

// ========== 问题 Schema ==========

/**
 * OmniIssueCode Schema
 */
export const OmniIssueCodeSchema = z.enum(
  ['missing_key', 'invalid_key', 'provider_error'],
  {
    errorMap: () => ({ message: '问题代码必须是 missing_key、invalid_key 或 provider_error' }),
  }
)

/**
 * OmniIssue Schema
 */
export const OmniIssueSchema = z
  .object({
    code: OmniIssueCodeSchema,
    title: z.string().min(1, { message: '问题标题不能为空' }),
    message: z.string().min(1, { message: '问题消息不能为空' }),
    provider: z.union([ProviderIdSchema, z.literal('backend')]).optional(),
    model: z.string().optional(),
    slot: ModelSlotSchema.optional(),
  })
  .passthrough()

// ========== 结果 Schema ==========

/**
 * OmniCompletionResult Schema
 */
export const OmniCompletionResultSchema = z
  .object({
    text: z.string(),
    reasoning: z.string().optional(),
    provider: z.union([ProviderIdSchema, z.literal('backend')]),
    model: z.string(),
    slot: ModelSlotSchema,
    capabilities: ProviderCapabilitySchema,
    usedFallback: z.boolean(),
    issue: OmniIssueSchema.optional(),
  })
  .passthrough()

// ========== 类型导出 ==========

/**
 * 导出所有 Schema 类型供 TypeScript 使用
 */
export type ProviderIdType = z.infer<typeof ProviderIdSchema>
export type OmniTaskType = z.infer<typeof OmniTaskSchema>
export type ResearchRoleIdType = z.infer<typeof ResearchRoleIdSchema>
export type ModelSlotType = z.infer<typeof ModelSlotSchema>
export type TaskRouteTargetType = z.infer<typeof TaskRouteTargetSchema>
export type ThinkingModeType = z.infer<typeof ThinkingModeSchema>
export type CitationModeType = z.infer<typeof CitationModeSchema>
export type ParserModeType = z.infer<typeof ParserModeSchema>
export type ProviderCapabilityType = z.infer<typeof ProviderCapabilitySchema>
export type ProviderModelOptionsType = z.infer<typeof ProviderModelOptionsSchema>
export type ProviderModelRefType = z.infer<typeof ProviderModelRefSchema>
export type ProviderModelConfigType = z.infer<typeof ProviderModelConfigSchema>
export type UserModelConfigType = z.infer<typeof UserModelConfigSchema>
export type SanitizedProviderModelConfigType = z.infer<typeof SanitizedProviderModelConfigSchema>
export type SanitizedUserModelConfigType = z.infer<typeof SanitizedUserModelConfigSchema>
export type ProviderCatalogModelType = z.infer<typeof ProviderCatalogModelSchema>
export type OmniAttachmentType = z.infer<typeof OmniAttachmentSchema>
export type OmniMessageType = z.infer<typeof OmniMessageSchema>
export type OmniCompleteRequestType = z.infer<typeof OmniCompleteRequestSchema>
export type OmniIssueCodeType = z.infer<typeof OmniIssueCodeSchema>
export type OmniIssueType = z.infer<typeof OmniIssueSchema>
export type OmniCompletionResultType = z.infer<typeof OmniCompletionResultSchema>

// ========== 验证工具函数 ==========

/**
 * 验证用户模型配置
 * @param config 待验证的配置对象
 * @returns 验证结果，包含成功标志和错误信息
 */
export function validateUserModelConfig(config: unknown): {
  success: boolean
  data?: UserModelConfigType
  errors?: string[]
} {
  const result = UserModelConfigSchema.safeParse(config)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  }
}

/**
 * 验证 Provider 模型配置
 */
export function validateProviderModelConfig(config: unknown): {
  success: boolean
  data?: ProviderModelConfigType
  errors?: string[]
} {
  const result = ProviderModelConfigSchema.safeParse(config)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  }
}

/**
 * 验证 Omni 完成请求
 */
export function validateOmniCompleteRequest(request: unknown): {
  success: boolean
  data?: OmniCompleteRequestType
  errors?: string[]
} {
  const result = OmniCompleteRequestSchema.safeParse(request)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  }
}

/**
 * 验证 Provider 能力配置
 */
export function validateProviderCapability(capability: unknown): {
  success: boolean
  data?: ProviderCapabilityType
  errors?: string[]
} {
  const result = ProviderCapabilitySchema.safeParse(capability)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
  }
}

/**
 * 验证 ProviderId
 */
export function validateProviderId(id: unknown): {
  success: boolean
  data?: ProviderIdType
  error?: string
} {
  const result = ProviderIdSchema.safeParse(id)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.errors[0]?.message || zhMessages.invalidProvider }
}

/**
 * 验证 OmniTask
 */
export function validateOmniTask(task: unknown): {
  success: boolean
  data?: OmniTaskType
  error?: string
} {
  const result = OmniTaskSchema.safeParse(task)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.errors[0]?.message || zhMessages.invalidTask }
}

/**
 * 验证 ResearchRoleId
 */
export function validateResearchRoleId(role: unknown): {
  success: boolean
  data?: ResearchRoleIdType
  error?: string
} {
  const result = ResearchRoleIdSchema.safeParse(role)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error.errors[0]?.message || zhMessages.invalidRole }
}

// ========== 默认值 ==========

/**
 * 默认文本能力
 */
export const DEFAULT_TEXT_CAPABILITY: ProviderCapabilityType = {
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
export const DEFAULT_MULTIMODAL_CAPABILITY: ProviderCapabilityType = {
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
export const ANTHROPIC_NATIVE_CAPABILITY: ProviderCapabilityType = {
  ...DEFAULT_MULTIMODAL_CAPABILITY,
  citationsNative: true,
}