import {
  BOOTSTRAP_SESSION_STORAGE_KEYS,
  LANGUAGE_RESET_SESSION_STORAGE_KEYS,
  listLocalStorageKeys,
  readLocalStorageItem,
  removeLocalStorageItems,
  removeSessionStorageItems,
  shouldRemoveBootstrapLocalStorageKey,
  shouldRemoveLanguageSensitiveLocalStorageKey,
  writeLocalStorageItem,
} from './appStateStorage'

const RESET_MARKER_KEY = 'tracemind-storage-reset'
const RESET_MARKER_VALUE = '2026-04-15-managed-app-state'

export function resetPersistedAppStateOnce() {
  if (typeof window === 'undefined') return

  try {
    if (readLocalStorageItem(RESET_MARKER_KEY) === RESET_MARKER_VALUE) {
      return
    }

    const keysToRemove = listLocalStorageKeys().filter((key) =>
      shouldRemoveBootstrapLocalStorageKey(key),
    )

    removeLocalStorageItems(keysToRemove)
    removeSessionStorageItems(BOOTSTRAP_SESSION_STORAGE_KEYS)
  } catch {
    // Ignore storage reset failures and continue booting.
  } finally {
    writeLocalStorageItem(RESET_MARKER_KEY, RESET_MARKER_VALUE)
  }
}

export function clearLanguageSensitiveAppState() {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove = listLocalStorageKeys().filter((key) =>
      shouldRemoveLanguageSensitiveLocalStorageKey(key),
    )

    removeLocalStorageItems(keysToRemove)
    removeSessionStorageItems(LANGUAGE_RESET_SESSION_STORAGE_KEYS)
  } catch {
    // Ignore language reset failures so language switching still completes.
  }
}
