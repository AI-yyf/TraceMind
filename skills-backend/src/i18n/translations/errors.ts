/**
 * Error message translations for backend.
 * Keys match frontend structure where possible.
 */

import type { TranslationDictionary } from '../index'

const translations: TranslationDictionary = {
  // Generic errors
  'error.internal': {
    zh: '服务器内部错误',
    en: 'Internal server error',
  },
  'error.notFound': {
    zh: '请求的资源不存在',
    en: 'Requested resource not found',
  },
  'error.badRequest': {
    zh: '请求参数无效',
    en: 'Invalid request parameters',
  },
  'error.unauthorized': {
    zh: '未授权访问',
    en: 'Unauthorized access',
  },
  'error.forbidden': {
    zh: '禁止访问',
    en: 'Access forbidden',
  },
  'error.timeout': {
    zh: '请求超时',
    en: 'Request timeout',
  },
  'error.rateLimit': {
    zh: '请求过于频繁，请稍后重试',
    en: 'Too many requests, please try again later',
  },

  // Database errors
  'error.database.connection': {
    zh: '数据库连接失败',
    en: 'Database connection failed',
  },
  'error.database.query': {
    zh: '数据库查询失败',
    en: 'Database query failed',
  },
  'error.database.validation': {
    zh: '数据验证失败',
    en: 'Data validation failed',
  },
  'error.database.duplicate': {
    zh: '数据已存在',
    en: 'Data already exists',
  },
  'error.database.notFound': {
    zh: '数据未找到',
    en: 'Data not found',
  },
  'error.database.foreignKey': {
    zh: '关联数据不存在',
    en: 'Related data not found',
  },

  // Research errors
  'error.research.topicNotFound': {
    zh: '主题不存在',
    en: 'Topic not found',
  },
  'error.research.nodeNotFound': {
    zh: '节点不存在',
    en: 'Node not found',
  },
  'error.research.paperNotFound': {
    zh: '论文不存在',
    en: 'Paper not found',
  },
  'error.research.taskNotFound': {
    zh: '任务不存在',
    en: 'Task not found',
  },
  'error.research.taskFailed': {
    zh: '研究任务执行失败',
    en: 'Research task execution failed',
  },
  'error.research.taskTimeout': {
    zh: '研究任务执行超时',
    en: 'Research task execution timeout',
  },
  'error.research.invalidConfig': {
    zh: '研究配置无效',
    en: 'Invalid research configuration',
  },
  'error.research.schedulerError': {
    zh: '调度器错误',
    en: 'Scheduler error',
  },

  // Paper processing errors
  'error.paper.fetchFailed': {
    zh: '论文获取失败',
    en: 'Failed to fetch paper',
  },
  'error.paper.parseFailed': {
    zh: '论文解析失败',
    en: 'Failed to parse paper',
  },
  'error.paper.extractFailed': {
    zh: '论文内容提取失败',
    en: 'Failed to extract paper content',
  },
  'error.paper.pdfNotFound': {
    zh: 'PDF文件不存在',
    en: 'PDF file not found',
  },
  'error.paper.pdfTooLarge': {
    zh: 'PDF文件过大',
    en: 'PDF file too large',
  },

  // Model/AI errors
  'error.model.notConfigured': {
    zh: '模型未配置',
    en: 'Model not configured',
  },
  'error.model.invalidConfig': {
    zh: '模型配置无效',
    en: 'Invalid model configuration',
  },
  'error.model.apiError': {
    zh: '模型API调用失败',
    en: 'Model API call failed',
  },
  'error.model.rateLimit': {
    zh: '模型API请求频率超限',
    en: 'Model API rate limit exceeded',
  },
  'error.model.timeout': {
    zh: '模型响应超时',
    en: 'Model response timeout',
  },
  'error.model.contentFilter': {
    zh: '内容被安全过滤器拦截',
    en: 'Content blocked by safety filter',
  },

  // Search errors
  'error.search.failed': {
    zh: '搜索失败',
    en: 'Search failed',
  },
  'error.search.noResults': {
    zh: '未找到相关结果',
    en: 'No results found',
  },
  'error.search.providerError': {
    zh: '搜索服务提供商错误',
    en: 'Search provider error',
  },

  // File errors
  'error.file.notFound': {
    zh: '文件不存在',
    en: 'File not found',
  },
  'error.file.invalidType': {
    zh: '文件类型无效',
    en: 'Invalid file type',
  },
  'error.file.tooLarge': {
    zh: '文件过大',
    en: 'File too large',
  },
  'error.file.uploadFailed': {
    zh: '文件上传失败',
    en: 'File upload failed',
  },

  // Validation errors
  'error.validation.required': {
    zh: '必填字段缺失',
    en: 'Required field missing',
  },
  'error.validation.invalidFormat': {
    zh: '格式无效',
    en: 'Invalid format',
  },
  'error.validation.outOfRange': {
    zh: '值超出范围',
    en: 'Value out of range',
  },
  'error.validation.invalidEnum': {
    zh: '无效的枚举值',
    en: 'Invalid enum value',
  },
}

export default translations
