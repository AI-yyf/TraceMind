/**
 * 定时任务调度器
 * 支持定时执行论文发现流程
 */

import cron, { ScheduledTask } from 'node-cron'
import { discoverExternalCandidates } from '../skill-packs/research/paper-tracker/discovery'

export interface TaskConfig {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
  topicId?: string
  action: 'discover' | 'refresh' | 'sync'
  options?: {
    maxResults?: number
    stageIndex?: number
  }
}

export interface TaskResult {
  taskId: string
  success: boolean
  executedAt: Date
  duration?: number
  error?: string
  result?: unknown
}

type TaskCallback = (result: TaskResult) => void | Promise<void>

class TaskScheduler {
  private tasks: Map<string, { config: TaskConfig; task: ScheduledTask }> = new Map()
  private listeners: TaskCallback[] = []

  constructor() {}

  /**
   * 添加定时任务
   */
  addTask(config: TaskConfig): boolean {
    if (!cron.validate(config.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression: ${config.cronExpression}`)
      return false
    }

    if (this.tasks.has(config.id)) {
      console.warn(`[Scheduler] Task ${config.id} already exists, replacing...`)
      this.removeTask(config.id)
    }

    const task = cron.schedule(config.cronExpression, async () => {
      if (!config.enabled) return
      await this.executeTask(config)
    }, {
      scheduled: config.enabled,
      timezone: 'Asia/Shanghai'
    })

    this.tasks.set(config.id, { config, task })
    console.log(`[Scheduler] Task added: ${config.name} (${config.cronExpression})`)
    return true
  }

  /**
   * 移除定时任务
   */
  removeTask(taskId: string): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    entry.task.stop()
    this.tasks.delete(taskId)
    console.log(`[Scheduler] Task removed: ${taskId}`)
    return true
  }

  /**
   * 启用/禁用任务
   */
  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    entry.config.enabled = enabled
    if (enabled) {
      entry.task.start()
    } else {
      entry.task.stop()
    }
    return true
  }

  /**
   * 执行任务
   */
  private async executeTask(config: TaskConfig): Promise<TaskResult> {
    const startTime = Date.now()
    const result: TaskResult = {
      taskId: config.id,
      success: false,
      executedAt: new Date(),
    }

    console.log(`[Scheduler] Executing task: ${config.name}`)

    try {
      switch (config.action) {
        case 'discover':
          result.result = await this.executeDiscovery(config)
          break
        case 'refresh':
          result.result = await this.executeRefresh(config)
          break
        case 'sync':
          result.result = await this.executeSync(config)
          break
      }

      result.success = true
      result.duration = Date.now() - startTime
      console.log(`[Scheduler] Task ${config.name} completed in ${result.duration}ms`)
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      result.duration = Date.now() - startTime
      console.error(`[Scheduler] Task ${config.name} failed:`, error)
    }

    for (const listener of this.listeners) {
      try {
        await listener(result)
      } catch (e) {
        console.error('[Scheduler] Listener error:', e)
      }
    }

    return result
  }

  /**
   * 执行论文发现
   */
  private async executeDiscovery(config: TaskConfig): Promise<unknown> {
    if (!config.topicId) {
      throw new Error('Topic ID is required for discovery task')
    }

    console.log(`[Scheduler] Starting discovery for topic: ${config.topicId}`)

    const candidates = await discoverExternalCandidates({
      anchors: [],
      queries: [],
      discoveryRound: 1,
      maxWindowMonths: 6,
      maxResultsPerQuery: 10,
      maxTotalCandidates: 20,
    })

    return { discoveredCount: candidates.length, candidates: candidates.slice(0, 5) }
  }

  /**
   * 执行刷新
   */
  private async executeRefresh(config: TaskConfig): Promise<unknown> {
    console.log(`[Scheduler] Refreshing data for task: ${config.id}`)
    return { refreshed: true }
  }

  /**
   * 执行同步
   */
  private async executeSync(config: TaskConfig): Promise<unknown> {
    console.log(`[Scheduler] Syncing data for task: ${config.id}`)
    return { synced: true }
  }

  /**
   * 手动触发任务
   */
  async triggerTask(taskId: string): Promise<TaskResult | null> {
    const entry = this.tasks.get(taskId)
    if (!entry) return null
    return this.executeTask(entry.config)
  }

  /**
   * 获取所有任务
   */
  getTasks(): TaskConfig[] {
    return Array.from(this.tasks.values()).map(v => v.config)
  }

  /**
   * 添加结果监听器
   */
  addListener(callback: TaskCallback): void {
    this.listeners.push(callback)
  }

  /**
   * 移除监听器
   */
  removeListener(callback: TaskCallback): void {
    const index = this.listeners.indexOf(callback)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    for (const [id, entry] of this.tasks) {
      entry.task.stop()
      console.log(`[Scheduler] Stopped task: ${id}`)
    }
  }

  /**
   * 启动所有任务
   */
  startAll(): void {
    for (const [id, entry] of this.tasks) {
      if (entry.config.enabled) {
        entry.task.start()
        console.log(`[Scheduler] Started task: ${id}`)
      }
    }
  }
}

export const taskScheduler = new TaskScheduler()

export default taskScheduler
