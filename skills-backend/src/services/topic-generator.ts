/**
 * 主题生成服务
 * 根据用户描述，使用 LLM 自动生成主题名称、关键词等
 */

import { buildPrompt, PROMPT_MODULES } from './prompt-templates'
import type { Language } from './prompt-templates'

export interface TopicGenerationInput {
  description: string
  language: Language
}

export interface TopicGenerationOutput {
  nameZh: string
  nameEn: string
  keywords: string[]
  summary: string
  recommendedStages: number
  focusLabel?: string
}

export interface LLMClient {
  generate: (params: {
    prompt: string
    temperature: number
    maxTokens: number
  }) => Promise<{ text: string }>
}

export class TopicGenerator {
  constructor(private llmClient: LLMClient) {}

  /**
   * 从用户描述生成主题
   */
  async generate(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
    const systemPrompt = buildPrompt(
      PROMPT_MODULES.TOPIC_GENERATION_SYSTEM,
      input.language,
      {}
    )

    const userPrompt = buildPrompt(
      PROMPT_MODULES.TOPIC_GENERATION_USER,
      input.language,
      { userDescription: input.description }
    )

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`

    const response = await this.llmClient.generate({
      prompt: fullPrompt,
      temperature: 0.7,
      maxTokens: 1000,
    })

    return this.parseResponse(response.text, input.language)
  }

  /**
   * 解析 LLM 响应
   */
  private parseResponse(text: string, language: Language): TopicGenerationOutput {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0])
        return {
          nameZh: data['主题名称（中文）'] || data['Topic name (Chinese)'] || data.nameZh || '',
          nameEn: data['主题名称（English）'] || data['Topic name (English)'] || data.nameEn || '',
          keywords: data['关键词'] || data['Keywords'] || data.keywords || [],
          summary: data['一句话主题描述'] || data['One-sentence topic description'] || data.summary || '',
          recommendedStages: data['推荐的研究阶段数量'] || data['Recommended number of research stages'] || data.recommendedStages || 5,
          focusLabel: data.focusLabel,
        }
      }
    } catch (e) {
      console.error('[TopicGenerator] Parse error:', e)
    }

    return this.generateFallback(text, language)
  }

  /**
   * 解析失败时的后备方案
   */
  private generateFallback(text: string, _language: Language): TopicGenerationOutput {
    const lines = text.split('\n').filter(l => l.trim())

    const result: TopicGenerationOutput = {
      nameZh: '',
      nameEn: '',
      keywords: [],
      summary: '',
      recommendedStages: 5,
    }

    for (const line of lines) {
      if (line.includes('主题') || line.includes('Topic')) {
        const match = line.match(/[:：]\s*(.+)/)
        if (match) {
          if (!result.nameZh) result.nameZh = match[1].trim()
          else if (!result.nameEn) result.nameEn = match[1].trim()
        }
      }
      if (line.includes('关键词') || line.includes('Keyword')) {
        const keywords = line.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g)
        if (keywords) result.keywords = keywords.slice(0, 5)
      }
    }

    return result
  }
}

/**
 * 创建主题生成器
 */
export function createTopicGenerator(llmClient: LLMClient): TopicGenerator {
  return new TopicGenerator(llmClient)
}
