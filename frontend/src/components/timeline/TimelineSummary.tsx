import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'

interface TimelineSummaryProps {
  topicName: string
  content: string
  paperCount: number
  latestYear?: string
}

function splitParagraphs(content: string) {
  return content
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export const TimelineSummary: React.FC<TimelineSummaryProps> = ({
  topicName,
  content,
  paperCount,
  latestYear,
}) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const paragraphs = useMemo(() => splitParagraphs(content), [content])

  if (paragraphs.length === 0 && paperCount === 0) {
    return null
  }

  return (
    <motion.section
      className="mt-20 lg:mt-28"
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55 }}
    >
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-200/80">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-red-600">主题总叙事</div>
            <h2 className="mt-1 text-[22px] font-bold text-neutral-900 lg:text-[26px]">
              {topicName} 的研究脉络
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-neutral-500 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <span>{isExpanded ? '收起' : '展开'}</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
        transition={{ duration: 0.28 }}
        className="overflow-hidden"
      >
        <div className="rounded-[28px] border border-neutral-200 bg-gradient-to-br from-neutral-50 via-white to-neutral-50/60 p-6 shadow-sm sm:p-8 lg:p-10">
          {paragraphs.length > 0 ? (
            <div className="space-y-5 text-[16px] leading-[1.95] text-neutral-700 sm:text-[17px]">
              {paragraphs.map((paragraph, index) => (
                <motion.p
                  key={`${index}-${paragraph.slice(0, 16)}`}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="border-l-2 border-red-200 pl-4 transition-colors hover:border-red-400"
                >
                  {paragraph}
                </motion.p>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-neutral-300" />
              <p className="text-[16px] leading-8 text-neutral-500">
                已累计收录 {paperCount} 篇论文，等内容生成进一步补齐后，这里会自动汇总成可读的主题总叙事。
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-neutral-200 pt-6">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
              <span className="text-[13px] font-medium text-neutral-500">持续追踪更新中</span>
            </div>
            <span className="text-[13px] text-neutral-400">
              已收录 {paperCount} 篇论文
              {latestYear ? ` · 最晚追踪到 ${latestYear}` : ''}
            </span>
          </div>
        </div>
      </motion.div>

      {!isExpanded && paragraphs.length > 0 && (
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="mt-4 block w-full rounded-[24px] border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-5 text-left transition-colors hover:border-red-200"
        >
          <p className="line-clamp-2 text-[15px] leading-7 text-neutral-600">{paragraphs[0]}</p>
        </button>
      )}
    </motion.section>
  )
}
