/**
 * 研究记忆模块
 * 用于存储和检索研究过程中的发现和内容
 */

import { prisma } from './db'

interface DiscoveryRecord {
  paperId: string
  title: string
  confidence: number
  stageIndex: number
  discoveredAt: string
}

interface ContentGenerationRecord {
  summary: string
  narrative: string
  evidence: string
  generatedAt: string
  coverageScore: number
}

export class ResearchMemory {
  /**
   * 添加发现批次
   */
  async addDiscoveryBatch(topicId: string, discoveries: DiscoveryRecord[]): Promise<void> {
    try {
      // 保存到数据库
      for (const discovery of discoveries) {
        await prisma.systemConfig.upsert({
          where: { key: `discovery:${topicId}:${discovery.paperId}` },
          update: {
            value: JSON.stringify(discovery),
          },
          create: {
            key: `discovery:${topicId}:${discovery.paperId}`,
            value: JSON.stringify(discovery),
          },
        })
      }
    } catch (error) {
      console.error('Failed to save discovery batch:', error)
    }
  }

  /**
   * 添加内容生成记录
   */
  async addContentGeneration(paperId: string, content: ContentGenerationRecord): Promise<void> {
    try {
      await prisma.systemConfig.upsert({
        where: { key: `content:${paperId}` },
        update: {
          value: JSON.stringify(content),
        },
        create: {
          key: `content:${paperId}`,
          value: JSON.stringify(content),
        },
      })
    } catch (error) {
      console.error('Failed to save content generation:', error)
    }
  }

  /**
   * 获取主题的发现历史
   */
  async getDiscoveryHistory(topicId: string): Promise<DiscoveryRecord[]> {
    try {
      const records = await prisma.systemConfig.findMany({
        where: {
          key: {
            startsWith: `discovery:${topicId}:`,
          },
        },
      })

      return records.map((r) => JSON.parse(r.value))
    } catch (error) {
      console.error('Failed to get discovery history:', error)
      return []
    }
  }

  /**
   * 获取论文的内容生成记录
   */
  async getContentGeneration(paperId: string): Promise<ContentGenerationRecord | null> {
    try {
      const record = await prisma.systemConfig.findUnique({
        where: { key: `content:${paperId}` },
      })

      if (record) {
        return JSON.parse(record.value)
      }
      return null
    } catch (error) {
      console.error('Failed to get content generation:', error)
      return null
    }
  }
}

// 导出单例
export const researchMemory = new ResearchMemory()
