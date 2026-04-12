/**
 * 主题生成 CLI
 * 根据用户描述自动生成主题配置
 *
 * 用法：
 * npm run topic:generate -- --description="我想研究大语言模型在自动驾驶中的应用"
 */

import { createTopicGenerator, type TopicGenerationOutput } from '../services/topic-generator'
import type { Language } from '../services/prompt-templates'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface LLMClient {
  generate: (params: { prompt: string; temperature: number; maxTokens: number }) => Promise<{ text: string }>
}

function createOpenAIClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  return {
    async generate(params) {
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

function createAnthropicClient(): LLMClient {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  return {
    async generate(params) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
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

function createLLMClient(provider?: string): LLMClient {
  switch (provider) {
    case 'anthropic':
      return createAnthropicClient()
    case 'openai':
    default:
      return createOpenAIClient()
  }
}

async function generateTopic(
  description: string,
  language: Language,
  provider?: string
): Promise<TopicGenerationOutput> {
  const llmClient = createLLMClient(provider)
  const generator = createTopicGenerator(llmClient)

  console.log(`[CLI] Generating topic for: ${description.substring(0, 50)}...`)
  console.log(`[CLI] Language: ${language}`)

  const result = await generator.generate({ description, language })

  console.log('[CLI] Generated topic:')
  console.log(`  Name (ZH): ${result.nameZh}`)
  console.log(`  Name (EN): ${result.nameEn}`)
  console.log(`  Keywords: ${result.keywords.join(', ')}`)
  console.log(`  Summary: ${result.summary}`)
  console.log(`  Recommended Stages: ${result.recommendedStages}`)

  return result
}

async function saveTopicToDB(
  topicData: TopicGenerationOutput,
  language: Language,
  userDescription: string
): Promise<string> {
  const stages = []
  const stageNames = language === 'zh'
    ? ['问题提出', '基础方法', '技术改进', '应用拓展', '综合分析']
    : ['Problem Formulation', 'Foundation', 'Technical Improvement', 'Application', 'Synthesis']

  for (let i = 0; i < topicData.recommendedStages; i++) {
    stages.push({
      order: i + 1,
      name: stageNames[i] || `Stage ${i + 1}`,
      description: language === 'zh' ? `研究${stageNames[i]}` : `Research ${stageNames[i]}`,
    })
  }

  const topic = await prisma.topics.create({
    data: {
      id: crypto.randomUUID(),
      updatedAt: new Date(),
      nameZh: topicData.nameZh,
      nameEn: topicData.nameEn,
      focusLabel: topicData.focusLabel || topicData.keywords[0] || '',
      summary: topicData.summary,
      description: userDescription,
      status: 'active',
    },
  })

  // Create topic stages separately
  await prisma.topic_stages.createMany({
    data: stages.map((stage) => ({
      id: crypto.randomUUID(),
      topicId: topic.id,
      order: stage.order,
      name: stage.name,
      description: stage.description,
    })),
  })

  await prisma.system_configs.upsert({
    where: { key: `topic:${topic.id}:language` },
    update: { value: language, updatedAt: new Date() },
    create: { id: crypto.randomUUID(), key: `topic:${topic.id}:language`, value: language, updatedAt: new Date() },
  })

  return topic.id
}

async function main() {
  const args = process.argv.slice(2)
  const commands = args.reduce((acc, arg) => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      acc[key] = value || true
    }
    return acc
  }, {} as Record<string, string | boolean>)

  if (commands.help || commands.h || !commands.description) {
    console.log(`
主题生成 CLI

用法：
  npm run topic:generate -- --description="你的研究方向描述" [选项]

选项：
  --description=<text>  研究方向描述（必填）
  --language=<code>     语言: zh, en, ja, ko (默认: zh)
  --provider=<name>     LLM 提供商: openai, anthropic (默认: openai)
  --save               保存到数据库
  --dry-run            仅生成不保存

示例：
  # 生成主题
  npm run topic:generate -- --description="我想研究大语言模型在自动驾驶中的应用"

  # 生成并保存
  npm run topic:generate -- --description="大语言模型在自动驾驶中的应用" --save --language=zh

  # 使用英文
  npm run topic:generate -- --description="Application of LLMs in autonomous driving" --language=en --save
    `)
    process.exit(0)
  }

  const description = commands.description as string
  const language = (commands.language as Language) || 'zh'
  const provider = commands.provider as string | undefined
  const shouldSave = !!commands.save
  const dryRun = !!commands.dryRun

  try {
    const result = await generateTopic(description, language, provider)

    if (shouldSave && !dryRun) {
      const topicId = await saveTopicToDB(result, language, description)
      console.log(`[CLI] Topic saved with ID: ${topicId}`)
    } else if (dryRun) {
      console.log('[CLI] Dry run - not saving to database')
    }
  } catch (error) {
    console.error('[CLI] Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
