import { Router } from 'express'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { getNodeViewModel } from '../services/topics/alpha-reader'
import { logger } from '../utils/logger'

const router = Router()

function readStageWindowMonths(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeFullContent(value: unknown) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const { topicId, stageIndex } = req.query
  const where: Record<string, unknown> = {}

  if (topicId) where.topicId = topicId as string
  if (stageIndex) where.stageIndex = parseInt(stageIndex as string, 10)

  const nodes = await prisma.researchNode.findMany({
    where,
    include: {
      papers: {
        include: {
          paper: {
            select: {
              id: true,
              titleZh: true,
              titleEn: true,
              coverPath: true,
              published: true
            }
          }
        }
      },
      primaryPaper: {
        select: {
          id: true,
          titleZh: true,
          coverPath: true
        }
      }
    },
    orderBy: [
      { stageIndex: 'asc' },
      { createdAt: 'asc' }
    ]
  })

  res.json({
    success: true,
    data: nodes
  })
}))

router.get('/:nodeId/view-model', asyncHandler(async (req, res) => {
  const stageWindowMonths = readStageWindowMonths(req.query.stageMonths)
  const viewModel = await getNodeViewModel(req.params.nodeId, { stageWindowMonths })
  res.json({
    success: true,
    data: viewModel
  })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const node = await prisma.researchNode.findUnique({
    where: { id },
    include: {
      topic: true,
      papers: {
        include: {
          paper: {
            include: {
              figures: true,
              tables: true,
              formulas: true
            }
          }
        },
        orderBy: { order: 'asc' }
      },
      primaryPaper: true
    }
  })

  if (!node) {
    throw new AppError(404, 'Node not found.')
  }

  const response = {
    ...node,
    papers: node.papers.map((item) => item.paper),
    fullContent: node.fullContent as unknown,
    assets: {
      figures: node.papers.flatMap((item) => item.paper.figures),
      tables: node.papers.flatMap((item) => item.paper.tables),
      formulas: node.papers.flatMap((item) => item.paper.formulas)
    }
  }

  res.json({
    success: true,
    data: response
  })
}))

router.post('/', asyncHandler(async (req, res) => {
  const {
    topicId,
    stageIndex,
    nodeLabel,
    nodeSubtitle,
    nodeSummary,
    nodeExplanation,
    nodeCoverImage,
    paperIds,
    primaryPaperId,
    isMergeNode,
    fullContent
  } = req.body

  const topic = await prisma.topic.findUnique({
    where: { id: topicId }
  })

  if (!topic) {
    throw new AppError(404, 'Topic not found.')
  }

  if (paperIds && paperIds.length > 0) {
    const papers = await prisma.paper.findMany({
      where: { id: { in: paperIds } }
    })

    if (papers.length !== paperIds.length) {
      throw new AppError(400, 'Some papers do not exist.')
    }
  }

  const node = await prisma.researchNode.create({
    data: {
      topicId,
      stageIndex,
      nodeLabel,
      nodeSubtitle,
      nodeSummary,
      nodeExplanation,
      nodeCoverImage,
      primaryPaperId: primaryPaperId || paperIds[0],
      isMergeNode: isMergeNode || paperIds.length > 1,
      provisional: false,
      status: 'canonical',
      fullContent: normalizeFullContent(fullContent),
      papers: {
        create: paperIds.map((paperId: string, index: number) => ({
          paperId,
          order: index
        }))
      }
    },
    include: {
      papers: {
        include: {
          paper: true
        }
      }
    }
  })

  logger.info('Created node', { nodeId: node.id, topicId, paperCount: paperIds.length })

  res.status(201).json({
    success: true,
    data: node
  })
}))

router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const {
    nodeLabel,
    nodeSubtitle,
    nodeSummary,
    nodeExplanation,
    nodeCoverImage,
    stageIndex,
    status,
    fullContent
  } = req.body

  const node = await prisma.researchNode.update({
    where: { id },
    data: {
      nodeLabel,
      nodeSubtitle,
      nodeSummary,
      nodeExplanation,
      nodeCoverImage,
      stageIndex,
      status,
      fullContent: normalizeFullContent(fullContent),
    },
    include: {
      papers: {
        include: {
          paper: true
        }
      }
    }
  })

  logger.info('Updated node', { nodeId: id })

  res.json({
    success: true,
    data: node
  })
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  await prisma.researchNode.delete({
    where: { id }
  })

  logger.info('Deleted node', { nodeId: id })

  res.json({
    success: true,
    message: 'Node deleted.'
  })
}))

router.post('/:id/papers', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { paperIds } = req.body

  await prisma.nodePaper.deleteMany({
    where: { nodeId: id }
  })

  await prisma.nodePaper.createMany({
    data: paperIds.map((paperId: string, index: number) => ({
      nodeId: id,
      paperId,
      order: index
    }))
  })

  const node = await prisma.researchNode.findUnique({
    where: { id },
    include: {
      papers: {
        include: { paper: true }
      }
    }
  })

  logger.info('Updated node papers', { nodeId: id, paperCount: paperIds.length })

  res.json({
    success: true,
    data: node
  })
}))

export default router
