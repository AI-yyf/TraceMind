import { AlertCircle, CheckCircle2, Circle, HelpCircle, TreeDeciduous } from 'lucide-react'

import { useI18n } from '@/i18n'

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

type ProblemStatus = 'solved' | 'partial' | 'open'

interface ProblemNode {
  id: string
  title: string
  titleEn?: string
  status: ProblemStatus
  sourcePaperTitle?: string
}

export interface ProblemTreeProps {
  problems: Array<{
    paperId: string
    paperTitle: string
    title: string
    titleEn?: string
    status: ProblemStatus
  }>
  openQuestions?: string[]
  language?: 'zh' | 'en'
}

const STATUS_CONFIG = {
  solved: {
    label: '已解决',
    labelEn: 'Solved',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    tint: 'bg-emerald-50',
  },
  partial: {
    label: '部分解决',
    labelEn: 'Partial',
    icon: Circle,
    color: 'text-amber-600',
    tint: 'bg-amber-50',
  },
  open: {
    label: '未解决',
    labelEn: 'Open',
    icon: AlertCircle,
    color: 'text-rose-600',
    tint: 'bg-rose-50',
  },
} as const

function buildProblemNodes(
  problems: ProblemTreeProps['problems'],
) {
  return problems.map((problem, index) => ({
    id: `problem-${problem.paperId}-${index}`,
    title: problem.title,
    titleEn: problem.titleEn,
    status: problem.status,
    sourcePaperTitle: problem.paperTitle,
  }) satisfies ProblemNode)
}

export function ProblemTree({
  problems,
  openQuestions = [],
  language = 'zh',
}: ProblemTreeProps) {
  const { t } = useI18n()
  const problemNodes = buildProblemNodes(problems)
  const solvedCount = problemNodes.filter((item) => item.status === 'solved').length
  const partialCount = problemNodes.filter((item) => item.status === 'partial').length
  const openCount = problemNodes.filter((item) => item.status === 'open').length + openQuestions.length

  if (problemNodes.length === 0 && openQuestions.length === 0) return null

  return (
    <section className="rounded-[22px] border border-black/8 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center gap-2">
        <TreeDeciduous className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {t('node.problemTreeEyebrow', 'Problem Tree')}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3 text-[12px] text-black/54">
        <span>{renderTemplate(t('node.solvedCount', '{count} solved'), { count: solvedCount })}</span>
        <span>{renderTemplate(t('node.partialCount', '{count} partial'), { count: partialCount })}</span>
        <span>{renderTemplate(t('node.openCount', '{count} open'), { count: openCount })}</span>
      </div>

      <div className="space-y-3">
        {problemNodes.map((node) => {
          const config = STATUS_CONFIG[node.status]
          const Icon = config.icon
          const title = language === 'en' ? (node.titleEn || node.title) : node.title

          return (
            <div
              key={node.id}
              className={`rounded-[16px] border border-black/6 ${config.tint} px-4 py-3`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium leading-6 text-black">{title}</div>
                  {node.sourcePaperTitle ? (
                    <div className="mt-1 text-[11px] text-black/42">{node.sourcePaperTitle}</div>
                  ) : null}
                </div>
                <span className={`shrink-0 text-[11px] font-medium ${config.color}`}>
                  {language === 'en' ? config.labelEn : config.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {openQuestions.length > 0 ? (
        <div className="mt-5 border-t border-black/8 pt-4">
          <div className="mb-3 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-black/40" />
            <span className="text-[12px] font-medium text-black/60">
              {t('node.openQuestions', 'Open Questions')}
            </span>
          </div>
          <div className="space-y-2">
            {openQuestions.map((question, index) => (
              <div key={`${question}:${index}`} className="flex gap-2 text-[13px] leading-6 text-black/62">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <span>{question}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default ProblemTree
