import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'
import { createServer } from 'http'

import { logger } from './utils/logger'
import { errorHandler } from './middleware/errorHandler'
import { requestValidator } from './middleware/requestValidator'
import { initializeWebSocketServer } from './websocket/server'

// 路由
import topicRoutes from './routes/topics'
import paperRoutes from './routes/papers'
import nodeRoutes from './routes/nodes'
import syncRoutes from './routes/sync'
import researchRoutes from './routes/research'
import configRoutes from './routes/config'
import modelRoutes from './routes/models'
import pdfRoutes from './routes/pdf'
import tasksRoutes from './routes/tasks'
import topicGenRoutes from './routes/topic-gen'
import promptTemplatesRoutes from './routes/prompt-templates'

// 加载环境变量
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// 创建 HTTP 服务器（用于 WebSocket）
const server = createServer(app)

// 安全中间件
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] 
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}))

// 请求日志
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }))

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 限制 100 个请求
  message: { error: '请求过于频繁，请稍后再试' }
})
app.use('/api/', limiter)

// 解析 JSON
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// 请求验证
app.use(requestValidator)

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// API 路由
app.use('/api/topics', topicRoutes)
app.use('/api/papers', paperRoutes)
app.use('/api/nodes', nodeRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/research', researchRoutes)
app.use('/api/config', configRoutes)
app.use('/api/models', modelRoutes)
app.use('/api/pdf', pdfRoutes)
app.use('/api/tasks', tasksRoutes)
app.use('/api/topic-gen', topicGenRoutes)
app.use('/api/prompt-templates', promptTemplatesRoutes)

// 错误处理
app.use(errorHandler)

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

// 初始化 WebSocket 服务器
initializeWebSocketServer(server)

// 启动服务器
server.listen(PORT, () => {
  logger.info(`服务器启动成功，端口: ${PORT}`)
  logger.info(`环境: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`WebSocket 服务已启动，路径: /ws`)
})

export default app
