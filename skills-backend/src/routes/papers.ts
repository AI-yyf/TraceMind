import { Router } from 'express'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { CreatePaperSchema } from './schemas'
import { getPaperViewModel } from '../services/topics/alpha-reader'
import { assertPaperViewModelContract } from '../services/topics/topic-contracts'

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

function readStageWindowMonths(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

router.get('/', asyncHandler(async (req, res) => {
  const { topicId, status } = req.query
  const where: Record<string, unknown> = {}

  if (topicId) where.topicId = topicId as string
  if (status) where.status = status as string

  const papers = await prisma.papers.findMany({
    where,
    orderBy: { published: 'desc' }
  })

  res.json({ success: true, data: papers })
}))

router.get('/:paperId/view-model', asyncHandler(async (req, res) => {
  const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
  const viewModel = enforceRouteContract(
    await getPaperViewModel(req.params.paperId, { stageWindowMonths }),
    assertPaperViewModelContract,
    'Paper view model contract drifted before reaching the client.',
  )
  res.json({ success: true, data: viewModel })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const paper = await prisma.papers.findUnique({
    where: { id: req.params.id },
    include: {
      figures: true,
      figure_groups: true,
      tables: true,
      formulas: true,
      paper_sections: { orderBy: { order: 'asc' } }
    }
  })

  if (!paper) {
    throw new AppError(404, 'Paper not found.')
  }

  res.json({ success: true, data: paper })
}))

router.post('/', validate(CreatePaperSchema), asyncHandler(async (req, res) => {
  const paper = await prisma.papers.create({
    data: {
      ...req.body,
      authors: JSON.stringify(req.body.authors || []),
      figurePaths: JSON.stringify(req.body.figurePaths || []),
      tablePaths: JSON.stringify(req.body.tablePaths || []),
      tags: JSON.stringify(req.body.tags || [])
    }
  })

  res.status(201).json({ success: true, data: paper })
}))

export default router
