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

const router = Router()

// 研究会话存储（内存中，生产环境应使用 Redis）
const sessions = new Map()

// 启动研究会话
router.post('/sessions', asyncHandler(async (req, res) => {
  const { topicIds, mode = 'full', startStage = 1 } = req.body

  const sessionId = uuidv4()
  const session = {
    id: sessionId,
    topicIds,
    mode,
    startStage,
    status: 'running',
    progress: 0,
    currentStage: '初始化',
    logs: [{
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `启动研究会话，主题: ${topicIds.join(', ')}`
    }],
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
      logs: JSON.stringify(session.logs)
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
      logs: JSON.parse(dbSession.logs)
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
    logs: JSON.parse(s.logs)
  }))

  res.json({ success: true, data: sessions })
}))

// 执行研究流程
async function executeResearchSession(session: any) {
  const stages = [
    { name: '论文发现', duration: 5000 },
    { name: '论文筛选', duration: 3000 },
    { name: '阶段分类', duration: 4000 },
    { name: '节点合并', duration: 3000 },
    { name: '内容生成', duration: 8000 },
    { name: '完成', duration: 1000 }
  ]

  try {
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      
      // 更新状态
      session.currentStage = stage.name
      session.progress = Math.round((i / stages.length) * 100)
      session.logs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `开始: ${stage.name}`
      })

      // 广播进度到 WebSocket
      broadcastResearchProgress(session.id, {
        stage: stage.name,
        progress: session.progress,
        logs: session.logs.slice(-5) // 只发送最近 5 条日志
      })

      // 更新数据库
      await prisma.researchSession.update({
        where: { id: session.id },
        data: {
          currentStage: stage.name,
          progress: session.progress,
          logs: JSON.stringify(session.logs)
        }
      })

      // 模拟处理时间
      await new Promise(resolve => setTimeout(resolve, stage.duration))

      session.logs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `完成: ${stage.name}`
      })
    }

    // 完成
    session.status = 'completed'
    session.progress = 100
    session.currentStage = '已完成'
    session.completedAt = new Date().toISOString()

    await prisma.researchSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        progress: 100,
        currentStage: '已完成',
        completedAt: new Date(),
        logs: JSON.stringify(session.logs)
      }
    })

    // 广播完成
    broadcastResearchComplete(session.id, {
      message: '研究会话已完成',
      logs: session.logs
    })

    logger.info('研究会话完成', { sessionId: session.id })

  } catch (error) {
    // 错误处理
    session.status = 'failed'
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    session.logs.push({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `错误: ${errorMessage}`
    })

    await prisma.researchSession.update({
      where: { id: session.id },
      data: {
        status: 'failed',
        logs: JSON.stringify(session.logs),
        error: errorMessage
      }
    })

    // 广播错误
    broadcastResearchError(session.id, errorMessage)

    logger.error('研究会话失败', { sessionId: session.id, error: errorMessage })
  }
}

export default router
