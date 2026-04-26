import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { useCallback } from 'react'

import { RightSidebarShell } from '@/components/topic/RightSidebarShell'
import { TopicClosingSummary } from '@/components/topic/TopicClosingSummary'
import { TopicDashboardPanel } from '@/components/topic/TopicDashboardPanel'
import { TopicGraphSection } from '@/components/topic/TopicGraphSection'
import { ZoteroExportDialog } from '@/components/ZoteroExportDialog'
import { ArticleMarkdown } from '@/components/reading/ArticleMarkdown'
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
  SearchResultItem,
  SuggestedAction,
  TopicGraphNode,
  TopicGraphTimeline,
  TopicResearchBrief,
  TopicViewModel,
} from '@/types/alpha'
import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { apiGet, apiPost, resolveApiAssetUrl } from '@/utils/api'
import {
  assertTopicViewModelContract,
} from '@/utils/contracts'
import { logger } from '@/utils/logger'
import {
  fetchTopicResearchBrief,
  invalidateTopicResearchBrief,
  primeTopicResearchBrief,
} from '@/utils/omniRuntimeCache'
import {
  compactTopicSurfaceTitle,
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
const HIGHLIGHT_COLOR = '#d1aa5c'
const MAX_TOPIC_STAGE_GRAPH_CARDS = 10

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
  figureCount: number
  tableCount: number
  formulaCount: number
  figureGroupCount: number
  evidenceCount: number
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

const renderTemplate = (
  template: string,
  variables: Record<string, string | number>,
) =>
  Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )

function buildFollowUpPrompt(title: string, t: Translate) {
  return renderTemplate(
    t(
      'topic.followUpPromptTemplate',
      'Place "{title}" back into the current topic mainline: what did it advance, what evidence supports it, and what remains unresolved?',
    ),
    { title },
  )
}

function looksLikeOpaqueTopicNodeTitle(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return true
  if (/^(?:\d{4}\.\d{4,5}(?:v\d+)?)$/u.test(normalized)) return true
  if (/^(?:起源节点|研究节点|node)$/iu.test(normalized)) return true
  return false
}

function resolveReadableTopicNodeTitle(
  nodeTitle: string | null | undefined,
  primaryPaperTitle: string | null | undefined,
  fallbackId: string,
  maxLength: number,
) {
  const primaryTitle = primaryPaperTitle?.trim() ?? ''
  const preferredTitle =
    looksLikeOpaqueTopicNodeTitle(nodeTitle) && primaryTitle
      ? primaryTitle
      : nodeTitle || primaryTitle || fallbackId

  return compactTopicSurfaceTitle(
    preferredTitle,
    compactTopicSurfaceTitle(primaryTitle || nodeTitle || fallbackId, fallbackId, maxLength),
    maxLength,
  )
}


function buildDisplayNodes(viewModel: TopicViewModel): DisplayNode[] {
  const paperTitleMap = new Map(
    viewModel.papers.map((paper) => [
      paper.paperId,
      compactTopicSurfaceTitle(paper.title || paper.titleEn || paper.paperId, paper.paperId, 42),
    ] as const),
  )

  if (viewModel.graph.nodes.length === 0) {
    return []
  }

  return viewModel.graph.nodes.map((node: TopicGraphNode) => {
    const laneIndex = Number.isFinite(node.layoutHint?.laneIndex) ? node.layoutHint.laneIndex : 0
    const resolvedColumn = Number.isFinite(node.layoutHint?.column)
      ? node.layoutHint.column
      : laneIndex
    const resolvedRow = Number.isFinite(node.layoutHint?.row) ? node.layoutHint.row : 1

    const paperIds = node.paperIds.length > 0 ? node.paperIds : [node.primaryPaperId]
    const title = resolveReadableTopicNodeTitle(
      node.title,
      node.primaryPaperTitle,
      node.primaryPaperId || node.nodeId,
      52,
    )
    const titleEn = resolveReadableTopicNodeTitle(
      node.titleEn || node.title,
      node.primaryPaperTitle,
      node.primaryPaperId || node.nodeId,
      40,
    )

    return {
      nodeId: node.nodeId,
      anchorId: node.anchorId,
      route: node.route,
      stageIndex: node.stageIndex,
      paperIds,
      paperTitles: paperIds
        .map((paperId) => paperTitleMap.get(paperId))
        .filter((entry): entry is string => Boolean(entry)),
      title,
      titleEn,
      summary: node.summary,
      explanation: node.explanation,
      paperCount: node.paperCount,
      figureCount: node.figureCount ?? 0,
      tableCount: node.tableCount ?? 0,
      formulaCount: node.formulaCount ?? 0,
      figureGroupCount: node.figureGroupCount ?? 0,
      evidenceCount: node.evidenceCount ?? 0,
      coverImage: resolveApiAssetUrl(node.coverImage || node.coverAsset?.imagePath),
      primaryPaperTitle: node.primaryPaperTitle,
      primaryPaperId: node.primaryPaperId,
      branchLabel: node.branchLabel,
      branchColor: node.branchColor || MAINLINE_COLOR,
      isMergeNode: node.isMergeNode,
      provisional: node.provisional,
      parentNodeIds: node.parentNodeIds ?? [],
      column: resolvedColumn,
      row: resolvedRow,
      laneIndex,
      side: node.layoutHint?.side ?? 'center',
      emphasis: node.layoutHint?.emphasis ?? 'branch',
      isMainline: node.layoutHint?.isMainline ?? laneIndex === 0,
    }
  })
}

function limitDisplayNodesPerStage(
  nodes: DisplayNode[],
  activeAnchor: string | null,
  maxNodesPerStage = MAX_TOPIC_STAGE_GRAPH_CARDS,
) {
  if (maxNodesPerStage <= 0) {
    return {
      nodes,
      hiddenCountByStage: new Map<number, number>(),
    }
  }

  const grouped = new Map<number, DisplayNode[]>()

  for (const node of nodes) {
    const current = grouped.get(node.stageIndex) ?? []
    current.push(node)
    grouped.set(node.stageIndex, current)
  }

  const limitedNodes: DisplayNode[] = []
  const hiddenCountByStage = new Map<number, number>()

  for (const [stageIndex, stageNodes] of grouped.entries()) {
    if (stageNodes.length <= maxNodesPerStage) {
      limitedNodes.push(...stageNodes)
      continue
    }

    const selectedNodes = stageNodes.slice(0, maxNodesPerStage)
    const activeNodeIndex = activeAnchor
      ? stageNodes.findIndex((node) => node.anchorId === activeAnchor)
      : -1

    if (activeNodeIndex >= maxNodesPerStage) {
      const activeNode = stageNodes[activeNodeIndex]
      let replaceIndex = selectedNodes.length - 1
      for (let index = selectedNodes.length - 1; index >= 0; index -= 1) {
        const candidate = selectedNodes[index]
        if (!candidate.isMainline && !candidate.isMergeNode) {
          replaceIndex = index
          break
        }
      }

      selectedNodes[Math.max(0, replaceIndex)] = activeNode
    }

    limitedNodes.push(...selectedNodes)
    hiddenCountByStage.set(stageIndex, Math.max(0, stageNodes.length - selectedNodes.length))
  }

  return {
    nodes: limitedNodes,
    hiddenCountByStage,
  }
}

function buildTopicDashboardData(args: {
  viewModel: TopicViewModel
  displayedNodes: DisplayNode[]
  topicLeadParagraphs: string[]
  closingParagraphs: string[]
}): TopicDashboardData {
  const { viewModel, displayedNodes, topicLeadParagraphs, closingParagraphs } = args
  const papers = [...viewModel.papers].sort(
    (left, right) => +new Date(left.publishedAt) - +new Date(right.publishedAt),
  )
  const pendingPapers = [...viewModel.unmappedPapers].sort((left, right) => {
    const leftStage = left.stageIndex ?? Number.MAX_SAFE_INTEGER
    const rightStage = right.stageIndex ?? Number.MAX_SAFE_INTEGER
    if (leftStage !== rightStage) return leftStage - rightStage
    return +new Date(left.publishedAt) - +new Date(right.publishedAt)
  })
  const researchThreads = displayedNodes.slice(0, 4).map((node) => ({
    stageIndex: node.stageIndex,
    nodeId: node.nodeId,
    nodeTitle: node.title,
    thesis: clipText(node.summary || node.explanation, 180),
    paperCount: node.paperCount,
    keyPaperTitle: node.primaryPaperTitle,
    isMilestone: node.isMergeNode || node.emphasis === 'primary',
  }))
  const methodEvolution = papers.slice(0, 4).map((paper) => {
    const publishedYear = Number.isFinite(new Date(paper.publishedAt).getUTCFullYear())
      ? new Date(paper.publishedAt).getUTCFullYear()
      : new Date().getUTCFullYear()
    const citationCount = paper.citationCount ?? 0

    return {
      year: publishedYear,
      methodName: compactTopicSurfaceTitle(paper.title || paper.titleEn || paper.paperId, paper.paperId, 46),
      paperId: paper.paperId,
      paperTitle: paper.title,
      contribution: clipText(paper.explanation || paper.summary, 180),
      impact: citationCount >= 100 ? 'high' as const : citationCount >= 25 ? 'medium' as const : 'low' as const,
    }
  })
  const authorMap = new Map<string, {
    name: string
    paperCount: number
    citationCount: number
    keyPapers: string[]
    researchFocus: string[]
  }>()

  for (const paper of papers) {
    for (const author of paper.authors) {
      const normalizedName = author.trim()
      if (!normalizedName) continue

      const current = authorMap.get(normalizedName) ?? {
        name: normalizedName,
        paperCount: 0,
        citationCount: 0,
        keyPapers: [],
        researchFocus: [],
      }
      current.paperCount += 1
      current.citationCount += paper.citationCount ?? 0
      if (!current.keyPapers.includes(paper.title)) current.keyPapers.push(paper.title)
      const focusSeed = clipText(paper.summary || paper.explanation, 72)
      if (focusSeed && !current.researchFocus.includes(focusSeed)) current.researchFocus.push(focusSeed)
      authorMap.set(normalizedName, current)
    }
  }

  const activeAuthors = [...authorMap.values()]
    .sort(
      (left, right) =>
        right.paperCount - left.paperCount ||
        right.citationCount - left.citationCount ||
        left.name.localeCompare(right.name),
    )
    .slice(0, 6)

  const publicationYears = papers
    .map((paper) => new Date(paper.publishedAt).getUTCFullYear())
    .filter((value) => Number.isFinite(value))
  const minYear = publicationYears.length > 0 ? Math.min(...publicationYears) : null
  const maxYear = publicationYears.length > 0 ? Math.max(...publicationYears) : null
  const citationCoverage =
    papers.length > 0
      ? papers.filter((paper) => paper.citationCount != null).length / papers.length
      : 0

  return {
    topicId: viewModel.topicId,
    topicTitle: viewModel.title,
    researchThreads,
    methodEvolution,
    activeAuthors,
    stats: {
      totalPapers: viewModel.papers.length,
      mappedPapers: viewModel.stats.mappedPaperCount,
      pendingPapers: viewModel.unmappedPapers.length,
      totalNodes: viewModel.stats.nodeCount,
      totalStages: viewModel.stats.stageCount,
      mappedStages: viewModel.stages.filter((stage) => stage.nodes.length > 0 || stage.mappedPaperCount > 0).length,
      timeSpanYears: minYear != null && maxYear != null ? Math.max(0, maxYear - minYear) : 0,
      avgPapersPerNode:
        viewModel.stats.nodeCount > 0 ? viewModel.stats.mappedPaperCount / viewModel.stats.nodeCount : 0,
      citationCoverage,
    },
    keyInsights: uniqueText([
      viewModel.summary,
      ...topicLeadParagraphs,
      ...displayedNodes.map((node) => node.summary),
      ...closingParagraphs,
    ], 3),
    trends: {
      emergingTopics: uniqueText(displayedNodes.map((node) => node.title), 4),
      decliningTopics: [],
      methodShifts: uniqueText(viewModel.stages.map((stage) => stage.editorial.summary), 4),
    },
    pendingPapers: pendingPapers.map((paper) => ({
      paperId: paper.paperId,
      title: paper.title,
      publishedAt: paper.publishedAt,
      stageIndex: paper.stageIndex,
      stageLabel: paper.stageLabel,
      summary: paper.summary,
      route: paper.route,
    })),
  }
}

function buildDisplayLanes(
  viewModel: TopicViewModel,
  language: UiLanguage,
) {
  const visibleLaneIndexes = new Set(viewModel.graph.nodes.map((node) => node.layoutHint.laneIndex))

  if (viewModel.graph.lanes.length > 0) {
    const filtered = viewModel.graph.lanes
      .filter((lane) => visibleLaneIndexes.size === 0 || visibleLaneIndexes.has(lane.laneIndex))
      .sort((left, right) => {
        if (left.isMainline !== right.isMainline) return left.isMainline ? -1 : 1

        const leftBranchIndex = left.branchIndex ?? Number.MAX_SAFE_INTEGER
        const rightBranchIndex = right.branchIndex ?? Number.MAX_SAFE_INTEGER
        if (leftBranchIndex !== rightBranchIndex) return leftBranchIndex - rightBranchIndex

        return left.laneIndex - right.laneIndex
      })

    return filtered.map((lane) => {
      return {
        id: lane.id,
        laneIndex: lane.laneIndex,
        branchIndex: lane.branchIndex,
        label: language === 'zh' ? lane.label : lane.labelEn || lane.label,
        legendLabel:
          language === 'zh'
            ? lane.legendLabel || `${lane.roleLabel} ${lane.label}`.trim()
            : lane.legendLabelEn || `${lane.roleLabel} ${lane.labelEn || lane.label}`.trim(),
        roleLabel: lane.roleLabel,
        description: lane.description,
        periodLabel: lane.periodLabel,
        color: lane.color || MAINLINE_COLOR,
        nodeCount: lane.nodeCount,
        side: lane.side,
        isMainline: lane.isMainline,
        timelineId: lane.timelineId,
      }
    })
  }

  return []
}

function buildDisplayTimelines(viewModel: TopicViewModel): TopicGraphTimeline[] {
  // Use backend-provided timelines if available
  if (viewModel.graph.timelines && viewModel.graph.timelines.length > 0) {
    return viewModel.graph.timelines
  }

  // Otherwise, derive timelines from lanes
  const lanes = viewModel.graph.lanes
  if (lanes.length === 0) return []

  // Group lanes by branch index or create single timeline
  const laneGroups = new Map<number | string, typeof lanes>()

  for (const lane of lanes) {
    const key = lane.branchIndex ?? 'main'
    const group = laneGroups.get(key) ?? []
    group.push(lane)
    laneGroups.set(key, group)
  }

  // Create timeline for each group
  return Array.from(laneGroups.entries()).map(([key, groupLanes], index) => {
    const laneIndexes = groupLanes.map((l) => l.laneIndex).sort((a, b) => a - b)
    const isPrimary = groupLanes.some((l) => l.isMainline)
    const primaryLane = groupLanes.find((l) => l.isMainline) ?? groupLanes[0]

    return {
      timelineId: typeof key === 'string' ? key : `branch-${key}`,
      label: primaryLane.label,
      labelEn: primaryLane.labelEn,
      color: primaryLane.color || MAINLINE_COLOR,
      isPrimary,
      laneRange: [Math.min(...laneIndexes), Math.max(...laneIndexes)] as [number, number],
      periodLabel: primaryLane.periodLabel,
      order: isPrimary ? 0 : index,
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
  t,
}: {
  node: DisplayNode
  highlighted: boolean
  language: UiLanguage
  stageWindowMonths: number
  t: Translate
}) {
  const title = language === 'zh' ? node.title : node.titleEn || node.title
  const summary = node.summary || node.explanation
  const nodeTone = node.branchColor || MAINLINE_COLOR
  const cueLabel = node.isMergeNode
    ? t('topic.nodeCueMerge', 'Merge')
    : node.isMainline
      ? t('topic.nodeCueMainline', 'Mainline')
      : t('topic.nodeCueBranch', 'Branch')
  const cueDetail = node.isMergeNode
    ? `${Math.max(node.parentNodeIds.length, 2)} inputs`
    : `${t('topic.nodeCueLane', 'Lane')} ${node.laneIndex}`
  const evidenceBadges = [
    {
      key: 'figures',
      label: t('topic.nodeBadgeFigures', 'Fig'),
      value: node.figureCount,
    },
    {
      key: 'tables',
      label: t('topic.nodeBadgeTables', 'Tbl'),
      value: node.tableCount,
    },
    {
      key: 'formulas',
      label: t('topic.nodeBadgeFormulas', 'Eq'),
      value: node.formulaCount,
    },
    {
      key: 'figureGroups',
      label: t('topic.nodeBadgeFigureGroups', 'Groups'),
      value: node.figureGroupCount ?? 0,
    },
  ].filter((badge) => badge.value > 0)

  return (
    <Link
      to={withStageWindowRoute(node.route, stageWindowMonths)}
      target="_blank"
      rel="noopener noreferrer"
      id={anchorDomId(node.anchorId)}
      aria-label={t('topic.nodeOpenReading', 'Open article')}
      className="group relative block h-full overflow-hidden transition-all duration-200 hover:shadow-lg"
      style={{
        minHeight: '170px',
        borderRadius: '18px',
        border: highlighted
          ? `2px solid ${HIGHLIGHT_COLOR}`
          : '1px solid rgba(0,0,0,0.06)',
        boxShadow: highlighted
          ? '0 10px 24px rgba(15,23,42,0.08)'
          : '0 2px 8px rgba(15,23,42,0.04)',
        transform: highlighted ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {node.coverImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          style={{
            backgroundImage: `url(${node.coverImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div
            className="absolute inset-0 transition-colors duration-200"
            style={{
              backgroundColor: highlighted
                ? 'rgba(255,248,235,0.92)'
                : 'rgba(255,255,255,0.88)',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0 transition-colors duration-200"
          style={{
            backgroundColor: highlighted ? '#fff8eb' : '#ffffff',
          }}
        />
      )}

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ backgroundColor: 'rgba(255,255,255,0.45)' }}
      />

      <div className="relative flex h-full flex-col justify-between px-4 py-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{
                backgroundColor: `${nodeTone}14`,
                color: nodeTone,
              }}
            >
              {cueLabel}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-black/40">{cueDetail}</span>
          </div>
          <h3
            className="font-semibold leading-snug text-black"
            style={{ fontSize: '15px' }}
          >
            {title}
          </h3>
          <p
            className="mt-2 text-black/60 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
            style={{ fontSize: '12px', lineHeight: '1.65' }}
          >
            {clipText(summary, 72)}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: highlighted
                ? 'rgba(209,170,92,0.15)'
                : 'rgba(125,25,56,0.08)',
              color: highlighted ? HIGHLIGHT_COLOR : MAINLINE_COLOR,
            }}
          >
            {t('topic.nodeBadgePapers', 'Papers')} {node.paperCount}
          </span>
          {evidenceBadges.map((badge) => (
            <span
              key={badge.key}
              className="inline-flex items-center rounded-full border border-black/8 bg-white/92 px-2 py-0.5 text-[10px] font-medium text-black/54"
            >
              {badge.label} {badge.value}
            </span>
          ))}
          {node.evidenceCount > 0 ? (
            <span className="text-[10px] text-black/42">
              {t('topic.nodeEvidenceSummary', '{count} evidence signals').replace(
                '{count}',
                String(node.evidenceCount),
              )}
            </span>
          ) : null}
        </div>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [isDownloadingReferences, setIsDownloadingReferences] = useState(false)
  const [referenceDownloadProgress, setReferenceDownloadProgress] = useState(0)
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return isTopicWorkbenchDesktopViewport(window.innerWidth)
  })
  const [zoteroDialogOpen, setZoteroDialogOpen] = useState(false)
  const downloadMountedRef = useRef(true)
  const highlightedAnchor = searchParams.get('anchor')
  const uiLanguage = preference.primary as UiLanguage
  const workbenchOpen = readingWorkspaceState.workbenchByTopic[topicId]?.open ?? false
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const effectiveStageWindowMonths = viewModel?.stageConfig?.windowMonths ?? requestedStageWindowMonths ?? 1
  const hasFocusAnchor = Boolean(searchParams.get('anchor') || searchParams.get('evidence'))
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
    downloadMountedRef.current = true
    return () => {
      downloadMountedRef.current = false
    }
  }, [])
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
          overview: stage.editorial.summary,
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
    () => (viewModel ? buildDisplayNodes(viewModel) : []),
    [viewModel],
  )
  const { nodes: displayedNodes, hiddenCountByStage } = useMemo(() => {
    const filtered = nodes.filter((node) => displayedStageIndexSet.has(node.stageIndex))
    const visibleNodes = filtered.length > 0 ? filtered : nodes

    return limitDisplayNodesPerStage(visibleNodes, highlightedAnchor)
  }, [displayedStageIndexSet, highlightedAnchor, nodes])
  const displayedLaneIndexSet = useMemo(
    () => new Set(displayedNodes.map((node) => node.laneIndex)),
    [displayedNodes],
  )
  const displayedLanes = useMemo(() => {
    const lanes = viewModel ? buildDisplayLanes(viewModel, uiLanguage) : []
    const filtered = lanes.filter(
      (lane) => displayedLaneIndexSet.size === 0 || displayedLaneIndexSet.has(lane.laneIndex),
    )

    return filtered.length > 0 ? filtered : lanes
  }, [displayedLaneIndexSet, uiLanguage, viewModel])
  const displayedTimelines = useMemo(
    () => (viewModel ? buildDisplayTimelines(viewModel) : []),
    [viewModel],
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
      displayedStageSections.map((stage) => {
        const hiddenNodeCount = hiddenCountByStage.get(stage.stageIndex) ?? 0
        const visibleNodeCount = Math.max(0, stage.nodeCount - hiddenNodeCount)
        const countsTemplate =
          hiddenNodeCount > 0
            ? stage.pendingPaperCount > 0
              ? t(
                  'topic.stageWindowStageCountsPendingCapped',
                  '{shown}/{total} nodes shown | {papers} tracked papers | {pending} pending',
                )
              : t(
                  'topic.stageWindowStageCountsCapped',
                  '{shown}/{total} nodes shown | {papers} papers',
                )
            : stage.pendingPaperCount > 0
              ? t(
                  'topic.stageWindowStageCountsPending',
                  '{nodes} nodes | {papers} tracked papers | {pending} pending',
                )
              : t('topic.stageWindowStageCounts', '{nodes} nodes | {papers} papers')

        return {
          stageIndex: stage.stageIndex,
          chronologyLabel:
            stage.chronologyLabel ||
            stage.badgeLabel ||
            `${t('topic.stageLabel', 'Stage')} ${stage.stageIndex}`,
          badgeLabel: stage.badgeLabel,
          displayTitle: stage.displayTitle || stage.badgeLabel,
          overview: stage.overview,
          countsLabel: renderTemplate(countsTemplate, {
            nodes: stage.nodeCount,
            shown: visibleNodeCount,
            total: stage.nodeCount,
            papers: stage.paperCount,
            pending: stage.pendingPaperCount,
          }),
        }
      }),
    [displayedStageSections, hiddenCountByStage, t],
  )
  const suggestedQuestions = useMemo(
    () => {
      if (!viewModel?.chatContext.suggestedQuestions.length) return []
      return viewModel.chatContext.suggestedQuestions
    },
    [viewModel],
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
      (viewModel?.resources ?? []).map((resource) => ({
        id: resource.id,
        kind: resource.kind,
        title: resource.title,
        subtitle: resource.subtitle,
        description: resource.description,
        route: withStageWindowRoute(
          resource.route,
          effectiveStageWindowMonths,
        ),
        anchorId: resource.anchorId,
      })),
    [effectiveStageWindowMonths, viewModel],
  )
  const topicReferences = useMemo(
    () =>
      (viewModel?.papers ?? []).map((paper) => ({
        paperId: paper.paperId,
        title: paper.title,
        titleEn: paper.titleEn,
        publishedAt: paper.publishedAt,
        authors: paper.authors,
        citationCount: paper.citationCount,
        originalUrl: paper.originalUrl,
        pdfUrl: paper.pdfUrl,
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
      })),
    [effectiveStageWindowMonths, paperRouteMap, viewModel],
  )
  const downloadableTopicReferences = useMemo(
    () => topicReferences.filter((entry) => Boolean(entry.pdfUrl)),
    [topicReferences],
  )
  const selectedTopicDownloadReferences = useMemo(
    () => downloadableTopicReferences.filter((entry) => selectedReferenceIds.includes(entry.paperId)),
    [downloadableTopicReferences, selectedReferenceIds],
  )
  useEffect(() => {
    setSelectedReferenceIds(downloadableTopicReferences.map((entry) => entry.paperId))
  }, [downloadableTopicReferences, topicId])
  const downloadSelectedReferences = useCallback(async () => {
    if (selectedTopicDownloadReferences.length === 0) return

    setIsDownloadingReferences(true)
    setReferenceDownloadProgress(0)

    try {
      const zip = new JSZip()
      const total = selectedTopicDownloadReferences.length
      let completed = 0
      const failedPapers: string[] = []

      for (const entry of selectedTopicDownloadReferences) {
        try {
          const response = await fetch(`/api/pdf/proxy/${entry.paperId}`)
          if (!response.ok) {
            throw new Error(`Proxy fetch failed: ${response.status}`)
          }

          const blob = await response.blob()
          const safeTitle = entry.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
          zip.file(`${safeTitle}.pdf`, blob)
        } catch (error) {
          logger.error('TopicPage', `Failed to fetch PDF: ${entry.title}`, error)
          failedPapers.push(entry.title)
        }

        completed += 1
        if (downloadMountedRef.current) {
          setReferenceDownloadProgress(Math.round((completed / total) * 100))
        }
      }

      if (!downloadMountedRef.current) return

      const content = await zip.generateAsync({ type: 'blob' })
      const safeTopicTitle = (topicTitle.primary || viewModel?.title || 'topic')
        .replace(/[<>:"/\\|?*]/g, '_')
        .slice(0, 60)
      saveAs(content, `${safeTopicTitle}-papers.zip`)

      if (failedPapers.length > 0) {
        logger.warn('TopicPage', `Failed to download ${failedPapers.length} papers: ${failedPapers.join(', ')}`)
      }
    } catch (error) {
      logger.error('TopicPage', 'Failed to create ZIP', error)
    } finally {
      if (downloadMountedRef.current) {
        setIsDownloadingReferences(false)
        setReferenceDownloadProgress(0)
      }
    }
  }, [selectedTopicDownloadReferences, topicTitle.primary, viewModel?.title])
  const topicLeadParagraphs = useMemo(
    () =>
      uniqueText(
        [
          viewModel?.summary,
          viewModel?.description,
        ],
        2,
      ),
    [viewModel],
  )
  const closingParagraphs = useMemo(
    () => viewModel?.closingEditorial?.paragraphs ?? [],
    [viewModel],
  )
  const topicArticleMarkdown = useMemo(
    () => viewModel?.articleMarkdown?.trim() ?? '',
    [viewModel?.articleMarkdown],
  )
  const dashboardData = useMemo(
    () =>
      viewModel
        ? buildTopicDashboardData({
            viewModel,
            displayedNodes,
            topicLeadParagraphs,
            closingParagraphs,
          })
        : null,
    [closingParagraphs, displayedNodes, topicLeadParagraphs, viewModel],
  )
  const shouldShowDashboard = Boolean(
    dashboardData &&
    (
      dashboardData.stats.totalPapers > 1 ||
      dashboardData.researchThreads.length > 1 ||
      dashboardData.pendingPapers.length > 0
    ),
  )
  const reserveWorkbenchDesktopSpace = isDesktopViewport && workbenchOpen
  const desktopWorkbenchPadding = reserveWorkbenchDesktopSpace
    ? TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE + 8
    : 0
  const graphRightSafetyInset = reserveWorkbenchDesktopSpace ? 32 : 0
  const graphStatus = useMemo(() => {
    if (!viewModel) return null

    const graphMissing =
      !viewModel.graph?.nodes?.length ||
      !viewModel.graph?.lanes?.length ||
      displayedNodes.length === 0 ||
      displayedLanes.length === 0

    if (!graphMissing) return null

    const generationStates = [
      viewModel.generationState?.stageTimeline,
      viewModel.generationState?.nodeCards,
    ]
      .map((status) => status?.toLowerCase().trim())
      .filter((status): status is string => Boolean(status))

    const isGenerating = generationStates.some(
      (status) => !['ready', 'completed', 'error', 'failed'].includes(status),
    )

    return {
      kind: isGenerating ? 'loading' as const : 'error' as const,
      message: isGenerating
        ? t('topic.graphGenerating', 'Generating topic graph...')
        : t(
            'topic.graphUnavailable',
            'Topic graph is unavailable because the backend did not return lane and node layout data.',
          ),
    }
  }, [displayedLanes.length, displayedNodes.length, t, viewModel])
  useDocumentTitle(topicTitle.primary || t('topic.unavailable', 'Topic'))

  const loadTopic = useCallback(() => {
    setLoading(true)
    setError(null)
    setResearchBrief(null)
    const topicViewPath = withOptionalStageWindowQuery(
      `/api/topics/${topicId}/view-model`,
      requestedStageWindowMonths,
    )
    invalidateTopicResearchBrief(topicId)

    Promise.all([
      apiGet<TopicViewModel>(topicViewPath),
      fetchTopicResearchBrief(topicId, { force: true }).catch(() => null),
    ])
      .then(([data, brief]) => {
        assertTopicViewModelContract(data)
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
  useEffect(() => { loadTopic() }, [loadTopic, preference.primary])
  useEffect(() => { const anchorId = searchParams.get('anchor') || searchParams.get('evidence'); if (!anchorId) return; const element = document.getElementById(anchorDomId(anchorId)); if (!element) return; window.setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120) }, [searchParams, viewModel])
  useEffect(() => { const onRebuild = () => { void apiPost(withOptionalStageWindowQuery(`/api/topics/${topicId}/rebuild`, requestedStageWindowMonths), {}).finally(() => loadTopic()) }; window.addEventListener(TOPIC_REBUILD_EVENT, onRebuild); return () => window.removeEventListener(TOPIC_REBUILD_EVENT, onRebuild) }, [loadTopic, requestedStageWindowMonths, topicId])

  const focusAnchor = (anchorId: string) => { const next = new URLSearchParams(searchParams); next.set('anchor', anchorId); next.set('stageMonths', String(effectiveStageWindowMonths)); next.delete('evidence'); setSearchParams(next, { replace: true }) }
  const openWorkbench = () => window.dispatchEvent(new Event(TOPIC_WORKBENCH_OPEN_EVENT))
  const seedQuestion = (prompt: string) => { openWorkbench(); window.setTimeout(() => window.dispatchEvent(new CustomEvent(TOPIC_QUESTION_SEED_EVENT, { detail: prompt })), 80) }
  const openEvidence = (anchorId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('evidence', anchorId)
    next.set('stageMonths', String(effectiveStageWindowMonths))
    next.delete('anchor')
    setSearchParams(next, { replace: true })
  }
  const handleCitation = (citation: CitationRef) => {
    if (citation.type === 'figure' || citation.type === 'table' || citation.type === 'formula' || citation.type === 'section') {
      return void openEvidence(citation.anchorId)
    }

    if (citation.type === 'paper') {
      const paperId = citation.anchorId.startsWith('paper:') ? citation.anchorId.slice('paper:'.length) : citation.anchorId
      const paper = viewModel?.papers.find((item) => item.paperId === paperId)
      if (paper) {
        const readingRoute =
          paperRouteMap.get(paper.paperId) ??
          resolvePrimaryReadingRouteForPaper({
            paperId: paper.paperId,
            route: paper.route,
            anchorId: paper.anchorId,
            topicId: viewModel?.topicId,
          })
        navigate(withStageWindowRoute(readingRoute, effectiveStageWindowMonths))
        return
      }
    }

    navigate(withStageWindowRoute(citation.route, effectiveStageWindowMonths))
  }
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
  const sidebarShell = viewModel ? (
    <RightSidebarShell
      topicId={viewModel.topicId}
      topicTitle={topicTitle.primary || viewModel.title}
      researchBrief={researchBrief}
      suggestedQuestions={suggestedQuestions}
      contextSuggestions={contextSuggestions}
      resources={resources}
      references={topicReferences}
      referenceContextLabel={topicTitle.primary || viewModel.title}
      selectedReferenceIds={selectedReferenceIds}
      onToggleReferenceSelection={(paperId) =>
        setSelectedReferenceIds((current) =>
          current.includes(paperId)
            ? current.filter((entry) => entry !== paperId)
            : [...current, paperId],
        )
      }
      onSelectAllReferences={() =>
        setSelectedReferenceIds(downloadableTopicReferences.map((entry) => entry.paperId))
      }
      onClearReferenceSelection={() => setSelectedReferenceIds([])}
      onDownloadSelectedReferences={downloadSelectedReferences}
      isDownloadingReferences={isDownloadingReferences}
      referenceDownloadProgress={referenceDownloadProgress}
      searchStageWindowMonths={effectiveStageWindowMonths}
      onOpenCitation={handleCitation}
      onAction={handleAction}
      onOpenSearchResult={handleSearchResult}
      surfaceMode="map"
    />
  ) : null

  if (loading) return <TopicState kind="loading" message={t('topic.generating', 'Generating content...')} />
  if (error) return <TopicState kind="error" message={error.message || t('topic.unavailable', 'Topic unavailable')} onRetry={loadTopic} />
  if (!viewModel) return <TopicState kind="error" message={t('topic.unavailable', 'Topic unavailable')} onRetry={loadTopic} />
  if (graphStatus) {
    return (
      <main
        className="px-4 pb-24 pt-8 md:px-6 xl:px-10"
        style={
          desktopWorkbenchPadding > 0
            ? {
                paddingRight: `${desktopWorkbenchPadding}px`,
              }
            : undefined
        }
      >
        <div className="mx-auto max-w-[1640px]">
          <TopicState kind={graphStatus.kind} message={graphStatus.message} onRetry={loadTopic} />
          <div className="mx-auto mt-8 w-full max-w-[1500px]">
            <div
              data-testid="topic-stage-map"
              className="rounded-[28px] border border-dashed border-black/10 bg-[var(--surface-soft)] p-8"
            >
              <div
                data-testid="topic-stage-map-canvas"
                className="flex min-h-[220px] items-center justify-center rounded-[20px] bg-white/72 text-center text-[14px] leading-7 text-black/56"
              >
                {graphStatus.message}
              </div>
            </div>
          </div>
        </div>
        {sidebarShell}
      </main>
    )
  }

return (
    <main
      className="px-4 pb-24 pt-8 md:px-6 xl:px-10"
      style={
        desktopWorkbenchPadding > 0
          ? {
              paddingRight: `${desktopWorkbenchPadding}px`,
            }
          : undefined
      }
    >
      <div className="mx-auto max-w-[1640px]">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black">
            <ArrowLeft className="h-4 w-4" />
            {t('topic.backHome', 'Back to Home')}
          </Link>
          <button
            onClick={() => setZoteroDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-[12px] border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-black/70 transition hover:bg-black/5 hover:text-black"
          >
            <Upload className="h-4 w-4" />
            {t('zotero.title', 'Export to Zotero')}
          </button>
        </div>
        <header className="mx-auto mt-6 max-w-[1120px]">
          <div className="max-w-[880px]">
            <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.04em] text-black md:text-[46px]">
              {topicTitle.primary}
            </h1>

            {!topicArticleMarkdown && topicLeadParagraphs.length > 0 ? (
              <div className="mt-4 max-w-[1080px] space-y-3">
                {topicLeadParagraphs.map((paragraph) => (
                  <p key={paragraph} className="text-[14px] leading-8 text-black/62">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {topicArticleMarkdown ? (
          <section className="mx-auto mt-8" style={{ maxWidth: 'min(210mm, 100%)' }}>
            <ArticleMarkdown
              content={topicArticleMarkdown}
              className="article-prose a4-container rounded-[32px] border border-black/8 bg-[#fffdfa] px-6 py-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)] md:px-10"
            />
          </section>
        ) : null}

        {shouldShowDashboard && dashboardData ? (
          <div className="mx-auto mt-8 max-w-[1500px]">
            <TopicDashboardPanel
              state={{ status: 'ready', data: dashboardData, error: null }}
              onRetry={loadTopic}
              stageWindowMonths={effectiveStageWindowMonths}
            />
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-[1500px]">
          <TopicGraphSection
            stages={graphStages}
            lanes={displayedLanes}
            nodes={displayedNodes}
            timelines={displayedTimelines}
            activeAnchor={highlightedAnchor}
            getStageDomId={anchorDomId}
            onFocusStage={focusAnchor}
            rightSafetyInset={graphRightSafetyInset}
            maxCardsPerStage={MAX_TOPIC_STAGE_GRAPH_CARDS}
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

        {!topicArticleMarkdown && closingParagraphs.length > 0 ? (
          <div className="mx-auto max-w-[1320px]">
            <TopicClosingSummary
              eyebrow={t('topic.closingEyebrow', 'Topic Closing')}
              title={viewModel.closingEditorial?.title || t('topic.closingTitle', 'What holds the topic together now')}
              paragraphs={closingParagraphs}
            />
          </div>
        ) : null}
      </div>
      {sidebarShell}
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
