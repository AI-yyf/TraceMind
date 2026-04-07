/**
 * 图表深度分析模块
 * 使用多模态模型分析论文中的图表
 */

import { prisma } from './db'
import { multimodalClient } from './multimodal-client'

export interface FigureAnalysisResult {
  figureId: string
  description: {
    type: string
    overall: string
    elements: string[]
    structure: string
  }
  interpretation: {
    mainFinding: string
    keyData: Array<{
      location: string
      value: string
      meaning: string
    }>
    trends: string[]
    comparisons: string[]
    anomalies: string[]
  }
  significance: {
    supports: string
    proves: string
    limitations: string
    relationToText: string
  }
  crossPaperRelation?: {
    relationToPrevious: string
    evolutionSignificance: string
    uniqueContribution: string
  }
}

export interface TableAnalysisResult {
  tableId: string
  description: {
    structure: string
    headers: string[]
    dataTypes: string[]
  }
  interpretation: {
    keyFindings: string[]
    patterns: string[]
    outliers: string[]
  }
  significance: {
    supports: string
    relationToText: string
  }
}

export interface FormulaAnalysisResult {
  formulaId: string
  description: {
    components: string[]
    meaning: string
    variables: Array<{
      symbol: string
      meaning: string
    }>
  }
  interpretation: {
    application: string
    derivation: string
    significance: string
  }
}

export interface CompleteFigure {
  id: string
  caption: string
  imageFormat: string
  imageData: Buffer
  paperId?: string
}

/**
 * 图表分析器类
 */
export class FigureAnalyzer {
  private language: 'zh' | 'en'

  constructor(language: 'zh' | 'en' = 'zh') {
    this.language = language
  }

  /**
   * 分析图表
   */
  async analyzeFigure(
    figureId: string,
    imagePath: string,
    caption: string,
    paperContext: string
  ): Promise<FigureAnalysisResult> {
    // 读取图片
    const fs = require('fs')
    const path = require('path')
    
    let imageBase64: string | null = null
    try {
      const fullPath = path.join(process.cwd(), 'public', imagePath)
      if (fs.existsSync(fullPath)) {
        const imageBuffer = fs.readFileSync(fullPath)
        imageBase64 = imageBuffer.toString('base64')
      }
    } catch (e) {
      console.warn(`Failed to read image: ${imagePath}`)
    }

    // 构建提示词
    const prompt = this.buildFigureAnalysisPrompt(caption, paperContext)

    // 调用多模态模型
    const response = await multimodalClient.complete({
      taskType: 'figure-analysis',
      prompt,
      attachments: imageBase64 ? [{
        type: 'image',
        data: imageBase64,
        mimeType: 'image/png'
      }] : undefined,
      temperature: 0.3,
      maxTokens: 2000,
    })

    // 解析结果
    const analysis = this.parseFigureAnalysis(response.text)

    // 保存到数据库
    await this.saveFigureAnalysis(figureId, analysis)

    return {
      figureId,
      ...analysis
    }
  }

  async analyzeFigures(figures: CompleteFigure[]): Promise<CompleteFigure[]> {
    return figures
  }

  /**
   * 分析表格
   */
  async analyzeTable(
    tableId: string,
    tableData: any,
    caption: string,
    paperContext: string
  ): Promise<TableAnalysisResult> {
    const prompt = this.buildTableAnalysisPrompt(tableData, caption, paperContext)

    const response = await multimodalClient.complete({
      taskType: 'table-analysis',
      prompt,
      temperature: 0.3,
      maxTokens: 1500,
    })

    const analysis = this.parseTableAnalysis(response.text)

    await this.saveTableAnalysis(tableId, analysis)

    return {
      tableId,
      ...analysis
    }
  }

  /**
   * 分析公式
   */
  async analyzeFormula(
    formulaId: string,
    latex: string,
    rawText: string,
    paperContext: string
  ): Promise<FormulaAnalysisResult> {
    const prompt = this.buildFormulaAnalysisPrompt(latex, rawText, paperContext)

    const response = await multimodalClient.complete({
      taskType: 'formula-analysis',
      prompt,
      temperature: 0.3,
      maxTokens: 1200,
    })

    const analysis = this.parseFormulaAnalysis(response.text)

    await this.saveFormulaAnalysis(formulaId, analysis)

    return {
      formulaId,
      ...analysis
    }
  }

  /**
   * 批量分析论文中的所有图表
   */
  async analyzePaperFigures(paperId: string): Promise<{
    figures: FigureAnalysisResult[]
    tables: TableAnalysisResult[]
    formulas: FormulaAnalysisResult[]
  }> {
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      include: {
        figures: true,
        tables: true,
        formulas: true,
      }
    })

    if (!paper) {
      throw new Error(`Paper not found: ${paperId}`)
    }

    const paperContext = `${paper.title}\n${paper.summary?.substring(0, 1000) || ''}`

    const results = {
      figures: [] as FigureAnalysisResult[],
      tables: [] as TableAnalysisResult[],
      formulas: [] as FormulaAnalysisResult[]
    }

    // 分析图表
    for (const figure of paper.figures) {
      try {
        const analysis = await this.analyzeFigure(
          figure.id,
          figure.path || '',
          figure.caption || '',
          paperContext
        )
        results.figures.push(analysis)
      } catch (e) {
        console.error(`Failed to analyze figure ${figure.id}:`, e)
      }
    }

    // 分析表格
    for (const table of paper.tables) {
      try {
        const analysis = await this.analyzeTable(
          table.id,
          table.data,
          table.caption || '',
          paperContext
        )
        results.tables.push(analysis)
      } catch (e) {
        console.error(`Failed to analyze table ${table.id}:`, e)
      }
    }

    // 分析公式
    for (const formula of paper.formulas) {
      try {
        const analysis = await this.analyzeFormula(
          formula.id,
          formula.latex || '',
          formula.rawText || '',
          paperContext
        )
        results.formulas.push(analysis)
      } catch (e) {
        console.error(`Failed to analyze formula ${formula.id}:`, e)
      }
    }

    return results
  }

  /**
   * 构建图表分析提示词
   */
  private buildFigureAnalysisPrompt(caption: string, paperContext: string): string {
    if (this.language === 'zh') {
      return `请分析以下学术论文中的图表。

论文上下文：
${paperContext.substring(0, 1500)}

图表说明：
${caption}

请提供以下分析（以JSON格式返回）：
{
  "description": {
    "type": "图表类型（如：折线图、柱状图、散点图、流程图等）",
    "overall": "整体描述",
    "elements": ["组成元素1", "组成元素2"],
    "structure": "结构说明"
  },
  "interpretation": {
    "mainFinding": "主要发现",
    "keyData": [
      {"location": "位置", "value": "数值", "meaning": "含义"}
    ],
    "trends": ["趋势1", "趋势2"],
    "comparisons": ["对比1", "对比2"],
    "anomalies": ["异常点1"]
  },
  "significance": {
    "supports": "支持了什么观点",
    "proves": "证明了什么结论",
    "limitations": "局限性",
    "relationToText": "与正文的关系"
  }
}`
    } else {
      return `Please analyze the following figure from an academic paper.

Paper Context:
${paperContext.substring(0, 1500)}

Figure Caption:
${caption}

Please provide the following analysis (return as JSON):
{
  "description": {
    "type": "Figure type (e.g., line chart, bar chart, scatter plot, flowchart)",
    "overall": "Overall description",
    "elements": ["Element 1", "Element 2"],
    "structure": "Structure description"
  },
  "interpretation": {
    "mainFinding": "Main finding",
    "keyData": [
      {"location": "Location", "value": "Value", "meaning": "Meaning"}
    ],
    "trends": ["Trend 1", "Trend 2"],
    "comparisons": ["Comparison 1", "Comparison 2"],
    "anomalies": ["Anomaly 1"]
  },
  "significance": {
    "supports": "What argument it supports",
    "proves": "What conclusion it proves",
    "limitations": "Limitations",
    "relationToText": "Relation to the text"
  }
}`
    }
  }

  /**
   * 构建表格分析提示词
   */
  private buildTableAnalysisPrompt(tableData: any, caption: string, paperContext: string): string {
    const tableJson = JSON.stringify(tableData, null, 2).substring(0, 2000)
    
    if (this.language === 'zh') {
      return `请分析以下学术论文中的表格。

论文上下文：
${paperContext.substring(0, 1000)}

表格说明：
${caption}

表格数据：
${tableJson}

请提供以下分析（以JSON格式返回）：
{
  "description": {
    "structure": "表格结构",
    "headers": ["表头1", "表头2"],
    "dataTypes": ["数据类型1", "数据类型2"]
  },
  "interpretation": {
    "keyFindings": ["关键发现1", "关键发现2"],
    "patterns": ["模式1", "模式2"],
    "outliers": ["异常值1"]
  },
  "significance": {
    "supports": "支持了什么观点",
    "relationToText": "与正文的关系"
  }
}`
    } else {
      return `Please analyze the following table from an academic paper.

Paper Context:
${paperContext.substring(0, 1000)}

Table Caption:
${caption}

Table Data:
${tableJson}

Please provide the following analysis (return as JSON):
{
  "description": {
    "structure": "Table structure",
    "headers": ["Header 1", "Header 2"],
    "dataTypes": ["Data type 1", "Data type 2"]
  },
  "interpretation": {
    "keyFindings": ["Key finding 1", "Key finding 2"],
    "patterns": ["Pattern 1", "Pattern 2"],
    "outliers": ["Outlier 1"]
  },
  "significance": {
    "supports": "What argument it supports",
    "relationToText": "Relation to the text"
  }
}`
    }
  }

  /**
   * 构建公式分析提示词
   */
  private buildFormulaAnalysisPrompt(latex: string, rawText: string, paperContext: string): string {
    if (this.language === 'zh') {
      return `请分析以下学术论文中的公式。

论文上下文：
${paperContext.substring(0, 1000)}

LaTeX公式：
${latex}

原始文本：
${rawText}

请提供以下分析（以JSON格式返回）：
{
  "description": {
    "components": ["组成部分1", "组成部分2"],
    "meaning": "公式含义",
    "variables": [
      {"symbol": "符号", "meaning": "含义"}
    ]
  },
  "interpretation": {
    "application": "应用场景",
    "derivivation": "推导过程",
    "significance": "重要性"
  }
}`
    } else {
      return `Please analyze the following formula from an academic paper.

Paper Context:
${paperContext.substring(0, 1000)}

LaTeX Formula:
${latex}

Raw Text:
${rawText}

Please provide the following analysis (return as JSON):
{
  "description": {
    "components": ["Component 1", "Component 2"],
    "meaning": "Formula meaning",
    "variables": [
      {"symbol": "Symbol", "meaning": "Meaning"}
    ]
  },
  "interpretation": {
    "application": "Application scenario",
    "derivation": "Derivation process",
    "significance": "Significance"
  }
}`
    }
  }

  /**
   * 解析图表分析结果
   */
  private parseFigureAnalysis(text: string): any {
    try {
      // 尝试提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return {}
    } catch (e) {
      console.error('Failed to parse figure analysis:', e)
      return {}
    }
  }

  /**
   * 解析表格分析结果
   */
  private parseTableAnalysis(text: string): any {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return {}
    } catch (e) {
      console.error('Failed to parse table analysis:', e)
      return {}
    }
  }

  /**
   * 解析公式分析结果
   */
  private parseFormulaAnalysis(text: string): any {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return {}
    } catch (e) {
      console.error('Failed to parse formula analysis:', e)
      return {}
    }
  }

  /**
   * 保存图表分析结果
   */
  private async saveFigureAnalysis(figureId: string, analysis: any): Promise<void> {
    await prisma.figure.update({
      where: { id: figureId },
      data: {
        analysis: JSON.stringify(analysis),
      }
    })
  }

  /**
   * 保存表格分析结果
   */
  private async saveTableAnalysis(tableId: string, analysis: any): Promise<void> {
    await prisma.table.update({
      where: { id: tableId },
      data: {
        analysis: JSON.stringify(analysis),
      }
    })
  }

  /**
   * 保存公式分析结果
   */
  private async saveFormulaAnalysis(formulaId: string, analysis: any): Promise<void> {
    await prisma.formula.update({
      where: { id: formulaId },
      data: {
        analysis: JSON.stringify(analysis),
      }
    })
  }

  /**
   * 设置语言
   */
  setLanguage(language: 'zh' | 'en') {
    this.language = language
  }
}

// 导出单例
let globalAnalyzer: FigureAnalyzer | null = null

export function getFigureAnalyzer(language?: 'zh' | 'en'): FigureAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new FigureAnalyzer(language)
  } else if (language) {
    globalAnalyzer.setLanguage(language)
  }
  return globalAnalyzer
}
