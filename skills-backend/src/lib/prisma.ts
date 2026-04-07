import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger'

// Prisma 客户端全局实例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const prismaDir = path.resolve(currentDir, '../../prisma')

function toSqliteFileUrl(relativePathFromPrismaDir: string) {
  return `file:${relativePathFromPrismaDir.replace(/\\/gu, '/')}`
}

function resolveSqliteFile(url: string) {
  if (!url.startsWith('file:')) return null

  const rawPath = url.slice('file:'.length)
  if (!rawPath || /^(?:[a-z]+:)?\/\//iu.test(rawPath)) return null

  const normalized = rawPath.replace(/\\/gu, '/')
  if (!normalized.startsWith('.')) return null

  const candidates = [normalized]
  if (normalized.startsWith('./prisma/')) {
    candidates.push(`.${normalized.slice('./prisma'.length)}`)
  }

  for (const candidate of candidates) {
    const absolutePath = path.resolve(prismaDir, candidate)
    if (fs.existsSync(absolutePath)) {
      return {
        absolutePath,
        relativePathFromPrismaDir: path.relative(prismaDir, absolutePath),
      }
    }
  }

  return null
}

function findLatestBackupDatabase() {
  const backupsDir = path.join(prismaDir, 'backups')
  if (!fs.existsSync(backupsDir)) return null

  const latest = fs
    .readdirSync(backupsDir)
    .filter((entry) => entry.endsWith('.db'))
    .map((entry) => {
      const absolutePath = path.join(backupsDir, entry)
      return {
        absolutePath,
        relativePathFromPrismaDir: path.relative(prismaDir, absolutePath),
        modifiedAt: fs.statSync(absolutePath).mtimeMs,
      }
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]

  return latest ?? null
}

function ensureDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL?.trim()

  if (configuredUrl) {
    const resolved = resolveSqliteFile(configuredUrl)
    if (resolved) {
      const normalizedUrl = toSqliteFileUrl(resolved.relativePathFromPrismaDir)
      if (normalizedUrl !== configuredUrl) {
        process.env.DATABASE_URL = normalizedUrl
        logger.warn('Normalized sqlite DATABASE_URL to an existing local file.', {
          configuredUrl,
          normalizedUrl,
        })
      }
    }
    return
  }

  const primaryDevDb = path.join(prismaDir, 'dev.db')
  if (fs.existsSync(primaryDevDb)) {
    process.env.DATABASE_URL = toSqliteFileUrl('dev.db')
    logger.warn('DATABASE_URL was missing; defaulted to prisma/dev.db for local development.')
    return
  }

  const latestBackup = findLatestBackupDatabase()
  if (latestBackup) {
    process.env.DATABASE_URL = toSqliteFileUrl(latestBackup.relativePathFromPrismaDir)
    logger.warn('DATABASE_URL was missing; defaulted to the latest prisma backup for local development.', {
      databaseUrl: process.env.DATABASE_URL,
    })
  }
}

ensureDatabaseUrl()

const PRISMA_QUERY_LOGS_ENABLED =
  process.env.PRISMA_DISABLE_QUERY_LOGS === '1'
    ? false
    : process.argv.includes('--test') || process.execArgv.includes('--test')
      ? false
      : process.env.NODE_TEST_CONTEXT === 'child-v8'
        ? false
      : process.env.NODE_ENV === 'development'

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: PRISMA_QUERY_LOGS_ENABLED ? ['query', 'error', 'warn'] : ['error'],
})

// 开发环境保持全局实例
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// 连接数据库
export async function connectDatabase() {
  try {
    await prisma.$connect()
    logger.info('数据库连接成功')
  } catch (error) {
    logger.error('数据库连接失败', { error })
    throw error
  }
}

// 断开数据库
export async function disconnectDatabase() {
  await prisma.$disconnect()
  logger.info('数据库连接已断开')
}

// 健康检查
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
