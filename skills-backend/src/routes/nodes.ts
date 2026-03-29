import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'

const router = Router()

// 获取所有节点
router.get('/', asyncHandler(async (req, res) => {
  const { topicId, stageIndex } = req.query

  const where: any = {}
  if (topicId) where.topicId = topicId as string
  if (stageIndex) where.stageIndex = parseInt(stageIndex as string)

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

// 获取单个节点详情（包含完整内容）
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
    throw new AppError(404, '节点不存在')
  }

  // 构建响应数据
  const response = {
    ...node,
    papers: node.papers.map(np => np.paper),
    fullContent: node.fullContent as any,
    assets: {
      figures: node.papers.flatMap(np => np.paper.figures),
      tables: node.papers.flatMap(np => np.paper.tables),
      formulas: node.papers.flatMap(np => np.paper.formulas)
    }
  }

  res.json({
    success: true,
    data: response
  })
}))

// 创建节点
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

  // 验证主题存在
  const topic = await prisma.topic.findUnique({
    where: { id: topicId }
  })
  if (!topic) {
    throw new AppError(404, '主题不存在')
  }

  // 验证论文存在
  if (paperIds && paperIds.length > 0) {
    const papers = await prisma.paper.findMany({
      where: { id: { in: paperIds } }
    })
    if (papers.length !== paperIds.length) {
      throw new AppError(400, '部分论文不存在')
    }
  }

  // 创建节点
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
      fullContent: fullContent || {},
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

  logger.info('创建节点', { nodeId: node.id, topicId, paperCount: paperIds.length })

  res.status(201).json({
    success: true,
    data: node
  })
}))

// 更新节点
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
      fullContent: fullContent || undefined
    },
    include: {
      papers: {
        include: {
          paper: true
        }
      }
    }
  })

  logger.info('更新节点', { nodeId: id })

  res.json({
    success: true,
    data: node
  })
}))

// 删除节点
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  await prisma.researchNode.delete({
    where: { id }
  })

  logger.info('删除节点', { nodeId: id })

  res.json({
    success: true,
    message: '节点已删除'
  })
}))

// 更新节点论文关联
router.post('/:id/papers', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { paperIds } = req.body

  // 删除现有关联
  await prisma.nodePaper.deleteMany({
    where: { nodeId: id }
  })

  // 创建新关联
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

  logger.info('更新节点论文', { nodeId: id, paperCount: paperIds.length })

  res.json({
    success: true,
    data: node
  })
}))

export default router
