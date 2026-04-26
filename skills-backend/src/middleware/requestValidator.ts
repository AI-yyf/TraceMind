import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { AppError } from './errorHandler'

// 请求验证中间件
export const requestValidator = (req: Request, res: Response, next: NextFunction) => {
  // 验证 Content-Type
  if (req.method !== 'GET' && req.headers['content-type'] !== 'application/json') {
    if (req.path.startsWith('/uploads')) {
      return next()
    }
  }

  // 清理请求数据
  if (req.body && typeof req.body === 'object') {
    // 移除潜在的恶意字段
    delete req.body.__proto__
    delete req.body.constructor
    delete req.body.prototype
  }

  next()
}

// 创建验证中间件
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      })

      if (typeof validated === 'object' && validated !== null) {
        if ('body' in validated && validated.body !== undefined) {
          req.body = validated.body
        }
        if ('query' in validated && validated.query !== undefined) {
          req.query = validated.query
        }
        if ('params' in validated && validated.params !== undefined) {
          req.params = validated.params
        }
      }
      
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        next(new AppError(400, `验证失败: ${messages.join(', ')}`))
      } else {
        next(error)
      }
    }
  }
}

// 常用验证模式
export const commonSchemas = {
  uuid: z.string().uuid(),
  pagination: z.object({
    page: z.string().optional().default('1').transform(Number),
    limit: z.string().optional().default('20').transform(Number)
  }),
  idParam: z.object({
    params: z.object({
      id: z.string().uuid()
    })
  })
}
