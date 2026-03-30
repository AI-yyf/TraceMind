/**
 * 语言模板管理 API
 * 支持导入/导出/管理多语言提示词模板
 */

import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const router = Router()
const prisma = new PrismaClient()

const PROMPT_TEMPLATES_DIR = join(process.cwd(), 'prompts')

const defaultTemplates = {
  zh: {
    topicGeneration: {
      system: `你是一位学术研究策划专家，负责帮助用户凝练研究主题。

你的任务是：
1. 理解用户的研究兴趣描述
2. 生成精炼的主题名称（中英文）
3. 提取3-5个关键词
4. 确定主题的核心研究方向

请确保生成的主题：
- 具有学术价值
- 具有一定的前沿性
- 可以找到足够的相关论文`,
      user: `用户想要研究以下方向：

{userDescription}

请生成：
1. 主题名称（中文）
2. 主题名称（English）
3. 3-5个关键词
4. 一句话主题描述
5. 推荐的研究阶段数量（3-5个）

以 JSON 格式返回。`,
    },
    discovery: {
      system: `你是一位专业的学术研究追踪专家，负责从海量论文中发现与特定主题相关的最新研究。

你的任务是：
1. 理解研究主题的核心问题和方法
2. 生成精准的搜索查询
3. 评估论文与主题的相关性
4. 识别研究的演进脉络

请始终保持学术严谨性，给出有理有据的判断。`,
      user: `请为以下研究主题生成搜索查询：

主题：{topic}
描述：{description}
当前阶段：{stage}

请生成 3-5 个搜索查询，覆盖：
1. 核心问题
2. 方法变体
3. 跨领域应用

以 JSON 格式返回。`,
    },
    classification: {
      system: `你是一位学术论文分类专家，负责将论文分配到正确的研究阶段。

研究阶段定义：
{stageDefinitions}

你的任务是判断论文最属于哪个阶段，并给出置信度。`,
      user: `请判断以下论文属于哪个研究阶段：

论文标题：{title}
论文摘要：{abstract}
论文发表时间：{published}

请返回阶段索引（从1开始）和置信度（0-1）。`,
    },
  },
  en: {
    topicGeneration: {
      system: `You are an academic research planning expert, responsible for helping users crystallize research topics.

Your tasks are:
1. Understand the user's research interest description
2. Generate refined topic names (Chinese and English)
3. Extract 3-5 keywords
4. Determine the core research direction

Please ensure the generated topics:
- Have academic value
- Have certain frontier characteristics
- Can find enough related papers`,
      user: `The user wants to research the following direction:

{userDescription}

Please generate:
1. Topic name (Chinese)
2. Topic name (English)
3. 3-5 keywords
4. One-sentence topic description
5. Recommended number of research stages (3-5)

Return in JSON format.`,
    },
    discovery: {
      system: `You are a professional academic research tracking expert, responsible for discovering the latest research related to a specific topic from a vast amount of papers.

Your tasks are:
1. Understand the core problems and methods of the research topic
2. Generate precise search queries
3. Evaluate the relevance of papers to the topic
4. Identify the evolution of research

Please always maintain academic rigor and provide well-reasoned judgments.`,
      user: `Please generate search queries for the following research topic:

Topic: {topic}
Description: {description}
Current Stage: {stage}

Please generate 3-5 search queries covering:
1. Core problems
2. Method variants
3. Cross-domain applications

Return in JSON format.`,
    },
    classification: {
      system: `You are an academic paper classification expert, responsible for assigning papers to the correct research stage.

Research Stage Definitions:
{stageDefinitions}

Your task is to determine which stage the paper most belongs to and provide confidence.`,
      user: `Please determine which research stage the following paper belongs to:

Paper Title: {title}
Paper Abstract: {abstract}
Paper Published: {published}

Please return the stage index (starting from 1) and confidence (0-1).`,
    },
  },
}

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  language: z.string(),
  category: z.enum(['topicGeneration', 'discovery', 'classification', 'content', 'custom']),
  system: z.string(),
  user: z.string(),
})

/**
 * 获取所有语言
 */
router.get('/languages', (req, res) => {
  res.json({
    success: true,
    data: [
      { code: 'zh', name: '简体中文', nativeName: '简体中文', isDefault: true },
      { code: 'en', name: 'English', nativeName: 'English', isDefault: true },
      { code: 'ja', name: '日本語', nativeName: '日本語', isDefault: false },
      { code: 'ko', name: '한국어', nativeName: '한국어', isDefault: false },
    ],
  })
})

/**
 * 获取所有模板
 */
router.get('/templates', async (req, res) => {
  try {
    const { language, category } = req.query

    const where: any = {}
    if (language) where.language = language as string
    if (category) where.category = category as string

    const templates = await prisma.systemConfig.findMany({
      where: {
        key: { startsWith: 'prompt-template:' },
        ...where,
      },
    })

    const result = templates.map(t => {
      try {
        return JSON.parse(t.value)
      } catch {
        return null
      }
    }).filter(Boolean)

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('[Template API] List error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to list templates',
    })
  }
})

/**
 * 获取默认模板
 */
router.get('/templates/defaults', (req, res) => {
  const { language } = req.query

  if (language && defaultTemplates[language as keyof typeof defaultTemplates]) {
    return res.json({
      success: true,
      data: defaultTemplates[language as keyof typeof defaultTemplates],
    })
  }

  res.json({
    success: true,
    data: defaultTemplates,
  })
})

/**
 * 获取单个模板
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params

    const config = await prisma.systemConfig.findUnique({
      where: { key: `prompt-template:${id}` },
    })

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      })
    }

    res.json({
      success: true,
      data: JSON.parse(config.value),
    })
  } catch (error) {
    console.error('[Template API] Get error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get template',
    })
  }
})

/**
 * 创建/更新模板
 */
router.post('/templates', async (req, res) => {
  try {
    const body = templateSchema.parse(req.body)

    const templateData = {
      ...body,
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    }

    await prisma.systemConfig.upsert({
      where: { key: `prompt-template:${body.id}` },
      update: { value: JSON.stringify(templateData) },
      create: { key: `prompt-template:${body.id}`, value: JSON.stringify(templateData) },
    })

    res.json({
      success: true,
      data: templateData,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      })
    }

    console.error('[Template API] Create error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create template',
    })
  }
})

/**
 * 删除模板
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params

    const config = await prisma.systemConfig.findUnique({
      where: { key: `prompt-template:${id}` },
    })

    if (config) {
      const template = JSON.parse(config.value)
      if (template.isBuiltIn) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete built-in template',
        })
      }
    }

    await prisma.systemConfig.delete({
      where: { key: `prompt-template:${id}` },
    })

    res.json({ success: true })
  } catch (error) {
    console.error('[Template API] Delete error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete template',
    })
  }
})

/**
 * 导入模板（JSON 文件）
 */
router.post('/templates/import', async (req, res) => {
  try {
    const { templates } = req.body

    if (!Array.isArray(templates)) {
      return res.status(400).json({
        success: false,
        error: 'Templates must be an array',
      })
    }

    const imported: any[] = []
    const errors: string[] = []

    for (const template of templates) {
      try {
        const validated = templateSchema.parse(template)
        const templateData = {
          ...validated,
          isBuiltIn: false,
          updatedAt: new Date().toISOString(),
        }

        await prisma.systemConfig.upsert({
          where: { key: `prompt-template:${validated.id}` },
          update: { value: JSON.stringify(templateData) },
          create: { key: `prompt-template:${validated.id}`, value: JSON.stringify(templateData) },
        })

        imported.push(validated)
      } catch (e) {
        errors.push(`Template ${template.id || 'unknown'}: ${e instanceof Error ? e.message : 'Validation failed'}`)
      }
    }

    res.json({
      success: true,
      data: {
        imported: imported.length,
        errors: errors.length,
        details: errors,
      },
    })
  } catch (error) {
    console.error('[Template API] Import error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to import templates',
    })
  }
})

/**
 * 导出模板
 */
router.get('/templates/export/:language?', async (req, res) => {
  try {
    const { language } = req.params

    const where: any = {
      key: { startsWith: 'prompt-template:' },
    }
    if (language) {
      where.language = language
    }

    const templates = await prisma.systemConfig.findMany({ where })

    const result = templates.map(t => {
      try {
        return JSON.parse(t.value)
      } catch {
        return null
      }
    }).filter(Boolean)

    res.json({
      success: true,
      data: result,
      exportedAt: new Date().toISOString(),
      language: language || 'all',
    })
  } catch (error) {
    console.error('[Template API] Export error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to export templates',
    })
  }
})

/**
 * 重置为默认模板
 */
router.post('/templates/reset/:language', async (req, res) => {
  try {
    const { language } = req.params

    const defaults = defaultTemplates[language as keyof typeof defaultTemplates]
    if (!defaults) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported language',
      })
    }

    const templatesToReset = [
      { id: `${language}-topicGeneration`, category: 'topicGeneration', ...defaults.topicGeneration },
      { id: `${language}-discovery`, category: 'discovery', ...defaults.discovery },
      { id: `${language}-classification`, category: 'classification', ...defaults.classification },
    ]

    for (const template of templatesToReset) {
      const templateData = {
        ...template,
        language,
        name: `${language}-${template.category}`,
        description: `Default ${template.category} template for ${language}`,
        isBuiltIn: true,
        updatedAt: new Date().toISOString(),
      }

      await prisma.systemConfig.upsert({
        where: { key: `prompt-template:${template.id}` },
        update: { value: JSON.stringify(templateData) },
        create: { key: `prompt-template:${template.id}`, value: JSON.stringify(templateData) },
      })
    }

    res.json({
      success: true,
      data: {
        reset: templatesToReset.length,
        language,
      },
    })
  } catch (error) {
    console.error('[Template API] Reset error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to reset templates',
    })
  }
})

export default router
