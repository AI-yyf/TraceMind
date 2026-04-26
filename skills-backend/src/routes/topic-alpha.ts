import { Router } from 'express'

import { AppError, asyncHandler } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { TopicExportBundlesSchema, TopicChatSchema, TopicResearchSessionSchema, MultiTopicResearchSessionSchema } from './schemas'
import { enhancedTaskScheduler, STAGE_DURATION_DAYS_MIN, STAGE_DURATION_DAYS_MAX, STAGE_DURATION_DAYS_DEFAULT } from '../services/enhanced-scheduler'
import {
  answerTopicQuestion,
  getTopicViewModel,
  parseTopicChatRequest,
  rebuildTopicViewModel,
  type TopicChatWorkbenchPayload,
} from '../services/topics/alpha-topic'
import { getTopicExportBundle, getTopicExportBundleBatch } from '../services/topics/export-bundle'
import { finalizeTopicChatCommandResponse } from '../services/topics/topic-chat-command'
import { recordTopicChatExchange } from '../services/topics/topic-session-memory'
import {
  assertTopicChatResponseContract,
  assertTopicResearchExportBatchContract,
  assertTopicResearchExportBundleContract,
  assertTopicResearchSessionContract,
  assertTopicViewModelContract,
} from '../services/topics/topic-contracts'
import type { OmniAttachment } from '../services/omni/types'

const router = Router()
const MAX_MULTI_TOPIC_RESEARCH_TOPICS = 5

function readStageWindowMonths(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function enforceRouteContract<T>(
  value: T,
  validator: (payload: unknown) => void,
  context: string,
) {
  try {
    validator(value)
    return value
  } catch (error) {
    throw new AppError(
      500,
      `${context} ${error instanceof Error ? error.message : 'Unknown contract validation failure.'}`,
    )
  }
}

router.post(
  '/export-bundles',
  validate(TopicExportBundlesSchema),
  asyncHandler(async (req, res) => {
    const topicIds = req.body.topicIds

    const bundle = enforceRouteContract(
      await getTopicExportBundleBatch(topicIds),
      assertTopicResearchExportBatchContract,
      'Topic export batch contract drifted before reaching the client.',
    )
    res.json({ success: true, data: bundle })
  }),
)

// Multi-topic research session routes (static paths before :topicId dynamic routes)

router.post(
  '/research-session/batch',
  validate(MultiTopicResearchSessionSchema),
  asyncHandler(async (req, res) => {
    const { topicIds, durationHours, stageDurationDays } = req.body

    let resolvedDurationHours: number

    if (typeof stageDurationDays === 'number' && Number.isFinite(stageDurationDays)) {
      const clampedDays = Math.min(
        STAGE_DURATION_DAYS_MAX,
        Math.max(STAGE_DURATION_DAYS_MIN, Math.trunc(stageDurationDays)),
      )
      resolvedDurationHours = clampedDays * 24
    } else {
      const rawHours = durationHours ?? STAGE_DURATION_DAYS_DEFAULT * 24
      const clampedDuration = Number.isFinite(rawHours)
        ? Math.min(STAGE_DURATION_DAYS_MAX * 24, Math.max(STAGE_DURATION_DAYS_MIN * 24, rawHours))
        : STAGE_DURATION_DAYS_DEFAULT * 24
      resolvedDurationHours = clampedDuration
    }

    const data = await enhancedTaskScheduler.startMultiTopicResearchSession(topicIds, {
      stageDurationDays:
        typeof stageDurationDays === 'number' && Number.isFinite(stageDurationDays)
          ? Math.min(
              STAGE_DURATION_DAYS_MAX,
              Math.max(STAGE_DURATION_DAYS_MIN, Math.trunc(stageDurationDays)),
            )
          : undefined,
      durationHours: resolvedDurationHours,
    })

    res.json({ success: true, data })
  }),
)

router.get(
  '/research-session/batch',
  asyncHandler(async (req, res) => {
    // topicIds passed as comma-separated query param
    const topicIdsParam = req.query.topicIds as string | undefined
    if (!topicIdsParam) {
      throw new AppError(400, 'topicIds query parameter is required (comma-separated)')
    }

    const topicIds = topicIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
    if (topicIds.length === 0) {
      throw new AppError(400, 'topicIds query parameter must contain at least one topic ID')
    }
    if (topicIds.length > MAX_MULTI_TOPIC_RESEARCH_TOPICS) {
      throw new AppError(400, `topicIds query parameter must contain at most ${MAX_MULTI_TOPIC_RESEARCH_TOPICS} topic IDs`)
    }

    const data = await enhancedTaskScheduler.getMultiTopicResearchState(topicIds)
    res.json({ success: true, data })
  }),
)

router.post(
  '/research-session/batch/stop',
  asyncHandler(async (req, res) => {
    const { topicIds } = req.body

    if (!Array.isArray(topicIds) || topicIds.length === 0) {
      throw new AppError(400, 'topicIds must be a non-empty array')
    }
    if (topicIds.length > MAX_MULTI_TOPIC_RESEARCH_TOPICS) {
      throw new AppError(400, `topicIds must contain at most ${MAX_MULTI_TOPIC_RESEARCH_TOPICS} topic IDs`)
    }

    const data = await enhancedTaskScheduler.stopMultiTopicResearchSession(topicIds)
    res.json({ success: true, data })
  }),
)

router.get(
  '/:topicId/view-model',
  asyncHandler(async (req, res) => {
    const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
    const viewModel = enforceRouteContract(
      await getTopicViewModel(req.params.topicId, { stageWindowMonths }),
      assertTopicViewModelContract,
      'Topic view model contract drifted before reaching the client.',
    )
    res.json({ success: true, data: viewModel })
  }),
)

router.post(
  '/:topicId/rebuild',
  asyncHandler(async (req, res) => {
    const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
    const viewModel = enforceRouteContract(
      await rebuildTopicViewModel(req.params.topicId, { stageWindowMonths }),
      assertTopicViewModelContract,
      'Rebuilt topic view model contract drifted before reaching the client.',
    )
    res.json({
      success: true,
      data: {
        topicId: req.params.topicId,
        rebuiltAt: new Date().toISOString(),
        viewModel,
      },
    })
  }),
)

router.post(
  '/:topicId/chat',
  validate(TopicChatSchema),
  asyncHandler(async (req, res) => {
    const { question } = req.body
    const attachments = req.body.attachments as OmniAttachment[] | undefined
    const workbench = req.body.workbench as TopicChatWorkbenchPayload | undefined
    const parsedRequest = parseTopicChatRequest(question, workbench)

    let response = await answerTopicQuestion(req.params.topicId, question, attachments, {
      deferRecording: true,
      workbench,
    })
    response = await finalizeTopicChatCommandResponse({
      topicId: req.params.topicId,
      rawQuestion: question,
      response,
    })
    enforceRouteContract(
      response,
      assertTopicChatResponseContract,
      'Topic chat response contract drifted before reaching the client.',
    )
    await recordTopicChatExchange({
      topicId: req.params.topicId,
      question: parsedRequest.userQuestion,
      agentBrief: parsedRequest.agentBrief,
      contextItems: parsedRequest.contextItems,
      controls: parsedRequest.controls,
      materials: parsedRequest.materials,
      answer: response.answer,
      citations: response.citations,
      guidanceReceipt: response.guidanceReceipt,
      workbenchAction: response.workbenchAction,
    }).catch(() => undefined)
    res.json({ success: true, data: response })
  }),
)

router.get(
  '/:topicId/export-bundle',
  asyncHandler(async (req, res) => {
    const bundle = enforceRouteContract(
      await getTopicExportBundle(req.params.topicId),
      assertTopicResearchExportBundleContract,
      'Topic export bundle contract drifted before reaching the client.',
    )
    res.json({ success: true, data: bundle })
  }),
)

router.get(
  '/:topicId/research-session',
  asyncHandler(async (req, res) => {
    const data = enforceRouteContract(
      await enhancedTaskScheduler.getTopicResearchState(req.params.topicId),
      (payload) => assertTopicResearchSessionContract(payload, req.params.topicId),
      'Topic research session contract drifted before reaching the client.',
    )
    res.json({ success: true, data })
  }),
)

router.post(
  '/:topicId/research-session',
  validate(TopicResearchSessionSchema),
  asyncHandler(async (req, res) => {
    // Support both stageDurationDays (preferred) and durationHours (legacy)
    const stageDurationDays = req.body.stageDurationDays
    const durationHours = req.body.durationHours

    let resolvedDurationHours: number

    if (typeof stageDurationDays === 'number' && Number.isFinite(stageDurationDays)) {
      const clampedDays = Math.min(
        STAGE_DURATION_DAYS_MAX,
        Math.max(STAGE_DURATION_DAYS_MIN, Math.trunc(stageDurationDays)),
      )
      resolvedDurationHours = clampedDays * 24
    } else {
      const rawHours = durationHours ?? STAGE_DURATION_DAYS_DEFAULT * 24
      const clampedDuration = Number.isFinite(rawHours)
        ? Math.min(STAGE_DURATION_DAYS_MAX * 24, Math.max(STAGE_DURATION_DAYS_MIN * 24, rawHours))
        : STAGE_DURATION_DAYS_DEFAULT * 24
      resolvedDurationHours = clampedDuration
    }

    const data = enforceRouteContract(
      await enhancedTaskScheduler.startTopicResearchSession(req.params.topicId, {
        stageDurationDays:
          typeof stageDurationDays === 'number' && Number.isFinite(stageDurationDays)
            ? Math.min(
                STAGE_DURATION_DAYS_MAX,
                Math.max(STAGE_DURATION_DAYS_MIN, Math.trunc(stageDurationDays)),
              )
            : undefined,
        durationHours: resolvedDurationHours,
      }),
      (payload) => assertTopicResearchSessionContract(payload, req.params.topicId),
      'Started topic research session contract drifted before reaching the client.',
    )

    res.json({ success: true, data })
  }),
)

router.post(
  '/:topicId/research-session/stop',
  asyncHandler(async (req, res) => {
    const data = enforceRouteContract(
      await enhancedTaskScheduler.stopTopicResearchSession(req.params.topicId),
      (payload) => assertTopicResearchSessionContract(payload, req.params.topicId),
      'Stopped topic research session contract drifted before reaching the client.',
    )
    res.json({ success: true, data })
  }),
)

export default router
