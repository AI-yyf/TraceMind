import type { PrismaClient } from '@prisma/client'

import {
  calculateImpactScore,
  searchPapers,
  type SemanticScholarPaper,
} from '../search/semantic-scholar'

export interface MonitoredTopic {
  topicId: string
  topicName: string
  searchQueries: string[]
  lastCheckedAt: Date | null
  paperIds: string[]
  knownPaperTitles: string[]
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

type MonitorNode = {
  id: string
  nodeLabel: string
  node_papers: Array<{
    papers: {
      id: string
      title: string
      titleZh: string
      titleEn: string | null
    }
  }>
}

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/gu, ' ').trim() ?? ''
}

function dedupe(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))]
}

function normalizePaperTitle(value: string) {
  return cleanText(value).toLowerCase()
}

function parseStringArray(value: string | null | undefined) {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') return item.trim()
          if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') return item.name.trim()
          return ''
        })
        .filter(Boolean)
    }
  } catch {
    // fall through
  }

  return value
    .replace(/\uFF0C/gu, ',')
    .split(/[;,]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function getMonitoredTopics(prisma: PrismaClient): Promise<MonitoredTopic[]> {
  const topics = await prisma.topics.findMany({
    where: { status: 'active' },
    include: {
      papers: {
        select: {
          id: true,
          title: true,
          titleZh: true,
          titleEn: true,
          tags: true,
        },
      },
    },
  })

  return topics.map((topic) => ({
    topicId: topic.id,
    topicName: topic.nameZh,
    searchQueries: generateSearchQueries(topic),
    lastCheckedAt: topic.updatedAt,
    paperIds: topic.papers.map((paper) => paper.id),
    knownPaperTitles: dedupe(
      topic.papers.flatMap((paper) => [paper.titleZh, paper.titleEn, paper.title]),
    ).map(normalizePaperTitle),
  }))
}

function generateSearchQueries(topic: {
  nameZh: string
  nameEn: string | null
  focusLabel: string | null
  summary: string | null
  papers: Array<{
    title: string
    titleZh: string
    titleEn: string | null
    tags: string
  }>
}) {
  const tagSeeds = topic.papers.flatMap((paper) => parseStringArray(paper.tags)).slice(0, 6)
  const titleSeeds = topic.papers.flatMap((paper) => [paper.titleZh, paper.titleEn, paper.title]).slice(0, 4)

  return dedupe([
    topic.nameZh,
    topic.nameEn,
    topic.focusLabel,
    cleanText(topic.summary).split(/[銆?!?]/u)[0],
    ...tagSeeds,
    ...titleSeeds,
  ]).slice(0, 8)
}

function isKnownPaper(paper: SemanticScholarPaper, topic: MonitoredTopic) {
  return topic.knownPaperTitles.includes(normalizePaperTitle(paper.title))
}

function calculateRelevanceScore(paper: SemanticScholarPaper, topic: MonitoredTopic, query: string) {
  const normalizedTitle = normalizePaperTitle(paper.title)
  const normalizedAbstract = normalizePaperTitle(paper.abstract || '')
  const queryWords = normalizePaperTitle(query).split(/\s+/u).filter(Boolean)
  const topicWords = normalizePaperTitle(topic.topicName).split(/\s+/u).filter(Boolean)

  let score = 0

  if (normalizedTitle.includes(normalizePaperTitle(query))) score += 0.4

  if (queryWords.length > 0) {
    const abstractMatches = queryWords.filter((word) => normalizedAbstract.includes(word)).length
    score += (abstractMatches / queryWords.length) * 0.3
  }

  if (topicWords.length > 0) {
    const titleMatches = topicWords.filter((word) => normalizedTitle.includes(word)).length
    score += (titleMatches / topicWords.length) * 0.2
  }

  score += Math.min(calculateImpactScore(paper) / 100, 0.1)

  return Math.min(1, score)
}

function suggestAction(paper: SemanticScholarPaper, relevanceScore: number): NewPaperMatch['suggestedAction'] {
  if (relevanceScore < 0.45) return 'ignore'
  if (relevanceScore >= 0.8 || calculateImpactScore(paper) >= 18) return 'create_new_node'
  return 'add_to_existing'
}

function generateReason(paper: SemanticScholarPaper, relevanceScore: number) {
  const reasons: string[] = []

  if (relevanceScore >= 0.8) reasons.push('高度相关')
  else if (relevanceScore >= 0.6) reasons.push('中度相关')

  if (paper.citationCount >= 100) reasons.push('高引用')
  if (paper.year >= new Date().getFullYear() - 1) reasons.push('近期发表')

  return reasons.join('，') || '潜在相关'
}

export async function monitorTopic(
  prisma: PrismaClient,
  topic: MonitoredTopic,
  options: {
    yearStart?: number
    minRelevanceScore?: number
  } = {},
): Promise<MonitorResult> {
  const { yearStart = new Date().getFullYear() - 1, minRelevanceScore = 0.6 } = options
  const newPapers: NewPaperMatch[] = []
  const seenTitles = new Set(topic.knownPaperTitles)

  for (const query of topic.searchQueries) {
    const results = await searchPapers(query, { limit: 20, yearStart })

    for (const paper of results) {
      const normalizedTitle = normalizePaperTitle(paper.title)
      if (seenTitles.has(normalizedTitle) || isKnownPaper(paper, topic)) continue

      const relevanceScore = calculateRelevanceScore(paper, topic, query)
      if (relevanceScore < minRelevanceScore) continue

      newPapers.push({
        paperId: paper.paperId,
        title: paper.title,
        authors: paper.authors.map((author) => author.name),
        year: paper.year,
        abstract: paper.abstract || '',
        citationCount: paper.citationCount,
        relevanceScore,
        matchedQuery: query,
        suggestedAction: suggestAction(paper, relevanceScore),
        reason: generateReason(paper, relevanceScore),
      })

      seenTitles.add(normalizedTitle)
    }
  }

  newPapers.sort((left, right) => right.relevanceScore - left.relevanceScore)
  const updateSuggestions = await generateUpdateSuggestions(prisma, topic, newPapers)

  return {
    topicId: topic.topicId,
    topicName: topic.topicName,
    checkedAt: new Date(),
    newPapersFound: newPapers.length,
    newPapers: newPapers.slice(0, 20),
    updateSuggestions,
  }
}

function calculateNodeMatchScore(paper: NewPaperMatch, node: MonitorNode) {
  const paperTitle = normalizePaperTitle(paper.title)
  const labelWords = normalizePaperTitle(node.nodeLabel).split(/\s+/u).filter(Boolean)

  let score = 0

  if (labelWords.length > 0) {
    const labelMatches = labelWords.filter((word) => paperTitle.includes(word)).length
    score += (labelMatches / labelWords.length) * 0.5
  }

  for (const nodePaper of node.node_papers.slice(0, 3)) {
    const sourceTitle = normalizePaperTitle(nodePaper.papers.titleZh || nodePaper.papers.titleEn || nodePaper.papers.title)
    const sourceWords = sourceTitle.split(/\s+/u).filter(Boolean)
    if (sourceWords.length === 0) continue
    const sourceMatches = sourceWords.filter((word) => paperTitle.includes(word)).length
    score += (sourceMatches / sourceWords.length) * 0.15
  }

  return Math.min(1, score)
}

function findBestMatchingNode(paper: NewPaperMatch, nodes: MonitorNode[]) {
  let best: { id: string; nodeLabel: string; score: number } | null = null

  for (const node of nodes) {
    const score = calculateNodeMatchScore(paper, node)
    if (!best || score > best.score) {
      best = { id: node.id, nodeLabel: node.nodeLabel, score }
    }
  }

  return best && best.score >= 0.28 ? best : null
}

async function generateUpdateSuggestions(
  prisma: PrismaClient,
  topic: MonitoredTopic,
  newPapers: NewPaperMatch[],
): Promise<UpdateSuggestion[]> {
  const nodes = await prisma.research_nodes.findMany({
    where: { topicId: topic.topicId },
    include: {
        node_papers: {
        include: {
          papers: {
            select: {
              id: true,
              title: true,
              titleZh: true,
              titleEn: true,
            },
          },
        },
      },
    },
  })

  const suggestions: UpdateSuggestion[] = []

  for (const paper of newPapers.filter((item) => item.suggestedAction === 'add_to_existing')) {
    const bestNode = findBestMatchingNode(paper, nodes)
    if (!bestNode) continue

    paper.suggestedNodeId = bestNode.id
    const existing = suggestions.find((item) => item.nodeId === bestNode.id)

    if (existing) {
      existing.affectedPapers.push(paper.paperId)
      existing.suggestedChanges.push({
        type: 'add_paper',
        description: `添加论文：${paper.title}`,
      })
      continue
    }

    suggestions.push({
      nodeId: bestNode.id,
      nodeTitle: bestNode.nodeLabel,
      reason: '发现与该节点高度相关的新论文',
      affectedPapers: [paper.paperId],
      suggestedChanges: [
        {
          type: 'add_paper',
          description: `添加论文：${paper.title}`,
        },
      ],
    })
  }

  const newNodeCandidates = newPapers.filter((item) => item.suggestedAction === 'create_new_node')
  if (newNodeCandidates.length > 0) {
    suggestions.push({
      nodeId: 'new',
      nodeTitle: '建议新建节点',
      reason: `发现 ${newNodeCandidates.length} 篇高价值候选论文，值得单独追踪`,
      affectedPapers: newNodeCandidates.map((item) => item.paperId),
      suggestedChanges: newNodeCandidates.map((item) => ({
        type: 'restructure',
        description: `为「${item.title}」创建新节点`,
      })),
    })
  }

return suggestions
}

export async function runFullMonitor(
  prisma: PrismaClient,
  options: {
    topicIds?: string[]
    yearStart?: number
  } = {},
): Promise<MonitorResult[]> {
  const topics = await getMonitoredTopics(prisma)
  const filteredTopics = options.topicIds
    ? topics.filter((topic) => options.topicIds?.includes(topic.topicId))
    : topics

  const results: MonitorResult[] = []

  for (const topic of filteredTopics) {
    try {
      const result = await monitorTopic(prisma, topic, options)
      results.push(result)
      await prisma.topics.update({
        where: { id: topic.topicId },
        data: { updatedAt: new Date() },
      })
    } catch (error) {
      console.error(`Failed to monitor topic ${topic.topicId}:`, error)
    }
  }

  return results
}
