/**
 * ResearchView - Container for structured research view in NodePage
 * 
 * Combines all research view components:
 * - CoreJudgmentHero
 * - ProblemTree
 * - MethodMap
 * - EvidenceBoard
 * 
 * Works with both enhancedArticleFlow (8-Pass) and basic article data
 */

import { useMemo } from 'react'
import { CoreJudgmentHero } from './CoreJudgmentHero'
import { ProblemTree } from './ProblemTree'
import { MethodMap } from './MethodMap'
import { EvidenceBoard } from './EvidenceBoard'
import { useI18n } from '@/i18n'
import type { NodeViewModel, EvidenceExplanation, ArticleSection } from '@/types/alpha'
import type { NodeArticleFlowBlock, MethodEvolutionStep, PaperSubsection } from '@/types/article'

export interface ResearchViewProps {
  /** Node view model data */
  viewModel: NodeViewModel
  /** Language preference */
  language?: 'zh' | 'en'
  /** Callback to open evidence detail */
  onOpenEvidence?: (anchorId: string) => void
}

/**
 * Extract problems from enhanced article flow or basic sections
 */
function extractProblems(articleFlow: NodeArticleFlowBlock[] | undefined, sections: ArticleSection[]) {
  // If enhanced flow available, use it
  if (articleFlow && articleFlow.length > 0) {
    return articleFlow
      .filter((block): block is Extract<NodeArticleFlowBlock, { type: 'paper-article' }> => block.type === 'paper-article')
      .flatMap((block) => 
        block.subsections
          .filter((subsection) => subsection.kind === 'problem')
          .map((subsection) => ({
            paperId: block.paperId,
            paperTitle: block.title,
            subsection,
          }))
      )
  }
  
  // Fallback: derive from sections (look for problem-related kind or keywords)
  return sections
    .filter((section) => 
      section.kind === 'paper-pass' ||
      /问题|problem|挑战|challenge|难点|difficulty/iu.test(section.title)
    )
    .map((section) => ({
      paperId: section.paperId || 'node',
      paperTitle: section.paperTitle || '',
      subsection: {
        kind: 'problem' as const,
        title: section.title,
        content: (section.body || []).slice(0, 3).join('\n').slice(0, 300),
        keyPoints: [],
        evidenceIds: [],
        wordCount: (section.body || []).join('\n').length,
      },
    }))
}

/**
 * Build results-by-paper map for evidence-based status inference
 */
function buildResultsByPaper(articleFlow: NodeArticleFlowBlock[] | undefined): Map<string, PaperSubsection[]> | undefined {
  if (!articleFlow || articleFlow.length === 0) return undefined
  
  const map = new Map<string, PaperSubsection[]>()
  
  articleFlow
    .filter((block): block is Extract<NodeArticleFlowBlock, { type: 'paper-article' }> => block.type === 'paper-article')
    .forEach((block) => {
      const results = block.subsections.filter(s => s.kind === 'results')
      if (results.length > 0) {
        map.set(block.paperId, results)
      }
    })
  
  return map.size > 0 ? map : undefined
}

/**
 * Extract methods from enhanced article flow or basic sections
 */
function extractMethods(articleFlow: NodeArticleFlowBlock[] | undefined, sections: ArticleSection[]) {
  // If enhanced flow available, use it
  if (articleFlow && articleFlow.length > 0) {
    return articleFlow
      .filter((block): block is Extract<NodeArticleFlowBlock, { type: 'paper-article' }> => block.type === 'paper-article')
      .flatMap((block) => 
        block.subsections
          .filter((subsection) => subsection.kind === 'method')
          .map((subsection) => ({
            paperId: block.paperId,
            paperTitle: block.title,
            publishedAt: block.publishedAt,
            subsection,
          }))
      )
  }
  
  // Fallback: derive from sections (look for method-related keywords)
  return sections
    .filter((section) => 
      section.kind === 'paper-pass' ||
      /方法|method|技术|technique|架构|architecture|模型|model/iu.test(section.title)
    )
    .map((section) => ({
      paperId: section.paperId || 'node',
      paperTitle: section.paperTitle || '',
      publishedAt: '',
      subsection: {
        kind: 'method' as const,
        title: section.title,
        content: (section.body || []).slice(0, 3).join('\n').slice(0, 300),
        keyPoints: [],
        evidenceIds: [],
        wordCount: (section.body || []).join('\n').length,
      },
    }))
}

/**
 * Extract evolution steps from synthesis block
 */
function extractEvolutionSteps(articleFlow: NodeArticleFlowBlock[]): MethodEvolutionStep[] {
  const synthesisBlock = articleFlow.find(
    (block): block is Extract<NodeArticleFlowBlock, { type: 'synthesis' }> => block.type === 'synthesis'
  )
  return synthesisBlock?.methodEvolution ?? []
}

/**
 * Extract open questions from closing block or critique
 */
function extractOpenQuestions(articleFlow: NodeArticleFlowBlock[] | undefined, critique: { bullets: string[] }): string[] {
  // If enhanced flow available, use it
  if (articleFlow && articleFlow.length > 0) {
    const closingBlock = articleFlow.find(
      (block): block is Extract<NodeArticleFlowBlock, { type: 'closing' }> => block.type === 'closing'
    )
    if (closingBlock?.openQuestions && closingBlock.openQuestions.length > 0) {
      return closingBlock.openQuestions
    }
  }
  
  // Fallback: derive from critique bullets
  return critique.bullets
    .filter((bullet) => 
      /未|还|缺|待|需|应当|should|remain|need|open|future/iu.test(bullet)
    )
    .slice(0, 5)
}

/**
 * Extract quick tags from keyPoints across all subsections
 */
function extractQuickTags(articleFlow: NodeArticleFlowBlock[] | undefined, evidence: EvidenceExplanation[]): string[] {
  // If enhanced flow available, use it
  if (articleFlow && articleFlow.length > 0) {
    const tags = new Set<string>()
    
    articleFlow
      .filter((block): block is Extract<NodeArticleFlowBlock, { type: 'paper-article' }> => block.type === 'paper-article')
      .forEach((block) => {
        block.subsections.forEach((subsection) => {
          subsection.keyPoints.forEach((point) => {
            const shortPoint = point.split(/[，,：:]/)[0].trim()
            if (shortPoint.length < 20 && shortPoint.length > 2) {
              tags.add(shortPoint)
            }
          })
        })
      })
    
    return Array.from(tags).slice(0, 6)
  }
  
  // Fallback: derive from evidence types
  const types = evidence.map((e) => e.type)
  const typeLabels = new Set<string>()
  types.forEach((t) => {
    if (t === 'figure') typeLabels.add('图表')
    if (t === 'table') typeLabels.add('数据表')
    if (t === 'formula') typeLabels.add('公式')
    if (t === 'section') typeLabels.add('段落')
  })
  return Array.from(typeLabels).slice(0, 6)
}

/**
 * Infer confidence level from evidence strength
 */
function inferConfidence(evidence: EvidenceExplanation[]): 'high' | 'medium' | 'low' | 'speculative' {
  if (evidence.length === 0) return 'speculative'
  
  const avgImportance = evidence.reduce((sum, e) => sum + (e.importance ?? 5), 0) / evidence.length
  
  if (avgImportance >= 8) return 'high'
  if (avgImportance >= 5) return 'medium'
  return 'low'
}

/**
 * Generate a core judgment from available data if not explicitly provided
 */
function generateFallbackCoreJudgment(
  viewModel: NodeViewModel,
): { content: string; contentEn: string } | null {
  if (viewModel.coreJudgment) return viewModel.coreJudgment
  
  // Fallback: generate from summary and evidence
  const summary = viewModel.summary || viewModel.explanation || ''
  if (!summary) return null
  
  // Extract first meaningful sentence
  const firstSentence = summary.split(/[。.!！\n]/)[0].trim()
  if (firstSentence.length < 10) return null
  
  return {
    content: firstSentence.slice(0, 100),
    contentEn: firstSentence.slice(0, 100), // Same for now, would need translation
  }
}

export function ResearchView({ viewModel, language = 'zh', onOpenEvidence }: ResearchViewProps) {
  const { preference } = useI18n()
  const effectiveLanguage = language || preference.primary

  // Use enhanced flow if available, otherwise fallback to basic sections
  const enhancedFlow = viewModel.enhancedArticleFlow
  const sections = useMemo(() => viewModel.article?.sections ?? [], [viewModel.article?.sections])
  
  // Extract data from enhanced article flow OR basic sections
  const problems = useMemo(
    () => extractProblems(enhancedFlow, sections),
    [enhancedFlow, sections]
  )
  const resultsByPaper = useMemo(
    () => buildResultsByPaper(enhancedFlow),
    [enhancedFlow]
  )
  const methods = useMemo(
    () => extractMethods(enhancedFlow, sections),
    [enhancedFlow, sections]
  )
  const evolutionSteps = useMemo(
    () => enhancedFlow ? extractEvolutionSteps(enhancedFlow) : [],
    [enhancedFlow]
  )
  const openQuestions = useMemo(
    () => extractOpenQuestions(enhancedFlow, viewModel.critique),
    [enhancedFlow, viewModel.critique]
  )
  const quickTags = useMemo(
    () => extractQuickTags(enhancedFlow, viewModel.evidence),
    [enhancedFlow, viewModel.evidence]
  )
  const confidence = useMemo(() => inferConfidence(viewModel.evidence), [viewModel.evidence])
  
  // Generate or use core judgment
  const coreJudgment = generateFallbackCoreJudgment(viewModel)

  // Check if we have any research data to display
  const hasData = coreJudgment || problems.length > 0 || methods.length > 0 || viewModel.evidence.length > 0

  if (!hasData) {
    return (
      <div className="mx-auto max-w-[920px] py-12 text-center text-black/54">
        <p className="text-[15px]">
          {language === 'en' 
            ? 'Research view data not available. Try viewing as Article.'
            : '暂无研究视图数据。请尝试文章视图。'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[920px] space-y-8">
      {/* Core Judgment Hero */}
      {coreJudgment && (
        <CoreJudgmentHero
          coreJudgment={coreJudgment}
          confidence={confidence}
          quickTags={quickTags}
          language={effectiveLanguage}
        />
      )}

      {/* Problem Tree */}
      {problems.length > 0 && (
        <ProblemTree
          problems={problems}
          resultsByPaper={resultsByPaper}
          openQuestions={openQuestions}
          language={effectiveLanguage}
        />
      )}

      {/* Method Map */}
      {methods.length > 0 && (
        <MethodMap
          methods={methods}
          evolutionSteps={evolutionSteps}
          language={effectiveLanguage}
        />
      )}

      {/* Evidence Board - Always show if evidence available */}
      {viewModel.evidence.length > 0 && (
        <EvidenceBoard
          evidence={viewModel.evidence}
          language={effectiveLanguage}
          onOpenEvidence={onOpenEvidence}
        />
      )}
    </div>
  )
}

export default ResearchView
