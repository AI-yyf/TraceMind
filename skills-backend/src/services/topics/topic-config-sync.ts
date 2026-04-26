import fs from 'node:fs'
import path from 'node:path'

import { prisma } from '../../lib/prisma'
import { logger } from '../../utils/logger'
import { getTopicDefinition, loadTopicDefinitions } from '../../../topic-config'
import type { TopicDefinition } from '../../../topic-config/schema'
import {
  buildFallbackBranchRegistry,
  buildFallbackPaperRelations,
  buildResearchNodesFromStageLedger,
  normalizeResearchNodes,
  syncLegacyBranchTree,
} from '../../../shared/research-graph'
import {
  buildTopicDisplayEntry,
  createEmptyTopicDisplayCollection,
  upsertTopicDisplayEntry,
} from '../../../shared/topic-display'
import { resolvePreferredTopicStageWindowMonths } from './topic-stage-config'
import {
  buildCanonicalOnlyNodeBlueprints,
  getCanonicalPaperOverride,
} from './canonical-topic-graph'
import { resolvePaperAssetPath } from '../paper-links'

type JsonRecord = Record<string, Record<string, unknown>>
type TopicMemoryCollection = Record<string, Record<string, unknown>>
type MaterializedNodeSpec = {
  nodeId: string
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  nodeLabel: string
  nodeSubtitle: string
  nodeSummary: string
  nodeExplanation: string
  coverImage: string | null
  provisional: boolean
  isMergeNode: boolean
  status: string
  branchId: string
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  parentNodeIds: string[]
}
type MaterializedPaperSpec = {
  id: string
  title: string
  titleZh: string
  titleEn: string
  authors: string[]
  published: Date
  summary: string
  explanation: string
  arxivUrl: string | null
  pdfUrl: string | null
  citationCount: number | null
  coverPath: string | null
  figurePaths: string[]
  tags: string[]
  status: string
  sections: Array<{
    sourceSectionTitle: string
    editorialTitle: string
    paragraphs: string
    order: number
  }>
  figures: Array<{
    number: number
    caption: string
    page: number
    imagePath: string
    analysis: string | null
  }>
}

const repoRoot = path.resolve(__dirname, '../../../..')
const generatedRoot = path.join(repoRoot, 'generated-data', 'app-data')
const workflowRoot = path.join(generatedRoot, 'workflow')
const topicMemoryPath = path.join(workflowRoot, 'topic-memory.json')
const topicDisplayPath = path.join(workflowRoot, 'topic-display.json')
const paperCatalogPath = path.join(generatedRoot, 'paper-catalog.json')
const paperAssetsPath = path.join(generatedRoot, 'paper-assets.json')
const paperMetricsPath = path.join(generatedRoot, 'paper-metrics.json')
const TOPIC_ARTIFACT_KEY_PREFIX = 'alpha:topic-artifact:'
const LEGACY_SEED_TOPIC_IDS = ['topic-1', 'topic-2', 'topic-3', 'topic-4', 'topic-5'] as const

const materializationQueue = new Map<string, Promise<boolean>>()

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function clipText(value: string | null | undefined, maxLength = 320) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function pickText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }

  return ''
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 12) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value?.replace(/\s+/gu, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function parseJsonStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

function parseNodeRuntimeMetadata(value: string | null | undefined) {
  if (typeof value !== 'string' || !value.trim()) return {}

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return {
      branchId:
        typeof parsed.branchId === 'string' && parsed.branchId.trim().length > 0
          ? parsed.branchId.trim()
          : null,
      sourceBranchIds: Array.isArray(parsed.sourceBranchIds)
        ? parsed.sourceBranchIds.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
          )
        : [],
      sourceProblemNodeIds: Array.isArray(parsed.sourceProblemNodeIds)
        ? parsed.sourceProblemNodeIds.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
          )
        : [],
      parentNodeIds: Array.isArray(parsed.parentNodeIds)
        ? parsed.parentNodeIds.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
          )
        : [],
    }
  } catch {
    return {}
  }
}

function normalizePublishedDate(value: unknown, fallback = new Date('2016-01-01T00:00:00.000Z')) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback
}

function formatMonthLabel(value: Date) {
  return `${value.getFullYear()}.${`${value.getMonth() + 1}`.padStart(2, '0')}`
}

function formatStageRangeLabel(dates: Date[]) {
  if (dates.length === 0) return '时间待定'
  const ordered = [...dates].sort((left, right) => left.getTime() - right.getTime())
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const firstLabel = formatMonthLabel(first)
  const lastLabel = formatMonthLabel(last)
  return firstLabel === lastLabel ? firstLabel : `${firstLabel}-${lastLabel}`
}

function humanizeAssetLabel(assetPath: string, fallback: string) {
  const base = assetPath
    .split(/[\\/]/u)
    .pop()
    ?.replace(/\.[^.]+$/u, '')
    .replace(/[-_]+/gu, ' ')
    .trim()

  if (!base) return fallback
  return base.replace(/\b\w/gu, (token) => token.toUpperCase())
}

function readTopicMemoryCollection() {
  return readJsonFile<TopicMemoryCollection>(topicMemoryPath, {})
}

function readPaperCatalog() {
  return readJsonFile<JsonRecord>(paperCatalogPath, {})
}

function readPaperAssets() {
  return readJsonFile<JsonRecord>(paperAssetsPath, {})
}

function readPaperMetrics() {
  return readJsonFile<JsonRecord>(paperMetricsPath, {})
}

function resolvePreferredPaperCoverPath(paperId: string, assetPath: string | null | undefined) {
  const publicPaperDir = path.join(repoRoot, 'generated-data', 'public', 'papers', paperId)
  if (fs.existsSync(publicPaperDir)) {
    const staticImage = fs
      .readdirSync(publicPaperDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/iu.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))[0]
    if (staticImage) {
      return `/papers/${paperId}/${staticImage}`
    }
  }

  return resolvePaperAssetPath({ assetPath, paperId }) ?? null
}

function isConfiguredTopicId(topicId: string) {
  try {
    getTopicDefinition(topicId)
    return true
  } catch {
    return false
  }
}

function collectPaperIdsFromMemory(
  value: unknown,
  target: Set<string>,
  visited = new WeakSet<object>(),
) {
  if (!value || typeof value !== 'object') return
  if (visited.has(value as object)) return
  visited.add(value as object)

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPaperIdsFromMemory(item, target, visited)
    }
    return
  }

  for (const [key, child] of Object.entries(value)) {
    if (/rejected/iu.test(key)) continue

    if (typeof child === 'string') {
      if (/paperid$/iu.test(key) || /originpaperid$/iu.test(key)) {
        const normalized = child.trim()
        if (normalized) target.add(normalized)
      }
      continue
    }

    if (Array.isArray(child)) {
      if (/paperids$/iu.test(key)) {
        for (const item of child) {
          if (typeof item !== 'string') continue
          const normalized = item.trim()
          if (normalized) target.add(normalized)
        }
        continue
      }

      for (const item of child) {
        collectPaperIdsFromMemory(item, target, visited)
      }
      continue
    }

    collectPaperIdsFromMemory(child, target, visited)
  }
}

function shouldUseCanonicalOnlyStorage(topicDefinition: TopicDefinition) {
  return topicDefinition.defaults.storageMode === 'canonical-only'
}

function collectCanonicalTopicPaperIds(topicDefinition: TopicDefinition) {
  const paperIds = new Set<string>()

  for (const paper of topicDefinition.papers) {
    const normalized = paper.id.trim()
    if (normalized) paperIds.add(normalized)
  }

  for (const paperId of topicDefinition.seedPapers) {
    const normalized = paperId.trim()
    if (normalized) paperIds.add(normalized)
  }

  const originPaperId = topicDefinition.origin.originPaperId.trim()
  if (originPaperId) {
    paperIds.add(originPaperId)
  }

  return paperIds
}

function collectConfiguredTopicPaperIds(topicDefinition: TopicDefinition, topicMemory: Record<string, unknown>) {
  const orderedIds: string[] = []
  const seen = new Set<string>()
  const push = (paperId: unknown) => {
    if (typeof paperId !== 'string') return
    const normalized = paperId.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    orderedIds.push(normalized)
  }

  if (shouldUseCanonicalOnlyStorage(topicDefinition)) {
    for (const paperId of collectCanonicalTopicPaperIds(topicDefinition)) {
      push(paperId)
    }
    return orderedIds
  }

  const researchNodes = Array.isArray(topicMemory.researchNodes)
    ? (topicMemory.researchNodes as Array<Record<string, unknown>>)
    : []

  for (const node of researchNodes) {
    if (Array.isArray(node.paperIds)) {
      for (const paperId of node.paperIds) {
        push(paperId)
      }
    }
    push(node.primaryPaperId)
    push(node.paperId)
  }

  for (const paper of topicDefinition.papers) {
    push(paper.id)
  }

  for (const paperId of topicDefinition.seedPapers) {
    push(paperId)
  }

  const memoryPaperIds = new Set<string>()
  collectPaperIdsFromMemory(topicMemory, memoryPaperIds)
  for (const paperId of memoryPaperIds) {
    push(paperId)
  }

  push(topicDefinition.origin.originPaperId)
  return orderedIds
}

function buildFallbackNodeSpec(topicDefinition: TopicDefinition): MaterializedNodeSpec {
  const originPaperId = topicDefinition.origin.originPaperId
  return {
    nodeId: `${topicDefinition.id}:stage-0:${originPaperId}`,
    stageIndex: 0,
    paperIds: [originPaperId],
    primaryPaperId: originPaperId,
    nodeLabel: '起源节点',
    nodeSubtitle: '主题源头与问题起点',
    nodeSummary: clipText(topicDefinition.origin.originWhyThisCounts, 420),
    nodeExplanation: clipText(topicDefinition.origin.originQuestionDefinition, 420),
    coverImage: null,
    provisional: false,
    isMergeNode: false,
    status: 'canonical',
    branchId: `branch:${topicDefinition.id}:mainline`,
    sourceBranchIds: [`branch:${topicDefinition.id}:mainline`],
    sourceProblemNodeIds: [`${topicDefinition.id}:origin-problem`],
    parentNodeIds: [],
  }
}

function buildNodeSpecs(args: {
  topicDefinition: TopicDefinition
  topicMemory: Record<string, unknown>
  paperCatalog: JsonRecord
  paperAssets: JsonRecord
}) {
  const rawResearchNodes =
    shouldUseCanonicalOnlyStorage(args.topicDefinition)
      ? buildCanonicalOnlyNodeBlueprints({
          topicDefinition: args.topicDefinition,
          orderedPaperIds: collectConfiguredTopicPaperIds(args.topicDefinition, args.topicMemory),
          paperCatalog: args.paperCatalog,
          paperAssets: args.paperAssets,
        })
      : Array.isArray(args.topicMemory.researchNodes) && args.topicMemory.researchNodes.length > 0
      ? (args.topicMemory.researchNodes as unknown[])
      : Array.isArray(args.topicMemory.stageLedger) && args.topicMemory.stageLedger.length > 0
        ? buildResearchNodesFromStageLedger(args.topicMemory.stageLedger as unknown as Record<string, unknown>)
        : []

  const normalizedNodes =
    rawResearchNodes.length > 0 ? normalizeResearchNodes(rawResearchNodes) : [buildFallbackNodeSpec(args.topicDefinition)]

  const allowedPaperIds = shouldUseCanonicalOnlyStorage(args.topicDefinition)
    ? collectCanonicalTopicPaperIds(args.topicDefinition)
    : null

  const filteredNodes = allowedPaperIds
    ? normalizedNodes.filter((node) => {
        const source = node as Record<string, unknown>
        const paperIds = [
          ...(Array.isArray(source.paperIds) ? (source.paperIds as unknown[]) : []),
          source.primaryPaperId,
          source.paperId,
        ]
          .filter((paperId): paperId is string => typeof paperId === 'string' && paperId.trim().length > 0)
          .map((paperId) => paperId.trim())

        return paperIds.some((paperId) => allowedPaperIds.has(paperId))
      })
    : normalizedNodes

  const effectiveNodes =
    filteredNodes.length > 0 ? filteredNodes : [buildFallbackNodeSpec(args.topicDefinition)]

  return effectiveNodes.map((node) => {
    const paperIds = Array.from(
      new Set(
        [
          ...(Array.isArray((node as Record<string, unknown>).paperIds)
            ? ((node as Record<string, unknown>).paperIds as unknown[])
            : []),
          (node as Record<string, unknown>).primaryPaperId,
          (node as Record<string, unknown>).paperId,
        ]
          .filter((paperId): paperId is string => typeof paperId === 'string' && paperId.trim().length > 0)
          .map((paperId) => paperId.trim())
          .filter((paperId) => !allowedPaperIds || allowedPaperIds.has(paperId)),
      ),
    )
    const primaryPaperId =
      pickText(
        typeof (node as Record<string, unknown>).primaryPaperId === 'string'
          ? ((node as Record<string, unknown>).primaryPaperId as string)
          : '',
        paperIds[0] ?? '',
      ) || args.topicDefinition.origin.originPaperId
    const primaryPaper = args.paperCatalog[primaryPaperId] ?? null
    const primaryAssets = args.paperAssets[primaryPaperId] ?? null

    return {
      nodeId:
        pickText(
          typeof (node as Record<string, unknown>).nodeId === 'string'
            ? ((node as Record<string, unknown>).nodeId as string)
            : '',
          typeof (node as Record<string, unknown>).id === 'string'
            ? ((node as Record<string, unknown>).id as string)
            : '',
          `${args.topicDefinition.id}:stage-${Math.max(0, Number((node as Record<string, unknown>).stageIndex ?? 0))}:${primaryPaperId}`,
        ) || `${args.topicDefinition.id}:stage-0:${primaryPaperId}`,
      stageIndex: Math.max(0, Number((node as Record<string, unknown>).stageIndex ?? 0)),
      paperIds: paperIds.length > 0 ? paperIds : [primaryPaperId],
      primaryPaperId,
      nodeLabel:
        pickText(
          typeof (node as Record<string, unknown>).nodeLabel === 'string'
            ? ((node as Record<string, unknown>).nodeLabel as string)
            : '',
          clipText(String(primaryPaper?.title ?? primaryPaperId), 56),
          '研究节点',
        ) || '研究节点',
      nodeSubtitle:
        pickText(
          typeof (node as Record<string, unknown>).nodeSubtitle === 'string'
            ? ((node as Record<string, unknown>).nodeSubtitle as string)
            : '',
          typeof primaryPaper?.title === 'string' ? clipText(primaryPaper.title, 88) : '',
          args.topicDefinition.focusLabel,
        ) || args.topicDefinition.focusLabel,
      nodeSummary:
        pickText(
          typeof (node as Record<string, unknown>).nodeSummary === 'string'
            ? ((node as Record<string, unknown>).nodeSummary as string)
            : '',
          typeof primaryPaper?.summary === 'string' ? primaryPaper.summary : '',
          args.topicDefinition.origin.originWhyThisCounts,
        ) || args.topicDefinition.origin.originWhyThisCounts,
      nodeExplanation:
        pickText(
          typeof (node as Record<string, unknown>).nodeExplanation === 'string'
            ? ((node as Record<string, unknown>).nodeExplanation as string)
            : '',
          typeof primaryPaper?.summary === 'string' ? primaryPaper.summary : '',
          args.topicDefinition.origin.originQuestionDefinition,
        ) || args.topicDefinition.origin.originQuestionDefinition,
      coverImage:
        pickText(
          typeof (node as Record<string, unknown>).nodeCoverImage === 'string'
            ? ((node as Record<string, unknown>).nodeCoverImage as string)
            : '',
          typeof primaryAssets?.coverPath === 'string' ? (primaryAssets.coverPath as string) : '',
        ) || null,
      provisional: Boolean((node as Record<string, unknown>).provisional),
      isMergeNode: Boolean((node as Record<string, unknown>).isMergeNode),
      status:
        pickText(
          typeof (node as Record<string, unknown>).status === 'string'
            ? ((node as Record<string, unknown>).status as string)
            : '',
          'canonical',
        ) || 'canonical',
      branchId:
        pickText(
          typeof (node as Record<string, unknown>).branchId === 'string'
            ? ((node as Record<string, unknown>).branchId as string)
            : '',
          `branch:${args.topicDefinition.id}:mainline`,
        ) || `branch:${args.topicDefinition.id}:mainline`,
      sourceBranchIds: Array.from(
        new Set(
          [
            ...(Array.isArray((node as Record<string, unknown>).sourceBranchIds)
              ? ((node as Record<string, unknown>).sourceBranchIds as unknown[])
              : []),
            typeof (node as Record<string, unknown>).branchId === 'string'
              ? ((node as Record<string, unknown>).branchId as string)
              : '',
          ].filter((branchId): branchId is string => typeof branchId === 'string' && branchId.trim().length > 0),
        ),
      ),
      sourceProblemNodeIds: Array.from(
        new Set(
          (Array.isArray((node as Record<string, unknown>).sourceProblemNodeIds)
            ? ((node as Record<string, unknown>).sourceProblemNodeIds as unknown[])
            : []
          ).filter(
            (problemNodeId): problemNodeId is string =>
              typeof problemNodeId === 'string' && problemNodeId.trim().length > 0,
          ),
        ),
      ),
      parentNodeIds: Array.from(
        new Set(
          (Array.isArray((node as Record<string, unknown>).parentNodeIds)
            ? ((node as Record<string, unknown>).parentNodeIds as unknown[])
            : []
          ).filter(
            (parentNodeId): parentNodeId is string =>
              typeof parentNodeId === 'string' && parentNodeId.trim().length > 0,
          ),
        ),
      ),
    } satisfies MaterializedNodeSpec
  })
}

function buildPaperSpecs(args: {
  topicDefinition: TopicDefinition
  paperIds: string[]
  nodeSpecs: MaterializedNodeSpec[]
  paperCatalog: JsonRecord
  paperAssets: JsonRecord
  paperMetrics: JsonRecord
}) {
  return args.paperIds.map((paperId) => {
    const paperRecord = {
      ...(args.paperCatalog[paperId] ?? {}),
      ...(getCanonicalPaperOverride(args.topicDefinition.id, paperId) ?? {}),
    }
    const paperAssets = args.paperAssets[paperId] ?? {}
    const paperMetrics = args.paperMetrics[paperId] ?? {}
    const relatedNodes = args.nodeSpecs.filter((node) => node.paperIds.includes(paperId))
    const topicRole = args.topicDefinition.papers.find((paper) => paper.id === paperId)?.role ?? null
    const title =
      pickText(
        typeof paperRecord.title === 'string' ? (paperRecord.title as string) : '',
        typeof paperRecord.titleEn === 'string' ? (paperRecord.titleEn as string) : '',
        paperId,
      ) || paperId
    const summary =
      pickText(
        typeof paperRecord.summary === 'string' ? (paperRecord.summary as string) : '',
        relatedNodes[0]?.nodeSummary,
        paperId === args.topicDefinition.origin.originPaperId ? args.topicDefinition.origin.originWhyThisCounts : '',
      ) || args.topicDefinition.origin.originWhyThisCounts
    const explanation =
      pickText(
        relatedNodes[0]?.nodeExplanation,
        relatedNodes[0]?.nodeSummary,
        paperId === args.topicDefinition.origin.originPaperId ? args.topicDefinition.origin.originQuestionDefinition : '',
        summary,
      ) || summary
    const figurePaths = Array.from(
      new Set(
        [
          ...(Array.isArray(paperAssets.figurePaths)
            ? paperAssets.figurePaths.filter((value): value is string => typeof value === 'string')
            : []),
          typeof paperAssets.coverPath === 'string' ? (paperAssets.coverPath as string) : null,
        ]
          .map((value) => resolvePaperAssetPath({ assetPath: value, paperId }) ?? null)
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
      ),
    )
    const coverPath = resolvePreferredPaperCoverPath(
      paperId,
      typeof paperAssets.coverPath === 'string' ? (paperAssets.coverPath as string) : '',
    )
    const sectionParagraphs = uniqueStrings(
      [
        summary,
        explanation,
        ...relatedNodes.map((node) => node.nodeSummary),
      ],
      4,
    )
    const placementParagraphs = uniqueStrings(
      [
        topicRole ? `This paper currently plays the "${topicRole}" role within ${args.topicDefinition.nameEn}.` : '',
        relatedNodes.length > 0
          ? `It is currently grouped into ${relatedNodes.length} node(s): ${relatedNodes.map((node) => node.nodeLabel).join(' · ')}.`
          : '',
        paperId === args.topicDefinition.origin.originPaperId ? args.topicDefinition.origin.originWhyThisCounts : '',
        paperId === args.topicDefinition.origin.originPaperId ? args.topicDefinition.origin.originQuestionDefinition : '',
      ],
      4,
    )

    return {
      id: paperId,
      title,
      titleZh:
        pickText(
          typeof paperRecord.titleZh === 'string' ? (paperRecord.titleZh as string) : '',
          title,
        ) || title,
      titleEn:
        pickText(
          typeof paperRecord.titleEn === 'string' ? (paperRecord.titleEn as string) : '',
          title,
        ) || title,
      authors: parseJsonStringArray(paperRecord.authors),
      published: normalizePublishedDate(
        paperRecord.published,
        paperId === args.topicDefinition.origin.originPaperId
          ? new Date('2016-04-25T00:00:00.000Z')
          : new Date('2020-01-01T00:00:00.000Z'),
      ),
      summary,
      explanation,
      arxivUrl:
        pickText(
          typeof paperRecord.arxivUrl === 'string' ? (paperRecord.arxivUrl as string) : '',
          `https://arxiv.org/abs/${paperId}`,
        ) || null,
      pdfUrl:
        pickText(
          typeof paperRecord.pdfUrl === 'string' ? (paperRecord.pdfUrl as string) : '',
          `https://arxiv.org/pdf/${paperId}.pdf`,
        ) || null,
      citationCount:
        typeof paperMetrics.citationCount === 'number' && Number.isFinite(paperMetrics.citationCount)
          ? (paperMetrics.citationCount as number)
          : null,
      coverPath,
      figurePaths,
      tags: uniqueStrings(
        [
          topicRole,
          ...args.topicDefinition.queryTags.slice(0, 4),
          ...args.topicDefinition.problemPreference.slice(0, 4),
        ],
        10,
      ),
      status: 'published',
      sections: [
        {
          sourceSectionTitle: 'Abstract',
          editorialTitle: 'Paper overview',
          paragraphs: JSON.stringify(sectionParagraphs),
          order: 1,
        },
        {
          sourceSectionTitle: 'Editorial placement',
          editorialTitle: 'Topic placement',
          paragraphs: JSON.stringify(placementParagraphs.length > 0 ? placementParagraphs : [summary]),
          order: 2,
        },
      ],
      figures: figurePaths.map((imagePath, index) => ({
        number: index + 1,
        caption: humanizeAssetLabel(imagePath, `Figure ${index + 1}`),
        page: index + 1,
        imagePath,
        analysis:
          index === 0
            ? clipText(
                `This figure is kept as inline evidence for ${title} so the node article can stay close to the paper's actual visual argument.`,
                240,
              )
            : null,
      })),
    } satisfies MaterializedPaperSpec
  })
}

function buildStageSpecs(nodeSpecs: MaterializedNodeSpec[], paperSpecs: MaterializedPaperSpec[]) {
  const stageIndexes = Array.from(new Set(nodeSpecs.map((node) => node.stageIndex))).sort((left, right) => left - right)

  return stageIndexes.map((stageIndex) => {
    const stagePaperDates = paperSpecs
      .filter((paper) => nodeSpecs.some((node) => node.stageIndex === stageIndex && node.paperIds.includes(paper.id)))
      .map((paper) => paper.published)
    const rangeLabel = formatStageRangeLabel(stagePaperDates)

    return {
      order: stageIndex,
      name: `阶段 ${stageIndex + 1} · ${rangeLabel}`,
      nameEn: `Stage ${stageIndex + 1} · ${rangeLabel}`,
      description:
        stagePaperDates.length > 0
          ? `Collects the papers that enter this topic during ${rangeLabel}.`
          : 'Collects the papers currently assigned to this stage window.',
      descriptionEn:
        stagePaperDates.length > 0
          ? `Collects the papers that enter this topic during ${rangeLabel}.`
          : 'Collects the papers currently assigned to this stage window.',
    }
  })
}

async function materializeConfiguredTopic(topicId: string) {
  const topicDefinition = getTopicDefinition(topicId)
  const topicMemory = readTopicMemoryCollection()[topicId] ?? {}
  const paperCatalog = readPaperCatalog()
  const paperAssets = readPaperAssets()
  const paperMetrics = readPaperMetrics()
  const paperIds = collectConfiguredTopicPaperIds(topicDefinition, topicMemory)
  const nodeSpecs = buildNodeSpecs({
    topicDefinition,
    topicMemory,
    paperCatalog,
    paperAssets,
  })
  const paperSpecs = buildPaperSpecs({
    topicDefinition,
    paperIds,
    nodeSpecs,
    paperCatalog,
    paperAssets,
    paperMetrics,
  })
  const stageSpecs = buildStageSpecs(nodeSpecs, paperSpecs)

  await prisma.topics.upsert({
    where: { id: topicId },
    update: {
      nameZh: topicDefinition.nameZh,
      nameEn: topicDefinition.nameEn,
      focusLabel: topicDefinition.focusLabel,
      summary: clipText(topicDefinition.frontendSummary.cardSummary, 420),
      description: clipText(
        uniqueStrings(
          [
            topicDefinition.frontendSummary.researchBlurb,
            topicDefinition.expansionNote,
            topicDefinition.origin.originWhyThisCounts,
          ],
          3,
        ).join(' '),
        1000,
      ),
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
    create: {
      id: topicId,
      nameZh: topicDefinition.nameZh,
      nameEn: topicDefinition.nameEn,
      focusLabel: topicDefinition.focusLabel,
      summary: clipText(topicDefinition.frontendSummary.cardSummary, 420),
      description: clipText(
        uniqueStrings(
          [
            topicDefinition.frontendSummary.researchBlurb,
            topicDefinition.expansionNote,
            topicDefinition.origin.originWhyThisCounts,
          ],
          3,
        ).join(' '),
        1000,
      ),
      language: 'zh',
      status: 'active',
      updatedAt: new Date(),
    },
  })

  await prisma.topic_stages.deleteMany({
    where: { topicId },
  })

  if (stageSpecs.length > 0) {
    await prisma.topic_stages.createMany({
      data: stageSpecs.map((stage) => ({
        id: crypto.randomUUID(),
        topicId,
        order: stage.order,
        name: stage.name,
        nameEn: stage.nameEn,
        description: stage.description,
        descriptionEn: stage.descriptionEn,
      })),
    })
  }

  const rejectedOriginPaperIds = topicDefinition.origin.earlierRejectedCandidates
    .map((candidate) => candidate.paperId)
    .filter((paperId): paperId is string => typeof paperId === 'string' && paperId.trim().length > 0)

  if (rejectedOriginPaperIds.length > 0) {
    const rejectedOriginPapers = await prisma.papers.findMany({
      where: {
        topicId,
        id: { in: rejectedOriginPaperIds },
      },
      include: {
        node_papers: {
          select: { id: true },
        },
      },
    })

    for (const rejectedPaper of rejectedOriginPapers) {
      if (rejectedPaper.node_papers.length > 0) continue
      await prisma.papers.delete({
        where: { id: rejectedPaper.id },
      })
    }
  }

  const existingPapers = await prisma.papers.findMany({
    where: {
      id: {
        in: paperSpecs.map((paper) => paper.id),
      },
    },
    include: {
      paper_sections: {
        select: { id: true },
      },
      figures: {
        select: { id: true },
      },
    },
  })
  const existingPaperById = new Map(existingPapers.map((paper) => [paper.id, paper] as const))
  const materializedPaperIds = new Set<string>()

  for (const paper of paperSpecs) {
    const existingPaper = existingPaperById.get(paper.id)
    if (existingPaper && existingPaper.topicId !== topicId) {
      logger.warn('Skipping configured topic paper materialization because the paper already belongs to another topic.', {
        topicId,
        paperId: paper.id,
        existingTopicId: existingPaper.topicId,
      })
      continue
    }

    const forceConfiguredMetadata =
      shouldUseCanonicalOnlyStorage(topicDefinition) ||
      Boolean(getCanonicalPaperOverride(topicDefinition.id, paper.id))

    const nextData = {
      topicId,
      title: forceConfiguredMetadata
        ? pickText(paper.title, existingPaper?.title) || paper.title
        : pickText(existingPaper?.title, paper.title) || paper.title,
      titleZh: forceConfiguredMetadata
        ? pickText(paper.titleZh, paper.title, existingPaper?.titleZh) || paper.title
        : pickText(existingPaper?.titleZh, paper.titleZh, paper.title) || paper.title,
      titleEn: forceConfiguredMetadata
        ? pickText(paper.titleEn, paper.title, existingPaper?.titleEn) || paper.title
        : pickText(existingPaper?.titleEn, paper.titleEn, paper.title) || paper.title,
      authors:
        existingPaper && parseJsonStringArray(existingPaper.authors).length > 0
          ? existingPaper.authors
          : JSON.stringify(paper.authors),
      published: forceConfiguredMetadata ? paper.published : existingPaper?.published ?? paper.published,
      summary: forceConfiguredMetadata
        ? pickText(paper.summary, existingPaper?.summary) || paper.summary
        : pickText(existingPaper?.summary, paper.summary) || paper.summary,
      explanation: forceConfiguredMetadata
        ? pickText(paper.explanation, paper.summary, existingPaper?.explanation) || paper.summary
        : pickText(existingPaper?.explanation, paper.explanation, paper.summary) || paper.summary,
      arxivUrl: pickText(existingPaper?.arxivUrl, paper.arxivUrl ?? '') || null,
      pdfUrl: pickText(existingPaper?.pdfUrl, paper.pdfUrl ?? '') || null,
      citationCount: existingPaper?.citationCount ?? paper.citationCount,
      coverPath: pickText(existingPaper?.coverPath, paper.coverPath ?? '') || null,
      figurePaths:
        existingPaper && parseJsonStringArray(existingPaper.figurePaths).length > 0
          ? existingPaper.figurePaths
          : JSON.stringify(paper.figurePaths),
      tablePaths: existingPaper?.tablePaths ?? '[]',
      tags:
        existingPaper && parseJsonStringArray(existingPaper.tags).length > 0
          ? existingPaper.tags
          : JSON.stringify(paper.tags),
      status: existingPaper?.status ?? paper.status,
      contentMode: existingPaper?.contentMode ?? 'editorial',
    }

    if (existingPaper) {
      await prisma.papers.update({
        where: { id: paper.id },
        data: nextData,
      })
    } else {
      await prisma.papers.create({
        data: {
          id: paper.id,
          updatedAt: new Date(),
          ...nextData,
        },
      })
    }

    materializedPaperIds.add(paper.id)

    if ((existingPaper?.paper_sections.length ?? 0) === 0 && paper.sections.length > 0) {
      await prisma.paper_sections.createMany({
        data: paper.sections.map((section) => ({
          id: crypto.randomUUID(),
          paperId: paper.id,
          sourceSectionTitle: section.sourceSectionTitle,
          editorialTitle: section.editorialTitle,
          paragraphs: section.paragraphs,
          order: section.order,
        })),
      })
    }

    if ((existingPaper?.figures.length ?? 0) === 0 && paper.figures.length > 0) {
      await prisma.figures.createMany({
        data: paper.figures.map((figure) => ({
          id: crypto.randomUUID(),
          paperId: paper.id,
          number: figure.number,
          caption: figure.caption,
          page: figure.page,
          imagePath: figure.imagePath,
          analysis: figure.analysis,
        })),
      })
    }
  }

  const desiredNodeIds = new Set(nodeSpecs.map((node) => node.nodeId))
  const existingNodes = await prisma.research_nodes.findMany({
    where: {
      topicId,
    },
    include: {
        node_papers: {
        select: { paperId: true },
      },
    },
  })
  const staleNodeIds = existingNodes
    .filter((node) => !desiredNodeIds.has(node.id))
    .map((node) => node.id)

  if (staleNodeIds.length > 0) {
    await prisma.research_nodes.deleteMany({
      where: {
        id: { in: staleNodeIds },
      },
    })
  }

  const existingNodeById = new Map(
    existingNodes
      .filter((node) => desiredNodeIds.has(node.id))
      .map((node) => [node.id, node] as const),
  )

  for (const node of nodeSpecs) {
    const validPaperIds = node.paperIds.filter((paperId) => materializedPaperIds.has(paperId))
    const primaryPaperId = validPaperIds.includes(node.primaryPaperId)
      ? node.primaryPaperId
      : validPaperIds[0] ?? ''

    const existingNode = existingNodeById.get(node.nodeId)
    if (!primaryPaperId) {
      if (existingNode) {
        await prisma.research_nodes.delete({
          where: { id: existingNode.id },
        })
      }
      continue
    }

    const nextNodeData = {
      topicId,
      stageIndex: node.stageIndex,
      nodeLabel: pickText(existingNode?.nodeLabel, node.nodeLabel) || node.nodeLabel,
      nodeSubtitle: pickText(existingNode?.nodeSubtitle, node.nodeSubtitle) || node.nodeSubtitle,
      nodeSummary: pickText(existingNode?.nodeSummary, node.nodeSummary) || node.nodeSummary,
      nodeExplanation:
        pickText(existingNode?.nodeExplanation, node.nodeExplanation, node.nodeSummary) || node.nodeSummary,
      nodeCoverImage: resolvePreferredPaperCoverPath(
        primaryPaperId,
        pickText(existingNode?.nodeCoverImage, node.coverImage ?? '') || '',
      ),
      status: existingNode?.status ?? node.status,
      isMergeNode: existingNode?.isMergeNode ?? node.isMergeNode,
      provisional: existingNode?.provisional ?? node.provisional,
      primaryPaperId,
      fullContent:
        pickText(
          existingNode?.fullContent,
          JSON.stringify({
            materializedFrom: 'topic-config-sync',
            paperIds: validPaperIds,
            branchId: node.branchId,
            sourceBranchIds: node.sourceBranchIds,
            sourceProblemNodeIds: node.sourceProblemNodeIds,
            parentNodeIds: node.parentNodeIds,
          }),
        ) || null,
    }

    if (existingNode) {
      await prisma.research_nodes.update({
        where: { id: node.nodeId },
        data: { ...nextNodeData, updatedAt: new Date() },
      })
    } else {
      await prisma.research_nodes.create({
        data: {
          id: node.nodeId,
          updatedAt: new Date(),
          ...nextNodeData,
        },
      })
    }

    for (const [index, paperId] of validPaperIds.entries()) {
      await prisma.node_papers.upsert({
        where: {
          nodeId_paperId: {
            nodeId: node.nodeId,
            paperId,
          },
        },
        update: { order: index + 1 },
        create: {
          id: crypto.randomUUID(),
          nodeId: node.nodeId,
          paperId,
          order: index + 1,
        },
      })
    }

    await prisma.node_papers.deleteMany({
      where: {
        nodeId: node.nodeId,
        paperId: {
          notIn: validPaperIds,
        },
      },
    })
  }

  const staleTopicPapers = await prisma.papers.findMany({
    where: {
      topicId,
      id: {
        notIn: Array.from(materializedPaperIds),
      },
    },
    include: {
      node_papers: {
        select: { id: true },
      },
    },
  })

  for (const stalePaper of staleTopicPapers) {
    if (stalePaper.node_papers.length > 0) continue
    await prisma.papers.delete({
      where: { id: stalePaper.id },
    })
  }

  await prisma.system_configs.deleteMany({
    where: {
      key: {
        startsWith: `${TOPIC_ARTIFACT_KEY_PREFIX}${topicId}:window-`,
      },
    },
  })

  logger.info('Configured topic materialization completed.', {
    topicId,
    stageCount: stageSpecs.length,
    nodeCount: nodeSpecs.length,
    paperCount: materializedPaperIds.size,
  })

  return true
}

export async function syncConfiguredTopicWorkflowSnapshot(topicId: string) {
  if (!isConfiguredTopicId(topicId)) return false

  const topicDefinition = getTopicDefinition(topicId)
  const topic = await prisma.topics.findUnique({
    where: { id: topicId },
    include: {
      papers: {
        include: {
          figures: {
            orderBy: { number: 'asc' },
          },
          node_papers: {
            select: {
              nodeId: true,
            },
          },
        },
        orderBy: { published: 'asc' },
      },
      research_nodes: {
        include: {
          papers: {
            select: {
              id: true,
              published: true,
            },
          },
          node_papers: {
            include: {
              papers: {
                select: {
                  published: true,
                },
              },
            },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: [{ stageIndex: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  if (!topic) {
    return false
  }

  const topicMemoryCollection = readTopicMemoryCollection()
  const paperCatalog = readPaperCatalog()
  const paperAssets = readPaperAssets()
  const paperMetrics = readPaperMetrics()
  const topicDisplayCollection = readJsonFile(topicDisplayPath, createEmptyTopicDisplayCollection())
  const existingTopicMemory =
    topicMemoryCollection[topicId] && typeof topicMemoryCollection[topicId] === 'object'
      ? topicMemoryCollection[topicId]
      : {}
  const existingResearchNodes = Array.isArray(existingTopicMemory.researchNodes)
    ? (existingTopicMemory.researchNodes as Array<Record<string, unknown>>)
    : []
  const existingNodeById = new Map(
    existingResearchNodes.map((node) => [String(node.nodeId ?? node.id ?? ''), node] as const),
  )
  const defaultWindowMonths = resolvePreferredTopicStageWindowMonths(topicId)

  const researchNodes = topic.research_nodes.map((node) => {
    const existing = existingNodeById.get(node.id)
    const runtimeMetadata = parseNodeRuntimeMetadata(node.fullContent)
    const paperIds = node.node_papers.map((entry) => entry.paperId)
    const primaryPublishedAt =
      node.papers?.published?.toISOString() ??
      node.node_papers[0]?.papers?.published?.toISOString() ??
      node.createdAt.toISOString()
    const branchId =
      pickText(
        typeof runtimeMetadata.branchId === 'string' ? runtimeMetadata.branchId : '',
        typeof existing?.branchId === 'string' ? existing.branchId : '',
        Array.isArray(existing?.sourceBranchIds) && typeof existing.sourceBranchIds[0] === 'string'
          ? existing.sourceBranchIds[0]
          : '',
        node.stageIndex === 0 ? `branch:${topicId}:origin` : `branch:${topicId}:stage-${node.stageIndex}`,
      ) || `branch:${topicId}:stage-${node.stageIndex}`
    const problemNodeId =
      pickText(
        Array.isArray(existing?.sourceProblemNodeIds) &&
          typeof existing.sourceProblemNodeIds[0] === 'string'
          ? existing.sourceProblemNodeIds[0]
          : '',
        node.stageIndex === 0 ? `${topicId}:origin-problem` : `${topicId}:problem:${node.stageIndex}`,
      ) || `${topicId}:problem:${node.stageIndex}`

    return {
      nodeId: node.id,
      id: node.id,
      topicId,
      stageIndex: node.stageIndex,
      paperIds,
      primaryPaperId: node.primaryPaperId,
      sourceBranchIds:
        runtimeMetadata.sourceBranchIds && runtimeMetadata.sourceBranchIds.length > 0
          ? runtimeMetadata.sourceBranchIds
          : [branchId],
      sourceProblemNodeIds:
        runtimeMetadata.sourceProblemNodeIds && runtimeMetadata.sourceProblemNodeIds.length > 0
          ? runtimeMetadata.sourceProblemNodeIds
          : [problemNodeId],
      status: node.provisional ? 'provisional' : 'canonical',
      provisional: node.provisional,
      nodeLabel: node.nodeLabel,
      nodeSummary: node.nodeSummary,
      nodeExplanation: node.nodeExplanation,
      isMergeNode: node.isMergeNode,
      tags: [],
      discoveredAt: primaryPublishedAt,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
      version: 1,
      branchId,
      paperId: node.primaryPaperId,
      paperPublishedAt: primaryPublishedAt,
      title: node.nodeLabel,
      summary: node.nodeSummary,
      isKeyPaper: node.stageIndex === 0 || !node.isMergeNode,
    }
  })

  const normalizedResearchNodes = normalizeResearchNodes(researchNodes)
  const branchRegistry =
    normalizedResearchNodes.length > 0
      ? Array.from(
          new Map(
            normalizedResearchNodes.map((node, index) => {
              const branchId =
                node.branchId ?? node.sourceBranchIds[0] ?? `branch:${topicId}:stage-${node.stageIndex}`
              return [
                branchId,
                {
                  branchId,
                  rootProblemNodeId:
                    node.sourceProblemNodeIds[0] ??
                    (node.stageIndex === 0 ? `${topicId}:origin-problem` : `${topicId}:problem:${node.stageIndex}`),
                  parentBranchId: index === 0 ? null : `branch:${topicId}:origin`,
                  anchorPaperId: node.primaryPaperId,
                  anchorPaperPublishedAt: node.paperPublishedAt ?? node.createdAt,
                  lastTrackedPaperId: node.primaryPaperId,
                  lastTrackedPublishedAt: node.paperPublishedAt ?? node.updatedAt,
                  stageIndex: Math.max(1, node.stageIndex + 1),
                  activeWindowMonths: defaultWindowMonths,
                  status: 'active',
                  priorityScore: index === 0 ? 0.95 : 0.72,
                  linkedProblemNodeIds: node.sourceProblemNodeIds,
                  mergedIntoBranchId: null,
                  branchType: node.isMergeNode ? 'merge' : 'direct',
                  label: node.stageIndex === 0 ? 'origin' : node.nodeLabel,
                  summary: clipText(node.nodeSummary, 180),
                },
              ] as const
            }),
          ).values(),
        )
      : buildFallbackBranchRegistry({
          topicId,
          topicOriginPaperId: topicDefinition.origin.originPaperId,
          topicDefaults: topicDefinition.defaults as unknown as Record<string, unknown>,
          topicMemory: existingTopicMemory,
          paperCatalog,
        })

  const paperRelations =
    topic.papers.length > 0
      ? topic.papers.map((paper) => {
          const relatedNodes = normalizedResearchNodes.filter((node) => node.paperIds.includes(paper.id))
          const primaryNode = relatedNodes[0] ?? normalizedResearchNodes.find((node) => node.primaryPaperId === paper.id)
          const branchIds = uniqueStrings(
            [...relatedNodes.flatMap((node) => node.sourceBranchIds), ...(primaryNode?.sourceBranchIds ?? [])],
          )
          return {
            paperId: paper.id,
            nodeId: primaryNode?.nodeId ?? `node:${paper.id}`,
            problemNodeIds: uniqueStrings(
              [...relatedNodes.flatMap((node) => node.sourceProblemNodeIds), ...(primaryNode?.sourceProblemNodeIds ?? [])],
            ),
            branchIds,
            primaryBranchId: branchIds[0] ?? `branch:${topicId}:origin`,
            isMergePaper: relatedNodes.some((node) => node.isMergeNode),
            mergedBranchIds: [],
            resolvedProblemIds: [],
          }
        })
      : buildFallbackPaperRelations({
          topicId,
          topicMemory: existingTopicMemory,
          branchRegistry,
        })

  const publishedMainlinePaperIds = uniqueStrings(
    [...normalizedResearchNodes.map((node) => node.primaryPaperId), topicDefinition.origin.originPaperId],
  )
  const publishedBranchPaperIds = uniqueStrings(
    paperRelations
      .filter((relation) => relation.primaryBranchId !== (branchRegistry[0]?.branchId ?? `branch:${topicId}:origin`))
      .map((relation) => relation.paperId),
  )

  topicMemoryCollection[topicId] = {
    ...existingTopicMemory,
    schemaVersion:
      typeof existingTopicMemory.schemaVersion === 'number'
        ? existingTopicMemory.schemaVersion
        : 4,
    topicId,
    queryTags: topicDefinition.queryTags,
    capabilityRefs: topicDefinition.capabilityRefs,
    bootstrapWindowDays: topicDefinition.defaults.bootstrapWindowDays,
    publishedMainlinePaperIds,
    publishedBranchPaperIds,
    candidatePaperIds: [],
    branchRegistry,
    paperRelations,
    branchTree: syncLegacyBranchTree({
      topicId,
      topicMemory: existingTopicMemory,
      branchRegistry,
      paperRelations,
    }),
    researchNodes: normalizedResearchNodes,
    lastUpdatedAt: new Date().toISOString(),
  }

  for (const paper of topic.papers) {
    const existingCatalog = paperCatalog[paper.id] ?? {}
    const figurePaths = Array.from(
      new Set([
        ...parseJsonStringArray(paper.figurePaths).map((imagePath) =>
          resolvePaperAssetPath({ assetPath: imagePath, paperId: paper.id }) ?? imagePath,
        ),
        ...paper.figures
          .map((figure) => figure.imagePath)
          .map((imagePath) => resolvePaperAssetPath({ assetPath: imagePath, paperId: paper.id }) ?? imagePath)
          .filter((imagePath): imagePath is string => typeof imagePath === 'string' && imagePath.trim().length > 0),
      ]),
    )

    paperCatalog[paper.id] = {
      ...existingCatalog,
      id: paper.id,
      title: paper.title,
      titleZh: paper.titleZh,
      titleEn: paper.titleEn,
      summary: paper.summary,
      published: paper.published.toISOString(),
      authors: parseJsonStringArray(paper.authors),
      arxivUrl: paper.arxivUrl,
      pdfUrl: paper.pdfUrl,
    }
    paperAssets[paper.id] = {
      ...(paperAssets[paper.id] ?? {}),
      coverPath: resolvePaperAssetPath({ assetPath: paper.coverPath, paperId: paper.id }) ?? paper.coverPath,
      figurePaths,
    }
    paperMetrics[paper.id] = {
      ...(paperMetrics[paper.id] ?? {}),
      citationCount: paper.citationCount,
    }
  }

  const topicDisplayEntry = buildTopicDisplayEntry({
    topicId,
    nameZh: topicDefinition.nameZh,
    nameEn: topicDefinition.nameEn,
    focusLabel: topicDefinition.focusLabel,
    originPaperId: topicDefinition.origin.originPaperId,
    configuredPaperIds: topic.papers.map((paper) => paper.id),
    frontendSummary: topicDefinition.frontendSummary,
    topicMemory: topicMemoryCollection[topicId],
    paperCatalog,
  })

  writeJsonFile(topicMemoryPath, topicMemoryCollection)
  writeJsonFile(paperCatalogPath, paperCatalog)
  writeJsonFile(paperAssetsPath, paperAssets)
  writeJsonFile(paperMetricsPath, paperMetrics)
  writeJsonFile(topicDisplayPath, upsertTopicDisplayEntry(topicDisplayCollection, topicDisplayEntry))

  logger.info('Configured topic workflow snapshot synced from live database state.', {
    topicId,
    nodeCount: normalizedResearchNodes.length,
    paperCount: topic.papers.length,
  })

  return true
}

export function parseConfiguredTopicIdFromNodeId(nodeId: string) {
  const stageMatch = nodeId.match(/^([^:]+):stage-\d+:/u)
  const candidate = stageMatch?.[1] ?? nodeId.split(':')[0] ?? ''
  return candidate && isConfiguredTopicId(candidate) ? candidate : null
}

function buildLegacyTopicConfigKeyFilters(topicIds: string[]) {
  return topicIds.flatMap((topicId) => [
    { key: { startsWith: `topic-stage-config:v1:${topicId}` } },
    { key: { startsWith: `${TOPIC_ARTIFACT_KEY_PREFIX}${topicId}:` } },
    { key: { startsWith: `alpha:reader-artifact:${topicId}:` } },
    { key: { startsWith: `generation-artifact-index:v1:${topicId}` } },
    { key: { startsWith: `topic:guidance-ledger:v1:${topicId}` } },
    { key: { startsWith: `topic:session-memory:v1:${topicId}` } },
    { key: { startsWith: `topic-research-world:v1:${topicId}` } },
    { key: { startsWith: `generation-judgments:v1:${topicId}` } },
  ])
}

export async function pruneLegacySeedTopics(topicIds: readonly string[] = LEGACY_SEED_TOPIC_IDS) {
  const scopedTopicIds = Array.from(new Set(topicIds.map((topicId) => topicId.trim()).filter(Boolean)))
  if (scopedTopicIds.length === 0) return []

  const legacyTopics = await prisma.topics.findMany({
    where: {
      id: {
        in: scopedTopicIds,
      },
    },
    select: {
      id: true,
      papers: {
        select: { id: true },
      },
      research_nodes: {
        select: { id: true },
      },
    },
  })

  if (legacyTopics.length === 0) return []

  const legacyTopicIds = legacyTopics.map((topic) => topic.id)
  const legacyPaperIds = Array.from(
    new Set(legacyTopics.flatMap((topic) => topic.papers.map((paper) => paper.id))),
  )
  const legacyNodeIds = Array.from(
    new Set(legacyTopics.flatMap((topic) => topic.research_nodes.map((node) => node.id))),
  )

  await prisma.$transaction([
    prisma.topic_guidance_ledgers.deleteMany({
      where: {
        topicId: {
          in: legacyTopicIds,
        },
      },
    }),
    prisma.topic_session_memories.deleteMany({
      where: {
        topicId: {
          in: legacyTopicIds,
        },
      },
    }),
    prisma.research_pipeline_states.deleteMany({
      where: {
        topicId: {
          in: legacyTopicIds,
        },
      },
    }),
    prisma.research_world_snapshots.deleteMany({
      where: {
        topicId: {
          in: legacyTopicIds,
        },
      },
    }),
    prisma.topics.deleteMany({
      where: {
        id: {
          in: legacyTopicIds,
        },
      },
    }),
  ])

  const configKeyFilters = buildLegacyTopicConfigKeyFilters(legacyTopicIds)
  if (configKeyFilters.length > 0) {
    await prisma.system_configs.deleteMany({
      where: {
        OR: [
          ...configKeyFilters,
          ...legacyPaperIds.map((paperId) => ({ key: { contains: paperId } })),
          ...legacyNodeIds.map((nodeId) => ({ key: { contains: nodeId } })),
        ],
      },
    })
  }

  logger.info('Pruned legacy seeded topics before canonical topic materialization.', {
    topicIds: legacyTopicIds,
    paperCount: legacyPaperIds.length,
    nodeCount: legacyNodeIds.length,
  })

  return legacyTopicIds
}

export async function ensureConfiguredTopicMaterialized(topicId: string) {
  if (!isConfiguredTopicId(topicId)) return false

  const existingJob = materializationQueue.get(topicId)
  if (existingJob) return existingJob

  const job = materializeConfiguredTopic(topicId).finally(() => {
    materializationQueue.delete(topicId)
  })
  materializationQueue.set(topicId, job)
  return job
}

export async function ensureConfiguredTopicsMaterialized(topicIds?: string[]) {
  await pruneLegacySeedTopics()

  const ids = topicIds && topicIds.length > 0
    ? Array.from(new Set(topicIds.filter((topicId) => isConfiguredTopicId(topicId))))
    : loadTopicDefinitions().map((topic) => topic.id)

  const completed: string[] = []
  for (const topicId of ids) {
    const materialized = await ensureConfiguredTopicMaterialized(topicId)
    if (materialized) completed.push(topicId)
  }

  return completed
}

export async function ensureConfiguredTopicMaterializedForNode(nodeId: string) {
  const topicId = parseConfiguredTopicIdFromNodeId(nodeId)
  if (!topicId) return false
  return ensureConfiguredTopicMaterialized(topicId)
}

export const __testing = {
  collectConfiguredTopicPaperIds,
  buildFallbackNodeSpec,
  buildNodeSpecs,
  buildPaperSpecs,
  parseConfiguredTopicIdFromNodeId,
  LEGACY_SEED_TOPIC_IDS,
  buildLegacyTopicConfigKeyFilters,
}
