import { useCallback, useEffect, useRef, useState } from 'react'

import { buildWsUrl } from '@/utils/api'

interface WSMessage {
  type:
    | 'connected'
    | 'subscribed'
    | 'unsubscribed'
    | 'research_progress'
    | 'research_complete'
    | 'research_error'
    | 'pong'
    | 'error'
  sessionId?: string
  payload?: unknown
}

export interface ResearchProgress {
  stage: string
  progress: number
  logs: Array<{
    timestamp: string
    level: string
    message: string
  }>
}

interface UseWebSocketOptions {
  onProgress?: (sessionId: string, progress: ResearchProgress) => void
  onComplete?: (sessionId: string, result: unknown) => void
  onError?: (sessionId: string, error: string) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

const MAX_RECONNECT_ATTEMPTS = 5

function extractErrorMessage(payload: unknown) {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const message = payload.error
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return 'Unknown error'
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const callbacksRef = useRef(options)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shouldReconnectRef = useRef(true)
  const subscribedSessionsRef = useRef<Set<string>>(new Set())
  const [isConnected, setIsConnected] = useState(false)
  const [subscribedSessions, setSubscribedSessions] = useState<Set<string>>(
    () => new Set(),
  )

  useEffect(() => {
    callbacksRef.current = options
  }, [options])

  const clearReconnectTimeout = useCallback(() => {
    if (!reconnectTimeoutRef.current) return
    clearTimeout(reconnectTimeoutRef.current)
    reconnectTimeoutRef.current = null
  }, [])

  const syncSubscribedSessions = useCallback(
    (updater: (current: Set<string>) => Set<string>) => {
      const next = updater(subscribedSessionsRef.current)
      subscribedSessionsRef.current = next
      setSubscribedSessions(new Set(next))
      return next
    },
    [],
  )

  const getWsUrl = useCallback(() => buildWsUrl('/ws'), [])

  const sendMessage = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return false
    }

    wsRef.current.send(JSON.stringify(message))
    return true
  }, [])

  const removeSubscription = useCallback(
    (sessionId: string, notifyServer: boolean) => {
      syncSubscribedSessions((current) => {
        if (!current.has(sessionId)) return current
        const next = new Set(current)
        next.delete(sessionId)
        return next
      })

      if (notifyServer) {
        sendMessage({ type: 'unsubscribe', sessionId })
      }
    },
    [sendMessage, syncSubscribedSessions],
  )

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'research_progress':
          if (message.sessionId && message.payload) {
            callbacksRef.current.onProgress?.(
              message.sessionId,
              message.payload as ResearchProgress,
            )
          }
          break

        case 'research_complete':
          if (message.sessionId) {
            callbacksRef.current.onComplete?.(message.sessionId, message.payload)
            removeSubscription(message.sessionId, true)
          }
          break

        case 'research_error':
          if (message.sessionId) {
            callbacksRef.current.onError?.(
              message.sessionId,
              extractErrorMessage(message.payload),
            )
          }
          break

        case 'error':
          console.error('[WebSocket] Server error:', message.payload)
          break

        case 'connected':
        case 'subscribed':
        case 'unsubscribed':
        case 'pong':
        default:
          break
      }
    },
    [removeSubscription],
  )

  const connect = useCallback(() => {
    shouldReconnectRef.current = true

    const readyState = wsRef.current?.readyState
    if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
      return
    }

    clearReconnectTimeout()

    try {
      const ws = new WebSocket(getWsUrl())

      ws.onopen = () => {
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
        callbacksRef.current.onConnect?.()

        subscribedSessionsRef.current.forEach((sessionId) => {
          ws.send(JSON.stringify({ type: 'subscribe', sessionId }))
        })
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage
          handleMessage(message)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        setIsConnected(false)
        callbacksRef.current.onDisconnect?.()

        if (
          !shouldReconnectRef.current ||
          reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS
        ) {
          return
        }

        reconnectAttemptsRef.current += 1
        const delay = Math.min(
          1000 * 2 ** reconnectAttemptsRef.current,
          30000,
        )

        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, delay)
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error)
    }
  }, [clearReconnectTimeout, getWsUrl, handleMessage])

  const subscribe = useCallback(
    (sessionId: string) => {
      syncSubscribedSessions((current) => {
        if (current.has(sessionId)) return current
        const next = new Set(current)
        next.add(sessionId)
        return next
      })

      sendMessage({ type: 'subscribe', sessionId })
    },
    [sendMessage, syncSubscribedSessions],
  )

  const unsubscribe = useCallback(
    (sessionId: string) => {
      removeSubscription(sessionId, true)
    },
    [removeSubscription],
  )

  const sendPing = useCallback(() => {
    sendMessage({ type: 'ping' })
  }, [sendMessage])

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false
    reconnectAttemptsRef.current = 0
    clearReconnectTimeout()

    if (wsRef.current) {
      const ws = wsRef.current
      wsRef.current = null
      ws.close()
    }

    setIsConnected(false)
  }, [clearReconnectTimeout])

  useEffect(() => {
    connect()
    const heartbeatInterval = window.setInterval(sendPing, 30000)

    return () => {
      window.clearInterval(heartbeatInterval)
      disconnect()
    }
  }, [connect, disconnect, sendPing])

  return {
    isConnected,
    subscribedSessions,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
  }
}

export default useWebSocket
