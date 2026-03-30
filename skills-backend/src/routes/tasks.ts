/**
 * 增强的定时任务 API 路由
 * 支持多轮渐进式追踪单个 stage
 */

import { Router } from 'express'
import { enhancedTaskScheduler, type StageTaskProgress, type TaskExecutionRecord } from '../services/enhanced-scheduler'
import { taskScheduler, type TaskConfig } from '../services/scheduler'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient()

const taskConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  cronExpression: z.string(),
  enabled: z.boolean(),
  topicId: z.string().optional(),
  action: z.enum(['discover', 'refresh', 'sync']),
  options: z.object({
    maxResults: z.number().optional(),
    stageIndex: z.number().optional(),
    maxIterations: z.number().optional(),
  }).optional(),
})

/**
 * 获取所有任务列表
 */
router.get('/tasks', async (req, res) => {
  try {
    const dbTasks = await prisma.systemConfig.findMany({
      where: { key: { startsWith: 'task:' } },
    })

    const tasks = dbTasks.map(config => {
      try {
        return JSON.parse(config.value) as TaskConfig
      } catch {
        return null
      }
    }).filter(Boolean)

    const progress = enhancedTaskScheduler.getAllProgress()

    const tasksWithProgress = tasks.map(task => ({
      ...task,
      progress: progress.find(p => p.taskId === task.id) || null,
    }))

    res.json({
      success: true,
      data: tasksWithProgress,
    })
  } catch (error) {
    console.error('[Task API] List error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to list tasks',
    })
  }
})

/**
 * 获取单个任务详情
 */
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params

    const config = await prisma.systemConfig.findUnique({
      where: { key: `task:${taskId}` },
    })

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      })
    }

    const task = JSON.parse(config.value) as TaskConfig
    const progress = enhancedTaskScheduler.getProgress(taskId)
    const history = enhancedTaskScheduler.getExecutionHistory(taskId, 50)

    res.json({
      success: true,
      data: {
        task,
        progress,
        history,
      },
    })
  } catch (error) {
    console.error('[Task API] Get error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get task',
    })
  }
})

/**
 * 创建新任务
 */
router.post('/tasks', async (req, res) => {
  try {
    const body = taskConfigSchema.parse(req.body)

    const success = enhancedTaskScheduler.addTask(body)

    if (success) {
      await prisma.systemConfig.upsert({
        where: { key: `task:${body.id}` },
        update: { value: JSON.stringify(body) },
        create: { key: `task:${body.id}`, value: JSON.stringify(body) },
      })
    }

    const progress = enhancedTaskScheduler.getProgress(body.id)

    res.json({
      success,
      data: { ...body, progress },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      })
    }

    console.error('[Task API] Create error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
    })
  }
})

/**
 * 更新任务
 */
router.put('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    const body = taskConfigSchema.parse({ ...req.body, id: taskId })

    enhancedTaskScheduler.removeTask(taskId)
    const success = enhancedTaskScheduler.addTask(body)

    if (success) {
      await prisma.systemConfig.upsert({
        where: { key: `task:${taskId}` },
        update: { value: JSON.stringify(body) },
        create: { key: `task:${taskId}`, value: JSON.stringify(body) },
      })
    }

    const progress = enhancedTaskScheduler.getProgress(taskId)

    res.json({
      success,
      data: { ...body, progress },
    })
  } catch (error) {
    console.error('[Task API] Update error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update task',
    })
  }
})

/**
 * 删除任务
 */
router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params

    const success = enhancedTaskScheduler.removeTask(taskId)

    await prisma.systemConfig.deleteMany({
      where: { 
        key: { 
          in: [`task:${taskId}`, `task-progress:${taskId}`, `task-history:${taskId}`] 
        } 
      },
    })

    res.json({ success })
  } catch (error) {
    console.error('[Task API] Delete error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete task',
    })
  }
})

/**
 * 切换任务启用状态
 */
router.post('/tasks/:taskId/toggle', async (req, res) => {
  try {
    const { taskId } = req.params
    const { enabled } = req.body

    const success = enhancedTaskScheduler.setTaskEnabled(taskId, enabled)

    if (success) {
      const tasks = taskScheduler.getTasks()
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        await prisma.systemConfig.upsert({
          where: { key: `task:${taskId}` },
          update: { value: JSON.stringify(task) },
          create: { key: `task:${taskId}`, value: JSON.stringify(task) },
        })
      }
    }

    res.json({ success })
  } catch (error) {
    console.error('[Task API] Toggle error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to toggle task',
    })
  }
})

/**
 * 立即执行任务（支持指定 stage）
 */
router.post('/tasks/:taskId/run', async (req, res) => {
  try {
    const { taskId } = req.params
    const { forceStage, mode } = req.body

    const result = await enhancedTaskScheduler.triggerTask(taskId, { forceStage, mode })

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      })
    }

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[Task API] Run error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to run task',
    })
  }
})

/**
 * 重置任务进度
 */
router.post('/tasks/:taskId/reset', async (req, res) => {
  try {
    const { taskId } = req.params

    const success = await enhancedTaskScheduler.resetProgress(taskId)

    res.json({ success })
  } catch (error) {
    console.error('[Task API] Reset error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to reset task',
    })
  }
})

/**
 * 跳转到指定 stage
 */
router.post('/tasks/:taskId/jump', async (req, res) => {
  try {
    const { taskId } = req.params
    const { stageIndex } = req.body

    if (typeof stageIndex !== 'number' || stageIndex < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stage index',
      })
    }

    const success = await enhancedTaskScheduler.jumpToStage(taskId, stageIndex)

    res.json({ success })
  } catch (error) {
    console.error('[Task API] Jump error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to jump to stage',
    })
  }
})

/**
 * 获取执行历史
 */
router.get('/tasks/:taskId/history', async (req, res) => {
  try {
    const { taskId } = req.params
    const limit = parseInt(req.query.limit as string) || 50

    const history = enhancedTaskScheduler.getExecutionHistory(taskId, limit)

    res.json({
      success: true,
      data: history,
    })
  } catch (error) {
    console.error('[Task API] History error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get history',
    })
  }
})

/**
 * 获取所有主题（用于任务关联）
 */
router.get('/topics', async (req, res) => {
  try {
    const topics = await prisma.topic.findMany({
      select: {
        id: true,
        nameZh: true,
        nameEn: true,
        language: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      success: true,
      data: topics,
    })
  } catch (error) {
    console.error('[Task API] Topics error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get topics',
    })
  }
})

/**
 * 获取所有阶段（用于指定 stage）
 */
router.get('/topics/:topicId/stages', async (req, res) => {
  try {
    const { topicId } = req.params

    const stages = await prisma.topicStage.findMany({
      where: { topicId },
      orderBy: { order: 'asc' },
    })

    res.json({
      success: true,
      data: stages,
    })
  } catch (error) {
    console.error('[Task API] Stages error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get stages',
    })
  }
})

/**
 * 获取 cron 预设表达式
 */
router.get('/cron-expressions', (req, res) => {
  const presets = [
    { label: '每小时', value: '0 * * * *', description: '每小时的整点执行' },
    { label: '每6小时', value: '0 */6 * * *', description: '每6小时执行一次' },
    { label: '每天早上8点', value: '0 8 * * *', description: '每天上午8:00执行' },
    { label: '每天中午12点', value: '0 12 * * *', description: '每天中午12:00执行' },
    { label: '每天晚上8点', value: '0 20 * * *', description: '每天晚上20:00执行' },
    { label: '每周一早上8点', value: '0 8 * * 1', description: '每周一上午8:00执行' },
    { label: '每月1号早上8点', value: '0 8 1 * *', description: '每月1号上午8:00执行' },
    { label: '每3天一次', value: '0 8 */3 * *', description: '每3天执行一次' },
  ]

  res.json({
    success: true,
    data: presets,
  })
})

/**
 * 获取任务统计
 */
router.get('/stats', async (req, res) => {
  try {
    const tasks = enhancedTaskScheduler.getAllProgress()

    const stats = {
      totalTasks: tasks.length,
      activeTasks: tasks.filter(t => t.status === 'active').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      totalRuns: tasks.reduce((sum, t) => sum + t.totalRuns, 0),
      totalDiscovered: tasks.reduce((sum, t) => sum + t.discoveredPapers, 0),
      totalPromoted: tasks.reduce((sum, t) => sum + (t as any).promotedPapers || 0, 0),
      successRate: tasks.length > 0
        ? (tasks.reduce((sum, t) => sum + t.successfulRuns, 0) / Math.max(1, tasks.reduce((sum, t) => sum + t.totalRuns, 0)) * 100)
        : 0,
    }

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('[Task API] Stats error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    })
  }
})

export default router
