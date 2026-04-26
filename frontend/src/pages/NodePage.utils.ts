/**
 * NodePage Utility Functions
 *
 * Extracted from NodePage.tsx for decomposition.
 * Contains pure utility functions for narrative text processing,
 * anchor ID generation, and article flow manipulation.
 */

import type { ArticleInlineReference } from '@/components/reading/ArticleInlineText'
import { parseInlineArticleReferences } from '@/components/reading/ArticleInlineText'
import { isLowSignalResearchLine } from '@/utils/researchCopy'
import type { ArticleFlowBlock } from '@/types/alpha'
import { buildPaperAnchorRoute } from '@/utils/readingRoutes'
import { withOptionalStageWindowQuery } from '@/utils/stageWindow'

// ============================================================================
// Anchor ID Generation
// ============================================================================

export function anchorDomId(anchorId: string) {
  return `anchor-${anchorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

// ============================================================================
// Template Rendering
// ============================================================================

export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

// ============================================================================
// Reference Management
// ============================================================================

export function setInlineReference(
  entries: Map<string, ArticleInlineReference>,
  reference: ArticleInlineReference | null,
) {
  if (!reference) return
  const key = reference.id.toLowerCase()
  if (!entries.has(key)) {
    entries.set(key, reference)
  }
}

export function collectNarrativeReferenceIds(texts: Array<string | null | undefined>) {
  const ids = new Set<string>()

  for (const text of texts) {
    for (const token of parseInlineArticleReferences(text ?? '')) {
      ids.add(token.id)
    }
  }

  return Array.from(ids)
}

// ============================================================================
// Narrative Text Processing
// ============================================================================

export function normalizeNarrativeKey(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .replace(/[銆屻€嶃€庛€忋€娿€嬧€溾€?"`]/gu, '')
    .replace(/[，。！？；：、""]/gu, ' ')
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

export function sanitizeNarrativeParagraph(value: string | null | undefined) {
  const paragraph = value?.replace(/\s+/gu, ' ').trim() ?? ''
  if (!paragraph) return ''
  if (isLowSignalResearchLine(paragraph)) return ''
  if (LOW_SIGNAL_NODE_NARRATIVE_PATTERNS.some((pattern) => pattern.test(paragraph))) return ''
  return paragraph
}

export function isNarrativeDuplicate(existingKeys: Set<string>, nextKey: string) {
  for (const existing of existingKeys) {
    if (existing === nextKey) return true

    const overlapLength = Math.min(existing.length, nextKey.length)
    if (overlapLength >= 24 && (existing.includes(nextKey) || nextKey.includes(existing))) {
      return true
    }
  }

  return false
}

export function dedupeNarrativeParagraphs(
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

export function splitNarrativeParagraphs(value: string | null | undefined) {
  return (value ?? '')
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
}

// ============================================================================
// Article Flow Deduplication
// ============================================================================

export function dedupeNodeFlow(
  flow: ArticleFlowBlock[],
  leadParagraphs: string[],
): ArticleFlowBlock[] {
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

// ============================================================================
// Date Formatting
// ============================================================================

export function formatPublishedDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return ''
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

// ============================================================================
// Route Helpers
// ============================================================================

export function buildPaperAnchor(nodeId: string, paperId: string) {
  return buildPaperAnchorRoute(`/node/${nodeId}`, paperId)
}

export function buildNodeViewModelPath(nodeId: string, stageWindowMonths?: number, enhanced?: boolean) {
  const basePath = withOptionalStageWindowQuery(
    `/api/nodes/${nodeId}/view-model`,
    stageWindowMonths,
  )
  if (enhanced === true) {
    return `${basePath}${basePath.includes('?') ? '&' : '?'}enhanced=true`
  }
  return basePath
}

export function readRequestedNodeViewMode(searchParams: URLSearchParams): 'research' | 'article' {
  return searchParams.get('view') === 'research' ? 'research' : 'article'
}

export function hasEnhancedContinuousArticleFlow(
  viewModel: Pick<import('@/types/alpha').NodeViewModel, 'enhancedArticleFlow'> | null | undefined,
) {
  return (
    Array.isArray(viewModel?.enhancedArticleFlow) &&
    viewModel!.enhancedArticleFlow.some((block) => block.type === 'paper-article')
  )
}

export const ENHANCED_NODE_ARTICLE_CLIENT_TIMEOUT_MS = 25_000
