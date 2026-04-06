import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { PaperViewModel } from '@/types/alpha'
import { apiGet, resolveApiAssetUrl } from '@/utils/api'
import {
  readStageWindowSearchParam,
  withOptionalStageWindowQuery,
  withStageWindowRoute,
} from '@/utils/stageWindow'

function resolvePaperDownloadUrl(source: { pdfUrl?: string | null }) {
  return resolveApiAssetUrl(source.pdfUrl) ?? source.pdfUrl ?? null
}

function formatPublishedDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(+date)) return value
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, '0')}.${`${date.getDate()}`.padStart(2, '0')}`
}

export function PaperPage() {
  const { paperId = '' } = useParams<{ paperId: string }>()
  const [searchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<PaperViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const stageWindowMonths = viewModel?.stageWindowMonths ?? requestedStageWindowMonths ?? 1
  const paperDownloadUrl = useMemo(
    () => (viewModel ? resolvePaperDownloadUrl(viewModel) : null),
    [viewModel],
  )
  const primaryNode = viewModel?.relatedNodes[0] ?? null

  useDocumentTitle(
    viewModel?.title ??
      (loading
        ? copy('reading.paperLoadingTitle', t('paper.readingTitle', 'Paper redirect'))
        : copy('reading.paperUnavailableTitle', t('paper.unavailableTitle', 'Paper unavailable'))),
  )

  useEffect(() => {
    let alive = true
    setLoading(true)

    apiGet<PaperViewModel>(
      withOptionalStageWindowQuery(`/api/papers/${paperId}/view-model`, requestedStageWindowMonths),
    )
      .then((payload) => {
        if (alive) setViewModel(payload)
      })
      .catch(() => {
        if (alive) setViewModel(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [paperId, requestedStageWindowMonths])

  if (loading) {
    return (
      <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[760px] py-12 text-[14px] text-black/56">
          {copy('reading.paperLoading', t('paper.loading', 'Loading paper...'))}
        </div>
      </main>
    )
  }

  if (!viewModel) {
    return (
      <main className="px-4 pb-20 pt-6 md:px-6 xl:px-10">
        <div className="mx-auto max-w-[760px] py-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy('reading.backHome', t('topic.backHome', 'Back to Home'))}
          </Link>
          <h1 className="mt-6 text-[32px] font-semibold text-black">
            {copy('reading.paperUnavailableTitle', t('paper.unavailableTitle', 'Paper unavailable'))}
          </h1>
        </div>
      </main>
    )
  }

  return (
    <main
      data-testid="paper-redirect"
      className="px-4 pb-20 pt-6 md:px-6 xl:px-10"
    >
      <div className="mx-auto max-w-[840px]">
        <Link
          to={withStageWindowRoute(viewModel.topic.route, stageWindowMonths)}
          className="inline-flex items-center gap-2 text-sm text-black/54 transition hover:text-black"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy('reading.backTopic', t('node.backTopic', 'Back to Topic'))}
        </Link>

        <section className="mt-8 rounded-[28px] border border-black/8 bg-white px-6 py-6 shadow-[0_16px_36px_rgba(15,23,42,0.06)] md:px-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-black/36">
            {t('paper.redirectEyebrow', 'Reading moved')}
          </div>
          <h1 className="mt-3 font-display text-[34px] leading-[1.08] text-black md:text-[46px]">
            {viewModel.title}
          </h1>
          <p className="mt-4 max-w-[720px] text-[16px] leading-8 text-black/64">
            {t(
              'paper.redirectSummary',
              'Paper pages are now treated as a fallback surface. The full explanation, evidence ordering, and critical reading live inside the node article.',
            )}
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-[12px] text-black/50">
            {viewModel.publishedAt ? (
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5">
                {formatPublishedDate(viewModel.publishedAt)}
              </span>
            ) : null}
            {typeof viewModel.citationCount === 'number' ? (
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5">
                {viewModel.citationCount} {t('paper.citations', 'Citations')}
              </span>
            ) : null}
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5">
              {viewModel.relatedNodes.length} {t('paper.relatedNodes', 'Related nodes')}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {primaryNode ? (
              <Link
                to={withStageWindowRoute(`/node/${primaryNode.nodeId}?anchor=${encodeURIComponent(`paper:${viewModel.paperId}`)}`, stageWindowMonths)}
                className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm text-white transition hover:bg-black/86"
              >
                {t('paper.openPrimaryNode', 'Open node article')}
              </Link>
            ) : null}
            {viewModel.originalUrl ? (
              <a
                href={viewModel.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-black/68 transition hover:border-black/18 hover:text-black"
              >
                {t('node.openSource', 'Original source')}
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {paperDownloadUrl ? (
              <a
                href={paperDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-black/68 transition hover:border-black/18 hover:text-black"
              >
                {t('node.downloadPdf', 'Download PDF')}
              </a>
            ) : null}
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-black/8 bg-[var(--surface-soft)] px-6 py-6 md:px-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-black/36">
            {t('paper.redirectNodesEyebrow', 'Where to read this paper')}
          </div>
          <div className="mt-4 grid gap-3">
            {viewModel.relatedNodes.map((node) => (
              <Link
                key={node.nodeId}
                to={withStageWindowRoute(`/node/${node.nodeId}?anchor=${encodeURIComponent(`paper:${viewModel.paperId}`)}`, stageWindowMonths)}
                className="rounded-[22px] border border-black/8 bg-white px-4 py-4 transition hover:border-black/16"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-black/36">
                  {node.stageLabel || `${t('workbench.nodeStageLabel', 'Stage {stage}').replace('{stage}', String(node.stageIndex))}`}
                </div>
                <div className="mt-2 text-[18px] font-semibold text-black">{node.title}</div>
                <p className="mt-2 text-[14px] leading-7 text-black/60">
                  {node.summary || node.subtitle}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

export default PaperPage
