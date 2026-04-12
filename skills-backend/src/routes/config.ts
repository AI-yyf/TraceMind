import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../middleware/errorHandler'

const router = Router()

// 获取系统配置
router.get('/', asyncHandler(async (req, res) => {
  const configs = await prisma.system_configs.findMany()
  const configMap = configs.reduce((acc, c) => {
    acc[c.key] = JSON.parse(c.value)
    return acc
  }, {} as any)

  res.json({ success: true, data: configMap })
}))

// 获取特定配置
router.get('/:key', asyncHandler(async (req, res) => {
  const config = await prisma.system_configs.findUnique({
    where: { key: req.params.key }
  })
  
  if (!config) {
    return res.json({ success: true, data: null })
  }

  res.json({ success: true, data: JSON.parse(config.value) })
}))

// 更新配置
router.post('/:key', asyncHandler(async (req, res) => {
  const { key } = req.params
  const { value } = req.body

  const config = await prisma.system_configs.upsert({
    where: { key },
    update: { value: JSON.stringify(value) },
    create: { id: crypto.randomUUID(), key, value: JSON.stringify(value), updatedAt: new Date() }
  })

  res.json({ success: true, data: config })
}))

export default router
