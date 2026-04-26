import fs from 'node:fs'
import path from 'node:path'
import type { TopicDefinition } from '../../../topic-config/schema'

type JsonRecord = Record<string, Record<string, unknown>>

export type CanonicalNodeBlueprint = {
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

const CANONICAL_PAPER_OVERRIDES: Record<string, JsonRecord> = {
  'autonomous-driving': {
    '1511.03791': {
      title: 'DeepDriving: Learning Affordance for Direct Perception in Autonomous Driving',
      titleEn: 'DeepDriving: Learning Affordance for Direct Perception in Autonomous Driving',
      titleZh: 'DeepDriving: Learning Affordance for Direct Perception in Autonomous Driving',
      published: '2015-11-11T00:00:00.000Z',
      summary:
        '把以 affordance 为中心的直接感知明确为一个可解释的中间层，为后续端到端驾驶策略学习搭起了过渡桥梁。',
      explanation:
        '这篇论文始终把感知到规划的接口保持为显式结构，因此在比较后续闭环驾驶系统时，它是一条非常重要的分支参照。',
      authors: ['Chenyi Chen', 'Ari Seff', 'Alberto Kornhauser', 'Jianxiong Xiao'],
    },
    '1604.07316': {
      title: 'End to End Learning for Self-Driving Cars',
      titleEn: 'End to End Learning for Self-Driving Cars',
      titleZh: 'End to End Learning for Self-Driving Cars',
      published: '2016-04-25T00:00:00.000Z',
      summary:
        '它用“直接从像素输入学习转向控制”的方式重新界定了现代端到端自动驾驶问题，并把手工模块栈整体拿掉。',
      explanation:
        '这篇源头论文的重要性在于，它把感知与控制压缩到同一个可训练的策略表面里，后续关于恢复、规划和世界模型的工作都在反复回应这一设定。',
      authors: [
        'Mariusz Bojarski',
        'Davide Del Testa',
        'Daniel Dworakowski',
        'Bernhard Firner',
        'Beat Flepp',
        'Prasoon Goyal',
        'Lawrence D. Jackel',
        'Mathew Monfort',
        'Urs Muller',
        'Jiakai Zhang',
        'Xin Zhang',
        'Jake Zhao',
        'Karol Zieba',
      ],
    },
    '1710.02410': {
      title: 'Conditional Imitation Learning for End-to-End Autonomous Driving',
      titleEn: 'Conditional Imitation Learning for End-to-End Autonomous Driving',
      titleZh: 'Conditional Imitation Learning for End-to-End Autonomous Driving',
      published: '2017-10-06T00:00:00.000Z',
      summary:
        '它把直接驾驶策略进一步扩展到由指令条件驱动的行为选择，让单一模型也能执行与路线相关的决策。',
      explanation:
        '这篇论文打开了一条新分支：让语言式或路线级的引导信号直接进入策略接口，而不再停留在模型外部。',
      authors: ['Felipe Codevilla', 'Antonio M. Lopez', 'Vladlen Koltun', 'Alexey Dosovitskiy'],
    },
    '1912.12294': {
      title: 'Learning by Cheating',
      titleEn: 'Learning by Cheating',
      titleZh: 'Learning by Cheating',
      published: '2019-12-27T00:00:00.000Z',
      summary:
        '它在训练阶段引入特权规划信号，用来稳定端到端驾驶策略，并增强复杂场景下的闭环表现。',
      explanation:
        '这篇论文把研究线从朴素行为克隆推进到带有结构化规划监督的阶段，因此自然成为这个主题里的一个汇合节点。',
      authors: [
        'Alexey Dosovitskiy',
        'Germán Ros',
        'Felipe Codevilla',
        'Antonio Lopez',
        'Vladlen Koltun',
      ],
    },
  },
  agent: {
    '2210.03629': {
      title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
      titleEn: 'ReAct: Synergizing Reasoning and Acting in Language Models',
      titleZh: 'ReAct: Synergizing Reasoning and Acting in Language Models',
      published: '2022-10-07T00:00:00.000Z',
    },
  },
  'transformer-innovation': {
    '1706.03762': {
      title: 'Attention Is All You Need',
      titleEn: 'Attention Is All You Need',
      titleZh: 'Attention Is All You Need',
      published: '2017-06-12T00:00:00.000Z',
    },
  },
  'embodied-vla': {
    '2204.01691': {
      title: 'Do As I Can, Not As I Say: Grounding Language in Robotic Affordances',
      titleEn: 'Do As I Can, Not As I Say: Grounding Language in Robotic Affordances',
      titleZh: 'Do As I Can, Not As I Say: Grounding Language in Robotic Affordances',
      published: '2022-04-04T00:00:00.000Z',
    },
  },
}

const repoRoot = path.resolve(__dirname, '../../../..')

function clipText(value: string | null | undefined, maxLength = 220) {
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

function paperRecord(
  topicId: string,
  paperId: string,
  paperCatalog: JsonRecord,
) {
  return {
    ...(paperCatalog[paperId] ?? {}),
    ...(CANONICAL_PAPER_OVERRIDES[topicId]?.[paperId] ?? {}),
  }
}

function paperTitle(topicId: string, paperId: string, paperCatalog: JsonRecord) {
  const record = paperRecord(topicId, paperId, paperCatalog)
  return (
    pickText(
      typeof record.title === 'string' ? record.title : '',
      typeof record.titleEn === 'string' ? record.titleEn : '',
      paperId,
    ) || paperId
  )
}

function paperSummary(
  topicId: string,
  paperId: string,
  paperCatalog: JsonRecord,
  fallback: string,
) {
  const record = paperRecord(topicId, paperId, paperCatalog)
  return (
    pickText(
      typeof record.summary === 'string' ? record.summary : '',
      typeof record.explanation === 'string' ? record.explanation : '',
      fallback,
    ) || fallback
  )
}

function paperExplanation(
  topicId: string,
  paperId: string,
  paperCatalog: JsonRecord,
  fallback: string,
) {
  const record = paperRecord(topicId, paperId, paperCatalog)
  return (
    pickText(
      typeof record.explanation === 'string' ? record.explanation : '',
      typeof record.summary === 'string' ? record.summary : '',
      fallback,
    ) || fallback
  )
}

function paperCover(
  paperId: string,
  paperAssets: JsonRecord,
) {
  const assets = paperAssets[paperId] ?? {}
  const publicPaperDir = path.join(repoRoot, 'generated-data', 'public', 'papers', paperId)
  if (fs.existsSync(publicPaperDir)) {
    const preferredStaticImage = fs
      .readdirSync(publicPaperDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/iu.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))[0]
    if (preferredStaticImage) {
      return `/papers/${paperId}/${preferredStaticImage}`
    }
  }
  return pickText(typeof assets.coverPath === 'string' ? assets.coverPath : '') || null
}

function buildCanonicalNode(args: {
  topicDefinition: TopicDefinition
  nodeId: string
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  branchId: string
  sourceBranchIds?: string[]
  sourceProblemNodeIds?: string[]
  parentNodeIds?: string[]
  isMergeNode?: boolean
  paperCatalog: JsonRecord
  paperAssets: JsonRecord
}) {
  const { topicDefinition, nodeId, stageIndex, paperIds, primaryPaperId, branchId } = args
  const title = paperTitle(topicDefinition.id, primaryPaperId, args.paperCatalog)
  const summary = paperSummary(
    topicDefinition.id,
    primaryPaperId,
    args.paperCatalog,
    topicDefinition.origin.originWhyThisCounts,
  )
  const explanation = paperExplanation(
    topicDefinition.id,
    primaryPaperId,
    args.paperCatalog,
    topicDefinition.origin.originQuestionDefinition,
  )

  return {
    nodeId,
    stageIndex,
    paperIds,
    primaryPaperId,
    nodeLabel: clipText(title, 72) || 'Research node',
    nodeSubtitle: clipText(summary, 96) || topicDefinition.focusLabel,
    nodeSummary: summary,
    nodeExplanation: explanation,
    coverImage: paperCover(primaryPaperId, args.paperAssets),
    provisional: false,
    isMergeNode: Boolean(args.isMergeNode),
    status: 'canonical',
    branchId,
    sourceBranchIds: args.sourceBranchIds ?? [branchId],
    sourceProblemNodeIds:
      args.sourceProblemNodeIds ?? [`${topicDefinition.id}:problem:${stageIndex}:${primaryPaperId}`],
    parentNodeIds: args.parentNodeIds ?? [],
  } satisfies CanonicalNodeBlueprint
}

export function getCanonicalPaperOverride(topicId: string, paperId: string) {
  return CANONICAL_PAPER_OVERRIDES[topicId]?.[paperId] ?? null
}

export function buildCanonicalOnlyNodeBlueprints(args: {
  topicDefinition: TopicDefinition
  orderedPaperIds: string[]
  paperCatalog: JsonRecord
  paperAssets: JsonRecord
}) {
  const { topicDefinition, orderedPaperIds, paperCatalog, paperAssets } = args
  const [originPaperId, ...restPaperIds] = orderedPaperIds

  if (!originPaperId) {
    return [] as CanonicalNodeBlueprint[]
  }

  const mainlineBranchId = `branch:${topicDefinition.id}:mainline`
  const nodes: CanonicalNodeBlueprint[] = [
    buildCanonicalNode({
      topicDefinition,
      nodeId: `${topicDefinition.id}:stage-0:${originPaperId}`,
      stageIndex: 0,
      paperIds: [originPaperId],
      primaryPaperId: originPaperId,
      branchId: mainlineBranchId,
      sourceProblemNodeIds: [`${topicDefinition.id}:origin-problem`],
      paperCatalog,
      paperAssets,
    }),
  ]

  if (restPaperIds.length === 0) {
    return nodes
  }

  if (restPaperIds.length === 1) {
    nodes.push(
      buildCanonicalNode({
        topicDefinition,
        nodeId: `${topicDefinition.id}:stage-1:${restPaperIds[0]}`,
        stageIndex: 1,
        paperIds: [restPaperIds[0]],
        primaryPaperId: restPaperIds[0],
        branchId: mainlineBranchId,
        parentNodeIds: [nodes[0].nodeId],
        paperCatalog,
        paperAssets,
      }),
    )
    return nodes
  }

  const branchPaperIds = restPaperIds.slice(0, Math.min(2, restPaperIds.length))
  const branchNodes = branchPaperIds.map((paperId, index) =>
    buildCanonicalNode({
      topicDefinition,
      nodeId: `${topicDefinition.id}:stage-1:${paperId}`,
      stageIndex: 1,
      paperIds: [paperId],
      primaryPaperId: paperId,
      branchId: `branch:${topicDefinition.id}:branch-${index + 1}`,
      parentNodeIds: [nodes[0].nodeId],
      paperCatalog,
      paperAssets,
    }),
  )
  nodes.push(...branchNodes)

  const remainingPaperIds = restPaperIds.slice(branchPaperIds.length)
  if (remainingPaperIds.length === 0) {
    return nodes
  }

  const mergePaperIds = Array.from(new Set([...branchPaperIds, ...remainingPaperIds]))
  const mergePrimaryPaperId = remainingPaperIds[remainingPaperIds.length - 1]

  nodes.push(
    buildCanonicalNode({
      topicDefinition,
      nodeId: `${topicDefinition.id}:stage-2:${mergePrimaryPaperId}`,
      stageIndex: 2,
      paperIds: mergePaperIds,
      primaryPaperId: mergePrimaryPaperId,
      branchId: mainlineBranchId,
      sourceBranchIds: [mainlineBranchId, ...branchNodes.map((node) => node.branchId)],
      sourceProblemNodeIds: [
        `${topicDefinition.id}:merge-problem`,
        ...branchNodes.flatMap((node) => node.sourceProblemNodeIds),
      ],
      parentNodeIds: branchNodes.map((node) => node.nodeId),
      isMergeNode: true,
      paperCatalog,
      paperAssets,
    }),
  )

  return nodes
}
