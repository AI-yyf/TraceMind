import type { ReactNode } from 'react'

export type TopicGraphStage = {
  stageIndex: number
  chronologyLabel: string
  badgeLabel: string
  displayTitle: string
  overview: string
  countsLabel: string
}

export function TopicGraphSection({
  stages,
  activeStageAnchor,
  graphTitle,
  graphEyebrow,
  graphIntro,
  graphStatsLabel,
  stageLabelTemplate,
  getStageDomId,
  onFocusStage,
  renderStageNodes,
}: {
  stages: TopicGraphStage[]
  activeStageAnchor: string | null
  graphTitle: string
  graphEyebrow: string
  graphIntro: string
  graphStatsLabel: string
  stageLabelTemplate: (stageIndex: number) => string
  getStageDomId: (anchorId: string) => string
  onFocusStage: (anchorId: string) => void
  renderStageNodes: (stageIndex: number) => ReactNode
}) {
  return (
    <section className="mt-6 rounded-[30px] border border-black/8 bg-[linear-gradient(180deg,#fdfcf9_0%,#ffffff_100%)] px-4 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)] md:px-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">{graphEyebrow}</div>
          <h2 className="mt-2 font-display text-[22px] leading-[1.06] text-black">{graphTitle}</h2>
        </div>
        <div className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-[11px] text-black/54">
          {graphStatsLabel}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-black/48">
        <p className="mt-1.5 max-w-[620px] text-[11px] leading-5 text-black/48">{graphIntro}</p>
      </div>
      <div data-testid="topic-stage-map" className="mt-6 space-y-5">
        {stages.map((stage, index) => {
          const highlighted = activeStageAnchor === `stage:${stage.stageIndex}`
          const chronologyText =
            stage.chronologyLabel || stage.badgeLabel || stageLabelTemplate(stage.stageIndex)

          return (
            <article
              key={stage.stageIndex}
              className={`relative overflow-hidden rounded-[30px] border px-5 py-5 transition md:px-6 ${
                highlighted
                  ? 'border-[#d1aa5c]/70 bg-[#fffcf5] shadow-[0_16px_34px_rgba(209,170,92,0.12)]'
                  : 'border-black/8 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
              }`}
            >
              {index < stages.length - 1 ? (
                <div className="pointer-events-none absolute bottom-[-26px] left-[38px] top-[104px] hidden w-px bg-[linear-gradient(180deg,rgba(125,25,56,0.22)_0%,rgba(125,25,56,0.04)_100%)] lg:block" />
              ) : null}

              <div className="mx-auto grid max-w-[1120px] gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
                <button
                  type="button"
                  id={getStageDomId(`stage:${stage.stageIndex}`)}
                  onClick={() => onFocusStage(`stage:${stage.stageIndex}`)}
                  className="relative overflow-hidden rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fcfaf5_0%,#f7f2e7_100%)] px-5 py-5 text-left transition hover:border-black/16"
                >
                  <div className="absolute inset-y-0 left-0 w-1 bg-[rgba(125,25,56,0.72)]" />
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-black/38">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        highlighted ? 'bg-[#d1aa5c]' : 'bg-[rgba(125,25,56,0.45)]'
                      }`}
                    />
                    <span>{chronologyText}</span>
                  </div>
                  <div className="mt-3 text-[20px] font-semibold leading-[1.18] text-black">
                    {stage.displayTitle || stage.badgeLabel}
                  </div>
                  {stage.overview ? (
                    <p className="mt-3 text-[13px] leading-6 text-black/58">{stage.overview}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-black/46">
                    <span className="rounded-full border border-black/8 bg-white px-2.5 py-1">
                      {stage.countsLabel}
                    </span>
                  </div>
                </button>

                <div className="min-w-0">
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] xl:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                    {renderStageNodes(stage.stageIndex)}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
