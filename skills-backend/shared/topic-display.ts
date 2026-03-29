import {
  buildResearchNodesFromStageLedger,
  normalizeResearchNodes,
  resolveMainlineBranchId,
} from './research-graph.ts'

type TopicDisplayBuilderArgs = {
  topicId: string
  nameZh: string
  nameEn: string
  focusLabel?: string
  originPaperId: string
  frontendSummary?: {
    cardSummary?: string
    timelineGuide?: string
    researchBlurb?: string
  }
  topicMemory: Record<string, unknown>
  paperCatalog: Record<string, Record<string, unknown>>
  paperEditorialStore?: Record<string, Record<string, unknown>>
  nodeEditorialStore?: Record<string, Record<string, unknown>>
  topicEditorialEntry?: Record<string, unknown> | null
}

type TopicDisplayCollection = {
  schemaVersion: number
  topics: Array<Record<string, unknown>>
}

综合评述文章
├── 共同问题背景（整合所有论文的问题定义）
├── 方法演进脉络（按时间/逻辑顺序组织方法）
│   ├── 阶段1：基础方法（论文A）
│   ├── 阶段2：改进方法（论文B）
│   └── 阶段3：最新进展（论文C）
├── 实验结果对比（综合对比表）
│   ├── 所有论文的主结果对比
│   ├── 消融实验对比
│   └── 关键结果图对比
├── 关键公式体系（按逻辑关系组织）
│   ├── 基础公式（来自论文A）
│   ├── 改进公式（来自论文B）
│   └── 统一框架（论文C的整合）
└── 综合分析与展望// 分支颜色配置 - 与前端统一
// 主线使用红色 (#dc2626)，其他分支使用以下配色
const BRANCH_COLOR_PALETTE = [
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#dc2626', // red-600 (备用)
  '#db2777', // pink-600
  '#4f46e5', // indigo-600
]

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatDateLabel(value: string) {
  return value ? value.slice(0, 10) : ''
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function hashBranchId(value: string) {
  let hash = 0
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash
}

function colorForBranch(branchId: string, mainlineBranchId?: string) {
  // 主线分支统一使用红色
  if (
    branchId === 'main' ||
    branchId.startsWith('main:') ||
    branchId === mainlineBranchId ||
    (!mainlineBranchId && /:origin$/u.test(branchId))
  ) {
    return '#dc2626' // red-600，与前端主线颜色一致
  }
  // 其他分支按哈希分配颜色
  return BRANCH_COLOR_PALETTE[hashBranchId(branchId) % BRANCH_COLOR_PALETTE.length]
}

function branchStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '活跃'
    case 'candidate':
      return '候选'
    case 'merged':
      return '已汇流'
    case 'resolved':
      return '已收束'
    case 'dormant':
      return '休眠'
    case 'pending-review':
      return '待复核'
    default:
      return '活跃'
  }
}

function nodeStatusLabel(status: string) {
  switch (status) {
    case 'merged':
      return '已汇流'
    case 'no-candidate':
      return '本阶段未推进'
    case 'provisional':
      return '预判下一阶段'
    default:
      return '已推进'
  }
}

function buildProblemLabelMap(problemNodes: unknown) {
  const entries = Array.isArray(problemNodes) ? problemNodes : []
  return new Map(
    entries
      .filter((entry) => asRecord(entry))
      .map((entry) => {
        const record = entry as Record<string, unknown>
        return [
          asString(record.id),
          asString(record.stageTitle, asString(record.question, '研究问题')),
        ] as const
      })
      .filter(([id]) => id.length > 0),
  )
}

function buildBranchMap(branchRegistry: unknown) {
  const entries = Array.isArray(branchRegistry) ? branchRegistry : []
  return new Map(
    entries
      .filter((entry) => asRecord(entry))
      .map((entry) => {
        const record = entry as Record<string, unknown>
        return [asString(record.branchId), record] as const
      })
      .filter(([branchId]) => branchId.length > 0),
  )
}

function getPaperRecord(
  paperId: string,
  paperCatalog: Record<string, Record<string, unknown>>,
  paperEditorialStore?: Record<string, Record<string, unknown>>,
) {
  const catalog = paperCatalog[paperId] ?? {}
  const editorial = paperEditorialStore?.[paperId] ?? {}
  const titleZh = asString(editorial.titleZh, asString(catalog.title, paperId))
  const titleEn = asString(catalog.title, paperId)
  return {
    paperId,
    paperTitleZh: titleZh,
    paperTitleEn: titleEn,
    timelineDigest:
      asString(editorial.timelineDigest) ||
      asString(editorial.cardDigest) ||
      `《${titleZh}》已进入当前研究脉络，等待进一步补全节点解读。`,
    cardDigest:
      asString(editorial.cardDigest) ||
      `《${titleZh}》已经进入当前研究脉络，等待更完整的中文节点内容。`,
    published: asString(catalog.published),
  }
}

function deriveBranchLabel(args: {
  branchId: string
  branch: Record<string, unknown> | null
  mainlineBranchId?: string
  fallbackLabel?: string
}) {
  if (
    args.branchId === args.mainlineBranchId ||
    args.branchId === 'main' ||
    args.branchId.startsWith('main:') ||
    (!args.mainlineBranchId && /:origin$/u.test(args.branchId))
  ) {
    return '主线'
  }

  const explicitLabel = normalizeWhitespace(asString(args.branch?.label, ''))
  if (explicitLabel) return explicitLabel
  if (args.fallbackLabel) return args.fallbackLabel
  return '研究支线'
}

function getNodeWindow(args: {
  stageIndex: number
  sourceBranchIds: string[]
  topicMemory: Record<string, unknown>
}) {
  const stageRunLedger = Array.isArray(args.topicMemory.stageRunLedger)
    ? (args.topicMemory.stageRunLedger as Array<Record<string, unknown>>)
    : []
  const stageRun = stageRunLedger.find((entry) => asNumber(entry.stageIndex, 0) === args.stageIndex)
  if (stageRun) {
    return {
      windowStart: formatDateLabel(asString(stageRun.windowStart, '')),
      windowEnd: formatDateLabel(asString(stageRun.windowEnd, '')),
      windowMonths: Math.max(1, Math.trunc(asNumber(stageRun.windowMonths, 5))),
      summary: asString(stageRun.decisionSummary, ''),
    }
  }

  const stageLedger = Array.isArray(args.topicMemory.stageLedger)
    ? (args.topicMemory.stageLedger as Array<Record<string, unknown>>)
    : []
  const relatedEntries = stageLedger.filter(
    (entry) =>
      asNumber(entry.stageIndex, 0) === args.stageIndex &&
      args.sourceBranchIds.includes(asString(entry.branchId, '')),
  )

  return {
    windowStart:
      relatedEntries
        .map((entry) => formatDateLabel(asString(entry.windowStart, '')))
        .filter(Boolean)
        .sort()[0] ?? '',
    windowEnd:
      relatedEntries
        .map((entry) => formatDateLabel(asString(entry.windowEnd, '')))
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? '',
    windowMonths:
      relatedEntries.reduce(
        (maxValue, entry) => Math.max(maxValue, Math.trunc(asNumber(entry.windowMonths, 0))),
        0,
      ) || 5,
    summary:
      relatedEntries
        .map((entry) => asString(entry.decisionSummary, ''))
        .find((value) => value.length > 0) ?? '',
  }
}

function buildStageColumns(args: TopicDisplayBuilderArgs) {
  const branchMap = buildBranchMap(args.topicMemory.branchRegistry)
  const problemLabelMap = buildProblemLabelMap(args.topicMemory.problemNodes)
  const branchRegistryForMainline = [...branchMap.values()].map((branch) => ({
    branchId: asString(branch.branchId),
    rootProblemNodeId: asString(branch.rootProblemNodeId),
    parentBranchId: asString(branch.parentBranchId, '') || null,
    anchorPaperId: asString(branch.anchorPaperId, args.originPaperId),
    anchorPaperPublishedAt: asString(branch.anchorPaperPublishedAt, ''),
    lastTrackedPaperId: asString(branch.lastTrackedPaperId, args.originPaperId),
    lastTrackedPublishedAt: asString(branch.lastTrackedPublishedAt, ''),
    stageIndex: Math.max(1, Math.trunc(asNumber(branch.stageIndex, 1))),
    activeWindowMonths: Math.max(1, Math.trunc(asNumber(branch.activeWindowMonths, 5))),
    status: asString(branch.status, 'active') as
      | 'active'
      | 'candidate'
      | 'merged'
      | 'dormant'
      | 'resolved'
      | 'pending-review',
    priorityScore: asNumber(branch.priorityScore, 0.5),
    linkedProblemNodeIds: asStringArray(branch.linkedProblemNodeIds),
    mergedIntoBranchId: asString(branch.mergedIntoBranchId, '') || null,
    branchType:
      asString(branch.branchType) === 'transfer' || asString(branch.branchType) === 'merge'
        ? (asString(branch.branchType) as 'transfer' | 'merge')
        : 'direct',
    label: asString(branch.label, '') || undefined,
    summary: asString(branch.summary, '') || undefined,
  }))
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry: branchRegistryForMainline,
  })

  const stageLedger = Array.isArray(args.topicMemory.stageLedger)
    ? (args.topicMemory.stageLedger as Array<Record<string, unknown>>)
    : []
  const researchNodes = normalizeResearchNodes(args.topicMemory.researchNodes)
  const fallbackNodes = buildResearchNodesFromStageLedger({
    topicId: args.topicId,
    stageLedger: stageLedger.map((entry) => ({
      branchId: asString(entry.branchId, ''),
      stageIndex: Math.max(1, Math.trunc(asNumber(entry.stageIndex, 1))),
      windowStart: asString(entry.windowStart, ''),
      windowEnd: asString(entry.windowEnd, ''),
      windowMonths: Math.max(1, Math.trunc(asNumber(entry.windowMonths, 5))),
      anchorPaperId: asString(entry.anchorPaperId, ''),
      candidatePaperIds: asStringArray(entry.candidatePaperIds),
      selectedPaperId: asString(entry.selectedPaperId, '') || null,
      status:
        asString(entry.status) === 'completed' ||
        asString(entry.status) === 'merged' ||
        asString(entry.status) === 'skipped' ||
        asString(entry.status) === 'no-candidate'
          ? (asString(entry.status) as 'completed' | 'merged' | 'skipped' | 'no-candidate')
          : 'planned',
      decisionSummary: asString(entry.decisionSummary, ''),
      mergeEvents: Array.isArray(entry.mergeEvents)
        ? entry.mergeEvents
            .filter((mergeEvent) => asRecord(mergeEvent))
            .map((mergeEvent) => ({
              paperId: asString((mergeEvent as Record<string, unknown>).paperId, ''),
              mergedBranchIds: asStringArray((mergeEvent as Record<string, unknown>).mergedBranchIds),
            }))
        : [],
      builtAt: asString(entry.builtAt, ''),
    })),
    paperRelations: Array.isArray(args.topicMemory.paperRelations)
      ? (args.topicMemory.paperRelations as Array<Record<string, unknown>>).map((relation) => ({
          paperId: asString(relation.paperId, ''),
          nodeId: asString(relation.nodeId, '') || null,
          problemNodeIds: asStringArray(relation.problemNodeIds),
          branchIds: asStringArray(relation.branchIds),
          primaryBranchId: asString(relation.primaryBranchId, mainlineBranchId),
          isMergePaper: relation.isMergePaper === true,
          mergedBranchIds: asStringArray(relation.mergedBranchIds),
          resolvedProblemIds: asStringArray(relation.resolvedProblemIds),
        }))
      : [],
  })
  const displayNodes = (researchNodes.length > 0 ? researchNodes : fallbackNodes).filter(
    (node) => !node.provisional && node.stageIndex > 0,
  )

  const grouped = new Map<number, typeof displayNodes>()
  for (const node of displayNodes) {
    const collection = grouped.get(node.stageIndex) ?? []
    collection.push(node)
    grouped.set(node.stageIndex, collection)
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([stageIndex, nodes]) => {
      const branchCards = nodes.map((node) => {
        const primaryPaperId = node.primaryPaperId
        const primaryPaper = getPaperRecord(primaryPaperId, args.paperCatalog, args.paperEditorialStore)
        const nodeEditorial = asRecord(args.nodeEditorialStore?.[node.nodeId])
        const sourceBranchIds =
          node.sourceBranchIds.length > 0 ? node.sourceBranchIds : [mainlineBranchId]
        const sourceBranchLabels = sourceBranchIds.map((branchId) =>
          deriveBranchLabel({
            branchId,
            branch: branchMap.get(branchId) ?? null,
            mainlineBranchId,
          }),
        )
        const sourceBranchColors = sourceBranchIds.map((branchId) =>
          colorForBranch(branchId, mainlineBranchId),
        )
        const primaryBranchId = sourceBranchIds[0] ?? mainlineBranchId
        const primaryBranchLabel = sourceBranchLabels[0] ?? '主线'
        const mergeFromBranchIds =
          sourceBranchIds.length > 1 ? sourceBranchIds.slice(1) : []
        const window = getNodeWindow({
          stageIndex,
          sourceBranchIds,
          topicMemory: args.topicMemory,
        })
        const problemTags = node.sourceProblemNodeIds
          .map((problemId) => problemLabelMap.get(problemId) ?? problemId)
          .filter(Boolean)

        return {
          nodeId: node.nodeId,
          paperIds: node.paperIds,
          primaryPaperId,
          paperCount: node.paperIds.length,
          sourceBranchIds,
          sourceBranchLabels,
          sourceBranchColors,
          branchId: primaryBranchId,
          branchLabel:
            sourceBranchLabels.length > 1
              ? `${primaryBranchLabel} 等 ${sourceBranchLabels.length} 条线`
              : primaryBranchLabel,
          branchColor: sourceBranchColors[0] ?? colorForBranch(primaryBranchId, mainlineBranchId),
          status: node.status,
          statusLabel: nodeStatusLabel(node.status),
          paperId: primaryPaperId,
          paperTitleZh:
            asString(nodeEditorial?.titleZh, '') || primaryPaper.paperTitleZh,
          paperTitleEn: primaryPaper.paperTitleEn,
          timelineDigest:
            asString(nodeEditorial?.timelineDigest, '') ||
            node.nodeSummary ||
            primaryPaper.timelineDigest,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          windowMonths: window.windowMonths,
          problemTags:
            problemTags.length > 0
              ? problemTags
              : args.frontendSummary?.cardSummary
                ? [args.frontendSummary.cardSummary]
                : [],
          isMergePaper: node.isMergeNode || sourceBranchIds.length > 1,
          mergeFromBranchIds,
        }
      })

      const stageRunLedger = Array.isArray(args.topicMemory.stageRunLedger)
        ? (args.topicMemory.stageRunLedger as Array<Record<string, unknown>>)
        : []
      const stageEntry =
        stageRunLedger.find((entry) => asNumber(entry.stageIndex, 0) === stageIndex) ?? null

      return {
        stageIndex,
        title: `Stage ${String(stageIndex).padStart(2, '0')}`,
        summary:
          asString(stageEntry?.decisionSummary, '') ||
          `这一阶段共有 ${branchCards.length} 个正式节点被提交。`,
        branchCards,
      }
    })
}

function buildBranchPalette(args: TopicDisplayBuilderArgs) {
  const branchMap = buildBranchMap(args.topicMemory.branchRegistry)
  const problemLabelMap = buildProblemLabelMap(args.topicMemory.problemNodes)
  const branchRegistryForMainline = [...branchMap.values()].map((branch) => ({
    branchId: asString(branch.branchId),
    rootProblemNodeId: asString(branch.rootProblemNodeId),
    parentBranchId: asString(branch.parentBranchId, '') || null,
    anchorPaperId: asString(branch.anchorPaperId, args.originPaperId),
    anchorPaperPublishedAt: asString(branch.anchorPaperPublishedAt, ''),
    lastTrackedPaperId: asString(branch.lastTrackedPaperId, args.originPaperId),
    lastTrackedPublishedAt: asString(branch.lastTrackedPublishedAt, ''),
    stageIndex: Math.max(1, Math.trunc(asNumber(branch.stageIndex, 1))),
    activeWindowMonths: Math.max(1, Math.trunc(asNumber(branch.activeWindowMonths, 5))),
    status: asString(branch.status, 'active') as
      | 'active'
      | 'candidate'
      | 'merged'
      | 'dormant'
      | 'resolved'
      | 'pending-review',
    priorityScore: asNumber(branch.priorityScore, 0.5),
    linkedProblemNodeIds: asStringArray(branch.linkedProblemNodeIds),
    mergedIntoBranchId: asString(branch.mergedIntoBranchId, '') || null,
    branchType:
      asString(branch.branchType) === 'transfer' || asString(branch.branchType) === 'merge'
        ? (asString(branch.branchType) as 'transfer' | 'merge')
        : 'direct',
    label: asString(branch.label, '') || undefined,
    summary: asString(branch.summary, '') || undefined,
  }))
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry: branchRegistryForMainline,
  })

  return [...branchMap.values()].map((branch) => {
    const branchId = asString(branch.branchId, '')
    const fallbackProblemLabel = asStringArray(branch.linkedProblemNodeIds)
      .map((problemId) => problemLabelMap.get(problemId) ?? problemId)
      .find(Boolean)
    return {
      branchId,
      branchLabel: deriveBranchLabel({
        branchId,
        branch,
        mainlineBranchId,
        fallbackLabel: fallbackProblemLabel,
      }),
      color: colorForBranch(branchId, mainlineBranchId),
      status: branchStatusLabel(asString(branch.status, 'active')),
    }
  })
}

function buildMergeMarkers(args: TopicDisplayBuilderArgs) {
  const researchNodes = normalizeResearchNodes(args.topicMemory.researchNodes).filter(
    (node) => !node.provisional && node.isMergeNode && node.stageIndex > 0,
  )
  const branchMap = buildBranchMap(args.topicMemory.branchRegistry)
  const branchRegistryForMainline = [...branchMap.values()].map((branch) => ({
    branchId: asString(branch.branchId),
    rootProblemNodeId: asString(branch.rootProblemNodeId),
    parentBranchId: asString(branch.parentBranchId, '') || null,
    anchorPaperId: asString(branch.anchorPaperId, args.originPaperId),
    anchorPaperPublishedAt: asString(branch.anchorPaperPublishedAt, ''),
    lastTrackedPaperId: asString(branch.lastTrackedPaperId, args.originPaperId),
    lastTrackedPublishedAt: asString(branch.lastTrackedPublishedAt, ''),
    stageIndex: Math.max(1, Math.trunc(asNumber(branch.stageIndex, 1))),
    activeWindowMonths: Math.max(1, Math.trunc(asNumber(branch.activeWindowMonths, 5))),
    status: asString(branch.status, 'active') as
      | 'active'
      | 'candidate'
      | 'merged'
      | 'dormant'
      | 'resolved'
      | 'pending-review',
    priorityScore: asNumber(branch.priorityScore, 0.5),
    linkedProblemNodeIds: asStringArray(branch.linkedProblemNodeIds),
    mergedIntoBranchId: asString(branch.mergedIntoBranchId, '') || null,
    branchType:
      asString(branch.branchType) === 'transfer' || asString(branch.branchType) === 'merge'
        ? (asString(branch.branchType) as 'transfer' | 'merge')
        : 'direct',
    label: asString(branch.label, '') || undefined,
    summary: asString(branch.summary, '') || undefined,
  }))
  const mainlineBranchId = resolveMainlineBranchId({
    topicId: args.topicId,
    branchRegistry: branchRegistryForMainline,
  })

  return researchNodes.map((node) => {
    const primaryPaper = getPaperRecord(node.primaryPaperId, args.paperCatalog, args.paperEditorialStore)
    const primaryBranchId = node.sourceBranchIds[0] ?? mainlineBranchId
    return {
      nodeId: node.nodeId,
      paperIds: node.paperIds,
      primaryPaperId: node.primaryPaperId,
      paperTitleZh: primaryPaper.paperTitleZh,
      stageIndex: node.stageIndex,
      branchId: primaryBranchId,
      branchColor: colorForBranch(primaryBranchId, mainlineBranchId),
      mergedBranchIds: node.sourceBranchIds.slice(1),
    }
  })
}

export function createEmptyTopicDisplayCollection(): TopicDisplayCollection {
  return {
    schemaVersion: 2,
    topics: [],
  }
}

function buildNarrativeArticle(args: TopicDisplayBuilderArgs): string {
  const stageColumns = buildStageColumns(args)
  const branchPalette = buildBranchPalette(args)
  const mergeMarkers = buildMergeMarkers(args)
  const originPaper = getPaperRecord(args.originPaperId, args.paperCatalog, args.paperEditorialStore)
  const problemNodes = Array.isArray(args.topicMemory.problemNodes)
    ? (args.topicMemory.problemNodes as Array<Record<string, unknown>>)
    : []

  const nameZh = args.nameZh
  const originYear = originPaper.published.slice(0, 4)
  const originTitle = originPaper.paperTitleZh
  const originWhy =
    asString(args.topicMemory.originWhyThisCounts, '') ||
    asString(args.topicEditorialEntry?.originWhyThisCounts, '') ||
    '该工作首次系统性定义了该领域的核心问题空间。'
  const stageCount = stageColumns.length
  const branchCount = branchPalette.length
  const mergeCount = mergeMarkers.length

  // 获取问题列表
  const questions = problemNodes
    .slice(0, 3)
    .map((p) => asString(p.question, ''))
    .filter(Boolean)

  // 构建文章（提示词风格）
  let article = `【起源界定】\n`
  article += `${nameZh} 主题以 ${originYear} 年发表的《${originTitle}》为学术原点。`
  article += `${originWhy} `
  article += `采用 earliest-representative 筛选标准确立。\n`

  if (stageCount === 0) {
    // 只有起源论文的情况
    article += `\n【当前状态】\n`
    article += `该主题目前仅完成 Origin Paper 收录，尚未执行首次阶段发现流程（Stage Discovery）。`
    article += `等待 paper-tracker 基于起源论文的问题定义，发现下一阶段候选并构建研究时间线。`
  } else {
    // 有演进阶段的情况
    article += `\n【演进概览】\n`
    article += `从起源出发，该主题已构建 ${stageCount} 个正式 Stage。`

    if (branchCount > 1) {
      article += `当前存在 ${branchCount} 条活跃 Branch`
      if (mergeCount > 0) {
        article += `，包含 ${mergeCount} 个 Merge Node（汇流节点）`
      }
      article += `。`
    } else {
      article += `当前沿主路径（Mainline）持续演进。`
    }

    article += ` Branch 状态分布：` +
      `active=${branchPalette.filter(b => b.status === '活跃').length}, ` +
      `candidate=${branchPalette.filter(b => b.status === '候选').length}。\n`

    if (questions.length > 0) {
      article += `\n【开放问题】\n`
      article += `当前 Stage 关注以下核心问题：` +
        questions.map((q) => `「${q}」`).join('、') +
        `。这些问题定义了该主题当前的研究边界与探索方向。`
    }

    article += `\n【方法论说明】\n`
    article += `时间线采用 Stage-First 组织：纵向为时间演进（Stage 1 → Stage N），`
    article += `横向为并行分支（Branch A, B, C...）。`
    article += `红色时间线标识主脉，彩色节点对应分支贡献。`
    article += `Merge Node 表示多分支方法论融合的关键论文。`
  }

  return article
}

export function buildTopicDisplayEntry(args: TopicDisplayBuilderArgs) {
  const stageColumns = buildStageColumns(args)
  const branchPalette = buildBranchPalette(args)
  const mergeMarkers = buildMergeMarkers(args)
  const originPaper = getPaperRecord(args.originPaperId, args.paperCatalog, args.paperEditorialStore)

  return {
    topicId: args.topicId,
    hero: {
      topicId: args.topicId,
      title: args.nameZh,
      subtitle: args.focusLabel || args.nameEn,
      summary:
        asString(args.topicEditorialEntry?.summary, '') ||
        asString(args.topicEditorialEntry?.editorialThesis, '') ||
        asString(args.frontendSummary?.researchBlurb, '') ||
        asString(args.frontendSummary?.cardSummary, '') ||
        '这个主题仍在持续生长，前台只展示已经沉淀下来的研究脉络。',
      originPaperId: args.originPaperId,
      originPaperTitleZh: originPaper.paperTitleZh,
      originPaperTitleEn: originPaper.paperTitleEn,
      stageCount: stageColumns.length,
      activeBranchCount: branchPalette.filter(
        (branch) => branch.status === '活跃' || branch.status === '候选',
      ).length,
      mergeCount: mergeMarkers.length,
      lastBuiltAt: asString(args.topicMemory.lastBuiltAt, ''),
    },
    stageColumns,
    branchPalette,
    mergeMarkers,
    narrativeArticle: buildNarrativeArticle(args),
    timelineLegend: {
      stageLabel: '纵向表示同一层研究阶段，横向并列的是这一层同时成立的多个节点。',
      branchLabel: '不同颜色代表不同分支，同一分支在不同页面保持同色。',
      mergeLabel: '当多个分支最终落到同一节点时，前台只显示一张卡片，并保留来源分支标记。',
      dormantLabel: '如果某条分支本阶段没有正式推进，不会伪造节点，只在后端保留判断痕迹。',
    },
  }
}

export function upsertTopicDisplayEntry(
  collection: TopicDisplayCollection | null | undefined,
  entry: Record<string, unknown>,
) {
  const next =
    collection && Array.isArray(collection.topics)
      ? {
          schemaVersion:
            typeof collection.schemaVersion === 'number' ? collection.schemaVersion : 2,
          topics: [...collection.topics],
        }
      : createEmptyTopicDisplayCollection()

  const topicId = asString(entry.topicId, '')
  const existingIndex = next.topics.findIndex(
    (topic) => asString(asRecord(topic)?.topicId, '') === topicId,
  )

  if (existingIndex >= 0) {
    next.topics[existingIndex] = entry
  } else {
    next.topics.push(entry)
  }

  next.topics.sort((left, right) =>
    asString(asRecord(left)?.topicId, '').localeCompare(asString(asRecord(right)?.topicId, '')),
  )

  return next
}
