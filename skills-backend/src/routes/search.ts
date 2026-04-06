import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler'
import { searchResearchCorpus } from '../services/topics/search'

const router = Router()

const querySchema = z.object({
  q: z.string().trim().min(1),
  scope: z.enum(['global', 'topic']).default('global'),
  topicId: z.string().optional(),
  topics: z.string().optional(),
  types: z.string().optional(),
  stages: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  stageMonths: z.coerce.number().int().positive().max(24).optional(),
})

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = querySchema.parse(req.query)
    const types = query.types
      ? query.types
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean) as Array<'topic' | 'node' | 'paper' | 'section' | 'figure' | 'table' | 'formula'>
      : undefined
    const topics = query.topics
      ? query.topics
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined
    const stages = query.stages
      ? query.stages
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined

    const result = await searchResearchCorpus({
      q: query.q,
      scope: query.scope,
      topicId: query.topicId,
      topics,
      types,
      stages,
      limit: query.limit,
      stageWindowMonths: query.stageMonths,
    })

    res.json({ success: true, data: result })
  }),
)

export default router
