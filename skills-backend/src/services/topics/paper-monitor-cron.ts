/**
 * 论文监控定时任务
 * 
 * 每日凌晨3点运行 runFullMonitor
 * 可通过环境变量 PAPER_MONITOR_CRON 自定义 cron 表达式
 * 可通过 PAPER_MONITOR_DISABLED=1 禁用
 */

import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '../../lib/prisma'
import { runFullMonitor } from './paper-monitor'
import { logger } from '../../utils/logger'

let monitorTask: ScheduledTask | null = null

export function startPaperMonitorCron(): void {
  if (process.env.PAPER_MONITOR_DISABLED === '1') {
    logger.info('[PaperMonitor] Disabled via PAPER_MONITOR_DISABLED=1')
    return
  }

  const cronExpression = process.env.PAPER_MONITOR_CRON || '0 3 * * *' // 默认每天凌晨3点

  if (!cron.validate(cronExpression)) {
    logger.error(`[PaperMonitor] Invalid cron expression: ${cronExpression}`)
    return
  }

  monitorTask = cron.schedule(cronExpression, async () => {
    logger.info('[PaperMonitor] Starting daily paper monitor run...')

    try {
      const results = await runFullMonitor(prisma)
      const totalNew = results.reduce((sum, r) => sum + r.newPapersFound, 0)
      const totalSuggestions = results.reduce((sum, r) => sum + r.updateSuggestions.length, 0)

      logger.info(
        `[PaperMonitor] Completed. Monitored ${results.length} topics, ` +
        `found ${totalNew} new papers, ${totalSuggestions} update suggestions.`,
      )

      // 记录监控结果到日志（未来可存入数据库）
      for (const result of results) {
        if (result.newPapersFound > 0) {
          logger.info(
            `[PaperMonitor] Topic "${result.topicName}": ${result.newPapersFound} new papers found`,
          )
        }
        if (result.updateSuggestions.length > 0) {
          for (const suggestion of result.updateSuggestions) {
            logger.info(
              `[PaperMonitor] Suggestion: ${suggestion.nodeTitle} - ${suggestion.reason}`,
            )
          }
        }
      }
    } catch (error) {
      logger.error('[PaperMonitor] Monitor run failed:', error)
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai',
  })

  logger.info(`[PaperMonitor] Scheduled with cron: ${cronExpression} (Asia/Shanghai)`)
}

export function stopPaperMonitorCron(): void {
  if (monitorTask) {
    monitorTask.stop()
    if ('destroy' in monitorTask && typeof monitorTask.destroy === 'function') {
      monitorTask.destroy()
    }
    monitorTask = null
    logger.info('[PaperMonitor] Stopped')
  }
}
