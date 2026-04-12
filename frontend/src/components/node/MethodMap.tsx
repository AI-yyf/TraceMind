/**
 * MethodMap - Methodology comparison across papers in the node
 * 
 * Displays:
 * - Method comparison table (dimensions from PaperSubsection method)
 * - Evolution timeline visualization
 */

import { ArrowRight, Beaker, Clock, GitBranch } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { PaperSubsection, MethodEvolutionStep } from '@/types/article'

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
  /** Methods extracted from paper subsections */
  methods: MethodEntry[]
  /** Evolution timeline from synthesis block */
  evolutionSteps?: MethodEvolutionStep[]
  /** Language preference */
  language?: 'zh' | 'en'
}

/**
 * Extract key method dimensions from subsection content
 */
function extractMethodDimensions(methods: MethodEntry[]): string[] {
  const dimensions = new Set<string>()
  
  methods.forEach(({ subsection }) => {
    const content = subsection.content
    const contentEn = subsection.contentEn || ''
    
    // Extract common method dimensions
    const patterns = [
      /架构|architecture|framework|model|结构/i,
      /训练|training|learning|优化|optimization/i,
      /数据|data|dataset|corpus/i,
      /评估|evaluation|benchmark|metric|测试/i,
      /效率|efficiency|performance|速度|speed/i,
      /规模|scale|size|参数|parameters/i,
    ]
    
    patterns.forEach(pattern => {
      if (pattern.test(content) || pattern.test(contentEn)) {
        const match = pattern.exec(content) || pattern.exec(contentEn)
        if (match) {
          dimensions.add(match[0])
        }
      }
    })
    
    // Use keyPoints as dimensions if available
    subsection.keyPoints.slice(0, 3).forEach(point => {
      const shortPoint = point.split(/[，,：:]/)[0].trim()
      if (shortPoint.length < 20) {
        dimensions.add(shortPoint)
      }
    })
  })
  
  return Array.from(dimensions).slice(0, 5)
}

export function MethodMap({ methods, evolutionSteps = [], language = 'zh' }: MethodMapProps) {
  const { t } = useI18n()
  
  if (methods.length === 0) {
    return null
  }

  const dimensions = extractMethodDimensions(methods)

  return (
    <section className="rounded-[22px] border border-black/8 bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Beaker className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {t('node.methodMapEyebrow', 'Methodology Map')}
        </span>
      </div>

      {/* Method Count */}
      <div className="text-[13px] text-black/54 mb-5">
        {renderTemplate(t('node.methodCount', '{count} methodologies compared'), { count: methods.length })}
      </div>

      {/* Method Evolution Timeline */}
      {evolutionSteps.length > 0 && (
        <div className="mb-6 rounded-[12px] bg-[linear-gradient(180deg,#f8f5f0_0%,#fff_100%)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-black/40" />
            <span className="text-[12px] font-medium text-black/62">
              {t('node.methodEvolution', 'Method Evolution')}
            </span>
          </div>
          
          <div className="space-y-2">
            {evolutionSteps.slice(0, 4).map((step, index) => (
              <div key={`evolution-${index}`} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-black/30" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-black truncate">
                    {step.contribution}
                  </div>
                  <div className="text-[11px] text-black/40 mt-0.5">
                    {step.paperTitle}
                  </div>
                </div>
                {index < evolutionSteps.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-black/20 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Method Comparison Grid */}
      <div className="space-y-3">
        {methods.slice(0, 5).map((method) => (
          <MethodCard key={method.paperId} method={method} language={language} />
        ))}
      </div>

      {/* Dimension Tags */}
      {dimensions.length > 0 && (
        <div className="mt-5 pt-4 border-t border-black/8">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="h-4 w-4 text-black/40" />
            <span className="text-[12px] text-black/54">
              {t('node.methodDimensions', 'Key Dimensions')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {dimensions.map((dim, index) => (
              <span 
                key={`dim-${index}`}
                className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-black/54"
              >
                {dim}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function MethodCard({ method, language }: { method: MethodEntry; language: 'zh' | 'en' }) {
  const title = language === 'en' 
    ? (method.subsection.titleEn || method.subsection.title)
    : method.subsection.title
  
  const content = language === 'en'
    ? (method.subsection.contentEn || method.subsection.content)
    : method.subsection.content

  // Extract brief summary (first 150 chars)
  const summary = content.replace(/\s+/g, ' ').trim().slice(0, 150)
  const hasMore = content.length > 150

  return (
    <div className="rounded-[14px] border border-black/6 bg-white p-4 hover:border-black/12 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-6 text-black truncate">
            {title}
          </div>
          <div className="text-[11px] text-black/40 mt-0.5">
            {method.paperTitle}
            {method.publishedAt && ` · ${new Date(method.publishedAt).getFullYear()}`}
          </div>
        </div>
        <Beaker className="h-5 w-5 text-black/30 flex-shrink-0" />
      </div>
      
      <div className="text-[13px] leading-7 text-black/58">
        {summary}{hasMore ? '...' : ''}
      </div>
      
      {/* Key Points */}
      {method.subsection.keyPoints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {method.subsection.keyPoints.slice(0, 3).map((point, index) => (
            <span 
              key={`kp-${index}`}
              className="rounded-[8px] bg-black/4 px-2 py-0.5 text-[11px] text-black/48"
            >
              {point.split(/[，,：:]/)[0]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default MethodMap