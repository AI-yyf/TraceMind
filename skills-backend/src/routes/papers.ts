import { Router } from 'express'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { getPaperViewModel } from '../services/topics/alpha-reader'

const router = Router()

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

  const papers = await prisma.paper.findMany({
    where,
    orderBy: { published: 'desc' }
  })

  res.json({ success: true, data: papers })
}))

router.get('/:paperId/view-model', asyncHandler(async (req, res) => {
  const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
  const viewModel = await getPaperViewModel(req.params.paperId, { stageWindowMonths })
  res.json({ success: true, data: viewModel })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const paper = await prisma.paper.findUnique({
    where: { id: req.params.id },
    include: {
      figures: true,
      tables: true,
      formulas: true,
      sections: { orderBy: { order: 'asc' } }
    }
  })

  if (!paper) {
    throw new AppError(404, 'Paper not found.')
  }

  res.json({ success: true, data: paper })
}))

router.post('/', asyncHandler(async (req, res) => {
  const paper = await prisma.paper.create({
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
