import React from 'react'

import {
  type ArticleInlineReference,
  type ArticleInlineReferenceToken,
  renderInlineArticleText,
} from '@/components/reading/ArticleInlineText'
import { ReadingEvidenceBlock } from '@/components/reading/ReadingEvidenceBlock'
import { useI18n } from '@/i18n'
import type { EvidenceExplanation } from '@/types/alpha'
import type { InlineEvidence, PaperParagraph, PaperRoleInNode, PaperSubsection } from '@/types/article'

const EVIDENCE_EMBED_RE = /\[\[(figure|table|formula):([a-zA-Z0-9_-]+)\]\]/gu

type EmbeddedEvidenceKind = 'figure' | 'table' | 'formula'
type EmbeddedEvidenceMarker = Omit<ArticleInlineReferenceToken, 'kind'> & {
  kind: EmbeddedEvidenceKind
}

interface PaperSectionBlockProps {
  paperId: string
  title: string
  titleEn?: string
  authors: string[]
  publishedAt: string
  citationCount: number | null
  role: PaperRoleInNode
  /** @deprecated Use coreThesis + paragraphs + closingInsight instead */
  introduction?: string
  /** @deprecated Use paragraphs instead */
  subsections?: PaperSubsection[]
  /** @deprecated Use closingInsight instead */
  conclusion?: string
  // === Academic poster style fields ===
  /** Core thesis - poster title style (20-30 words) */
  coreThesis?: string
  coreThesisEn?: string
  /** Natural flowing paragraphs - figure-dominant layout */
  paragraphs?: PaperParagraph[]
  /** Closing insight - paper boundary and handoff point */
  closingInsight?: string
  closingInsightEn?: string
  /** Content version - v2=poster style, v1=legacy */
  contentVersion?: 'v1' | 'v2'
  anchorId: string
  coverImage?: string | null
  originalUrl?: string
  pdfUrl?: string
  referenceMap: Map<string, ArticleInlineReference>
  evidenceById: Map<string, EvidenceExplanation>
  stageWindowMonths: number
  activeAnchor?: string | null
}

interface PaperSubsectionItemProps {
  subsection: PaperSubsection
  referenceMap: Map<string, ArticleInlineReference>
  evidenceItems: EvidenceExplanation[]
  inlineEvidences: InlineEvidence[]
  evidenceById: Map<string, EvidenceExplanation>
  stageWindowMonths: number
  activeAnchor?: string | null
  whyItMattersLabel: string
  language: 'zh' | 'en'
}

// ============================================================================
// Academic Poster Style Components
// ============================================================================

interface PaperParagraphItemProps {
  paragraph: PaperParagraph
  referenceMap: Map<string, ArticleInlineReference>
  evidenceById: Map<string, EvidenceExplanation>
  stageWindowMonths: number
  activeAnchor?: string | null
  whyItMattersLabel: string
  language: 'zh' | 'en'
  isFirst?: boolean
}

/** Render a poster-style paragraph with prominent evidence display */
const PaperParagraphItem: React.FC<PaperParagraphItemProps> = ({
  paragraph,
  referenceMap,
  evidenceById,
  stageWindowMonths,
  activeAnchor,
  whyItMattersLabel,
  language,
  isFirst = false,
}) => {
  // Collect evidence items for this paragraph
  const evidenceItems = paragraph.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((e): e is EvidenceExplanation =>
      Boolean(e) && ['figure', 'table', 'formula'].includes(e?.type as string)
    )

  const inlineEvidences = paragraph.inlineEvidences ?? []

  // Determine layout based on paragraph role and evidence count
  const hasProminentEvidence = evidenceItems.length > 0 || inlineEvidences.length > 0
  const isThesis = paragraph.role === 'thesis'
  const isInsight = paragraph.role === 'insight'

  // Split content into natural flow with evidence markers
  const contentElements = renderParagraphContentWithEvidences(
    paragraph.content,
    referenceMap,
    evidenceById,
    inlineEvidences,
    stageWindowMonths,
    activeAnchor,
    whyItMattersLabel,
    language,
  )

  return (
    <div
      className={`paper-paragraph ${isThesis ? 'paragraph-thesis' : ''} ${isInsight ? 'paragraph-insight' : ''} ${hasProminentEvidence ? 'with-evidence' : ''}`}
      data-role={paragraph.role}
    >
      {/* Paragraph header for non-argument roles */}
      {!isFirst && (isThesis || isInsight) && (
        <div className="paragraph-role-badge">
          {PARAGRAPH_ROLE_LABELS[paragraph.role]?.[language] ?? paragraph.role}
        </div>
      )}

      {/* Main content with inline evidence */}
      <div className={`paragraph-content ${hasProminentEvidence ? 'with-side-evidence' : ''}`}>
        <div className="paragraph-text">
          {contentElements}
        </div>

        {/* Side evidence panel for figure-dominant layout */}
        {hasProminentEvidence && (
          <div className="paragraph-evidence-panel">
            {evidenceItems.map((evidence) => (
              <ReadingEvidenceBlock
                key={evidence.anchorId}
                anchorId={toArticleAnchorId(evidence.anchorId)}
                evidence={evidence}
                highlighted={activeAnchor === evidence.anchorId}
                whyItMattersLabel={whyItMattersLabel}
                variant="article-inline"
              />
            ))}
            {inlineEvidences.map((inline) => (
              <div key={inline.anchorId}>
                {renderInlineEvidenceBlock(inline, evidenceById, activeAnchor, whyItMattersLabel, language)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Render paragraph content with embedded evidence markers */
function renderParagraphContentWithEvidences(
  content: string,
  referenceMap: Map<string, ArticleInlineReference>,
  evidenceById: Map<string, EvidenceExplanation>,
  inlineEvidences: InlineEvidence[],
  stageWindowMonths: number,
  _activeAnchor?: string | null,
  _whyItMattersLabel?: string,
  _language: 'zh' | 'en' = 'zh',
): React.ReactNode[] {
  const evidenceLookup = new Map<string, { full?: EvidenceExplanation; inline?: InlineEvidence }>()

  for (const evidence of evidenceById.values()) {
    evidenceLookup.set(evidence.anchorId.toLowerCase(), { full: evidence })
  }

  for (const inlineEvidence of inlineEvidences) {
    const key = inlineEvidence.anchorId.toLowerCase()
    const current = evidenceLookup.get(key) ?? {}
    evidenceLookup.set(key, { ...current, inline: inlineEvidence })
  }

  const elements: React.ReactNode[] = []
  const paragraphs = splitArticleParagraphs(content)

  paragraphs.forEach((paragraph, pIndex) => {
    const markers = parseEmbeddedEvidenceMarkers(paragraph)

    if (markers.length === 0) {
      elements.push(
        <p key={`p-${pIndex}`} className="poster-paragraph-text">
          {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
        </p>,
      )
      return
    }

    // Split paragraph around evidence markers
    let lastIndex = 0
    const paragraphElements: React.ReactNode[] = []

    for (const marker of markers) {
      if (marker.start > lastIndex) {
        const textBefore = paragraph.slice(lastIndex, marker.start).trim()
        if (textBefore) {
          paragraphElements.push(
            <span key={`text-${lastIndex}`}>
              {renderInlineArticleText(textBefore, referenceMap, stageWindowMonths)}
            </span>,
          )
        }
      }

      const evidenceData = evidenceLookup.get(marker.id.toLowerCase())
      if (evidenceData?.full) {
        paragraphElements.push(
          <span key={`ev-${marker.id}`} className="inline-evidence-reference">
            [{evidenceData.full.label}]
          </span>,
        )
      }

      lastIndex = marker.end
    }

    if (lastIndex < paragraph.length) {
      const textAfter = paragraph.slice(lastIndex).trim()
      if (textAfter) {
        paragraphElements.push(
          <span key={`text-end`}>
            {renderInlineArticleText(textAfter, referenceMap, stageWindowMonths)}
          </span>,
        )
      }
    }

    elements.push(
      <p key={`p-${pIndex}`} className="poster-paragraph-text with-refs">
        {paragraphElements}
      </p>,
    )
  })

  return elements
}

const ROLE_TRANSLATION_KEYS: Record<PaperRoleInNode, string> = {
  origin: 'node.role.origin',
  milestone: 'node.role.milestone',
  branch: 'node.role.branch',
  confluence: 'node.role.confluence',
  extension: 'node.role.extension',
  baseline: 'node.role.baseline',
}

const PARAGRAPH_ROLE_LABELS: Record<string, { zh: string; en: string }> = {
  thesis: { zh: '核心论点', en: 'Core Thesis' },
  argument: { zh: '论证', en: 'Argument' },
  evidence: { zh: '证据', en: 'Evidence' },
  insight: { zh: '洞察', en: 'Insight' },
}

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

function splitArticleParagraphs(text: string) {
  return text
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim()
}

function shouldHideSubsectionParagraph(paragraph: string) {
  const normalized = normalizeText(paragraph)
  if (!normalized) return true

  const lowSignalPatterns = [
    /^当前保留了?\s*\d+\s*张图/u,
    /^围绕这一部分最值得回看的证据是/u,
    /^论文的贡献能否站住/u,
    /^边界与不足往往藏在/u,
    /^Figure \d+ provided the key visual evidence/iu,
    /^Table \d+ compresses the core comparison/iu,
    /^Formula [A-Za-z0-9-]+ defines the main objective/iu,
    /^This section is reconstructed from the abstract/iu,
  ]

  return lowSignalPatterns.some((pattern) => pattern.test(normalized))
}

function renderNarrativeParagraphs(
  paragraphs: string[],
  referenceMap: Map<string, ArticleInlineReference>,
  stageWindowMonths: number,
  className = 'text-[15.8px] leading-[2.04] text-black/74',
) {
  return paragraphs.map((paragraph, index) => (
    <p key={`${index}:${paragraph}`} className={className}>
      {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
    </p>
  ))
}

function parseEmbeddedEvidenceMarkers(text: string): EmbeddedEvidenceMarker[] {
  const tokens: EmbeddedEvidenceMarker[] = []
  for (const match of text.matchAll(EVIDENCE_EMBED_RE)) {
    const kind = match[1] as EmbeddedEvidenceKind
    const id = match[2]
    const anchorId = `${kind}:${id}`
    tokens.push({
      id: anchorId,
      kind,
      literalTitle: id,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      raw: match[0],
    })
  }
  return tokens
}

function formatAuthorLine(authors: string[]) {
  const visibleAuthors = authors.slice(0, 6)
  const suffix =
    authors.length > visibleAuthors.length ? ` +${authors.length - visibleAuthors.length}` : ''
  return `${visibleAuthors.join(', ')}${suffix}`
}

function toArticleAnchorId(anchorId: string) {
  return `anchor-${anchorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function dedupeEvidenceAnchors(evidenceIds: string[]) {
  return Array.from(new Set(evidenceIds.map((item) => item.trim()).filter(Boolean)))
}

function isRenderablePaperEvidence(
  evidence: EvidenceExplanation | undefined | null,
): evidence is EvidenceExplanation {
  return Boolean(
    evidence &&
      (evidence.type === 'figure' || evidence.type === 'table' || evidence.type === 'formula'),
  )
}

function evidenceTypeOrder(type: EvidenceExplanation['type']) {
  if (type === 'figure') return 0
  if (type === 'table') return 1
  if (type === 'formula') return 2
  return 3
}

function evidenceOrdinal(evidence: EvidenceExplanation) {
  const match = `${evidence.title} ${evidence.label}`.match(/\b(\d+(?:\.\d+)?)\b/u)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

function sortEvidenceForArticle(evidence: EvidenceExplanation[]) {
  return [...evidence].sort((left, right) => {
    const leftPage = left.page ?? Number.POSITIVE_INFINITY
    const rightPage = right.page ?? Number.POSITIVE_INFINITY
    if (leftPage !== rightPage) return leftPage - rightPage

    const typeDelta = evidenceTypeOrder(left.type) - evidenceTypeOrder(right.type)
    if (typeDelta !== 0) return typeDelta

    const ordinalDelta = evidenceOrdinal(left) - evidenceOrdinal(right)
    if (ordinalDelta !== 0) return ordinalDelta

    return left.anchorId.localeCompare(right.anchorId)
  })
}

function subsectionEvidenceItems(
  subsection: PaperSubsection,
  evidenceById: Map<string, EvidenceExplanation>,
) {
  return sortEvidenceForArticle(
    dedupeEvidenceAnchors(subsection.evidenceIds)
      .map((anchorId) => evidenceById.get(anchorId) ?? null)
      .filter(isRenderablePaperEvidence),
  )
}

function resolveEvidencePlacementIndex(subsections: PaperSubsection[], evidence: EvidenceExplanation) {
  const preferredKinds: Record<EvidenceExplanation['type'], PaperSubsection['kind'][]> = {
    figure: ['method', 'results', 'experiment', 'background'],
    table: ['results', 'experiment', 'contribution', 'significance'],
    formula: ['method', 'problem', 'results', 'contribution'],
    section: ['background'],
  }

  const preference = preferredKinds[evidence.type] ?? []
  for (const kind of preference) {
    const index = subsections.findIndex((subsection) => subsection.kind === kind)
    if (index >= 0) return index
  }

  return Math.max(0, subsections.length - 1)
}

function buildSubsectionEvidencePlan(
  paperId: string,
  subsections: PaperSubsection[],
  evidenceById: Map<string, EvidenceExplanation>,
) {
  const plan = subsections.map((subsection) => subsectionEvidenceItems(subsection, evidenceById))
  const seen = new Set(plan.flatMap((items) => items.map((item) => item.anchorId.toLowerCase())))

  const paperEvidence = sortEvidenceForArticle(
    Array.from(evidenceById.values()).filter(
      (item) => isRenderablePaperEvidence(item) && item.sourcePaperId === paperId,
    ),
  )

  for (const evidence of paperEvidence) {
    const normalizedAnchorId = evidence.anchorId.toLowerCase()
    if (seen.has(normalizedAnchorId)) continue
    seen.add(normalizedAnchorId)
    const index = resolveEvidencePlacementIndex(subsections, evidence)
    plan[index]?.push(evidence)
  }

  return plan.map((items) => sortEvidenceForArticle(items))
}

function renderInlineEvidenceBlock(
  inlineEvidence: InlineEvidence,
  evidenceById: Map<string, EvidenceExplanation>,
  activeAnchor?: string | null,
  whyItMattersLabel?: string,
  language: 'zh' | 'en' = 'zh',
) {
  const fullEvidence = evidenceById.get(inlineEvidence.anchorId)
  if (fullEvidence) {
    return (
      <ReadingEvidenceBlock
        key={inlineEvidence.anchorId}
        anchorId={toArticleAnchorId(inlineEvidence.anchorId)}
        evidence={fullEvidence}
        highlighted={activeAnchor === inlineEvidence.anchorId}
        whyItMattersLabel={whyItMattersLabel ?? 'Why it matters: '}
        variant="article-inline"
      />
    )
  }

  const typeLabels =
    language === 'en'
      ? { figure: 'Figure', table: 'Table', formula: 'Formula' }
      : { figure: '图示', table: '表格', formula: '公式' }

  return (
    <figure
      key={inlineEvidence.anchorId}
      id={toArticleAnchorId(inlineEvidence.anchorId)}
      className="my-8"
    >
      <figcaption className="text-center text-[11px] uppercase tracking-[0.18em] text-black/38">
        {typeLabels[inlineEvidence.type]}
      </figcaption>
      <p className="mx-auto mt-3 max-w-[680px] text-[14px] leading-8 text-black/64">
        {inlineEvidence.description}
      </p>
      {inlineEvidence.whyItMatters ? (
        <p className="mx-auto mt-2 max-w-[680px] text-[13px] leading-7 text-black/50">
          <span className="font-medium text-black/70">{whyItMattersLabel}</span>
          {inlineEvidence.whyItMatters}
        </p>
      ) : null}
    </figure>
  )
}

function renderNarrativeParagraphsWithEvidences(
  paragraphs: string[],
  referenceMap: Map<string, ArticleInlineReference>,
  stageWindowMonths: number,
  evidenceById: Map<string, EvidenceExplanation>,
  inlineEvidences: InlineEvidence[],
  activeAnchor?: string | null,
  whyItMattersLabel?: string,
  language: 'zh' | 'en' = 'zh',
): React.ReactNode[] {
  const evidenceLookup = new Map<
    string,
    { full?: EvidenceExplanation; inline?: InlineEvidence }
  >()

  for (const evidence of evidenceById.values()) {
    evidenceLookup.set(evidence.anchorId.toLowerCase(), { full: evidence })
  }

  for (const inlineEvidence of inlineEvidences) {
    const key = inlineEvidence.anchorId.toLowerCase()
    const current = evidenceLookup.get(key) ?? {}
    evidenceLookup.set(key, { ...current, inline: inlineEvidence })
  }

  const elements: React.ReactNode[] = []
  let keyIndex = 0

  for (const paragraph of paragraphs) {
    const markers = parseEmbeddedEvidenceMarkers(paragraph)
    if (markers.length === 0) {
      elements.push(
        <p key={`p-${keyIndex}`} className="text-[15.8px] leading-[2.04] text-black/74">
          {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
        </p>,
      )
      keyIndex += 1
      continue
    }

    let lastIndex = 0
    for (const marker of markers) {
      if (marker.start > lastIndex) {
        const textBefore = paragraph.slice(lastIndex, marker.start).trim()
        if (textBefore) {
          elements.push(
            <p key={`p-${keyIndex}`} className="text-[15.8px] leading-[2.04] text-black/74">
              {renderInlineArticleText(textBefore, referenceMap, stageWindowMonths)}
            </p>,
          )
          keyIndex += 1
        }
      }

      const evidenceData = evidenceLookup.get(marker.id.toLowerCase())
      if (evidenceData?.full) {
        elements.push(
          <ReadingEvidenceBlock
            key={`ev-${keyIndex}-${marker.id}`}
            anchorId={toArticleAnchorId(marker.id)}
            evidence={evidenceData.full}
            highlighted={activeAnchor === marker.id}
            whyItMattersLabel={whyItMattersLabel ?? 'Why it matters: '}
            variant="article-inline"
          />,
        )
      } else if (evidenceData?.inline) {
        elements.push(
          renderInlineEvidenceBlock(
            evidenceData.inline,
            evidenceById,
            activeAnchor,
            whyItMattersLabel,
            language,
          ),
        )
      }

      keyIndex += 1
      lastIndex = marker.end
    }

    if (lastIndex < paragraph.length) {
      const textAfter = paragraph.slice(lastIndex).trim()
      if (textAfter) {
        elements.push(
          <p key={`p-${keyIndex}`} className="text-[15.8px] leading-[2.04] text-black/74">
            {renderInlineArticleText(textAfter, referenceMap, stageWindowMonths)}
          </p>,
        )
        keyIndex += 1
      }
    }
  }

  return elements
}

const PaperSubsectionItem: React.FC<PaperSubsectionItemProps> = ({
  subsection,
  referenceMap,
  evidenceItems,
  inlineEvidences,
  evidenceById,
  stageWindowMonths,
  activeAnchor,
  whyItMattersLabel,
  language,
}) => {
  const paragraphs = splitArticleParagraphs(subsection.content).filter(
    (paragraph) => !shouldHideSubsectionParagraph(paragraph),
  )

  const normalizedEvidenceById = new Map<string, EvidenceExplanation>()
  const mergedEvidenceItems: Array<
    { type: 'full'; data: EvidenceExplanation } | { type: 'inline'; data: InlineEvidence }
  > = []
  const seenEvidenceAnchors = new Set<string>()

  for (const evidence of evidenceItems) {
    const key = evidence.anchorId.toLowerCase()
    if (seenEvidenceAnchors.has(key)) continue
    seenEvidenceAnchors.add(key)
    normalizedEvidenceById.set(key, evidence)
    mergedEvidenceItems.push({ type: 'full', data: evidence })
  }

  for (const inlineEvidence of inlineEvidences) {
    const key = inlineEvidence.anchorId.toLowerCase()
    if (seenEvidenceAnchors.has(key)) continue
    seenEvidenceAnchors.add(key)
    mergedEvidenceItems.push({ type: 'inline', data: inlineEvidence })
  }

  const embeddedAnchorIds = new Set<string>()
  for (const paragraph of paragraphs) {
    for (const marker of parseEmbeddedEvidenceMarkers(paragraph)) {
      embeddedAnchorIds.add(marker.id.toLowerCase())
    }
  }

  const hasEmbeddedEvidences = embeddedAnchorIds.size > 0
  const unembeddedEvidenceItems = mergedEvidenceItems.filter(
    (item) => !embeddedAnchorIds.has(item.data.anchorId.toLowerCase()),
  )

  return (
    <section className="space-y-5">
      <div className="space-y-4">
        {hasEmbeddedEvidences
          ? renderNarrativeParagraphsWithEvidences(
              paragraphs,
              referenceMap,
              stageWindowMonths,
              normalizedEvidenceById,
              inlineEvidences,
              activeAnchor,
              whyItMattersLabel,
              language,
            )
          : renderNarrativeParagraphs(
              paragraphs,
              referenceMap,
              stageWindowMonths,
              'text-[15.8px] leading-[2.04] text-black/74',
            )}
      </div>

      {unembeddedEvidenceItems.length > 0 ? (
        <div className="space-y-7">
          {unembeddedEvidenceItems.map((item) => {
            if (item.type === 'full') {
              return (
                <ReadingEvidenceBlock
                  key={item.data.anchorId}
                  anchorId={toArticleAnchorId(item.data.anchorId)}
                  evidence={item.data}
                  highlighted={activeAnchor === item.data.anchorId}
                  whyItMattersLabel={whyItMattersLabel}
                  variant="article-inline"
                />
              )
            }

            return renderInlineEvidenceBlock(
              item.data,
              evidenceById,
              activeAnchor,
              whyItMattersLabel,
              language,
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

/** Check if we should use poster-style (v2) or legacy (v1) layout */
function isPosterStyle(props: PaperSectionBlockProps): boolean {
  return props.contentVersion === 'v2' || (props.coreThesis !== undefined && props.paragraphs !== undefined && props.paragraphs.length > 0)
}

export const PaperSectionBlock: React.FC<PaperSectionBlockProps> = (props) => {
  const { t, preference } = useI18n()
  const displayLanguage = preference.primary === 'zh' ? 'zh' : 'en'
  const roleLabel = t(ROLE_TRANSLATION_KEYS[props.role])

  const {
    paperId,
    title,
    titleEn,
    authors,
    publishedAt,
    citationCount,
    role,
    coreThesis,
    coreThesisEn,
    paragraphs,
    closingInsight,
    closingInsightEn,
    // Legacy fields
    introduction,
    subsections,
    conclusion,
    anchorId,
    referenceMap,
    evidenceById,
    stageWindowMonths,
    activeAnchor,
  } = props

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return ''
    return displayLanguage === 'zh'
      ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
  }

  const metaLine = [
    roleLabel,
    publishedAt ? formatDate(publishedAt) : '',
    citationCount !== null
      ? renderTemplate(t('node.citations', 'Cited {count} times'), { count: citationCount })
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  // Use poster-style layout (v2)
  if (isPosterStyle(props)) {
    const displayThesis = displayLanguage === 'zh' && coreThesis ? coreThesis : (coreThesisEn || coreThesis || '')
    const displayClosing = displayLanguage === 'zh' && closingInsight ? closingInsight : (closingInsightEn || closingInsight || '')
    const posterParagraphs = paragraphs ?? []

    return (
      <article
        id={anchorId}
        data-paper-id={paperId}
        data-paper-role={role}
        data-content-version="v2"
        className="academic-poster-paper pt-16"
      >
        {/* Paper Header */}
        <div className="poster-paper-header mb-8">
          {metaLine ? (
            <div className="poster-meta-line">{metaLine}</div>
          ) : null}

          <h3 className="poster-paper-title">{title}</h3>

          {titleEn && titleEn !== title ? (
            <div className="poster-paper-title-en">{titleEn}</div>
          ) : null}

          <div className="poster-paper-authors">{formatAuthorLine(authors)}</div>
        </div>

        {/* Core Thesis - Poster Title Style */}
        {displayThesis ? (
          <div className="poster-core-thesis">
            <div className="thesis-label">{PARAGRAPH_ROLE_LABELS.thesis[displayLanguage]}</div>
            <p className="thesis-content">{displayThesis}</p>
          </div>
        ) : null}

        {/* Natural Flowing Paragraphs */}
        {posterParagraphs.length > 0 ? (
          <div className="poster-paragraphs-flow">
            {posterParagraphs.map((paragraph, index) => (
              <PaperParagraphItem
                key={`${paragraph.role}-${index}`}
                paragraph={paragraph}
                referenceMap={referenceMap}
                evidenceById={evidenceById}
                stageWindowMonths={stageWindowMonths}
                activeAnchor={activeAnchor}
                whyItMattersLabel={t('node.whyItMatters', 'Why it matters: ')}
                language={displayLanguage}
                isFirst={index === 0}
              />
            ))}
          </div>
        ) : null}

        {/* Closing Insight */}
        {displayClosing ? (
          <div className="poster-closing-insight">
            <div className="insight-label">{PARAGRAPH_ROLE_LABELS.insight[displayLanguage]}</div>
            <p className="insight-content">{displayClosing}</p>
          </div>
        ) : null}
      </article>
    )
  }

  // Legacy layout (v1) - for backward compatibility
  const legacySubsections = subsections ?? []
  const legacyIntroduction = introduction ?? ''
  const legacyConclusion = conclusion ?? ''
  const subsectionEvidencePlan = buildSubsectionEvidencePlan(paperId, legacySubsections, evidenceById)

  return (
    <article
      id={anchorId}
      data-paper-id={paperId}
      data-paper-role={role}
      data-content-version="v1"
      className="pt-16"
    >
      <div className="mb-8">
        {metaLine ? (
          <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-black/34">{metaLine}</div>
        ) : null}

        <h3 className="text-[28px] font-semibold leading-[1.22] text-black">{title}</h3>

        {titleEn && titleEn !== title ? (
          <div className="mt-2 text-[13px] leading-7 text-black/42">{titleEn}</div>
        ) : null}

        <div className="mt-3 text-[13px] leading-7 text-black/50">{formatAuthorLine(authors)}</div>
      </div>

      <div className="space-y-5">
        {renderNarrativeParagraphs(
          splitArticleParagraphs(legacyIntroduction),
          referenceMap,
          stageWindowMonths,
          'text-[15.6px] leading-[2.06] text-black/76',
        )}
      </div>

      <div className="mt-12 space-y-9">
        {legacySubsections.map((subsection, index) => (
          <PaperSubsectionItem
            key={`${subsection.kind}:${subsection.title ?? subsection.titleEn ?? index}`}
            subsection={subsection}
            referenceMap={referenceMap}
            evidenceItems={subsectionEvidencePlan[index] ?? []}
            inlineEvidences={subsection.inlineEvidences ?? []}
            evidenceById={evidenceById}
            stageWindowMonths={stageWindowMonths}
            activeAnchor={activeAnchor}
            whyItMattersLabel={t('node.whyItMatters', 'Why it matters: ')}
            language={displayLanguage}
          />
        ))}
      </div>

      <div className="mt-12 space-y-5">
        <div className="hidden sr-only">
          {t('node.paper.conclusion', displayLanguage === 'zh' ? '结语' : 'Conclusion')}
        </div>
        <div className="space-y-5">
          {renderNarrativeParagraphs(
            splitArticleParagraphs(legacyConclusion),
            referenceMap,
            stageWindowMonths,
            'text-[15.8px] leading-[2.04] text-black/72',
          )}
        </div>
      </div>
    </article>
  )
}
