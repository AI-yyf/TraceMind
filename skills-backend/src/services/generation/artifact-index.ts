import { prisma } from '../../lib/prisma'
import type {
  GenerationArtifactContextEntry,
  GenerationSubjectType,
} from './memory-store'
import type { NodeViewModel, PaperViewModel } from '../topics/alpha-reader'

const TOPIC_ARTIFACT_INDEX_KEY_PREFIX = 'generation-artifact-index:v1:'
const MAX_TOPIC_ARTIFACT_ENTRIES = 240

export interface TopicArtifactIndexState {
  schemaVersion: 'generation-artifact-index-v1'
  topicId: string
  updatedAt: string
  entries: GenerationArtifactContextEntry[]
}

function topicArtifactIndexKey(topicId: string) {
  return `${TOPIC_ARTIFACT_INDEX_KEY_PREFIX}${topicId}`
}

function emptyTopicArtifactIndex(topicId: string): TopicArtifactIndexState {
  return {
    schemaVersion: 'generation-artifact-index-v1',
    topicId,
    updatedAt: new Date().toISOString(),
    entries: [],
  }
}

function parseState(value: string | null | undefined) {
  if (!value) return null

  try {
    return JSON.parse(value) as TopicArtifactIndexState
  } catch {
    return null
  }
}

function clipText(value: string | null | undefined, maxLength = 180) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function uniqueStrings(values: Array<string | null | undefined>, limit: number, maxLength = 180) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipText(value, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function isNodeViewModel(value: unknown): value is NodeViewModel {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as { nodeId?: unknown }).nodeId === 'string' &&
      typeof (value as { title?: unknown }).title === 'string',
  )
}

function isPaperViewModel(value: unknown): value is PaperViewModel {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as { paperId?: unknown }).paperId === 'string' &&
      typeof (value as { title?: unknown }).title === 'string',
  )
}

function buildNodeArtifactEntry(viewModel: NodeViewModel): GenerationArtifactContextEntry {
  return {
    id: `node:${viewModel.nodeId}`,
    kind: 'node',
    entityId: viewModel.nodeId,
    title: clipText(viewModel.title, 120),
    headline: clipText(viewModel.headline || viewModel.title, 160),
    summary: clipText(viewModel.summary || viewModel.explanation || viewModel.standfirst, 220),
    standfirst: clipText(viewModel.standfirst || viewModel.summary, 240),
    keyArguments: uniqueStrings(
      [
        viewModel.summary,
        viewModel.explanation,
        viewModel.comparisonBlocks[0]?.summary,
        viewModel.critique.summary,
        ...viewModel.paperRoles.slice(0, 3).map((item) => item.contribution),
        ...viewModel.article.closing.slice(0, 2),
      ],
      5,
      180,
    ),
    stageIndex: Number.isInteger(viewModel.stageIndex) ? viewModel.stageIndex : null,
    updatedAt: viewModel.updatedAt,
  }
}

function buildPaperArtifactEntry(viewModel: PaperViewModel): GenerationArtifactContextEntry {
  const stageIndex =
    viewModel.relatedNodes
      .map((item) => item.stageIndex)
      .filter((value): value is number => Number.isInteger(value))
      .sort((left, right) => left - right)[0] ?? null

  return {
    id: `paper:${viewModel.paperId}`,
    kind: 'paper',
    entityId: viewModel.paperId,
    title: clipText(viewModel.title, 120),
    headline: clipText(viewModel.title, 160),
    summary: clipText(viewModel.summary || viewModel.explanation || viewModel.standfirst, 220),
    standfirst: clipText(viewModel.standfirst || viewModel.summary, 240),
    keyArguments: uniqueStrings(
      [
        viewModel.summary,
        viewModel.explanation,
        viewModel.critique.summary,
        ...viewModel.article.closing.slice(0, 2),
        ...viewModel.relatedNodes.slice(0, 3).map((item) => item.summary),
      ],
      5,
      180,
    ),
    stageIndex,
    updatedAt: new Date().toISOString(),
  }
}

export function extractTopicArtifactIndexEntry(
  kind: 'node',
  viewModel: NodeViewModel,
): GenerationArtifactContextEntry
export function extractTopicArtifactIndexEntry(
  kind: 'paper',
  viewModel: PaperViewModel,
): GenerationArtifactContextEntry
export function extractTopicArtifactIndexEntry(
  kind: 'node' | 'paper',
  viewModel: NodeViewModel | PaperViewModel,
): GenerationArtifactContextEntry {
  if (kind === 'node') {
    return buildNodeArtifactEntry(viewModel as NodeViewModel)
  }

  return buildPaperArtifactEntry(viewModel as PaperViewModel)
}

export async function loadTopicArtifactIndex(topicId: string): Promise<TopicArtifactIndexState> {
  const record = await prisma.systemConfig.findUnique({
    where: { key: topicArtifactIndexKey(topicId) },
  })

  const parsed = parseState(record?.value)
  if (!parsed || parsed.schemaVersion !== 'generation-artifact-index-v1') {
    return emptyTopicArtifactIndex(topicId)
  }

  return parsed
}

async function saveTopicArtifactIndex(state: TopicArtifactIndexState) {
  const nextState: TopicArtifactIndexState = {
    ...state,
    updatedAt: new Date().toISOString(),
    entries: [...state.entries]
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, MAX_TOPIC_ARTIFACT_ENTRIES),
  }

  await prisma.systemConfig.upsert({
    where: { key: topicArtifactIndexKey(state.topicId) },
    update: { value: JSON.stringify(nextState) },
    create: { key: topicArtifactIndexKey(state.topicId), value: JSON.stringify(nextState) },
  })

  return nextState
}

export async function upsertTopicArtifactIndexEntry(
  kind: 'node',
  viewModel: NodeViewModel,
): Promise<TopicArtifactIndexState>
export async function upsertTopicArtifactIndexEntry(
  kind: 'paper',
  viewModel: PaperViewModel,
): Promise<TopicArtifactIndexState>
export async function upsertTopicArtifactIndexEntry(
  kind: 'node' | 'paper',
  viewModel: NodeViewModel | PaperViewModel,
): Promise<TopicArtifactIndexState> {
  const topicId = viewModel.topic.topicId
  const current = await loadTopicArtifactIndex(topicId)
  const nextEntry =
    kind === 'node'
      ? extractTopicArtifactIndexEntry(kind, viewModel as NodeViewModel)
      : extractTopicArtifactIndexEntry(kind, viewModel as PaperViewModel)

  return saveTopicArtifactIndex({
    ...current,
    entries: [
      nextEntry,
      ...current.entries.filter((entry) => entry.id !== nextEntry.id),
    ],
  })
}

function parseStageSubjectIndex(
  subjectType: GenerationSubjectType | undefined,
  subjectId: string | undefined,
) {
  if (subjectType !== 'stage' || !subjectId) return null
  const match = subjectId.match(/research-stage:(\d+)/u)
  if (!match?.[1]) return null
  return Number.parseInt(match[1], 10)
}

function artifactPriority(
  entry: GenerationArtifactContextEntry,
  options?: {
    subjectType?: GenerationSubjectType
    subjectId?: string
  },
) {
  let score = 0
  const sameEntity =
    (options?.subjectType === 'node' || options?.subjectType === 'paper') &&
    entry.kind === options.subjectType &&
    entry.entityId === options.subjectId

  if (sameEntity) score += 100

  const currentStageIndex = parseStageSubjectIndex(options?.subjectType, options?.subjectId)
  if (currentStageIndex !== null && entry.stageIndex === currentStageIndex) score += 40

  if (options?.subjectType === 'node' && entry.kind === 'node') score += 18
  if (options?.subjectType === 'paper' && entry.kind === 'paper') score += 18
  if (options?.subjectType === 'topic' || options?.subjectType === 'stage') {
    if (entry.kind === 'node') score += 10
  }

  if (entry.keyArguments.length > 0) score += 4
  return score
}

export function collectTopicArtifactIndexContext(
  state: TopicArtifactIndexState,
  options?: {
    subjectType?: GenerationSubjectType
    subjectId?: string
    limit?: number
  },
) {
  const limit = Math.max(4, Math.min(options?.limit ?? 8, 12))

  return {
    artifactIndex: [...state.entries]
      .sort((left, right) => {
        const priorityDelta = artifactPriority(right, options) - artifactPriority(left, options)
        if (priorityDelta !== 0) return priorityDelta
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      })
      .slice(0, limit),
  }
}

export const __testing = {
  extractTopicArtifactIndexEntry,
  collectTopicArtifactIndexContext,
}
