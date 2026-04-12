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
import { setSession, getSession, getAllSessions } from '../lib/redis'

const router = Router()

// Session key prefix for Redis storage
const SESSION_KEY_PREFIX = 'research:session:'

// 创建 Skill 上下文
function createSkillContext(sessionId: string): SkillContext {
  return {
    logger: {
      info: (msg: string, meta?: any) => logger.info(`[Session ${sessionId}] ${msg}`, meta),
      warn: (msg: string, meta?: any) => logger.warn(`[Session ${sessionId}] ${msg}`, meta),
      error: (msg: string, meta?: any) => logger.error(`[Session ${sessionId}] ${msg}`, meta),
      debug: (msg: string, meta?: any) => logger.debug(`[Session ${sessionId}] ${msg}`, meta),
    },
    activeTopicIds: [],
    generatedDataSummary: { paperCount: 0, topicCount: 0, capabilityCount: 0, nodeCount: 0 },
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

  // Store session in Redis with 24-hour TTL
  await setSession(SESSION_KEY_PREFIX + sessionId, session, 86400)

  // 保存到数据库 (results stored in Redis only, not in DB schema)
  await prisma.research_sessions.create({
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
  
  // 优先从Redis获取
  let session = await getSession(SESSION_KEY_PREFIX + id)
  
  // Redis中没有则从数据库获取
  if (!session) {
    const dbSession = await prisma.research_sessions.findUnique({
      where: { id }
    })
    if (!dbSession) throw new AppError(404, '会话不存在')
    session = {
      ...dbSession,
      topicIds: JSON.parse(dbSession.topicIds),
      logs: JSON.parse(dbSession.logs as string),
      results: { discoveredPapers: 0, admittedPapers: 0, generatedContents: 0, errors: [] }
    }
  }

  res.json({ success: true, data: session })
}))

// 获取所有会话
router.get('/sessions', asyncHandler(async (req, res) => {
  // Get sessions from Redis (active sessions within TTL)
  const redisSessions = await getAllSessions('research:session:*')
  
  // Also get from database for historical sessions
  const dbSessions = await prisma.research_sessions.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  // Merge Redis sessions with database sessions (Redis has fresher data)
  const sessionsMap = new Map()
  
  // Add database sessions first
  for (const s of dbSessions) {
    sessionsMap.set(s.id, {
      ...s,
      topicIds: JSON.parse(s.topicIds),
      logs: JSON.parse(s.logs as string),
      results: { discoveredPapers: 0, admittedPapers: 0, generatedContents: 0, errors: [] }
    })
  }
  
  // Override with Redis sessions (they have fresher state)
  for (const [key, session] of redisSessions) {
    const id = key.replace(SESSION_KEY_PREFIX, '')
    sessionsMap.set(id, session)
  }

  const sessions = Array.from(sessionsMap.values())

  res.json({ success: true, data: sessions })
}))

// 停止研究会话
router.post('/sessions/:id/stop', asyncHandler(async (req, res) => {
  const { id } = req.params
  
  const session: any = await getSession(SESSION_KEY_PREFIX + id)
  if (!session) {
    throw new AppError(404, '会话不存在')
  }

  session.status = 'stopped'
  session.logs.push({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: '研究会话被用户停止'
  })

  await prisma.research_sessions.update({
    where: { id },
    data: {
      status: 'stopped',
      logs: JSON.stringify(session.logs)
    }
  })

  // Update session in Redis
  await setSession(SESSION_KEY_PREFIX + id, session, 86400)

  broadcastResearchError(id, '研究会话被用户停止')

  res.json({ success: true, message: '会话已停止' })
}))

// 执行研究流程 - 真实实现
async function executeResearchSession(session: any) {
  const context = createSkillContext(session.id)
  
  try {
    // 阶段定义
    const _stages = [
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
          request: {
            skillId: 'paper-tracker',
            input: {
              topicId,
              stageMode: 'next-stage',
              discoverySource: 'external-only',
              maxCandidates: 10,
              mode: 'commit',
            },
          },
        },
        context,
        null as any
      )

      if (!discoveryResult.success) {
        throw new Error(`论文发现失败: ${discoveryResult.error}`)
      }

      const discoveryData = discoveryResult.data as {
        admittedCandidates?: Array<{ paperId: string; stageIndex?: number; citeIntent?: string }>
        discoverySummary?: { totalDiscovered?: number }
        stageWindow?: { stageIndex?: number }
        decisionSummary?: string
      } | null
      
      const admittedCandidates = discoveryData?.admittedCandidates || []
      session.results.discoveredPapers += discoveryData?.discoverySummary?.totalDiscovered || 0
      session.results.admittedPapers += admittedCandidates.length

      await updateSessionProgress(
        session, 
        25, 
        `论文发现完成: 发现 ${discoveryData?.discoverySummary?.totalDiscovered || 0} 篇，准入 ${admittedCandidates.length} 篇`,
        context
      )

      // 阶段 2: 论文筛选（已在 discovery 中完成）
      await updateSessionProgress(session, 35, '论文筛选: 完成准入判断', context)

      // 阶段 3: 阶段分类
      await updateSessionProgress(session, 45, '阶段分类: 定论文所属阶段...', context)
      
      // Skip stage update - papers schema has no stageIndex field

      await updateSessionProgress(session, 55, `阶段分类完成: 分配到阶段 ${discoveryData?.stageWindow?.stageIndex || 1}`, context)

      // 阶段 4: 节点合并
      await updateSessionProgress(session, 65, '节点合并: 关联到研究节点...', context)
      
      // 创建或更新研究节点
      const stageIndex = discoveryData?.stageWindow?.stageIndex || 1
      
      // Find existing node or create new one
      let node = await prisma.research_nodes.findFirst({
        where: { topicId, stageIndex }
      })
      
      if (!node) {
        node = await prisma.research_nodes.create({
          data: {
            id: uuidv4(),
            topicId,
            stageIndex,
            nodeLabel: `阶段 ${stageIndex}`,
            nodeSummary: discoveryData?.decisionSummary || '',
            updatedAt: new Date(),
          }
        })
      } else {
        await prisma.research_nodes.update({
          where: { id: node.id },
          data: { updatedAt: new Date() }
        })
      }

      // 关联论文到节点 (skip - papers has no arxivId)
      for (const candidate of admittedCandidates) {
        // Find paper by title or other identifier since arxivId not in schema
        const paper = await prisma.papers.findFirst({
          where: { topicId, title: candidate.paperId }
        })
        if (paper) {
          await prisma.node_papers.upsert({
            where: {
              nodeId_paperId: {
                nodeId: node.id,
                paperId: paper.id,
              }
            },
            update: {},
            create: {
              id: uuidv4(),
              nodeId: node.id,
              paperId: paper.id,
              order: 0,
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
          `内容生成: 处论文 ${i + 1}/${admittedCandidates.length}...`,
          context
        )

        const contentResult = await executeContentGenesis(
          {
            params: {
              paperId: candidate.paperId,
              topicId,
              stageIndex,
              citeIntent: candidate.citeIntent as 'supporting' | 'contrasting' | 'method-using' | 'background' | undefined,
              contentMode: 'editorial',
            },
            request: {
              skillId: 'content-genesis-v2',
              input: {
                paperId: candidate.paperId,
                topicId,
                stageIndex,
                citeIntent: candidate.citeIntent,
                contentMode: 'editorial',
              },
            },
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
      
      const orchestratorResult = await executeOrchestrator({
        request: {
          skillId: 'orchestrator',
          input: {
            topicId,
            mode: 'promote',
            promoteTarget: 'topic',
          },
        },
        context,
      })

      const orchestratorOutput = orchestratorResult.output
      if (orchestratorOutput && orchestratorOutput.failures && orchestratorOutput.failures.length > 0) {
        logger.warn('编排器执行警告', { failures: orchestratorOutput.failures })
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

  // 更新数据库 (results stored in Redis only)
  await prisma.research_sessions.update({
    where: { id: session.id },
    data: {
      currentStage: session.currentStage,
      progress: session.progress,
      logs: JSON.stringify(session.logs)
    }
  })

  // Update session in Redis
  await setSession(SESSION_KEY_PREFIX + session.id, session, 86400)

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

  await prisma.research_sessions.update({
    where: { id: session.id },
    data: {
      status: 'completed',
      progress: 100,
      currentStage: '已完成',
      completedAt: new Date(),
      logs: JSON.stringify(session.logs)
    }
  })

  // Update session in Redis
  await setSession(SESSION_KEY_PREFIX + session.id, session, 86400)

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

  await prisma.research_sessions.update({
    where: { id: session.id },
    data: {
      status: 'failed',
      logs: JSON.stringify(session.logs),
      error: errorMessage
    }
  })

  // Update session in Redis
  await setSession(SESSION_KEY_PREFIX + session.id, session, 86400)

  broadcastResearchError(session.id, errorMessage)

  context.logger.error('研究会话失败', { 
    sessionId: session.id, 
    error: errorMessage 
  })
}

export default router
