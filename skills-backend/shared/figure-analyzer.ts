/**
 * 图片深度分析模块
 * 使用多模态模型对论文图表进行深度分析
 */

import type { MultiModalClient } from './multimodal-client'
import type { ExtractedFigure } from './pdf-extractor'

// 图片深度分析结果
export interface FigureDeepAnalysis {
  // 第一层：图片描述（看到了什么）
  description: {
    type: 'architecture' | 'result' | 'comparison' | 'flow' | 'example' | 'other'
    overall: string           // 整体描述（100字）
    elements: string[]        // 关键元素列表
    structure: string         // 结构/布局描述
  }

  // 第二层：内容解读（说明了什么）
  interpretation: {
    mainFinding: string       // 主要发现（150字）
    keyData: DataPoint[]      // 关键数据点
    trends: string[]          // 趋势分析
    comparisons: string[]     // 对比分析（如果是对比图）
    anomalies: string[]       // 异常/值得注意的点
  }

  // 第三层：研究意义（为什么重要）
  significance: {
    supports: string          // 支撑了什么论点（100字）
    proves: string            // 证明了什么（100字）
    limitations: string       // 暗示了什么局限（100字）
    relationToText: string    // 与正文的关系（100字）
  }

  // 第四层：跨论文关联（多论文节点特有）
  crossPaperRelation?: {
    relationToPrevious: string  // 与前文工作的关系
    evolutionSignificance: string // 在演进脉络中的意义
    uniqueContribution: string  // 独特贡献
  }

  // 分析质量评估
  quality: {
    confidence: number          // 置信度 0-1
    needsReview: boolean        // 是否需要人工复核
    unclearParts: string[]      // 不清晰的部分
  }
}

// 数据点
export interface DataPoint {
  location: string
  value: string
  meaning: string
}

// 完整图信息（包含深度分析）
export interface CompleteFigure extends ExtractedFigure {
  deepAnalysis?: FigureDeepAnalysis
  analysisTimestamp?: string
}

// 图片深度解读 LLM 提示词
const FIGURE_DEEP_ANALYSIS_PROMPT = `
你是一位学术论文图表分析专家。请对这张图表进行**深度、全面的分析**，用完整篇幅讲解清楚。

【分析要求】（每个部分都要写完整，不要简略）

**一、图片描述（200字）**
- 这是什么类型的图？（架构图/实验结果/流程图/对比图/示例图）
- 整体展示了什么内容？
- 包含哪些关键元素？（模块、曲线、数据点、标注等）
- 图的布局和结构是怎样的？

**二、内容解读（300字）**
- 这张图的核心发现是什么？
- 关键数据点有哪些？具体数值是多少？
- 呈现了什么趋势或模式？
- 如果是对比图，对比了哪些方面？差异是什么？
- 有什么异常或值得特别注意的地方？

**三、研究意义（200字）**
- 这张图支撑了论文的什么核心论点？
- 证明了什么结论？
- 暗示了什么局限性或未解决的问题？
- 在论文论证体系中起什么作用？

**四、跨论文关联（如果是多论文分析，200字）**
- 这张图与前人工作有什么关系？
- 在研究演进脉络中处于什么位置？
- 有什么独特的贡献或创新？

【输出格式】
请以JSON格式输出，不要包含任何其他文字：
{
  "description": {
    "type": "图表类型",
    "overall": "整体描述...",
    "elements": ["元素1", "元素2", "元素3"],
    "structure": "结构描述..."
  },
  "interpretation": {
    "mainFinding": "主要发现...",
    "keyData": [
      {"location": "位置描述", "value": "数值", "meaning": "含义"}
    ],
    "trends": ["趋势1", "趋势2"],
    "comparisons": ["对比1", "对比2"],
    "anomalies": ["异常1"]
  },
  "significance": {
    "supports": "支撑论点...",
    "proves": "证明结论...",
    "limitations": "暗示局限...",
    "relationToText": "与正文关系..."
  },
  "crossPaperRelation": {
    "relationToPrevious": "与前文关系...",
    "evolutionSignificance": "演进意义...",
    "uniqueContribution": "独特贡献..."
  },
  "quality": {
    "confidence": 0.95,
    "needsReview": false,
    "unclearParts": []
  }
}
`

/**
 * 图片分析器类
 */
export class FigureAnalyzer {
  private client: MultiModalClient

  constructor(client: MultiModalClient) {
    this.client = client
  }

  /**
   * 分析单张图片
   */
  async analyzeFigure(figure: ExtractedFigure): Promise<CompleteFigure> {
    try {
      // 将图片 Buffer 转换为 base64
      const imageBase64 = figure.imageData.toString('base64')
      const imageUrl = `data:image/${figure.imageFormat};base64,${imageBase64}`

      // 调用多模态模型进行分析
      const response = await this.client.analyzeFigure({
        image: imageUrl,
        prompt: FIGURE_DEEP_ANALYSIS_PROMPT,
        maxTokens: 2000
      })

      // 解析 JSON 响应
      const analysis = this.parseAnalysisResponse(response.content)

      return {
        ...figure,
        deepAnalysis: analysis,
        analysisTimestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error(`Failed to analyze figure ${figure.id}:`, error)
      
      // 返回带有错误信息的分析结果
      return {
        ...figure,
        deepAnalysis: {
          description: {
            type: 'other',
            overall: '分析失败',
            elements: [],
            structure: ''
          },
          interpretation: {
            mainFinding: '无法分析此图片',
            keyData: [],
            trends: [],
            comparisons: [],
            anomalies: []
          },
          significance: {
            supports: '',
            proves: '',
            limitations: '',
            relationToText: ''
          },
          quality: {
            confidence: 0,
            needsReview: true,
            unclearParts: [error instanceof Error ? error.message : 'Unknown error']
          }
        },
        analysisTimestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 批量分析多张图片
   */
  async analyzeFigures(figures: ExtractedFigure[]): Promise<CompleteFigure[]> {
    const results: CompleteFigure[] = []
    
    for (const figure of figures) {
      const analyzed = await this.analyzeFigure(figure)
      results.push(analyzed)
    }

    return results
  }

  /**
   * 分析图片并添加跨论文关联（用于多论文节点）
   */
  async analyzeFigureWithCrossPaperRelation(
    figure: ExtractedFigure,
    previousPapersContext: string
  ): Promise<CompleteFigure> {
    const prompt = `
${FIGURE_DEEP_ANALYSIS_PROMPT}

【跨论文上下文】
${previousPapersContext}

请在分析中特别关注这张图与前文工作的关系。
`

    try {
      const imageBase64 = figure.imageData.toString('base64')
      const imageUrl = `data:image/${figure.imageFormat};base64,${imageBase64}`

      const response = await this.client.analyzeFigure({
        image: imageUrl,
        prompt,
        maxTokens: 2500
      })

      const analysis = this.parseAnalysisResponse(response.content)

      return {
        ...figure,
        deepAnalysis: analysis,
        analysisTimestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error(`Failed to analyze figure with cross-paper relation ${figure.id}:`, error)
      return this.analyzeFigure(figure) // 降级为普通分析
    }
  }

  /**
   * 解析分析响应
   */
  private parseAnalysisResponse(content: string): FigureDeepAnalysis {
    try {
      // 尝试提取 JSON 部分
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        
        // 验证并填充默认值
        return {
          description: {
            type: parsed.description?.type || 'other',
            overall: parsed.description?.overall || '',
            elements: parsed.description?.elements || [],
            structure: parsed.description?.structure || ''
          },
          interpretation: {
            mainFinding: parsed.interpretation?.mainFinding || '',
            keyData: parsed.interpretation?.keyData || [],
            trends: parsed.interpretation?.trends || [],
            comparisons: parsed.interpretation?.comparisons || [],
            anomalies: parsed.interpretation?.anomalies || []
          },
          significance: {
            supports: parsed.significance?.supports || '',
            proves: parsed.significance?.proves || '',
            limitations: parsed.significance?.limitations || '',
            relationToText: parsed.significance?.relationToText || ''
          },
          crossPaperRelation: parsed.crossPaperRelation ? {
            relationToPrevious: parsed.crossPaperRelation.relationToPrevious || '',
            evolutionSignificance: parsed.crossPaperRelation.evolutionSignificance || '',
            uniqueContribution: parsed.crossPaperRelation.uniqueContribution || ''
          } : undefined,
          quality: {
            confidence: parsed.quality?.confidence || 0.5,
            needsReview: parsed.quality?.needsReview || false,
            unclearParts: parsed.quality?.unclearParts || []
          }
        }
      }
      
      throw new Error('No JSON found in response')
    } catch (error) {
      console.error('Failed to parse analysis response:', error)
      console.error('Raw content:', content)
      
      // 返回默认分析
      return {
        description: {
          type: 'other',
          overall: content.slice(0, 200),
          elements: [],
          structure: ''
        },
        interpretation: {
          mainFinding: '',
          keyData: [],
          trends: [],
          comparisons: [],
          anomalies: []
        },
        significance: {
          supports: '',
          proves: '',
          limitations: '',
          relationToText: ''
        },
        quality: {
          confidence: 0.3,
          needsReview: true,
          unclearParts: ['Failed to parse structured analysis']
        }
      }
    }
  }

  /**
   * 选择代表性图片
   * 优先选择架构图或主结果图
   */
  selectRepresentativeFigure(figures: CompleteFigure[]): CompleteFigure | null {
    if (figures.length === 0) return null

    // 优先选择架构图
    const architectureFigure = figures.find(f => 
      f.deepAnalysis?.description?.type === 'architecture'
    )
    if (architectureFigure) return architectureFigure

    // 其次选择主结果图
    const resultFigure = figures.find(f =>
      f.deepAnalysis?.description?.type === 'result'
    )
    if (resultFigure) return resultFigure

    // 默认返回第一张
    return figures[0]
  }
}

// 导出单例实例
let globalAnalyzer: FigureAnalyzer | null = null

export function initializeFigureAnalyzer(client: MultiModalClient): FigureAnalyzer {
  globalAnalyzer = new FigureAnalyzer(client)
  return globalAnalyzer
}

export function getFigureAnalyzer(): FigureAnalyzer {
  if (!globalAnalyzer) {
    throw new Error('FigureAnalyzer not initialized. Call initializeFigureAnalyzer first.')
  }
  return globalAnalyzer
}
