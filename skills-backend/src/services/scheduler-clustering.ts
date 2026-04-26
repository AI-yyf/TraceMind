/**
 * Enhanced Scheduler - Heuristic Clustering Logic
 *
 * Extracted from enhanced-scheduler.ts for decomposition.
 * Contains paper clustering heuristics and fallback orchestration.
 */

import type { ResearchPipelineDurationDecision as _ResearchPipelineDurationDecision } from './topics/research-pipeline'
import {
  type ResearchCandidatePaper,
  type ResearchNodeAction,
  type ResearchOrchestrationOutput,
  type HeuristicPaperSignal,
  type HeuristicPaperCluster,
  type TopicSpecificClusterFamily,
} from './scheduler-types'
import {
  clipText,
  pickText,
  uniqueStrings,
} from './scheduler-utils'

// ============================================================================
// Heuristic Research Stopwords
// ============================================================================

export const HEURISTIC_RESEARCH_STOPWORDS = new Set([
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

// ============================================================================
// Topic-Specific Cluster Families
// ============================================================================

export const AUTONOMOUS_DRIVING_CLUSTER_FAMILIES: TopicSpecificClusterFamily[] = [
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

// ============================================================================
// Token Processing Utilities
// ============================================================================

export function splitAsciiResearchToken(token: string) {
  return token
    .split(/[-_/]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
}

export function tokenizeResearchText(value: string | null | undefined) {
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

export function toTitleCase(value: string) {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatHeuristicThemeLabel(tokens: string[], fallback: string) {
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

// ============================================================================
// Paper Signal Building
// ============================================================================

export function buildHeuristicPaperSignal(paper: ResearchCandidatePaper): HeuristicPaperSignal {
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

export function paperHeuristicText(paper: ResearchCandidatePaper) {
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

// ============================================================================
// Cluster Classification
// ============================================================================

export function classifyAutonomousDrivingClusterFamily(
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

// ============================================================================
// Cluster Building
// ============================================================================

export function buildTopicSpecificPaperClusters(args: {
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

export function buildHeuristicPaperClusters(args: {
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

export function buildClusterThemeTokens(cluster: HeuristicPaperCluster) {
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

export function pickPrimaryPaperForCluster(cluster: HeuristicPaperCluster) {
  return [...cluster.papers].sort((left, right) => {
    const figureDelta = right.figures.length - left.figures.length
    if (figureDelta !== 0) return figureDelta
    const leftTitle = pickText(left.titleZh, left.titleEn, left.title)
    const rightTitle = pickText(right.titleZh, right.titleEn, right.title)
    return leftTitle.localeCompare(rightTitle)
  })[0]
}

// ============================================================================
// Node Assignment Utilities
// ============================================================================

export function collectExistingNodePaperIds(node: any): string[] {
  return Array.from(
    new Set(
      (Array.isArray(node?.papers) ? node.papers : [])
        .map((entry: any) => entry.paperId ?? entry.paper?.id)
        .filter((paperId: unknown): paperId is string => typeof paperId === 'string' && paperId.trim().length > 0),
    ),
  )
}

export function assignExistingNodesToClusters(existingNodes: any[], clusters: HeuristicPaperCluster[]) {
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

// ============================================================================
// Fallback Orchestration
// ============================================================================

export function buildHeuristicFallbackOrchestration(args: {
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
    const _themeLabel = derivedThemeLabel
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
        : `在 ${stageTitle} 这一时间窗口里，这个节点先把《${pickText(primaryPaper.titleZh, primaryPaper.title)}》作为"${problemLabelZh}"的问题入口保留下来，而不是把单篇论文包装成已经稳定的共识。`
      : useEnglish
        ? `This node groups ${cluster.papers.length} stage-bounded papers around ${problemLabelEn}, so the topic map shows one problem line and its evidence handoff instead of isolated paper cards.`
        : `这个节点把 ${cluster.papers.length} 篇处于同一阶段窗口的论文组织成"${problemLabelZh}"这一条问题线，让主题页看到的是问题演进与证据接力，而不是零散的论文卡片。`
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
        : `新纳入论文更适合继续补强已有的"${problemLabelZh}"节点，让这一阶段窗口内的证据底座更厚。`
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
            : `"${singleProblemLabelZh}"是否应继续作为围绕《${pickText(paper.titleZh, paper.title)}》的单篇窄节点存在，还是下一轮就该优先去补充互证论文后再把它视为稳定节点？`
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
