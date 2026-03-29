import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'
import { Prisma } from '@prisma/client'

// 自定义错误类
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message)
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

// 错误处理中间件
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 默认错误
  let statusCode = 500
  let message = '服务器内部错误'
  let isOperational = false

  // 处理自定义错误
  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
    isOperational = err.isOperational
  }

  // 处理 Prisma 错误
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = 400
    isOperational = true
    
    switch (err.code) {
      case 'P2002':
        message = '数据已存在'
        break
      case 'P2025':
        message = '数据不存在'
        statusCode = 404
        break
      case 'P2003':
        message = '外键约束失败'
        break
      default:
        message = '数据库操作失败'
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400
    message = '数据验证失败'
    isOperational = true
  }

  // 记录错误
  if (!isOperational) {
    logger.error('服务器错误', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params
    })
  } else {
    logger.warn('操作错误', {
      statusCode,
      message,
      path: req.path,
      method: req.method
    })
  }

  // 响应客户端
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      originalError: err.message
    })
  })
}

// 异步错误包装器
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
