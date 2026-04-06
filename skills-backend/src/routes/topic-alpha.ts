import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import { answerTopicQuestion, getTopicViewModel, rebuildTopicViewModel } from '../services/topics/alpha-topic'
import { getTopicExportBundle, getTopicExportBundleBatch } from '../services/topics/export-bundle'
import {
  extractTopicChatUserQuestion,
  finalizeTopicChatCommandResponse,
  parseTopicChatCommand,
} from '../services/topics/topic-chat-command'
import { recordTopicChatExchange } from '../services/topics/topic-session-memory'
import type { OmniAttachment } from '../services/omni/types'

const router = Router()

function readStageWindowMonths(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

router.post(
  '/export-bundles',
  asyncHandler(async (req, res) => {
    const topicIds = Array.isArray(req.body?.topicIds)
      ? req.body.topicIds.filter((value: unknown): value is string => typeof value === 'string')
      : []

    const bundle = await getTopicExportBundleBatch(topicIds)
    res.json({ success: true, data: bundle })
  }),
)

router.get(
  '/:topicId/view-model',
  asyncHandler(async (req, res) => {
    const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
    const viewModel = await getTopicViewModel(req.params.topicId, { stageWindowMonths })
    res.json({ success: true, data: viewModel })
  }),
)

router.post(
  '/:topicId/rebuild',
  asyncHandler(async (req, res) => {
    const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
    const viewModel = await rebuildTopicViewModel(req.params.topicId, { stageWindowMonths })
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
  asyncHandler(async (req, res) => {
    const { question, attachments } = req.body as {
      question: string
      attachments?: OmniAttachment[]
    }

    let response = await answerTopicQuestion(req.params.topicId, question, attachments, {
      deferRecording: true,
    })
    response = await finalizeTopicChatCommandResponse({
      topicId: req.params.topicId,
      rawQuestion: question,
      response,
    })
    if (!parseTopicChatCommand(question)) {
      void recordTopicChatExchange({
        topicId: req.params.topicId,
        question: extractTopicChatUserQuestion(question),
        answer: response.answer,
        citations: response.citations,
      }).catch(() => undefined)
    }
    res.json({ success: true, data: response })
  }),
)

router.get(
  '/:topicId/export-bundle',
  asyncHandler(async (req, res) => {
    const bundle = await getTopicExportBundle(req.params.topicId)
    res.json({ success: true, data: bundle })
  }),
)

router.get(
  '/:topicId/research-session',
  asyncHandler(async (req, res) => {
    const data = await enhancedTaskScheduler.getTopicResearchState(req.params.topicId)
    res.json({ success: true, data })
  }),
)

router.post(
  '/:topicId/research-session',
  asyncHandler(async (req, res) => {
    const durationHours = Number(req.body?.durationHours ?? 4)
    const clampedDuration = Number.isFinite(durationHours)
      ? Math.min(48, Math.max(1, durationHours))
      : 4

    const data = await enhancedTaskScheduler.startTopicResearchSession(req.params.topicId, {
      durationHours: clampedDuration,
    })

    res.json({ success: true, data })
  }),
)

router.post(
  '/:topicId/research-session/stop',
  asyncHandler(async (req, res) => {
    const data = await enhancedTaskScheduler.stopTopicResearchSession(req.params.topicId)
    res.json({ success: true, data })
  }),
)

export default router
