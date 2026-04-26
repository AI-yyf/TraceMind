import { Router } from 'express'
import { z } from 'zod'

import { AppError, asyncHandler } from '../middleware/errorHandler'
import { searchResearchCorpus } from '../services/topics/search'
import { searchPapers } from '../services/search/semantic-scholar'

const router = Router()

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

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertContract(isRecord(value), message)
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  assertContract(Array.isArray(value), message)
}

function assertString(value: unknown, message: string, allowEmpty = false): asserts value is string {
  assertContract(typeof value === 'string', message)
  if (!allowEmpty) assertContract(value.trim().length > 0, message)
}

function assertOptionalString(value: unknown, message: string, allowEmpty = false) {
  if (value == null) return
  assertString(value, message, allowEmpty)
}

function _assertBoolean(value: unknown, message: string): asserts value is boolean {
  assertContract(typeof value === 'boolean', message)
}

function assertNumber(
  value: unknown,
  message: string,
  options: { integer?: boolean; min?: number } = {},
): asserts value is number {
  assertContract(typeof value === 'number' && Number.isFinite(value), message)
  if (options.integer) assertContract(Number.isInteger(value), message)
  if (typeof options.min === 'number') assertContract(value >= options.min, message)
}

function assertStringArray(value: unknown, message: string, allowEmptyStrings = false): asserts value is string[] {
  assertArray(value, message)
  value.forEach((entry, index) => assertString(entry, `${message} item ${index + 1}`, allowEmptyStrings))
}

function assertOneOf<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
  message: string,
): asserts value is TAllowed[number] {
  assertString(value, message)
  assertContract(allowed.includes(value as TAllowed[number]), message)
}

function assertFacetEntry(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.value, `${message} is missing "value".`)
  assertString(value.label, `${message} is missing "label".`)
  assertNumber(value.count, `${message} is missing "count".`, { integer: true, min: 0 })
}

function assertSearchResultItem(value: unknown, message: string) {
  assertRecord(value, message)
  assertString(value.id, `${message} is missing "id".`)
  assertOneOf(value.kind, ['topic', 'node', 'paper', 'section', 'figure', 'table', 'formula'] as const, `${message} has an unsupported "kind".`)
  assertString(value.title, `${message} is missing "title".`)
  assertString(value.subtitle, `${message} is missing "subtitle".`, true)
  assertString(value.excerpt, `${message} is missing "excerpt".`, true)
  assertString(value.route, `${message} is missing "route".`)
  assertStringArray(value.tags, `${message} is missing "tags".`, true)
  assertStringArray(value.matchedFields, `${message} is missing "matchedFields".`, true)
  assertOptionalString(value.anchorId, `${message} has an invalid "anchorId".`, true)
  assertOptionalString(value.topicId, `${message} has an invalid "topicId".`, true)
  assertOptionalString(value.topicTitle, `${message} has an invalid "topicTitle".`, true)
  assertOptionalString(value.stageLabel, `${message} has an invalid "stageLabel".`, true)
  assertOptionalString(value.timeLabel, `${message} has an invalid "timeLabel".`, true)
  assertOptionalString(value.nodeId, `${message} has an invalid "nodeId".`, true)
  assertOptionalString(value.nodeTitle, `${message} has an invalid "nodeTitle".`, true)
  assertOptionalString(value.nodeRoute, `${message} has an invalid "nodeRoute".`, true)
  assertOptionalString(value.locationLabel, `${message} has an invalid "locationLabel".`, true)
  if (value.relatedNodes != null) {
    assertArray(value.relatedNodes, `${message} has an invalid "relatedNodes" collection.`)
    value.relatedNodes.forEach((entry, index) => {
      assertRecord(entry, `${message} related node ${index + 1} is invalid.`)
      assertString(entry.nodeId, `${message} related node ${index + 1} is missing "nodeId".`)
      assertString(entry.title, `${message} related node ${index + 1} is missing "title".`)
      assertNumber(entry.stageIndex, `${message} related node ${index + 1} is missing "stageIndex".`, {
        integer: true,
        min: 0,
      })
      assertOptionalString(entry.stageLabel, `${message} related node ${index + 1} has an invalid "stageLabel".`, true)
      assertString(entry.route, `${message} related node ${index + 1} is missing "route".`)
    })
  }
}

function assertSearchGroup(value: unknown, message: string) {
  assertRecord(value, message)
  assertOneOf(value.group, ['topic', 'node', 'paper', 'evidence'] as const, `${message} has an unsupported "group".`)
  assertString(value.label, `${message} is missing "label".`)
  assertArray(value.items, `${message} is missing "items".`)
  value.items.forEach((entry, index) => assertSearchResultItem(entry, `${message} item ${index + 1}`))
}

function assertSearchResponseContract(value: unknown) {
  assertRecord(value, 'Search response is unavailable from the backend contract.')
  assertString(value.query, 'Search response is missing "query".', true)
  assertOneOf(value.scope, ['global', 'topic'] as const, 'Search response has an unsupported "scope".')
  assertRecord(value.totals, 'Search response is missing "totals".')
  assertNumber(value.totals.all, 'Search totals are missing "all".', { integer: true, min: 0 })
  assertNumber(value.totals.topic, 'Search totals are missing "topic".', { integer: true, min: 0 })
  assertNumber(value.totals.node, 'Search totals are missing "node".', { integer: true, min: 0 })
  assertNumber(value.totals.paper, 'Search totals are missing "paper".', { integer: true, min: 0 })
  assertNumber(value.totals.evidence, 'Search totals are missing "evidence".', { integer: true, min: 0 })
  assertArray(value.groups, 'Search response is missing grouped results.')
  value.groups.forEach((group, index) => assertSearchGroup(group, `Search group ${index + 1}`))
  if (value.facets != null) {
    assertRecord(value.facets, 'Search response facets are invalid.')
    assertArray(value.facets.stages, 'Search stage facets are invalid.')
    assertArray(value.facets.topics, 'Search topic facets are invalid.')
    value.facets.stages.forEach((entry, index) => assertFacetEntry(entry, `Search stage facet ${index + 1}`))
    value.facets.topics.forEach((entry, index) => assertFacetEntry(entry, `Search topic facet ${index + 1}`))
  }
}

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

    const result = enforceRouteContract(
      await searchResearchCorpus({
        q: query.q,
        scope: query.scope,
        topicId: query.topicId,
        topics,
        types,
        stages,
        limit: query.limit,
        stageWindowMonths: query.stageMonths,
      }),
      assertSearchResponseContract,
      'Search response contract drifted before reaching the client.',
    )

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
