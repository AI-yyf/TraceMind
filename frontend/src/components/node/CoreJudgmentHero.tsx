import { Sparkles } from 'lucide-react'

import { useI18n } from '@/i18n'

export interface CoreJudgmentHeroProps {
  coreJudgment?: {
    content: string
    contentEn?: string
  }
  confidence?: 'high' | 'medium' | 'low' | 'speculative'
  quickTags?: string[]
  language?: 'zh' | 'en'
}

const CONFIDENCE_LABELS = {
  high: { zh: '高置信判断', en: 'High confidence' },
  medium: { zh: '中等置信判断', en: 'Medium confidence' },
  low: { zh: '低置信判断', en: 'Low confidence' },
  speculative: { zh: '推测性判断', en: 'Speculative' },
} as const

function normalizeQuickTag(tag: string, language: 'zh' | 'en') {
  const normalized = tag.trim().toLowerCase()
  const labels =
    language === 'en'
      ? {
          figure: 'Figure evidence',
          table: 'Table evidence',
          formula: 'Formula evidence',
          section: 'Body evidence',
          framing: 'Framing',
          background: 'Background',
          problem: 'Core problem',
          method: 'Method',
          experiment: 'Experiment',
          result: 'Result',
          results: 'Results',
          analysis: 'Analysis',
          contribution: 'Contribution',
          significance: 'Significance',
          limitation: 'Limitation',
        }
      : {
          figure: '图像证据',
          table: '表格证据',
          formula: '公式证据',
          section: '正文证据',
          framing: '问题界定',
          background: '研究背景',
          problem: '核心问题',
          method: '方法',
          experiment: '实验',
          result: '结果',
          results: '结果',
          analysis: '分析',
          contribution: '贡献',
          significance: '意义',
          limitation: '边界',
        }

  return labels[normalized as keyof typeof labels] ?? tag
}

export function CoreJudgmentHero({
  coreJudgment,
  confidence = 'medium',
  quickTags = [],
  language = 'zh',
}: CoreJudgmentHeroProps) {
  const { t } = useI18n()
  const judgmentText =
    language === 'en'
      ? (coreJudgment?.contentEn || coreJudgment?.content || '')
      : (coreJudgment?.content || '')

  if (!judgmentText) return null

  const confidenceLabel = CONFIDENCE_LABELS[confidence]

  return (
    <section className="border-y border-black/8 py-6">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-black/38">
        <Sparkles className="h-4 w-4 text-black/40" />
        <span>{t('node.coreJudgmentEyebrow', 'Core Judgment')}</span>
      </div>

      <p className="mt-4 max-w-[980px] text-[20px] leading-[1.95] text-black/78 md:text-[22px]">
        {judgmentText}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] text-black/56">
          {language === 'en' ? confidenceLabel.en : confidenceLabel.zh}
        </span>
        {quickTags.slice(0, 6).map((tag, index) => (
          <span
            key={`${tag}:${index}`}
            className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] text-black/54"
          >
            {normalizeQuickTag(tag, language)}
          </span>
        ))}
      </div>
    </section>
  )
}

export default CoreJudgmentHero
