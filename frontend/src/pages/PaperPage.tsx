import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { useReadingWorkspace } from '@/contexts/readingWorkspaceHooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useProductCopy } from '@/hooks/useProductCopy'
import { useI18n } from '@/i18n'
import type { PaperViewModel } from '@/types/alpha'
import { apiGet } from '@/utils/api'
import {
  readStageWindowSearchParam,
  withOptionalStageWindowQuery,
  withStageWindowRoute,
} from '@/utils/stageWindow'

export function PaperPage() {
  const { paperId = '' } = useParams<{ paperId: string }>()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [viewModel, setViewModel] = useState<PaperViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const { rememberTrail } = useReadingWorkspace()
  const { copy } = useProductCopy()
  const { t } = useI18n()
  const requestedStageWindowMonths = useMemo(
    () => readStageWindowSearchParam(searchParams),
    [searchParams],
  )
  const stageWindowMonths = viewModel?.stageWindowMonths ?? requestedStageWindowMonths ?? 1
  const primaryNode = viewModel?.relatedNodes[0] ?? null
  const primaryNodeRoute = useMemo(() => {
    if (!viewModel || !primaryNode) return null

    const requestedAnchor = searchParams.get('anchor')
    const requestedEvidence = searchParams.get('evidence')
    const query = new URLSearchParams()
    if (requestedEvidence) {
      query.set('evidence', requestedEvidence)
    } else if (requestedAnchor) {
      query.set('anchor', requestedAnchor)
    } else {
      query.set('anchor', `paper:${viewModel.paperId}`)
    }

    return withStageWindowRoute(
      `/node/${primaryNode.nodeId}?${query.toString()}`,
      stageWindowMonths,
    )
  }, [primaryNode, searchParams, stageWindowMonths, viewModel])

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

  useEffect(() => {
    if (!viewModel) return

    rememberTrail({
      id: `paper:${viewModel.paperId}`,
      kind: 'paper',
      topicId: viewModel.topic.topicId,
      paperId: viewModel.paperId,
      title: viewModel.title,
      route: primaryNodeRoute ?? `${location.pathname}${location.search}`,
    })
  }, [
    location.pathname,
    location.search,
    primaryNodeRoute,
    rememberTrail,
    viewModel,
  ])

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

  // 自动重定向到节点页
  if (primaryNodeRoute) {
    return <Navigate to={primaryNodeRoute} replace />
  }

  // 如果没有主节点，显示简单的重定向提示
  return (
    <main
      data-testid="paper-redirect"
      className="px-4 pb-20 pt-6 md:px-6 xl:px-10"
    >
      <div className="mx-auto max-w-[840px] py-12 text-center">
        <div className="text-[14px] text-black/56">
          {t('paper.redirecting', 'Redirecting to node article...')}
        </div>
      </div>
    </main>
  )
}

export default PaperPage
