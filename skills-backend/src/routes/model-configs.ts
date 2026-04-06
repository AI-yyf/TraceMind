import { Router } from 'express'
import { z } from 'zod'

import { AppError, asyncHandler } from '../middleware/errorHandler'
import {
  getModelCapabilitySummary,
  getSanitizedUserModelConfig,
  getUserModelConfigRecord,
  saveUserModelConfig,
} from '../services/omni/config-store'
import { RESEARCH_ROLE_IDS, allTaskRouteTargets } from '../services/omni/routing'
import { omniGateway } from '../services/omni/gateway'
import type { UserModelConfig } from '../services/omni/types'

const router = Router()

const providerSchema = z.enum([
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
])

const taskSchema = z.enum([
  'general_chat',
  'topic_chat',
  'topic_chat_vision',
  'topic_summary',
  'document_parse',
  'figure_analysis',
  'formula_recognition',
  'table_extraction',
  'evidence_explainer',
])

const slotRefSchema = z
  .object({
    provider: providerSchema,
    model: z.string().trim().min(1),
  })
  .strict()

const slotOptionsSchema = z
  .object({
    thinking: z.enum(['on', 'off', 'auto']).optional(),
    citations: z.enum(['native', 'backend']).optional(),
    parser: z.enum(['native', 'backend']).optional(),
    temperature: z.number().finite().optional(),
    maxTokens: z.number().int().positive().optional(),
  })
  .strict()

const slotConfigSchema = z
  .object({
    provider: providerSchema,
    model: z.string().trim().min(1),
    baseUrl: z.string().trim().optional(),
    apiKeyRef: z.string().trim().optional(),
    apiKey: z.string().trim().optional(),
    providerOptions: z.record(z.unknown()).optional(),
    options: slotOptionsSchema.optional(),
  })
  .strict()

const researchRoleSchema = z.enum(RESEARCH_ROLE_IDS as [string, ...string[]])
const taskRouteTargetSchema = z.enum(allTaskRouteTargets() as [string, ...string[]])

const userModelConfigSchema = z
  .object({
    language: slotConfigSchema.nullable().optional(),
    multimodal: slotConfigSchema.nullable().optional(),
    roles: z.record(researchRoleSchema, slotConfigSchema.nullable()).optional(),
    taskOverrides: z.record(taskSchema, slotRefSchema).optional(),
    taskRouting: z.record(taskSchema, taskRouteTargetSchema).optional(),
  })
  .strict()

const hasOwn = <T extends object>(value: T, key: keyof T) =>
  Object.prototype.hasOwnProperty.call(value, key)

function resolveRequestUserId(req: { header(name: string): string | undefined }) {
  const candidate = req.header('x-alpha-user-id')?.trim()
  if (!candidate) return undefined
  const normalized = candidate.replace(/[^a-zA-Z0-9:_-]/gu, '').slice(0, 64)
  return normalized || undefined
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const [configRecord, capabilitySummary] = await Promise.all([
      getUserModelConfigRecord(userId),
      getModelCapabilitySummary(userId),
    ])

    res.json({
      success: true,
      data: {
        userId: capabilitySummary.userId,
        config: configRecord.config,
        configMeta: configRecord.meta,
        configHistory: configRecord.history,
        roles: capabilitySummary.roles,
        routing: capabilitySummary.routing,
        roleDefinitions: capabilitySummary.roleDefinitions,
        catalog: capabilitySummary.catalog,
        presets: capabilitySummary.presets,
      },
    })
  }),
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const parsedPayload = userModelConfigSchema.safeParse(req.body)
    if (!parsedPayload.success) {
      throw new AppError(400, parsedPayload.error.issues[0]?.message ?? 'Invalid model config payload.')
    }

    const incoming = parsedPayload.data as UserModelConfig
    const previous = await getSanitizedUserModelConfig(userId)
    const saved = await saveUserModelConfig(incoming, userId)
    const capabilitySummary = await getModelCapabilitySummary(userId)
    const shouldValidateLanguage =
      hasOwn(incoming, 'language') &&
      Boolean(incoming.language) &&
      (
        Boolean(incoming.language?.apiKey) ||
        previous.language?.provider !== saved.language?.provider ||
        previous.language?.model !== saved.language?.model ||
        previous.language?.baseUrl !== saved.language?.baseUrl
      )
    const shouldValidateMultimodal =
      hasOwn(incoming, 'multimodal') &&
      Boolean(incoming.multimodal) &&
      (
        Boolean(incoming.multimodal?.apiKey) ||
        previous.multimodal?.provider !== saved.multimodal?.provider ||
        previous.multimodal?.model !== saved.multimodal?.model ||
        previous.multimodal?.baseUrl !== saved.multimodal?.baseUrl
      )
    const validationIssues = (
      await Promise.all([
        shouldValidateLanguage ? omniGateway.validateSlot('language', userId) : Promise.resolve(null),
        shouldValidateMultimodal ? omniGateway.validateSlot('multimodal', userId) : Promise.resolve(null),
      ])
    ).filter(Boolean)

    res.json({
      success: true,
      data: {
        userId: capabilitySummary.userId,
        config: saved,
        configRecord: await getUserModelConfigRecord(userId),
        slots: capabilitySummary.slots,
        roles: capabilitySummary.roles,
        routing: capabilitySummary.routing,
        roleDefinitions: capabilitySummary.roleDefinitions,
        validationIssues,
      },
    })
  }),
)

router.get(
  '/capabilities',
  asyncHandler(async (req, res) => {
    const capabilitySummary = await getModelCapabilitySummary(resolveRequestUserId(req))
    res.json({
      success: true,
      data: capabilitySummary,
    })
  }),
)

export default router
