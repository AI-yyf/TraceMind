/**
 * 定时任务管理 API 路由
 */

import { Router } from 'express'
import { taskScheduler, type TaskConfig, type TaskResult } from '../services/scheduler'
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
  }).optional(),
})

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

    res.json({
      success: true,
      data: tasks,
    })
  } catch (error) {
    console.error('[Task API] List error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to list tasks',
    })
  }
})

router.post('/tasks', async (req, res) => {
  try {
    const body = taskConfigSchema.parse(req.body)

    const success = taskScheduler.addTask(body)

    if (success) {
      await prisma.systemConfig.upsert({
        where: { key: `task:${body.id}` },
        update: { value: JSON.stringify(body) },
        create: { key: `task:${body.id}`, value: JSON.stringify(body) },
      })
    }

    res.json({
      success,
      data: body,
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

router.put('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    const body = taskConfigSchema.parse({ ...req.body, id: taskId })

    taskScheduler.removeTask(taskId)
    const success = taskScheduler.addTask(body)

    if (success) {
      await prisma.systemConfig.upsert({
        where: { key: `task:${taskId}` },
        update: { value: JSON.stringify(body) },
        create: { key: `task:${taskId}`, value: JSON.stringify(body) },
      })
    }

    res.json({
      success,
      data: body,
    })
  } catch (error) {
    console.error('[Task API] Update error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update task',
    })
  }
})

router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params

    const success = taskScheduler.removeTask(taskId)

    await prisma.systemConfig.deleteMany({
      where: { key: `task:${taskId}` },
    })

    res.json({
      success,
    })
  } catch (error) {
    console.error('[Task API] Delete error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete task',
    })
  }
})

router.post('/tasks/:taskId/toggle', async (req, res) => {
  try {
    const { taskId } = req.params
    const { enabled } = req.body

    const success = taskScheduler.setTaskEnabled(taskId, enabled)

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

router.post('/tasks/:taskId/run', async (req, res) => {
  try {
    const { taskId } = req.params

    const result = await taskScheduler.triggerTask(taskId)

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

router.get('/cron-expressions', (req, res) => {
  const presets = [
    { label: '每小时', value: '0 * * * *' },
    { label: '每6小时', value: '0 */6 * * *' },
    { label: '每天早上8点', value: '0 8 * * *' },
    { label: '每天中午12点', value: '0 12 * * *' },
    { label: '每天晚上8点', value: '0 20 * * *' },
    { label: '每周一早上8点', value: '0 8 * * 1' },
    { label: '每月1号早上8点', value: '0 8 1 * *' },
  ]

  res.json({
    success: true,
    data: presets,
  })
})

export default router
