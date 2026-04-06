import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useCallback } from 'react'

import { RightSidebarShell } from '@/components/topic/RightSidebarShell'
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
import { isLowSignalResearchLine } from '@/utils/researchCopy'
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

function isProcessNarrative(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return false

  return isTopicSurfaceNoiseText(text) || /(?:研究已暂停|研究已完成|本轮研究|小时研究|研究循环|候选论文|纳入|内容重建|当前停留|持续检索|回看已有节点|工作台编排|pipeline|research run|candidate papers|admitted|discovered|generated|paused|completed|cycle|deadline|scheduler)/iu.test(
    text,
  )
}

function buildContentOnlyClosingParagraphs(
  viewModel: TopicViewModel,
  stageSections: Array<{
    stageIndex: number
    title: { primary: string; secondary: string }
    overview: string
    nodeCount: number
  }>,
  nodes: DisplayNode[],
  t: Translate,
) {
  const editorialParagraphs = viewModel.closingEditorial.paragraphs.filter(
    (paragraph) => !isLowSignalResearchLine(paragraph) && !isProcessNarrative(paragraph),
  )

  if (editorialParagraphs.length > 0) {
    return uniqueText(
      editorialParagraphs
        .map((paragraph) => sanitizeTopicSurfaceText(paragraph, 220))
        .filter(Boolean),
      2,
    )
  }

  const mainlineNodes = nodes.filter((node) => node.isMainline)
  const firstNode = mainlineNodes[0] ?? nodes[0]
  const lastNode = mainlineNodes[mainlineNodes.length - 1] ?? nodes[nodes.length - 1]
  const branchNodes = nodes.filter((node) => !node.isMainline)
  const stageTrail = uniqueText(stageSections.map((stage) => stage.title.primary), 5)

  return uniqueText(
    [
      renderTemplate(
        t(
          'topic.closingFallbackOverview',
          'This topic is currently organized into {stageCount} stages, {nodeCount} nodes, and {paperCount} papers, with the mainline moving from "{firstNode}" to "{lastNode}" so the whole research route can be reviewed on one map.',
        ),
        {
          stageCount: viewModel.stats.stageCount,
          nodeCount: viewModel.stats.nodeCount,
          paperCount: viewModel.stats.paperCount,
          firstNode: firstNode?.title ?? viewModel.title,
          lastNode: lastNode?.title ?? viewModel.title,
        },
      ),
      stageTrail.length > 0
        ? renderTemplate(
            t(
              'topic.closingFallbackTrail',
              'Instead of a flat list, the reading path unfolds through {trail}; each node keeps only the most important paper entry, stage position, and one judgment so the structure becomes legible first.',
            ),
            { trail: stageTrail.join(' -> ') },
          )
        : '',
      branchNodes.length > 0
        ? renderTemplate(
            t(
              'topic.closingFallbackBranches',
              'Beyond the mainline, {count} branch nodes are retained to hold adjacent studies that add evidence, compare methods, or offer transferable viewpoints.',
            ),
            { count: branchNodes.length },
          )
        : '',
    ],
    2,
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
          'Gather {count} related papers around "{title}" and start with the key method thread on this branch.',
        ),
        { title, count: paperCount },
      )
    : renderTemplate(
        t(
          'topic.nodeSummaryOne',
          'Use "{title}" to grasp the most important problem framing and method entry for this node.',
        ),
        { title },
      )
}

function isLowSignalNodeCardText(value: string | null | undefined) {
  const text = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!text) return true

  return /(?:并不是单篇论文结论|围绕同一问题形成的一段研究推进|当前节点主要由一篇论文支撑|跨论文比较还没有真正展开|节点目前仍然依赖|仍然依赖单篇论文|The user wants|Key requirements|single-paper conclusion|cross-paper comparison|related papers to mention|summary context|structure plan)/iu.test(
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
    if (cleaned && !isLowSignalNodeCardText(cleaned)) {
      return cleaned
    }
  }

  return buildNodeSurfaceSummary(args.title, args.paperCount, args.t)
}

function findPreferredNodeCover(
  explicitCover: string | null | undefined,
  nodePaperIds: string[],
  paperCoverMap: Map<string, string | null>,
) {
  if (explicitCover) return explicitCover

  for (const paperId of nodePaperIds) {
    const cover = paperCoverMap.get(paperId)
    if (cover) return cover
  }

  return null
}

function buildDisplayNodes(viewModel: TopicViewModel, t: Translate): DisplayNode[] {
  const paperCoverMap = new Map(
    viewModel.papers.map((paper) => [paper.paperId, paper.coverImage ?? null] as const),
  )
  const defaultNodeTitle = t('topic.nodeDefaultTitle', 'Research node')

  if (viewModel.graph?.nodes?.length) {
    return densifyNodeColumns(
      viewModel.graph.nodes.map((node: TopicGraphNode) => {
      const title = compactTopicSurfaceTitle(node.title || node.primaryPaperTitle, defaultNodeTitle, 34)
      return {
        nodeId: node.nodeId,
        anchorId: node.anchorId,
        route: node.route,
        stageIndex: node.stageIndex,
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
          node.paperIds ?? [node.primaryPaperId].filter(Boolean),
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
        isMainline: node.layoutHint?.isMainline ?? !node.provisional,
      }
    }),
    )
  }
  return densifyNodeColumns(
    viewModel.stages.flatMap((stage) =>
      stage.nodes.map((node, index) => {
      const title = compactTopicSurfaceTitle(node.title || node.primaryPaperTitle, defaultNodeTitle, 34)
      return {
        nodeId: node.nodeId,
        anchorId: node.anchorId,
        route: node.route,
        stageIndex: stage.stageIndex,
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
          node.paperIds ?? [node.primaryPaperId].filter(Boolean),
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
        isMainline: !node.provisional,
      }
    }),
    ),
  )
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
  parentTitles,
  onFocus,
  stageWindowMonths,
  t,
}: {
  node: DisplayNode
  highlighted: boolean
  language: UiLanguage
  parentTitles: string[]
  onFocus: () => void
  stageWindowMonths: number
  t: Translate
}) {
  const [imageBroken, setImageBroken] = useState(false)
  const imageUrl = !imageBroken ? resolveApiAssetUrl(node.coverImage) : null
  const title = language === 'zh' ? node.title : node.titleEn || node.title
  const summary = clipText(node.summary || node.explanation, 86)
  const badgeColor = node.isMergeNode ? '#9c6b2f' : node.branchColor || MAINLINE_COLOR
  const paperLabel = renderTemplate(
    t('topic.nodePaperCount', '{count} papers'),
    { count: node.paperCount },
  )
  const roleLabel = node.isMergeNode
    ? t('topic.nodeRoleMerge', 'Merge')
    : !node.isMainline
      ? t('topic.nodeRoleBranch', 'Branch')
      : ''

  return (
    <article
      id={anchorDomId(node.anchorId)}
      className={`group overflow-hidden rounded-[24px] border bg-[#fcfbf9] transition ${
        highlighted
          ? 'border-[#d1aa5c]/70 shadow-[0_18px_38px_rgba(15,23,42,0.14)]'
          : 'border-black/8 shadow-[0_12px_24px_rgba(15,23,42,0.06)]'
      }`}
    >
      <Link
        to={withStageWindowRoute(node.route, stageWindowMonths)}
        onClick={onFocus}
        className="relative flex h-full min-h-[154px] flex-col sm:flex-row"
      >
        <div className="relative h-[122px] shrink-0 overflow-hidden border-b border-black/6 sm:h-auto sm:w-[112px] sm:border-b-0 sm:border-r">
          <div
            className="absolute inset-y-0 left-0 w-1"
            style={{ backgroundColor: badgeColor }}
          />
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={node.primaryPaperTitle || title}
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                loading="lazy"
                onError={() => setImageBroken(true)}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.02)_0%,rgba(15,23,42,0.1)_52%,rgba(15,23,42,0.24)_100%)]" />
            </>
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(145deg, ${badgeColor}18 0%, #f7f1e6 54%, #fffdfa 100%)`,
                }}
              />
              <div className="soft-grid absolute inset-0 opacity-35" />
              <div className="absolute inset-x-3 bottom-3 line-clamp-3 text-[9px] leading-4 text-black/32">
                {node.primaryPaperTitle || title}
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col px-4 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-black/34">
                {!node.isMainline ? <span>{node.branchLabel}</span> : null}
                <span>{node.primaryPaperTitle || title}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-[15px] font-semibold leading-[1.3] text-black">
                {title}
              </div>
            </div>
            {roleLabel ? (
              <div className="shrink-0 rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/54">
                {roleLabel}
              </div>
            ) : null}
          </div>
          <p className="mt-3 line-clamp-4 text-[12px] leading-6 text-black/58">{summary}</p>
          {parentTitles.length > 0 ? (
            <div className="mt-3 text-[11px] leading-5 text-black/42">
              {renderTemplate(t('topic.nodeParentTrail', 'From {trail}'), {
                trail: parentTitles.join(' · '),
              })}
            </div>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <div className="inline-flex rounded-full bg-black/[0.045] px-2.5 py-1 text-[10px] text-black/56">
              {paperLabel}
            </div>
            <div className="inline-flex rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/46">
              {t('topic.nodeOpenReading', 'Open article')}
            </div>
          </div>
        </div>
      </Link>
    </article>
  )
}

export function TopicPage() {
  const { topicId = '' } = useParams<{ topicId: string }>()
  const navigate = useNavigate()
  const { t, preference } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<TopicViewModel | null>(null)
  const [researchBrief, setResearchBrief] = useState<TopicResearchBrief | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<EvidencePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const highlightedAnchor = searchParams.get('anchor')
  const uiLanguage = preference.primary as UiLanguage
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const effectiveStageWindowMonths = viewModel?.stageConfig?.windowMonths ?? requestedStageWindowMonths ?? 1

  const topicTitle = useMemo(() => getTopicLocalizedPair(viewModel?.localization, 'name', preference, viewModel?.title ?? '', viewModel?.titleEn ?? viewModel?.title ?? ''), [preference, viewModel])
  const topicSummary = useMemo(() => getTopicLocalizedPair(viewModel?.localization, 'summary', preference, viewModel?.summary ?? '', viewModel?.summary ?? ''), [preference, viewModel])
  const topicDescription = useMemo(() => getTopicLocalizedPair(viewModel?.localization, 'description', preference, viewModel?.description ?? '', viewModel?.description ?? ''), [preference, viewModel])
  const topicStandfirst = useMemo(
    () =>
      uniqueText(
        [viewModel?.hero.standfirst, topicSummary.primary, topicDescription.primary]
          .filter((item) => !isProcessNarrative(item))
          .map((item) => sanitizeTopicSurfaceText(item, 180))
          .filter(Boolean),
        1,
      )[0] ?? '',
    [topicDescription.primary, topicSummary.primary, viewModel],
  )
  const timelineStageByIndex = useMemo(
    () => new Map((viewModel?.timeline?.stages ?? []).map((stage) => [stage.stageIndex, stage])),
    [viewModel],
  )
  const stageSections = useMemo(
    () =>
      (viewModel?.stages ?? []).map((stage) => {
        const title = getStageLocalizedPair(stage.locales, 'name', preference, stage.title, stage.titleEn)
        const timelineStage = timelineStageByIndex.get(stage.stageIndex)
        const chronologyLabel = pickStageChronologyLabel(timelineStage ?? {})
        const displayTitle = pickStageNarrativeTitle(title.primary)
        const fallbackLabel = `${t('topic.stageLabel', 'Stage')} ${stage.stageIndex}`

        return {
          stageIndex: stage.stageIndex,
          title,
          chronologyLabel,
          badgeLabel: pickStageBadgeLabel({
            title: title.primary,
            fallbackLabel,
            ...(timelineStage ?? {}),
          }),
          displayTitle,
          overview:
            sanitizeTopicSurfaceText(
              cleanStageOverview(
                stage.editorial.summary ||
                getStageLocalizedPair(
                  stage.locales,
                  'description',
                  preference,
                  stage.description,
                  stage.description,
                ).primary,
              ),
              72,
            ) || '',
          nodeCount: stage.nodes.length,
          paperCount: stage.nodes.reduce((count, node) => count + (node.paperCount ?? 0), 0),
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
  const nodesByStage = useMemo(
    () =>
      new Map(
        displayedStageSections.map((stage) => [
          stage.stageIndex,
          displayedNodes
            .filter((node) => node.stageIndex === stage.stageIndex)
            .sort((left, right) => {
              if (left.isMainline !== right.isMainline) {
                return left.isMainline ? -1 : 1
              }

              if (left.column !== right.column) {
                return left.column - right.column
              }

              return left.title.localeCompare(right.title)
            }),
        ]),
      ),
    [displayedNodes, displayedStageSections],
  )
  const closingParagraphs = useMemo(
    () =>
      viewModel
        ? buildContentOnlyClosingParagraphs(viewModel, stageSections, nodes, t)
        : [],
    [nodes, stageSections, t, viewModel],
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
            ...nodes.slice(0, 3).map((node) => ({
              id: `node:${node.nodeId}`,
              kind: 'node' as const,
              label: node.title,
              description: sanitizeTopicSurfaceText(node.summary || node.explanation, 96),
              route: withStageWindowRoute(node.route, effectiveStageWindowMonths),
              anchorId: node.anchorId,
            })),
          ] satisfies ContextPill[]),
    [displayedStageSections, effectiveStageWindowMonths, nodes, viewModel],
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
        route: withStageWindowRoute(paper.route, effectiveStageWindowMonths),
        anchorId: paper.anchorId,
      })),
    [effectiveStageWindowMonths, viewModel],
  )
  useDocumentTitle(topicTitle.primary || t('topic.unavailable', 'Topic'))

  const stageWindowLabel = useCallback(
    (months: number) =>
      renderTemplate(t('topic.stageWindowOption', '{count} months'), {
        count: months,
      }),
    [t],
  )
  const stageCadenceNote = renderTemplate(
    t(
      'topic.stageCadenceNote',
      'Stage cadence is fixed to a {window} publication window for this topic. Adjust it from Topic List or Research Settings instead of changing the reading surface.',
    ),
    {
      window: stageWindowLabel(effectiveStageWindowMonths),
    },
  )

  const loadTopic = useCallback(() => {
    setLoading(true)
    setError(null)
    const topicViewPath = withOptionalStageWindowQuery(
      `/api/topics/${topicId}/view-model`,
      requestedStageWindowMonths,
    )

    Promise.all([
      apiGet<TopicViewModel>(topicViewPath),
      apiGet<TopicResearchBrief>(`/api/topics/${topicId}/research-brief`).catch(() => null),
    ])
      .then(([data, brief]) => {
        setViewModel(data)
        setResearchBrief(brief)
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
  const handleSearchResult = (item: SearchResultItem) => { if (item.anchorId && ['section', 'figure', 'table', 'formula'].includes(item.kind) && item.topicId === topicId) return void openEvidence(item.anchorId); if (item.anchorId && item.kind === 'topic' && item.id === topicId) return void focusAnchor(item.anchorId); navigate(withStageWindowRoute(item.route, effectiveStageWindowMonths)) }
  const handleAction = (action: SuggestedAction) => { if (!viewModel) return; if (action.action === 'navigate' && action.targetId?.startsWith('stage:')) return void focusAnchor(action.targetId); if (action.targetId && /^(section|figure|table|formula):/u.test(action.targetId)) return void openEvidence(action.targetId); if (action.targetId?.startsWith('node:')) { const node = nodes.find((item) => item.nodeId === action.targetId?.replace('node:', '')); if (node) return action.action === 'navigate' ? void navigate(withStageWindowRoute(node.route, effectiveStageWindowMonths)) : void seedQuestion(buildFollowUpPrompt(node.title, t)) } if (action.targetId?.startsWith('paper:')) { const paper = viewModel.papers.find((item) => item.paperId === action.targetId?.replace('paper:', '')); if (paper) return action.action === 'navigate' ? void navigate(withStageWindowRoute(paper.route, effectiveStageWindowMonths)) : void seedQuestion(buildFollowUpPrompt(paper.title, t)) } seedQuestion(action.label) }

  if (loading) return <TopicState kind="loading" message={t('topic.generating', 'Generating content...')} />
  if (error) return <TopicState kind="error" message={error.message || t('topic.unavailable', 'Topic unavailable')} onRetry={loadTopic} />
  if (!viewModel) return <TopicState kind="error" message={t('topic.unavailable', 'Topic unavailable')} onRetry={loadTopic} />
  if (displayedNodes.length === 0) return <><TopicState kind="loading" message={t('topic.generating', 'Generating content...')} onRetry={loadTopic} /><RightSidebarShell topicId={viewModel.topicId} topicTitle={topicTitle.primary || viewModel.title} researchBrief={researchBrief} suggestedQuestions={suggestedQuestions} selectedEvidence={selectedEvidence} contextSuggestions={contextSuggestions} resources={resources} searchStageWindowMonths={effectiveStageWindowMonths} onOpenCitation={handleCitation} onAction={handleAction} onOpenSearchResult={handleSearchResult} /></>

  const nodeTitleById = new Map(
    displayedNodes.map((node) => [
      node.nodeId,
      uiLanguage === 'zh' ? node.title : node.titleEn || node.title,
    ]),
  )

  return (
    <main className="px-4 pb-24 pt-8 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1460px]">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black">
          <ArrowLeft className="h-4 w-4" />
          {t('topic.backHome', 'Back to Home')}
        </Link>
        <header className="mt-5 rounded-[28px] border border-black/8 bg-white px-6 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)] md:px-8">
          <div className="max-w-[720px]">
            <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
              {viewModel.focusLabel || viewModel.hero.kicker || t('topic.heroEyebrow', 'Topic')}
            </div>
            <h1 className="mt-2.5 font-display text-[30px] leading-[1.04] tracking-[-0.04em] text-black md:text-[40px]">
              {topicTitle.primary}
            </h1>
            {topicTitle.secondary && topicTitle.secondary !== topicTitle.primary ? (
              <div className="mt-2 text-[14px] leading-7 text-black/40">{topicTitle.secondary}</div>
            ) : null}
            <p className="mt-3 max-w-[640px] text-[13px] leading-6 text-black/58">{topicStandfirst}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[10px] text-black/62">
                {viewModel.stats.stageCount} {t('topic.stages', 'Stages')}
              </span>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[10px] text-black/62">
                {viewModel.stats.nodeCount} {t('topic.nodes', 'Nodes')}
              </span>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[10px] text-black/62">
                {viewModel.stats.paperCount} {t('topic.papers', 'Papers')}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/58">
                {stageCadenceNote}
              </span>
              <Link
                to="/manage/topics"
                className="inline-flex rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/58 transition hover:border-black/18 hover:text-black"
              >
                {t('topic.manageCadence', 'Manage topic cadence')}
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-6 rounded-[30px] border border-black/8 bg-[linear-gradient(180deg,#fdfcf9_0%,#ffffff_100%)] px-4 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)] md:px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">{t('topic.nodesEyebrow', 'Topic Nodes')}</div>
              <h2 className="mt-2 font-display text-[22px] leading-[1.06] text-black">{t('topic.graph', 'Research Graph')}</h2>
            </div>
            <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/54">
              {renderTemplate(t('topic.graphStats', '{stages} stages · {nodes} nodes'), {
                stages: displayedStageSections.length,
                nodes: displayedNodes.length,
              })}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-black/48">
            <p className="mt-1.5 max-w-[620px] text-[11px] leading-5 text-black/48">
              {t(
                'topic.graphIntro',
                'Read this map from top to bottom as time, and left to right as parallel exploration inside the same stage. The map stays dense so you can see the whole topic without fighting the canvas.',
              )}
            </p>
          </div>
          <div data-testid="topic-stage-map" className="mt-6 space-y-5">
            {displayedStageSections.map((stage, index) => {
              const chronologyText =
                stage.chronologyLabel || stage.badgeLabel || `${t('topic.stageLabel', 'Stage')} ${stage.stageIndex}`
              const stageNodes = nodesByStage.get(stage.stageIndex) ?? []
              const highlighted = highlightedAnchor === `stage:${stage.stageIndex}`

              return (
                <article
                  key={stage.stageIndex}
                  className={`relative overflow-hidden rounded-[30px] border px-5 py-5 transition md:px-6 ${
                    highlighted
                      ? 'border-[#d1aa5c]/70 bg-[#fffcf5] shadow-[0_16px_34px_rgba(209,170,92,0.12)]'
                      : 'border-black/8 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
                  }`}
                >
                  {index < displayedStageSections.length - 1 ? (
                    <div className="pointer-events-none absolute bottom-[-26px] left-[38px] top-[104px] hidden w-px bg-[linear-gradient(180deg,rgba(125,25,56,0.22)_0%,rgba(125,25,56,0.04)_100%)] lg:block" />
                  ) : null}

                  <div className="grid gap-5 lg:grid-cols-[284px_minmax(0,1fr)]">
                    <button
                      type="button"
                      id={anchorDomId(`stage:${stage.stageIndex}`)}
                      onClick={() => focusAnchor(`stage:${stage.stageIndex}`)}
                      className="relative overflow-hidden rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fcfaf5_0%,#f7f2e7_100%)] px-5 py-5 text-left transition hover:border-black/16"
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-[rgba(125,25,56,0.72)]" />
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-black/38">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            highlighted ? 'bg-[#d1aa5c]' : 'bg-[rgba(125,25,56,0.45)]'
                          }`}
                        />
                        <span>{chronologyText}</span>
                      </div>
                      <div className="mt-3 text-[20px] font-semibold leading-[1.18] text-black">
                        {stage.displayTitle || stage.badgeLabel}
                      </div>
                      {stage.overview ? (
                        <p className="mt-3 text-[13px] leading-6 text-black/58">{stage.overview}</p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-black/46">
                        <span className="rounded-full border border-black/8 bg-white px-2.5 py-1">
                          {renderTemplate(t('topic.stageWindowStageCounts', '{nodes} nodes · {papers} papers'), {
                            nodes: stage.nodeCount,
                            papers: stage.paperCount,
                          })}
                        </span>
                        <span className="rounded-full border border-black/8 bg-white px-2.5 py-1">
                          {renderTemplate(t('topic.stageIndexBadge', 'Stage {stage}'), {
                            stage: stage.stageIndex,
                          })}
                        </span>
                      </div>
                    </button>

                    <div className="min-w-0">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {stageNodes.map((node) => (
                          <NodeCard
                            key={node.nodeId}
                            node={node}
                            highlighted={highlightedAnchor === node.anchorId}
                            language={uiLanguage}
                            parentTitles={node.parentNodeIds.map((parentNodeId) => nodeTitleById.get(parentNodeId) ?? parentNodeId).filter(Boolean)}
                            onFocus={() => focusAnchor(node.anchorId)}
                            stageWindowMonths={effectiveStageWindowMonths}
                            t={t}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-black/8 bg-white px-6 py-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] md:px-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">{t('topic.closingEyebrow', 'Final Summary')}</div>
          <h2 className="mt-2.5 font-display text-[20px] leading-[1.08] text-black">{t('topic.closingTitle', 'Where This Research Line Stands Now')}</h2>
          <div className="mt-3.5 max-w-[920px] space-y-2.5">{closingParagraphs.map((paragraph) => <p key={paragraph} className="text-[13px] leading-7 text-black/64">{paragraph}</p>)}</div>
        </section>
      </div>
      <RightSidebarShell topicId={viewModel.topicId} topicTitle={topicTitle.primary} researchBrief={researchBrief} suggestedQuestions={suggestedQuestions} selectedEvidence={selectedEvidence} contextSuggestions={contextSuggestions} resources={resources} searchStageWindowMonths={effectiveStageWindowMonths} onOpenCitation={handleCitation} onAction={handleAction} onOpenSearchResult={handleSearchResult} />
    </main>
  )
}

export default TopicPage

