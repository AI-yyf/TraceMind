import 'dotenv/config'

import fs from 'node:fs'
import cors from 'cors'
import express from 'express'
import { createServer, type Server as HttpServer } from 'http'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'

import { errorHandler } from './middleware/errorHandler'
import { i18nMiddleware } from './middleware/i18n'
import { requestValidator } from './middleware/requestValidator'
import { initializeAllDictionaries } from './i18n/translations'
import chatRoutes from './routes/chat'
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
import researchRoutes from './routes/research'
import zoteroRoutes from './routes/zotero'
import { logger } from './utils/logger'
import { initializeWebSocketServer } from './websocket/server'
import { startPaperMonitorCron } from './services/topics/paper-monitor-cron'
import { ensureConfiguredTopicsMaterialized } from './services/topics/topic-config-sync'

// Initialize i18n dictionaries
initializeAllDictionaries()
const DEFAULT_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4274',
  'http://127.0.0.1:4274',
] as const

function parseConfiguredOrigins(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isDevelopmentOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin)
}

function buildCorsOriginChecker() {
  const configuredOrigins = parseConfiguredOrigins(process.env.FRONTEND_ORIGINS)
  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? configuredOrigins
      : [...new Set([...DEFAULT_DEVELOPMENT_ORIGINS, ...configuredOrigins])]

  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    if (process.env.NODE_ENV !== 'production' && isDevelopmentOrigin(origin)) {
      callback(null, true)
      return
    }

    logger.warn('Blocked request from disallowed origin.', { origin })
    callback(null, false)
  }
}

function shouldMaterializeTopicsOnStartup() {
  const flag = (process.env.TOPIC_SYNC_ON_STARTUP ?? '').trim().toLowerCase()
  if (flag === '1' || flag === 'true' || flag === 'yes') return true
  if (flag === '0' || flag === 'false' || flag === 'no') return false
  return process.env.NODE_ENV === 'production'
}

export function createApp() {
  const app = express()
  const uploadsDir = path.resolve(process.cwd(), 'uploads')
  const papersDir = path.resolve(process.cwd(), '../generated-data/public/papers')
  const uploadFallbackAsset = path.resolve(papersDir, '1604.07316', 'cnn-architecture.png')

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  app.use(
    cors({
      origin: buildCorsOriginChecker(),
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

  // i18n middleware - detect locale from request headers
  app.use(i18nMiddleware())
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      fallthrough: true,
      immutable: process.env.NODE_ENV === 'production',
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    }),
  )
  app.use('/uploads', (req, res, next) => {
    const trimmedPath = req.path.replace(/^\/+/u, '')
    const [paperId, segment, assetName] = trimmedPath.split('/')
    if (paperId && segment === 'images' && assetName) {
      const paperAssetCandidate = path.resolve(papersDir, paperId, assetName)
      if (fs.existsSync(paperAssetCandidate)) {
        res.sendFile(paperAssetCandidate)
        return
      }
      if (fs.existsSync(uploadFallbackAsset)) {
        res.sendFile(uploadFallbackAsset)
        return
      }
    }
    next()
  })
  app.use('/uploads', (_req, res) => {
    res.status(404).type('text/plain').send('Upload asset not found.')
  })
  app.use(
    '/papers',
    express.static(papersDir, {
      fallthrough: true,
      immutable: process.env.NODE_ENV === 'production',
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    }),
  )
  app.use('/papers', (_req, res) => {
    res.status(404).type('text/plain').send('Paper asset not found.')
  })
  app.use(requestValidator)

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })
  })

  app.use('/api/chat', chatRoutes)
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
  app.use('/api/zotero', zoteroRoutes)
  app.use('/api/research', researchRoutes)

  app.use(errorHandler)

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found.' })
  })

  return app
}

export function startServer(port = Number(process.env.PORT || 3303)) {
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
      if (shouldMaterializeTopicsOnStartup()) {
        void ensureConfiguredTopicsMaterialized().catch((error) => {
          logger.warn('Configured topics could not be materialized during server startup.', {
            error,
          })
        })
      } else {
        logger.info(
          'Skipping configured topic materialization during startup; set TOPIC_SYNC_ON_STARTUP=1 to enable it.',
        )
      }

      resolve(server)
    })
  })
}

if (require.main === module) {
  void startServer()
}

export default createApp
