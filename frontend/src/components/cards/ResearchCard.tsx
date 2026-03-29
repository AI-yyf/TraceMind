import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitMerge,
  Sparkles,
  Users,
} from 'lucide-react'
import type { TrackerPaper } from '../../types/tracker'

type TagCategory = 'status' | 'method' | 'problem' | 'topic'

const TAG_STYLES: Record<TagCategory, string> = {
  status: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  method: 'border-blue-200 bg-blue-50 text-blue-700',
  problem: 'border-amber-200 bg-amber-50 text-amber-700',
  topic: 'border-neutral-200 bg-neutral-100 text-neutral-700',
}

function classifyTag(tag: string): TagCategory {
  const value = tag.toLowerCase()

  if (
    ['源头', '主线', '分支', '合流', 'origin', 'branch', 'merge', 'mainline'].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return 'status'
  }

  if (
    [
      'transformer',
      'diffusion',
      'attention',
      'rl',
      '强化学习',
      '模仿学习',
      '世界模型',
      'vla',
      'mamba',
      'snn',
      '多模态',
    ].some((keyword) => value.includes(keyword))
  ) {
    return 'method'
  }

  if (
    ['问题', '鲁棒', '泛化', '效率', '对齐', '安全', '规划', '控制', 'transfer'].some((keyword) =>
      value.includes(keyword),
    )
  ) {
    return 'problem'
  }

  return 'topic'
}

function formatAuthors(authors: string[]) {
  if (authors.length === 0) return '作者信息待补充'
  if (authors.length <= 2) return authors.join('、')
  return `${authors[0]}、${authors[1]} 等 ${authors.length} 位作者`
}

function formatBranchLabel(paper: TrackerPaper) {
  if (paper.branchContext.branchLabel) return paper.branchContext.branchLabel
  if (!paper.branchContext.branchId || paper.branchContext.branchId === 'main') return '当前主线'
  return paper.branchContext.branchId.replace(/^branch:/, '')
}

function buildMetaBadges(paper: TrackerPaper) {
  const badges: string[] = []

  if (paper.branchContext.stageIndex !== null) {
    badges.push(`第 ${paper.branchContext.stageIndex} 阶段`)
  }

  if (paper.branchContext.isMergePaper) {
    badges.push('合流节点')
  }

  if (paper.problemTags.length > 0) {
    badges.push(`${paper.problemTags.length} 个问题标签`)
  }

  return badges
}

function TagGroup({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tags.slice(0, 6).map((tag) => (
        <span
          key={tag}
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-medium ${TAG_STYLES[classifyTag(tag)]}`}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

function SectionList({
  title,
  tone,
  icon,
  items,
}: {
  title: string
  tone: 'blue' | 'amber'
  icon: React.ReactNode
  items: string[]
}) {
  if (items.length === 0) return null

  const toneClasses =
    tone === 'blue'
      ? 'border-blue-100 bg-gradient-to-br from-blue-50/70 to-white'
      : 'border-amber-100 bg-gradient-to-br from-amber-50/70 to-white'

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <h4 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-neutral-700">
        {icon}
        {title}
      </h4>
      <ul className="space-y-2">
        {items.slice(0, 4).map((item, index) => (
          <li key={`${title}-${index}`} className="flex items-start gap-2 text-[13px] leading-6 text-neutral-700">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-neutral-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface ResearchCardProps {
  paper: TrackerPaper
  index: number
  lineColor?: string
  onOpenPaper?: (paperId: string) => void
}

export const ResearchCard: React.FC<ResearchCardProps> = ({
  paper,
  index,
  lineColor = '#DC2626',
  onOpenPaper,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const contributions = useMemo(() => paper.closingHandoff ?? [], [paper.closingHandoff])
  const problems = useMemo(
    () =>
      (paper.problemsOut ?? [])
        .map((problem) => problem.question?.trim())
        .filter((value): value is string => Boolean(value))
        .slice(0, 4),
    [paper.problemsOut],
  )
  const figureSrc = paper.coverPath ?? paper.figurePaths[0] ?? null
  const metaBadges = buildMetaBadges(paper)

  const handleCardClick = () => {
    if (isExpanded && onOpenPaper) {
      onOpenPaper(paper.id)
      return
    }

    setIsExpanded(true)
  }

  const handleToggleExpand = (event: React.MouseEvent) => {
    event.stopPropagation()
    setIsExpanded((value) => !value)
  }

  const handleOpenDetail = (event: React.MouseEvent) => {
    event.stopPropagation()
    onOpenPaper?.(paper.id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 36 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.42, ease: 'easeOut' }}
    >
      <motion.article
        onClick={handleCardClick}
        className="group cursor-pointer overflow-hidden rounded-[22px] border border-neutral-200 bg-white"
        style={{
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04), 0 10px 24px rgba(0, 0, 0, 0.03)',
        }}
        whileHover={{
          y: -3,
          borderColor: 'rgba(220, 38, 38, 0.18)',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.06), 0 18px 42px rgba(0, 0, 0, 0.05)',
        }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        <div className="p-5 sm:p-6">
          <TagGroup tags={paper.tags} />

          <div className="mb-4">
            <h3 className="text-[19px] font-bold leading-[1.35] text-neutral-900 transition-colors group-hover:text-red-700 sm:text-[22px]">
              {paper.titleZh || paper.title}
            </h3>
            {paper.titleZh && paper.titleZh !== paper.title && (
              <p className="mt-2 text-[13px] leading-6 text-neutral-400">{paper.title}</p>
            )}
          </div>

          <div className="flex flex-col gap-5 sm:flex-row">
            {figureSrc && (
              <div className="sm:w-[240px] sm:flex-shrink-0">
                <div className="aspect-[4/3] overflow-hidden rounded-[18px] border border-neutral-100 bg-gradient-to-br from-neutral-50 to-white">
                  <img
                    src={figureSrc}
                    alt={`${paper.titleZh || paper.title} 配图`}
                    className="h-full w-full object-contain p-3"
                    loading="lazy"
                    onError={(event) => {
                      ;(event.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-neutral-500 sm:text-[13px]">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{formatAuthors(paper.authors)}</span>
                </div>
                <span className="text-neutral-300">·</span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{paper.published.slice(0, 10)}</span>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700">
                  <GitBranch className="h-3.5 w-3.5" />
                  {formatBranchLabel(paper)}
                </span>
                {paper.branchContext.isMergePaper && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
                    <GitMerge className="h-3.5 w-3.5" />
                    合流论文
                  </span>
                )}
                {metaBadges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600"
                  >
                    {badge}
                  </span>
                ))}
              </div>

              {paper.highlight && (
                <p className="mb-3 rounded-2xl border-l-[3px] border-red-400 bg-gradient-to-r from-red-50/70 to-transparent px-4 py-3 text-[14px] font-medium leading-7 text-neutral-800 sm:text-[15px]">
                  {paper.highlight}
                </p>
              )}

              <p className="text-[14px] leading-7 text-neutral-600 sm:text-[15px]">
                {paper.cardDigest || paper.timelineDigest || paper.summary || '这篇论文的摘要内容正在生成或校准中。'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
            <div className="flex items-center gap-2 text-[13px] text-neutral-400">
              {isExpanded ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>继续点击卡片可进入论文详情页</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  <span>展开查看贡献、问题与后续衔接</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isExpanded && onOpenPaper && (
                <motion.button
                  type="button"
                  onClick={handleOpenDetail}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-white shadow-md"
                  style={{ backgroundColor: lineColor }}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span>查看论文详情</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </motion.button>
              )}

              <motion.button
                type="button"
                onClick={handleToggleExpand}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200"
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.24 }}
              >
                <ChevronDown className="h-4 w-4" />
              </motion.button>
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-neutral-100 px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <SectionList
                    title="关键贡献"
                    tone="blue"
                    icon={<Sparkles className="h-3.5 w-3.5 text-blue-600" />}
                    items={contributions}
                  />
                  <SectionList
                    title="未解决问题"
                    tone="amber"
                    icon={<span className="text-[14px] font-bold text-amber-600">?</span>}
                    items={problems}
                  />
                </div>

                {(contributions.length === 0 && problems.length === 0) && (
                  <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-[14px] leading-7 text-neutral-500">
                    当前这篇论文还没有补齐“贡献”和“未解决问题”的结构化内容，后续重新运行内容生成后会自动完善。
                  </div>
                )}

                {onOpenPaper && (
                  <motion.div
                    className="mt-5 flex items-center justify-end border-t border-neutral-100 pt-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    <button
                      type="button"
                      onClick={handleOpenDetail}
                      className="inline-flex items-center gap-2 text-[14px] font-medium transition-all hover:gap-3"
                      style={{ color: lineColor }}
                    >
                      <span>展开查看完整论文脉络</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.article>
    </motion.div>
  )
}
