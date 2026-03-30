import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock3, GitBranch, Layers3, RefreshCcw } from 'lucide-react'

import { TopicChatSidebar } from '@/components/topic/TopicChatSidebar'
import type { CitationRef, EvidencePayload, SuggestedAction, TopicViewModel } from '@/types/alpha'
import { apiGet, apiPost } from '@/utils/api'

const COPY = {
  loadError:
    '\u8fd9\u4e2a\u4e3b\u9898\u8fd8\u6ca1\u6709\u8fdb\u5165\u65b0\u7684 Alpha \u540e\u7aef\u94fe\u8def\uff0c\u6216\u8005\u672c\u5730\u540e\u7aef\u8fd8\u6ca1\u6709\u542f\u52a8\u3002',
  loading: '\u6b63\u5728\u52a0\u8f7d\u4e3b\u9898 artifact...',
  backHome: '\u8fd4\u56de\u9996\u9875',
  backOverview: '\u8fd4\u56de\u603b\u89c8',
  unavailable: '\u4e3b\u9898\u6682\u4e0d\u53ef\u7528',
  openDemo: '\u6253\u5f00\u6f14\u793a\u4e3b\u9898',
  alphaState: 'Alpha State',
  rebuild: '\u91cd\u5efa artifact',
  nodeTimelineTitle: '\u9636\u6bb5\u4e0e\u8282\u70b9',
  papersTitle: '\u4ee3\u8868\u8bba\u6587',
  narrativeTitle: '\u4e3b\u9898\u53d9\u4e8b',
  nodeChip: '\u8282\u70b9',
  mergeChip: '\u6c47\u6d41',
  provisionalChip: '\u4e34\u65f6',
  primaryPaper: '\u4e3b\u8bba\u6587\uff1a',
  relatedPapers: '\u7bc7\u5173\u8054\u8bba\u6587',
  citationCount: '\u5f15\u7528',
  authorFallback: '\u4f5c\u8005\u4fe1\u606f\u5f85\u8865\u5145',
  figures: '\u56fe',
  tables: '\u8868',
  formulas: '\u516c\u5f0f',
} as const

function anchorDomId(anchorId: string) {
  return `anchor-${anchorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function formatStat(value: number, unit: string) {
  return `${value} ${unit}`
}

export function TopicPage() {
  const { topicId = '' } = useParams<{ topicId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<TopicViewModel | null>(null)
  const [selectedEvidence, setSelectedEvidence] = useState<EvidencePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const highlightedAnchor = searchParams.get('anchor')

  useEffect(() => {
    let alive = true

    async function loadTopic() {
      setLoading(true)
      setError(null)

      try {
        const data = await apiGet<TopicViewModel>(`/api/topics/${topicId}/view-model`)
        if (!alive) return
        setViewModel(data)
      } catch {
        if (!alive) return
        setError(COPY.loadError)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadTopic()
    return () => {
      alive = false
    }
  }, [topicId])

  useEffect(() => {
    const anchorId = searchParams.get('anchor')
    if (!anchorId) return

    const element = document.getElementById(anchorDomId(anchorId))
    if (!element) return

    window.setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }, [searchParams, viewModel])

  useEffect(() => {
    const evidenceAnchor = searchParams.get('evidence')
    if (!evidenceAnchor) {
      setSelectedEvidence(null)
      return
    }
    const activeEvidenceAnchor = evidenceAnchor

    let alive = true

    async function loadEvidence() {
      try {
        const evidence = await apiGet<EvidencePayload>(
          `/api/evidence/${encodeURIComponent(activeEvidenceAnchor)}`,
        )
        if (alive) {
          setSelectedEvidence(evidence)
        }
      } catch {
        if (alive) {
          setSelectedEvidence(null)
        }
      }
    }

    void loadEvidence()
    return () => {
      alive = false
    }
  }, [searchParams])

  const stageSummary = useMemo(
    () =>
      viewModel?.stages.map((stage) => ({
        stageIndex: stage.stageIndex,
        title: stage.title,
        nodeCount: stage.nodes.length,
      })) ?? [],
    [viewModel],
  )

  async function rebuildTopic() {
    if (!topicId || rebuilding) return
    setRebuilding(true)

    try {
      const response = await apiPost<
        { topicId: string; rebuiltAt: string; viewModel: TopicViewModel },
        Record<string, never>
      >(`/api/topics/${topicId}/rebuild`, {})
      setViewModel(response.viewModel)
    } finally {
      setRebuilding(false)
    }
  }

  async function openEvidence(anchorId: string) {
    const evidence = await apiGet<EvidencePayload>(`/api/evidence/${encodeURIComponent(anchorId)}`)
    setSelectedEvidence(evidence)

    const next = new URLSearchParams(searchParams)
    next.set('evidence', anchorId)
    next.delete('anchor')
    setSearchParams(next, { replace: true })
  }

  function focusAnchor(anchorId: string) {
    const next = new URLSearchParams(searchParams)
    next.set('anchor', anchorId)
    next.delete('evidence')
    setSearchParams(next, { replace: true })
  }

  function handleCitation(citation: CitationRef) {
    if (citation.type === 'figure' || citation.type === 'table' || citation.type === 'formula') {
      void openEvidence(citation.anchorId)
      return
    }

    focusAnchor(citation.anchorId)
  }

  function handleAction(action: SuggestedAction) {
    if (!action.targetId) return

    if (
      action.action === 'show_evidence' ||
      action.targetId.startsWith('figure:') ||
      action.targetId.startsWith('table:') ||
      action.targetId.startsWith('formula:')
    ) {
      void openEvidence(action.targetId)
      return
    }

    focusAnchor(action.targetId)
  }

  if (loading) {
    return (
      <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[1180px] rounded-[28px] border border-black/8 bg-white px-6 py-8 text-[14px] text-black/56">
          {COPY.loading}
        </div>
      </main>
    )
  }

  if (!viewModel) {
    return (
      <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[920px]">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-black/50 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {COPY.backHome}
          </Link>

          <div className="mt-6 rounded-[28px] border border-black/8 bg-white px-6 py-8">
            <div className="text-[11px] uppercase tracking-[0.24em] text-black/36">{COPY.alphaState}</div>
            <h1 className="mt-4 text-[30px] font-semibold leading-[1.15] text-black">{COPY.unavailable}</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-8 text-black/62">{error}</p>
            <Link
              to="/topic/topic-1"
              className="mt-6 inline-flex items-center rounded-full border border-black bg-black px-4 py-2 text-sm text-white transition hover:bg-black/90"
            >
              {COPY.openDemo}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-black/50 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {COPY.backOverview}
          </Link>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <section className="overflow-hidden rounded-[32px] border border-black/8 bg-white px-8 py-9 md:px-10 md:py-10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-black/36">
                    {viewModel.subtitle}
                  </div>
                  <h1 className="mt-4 font-display text-[38px] leading-[1.08] text-black md:text-[54px]">
                    {viewModel.title}
                  </h1>
                </div>

                <button
                  type="button"
                  onClick={() => void rebuildTopic()}
                  disabled={rebuilding}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-[12px] text-black/62 transition hover:border-black/20 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${rebuilding ? 'animate-spin' : ''}`} />
                  {COPY.rebuild}
                </button>
              </div>

              <p className="mt-6 max-w-3xl text-[16px] leading-8 text-black/62">{viewModel.summary}</p>

              <div className="mt-8 flex flex-wrap gap-6 text-[13px] text-black/50">
                <Stat icon={<Layers3 className="h-4 w-4" />} label={formatStat(viewModel.stats.stageCount, '\u4e2a\u9636\u6bb5')} />
                <Stat icon={<GitBranch className="h-4 w-4" />} label={formatStat(viewModel.stats.nodeCount, '\u4e2a\u8282\u70b9')} />
                <Stat icon={<Clock3 className="h-4 w-4" />} label={formatStat(viewModel.stats.paperCount, '\u7bc7\u8bba\u6587')} />
              </div>

              {stageSummary.length > 0 && (
                <div className="mt-8 flex flex-wrap gap-2">
                  {stageSummary.map((stage) => (
                    <button
                      key={stage.stageIndex}
                      type="button"
                      onClick={() => focusAnchor(`stage:${stage.stageIndex}`)}
                      className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] text-black/60 transition hover:border-black/20 hover:text-black"
                    >
                      {`\u9636\u6bb5 ${stage.stageIndex} \u00b7 ${stage.nodeCount} \u4e2a\u8282\u70b9`}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-black/8 bg-white px-6 py-7 md:px-8">
              <SectionHeader label="Node Timeline" title={COPY.nodeTimelineTitle} />
              <div className="mt-8 space-y-8">
                {viewModel.stages.map((stage) => (
                  <div
                    key={stage.stageIndex}
                    id={anchorDomId(`stage:${stage.stageIndex}`)}
                    className="scroll-mt-24"
                  >
                    <div className="mb-4 flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-[14px] font-semibold text-white">
                        {stage.stageIndex}
                      </div>
                      <div>
                        <h2 className="text-[17px] font-semibold text-black">{stage.title}</h2>
                        <p className="text-[13px] text-black/48">{stage.description}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {stage.nodes.map((node) => {
                        const highlighted = highlightedAnchor === node.anchorId

                        return (
                          <article
                            key={node.nodeId}
                            id={anchorDomId(node.anchorId)}
                            className={`scroll-mt-24 rounded-[22px] border px-5 py-5 transition ${
                              highlighted
                                ? 'border-black/22 bg-[#faf8f3] shadow-[0_12px_30px_rgba(17,17,17,0.05)]'
                                : 'border-black/8 bg-white'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-black/10 px-2.5 py-1 text-[10px] text-black/54">
                                {COPY.nodeChip}
                              </span>
                              {node.isMergeNode && (
                                <span className="rounded-full border border-black/10 px-2.5 py-1 text-[10px] text-black/54">
                                  {COPY.mergeChip}
                                </span>
                              )}
                              {node.provisional && (
                                <span className="rounded-full border border-dashed border-black/16 px-2.5 py-1 text-[10px] text-black/42">
                                  {COPY.provisionalChip}
                                </span>
                              )}
                            </div>

                            <h3 className="mt-4 text-[20px] font-semibold leading-[1.2] text-black">
                              {node.title}
                            </h3>

                            {node.subtitle && (
                              <p className="mt-2 text-[13px] leading-6 text-black/42">{node.subtitle}</p>
                            )}

                            <p className="mt-4 text-[14px] leading-7 text-black/64">{node.explanation}</p>

                            <div className="mt-5 flex flex-wrap gap-3 text-[11px] text-black/42">
                              <span>{`${COPY.primaryPaper}${node.primaryPaperTitle}`}</span>
                              <span>{`${node.paperCount} ${COPY.relatedPapers}`}</span>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-black/8 bg-white px-6 py-7 md:px-8">
              <SectionHeader label="Representative Papers" title={COPY.papersTitle} />
              <div className="mt-8 grid gap-4">
                {viewModel.papers.map((paper) => {
                  const highlighted = highlightedAnchor === paper.anchorId
                  const authorText = paper.authors.slice(0, 3).join(' \u00b7 ') || COPY.authorFallback

                  return (
                    <article
                      key={paper.paperId}
                      id={anchorDomId(paper.anchorId)}
                      className={`scroll-mt-24 rounded-[22px] border px-5 py-5 transition ${
                        highlighted
                          ? 'border-black/22 bg-[#faf8f3] shadow-[0_12px_30px_rgba(17,17,17,0.05)]'
                          : 'border-black/8 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">
                            {new Date(paper.publishedAt).toLocaleDateString('zh-CN')}
                          </div>
                          <h3 className="mt-3 text-[20px] font-semibold leading-[1.2] text-black">
                            {paper.title}
                          </h3>
                          {paper.titleEn && paper.titleEn !== paper.title && (
                            <div className="mt-2 text-[13px] italic text-black/40">{paper.titleEn}</div>
                          )}
                        </div>

                        {paper.citationCount !== null && (
                          <div className="rounded-full border border-black/10 px-3 py-1 text-[11px] text-black/52">
                            {`${COPY.citationCount} ${paper.citationCount}`}
                          </div>
                        )}
                      </div>

                      <p className="mt-4 text-[14px] leading-7 text-black/64">{paper.explanation}</p>

                      <div className="mt-5 flex flex-wrap gap-3 text-[11px] text-black/42">
                        <span>{authorText}</span>
                        <span>{`${paper.figuresCount} ${COPY.figures}`}</span>
                        <span>{`${paper.tablesCount} ${COPY.tables}`}</span>
                        <span>{`${paper.formulasCount} ${COPY.formulas}`}</span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-black/8 bg-[#faf8f3] px-6 py-7 md:px-8">
              <SectionHeader label="About This Topic" title={COPY.narrativeTitle} />
              <div className="mt-6 whitespace-pre-line text-[15px] leading-8 text-black/66">
                {viewModel.narrativeArticle}
              </div>
            </section>
          </div>

          <TopicChatSidebar
            topicId={viewModel.topicId}
            suggestedQuestions={viewModel.chatContext.suggestedQuestions}
            selectedEvidence={selectedEvidence}
            onOpenCitation={handleCitation}
            onAction={handleAction}
          />
        </div>
      </div>
    </main>
  )
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-black/34">{label}</div>
        <h2 className="mt-3 text-[28px] font-semibold leading-[1.15] text-black">{title}</h2>
      </div>
    </div>
  )
}

function Stat({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-black/45">{icon}</span>
      <span>{label}</span>
    </div>
  )
}
