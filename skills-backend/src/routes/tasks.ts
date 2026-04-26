import { Router } from 'express'

import { prisma } from '../lib/prisma'
import { logger } from '../utils/logger'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { TaskConfigBodySchema, TaskToggleSchema, TaskRunSchema, TaskJumpSchema } from './schemas'
import { enhancedTaskScheduler } from '../services/enhanced-scheduler'
import { type TaskConfig } from '../services/scheduler'
import { getStageLocalization, getTopicLocalization, getTopicLocalizationMap } from '../services/topics/localization'

const router = Router()

router.get('/topics', async (_req, res) => {
  try {
    const topics = await prisma.topics.findMany({
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
    logger.error('[Task API] Topics error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to get topics' })
  }
})

router.get('/topics/:topicId/stages', async (req, res) => {
  try {
    const { topicId } = req.params
    const localization = await getTopicLocalization(topicId)
    const stages = await prisma.topic_stages.findMany({
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
    logger.error('[Task API] Stages error', { error: error instanceof Error ? error.message : String(error) })
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
    logger.error('[Task API] Stats error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to get stats' })
  }
})

router.get('/', async (_req, res) => {
  try {
    const dbTasks = await prisma.system_configs.findMany({
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
    logger.error('[Task API] List error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to list tasks' })
  }
})

router.post('/', validate(TaskConfigBodySchema), asyncHandler(async (req, res) => {
  const body = req.body as TaskConfig
  const success = enhancedTaskScheduler.addTask(body)

  if (success) {
    await prisma.system_configs.upsert({
      where: { key: `task:${body.id}` },
      update: { value: JSON.stringify(body), updatedAt: new Date() },
      create: { id: crypto.randomUUID(), key: `task:${body.id}`, value: JSON.stringify(body), updatedAt: new Date() },
    })
  }

  res.json({
    success,
    data: {
      ...body,
      progress: enhancedTaskScheduler.getProgress(body.id),
    },
  })
}))

router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    const config = await prisma.system_configs.findUnique({
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
    logger.error('[Task API] Get error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to get task' })
  }
})

router.put('/:taskId', asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const parsed = TaskConfigBodySchema.safeParse({ body: { ...req.body, id: taskId } })
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Validation error')
  }
  const body = parsed.data.body as TaskConfig

  enhancedTaskScheduler.removeTask(taskId)
  const success = enhancedTaskScheduler.addTask(body)

  if (success) {
    await prisma.system_configs.upsert({
      where: { key: `task:${taskId}` },
      update: { value: JSON.stringify(body), updatedAt: new Date() },
      create: { id: crypto.randomUUID(), key: `task:${taskId}`, value: JSON.stringify(body), updatedAt: new Date() },
    })
  }

  res.json({
    success,
    data: {
      ...body,
      progress: enhancedTaskScheduler.getProgress(taskId),
    },
  })
}))

router.delete('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    const success = enhancedTaskScheduler.removeTask(taskId)

    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [`task:${taskId}`, `task-progress:${taskId}`, `task-history:${taskId}`],
        },
      },
    })

    res.json({ success })
  } catch (error) {
    logger.error('[Task API] Delete error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to delete task' })
  }
})

router.post('/:taskId/toggle', validate(TaskToggleSchema), asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const { enabled } = req.body

  const success = enhancedTaskScheduler.setTaskEnabled(taskId, enabled)

  if (success) {
    const task = enhancedTaskScheduler.getTaskConfig(taskId)
    if (task) {
      await prisma.system_configs.upsert({
        where: { key: `task:${taskId}` },
        update: { value: JSON.stringify(task), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key: `task:${taskId}`, value: JSON.stringify(task), updatedAt: new Date() },
      })
    }
  }

  res.json({ success })
}))

router.post('/:taskId/run', validate(TaskRunSchema), asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const { forceStage, mode } = req.body
  const result = await enhancedTaskScheduler.triggerTask(taskId, {
    forceStage,
    mode: mode === 'duration' ? undefined : mode,
  })

  if (!result) {
    throw new AppError(404, 'Task not found')
  }

  res.json({ success: true, data: result })
}))

router.post('/:taskId/reset', asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const success = await enhancedTaskScheduler.resetProgress(taskId)
  res.json({ success })
}))

router.post('/:taskId/jump', validate(TaskJumpSchema), asyncHandler(async (req, res) => {
  const { taskId } = req.params
  const { stageIndex } = req.body
  const success = await enhancedTaskScheduler.jumpToStage(taskId, stageIndex)
  res.json({ success })
}))

router.get('/:taskId/history', async (req, res) => {
  try {
    const { taskId } = req.params
    const limit = Number.parseInt(req.query.limit as string, 10) || 50

    res.json({
      success: true,
      data: enhancedTaskScheduler.getExecutionHistory(taskId, limit),
    })
  } catch (error) {
    logger.error('[Task API] History error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ success: false, error: 'Failed to get history' })
  }
})

export default router
