import React from 'react'

import {
  type ArticleInlineReference,
  renderInlineArticleText,
} from '@/components/reading/ArticleInlineText'
import { ReadingEvidenceBlock } from '@/components/reading/ReadingEvidenceBlock'
import { useI18n } from '@/i18n'
import type { EvidenceExplanation } from '@/types/alpha'
import type { PaperRoleInNode, PaperSubsection } from '@/types/article'
import { resolveApiAssetUrl } from '@/utils/api'

interface PaperSectionBlockProps {
  paperId: string
  title: string
  titleEn?: string
  authors: string[]
  publishedAt: string
  citationCount: number | null
  role: PaperRoleInNode
  introduction: string
  subsections: PaperSubsection[]
  conclusion: string
  anchorId: string
  coverImage?: string | null
  originalUrl?: string
  pdfUrl?: string
  referenceMap: Map<string, ArticleInlineReference>
  evidenceById: Map<string, EvidenceExplanation>
  stageWindowMonths: number
  activeAnchor?: string | null
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

function renderNarrativeParagraphs(
  paragraphs: string[],
  referenceMap: Map<string, ArticleInlineReference>,
  stageWindowMonths: number,
) {
  return paragraphs.map((paragraph, index) => (
    <p key={`${index}:${paragraph}`} className="text-[16px] leading-9 text-black/68">
      {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
    </p>
  ))
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

const ROLE_TRANSLATION_KEYS: Record<PaperRoleInNode, string> = {
  origin: 'node.role.origin',
  milestone: 'node.role.milestone',
  branch: 'node.role.branch',
  confluence: 'node.role.confluence',
  extension: 'node.role.extension',
  baseline: 'node.role.baseline',
}

const SUBSECTION_TRANSLATION_KEYS: Record<PaperSubsection['kind'], string> = {
  background: 'node.paper.background',
  problem: 'node.paper.problem',
  method: 'node.paper.method',
  experiment: 'node.paper.experiment',
  results: 'node.paper.results',
  contribution: 'node.paper.contribution',
  limitation: 'node.paper.limitation',
  significance: 'node.paper.significance',
}

function looksLikeEvidenceTitle(value: string) {
  const normalized = value.trim()
  if (!normalized) return true
  return /^(figure|table|formula|equation|section|appendix)\b/i.test(normalized)
}

function normalizeSubsectionTitle(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/gu, ' ').trim().toLowerCase()
}

function resolveSubsectionHeading(
  subsection: PaperSubsection,
  t: (key: string, fallback?: string) => string,
) {
  const normalizedTitle = normalizeSubsectionTitle(subsection.title)
  const normalizedTitleEn = normalizeSubsectionTitle(subsection.titleEn)
  const fallbackZh = t(SUBSECTION_TRANSLATION_KEYS[subsection.kind])
  const fallbackEn = t(SUBSECTION_TRANSLATION_KEYS[subsection.kind])

  if (
    normalizedTitle === normalizeSubsectionTitle(fallbackEn) ||
    normalizedTitle === normalizeSubsectionTitle(fallbackZh) ||
    normalizedTitleEn === normalizeSubsectionTitle(fallbackEn) ||
    normalizedTitleEn === normalizeSubsectionTitle(fallbackZh)
  ) {
    return t(SUBSECTION_TRANSLATION_KEYS[subsection.kind])
  }

  if (!looksLikeEvidenceTitle(subsection.title)) {
    return subsection.title
  }

  if (subsection.titleEn && !looksLikeEvidenceTitle(subsection.titleEn)) {
    return subsection.titleEn
  }

  return t(SUBSECTION_TRANSLATION_KEYS[subsection.kind])
}

function dedupeEvidenceAnchors(evidenceIds: string[]) {
  return Array.from(new Set(evidenceIds.map((item) => item.trim()).filter(Boolean)))
}

function subsectionEvidenceItems(
  subsection: PaperSubsection,
  evidenceById: Map<string, EvidenceExplanation>,
) {
  return dedupeEvidenceAnchors(subsection.evidenceIds)
    .map((anchorId) => evidenceById.get(anchorId) ?? null)
    .filter((item): item is EvidenceExplanation => Boolean(item))
    .filter((item) => item.type === 'figure' || item.type === 'table' || item.type === 'formula')
}

function buildInlineEvidencePlan(
  subsections: PaperSubsection[],
  evidenceById: Map<string, EvidenceExplanation>,
) {
  const seen = new Set<string>()
  const plan = new Map<PaperSubsection['kind'], EvidenceExplanation[]>()

  for (const subsection of subsections) {
    const uniqueEvidence = subsectionEvidenceItems(subsection, evidenceById).filter((item) => {
      if (seen.has(item.anchorId)) return false
      seen.add(item.anchorId)
      return true
    })

    plan.set(subsection.kind, uniqueEvidence)
  }

  return plan
}

export const PaperSectionBlock: React.FC<PaperSectionBlockProps> = ({
  paperId,
  title,
  titleEn,
  authors,
  publishedAt,
  citationCount,
  role,
  introduction,
  subsections,
  conclusion,
  anchorId,
  coverImage,
  referenceMap,
  evidenceById,
  stageWindowMonths,
  activeAnchor,
}) => {
  const { t, preference } = useI18n()
  const displayLanguage = preference.primary === 'zh' ? 'zh' : 'en'
  const roleLabel = t(ROLE_TRANSLATION_KEYS[role])
  const inlineEvidencePlan = buildInlineEvidencePlan(subsections, evidenceById)

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
      ? renderTemplate(t('node.citations', 'Cited {count} times'), {
          count: citationCount,
        })
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      id={anchorId}
      data-paper-id={paperId}
      data-paper-role={role}
      className="border-t border-black/6 pt-12"
    >
      <div className="mb-6">
        {metaLine ? (
          <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-black/40">{metaLine}</div>
        ) : null}

        <h3 className="text-[30px] font-semibold leading-[1.2] text-black">{title}</h3>

        {titleEn && titleEn !== title ? (
          <div className="mt-2 text-[14px] leading-7 text-black/42">{titleEn}</div>
        ) : null}

        <div className="mt-3 text-[13px] leading-7 text-black/50">{formatAuthorLine(authors)}</div>
      </div>

      <div className="space-y-4">
        {renderNarrativeParagraphs(
          splitArticleParagraphs(introduction),
          referenceMap,
          stageWindowMonths,
        )}
      </div>

      <div className="mt-9 space-y-10">
        {subsections.map((subsection) => (
          <PaperSubsectionItem
            key={subsection.kind}
            subsection={subsection}
            representativeImage={subsection.kind === 'method' ? resolveApiAssetUrl(coverImage) ?? coverImage ?? null : null}
            referenceMap={referenceMap}
            evidenceItems={inlineEvidencePlan.get(subsection.kind) ?? []}
            stageWindowMonths={stageWindowMonths}
            activeAnchor={activeAnchor}
            whyItMattersLabel={t('evidence.whyItMatters', 'Why it matters: ')}
            t={t}
          />
        ))}
      </div>

      <section className="mt-10 border-t border-black/6 pt-6">
        <h4 className="text-[18px] font-semibold leading-[1.2] text-black/88">
          {t('node.paper.conclusion', displayLanguage === 'zh' ? '结语' : 'Conclusion')}
        </h4>
        <div className="mt-4 space-y-4">
          {renderNarrativeParagraphs(
            splitArticleParagraphs(conclusion),
            referenceMap,
            stageWindowMonths,
          )}
        </div>
      </section>
    </article>
  )
}

interface PaperSubsectionItemProps {
  subsection: PaperSubsection
  representativeImage: string | null
  referenceMap: Map<string, ArticleInlineReference>
  evidenceItems: EvidenceExplanation[]
  stageWindowMonths: number
  activeAnchor?: string | null
  whyItMattersLabel: string
  t: (key: string, fallback?: string) => string
}

const PaperSubsectionItem: React.FC<PaperSubsectionItemProps> = ({
  subsection,
  representativeImage,
  referenceMap,
  evidenceItems,
  stageWindowMonths,
  activeAnchor,
  whyItMattersLabel,
  t,
}) => {
  const heading = resolveSubsectionHeading(subsection, t)

  return (
    <section>
      <h4 className="mb-4 text-[20px] font-semibold leading-[1.25] text-black/88">{heading}</h4>

      <div className="space-y-4">
        {renderNarrativeParagraphs(
          splitArticleParagraphs(subsection.content),
          referenceMap,
          stageWindowMonths,
        )}
      </div>

      {evidenceItems.length > 0 ? (
        <div className="mt-6 space-y-6">
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
        </div>
      ) : representativeImage ? (
        <figure className="mt-6 border-y border-black/8 py-6">
          <img
            src={representativeImage}
            alt={heading}
            className="max-h-[520px] w-full rounded-[20px] border border-black/8 bg-white object-contain p-3"
            loading="lazy"
          />
          <figcaption className="mt-4 text-[14px] leading-7 text-black/56">
            {t('node.representativeFigureHint')}
          </figcaption>
        </figure>
      ) : null}
    </section>
  )
}
