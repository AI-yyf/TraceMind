/**
 * ProblemTree - Hierarchical problem visualization with status indicators
 * 
 * Extracts problems from PaperSubsection (kind='problem') and displays:
 * - Main problems → subproblems hierarchy
 * - Status: solved (green), partial (yellow), open (red)
 * - Open questions from NodeClosingBlock
 */

import { CheckCircle2, Circle, HelpCircle, AlertCircle, ChevronRight, TreeDeciduous } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { PaperSubsection } from '@/types/article'

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export type ProblemStatus = 'solved' | 'partial' | 'open'

export interface ProblemNode {
  id: string
  title: string
  titleEn?: string
  status: ProblemStatus
  sourcePaperId?: string
  sourcePaperTitle?: string
  children?: ProblemNode[]
}

export interface ProblemTreeProps {
  /** Problems extracted from paper subsections */
  problems: Array<{
    paperId: string
    paperTitle: string
    subsection: PaperSubsection
  }>
  /** Results subsections for evidence-based status inference */
  resultsByPaper?: Map<string, PaperSubsection[]>
  /** Open questions from closing block */
  openQuestions?: string[]
  /** Language preference */
  language?: 'zh' | 'en'
}

const STATUS_CONFIG = {
  solved: {
    label: '已解决',
    labelEn: 'Solved',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  partial: {
    label: '部分解决',
    labelEn: 'Partially Solved',
    icon: Circle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  open: {
    label: '开放问题',
    labelEn: 'Open',
    icon: AlertCircle,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
    dotColor: 'bg-rose-500',
  },
}

/**
 * Infer problem status from results subsection content
 * 
 * Uses evidence-based inference:
 * - If results indicate the problem was addressed → solved
 * - If results show progress but not complete → partial
 * - Otherwise → open
 */
function inferStatusFromResults(
  problemContent: string,
  resultsContent?: string
): ProblemStatus {
  // First check problem content for explicit status markers
  const problemLower = problemContent.toLowerCase()
  
  // If problem statement already indicates it's solved/addressed
  if (problemLower.includes('已解决') || problemLower.includes('已得到解决') || 
      problemLower.includes('成功解决') || problemLower.includes('彻底解决')) {
    return 'solved'
  }
  
  // If no results evidence available, check problem content for implicit status
  if (!resultsContent) {
    if (problemLower.includes('部分') || problemLower.includes('在一定程度上') ||
        problemLower.includes('有所改善') || problemLower.includes('缓解')) {
      return 'partial'
    }
    return 'open'
  }
  
  // Evidence-based inference from results
  const resultsLower = resultsContent.toLowerCase()
  
  // Strong evidence of solution
  if (resultsLower.includes('成功') || resultsLower.includes('实现了') ||
      resultsLower.includes('达到了') || resultsLower.includes('解决了') ||
      resultsLower.includes('solved') || resultsLower.includes('achieved') ||
      resultsLower.includes('successfully') || resultsLower.includes('effectively') ||
      /\d+%\s*(提升|improvement|increase)/i.test(resultsLower)) {
    return 'solved'
  }
  
  // Partial progress evidence
  if (resultsLower.includes('部分') || resultsLower.includes('改善') ||
      resultsLower.includes('提升') || resultsLower.includes('改进') ||
      resultsLower.includes('partial') || resultsLower.includes('improved') ||
      resultsLower.includes('advance') || resultsLower.includes('progress')) {
    return 'partial'
  }
  
  // Default to open if no clear evidence
  return 'open'
}

/**
 * Convert paper subsections to problem nodes
 * Uses evidence-based status inference when enhanced flow is available
 */
function extractProblemNodes(
  problems: Array<{ paperId: string; paperTitle: string; subsection: PaperSubsection }>,
  resultsByPaper?: Map<string, PaperSubsection[]>
): ProblemNode[] {
  return problems.map(({ paperId, paperTitle, subsection }, index) => {
    // Find matching results subsection for evidence-based inference
    const paperResults = resultsByPaper?.get(paperId)
    const resultsContent = paperResults
      ?.filter(s => s.kind === 'results')
      ?.map(s => s.content)
      ?.join('\n')
    
    const status = inferStatusFromResults(subsection.content, resultsContent)

    return {
      id: `problem-${paperId}-${index}`,
      title: subsection.title,
      titleEn: subsection.titleEn,
      status,
      sourcePaperId: paperId,
      sourcePaperTitle: paperTitle,
      children: subsection.keyPoints.map((point, i) => ({
        id: `sub-${paperId}-${index}-${i}`,
        title: point,
        status: 'open' as ProblemStatus,
      })),
    }
  })
}

export function ProblemTree({ problems, resultsByPaper, openQuestions = [], language = 'zh' }: ProblemTreeProps) {
  const { t } = useI18n()
  
  const problemNodes = extractProblemNodes(problems, resultsByPaper)
  
  // Group by status for summary
  const solvedCount = problemNodes.filter(p => p.status === 'solved').length
  const partialCount = problemNodes.filter(p => p.status === 'partial').length
  const openCount = problemNodes.filter(p => p.status === 'open').length + openQuestions.length

  if (problemNodes.length === 0 && openQuestions.length === 0) {
    return null
  }

  return (
    <section className="rounded-[22px] border border-black/8 bg-white p-6 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <TreeDeciduous className="h-5 w-5 text-black/40" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-black/38">
          {t('node.problemTreeEyebrow', 'Problem Tree')}
        </span>
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-4 mb-5">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="text-[12px] text-black/54">
            {renderTemplate(t('node.solvedCount', '{count} solved'), { count: solvedCount })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Circle className="h-4 w-4 text-amber-600" />
          <span className="text-[12px] text-black/54">
            {renderTemplate(t('node.partialCount', '{count} partial'), { count: partialCount })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 text-rose-600" />
          <span className="text-[12px] text-black/54">
            {renderTemplate(t('node.openCount', '{count} open'), { count: openCount })}
          </span>
        </div>
      </div>

      {/* Problem Nodes */}
      <div className="space-y-3">
        {problemNodes.map((node) => (
          <ProblemNodeItem key={node.id} node={node} language={language} />
        ))}
      </div>

      {/* Open Questions Section */}
      {openQuestions.length > 0 && (
        <div className="mt-5 pt-4 border-t border-black/8">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="h-4 w-4 text-black/40" />
            <span className="text-[13px] font-medium text-black/62">
              {t('node.openQuestions', 'Open Questions')}
            </span>
          </div>
          <ul className="space-y-2">
            {openQuestions.map((question, index) => (
              <li 
                key={`open-q-${index}`}
                className="flex items-start gap-2 text-[14px] leading-7 text-black/66"
              >
                <AlertCircle className="h-4 w-4 mt-1.5 text-rose-500 flex-shrink-0" />
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function ProblemNodeItem({ node, language }: { node: ProblemNode; language: 'zh' | 'en' }) {
  const config = STATUS_CONFIG[node.status]
  const IconComponent = config.icon
  
  const title = language === 'en' ? (node.titleEn || node.title) : node.title

  return (
    <div className={`rounded-[14px] ${config.bgColor} ${config.borderColor} border p-3`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-5 w-5 rounded-full ${config.dotColor} flex items-center justify-center flex-shrink-0`}>
          <IconComponent className="h-3 w-3 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium leading-6 text-black">
            {title}
          </div>
          {node.sourcePaperTitle && (
            <div className="mt-1 text-[11px] text-black/40">
              {node.sourcePaperTitle}
            </div>
          )}
          
          {/* Sub-problems */}
          {node.children && node.children.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {node.children.slice(0, 3).map((child) => (
                <div key={child.id} className="flex items-center gap-2 text-[12px] text-black/58">
                  <ChevronRight className="h-3 w-3 text-black/30 flex-shrink-0" />
                  <span className="truncate">{child.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Status Badge */}
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${config.color} bg-white/60`}>
          {language === 'en' ? config.labelEn : config.label}
        </span>
      </div>
    </div>
  )
}

export default ProblemTree