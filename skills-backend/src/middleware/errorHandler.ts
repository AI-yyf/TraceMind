import { Prisma } from '@prisma/client'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { logger } from '../utils/logger'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
  ) {
    super(message)
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let statusCode = 500
  let message = 'Internal server error.'
  let isOperational = false

  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
    isOperational = err.isOperational
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = 400
    isOperational = true

    switch (err.code) {
      case 'P2002':
        message = 'Data already exists.'
        break
      case 'P2025':
        message = 'Requested data was not found.'
        statusCode = 404
        break
      case 'P2003':
        message = 'Foreign key constraint failed.'
        break
      default:
        message = 'Database request failed.'
        break
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400
    message = 'Database validation failed.'
    isOperational = true
  }

  if (!isOperational) {
    logger.error('Unhandled server error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
    })
  } else {
    logger.warn('Operational error', {
      statusCode,
      message,
      path: req.path,
      method: req.method,
    })
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      originalError: err.message,
    }),
  })
}

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
