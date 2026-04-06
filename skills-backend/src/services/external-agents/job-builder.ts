import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { prisma } from '../../lib/prisma'
import { AppError } from '../../middleware/errorHandler'
import {
  getGenerationRuntimeConfig,
  getPromptStudioBundle,
  getPromptTemplate,
  type ExternalAgentAssetRecord,
  type GenerationEditorialPolicy,
  type GenerationRuntimeConfig,
  type PromptLanguage,
  type PromptTemplateId,
  type PromptTemplateRecord,
} from '../generation/prompt-registry'
import { getSanitizedUserModelConfig } from '../omni/config-store'
import type { ModelSlot } from '../omni/types'
import { getNodeViewModel, getPaperViewModel } from '../topics/alpha-reader'
import {
  buildResearchPipelineContext,
  loadResearchPipelineState,
  type ResearchPipelineContextOptions,
} from '../topics/research-pipeline'
import { loadTopicResearchReport } from '../topics/research-report'
import { collectTopicSessionMemoryContext } from '../topics/topic-session-memory'
import { collectTopicCognitiveMemory } from '../topics/topic-cognitive-memory'

export type ExternalAgentSubjectType = 'generic' | 'topic' | 'node' | 'paper'

export interface ExternalAgentJobBuildInput {
  templateId: PromptTemplateId
  language?: PromptLanguage
  topicId?: string
  subjectType?: ExternalAgentSubjectType
  subjectId?: string
  input?: unknown
  memoryContext?: unknown
  outputContract?: unknown
  persist?: boolean
  fileName?: string
}

type SubjectResolution = {
  subject: {
    type: ExternalAgentSubjectType
    id: string | null
    topicId: string | null
    title: string
    route: string | null
    summary: string
    snapshot: unknown
  }
  input: unknown
  memoryContext: unknown
}

export interface ExternalAgentJobPackage {
  schemaVersion: 'external-agent-job-v2'
  jobId: string
  generatedAt: string
  language: PromptLanguage
  template: {
    id: PromptTemplateRecord['id']
    family: PromptTemplateRecord['family']
    slot: PromptTemplateRecord['slot']
    title: string
    description: string
    system: string
    user: string
    notes: string
    tags: string[]
  }
  editorialPolicy: GenerationEditorialPolicy
  runtime: GenerationRuntimeConfig
  modelTarget: {
    slot: ModelSlot
    configured: boolean
    provider: string | null
    model: string | null
    baseUrl: string | undefined
    apiKeyStatus: 'configured' | 'missing'
  }
  subject: SubjectResolution['subject']
  input: unknown
  memoryContext: unknown
  outputContract: unknown
  scaffold: {
    rootDir: string
    readmePath: string
    promptGuidePath: string
    superPromptPath: string
    configExamplePath: string
    assets: ExternalAgentAssetRecord[]
    supportedAgents: string[]
    workflow: string[]
  }
  savedPath?: string
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function uniqueStrings(values: string[], limit = 8) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = clipText(value, 220)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= limit) break
  }

  return output
}

function buildDefaultOutputContract(templateId: PromptTemplateId) {
  return {
    type: 'json-object',
    templateId,
    guidance:
      'Replace this scaffold with a stricter contract from the frontend when the downstream parser needs exact fields.',
    required: ['result'],
    properties: {
      result: 'Primary structured output for this generation pass.',
      notes: 'Optional editorial notes or self-check remarks.',
    },
  }
}

function sanitizeFileName(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96)

  return normalized || `job-${Date.now()}`
}

async function loadTopicSubjectSnapshot(topicId: string) {
  const [topic, stageNodeCounts] = await Promise.all([
    prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            papers: true,
            nodes: true,
            stages: true,
          },
        },
      },
    }),
    prisma.researchNode.groupBy({
      by: ['stageIndex'],
      where: { topicId },
      _count: { _all: true },
    }),
  ])

  if (!topic) {
    throw new AppError(404, 'Topic not found for external agent job.')
  }

  const nodeCountByStage = new Map(
    stageNodeCounts.map((entry) => [entry.stageIndex, entry._count._all] as const),
  )

  return {
    topicId: topic.id,
    title: topic.nameZh,
    titleEn: topic.nameEn ?? '',
    focusLabel: topic.focusLabel ?? '',
    summary: topic.summary ?? '',
    description: topic.description ?? '',
    language: topic.language,
    status: topic.status,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
    stats: {
      paperCount: topic._count.papers,
      nodeCount: topic._count.nodes,
      stageCount: topic._count.stages,
    },
    stages: topic.stages.map((stage) => ({
      stageIndex: stage.order,
      title: stage.name,
      titleEn: stage.nameEn ?? '',
      description: stage.description ?? '',
      descriptionEn: stage.descriptionEn ?? '',
      nodeCount: nodeCountByStage.get(stage.order) ?? 0,
    })),
  }
}

async function buildTopicMemoryContext(topicId: string, topicSnapshot?: Awaited<ReturnType<typeof loadTopicSubjectSnapshot>>) {
  const topic = topicSnapshot ?? (await loadTopicSubjectSnapshot(topicId))
  const [report, pipelineState, sessionMemory, cognitiveMemory] = await Promise.all([
    loadTopicResearchReport(topicId),
    loadResearchPipelineState(topicId),
    collectTopicSessionMemoryContext(topicId, { recentLimit: 8 }),
    collectTopicCognitiveMemory({ topicId, subjectType: 'topic', subjectId: topicId, recentLimit: 8 }),
  ])

  return {
    report: report
      ? {
          reportId: report.reportId,
          status: report.status,
          headline: report.headline,
          dek: report.dek,
          summary: report.summary,
          durationHours: report.durationHours,
          updatedAt: report.updatedAt,
          keyMoves: report.keyMoves.slice(0, 6),
          openQuestions: report.openQuestions.slice(0, 4),
        }
      : null,
    pipeline: buildResearchPipelineContext(pipelineState, { historyLimit: 8 }),
    sessionMemory,
    cognitiveMemory,
    stageDossiers: topic.stages.map((stage) => ({
      stageIndex: stage.stageIndex,
      title: stage.title,
      titleEn: stage.titleEn,
      description: stage.description,
      nodeCount: stage.nodeCount,
    })),
  }
}

async function buildNodeMemoryContext(nodeId: string, topicId: string) {
  const nodeRecord = await prisma.researchNode.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      stageIndex: true,
      papers: {
        select: { paperId: true },
      },
    },
  })

  if (!nodeRecord) {
    throw new AppError(404, 'Node not found for external agent job.')
  }

  const [report, pipelineState, sessionMemory, cognitiveMemory] = await Promise.all([
    loadTopicResearchReport(topicId),
    loadResearchPipelineState(topicId),
    collectTopicSessionMemoryContext(topicId, { recentLimit: 8 }),
    collectTopicCognitiveMemory({ topicId, subjectType: 'node', subjectId: nodeId, recentLimit: 8 }),
  ])

  const pipelineOptions: ResearchPipelineContextOptions = {
    nodeId,
    paperIds: nodeRecord.papers.map((entry) => entry.paperId),
    stageIndex: nodeRecord.stageIndex,
    historyLimit: 8,
  }

  return {
    report: report
      ? {
          reportId: report.reportId,
          status: report.status,
          headline: report.headline,
          summary: report.summary,
          keyMoves: report.keyMoves.slice(0, 6),
          openQuestions: report.openQuestions.slice(0, 4),
        }
      : null,
    pipeline: buildResearchPipelineContext(pipelineState, pipelineOptions),
    sessionMemory,
    cognitiveMemory,
  }
}

async function buildPaperMemoryContext(paperId: string, topicId: string) {
  const paperRecord = await prisma.paper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      nodePapers: {
        select: {
          node: {
            select: {
              id: true,
              stageIndex: true,
            },
          },
        },
      },
    },
  })

  if (!paperRecord) {
    throw new AppError(404, 'Paper not found for external agent job.')
  }

  const stageIndex =
    paperRecord.nodePapers
      .map((entry) => entry.node.stageIndex)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right)[0] ?? undefined

  const [report, pipelineState, sessionMemory, cognitiveMemory] = await Promise.all([
    loadTopicResearchReport(topicId),
    loadResearchPipelineState(topicId),
    collectTopicSessionMemoryContext(topicId, { recentLimit: 8 }),
    collectTopicCognitiveMemory({ topicId, subjectType: 'paper', subjectId: paperId, recentLimit: 8 }),
  ])

  return {
    report: report
      ? {
          reportId: report.reportId,
          status: report.status,
          headline: report.headline,
          summary: report.summary,
          keyMoves: report.keyMoves.slice(0, 6),
          openQuestions: report.openQuestions.slice(0, 4),
        }
      : null,
    pipeline: buildResearchPipelineContext(pipelineState, {
      paperIds: [paperId],
      stageIndex,
      historyLimit: 8,
    }),
    sessionMemory,
    cognitiveMemory,
  }
}

async function resolveSubjectContext(
  subjectType: ExternalAgentSubjectType,
  topicId: string | undefined,
  subjectId: string | undefined,
  input: unknown,
  memoryContext: unknown,
): Promise<SubjectResolution> {
  if (subjectType === 'generic') {
    return {
      subject: {
        type: 'generic',
        id: null,
        topicId: topicId ?? null,
        title: 'Generic external agent job',
        route: null,
        summary: 'A frontend-configurable prompt and runtime package without a bound topic artifact.',
        snapshot: null,
      },
      input: input ?? {},
      memoryContext: memoryContext ?? null,
    }
  }

  if (subjectType === 'topic') {
    const resolvedTopicId = subjectId ?? topicId
    if (!resolvedTopicId) {
      throw new AppError(400, 'Topic subject requires a topic id.')
    }

    const topicSnapshot = await loadTopicSubjectSnapshot(resolvedTopicId)
    return {
      subject: {
        type: 'topic',
        id: resolvedTopicId,
        topicId: resolvedTopicId,
        title: topicSnapshot.title,
        route: `/topic/${resolvedTopicId}`,
        summary: clipText(topicSnapshot.summary, 260),
        snapshot: topicSnapshot,
      },
      input: input ?? topicSnapshot,
      memoryContext: memoryContext ?? (await buildTopicMemoryContext(resolvedTopicId, topicSnapshot)),
    }
  }

  if (subjectType === 'node') {
    if (!subjectId) {
      throw new AppError(400, 'Node subject requires a node id.')
    }

    const nodeViewModel = await getNodeViewModel(subjectId)
    const resolvedTopicId = topicId ?? nodeViewModel.topic.topicId

    return {
      subject: {
        type: 'node',
        id: subjectId,
        topicId: resolvedTopicId,
        title: nodeViewModel.title,
        route: `/node/${subjectId}`,
        summary: clipText(nodeViewModel.summary, 260),
        snapshot: nodeViewModel,
      },
      input: input ?? nodeViewModel,
      memoryContext: memoryContext ?? (await buildNodeMemoryContext(subjectId, resolvedTopicId)),
    }
  }

  if (!subjectId) {
    throw new AppError(400, 'Paper subject requires a paper id.')
  }

  const paperViewModel = await getPaperViewModel(subjectId)
  const resolvedTopicId = topicId ?? paperViewModel.topic.topicId

  return {
    subject: {
      type: 'paper',
      id: subjectId,
      topicId: resolvedTopicId,
      title: paperViewModel.title,
      route: `/paper/${subjectId}`,
      summary: clipText(paperViewModel.summary, 260),
      snapshot: paperViewModel,
    },
    input: input ?? paperViewModel,
    memoryContext: memoryContext ?? (await buildPaperMemoryContext(subjectId, resolvedTopicId)),
  }
}

async function persistJobPackage(
  bundle: Awaited<ReturnType<typeof getPromptStudioBundle>>,
  jobPackage: ExternalAgentJobPackage,
  fileName?: string,
) {
  const baseName = sanitizeFileName(
    fileName ??
      `${jobPackage.template.id}-${jobPackage.subject.type}-${jobPackage.subject.id ?? jobPackage.jobId}`,
  )
  const outPath = path.join(bundle.externalAgents.rootDir, 'jobs', `${baseName}.json`)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(jobPackage, null, 2), 'utf8')
  return outPath
}

export async function buildExternalAgentJobPackage(
  input: ExternalAgentJobBuildInput,
): Promise<ExternalAgentJobPackage> {
  const subjectType = input.subjectType ?? 'generic'
  const [template, runtime, bundle, modelConfig] = await Promise.all([
    getPromptTemplate(input.templateId),
    getGenerationRuntimeConfig(),
    getPromptStudioBundle(),
    getSanitizedUserModelConfig(),
  ])

  const language = input.language ?? runtime.defaultLanguage
  const languageContent = template.languageContents[language] ?? template.languageContents.zh
  const editorialPolicy = runtime.editorialPolicies[language] ?? runtime.editorialPolicies.zh
  const subject = await resolveSubjectContext(
    subjectType,
    input.topicId,
    input.subjectId,
    input.input,
    input.memoryContext,
  )
  const slotConfig = template.slot === 'multimodal' ? modelConfig.multimodal : modelConfig.language
  const basePackage: ExternalAgentJobPackage = {
    schemaVersion: 'external-agent-job-v2',
    jobId: randomUUID(),
    generatedAt: new Date().toISOString(),
    language,
    template: {
      id: template.id,
      family: template.family,
      slot: template.slot,
      title: template.title,
      description: template.description,
      system: languageContent.system,
      user: languageContent.user,
      notes: languageContent.notes,
      tags: template.tags,
    },
    editorialPolicy,
    runtime,
    modelTarget: {
      slot: template.slot,
      configured: Boolean(slotConfig),
      provider: slotConfig?.provider ?? null,
      model: slotConfig?.model ?? null,
      baseUrl: slotConfig?.baseUrl,
      apiKeyStatus: slotConfig?.apiKeyStatus ?? 'missing',
    },
    subject: subject.subject,
    input: subject.input,
    memoryContext: subject.memoryContext,
    outputContract: input.outputContract ?? buildDefaultOutputContract(template.id),
    scaffold: {
      rootDir: bundle.externalAgents.rootDir,
      readmePath: bundle.externalAgents.readmePath,
      promptGuidePath: bundle.externalAgents.promptGuidePath,
      superPromptPath: bundle.externalAgents.superPromptPath,
      configExamplePath: bundle.externalAgents.configExamplePath,
      assets: bundle.externalAgents.assets,
      supportedAgents: ['codex', 'claude', 'custom'],
      workflow: [
        'Keep this job grounded in the supplied template, runtime, editorial policy, and memory context.',
        'Treat the result as one controlled generation pass inside the backend pipeline, not a free-form rewrite.',
        'Return JSON only and hand the output back to the backend or adapter instead of editing registry files directly.',
      ],
    },
  }

  if (!input.persist) {
    return basePackage
  }

  const savedPath = await persistJobPackage(bundle, basePackage, input.fileName)
  return {
    ...basePackage,
    savedPath,
  }
}
