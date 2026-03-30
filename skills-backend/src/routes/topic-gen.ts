/**
 * 主题生成 API 路由
 * 支持双语主题生成
 */

import { Router } from 'express'
import { createTopicGenerator } from '../services/topic-generator'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const router = Router()
const prisma = new PrismaClient()

const generateTopicSchema = z.object({
  description: z.string().min(10, '描述至少需要10个字符'),
  descriptionEn: z.string().optional(),
  language: z.enum(['zh', 'en', 'ja', 'ko', 'bilingual']).default('bilingual'),
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

const bilingualPrompt = `You are an academic research planning expert helping users crystallize research topics.

The user wants to research the following direction:

Primary Description (in Chinese/English): {description}

Please generate a bilingual research topic with the following information:
1. Topic Name in Chinese (中文主题名)
2. Topic Name in English (English Topic Name)
3. 3-5 Keywords (in both Chinese and English)
4. One-sentence topic description (in both Chinese and English)
5. Recommended number of research stages (3-5)

Return the result in this JSON format exactly:
{
  "nameZh": "中文主题名",
  "nameEn": "English Topic Name",
  "keywords": [
    {"zh": "中文关键词1", "en": "English Keyword 1"},
    {"zh": "中文关键词2", "en": "English Keyword 2"},
    {"zh": "中文关键词3", "en": "English Keyword 3"}
  ],
  "summary": "One-sentence description in English | 一句话中文描述",
  "recommendedStages": 5,
  "focusLabel": "Core focus area | 核心焦点"
}

IMPORTANT: Return ONLY the JSON object, no other text.`

router.post('/generate', async (req, res) => {
  try {
    const body = generateTopicSchema.parse(req.body)
    const llmClient = createLLMClient(body.provider)
    const generator = createTopicGenerator(llmClient)

    let result: any

    if (body.language === 'bilingual' || body.language === 'en') {
      const prompt = bilingualPrompt.replace('{description}', body.descriptionEn || body.description)

      const response = await llmClient.generate({
        prompt,
        temperature: 0.7,
        maxTokens: 2000,
      })

      result = parseBilingualResponse(response.text)

      if (body.descriptionEn && body.language === 'bilingual') {
        result.sourceDescription = body.description
        result.sourceDescriptionEn = body.descriptionEn
      } else {
        result.sourceDescription = body.description
      }
    } else {
      result = await generator.generate({
        description: body.description,
        language: body.language as 'zh' | 'en' | 'ja' | 'ko',
      })

      result.sourceDescription = body.description
      result.nameEn = result.nameEn || `${result.nameZh} (English)`
      result.keywords = result.keywords.map((kw: string, i: number) => ({
        zh: kw,
        en: `Keyword ${i + 1}`,
      }))
    }

    if (body.save) {
      const topic = await saveTopic(result, body.language)
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

function parseBilingualResponse(text: string): any {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0])

      return {
        nameZh: data.nameZh || data.name || '',
        nameEn: data.nameEn || '',
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        summary: data.summary || '',
        summaryZh: data.summaryZh || data.summary?.split('|')[1]?.trim() || '',
        summaryEn: data.summaryEn || data.summary?.split('|')[0]?.trim() || '',
        recommendedStages: data.recommendedStages || 5,
        focusLabel: data.focusLabel || '',
        focusLabelEn: data.focusLabelEn || data.focusLabel?.split('|')[0]?.trim() || '',
        focusLabelZh: data.focusLabelZh || data.focusLabel?.split('|')[1]?.trim() || '',
      }
    }
  } catch (e) {
    console.error('[Topic API] Parse error:', e)
  }

  return {
    nameZh: '',
    nameEn: '',
    keywords: [],
    summary: '',
    recommendedStages: 5,
  }
}

async function saveTopic(data: any, language: string) {
  const stageNames = language === 'zh' || language === 'bilingual'
    ? ['问题提出', '基础方法', '技术改进', '应用拓展', '综合分析']
    : ['Problem Formulation', 'Foundation', 'Technical Improvement', 'Application', 'Synthesis']

  const stageNamesEn = ['Problem Formulation', 'Foundation', 'Technical Improvement', 'Application', 'Synthesis']

  const stages = []
  for (let i = 0; i < (data.recommendedStages || 5); i++) {
    stages.push({
      order: i + 1,
      name: stageNames[i] || `Stage ${i + 1}`,
      nameEn: stageNamesEn[i] || `Stage ${i + 1}`,
      description: language === 'zh' || language === 'bilingual' ? `研究${stageNames[i]}` : `Research ${stageNames[i]}`,
      descriptionEn: `Research ${stageNamesEn[i]}`,
    })
  }

  const topic = await prisma.topic.create({
    data: {
      nameZh: data.nameZh,
      nameEn: data.nameEn,
      focusLabel: data.focusLabel || data.focusLabelZh || data.keywords?.[0]?.zh || '',
      summary: data.summary || data.summaryZh || '',
      description: data.sourceDescription || data.description || '',
      language,
      status: 'active',
      stages: {
        create: stages,
      },
    },
  })

  await prisma.systemConfig.upsert({
    where: { key: `topic:${topic.id}:keywords` },
    update: { value: JSON.stringify(data.keywords || []) },
    create: { key: `topic:${topic.id}:keywords`, value: JSON.stringify(data.keywords || []) },
  })

  if (data.summaryEn) {
    await prisma.systemConfig.upsert({
      where: { key: `topic:${topic.id}:summaryEn` },
      update: { value: data.summaryEn },
      create: { key: `topic:${topic.id}:summaryEn`, value: data.summaryEn },
    })
  }

  return topic
}

router.get('/languages', (req, res) => {
  res.json({
    success: true,
    data: [
      { code: 'zh', name: '简体中文', nativeName: '简体中文' },
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'bilingual', name: '双语模式', nativeName: 'Bilingual (中英双语)' },
      { code: 'ja', name: '日本語', nativeName: '日本語' },
      { code: 'ko', name: '한국어', nativeName: '한국어' },
    ],
  })
})

export default router
