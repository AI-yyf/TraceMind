/**
 * Zotero API Routes
 * Handles Zotero configuration and paper export to Zotero library
 */

import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import {
  testZoteroConnection,
  getZoteroCollections,
  exportPrismaPapersToZotero,
} from '../services/zotero-export'
import { logger } from '../utils/logger'

const router = Router()

// ============================================================================
// Configuration Endpoints
// ============================================================================

/**
 * Get Zotero configuration
 */
router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const config = await prisma.zotero_config.findUnique({
      where: { id: 'default' },
    })

    if (!config) {
      res.json({
        configured: false,
        config: null,
      })
      return
    }

    // Don't expose full API key in response
    res.json({
      configured: config.enabled,
      config: {
        userId: config.userId,
        username: config.username,
        enabled: config.enabled,
        // Only show if key is set (masked)
        hasApiKey: Boolean(config.apiKey),
      },
    })
  })
)

/**
 * Save Zotero configuration
 */
router.post(
  '/config',
  asyncHandler(async (req, res) => {
    const { userId, apiKey, username, enabled = true } = req.body

    if (!userId || !apiKey) {
      throw new AppError(400, 'userId and apiKey are required')
    }

    // Validate userId is numeric
    if (!/^\d+$/.test(userId)) {
      throw new AppError(400, 'userId must be a numeric string')
    }

    // Test connection before saving
    const testResult = await testZoteroConnection({ userId, apiKey })
    if (!testResult.success) {
      throw new AppError(400, `Zotero connection test failed: ${testResult.error}`)
    }

    // Upsert configuration
    const zoteroConfig = await prisma.zotero_config.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        updatedAt: new Date(),
        userId,
        apiKey,
        username: username || testResult.username || null,
        enabled,
      },
      update: {
        updatedAt: new Date(),
        userId,
        apiKey,
        username: username || testResult.username || null,
        enabled,
      },
    })

    logger.info('Zotero configuration saved', { userId, username: zoteroConfig.username })

    res.json({
      success: true,
      config: {
        userId: zoteroConfig.userId,
        username: zoteroConfig.username,
        enabled: zoteroConfig.enabled,
        hasApiKey: true,
      },
    })
  })
)

/**
 * Test Zotero connection
 */
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const { userId, apiKey } = req.body

    if (!userId || !apiKey) {
      throw new AppError(400, 'userId and apiKey are required')
    }

    const result = await testZoteroConnection({ userId, apiKey })

    res.json(result)
  })
)

/**
 * Delete Zotero configuration
 */
router.delete(
  '/config',
  asyncHandler(async (_req, res) => {
    await prisma.zotero_config.delete({
      where: { id: 'default' },
    }).catch(() => {
      // Ignore if not found
    })

    res.json({ success: true })
  })
)

// ============================================================================
// Collection Endpoints
// ============================================================================

/**
 * Get all Zotero collections
 */
router.get(
  '/collections',
  asyncHandler(async (_req, res) => {
    const config = await prisma.zotero_config.findUnique({
      where: { id: 'default' },
    })

    if (!config || !config.enabled) {
      throw new AppError(400, 'Zotero is not configured')
    }

    const collections = await getZoteroCollections({
      userId: config.userId,
      apiKey: config.apiKey,
    })

    res.json({
      success: true,
      collections: collections.map(c => ({
        key: c.key,
        name: c.data.name,
        parent: c.data.parentCollection || null,
      })),
    })
  })
)

// ============================================================================
// Export Endpoints
// ============================================================================

/**
 * Export papers from a topic to Zotero
 */
router.post(
  '/export/topic/:topicId',
  asyncHandler(async (req, res) => {
    const { topicId } = req.params
    const { collectionName, collectionKey, paperIds } = req.body

    // Get Zotero config
    const zoteroConfig = await prisma.zotero_config.findUnique({
      where: { id: 'default' },
    })

    if (!zoteroConfig || !zoteroConfig.enabled) {
      throw new AppError(400, 'Zotero is not configured')
    }

    // Get topic info
    const topic = await prisma.topics.findUnique({
      where: { id: topicId },
    })

    if (!topic) {
      throw new AppError(404, 'Topic not found')
    }

    // Get papers to export
    let papers
    if (paperIds && Array.isArray(paperIds) && paperIds.length > 0) {
      // Export specific papers
      papers = await prisma.papers.findMany({
        where: {
          id: { in: paperIds },
          topicId,
        },
      })
    } else {
      // Export all papers from topic
      papers = await prisma.papers.findMany({
        where: { topicId },
      })
    }

    if (papers.length === 0) {
      res.json({
        success: false,
        exportedCount: 0,
        errors: ['No papers to export'],
      })
      return
    }

    // Default collection name to topic name
    const finalCollectionName = collectionName || topic.nameZh || topic.nameEn || `Topic-${topicId.slice(0, 8)}`

    // Export to Zotero
    const result = await exportPrismaPapersToZotero(
      { userId: zoteroConfig.userId, apiKey: zoteroConfig.apiKey },
      papers,
      { collectionName: finalCollectionName, collectionKey }
    )

    // Update topic with export info
    if (result.success && result.collectionKey) {
      await prisma.topics.update({
        where: { id: topicId },
        data: {
          zoteroCollectionKey: result.collectionKey,
          exportedToZoteroAt: new Date(),
        },
      })
    }

    logger.info('Exported papers to Zotero', {
      topicId,
      paperCount: papers.length,
      exportedCount: result.exportedCount,
      collectionKey: result.collectionKey,
    })

    res.json(result)
  })
)

/**
 * Export papers from a node to Zotero
 */
router.post(
  '/export/node/:nodeId',
  asyncHandler(async (req, res) => {
    const { nodeId } = req.params
    const { collectionName, collectionKey } = req.body

    // Get Zotero config
    const zoteroConfig = await prisma.zotero_config.findUnique({
      where: { id: 'default' },
    })

    if (!zoteroConfig || !zoteroConfig.enabled) {
      throw new AppError(400, 'Zotero is not configured')
    }

    // Get node with its papers
    const node = await prisma.research_nodes.findUnique({
      where: { id: nodeId },
      include: {
        node_papers: {
          include: {
            papers: true,
          },
        },
        topics: true,
      },
    })

    if (!node) {
      throw new AppError(404, 'Node not found')
    }

    // Extract papers
    const papersData = node.node_papers.map((np) => np.papers)

    if (papersData.length === 0) {
      res.json({
        success: false,
        exportedCount: 0,
        errors: ['No papers in this node'],
      })
      return
    }

    // Default collection name to node label
    const finalCollectionName = collectionName || node.nodeLabel || `Node-${nodeId.slice(0, 8)}`

    // Export to Zotero
    const result = await exportPrismaPapersToZotero(
      { userId: zoteroConfig.userId, apiKey: zoteroConfig.apiKey },
      papersData,
      { collectionName: finalCollectionName, collectionKey }
    )

    logger.info('Exported node papers to Zotero', {
      nodeId,
      paperCount: papersData.length,
      exportedCount: result.exportedCount,
      collectionKey: result.collectionKey,
    })

    res.json(result)
  })
)

/**
 * Export specific papers to Zotero
 */
router.post(
  '/export/papers',
  asyncHandler(async (req, res) => {
    const { paperIds, collectionName, collectionKey } = req.body

    if (!paperIds || !Array.isArray(paperIds) || paperIds.length === 0) {
      throw new AppError(400, 'paperIds array is required')
    }

    // Get Zotero config
    const zoteroConfig = await prisma.zotero_config.findUnique({
      where: { id: 'default' },
    })

    if (!zoteroConfig || !zoteroConfig.enabled) {
      throw new AppError(400, 'Zotero is not configured')
    }

    // Get papers
    const papers = await prisma.papers.findMany({
      where: { id: { in: paperIds } },
    })

    if (papers.length === 0) {
      res.json({
        success: false,
        exportedCount: 0,
        errors: ['No papers found'],
      })
      return
    }

    // Export to Zotero
    const result = await exportPrismaPapersToZotero(
      { userId: zoteroConfig.userId, apiKey: zoteroConfig.apiKey },
      papers,
      { collectionName, collectionKey }
    )

    logger.info('Exported papers to Zotero', {
      paperIds,
      paperCount: papers.length,
      exportedCount: result.exportedCount,
    })

    res.json(result)
  })
)

/**
 * Get export status for a topic
 */
router.get(
  '/export/status/:topicId',
  asyncHandler(async (req, res) => {
    const { topicId } = req.params

    const topic = await prisma.topics.findUnique({
      where: { id: topicId },
      select: {
        zoteroCollectionKey: true,
        exportedToZoteroAt: true,
        nameZh: true,
        nameEn: true,
      },
    })

    if (!topic) {
      throw new AppError(404, 'Topic not found')
    }

    res.json({
      exported: Boolean(topic.zoteroCollectionKey),
      collectionKey: topic.zoteroCollectionKey,
      exportedAt: topic.exportedToZoteroAt,
      topicName: topic.nameZh || topic.nameEn,
    })
  })
)

export default router
