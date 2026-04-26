import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { ModelConfigBodySchema } from './schemas'
import {
  getModelCapabilitySummary,
  getSanitizedUserModelConfig,
  getUserModelConfigRecord,
  saveUserModelConfig,
} from '../services/omni/config-store'
import { omniGateway } from '../services/omni/gateway'
import {
  DEFAULT_TASK_ROUTING,
  preferredSlotForRole,
  resolveTaskRouteTarget,
} from '../services/omni/routing'
import type { OmniTask, ModelSlot, TaskRouteTarget } from '../services/omni/types'
import type { UserModelConfig } from '../services/omni/types'

const router = Router()

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
  validate(ModelConfigBodySchema),
  asyncHandler(async (req, res) => {
    const userId = resolveRequestUserId(req)
    const incoming = req.body as UserModelConfig
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
    const validateSlotSafely = async (slot: 'language' | 'multimodal') => {
      try {
        return await omniGateway.validateSlot(slot, userId)
      } catch (error) {
        return {
          slot,
          ok: false,
          issue: error instanceof Error ? error.message : 'Slot validation failed.',
        }
      }
    }
    const validationIssues = (
      await Promise.all([
        shouldValidateLanguage ? validateSlotSafely('language') : Promise.resolve(null),
        shouldValidateMultimodal ? validateSlotSafely('multimodal') : Promise.resolve(null),
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

/**
 * GET /api/model-configs/test-routing
 * Integration test endpoint that verifies VLM tasks route to multimodal slot
 * and LLM tasks route to language slot.
 */
router.get(
  '/test-routing',
  asyncHandler(async (_req, res) => {
    const testCases: Array<{
      task: OmniTask
      expectedSlot: ModelSlot
      description: string
    }> = [
      { task: 'figure_analysis', expectedSlot: 'multimodal', description: 'VLM: figure analysis must route to multimodal' },
      { task: 'document_parse', expectedSlot: 'multimodal', description: 'VLM: document parsing must route to multimodal' },
      { task: 'table_extraction', expectedSlot: 'multimodal', description: 'VLM: table extraction must route to multimodal' },
      { task: 'formula_recognition', expectedSlot: 'multimodal', description: 'VLM: formula recognition must route to multimodal' },
      { task: 'evidence_explainer', expectedSlot: 'multimodal', description: 'VLM: evidence explainer must route to multimodal' },
      { task: 'topic_summary', expectedSlot: 'language', description: 'LLM: topic summary must route to language' },
      { task: 'general_chat', expectedSlot: 'language', description: 'LLM: general chat must route to language' },
      { task: 'topic_chat', expectedSlot: 'language', description: 'LLM: topic chat must route to language' },
      { task: 'topic_chat_vision', expectedSlot: 'language', description: 'LLM: topic chat vision routes via workbench_chat (language preferred)' },
    ]

    const results = testCases.map((testCase) => {
      const routedTarget: TaskRouteTarget = resolveTaskRouteTarget(testCase.task, null)
      const defaultTarget = DEFAULT_TASK_ROUTING[testCase.task]
      const resolvedSlot: ModelSlot = preferredSlotForRole(routedTarget as import('../services/omni/types').ResearchRoleId)

      return {
        task: testCase.task,
        description: testCase.description,
        expectedSlot: testCase.expectedSlot,
        routedTarget,
        defaultTarget,
        resolvedSlot,
        passed: resolvedSlot === testCase.expectedSlot,
      }
    })

    const allPassed = results.every((r) => r.passed)

    res.json({
      success: true,
      data: {
        passed: allPassed,
        totalTests: results.length,
        passedTests: results.filter((r) => r.passed).length,
        failedTests: results.filter((r) => !r.passed).length,
        results,
      },
    })
  }),
)

export default router
