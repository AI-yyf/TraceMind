import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { AppError, asyncHandler } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import { UpdateConfigSchema } from './schemas'

const router = Router()
const PUBLIC_CONFIG_KEY_PREFIXES = ['public:', 'feature:', 'ui:', 'app:public:'] as const

function parseStoredConfigValue(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function isPublicConfigKey(key: string) {
  const normalized = key.trim()
  return PUBLIC_CONFIG_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function assertPublicConfigKey(key: string) {
  if (!isPublicConfigKey(key)) {
    throw new AppError(403, 'This config key is not available through the public config route.')
  }
}

function buildPublicConfigWhere() {
  return {
    OR: PUBLIC_CONFIG_KEY_PREFIXES.map((prefix) => ({
      key: {
        startsWith: prefix,
      },
    })),
  }
}

// 获取系统配置
router.get('/', asyncHandler(async (req, res) => {
  const configs = await prisma.system_configs.findMany({
    where: buildPublicConfigWhere(),
  })
  const configMap = configs.reduce((acc: Record<string, unknown>, c) => {
    acc[c.key] = parseStoredConfigValue(c.value)
    return acc
  }, {})

  res.json({ success: true, data: configMap })
}))

// 获取特定配置
router.get('/:key', asyncHandler(async (req, res) => {
  assertPublicConfigKey(req.params.key)
  const config = await prisma.system_configs.findUnique({
    where: { key: req.params.key }
  })
  
  if (!config) {
    return res.json({ success: true, data: null })
  }

  res.json({ success: true, data: parseStoredConfigValue(config.value) })
}))

// 更新配置
router.post('/:key', validate(UpdateConfigSchema), asyncHandler(async (req, res) => {
  const { key } = req.params
  const { value } = req.body
  assertPublicConfigKey(key)

  const config = await prisma.system_configs.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { id: crypto.randomUUID(), key, value: JSON.stringify(value), updatedAt: new Date() }
  })

  res.json({ success: true, data: config })
}))

export default router
