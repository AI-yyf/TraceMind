import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { logger } from '../utils/logger'
import { 
  broadcastResearchProgress, 
  broadcastResearchComplete, 
  broadcastResearchError 
} from '../websocket/server'
import { executePaperTracker } from '../../skill-packs/research/paper-tracker/executor'
import { executeContentGenesis } from '../../skill-packs/research/content-genesis-v2/executor'
import { executeOrchestrator } from '../../skill-packs/research/orchestrator/executor'
import type { SkillContext } from '../../engine/contracts'

const router = Router()

// 研究会话存储（内存中，生产环境应使用 Redis）
const sessions = new Map()

// 创建 Skill 上下文
function createSkillContext(sessionId: string): SkillContext {
  return {
    logger: {
      info: (msg: string, meta?: any) => logger.info(`[Session ${sessionId}] ${msg}`, meta),
      warn: (msg: string, meta?: any) => logger.warn(`[Session ${sessionId}] ${msg}`, meta),
      error: (msg: string, meta?: any) => logger.error(`[Session ${sessionId}] ${msg}`, meta),
      debug: (msg: string, meta?: any) => logger.debug(`[Session ${sessionId}] ${msg}`, meta),
    },
    sessionId,
    workspacePath: process.cwd(),
  }
}

// 启动研究会话
router.post('/sessions', asyncHandler(async (req, res) => {
  const { topicIds, mode = 'full', startStage = 1, maxIterations = 3 } = req.body

  if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
    throw new AppError(400, '必须提供至少一个主题ID')
  }

  const sessionId = uuidv4()
  const session = {
    id: sessionId,
    topicIds,
    mode,
    startStage,
    maxIterations,
    status: 'running',
    progress: 0,
    currentStage: '初始化',
    currentTopicIndex: 0,
    logs: [{
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `启动研究会话，主题: ${topicIds.join(', ')}，模式: ${mode}`
    }],
    results: {
      discoveredPapers: 0,
      admittedPapers: 0,
      generatedContents: 0,
      errors: []
    },
    createdAt: new Date().toISOString()
  }

  sessions.set(sessionId, session)

  // 保存到数据库
  await prisma.researchSession.create({
    data: {
      id: sessionId,
      topicIds: JSON.stringify(topicIds),
      mode,
      status: 'running',
      currentStage: '初始化',
      progress: 0,
      logs: JSON.stringify(session.logs),
      results: JSON.stringify(session.results)
    }
  })

  // 异步执行研究流程
  executeResearchSession(session)

  res.status(201).json({
    success: true,
    data: { sessionId, status: 'running' }
  })
}))

// 获取会话状态
router.get('/sessions/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  
  // 优先从内存获取
  let session = sessions.get(id)
  
  // 内存中没有则从数据库获取
  if (!session) {
    const dbSession = await prisma.researchSession.findUnique({
      where: { id }
    })
    if (!dbSession) throw new AppError(404, '会话不存在')
    session = {
      ...dbSession,
      topicIds: JSON.parse(dbSession.topicIds),
      logs: JSON.parse(dbSession.logs),
      results: JSON.parse(dbSession.results || '{}')
    }
  }

  res.json({ success: true, data: session })
}))

// 获取所有会话
router.get('/sessions', asyncHandler(async (req, res) => {
  const dbSessions = await prisma.researchSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  const sessions = dbSessions.map(s => ({
    ...s,
    topicIds: JSON.parse(s.topicIds),
    logs: JSON.parse(s.logs),
    results: JSON.parse(s.results || '{}')
  }))

  res.json({ success: true, data: sessions })
}))

// 停止研究会话
router.post('/sessions/:id/stop', asyncHandler(async (req, res) => {
  const { id } = req.params
  
  const session = sessions.get(id)
  if (!session) {
    throw new AppError(404, '会话不存在')
  }

  session.status = 'stopped'
  session.logs.push({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: '研究会话被用户停止'
  })

  await prisma.researchSession.update({
    where: { id },
    data: {
      status: 'stopped',
      logs: JSON.stringify(session.logs)
    }
  })

  broadcastResearchError(id, '研究会话被用户停止')

  res.json({ success: true, message: '会话已停止' })
}))

// 执行研究流程 - 真实实现
async function executeResearchSession(session: any) {
  const context = createSkillContext(session.id)
  
  try {
    // 阶段定义
    const stages = [
      { name: '论文发现', key: 'discovery' },
      { name: '论文筛选', key: 'filtering' },
      { name: '阶段分类', key: 'classification' },
      { name: '节点合并', key: 'merging' },
      { name: '内容生成', key: 'content-generation' },
      { name: '完成', key: 'completion' }
    ]

    // 对每个主题执行研究
    for (let topicIndex = 0; topicIndex < session.topicIds.length; topicIndex++) {
      if (session.status === 'stopped') {
        logger.info('研究会话被停止', { sessionId: session.id })
        return
      }

      const topicId = session.topicIds[topicIndex]
      session.currentTopicIndex = topicIndex
      
      await updateSessionProgress(session, 0, `开始处理主题: ${topicId}`, context)

      // 阶段 1: 论文发现
      await updateSessionProgress(session, 10, '论文发现: 搜索相关论文...', context)
      
      const discoveryResult = await executePaperTracker(
        {
          params: {
            topicId,
            stageMode: 'next-stage',
            discoverySource: 'external-only',
            maxCandidates: 10,
            mode: 'commit',
          },
          context: {},
        },
        context,
        null as any
      )

      if (!discoveryResult.success) {
        throw new Error(`论文发现失败: ${discoveryResult.error}`)
      }

      const admittedCandidates = discoveryResult.data?.admittedCandidates || []
      session.results.discoveredPapers += discoveryResult.data?.discoverySummary?.totalDiscovered || 0
      session.results.admittedPapers += admittedCandidates.length

      await updateSessionProgress(
        session, 
        25, 
        `论文发现完成: 发现 ${discoveryResult.data?.discoverySummary?.totalDiscovered || 0} 篇，准入 ${admittedCandidates.length} 篇`,
        context
      )

      // 阶段 2: 论文筛选（已在 discovery 中完成）
      await updateSessionProgress(session, 35, '论文筛选: 完成准入判断', context)

      // 阶段 3: 阶段分类
      await updateSessionProgress(session, 45, '阶段分类: 确定论文所属阶段...', context)
      
      // 更新论文的阶段信息
      for (const candidate of admittedCandidates) {
        await prisma.paper.updateMany({
          where: { arxivId: candidate.paperId },
          data: {
            stageIndex: candidate.stageIndex,
          }
        })
      }

      await updateSessionProgress(session, 55, `阶段分类完成: 分配到阶段 ${discoveryResult.data?.stageWindow?.stageIndex || 1}`, context)

      // 阶段 4: 节点合并
      await updateSessionProgress(session, 65, '节点合并: 关联到研究节点...', context)
      
      // 创建或更新研究节点
      const stageIndex = discoveryResult.data?.stageWindow?.stageIndex || 1
      const node = await prisma.researchNode.upsert({
        where: {
          topicId_stageIndex: {
            topicId,
            stageIndex,
          }
        },
        update: {
          updatedAt: new Date(),
        },
        create: {
          topicId,
          stageIndex,
          title: `阶段 ${stageIndex}`,
          summary: discoveryResult.data?.decisionSummary || '',
        }
      })

      // 关联论文到节点
      for (const candidate of admittedCandidates) {
        const paper = await prisma.paper.findFirst({
          where: { arxivId: candidate.paperId }
        })
        if (paper) {
          await prisma.nodePaper.upsert({
            where: {
              nodeId_paperId: {
                nodeId: node.id,
                paperId: paper.id,
              }
            },
            update: {},
            create: {
              nodeId: node.id,
              paperId: paper.id,
              isKeyPaper: candidate.confidence >= 0.8,
            }
          })
        }
      }

      await updateSessionProgress(session, 75, `节点合并完成: 关联到节点 ${node.id}`, context)

      // 阶段 5: 内容生成
      await updateSessionProgress(session, 80, '内容生成: 生成三层内容...', context)
      
      // 为每篇准入论文生成内容
      for (let i = 0; i < admittedCandidates.length; i++) {
        if (session.status === 'stopped') return

        const candidate = admittedCandidates[i]
        const progress = 80 + Math.round((i / admittedCandidates.length) * 15)
        
        await updateSessionProgress(
          session, 
          progress, 
          `内容生成: 处理论文 ${i + 1}/${admittedCandidates.length}...`,
          context
        )

        const contentResult = await executeContentGenesis(
          {
            params: {
              paperId: candidate.paperId,
              topicId,
              stageIndex,
              citeIntent: candidate.citeIntent,
              contentMode: 'editorial',
            },
            context: {},
          },
          context,
          null as any
        )

        if (contentResult.success) {
          session.results.generatedContents++
        } else {
          session.results.errors.push({
            paperId: candidate.paperId,
            error: contentResult.error
          })
        }
      }

      await updateSessionProgress(
        session, 
        95, 
        `内容生成完成: 生成 ${session.results.generatedContents} 篇内容`,
        context
      )

      // 执行编排器
      await updateSessionProgress(session, 98, '执行编排器: 整合研究成果...', context)
      
      const orchestratorResult = await executeOrchestrator(
        {
          params: {
            topicId,
            mode: 'promote',
            promoteTarget: 'topic',
          },
          context: {},
        },
        context,
        null as any
      )

      if (!orchestratorResult.success) {
        logger.warn('编排器执行警告', { error: orchestratorResult.error })
      }
    }

    // 完成
    await finalizeSession(session, context)

  } catch (error) {
    await handleSessionError(session, error, context)
  }
}

// 更新会话进度
async function updateSessionProgress(
  session: any, 
  progress: number, 
  message: string, 
  context: SkillContext
) {
  session.progress = progress
  session.currentStage = message
  session.logs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message
  })

  // 广播进度
  broadcastResearchProgress(session.id, {
    stage: session.currentStage,
    progress: session.progress,
    currentTopicIndex: session.currentTopicIndex,
    totalTopics: session.topicIds.length,
    logs: session.logs.slice(-10),
    results: session.results
  })

  // 更新数据库
  await prisma.researchSession.update({
    where: { id: session.id },
    data: {
      currentStage: session.currentStage,
      progress: session.progress,
      logs: JSON.stringify(session.logs),
      results: JSON.stringify(session.results)
    }
  })

  context.logger.info(message)
}

// 完成会话
async function finalizeSession(session: any, context: SkillContext) {
  session.status = 'completed'
  session.progress = 100
  session.currentStage = '已完成'
  session.completedAt = new Date().toISOString()

  const summaryMessage = `研究会话完成！发现 ${session.results.discoveredPapers} 篇论文，` +
    `准入 ${session.results.admittedPapers} 篇，生成 ${session.results.generatedContents} 篇内容`

  session.logs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: summaryMessage
  })

  await prisma.researchSession.update({
    where: { id: session.id },
    data: {
      status: 'completed',
      progress: 100,
      currentStage: '已完成',
      completedAt: new Date(),
      logs: JSON.stringify(session.logs),
      results: JSON.stringify(session.results)
    }
  })

  broadcastResearchComplete(session.id, {
    message: summaryMessage,
    results: session.results,
    logs: session.logs
  })

  context.logger.info('研究会话完成', { 
    sessionId: session.id, 
    results: session.results 
  })
}

// 处理会话错误
async function handleSessionError(session: any, error: any, context: SkillContext) {
  session.status = 'failed'
  const errorMessage = error instanceof Error ? error.message : '未知错误'
  
  session.logs.push({
    timestamp: new Date().toISOString(),
    level: 'error',
    message: `错误: ${errorMessage}`
  })

  session.results.errors.push({
    stage: session.currentStage,
    error: errorMessage
  })

  await prisma.researchSession.update({
    where: { id: session.id },
    data: {
      status: 'failed',
      logs: JSON.stringify(session.logs),
      results: JSON.stringify(session.results),
      error: errorMessage
    }
  })

  broadcastResearchError(session.id, errorMessage)

  context.logger.error('研究会话失败', { 
    sessionId: session.id, 
    error: errorMessage 
  })
}

export default router
