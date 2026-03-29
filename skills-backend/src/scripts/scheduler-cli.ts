/**
 * 定时任务 CLI
 * 用于启动和管理定时任务
 *
 * 用法：
 * npm run scheduler:start
 * npm run scheduler:start -- --task=discover-topic-1 --now  // 立即执行
 */

import { taskScheduler, type TaskConfig, type TaskResult } from '../services/scheduler'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function loadTasksFromDB() {
  try {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { startsWith: 'task:' } },
    })

    for (const config of configs) {
      const taskConfig: TaskConfig = JSON.parse(config.value)
      taskScheduler.addTask(taskConfig)
    }

    console.log(`[CLI] Loaded ${configs.length} tasks from database`)
  } catch (e) {
    console.error('[CLI] Failed to load tasks:', e)
  }
}

async function runTaskNow(taskId: string): Promise<void> {
  console.log(`[CLI] Running task immediately: ${taskId}`)
  const result = await taskScheduler.triggerTask(taskId)

  if (result) {
    console.log(`[CLI] Task completed:`, {
      success: result.success,
      duration: result.duration,
      error: result.error,
    })
  } else {
    console.error(`[CLI] Task not found: ${taskId}`)
  }
}

async function listTasks(): Promise<void> {
  const tasks = taskScheduler.getTasks()
  console.log(`[CLI] Registered tasks:`)
  for (const task of tasks) {
    console.log(`  - ${task.id}: ${task.name} (${task.cronExpression}) [${task.enabled ? 'enabled' : 'disabled'}]`)
  }
}

async function addTask(config: TaskConfig): Promise<void> {
  const success = taskScheduler.addTask(config)
  if (success) {
    await prisma.systemConfig.upsert({
      where: { key: `task:${config.id}` },
      update: { value: JSON.stringify(config) },
      create: { key: `task:${config.id}`, value: JSON.stringify(config) },
    })
    console.log(`[CLI] Task added and saved: ${config.id}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const commands = args.reduce((acc, arg, i) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      acc[key] = value || true
    }
    return acc
  }, {} as Record<string, string | boolean>)

  if (commands.help || commands.h) {
    console.log(`
定时任务调度器 CLI

用法：
  npm run scheduler:start [选项]

选项：
  --task=<id>     任务 ID
  --now           立即执行指定任务
  --list          列出所有任务
  --add           添加任务（需要其他参数）
  --name=<name>   任务名称
  --cron=<expr>   Cron 表达式
  --action=<act>  操作类型 (discover|refresh|sync)
  --topic=<id>    主题 ID
  --enabled       启用任务

示例：
  # 列出所有任务
  npm run scheduler:start -- --list

  # 立即执行任务
  npm run scheduler:start -- --task=discover-topic-1 --now

  # 添加定时任务（每天早上8点执行）
  npm run scheduler:start -- --add --name="每日发现" --cron="0 8 * * *" --action=discover --topic=topic-1 --enabled
    `)
    process.exit(0)
  }

  if (commands.list) {
    await listTasks()
    process.exit(0)
  }

  if (commands.now && commands.task) {
    await loadTasksFromDB()
    await runTaskNow(commands.task as string)
    process.exit(0)
  }

  if (commands.add && commands.name && commands.cron && commands.action) {
    await loadTasksFromDB()

    const newTask: TaskConfig = {
      id: `task-${Date.now()}`,
      name: commands.name as string,
      cronExpression: commands.cron as string,
      enabled: !!commands.enabled,
      action: commands.action as 'discover' | 'refresh' | 'sync',
      topicId: commands.topic as string | undefined,
    }

    await addTask(newTask)
    process.exit(0)
  }

  console.log('[CLI] Starting scheduler...')
  await loadTasksFromDB()
  taskScheduler.startAll()

  console.log('[CLI] Scheduler started. Press Ctrl+C to stop.')

  process.on('SIGINT', () => {
    console.log('[CLI] Stopping scheduler...')
    taskScheduler.stopAll()
    prisma.$disconnect()
    process.exit(0)
  })
}

main().catch(console.error)
