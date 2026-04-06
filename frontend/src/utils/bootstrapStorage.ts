const RESET_MARKER_KEY = 'arxiv-chronicle-storage-reset'
const RESET_MARKER_VALUE = '2026-04-03-initial-state'

const LOCAL_STORAGE_KEYS = [
  'topic-registry',
  'arxiv-chronicle-config',
  'arxiv-chronicle-language-preference',
  'topic-workbench:drawer-open',
  'global-search:recent',
] as const

// Keep topic chat history intact so seeded or previously saved research threads
// survive a fresh browser context and can be reopened from the workbench.
const LOCAL_STORAGE_PREFIXES = ['topic-search:recent:', 'arxiv-tracker:'] as const
const SESSION_STORAGE_KEYS = ['error_reports', 'topic-context-queue'] as const

function shouldRemoveLocalStorageKey(key: string) {
  return (
    LOCAL_STORAGE_KEYS.includes(key as (typeof LOCAL_STORAGE_KEYS)[number]) ||
    LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

export function resetPersistedAppStateOnce() {
  if (typeof window === 'undefined') return

  try {
    if (window.localStorage.getItem(RESET_MARKER_KEY) === RESET_MARKER_VALUE) {
      return
    }

    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key && shouldRemoveLocalStorageKey(key)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
    SESSION_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key))
  } catch {
    // Ignore storage reset failures and continue booting.
  } finally {
    try {
      window.localStorage.setItem(RESET_MARKER_KEY, RESET_MARKER_VALUE)
    } catch {
      // Ignore marker persistence failures.
    }
  }
}
