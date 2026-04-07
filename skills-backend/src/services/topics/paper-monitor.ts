/**
 * 论文监控服务
 * 
 * 每日监控新论文，识别与现有主题相关的研究
 * 提供增量更新建议和通知
 */

import type { PrismaClient } from '@prisma/client'
import { searchPapers, getPaperDetails, calculateImpactScore } from '../search/semantic-scholar'

export interface MonitoredTopic {
  topicId: string
  topicName: string
  searchQueries: string[]
  lastCheckedAt: Date | null
  paperIds: string[] // 已有论文ID
}

export interface NewPaperMatch {
  paperId: string
  title: string
  authors: string[]
  year: number
  abstract: string
  citationCount: number
  relevanceScore: number
  matchedQuery: string
  suggestedNodeId?: string
  suggestedAction: 'add_to_existing' | 'create_new_node' | 'ignore'
  reason: string
}

export interface UpdateSuggestion {
  nodeId: string
  nodeTitle: string
  reason: string
  affectedPapers: string[]
  suggestedChanges: Array<{
    type: 'add_paper' | 'update_content' | 'restructure'
    description: string
  }>
}

export interface MonitorResult {
  topicId: string
  topicName: string
  checkedAt: Date
  newPapersFound: number
  newPapers: NewPaperMatch[]
  updateSuggestions: UpdateSuggestion[]
}

/**
 * 获取所有需要监控的主题
 */
export async function getMonitoredTopics(prisma: PrismaClient): Promise<MonitoredTopic[]> {
  const topics = await prisma.topic.findMany({
    where: { status: 'active' },
    include: {
      papers: { select: { id: true } },
      stages: {
        include: {
          nodes: { select: { id: true, title: true } },
        },
      },
    },
  })

  return topics.map(topic => ({
    topicId: topic.id,
    topicName: topic.name,
    searchQueries: generateSearchQueries(topic),
    lastCheckedAt: topic.updatedAt,
    paperIds: topic.papers.map(p => p.id),
  }))
}

/**
 * 为主题生成搜索查询
 */
function generateSearchQueries(topic: any): string[] {
  const queries: string[] = []

  // 基础查询：主题名称
  queries.push(topic.name)
  if (topic.nameEn && topic.nameEn !== topic.name) {
    queries.push(topic.nameEn)
  }

  // 从关键词生成查询
  if (topic.keywords) {
    try {
      const keywords = typeof topic.keywords === 'string'
        ? JSON.parse(topic.keywords)
        : topic.keywords

      if (Array.isArray(keywords)) {
        // 前3个关键词组合
        const topKeywords = keywords.slice(0, 3)
        if (topKeywords.length > 1) {
          queries.push(topKeywords.join(' '))
        }
      }
    } catch {
      // 忽略解析错误
    }
  }

  return [...new Set(queries)]
}

/**
 * 监控单个主题的新论文
 */
export async function monitorTopic(
  prisma: PrismaClient,
  topic: MonitoredTopic,
  options: {
    yearStart?: number
    minRelevanceScore?: number
  } = {}
): Promise<MonitorResult> {
  const { yearStart = new Date().getFullYear() - 1, minRelevanceScore = 0.6 } = options

  const newPapers: NewPaperMatch[] = []
  const seenPaperIds = new Set(topic.paperIds)

  // 对每个查询执行搜索
  for (const query of topic.searchQueries) {
    const searchResults = await searchPapers(query, {
      limit: 20,
      yearStart,
    })

    for (const paper of searchResults) {
      // 跳过已有论文
      if (seenPaperIds.has(paper.paperId)) continue

      // 计算相关性分数
      const relevanceScore = calculateRelevanceScore(paper, topic, query)

      if (relevanceScore >= minRelevanceScore) {
        newPapers.push({
          paperId: paper.paperId,
          title: paper.title,
          authors: paper.authors?.map(a => a.name) || [],
          year: paper.year,
          abstract: paper.abstract || '',
          citationCount: paper.citationCount,
          relevanceScore,
          matchedQuery: query,
          suggestedAction: suggestAction(paper, relevanceScore),
          reason: generateReason(paper, relevanceScore),
        })

        seenPaperIds.add(paper.paperId)
      }
    }
  }

  // 按相关性排序
  newPapers.sort((a, b) => b.relevanceScore - a.relevanceScore)

  // 生成更新建议
  const updateSuggestions = await generateUpdateSuggestions(prisma, topic, newPapers)

  return {
    topicId: topic.topicId,
    topicName: topic.topicName,
    checkedAt: new Date(),
    newPapersFound: newPapers.length,
    newPapers: newPapers.slice(0, 20), // 限制结果数量
    updateSuggestions,
  }
}

/**
 * 计算论文与主题的相关性分数
 */
function calculateRelevanceScore(
  paper: { title: string; abstract?: string; fieldsOfStudy?: string[] },
  topic: MonitoredTopic,
  matchedQuery: string
): number {
  let score = 0

  // 标题匹配
  const titleLower = paper.title.toLowerCase()
  const queryLower = matchedQuery.toLowerCase()
  if (titleLower.includes(queryLower)) {
    score += 0.4
  }

  // 摘要匹配
  if (paper.abstract) {
    const abstractLower = paper.abstract.toLowerCase()
    const queryWords = queryLower.split(/\s+/)
    const matchCount = queryWords.filter(w => abstractLower.includes(w)).length
    score += (matchCount / queryWords.length) * 0.3
  }

  // 领域匹配
  if (paper.fieldsOfStudy?.some(f => matchedQuery.toLowerCase().includes(f.toLowerCase()))) {
    score += 0.2
  }

  // 标题关键词密度
  const keywords = matchedQuery.split(/\s+/)
  const titleMatches = keywords.filter(k => titleLower.includes(k.toLowerCase())).length
  score += (titleMatches / keywords.length) * 0.1

  return Math.min(score, 1.0)
}

/**
 * 建议对新论文采取的行动
 */
function suggestAction(
  paper: { year: number; citationCount: number },
  relevanceScore: number
): 'add_to_existing' | 'create_new_node' | 'ignore' {
  if (relevanceScore < 0.5) return 'ignore'
  if (paper.citationCount > 100 || relevanceScore > 0.85) return 'create_new_node'
  return 'add_to_existing'
}

/**
 * 生成推荐理由
 */
function generateReason(
  paper: { citationCount: number; year: number },
  relevanceScore: number
): string {
  const reasons: string[] = []

  if (relevanceScore > 0.8) {
    reasons.push('高度相关')
  } else if (relevanceScore > 0.6) {
    reasons.push('中度相关')
  }

  if (paper.citationCount > 100) {
    reasons.push('高引用')
  }

  if (paper.year >= new Date().getFullYear() - 1) {
    reasons.push('最新发表')
  }

  return reasons.join('，') || '潜在相关'
}

/**
 * 生成更新建议
 */
async function generateUpdateSuggestions(
  prisma: PrismaClient,
  topic: MonitoredTopic,
  newPapers: NewPaperMatch[]
): Promise<UpdateSuggestion[]> {
  const suggestions: UpdateSuggestion[] = []

  // 获取主题的节点结构
  const nodes = await prisma.node.findMany({
    where: { topicId: topic.topicId },
    include: {
      papers: { select: { id: true, title: true } },
    },
  })

  // 为每篇新论文建议最佳节点
  for (const paper of newPapers.filter(p => p.suggestedAction === 'add_to_existing')) {
    const bestNode = findBestMatchingNode(paper, nodes)

    if (bestNode) {
      paper.suggestedNodeId = bestNode.id

      const existingSuggestion = suggestions.find(s => s.nodeId === bestNode.id)
      if (existingSuggestion) {
        existingSuggestion.affectedPapers.push(paper.paperId)
        existingSuggestion.suggestedChanges.push({
          type: 'add_paper',
          description: `添加论文: ${paper.title}`,
        })
      } else {
        suggestions.push({
          nodeId: bestNode.id,
          nodeTitle: bestNode.title,
          reason: `发现 ${newPapers.filter(p => p.suggestedNodeId === bestNode.id).length} 篇相关新论文`,
          affectedPapers: [paper.paperId],
          suggestedChanges: [{
            type: 'add_paper',
            description: `添加论文: ${paper.title}`,
          }],
        })
      }
    }
  }

  // 建议创建新节点的论文
  const newNodeCandidates = newPapers.filter(p => p.suggestedAction === 'create_new_node')
  if (newNodeCandidates.length > 0) {
    suggestions.push({
      nodeId: 'new',
      nodeTitle: '建议新节点',
      reason: `发现 ${newNodeCandidates.length} 篇高影响力新论文，建议创建新节点`,
      affectedPapers: newNodeCandidates.map(p => p.paperId),
      suggestedChanges: newNodeCandidates.map(p => ({
        type: 'restructure',
        description: `为新论文创建节点: ${p.title}`,
      })),
    })
  }

  return suggestions
}

/**
 * 找到最佳匹配的节点
 */
function findBestMatchingNode(
  paper: NewPaperMatch,
  nodes: Array<{ id: string; title: string; papers: Array<{ id: string; title: string }> }>
): { id: string; title: string } | null {
  let bestMatch: { id: string; title: string; score: number } | null = null

  for (const node of nodes) {
    const score = calculateNodeMatchScore(paper, node)
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: node.id, title: node.title, score }
    }
  }

  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null
}

/**
 * 计算论文与节点的匹配分数
 */
function calculateNodeMatchScore(
  paper: NewPaperMatch,
  node: { title: string; papers: Array<{ title: string }> }
): number {
  let score = 0

  // 标题相似度
  const paperTitle = paper.title.toLowerCase()
  const nodeTitle = node.title.toLowerCase()
  const titleWords = nodeTitle.split(/\s+/)
  const matches = titleWords.filter(w => paperTitle.includes(w)).length
  score += (matches / titleWords.length) * 0.5

  // 与节点内论文的相似度
  for (const nodePaper of node.papers.slice(0, 3)) {
    const nodePaperTitle = nodePaper.title.toLowerCase()
    const paperWords = nodePaperTitle.split(/\s+/)
    const paperMatches = paperWords.filter(w => paperTitle.includes(w)).length
    score += (paperMatches / paperWords.length) * 0.1
  }

  return Math.min(score, 1.0)
}

/**
 * 运行完整监控周期
 */
export async function runFullMonitor(
  prisma: PrismaClient,
  options: {
    topicIds?: string[]
    yearStart?: number
  } = {}
): Promise<MonitorResult[]> {
  const topics = await getMonitoredTopics(prisma)

  const filteredTopics = options.topicIds
    ? topics.filter(t => options.topicIds!.includes(t.topicId))
    : topics

  const results: MonitorResult[] = []

  for (const topic of filteredTopics) {
    try {
      const result = await monitorTopic(prisma, topic, options)
      results.push(result)

      // 更新主题的最后检查时间
      await prisma.topic.update({
        where: { id: topic.topicId },
        data: { updatedAt: new Date() },
      })
    } catch (error) {
      console.error(`Failed to monitor topic ${topic.topicId}:`, error)
    }
  }

  return results
}
