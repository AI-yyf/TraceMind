import { BarChart3, Calculator, ExternalLink, FileText, Shield } from 'lucide-react'

import { getTranslation } from '@/i18n'
import type { EvidenceExplanation } from '@/types/alpha'
import { resolveApiAssetUrl } from '@/utils/api'

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

type EvidenceType = 'figure' | 'table' | 'formula' | 'section'

export interface EvidenceBoardProps {
  evidence: EvidenceExplanation[]
  language?: 'zh' | 'en'
  onOpenEvidence?: (anchorId: string) => void
  paperCoverMap?: Map<string, string | null>
  featuredAnchorIds?: string[]
  supportingAnchorIds?: string[]
  compact?: boolean
}

const EVIDENCE_TYPE_CONFIG = {
  figure: {
    labelKey: 'node.evidenceTypeFigure',
    fallback: 'Figure',
    icon: BarChart3,
    color: 'text-[#7d1938]',
    tint: 'rgba(125,25,56,0.08)',
  },
  table: {
    labelKey: 'node.evidenceTypeTable',
    fallback: 'Table',
    icon: BarChart3,
    color: 'text-[#0f766e]',
    tint: 'rgba(15,118,110,0.08)',
  },
  formula: {
    labelKey: 'node.evidenceTypeFormula',
    fallback: 'Formula',
    icon: Calculator,
    color: 'text-[#1d4ed8]',
    tint: 'rgba(29,78,216,0.08)',
  },
  section: {
    labelKey: 'node.evidenceTypeSection',
    fallback: 'Section',
    icon: FileText,
    color: 'text-[#92400e]',
    tint: 'rgba(146,64,14,0.08)',
  },
} as const satisfies Record<
  EvidenceType,
  { labelKey: string; fallback: string; icon: typeof BarChart3; color: string; tint: string }
>

const IMPORTANCE_LEVELS = {
  high: {
    labelKey: 'node.evidencePriorityHigh',
    fallback: 'Key evidence',
    threshold: 8,
    color: 'text-emerald-600',
    dots: 3,
  },
  medium: {
    labelKey: 'node.evidencePriorityMedium',
    fallback: 'Important',
    threshold: 5,
    color: 'text-amber-600',
    dots: 2,
  },
  low: {
    labelKey: 'node.evidencePriorityLow',
    fallback: 'Supporting',
    threshold: 0,
    color: 'text-slate-500',
    dots: 1,
  },
}

function getImportanceLevel(importance?: number) {
  if (importance === undefined || importance === null) return IMPORTANCE_LEVELS.medium
  if (importance >= IMPORTANCE_LEVELS.high.threshold) return IMPORTANCE_LEVELS.high
  if (importance >= IMPORTANCE_LEVELS.medium.threshold) return IMPORTANCE_LEVELS.medium
  return IMPORTANCE_LEVELS.low
}

function evidencePreviewImage(
  evidence: EvidenceExplanation,
  paperCoverMap?: Map<string, string | null>,
) {
  return (
    resolveApiAssetUrl(evidence.thumbnailPath) ||
    resolveApiAssetUrl(evidence.imagePath) ||
    (evidence.sourcePaperId ? paperCoverMap?.get(evidence.sourcePaperId) ?? null : null)
  )
}

function translateNodeLabel(
  language: 'zh' | 'en',
  key: string,
  fallback: string,
  legacyKey?: string,
) {
  return getTranslation(
    key,
    language,
    legacyKey ? getTranslation(legacyKey, language, fallback) : fallback,
  )
}

export function EvidenceBoard({
  evidence,
  language = 'zh',
  onOpenEvidence,
  paperCoverMap,
  featuredAnchorIds = [],
  supportingAnchorIds = [],
  compact = false,
}: EvidenceBoardProps) {
  if (evidence.length === 0) return null

  const grouped = evidence.reduce<Record<EvidenceType, EvidenceExplanation[]>>((acc, item) => {
    const type = item.type as EvidenceType
    if (!acc[type]) acc[type] = []
    acc[type].push(item)
    return acc
  }, {} as Record<EvidenceType, EvidenceExplanation[]>)

  const sortedEvidence = [...evidence].sort((a, b) => (b.importance ?? 5) - (a.importance ?? 5))
  const evidenceById = new Map(sortedEvidence.map((item) => [item.anchorId, item]))
  const curatedFeatured = featuredAnchorIds
    .map((id) => evidenceById.get(id))
    .filter(Boolean) as EvidenceExplanation[]
  const curatedSupporting = supportingAnchorIds
    .map((id) => evidenceById.get(id))
    .filter(Boolean) as EvidenceExplanation[]
  const featuredEvidence = curatedFeatured[0] ?? sortedEvidence[0]
  const supportingEvidence =
    curatedSupporting.length > 0
      ? curatedSupporting
      : sortedEvidence.filter((item) => item.anchorId !== featuredEvidence?.anchorId).slice(0, 4)
  const visibleSupportingEvidence = compact ? supportingEvidence.slice(0, 3) : supportingEvidence
  const keyEvidence = evidence.filter((item) => (item.importance ?? 5) >= 8).length
  const moreCountThreshold = compact ? 4 : 5

  return (
    <section
      data-testid="node-evidence-board"
      className={compact ? 'py-2' : 'py-3'}
    >
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {translateNodeLabel(
            language,
            'node.evidencePanelEyebrow',
            'Evidence',
            'node.evidenceBoardEyebrow',
          )}
        </span>
      </div>

      <p className="mb-4 text-[13px] leading-6 text-black/52">
        {renderTemplate(
          translateNodeLabel(
            language,
            'node.evidenceTotalLabel',
            '{count} evidence items',
            'node.evidenceTotal',
          ),
          { count: evidence.length },
        )}
        {' · '}
        {renderTemplate(
          translateNodeLabel(
            language,
            'node.evidenceKeyCountLabel',
            '{count} key evidence',
            'node.keyEvidenceCount',
          ),
          { count: keyEvidence },
        )}
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {(Object.entries(grouped) as [EvidenceType, EvidenceExplanation[]][]).map(([type, items]) => {
          const config = EVIDENCE_TYPE_CONFIG[type]

          return (
            <div
              key={type}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/8 bg-transparent px-3 py-1 text-[11px] text-black/50"
            >
              <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
              <span>{translateNodeLabel(language, config.labelKey, config.fallback)}</span>
              <span className="text-black/34">{items.length}</span>
            </div>
          )
        })}
      </div>

      {featuredEvidence ? (
        <div
          className={
            compact
              ? 'grid gap-3'
              : 'grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]'
          }
        >
          <EvidenceCard
            evidence={featuredEvidence}
            language={language}
            onOpen={onOpenEvidence}
            paperCoverMap={paperCoverMap}
            featured
            compact={compact}
          />

          <div className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-1'}>
            {visibleSupportingEvidence.map((item) => (
              <EvidenceCard
                key={item.anchorId}
                evidence={item}
                language={language}
                onOpen={onOpenEvidence}
                paperCoverMap={paperCoverMap}
                compact={compact}
              />
            ))}
          </div>
        </div>
      ) : null}

      {sortedEvidence.length > moreCountThreshold ? (
        <div className="mt-4 text-center text-[12px] text-black/40">
          {renderTemplate(
            translateNodeLabel(
              language,
              'node.evidenceMoreLabel',
              '+{count} more evidence items',
              'node.evidenceMore',
            ),
            { count: sortedEvidence.length - moreCountThreshold },
          )}
        </div>
      ) : null}
    </section>
  )
}

function EvidenceCard({
  evidence,
  language,
  onOpen,
  paperCoverMap,
  featured = false,
  compact = false,
}: {
  evidence: EvidenceExplanation
  language: 'zh' | 'en'
  onOpen?: (anchorId: string) => void
  paperCoverMap?: Map<string, string | null>
  featured?: boolean
  compact?: boolean
}) {
  const config = EVIDENCE_TYPE_CONFIG[evidence.type as EvidenceType]
  const importanceLevel = getImportanceLevel(evidence.importance)
  const TypeIcon = config.icon
  const previewImage = evidencePreviewImage(evidence, paperCoverMap)
  const formulaText =
    evidence.type === 'formula'
      ? (evidence.formulaLatex || evidence.quote || evidence.content || '')
          .replace(/\s+/gu, ' ')
          .trim()
      : ''
  const explanation =
    evidence.whyItMatters ||
    evidence.explanation ||
    (evidence.type === 'formula' ? '' : evidence.content || evidence.quote) ||
    ''
  const excerpt = explanation.replace(/\s+/gu, ' ').trim()
  const cardIsFeatured = featured && !compact
  const previewHeightClass = cardIsFeatured ? 'h-[288px]' : compact ? 'h-[152px]' : 'h-[176px]'
  const fallbackMinHeightClass =
    cardIsFeatured ? 'min-h-[220px]' : compact ? 'min-h-[120px]' : 'min-h-[150px]'
  const titleClass =
    cardIsFeatured ? 'text-[18px] leading-7' : compact ? 'text-[13px] leading-5' : 'text-[14px] leading-6'
  const excerptClass =
    cardIsFeatured ? 'mt-4 text-[14px] leading-7' : compact ? 'mt-2 text-[12px] leading-5' : 'mt-3 text-[12px] leading-6'
  const excerptLimit = cardIsFeatured ? 180 : compact ? 84 : 96
  const formulaLimit = cardIsFeatured ? 240 : compact ? 110 : 150
  const pageLabel = evidence.page
    ? renderTemplate(translateNodeLabel(language, 'node.evidencePageLabel', 'p.{page}'), {
        page: evidence.page,
      })
    : null

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-[20px] border border-black/8 bg-white transition hover:shadow-[0_8px_22px_rgba(15,23,42,0.08)]"
      onClick={() => onOpen?.(evidence.anchorId)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen?.(evidence.anchorId)
      }}
    >
      {previewImage ? (
        <div
          className={`relative ${previewHeightClass} overflow-hidden bg-black/4`}
          style={{
            backgroundImage: `url(${previewImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.86)_68%,rgba(255,255,255,0.96)_100%)]" />
          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
            <TypeIcon className={`h-3.5 w-3.5 ${config.color}`} />
            <span className={`text-[11px] font-medium ${config.color}`}>
              {translateNodeLabel(language, config.labelKey, config.fallback)}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={`${fallbackMinHeightClass} border-b border-black/6 p-4`}
          style={{ backgroundColor: config.tint }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5">
            <TypeIcon className={`h-3.5 w-3.5 ${config.color}`} />
            <span className={`text-[11px] font-medium ${config.color}`}>
              {translateNodeLabel(language, config.labelKey, config.fallback)}
            </span>
          </div>
        </div>
      )}

      <div className={`p-4 ${cardIsFeatured ? 'md:p-5' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={`${titleClass} font-semibold text-black`}>{evidence.label}</div>
            <div className="mt-1 truncate text-[11px] text-black/40">{evidence.title}</div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {[...Array(importanceLevel.dots)].map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full ${importanceLevel.color.replace('text-', 'bg-')}`}
              />
            ))}
          </div>
        </div>

        {formulaText ? (
          <div className="mt-3 overflow-hidden rounded-[12px] bg-[var(--surface-soft)] px-3 py-2">
            <code className="block break-words text-[11px] leading-6 text-black/72">
              {formulaText.slice(0, formulaLimit)}
              {formulaText.length > formulaLimit ? '...' : ''}
            </code>
          </div>
        ) : null}

        {excerpt ? (
          <p className={`${excerptClass} text-black/58`}>
            {excerpt.slice(0, excerptLimit)}
            {excerpt.length > excerptLimit ? '...' : ''}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          {evidence.sourcePaperTitle ? (
            <div className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-black/40">
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{evidence.sourcePaperTitle}</span>
            </div>
          ) : (
            <span className={`text-[11px] font-medium ${importanceLevel.color}`}>
              {translateNodeLabel(language, importanceLevel.labelKey, importanceLevel.fallback)}
            </span>
          )}

          {pageLabel ? <span className="text-[11px] text-black/30">{pageLabel}</span> : null}
        </div>
      </div>
    </div>
  )
}

export default EvidenceBoard
