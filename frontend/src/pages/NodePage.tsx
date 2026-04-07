import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import {
  type ArticleInlineReference,
  parseInlineArticleReferences,
  renderInlineArticleText,
} from '@/components/reading/ArticleInlineText'
import { ReadingEvidenceBlock } from '@/components/reading/ReadingEvidenceBlock'
import { PaperSectionBlock } from '@/components/reading/PaperSectionBlock'
import { RightSidebarShell } from '@/components/topic/RightSidebarShell'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
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
import type { NodeArticleFlowBlock, PaperArticleBlock } from '@/types/article'
import { apiGet, resolveApiAssetUrl } from '@/utils/api'
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

function resolvePaperDownloadUrl(source: { pdfUrl?: string | null }) {
  return resolveApiAssetUrl(source.pdfUrl) ?? source.pdfUrl ?? null
}

function resolvePaperImportUrl(source: { originalUrl?: string | null; pdfUrl?: string | null }) {
  return source.originalUrl ?? resolvePaperDownloadUrl(source)
}

function sanitizeDownloadFilename(title: string) {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/giu, '-')
    .replace(/^-+|-+$/gu, '')

  return `${stem || 'paper'}.pdf`
}

function triggerFileDownload(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
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

function formatPublishedDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return ''
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

function formatExternalLinkLabel(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.host.replace(/^www\./u, '')
  } catch {
    return url
  }
}

export function NodePage() {
  const { nodeId = '' } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<NodeViewModel | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<EvidencePayload | null>(null)
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([])
  const [paperActionNotice, setPaperActionNotice] = useState<string | null>(null)
  const [hydratedReferences, setHydratedReferences] = useState<Map<string, ArticleInlineReference>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(true)
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const activeAnchor = searchParams.get('evidence') || searchParams.get('anchor')
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const stageWindowMonths = viewModel?.stageWindowMonths ?? requestedStageWindowMonths ?? 1

  useDocumentTitle(
    viewModel?.title ??
      (loading
        ? copy('reading.nodeLoadingTitle', t('node.readingTitle', 'Node article'))
        : copy('reading.nodeUnavailableTitle', t('node.unavailableTitle', 'Node unavailable'))),
  )

  useEffect(() => {
    let alive = true
    apiGet<NodeViewModel>(
      withOptionalStageWindowQuery(`/api/nodes/${nodeId}/view-model`, requestedStageWindowMonths),
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
    setSelectedPaperIds([])
  }, [viewModel?.nodeId])

  useEffect(() => {
    setHydratedReferences(new Map())
  }, [viewModel?.nodeId, stageWindowMonths])

  useEffect(() => {
    if (!paperActionNotice) return
    const timer = window.setTimeout(() => setPaperActionNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [paperActionNotice])

  const evidenceById = useMemo(
    () => new Map((viewModel?.evidence ?? []).map((item) => [item.anchorId, item])),
    [viewModel],
  )
  const leadParagraphs = useMemo(
    () => dedupeNarrativeParagraphs([viewModel?.headline, viewModel?.standfirst]),
    [viewModel?.headline, viewModel?.standfirst],
  )
  const flow = useMemo(
    () => dedupeNodeFlow(viewModel?.article.flow ?? [], leadParagraphs),
    [leadParagraphs, viewModel?.article.flow],
  )
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
  const narrativeReferenceIds = useMemo(
    () =>
      collectNarrativeReferenceIds([
        ...leadParagraphs,
        viewModel?.summary,
        viewModel?.explanation,
        ...flow.flatMap((block) => {
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
      ]),
    [flow, viewModel],
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

    for (const block of flow) {
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

    for (const evidence of viewModel?.evidence ?? []) {
      if (!evidence.sourcePaperId) continue
      setInlineReference(entries, {
        id: evidence.sourcePaperId,
        kind: 'paper',
        label: evidence.sourcePaperTitle || evidence.sourcePaperId,
        route: buildPaperAnchor(nodeId, evidence.sourcePaperId),
      })
    }

    return entries
  }, [flow, nodeId, papers, viewModel])
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
  const selectedPapers = useMemo(
    () => papers.filter((paper) => selectedPaperIds.includes(paper.paperId)),
    [papers, selectedPaperIds],
  )
  const downloadableSelectedPapers = useMemo(
    () => selectedPapers.filter((paper) => Boolean(resolvePaperDownloadUrl(paper))),
    [selectedPapers],
  )
  const importableSelectedPapers = useMemo(
    () => selectedPapers.filter((paper) => Boolean(resolvePaperImportUrl(paper))),
    [selectedPapers],
  )
  const timelineEvidenceCount = useMemo(
    () => (viewModel ? viewModel.stats.figureCount + viewModel.stats.tableCount + viewModel.stats.formulaCount : 0),
    [viewModel],
  )
  const stageScopeSummary = useMemo(
    () =>
      renderTemplate(
        t(
          'node.stageScopeSummary',
          'This node article keeps only the papers, figures, tables, and formulas that belong to {stage}. If the topic cadence changes, adjust it from Topic Management instead of rewriting the reading surface here.',
        ),
        {
          stage:
            viewModel?.stageLabel ||
            viewModel?.article.timeRangeLabel ||
            surfaceMetaLine ||
            viewModel?.topic.title ||
            '',
        },
      ),
    [surfaceMetaLine, t, viewModel],
  )
  const stageScopeFacts = useMemo(
    () =>
      [
        viewModel?.article.timeRangeLabel,
        renderTemplate(t('node.scopePaperCount', '{count} papers'), {
          count: viewModel?.stats.paperCount ?? 0,
        }),
        renderTemplate(t('node.scopeEvidenceCount', '{count} figures, tables, and formulas'), {
          count: timelineEvidenceCount,
        }),
      ].filter((item): item is string => Boolean(item)),
    [t, timelineEvidenceCount, viewModel],
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

  const openEvidence = async (anchorId: string) => {
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
  }

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

  const togglePaperSelection = (paperId: string) => {
    setSelectedPaperIds((current) =>
      current.includes(paperId)
        ? current.filter((item) => item !== paperId)
        : [...current, paperId],
    )
  }

  const selectAllPapers = () => {
    setSelectedPaperIds(papers.map((paper) => paper.paperId))
  }

  const clearPaperSelection = () => {
    setSelectedPaperIds([])
  }

  const downloadSelectedPapers = async () => {
    if (downloadableSelectedPapers.length === 0) return

    setPaperActionNotice(
      renderTemplate(
        t('node.paperActionDownloading', 'Starting {count} PDF downloads.'),
        { count: downloadableSelectedPapers.length },
      ),
    )

    for (const paper of downloadableSelectedPapers) {
      const downloadUrl = resolvePaperDownloadUrl(paper)
      if (!downloadUrl) continue

      triggerFileDownload(downloadUrl, sanitizeDownloadFilename(paper.title))
      await new Promise((resolve) => window.setTimeout(resolve, 120))
    }
  }

  const copySelectedImportLinks = async () => {
    const content = importableSelectedPapers
      .map((paper) => resolvePaperImportUrl(paper))
      .filter((value): value is string => Boolean(value))
      .join('\n')

    if (!content) return
    await copyTextToClipboard(content)
    setPaperActionNotice(
      renderTemplate(
        t('node.paperActionCopied', 'Copied {count} paper import links.'),
        { count: importableSelectedPapers.length },
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

      navigate(withStageWindowRoute(item.route, stageWindowMonths))
    },
    [focusAnchor, navigate, nodeId, openEvidence, papers, stageWindowMonths],
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
    />
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
        <Link
          to={withStageWindowRoute(viewModel.topic.route, stageWindowMonths)}
          className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy('reading.backTopic', t('node.backTopic', 'Back to Topic'))}
        </Link>
        <header className="mx-auto mt-8 max-w-[920px]">
          <div className="text-[11px] uppercase tracking-[0.24em] text-black/38">{surfaceMetaLine}</div>
          <h1 className="mt-4 font-display text-[38px] leading-[1.08] text-black md:text-[58px]">
            {viewModel.title}
          </h1>
          {viewModel.titleEn ? (
            <div className="mt-3 text-[14px] leading-7 text-black/42">{viewModel.titleEn}</div>
          ) : null}
          {leadParagraphs.map((paragraph, index) => (
            <p
              key={`${index}:${paragraph}`}
              className={index === 0 ? 'mt-5 text-[17px] leading-9 text-black/72' : 'mt-5 text-[16px] leading-9 text-black/64'}
            >
              {renderInlineArticleText(paragraph, articleReferenceMap, stageWindowMonths)}
            </p>
          ))}
        </header>

        <section className="mx-auto mt-8 max-w-[920px] rounded-[26px] border border-black/8 bg-[var(--surface-soft)] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.22em] text-black/38">
                {t('node.stageScopeEyebrow', 'Stage-locked article')}
              </div>
              <h2 className="mt-2 text-[20px] font-semibold leading-[1.2] text-black">
                {viewModel.stageLabel || viewModel.article.timeRangeLabel}
              </h2>
              <p className="mt-3 max-w-[760px] text-[14px] leading-7 text-black/62">
                {stageScopeSummary}
              </p>
            </div>

            <Link
              to="/manage/topics"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:border-black/18 hover:text-black"
            >
              {t('node.manageCadence', 'Manage topic cadence')}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-black/50">
            {stageScopeFacts.map((fact) => (
              <span
                key={fact}
                className="rounded-full border border-black/8 bg-white px-2.5 py-1"
              >
                {fact}
              </span>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-8 flex max-w-[920px] flex-wrap items-center justify-between gap-4 rounded-[24px] border border-black/8 bg-[var(--surface-soft)] px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-black/38">
              {t('node.paperActionsEyebrow', 'Paper actions')}
            </div>
            <p className="mt-2 text-[13px] leading-6 text-black/62">
              {renderTemplate(
                t(
                  'node.paperActionsSummary',
                  '{selected} selected, {downloadable} ready to download, {importable} ready to import.',
                ),
                {
                  selected: selectedPapers.length,
                  downloadable: downloadableSelectedPapers.length,
                  importable: importableSelectedPapers.length,
                },
              )}
            </p>
            {paperActionNotice ? (
              <p
                aria-live="polite"
                className="mt-2 text-[12px] leading-5 text-[var(--accent-ink)]"
              >
                {paperActionNotice}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAllPapers}
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:border-black/18 hover:text-black"
            >
              {t('node.selectAllPapers', 'Select all papers')}
            </button>
            <button
              type="button"
              onClick={clearPaperSelection}
              disabled={selectedPaperIds.length === 0}
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:border-black/18 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              {t('node.clearPaperSelection', 'Clear selection')}
            </button>
            <button
              type="button"
              onClick={() => void copySelectedImportLinks()}
              disabled={importableSelectedPapers.length === 0}
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] text-black/62 transition hover:border-black/18 hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
            >
              {t('node.copyImportLinks', 'Copy import links')}
            </button>
            <button
              type="button"
              onClick={() => void downloadSelectedPapers()}
              disabled={downloadableSelectedPapers.length === 0}
              className="rounded-full bg-black px-3 py-2 text-[12px] text-white transition hover:bg-black/86 disabled:cursor-not-allowed disabled:bg-black/28"
            >
              {renderTemplate(
                t('node.downloadSelectedPdfs', 'Download {count} PDFs'),
                { count: downloadableSelectedPapers.length },
              )}
            </button>
          </div>
        </section>

        <article
          data-testid="node-article-flow"
          className="article-prose mx-auto mt-10 max-w-[920px] space-y-12"
        >
          {flow.map((block) => (
            <FlowBlock
              key={block.id}
              block={block}
              nodeId={viewModel.nodeId}
              selected={block.type === 'paper-break' && selectedPaperIds.includes(block.paperId)}
              onTogglePaper={togglePaperSelection}
              evidenceById={evidenceById}
              activeAnchor={activeAnchor}
              openSourceLabel={t('node.openSource', 'Original source')}
              downloadPdfLabel={t('node.downloadPdf', 'Download PDF')}
              paperAddressLabel={t('node.paperAddress', 'Paper address')}
              selectPaperLabel={t('node.selectPaper', 'Select paper')}
              jumpToPaperTemplate={t('node.jumpToPaper', 'Jump to {title}')}
              whyItMattersLabel={copy('reading.whyItMatters', t('node.whyItMatters', 'Why it matters:'))}
              referenceMap={articleReferenceMap}
              stageWindowMonths={stageWindowMonths}
              enhancedFlow={viewModel?.enhancedArticleFlow}
            />
          ))}
        </article>
      </div>
    </main>
    {sidebarShell}
    </>
  )
}

function FlowBlock({
  block,
  nodeId,
  selected,
  onTogglePaper,
  evidenceById,
  activeAnchor,
  openSourceLabel,
  downloadPdfLabel,
  paperAddressLabel,
  selectPaperLabel,
  jumpToPaperTemplate,
  whyItMattersLabel,
  referenceMap,
  stageWindowMonths,
  enhancedFlow,
}: {
  block: ArticleFlowBlock
  nodeId: string
  selected: boolean
  onTogglePaper: (paperId: string) => void
  evidenceById: Map<string, EvidenceExplanation>
  activeAnchor: string | null
  openSourceLabel: string
  downloadPdfLabel: string
  paperAddressLabel: string
  selectPaperLabel: string
  jumpToPaperTemplate: string
  whyItMattersLabel: string
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  enhancedFlow?: NodeArticleFlowBlock[]
}) {
  if (block.type === 'text') {
    return (
      <section id={block.anchorId ? anchorDomId(block.anchorId) : undefined}>
        {block.title ? (
          <h2 className="mb-4 text-[26px] font-semibold leading-[1.2] text-black">{block.title}</h2>
        ) : null}
        <div className="space-y-4">
          {block.body.map((paragraph) => (
            <p key={paragraph} className="text-[16px] leading-9 text-black/68">
              {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
            </p>
          ))}
        </div>
      </section>
    )
  }

  if (block.type === 'paper-break') {
    const downloadUrl = resolvePaperDownloadUrl(block)
    const highlighted = activeAnchor === `paper:${block.paperId}`
    const publishedAtLabel = formatPublishedDate(block.publishedAt)
    const sourceLabel = block.originalUrl ? formatExternalLinkLabel(block.originalUrl) : null
    
    // 查找增强版论文文章数据
    const enhancedPaperBlock = enhancedFlow?.find(
      (b): b is PaperArticleBlock => b.type === 'paper-article' && b.paperId === block.paperId
    )
    
    // 如果有增强版数据，使用PaperSectionBlock组件
    if (enhancedPaperBlock) {
      return (
        <PaperSectionBlock
          paperId={enhancedPaperBlock.paperId}
          title={enhancedPaperBlock.title}
          titleEn={enhancedPaperBlock.titleEn}
          authors={enhancedPaperBlock.authors}
          publishedAt={enhancedPaperBlock.publishedAt}
          citationCount={enhancedPaperBlock.citationCount}
          role={enhancedPaperBlock.role}
          introduction={enhancedPaperBlock.introduction}
          subsections={enhancedPaperBlock.subsections}
          conclusion={enhancedPaperBlock.conclusion}
          anchorId={anchorDomId(`paper:${block.paperId}`)}
        />
      )
    }
    
    // 否则使用原有简单展示
    return (
      <section
        id={anchorDomId(`paper:${block.paperId}`)}
        className={`rounded-[26px] border px-5 py-5 transition ${
          highlighted
            ? 'border-[#d1aa5c]/65 bg-[#fff8ec] shadow-[0_18px_38px_rgba(15,23,42,0.10)]'
            : selected
              ? 'border-black/14 bg-[var(--surface-soft)]/85'
              : 'border-black/8 bg-[var(--surface-soft)]/55'
        }`}
      >
        <div className="flex items-start gap-4">
          <label className="mt-1 inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onTogglePaper(block.paperId)}
              aria-label={`${selectPaperLabel} ${block.title}`}
              className="h-4 w-4 rounded border-black/20 text-black focus:ring-black/20"
            />
          </label>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-black/38">
              <span>{block.role}</span>
              {publishedAtLabel ? <span>{publishedAtLabel}</span> : null}
            </div>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.2] text-black">{block.title}</h2>
            {block.titleEn ? <div className="mt-2 text-[13px] text-black/44">{block.titleEn}</div> : null}
            <p className="mt-4 text-[15px] leading-8 text-black/64">
              {renderInlineArticleText(block.contribution, referenceMap, stageWindowMonths)}
            </p>

            {block.originalUrl ? (
              <div className="mt-4 rounded-[18px] border border-black/8 bg-white px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-black/38">
                  {paperAddressLabel}
                </div>
                <a
                  href={block.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-[13px] text-black/68 transition hover:text-black"
                >
                  <span className="font-medium">{sourceLabel}</span>
                  <span className="truncate text-black/46">{block.originalUrl}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </a>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
              {block.originalUrl ? (
                <a
                  href={block.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-black/62 transition hover:text-black"
                >
                  {openSourceLabel}
                </a>
              ) : null}
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={sanitizeDownloadFilename(block.title)}
                  className="text-black/62 transition hover:text-black"
                >
                  {downloadPdfLabel}
                </a>
              ) : null}
              <Link
                to={withStageWindowRoute(buildPaperAnchor(nodeId, block.paperId), stageWindowMonths)}
                className="text-black/52 transition hover:text-black"
              >
                {renderTemplate(jumpToPaperTemplate, { title: block.title })}
              </Link>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (block.type === 'comparison') {
    return (
      <section>
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
      <section className="pt-2">
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
      <section className="pt-2">
        {block.title ? <h2 className="text-[24px] font-semibold text-black">{block.title}</h2> : null}
        <div className="mt-4 space-y-4">
          {block.body.map((paragraph) => (
            <p key={paragraph} className="text-[16px] leading-9 text-black/66">
              {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
            </p>
          ))}
        </div>
      </section>
    )
  }

  const evidence = block.evidence ?? evidenceById.get(block.id.replace(/^flow-/u, ''))
  if (!evidence) return null

  return (
    <ReadingEvidenceBlock
      anchorId={anchorDomId(evidence.anchorId)}
      evidence={evidence}
      highlighted={activeAnchor === evidence.anchorId}
      whyItMattersLabel={whyItMattersLabel}
    />
  )
}

export default NodePage
