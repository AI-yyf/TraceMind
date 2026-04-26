const RECENT_SEARCH_LIMIT = 8

export const LEGACY_APP_STATE_STORAGE_KEYS = {
  topicRegistry: 'topic-registry',
  workbenchDrawer: 'topic-workbench:drawer-open',
} as const

export const APP_STATE_STORAGE_KEYS = {
  config: 'arxiv-chronicle-config',
  languagePreference: 'arxiv-chronicle-language-preference',
  languageSwitchExpanded: 'arxiv-chronicle-language-switch-expanded',
  globalSearchRecent: 'global-search:recent',
  readingWorkspace: 'reading-workspace:v1',
  errorReports: 'error_reports',
  topicContextQueue: 'topic-context-queue',
  favoriteExcerpts: 'favorite-excerpts',
  alphaUserId: 'alpha-user-id',
  trackerPrefix: 'arxiv-tracker:',
  topicChatPrefix: 'topic-chat:',
  topicSearchRecentPrefix: 'topic-search:recent:',
} as const

export const BOOTSTRAP_LOCAL_STORAGE_KEYS = [
  LEGACY_APP_STATE_STORAGE_KEYS.topicRegistry,
  APP_STATE_STORAGE_KEYS.config,
  APP_STATE_STORAGE_KEYS.languagePreference,
  LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer,
  APP_STATE_STORAGE_KEYS.globalSearchRecent,
] as const

export const BOOTSTRAP_LOCAL_STORAGE_PREFIXES = [
  APP_STATE_STORAGE_KEYS.topicSearchRecentPrefix,
  APP_STATE_STORAGE_KEYS.trackerPrefix,
] as const

export const BOOTSTRAP_SESSION_STORAGE_KEYS = [
  APP_STATE_STORAGE_KEYS.readingWorkspace,
  APP_STATE_STORAGE_KEYS.errorReports,
  APP_STATE_STORAGE_KEYS.topicContextQueue,
] as const

export const LANGUAGE_RESET_LOCAL_STORAGE_KEYS = [
  LEGACY_APP_STATE_STORAGE_KEYS.topicRegistry,
  APP_STATE_STORAGE_KEYS.globalSearchRecent,
  LEGACY_APP_STATE_STORAGE_KEYS.workbenchDrawer,
] as const

export const LANGUAGE_RESET_LOCAL_STORAGE_PREFIXES = [
  APP_STATE_STORAGE_KEYS.topicChatPrefix,
  APP_STATE_STORAGE_KEYS.topicSearchRecentPrefix,
  APP_STATE_STORAGE_KEYS.trackerPrefix,
] as const

const LANGUAGE_PERSISTED_LOCAL_STORAGE_KEYS = [
  APP_STATE_STORAGE_KEYS.favoriteExcerpts,
  getTrackerStorageKey(APP_STATE_STORAGE_KEYS.favoriteExcerpts),
] as const

export const LANGUAGE_RESET_SESSION_STORAGE_KEYS = [
  APP_STATE_STORAGE_KEYS.readingWorkspace,
  APP_STATE_STORAGE_KEYS.errorReports,
  APP_STATE_STORAGE_KEYS.topicContextQueue,
] as const

function normalizeRecentSearchTerms(input: unknown, limit = RECENT_SEARCH_LIMIT) {
  if (!Array.isArray(input)) return [] as string[]

  return Array.from(
    new Set(
      input
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)
}

function safeParseJson<T>(value: string | null) {
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function getTopicChatStorageKey(topicId: string) {
  return `${APP_STATE_STORAGE_KEYS.topicChatPrefix}${topicId}`
}

export function getTopicSearchRecentStorageKey(topicId: string) {
  return `${APP_STATE_STORAGE_KEYS.topicSearchRecentPrefix}${topicId}`
}

export function getTrackerStorageKey(key: string) {
  return `${APP_STATE_STORAGE_KEYS.trackerPrefix}${key}`
}

export function readLocalStorageItem(key: string) {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readLocalStorageJson<T>(key: string) {
  return safeParseJson<T>(readLocalStorageItem(key))
}

export function writeLocalStorageItem(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage write failures so the UI can continue running.
  }
}

export function writeLocalStorageJson(key: string, value: unknown) {
  writeLocalStorageItem(key, JSON.stringify(value))
}

export function removeLocalStorageItem(key: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage remove failures so the UI can continue running.
  }
}

export function listLocalStorageKeys() {
  if (typeof window === 'undefined') return [] as string[]

  try {
    const keys: string[] = []

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key) keys.push(key)
    }

    return keys
  } catch {
    return [] as string[]
  }
}

export function removeLocalStorageItems(keys: Iterable<string>) {
  for (const key of keys) {
    removeLocalStorageItem(key)
  }
}

export function readSessionStorageItem(key: string) {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function readSessionStorageJson<T>(key: string) {
  return safeParseJson<T>(readSessionStorageItem(key))
}

export function writeSessionStorageItem(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Ignore storage write failures so the UI can continue running.
  }
}

export function writeSessionStorageJson(key: string, value: unknown) {
  writeSessionStorageItem(key, JSON.stringify(value))
}

export function removeSessionStorageItem(key: string) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // Ignore storage remove failures so the UI can continue running.
  }
}

export function removeSessionStorageItems(keys: Iterable<string>) {
  for (const key of keys) {
    removeSessionStorageItem(key)
  }
}

export function readBooleanLocalStorageItem(key: string, fallback = false) {
  const parsed = readLocalStorageJson<unknown>(key)
  return typeof parsed === 'boolean' ? parsed : fallback
}

export function readRecentSearchTerms(key: string, limit = RECENT_SEARCH_LIMIT) {
  return normalizeRecentSearchTerms(readLocalStorageJson<unknown>(key), limit)
}

export function rememberRecentSearchTerm(
  key: string,
  query: string,
  current: string[],
  limit = RECENT_SEARCH_LIMIT,
) {
  const trimmed = query.trim()
  if (trimmed.length < 2) return current

  const next = normalizeRecentSearchTerms([trimmed, ...current], limit)
  writeLocalStorageJson(key, next)
  return next
}

export function shouldRemoveBootstrapLocalStorageKey(key: string) {
  return (
    BOOTSTRAP_LOCAL_STORAGE_KEYS.includes(key as (typeof BOOTSTRAP_LOCAL_STORAGE_KEYS)[number]) ||
    BOOTSTRAP_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

export function shouldRemoveLanguageSensitiveLocalStorageKey(key: string) {
  if (
    LANGUAGE_PERSISTED_LOCAL_STORAGE_KEYS.includes(
      key as (typeof LANGUAGE_PERSISTED_LOCAL_STORAGE_KEYS)[number],
    )
  ) {
    return false
  }

  return (
    LANGUAGE_RESET_LOCAL_STORAGE_KEYS.includes(
      key as (typeof LANGUAGE_RESET_LOCAL_STORAGE_KEYS)[number],
    ) || LANGUAGE_RESET_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}
