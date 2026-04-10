import { createClient, RedisClientType } from 'redis'
import { logger } from '../utils/logger'

/**
 * Redis client configuration
 */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false' // Default enabled

/**
 * In-memory fallback storage when Redis is unavailable
 */
class InMemoryStore {
  private store: Map<string, { data: string; expiresAt?: number }> = new Map()
  
  async set(key: string, value: string, options?: { EX?: number }): Promise<void> {
    const entry: { data: string; expiresAt?: number } = { data: value }
    if (options?.EX) {
      entry.expiresAt = Date.now() + options.EX * 1000
    }
    this.store.set(key, entry)
  }
  
  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    
    // Check TTL
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    
    return entry.data
  }
  
  async del(key: string): Promise<void> {
    this.store.delete(key)
  }
  
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    const now = Date.now()
    
    const result: string[] = []
    const entries = Array.from(this.store.entries())
    for (const [key, entry] of entries) {
      // Skip expired entries
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key)
        continue
      }
      if (regex.test(key)) {
        result.push(key)
      }
    }
    return result
  }
}

/**
 * Redis client singleton
 */
let redisClient: RedisClientType | null = null
let inMemoryStore: InMemoryStore | null = null
let isConnected = false
let connectionAttempted = false

/**
 * Initialize Redis client with fallback to in-memory storage
 */
async function initializeClient(): Promise<void> {
  if (connectionAttempted) return
  connectionAttempted = true
  
  if (!REDIS_ENABLED) {
    logger.info('Redis is disabled via REDIS_ENABLED=false, using in-memory store')
    inMemoryStore = new InMemoryStore()
    return
  }
  
  try {
    redisClient = createClient({
      url: REDIS_URL,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis reconnection attempts exceeded, falling back to in-memory store')
            return new Error('Redis connection failed')
          }
          // Exponential backoff: 100ms, 200ms, 400ms
          return Math.min(retries * 100, 400)
        }
      }
    }) as RedisClientType
    
    redisClient.on('connect', () => {
      logger.info('Redis client connected', { url: REDIS_URL.replace(/:[^:@]+@/, ':****@') })
      isConnected = true
    })
    
    redisClient.on('disconnect', () => {
      logger.warn('Redis client disconnected')
      isConnected = false
    })
    
    redisClient.on('error', (err) => {
      logger.error('Redis client error', { error: err.message })
      isConnected = false
    })
    
    await redisClient.connect()
    isConnected = true
    logger.info('Redis client initialized successfully')
  } catch (error) {
    const err = error as Error
    logger.warn('Redis connection failed, using in-memory fallback', { 
      error: err.message,
      url: REDIS_URL.replace(/:[^:@]+@/, ':****@')
    })
    redisClient = null
    isConnected = false
    inMemoryStore = new InMemoryStore()
  }
}

/**
 * Get Redis client (initializes on first call)
 */
async function getClient(): Promise<RedisClientType | InMemoryStore> {
  if (!connectionAttempted) {
    await initializeClient()
  }
  
  if (redisClient && isConnected) {
    return redisClient
  }
  
  if (!inMemoryStore) {
    inMemoryStore = new InMemoryStore()
  }
  
  return inMemoryStore
}

// ============================================================================
// Session Storage Helper Functions
// ============================================================================

/**
 * Session data type
 */
export interface SessionData {
  [key: string]: unknown
}

/**
 * Set session data with optional TTL
 * @param key - Session key
 * @param data - Session data object
 * @param ttlSeconds - Time-to-live in seconds (optional)
 */
export async function setSession(
  key: string, 
  data: SessionData, 
  ttlSeconds?: number
): Promise<void> {
  const client = await getClient()
  const value = JSON.stringify(data)
  
  if (client instanceof InMemoryStore) {
    await client.set(key, value, ttlSeconds ? { EX: ttlSeconds } : undefined)
  } else {
    if (ttlSeconds) {
      await client.set(key, value, { EX: ttlSeconds })
    } else {
      await client.set(key, value)
    }
  }
}

/**
 * Get session data
 * @param key - Session key
 * @returns Session data or null if not found
 */
export async function getSession<T extends SessionData = SessionData>(
  key: string
): Promise<T | null> {
  const client = await getClient()
  const value = await client.get(key)
  
  if (!value) return null
  
  try {
    return JSON.parse(value) as T
  } catch {
    logger.error('Failed to parse session data', { key })
    return null
  }
}

/**
 * Delete a session
 * @param key - Session key
 */
export async function deleteSession(key: string): Promise<void> {
  const client = await getClient()
  await client.del(key)
}

/**
 * Get all sessions matching a pattern
 * @param pattern - Key pattern (e.g., "session:*")
 * @returns Map of key to session data
 */
export async function getAllSessions<T extends SessionData = SessionData>(
  pattern: string
): Promise<Map<string, T>> {
  const client = await getClient()
  const keys = await client.keys(pattern)
  const sessions = new Map<string, T>()
  
  for (const key of keys) {
    const data = await getSession<T>(key)
    if (data) {
      sessions.set(key, data)
    }
  }
  
  return sessions
}

// ============================================================================
// Health Check & Management Functions
// ============================================================================

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null
}

/**
 * Check if using in-memory fallback
 */
export function isInMemoryFallback(): boolean {
  return inMemoryStore !== null && !isConnected
}

/**
 * Get Redis connection status info
 */
export function getRedisStatus(): {
  type: 'redis' | 'memory'
  connected: boolean
  url?: string
} {
  if (isRedisConnected()) {
    return {
      type: 'redis',
      connected: true,
      url: REDIS_URL.replace(/:[^:@]+@/, ':****@')
    }
  }
  
  return {
    type: 'memory',
    connected: true
  }
}

/**
 * Disconnect Redis client (for graceful shutdown)
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit()
      logger.info('Redis client disconnected gracefully')
    } catch (error) {
      const err = error as Error
      logger.error('Error disconnecting Redis client', { error: err.message })
    }
  }
  isConnected = false
}

/**
 * Clear all sessions (use with caution!)
 */
export async function clearAllSessions(pattern: string = '*'): Promise<number> {
  const client = await getClient()
  const keys = await client.keys(pattern)
  
  for (const key of keys) {
    await client.del(key)
  }
  
  return keys.length
}

// Initialize on module load (non-blocking)
initializeClient().catch((err) => {
  logger.warn('Redis initialization failed on startup', { error: err.message })
})