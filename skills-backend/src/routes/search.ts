import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler'
import { searchResearchCorpus } from '../services/topics/search'
import { searchPapers } from '../services/search/semantic-scholar'

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

/**
 * GET /api/search/external
 * 通过 Semantic Scholar 搜索外部论文
 * 用于扩展搜索发现层
 */
const externalQuerySchema = z.object({
  q: z.string().trim().min(1),
  yearStart: z.coerce.number().int().min(2010).max(2030).optional(),
  yearEnd: z.coerce.number().int().min(2010).max(2030).optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
})

router.get(
  '/external',
  asyncHandler(async (req, res) => {
    const query = externalQuerySchema.parse(req.query)

    try {
      const papers = await searchPapers(query.q, {
        yearStart: query.yearStart,
        yearEnd: query.yearEnd,
        limit: query.limit,
      })

      res.json({
        success: true,
        data: {
          query: query.q,
          totalResults: papers.length,
          papers: papers.map(p => ({
            paperId: p.paperId,
            title: p.title,
            abstract: p.abstract || null,
            authors: p.authors.map(a => a.name),
            year: p.year,
            citationCount: p.citationCount,
            referenceCount: p.referenceCount,
            externalIds: p.externalIds || null,
            openAccessPdf: p.openAccessPdf?.url || null,
            tldr: p.tldr?.text || null,
            venue: p.venue || null,
          })),
        },
      })
    } catch (error) {
      // Semantic Scholar API 可能超时或限流
      const message = error instanceof Error ? error.message : 'External search failed'
      res.json({
        success: true,
        data: {
          query: query.q,
          totalResults: 0,
          papers: [],
          warning: message,
        },
      })
    }
  }),
)

export default router
