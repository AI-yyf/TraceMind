import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../middleware/errorHandler'
import { logger } from '../utils/logger'

const router = Router()

// 同步所有数据
router.post('/', asyncHandler(async (req, res) => {
  const { topics, papers, nodes, lastSyncTime } = req.body

  logger.info('开始数据同步', { 
    topicCount: topics?.length,
    paperCount: papers?.length,
    nodeCount: nodes?.length
  })

  const results = {
    topics: { created: 0, updated: 0 },
    papers: { created: 0, updated: 0 },
    nodes: { created: 0, updated: 0 }
  }

  // 同步主题
  if (topics && topics.length > 0) {
    for (const topic of topics) {
      const existing = await prisma.topic.findUnique({
        where: { id: topic.id }
      })

      if (existing) {
        await prisma.topic.update({
          where: { id: topic.id },
          data: {
            nameZh: topic.nameZh,
            nameEn: topic.nameEn,
            focusLabel: topic.focusLabel,
            summary: topic.summary,
            description: topic.description,
            status: topic.status
          }
        })
        results.topics.updated++
      } else {
        await prisma.topic.create({
          data: {
            id: topic.id,
            nameZh: topic.nameZh,
            nameEn: topic.nameEn,
            focusLabel: topic.focusLabel,
            summary: topic.summary,
            description: topic.description,
            status: topic.status || 'active'
          }
        })
        results.topics.created++
      }
    }
  }

  // 同步论文
  if (papers && papers.length > 0) {
    for (const paper of papers) {
      const existing = await prisma.paper.findUnique({
        where: { id: paper.id }
      })

      const paperData = {
        topicId: paper.topicId,
        title: paper.title,
        titleZh: paper.titleZh,
        titleEn: paper.titleEn,
        authors: JSON.stringify(paper.authors || []),
        published: new Date(paper.published),
        summary: paper.summary,
        explanation: paper.explanation,
        arxivUrl: paper.arxivUrl,
        pdfUrl: paper.pdfUrl,
        pdfPath: paper.pdfPath,
        citationCount: paper.citationCount,
        coverPath: paper.coverPath,
        figurePaths: JSON.stringify(paper.figurePaths || []),
        tablePaths: JSON.stringify(paper.tablePaths || []),
        status: paper.status || 'candidate',
        tags: JSON.stringify(paper.tags || []),
        contentMode: paper.contentMode || 'editorial'
      }

      if (existing) {
        await prisma.paper.update({
          where: { id: paper.id },
          data: paperData
        })
        results.papers.updated++
      } else {
        await prisma.paper.create({
          data: { id: paper.id, ...paperData }
        })
        results.papers.created++
      }
    }
  }

  // 同步节点
  if (nodes && nodes.length > 0) {
    for (const node of nodes) {
      const existing = await prisma.researchNode.findUnique({
        where: { id: node.nodeId }
      })

      const nodeData = {
        topicId: node.topicId,
        stageIndex: node.stageIndex,
        nodeLabel: node.nodeLabel,
        nodeSubtitle: node.nodeSubtitle,
        nodeSummary: node.nodeSummary,
        nodeExplanation: node.nodeExplanation,
        nodeCoverImage: node.nodeCoverImage,
        primaryPaperId: node.primaryPaperId,
        isMergeNode: node.isMergeNode,
        provisional: node.provisional,
        status: node.status || 'provisional',
        fullContent: node.fullContent || {}
      }

      if (existing) {
        await prisma.researchNode.update({
          where: { id: node.nodeId },
          data: nodeData
        })
        results.nodes.updated++
      } else {
        await prisma.researchNode.create({
          data: { id: node.nodeId, ...nodeData }
        })
        results.nodes.created++
      }
    }
  }

  logger.info('数据同步完成', results)

  res.json({
    success: true,
    data: results,
    syncTime: new Date().toISOString()
  })
}))

// 获取同步状态
router.get('/status', asyncHandler(async (req, res) => {
  const [topicCount, paperCount, nodeCount] = await Promise.all([
    prisma.topic.count(),
    prisma.paper.count(),
    prisma.researchNode.count()
  ])

  res.json({
    success: true,
    data: {
      topics: topicCount,
      papers: paperCount,
      nodes: nodeCount,
      lastSync: new Date().toISOString()
    }
  })
}))

export default router
