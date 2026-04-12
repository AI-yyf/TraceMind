/**
 * Enhanced task scheduler.
 * Supports iterative stage-based research automation with per-stage round controls.
 */

import cron, { ScheduledTask } from 'node-cron'

import { prisma } from '../lib/prisma'
import type { ResearchMode, TaskConfig, TaskResult } from './scheduler'
import { runStructuredGenerationPass } from './generation/orchestrator'
import { getGenerationRuntimeConfig, PROMPT_TEMPLATE_IDS } from './generation/prompt-registry'
import { refreshTopicViewModelSnapshot } from './topics/alpha-topic'
import { orchestrateTopicReaderArtifacts, warmTopicReaderArtifacts } from './topics/alpha-reader'
import { syncConfiguredTopicWorkflowSnapshot } from './topics/topic-config-sync'
import {
  loadResearchPipelineState,
  type ResearchPipelineDurationDecision,
} from './topics/research-pipeline'
import {
  DEFAULT_RESEARCH_STATUS_ISSUE_SUMMARY,
  loadTopicResearchReport,
  reportContainsOperationalNarrative,
  saveTopicResearchReport,
  sanitizeResearchFacingSummary,
  type ResearchRunReport,
} from './topics/research-report'
import {
  recordTopicGuidanceApplication,
  recordTopicResearchCycle,
  recordTopicResearchStatus,
} from './topics/topic-session-memory'
import {
  compactTopicGuidanceContext,
  loadTopicGuidanceLedger,
  recordTopicGuidanceDirectiveApplication,
  type TopicGuidanceDirective,
  type TopicGuidanceDirectiveStatus,
  type TopicGuidanceLatestApplication,
} from './topics/topic-guidance-ledger'
import { collectTopicCognitiveMemory } from './topics/topic-cognitive-memory'
import { loadTopicStageConfig } from './topics/topic-stage-config'

type RuntimeSkillContext = {
  sessionId: string
  workspacePath: string
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
    error: (message: string, meta?: Record<string, unknown>) => void
    debug: (message: string, meta?: Record<string, unknown>) => void
  }
}

export interface StageTaskProgress {
  taskId: string
  topicId: string
  topicName: string
  researchMode: ResearchMode
  durationHours: number | null
  currentStage: number
  totalStages: number
  stageProgress: number
  currentStageRuns: number
  currentStageTargetRuns: number
  stageRunMap: Record<string, number>
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  lastRunAt: string | null
  lastRunResult: 'success' | 'failed' | 'partial' | null
  discoveredPapers: number
  admittedPapers: number
  generatedContents: number
  startedAt: string | null
  deadlineAt: string | null
  completedAt: string | null
  activeSessionId: string | null
  completedStageCycles: number
  currentStageStalls: number
  latestSummary: string | null
  status: 'active' | 'paused' | 'completed' | 'failed'
}

export interface TaskExecutionRecord {
  id: string
  taskId: string
  runAt: string
  duration: number
  status: 'success' | 'failed' | 'partial'
  stageIndex: number
  papersDiscovered: number
  papersAdmitted: number
  contentsGenerated: number
  sessionId?: string
  error?: string
  summary: string
}

interface ResearchCandidatePaper {
  id: string
  title: string
  titleZh: string
  titleEn: string | null
  summary: string
  explanation: string | null
  coverPath: string | null
  figures: Array<{
    id: string
    imagePath: string
    caption: string
    analysis?: string | null
  }>
}

interface ResearchNodeAction {
  action: 'create' | 'update' | 'merge' | 'strengthen'
  nodeId?: string
  mergeIntoNodeId?: string
  title: string
  titleEn: string
  subtitle: string
  summary: string
  explanation: string
  paperIds: string[]
  primaryPaperId: string
  rationale: string
}

interface ResearchOrchestrationOutput {
  stageTitle: string
  stageTitleEn: string
  stageSummary: string
  shouldAdvanceStage: boolean
  rationale: string
  nodeActions: ResearchNodeAction[]
  openQuestions: string[]
}

type SchedulerRunSource = 'manual' | 'scheduled'

type EnhancedTaskResult = TaskResult & { progress?: StageTaskProgress }

type DiscoverCycleResult = {
  discovered: number
  admitted: number
  contentsGenerated: number
  shouldAdvanceStage: boolean
  stageSummary: string
  openQuestions: string[]
  nodeActions: ResearchNodeAction[]
  admittedPaperIds: string[]
  affectedNodeIds: string[]
  guidanceApplicationSummary: string | null
  durationDecision?: ResearchPipelineDurationDecision | null
}

type DurationSessionHandle = {
  sessionId: string
  source: SchedulerRunSource
  startedAt: string
  deadlineAt: string
  promise: Promise<void>
}

type ManagedScheduledTask = {
  start: () => void
  stop: () => void
  destroy: () => void
}

type DurationResearchStrategy = {
  cycleDelayMs: number
  stageStallLimit: number
  reportPasses: number
}

type DeferredPromiseHandlers = {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

const DEFAULT_DURATION_HOURS = 4
const MIN_DURATION_HOURS = 1
const MAX_DURATION_HOURS = 48
const MIN_RESEARCH_CYCLE_DELAY_MS = 1000
const MAX_RESEARCH_CYCLE_DELAY_MS = 30 * 60 * 1000
const MANUAL_TOPIC_TASK_CRON = '0 3 * * *'
const BACKGROUND_DURATION_RUNS_DISABLED =
  process.env.SCHEDULER_DISABLE_BACKGROUND_RUNS === '1' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  process.env.NODE_TEST_CONTEXT === 'child-v8' ||
  process.env.NODE_ENV === 'test'

function createDormantDurationSessionPromise() {
  return new Promise<void>(() => {})
}

function createDeferredPromise(): DeferredPromiseHandlers {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

function createManagedScheduledTask(config: TaskConfig, run: () => Promise<void>): ManagedScheduledTask {
  if (BACKGROUND_DURATION_RUNS_DISABLED) {
    return {
      start() {
        return
      },
      stop() {
        return
      },
      destroy() {
        return
      },
    }

    /*
    const resolvedTitle = existingNode
      ? pickText(existingNode.nodeLabel, fallbackTitleZh, fallbackTitleEn)
      : useEnglish
        ? fallbackTitleEn
        : fallbackTitleZh
    const resolvedTitleEn = existingNode
      ? pickText(existingNode.nodeSubtitle, existingNode.nodeLabel, fallbackTitleEn, fallbackTitleZh)
      : fallbackTitleEn
    const resolvedSubtitle = existingNode
      ? pickText(existingNode.nodeSubtitle, resolvedTitleEn, resolvedTitle)
      : useEnglish
        ? `${cluster.papers.length} stage-bounded paper${cluster.papers.length === 1 ? '' : 's'} on ${problemLabelEn}`
        : `${cluster.papers.length} 篇处于同一阶段窗口的论文，围绕${problemLabelZh}展开`
    const resolvedSummary = isSinglePaper
      ? useEnglish
        ? `Within ${stageTitleEn}, this node keeps ${pickText(primaryPaper.titleEn, primaryPaper.title)} as a disciplined entry point for ${problemLabelEn} instead of pretending that one paper already forms a stable consensus.`
        : `在 ${stageTitle} 这一时间窗口里，这个节点先把《${pickText(primaryPaper.titleZh, primaryPaper.title)}》作为“${problemLabelZh}”的问题入口保留下来，而不是把单篇论文包装成已经稳定的共识。`
      : useEnglish
        ? `This node groups ${cluster.papers.length} stage-bounded papers around ${problemLabelEn}, so the topic map shows one problem line and its evidence handoff instead of isolated paper cards.`
        : `这个节点把 ${cluster.papers.length} 篇处于同一阶段窗口的论文组织成“${problemLabelZh}”这一条问题线，让主题页看到的是问题演进与证据接力，而不是零散的论文卡片。`
    const resolvedExplanation = isSinglePaper
      ? useEnglish
        ? `The anchor paper is ${pickText(primaryPaper.titleEn, primaryPaper.title)}. Keeping it as a narrow node is intentional: later cycles should either find corroborating papers inside the same problem family or leave it as a bounded deep-reading stop with explicit limits.`
        : `当前锚点论文是《${pickText(primaryPaper.titleZh, primaryPaper.title)}》。之所以先把它保留为一个窄节点，是为了让后续轮次继续在同一问题族里补充互证论文；如果补不出来，就明确承认它只是一个边界清晰的深读入口。`
      : useEnglish
        ? `The anchor paper is ${pickText(primaryPaper.titleEn, primaryPaper.title)}. These papers were grouped together because they appear to push the same problem family inside the same stage window, and later cycles should keep checking whether their task framing, evaluation protocol, and closed-loop evidence truly support one another.`
        : `当前锚点论文是《${pickText(primaryPaper.titleZh, primaryPaper.title)}》。把这些论文放进同一个节点，不是因为它们共享几个关键词，而是因为它们在同一阶段窗口里推进的是同一类问题；后续轮次还要继续核对它们的任务定义、评测协议和闭环证据是否真的彼此支撑。`
    const resolvedRationale = existingNode
      ? useEnglish
        ? `The newly admitted papers strengthen the existing ${problemLabelEn} node and make its stage-bounded evidence base thicker.`
        : `新纳入论文更适合继续补强已有的“${problemLabelZh}”节点，让这一阶段窗口内的证据底座更厚。`
      : isSinglePaper
        ? useEnglish
          ? `Create a narrow problem node first, then decide in later cycles whether it deserves corroborating papers or should remain a bounded deep-reading stop.`
          : '先建立一个窄而克制的问题节点，再在后续轮次判断它是否值得补强成跨论文节点，还是保留为边界清晰的深读入口。'
        : useEnglish
          ? `Create one problem-focused multi-paper node so the topic page already shows a real research line instead of one paper per card.`
          : '先建立一个面向问题的多论文节点，让主题页直接呈现真实研究线，而不是一张卡只对应一篇论文。'

    return {
      start() {
        return
      },
      stop() {
        return
      },
      destroy() {
        return
      },
    }
    */
  }

  let scheduledTask: ScheduledTask | null = null

  const ensureScheduledTask = () => {
    if (!scheduledTask) {
      scheduledTask = cron.schedule(
        config.cronExpression,
        async () => {
          if (!config.enabled) return
          await run()
        },
        {
          scheduled: false,
          timezone: 'Asia/Shanghai',
        },
      )
    }

    return scheduledTask
  }

  if (config.enabled) {
    ensureScheduledTask().start()
  }

  return {
    start() {
      ensureScheduledTask().start()
    },
    stop() {
      scheduledTask?.stop()
    },
    destroy() {
      if (scheduledTask) {
        scheduledTask.stop()
        if ('destroy' in scheduledTask && typeof scheduledTask.destroy === 'function') {
          scheduledTask.destroy()
        }
        scheduledTask = null
      }
    },
  }
}

function hasRenderableResearchReport(report: ResearchRunReport | null | undefined) {
  if (!report) return false

  return Boolean(
    report.headline?.trim() &&
      report.dek?.trim() &&
      report.summary?.trim() &&
      Array.isArray(report.paragraphs) &&
      report.paragraphs.some((paragraph) => typeof paragraph === 'string' && Boolean(paragraph.trim())),
  )
}

function shouldPreferFallbackResearchReportState(args: {
  progress: StageTaskProgress | null
  report: ResearchRunReport | null
  active: boolean
  fallback?: ResearchRunReport | null
}) {
  const { progress, report, active, fallback } = args

  if (!progress) return false
  if (!report) return true
  if (!hasRenderableResearchReport(report)) return true

  const zeroYieldFailure =
    report.failedRuns > 0 &&
    report.successfulRuns === 0 &&
    report.discoveredPapers === 0 &&
    report.admittedPapers === 0 &&
    report.generatedContents === 0
  if (fallback && zeroYieldFailure && reportContainsOperationalNarrative(report)) {
    return true
  }

  if (fallback) {
    if (report.status !== fallback.status) return true
    if (report.taskId !== progress.taskId) return true
    if (report.topicId !== progress.topicId) return true
    if (report.researchMode !== progress.researchMode) return true
    if (report.currentStage !== progress.currentStage) return true
    if (report.totalStages !== progress.totalStages) return true
  }

  if (active && report.status !== 'running') {
    return true
  }

  if (
    active &&
    progress.activeSessionId &&
    report.reportId !== progress.activeSessionId
  ) {
    return true
  }

  if (progress.totalRuns > report.totalRuns) return true
  if (progress.successfulRuns > report.successfulRuns) return true
  if (progress.failedRuns > report.failedRuns) return true
  if (progress.discoveredPapers > report.discoveredPapers) return true
  if (progress.admittedPapers > report.admittedPapers) return true
  if (progress.generatedContents > report.generatedContents) return true

  if (
    progress.latestSummary &&
    progress.latestSummary.trim() &&
    progress.latestSummary !== report.latestStageSummary
  ) {
    return true
  }

  return false
}

function clipText(value: string | null | undefined, maxLength = 220) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function sanitizeResearchProgress(progress: StageTaskProgress | null | undefined) {
  if (!progress) return progress ?? null

  const latestSummary = sanitizeResearchFacingSummary(progress.latestSummary)
  if (latestSummary === (progress.latestSummary ?? '')) {
    return progress
  }

  return {
    ...progress,
    latestSummary: latestSummary || null,
  }
}

function pickText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim()
    if (normalized) return normalized
  }
  return ''
}

function uniqueStrings(
  values: Array<string | null | undefined>,
  limit = 6,
  maxLength = 180,
) {
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

const HEURISTIC_RESEARCH_STOPWORDS = new Set([
  'about',
  'analysis',
  'approach',
  'baseline',
  'benchmarks',
  'comparison',
  'control',
  'data',
  'dataset',
  'datasets',
  'driven',
  'framework',
  'future',
  'learning',
  'method',
  'methods',
  'model',
  'models',
  'paper',
  'papers',
  'performance',
  'problem',
  'research',
  'results',
  'study',
  'studies',
  'system',
  'systems',
  'task',
  'tasks',
  'using',
  'world',
  'works',
  '自动驾驶',
  '研究',
  '方法',
  '模型',
  '系统',
  '论文',
  '结果',
  '问题',
  '机制',
  '证据',
  '阶段',
])

type HeuristicPaperSignal = {
  paper: ResearchCandidatePaper
  orderedTokens: string[]
  titleTokenSet: Set<string>
  weights: Map<string, number>
}

type HeuristicPaperCluster = {
  key: string
  themeToken: string | null
  papers: ResearchCandidatePaper[]
  signals: HeuristicPaperSignal[]
  labelZh?: string
  labelEn?: string
  priority?: number
}

type TopicSpecificClusterFamily = {
  key: string
  titleZh: string
  titleEn: string
  priority: number
}

const AUTONOMOUS_DRIVING_CLUSTER_FAMILIES: TopicSpecificClusterFamily[] = [
  {
    key: 'scaled-end-to-end-driving',
    titleZh: '规模化端到端驾驶建模',
    titleEn: 'Scaled End-to-End Driving Models',
    priority: 1,
  },
  {
    key: 'recovery-and-sim-transfer',
    titleZh: '恢复策略与仿真迁移',
    titleEn: 'Recovery Policies and Simulation Transfer',
    priority: 2,
  },
  {
    key: 'attention-and-interpretability',
    titleZh: '注意力、认知图与可解释驾驶',
    titleEn: 'Attention, Cognitive Maps, and Interpretable Driving',
    priority: 3,
  },
  {
    key: 'event-based-driving',
    titleZh: '事件相机与神经形态驾驶',
    titleEn: 'Event-based and Neuromorphic Driving',
    priority: 4,
  },
  {
    key: 'world-model-and-planning',
    titleZh: '世界模型与闭环规划',
    titleEn: 'World Models and Closed-Loop Planning',
    priority: 5,
  },
  {
    key: 'language-conditioned-driving',
    titleZh: '语言条件驾驶与 VLA',
    titleEn: 'Language-Conditioned Driving and VLA',
    priority: 6,
  },
  {
    key: 'general-driving-control',
    titleZh: '端到端驾驶控制探索',
    titleEn: 'Exploratory End-to-End Driving Control',
    priority: 7,
  },
]

function splitAsciiResearchToken(token: string) {
  return token
    .split(/[-_/]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
}

function tokenizeResearchText(value: string | null | undefined) {
  const source = (value ?? '').trim()
  if (!source) return []

  const asciiTokens = Array.from(source.toLowerCase().matchAll(/[a-z][a-z0-9-]{2,}/gu))
    .flatMap((match) => splitAsciiResearchToken(match[0]))
    .filter((token) => token.length >= 3 && !HEURISTIC_RESEARCH_STOPWORDS.has(token))

  const cjkTokens = Array.from(source.matchAll(/[\u4e00-\u9fff]{2,}/gu))
    .map((match) => match[0].trim())
    .filter(
      (token) =>
        token.length >= 2 &&
        token.length <= 12 &&
        !HEURISTIC_RESEARCH_STOPWORDS.has(token),
    )

  return uniqueStrings([...asciiTokens, ...cjkTokens], 20, 48)
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatHeuristicThemeLabel(tokens: string[], fallback: string) {
  const normalizedTokens = uniqueStrings(tokens, 2, 36)
  if (normalizedTokens.length === 0) {
    return clipText(fallback, 56)
  }

  return clipText(
    normalizedTokens
      .map((token) => (/^[a-z0-9-]+$/u.test(token) ? toTitleCase(token.replace(/-/gu, ' ')) : token))
      .join(' / '),
    56,
  )
}

function buildHeuristicPaperSignal(paper: ResearchCandidatePaper): HeuristicPaperSignal {
  const titleTokens = tokenizeResearchText(
    [paper.titleZh, paper.titleEn, paper.title].filter(Boolean).join(' '),
  )
  const narrativeTokens = tokenizeResearchText(
    [paper.summary, paper.explanation].filter(Boolean).join(' '),
  )
  const weights = new Map<string, number>()

  const addWeight = (token: string, weight: number) => {
    weights.set(token, (weights.get(token) ?? 0) + weight)
  }

  titleTokens.forEach((token) => addWeight(token, 3))
  narrativeTokens.forEach((token) => addWeight(token, 1))

  const orderedTokens = [...weights.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      if (right[0].length !== left[0].length) return right[0].length - left[0].length
      return left[0].localeCompare(right[0])
    })
    .map(([token]) => token)

  return {
    paper,
    orderedTokens,
    titleTokenSet: new Set(titleTokens),
    weights,
  }
}

function paperHeuristicText(paper: ResearchCandidatePaper) {
  return [
    paper.titleZh,
    paper.titleEn,
    paper.title,
    paper.summary,
    paper.explanation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function classifyAutonomousDrivingClusterFamily(
  paper: ResearchCandidatePaper,
): TopicSpecificClusterFamily | null {
  const text = paperHeuristicText(paper)

  if (/\blanguage-conditioned\b|\bvision[- ]language[- ]action\b|\bvla\b|\binstruction(?:-conditioned)?\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'language-conditioned-driving') ?? null
  }

  if (/\bworld model\b|\bworld models\b|\boccupancy\b|\blatent dynamics\b|\bscene token\b|\bclosed-loop planning\b|\bclosed loop planning\b|\bclosed-loop simulation\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'world-model-and-planning') ?? null
  }

  if (/\bevent camera\b|\bdavis\b|\bdvs\b|\bspiking neural\b|\bneuromorphic\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'event-based-driving') ?? null
  }

  if (/\bvirtual to real\b|\bsim[- ]to[- ]real\b|\breinforcement learning\b|\bquery-efficient\b|\bdagger\b|\bsafedagger\b|\bimitation learning\b|\bbehavior cloning\b|\bbehaviour cloning\b|\brecovery policy\b|\brecovery\b|\bintervention\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'recovery-and-sim-transfer') ?? null
  }

  if (/\battention\b|\bcausal attention\b|\bvisual explanation\b|\binterpretable\b|\bcognitive map\b|\bbrain inspired\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'attention-and-interpretability') ?? null
  }

  if (/\blarge-scale video\b|\bcrowd-sourced\b|\begomotion\b|\bvehicle motion model\b|\bfcn-lstm\b|\bsegmentation side task\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'scaled-end-to-end-driving') ?? null
  }

  if (/\bend[- ]to[- ]end\b|\bdirect perception\b|\bcamera to steering\b/u.test(text)) {
    return AUTONOMOUS_DRIVING_CLUSTER_FAMILIES.find((family) => family.key === 'general-driving-control') ?? null
  }

  return null
}

function buildTopicSpecificPaperClusters(args: {
  topic: any
  papers: ResearchCandidatePaper[]
  signals: HeuristicPaperSignal[]
}) {
  if (args.topic?.id !== 'autonomous-driving') return null

  const signalByPaperId = new Map(args.signals.map((signal) => [signal.paper.id, signal] as const))
  const grouped = new Map<string, HeuristicPaperCluster>()

  for (const paper of args.papers) {
    const family = classifyAutonomousDrivingClusterFamily(paper)
    const key = family?.key ?? `paper:${paper.id}`
    const cluster = grouped.get(key) ?? {
      key,
      themeToken: family?.key ?? null,
      papers: [],
      signals: [],
      labelZh: family?.titleZh,
      labelEn: family?.titleEn,
      priority: family?.priority ?? 999,
    }

    cluster.papers.push(paper)
    cluster.signals.push(signalByPaperId.get(paper.id) ?? buildHeuristicPaperSignal(paper))
    grouped.set(key, cluster)
  }

  return [...grouped.values()].sort((left, right) => {
    const leftPriority = left.priority ?? 999
    const rightPriority = right.priority ?? 999
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    if (right.papers.length !== left.papers.length) return right.papers.length - left.papers.length
    return pickText(left.papers[0]?.titleZh, left.papers[0]?.title).localeCompare(
      pickText(right.papers[0]?.titleZh, right.papers[0]?.title),
    )
  })
}

function buildHeuristicPaperClusters(args: {
  topic: any
  papers: ResearchCandidatePaper[]
}) {
  const signals = args.papers.map((paper) => buildHeuristicPaperSignal(paper))
  const topicSpecific = buildTopicSpecificPaperClusters({
    topic: args.topic,
    papers: args.papers,
    signals,
  })

  if (topicSpecific && topicSpecific.length > 0) {
    return topicSpecific
  }

  const globalTokenFrequency = new Map<string, number>()

  signals.forEach((signal) => {
    new Set(signal.orderedTokens.slice(0, 8)).forEach((token) => {
      globalTokenFrequency.set(token, (globalTokenFrequency.get(token) ?? 0) + 1)
    })
  })

  const grouped = new Map<string, HeuristicPaperCluster>()

  signals.forEach((signal) => {
    const rankedSharedToken = signal.orderedTokens
      .filter((token) => (globalTokenFrequency.get(token) ?? 0) >= 2)
      .sort((left, right) => {
        const leftScore = (signal.weights.get(left) ?? 0) * (globalTokenFrequency.get(left) ?? 0)
        const rightScore =
          (signal.weights.get(right) ?? 0) * (globalTokenFrequency.get(right) ?? 0)
        if (rightScore !== leftScore) return rightScore - leftScore
        return right.length - left.length
      })[0]

    const key = rankedSharedToken ?? `paper:${signal.paper.id}`
    const cluster = grouped.get(key) ?? {
      key,
      themeToken: rankedSharedToken ?? null,
      papers: [],
      signals: [],
    }

    cluster.papers.push(signal.paper)
    cluster.signals.push(signal)
    grouped.set(key, cluster)
  })

  return [...grouped.values()].sort((left, right) => {
    if (right.papers.length !== left.papers.length) {
      return right.papers.length - left.papers.length
    }
    return pickText(left.papers[0]?.titleZh, left.papers[0]?.title).localeCompare(
      pickText(right.papers[0]?.titleZh, right.papers[0]?.title),
    )
  })
}

function buildClusterThemeTokens(cluster: HeuristicPaperCluster) {
  const frequency = new Map<string, number>()

  cluster.signals.forEach((signal) => {
    new Set(signal.orderedTokens.slice(0, 6)).forEach((token) => {
      frequency.set(token, (frequency.get(token) ?? 0) + 1)
    })
  })

  return [...frequency.entries()]
    .filter(([, count]) => count >= Math.max(2, Math.ceil(cluster.signals.length / 2)))
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1]
      return right[0].length - left[0].length
    })
    .map(([token]) => token)
}

function pickPrimaryPaperForCluster(cluster: HeuristicPaperCluster) {
  return [...cluster.papers].sort((left, right) => {
    const figureDelta = right.figures.length - left.figures.length
    if (figureDelta !== 0) return figureDelta
    const leftTitle = pickText(left.titleZh, left.titleEn, left.title)
    const rightTitle = pickText(right.titleZh, right.titleEn, right.title)
    return leftTitle.localeCompare(rightTitle)
  })[0]
}

function collectExistingNodePaperIds(node: any): string[] {
  return Array.from(
    new Set(
      (Array.isArray(node?.papers) ? node.papers : [])
        .map((entry: any) => entry.paperId ?? entry.paper?.id)
        .filter((paperId: unknown): paperId is string => typeof paperId === 'string' && paperId.trim().length > 0),
    ),
  )
}

function assignExistingNodesToClusters(existingNodes: any[], clusters: HeuristicPaperCluster[]) {
  const remaining = new Map(
    existingNodes.map((node) => [String(node.id ?? node.nodeId ?? ''), node] as const).filter(([key]) => Boolean(key)),
  )

  return clusters.map((cluster) => {
    const clusterPaperIds = new Set(cluster.papers.map((paper) => paper.id))
    let bestNode: any | null = null
    let bestScore = 0
    let bestCoverageScore = 0
    let bestRetentionScore = 0

    for (const node of remaining.values()) {
      const nodePaperIds = collectExistingNodePaperIds(node)
      if (nodePaperIds.length === 0) continue

      const overlapCount = nodePaperIds.filter((paperId) => clusterPaperIds.has(paperId)).length
      if (overlapCount === 0) continue

      const coverageScore = overlapCount / Math.max(clusterPaperIds.size, 1)
      const retentionScore = overlapCount / Math.max(nodePaperIds.length, 1)
      const score = coverageScore * 0.7 + retentionScore * 0.3

      if (score > bestScore) {
        bestScore = score
        bestCoverageScore = coverageScore
        bestRetentionScore = retentionScore
        bestNode = node
      }
    }

    if (
      !bestNode ||
      bestScore < 0.34 ||
      bestCoverageScore < 0.5 ||
      bestRetentionScore < 0.5
    ) {
      return null
    }

    remaining.delete(String(bestNode.id ?? bestNode.nodeId ?? ''))
    return bestNode
  })
}

function buildHeuristicFallbackOrchestration(args: {
  topic: any
  stage: any
  existingNodes: any[]
  candidatePapers: ResearchCandidatePaper[]
}): ResearchOrchestrationOutput {
  const useEnglish = args.topic?.language === 'en'
  const stageTitle = pickText(args.stage?.name, `Stage ${args.stage?.order ?? 1}`)
  const stageTitleEn = pickText(args.stage?.nameEn, stageTitle)

  if (args.candidatePapers.length === 0) {
    const stageSummary = useEnglish
      ? 'No new papers were admitted in this round, so the stage remains in evidence consolidation mode.'
      : '本轮没有新的论文被纳入主线，因此当前阶段继续停留在证据收束与判断校准模式。'

    return {
      stageTitle,
      stageTitleEn,
      stageSummary,
      shouldAdvanceStage: false,
      rationale: stageSummary,
      nodeActions: [],
      openQuestions: [],
    }
  }

  const clusters = buildHeuristicPaperClusters({
    topic: args.topic,
    papers: args.candidatePapers,
  })
  const existingNodeAssignments = assignExistingNodesToClusters(args.existingNodes, clusters)
  const nodeActions: ResearchNodeAction[] = clusters.map((cluster, clusterIndex) => {
    const primaryPaper = pickPrimaryPaperForCluster(cluster)
    const existingNode = existingNodeAssignments[clusterIndex] ?? null
    const themeTokens = buildClusterThemeTokens(cluster)
    const derivedThemeLabel = formatHeuristicThemeLabel(
      themeTokens,
      pickText(primaryPaper.titleZh, primaryPaper.titleEn, primaryPaper.title),
    )
    const themeLabel = derivedThemeLabel
    const problemLabelZh = pickText(cluster.labelZh, derivedThemeLabel)
    const problemLabelEn = pickText(
      cluster.labelEn,
      formatHeuristicThemeLabel(
        themeTokens,
        pickText(primaryPaper.titleEn, primaryPaper.title, primaryPaper.titleZh),
      ),
    )
    const paperIds = cluster.papers.map((paper) => paper.id)
    const isSinglePaper = cluster.papers.length === 1
    const prefersProblemLabel =
      Boolean(cluster.labelZh || cluster.labelEn) ||
      themeTokens.length > 0 ||
      !cluster.key.startsWith('paper:')
    const fallbackTitleZh = prefersProblemLabel
      ? problemLabelZh
      : pickText(primaryPaper.titleZh, primaryPaper.titleEn, primaryPaper.title)
    const fallbackTitleEn = prefersProblemLabel
      ? problemLabelEn
      : pickText(primaryPaper.titleEn, primaryPaper.title, primaryPaper.titleZh)

    const title = existingNode
      ? pickText(existingNode.nodeLabel, fallbackTitleZh, fallbackTitleEn)
      : useEnglish
        ? fallbackTitleEn
          : `围绕${themeLabel}的研究线`

    const titleEn = existingNode
      ? pickText(existingNode.nodeSubtitle, existingNode.nodeLabel, primaryPaper.titleEn, primaryPaper.title)
      : isSinglePaper
        ? pickText(primaryPaper.titleEn, primaryPaper.title)
        : `${themeLabel} Research Line`

    const _subtitle = existingNode
      ? pickText(existingNode.nodeSubtitle, titleEn, title)
      : isSinglePaper
        ? pickText(primaryPaper.titleEn, primaryPaper.title)
        : useEnglish
          ? `${cluster.papers.length} papers sharing one mechanism or evidence line`
          : `${cluster.papers.length} 篇论文围绕同一条机制或证据线展开`

    const _summary = isSinglePaper
      ? useEnglish
        ? `This node currently starts as a single-paper reading entry around ${themeLabel}, and still needs corroborating papers or a sharper scope decision.`
        : `这个节点目前先以单篇切入口的方式成立，围绕 ${themeLabel} 展开，但后续仍需要补入佐证论文或继续收窄边界。`
      : useEnglish
        ? `This node groups ${cluster.papers.length} papers around ${themeLabel}, so the topic page can surface one shared mechanism or evidence line instead of isolated paper cards.`
        : `这个节点把 ${cluster.papers.length} 篇论文并到同一条主线上，先围绕 ${themeLabel} 汇总共同推进的机制或证据关系，而不是把它们拆成孤立卡片。`

    const _explanation = isSinglePaper
      ? useEnglish
        ? `The current primary paper is ${pickText(primaryPaper.titleEn, primaryPaper.title)}. The node is intentionally written as a disciplined single-paper entry: it should either attract follow-up evidence in later cycles or be kept as a narrow deep-reading stop rather than pretending to be a mature cross-paper judgment.`
        : `当前主论文是《${pickText(primaryPaper.titleZh, primaryPaper.title)}》。这里先把它写成一个克制的单篇入口，不把它伪装成成熟的跨论文结论；后续要么继续补入互证论文，要么明确承认它只是一个窄边界的深读节点。`
      : useEnglish
        ? `The current primary paper is ${pickText(primaryPaper.titleEn, primaryPaper.title)}. These papers were grouped together because they appear to push the same line around ${themeLabel}; later cycles should verify whether their task setup, evaluation protocol, and closed-loop evidence truly support one another.`
        : `当前主论文是《${pickText(primaryPaper.titleZh, primaryPaper.title)}》。之所以先把这些论文放在一起，是因为它们看起来都在推进 ${themeLabel} 这条判断链；后续轮次仍要继续核对任务设定、评价协议与闭环证据是否真的彼此支撑。`

    const _rationale = existingNode
      ? useEnglish
        ? `The newly admitted papers strengthen the existing node around ${themeLabel} and expand its evidence base.`
        : `新纳入论文更适合继续补强已有节点，并把 ${themeLabel} 这条研究线的证据底座补得更厚。`
      : isSinglePaper
        ? useEnglish
          ? `Create a disciplined single-paper node first, then decide in later cycles whether it deserves corroboration or should remain a narrow reading stop.`
          : '先创建一个克制的单篇节点，再在后续轮次判断它应该被补强成跨论文节点，还是保留为窄边界深读入口。'
        : useEnglish
          ? `Create one multi-paper node so the first-cycle topic page already shows a shared mechanism line instead of one paper per card.`
          : '先创建一个多论文节点，让第一轮主题页就能展示共享的机制主线，而不是一张卡只对应一篇论文。'

    const resolvedTitle = existingNode
      ? pickText(existingNode.nodeLabel, fallbackTitleZh, fallbackTitleEn)
      : useEnglish
        ? fallbackTitleEn
        : fallbackTitleZh
    const resolvedTitleEn = existingNode
      ? pickText(existingNode.nodeSubtitle, existingNode.nodeLabel, fallbackTitleEn, fallbackTitleZh)
      : fallbackTitleEn
    const resolvedSubtitle = existingNode
      ? pickText(existingNode.nodeSubtitle, resolvedTitleEn, resolvedTitle)
      : useEnglish
        ? `${cluster.papers.length} stage-bounded paper${cluster.papers.length === 1 ? '' : 's'} on ${problemLabelEn}`
        : `${cluster.papers.length} 篇处于同一阶段窗口的论文，围绕${problemLabelZh}展开`
    const resolvedSummary = isSinglePaper
      ? useEnglish
        ? `Within ${stageTitleEn}, this node keeps ${pickText(primaryPaper.titleEn, primaryPaper.title)} as a disciplined entry point for ${problemLabelEn} instead of pretending that one paper already forms a stable consensus.`
        : `在 ${stageTitle} 这一时间窗口里，这个节点先把《${pickText(primaryPaper.titleZh, primaryPaper.title)}》作为“${problemLabelZh}”的问题入口保留下来，而不是把单篇论文包装成已经稳定的共识。`
      : useEnglish
        ? `This node groups ${cluster.papers.length} stage-bounded papers around ${problemLabelEn}, so the topic map shows one problem line and its evidence handoff instead of isolated paper cards.`
        : `这个节点把 ${cluster.papers.length} 篇处于同一阶段窗口的论文组织成“${problemLabelZh}”这一条问题线，让主题页看到的是问题演进与证据接力，而不是零散的论文卡片。`
    const resolvedExplanation = isSinglePaper
      ? useEnglish
        ? `The anchor paper is ${pickText(primaryPaper.titleEn, primaryPaper.title)}. Keeping it as a narrow node is intentional: later cycles should either find corroborating papers inside the same problem family or leave it as a bounded deep-reading stop with explicit limits.`
        : `当前锚点论文是《${pickText(primaryPaper.titleZh, primaryPaper.title)}》。之所以先把它保留为一个窄节点，是为了让后续轮次继续在同一问题族里补充互证论文；如果补不出来，就明确承认它只是一个边界清晰的深读入口。`
      : useEnglish
        ? `The anchor paper is ${pickText(primaryPaper.titleEn, primaryPaper.title)}. These papers were grouped together because they appear to push the same problem family inside the same stage window, and later cycles should keep checking whether their task framing, evaluation protocol, and closed-loop evidence truly support one another.`
        : `当前锚点论文是《${pickText(primaryPaper.titleZh, primaryPaper.title)}》。把这些论文放进同一个节点，不是因为它们共享几个关键词，而是因为它们在同一阶段窗口里推进的是同一类问题；后续轮次还要继续核对它们的任务定义、评测协议和闭环证据是否真的彼此支撑。`
    const resolvedRationale = existingNode
      ? useEnglish
        ? `The newly admitted papers strengthen the existing ${problemLabelEn} node and make its stage-bounded evidence base thicker.`
        : `新纳入论文更适合继续补强已有的“${problemLabelZh}”节点，让这一阶段窗口内的证据底座更厚。`
      : isSinglePaper
        ? useEnglish
          ? `Create a narrow problem node first, then decide in later cycles whether it deserves corroborating papers or should remain a bounded deep-reading stop.`
          : '先建立一个窄而克制的问题节点，再在后续轮次判断它是否值得补强成跨论文节点，还是保留为边界清晰的深读入口。'
        : useEnglish
          ? `Create one problem-focused multi-paper node so the topic page already shows a real research line instead of one paper per card.`
          : '先建立一个面向问题的多论文节点，让主题页直接呈现真实研究线，而不是一张卡只对应一篇论文。'

    return {
      action: existingNode ? 'strengthen' : 'create',
      nodeId: existingNode?.id,
      title: resolvedTitle,
      titleEn: resolvedTitleEn,
      subtitle: resolvedSubtitle,
      summary: clipText(resolvedSummary, 180),
      explanation: clipText(resolvedExplanation, 420),
      paperIds,
      primaryPaperId: primaryPaper.id,
      rationale: clipText(resolvedRationale, 220),
    }
  })

  const mainlineLabels = uniqueStrings(
    nodeActions.map((action) => action.title),
    3,
    64,
  )
  const _stageSummary = useEnglish
    ? `This round admitted ${args.candidatePapers.length} papers and organized them into ${nodeActions.length} node lines${mainlineLabels.length ? `, with the current emphasis on ${mainlineLabels.join(', ')}` : ''}.`
    : `本轮纳入了 ${args.candidatePapers.length} 篇论文，并先把它们整理为 ${nodeActions.length} 条节点主线${mainlineLabels.length ? `，当前重点落在 ${mainlineLabels.join('、')}` : ''}。`
  const _openQuestions = uniqueStrings(
    [
      ...clusters
        .filter((cluster) => cluster.papers.length === 1)
        .map((cluster) => {
          const paper = cluster.papers[0]
          return useEnglish
            ? `Should "${pickText(paper.titleEn, paper.title)}" stay as a narrow single-paper entry, or does it need corroborating papers before the node can be treated as stable?`
            : `《${pickText(paper.titleZh, paper.title)}》应该继续保持为单篇入口，还是需要补入互证论文后才能被视为稳定节点？`
        }),
      clusters.some((cluster) => cluster.papers.length > 1)
        ? useEnglish
          ? 'Do the multi-paper nodes really share one mechanism line, or are we still over-grouping by topical vocabulary?'
          : '这些多论文节点真的共享同一条机制主线吗，还是我们仍然只是按主题词把论文暂时并在一起？'
        : useEnglish
          ? 'The current stage still looks paper-fragmented. Which shared mechanism line should the next cycle stabilize first?'
          : '当前阶段仍然偏论文碎片化，下一轮最应该优先稳住的是哪一条共享机制主线？',
    ],
    4,
    180,
  )

  const resolvedStageSummary = useEnglish
    ? `This round admitted ${args.candidatePapers.length} papers and organized them into ${nodeActions.length} problem-focused node lines inside the current stage window${mainlineLabels.length ? `, with the strongest emphasis on ${mainlineLabels.join(', ')}` : ''}.`
    : `本轮纳入了 ${args.candidatePapers.length} 篇论文，并在当前阶段窗口内把它们整理成 ${nodeActions.length} 条面向问题的节点主线${mainlineLabels.length ? `，当前最突出的方向是 ${mainlineLabels.join('、')}` : ''}。`
  const resolvedOpenQuestions = uniqueStrings(
    [
      ...clusters
        .filter((cluster) => cluster.papers.length === 1)
        .map((cluster) => {
          const paper = cluster.papers[0]
          const primaryPaper = pickPrimaryPaperForCluster(cluster)
          const themeTokens = buildClusterThemeTokens(cluster)
          const singleProblemLabelEn = pickText(
            cluster.labelEn,
            formatHeuristicThemeLabel(
              themeTokens,
              pickText(primaryPaper.titleEn, primaryPaper.title, primaryPaper.titleZh),
            ),
          )
          const singleProblemLabelZh = pickText(
            cluster.labelZh,
            formatHeuristicThemeLabel(
              themeTokens,
              pickText(primaryPaper.titleZh, primaryPaper.titleEn, primaryPaper.title),
            ),
          )
          return useEnglish
            ? `Should ${singleProblemLabelEn} remain a narrow single-paper node around "${pickText(paper.titleEn, paper.title)}", or should the next cycle search for corroborating papers before treating it as stable?`
            : `“${singleProblemLabelZh}”是否应继续作为围绕《${pickText(paper.titleZh, paper.title)}》的单篇窄节点存在，还是下一轮就该优先去补充互证论文后再把它视为稳定节点？`
        }),
      clusters.some((cluster) => cluster.papers.length > 1)
        ? useEnglish
          ? 'Do the multi-paper nodes really share one task definition and evidence standard, or are we still over-grouping by vocabulary instead of problem continuity?'
          : '这些多论文节点是否真的共享同一套任务定义与证据标准，还是我们仍在按词汇相近而不是按问题连续性做过度归并？'
        : useEnglish
          ? 'The current stage is still paper-fragmented. Which problem family should the next cycle stabilize first?'
          : '当前阶段仍然偏论文碎片化，下一轮最应该优先稳住的是哪一条问题线？',
    ],
    4,
    180,
  )

  return {
    stageTitle,
    stageTitleEn,
    stageSummary: resolvedStageSummary,
    shouldAdvanceStage:
      nodeActions.some((action) => action.paperIds.length > 1) ||
      args.candidatePapers.length >= 3,
    rationale: resolvedStageSummary,
    nodeActions,
    openQuestions: resolvedOpenQuestions,
  }
}

function looksLikeLegacyEnglishResearchFallback(value: string | null | undefined) {
  const normalized = (value ?? '').replace(/\s+/gu, ' ').trim()
  if (!normalized) return false

  return (
    /\bNo new papers were admitted in this round\b/u.test(normalized) ||
    /\bthe stage remains in evidence consolidation mode\b/u.test(normalized) ||
    /\bStage\s+\d+:\s+No new papers were admitted\b/u.test(normalized)
  )
}

function prefersChineseResearchCopy(value: string | null | undefined) {
  return /[\u4e00-\u9fff]/u.test(value ?? '')
}

function formatStageRecordSummary(stageIndex: number, summary: string) {
  const normalized = clipText(summary, 160)
  if (!normalized) {
    return `第 ${stageIndex} 阶段已完成本轮研究`
  }

  if (!prefersChineseResearchCopy(normalized)) {
    return `Stage ${stageIndex}: ${normalized}`
  }

  return `第 ${stageIndex} 阶段：${normalized}`
}

function buildDurationResearchDecision(args: {
  currentStage: number
  totalStages: number
  currentStageStalls: number
  completedStageCycles: number
  stageStallLimit: number
  cycle: Pick<
    DiscoverCycleResult,
    'discovered' | 'admitted' | 'contentsGenerated' | 'shouldAdvanceStage' | 'stageSummary'
  >
}): ResearchPipelineDurationDecision {
  const madeProgress =
    args.cycle.discovered > 0 ||
    args.cycle.admitted > 0 ||
    args.cycle.contentsGenerated > 0
  const stallCountBefore = args.currentStageStalls
  const advanceToNextStage = args.currentStage < args.totalStages
  const nextStage = advanceToNextStage ? args.currentStage + 1 : 1
  const baseDecision = {
    currentStage: args.currentStage,
    nextStage: args.currentStage,
    madeProgress,
    stallCountBefore,
    stallCountAfter: stallCountBefore,
    stallLimit: args.stageStallLimit,
    completedStageCycles: args.completedStageCycles,
    rationale: clipText(args.cycle.stageSummary, 220),
  }

  if (args.cycle.shouldAdvanceStage) {
    return {
      ...baseDecision,
      action: advanceToNextStage ? 'advance' : 'cycle-reset',
      reason: 'orchestration',
      nextStage,
      stallCountAfter: 0,
      completedStageCycles: advanceToNextStage
        ? args.completedStageCycles
        : args.completedStageCycles + 1,
      summary: advanceToNextStage
        ? `Stage ${args.currentStage} is ready to advance to stage ${nextStage} based on the latest orchestration judgment.`
        : `Stage ${args.currentStage} completed this cycle and resets to stage 1 for the next research sweep.`,
    }
  }

  if (madeProgress) {
    return {
      ...baseDecision,
      action: 'stay',
      reason: 'progress-made',
      stallCountAfter: 0,
      summary: `Stage ${args.currentStage} stays open because the latest cycle added new evidence, admitted papers, or refreshed content.`,
    }
  }

  const stallCountAfter = stallCountBefore + 1
  if (stallCountAfter >= args.stageStallLimit) {
    return {
      ...baseDecision,
      action: advanceToNextStage ? 'advance' : 'cycle-reset',
      reason: 'stall-limit',
      nextStage,
      stallCountAfter: 0,
      completedStageCycles: advanceToNextStage
        ? args.completedStageCycles
        : args.completedStageCycles + 1,
      summary: advanceToNextStage
        ? `Stage ${args.currentStage} advanced to stage ${nextStage} after ${args.stageStallLimit} stall cycles without meaningful progress.`
        : `Stage ${args.currentStage} reached the stall limit, completed the current sweep, and resets to stage 1.`,
    }
  }

  return {
    ...baseDecision,
    action: 'stay',
    reason: 'await-more-evidence',
    stallCountAfter,
    summary: `Stage ${args.currentStage} remains open while the system consolidates evidence and waits for a stronger basis to advance.`,
  }
}

function formatStageFailureSummary(stageIndex: number, error: string) {
  const normalized = clipText(error, 180)
  return prefersChineseResearchCopy(normalized)
    ? `第 ${stageIndex} 阶段执行异常：${normalized}`
    : `Stage ${stageIndex} failed: ${normalized}`
}

function normalizeResearchTimelineLine(value: string | null | undefined) {
  const normalized = clipText(value, 220)
  if (!normalized) return ''

  const stageMatch = normalized.match(/^Stage\s+(\d+)\s*:\s*(.+)$/u)
  if (stageMatch && prefersChineseResearchCopy(stageMatch[2])) {
    return `第 ${stageMatch[1]} 阶段：${stageMatch[2]}`
  }

  return normalized
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function resolveResearchMode(config: TaskConfig): ResearchMode {
  if (config.researchMode === 'duration') return 'duration'
  if (typeof config.options?.durationHours === 'number' && config.options.durationHours > 0) {
    return 'duration'
  }
  return 'stage-rounds'
}

function resolveDurationHours(config: TaskConfig) {
  if (resolveResearchMode(config) !== 'duration') return null
  const hours = Number(config.options?.durationHours ?? DEFAULT_DURATION_HOURS)
  if (!Number.isFinite(hours)) return DEFAULT_DURATION_HOURS
  return clampNumber(hours, MIN_DURATION_HOURS, MAX_DURATION_HOURS)
}

function computeDurationProgress(progress: Pick<StageTaskProgress, 'startedAt' | 'deadlineAt'>) {
  if (!progress.startedAt || !progress.deadlineAt) return 0
  const startedAt = Date.parse(progress.startedAt)
  const deadlineAt = Date.parse(progress.deadlineAt)
  if (!Number.isFinite(startedAt) || !Number.isFinite(deadlineAt) || deadlineAt <= startedAt) return 0
  const now = Date.now()
  const ratio = (now - startedAt) / (deadlineAt - startedAt)
  return clampNumber(Math.round(ratio * 100), 0, 100)
}

function normalizeProgress(raw: Partial<StageTaskProgress>): StageTaskProgress {
  const researchMode = raw.researchMode === 'duration' ? 'duration' : 'stage-rounds'
  return {
    taskId: raw.taskId ?? '',
    topicId: raw.topicId ?? '',
    topicName: raw.topicName ?? 'Unknown Topic',
    researchMode,
    durationHours:
      typeof raw.durationHours === 'number' && Number.isFinite(raw.durationHours)
        ? raw.durationHours
        : null,
    currentStage: typeof raw.currentStage === 'number' ? raw.currentStage : 1,
    totalStages: typeof raw.totalStages === 'number' ? raw.totalStages : 1,
    stageProgress: typeof raw.stageProgress === 'number' ? raw.stageProgress : 0,
    currentStageRuns: typeof raw.currentStageRuns === 'number' ? raw.currentStageRuns : 0,
    currentStageTargetRuns:
      typeof raw.currentStageTargetRuns === 'number' ? raw.currentStageTargetRuns : 1,
    stageRunMap: raw.stageRunMap && typeof raw.stageRunMap === 'object' ? raw.stageRunMap : {},
    totalRuns: typeof raw.totalRuns === 'number' ? raw.totalRuns : 0,
    successfulRuns: typeof raw.successfulRuns === 'number' ? raw.successfulRuns : 0,
    failedRuns: typeof raw.failedRuns === 'number' ? raw.failedRuns : 0,
    lastRunAt: raw.lastRunAt ?? null,
    lastRunResult:
      raw.lastRunResult === 'success' ||
      raw.lastRunResult === 'failed' ||
      raw.lastRunResult === 'partial'
        ? raw.lastRunResult
        : null,
    discoveredPapers: typeof raw.discoveredPapers === 'number' ? raw.discoveredPapers : 0,
    admittedPapers: typeof raw.admittedPapers === 'number' ? raw.admittedPapers : 0,
    generatedContents: typeof raw.generatedContents === 'number' ? raw.generatedContents : 0,
    startedAt: raw.startedAt ?? null,
    deadlineAt: raw.deadlineAt ?? null,
    completedAt: raw.completedAt ?? null,
    activeSessionId: raw.activeSessionId ?? null,
    completedStageCycles:
      typeof raw.completedStageCycles === 'number' ? raw.completedStageCycles : 0,
    currentStageStalls:
      typeof raw.currentStageStalls === 'number' ? raw.currentStageStalls : 0,
    latestSummary: sanitizeResearchFacingSummary(raw.latestSummary) || null,
    status:
      raw.status === 'active' ||
      raw.status === 'paused' ||
      raw.status === 'completed' ||
      raw.status === 'failed'
        ? raw.status
        : 'active',
  }
}

function startOfUtcMonth(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function estimateTopicProgressTotalStages(args: {
  topic:
    | {
        createdAt?: Date | string | null
        papers?: Array<{
          published?: Date | string | null
        }>
      }
    | null
    | undefined
  existingStageCount: number
  windowMonths: number
}) {
  const effectiveWindowMonths = Math.max(1, Math.trunc(args.windowMonths))
  const paperMonths = (args.topic?.papers ?? [])
    .map((paper) => startOfUtcMonth(paper.published))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())
  const originMonth =
    paperMonths[0] ??
    startOfUtcMonth(args.topic?.createdAt) ??
    new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const currentMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const monthSpan = Math.max(
    0,
    (currentMonth.getUTCFullYear() - originMonth.getUTCFullYear()) * 12 +
      (currentMonth.getUTCMonth() - originMonth.getUTCMonth()),
  )
  const chronologicalStageCount = Math.floor(monthSpan / effectiveWindowMonths) + 1

  return Math.max(args.existingStageCount, chronologicalStageCount, 1)
}

function buildInitialProgressSnapshot(
  config: TaskConfig,
  topicName = 'Unknown Topic',
  totalStages = 5,
): StageTaskProgress {
  return normalizeProgress({
    taskId: config.id,
    topicId: config.topicId || '',
    topicName,
    researchMode: resolveResearchMode(config),
    durationHours: resolveDurationHours(config),
    currentStage: 1,
    totalStages,
    stageProgress: 0,
    currentStageRuns: 0,
    currentStageTargetRuns: 0,
    stageRunMap: {},
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    lastRunAt: null,
    lastRunResult: null,
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    startedAt: null,
    deadlineAt: null,
    completedAt: null,
    activeSessionId: null,
    completedStageCycles: 0,
    currentStageStalls: 0,
    latestSummary: null,
    status: config.enabled ? 'active' : 'paused',
  })
}

class EnhancedTaskScheduler {
  private tasks: Map<string, { config: TaskConfig; task: ManagedScheduledTask }> = new Map()
  private progress: Map<string, StageTaskProgress> = new Map()
  private executionHistory: Map<string, TaskExecutionRecord[]> = new Map()
  private activeSessions: Map<string, DurationSessionHandle> = new Map()
  private listeners: ((result: EnhancedTaskResult) => void | Promise<void>)[] = []
  private initializationPromise: Promise<void> | null = null
  private initialized = false

  private ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve()
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this.loadProgressFromDB().finally(() => {
        this.initialized = true
      })
    }

    return this.initializationPromise
  }

  private async loadProgressFromDB(): Promise<void> {
    try {
      const configs = await prisma.system_configs.findMany({
        where: { key: { startsWith: 'task-progress:' } },
      })

      const recoveredAt = new Date().toISOString()
      for (const config of configs) {
        const progress = normalizeProgress(JSON.parse(config.value) as Partial<StageTaskProgress>)
        if (progress.activeSessionId) {
          progress.activeSessionId = null
          if (progress.status === 'active') {
            progress.status = 'paused'
          }
          progress.completedAt = progress.completedAt ?? recoveredAt
          await this.saveProgress(progress.taskId, progress)
        }
        this.progress.set(progress.taskId, progress)
      }

      const history = await prisma.system_configs.findMany({
        where: { key: { startsWith: 'task-history:' } },
      })

      for (const config of history) {
        const records = JSON.parse(config.value) as TaskExecutionRecord[]
        this.executionHistory.set(config.key.replace('task-history:', ''), records)
      }

      console.log(`[Scheduler] Loaded ${this.progress.size} task progress records`)
    } catch (error) {
      console.error('[Scheduler] Failed to load progress from DB:', error)
    }
  }

  addTask(config: TaskConfig): boolean {
    if (!cron.validate(config.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression: ${config.cronExpression}`)
      return false
    }

    if (this.tasks.has(config.id)) {
      this.removeTask(config.id)
    }

    const task = createManagedScheduledTask(config, async () => {
      await this.dispatchTask(config, 'scheduled')
    })

    this.tasks.set(config.id, { config, task })

    if (!this.progress.has(config.id)) {
      const seededProgress = buildInitialProgressSnapshot(config)
      seededProgress.currentStageTargetRuns = this.resolveStageTargetRuns(config, 1)
      this.progress.set(config.id, seededProgress)
      void this.saveProgress(config.id, seededProgress)
      void this.initProgress(config)
    } else {
      const progress = this.progress.get(config.id)
      if (progress) {
        progress.researchMode = resolveResearchMode(config)
        progress.durationHours = resolveDurationHours(config)
        this.syncStageRoundCounters(config, progress)
        void this.saveProgress(config.id, progress)
      }
    }

    console.log(`[Scheduler] Task added: ${config.name} (${config.cronExpression})`)
    return true
  }

  private async initProgress(config: TaskConfig): Promise<void> {
    let topicName = 'Unknown Topic'
    let totalStages = 5

    if (config.topicId) {
      try {
        const [topic, stageCount, stageConfig] = await Promise.all([
          prisma.topics.findUnique({
            where: { id: config.topicId },
            select: {
              nameZh: true,
              nameEn: true,
              createdAt: true,
              papers: {
                select: {
                  published: true,
                },
              },
            },
          }),
          prisma.topic_stages.count({
            where: { topicId: config.topicId },
          }),
          loadTopicStageConfig(config.topicId),
        ])

        topicName = topic?.nameZh || topic?.nameEn || topicName
        totalStages = estimateTopicProgressTotalStages({
          topic,
          existingStageCount: stageCount || totalStages,
          windowMonths: stageConfig.windowMonths,
        })
      } catch (error) {
        console.error('[Scheduler] Failed to get topic info:', error)
      }
    }

    const progress: StageTaskProgress = buildInitialProgressSnapshot(config, topicName, totalStages)
    progress.currentStageTargetRuns = this.resolveStageTargetRuns(config, 1)
    this.syncStageRoundCounters(config, progress)
    this.progress.set(config.id, progress)
    await this.saveProgress(config.id, progress)
  }

  private async refreshTopicStageCapacity(config: TaskConfig, progress: StageTaskProgress) {
    if (!config.topicId) return

    try {
      const [topic, stageCount, stageConfig] = await Promise.all([
        prisma.topics.findUnique({
          where: { id: config.topicId },
          select: {
            nameZh: true,
            nameEn: true,
            createdAt: true,
            papers: {
              select: {
                published: true,
              },
            },
          },
        }),
        prisma.topic_stages.count({
          where: { topicId: config.topicId },
        }),
        loadTopicStageConfig(config.topicId),
      ])

      const nextTotalStages = estimateTopicProgressTotalStages({
        topic,
        existingStageCount: stageCount || progress.totalStages,
        windowMonths: stageConfig.windowMonths,
      })

      progress.topicName = topic?.nameZh || topic?.nameEn || progress.topicName
      if (nextTotalStages !== progress.totalStages) {
        progress.totalStages = nextTotalStages
      }
    } catch (error) {
      console.error('[Scheduler] Failed to refresh topic stage capacity:', error)
    }
  }

  private resolveStageTargetRuns(config: TaskConfig, stageIndex: number): number {
    if (resolveResearchMode(config) === 'duration') {
      return 0
    }

    const configuredRounds = config.options?.stageRounds?.find((entry) => entry.stageIndex === stageIndex)?.rounds

    if (typeof configuredRounds === 'number' && configuredRounds > 0) {
      return configuredRounds
    }

    if (typeof config.options?.maxIterations === 'number' && config.options.maxIterations > 0) {
      return config.options.maxIterations
    }

    return 1
  }

  private syncStageRoundCounters(config: TaskConfig, progress: StageTaskProgress) {
    const stageKey = String(progress.currentStage)
    progress.currentStageRuns = progress.stageRunMap[stageKey] ?? 0
    progress.currentStageTargetRuns = this.resolveStageTargetRuns(config, progress.currentStage)
    progress.researchMode = resolveResearchMode(config)
    progress.durationHours = resolveDurationHours(config)
    progress.stageProgress =
      progress.researchMode === 'duration'
        ? computeDurationProgress(progress)
        : Math.min(
            100,
            Math.round((progress.currentStageRuns / Math.max(1, progress.currentStageTargetRuns)) * 100),
          )
  }

  private shouldResetLegacyDurationProgress(progress: StageTaskProgress) {
    return (
      !progress.activeSessionId &&
      progress.totalRuns > 0 &&
      progress.successfulRuns === 0 &&
      progress.discoveredPapers === 0 &&
      progress.admittedPapers === 0 &&
      progress.generatedContents === 0 &&
      progress.failedRuns >= progress.totalRuns
    )
  }

  private resetProgressSnapshot(config: TaskConfig, progress: StageTaskProgress) {
    progress.currentStage = 1
    progress.stageRunMap = {}
    progress.totalRuns = 0
    progress.successfulRuns = 0
    progress.failedRuns = 0
    progress.discoveredPapers = 0
    progress.admittedPapers = 0
    progress.generatedContents = 0
    progress.lastRunAt = null
    progress.lastRunResult = null
    progress.startedAt = null
    progress.deadlineAt = null
    progress.completedAt = null
    progress.activeSessionId = null
    progress.completedStageCycles = 0
    progress.currentStageStalls = 0
    progress.latestSummary = null
    progress.status = 'active'
    this.syncStageRoundCounters(config, progress)
  }

  private moveToStage(config: TaskConfig, progress: StageTaskProgress, stageIndex: number) {
    progress.currentStage = stageIndex
    progress.currentStageStalls = 0
    this.syncStageRoundCounters(config, progress)
  }

  private markStageRun(config: TaskConfig, progress: StageTaskProgress) {
    const stageKey = String(progress.currentStage)
    progress.stageRunMap[stageKey] = (progress.stageRunMap[stageKey] ?? 0) + 1
    this.syncStageRoundCounters(config, progress)
  }

  private shouldAdvanceStage(config: TaskConfig, progress: StageTaskProgress) {
    if (resolveResearchMode(config) === 'duration') return false
    return (progress.stageRunMap[String(progress.currentStage)] ?? 0) >= this.resolveStageTargetRuns(config, progress.currentStage)
  }

  private createSkillContext(taskId: string): RuntimeSkillContext {
    return {
      sessionId: taskId,
      workspacePath: process.cwd(),
      logger: {
        info: (message, meta) => console.log(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
        warn: (message, meta) => console.warn(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
        error: (message, meta) => console.error(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
        debug: (message, meta) => console.debug(`[Scheduler:${taskId}] ${message}`, meta ?? ''),
      },
    }
  }

  private async resolveDurationResearchStrategy(
    config?: TaskConfig | null,
  ): Promise<DurationResearchStrategy> {
    const runtime = await getGenerationRuntimeConfig()
    const configuredDelay = Number(config?.options?.cycleDelayMs)

    return {
      cycleDelayMs: Number.isFinite(configuredDelay)
        ? clampNumber(configuredDelay, MIN_RESEARCH_CYCLE_DELAY_MS, MAX_RESEARCH_CYCLE_DELAY_MS)
        : runtime.researchCycleDelayMs,
      stageStallLimit: runtime.researchStageStallLimit,
      reportPasses: runtime.researchReportPasses,
    }
  }

  private async loadCandidatePapers(topicId: string, candidates: Array<Record<string, any>>) {
    const papers = await prisma.papers.findMany({
      where: { topicId },
      include: {
        figures: true,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: Math.max(24, candidates.length * 6),
    })

    const matched: ResearchCandidatePaper[] = []
    const usedIds = new Set<string>()

    for (const candidate of candidates) {
      const match =
        papers.find((paper) => !usedIds.has(paper.id) && paper.id === candidate.paperId) ??
        papers.find(
          (paper) =>
            !usedIds.has(paper.id) &&
            pickText((paper as any).arxivId, paper.id) === candidate.paperId,
        ) ??
        papers.find(
          (paper) =>
            !usedIds.has(paper.id) &&
            pickText(paper.titleZh, paper.title) === pickText(candidate.titleZh, candidate.title),
        ) ??
        papers.find(
          (paper) =>
            !usedIds.has(paper.id) && paper.title === pickText(candidate.title, candidate.titleZh),
        )

      if (!match) continue

      usedIds.add(match.id)
      matched.push({
        id: match.id,
        title: match.title,
        titleZh: match.titleZh,
        titleEn: match.titleEn,
        summary: match.summary,
        explanation: match.explanation,
        coverPath: match.coverPath,
        figures: match.figures.map((figure) => ({
          id: figure.id,
          imagePath: figure.imagePath,
          caption: figure.caption,
          analysis: figure.analysis,
        })),
      })
    }

    return matched
  }

  private buildFallbackOrchestration(args: {
    topic: any
    stage: any
    existingNodes: any[]
    candidatePapers: ResearchCandidatePaper[]
  }): ResearchOrchestrationOutput {
    return buildHeuristicFallbackOrchestration(args)
  }

  private normalizeResearchOrchestrationOutput(
    raw: Partial<ResearchOrchestrationOutput> | null | undefined,
    fallback: ResearchOrchestrationOutput,
  ): ResearchOrchestrationOutput {
    const source = raw && typeof raw === 'object' ? raw : {}
    const rawNodeActions = Array.isArray(source.nodeActions) ? source.nodeActions : fallback.nodeActions

    const nodeActions: ResearchNodeAction[] = rawNodeActions
      .map<ResearchNodeAction | null>((action, index) => {
        const fallbackAction = fallback.nodeActions[index] ?? fallback.nodeActions[0]
        const normalizedPaperIds = Array.isArray(action?.paperIds)
          ? action.paperIds.filter((paperId): paperId is string => typeof paperId === 'string' && Boolean(paperId))
          : fallbackAction?.paperIds ?? []
        const primaryPaperId =
          pickText(
            typeof action?.primaryPaperId === 'string' ? action.primaryPaperId : undefined,
            normalizedPaperIds[0],
            fallbackAction?.primaryPaperId,
          ) || normalizedPaperIds[0]

        if (!primaryPaperId || normalizedPaperIds.length === 0) {
          return null
        }

        const normalizedAction = action?.action
        const normalizedNodeAction: ResearchNodeAction = {
          action:
            normalizedAction === 'create' ||
            normalizedAction === 'update' ||
            normalizedAction === 'merge' ||
            normalizedAction === 'strengthen'
              ? normalizedAction
              : fallbackAction?.action ?? 'strengthen',
          title: pickText(action?.title, fallbackAction?.title, 'Untitled Node'),
          titleEn: pickText(action?.titleEn, fallbackAction?.titleEn, action?.title, fallbackAction?.title, 'Untitled Node'),
          subtitle: pickText(action?.subtitle, fallbackAction?.subtitle, action?.titleEn, fallbackAction?.titleEn, action?.title, fallbackAction?.title, 'Untitled Node'),
          summary: clipText(pickText(action?.summary, fallbackAction?.summary, action?.explanation, fallbackAction?.explanation), 180),
          explanation: clipText(pickText(action?.explanation, fallbackAction?.explanation, action?.summary, fallbackAction?.summary), 420),
          paperIds: Array.from(new Set(normalizedPaperIds)),
          primaryPaperId,
          rationale: clipText(pickText(action?.rationale, fallbackAction?.rationale, 'Keep the node structure coherent with the current evidence.'), 220),
        }

        const nodeId =
          typeof action?.nodeId === 'string' ? action.nodeId : fallbackAction?.nodeId
        const mergeIntoNodeId =
          typeof action?.mergeIntoNodeId === 'string'
            ? action.mergeIntoNodeId
            : fallbackAction?.mergeIntoNodeId

        if (nodeId) {
          normalizedNodeAction.nodeId = nodeId
        }

        if (mergeIntoNodeId) {
          normalizedNodeAction.mergeIntoNodeId = mergeIntoNodeId
        }

        return normalizedNodeAction
      })
      .filter((action): action is ResearchNodeAction => action !== null)

    return {
      stageTitle: pickText(source.stageTitle, fallback.stageTitle),
      stageTitleEn: pickText(source.stageTitleEn, fallback.stageTitleEn, source.stageTitle, fallback.stageTitle),
      stageSummary: clipText(pickText(source.stageSummary, fallback.stageSummary), 280),
      shouldAdvanceStage:
        typeof source.shouldAdvanceStage === 'boolean'
          ? source.shouldAdvanceStage
          : fallback.shouldAdvanceStage,
      rationale: clipText(pickText(source.rationale, fallback.rationale, fallback.stageSummary), 220),
      nodeActions: nodeActions.length > 0 ? nodeActions : fallback.nodeActions,
      openQuestions: (Array.isArray(source.openQuestions) ? source.openQuestions : fallback.openQuestions)
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => clipText(item, 180))
        .slice(0, 6),
    }
  }

  private async orchestrateStageResearch(args: {
    topicId: string
    stageIndex: number
    roundIndex: number
    topic: any
    stage: any
    existingNodes: any[]
    candidatePapers: ResearchCandidatePaper[]
  }) {
    const fallback = this.buildFallbackOrchestration(args)

    if (args.candidatePapers.length === 0) {
      return fallback
    }

    const [guidance, cognitiveMemory] = await Promise.all([
      loadTopicGuidanceLedger(args.topicId),
      collectTopicCognitiveMemory({
        topicId: args.topicId,
        subjectType: 'stage',
        subjectId: `research-stage:${args.stageIndex}:round:${args.roundIndex}`,
        recentLimit: 6,
      }),
    ])

    const result = await runStructuredGenerationPass<ResearchOrchestrationOutput>({
      topicId: args.topicId,
      subjectType: 'stage',
      subjectId: `research-stage:${args.stageIndex}:round:${args.roundIndex}`,
      templateId: PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_ORCHESTRATION,
      input: {
        topic: {
          id: args.topic.id,
          title: args.topic.nameZh,
          titleEn: args.topic.nameEn,
          focusLabel: args.topic.focusLabel,
          summary: args.topic.summary,
        },
        stage: {
          stageIndex: args.stageIndex,
          title: args.stage?.name ?? `Stage ${args.stageIndex}`,
          titleEn: args.stage?.nameEn ?? args.stage?.name ?? `Stage ${args.stageIndex}`,
          description: args.stage?.description ?? '',
          descriptionEn: args.stage?.descriptionEn ?? '',
        },
        existingNodes: args.existingNodes.map((node) => ({
          nodeId: node.id,
          title: node.nodeLabel,
          titleEn: node.nodeSubtitle ?? node.nodeLabel,
          summary: node.nodeSummary,
          explanation: node.nodeExplanation ?? node.nodeSummary,
          paperIds: node.papers.map((entry: any) => entry.paperId ?? entry.paper?.id).filter(Boolean),
          primaryPaperId: node.primaryPaperId,
        })),
        candidatePapers: args.candidatePapers.map((paper) => ({
          paperId: paper.id,
          title: paper.titleZh || paper.title,
          titleEn: paper.titleEn || paper.title,
          summary: paper.summary,
          explanation: paper.explanation ?? paper.summary,
          figureCount: paper.figures.length,
        })),
        history: await loadResearchPipelineState(args.topicId),
      },
      memoryContext: {
        guidance: compactTopicGuidanceContext(guidance),
        cognitiveMemory,
      },
      fallback,
      outputContract: JSON.stringify(fallback, null, 2),
      maxTokens: 2400,
      summaryHint: `Research orchestration for topic ${args.topicId} stage ${args.stageIndex}`,
    })

    return this.normalizeResearchOrchestrationOutput(result.output, fallback)
  }

  private async selectNodeCoverImage(args: {
    topicId: string
    stageIndex: number
    stageTitle: string
    node: any
    papers: ResearchCandidatePaper[]
  }) {
    const runtime = await getGenerationRuntimeConfig()
    const candidateFigures = args.papers
      .flatMap((paper) =>
        paper.figures.map((figure) => ({
          figureId: figure.id,
          imagePath: figure.imagePath,
          caption: figure.caption,
          analysis: figure.analysis ?? '',
          paperId: paper.id,
          paperTitle: paper.titleZh || paper.title,
        })),
      )
      .slice(0, runtime.nodeCardFigureCandidateLimit)

    if (candidateFigures.length === 0) {
      return args.papers.find((paper) => paper.coverPath)?.coverPath ?? null
    }

    const fallback = {
      selectedFigureId: candidateFigures[0].figureId,
      imagePath: candidateFigures[0].imagePath,
      shouldUseFallback: false,
      reason: 'Use the first available figure when no better selection signal exists.',
    }

    const result = await runStructuredGenerationPass<{
      selectedFigureId: string
      imagePath: string
      shouldUseFallback: boolean
      reason: string
    }>({
      topicId: args.topicId,
      subjectType: 'node',
      subjectId: `${args.node.id}:cover`,
      templateId: PROMPT_TEMPLATE_IDS.VISUAL_NODE_COVER,
      input: {
        stage: {
          stageIndex: args.stageIndex,
          title: args.stageTitle,
        },
        node: {
          nodeId: args.node.id,
          title: args.node.nodeLabel,
          subtitle: args.node.nodeSubtitle ?? '',
          summary: args.node.nodeSummary,
          explanation: args.node.nodeExplanation ?? args.node.nodeSummary,
        },
        candidateFigures,
      },
      fallback,
      outputContract: JSON.stringify(fallback, null, 2),
      summaryHint: `Select node cover for ${args.node.id}`,
    })

    if (!result.output.shouldUseFallback && result.output.imagePath) {
      return result.output.imagePath
    }

    return fallback.imagePath
  }

  private async applyResearchNodeActions(args: {
    topicId: string
    stageIndex: number
    stageTitle: string
    orchestration: ResearchOrchestrationOutput
    candidatePapers: ResearchCandidatePaper[]
  }) {
    const affectedNodeIds = new Set<string>()
    const existingStage = await prisma.topic_stages.findFirst({
      where: {
        topicId: args.topicId,
        order: args.stageIndex,
      },
    })

    if (existingStage) {
      await prisma.topic_stages.update({
        where: { id: existingStage.id },
        data: {
          name: pickText(args.orchestration.stageTitle, existingStage.name),
          nameEn: pickText(args.orchestration.stageTitleEn, existingStage.nameEn, existingStage.name),
          description: pickText(args.orchestration.stageSummary, existingStage.description),
          descriptionEn: pickText(args.orchestration.stageSummary, existingStage.descriptionEn),
        },
      })
    } else {
await prisma.topic_stages.create({
        data: {
          id: crypto.randomUUID(),
          topicId: args.topicId,
          order: args.stageIndex,
          name: pickText(args.orchestration.stageTitle, args.stageTitle, `Stage ${args.stageIndex}`),
          nameEn: pickText(
            args.orchestration.stageTitleEn,
            args.orchestration.stageTitle,
            args.stageTitle,
            `Stage ${args.stageIndex}`,
          ),
          description: pickText(
            args.orchestration.stageSummary,
            `Collects the papers currently assigned to stage ${args.stageIndex}.`,
          ),
          descriptionEn: pickText(
            args.orchestration.stageSummary,
            `Collects the papers currently assigned to stage ${args.stageIndex}.`,
          ),
        },
      })
    }

    for (const action of args.orchestration.nodeActions) {
      const paperIds = Array.from(new Set(action.paperIds.filter(Boolean)))

      if (paperIds.length === 0) continue

      const primaryPaperId =
        (paperIds.includes(action.primaryPaperId) ? action.primaryPaperId : paperIds[0]) ?? paperIds[0]
      const mergeTargetId = action.action === 'merge' ? action.mergeIntoNodeId : action.nodeId
      const targetNode =
        (mergeTargetId && (await prisma.research_nodes.findUnique({ where: { id: mergeTargetId } }))) ??
        (action.nodeId ? await prisma.research_nodes.findUnique({ where: { id: action.nodeId } }) : null)

      const node =
        targetNode
          ? await prisma.research_nodes.update({
              where: { id: targetNode.id },
              data: {
                stageIndex: args.stageIndex,
                nodeLabel: pickText(action.title, targetNode.nodeLabel),
                nodeSubtitle: pickText(action.subtitle, action.titleEn, targetNode.nodeSubtitle),
                nodeSummary: pickText(action.summary, targetNode.nodeSummary),
                nodeExplanation: pickText(action.explanation, targetNode.nodeExplanation, targetNode.nodeSummary),
                primaryPaperId,
                status: 'active',
                provisional: false,
              },
            })
          : await prisma.research_nodes.create({
              data: {
                id: crypto.randomUUID(),
                updatedAt: new Date(),
                topicId: args.topicId,
                stageIndex: args.stageIndex,
                nodeLabel: pickText(action.title, 'New Node'),
                nodeSubtitle: pickText(action.subtitle, action.titleEn, action.title),
                nodeSummary: pickText(action.summary, action.explanation),
                nodeExplanation: pickText(action.explanation, action.summary),
                primaryPaperId,
                status: 'active',
                provisional: false,
                isMergeNode: action.action === 'merge',
              },
            })

      action.nodeId = node.id
      if (action.action === 'merge') {
        action.mergeIntoNodeId = node.id
      }
      affectedNodeIds.add(node.id)

      await prisma.node_papers.deleteMany({
        where: {
          nodeId: node.id,
          paperId: { notIn: paperIds },
        },
      })

      for (const [index, paperId] of paperIds.entries()) {
        await prisma.node_papers.upsert({
          where: {
            nodeId_paperId: {
              nodeId: node.id,
              paperId,
            },
          },
          update: {
            order: index + 1,
          },
          create: {
            id: crypto.randomUUID(),
            nodeId: node.id,
            paperId,
            order: index + 1,
          },
        })
      }

      let nodePapers = args.candidatePapers.filter((paper) => paperIds.includes(paper.id))
      if (nodePapers.length < paperIds.length) {
        const missingPaperIds = paperIds.filter((paperId) => !nodePapers.some((paper) => paper.id === paperId))
        if (missingPaperIds.length > 0) {
          const missingPapers = await prisma.papers.findMany({
            where: { id: { in: missingPaperIds } },
            include: { figures: true },
          })

          nodePapers = [
            ...nodePapers,
            ...missingPapers.map((paper) => ({
              id: paper.id,
              title: paper.title,
              titleZh: paper.titleZh,
              titleEn: paper.titleEn,
              summary: paper.summary,
              explanation: paper.explanation,
              coverPath: paper.coverPath,
              figures: paper.figures.map((figure) => ({
                id: figure.id,
                imagePath: figure.imagePath,
                caption: figure.caption,
                analysis: figure.analysis,
              })),
            })),
          ]
        }
      }
      const nodeCoverImage = await this.selectNodeCoverImage({
        topicId: args.topicId,
        stageIndex: args.stageIndex,
        stageTitle: args.stageTitle,
        node,
        papers: nodePapers,
      })

      if (nodeCoverImage) {
        await prisma.research_nodes.update({
          where: { id: node.id },
          data: {
            nodeCoverImage,
          },
        })
      }
    }

    return {
      affectedNodeIds: [...affectedNodeIds],
    }
  }

  private async resolveGuidanceEvidenceTarget(anchorId: string): Promise<{
    nodeId: string | null
    paperId: string | null
  }> {
    const [anchorType, entityId] = anchorId.split(':')
    if (!anchorType || !entityId) {
      return { nodeId: null, paperId: null }
    }

    if (anchorType === 'node') {
      return {
        nodeId: entityId,
        paperId: null,
      }
    }

    if (anchorType === 'paper') {
      return {
        nodeId: null,
        paperId: entityId,
      }
    }

    if (anchorType === 'figure') {
      const figure = await prisma.figures.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: figure?.paperId ?? null }
    }

    if (anchorType === 'table') {
      const table = await prisma.tables.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: table?.paperId ?? null }
    }

    if (anchorType === 'formula') {
      const formula = await prisma.formulas.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: formula?.paperId ?? null }
    }

    if (anchorType === 'section') {
      const section = await prisma.paper_sections.findUnique({
        where: { id: entityId },
        select: { paperId: true },
      })
      return { nodeId: null, paperId: section?.paperId ?? null }
    }

    return { nodeId: null, paperId: null }
  }

  private async doesGuidanceDirectiveMatchCycle(args: {
    directive: TopicGuidanceDirective
    stageIndex: number
    admittedPaperIds: string[]
    nodeActions: ResearchNodeAction[]
    affectedNodeIds: string[]
  }): Promise<{ matched: boolean; direct: boolean }> {
    const nodeIdSet = new Set(
      [
        ...args.affectedNodeIds,
        ...args.nodeActions.map((action) => action.nodeId ?? null),
        ...args.nodeActions.map((action) => action.mergeIntoNodeId ?? null),
      ].filter((value): value is string => Boolean(value)),
    )
    const paperIdSet = new Set(
      [
        ...args.admittedPaperIds,
        ...args.nodeActions.flatMap((action) => action.paperIds ?? []),
        ...args.nodeActions.map((action) => action.primaryPaperId ?? null),
      ].filter((value): value is string => Boolean(value)),
    )

    if (args.directive.scopeType === 'topic') {
      return { matched: true, direct: false }
    }

    if (args.directive.scopeType === 'stage') {
      return {
        matched: args.directive.scopeId === String(args.stageIndex),
        direct: true,
      }
    }

    if (args.directive.scopeType === 'node') {
      return {
        matched: Boolean(args.directive.scopeId && nodeIdSet.has(args.directive.scopeId)),
        direct: true,
      }
    }

    if (args.directive.scopeType === 'paper') {
      return {
        matched: Boolean(args.directive.scopeId && paperIdSet.has(args.directive.scopeId)),
        direct: true,
      }
    }

    if (args.directive.scopeType === 'evidence') {
      const target = await this.resolveGuidanceEvidenceTarget(args.directive.scopeId ?? '')
      return {
        matched:
          (target.nodeId ? nodeIdSet.has(target.nodeId) : false) ||
          (target.paperId ? paperIdSet.has(target.paperId) : false),
        direct: true,
      }
    }

    return { matched: false, direct: false }
  }

  private buildGuidanceApplicationNote(args: {
    directive: TopicGuidanceDirective
    stageIndex: number
    stageSummary: string
    openQuestions: string[]
    nodeActions: ResearchNodeAction[]
    admitted: number
    discovered: number
  }) {
    const nodeTitles = uniqueStrings(
      args.nodeActions.map((action) => pickText(action.title, action.titleEn)),
      2,
      72,
    )
    const nodeLead =
      nodeTitles.length > 0 ? ` Node work touched ${nodeTitles.join(' / ')}.` : ''
    const stageLead = clipText(args.stageSummary, 120)
    const openQuestion = clipText(args.openQuestions[0], 84)

    if (args.directive.directiveType === 'focus') {
      return clipText(
        `Latest cycle kept stage ${args.stageIndex} centered on ${args.directive.scopeLabel}.${nodeLead} ${
          args.admitted > 0
            ? `It admitted ${args.admitted} new paper${args.admitted > 1 ? 's' : ''} without widening the brief too aggressively.`
            : stageLead
        }`,
        180,
      )
    }

    if (args.directive.directiveType === 'challenge') {
      return clipText(
        `Latest cycle re-checked ${args.directive.scopeLabel} against the current grouping and evidence.${nodeLead} ${
          openQuestion ? `The main unresolved edge is: ${openQuestion}` : stageLead
        }`,
        180,
      )
    }

    if (args.directive.directiveType === 'style') {
      return clipText(
        `Latest cycle kept this writing calibration while updating the stage narrative. ${stageLead || `Stage ${args.stageIndex} was rewritten with tighter phrasing.`}`,
        180,
      )
    }

    return clipText(
      `Latest cycle absorbed this preference while shaping stage ${args.stageIndex}. ${
        stageLead || `It reviewed ${args.discovered} candidate papers and kept the mainline coherent.`
      }${nodeLead}`,
      180,
    )
  }

  private buildGuidanceApplicationSummary(args: {
    stageIndex: number
    stageSummary: string
    appliedDirectives: Array<{
      directive: TopicGuidanceDirective
      status: TopicGuidanceDirectiveStatus
      note: string
    }>
  }) {
    const labels = uniqueStrings(
      args.appliedDirectives.map((item) => item.directive.scopeLabel || item.directive.instruction),
      2,
      42,
    )
    const directiveLabel =
      args.appliedDirectives.length === 1 ? 'directive' : 'directives'
    const labelClause = labels.length > 0 ? ` around ${labels.join(' / ')}` : ''
    const stageLead = clipText(args.stageSummary, 132)

    return clipText(
      `Stage ${args.stageIndex} applied ${args.appliedDirectives.length} guidance ${directiveLabel}${labelClause}. ${stageLead}`,
      220,
    )
  }

  private async applyGuidanceFromLatestCycle(args: {
    topicId: string
    stageIndex: number
    discovered: number
    admitted: number
    stageSummary: string
    openQuestions: string[]
    nodeActions: ResearchNodeAction[]
    admittedPaperIds: string[]
    affectedNodeIds: string[]
  }): Promise<TopicGuidanceLatestApplication | null> {
    const ledger = await loadTopicGuidanceLedger(args.topicId)
    const candidateDirectives = ledger.directives.filter(
      (directive) =>
        (directive.status === 'accepted' ||
          directive.status === 'partial' ||
          directive.status === 'deferred') &&
        directive.directiveType !== 'command',
    )

    if (candidateDirectives.length === 0) {
      return null
    }

    const appliedDirectives: Array<{
      directive: TopicGuidanceDirective
      status: TopicGuidanceDirectiveStatus
      note: string
    }> = []

    for (const directive of candidateDirectives.slice(0, 16)) {
      const match = await this.doesGuidanceDirectiveMatchCycle({
        directive,
        stageIndex: args.stageIndex,
        admittedPaperIds: args.admittedPaperIds,
        nodeActions: args.nodeActions,
        affectedNodeIds: args.affectedNodeIds,
      })

      if (!match.matched) continue

      const note = this.buildGuidanceApplicationNote({
        directive,
        stageIndex: args.stageIndex,
        stageSummary: args.stageSummary,
        openQuestions: args.openQuestions,
        nodeActions: args.nodeActions,
        admitted: args.admitted,
        discovered: args.discovered,
      })

      const status: TopicGuidanceDirectiveStatus =
        directive.appliesToRuns === 'until-cleared'
          ? directive.status
          : directive.directiveType === 'challenge'
            ? args.openQuestions.length > 0 || !match.direct
              ? 'partial'
              : 'consumed'
            : !match.direct && directive.directiveType !== 'focus'
              ? 'partial'
              : 'consumed'

      appliedDirectives.push({
        directive,
        status,
        note,
      })
    }

    if (appliedDirectives.length === 0) {
      return null
    }

    const summary = this.buildGuidanceApplicationSummary({
      stageIndex: args.stageIndex,
      stageSummary: args.stageSummary,
      appliedDirectives,
    })
    const detail = appliedDirectives.map((item) => `${item.directive.instruction}: ${item.note}`).join('\n')

    const recorded = await recordTopicGuidanceDirectiveApplication({
      topicId: args.topicId,
      stageIndex: args.stageIndex,
      summary,
      directives: appliedDirectives.map((item) => ({
        directiveId: item.directive.id,
        status: item.status,
        note: item.note,
      })),
    })

    if (recorded.application) {
      await recordTopicGuidanceApplication({
        topicId: args.topicId,
        stageIndex: args.stageIndex,
        headline: `Guidance applied in stage ${args.stageIndex}`,
        summary,
        detail,
      })
    }

    return recorded.application
  }

  private summarizeNodeActionsForReport(
    nodeActions: ResearchNodeAction[],
    stageIndex: number,
  ): ResearchRunReport['latestNodeActions'] {
    return nodeActions.slice(0, 6).map((action) => ({
      action: action.action,
      stageIndex,
      title: pickText(action.title, action.titleEn, 'Untitled node action'),
      rationale: clipText(action.rationale, 200),
      nodeId: action.nodeId ?? null,
      mergeIntoNodeId: action.mergeIntoNodeId ?? null,
    }))
  }

  private buildFallbackResearchReport(args: {
    config: TaskConfig
    progress: StageTaskProgress
    source: SchedulerRunSource
    status: ResearchRunReport['status']
    latestCycle?: DiscoverCycleResult | null
    error?: string | null
  }): ResearchRunReport {
    const now = new Date().toISOString()
    const durationLabel = args.progress.durationHours
      ? `${args.progress.durationHours} 小时`
      : '本轮研究窗口'
    const statusLabel =
      args.status === 'running'
        ? '正在持续雕琢'
        : args.status === 'paused'
          ? '已暂停'
          : args.status === 'failed'
            ? '异常结束'
            : '已经完成'
    const recentRecords = this.getExecutionHistory(args.config.id, 6)
      .slice()
      .reverse()
      .filter((record) => record.status === 'success')
    const latestSummary =
      sanitizeResearchFacingSummary(
        args.latestCycle?.stageSummary ??
          args.progress.latestSummary ??
          recentRecords[0]?.summary ??
          '',
      ) || null
    const latestNodeActions = args.latestCycle
      ? this.summarizeNodeActionsForReport(args.latestCycle.nodeActions, args.progress.currentStage)
      : []
    const normalizedError = sanitizeResearchFacingSummary(args.error, clipText(args.error, 200)) || null
    const keyMoves = [
      args.latestCycle?.durationDecision?.summary
        ? `Latest stage decision: ${args.latestCycle.durationDecision.summary}`
        : '',
      latestSummary ? `最近一轮重点推进：${latestSummary}` : '',
      args.latestCycle?.guidanceApplicationSummary
        ? `Latest guidance adjustment: ${args.latestCycle.guidanceApplicationSummary}`
        : '',
      args.progress.completedStageCycles > 0
        ? `已经完整巡检 ${args.progress.completedStageCycles} 轮阶段主线，并继续回到前面阶段做校正。`
        : '',
      args.progress.currentStageStalls > 0
        ? `当前阶段已连续 ${args.progress.currentStageStalls} 轮未形成有效推进，系统会在必要时转向下一阶段继续巡检。`
        : '',
      ...recentRecords.slice(0, 3).map((record) => record.summary),
      ...latestNodeActions.map((action) =>
        action.rationale ? `${action.title}：${action.rationale}` : action.title,
      ),
    ]
      .map((line) => normalizeResearchTimelineLine(line))
      .filter((line) => !looksLikeLegacyEnglishResearchFallback(line))
      .map((line) => sanitizeResearchFacingSummary(line, clipText(line, 200)))
      .filter(Boolean)
      .slice(0, 6)

    const openQuestions = (args.latestCycle?.openQuestions ?? [])
      .map((item) => clipText(item, 180))
      .filter(Boolean)
      .slice(0, 6)

    const paragraphs = [
      `${args.progress.topicName} 的这轮 ${durationLabel} 研究${statusLabel}。系统围绕当前主题主线持续检索、纳入、改写并回看已有节点，而不是按预设轮次机械停下。`,
      `截至目前，已经完成 ${args.progress.totalRuns} 次研究循环，累计发现 ${args.progress.discoveredPapers} 篇候选论文，纳入 ${args.progress.admittedPapers} 篇，触发 ${args.progress.generatedContents} 次内容重建。当前停留在第 ${args.progress.currentStage} / ${args.progress.totalStages} 阶段。`,
      latestSummary
        ? `最近一轮最关键的推进是：${latestSummary}`
        : '这轮研究仍在围绕现有证据继续收束主线，并为后续节点修正保留判断空间。',
      normalizedError ? `本轮还出现了需要继续处理的问题：${normalizedError}` : '',
    ]
      .map((line) => clipText(line, 280))
      .filter(Boolean)
      .slice(0, 4)

    const headline =
      args.status === 'running'
        ? `${durationLabel} 研究进行中`
        : args.status === 'paused'
          ? `${durationLabel} 研究已暂停`
          : args.status === 'failed'
            ? `${durationLabel} 研究中断`
            : `${durationLabel} 研究完成`

    const dek =
      latestSummary ??
      `围绕主题主线持续推进节点归纳、论文吸收与叙事修整，直到时间预算耗尽。`

    return {
      schemaVersion: 'topic-research-report-v1',
      reportId: args.progress.activeSessionId ?? `report-${Date.now()}`,
      taskId: args.config.id,
      topicId: args.progress.topicId,
      topicName: args.progress.topicName,
      researchMode: args.progress.researchMode,
      trigger: args.source,
      status: args.status,
      durationHours: args.progress.durationHours,
      startedAt: args.progress.startedAt ?? now,
      deadlineAt: args.progress.deadlineAt,
      completedAt: args.status === 'running' ? null : args.progress.completedAt ?? now,
      updatedAt: now,
      currentStage: args.progress.currentStage,
      totalStages: args.progress.totalStages,
      completedStageCycles: args.progress.completedStageCycles,
      totalRuns: args.progress.totalRuns,
      successfulRuns: args.progress.successfulRuns,
      failedRuns: args.progress.failedRuns,
      discoveredPapers: args.progress.discoveredPapers,
      admittedPapers: args.progress.admittedPapers,
      generatedContents: args.progress.generatedContents,
      latestStageSummary: latestSummary,
      headline,
      dek: clipText(dek, 180),
      summary: clipText(paragraphs.join(' '), 360),
      paragraphs,
      keyMoves,
      openQuestions,
      latestNodeActions,
    }
  }

  private deriveResearchReportStatus(
    progress: StageTaskProgress | null,
    active: boolean,
  ): ResearchRunReport['status'] {
    if (active) return 'running'
    if (progress?.status === 'failed') return 'failed'
    if (progress?.status === 'completed') return 'completed'
    return 'paused'
  }

  private shouldPreferFallbackResearchReport(
    progress: StageTaskProgress | null,
    report: ResearchRunReport | null,
    active: boolean,
    fallback?: ResearchRunReport | null,
  ) {
    return shouldPreferFallbackResearchReportState({
      progress,
      report,
      active,
      fallback,
    })
  }

  private async writeResearchReport(args: {
    config: TaskConfig
    progress: StageTaskProgress
    source: SchedulerRunSource
    status: ResearchRunReport['status']
    latestCycle?: DiscoverCycleResult | null
    error?: string | null
  }) {
    if (!args.progress.topicId) return null

    const fallback = this.buildFallbackResearchReport(args)
    const generated = await runStructuredGenerationPass<{
      headline: string
      dek: string
      summary: string
      paragraphs: string[]
      keyMoves: string[]
      openQuestions: string[]
    }>({
      topicId: args.progress.topicId,
      subjectType: 'topic',
      subjectId: `research-report:${args.progress.activeSessionId ?? args.config.id}`,
      templateId: PROMPT_TEMPLATE_IDS.TOPIC_RESEARCH_REPORT,
      input: {
        topic: {
          topicId: args.progress.topicId,
          title: args.progress.topicName,
        },
        task: {
          taskId: args.config.id,
          name: args.config.name,
          researchMode: args.progress.researchMode,
          durationHours: args.progress.durationHours,
          trigger: args.source,
          status: args.status,
        },
        progress: {
          currentStage: args.progress.currentStage,
          totalStages: args.progress.totalStages,
          completedStageCycles: args.progress.completedStageCycles,
          totalRuns: args.progress.totalRuns,
          successfulRuns: args.progress.successfulRuns,
          failedRuns: args.progress.failedRuns,
          discoveredPapers: args.progress.discoveredPapers,
          admittedPapers: args.progress.admittedPapers,
          generatedContents: args.progress.generatedContents,
        },
        latestCycle: args.latestCycle
          ? {
              stageSummary: args.latestCycle.stageSummary,
              discovered: args.latestCycle.discovered,
              admitted: args.latestCycle.admitted,
              contentsGenerated: args.latestCycle.contentsGenerated,
              nodeActions: this.summarizeNodeActionsForReport(
                args.latestCycle.nodeActions,
                args.progress.currentStage,
              ),
              openQuestions: args.latestCycle.openQuestions,
              durationDecision: args.latestCycle.durationDecision
                ? {
                    action: args.latestCycle.durationDecision.action,
                    reason: args.latestCycle.durationDecision.reason,
                    currentStage: args.latestCycle.durationDecision.currentStage,
                    nextStage: args.latestCycle.durationDecision.nextStage,
                    summary: args.latestCycle.durationDecision.summary ?? '',
                    rationale: args.latestCycle.durationDecision.rationale ?? '',
                  }
                : null,
            }
          : null,
        recentHistory: this.getExecutionHistory(args.config.id, 6),
        error: args.error ?? null,
      },
      fallback: {
        headline: fallback.headline,
        dek: fallback.dek,
        summary: fallback.summary,
        paragraphs: fallback.paragraphs,
        keyMoves: fallback.keyMoves,
        openQuestions: fallback.openQuestions,
      },
      outputContract: JSON.stringify(
        {
          headline: '',
          dek: '',
          summary: '',
          paragraphs: [''],
          keyMoves: [''],
          openQuestions: [''],
        },
        null,
        2,
      ),
      maxTokens: 1800,
      summaryHint: fallback.summary,
    })

    const report: ResearchRunReport = {
      ...fallback,
      headline:
        args.status === 'running'
          ? clipText(generated.output.headline, 120) || fallback.headline
          : fallback.headline,
      dek: clipText(generated.output.dek, 180) || fallback.dek,
      summary: clipText(generated.output.summary, 360) || fallback.summary,
      paragraphs:
        Array.isArray(generated.output.paragraphs) && generated.output.paragraphs.length > 0
          ? generated.output.paragraphs.map((item) => clipText(item, 280)).filter(Boolean).slice(0, 4)
          : fallback.paragraphs,
      keyMoves:
        Array.isArray(generated.output.keyMoves) && generated.output.keyMoves.length > 0
          ? generated.output.keyMoves.map((item) => clipText(item, 200)).filter(Boolean).slice(0, 6)
          : fallback.keyMoves,
      openQuestions:
        Array.isArray(generated.output.openQuestions) && generated.output.openQuestions.length > 0
          ? generated.output.openQuestions.map((item) => clipText(item, 180)).filter(Boolean).slice(0, 6)
          : fallback.openQuestions,
      updatedAt: new Date().toISOString(),
    }

    await saveTopicResearchReport(report)
    return report
  }

  private applyDurationResearchDecision(
    config: TaskConfig,
    progress: StageTaskProgress,
    decision: ResearchPipelineDurationDecision,
  ) {
    progress.currentStageStalls = decision.stallCountAfter ?? progress.currentStageStalls
    progress.completedStageCycles =
      decision.completedStageCycles ?? progress.completedStageCycles

    if (decision.action === 'stay') {
      this.syncStageRoundCounters(config, progress)
      return
    }

    this.moveToStage(config, progress, decision.nextStage)
  }

  private async executeStageTask(
    config: TaskConfig,
    session?: {
      sessionId?: string
      source?: SchedulerRunSource
      durationStrategy?: DurationResearchStrategy
    },
  ): Promise<EnhancedTaskResult> {
    const startTime = Date.now()
    const result: EnhancedTaskResult = {
      taskId: config.id,
      success: false,
      executedAt: new Date(),
    }

    console.log(`[Scheduler] Executing stage task: ${config.name}`)

    const progress = this.progress.get(config.id)
    if (!progress) {
      result.error = 'Task progress not found'
      return result
    }

    const currentStage = progress.currentStage
    const context = this.createSkillContext(config.id)
    const researchMode = resolveResearchMode(config)
    const durationStrategy =
      researchMode === 'duration'
        ? (session?.durationStrategy ?? await this.resolveDurationResearchStrategy(config))
        : null
    let latestCycle: DiscoverCycleResult | null = null

    try {
      switch (config.action) {
        case 'discover': {
          const metricBaseline = {
            discoveredPapers: progress.discoveredPapers,
            admittedPapers: progress.admittedPapers,
            generatedContents: progress.generatedContents,
          }
          const discoverResult = await this.executeRealDiscover(
            config,
            currentStage,
            progress,
            context,
            durationStrategy,
          )
          latestCycle = discoverResult
          result.result = discoverResult

          progress.totalRuns += 1
          progress.successfulRuns += 1
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          progress.discoveredPapers = Math.max(
            progress.discoveredPapers,
            metricBaseline.discoveredPapers + (discoverResult.discovered || 0),
          )
          progress.admittedPapers = Math.max(
            progress.admittedPapers,
            metricBaseline.admittedPapers + (discoverResult.admitted || 0),
          )
          progress.generatedContents = Math.max(
            progress.generatedContents,
            metricBaseline.generatedContents + (discoverResult.contentsGenerated || 0),
          )
          progress.latestSummary =
            sanitizeResearchFacingSummary(discoverResult.stageSummary) || null

          this.markStageRun(config, progress)

          if (researchMode === 'duration') {
            const durationDecision =
              discoverResult.durationDecision ??
              buildDurationResearchDecision({
                currentStage,
                totalStages: progress.totalStages,
                currentStageStalls: progress.currentStageStalls,
                completedStageCycles: progress.completedStageCycles,
                stageStallLimit: durationStrategy?.stageStallLimit ?? 1,
                cycle: discoverResult,
              })
            discoverResult.durationDecision = durationDecision
            this.applyDurationResearchDecision(config, progress, durationDecision)

            if (durationDecision.action !== 'stay') {
              console.log(
                `[Scheduler] Duration research decision ${durationDecision.action} -> stage ${durationDecision.nextStage} (${durationDecision.reason})`,
              )
            }
          } else if (this.shouldAdvanceStage(config, progress) && discoverResult.shouldAdvanceStage) {
            if (currentStage < progress.totalStages) {
              this.moveToStage(config, progress, currentStage + 1)
              console.log(`[Scheduler] Advancing to stage ${progress.currentStage}`)
            } else {
              progress.status = 'completed'
              progress.stageProgress = 100
              console.log(`[Scheduler] All stages completed for task ${config.id}`)
            }
          } else if (this.shouldAdvanceStage(config, progress) && !discoverResult.shouldAdvanceStage) {
            console.log(
              `[Scheduler] Stage ${currentStage} reached configured rounds but orchestration kept it open`,
            )
          }

          if (config.topicId) {
            void recordTopicResearchCycle({
              topicId: config.topicId,
              stageIndex: currentStage,
              headline: discoverResult.shouldAdvanceStage
                ? `Stage ${currentStage} 收束并准备推进`
                : `Stage ${currentStage} 持续打磨`,
              summary: discoverResult.stageSummary,
              nodeTitles: uniqueStrings(
                discoverResult.nodeActions.map((action) => pickText(action.title, action.titleEn)),
                6,
                80,
              ),
              paperIds: discoverResult.admittedPaperIds,
              openQuestions: discoverResult.openQuestions,
            }).catch((error) => {
              console.error(`[Scheduler] Failed to write research cycle memory for ${config.id}:`, error)
            })
          }
          break
        }

        case 'refresh': {
          const refreshResult = await this.executeRealRefresh(config, progress, context)
          result.result = refreshResult
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          break
        }

        case 'sync': {
          const syncResult = await this.executeRealSync(config, progress, context)
          result.result = syncResult
          progress.lastRunResult = 'success'
          progress.lastRunAt = new Date().toISOString()
          break
        }
      }

      result.success = true
      result.duration = Date.now() - startTime
      result.progress = progress
      await this.saveProgress(config.id, progress)
      await this.addExecutionRecord(config.id, {
        id: `exec-${Date.now()}`,
        taskId: config.id,
        runAt: new Date().toISOString(),
        duration: result.duration,
        status: 'success',
        stageIndex: currentStage,
        papersDiscovered: (result.result as { discovered?: number } | undefined)?.discovered || 0,
        papersAdmitted: (result.result as { admitted?: number } | undefined)?.admitted || 0,
        contentsGenerated: (result.result as { contentsGenerated?: number } | undefined)?.contentsGenerated || 0,
        sessionId: session?.sessionId,
        summary: formatStageRecordSummary(currentStage, latestCycle?.stageSummary ?? ''),
      })
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
      result.duration = Date.now() - startTime
      progress.totalRuns += 1
      progress.failedRuns += 1
      progress.lastRunResult = 'failed'
      progress.lastRunAt = new Date().toISOString()
      progress.latestSummary =
        sanitizeResearchFacingSummary(result.error, DEFAULT_RESEARCH_STATUS_ISSUE_SUMMARY) || null

      await this.saveProgress(config.id, progress)
      await this.addExecutionRecord(config.id, {
        id: `exec-${Date.now()}`,
        taskId: config.id,
        runAt: new Date().toISOString(),
        duration: Date.now() - startTime,
        status: 'failed',
        stageIndex: currentStage,
        papersDiscovered: 0,
        papersAdmitted: 0,
        contentsGenerated: 0,
        sessionId: session?.sessionId,
        error: result.error,
        summary: formatStageFailureSummary(currentStage, result.error),
      })

      console.error(`[Scheduler] Task ${config.name} failed:`, error)
    }

    for (const listener of this.listeners) {
      try {
        await listener(result)
      } catch (error) {
        console.error('[Scheduler] Listener error:', error)
      }
    }

    return result
  }

  private async publishLiveResearchSummary(
    taskId: string,
    progress: StageTaskProgress,
    summary: string | null | undefined,
  ) {
    const normalized = clipText(
      sanitizeResearchFacingSummary(summary, summary ?? '') || summary || '',
      220,
    )

    if (!normalized || progress.latestSummary === normalized) {
      return
    }

    await this.persistLiveResearchProgress({
      taskId,
      progress,
      latestSummary: normalized,
    })
  }

  private async persistLiveResearchProgress(args: {
    taskId: string
    progress: StageTaskProgress
    discoveredPapers?: number
    admittedPapers?: number
    generatedContents?: number
    latestSummary?: string | null
  }) {
    let changed = false

    if (
      typeof args.discoveredPapers === 'number' &&
      Number.isFinite(args.discoveredPapers) &&
      args.progress.discoveredPapers !== args.discoveredPapers
    ) {
      args.progress.discoveredPapers = Math.max(0, Math.trunc(args.discoveredPapers))
      changed = true
    }

    if (
      typeof args.admittedPapers === 'number' &&
      Number.isFinite(args.admittedPapers) &&
      args.progress.admittedPapers !== args.admittedPapers
    ) {
      args.progress.admittedPapers = Math.max(0, Math.trunc(args.admittedPapers))
      changed = true
    }

    if (
      typeof args.generatedContents === 'number' &&
      Number.isFinite(args.generatedContents) &&
      args.progress.generatedContents !== args.generatedContents
    ) {
      args.progress.generatedContents = Math.max(0, Math.trunc(args.generatedContents))
      changed = true
    }

    if (typeof args.latestSummary === 'string' && args.latestSummary && args.progress.latestSummary !== args.latestSummary) {
      args.progress.latestSummary = args.latestSummary
      changed = true
    }

    if (changed) {
      await this.saveProgress(args.taskId, args.progress)
    }
  }

  private shouldAbortInFlightDurationWork(config: TaskConfig, progress: StageTaskProgress) {
    return resolveResearchMode(config) === 'duration' && (!progress.activeSessionId || progress.status === 'paused')
  }

  private buildAbortedDiscoverCycle(args: {
    stageIndex: number
    discovered: number
    admitted: number
    contentsGenerated: number
    note: string
    admittedPaperIds?: string[]
  }): DiscoverCycleResult {
    return {
      discovered: args.discovered,
      admitted: args.admitted,
      contentsGenerated: args.contentsGenerated,
      shouldAdvanceStage: false,
      stageSummary: clipText(args.note, 280),
      openQuestions: [],
      nodeActions: [],
      admittedPaperIds: args.admittedPaperIds ?? [],
      affectedNodeIds: [],
      guidanceApplicationSummary: null,
    }
  }

  private async executeRealDiscover(
    config: TaskConfig,
    stageIndex: number,
    progress: StageTaskProgress,
    context: RuntimeSkillContext,
    durationStrategy?: DurationResearchStrategy | null,
  ): Promise<DiscoverCycleResult> {
    console.log(`[Scheduler] Real discover round for stage ${stageIndex}, topic: ${config.topicId}`)

    if (!config.topicId) {
      throw new Error('Task must have a topicId for discovery action')
    }

    const runtime = await getGenerationRuntimeConfig()
    const roundIndex = (progress.stageRunMap[String(stageIndex)] ?? 0) + 1
    const progressBaseline = {
      discoveredPapers: progress.discoveredPapers,
      admittedPapers: progress.admittedPapers,
      generatedContents: progress.generatedContents,
    }
    const { executePaperTracker } = require('../../skill-packs/research/paper-tracker/executor') as {
      executePaperTracker: (input: any, context: any, artifactManager: any) => Promise<any>
    }
    const { executeContentGenesis } = require('../../skill-packs/research/content-genesis-v2/executor') as {
      executeContentGenesis: (input: any, context: any, artifactManager: any) => Promise<any>
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在检索并筛选新的论文候选，准备继续延展当前主线。`,
    )

    const trackerResult = await executePaperTracker(
      {
        params: {
          topicId: config.topicId,
          stageIndex,
          stageMode: 'current',
          discoverySource: 'external-only',
          maxCandidates: runtime.researchStagePaperLimit,
          mode: 'commit',
        },
        context: {},
      },
      context as any,
      null as any,
    )

    if (!trackerResult.success) {
      throw new Error(trackerResult.error || 'Paper tracker failed')
    }

    const trackerData = (trackerResult.data ?? {}) as Record<string, any>
    const admittedCandidates = Array.isArray(trackerData.admittedCandidates)
      ? (trackerData.admittedCandidates as Array<Record<string, any>>)
      : []
    const discovered =
      typeof trackerData.discoverySummary?.totalDiscovered === 'number'
        ? trackerData.discoverySummary.totalDiscovered
        : admittedCandidates.length
    const admittedPaperIds = admittedCandidates
      .map((candidate) => (typeof candidate.paperId === 'string' ? candidate.paperId : null))
      .filter((paperId): paperId is string => Boolean(paperId))

    await this.persistLiveResearchProgress({
      taskId: config.id,
      progress,
      discoveredPapers: progressBaseline.discoveredPapers + discovered,
      admittedPapers: progressBaseline.admittedPapers + admittedCandidates.length,
    })

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      admittedCandidates.length > 0
        ? `第 ${stageIndex} 阶段已发现 ${discovered} 篇候选论文，并纳入 ${admittedCandidates.length} 篇进入后续整理。`
        : `第 ${stageIndex} 阶段已完成候选筛选，共发现 ${discovered} 篇论文，当前继续收束既有节点判断。`,
    )

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated: 0,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在论文发现完成后已被暂停，本轮已纳入的论文会在下一次研究中继续展开节点归纳与文章化整理。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在把新证据折叠回阶段结构，准备形成新的节点判断。`,
    )

    const [preTopic, preStage, preExistingNodes, preCandidatePapers] = await Promise.all([
      prisma.topics.findUnique({
        where: { id: config.topicId },
      }),
      prisma.topic_stages.findFirst({
        where: { topicId: config.topicId, order: stageIndex },
      }),
      prisma.research_nodes.findMany({
        where: { topicId: config.topicId, stageIndex },
        include: {
          node_papers: {
            include: {
              papers: true,
            },
            orderBy: { order: 'asc' },
          },
          papers: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.loadCandidatePapers(config.topicId, admittedCandidates),
    ])

    const useHeuristicBootstrap =
      preExistingNodes.length === 0 && preCandidatePapers.length > 0

    if (preTopic && !this.shouldAbortInFlightDurationWork(config, progress)) {
      const earlyOrchestration = useHeuristicBootstrap
        ? this.buildFallbackOrchestration({
            topic: preTopic,
            stage: preStage,
            existingNodes: preExistingNodes,
            candidatePapers: preCandidatePapers,
          })
        : await this.orchestrateStageResearch({
            topicId: config.topicId,
            stageIndex,
            roundIndex,
            topic: preTopic,
            stage: preStage,
            existingNodes: preExistingNodes,
            candidatePapers: preCandidatePapers,
          })

      if (!this.shouldAbortInFlightDurationWork(config, progress)) {
        await this.publishLiveResearchSummary(
          config.id,
          progress,
          `第 ${stageIndex} 阶段已完成结构判断，正在把新的节点归纳与主线修正提前写回主题。`,
        )

        const earlyNodeActionResult = await this.applyResearchNodeActions({
          topicId: config.topicId,
          stageIndex,
          stageTitle: earlyOrchestration.stageTitle,
          orchestration: earlyOrchestration,
          candidatePapers: preCandidatePapers,
        })
        await syncConfiguredTopicWorkflowSnapshot(config.topicId)

        if (!this.shouldAbortInFlightDurationWork(config, progress)) {
          const earlyTargetedNodeIds = earlyNodeActionResult.affectedNodeIds.slice(
            0,
            runtime.researchArtifactRebuildLimit,
          )

          await this.publishLiveResearchSummary(
            config.id,
            progress,
            `第 ${stageIndex} 阶段正在提前发布主题快照，让主题页先展示节点结构与阶段判断。`,
          )

          await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })

          const earlyWarm = await warmTopicReaderArtifacts(config.topicId, {
            limit: runtime.researchArtifactRebuildLimit,
            mode: 'deferred',
            entityIds: {
              nodeIds: earlyTargetedNodeIds,
              paperIds: [],
            },
          })

          await this.publishLiveResearchSummary(
            config.id,
            progress,
            earlyWarm.queuedNodeCount > 0
              ? `第 ${stageIndex} 阶段的主题快照已提前更新，${earlyWarm.queuedNodeCount} 个节点已经可以展示，论文细稿会继续在后台补齐。`
              : `第 ${stageIndex} 阶段的主题快照已提前更新，当前没有额外节点任务需要排队。`,
          )
        }
      }
    }

    let contentsGenerated = 0
    for (const [index, candidate] of admittedCandidates.entries()) {
      if (this.shouldAbortInFlightDurationWork(config, progress)) {
        return this.buildAbortedDiscoverCycle({
          stageIndex,
          discovered,
          admitted: admittedCandidates.length,
          contentsGenerated,
          admittedPaperIds,
          note: `第 ${stageIndex} 阶段在内容生成过程中被暂停，当前已纳入的论文与已完成的整理结果会保留下来，下次研究将从这里继续。`,
        })
      }

      await this.publishLiveResearchSummary(
        config.id,
        progress,
        `第 ${stageIndex} 阶段正在为新纳入论文生成内容底稿（${index + 1}/${admittedCandidates.length}）。`,
      )

      const contentResult = await executeContentGenesis(
        {
          params: {
            paperId: candidate.paperId,
            topicId: config.topicId,
            stageIndex,
            citeIntent: candidate.citeIntent,
            contentMode: 'editorial',
          },
          context: {},
        },
        context as any,
        null as any,
      )

      if (contentResult.success) {
        contentsGenerated += 1
        await this.persistLiveResearchProgress({
          taskId: config.id,
          progress,
          generatedContents: progressBaseline.generatedContents + contentsGenerated,
        })
      } else if (
        typeof contentResult.error === 'string' &&
        /\b(?:topic|paper) not found\b|disappeared before persistence/iu.test(contentResult.error)
      ) {
        return this.buildAbortedDiscoverCycle({
          stageIndex,
          discovered,
          admitted: admittedCandidates.length,
          contentsGenerated,
          admittedPaperIds,
          note: `第 ${stageIndex} 阶段在内容整理期间检测到主题或论文已被移除，本轮提前收口，避免继续回写失效对象。`,
        })
      }
    }

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段已暂停，论文吸收结果已经保留，但节点结构与主题快照会等下一次研究继续完成。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在整合候选论文与既有节点，准备形成新的阶段判断。`,
    )

    const [topic, stage, existingNodes, candidatePapers] = await Promise.all([
      prisma.topics.findUnique({
        where: { id: config.topicId },
      }),
      prisma.topic_stages.findFirst({
        where: { topicId: config.topicId, order: stageIndex },
      }),
      prisma.research_nodes.findMany({
        where: { topicId: config.topicId, stageIndex },
        include: {
          node_papers: {
            include: {
              papers: true,
            },
            orderBy: { order: 'asc' },
          },
          papers: true,
        },
        orderBy: [{ updatedAt: 'desc' }],
      }),
      this.loadCandidatePapers(config.topicId, admittedCandidates),
    ])

    if (!topic) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在主题移除后中止，当前研究循环不会再继续写回节点与主题快照。`,
      })
    }

    const orchestration = useHeuristicBootstrap
      ? this.buildFallbackOrchestration({
          topic,
          stage,
          existingNodes,
          candidatePapers,
        })
      : await this.orchestrateStageResearch({
          topicId: config.topicId,
          stageIndex,
          roundIndex,
          topic,
          stage,
          existingNodes,
          candidatePapers,
        })

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在节点归纳前被暂停，已吸收的论文证据会在下次研究中继续折叠进主线。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段已完成结构判断，正在把新的节点归纳与主线修正写回主题。`,
    )

    const nodeActionResult = await this.applyResearchNodeActions({
      topicId: config.topicId,
      stageIndex,
      stageTitle: orchestration.stageTitle,
      orchestration,
      candidatePapers,
    })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在节点写回后被暂停，后续主题快照与导出会在下一次研究中继续刷新。`,
      })
    }

    const targetedNodeIds = nodeActionResult.affectedNodeIds.slice(0, runtime.researchArtifactRebuildLimit)
    const targetedPaperIds = admittedPaperIds.slice(0, runtime.researchArtifactRebuildLimit)
    const durationDecision =
      resolveResearchMode(config) === 'duration' && durationStrategy
        ? buildDurationResearchDecision({
            currentStage: stageIndex,
            totalStages: progress.totalStages,
            currentStageStalls: progress.currentStageStalls,
            completedStageCycles: progress.completedStageCycles,
            stageStallLimit: durationStrategy.stageStallLimit,
            cycle: {
              discovered,
              admitted: admittedCandidates.length,
              contentsGenerated,
              shouldAdvanceStage: orchestration.shouldAdvanceStage,
              stageSummary: orchestration.stageSummary,
            },
          })
        : null
    const guidanceApplication = await this.applyGuidanceFromLatestCycle({
      topicId: config.topicId,
      stageIndex,
      discovered,
      admitted: admittedCandidates.length,
      stageSummary: orchestration.stageSummary,
      openQuestions: orchestration.openQuestions,
      nodeActions: orchestration.nodeActions,
      admittedPaperIds,
      affectedNodeIds: nodeActionResult.affectedNodeIds,
    })

    if (this.shouldAbortInFlightDurationWork(config, progress)) {
      return this.buildAbortedDiscoverCycle({
        stageIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        admittedPaperIds,
        note: `第 ${stageIndex} 阶段在主题快照发布前被暂停，节点更新已经保留，视图快照会在下一次研究时继续刷新。`,
      })
    }

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${stageIndex} 阶段正在发布主题快照；节点与论文的深度文章化内容会继续在后台完善。`,
    )

    const warmed = await orchestrateTopicReaderArtifacts(config.topicId, {
      limit: runtime.researchArtifactRebuildLimit,
      mode: 'deferred',
      entityIds: {
        nodeIds: targetedNodeIds,
        paperIds: targetedPaperIds,
      },
      pipelineEntry: {
        stageIndex,
        roundIndex,
        discovered,
        admitted: admittedCandidates.length,
        contentsGenerated,
        stageSummary: orchestration.stageSummary,
        shouldAdvanceStage: orchestration.shouldAdvanceStage,
        durationDecision: durationDecision ?? undefined,
        nodeActions: orchestration.nodeActions,
        openQuestions: orchestration.openQuestions,
      },
    })
    await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    await this.publishLiveResearchSummary(
      config.id,
      progress,
      warmed.queuedNodeCount > 0 || warmed.queuedPaperCount > 0
        ? `第 ${stageIndex} 阶段的主题快照已更新，${warmed.queuedNodeCount} 个节点与 ${warmed.queuedPaperCount} 篇论文正在后台继续打磨深度文章。`
        : `第 ${stageIndex} 阶段的主题快照已更新，当前没有额外的深度文章重建任务在排队。`,
    )

    return {
      discovered,
      admitted: admittedCandidates.length,
      contentsGenerated,
      shouldAdvanceStage: orchestration.shouldAdvanceStage,
      stageSummary: orchestration.stageSummary,
      openQuestions: orchestration.openQuestions,
      nodeActions: orchestration.nodeActions,
      admittedPaperIds,
      affectedNodeIds: nodeActionResult.affectedNodeIds,
      guidanceApplicationSummary: guidanceApplication?.summary ?? null,
      durationDecision,
    }
  }

  private async executeRealRefresh(
    config: TaskConfig,
    progress: StageTaskProgress,
    _context: RuntimeSkillContext,
  ): Promise<{
    refreshed: boolean
    stage: number
    papersUpdated: number
  }> {
    console.log(`[Scheduler] Real refresh for stage ${progress.currentStage}`)

    if (!config.topicId) {
      throw new Error('Task must have a topicId for refresh action')
    }

    const runtime = await getGenerationRuntimeConfig()
    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${progress.currentStage} 阶段正在刷新主题快照，深度阅读稿会在后台继续补齐。`,
    )
    const warmed = await orchestrateTopicReaderArtifacts(config.topicId, {
      limit: runtime.researchArtifactRebuildLimit,
      mode: 'deferred',
    })
    await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    return {
      refreshed: true,
      stage: progress.currentStage,
      papersUpdated: Math.max(warmed.warmedPaperCount, warmed.queuedPaperCount),
    }
  }

  private async executeRealSync(
    config: TaskConfig,
    progress: StageTaskProgress,
    _context: RuntimeSkillContext,
  ): Promise<{
    synced: boolean
    stage: number
    papersSynced: number
  }> {
    console.log(`[Scheduler] Real sync for stage ${progress.currentStage}`)

    if (!config.topicId) {
      throw new Error('Task must have a topicId for sync action')
    }

    const runtime = await getGenerationRuntimeConfig()
    await this.publishLiveResearchSummary(
      config.id,
      progress,
      `第 ${progress.currentStage} 阶段正在同步阅读快照，后台会继续收尾节点和论文的深度重建。`,
    )
    const warmed = await orchestrateTopicReaderArtifacts(config.topicId, {
      limit: runtime.researchArtifactRebuildLimit,
      mode: 'deferred',
    })
    await refreshTopicViewModelSnapshot(config.topicId, { mode: 'deferred' })
    await syncConfiguredTopicWorkflowSnapshot(config.topicId)

    return {
      synced: true,
      stage: progress.currentStage,
      papersSynced: warmed.warmedPaperCount,
    }
  }

  private async dispatchTask(
    config: TaskConfig,
    source: SchedulerRunSource,
    options?: { forceStage?: number; mode?: 'full' | 'discover-only' },
  ): Promise<EnhancedTaskResult> {
    let progress = this.progress.get(config.id)

if (!progress) {
      await this.initProgress(config)
      progress = this.progress.get(config.id)
    }

    if (progress && options?.forceStage !== undefined) {
      this.moveToStage(config, progress, options.forceStage)
      await this.saveProgress(config.id, progress)
    }

    if (progress) {
      await this.refreshTopicStageCapacity(config, progress)
      this.syncStageRoundCounters(config, progress)
      await this.saveProgress(config.id, progress)
    }

    if (resolveResearchMode(config) === 'duration' && config.action === 'discover') {
      return this.startDurationTask(config, source)
    }

    return this.executeStageTask(config, { source })
  }

  private async startDurationTask(
    config: TaskConfig,
    source: SchedulerRunSource,
  ): Promise<EnhancedTaskResult> {
    let progress = this.progress.get(config.id)
    if (!progress) {
      await this.initProgress(config)
      progress = this.progress.get(config.id)
    }

    if (!progress) {
      return {
        taskId: config.id,
        success: false,
        executedAt: new Date(),
        error: 'Task progress not found',
      }
    }

    const active = this.activeSessions.get(config.id)
    if (active) {
      return {
        taskId: config.id,
        success: true,
        executedAt: new Date(),
        result: {
          queued: false,
          alreadyRunning: true,
          sessionId: active.sessionId,
          deadlineAt: active.deadlineAt,
        },
        progress,
      }
    }

    const durationHours = resolveDurationHours(config) ?? DEFAULT_DURATION_HOURS
    const startedAt = new Date()
    const deadlineAt = new Date(startedAt.getTime() + durationHours * 60 * 60 * 1000)
    const sessionId = `research-${Date.now()}`

    if (this.shouldResetLegacyDurationProgress(progress)) {
      this.resetProgressSnapshot(config, progress)
    }

    progress.researchMode = 'duration'
    progress.durationHours = durationHours
    progress.startedAt = startedAt.toISOString()
    progress.deadlineAt = deadlineAt.toISOString()
    progress.completedAt = null
    progress.activeSessionId = sessionId
    progress.currentStageStalls = 0
    progress.latestSummary = null
    progress.status = 'active'
    this.syncStageRoundCounters(config, progress)

    await this.saveProgress(config.id, progress)
    if (config.topicId) {
      void recordTopicResearchStatus({
        topicId: config.topicId,
        stageIndex: progress.currentStage,
        headline: `${durationHours} 小时研究启动`,
        summary: `系统开始围绕第 ${progress.currentStage} 阶段持续研究，并会把新的论文吸收、节点修正与阶段判断持续写回同一条主题主线。`,
      }).catch((error) => {
        console.error(`[Scheduler] Failed to write research status memory for ${config.id}:`, error)
      })
    }
    void this.writeResearchReport({
      config,
      progress,
      source,
      status: 'running',
    }).catch((error) => {
      console.error(`[Scheduler] Failed to write initial research report for ${config.id}:`, error)
    })

    const promise = BACKGROUND_DURATION_RUNS_DISABLED
      ? createDormantDurationSessionPromise()
      : this.launchDurationTask(config, sessionId, source)
    this.activeSessions.set(config.id, {
      sessionId,
      source,
      startedAt: progress.startedAt ?? startedAt.toISOString(),
      deadlineAt: progress.deadlineAt ?? deadlineAt.toISOString(),
      promise,
    })

    if (!BACKGROUND_DURATION_RUNS_DISABLED) {
      void promise.finally(() => {
        const current = this.activeSessions.get(config.id)
        if (current?.sessionId === sessionId) {
          this.activeSessions.delete(config.id)
        }
      })
    }

    return {
      taskId: config.id,
      success: true,
      executedAt: new Date(),
      result: {
        queued: true,
        sessionId,
        startedAt: progress.startedAt,
        deadlineAt: progress.deadlineAt,
        durationHours,
      },
      progress,
    }
  }

  private launchDurationTask(
    config: TaskConfig,
    sessionId: string,
    source: SchedulerRunSource,
  ) {
    const deferred = createDeferredPromise()

    setImmediate(() => {
      void this.runDurationTask(config, sessionId, source).then(
        () => deferred.resolve(),
        (error) => deferred.reject(error),
      )
    })

    return deferred.promise
  }

  private async runDurationTask(
    config: TaskConfig,
    sessionId: string,
    source: SchedulerRunSource,
  ) {
    const durationStrategy = await this.resolveDurationResearchStrategy(config)
    let terminalError: string | null = null
    let lastCycle: DiscoverCycleResult | null = null

    try {
      while (true) {
        const progress = this.progress.get(config.id)
        if (!progress) break
        if (progress.activeSessionId !== sessionId) break
        if (progress.status === 'paused') break

        const deadlineAt = progress.deadlineAt ? Date.parse(progress.deadlineAt) : Number.NaN
        if (!Number.isFinite(deadlineAt) || Date.now() >= deadlineAt) break

        const cycle = await this.executeStageTask(config, {
          sessionId,
          source,
          durationStrategy,
        })
        const nextProgress = this.progress.get(config.id)
        if (cycle.success && nextProgress && nextProgress.activeSessionId === sessionId) {
          terminalError = null
          const cycleResult = cycle.result as DiscoverCycleResult | undefined
          lastCycle = cycleResult ?? null
          await this.writeResearchReport({
            config,
            progress: nextProgress,
            source,
            status: 'running',
            latestCycle: cycleResult ?? null,
          })
        } else if (!cycle.success) {
          terminalError = cycle.error ?? 'Duration research loop failed'
          const failedProgress = this.progress.get(config.id)
          if (failedProgress && failedProgress.activeSessionId === sessionId) {
            await this.writeResearchReport({
              config,
              progress: failedProgress,
              source,
              status: 'running',
              error: terminalError,
            })
          }
        }

        const updatedProgress = this.progress.get(config.id)
        if (!updatedProgress || updatedProgress.activeSessionId !== sessionId) break
        if (updatedProgress.status === 'paused') break
        if (updatedProgress.deadlineAt && Date.now() >= Date.parse(updatedProgress.deadlineAt)) break

        await sleep(durationStrategy.cycleDelayMs)
      }
    } catch (error) {
      terminalError = error instanceof Error ? error.message : String(error)
      console.error(`[Scheduler] Duration task ${config.id} crashed:`, error)
    } finally {
      const progress = this.progress.get(config.id)
      if (progress && progress.activeSessionId === sessionId) {
        progress.activeSessionId = null
        progress.completedAt = new Date().toISOString()
        if (progress.status !== 'paused') {
          progress.status = terminalError ? 'failed' : 'completed'
        }

        this.syncStageRoundCounters(config, progress)
        await this.saveProgress(config.id, progress)
        await this.writeResearchReport({
          config,
          progress,
          source,
          status:
            progress.status === 'paused'
              ? 'paused'
              : terminalError
                ? 'failed'
                : 'completed',
          latestCycle: lastCycle,
          error: terminalError,
        })

        if (config.topicId) {
          void recordTopicResearchStatus({
            topicId: config.topicId,
            stageIndex: progress.currentStage,
            headline:
              progress.status === 'paused'
                ? '研究会话暂停'
                : terminalError
                  ? '研究会话异常结束'
                  : '研究会话完成',
            summary:
              progress.latestSummary ||
              (terminalError
                ? clipText(terminalError, 220)
                : `本轮持续研究已经完成，当前停留在第 ${progress.currentStage} 阶段。`),
          }).catch((error) => {
            console.error(
              `[Scheduler] Failed to persist closing research status memory for ${config.id}:`,
              error,
            )
          })
        }
      }
    }
  }

  private async loadStoredTaskConfig(taskId: string): Promise<TaskConfig | null> {
    const record = await prisma.system_configs.findUnique({
      where: { key: `task:${taskId}` },
    })

    if (!record?.value) return null

    try {
      return JSON.parse(record.value) as TaskConfig
    } catch {
      return null
    }
  }

  private async saveProgress(taskId: string, progress: StageTaskProgress): Promise<void> {
    try {
      await prisma.system_configs.upsert({
        where: { key: `task-progress:${taskId}` },
        update: { value: JSON.stringify(progress), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key: `task-progress:${taskId}`, value: JSON.stringify(progress), updatedAt: new Date() },
      })
    } catch (error) {
      console.error('[Scheduler] Failed to save progress:', error)
    }
  }

  private async addExecutionRecord(taskId: string, record: TaskExecutionRecord): Promise<void> {
    const key = `task-history:${taskId}`
    const records = this.executionHistory.get(taskId) || []
    records.push(record)

    if (records.length > 100) {
      records.splice(0, records.length - 100)
    }

    this.executionHistory.set(taskId, records)

    try {
      await prisma.system_configs.upsert({
        where: { key },
        update: { value: JSON.stringify(records), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key, value: JSON.stringify(records), updatedAt: new Date() },
      })
    } catch (error) {
      console.error('[Scheduler] Failed to save execution record:', error)
    }
  }

  async triggerTask(
    taskId: string,
    options?: { forceStage?: number; mode?: 'full' | 'discover-only' },
  ): Promise<EnhancedTaskResult | null> {
    await this.ensureInitialized()

    const entry = this.tasks.get(taskId)
    if (entry) {
      return this.dispatchTask(entry.config, 'manual', options)
    }

    const stored = await this.loadStoredTaskConfig(taskId)
    if (!stored) return null

    this.addTask(stored)
    return this.dispatchTask(stored, 'manual', options)
  }

  getProgress(taskId: string): StageTaskProgress | null {
    return this.progress.get(taskId) || null
  }

  getAllProgress(): StageTaskProgress[] {
    return Array.from(this.progress.values())
  }

  getExecutionHistory(taskId: string, limit = 20): TaskExecutionRecord[] {
    const records = this.executionHistory.get(taskId) || []
    return records.slice(-limit)
  }

  async jumpToStage(taskId: string, stageIndex: number): Promise<boolean> {
    await this.ensureInitialized()

    const entry = this.tasks.get(taskId)
    const progress = this.progress.get(taskId)
    if (!entry || !progress) return false

    this.moveToStage(entry.config, progress, stageIndex)
    await this.saveProgress(taskId, progress)

    console.log(`[Scheduler] Jumped to stage ${stageIndex} for task ${taskId}`)
    return true
  }

  async resetProgress(taskId: string): Promise<boolean> {
    await this.ensureInitialized()

    const entry = this.tasks.get(taskId)
    const progress = this.progress.get(taskId)
    if (!entry || !progress) return false

    this.resetProgressSnapshot(entry.config, progress)
    await this.saveProgress(taskId, progress)

    console.log(`[Scheduler] Reset progress for task ${taskId}`)
    return true
  }

  removeTask(taskId: string): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    entry.task.stop()
    if (typeof entry.task.destroy === 'function') {
      entry.task.destroy()
    }
    this.tasks.delete(taskId)
    this.activeSessions.delete(taskId)

    const progress = this.progress.get(taskId)
    if (progress) {
      progress.activeSessionId = null
    }

    console.log(`[Scheduler] Task removed: ${taskId}`)
    return true
  }

  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    const entry = this.tasks.get(taskId)
    if (!entry) return false

    entry.config.enabled = enabled

    if (enabled) {
      entry.task.start()
    } else {
      entry.task.stop()
    }

    const progress = this.progress.get(taskId)
    if (progress) {
      progress.status = enabled ? 'active' : 'paused'
      if (!enabled) {
        progress.completedAt = new Date().toISOString()
      }
      this.syncStageRoundCounters(entry.config, progress)
      void this.saveProgress(taskId, progress)
    }

    console.log(`[Scheduler] Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`)
    return true
  }

  onResult(listener: (result: EnhancedTaskResult) => void | Promise<void>): void {
    this.listeners.push(listener)
  }

  getTaskConfig(taskId: string): TaskConfig | null {
    return this.tasks.get(taskId)?.config ?? null
  }

  getAllTasks(): TaskConfig[] {
    return Array.from(this.tasks.values()).map((entry) => entry.config)
  }

  topicResearchTaskId(topicId: string) {
    return `topic-research:${topicId}`
  }

  async ensureTopicResearchTask(
    topicId: string,
    options?: { durationHours?: number },
  ): Promise<TaskConfig> {
    await this.ensureInitialized()

    const topic = await prisma.topics.findUnique({
      where: { id: topicId },
      select: { id: true, nameZh: true, nameEn: true },
    })

    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`)
    }

    const taskId = this.topicResearchTaskId(topicId)
    const stored = await this.loadStoredTaskConfig(taskId)
    const nextConfig: TaskConfig = {
      id: taskId,
      name: `${topic.nameZh || topic.nameEn || topicId} XX 小时研究`,
      cronExpression: stored?.cronExpression ?? MANUAL_TOPIC_TASK_CRON,
      enabled: stored?.enabled ?? false,
      topicId,
      action: 'discover',
      researchMode: 'duration',
      options: {
        ...(stored?.options ?? {}),
        durationHours: clampNumber(
          Number(options?.durationHours ?? stored?.options?.durationHours ?? DEFAULT_DURATION_HOURS),
          MIN_DURATION_HOURS,
          MAX_DURATION_HOURS,
        ),
        cycleDelayMs:
          typeof stored?.options?.cycleDelayMs === 'number'
            ? clampNumber(
                stored.options.cycleDelayMs,
                MIN_RESEARCH_CYCLE_DELAY_MS,
                MAX_RESEARCH_CYCLE_DELAY_MS,
              )
            : undefined,
      },
    }

    if (this.activeSessions.has(taskId) && this.tasks.has(taskId)) {
      return this.tasks.get(taskId)!.config
    }

    if (this.tasks.has(taskId)) {
      this.removeTask(taskId)
    }
    this.addTask(nextConfig)

await prisma.system_configs.upsert({
        where: { key: `task:${taskId}` },
        update: { value: JSON.stringify(nextConfig), updatedAt: new Date() },
        create: { id: crypto.randomUUID(), key: `task:${taskId}`, value: JSON.stringify(nextConfig), updatedAt: new Date() },
      })

    return nextConfig
  }

  async startTopicResearchSession(
    topicId: string,
    options?: { durationHours?: number },
  ) {
    await this.ensureInitialized()

    const existingState = await this.getTopicResearchState(topicId)
    const task = await this.ensureTopicResearchTask(topicId, options)
    const result = await this.dispatchTask(task, 'manual')
    const progress = this.getProgress(task.id)
    const active = Boolean(progress?.status === 'active' && this.activeSessions.get(task.id))
    const reportStatus = this.deriveResearchReportStatus(progress, active)
    const fallbackReport = progress
      ? this.buildFallbackResearchReport({
          config: task,
          progress,
          source: 'manual',
          status: reportStatus,
        })
      : null
    const report =
      progress && this.shouldPreferFallbackResearchReport(progress, existingState.report, active, fallbackReport)
        ? fallbackReport
        : existingState.report

    return {
      task,
      progress,
      report:
        report ?? fallbackReport,
      active,
      strategy: {
        ...existingState.strategy,
        currentStageStalls:
          progress?.currentStageStalls ?? existingState.strategy.currentStageStalls,
      },
      result,
    }
  }

  async stopTopicResearchSession(topicId: string) {
    await this.ensureInitialized()

    const taskId = this.topicResearchTaskId(topicId)
    const task = this.getTaskConfig(taskId) ?? (await this.loadStoredTaskConfig(taskId))
    const progress = this.getProgress(taskId)
    const activeSession = this.activeSessions.get(taskId)

    if (activeSession) {
      this.activeSessions.delete(taskId)
    }

    if (progress && (progress.activeSessionId || activeSession || progress.status === 'active')) {
      progress.activeSessionId = null
      progress.status = 'paused'
      progress.completedAt = new Date().toISOString()
      await this.saveProgress(taskId, progress)

      if (task) {
        void this.writeResearchReport({
          config: task,
          progress,
          source: 'manual',
          status: 'paused',
        }).catch((error) => {
          console.error(`[Scheduler] Failed to write paused research report for ${taskId}:`, error)
        })
      }
      void recordTopicResearchStatus({
        topicId,
        stageIndex: progress.currentStage,
        headline: '研究会话手动暂停',
        summary: progress.latestSummary || `本轮持续研究已在第 ${progress.currentStage} 阶段暂停。`,
      }).catch((error) => {
        console.error(`[Scheduler] Failed to persist paused research status memory for ${taskId}:`, error)
      })
    }

    if (task && resolveResearchMode(task) === 'duration') {
      this.removeTask(taskId)
    }

    return this.getTopicResearchState(topicId)
  }

  async getTopicResearchState(topicId: string) {
    await this.ensureInitialized()

    const taskId = this.topicResearchTaskId(topicId)
    const task = this.getTaskConfig(taskId) ?? (await this.loadStoredTaskConfig(taskId))
    let progress = sanitizeResearchProgress(this.getProgress(taskId))
    const report = await loadTopicResearchReport(topicId)
    const strategy = await this.resolveDurationResearchStrategy(task)
    const active = Boolean(
      progress?.status === 'active' &&
        progress.activeSessionId &&
        this.activeSessions.has(taskId),
    )

    if (progress?.activeSessionId && !active && progress.status !== 'active') {
      progress = {
        ...progress,
        activeSessionId: null,
      }
      await this.saveProgress(taskId, progress)
    }

    const recoveredStatus =
      progress?.status === 'failed'
        ? 'failed'
        : progress?.status === 'completed'
          ? 'completed'
          : 'paused'
    const normalizedReport =
      report && !active && report.status === 'running'
        ? await saveTopicResearchReport(
            task && progress
              ? {
                  ...this.buildFallbackResearchReport({
                    config: task,
                    progress,
                    source: report.trigger ?? 'manual',
                    status: recoveredStatus,
                  }),
                  reportId: report.reportId,
                  trigger: report.trigger,
                  startedAt: report.startedAt ?? progress.startedAt ?? new Date().toISOString(),
                  deadlineAt: report.deadlineAt ?? progress.deadlineAt,
                  completedAt:
                    progress.completedAt ?? report.completedAt ?? new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : {
                  ...report,
                  status: recoveredStatus,
                  completedAt: report.completedAt ?? progress?.completedAt ?? new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
          )
        : report
    const reportStatus = this.deriveResearchReportStatus(progress, active)
    const fallbackReport =
      task && progress
        ? this.buildFallbackResearchReport({
            config: task,
            progress,
            source: normalizedReport?.trigger ?? 'manual',
            status: reportStatus,
          })
        : null
    const liveReport =
      task &&
      progress &&
      this.shouldPreferFallbackResearchReport(progress, normalizedReport, active, fallbackReport)
        ? fallbackReport
        : normalizedReport

    return {
      task,
      progress,
      report: liveReport,
      active,
      strategy: {
        ...strategy,
        currentStageStalls: progress?.currentStageStalls ?? 0,
      },
    }
  }
}

export const enhancedTaskScheduler = new EnhancedTaskScheduler()

export const __testing = {
  buildDurationResearchDecision,
  buildHeuristicFallbackOrchestration,
  hasRenderableResearchReport,
  shouldPreferFallbackResearchReportState,
  sanitizeResearchFacingSummary,
  estimateTopicProgressTotalStages,
}
