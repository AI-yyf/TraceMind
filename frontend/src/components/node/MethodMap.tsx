import { ArrowRight, Beaker, Clock } from 'lucide-react'

import { useI18n } from '@/i18n'
import type { MethodEvolutionStep, PaperSubsection } from '@/types/article'

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export interface MethodEntry {
  paperId: string
  paperTitle: string
  publishedAt?: string
  subsection: PaperSubsection
}

export interface MethodMapProps {
  methods: MethodEntry[]
  evolutionSteps?: MethodEvolutionStep[]
  dimensions?: string[]
  language?: 'zh' | 'en'
  compact?: boolean
}

function subsectionSurfaceLabel(value: string | null | undefined, language: 'zh' | 'en') {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return ''

  const labels =
    language === 'en'
      ? {
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
          figure: 'Figure',
          table: 'Table',
          formula: 'Formula',
          section: 'Section',
        }
      : {
          framing: '问题界定',
          background: '研究背景',
          problem: '核心问题',
          method: '方法',
          experiment: '实验',
          result: '结果',
          results: '结果',
          analysis: '分析',
          contribution: '核心贡献',
          significance: '意义',
          limitation: '局限',
          figure: '图',
          table: '表',
          formula: '公式',
          section: '正文段落',
        }

  return labels[normalized as keyof typeof labels] ?? value ?? ''
}

export function MethodMap({
  methods,
  evolutionSteps = [],
  dimensions = [],
  language = 'zh',
  compact = false,
}: MethodMapProps) {
  const { t } = useI18n()
  if (methods.length === 0) return null

  const transitionKindLabels =
    language === 'en'
      ? {
          'method-evolution': 'Method evolution',
          'problem-shift': 'Problem shift',
          'scale-up': 'Scale-up',
          'scope-broaden': 'Scope broaden',
          complementary: 'Complementary',
        }
      : {
          'method-evolution': '方法推进',
          'problem-shift': '问题迁移',
          'scale-up': '规模放大',
          'scope-broaden': '范围扩展',
          complementary: '互补分支',
        }

  return (
    <section className="rounded-[22px] border border-black/8 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center gap-2">
        <Beaker className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {t('node.methodMapEyebrow', 'Methodology Map')}
        </span>
      </div>

      <div className="mb-5 text-[13px] text-black/54">
        {renderTemplate(t('node.methodCount', '{count} methodologies compared'), {
          count: methods.length,
        })}
      </div>

      {evolutionSteps.length > 0 ? (
        <div className="mb-5 rounded-[16px] bg-[var(--surface-soft)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-black/40" />
            <span className="text-[12px] font-medium text-black/62">
              {t('node.methodEvolution', 'Method Evolution')}
            </span>
          </div>
          <div className="space-y-3">
            {evolutionSteps.slice(0, compact ? 3 : 4).map((step, index) => (
              <div key={`${step.paperId}:${index}`} className="flex items-center gap-3">
                <div className="h-2 w-2 shrink-0 rounded-full bg-black/30" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-black/72">
                    <span>
                      {step.fromPaperTitle && step.toPaperTitle
                        ? `${step.fromPaperTitle} → ${step.toPaperTitle}`
                        : step.paperTitle}
                    </span>
                    {step.transitionType ? (
                      <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-normal text-black/52">
                        {transitionKindLabels[step.transitionType]}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[12px] leading-6 text-black/56">{step.contribution}</div>
                  {step.improvementOverPrevious ? (
                    <div className="mt-1 text-[11px] leading-5 text-black/44">
                      {step.improvementOverPrevious}
                    </div>
                  ) : null}
                </div>
                {index < evolutionSteps.length - 1 ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-black/20" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={compact ? 'grid gap-3' : 'grid gap-3 md:grid-cols-2'}>
        {methods.slice(0, compact ? 3 : 4).map((method) => {
          const localizedTitle =
            language === 'en'
              ? (method.subsection.titleEn || method.subsection.title)
              : method.subsection.title
          const title = subsectionSurfaceLabel(localizedTitle || method.subsection.kind, language)
          const content =
            language === 'en'
              ? (method.subsection.contentEn || method.subsection.content)
              : method.subsection.content
          const yearSuffix = method.publishedAt ? ` | ${new Date(method.publishedAt).getFullYear()}` : ''

          return (
            <div key={method.paperId} className="rounded-[16px] border border-black/6 bg-white px-4 py-3">
              <div className="text-[14px] font-medium leading-6 text-black">{title}</div>
              <div className="mt-1 text-[11px] text-black/40">
                {method.paperTitle}
                {yearSuffix}
              </div>
              <p className="mt-3 text-[13px] leading-6 text-black/58">
                {content.replace(/\s+/gu, ' ').trim().slice(0, compact ? 96 : 120)}
                {content.length > (compact ? 96 : 120) ? '...' : ''}
              </p>
            </div>
          )
        })}
      </div>

      {dimensions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {dimensions.slice(0, compact ? 4 : 6).map((dimension) => (
            <span
              key={dimension}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] text-black/54"
            >
              {dimension}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default MethodMap
