import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { TopicResearchWorld } from '@/types/alpha'

function uniqueStrings(values: Array<string | null | undefined>, limit = 4, maxLength = 180) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = value?.replace(/\s+/gu, ' ').trim() ?? ''
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(
      normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized,
    )
    if (output.length >= limit) break
  }

  return output
}

function maturityTone(maturity: TopicResearchWorld['summary']['maturity']) {
  if (maturity === 'stable') return 'bg-emerald-50 text-emerald-700'
  if (maturity === 'contested') return 'bg-amber-50 text-amber-700'
  if (maturity === 'forming') return 'bg-sky-50 text-sky-700'
  return 'bg-black/[0.04] text-black/54'
}

export function ResearchWorldCard({
  world,
  onUsePrompt,
}: {
  world: TopicResearchWorld | null
  onUsePrompt: (prompt: string) => void
}) {
  const { copy } = useProductCopy()
  const { t } = useI18n()

  if (!world) {
    return (
      <section
        data-testid="topic-research-world-card"
        className="rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,#fffefb_0%,#f3efe7_100%)] px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
            {t('workbench.worldEyebrow', copy('assistant.worldEyebrow', 'Research world'))}
          </div>
          <div className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] text-black/54">
            forming
          </div>
        </div>

        <h3 className="mt-2 text-[14px] font-semibold leading-6 text-black">
          {t('workbench.worldFallbackTitle', 'The world model is still rehydrating.')}
        </h3>

        <p className="mt-1.5 text-[11px] leading-6 text-black/60">
          {t(
            'workbench.worldFallbackDek',
            copy(
              'assistant.worldDek',
              'Stages, nodes, and open tensions will reappear here once the backend restores the topic-level research memory.',
            ),
          )}
        </p>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <StatCell
            label={t('workbench.worldStageCount', copy('assistant.worldStageCount', 'Stages'))}
            value={0}
          />
          <StatCell
            label={t('workbench.worldNodeCount', copy('assistant.worldNodeCount', 'Nodes'))}
            value={0}
          />
          <StatCell
            label={t('workbench.worldPaperCount', copy('assistant.worldPaperCount', 'Papers'))}
            value={0}
          />
        </div>
      </section>
    )
  }

  const claims = uniqueStrings(world.claims.slice(0, 2).map((claim) => claim.statement), 2, 150)
  const agenda = world.agenda.slice(0, 3)
  const stages = world.stages.slice(0, 2)
  const nodes = world.nodes.slice(0, 3)
  const tensions = uniqueStrings(
    [
      world.summary.dominantQuestion,
      world.summary.dominantCritique,
      ...world.questions.slice(0, 2).map((question) => question.question),
      ...world.critiques.slice(0, 1).map((critique) => critique.summary),
    ],
    2,
    150,
  )

  return (
    <section
      data-testid="topic-research-world-card"
      className="rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,#fffefb_0%,#f3efe7_100%)] px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-black/34">
          {t('workbench.worldEyebrow', copy('assistant.worldEyebrow', 'Research world'))}
        </div>
        <div className={`rounded-full px-2.5 py-1 text-[10px] ${maturityTone(world.summary.maturity)}`}>
          {world.summary.maturity}
        </div>
      </div>

      <h3 className="mt-2 text-[14px] font-semibold leading-6 text-black">
        {world.summary.currentFocus || world.summary.thesis}
      </h3>

      {world.summary.thesis && world.summary.thesis !== world.summary.currentFocus ? (
        <p className="mt-1.5 text-[11px] leading-6 text-black/60">{world.summary.thesis}</p>
      ) : null}

      {world.summary.continuity ? (
        <div className="mt-2 rounded-[16px] bg-white/78 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.worldContinuity', copy('assistant.worldContinuity', 'Continuity'))}
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-black/58">
            {world.summary.continuity}
          </p>
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatCell
          label={t('workbench.worldStageCount', copy('assistant.worldStageCount', 'Stages'))}
          value={world.stages.length}
        />
        <StatCell
          label={t('workbench.worldNodeCount', copy('assistant.worldNodeCount', 'Nodes'))}
          value={world.nodes.length}
        />
        <StatCell
          label={t('workbench.worldPaperCount', copy('assistant.worldPaperCount', 'Papers'))}
          value={world.papers.length}
        />
      </div>

      {stages.length > 0 ? (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.worldStages', copy('assistant.worldStages', 'Visible stages'))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => onUsePrompt(stage.summary || stage.title)}
                className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
                title={stage.summary}
              >
                {`S${stage.stageIndex} · ${stage.title}`}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {nodes.length > 0 ? (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.worldNodes', copy('assistant.worldNodes', 'Live nodes'))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onUsePrompt(node.keyQuestion || node.summary || node.title)}
                className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/60 transition hover:border-black/16 hover:text-black"
                title={node.summary || node.keyQuestion || node.dominantCritique}
              >
                {`S${node.stageIndex} · ${node.title}`}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {agenda.length > 0 ? (
        <div className="mt-2.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.worldAgenda', copy('assistant.worldAgenda', 'Active agenda'))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {agenda.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onUsePrompt(item.suggestedPrompt || item.title)}
                className="rounded-full border border-black/8 bg-white px-2.5 py-1 text-[10px] text-black/62 transition hover:border-black/16 hover:text-black"
                title={item.rationale}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {claims.length > 0 ? (
        <div className="mt-2.5 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.worldClaims', copy('assistant.worldClaims', 'Established claims'))}
          </div>
          {claims.map((claim) => (
            <p key={claim} className="text-[10px] leading-5 text-black/60">
              {claim}
            </p>
          ))}
        </div>
      ) : null}

      {tensions.length > 0 ? (
        <div className="mt-2.5 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-black/34">
            {t('workbench.worldTensions', copy('assistant.worldTensions', 'Open tensions'))}
          </div>
          {tensions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onUsePrompt(item)}
              className="block w-full rounded-[14px] border border-black/6 bg-white/72 px-3 py-2 text-left text-[10px] leading-5 text-black/58 transition hover:border-black/12 hover:text-black"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[14px] bg-white/72 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-black/34">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-black">{value}</div>
    </article>
  )
}
