import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { asyncHandler, AppError } from '../middleware/errorHandler'
import { MultiModalClient } from '../../shared/multimodal-client'

const router = Router()

// 获取所有模型配置
router.get('/', asyncHandler(async (req, res) => {
  const models = await prisma.modelConfig.findMany({
    orderBy: { createdAt: 'desc' }
  })

  res.json({
    success: true,
    data: models.map(m => ({
      ...m,
      parameters: JSON.parse(m.parameters),
      capabilities: JSON.parse(m.capabilities)
    }))
  })
}))

// 创建模型配置
router.post('/', asyncHandler(async (req, res) => {
  const data = req.body

  const model = await prisma.modelConfig.create({
    data: {
      modelId: data.id,
      name: data.name,
      provider: data.provider,
      model: data.model,
      apiKey: data.apiKey,
      baseUrl: data.baseUrl,
      parameters: JSON.stringify(data.parameters),
      capabilities: JSON.stringify(data.capabilities),
      enabled: data.enabled
    }
  })

  res.status(201).json({
    success: true,
    data: {
      ...model,
      parameters: JSON.parse(model.parameters),
      capabilities: JSON.parse(model.capabilities)
    }
  })
}))

// 更新模型配置
router.patch('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const data = req.body

  const updateData: any = {}
  if (data.name) updateData.name = data.name
  if (data.provider) updateData.provider = data.provider
  if (data.model) updateData.model = data.model
  if (data.apiKey) updateData.apiKey = data.apiKey
  if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl
  if (data.parameters) updateData.parameters = JSON.stringify(data.parameters)
  if (data.capabilities) updateData.capabilities = JSON.stringify(data.capabilities)
  if (data.enabled !== undefined) updateData.enabled = data.enabled

  const model = await prisma.modelConfig.update({
    where: { id },
    data: updateData
  })

  res.json({
    success: true,
    data: {
      ...model,
      parameters: JSON.parse(model.parameters),
      capabilities: JSON.parse(model.capabilities)
    }
  })
}))

// 删除模型配置
router.delete('/:id', asyncHandler(async (req, res) => {
  await prisma.modelConfig.delete({
    where: { id: req.params.id }
  })

  res.json({ success: true, message: '模型已删除' })
}))

// 测试模型连接
router.post('/:id/test', asyncHandler(async (req, res) => {
  const { id } = req.params

  const model = await prisma.modelConfig.findUnique({
    where: { id }
  })

  if (!model) throw new AppError(404, '模型不存在')

  // 构建配置
  const config = {
    models: [{
      id: model.modelId,
      name: model.name,
      provider: model.provider as any,
      model: model.model,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl || undefined,
      parameters: JSON.parse(model.parameters),
      capabilities: JSON.parse(model.capabilities),
      enabled: model.enabled
    }],
    taskMapping: {},
    fallbackStrategy: { enabled: false, retryCount: 0 }
  }

  try {
    const client = new MultiModalClient(config)
    const result = await client.testModel(model.modelId)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    res.json({
      success: true,
      data: {
        success: false,
        latency: 0,
        error: error instanceof Error ? error.message : '测试失败'
      }
    })
  }
}))

export default router
