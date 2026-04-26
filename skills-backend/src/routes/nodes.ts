import { Router } from 'express'

import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { CreateNodeSchema, UpdateNodeSchema } from './schemas'
import { getNodeViewModel, rebuildNodeViewModel } from '../services/topics/alpha-reader'
import { assertNodeViewModelContract } from '../services/topics/topic-contracts'
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

router.get('/', asyncHandler(async (req, res) => {
  const { topicId, stageIndex } = req.query
  const where: Record<string, unknown> = {}

  if (topicId) where.topicId = topicId as string
  if (stageIndex) where.stageIndex = parseInt(stageIndex as string, 10)

  const nodes = await prisma.research_nodes.findMany({
    where,
    include: {
      node_papers: {
        include: {
          papers: {
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
      papers: {
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
  const enhanced = req.query.enhanced === 'true'
  const viewModel = enforceRouteContract(
    await getNodeViewModel(req.params.nodeId, { stageWindowMonths, enhanced }),
    assertNodeViewModelContract,
    'Node view model contract drifted before reaching the client.',
  )
  res.json({
    success: true,
    data: viewModel
  })
}))

router.post('/:nodeId/rebuild-article', asyncHandler(async (req, res) => {
  const { nodeId } = req.params
  const enhanced = req.query.enhanced !== 'false' // default to true

  // Clear the persisted fullArticleFlow to force regeneration
  await prisma.research_nodes.update({
    where: { id: nodeId },
    data: { fullArticleFlow: null },
  })

  const viewModel = enforceRouteContract(
    await rebuildNodeViewModel(nodeId, { enhanced }),
    assertNodeViewModelContract,
    'Node view model contract drifted after rebuild.',
  )

  logger.info('Rebuilt node article', { nodeId, enhanced })

  res.json({
    success: true,
    data: viewModel,
  })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const node = await prisma.research_nodes.findUnique({
    where: { id },
    include: {
      topics: true,
      node_papers: {
        include: {
          papers: {
            include: {
              figures: true,
              figure_groups: true,
              tables: true,
              formulas: true
            }
          }
        },
        orderBy: { order: 'asc' }
      },
      papers: true
    }
  })

  if (!node) {
    throw new AppError(404, 'Node not found.')
  }

  const response = {
    ...node,
    papers: node.node_papers.map((item: { papers: { id: string; titleZh: string | null; titleEn: string | null; coverPath: string | null; published: Date; figures: unknown[]; tables: unknown[]; formulas: unknown[] } }) => item.papers),
    fullContent: node.fullContent as unknown,
    assets: {
      figures: node.node_papers.flatMap((item: { papers: { figures: unknown[] } }) => item.papers.figures),
      figureGroups: node.node_papers.flatMap((item: { papers: { figure_groups: unknown[] } }) => item.papers.figure_groups),
      tables: node.node_papers.flatMap((item: { papers: { tables: unknown[] } }) => item.papers.tables),
      formulas: node.node_papers.flatMap((item: { papers: { formulas: unknown[] } }) => item.papers.formulas)
    }
  }

  res.json({
    success: true,
    data: response
  })
}))

router.post('/', validate(CreateNodeSchema), asyncHandler(async (req, res) => {
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

  const topic = await prisma.topics.findUnique({
    where: { id: topicId }
  })

  if (!topic) {
    throw new AppError(404, 'Topic not found.')
  }

  if (paperIds && paperIds.length > 0) {
    const papers = await prisma.papers.findMany({
      where: { id: { in: paperIds } }
    })

    if (papers.length !== paperIds.length) {
      throw new AppError(400, 'Some papers do not exist.')
    }
  }

  const node = await prisma.research_nodes.create({
    data: {
      id: crypto.randomUUID(),
      updatedAt: new Date(),
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
      node_papers: {
        create: paperIds.map((paperId: string, index: number) => ({
          id: crypto.randomUUID(),
          paperId,
          order: index
        }))
      }
    },
    include: {
      node_papers: {
        include: {
          papers: true
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

router.patch('/:id', validate(UpdateNodeSchema), asyncHandler(async (req, res) => {
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

  const node = await prisma.research_nodes.update({
    where: { id },
    data: {
      updatedAt: new Date(),
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
      node_papers: {
        include: {
          papers: true
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

  await prisma.research_nodes.delete({
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

  await prisma.node_papers.deleteMany({
    where: { nodeId: id }
  })

  await prisma.node_papers.createMany({
    data: paperIds.map((paperId: string, index: number) => ({
      id: crypto.randomUUID(),
      nodeId: id,
      paperId,
      order: index
    }))
  })

  const node = await prisma.research_nodes.findUnique({
    where: { id },
    include: {
      node_papers: {
        include: { papers: true }
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
