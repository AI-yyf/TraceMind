import { Router } from 'express'

import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { ChatCompleteSchema } from './schemas'
import { omniGateway } from '../services/omni/gateway'
import { answerTopicQuestion } from '../services/topics/alpha-topic'
import type { OmniAttachment, OmniMessage, OmniCompleteRequest } from '../services/omni/types'

const router = Router()

/**
 * Helper to resolve user ID from request headers
 */
function resolveRequestUserId(req: { header(name: string): string | undefined }) {
  const candidate = req.header('x-alpha-user-id')?.trim()
  if (!candidate) return undefined
  const normalized = candidate.replace(/[^a-zA-Z0-9:_-]/gu, '').slice(0, 64)
  return normalized || undefined
}

/**
 * POST /api/chat/complete
 *
 * Unified chat endpoint that supports:
 * - General chat (no topicId)
 * - Topic-specific chat with context injection (with topicId)
 *
 * Request format:
 * {
 *   "messages": [{"role": "user", "content": "..."}],
 *   "topicId": "optional-topic-id",
 *   "task": "topic_chat" | "general_chat"
 * }
 */
router.post(
  '/complete',
  validate(ChatCompleteSchema),
  asyncHandler(async (req, res) => {
    const { messages, topicId, task, attachments, userId, context: _context } = req.body as {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content?: string; attachments?: OmniAttachment[] }>
      topicId?: string
      task?: 'general_chat' | 'topic_chat' | 'topic_chat_vision'
      attachments?: OmniAttachment[]
      userId?: string
      context?: Record<string, unknown>
    }

    const resolvedUserId = userId || resolveRequestUserId(req)

    // If topicId is provided, use topic-specific chat with context injection
    if (topicId) {
      // Extract the last user message as the question
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
      const question = lastUserMessage?.content || ''

      if (!question.trim()) {
        throw new AppError(400, 'A user message with content is required for topic chat.')
      }

      // Use the topic chat system which handles context injection
      const response = await answerTopicQuestion(
        topicId,
        question,
        attachments || lastUserMessage?.attachments,
        { deferRecording: false }
      )

      res.json({ success: true, data: response })
      return
    }

    // General chat without topic context
    const omniMessages: OmniMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content || '',
      attachments: m.attachments,
    }))

    // Determine task based on attachments
    const resolvedTask = task || (attachments?.length ? 'topic_chat_vision' : 'general_chat')

const request: OmniCompleteRequest = {
      task: resolvedTask,
      userId: resolvedUserId,
      messages: omniMessages,
    }

    const result = await omniGateway.complete(request)

    res.json({
      success: true,
      data: {
        text: result.text,
        reasoning: result.reasoning,
        provider: result.provider,
        model: result.model,
        slot: result.slot,
        capabilities: result.capabilities,
        usedFallback: result.usedFallback,
        issue: result.issue,
      },
    })
  }),
)

/**
 * POST /api/chat/stream
 *
 * Streaming chat endpoint (SSE)
 */
router.post(
  '/stream',
  validate(ChatCompleteSchema),
  async (req, res, next) => {
    try {
      const { messages, topicId, task, attachments, userId, context: _context } = req.body as {
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content?: string; attachments?: OmniAttachment[] }>
        topicId?: string
        task?: 'general_chat' | 'topic_chat' | 'topic_chat_vision'
        attachments?: OmniAttachment[]
        userId?: string
        context?: Record<string, unknown>
      }

      const resolvedUserId = userId || resolveRequestUserId(req)

      // Topic chat doesn't support streaming in the same way
      if (topicId) {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
        const question = lastUserMessage?.content || ''

        if (!question.trim()) {
          throw new AppError(400, 'A user message with content is required for topic chat.')
        }

        const response = await answerTopicQuestion(
          topicId,
          question,
          attachments || lastUserMessage?.attachments,
          { deferRecording: false }
        )

        // Stream the response as a single chunk
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        res.write('event: chunk\n')
        res.write(`data: ${JSON.stringify({ text: response.answer })}\n\n`)
        res.write('event: done\n')
        res.write(`data: ${JSON.stringify(response)}\n\n`)
        res.end()
        return
      }

      // General chat streaming
      const omniMessages: OmniMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content || '',
        attachments: m.attachments,
      }))

      const resolvedTask = task || (attachments?.length ? 'topic_chat_vision' : 'general_chat')

      const request: OmniCompleteRequest = {
        task: resolvedTask,
        userId: resolvedUserId,
        messages: omniMessages,
      }

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
  },
)

export default router
