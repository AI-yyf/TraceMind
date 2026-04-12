/**
 * EvidenceBoard - Evidence strength visualization with type badges
 * 
 * Displays evidence cards from EvidenceExplanation[] with:
 * - Type badges: figure, table, formula, section
 * - Strength/importance visualization
 * - Source paper attribution
 */

import { BarChart3, Calculator, Image, FileText, ExternalLink, Shield } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { EvidenceExplanation } from '@/types/alpha'

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export type EvidenceType = 'figure' | 'table' | 'formula' | 'section'

export interface EvidenceBoardProps {
  /** Evidence explanations from NodeViewModel */
  evidence: EvidenceExplanation[]
  /** Language preference */
  language?: 'zh' | 'en'
  /** Callback to open evidence detail */
  onOpenEvidence?: (anchorId: string) => void
}

const EVIDENCE_TYPE_CONFIG = {
  figure: {
    label: '图表',
    labelEn: 'Figure',
    icon: Image,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  table: {
    label: '表格',
    labelEn: 'Table',
    icon: BarChart3,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
  },
  formula: {
    label: '公式',
    labelEn: 'Formula',
    icon: Calculator,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  section: {
    label: '段落',
    labelEn: 'Section',
    icon: FileText,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
}

const IMPORTANCE_LEVELS = {
  high: { label: '关键证据', labelEn: 'Key Evidence', threshold: 8, color: 'text-emerald-600', dots: 3 },
  medium: { label: '重要证据', labelEn: 'Important', threshold: 5, color: 'text-amber-600', dots: 2 },
  low: { label: '辅助证据', labelEn: 'Supporting', threshold: 0, color: 'text-slate-500', dots: 1 },
}

function getImportanceLevel(importance?: number) {
  if (importance === undefined || importance === null) return IMPORTANCE_LEVELS.medium
  if (importance >= IMPORTANCE_LEVELS.high.threshold) return IMPORTANCE_LEVELS.high
  if (importance >= IMPORTANCE_LEVELS.medium.threshold) return IMPORTANCE_LEVELS.medium
  return IMPORTANCE_LEVELS.low
}

export function EvidenceBoard({ evidence, language = 'zh', onOpenEvidence }: EvidenceBoardProps) {
  const { t } = useI18n()
  
  if (evidence.length === 0) {
    return null
  }

  // Group by type
  const grouped = evidence.reduce<Record<EvidenceType, EvidenceExplanation[]>>((acc, item) => {
    const type = item.type as EvidenceType
    if (!acc[type]) acc[type] = []
    acc[type].push(item)
    return acc
  }, {} as Record<EvidenceType, EvidenceExplanation[]>)

  // Sort by importance
  const sortedEvidence = [...evidence].sort((a, b) => {
    const aImportance = a.importance ?? 5
    const bImportance = b.importance ?? 5
    return bImportance - aImportance
  })

  // Stats
  const totalEvidence = evidence.length
  const keyEvidence = evidence.filter(e => (e.importance ?? 5) >= 8).length

  return (
    <section className="rounded-[22px] border border-black/8 bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {t('node.evidenceBoardEyebrow', 'Evidence Board')}
        </span>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 mb-5">
        <div className="rounded-[8px] bg-black/4 px-3 py-1.5">
          <span className="text-[12px] text-black/62">
            {renderTemplate(t('node.evidenceTotal', '{count} evidence items'), { count: totalEvidence })}
          </span>
        </div>
        <div className="rounded-[8px] bg-emerald-50 px-3 py-1.5">
          <span className="text-[12px] text-emerald-600">
            {renderTemplate(t('node.keyEvidenceCount', '{count} key evidence'), { count: keyEvidence })}
          </span>
        </div>
      </div>

      {/* Type Distribution */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.entries(grouped) as [EvidenceType, EvidenceExplanation[]][]).map(([type, items]) => {
          const config = EVIDENCE_TYPE_CONFIG[type]
          return (
            <div 
              key={type}
              className={`flex items-center gap-1.5 rounded-[8px] ${config.bgColor} ${config.borderColor} border px-2.5 py-1`}
            >
              <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
              <span className={`text-[11px] font-medium ${config.color}`}>
                {language === 'en' ? config.labelEn : config.label}
              </span>
              <span className="text-[11px] text-black/40">{items.length}</span>
            </div>
          )
        })}
      </div>

      {/* Evidence Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedEvidence.slice(0, 12).map((item) => (
          <EvidenceCard 
            key={item.anchorId}
            evidence={item}
            language={language}
            onOpen={onOpenEvidence}
          />
        ))}
      </div>

      {/* Show More */}
      {sortedEvidence.length > 12 && (
        <div className="mt-4 text-center">
          <span className="text-[12px] text-black/40">
            {renderTemplate(t('node.evidenceMore', '+{count} more evidence items'), { count: sortedEvidence.length - 12 })}
          </span>
        </div>
      )}
    </section>
  )
}

function EvidenceCard({ 
  evidence, 
  language,
  onOpen,
}: { 
  evidence: EvidenceExplanation
  language: 'zh' | 'en'
  onOpen?: (anchorId: string) => void
}) {
  const typeConfig = EVIDENCE_TYPE_CONFIG[evidence.type as EvidenceType]
  const importanceLevel = getImportanceLevel(evidence.importance)
  const TypeIcon = typeConfig.icon

  const handleClick = () => {
    if (onOpen) {
      onOpen(evidence.anchorId)
    }
  }

  return (
    <div 
      className={`rounded-[14px] ${typeConfig.bgColor} ${typeConfig.borderColor} border p-4 cursor-pointer transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-${typeConfig.borderColor.replace('border-', '')}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick() }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`flex-shrink-0 h-6 w-6 rounded-[6px] bg-white flex items-center justify-center`}>
            <TypeIcon className={`h-3.5 w-3.5 ${typeConfig.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium leading-6 text-black truncate">
              {evidence.label}
            </div>
            <div className="text-[11px] text-black/40 truncate">
              {evidence.title}
            </div>
          </div>
        </div>

        {/* Importance Indicator */}
        <div className="flex-shrink-0 flex items-center gap-0.5">
          {[...Array(importanceLevel.dots)].map((_, i) => (
            <div 
              key={i}
              className={`h-2 w-2 rounded-full ${importanceLevel.color.replace('text-', 'bg-')}`}
            />
          ))}
        </div>
      </div>

      {/* Quote excerpt */}
      {evidence.quote && (
        <div className="text-[12px] leading-6 text-black/58 mb-3">
          "{evidence.quote.slice(0, 80)}{evidence.quote.length > 80 ? '...' : ''}"
        </div>
      )}

      {/* Source attribution */}
      {evidence.sourcePaperTitle && (
        <div className="flex items-center gap-1.5 text-[11px] text-black/40">
          <ExternalLink className="h-3 w-3" />
          <span className="truncate">{evidence.sourcePaperTitle}</span>
        </div>
      )}

      {/* Importance Label */}
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-[11px] font-medium ${importanceLevel.color}`}>
          {language === 'en' ? importanceLevel.labelEn : importanceLevel.label}
        </span>
        {evidence.page && (
          <span className="text-[11px] text-black/30">
            p.{evidence.page}
          </span>
        )}
      </div>
    </div>
  )
}

export default EvidenceBoard