/**
 * 多论文内容生成器
 * 基于多篇论文生成综合评述文章
 */

import type { MultiModalClient } from './multimodal-client'
import type { CompleteFigure } from './figure-analyzer'
import type { ExtractedTable, ExtractedFormula, ExtractedText } from './pdf-extractor'

// 论文资源（包含提取的素材）
export interface PaperAssets {
  paperId: string
  paperTitle: string
  authors: string[]
  year: number
  figures: CompleteFigure[]
  tables: ExtractedTable[]
  formulas: ExtractedFormula[]
  text: ExtractedText
}

// 论文关系
export interface PaperRelationship {
  type: 'sequential' | 'parallel' | 'complementary' | 'contrast'
  description: string
  evolutionThread: string
  centralTheme: string
}

// 摘要
export interface Summary {
  oneLine: string
  keyContribution: string
  mainResults: string[]
}

// 学术评述文章
export interface AcademicNarrative {
  title: string
  subtitle: string
  openingStandfirst: string
  sections: ArticleSection[]
  closingHandoff: string
}

// 文章节
export interface ArticleSection {
  title: string
  paragraphs: Paragraph[]
}

// 段落
export interface Paragraph {
  text: string
  figures?: string[]  // 引用的图ID
  tables?: string[]   // 引用的表ID
  formulas?: string[] // 引用的公式ID
}

// 代表性图片
export interface RepresentativeFigure {
  id: string
  url: string
  caption: string
  paperId: string
  paperTitle: string
}

// 多论文内容生成结果
export interface MultiPaperContent {
  title: string
  subtitle: string
  summary: Summary
  representativeFigure: RepresentativeFigure | null
  narrative: AcademicNarrative
  details: AcademicNarrative
}

/**
 * 多论文内容生成器类
 */
export class MultiPaperContentGenerator {
  private client: MultiModalClient

  constructor(client: MultiModalClient) {
    this.client = client
  }

  /**
   * 生成多论文内容
   */
  async generate(assets: PaperAssets[]): Promise<MultiPaperContent> {
    if (assets.length === 0) {
      throw new Error('No paper assets provided')
    }

    // 1. 分析论文间关系
    const relationship = await this.analyzePaperRelationship(assets)

    // 2. 生成综合评述文章
    const narrative = await this.generateAcademicNarrative(assets, relationship)

    // 3. 生成摘要
    const summary = await this.generateSummary(narrative)

    // 4. 选择代表性图片
    const representativeFigure = this.selectRepresentativeFigure(assets)

    return {
      title: narrative.title,
      subtitle: narrative.subtitle,
      summary,
      representativeFigure,
      narrative,
      details: narrative
    }
  }

  /**
   * 分析论文间关系
   */
  private async analyzePaperRelationship(assets: PaperAssets[]): Promise<PaperRelationship> {
    const prompt = `
分析以下${assets.length}篇论文之间的关系：

${assets.map((asset, i) => `
[论文${String.fromCharCode(65 + i)}] ${asset.paperTitle}
发表时间：${asset.year}
作者：${asset.authors.join(', ')}
主要图表：${asset.figures.map(f => `图${f.number}: ${f.caption}`).join('; ')}
`).join('\n---\n')}

请判断：
1. 关系类型：sequential（序列演进）/ parallel（并行探索）/ complementary（互补）/ contrast（对比竞争）
2. 演进脉络：如果是序列关系，说明前后依赖；如果是对比，说明分歧点
3. 核心主题：这几篇论文共同回应的母问题是什么

输出JSON格式：
{
  "type": "sequential|parallel|complementary|contrast",
  "description": "关系描述（100字）",
  "evolutionThread": "演进主线（80字）",
  "centralTheme": "核心主题（50字）"
}
`

    const response = await this.client.generateContent({
      prompt,
      maxTokens: 1000
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.error('Failed to parse paper relationship:', error)
    }

    // 返回默认关系
    return {
      type: 'sequential',
      description: '这些论文按时间顺序演进',
      evolutionThread: '从基础方法到改进方法的演进',
      centralTheme: '同一研究方向的系列工作'
    }
  }

  /**
   * 生成学术评述文章
   */
  private async generateAcademicNarrative(
    assets: PaperAssets[],
    relationship: PaperRelationship
  ): Promise<AcademicNarrative> {
    const prompt = this.buildAcademicNarrativePrompt(assets, relationship)

    const response = await this.client.generateContent({
      prompt,
      maxTokens: 8000,
      temperature: 0.4
    })

    return this.parseNarrativeResponse(response.content, assets)
  }

  /**
   * 构建学术评述提示词
   */
  private buildAcademicNarrativePrompt(
    assets: PaperAssets[],
    relationship: PaperRelationship
  ): string {
    return `
你是一位顶级学术期刊的综述编辑。请基于${assets.length}篇论文，撰写一篇**自然流畅的学术评述文章**。

【重要要求】
- 不要写成AI生成的结构化内容
- 要像人类专家写的期刊综述一样自然
- 段落之间要有逻辑连接，不要生硬分段
- 图表引用要自然融入正文，不要罗列
- 使用学术中文，避免"首先...其次...最后"的机械结构

【论文素材】
${assets.map((asset, i) => `
[论文${String.fromCharCode(65 + i)}] ${asset.paperTitle}
作者：${asset.authors.join(', ')}
发表：${asset.year}
图表：${asset.figures.map(f => `图${f.number}: ${f.deepAnalysis?.description?.overall || f.caption}`).join('; ')}
`).join('\n---\n')}

【论文关系】
类型：${relationship.type}
描述：${relationship.description}

【文章结构】（参考学术期刊综述风格，深入详细）

1. **引言**（300-400字）
   - 研究背景：交代该领域的研究意义和现状
   - 问题陈述：明确指出当前面临的核心科学问题
   - 研究目标：说明这几篇论文作为一个整体的研究目标
   - 文章结构：简要说明本文的组织结构

2. **相关工作与问题背景**（400-500字）
   - 前人工作：系统梳理前人在该领域的研究成果
   - 现有局限：分析现有方法存在的不足和局限
   - 研究缺口：指出尚未解决的关键问题
   - 本文贡献：预告这几篇论文的主要贡献

3. **方法演进与技术细节**（每篇论文500-600字，深入讲解）
${assets.map((_, i) => `
   - 3.${i + 1} ${i === 0 ? '基础方法' : i === assets.length - 1 ? '最新进展' : '改进方法'}（论文${String.fromCharCode(65 + i)}）
     * 核心思想：详细阐述方法的核心思想和理论基础
     * 技术细节：深入讲解算法原理和实现细节
     * 创新点：明确指出该论文的创新之处
     * 实验验证：引用图表说明实验结果
`).join('')}

4. **实验结果与对比分析**（500-600字）
   - 实验设置：详细说明实验环境和数据集
   - 主结果对比：综合对比各篇论文的主要结果
   - 消融实验：分析各组件的贡献
   - 结果讨论：深入讨论实验结果的意义

5. **总结与展望**（300-400字）
   - 主要贡献：总结这几篇论文的整体贡献
   - 研究意义：阐述该系列工作的学术价值
   - 局限性与挑战：客观分析存在的局限
   - 未来方向：展望未来可能的研究方向

【写作风格要求】
- 参考学术期刊综述论文的写作风格
- 每个部分都要深入详细，不要简略
- 技术细节要讲解清楚，让读者真正理解
- 图表引用要详细说明，不要一笔带过
- 使用专业术语，保持学术严谨性
- 段落之间要有逻辑递进，不要生硬堆砌
- 每节内部要有：背景→方法→结果→讨论的完整逻辑

【图表引用格式】
- 引用图片时使用 [FIG:figure_id] 格式
- 引用表格时使用 [TABLE:table_id] 格式
- 引用公式时使用 [FORMULA:formula_id] 格式

【输出格式】
请以JSON格式输出，不要包含任何其他文字：
{
  "title": "文章标题（学术风格）",
  "subtitle": "副标题（说明研究范围）",
  "openingStandfirst": "引子段落...",
  "sections": [
    {
      "title": "节标题",
      "paragraphs": [
        {
          "text": "段落内容，自然融入[FIG:xxx]、[TABLE:xxx]、[FORMULA:xxx]引用...",
          "figures": ["figure_id1"],
          "tables": ["table_id1"],
          "formulas": ["formula_id1"]
        }
      ]
    }
  ],
  "closingHandoff": "结尾段落..."
}
`
  }

  /**
   * 解析评述响应
   */
  private parseNarrativeResponse(content: string, assets: PaperAssets[]): AcademicNarrative {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        
        // 构建图ID映射，用于验证引用的图是否存在
        const figureMap = new Map<string, CompleteFigure>()
        assets.forEach(asset => {
          asset.figures.forEach(fig => {
            figureMap.set(fig.id, fig)
          })
        })

        // 验证并清理段落中的引用
        const sections: ArticleSection[] = (parsed.sections || []).map((section: any) => ({
          title: section.title || '',
          paragraphs: (section.paragraphs || []).map((para: any) => ({
            text: para.text || '',
            figures: (para.figures || []).filter((id: string) => figureMap.has(id)),
            tables: para.tables || [],
            formulas: para.formulas || []
          }))
        }))

        return {
          title: parsed.title || '未命名评述',
          subtitle: parsed.subtitle || '',
          openingStandfirst: parsed.openingStandfirst || '',
          sections,
          closingHandoff: parsed.closingHandoff || ''
        }
      }
    } catch (error) {
      console.error('Failed to parse narrative response:', error)
    }

    // 返回默认结构
    return {
      title: '多论文综合评述',
      subtitle: '',
      openingStandfirst: '',
      sections: assets.map((asset, i) => ({
        title: `论文 ${String.fromCharCode(65 + i)}: ${asset.paperTitle}`,
        paragraphs: [{
          text: asset.text.fullText.slice(0, 500) + '...'
        }]
      })),
      closingHandoff: ''
    }
  }

  /**
   * 生成摘要
   */
  private async generateSummary(narrative: AcademicNarrative): Promise<Summary> {
    const prompt = `
基于以下学术评述文章，生成简洁的摘要信息：

文章标题：${narrative.title}
文章副标题：${narrative.subtitle}
引子：${narrative.openingStandfirst}

要求：
1. 一句话总结（50字以内，概括核心贡献）
2. 核心贡献（100字以内）
3. 主要结果（3点，每点30字以内）

输出JSON格式：
{
  "oneLine": "一句话总结...",
  "keyContribution": "核心贡献...",
  "mainResults": ["结果1", "结果2", "结果3"]
}
`

    const response = await this.client.generateContent({
      prompt,
      maxTokens: 1000
    })

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.error('Failed to parse summary:', error)
    }

    // 返回默认摘要
    return {
      oneLine: narrative.title,
      keyContribution: narrative.openingStandfirst.slice(0, 100),
      mainResults: ['主要结果待补充']
    }
  }

  /**
   * 选择代表性图片
   */
  private selectRepresentativeFigure(assets: PaperAssets[]): RepresentativeFigure | null {
    for (const asset of assets) {
      // 优先选择架构图
      const architectureFigure = asset.figures.find(f =>
        f.deepAnalysis?.description?.type === 'architecture'
      )
      if (architectureFigure) {
        return {
          id: architectureFigure.id,
          url: `data:image/${architectureFigure.imageFormat};base64,${architectureFigure.imageData.toString('base64')}`,
          caption: architectureFigure.caption,
          paperId: asset.paperId,
          paperTitle: asset.paperTitle
        }
      }

      // 其次选择主结果图
      const resultFigure = asset.figures.find(f =>
        f.deepAnalysis?.description?.type === 'result'
      )
      if (resultFigure) {
        return {
          id: resultFigure.id,
          url: `data:image/${resultFigure.imageFormat};base64,${resultFigure.imageData.toString('base64')}`,
          caption: resultFigure.caption,
          paperId: asset.paperId,
          paperTitle: asset.paperTitle
        }
      }
    }

    // 如果没有找到，返回第一张图
    const firstAsset = assets[0]
    const firstFigure = firstAsset.figures[0]
    if (firstFigure) {
      return {
        id: firstFigure.id,
        url: `data:image/${firstFigure.imageFormat};base64,${firstFigure.imageData.toString('base64')}`,
        caption: firstFigure.caption,
        paperId: firstAsset.paperId,
        paperTitle: firstAsset.paperTitle
      }
    }

    return null
  }
}

// 导出单例实例
let globalGenerator: MultiPaperContentGenerator | null = null

export function initializeMultiPaperGenerator(client: MultiModalClient): MultiPaperContentGenerator {
  globalGenerator = new MultiPaperContentGenerator(client)
  return globalGenerator
}

export function getMultiPaperGenerator(): MultiPaperContentGenerator {
  if (!globalGenerator) {
    throw new Error('MultiPaperContentGenerator not initialized. Call initializeMultiPaperGenerator first.')
  }
  return globalGenerator
}
