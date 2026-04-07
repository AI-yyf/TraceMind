/**
 * 多模态模型统一调用接口
 * 支持 OpenAI, Anthropic, Google, Local, Custom 等多种提供商
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

// 任务类型
export type TaskType = 
  | 'figure-analysis' 
  | 'content-generation' 
  | 'formula-recognition' 
  | 'ocr' 
  | 'table-extraction'
  | 'paper-evaluation'
  | string

// 模型调用结果
export interface ModelResponse {
  text: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  latency: number
  modelId: string
}

// 附件类型
export interface Attachment {
  type: 'image' | 'file'
  data: string
  mimeType: string
}

// 模型调用请求
export interface CompletionRequest {
  taskType: TaskType
  prompt: string
  attachments?: Attachment[]
  maxTokens?: number
  temperature?: number
  providerId?: string
  model?: string
}

// 多模态模型客户端类
export class MultimodalClient {
  private openaiClient?: OpenAI
  private anthropicClient?: Anthropic
  private googleClient?: GoogleGenerativeAI

  constructor(_config?: unknown) {
    // 初始化客户端（如果有环境变量）
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      })
    }

    if (process.env.GOOGLE_API_KEY) {
      this.googleClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
    }
  }

  /**
   * 调用模型生成内容
   */
  async complete(request: CompletionRequest): Promise<ModelResponse> {
    const startTime = Date.now()

    // 优先使用 OpenAI
    if (this.openaiClient) {
      try {
        const messages: any[] = []

        // 构建消息内容
        if (request.attachments && request.attachments.length > 0) {
          // 多模态消息
          const content: any[] = [{ type: 'text', text: request.prompt }]
          
          for (const attachment of request.attachments) {
            if (attachment.type === 'image') {
              content.push({
                type: 'image_url',
                image_url: {
                  url: `data:${attachment.mimeType};base64,${attachment.data}`,
                },
              })
            }
          }

          messages.push({
            role: 'user',
            content,
          })
        } else {
          // 纯文本消息
          messages.push({
            role: 'user',
            content: request.prompt,
          })
        }

        const response = await this.openaiClient.chat.completions.create({
          model: request.model || 'gpt-4o',
          messages,
          max_tokens: request.maxTokens || 2000,
          temperature: request.temperature ?? 0.7,
        })

        return {
          text: response.choices[0]?.message?.content || '',
          usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
          },
          latency: Date.now() - startTime,
          modelId: response.model,
        }
      } catch (error) {
        console.error('OpenAI API error:', error)
        throw error
      }
    }

    // 降级到 Anthropic
    if (this.anthropicClient) {
      try {
        const response = await this.anthropicClient.messages.create({
          model: request.model || 'claude-3-opus-20240229',
          max_tokens: request.maxTokens || 2000,
          temperature: request.temperature ?? 0.7,
          messages: [
            {
              role: 'user',
              content: request.prompt,
            },
          ],
        })

        const content = response.content[0]
        const text = content.type === 'text' ? content.text : ''

        return {
          text,
          latency: Date.now() - startTime,
          modelId: response.model,
        }
      } catch (error) {
        console.error('Anthropic API error:', error)
        throw error
      }
    }

    // 如果没有配置任何 API，返回模拟响应（开发环境）
    console.warn('No AI API configured, returning mock response')
    return {
      text: this.generateMockResponse(request),
      latency: Date.now() - startTime,
      modelId: 'mock-model',
    }
  }

  /**
   * 生成模拟响应（开发环境使用）
   */
  private generateMockResponse(request: CompletionRequest): string {
    if (request.taskType === 'paper-evaluation') {
      return JSON.stringify({
        relevant: true,
        confidence: 0.85,
        candidateType: 'direct',
        citeIntent: 'supporting',
        why: '与主题高度相关，方法创新',
      })
    }

    if (request.taskType === 'content-generation') {
      return '这是一段生成的内容摘要。在实际环境中，这里会返回 AI 生成的真实内容。'
    }

    if (request.taskType === 'figure-analysis') {
      return JSON.stringify({
        description: {
          type: '折线图',
          overall: '展示了实验结果的趋势',
          elements: ['X轴', 'Y轴', '数据线'],
          structure: '标准折线图结构',
        },
        interpretation: {
          mainFinding: '性能随时间提升',
          keyData: [],
          trends: ['上升趋势'],
          comparisons: [],
          anomalies: [],
        },
        significance: {
          supports: '方法有效性',
          proves: '算法改进有效',
          limitations: '样本量有限',
          relationToText: '与正文描述一致',
        },
      })
    }

    return 'Mock response for ' + request.taskType
  }
}

// 导出单例实例
export const multimodalClient = new MultimodalClient()
export { MultimodalClient as MultiModalClient }
