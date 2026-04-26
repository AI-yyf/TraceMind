/**
 * 定时任务调度器
 * 支持定时执行论文发现流程
 */

import cron, { ScheduledTask } from 'node-cron'

export type ResearchMode = 'stage-rounds' | 'duration'

export interface TaskConfig {
  id: string
  name: string
  cronExpression: string
  enabled: boolean
  topicId?: string
  action: 'discover' | 'refresh' | 'sync'
  researchMode?: ResearchMode
  options?: {
    maxResults?: number
    stageIndex?: number
    maxIterations?: number
    durationHours?: number
    cycleDelayMs?: number
    stageDurationDays?: number
    stageRounds?: Array<{
      stageIndex: number
      rounds: number
    }>
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
    console.log(`[Scheduler] Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`)
    return true
  }

  /**
   * 立即执行任务
   */
  async triggerTask(taskId: string): Promise<TaskResult | null> {
    const entry = this.tasks.get(taskId)
    if (!entry) return null
    return this.executeTask(entry.config)
  }

  /**
   * 执行具体任务
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
          // 模拟发现流程
          result.result = {
            discovered: Math.floor(Math.random() * 10) + 5,
            admitted: Math.floor(Math.random() * 5) + 2,
          }
          break
        case 'refresh':
          result.result = { refreshed: true }
          break
        case 'sync':
          result.result = { synced: true }
          break
      }

      result.success = true
      result.duration = Date.now() - startTime
      console.log(`[Scheduler] Task ${config.name} completed successfully`)
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      result.duration = Date.now() - startTime
      console.error(`[Scheduler] Task ${config.name} failed:`, error)
    }

    // 通知监听器
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
   * 获取所有任务
   */
  getTasks(): TaskConfig[] {
    return Array.from(this.tasks.values()).map(entry => entry.config)
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): TaskConfig | undefined {
    return this.tasks.get(taskId)?.config
  }

  /**
   * 添加结果监听器
   */
  onResult(callback: TaskCallback): void {
    this.listeners.push(callback)
  }

  /**
   * 移除结果监听器
   */
  offResult(callback: TaskCallback): void {
    const index = this.listeners.indexOf(callback)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * 启动所有任务
   */
  startAll(): void {
    for (const [, entry] of this.tasks.entries()) {
      entry.config.enabled = true
      entry.task.start()
    }
    console.log(`[Scheduler] Started ${this.tasks.size} tasks`)
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    for (const [, entry] of this.tasks.entries()) {
      entry.config.enabled = false
      entry.task.stop()
    }
    console.log(`[Scheduler] Stopped ${this.tasks.size} tasks`)
  }
}

// 导出单例实例
export const taskScheduler = new TaskScheduler()
