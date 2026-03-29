import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildExecutionMemoryChange } from '../shared/memory.ts'
import { buildPaperEditorialChange, buildTopicEditorialChange } from '../shared/tracker-content.ts'
import { resolveProviderConfig } from '../../../../model-runtime/src/config.ts'
import { runAnthropicConnector, runOpenAICompatibleConnector } from '../../../../model-runtime/src/connectors/api/index.ts'

import {
  asRecord,
  asString,
  buildFallbackBranchRegistry,
  buildFallbackPaperRelations,
  normalizeBranchingDefaults,
  resolveMainlineBranchId,
} from '../../../shared/research-graph.ts'
import {
  applyTimelineContextPatch,
  buildProblemNodesFromTimelineContext,
  normalizeTimelineContext,
} from '../../../shared/timeline-context.ts'

import type {
  SkillArtifactChange,
  SkillContextSnapshot,
  SkillExecutionRequest,
} from '../../../engine/contracts.ts'
import type {
  RuntimeContentPart,
  RuntimeMessage,
  RuntimeProviderId,
} from '../../../../model-runtime/src/types.ts'

type AttachmentInput = {
  kind: string
  name: string
  assetPath?: string
}

type BranchContextResolution = {
  branch: Record<string, unknown> | null
  relation: {
    paperId: string
    problemNodeIds: string[]
    branchIds: string[]
    primaryBranchId: string
    isMergePaper: boolean
    mergedBranchIds: string[]
    resolvedProblemIds: string[]
  }
  targetProblemIds: string[]
  targetProblems: Array<Record<string, unknown>>
}

type DirectProviderId = Exclude<RuntimeProviderId, 'agent-skill'>

type ContentRuntimeConfig = {
  providerId: DirectProviderId
  model: string
  temperature: number
  maxTokens: number
}

type LlmSectionPayload = {
  id: string
  sourceSectionTitle: string
  editorialTitle: string
  paragraphs: string[]
}

type LlmProblemPayload = {
  id: string
  question: string
  whyItMatters: string
  tags: string[]
  problemConstraints: string[]
  requiredCapabilities: string[]
  potentialTransferDirections: string[]
}

type LlmEditorialPayload = {
  titleZh: string
  highlight: string
  cardDigest: string
  timelineDigest: string
  openingStandfirst: string
  coverCaption: string
  sections: LlmSectionPayload[]
  closingHandoff: string[]
  problemsOut: LlmProblemPayload[]
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..', '..', '..')
const promptBaselinePath = path.join(currentDir, 'prompts', 'editorial-baseline.md')
let promptBaselineCache: string | null = null

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}...`
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function isGenericBranchLabel(value: string | null | undefined) {
  const label = normalizeWhitespace(value || '')
  if (!label) return true
  return (
    label === 'Origin Branch' ||
    label === '主干候选分支' ||
    label === '迁移候选分支' ||
    /^迁移分支\s+/u.test(label) ||
    /^Branch\s+/u.test(label) ||
    /^Transfer Branch\s+/iu.test(label)
  )
}

function compactResearchLabel(value: string | null | undefined, maxLength = 14) {
  const source = normalizeWhitespace(value || '')
  if (!source) return ''
  const cleaned = source.replace(/[？?]/g, '')
  const firstClause = cleaned.split(/[，。；：]/)[0]?.trim() || cleaned
  if (firstClause.length <= maxLength) return firstClause
  return `${firstClause.slice(0, maxLength).trimEnd()}…`
}

function deriveBranchLabel(args: {
  branch: Record<string, unknown> | null
  topicNameZh: string
  targetProblems: Array<Record<string, unknown>>
}) {
  const branchId = asString(args.branch?.branchId, '')
  if (branchId === 'main' || branchId.startsWith('main:') || /:origin$/u.test(branchId)) return '主线'

  const explicitLabel = asString(args.branch?.label, '')
  if (explicitLabel && !isGenericBranchLabel(explicitLabel)) {
    return compactResearchLabel(explicitLabel, 14)
  }

  const problemLabel = args.targetProblems
    .map((problemNode) => asString(problemNode.stageTitle, asString(problemNode.question, '')))
    .find(Boolean)
  if (problemLabel) {
    return compactResearchLabel(problemLabel, 14)
  }

  const branchType = asString(args.branch?.branchType, '')
  if (branchType === 'transfer') return '迁移研究线'
  if (branchType === 'merge') return '汇流研究线'
  return `${args.topicNameZh}研究支线`
}

function formatDate(value: string) {
  return value ? value.slice(0, 10) : '未知日期'
}

function joinNames(values: string[], limit: number) {
  if (values.length === 0) return '作者信息暂缺'
  const picked = values.slice(0, limit).join('、')
  return values.length > limit ? `${picked} 等` : picked
}

function buildCanonicalFigureAttachments(args: {
  paperAssets: Record<string, unknown> | undefined
  paperId: string
  fallbackWhenEmpty: boolean
}) {
  const assetRecord =
    args.paperAssets && typeof args.paperAssets[args.paperId] === 'object' && args.paperAssets[args.paperId] !== null
      ? (args.paperAssets[args.paperId] as Record<string, unknown>)
      : null
  const figurePaths = Array.isArray(assetRecord?.figurePaths)
    ? assetRecord.figurePaths.filter((item): item is string => typeof item === 'string')
    : []

  if (!args.fallbackWhenEmpty || figurePaths.length === 0) {
    return [] as AttachmentInput[]
  }

  return figurePaths.slice(0, 4).map((figurePath) => ({
    kind: 'figure',
    name: figurePath.split('/').pop() ?? figurePath,
    assetPath: figurePath,
  }))
}

function resolveBranchContext(args: {
  context: SkillContextSnapshot
  topicId: string
  paperId: string
  branchId?: string
  problemNodeIds?: string[]
}): BranchContextResolution {
  const topic = args.context.topic
  const topicMemory = asRecord(args.context.topicMemory) ?? {}
  const paperCatalog = (args.context.paperCatalog ?? {}) as Record<string, Record<string, unknown>>
  const defaults = normalizeBranchingDefaults(topic?.defaults as Record<string, unknown> | undefined)
  const branchRegistry = topic
    ? buildFallbackBranchRegistry({
        topicId: args.topicId,
        topicOriginPaperId: topic.originPaperId,
        topicDefaults: defaults,
        topicMemory,
        paperCatalog,
      })
    : []
  const paperRelations = buildFallbackPaperRelations({
    topicId: args.topicId,
    topicMemory,
    branchRegistry,
  })
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry,
  })
  const relation =
    paperRelations.find((entry) => entry.paperId === args.paperId) ?? {
      paperId: args.paperId,
      problemNodeIds: [],
      branchIds: [],
      primaryBranchId: args.branchId ?? mainlineBranchId,
      isMergePaper: false,
      mergedBranchIds: [],
      resolvedProblemIds: [],
    }
  const branchId = args.branchId ?? relation.primaryBranchId ?? branchRegistry[0]?.branchId ?? null
  const branch = branchRegistry.find((entry) => entry.branchId === branchId) ?? null
  const problemNodes = Array.isArray(topicMemory.problemNodes)
    ? (topicMemory.problemNodes as Array<Record<string, unknown>>)
    : []
  const targetProblemIds = args.problemNodeIds?.length
    ? args.problemNodeIds
    : relation.problemNodeIds.length > 0
      ? relation.problemNodeIds
      : branch?.linkedProblemNodeIds ?? []
  const targetProblems = targetProblemIds
    .map((problemNodeId) => problemNodes.find((problemNode) => problemNode.id === problemNodeId))
    .filter((problemNode): problemNode is Record<string, unknown> => Boolean(problemNode))

  return {
    branch,
    relation,
    targetProblemIds,
    targetProblems,
  }
}

function inferSignals(title: string, abstract: string) {
  const text = `${title} ${abstract}`.toLowerCase()
  return {
    proposes: /(propose|introduce|present|we develop|we design|we describe|novel)/.test(text),
    benchmarked: /(benchmark|evaluate|experiment|task|dataset|result|outperform|improve|state-of-the-art)/.test(text),
    toolUse: /(tool|api|search|calculator|wikipedia|act|action|agent)/.test(text),
    memory: /(memory|reflection|reflective|state space|reasoning|trajectory)/.test(text),
    multiAgent: /(multi-agent|agent society|role|coordination|collaboration)/.test(text),
    autonomousDriving: /(driv|steer|vehicle|road|camera|autonomous)/.test(text),
    transformer: /(attention|transformer|sequence|encoder|decoder|context)/.test(text),
    bioInspired: /(biological|neural circuit|neuronal|worm|elegans|dynamics)/.test(text),
    embodied: /(robot|robotic|embodied|affordance|manipulator|grounding)/.test(text),
    interpretability: /(interpret|trust|explain|transparent)/.test(text),
    multimodal: /(image|vision|visual|figure|table|multimodal)/.test(text),
  }
}

function branchLabel(branch: Record<string, unknown> | null, topicNameZh: string, targetProblems: Array<Record<string, unknown>>) {
  return deriveBranchLabel({
    branch,
    topicNameZh,
    targetProblems,
  })
}

function branchTypeLabel(branch: Record<string, unknown> | null, isMergePaper: boolean) {
  if (isMergePaper) return '汇流段'
  switch (asString(branch?.branchType)) {
    case 'transfer':
      return '迁移分支'
    case 'merge':
      return '汇流分支'
    case 'direct':
      return '主干分支'
    default:
      return '研究分支'
  }
}

function themeSentence(topicId: string) {
  switch (topicId) {
    case 'agent':
      return '它真正关心的是怎样把推理、工具调用、记忆和协作接成一个可持续推进的智能体闭环。'
    case 'autonomous-driving':
      return '它真正关心的是怎样把感知、控制、恢复策略和世界理解接成可落地的自动驾驶主线。'
    case 'transformer-innovation':
      return '它真正关心的是怎样在上下文长度、计算复杂度和状态记忆之间重新设计序列建模骨架。'
    case 'bio-inspired-ml':
      return '它真正关心的是怎样把生物启发、连续动力学和可解释控制迁移成机器学习里的新结构。'
    case 'embodied-vla':
      return '它真正关心的是怎样把语言理解、环境落地和机器人动作序列稳定接起来。'
    default:
      return '它真正关心的是把当前主题里的核心研究问题继续往前推一跳。'
  }
}

function buildMethodSignals(args: {
  topicNameZh: string
  topicId: string
  problemQuestions: string[]
  attachments: AttachmentInput[]
  signals: ReturnType<typeof inferSignals>
}) {
  const lines: string[] = []

  lines.push(
    args.problemQuestions[0]
      ? `从当前上下文看，这篇工作最值得抓住的不是零散实验结果，而是它试图正面回答“${args.problemQuestions[0]}”。`
      : `从当前上下文看，这篇工作最值得抓住的，是它为 ${args.topicNameZh} 提供了一个更可执行的方法抓手。`,
  )

  if (args.signals.proposes) {
    lines.push('论文显然不是只做经验调参，而是在提出新的方法组织方式或新的执行框架。')
  }
  if (args.signals.toolUse || args.signals.memory || args.signals.multiAgent) {
    lines.push('它把“模型内部能力”与“外部执行结构”重新接在一起，这是这条研究线继续分叉和汇流的关键。')
  }
  if (args.signals.autonomousDriving || args.signals.embodied) {
    lines.push('它强调的是从感知到动作的落地闭环，因此比纯离线表征工作更接近真实系统推进。')
  }
  if (args.signals.transformer || args.signals.bioInspired) {
    lines.push('它更像是在重写底层结构假设，因此对后续分支的影响往往会超出单篇论文本身。')
  }
  if (args.attachments.length > 0) {
    lines.push(`本轮还结合了 ${args.attachments.length} 份图像或图表材料来辅助定位结构与证据。`)
  }

  if (lines.length < 2) {
    lines.push(themeSentence(args.topicId))
  }

  return lines
}

function buildImplicationSignals(args: {
  branchLabel: string
  isMergePaper: boolean
  mergedBranchIds: string[]
  signals: ReturnType<typeof inferSignals>
  problemQuestions: string[]
}) {
  const lines: string[] = []
  if (args.isMergePaper) {
    lines.push(`这篇论文之所以重要，不只是它推进了“${args.branchLabel}”，还因为它把多条并行研究线压回到了同一个节点。`)
    if (args.mergedBranchIds.length > 0) {
      lines.push(`它当前被记录为汇流节点，说明至少有 ${args.mergedBranchIds.length} 条分支要重新围绕它来校准后续判断。`)
    }
  } else {
    lines.push(`对当前主题来说，它的价值在于让“${args.branchLabel}”不再停留在问题表述，而开始有了更明确的下一跳。`)
  }

  if (args.signals.benchmarked) {
    lines.push('从摘要信号看，这项工作并非停留在概念层，而是通过任务、基准或实验结果为自己的路线提供了支撑。')
  }
  if (args.signals.interpretability) {
    lines.push('它还明显在意可解释性或可信度，这会影响后续哪些分支值得优先保留。')
  }
  if (args.problemQuestions.length > 1) {
    lines.push('由于它同时碰到了多个问题节点，后端后续需要继续判断它到底是一次短暂交叉，还是新的长期主干。')
  }
  return lines
}

function buildEvidenceSection(attachments: AttachmentInput[]) {
  if (attachments.length === 0) return null

  const names = attachments.map((attachment) => attachment.name)

  return {
    id: 'evidence',
    sourceSectionTitle: '证据与图表',
    editorialTitle: '证据与图表',
    paragraphs: [
      `本轮内容生成额外参考了 ${attachments.length} 份多模态材料，包括 ${names.join('、')}。`,
      '这些材料主要用于辅助判断结构示意、图表趋势和版面中的关键证据位置，而不是替代正式的论文阅读。',
    ],
    evidence: attachments.map((attachment, index) => ({
      id: `${attachment.kind}-${index + 1}`,
      type:
        attachment.kind === 'table-source'
          ? 'table'
          : attachment.kind === 'pdf'
            ? 'figure'
            : attachment.kind === 'image' || attachment.kind === 'figure'
              ? 'figure'
              : 'formula',
      assetPath: attachment.assetPath ?? attachment.name,
      caption: `本轮参考素材：${attachment.name}`,
      analysis: ['该素材用于辅助确认论文中的结构、图表或证据位置。'],
      placement: index + 1,
    })),
  }
}

function buildProblemsOut(args: {
  paperId: string
  topicNameZh: string
  problemQuestions: string[]
  problemPreference: string[]
  isMergePaper: boolean
}) {
  if (args.problemQuestions.length > 0) {
    return args.problemQuestions.map((question, index) => ({
      id: `${args.paperId}-problem-followup-${index + 1}`,
      question,
      whyItMatters:
        index === 0
          ? '这决定了这篇论文在当前主题里究竟是在推进主线，还是只是在补一个局部空白。'
          : '只要它同时触及多个问题节点，后续就必须继续校准它到底是分叉还是汇流。',
      tags: args.problemPreference.slice(index, index + 3),
    }))
  }

  return [
    {
      id: `${args.paperId}-problem-followup-1`,
      question: `《${args.paperId}》在 ${args.topicNameZh} 里真正解决的核心问题是什么？`,
      whyItMatters: args.isMergePaper
        ? '因为它已经被记录为汇流节点，下一轮必须判断它到底是阶段性收束，还是会催生更大的新分支。'
        : '只有把论文映射回主题的问题树，内容才不会退化成普通摘要。',
      tags: args.problemPreference.slice(0, 3),
    },
  ]
}

function buildCoverageWarnings(args: {
  directAttachments: AttachmentInput[]
  canonicalFigureAttachments: AttachmentInput[]
  knownFigurePaths: string[]
  isMergePaper: boolean
  previousCoverageScore: number | null
}) {
  const warnings: string[] = []

  if (args.directAttachments.length === 0 && args.knownFigurePaths.length === 0) {
    warnings.push('本轮没有额外的图像或 PDF 证据，因此正文主要依据 canonical 元数据、题目和分支上下文生成。')
  }
  if (args.canonicalFigureAttachments.length > 0) {
    warnings.push('本轮自动复用了 canonical 已存在的论文素材，避免正文只依赖文本元数据。')
  }
  if (args.isMergePaper) {
    warnings.push('这篇论文被标记为汇流节点，叙事中已经主动吸收了多分支上下文。')
  }
  if (args.previousCoverageScore !== null && args.previousCoverageScore < 1 && args.canonicalFigureAttachments.length > 0) {
    warnings.push('由于历史执行记录显示覆盖率不满，本轮优先附带了已有图表素材。')
  }

  return warnings
}

function buildContextUpdateProposal(args: {
  topic: NonNullable<SkillContextSnapshot['topic']>
  topicMemory: Record<string, unknown> | null
  paperId: string
  branchId: string | null
  stageIndex: number | null
  highlight: string
  timelineDigest: string
  problemsOut: Array<{
    id: string
    question: string
    whyItMatters: string
    tags: string[]
    requiredCapabilities?: string[]
  }>
}) {
  const normalizedTimeline = normalizeTimelineContext(args.topicMemory?.timelineContext, {
    topicId: args.topic.id,
    originPaperId: args.topic.originPaperId,
    originQuestionDefinition:
      asString(asRecord(args.topicMemory?.originAudit)?.originQuestionDefinition, args.topic.frontendSummary?.timelineGuide ?? args.topic.nameZh),
    originWhyThisCounts:
      asString(asRecord(args.topicMemory?.originAudit)?.originWhyThisCounts, args.topic.frontendSummary?.researchBlurb ?? args.topic.nameZh),
    focusTags: [...args.topic.queryTags.slice(0, 4), ...args.topic.problemPreference.slice(0, 4)],
    capabilityRefs: args.topic.capabilityRefs,
    timestamp: new Date().toISOString(),
  })

  const problemNodes = args.problemsOut.slice(0, 3).map((problem, index) => ({
    id: `${args.topic.id}:${args.paperId}:content-problem-${index + 1}`,
    label: truncate(problem.question, 24),
    question: problem.question,
    status: 'active' as const,
    tags: uniqueStrings([...(problem.tags ?? []), ...((problem.requiredCapabilities as string[] | undefined) ?? [])]),
    sourcePaperIds: [args.paperId],
    branchIds: args.branchId ? [args.branchId] : [],
    notes: problem.whyItMatters,
    priorityScore: 0.72,
  }))

  return {
    problemSpace: {
      nodes: problemNodes,
    },
    methodSpace: {
      nodes: [
        {
          id: `${args.topic.id}:${args.paperId}:editorial-method`,
          label: truncate(args.highlight, 20),
          summary: args.timelineDigest,
          sourcePaperIds: [args.paperId],
          relatedProblemIds: problemNodes.map((problem) => problem.id),
        },
      ],
    },
    branchSpace: args.branchId
      ? {
          branches: [
            {
              branchId: args.branchId,
              label: '研究分支',
              status: 'active' as const,
              anchorPaperId: args.paperId,
              stageIndex: args.stageIndex ?? 1,
              linkedProblemIds: problemNodes.map((problem) => problem.id),
              notes: args.timelineDigest,
            },
          ],
        }
      : undefined,
    qualitySpace: {
      signals: [
        {
          id: `${args.topic.id}:${args.paperId}:content-quality`,
          label: `内容生成 ${args.paperId}`,
          assessment: args.highlight,
          score: 0.82,
          sourcePaperIds: [args.paperId],
        },
      ],
    },
    lastUpdatedAt: new Date().toISOString(),
    previewTimelineContext: applyTimelineContextPatch(normalizedTimeline, {
      problemSpace: { nodes: problemNodes },
      methodSpace: {
        nodes: [
          {
            id: `${args.topic.id}:${args.paperId}:editorial-method`,
            label: truncate(args.highlight, 20),
            summary: args.timelineDigest,
            sourcePaperIds: [args.paperId],
            relatedProblemIds: problemNodes.map((problem) => problem.id),
          },
        ],
      },
      branchSpace: args.branchId
        ? {
            branches: [
              {
                branchId: args.branchId,
                label: '研究分支',
                status: 'active',
                anchorPaperId: args.paperId,
                stageIndex: args.stageIndex ?? 1,
                linkedProblemIds: problemNodes.map((problem) => problem.id),
                notes: args.timelineDigest,
              },
            ],
          }
        : undefined,
      qualitySpace: {
        signals: [
          {
            id: `${args.topic.id}:${args.paperId}:content-quality`,
            label: `内容生成 ${args.paperId}`,
            assessment: args.highlight,
            score: 0.82,
            sourcePaperIds: [args.paperId],
          },
        ],
      },
      lastUpdatedAt: new Date().toISOString(),
    }),
  }
}

function readPromptBaseline() {
  if (promptBaselineCache !== null) {
    return promptBaselineCache
  }

  promptBaselineCache = fs.readFileSync(promptBaselinePath, 'utf8')
  return promptBaselineCache
}

function asDirectProviderId(value: unknown): DirectProviderId | null {
  if (value === 'openai-compatible' || value === 'anthropic') {
    return value
  }
  return null
}

function readFiniteNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const lowerBounded = min !== undefined ? Math.max(min, numeric) : numeric
  return max !== undefined ? Math.min(max, lowerBounded) : lowerBounded
}

function inferDefaultDirectProvider(): DirectProviderId {
  const openAIConfig = resolveProviderConfig('openai-compatible')
  if (openAIConfig.apiKey) {
    return 'openai-compatible'
  }

  const anthropicConfig = resolveProviderConfig('anthropic')
  if (anthropicConfig.apiKey) {
    return 'anthropic'
  }

  throw new Error(
    'content-genesis-v2 现在要求直连 LLM 生成正文。请配置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY，或在输入中显式传入 providerId。',
  )
}

function resolvePreferredModel(args: {
  topic: SkillContextSnapshot['topic']
  providerId: DirectProviderId
  requestedModel: unknown
}) {
  const explicitModel = asString(args.requestedModel, '')
  if (explicitModel) {
    return explicitModel
  }

  const preferredModels = asRecord(asRecord(args.topic?.defaults)?.preferredModels)
  const topicPreferredModel = asString(preferredModels?.[args.providerId], '')
  if (topicPreferredModel) {
    return topicPreferredModel
  }

  return resolveProviderConfig(args.providerId).model
}

function resolveContentRuntimeConfig(args: {
  request: SkillExecutionRequest
  topic: SkillContextSnapshot['topic']
}): ContentRuntimeConfig {
  const requestedProvider = asString(args.request.input.providerId, '')
  if (requestedProvider === 'agent-skill') {
    throw new Error('content-genesis-v2 不能通过 agent-skill 生成正式正文；请改用 openai-compatible 或 anthropic。')
  }

  const providerId = asDirectProviderId(requestedProvider) ?? inferDefaultDirectProvider()

  return {
    providerId,
    model: resolvePreferredModel({
      topic: args.topic,
      providerId,
      requestedModel: args.request.input.model,
    }),
    temperature: readFiniteNumber(args.request.input.temperature, 0.18, 0, 1),
    maxTokens: Math.trunc(readFiniteNumber(args.request.input.maxTokens, 4200, 1200, 8000)),
  }
}

function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

function resolveAttachmentAbsolutePath(assetPath: string | undefined) {
  if (!assetPath) return null
  if (path.isAbsolute(assetPath) && fs.existsSync(assetPath)) {
    return assetPath
  }

  const publicCandidate = path.join(repoRoot, 'public', assetPath.replace(/^[/\\]+/, ''))
  if (fs.existsSync(publicCandidate)) {
    return publicCandidate
  }

  const repoCandidate = path.join(repoRoot, assetPath)
  if (fs.existsSync(repoCandidate)) {
    return repoCandidate
  }

  return null
}

function toDataUrl(absolutePath: string) {
  const mimeType = guessMimeType(absolutePath)
  if (!mimeType.startsWith('image/')) {
    return null
  }

  return `data:${mimeType};base64,${fs.readFileSync(absolutePath).toString('base64')}`
}

function buildRuntimeAttachmentPart(attachment: AttachmentInput): RuntimeContentPart {
  const absolutePath = resolveAttachmentAbsolutePath(attachment.assetPath)
  const mimeType = absolutePath ? guessMimeType(absolutePath) : undefined

  if ((attachment.kind === 'image' || attachment.kind === 'figure') && absolutePath) {
    const dataUrl = toDataUrl(absolutePath)
    if (dataUrl) {
      return {
        type: 'image',
        imageUrl: dataUrl,
        detail: 'high',
      }
    }
  }

  return {
    type: 'file',
    fileName: attachment.name,
    mimeType,
    localPath: absolutePath ?? attachment.assetPath,
  }
}

function buildEditorialUserPrompt(args: {
  editorialContext: Record<string, unknown>
  outputContract: Record<string, unknown>
}) {
  const styleContract = {
    overview: '采用“外叙事、内学术”的双层写法。外层负责让读者迅速理解这一跳的历史位置，内层负责把研究判断、证据和边界讲透。',
    outerNarrativeFields: {
      titleZh: '中文标题要清楚、简洁，可带少量研究叙事感，但不要夸张。',
      highlight: '一句强判断，像研究产品首页上的提炼句，直接说明这篇论文在脉络中的位置与核心推进。',
      cardDigest: '用于主题卡片，要求可读、凝练、有叙事抓手，但不能写成宣传语。',
      timelineDigest: '用于时间线卡片，简短说明“这一跳为什么成立”，必须带判断，不要只复述摘要。',
      coverCaption: '像图注或封面短句，帮助读者进入语境，不要空泛拔高。',
    },
    innerAcademicFields: {
      openingStandfirst: '必须先交代前文走到了哪里、当前缺口是什么，再说明本文为何构成转折。',
      sections: '正文主体采用学术中文评述，按问题缺口、方法推进、结果证据、边界条件展开，避免套模板。',
      closingHandoff: '像论文结尾的讨论或展望，明确下一篇论文必须接手的具体问题，而不是泛泛鼓励。',
      problemsOut: '结构化提出后续问题，写清为什么重要、受什么约束、需要什么能力、可能向哪里迁移。',
    },
    sharedRules: [
      '整体语气克制、判断明确，不要写成广告、新闻稿或抒情散文。',
      '关键判断要尽量回扣到结果、图表、附件、公式或 canonical 素材。',
      '允许保留论文原始标题、作者名、必要术语，以及自然使用英文的 branch / focus label。',
      '如果证据有限，必须主动说明边界、条件或仍需验证之处。',
    ],
  }
  return [
    '请根据以下上下文，生成一份严格 JSON 的正式论文解读。',
    '这不是后台汇报，也不是摘要压缩。请把它写成“外叙事、内学术”的双层结构：卡片层与导语层保留项目最初版本那种中文研究叙事感，正文与判断层则按规范论文式中文评述来写。',
    '硬性要求：',
    '1. `highlight`、`cardDigest`、`timelineDigest`、`coverCaption` 走外层叙事风格：可读、凝练、有研究脉络感，但绝不能营销化。',
    '2. `openingStandfirst`、`sections`、`closingHandoff`、`problemsOut` 走内层学术风格：先交代前文走到了哪里和当前缺口，再说明本文推进，并交代证据与边界。',
    '3. `sections` 至少 3 节，最好是 3 到 5 节；每节至少 2 段，并且要服务于论证推进，而不是套模板分栏。',
    '4. 如果上下文里有图表、附件、公式或 canonical 素材，要把它们写成证据，而不是装饰信息；关键判断尽量回扣到结果、现象或材料依据。',
    '5. 正文语气要克制，允许自然使用“然而”“针对上述问题”“结果表明”“这一现象说明”“综上”等学术连接，但不要写成套话。',
    '6. 对论文贡献的表述要保守；如果证据不足，请明确写出边界、条件或仍需验证之处。',
    '7. `closingHandoff` 必须明确指出下一篇论文该接手的具体问题，不能停留在泛泛而谈。',
    '8. `problemsOut` 每项都必须补齐约束、所需能力和潜在迁移方向。',
    '9. 除论文原始标题、作者名、必要术语以及 branch / focus label 外，其余内容尽量使用自然中文。',
    '10. 不要输出 markdown，不要输出解释，只输出一个 JSON 对象。',
    '',
    '上下文：',
    JSON.stringify(args.editorialContext, null, 2),
    '',
    '输出契约：',
    JSON.stringify(args.outputContract, null, 2),
    '',
    '字段风格契约：',
    JSON.stringify(styleContract, null, 2),
  ].join('\n')
}

function buildEditorialMessages(args: {
  topic: NonNullable<SkillContextSnapshot['topic']>
  paper: NonNullable<SkillContextSnapshot['paper']>
  branchContext: BranchContextResolution
  branchLabel: string
  branchTypeLabel: string
  stageIndex: number | null
  contentMode: string
  coverageStrict: boolean
  attachments: AttachmentInput[]
  knownFigurePaths: string[]
  signals: ReturnType<typeof inferSignals>
}): RuntimeMessage[] {
  const promptBaseline = readPromptBaseline()
  const problemQuestions = args.branchContext.targetProblems
    .map((problemNode) => asString(problemNode.question, ''))
    .filter(Boolean)
  const resolvedProblemTitles = args.branchContext.targetProblems
    .map((problemNode) => asString(problemNode.stageTitle, asString(problemNode.question, '')))
    .filter(Boolean)
  const methodHints = buildMethodSignals({
    topicNameZh: args.topic.nameZh,
    topicId: args.topic.id,
    problemQuestions,
    attachments: args.attachments,
    signals: args.signals,
  })
  const implicationHints = buildImplicationSignals({
    branchLabel: args.branchLabel,
    isMergePaper: args.branchContext.relation.isMergePaper,
    mergedBranchIds: args.branchContext.relation.mergedBranchIds,
    signals: args.signals,
    problemQuestions,
  })

  const editorialContext = {
    topic: {
      id: args.topic.id,
      nameZh: args.topic.nameZh,
      nameEn: args.topic.nameEn,
      focusLabel: args.topic.focusLabel ?? null,
      originPaperId: args.topic.originPaperId,
      problemPreference: args.topic.problemPreference,
      capabilityRefs: args.topic.capabilityRefs,
      frontendSummary: args.topic.frontendSummary ?? null,
    },
    paper: {
      id: args.paper.id,
      title: args.paper.title,
      published: args.paper.published,
      publishedLabel: formatDate(args.paper.published),
      authors: args.paper.authors,
      authorLine: joinNames(args.paper.authors, 3),
      summary: args.paper.summary ?? '',
    },
    researchState: {
      branchLabel: args.branchLabel,
      branchTypeLabel: args.branchTypeLabel,
      branchId: asString(args.branchContext.branch?.branchId, ''),
      stageIndex: args.stageIndex,
      isMergePaper: args.branchContext.relation.isMergePaper,
      mergedBranchIds: args.branchContext.relation.mergedBranchIds,
      problemQuestions,
      resolvedProblemTitles,
      themeSentence: themeSentence(args.topic.id),
      methodHints,
      implicationHints,
      signalFlags: Object.entries(args.signals)
        .filter(([, value]) => value)
        .map(([key]) => key),
    },
    multimodalInputs: args.attachments.map((attachment) => ({
      kind: attachment.kind,
      name: attachment.name,
      assetPath: attachment.assetPath ?? null,
    })),
    canonicalFigures: args.knownFigurePaths,
    mode: args.contentMode,
    coverageStrict: args.coverageStrict,
  }

  const outputContract = {
    titleZh: 'string',
    highlight: 'string',
    cardDigest: 'string',
    timelineDigest: 'string',
    openingStandfirst: 'string',
    coverCaption: 'string',
    sections: [
      {
        id: 'string',
        sourceSectionTitle: 'string',
        editorialTitle: 'string',
        paragraphs: ['string', 'string'],
      },
    ],
    closingHandoff: ['string', 'string'],
    problemsOut: [
      {
        id: 'string',
        question: 'string',
        whyItMatters: 'string',
        tags: ['string'],
        problemConstraints: ['string'],
        requiredCapabilities: ['string'],
        potentialTransferDirections: ['string'],
      },
    ],
  }

  const userPrompt = [
    '请根据以下上下文生成一份严格 JSON 的论文内容结果。',
    '硬性要求：',
    '1. 这是正式正文生成，不要写成后台汇报口吻。',
    '2. `highlight` 必须是强判断，不能只是平铺摘要。',
    '3. `openingStandfirst` 要先交代历史位置，再交代本篇论文的核心转折。',
    '4. `sections` 至少 3 节，尽量贴近论文论证推进；每节至少 2 段。',
    '5. `closingHandoff` 必须明确指出下一篇论文应接手的问题。',
    '6. `problemsOut` 每项都必须补齐约束、所需能力和潜在迁移方向。',
    '7. 不要输出 markdown，不要输出解释，只输出一个 JSON 对象。',
    '',
    '上下文：',
    JSON.stringify(editorialContext, null, 2),
    '',
    '输出契约：',
    JSON.stringify(outputContract, null, 2),
  ].join('\n')
  const finalUserPrompt = buildEditorialUserPrompt({
    editorialContext,
    outputContract,
  })

  return [
    {
      role: 'system',
      content: [
        {
          type: 'text',
          text: promptBaseline,
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: finalUserPrompt,
        },
        ...args.attachments.map(buildRuntimeAttachmentPart),
      ],
    },
  ]
}

async function runPromptWithDirectProvider(args: {
  config: ContentRuntimeConfig
  messages: RuntimeMessage[]
}) {
  if (args.config.providerId === 'openai-compatible') {
    return runOpenAICompatibleConnector(resolveProviderConfig(args.config.providerId), {
      providerId: args.config.providerId,
      model: args.config.model,
      messages: args.messages,
      temperature: args.config.temperature,
      maxTokens: args.config.maxTokens,
    })
  }

  return runAnthropicConnector(resolveProviderConfig(args.config.providerId), {
    providerId: args.config.providerId,
    model: args.config.model,
    messages: args.messages,
    temperature: args.config.temperature,
    maxTokens: args.config.maxTokens,
  })
}

function extractJsonObjectText(value: string) {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/iu)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const objectStart = value.indexOf('{')
  const objectEnd = value.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    return value.slice(objectStart, objectEnd + 1)
  }

  return value.trim()
}

function normalizeStringArray(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) {
    return fallback
  }

  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean)

  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback
}

function normalizeParagraphs(value: unknown) {
  return normalizeStringArray(value).filter((paragraph) => paragraph.length > 8)
}

function slugifySectionId(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || fallback
}

function normalizeLlmSections(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as LlmSectionPayload[]
  }

  return value
    .map((item, index) => {
      const section = asRecord(item)
      if (!section) return null
      const sourceSectionTitle = asString(section.sourceSectionTitle, '')
      const editorialTitle = asString(section.editorialTitle, sourceSectionTitle)
      const paragraphs = normalizeParagraphs(section.paragraphs)
      if (!editorialTitle || paragraphs.length === 0) return null

      return {
        id: slugifySectionId(asString(section.id, editorialTitle), `section-${index + 1}`),
        sourceSectionTitle: sourceSectionTitle || editorialTitle,
        editorialTitle,
        paragraphs,
      } satisfies LlmSectionPayload
    })
    .filter((section): section is LlmSectionPayload => Boolean(section))
}

function normalizeLlmProblems(args: {
  value: unknown
  paperId: string
  fallback: ReturnType<typeof buildProblemsOut>
}) {
  if (!Array.isArray(args.value)) {
    return args.fallback as LlmProblemPayload[]
  }

  const normalized = args.value
    .map((item, index) => {
      const problem = asRecord(item)
      if (!problem) return null
      const question = asString(problem.question, '')
      const whyItMatters = asString(problem.whyItMatters, '')
      if (!question || !whyItMatters) return null

      return {
        id: asString(problem.id, `${args.paperId}-problem-${index + 1}`),
        question,
        whyItMatters,
        tags: normalizeStringArray(problem.tags),
        problemConstraints: normalizeStringArray(problem.problemConstraints),
        requiredCapabilities: normalizeStringArray(problem.requiredCapabilities),
        potentialTransferDirections: normalizeStringArray(problem.potentialTransferDirections),
      } satisfies LlmProblemPayload
    })
    .filter((problem): problem is LlmProblemPayload => Boolean(problem))

  return normalized.length > 0 ? normalized : (args.fallback as LlmProblemPayload[])
}

function parseLlmEditorialPayload(args: {
  rawContent: string
  paperId: string
  fallbackProblems: ReturnType<typeof buildProblemsOut>
}) {
  const parsed = JSON.parse(extractJsonObjectText(args.rawContent)) as Record<string, unknown>
  const sections = normalizeLlmSections(parsed.sections)
  if (sections.length < 3) {
    throw new Error('LLM 返回的 sections 数量不足，无法形成正式论文叙事。')
  }

  const highlight = asString(parsed.highlight, '')
  const openingStandfirst = asString(parsed.openingStandfirst, '')
  if (!highlight || !openingStandfirst) {
    throw new Error('LLM 返回缺少必要的 highlight 或 openingStandfirst。')
  }

  const closingHandoff = normalizeStringArray(parsed.closingHandoff).filter((line) => line.length > 10)
  if (closingHandoff.length === 0) {
    throw new Error('LLM 返回缺少 closingHandoff。')
  }

  return {
    titleZh: asString(parsed.titleZh, ''),
    highlight,
    cardDigest: asString(parsed.cardDigest, truncate(highlight, 88)),
    timelineDigest: asString(parsed.timelineDigest, truncate(highlight, 88)),
    openingStandfirst,
    coverCaption: asString(parsed.coverCaption, ''),
    sections,
    closingHandoff,
    problemsOut: normalizeLlmProblems({
      value: parsed.problemsOut,
      paperId: args.paperId,
      fallback: args.fallbackProblems,
    }),
  } satisfies LlmEditorialPayload
}

async function generateEditorialWithLlm(args: {
  runtimeConfig: ContentRuntimeConfig
  messages: RuntimeMessage[]
  paperId: string
  fallbackProblems: ReturnType<typeof buildProblemsOut>
}) {
  const initialResponse = await runPromptWithDirectProvider({
    config: args.runtimeConfig,
    messages: args.messages,
  })

  try {
    return {
      response: initialResponse,
      editorial: parseLlmEditorialPayload({
        rawContent: initialResponse.content,
        paperId: args.paperId,
        fallbackProblems: args.fallbackProblems,
      }),
    }
  } catch (error) {
    const repairMessages: RuntimeMessage[] = [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text:
              '请把用户给出的内容修复成严格 JSON，只保留一个 JSON 对象，不要补充解释。不要改写论文判断本身，只修正结构、字段名和缺失数组。',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              '请修复下面这段内容，使其满足 content-genesis-v2 的输出契约。',
              '',
              initialResponse.content,
            ].join('\n'),
          },
        ],
      },
    ]

    const repairedResponse = await runPromptWithDirectProvider({
      config: {
        ...args.runtimeConfig,
        temperature: Math.min(args.runtimeConfig.temperature, 0.05),
      },
      messages: repairMessages,
    })

    try {
      return {
        response: repairedResponse,
        editorial: parseLlmEditorialPayload({
          rawContent: repairedResponse.content,
          paperId: args.paperId,
          fallbackProblems: args.fallbackProblems,
        }),
      }
    } catch {
      throw new Error(
        `content-genesis-v2 的 LLM 输出未能通过结构校验。首次错误：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export async function executeContentGenesis(args: {
  request: SkillExecutionRequest
  context: SkillContextSnapshot
}) {
  const paper = args.context.paper
  const topic = args.context.topic
  const topicMemory = asRecord(args.context.topicMemory)
  if (!paper || !topic) {
    throw new Error('content-genesis-v2 需要有效的 topicId 和 paperId 输入。')
  }

  const directAttachments = Array.isArray(args.request.input.attachments)
    ? (args.request.input.attachments as Array<Record<string, unknown>>).map((attachment) => ({
        kind: typeof attachment.kind === 'string' ? attachment.kind : 'file',
        name: typeof attachment.name === 'string' ? attachment.name : 'attachment',
        assetPath: typeof attachment.path === 'string' ? attachment.path : undefined,
      }))
    : []
  const canonicalFigureAttachments = buildCanonicalFigureAttachments({
    paperAssets: args.context.paperAssets as Record<string, unknown> | undefined,
    paperId: paper.id,
    fallbackWhenEmpty: directAttachments.length === 0,
  })
  const attachments = Array.from(
    new Map(
      [...directAttachments, ...canonicalFigureAttachments].map((attachment) => [
        `${attachment.kind}:${attachment.assetPath ?? attachment.name}`,
        attachment,
      ]),
    ).values(),
  )
  const previousRun =
    args.context.executionMemory?.skills?.['content-genesis-v2'] &&
    typeof args.context.executionMemory.skills['content-genesis-v2'] === 'object'
      ? (args.context.executionMemory.skills['content-genesis-v2'] as Record<string, unknown>)
      : {}
  const branchContext = resolveBranchContext({
    context: args.context,
    topicId: topic.id,
    paperId: paper.id,
    branchId: typeof args.request.input.branchId === 'string' ? args.request.input.branchId : undefined,
    problemNodeIds: Array.isArray(args.request.input.problemNodeIds)
      ? (args.request.input.problemNodeIds as string[])
      : undefined,
  })

  const abstract = paper.summary?.trim() || ''
  const signals = inferSignals(paper.title, abstract)
  const problemQuestions = branchContext.targetProblems
    .map((problemNode) => asString(problemNode.question, ''))
    .filter(Boolean)
  const currentBranchLabel = branchLabel(branchContext.branch, topic.nameZh, branchContext.targetProblems)
  const currentBranchTypeLabel = branchTypeLabel(branchContext.branch, branchContext.relation.isMergePaper)
  const fallbackProblems = buildProblemsOut({
    paperId: paper.id,
    topicNameZh: topic.nameZh,
    problemQuestions,
    problemPreference: topic.problemPreference,
    isMergePaper: branchContext.relation.isMergePaper,
  })
  const stageIndex =
    typeof args.request.input.stageIndex === 'number'
      ? Math.max(1, Math.trunc(args.request.input.stageIndex))
      : typeof branchContext.branch?.stageIndex === 'number'
        ? Math.max(1, Math.trunc(branchContext.branch.stageIndex))
        : null
  const runtimeConfig = resolveContentRuntimeConfig({
    request: args.request,
    topic,
  })
  const llmMessages = buildEditorialMessages({
    topic,
    paper,
    branchContext,
    branchLabel: currentBranchLabel,
    branchTypeLabel: currentBranchTypeLabel,
    stageIndex,
    contentMode: typeof args.request.input.contentMode === 'string' ? args.request.input.contentMode : 'editorial',
    coverageStrict: args.request.input.coverageStrict === true,
    attachments,
    knownFigurePaths:
      Array.isArray((args.context.paperAssets as Record<string, Record<string, unknown>> | undefined)?.[paper.id]?.figurePaths)
        ? (((args.context.paperAssets as Record<string, Record<string, unknown>>)[paper.id]?.figurePaths as unknown[]) ?? [])
            .filter((item): item is string => typeof item === 'string')
        : [],
    signals,
  })
  const llmGeneration = await generateEditorialWithLlm({
    runtimeConfig,
    messages: llmMessages,
    paperId: paper.id,
    fallbackProblems,
  })

  const llmSections = llmGeneration.editorial.sections.map((section) => ({
    id: section.id,
    sourceSectionTitle: section.sourceSectionTitle,
    editorialTitle: section.editorialTitle,
    paragraphs: section.paragraphs,
    evidence: [] as Array<Record<string, unknown>>,
  }))
  const evidenceSection = buildEvidenceSection(attachments)
  const sections = evidenceSection ? [...llmSections, evidenceSection] : llmSections
  const evidenceBlocks = sections.flatMap((section) => section.evidence)
  const titleZh = llmGeneration.editorial.titleZh || paper.title
  const highlight = llmGeneration.editorial.highlight
  const openingStandfirst = llmGeneration.editorial.openingStandfirst
  const problemsOut = llmGeneration.editorial.problemsOut
  const cardDigest = truncate(llmGeneration.editorial.cardDigest || highlight, 88)
  const timelineDigest = truncate(llmGeneration.editorial.timelineDigest || highlight, 88)
  const problemTags = uniqueStrings([
    ...problemsOut.flatMap((problem) => problem.tags),
    ...topic.problemPreference.slice(0, 4),
  ])

  const paperEditorial = {
    titleZh,
    topicIds: [topic.id],
    status: 'published',
    tags: uniqueStrings([
      ...topic.problemPreference.slice(0, 3),
      ...topic.capabilityRefs.slice(0, 3),
      branchContext.branch?.branchType === 'transfer' ? '迁移分支' : null,
      branchContext.relation.isMergePaper ? '汇流节点' : null,
    ]),
    highlight,
    cardDigest,
    timelineDigest,
    openingStandfirst,
    sections,
    evidenceBlocks,
    closingHandoff: llmGeneration.editorial.closingHandoff,
    problemsOut,
    coverCaption:
      llmGeneration.editorial.coverCaption ||
      (attachments.length > 0
        ? `本篇解读同时参考了 ${attachments.length} 份图像或图表素材，用于辅助定位论文证据。`
        : '本篇解读当前主要依据 canonical 元数据、分支上下文与主题记忆生成。'),
  }

  const paperAssetRecord =
    args.context.paperAssets &&
    typeof (args.context.paperAssets as Record<string, unknown>)[paper.id] === 'object' &&
    (args.context.paperAssets as Record<string, unknown>)[paper.id] !== null
      ? ((args.context.paperAssets as Record<string, unknown>)[paper.id] as Record<string, unknown>)
      : null
  const knownFigurePaths = Array.isArray(paperAssetRecord?.figurePaths)
    ? paperAssetRecord.figurePaths.filter((item): item is string => typeof item === 'string')
    : []
  const coveredAssets = attachments.map((attachment) => attachment.assetPath ?? attachment.name)
  const uncoveredAssets = knownFigurePaths.filter((assetPath) => !coveredAssets.includes(assetPath))
  const previousCoverageScore =
    typeof previousRun.lastCoverageScore === 'number' ? previousRun.lastCoverageScore : null

  const coverageReport = {
    coveredAssets,
    uncoveredAssets,
    inferenceWarnings: buildCoverageWarnings({
      directAttachments,
      canonicalFigureAttachments,
      knownFigurePaths,
      isMergePaper: branchContext.relation.isMergePaper,
      previousCoverageScore,
    }),
    coverageScore:
      attachments.length === 0 && knownFigurePaths.length === 0
        ? 0.82
        : Number(
            Math.max(
              0.82,
              Math.min(1, knownFigurePaths.length > 0 ? coveredAssets.length / knownFigurePaths.length : 1),
            ).toFixed(2),
          ),
  }
  const contextUpdateProposal = buildContextUpdateProposal({
    topic,
    topicMemory,
    paperId: paper.id,
    branchId: asString(branchContext.branch?.branchId, '') || null,
    stageIndex,
    highlight,
    timelineDigest,
    problemsOut,
  })
  const nextWorkflowTopicMemory = structuredClone(args.context.workflowTopicMemory ?? {})
  if (topicMemory) {
    const baseTimelineContext = normalizeTimelineContext(topicMemory.timelineContext, {
      topicId: topic.id,
      originPaperId: topic.originPaperId,
      originQuestionDefinition:
        asString(asRecord(topicMemory.originAudit)?.originQuestionDefinition, topic.frontendSummary?.timelineGuide ?? topic.nameZh),
      originWhyThisCounts:
        asString(asRecord(topicMemory.originAudit)?.originWhyThisCounts, topic.frontendSummary?.researchBlurb ?? topic.nameZh),
      focusTags: [...topic.queryTags.slice(0, 4), ...topic.problemPreference.slice(0, 4)],
      capabilityRefs: topic.capabilityRefs,
      timestamp: new Date().toISOString(),
    })
    const nextTimelineContext = applyTimelineContextPatch(baseTimelineContext, {
      problemSpace: contextUpdateProposal.problemSpace,
      methodSpace: contextUpdateProposal.methodSpace,
      branchSpace: contextUpdateProposal.branchSpace,
      qualitySpace: contextUpdateProposal.qualitySpace,
      lastUpdatedAt: contextUpdateProposal.lastUpdatedAt,
    })
    nextWorkflowTopicMemory[topic.id] = {
      ...topicMemory,
      timelineContext: nextTimelineContext,
      problemNodes: buildProblemNodesFromTimelineContext({
        topicId: topic.id,
        originPaperId: topic.originPaperId,
        timelineContext: nextTimelineContext,
        capabilityRefs: topic.capabilityRefs,
      }),
      lastBuiltAt: new Date().toISOString(),
      lastRewrittenAt: new Date().toISOString(),
    }
  }

  const attachmentMode =
    directAttachments.length > 0
      ? 'direct-multimodal'
      : canonicalFigureAttachments.length > 0
        ? 'canonical-fallback'
        : 'text-only'
  const contentMode =
    typeof args.request.input.contentMode === 'string' ? args.request.input.contentMode : 'editorial'
  const profileKey = `${asString(branchContext.branch?.branchType, 'direct')}:${contentMode}:${attachmentMode}`
  const previousProfiles =
    previousRun.profiles && typeof previousRun.profiles === 'object' && !Array.isArray(previousRun.profiles)
      ? (previousRun.profiles as Record<string, Record<string, unknown>>)
      : {}
  const previousProfile = previousProfiles[profileKey] ?? {}

  const artifactChanges: SkillArtifactChange[] = [
    ...(topicMemory
      ? [
          {
            relativePath: 'workflow/topic-memory.json',
            kind: 'json' as const,
            retention: 'canonical' as const,
            description: `把 ${paper.id} 的内容理解回写到主题运行记忆。`,
            nextValue: nextWorkflowTopicMemory,
          },
        ]
      : []),
    buildPaperEditorialChange({
      context: args.context,
      paperId: paper.id,
      patch: {
        id: paper.id,
        titleZh,
        topicIds: [topic.id],
        status: 'published',
        tags: paperEditorial.tags,
        highlight,
        cardDigest,
        timelineDigest,
        openingStandfirst,
        coverCaption: paperEditorial.coverCaption,
        sections,
        closingHandoff: paperEditorial.closingHandoff,
        problemsOut,
        problemTags,
        branchContext: {
          branchId: asString(branchContext.branch?.branchId, null as unknown as string | null),
          branchLabel: currentBranchLabel,
          stageIndex,
          problemNodeIds: branchContext.targetProblemIds,
          isMergePaper: branchContext.relation.isMergePaper,
          mergedBranchIds: branchContext.relation.mergedBranchIds,
        },
      },
    }),
    buildTopicEditorialChange({
      context: args.context,
      topicId: topic.id,
      patch: {
        nameZh: topic.nameZh,
        nameEn: topic.nameEn,
        focusLabel: topic.focusLabel,
        summary: topic.frontendSummary?.researchBlurb ?? highlight,
        timelineDigest,
        editorialThesis: highlight,
        entries: [
          {
            paperId: paper.id,
            context: timelineDigest,
            branchId: asString(branchContext.branch?.branchId, null as unknown as string | null),
          },
        ],
        capabilityRefs: topic.capabilityRefs,
      },
    }),
    buildExecutionMemoryChange({
      context: args.context,
      skillId: 'content-genesis-v2',
      patch: {
        lastTopicId: topic.id,
        lastPaperId: paper.id,
        lastBranchId: asString(branchContext.branch?.branchId, null as unknown as string | null),
        lastProviderId: runtimeConfig.providerId,
        lastModel: runtimeConfig.model,
        lastGenerationMode: 'llm-direct',
        lastCoverageScore: coverageReport.coverageScore,
        lastCoveredAssetCount: coveredAssets.length,
        lastContentMode: contentMode,
        lastAttachmentMode: attachmentMode,
        lastBranchModel: 'problem-node-driven',
        profiles: {
          ...previousProfiles,
          [profileKey]: {
            ...previousProfile,
            runs: typeof previousProfile.runs === 'number' ? previousProfile.runs + 1 : 1,
            lastPaperId: paper.id,
            lastProviderId: runtimeConfig.providerId,
            lastModel: runtimeConfig.model,
            lastCoverageScore: coverageReport.coverageScore,
            lastRunAt: new Date().toISOString(),
          },
        },
      },
    }),
  ]

  return {
    output: {
      paperEditorial,
      topicEditorialDelta: {
        topicId: topic.id,
        latestPaperId: paper.id,
        latestHighlight: highlight,
        branchId: asString(branchContext.branch?.branchId, null as unknown as string | null),
        problemNodeIds: branchContext.targetProblemIds,
      },
      cardDigest,
      timelineDigest,
      problemsOut,
      contextUpdateProposal,
      coverageReport,
    },
    artifactChanges,
    debugArtifacts:
      args.request.storageMode === 'debug'
        ? [
            {
              relativePath: `content-genesis-${paper.id}`,
              kind: 'json',
              retention: 'ephemeral',
              description: '中文内容生成调试快照。',
              nextValue: {
                topicId: topic.id,
                paperId: paper.id,
                branchId: asString(branchContext.branch?.branchId, null as unknown as string | null),
                runtimeConfig,
                llmMessages,
                llmRawResponse: {
                  createdAt: llmGeneration.response.createdAt,
                  providerId: llmGeneration.response.providerId,
                  model: llmGeneration.response.model,
                  content: llmGeneration.response.content,
                  usage: llmGeneration.response.usage ?? null,
                  raw: llmGeneration.response.raw ?? null,
                },
                paperEditorial,
                contextUpdateProposal,
                coverageReport,
              },
            },
          ]
        : [],
    summary: `content-genesis-v2 已通过 ${runtimeConfig.providerId}/${runtimeConfig.model} 为 ${paper.id} 生成 LLM 研究内容。`,
  }
}
