import { PrismaClient } from '@prisma/client'

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
