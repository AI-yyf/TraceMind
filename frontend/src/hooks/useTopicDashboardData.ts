import { useCallback, useEffect, useState } from 'react'

import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { ApiError, apiGet } from '@/utils/api'
import type { TopicSurfaceMode } from '@/components/topic/TopicSurfaceModeSwitch'

type TopicDashboardResponse = {
  success: boolean
  data: TopicDashboardData
}

export type TopicDashboardLoadState =
  | { status: 'idle' | 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | { status: 'ready'; data: TopicDashboardData; error: null }

const idleState: TopicDashboardLoadState = {
  status: 'idle',
  data: null,
  error: null,
}

export function useTopicDashboardData(
  topicId: string,
  mode: TopicSurfaceMode,
  fallbackErrorMessage: string,
) {
  const [state, setState] = useState<TopicDashboardLoadState>(idleState)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    setState(idleState)
    setRequestKey(0)
  }, [topicId])

  useEffect(() => {
    if (mode !== 'dashboard' || !topicId) return
    if (state.status === 'ready' || state.status === 'loading') return

    let alive = true
    setState({ status: 'loading', data: null, error: null })

    apiGet<TopicDashboardResponse>(`/api/topics/${topicId}/dashboard`)
      .then((response) => {
        if (!alive) return
        if (response?.success && response.data) {
          setState({ status: 'ready', data: response.data, error: null })
          return
        }

        setState({
          status: 'error',
          data: null,
          error: fallbackErrorMessage,
        })
      })
      .catch((error) => {
        if (!alive) return
        setState({
          status: 'error',
          data: null,
          error: error instanceof ApiError ? error.message : fallbackErrorMessage,
        })
      })

    return () => {
      alive = false
    }
  }, [fallbackErrorMessage, mode, requestKey, topicId])

  const reload = useCallback(() => {
    setState(idleState)
    setRequestKey((current) => current + 1)
  }, [])

  return {
    state,
    reload,
  }
}
