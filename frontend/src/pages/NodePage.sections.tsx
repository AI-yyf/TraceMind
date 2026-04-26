/**
 * NodePage Section Components
 *
 * Extracted from NodePage.tsx for decomposition.
 * Contains the NodeIntroSection and NodeSynthesisSection components.
 */

import type { ArticleInlineReference } from '@/components/reading/ArticleInlineText'
import { renderInlineArticleText } from '@/components/reading/ArticleInlineText'
import type { LanguagePreference } from '@/i18n'
import type { NodeIntroductionBlock, NodeSynthesisBlock } from '@/types/article'
import { anchorDomId, splitNarrativeParagraphs } from './NodePage.utils'

// ============================================================================
// Node Introduction Section
// ============================================================================

/** 节点概述章节 (Node Introduction Section) */
export function NodeIntroSection({
  introduction,
  referenceMap,
  stageWindowMonths,
  t,
  preference,
}: {
  introduction: NodeIntroductionBlock
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  t: (key: string, fallback?: string) => string
  preference: LanguagePreference
}) {
  const displayLanguage = preference.primary === 'zh' ? 'zh' : 'en'
  const introTitle = displayLanguage === 'zh'
    ? t('node.intro.title', '节点概览')
    : t('node.intro.titleEn', 'Node Overview')

  const paragraphs = splitNarrativeParagraphs(introduction.content)

  return (
    <section
      id={anchorDomId('node:intro')}
      className="pt-4"
    >
      <h2 className="text-[24px] font-semibold leading-[1.14] text-black">
        {introTitle}
      </h2>

      <div className="mt-6 space-y-5">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}:${paragraph}`}
            className="text-[16px] leading-9 text-black/68"
          >
            {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
          </p>
        ))}
      </div>

      {introduction.contextStatement ? (
        <p className="mt-6 text-[15px] leading-8 text-black/60">
          {renderInlineArticleText(introduction.contextStatement, referenceMap, stageWindowMonths)}
        </p>
      ) : null}

      {introduction.coreQuestion ? (
        <p className="mt-4 text-[16px] leading-8 text-black/78">
          {renderInlineArticleText(introduction.coreQuestion, referenceMap, stageWindowMonths)}
        </p>
      ) : null}

      {introduction.keyMethods && introduction.keyMethods.length > 0 ? (
        <p className="mt-5 text-[14px] leading-8 text-black/56">
          {displayLanguage === 'zh'
            ? `贯穿这一节点的方法抓手主要包括：${introduction.keyMethods.join('、')}。`
            : `The methods that repeatedly structure this node are ${introduction.keyMethods.join(', ')}.`}
        </p>
      ) : null}
    </section>
  )
}

// ============================================================================
// Node Synthesis Section
// ============================================================================

/** 综合分析章节 (Node Synthesis Section) */
export function NodeSynthesisSection({
  synthesis,
  referenceMap,
  stageWindowMonths,
  t,
  preference,
}: {
  synthesis: NodeSynthesisBlock
  referenceMap: Map<string, ArticleInlineReference>
  stageWindowMonths: number
  t: (key: string, fallback?: string) => string
  preference: LanguagePreference
}) {
  const displayLanguage = preference.primary === 'zh' ? 'zh' : 'en'
  const synthesisTitle = displayLanguage === 'zh'
    ? t('node.synthesis.title', '综合判断')
    : t('node.synthesis.titleEn', 'Synthesis')

  const paragraphs = splitNarrativeParagraphs(synthesis.content)

  return (
    <section
      id={anchorDomId('node:synthesis')}
      className="pt-6"
    >
      <h2 className="text-[24px] font-semibold leading-[1.14] text-black">
        {synthesisTitle}
      </h2>

      <div className="mt-6 space-y-5">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}:${paragraph}`}
            className="text-[16px] leading-9 text-black/68"
          >
            {renderInlineArticleText(paragraph, referenceMap, stageWindowMonths)}
          </p>
        ))}
      </div>
    </section>
  )
}
