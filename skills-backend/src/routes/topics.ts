import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'

const router = Router()

// 获取所有主题
router.get('/', asyncHandler(async (req, res) => {
  const topics = await prisma.topic.findMany({
    include: {
      _count: {
        select: {
          papers: true,
          nodes: true
        }
      }
    },
    orderBy: { updatedAt: 'desc' }
  })

  res.json({
    success: true,
    data: topics.map(topic => ({
      ...topic,
      paperCount: topic._count.papers,
      nodeCount: topic._count.nodes,
      _count: undefined
    }))
  })
}))

// 获取单个主题详情
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const topic = await prisma.topic.findUnique({
    where: { id },
    include: {
      papers: {
        orderBy: { published: 'desc' }
      },
      nodes: {
        include: {
          papers: {
            include: {
              paper: true
            }
          }
        },
        orderBy: { stageIndex: 'asc' }
      },
      stages: {
        orderBy: { order: 'asc' }
      }
    }
  })

  if (!topic) {
    throw new AppError(404, '主题不存在')
  }

  res.json({
    success: true,
    data: topic
  })
}))

// 创建主题
router.post('/', asyncHandler(async (req, res) => {
  const { nameZh, nameEn, focusLabel, summary, description } = req.body

  const topic = await prisma.topic.create({
    data: {
      nameZh,
      nameEn,
      focusLabel,
      summary,
      description
    }
  })

  logger.info('创建主题', { topicId: topic.id, nameZh })

  res.status(201).json({
    success: true,
    data: topic
  })
}))

// 更新主题
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { nameZh, nameEn, focusLabel, summary, description, status } = req.body

  const topic = await prisma.topic.update({
    where: { id },
    data: {
      nameZh,
      nameEn,
      focusLabel,
      summary,
      description,
      status
    }
  })

  logger.info('更新主题', { topicId: id })

  res.json({
    success: true,
    data: topic
  })
}))

// 删除主题
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  await prisma.topic.delete({
    where: { id }
  })

  logger.info('删除主题', { topicId: id })

  res.json({
    success: true,
    message: '主题已删除'
  })
}))

// 获取主题统计
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params

  const [paperStats, nodeStats] = await Promise.all([
    prisma.paper.groupBy({
      by: ['status'],
      where: { topicId: id },
      _count: true
    }),
    prisma.researchNode.groupBy({
      by: ['status'],
      where: { topicId: id },
      _count: true
    })
  ])

  res.json({
    success: true,
    data: {
      papers: paperStats,
      nodes: nodeStats
    }
  })
}))

export default router
