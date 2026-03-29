import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ExternalLink, GitMerge } from 'lucide-react'

import { PaperNarrative } from '@/components/paper/PaperNarrative'
import { getDisplayPaper, getPaperNeighbors, getTopicDisplay } from '@/data/topicDisplay'
import { paperMap, topicMap } from '@/data/tracker'

export function PaperPage() {
  const { paperId } = useParams<{ paperId: string }>()
  const [searchParams] = useSearchParams()
  const explicitTopicId = searchParams.get('theme')
  const paper = paperId ? paperMap[paperId] : null
  const topicId = explicitTopicId ?? paper?.topicIds[0] ?? null
  const topic = topicId ? topicMap[topicId] : null
  const display = topic ? getTopicDisplay(topic.id) : null
  const displayPaper = display && paper ? getDisplayPaper(display, paper.id) : null
  const neighbors = display && paper ? getPaperNeighbors(display, paper.id) : { previous: null, next: null }

  if (!paper) {
    return (
      <div className="px-4 py-10 md:px-6 xl:px-10">
        <Link to="/" className="text-sm underline underline-offset-4">
          返回首页
        </Link>
        <div className="mt-4 text-black/60">这篇论文不存在。</div>
      </div>
    )
  }

  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10 xl:pt-8">
      <div className="mx-auto max-w-[1020px]">
        <div className="flex flex-wrap gap-3">
          <Link
            to={topic ? `/topic/${topic.id}` : '/'}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-black/70 transition hover:border-black/20 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {topic ? `返回 ${topic.nameZh}` : '返回首页'}
          </Link>
          <a
            href={paper.arxivUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-black/70 transition hover:border-black/20 hover:text-black"
          >
            查看原文
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <section className="mt-5 rounded-[36px] border border-black/8 bg-[#f6f2ea] px-6 py-8 md:px-8">
          {topic && (
            <Link
              to={`/topic/${topic.id}`}
              className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] text-red-700"
            >
              {topic.nameZh}
            </Link>
          )}

          <h1 className="mt-5 text-[34px] font-semibold leading-[1.12] text-black md:text-[50px]">
            {paper.titleZh || paper.title}
          </h1>
          {paper.titleZh && paper.titleZh !== paper.title && (
            <div className="mt-3 text-[16px] italic leading-7 text-black/44">{paper.title}</div>
          )}

          <div className="mt-6 flex flex-wrap gap-3 text-sm text-black/56">
            <span>{paper.published.slice(0, 10)}</span>
            {paper.authors.length > 0 && <span>{paper.authors.join('、')}</span>}
            {paper.citationCount !== null && <span>被引用 {paper.citationCount} 次</span>}
          </div>

          <p className="mt-6 max-w-4xl text-[16px] leading-8 text-black/66">
            {paper.highlight || paper.timelineDigest || paper.cardDigest || paper.summary}
          </p>
        </section>

        {topic && display && (
          <section className="mt-8 grid gap-4 lg:grid-cols-3">
            <ContextCard
              label="所属分支"
              value={displayPaper?.card.branchLabel ?? paper.branchContext.branchLabel ?? '当前主线'}
              detail="这篇论文在当前主题里挂载的研究线。"
            />
            <ContextCard
              label="所在阶段"
              value={displayPaper?.stageTitle ?? (paper.branchContext.stageIndex ? `阶段 ${String(paper.branchContext.stageIndex).padStart(2, '0')}` : '未标定')}
              detail={
                displayPaper?.card.windowStart && displayPaper?.card.windowEnd
                  ? `${displayPaper.card.windowStart} 至 ${displayPaper.card.windowEnd}`
                  : '当前没有单独落账的阶段窗口。'
              }
            />
            <ContextCard
              label="关系状态"
              value={displayPaper?.card.isMergePaper || paper.branchContext.isMergePaper ? '汇流节点' : '普通节点'}
              detail="如果一篇论文同时承接多条分支，它会在这里被标记为汇流。"
            />
          </section>
        )}

        {displayPaper?.card.isMergePaper && (
          <section className="mt-6 rounded-[28px] border border-emerald-200 bg-emerald-50/70 px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
              <GitMerge className="h-4 w-4" />
              这是一篇汇流论文
            </div>
            <p className="mt-3 text-[15px] leading-8 text-emerald-900/82">
              它不只是沿单一分支向前走，而是把多个并行判断重新压回同一个节点，因此后续排序会围绕它重新校准。
            </p>
          </section>
        )}

        <section className="mt-8 rounded-[32px] border border-black/8 bg-white px-6 py-6 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] tracking-[0.24em] text-red-600">研究正文</div>
              <h2 className="mt-3 text-[28px] font-semibold leading-[1.2] text-black">论文正文</h2>
            </div>
            {topic && (
              <Link
                to={`/topic/${topic.id}/research`}
                className="inline-flex items-center gap-2 text-sm font-medium text-black"
              >
                回到研究页
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          <div className="mt-8">
            <PaperNarrative paper={paper} />
          </div>
        </section>

        {display && (neighbors.previous || neighbors.next) && (
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            <NeighborCard
              direction="上一篇"
              topicId={topic?.id ?? null}
              paper={neighbors.previous}
            />
            <NeighborCard
              direction="下一篇"
              topicId={topic?.id ?? null}
              paper={neighbors.next}
            />
          </section>
        )}
      </div>
    </main>
  )
}

function ContextCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">{label}</div>
      <div className="mt-3 text-[22px] font-semibold leading-8 text-black">{value}</div>
      <p className="mt-3 text-[14px] leading-7 text-black/58">{detail}</p>
    </article>
  )
}

function NeighborCard({
  direction,
  topicId,
  paper,
}: {
  direction: string
  topicId: string | null
  paper: {
    stageIndex: number
    branchId: string
    branchLabel: string
    paperId: string
    paperTitleZh: string
    paperTitleEn: string
    isMergePaper: boolean
  } | null
}) {
  if (!paper) {
    return (
      <article className="rounded-[24px] border border-black/8 bg-white px-5 py-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">{direction}</div>
        <div className="mt-3 text-[16px] leading-7 text-black/46">当前没有可连接的论文。</div>
      </article>
    )
  }

  return (
    <Link
      to={`/paper/${paper.paperId}${topicId ? `?theme=${topicId}` : ''}`}
      className="block rounded-[24px] border border-black/8 bg-white px-5 py-5 transition hover:border-black/14"
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">{direction}</div>
      <div className="mt-3 text-[20px] font-semibold leading-8 text-black">{paper.paperTitleZh}</div>
      <div className="mt-2 text-sm italic leading-7 text-black/42">{paper.paperTitleEn}</div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-black/48">
        <span>阶段 {String(paper.stageIndex).padStart(2, '0')}</span>
        <span>{paper.branchLabel}</span>
        {paper.isMergePaper && <span>汇流</span>}
      </div>
    </Link>
  )
}
