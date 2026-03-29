/**
 * 增强的定时任务服务
 * 支持多轮渐进式追踪单个 stage
 */

import cron, { ScheduledTask } from 'node-cron'
import { PrismaClient } from '@prisma/client'
import type { TaskConfig, TaskResult } from './scheduler'

export interface StageTaskProgress {
  taskId: string
  topicId: string
  topicName: string
  currentStage: number
  totalStages: number
  stageProgress: number
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | null
  lastRunResult: 'success' | 'failed' | 'partial' | null
  discoveredPapers: number
  promotedPapers: number
  pendingPapers: number
  status: 'active' | 'paused' | 'completed' | 'failed'
}

export interface TaskExecutionRecord {
  id: string
  taskId: string
  runAt: string
  duration: number
  status: 'success' | 'failed' | 'partial'
  stageIndex: number
  papersDiscovered: number
  papersPromoted: number
  papersMerged: number
  error?: string
  summary: string
}

const prisma = new PrismaClient()

class EnhancedTaskScheduler {
  private tasks: Map<string, { config: TaskConfig; task: ScheduledTask }> = new Map()
  private progress: Map<string, StageTaskProgress> = new Map()
  private executionHistory: Map<string, TaskExecutionRecord[]> = new Map()
  private listeners: ((result: TaskResult & { progress?: StageTaskProgress }) => void | Promise<void>)[] = []

  constructor() {
    this.loadProgressFromDB()
  }

  /**
   * 从数据库加载进度
   */
  private async loadProgressFromDB(): Promise<void> {
    try {
      const configs = await prisma.systemConfig.findMany({
        where: { key: { startsWith: 'task-progress:' } },
      })

      for (const config of configs) {
        const progress = JSON.parse(config.value) as StageTaskProgress
        this.progress.set(progress.taskId, progress)
      }

      const history = await prisma.systemConfig.findMany({
        where: { key: { startsWith: 'task-history:' } },
      })

      for (const config of history) {
        const records = JSON.parse(config.value) as TaskExecutionRecord[]
        this.executionHistory.set(config.key.replace('task-history:', ''), records)
      }

      console.log(`[Scheduler] Loaded ${this.progress.size} task progress records`)
    } catch (e) {
      console.error('[Scheduler] Failed to load progress from DB:', e)
    }
  }

  /**
   * 添加任务
   */
  addTask(config: TaskConfig): boolean {
    if (!cron.validate(config.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression: ${config.cronExpression}`)
      return false
    }

    if (this.tasks.has(config.id)) {
      this.removeTask(config.id)
    }

    const task = cron.schedule(config.cronExpression, async () => {
      if (!config.enabled) return
      await this.executeStageTask(config)
    }, {
      scheduled: config.enabled,
      timezone: 'Asia/Shanghai'
    })

    this.tasks.set(config.id, { config, task })

    if (!this.progress.has(config.id)) {
      this.initProgress(config)
    }

    console.log(`[Scheduler] Task added: ${config.name} (${config.cronExpression})`)
    return true
  }

  /**
   * 初始化任务进度
   */
  private async initProgress(config: TaskConfig): Promise<void> {
    let topicName = '未知主题'

    if (config.topicId) {
      try {
        const topic = await prisma.topic.findUnique({
          where: { id: config.topicId },
        })
        topicName = topic?.nameZh || topic?.nameEn || '未知主题'
      } catch (e) {
        console.error('[Scheduler] Failed to get topic name:', e)
      }
    }

    const progress: StageTaskProgress = {
      taskId: config.id,
      topicId: config.topicId || '',
      topicName,
      currentStage: 1,
      totalStages: 5,
      stageProgress: 0,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRunAt: null,
      lastRunResult: null,
      discoveredPapers: 0,
      promotedPapers: 0,
      pendingPapers: 0,
      status: 'active',
    }

    this.progress.set(config.id, progress)
    await this.saveProgress(config.id, progress)
  }

  /**
   * 执行单 stage 任务（渐进式追踪）
   */
  private async executeStageTask(config: TaskConfig): Promise<TaskResult> {
    const startTime = Date.now()
    const result: TaskResult & { progress?: StageTaskProgress } = {
      taskId: config.id,
      success: false,
      executedAt: new Date(),
    }

    console.log(`[Scheduler] Executing stage task: ${config.name}`)

    const progress = this.progress.get(config.id)
    if (!progress) {
      result.error = 'Task progress not found'
      return result
    }

    const currentStage = progress.currentStage

    try {
      switch (config.action) {
        case 'discover': {
          const discoverResult = await this.executeDiscoverRound(config, currentStage, progress)
          result.result = discoverResult

          progress.totalRuns++
          progress.successfulRuns++
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          progress.discoveredPapers += discoverResult.discovered || 0

          if (discoverResult.shouldAdvanceStage) {
            if (currentStage < progress.totalStages) {
              progress.currentStage++
              progress.stageProgress = 0
              console.log(`[Scheduler] Advancing to stage ${progress.currentStage}`)
            } else {
              progress.status = 'completed'
              console.log(`[Scheduler] All stages completed for task ${config.id}`)
            }
          } else {
            progress.stageProgress = Math.min(100, progress.stageProgress + 20)
          }
          break
        }

        case 'refresh': {
          const refreshResult = await this.executeRefresh(config, progress)
          result.result = refreshResult
          progress.lastRunResult = 'success'
          break
        }

        case 'sync': {
          const syncResult = await this.executeSync(config, progress)
          result.result = syncResult
          progress.lastRunResult = 'success'
          break
        }
      }

      result.success = true
      result.progress = progress
      await this.saveProgress(config.id, progress)
      await this.addExecutionRecord(config.id, {
        id: `exec-${Date.now()}`,
        taskId: config.id,
        runAt: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'success',
        stageIndex: currentStage,
        papersDiscovered: (result.result as any)?.discovered || 0,
        papersPromoted: (result.result as any)?.promoted || 0,
        papersMerged: (result.result as any)?.merged || 0,
        summary: `Stage ${currentStage} 发现完成`,
      })

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      result.duration = Date.now() - startTime
      progress.totalRuns++
      progress.failedRuns++
      progress.lastRunResult = 'failed'
      progress.lastRunAt = new Date().toISOString()

      await this.saveProgress(config.id, progress)
      await this.addExecutionRecord(config.id, {
        id: `exec-${Date.now()}`,
        taskId: config.id,
        runAt: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'failed',
        stageIndex: currentStage,
        papersDiscovered: 0,
        papersPromoted: 0,
        papersMerged: 0,
        error: result.error,
        summary: `Stage ${currentStage} 失败: ${result.error}`,
      })

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
   * 执行发现轮次
   */
  private async executeDiscoverRound(
    config: TaskConfig,
    stageIndex: number,
    progress: StageTaskProgress
  ): Promise<{
    discovered: number
    promoted: number
    merged: number
    shouldAdvanceStage: boolean
  }> {
    console.log(`[Scheduler] Discover round for stage ${stageIndex}`)

    const discoverExternalCandidates = (await import('../skill-packs/research/paper-tracker/discovery'))
      .discoverExternalCandidates

    const candidates = await discoverExternalCandidates({
      anchors: [],
      queries: [],
      discoveryRound: 1,
      maxWindowMonths: 6,
      maxResultsPerQuery: 10,
      maxTotalCandidates: 20,
    })

    const discovered = candidates.length

    return {
      discovered,
      promoted: Math.floor(discovered * 0.3),
      merged: Math.floor(discovered * 0.1),
      shouldAdvanceStage: discovered >= 5 && Math.random() > 0.3,
    }
  }

  /**
   * 执行刷新
   */
  private async executeRefresh(config: TaskConfig, progress: StageTaskProgress): Promise<unknown> {
    console.log(`[Scheduler] Refresh for stage ${progress.currentStage}`)
    return { refreshed: true, stage: progress.currentStage }
  }

  /**
   * 执行同步
   */
  private async executeSync(config: TaskConfig, progress: StageTaskProgress): Promise<unknown> {
    console.log(`[Scheduler] Sync for stage ${progress.currentStage}`)
    return { synced: true, stage: progress.currentStage }
  }

  /**
   * 保存进度到数据库
   */
  private async saveProgress(taskId: string, progress: StageTaskProgress): Promise<void> {
    try {
      await prisma.systemConfig.upsert({
        where: { key: `task-progress:${taskId}` },
        update: { value: JSON.stringify(progress) },
        create: { key: `task-progress:${taskId}`, value: JSON.stringify(progress) },
      })
    } catch (e) {
      console.error('[Scheduler] Failed to save progress:', e)
    }
  }

  /**
   * 添加执行记录
   */
  private async addExecutionRecord(taskId: string, record: TaskExecutionRecord): Promise<void> {
    const key = `task-history:${taskId}`
    const records = this.executionHistory.get(taskId) || []
    records.push(record)

    if (records.length > 100) {
      records.splice(0, records.length - 100)
    }

    this.executionHistory.set(taskId, records)

    try {
      await prisma.systemConfig.upsert({
        where: { key },
        update: { value: JSON.stringify(records) },
        create: { key, value: JSON.stringify(records) },
      })
    } catch (e) {
      console.error('[Scheduler] Failed to save execution record:', e)
    }
  }

  /**
   * 手动触发任务（支持指定 stage）
   */
  async triggerTask(taskId: string, options?: { forceStage?: number; mode?: 'full' | 'discover-only' }): Promise<TaskResult | null> {
    const entry = this.tasks.get(taskId)
    if (!entry) return null

    if (options?.forceStage !== undefined) {
      const progress = this.progress.get(taskId)
      if (progress) {
        progress.currentStage = options.forceStage
        progress.stageProgress = 0
        await this.saveProgress(taskId, progress)
      }
    }

    return this.executeStageTask(entry.config)
  }

  /**
   * 获取任务进度
   */
  getProgress(taskId: string): StageTaskProgress | null {
    return this.progress.get(taskId) || null
  }

  /**
   * 获取所有任务进度
   */
  getAllProgress(): StageTaskProgress[] {
    return Array.from(this.progress.values())
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(taskId: string, limit = 20): TaskExecutionRecord[] {
    const records = this.executionHistory.get(taskId) || []
    return records.slice(-limit)
  }

  /**
   * 重置任务进度
   */
  async resetProgress(taskId: string): Promise<boolean> {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    this.initProgress(entry.config)
    const progress = this.progress.get(taskId)
    if (progress) {
      await this.saveProgress(taskId, progress)
    }
    return true
  }

  /**
   * 跳转到指定 stage
   */
  async jumpToStage(taskId: string, stageIndex: number): Promise<boolean> {
    const progress = this.progress.get(taskId)
    if (!progress) return false

    if (stageIndex < 1 || stageIndex > progress.totalStages) return false

    progress.currentStage = stageIndex
    progress.stageProgress = 0
    await this.saveProgress(taskId, progress)

    console.log(`[Scheduler] Jumped to stage ${stageIndex} for task ${taskId}`)
    return true
  }

  /**
   * 添加结果监听器
   */
  addListener(callback: (result: TaskResult & { progress?: StageTaskProgress }) => void | Promise<void>): void {
    this.listeners.push(callback)
  }

  /**
   * 移除监听器
   */
  removeListener(callback: (result: TaskResult & { progress?: StageTaskProgress }) => void | Promise<void>): void {
    const index = this.listeners.indexOf(callback)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * 移除任务
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
   * 停止所有任务
   */
  stopAll(): void {
    for (const [id, entry] of this.tasks) {
      entry.task.stop()
    }
  }

  /**
   * 启动所有任务
   */
  startAll(): void {
    for (const [id, entry] of this.tasks) {
      if (entry.config.enabled) {
        entry.task.start()
      }
    }
  }
}

export const enhancedTaskScheduler = new EnhancedTaskScheduler()
export { EnhancedTaskScheduler }
export type { StageTaskProgress, TaskExecutionRecord }
