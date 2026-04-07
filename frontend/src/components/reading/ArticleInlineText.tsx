import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { withStageWindowRoute } from '@/utils/stageWindow'

export type ArticleInlineReference = {
  id: string
  kind: 'paper' | 'node'
  label: string
  route: string
}

export type ArticleInlineReferenceToken = {
  id: string
  kind: 'paper' | 'node'
  literalTitle?: string
  start: number
  end: number
  raw: string
}

const INLINE_REFERENCE_RE =
  /(?<![A-Za-z0-9-])((paper|node)-[a-z0-9-]+)(?:(?:「([^」\n]+)」)|(?:《([^》\n]+)》)|(?:“([^”\n]+)”)|(?:"([^"\n]+)"))?/giu

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

  return reference.kind === 'paper' ? `《${resolved}》` : resolved
}

export function parseInlineArticleReferences(text: string): ArticleInlineReferenceToken[] {
  if (!text) return []

  return [...text.matchAll(INLINE_REFERENCE_RE)].map((match) => {
    const id = (match[1] ?? '').toLowerCase()
    const kind = (match[2] ?? '').toLowerCase() === 'paper' ? 'paper' : 'node'
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

    const reference = references.get(token.id)

    if (!reference) {
      fragments.push(token.literalTitle ? referenceLabel(token, token.literalTitle) : token.raw)
      lastIndex = token.end
      continue
    }

    fragments.push(
      <Link
        key={`${reference.id}-${tokenIndex}`}
        to={withStageWindowRoute(reference.route, stageWindowMonths)}
        className="font-medium text-black underline decoration-black/18 underline-offset-4 transition hover:text-[var(--accent-ink)] hover:decoration-[var(--accent-ink)]"
      >
        {referenceLabel(reference, token.literalTitle)}
      </Link>,
    )

    tokenIndex += 1
    lastIndex = token.end
  }

  if (lastIndex < text.length) {
    fragments.push(text.slice(lastIndex))
  }

  return fragments.length > 0 ? fragments : [text]
}
