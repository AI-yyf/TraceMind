/**
 * 多模态模型统一调用接口
 * 支持 OpenAI, Anthropic, Google, Local, Custom 等多种提供商
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { 
  CustomModelConfig, 
  MultiModalConfig, 
  ModelProvider,
  ModelCapability 
} from './config'

// 任务类型
export type TaskType = 
  | 'figureAnalysis' 
  | 'contentGeneration' 
  | 'formulaRecognition' 
  | 'ocr' 
  | 'tableExtraction'
  | string

// 模型调用结果
export interface ModelResponse {
  content: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  latency: number
  modelId: string
}

// 图片分析请求
export interface VisionRequest {
  image: string  // base64 或 URL
  prompt: string
  maxTokens?: number
}

// 文本生成请求
export interface TextRequest {
  prompt: string
  maxTokens?: number
  temperature?: number
}

// 自定义API客户端
class CustomAPIClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey
  }

  async chatCompletion(params: {
    model: string
    messages: Array<{ role: string; content: string }>
    temperature?: number
    max_tokens?: number
    top_p?: number
  }): Promise<{ choices: Array<{ message: { content: string } }> }> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(params)
    })

    if (!response.ok) {
      throw new Error(`Custom API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async visionCompletion(params: {
    model: string
    messages: Array<{ 
      role: string
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
    }>
    temperature?: number
    max_tokens?: number
  }): Promise<{ choices: Array<{ message: { content: string } }> }> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(params)
    })

    if (!response.ok) {
      throw new Error(`Custom API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }
}

/**
 * 多模态模型客户端
 */
export class MultiModalClient {
  private config: MultiModalConfig
  private modelClients: Map<string, any> = new Map()

  constructor(config: MultiModalConfig) {
    this.config = config
    this.initializeModelClients()
  }

  /**
   * 初始化所有启用的模型客户端
   */
  private initializeModelClients() {
    for (const model of this.config.models) {
      if (model.enabled) {
        const client = this.createModelClient(model)
        this.modelClients.set(model.id, client)
      }
    }
  }

  /**
   * 创建模型客户端
   */
  private createModelClient(modelConfig: CustomModelConfig): any {
    switch (modelConfig.provider) {
      case 'openai':
        return new OpenAI({
          apiKey: modelConfig.apiKey,
          baseURL: modelConfig.baseUrl
        })
      case 'anthropic':
        return new Anthropic({
          apiKey: modelConfig.apiKey
        })
      case 'google':
        return new GoogleGenerativeAI(modelConfig.apiKey)
      case 'local':
      case 'custom':
        return new CustomAPIClient(modelConfig.baseUrl || 'http://localhost:8000', modelConfig.apiKey)
      default:
        throw new Error(`Unknown provider: ${modelConfig.provider}`)
    }
  }

  /**
   * 获取指定任务的模型配置
   */
  private getModelForTask(taskName: string): { client: any; config: CustomModelConfig } {
    const modelId = this.config.taskMapping[taskName]
    if (!modelId) {
      throw new Error(`No model mapped for task: ${taskName}`)
    }

    const client = this.modelClients.get(modelId)
    const config = this.config.models.find(m => m.id === modelId)

    if (!client || !config) {
      throw new Error(`Model ${modelId} not found or not enabled`)
    }

    return { client, config }
  }

  /**
   * 执行图片分析任务
   */
  async analyzeFigure(request: VisionRequest): Promise<ModelResponse> {
    return this.executeVisionTask('figureAnalysis', request)
  }

  /**
   * 执行OCR任务
   */
  async performOCR(request: VisionRequest): Promise<ModelResponse> {
    return this.executeVisionTask('ocr', request)
  }

  /**
   * 执行表格提取任务
   */
  async extractTable(request: VisionRequest): Promise<ModelResponse> {
    return this.executeVisionTask('tableExtraction', request)
  }

  /**
   * 执行公式识别任务
   */
  async recognizeFormula(request: VisionRequest): Promise<ModelResponse> {
    return this.executeVisionTask('formulaRecognition', request)
  }

  /**
   * 执行内容生成任务
   */
  async generateContent(request: TextRequest): Promise<ModelResponse> {
    return this.executeTextTask('contentGeneration', request)
  }

  /**
   * 执行自定义任务
   */
  async executeCustomTask(taskName: string, request: TextRequest | VisionRequest): Promise<ModelResponse> {
    if ('image' in request) {
      return this.executeVisionTask(taskName, request)
    }
    return this.executeTextTask(taskName, request)
  }

  /**
   * 执行视觉任务
   */
  private async executeVisionTask(taskName: string, request: VisionRequest): Promise<ModelResponse> {
    const { client, config } = this.getModelForTask(taskName)
    const startTime = Date.now()

    try {
      const response = await this.callVisionModel(client, config, request)
      return {
        content: response,
        latency: Date.now() - startTime,
        modelId: config.id
      }
    } catch (error) {
      // 如果启用备用策略，尝试使用备用模型
      if (this.config.fallbackStrategy.enabled) {
        console.warn(`Model ${config.id} failed for task ${taskName}, trying fallback...`)
        return this.executeFallbackVisionTask(request, startTime)
      }
      throw error
    }
  }

  /**
   * 执行文本任务
   */
  private async executeTextTask(taskName: string, request: TextRequest): Promise<ModelResponse> {
    const { client, config } = this.getModelForTask(taskName)
    const startTime = Date.now()

    try {
      const response = await this.callTextModel(client, config, request)
      return {
        content: response,
        latency: Date.now() - startTime,
        modelId: config.id
      }
    } catch (error) {
      // 如果启用备用策略，尝试使用备用模型
      if (this.config.fallbackStrategy.enabled) {
        console.warn(`Model ${config.id} failed for task ${taskName}, trying fallback...`)
        return this.executeFallbackTextTask(request, startTime)
      }
      throw error
    }
  }

  /**
   * 调用视觉模型
   */
  private async callVisionModel(client: any, config: CustomModelConfig, request: VisionRequest): Promise<string> {
    const maxTokens = request.maxTokens || config.parameters.maxTokens

    switch (config.provider) {
      case 'openai':
        const openaiResponse = await client.chat.completions.create({
          model: config.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: request.image.startsWith('data:') ? request.image : `data:image/png;base64,${request.image}`
                  }
                }
              ]
            }
          ],
          temperature: config.parameters.temperature,
          max_tokens: maxTokens,
          top_p: config.parameters.topP
        })
        return openaiResponse.choices[0].message.content

      case 'anthropic':
        const anthropicResponse = await client.messages.create({
          model: config.model,
          max_tokens: maxTokens,
          temperature: config.parameters.temperature,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: request.image.replace(/^data:image\/\w+;base64,/, '')
                  }
                }
              ]
            }
          ]
        })
        return anthropicResponse.content[0].text

      case 'google':
        const googleModel = client.getGenerativeModel({ model: config.model })
        const googleResult = await googleModel.generateContent([
          request.prompt,
          {
            inlineData: {
              data: request.image.replace(/^data:image\/\w+;base64,/, ''),
              mimeType: 'image/png'
            }
          }
        ])
        return googleResult.response.text()

      case 'local':
      case 'custom':
        const customResponse = await client.visionCompletion({
          model: config.model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: request.prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: request.image.startsWith('data:') ? request.image : `data:image/png;base64,${request.image}`
                  }
                }
              ]
            }
          ],
          temperature: config.parameters.temperature,
          max_tokens: maxTokens
        })
        return customResponse.choices[0].message.content

      default:
        throw new Error(`Unsupported provider for vision: ${config.provider}`)
    }
  }

  /**
   * 调用文本模型
   */
  private async callTextModel(client: any, config: CustomModelConfig, request: TextRequest): Promise<string> {
    const maxTokens = request.maxTokens || config.parameters.maxTokens
    const temperature = request.temperature ?? config.parameters.temperature

    switch (config.provider) {
      case 'openai':
        const openaiResponse = await client.chat.completions.create({
          model: config.model,
          messages: [{ role: 'user', content: request.prompt }],
          temperature,
          max_tokens: maxTokens,
          top_p: config.parameters.topP
        })
        return openaiResponse.choices[0].message.content

      case 'anthropic':
        const anthropicResponse = await client.messages.create({
          model: config.model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: request.prompt }]
        })
        return anthropicResponse.content[0].text

      case 'google':
        const googleModel = client.getGenerativeModel({ model: config.model })
        const googleResult = await googleModel.generateContent(request.prompt)
        return googleResult.response.text()

      case 'local':
      case 'custom':
        const customResponse = await client.chatCompletion({
          model: config.model,
          messages: [{ role: 'user', content: request.prompt }],
          temperature,
          max_tokens: maxTokens,
          top_p: config.parameters.topP
        })
        return customResponse.choices[0].message.content

      default:
        throw new Error(`Unsupported provider for text: ${config.provider}`)
    }
  }

  /**
   * 执行备用视觉任务
   */
  private async executeFallbackVisionTask(request: VisionRequest, startTime: number): Promise<ModelResponse> {
    const fallbackId = this.config.fallbackStrategy.fallbackModelId
    if (!fallbackId) {
      throw new Error('Fallback model not configured')
    }

    const fallbackConfig = this.config.models.find(m => m.id === fallbackId)
    if (!fallbackConfig || !fallbackConfig.enabled) {
      throw new Error('Fallback model not available')
    }

    // 确保备用模型客户端已初始化
    let fallbackClient = this.modelClients.get(fallbackId)
    if (!fallbackClient) {
      fallbackClient = this.createModelClient(fallbackConfig)
      this.modelClients.set(fallbackId, fallbackClient)
    }

    const response = await this.callVisionModel(fallbackClient, fallbackConfig, request)
    return {
      content: response,
      latency: Date.now() - startTime,
      modelId: fallbackId
    }
  }

  /**
   * 执行备用文本任务
   */
  private async executeFallbackTextTask(request: TextRequest, startTime: number): Promise<ModelResponse> {
    const fallbackId = this.config.fallbackStrategy.fallbackModelId
    if (!fallbackId) {
      throw new Error('Fallback model not configured')
    }

    const fallbackConfig = this.config.models.find(m => m.id === fallbackId)
    if (!fallbackConfig || !fallbackConfig.enabled) {
      throw new Error('Fallback model not available')
    }

    // 确保备用模型客户端已初始化
    let fallbackClient = this.modelClients.get(fallbackId)
    if (!fallbackClient) {
      fallbackClient = this.createModelClient(fallbackConfig)
      this.modelClients.set(fallbackId, fallbackClient)
    }

    const response = await this.callTextModel(fallbackClient, fallbackConfig, request)
    return {
      content: response,
      latency: Date.now() - startTime,
      modelId: fallbackId
    }
  }

  /**
   * 测试模型连接
   */
  async testModel(modelId: string): Promise<{ success: boolean; latency: number; error?: string }> {
    const config = this.config.models.find(m => m.id === modelId)
    if (!config) {
      return { success: false, latency: 0, error: 'Model not found' }
    }

    // 确保客户端已初始化
    let client = this.modelClients.get(modelId)
    if (!client) {
      try {
        client = this.createModelClient(config)
        this.modelClients.set(modelId, client)
      } catch (error) {
        return { 
          success: false, 
          latency: 0, 
          error: `Failed to create client: ${error instanceof Error ? error.message : String(error)}` 
        }
      }
    }

    const startTime = Date.now()
    try {
      // 发送一个简单的测试请求
      await this.callTextModel(client, config, { prompt: 'Hello', maxTokens: 10 })
      return { success: true, latency: Date.now() - startTime }
    } catch (error) {
      return { 
        success: false, 
        latency: Date.now() - startTime, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  /**
   * 获取所有启用的模型
   */
  getEnabledModels(): CustomModelConfig[] {
    return this.config.models.filter(m => m.enabled)
  }

  /**
   * 获取模型配置
   */
  getModelConfig(modelId: string): CustomModelConfig | undefined {
    return this.config.models.find(m => m.id === modelId)
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: MultiModalConfig) {
    this.config = newConfig
    this.modelClients.clear()
    this.initializeModelClients()
  }
}

// 导出单例实例（可选）
let globalClient: MultiModalClient | null = null

export function initializeMultiModalClient(config: MultiModalConfig): MultiModalClient {
  globalClient = new MultiModalClient(config)
  return globalClient
}

export function getMultiModalClient(): MultiModalClient {
  if (!globalClient) {
    throw new Error('MultiModalClient not initialized. Call initializeMultiModalClient first.')
  }
  return globalClient
}
