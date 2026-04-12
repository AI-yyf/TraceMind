/**
 * CoreJudgmentHero - Displays the node's core judgment with confidence visualization
 * 
 * Extracts and displays coreJudgment from NodeViewModel with:
 * - Visual confidence indicator
 * - Quick tags from keyPoints
 */

import { Sparkles, Target, TrendingUp } from 'lucide-react'
import { useI18n } from '@/i18n'

export interface CoreJudgmentHeroProps {
  /** Core judgment content (bilingual) */
  coreJudgment?: {
    content: string
    contentEn?: string
  }
  /** Confidence level (derived from evidence strength) */
  confidence?: 'high' | 'medium' | 'low' | 'speculative'
  /** Quick tags extracted from keyPoints */
  quickTags?: string[]
  /** Language preference */
  language?: 'zh' | 'en'
}

const CONFIDENCE_CONFIG = {
  high: {
    label: '高置信度',
    labelEn: 'High Confidence',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    width: '100%',
    icon: Target,
  },
  medium: {
    label: '中等置信度',
    labelEn: 'Medium Confidence',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    width: '66%',
    icon: TrendingUp,
  },
  low: {
    label: '低置信度',
    labelEn: 'Low Confidence',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    width: '33%',
    icon: Sparkles,
  },
  speculative: {
    label: '推测性',
    labelEn: 'Speculative',
    color: 'text-slate-500',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    width: '15%',
    icon: Sparkles,
  },
}

export function CoreJudgmentHero({
  coreJudgment,
  confidence = 'medium',
  quickTags = [],
  language = 'zh',
}: CoreJudgmentHeroProps) {
  const { t } = useI18n()
  
  const config = CONFIDENCE_CONFIG[confidence]
  const IconComponent = config.icon

  // Get the appropriate language version
  const judgmentText = language === 'en' 
    ? (coreJudgment?.contentEn || coreJudgment?.content || '')
    : (coreJudgment?.content || '')

  if (!judgmentText) {
    return null
  }

  return (
    <section className="rounded-[22px] border border-black/8 bg-[linear-gradient(180deg,#faf8f5_0%,#fff_100%)] p-6 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {t('node.coreJudgmentEyebrow', 'Core Judgment')}
        </span>
      </div>

      {/* Judgment Text */}
      <p className="text-[18px] leading-[1.6] text-black/78 font-medium">
        {judgmentText}
      </p>

      {/* Confidence Indicator */}
      <div className={`mt-5 rounded-[10px] ${config.bgColor} ${config.borderColor} border p-3`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconComponent className={`h-4 w-4 ${config.color}`} />
            <span className={`text-[13px] font-medium ${config.color}`}>
              {language === 'en' ? config.labelEn : config.label}
            </span>
          </div>
          <span className="text-[11px] text-black/40">
            {t('node.confidenceBasedOn', 'Based on evidence strength')}
          </span>
        </div>
        
        {/* Confidence Bar */}
        <div className="relative h-2 rounded-full bg-white/60 overflow-hidden">
          <div 
            className={`absolute left-0 top-0 h-full rounded-full ${config.color.replace('text-', 'bg-')} transition-all duration-500`}
            style={{ width: config.width }}
          />
        </div>
      </div>

      {/* Quick Tags */}
      {quickTags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {quickTags.slice(0, 6).map((tag, index) => (
            <span 
              key={`${tag}:${index}`}
              className="inline-flex items-center rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-black/54"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

export default CoreJudgmentHero