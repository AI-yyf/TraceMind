import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

// Prisma 客户端全局实例
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn']
    : ['error'],
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
