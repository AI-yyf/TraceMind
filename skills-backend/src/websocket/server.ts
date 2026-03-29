import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { logger } from '../utils/logger'

// 客户端连接类型
interface ClientConnection {
  ws: WebSocket
  userId?: string
  subscriptions: Set<string>
}

// 消息类型
interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'research_progress' | 'research_complete' | 'error'
  payload?: any
  sessionId?: string
}

// 全局客户端管理
const clients = new Map<WebSocket, ClientConnection>()

/**
 * 初始化 WebSocket 服务器
 */
export function initializeWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  })

  wss.on('connection', (ws: WebSocket) => {
    logger.info('WebSocket client connected')
    
    // 初始化客户端连接
    const client: ClientConnection = {
      ws,
      subscriptions: new Set()
    }
    clients.set(ws, client)

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      payload: { message: 'Connected to research tracker websocket' }
    }))

    // 处理消息
    ws.on('message', (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString())
        handleMessage(ws, message)
      } catch (error) {
        logger.error('Invalid WebSocket message', { error, data: data.toString() })
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' }
        }))
      }
    })

    // 处理断开连接
    ws.on('close', () => {
      logger.info('WebSocket client disconnected')
      clients.delete(ws)
    })

    // 处理错误
    ws.on('error', (error) => {
      logger.error('WebSocket error', { error })
    })
  })

  logger.info('WebSocket server initialized')
  return wss
}

/**
 * 处理客户端消息
 */
function handleMessage(ws: WebSocket, message: WSMessage) {
  const client = clients.get(ws)
  if (!client) return

  switch (message.type) {
    case 'subscribe':
      // 订阅研究会话
      if (message.sessionId) {
        client.subscriptions.add(message.sessionId)
        ws.send(JSON.stringify({
          type: 'subscribed',
          payload: { sessionId: message.sessionId }
        }))
        logger.info('Client subscribed to session', { sessionId: message.sessionId })
      }
      break

    case 'unsubscribe':
      // 取消订阅
      if (message.sessionId) {
        client.subscriptions.delete(message.sessionId)
        ws.send(JSON.stringify({
          type: 'unsubscribed',
          payload: { sessionId: message.sessionId }
        }))
      }
      break

    case 'ping':
      // 心跳响应
      ws.send(JSON.stringify({ type: 'pong' }))
      break

    default:
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message: `Unknown message type: ${message.type}` }
      }))
  }
}

/**
 * 广播研究会话进度
 */
export function broadcastResearchProgress(sessionId: string, progress: any) {
  const message = JSON.stringify({
    type: 'research_progress',
    sessionId,
    payload: progress
  })

  let sentCount = 0
  clients.forEach((client) => {
    if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
      sentCount++
    }
  })

  logger.debug('Broadcast research progress', { sessionId, sentCount, progress })
}

/**
 * 广播研究会话完成
 */
export function broadcastResearchComplete(sessionId: string, result: any) {
  const message = JSON.stringify({
    type: 'research_complete',
    sessionId,
    payload: result
  })

  let sentCount = 0
  clients.forEach((client) => {
    if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
      sentCount++
    }
  })

  logger.info('Broadcast research complete', { sessionId, sentCount })
}

/**
 * 广播研究会话错误
 */
export function broadcastResearchError(sessionId: string, error: string) {
  const message = JSON.stringify({
    type: 'research_error',
    sessionId,
    payload: { error }
  })

  clients.forEach((client) => {
    if (client.subscriptions.has(sessionId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
    }
  })

  logger.error('Broadcast research error', { sessionId, error })
}

/**
 * 获取连接的客户端数量
 */
export function getConnectedClientCount(): number {
  return clients.size
}
