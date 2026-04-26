/**
 * Cross-Topic Evidence Index
 *
 * Manages shared evidence across multiple topics in a research session.
 * Handles deduplication, cross-referencing, and topic-specific annotations.
 */

import { prisma } from '../../lib/prisma'

// ============================================================================
// Types
// ============================================================================

export interface CrossTopicEvidenceEntry {
  paperId: string
  title: string
  titleZh: string | null
  titleEn: string | null
  arxivUrl: string | null
  openAlexId: string | null
  semanticScholarId: string | null
  summary: string | null
  published: Date | null
  topicAnnotations: Map<string, TopicSpecificAnnotation>
  sharedWithTopics: string[]
  deduplicationKey: string
}

export interface TopicSpecificAnnotation {
  topicId: string
  topicName: string
  status: 'admitted' | 'candidate' | 'rejected'
  confidence: number
  citeIntent?: string | null
  explanation?: string | null
  nodeIds: string[]
  stageIndex: number | null
  addedAt: string
}

export interface CrossTopicIndexState {
  schemaVersion: string
  sessionId: string
  topicIds: string[]
  updatedAt: string
  evidenceIndex: Map<string, CrossTopicEvidenceEntry>
  topicProgress: Map<string, TopicRoundRobinProgress>
  topicSwitchLog: TopicSwitchLogEntry[]
}

export interface TopicRoundRobinProgress {
  topicId: string
  topicName: string
  cyclesCompleted: number
  currentStage: number
  totalStages: number
  lastCycleAt: string | null
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  status: 'active' | 'paused' | 'completed' | 'failed'
}

export interface TopicSwitchLogEntry {
  timestamp: string
  fromTopicId: string | null
  toTopicId: string
  reason: 'round-robin' | 'manual' | 'completion' | 'error'
  summary: string
}

export interface CrossReferenceSuggestion {
  paperId: string
  sourceTopicId: string
  targetTopicId: string
  relevanceScore: number
  reason: string
}

// ============================================================================
// Constants
// ============================================================================

const CROSS_TOPIC_INDEX_KEY_PREFIX = 'cross-topic-index:v1:'
const DEDUPLICATION_MATCH_THRESHOLD = 0.85

// ============================================================================
// Utility Functions
// ============================================================================

function crossTopicIndexKey(sessionId: string): string {
  return `${CROSS_TOPIC_INDEX_KEY_PREFIX}${sessionId}`
}

function clipText(value: string | null | undefined, maxLength = 220): string {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function generateDeduplicationKey(paper: {
  arxivUrl?: string | null
  openAlexId?: string | null
  title?: string | null
  titleZh?: string | null
}): string {
  // Priority: arxiv > openAlex > normalized title
  if (paper.arxivUrl) {
    const arxivMatch = paper.arxivUrl.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/iu)
    if (arxivMatch?.[1]) {
      return `arxiv:${arxivMatch[1].toLowerCase()}`
    }
  }

  if (paper.openAlexId) {
    return `openalex:${paper.openAlexId.toLowerCase()}`
  }

  // Normalize title for deduplication
  const title = paper.titleZh || paper.title || ''
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)

  return `title:${normalized}`
}

function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (t: string) =>
    t.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()

  const n1 = normalize(title1)
  const n2 = normalize(title2)

  if (n1 === n2) return 1.0
  if (!n1 || !n2) return 0.0

  // Simple word overlap similarity
  const words1 = new Set(n1.split(/\s+/))
  const words2 = new Set(n2.split(/\s+/))

  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

function emptyState(sessionId: string, topicIds: string[]): CrossTopicIndexState {
  return {
    schemaVersion: 'cross-topic-index-v1',
    sessionId,
    topicIds,
    updatedAt: new Date().toISOString(),
    evidenceIndex: new Map(),
    topicProgress: new Map(
      topicIds.map(id => [id, {
        topicId: id,
        topicName: '',
        cyclesCompleted: 0,
        currentStage: 1,
        totalStages: 5,
        lastCycleAt: null,
        discoveredPapers: 0,
        admittedPapers: 0,
        generatedContents: 0,
        status: 'active',
      }])
    ),
    topicSwitchLog: [],
  }
}

function parseState(value: string | null | undefined, sessionId: string, topicIds: string[]): CrossTopicIndexState {
  if (!value) return emptyState(sessionId, topicIds)

  try {
    const parsed = JSON.parse(value) as Partial<CrossTopicIndexState>

    const evidenceIndex = new Map<string, CrossTopicEvidenceEntry>()
    if (parsed.evidenceIndex && typeof parsed.evidenceIndex === 'object') {
      const entries = Array.isArray(parsed.evidenceIndex)
        ? parsed.evidenceIndex
        : Object.entries(parsed.evidenceIndex)

      for (const entry of entries) {
        if (Array.isArray(entry)) {
          const [key, value] = entry
          if (value && typeof value === 'object') {
            evidenceIndex.set(key, {
              ...value,
              topicAnnotations: new Map(Object.entries(value.topicAnnotations || {})),
            } as CrossTopicEvidenceEntry)
          }
        }
      }
    }

    const topicProgress = new Map<string, TopicRoundRobinProgress>()
    if (parsed.topicProgress && typeof parsed.topicProgress === 'object') {
      const entries = Array.isArray(parsed.topicProgress)
        ? parsed.topicProgress
        : Object.entries(parsed.topicProgress)

      for (const entry of entries) {
        if (Array.isArray(entry)) {
          const [key, value] = entry
          if (value && typeof value === 'object') {
            topicProgress.set(key, value as TopicRoundRobinProgress)
          }
        }
      }
    }

    return {
      schemaVersion: parsed.schemaVersion || 'cross-topic-index-v1',
      sessionId,
      topicIds: Array.isArray(parsed.topicIds) ? parsed.topicIds : topicIds,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      evidenceIndex,
      topicProgress,
      topicSwitchLog: Array.isArray(parsed.topicSwitchLog) ? parsed.topicSwitchLog : [],
    }
  } catch {
    return emptyState(sessionId, topicIds)
  }
}

function serializeState(state: CrossTopicIndexState): string {
  return JSON.stringify({
    schemaVersion: state.schemaVersion,
    sessionId: state.sessionId,
    topicIds: state.topicIds,
    updatedAt: state.updatedAt,
    evidenceIndex: Object.fromEntries(
      Array.from(state.evidenceIndex.entries()).map(([key, entry]) => [
        key,
        {
          ...entry,
          topicAnnotations: Object.fromEntries(entry.topicAnnotations),
        },
      ])
    ),
    topicProgress: Object.fromEntries(state.topicProgress),
    topicSwitchLog: state.topicSwitchLog,
  })
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load the cross-topic index state for a session
 */
export async function loadCrossTopicIndex(
  sessionId: string,
  topicIds: string[],
): Promise<CrossTopicIndexState> {
  const record = await prisma.system_configs.findUnique({
    where: { key: crossTopicIndexKey(sessionId) },
  })

  return parseState(record?.value, sessionId, topicIds)
}

/**
 * Save the cross-topic index state
 */
export async function saveCrossTopicIndex(state: CrossTopicIndexState): Promise<void> {
  await prisma.system_configs.upsert({
    where: { key: crossTopicIndexKey(state.sessionId) },
    update: {
      value: serializeState(state),
      updatedAt: new Date()
    },
    create: {
      id: crypto.randomUUID(),
      key: crossTopicIndexKey(state.sessionId),
      value: serializeState(state),
      updatedAt: new Date(),
    },
  })
}

/**
 * Initialize a new cross-topic index for a multi-topic session
 */
export async function initializeCrossTopicIndex(
  sessionId: string,
  topicIds: string[],
): Promise<CrossTopicIndexState> {
  // Load topic info for progress tracking
  const topics = await prisma.topics.findMany({
    where: { id: { in: topicIds } },
    select: { id: true, nameZh: true, nameEn: true },
  })

  const state = emptyState(sessionId, topicIds)

  for (const topic of topics) {
    const progress = state.topicProgress.get(topic.id)
    if (progress) {
      progress.topicName = topic.nameZh || topic.nameEn || topic.id
    }
  }

  await saveCrossTopicIndex(state)
  return state
}

/**
 * Register a paper in the cross-topic index
 * Returns true if this is a new paper, false if it was deduplicated
 */
export async function registerPaperInIndex(
  state: CrossTopicIndexState,
  paper: {
    paperId: string
    topicId: string
    title: string
    titleZh?: string | null
    titleEn?: string | null
    arxivUrl?: string | null
    openAlexId?: string | null
    semanticScholarId?: string | null
    summary?: string | null
    published?: Date | null
    status: 'admitted' | 'candidate' | 'rejected'
    confidence: number
    citeIntent?: string | null
    explanation?: string | null
    nodeIds?: string[]
    stageIndex?: number | null
  },
  topicName: string,
): Promise<{
  isNew: boolean
  entry: CrossTopicEvidenceEntry
  sharedWithExisting: boolean
}> {
  const deduplicationKey = generateDeduplicationKey(paper)

  // Check for existing entry with same deduplication key
  let existingEntry: CrossTopicEvidenceEntry | undefined
  for (const entry of state.evidenceIndex.values()) {
    if (entry.deduplicationKey === deduplicationKey) {
      existingEntry = entry
      break
    }

    // Also check title similarity for papers without arxiv/openalex
    if (!paper.arxivUrl && !paper.openAlexId) {
      const similarity = calculateTitleSimilarity(
        paper.titleZh || paper.title,
        entry.titleZh || entry.title
      )
      if (similarity >= DEDUPLICATION_MATCH_THRESHOLD) {
        existingEntry = entry
        break
      }
    }
  }

  const annotation: TopicSpecificAnnotation = {
    topicId: paper.topicId,
    topicName,
    status: paper.status,
    confidence: paper.confidence,
    citeIntent: paper.citeIntent,
    explanation: paper.explanation,
    nodeIds: paper.nodeIds || [],
    stageIndex: paper.stageIndex ?? null,
    addedAt: new Date().toISOString(),
  }

  if (existingEntry) {
    // Add topic annotation to existing entry
    existingEntry.topicAnnotations.set(paper.topicId, annotation)

    // Update shared topics list
    if (!existingEntry.sharedWithTopics.includes(paper.topicId)) {
      existingEntry.sharedWithTopics.push(paper.topicId)
    }

    state.updatedAt = new Date().toISOString()

    return {
      isNew: false,
      entry: existingEntry,
      sharedWithExisting: true,
    }
  }

  // Create new entry
  const newEntry: CrossTopicEvidenceEntry = {
    paperId: paper.paperId,
    title: paper.title,
    titleZh: paper.titleZh ?? null,
    titleEn: paper.titleEn ?? null,
    arxivUrl: paper.arxivUrl ?? null,
    openAlexId: paper.openAlexId ?? null,
    semanticScholarId: paper.semanticScholarId ?? null,
    summary: paper.summary ?? null,
    published: paper.published ?? null,
    topicAnnotations: new Map([[paper.topicId, annotation]]),
    sharedWithTopics: [paper.topicId],
    deduplicationKey,
  }

  state.evidenceIndex.set(paper.paperId, newEntry)
  state.updatedAt = new Date().toISOString()

  return {
    isNew: true,
    entry: newEntry,
    sharedWithExisting: false,
  }
}

/**
 * Update topic progress in the round-robin scheduler
 */
export function updateTopicProgress(
  state: CrossTopicIndexState,
  topicId: string,
  update: Partial<TopicRoundRobinProgress>,
): void {
  const progress = state.topicProgress.get(topicId)
  if (progress) {
    Object.assign(progress, update)
    state.updatedAt = new Date().toISOString()
  }
}

/**
 * Log a topic switch in the session memory
 */
export function logTopicSwitch(
  state: CrossTopicIndexState,
  fromTopicId: string | null,
  toTopicId: string,
  reason: TopicSwitchLogEntry['reason'],
  summary: string,
): void {
  state.topicSwitchLog.push({
    timestamp: new Date().toISOString(),
    fromTopicId,
    toTopicId,
    reason,
    summary: clipText(summary, 280),
  })

  // Keep log bounded
  if (state.topicSwitchLog.length > 100) {
    state.topicSwitchLog = state.topicSwitchLog.slice(-100)
  }

  state.updatedAt = new Date().toISOString()
}

/**
 * Get the next topic in round-robin order
 */
export function getNextRoundRobinTopic(
  state: CrossTopicIndexState,
  currentTopicId: string | null,
): string | null {
  const activeTopics = state.topicIds.filter(id => {
    const progress = state.topicProgress.get(id)
    return progress && progress.status === 'active'
  })

  if (activeTopics.length === 0) return null

  if (!currentTopicId) {
    return activeTopics[0]
  }

  const currentIndex = activeTopics.indexOf(currentTopicId)
  if (currentIndex === -1) {
    return activeTopics[0]
  }

  const nextIndex = (currentIndex + 1) % activeTopics.length
  return activeTopics[nextIndex]
}

/**
 * Find papers that might be relevant to other topics in the session
 */
export async function findCrossReferenceSuggestions(
  state: CrossTopicIndexState,
  sourceTopicId: string,
  targetTopicId: string,
): Promise<CrossReferenceSuggestion[]> {
  const suggestions: CrossReferenceSuggestion[] = []

  // Get papers from source topic
  const sourcePapers = Array.from(state.evidenceIndex.values())
    .filter(entry => entry.topicAnnotations.has(sourceTopicId))

  // Get target topic info for relevance check
  const targetTopic = await prisma.topics.findUnique({
    where: { id: targetTopicId },
    select: {
      id: true,
      nameZh: true,
      nameEn: true,
      focusLabel: true,
      summary: true
    },
  })

  if (!targetTopic) return []

  const targetKeywords = extractKeywords([
    targetTopic.nameZh,
    targetTopic.nameEn,
    targetTopic.focusLabel,
    targetTopic.summary,
  ])

  for (const paper of sourcePapers) {
    // Skip if already in target topic
    if (paper.topicAnnotations.has(targetTopicId)) continue

    // Calculate relevance based on title/summary overlap with target topic
    const paperKeywords = extractKeywords([
      paper.title,
      paper.titleZh,
      paper.titleEn,
      paper.summary,
    ])

    const overlap = paperKeywords.filter(kw => targetKeywords.includes(kw))
    const relevanceScore = overlap.length / Math.max(1, Math.min(paperKeywords.length, targetKeywords.length))

    if (relevanceScore >= 0.15) {
      suggestions.push({
        paperId: paper.paperId,
        sourceTopicId,
        targetTopicId,
        relevanceScore,
        reason: `Paper shares ${overlap.length} keywords with target topic: ${overlap.slice(0, 3).join(', ')}`,
      })
    }
  }

  return suggestions
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10)
}

/**
 * Extract keywords from text for relevance matching
 */
function extractKeywords(texts: Array<string | null | undefined>): string[] {
  const combined = texts.filter(Boolean).join(' ').toLowerCase()

  // Simple keyword extraction: alphanumeric sequences of 3+ chars
  const matches = combined.match(/[a-z][a-z0-9_-]{2,}/gu) || []

  // Filter common stopwords
  const stopwords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'will', 'from',
    'this', 'that', 'with', 'which', 'their', 'there', 'would', 'about',
  ])

  return [...new Set(matches.filter(m => !stopwords.has(m)))]
}

/**
 * Get shared evidence summary for a topic
 */
export function getSharedEvidenceSummary(
  state: CrossTopicIndexState,
  topicId: string,
): {
  totalShared: number
  sharedWithTopics: Array<{ topicId: string; topicName: string; count: number }>
} {
  const sharedPapers = Array.from(state.evidenceIndex.values())
    .filter(entry => {
      const annotation = entry.topicAnnotations.get(topicId)
      return annotation && entry.sharedWithTopics.length > 1
    })

  const topicCounts = new Map<string, number>()

  for (const paper of sharedPapers) {
    for (const otherTopicId of paper.sharedWithTopics) {
      if (otherTopicId !== topicId) {
        topicCounts.set(otherTopicId, (topicCounts.get(otherTopicId) || 0) + 1)
      }
    }
  }

  const sharedWithTopics = Array.from(topicCounts.entries())
    .map(([id, count]) => {
      const progress = state.topicProgress.get(id)
      return {
        topicId: id,
        topicName: progress?.topicName || id,
        count,
      }
    })
    .sort((a, b) => b.count - a.count)

  return {
    totalShared: sharedPapers.length,
    sharedWithTopics,
  }
}

/**
 * Get round-robin session summary
 */
export function getRoundRobinSessionSummary(
  state: CrossTopicIndexState,
): {
  totalTopics: number
  activeTopics: number
  completedTopics: number
  failedTopics: number
  totalCycles: number
  totalEvidence: number
  sharedEvidence: number
  recentSwitches: TopicSwitchLogEntry[]
} {
  const progressValues = Array.from(state.topicProgress.values())

  return {
    totalTopics: state.topicIds.length,
    activeTopics: progressValues.filter(p => p.status === 'active').length,
    completedTopics: progressValues.filter(p => p.status === 'completed').length,
    failedTopics: progressValues.filter(p => p.status === 'failed').length,
    totalCycles: progressValues.reduce((sum, p) => sum + p.cyclesCompleted, 0),
    totalEvidence: state.evidenceIndex.size,
    sharedEvidence: Array.from(state.evidenceIndex.values())
      .filter(e => e.sharedWithTopics.length > 1).length,
    recentSwitches: state.topicSwitchLog.slice(-5),
  }
}

/**
 * Clean up cross-topic index after session ends
 */
export async function cleanupCrossTopicIndex(sessionId: string): Promise<void> {
  await prisma.system_configs.delete({
    where: { key: crossTopicIndexKey(sessionId) },
  }).catch(() => {
    // Ignore if not found
  })
}

// ============================================================================
// Exports for Testing
// ============================================================================

export const __testing = {
  generateDeduplicationKey,
  calculateTitleSimilarity,
  extractKeywords,
  clipText,
}
