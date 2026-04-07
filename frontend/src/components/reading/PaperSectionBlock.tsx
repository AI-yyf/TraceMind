/**
 * 论文子节组件 - 8-Pass深度解析
 * 
 * 展示单篇论文的8个子节：
 * 背景、问题、方法、实验、结果、贡献、局限、意义
 */

import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { PaperSubsection, PaperRoleInNode } from '@/types/article'
import { useI18n } from '@/i18n'

interface PaperSectionBlockProps {
  paperId: string
  title: string
  titleEn?: string
  authors: string[]
  publishedAt: string
  citationCount: number | null
  role: PaperRoleInNode
  introduction: string
  subsections: PaperSubsection[]
  conclusion: string
  anchorId: string
}

const ROLE_COLORS: Record<PaperRoleInNode, string> = {
  origin: '#22c55e',
  milestone: '#f59e0b',
  branch: '#3b82f6',
  confluence: '#a855f7',
  extension: '#64748b',
  baseline: '#a16207',
}

const ROLE_LABEL_KEYS: Record<PaperRoleInNode, string> = {
  origin: 'node.role.origin',
  milestone: 'node.role.milestone',
  branch: 'node.role.branch',
  confluence: 'node.role.confluence',
  extension: 'node.role.extension',
  baseline: 'node.role.baseline',
}

function renderTemplate(template: string, variables: Record<string, string | number>) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{${key}}`).join(String(value)),
    template,
  )
}

export const PaperSectionBlock: React.FC<PaperSectionBlockProps> = ({
  paperId,
  title,
  titleEn,
  authors,
  publishedAt,
  citationCount,
  role,
  introduction,
  subsections,
  conclusion,
  anchorId,
}) => {
  const { t } = useI18n()
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    introduction: true,
    conclusion: true,
  })

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })
  }

  const roleColor = ROLE_COLORS[role]

  return (
    <article
      id={anchorId}
      data-paper-id={paperId}
      className="relative mb-6 rounded-2xl border border-black/8 bg-[#fcfbf9] p-4 md:p-6 shadow-[0_12px_28px_rgba(15,23,42,0.04)]"
    >
      {/* 左侧角色色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ backgroundColor: roleColor }}
      />

      {/* 论文头部 */}
      <div className="mb-3 pl-3">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: `${roleColor}20`,
              color: roleColor,
            }}
          >
            {t(ROLE_LABEL_KEYS[role])}
          </span>
          {citationCount !== null && (
            <span className="text-xs text-black/48">
              {renderTemplate(t('node.citations', 'Cited {count} times'), {
                count: citationCount,
              })}
            </span>
          )}
        </div>

        <h3 className="text-xl font-semibold text-black md:text-[22px]">
          {title}
        </h3>

        {titleEn && titleEn !== title && (
          <div className="mt-0.5 text-sm text-black/40">
            {titleEn}
          </div>
        )}

        <div className="mt-1 flex flex-wrap gap-x-1">
          {authors.slice(0, 5).map((author, idx) => (
            <span key={idx} className="text-xs text-black/48">
              {author}{idx < Math.min(authors.length, 5) - 1 ? ',' : ''}
            </span>
          ))}
          {authors.length > 5 && (
            <span className="text-xs text-black/48">
              +{authors.length - 5}
            </span>
          )}
        </div>

        <div className="mt-0.5 text-xs text-black/48">
          {formatDate(publishedAt)}
        </div>
      </div>

      <div className="border-t border-black/6 my-3" />

      {/* 引言 */}
      <div className="mb-3 pl-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => toggleSection('introduction')}
        >
          <h4 className="text-base font-semibold text-black">
            {t('node.paper.introduction')}
          </h4>
          {expandedSections.introduction
            ? <ChevronUp className="h-4 w-4 text-black/40" />
            : <ChevronDown className="h-4 w-4 text-black/40" />
          }
        </button>
        {expandedSections.introduction && (
          <p className="mt-2 text-sm leading-7 text-black/72">
            {introduction}
          </p>
        )}
      </div>

      {/* 8个子节 */}
      <div className="pl-3">
        {subsections.map((subsection, index) => (
          <PaperSubsectionItem
            key={subsection.kind}
            subsection={subsection}
            index={index}
            expanded={expandedSections[subsection.kind] ?? false}
            onToggle={() => toggleSection(subsection.kind)}
          />
        ))}
      </div>

      {/* 总结 */}
      <div className="mt-3 pl-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => toggleSection('conclusion')}
        >
          <h4 className="text-base font-semibold text-black">
            {t('node.paper.conclusion')}
          </h4>
          {expandedSections.conclusion
            ? <ChevronUp className="h-4 w-4 text-black/40" />
            : <ChevronDown className="h-4 w-4 text-black/40" />
          }
        </button>
        {expandedSections.conclusion && (
          <p className="mt-2 text-sm leading-7 text-black/72">
            {conclusion}
          </p>
        )}
      </div>
    </article>
  )
}

// 子节项组件
interface PaperSubsectionItemProps {
  subsection: PaperSubsection
  index: number
  expanded: boolean
  onToggle: () => void
}

const SUBSECTION_ICONS: Record<string, string> = {
  background: '📚',
  problem: '❓',
  method: '⚙️',
  experiment: '🧪',
  results: '📊',
  contribution: '💡',
  limitation: '⚠️',
  significance: '🌟',
}

const PaperSubsectionItem: React.FC<PaperSubsectionItemProps> = ({
  subsection,
  index,
  expanded,
  onToggle,
}) => {
  const { t } = useI18n()

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-black/[0.03]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="min-w-[20px] text-xs text-black/48">
            {index + 1}.
          </span>
          <span className="text-base">{SUBSECTION_ICONS[subsection.kind]}</span>
          <span className="text-sm font-semibold text-black">
            {subsection.title}
          </span>
          <span className="text-xs text-black/40">
            {renderTemplate(t('node.subsection.wordCount', '{count} words'), {
              count: subsection.wordCount,
            })}
          </span>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-black/40" />
          : <ChevronDown className="h-4 w-4 text-black/40" />
        }
      </button>

      {expanded && (
        <div className="pl-8 pr-2 py-2">
          <p className="text-sm leading-7 text-black/72">
            {subsection.content}
          </p>

          {subsection.keyPoints.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {subsection.keyPoints.map((point, idx) => (
                <span
                  key={idx}
                  className="inline-block rounded-full border border-black/10 px-2.5 py-0.5 text-xs text-black/58"
                >
                  {point}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
