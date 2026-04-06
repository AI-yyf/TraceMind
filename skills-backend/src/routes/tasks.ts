import { PrismaClient } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'

import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import { type TaskConfig } from '../services/scheduler'
import { getStageLocalization, getTopicLocalization, getTopicLocalizationMap } from '../services/topics/localization'

const router = Router()
const prisma = new PrismaClient()

const taskConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  cronExpression: z.string(),
  enabled: z.boolean(),
  topicId: z.string().optional(),
  action: z.enum(['discover', 'refresh', 'sync']),
  researchMode: z.enum(['stage-rounds', 'duration']).optional(),
  options: z
    .object({
      maxResults: z.number().optional(),
      stageIndex: z.number().optional(),
      maxIterations: z.number().int().min(1).optional(),
      durationHours: z.number().min(1).max(48).optional(),
      cycleDelayMs: z.number().int().min(250).max(15000).optional(),
      stageRounds: z
        .array(
          z.object({
            stageIndex: z.number().int().min(1),
            rounds: z.number().int().min(1).max(12),
          }),
        )
        .optional(),
    })
    .optional(),
})

router.get('/topics', async (_req, res) => {
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

    const localizationMap = await getTopicLocalizationMap(topics.map((topic) => topic.id))

    res.json({
      success: true,
      data: topics.map((topic) => ({
        ...topic,
        localization: localizationMap.get(topic.id) ?? null,
      })),
    })
  } catch (error) {
    console.error('[Task API] Topics error:', error)
    res.status(500).json({ success: false, error: 'Failed to get topics' })
  }
})

router.get('/topics/:topicId/stages', async (req, res) => {
  try {
    const { topicId } = req.params
    const localization = await getTopicLocalization(topicId)
    const stages = await prisma.topicStage.findMany({
      where: { topicId },
      orderBy: { order: 'asc' },
    })

    res.json({
      success: true,
      data: stages.map((stage) => ({
        ...stage,
        localization: getStageLocalization(localization, stage.order),
      })),
    })
  } catch (error) {
    console.error('[Task API] Stages error:', error)
    res.status(500).json({ success: false, error: 'Failed to get stages' })
  }
})

router.get('/cron-expressions', (_req, res) => {
  res.json({
    success: true,
    data: [
      { label: '每小时整点', value: '0 * * * *', description: '每小时自动推进一次' },
      { label: '每 6 小时', value: '0 */6 * * *', description: '更适合持续追踪中的主题' },
      { label: '每天 08:00', value: '0 8 * * *', description: '适合晨间批量巡检' },
      { label: '每天 12:00', value: '0 12 * * *', description: '适合午间补跑' },
      { label: '每天 20:00', value: '0 20 * * *', description: '适合晚间完整生成' },
      { label: '每周一 08:00', value: '0 8 * * 1', description: '适合周度重建主线' },
      { label: '每周三 21:00', value: '0 21 * * 3', description: '适合中周补充新论文' },
      { label: '每周五 21:00', value: '0 21 * * 5', description: '适合周末前收束总结' },
    ],
  })
})

router.get('/stats', async (_req, res) => {
  try {
    const tasks = enhancedTaskScheduler.getAllProgress()
    const totalRuns = tasks.reduce((sum, task) => sum + task.totalRuns, 0)

    res.json({
      success: true,
      data: {
        totalTasks: tasks.length,
        activeTasks: tasks.filter((task) => task.status === 'active').length,
        completedTasks: tasks.filter((task) => task.status === 'completed').length,
        totalRuns,
        totalDiscovered: tasks.reduce((sum, task) => sum + task.discoveredPapers, 0),
        totalPromoted: tasks.reduce((sum, task) => sum + task.admittedPapers, 0),
        successRate:
          totalRuns > 0
            ? (tasks.reduce((sum, task) => sum + task.successfulRuns, 0) / totalRuns) * 100
            : 0,
      },
    })
  } catch (error) {
    console.error('[Task API] Stats error:', error)
    res.status(500).json({ success: false, error: 'Failed to get stats' })
  }
})

router.get('/', async (_req, res) => {
  try {
    const dbTasks = await prisma.systemConfig.findMany({
      where: { key: { startsWith: 'task:' } },
    })

    const tasks = dbTasks
      .map((config) => {
        try {
          return JSON.parse(config.value) as TaskConfig
        } catch {
          return null
        }
      })
      .filter((task): task is TaskConfig => task !== null)

    const progress = enhancedTaskScheduler.getAllProgress()
    const tasksWithProgress = tasks.map((task) => ({
      ...task,
      progress: progress.find((item) => item.taskId === task.id) || null,
    }))

    res.json({ success: true, data: tasksWithProgress })
  } catch (error) {
    console.error('[Task API] List error:', error)
    res.status(500).json({ success: false, error: 'Failed to list tasks' })
  }
})

router.post('/', async (req, res) => {
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

    res.json({
      success,
      data: {
        ...body,
        progress: enhancedTaskScheduler.getProgress(body.id),
      },
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
    res.status(500).json({ success: false, error: 'Failed to create task' })
  }
})

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    const config = await prisma.systemConfig.findUnique({
      where: { key: `task:${taskId}` },
    })

    if (!config) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    const task = JSON.parse(config.value) as TaskConfig
    res.json({
      success: true,
      data: {
        task,
        progress: enhancedTaskScheduler.getProgress(taskId),
        history: enhancedTaskScheduler.getExecutionHistory(taskId, 50),
      },
    })
  } catch (error) {
    console.error('[Task API] Get error:', error)
    res.status(500).json({ success: false, error: 'Failed to get task' })
  }
})

router.put('/:taskId', async (req, res) => {
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

    res.json({
      success,
      data: {
        ...body,
        progress: enhancedTaskScheduler.getProgress(taskId),
      },
    })
  } catch (error) {
    console.error('[Task API] Update error:', error)
    res.status(500).json({ success: false, error: 'Failed to update task' })
  }
})

router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    const success = enhancedTaskScheduler.removeTask(taskId)

    await prisma.systemConfig.deleteMany({
      where: {
        key: {
          in: [`task:${taskId}`, `task-progress:${taskId}`, `task-history:${taskId}`],
        },
      },
    })

    res.json({ success })
  } catch (error) {
    console.error('[Task API] Delete error:', error)
    res.status(500).json({ success: false, error: 'Failed to delete task' })
  }
})

router.post('/:taskId/toggle', async (req, res) => {
  try {
    const { taskId } = req.params
    const { enabled } = req.body as { enabled?: boolean }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' })
    }

    const success = enhancedTaskScheduler.setTaskEnabled(taskId, enabled)

    if (success) {
      const task = enhancedTaskScheduler.getTaskConfig(taskId)
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
    res.status(500).json({ success: false, error: 'Failed to toggle task' })
  }
})

router.post('/:taskId/run', async (req, res) => {
  try {
    const { taskId } = req.params
    const { forceStage, mode } = req.body as { forceStage?: number; mode?: 'full' | 'discover-only' }
    const result = await enhancedTaskScheduler.triggerTask(taskId, { forceStage, mode })

    if (!result) {
      return res.status(404).json({ success: false, error: 'Task not found' })
    }

    res.json({ success: true, data: result })
  } catch (error) {
    console.error('[Task API] Run error:', error)
    res.status(500).json({ success: false, error: 'Failed to run task' })
  }
})

router.post('/:taskId/reset', async (req, res) => {
  try {
    const { taskId } = req.params
    const success = await enhancedTaskScheduler.resetProgress(taskId)
    res.json({ success })
  } catch (error) {
    console.error('[Task API] Reset error:', error)
    res.status(500).json({ success: false, error: 'Failed to reset task' })
  }
})

router.post('/:taskId/jump', async (req, res) => {
  try {
    const { taskId } = req.params
    const { stageIndex } = req.body as { stageIndex?: number }

    if (typeof stageIndex !== 'number' || stageIndex < 1) {
      return res.status(400).json({ success: false, error: 'Invalid stage index' })
    }

    const success = await enhancedTaskScheduler.jumpToStage(taskId, stageIndex)
    res.json({ success })
  } catch (error) {
    console.error('[Task API] Jump error:', error)
    res.status(500).json({ success: false, error: 'Failed to jump to stage' })
  }
})

router.get('/:taskId/history', async (req, res) => {
  try {
    const { taskId } = req.params
    const limit = Number.parseInt(req.query.limit as string, 10) || 50

    res.json({
      success: true,
      data: enhancedTaskScheduler.getExecutionHistory(taskId, limit),
    })
  } catch (error) {
    console.error('[Task API] History error:', error)
    res.status(500).json({ success: false, error: 'Failed to get history' })
  }
})

export default router
