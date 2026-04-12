import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import { useCallback } from 'react'

import { RightSidebarShell } from '@/components/topic/RightSidebarShell'
import { TopicGraphSection } from '@/components/topic/TopicGraphSection'
import { ZoteroExportDialog } from '@/components/ZoteroExportDialog'
import {
  TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE,
  isTopicWorkbenchDesktopViewport,
} from '@/components/topic/workbench-layout'
import { usePageScrollRestoration, useReadingWorkspace } from '@/contexts/readingWorkspaceHooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useI18n } from '@/i18n'
import type {
  CitationRef,
  ContextPill,
  EvidencePayload,
  SearchResultItem,
  SuggestedAction,
  TopicGraphNode,
  TopicResearchBrief,
  TopicViewModel,
} from '@/types/alpha'
import { apiGet, apiPost, resolveApiAssetUrl } from '@/utils/api'
import { fetchTopicResearchBrief, primeTopicResearchBrief } from '@/utils/omniRuntimeCache'
import {
  compactTopicSurfaceTitle,
  isTopicSurfaceNoiseText,
  sanitizeTopicSurfaceText,
} from '@/utils/topicPresentation'
import { getStageLocalizedPair, getTopicLocalizedPair } from '@/utils/topicLocalization'
import {
  pickStageBadgeLabel,
  pickStageNarrativeTitle,
  pickStageChronologyLabel,
  looksLikeStageDateRange,
} from '@/utils/topicStagePresentation'
import {
  TOPIC_QUESTION_SEED_EVENT,
  TOPIC_REBUILD_EVENT,
  TOPIC_WORKBENCH_OPEN_EVENT,
} from '@/utils/workbench-events'
import {
  readStageWindowSearchParam,
  withOptionalStageWindowQuery,
  withStageWindowRoute,
} from '@/utils/stageWindow'
import { buildPaperAnchorRoute, resolvePrimaryReadingRouteForPaper } from '@/utils/readingRoutes'

const MAINLINE_COLOR = '#7d1938'
const CARD_W = 176
const CARD_H = 122
const GAP_X = 12
const GAP_Y = 14
const LABEL_W = 148
const PAD = 12
const STAGE_LABEL_W = LABEL_W - 10
const TOPIC_PAGE_STYLE_MARKER: CSSProperties | undefined = undefined
void TOPIC_PAGE_STYLE_MARKER
void [CARD_W, CARD_H, GAP_X, GAP_Y, PAD, STAGE_LABEL_W]

type UiLanguage = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'fr' | 'es' | 'ru'
type Translate = (key: string, fallback?: string) => string
type DisplayNode = {
  nodeId: string
  anchorId: string
  route: string
  stageIndex: number
  paperIds: string[]
  paperTitles: string[]
  title: string
  titleEn: string
  summary: string
  explanation: string
  paperCount: number
  coverImage: string | null
  primaryPaperTitle: string
  primaryPaperId: string
  branchLabel: string
  branchColor: string
  isMergeNode: boolean
  provisional: boolean
  parentNodeIds: string[]
  column: number
  row: number
  laneIndex: number
  side: 'left' | 'center' | 'right'
  emphasis: 'primary' | 'merge' | 'branch'
  isMainline: boolean
}

const anchorDomId = (anchorId: string) => `anchor-${anchorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
const uniqueText = (values: Array<string | null | undefined>, limit = 3) =>
  Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean))).slice(0, limit)
const clipText = (value: string | null | undefined, max = 100) => {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  return !text ? '' : text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`
}

function cleanStageOverview(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return ''

  return text
    .replace(/^这一阶段真正立住的判断，是围绕[「“"]?.+?[」”"]?逐步展开的[:：]\s*/u, '')
    .replace(
      /^The decisive judgment in this stage gathers around ".+?" and unfolds as follows:\s*/iu,
      '',
    )
    .trim()
}

function parseSurfacePaperCountClaim(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return null

  const match = text.match(/([零〇一二两三四五六七八九十\d]+)\s*篇论文/u)
  if (!match?.[1]) return null
  const token = match[1]

  if (/^\d+$/u.test(token)) {
    return Number.parseInt(token, 10)
  }

  const digitMap: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }

  if (token === '十') return 10
  if (token.startsWith('十')) return 10 + (digitMap[token.slice(1)] ?? 0)
  if (token.endsWith('十')) return (digitMap[token.slice(0, -1)] ?? 1) * 10

  const tenIndex = token.indexOf('十')
  if (tenIndex >= 0) {
    return (digitMap[token.slice(0, tenIndex)] ?? 1) * 10 + (digitMap[token.slice(tenIndex + 1)] ?? 0)
  }

  return digitMap[token] ?? null
}

function hasSurfaceNarrativeDrift(value: string | null | undefined, paperCount: number) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return false
  const claimedPaperCount = parseSurfacePaperCountClaim(text)

  if (
    typeof claimedPaperCount === 'number' &&
    paperCount > 0 &&
    claimedPaperCount !== paperCount
  ) {
    return true
  }

  return paperCount <= 1 && /横跨/u.test(text)
}

function isHeuristicSurfaceNoise(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return false

  return /heuristic fit|stage-aligned query overlap|lexical and temporal relevance|reclassified as branch because|does not state an explicit|query overlap/iu.test(
    text,
  )
}

const renderTemplate = (
  template: string,
  variables: Record<string, string | number>,
) =>
  Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )

function densifyNodeColumns(nodes: DisplayNode[]) {
  const orderedColumns = [...new Set(nodes.map((node) => node.column))].sort((left, right) => left - right)
  const columnMap = new Map(orderedColumns.map((value, index) => [value, index + 1]))
  return nodes.map((node) => ({
    ...node,
    column: columnMap.get(node.column) ?? node.column,
  }))
}

function countUniqueDisplayNodePapers(nodes: DisplayNode[]) {
  return new Set(nodes.flatMap((node) => node.paperIds)).size
}

void countUniqueDisplayNodePapers

function isProcessNarrative(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return false

  return isTopicSurfaceNoiseText(text) || /(?:研究已暂停|研究已完成|本轮研究|小时研究|研究循环|候选论文|纳入|内容重建|当前停留|持续检索|回看已有节点|工作台编排|pipeline|research run|candidate papers|admitted|discovered|generated|paused|completed|cycle|deadline|scheduler|stage window|stage-bounded|同一阶段窗口|mapped to|grouped into|节点目前|当前节点|该节点|这个节点|This node|this node|The node|节点级|node-level|论文卡片|paper cards|研究主线|research mainline)/iu.test(
    text,
  )
}

function buildFollowUpPrompt(title: string, t: Translate) {
  return renderTemplate(
    t(
      'topic.followUpPromptTemplate',
      'Place "{title}" back into the current topic mainline: what did it advance, what evidence supports it, and what remains unresolved?',
    ),
    { title },
  )
}

function buildFallbackQuestions(title: string, t: Translate) {
  return [
    renderTemplate(
      t(
        'topic.questionWalkthrough',
        'Walk me through the mainline structure and decisive nodes of "{title}".',
      ),
      { title },
    ),
    t(
      'topic.questionStartingNodes',
      'If I start reading this topic now, which two nodes should I begin with, and why?',
    ),
    t(
      'topic.questionJudgmentDoubts',
      'What are the strongest judgments and doubts in this topic right now?',
    ),
  ]
}

function buildNodeSurfaceSummary(title: string, paperCount: number, t: Translate) {
  return paperCount > 1
    ? renderTemplate(
        t(
          'topic.nodeSummaryMany',
          'This node gathers {count} papers around "{title}" so you can read one problem line instead of a flat paper pile.',
        ),
        { title, count: paperCount },
      )
    : renderTemplate(
        t(
          'topic.nodeSummaryOne',
          'This node uses one decisive paper to open "{title}" clearly before the branch expands further.',
        ),
        { title },
      )
}

function isLowSignalNodeCardText(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return true

  return /(?:并不是单篇论文结论|围绕同一问题形成的一段研究推进|当前节点主要由一篇论文支撑|跨论文比较还没有真正展开|节点目前仍然依赖|仍然依赖单篇论文|当前锚点论文是|把这些论文放进同一个节点|共享几个关键词|后续轮次还要继续核对|该节点当前以《|先说明「|This node currently uses|This node currently groups|The anchor paper is|single-paper conclusion|cross-paper comparison|related papers to mention|summary context|structure plan|节点级|node-level|论文卡片|paper cards|阶段窗口|stage window|mapped to|grouped into|same stage|研究主线|research mainline|问题线|problem line|读者应该|readers should)/iu.test(
    text,
  )
}

function buildNodeCardSummary(args: {
  title: string
  paperCount: number
  summary?: string | null
  digest?: string | null
  explanation?: string | null
  whyNow?: string | null
  t: Translate
}) {
  const candidates = [args.summary, args.digest, args.explanation, args.whyNow]

  for (const candidate of candidates) {
    const cleaned = sanitizeTopicSurfaceText(candidate, 72)
    if (
      cleaned &&
      !isLowSignalNodeCardText(cleaned) &&
      !isHeuristicSurfaceNoise(cleaned) &&
      !hasSurfaceNarrativeDrift(cleaned, args.paperCount)
    ) {
      return cleaned
    }
  }

  return buildNodeSurfaceSummary(args.title, args.paperCount, args.t)
}

function buildStageSurfaceOverview(args: {
  title: string
  trackedPaperCount: number
  mappedPaperCount: number
  pendingPaperCount: number
  nodeCount: number
  nodeTitles: string[]
  candidates: Array<string | null | undefined>
  t: Translate
}) {
  for (const candidate of args.candidates) {
    const cleaned = sanitizeTopicSurfaceText(cleanStageOverview(candidate), 96)
    if (
      cleaned &&
      !/^收拢\s+\d{4}\.\d{2}/u.test(cleaned) &&
      !/^Align\s+\d{4}\.\d{2}/iu.test(cleaned) &&
      !isLowSignalNodeCardText(cleaned) &&
      !hasSurfaceNarrativeDrift(cleaned, args.trackedPaperCount)
    ) {
      return cleaned
    }
  }

  const focusTrail = args.nodeTitles.slice(0, 2).join('、')

  if (args.pendingPaperCount > 0 && args.nodeCount === 0) {
    return renderTemplate(
      args.t(
        'topic.stageOverviewPendingOnly',
        '这一阶段已追踪到 {papers} 篇论文，但它们还没有被归入明确的问题节点，适合继续做节点划分与主支线判断。',
      ),
      {
        papers: args.trackedPaperCount,
      },
    )
  }

  if (args.pendingPaperCount > 0) {
    return renderTemplate(
      args.t(
        'topic.stageOverviewPending',
        '这一阶段目前追踪到 {tracked} 篇论文，其中 {pending} 篇还在等待归入问题节点；已入图的主线先落在「{trail}」。',
      ),
      {
        tracked: args.trackedPaperCount,
        pending: args.pendingPaperCount,
        trail: focusTrail || args.title,
      },
    )
  }

  if (args.trackedPaperCount > 1) {
    return renderTemplate(
      args.t('topic.stageOverviewMany', '这一阶段把 {papers} 篇论文收在 {nodes} 个节点里，重点问题线落在「{trail}」。'),
      {
        papers: args.trackedPaperCount,
        nodes: args.nodeCount,
        trail: focusTrail || args.title,
      },
    )
  }

  return renderTemplate(
    args.t('topic.stageOverviewOne', '这一阶段目前只保留 {papers} 篇论文、{nodes} 个节点，并把「{trail}」作为进入这个时间窗口的起点。'),
    {
      papers: args.trackedPaperCount,
      nodes: args.nodeCount,
      trail: focusTrail || args.title,
    },
  )
}

function findPreferredNodeCover(
  explicitCover: string | null | undefined,
  nodePaperIds: string[],
  paperCoverMap: Map<string, string | null>,
): string | null {
  // Try explicit cover first
  const resolvedExplicit = resolveApiAssetUrl(explicitCover)
  if (resolvedExplicit) return resolvedExplicit

  // Fallback to paper covers from the map
  for (const paperId of nodePaperIds) {
    const cover = paperCoverMap.get(paperId)
    if (cover) return cover
  }

  return null
}

function buildDisplayNodes(viewModel: TopicViewModel, t: Translate): DisplayNode[] {
  // Resolve coverImage paths to proper URLs (handles Windows backslashes and /uploads prefix)
  const paperCoverMap = new Map(
    viewModel.papers.map((paper) => [paper.paperId, resolveApiAssetUrl(paper.coverImage)] as const),
  )
  const paperTitleMap = new Map(
    viewModel.papers.map((paper) => [
      paper.paperId,
      compactTopicSurfaceTitle(paper.title || paper.titleEn || paper.paperId, paper.paperId, 42),
    ] as const),
  )
  const defaultNodeTitle = t('topic.nodeDefaultTitle', 'Research node')

  if (viewModel.graph?.nodes?.length) {
    return densifyNodeColumns(
      viewModel.graph.nodes.map((node: TopicGraphNode) => {
        const title = compactTopicSurfaceTitle(node.title || node.primaryPaperTitle, defaultNodeTitle, 52)
        const paperIds = node.paperIds ?? [node.primaryPaperId].filter(Boolean)

        return {
          nodeId: node.nodeId,
          anchorId: node.anchorId,
          route: node.route,
          stageIndex: node.stageIndex,
          paperIds,
          paperTitles: paperIds
            .map((paperId) => paperTitleMap.get(paperId))
            .filter((title): title is string => Boolean(title)),
          title,
          titleEn: compactTopicSurfaceTitle(
            node.titleEn || node.title || node.primaryPaperTitle,
            node.title || 'Research Node',
            40,
          ),
          summary:
            buildNodeCardSummary({
              title,
              paperCount: node.paperCount,
              summary: node.summary,
              digest: node.cardEditorial?.digest,
              explanation: node.explanation,
              whyNow: node.cardEditorial?.whyNow,
              t,
            }),
          explanation: node.explanation,
          paperCount: node.paperCount,
          coverImage: findPreferredNodeCover(
            node.coverImage || node.coverAsset?.imagePath,
            paperIds,
            paperCoverMap,
          ),
          primaryPaperTitle: node.primaryPaperTitle,
          primaryPaperId: node.primaryPaperId,
          branchLabel: node.cardEditorial?.eyebrow || node.branchLabel,
          branchColor: node.branchColor || MAINLINE_COLOR,
          isMergeNode: node.isMergeNode,
          provisional: node.provisional,
          parentNodeIds: node.parentNodeIds ?? [],
          column: node.layoutHint?.column ?? 1,
          row: node.layoutHint?.row ?? node.stageIndex,
          laneIndex: node.layoutHint?.laneIndex ?? 0,
          side: node.layoutHint?.side ?? 'center',
          emphasis: node.layoutHint?.emphasis ?? (node.isMergeNode ? 'merge' : 'primary'),
          isMainline: node.layoutHint?.isMainline ?? !node.provisional,
        }
      }),
    )
  }
  return densifyNodeColumns(
    viewModel.stages.flatMap((stage) =>
      stage.nodes.map((node, index) => {
        const title = compactTopicSurfaceTitle(node.title || node.primaryPaperTitle, defaultNodeTitle, 52)
        const paperIds = node.paperIds ?? [node.primaryPaperId].filter(Boolean)

        return {
          nodeId: node.nodeId,
          anchorId: node.anchorId,
          route: node.route,
          stageIndex: stage.stageIndex,
          paperIds,
          paperTitles: paperIds
            .map((paperId) => paperTitleMap.get(paperId))
            .filter((title): title is string => Boolean(title)),
          title,
          titleEn: compactTopicSurfaceTitle(
            node.titleEn || node.title || node.primaryPaperTitle,
            node.title || 'Research Node',
            40,
          ),
          summary:
            buildNodeCardSummary({
              title,
              paperCount: node.paperCount,
              summary: node.summary,
              digest: node.editorial.digest,
              explanation: node.explanation,
              whyNow: node.editorial.whyNow,
              t,
            }),
          explanation: node.explanation,
          paperCount: node.paperCount,
          coverImage: findPreferredNodeCover(
            node.coverImage,
            paperIds,
            paperCoverMap,
          ),
          primaryPaperTitle: node.primaryPaperTitle,
          primaryPaperId: node.primaryPaperId,
          branchLabel: node.editorial.eyebrow || node.branchLabel,
          branchColor: node.branchColor || MAINLINE_COLOR,
          isMergeNode: node.isMergeNode,
          provisional: node.provisional,
          parentNodeIds: [],
          column: index + 1,
          row: stage.stageIndex,
          laneIndex: index === 0 ? 0 : index,
          side: index === 0 ? 'center' : index % 2 === 0 ? 'right' : 'left',
          emphasis: index === 0 ? 'primary' : 'branch',
          isMainline: !node.provisional,
        }
      }),
    ),
  )
}

function buildLaneSurfaceDescription(args: {
  laneDescription?: string | null
  laneNodes: DisplayNode[]
  t: Translate
}) {
  const candidates = [
    ...args.laneNodes.map((node) => node.summary),
    ...args.laneNodes.map((node) => node.explanation),
    args.laneDescription,
  ]

  for (const candidate of candidates) {
    const cleaned = sanitizeTopicSurfaceText(candidate, 88)
    if (
      cleaned &&
      !isLowSignalNodeCardText(cleaned) &&
      !isHeuristicSurfaceNoise(cleaned) &&
      !isProcessNarrative(cleaned)
    ) {
      return cleaned
    }
  }

const laneTrail = uniqueText(args.laneNodes.map((node) => node.title), 2)
  if (args.laneNodes.length > 1) {
    return renderTemplate(
      args.t(
        'topic.laneSummaryMany',
        '{trail}',
      ),
      {
        trail: laneTrail.join(' · ') || args.t('topic.nodeDefaultTitle', 'Research node'),
      },
    )
  }

  return laneTrail[0] || args.t('topic.nodeDefaultTitle', 'Research node')
}

function buildDisplayLanes(
  viewModel: TopicViewModel,
  nodes: DisplayNode[],
  language: UiLanguage,
  t: Translate,
) {
  const visibleLaneIndexes = new Set(nodes.map((node) => node.laneIndex))
  const laneBuckets = new Map<number, DisplayNode[]>()

  for (const node of nodes) {
    const current = laneBuckets.get(node.laneIndex) ?? []
    current.push(node)
    laneBuckets.set(node.laneIndex, current)
  }

  if (viewModel.graph?.lanes?.length) {
    const filtered = viewModel.graph.lanes
      .filter((lane) => visibleLaneIndexes.size === 0 || visibleLaneIndexes.has(lane.laneIndex))
      .sort((left, right) => left.laneIndex - right.laneIndex)

    return (filtered.length > 0 ? filtered : viewModel.graph.lanes).map((lane) => {
      const laneNodes = laneBuckets.get(lane.laneIndex) ?? []
      return {
        id: lane.id,
        laneIndex: lane.laneIndex,
        label: language === 'zh' ? lane.label : lane.labelEn || lane.label,
        roleLabel: lane.roleLabel,
        description: buildLaneSurfaceDescription({
          laneDescription: lane.description,
          laneNodes,
          t,
        }),
        periodLabel: lane.periodLabel,
        color: lane.color || MAINLINE_COLOR,
        nodeCount: lane.nodeCount,
        side: lane.side,
        isMainline: lane.isMainline,
      }
    })
  }

  return [...laneBuckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([laneIndex, laneNodes], bucketIndex) => {
      const latestNode = [...laneNodes].sort((left, right) => right.stageIndex - left.stageIndex)[0]
      return {
        id: `lane:${laneIndex}`,
        laneIndex,
        label: language === 'zh' ? latestNode.title : latestNode.titleEn || latestNode.title,
        roleLabel:
          latestNode.isMainline
            ? t('topic.nodeRoleMainline', 'Mainline')
            : `${t('topic.nodeRoleBranch', 'Branch')} ${String(bucketIndex + 1).padStart(2, '0')}`,
        description: clipText(latestNode.summary || latestNode.explanation, 88),
        periodLabel: renderTemplate(t('topic.nodePaperCount', '{count} papers'), {
          count: laneNodes.reduce((count, node) => count + node.paperCount, 0),
        }),
        color: latestNode.branchColor || MAINLINE_COLOR,
        nodeCount: laneNodes.length,
        side: latestNode.side,
        isMainline: latestNode.isMainline,
      }
    })
}

function TopicState({ kind, message, onRetry }: { kind: 'loading' | 'error'; message: string; onRetry?: () => void }) {
  const { t } = useI18n()

  return (
    <main className="px-4 pb-20 pt-8 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[960px] rounded-[28px] border border-black/8 bg-white px-8 py-16 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        {kind === 'loading' ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" /> : <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-2xl text-red-500">!</div>}
        <p className="mt-4 text-sm text-black/56">{message}</p>
        {onRetry ? <button type="button" onClick={onRetry} className="mt-6 rounded-full bg-black px-4 py-2 text-sm text-white transition hover:bg-black/92">{t('common.retry', 'Retry')}</button> : null}
      </div>
    </main>
  )
}

function NodeCard({
  node,
  highlighted,
  language,
  stageWindowMonths,
  chronologyLabel,
  t,
}: {
  node: DisplayNode
  highlighted: boolean
  language: UiLanguage
  stageWindowMonths: number
  chronologyLabel?: string
  t: Translate
}) {
  const title = language === 'zh' ? node.title : node.titleEn || node.title
  const summary = node.summary || node.explanation
  const badgeColor = node.isMergeNode ? '#9c6b2f' : node.branchColor || MAINLINE_COLOR
  const paperTitles = Array.from(
    new Set(node.paperTitles.map((paperTitle) => paperTitle.trim()).filter(Boolean)),
  ).slice(0, 2)
  const paperTrail = paperTitles.map((paperTitle) => clipText(paperTitle, 32)).join(' · ')
  const metaLine = [
    renderTemplate(t('topic.nodePaperCount', '{count} papers'), {
      count: node.paperCount,
    }),
    paperTrail,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Link
      to={withStageWindowRoute(node.route, stageWindowMonths)}
      id={anchorDomId(node.anchorId)}
      aria-label={t('topic.nodeOpenReading', 'Open article')}
      className={`group relative block h-full overflow-hidden rounded-[12px] border transition ${
        highlighted
          ? 'border-[#d1aa5c]/65 shadow-[0_8px_18px_rgba(15,23,42,0.06)]'
          : 'border-black/6 hover:border-black/12'
      }`}
      style={{
        minHeight: '120px',
        position: 'relative',
      }}
    >
      {/* 论文原理图背景 */}
      {node.coverImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${node.coverImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* 半透明遮罩层确保文字可读 */}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: highlighted ? 'rgba(255,248,235,0.85)' : 'rgba(255,255,255,0.82)',
            }}
          />
        </div>
      ) : (
        <div
          className={`absolute inset-0 ${
            highlighted ? 'bg-[#fff8eb]' : 'bg-white hover:bg-[#fdfbf7]'
          }`}
        />
      )}

      {/* 左上角时间标签 */}
      {chronologyLabel ? (
        <div
          className="absolute left-3 top-3 z-10 rounded-[6px] px-2 py-1"
          style={{
            backgroundColor: badgeColor,
            color: '#fff',
          }}
        >
          <span className="text-[11px] font-semibold tabular-nums">{chronologyLabel}</span>
        </div>
      ) : null}

      {/* 内容层 */}
      <div className="relative flex h-full min-h-[120px] flex-col justify-between px-3 py-3 pt-10" style={{ zIndex: 5 }}>
        <div>
          <h3 className="text-[13px] font-semibold leading-[1.3] text-black">{title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-black/60 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
            {clipText(summary, 96)}
          </p>
        </div>

        {metaLine ? (
          <div className="mt-2 text-[10px] leading-4 text-black/40 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1]">
            {metaLine}
          </div>
        ) : null}
      </div>
    </Link>
  )
}

export function TopicPage() {
  const { topicId = '' } = useParams<{ topicId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { t, preference } = useI18n()
  const {
    rememberTrail,
    state: readingWorkspaceState,
  } = useReadingWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<TopicViewModel | null>(null)
  const [researchBrief, setResearchBrief] = useState<TopicResearchBrief | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<EvidencePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return isTopicWorkbenchDesktopViewport(window.innerWidth)
  })
  const [zoteroDialogOpen, setZoteroDialogOpen] = useState(false)
  const highlightedAnchor = searchParams.get('anchor')
  const uiLanguage = preference.primary as UiLanguage
  const workbenchOpen = readingWorkspaceState.workbenchByTopic[topicId]?.open ?? false
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const effectiveStageWindowMonths = viewModel?.stageConfig?.windowMonths ?? requestedStageWindowMonths ?? 1
  const hasFocusAnchor = Boolean(searchParams.get('anchor') || searchParams.get('evidence'))
  const pageShellStyle = useMemo<CSSProperties | undefined>(
    () =>
      isDesktopViewport && workbenchOpen
        ? { paddingRight: `${TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE}px` }
        : undefined,
    [isDesktopViewport, workbenchOpen],
  )
  usePageScrollRestoration(`topic:${topicId}:stage:${effectiveStageWindowMonths}`, {
    skipInitialRestore: hasFocusAnchor,
  })
  const topicTitle = useMemo(() => getTopicLocalizedPair(viewModel?.localization, 'name', preference, viewModel?.title ?? '', viewModel?.titleEn ?? viewModel?.title ?? ''), [preference, viewModel])
  useEffect(() => {
    if (!viewModel) return

    rememberTrail({
      id: `topic:${viewModel.topicId}`,
      kind: 'topic',
      topicId: viewModel.topicId,
      title: topicTitle.primary || viewModel.title,
      route: `${location.pathname}${location.search}`,
    })
  }, [location.pathname, location.search, rememberTrail, topicTitle.primary, viewModel])
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncViewport = () =>
      setIsDesktopViewport(isTopicWorkbenchDesktopViewport(window.innerWidth))

    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])
  const timelineStageByIndex = useMemo(
    () => new Map((viewModel?.timeline?.stages ?? []).map((stage) => [stage.stageIndex, stage])),
    [viewModel],
  )
  const stageSections = useMemo(
    () =>
      (viewModel?.stages ?? []).map((stage) => {
        const title = getStageLocalizedPair(stage.locales, 'name', preference, stage.title, stage.titleEn)
        const timelineStage = timelineStageByIndex.get(stage.stageIndex)
        const fallbackLabel = `${t('topic.stageLabel', 'Stage')} ${stage.stageIndex}`
        const stageRangeLabel =
          (looksLikeStageDateRange(title.primary) ? title.primary : '') ||
          (looksLikeStageDateRange(timelineStage?.timeLabel) ? timelineStage?.timeLabel ?? '' : '')
        const chronologyLabel = stageRangeLabel || pickStageChronologyLabel(timelineStage ?? {})
        const displayTitle = pickStageNarrativeTitle(title.primary) || fallbackLabel

        return {
          stageIndex: stage.stageIndex,
          title,
          chronologyLabel,
          badgeLabel: pickStageBadgeLabel({
            title: stageRangeLabel ? '' : title.primary,
            fallbackLabel,
            ...(timelineStage ?? {}),
          }),
          displayTitle,
          nodeCount: stage.nodes.length,
          paperCount: stage.trackedPaperCount ?? stage.nodes.reduce((count, node) => count + (node.paperCount ?? 0), 0),
          mappedPaperCount: stage.mappedPaperCount ?? stage.nodes.reduce((count, node) => count + (node.paperCount ?? 0), 0),
          pendingPaperCount: stage.unmappedPaperCount ?? 0,
          overview: buildStageSurfaceOverview({
            title: displayTitle || title.primary || stage.title,
            trackedPaperCount: stage.trackedPaperCount ?? stage.nodes.reduce((count, node) => count + (node.paperCount ?? 0), 0),
            mappedPaperCount: stage.mappedPaperCount ?? stage.nodes.reduce((count, node) => count + (node.paperCount ?? 0), 0),
            pendingPaperCount: stage.unmappedPaperCount ?? 0,
            nodeCount: stage.nodes.length,
            nodeTitles: stage.nodes.map((node) =>
              compactTopicSurfaceTitle(
                node.title || node.primaryPaperTitle,
                t('topic.nodeDefaultTitle', 'Research node'),
                28,
              ),
            ),
            candidates: [
              stage.editorial.summary,
              getStageLocalizedPair(
                stage.locales,
                'description',
                preference,
                stage.description,
                stage.description,
              ).primary,
            ],
            t,
          }),
          hasNarrativeTitle: Boolean(displayTitle),
        }
      }),
    [preference, t, timelineStageByIndex, viewModel],
  )
  const displayedStageSections = useMemo(() => {
    const activeStageIndex =
      highlightedAnchor?.startsWith('stage:')
        ? Number(highlightedAnchor.slice('stage:'.length))
        : null
    const filtered = stageSections.filter(
      (stage) =>
        stage.nodeCount > 0 ||
        stage.paperCount > 0 ||
        stage.stageIndex === activeStageIndex,
    )

    return filtered.length > 0 ? filtered : stageSections
  }, [highlightedAnchor, stageSections])
  const displayedStageIndexSet = useMemo(
    () => new Set(displayedStageSections.map((stage) => stage.stageIndex)),
    [displayedStageSections],
  )
  const nodes = useMemo(
    () => (viewModel ? buildDisplayNodes(viewModel, t) : []),
    [t, viewModel],
  )
  const displayedNodes = useMemo(() => {
    const filtered = nodes.filter((node) => displayedStageIndexSet.has(node.stageIndex))

    return filtered.length > 0 ? filtered : nodes
  }, [displayedStageIndexSet, nodes])
  const displayedLanes = useMemo(
    () => (viewModel ? buildDisplayLanes(viewModel, displayedNodes, uiLanguage, t) : []),
    [displayedNodes, t, uiLanguage, viewModel],
  )
  const paperRouteMap = useMemo(() => {
    const entries = new Map<string, string>()

    for (const node of displayedNodes) {
      for (const paperId of node.paperIds) {
        if (!entries.has(paperId)) {
          entries.set(paperId, buildPaperAnchorRoute(node.route, paperId))
        }
      }
    }

    return entries
  }, [displayedNodes])
  const graphStages = useMemo(
    () =>
      displayedStageSections.map((stage) => ({
        stageIndex: stage.stageIndex,
        chronologyLabel:
          stage.chronologyLabel ||
          stage.badgeLabel ||
          `${t('topic.stageLabel', 'Stage')} ${stage.stageIndex}`,
        badgeLabel: stage.badgeLabel,
        displayTitle: stage.displayTitle || stage.badgeLabel,
        overview: stage.overview,
        countsLabel: renderTemplate(
          stage.pendingPaperCount > 0
            ? t('topic.stageWindowStageCountsPending', '{nodes} nodes · {papers} tracked papers · {pending} pending')
            : t('topic.stageWindowStageCounts', '{nodes} nodes · {papers} papers'),
          {
            nodes: stage.nodeCount,
            papers: stage.paperCount,
            pending: stage.pendingPaperCount,
          },
        ),
      })),
    [displayedStageSections, t],
  )
  const suggestedQuestions = useMemo(
    () => {
      const fallbackQuestions = buildFallbackQuestions(topicTitle.primary || viewModel?.title || '', t)
      if (!viewModel?.chatContext.suggestedQuestions.length) return fallbackQuestions
      const cleanedQuestions = viewModel.chatContext.suggestedQuestions.filter(
        (item) => !isTopicSurfaceNoiseText(item),
      )
      return cleanedQuestions.length > 0 ? cleanedQuestions : fallbackQuestions
    },
    [t, topicTitle.primary, viewModel],
  )
  const contextSuggestions = useMemo(
    () =>
      !viewModel
        ? []
        : ([
            ...displayedStageSections.slice(0, 2).map((stage) => ({
              id: `stage:${stage.stageIndex}`,
              kind: 'stage' as const,
              label: stage.displayTitle || stage.badgeLabel,
              description: sanitizeTopicSurfaceText(stage.overview, 96),
              route: withStageWindowRoute(
                `/topic/${viewModel.topicId}?anchor=${encodeURIComponent(`stage:${stage.stageIndex}`)}`,
                effectiveStageWindowMonths,
              ),
              anchorId: `stage:${stage.stageIndex}`,
            })),
            ...displayedNodes.slice(0, 3).map((node) => ({
              id: `node:${node.nodeId}`,
              kind: 'node' as const,
              label: node.title,
              description: sanitizeTopicSurfaceText(node.summary || node.explanation, 96),
              route: withStageWindowRoute(node.route, effectiveStageWindowMonths),
              anchorId: node.anchorId,
            })),
          ] satisfies ContextPill[]),
    [displayedNodes, displayedStageSections, effectiveStageWindowMonths, viewModel],
  )
  const resources = useMemo(
    () =>
      (viewModel?.papers ?? []).slice(0, 6).map((paper) => ({
        id: paper.paperId,
        kind: 'paper' as const,
        title: paper.title,
        subtitle: paper.publishedAt,
        description:
          sanitizeTopicSurfaceText(paper.explanation, 180) ||
          sanitizeTopicSurfaceText(paper.summary, 180),
        route: withStageWindowRoute(
          paperRouteMap.get(paper.paperId) ??
            resolvePrimaryReadingRouteForPaper({
              paperId: paper.paperId,
              route: paper.route,
              anchorId: paper.anchorId,
              topicId: viewModel?.topicId,
            }),
          effectiveStageWindowMonths,
        ),
        anchorId: paper.anchorId,
      })),
    [effectiveStageWindowMonths, paperRouteMap, viewModel],
  )
  useDocumentTitle(topicTitle.primary || t('topic.unavailable', 'Topic'))

  const loadTopic = useCallback(() => {
    setLoading(true)
    setError(null)
    const topicViewPath = withOptionalStageWindowQuery(
      `/api/topics/${topicId}/view-model`,
      requestedStageWindowMonths,
    )

    Promise.all([
      apiGet<TopicViewModel>(topicViewPath),
      fetchTopicResearchBrief(topicId).catch(() => null),
    ])
      .then(([data, brief]) => {
        setViewModel(data)
        setResearchBrief(brief)
        if (brief) {
          primeTopicResearchBrief(brief)
        }
      })
      .catch((nextError) =>
        setError(nextError instanceof Error ? nextError : new Error(String(nextError))),
      )
      .finally(() => setLoading(false))
  }, [requestedStageWindowMonths, topicId])
  useEffect(() => { loadTopic() }, [loadTopic])
  useEffect(() => { const evidenceAnchor = searchParams.get('evidence'); if (!evidenceAnchor) { setSelectedEvidence(null); return } let alive = true; apiGet<EvidencePayload>(`/api/evidence/${encodeURIComponent(evidenceAnchor)}`).then((payload) => { if (alive) setSelectedEvidence(payload) }).catch(() => { if (alive) setSelectedEvidence(null) }); return () => { alive = false } }, [searchParams])
  useEffect(() => { const anchorId = searchParams.get('anchor') || searchParams.get('evidence'); if (!anchorId) return; const element = document.getElementById(anchorDomId(anchorId)); if (!element) return; window.setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120) }, [searchParams, viewModel])
  useEffect(() => { const onRebuild = () => { void apiPost(withOptionalStageWindowQuery(`/api/topics/${topicId}/rebuild`, requestedStageWindowMonths), {}).finally(() => loadTopic()) }; window.addEventListener(TOPIC_REBUILD_EVENT, onRebuild); return () => window.removeEventListener(TOPIC_REBUILD_EVENT, onRebuild) }, [loadTopic, requestedStageWindowMonths, topicId])

  const focusAnchor = (anchorId: string) => { const next = new URLSearchParams(searchParams); next.set('anchor', anchorId); next.set('stageMonths', String(effectiveStageWindowMonths)); next.delete('evidence'); setSearchParams(next, { replace: true }) }
  const openWorkbench = () => window.dispatchEvent(new Event(TOPIC_WORKBENCH_OPEN_EVENT))
  const seedQuestion = (prompt: string) => { openWorkbench(); window.setTimeout(() => window.dispatchEvent(new CustomEvent(TOPIC_QUESTION_SEED_EVENT, { detail: prompt })), 80) }
  const openEvidence = async (anchorId: string) => { const evidence = await apiGet<EvidencePayload>(`/api/evidence/${encodeURIComponent(anchorId)}`); setSelectedEvidence(evidence); const next = new URLSearchParams(searchParams); next.set('evidence', anchorId); next.set('stageMonths', String(effectiveStageWindowMonths)); next.delete('anchor'); setSearchParams(next, { replace: true }) }
  const handleCitation = (citation: CitationRef) => (citation.type === 'figure' || citation.type === 'table' || citation.type === 'formula' || citation.type === 'section') ? void openEvidence(citation.anchorId) : navigate(withStageWindowRoute(citation.route, effectiveStageWindowMonths))
  const handleSearchResult = (item: SearchResultItem) => {
    if (item.anchorId && ['section', 'figure', 'table', 'formula'].includes(item.kind) && item.topicId === topicId) return void openEvidence(item.anchorId)
    if (item.anchorId && item.kind === 'topic' && item.id === topicId) return void focusAnchor(item.anchorId)
    const resolvedRoute =
      item.kind === 'paper'
        ? resolvePrimaryReadingRouteForPaper({
            paperId: item.id,
            route: item.route,
            anchorId: item.anchorId,
            nodeRoute: item.nodeRoute,
            relatedNodes: item.relatedNodes,
            topicId: item.topicId ?? topicId,
          })
        : item.route
    navigate(withStageWindowRoute(resolvedRoute, effectiveStageWindowMonths))
  }
  const handleAction = (action: SuggestedAction) => {
    if (!viewModel) return
    if (action.action === 'navigate' && action.targetId?.startsWith('stage:')) return void focusAnchor(action.targetId)
    if (action.targetId && /^(section|figure|table|formula):/u.test(action.targetId)) return void openEvidence(action.targetId)
    if (action.targetId?.startsWith('node:')) {
      const node = nodes.find((item) => item.nodeId === action.targetId?.replace('node:', ''))
      if (node) return action.action === 'navigate' ? void navigate(withStageWindowRoute(node.route, effectiveStageWindowMonths)) : void seedQuestion(buildFollowUpPrompt(node.title, t))
    }
    if (action.targetId?.startsWith('paper:')) {
      const paper = viewModel.papers.find((item) => item.paperId === action.targetId?.replace('paper:', ''))
      if (paper) {
        const readingRoute =
          paperRouteMap.get(paper.paperId) ??
          resolvePrimaryReadingRouteForPaper({
            paperId: paper.paperId,
            route: paper.route,
            anchorId: paper.anchorId,
            topicId: viewModel.topicId,
          })
        return action.action === 'navigate'
          ? void navigate(withStageWindowRoute(readingRoute, effectiveStageWindowMonths))
          : void seedQuestion(buildFollowUpPrompt(paper.title, t))
      }
    }
    seedQuestion(action.label)
  }

  if (loading) return <TopicState kind="loading" message={t('topic.generating', 'Generating content...')} />
  if (error) return <TopicState kind="error" message={error.message || t('topic.unavailable', 'Topic unavailable')} onRetry={loadTopic} />
  if (!viewModel) return <TopicState kind="error" message={t('topic.unavailable', 'Topic unavailable')} onRetry={loadTopic} />
  if (displayedNodes.length === 0) return <><TopicState kind="loading" message={t('topic.generating', 'Generating content...')} onRetry={loadTopic} /><RightSidebarShell topicId={viewModel.topicId} topicTitle={topicTitle.primary || viewModel.title} researchBrief={researchBrief} suggestedQuestions={suggestedQuestions} selectedEvidence={selectedEvidence} contextSuggestions={contextSuggestions} resources={resources} searchStageWindowMonths={effectiveStageWindowMonths} onOpenCitation={handleCitation} onAction={handleAction} onOpenSearchResult={handleSearchResult} surfaceMode="map" /></>

return (
    <main className="px-4 pb-24 pt-8 md:px-6 xl:px-10" style={pageShellStyle}>
      <div className="mx-auto max-w-[1460px]">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black">
            <ArrowLeft className="h-4 w-4" />
            {t('topic.backHome', 'Back to Home')}
          </Link>
          <button
            onClick={() => setZoteroDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-[10px] border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-black/70 transition hover:bg-black/5 hover:text-black"
          >
            <Upload className="h-4 w-4" />
            {t('zotero.title', 'Export to Zotero')}
          </button>
        </div>
        <header className="mt-5 px-1">
          <div className="max-w-[760px]">
            <h1 className="font-display text-[34px] leading-[1.02] tracking-[-0.05em] text-black md:text-[48px]">
              {topicTitle.primary}
            </h1>
            {topicTitle.secondary && topicTitle.secondary !== topicTitle.primary ? (
              <div className="mt-2 text-[14px] leading-7 text-black/40">{topicTitle.secondary}</div>
            ) : null}
          </div>
        </header>

        <TopicGraphSection
          stages={graphStages}
          lanes={displayedLanes}
          nodes={displayedNodes}
          activeAnchor={highlightedAnchor}
          getStageDomId={anchorDomId}
          onFocusStage={focusAnchor}
          renderNode={(node) => (
            <NodeCard
              key={node.nodeId}
              node={node as DisplayNode}
              highlighted={highlightedAnchor === node.anchorId}
              language={uiLanguage}
              stageWindowMonths={effectiveStageWindowMonths}
              t={t}
            />
          )}
/>
      </div>
      <RightSidebarShell topicId={viewModel.topicId} topicTitle={topicTitle.primary} researchBrief={researchBrief} suggestedQuestions={suggestedQuestions} selectedEvidence={selectedEvidence} contextSuggestions={contextSuggestions} resources={resources} searchStageWindowMonths={effectiveStageWindowMonths} onOpenCitation={handleCitation} onAction={handleAction} onOpenSearchResult={handleSearchResult} surfaceMode="map" />
      <ZoteroExportDialog
        isOpen={zoteroDialogOpen}
        onClose={() => setZoteroDialogOpen(false)}
        topicId={topicId}
        topicName={topicTitle.primary}
      />
    </main>
  )
}

export default TopicPage
