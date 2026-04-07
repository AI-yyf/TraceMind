import fs from 'node:fs'
import path from 'node:path'

import { writeCompiledTopics } from '../../topic-config/compile-topics'
import {
  normalizeDecisionMemoryFile,
  normalizeExecutionMemoryFile,
} from '../../shared/research-memory'

import type { SkillAttachment, SkillContextSnapshot, SkillExecutionRequest } from '../contracts'

const currentDir = __dirname
const repoRoot = path.resolve(currentDir, '..', '..', '..')
export const generatedDataRoot = path.join(repoRoot, 'generated-data', 'app-data')
export const workflowRoot = path.join(generatedDataRoot, 'workflow')
export const trackerContentRoot = path.join(generatedDataRoot, 'tracker-content')

const defaultLogger: SkillContextSnapshot['logger'] = {
  info(message, meta) {
    console.info(message, meta ?? {})
  },
  warn(message, meta) {
    console.warn(message, meta ?? {})
  },
  error(message, meta) {
    console.error(message, meta ?? {})
  },
  debug(message, meta) {
    console.debug(message, meta ?? {})
  },
}

function readJson<T>(absolutePath: string, fallback: T): T {
  if (!fs.existsSync(absolutePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function ensureWorkflowCompiled() {
  const requiredFiles = [
    path.join(workflowRoot, 'topic-catalog.json'),
    path.join(workflowRoot, 'topic-memory.json'),
    path.join(workflowRoot, 'topic-display.json'),
    path.join(workflowRoot, 'capability-library.json'),
    path.join(workflowRoot, 'active-topics.json'),
    path.join(workflowRoot, 'decision-memory.json'),
    path.join(workflowRoot, 'execution-memory.json'),
  ]

  if (requiredFiles.every((file) => fs.existsSync(file))) {
    return
  }

  writeCompiledTopics()
}

function ensureTrackerContentStores() {
  fs.mkdirSync(trackerContentRoot, { recursive: true })

  const requiredStores: Array<{ filePath: string; emptyValue: unknown }> = [
    {
      filePath: path.join(trackerContentRoot, 'paper-editorial.json'),
      emptyValue: {},
    },
    {
      filePath: path.join(trackerContentRoot, 'node-editorial.json'),
      emptyValue: {},
    },
    {
      filePath: path.join(trackerContentRoot, 'topic-editorial.json'),
      emptyValue: [],
    },
  ]

  for (const store of requiredStores) {
    if (fs.existsSync(store.filePath)) {
      continue
    }

    fs.writeFileSync(store.filePath, `${JSON.stringify(store.emptyValue, null, 2)}\n`, 'utf8')
  }
}

export function listInputAttachments(input: Record<string, unknown>): SkillAttachment[] {
  const raw = input.attachments
  if (!Array.isArray(raw)) return []

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      kind:
        item.kind === 'image' ||
        item.kind === 'pdf' ||
        item.kind === 'figure' ||
        item.kind === 'table-source' ||
        item.kind === 'file'
          ? item.kind
          : 'file',
      name: typeof item.name === 'string' ? item.name : 'attachment',
      url: typeof item.url === 'string' ? item.url : undefined,
      path: typeof item.path === 'string' ? item.path : undefined,
      mimeType: typeof item.mimeType === 'string' ? item.mimeType : undefined,
      text: typeof item.text === 'string' ? item.text : undefined,
    }))
}

export function buildContextSnapshot(request: SkillExecutionRequest): SkillContextSnapshot {
  ensureWorkflowCompiled()
  ensureTrackerContentStores()

  const topicCatalog = readJson<{ topics: Array<Record<string, unknown>> }>(
    path.join(workflowRoot, 'topic-catalog.json'),
    { topics: [] },
  )
  const topicMemory = readJson<Record<string, Record<string, unknown>>>(
    path.join(workflowRoot, 'topic-memory.json'),
    {},
  )
  const topicDisplayStore = readJson<{ schemaVersion?: number; topics: Array<Record<string, unknown>> }>(
    path.join(workflowRoot, 'topic-display.json'),
    { schemaVersion: 1, topics: [] },
  )
  const capabilityLibrary = readJson<Array<Record<string, unknown>>>(
    path.join(workflowRoot, 'capability-library.json'),
    [],
  )
  const activeTopics = readJson<Array<{ topicId: string }>>(path.join(workflowRoot, 'active-topics.json'), [])
  const decisionMemory = readJson<{ schemaVersion: number; entries: Array<Record<string, unknown>> }>(
    path.join(workflowRoot, 'decision-memory.json'),
    { schemaVersion: 1, entries: [] },
  )
  const executionMemory = readJson<{ schemaVersion: number; skills: Record<string, unknown> }>(
    path.join(workflowRoot, 'execution-memory.json'),
    { schemaVersion: 1, skills: {} },
  )
  const paperCatalog = readJson<Record<string, Record<string, unknown>>>(
    path.join(generatedDataRoot, 'paper-catalog.json'),
    {},
  )
  const paperAssets = readJson<Record<string, Record<string, unknown>>>(
    path.join(generatedDataRoot, 'paper-assets.json'),
    {},
  )
  const paperMetrics = readJson<Record<string, Record<string, unknown>>>(
    path.join(generatedDataRoot, 'paper-metrics.json'),
    {},
  )
  const paperEditorialStore = readJson<Record<string, Record<string, unknown>>>(
    path.join(trackerContentRoot, 'paper-editorial.json'),
    {},
  )
  const nodeEditorialStore = readJson<Record<string, Record<string, unknown>>>(
    path.join(trackerContentRoot, 'node-editorial.json'),
    {},
  )
  const topicEditorialStore = readJson<Array<Record<string, unknown>>>(
    path.join(trackerContentRoot, 'topic-editorial.json'),
    [],
  )

  const topicId = typeof request.input.topicId === 'string' ? request.input.topicId : undefined
  const paperId = typeof request.input.paperId === 'string' ? request.input.paperId : undefined
  const topic = topicCatalog.topics.find((entry) => entry.id === topicId)
  const paper = paperId ? paperCatalog[paperId] : undefined

  return {
    topic: topic
      ? {
          id: String(topic.id),
          nameZh: String(topic.nameZh),
          nameEn: String(topic.nameEn),
          focusLabel: typeof topic.focusLabel === 'string' ? topic.focusLabel : undefined,
          originPaperId: String(topic.originPaperId),
          queryTags: Array.isArray(topic.queryTags) ? topic.queryTags.map(String) : [],
          problemPreference: Array.isArray(topic.problemPreference) ? topic.problemPreference.map(String) : [],
          capabilityRefs: Array.isArray(topic.capabilityRefs) ? topic.capabilityRefs.map(String) : [],
          frontendSummary:
            typeof topic.frontendSummary === 'object' && topic.frontendSummary
              ? {
                  cardSummary: String((topic.frontendSummary as Record<string, unknown>).cardSummary ?? ''),
                  timelineGuide: String((topic.frontendSummary as Record<string, unknown>).timelineGuide ?? ''),
                  researchBlurb: String((topic.frontendSummary as Record<string, unknown>).researchBlurb ?? ''),
                }
              : undefined,
          defaults: typeof topic.defaults === 'object' && topic.defaults ? (topic.defaults as Record<string, unknown>) : undefined,
        }
      : undefined,
    paper: paper && paperId
      ? {
          id: paperId,
          title: String(paper.title ?? paperId),
          published: String(paper.published ?? ''),
          authors: Array.isArray(paper.authors) ? paper.authors.map(String) : [],
          summary: typeof paper.summary === 'string' ? paper.summary : undefined,
          topicIds: topic ? [String(topic.id)] : undefined,
        }
      : undefined,
    topicCatalog,
    topicDisplayStore,
    topicMemory: topicId ? topicMemory[topicId] : undefined,
    workflowTopicMemory: topicMemory,
    paperCatalog,
    paperAssets,
    paperMetrics,
    paperEditorialStore,
    nodeEditorialStore,
    topicEditorialStore,
    decisionMemory: normalizeDecisionMemoryFile(decisionMemory),
    executionMemory: normalizeExecutionMemoryFile(executionMemory),
    activeTopicIds: activeTopics.map((entry) => entry.topicId),
    generatedDataSummary: {
      paperCount: Object.keys(paperCatalog).length,
      topicCount: topicCatalog.topics.length,
      capabilityCount: capabilityLibrary.length,
      nodeCount: Object.values(topicMemory).reduce((sum, entry) => {
        const researchNodes = Array.isArray(entry?.researchNodes) ? entry.researchNodes : []
        return sum + researchNodes.length
      }, 0),
    },
    logger: defaultLogger,
  }
}
