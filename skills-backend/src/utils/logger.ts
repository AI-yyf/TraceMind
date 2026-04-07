import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { fileURLToPath } from 'url'

const { combine, timestamp, printf, colorize, errors } = winston.format
const currentDir = path.dirname(fileURLToPath(import.meta.url))

// 自定义日志格式
const customFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`
  }
  
  if (stack) {
    msg += `\n${stack}`
  }
  
  return msg
})

// 控制台格式
const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  customFormat
)

// 文件格式
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  customFormat
)

// 创建日志目录
const logDir = path.join(currentDir, '../../logs')

//  transports
const transports: winston.transport[] = [
  // 控制台输出
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  })
]

// 生产环境添加文件日志
if (process.env.NODE_ENV === 'production') {
  transports.push(
    // 错误日志
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat
    }),
    // 综合日志
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat
    })
  )
}

// 创建 logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'research-tracker' },
  transports,
  exitOnError: false
})

// 流接口（用于 morgan）
export const logStream = {
  write: (message: string) => {
    logger.info(message.trim())
  }
}
