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

/**
 * 获取论文的主节点 - 用于PaperPage重定向
 * GET /api/papers/:paperId/primary-node
 */
router.get('/:paperId/primary-node', asyncHandler(async (req, res) => {
  const { paperId } = req.params
  const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)

  // 查找包含该论文的所有节点
  const nodePapers = await prisma.nodePaper.findMany({
    where: { paperId },
    include: {
      node: {
        include: {
          topic: true
        }
      }
    },
    orderBy: [
      { node: { stageIndex: 'asc' } },
      { order: 'asc' }
    ]
  })

  if (nodePapers.length === 0) {
    throw new AppError(404, 'Paper not associated with any node.')
  }

  // 选择最早的节点作为主节点
  const primaryNodePaper = nodePapers[0]
  const primaryNode = primaryNodePaper.node

  // 构建重定向URL
  const anchorParam = `paper:${paperId}`
  const stageParam = stageWindowMonths ? `&stageMonths=${stageWindowMonths}` : ''
  const redirectUrl = `/node/${primaryNode.id}?anchor=${encodeURIComponent(anchorParam)}${stageParam}`

  res.json({
    success: true,
    data: {
      nodeId: primaryNode.id,
      nodeRoute: `/node/${primaryNode.id}`,
      topicId: primaryNode.topic?.id,
      topicRoute: primaryNode.topic ? `/topic/${primaryNode.topic.route || primaryNode.topic.id}` : null,
      stageIndex: primaryNode.stageIndex,
      redirectUrl,
      anchorId: anchorParam,
      allNodes: nodePapers.map(np => ({
        nodeId: np.node.id,
        stageIndex: np.node.stageIndex,
        nodeTitle: np.node.title
      }))
    }
  })
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
