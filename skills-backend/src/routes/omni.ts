import { Router } from 'express'

import { asyncHandler, AppError } from '../middleware/errorHandler'
import { omniGateway } from '../services/omni/gateway'
import type { OmniAttachment, OmniCompleteRequest } from '../services/omni/types'

const router = Router()

router.post(
  '/complete',
  asyncHandler(async (req, res) => {
    const result = await omniGateway.complete(req.body as OmniCompleteRequest)
    res.json({ success: true, data: result })
  }),
)

router.post('/stream', async (req, res, next) => {
  try {
    const result = await omniGateway.complete(req.body as OmniCompleteRequest)

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

export default router
