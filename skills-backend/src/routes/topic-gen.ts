/**
 * 主题生成 API 路由
 */

import { Router } from 'express'
import { createTopicGenerator } from '../services/topic-generator'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient()

const generateTopicSchema = z.object({
  description: z.string().min(10, '描述至少需要10个字符'),
  language: z.enum(['zh', 'en', 'ja', 'ko']).default('zh'),
  provider: z.enum(['openai', 'anthropic']).optional(),
  save: z.boolean().default(false),
})

function createLLMClient(provider?: 'openai' | 'anthropic') {
  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  if (provider === 'anthropic') {
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    return {
      async generate(params: { prompt: string; temperature: number; maxTokens: number }) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
            messages: [{ role: 'user', content: params.prompt }],
            temperature: params.temperature,
            max_tokens: params.maxTokens,
          }),
        })

        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status}`)
        }

        const data = await response.json() as { content: Array<{ text: string }> }
        return { text: data.content[0]?.text || '' }
      },
    }
  }

  return {
    async generate(params: { prompt: string; temperature: number; maxTokens: number }) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: [{ role: 'user', content: params.prompt }],
          temperature: params.temperature,
          max_tokens: params.maxTokens,
        }),
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> }
      return { text: data.choices[0]?.message?.content || '' }
    },
  }
}

router.post('/generate', async (req, res) => {
  try {
    const body = generateTopicSchema.parse(req.body)
    const llmClient = createLLMClient(body.provider)
    const generator = createTopicGenerator(llmClient)

    const result = await generator.generate({
      description: body.description,
      language: body.language,
    })

    if (body.save) {
      const stageNames = body.language === 'zh'
        ? ['问题提出', '基础方法', '技术改进', '应用拓展', '综合分析']
        : ['Problem Formulation', 'Foundation', 'Technical Improvement', 'Application', 'Synthesis']

      const stages = []
      for (let i = 0; i < result.recommendedStages; i++) {
        stages.push({
          order: i + 1,
          name: stageNames[i] || `Stage ${i + 1}`,
          description: body.language === 'zh' ? `研究${stageNames[i]}` : `Research ${stageNames[i]}`,
        })
      }

      const topic = await prisma.topic.create({
        data: {
          nameZh: result.nameZh,
          nameEn: result.nameEn,
          focusLabel: result.focusLabel || result.keywords[0] || '',
          summary: result.summary,
          description: body.description,
          language: body.language,
          status: 'active',
          stages: {
            create: stages,
          },
        },
      })

      return res.json({
        success: true,
        data: result,
        topicId: topic.id,
      })
    }

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      })
    }

    console.error('[Topic API] Generate error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    })
  }
})

router.get('/languages', (req, res) => {
  res.json({
    success: true,
    data: [
      { code: 'zh', name: '简体中文', nativeName: '简体中文' },
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'ja', name: '日本語', nativeName: '日本語' },
      { code: 'ko', name: '한국어', nativeName: '한국어' },
    ],
  })
})

export default router
