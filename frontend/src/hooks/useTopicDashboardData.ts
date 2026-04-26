import { useCallback, useEffect, useState } from 'react'

import type { TopicDashboard as TopicDashboardData } from '@/types/article'
import { ApiError, apiGet } from '@/utils/api'
import { assertTopicDashboardContract } from '@/utils/contracts'
import { withOptionalStageWindowQuery } from '@/utils/stageWindow'

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
  enabled: boolean,
  fallbackErrorMessage: string,
  stageWindowMonths?: number | null,
) {
  const [state, setState] = useState<TopicDashboardLoadState>(idleState)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    setState(idleState)
    setRequestKey(0)
  }, [stageWindowMonths, topicId])

  useEffect(() => {
    if (!enabled || !topicId) return

    let alive = true
    setState({ status: 'loading', data: null, error: null })

    apiGet<unknown>(
      withOptionalStageWindowQuery(`/api/topics/${topicId}/dashboard`, stageWindowMonths),
    )
      .then((response) => {
        if (!alive) return
        if (response) {
          assertTopicDashboardContract(response)
          setState({ status: 'ready', data: response, error: null })
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
          error:
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : fallbackErrorMessage,
        })
      })

    return () => {
      alive = false
    }
  }, [enabled, fallbackErrorMessage, requestKey, stageWindowMonths, topicId])

  const reload = useCallback(() => {
    setState(idleState)
    setRequestKey((current) => current + 1)
  }, [])

  return {
    state,
    reload,
  }
}