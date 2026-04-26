/**
 * Cross-Topic Evidence Sharing Service
 *
 * Handles sharing evidence between topics in multi-topic research sessions.
 * Provides cross-reference suggestions and maintains topic-specific annotations.
 */

import { prisma } from '../../lib/prisma'
import {
  loadCrossTopicIndex,
  saveCrossTopicIndex,
  findCrossReferenceSuggestions,
  getSharedEvidenceSummary,
  type CrossTopicIndexState as _CrossTopicIndexState,
  type CrossReferenceSuggestion,
} from './cross-topic-index'

// ============================================================================
// Types
// ============================================================================

export interface EvidenceSharingResult {
  sourceTopicId: string
  targetTopicId: string
  sharedPapers: SharedPaperInfo[]
  relevanceReasons: string[]
}

export interface SharedPaperInfo {
  paperId: string
  title: string
  titleZh: string | null
  titleEn: string | null
  relevanceScore: number
  sourceStatus: 'admitted' | 'candidate' | 'rejected'
  suggestedStatus: 'candidate' | 'admitted'
}

export interface TopicEvidenceSharingReport {
  topicId: string
  topicName: string
  totalPapers: number
  sharedPapers: number
  sharedWithTopics: Array<{
    topicId: string
    topicName: string
    count: number
  }>
  potentialCrossReferences: number
}

// ============================================================================
// Constants
// ============================================================================

const EVIDENCE_SHARING_CONFIDENCE_THRESHOLD = 0.6
const MAX_SHARED_PAPERS_PER_TOPIC = 50

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check if a paper discovered for one topic is relevant to other topics
 * in the session and create cross-reference suggestions.
 */
export async function checkEvidenceRelevance(
  sessionId: string,
  topicIds: string[],
  sourceTopicId: string,
  paperId: string,
): Promise<CrossReferenceSuggestion[]> {
  const state = await loadCrossTopicIndex(sessionId, topicIds)
  if (!state) return []

  const suggestions: CrossReferenceSuggestion[] = []

  for (const targetTopicId of topicIds) {
    if (targetTopicId === sourceTopicId) continue

    const topicSuggestions = await findCrossReferenceSuggestions(state, sourceTopicId, targetTopicId)
    suggestions.push(...topicSuggestions.filter(s => s.paperId === paperId))
  }

  return suggestions
}

/**
 * Share evidence from one topic to another based on relevance.
 * Creates paper records in the target topic if they don't exist.
 */
export async function shareEvidenceToTopic(
  sessionId: string,
  sourceTopicId: string,
  targetTopicId: string,
  paperIds: string[],
): Promise<EvidenceSharingResult> {
  const state = await loadCrossTopicIndex(sessionId, [sourceTopicId, targetTopicId])
  if (!state) {
    return {
      sourceTopicId,
      targetTopicId,
      sharedPapers: [],
      relevanceReasons: ['Cross-topic index not found'],
    }
  }

  // Get source papers
  const sourcePapers = await prisma.papers.findMany({
    where: { id: { in: paperIds }, topicId: sourceTopicId },
    select: {
      id: true,
      title: true,
      titleZh: true,
      titleEn: true,
      summary: true,
      arxivUrl: true,
      openAlexId: true,
      pdfUrl: true,
      published: true,
      authors: true,
      status: true,
    },
  })

  const sharedPapers: SharedPaperInfo[] = []
  const relevanceReasons: string[] = []

  for (const paper of sourcePapers) {
    // Check if paper already exists in target topic
    const existingPaper = await prisma.papers.findFirst({
      where: {
        topicId: targetTopicId,
        OR: [
          { arxivUrl: paper.arxivUrl },
          { openAlexId: paper.openAlexId },
          { title: paper.title },
          { titleZh: paper.titleZh },
        ].filter(Boolean),
      },
    })

    if (existingPaper) {
      // Paper already exists in target topic, skip
      continue
    }

    // Create paper record in target topic as candidate
    const newPaper = await prisma.papers.create({
      data: {
        id: crypto.randomUUID(),
        topicId: targetTopicId,
        title: paper.title,
        titleZh: paper.titleZh,
        titleEn: paper.titleEn,
        summary: paper.summary,
        arxivUrl: paper.arxivUrl,
        openAlexId: paper.openAlexId,
        pdfUrl: paper.pdfUrl,
        published: paper.published ?? new Date(),
        authors: paper.authors,
        status: 'candidate',
        tags: JSON.stringify(['cross-topic-shared']),
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    })

    // Add to candidate pool
    await prisma.paper_candidate_pool.create({
      data: {
        id: crypto.randomUUID(),
        topicId: targetTopicId,
        paperId: newPaper.id,
        title: paper.title,
        authors: paper.authors,
        published: paper.published,
        summary: paper.summary,
        arxivUrl: paper.arxivUrl,
        openAlexId: paper.openAlexId,
        status: 'candidate',
        confidence: EVIDENCE_SHARING_CONFIDENCE_THRESHOLD,
        candidateType: 'cross-topic-shared',
        discoverySource: 'cross-topic-sharing',
        discoveryChannels: JSON.stringify([`shared-from:${sourceTopicId}`]),
        createdAt: new Date(),
      },
    })

    sharedPapers.push({
      paperId: newPaper.id,
      title: paper.title,
      titleZh: paper.titleZh,
      titleEn: paper.titleEn,
      relevanceScore: EVIDENCE_SHARING_CONFIDENCE_THRESHOLD,
      sourceStatus: paper.status as 'admitted' | 'candidate' | 'rejected',
      suggestedStatus: 'candidate',
    })

    relevanceReasons.push(`Paper "${paper.titleZh || paper.title}" shared from topic ${sourceTopicId}`)
  }

  // Update cross-topic index
  const targetTopic = await prisma.topics.findUnique({
    where: { id: targetTopicId },
    select: { nameZh: true, nameEn: true },
  })

  for (const sharedPaper of sharedPapers) {
    const entry = state.evidenceIndex.get(sharedPaper.paperId)
    if (entry && targetTopic) {
      entry.topicAnnotations.set(targetTopicId, {
        topicId: targetTopicId,
        topicName: targetTopic.nameZh || targetTopic.nameEn || targetTopicId,
        status: 'candidate',
        confidence: sharedPaper.relevanceScore,
        addedAt: new Date().toISOString(),
        nodeIds: [],
        stageIndex: null,
      })
      if (!entry.sharedWithTopics.includes(targetTopicId)) {
        entry.sharedWithTopics.push(targetTopicId)
      }
    }
  }

  await saveCrossTopicIndex(state)

  return {
    sourceTopicId,
    targetTopicId,
    sharedPapers,
    relevanceReasons,
  }
}

/**
 * Generate a report on evidence sharing for a topic
 */
export async function generateTopicEvidenceSharingReport(
  sessionId: string,
  topicId: string,
): Promise<TopicEvidenceSharingReport> {
  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    select: { id: true, nameZh: true, nameEn: true },
  })

  if (!topic) {
    return {
      topicId,
      topicName: 'Unknown',
      totalPapers: 0,
      sharedPapers: 0,
      sharedWithTopics: [],
      potentialCrossReferences: 0,
    }
  }

  const totalPapers = await prisma.papers.count({
    where: { topicId },
  })

  // Get cross-topic index state
  const state = await loadCrossTopicIndex(sessionId, [topicId])
  const sharedSummary = state ? getSharedEvidenceSummary(state, topicId) : null

  // Count potential cross-references (papers with cross-topic tags)
  const crossTaggedPapers = await prisma.papers.count({
    where: {
      topicId,
      tags: { contains: 'cross-topic-shared' },
    },
  })

  return {
    topicId,
    topicName: topic.nameZh || topic.nameEn || topicId,
    totalPapers,
    sharedPapers: sharedSummary?.totalShared ?? 0,
    sharedWithTopics: sharedSummary?.sharedWithTopics ?? [],
    potentialCrossReferences: crossTaggedPapers,
  }
}

/**
 * Find papers that could be shared across topics based on similarity
 */
export async function findShareableEvidence(
  sessionId: string,
  topicIds: string[],
): Promise<Array<{
  paperId: string
  sourceTopicId: string
  potentialTargets: Array<{
    topicId: string
    topicName: string
    relevanceScore: number
  }>
}>> {
  const state = await loadCrossTopicIndex(sessionId, topicIds)
  if (!state) return []

  const shareablePapers: Array<{
    paperId: string
    sourceTopicId: string
    potentialTargets: Array<{
      topicId: string
      topicName: string
      relevanceScore: number
    }>
  }> = []

  for (const sourceTopicId of topicIds) {
    for (const targetTopicId of topicIds) {
      if (sourceTopicId === targetTopicId) continue

      const suggestions = await findCrossReferenceSuggestions(state, sourceTopicId, targetTopicId)

      for (const suggestion of suggestions) {
        const existing = shareablePapers.find(p => p.paperId === suggestion.paperId)
        const targetInfo = {
          topicId: targetTopicId,
          topicName: state.topicProgress.get(targetTopicId)?.topicName || targetTopicId,
          relevanceScore: suggestion.relevanceScore,
        }

        if (existing) {
          if (!existing.potentialTargets.some(t => t.topicId === targetTopicId)) {
            existing.potentialTargets.push(targetInfo)
          }
        } else {
          shareablePapers.push({
            paperId: suggestion.paperId,
            sourceTopicId,
            potentialTargets: [targetInfo],
          })
        }
      }
    }
  }

  return shareablePapers
    .filter(p => p.potentialTargets.length > 0)
    .sort((a, b) =>
      Math.max(...b.potentialTargets.map(t => t.relevanceScore)) -
      Math.max(...a.potentialTargets.map(t => t.relevanceScore))
    )
    .slice(0, MAX_SHARED_PAPERS_PER_TOPIC)
}

/**
 * Log evidence sharing in session memory
 */
export async function logEvidenceSharingInMemory(
  topicId: string,
  args: {
    sourceTopicId: string
    targetTopicId: string
    paperCount: number
    summary: string
  },
): Promise<void> {
  const { recordTopicResearchStatus } = await import('./topic-session-memory.js')

  await recordTopicResearchStatus({
    topicId,
    headline: `Cross-topic evidence shared`,
    summary: args.summary,
  })
}

// ============================================================================
// Exports for Testing
// ============================================================================

export const __testing = {
  EVIDENCE_SHARING_CONFIDENCE_THRESHOLD,
  MAX_SHARED_PAPERS_PER_TOPIC,
}
