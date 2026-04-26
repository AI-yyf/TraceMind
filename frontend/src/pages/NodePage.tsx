import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Upload, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

import {
  type ArticleInlineReference,
  parseInlineArticleReferences,
  renderInlineArticleText,
} from '@/components/reading/ArticleInlineText'
import { ArticleMarkdown } from '@/components/reading/ArticleMarkdown'
import { ReadingEvidenceBlock } from '@/components/reading/ReadingEvidenceBlock'
import { PaperSectionBlock } from '@/components/reading/PaperSectionBlock'
import { RightSidebarShell } from '@/components/topic/RightSidebarShell'
import {
  TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE,
  isTopicWorkbenchDesktopViewport,
} from '@/components/topic/workbench-layout'
import { ZoteroExportDialog } from '@/components/ZoteroExportDialog'
import { ResearchViewToggle, type ViewMode } from '@/components/node/ResearchViewToggle'
import { ResearchView } from '@/components/node/ResearchView'
import { usePageScrollRestoration, useReadingWorkspace } from '@/contexts/readingWorkspaceHooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useWebSocket, type ResearchProgress } from '@/hooks/useWebSocket'
import { useI18n } from '@/i18n'
import type { LanguagePreference } from '@/i18n'
import { isLowSignalResearchLine } from '@/utils/researchCopy'
import type {
  ArticleFlowBlock,
  CitationRef,
  ContextPill,
  EvidenceExplanation,
  NodeViewModel,
  PaperViewModel,
  SearchResultItem,
  SuggestedAction,
  WorkbenchReferenceEntry,
} from '@/types/alpha'
import type { NodeArticleFlowBlock, NodeIntroductionBlock, NodeSynthesisBlock } from '@/types/article'
import { apiGet } from '@/utils/api'
import {
  assertNodeViewModelContract,
} from '@/utils/contracts'
import { logger } from '@/utils/logger'
import { buildPaperAnchorRoute, resolvePrimaryReadingRouteForPaper } from '@/utils/readingRoutes'
import {
  readStageWindowSearchParam,
  withOptionalStageWindowQuery,
  withStageWindowRoute,
} from '@/utils/stageWindow'

function anchorDomId(anchorId: string) {
  return `anchor-${anchorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function setInlineReference(
  entries: Map<string, ArticleInlineReference>,
  reference: ArticleInlineReference | null,
) {
  if (!reference) return
  const key = reference.id.toLowerCase()
  if (!entries.has(key)) {
    entries.set(key, reference)
  }
}

function collectNarrativeReferenceIds(texts: Array<string | null | undefined>) {
  const ids = new Set<string>()

  for (const text of texts) {
    for (const token of parseInlineArticleReferences(text ?? '')) {
      ids.add(token.id)
    }
  }

  return Array.from(ids)
}

function normalizeNarrativeKey(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .replace(/[銆屻€嶃€庛€忋€娿€嬧€溾€?'`]/gu, '')
    .replace(/[，。！？；：、“”]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

const LOW_SIGNAL_NODE_NARRATIVE_PATTERNS = [
  /不是单篇论文结论/u,
  /如果读者还看不清每篇论文做了什么/u,
  /好的节点应该让读者看清/u,
  /this node is not a single-paper conclusion/iu,
  /node-level judgment cannot stop at/iu,
  /if readers still cannot tell what each paper did/iu,
  /a good node should help the reader see/iu,
]

function sanitizeNarrativeParagraph(value: string | null | undefined) {
  const paragraph = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!paragraph) return ''
  if (isLowSignalResearchLine(paragraph)) return ''
  if (LOW_SIGNAL_NODE_NARRATIVE_PATTERNS.some((pattern) => pattern.test(paragraph))) return ''
  return paragraph
}

function isNarrativeDuplicate(existingKeys: Set<string>, nextKey: string) {
  for (const existing of existingKeys) {
    if (existing === nextKey) return true

    const overlapLength = Math.min(existing.length, nextKey.length)
    if (overlapLength >= 24 && (existing.includes(nextKey) || nextKey.includes(existing))) {
      return true
    }
  }

  return false
}

function dedupeNarrativeParagraphs(
  values: Array<string | null | undefined>,
  seenKeys = new Set<string>(),
) {
  const output: string[] = []

  for (const value of values) {
    const paragraph = sanitizeNarrativeParagraph(value)
    if (!paragraph) continue

    const key = normalizeNarrativeKey(paragraph)
    if (!key || isNarrativeDuplicate(seenKeys, key)) continue

    seenKeys.add(key)
    output.push(paragraph)
  }

  return output
}

function splitNarrativeParagraphs(value: string | null | undefined) {
  return (value ?? '')
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
}

function dedupeNodeFlow(
  flow: ArticleFlowBlock[],
  leadParagraphs: string[],
) : ArticleFlowBlock[] {
  const seenKeys = new Set(leadParagraphs.map((paragraph) => normalizeNarrativeKey(paragraph)).filter(Boolean))
  const nextFlow: ArticleFlowBlock[] = []

  for (const block of flow) {
    if (block.type === 'text' || block.type === 'closing') {
      const body = dedupeNarrativeParagraphs(block.body, seenKeys)
      if (body.length === 0) continue
      nextFlow.push({ ...block, body })
      continue
    }

    if (block.type === 'comparison') {
      const summary = dedupeNarrativeParagraphs([block.summary], seenKeys)[0] ?? ''
      const points = block.points.reduce<typeof block.points>((entries, point) => {
        const detail = dedupeNarrativeParagraphs([point.detail], seenKeys)[0] ?? ''
        if (!detail) return entries
        entries.push({ ...point, detail })
        return entries
      }, [])

      if (!summary && points.length === 0) continue

      nextFlow.push({
        ...block,
        summary: summary || points[0]?.detail || '',
        points: summary ? points : points.slice(1),
      })
      continue
    }

    if (block.type === 'critique') {
      const summary = dedupeNarrativeParagraphs([block.summary], seenKeys)[0] ?? ''
      const bullets = dedupeNarrativeParagraphs(block.bullets, seenKeys)

      if (!summary && bullets.length === 0) continue

      nextFlow.push({
        ...block,
        summary: summary || bullets[0] || '',
        bullets: summary ? bullets : bullets.slice(1),
      })
      continue
    }

    nextFlow.push(block)
  }

  return nextFlow
}

function buildPaperAnchor(nodeId: string, paperId: string) {
  return buildPaperAnchorRoute(`/node/${nodeId}`, paperId)
}

function buildNodeViewModelPath(nodeId: string, stageWindowMonths?: number, enhanced?: boolean) {
  const basePath = withOptionalStageWindowQuery(
    `/api/nodes/${nodeId}/view-model`,
    stageWindowMonths,
  )
  // enhanced=true triggers slow deep article generation - only use when explicitly requested
  if (enhanced === true) {
    return `${basePath}${basePath.includes('?') ? '&' : '?'}enhanced=true`
  }
  return basePath
}

function readRequestedNodeViewMode(searchParams: URLSearchParams): ViewMode {
  return searchParams.get('view') === 'research' ? 'research' : 'article'
}

function hasEnhancedContinuousArticleFlow(
  viewModel: Pick<NodeViewModel, 'enhancedArticleFlow'> | null | undefined,
) {
  return (
    Array.isArray(viewModel?.enhancedArticleFlow) &&
    viewModel.enhancedArticleFlow.some((block) => block.type === 'paper-article')
  )
}

const ENHANCED_NODE_ARTICLE_CLIENT_TIMEOUT_MS = 180_000

function formatPublishedDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return ''
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

/** 鎬?- 鑺傜偣姒傝堪绔犺妭 (Node Introduction Section) */
function NodeIntroSection({
  introduction,
  referenceMap,
  stageWindowMonths,
  t,
  preference,
}: {
  introduction: NodeIntroductionBlock
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  t: (key: string, fallback?: string) => string
  preference: LanguagePreference
}) {
  const displayLanguage = preference.primary === 'zh' ? 'zh' : 'en'
  const introTitle = displayLanguage === 'zh'
    ? t('node.intro.title', '节点概览')
    : t('node.intro.titleEn', 'Node Overview')

  const paragraphs = splitNarrativeParagraphs(introduction.content)

  return (
    <section
      id={anchorDomId('node:intro')}
      className="pt-4"
    >
      <h2 className="text-[24px] font-semibold leading-[1.14] text-black">
        {introTitle}
      </h2>

      <div className="mt-6 space-y-5">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}:${paragraph}`}
            className="text-[16px] leading-9 text-black/68"
          >
            {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
          </p>
        ))}
      </div>

      {introduction.contextStatement ? (
        <p className="mt-6 text-[15px] leading-8 text-black/60">
          {renderInlineArticleText(introduction.contextStatement, referenceMap, stageWindowMonths)}
        </p>
      ) : null}

      {introduction.coreQuestion ? (
        <p className="mt-4 text-[16px] leading-8 text-black/78">
          {renderInlineArticleText(introduction.coreQuestion, referenceMap, stageWindowMonths)}
        </p>
      ) : null}

      {introduction.keyMethods && introduction.keyMethods.length > 0 ? (
        <p className="mt-5 text-[14px] leading-8 text-black/56">
          {displayLanguage === 'zh'
            ? `贯穿这一节点的方法抓手主要包括：${introduction.keyMethods.join('、')}。`
            : `The methods that repeatedly structure this node are ${introduction.keyMethods.join(', ')}.`}
        </p>
      ) : null}
    </section>
  )
}

/** 鎬?- 缁煎悎鍒嗘瀽绔犺妭 (Node Synthesis Section) */
function NodeSynthesisSection({
  synthesis,
  referenceMap,
  stageWindowMonths,
  t,
  preference,
}: {
  synthesis: NodeSynthesisBlock
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  t: (key: string, fallback?: string) => string
  preference: LanguagePreference
}) {
  const displayLanguage = preference.primary === 'zh' ? 'zh' : 'en'
  const synthesisTitle = displayLanguage === 'zh'
    ? t('node.synthesis.title', '综合判断')
    : t('node.synthesis.titleEn', 'Synthesis')

  const paragraphs = splitNarrativeParagraphs(synthesis.content)

  return (
    <section
      id={anchorDomId('node:synthesis')}
      className="pt-6"
    >
      <h2 className="text-[24px] font-semibold leading-[1.14] text-black">
        {synthesisTitle}
      </h2>

      <div className="mt-6 space-y-5">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}:${paragraph}`}
            className="text-[16px] leading-9 text-black/68"
          >
            {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
          </p>
        ))}
      </div>
    </section>
  )
}

export function NodePage() {
  const { nodeId = '' } = useParams<{ nodeId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { rememberTrail, state: readingWorkspaceState } = useReadingWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedViewMode = useMemo(() => readRequestedNodeViewMode(searchParams), [searchParams])
  const [viewModel, setViewModel] = useState<NodeViewModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hydratedReferences, setHydratedReferences] = useState<Map<string, ArticleInlineReference>>(
    () => new Map(),
  )
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(requestedViewMode)
  const [loading, setLoading] = useState(true)
  const [isEnhancingArticle, setIsEnhancingArticle] = useState(false)
  const [articleEnhancementError, setArticleEnhancementError] = useState<string | null>(null)
  const [isDownloadingReferences, setIsDownloadingReferences] = useState(false)
  const [referenceDownloadProgress, setReferenceDownloadProgress] = useState(0)
  const [zoteroDialogOpen, setZoteroDialogOpen] = useState(false)
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined') return true
    return isTopicWorkbenchDesktopViewport(window.innerWidth)
  })
  const [researchProgress, setResearchProgress] = useState<ResearchProgress | null>(null)
  const { copy } = useProductCopy()
  const { t, preference } = useI18n()

  // Zoom controls for poster-style viewing
  const [zoomLevel, setZoomLevel] = useState(100)
  const MIN_ZOOM = 50
  const MAX_ZOOM = 200
  const ZOOM_STEP = 25

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoomLevel(100)
  }, [])

  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const requestNodeViewModel = useCallback(
    async (enhanced: boolean, signal?: AbortSignal) => {
      const payload = await apiGet<NodeViewModel>(
        buildNodeViewModelPath(nodeId, requestedStageWindowMonths, enhanced),
        signal,
      )
      assertNodeViewModelContract(payload)
      return payload
    },
    [nodeId, requestedStageWindowMonths],
  )

  // Ref to track mounted state for async download operations
  const downloadMountedRef = useRef(true)
  const latestViewModelRef = useRef<NodeViewModel | null>(null)
  const allowEnhancementSignalsRef = useRef(true)

  // WebSocket subscription for node-level research progress
  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onProgress: (sessionId, progress) => {
      if (sessionId === nodeId) {
        setResearchProgress(progress)
        if (progress.status === 'started' || progress.status === 'progress' || progress.percent) {
          if (latestViewModelRef.current) {
            if (allowEnhancementSignalsRef.current) {
              setIsEnhancingArticle(true)
            }
          } else {
            setLoading(true)
          }
        }
      }
    },
    onComplete: (sessionId, _result) => {
      if (sessionId === nodeId) {
        setResearchProgress(null)
        allowEnhancementSignalsRef.current = false
        setIsEnhancingArticle(false)
        setArticleEnhancementError(null)
        if (!latestViewModelRef.current) {
          setLoading(false)
        }

        requestNodeViewModel(true)
          .then((payload) => {
            setViewModel(payload)
            setError(null)
          })
          .catch((nextError) => {
            const message = nextError instanceof Error ? nextError.message : String(nextError)
            if (latestViewModelRef.current) {
              setArticleEnhancementError(message)
            } else {
              setViewModel(null)
              setError(message)
            }
          })
      }
    },
    onError: (sessionId, error) => {
      if (sessionId === nodeId) {
        if (latestViewModelRef.current) {
          logger.warn('NodePage', 'Background article refinement did not finish', error)
        } else {
          logger.error('NodePage', 'Research error', error)
        }
        setResearchProgress(null)
        allowEnhancementSignalsRef.current = false
        setIsEnhancingArticle(false)
        if (!latestViewModelRef.current) {
          setLoading(false)
        }
        setArticleEnhancementError(typeof error === 'string' ? error : String(error))
      }
    },
  })

  // Subscribe to nodeId for WebSocket progress when connected
  useEffect(() => {
    if (nodeId && isConnected) {
      subscribe(nodeId)
      return () => unsubscribe(nodeId)
    }
  }, [nodeId, isConnected, subscribe, unsubscribe])

  // Track mounted state for download operations
  useEffect(() => {
    downloadMountedRef.current = true
    return () => {
      downloadMountedRef.current = false
    }
  }, [])
  useEffect(() => {
    latestViewModelRef.current = viewModel
  }, [viewModel])
  useEffect(() => {
    setViewMode((current) => (current === requestedViewMode ? current : requestedViewMode))
  }, [requestedViewMode])
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const syncViewport = () => {
      setIsDesktopViewport(isTopicWorkbenchDesktopViewport(window.innerWidth))
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])
  const activeAnchor = searchParams.get('evidence') || searchParams.get('anchor')
  const stageWindowMonths = viewModel?.stageWindowMonths ?? requestedStageWindowMonths ?? 1
  const handleViewModeChange = useCallback(
    (nextViewMode: ViewMode) => {
      setViewMode(nextViewMode)
      const nextParams = new URLSearchParams(searchParams)
      if (nextViewMode === 'article') {
        nextParams.delete('view')
      } else {
        nextParams.set('view', nextViewMode)
      }
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams],
  )
  const hasFocusAnchor = Boolean(searchParams.get('anchor') || searchParams.get('evidence'))
  const topicReturnRoute = useMemo(
    () =>
      viewModel
        ? withStageWindowRoute(
            `/topic/${viewModel.topic.topicId}?anchor=${encodeURIComponent(`node:${viewModel.nodeId}`)}`,
            stageWindowMonths,
          )
        : null,
    [stageWindowMonths, viewModel],
  )

  usePageScrollRestoration(`node:${nodeId}:stage:${stageWindowMonths}`, {
    skipInitialRestore: hasFocusAnchor,
  })

  useDocumentTitle(
    viewModel?.title ??
      (loading
        ? copy('reading.nodeLoadingTitle', t('node.readingTitle', 'Node article'))
        : copy('reading.nodeUnavailableTitle', t('node.unavailableTitle', 'Node unavailable'))),
  )

  useEffect(() => {
    const quickController = new AbortController()
    const enhancedController = new AbortController()
    let alive = true
    let enhancementClientTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    setLoading(true)
    setViewModel(null)
    setError(null)
    allowEnhancementSignalsRef.current = true
    setIsEnhancingArticle(false)
    setArticleEnhancementError(null)

    requestNodeViewModel(false, quickController.signal)
      .then((payload) => {
        if (!alive) return

        setViewModel(payload)
        setError(null)
        setLoading(false)

        if (hasEnhancedContinuousArticleFlow(payload)) {
          return
        }

        setIsEnhancingArticle(true)
        enhancementClientTimer = globalThis.setTimeout(() => {
          if (enhancedController.signal.aborted) return
          allowEnhancementSignalsRef.current = false
          enhancedController.abort()
          if (!alive) return
          setIsEnhancingArticle(false)
          setArticleEnhancementError(
            preference.primary === 'zh'
              ? '深度文章生成超过前台等待时间，当前先展示稳定节点文章。'
              : 'Deep article synthesis exceeded the foreground wait window, so the stable node article is shown for now.',
          )
        }, ENHANCED_NODE_ARTICLE_CLIENT_TIMEOUT_MS)
        void requestNodeViewModel(true, enhancedController.signal)
          .then((enhancedPayload) => {
            if (!alive || enhancedController.signal.aborted) return
            allowEnhancementSignalsRef.current = false
            setViewModel(enhancedPayload)
            setError(null)
            setArticleEnhancementError(null)
          })
          .catch((nextError) => {
            if (!alive || enhancedController.signal.aborted) return
            const message = nextError instanceof Error ? nextError.message : String(nextError)
            logger.warn('NodePage', 'Enhanced article request failed', {
              nodeId,
              stageWindowMonths: requestedStageWindowMonths,
              error: message,
            })
            setArticleEnhancementError(message)
          })
          .finally(() => {
            if (enhancementClientTimer) {
              globalThis.clearTimeout(enhancementClientTimer)
              enhancementClientTimer = null
            }
            if (alive && !enhancedController.signal.aborted) {
              setIsEnhancingArticle(false)
            }
          })
      })
      .catch((nextError) => {
        if (alive && !quickController.signal.aborted) {
          const message = nextError instanceof Error ? nextError.message : String(nextError)
          setViewModel(null)
          setError(message)
          setLoading(false)
        }
      })

    return () => {
      alive = false
      allowEnhancementSignalsRef.current = false
      if (enhancementClientTimer) {
        globalThis.clearTimeout(enhancementClientTimer)
      }
      quickController.abort()
      enhancedController.abort()
    }
  }, [nodeId, preference.primary, requestNodeViewModel, requestedStageWindowMonths])

  useEffect(() => {
    if (!viewModel || !topicReturnRoute) return

    rememberTrail({
      id: `topic:${viewModel.topic.topicId}`,
      kind: 'topic',
      topicId: viewModel.topic.topicId,
      title: viewModel.topic.title,
      route: topicReturnRoute,
    })
    rememberTrail({
      id: `node:${viewModel.nodeId}`,
      kind: 'node',
      topicId: viewModel.topic.topicId,
      nodeId: viewModel.nodeId,
      title: viewModel.title,
      route: `${location.pathname}${location.search}`,
    })
  }, [
    location.pathname,
    location.search,
    rememberTrail,
    topicReturnRoute,
    viewModel,
  ])

  useEffect(() => {
    if (!activeAnchor) return
    const element = document.getElementById(anchorDomId(activeAnchor))
    if (!element) return
    window.setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
  }, [activeAnchor, viewModel])

  useEffect(() => {
    setHydratedReferences(new Map())
  }, [preference.primary, viewModel?.nodeId, stageWindowMonths])

  const evidenceById = useMemo(
    () => new Map((viewModel?.evidence ?? []).map((item) => [item.anchorId, item])),
    [viewModel],
  )
  const fallbackLeadParagraphs = useMemo(
    () => dedupeNarrativeParagraphs([viewModel?.headline, viewModel?.standfirst]),
    [viewModel?.headline, viewModel?.standfirst],
  )
  const legacyFlow = useMemo(
    () => dedupeNodeFlow(viewModel?.article.flow ?? [], fallbackLeadParagraphs),
    [fallbackLeadParagraphs, viewModel?.article.flow],
  )
  const enhancedIntroduction = useMemo(
    () =>
      viewModel?.enhancedArticleFlow?.find(
        (block): block is Extract<NodeArticleFlowBlock, { type: 'introduction' }> =>
          block.type === 'introduction',
      ) ?? null,
    [viewModel?.enhancedArticleFlow],
  )
  const enhancedBodyFlow = useMemo(
    () => (viewModel?.enhancedArticleFlow ?? []).filter((block) => block.type !== 'introduction'),
    [viewModel?.enhancedArticleFlow],
  )
  const hasEnhancedContinuousArticle = useMemo(
    () => enhancedBodyFlow.some((block) => block.type === 'paper-article'),
    [enhancedBodyFlow],
  )
  const leadParagraphs = useMemo(() => {
    const coreJudgmentParagraph =
      viewModel?.coreJudgment
        ? preference.primary === 'zh'
          ? viewModel.coreJudgment.content
          : viewModel.coreJudgment.contentEn || viewModel.coreJudgment.content
        : null

    if (!hasEnhancedContinuousArticle || !enhancedIntroduction) {
      return dedupeNarrativeParagraphs([coreJudgmentParagraph, ...fallbackLeadParagraphs])
    }

    const paragraphs = dedupeNarrativeParagraphs([
      coreJudgmentParagraph,
      ...splitNarrativeParagraphs(enhancedIntroduction.content),
      enhancedIntroduction.contextStatement,
      enhancedIntroduction.coreQuestion,
    ])

    return paragraphs.length > 0
      ? paragraphs
      : dedupeNarrativeParagraphs([coreJudgmentParagraph, ...fallbackLeadParagraphs])
  }, [
    enhancedIntroduction,
    fallbackLeadParagraphs,
    hasEnhancedContinuousArticle,
    preference.primary,
    viewModel?.coreJudgment,
  ])
  const surfaceMetaLine = useMemo(
    () =>
      [viewModel?.stageLabel, viewModel?.article.periodLabel, viewModel?.article.timeRangeLabel]
        .filter((item, index, values): item is string => Boolean(item) && values.indexOf(item) === index)
        .join(' | '),
    [viewModel],
  )
  const metaLine = useMemo(
    () =>
      [viewModel?.article.periodLabel, viewModel?.article.timeRangeLabel]
        .filter((item, index, values): item is string => Boolean(item) && values.indexOf(item) === index)
        .join(' | '),
    [viewModel],
  )
  void metaLine
  const editorialMetaLine = useMemo(() => {
    if (!viewModel) return ''

    const paperCountLabel = renderTemplate(
      t('node.surfacePaperCount', '{count} papers'),
      { count: viewModel.paperRoles.length },
    )
    const evidenceCount =
      viewModel.stats.figureCount + viewModel.stats.tableCount + viewModel.stats.formulaCount
    const evidenceLabel =
      evidenceCount > 0
        ? renderTemplate(t('node.surfaceEvidenceCount', '{count} figures, tables, and formulas'), {
            count: evidenceCount,
          })
        : ''

    return [viewModel.stageLabel, paperCountLabel, evidenceLabel]
      .filter((item, index, values): item is string => Boolean(item) && values.indexOf(item) === index)
      .join(' | ')
  }, [t, viewModel])
  const activeMainView: ViewMode = viewMode === 'research' ? 'research' : 'article'
  const showResearchToggle = true
  const showResearchOnly = activeMainView === 'research'
  const showArticleFlow = activeMainView === 'article'
  const articleMarkdown = useMemo(
    () => viewModel?.articleMarkdown?.trim() ?? '',
    [viewModel?.articleMarkdown],
  )
  const hasMarkdownArticle = articleMarkdown.length > 0
  const normalizedTitleEn = (viewModel?.titleEn ?? '').replace(/\s+/gu, ' ').trim()
  const normalizedTitle = (viewModel?.title ?? '').replace(/\s+/gu, ' ').trim()
  const showDistinctTitleEn =
    Boolean(normalizedTitleEn) && normalizedTitleEn.toLowerCase() !== normalizedTitle.toLowerCase()
  const leadParagraphsToRender = leadParagraphs
  const researchHeaderSummary = useMemo(() => {
    if (!viewModel) return ''

    return (
      viewModel.researchView.coreJudgment?.content ||
      viewModel.researchView.evidence.paperBriefs[0]?.summary ||
      viewModel.standfirst ||
      viewModel.summary ||
      ''
    )
  }, [viewModel])
  const researchHeaderHighlights = useMemo(() => {
    if (!viewModel) {
      return [] as Array<{
        id: string
        label: string
        value: string
        detail?: string
      }>
    }

    const evidenceCount =
      viewModel.stats.figureCount + viewModel.stats.tableCount + viewModel.stats.formulaCount
    const openQuestion = viewModel.researchView.problems.openQuestions[0]
    const featuredContribution = viewModel.researchView.evidence.paperBriefs[0]?.contribution || ''

    return [
      {
        id: 'papers',
        label: t('node.researchHeaderPaperCoverage', 'Paper coverage'),
        value: renderTemplate(t('node.surfacePaperCount', '{count} papers'), {
          count: viewModel.paperRoles.length,
        }),
        detail:
          viewModel.paperRoles.length > 0
            ? t(
                'node.researchHeaderPaperCoverageDetail',
                'The article and research views stay grounded in every paper folded into this node.',
              )
            : '',
      },
      {
        id: 'evidence',
        label: t('node.researchHeaderEvidenceCoverage', 'Evidence coverage'),
        value: renderTemplate(t('node.surfaceEvidenceCount', '{count} figures, tables, and formulas'), {
          count: evidenceCount,
        }),
        detail:
          evidenceCount > 0
            ? [
                renderTemplate(t('node.surfaceFigureCount', '{count} figures'), {
                  count: viewModel.stats.figureCount,
                }),
                renderTemplate(t('node.surfaceTableCount', '{count} tables'), {
                  count: viewModel.stats.tableCount,
                }),
                renderTemplate(t('node.surfaceFormulaCount', '{count} formulas'), {
                  count: viewModel.stats.formulaCount,
                }),
              ]
                .filter((item) => !item.startsWith('0 '))
                .join(' · ')
            : t(
                'node.researchHeaderEvidenceCoverageDetail',
                'No renderable figure, table, or formula anchors have landed yet.',
              ),
      },
      {
        id: 'takeaway',
        label: t('node.researchHeaderTakeaway', 'Current takeaway'),
        value:
          openQuestion ||
          featuredContribution ||
          researchHeaderSummary,
      },
    ].filter((item) => Boolean(item.value.trim()))
  }, [researchHeaderSummary, t, viewModel])
  const workbenchTopicId = viewModel?.topic.topicId ?? ''
  const workbenchOpen = workbenchTopicId
    ? readingWorkspaceState.workbenchByTopic[workbenchTopicId]?.open ?? false
    : false
  const desktopWorkbenchOverlayOffset = TOPIC_WORKBENCH_DESKTOP_RESERVED_SPACE + 40
  const isWorkbenchOpenOnDesktop = isDesktopViewport && workbenchOpen
  const desktopNodeContentMaxWidth = '1880px'
  const articleCanvasMaxWidth = 'min(210mm, 100%)'
  const researchCanvasMaxWidth = '1180px'
  const desktopNodeShellMaxWidth = isWorkbenchOpenOnDesktop
    ? `min(${desktopNodeContentMaxWidth}, calc(100vw - ${desktopWorkbenchOverlayOffset}px))`
    : desktopNodeContentMaxWidth
  const suggestedQuestions = useMemo(() => [] as string[], [])
  const contextSuggestions = useMemo(
    () =>
      viewModel
        ? ([
            {
              id: `node:${viewModel.nodeId}`,
              kind: 'node',
              label: viewModel.title,
              description: viewModel.headline || viewModel.summary,
              route: withStageWindowRoute(`/node/${viewModel.nodeId}`, stageWindowMonths),
            },
            ...viewModel.paperRoles.slice(0, 2).map((paper) => ({
              id: `paper:${paper.paperId}`,
              kind: 'paper' as const,
              label: paper.title,
              description: paper.contribution || paper.role,
              route: withStageWindowRoute(buildPaperAnchor(viewModel.nodeId, paper.paperId), stageWindowMonths),
            })),
          ] satisfies ContextPill[])
        : [],
    [stageWindowMonths, viewModel],
  )
  const resources = useMemo(
    () =>
      viewModel
        ? [
            {
              id: `node:${viewModel.nodeId}`,
              kind: 'node' as const,
              title: viewModel.title,
              subtitle:
                viewModel.stageLabel ||
                renderTemplate(
                  t('workbench.nodeStageLabel', 'Stage {stage}'),
                  { stage: viewModel.stageIndex },
                ),
              description: viewModel.explanation,
              route: withStageWindowRoute(`/node/${viewModel.nodeId}`, stageWindowMonths),
            },
            ...viewModel.paperRoles.slice(0, 4).map((paper) => ({
              id: paper.paperId,
              kind: 'paper' as const,
              title: paper.title,
              subtitle: `${paper.role}${paper.publishedAt ? ` | ${formatPublishedDate(paper.publishedAt)}` : ''}`,
              description: paper.contribution,
              route: withStageWindowRoute(buildPaperAnchor(viewModel.nodeId, paper.paperId), stageWindowMonths),
            })),
          ]
        : [],
    [stageWindowMonths, t, viewModel],
  )
const papers = useMemo(() => viewModel?.paperRoles ?? [], [viewModel])
  const referenceEntries = useMemo<WorkbenchReferenceEntry[]>(
    () => viewModel?.references ?? [],
    [viewModel?.references],
  )
  const downloadableReferences = useMemo(
    () => referenceEntries.filter((entry) => Boolean(entry.pdfUrl)),
    [referenceEntries],
  )
  const selectedDownloadReferences = useMemo(
    () => downloadableReferences.filter((entry) => selectedReferenceIds.includes(entry.paperId)),
    [downloadableReferences, selectedReferenceIds],
  )
  useEffect(() => {
    setSelectedReferenceIds(downloadableReferences.map((entry) => entry.paperId))
  }, [nodeId, downloadableReferences])
  const toggleReferenceSelection = useCallback((paperId: string) => {
    setSelectedReferenceIds((current) =>
      current.includes(paperId)
        ? current.filter((item) => item !== paperId)
        : [...current, paperId],
    )
  }, [])
  const downloadSelectedPdfs = useCallback(async () => {
    if (selectedDownloadReferences.length === 0) return

    setIsDownloadingReferences(true)
    setReferenceDownloadProgress(0)

    try {
      const zip = new JSZip()
      const total = selectedDownloadReferences.length
      let completed = 0
      const failedPapers: string[] = []

      for (const entry of selectedDownloadReferences) {
        if (!entry.pdfUrl) {
          failedPapers.push(entry.title)
          continue
        }

        try {
          // Use backend proxy route to avoid CORS issues
          const response = await fetch(`/api/pdf/proxy/${entry.paperId}`)
          if (!response.ok) {
            throw new Error(`Proxy fetch failed: ${response.status}`)
          }
          const blob = await response.blob()
          const safeTitle = entry.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
          zip.file(`${safeTitle}.pdf`, blob)
        } catch (e) {
          logger.error('NodePage', `Failed to fetch PDF: ${entry.title}`, e)
          failedPapers.push(entry.title)
        }

        completed++
        if (downloadMountedRef.current) {
          setReferenceDownloadProgress(Math.round((completed / total) * 100))
        }
      }

      // Only proceed if still mounted
      if (!downloadMountedRef.current) return

      const content = await zip.generateAsync({ type: 'blob' })
      const safeNodeTitle = viewModel?.title?.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50) || 'papers'
      saveAs(content, `${safeNodeTitle}-papers.zip`)

      // Show user feedback for failed downloads
      if (failedPapers.length > 0) {
        logger.warn('NodePage', `Failed to download ${failedPapers.length} papers: ${failedPapers.join(', ')}`)
        // TODO: Consider adding toast notification for user visibility
      }
    } catch (e) {
      logger.error('NodePage', 'Failed to create ZIP', e)
    } finally {
      if (downloadMountedRef.current) {
        setIsDownloadingReferences(false)
        setReferenceDownloadProgress(0)
      }
    }
  }, [selectedDownloadReferences, viewModel?.title])
  const narrativeReferenceIds = useMemo(
    () => {
      if (hasEnhancedContinuousArticle) {
        return collectNarrativeReferenceIds([
          ...leadParagraphs,
          ...enhancedBodyFlow.flatMap((block) => {
            if (block.type === 'paper-article') {
              return [
                block.introduction,
                ...(block.subsections?.map((subsection) => subsection.content) ?? []),
                block.conclusion,
              ]
            }

            if (block.type === 'paper-transition') {
              return [block.content]
            }

            if (block.type === 'synthesis') {
              return [block.content, ...block.insights]
            }

            if (block.type === 'closing') {
              return [block.content, ...block.keyTakeaways]
            }

            return []
          }),
        ])
      }

      return collectNarrativeReferenceIds([
        ...fallbackLeadParagraphs,
        viewModel?.summary,
        viewModel?.explanation,
        ...legacyFlow.flatMap((block) => {
          if (block.type === 'text') return block.body
          if (block.type === 'comparison') {
            return [block.summary, ...block.points.map((point) => point.detail)]
          }
          if (block.type === 'critique') {
            return [block.summary, ...block.bullets]
          }
          if (block.type === 'closing') {
            return block.body
          }
          return []
        }),
      ])
    },
    [
      enhancedBodyFlow,
      fallbackLeadParagraphs,
      hasEnhancedContinuousArticle,
      leadParagraphs,
      legacyFlow,
      viewModel,
    ],
  )
  const baseArticleReferenceMap = useMemo(() => {
    const entries = new Map<string, ArticleInlineReference>()

    if (viewModel) {
      setInlineReference(entries, {
        id: viewModel.nodeId,
        kind: 'node',
        label: viewModel.title,
        route: `/node/${viewModel.nodeId}`,
      })
    }

    for (const paper of papers) {
      setInlineReference(entries, {
        id: paper.paperId,
        kind: 'paper',
        label: paper.title,
        route: buildPaperAnchor(nodeId, paper.paperId),
      })
    }

    for (const paper of viewModel?.comparisonBlocks.flatMap((block) => block.papers) ?? []) {
      setInlineReference(entries, {
        id: paper.paperId,
        kind: 'paper',
        label: paper.title,
        route: buildPaperAnchor(nodeId, paper.paperId),
      })
    }

    for (const block of legacyFlow) {
      if (block.type === 'paper-break') {
        setInlineReference(entries, {
          id: block.paperId,
          kind: 'paper',
          label: block.title,
          route: buildPaperAnchor(nodeId, block.paperId),
        })
      }

      if (block.type === 'text' && block.paperId) {
        setInlineReference(entries, {
          id: block.paperId,
          kind: 'paper',
          label: block.paperTitle || block.title || block.paperId,
          route: buildPaperAnchor(nodeId, block.paperId),
        })
      }
    }

    for (const block of enhancedBodyFlow) {
      if (block.type !== 'paper-article') continue

      setInlineReference(entries, {
        id: block.paperId,
        kind: 'paper',
        label: block.title,
        route: buildPaperAnchor(nodeId, block.paperId),
      })
    }

    for (const evidence of viewModel?.evidence ?? []) {
      if (!evidence.sourcePaperId) continue
      setInlineReference(entries, {
        id: evidence.sourcePaperId,
        kind: 'paper',
        label: evidence.sourcePaperTitle || evidence.sourcePaperId,
        route: buildPaperAnchor(nodeId, evidence.sourcePaperId),
      })
    }

    // Add evidence anchors (figure/table/formula/section) to reference map
    for (const evidence of viewModel?.evidence ?? []) {
      const anchorId = evidence.anchorId.toLowerCase()
      const shortLabel = evidence.label
      setInlineReference(entries, {
        id: anchorId,
        kind: evidence.type,
        label: shortLabel,
        route: `/node/${nodeId}?evidence=${encodeURIComponent(evidence.anchorId)}`,
      })
    }

    return entries
  }, [enhancedBodyFlow, legacyFlow, nodeId, papers, viewModel])
  const articleReferenceMap = useMemo(() => {
    const merged = new Map(baseArticleReferenceMap)

    for (const [key, value] of hydratedReferences.entries()) {
      if (!merged.has(key)) {
        merged.set(key, value)
      }
    }

    return merged
  }, [baseArticleReferenceMap, hydratedReferences])
  const missingNarrativeReferenceIds = useMemo(
    () =>
      narrativeReferenceIds.filter(
        (id) =>
          (id.startsWith('paper-') || id.startsWith('node-')) &&
          !baseArticleReferenceMap.has(id) &&
          !hydratedReferences.has(id),
      ),
    [baseArticleReferenceMap, hydratedReferences, narrativeReferenceIds],
  )
  useEffect(() => {
    if (!viewModel || missingNarrativeReferenceIds.length === 0) return

    let alive = true

    Promise.all(
      missingNarrativeReferenceIds.map(async (referenceId) => {
        try {
          if (referenceId.startsWith('paper-')) {
            const payload = await apiGet<PaperViewModel>(
              withOptionalStageWindowQuery(`/api/papers/${referenceId}/view-model`, stageWindowMonths),
            )
            const primaryNode = payload.relatedNodes[0]
            return {
              id: referenceId,
              kind: 'paper' as const,
              label: payload.title,
              route: primaryNode
                ? `/node/${primaryNode.nodeId}?anchor=${encodeURIComponent(`paper:${referenceId}`)}`
                : `/topic/${payload.topic.topicId}?anchor=${encodeURIComponent(`paper:${referenceId}`)}`,
            }
          }

          if (referenceId.startsWith('node-')) {
            const payload = await apiGet<NodeViewModel>(
              withOptionalStageWindowQuery(`/api/nodes/${referenceId}/view-model`, stageWindowMonths),
            )
            return {
              id: referenceId,
              kind: 'node' as const,
              label: payload.title,
              route: `/node/${referenceId}`,
            }
          }
        } catch {
          return null
        }

        return null
      }),
    ).then((references) => {
      if (!alive) return

      setHydratedReferences((current) => {
        const next = new Map(current)
        let changed = false

        for (const reference of references) {
          if (!reference) continue
          const key = reference.id.toLowerCase()
          if (next.has(key)) continue
          next.set(key, reference)
          changed = true
        }

        return changed ? next : current
      })
    })

    return () => {
      alive = false
    }
  }, [missingNarrativeReferenceIds, stageWindowMonths, viewModel])

  const openEvidence = useCallback((anchorId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('evidence', anchorId)
    next.set('stageMonths', String(stageWindowMonths))
    next.delete('anchor')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, stageWindowMonths])

  const focusAnchor = useCallback(
    (anchorId: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('anchor', anchorId)
      next.set('stageMonths', String(stageWindowMonths))
      next.delete('evidence')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams, stageWindowMonths],
  )

  const handleCitation = (citation: CitationRef) => {
    if (
      citation.type === 'figure' ||
      citation.type === 'table' ||
      citation.type === 'formula' ||
      citation.type === 'section'
    ) {
      void openEvidence(citation.anchorId)
      return
    }

    if (citation.type === 'paper') {
      const citedPaperId = citation.anchorId.startsWith('paper:')
        ? citation.anchorId.slice('paper:'.length)
        : null
      if (citedPaperId && papers.some((paper) => paper.paperId === citedPaperId)) {
        focusAnchor(`paper:${citedPaperId}`)
        return
      }
      navigate(
        withStageWindowRoute(
          resolvePrimaryReadingRouteForPaper({
            paperId: citedPaperId ?? citation.anchorId,
            route: citation.route,
            topicId: viewModel?.topic.topicId,
          }),
          stageWindowMonths,
        ),
      )
      return
    }

    navigate(withStageWindowRoute(citation.route, stageWindowMonths))
  }

  const handleAction = (action: SuggestedAction) => {
    if (!action.targetId || !viewModel) return

    if (action.targetId.startsWith('stage:')) {
      navigate(
        withStageWindowRoute(
          `/topic/${viewModel.topic.topicId}?anchor=${encodeURIComponent(action.targetId)}`,
          stageWindowMonths,
        ),
      )
      return
    }

    if (/^(section|figure|table|formula):/u.test(action.targetId)) {
      void openEvidence(action.targetId)
      return
    }

    if (action.targetId.startsWith('node:')) {
      const nextNodeId = action.targetId.slice('node:'.length)
      if (nextNodeId === viewModel.nodeId) {
        focusAnchor('node:intro')
        return
      }

      navigate(withStageWindowRoute(`/node/${nextNodeId}`, stageWindowMonths))
      return
    }

    if (action.targetId.startsWith('paper:')) {
      const nextPaperId = action.targetId.slice('paper:'.length)
      if (papers.some((paper) => paper.paperId === nextPaperId)) {
        focusAnchor(`paper:${nextPaperId}`)
        return
      }

      const referencedPaper = articleReferenceMap.get(nextPaperId.toLowerCase())
      navigate(
        withStageWindowRoute(
          resolvePrimaryReadingRouteForPaper({
            paperId: nextPaperId,
            route: referencedPaper?.route,
            topicId: viewModel.topic.topicId,
          }),
          stageWindowMonths,
        ),
      )
      return
    }

    navigate(
      withStageWindowRoute(
        `/topic/${viewModel.topic.topicId}?anchor=${encodeURIComponent(action.targetId)}`,
        stageWindowMonths,
      ),
    )
  }

  const handleSearchResult = useCallback(
    (item: SearchResultItem) => {
      if (item.anchorId && ['section', 'figure', 'table', 'formula'].includes(item.kind)) {
        void openEvidence(item.anchorId)
        return
      }

      if (item.kind === 'paper' && papers.some((paper) => paper.paperId === item.id)) {
        focusAnchor(`paper:${item.id}`)
        return
      }

      if (item.kind === 'node' && item.id === nodeId && item.anchorId) {
        focusAnchor(item.anchorId)
        return
      }

      if (viewModel && item.kind === 'topic' && item.topicId === viewModel.topic.topicId && item.anchorId) {
        navigate(
          withStageWindowRoute(
            `/topic/${viewModel.topic.topicId}?anchor=${encodeURIComponent(item.anchorId)}`,
            stageWindowMonths,
          ),
        )
        return
      }

      const resolvedRoute =
        item.kind === 'paper'
          ? resolvePrimaryReadingRouteForPaper({
              paperId: item.id,
              route: item.route,
              nodeRoute: item.nodeRoute,
              relatedNodes: item.relatedNodes,
              topicId: item.topicId ?? viewModel?.topic.topicId,
            })
          : item.route

      navigate(withStageWindowRoute(resolvedRoute, stageWindowMonths))
    },
    [focusAnchor, navigate, nodeId, openEvidence, papers, stageWindowMonths, viewModel],
  )

  const sidebarShell = viewModel ? (
    <RightSidebarShell
      topicId={viewModel.topic.topicId}
      topicTitle={viewModel.topic.title}
      suggestedQuestions={suggestedQuestions}
      contextSuggestions={contextSuggestions}
      resources={resources}
      references={referenceEntries}
      referenceContextLabel={viewModel.title}
      selectedReferenceIds={selectedReferenceIds}
      onToggleReferenceSelection={toggleReferenceSelection}
      onSelectAllReferences={() =>
        setSelectedReferenceIds(downloadableReferences.map((entry) => entry.paperId))
      }
      onClearReferenceSelection={() => setSelectedReferenceIds([])}
      onDownloadSelectedReferences={downloadSelectedPdfs}
      isDownloadingReferences={isDownloadingReferences}
      referenceDownloadProgress={referenceDownloadProgress}
      searchStageWindowMonths={stageWindowMonths}
      onOpenCitation={handleCitation}
      onAction={handleAction}
      onOpenSearchResult={handleSearchResult}
      surfaceMode="reading"
    />
  ) : null

  if (loading) {
    return (
      <>
        <main
          data-testid="node-reading"
          data-node-main-view={activeMainView}
          className="px-4 pb-20 pt-6 md:px-6 xl:px-10"
        >
          <div
            className={isWorkbenchOpenOnDesktop ? 'mr-auto' : 'mx-auto'}
            style={{
              maxWidth: desktopNodeShellMaxWidth,
            }}
          >
            <div className="mx-auto py-10" style={{ maxWidth: articleCanvasMaxWidth }}>
              <article
                data-testid="node-article-flow"
                aria-busy="true"
                className="article-prose a4-container space-y-6"
              >
                <div className="h-4 w-40 rounded-full bg-black/8" />
                <div className="space-y-3">
                  <div className="h-4 w-full rounded-full bg-black/6" />
                  <div className="h-4 w-[92%] rounded-full bg-black/6" />
                  <div className="h-4 w-[84%] rounded-full bg-black/6" />
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-full rounded-full bg-black/6" />
                  <div className="h-4 w-[88%] rounded-full bg-black/6" />
                  <div className="h-4 w-[79%] rounded-full bg-black/6" />
                </div>
              </article>
              <div className="mt-6 text-[14px] text-black/56">
                {copy('reading.nodeLoading', t('node.loading', 'Loading node...'))}
              </div>
            </div>
          </div>
        </main>
        {sidebarShell}
      </>
    )
  }

  if (!viewModel) {
    return (
      <>
        <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
          <div className="mx-auto max-w-[920px] py-12">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
            >
              <ArrowLeft className="h-4 w-4" />
              {copy('reading.backHome', t('topic.backHome', 'Back to Home'))}
            </Link>
            <h1 className="mt-6 text-[32px] font-semibold text-black">
              {copy('reading.nodeUnavailableTitle', t('node.unavailableTitle', 'Node unavailable'))}
            </h1>
            {error ? (
              <p className="mt-4 max-w-[760px] text-[14px] leading-7 text-black/58">{error}</p>
            ) : null}
          </div>
        </main>
        {sidebarShell}
      </>
    )
  }

  return (
    <>
    <main
      data-testid="node-reading"
      data-node-main-view={activeMainView}
      className="px-4 pb-20 pt-6 md:px-6 xl:px-10"
    >
      <div
        className={isWorkbenchOpenOnDesktop ? 'mr-auto' : 'mx-auto'}
        style={{
          maxWidth: desktopNodeShellMaxWidth,
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to={topicReturnRoute ?? withStageWindowRoute(viewModel.topic.route, stageWindowMonths)}
            className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy('reading.backTopic', t('node.backTopic', 'Back to Topic'))}
          </Link>
          <div className="flex items-center gap-3">
            {showResearchToggle ? (
              <ResearchViewToggle mode={viewMode} onChange={handleViewModeChange} />
            ) : null}

            {/* Zoom Controls - only show in article view */}
            {activeMainView === 'article' ? (
              <div className="inline-flex items-center gap-1 rounded-[10px] border border-black/10 bg-white px-2 py-1">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= MIN_ZOOM}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-black/60 transition hover:bg-black/5 hover:text-black disabled:opacity-40"
                  title={t('node.zoomOut', 'Zoom out')}
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[3rem] text-center text-[12px] text-black/60">
                  {zoomLevel}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= MAX_ZOOM}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-black/60 transition hover:bg-black/5 hover:text-black disabled:opacity-40"
                  title={t('node.zoomIn', 'Zoom in')}
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {zoomLevel !== 100 ? (
                  <button
                    onClick={handleZoomReset}
                    className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-black/60 transition hover:bg-black/5 hover:text-black"
                    title={t('node.zoomReset', 'Reset zoom')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              onClick={() => setZoteroDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-[10px] border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-black/70 transition hover:bg-black/5 hover:text-black"
            >
              <Upload className="h-4 w-4" />
              {t('zotero.title', 'Export to Zotero')}
            </button>
          </div>
        </div>
        <div className="mt-8">
          <div className="min-w-0">
            {showResearchOnly ? (
              <section
                data-testid="node-research-header"
                id={anchorDomId('node:intro')}
                className="mx-auto"
                style={{ maxWidth: researchCanvasMaxWidth }}
              >
                <div className="text-[11px] uppercase tracking-[0.24em] text-black/38">
                  {editorialMetaLine || surfaceMetaLine}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-black/40">
                  {t('node.researchView', 'Research View')}
                </div>
                <h1 className="mt-2 font-display text-[22px] leading-[1.2] text-black md:text-[28px]">
                  {viewModel.title}
                </h1>
                {showDistinctTitleEn ? (
                  <div className="mt-1 text-[13px] leading-6 text-black/40">{viewModel.titleEn}</div>
                ) : null}
                {researchHeaderHighlights.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {researchHeaderHighlights.slice(0, 2).map((highlight) => (
                      <span
                        key={highlight.id}
                        className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-black/54"
                      >
                        <span className="font-medium text-black/72">{highlight.label}: </span>
                        <span>{highlight.value}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <header
                id={anchorDomId('node:intro')}
                className="mx-auto w-full"
                style={{ maxWidth: articleCanvasMaxWidth }}
              >
                <div className="text-[11px] uppercase tracking-[0.24em] text-black/38">
                  {editorialMetaLine || surfaceMetaLine}
                </div>
                <h1 className="mt-4 font-display text-[26px] leading-[1.16] text-black md:text-[38px]">
                  {viewModel.title}
                </h1>
                {showDistinctTitleEn ? (
                  <div className="mt-3 text-[14px] leading-7 text-black/42">{viewModel.titleEn}</div>
                ) : null}
                {isEnhancingArticle ? (
                  <div
                    data-testid="node-article-enhancing-status"
                    className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-900/80"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
                    <span className="truncate">
                      {researchProgress?.message ||
                        t(
                          'node.enhancingArticle',
                          preference.primary === 'zh'
                            ? '深度文章仍在结合图、表、公式继续生成。'
                            : 'Deep article synthesis is still grounding figures, tables, and formulas.',
                        )}
                    </span>
                  </div>
                ) : null}
                {!isEnhancingArticle && articleEnhancementError ? (
                  <div
                    data-testid="node-article-enhancement-error"
                    className="mt-4 rounded-[14px] border border-red-200 bg-red-50/80 px-4 py-3 text-[13px] leading-6 text-red-900/72"
                  >
                    {articleEnhancementError ||
                      t(
                        'node.enhancingArticleUnavailable',
                        preference.primary === 'zh'
                          ? '这次请求未完成深度文章更新，当前先展示最新的稳定节点文章。'
                          : 'The deep article update did not finish on this request. Showing the latest stable node article.',
                      )}
                  </div>
                ) : null}

                {!hasMarkdownArticle ? leadParagraphsToRender.map((paragraph, index) => (
                  <p
                    key={`${index}:${paragraph}`}
                    className={
                      index === 0
                        ? 'mt-5 max-w-[840px] text-[15.6px] leading-[2.02] text-black/74'
                        : 'mt-5 max-w-[840px] text-[15px] leading-[2.02] text-black/66'
                    }
                  >
                    {renderInlineArticleText(paragraph, articleReferenceMap, stageWindowMonths)}
                  </p>
                )) : null}
              </header>
            )}

            {showArticleFlow ? (
              <div
                className="zoom-container mx-auto mt-14"
                style={{
                  maxWidth: articleCanvasMaxWidth,
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'top center',
                }}
              >
              <article
                data-testid={hasMarkdownArticle ? undefined : 'node-article-flow'}
                className={`article-prose a4-container${hasMarkdownArticle ? '' : ' space-y-16'}`}
              >
                {hasMarkdownArticle ? (
                  <ArticleMarkdown dataTestId="node-article-flow" content={articleMarkdown} />
                ) : (
                  <>
                    {leadParagraphsToRender.length === 0 && hasEnhancedContinuousArticle && enhancedIntroduction ? (
                      <NodeIntroSection
                        introduction={enhancedIntroduction}
                        referenceMap={articleReferenceMap}
                        stageWindowMonths={stageWindowMonths}
                        t={t}
                        preference={preference}
                      />
                    ) : null}

                    {hasEnhancedContinuousArticle
                      ? enhancedBodyFlow.map((block) => (
                          <EnhancedFlowBlock
                            key={block.id}
                            block={block}
                            referenceMap={articleReferenceMap}
                            evidenceById={evidenceById}
                            stageWindowMonths={stageWindowMonths}
                            activeAnchor={activeAnchor}
                            t={t}
                            preference={preference}
                          />
                        ))
                      : legacyFlow.map((block) => (
                          <FlowBlock
                            key={block.id}
                            block={block}
                            nodeId={viewModel.nodeId}
                            evidenceById={evidenceById}
                            activeAnchor={activeAnchor}
                            referenceMap={articleReferenceMap}
                            stageWindowMonths={stageWindowMonths}
                            whyItMattersLabel={t('node.whyItMatters', 'Why it matters')}
                          />
                        ))}
                  </>
                )}
              </article>
              </div>
            ) : null}

            {showResearchOnly ? (
              <div
                data-testid="node-research-view"
                className="mx-auto mt-10"
                style={{ maxWidth: researchCanvasMaxWidth }}
              >
                <ResearchView viewModel={viewModel} onOpenEvidence={openEvidence} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
      {sidebarShell}
      <ZoteroExportDialog
        isOpen={zoteroDialogOpen}
        onClose={() => setZoteroDialogOpen(false)}
        nodeId={nodeId}
        topicName={viewModel?.title}
        paperIds={papers.map((p) => p.paperId)}
      />
    </>
  )
}

function FlowBlock({
  block,
  nodeId,
  evidenceById,
  activeAnchor,
  referenceMap,
  stageWindowMonths,
  whyItMattersLabel,
}: {
  block: ArticleFlowBlock
  nodeId: string
  evidenceById: Map<string, EvidenceExplanation>
  activeAnchor: string | null
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  whyItMattersLabel: string
}) {
  if (block.type === 'text') {
    return (
      <section id={block.anchorId ? anchorDomId(block.anchorId) : undefined}>
        {block.title ? (
          <h2 className="mb-4 text-[26px] font-semibold leading-[1.2] text-black">{block.title}</h2>
        ) : null}
        <NarrativeParagraphGroup
          paragraphs={block.body}
          referenceMap={referenceMap}
          stageWindowMonths={stageWindowMonths}
          className="text-[16px] leading-9 text-black/68"
        />
      </section>
    )
  }

  if (block.type === 'paper-break') {
    const highlighted = activeAnchor === `paper:${block.paperId}`
    const publishedAtLabel = formatPublishedDate(block.publishedAt)

    return (
      <section
        id={anchorDomId(`paper:${block.paperId}`)}
        className={`pt-10 ${highlighted ? 'scroll-mt-24' : ''}`}
      >
        <div className="text-[12px] leading-6 text-black/44">
          {[block.role, publishedAtLabel].filter(Boolean).join(' | ')}
        </div>
        <h2 className="mt-2 text-[28px] font-semibold leading-[1.2] text-black">{block.title}</h2>
        {block.titleEn ? <div className="mt-2 text-[13px] text-black/44">{block.titleEn}</div> : null}
        <p className="mt-4 text-[16px] leading-9 text-black/66">
          {renderInlineArticleText(block.contribution, referenceMap, stageWindowMonths)}
        </p>
      </section>
    )
  }

  if (block.type === 'comparison') {
    return (
      <section className="pt-6">
        <h2 className="text-[26px] font-semibold leading-[1.2] text-black">{block.title}</h2>
        <p className="mt-4 text-[16px] leading-8 text-black/66">
          {renderInlineArticleText(block.summary, referenceMap, stageWindowMonths)}
        </p>
        <div className="mt-5 space-y-4">
          {block.points.map((point) => (
            <p key={point.label} className="text-[15px] leading-8 text-black/64">
              <strong className="font-medium text-black">{point.label}: </strong>
              {renderInlineArticleText(point.detail, referenceMap, stageWindowMonths)}
            </p>
          ))}
        </div>
      </section>
    )
  }

  if (block.type === 'critique') {
    return (
      <section className="pt-6">
        <h2 className="text-[24px] font-semibold text-black">{block.title}</h2>
        <p className="mt-4 text-[16px] leading-8 text-black/66">
          {renderInlineArticleText(block.summary, referenceMap, stageWindowMonths)}
        </p>
        <div className="mt-4 space-y-3">
          {block.bullets.map((item) => (
            <p key={item} className="text-[15px] leading-8 text-black/62">
              {renderInlineArticleText(item, referenceMap, stageWindowMonths)}
            </p>
          ))}
        </div>
      </section>
    )
  }

  if (block.type === 'closing') {
    return (
      <section className="pt-6">
        {block.title ? <h2 className="text-[24px] font-semibold text-black">{block.title}</h2> : null}
        <NarrativeParagraphGroup
          paragraphs={block.body}
          referenceMap={referenceMap}
          stageWindowMonths={stageWindowMonths}
          className="text-[16px] leading-9 text-black/66"
        />
      </section>
    )
  }

  if (block.type === 'paper-transition') {
    return (
      <PaperTransitionParagraph
        anchorId={block.anchorId}
        content={block.content}
        referenceMap={referenceMap}
        stageWindowMonths={stageWindowMonths}
      />
    )
  }

  const evidence = block.evidence ?? evidenceById.get(block.id.replace(/^flow-/u, ''))
  if (!evidence) return null
  void nodeId
  return (
    <ReadingEvidenceBlock
      anchorId={anchorDomId(evidence.anchorId)}
      evidence={evidence}
      highlighted={activeAnchor === evidence.anchorId}
      whyItMattersLabel={whyItMattersLabel}
      variant="article-inline"
    />
  )
}

function NarrativeParagraphGroup({
  paragraphs,
  referenceMap,
  stageWindowMonths,
  className,
}: {
  paragraphs: Array<string | null | undefined>
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  className: string
}) {
  const normalized = paragraphs.flatMap((paragraph) => splitNarrativeParagraphs(paragraph))

  return (
    <div className="mt-4 space-y-4">
      {normalized.map((paragraph, index) => (
        <p key={`${index}:${paragraph}`} className={className}>
          {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
        </p>
      ))}
    </div>
  )
}

function PaperTransitionParagraph({
  anchorId,
  content,
  referenceMap,
  stageWindowMonths,
}: {
  anchorId: string
  content: string
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
}) {
  return (
    <section id={anchorDomId(anchorId)} className="pt-5">
      <p className="text-[15px] leading-8 text-black/52 italic">
        {renderInlineArticleText(content, referenceMap, stageWindowMonths)}
      </p>
    </section>
  )
}

function EnhancedFlowBlock({
  block,
  referenceMap,
  evidenceById,
  stageWindowMonths,
  activeAnchor,
  t,
  preference,
}: {
  block: Exclude<NodeArticleFlowBlock, { type: 'introduction' }>
  referenceMap: Map<string, ArticleInlineReference>
  evidenceById: Map<string, EvidenceExplanation>
  stageWindowMonths: number
  activeAnchor: string | null
  t: (key: string, fallback?: string) => string
  preference: LanguagePreference
}) {
  if (block.type === 'paper-article') {
    // Support both new poster-style (v2) and legacy (v1) content structures
    const isPosterStyle = block.contentVersion === 'v2' || (block.paragraphs && block.paragraphs.length > 0)

    return (
      <PaperSectionBlock
        paperId={block.paperId}
        title={block.title}
        titleEn={block.titleEn}
        authors={block.authors}
        publishedAt={block.publishedAt}
        citationCount={block.citationCount}
        role={block.role}
        // Legacy fields (v1)
        introduction={block.introduction}
        subsections={block.subsections}
        conclusion={block.conclusion}
        // New poster-style fields (v2)
        coreThesis={block.coreThesis}
        coreThesisEn={block.coreThesisEn}
        paragraphs={block.paragraphs}
        closingInsight={block.closingInsight}
        closingInsightEn={block.closingInsightEn}
        contentVersion={block.contentVersion ?? (isPosterStyle ? 'v2' : 'v1')}
        anchorId={anchorDomId(block.anchorId)}
        coverImage={block.coverImage}
        originalUrl={block.originalUrl}
        pdfUrl={block.pdfUrl}
        referenceMap={referenceMap}
        evidenceById={evidenceById}
        stageWindowMonths={stageWindowMonths}
        activeAnchor={activeAnchor}
      />
    )
  }

  if (block.type === 'paper-transition') {
    return (
      <PaperTransitionParagraph
        anchorId={block.anchorId}
        content={block.content}
        referenceMap={referenceMap}
        stageWindowMonths={stageWindowMonths}
      />
    )
  }

  if (block.type === 'synthesis') {
    return (
      <NodeSynthesisSection
        synthesis={block}
        referenceMap={referenceMap}
        stageWindowMonths={stageWindowMonths}
        t={t}
        preference={preference}
      />
    )
  }

  if (block.type === 'critique') {
    return null
  }

  return (
    <section className="pt-6">
      <h2 className="text-[24px] font-semibold text-black">{block.title}</h2>
      <NarrativeParagraphGroup
        paragraphs={[block.content, ...block.keyTakeaways, block.transitionToNext]}
        referenceMap={referenceMap}
        stageWindowMonths={stageWindowMonths}
        className="text-[16px] leading-9 text-black/66"
      />
    </section>
  )
}

export default NodePage
