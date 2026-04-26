import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { OmniCompleteSchema } from './schemas'
import { omniGateway } from '../services/omni/gateway'
import { PROVIDER_CATALOG, MODEL_PRESETS } from '../services/omni/catalog'
import {
  getSanitizedUserModelConfig,
  saveUserModelConfig,
  getModelCapabilitySummary,
  getUserModelConfigRecord,
  listConfigVersionHistory,
  rollbackConfigToVersion,
} from '../services/omni/config-store'
import { RESEARCH_ROLE_IDS, allTaskRouteTargets } from '../services/omni/routing'
import type { OmniAttachment, OmniCompleteRequest } from '../services/omni/types'
import type { UserModelConfig } from '../../shared/model-config'

const router = Router()

// ========== Helper Functions ==========

function resolveRequestUserId(req: { header(name: string): string | undefined }) {
  const candidate = req.header('x-alpha-user-id')?.trim()
  if (!candidate) return undefined
  const normalized = candidate.replace(/[^a-zA-Z0-9:_-]/gu, '').slice(0, 64)
  return normalized || undefined
}

function injectResolvedUserId<T extends { userId?: string }>(
  payload: T,
  req: { header(name: string): string | undefined },
): T {
  if (payload.userId?.trim()) {
    return payload
  }

  const resolvedUserId = resolveRequestUserId(req)
  if (!resolvedUserId) {
    return payload
  }

  return {
    ...payload,
    userId: resolvedUserId,
  }
}

// ========== Validation Schemas ==========

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

router.post(
  '/complete',
  validate(OmniCompleteSchema),
  asyncHandler(async (req, res) => {
    const request = injectResolvedUserId(req.body as OmniCompleteRequest, req)
    const result = await omniGateway.complete(request)
    res.json({ success: true, data: result })
  }),
)

router.post('/stream', validate(OmniCompleteSchema), async (req, res, next) => {
  try {
    const request = injectResolvedUserId(req.body as OmniCompleteRequest, req)
    const result = await omniGateway.complete(request)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    for (const chunk of omniGateway.streamFromCompletion(result)) {
      res.write('event: chunk\n')
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
    }

    res.write('event: done\n')
    res.write(`data: ${JSON.stringify(result)}\n\n`)
    res.end()
  } catch (error) {
    next(error)
  }
})

router.post(
  '/parse',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const {
      task = 'document_parse',
      prompt,
      attachments = [],
    } = req.body as {
      task?: OmniCompleteRequest['task']
      prompt?: string
      attachments?: OmniAttachment[]
    }

    if (!attachments.length) {
      throw new AppError(400, 'Parse requires at least one attachment.')
    }

    const systemPromptByTask: Record<string, string> = {
      document_parse:
        '\u8bf7\u89e3\u6790\u8f93\u5165\u6587\u6863\uff0c\u63d0\u53d6\u4e3b\u8981\u8bba\u70b9\u3001\u7ed3\u6784\u3001\u5173\u952e\u672f\u8bed\uff0c\u4ee5\u53ca\u56fe\u8868\u3001\u8868\u683c\u3001\u516c\u5f0f\u7ebf\u7d22\uff0c\u5e76\u4ee5 JSON \u8fd4\u56de\u3002',
      figure_analysis:
        '\u8bf7\u5206\u6790\u8f93\u5165\u56fe\u7247\u4e2d\u7684\u8bba\u6587\u56fe\u8868\uff0c\u63d0\u53d6\u56fe\u8868\u7c7b\u578b\u3001\u4e3b\u7ed3\u8bba\u3001\u5173\u952e\u8d8b\u52bf\uff0c\u5e76\u4ee5 JSON \u8fd4\u56de\u3002',
      formula_recognition:
        '\u8bf7\u8bc6\u522b\u8f93\u5165\u56fe\u7247\u4e2d\u7684\u516c\u5f0f\uff0c\u63d0\u53d6 LaTeX\u3001\u516c\u5f0f\u542b\u4e49\u3001\u53d8\u91cf\u8bf4\u660e\u548c\u4e0a\u4e0b\u6587\u4f5c\u7528\uff0c\u5e76\u4ee5 JSON \u8fd4\u56de\u3002',
      table_extraction:
        '\u8bf7\u8bc6\u522b\u8f93\u5165\u5185\u5bb9\u4e2d\u7684\u8868\u683c\u7ed3\u6784\uff0c\u63d0\u53d6\u8868\u5934\u3001\u884c\u6570\u636e\u3001\u6458\u8981\u4e0e\u6ce8\u610f\u4e8b\u9879\uff0c\u5e76\u8fd4\u56de JSON\u3002',
    }

    const result = await omniGateway.complete({
      task,
      userId,
      json: true,
      messages: [
        {
          role: 'system',
          content: systemPromptByTask[task] ?? systemPromptByTask.document_parse,
        },
        {
          role: 'user',
          content: prompt ?? '\u8bf7\u89e3\u6790\u8fd9\u4e9b\u6750\u6599\uff0c\u5e76\u4ee5\u7ed3\u6784\u5316\u65b9\u5f0f\u8fd4\u56de\u7ed3\u679c\u3002',
          attachments,
        },
      ],
    })

    res.json({
      success: true,
      data: {
        raw: result,
      },
    })
  }),
)

// ========== Catalog Endpoints ==========

/**
 * GET /api/omni/catalog
 * Returns ProviderCatalogEntry[] - all available providers and their models
 */
router.get(
  '/catalog',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: PROVIDER_CATALOG,
    })
  }),
)

/**
 * GET /api/omni/presets
 * Returns ModelPreset[] - predefined model configuration presets
 */
router.get(
  '/presets',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: MODEL_PRESETS,
    })
  }),
)

// ========== Config Endpoints ==========

/**
 * GET /api/omni/config
 * Returns SanitizedUserModelConfig - current user model configuration (API keys masked)
 */
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const config = await getSanitizedUserModelConfig(userId)
    res.json({
      success: true,
      data: config,
    })
  }),
)

/**
 * POST /api/omni/config
 * Accepts UserModelConfig - saves user model configuration
 */
router.post(
  '/config',
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

// ========== Capabilities Endpoint ==========

/**
 * GET /api/omni/capabilities
 * Returns capability summary - detailed breakdown of configured slots, roles, and routing
 */
router.get(
  '/capabilities',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const capabilitySummary = await getModelCapabilitySummary(userId)
    res.json({
      success: true,
      data: capabilitySummary,
    })
  }),
)

// ========== Full Config Record Endpoint ==========

/**
 * GET /api/omni/config-record
 * Returns full config record with metadata and history
 */
router.get(
  '/config-record',
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

// ========== Config History Endpoints ==========

/**
 * GET /api/omni/config/history
 * Returns config version history list
 */
router.get(
  '/config/history',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const limit = Math.min(Number(req.query.limit) || 12, 50)
    const history = await listConfigVersionHistory(limit)
    res.json({
      success: true,
      data: {
        userId,
        history,
        total: history.length,
      },
    })
  }),
)

/**
 * POST /api/omni/config/rollback
 * Rollback config to a specific version
 */
router.post(
  '/config/rollback',
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const { version } = req.body as { version: number }

    if (!version || typeof version !== 'number') {
      throw new AppError(400, 'Version number is required.')
    }

    const result = await rollbackConfigToVersion(version, userId)
    if (!result) {
      throw new AppError(404, `Config version ${version} not found.`)
    }

    const capabilitySummary = await getModelCapabilitySummary(userId)
    res.json({
      success: true,
      data: {
        userId: capabilitySummary.userId,
        config: result,
        slots: capabilitySummary.slots,
        roles: capabilitySummary.roles,
        routing: capabilitySummary.routing,
        rollbackVersion: version,
      },
    })
  }),
)

export default router
