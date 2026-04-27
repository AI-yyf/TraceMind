import { APP_STATE_STORAGE_KEYS, readLocalStorageItem } from './appStateStorage'

export function normalizeApiBase(value: string | undefined) {
  const normalized = (value ?? '').trim().replace(/\/+$/u, '')
  if (!normalized) return ''
  return normalized.replace(/\/api$/iu, '')
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

// 默认用户ID（单用户系统）
const DEFAULT_USER_ID = 'default'

// 获取用户ID（可从localStorage读取，默认使用'default'）
function getUserId(): string {
  const stored = readLocalStorageItem(APP_STATE_STORAGE_KEYS.alphaUserId)
  if (stored && stored.trim()) return stored.trim()
    // localStorage不可用时使用默认值
  return DEFAULT_USER_ID
}

export type ApiSuccessResponse<T> = {
  success: true
  data: T
}

export type ApiErrorResponse = {
  success: false
  error: string
  code?: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

type JsonRecord = Record<string, unknown>

export class ApiError extends Error {
  public readonly statusCode: number
  public readonly errorCode?: string
  public readonly details?: unknown

  constructor(message: string, statusCode: number, errorCode?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.details = details
  }
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isWrappedSuccess<T>(value: unknown): value is ApiSuccessResponse<T> {
  return isRecord(value) && value.success === true && 'data' in value
}

function isWrappedError(value: unknown): value is ApiErrorResponse {
  return isRecord(value) && value.success === false && typeof value.error === 'string'
}

export function getApiBaseUrl() {
  return API_BASE
}

export function buildApiUrl(path: string) {
  const normalizedPath = normalizePath(path)

  if (API_BASE) {
    return `${API_BASE}${normalizedPath}`
  }

  return normalizedPath
}

export function buildWsUrl(path = '/ws') {
  if (API_BASE) {
    return `${API_BASE.replace(/^http/iu, 'ws')}${normalizePath(path)}`
  }

  if (typeof window === 'undefined') {
    return normalizePath(path)
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalizePath(path)}`
}

export function resolveApiAssetUrl(path?: string | null) {
  if (!path) return null
  // Already absolute URL or data URI
  if (/^(https?:|data:)/iu.test(path)) return path
  // Absolute Windows path - invalid for web
  if (/^[a-z]:[\\/]/iu.test(path)) return null

  // Normalize Windows backslashes to forward slashes
  let normalizedPath = path.replace(/\\/gu, '/')

  // Remove leading ./ or / or \
  normalizedPath = normalizedPath.replace(/^\.?[/\\]/u, '')

  // Add /uploads prefix if path starts with images/ (PDF extraction output)
  if (normalizedPath.startsWith('images/')) {
    normalizedPath = `uploads/${normalizedPath}`
  }

  return buildApiUrl(normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`)
}

async function parseErrorResponse(response: Response): Promise<ApiErrorResponse> {
  try {
    const payload = (await response.json()) as unknown

    if (isWrappedError(payload)) {
      return payload
    }

    if (isRecord(payload) && typeof payload.error === 'string') {
      return {
        success: false,
        error: payload.error,
        code: typeof payload.code === 'string' ? payload.code : String(response.status),
        details: payload.details,
      }
    }
  } catch {
    // Fall back to the HTTP status below.
  }

  return {
    success: false,
    error: response.statusText || `Request failed: ${response.status}`,
    code: String(response.status),
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await parseErrorResponse(response)
    throw new ApiError(errorData.error, response.status, errorData.code, errorData.details)
  }

  const payload = (await response.json()) as unknown

  if (isWrappedError(payload)) {
    throw new ApiError(payload.error, response.status, payload.code, payload.details)
  }

  if (isWrappedSuccess<T>(payload)) {
    return payload.data
  }

  return payload as T
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    signal,
    headers: {
      'x-alpha-user-id': getUserId(),
    },
  })
  return handleResponse<T>(response)
}

export async function apiPost<T, B = unknown>(path: string, body: B, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-alpha-user-id': getUserId(),
    },
    body: JSON.stringify(body),
    signal,
  })

  return handleResponse<T>(response)
}

export async function apiGetWithRetry<T>(
  path: string,
  options: { retries?: number; delay?: number } = {},
): Promise<T> {
  const { retries = 3, delay = 1000 } = options
  let lastError: Error | undefined

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await apiGet<T>(path)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
        throw error
      }

      if (attempt === retries - 1) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)))
    }
  }

  throw lastError ?? new Error('Request failed')
}

export async function apiPatch<T, B = unknown>(path: string, body: B): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-alpha-user-id': getUserId(),
    },
    body: JSON.stringify(body),
  })

  return handleResponse<T>(response)
}
