import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { withStageWindowRoute } from '@/utils/stageWindow'

export type ArticleInlineReference = {
  id: string
  kind: 'paper' | 'node' | 'figure' | 'table' | 'formula' | 'section'
  label: string
  route: string
}

export type ArticleInlineReferenceToken = {
  id: string
  kind: 'paper' | 'node' | 'figure' | 'table' | 'formula' | 'section'
  literalTitle?: string
  start: number
  end: number
  raw: string
}

// Support both [[anchorId]] and paper-xxx/node-xxx formats
const INLINE_REFERENCE_RE =
  /(?<![A-Za-z0-9-])((paper|node)-[a-z0-9-]+)(?:(?:「([^」\n]+)」)|(?:《([^》\n]+)》)|(?:"([^"\n]+)")|(?:"([^"\n]+)"))?/giu

// New evidence anchor format: [[figure:xxx]], [[table:xxx]], [[formula:xxx]], [[section:xxx]]
const EVIDENCE_ANCHOR_RE = /\[\[(figure|table|formula|section):([a-zA-Z0-9_-]+)\]\]/gu

function resolveLiteralTitle(match: RegExpMatchArray) {
  return match[3] ?? match[4] ?? match[5] ?? match[6] ?? undefined
}

function referenceLabel(
  reference: ArticleInlineReference | ArticleInlineReferenceToken,
  literalTitle?: string,
) {
  const fallbackLabel = 'label' in reference ? reference.label : reference.id
  const resolved = literalTitle?.trim() || fallbackLabel

  if (!resolved) {
    return reference.id
  }

  // Evidence types: use short labels
  if (reference.kind === 'figure') return `图 ${resolved}`
  if (reference.kind === 'table') return `表 ${resolved}`
  if (reference.kind === 'formula') return `式 ${resolved}`
  if (reference.kind === 'section') return resolved

  return reference.kind === 'paper' ? `《${resolved}》` : resolved
}

function parseEvidenceAnchors(text: string): ArticleInlineReferenceToken[] {
  const tokens: ArticleInlineReferenceToken[] = []

  for (const match of text.matchAll(EVIDENCE_ANCHOR_RE)) {
    const kind = match[1] as 'figure' | 'table' | 'formula' | 'section'
    const id = match[2]
    const anchorId = `${kind}:${id}`
    const start = match.index ?? 0

    tokens.push({
      id: anchorId,
      kind,
      literalTitle: id,
      start,
      end: start + match[0].length,
      raw: match[0],
    })
  }

  return tokens
}

export function parseInlineArticleReferences(text: string): ArticleInlineReferenceToken[] {
  if (!text) return []

  const evidenceTokens = parseEvidenceAnchors(text)
  const paperNodeTokens: ArticleInlineReferenceToken[] = [...text.matchAll(INLINE_REFERENCE_RE)].map((match) => {
    const id = (match[1] ?? '').toLowerCase()
    const kind = (match[2] ?? '').toLowerCase() === 'paper' ? 'paper' : 'node' as const
    const start = match.index ?? 0

    return {
      id,
      kind,
      literalTitle: resolveLiteralTitle(match),
      start,
      end: start + match[0].length,
      raw: match[0],
    }
  })

  // Merge and sort by position
  return [...evidenceTokens, ...paperNodeTokens].sort((a, b) => a.start - b.start)
}

export function renderInlineArticleText(
  text: string,
  references: Map<string, ArticleInlineReference>,
  stageWindowMonths: number,
): ReactNode[] {
  if (!text) return ['']

  const tokens = parseInlineArticleReferences(text)
  if (tokens.length === 0) return [text]

  const fragments: ReactNode[] = []
  let lastIndex = 0
  let tokenIndex = 0

  for (const token of tokens) {
    if (token.start > lastIndex) {
      fragments.push(text.slice(lastIndex, token.start))
    }

    const reference = references.get(token.id.toLowerCase())

    if (!reference) {
      fragments.push(token.literalTitle ? referenceLabel(token, token.literalTitle) : token.raw)
      lastIndex = token.end
      continue
    }

    // Evidence types: render as clickable link that scrolls to evidence
    if (['figure', 'table', 'formula', 'section'].includes(reference.kind)) {
      fragments.push(
        <Link
          key={`${reference.id}-${tokenIndex}`}
          to={withStageWindowRoute(reference.route, stageWindowMonths)}
          className="cursor-pointer rounded px-0.5 font-medium text-black/88 not-italic transition hover:text-black"
          style={{ fontVariant: 'small-caps' }}
        >
          {referenceLabel(reference, token.literalTitle)}
        </Link>,
      )
    } else {
      // Paper/Node: standard link
      fragments.push(
        <Link
          key={`${reference.id}-${tokenIndex}`}
          to={withStageWindowRoute(reference.route, stageWindowMonths)}
          className="font-medium text-black underline decoration-black/18 underline-offset-4 transition hover:text-[var(--accent-ink)] hover:decoration-[var(--accent-ink)]"
        >
          {referenceLabel(reference, token.literalTitle)}
        </Link>,
      )
    }

    tokenIndex += 1
    lastIndex = token.end
  }

  if (lastIndex < text.length) {
    fragments.push(text.slice(lastIndex))
  }

  return fragments.length > 0 ? fragments : [text]
}
