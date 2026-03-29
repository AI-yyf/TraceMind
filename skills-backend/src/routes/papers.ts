import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const { topicId, status } = req.query
  const where: any = {}
  if (topicId) where.topicId = topicId as string
  if (status) where.status = status as string

  const papers = await prisma.paper.findMany({
    where,
    orderBy: { published: 'desc' }
  })

  res.json({ success: true, data: papers })
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
  if (!paper) throw new AppError(404, '论文不存在')
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
