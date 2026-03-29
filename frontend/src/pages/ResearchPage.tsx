import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, GitMerge } from 'lucide-react'

import { getTopicDisplay } from '@/data/topicDisplay'
import { useTopicRegistry } from '@/hooks'
import type { TopicId } from '@/types/tracker'

export function ResearchPage() {
  const { topicId } = useParams<{ topicId: TopicId }>()
  const { allTopicMap } = useTopicRegistry()
  const topic = topicId ? allTopicMap[topicId] : null
  const display = topic ? getTopicDisplay(topic.id) : null
  const branchLabelMap = new Map(display?.branchPalette.map((branch) => [branch.branchId, branch.branchLabel]) ?? [])

  if (!topic || !display) {
    return (
      <div className="px-4 py-10 md:px-6 xl:px-10">
        <Link to="/" className="text-sm underline underline-offset-4">
          返回首页
        </Link>
        <div className="mt-4 text-black/60">这个主题不存在。</div>
      </div>
    )
  }

  return (
    <main className="px-4 pb-16 pt-6 md:px-6 xl:px-10 xl:pt-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/topic/${topic.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm text-black/70 transition hover:border-black/20 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            返回主题页
          </Link>
        </div>

        <section className="mt-5 rounded-[36px] border border-black/8 bg-[#f6f2ea] px-6 py-8 md:px-8">
          <div className="text-[11px] tracking-[0.32em] text-red-600">研究舞台</div>
          <h1 className="mt-4 font-display text-[36px] leading-[1.08] text-black md:text-[56px]">
            {topic.nameZh} 的研究脉络
          </h1>
          <p className="mt-5 max-w-4xl text-[15px] leading-8 text-black/64">{display.hero.summary}</p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <MetricCard label="阶段数" value={String(display.hero.stageCount)} detail="纵向推进的舞台层级" />
            <MetricCard label="活跃分支" value={String(display.hero.activeBranchCount)} detail="同一阶段内并列出现的研究线" />
            <MetricCard label="汇流节点" value={String(display.hero.mergeCount)} detail="多条分支在同一论文节点收束" />
          </div>
        </section>

        <section className="mt-8 rounded-[32px] border border-black/8 bg-white px-6 py-6 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] tracking-[0.24em] text-red-600">阅读说明</div>
              <h2 className="mt-3 text-[24px] font-semibold leading-[1.25] text-black">多线展示说明</h2>
            </div>
            <div className="text-sm text-black/50">后端继续保留自动窗与多分支能力，前端只做稳定投影。</div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-wrap gap-2">
              {display.branchPalette.map((branch) => (
                <span
                  key={branch.branchId}
                  className="rounded-full border px-3 py-1 text-[11px]"
                  style={{
                    borderColor: `${branch.color}33`,
                    backgroundColor: `${branch.color}12`,
                    color: branch.color,
                  }}
                >
                  {branch.branchLabel}
                </span>
              ))}
            </div>

            <div className="space-y-2 text-[14px] leading-7 text-black/58">
              <p>{display.timelineLegend.stageLabel}</p>
              <p>{display.timelineLegend.branchLabel}</p>
              <p>{display.timelineLegend.mergeLabel}</p>
              <p>{display.timelineLegend.dormantLabel}</p>
            </div>
          </div>
        </section>

        {display.stageColumns.length === 0 ? (
          <section className="mt-8 rounded-[34px] border border-dashed border-black/10 bg-white px-6 py-10 md:px-8">
            <div className="max-w-3xl">
              <div className="text-[11px] tracking-[0.24em] text-red-600">待发现下一阶段</div>
              <h2 className="mt-3 text-[30px] font-semibold leading-[1.2] text-black">当前还没有正式 stage</h2>
              <p className="mt-4 text-[15px] leading-8 text-black/62">
                现在只保留了主题与起源论文，后端会在下一次 `paper-tracker`
                运行时，从外部搜索动态发现候选，并由 LLM 判断是否形成第一段真正可提交的研究阶段。
              </p>
            </div>
          </section>
        ) : (
          <section className="mt-8 space-y-8">
            {display.stageColumns.map((stage) => (
              <section
                key={stage.stageIndex}
                className="rounded-[34px] border border-black/8 bg-white px-6 py-6 md:px-8"
              >
                <div className="grid gap-6 lg:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="lg:sticky lg:top-24 lg:self-start">
                    <div className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700">
                      {stage.title}
                    </div>
                  </div>

                  <div>
                    <p className="max-w-4xl text-[15px] leading-8 text-black/62">{stage.summary}</p>

                    <div className="mt-6 grid gap-4 xl:grid-cols-2">
                      {stage.branchCards.map((card) => {
                        const isDormant = card.status === 'no-candidate'
                        const content = (
                          <>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-black/38">
                              <span style={{ color: card.branchColor }}>{card.branchLabel}</span>
                              <span>{card.statusLabel ?? card.status}</span>
                              {card.isMergePaper && (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <GitMerge className="h-3.5 w-3.5" />
                                  汇流
                                </span>
                              )}
                            </div>

                            <div className="mt-3 flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-[22px] font-semibold leading-[1.3] text-black">
                                  {card.paperTitleZh}
                                </h3>
                                <div className="mt-2 text-sm italic leading-7 text-black/42">{card.paperTitleEn}</div>
                              </div>
                              {!isDormant && (
                                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-black/32 transition group-hover:translate-x-1 group-hover:text-black/70" />
                              )}
                            </div>

                            <p className="mt-4 text-[15px] leading-8 text-black/62">{card.timelineDigest}</p>

                            <div className="mt-5 flex flex-wrap gap-2">
                              <InfoPill label={`${card.windowStart} 至 ${card.windowEnd}`} />
                              <InfoPill label={`${card.windowMonths} 个月窗口`} />
                              {card.problemTags.slice(0, 3).map((tag) => (
                                <InfoPill key={`${card.branchId}-${tag}`} label={tag} />
                              ))}
                              {card.mergeFromBranchIds.map((branchId) => (
                                <InfoPill
                                  key={`${card.paperId}-${branchId}`}
                                  label={`来自 ${branchLabelMap.get(branchId) ?? '相关分支'}`}
                                  tone="merge"
                                />
                              ))}
                            </div>
                          </>
                        )

                        return isDormant ? (
                          <div
                            key={`${stage.stageIndex}-${card.branchId}-${card.paperId}`}
                            className="rounded-[26px] border border-black/8 bg-[#fcfbf8] px-5 py-5"
                            style={{ boxShadow: `inset 5px 0 0 ${card.branchColor}` }}
                          >
                            {content}
                          </div>
                        ) : (
                          <Link
                            key={`${stage.stageIndex}-${card.branchId}-${card.paperId}`}
                            to={`/paper/${card.paperId}?theme=${topic.id}`}
                            className="group block rounded-[26px] border border-black/8 bg-[#fcfbf8] px-5 py-5 transition hover:border-black/14 hover:bg-white"
                            style={{ boxShadow: `inset 5px 0 0 ${card.branchColor}` }}
                          >
                            {content}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white/90 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-black/38">{label}</div>
      <div className="mt-3 text-[30px] font-semibold leading-none text-black">{value}</div>
      <p className="mt-3 text-[14px] leading-7 text-black/58">{detail}</p>
    </article>
  )
}

function InfoPill({
  label,
  tone = 'default',
}: {
  label: string
  tone?: 'default' | 'merge'
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] ${
        tone === 'merge'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-black/10 bg-white text-black/58'
      }`}
    >
      {label}
    </span>
  )
}
