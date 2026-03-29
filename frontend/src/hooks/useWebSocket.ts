import { useEffect, useRef, useState, useCallback } from 'react'

// WebSocket 消息类型
interface WSMessage {
  type: 'connected' | 'subscribed' | 'unsubscribed' | 'research_progress' | 'research_complete' | 'research_error' | 'pong' | 'error'
  sessionId?: string
  payload?: any
}

// 研究会话进度
export interface ResearchProgress {
  stage: string
  progress: number
  logs: Array<{
    timestamp: string
    level: string
    message: string
  }>
}

// WebSocket 配置
interface UseWebSocketOptions {
  onProgress?: (sessionId: string, progress: ResearchProgress) => void
  onComplete?: (sessionId: string, result: any) => void
  onError?: (sessionId: string, error: string) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [subscribedSessions, setSubscribedSessions] = useState<Set<string>>(new Set())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  // 获取 WebSocket URL
  const getWsUrl = useCallback(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
    return apiBase.replace(/^http/, 'ws') + '/ws'
  }, [])

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = getWsUrl()
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[WebSocket] Connected')
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
        options.onConnect?.()

        // 重新订阅之前的会话
        subscribedSessions.forEach(sessionId => {
          ws.send(JSON.stringify({
            type: 'subscribe',
            sessionId
          }))
        })
      }

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected')
        setIsConnected(false)
        options.onDisconnect?.()

        // 自动重连
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }

      wsRef.current = ws
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error)
    }
  }, [getWsUrl, options, subscribedSessions])

  // 处理消息
  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'research_progress':
        if (message.sessionId && message.payload) {
          options.onProgress?.(message.sessionId, message.payload)
        }
        break

      case 'research_complete':
        if (message.sessionId) {
          options.onComplete?.(message.sessionId, message.payload)
          // 自动取消订阅
          unsubscribe(message.sessionId)
        }
        break

      case 'research_error':
        if (message.sessionId) {
          options.onError?.(message.sessionId, message.payload?.error || 'Unknown error')
        }
        break

      case 'pong':
        // 心跳响应
        break

      case 'error':
        console.error('[WebSocket] Server error:', message.payload)
        break
    }
  }, [options])

  // 订阅研究会话
  const subscribe = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Not connected, cannot subscribe')
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'subscribe',
      sessionId
    }))

    setSubscribedSessions(prev => new Set(prev).add(sessionId))
  }, [])

  // 取消订阅
  const unsubscribe = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    wsRef.current.send(JSON.stringify({
      type: 'unsubscribe',
      sessionId
    }))

    setSubscribedSessions(prev => {
      const newSet = new Set(prev)
      newSet.delete(sessionId)
      return newSet
    })
  }, [])

  // 发送心跳
  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }
  }, [])

  // 断开连接
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    setIsConnected(false)
    setSubscribedSessions(new Set())
  }, [])

  // 初始连接
  useEffect(() => {
    connect()

    // 心跳定时器
    const heartbeatInterval = setInterval(sendPing, 30000)

    return () => {
      clearInterval(heartbeatInterval)
      disconnect()
    }
  }, [connect, disconnect, sendPing])

  return {
    isConnected,
    subscribedSessions,
    subscribe,
    unsubscribe,
    connect,
    disconnect
  }
}

export default useWebSocket
