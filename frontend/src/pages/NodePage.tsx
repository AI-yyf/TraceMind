import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Upload, X } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

import {
  type ArticleInlineReference,
  parseInlineArticleReferences,
  renderInlineArticleText,
} from '@/components/reading/ArticleInlineText'
import { PaperSectionBlock } from '@/components/reading/PaperSectionBlock'
import { RightSidebarShell } from '@/components/topic/RightSidebarShell'
import { ZoteroExportDialog } from '@/components/ZoteroExportDialog'
import { ResearchViewToggle, type ViewMode } from '@/components/node/ResearchViewToggle'
import { ResearchView } from '@/components/node/ResearchView'
import { usePageScrollRestoration, useReadingWorkspace } from '@/contexts/readingWorkspaceHooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n, getTranslation } from '@/i18n'
import type { LanguageCode } from '@/i18n'
import { isLowSignalResearchLine } from '@/utils/researchCopy'
import type {
  ArticleFlowBlock,
  CitationRef,
  ContextPill,
  EvidenceExplanation,
  EvidencePayload,
  NodeViewModel,
  PaperViewModel,
  SearchResultItem,
  SuggestedAction,
} from '@/types/alpha'
import type { NodeArticleFlowBlock } from '@/types/article'
import { apiGet } from '@/utils/api'
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
    .replace(/[「」『』《》“”"'`]/gu, '')
    .replace(/[，。！？!?；;：:、]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

const LOW_SIGNAL_NODE_NARRATIVE_PATTERNS = [
  /不是单篇结论/u,
  /围绕同一问题形成的研究推进/u,
  /节点级判断不能只停在/u,
  /节点总结不能只停在/u,
  /如果读完这个节点后仍然不知道/u,
  /一个好的节点应该让读者看清/u,
  /节点级组织仍然不够成功/u,
  /图、表、公式在这里的意义不是材料很多/u,
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
  return `/node/${nodeId}?anchor=${encodeURIComponent(`paper:${paperId}`)}`
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

function formatPublishedDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return ''
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

type NodeReferenceEntry = {
  paperId: string
  title: string
  publishedAt?: string
  authors?: string[]
  citationCount?: number | null
  originalUrl?: string
  pdfUrl?: string
}

function formatReferenceAuthors(authors?: string[]) {
  if (!authors || authors.length === 0) return ''
  if (authors.length <= 4) return authors.join(', ')
  return `${authors.slice(0, 4).join(', ')}, et al.`
}

function formatReferenceYear(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return ''
  return String(date.getFullYear())
}

function buildReferenceEntriesFromFlow(
  flow: Array<Exclude<NodeArticleFlowBlock, { type: 'introduction' }>>,
) {
  return flow.reduce<NodeReferenceEntry[]>((entries, block) => {
    if (block.type !== 'paper-article') return entries

    entries.push({
      paperId: block.paperId,
      title: block.title,
      publishedAt: block.publishedAt,
      authors: block.authors,
      citationCount: block.citationCount,
      originalUrl: block.originalUrl,
      pdfUrl: block.pdfUrl,
    })

    return entries
  }, [])
}

function formatReferenceCitation(entry: NodeReferenceEntry, language: LanguageCode) {
  const authors = formatReferenceAuthors(entry.authors)
  const year = formatReferenceYear(entry.publishedAt)

  if (authors && year) return `${authors} (${year}).`
  if (authors) return `${authors}.`
  if (year) {
    const template = getTranslation('node.publishedYear', language, 'Published in {year}.')
    return renderTemplate(template, { year })
  }

  return ''
}

export function NodePage() {
  const { nodeId = '' } = useParams<{ nodeId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { rememberTrail } = useReadingWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<NodeViewModel | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<EvidencePayload | null>(null)
  const [hydratedReferences, setHydratedReferences] = useState<Map<string, ArticleInlineReference>>(
    () => new Map(),
  )
const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([])
  const [paperBundleOpen, setPaperBundleOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('article')
  const [loading, setLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [zoteroDialogOpen, setZoteroDialogOpen] = useState(false)
  const { copy } = useProductCopy()
  const { t, preference } = useI18n()
  const activeAnchor = searchParams.get('evidence') || searchParams.get('anchor')
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const stageWindowMonths = viewModel?.stageWindowMonths ?? requestedStageWindowMonths ?? 1
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
    let alive = true
    apiGet<NodeViewModel>(
      buildNodeViewModelPath(nodeId, requestedStageWindowMonths, true), // enhanced=true for 8-Pass deep analysis
    )
      .then((payload) => {
        if (alive) setViewModel(payload)
      })
      .catch(() => {
        if (alive) setViewModel(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [nodeId, requestedStageWindowMonths])

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
    const evidenceAnchor = searchParams.get('evidence')
    if (!evidenceAnchor) {
      setSelectedEvidence(null)
      return
    }

    let alive = true
    apiGet<EvidencePayload>(`/api/evidence/${encodeURIComponent(evidenceAnchor)}`)
      .then((payload) => {
        if (alive) setSelectedEvidence(payload)
      })
      .catch(() => {
        if (alive) setSelectedEvidence(null)
      })

    return () => {
      alive = false
    }
  }, [searchParams])

  useEffect(() => {
    if (!activeAnchor) return
    const element = document.getElementById(anchorDomId(activeAnchor))
    if (!element) return
    window.setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
  }, [activeAnchor, viewModel])

  useEffect(() => {
    setHydratedReferences(new Map())
  }, [viewModel?.nodeId, stageWindowMonths])

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
        .join(' · '),
    [viewModel],
  )
  const metaLine = useMemo(
    () =>
      [viewModel?.article.periodLabel, viewModel?.article.timeRangeLabel]
        .filter((item, index, values): item is string => Boolean(item) && values.indexOf(item) === index)
        .join(' · '),
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
      .join(' · ')
  }, [t, viewModel])
  const suggestedQuestions = useMemo(
    () =>
      viewModel
        ? [
            renderTemplate(
              t(
                'workbench.nodeExplainPromptTemplate',
                'Put the node "{title}" back into the full topic mainline and explain what judgment it carries.',
              ),
              { title: viewModel.title },
            ),
            renderTemplate(
              t(
                'workbench.nodePapersPromptTemplate',
                'Explain how the papers beneath "{title}" divide the work, and which one is most decisive.',
              ),
              { title: viewModel.title },
            ),
            renderTemplate(
              t(
                'workbench.nodeCritiquePromptTemplate',
                'Question the weakest part of the node "{title}" from the standpoint of evidence and counterargument.',
              ),
              { title: viewModel.title },
            ),
          ]
        : [],
    [t, viewModel],
  )
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
              subtitle: `${paper.role}${paper.publishedAt ? ` · ${formatPublishedDate(paper.publishedAt)}` : ''}`,
              description: paper.contribution,
              route: withStageWindowRoute(buildPaperAnchor(viewModel.nodeId, paper.paperId), stageWindowMonths),
            })),
          ]
        : [],
    [stageWindowMonths, t, viewModel],
  )
  const papers = useMemo(() => viewModel?.paperRoles ?? [], [viewModel])
  const referenceEntries = useMemo(() => {
    if (viewModel?.references?.length) {
      return viewModel.references
    }

    const fromFlow = hasEnhancedContinuousArticle
      ? buildReferenceEntriesFromFlow(
          enhancedBodyFlow as Array<Exclude<NodeArticleFlowBlock, { type: 'introduction' }>>,
        )
      : []

    if (fromFlow.length > 0) {
      return fromFlow
    }

    return papers.map((paper) => ({
      paperId: paper.paperId,
      title: paper.title,
      publishedAt: paper.publishedAt,
      authors: paper.authors,
      citationCount: paper.citationCount,
      originalUrl: paper.originalUrl,
      pdfUrl: paper.pdfUrl,
    }))
  }, [enhancedBodyFlow, hasEnhancedContinuousArticle, papers, viewModel?.references])
  const downloadableReferences = useMemo(
    () => referenceEntries.filter((entry) => Boolean(entry.pdfUrl)),
    [referenceEntries],
  )
  const selectedDownloadReferences = useMemo(
    () => downloadableReferences.filter((entry) => selectedPaperIds.includes(entry.paperId)),
    [downloadableReferences, selectedPaperIds],
  )
  useEffect(() => {
    setSelectedPaperIds(downloadableReferences.map((entry) => entry.paperId))
  }, [nodeId, downloadableReferences])
  useEffect(() => {
    setPaperBundleOpen(false)
  }, [nodeId])
  const togglePaperSelection = useCallback((paperId: string) => {
    setSelectedPaperIds((current) =>
      current.includes(paperId)
        ? current.filter((item) => item !== paperId)
        : [...current, paperId],
    )
  }, [])
  const downloadSelectedPdfs = useCallback(async () => {
    if (selectedDownloadReferences.length === 0) return
    
    setIsDownloading(true)
    setDownloadProgress(0)
    
    try {
      const zip = new JSZip()
      const total = selectedDownloadReferences.length
      let completed = 0
      
      for (const entry of selectedDownloadReferences) {
        if (!entry.pdfUrl) continue
        
        try {
          const response = await fetch(entry.pdfUrl)
          const blob = await response.blob()
          const safeTitle = entry.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 100)
          zip.file(`${safeTitle}.pdf`, blob)
        } catch (e) {
          console.warn(`Failed to fetch PDF: ${entry.title}`, e)
        }
        
        completed++
        setDownloadProgress(Math.round((completed / total) * 100))
      }
      
      const content = await zip.generateAsync({ type: 'blob' })
      const safeNodeTitle = viewModel?.title?.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50) || 'papers'
      saveAs(content, `${safeNodeTitle}-papers.zip`)
    } catch (e) {
      console.error('Failed to create ZIP', e)
    } finally {
      setIsDownloading(false)
      setDownloadProgress(0)
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
                ...block.subsections.map((subsection) => subsection.content),
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
                : `/paper/${referenceId}`,
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

  const openEvidence = useCallback(async (anchorId: string) => {
    try {
      const evidence = await apiGet<EvidencePayload>(`/api/evidence/${encodeURIComponent(anchorId)}`)
      setSelectedEvidence(evidence)
      const next = new URLSearchParams(searchParams)
      next.set('evidence', anchorId)
      next.set('stageMonths', String(stageWindowMonths))
      next.delete('anchor')
      setSearchParams(next, { replace: true })
    } catch {
      setSelectedEvidence(null)
    }
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
          referencedPaper?.route || `/paper/${nextPaperId}`,
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

      navigate(withStageWindowRoute(item.route, stageWindowMonths))
    },
    [focusAnchor, navigate, nodeId, openEvidence, papers, stageWindowMonths, viewModel],
  )

  const sidebarShell = viewModel ? (
    <RightSidebarShell
      topicId={viewModel.topic.topicId}
      topicTitle={viewModel.topic.title}
      suggestedQuestions={suggestedQuestions}
      selectedEvidence={selectedEvidence}
      contextSuggestions={contextSuggestions}
      resources={resources}
      searchStageWindowMonths={stageWindowMonths}
      onOpenCitation={handleCitation}
      onAction={handleAction}
      onOpenSearchResult={handleSearchResult}
      surfaceMode="reading"
    />
  ) : null
  const paperBundleContent =
    downloadableReferences.length > 0 ? (
      <div data-testid="node-paper-bundle" className="space-y-4">
        <div className="rounded-[20px] border border-black/8 bg-[linear-gradient(180deg,#fcfaf6_0%,#ffffff_100%)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">
            {t('node.paperBundleEyebrow', 'Paper bundle')}
          </div>
          <div className="mt-1 text-[13px] leading-6 text-black/62">
            {renderTemplate(t('node.paperBundleSummary', '{selected} selected · {downloadable} PDFs ready'), {
              selected: selectedDownloadReferences.length,
              downloadable: downloadableReferences.length,
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setSelectedPaperIds(downloadableReferences.map((entry) => entry.paperId))
            }
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/62 transition hover:border-black/18 hover:text-black"
          >
            {t('node.selectAllPapers', 'Select all papers')}
          </button>
          <button
            type="button"
            onClick={() => setSelectedPaperIds([])}
            className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/62 transition hover:border-black/18 hover:text-black"
          >
            {t('node.clearPaperSelection', 'Clear selection')}
          </button>
<button
            type="button"
            onClick={downloadSelectedPdfs}
            disabled={selectedDownloadReferences.length === 0 || isDownloading}
            className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-[11px] text-white transition hover:bg-black/92 disabled:cursor-not-allowed disabled:bg-black/25"
          >
            <Download className="h-3.5 w-3.5" />
            {isDownloading 
              ? `${downloadProgress}%`
              : renderTemplate(t('node.downloadSelectedPdfs', 'Download {count} PDFs'), {
                  count: selectedDownloadReferences.length,
                })
            }
          </button>
        </div>

        <div className="max-h-[56vh] space-y-2.5 overflow-y-auto pr-1">
          {downloadableReferences.map((entry) => (
            <label
              key={entry.paperId}
              className="flex items-start gap-3 rounded-[16px] border border-black/6 bg-white px-3 py-3"
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-black/18 text-black"
                checked={selectedPaperIds.includes(entry.paperId)}
                onChange={() => togglePaperSelection(entry.paperId)}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium leading-6 text-black">
                  {entry.title}
                </div>
                <div className="mt-0.5 text-[11px] leading-5 text-black/54">
                  {[formatReferenceAuthors(entry.authors), formatReferenceYear(entry.publishedAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <a
                href={entry.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-black/58 transition hover:border-black/18 hover:text-black"
              >
                {t('node.downloadPdf', 'Download PDF')}
              </a>
            </label>
          ))}
        </div>
      </div>
    ) : null
  const paperBundleLauncher =
    downloadableReferences.length > 0 ? (
      <button
        type="button"
        data-testid="node-paper-bundle-trigger"
        onClick={() => setPaperBundleOpen(true)}
        className="fixed bottom-5 left-4 z-[72] inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-[12px] text-black shadow-[0_16px_36px_rgba(15,23,42,0.12)] transition hover:border-black/16 hover:shadow-[0_18px_40px_rgba(15,23,42,0.14)] md:bottom-6 md:left-6"
      >
        <Download className="h-3.5 w-3.5" />
        {renderTemplate(
          t('node.paperBundleSummary', '{selected} selected · {downloadable} PDFs ready'),
          {
            selected: selectedDownloadReferences.length,
            downloadable: downloadableReferences.length,
          },
        )}
      </button>
    ) : null
  const paperBundleDialog =
    paperBundleOpen && paperBundleContent ? (
      <div
        className="fixed inset-0 z-[84] flex items-end justify-center bg-black/18 p-4 backdrop-blur-[2px] md:items-center"
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label={t('common.close', 'Close')}
          onClick={() => setPaperBundleOpen(false)}
        />

        <div className="relative z-[85] w-full max-w-[720px] overflow-hidden rounded-[26px] border border-black/8 bg-[linear-gradient(180deg,#fcfaf6_0%,#ffffff_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">
                {t('node.paperBundleEyebrow', 'Paper bundle')}
              </div>
              <div className="mt-2 text-[24px] font-semibold leading-[1.2] text-black">
                {t('node.paperBundleTitle', 'Batch PDF Download')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPaperBundleOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-black/54 transition hover:border-black/16 hover:text-black"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {paperBundleContent}
        </div>
      </div>
    ) : null

  if (loading) {
    return (
      <>
        <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
          <div className="mx-auto max-w-[920px] py-12 text-[14px] text-black/56">
            {copy('reading.nodeLoading', t('node.loading', 'Loading node…'))}
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
      className="px-4 pb-20 pt-6 md:px-6 xl:px-10 xl:pr-[404px] 2xl:pr-[428px]"
    >
      <div className="mx-auto max-w-[980px]">
        <div className="flex items-center justify-between">
          <Link
            to={topicReturnRoute ?? withStageWindowRoute(viewModel.topic.route, stageWindowMonths)}
            className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy('reading.backTopic', t('node.backTopic', 'Back to Topic'))}
          </Link>
          <div className="flex items-center gap-3">
            <ResearchViewToggle mode={viewMode} onChange={setViewMode} />
            <button
              onClick={() => setZoteroDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-[10px] border border-black/10 bg-white px-3 py-1.5 text-[13px] font-medium text-black/70 transition hover:bg-black/5 hover:text-black"
            >
              <Upload className="h-4 w-4" />
              {t('zotero.title', 'Export to Zotero')}
            </button>
          </div>
        </div>
        <header id={anchorDomId('node:intro')} className="mx-auto mt-8 max-w-[920px]">
          <div className="text-[11px] uppercase tracking-[0.24em] text-black/38">
            {editorialMetaLine || surfaceMetaLine}
          </div>
          <h1 className="mt-4 font-display text-[38px] leading-[1.08] text-black md:text-[58px]">
            {viewModel.title}
          </h1>
          {viewModel.titleEn ? (
            <div className="mt-3 text-[14px] leading-7 text-black/42">{viewModel.titleEn}</div>
          ) : null}

          {/* 核心判断 - 节点级别的一句话判断 */}

          {leadParagraphs.map((paragraph, index) => (
            <p
              key={`${index}:${paragraph}`}
              className={index === 0 ? 'mt-5 text-[17px] leading-9 text-black/72' : 'mt-5 text-[16px] leading-9 text-black/64'}
            >
              {renderInlineArticleText(paragraph, articleReferenceMap, stageWindowMonths)}
            </p>
          ))}
</header>

        {/* Conditional View Rendering */}
        {viewMode === 'research' ? (
          <div className="mx-auto mt-10 max-w-[920px]">
            <ResearchView 
              viewModel={viewModel}
              onOpenEvidence={openEvidence}
            />
          </div>
        ) : (
          <article
            data-testid="node-article-flow"
            className="article-prose mx-auto mt-10 max-w-[920px] space-y-14"
          >
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
                  />
                ))}
          </article>
        )}

{/* References - only show in article view */}
        {viewMode === 'article' && referenceEntries.length > 0 ? (
          <footer className="mx-auto mt-16 max-w-[920px] border-t border-black/8 pt-10">
            {referenceEntries.length > 0 ? (
              <>
                <div className="text-[11px] uppercase tracking-[0.22em] text-black/34">
                  {t('node.referencesEyebrow', 'References')}
                </div>
                <h2 className="mt-3 text-[28px] font-semibold leading-[1.16] text-black">
                  {t('node.referencesTitle', 'Reference List')}
                </h2>

                <ol className="mt-6 space-y-4">
                  {referenceEntries.map((entry, index) => {
                    const citationLead = formatReferenceCitation(
                      entry,
                      preference.primary,
                    )

                    return (
                      <li
                        key={`${entry.paperId}:${index}`}
                        className="flex gap-4 border-t border-black/6 pt-4 text-[15px] leading-8 text-black/66 first:border-t-0 first:pt-0"
                      >
                        <span className="w-8 shrink-0 text-black/34">[{index + 1}]</span>
                        <div className="min-w-0 flex-1">
                          {citationLead ? <span>{citationLead} </span> : null}
                          <span className="text-black">{entry.title}</span>
                          {entry.citationCount !== null && entry.citationCount !== undefined ? (
                            <span className="text-black/42">
                              {` · ${renderTemplate(t('node.citations', 'Cited {count} times'), {
                                count: entry.citationCount,
                              })}`}
                            </span>
                          ) : null}
                          {(entry.originalUrl || entry.pdfUrl) ? (
                            <span className="ml-2 inline-flex flex-wrap gap-2 align-middle">
                              {entry.originalUrl ? (
                                <a
                                  href={entry.originalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] leading-5 text-black/58 transition hover:border-black/18 hover:text-black"
                                >
                                  {t('node.openSource', 'Original source')}
                                </a>
                              ) : null}
                              {entry.pdfUrl ? (
                                <a
                                  href={entry.pdfUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] leading-5 text-black/58 transition hover:border-black/18 hover:text-black"
                                >
                                  {t('node.downloadPdf', 'Download PDF')}
                                </a>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </>
            ) : null}
          </footer>
        ) : null}
      </div>
</main>
    {paperBundleLauncher}
    {paperBundleDialog}
    {sidebarShell}
    <ZoteroExportDialog
      isOpen={zoteroDialogOpen}
      onClose={() => setZoteroDialogOpen(false)}
      nodeId={nodeId}
      topicName={viewModel?.title}
      paperIds={papers.map(p => p.paperId)}
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
}: {
  block: ArticleFlowBlock
  nodeId: string
  evidenceById: Map<string, EvidenceExplanation>
  activeAnchor: string | null
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
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
        className={`border-t border-black/6 pt-8 ${highlighted ? 'scroll-mt-24' : ''}`}
      >
        <div className="text-[12px] leading-6 text-black/44">
          {[block.role, publishedAtLabel].filter(Boolean).join(' · ')}
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
      <section className="border-t border-black/6 pt-8">
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
      <section className="border-t border-black/6 pt-8">
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
      <section className="border-t border-black/6 pt-8">
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
  void activeAnchor
  return null
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
    <section id={anchorDomId(anchorId)} className="border-t border-black/6 pt-8">
      <p className="text-[15px] leading-8 text-black/56">
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
}: {
  block: Exclude<NodeArticleFlowBlock, { type: 'introduction' }>
  referenceMap: Map<string, ArticleInlineReference>
  evidenceById: Map<string, EvidenceExplanation>
  stageWindowMonths: number
  activeAnchor: string | null
  t: (key: string, fallback?: string) => string
}) {
  if (block.type === 'paper-article') {
    return (
      <PaperSectionBlock
        paperId={block.paperId}
        title={block.title}
        titleEn={block.titleEn}
        authors={block.authors}
        publishedAt={block.publishedAt}
        citationCount={block.citationCount}
        role={block.role}
        introduction={block.introduction}
        subsections={block.subsections}
        conclusion={block.conclusion}
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
      <section className="border-t border-black/6 pt-8">
        <h2 className="text-[26px] font-semibold leading-[1.2] text-black">{block.title}</h2>
        <NarrativeParagraphGroup
          paragraphs={[block.content, ...block.insights]}
          referenceMap={referenceMap}
          stageWindowMonths={stageWindowMonths}
          className="text-[16px] leading-9 text-black/66"
        />
      </section>
    )
  }

  if (block.type === 'critique') {
    return (
      <section className="border-t border-black/6 pt-10">
        <h2 className="text-[24px] font-semibold text-black">
          {block.title || t('node.critique.title', 'Critical Analysis')}
        </h2>
        <p className="mt-4 text-[16px] leading-8 text-black/66">
          {block.summary}
        </p>
        {block.bullets && block.bullets.length > 0 && (
          <ul className="mt-6 space-y-3">
            {block.bullets.map((bullet, index) => (
              <li key={index} className="flex gap-3 text-[15px] leading-7 text-black/62">
                <span className="text-black/40">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <section className="border-t border-black/6 pt-8">
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
