import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { createServer, type Server as HttpServer } from 'http'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'

import { errorHandler } from './middleware/errorHandler'
import { requestValidator } from './middleware/requestValidator'
import configRoutes from './routes/config'
import evidenceRoutes from './routes/evidence'
import modelCapabilitiesRoutes from './routes/model-capabilities'
import modelConfigRoutes from './routes/model-configs'
import nodeRoutes from './routes/nodes'
import omniRoutes from './routes/omni'
import paperRoutes from './routes/papers'
import pdfRoutes from './routes/pdf'
import promptTemplatesRoutes from './routes/prompt-templates'
import searchRoutes from './routes/search'
import syncRoutes from './routes/sync'
import tasksRoutes from './routes/tasks'
import topicAlphaRoutes from './routes/topic-alpha'
import topicGenRoutes from './routes/topic-gen'
import topicRoutes from './routes/topics'
import { logger } from './utils/logger'
import { initializeWebSocketServer } from './websocket/server'
import { startPaperMonitorCron } from './services/topics/paper-monitor-cron'

dotenv.config()

const developmentOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://localhost:4274',
  'http://localhost:4275',
  'http://127.0.0.1:4274',
  'http://127.0.0.1:4275',
  'http://localhost:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4174',
] as const

export function createApp() {
  const app = express()

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  app.use(
    cors({
      origin:
        process.env.NODE_ENV === 'production'
          ? ['https://your-domain.com']
          : [...developmentOrigins],
      credentials: true,
    }),
  )

  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }))

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 10_000,
    message: { error: 'Too many requests, please try again later.' },
    skip: (req) =>
      process.env.NODE_ENV !== 'production' &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip ?? ''),
  })
  app.use('/api/', limiter)

  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
  app.use(requestValidator)

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })
  })

  app.use('/api/topics', topicRoutes)
  app.use('/api/papers', paperRoutes)
  app.use('/api/nodes', nodeRoutes)
  app.use('/api/sync', syncRoutes)
  app.use('/api/config', configRoutes)
  app.use('/api/model-configs', modelConfigRoutes)
  app.use('/api/model-capabilities', modelCapabilitiesRoutes)
  app.use('/api/omni', omniRoutes)
  app.use('/api/pdf', pdfRoutes)
  app.use('/api/topics', topicAlphaRoutes)
  app.use('/api/evidence', evidenceRoutes)
  app.use('/api/topic-gen', topicGenRoutes)
  app.use('/api/prompt-templates', promptTemplatesRoutes)
  app.use('/api/tasks', tasksRoutes)
  app.use('/api/search', searchRoutes)

  app.use(errorHandler)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found.' })
  })

  return app
}

export function startServer(port = Number(process.env.PORT || 3001)) {
  const app = createApp()
  const server = createServer(app)
  initializeWebSocketServer(server)

  return new Promise<HttpServer>((resolve) => {
    server.listen(port, () => {
      logger.info(`Server started on port ${port}`)
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
      logger.info('WebSocket server ready at /ws')

      // 启动论文监控定时任务（每日凌晨3点）
      startPaperMonitorCron()

      resolve(server)
    })
  })
}

if (require.main === module) {
  void startServer()
}

export default createApp
